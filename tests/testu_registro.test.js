jest.mock('../utils/middleware-bd', () => ({
    query: jest.fn()
}));

jest.mock('bcrypt', () => ({
    hash: jest.fn()
}));

const bcrypt = require('bcrypt');
const db = require('../utils/middleware-bd');
const { mostrarRegistro, registrarUsuario } = require('../controllers/usuarioController');

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.render = jest.fn().mockReturnValue(res);
    return res;
};

const mockReq = (body = {}) => ({ body });
const mockNext = () => jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
});

describe('mostrarRegistro', () => {
    test('renderiza el formulario de registro', () => {
        const req = mockReq();
        const res = mockRes();

        mostrarRegistro(req, res);

        expect(res.render).toHaveBeenCalledWith('registro');
    });
});

describe('registrarUsuario - validaciones del servidor', () => {
    test('si faltan correo o contrasena devuelve 400 y no inserta', async () => {
        const req = mockReq({ correo: '', password: '' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Correo y contrasena son obligatorios' });
        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si el correo es invalido devuelve 400', async () => {
        const req = mockReq({ correo: 'correo-invalido', password: 'Valida@123' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Correo electronico no valido' });
        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si la contrasena no cumple requisitos devuelve 400', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'abc12345' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'La contrasena no cumple los requisitos de seguridad' });
        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si confirmacion llega y no coincide devuelve 400', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Valida@123', confirm: 'NoCoincide@123' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Las contrasenas no coinciden' });
        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
});

describe('registrarUsuario - flujo correcto', () => {
    test('hashea e inserta cuando los datos son validos', async () => {
        const req = mockReq({ correo: '  test@correo.com  ', password: 'Valida@123', confirm: 'Valida@123' });
        const res = mockRes();
        const next = mockNext();

        bcrypt.hash.mockResolvedValue('hash_ok');
        db.query.mockResolvedValue({});

        await registrarUsuario(req, res, next);

        expect(bcrypt.hash).toHaveBeenCalledWith('Valida@123', 10);
        expect(db.query).toHaveBeenCalledWith('INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)', ['test@correo.com', 'hash_ok']);
        expect(res.json).toHaveBeenCalledWith({ ok: true, mensaje: 'Usuario registrado correctamente' });
        expect(next).not.toHaveBeenCalled();
    });
});

describe('registrarUsuario - manejo de errores internos', () => {
    test('si bcrypt falla, propaga el error con next', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Valida@123' });
        const res = mockRes();
        const next = mockNext();
        const error = new Error('fallo bcrypt');

        bcrypt.hash.mockRejectedValue(error);

        await registrarUsuario(req, res, next);

        expect(next).toHaveBeenCalledWith(error);
        expect(res.json).not.toHaveBeenCalledWith({ ok: true, mensaje: 'Usuario registrado correctamente' });
    });

    test('si la bd falla, propaga el error con next', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Valida@123' });
        const res = mockRes();
        const next = mockNext();
        const error = new Error('fallo bd');

        bcrypt.hash.mockResolvedValue('hash_ok');
        db.query.mockRejectedValue(error);

        await registrarUsuario(req, res, next);

        expect(next).toHaveBeenCalledWith(error);
        expect(res.json).not.toHaveBeenCalledWith({ ok: true, mensaje: 'Usuario registrado correctamente' });
    });
});
