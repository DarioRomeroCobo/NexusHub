const path = require('path');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const bcrypt = require('bcrypt');
const axios = require('axios');

const db = require('../utils/middleware-bd');
const pool = require('../connection');
const routerUsuarios = require('../routers/router_usuario');

jest.mock('axios');

describe('Integración estadísticas por red social', () => {
    let app;
    const correosCreados = new Set();

    jest.setTimeout(30000);

    const generarCorreoUnico = (prefijo) => `${prefijo}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@nexushub.test`;

    const crearUsuario = async (correo, passwordPlano) => {
        const hash = await bcrypt.hash(passwordPlano, 10);
        await db.query('INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)', [correo, hash]);
        correosCreados.add(correo);
    };

    const crearVinculacionYoutube = async (correo, accessToken) => {
        await db.query(
            `MERGE VinculacionYoutube AS target
             USING (SELECT @p0 AS correo_usuario) AS source
             ON target.correo_usuario = source.correo_usuario
             WHEN MATCHED THEN
                 UPDATE SET access_token = @p1,
                            refresh_token = @p2,
                            expires_at = @p3,
                            channel_title = @p4,
                            channel_photo_url = @p5,
                            linked_at = @p6
             WHEN NOT MATCHED THEN
                 INSERT (correo_usuario, access_token, refresh_token, expires_at, channel_title, channel_photo_url, linked_at)
                 VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6);`,
            [
                correo,
                accessToken,
                'refresh-token-test',
                new Date(Date.now() + 60 * 60 * 1000),
                'Canal NexusHub',
                'https://example.com/channel.jpg',
                new Date()
            ]
        );
    };

    const iniciarSesion = async (agent, correo, password) => agent
        .post('/usuario/api/login')
        .send({ correo, password });

    const mockYoutubeConVideos = () => {
        axios.get.mockImplementation((url) => {
            if (url.includes('/channels')) {
                return Promise.resolve({
                    data: {
                        items: [
                            {
                                snippet: {
                                    title: 'Canal NexusHub',
                                    thumbnails: {
                                        high: { url: 'https://example.com/channel-high.jpg' }
                                    }
                                },
                                statistics: {
                                    subscriberCount: '1520',
                                    viewCount: '99999'
                                },
                                contentDetails: {
                                    relatedPlaylists: {
                                        uploads: 'UPLOADS_TEST'
                                    }
                                }
                            }
                        ]
                    }
                });
            }

            if (url.includes('/playlistItems')) {
                return Promise.resolve({
                    data: {
                        items: [
                            { contentDetails: { videoId: 'video-1' } },
                            { contentDetails: { videoId: 'video-2' } }
                        ]
                    }
                });
            }

            if (url.includes('/videos')) {
                return Promise.resolve({
                    data: {
                        items: [
                            {
                                id: 'video-1',
                                snippet: {
                                    title: 'Primer vídeo',
                                    publishedAt: '2026-04-10T10:00:00Z',
                                    thumbnails: {
                                        high: { url: 'https://example.com/video-1.jpg' }
                                    }
                                },
                                statistics: {
                                    viewCount: '230',
                                    likeCount: '31',
                                    commentCount: '4'
                                }
                            },
                            {
                                id: 'video-2',
                                snippet: {
                                    title: 'Segundo vídeo',
                                    publishedAt: '2026-04-11T10:00:00Z',
                                    thumbnails: {
                                        high: { url: 'https://example.com/video-2.jpg' }
                                    }
                                },
                                statistics: {
                                    viewCount: '540',
                                    likeCount: '60',
                                    commentCount: '8'
                                }
                            }
                        ]
                    }
                });
            }

            return Promise.reject(new Error(`Unexpected URL ${url}`));
        });
    };

    const mockYoutubeSinVideos = () => {
        axios.get.mockImplementation((url) => {
            if (url.includes('/channels')) {
                return Promise.resolve({
                    data: {
                        items: [
                            {
                                snippet: {
                                    title: 'Canal sin vídeos',
                                    thumbnails: {
                                        high: { url: 'https://example.com/channel-empty.jpg' }
                                    }
                                },
                                statistics: {
                                    subscriberCount: '80',
                                    viewCount: '3456'
                                },
                                contentDetails: {
                                    relatedPlaylists: {
                                        uploads: 'UPLOADS_EMPTY'
                                    }
                                }
                            }
                        ]
                    }
                });
            }

            if (url.includes('/playlistItems')) {
                return Promise.resolve({
                    data: {
                        items: []
                    }
                });
            }

            if (url.includes('/videos')) {
                return Promise.resolve({
                    data: {
                        items: []
                    }
                });
            }

            return Promise.reject(new Error(`Unexpected URL ${url}`));
        });
    };

    beforeAll(() => {
        app = express();
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '..', 'views'));
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(session({
            secret: 'test_stats_red_secret',
            resave: false,
            saveUninitialized: false,
            cookie: { secure: false }
        }));
        app.use((req, res, next) => {
            res.locals.user = req.session.usuarioId || null;
            res.locals.correo = req.session.correo || null;
            res.locals.isLoggedIn = req.session.isLoggedIn || false;
            res.locals.youtubeVinculado = false;
            next();
        });
        app.use('/usuario', routerUsuarios);
    });

    afterEach(async () => {
        axios.get.mockReset();
        axios.post.mockReset();

        for (const correo of correosCreados) {
            await db.query('DELETE FROM VinculacionYoutube WHERE correo_usuario = @p0', [correo]);
            await db.query('DELETE FROM usuario WHERE correo = @p0', [correo]);
        }
        correosCreados.clear();
    });

    afterAll(async () => {
        try {
            await pool.close();
        } catch (_) {
            // Ignoramos si el pool ya fue cerrado por otra suite.
        }
    });

    test('redirige a inicio de sesión cuando se accede a la vista sin autenticación', async () => {
        const response = await request(app).get('/usuario/estadisticas-redsocial');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/usuario/inicio-sesion');
    });

    test('devuelve 401 en el endpoint API cuando no hay sesión activa', async () => {
        const response = await request(app).get('/usuario/api/youtube/estadisticas');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            ok: false,
            error: 'Debes iniciar sesion para continuar'
        });
    });

    test('GET /usuario/api/youtube/estadisticas devuelve estadísticas en JSON con vídeos de YouTube', async () => {
        const correo = generarCorreoUnico('it_stats_red_api');
        await crearUsuario(correo, 'Valida@123');
        await crearVinculacionYoutube(correo, 'access-token-test');
        mockYoutubeConVideos();

        const agent = request.agent(app);
        const loginResponse = await iniciarSesion(agent, correo, 'Valida@123');

        expect(loginResponse.status).toBe(200);

        const response = await agent.get('/usuario/api/youtube/estadisticas');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/json/);
        expect(response.body.ok).toBe(true);
        expect(Array.isArray(response.body.redes)).toBe(true);
        expect(response.body.redes).toHaveLength(2);
        expect(response.body.redes[0]).toMatchObject({
            plataforma: 'YouTube',
            usuario: 'Canal NexusHub',
            titulo: 'Primer vídeo',
            suscriptores: 1520,
            vistas: 230,
            likes: 31,
            comentarios: 4
        });
    });

    test('GET /usuario/estadisticas-redsocial muestra sin datos cuando el usuario no tiene vinculación', async () => {
        const correo = generarCorreoUnico('it_stats_red_empty_html');
        await crearUsuario(correo, 'Valida@123');

        const agent = request.agent(app);
        const loginResponse = await iniciarSesion(agent, correo, 'Valida@123');

        expect(loginResponse.status).toBe(200);

        const response = await agent.get('/usuario/estadisticas-redsocial');

        expect(response.status).toBe(200);
        expect(response.text).toMatch(/Sin datos disponibles/i);
        expect(response.text).toMatch(/No hemos encontrado redes vinculadas para mostrar estadísticas globales/i);
        expect(axios.get).not.toHaveBeenCalled();
    });

    test('GET /usuario/api/youtube/estadisticas devuelve redes vacías cuando el usuario no tiene vinculación', async () => {
        const correo = generarCorreoUnico('it_stats_red_empty_api');
        await crearUsuario(correo, 'Valida@123');

        const agent = request.agent(app);
        const loginResponse = await iniciarSesion(agent, correo, 'Valida@123');

        expect(loginResponse.status).toBe(200);

        const response = await agent.get('/usuario/api/youtube/estadisticas');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            ok: true,
            redes: []
        });
        expect(axios.get).not.toHaveBeenCalled();
    });

    test('GET /usuario/api/youtube/estadisticas usa las métricas del canal cuando no hay vídeos', async () => {
        const correo = generarCorreoUnico('it_stats_red_fallback_api');
        await crearUsuario(correo, 'Valida@123');
        await crearVinculacionYoutube(correo, 'access-token-test');
        mockYoutubeSinVideos();

        const agent = request.agent(app);
        const loginResponse = await iniciarSesion(agent, correo, 'Valida@123');

        expect(loginResponse.status).toBe(200);

        const response = await agent.get('/usuario/api/youtube/estadisticas');

        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
        expect(response.body.redes).toHaveLength(1);
        expect(response.body.redes[0]).toMatchObject({
            plataforma: 'YouTube',
            usuario: 'Canal sin vídeos',
            titulo: 'Canal sin vídeos',
            suscriptores: 80,
            vistas: 3456,
            likes: 0,
            comentarios: 0
        });
    });
});