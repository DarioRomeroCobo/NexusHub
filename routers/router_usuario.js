const express = require('express');
const router = express.Router();
const db = require("../utils/middleware-bd");


const multer = require('multer');
const { mostrarRegistro, getUsuarios, registrarUsuario, cargarVideo, mostrarInicioSesion, mostrarInicioUsuario, mostrarSubirVideo, validarSesion, logout, mostrarVincularYoutube } = require('../controllers/usuarioController');

const { verificarAutenticacion, verificarNoAutenticado } = require("../utils/middleware-auth");
const upload = multer({ storage: multer.memoryStorage() });
// GET - muestra el formulario
router.get("/registro", verificarNoAutenticado, mostrarRegistro);
router.get("/ver-usuarios",getUsuarios);
router.get("/inicio-sesion", verificarNoAutenticado, mostrarInicioSesion);
router.get("/subir-video", verificarAutenticacion, mostrarSubirVideo);
router.post("/api/", registrarUsuario);
router.post("/api/login", validarSesion);
router.get("/logout", logout);
router.get("/inicio", verificarAutenticacion, mostrarInicioUsuario);

router.post("/api/cargar-video", verificarAutenticacion, upload.single('video'), cargarVideo);

router.get("/vincular-youtube", mostrarVincularYoutube);
module.exports = router;