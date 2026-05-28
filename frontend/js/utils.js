// frontend/js/utils.js
// @version 2.1.0

/* -------- Date -------- */
export function formatDate(date, locale = 'it-IT', options = {}) {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', ...options });
  } catch { return ''; }
}

export function formatDateTime(date) {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export function formatRelativeTime(date) {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    const diff = (new Date() - d) / 1000;
    const rtf = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });
    if (diff < 60) return 'adesso';
    if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
    if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour');
    if (diff < 604800) return rtf.format(-Math.floor(diff / 86400), 'day');
    return formatDate(date);
  } catch { return formatDate(date); }
}

/* -------- Testo -------- */
export function truncate(str = '', maxLength = 60, ellipsis = '...') {
  if (typeof str !== 'string') return '';
  return str.length > maxLength ? str.slice(0, maxLength - ellipsis.length) + ellipsis : str;
}

export function capitalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function formatNumber(number, locale = 'it-IT') {
  if (typeof number !== 'number' || isNaN(number)) return '';
  return new Intl.NumberFormat(locale).format(number);
}

export function slugify(str) {
  if (typeof str !== 'string') return '';
  return str.toLowerCase().trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-');
}

/* -------- Validazione -------- */
export function validateEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validateUrl(url) {
  if (typeof url !== 'string') return false;
  try { new URL(url); return true; } catch { return false; }
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim()
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
}

/* -------- UI -------- */
export function toggleLoading(button, isLoading, loadingText = 'Caricamento...') {
  if (!button || !(button instanceof HTMLElement)) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>${loadingText}`;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || 'Invia';
    delete button.dataset.originalText;
  }
}

export function showNotification(message, type = 'info', duration = 5000) {
  const cfg = {
    success: { cls: 'alert-success', icon: 'bi-check-circle-fill' },
    error: { cls: 'alert-danger', icon: 'bi-exclamation-triangle-fill' },
    warning: { cls: 'alert-warning', icon: 'bi-exclamation-triangle' },
    info: { cls: 'alert-info', icon: 'bi-info-circle-fill' }
  }[type] || { cls: 'alert-info', icon: 'bi-info-circle-fill' };

  const el = document.createElement('div');
  el.className = `alert ${cfg.cls} alert-dismissible fade show`;
  el.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;min-width:300px;max-width:400px;box-shadow:0 4px 12px rgba(0,0,0,.15);border:none;border-radius:8px';
  el.innerHTML = `<div class="d-flex align-items-center gap-2"><i class="bi ${cfg.icon}"></i><span class="flex-grow-1">${message}</span><button type="button" class="btn-close btn-close-sm" data-bs-dismiss="alert"></button></div>`;
  document.body.appendChild(el);

  const t = setTimeout(() => el.remove(), duration);
  el.addEventListener('mouseenter', () => clearTimeout(t));
  el.addEventListener('mouseleave', () => setTimeout(() => el.remove(), 1000));
}

export function showLoading(message = 'Caricamento...') {
  if (document.getElementById('_loading_overlay')) return;
  const el = document.createElement('div');
  el.id = '_loading_overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,.9);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999';
  el.innerHTML = `<div class="text-center"><div class="spinner-border text-primary" role="status"></div>${message ? `<p class="mt-2 small text-muted">${message}</p>` : ''}</div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
}

export function hideLoading() {
  const el = document.getElementById('_loading_overlay');
  if (el) el.remove();
  document.body.style.overflow = '';
}

/* -------- Misc -------- */
export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  const cloned = {};
  for (const key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) cloned[key] = deepClone(obj[key]); }
  return cloned;
}

export function getUrlParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

export function debugLog(level, ...args) {
  const { hostname } = window.location;
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(hostname) ||
    ['192.168.', '10.', '172.'].some(r => hostname.startsWith(r));
  if (!isLocal) return;

  const styles = { info: 'color:blue;font-weight:bold', warn: 'color:orange;font-weight:bold', error: 'color:red;font-weight:bold', success: 'color:green;font-weight:bold' };
  console.log(`%c[DEBUG]`, styles[level] || '', ...args);
}

export default {
  formatDate, formatDateTime, formatRelativeTime,
  truncate, capitalize, formatNumber, slugify,
  validateEmail, validateUrl, sanitizeInput,
  toggleLoading, showNotification, showLoading, hideLoading,
  debounce, deepClone, getUrlParam, debugLog
};