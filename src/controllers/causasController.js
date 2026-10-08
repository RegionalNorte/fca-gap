const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

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

  const { rows } = await pool.query(
    'INSERT INTO causas (fato_id, descricao, responsavel_id) VALUES ($1, $2, $3) RETURNING id',
    [fato_id, descricao, responsavel_id || null]
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
  }

  // atualização parcial de verdade: campo ausente no corpo = não mexe;
  // responsavel_id enviado como null = limpa (deixa sem responsável) —
  // COALESCE trataria os dois casos como "não mude nada" e nunca deixaria
  // tirar o responsável.
  const campos = [];
  const valores = [];
  if (req.body.descricao !== undefined) {
    campos.push(`descricao = $${campos.length + 1}`);
    valores.push(req.body.descricao);
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
  const { rowCount } = await pool.query('DELETE FROM causas WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new AppError('Causa não encontrada', 404);
  res.status(204).send();
});

module.exports = { listar, buscarPorId, criar, atualizar, remover };
