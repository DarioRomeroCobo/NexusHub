const db = require('../utils/middleware-bd');
const AzureBlobStorage = require('../utils/azure-blob');

const CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=almacenamientonexushub;AccountKey=9JbBzi0ph16RzsPC7X3zRTJij0aCadWGY+H/a17Rcy3zGzqZvncqL9GUTv9jhpJ+UqBIaJF4n2XT+AStllDGeg==;EndpointSuffix=core.windows.net';
const azureBlob = new AzureBlobStorage(CONNECTION_STRING);

const mostrarSubirVideo = async (req, res, next) => {
    try {
        const correoUsuario = (req.session.correo || '').trim().toLowerCase();
        const videosRaw = await db.query(
            `SELECT correo_usuario, url_video, nombre_video, peso_bytes, duracion_segundos, fecha_subida
             FROM VideosUsuario
             WHERE correo_usuario = @p0
             ORDER BY fecha_subida DESC`,
            [correoUsuario]
        );

        const videos = await Promise.all((videosRaw || []).map(async (video) => {
            const url = new URL(video.url_video);
            const pathParts = url.pathname.split('/').filter(p => p);
            const containerName = pathParts[0];
            const blobName = pathParts.slice(1).join('/');
            const sasUrl = await azureBlob.getBlobSasUrl(containerName, blobName);

            return {
                nombre: video.nombre_video,
                pesoMB: (Number(video.peso_bytes || 0) / (1024 * 1024)).toFixed(2),
                fecha: video.fecha_subida,
                duracionSegundos: Number(video.duracion_segundos || 0),
                url: sasUrl
            };
        }));

        res.render('subir-video', {
            videos,
            totalVideos: videos.length
        });
    } catch (err) {
        next(err);
    }
};

const mostrarPublicacionVideo = async (req, res, next) => {
    const videoUrl = req.query.videoUrl; 
    if (!videoUrl) return res.redirect('/usuario/publicar-video');

    // Parse the blob URL to get container and blob name
    const url = new URL(videoUrl);
    const pathParts = url.pathname.split('/').filter(p => p);
    const containerName = pathParts[0]; // 'videos'
    const blobName = pathParts.slice(1).join('/'); // 'videos/39/1774434256683-pruebaVideo.mp4'

    try {
        const sasUrl = await azureBlob.getBlobSasUrl(containerName, blobName);
        res.render('publicacion-video', { videoUrl: sasUrl }); 
    } catch (err) {
        next(err);
    }
};



const publicarVideo = async (req, res, next) => {
    try {
        return res.status(501).json({ ok: false, error: 'Funcionalidad de publicación de video aún no implementada' });
    } catch (err) {
        next(err);
    }
};

const cargarVideo = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.usuarioId) {
            return res.status(401).json({ ok: false, error: 'Debes iniciar sesión para subir videos' });
        }

        const correoUsuario = (req.session.correo || '').trim().toLowerCase();
        const duracionSegundos = Number.parseInt(req.body.duracion_segundos, 10);

        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'No se subió ningún archivo' });
        }

        if (!req.file.originalname || req.file.originalname.trim() === "" || req.file.originalname.length === 0) {
            return res.status(400).json({ ok: false, error: 'El nombre del video es obligatorio' });
        }

        const nombreOriginalLimpio = req.file.originalname.trim();
        const nombreSinExtension = nombreOriginalLimpio.replace(/\.[^/.]+$/, '').trim();
        if (!nombreSinExtension) {
            return res.status(400).json({ ok: false, error: 'El nombre del video no puede estar vacio' });
        }

        if (!Number.isFinite(duracionSegundos) || duracionSegundos < 0) {
            return res.status(400).json({ ok: false, error: 'Duración de video no válida' });
        }

        const tiposPermitidos = ['video/mp4', 'video/quicktime'];
        if (!tiposPermitidos.includes(req.file.mimetype)) {
            return res.status(400).json({
                ok: false,
                error: 'Solo se permiten videos (mp4, mov)'
            });
        }

        const tamanioMaximo = 500 * 1024 * 1024;
        if (req.file.size > tamanioMaximo) {
            return res.status(400).json({
                ok: false,
                error: 'El video no puede exceder 500 MB'
            });
        }

        const videoExistente = await db.query(
            `SELECT * FROM VideosUsuario
             WHERE correo_usuario = @p0 AND nombre_video = @p1`,
            [correoUsuario, req.file.originalname]
        );

        const filasVideoExistente = videoExistente.recordset || videoExistente;
        if (filasVideoExistente.length > 0) {
            return res.status(400).json({
                ok: false,
                error: 'Ya tienes un video con ese nombre'
            });
        }

        const usuarioId = req.session.usuarioId;
        const timestamp = Date.now();
        const nombreArchivoSeguro = nombreOriginalLimpio.replace(/[^a-zA-Z0-9._-]/g, '_');
        const nombreBlob = `videos/${usuarioId}/${timestamp}-${nombreArchivoSeguro}`;

        const resultado = await azureBlob.uploadBlob('videos', nombreBlob, req.file.buffer);

        if (resultado.success) {
            const urlVideoReal = resultado.url || `https://almacenamientonexushub.blob.core.windows.net/videos/${nombreBlob}`;
            const urlVideo = await azureBlob.getBlobSasUrl('videos', nombreBlob);

            if (urlVideo.length > 255) {
                await azureBlob.deleteBlob('videos', nombreBlob);
                return res.status(400).json({ ok: false, error: 'La URL del video supera el máximo permitido de 255 caracteres' });
            }

            await db.query(
                `INSERT INTO VideosUsuario (correo_usuario, url_video, nombre_video, peso_bytes, duracion_segundos)
                 VALUES (@p0, @p1, @p2, @p3, @p4)`,
                [
                    correoUsuario,
                    urlVideoReal,
                    nombreOriginalLimpio,
                    req.file.size,
                    duracionSegundos
                ]
            );

            return res.json({
                ok: true,
                mensaje: 'Video cargado correctamente',
                url: urlVideo,
                blobName: nombreBlob
            });
        }

        return res.status(500).json({ ok: false, error: 'Error al subir el video' });

    } catch (err) {
        console.error('Error al cargar video:', err);
        return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
};

//NUEVA FUNCION PARA MOSTRAR LA GALERIA DE VIDEOS EN LA PAGINA DE PUBLICAR VIDEO (PASO 2)
const mostrarGaleriaPublicar = async (req, res, next) => {
    try {
        const correoUsuario = (req.session.correo || '').trim().toLowerCase();

        const videosRaw = await db.query(
            `SELECT correo_usuario, url_video, nombre_video, peso_bytes, duracion_segundos, fecha_subida
             FROM VideosUsuario
             WHERE correo_usuario = @p0
             ORDER BY fecha_subida DESC`,
            [correoUsuario]
        );

        // 👇 EXACTAMENTE igual que en subir-video
        const videos = await Promise.all((videosRaw || []).map(async (video) => {
            const url = new URL(video.url_video);
            const pathParts = url.pathname.split('/').filter(p => p);
            const containerName = pathParts[0];
            const blobName = pathParts.slice(1).join('/');
            const sasUrl = await azureBlob.getBlobSasUrl(containerName, blobName);

            return {
                nombre: video.nombre_video,
                pesoMB: (Number(video.peso_bytes || 0) / (1024 * 1024)).toFixed(2),
                fecha: video.fecha_subida,
                duracionSegundos: Number(video.duracion_segundos || 0),
                url: sasUrl
            };
        }));

        res.render('publicar-video', {
            videos,
            totalVideos: videos.length
        });

    } catch (err) {
        console.error('Error en mostrarGaleriaPublicar:', err);
        next(err);
    }
};


module.exports = {
    mostrarSubirVideo,
    cargarVideo,
    mostrarGaleriaPublicar,
    mostrarPublicacionVideo,
    publicarVideo
};
