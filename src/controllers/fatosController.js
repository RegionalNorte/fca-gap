const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { condicaoUnidade, unidadeNoEscopo } = require('../services/escopo');

// colaborador vê só os fatos onde é responsável de alguma causa ou ação;
// os demais papéis veem pela hierarquia de unidade (ver SPEC.md).
async function condicaoVisibilidadeFato(usuario, aliasId, params) {
  if (usuario.papel === 'colaborador') {
    params.push(usuario.id);
    return `${aliasId} IN (
      SELECT c.fato_id FROM causas c WHERE c.responsavel_id = $${params.length}
      UNION
      SELECT c.fato_id FROM causas c
      JOIN acoes a ON a.causa_id = c.id
      JOIN acoes_responsaveis res ON res.acao_id = a.id
      WHERE res.usuario_id = $${params.length}
    )`;
  }

  // bug corrigido: condicaoUnidade espera uma coluna/subselect de
  // unidade_id, mas aqui estava recebendo o alias de f.id (o id do
  // próprio fato) — a condição gerada comparava f.id com uma unidade_id
  // e nunca batia com nada, deixando gestor_unidade/área/regional sem
  // ver NENHUM fato na listagem (só colaborador, que usa outro caminho,
  // funcionava)
  return condicaoUnidade(usuario, 'f.unidade_id', params);
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

  // gestor_unidade/área/regional só acessa fatos dentro da própria
  // jurisdição — permitir() na rota só garante que a pessoa é "algum"
  // gestor, não que esse fato específico é dela. Colaborador tem
  // checagem própria (por atribuição) logo abaixo.
  if (req.usuario.papel !== 'colaborador' && !(await unidadeNoEscopo(req.usuario, fato.unidade_id))) {
    throw new AppError('Você não tem acesso a este fato', 403);
  }

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

  let causasVisiveis = causas;
  let acoesVisiveis = acoes;

  // colaborador só vê o que foi atribuído a ele: causas das quais é
  // responsável (com todas as ações, já que ele acompanha o plano
  // inteiro da causa) e causas onde só é responsável por alguma ação
  // específica (aí só essa ação aparece, não as dos colegas)
  if (req.usuario.papel === 'colaborador') {
    const uid = req.usuario.id;
    const causasDoUsuario = new Set(causas.filter((c) => c.responsavel_id === uid).map((c) => c.id));
    const acoesDoUsuario = new Set(acoes.filter((a) => (a.responsaveis_ids || []).includes(uid)).map((a) => a.id));
    const causasComAcaoDoUsuario = new Set(acoes.filter((a) => acoesDoUsuario.has(a.id)).map((a) => a.causa_id));
    const causasVisiveisIds = new Set([...causasDoUsuario, ...causasComAcaoDoUsuario]);

    if (causasVisiveisIds.size === 0) {
      throw new AppError('Você não tem acesso a este fato', 403);
    }

    causasVisiveis = causas.filter((c) => causasVisiveisIds.has(c.id));
    acoesVisiveis = acoes.filter((a) => causasDoUsuario.has(a.causa_id) || acoesDoUsuario.has(a.id));
  }

  const acoesPorCausa = new Map();
  for (const acao of acoesVisiveis) {
    const lista = acoesPorCausa.get(acao.causa_id) || [];
    lista.push(acao);
    acoesPorCausa.set(acao.causa_id, lista);
  }

  fato.causas = causasVisiveis.map((causa) => ({ ...causa, acoes: acoesPorCausa.get(causa.id) || [] }));

  res.json(fato);
});

const criar = asyncHandler(async (req, res) => {
  const { unidade_id, titulo, descricao, data_identificacao } = req.body;

  if (!unidade_id || !titulo) {
    throw new AppError('Informe unidade_id e titulo', 400);
  }

  if (!(await unidadeNoEscopo(req.usuario, unidade_id))) {
    throw new AppError('Você não pode criar um fato fora da sua unidade/área/regional', 403);
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

  const { rows: atual } = await pool.query('SELECT unidade_id FROM fatos WHERE id = $1', [req.params.id]);
  if (!atual[0]) throw new AppError('Fato não encontrado', 404);
  if (!(await unidadeNoEscopo(req.usuario, atual[0].unidade_id))) {
    throw new AppError('Você não tem acesso a este fato', 403);
  }

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
  const { rows: atual } = await pool.query('SELECT unidade_id FROM fatos WHERE id = $1', [req.params.id]);
  if (!atual[0]) throw new AppError('Fato não encontrado', 404);
  if (!(await unidadeNoEscopo(req.usuario, atual[0].unidade_id))) {
    throw new AppError('Você não tem acesso a este fato', 403);
  }

  const { rowCount } = await pool.query('DELETE FROM fatos WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new AppError('Fato não encontrado', 404);
  res.status(204).send();
});

module.exports = { listar, buscarPorId, criar, atualizar, remover };
