const path = require('path');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const db = require('../utils/middleware-bd');
const pool = require('../connection');
const routerUsuarios = require('../routers/router_usuario');

describe('Integracion bottom-up registro', () => {
    let app;
    const correosCreados = new Set();

    jest.setTimeout(30000);

    const generarCorreoUnico = () => {
        const unico = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        return `it_${unico}@nexushub.test`;
    };

    const borrarUsuarioPorCorreo = async (correo) => {
        if (!correo) {
            return;
        }
        await db.query('DELETE FROM usuario WHERE correo = @p0', [correo]);
    };

    beforeAll(() => {
        app = express();
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '..', 'views'));
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(session({
            secret: 'test_registro_secret',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: false
            }
        }));
        app.use((req, res, next) => {
            res.locals.user = req.session.usuarioId || null;
            res.locals.correo = req.session.correo || null;
            res.locals.isLoggedIn = req.session.isLoggedIn || false;
            next();
        });
        app.use('/usuario', routerUsuarios);

        app.use((err, req, res, next) => {
            res.status(500).json({ ok: false, error: err.message || 'Error inesperado' });
        });
    });

    beforeEach(() => {
        correosCreados.clear();
    });

    afterEach(async () => {
        for (const correo of correosCreados) {
            await borrarUsuarioPorCorreo(correo);
        }
    });

    afterAll(async () => {
        try {
            await pool.close();
        } catch (err) {
            // Si el pool ya estaba cerrado por otro test, ignoramos el error.
        }
    });

    test('GET /usuario/registro renderiza la vista de registro', async () => {
        const response = await request(app).get('/usuario/registro');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Registro');
    });

    test('POST /usuario/api/ devuelve error 400 para datos invalidos y no toca BD', async () => {
        const correoInvalido = 'correo-invalido';

        const response = await request(app)
            .post('/usuario/api/')
            .send({ correo: correoInvalido, password: 'abc' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ ok: false, error: 'Correo electrónico no válido' });

        const usuarios = await db.query('SELECT * FROM usuario WHERE correo = @p0', [correoInvalido]);
        expect(usuarios.length).toBe(0);
    });

    test('POST /usuario/api/ registra correctamente usuario nuevo', async () => {
        const correo = generarCorreoUnico();
        const password = 'Valida@123';
        correosCreados.add(correo);

        const response = await request(app)
            .post('/usuario/api/')
            .send({
                correo,
                password,
                confirm: password
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true });

        const filas = await db.query('SELECT * FROM usuario WHERE correo = @p0', [correo]);
        expect(filas.length).toBe(1);
        expect(filas[0].correo).toBe(correo);
        expect(filas[0]['contraseña']).not.toBe(password);
        expect(filas[0]['contraseña']).toMatch(/^\$2/);
    });

    test('POST /usuario/api/ devuelve error 409 cuando correo ya existe', async () => {
        const correo = generarCorreoUnico();
        const payload = {
            correo,
            password: 'Valida@123',
            confirm: 'Valida@123'
        };
        correosCreados.add(correo);

        const primerRegistro = await request(app)
            .post('/usuario/api/')
            .send(payload);

        expect(primerRegistro.status).toBe(200);

        const response = await request(app)
            .post('/usuario/api/')
            .send(payload);

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ ok: false, error: 'Ya existe un usuario con ese correo' });
    });

    test('POST /usuario/api/ normaliza correo y evita duplicados por mayusculas o espacios', async () => {
        const correoBase = generarCorreoUnico();
        correosCreados.add(correoBase);

        const alta = await request(app)
            .post('/usuario/api/')
            .send({
                correo: correoBase,
                password: 'Valida@123',
                confirm: 'Valida@123'
            });

        expect(alta.status).toBe(200);

        const response = await request(app)
            .post('/usuario/api/')
            .send({
                correo: `  ${correoBase.toUpperCase()}  `,
                password: 'Valida@123',
                confirm: 'Valida@123'
            });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ ok: false, error: 'Ya existe un usuario con ese correo' });
    });
});
