const nodemailer = require('nodemailer');

// Gmail por enquanto (fase local/teste); trocar pra Resend/SES na migração
// pra produção mantendo a mesma assinatura das funções abaixo. Se as
// variáveis não estiverem configuradas, cai pro modo antigo (só console),
// pra não quebrar o fluxo de convite em ambientes sem e-mail configurado.
const configurado = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

const transporter = configurado
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })
  : null;

const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function enviar({ para, assunto, texto, html }) {
  if (!configurado) {
    console.log(`[email] (sem provedor configurado) Para: ${para} · Assunto: ${assunto}\n${texto}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"FCA GAP" <${process.env.EMAIL_USER}>`,
      to: para,
      subject: assunto,
      text: texto,
      html,
    });
  } catch (err) {
    // um e-mail que falha não deve derrubar o convite/atribuição, que já
    // foram gravados no banco antes desta chamada
    console.error(`[email] Falha ao enviar para ${para}:`, err.message);
  }
}

async function enviarConvite({ nome, email, token }) {
  const link = `${baseUrl}/definir-senha.html?token=${token}`;
  const saudacao = nome ? `Olá, ${nome}.` : 'Olá.';

  await enviar({
    para: email,
    assunto: 'Convite para o FCA GAP',
    texto: `${saudacao}\n\nVocê foi convidado(a) a acompanhar fatos, causas e ações no FCA GAP.\n\nDefina sua senha para acessar:\n${link}\n\nSe não esperava este convite, pode ignorar este e-mail.`,
    html: `
      <p>${saudacao}</p>
      <p>Você foi convidado(a) a acompanhar fatos, causas e ações no FCA GAP.</p>
      <p><a href="${link}">Defina sua senha para acessar</a></p>
      <p style="color:#6b7280; font-size:13px">Se não esperava este convite, pode ignorar este e-mail.</p>
    `,
  });
}

async function enviarAvisoAtribuicao({ nome, email, contexto }) {
  const saudacao = nome ? `Olá, ${nome}.` : 'Olá.';
  const link = `${baseUrl}/login.html`;

  await enviar({
    para: email,
    assunto: 'Você foi atribuído(a) no FCA GAP',
    texto: `${saudacao}\n\nVocê foi atribuído(a) a ${contexto} no FCA GAP.\n\nAcesse com sua conta já existente:\n${link}`,
    html: `
      <p>${saudacao}</p>
      <p>Você foi atribuído(a) a ${escapeHtml(contexto)} no FCA GAP.</p>
      <p><a href="${link}">Acessar com sua conta</a></p>
    `,
  });
}

module.exports = { enviarConvite, enviarAvisoAtribuicao };
