const axios = require('axios');
const db = require('../utils/middleware-bd');
const { getAccessTokenVigente } = require('./youtubeController');

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

const normalizarNumero = (valor) => {
    const numero = Number.parseInt(String(valor ?? '0'), 10);
    return Number.isFinite(numero) ? numero : 0;
};

const obtenerPrimerThumbnail = (thumbnails) => {
    if (!thumbnails || typeof thumbnails !== 'object') {
        return null;
    }

    return thumbnails.maxres?.url
        || thumbnails.high?.url
        || thumbnails.medium?.url
        || thumbnails.default?.url
        || null;
};

const obtenerListaVideosCanal = async (accessToken, uploadsPlaylistId) => {
    const playlistItems = [];
    let pageToken = null;

    do {
        const response = await axios.get(`${YOUTUBE_API_BASE}/playlistItems`, {
            params: {
                part: 'snippet,contentDetails',
                playlistId: uploadsPlaylistId,
                maxResults: 50,
                pageToken: pageToken || undefined
            },
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            timeout: 15000
        });

        const items = Array.isArray(response.data?.items) ? response.data.items : [];
        playlistItems.push(...items);
        pageToken = response.data?.nextPageToken || null;
    } while (pageToken);

    const ids = playlistItems
        .map((item) => item?.contentDetails?.videoId)
        .filter(Boolean);

    const videos = [];
    for (let index = 0; index < ids.length; index += 50) {
        const loteIds = ids.slice(index, index + 50).join(',');
        const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
            params: {
                part: 'snippet,statistics',
                id: loteIds,
                maxResults: 50
            },
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            timeout: 15000
        });

        videos.push(...(Array.isArray(response.data?.items) ? response.data.items : []));
    }

    return videos;
};

const cargarEstadisticasYoutube = async (req, correoUsuario) => {
    const tokenData = await getAccessTokenVigente(req, correoUsuario);
    if (!tokenData.ok) {
        return { ok: false, error: tokenData.error, status: tokenData.status || 400 };
    }

    const respuestaCanal = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
        params: {
            part: 'snippet,statistics,contentDetails',
            mine: true
        },
        headers: {
            Authorization: `Bearer ${tokenData.accessToken}`
        },
        timeout: 15000
    });

    const canal = Array.isArray(respuestaCanal.data?.items) && respuestaCanal.data.items.length > 0
        ? respuestaCanal.data.items[0]
        : null;

    if (!canal) {
        return {
            ok: true,
            redes: []
        };
    }

    const channelTitle = canal.snippet?.title || 'Canal de YouTube';
    const channelPhotoUrl = obtenerPrimerThumbnail(canal.snippet?.thumbnails);
    const subscribers = normalizarNumero(canal.statistics?.subscriberCount);
    const uploadsPlaylistId = canal.contentDetails?.relatedPlaylists?.uploads || null;

    let videos = [];
    if (uploadsPlaylistId) {
        videos = await obtenerListaVideosCanal(tokenData.accessToken, uploadsPlaylistId);
    }

    const redes = videos.length > 0
        ? videos.map((video) => ({
            plataforma: 'YouTube',
            usuario: channelTitle,
            titulo: video.snippet?.title || 'Vídeo de YouTube',
            publicadoEn: video.snippet?.publishedAt || null,
            thumbnailUrl: obtenerPrimerThumbnail(video.snippet?.thumbnails),
            canalFotoUrl: channelPhotoUrl,
            suscriptores: subscribers,
            vistas: normalizarNumero(video.statistics?.viewCount),
            likes: normalizarNumero(video.statistics?.likeCount),
            comentarios: normalizarNumero(video.statistics?.commentCount)
        }))
        : [{
            plataforma: 'YouTube',
            usuario: channelTitle,
            titulo: channelTitle,
            publicadoEn: null,
            thumbnailUrl: channelPhotoUrl,
            canalFotoUrl: channelPhotoUrl,
            suscriptores: subscribers,
            vistas: normalizarNumero(canal.statistics?.viewCount),
            likes: 0,
            comentarios: 0
        }];

    return {
        ok: true,
        redes
    };
};

const mostrarEstadisticas = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            return res.redirect('/usuario/inicio-sesion');
        }

        const correoUsuario = String(req.session.correo).trim().toLowerCase();
        const vinculacion = await db.query(
            `SELECT channel_title, channel_photo_url
             FROM VinculacionYoutube
             WHERE correo_usuario = @p0`,
            [correoUsuario]
        );

        if (!Array.isArray(vinculacion) || vinculacion.length === 0) {
            return res.render('estadisticas-redsocial', {
                error: null,
                redes: []
            });
        }

        const resultado = await cargarEstadisticasYoutube(req, correoUsuario);

        if (!resultado.ok) {
            return res.render('estadisticas-redsocial', {
                error: resultado.error || 'No se pudieron cargar las estadísticas de YouTube',
                redes: []
            });
        }

        return res.render('estadisticas-redsocial', {
            error: null,
            redes: resultado.redes
        });
    } catch (err) {
        console.error('Error al cargar estadísticas de YouTube:', err);
        return res.render('estadisticas-redsocial', {
            error: 'Error al cargar las estadísticas. Por favor, intenta nuevamente o vuelve a vincular tu cuenta.',
            redes: []
        });
    }
};

module.exports = {
    mostrarEstadisticas,
    cargarEstadisticasYoutube
};