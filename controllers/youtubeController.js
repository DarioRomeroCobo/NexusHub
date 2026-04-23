const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const db = require('../utils/middleware-bd');
const AzureBlobStorage = require('../utils/azure-blob');

const CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=almacenamientonexushub;AccountKey=9JbBzi0ph16RzsPC7X3zRTJij0aCadWGY+H/a17Rcy3zGzqZvncqL9GUTv9jhpJ+UqBIaJF4n2XT+AStllDGeg==;EndpointSuffix=core.windows.net';
const azureBlob = new AzureBlobStorage(CONNECTION_STRING);

const YOUTUBE_SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
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

    let tokenResponse;
    try {
        tokenResponse = await axios.post(
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
    } catch (err) {
        console.error('Error al renovar token de YouTube:', err.response?.data || err.message);
        return { ok: false, status: 401, error: 'No se pudo renovar el token de YouTube. Vuelve a vincular tu cuenta.' };
    }

    const nuevoAccessToken = tokenResponse.data?.access_token;
    const nuevoRefreshToken = tokenResponse.data?.refresh_token;
    const expiresIn = Number(tokenResponse.data?.expires_in || 3600);

    if (!nuevoAccessToken) {
        return { ok: false, status: 401, error: 'No se pudo renovar el token de YouTube. Vuelve a vincular tu cuenta.' };
    }

    const nuevoExpiresAt = new Date(Date.now() + expiresIn * 1000);
    await actualizarTokensYoutube(correoUsuario, nuevoAccessToken, nuevoExpiresAt, nuevoRefreshToken || null);

    return { ok: true, accessToken: nuevoAccessToken };
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
            return res.redirect('/usuario/vincular-youtube');
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

        return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    } catch (err) {
        next(err);
    }
};

const callbackYoutubeOAuth = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            return res.redirect('/usuario/inicio-sesion');
        }

        const { code, state } = req.query;
        const expectedState = req.session.youtubeOAuthState;
        req.session.youtubeOAuthState = null;

        if (!code || !state || !expectedState || state !== expectedState) {
            return res.redirect('/usuario/vincular-youtube');
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

        if (!accessToken) return res.redirect('/usuario/vincular-youtube');

        const channelResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: { part: 'snippet,brandingSettings', mine: true },
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 15000
        });

        const firstChannel = channelResponse.data?.items?.[0];
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
            if (err) return next(err);
            return res.redirect('/usuario/vincular-youtube');
        });

    } catch (err) {
        next(err);
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
            if (err) return next(err);
            return res.redirect('/usuario/vincular-youtube');
        });
    } catch (err) {
        next(err);
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
        const privacidad = String(req.body.privacyStatus || 'private').toLowerCase();

        if (!videoUrl) {
            req.session.mensajeError = 'videoUrl es obligatorio';
            return res.redirect('/usuario/bienvenida');
        }

        if (!['private', 'public', 'unlisted'].includes(privacidad)) {
            req.session.mensajeError = 'privacyStatus no válido';
            return res.redirect('/usuario/bienvenida');
        }

        const tokenData = await getAccessTokenVigente(req, correoUsuario);
        if (!tokenData.ok) {
            req.session.mensajeError = tokenData.error;
            return res.redirect('/usuario/bienvenida');
        }

        const videos = await db.query(
            `SELECT nombre_video, url_video
             FROM VideosUsuario
             WHERE url_video = @p0 AND correo_usuario = @p1`,
            [blobUrl, correoUsuario]
        );

        const video = Array.isArray(videos) && videos.length > 0 ? videos[0] : null;
        if (!video) {
            req.session.mensajeError = 'No se encontró el video solicitado';
            return res.redirect('/usuario/bienvenida');
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

        const titulo = String(req.body.title || video.nombre_video || 'Video NexusHub').slice(0, 100);
        const descripcion = String(req.body.description || 'Subido desde NexusHub').slice(0, 5000);
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
        return res.redirect('/usuario/bienvenida');
    } catch (err) {
        const estado = err.response?.status;
        const detalle = err.response?.data?.error?.message || err.response?.data || err.message;

        console.error('Error completo al subir video a YouTube:', err);
        console.error('Estado:', estado);
        console.error('Detalle:', detalle);

        if (estado === 401 || estado === 403) {
            req.session.mensajeError = 'No autorizado por YouTube. Vuelve a vincular tu cuenta.';
            return res.redirect('/usuario/bienvenida');
        }

        console.error('Error al subir video a YouTube:', detalle);
        req.session.mensajeError = 'No se pudo subir el video a YouTube';
        return res.redirect('/usuario/bienvenida');
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
            return res.redirect('/usuario/vincular-youtube');
        }

        if (!state || !expectedState || state !== expectedState) {
            return res.redirect('/usuario/vincular-youtube');
        }

        const { clientId, clientSecret, redirectUri } = getYoutubeOAuthConfig(req);
        if (!clientId || !clientSecret) {
            return res.redirect('/usuario/vincular-youtube');
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
            return res.redirect('/usuario/vincular-youtube');
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
        next(err);
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
    subirVideoYoutube
};
