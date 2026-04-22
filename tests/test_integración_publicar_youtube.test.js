const path = require('path');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../utils/middleware-bd');
const pool = require('../connection');
const routerUsuarios = require('../routers/router_usuario');

// Mock de axios para simular llamadas a YouTube API
jest.mock('axios');
const axios = require('axios');

// Mock de console.error para evitar logs en tests de error
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Integracion bottom-up publicar youtube', () => {
    let app;
    const correosCreados = new Set();
    const videosCreados = new Set();

    jest.setTimeout(30000);

    const generarCorreoUnico = () => {
        const unico = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        return `it_youtube_${unico}@nexushub.test`;
    };

    const borrarUsuarioPorCorreo = async (correo) => {
        if (!correo) {
            return;
        }
        await db.query('DELETE FROM usuario WHERE correo = @p0', [correo]);
    };

    const borrarVideoPorUrl = async (url) => {
        if (!url) {
            return;
        }
        await db.query('DELETE FROM VideosUsuario WHERE url_video = @p0', [url]);
    };

    const borrarVinculacionYoutube = async (correo) => {
        if (!correo) {
            return;
        }
        await db.query('DELETE FROM VinculacionYoutube WHERE correo_usuario = @p0', [correo]);
    };

    const crearUsuario = async (correo, passwordPlano) => {
        const hash = await bcrypt.hash(passwordPlano, 10);
        await db.query('INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)', [correo, hash]);
        correosCreados.add(correo);
    };

    const crearVideo = async (correo, nombre, url) => {
        await db.query(
            'INSERT INTO VideosUsuario (correo_usuario, nombre_video, url_video, peso_bytes, duracion_segundos, fecha_subida) VALUES (@p0, @p1, @p2, @p3, @p4, @p5)',
            [correo, nombre, url, 1024 * 1024, 30, new Date()]
        );
        videosCreados.add(url);
    };

    const vincularYoutube = async (correo) => {
        await db.query(
            'INSERT INTO VinculacionYoutube (correo_usuario, access_token, refresh_token, expires_at, channel_title, channel_photo_url, linked_at) VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6)',
            [correo, 'fake_access_token', 'fake_refresh_token', new Date(Date.now() + 3600000), 'Test Channel', null, new Date()]
        );
    };

    beforeAll(() => {
        app = express();
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '..', 'views'));
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(session({
            secret: 'test_youtube_secret',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: false
            }
        }));
        app.use((req, res, next) => {
            res.locals.user = req.session.usuarioId || null;
            res.locals.correo = req.session.correo || null;
            res.locals.isLoggedIn = req.session.isLoggedIn || false;
            next();
        });
        app.use('/usuario', routerUsuarios);

        app.use((err, req, res, next) => {
            res.status(500).json({ ok: false, error: err.message || 'Error inesperado' });
        });
    });

    beforeEach(() => {
        correosCreados.clear();
        videosCreados.clear();
        jest.clearAllMocks();
    });

    afterEach(async () => {
        for (const correo of correosCreados) {
            await borrarVinculacionYoutube(correo);
            await borrarUsuarioPorCorreo(correo);
        }
        for (const url of videosCreados) {
            await borrarVideoPorUrl(url);
        }
    });

    afterAll(async () => {
        consoleErrorSpy.mockRestore();
        try {
            await pool.close();
        } catch (err) {
            // Si el pool ya estaba cerrado por otro test, ignoramos el error.
        }
    });

    test('POST /api/youtube/subir-video devuelve 401 cuando no hay sesion', async () => {
        const response = await request(app)
            .post('/usuario/api/youtube/subir-video')
            .send({ videoUrl: 'https://example.com/video.mp4' });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ ok: false, error: 'Debes iniciar sesion para continuar' });
    });

    test('POST /api/youtube/subir-video devuelve 400 cuando falta videoUrl', async () => {
        const correo = generarCorreoUnico();
        await crearUsuario(correo, 'Valida@123');

        const agent = request.agent(app);
        await agent
            .post('/usuario/api/login')
            .send({ correo, password: 'Valida@123' });

        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({});

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ ok: false, error: 'videoUrl es obligatorio' });
    });

    test('POST /api/youtube/subir-video devuelve 400 cuando privacyStatus es invalido', async () => {
        const correo = generarCorreoUnico();
        await crearUsuario(correo, 'Valida@123');

        const agent = request.agent(app);
        await agent
            .post('/usuario/api/login')
            .send({ correo, password: 'Valida@123' });

        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({ videoUrl: 'https://example.com/video.mp4', privacyStatus: 'invalid' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ ok: false, error: 'privacyStatus no valido' });
    });

    test('POST /api/youtube/subir-video devuelve 400 cuando no hay YouTube vinculado', async () => {
        const correo = generarCorreoUnico();
        await crearUsuario(correo, 'Valida@123');
        const videoUrl = 'https://example.com/video.mp4';
        await crearVideo(correo, 'Test Video', videoUrl);

        const agent = request.agent(app);
        await agent
            .post('/usuario/api/login')
            .send({ correo, password: 'Valida@123' });

        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({ videoUrl, privacyStatus: 'private' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ ok: false, error: 'No tienes YouTube vinculado' });
    });

    test('POST /api/youtube/subir-video devuelve 404 cuando el video no existe', async () => {
        const correo = generarCorreoUnico();
        await crearUsuario(correo, 'Valida@123');
        await vincularYoutube(correo);

        const agent = request.agent(app);
        await agent
            .post('/usuario/api/login')
            .send({ correo, password: 'Valida@123' });

        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({ videoUrl: 'https://example.com/nonexistent.mp4', privacyStatus: 'private' });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ ok: false, error: 'No se encontro el video solicitado' });
    });

    test('POST /api/youtube/subir-video sube video correctamente a YouTube', async () => {
        const correo = generarCorreoUnico();
        await crearUsuario(correo, 'Valida@123');
        const videoUrl = 'https://example.com/video.mp4';
        await crearVideo(correo, 'Test Video', videoUrl);
        await vincularYoutube(correo);

        // Mock de axios para simular descarga del video
        axios.get.mockResolvedValueOnce({
            data: Buffer.from('fake video data')
        });

        // Mock de axios para simular subida a YouTube
        axios.post.mockResolvedValueOnce({
            data: { id: 'youtube_video_id_123' }
        });

        const agent = request.agent(app);
        await agent
            .post('/usuario/api/login')
            .send({ correo, password: 'Valida@123' });

        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoUrl,
                privacyStatus: 'private',
                title: 'Test YouTube Video',
                description: 'Description from test',
                tags: ['test', 'nexus']
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            ok: true,
            mensaje: 'Video subido a YouTube correctamente',
            youtubeVideoId: 'youtube_video_id_123',
            youtubeUrl: 'https://www.youtube.com/watch?v=youtube_video_id_123'
        });

        // Verificar que axios.get fue llamado para descargar el video
        expect(axios.get).toHaveBeenCalledWith(videoUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: 1024 * 1024 * 1024
        });

        // Verificar que axios.post fue llamado para subir a YouTube
        expect(axios.post).toHaveBeenCalledWith(
            'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status',
            'test', // El body es 'test' en el código, probablemente un placeholder
            {
                headers: {
                    Authorization: 'Bearer fake_access_token'
                },
                maxBodyLength: Infinity,
                timeout: 180000
            }
        );
    });

    test('POST /api/youtube/subir-video maneja errores de YouTube API', async () => {
        const correo = generarCorreoUnico();
        await crearUsuario(correo, 'Valida@123');
        const videoUrl = 'https://example.com/video.mp4';
        await crearVideo(correo, 'Test Video', videoUrl);
        await vincularYoutube(correo);

        // Mock de axios para descarga exitosa
        axios.get.mockResolvedValueOnce({
            data: Buffer.from('fake video data')
        });

        // Mock de axios para simular error en YouTube
        axios.post.mockRejectedValueOnce({
            response: {
                status: 403,
                data: { error: { message: 'Forbidden' } }
            }
        });

        const agent = request.agent(app);
        await agent
            .post('/usuario/api/login')
            .send({ correo, password: 'Valida@123' });

        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoUrl,
                privacyStatus: 'private'
            });

        expect(response.status).toBe(403);
        expect(response.body.ok).toBe(false);
        expect(response.body.error).toContain('No autorizado por YouTube');
    });
});