const mysql = require("mysql");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: 3306,
    ssl: {
        rejectUnauthorized: true
    }
});

module.exports = pool; //Esto sirve para exportar la pool de tal forma que los demás archivos puedan verlo