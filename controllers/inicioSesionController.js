const bcrypt = require('bcrypt');
const db = require('../utils/middleware-bd');

const mostrarInicioSesion = (req, res) => {
    res.render('inicio-sesion');
};

const validarSesion = async (req, res, next) => {
    try {
        const { correo, password } = req.body;
        const correoNormalizado = (correo || '').trim().toLowerCase();

        if (!correoNormalizado || !password) {
            return res.status(400).json({ ok: false, error: 'Introduce correo y contraseña' });
        }

        const resultado = await db.query('SELECT * FROM usuario WHERE correo = @p0', [correoNormalizado]);
        const filas = resultado.recordset || resultado;

        if (filas.length === 0) {
            return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
        }

        const usuario = filas[0];
        const esValida = await bcrypt.compare(password, usuario.contraseña);

        if (!esValida) {
            return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
        }

        req.session.usuarioId = usuario.id_usuario || usuario.id || null;
        req.session.correo = usuario.correo;
        req.session.isLoggedIn = true;

        req.session.save((err) => {
            if (err) {
                console.error('Error al guardar la sesión:', err);
                return res.status(500).json({ ok: false, error: 'Error al procesar la sesión' });
            }
            res.json({ ok: true, mensaje: '¡Bienvenido a NexusHub!' });
        });

    } catch (err) {
        console.error('Error en el login:', err);
        return next(err);
    }
};

const logout = (req, res, next) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
            return res.redirect('/bienvenida');
        }
        res.clearCookie('connect.sid');
        res.redirect('/bienvenida');
    });
};

const mostrarInicioUsuario = (req, res) => {
    if (!req.session.usuarioId || !req.session.correo) {
        return res.redirect('/usuario/inicio-sesion');
    }

    const nombreExtraido = req.session.correo.split('@')[0];

    res.render('inicio-usuario', {
        isLoggedIn: true,
        user: nombreExtraido
    });
};

module.exports = {
    mostrarInicioSesion,
    validarSesion,
    logout,
    mostrarInicioUsuario
};
