require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

async function main() {
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });

  await client.connect();
  await client.query(sql);
  await client.end();

  console.log(`Schema aplicado em "${process.env.PGDATABASE}".`);
}

main().catch((err) => {
  console.error('Falha ao aplicar o schema:', err.message);
  process.exit(1);
});
