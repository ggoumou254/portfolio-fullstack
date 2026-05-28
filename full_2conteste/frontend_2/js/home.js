// frontend/js/home.js
import { API_BASE } from './config.js';
import { initProjects } from './project.js';

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('home-projects');
  if (!container) return;

  container.innerHTML = '<p>Caricamento progetti…</p>';

  try {
    const res = await fetch(`${API_BASE}/api/projects`);
    if (!res.ok) throw new Error(`Errore ${res.status}`);

    const projects = await res.json();
    if (!Array.isArray(projects) || projects.length === 0) {
      container.innerHTML = '<p class="text-muted">Nessun progetto disponibile.</p>';
      return;
    }

    container.innerHTML = projects.map(p => `
      <div class="card mb-3">
        <div class="card-body">
          <h5 class="card-title">${p.title ?? p.name ?? 'Senza nome'}</h5>
          <p class="card-text">${p.description ?? ''}</p>
          ${Array.isArray(p.technologies) && p.technologies.length ? `<div class="small text-muted">Tech: ${p.technologies.join(', ')}</div>` : ''}
          <div class="mt-2 d-flex gap-2">
            ${p.github ? `<a href="${p.github}" class="btn btn-sm btn-outline-dark" target="_blank">GitHub</a>` : ''}
            ${p.demo ? `<a href="${p.demo}" class="btn btn-sm btn-primary" target="_blank">Demo</a>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('[home.js] errore:', err);
    container.innerHTML = `<p class="text-danger">Errore nel caricamento dei progetti: ${err.message}</p>`;
  }

  // inizializza anche admin refresh se presente
  if (window.refreshProjects) window.refreshProjects();
});
