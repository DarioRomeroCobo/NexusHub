const path = require('path');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../utils/middleware-bd');
const pool = require('../connection');
const routerUsuarios = require('../routers/router_usuario');

describe('Integracion bottom-up vincular YouTube', () => {
    let app;
    const correosCreados = new Set();

    jest.setTimeout(30000);

    const generarCorreoUnico = () => {
        const unico = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        return `it_yt_${unico}@nexushub.test`;
    };

    const borrarUsuarioPorCorreo = async (correo) => {
        if (!correo) return;
        await db.query('DELETE FROM usuario WHERE correo = @p0', [correo]);
    };

    const crearUsuario = async (correo, passwordPlano) => {
        const hash = await bcrypt.hash(passwordPlano, 10);
        await db.query(
            'INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)',
            [correo, hash]
        );
        correosCreados.add(correo);
    };

    // ──────────────────────────────────────────────────────────────────────────
    // Configuración de la app de test (misma que en los otros ficheros de integración)
    // ──────────────────────────────────────────────────────────────────────────
    beforeAll(() => {
        app = express();
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '..', 'views'));
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(session({
            secret: 'test_yt_secret',
            resave: false,
            saveUninitialized: false,
            cookie: { secure: false }
        }));
        app.use((req, res, next) => {
            res.locals.user      = req.session.usuarioId  || null;
            res.locals.correo    = req.session.correo     || null;
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
        } catch (_) {
            // Si el pool ya fue cerrado por otra suite, lo ignoramos
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Tests
    // ──────────────────────────────────────────────────────────────────────────

    test('GET /usuario/vincular-youtube redirige al inicio de sesión cuando el usuario no está autenticado', async () => {
        const response = await request(app).get('/usuario/vincular-youtube');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/usuario/inicio-sesion');
    });

    test('GET /usuario/vincular-youtube responde con HTML cuando el usuario está autenticado', async () => {
        const correo = generarCorreoUnico();
        await crearUsuario(correo, 'Valida@123');

        const agent = request.agent(app);
        const loginResponse = await agent
            .post('/usuario/api/login')
            .send({ correo, password: 'Valida@123' });
        expect(loginResponse.status).toBe(200);

        const response = await agent.get('/usuario/vincular-youtube');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/html/);
    });

    test('GET /usuario/vincular-youtube muestra el contenido de YouTube con sesión activa', async () => {
        const correo = generarCorreoUnico();
        await crearUsuario(correo, 'Valida@123');

        const agent = request.agent(app);
        const loginResponse = await agent
            .post('/usuario/api/login')
            .send({ correo, password: 'Valida@123' });
        expect(loginResponse.status).toBe(200);

        const response = await agent.get('/usuario/vincular-youtube');

        expect(response.text).toMatch(/Vincular cuenta de YouTube/i);
        expect(response.text).toMatch(/Conectar con YouTube/i);
    });

    test('GET /usuario/vincular-youtube no es accesible sin autenticación', async () => {
        const response = await request(app).get('/usuario/vincular-youtube');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/usuario/inicio-sesion');
    });

    test('GET /usuario/vincular-youtube devuelve HTML válido con sesión activa', async () => {
        const correo = generarCorreoUnico();
        await crearUsuario(correo, 'Valida@123');

        const agent = request.agent(app);
        const loginResponse = await agent
            .post('/usuario/api/login')
            .send({ correo, password: 'Valida@123' });
        expect(loginResponse.status).toBe(200);

        const response = await agent.get('/usuario/vincular-youtube');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Vincular cuenta de YouTube');
    });
});
