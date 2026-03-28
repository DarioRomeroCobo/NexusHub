const crypto = require('crypto');
const axios = require('axios');
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

const mostrarVincularYoutube = async (req, res, next) => {
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
};

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

        return res.redirect('/usuario/vincular-youtube');
    } catch (err) {
        const err_str = (err ? err.message : "Ha habido un error no identificado de vinculación.");

        const errorCodificado = encodeURIComponent(err_str);
        return res.redirect(`/usuario/vincular-youtube?error=${errorCodificado}`);
    }
};

const desvincularYoutube = async (req, res, next) => {
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
};

module.exports = {
    mostrarVincularYoutube,
    iniciarVinculacionYoutube,
    callbackYoutubeOAuth,
    desvincularYoutube
};
