const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

function gerarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

const autenticar = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');

  if (tipo !== 'Bearer' || !token) {
    throw new AppError('Token de autenticação ausente', 401);
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError('Token inválido ou expirado', 401);
  }

  const { rows } = await pool.query(
    'SELECT id, nome, email, unidade_id, papel, ativo FROM usuarios WHERE id = $1',
    [payload.sub]
  );
  const usuario = rows[0];

  if (!usuario || !usuario.ativo) {
    throw new AppError('Sessão inválida', 401);
  }

  req.usuario = usuario;
  next();
});

function permitir(...papeis) {
  return (req, res, next) => {
    if (!req.usuario || !papeis.includes(req.usuario.papel)) {
      return next(new AppError('Sem permissão para esta ação', 403));
    }
    next();
  };
}

module.exports = { autenticar, permitir, gerarToken };
