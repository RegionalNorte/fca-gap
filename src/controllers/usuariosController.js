const crypto = require('crypto');
const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { condicaoUnidade } = require('../services/escopo');
const email = require('../services/email');

const PAPEIS_VALIDOS = ['admin', 'gestor_regional', 'gestor_area', 'gestor_unidade', 'colaborador'];

function usuarioPublico(usuario) {
  if (!usuario) return usuario;
  const { senha_hash, convite_token, ...resto } = usuario;
  return resto;
}

const listar = asyncHandler(async (req, res) => {
  const params = [];
  const condicoes = [await condicaoUnidade(req.usuario, 'u.unidade_id', params)];

  if (req.query.unidade_id) {
    params.push(req.query.unidade_id);
    condicoes.push(`u.unidade_id = $${params.length}`);
  }

  if (req.query.papel) {
    params.push(req.query.papel);
    condicoes.push(`u.papel = $${params.length}`);
  }

  if (req.query.status === 'convite_pendente') {
    condicoes.push('u.senha_hash IS NULL');
  } else if (req.query.status === 'ativo') {
    condicoes.push('u.senha_hash IS NOT NULL AND u.ativo');
  }

  const { rows } = await pool.query(
    `SELECT
       u.id, u.nome, u.email, u.unidade_id, u.papel, u.ativo,
       (u.senha_hash IS NULL) AS convite_pendente,
       u.convite_enviado_em, u.created_at,
       (SELECT COUNT(*) FROM causas c WHERE c.responsavel_id = u.id) AS causas_atribuidas,
       (SELECT COUNT(*) FROM acoes_responsaveis res WHERE res.usuario_id = u.id) AS acoes_atribuidas
     FROM usuarios u
     WHERE ${condicoes.join(' AND ')}
     ORDER BY u.nome NULLS LAST, u.email`,
    params
  );

  res.json(rows);
});

const buscarPorId = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new AppError('Usuário não encontrado', 404);
  res.json(usuarioPublico(rows[0]));
});

const verificarEmail = asyncHandler(async (req, res) => {
  const { email: emailConsultado } = req.query;
  if (!emailConsultado) throw new AppError('Informe o e-mail a verificar', 400);

  const { rows } = await pool.query(
    'SELECT id, nome, email FROM usuarios WHERE email = $1',
    [emailConsultado]
  );

  res.json({ existe: rows.length > 0, usuario: rows[0] || null });
});

// "Novo usuário" (tela Usuários) e "Convidar responsável" (dentro de um
// fato) são o mesmo formulário: e-mail já cadastrado -> retorna o usuário
// existente sem criar novo convite; e-mail novo -> cria a conta com
// senha_hash nulo e dispara o convite por e-mail.
const criarOuConvidar = asyncHandler(async (req, res) => {
  const { nome, email: emailInformado, unidade_id, papel, contexto } = req.body;

  if (!emailInformado) {
    throw new AppError('Informe o e-mail', 400);
  }

  if (papel && !PAPEIS_VALIDOS.includes(papel)) {
    throw new AppError('Papel inválido', 400);
  }

  // só admin escolhe o papel no convite; convite de dentro de uma causa/ação
  // (gestor_*) sempre nasce colaborador, sem exceção
  if (papel && papel !== 'colaborador' && req.usuario.papel !== 'admin') {
    throw new AppError('Só um administrador pode definir esse papel', 403);
  }

  const existente = await pool.query('SELECT * FROM usuarios WHERE email = $1', [emailInformado]);

  if (existente.rows[0]) {
    if (contexto) {
      email.enviarAvisoAtribuicao({ nome: existente.rows[0].nome, email: emailInformado, contexto });
    }
    return res.status(200).json({ usuario: usuarioPublico(existente.rows[0]), convite_enviado: false });
  }

  const conviteToken = crypto.randomUUID();

  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, unidade_id, papel, senha_hash, convite_token, convite_enviado_em)
     VALUES ($1, $2, $3, COALESCE($4::papel_usuario, 'colaborador'::papel_usuario), NULL, $5, now())
     RETURNING *`,
    [nome || null, emailInformado, unidade_id || null, papel || null, conviteToken]
  );

  const criado = rows[0];
  email.enviarConvite({ nome: criado.nome, email: criado.email, token: conviteToken });

  res.status(201).json({ usuario: usuarioPublico(criado), convite_enviado: true });
});

const atualizar = asyncHandler(async (req, res) => {
  // atualização parcial de verdade: um campo ausente no corpo não muda
  // nada, mas um campo enviado como null (ex: "Sem unidade") limpa a
  // coluna — diferente de COALESCE, que trataria os dois casos como "não
  // mude nada" e nunca deixaria limpar unidade_id.
  if (req.body.papel !== undefined && req.body.papel && !PAPEIS_VALIDOS.includes(req.body.papel)) {
    throw new AppError('Papel inválido', 400);
  }

  const campos = [];
  const valores = [];

  for (const chave of ['nome', 'unidade_id', 'papel', 'ativo']) {
    if (req.body[chave] !== undefined) {
      campos.push(`${chave} = $${campos.length + 1}`);
      valores.push(req.body[chave]);
    }
  }

  if (campos.length === 0) {
    throw new AppError('Nada para atualizar', 400);
  }

  valores.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING *`,
    valores
  );

  if (!rows[0]) throw new AppError('Usuário não encontrado', 404);
  res.json(usuarioPublico(rows[0]));
});

const remover = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [{ rows: causas }, { rows: acoes }, { rows: fatos }] = await Promise.all([
    pool.query('SELECT 1 FROM causas WHERE responsavel_id = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM acoes_responsaveis WHERE usuario_id = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM fatos WHERE criado_por = $1 LIMIT 1', [id]),
  ]);

  if (causas.length || acoes.length || fatos.length) {
    throw new AppError('Não é possível excluir: há fatos, causas ou ações ligados a este usuário.', 409);
  }

  const { rowCount } = await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
  if (!rowCount) throw new AppError('Usuário não encontrado', 404);
  res.status(204).send();
});

module.exports = { listar, buscarPorId, verificarEmail, criarOuConvidar, atualizar, remover };
