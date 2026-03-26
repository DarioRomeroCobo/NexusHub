jest.mock('../utils/middleware-bd', () => ({
    query: jest.fn()
}));

jest.mock('bcrypt', () => ({
    compare: jest.fn()
}));

const bcrypt = require('bcrypt');
const db = require('../utils/middleware-bd');
const { mostrarInicioSesion, validarSesion } = require('../controllers/inicioSesionController');

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.render = jest.fn().mockReturnValue(res);
    return res;
};

const mockReq = (body = {}) => ({
    body,
    session: {
        save: jest.fn()
    }
});

const mockNext = () => jest.fn();

let consoleErrorSpy;

beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    if (consoleErrorSpy) {
        consoleErrorSpy.mockRestore();
    }
});

describe('mostrarInicioSesion', () => {
    test('renderiza el formulario de inicio de sesión', () => {
        const req = mockReq();
        const res = mockRes();
        mostrarInicioSesion(req, res);
        expect(res.render).toHaveBeenCalledWith('inicio-sesion');
    });
});

describe('validarSesion - validaciones básicas', () => {
    test('si faltan correo o contraseña devuelve error 400', async () => {
        const req = mockReq({ correo: '', password: '' });
        const res = mockRes();
        const next = mockNext();

        await validarSesion(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Introduce correo y contraseña' });
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si solo falta el correo devuelve error 400', async () => {
        const req = mockReq({ correo: '', password: 'Password@123' });
        const res = mockRes();
        const next = mockNext();

        await validarSesion(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Introduce correo y contraseña' });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('si solo falta la contraseña devuelve error 400', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: '' });
        const res = mockRes();
        const next = mockNext();

        await validarSesion(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Introduce correo y contraseña' });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('normaliza el correo (espacios y minúsculas)', async () => {
        const req = mockReq({ correo: '  TEST@CORREO.COM  ', password: 'Password@123' });
        const res = mockRes();
        const next = mockNext();

        db.query.mockResolvedValueOnce([]);

        await validarSesion(req, res, next);

        expect(db.query).toHaveBeenCalledWith('SELECT * FROM usuario WHERE correo = @p0', ['test@correo.com']);
    });
});

describe('validarSesion - usuario no encontrado', () => {
    test('si el usuario no existe en BD devuelve error 401', async () => {
        const req = mockReq({ correo: 'noexiste@correo.com', password: 'Password@123' });
        const res = mockRes();
        const next = mockNext();

        db.query.mockResolvedValueOnce([]);

        await validarSesion(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Usuario o contraseña incorrectos' });
        expect(bcrypt.compare).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si el usuario no existe (recordset vacío) devuelve error 401', async () => {
        const req = mockReq({ correo: 'noexiste@correo.com', password: 'Password@123' });
        const res = mockRes();
        const next = mockNext();

        db.query.mockResolvedValueOnce({ recordset: [] });

        await validarSesion(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Usuario o contraseña incorrectos' });
    });
});

describe('validarSesion - contraseña incorrecta', () => {
    test('si la contraseña no coincide devuelve error 401', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'PasswordIncorrecto@123' });
        const res = mockRes();
        const next = mockNext();

        db.query.mockResolvedValueOnce([{
            id_usuario: 1,
            correo: 'test@correo.com',
            contraseña: 'hash_correcto'
        }]);
        bcrypt.compare.mockResolvedValueOnce(false);

        await validarSesion(req, res, next);

        expect(bcrypt.compare).toHaveBeenCalledWith('PasswordIncorrecto@123', 'hash_correcto');
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Usuario o contraseña incorrectos' });
        expect(next).not.toHaveBeenCalled();
    });
});

describe('validarSesion - login exitoso', () => {
    test('si las credenciales son válidas guarda la sesión y devuelve ok', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Password@123' });
        const res = mockRes();
        const next = mockNext();

        db.query.mockResolvedValueOnce([{
            id_usuario: 1,
            correo: 'test@correo.com',
            contraseña: 'hash_correcto'
        }]);
        bcrypt.compare.mockResolvedValueOnce(true);
        req.session.save.mockImplementation((callback) => callback(null));

        await validarSesion(req, res, next);

        expect(req.session.usuarioId).toBe(1);
        expect(req.session.correo).toBe('test@correo.com');
        expect(req.session.isLoggedIn).toBe(true);
        expect(req.session.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ ok: true, mensaje: '¡Bienvenido a NexusHub!' });
        expect(next).not.toHaveBeenCalled();
    });

    test('guarda el id_usuario cuando existe ese campo', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Password@123' });
        const res = mockRes();
        const next = mockNext();

        const usuario = {
            id_usuario: 42,
            correo: 'test@correo.com',
            contraseña: 'hash_correcto'
        };

        db.query.mockResolvedValueOnce([usuario]);
        bcrypt.compare.mockResolvedValueOnce(true);
        req.session.save.mockImplementation((callback) => callback(null));

        await validarSesion(req, res, next);

        expect(req.session.usuarioId).toBe(42);
    });

    test('guarda el id como fallback si id_usuario no existe', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Password@123' });
        const res = mockRes();
        const next = mockNext();

        const usuario = {
            id: 99,
            correo: 'test@correo.com',
            contraseña: 'hash_correcto'
        };

        db.query.mockResolvedValueOnce([usuario]);
        bcrypt.compare.mockResolvedValueOnce(true);
        req.session.save.mockImplementation((callback) => callback(null));

        await validarSesion(req, res, next);

        expect(req.session.usuarioId).toBe(99);
    });
});

describe('validarSesion - errores en sesión', () => {
    test('si hay error al guardar sesión devuelve error 500', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Password@123' });
        const res = mockRes();
        const next = mockNext();

        db.query.mockResolvedValueOnce([{
            id_usuario: 1,
            correo: 'test@correo.com',
            contraseña: 'hash_correcto'
        }]);
        bcrypt.compare.mockResolvedValueOnce(true);
        req.session.save.mockImplementation((callback) => callback(new Error('Error de sesión')));

        await validarSesion(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Error al procesar la sesión' });
    });
});

describe('validarSesion - errores generales', () => {
    test('si ocurre un error inesperado devuelve error 500', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Password@123' });
        const res = mockRes();
        const next = mockNext();

        db.query.mockRejectedValueOnce(new Error('Error de base de datos'));

        await validarSesion(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    test('si bcrypt.compare falla devuelve error 500', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Password@123' });
        const res = mockRes();
        const next = mockNext();

        db.query.mockResolvedValueOnce([{
            id_usuario: 1,
            correo: 'test@correo.com',
            contraseña: 'hash_correcto'
        }]);
        bcrypt.compare.mockRejectedValueOnce(new Error('Error en bcrypt'));

        await validarSesion(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });
});
