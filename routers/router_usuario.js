const express = require('express');
const router = express.Router();
const db = require("../utils/middleware-bd");
const multer = require('multer');
const {mostrarRegistro, getUsuarios, registrarUsuario, cargarVideo  } = require('../controllers/usuarioController');

const upload = multer({ storage: multer.memoryStorage() });
// GET - muestra el formulario
router.get("/registro", mostrarRegistro);
router.get("/ver-usuarios", getUsuarios);
router.post("/api/", registrarUsuario);
router.post("/api/cargar-video", upload.single('video'),cargarVideo);
module.exports = router;