// Middleware para verificar si el usuario está autenticado
const verificarAutenticacion = (req, res, next) => {
    if (req.session.usuarioId && req.session.isLoggedIn) {
        return next();
    }
    res.redirect("/usuario/inicio-sesion");
};

// Middleware para verificar si el usuario NO está autenticado
const verificarNoAutenticado = (req, res, next) => {
    if (!req.session.usuarioId && !req.session.isLoggedIn) {
        return next();
    }
    res.redirect("/inicio-usuario");
};

module.exports = { verificarAutenticacion, verificarNoAutenticado };
