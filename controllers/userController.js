const db = require('../utils/middleware-bd');

const getUsuarios = async (req, res, next) => {
    try {
        const usuariosRaw = await db.query('SELECT * FROM usuario', []);
        const usuarios = usuariosRaw.map((usuario, index) => ({
            numero: index + 1,
            id: usuario.id || usuario.id_usuario || null,
            correo: usuario.correo || usuario.email || 'Sin correo'
        }));

        if (req.query.formato === 'json') {
            return res.json({ ok: true, usuarios });
        }

        res.render('usuarios', {
            usuarios,
            totalUsuarios: usuarios.length
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { getUsuarios };
