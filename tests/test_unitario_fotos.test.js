const mockAzureBlob = {
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

const { cargarFoto } = require('../controllers/archivoController');
const db = require('../utils/middleware-bd');

describe('Pruebas Unitarias - Subida de Foto', () => {
    let req, res, next;

    beforeEach(() => {
        mockAzureBlob.uploadBlob.mockReset();
        mockAzureBlob.getBlobUrl.mockReset();
        mockAzureBlob.deleteBlob.mockReset();
        db.query.mockReset();

        req = {
            session: {
                isLoggedIn: true,
                usuarioId: 1,
                correo: 'test@example.com'
            },
            file: {
                originalname: 'contenido.jpg',
                mimetype: 'image/jpeg',
                size: 1024 * 1024 * 5, // 5 MB
                buffer: Buffer.from('fake image data')
            }
        };

        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        next = jest.fn();
    });

    test('debe subir foto correctamente cuando es jpg y menor a 50MB', async () => {
        mockAzureBlob.uploadBlob.mockResolvedValue({ success: true });
        mockAzureBlob.getBlobUrl.mockReturnValue('https://azure.com/contenido.jpg');
        db.query.mockResolvedValue([]);

        await cargarFoto(req, res, next);

        expect(mockAzureBlob.uploadBlob).toHaveBeenCalledWith(
            'fotos',
            expect.stringContaining('fotos/1/'),
            req.file.buffer
        );
        expect(mockAzureBlob.getBlobUrl).toHaveBeenCalledWith('fotos', expect.any(String));
        expect(db.query).toHaveBeenCalledTimes(2);
        expect(res.json).toHaveBeenCalledWith({
            ok: true,
            mensaje: 'Foto cargada correctamente',
            url: 'https://azure.com/contenido.jpg',
            blobName: expect.stringContaining('fotos/1/')
        });
    });

    test('debe rechazar formato no permitido y devolver mensaje de error', async () => {
        req.file.originalname = 'contenido.gif';
        req.file.mimetype = 'image/gif';

        await cargarFoto(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'Solo se permiten fotos (jpg, jpeg, png)'
        });
        expect(mockAzureBlob.uploadBlob).not.toHaveBeenCalled();
    });

    test('debe rechazar foto mayor a 50MB y devolver mensaje de error', async () => {
        req.file.size = 51 * 1024 * 1024;

        await cargarFoto(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'La foto no puede exceder 50 MB'
        });
        expect(mockAzureBlob.uploadBlob).not.toHaveBeenCalled();
    });

    test('debe rechazar si no hay sesión activa', async () => {
        req.session.isLoggedIn = false;

        await cargarFoto(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'Debes iniciar sesión para subir fotos'
        });
        expect(mockAzureBlob.uploadBlob).not.toHaveBeenCalled();
    });

    test('debe rechazar nombre de foto duplicado', async () => {
        db.query.mockResolvedValue([{ nombre_foto: 'contenido.jpg' }]);

        await cargarFoto(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'Ya tienes una foto con ese nombre'
        });
        expect(mockAzureBlob.uploadBlob).not.toHaveBeenCalled();
    });

    test('debe manejar error de subida a Azure y devolver error interno', async () => {
        mockAzureBlob.uploadBlob.mockRejectedValue(new Error('Azure error'));
        db.query.mockResolvedValue([]);

        await cargarFoto(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'Error interno del servidor'
        });
    });
});
