const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

//Ruta del video que quieres probar
const VIDEO_PATH = 'C:/videoPrueba.mp4';

async function testVideoUpload() {
    try {
        // Validar que el archivo existe
        if (!fs.existsSync(VIDEO_PATH)) {
            console.error(`El archivo no existe en: ${VIDEO_PATH}`);
            return;
        }

        console.log(`Probando carga de video desde: ${VIDEO_PATH}`);
        
        // Crear FormData
        const form = new FormData();
        form.append('video', fs.createReadStream(VIDEO_PATH));

        // Hacer la petición
        const response = await axios.post(
            'http://localhost:3000/usuario/api/cargar-video',
            form,
            {
                headers: form.getHeaders(),
                timeout: 30000
            }
        );

        console.log('Carga exitosa');
        console.log('Respuesta:', response.data);
        console.log('URL del video:', response.data.url);
        
    } catch (error) {
        console.error('Error en la carga:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Datos:', error.response.data);
        } else if (error.code === 'ECONNREFUSED') {
            console.error('No se puede conectar a localhost:3000');
            console.error('Asegúrate de que el servidor está corriendo (npm start)');
        } else {
            console.error('Error:', error.message);
        }
    }
}

testVideoUpload();