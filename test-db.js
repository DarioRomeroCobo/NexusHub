const sql = require("mssql");

console.log("🔄 Iniciando prueba de conexión...");

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

pool.connect()
    .then(() => {
        console.log("✅ Conectado correctamente a Azure SQL");
        return pool.request().query("SELECT 1 AS test");
    })
    .then(result => {
        console.log("Resultado de prueba:", result.recordset);
        pool.close();
    })
    .catch(err => {
        console.error("❌ Error de conexión:", err);
    });
