const sql = require("mssql");

const pool = new sql.ConnectionPool({
    user: "Adminnexushub",
    password: "Kristin26",
    server: "nexushub.database.windows.net",
    database: "NexusHubDB",
    port: 1433,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
});

module.exports = pool;
