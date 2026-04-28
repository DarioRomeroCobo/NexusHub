const axios = require('axios');
const db = require('../utils/middleware-bd');

let ultimaTrazaAnalyticsConfig = 0;

const getYoutubeOAuthConfig = () => {
    const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
    return { clientId, clientSecret };
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

const formatoFechaIso = (fecha) => {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
};

const getInicioSerie30Dias = (fechaHoy) => {
    const inicio30Dias = new Date(fechaHoy);
    inicio30Dias.setHours(0, 0, 0, 0);
    inicio30Dias.setDate(inicio30Dias.getDate() - 29);
    return inicio30Dias;
};

const getRangoFechasIso = (inicio, fin) => {
    const fechas = [];
    const cursor = new Date(inicio);
    cursor.setHours(0, 0, 0, 0);

    const finNormalizado = new Date(fin);
    finNormalizado.setHours(0, 0, 0, 0);

    while (cursor <= finNormalizado) {
        fechas.push(formatoFechaIso(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    return fechas;
};

const esErrorApiAnalyticsNoHabilitada = (analyticsErr) => {
    const status = analyticsErr.response?.status;
    const reason = String(analyticsErr.response?.data?.error?.errors?.[0]?.reason || '').toLowerCase();
    const detalle = String(analyticsErr.response?.data?.error?.message || analyticsErr.message || '').toLowerCase();

    return status === 403 && (
        reason === 'accessnotconfigured'
        || reason === 'forbidden'
        || detalle.includes('youtube analytics api has not been used')
        || detalle.includes('it is disabled')
    );
};

const debeTrazarAvisoAnalytics = () => {
    const ahora = Date.now();
    const ventanaMs = 5 * 60 * 1000;
    if (ahora - ultimaTrazaAnalyticsConfig < ventanaMs) {
        return false;
    }
    ultimaTrazaAnalyticsConfig = ahora;
    return true;
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
        return { ok: false, error: 'No tienes YouTube vinculado' };
    }

    const margenRenovacionMs = 60 * 1000;
    const expiraEn = vinculacion.expires_at ? new Date(vinculacion.expires_at).getTime() : 0;
    const tokenVigente = Number.isFinite(expiraEn) && expiraEn - Date.now() > margenRenovacionMs;

    if (tokenVigente) {
        return { ok: true, accessToken: vinculacion.access_token };
    }

    const refreshToken = String(vinculacion.refresh_token || '').trim();
    if (!refreshToken || refreshToken.toLowerCase() === 'null') {
        return { ok: false, error: 'Tu vinculacion de YouTube ha expirado. Vuelve a vincular tu cuenta.' };
    }

    const { clientId, clientSecret } = getYoutubeOAuthConfig();
    if (!clientId || !clientSecret) {
        return { ok: false, error: 'Falta configuracion OAuth de YouTube en el servidor' };
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
                error: `No se pudo renovar el acceso de YouTube (${detalle}). Vuelve a vincular tu cuenta.`
            };
        }

        return {
            ok: false,
            error: 'No se pudo conectar con YouTube para renovar el token. Intentalo de nuevo en unos minutos.'
        };
    }

    const nuevoAccessToken = tokenResponse.data?.access_token;
    const nuevoRefreshToken = tokenResponse.data?.refresh_token;
    const expiresIn = Number(tokenResponse.data?.expires_in || 3600);

    if (!nuevoAccessToken) {
        return { ok: false, error: 'No se pudo renovar el token de YouTube' };
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
                errorSeriesVideos: null,
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
                errorSeriesVideos: null,
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

        const publicaciones = (statsResponse.data?.items || []).map((video) => {
            const fechaPublicacion = video.snippet?.publishedAt 
                ? new Date(video.snippet.publishedAt) 
                : null;
            fechaPublicacion?.setHours(0, 0, 0, 0);
            
            return {
                id: video.id,
                titulo: video.snippet?.title || 'Sin titulo',
                miniatura: video.snippet?.thumbnails?.medium?.url
                    || video.snippet?.thumbnails?.default?.url
                    || '',
                fechaPublicacion,
                vistas: Number(video.statistics?.viewCount || 0),
                meGusta: Number(video.statistics?.likeCount || 0),
                noMeGusta: Number(video.statistics?.dislikeCount || 0),
                comentarios: Number(video.statistics?.commentCount || 0),
                monetizable: video.status?.license === 'youtube',
                url: `https://www.youtube.com/watch?v=${video.id}`,
                canalTitulo: video.snippet?.channelTitle || null,
                serieTemporal: []
            };
        });

        const canal = publicaciones.find((p) => p.canalTitulo)?.canalTitulo || null;

        let errorSeriesVideos = null;
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        await Promise.all(publicaciones.map(async (publicacion) => {
            const inicioSerie = getInicioSerie30Dias(hoy);
            const inicioIso = formatoFechaIso(inicioSerie);
            const finIso = formatoFechaIso(hoy);

            try {
                const analyticsVideoResponse = await axios.get('https://youtubeanalytics.googleapis.com/v2/reports', {
                    params: {
                        ids: 'channel==MINE',
                        startDate: inicioIso,
                        endDate: finIso,
                        metrics: 'views,likes,dislikes,comments',
                        dimensions: 'day',
                        sort: 'day',
                        filters: `video==${publicacion.id}`
                    },
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    },
                    timeout: 15000
                });

                publicacion.serieTemporal = Array.isArray(analyticsVideoResponse.data?.rows)
                    ? (() => {
                        const filas = analyticsVideoResponse.data.rows;
                        const filasPorFecha = new Map(
                            filas
                                .filter((fila) => Array.isArray(fila) && fila.length >= 5 && typeof fila[0] === 'string')
                                .map((fila) => [fila[0], fila])
                        );
                        const fechasRango = getRangoFechasIso(inicioSerie, hoy);

                        const sumaVistasRango = filas.reduce((acc, fila) => acc + Number(fila[1] || 0), 0);
                        const sumaMeGustaRango = filas.reduce((acc, fila) => acc + Number(fila[2] || 0), 0);
                        const sumaNoMeGustaRango = filas.reduce((acc, fila) => acc + Number(fila[3] || 0), 0);
                        const sumaComentariosRango = filas.reduce((acc, fila) => acc + Number(fila[4] || 0), 0);

                        const baseVistas = Math.max(Number(publicacion.vistas || 0) - sumaVistasRango, 0);
                        const baseMeGusta = Math.max(Number(publicacion.meGusta || 0) - sumaMeGustaRango, 0);
                        const baseNoMeGusta = Math.max(Number(publicacion.noMeGusta || 0) - sumaNoMeGustaRango, 0);
                        const baseComentarios = Math.max(Number(publicacion.comentarios || 0) - sumaComentariosRango, 0);

                        let vistasAcumuladas = baseVistas;
                        let meGustaAcumulados = baseMeGusta;
                        let noMeGustaAcumulados = baseNoMeGusta;
                        let comentariosAcumulados = baseComentarios;

                        return fechasRango.map((fechaIso) => {
                            // Convertir fechaIso a Date para comparar
                            const fechaActual = new Date(fechaIso + 'T00:00:00Z');
                            
                            // Si la fecha es anterior a la publicación, mostrar 0
                            if (publicacion.fechaPublicacion && fechaActual < publicacion.fechaPublicacion) {
                                return {
                                    fecha: fechaIso,
                                    vistas: 0,
                                    meGusta: 0,
                                    noMeGusta: 0,
                                    comentarios: 0,
                                    vistasTotal: 0,
                                    meGustaTotal: 0,
                                    noMeGustaTotal: 0,
                                    comentariosTotal: 0
                                };
                            }
                            
                            const fila = filasPorFecha.get(fechaIso) || [fechaIso, 0, 0, 0, 0];
                            const vistasDia = Number(fila[1] || 0);
                            const meGustaDia = Number(fila[2] || 0);
                            const noMeGustaDia = Number(fila[3] || 0);
                            const comentariosDia = Number(fila[4] || 0);

                            vistasAcumuladas += vistasDia;
                            meGustaAcumulados += meGustaDia;
                            noMeGustaAcumulados += noMeGustaDia;
                            comentariosAcumulados += comentariosDia;

                            return {
                                fecha: fila[0],
                                vistas: vistasDia,
                                meGusta: meGustaDia,
                                noMeGusta: noMeGustaDia,
                                comentarios: comentariosDia,
                                vistasTotal: vistasAcumuladas,
                                meGustaTotal: meGustaAcumulados,
                                noMeGustaTotal: noMeGustaAcumulados,
                                comentariosTotal: comentariosAcumulados
                            };
                        });
                    })()
                    : [];
            } catch (analyticsErr) {
                const statusAnalytics = analyticsErr.response?.status;
                const detalleAnalytics = analyticsErr.response?.data?.error?.message || analyticsErr.message;

                if (!errorSeriesVideos) {
                    if (esErrorApiAnalyticsNoHabilitada(analyticsErr)) {
                        errorSeriesVideos = 'La API de YouTube Analytics no está habilitada en Google Cloud. Actívala y espera unos minutos para ver las series por video.';
                    } else if (statusAnalytics === 403 || statusAnalytics === 401) {
                        errorSeriesVideos = 'Para ver la evolución diaria por video, vuelve a vincular YouTube y acepta permisos de Analytics.';
                    } else {
                        errorSeriesVideos = 'No se pudo cargar la evolución diaria para algunos videos en este momento.';
                    }
                }

                if (debeTrazarAvisoAnalytics()) {
                    console.error(`Error YouTube Analytics (${publicacion.id}):`, detalleAnalytics);
                }

                publicacion.serieTemporal = [];
            }
        }));

        return res.render('estadisticas-publicaciones', {
            publicaciones,
            totalPublicaciones: publicaciones.length,
            errorSeriesVideos,
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
                errorSeriesVideos: null,
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