const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM regionais ORDER BY nome');
  res.json(rows);
});

const buscarPorId = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM regionais WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new AppError('Regional não encontrada', 404);
  res.json(rows[0]);
});

const criar = asyncHandler(async (req, res) => {
  const { nome } = req.body;
  if (!nome) throw new AppError('Informe o nome da regional', 400);

  const { rows } = await pool.query(
    'INSERT INTO regionais (nome) VALUES ($1) RETURNING *',
    [nome]
  );
  res.status(201).json(rows[0]);
});

const atualizar = asyncHandler(async (req, res) => {
  const { nome } = req.body;
  const { rows } = await pool.query(
    'UPDATE regionais SET nome = COALESCE($1, nome) WHERE id = $2 RETURNING *',
    [nome ?? null, req.params.id]
  );
  if (!rows[0]) throw new AppError('Regional não encontrada', 404);
  res.json(rows[0]);
});

const remover = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM regionais WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new AppError('Regional não encontrada', 404);
  res.status(204).send();
});

module.exports = { listar, buscarPorId, criar, atualizar, remover };
