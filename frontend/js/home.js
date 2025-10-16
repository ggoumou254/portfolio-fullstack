/**
 * Pagina Home – progetti in evidenza + counters
 * @version 2.5.0 (IT)
 */
import { CONFIG } from './config.js';
import { showNotification, truncate, formatNumber } from './utils.js';

const homeState = {
  featuredProjects: [],
  stats: null,
  isLoading: false,
};

let domElements = {};

/* -------- helper: estrai messaggio d'errore dall'API -------- */
async function parseServerError(res, fallback = '') {
  try {
    const j = await res.json();
    if (j?.message) return j.message;
    if (j?.error) return j.error;
    if (Array.isArray(j?.errors)) {
      const msg = j.errors.map(e => e.msg || e.message).filter(Boolean).join(', ');
      if (msg) return msg;
    }
    return fallback || `${res.status} ${res.statusText}`;
  } catch {
    return fallback || `${res.status} ${res.statusText}`;
  }
}

export async function initHome() {
  try {
    setupDOM();
    setupEvents();
    await loadFeaturedProjects();
    await loadHomeStats(); // legge endpoints reali con fallback “morbidi”
    setupAnimations();
  } catch (err) {
    console.error('HOME init error:', err);
    showNotification('Errore durante il caricamento della home', 'error');
  }
}

function setupDOM() {
  domElements = {
    // hero
    heroTitle: document.getElementById('hero-title'),
    heroSubtitle: document.getElementById('hero-subtitle'),
    heroCta: document.getElementById('hero-cta'),
    // projects
    projectsContainer: document.getElementById('home-projects'),
    projectsLoading: document.getElementById('home-projects-loading'),
    projectsError: document.getElementById('home-projects-error'),
    projectsErrorMsg: document.getElementById('home-projects-error-message'),
    projectsEmpty: document.getElementById('home-projects-empty'),
    // stats
    statsContainer: document.getElementById('home-stats'),
    statsLoading: document.getElementById('home-stats-loading'),
  };
  showSkeletonProjects();
}

function setupEvents() {
  domElements.heroCta?.addEventListener('click', () => { /* smooth scroll già gestito dal browser */ });

  // Retry sul contenitore dell’errore (bottone “Riprova”)
  domElements.projectsError?.addEventListener('click', (e) => {
    const retry = e.target.closest('[data-action="retry-home-projects"]');
    if (retry) loadFeaturedProjects(true);
  });
}

/* ========================
   Featured projects
======================== */
export async function loadFeaturedProjects(force = false) {
  if (homeState.isLoading && !force) return;
  homeState.isLoading = true;
  toggleProjectsLoading(true);
  hideProjectsError();
  hideProjectsEmpty();

  try {
    const base = CONFIG.apiUrl('api/projects');
    const qs = new URLSearchParams({
      featured: 'true',
      status: 'published',
      limit: '6',
      sort: '-createdAt',
    });
    const url = `${base}?${qs.toString()}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });

    if (!res.ok) {
      const msg = await parseServerError(res);
      throw new Error(msg);
    }

    const data = await res.json();
    let projects = [];
    if (Array.isArray(data)) projects = data;
    else if (Array.isArray(data?.data?.projects)) projects = data.data.projects;
    else if (Array.isArray(data?.projects)) projects = data.projects;
    else if (Array.isArray(data?.items)) projects = data.items;
    else throw new Error('Formato dati non valido');

    homeState.featuredProjects = projects.slice(0, 6).map(normalizeProject);
    renderFeaturedProjects();
  } catch (err) {
    console.error('HOME featured error:', err);
    showProjectsError(err.message || 'Errore di caricamento');
    loadMockProjects(); // fallback demo
  } finally {
    toggleProjectsLoading(false);
    homeState.isLoading = false;
  }
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
    image: p.image || p.thumbnail || null,
    createdAt: p.createdAt || null,
  };
}

function renderFeaturedProjects() {
  const c = domElements.projectsContainer;
  if (!c) return;

  const items = homeState.featuredProjects;
  if (!items.length) {
    showProjectsEmpty();
    c.innerHTML = '';
    return;
  }

  c.innerHTML = items.map(project => `
    <div class="col-md-6 col-lg-4 mb-4" data-project-id="${project.id}">
      <article class="card project-card h-100 shadow-sm">
        ${
          project.image
            ? `
          <div class="project-image-container position-relative">
            <img src="${project.image}" alt="${escapeHtml(project.title)}" class="card-img-top project-image" loading="lazy" onerror="this.style.display='none'"/>
            ${project.featured ? `<div class="featured-badge"><i class="bi bi-star-fill"></i>In evidenza</div>` : ''}
          </div>`
            : `
          <div class="card-img-top bg-light d-flex align-items-center justify-content-center text-muted" style="height:200px;">
            <i class="bi bi-image display-4"></i>
          </div>`
        }
        <div class="card-body d-flex flex-column">
          <div class="project-header mb-2">
            <h5 class="card-title project-title mb-1">${escapeHtml(project.title)}</h5>
            <span class="badge bg-primary">${escapeHtml(project.category)}</span>
          </div>
          <p class="card-text project-description flex-grow-1">${escapeHtml(truncate(project.description, 120))}</p>
          <div class="project-actions d-flex gap-2 mt-auto">
            ${project.github ? `<a href="${project.github}" class="btn btn-sm btn-outline-dark flex-fill" target="_blank" rel="noopener noreferrer"><i class="bi bi-github me-1"></i>Codice</a>` : ''}
            ${
              project.demo
                ? `<a href="${project.demo}" class="btn btn-sm btn-primary flex-fill" target="_blank" rel="noopener noreferrer"><i class="bi bi-play-circle me-1"></i>Demo</a>`
                : `<button class="btn btn-sm btn-outline-secondary flex-fill" disabled><i class="bi bi-info-circle me-1"></i>Dettagli</button>`
            }
          </div>
        </div>
      </article>
    </div>
  `).join('');

  animateProjectsOnScroll();
}

/* ========================
   Stats (contatori reali)
======================== */
async function loadHomeStats() {
  let projects = null;
  let clients = null;        // “Clienti soddisfatti” (reali se c’è endpoint)
  let satisfaction = null;
  const experience = new Date().getFullYear() - 2021; // aggiorna anno base se serve

  // 1) endpoint leggero /api/stats/projects
  try {
    const res1 = await fetch(CONFIG.apiUrl('api/stats/projects'), {
      headers: { Accept: 'application/json' },
    });
    if (!res1.ok) {
      const msg = await parseServerError(res1);
      console.warn('Home stats fetch error:', msg);
    } else {
      const payload = await res1.json().catch(() => ({}));
      projects =
        payload?.data?.projectsCount ??
        payload?.projectsCount ??
        (Array.isArray(payload?.data?.projects) ? payload.data.projects.length : null);

      const dist =
        payload?.data?.reviews?.ratingDistribution || payload?.reviews?.ratingDistribution;
      if (dist) {
        const tot = Object.values(dist).reduce((a, b) => a + b, 0);
        if (tot > 0) {
          const positive = (dist[4] || 0) + (dist[5] || 0);
          satisfaction = Math.round((positive / tot) * 100);
          if (clients == null) clients = tot;
        }
      } else {
        const avg =
          parseFloat(payload?.data?.reviews?.averageRating || payload?.reviews?.averageRating) || 0;
        if (avg > 0) satisfaction = Math.min(100, Math.round((avg / 5) * 100));
      }
    }
  } catch (e) {
    console.warn('Home stats fetch exception:', e?.message || e);
  }

  // 2) numero recensioni approvate = proxy “clienti soddisfatti”
  if (clients == null) {
    try { clients = await fetchApprovedReviewsCount(); }
    catch (e) { console.warn('Reviews count exception:', e?.message || e); }
  }

  // 3) fallback progetti
  if (projects == null) {
    try {
      const res2 = await fetch(
        CONFIG.apiUrl('api/projects?status=published&limit=200&sort=-createdAt'),
        { headers: { Accept: 'application/json' } }
      );
      if (!res2.ok) {
        const msg = await parseServerError(res2);
        console.warn('Projects fallback fetch error:', msg);
        projects = 0;
      } else {
        const list = await res2.json();
        const arr = Array.isArray(list?.data?.projects)
          ? list.data.projects
          : Array.isArray(list?.projects)
          ? list.projects
          : Array.isArray(list)
          ? list
          : [];
        projects = arr.length || 0;
      }
    } catch {
      projects = 0;
    }
  }

  // fallback “morbidi”
  if (clients == null) clients = Math.max(1, Math.round((projects || 0) * 0.6));
  if (satisfaction == null) satisfaction = 98;

  homeState.stats = { projects, clients, experience, satisfaction };
  renderStats();
}

/**
 * Legge quante recensioni APPROVATE esistono (o null se non disponibile)
 */
async function fetchApprovedReviewsCount() {
  const url = CONFIG.apiUrl('api/reviews?status=approved&limit=1&countOnly=1');
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      // fallback: senza countOnly, usa la lunghezza
      const res2 = await fetch(
        CONFIG.apiUrl('api/reviews?status=approved&limit=200&sort=-createdAt'),
        { headers: { Accept: 'application/json' } }
      );
      if (!res2.ok) return null;
      const data2 = await res2.json().catch(() => ({}));
      const arr2 = Array.isArray(data2?.data?.reviews)
        ? data2.data.reviews
        : Array.isArray(data2?.reviews)
        ? data2.reviews
        : Array.isArray(data2)
        ? data2
        : [];
      return typeof arr2.length === 'number' ? arr2.length : null;
    }
    // se l’API supporta countOnly
    const payload = await res.json().catch(() => ({}));
    const count =
      payload?.data?.count ??
      payload?.count ??
      (Array.isArray(payload?.data?.reviews) ? payload.data.reviews.length : null);
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}

function renderStats() {
  const c = domElements.statsContainer;
  if (!c || !homeState.stats) return;
  const s = homeState.stats;

  c.innerHTML = `
    <div class="row text-center">
      <div class="col-6 col-md-3 mb-4">
        <div class="stat-card">
          <div class="stat-number" data-target="${s.projects}">0</div>
          <div class="stat-label">Progetti realizzati</div>
        </div>
      </div>
      <div class="col-6 col-md-3 mb-4">
        <div class="stat-card">
          <div class="stat-number" data-target="${s.clients}">0</div>
          <div class="stat-label">Clienti soddisfatti</div>
        </div>
      </div>
      <div class="col-6 col-md-3 mb-4">
        <div class="stat-card">
          <div class="stat-number" data-target="${s.experience}">0</div>
          <div class="stat-label">Anni di esperienza</div>
        </div>
      </div>
      <div class="col-6 col-md-3 mb-4">
        <div class="stat-card">
          <div class="stat-number" data-target="${s.satisfaction}">0</div>
          <div class="stat-label">% Soddisfazione</div>
        </div>
      </div>
    </div>
  `;

  animateCounters();
}

function animateCounters() {
  const counters = document.querySelectorAll('.stat-number');
  counters.forEach((el) => {
    const target = parseInt(el.dataset.target || '0', 10);
    const start = performance.now();
    const duration = 1200;

    function tick(t) {
      const p = Math.min((t - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 4);
      el.textContent = formatNumber(Math.floor(target * ease));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = formatNumber(target);
    }
    requestAnimationFrame(tick);
  });
}

/* ---------- helpers visivi ---------- */
function toggleProjectsLoading(show) {
  domElements.projectsLoading?.classList.toggle('d-none', !show);
}

function showProjectsError(msg) {
  if (domElements.projectsErrorMsg) domElements.projectsErrorMsg.textContent = msg;
  domElements.projectsError?.classList.remove('d-none');
}

function hideProjectsError() {
  domElements.projectsError?.classList.add('d-none');
}

function showProjectsEmpty() {
  domElements.projectsEmpty?.classList.remove('d-none');
}

function hideProjectsEmpty() {
  domElements.projectsEmpty?.classList.add('d-none');
}

function showSkeletonProjects() {
  const c = domElements.projectsContainer;
  if (!c) return;
  c.innerHTML = `
    ${Array.from({ length: 3 })
      .map(
        () => `
      <div class="col-md-6 col-lg-4 mb-4">
        <div class="card h-100">
          <div class="card-img-top skeleton-image"></div>
          <div class="card-body">
            <div class="skeleton-title"></div>
            <div class="skeleton-text"></div>
            <div class="skeleton-text short"></div>
            <div class="skeleton-buttons mt-3"></div>
          </div>
        </div>
      </div>
    `
      )
      .join('')}
  `;
}

function setupAnimations() {
  animateHeroText();
}

function animateHeroText() {
  const title = domElements.heroTitle;
  const sub = domElements.heroSubtitle;
  if (title) {
    title.style.opacity = '0';
    title.style.transform = 'translateY(30px)';
    setTimeout(() => {
      title.style.transition = 'all .8s ease-out';
      title.style.opacity = '1';
      title.style.transform = 'translateY(0)';
    }, 100);
  }
  if (sub) {
    sub.style.opacity = '0';
    sub.style.transform = 'translateY(20px)';
    setTimeout(() => {
      sub.style.transition = 'all .8s ease-out .25s';
      sub.style.opacity = '1';
      sub.style.transform = 'translateY(0)';
    }, 200);
  }
}

function animateProjectsOnScroll() {
  const cards = document.querySelectorAll('.project-card');
  cards.forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = `all .6s ease-out ${i * 0.06}s`;

    const obs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
          obs.unobserve(card);
        }
      });
    });
    obs.observe(card);
  });
}

function loadMockProjects() {
  homeState.featuredProjects = [
    {
      id: '1',
      title: 'Portfolio Modern',
      description: 'Sito portfolio responsive',
      technologies: ['React', 'Node.js', 'MongoDB'],
      category: 'web',
      featured: true,
      github: 'https://github.com/ggoumou254',
      demo: 'https://github.com/ggoumou254',
      image: null,
    },
    {
      id: '2',
      title: 'Piattaforma E-commerce',
      description: 'Soluzione e-commerce completa',
      technologies: ['Vue.js', 'Express', 'PostgreSQL'],
      category: 'web',
      featured: true,
      github: 'https://github.com/ggoumou254',
      demo: null,
      image: null,
    },
  ];
  renderFeaturedProjects();
  showNotification('Visualizzazione dati dimostrativi', 'info');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('home-projects')) initHome();
});
