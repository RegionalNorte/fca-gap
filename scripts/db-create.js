require('dotenv').config();
const { Client } = require('pg');

const dbName = process.env.PGDATABASE || 'fca_gap';

async function main() {
  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: 'postgres',
  });

  await client.connect();

  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);

  if (rowCount > 0) {
    console.log(`Banco "${dbName}" já existe.`);
  } else {
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Banco "${dbName}" criado.`);
  }

  await client.end();
}

main().catch((err) => {
  console.error('Falha ao criar o banco:', err.message);
  process.exit(1);
});
