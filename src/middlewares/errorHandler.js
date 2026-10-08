function notFound(req, res) {
  res.status(404).json({ erro: 'Rota não encontrada' });
}

// Mapeia erros conhecidos do driver pg para mensagens amigáveis,
// sem expor detalhes internos do schema pro cliente.
const PG_ERROS = {
  '23505': { status: 409, mensagem: 'Já existe um registro com esse valor único' },
  '23503': { status: 409, mensagem: 'Operação viola uma referência existente' },
  '23502': { status: 400, mensagem: 'Campo obrigatório ausente' },
  '23514': { status: 400, mensagem: 'Valor viola uma restrição do banco (ex: datas inconsistentes)' },
  '22P02': { status: 400, mensagem: 'Formato de dado inválido (ex: UUID ou data mal formatado)' },
};

function errorHandler(err, req, res, next) {
  if (err.code && PG_ERROS[err.code]) {
    const { status, mensagem } = PG_ERROS[err.code];
    return res.status(status).json({ erro: mensagem });
  }

  if (!err.status) {
    console.error(err);
  }

  res.status(err.status || 500).json({ erro: err.message || 'Erro interno' });
}

module.exports = { notFound, errorHandler };
