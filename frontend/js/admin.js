/**
 * Panel d'administration – gestion projets
 * @version 2.4.0
 * - usa /api/projects/admin/all
 * - invio form con FormData (multipart) per includere l'immagine
 * - 401 handling centralizzato (logout + redirect)
 */

import { getToken, verifyToken, logout, isAuthenticated, hasRole } from './auth.js';
import { CONFIG } from './config.js';
import { showNotification, toggleLoading, formatDate, truncate } from './utils.js';

const adminState = {
  isInitialized: false,
  currentView: 'projects',
  projects: [],
  selectedProject: null,
  isSubmitting: false,
  isLoadingProjects: false,
  filters: {}
};

let domElements = {};
const showEl = el => el && el.classList.remove('d-none');
const hideEl = el => el && el.classList.add('d-none');

/* ========================
   Init
======================== */
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
    showNotification('Accès réservé aux administrateurs', 'error');
    window.location.hash = 'home';
    return;
  }

  try {
    setupDOM();
    setupEventListeners();
    await loadAdminProjects(true);
    adminState.isInitialized = true;
  } catch (err) {
    console.error('❌ ADMIN init:', err);
    showNotification('Erreur lors du chargement du panel admin', 'error');
  }
}

function setupDOM() {
  domElements = {
    navTabs: document.querySelectorAll('[data-admin-tab]'),
    logoutBtn: document.getElementById('logout-btn'),

    projectsView: document.getElementById('admin-projects-view'),
    statsView: document.getElementById('admin-stats-view'),

    projectsBody: document.getElementById('admin-projects-body'),
    projectsLoading: document.getElementById('admin-projects-loading'),
    projectsError: document.getElementById('admin-projects-error'),
    projectsCount: document.getElementById('admin-projects-count'),

    projectForm: document.getElementById('project-form'),
    projectModal: document.getElementById('projectModal'),
    projectSubmitBtn: document.getElementById('project-submit-btn'),
    projectFormError: document.getElementById('project-form-error'),

    searchInput: document.getElementById('admin-search'),
    statusFilter: document.getElementById('admin-status-filter'),

    adminWelcome: document.getElementById('admin-welcome')
  };

  if (domElements.adminWelcome) {
    domElements.adminWelcome.textContent = 'Bienvenue dans le panel d\'administration';
  }
}

function setupEventListeners() {
  const { logoutBtn, navTabs, projectForm, searchInput, statusFilter } = domElements;

  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  navTabs.forEach(tab => tab.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(tab.dataset.adminTab);
  }));

  const newBtn = document.querySelector('[data-bs-target="#projectModal"]');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      adminState.selectedProject = null;
      resetProjectForm();
      const titleEl = document.querySelector('#projectModal .modal-title');
      if (titleEl) titleEl.textContent = 'Nouveau projet';
    });
  }

  if (projectForm) projectForm.addEventListener('submit', handleProjectSubmit);

  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      adminState.filters.search = searchInput.value.trim();
      filterAndRenderProjects();
    }, 300));
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      adminState.filters.status = statusFilter.value;
      filterAndRenderProjects();
    });
  }
}

/* ========================
   Load projects (admin)
======================== */
export async function loadAdminProjects(showLoading = true) {
  if (adminState.isLoadingProjects) return;
  adminState.isLoadingProjects = true;
  if (showLoading) showProjectsLoading();

  try {
    const token = getToken();
    const url = CONFIG.apiUrl(CONFIG.ENDPOINTS.PROJECTS.ADMIN_ALL);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include'
    });

    if (res.status === 401) {
      showProjectsError('Session expirée. Veuillez vous reconnecter.');
      logout();
      window.location.hash = 'login';
      return;
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${res.statusText}${t ? ' - ' + t : ''}`);
    }

    const payload = await res.json();
    const arr = payload?.data?.projects || payload?.projects || [];

    adminState.projects = arr.map(p => ({
      id: p.id || p._id,
      title: p.title || 'Sans titre',
      description: p.description || '',
      technologies: Array.isArray(p.technologies) ? p.technologies : [],
      status: p.status || 'draft',
      featured: !!p.featured,
      createdAt: p.createdAt,
      image: p.image || '',
      github: p.github || '',
      demo: p.liveDemo || p.demo || ''
    }));

    renderProjectsTable(adminState.projects);
    updateProjectsCount(adminState.projects.length);
    hideProjectsError();
  } catch (error) {
    console.error('❌ ADMIN load:', error);
    showProjectsError(error.message || 'Erreur lors du chargement des projets');
  } finally {
    if (showLoading) hideProjectsLoading();
    adminState.isLoadingProjects = false;
  }
}

/* ========================
   Form handlers
======================== */
async function handleProjectSubmit(e) {
  e.preventDefault();
  if (adminState.isSubmitting) {
    showNotification('Soumission déjà en cours...', 'warning');
    return;
  }
  if (!validateProjectForm()) return;
  await submitProjectForm();
}

function validateProjectForm() {
  const title = document.getElementById('project-title')?.value.trim();
  const description = document.getElementById('project-description')?.value.trim();
  if (!title) return showFormError('Le titre du projet est requis'), false;
  if (!description) return showFormError('La description du projet est requise'), false;
  hideFormError();
  return true;
}

async function submitProjectForm() {
  const { projectSubmitBtn, projectModal, projectForm } = domElements;

  adminState.isSubmitting = true;
  toggleLoading(projectSubmitBtn, true, 'Enregistrement...');

  try {
    const token = getToken();
    const isEdit = !!adminState.selectedProject;

    // costruisci FormData dal form (incluso <input type="file" name="image">)
    const fd = new FormData(projectForm);

    // normalizza stringhe
    fd.set('title', document.getElementById('project-title').value.trim());
    fd.set('description', document.getElementById('project-description').value.trim());
    fd.set('github', document.getElementById('project-github').value.trim());
    fd.set('liveDemo', document.getElementById('project-demo').value.trim());
    fd.set('status', document.getElementById('project-status').value || 'published');
    fd.set('featured', document.getElementById('project-featured').checked ? 'true' : 'false');

    // technologies normalizzate
    const tech = document.getElementById('project-technologies').value
      .split(',').map(t => t.trim()).filter(Boolean).join(', ');
    fd.set('technologies', tech);

    const endpoint = isEdit
      ? CONFIG.ENDPOINTS.PROJECTS.UPDATE.replace(':id', adminState.selectedProject.id)
      : CONFIG.ENDPOINTS.PROJECTS.CREATE;

    const url = CONFIG.apiUrl(endpoint);
    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
        // IMPORTANTISSIMO: niente 'Content-Type' -> lo imposta il browser per FormData
      },
      credentials: 'include',
      body: fd
    });

    if (res.status === 401) {
      showFormError('Session expirée. Veuillez vous reconnecter.');
      logout();
      window.location.hash = 'login';
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `Erreur HTTP ${res.status}`);
    }

    const modal = bootstrap.Modal.getInstance(projectModal);
    if (modal) modal.hide();
    showNotification(isEdit ? 'Projet modifié avec succès' : 'Projet créé avec succès', 'success');
    await loadAdminProjects(true);
  } catch (err) {
    console.error('❌ ADMIN save:', err);
    showFormError(err.message || 'Erreur lors de l\'enregistrement du projet');
  } finally {
    adminState.isSubmitting = false;
    toggleLoading(projectSubmitBtn, false, 'Enregistrer');
  }
}

/* ========================
   Table rendering
======================== */
function filterAndRenderProjects() {
  const { projects, filters = {} } = adminState;
  let filtered = [...projects];

  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  }
  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter(p => p.status === filters.status);
  }

  renderProjectsTable(filtered);
  updateProjectsCount(filtered.length);
}

function renderProjectsTable(projects) {
  const { projectsBody } = domElements;
  if (!projectsBody) return;

  if (!projects.length) {
    projectsBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4">
          <div class="text-muted">
            <i class="bi bi-inbox display-4"></i>
            <p class="mt-2">Aucun projet trouvé</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  projectsBody.innerHTML = projects.map(p => `
    <tr data-project-id="${p.id}">
      <td>
        <div class="d-flex align-items-center">
          ${p.image ? `
            <img src="${p.image}" alt="${p.title}" class="rounded me-2" width="40" height="40" loading="lazy">`
          : `
            <div class="bg-light rounded d-flex align-items-center justify-content-center me-2" style="width: 40px; height: 40px;">
              <i class="bi bi-image text-muted"></i>
            </div>`}
          <div>
            <strong>${p.title}</strong>
            ${p.featured ? `<span class="badge bg-warning text-dark ms-1">Featured</span>` : ''}
          </div>
        </div>
      </td>
      <td>
        <div class="small">${truncate(p.description, 80)}</div>
        ${p.technologies.length ? `
          <div class="mt-1">
            ${p.technologies.slice(0, 3).map(t =>
              `<span class="badge bg-light text-dark border me-1">${t}</span>`
            ).join('')}
          </div>` : ''}
      </td>
      <td>
        <span class="badge ${p.status === 'published' ? 'bg-success' : 'bg-secondary'}">
          ${p.status === 'published' ? 'Publié' : 'Brouillon'}
        </span>
      </td>
      <td class="small text-muted">${p.createdAt ? formatDate(p.createdAt) : '—'}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary edit-project" data-project-id="${p.id}">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-outline-danger delete-project" data-project-id="${p.id}">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.edit-project').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.projectId;
      const p = adminState.projects.find(x => x.id === id);
      if (p) editProject(p);
    });
  });

  document.querySelectorAll('.delete-project').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.projectId;
      const p = adminState.projects.find(x => x.id === id);
      if (p) await deleteProject(p);
    });
  });
}

function editProject(project) {
  adminState.selectedProject = project;
  document.getElementById('project-title').value = project.title || '';
  document.getElementById('project-description').value = project.description || '';
  document.getElementById('project-technologies').value = project.technologies.join(', ');
  document.getElementById('project-status').value = project.status || 'published';
  document.getElementById('project-featured').checked = !!project.featured;
  document.getElementById('project-github').value = project.github || '';
  document.getElementById('project-demo').value = project.demo || '';

  const modalTitle = document.querySelector('#projectModal .modal-title');
  if (modalTitle) modalTitle.textContent = 'Modifier le projet';

  const modal = new bootstrap.Modal(domElements.projectModal);
  modal.show();
}

async function deleteProject(project) {
  if (!confirm(`Êtes-vous sûr de vouloir supprimer "${project.title}" ?`)) return;
  try {
    const token = getToken();
    const url = CONFIG.apiUrl(CONFIG.ENDPOINTS.PROJECTS.DELETE.replace(':id', project.id));
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      credentials: 'include'
    });

    if (res.status === 401) {
      showNotification('Session expirée. Veuillez vous reconnecter.', 'warning');
      logout();
      window.location.hash = 'login';
      return;
    }
    if (!res.ok) throw new Error('Erreur lors de la suppression');

    showNotification('Projet supprimé avec succès', 'success');
    await loadAdminProjects(true);
  } catch (err) {
    console.error('❌ ADMIN delete:', err);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

/* ========================
   UI helpers
======================== */
function showProjectsLoading() {
  showEl(domElements.projectsLoading);
  if (domElements.projectsBody) domElements.projectsBody.innerHTML = '';
}
function hideProjectsLoading() { hideEl(domElements.projectsLoading); }

function showProjectsError(message) {
  if (domElements.projectsError) { domElements.projectsError.textContent = message; showEl(domElements.projectsError); }
}
function hideProjectsError() { hideEl(domElements.projectsError); }

function showFormError(message) {
  if (domElements.projectFormError) { domElements.projectFormError.textContent = message; showEl(domElements.projectFormError); }
}
function hideFormError() { hideEl(domElements.projectFormError); }

function updateProjectsCount(count) {
  if (domElements.projectsCount) domElements.projectsCount.textContent = `${count} projet${count !== 1 ? 's' : ''}`;
}

function resetProjectForm() {
  const form = domElements.projectForm;
  if (form) form.reset();
  const statusSelect = document.getElementById('project-status');
  if (statusSelect) statusSelect.value = 'published';
  hideFormError();
}

function handleLogout() {
  if (confirm('Déconnexion ?')) {
    logout();
    window.location.hash = 'home';
  }
}

function switchView(view) {
  adminState.currentView = view;
  domElements.navTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.adminTab === view);
  });
  ['projects','stats'].forEach(v => {
    const el = domElements[`${v}View`];
    if (!el) return;
    v === view ? showEl(el) : hideEl(el);
  });
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/* Auto init */
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('admin-projects-view')) initAdmin();
});
