const axios = require('axios');
const db = require('../utils/middleware-bd');

const getYoutubeOAuthConfig = (req) => {
    const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';

    return { clientId, clientSecret, host: req.get('host') };
};

const actualizarTokensYoutube = async (correoUsuario, accessToken, expiresAt, refreshTokenOpcional) => {
    await db.query(
        `UPDATE VinculacionYoutube
         SET access_token = @p1,
             expires_at = @p2,
             refresh_token = COALESCE(@p3, refresh_token)
         WHERE correo_usuario = @p0`,
        [correoUsuario, accessToken, expiresAt, refreshTokenOpcional || null]
    );
};

const getAccessTokenVigente = async (req, correoUsuario) => {
    const filas = await db.query(
        `SELECT access_token, refresh_token, expires_at
         FROM VinculacionYoutube
         WHERE correo_usuario = @p0`,
        [correoUsuario]
    );

    const vinculacion = Array.isArray(filas) && filas.length > 0 ? filas[0] : null;
    if (!vinculacion || !vinculacion.access_token) {
        return { ok: false, status: 400, error: 'No tienes YouTube vinculado' };
    }

    const margenRenovacionMs = 60 * 1000;
    const expiraEn = vinculacion.expires_at ? new Date(vinculacion.expires_at).getTime() : 0;
    const tokenVigente = Number.isFinite(expiraEn) && expiraEn - Date.now() > margenRenovacionMs;

    if (tokenVigente) {
        return { ok: true, accessToken: vinculacion.access_token };
    }

    const refreshToken = String(vinculacion.refresh_token || '').trim();
    if (!refreshToken || refreshToken.toLowerCase() === 'null') {
        return { ok: false, status: 401, error: 'Tu vinculacion de YouTube ha expirado. Vuelve a vincular tu cuenta.' };
    }

    const { clientId, clientSecret } = getYoutubeOAuthConfig(req);
    if (!clientId || !clientSecret) {
        return { ok: false, status: 500, error: 'Falta configuracion OAuth de YouTube en el servidor' };
    }

    let tokenResponse;
    try {
        tokenResponse = await axios.post(
            'https://oauth2.googleapis.com/token',
            new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 15000
            }
        );
    } catch (err) {
        const detalle = err.response?.data?.error_description
            || err.response?.data?.error
            || err.message;
        const status = err.response?.status || 500;

        if (status >= 400 && status < 500) {
            return {
                ok: false,
                status: 401,
                error: `No se pudo renovar el acceso de YouTube (${detalle}). Vuelve a vincular tu cuenta.`
            };
        }

        return {
            ok: false,
            status: 502,
            error: 'No se pudo conectar con YouTube para renovar el token. Intentalo de nuevo en unos minutos.'
        };
    }

    const nuevoAccessToken = tokenResponse.data?.access_token;
    const nuevoRefreshToken = tokenResponse.data?.refresh_token;
    const expiresIn = Number(tokenResponse.data?.expires_in || 3600);

    if (!nuevoAccessToken) {
        return { ok: false, status: 401, error: 'No se pudo renovar el token de YouTube' };
    }

    const nuevoExpiresAt = new Date(Date.now() + expiresIn * 1000);
    await actualizarTokensYoutube(correoUsuario, nuevoAccessToken, nuevoExpiresAt, nuevoRefreshToken || null);

    return { ok: true, accessToken: nuevoAccessToken };
};

const mostrarEstadisticasPublicaciones = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            return res.redirect('/usuario/inicio-sesion');
        }

        const correoUsuario = String(req.session.correo).trim().toLowerCase();
        const tokenData = await getAccessTokenVigente(req, correoUsuario);

        if (!tokenData.ok) {
            return res.render('estadisticas-publicaciones', {
                publicaciones: [],
                totalPublicaciones: 0,
                error: tokenData.error,
                canal: null,
                ultimaActualizacion: new Date()
            });
        }

        const accessToken = tokenData.accessToken;

        const busquedaResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                forMine: true,
                type: 'video',
                order: 'date',
                maxResults: 5
            },
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            timeout: 15000
        });

        const publicacionesBase = Array.isArray(busquedaResponse.data?.items)
            ? busquedaResponse.data.items
            : [];

        if (publicacionesBase.length === 0) {
            return res.render('estadisticas-publicaciones', {
                publicaciones: [],
                totalPublicaciones: 0,
                error: null,
                canal: null,
                ultimaActualizacion: new Date()
            });
        }

        const ids = publicacionesBase
            .map((item) => item?.id?.videoId)
            .filter(Boolean)
            .slice(0, 5);

        const statsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'snippet,statistics,status',
                id: ids.join(',')
            },
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            timeout: 15000
        });

        const publicaciones = (statsResponse.data?.items || []).map((video) => ({
            id: video.id,
            titulo: video.snippet?.title || 'Sin titulo',
            miniatura: video.snippet?.thumbnails?.medium?.url
                || video.snippet?.thumbnails?.default?.url
                || '',
            fechaPublicacion: video.snippet?.publishedAt || null,
            vistas: Number(video.statistics?.viewCount || 0),
            meGusta: Number(video.statistics?.likeCount || 0),
            noMeGusta: Number(video.statistics?.dislikeCount || 0),
            comentarios: Number(video.statistics?.commentCount || 0),
            monetizable: video.status?.license === 'youtube',
            url: `https://www.youtube.com/watch?v=${video.id}`,
            canalTitulo: video.snippet?.channelTitle || null
        }));

        const canal = publicaciones.find((p) => p.canalTitulo)?.canalTitulo || null;

        return res.render('estadisticas-publicaciones', {
            publicaciones,
            totalPublicaciones: publicaciones.length,
            error: null,
            canal,
            ultimaActualizacion: new Date()
        });
    } catch (err) {
        const detalle = err.response?.data?.error?.message || err.message;
        if (err.response?.status === 400 || err.response?.status === 401 || err.response?.status === 403) {
            return res.render('estadisticas-publicaciones', {
                publicaciones: [],
                totalPublicaciones: 0,
                error: `No se pudo consultar YouTube (${detalle}). Vuelve a vincular tu cuenta para renovar permisos.`,
                canal: null,
                ultimaActualizacion: new Date()
            });
        }
        console.error('Error al consultar estadisticas de YouTube:', detalle);
        return next(err);
    }
};

module.exports = {
    mostrarEstadisticasPublicaciones
};