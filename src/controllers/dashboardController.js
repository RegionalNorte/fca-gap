const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { condicaoUnidade } = require('../services/escopo');

const resumo = asyncHandler(async (req, res) => {
  const params = [];
  const condicao = await condicaoUnidade(req.usuario, 'unidade_id', params);

  const { rows: indicadoresRows } = await pool.query(
    `SELECT
       COUNT(*) AS total_fatos,
       COUNT(*) FILTER (WHERE status_fato = 'aberto') AS fatos_abertos,
       COUNT(*) FILTER (WHERE status_fato = 'em_andamento') AS fatos_em_andamento,
       COUNT(*) FILTER (WHERE status_fato = 'concluido') AS fatos_concluidos,
       COUNT(*) FILTER (WHERE status_fato = 'cancelado') AS fatos_cancelados,
       COALESCE(SUM(total_acoes), 0) AS total_acoes,
       COALESCE(SUM(acoes_concluidas_com_atraso), 0) AS acoes_atrasadas,
       COALESCE(SUM(acoes_prazo_vencido_sem_conclusao), 0) AS acoes_prazo_vencido_sem_conclusao
     FROM vw_plano_fato
     WHERE ${condicao}`,
    params
  );

  const { rows: porUnidade } = await pool.query(
    `SELECT
       unidade_id, unidade_nome, area_id, area_nome, regional_id, regional_nome,
       COUNT(*) AS total_fatos,
       COUNT(*) FILTER (WHERE status_fato = 'aberto') AS fatos_abertos,
       COUNT(*) FILTER (WHERE status_fato = 'em_andamento') AS fatos_em_andamento,
       COUNT(*) FILTER (WHERE status_fato = 'concluido') AS fatos_concluidos,
       COUNT(*) FILTER (WHERE status_fato = 'cancelado') AS fatos_cancelados,
       ROUND(AVG(percentual_conclusao), 1) AS percentual_conclusao_medio,
       COALESCE(SUM(acoes_concluidas_com_atraso), 0) AS acoes_atrasadas,
       COALESCE(SUM(acoes_prazo_vencido_sem_conclusao), 0) AS acoes_prazo_vencido_sem_conclusao
     FROM vw_plano_fato
     WHERE ${condicao}
     GROUP BY unidade_id, unidade_nome, area_id, area_nome, regional_id, regional_nome
     ORDER BY unidade_nome`,
    params
  );

  res.json({ indicadores: indicadoresRows[0], por_unidade: porUnidade });
});

module.exports = { resumo };
