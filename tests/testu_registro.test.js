const bycrypt = require('bcrypt');

jest.mock('../utils/middleware-db.js', () => ({ //mockeamos la llamda a la base de datos
    query: jest.fn()
}));

jestlmock('bycrypt', () => ({ //mockeamos la función de encriptación
    hash: jest.fn()
}));

const db = require('../utils/middleware-db.js');

const { mostrarRegistro, registrarUsuario } = require('../controllers/usuarioController');

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    return res;
}

const mockReq = (body = {}) => ({body}) ;

beforeEach(() => {
    jest.clearAllMocks();
});


//Test 1: Mostrar el formulario de registro

describe('mostrarRegistro', () => {
    test('renderiza el formulario de registro', () => {
        const req = mockReq();
        const res = mockRes();
        mostrarRegistro(req, res);
        expect(res.render).toHaveBeenCalledWith('registro');
    });
});

//Test 2: Validacion de campos

describe('validacion de campos en registrarUsuario', () => {
    test('con datos validos', async () => {
        const req = mockReq({ correo: 'test@correo.com', contraseña : 'Segura@123' });
        const res = mockRes();
        const next = mockNext();

        bycrypt.hash.mockResolvedValue('hashedPassword');
        db.query.mockResolvedValue({});

        await registrarUsuario(req, res, next);

        expect(res.json).toHaveBeenCalledWith({ message: 'Usuario registrado exitosamente' });
        expect(next).not.toHaveBeenCalled();
    });

    test('si bcrypt falla por contraseña inválida, propaga el error', async () => {
        const req  = mockReq({ correo: 'test@correo.com', password: undefined });
        const res  = mockRes();
        const next = mockNext();
 
        const error = new Error('data and salt arguments required');
        bcrypt.hash.mockRejectedValue(error);
 
        await registrarUsuario(req, res, next);
 
        expect(next).toHaveBeenCalledWith(error);
        expect(res.json).not.toHaveBeenCalled();
    });
 
    test('la contraseña se hashea antes de guardar, nunca en texto plano', async () => {
        const req  = mockReq({ correo: 'test@correo.com', password: 'Segura@123' });
        const res  = mockRes();
        const next = mockNext();
 
        bcrypt.hash.mockResolvedValue('$2b$10$hashEjemplo');
        db.query.mockResolvedValue({});
 
        await registrarUsuario(req, res, next);
 
        expect(bcrypt.hash).toHaveBeenCalledWith('Segura@123', 10);
    });
});

//Test 3: Respuesta exitosa
 
describe('registrarUsuario - respuesta exitosa', () => {
    test('responde { ok: true } al registrar correctamente', async () => {
        const req  = mockReq({ correo: 'nuevo@correo.com', password: 'Valid@Pass1' });
        const res  = mockRes();
        const next = mockNext();
 
        bcrypt.hash.mockResolvedValue('hash_ok');
        db.query.mockResolvedValue({});
 
        await registrarUsuario(req, res, next);
 
        expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
 
    test('no llama a next() si el registro es exitoso', async () => {
        const req  = mockReq({ correo: 'ok@correo.com', password: 'Strong@1' });
        const res  = mockRes();
        const next = mockNext();
 
        bcrypt.hash.mockResolvedValue('hash_ok');
        db.query.mockResolvedValue({});
 
        await registrarUsuario(req, res, next);
 
        expect(next).not.toHaveBeenCalled();
    });
});
 
//Test 4: Mensajes de error
 
describe('registrarUsuario - manejo de errores', () => {
    test('propaga el error original sin modificarlo', async () => {
        const req  = mockReq({ correo: 'x@x.com', password: 'Pass@1' });
        const res  = mockRes();
        const next = mockNext();
 
        bcrypt.hash.mockResolvedValue('hash');
        const errorOriginal = new Error('Error inesperado');
        db.query.mockRejectedValue(errorOriginal);
 
        await registrarUsuario(req, res, next);
 
        expect(next).toHaveBeenCalledWith(errorOriginal);
        expect(next.mock.calls[0][0].message).toBe('Error inesperado');
    });
 
    test('no envía respuesta al usuario si ocurre un error', async () => {
        const req  = mockReq({ correo: 'x@x.com', password: 'Pass@1' });
        const res  = mockRes();
        const next = mockNext();
 
        bcrypt.hash.mockResolvedValue('hash');
        db.query.mockRejectedValue(new Error('fallo'));
 
        await registrarUsuario(req, res, next);
 
        expect(res.json).not.toHaveBeenCalled();
        expect(res.render).not.toHaveBeenCalled();
    });
});
 