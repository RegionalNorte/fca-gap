const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const params = [];
  let sql = 'SELECT * FROM unidades';

  if (req.query.area_id) {
    params.push(req.query.area_id);
    sql += ` WHERE area_id = $${params.length}`;
  }

  sql += ' ORDER BY nome';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

const buscarPorId = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM unidades WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new AppError('Unidade não encontrada', 404);
  res.json(rows[0]);
});

const criar = asyncHandler(async (req, res) => {
  const { area_id, nome } = req.body;
  if (!area_id || !nome) throw new AppError('Informe area_id e nome', 400);

  const { rows } = await pool.query(
    'INSERT INTO unidades (area_id, nome) VALUES ($1, $2) RETURNING *',
    [area_id, nome]
  );
  res.status(201).json(rows[0]);
});

const atualizar = asyncHandler(async (req, res) => {
  const { nome, area_id } = req.body;
  const { rows } = await pool.query(
    `UPDATE unidades SET
       nome = COALESCE($1, nome),
       area_id = COALESCE($2, area_id)
     WHERE id = $3 RETURNING *`,
    [nome ?? null, area_id ?? null, req.params.id]
  );
  if (!rows[0]) throw new AppError('Unidade não encontrada', 404);
  res.json(rows[0]);
});

const remover = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM unidades WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new AppError('Unidade não encontrada', 404);
  res.status(204).send();
});

module.exports = { listar, buscarPorId, criar, atualizar, remover };
