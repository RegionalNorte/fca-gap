const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const params = [];
  let sql = 'SELECT * FROM areas';

  if (req.query.regional_id) {
    params.push(req.query.regional_id);
    sql += ` WHERE regional_id = $${params.length}`;
  }

  sql += ' ORDER BY nome';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

const buscarPorId = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM areas WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new AppError('Área não encontrada', 404);
  res.json(rows[0]);
});

const criar = asyncHandler(async (req, res) => {
  const { regional_id, nome } = req.body;
  if (!regional_id || !nome) throw new AppError('Informe regional_id e nome', 400);

  const { rows } = await pool.query(
    'INSERT INTO areas (regional_id, nome) VALUES ($1, $2) RETURNING *',
    [regional_id, nome]
  );
  res.status(201).json(rows[0]);
});

const atualizar = asyncHandler(async (req, res) => {
  const { nome, regional_id } = req.body;
  const { rows } = await pool.query(
    `UPDATE areas SET
       nome = COALESCE($1, nome),
       regional_id = COALESCE($2, regional_id)
     WHERE id = $3 RETURNING *`,
    [nome ?? null, regional_id ?? null, req.params.id]
  );
  if (!rows[0]) throw new AppError('Área não encontrada', 404);
  res.json(rows[0]);
});

const remover = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM areas WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new AppError('Área não encontrada', 404);
  res.status(204).send();
});

module.exports = { listar, buscarPorId, criar, atualizar, remover };
