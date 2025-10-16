/**
 * Auth (frontend) — coerente coi secret/rotte backend
 * @version 2.5.1
 */
import { CONFIG } from './config.js';
import { showNotification, toggleLoading, validateEmail } from './utils.js';

const AUTH_CONFIG = { TOKEN_KEY: 'auth_token', USER_KEY: 'user_data' };
let authState = { token: null, user: null };

/* ========== Init & storage ========== */
export function initAuth() {
  try {
    authState.token = localStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
    const raw = localStorage.getItem(AUTH_CONFIG.USER_KEY);
    authState.user = raw ? JSON.parse(raw) : null;
  } catch {
    clearStoredAuth();
  }
}

function saveAuth(token, user = null) {
  authState.token = token || null;
  authState.user  = user  || null;
  if (token) localStorage.setItem(AUTH_CONFIG.TOKEN_KEY, token);
  if (user)  localStorage.setItem(AUTH_CONFIG.USER_KEY, JSON.stringify(user));
}

function clearStoredAuth() {
  try {
    localStorage.removeItem(AUTH_CONFIG.TOKEN_KEY);
    localStorage.removeItem(AUTH_CONFIG.USER_KEY);
  } finally {
    authState = { token: null, user: null };
  }
}

/* ========== Getters ========== */
export function getToken() {
  if (authState.token) return authState.token;
  const t = localStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
  if (t) authState.token = t;
  return t;
}

export function getUser() {
  if (authState.user) return authState.user;
  const raw = localStorage.getItem(AUTH_CONFIG.USER_KEY);
  if (raw) { try { authState.user = JSON.parse(raw); } catch {} }
  return authState.user;
}

export function isAuthenticated() { return !!getToken(); }

export function hasRole(role) {
  const u = getUser();
  if (u && (u.role === role || (Array.isArray(u.roles) && u.roles.includes(role)))) return true;

  // fallback: leggi dal JWT
  const t = getToken();
  if (!t) return false;
  try {
    const part = t.split('.')[1] || '';
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    const r = payload?.role;
    if (!r) return false;
    return r === role || (Array.isArray(payload.roles) && payload.roles.includes(role));
  } catch { return false; }
}

/* ========== API: login/logout/verify ========== */
export async function login(email, password) {
  if (!email || !password) throw new Error('Email et mot de passe requis');
  if (!validateEmail(email)) throw new Error("Format d'email invalide");

  const endpoint = CONFIG.apiUrl(CONFIG.ENDPOINTS.AUTH.LOGIN);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email: email.toLowerCase().trim(), password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Erreur HTTP ${res.status}`);

  const accessToken = data.accessToken || data?.data?.accessToken || data.token;
  const userData    = data.user || data?.data?.user;
  if (!accessToken) throw new Error('Token non reçu dal server');

  saveAuth(accessToken, userData);
  window.dispatchEvent(new CustomEvent('authChange', { detail: { authenticated: true, user: userData }}));
  showNotification('Connexion réussie !', 'success');
  return { user: userData, accessToken };
}

export function logout(redirectToLogin = true) {
  clearStoredAuth();
  window.dispatchEvent(new CustomEvent('authChange', { detail: { authenticated: false, user: null }}));
  showNotification('Déconnexion réussie', 'info');
  if (redirectToLogin) window.location.hash = 'login';
}

export async function verifyToken() {
  const token = getToken();
  if (!token) return false;
  const verifyEndpoint = CONFIG.apiUrl(CONFIG.ENDPOINTS.AUTH.VERIFY || 'api/auth/verify');
  try {
    const res = await fetch(verifyEndpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      credentials: 'include'
    });
    if (!res.ok) return false;
    const data = await res.json().catch(()=> ({}));
    const user = data?.user || data?.data?.user;
    if (user) {
      saveAuth(token, user);
      window.dispatchEvent(new CustomEvent('authChange', { detail: { authenticated: true, user }}));
    }
    return true;
  } catch { return false; }
}

/* ========== Fetch interceptor (safe FormData/GET) ========== */
const originalFetch = window.fetch;
window.fetch = async function(resource, options = {}) {
  const url = typeof resource === 'string' ? resource : resource.url;
  const isApi = url.includes('/api/');
  const isAuthPath = url.includes('/api/auth/');

  if (isApi && !isAuthPath) {
    const token = getToken();
    const headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    options.headers = headers;

    const method = (options.method || 'GET').toUpperCase();
    const hasBody = !!options.body;
    const isFormData = (typeof FormData !== 'undefined') && options.body instanceof FormData;

    // Non forzare Content-Type se FormData, se non c'è body o se GET
    if (!isFormData && hasBody && method !== 'GET' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    options.credentials = options.credentials || 'include';
  }
  return originalFetch(resource, options);
};

/* ========== Helper pagina login ========== */
export function initLogin() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  const errorBox = document.getElementById('login-error');
  const submitBtn = form.querySelector('[type="submit"]');
  const emailInput = form.querySelector('#email');
  const passwordInput = form.querySelector('#password');

  form.reset();
  if (errorBox) { errorBox.textContent = ''; errorBox.classList.add('d-none'); }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput?.value?.trim() || '';
    const password = passwordInput?.value || '';
    if (!email || !password) return showErr('Email et mot de passe requis');
    if (!validateEmail(email)) return showErr("Format d'email invalide");

    toggleLoading(submitBtn, true, 'Connexion…');
    try {
      const { user } = await login(email, password);
      const redirect = sessionStorage.getItem('redirectAfterLogin');
      if (redirect) {
        sessionStorage.removeItem('redirectAfterLogin');
        window.location.hash = redirect;
      } else {
        window.location.hash = user?.role === 'admin' ? 'admin' : 'home';
      }
    } catch (err) {
      showErr(err.message || 'Erreur de connexion');
    } finally {
      toggleLoading(submitBtn, false, 'Se connecter');
    }
  });

  function showErr(msg) {
    if (errorBox) { errorBox.textContent = msg; errorBox.classList.remove('d-none'); }
    else showNotification(msg, 'error');
  }

  [emailInput, passwordInput].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', () => {
      if (errorBox && !errorBox.classList.contains('d-none')) errorBox.classList.add('d-none');
    });
  });
}

document.addEventListener('DOMContentLoaded', initAuth);
