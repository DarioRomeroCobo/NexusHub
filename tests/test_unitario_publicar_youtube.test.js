const db = require('../utils/middleware-bd');
const videoController = require('../controllers/videoController');

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

describe('NH11 - Pruebas de Flujo de Publicación', () => {
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

    // TEST DE LA GALERÍA (El código EJS que acabas de pasar)
    test('mostrarGaleriaPublicar: Debe cargar los videos del usuario correctamente', async () => {
        req = { session: { correo: 'pablo@test.com' } };
        
        // Simulamos lo que devuelve SQL Server
        db.query.mockResolvedValue([
            { 
                nombre_video: 'clase_software.mp4', 
                url_video: 'https://azure.com/v1.mp4',
                peso_bytes: 1024 * 1024,
                duracion_segundos: 30,
                fecha_subida: new Date()
            }
        ]);

        await videoController.mostrarGaleriaPublicar(req, res, next);

        // Verificamos que se renderiza la vista de la galería con los datos procesados
        expect(res.render).toHaveBeenCalledWith('publicar-video', expect.objectContaining({
            totalVideos: 1
        }));
    });

    // TEST DE LA REDIRECCIÓN AL FORMULARIO
    test('mostrarPublicacionVideo: Debe redirigir si no hay URL de video', async () => {
        req = { query: {} }; // Sin videoUrl
        await videoController.mostrarPublicacionVideo(req, res, next);
        expect(res.redirect).toHaveBeenCalledWith('/usuario/publicar-video');
    });

    // TEST DE SEGURIDAD
    test('cargarVideo: No debe permitir subir si no hay sesión activa', async () => {
        req = { session: { isLoggedIn: false }, file: {} };
        await videoController.cargarVideo(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: 'Debes iniciar sesión para subir videos'
        }));
    });
});