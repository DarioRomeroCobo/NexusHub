const bcrypt = require('bcrypt');
const validator = require('validator'); 
const db = require("../utils/middleware-bd");
const AzureBlobStorage = require('../utils/azure-blob');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
//Conexion con el recurso de Azure Blob Storage
const CONNECTION_STRING = "DefaultEndpointsProtocol=https;AccountName=almacenamientonexushub;AccountKey=9JbBzi0ph16RzsPC7X3zRTJij0aCadWGY+H/a17Rcy3zGzqZvncqL9GUTv9jhpJ+UqBIaJF4n2XT+AStllDGeg==;EndpointSuffix=core.windows.net";
//Crea la instacia
const azureBlob = new AzureBlobStorage(CONNECTION_STRING);
const mostrarRegistro = (req, res) => {
    res.render("registro");
};

const mostrarInicioSesion = (req, res) => {
    res.render("inicio-sesion");
};

const mostrarSubirVideo = async (req, res, next) => {
    try {
        const correoUsuario = (req.session.correo || "").trim().toLowerCase();
        const videosRaw = await db.query(
            `SELECT correo_usuario, url_video, nombre_video, peso_bytes, duracion_segundos, fecha_subida
             FROM VideosUsuario
             WHERE correo_usuario = @p0
             ORDER BY fecha_subida DESC`,
            [correoUsuario]
        );

        const videos = (videosRaw || []).map((video) => ({
            nombre: video.nombre_video,
            pesoMB: (Number(video.peso_bytes || 0) / (1024 * 1024)).toFixed(2),
            fecha: video.fecha_subida,
            duracionSegundos: Number(video.duracion_segundos || 0),
            url: video.url_video
        }));

        res.render("subir-video", {
            videos,
            totalVideos: videos.length
        });
    } catch (err) {
        next(err);
    }
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

        res.json({ ok: true, mensaje: "Usuario registrado correctamente. Redirigiendo a la pagina de inicio de sesión ..." });

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

        req.session.usuarioId = usuario.id_usuario || usuario.id || null;
        req.session.correo = usuario.correo;
        req.session.isLoggedIn = true;

        // Respondemos al cliente para que el JS de la vista haga el redireccionamiento
        res.json({ ok: true, mensaje: "¡Bienvenido a NexusHub!" });

    } catch (err) {
        console.error("Error en el login:", err);
    }
};
const cargarVideo = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.usuarioId) {
            return res.status(401).json({ ok: false, error: "Debes iniciar sesión para subir videos" });
        }

        const correoUsuario = (req.session.correo || "").trim().toLowerCase();
        const duracionSegundos = Number.parseInt(req.body.duracion_segundos, 10);

        // Valida que existe archivo y sino lanza error
        if (!req.file) {
            return res.status(400).json({ ok: false, error: "No se subió ningún archivo" });
        }

        if (!Number.isFinite(duracionSegundos) || duracionSegundos < 0) {
            return res.status(400).json({ ok: false, error: "Duración de video no válida" });
        }

        // Validar tipo de formatos permitidos (mp4, mov)
        const tiposPermitidos = ['video/mp4', 'video/quicktime'];
        if (!tiposPermitidos.includes(req.file.mimetype)) {
            return res.status(400).json({ 
                ok: false, 
                error: "Solo se permiten videos (mp4, mov)" 
            });
        }

        // Valida el tamaño máximo perimitido (500 MB) para probar
        const tamanioMaximo = 500 * 1024 * 1024;
        if (req.file.size > tamanioMaximo) {
            return res.status(400).json({ 
                ok: false, 
                error: "El video no puede exceder 500 MB" 
            });
        }

        // Genera un nombre random para el blob
        const usuarioId = req.session.usuarioId;
        const timestamp = Date.now();
        const nombreArchivoSeguro = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const nombreBlob = `videos/${usuarioId}/${timestamp}-${nombreArchivoSeguro}`;

        const nombreArchivoEnBD = await db.query(
            `SELECT nombre_video
             FROM VideosUsuario
             WHERE correo_usuario = @p0
             AND nombre_video = @p1`,
             [correoUsuario, nombreArchivoSeguro]
            );
        
        // Comprobar que no existe un video del usuario con el mismo nombre
        const filas = nombreArchivoEnBD.recordset || nombreArchivoEnBD;

        if (filas.length > 0) {
            return res.status(400).json({ 
                ok: false, 
                error: "Ya tienes un video con ese nombre" 
            });
        }
        
        // Subir a Azure
        const resultado = await azureBlob.uploadBlob('videos', nombreBlob, req.file.buffer);

        if (resultado.success) {
            const urlVideo = azureBlob.getBlobUrl('videos', nombreBlob);

            if (urlVideo.length > 255) {
                await azureBlob.deleteBlob('videos', nombreBlob);
                return res.status(400).json({ ok: false, error: "La URL del video supera el máximo permitido de 255 caracteres" });
            }

            await db.query(
                `INSERT INTO VideosUsuario (correo_usuario, url_video, nombre_video, peso_bytes, duracion_segundos)
                 VALUES (@p0, @p1, @p2, @p3, @p4)`,
                [
                    correoUsuario,
                    urlVideo,
                    req.file.originalname,
                    req.file.size,
                    duracionSegundos
                ]
            );

            return res.json({ 
                ok: true, 
                mensaje: "Video cargado correctamente",
                url: urlVideo,
                blobName: nombreBlob
            });
        }

        res.status(500).json({ ok: false, error: "Error al subir el video" });

    } catch(err) {
        console.error("Error al cargar video:", err);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
};

const logout = (req, res, next) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error al cerrar sesión:", err);
            return res.redirect("/bienvenida");
        }
        res.clearCookie('connect.sid');
        res.redirect("/bienvenida");
    });
};

module.exports = { mostrarRegistro, getUsuarios, registrarUsuario, cargarVideo, mostrarInicioSesion, mostrarSubirVideo, validarSesion, logout };
