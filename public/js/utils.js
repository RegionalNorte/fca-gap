const STATUS_ACAO_LABEL = {
  nao_iniciada: 'Não iniciada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  adiantada: 'Adiantada',
  atrasada: 'Atrasada',
};

const STATUS_FATO_LABEL = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

function statusAcaoHtml(status) {
  const label = STATUS_ACAO_LABEL[status] || status;
  return `<span class="status status--${status}">${label}</span>`;
}

function statusFatoHtml(status) {
  const label = STATUS_FATO_LABEL[status] || status;
  const classe = status === 'cancelado' ? 'cancelado' : status === 'concluido' ? 'concluida' : status === 'aberto' ? 'nao_iniciada' : status;
  return `<span class="status status--${classe}">${label}</span>`;
}

function statusVencidoHtml(texto) {
  return `<span class="alerta-vencido">${texto}</span>`;
}

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function iniciais(nome) {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/);
  const primeiras = partes.slice(0, 2).map((p) => p[0]);
  return primeiras.join('').toUpperCase();
}

function chipHtml(nome) {
  return `<span class="chip"><span class="chip-avatar">${iniciais(nome)}</span>${nome || 'Sem nome'}</span>`;
}

function chipsResponsaveis(nomes) {
  if (!nomes) return '<span style="color:var(--faint); font-size:13px">Sem responsável</span>';
  const lista = Array.isArray(nomes) ? nomes : nomes.split(',').map((n) => n.trim());
  return `<div class="chip-row">${lista.map(chipHtml).join('')}</div>`;
}

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mostrarToast(mensagem, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${tipo === 'erro' ? 'toast--erro' : ''}`;
  el.textContent = mensagem;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function erroApi(err) {
  mostrarToast(err.message || 'Erro inesperado', 'erro');
}

// Modal genérico: abrirModal({ titulo, meta, corpo, largura }) monta o
// backdrop + caixa; fecha no X, clicando fora ou com Esc. Só um modal por
// vez. largura: 'lg' pros modais que têm registro com texto mais longo
// (causa/ação) — o padrão (sem passar nada) continua o tamanho de sempre.
function abrirModal({ titulo, meta = '', corpo, largura = '' }) {
  fecharModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-box ${largura === 'lg' ? 'modal-box--lg' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(titulo)}">
      <div class="modal-header">
        <div>
          <h2>${escapeHtml(titulo)}</h2>
          ${meta ? `<div class="meta">${meta}</div>` : ''}
        </div>
        <button type="button" class="modal-close-btn" id="modal-fechar-btn" aria-label="Fechar">
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4l10 10M14 4 4 14"/></svg>
        </button>
      </div>
      <div class="modal-body">${corpo}</div>
    </div>
  `;

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) fecharModal();
  });

  document.body.appendChild(backdrop);
  document.getElementById('modal-fechar-btn').addEventListener('click', fecharModal);
  document.addEventListener('keydown', fecharModalNoEsc);

  return backdrop;
}

function fecharModalNoEsc(e) {
  if (e.key === 'Escape') fecharModal();
}

function fecharModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.remove();
  document.removeEventListener('keydown', fecharModalNoEsc);
}

// Editor de texto rico (hoje só pro título do fato): cor + quebra de
// linha. Gera só <span style="color:#HEX"> e <br> — nada mais — pra
// bater exatamente com o que o sanitizador do servidor aceita
// (src/utils/richText.js). Sanitiza de novo aqui só por UX (feedback
// imediato se algo escapar do textoFormatadoHtml); a barreira de
// segurança real é sempre a do servidor.
const PALETA_EDITOR_RICO = [
  { nome: 'Padrão', cor: '#18181b' },
  { nome: 'Vermelho', cor: '#b91c1c' },
  { nome: 'Laranja', cor: '#b45309' },
  { nome: 'Verde', cor: '#15803d' },
  { nome: 'Azul', cor: '#1d4ed8' },
];

function corpoEditorRico(id, placeholder = '') {
  return `
    <div class="editor-rico-toolbar">
      <button type="button" class="editor-rico-estilo" data-estilo="bold" data-for="${id}" title="Negrito"><b>B</b></button>
      <button type="button" class="editor-rico-estilo" data-estilo="italic" data-for="${id}" title="Itálico"><i>I</i></button>
      <span class="editor-rico-divisor"></span>
      ${PALETA_EDITOR_RICO.map(
        (p) => `<button type="button" class="editor-rico-cor" data-cor="${p.cor}" data-for="${id}" title="${escapeHtml(p.nome)}" style="background:${p.cor}"></button>`
      ).join('')}
    </div>
    <div id="${id}" class="editor-rico" contenteditable="true" data-placeholder="${escapeHtml(placeholder)}"></div>
  `;
}

function aplicarCorEditorRico(editorEl, cor) {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) {
    mostrarToast('Selecione o texto que quer colorir.', 'erro');
    return;
  }
  const range = sel.getRangeAt(0);
  if (!editorEl.contains(range.commonAncestorContainer)) return;

  const span = document.createElement('span');
  span.style.color = cor;
  try {
    range.surroundContents(span);
  } catch {
    const conteudo = range.extractContents();
    span.appendChild(conteudo);
    range.insertNode(span);
  }
  sel.removeAllRanges();
}

// Ativa quebra de linha no Enter (<br>, não <div>) + força colar como
// texto puro (sem trazer HTML/estilo de fora) + liga os botões de cor
// da toolbar correspondente.
function ativarEditorRico(id) {
  const editor = document.getElementById(id);
  if (!editor) return;

  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    document.execCommand('insertLineBreak');
  });

  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const texto = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, texto);
  });

  // impede que o mousedown no botão tire o foco do editor (o que colapsa
  // a seleção antes do click chegar a rodar)
  document.querySelectorAll(`.editor-rico-toolbar [data-for="${id}"]`).forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  });

  document.querySelectorAll(`.editor-rico-cor[data-for="${id}"]`).forEach((btn) => {
    btn.addEventListener('click', () => aplicarCorEditorRico(editor, btn.dataset.cor));
  });

  document.querySelectorAll(`.editor-rico-estilo[data-for="${id}"]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      if (window.getSelection().isCollapsed) {
        mostrarToast('Selecione o texto que quer formatar.', 'erro');
        return;
      }
      editor.focus();
      document.execCommand(btn.dataset.estilo);
    });
  });
}

function obterHtmlEditorRico(id) {
  return document.getElementById(id).innerHTML.trim();
}

function textoPlanoEditorRico(id) {
  return document.getElementById(id).textContent.trim();
}

function definirHtmlEditorRico(id, html) {
  document.getElementById(id).innerHTML = html || '';
}

// Célula de título com clamp de 3 linhas + "Ver mais" (só aparece se o
// texto realmente passar de 3 linhas) que abre um modal com o título
// completo formatado. `html` já vem sanitizado pelo servidor.
function tituloClampHtml(html, id) {
  return `
    <div>
      <div class="titulo-rico-clamp" id="titulo-clamp-${id}">${html || ''}</div>
      <button type="button" class="link-action titulo-ver-mais" id="titulo-vermais-${id}" style="display:none">Ver mais</button>
    </div>
  `;
}

function ativarTituloVerMais(id, htmlCompleto) {
  const clamp = document.getElementById(`titulo-clamp-${id}`);
  const btn = document.getElementById(`titulo-vermais-${id}`);
  if (!clamp || !btn) return;

  if (clamp.scrollHeight > clamp.clientHeight + 1) {
    btn.style.display = 'inline';
  }
  btn.addEventListener('click', () => {
    abrirModal({ titulo: 'Título completo', corpo: `<div class="titulo-modal-conteudo">${htmlCompleto}</div>` });
  });
}
