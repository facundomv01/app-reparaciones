# Aplicación de Registro de Reparaciones

Esta es una aplicación web sencilla pero funcional para llevar un registro visual de reparaciones. Permite a los usuarios documentar cada trabajo con una descripción y fotografías del "antes" y el "después".

## ✨ Funcionalidades Principales

- **Registro de Reparaciones**: Añade nuevas reparaciones con una descripción detallada y sube dos imágenes: una mostrando el estado previo y otra el estado posterior al trabajo.
- **Historial Visual**: Visualiza todas las reparaciones en una galería tipo cuadrícula, ordenada cronológicamente (de la más reciente a la más antigua).
- **Galería de Imágenes**: Haz clic en las imágenes de cualquier reparación para verlas en tamaño completo con una galería interactiva (lightbox).
- **Búsqueda y Filtrado**:
    - Busca reparaciones específicas por palabras clave en su descripción.
    - Filtra el historial por un rango de fechas.
- **Eliminación Segura**: Borra registros de reparaciones (con una confirmación para evitar accidentes). Las imágenes asociadas en el servidor también se eliminan.
- **Exportación de Datos**: Descarga un informe completo de todas las reparaciones en formato CSV con un solo clic.

## 🛠️ Stack Tecnológico

- **Frontend**: HTML5, CSS3 (Bootstrap 5 para el diseño responsivo), JavaScript (Vanilla JS).
- **Backend**: Node.js con Express.
- **Base de Datos**: Un archivo plano `db.json` actúa como una base de datos simple para persistir los registros.
- **Dependencias Clave**:
    - `express`: Framework para el servidor web.
    - `multer`: Middleware para la gestión de subida de archivos (imágenes).
    - `json2csv`: Para la conversión de datos JSON a formato CSV.
    - `cors`: Para habilitar la política de Cross-Origin Resource Sharing.

## 🚀 Cómo Ejecutar el Proyecto Localmente

Sigue estos pasos para poner en marcha la aplicación en tu máquina local.

### **Prerrequisitos**

- Tener instalado [Node.js](https://nodejs.org/) (versión 18.0.0 o superior).
- `npm` (normalmente se instala junto con Node.js).

### **Instalación**

1.  **Clona el repositorio** (o descarga los archivos en una carpeta):
    ```bash
    git clone https://github.com/tu-usuario/tu-repositorio.git
    cd tu-repositorio
    ```

2.  **Instala las dependencias** del proyecto:
    ```bash
    npm install
    ```

3.  **Inicia el servidor**:
    ```bash
    npm start
    ```

4.  **Abre la aplicación**:
    Abre tu navegador web y ve a `http://localhost:3000`. ¡Listo!

## ☁️ Despliegue

Este proyecto está listo para ser desplegado en plataformas como **Render**, Heroku o Vercel.

### **Consideraciones para el Despliegue**

- **Comando de Inicio**: El `package.json` ya incluye el script `npm start`, que es el estándar que buscan estas plataformas.
- **Sistema de Archivos**: La mayoría de los servicios de despliegue gratuitos tienen sistemas de archivos **efímeros**. Esto significa que los archivos subidos (las imágenes en la carpeta `/uploads`) **se perderán** cada vez que el servicio se reinicie.
- **Solución para Producción**: Para un despliegue robusto, las imágenes deberían ser almacenadas en un servicio de almacenamiento de objetos como **Amazon S3**, **Google Cloud Storage** o **Cloudinary**. Esto requeriría modificar la lógica de subida y eliminación de archivos en `server.js` para que interactúe con la API del servicio elegido en lugar del sistema de archivos local.

## 📝 API Endpoints

La aplicación expone las siguientes rutas:

- `POST /upload`: Recibe los datos de una nueva reparación (descripción y archivos de imagen).
- `GET /reparaciones`: Devuelve un JSON con la lista de todas las reparaciones.
- `DELETE /reparaciones/:id`: Elimina una reparación específica por su ID.
- `GET /download-csv`: Inicia la descarga del historial de reparaciones en formato CSV.
