const path = require('path');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../utils/middleware-bd');
const pool = require('../connection');
const routerUsuarios = require('../routers/router_usuario');
 
jest.mock('axios');
const axios = require('axios');
 
describe('Integración NH-11: Flujo de Publicación de Vídeos en YouTube', () => {
    let app;
    const correosCreados = new Set();
 
    jest.setTimeout(30000);
 
    const generarCorreoUnico = () => `test_publicar_yt_${Date.now()}@nexushub.test`;
 
    const prepararSesion = async (agent, correo) => {
        const pass = 'Valida@123';
        const hash = await bcrypt.hash(pass, 10);
        await db.query('INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)', [correo, hash]);
        correosCreados.add(correo);
        
        await agent.post('/usuario/api/login').send({ correo, password: pass });
    };
 
    const crearVinculacionYoutube = async (correo, tokenExpirado = false) => {
        const accessToken = 'mock_access_token_' + Date.now();
        const refreshToken = 'mock_refresh_token_' + Date.now();
        const expiresAt = tokenExpirado 
            ? new Date(Date.now() - 3600 * 1000)
            : new Date(Date.now() + 3600 * 1000);
        const channelTitle = 'Canal de Prueba';
        const channelPhotoUrl = 'https://example.com/photo.jpg';
 
        await db.query(
            `INSERT INTO VinculacionYoutube (correo_usuario, access_token, refresh_token, expires_at, channel_title, channel_photo_url, linked_at)
             VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6)`,
            [correo, accessToken, refreshToken, expiresAt, channelTitle, channelPhotoUrl, new Date()]
        );
    };
 
    const crearVideo = async (correo, nombreVideo = 'video_test.mp4') => {
        const urlVideo = `https://mockazure.com/${nombreVideo}`;
        const resultado = await db.query(
            `INSERT INTO VideosUsuario (correo_usuario, url_video, nombre_video, peso_bytes, duracion_segundos)
             OUTPUT INSERTED.id_video
             VALUES (@p0, @p1, @p2, @p3, @p4)`,
            [correo, urlVideo, nombreVideo, 1024000, 120]
        );
        
        return resultado[0]?.id_video;
    };
 
    beforeAll(() => {
        app = express();
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '..', 'views'));
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        
        app.use(session({
            secret: "inicio_sesion_es_seguro",
            resave: false,
            saveUninitialized: false
        }));
 
        app.use((req, res, next) => {
            res.locals.user = req.session.usuarioId || null;
            res.locals.isLoggedIn = req.session.isLoggedIn || false;
            next();
        });
 
        app.use('/usuario', routerUsuarios);
    });
 
    afterEach(async () => {
        for (const correo of correosCreados) {
            await db.query('DELETE FROM VideosUsuario WHERE correo_usuario = @p0', [correo]);
            await db.query('DELETE FROM VinculacionYoutube WHERE correo_usuario = @p0', [correo]);
            await db.query('DELETE FROM usuario WHERE correo = @p0', [correo]);
        }
        correosCreados.clear();
        
        jest.clearAllMocks();
    });
 
    afterAll(async () => {
        try { await pool.close(); } catch (e) {}
    });
 
    // --- BLOQUE DE TESTS ---
    test('NH-11/01: Debe rechazar publicaciones sin sesión activa', async () => {
        const response = await request(app)
            .post('/usuario/api/youtube/subir-video')
            .send({ 
                videoId: 1, 
                title: 'Test Video',
                description: 'Test Description'
            });
 
        expect(response.status).toBe(401);
        expect(response.body.ok).toBe(false);
        expect(response.body.error).toMatch(/sesion/i);
    });
 
    test('NH-11/02: Debe rechazar publicaciones sin vinculación de YouTube', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
 
        const videoId = await crearVideo(correo);
 
        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoId: videoId,
                title: 'Mi Video de Prueba',
                description: 'Descripción del video'
            });
 
        expect(response.status).toBe(400);
        expect(response.body.ok).toBe(false);
        expect(response.body.error).toMatch(/YouTube.*vinculado|vinculacion/i);
    });
 
    test('NH-11/03: Debe rechazar publicaciones con videoId inválido', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
        await crearVinculacionYoutube(correo);
 
        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoId: 'texto_invalido', 
                title: 'Mi Video',
                description: 'Descripción'
            });
 
        expect(response.status).toBe(400);
        expect(response.body.ok).toBe(false);
        expect(response.body.error).toMatch(/videoId.*obligatorio|videoId.*numerico/i);
    });
 
    test('NH-11/04: Debe rechazar publicaciones con videoId inexistente', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
        await crearVinculacionYoutube(correo);
 
        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoId: 999999, 
                title: 'Mi Video',
                description: 'Descripción'
            });
 
        expect(response.status).toBe(404);
        expect(response.body.ok).toBe(false);
        expect(response.body.error).toMatch(/no.*encontro.*video|video.*solicitado/i);
    });
 
    test('NH-11/05: Debe rechazar privacyStatus no válido', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
        await crearVinculacionYoutube(correo);
 
        const videoId = await crearVideo(correo);
 
        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoId: videoId,
                title: 'Mi Video',
                description: 'Descripción',
                privacyStatus: 'invalido' 
            });
 
        expect(response.status).toBe(400);
        expect(response.body.ok).toBe(false);
        expect(response.body.error).toMatch(/privacyStatus.*valido/i);
    });
 
    test('NH-11/06: Publicación exitosa con integración a YouTube API', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
        await crearVinculacionYoutube(correo);
 
        const videoId = await crearVideo(correo, 'mi_video_prueba.mp4');
 
        axios.get = jest.fn().mockResolvedValue({
            data: Buffer.from('fake_video_content')
        });
 
        // Mock de axios.post para subir a YouTube
        const mockYoutubeVideoId = 'dQw4w9WgXcQ';
        axios.post = jest.fn().mockResolvedValue({
            data: {
                id: mockYoutubeVideoId,
                snippet: {
                    title: 'Mi Video de Prueba',
                    description: 'Esta es la descripción'
                },
                status: {
                    uploadStatus: 'uploaded',
                    privacyStatus: 'public'
                }
            }
        });
 
        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoId: videoId,
                title: 'Mi Video de Prueba',
                description: 'Esta es la descripción',
                privacyStatus: 'public',
                tags: ['test', 'nexushub']
            });
 
        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
        expect(response.body.mensaje).toMatch(/subido.*YouTube.*correctamente/i);
        expect(response.body.youtubeVideoId).toBe(mockYoutubeVideoId);
        expect(response.body.youtubeUrl).toBe(`https://www.youtube.com/watch?v=${mockYoutubeVideoId}`);
 
        // Verificar que se descargó el video de Azure
        expect(axios.get).toHaveBeenCalledWith(
            expect.stringContaining('mockazure.com'),
            expect.objectContaining({
                responseType: 'arraybuffer'
            })
        );
 
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining('youtube.com'),
            expect.anything(),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: expect.stringContaining('Bearer')
                })
            })
        );
    });
 
    test('NH-11/07: Debe manejar errores de YouTube API correctamente', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
        await crearVinculacionYoutube(correo);
 
        const videoId = await crearVideo(correo);
 
        axios.get = jest.fn().mockResolvedValue({
            data: Buffer.from('fake_video_content')
        });
 
        // Mock de error de YouTube API
        axios.post = jest.fn().mockRejectedValue({
            response: {
                status: 403,
                data: {
                    error: {
                        message: 'Insufficient permissions'
                    }
                }
            },
            message: 'Request failed with status code 403'
        });
 
        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoId: videoId,
                title: 'Mi Video',
                description: 'Descripción'
            });
 
        expect(response.status).toBe(403);
        expect(response.body.ok).toBe(false);
        expect(response.body.error).toMatch(/No autorizado.*YouTube|Vuelve.*vincular/i);
    });
 
    test('NH-11/08: Debe rechazar publicación de video que no pertenece al usuario', async () => {
        const correo1 = generarCorreoUnico();
        const correo2 = generarCorreoUnico();
        
        const agent1 = request.agent(app);
        await prepararSesion(agent1, correo1);
        const videoIdUsuario1 = await crearVideo(correo1);
 
        const agent2 = request.agent(app);
        await prepararSesion(agent2, correo2);
        await crearVinculacionYoutube(correo2);
 
        const response = await agent2
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoId: videoIdUsuario1,
                title: 'Intento de publicar video ajeno',
                description: 'Esto no debería funcionar'
            });
 
        expect(response.status).toBe(404);
        expect(response.body.ok).toBe(false);
        expect(response.body.error).toMatch(/no.*encontro.*video/i);
    });
 
    test('NH-11/09: Debe renovar token si está expirado antes de publicar', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
 
        await crearVinculacionYoutube(correo, true); 
 
        const videoId = await crearVideo(correo);
 
        // Mock para renovar token
        axios.post = jest.fn()
            .mockResolvedValueOnce({
                data: {
                    access_token: 'new_access_token',
                    expires_in: 3600
                }
            })
            .mockResolvedValueOnce({
                data: {
                    id: 'video123',
                    snippet: { title: 'Test' },
                    status: { uploadStatus: 'uploaded', privacyStatus: 'private' }
                }
            });
 
        // Mock para descargar video
        axios.get = jest.fn().mockResolvedValue({
            data: Buffer.from('fake_video_content')
        });
 
        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoId: videoId,
                title: 'Video con token renovado',
                description: 'Test'
            });
 
        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
        
        expect(axios.post).toHaveBeenCalledTimes(2);
        
        expect(axios.post).toHaveBeenNthCalledWith(
            1,
            'https://oauth2.googleapis.com/token',
            expect.any(String),
            expect.objectContaining({
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            })
        );
 
        const vinculacionActualizada = await db.query(
            'SELECT access_token FROM VinculacionYoutube WHERE correo_usuario = @p0',
            [correo]
        );
        expect(vinculacionActualizada[0].access_token).toBe('new_access_token');
    });
 
    test('NH-11/10: Debe usar valores por defecto cuando faltan campos opcionales', async () => {
        const agent = request.agent(app);
        const correo = generarCorreoUnico();
        await prepararSesion(agent, correo);
        await crearVinculacionYoutube(correo);
 
        const videoId = await crearVideo(correo, 'video_sin_titulo.mp4');
 
        axios.get = jest.fn().mockResolvedValue({
            data: Buffer.from('fake_video_content')
        });
 
        axios.post = jest.fn().mockResolvedValue({
            data: {
                id: 'abc123',
                snippet: { title: 'Default' },
                status: { uploadStatus: 'uploaded', privacyStatus: 'private' }
            }
        });
 
        const response = await agent
            .post('/usuario/api/youtube/subir-video')
            .send({
                videoId: videoId
            });
 
        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
 
        const llamadaYoutube = axios.post.mock.calls.find(call => 
            call[0].includes('youtube.com')
        );
        expect(llamadaYoutube).toBeDefined();
    });
});