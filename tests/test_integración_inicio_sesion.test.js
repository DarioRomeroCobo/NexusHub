const path = require('path');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../utils/middleware-bd');
const pool = require('../connection');
const routerUsuarios = require('../routers/router_usuario');

describe('Integracion bottom-up inicio de sesion', () => {
    let app;
    const correosCreados = new Set();

    jest.setTimeout(30000);

    const generarCorreoUnico = () => {
        const unico = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        return `it_login_${unico}@nexushub.test`;
    };

    const borrarUsuarioPorCorreo = async (correo) => {
        if (!correo) {
            return;
        }
        await db.query('DELETE FROM usuario WHERE correo = @p0', [correo]);
    };

    const crearUsuario = async (correo, passwordPlano) => {
        const hash = await bcrypt.hash(passwordPlano, 10);
        await db.query('INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)', [correo, hash]);
        correosCreados.add(correo);
    };

    beforeAll(() => {
        app = express();
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '..', 'views'));
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(session({
            secret: 'test_login_secret',
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

    test('GET /usuario/inicio-sesion renderiza la vista de login', async () => {
        const response = await request(app).get('/usuario/inicio-sesion');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Iniciar Sesión');
    });

    test('POST /usuario/api/login devuelve 400 cuando faltan datos', async () => {
        const response = await request(app)
            .post('/usuario/api/login')
            .send({ correo: '', password: '' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ ok: false, error: 'Introduce correo y contraseña' });
    });

    test('POST /usuario/api/login devuelve 401 cuando el usuario no existe', async () => {
        const response = await request(app)
            .post('/usuario/api/login')
            .send({ correo: 'noexiste@nexushub.test', password: 'Cualquiera@123' });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos' });
    });

    test('POST /usuario/api/login devuelve 401 cuando la contraseña es incorrecta', async () => {
        const correo = generarCorreoUnico();
        await crearUsuario(correo, 'Valida@123');

        const response = await request(app)
            .post('/usuario/api/login')
            .send({ correo, password: 'Incorrecta@123' });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos' });
    });

    test('POST /usuario/api/login inicia sesion y permite acceder a ruta protegida', async () => {
        const correo = generarCorreoUnico();
        const password = 'Valida@123';
        await crearUsuario(correo, password);

        const agent = request.agent(app);
        const loginResponse = await agent
            .post('/usuario/api/login')
            .send({ correo: `  ${correo.toUpperCase()}  `, password });

        expect(loginResponse.status).toBe(200);
        expect(loginResponse.body).toEqual({ ok: true, mensaje: '¡Bienvenido a NexusHub!' });

        const inicioResponse = await agent.get('/usuario/inicio');
        expect(inicioResponse.status).toBe(200);
        expect(inicioResponse.text).toContain('Bienvenido de nuevo');
    });
});