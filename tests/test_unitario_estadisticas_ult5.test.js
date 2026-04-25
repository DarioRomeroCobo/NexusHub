const axios = require('axios');
const { mostrarEstadisticasPublicaciones } = require('../controllers/estadisticasController');

// Mock de axios
jest.mock('axios');

// Mock del middleware de base de datos
jest.mock('../utils/middleware-bd', () => ({
    query: jest.fn()
}));

const db = require('../utils/middleware-bd');

describe('Pruebas Unitarias - Estadísticas de las 5 últimas publicaciones', () => {
    let req, res, next;

    beforeEach(() => {
        // Reset de mocks
        jest.clearAllMocks();

        // Mock de request
        req = {
            session: {
                isLoggedIn: true,
                correo: 'test@example.com'
            }
        };

        // Mock de response
        res = {
            render: jest.fn(),
            redirect: jest.fn()
        };

        // Mock de next
        next = jest.fn();
    });

    describe('Validación de estadísticas numéricas', () => {
        test('debe procesar correctamente las estadísticas numéricas de las 5 últimas publicaciones', async () => {
            // Mock de la consulta a la base de datos para obtener el token
            db.query.mockResolvedValueOnce([{
                access_token: 'valid_token',
                refresh_token: 'refresh_token',
                expires_at: new Date(Date.now() + 3600000) // Token válido
            }]);

            // Mock de la respuesta de búsqueda de YouTube (últimas 5 publicaciones)
            const mockSearchResponse = {
                data: {
                    items: [
                        { id: { videoId: 'video1' } },
                        { id: { videoId: 'video2' } },
                        { id: { videoId: 'video3' } },
                        { id: { videoId: 'video4' } },
                        { id: { videoId: 'video5' } }
                    ]
                }
            };
            axios.get.mockResolvedValueOnce(mockSearchResponse);

            // Mock de la respuesta de estadísticas de YouTube
            const mockStatsResponse = {
                data: {
                    items: [
                        {
                            id: 'video1',
                            snippet: {
                                title: 'Video 1',
                                publishedAt: '2024-01-01T00:00:00Z',
                                channelTitle: 'Test Channel',
                                thumbnails: { medium: { url: 'thumb1.jpg' } }
                            },
                            statistics: {
                                viewCount: '1000',
                                likeCount: '50',
                                dislikeCount: '5',
                                commentCount: '20'
                            },
                            status: { license: 'youtube' }
                        },
                        {
                            id: 'video2',
                            snippet: {
                                title: 'Video 2',
                                publishedAt: '2024-01-02T00:00:00Z',
                                channelTitle: 'Test Channel',
                                thumbnails: { medium: { url: 'thumb2.jpg' } }
                            },
                            statistics: {
                                viewCount: '2000',
                                likeCount: '100',
                                dislikeCount: '10',
                                commentCount: '40'
                            },
                            status: { license: 'youtube' }
                        },
                        {
                            id: 'video3',
                            snippet: {
                                title: 'Video 3',
                                publishedAt: '2024-01-03T00:00:00Z',
                                channelTitle: 'Test Channel',
                                thumbnails: { medium: { url: 'thumb3.jpg' } }
                            },
                            statistics: {
                                viewCount: '1500',
                                likeCount: '75',
                                dislikeCount: '8',
                                commentCount: '30'
                            },
                            status: { license: 'youtube' }
                        },
                        {
                            id: 'video4',
                            snippet: {
                                title: 'Video 4',
                                publishedAt: '2024-01-04T00:00:00Z',
                                channelTitle: 'Test Channel',
                                thumbnails: { medium: { url: 'thumb4.jpg' } }
                            },
                            statistics: {
                                viewCount: '3000',
                                likeCount: '150',
                                dislikeCount: '15',
                                commentCount: '60'
                            },
                            status: { license: 'youtube' }
                        },
                        {
                            id: 'video5',
                            snippet: {
                                title: 'Video 5',
                                publishedAt: '2024-01-05T00:00:00Z',
                                channelTitle: 'Test Channel',
                                thumbnails: { medium: { url: 'thumb5.jpg' } }
                            },
                            statistics: {
                                viewCount: '2500',
                                likeCount: '125',
                                dislikeCount: '12',
                                commentCount: '50'
                            },
                            status: { license: 'youtube' }
                        }
                    ]
                }
            };
            axios.get.mockResolvedValueOnce(mockStatsResponse);

            // Mock de las respuestas de analytics (series temporales) - fallan para simplificar
            axios.get.mockRejectedValueOnce(new Error('Analytics not available'));

            // Ejecutar la función
            await mostrarEstadisticasPublicaciones(req, res, next);

            // Verificar que se renderizó la vista correcta
            expect(res.render).toHaveBeenCalledWith('estadisticas-publicaciones', expect.objectContaining({
                publicaciones: expect.any(Array),
                totalPublicaciones: 5,
                errorSeriesVideos: expect.any(String),
                error: null,
                canal: 'Test Channel',
                ultimaActualizacion: expect.any(Date)
            }));

            // Obtener las publicaciones renderizadas
            const renderCall = res.render.mock.calls[0][1];
            const publicaciones = renderCall.publicaciones;

            // Verificar que hay exactamente 5 publicaciones
            expect(publicaciones).toHaveLength(5);

            // Verificar estadísticas numéricas de cada publicación
            expect(publicaciones[0]).toEqual(expect.objectContaining({
                id: 'video1',
                titulo: 'Video 1',
                vistas: 1000,
                meGusta: 50,
                noMeGusta: 5,
                comentarios: 20,
                monetizable: true,
                url: 'https://www.youtube.com/watch?v=video1'
            }));

            expect(publicaciones[1]).toEqual(expect.objectContaining({
                id: 'video2',
                titulo: 'Video 2',
                vistas: 2000,
                meGusta: 100,
                noMeGusta: 10,
                comentarios: 40,
                monetizable: true,
                url: 'https://www.youtube.com/watch?v=video2'
            }));

            expect(publicaciones[2]).toEqual(expect.objectContaining({
                id: 'video3',
                titulo: 'Video 3',
                vistas: 1500,
                meGusta: 75,
                noMeGusta: 8,
                comentarios: 30,
                monetizable: true,
                url: 'https://www.youtube.com/watch?v=video3'
            }));

            expect(publicaciones[3]).toEqual(expect.objectContaining({
                id: 'video4',
                titulo: 'Video 4',
                vistas: 3000,
                meGusta: 150,
                noMeGusta: 15,
                comentarios: 60,
                monetizable: true,
                url: 'https://www.youtube.com/watch?v=video4'
            }));

            expect(publicaciones[4]).toEqual(expect.objectContaining({
                id: 'video5',
                titulo: 'Video 5',
                vistas: 2500,
                meGusta: 125,
                noMeGusta: 12,
                comentarios: 50,
                monetizable: true,
                url: 'https://www.youtube.com/watch?v=video5'
            }));
        });

        test('debe manejar estadísticas faltantes correctamente', async () => {
            // Mock de la consulta a la base de datos
            db.query.mockResolvedValueOnce([{
                access_token: 'valid_token',
                refresh_token: 'refresh_token',
                expires_at: new Date(Date.now() + 3600000)
            }]);

            // Mock de búsqueda
            axios.get.mockResolvedValueOnce({
                data: {
                    items: [
                        { id: { videoId: 'video1' } }
                    ]
                }
            });

            // Mock de estadísticas con valores faltantes
            axios.get.mockResolvedValueOnce({
                data: {
                    items: [{
                        id: 'video1',
                        snippet: {
                            title: 'Video sin estadísticas',
                            publishedAt: '2024-01-01T00:00:00Z',
                            channelTitle: 'Test Channel'
                        },
                        statistics: {
                            // Sin viewCount, likeCount, etc.
                        },
                        status: { license: 'youtube' }
                    }]
                }
            });

            // Mock de analytics fallido
            axios.get.mockRejectedValueOnce(new Error('Analytics not available'));

            await mostrarEstadisticasPublicaciones(req, res, next);

            const renderCall = res.render.mock.calls[0][1];
            const publicaciones = renderCall.publicaciones;

            // Verificar que los valores faltantes se convierten a 0
            expect(publicaciones[0]).toEqual(expect.objectContaining({
                vistas: 0,
                meGusta: 0,
                noMeGusta: 0,
                comentarios: 0
            }));
        });

        test('debe manejar respuestas vacías de la API', async () => {
            // Mock de la consulta a la base de datos
            db.query.mockResolvedValueOnce([{
                access_token: 'valid_token',
                refresh_token: 'refresh_token',
                expires_at: new Date(Date.now() + 3600000)
            }]);

            // Mock de búsqueda sin resultados
            axios.get.mockResolvedValueOnce({
                data: {
                    items: []
                }
            });

            await mostrarEstadisticasPublicaciones(req, res, next);

            // Verificar que se renderiza con arrays vacíos
            expect(res.render).toHaveBeenCalledWith('estadisticas-publicaciones', expect.objectContaining({
                publicaciones: [],
                totalPublicaciones: 0,
                error: null
            }));
        });

        test('debe manejar errores de la API de estadísticas', async () => {
            // Mock de la consulta a la base de datos
            db.query.mockResolvedValueOnce([{
                access_token: 'valid_token',
                refresh_token: 'refresh_token',
                expires_at: new Date(Date.now() + 3600000)
            }]);

            // Mock de búsqueda exitosa
            axios.get.mockResolvedValueOnce({
                data: {
                    items: [{ id: { videoId: 'video1' } }]
                }
            });

            // Mock de estadísticas fallidas
            axios.get.mockRejectedValueOnce(new Error('API Error'));

            await mostrarEstadisticasPublicaciones(req, res, next);

            // Verificar que next() se llama con el error
            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });

        test('debe convertir correctamente estadísticas de string a number y calcular totales', async () => {
            // Mock de la consulta a la base de datos
            db.query.mockResolvedValueOnce([{
                access_token: 'valid_token',
                refresh_token: 'refresh_token',
                expires_at: new Date(Date.now() + 3600000)
            }]);

            // Mock de búsqueda con 3 videos
            axios.get.mockResolvedValueOnce({
                data: {
                    items: [
                        { id: { videoId: 'video1' } },
                        { id: { videoId: 'video2' } },
                        { id: { videoId: 'video3' } }
                    ]
                }
            });

            // Mock de estadísticas con valores mixtos (strings y números)
            axios.get.mockResolvedValueOnce({
                data: {
                    items: [
                        {
                            id: 'video1',
                            snippet: {
                                title: 'Video 1',
                                publishedAt: '2024-01-01T00:00:00Z',
                                channelTitle: 'Test Channel'
                            },
                            statistics: {
                                viewCount: '100',    // string
                                likeCount: 50,       // number
                                dislikeCount: '5',   // string
                                commentCount: 20     // number
                            },
                            status: { license: 'youtube' }
                        },
                        {
                            id: 'video2',
                            snippet: {
                                title: 'Video 2',
                                publishedAt: '2024-01-02T00:00:00Z',
                                channelTitle: 'Test Channel'
                            },
                            statistics: {
                                viewCount: '200',
                                likeCount: '75',
                                dislikeCount: '10',
                                commentCount: '30'
                            },
                            status: { license: 'youtube' }
                        },
                        {
                            id: 'video3',
                            snippet: {
                                title: 'Video 3',
                                publishedAt: '2024-01-03T00:00:00Z',
                                channelTitle: 'Test Channel'
                            },
                            statistics: {
                                viewCount: '150',
                                likeCount: '25',
                                dislikeCount: '2',
                                commentCount: '15'
                            },
                            status: { license: 'youtube' }
                        }
                    ]
                }
            });

            // Mock de analytics fallido
            axios.get.mockRejectedValueOnce(new Error('Analytics not available'));

            await mostrarEstadisticasPublicaciones(req, res, next);

            const renderCall = res.render.mock.calls[0][1];
            const publicaciones = renderCall.publicaciones;

            // Verificar conversión correcta de strings a números
            expect(publicaciones[0].vistas).toBe(100);    // string '100' -> number 100
            expect(publicaciones[0].meGusta).toBe(50);    // number 50 -> number 50
            expect(publicaciones[0].noMeGusta).toBe(5);   // string '5' -> number 5
            expect(publicaciones[0].comentarios).toBe(20); // number 20 -> number 20

            expect(publicaciones[1].vistas).toBe(200);
            expect(publicaciones[1].meGusta).toBe(75);
            expect(publicaciones[1].noMeGusta).toBe(10);
            expect(publicaciones[1].comentarios).toBe(30);

            expect(publicaciones[2].vistas).toBe(150);
            expect(publicaciones[2].meGusta).toBe(25);
            expect(publicaciones[2].noMeGusta).toBe(2);
            expect(publicaciones[2].comentarios).toBe(15);

            // Verificar que totalPublicaciones refleja la cantidad correcta
            expect(renderCall.totalPublicaciones).toBe(3);

            // Calcular totales manualmente para verificar
            const totalVistas = publicaciones.reduce((sum, pub) => sum + pub.vistas, 0);
            const totalMeGusta = publicaciones.reduce((sum, pub) => sum + pub.meGusta, 0);
            const totalComentarios = publicaciones.reduce((sum, pub) => sum + pub.comentarios, 0);

            expect(totalVistas).toBe(450);    // 100 + 200 + 150
            expect(totalMeGusta).toBe(150);   // 50 + 75 + 25
            expect(totalComentarios).toBe(65); // 20 + 30 + 15
        });

        test('debe procesar solo las primeras 5 publicaciones aunque la API retorne más', async () => {
            // Mock de la consulta a la base de datos
            db.query.mockResolvedValueOnce([{
                access_token: 'valid_token',
                refresh_token: 'refresh_token',
                expires_at: new Date(Date.now() + 3600000)
            }]);

            // Mock de búsqueda con 8 videos (más de 5)
            const mockVideos = [];
            for (let i = 1; i <= 8; i++) {
                mockVideos.push({ id: { videoId: `video${i}` } });
            }
            axios.get.mockResolvedValueOnce({
                data: { items: mockVideos }
            });

            // Mock de estadísticas SOLO PARA LOS PRIMEROS 5 videos (ya que ids.slice(0, 5))
            const mockStats = [];
            for (let i = 1; i <= 5; i++) {  // Solo los primeros 5
                mockStats.push({
                    id: `video${i}`,
                    snippet: {
                        title: `Video ${i}`,
                        publishedAt: `2024-01-0${i}T00:00:00Z`,
                        channelTitle: 'Test Channel'
                    },
                    statistics: {
                        viewCount: `${i * 100}`,
                        likeCount: `${i * 10}`,
                        dislikeCount: `${i * 2}`,
                        commentCount: `${i * 5}`
                    },
                    status: { license: 'youtube' }
                });
            }
            axios.get.mockResolvedValueOnce({
                data: { items: mockStats }
            });

            // Mock de analytics fallido para cada video - SOLO PARA LOS PRIMEROS 5
            for (let i = 1; i <= 5; i++) {
                axios.get.mockRejectedValueOnce(new Error('Analytics not available'));
            }

            await mostrarEstadisticasPublicaciones(req, res, next);

            const renderCall = res.render.mock.calls[0][1];
            const publicaciones = renderCall.publicaciones;

            // Verificar que solo se procesan las primeras 5 publicaciones
            expect(publicaciones).toHaveLength(5);
            expect(renderCall.totalPublicaciones).toBe(5);

            // Verificar que son los primeros 5 videos
            expect(publicaciones[0].id).toBe('video1');
            expect(publicaciones[1].id).toBe('video2');
            expect(publicaciones[2].id).toBe('video3');
            expect(publicaciones[3].id).toBe('video4');
            expect(publicaciones[4].id).toBe('video5');

            // Verificar estadísticas de los primeros 5
            expect(publicaciones[0].vistas).toBe(100); // video1: 1 * 100
            expect(publicaciones[0].meGusta).toBe(10); // video1: 1 * 10
            expect(publicaciones[0].noMeGusta).toBe(2); // video1: 1 * 2
            expect(publicaciones[0].comentarios).toBe(5); // video1: 1 * 5

            expect(publicaciones[4].vistas).toBe(500); // video5: 5 * 100
            expect(publicaciones[4].meGusta).toBe(50); // video5: 5 * 10
            expect(publicaciones[4].noMeGusta).toBe(10); // video5: 5 * 2
            expect(publicaciones[4].comentarios).toBe(25); // video5: 5 * 5
        });
    });

    describe('Validación de sesión y autenticación', () => {
        test('debe redirigir si el usuario no está logueado', async () => {
            req.session.isLoggedIn = false;

            await mostrarEstadisticasPublicaciones(req, res, next);

            expect(res.redirect).toHaveBeenCalledWith('/usuario/inicio-sesion');
        });

        test('debe redirigir si no hay correo en la sesión', async () => {
            req.session.isLoggedIn = true;
            delete req.session.correo;

            await mostrarEstadisticasPublicaciones(req, res, next);

            expect(res.redirect).toHaveBeenCalledWith('/usuario/inicio-sesion');
        });

        test('debe manejar usuarios sin vinculación de YouTube', async () => {
            req.session.isLoggedIn = true;
            req.session.correo = 'test@example.com';

            // Mock de consulta que retorna null
            db.query.mockResolvedValueOnce([]);

            await mostrarEstadisticasPublicaciones(req, res, next);

            expect(res.render).toHaveBeenCalledWith('estadisticas-publicaciones', expect.objectContaining({
                publicaciones: [],
                totalPublicaciones: 0,
                error: 'No tienes YouTube vinculado'
            }));
        });

        test('debe manejar tokens expirados sin refresh token', async () => {
            req.session.isLoggedIn = true;
            req.session.correo = 'test@example.com';

            // Mock de token expirado sin refresh token
            db.query.mockResolvedValueOnce([{
                access_token: 'expired_token',
                refresh_token: null,
                expires_at: new Date(Date.now() - 3600000) // Expirado
            }]);

            await mostrarEstadisticasPublicaciones(req, res, next);

            expect(res.render).toHaveBeenCalledWith('estadisticas-publicaciones', expect.objectContaining({
                publicaciones: [],
                totalPublicaciones: 0,
                error: 'Tu vinculacion de YouTube ha expirado. Vuelve a vincular tu cuenta.'
            }));
        });
    });
});