// frontend/js/api.js
import CONFIG from './config.js';

/**
 * Wrapper fetch avec gestion JSON, headers par défaut et token
 * - Normalise l’URL via CONFIG.apiUrl(endpoint) (évite http://host:portapi/…)
 * - Injecte les headers par défaut + Authorization si présent
 * - Sérialise body JSON sauf FormData
 */
export async function apiFetch(endpoint, options = {}) {
  const url = CONFIG.apiUrl(endpoint);

  // merge headers: config par défaut + headers de l'appel
  const headers = {
    ...CONFIG.DEFAULT_HEADERS,
    ...(options.headers || {})
  };

  // Ajoute le token si présent
  const token = localStorage.getItem(CONFIG.SECURITY?.TOKEN_KEY || 'auth_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Prépare les options
  const opts = { ...options, headers };

  // Sérialise le body si ce n'est pas du FormData
  if (opts.body && !(opts.body instanceof FormData)) {
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (headers['Content-Type'].includes('application/json') && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
    }
  }

  // Debug
  if (CONFIG.get('DEBUG')) {
    console.log('[apiFetch] URL:', url, 'opts:', { ...opts, body: opts.body instanceof FormData ? '[FormData]' : opts.body });
  }

  const res = await fetch(url, opts);

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json().catch(() => ({}))
    : await res.text();

  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Erreur ${res.status}`;
    throw new Error(msg);
  }

  return data;
}
