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
        
        
    } catch(err) {
        next(err);
    }
};

const registrarUsuario = async (req, res, next) => {
    try {
        const { correo, password, confirm, confirmPassword } = req.body;
        const correoNormalizado = (correo || "").trim();

        const regexCorreo = /^([\w\d.]+@+[\w]+.+[\w])$/;
        const regexPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._-])[A-Za-z\d@$!%*?&._-]{8,}$/;

        if (!correoNormalizado || !password) {
            return res.status(400).json({ ok: false, error: "Correo y contrasena son obligatorios" });
        }

        if (!regexCorreo.test(correoNormalizado)) {
            return res.status(400).json({ ok: false, error: "Correo electronico no valido" });
        }

        if (!regexPassword.test(password)) {
            return res.status(400).json({ ok: false, error: "La contrasena no cumple los requisitos de seguridad" });
        }

        const confirmacion = typeof confirmPassword === "string" ? confirmPassword : confirm;
        if (typeof confirmacion === "string" && confirmacion !== password) {
            return res.status(400).json({ ok: false, error: "Las contrasenas no coinciden" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)';
        await db.query(sql, [correoNormalizado, passwordHash]);
        res.json({ ok: true, mensaje: "Usuario registrado correctamente" });
    } catch(err) {
        next(err);
    }
};

module.exports = { mostrarRegistro, getUsuarios, registrarUsuario };