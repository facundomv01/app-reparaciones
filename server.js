const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

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
app.post('/upload', upload.fields([{ name: 'fotoAntes', maxCount: 1 }, { name: 'fotoDespues', maxCount: 1 }]), (req, res) => {
    const { descripcion } = req.body;
    const fotoAntes = req.files['fotoAntes'] && req.files['fotoAntes'][0];
    const fotoDespues = req.files['fotoDespues'] && req.files['fotoDespues'][0];

    if (!descripcion || !fotoAntes || !fotoDespues) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }

    fs.readFile(DB_PATH, 'utf8', (err, data) => {
        if (err && err.code !== 'ENOENT') {
            return res.status(500).json({ message: 'Error al leer la base de datos.' });
        }
        const reparaciones = data ? JSON.parse(data) : [];
        const nuevaReparacion = {
            id: Date.now(),
            descripcion: descripcion,
            fotoAntes: fotoAntes.filename,
            fotoDespues: fotoDespues.filename,
            timestamp: new Date().toISOString()
        };
        reparaciones.push(nuevaReparacion);
        fs.writeFile(DB_PATH, JSON.stringify(reparaciones, null, 2), (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error al guardar en la base de datos.' });
            }
            res.status(201).json(nuevaReparacion);
        });
    });
});

// Ruta para obtener todas las reparaciones
app.get('/reparaciones', (req, res) => {
    fs.readFile(DB_PATH, 'utf8', (err, data) => {
        if (err) {
            return err.code === 'ENOENT' ? res.json([]) : res.status(500).json({ message: 'Error al leer las reparaciones.' });
        }
        res.json(JSON.parse(data));
    });
});

// Ruta para descargar el reporte en CSV
app.get('/download-csv', (req, res) => {
    fs.readFile(DB_PATH, 'utf8', (err, data) => {
        if (err) {
            return err.code === 'ENOENT' ? res.status(404).send('No hay datos para exportar.') : res.status(500).send('Error al leer la base de datos.');
        }
        
        let reparaciones = JSON.parse(data);
        if (reparaciones.length === 0) {
            return res.status(404).send('No hay datos para exportar.');
        }

        const fields = [
            { label: 'Fecha y Hora', value: 'timestamp' },
            { label: 'Descripción', value: 'descripcion' },
            { label: 'Archivo Foto Antes', value: 'fotoAntes' },
            { label: 'Archivo Foto Después', value: 'fotoDespues' },
            { label: 'ID Único', value: 'id' }
        ];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(reparaciones);

        res.header('Content-Type', 'text/csv');
        res.attachment(`reporte-reparaciones-${Date.now()}.csv`);
        res.send(csv);
    });
});

// Ruta para eliminar una reparación por ID
app.delete('/reparaciones/:id', async (req, res) => {
    const reparacionId = parseInt(req.params.id);
    console.log(`[SERVER] Petición DELETE recibida para ID: ${reparacionId}`);

    try {
        let data = await fs.readFile(DB_PATH, 'utf8');
        let reparaciones = JSON.parse(data);
        console.log(`[SERVER] Reparaciones antes de eliminar (${reparaciones.length} items):`, reparaciones.map(r => r.id));

        const indexToDelete = reparaciones.findIndex(rep => rep.id === reparacionId);

        if (indexToDelete === -1) {
            console.warn(`[SERVER] Reparación con ID ${reparacionId} no encontrada.`);
            return res.status(404).json({ message: 'Reparación no encontrada.' });
        }

        const reparacionEliminada = reparaciones[indexToDelete];
        console.log(`[SERVER] Encontrada reparación para eliminar:`, reparacionEliminada.id);

        // 1. Eliminar los archivos de imagen asociados
        const fotoAntesPath = path.join(__dirname, 'uploads', reparacionEliminada.fotoAntes);
        const fotoDespuesPath = path.join(__dirname, 'uploads', reparacionEliminada.fotoDespues);

        console.log(`[SERVER] Intentando eliminar archivos: ${fotoAntesPath}, ${fotoDespuesPath}`);

        await fs.unlink(fotoAntesPath);
        console.log(`[SERVER] Foto Antes eliminada: ${fotoAntesPath}`);
        await fs.unlink(fotoDespuesPath);
        console.log(`[SERVER] Foto Después eliminada: ${fotoDespuesPath}`);

        // 2. Eliminar la entrada de la base de datos
        reparaciones.splice(indexToDelete, 1);
        console.log(`[SERVER] Reparaciones después de eliminar (${reparaciones.length} items):`, reparaciones.map(r => r.id));

        await fs.writeFile(DB_PATH, JSON.stringify(reparaciones, null, 2));
        console.log(`[SERVER] db.json actualizado con éxito.`);
        res.status(200).json({ message: 'Reparación eliminada con éxito.' });
    } catch (err) {
        console.error(`[SERVER] Error en la operación de eliminación: ${err.message}`);
        if (err.code === 'ENOENT') {
            return res.status(404).json({ message: 'No hay reparaciones para eliminar o archivo no encontrado.' });
        }
        res.status(500).json({ message: 'Error en el servidor durante la eliminación.' });
    }
});

// --- Iniciar el servidor ---
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    console.log('La aplicación de reparaciones está lista para usarse.');
    console.log('Para acceder desde otro dispositivo en la misma red (como un teléfono), usa la IP local de esta máquina.');
    console.log('Ejemplo: http://192.168.1.100:3000');
});