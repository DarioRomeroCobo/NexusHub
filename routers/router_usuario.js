const express = require('express');
const router = express.Router();
const db = require("../utils/middleware-bd");
const {mostrarRegistro, getUsuarios, registrarUsuario, mostrarInicioSesion, validarSesion  } = require('../controllers/usuarioController');

// GET - muestra el formulario
router.get("/registro", mostrarRegistro);
router.get("/ver-usuarios", getUsuarios);
router.get("/inicio-sesion", mostrarInicioSesion);
router.post("/api/", registrarUsuario);
router.post("/api/login", validarSesion);

module.exports = router;