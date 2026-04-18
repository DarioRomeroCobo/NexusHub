const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
    mostrarRegistro,
    registrarUsuario
} = require('../controllers/registroController');

const {
    mostrarInicioSesion,
    mostrarInicioUsuario,
    validarSesion,
    logout
} = require('../controllers/inicioSesionController');

const { getUsuarios } = require('../controllers/userController');

const {
    mostrarSubirVideo,
    mostrarPublicacionVideo,
    cargarVideo,
    publicarVideo
} = require('../controllers/videoController');

const {
    mostrarVincularYoutube,
    iniciarVinculacionYoutube,
    callbackYoutubeOAuth,
    desvincularYoutube,
    subirVideoYoutube
} = require('../controllers/youtubeController');

const { verificarAutenticacion, verificarNoAutenticado } = require("../utils/middleware-auth");
const upload = multer({ storage: multer.memoryStorage() });


router.get("/registro", verificarNoAutenticado, mostrarRegistro);
router.get("/ver-usuarios", getUsuarios);
router.get("/inicio-sesion", verificarNoAutenticado, mostrarInicioSesion);
router.get("/subir-video", verificarAutenticacion, mostrarSubirVideo);
router.get("/publicar-video", verificarAutenticacion, mostrarPublicacionVideo);
router.post("/api/publicar-video", verificarAutenticacion, upload.single('video'), publicarVideo);
router.post("/api/", registrarUsuario);
router.post("/api/login", validarSesion);
router.get("/logout", logout);
router.get("/inicio", verificarAutenticacion, mostrarInicioUsuario);

router.post("/api/cargar-video", verificarAutenticacion, upload.single('video'), cargarVideo);

router.get("/vincular-youtube", verificarAutenticacion, mostrarVincularYoutube);
router.get("/youtube/auth", verificarAutenticacion, iniciarVinculacionYoutube);
router.get("/youtube/callback", verificarAutenticacion, callbackYoutubeOAuth);
router.post("/youtube/desvincular", verificarAutenticacion, desvincularYoutube);
router.post("/api/youtube/subir-video", verificarAutenticacion, subirVideoYoutube);
module.exports = router;