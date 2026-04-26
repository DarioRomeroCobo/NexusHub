const mostrarVincularTiktok = async (req, res, next) => {
    try {
        if (req.session.isLoggedIn !== true || !req.session.correo) {
            return res.redirect('/usuario/inicio-sesion');
        }

        return res.render('vincular-tiktok', {
            error: req.query.error || null
        });
    } catch (err) {
        console.error('Error al mostrar vinculación TikTok:', err);
        return next(err);
    }
};

module.exports = {
    mostrarVincularTiktok
};
