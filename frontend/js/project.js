/**
 * Gestione progetti
 * @version 2.7.0
 */
import { CONFIG } from './config.js';
import { showNotification, truncate, formatDate, debounce, debugLog } from './utils.js';

const MAX_LIMIT = 100;

const apiUrl = (path) => {
  const clean = String(path || '').replace(/^\/+/, '');
  if (typeof CONFIG?.apiUrl === 'function') return CONFIG.apiUrl(clean);
  const base = CONFIG?.API_BASE || '';
  return `${String(base).replace(/\/+$/, '')}/${clean}`.replace(/\/{2,}/g, '/');
};

const EP = {
  LIST: CONFIG?.ENDPOINTS?.PROJECTS?.LIST || 'api/projects',
  DETAILS: (id) => `api/projects/${id}`
};

const escapeHTML = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function isValidHttpUrl(url) {
  try { const u = new URL(url, window.location.origin); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}
const safeUrl = (u) => (u && isValidHttpUrl(u) ? u : null);

function absolutizeIfLocal(u) {
  if (!u) return null;
  try { new URL(u); return u; } catch {
    const base = (typeof window !== 'undefined' && window.__API_BASE__)
      || 'http://localhost:5000';
    return base.replace(/\/+$/, '') + '/' + String(u).replace(/^\/+/, '');
  }
}

const projectState = {
  projects: [],
  filtered: [],
  loading: false,
  search: '',
  filter: 'all',
  sortBy: 'newest',
  cache: null,
  cacheTs: null,
  CACHE_MS: 5 * 60 * 1000,
};

let el = {};
let lastCtl = null;

/* ============= Init — NO booted guard (router gestisce) ============= */
export async function initProjects() {
  debugLog?.('info', '🔄 init Projects');

  // reset stato per ogni navigazione
  projectState.search = '';
  projectState.filter = 'all';

  try {
    setupDOM();
    setupEvents();
    await loadProjects();
  } catch (e) {
    console.error(e);
    showError('Errore durante il caricamento dei progetti');
  }
}

function setupDOM() {
  el = {
    refresh: document.getElementById('projects-refresh'),
    search: document.getElementById('projects-search'),
    filter: document.getElementById('projects-filter'),
    grid: document.getElementById('project-list'),
    err: document.getElementById('project-error'),
    empty: document.getElementById('project-empty'),
  };
  showSkeleton();
}

function setupEvents() {
  el.refresh?.addEventListener('click', () => loadProjects(true));

  el.search?.addEventListener('input', debounce(e => {
    projectState.search = (e.target.value || '').toLowerCase().trim();
    filterAndRender();
    render();
  }, 300));

  el.filter?.addEventListener('change', e => {
    projectState.filter = e.target.value || 'all';
    filterAndRender();
    render();
  });

  el.grid?.addEventListener('click', async e => {
    const btn = e.target.closest('.project-details-btn');
    const retry = e.target.closest('[data-action="retry-projects"]');
    if (btn) {
      const id = btn.getAttribute('data-project-id');
      const local = projectState.projects.find(p => p.id === id);
      let fresh = null;
      try { fresh = await fetchProjectById(id); } catch { }
      showDetails(fresh || local);
    }
    if (retry) loadProjects(true);
  });
}

async function fetchProjectById(id) {
  const url = apiUrl(EP.DETAILS(id));
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `${r.status}`);
  const p = j?.data?.project || j?.item || j?.project || j;
  return normalize(p);
}

export async function loadProjects(force = false) {
  if (projectState.loading) return;
  projectState.loading = true;

  if (lastCtl) { try { lastCtl.abort(); } catch { } }
  lastCtl = new AbortController();

  try {
    if (!force && isCacheValid()) {
      projectState.projects = projectState.cache;
      filterAndRender();
      render();
      return;
    }

    showSkeleton();

    const params = new URLSearchParams({ status: 'published', sort: '-createdAt', limit: String(MAX_LIMIT) });
    const url = `${apiUrl(EP.LIST)}?${params}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: lastCtl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || `${r.status}`);

    let arr = [];
    if (Array.isArray(j)) arr = j;
    else if (Array.isArray(j?.data?.projects)) arr = j.data.projects;
    else if (Array.isArray(j?.projects)) arr = j.projects;
    else if (Array.isArray(j?.items)) arr = j.items;
    else if (Array.isArray(j?.data)) arr = j.data;

    projectState.projects = arr.map(normalize);
    projectState.cache = [...projectState.projects];
    projectState.cacheTs = Date.now();

    filterAndRender();
    render();
  } catch (e) {
    if (e?.name === 'AbortError') return;
    console.error(e);
    showError(/Network|Failed to fetch/i.test(e.message)
      ? 'Errore di connessione. Controlla la tua rete.'
      : (e.message || 'Errore caricamento progetti'));
  } finally {
    projectState.loading = false;
  }
}

function isCacheValid() {
  return projectState.cache && projectState.cacheTs &&
    (Date.now() - projectState.cacheTs) < projectState.CACHE_MS;
}

function normalize(p) {
  return {
    id: String(p.id || p._id || Math.random().toString(36).slice(2)),
    title: p.title || p.name || 'Senza titolo',
    description: p.description || '',
    technologies: Array.isArray(p.technologies) ? p.technologies : [],
    github: safeUrl(p.github || p.repository || null),
    demo: safeUrl(p.demo || p.liveDemo || p.url || null),
    image: absolutizeIfLocal(p.image || p.thumbnail || null),
    category: p.category || 'web',
    featured: !!p.featured,
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString(),
  };
}

function filterAndRender() {
  let filtered = [...projectState.projects];
  if (projectState.search) {
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(projectState.search) ||
      p.description.toLowerCase().includes(projectState.search) ||
      p.technologies.some(t => String(t).toLowerCase().includes(projectState.search))
    );
  }
  if (projectState.filter !== 'all') {
    filtered = filtered.filter(p => p.category === projectState.filter);
  }
  projectState.filtered = sortArray(filtered, projectState.sortBy);
}

function sortArray(arr, sortBy) {
  const a = [...arr];
  switch (sortBy) {
    case 'newest': a.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt)); break;
    case 'oldest': a.sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt)); break;
    case 'title': a.sort((x, y) => x.title.localeCompare(y.title)); break;
    case 'featured': a.sort((x, y) => (y.featured === x.featured) ? 0 : (y.featured ? 1 : -1)); break;
  }
  return a;
}

function render() {
  if (!el.grid) return;

  if (!projectState.filtered.length) {
    el.grid.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-inbox display-1 text-muted"></i>
        <h4 class="mt-3">Nessun progetto trovato</h4>
        <p class="text-muted">Prova a modificare i filtri.</p>
      </div>`;
    el.empty?.classList.remove('d-none');
    return;
  }
  el.empty?.classList.add('d-none');

  el.grid.innerHTML = projectState.filtered.map(p => {
    const title = escapeHTML(p.title);
    const desc = escapeHTML(truncate(p.description, 120));
    const techs = (p.technologies || []).slice(0, 5).map(escapeHTML);
    const more = Math.max((p.technologies || []).length - 5, 0);

    const img = p.image
      ? `<div class="ratio ratio-16x9 bg-light"><img src="${p.image}" class="card-img-top object-fit-cover" alt="${title}" loading="lazy"></div>`
      : `<div class="ratio ratio-16x9 bg-light d-flex align-items-center justify-content-center"><i class="bi bi-image text-muted fs-1"></i></div>`;

    const ghBtn = p.github ? `<a href="${p.github}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-dark"><i class="bi bi-github me-1"></i>Code</a>` : '';
    const demoBtn = p.demo ? `<a href="${p.demo}"   target="_blank" rel="noopener" class="btn btn-sm btn-primary"><i class="bi bi-play-circle me-1"></i>Demo</a>` : '';

    return `
      <div class="col">
        <article class="card h-100 shadow-sm project-card" data-project-id="${p.id}">
          ${img}
          <div class="card-body d-flex flex-column">
            <div class="d-flex align-items-start justify-content-between mb-2">
              <h5 class="card-title mb-0">${title}</h5>
              ${p.featured ? `<span class="badge bg-warning text-dark ms-2">Featured</span>` : ''}
            </div>
            <p class="card-text text-muted small flex-grow-1">${desc}</p>
            ${techs.length ? `
              <div class="mb-2 d-flex flex-wrap gap-1">
                ${techs.map(t => `<span class="badge bg-light text-dark border">${t}</span>`).join('')}
                ${more > 0 ? `<span class="badge bg-secondary">+${more}</span>` : ''}
              </div>` : ''}
            <div class="text-muted small mb-2"><i class="bi bi-calendar me-1"></i>${formatDate(p.createdAt)}</div>
            <div class="mt-auto d-flex gap-2">
              ${ghBtn}${demoBtn}
              <button class="btn btn-sm btn-outline-secondary project-details-btn" data-project-id="${p.id}">
                <i class="bi bi-info-circle"></i>
              </button>
            </div>
          </div>
        </article>
      </div>`;
  }).join('');

  el.grid.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => {
      const ratio = img.closest('.ratio');
      if (ratio) ratio.innerHTML = `<div class="w-100 h-100 bg-light d-flex align-items-center justify-content-center"><i class="bi bi-image text-muted fs-1"></i></div>`;
    }, { once: true });
  });
}

function showDetails(p) {
  if (!p) { showNotification('Progetto non trovato', 'error'); return; }
  const title = escapeHTML(p.title);
  const desc = escapeHTML(p.description);
  const techs = (p.technologies || []).map(escapeHTML);

  document.getElementById('projectDetailsModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="projectDetailsModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg"><div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">${title}</h5>
          <button class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          ${p.image ? `<img src="${p.image}" alt="${title}" class="img-fluid rounded mb-3">` : ''}
          <p class="lead">${desc}</p>
          ${techs.length ? `<div class="mb-2"><h6>Tecnologie</h6><div class="d-flex flex-wrap gap-1">${techs.map(t => `<span class="badge bg-primary">${t}</span>`).join('')}</div></div>` : ''}
          <small class="text-muted"><i class="bi bi-calendar me-1"></i>${formatDate(p.createdAt)}</small>
        </div>
        <div class="modal-footer">
          ${p.github ? `<a href="${p.github}" target="_blank" rel="noopener" class="btn btn-outline-dark"><i class="bi bi-github me-1"></i>Code</a>` : ''}
          ${p.demo ? `<a href="${p.demo}"   target="_blank" rel="noopener" class="btn btn-primary"><i class="bi bi-play-circle me-1"></i>Demo</a>` : ''}
          <button class="btn btn-secondary" data-bs-dismiss="modal">Chiudi</button>
        </div>
      </div></div>
    </div>`);

  if (window.bootstrap?.Modal) {
    new bootstrap.Modal(document.getElementById('projectDetailsModal')).show();
  }
}

function showSkeleton() {
  if (!el.grid) return;
  el.grid.innerHTML = Array.from({ length: 6 }).map(() => `
    <div class="col">
      <div class="card h-100">
        <div class="ratio ratio-16x9 bg-light skeleton-image"></div>
        <div class="card-body">
          <div class="skeleton-title mb-2"></div>
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
        </div>
      </div>
    </div>`).join('');
}

function showError(message) {
  if (el.err) { el.err.textContent = message; el.err.classList.remove('d-none'); }
  if (el.grid) el.grid.innerHTML = `
    <div class="col-12 text-center py-5">
      <i class="bi bi-exclamation-triangle display-1 text-danger"></i>
      <h4 class="mt-3 text-danger">Errore</h4>
      <p class="text-muted">${escapeHTML(message)}</p>
      <button class="btn btn-primary" data-action="retry-projects">
        <i class="bi bi-arrow-clockwise me-1"></i>Riprova
      </button>
    </div>`;
}

export async function refreshProjects() { await loadProjects(true); showNotification('Aggiornato', 'success'); }
export function getProjects() { return [...projectState.projects]; }
export function getProjectById(id) { return projectState.projects.find(p => p.id === id); }