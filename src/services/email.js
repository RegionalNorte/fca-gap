// Fase local: não há provedor de e-mail configurado ainda, então só
// registramos no console o que seria enviado. Na migração pra produção,
// trocar o corpo destas funções por uma chamada real (ex: Resend, SES,
// SMTP do Supabase) mantendo a mesma assinatura.

function enviarConvite({ nome, email, token }) {
  const link = `/definir-senha?token=${token}`;
  console.log(`[email] Convite para ${nome || email} <${email}>: acesse ${link} para criar sua senha.`);
}

function enviarAvisoAtribuicao({ nome, email, contexto }) {
  console.log(`[email] Aviso para ${nome || email} <${email}>: você foi atribuído(a) a ${contexto}.`);
}

module.exports = { enviarConvite, enviarAvisoAtribuicao };
