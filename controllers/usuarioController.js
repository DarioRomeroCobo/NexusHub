const bcrypt = require('bcrypt');
const db = require("../utils/middleware-bd");

const mostrarRegistro = (req, res) => {
    res.render("registro");
};

const getUsuarios = async (req, res, next) => {
    try {
        const usuariosRaw = await db.query("SELECT * FROM usuario", []);
        const usuarios = usuariosRaw.map((usuario, index) => ({
            numero: index + 1,
            id: usuario.id || usuario.id_usuario || null,
            correo: usuario.correo || usuario.email || "Sin correo",
            rol: usuario.rol || "usuario"
        }));

        if (req.query.formato === "json") {
            return res.json({ ok: true, usuarios });
        }

        res.render("usuarios", {
            usuarios,
            totalUsuarios: usuarios.length
        });


    } catch (err) {
        next(err);
    }
};

const registrarUsuario = async (req, res, next) => {
    try {
        const { correo, password } = req.body;
        const passwordHash = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)';
        await db.query(sql, [correo, passwordHash]);
        res.json({ ok: true, mensaje: "Usuario registrado correctamente" });
    } catch (err) {
        next(err);
    }
};

module.exports = { mostrarRegistro, getUsuarios, registrarUsuario };