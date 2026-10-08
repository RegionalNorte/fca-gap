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
