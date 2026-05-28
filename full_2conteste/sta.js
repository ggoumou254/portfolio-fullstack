// frontend/js/stats.js
/**
 * Tableau de bord stats (auth-aware, CSP-safe Chart.js)
 * @version 2.1.0
 */

import { CONFIG } from './config.js';
import { showNotification, formatNumber, debugLog, debounce } from './utils.js';

const MOCK_DATA = { /* ... identico a prima ... */ 
  projectsCount: 12,
  contactsCount: 47,
  subscribersCount: 234,
  reviewsCount: 18,
  pageViews: 1250,
  uniqueVisitors: 892,
  conversionRate: 3.8,
  techUsage: {
    React: 9, 'Node.js': 8, Express: 7, MongoDB: 6, PostgreSQL: 4,
    Bootstrap: 5, 'Tailwind CSS': 3, 'Vue.js': 2, Python: 3, Docker: 4
  },
  monthlyGrowth: {
    projects: [5,7,8,10,9,12],
    contacts: [15,22,28,35,41,47],
    subscribers: [89,112,145,178,205,234]
  },
  trafficSources: { Direct: 45, 'Social Media': 25, 'Search Engines': 20, Referrals: 10 },
  performanceMetrics: { pageLoadTime: 1.2, apiResponseTime: 0.3, uptime: 99.8 }
};

function shouldUseMockStats() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mock') === '1') return true;
  if (urlParams.get('mock') === '0') return false;
  return CONFIG.IS_DEV;
}

// --- STATE
const statsState = {
  isLoading: false,
  lastUpdate: null,
  autoRefresh: true,
  refreshIntervalMs: 5 * 60 * 1000,
  refreshTimerId: null,
  charts: {},
  data: null,
  cache: null,
  cacheDuration: 2 * 60 * 1000
};

// DOM
let domElements = {};

// --- INIT
export async function initStats() {
  debugLog('info', '📊 Init stats');
  try {
    await setupDOM();
    await loadChartJS();
    setupEventListeners();
    await loadStats();
    setupAutoRefresh();
  } catch (error) {
    console.error('Erreur init stats:', error);
    showNotification('Erreur lors du chargement des statistiques', 'error');
  }
}

async function setupDOM() {
  const container = document.getElementById('stats-container');
  if (!container) {
    debugLog('warn', 'Conteneur statistiques non trouvé');
    return;
  }

  domElements = {
    container,
    loading: document.getElementById('stats-loading'),
    error: document.getElementById('stats-error'),
    lastUpdate: document.getElementById('stats-last-update'),
    refreshBtn: document.getElementById('stats-refresh'),
    autoRefreshToggle: document.getElementById('stats-auto-refresh'),
    projectsCount: document.getElementById('total-projects'),
    contactsCount: document.getElementById('total-contacts'),
    subscribersCount: document.getElementById('total-subscribers'),
    reviewsCount: document.getElementById('total-reviews'),
    pageViews: document.getElementById('total-page-views'),
    uniqueVisitors: document.getElementById('total-unique-visitors'),
    techChart: document.getElementById('techChart'),
    growthChart: document.getElementById('growthChart'),
    trafficChart: document.getElementById('trafficChart'),
    performanceChart: document.getElementById('performanceChart'),
    dateRange: document.getElementById('stats-date-range'),
    chartType: document.getElementById('stats-chart-type')
  };

  showSkeletonLoading();
}

// CSP-safe loader (locale → vendor → CDN)
async function loadChartJS() {
  if (window.Chart) return;
  const tryLoad = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error(`load fail: ${src}`));
      document.head.appendChild(s);
    });

  const sources = [
    '/js/vendor/chart.umd.min.js',          // copia locale (se l’hai messa in repo)
    '/vendor/chartjs/chart.umd.min.js',     // static mount da node_modules
    '/vendor/chartjs/chart.umd.js',
    'https://cdn.jsdelivr.net/npm/chart.js/dist/chart.umd.min.js'
  ];

  let lastErr = null;
  for (const src of sources) {
    try {
      await tryLoad(src);
      if (window.Chart) {
        debugLog('success', `Chart.js chargé depuis ${src}`);
        return;
      }
    } catch (e) {
      lastErr = e;
      debugLog('warn', e.message);
    }
  }
  throw new Error(lastErr?.message || 'Impossible de charger Chart.js');
}

function setupEventListeners() {
  const { refreshBtn, autoRefreshToggle, dateRange, chartType } = domElements;

  if (refreshBtn) refreshBtn.addEventListener('click', () => loadStats(true));

  if (autoRefreshToggle) {
    autoRefreshToggle.addEventListener('change', (e) => {
      statsState.autoRefresh = e.target.checked;
      localStorage.setItem('stats_auto_refresh', e.target.checked ? 'true' : 'false');
      if (statsState.autoRefresh) setupAutoRefresh();
      else clearAutoRefresh();
    });
    const saved = localStorage.getItem('stats_auto_refresh');
    if (saved !== null) {
      statsState.autoRefresh = saved === 'true';
      autoRefreshToggle.checked = statsState.autoRefresh;
    }
  }

  if (dateRange) {
    dateRange.addEventListener('change', debounce(() => loadStats(true), 300));
  }

  if (chartType) {
    chartType.addEventListener('change', () => updateChartTypes());
  }

  window.addEventListener('resize', debounce(() => {
    Object.values(statsState.charts).forEach((chart) => chart?.resize?.());
  }, 250));
}

// --- LOAD
export async function loadStats(forceRefresh = false) {
  if (statsState.isLoading) return;
  statsState.isLoading = true;
  showLoadingState();

  try {
    if (!forceRefresh && isCacheValid()) {
      debugLog('info', 'cache stats');
      statsState.data = statsState.cache;
      renderStats();
      return;
    }

    const data = await fetchStats();
    statsState.data = data;
    statsState.cache = { ...data };
    statsState.lastUpdate = Date.now();

    renderStats();
    debugLog('success', 'stats OK');
  } catch (error) {
    handleStatsError(error);
  } finally {
    statsState.isLoading = false;
    hideLoadingState();
  }
}

// Normalizza la risposta di /api/stats/overview
function normalizeStatsResponse(raw) {
  if (raw?.isMock || raw?.projectsCount !== undefined) return raw;

  const root = raw?.data?.overview ? raw.data : raw?.overview ? raw : null;
  if (root) {
    const ov = root.overview ?? root;
    const totals = ov.totals || {};
    const techArray =
      raw?.data?.technologies?.byCount ||
      raw?.technologies?.byCount ||
      [];

    return {
      projectsCount: totals.projects ?? 0,
      contactsCount: totals.contacts ?? 0,
      subscribersCount: totals.subscribers ?? 0,
      reviewsCount: totals.reviews ?? 0,
      pageViews: 0,
      uniqueVisitors: 0,
      techUsage: techArray.reduce((acc, t) => {
        acc[(t?.tech ?? 'TECH').toString()] = t?.count ?? 0;
        return acc;
      }, {}),
      monthlyGrowth: {
        projects: Array.isArray(ov?.growth?.projects) ? ov.growth.projects : [],
        contacts: Array.isArray(ov?.growth?.contacts) ? ov.growth.contacts : [],
        subscribers: Array.isArray(ov?.growth?.subscribers) ? ov.growth.subscribers : [],
      },
      trafficSources: {},
      performanceMetrics: {},
    };
  }
  throw new Error('Format de données invalide (stats)');
}

function getAuthToken() {
  // Adatta ai tuoi storage/naming
  return (
    localStorage.getItem('token') ||
    localStorage.getItem('auth_token') ||
    sessionStorage.getItem('token') ||
    sessionStorage.getItem('auth_token') ||
    null
  );
}

async function fetchStats() {
  if (shouldUseMockStats()) {
    await simulateNetworkDelay();
    return { ...MOCK_DATA, isMock: true };
  }

  const baseUrl = CONFIG.apiUrl('api/stats/overview');
  const params = new URLSearchParams();
  const selectedPeriod = domElements?.dateRange?.value || 'all';
  if (selectedPeriod) params.set('period', selectedPeriod);

  const url = params.toString() ? `${baseUrl}?${params}` : baseUrl;
  debugLog('info', `GET ${url}`);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);

  try {
    const token = getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include', // gestisce anche session cookie se usi cookie-based auth
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const raw = await response.json();
    return normalizeStatsResponse(raw);
  } finally {
    clearTimeout(t);
  }
}

// --- RENDER
function renderStats() {
  const { data } = statsState;
  if (!data) return;

  updateCounters(data);
  createCharts(data);
  updateLastUpdateTime();

  if (data.isMock) showMockWarning();
  hideSkeletonLoading();
}

function updateCounters(data) {
  const counters = [
    { element: domElements.projectsCount, value: data.projectsCount || 0 },
    { element: domElements.contactsCount, value: data.contactsCount || 0 },
    { element: domElements.subscribersCount, value: data.subscribersCount || 0 },
    { element: domElements.reviewsCount, value: data.reviewsCount || 0 },
    { element: domElements.pageViews, value: data.pageViews || 0 },
    { element: domElements.uniqueVisitors, value: data.uniqueVisitors || 0 }
  ];
  counters.forEach(({ element, value }) => element && animateCounter(element, value));
}

function animateCounter(element, targetValue) {
  const duration = 1500;
  const startNumeric = parseInt(String(element.textContent).replace(/\D/g, ''), 10);
  const startValue = Number.isFinite(startNumeric) ? startNumeric : 0;
  const startTime = performance.now();

  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOutQuart = 1 - Math.pow(1 - progress, 4);
    const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOutQuart);
    element.textContent = formatNumber(currentValue);
    if (progress < 1) requestAnimationFrame(updateCounter);
    else element.textContent = formatNumber(targetValue);
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        requestAnimationFrame(updateCounter);
        io.unobserve(e.target);
      }
    });
  });
  io.observe(element);
}

function createCharts(data) {
  createTechChart(data.techUsage);
  createGrowthChart(data.monthlyGrowth);
  createTrafficChart(data.trafficSources);
  createPerformanceChart(data.performanceMetrics);
}

function createTechChart(techUsage = {}) {
  const { techChart } = domElements;
  if (!techChart) return;
  statsState.charts.tech?.destroy?.();

  const labels = Object.keys(techUsage);
  const values = Object.values(techUsage);
  const ctx = techChart.getContext('2d');

  statsState.charts.tech = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        label: 'Utilisation des technologies',
        data: values,
        backgroundColor: [
          '#0d6efd', '#198754', '#ffc107', '#dc3545', '#20c997',
          '#6f42c1', '#6610f2', '#fd7e14', '#e83e8c', '#6c757d'
        ],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { padding: 15, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      },
      animation: { animateScale: true, animateRotate: true }
    }
  });
}

function createGrowthChart(monthlyGrowth = {}) {
  const { growthChart } = domElements;
  if (!growthChart) return;
  statsState.charts.growth?.destroy?.();

  const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const currentMonth = new Date().getMonth();
  const displayMonths = months.slice(Math.max(0, currentMonth - 5), currentMonth + 1);
  const n = displayMonths.length;
  const takeLast = (arr) => (Array.isArray(arr) ? arr.slice(-n) : Array(n).fill(0));
  const ctx = growthChart.getContext('2d');

  statsState.charts.growth = new Chart(ctx, {
    type: 'line',
    data: {
      labels: displayMonths,
      datasets: [
        { label: 'Projets',    data: takeLast(monthlyGrowth.projects),    borderColor: '#0d6efd', backgroundColor: 'rgba(13,110,253,0.1)', tension: 0.4, fill: true },
        { label: 'Contacts',   data: takeLast(monthlyGrowth.contacts),    borderColor: '#198754', backgroundColor: 'rgba(25,135,84,0.1)',   tension: 0.4, fill: true },
        { label: 'Abonnés',    data: takeLast(monthlyGrowth.subscribers), borderColor: '#ffc107', backgroundColor: 'rgba(255,193,7,0.1)',   tension: 0.4, fill: true }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.1)' } },
        x: { grid: { color: 'rgba(0,0,0,0.1)' } }
      }
    }
  });
}

function createTrafficChart(trafficSources = {}) {
  const { trafficChart } = domElements;
  if (!trafficChart) return;
  statsState.charts.traffic?.destroy?.();

  const labels = Object.keys(trafficSources);
  const values = Object.values(trafficSources);
  const ctx = trafficChart.getContext('2d');

  statsState.charts.traffic = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: ['#0d6efd','#198754','#ffc107','#dc3545'], borderWidth: 2, borderColor: '#fff' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

function createPerformanceChart(perf = {}) {
  const { performanceChart } = domElements;
  if (!performanceChart) return;
  statsState.charts.performance?.destroy?.();

  const ctx = performanceChart.getContext('2d');
  statsState.charts.performance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Temps chargement', 'Réponse API', 'Disponibilité'],
      datasets: [{
        label: 'Performances',
        data: [ perf.pageLoadTime || 0, perf.apiResponseTime || 0, perf.uptime || 0 ],
        backgroundColor: ['rgba(13,110,253,0.8)', 'rgba(25,135,84,0.8)', 'rgba(255,193,7,0.8)'],
        borderColor: ['#0d6efd', '#198754', '#ffc107'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Secondes / Pourcentage' } } },
      plugins: { tooltip: { callbacks: { label: (ctx) => (ctx.dataIndex === 2 ? `Performances: ${ctx.parsed.y}%` : `Performances: ${ctx.parsed.y}s`) } } }
    }
  });
}

function updateChartTypes() {
  const { chartType } = domElements;
  if (!chartType) return;
  const type = chartType.value;
  if (statsState.charts.tech) {
    statsState.charts.tech.config.type = type || 'doughnut';
    statsState.charts.tech.update();
  }
  if (statsState.charts.traffic && (type === 'pie' || type === 'doughnut')) {
    statsState.charts.traffic.config.type = type;
    statsState.charts.traffic.update();
  }
}

function updateLastUpdateTime() {
  const { lastUpdate } = domElements;
  if (!lastUpdate) return;
  const ts = statsState.lastUpdate ? new Date(statsState.lastUpdate) : new Date();
  lastUpdate.textContent = `Dernière mise à jour: ${ts.toLocaleTimeString('fr-FR')}`;
}

// --- AUTO REFRESH
function setupAutoRefresh() {
  if (!statsState.autoRefresh) return;
  clearAutoRefresh();
  statsState.refreshTimerId = setInterval(() => {
    if (document.visibilityState === 'visible') loadStats(true);
  }, statsState.refreshIntervalMs);
  debugLog('info', 'Auto-rafraîchissement activé');
}

function clearAutoRefresh() {
  if (statsState.refreshTimerId) {
    clearInterval(statsState.refreshTimerId);
    statsState.refreshTimerId = null;
  }
}

// --- HELPERS UI
function isCacheValid() {
  return statsState.cache && statsState.lastUpdate && (Date.now() - statsState.lastUpdate < statsState.cacheDuration);
}
function simulateNetworkDelay() { return new Promise((r) => setTimeout(r, 800 + Math.random() * 700)); }
function showLoadingState() { domElements.loading?.classList.remove('d-none'); domElements.refreshBtn && (domElements.refreshBtn.disabled = true); }
function hideLoadingState() { domElements.loading?.classList.add('d-none'); domElements.refreshBtn && (domElements.refreshBtn.disabled = false); }
function showSkeletonLoading() { domElements.container?.classList.add('skeleton-loading'); }
function hideSkeletonLoading() { domElements.container?.classList.remove('skeleton-loading'); }
function showMockWarning() {
  const el = domElements.error; if (!el) return;
  el.innerHTML = `
    <div class="alert alert-warning alert-dismissible fade show">
      <i class="bi bi-info-circle me-2"></i>
      Données de démonstration affichées. Connectez-vous comme admin pour voir les vraies stats.
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>`;
}
function handleStatsError(error) {
  console.error('Erreur chargement statistiques:', error);
  const el = domElements.error;
  let msg = 'Erreur lors du chargement des statistiques';
  const s = String(error.message);
  if (s.includes('Network') || s.includes('Failed to fetch')) msg = 'Erreur de connexion.';
  else if (s.includes('401') || s.includes('403')) msg = 'Accès non autorisé aux statistiques.';
  if (el) {
    el.innerHTML = `
      <div class="alert alert-danger alert-dismissible fade show">
        <i class="bi bi-exclamation-triangle me-2"></i>${msg}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>`;
  }
  if (!statsState.data) {
    statsState.data = { ...MOCK_DATA, isMock: true };
    renderStats();
    showMockWarning();
  }
}

// --- PUBLIC
export async function refreshStats() {
  await loadStats(true);
  showNotification('Statistiques rafraîchies', 'success');
}
export function getStatsData() { return statsState.data ? { ...statsState.data } : null; }

// Cleanup
window.addEventListener('beforeunload', () => {
  clearAutoRefresh();
  Object.values(statsState.charts).forEach((c) => c?.destroy?.());
});

// Auto init
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('stats-container')) initStats();
});

// Test exports
export const _testExports = { statsState, shouldUseMockStats };
