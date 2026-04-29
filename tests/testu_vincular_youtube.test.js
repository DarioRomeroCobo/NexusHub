jest.mock('../utils/middleware-bd', () => ({
    query: jest.fn()
}));

jest.mock('axios', () => ({
    post: jest.fn(),
    get: jest.fn()
}));

jest.mock('crypto', () => ({
    randomBytes: jest.fn()
}));

const axios = require('axios');
const crypto = require('crypto');
const db = require('../utils/middleware-bd');
const {
    mostrarVincularYoutube,
    iniciarVinculacionYoutube,
    callbackYoutubeOAuth
} = require('../controllers/youtubeController');

const mockRes = () => {
    const res = {};
    res.render = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    return res;
};

const mockReq = ({ session = {}, query = {}, protocol = 'http', host = 'localhost:3000' } = {}) => ({
    session: {
        save: jest.fn((callback) => callback(null)),
        ...session
    },
    query,
    protocol,
    get: jest.fn((headerName) => (headerName === 'host' ? host : undefined))
});

const mockNext = () => jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.YOUTUBE_REDIRECT_URI;
    delete process.env.GOOGLE_REDIRECT_URI;
});

describe('mostrarVincularYoutube', () => {
    test('redirige al inicio de sesión si no hay sesión activa', async () => {
        const req = mockReq({ session: { isLoggedIn: false, correo: null } });
        const res = mockRes();
        const next = mockNext();

        await mostrarVincularYoutube(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/usuario/inicio-sesion');
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('carga la vinculación y renderiza la vista', async () => {
        const req = mockReq({
            session: { isLoggedIn: true, correo: '  USUARIO@correo.com  ' },
            query: { error: 'mensaje' }
        });
        const res = mockRes();
        const next = mockNext();
        const vinculacion = {
            channel_title: 'Canal Nexus',
            channel_photo_url: 'https://img.test/canal.jpg',
            linked_at: new Date('2026-01-01T10:00:00.000Z')
        };

        db.query.mockResolvedValueOnce([vinculacion]);

        await mostrarVincularYoutube(req, res, next);

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM VinculacionYoutube'),
            ['usuario@correo.com']
        );
        expect(res.render).toHaveBeenCalledWith('vincular-youtube', {
            vinculacion,
            error: 'mensaje'
        });
        expect(next).not.toHaveBeenCalled();
    });

    test('devuelve vinculacion nula si no hay registro', async () => {
        const req = mockReq({ session: { isLoggedIn: true, correo: 'usuario@correo.com' } });
        const res = mockRes();
        const next = mockNext();

        db.query.mockResolvedValueOnce([]);

        await mostrarVincularYoutube(req, res, next);

        expect(res.render).toHaveBeenCalledWith('vincular-youtube', {
            vinculacion: null,
            error: null
        });
    });

    test('propaga errores inesperados al middleware next', async () => {
        const req = mockReq({ session: { isLoggedIn: true, correo: 'usuario@correo.com' } });
        const res = mockRes();
        const next = mockNext();
        const error = new Error('fallo BD');

        db.query.mockRejectedValueOnce(error);

        await mostrarVincularYoutube(req, res, next);

        expect(next).toHaveBeenCalledWith(error);
        expect(res.render).not.toHaveBeenCalled();
    });
});

describe('iniciarVinculacionYoutube', () => {
    test('redirige al login si no hay sesión activa', async () => {
        const req = mockReq({ session: { isLoggedIn: false, correo: null } });
        const res = mockRes();
        const next = mockNext();

        await iniciarVinculacionYoutube(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/usuario/inicio-sesion');
        expect(next).not.toHaveBeenCalled();
    });

    test('redirige con error si falta el client id', async () => {
        const req = mockReq({ session: { isLoggedIn: true, correo: 'usuario@correo.com' } });
        const res = mockRes();
        const next = mockNext();

        await iniciarVinculacionYoutube(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/usuario/vincular-youtube?error=Error%20de%20vinculaci%C3%B3n');
        expect(req.session.youtubeOAuthState).toBeUndefined();
        expect(next).not.toHaveBeenCalled();
    });

    test('genera el estado OAuth y redirige a Google con los parametros correctos', async () => {
        process.env.YOUTUBE_CLIENT_ID = 'client-123';
        process.env.YOUTUBE_REDIRECT_URI = 'https://nexushub.test/usuario/youtube/callback';

        const stateBuffer = Buffer.from('abcdefghijklmnopqrstuvwx');
        const expectedState = stateBuffer.toString('hex');
        crypto.randomBytes.mockReturnValueOnce(stateBuffer);

        const req = mockReq({ session: { isLoggedIn: true, correo: 'usuario@correo.com' } });
        const res = mockRes();
        const next = mockNext();

        await iniciarVinculacionYoutube(req, res, next);

        expect(crypto.randomBytes).toHaveBeenCalledWith(24);
        expect(req.session.youtubeOAuthState).toBe(expectedState);
        expect(req.session.save).toHaveBeenCalled();

        const redirectUrl = res.redirect.mock.calls[0][0];
        const parsedUrl = new URL(redirectUrl);

        expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(parsedUrl.searchParams.get('client_id')).toBe('client-123');
        expect(parsedUrl.searchParams.get('redirect_uri')).toBe('https://nexushub.test/usuario/youtube/callback');
        expect(parsedUrl.searchParams.get('response_type')).toBe('code');
        const scope = parsedUrl.searchParams.get('scope') || '';
        expect(scope).toContain('https://www.googleapis.com/auth/youtube.readonly');
        expect(scope).toContain('https://www.googleapis.com/auth/youtube.upload');
        expect(parsedUrl.searchParams.get('access_type')).toBe('offline');
        expect(parsedUrl.searchParams.get('include_granted_scopes')).toBe('true');
        expect(parsedUrl.searchParams.get('prompt')).toBe('consent');
        expect(parsedUrl.searchParams.get('state')).toBe(expectedState);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('callbackYoutubeOAuth', () => {
    test('redirige al login si no hay sesión activa', async () => {
        const req = mockReq({ session: { isLoggedIn: false, correo: null } });
        const res = mockRes();
        const next = mockNext();

        await callbackYoutubeOAuth(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/usuario/inicio-sesion');
        expect(next).not.toHaveBeenCalled();
    });

    test('si el state no coincide vuelve a la pantalla de vinculación', async () => {
        const req = mockReq({
            session: {
                isLoggedIn: true,
                correo: 'usuario@correo.com',
                youtubeOAuthState: 'state-esperado'
            },
            query: { code: 'codigo', state: 'state-incorrecto' }
        });
        const res = mockRes();
        const next = mockNext();

        await callbackYoutubeOAuth(req, res, next);

        expect(req.session.youtubeOAuthState).toBeNull();
        expect(res.redirect).toHaveBeenCalledWith('/usuario/vincular-youtube?error=1');
        expect(axios.post).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('si no llega access_token redirige sin guardar la vinculación', async () => {
        process.env.YOUTUBE_CLIENT_ID = 'client-123';
        process.env.YOUTUBE_CLIENT_SECRET = 'secret-123';
        process.env.YOUTUBE_REDIRECT_URI = 'https://nexushub.test/usuario/youtube/callback';

        const req = mockReq({
            session: {
                isLoggedIn: true,
                correo: 'usuario@correo.com',
                youtubeOAuthState: 'state-esperado'
            },
            query: { code: 'codigo', state: 'state-esperado' }
        });
        const res = mockRes();
        const next = mockNext();

        axios.post.mockResolvedValueOnce({ data: {} });

        await callbackYoutubeOAuth(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/usuario/vincular-youtube?error=1');
        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('guarda la vinculación, actualiza la sesión y redirige', async () => {
        process.env.YOUTUBE_CLIENT_ID = 'client-123';
        process.env.YOUTUBE_CLIENT_SECRET = 'secret-123';
        process.env.YOUTUBE_REDIRECT_URI = 'https://nexushub.test/usuario/youtube/callback';

        const req = mockReq({
            session: {
                isLoggedIn: true,
                correo: '  Usuario@Correo.com  ',
                youtubeOAuthState: 'state-esperado'
            },
            query: { code: 'codigo', state: 'state-esperado' }
        });
        const res = mockRes();
        const next = mockNext();

        req.session.save.mockImplementation((callback) => callback(null));

        axios.post.mockResolvedValueOnce({
            data: {
                access_token: 'access-token',
                refresh_token: 'refresh-token',
                expires_in: 7200
            }
        });
        axios.get.mockResolvedValueOnce({
            data: {
                items: [{
                    snippet: {
                        title: 'Canal Nexus',
                        thumbnails: {
                            high: { url: 'https://img.test/canal.jpg' }
                        }
                    }
                }]
            }
        });
        db.query.mockResolvedValueOnce([]);

        await callbackYoutubeOAuth(req, res, next);

        expect(axios.post).toHaveBeenCalledWith(
            'https://oauth2.googleapis.com/token',
            expect.stringContaining('code=codigo'),
            expect.objectContaining({
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 15000
            })
        );
        expect(axios.get).toHaveBeenCalledWith(
            'https://www.googleapis.com/youtube/v3/channels',
            expect.objectContaining({
                params: { part: 'snippet,brandingSettings', mine: true },
                headers: { Authorization: 'Bearer access-token' },
                timeout: 15000
            })
        );

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('MERGE VinculacionYoutube'),
            [
                'usuario@correo.com',
                'access-token',
                'refresh-token',
                expect.any(Date),
                'Canal Nexus',
                'https://img.test/canal.jpg',
                expect.any(Date)
            ]
        );
        expect(req.session.youtubeVinculado).toBe(true);
        expect(req.session.youtubeChannelTitle).toBe('Canal Nexus');
        expect(res.redirect).toHaveBeenCalledWith('/usuario/vincular-youtube');
        expect(next).not.toHaveBeenCalled();
    });
});