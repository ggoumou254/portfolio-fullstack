// frontend/js/admin.js
import { getToken, logout } from "./auth.js";
import { API_BASE } from './config.js';

const $ = (s) => document.querySelector(s);

function showError(msg) {
  const box = $("#project-error");
  if (!box) return alert(msg);
  if (!msg) return box.classList.add("d-none");
  box.textContent = msg;
  box.classList.remove("d-none");
}

export async function loadAdminProjects() {
  const tbody = $("#admin-projects-body");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4">Caricamento…</td></tr>`;
  try {
    const res = await fetch(`${API_BASE}/api/projects`);
    const list = await res.json();
    if (!list || !list.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted">Nessun progetto.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(p => `
      <tr>
        <td>${p.title ?? p.name ?? "—"}</td>
        <td>${p.description ?? ""}</td>
        <td>${p.createdAt ? new Date(p.createdAt).toLocaleString() : "—"}</td>
        <td>—</td>
      </tr>
    `).join("");
  } catch (e) {
    console.error('[admin] loadAdminProjects error:', e);
    tbody.innerHTML = `<tr><td colspan="4" class="text-danger">Errore nel caricamento.</td></tr>`;
  }
}

export async function initAdmin() {
  $("#logout-btn")?.addEventListener("click", () => { logout(); location.hash = 'login'; });

  const form = $("#project-form");
  if (!form) {
    console.warn('[admin] #project-form non trovato');
    await loadAdminProjects();
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");

    const token = getToken?.();
    console.log('[admin] token hint:', token ? token.slice(0,8) + '...' : 'NO-TOKEN');
    if (!token) return showError("Non autenticato. Esegui il login admin.");

    const formData = new FormData(form);
    const endpoint = `${API_BASE}/api/projects`;
    console.log('[admin] POST URL:', endpoint);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const ct = res.headers.get("content-type") || "";
      const body = ct.includes("application/json") ? await res.json() : await res.text();

      console.log('[admin] POST status:', res.status, body);

      if (!res.ok) {
        if (res.status === 401) return showError("Token mancante/scaduto. Rifai login.");
        if (res.status === 403) return showError("Accesso riservato agli admin.");
        if (res.status === 400) return showError(body?.error || "Dati non validi.");
        return showError("Errore durante il salvataggio del progetto.");
      }

      // Chiudi modal
      const modalEl = document.getElementById("projectModal");
      if (modalEl && bootstrap?.Modal) bootstrap.Modal.getInstance(modalEl)?.hide();

      form.reset();
      await loadAdminProjects();
      if (window.refreshProjects) await window.refreshProjects();
    } catch (err) {
      console.error('[admin] submit error:', err);
      showError("Errore di rete durante il salvataggio.");
    }
  });

  await loadAdminProjects();
  console.log('[admin] initAdmin OK');
}
