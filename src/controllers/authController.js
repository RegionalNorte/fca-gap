const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { gerarToken } = require('../middlewares/auth');
const { enviarRedefinicaoSenha } = require('../services/email');

// reaproveita convite_token/convite_enviado_em pro link de "esqueci minha
// senha" — mesma coluna, mas aqui sempre com checagem de validade (1h);
// o convite original (primeiro acesso) continua sem prazo, de propósito.
const REDEFINICAO_VALIDADE_SQL = `convite_enviado_em > now() - interval '1 hour'`;

function usuarioPublico(usuario) {
  const { senha_hash, convite_token, ...resto } = usuario;
  return resto;
}

const login = asyncHandler(async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    throw new AppError('Informe e-mail e senha', 400);
  }

  const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
  const usuario = rows[0];

  // Mesma mensagem genérica em todos os casos de falha, pra não revelar
  // se o e-mail existe ou não. Convidado sem senha_hash também não entra.
  if (!usuario || !usuario.ativo || !usuario.senha_hash) {
    throw new AppError('E-mail ou senha inválidos', 401);
  }

  const ok = await bcrypt.compare(senha, usuario.senha_hash);
  if (!ok) {
    throw new AppError('E-mail ou senha inválidos', 401);
  }

  const token = gerarToken(usuario);
  res.json({ token, usuario: usuarioPublico(usuario) });
});

const me = asyncHandler(async (req, res) => {
  res.json({ usuario: req.usuario });
});

const verConvite = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const { rows } = await pool.query(
    'SELECT nome, email FROM usuarios WHERE convite_token = $1',
    [token]
  );
  const usuario = rows[0];

  if (!usuario) {
    throw new AppError('Convite inválido ou já utilizado', 404);
  }

  res.json({ usuario });
});

const aceitarConvite = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { nome, senha } = req.body;

  if (!senha || senha.length < 6) {
    throw new AppError('A senha deve ter ao menos 6 caracteres', 400);
  }

  const { rows } = await pool.query(
    'SELECT * FROM usuarios WHERE convite_token = $1',
    [token]
  );
  const usuario = rows[0];

  if (!usuario) {
    throw new AppError('Convite inválido ou já utilizado', 404);
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  const { rows: atualizados } = await pool.query(
    `UPDATE usuarios
     SET senha_hash = $1, convite_token = NULL, nome = COALESCE($2, nome)
     WHERE id = $3
     RETURNING *`,
    [senhaHash, nome || null, usuario.id]
  );

  const atualizado = atualizados[0];
  const jwtToken = gerarToken(atualizado);

  res.json({ token: jwtToken, usuario: usuarioPublico(atualizado) });
});

// Dispara o e-mail de redefinição se o e-mail pertencer a uma conta já
// ativa (senha_hash definido). Responde sempre a mesma mensagem genérica,
// exista ou não o e-mail, pra não revelar quem tem conta no sistema.
const esqueciSenha = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new AppError('Informe o e-mail', 400);

  const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
  const usuario = rows[0];

  if (usuario && usuario.ativo && usuario.senha_hash) {
    const token = crypto.randomUUID();
    await pool.query(
      'UPDATE usuarios SET convite_token = $1, convite_enviado_em = now() WHERE id = $2',
      [token, usuario.id]
    );
    await enviarRedefinicaoSenha({ nome: usuario.nome, email: usuario.email, token });
  }

  res.json({ mensagem: 'Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha.' });
});

const verTokenRedefinicao = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const { rows } = await pool.query(
    `SELECT nome, email FROM usuarios
     WHERE convite_token = $1 AND senha_hash IS NOT NULL AND ${REDEFINICAO_VALIDADE_SQL}`,
    [token]
  );
  const usuario = rows[0];

  if (!usuario) {
    throw new AppError('Link inválido ou expirado. Solicite uma nova redefinição.', 404);
  }

  res.json({ usuario });
});

const redefinirSenha = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { senha } = req.body;

  if (!senha || senha.length < 6) {
    throw new AppError('A senha deve ter ao menos 6 caracteres', 400);
  }

  const { rows } = await pool.query(
    `SELECT * FROM usuarios
     WHERE convite_token = $1 AND senha_hash IS NOT NULL AND ${REDEFINICAO_VALIDADE_SQL}`,
    [token]
  );
  const usuario = rows[0];

  if (!usuario) {
    throw new AppError('Link inválido ou expirado. Solicite uma nova redefinição.', 404);
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  const { rows: atualizados } = await pool.query(
    `UPDATE usuarios SET senha_hash = $1, convite_token = NULL WHERE id = $2 RETURNING *`,
    [senhaHash, usuario.id]
  );

  const atualizado = atualizados[0];
  const jwtToken = gerarToken(atualizado);

  res.json({ token: jwtToken, usuario: usuarioPublico(atualizado) });
});

module.exports = { login, me, verConvite, aceitarConvite, esqueciSenha, verTokenRedefinicao, redefinirSenha };
