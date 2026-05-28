// frontend/js/auth.js
import { API_BASE } from './config.js';

// --- UTIL ---
export function getToken() {
  return localStorage.getItem("token");
}

export function logout() {
  localStorage.removeItem("token");
  location.hash = "login";
}

/**
 * Effettua login e restituisce l'oggetto data.
 * Lancia errori in caso di fallimento.
 */
export async function login(email, password) {
  const endpoint = `${API_BASE}/api/auth/login`.trim();
  console.log('[DEBUG auth] login URL:', endpoint);
  console.log('[DEBUG auth] login payload hint:', { email });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  // tenta parse JSON (ma non fallire se non è JSON)
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.message || data?.error || `Login fallito (${res.status})`;
    throw new Error(msg);
  }

  if (!data?.token) {
    throw new Error("Token mancante nella risposta");
  }

  // salva token e ritorna data
  localStorage.setItem("token", data.token);
  console.log('[DEBUG auth] token saved hint:', data.token?.slice?.(0,8) + '...');
  return data;
}

// initLogin mantiene solo il binding della UI (non salva token direttamente qui)
export function initLogin() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const errorBox = document.getElementById("login-error");
  const btn = form.querySelector("[type=submit]");

  if (errorBox) { errorBox.textContent = ""; errorBox.className = ""; }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (btn) { btn.disabled = true; btn.dataset._txt ??= btn.textContent; btn.textContent = "Invio..."; }

    const email = form.email?.value?.trim();
    const password = form.password?.value || "";

    try {
      if (!email || !password) throw new Error("Email e password obbligatorie");

      const data = await login(email, password);
      // redirect in base al ruolo
      const role = data?.user?.role || "user";
      location.hash = role === "admin" ? "admin" : "dashboard";
    } catch (err) {
      const isCors = err instanceof TypeError;
      const hint = isCors ? " (controlla CORS/connessione al backend)" : "";
      if (errorBox) {
        errorBox.textContent = (err.message || "Errore login") + hint;
        errorBox.className = "text-danger mt-2";
      } else {
        alert((err.message || "Errore login") + hint);
      }
      console.error('[DEBUG auth] login error:', err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset._txt || "Accedi"; }
    }
  });
}
