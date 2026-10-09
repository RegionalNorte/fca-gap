// Sanitiza o HTML do editor de texto rico (hoje usado no título do fato):
// escapa TUDO primeiro (& < >), depois "desescapa" de volta só os tokens
// exatos que o próprio editor gera (<br> e <span style="color:#HEX">,
// com HEX de uma paleta fixa). Qualquer outra tag/atributo (script, img
// onerror, a href=javascript:, span com outro estilo etc.) permanece
// escapada — ou seja, aparece como texto literal, nunca é interpretada
// como HTML. Isso vale tanto pro que vem do editor quanto pra qualquer
// payload mandado direto pra API, então é a única barreira que importa
// de verdade (o cliente também sanitiza, mas só por UX).
const CORES_PERMITIDAS = new Set(['#18181b', '#b91c1c', '#b45309', '#15803d', '#1d4ed8']);

const LIMITE_HTML = 2000;

// o navegador normaliza "color:#b91c1c" pra "color: rgb(185, 28, 28)"
// quando serializa de volta pra HTML (span.style.color sempre volta
// assim) — por isso o sanitizador precisa aceitar os dois formatos,
// convertendo rgb() de volta pro hex canônico antes de checar a paleta.
function rgbParaHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Number(n)));
  const paraHex = (n) => clamp(n).toString(16).padStart(2, '0');
  return `#${paraHex(r)}${paraHex(g)}${paraHex(b)}`;
}

function sanitizarTextoRico(bruto) {
  if (bruto === null || bruto === undefined) return bruto;

  let seguro = String(bruto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  seguro = seguro.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  seguro = seguro.replace(/&lt;\/span&gt;/gi, '</span>');
  seguro = seguro.replace(
    /&lt;span style="color:\s*(#[0-9a-fA-F]{6}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))\s*;?"&gt;/gi,
    (m, cor) => {
      const rgbMatch = cor.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
      const hex = rgbMatch ? rgbParaHex(rgbMatch[1], rgbMatch[2], rgbMatch[3]) : cor.toLowerCase();
      return CORES_PERMITIDAS.has(hex) ? `<span style="color:${hex}">` : '';
    }
  );

  return seguro;
}

module.exports = { sanitizarTextoRico, CORES_PERMITIDAS, LIMITE_HTML };
