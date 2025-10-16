/**
 * Gestion moderne des projets
 * @version 2.6.0
 * author: Raphael Goumou
 */

import { CONFIG } from './config.js';
import { showNotification, truncate, formatDate, debounce, debugLog } from './utils.js';

const MAX_LIMIT = 100;

/* ============= Helpers URL & safe ============= */
const apiUrl = (path) => {
  const clean = String(path || '').replace(/^\/+/, '');
  if (typeof CONFIG?.apiUrl === 'function') return CONFIG.apiUrl(clean);
  const base = CONFIG?.ENDPOINTS?.BASE || CONFIG?.API_BASE || '';
  return `${String(base).replace(/\/+$/,'')}/${clean}`.replace(/\/{2,}/g,'/');
};

const EP = {
  LIST: CONFIG?.ENDPOINTS?.PROJECTS?.LIST || 'api/projects',
  DETAILS: (id) =>
    (CONFIG?.ENDPOINTS?.PROJECTS?.DETAILS
      ? CONFIG.ENDPOINTS.PROJECTS.DETAILS.replace(':id', id)
      : `api/projects/${id}`)
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
  try { new URL(u); return u; } catch { return new URL(u, window.location.origin).toString(); }
}

/* ============= Stato ============= */
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
let booted = false;

/* ============= Init ============= */
export async function initProjects() {
  if (booted) return; // evita doppia init
  booted = true;

  debugLog?.('info', '🔄 init Projects');
  try {
    setupDOM();
    setupEvents();
    await loadProjects();
  } catch (e) {
    console.error(e);
    showError('Errore durante il caricamento dei progetti');
  }
}

/* ============= DOM ============= */
function setupDOM() {
  el = {
    refresh:   document.getElementById('projects-refresh'),
    search:    document.getElementById('projects-search'),
    filter:    document.getElementById('projects-filter'),
    grid:      document.getElementById('project-list'),
    err:       document.getElementById('project-error'),
    empty:     document.getElementById('project-empty'),
  };
  showSkeleton();
}

/* ============= Events ============= */
function setupEvents() {
  if (el.refresh) el.refresh.addEventListener('click', () => loadProjects(true));

  if (el.search) {
    el.search.addEventListener('input', debounce((e) => {
      projectState.search = (e.target.value || '').toLowerCase().trim();
      filterAndRender();
      projectState.filtered = sortArray(projectState.filtered, projectState.sortBy);
      render();
    }, 300));
  }

  if (el.filter) {
    el.filter.addEventListener('change', (e) => {
      projectState.filter = e.target.value || 'all';
      filterAndRender();
      projectState.filtered = sortArray(projectState.filtered, projectState.sortBy);
      render();
    });
  }

  if (el.grid) {
    el.grid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.project-details-btn');
      if (btn) {
        const id = btn.getAttribute('data-project-id');
        const local = projectState.projects.find(p => p.id === id);
        let fresh = null;
        try { fresh = await fetchProjectById(id); } catch {}
        showDetails(fresh || local);
        return;
      }
      const retry = e.target.closest('[data-action="retry-projects"]');
      if (retry) loadProjects(true);
    });
  }

  window.addEventListener('storage', (evt) => {
    if (evt.key === 'projectsFlushCache' && evt.newValue === '1') {
      projectState.cache = null; projectState.cacheTs = null;
      try { sessionStorage.removeItem('projectsFlushCache'); } catch {}
      loadProjects(true);
    }
  });
}

/* ============= API ============= */
async function fetchProjectById(id) {
  const url = apiUrl(EP.DETAILS(id));
  const r = await fetch(url, { headers: { 'Accept':'application/json' } });
  const t = await r.text(); let j = {};
  try { j = t ? JSON.parse(t) : {}; } catch { throw new Error('Risposta non-JSON'); }
  if (!r.ok) throw new Error(j?.message || `${r.status} ${r.statusText}`);
  const p = j?.data?.project || j?.item || j?.project || j;
  return normalize(p);
}

/* ============= Load & Cache ============= */
export async function loadProjects(force = false) {
  if (projectState.loading) return;
  projectState.loading = true;

  if (lastCtl) lastCtl.abort();
  lastCtl = new AbortController();

  try {
    if (!force && isCacheValid()) {
      projectState.projects = projectState.cache;
      filterAndRender();
      projectState.filtered = sortArray(projectState.filtered, projectState.sortBy);
      render();
      return;
    }

    showSkeleton();

    const params = new URLSearchParams({
      status: 'published',
      sort: '-createdAt',
      limit: String(MAX_LIMIT) // <= 100 fisso
    });
    const url = `${apiUrl(EP.LIST)}?${params.toString()}`;
    const r = await fetch(url, { headers: { 'Accept':'application/json' }, signal: lastCtl.signal });
    const t = await r.text(); let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch { throw new Error('Risposta non-JSON'); }
    if (!r.ok) throw new Error(j?.message || `${r.status} ${r.statusText}`);

    let arr = [];
    if (Array.isArray(j)) arr = j;
    else if (Array.isArray(j?.data?.projects)) arr = j.data.projects;
    else if (Array.isArray(j?.projects)) arr = j.projects;
    else if (Array.isArray(j?.items)) arr = j.items;
    else if (Array.isArray(j?.data)) arr = j.data;

    projectState.projects = (arr || []).map(normalize);
    projectState.cache = [...projectState.projects];
    projectState.cacheTs = Date.now();

    filterAndRender();
    projectState.filtered = sortArray(projectState.filtered, projectState.sortBy);
    render();
  } catch (e) {
    if (e?.name === 'AbortError') return;
    console.error(e);
    showError(/Network|Failed to fetch|abort/i.test(e.message)
      ? 'Errore di connessione. Controlla la tua rete.'
      : (e.message || 'Errore durante il caricamento dei progetti'));
  } finally {
    projectState.loading = false;
  }
}

function isCacheValid() {
  return projectState.cache && projectState.cacheTs && (Date.now() - projectState.cacheTs) < projectState.CACHE_MS;
}

/* ============= Normalizzazione ============= */
function normalize(p) {
  const id = p.id || p._id || String(Math.random().toString(36).slice(2));
  const github = safeUrl(p.github || p.repository || null);
  const demo   = safeUrl(p.demo || p.liveDemo || p.url || null);
  const image  = absolutizeIfLocal(p.image || p.thumbnail || null);

  return {
    id: String(id),
    title: p.title || p.name || 'Senza titolo',
    description: p.description || '',
    technologies: Array.isArray(p.technologies) ? p.technologies : [],
    github, demo,
    image,
    category: p.category || 'web',
    featured: !!p.featured,
    createdAt: p.createdAt || p.date || new Date().toISOString(),
    updatedAt: p.updatedAt || p.updated || new Date().toISOString(),
  };
}

/* ============= Filtri / Ordina / Render ============= */
function filterAndRender() {
  const q = projectState.search;
  const f = projectState.filter;

  let filtered = [...projectState.projects];

  if (q) {
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.technologies.some(t => String(t).toLowerCase().includes(q))
    );
  }

  if (f !== 'all') {
    filtered = filtered.filter(p => p.category === f);
  }

  projectState.filtered = filtered;
}

function sortArray(arr, sortBy){
  const a = [...arr];
  switch (sortBy) {
    case 'newest':  a.sort((x,y) => new Date(y.createdAt) - new Date(x.createdAt)); break;
    case 'oldest':  a.sort((x,y) => new Date(x.createdAt) - new Date(y.createdAt)); break;
    case 'title':   a.sort((x,y) => x.title.localeCompare(y.title)); break;
    case 'featured':a.sort((x,y) => (y.featured === x.featured) ? 0 : (y.featured ? 1 : -1)); break;
  }
  return a;
}

/* ============= Render (CSP/XSS safe) ============= */
function render() {
  if (!el.grid) return;

  if (!projectState.filtered.length) {
    el.grid.innerHTML = `
      <div class="col-12 text-center py-5">
        <div class="text-muted">
          <i class="bi bi-inbox display-1"></i>
          <h4 class="mt-3">Nessun progetto trovato</h4>
          <p>Prova a modificare i filtri o la ricerca.</p>
        </div>
      </div>`;
    if (el.empty) el.empty.classList.remove('d-none');
    return;
  }
  if (el.empty) el.empty.classList.add('d-none');

  el.grid.innerHTML = projectState.filtered.map(p => {
    const title = escapeHTML(p.title);
    const desc  = escapeHTML(truncate(p.description, 120));
    const techs = (p.technologies||[]).slice(0,5).map(escapeHTML);
    const more  = Math.max((p.technologies||[]).length - 5, 0);

    const img = p.image ? `
      <div class="ratio ratio-16x9 bg-light">
        <img src="${p.image}" class="card-img-top object-fit-cover" alt="${title}" loading="lazy">
      </div>` : `
      <div class="ratio ratio-16x9 bg-light d-flex align-items-center justify-content-center">
        <i class="bi bi-image text-muted fs-1"></i>
      </div>`;

    const ghBtn   = p.github ? `<a href="${p.github}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-dark"><i class="bi bi-github me-1"></i>Code</a>` : '';
    const demoBtn = p.demo   ? `<a href="${p.demo}"   target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary"><i class="bi bi-play-circle me-1"></i>Demo</a>` : '';

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
            ${(techs.length) ? `
              <div class="mb-2 d-flex flex-wrap gap-1">
                ${techs.map(t => `<span class="badge bg-light text-dark border">${t}</span>`).join('')}
                ${more>0 ? `<span class="badge bg-secondary">+${more}</span>` : ''}
              </div>` : ''
            }
            <div class="text-muted small mb-2"><i class="bi bi-calendar me-1"></i>${formatDate(p.createdAt)}</div>
            <div class="mt-auto d-flex gap-2">
              ${ghBtn} ${demoBtn}
              <button class="btn btn-sm btn-outline-secondary project-details-btn" data-project-id="${p.id}" aria-label="Dettagli"><i class="bi bi-info-circle"></i></button>
            </div>
          </div>
        </article>
      </div>`;
  }).join('');

  // Fallback immagine
  el.grid.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => {
      const ratio = img.closest('.ratio');
      if (!ratio) return;
      ratio.innerHTML = `
        <div class="w-100 h-100 bg-light d-flex align-items-center justify-content-center">
          <i class="bi bi-image text-muted fs-1"></i>
        </div>`;
    }, { once: true });
  });
}

function showDetails(p) {
  if (!p) { showNotification('Progetto non trovato', 'error'); return; }
  const title = escapeHTML(p.title);
  const desc  = escapeHTML(p.description);
  const techs = (p.technologies||[]).map(escapeHTML);

  const html = `
    <div class="modal fade" id="projectDetailsModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg"><div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">${title}</h5>
          <button class="btn-close" data-bs-dismiss="modal" aria-label="Chiudi"></button>
        </div>
        <div class="modal-body">
          ${p.image ? `<img src="${p.image}" alt="${title}" class="img-fluid rounded mb-3">` : ''}
          <p class="lead">${desc}</p>
          ${techs.length ? `<div class="mb-2"><h6>Tecnologie</h6><div class="d-flex flex-wrap gap-1">${techs.map(t=>`<span class="badge bg-primary">${t}</span>`).join('')}</div></div>`:''}
          <small class="text-muted"><i class="bi bi-calendar me-1"></i>${formatDate(p.createdAt)}</small>
        </div>
        <div class="modal-footer">
          ${p.github ? `<a href="${p.github}" target="_blank" rel="noopener" class="btn btn-outline-dark"><i class="bi bi-github me-1"></i>Code</a>`:''}
          ${p.demo ? `<a href="${p.demo}" target="_blank" rel="noopener" class="btn btn-primary"><i class="bi bi-play-circle me-1"></i>Demo</a>`:''}
          <button class="btn btn-secondary" data-bs-dismiss="modal">Chiudi</button>
        </div>
      </div></div>
    </div>`;
  document.getElementById('projectDetailsModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  if (window.bootstrap?.Modal) new bootstrap.Modal(document.getElementById('projectDetailsModal')).show();
}

function showSkeleton() {
  if (!el.grid) return;
  el.grid.innerHTML = Array.from({length: 6}).map(() => `
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
  showNotification(message, 'error');
  if (el.grid) {
    el.grid.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-exclamation-triangle display-1 text-danger"></i>
        <h4 class="mt-3 text-danger">Errore</h4>
        <p class="text-muted">${escapeHTML(message)}</p>
        <button class="btn btn-primary" data-action="retry-projects"><i class="bi bi-arrow-clockwise me-1"></i>Riprova</button>
      </div>`;
  }
}

/* ============= Export utili ============= */
export async function refreshProjects(){ await loadProjects(true); showNotification('Progetti aggiornati', 'success'); }
export function getProjects(){ return [...projectState.projects]; }
export function getProjectById(id){ return projectState.projects.find(p => p.id === id); }

/* ============= Auto init ============= */
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('project-list')) initProjects();
});
