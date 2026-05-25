/**
 * Admin panel — gestione progetti
 * @version 3.1.0
 */
import { getToken, verifyToken, logout, isAuthenticated, hasRole } from './auth.js';
import { CONFIG } from './config.js';
import { showNotification, toggleLoading, formatDate, truncate } from './utils.js';

const state = {
  projects: [],
  selectedProject: null,
  isSubmitting: false,
  isLoading: false,
  filters: { search: '', status: 'all' }
};

/* -----------------------------------------------
   Modal helpers
----------------------------------------------- */
function openModal(id) {
  // Sposta il modal nel body se e dentro #app (evita problemi Bootstrap)
  const el = document.getElementById(id);
  if (!el) return;
  if (el.closest('#app')) {
    document.body.appendChild(el);
  }

  const bs = window.bootstrap;
  if (bs?.Modal) {
    bs.Modal.getOrCreateInstance(el).show();
  } else {
    el.style.display = 'flex';
    el.classList.add('show');
    el.removeAttribute('aria-hidden');
    document.body.classList.add('modal-open');
    let bd = document.getElementById('_modal_bd');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = '_modal_bd';
      bd.className = 'modal-backdrop fade show';
      document.body.appendChild(bd);
    }
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const bs = window.bootstrap;
  if (bs?.Modal) {
    const m = bs.Modal.getInstance(el);
    if (m) m.hide();
  } else {
    el.style.display = '';
    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    document.getElementById('_modal_bd')?.remove();
  }
}

/* -----------------------------------------------
   Init
----------------------------------------------- */
export async function initAdmin() {
  let token = getToken();
  if (!token) {
    const ok = await verifyToken();
    token = getToken();
    if (!ok || !token) {
      showNotification('Sessione scaduta. Accedi di nuovo.', 'warning');
      window.location.hash = 'login';
      return;
    }
  }

  if (!isAuthenticated() || !hasRole('admin')) {
    showNotification('Accesso riservato agli amministratori', 'error');
    window.location.hash = 'home';
    return;
  }

  // Sposta il modal nel body subito dopo l'iniezione del frammento
  moveModalToBody();
  setupEvents();
  await loadProjects();
}

function moveModalToBody() {
  const modal = document.getElementById('projectModal');
  if (modal && modal.closest('#app')) {
    document.body.appendChild(modal);
    // Reinizializza Bootstrap sul modal
    if (window.bootstrap?.Modal) {
      window.bootstrap.Modal.getOrCreateInstance(modal);
    }
  }
}

/* -----------------------------------------------
   Events
----------------------------------------------- */
function setupEvents() {
  document.getElementById('logout-btn')
    ?.addEventListener('click', () => {
      if (confirm('Disconnettersi?')) { logout(); window.location.hash = 'home'; }
    });

  document.querySelectorAll('[data-admin-tab]').forEach(tab => {
    tab.addEventListener('click', e => { e.preventDefault(); switchView(tab.dataset.adminTab); });
  });

  // Bottone nuovo progetto
  document.getElementById('btn-new-project')
    ?.addEventListener('click', () => openNewProjectModal());

  document.getElementById('project-form')
    ?.addEventListener('submit', handleSubmit);

  // Chiudi modal con btn-close o data-bs-dismiss
  document.getElementById('projectModal')
    ?.addEventListener('click', e => {
      if (e.target.classList.contains('btn-close') ||
        e.target.getAttribute('data-bs-dismiss') === 'modal') {
        closeModal('projectModal');
      }
    });

  document.getElementById('admin-search')
    ?.addEventListener('input', debounce(e => {
      state.filters.search = e.target.value.trim().toLowerCase();
      renderTable(applyFilters());
    }, 300));

  document.getElementById('admin-status-filter')
    ?.addEventListener('change', e => {
      state.filters.status = e.target.value;
      renderTable(applyFilters());
    });
}

/* -----------------------------------------------
   Carica progetti
----------------------------------------------- */
export async function loadProjects() {
  if (state.isLoading) return;
  state.isLoading = true;
  showLoading(true);

  try {
    const token = getToken();
    const res = await fetch(CONFIG.apiUrl('api/projects/admin/all'), {
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
      credentials: 'include'
    });

    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const arr = data?.data?.projects || data?.projects || [];

    state.projects = arr.map(p => ({
      id: String(p.id || p._id || ''),
      title: p.title || 'Senza titolo',
      description: p.description || '',
      technologies: Array.isArray(p.technologies) ? p.technologies : [],
      status: p.status || 'draft',
      featured: !!p.featured,
      category: p.category || 'web',
      createdAt: p.createdAt || null,
      image: p.image || '',
      github: p.github || '',
      demo: p.liveDemo || p.demo || ''
    }));

    renderTable(applyFilters());
    updateCount(state.projects.length);
    showError(null);

  } catch (err) {
    console.error('loadProjects:', err);
    showError(err.message);
  } finally {
    state.isLoading = false;
    showLoading(false);
  }
}

/* -----------------------------------------------
   Filtri + Tabella
----------------------------------------------- */
function applyFilters() {
  let list = [...state.projects];
  const { search, status } = state.filters;
  if (search) list = list.filter(p =>
    p.title.toLowerCase().includes(search) ||
    p.description.toLowerCase().includes(search) ||
    p.technologies.some(t => t.toLowerCase().includes(search))
  );
  if (status && status !== 'all') list = list.filter(p => p.status === status);
  return list;
}

function renderTable(projects) {
  const tbody = document.getElementById('admin-projects-body');
  if (!tbody) return;
  updateCount(projects.length);

  if (!projects.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">
      <i class="bi bi-inbox fs-1 d-block mb-2"></i>Nessun progetto trovato
    </td></tr>`;
    return;
  }

  tbody.innerHTML = projects.map(p => `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          ${p.image
      ? `<img src="${p.image}" width="40" height="40" class="rounded" loading="lazy">`
      : `<div class="bg-secondary rounded d-flex align-items-center justify-content-center" style="width:40px;height:40px"><i class="bi bi-image text-white"></i></div>`}
          <div>
            <strong>${escHtml(p.title)}</strong>
            ${p.featured ? `<span class="badge bg-warning text-dark ms-1">Featured</span>` : ''}
          </div>
        </div>
      </td>
      <td>
        <div class="small text-muted">${escHtml(truncate(p.description, 80))}</div>
        <div class="mt-1 d-flex flex-wrap gap-1">
          ${p.technologies.slice(0, 3).map(t => `<span class="badge bg-light text-dark border">${escHtml(t)}</span>`).join('')}
        </div>
      </td>
      <td>
        <span class="badge ${p.status === 'published' ? 'bg-success' : 'bg-secondary'}">
          ${p.status === 'published' ? 'Pubblicato' : 'Bozza'}
        </span>
      </td>
      <td class="small text-muted">${p.createdAt ? formatDate(p.createdAt) : '—'}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="window.__adminEdit('${p.id}')">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-outline-danger" onclick="window.__adminDelete('${p.id}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

/* -----------------------------------------------
   Nuovo progetto
----------------------------------------------- */
function openNewProjectModal() {
  state.selectedProject = null;
  resetForm();
  const title = document.querySelector('#projectModal .modal-title');
  if (title) title.textContent = 'Nuovo progetto';
  openModal('projectModal');
}

/* -----------------------------------------------
   Edit / Delete — globali per onclick
----------------------------------------------- */
window.__adminEdit = function (id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  state.selectedProject = p;

  const set = (sel, val) => { const el = document.getElementById(sel); if (el) el.value = val || ''; };
  set('project-title', p.title);
  set('project-description', p.description);
  set('project-technologies', p.technologies.join(', '));
  set('project-status', p.status);
  set('project-github', p.github);
  set('project-demo', p.demo);
  set('project-category', p.category);

  const feat = document.getElementById('project-featured');
  if (feat) feat.checked = !!p.featured;

  const title = document.querySelector('#projectModal .modal-title');
  if (title) title.textContent = 'Modifica progetto';

  showError(null, true);
  openModal('projectModal');
};

window.__adminDelete = async function (id) {
  const p = state.projects.find(x => x.id === id);
  if (!p || !confirm(`Eliminare "${p.title}"?`)) return;
  try {
    const token = getToken();
    const res = await fetch(CONFIG.apiUrl(`api/projects/${id}`), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      credentials: 'include'
    });
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showNotification('Progetto eliminato', 'success');
    await loadProjects();
  } catch (err) {
    showNotification('Errore durante l eliminazione', 'error');
  }
};

/* -----------------------------------------------
   Submit form
----------------------------------------------- */
async function handleSubmit(e) {
  e.preventDefault();
  if (state.isSubmitting) return;

  const title = document.getElementById('project-title')?.value.trim();
  const desc = document.getElementById('project-description')?.value.trim();

  if (!title) { showError('Il titolo e obbligatorio', true); return; }
  if (!desc) { showError('La descrizione e obbligatoria', true); return; }

  state.isSubmitting = true;
  const btn = document.getElementById('project-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio...'; }

  try {
    const token = getToken();
    const isEdit = !!state.selectedProject;

    const tech = (document.getElementById('project-technologies')?.value || '')
      .split(',').map(t => t.trim()).filter(Boolean);

    // Il backend usa multer — serve SEMPRE FormData (multipart/form-data)
    const fd = new FormData();
    fd.append('title', title);
    fd.append('description', desc);
    fd.append('github', document.getElementById('project-github')?.value.trim() || '');
    fd.append('liveDemo', document.getElementById('project-demo')?.value.trim() || '');
    fd.append('status', document.getElementById('project-status')?.value || 'published');
    fd.append('category', document.getElementById('project-category')?.value || 'web');
    fd.append('featured', document.getElementById('project-featured')?.checked ? 'true' : 'false');
    tech.forEach(t => fd.append('technologies', t));

    const imageFile = document.getElementById('project-image')?.files?.[0];
    if (imageFile) fd.append('image', imageFile);

    const endpoint = isEdit ? `api/projects/${state.selectedProject.id}` : 'api/projects';
    const res = await fetch(CONFIG.apiUrl(endpoint), {
      method: isEdit ? 'PUT' : 'POST',
      // NON impostare Content-Type — il browser lo imposta automaticamente con boundary per multipart
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      credentials: 'include',
      body: fd
    });

    if (res.status === 401) { handleUnauthorized(); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Errore HTTP ${res.status}`);

    closeModal('projectModal');
    showNotification(isEdit ? 'Progetto aggiornato!' : 'Progetto creato!', 'success');
    await loadProjects();

  } catch (err) {
    showError(err.message || 'Errore durante il salvataggio', true);
  } finally {
    state.isSubmitting = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check2 me-1"></i>Salva'; }
  }
}

/* -----------------------------------------------
   UI Helpers
----------------------------------------------- */
function showLoading(on) {
  document.getElementById('admin-projects-loading')?.classList.toggle('d-none', !on);
}

function showError(msg, isForm = false) {
  const id = isForm ? 'project-form-error' : 'admin-projects-error';
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) { el.textContent = msg; el.classList.remove('d-none'); }
  else el.classList.add('d-none');
}

function updateCount(n) {
  const el = document.getElementById('admin-projects-count');
  if (el) el.textContent = `${n} progetto${n !== 1 ? 'i' : ''}`;
}

function resetForm() {
  document.getElementById('project-form')?.reset();
  const status = document.getElementById('project-status');
  if (status) status.value = 'published';
  showError(null, true);
}

function switchView(view) {
  document.querySelectorAll('[data-admin-tab]').forEach(t =>
    t.classList.toggle('active', t.dataset.adminTab === view)
  );
  ['projects', 'stats'].forEach(v => {
    const el = document.getElementById(`admin-${v}-view`);
    if (el) el.classList.toggle('d-none', v !== view);
  });
}

function handleUnauthorized() {
  showNotification('Sessione scaduta. Accedi di nuovo.', 'warning');
  logout();
  window.location.hash = 'login';
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}