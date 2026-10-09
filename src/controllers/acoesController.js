const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { condicaoUnidade, unidadeNoEscopo } = require('../services/escopo');
const { sanitizarTextoRico, LIMITE_HTML } = require('../utils/richText');

// unidade do fato dono dessa causa — pra conferir se quem está criando
// uma ação nela tem jurisdição sobre ela
async function unidadeDaCausa(causaId) {
  const { rows } = await pool.query(
    `SELECT f.unidade_id FROM causas c JOIN fatos f ON f.id = c.fato_id WHERE c.id = $1`,
    [causaId]
  );
  return rows[0] ? rows[0].unidade_id : null;
}

// unidade do fato dono da causa dessa ação — mesma ideia, pra editar/excluir
async function unidadeDaAcao(acaoId) {
  const { rows } = await pool.query(
    `SELECT f.unidade_id FROM acoes a
     JOIN causas c ON c.id = a.causa_id
     JOIN fatos f ON f.id = c.fato_id
     WHERE a.id = $1`,
    [acaoId]
  );
  return rows[0] ? rows[0].unidade_id : null;
}

const SELECT_ACAO = `
  SELECT
    a.*,
    ARRAY_REMOVE(ARRAY_AGG(u.id ORDER BY u.nome), NULL) AS responsaveis_ids,
    STRING_AGG(u.nome, ', ' ORDER BY u.nome) AS responsaveis_nomes
  FROM acoes a
  LEFT JOIN acoes_responsaveis res ON res.acao_id = a.id
  LEFT JOIN usuarios u ON u.id = res.usuario_id
`;

async function substituirResponsaveis(client, acaoId, responsaveis) {
  await client.query('DELETE FROM acoes_responsaveis WHERE acao_id = $1', [acaoId]);

  if (!Array.isArray(responsaveis) || responsaveis.length === 0) return;

  const valores = responsaveis.map((_, i) => `($1, $${i + 2})`).join(', ');
  await client.query(
    `INSERT INTO acoes_responsaveis (acao_id, usuario_id) VALUES ${valores}`,
    [acaoId, ...responsaveis]
  );
}

const listar = asyncHandler(async (req, res) => {
  const condicoes = [];
  const params = [];

  if (req.query.causa_id) {
    params.push(req.query.causa_id);
    condicoes.push(`a.causa_id = $${params.length}`);
  }

  if (req.query.responsavel_id) {
    params.push(req.query.responsavel_id);
    condicoes.push(`EXISTS (
      SELECT 1 FROM acoes_responsaveis r WHERE r.acao_id = a.id AND r.usuario_id = $${params.length}
    )`);
  }

  if (condicoes.length === 0) {
    throw new AppError('Informe causa_id ou responsavel_id', 400);
  }

  // colaborador só vê as ações de uma causa que não é dele se for
  // responsável por alguma delas — não as dos colegas
  if (req.usuario.papel === 'colaborador' && req.query.causa_id) {
    const { rows: causaRows } = await pool.query('SELECT responsavel_id FROM causas WHERE id = $1', [req.query.causa_id]);
    const souDonoDaCausa = causaRows[0] && causaRows[0].responsavel_id === req.usuario.id;
    if (!souDonoDaCausa) {
      params.push(req.usuario.id);
      condicoes.push(`EXISTS (
        SELECT 1 FROM acoes_responsaveis r WHERE r.acao_id = a.id AND r.usuario_id = $${params.length}
      )`);
    }
  }

  const { rows } = await pool.query(
    `${SELECT_ACAO} WHERE ${condicoes.join(' AND ')} GROUP BY a.id ORDER BY a.inicio_previsto`,
    params
  );
  res.json(rows);
});

const buscarPorId = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`${SELECT_ACAO} WHERE a.id = $1 GROUP BY a.id`, [req.params.id]);
  const acao = rows[0];
  if (!acao) throw new AppError('Ação não encontrada', 404);

  if (req.usuario.papel === 'colaborador') {
    if (!(acao.responsaveis_ids || []).includes(req.usuario.id)) {
      throw new AppError('Você não tem acesso a esta ação', 403);
    }
  } else {
    const unidadeId = await unidadeDaAcao(acao.id);
    if (!(await unidadeNoEscopo(req.usuario, unidadeId))) {
      throw new AppError('Você não tem acesso a esta ação', 403);
    }
  }

  res.json(acao);
});

const criar = asyncHandler(async (req, res) => {
  const { causa_id, descricao, inicio_previsto, final_previsto, data_iniciada, data_finalizada, evidencia, responsaveis } = req.body;

  if (!causa_id || !descricao || !inicio_previsto || !final_previsto) {
    throw new AppError('Informe causa_id, descricao, inicio_previsto e final_previsto', 400);
  }

  // mesma regra do banco (chk_acoes_datas_reais), avisada antes de bater
  // na constraint: às vezes a ação já nasce com datas reais preenchidas
  // (foi registrada depois de já ter acontecido), mas nunca só com a
  // data final sem a inicial.
  if (data_finalizada && !data_iniciada) {
    throw new AppError('Informe a data iniciada antes da data finalizada', 400);
  }

  const descricaoSegura = sanitizarTextoRico(descricao);
  if (descricaoSegura.length > LIMITE_HTML) {
    throw new AppError('Descrição muito longa', 400);
  }

  const unidadeId = await unidadeDaCausa(causa_id);
  if (unidadeId === null) throw new AppError('Causa não encontrada', 404);
  if (!(await unidadeNoEscopo(req.usuario, unidadeId))) {
    throw new AppError('Você não tem acesso a esta causa', 403);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO acoes (causa_id, descricao, inicio_previsto, final_previsto, data_iniciada, data_finalizada, evidencia)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [causa_id, descricaoSegura, inicio_previsto, final_previsto, data_iniciada || null, data_finalizada || null, evidencia || null]
    );

    await substituirResponsaveis(client, rows[0].id, responsaveis);
    await client.query('COMMIT');

    const { rows: completo } = await pool.query(`${SELECT_ACAO} WHERE a.id = $1 GROUP BY a.id`, [rows[0].id]);
    res.status(201).json(completo[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// status nunca é aceito no corpo da requisição: é sempre recalculado pelo
// banco (trigger fn_calcular_status_acao) a partir de data_iniciada/data_finalizada.
const atualizar = asyncHandler(async (req, res) => {
  const { responsaveis } = req.body;

  if (req.usuario.papel === 'colaborador') {
    const { rows: atual } = await pool.query(
      'SELECT 1 FROM acoes_responsaveis WHERE acao_id = $1 AND usuario_id = $2',
      [req.params.id, req.usuario.id]
    );
    if (!atual[0]) {
      throw new AppError('Você só pode editar ações das quais é responsável', 403);
    }
    // colaborador não redefine quem são os responsáveis, só executa a ação
    if (responsaveis !== undefined) {
      throw new AppError('Você não pode alterar os responsáveis desta ação', 403);
    }
  } else {
    const unidadeId = await unidadeDaAcao(req.params.id);
    if (unidadeId === null) throw new AppError('Ação não encontrada', 404);
    if (!(await unidadeNoEscopo(req.usuario, unidadeId))) {
      throw new AppError('Você não tem acesso a esta ação', 403);
    }
  }

  if (req.body.descricao !== undefined && req.body.descricao !== null) {
    req.body.descricao = sanitizarTextoRico(req.body.descricao);
    if (req.body.descricao.length > LIMITE_HTML) {
      throw new AppError('Descrição muito longa', 400);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // atualização parcial de verdade: campo ausente no corpo = não mexe;
    // campo enviado como null = limpa (ex: tirar a data iniciada real,
    // apagar a evidência) — COALESCE trataria os dois casos como "não
    // mude nada" e nunca deixaria limpar esses campos.
    const campos = [];
    const valores = [];
    for (const chave of ['descricao', 'inicio_previsto', 'final_previsto', 'data_iniciada', 'data_finalizada', 'evidencia']) {
      if (req.body[chave] !== undefined) {
        campos.push(`${chave} = $${campos.length + 1}`);
        valores.push(req.body[chave]);
      }
    }

    let rows;
    if (campos.length > 0) {
      valores.push(req.params.id);
      ({ rows } = await client.query(
        `UPDATE acoes SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING id`,
        valores
      ));
    } else {
      ({ rows } = await client.query('SELECT id FROM acoes WHERE id = $1', [req.params.id]));
    }

    if (!rows[0]) {
      throw new AppError('Ação não encontrada', 404);
    }

    if (responsaveis !== undefined) {
      await substituirResponsaveis(client, rows[0].id, responsaveis);
    }

    await client.query('COMMIT');

    const { rows: completo } = await pool.query(`${SELECT_ACAO} WHERE a.id = $1 GROUP BY a.id`, [rows[0].id]);
    res.json(completo[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const remover = asyncHandler(async (req, res) => {
  const unidadeId = await unidadeDaAcao(req.params.id);
  if (unidadeId === null) throw new AppError('Ação não encontrada', 404);
  if (!(await unidadeNoEscopo(req.usuario, unidadeId))) {
    throw new AppError('Você não tem acesso a esta ação', 403);
  }

  const { rowCount } = await pool.query('DELETE FROM acoes WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new AppError('Ação não encontrada', 404);
  res.status(204).send();
});

// Painel de prazos: ações ainda em aberto (não finalizadas), agrupadas
// por urgência. "atrasada" como status (concluída fora do prazo) não
// entra aqui — isso é sobre ações que ainda não acabaram.
const prazos = asyncHandler(async (req, res) => {
  const params = [];
  let condicao;

  if (req.usuario.papel === 'colaborador') {
    params.push(req.usuario.id);
    condicao = `$${params.length} = ANY(v.responsaveis_ids)`;
  } else {
    condicao = await condicaoUnidade(req.usuario, 'v.unidade_id', params);
  }

  const { rows } = await pool.query(
    `SELECT * FROM vw_acoes_detalhadas v
     WHERE ${condicao} AND v.status IN ('nao_iniciada', 'em_andamento')
     ORDER BY v.final_previsto`,
    params
  );

  const atrasadas = rows.filter((a) => a.prazo_vencido_sem_conclusao);
  const vence_hoje = rows.filter((a) => !a.prazo_vencido_sem_conclusao && a.dias_para_vencer === 0);
  const proximos_7_dias = rows.filter(
    (a) => !a.prazo_vencido_sem_conclusao && a.dias_para_vencer >= 0 && a.dias_para_vencer <= 7
  );
  const demais = rows.filter(
    (a) => !atrasadas.includes(a) && !proximos_7_dias.includes(a)
  );

  res.json({ vence_hoje, atrasadas, proximos_7_dias, demais });
});

module.exports = { listar, buscarPorId, criar, atualizar, remover, prazos };
