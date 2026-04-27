const db = require('../utils/middleware-bd');
const AzureBlobStorage = require('../utils/azure-blob');

const CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=almacenamientonexushub;AccountKey=9JbBzi0ph16RzsPC7X3zRTJij0aCadWGY+H/a17Rcy3zGzqZvncqL9GUTv9jhpJ+UqBIaJF4n2XT+AStllDGeg==;EndpointSuffix=core.windows.net';
const azureBlob = new AzureBlobStorage(CONNECTION_STRING);

// ===== CONFIGURACIÓN DE TIPOS DE ARCHIVO =====
const TIPOS_ARCHIVO = {
    VIDEO: {
        mimes: ['video/mp4', 'video/quicktime'],
        extensiones: ['.mp4', '.mov'],
        tamanioMax: 500 * 1024 * 1024,
        tabla: 'VideosUsuario',
        campo_url: 'url_video',
        campo_nombre: 'nombre_video',
        contenedor: 'videos',
        mensajeError: 'Solo se permiten videos (mp4, mov)',
        mensajeTamanio: 'El video no puede exceder 500 MB'
    },
    FOTO: {
        mimes: ['image/jpeg', 'image/png'],
        extensiones: ['.jpg', '.jpeg', '.png'],
        tamanioMax: 50 * 1024 * 1024,
        tabla: 'FotosUsuario',
        campo_url: 'url_foto',
        campo_nombre: 'nombre_foto',
        contenedor: 'fotos',
        mensajeError: 'Solo se permiten fotos (jpg, jpeg, png)',
        mensajeTamanio: 'La foto no puede exceder 50 MB'
    }
};

// ===== FUNCIONES AUXILIARES =====

/**
 * Detecta el tipo de archivo basado en MIME type
 * @param {string} mimetype - MIME type del archivo
 * @returns {string|null} - 'VIDEO', 'FOTO' o null
 */
const detectarTipoArchivo = (mimetype) => {
    if (TIPOS_ARCHIVO.VIDEO.mimes.includes(mimetype)) return 'VIDEO';
    if (TIPOS_ARCHIVO.FOTO.mimes.includes(mimetype)) return 'FOTO';
    return null;
};

/**
 * Valida un archivo según su tipo
 * @param {object} file - Objeto del archivo (req.file)
 * @param {string} tipo - 'VIDEO' o 'FOTO'
 * @returns {object} - { ok: boolean, error?: string }
 */
const validarArchivo = (file, tipo) => {
    const config = TIPOS_ARCHIVO[tipo];
    const nombre = (file.originalname || '').toLowerCase();

    // Validar que tenga nombre
    if (!file.originalname || file.originalname.trim() === '') {
        return { ok: false, error: `El nombre del ${tipo.toLowerCase()} es obligatorio` };
    }

    // Validar que tenga extensión
    const nombreSinExtension = file.originalname.replace(/\.[^/.]+$/, '').trim();
    if (!nombreSinExtension) {
        return { ok: false, error: `El nombre del ${tipo.toLowerCase()} no puede estar vacío` };
    }

    // Validar MIME type
    if (!config.mimes.includes(file.mimetype)) {
        return { ok: false, error: config.mensajeError };
    }

    // Validar tamaño
    if (file.size > config.tamanioMax) {
        return { ok: false, error: config.mensajeTamanio };
    }

    return { ok: true };
};

/**
 * Verifica si un archivo ya existe en la BD
 * @param {string} tabla - Nombre de la tabla
 * @param {string} correo - Email del usuario
 * @param {string} nombre - Nombre del archivo
 * @returns {Promise<boolean>}
 */
const archivoYaExiste = async (tabla, correo, nombre) => {
    const nombreCampo = tabla === 'VideosUsuario' ? 'nombre_video' : 'nombre_foto';
    const resultado = await db.query(
        `SELECT * FROM ${tabla} WHERE correo_usuario = @p0 AND ${nombreCampo} = @p1`,
        [correo, nombre]
    );
    const filas = resultado.recordset || resultado;
    return filas.length > 0;
};

/**
 * Sube un archivo a Azure Blob Storage
 * @param {string} contenedor - Nombre del contenedor
 * @param {string} rutaBlob - Ruta del blob
 * @param {Buffer} buffer - Buffer del archivo
 * @returns {Promise<object>}
 */
const subirABlob = async (contenedor, rutaBlob, buffer) => {
    return await azureBlob.uploadBlob(contenedor, rutaBlob, buffer);
};

/**
 * Inserta un video en la BD
 * @param {string} correo - Email del usuario
 * @param {string} url - URL del video
 * @param {string} nombre - Nombre del video
 * @param {number} tamanio - Tamaño en bytes
 * @param {number} duracion - Duración en segundos
 */
const insertarVideo = async (correo, url, nombre, tamanio, duracion) => {
    await db.query(
        `INSERT INTO VideosUsuario (correo_usuario, url_video, nombre_video, peso_bytes, duracion_segundos)
         VALUES (@p0, @p1, @p2, @p3, @p4)`,
        [correo, url, nombre, tamanio, duracion]
    );
};

/**
 * Inserta una foto en la BD
 * @param {string} correo - Email del usuario
 * @param {string} url - URL de la foto
 * @param {string} nombre - Nombre de la foto
 * @param {number} tamanio - Tamaño en bytes
 */
const insertarFoto = async (correo, url, nombre, tamanio) => {
    await db.query(
        `INSERT INTO FotosUsuario (correo_usuario, url_foto, nombre_foto, peso_bytes, fecha_subida)
         VALUES (@p0, @p1, @p2, @p3, @p4)`,
        [correo, url, nombre, tamanio, new Date()]
    );
};

/**
 * Obtiene videos del usuario
 * @param {string} correo - Email del usuario
 * @returns {Promise<Array>}
 */
const obtenerVideosUsuario = async (correo) => {
    const resultado = await db.query(
        `SELECT correo_usuario, url_video, nombre_video, peso_bytes, duracion_segundos, fecha_subida
         FROM VideosUsuario
         WHERE correo_usuario = @p0
         ORDER BY fecha_subida DESC`,
        [correo]
    );

    return (resultado || []).map((video) => ({
        nombre: video.nombre_video,
        pesoMB: (Number(video.peso_bytes || 0) / (1024 * 1024)).toFixed(2),
        fecha: video.fecha_subida,
        duracionSegundos: Number(video.duracion_segundos || 0),
        url: video.url_video
    }));
};

/**
 * Obtiene fotos del usuario
 * @param {string} correo - Email del usuario
 * @returns {Promise<Array>}
 */
const obtenerFotosUsuario = async (correo) => {
    const resultado = await db.query(
        `SELECT correo_usuario, url_foto, nombre_foto, peso_bytes, fecha_subida
         FROM FotosUsuario
         WHERE correo_usuario = @p0
         ORDER BY fecha_subida DESC`,
        [correo]
    );

    return (resultado || []).map((foto) => ({
        nombre: foto.nombre_foto,
        pesoMB: (Number(foto.peso_bytes || 0) / (1024 * 1024)).toFixed(2),
        fecha: foto.fecha_subida,
        url: foto.url_foto
    }));
};

// ===== CONTROLADORES PRINCIPALES =====

/**
 * Muestra la página de gestión de archivos (vídeos y fotos)
 */
const mostrarGestorArchivos = async (req, res, next) => {
    try {
        const correoUsuario = (req.session.correo || '').trim().toLowerCase();
        
        const videos = await obtenerVideosUsuario(correoUsuario);
        const fotos = await obtenerFotosUsuario(correoUsuario);

        res.render('subir-video', {
            videos,
            totalVideos: videos.length,
            fotos,
            totalFotos: fotos.length
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Carga un vídeo
 */
const cargarVideo = async (req, res, next) => {
    try {
        // Validar sesión
        if (req.session.isLoggedIn !== true || !req.session.usuarioId) {
            return res.status(401).json({ ok: false, error: 'Debes iniciar sesión para subir videos' });
        }

        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'No se subió ningún archivo' });
        }

        // Validar archivo
        const validacion = validarArchivo(req.file, 'VIDEO');
        if (!validacion.ok) {
            return res.status(400).json({ ok: false, error: validacion.error });
        }

        // Validar duración
        const duracionSegundos = Number.parseInt(req.body.duracion_segundos, 10);
        if (!Number.isFinite(duracionSegundos) || duracionSegundos < 0) {
            return res.status(400).json({ ok: false, error: 'Duración de video no válida' });
        }

        const correoUsuario = (req.session.correo || '').trim().toLowerCase();

        // Verificar que no exista un video con ese nombre
        if (await archivoYaExiste('VideosUsuario', correoUsuario, req.file.originalname)) {
            return res.status(400).json({ ok: false, error: 'Ya tienes un video con ese nombre' });
        }

        // Preparar nombres de archivo
        const nombreOriginal = req.file.originalname.trim();
        const usuarioId = req.session.usuarioId;
        const timestamp = Date.now();
        const nombreSeguro = nombreOriginal.replace(/[^a-zA-Z0-9._-]/g, '_');
        const rutaBlob = `videos/${usuarioId}/${timestamp}-${nombreSeguro}`;

        // Subir a Azure Blob
        const resultado = await subirABlob('videos', rutaBlob, req.file.buffer);
        if (!resultado.success) {
            return res.status(500).json({ ok: false, error: 'Error al subir el video' });
        }

        // Obtener URL
        const urlVideo = azureBlob.getBlobUrl('videos', rutaBlob);
        if (urlVideo.length > 255) {
            await azureBlob.deleteBlob('videos', rutaBlob);
            return res.status(400).json({ ok: false, error: 'La URL del video supera el máximo permitido de 255 caracteres' });
        }

        // Insertar en BD
        await insertarVideo(correoUsuario, urlVideo, nombreOriginal, req.file.size, duracionSegundos);

        return res.json({
            ok: true,
            mensaje: 'Video cargado correctamente',
            url: urlVideo,
            blobName: rutaBlob
        });

    } catch (err) {
        console.error('Error al cargar video:', err);
        return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
};

/**
 * Carga una foto
 */
const cargarFoto = async (req, res, next) => {
    try {
        // Validar sesión
        if (req.session.isLoggedIn !== true || !req.session.usuarioId) {
            return res.status(401).json({ ok: false, error: 'Debes iniciar sesión para subir fotos' });
        }

        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'No se subió ningún archivo' });
        }

        // Validar archivo
        const validacion = validarArchivo(req.file, 'FOTO');
        if (!validacion.ok) {
            return res.status(400).json({ ok: false, error: validacion.error });
        }

        const correoUsuario = (req.session.correo || '').trim().toLowerCase();

        // Verificar que no exista una foto con ese nombre
        if (await archivoYaExiste('FotosUsuario', correoUsuario, req.file.originalname)) {
            return res.status(400).json({ ok: false, error: 'Ya tienes una foto con ese nombre' });
        }

        // Preparar nombres de archivo
        const nombreOriginal = req.file.originalname.trim();
        const usuarioId = req.session.usuarioId;
        const timestamp = Date.now();
        const nombreSeguro = nombreOriginal.replace(/[^a-zA-Z0-9._-]/g, '_');
        const rutaBlob = `fotos/${usuarioId}/${timestamp}-${nombreSeguro}`;

        // Subir a Azure Blob
        const resultado = await subirABlob('fotos', rutaBlob, req.file.buffer);
        if (!resultado.success) {
            return res.status(500).json({ ok: false, error: 'Error al subir la foto' });
        }

        // Obtener URL
        const urlFoto = azureBlob.getBlobUrl('fotos', rutaBlob);
        if (urlFoto.length > 255) {
            await azureBlob.deleteBlob('fotos', rutaBlob);
            return res.status(400).json({ ok: false, error: 'La URL de la foto supera el máximo permitido de 255 caracteres' });
        }

        // Insertar en BD
        await insertarFoto(correoUsuario, urlFoto, nombreOriginal, req.file.size);

        return res.json({
            ok: true,
            mensaje: 'Foto cargada correctamente',
            url: urlFoto,
            blobName: rutaBlob
        });

    } catch (err) {
        console.error('Error al cargar foto:', err);
        return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
};

/**
 * Carga un archivo (detecta automáticamente si es vídeo o foto)
 */
const cargarArchivo = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.usuarioId) {
            return res.status(401).json({ ok: false, error: 'Debes iniciar sesión para subir archivos' });
        }

        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'No se subió ningún archivo' });
        }

        if (!req.file.originalname || req.file.originalname.trim() === '') {
            return res.status(400).json({ ok: false, error: 'El nombre del archivo es obligatorio' });
        }

        // Detectar tipo de archivo
        const tipoArchivo = detectarTipoArchivo(req.file.mimetype);
        
        if (!tipoArchivo) {
            return res.status(400).json({
                ok: false,
                error: 'Solo se permiten archivos de video (mp4, mov) o fotos (jpg, jpeg, png)'
            });
        }

        // Delegar a la función correspondiente
        if (tipoArchivo === 'VIDEO') {
            return await cargarVideo(req, res, next);
        } else if (tipoArchivo === 'FOTO') {
            return await cargarFoto(req, res, next);
        }

    } catch (err) {
        console.error('Error al cargar archivo:', err);
        return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
};

module.exports = {
    mostrarGestorArchivos,
    cargarVideo,
    cargarFoto,
    cargarArchivo
};
