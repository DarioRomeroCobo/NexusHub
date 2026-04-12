/*const path = require('path');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../utils/middleware-bd');
const pool = require('../connection');
const routerUsuarios = require('../routers/router_usuario');

// 1. MOCK DE AZURE: Evitamos subir archivos reales a la nube durante el test
jest.mock('../utils/azure-blob', () => {
    return jest.fn().mockImplementation(() => {
        return {
            uploadBlob: jest.fn().mockResolvedValue({ success: true }),
            getBlobUrl: jest.fn().mockReturnValue('https://mockazure.com/video_test.mp4'),
            deleteBlob: jest.fn().mockResolvedValue({ success: true })
        };
    });
});

describe('Integración NH-72: Flujo de Subida de Vídeos', () => {
    let app;
    const correosCreados = new Set();

    jest.setTimeout(30000);

    const generarCorreoUnico = () => `test_video_${Date.now()}@nexushub.test`;

    // Función auxiliar para crear usuario y loguearlo en el test
    const prepararSesion = async (agent, correo) => {
        const pass = 'Valida@123';
        const hash = await bcrypt.hash(pass, 10);
        // Insertamos usuario directamente en la BD de pruebas
        await db.query('INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)', [correo, hash]);
        correosCreados.add(correo);
        
        // Login para obtener la cookie de sesión
        await agent.post('/usuario/api/login').send({ correo, password: pass });
    };

    beforeAll(() => {
        app = express();
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '..', 'views'));
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        
        // Configuración de sesión idéntica a tu app.js
        app.use(session({
            secret: "inicio_sesion_es_seguro",
            resave: false,
            saveUninitialized: false
        }));

        // Middleware de locals (extraído de tu app.js)
        app.use((req, res, next) => {
            res.locals.user = req.session.usuarioId || null;
            res.locals.isLoggedIn = req.session.isLoggedIn || false;
            next();
        });

        app.use('/usuario', routerUsuarios);
    });

    afterEach(async () => {
        // Limpiamos la BD después de cada test para no dejar basura
        for (const correo of correosCreados) {
            await db.query('DELETE FROM VideosUsuario WHERE correo_usuario = @p0', [correo]);
            await db.query('DELETE FROM usuario WHERE correo = @p0', [correo]);
        }
        correosCreados.clear();
    });

    afterAll(async () => {
        try { await pool.close(); } catch (e) {}
    });

    // --- BLOQUE DE TESTS ---

    test('NH-52/54: El servidor debe rechazar subidas sin sesión activa (Redirección)', async () => {
        const response = await request(app)
            .post('/usuario/api/cargar-video')
            .attach('video', Buffer.from('video_data'), 'test.mp4');

        // Cambiamos 401 por 302 porque tu middleware hace res.redirect
        expect(response.status).toBe(302); 
    });

    test('NH-50/55: Subida exitosa, integración con Azure y registro en BD', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);

        // Simulamos un archivo de video (Buffer)
        const videoBuffer = Buffer.from('fake_mp4_content');

        const response = await agent
            .post('/usuario/api/cargar-video')
            .field('duracion_segundos', 120) // NH-57: Dato necesario
            .attach('video', videoBuffer, 'mi_video.mp4');

        // Verificamos respuesta exitosa
        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
        expect(response.body.mensaje).toBe('Video cargado correctamente');

        // VERIFICACIÓN EN BD (NH-50): Comprobamos que el registro existe
        const videoEnBD = await db.query(
            'SELECT * FROM VideosUsuario WHERE correo_usuario = @p0', 
            [correo]
        );
        expect(videoEnBD.length).toBe(1);
        expect(videoEnBD[0].nombre_video).toBe('mi_video.mp4');
    });

    test('NH-56: Debe rechazar formatos no permitidos (ej. .txt)', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);

        const response = await agent
            .post('/usuario/api/cargar-video')
            .field('duracion_segundos', 10)
            .attach('video', Buffer.from('texto'), 'notas.txt');

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Solo se permiten videos (mp4, mov)");
    });

    test('NH-57: Debe rechazar peticiones con duración de video no válida', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);

        const response = await agent
            .post('/usuario/api/cargar-video')
            .field('duracion_segundos', 'texto_invalido')
            .attach('video', Buffer.from('video_data'), 'video.mp4');

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Duración de video no válida");
    });
});*/