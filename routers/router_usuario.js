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
    mostrarGestorArchivos,
    cargarVideo,
    cargarFoto,
    cargarArchivo
} = require('../controllers/archivoController');

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
router.get("/subir-video", verificarAutenticacion, mostrarGestorArchivos);
router.post("/api/", registrarUsuario);
router.post("/api/login", validarSesion);
router.get("/logout", logout);
router.get("/inicio", verificarAutenticacion, mostrarInicioUsuario);

router.post("/api/cargar-video", verificarAutenticacion, upload.single('video'), cargarVideo);
router.post("/api/cargar-foto", verificarAutenticacion, upload.single('foto'), cargarFoto);

router.get("/vincular-youtube", verificarAutenticacion, mostrarVincularYoutube);
router.get("/youtube/auth", verificarAutenticacion, iniciarVinculacionYoutube);
router.get("/youtube/callback", verificarAutenticacion, callbackYoutubeOAuth);
router.post("/youtube/desvincular", verificarAutenticacion, desvincularYoutube);
router.post("/api/youtube/subir-video", verificarAutenticacion, subirVideoYoutube);
module.exports = router;