// Middleware para verificar si el usuario está autenticado
const verificarAutenticacion = (req, res, next) => {
    if (req.session.isLoggedIn === true) {
        return next();
    }
    if (req.originalUrl.startsWith("/usuario/api/")) {
        return res.status(401).json({ ok: false, error: "Debes iniciar sesion para continuar" });
    }
    res.redirect("/usuario/inicio-sesion");
};

// Middleware para verificar si el usuario NO está autenticado
const verificarNoAutenticado = (req, res, next) => {
    if (req.session.isLoggedIn !== true) {
        return next();
    }
    res.redirect("/inicio-usuario");
};

module.exports = { verificarAutenticacion, verificarNoAutenticado };
