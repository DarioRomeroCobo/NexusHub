const sql = require("mssql");

console.log("🔄 Probando inserción y lectura en la tabla USUARIO...");

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

async function test() {
    try {
        await pool.connect();
        console.log("✅ Conectado a Azure SQL");

        // INSERTAR UN USUARIO DE PRUEBA
        const insertQuery = `
            INSERT INTO USUARIO (correo, contraseña)
            VALUES ('prueba@example.com', '1234')
        `;

        await pool.request().query(insertQuery);
        console.log("🟩 Usuario insertado correctamente");

        // LEER LOS DATOS
        const result = await pool.request().query("SELECT * FROM USUARIO");
        console.log("📄 Datos actuales en la tabla USUARIO:");
        console.log(result.recordset);

        pool.close();
    } catch (err) {
        console.error("❌ Error:", err);
    }
}

test();
