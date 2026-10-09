const { Pool, types } = require('pg');

// por padrão o driver converte colunas DATE (oid 1082) num objeto Date
// de JS cravado à meia-noite no fuso do SERVIDOR, que o Express depois
// serializa via toISOString (UTC) — o resultado final depende de em
// que fuso o servidor está rodando. Em localhost (Brasil, UTC-3) e no
// navegador (também Brasil) os dois deslocamentos se cancelavam por
// coincidência; na Vercel (servidor em UTC) o deslocamento do servidor
// some e sobra só o do navegador, puxando a data um dia pra trás.
// Solução: nunca converter — devolve a string "AAAA-MM-DD" do jeito
// que veio do Postgres, sem fuso nenhum envolvido.
types.setTypeParser(1082, (valor) => valor);

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
