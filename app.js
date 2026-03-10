"use strict";

const express = require("express");
const favicon = require("serve-favicon");
const path = require("path");

const app = express();

const fs = require('fs');

app.set("view engine", "ejs");

app.set("views", path.join(__dirname, "views"));

const multer = require("multer");

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // ← agrega esta línea


const mysqlSession = require("express-mysql-session");
const session = require("express-session");
const pool = require("./connection.js");

const MySqlStore = mysqlSession(session);

const sessionStore = new MySqlStore({
    expiration: 1000 * 60 * 60, //1 hora
    checkExpirationInterval: 1000 * 60 * 10 //limpia cada diez mins
}, pool);

const router_usuarios = require("./routers/router_usuario.js");

app.use("/usuario", router_usuarios);

//Renders básicos
app.get("/", async function (req, res, next) {
    res.render("inicio");
});

app.get("/inicio", async function (req, res, next) {
    res.render("inicio");
})

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


