jest.mock('../utils/middleware-bd', () => ({
    query: jest.fn()
}));

jest.mock('bcrypt', () => ({
    hash: jest.fn()
}));

const bcrypt = require('bcrypt');
const db = require('../utils/middleware-bd');
const { mostrarRegistro, registrarUsuario } = require('../controllers/registroController');

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
        save: jest.fn((callback) => callback(null))
    }
});
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
    test('si faltan correo o contrasena devuelve error 400 y no inserta', async () => {
        const req = mockReq({ correo: '', password: '' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Correo y contraseña son obligatorios' });
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si el correo es invalido devuelve error 400', async () => {
        const req = mockReq({ correo: 'correo-invalido', password: 'Valida@123' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Correo electrónico no válido' });
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });


    test('si la contrasena tiene menos de 8 caracteres devuelve error 400', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Ab1@abc' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres, incluir una mayúscula, un número y un símbolo.' });
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si la contrasena no tiene mayuscula devuelve error 400', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'valida@123' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres, incluir una mayúscula, un número y un símbolo.' });
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si la contrasena no tiene minuscula devuelve error 400', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'VALIDA@123' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres, incluir una mayúscula, un número y un símbolo.' });
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si la contrasena no tiene numero devuelve error 400', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Valida@abc' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres, incluir una mayúscula, un número y un símbolo.' });
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si la contrasena no tiene caracter especial devuelve error 400', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Valida1234' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres, incluir una mayúscula, un número y un símbolo.' });
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si confirmacion llega y no coincide devuelve error 400', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Valida@123', confirm: 'NoCoincide@123' });
        const res = mockRes();
        const next = mockNext();

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Las contraseñas no coinciden' });
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si el correo ya existe devuelve error 409 y no inserta', async () => {
        const req = mockReq({ correo: 'test@correo.com', password: 'Valida@123', confirm: 'Valida@123' });
        const res = mockRes();
        const next = mockNext();

        db.query.mockResolvedValueOnce([{ correo: 'test@correo.com' }]);

        await registrarUsuario(req, res, next);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Ya existe un usuario con ese correo' });
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('registrarUsuario - flujo correcto', () => {
    test('hashea e inserta cuando los datos son validos', async () => {
        const req = mockReq({ correo: '  test@correo.com  ', password: 'Valida@123', confirm: 'Valida@123' });
        const res = mockRes();
        const next = mockNext();

        bcrypt.hash.mockResolvedValue('hash_ok');
        db.query
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce([{ id_usuario: 1, correo: 'test@correo.com' }]);

        await registrarUsuario(req, res, next);

        expect(db.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM usuario WHERE correo = @p0', ['test@correo.com']);
        expect(db.query).toHaveBeenNthCalledWith(2, 'INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)', ['test@correo.com', 'hash_ok']);
        expect(res.json).toHaveBeenCalledWith({ ok: true, mensaje: 'Usuario registrado correctamente. Redirigiendo a la pagina de inicio de sesión ...' });
        expect(next).not.toHaveBeenCalled();
    });
});


