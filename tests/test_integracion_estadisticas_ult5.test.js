const estadisticasController = require('../controllers/estadisticasController');
const db = require('../utils/middleware-bd');
const axios = require('axios');

// Mocks de dependencias
jest.mock('../utils/middleware-bd', () => ({
    query: jest.fn()
}));
jest.mock('axios');

describe('🧪 TEST INTEGRACIÓN: Estadísticas de Publicaciones (Lógica)', () => {
    let req, res, next;

    beforeEach(() => {
        jest.clearAllMocks();
        // Simulamos el objeto request de Express con la sesión
        req = {
            session: {
                isLoggedIn: true,
                correo: 'pablo@nexus.com'
            }
        };
        // Simulamos el objeto response y sus métodos
        res = {
            render: jest.fn(),
            redirect: jest.fn()
        };
        next = jest.fn();
    });

    it('NH-99: Debe redirigir al login si no hay sesión activa', async () => {
        req.session.isLoggedIn = false;
        
        await estadisticasController.mostrarEstadisticasPublicaciones(req, res, next);
        
        expect(res.redirect).toHaveBeenCalledWith('/usuario/inicio-sesion');
    });

    it('NH-104/105: Debe renderizar las estadísticas si hay datos en YouTube', async () => {
        // 1. Mock de la BD: Usuario vinculado
        db.query.mockResolvedValue([{
            access_token: 'token_ok',
            expires_at: new Date(Date.now() + 100000)
        }]);

        // 2. Mock de Axios: Respuesta de YouTube con 1 video de prueba
        axios.get.mockImplementation((url) => {
            if (url.includes('v3/search')) {
                return Promise.resolve({ data: { items: [{ id: { videoId: 'video123' } }] } });
            }
            if (url.includes('v3/videos')) {
                return Promise.resolve({ 
                    data: { 
                        items: [{ 
                            id: 'video123',
                            snippet: { title: 'Video Integracion', channelTitle: 'NexusChannel' },
                            statistics: { viewCount: '500', likeCount: '50', commentCount: '10' }
                        }] 
                    } 
                });
            }
            return Promise.resolve({ data: { rows: [] } }); // Analytics vacío
        });

        await estadisticasController.mostrarEstadisticasPublicaciones(req, res, next);

        // Verificamos que se llamó a render con los datos que Eric espera
        expect(res.render).toHaveBeenCalledWith('estadisticas-publicaciones', expect.objectContaining({
            totalPublicaciones: 1,
            canal: 'NexusChannel'
        }));

        // Verificamos que los datos numéricos (NH-104/105) están en el objeto enviado a la vista
        const renderData = res.render.mock.calls[0][1];
        expect(renderData.publicaciones[0].vistas).toBe(500);
        expect(renderData.publicaciones[0].meGusta).toBe(50);
    });

    it('NH-118: Debe mostrar mensaje de error si el token de YouTube ha expirado', async () => {
        // 1. Simulamos que la BD dice que el usuario NO tiene token o ha fallado
        db.query.mockResolvedValue([]); // Array vacío = No hay vinculación

        await estadisticasController.mostrarEstadisticasPublicaciones(req, res, next);

        // 2. Verificamos que Eric renderiza la vista pero con el error correspondiente
        expect(res.render).toHaveBeenCalledWith('estadisticas-publicaciones', expect.objectContaining({
            publicaciones: [],
            error: 'No tienes YouTube vinculado' 
        }));
    });
});