// Dados mínimos pra testar a API localmente: hierarquia Regional Norte ->
// Captação -> Unidade Centro, e um usuário admin já com senha definida
// (sem ele, ninguém consegue logar, já que todo usuário novo nasce sem
// senha_hash até aceitar um convite).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const ADMIN_EMAIL = 'admin@fcagap.local';
const ADMIN_SENHA = 'admin123';

async function main() {
  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });

  await client.connect();

  const regional = await client.query(
    `INSERT INTO regionais (nome) VALUES ('Regional Norte')
     ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`
  );
  const regionalId = regional.rows[0].id;

  const area = await client.query(
    `INSERT INTO areas (regional_id, nome) VALUES ($1, 'Captação')
     ON CONFLICT (regional_id, nome) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`,
    [regionalId]
  );
  const areaId = area.rows[0].id;

  const unidade = await client.query(
    `INSERT INTO unidades (area_id, nome) VALUES ($1, 'Unidade Centro')
     ON CONFLICT (area_id, nome) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`,
    [areaId]
  );
  const unidadeId = unidade.rows[0].id;

  const senhaHash = await bcrypt.hash(ADMIN_SENHA, 10);

  await client.query(
    `INSERT INTO usuarios (nome, email, unidade_id, papel, ativo, senha_hash)
     VALUES ('Administrador', $1, $2, 'admin', true, $3)
     ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash`,
    [ADMIN_EMAIL, unidadeId, senhaHash]
  );

  await client.end();

  console.log('Seed aplicado:');
  console.log(`  Regional Norte > Captação > Unidade Centro (unidade_id=${unidadeId})`);
  console.log(`  Admin: ${ADMIN_EMAIL} / ${ADMIN_SENHA}`);
}

main().catch((err) => {
  console.error('Falha ao aplicar o seed:', err.message);
  process.exit(1);
});
