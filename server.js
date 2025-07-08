const express = require('express');
const multer = require('multer');
const fs = require('fs').promises; // Keep fs for file operations (unlink)
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg'); // Import Pool from pg

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL Pool configuration
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Render's PostgreSQL connections
    }
});

// Function to initialize the database table
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reparaciones (
                id BIGSERIAL PRIMARY KEY,
                descripcion TEXT NOT NULL,
                ubicacion TEXT,
                fotoAntes TEXT NOT NULL,
                fotoDespues TEXT NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('Tabla reparaciones verificada/creada en PostgreSQL.');
    } catch (err) {
        console.error('Error al inicializar la base de datos:', err);
        process.exit(1); // Exit if database connection/table creation fails
    }
}

// Call initializeDatabase before starting the server
initializeDatabase();

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Servir archivos estáticos desde la carpeta 'public'
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Servir las imágenes subidas

// --- Configuración de Multer para subida de archivos ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Carpeta donde se guardarán las imágenes
    },
    filename: function (req, file, cb) {
        // Crear un nombre de archivo único con la fecha para evitar sobreescrituras
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage, fileFilter: fileFilter });

// Filtro para aceptar solo imágenes
function fileFilter(req, file, cb) {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
        return cb(null, true);
    }
    cb(new Error('Solo se permiten imágenes (jpeg, jpg, png).'));
}

const { Parser } = require('json2csv');

// --- Rutas de la API ---

// Ruta para subir una nueva reparación
app.post('/upload', upload.fields([{ name: 'fotoAntes', maxCount: 1 }, { name: 'fotoDespues', maxCount: 1 }]), async (req, res) => {
    const { descripcion, ubicacion } = req.body;
    const fotoAntes = req.files['fotoAntes'] && req.files['fotoAntes'][0];
    const fotoDespues = req.files['fotoDespues'] && req.files['fotoDespues'][0];

    if (!descripcion || !fotoAntes || !fotoDespues) {
        if (fotoAntes) await fs.unlink(fotoAntes.path).catch(err => console.error("Error al limpiar fotoAntes:", err));
        if (fotoDespues) await fs.unlink(fotoDespues.path).catch(err => console.error("Error al limpiar fotoDespues:", err));
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO reparaciones(descripcion, ubicacion, fotoAntes, fotoDespues) VALUES($1, $2, $3, $4) RETURNING *;',
            [descripcion, ubicacion || 'No especificada', fotoAntes.filename, fotoDespues.filename]
        );
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error(`[SERVER] Error en la ruta /upload: ${error.message}`);
        if (fotoAntes) await fs.unlink(fotoAntes.path).catch(err => console.error("Error al limpiar fotoAntes:", err));
        if (fotoDespues) await fs.unlink(fotoDespues.path).catch(err => console.error("Error al limpiar fotoDespues:", err));
        res.status(500).json({ message: 'Error en el servidor al guardar la reparación.' });
    }
});

// Ruta para obtener todas las reparaciones
app.get('/reparaciones', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM reparaciones ORDER BY timestamp DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener reparaciones:', err);
        res.status(500).json({ message: 'Error al leer las reparaciones.' });
    }
});

// Ruta para descargar el reporte en CSV
app.get('/download-csv', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM reparaciones ORDER BY timestamp DESC');
        let reparaciones = result.rows;

        if (reparaciones.length === 0) {
            return res.status(404).send('No hay datos para exportar.');
        }

        const fields = [
            { label: 'Fecha y Hora', value: 'timestamp' },
            { label: 'Descripción', value: 'descripcion' },
            { label: 'Ubicación', value: 'ubicacion' },
            { label: 'Archivo Foto Antes', value: 'fotoAntes' },
            { label: 'Archivo Foto Después', value: 'fotoDespues' },
            { label: 'ID Único', value: 'id' }
        ];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(reparaciones);

        res.header('Content-Type', 'text/csv');
        res.attachment(`reporte-reparaciones-${Date.now()}.csv`);
        res.send(csv);
    } catch (err) {
        console.error('Error al generar CSV:', err);
        res.status(500).send('Error en el servidor durante la exportación CSV.');
    }
});

// Ruta para eliminar una reparación por ID
app.delete('/reparaciones/:id', async (req, res) => {
    const reparacionId = parseInt(req.params.id);
    console.log(`[SERVER] Petición DELETE recibida para ID: ${reparacionId}`);

    try {
        // 1. Obtener la información de la reparación para eliminar los archivos de imagen
        const result = await pool.query('SELECT fotoAntes, fotoDespues FROM reparaciones WHERE id = $1', [reparacionId]);
        const reparacionEliminada = result.rows[0];

        if (!reparacionEliminada) {
            console.warn(`[SERVER] Reparación con ID ${reparacionId} no encontrada.`);
            return res.status(404).json({ message: 'Reparación no encontrada.' });
        }

        // 2. Eliminar los archivos de imagen asociados
        const fotoAntesPath = path.join(__dirname, 'uploads', reparacionEliminada.fotoAntes);
        const fotoDespuesPath = path.join(__dirname, 'uploads', reparacionEliminada.fotoDespues);

        console.log(`[SERVER] Intentando eliminar archivos: ${fotoAntesPath}, ${fotoDespuesPath}`);

        await fs.unlink(fotoAntesPath).catch(err => console.error(`Error al eliminar fotoAntes (${fotoAntesPath}):`, err));
        console.log(`[SERVER] Foto Antes eliminada: ${fotoAntesPath}`);
        await fs.unlink(fotoDespuesPath).catch(err => console.error(`Error al eliminar fotoDespues (${fotoDespuesPath}):`, err));
        console.log(`[SERVER] Foto Después eliminada: ${fotoDespuesPath}`);

        // 3. Eliminar la entrada de la base de datos
        const deleteResult = await pool.query('DELETE FROM reparaciones WHERE id = $1', [reparacionId]);

        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ message: 'Reparación no encontrada en la base de datos.' });
        }

        console.log(`[SERVER] Reparación con ID ${reparacionId} eliminada con éxito de la base de datos.`);
        res.status(200).json({ message: 'Reparación eliminada con éxito.' });
    } catch (err) {
        console.error(`[SERVER] Error en la operación de eliminación: ${err.message}`);
        res.status(500).json({ message: 'Error en el servidor durante la eliminación.' });
    }
});

app.use((err, req, res, next) => {
    console.error("\n--- ERROR GLOBAL DETECTADO ---");
    console.error("Fecha:", new Date().toISOString());
    console.error("Ruta:", req.originalUrl);
    console.error("Método:", req.method);
    console.error("Error:", err.message);
    console.error("Stack Trace:", err.stack);
    console.error("--- FIN DEL REPORTE DE ERROR ---\n");

    // Asegurarse de que no se envíe una respuesta si ya se ha enviado una
    if (!res.headersSent) {
        res.status(500).json({ 
            message: '¡Algo salió muy mal en el servidor! Revisa la terminal para más detalles.',
            error: err.message // Envía el mensaje de error al cliente en el modo de desarrollo
        });
    }
});

// --- Iniciar el servidor ---
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    console.log('La aplicación de reparaciones está lista para usarse.');
    console.log('Para acceder desde otro dispositivo en la misma red (como un teléfono), usa la IP local de esta máquina.');
    console.log('Ejemplo: http://192.168.1.100:3000');
});