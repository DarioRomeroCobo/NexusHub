const pool = require("../connection")

/*function query(sql, parametros = []){
    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) =>{
            if(err) return reject(err);
            connection.query(sql, parametros, (err, resultados) => {
                try{
                    if(err) return reject(err);
                    return resolve(resultados);
                } finally{
                    connection.release();
                }
            })
        })
    })
}

module.exports = {
    query
}*/

async function query(sql, parametros = []) {
    let connection;
    try {
        connection = await pool.connect(); // conectar el pool
        const request = connection.request();

        // agregar parámetros con índice
        parametros.forEach((valor, i) => {
            request.input(`p${i}`, valor);
        });

        const resultado = await request.query(sql);
        return resultado.recordset; // devuelve las filas
    } catch (err) {
        throw err;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = { query };