const { Pool } = require('pg');

// Supabase (e a maioria dos provedores gerenciados) exige SSL; Postgres
// local não tem certificado configurado, então isso fica opt-in via env.
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
