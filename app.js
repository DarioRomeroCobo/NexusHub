"use strict";

const express = require("express");
const favicon = require("serve-favicon");
const path = require("path");
const fs = require('fs');
const multer = require("multer");
const mysqlSession = require("express-mysql-session");
const session = require("express-session");
const pool = require("./connection.js");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: "inicio_sesion_es_seguro",
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, 
        maxAge: 3600000 
    }
}));

app.use((req, res, next) => {
    res.locals.user = req.session.usuarioId || null;
    next();
});

const MySqlStore = mysqlSession(session);

const sessionStore = new MySqlStore({
    expiration: 1000 * 60 * 60,
    checkExpirationInterval: 1000 * 60 * 10
}, pool);

const router_usuarios = require("./routers/router_usuario.js");

app.use("/usuario", router_usuarios);

//RENDER BASICOS
app.get("/", async function (req, res, next) {
    res.render("bienvenida");
});

app.get("/bienvenida", async function (req, res, next) {
    res.render("bienvenida");
});

app.use((req, res, next) =>{
    res.status(404).render('error', {
        titulo: 'Pagina no encontrada',
        mensaje: 'La pagina solicitada no esta disponible',
        codigo: 404
    });
});

app.use((err, req, res, next) =>{
    console.error(err.stack);
    res.status(500).render('error', {
        titulo: 'Error interno del server',
        mensaje: 'Ups! Algo no fue bien...',
        codigo: 500
    });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log("Servidor iniciado en puerto " + port);
});