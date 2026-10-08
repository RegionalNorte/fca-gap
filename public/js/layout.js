const NAV_ITEMS = [
  { chave: 'dashboard', href: '/index.html', label: 'Dashboard', papeis: ['admin', 'gestor_regional', 'gestor_area', 'gestor_unidade'] },
  { chave: 'fatos', href: '/fatos.html', label: 'Fatos', papeis: null },
  { chave: 'prazos', href: '/prazos.html', label: 'Prazos', papeis: null },
];

// Gestão: estrutura organizacional e diretório de usuários — só o admin
// mexe nisso. "Convidar responsável" de dentro de uma causa/ação continua
// liberado pros demais gestores; aquilo não é "gerenciar usuários".
const NAV_ITEMS_GESTAO = [
  { chave: 'usuarios', href: '/usuarios.html', label: 'Usuários', papeis: ['admin'] },
  { chave: 'areas', href: '/areas.html', label: 'Áreas', papeis: ['admin'] },
  { chave: 'unidades', href: '/unidades.html', label: 'Unidades', papeis: ['admin'] },
];

const NAV_ICONS = {
  dashboard: '<svg class="nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="6" height="7" rx="1"/><rect x="10" y="2" width="6" height="4" rx="1"/><rect x="10" y="9" width="6" height="7" rx="1"/><rect x="2" y="12" width="6" height="4" rx="1"/></svg>',
  fatos: '<svg class="nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h7l3 3v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path d="M6 8h6M6 11h6M6 5h3"/></svg>',
  prazos: '<svg class="nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="9.5" r="6.5"/><path d="M9 6v3.5l2.5 1.5M6.5 1.5h5"/></svg>',
  usuarios: '<svg class="nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="6" r="2.5"/><path d="M3.5 15c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5"/></svg>',
  areas: '<svg class="nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="2.5" width="13" height="13" rx="1.5"/><path d="M2.5 7h13M7 7v8.5"/></svg>',
  unidades: '<svg class="nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 15.5V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v11.5M3 15.5h12M6.5 6.5h1M10.5 6.5h1M6.5 10h1M10.5 10h1"/></svg>',
};

function exigirAuth() {
  if (!getToken()) {
    location.href = '/login.html';
    throw new Error('redirecionando');
  }
}

function montarLayout({ ativo, titulo, breadcrumb = [], acoesHtml = '' }) {
  const usuario = getUsuario() || {};
  const papel = usuario.papel;
  const colapsado = localStorage.getItem('fcagap_sidebar_colapsado') === '1';

  function renderNavItem(item) {
    return `
      <a class="nav-item ${item.chave === ativo ? 'active' : ''}" href="${item.href}">
        ${NAV_ICONS[item.chave]}
        <span class="nav-label">${item.label}</span>
      </a>`;
  }

  const navHtml = NAV_ITEMS.filter((item) => !item.papeis || item.papeis.includes(papel)).map(renderNavItem).join('');

  const itensGestao = NAV_ITEMS_GESTAO.filter((item) => item.papeis.includes(papel));
  const navGestaoHtml = itensGestao.length
    ? `<span class="sidebar-nav-label">Gestão</span>${itensGestao.map(renderNavItem).join('')}`
    : '';

  const shell = document.getElementById('shell');
  shell.innerHTML = `
    <div class="app-shell ${colapsado ? 'sidebar-collapsed' : ''}" id="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <span class="sidebar-brand-text">FCA GAP</span>
          <button class="sidebar-toggle-btn" id="btn-colapsar" title="Recolher menu">
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" id="icone-colapsar"><path d="M11 3 6 9l5 6"/></svg>
          </button>
        </div>
        <nav class="sidebar-nav">${navHtml}${navGestaoHtml}</nav>
        <div class="sidebar-footer">
          <span class="sidebar-group-label">Regional Norte</span>
          <div class="user-footer">
            <span class="user-avatar">${iniciais(usuario.nome || usuario.email)}</span>
            <span class="user-footer-text">
              <span class="name">${escapeHtml(usuario.nome || usuario.email || '')}</span>
              <span class="role">${rotuloPapel(papel)}</span>
            </span>
          </div>
          <a class="logout-link" id="btn-sair">
            <svg class="nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 2H3.5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1H7M12 12.5 16 9l-4-3.5M16 9H7"/></svg>
            <span class="nav-label">Sair</span>
          </a>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div style="display:flex; align-items:center; gap:12px">
            <button class="mobile-menu-btn" id="btn-menu-mobile" aria-label="Abrir menu">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13"/></svg>
            </button>
            <div>
              ${breadcrumb.length ? `<div class="topbar-breadcrumb">${breadcrumb.map(escapeHtml).join(' <span class="sep">/</span> ')}</div>` : ''}
              <h1>${escapeHtml(titulo)}</h1>
            </div>
          </div>
          <div class="topbar-actions">${acoesHtml}</div>
        </header>
        <main class="content" id="content"></main>
      </div>
      <div class="mobile-backdrop" id="mobile-backdrop"></div>
    </div>
  `;

  document.getElementById('btn-sair').addEventListener('click', () => {
    limparSessao();
    location.href = '/login.html';
  });

  const sidebarEl = shell.querySelector('.sidebar');
  const backdropEl = document.getElementById('mobile-backdrop');

  function fecharMenuMobile() {
    sidebarEl.classList.remove('mobile-open');
    backdropEl.classList.remove('show');
  }

  document.getElementById('btn-menu-mobile').addEventListener('click', () => {
    sidebarEl.classList.add('mobile-open');
    backdropEl.classList.add('show');
  });
  backdropEl.addEventListener('click', fecharMenuMobile);
  shell.querySelectorAll('.nav-item').forEach((el) => el.addEventListener('click', fecharMenuMobile));

  function atualizarIconeColapsar(colapsadoAgora) {
    const path = document.querySelector('#icone-colapsar path');
    path.setAttribute('d', colapsadoAgora ? 'M7 3l5 6-5 6' : 'M11 3 6 9l5 6');
  }
  atualizarIconeColapsar(colapsado);

  document.getElementById('btn-colapsar').addEventListener('click', () => {
    const el = document.getElementById('app-shell');
    const novo = !el.classList.contains('sidebar-collapsed');
    el.classList.toggle('sidebar-collapsed', novo);
    localStorage.setItem('fcagap_sidebar_colapsado', novo ? '1' : '0');
    atualizarIconeColapsar(novo);
  });

  return document.getElementById('content');
}

function rotuloPapel(papel) {
  const mapa = {
    admin: 'Administrador',
    gestor_regional: 'Gestor regional',
    gestor_area: 'Gestor de área',
    gestor_unidade: 'Gestor de unidade',
    colaborador: 'Colaborador',
  };
  return mapa[papel] || papel || '';
}
