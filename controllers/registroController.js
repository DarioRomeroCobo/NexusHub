const bcrypt = require('bcrypt');
const validator = require('validator');
const db = require('../utils/middleware-bd');

const mostrarRegistro = (req, res) => {
    res.render('registro');
};

const registrarUsuario = async (req, res, next) => {
    try {
        const { correo, password, confirm, confirmPassword } = req.body;

        const correoNormalizado = (correo || '').trim().toLowerCase();

        if (!correoNormalizado || !password) {
            return res.status(400).json({ ok: false, error: 'Correo y contraseña son obligatorios' });
        }

        if (!validator.isEmail(correoNormalizado)) {
            return res.status(400).json({ ok: false, error: 'Correo electrónico no válido' });
        }

        if (!validator.isStrongPassword(password, { minLength: 8, minUppercase: 1, minNumbers: 1, minSymbols: 1 })) {
            return res.status(400).json({
                ok: false,
                error: 'La contraseña debe tener al menos 8 caracteres, incluir una mayúscula, un número y un símbolo.'
            });
        }

        const confirmacion = typeof confirmPassword === 'string' ? confirmPassword : confirm;
        if (confirmacion !== password) {
            return res.status(400).json({ ok: false, error: 'Las contraseñas no coinciden' });
        }

        const usuarioExistente = await db.query('SELECT * FROM usuario WHERE correo = @p0', [correoNormalizado]);

        const filas = usuarioExistente.recordset || usuarioExistente;
        if (filas.length > 0) {
            return res.status(409).json({ ok: false, error: 'Ya existe un usuario con ese correo' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)';
        await db.query(sql, [correoNormalizado, passwordHash]);

        const nuevoUsuario = await db.query(
            'SELECT * FROM usuario WHERE correo = @p0',
            [correoNormalizado]
        );

        const usuario = nuevoUsuario.recordset
            ? nuevoUsuario.recordset[0]
            : nuevoUsuario[0];

        req.session.usuarioId = usuario.id_usuario;
        req.session.correo = usuario.correo;
        req.session.isLoggedIn = true;

        req.session.save(err => {
            if (err) {
                console.error(err);
                return res.status(500).json({ ok: false, error: 'Error al guardar sesión' });
            }

            res.json({
                ok: true,
                mensaje: 'Usuario registrado correctamente. Redirigiendo a la pagina de inicio de sesión ...'
            });
        });
    } catch (err) {
        console.error('Error al registrar el usuario:', err);

        if (err.number === 2627 || err.number === 2601 || err.message.includes('UNIQUE KEY')) {
            return res.status(409).json({ ok: false, error: 'Este correo ya está registrado en la base de datos.' });
        }

        return res.status(500).json({ ok: false, error: 'Error interno del servidor al procesar el registro' });
    }
};

module.exports = {
    mostrarRegistro,
    registrarUsuario
};
