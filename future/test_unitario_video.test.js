/*const mockAzureBlob = {
    uploadBlob: jest.fn(),
    getBlobUrl: jest.fn(),
    deleteBlob: jest.fn()
};

jest.mock('../utils/azure-blob', () => {
    return jest.fn().mockImplementation(() => mockAzureBlob);
});

jest.mock('../utils/middleware-bd', () => ({
    query: jest.fn()
}));

const { cargarVideo } = require('../controllers/videoController');
const db = require('../utils/middleware-bd');

describe('Pruebas Unitarias - Subida de Video', () => {
    let req, res, next;

    beforeEach(() => {
        // Reset mocks
        mockAzureBlob.uploadBlob.mockReset();
        mockAzureBlob.getBlobUrl.mockReset();
        mockAzureBlob.deleteBlob.mockReset();
        db.query.mockReset();

        // Mock de request
        req = {
            session: {
                isLoggedIn: true,
                usuarioId: 1,
                correo: 'test@example.com'
            },
            body: {
                duracion_segundos: '120'
            },
            file: {
                originalname: 'test.mp4',
                mimetype: 'video/mp4',
                size: 1000000, // 1MB
                buffer: Buffer.from('fake video data')
            }
        };

        // Mock de response
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        // Mock de next
        next = jest.fn();
    });

    test('Debe subir video exitosamente', async () => {
        // Arrange
        mockAzureBlob.uploadBlob.mockResolvedValue({ success: true });
        mockAzureBlob.getBlobUrl.mockReturnValue('https://azure.com/video.mp4');
        db.query.mockResolvedValue([]); // No duplicate name

        // Act
        await cargarVideo(req, res, next);

        // Assert
        expect(res.json).toHaveBeenCalledWith({
            ok: true,
            mensaje: 'Video cargado correctamente',
            url: 'https://azure.com/video.mp4',
            blobName: expect.stringContaining('videos/1/')
        });
        expect(mockAzureBlob.uploadBlob).toHaveBeenCalled();
        expect(db.query).toHaveBeenCalledTimes(2); // Check duplicate and insert
    });

    test('Debe rechazar si no hay sesión activa', async () => {
        // Arrange
        req.session.isLoggedIn = false;

        // Act
        await cargarVideo(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'Debes iniciar sesión para subir videos'
        });
    });

    test('Debe rechazar si no hay archivo', async () => {
        // Arrange
        req.file = null;

        // Act
        await cargarVideo(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'No se subió ningún archivo'
        });
    });

    test('Debe rechazar duración inválida', async () => {
        // Arrange
        req.body.duracion_segundos = 'invalid';

        // Act
        await cargarVideo(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'Duración de video no válida'
        });
    });

    test('Debe rechazar formato no permitido', async () => {
        // Arrange
        req.file.mimetype = 'text/plain';

        // Act
        await cargarVideo(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'Solo se permiten videos (mp4, mov)'
        });
    });

    test('Debe rechazar archivo demasiado grande', async () => {
        // Arrange
        req.file.size = 600 * 1024 * 1024; // 600MB

        // Act
        await cargarVideo(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'El video no puede exceder 500 MB'
        });
    });

    test('Debe rechazar nombre de video duplicado', async () => {
        // Arrange
        db.query.mockResolvedValue([{ nombre_video: 'test.mp4' }]); // Duplicate found

        // Act
        await cargarVideo(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'Ya tienes un video con ese nombre'
        });
    });

    test('Debe manejar error en subida a Azure', async () => {
        // Arrange
        mockAzureBlob.uploadBlob.mockRejectedValue(new Error('Azure error'));
        db.query.mockResolvedValue([]); // No duplicate

        // Act
        await cargarVideo(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'Error interno del servidor'
        });
    });

    test('Debe manejar URL demasiado larga', async () => {
        // Arrange
        mockAzureBlob.uploadBlob.mockResolvedValue({ success: true });
        mockAzureBlob.getBlobUrl.mockReturnValue('a'.repeat(300)); // URL too long
        db.query.mockResolvedValue([]); // No duplicate

        // Act
        await cargarVideo(req, res, next);

        // Assert
        expect(mockAzureBlob.deleteBlob).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'La URL del video supera el máximo permitido de 255 caracteres'
        });
    });
});*/