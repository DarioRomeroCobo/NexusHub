const path = require('path');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../utils/middleware-bd');
const pool = require('../connection');
const routerUsuarios = require('../routers/router_usuario');

// Mocks necesarios para evitar llamadas reales a servicios externos
jest.mock('../utils/azure-blob', () => {
    return jest.fn().mockImplementation(() => {
        return {
            uploadBlob: jest.fn().mockResolvedValue({ success: true }),
            getBlobUrl: jest.fn().mockReturnValue('https://almacenamientonexushub.blob.core.windows.net/videos/video_test.mp4'),
            getBlobSasUrl: jest.fn().mockResolvedValue('https://almacenamientonexushub.blob.core.windows.net/videos/video_test.mp4?sas=token'),
            deleteBlob: jest.fn().mockResolvedValue({ success: true })
        };
    });
});

jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn()
}));
const axios = require('axios');

describe('Integración NH11: Publicar en YouTube', () => {
    let app;
    const correosCreados = new Set();

    jest.setTimeout(30000);

    const generarCorreoUnico = () => `test_youtube_${Date.now()}@nexushub.test`;

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

    // Función auxiliar para vincular YouTube (simular OAuth completado)
    const vincularYoutube = async (correo) => {
        await db.query(
            `INSERT INTO VinculacionYoutube (correo_usuario, access_token, refresh_token, expires_at)
             VALUES (@p0, @p1, @p2, @p3)`,
            [correo, 'fake-access-token', 'fake-refresh-token', new Date(Date.now() + 3600000)]
        );
    };

    // Función auxiliar para crear un video en la BD
    const crearVideo = async (correo, nombreVideo, urlVideo) => {
        await db.query(
            `INSERT INTO VideosUsuario (correo_usuario, nombre_video, url_video, peso_bytes, duracion_segundos, fecha_subida)
             VALUES (@p0, @p1, @p2, @p3, @p4, @p5)`,
            [correo, nombreVideo, urlVideo, 1024, 10, new Date()]
        );
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
            saveUninitialized: false,
            cookie: {
                secure: false,
                maxAge: 3600000
            }
        }));

        // Add res.locals middleware
        app.use((req, res, next) => {
            res.locals.user = req.session.usuarioId || null;
            res.locals.isLoggedIn = req.session.isLoggedIn || false;
            next();
        });

        app.use('/usuario', routerUsuarios);
    });

    beforeEach(() => {
        correosCreados.clear();
        jest.clearAllMocks();
    });

    afterEach(async () => {
        for (const correo of correosCreados) {
            await db.query('DELETE FROM VinculacionYoutube WHERE correo_usuario = @p0', [correo]);
            await db.query('DELETE FROM VideosUsuario WHERE correo_usuario = @p0', [correo]);
            await db.query('DELETE FROM usuario WHERE correo = @p0', [correo]);
        }
    });

    afterAll(async () => {
        try {
            await pool.close();
        } catch (err) {
            // Si el pool ya estaba cerrado por otro test, ignoramos el error.
        }
    });

    test('GET /usuario/vincular-youtube renderiza la vista de vinculación', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);

        const response = await agent.get('/usuario/vincular-youtube');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Vincular cuenta de YouTube');
    });

    test('POST /usuario/api/youtube/subir-video sube video correctamente cuando YouTube está vinculado', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
        await vincularYoutube(correo);
        await crearVideo(correo, 'test_video.mp4', 'https://almacenamientonexushub.blob.core.windows.net/videos/video_test.mp4');

        // Mock de axios para simular descarga y subida a YouTube
        axios.get.mockResolvedValue({ data: Buffer.from('fake-video-data') });
        axios.post.mockResolvedValue({ data: { id: 'youtube-video-id' } });

        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoUrl: 'https://almacenamientonexushub.blob.core.windows.net/videos/video_test.mp4',
                titulo: 'Título de prueba',
                descripcion: 'Descripción de prueba',
                privacyStatus: 'private',
                tags: 'tag1,tag2'
            });

        expect(response.status).toBe(302); // Redirect
        expect(response.headers.location).toBe('/');

        // Verificar que se llamó a axios para descargar el video
        expect(axios.get).toHaveBeenCalledWith('https://almacenamientonexushub.blob.core.windows.net/videos/video_test.mp4?sas=token', expect.any(Object));

        // Verificar que se llamó a axios para subir a YouTube
        expect(axios.post).toHaveBeenCalledWith(
            'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status',
            expect.any(Object),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer fake-access-token'
                })
            })
        );
    });

    test('POST /usuario/api/youtube/subir-video falla si YouTube no está vinculado', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
        await crearVideo(correo, 'test_video.mp4', 'https://almacenamientonexushub.blob.core.windows.net/videos/video_test.mp4');

        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoUrl: 'https://almacenamientonexushub.blob.core.windows.net/videos/video_test.mp4',
                titulo: 'Título de prueba',
                descripcion: 'Descripción de prueba',
                privacyStatus: 'private',
                tags: 'tag1,tag2'
            });

        expect(response.status).toBe(302); // Redirect
        expect(response.headers.location).toBe('/');
    });

    test('POST /usuario/api/youtube/subir-video falla si videoUrl está vacío', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
        await vincularYoutube(correo);

        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoUrl: '',
                titulo: 'Título de prueba',
                descripcion: 'Descripción de prueba',
                privacyStatus: 'private',
                tags: 'tag1,tag2'
            });

        expect(response.status).toBe(302); // Redirect
        expect(response.headers.location).toBe('/');
    });

    test('POST /usuario/api/youtube/subir-video falla si privacyStatus no es válido', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
        await vincularYoutube(correo);
        await crearVideo(correo, 'test_video.mp4', 'https://almacenamientonexushub.blob.core.windows.net/videos/video_test.mp4');

        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoUrl: 'https://almacenamientonexushub.blob.core.windows.net/videos/video_test.mp4',
                titulo: 'Título de prueba',
                descripcion: 'Descripción de prueba',
                privacyStatus: 'invalid',
                tags: 'tag1,tag2'
            });

        expect(response.status).toBe(302); // Redirect
        expect(response.headers.location).toBe('/');
    });
});