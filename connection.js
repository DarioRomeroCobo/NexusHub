const mysql = require("mysql");

const pool = mysql.createPool({
    host: "", //TODO
    user: "", //TODO
    password: "",
    database: "" //TODO
})

module.exports = pool; //Esto sirve para exportar la pool de tal forma que los demás archivos puedan verlo