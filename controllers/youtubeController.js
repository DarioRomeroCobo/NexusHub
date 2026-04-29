const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const db = require('../utils/middleware-bd');
const AzureBlobStorage = require('../utils/azure-blob');

const CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=almacenamientonexushub;AccountKey=9JbBzi0ph16RzsPC7X3zRTJij0aCadWGY+H/a17Rcy3zGzqZvncqL9GUTv9jhpJ+UqBIaJF4n2XT+AStllDGeg==;EndpointSuffix=core.windows.net';
const azureBlob = new AzureBlobStorage(CONNECTION_STRING);
const MAX_DURACION_SEGUNDOS = 12 * 60 * 60;

const YOUTUBE_SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
    'https://www.googleapis.com/auth/youtube.upload'
];

const getYoutubeOAuthConfig = (req) => {
    const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
    const redirectUri = process.env.YOUTUBE_REDIRECT_URI
        || process.env.GOOGLE_REDIRECT_URI
        || `${req.protocol}://${req.get('host')}/usuario/youtube/callback`;

    return { clientId, clientSecret, redirectUri };
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

    if (!vinculacion.refresh_token) {
        return { ok: false, status: 401, error: 'Tu vinculacion de YouTube ha expirado. Vuelve a vincular tu cuenta.' };
    }

    const { clientId, clientSecret } = getYoutubeOAuthConfig(req);
    if (!clientId || !clientSecret) {
        return { ok: false, status: 500, error: 'Falta configuracion OAuth de YouTube en el servidor' };
    }


    try {
        const tokenResponse = await axios.post(
            'https://oauth2.googleapis.com/token',
            new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: String(vinculacion.refresh_token),
                grant_type: 'refresh_token'
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 15000
            }
        );


        const nuevoAccessToken = tokenResponse.data?.access_token;
        const nuevoRefreshToken = tokenResponse.data?.refresh_token;
        const expiresIn = Number(tokenResponse.data?.expires_in || 3600);

        if (!nuevoAccessToken) {
            return { ok: false, status: 401, error: 'No se pudo renovar el token de YouTube' };
        }


        const nuevoExpiresAt = new Date(Date.now() + expiresIn * 1000);
        await actualizarTokensYoutube(correoUsuario, nuevoAccessToken, nuevoExpiresAt, nuevoRefreshToken || null);

        return { ok: true, accessToken: nuevoAccessToken };
    } catch (err) {
        const errorData = err.response?.data;
        const errorDesc = errorData?.error_description || errorData?.error || err.message;
        
        if (errorData?.error === 'invalid_grant') {
            return { ok: false, status: 401, error: 'Tu vinculacion de YouTube ha expirado o es inválida. Por favor, vuelve a vincular tu cuenta en la sección de vinculaciones.' };
        }
        
        throw err;
    }
};

const mostrarVincularYoutube = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            return res.redirect('/usuario/inicio-sesion');
        }

        const correoUsuario = String(req.session.correo).trim().toLowerCase();
        
        const resultado = await db.query(
            `SELECT channel_title, channel_photo_url, linked_at 
             FROM VinculacionYoutube 
             WHERE correo_usuario = @p0`,
            [correoUsuario]
        );

        const vinculacion = resultado && resultado.length > 0 ? resultado[0] : null;

        res.render('vincular-youtube', { 
            vinculacion,
            error: req.query.error || null // Por si quieres pasar errores por URL
        });

    } catch (err) {
        console.error("Error al mostrar vinculación Youtube:", err);
        next(err);
    }
};

/*const mostrarVincularYoutube = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            return res.redirect('/usuario/inicio-sesion');
        }


        //Hacer un select para obtener la información de vinculación del usuario, si existe, para mostrarla en la vista (nombre canal, foto canal, fecha vinculación, etc)
        //Si no existe, dar un error y mostrar la vista sin información de vinculación, solo con el botón para iniciar la vinculación
    


        res.render('vincular-youtube');
    } catch (err) {
        next(err);
    }
};*/

const iniciarVinculacionYoutube = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            return res.redirect('/usuario/inicio-sesion');
        }

        const { clientId, redirectUri } = getYoutubeOAuthConfig(req);
        if (!clientId) {
           throw new Error("Error de vinculación");
        }

        const state = crypto.randomBytes(24).toString('hex');
        req.session.youtubeOAuthState = state;

        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: YOUTUBE_SCOPES.join(' '),
            access_type: 'offline',
            include_granted_scopes: 'true',
            prompt: 'consent',
            state
        });

        const redirect = res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);

        return redirect;
    } catch (err) {
        const err_str = (err ? err.message : "Ha habido un error no identificado de vinculación.");

        const errorCodificado = encodeURIComponent(err_str);
        return res.redirect(`/usuario/vincular-youtube?error=${errorCodificado}`);
    }
};

const callbackYoutubeOAuth = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            return res.redirect('/usuario/inicio-sesion');
        }

        // 1. Verificar si Google devolvió un error (usuario denegó permisos, canceló, etc)
        const { error, error_description, code, state } = req.query;
        
        if (error) {
            console.error("Error de Google OAuth:", error, error_description);
            return res.redirect('/usuario/vincular-youtube?error=1');
        }

        const expectedState = req.session.youtubeOAuthState;
        req.session.youtubeOAuthState = null;

        // 2. Verificar code y state
        if (!code || !state || !expectedState || state !== expectedState) {
            console.error("Error de estado o código:", { hasCode: !!code, hasState: !!state, hasExpectedState: !!expectedState, stateMatch: state === expectedState });
            return res.redirect('/usuario/vincular-youtube?error=1');
        }

        const { clientId, clientSecret, redirectUri } = getYoutubeOAuthConfig(req);
        
        const tokenResponse = await axios.post(
            'https://oauth2.googleapis.com/token',
            new URLSearchParams({
                code: String(code),
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            }).toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
        );

        const accessToken = tokenResponse.data?.access_token;
        const refreshToken = tokenResponse.data?.refresh_token;
        const expiresIn = Number(tokenResponse.data?.expires_in);

        if (!accessToken) {
            console.error("No se obtuvo access_token");
            return res.redirect('/usuario/vincular-youtube?error=1');
        }

        const channelResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: { part: 'snippet,brandingSettings', mine: true },
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 15000
        });

        const firstChannel = channelResponse.data?.items?.[0];
        if (!firstChannel) {
            console.error("No se encontró información del canal");
            return res.redirect('/usuario/vincular-youtube?error=1');
        }
        
        const channelTitle = firstChannel?.snippet?.title || "Canal de YouTube";
        const channelPhotoUrl = firstChannel?.snippet?.thumbnails?.high?.url || null;

        const expiresAt = new Date(Date.now() + (expiresIn || 3600) * 1000);
        const correoUsuario = String(req.session.correo).trim().toLowerCase();
        
        await db.query(
            `MERGE VinculacionYoutube AS target
             USING (SELECT @p0 AS correo_usuario) AS source
             ON target.correo_usuario = source.correo_usuario
             WHEN MATCHED THEN
                 UPDATE SET access_token = @p1, refresh_token = COALESCE(@p2, target.refresh_token),
                            expires_at = @p3, channel_title = @p4, channel_photo_url = @p5, linked_at = @p6
             WHEN NOT MATCHED THEN
                 INSERT (correo_usuario, access_token, refresh_token, expires_at, channel_title, channel_photo_url, linked_at)
                 VALUES (@p0, @p1, COALESCE(@p2, ''), @p3, @p4, @p5, @p6);`,
            [correoUsuario, accessToken, refreshToken || null, expiresAt, channelTitle, channelPhotoUrl, new Date()]
        );

        // --- CLAVE PARA QUE FUNCIONE EL BOTÓN ---
        req.session.youtubeVinculado = true; 
        req.session.youtubeChannelTitle = channelTitle; // Guardamos el nombre para mostrarlo en el botón

        req.session.save((err) => {
            if (err) {
                console.error("Error al guardar sesión:", err);
                return res.redirect('/usuario/vincular-youtube?error=1');
            }
            return res.redirect('/usuario/vincular-youtube');
        });

    } catch (err) {
        console.error("Error en callbackYoutubeOAuth:", err);
        return res.redirect('/usuario/vincular-youtube?error=1');
    }
};

const desvincularYoutube = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            return res.redirect('/usuario/inicio-sesion');
        }

        const correoUsuario = String(req.session.correo).trim().toLowerCase();
        await db.query('DELETE FROM VinculacionYoutube WHERE correo_usuario = @p0', [correoUsuario]);

        // --- LIMPIAMOS LA SESIÓN ---
        req.session.youtubeVinculado = false;
        req.session.youtubeChannelTitle = null;

        req.session.save((err) => {
            if (err) return res.redirect('/usuario/vincular-youtube?error=1');
            return res.redirect('/usuario/vincular-youtube');
        });
    } catch (err) {
        console.error("Error en desvincularYoutube:", err);
        return res.redirect('/usuario/vincular-youtube?error=1');
    }
};

const subirVideoYoutube = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            req.session.mensajeError = 'Debes iniciar sesión para continuar';
            return res.redirect('/usuario/inicio-sesion');
        }

        const correoUsuario = String(req.session.correo).trim().toLowerCase();
        const videoUrl = String(req.body.videoUrl || '').trim();
        const blobUrl = videoUrl.split('?')[0];
        const privacyRaw = req.body.privacyStatus;
        const privacidad = Array.isArray(privacyRaw)
            ? String(privacyRaw[0] || 'private').toLowerCase()
            : String(privacyRaw || 'private').toLowerCase();

        if (!videoUrl) {
            req.session.mensajeError = 'videoUrl es obligatorio';
            return res.redirect('/');
        }

        if (!['private', 'public', 'unlisted'].includes(privacidad)) {
            req.session.mensajeError = 'privacyStatus no válido';
            return res.redirect('/');
        }

        const tituloRaw = String(req.body.titulo || '').trim();
        const descripcionRaw = String(req.body.descripcion || '').trim();

        if (!tituloRaw || !descripcionRaw) {
            req.session.mensajeError = 'Debes completar el título y la descripción antes de publicar en YouTube';
            return res.redirect(`/usuario/publicacion-video?videoUrl=${encodeURIComponent(videoUrl)}`);
        }

        const tokenData = await getAccessTokenVigente(req, correoUsuario);
        if (!tokenData.ok) {
            req.session.mensajeError = tokenData.error;
            return res.redirect('/');
        }

        const videosRaw = await db.query(
            `SELECT nombre_video, url_video, duracion_segundos
             FROM VideosUsuario
             WHERE url_video = @p0 AND correo_usuario = @p1`,
            [blobUrl, correoUsuario]
        );
        const videos = Array.isArray(videosRaw) ? videosRaw : (videosRaw.recordset || []);

        const video = Array.isArray(videos) && videos.length > 0 ? videos[0] : null;
        if (!video) {
            req.session.mensajeError = 'No se encontró el video solicitado';
            return res.redirect('/');
        }

        const duracionSegundos = Number(video.duracion_segundos || 0);
        if (duracionSegundos >= MAX_DURACION_SEGUNDOS) {
            req.session.mensajeError = 'Error: video demasiado largo, debe durar menos de 12 horas';
            return res.redirect(`/usuario/publicacion-video?videoUrl=${encodeURIComponent(videoUrl)}`);
        }

        // Generate SAS URL for download
        const url = new URL(video.url_video);
        const pathParts = url.pathname.split('/').filter(p => p);
        const containerName = pathParts[0];
        const blobName = pathParts.slice(1).join('/');
        const sasUrl = await azureBlob.getBlobSasUrl(containerName, blobName);

        const descarga = await axios.get(sasUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: 1024 * 1024 * 1024
        });

        const titulo = String(req.body.titulo || '').trim().slice(0, 100);
        const descripcion = String(req.body.descripcion || '').trim().slice(0, 5000);
        const etiquetas = Array.isArray(req.body.tags)
            ? req.body.tags
            : String(req.body.tags || '')
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 50);

        const metadata = {
            snippet: {
                title: titulo,
                description: descripcion,
                tags: etiquetas,
                categoryId: '22'
            },
            status: {
                privacyStatus: privacidad,
                selfDeclaredMadeForKids: false
            }
        };

        const form = new FormData();
        form.append('metadata', JSON.stringify(metadata), { contentType: 'application/json' });
        form.append('video', descarga.data, { filename: 'video.mp4', contentType: 'video/mp4' });

        const youtubeResponse = await axios.post(
            'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status',
            form,
            {
                headers: {
                    Authorization: `Bearer ${tokenData.accessToken}`,
                    ...form.getHeaders()  // Esto establece automáticamente el Content-Type a multipart/form-data
                },
                maxBodyLength: Infinity,
                timeout: 180000
            }
        );

        req.session.mensajeExito = 'Video subido a YouTube correctamente';
        return res.redirect('/usuario/publicar-video');
    } catch (err) {
        const estado = err.response?.status;
        const detalle = err.response?.data?.error?.message || err.response?.data || err.message;

        console.error('Error completo al subir video a YouTube:', err);
        console.error('Estado:', estado);
        console.error('Detalle:', detalle);

        if (estado === 401 || estado === 403) {
            req.session.mensajeError = 'No autorizado por YouTube. Vuelve a vincular tu cuenta.';
            return res.redirect('/');
        }

        console.error('Error al subir video a YouTube:', detalle);
        req.session.mensajeError = 'No se pudo subir el video a YouTube';
        return res.redirect('/usuario/publicar-video');
    }
};

/*const callbackYoutubeOAuth = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            return res.redirect('/usuario/inicio-sesion');
        }

        const { code, state } = req.query;
        const expectedState = req.session.youtubeOAuthState;
        req.session.youtubeOAuthState = null;

        if (!code) {
            throw new Error("Error de sesión inesperado.");
        }

        if (!state || !expectedState || state !== expectedState) {
            throw new Error("Error de sesión inesperado.");
        }

        const { clientId, clientSecret, redirectUri } = getYoutubeOAuthConfig(req);
        if (!clientId || !clientSecret) {
            throw new Error("Error de vinculación.");
        }

        const tokenResponse = await axios.post(
            'https://oauth2.googleapis.com/token',
            new URLSearchParams({
                code: String(code),
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            }
        );

        const accessToken = tokenResponse.data && tokenResponse.data.access_token;
        const refreshToken = tokenResponse.data && tokenResponse.data.refresh_token;
        const expiresIn = Number(tokenResponse.data && tokenResponse.data.expires_in);

        if (!accessToken) {
            throw new Error("No se ha podido completar la vinculación");
        }

        const channelResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: {
                part: 'snippet,brandingSettings',
                mine: true
            },
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            timeout: 15000
        });

        const firstChannel = channelResponse.data
            && Array.isArray(channelResponse.data.items)
            && channelResponse.data.items.length > 0
            ? channelResponse.data.items[0]
            : null;

        const channelTitle = firstChannel
            && firstChannel.snippet
            && firstChannel.snippet.title
            ? firstChannel.snippet.title
            : null;

        let channelPhotoUrl = null;
        if (firstChannel && firstChannel.snippet && firstChannel.snippet.thumbnails) {
            if (firstChannel.snippet.thumbnails.high) {
                channelPhotoUrl = firstChannel.snippet.thumbnails.high.url;
            } else if (firstChannel.snippet.thumbnails.medium) {
                channelPhotoUrl = firstChannel.snippet.thumbnails.medium.url;
            } else if (firstChannel.snippet.thumbnails.default) {
                channelPhotoUrl = firstChannel.snippet.thumbnails.default.url;
            }
        }

        if (!channelPhotoUrl
            && firstChannel
            && firstChannel.brandingSettings
            && firstChannel.brandingSettings.image
            && firstChannel.brandingSettings.image.bannerImageUrl) {
            channelPhotoUrl = firstChannel.brandingSettings.image.bannerImageUrl;
        }

        const expiresAt = Number.isFinite(expiresIn)
            ? new Date(Date.now() + expiresIn * 1000)
            : new Date(Date.now() + 3600 * 1000);

        const correoUsuario = String(req.session.correo).trim().toLowerCase();
        
        await db.query(
            `MERGE VinculacionYoutube AS target
             USING (SELECT @p0 AS correo_usuario) AS source
             ON target.correo_usuario = source.correo_usuario
             WHEN MATCHED THEN
                 UPDATE SET access_token = @p1,
                            refresh_token = COALESCE(@p2, target.refresh_token),
                            expires_at = @p3,
                            channel_title = @p4,
                            channel_photo_url = @p5,
                            linked_at = @p6
             WHEN NOT MATCHED THEN
                 INSERT (correo_usuario, access_token, refresh_token, expires_at, channel_title, channel_photo_url, linked_at)
                 VALUES (@p0, @p1, COALESCE(@p2, ''), @p3, @p4, @p5, @p6);`,
            [
                correoUsuario,
                accessToken,
                refreshToken || null,
                expiresAt,
                channelTitle,
                channelPhotoUrl,
                new Date()
            ]
        );
        req.session.youtubeVinculado = true; 

        return res.redirect('/usuario/vincular-youtube');
    } catch (err) {
        const err_str = (err ? err.message : "Ha habido un error no identificado de vinculación.");

        const errorCodificado = encodeURIComponent(err_str);
        return res.redirect(`/usuario/vincular-youtube?error=${errorCodificado}`);
    }
};*/

/*const desvincularYoutube = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            return res.redirect('/usuario/inicio-sesion');
        }

        const correoUsuario = String(req.session.correo).trim().toLowerCase();
        await db.query(
            'DELETE FROM VinculacionYoutube WHERE correo_usuario = @p0',
            [correoUsuario]
        );

        return res.redirect('/usuario/vincular-youtube');
    } catch (err) {
        next(err);
    }
};*/

module.exports = {
    mostrarVincularYoutube,
    iniciarVinculacionYoutube,
    callbackYoutubeOAuth,
    desvincularYoutube,
    subirVideoYoutube,
    getAccessTokenVigente
};
