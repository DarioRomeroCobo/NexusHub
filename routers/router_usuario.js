const express = require('express');
const router = express.Router();
const db = require("../utils/middleware-bd");
const { mostrarRegistro, getUsuarios, registrarUsuario, mostrarInicioSesion, validarSesion, logout } = require('../controllers/usuarioController');
const { verificarAutenticacion, verificarNoAutenticado } = require("../utils/middleware-auth");

// GET - muestra el formulario
router.get("/registro", verificarNoAutenticado, mostrarRegistro);
router.get("/ver-usuarios",getUsuarios);
router.get("/inicio-sesion", verificarNoAutenticado, mostrarInicioSesion);
router.post("/api/", registrarUsuario);
router.post("/api/login", validarSesion);
router.get("/logout", logout);

module.exports = router;