const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const db = require('../utils/middleware-bd');

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
            return res.status(401).json({ ok: false, error: 'Debes iniciar sesion para continuar' });
        }

        const correoUsuario = String(req.session.correo).trim().toLowerCase();
        const videoId = Number.parseInt(req.body.videoId, 10);
        const privacidad = String(req.body.privacyStatus || 'private').toLowerCase();

        if (!Number.isFinite(videoId) || videoId <= 0) {
            return res.status(400).json({ ok: false, error: 'videoId es obligatorio y debe ser numerico' });
        }

        if (!['private', 'public', 'unlisted'].includes(privacidad)) {
            return res.status(400).json({ ok: false, error: 'privacyStatus no valido' });
        }

        const tokenData = await getAccessTokenVigente(req, correoUsuario);
        if (!tokenData.ok) {
            return res.status(tokenData.status || 400).json({ ok: false, error: tokenData.error });
        }

        const videos = await db.query(
            `SELECT id_video, nombre_video, url_video
             FROM VideosUsuario
             WHERE id_video = @p0 AND correo_usuario = @p1`,
            [videoId, correoUsuario]
        );

        const video = Array.isArray(videos) && videos.length > 0 ? videos[0] : null;
        if (!video) {
            return res.status(404).json({ ok: false, error: 'No se encontro el video solicitado' });
        }

        const descarga = await axios.get(video.url_video, {
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

        const formData = new FormData();
        formData.append('snippet', JSON.stringify(metadata.snippet), {
            contentType: 'application/json'
        });
        formData.append('status', JSON.stringify(metadata.status), {
            contentType: 'application/json'
        });
        formData.append('video', Buffer.from(descarga.data), {
            filename: video.nombre_video || 'video.mp4',
            contentType: 'video/mp4'
        });

        const youtubeResponse = await axios.post(
            'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status',
            formData,
            {
                headers: {
                    Authorization: `Bearer ${tokenData.accessToken}`,
                    ...formData.getHeaders()
                },
                maxBodyLength: Infinity,
                timeout: 180000
            }
        );

        return res.status(200).json({
            ok: true,
            mensaje: 'Video subido a YouTube correctamente',
            youtubeVideoId: youtubeResponse.data?.id || null,
            youtubeUrl: youtubeResponse.data?.id ? `https://www.youtube.com/watch?v=${youtubeResponse.data.id}` : null
        });
    } catch (err) {
        const estado = err.response?.status;
        const detalle = err.response?.data?.error?.message || err.message;

        if (estado === 401 || estado === 403) {
            return res.status(estado).json({
                ok: false,
                error: 'No autorizado por YouTube. Vuelve a vincular tu cuenta.',
                detalle
            });
        }

        console.error('Error al subir video a YouTube:', detalle);
        return res.status(500).json({ ok: false, error: 'No se pudo subir el video a YouTube', detalle });
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
    subirVideoYoutube,
    getAccessTokenVigente
};
