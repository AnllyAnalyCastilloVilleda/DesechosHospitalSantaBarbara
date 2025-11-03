//db.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('Error en el pool de PostgreSQL:', err);
});

module.exports = pool;
