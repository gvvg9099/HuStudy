const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'hustudy_demo',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = {
  query: async (text, params) => {
    const [rows] = await pool.execute(text, params);
    return { rows, rowCount: Array.isArray(rows) ? rows.length : 0 };
  },
  pool
};
