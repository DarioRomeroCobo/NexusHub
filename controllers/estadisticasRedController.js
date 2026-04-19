const mostrarEstadisticas = (req, res) => {
    res.render('estadisticas-redsocial', {
        error: null,
        redes: [
            {
                plataforma: "YouTube",
                usuario: "MiCanal",
                seguidores: 1200,
                vistas: 50000,
                likes: 3000,
                comentarios: 400
            }
        ]
    });
};

module.exports = {
    mostrarEstadisticas
};