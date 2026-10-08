const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { condicaoUnidade } = require('../services/escopo');

// colaborador vê só os fatos onde é responsável de alguma causa ou ação;
// os demais papéis veem pela hierarquia de unidade (ver SPEC.md).
async function condicaoVisibilidadeFato(usuario, alias, params) {
  if (usuario.papel === 'colaborador') {
    params.push(usuario.id);
    return `${alias} IN (
      SELECT c.fato_id FROM causas c WHERE c.responsavel_id = $${params.length}
      UNION
      SELECT c.fato_id FROM causas c
      JOIN acoes a ON a.causa_id = c.id
      JOIN acoes_responsaveis res ON res.acao_id = a.id
      WHERE res.usuario_id = $${params.length}
    )`;
  }

  return condicaoUnidade(usuario, alias, params);
}

const listar = asyncHandler(async (req, res) => {
  const params = [];
  const condicoes = [await condicaoVisibilidadeFato(req.usuario, 'f.id', params)];

  if (req.query.unidade_id) {
    params.push(req.query.unidade_id);
    condicoes.push(`f.unidade_id = $${params.length}`);
  }

  if (req.query.status) {
    params.push(req.query.status);
    condicoes.push(`f.status = $${params.length}`);
  }

  if (req.query.data_de) {
    params.push(req.query.data_de);
    condicoes.push(`f.data_identificacao >= $${params.length}`);
  }

  if (req.query.data_ate) {
    params.push(req.query.data_ate);
    condicoes.push(`f.data_identificacao <= $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT
       f.id, f.titulo, f.descricao, f.data_identificacao, f.status,
       f.created_at, f.updated_at,
       vp.unidade_id, vp.unidade_nome, vp.area_id, vp.area_nome, vp.regional_id, vp.regional_nome,
       vp.total_acoes, vp.acoes_concluidas, vp.acoes_adiantadas, vp.acoes_concluidas_com_atraso,
       vp.acoes_prazo_vencido_sem_conclusao, vp.percentual_conclusao
     FROM fatos f
     JOIN vw_plano_fato vp ON vp.fato_id = f.id
     WHERE ${condicoes.join(' AND ')}
     ORDER BY f.data_identificacao DESC`,
    params
  );

  res.json(rows);
});

const buscarPorId = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       f.*,
       vp.unidade_nome, vp.area_id, vp.area_nome, vp.regional_id, vp.regional_nome,
       vp.total_acoes, vp.acoes_concluidas, vp.acoes_adiantadas, vp.acoes_concluidas_com_atraso,
       vp.acoes_prazo_vencido_sem_conclusao, vp.percentual_conclusao
     FROM fatos f
     JOIN vw_plano_fato vp ON vp.fato_id = f.id
     WHERE f.id = $1`,
    [req.params.id]
  );

  const fato = rows[0];
  if (!fato) throw new AppError('Fato não encontrado', 404);

  const { rows: causas } = await pool.query(
    `SELECT c.id, c.descricao, c.responsavel_id, c.created_at,
            u.nome AS responsavel_nome, u.email AS responsavel_email
     FROM causas c
     LEFT JOIN usuarios u ON u.id = c.responsavel_id
     WHERE c.fato_id = $1
     ORDER BY c.created_at`,
    [fato.id]
  );

  const { rows: acoes } = await pool.query(
    `SELECT
       a.*,
       ARRAY_REMOVE(ARRAY_AGG(ures.id ORDER BY ures.nome), NULL) AS responsaveis_ids,
       STRING_AGG(ures.nome, ', ' ORDER BY ures.nome) AS responsaveis_nomes
     FROM acoes a
     JOIN causas c ON c.id = a.causa_id
     LEFT JOIN acoes_responsaveis res ON res.acao_id = a.id
     LEFT JOIN usuarios ures ON ures.id = res.usuario_id
     WHERE c.fato_id = $1
     GROUP BY a.id
     ORDER BY a.inicio_previsto`,
    [fato.id]
  );

  const acoesPorCausa = new Map();
  for (const acao of acoes) {
    const lista = acoesPorCausa.get(acao.causa_id) || [];
    lista.push(acao);
    acoesPorCausa.set(acao.causa_id, lista);
  }

  fato.causas = causas.map((causa) => ({ ...causa, acoes: acoesPorCausa.get(causa.id) || [] }));

  res.json(fato);
});

const criar = asyncHandler(async (req, res) => {
  const { unidade_id, titulo, descricao, data_identificacao } = req.body;

  if (!unidade_id || !titulo) {
    throw new AppError('Informe unidade_id e titulo', 400);
  }

  const { rows } = await pool.query(
    `INSERT INTO fatos (unidade_id, titulo, descricao, data_identificacao, criado_por)
     VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5)
     RETURNING *`,
    [unidade_id, titulo, descricao || null, data_identificacao || null, req.usuario.id]
  );

  res.status(201).json(rows[0]);
});

// status só pode ser setado manualmente pra 'cancelado' (sempre manual) ou
// recomputado explicitamente com status: 'reabrir' (reverte um cancelamento
// recalculando a partir das ações, igual à trigger do banco faria).
const atualizar = asyncHandler(async (req, res) => {
  const { titulo, descricao, data_identificacao, status } = req.body;

  if (status && status !== 'cancelado' && status !== 'reabrir') {
    throw new AppError(
      "status só pode ser definido manualmente como 'cancelado' ou 'reabrir'; os demais valores são calculados a partir das ações",
      400
    );
  }

  if (status === 'reabrir') {
    const { rows } = await pool.query(
      `WITH calc AS (
         SELECT CASE
           WHEN COUNT(a.id) = 0 THEN 'aberto'
           WHEN COUNT(a.id) = COUNT(a.id) FILTER (WHERE a.status IN ('concluida', 'adiantada', 'atrasada')) THEN 'concluido'
           WHEN COUNT(a.id) FILTER (WHERE a.status IN ('em_andamento', 'concluida', 'adiantada', 'atrasada')) > 0 THEN 'em_andamento'
           ELSE 'aberto'
         END AS novo_status
         FROM causas c
         LEFT JOIN acoes a ON a.causa_id = c.id
         WHERE c.fato_id = $1
       )
       UPDATE fatos SET
         titulo = COALESCE($2, titulo),
         descricao = COALESCE($3, descricao),
         data_identificacao = COALESCE($4, data_identificacao),
         status = calc.novo_status::status_fato
       FROM calc
       WHERE id = $1
       RETURNING fatos.*`,
      [req.params.id, titulo ?? null, descricao ?? null, data_identificacao ?? null]
    );
    if (!rows[0]) throw new AppError('Fato não encontrado', 404);
    return res.json(rows[0]);
  }

  const { rows } = await pool.query(
    `UPDATE fatos SET
       titulo = COALESCE($1, titulo),
       descricao = COALESCE($2, descricao),
       data_identificacao = COALESCE($3, data_identificacao),
       status = COALESCE($4, status)
     WHERE id = $5
     RETURNING *`,
    [titulo ?? null, descricao ?? null, data_identificacao ?? null, status || null, req.params.id]
  );

  if (!rows[0]) throw new AppError('Fato não encontrado', 404);
  res.json(rows[0]);
});

const remover = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM fatos WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new AppError('Fato não encontrado', 404);
  res.status(204).send();
});

module.exports = { listar, buscarPorId, criar, atualizar, remover };
