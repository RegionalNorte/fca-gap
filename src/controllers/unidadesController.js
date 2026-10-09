const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { condicaoUnidade } = require('../services/escopo');

// escopado por jurisdição — é o que alimenta o seletor de unidade ao
// criar um fato: gestor_unidade só via a própria, gestor_area só as da
// área dele etc. (admin e colaborador continuam vendo tudo/nada igual
// condicaoUnidade já decide pros outros endpoints)
const listar = asyncHandler(async (req, res) => {
  const params = [];
  const condicoes = [await condicaoUnidade(req.usuario, 'id', params)];

  if (req.query.area_id) {
    params.push(req.query.area_id);
    condicoes.push(`area_id = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT * FROM unidades WHERE ${condicoes.join(' AND ')} ORDER BY nome`,
    params
  );
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
  const { rows: vinculo } = await pool.query('SELECT COUNT(*) FROM fatos WHERE unidade_id = $1', [req.params.id]);
  if (Number(vinculo[0].count) > 0) {
    throw new AppError('Não é possível excluir: há fatos registrados nesta unidade.', 409);
  }

  const { rowCount } = await pool.query('DELETE FROM unidades WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new AppError('Unidade não encontrada', 404);
  res.status(204).send();
});

module.exports = { listar, buscarPorId, criar, atualizar, remover };
