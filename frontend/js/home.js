/**
 * Pagina Home
 * @version 2.6.0
 */
import { CONFIG } from './config.js';
import { showNotification, truncate, formatNumber } from './utils.js';

const API_BASE = () => CONFIG.get('API_BASE') || window.__API_BASE__ || 'http://localhost:5000';

const homeState = { featuredProjects: [], stats: null, isLoading: false };
let domElements = {};

async function parseServerError(res, fallback = '') {
  try {
    const j = await res.json();
    return j?.message || j?.error || fallback || `${res.status} ${res.statusText}`;
  } catch { return fallback || `${res.status} ${res.statusText}`; }
}

export async function initHome() {
  try {
    setupDOM();
    setupEvents();
    await loadFeaturedProjects();
    await loadHomeStats();
    setupAnimations();
  } catch (err) {
    console.error('HOME init error:', err);
    showNotification('Errore durante il caricamento della home', 'error');
  }
}

function setupDOM() {
  domElements = {
    heroTitle: document.getElementById('hero-title'),
    heroSubtitle: document.getElementById('hero-subtitle'),
    heroCta: document.getElementById('hero-cta'),
    projectsContainer: document.getElementById('home-projects'),
    projectsLoading: document.getElementById('home-projects-loading'),
    projectsError: document.getElementById('home-projects-error'),
    projectsErrorMsg: document.getElementById('home-projects-error-message'),
    projectsEmpty: document.getElementById('home-projects-empty'),
    statsContainer: document.getElementById('home-stats'),
  };
  showSkeletonProjects();
}

function setupEvents() {
  domElements.projectsError?.addEventListener('click', e => {
    if (e.target.closest('[data-action="retry-home-projects"]')) loadFeaturedProjects(true);
  });
}

export async function loadFeaturedProjects(force = false) {
  if (homeState.isLoading && !force) return;
  homeState.isLoading = true;
  toggleProjectsLoading(true);
  hideProjectsError();
  hideProjectsEmpty();

  try {
    const base = CONFIG.apiUrl('api/projects');
    const qs = new URLSearchParams({ featured: 'true', status: 'published', limit: '6', sort: '-createdAt' });
    const res = await fetch(`${base}?${qs}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(await parseServerError(res));

    const data = await res.json();
    let projects = [];
    if (Array.isArray(data)) projects = data;
    else if (Array.isArray(data?.items)) projects = data.items;
    else if (Array.isArray(data?.data?.projects)) projects = data.data.projects;
    else if (Array.isArray(data?.projects)) projects = data.projects;

    homeState.featuredProjects = projects.slice(0, 6).map(normalizeProject);
    renderFeaturedProjects();
  } catch (err) {
    console.error('HOME featured error:', err);
    showProjectsError(err.message || 'Errore di caricamento');
    loadMockProjects();
  } finally {
    toggleProjectsLoading(false);
    homeState.isLoading = false;
  }
}

function fixImageUrl(raw) {
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return API_BASE().replace(/\/+$/, '') + '/' + raw.replace(/^\/+/, '');
}

function normalizeProject(p) {
  return {
    id: String(p.id || p._id || Math.random().toString(36).slice(2)),
    title: p.title || p.name || 'Progetto senza titolo',
    description: p.description || '',
    technologies: Array.isArray(p.technologies) ? p.technologies : [],
    category: p.category || 'web',
    featured: !!p.featured,
    github: p.github || p.repository || null,
    demo: p.liveDemo || p.demo || p.url || null,
    image: fixImageUrl(p.image || p.thumbnail || null),
    createdAt: p.createdAt || null,
  };
}

function renderFeaturedProjects() {
  const c = domElements.projectsContainer;
  if (!c) return;

  const items = homeState.featuredProjects;
  if (!items.length) { showProjectsEmpty(); c.innerHTML = ''; return; }

  c.innerHTML = items.map(p => {
    const title = escapeHtml(p.title);
    const desc = escapeHtml(truncate(p.description, 120));
    const cat = escapeHtml(p.category);

    const img = p.image
      ? `<div class="project-image-container position-relative">
           <img src="${p.image}" alt="${title}" class="card-img-top project-image" loading="lazy"
                onerror="this.style.display='none'">
           ${p.featured ? '<div class="featured-badge"><i class="bi bi-star-fill"></i> In evidenza</div>' : ''}
         </div>`
      : `<div class="card-img-top bg-light d-flex align-items-center justify-content-center text-muted" style="height:200px">
           <i class="bi bi-image display-4"></i>
         </div>`;

    return `
      <div class="col-md-6 col-lg-4 mb-4">
        <article class="card project-card h-100 shadow-sm">
          ${img}
          <div class="card-body d-flex flex-column">
            <div class="mb-2">
              <h5 class="card-title mb-1">${title}</h5>
              <span class="badge bg-primary">${cat}</span>
            </div>
            <p class="card-text flex-grow-1 text-muted small">${desc}</p>
            <div class="d-flex gap-2 mt-auto">
              ${p.github ? `<a href="${p.github}" class="btn btn-sm btn-outline-dark flex-fill" target="_blank" rel="noopener"><i class="bi bi-github me-1"></i>Codice</a>` : ''}
              ${p.demo
        ? `<a href="${p.demo}" class="btn btn-sm btn-primary flex-fill" target="_blank" rel="noopener"><i class="bi bi-play-circle me-1"></i>Demo</a>`
        : `<button class="btn btn-sm btn-outline-secondary flex-fill" disabled><i class="bi bi-info-circle me-1"></i>Dettagli</button>`}
            </div>
          </div>
        </article>
      </div>`;
  }).join('');

  animateProjectsOnScroll();
}

async function loadHomeStats() {
  let projects = null, clients = null, satisfaction = null;
  const experience = new Date().getFullYear() - 2021;

  try {
    const res = await fetch(CONFIG.apiUrl('api/stats/projects'), { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const payload = await res.json().catch(() => ({}));
      projects = payload?.data?.projectsCount ?? payload?.projectsCount ?? null;
    }
  } catch (e) { console.warn('Home stats error:', e?.message); }

  try {
    const res = await fetch(CONFIG.apiUrl('api/reviews?status=approved&limit=1&countOnly=1'), { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const payload = await res.json().catch(() => ({}));
      clients = payload?.data?.count ?? payload?.count ?? null;
    }
  } catch { }

  if (projects == null) {
    try {
      const res = await fetch(CONFIG.apiUrl('api/projects?status=published&limit=100'), { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const list = await res.json();
        const arr = Array.isArray(list?.items) ? list.items
          : Array.isArray(list?.data?.projects) ? list.data.projects
            : Array.isArray(list?.projects) ? list.projects
              : Array.isArray(list) ? list : [];
        projects = arr.length;
      }
    } catch { projects = 0; }
  }

  if (clients == null) clients = Math.max(1, Math.round((projects || 0) * 0.6));
  if (satisfaction == null) satisfaction = 98;

  homeState.stats = { projects, clients, experience, satisfaction };
  renderStats();
}

function renderStats() {
  const c = domElements.statsContainer;
  if (!c || !homeState.stats) return;
  const s = homeState.stats;

  const nums = c.querySelectorAll('.stat-number[data-target]');
  if (nums.length) {
    const values = [s.projects, s.clients, s.experience, s.satisfaction];
    nums.forEach((el, i) => { if (values[i] != null) el.dataset.target = values[i]; });
    animateCounters();
    return;
  }

  c.innerHTML = `
    <div class="rg-stat"><span class="rg-stat__num stat-number" data-target="${s.projects}">0</span><span class="rg-stat__label">Progetti realizzati</span></div>
    <div class="rg-stat"><span class="rg-stat__num stat-number" data-target="${s.experience}">0</span><span class="rg-stat__label">Anni di esperienza</span></div>
    <div class="rg-stat"><span class="rg-stat__num stat-number" data-target="${s.satisfaction}">0</span><span class="rg-stat__label">% Soddisfazione</span></div>
  `;
  animateCounters();
}

function animateCounters() {
  document.querySelectorAll('.stat-number[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target || '0', 10);
    const start = performance.now();
    const dur = 1200;
    const tick = t => {
      const p = Math.min((t - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.floor(target * ease);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    };
    requestAnimationFrame(tick);
  });
}

function toggleProjectsLoading(show) { domElements.projectsLoading?.classList.toggle('d-none', !show); }
function showProjectsError(msg) {
  if (domElements.projectsErrorMsg) domElements.projectsErrorMsg.textContent = msg;
  domElements.projectsError?.classList.remove('d-none');
}
function hideProjectsError() { domElements.projectsError?.classList.add('d-none'); }
function showProjectsEmpty() { domElements.projectsEmpty?.classList.remove('d-none'); }
function hideProjectsEmpty() { domElements.projectsEmpty?.classList.add('d-none'); }

function showSkeletonProjects() {
  const c = domElements.projectsContainer;
  if (!c) return;
  c.innerHTML = Array.from({ length: 3 }).map(() => `
    <div class="col-md-6 col-lg-4 mb-4">
      <div class="card h-100">
        <div class="card-img-top skeleton-image" style="height:200px"></div>
        <div class="card-body">
          <div class="skeleton-title mb-2"></div>
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
        </div>
      </div>
    </div>`).join('');
}

function setupAnimations() { animateHeroText(); }

function animateHeroText() {
  [domElements.heroTitle, domElements.heroSubtitle].forEach((el, i) => {
    if (!el) return;
    el.style.cssText = 'opacity:0;transform:translateY(30px)';
    setTimeout(() => {
      el.style.cssText = `opacity:1;transform:translateY(0);transition:all .8s ease-out ${i * 0.15}s`;
    }, 100);
  });
}

function animateProjectsOnScroll() {
  document.querySelectorAll('.project-card').forEach((card, i) => {
    card.style.cssText = `opacity:0;transform:translateY(30px);transition:all .6s ease-out ${i * 0.06}s`;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { card.style.opacity = '1'; card.style.transform = 'translateY(0)'; obs.unobserve(card); }
      });
    });
    obs.observe(card);
  });
}

function loadMockProjects() {
  homeState.featuredProjects = [
    { id: '1', title: 'RoadCtrl', description: 'SaaS gestione infrastrutture stradali in Guinea.', technologies: ['React', 'Node.js', 'MongoDB'], category: 'web', featured: true, github: 'https://github.com/ggoumou254', demo: null, image: null },
    { id: '2', title: 'Portfolio Full Stack', description: 'Portfolio SPA con router, admin panel, AI dashboard.', technologies: ['Node.js', 'MongoDB', 'JavaScript'], category: 'web', featured: true, github: 'https://github.com/ggoumou254', demo: null, image: null },
    { id: '3', title: 'Deep Learning CNN', description: 'Modelli CNN con Python e TensorFlow.', technologies: ['Python', 'TensorFlow', 'Keras'], category: 'other', featured: true, github: 'https://github.com/ggoumou254', demo: null, image: null },
  ];
  renderFeaturedProjects();
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}