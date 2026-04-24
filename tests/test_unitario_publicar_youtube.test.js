const db = require('../utils/middleware-bd');
const youtubeController = require('../controllers/youtubeController');

// Mock de la base de datos
jest.mock('../utils/middleware-bd', () => ({
    query: jest.fn()
}));

// Mock de Azure (para evitar errores de conexión real)
jest.mock('../utils/azure-blob', () => {
    return jest.fn().mockImplementation(() => ({
        getBlobSasUrl: jest.fn().mockResolvedValue('https://sas-url-falsa.com')
    }));
});

// Mock de axios para simular llamadas HTTP
jest.mock('axios');
const axios = require('axios');

// Mock de crypto para randomBytes
jest.mock('crypto', () => ({
    randomBytes: jest.fn().mockReturnValue({
        toString: jest.fn().mockReturnValue('fake-state')
    })
}));

describe('NH11 - Pruebas Unitarias de Publicación en YouTube', () => {
    let req, res, next;

    beforeEach(() => {
        jest.clearAllMocks();
        res = {
            render: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            redirect: jest.fn()
        };
        next = jest.fn();
    });

    describe('subirVideoYoutube', () => {
        beforeEach(() => {
            req = {
                session: {
                    isLoggedIn: true,
                    correo: 'test@example.com',
                    save: jest.fn().mockImplementation((cb) => cb())
                },
                body: {
                    videoUrl: 'https://azure.com/test.mp4',
                    titulo: 'Título de prueba',
                    descripcion: 'Descripción de prueba',
                    privacyStatus: 'private',
                    tags: 'tag1,tag2'
                }
            };
        });

        test('Debe redirigir si no hay sesión activa', async () => {
            req.session.isLoggedIn = false;
            await youtubeController.subirVideoYoutube(req, res, next);
            expect(res.redirect).toHaveBeenCalledWith('/usuario/inicio-sesion');
            expect(req.session.mensajeError).toBe('Debes iniciar sesión para continuar');
        });

        test('Debe redirigir si videoUrl está vacío', async () => {
            req.body.videoUrl = '';
            await youtubeController.subirVideoYoutube(req, res, next);
            expect(res.redirect).toHaveBeenCalledWith('/usuario/bienvenida');
            expect(req.session.mensajeError).toBe('videoUrl es obligatorio');
        });

        test('Debe redirigir si privacyStatus no es válido', async () => {
            req.body.privacyStatus = 'invalid';
            await youtubeController.subirVideoYoutube(req, res, next);
            expect(res.redirect).toHaveBeenCalledWith('/usuario/bienvenida');
            expect(req.session.mensajeError).toBe('privacyStatus no válido');
        });

        test('Debe redirigir si no se encuentra el video en la base de datos', async () => {
            db.query.mockImplementation((query, params) => {
                if (query.includes('SELECT access_token')) {
                    return Promise.resolve([{ access_token: 'fake-token', refresh_token: 'refresh', expires_at: new Date(Date.now() + 3600000) }]);
                }
                if (query.includes('SELECT nombre_video')) {
                    return Promise.resolve([]);
                }
                return Promise.resolve([]);
            });
            await youtubeController.subirVideoYoutube(req, res, next);
            expect(res.redirect).toHaveBeenCalledWith('/usuario/bienvenida');
            expect(req.session.mensajeError).toBe('No se encontró el video solicitado');
        });

        test('Debe redirigir si hay error en el token de YouTube', async () => {
            db.query.mockImplementation((query, params) => {
                if (query.includes('SELECT access_token')) {
                    return Promise.resolve([{ access_token: 'fake-token', refresh_token: null, expires_at: new Date(Date.now() - 3600000) }]);
                }
                return Promise.resolve([]);
            });
            await youtubeController.subirVideoYoutube(req, res, next);
            expect(res.redirect).toHaveBeenCalledWith('/usuario/bienvenida');
            expect(req.session.mensajeError).toBe('Tu vinculacion de YouTube ha expirado. Vuelve a vincular tu cuenta.');
        });

        test('Debe subir el video correctamente a YouTube', async () => {
            db.query.mockImplementation((query, params) => {
                if (query.includes('SELECT access_token')) {
                    return Promise.resolve([{ access_token: 'fake-token', refresh_token: 'refresh', expires_at: new Date(Date.now() + 3600000) }]);
                }
                if (query.includes('SELECT nombre_video')) {
                    return Promise.resolve([{ nombre_video: 'test.mp4', url_video: 'https://azure.com/test.mp4' }]);
                }
                return Promise.resolve([]);
            });
            axios.get.mockResolvedValue({ data: Buffer.from('fake-video-data') });
            axios.post.mockResolvedValue({ data: { id: 'youtube-video-id' } });

            await youtubeController.subirVideoYoutube(req, res, next);

            expect(axios.get).toHaveBeenCalledWith('https://sas-url-falsa.com', expect.any(Object));
            expect(axios.post).toHaveBeenCalledWith(
                'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status',
                expect.any(Object),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer fake-token'
                    })
                })
            );
            expect(res.redirect).toHaveBeenCalledWith('/');
            expect(req.session.mensajeExito).toBe('Video subido a YouTube correctamente');
        });

        test('Debe usar título y descripción del formulario', async () => {
            req.body.titulo = 'Título personalizado';
            req.body.descripcion = 'Descripción personalizada';
            db.query.mockImplementation((query, params) => {
                if (query.includes('SELECT access_token')) {
                    return Promise.resolve([{ access_token: 'fake-token', refresh_token: 'refresh', expires_at: new Date(Date.now() + 3600000) }]);
                }
                if (query.includes('SELECT nombre_video')) {
                    return Promise.resolve([{ nombre_video: 'test.mp4', url_video: 'https://azure.com/test.mp4' }]);
                }
                return Promise.resolve([]);
            });
            axios.get.mockResolvedValue({ data: Buffer.from('fake-video-data') });
            axios.post.mockResolvedValue({ data: { id: 'youtube-video-id' } });

            await youtubeController.subirVideoYoutube(req, res, next);

            expect(axios.post).toHaveBeenCalled();
        });
    });
});