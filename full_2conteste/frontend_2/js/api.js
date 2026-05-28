// frontend/js/api.js
import { API_BASE } from './config.js';

/**
 * Wrapper fetch con gestione JSON e token
 */
export async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`.trim();
  const headers = options.headers || {};

  // aggiunge token se presente
  const token = localStorage.getItem('token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // default headers JSON
  if (!options.body || !(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const opts = { ...options, headers };
  if (opts.body && !(opts.body instanceof FormData)) opts.body = JSON.stringify(opts.body);

  console.log('[apiFetch] URL:', url, 'opts:', opts);
  const res = await fetch(url, opts);

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(()=>({})) : await res.text();

  if (!res.ok) {
    const msg = data?.message || data?.error || `Errore ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
