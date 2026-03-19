const bcrypt = require('bcrypt');
const validator = require('validator'); 
const db = require("../utils/middleware-bd");

const mostrarRegistro = (req, res) => {
    res.render("registro");
};

const mostrarInicioSesion = (req, res) => {
    res.render("inicio-sesion");
};

const getUsuarios = async (req, res, next) => {
    try {
        const usuariosRaw = await db.query("SELECT * FROM usuario", []);
        const usuarios = usuariosRaw.map((usuario, index) => ({
            numero: index + 1,
            id: usuario.id || usuario.id_usuario || null,
            correo: usuario.correo || usuario.email || "Sin correo",
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

        const correoNormalizado = (correo || "").trim().toLowerCase();

        if (!correoNormalizado || !password) {
            return res.status(400).json({ ok: false, error: "Correo y contraseña son obligatorios" });
        }

        if (!validator.isEmail(correoNormalizado)) {
            return res.status(400).json({ ok: false, error: "Correo electrónico no válido" });
        }

        if (!validator.isStrongPassword(password, { minLength: 8, minUppercase: 1, minNumbers: 1, minSymbols: 1 })) {
            return res.status(400).json({ 
                ok: false, 
                error: "La contraseña debe tener al menos 8 caracteres, incluir una mayúscula, un número y un símbolo." 
            });
        }

        const confirmacion = typeof confirmPassword === "string" ? confirmPassword : confirm;
        if (confirmacion !== password) {
            return res.status(400).json({ ok: false, error: "Las contraseñas no coinciden" });
        }
        
        const usuarioExistente = await db.query('SELECT * FROM usuario WHERE correo = @p0', [correoNormalizado]);
    
        const filas = usuarioExistente.recordset || usuarioExistente; 
        if (filas.length > 0) {
            return res.status(409).json({ ok: false, error: "Ya existe un usuario con ese correo" });
        }

   
        const passwordHash = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO usuario (correo, contraseña) VALUES (@p0, @p1)';
        await db.query(sql, [correoNormalizado, passwordHash]);

        res.json({ ok: true, mensaje: "Usuario registrado correctamente. Redirigiendo a la pagina de inicio ..." });

    } catch(err) {
        console.error("Error al registrar el usuario:", err);

        // Manejo específico del error de UNIQUE KEY de SQL Server
        if (err.number === 2627 || err.number === 2601 || err.message.includes("UNIQUE KEY")) {
            return res.status(409).json({ ok: false, error: "Este correo ya está registrado en la base de datos." });
        }

        
        return res.status(500).json({ ok: false, error: "Error interno del servidor al procesar el registro" });
    }
};


const validarSesion = async (req, res, next) => {
    try {
        const { correo, password } = req.body;
        const correoNormalizado = (correo || "").trim().toLowerCase();

        if (!correoNormalizado || !password) {
            return res.status(400).json({ ok: false, error: "Introduce correo y contraseña" });
        }

        const resultado = await db.query('SELECT * FROM usuario WHERE correo = @p0', [correoNormalizado]);
        
        const filas = resultado.recordset || resultado; 

        if (filas.length === 0) {
            return res.status(401).json({ ok: false, error: "Usuario o contraseña incorrectos" });
        }

        const usuario = filas[0];

        const esValida = await bcrypt.compare(password, usuario.contraseña);

        if (!esValida) {
            return res.status(401).json({ ok: false, error: "Usuario o contraseña incorrectos" });
        }

        req.session.usuarioId = usuario.id_usuario; 
        req.session.correo = usuario.correo;
        req.session.isLoggedIn = true;

        // Respondemos al cliente para que el JS de la vista haga el redireccionamiento
        res.json({ ok: true, mensaje: "¡Bienvenido a NexusHub!" });

    } catch (err) {
        console.error("Error en el login:", err);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
};

module.exports = { mostrarRegistro, getUsuarios, registrarUsuario, mostrarInicioSesion, validarSesion };