/**
 * /js/stats.js
 * Statistiche portfolio (frontend)
 * @version 3.3.0
 */

import { CONFIG } from './config.js';
import { showNotification, debugLog } from './utils.js';

let el = {};

function bindEls() {
  el = {
    err: document.getElementById('stats-error'),
    totalProjects: document.getElementById('total-projects'),
    totalContacts: document.getElementById('total-contacts'),
    totalSubscribers: document.getElementById('total-subscribers'),
    techList: document.getElementById('tech-list'),
  };
}

const showErr = (msg) => {
  if (!el.err) return;
  el.err.textContent = msg;
  el.err.classList.remove('d-none');
};
const hideErr = () => {
  if (!el.err) return;
  el.err.classList.add('d-none');
  el.err.textContent = '';
};

/* ---------- URL helper ---------- */
const apiUrl = (p) => {
  const clean = String(p || '').replace(/^\/+/, '');
  if (typeof CONFIG?.apiUrl === 'function') return CONFIG.apiUrl(clean);
  const base = CONFIG?.API_BASE || '';
  return `${String(base).replace(/\/+$/, '')}/${clean}`.replace(/\/{2,}/g, '/');
};

async function fetchJson(url, opts = {}, { timeoutMs = 10000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { 'Accept': 'application/json', ...(opts.headers || {}) },
      signal: ctl.signal,
      credentials: opts.credentials ?? 'include',
    });
    const raw = await res.text();
    let json = {};
    if (raw) {
      try { json = JSON.parse(raw); }
      catch { throw new Error(`${res.status} ${res.statusText} risposta non JSON`); }
    }
    if (!res.ok) {
      const msg = json?.message || json?.error || `${res.status} ${res.statusText}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

function readNumber(obj, keys) {
  for (const k of keys) {
    const parts = k.split('.');
    let cur = obj; let ok = true;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object' || !(p in cur)) { ok = false; break; }
      cur = cur[p];
    }
    if (ok && Number.isFinite(Number(cur))) return Number(cur);
  }
  return null;
}

function normalizeTopTech(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.entries(raw).map(([label, count]) => ({
      label: String(label), count: Number(count),
    })).filter(x => x.label && Number.isFinite(x.count));
  }
  if (Array.isArray(raw)) {
    return raw.map(it => {
      const label = it.label || it.tech || it.name || it._id || it.id;
      const count = it.count ?? it.value ?? it.total ?? it.n;
      return { label: String(label || ''), count: Number(count) };
    }).filter(x => x.label && Number.isFinite(x.count));
  }
  return null;
}

function ensureTechStyles() {
  if (document.getElementById('tech-styles')) return;
  const style = document.createElement('style');
  style.id = 'tech-styles';
  style.textContent = `
    .tech-list-container{background:#f8f9fa;border:1px solid #e9ecef;border-radius:12px;padding:1.25rem;min-height:160px}
    .tech-list-wrapper{max-height:420px;overflow-y:auto}
    .tech-item{padding:.6rem 0;border-bottom:1px solid #e9ecef}
    .tech-item:last-child{border-bottom:none}
    .tech-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.35rem}
    .tech-label{font-weight:600;color:#212529}
    .tech-badges{display:flex;gap:.4rem;align-items:center}
    .tech-badge{display:inline-block;padding:.15rem .5rem;border-radius:999px;font-size:.78rem;font-weight:600}
    .tech-badge-count{background:#eef2ff;color:#1f2a44}
    .tech-badge-pct{background:#e7f1ff;color:#0d47a1}
    .tech-bar-outer{width:100%;height:8px;background:#e9ecef;border-radius:5px;overflow:hidden}
    .tech-bar-inner{width:0;height:100%;background:linear-gradient(90deg,#0d6efd,#4f46e5);transition:width .45s ease}
  `;
  document.head.appendChild(style);
}

function renderTechList(items) {
  ensureTechStyles();
  ensureTechContainer();
  if (!items?.length) {
    el.techList.innerHTML = '<p class="text-muted m-0">Nessuna tecnologia disponibile</p>';
    return;
  }

  const max = Math.max(...items.map(i => i.count || 0)) || 1;

  el.techList.innerHTML = `
    <div class="tech-list-container">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="h6 m-0">Tecnologie piu utilizzate</h4>
        <span class="small text-muted">Top ${items.length}</span>
      </div>
      <div class="tech-list-wrapper">
        ${items.map(it => `
          <div class="tech-item">
            <div class="tech-head">
              <span class="tech-label">${escapeHtml(it.label)}</span>
              <span class="tech-badges">
                ${Number.isFinite(it.pct) ? `<span class="tech-badge tech-badge-pct">${it.pct}%</span>` : ''}
                <span class="tech-badge tech-badge-count">${it.count}</span>
              </span>
            </div>
            <div class="tech-bar-outer">
              <div class="tech-bar-inner" data-pct="${Math.max(6, Math.round((it.count / max) * 100))}"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;

  requestAnimationFrame(() => {
    el.techList.querySelectorAll('.tech-bar-inner').forEach(bar => {
      bar.style.width = (bar.getAttribute('data-pct') || '0') + '%';
    });
  });
}

function ensureTechContainer() {
  if (el.techList) return;
  const c = document.createElement('div');
  c.id = 'tech-list';
  document.body.appendChild(c);
  el.techList = c;
}

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderOverviewNumbers(data) {
  if (!data) return;
  const totalProjects = readNumber(data, ['overview.totals.projects', 'projects.total', 'totalProjects', 'projects']);
  const totalContacts = readNumber(data, ['overview.totals.contacts', 'contacts.total', 'totalContacts', 'contacts']);
  const totalSubscribers = readNumber(data, ['overview.totals.subscribers', 'subscribers.total', 'totalSubscribers', 'subscribers']);
  if (el.totalProjects && totalProjects !== null) el.totalProjects.textContent = String(totalProjects);
  if (el.totalContacts && totalContacts !== null) el.totalContacts.textContent = String(totalContacts);
  if (el.totalSubscribers && totalSubscribers !== null) el.totalSubscribers.textContent = String(totalSubscribers);
}

function renderTopTechFromOverview(data) {
  const raw = data?.technologies?.byCount || data?.technologies || data?.stats?.topTechnologies;
  let items = normalizeTopTech(raw);
  if (!items?.length) return false;
  items.sort((a, b) => (b.count - a.count) || String(a.label).localeCompare(String(b.label)));
  const total = readNumber(data, ['overview.totals.projects']) || items.reduce((s, i) => s + (i.count || 0), 0);
  items = items.map(it => ({ ...it, pct: total ? Math.round((it.count / total) * 100) : 0 }));
  renderTechList(items);
  return true;
}

async function loadOverviewPrivate() {
  const ep = CONFIG?.ENDPOINTS?.STATS?.OVERVIEW || 'api/stats/overview';
  const data = await fetchJson(apiUrl(ep));
  renderOverviewNumbers(data?.data || data);
  const ok = renderTopTechFromOverview(data?.data || data);
  return { ok };
}

async function loadPublicStatsProjects() {
  const data = await fetchJson(apiUrl('api/stats/projects'));
  if (el.totalProjects && data?.totals != null) el.totalProjects.textContent = String(data.totals);
  if (el.totalContacts && data?.contacts != null) el.totalContacts.textContent = String(data.contacts);
  if (el.totalSubscribers && data?.subscribers != null) el.totalSubscribers.textContent = String(data.subscribers);
  let items = normalizeTopTech(data?.byTech);
  if (!items?.length) return { ok: false };
  items.sort((a, b) => (b.count - a.count) || String(a.label).localeCompare(String(b.label)));
  const total = Number.isFinite(Number(data?.totals)) ? Number(data.totals) : items.reduce((s, i) => s + (i.count || 0), 0);
  items = items.map(it => ({ ...it, pct: total ? Math.round((it.count / total) * 100) : 0 }));
  renderTechList(items);
  return { ok: true };
}

async function buildTechFromProjects() {
  const raw = await fetchJson(apiUrl('api/projects?status=published&limit=100&sort=-createdAt'));
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (Array.isArray(raw?.data?.projects)) arr = raw.data.projects;
  else if (Array.isArray(raw?.projects)) arr = raw.projects;
  else if (Array.isArray(raw?.data)) arr = raw.data;

  if (el.totalProjects && (!el.totalProjects.textContent || el.totalProjects.textContent === '0')) {
    el.totalProjects.textContent = String(arr.length);
  }

  const counts = new Map();
  for (const p of arr) {
    const techs = Array.isArray(p?.technologies) ? p.technologies : [];
    techs.forEach(t => {
      const k = String(t || '').trim();
      if (!k) return;
      counts.set(k, (counts.get(k) || 0) + 1);
    });
  }

  let items = Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
  items.sort((a, b) => (b.count - a.count) || String(a.label).localeCompare(String(b.label)));
  items = items.slice(0, 10).map(it => ({ ...it, pct: arr.length ? Math.round((it.count / arr.length) * 100) : 0 }));
  renderTechList(items);
  return { ok: items.length > 0 };
}

async function loadAll() {
  hideErr();
  try {
    const res1 = await loadOverviewPrivate();
    if (res1.ok) return;
  } catch (e1) {
    debugLog?.('info', 'Overview privata non disponibile:', e1?.status, e1?.message);
  }
  try {
    const res2 = await loadPublicStatsProjects();
    if (res2.ok) return;
  } catch (e2) {
    debugLog?.('info', 'Stats pubbliche non disponibili:', e2?.status, e2?.message);
  }
  try {
    await buildTechFromProjects();
  } catch (e3) {
    debugLog?.('error', 'Fallback tech fallito:', e3?.message);
    showErr('Impossibile caricare le statistiche. Riprova piu tardi.');
  }
}

/* -----------------------------------------------
   Export principale — chiamato dal router
----------------------------------------------- */
export async function initStats() {
  try {
    bindEls();
    if (!el.totalProjects && !el.totalContacts && !el.totalSubscribers && !el.techList) {
      console.warn('[stats] container non trovato');
      return;
    }
    ensureTechStyles();
    await loadAll();
  } catch (e) {
    console.error('[stats] start error:', e);
    showErr('Errore durante il caricamento delle statistiche.');
  }
}

export default initStats;