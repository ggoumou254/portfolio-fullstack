// frontend/js/project.js
import { API_BASE } from './config.js';

let inFlight = false;

export async function initProjects() {
  if (inFlight) return;
  inFlight = true;

  const box = document.getElementById("project-list");
  if (!box) { inFlight = false; return; }
  box.innerHTML = `<p>Caricamento…</p>`;

  try {
    const url = `${API_BASE}/api/projects`;
    console.log('[projects] fetching', url);
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(()=>'');
      console.error('[projects] response not ok', res.status, txt);
      box.innerHTML = `<div class="text-danger">Errore ${res.status} nel caricamento dei progetti.</div>`;
      return;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      box.innerHTML = `<div class="text-muted">Nessun progetto disponibile.</div>`;
      return;
    }

    box.innerHTML = data.map((p) => `
      <article class="card mb-3">
        <div class="card-body">
          <h5 class="card-title">${p.title ?? p.name ?? "Senza nome"}</h5>
          <p class="card-text">${p.description ?? ""}</p>
          ${Array.isArray(p.technologies) && p.technologies.length ? `<div class="small text-muted">Tech: ${p.technologies.join(", ")}</div>` : ""}
          <div class="mt-2 d-flex gap-2">
            ${p.github ? `<a class="btn btn-sm btn-outline-dark" href="${p.github}" target="_blank" rel="noopener">GitHub</a>` : ""}
            ${p.demo || p.liveDemo ? `<a class="btn btn-sm btn-primary" href="${p.demo || p.liveDemo}" target="_blank" rel="noopener">Demo</a>` : ""}
          </div>
        </div>
      </article>`).join("");
  } catch (e) {
    console.error('[projects] error', e);
    box.innerHTML = `<div class="text-danger">Errore nel caricamento dei progetti.</div>`;
  } finally {
    inFlight = false;
  }
}

// helper usabile da admin.js dopo POST
export async function refreshProjects() { if (!inFlight) await initProjects(); }

// carica automaticamente al DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('button[onclick*="initProjects"]');
  if (btn) btn.addEventListener('click', () => initProjects());
  initProjects();
});
