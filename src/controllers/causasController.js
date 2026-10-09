const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { unidadeNoEscopo } = require('../services/escopo');
const { sanitizarTextoRico, LIMITE_HTML } = require('../utils/richText');

// unidade do fato dono dessa causa — pra conferir se quem está mexendo
// (criando, editando, excluindo) tem jurisdição sobre ela
async function unidadeDaCausa(causaId) {
  const { rows } = await pool.query(
    `SELECT f.unidade_id FROM causas c JOIN fatos f ON f.id = c.fato_id WHERE c.id = $1`,
    [causaId]
  );
  return rows[0] ? rows[0].unidade_id : null;
}

const SELECT_CAUSA = `
  SELECT
    c.id, c.fato_id, c.descricao, c.responsavel_id, c.created_at,
    u.nome AS responsavel_nome, u.email AS responsavel_email
  FROM causas c
  LEFT JOIN usuarios u ON u.id = c.responsavel_id
`;

const listar = asyncHandler(async (req, res) => {
  if (!req.query.fato_id) {
    throw new AppError('Informe fato_id', 400);
  }

  const { rows } = await pool.query(
    `${SELECT_CAUSA} WHERE c.fato_id = $1 ORDER BY c.created_at`,
    [req.query.fato_id]
  );
  res.json(rows);
});

const buscarPorId = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`${SELECT_CAUSA} WHERE c.id = $1`, [req.params.id]);
  const causa = rows[0];
  if (!causa) throw new AppError('Causa não encontrada', 404);

  if (req.usuario.papel === 'colaborador') {
    let temAcesso = causa.responsavel_id === req.usuario.id;
    if (!temAcesso) {
      const { rows: acesso } = await pool.query(
        `SELECT 1 FROM acoes a JOIN acoes_responsaveis res ON res.acao_id = a.id
         WHERE a.causa_id = $1 AND res.usuario_id = $2 LIMIT 1`,
        [causa.id, req.usuario.id]
      );
      temAcesso = acesso.length > 0;
    }
    if (!temAcesso) throw new AppError('Você não tem acesso a esta causa', 403);
  } else {
    const unidadeId = await unidadeDaCausa(causa.id);
    if (!(await unidadeNoEscopo(req.usuario, unidadeId))) {
      throw new AppError('Você não tem acesso a esta causa', 403);
    }
  }

  const { rows: acoes } = await pool.query(
    `SELECT
       a.*,
       ARRAY_REMOVE(ARRAY_AGG(ures.id ORDER BY ures.nome), NULL) AS responsaveis_ids,
       STRING_AGG(ures.nome, ', ' ORDER BY ures.nome) AS responsaveis_nomes
     FROM acoes a
     LEFT JOIN acoes_responsaveis res ON res.acao_id = a.id
     LEFT JOIN usuarios ures ON ures.id = res.usuario_id
     WHERE a.causa_id = $1
     GROUP BY a.id
     ORDER BY a.inicio_previsto`,
    [causa.id]
  );

  res.json({ ...causa, acoes });
});

const criar = asyncHandler(async (req, res) => {
  const { fato_id, descricao, responsavel_id } = req.body;
  if (!fato_id || !descricao) {
    throw new AppError('Informe fato_id e descricao', 400);
  }

  const descricaoSegura = sanitizarTextoRico(descricao);
  if (descricaoSegura.length > LIMITE_HTML) {
    throw new AppError('Descrição muito longa', 400);
  }

  const { rows: fatoRows } = await pool.query('SELECT unidade_id FROM fatos WHERE id = $1', [fato_id]);
  if (!fatoRows[0]) throw new AppError('Fato não encontrado', 404);
  if (!(await unidadeNoEscopo(req.usuario, fatoRows[0].unidade_id))) {
    throw new AppError('Você não tem acesso a este fato', 403);
  }

  const { rows } = await pool.query(
    'INSERT INTO causas (fato_id, descricao, responsavel_id) VALUES ($1, $2, $3) RETURNING id',
    [fato_id, descricaoSegura, responsavel_id || null]
  );

  const { rows: completo } = await pool.query(`${SELECT_CAUSA} WHERE c.id = $1`, [rows[0].id]);
  res.status(201).json(completo[0]);
});

const atualizar = asyncHandler(async (req, res) => {
  if (req.usuario.papel === 'colaborador') {
    const { rows: atual } = await pool.query('SELECT responsavel_id FROM causas WHERE id = $1', [req.params.id]);
    if (!atual[0]) throw new AppError('Causa não encontrada', 404);
    if (atual[0].responsavel_id !== req.usuario.id) {
      throw new AppError('Você só pode editar causas das quais é responsável', 403);
    }
  } else {
    const unidadeId = await unidadeDaCausa(req.params.id);
    if (unidadeId === null) throw new AppError('Causa não encontrada', 404);
    if (!(await unidadeNoEscopo(req.usuario, unidadeId))) {
      throw new AppError('Você não tem acesso a esta causa', 403);
    }
  }

  // atualização parcial de verdade: campo ausente no corpo = não mexe;
  // responsavel_id enviado como null = limpa (deixa sem responsável) —
  // COALESCE trataria os dois casos como "não mude nada" e nunca deixaria
  // tirar o responsável.
  const campos = [];
  const valores = [];
  if (req.body.descricao !== undefined) {
    const descricaoSegura = sanitizarTextoRico(req.body.descricao);
    if (descricaoSegura && descricaoSegura.length > LIMITE_HTML) {
      throw new AppError('Descrição muito longa', 400);
    }
    campos.push(`descricao = $${campos.length + 1}`);
    valores.push(descricaoSegura);
  }
  if (req.body.responsavel_id !== undefined) {
    campos.push(`responsavel_id = $${campos.length + 1}`);
    valores.push(req.body.responsavel_id);
  }
  if (campos.length === 0) throw new AppError('Nada para atualizar', 400);
  valores.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE causas SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING id`,
    valores
  );

  if (!rows[0]) throw new AppError('Causa não encontrada', 404);

  const { rows: completo } = await pool.query(`${SELECT_CAUSA} WHERE c.id = $1`, [rows[0].id]);
  res.json(completo[0]);
});

const remover = asyncHandler(async (req, res) => {
  const unidadeId = await unidadeDaCausa(req.params.id);
  if (unidadeId === null) throw new AppError('Causa não encontrada', 404);
  if (!(await unidadeNoEscopo(req.usuario, unidadeId))) {
    throw new AppError('Você não tem acesso a esta causa', 403);
  }

  const { rowCount } = await pool.query('DELETE FROM causas WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new AppError('Causa não encontrada', 404);
  res.status(204).send();
});

module.exports = { listar, buscarPorId, criar, atualizar, remover };
