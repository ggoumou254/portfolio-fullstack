/**
 * Auth (frontend)
 * @version 2.5.3
 */
import { CONFIG } from './config.js';
import { showNotification, toggleLoading, validateEmail } from './utils.js';

const AUTH_CONFIG = { TOKEN_KEY: 'auth_token', USER_KEY: 'user_data' };
let authState = { token: null, user: null };

export function initAuth() {
  try {
    authState.token = localStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
    const raw = localStorage.getItem(AUTH_CONFIG.USER_KEY);
    authState.user = raw ? JSON.parse(raw) : null;
  } catch { clearStoredAuth(); }
}

function saveAuth(token, user = null) {
  authState.token = token || null;
  authState.user = user || null;
  if (token) localStorage.setItem(AUTH_CONFIG.TOKEN_KEY, token);
  if (user) localStorage.setItem(AUTH_CONFIG.USER_KEY, JSON.stringify(user));
}

function clearStoredAuth() {
  try {
    localStorage.removeItem(AUTH_CONFIG.TOKEN_KEY);
    localStorage.removeItem(AUTH_CONFIG.USER_KEY);
  } finally { authState = { token: null, user: null }; }
}

export function getToken() {
  if (authState.token) return authState.token;
  const t = localStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
  if (t) authState.token = t;
  return t;
}

export function getUser() {
  if (authState.user) return authState.user;
  const raw = localStorage.getItem(AUTH_CONFIG.USER_KEY);
  if (raw) { try { authState.user = JSON.parse(raw); } catch { } }
  return authState.user;
}

export function isAuthenticated() { return !!getToken(); }

export function hasRole(role) {
  const u = getUser();
  if (u && (u.role === role || (Array.isArray(u.roles) && u.roles.includes(role)))) return true;
  const t = getToken();
  if (!t) return false;
  try {
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === role || (Array.isArray(payload?.roles) && payload.roles.includes(role));
  } catch { return false; }
}

export async function login(email, password) {
  if (!email || !password) throw new Error('Email e password obbligatorie');
  if (!validateEmail(email)) throw new Error('Email non valida');

  const res = await fetch(CONFIG.apiUrl(CONFIG.ENDPOINTS.AUTH.LOGIN), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email: email.toLowerCase().trim(), password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Errore HTTP ${res.status}`);

  const accessToken = data.accessToken || data?.data?.accessToken || data.token;
  const userData = data.user || data?.data?.user;
  if (!accessToken) throw new Error('Token non ricevuto dal server');

  saveAuth(accessToken, userData);
  window.dispatchEvent(new CustomEvent('authChange', { detail: { authenticated: true, user: userData } }));
  return { user: userData, accessToken };
}

export function logout(redirectToLogin = true) {
  clearStoredAuth();
  window.dispatchEvent(new CustomEvent('authChange', { detail: { authenticated: false, user: null } }));
  showNotification('Disconnesso', 'info');
  if (redirectToLogin) window.location.hash = 'login';
}

export async function verifyToken() {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(CONFIG.apiUrl(CONFIG.ENDPOINTS.AUTH.VERIFY || 'api/auth/verify'), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      credentials: 'include'
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    const user = data?.user || data?.data?.user;
    if (user) {
      saveAuth(token, user);
      window.dispatchEvent(new CustomEvent('authChange', { detail: { authenticated: true, user } }));
    }
    return true;
  } catch { return false; }
}

/* -----------------------------------------------
   Fetch interceptor
   - Aggiunge Authorization Bearer alle chiamate /api/
   - NON tocca FormData (lascia il browser gestire multipart)
   - Aggiunge Content-Type: application/json solo per body JSON
----------------------------------------------- */
const _originalFetch = window.fetch;
window.fetch = async function (resource, options = {}) {
  const url = typeof resource === 'string' ? resource : resource?.url || '';
  const isApi = url.includes('/api/');
  const isAuth = url.includes('/api/auth/');

  if (isApi && !isAuth) {
    const token = getToken();
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

    if (isFormData) {
      // FormData: il browser gestisce Content-Type con boundary automaticamente
      // Passiamo SOLO Authorization come header separato — NON usiamo Headers object
      // perche passare Headers{} a fetch con FormData puo rompere il boundary
      const existingHeaders = options.headers || {};
      const plainHeaders = {};

      // Copia headers esistenti escludendo content-type
      if (existingHeaders instanceof Headers) {
        existingHeaders.forEach((val, key) => {
          if (key.toLowerCase() !== 'content-type') plainHeaders[key] = val;
        });
      } else if (typeof existingHeaders === 'object') {
        Object.entries(existingHeaders).forEach(([key, val]) => {
          if (key.toLowerCase() !== 'content-type') plainHeaders[key] = val;
        });
      }

      if (token) plainHeaders['Authorization'] = `Bearer ${token}`;
      plainHeaders['Accept'] = plainHeaders['Accept'] || 'application/json';

      options.headers = plainHeaders; // oggetto plain, NON Headers instance
    } else {
      // JSON / testo / nessun body
      const headers = options.headers instanceof Headers
        ? options.headers
        : new Headers(options.headers || {});

      if (token) headers.set('Authorization', `Bearer ${token}`);

      const method = (options.method || 'GET').toUpperCase();
      if (options.body && method !== 'GET' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      options.headers = headers;
    }

    options.credentials = options.credentials || 'include';
  }

  return _originalFetch(resource, options);
};

document.addEventListener('DOMContentLoaded', initAuth);