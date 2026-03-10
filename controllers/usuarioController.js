const bcrypt = require('bcrypt');
const db = require("../utils/middleware-bd");

const mostrarRegistro = (req, res) => {
    res.render("registro");
};

const getUsuarios = async (req, res, next) => {
    try {
        const usuarios = await db.query("SELECT * FROM usuario", {});
        res.json({ ok: true, usuarios });
    } catch(err) {
        next(err);
    }
};

const registrarUsuario = async (req, res, next) => {
    try {
        const { correo, password } = req.body;
        const passwordHash = await bcrypt.hash(password, 10);
       const sql = 'INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)';
await db.query(sql, [correo, passwordHash]);
        res.json({ ok: true });
    } catch(err) {
        next(err);
    }
};

module.exports = { mostrarRegistro, getUsuarios, registrarUsuario };