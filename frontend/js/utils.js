// frontend/js/utils.js

/**
 * Utilitaires modernes pour l'application
 * @version 2.0.0
 * @author Raphael Goumou
 */

// =========================
// GESTION DES DATES
// =========================

/**
 * Formate une date ISO en format localisé
 * @param {string|Date} date - Date à formater
 * @param {string} locale - Locale (défaut: 'it-IT')
 * @param {Object} options - Options de formatage
 * @returns {string} Date formatée
 */
export function formatDate(date, locale = 'it-IT', options = {}) {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
      throw new Error('Date invalide');
    }
    
    const defaultOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    };
    
    return dateObj.toLocaleDateString(locale, { ...defaultOptions, ...options });
  } catch (error) {
    console.warn('Erreur de formatage de date:', error);
    return '';
  }
}

/**
 * Formate une date avec l'heure
 * @param {string|Date} date - Date à formater
 * @returns {string} Date et heure formatées
 */
export function formatDateTime(date) {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
      throw new Error('Date invalide');
    }
    
    return dateObj.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.warn('Erreur de formatage datetime:', error);
    return '';
  }
}

/**
 * Formate une date en temps relatif (ex: "il y a 2 heures")
 * @param {string|Date} date - Date à formater
 * @returns {string} Temps relatif
 */
export function formatRelativeTime(date) {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
      throw new Error('Date invalide');
    }
    
    const now = new Date();
    const diffMs = now - dateObj;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    const rtf = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });
    
    if (diffDays > 7) {
      return formatDate(date);
    } else if (diffDays > 0) {
      return rtf.format(-diffDays, 'day');
    } else if (diffHours > 0) {
      return rtf.format(-diffHours, 'hour');
    } else if (diffMinutes > 0) {
      return rtf.format(-diffMinutes, 'minute');
    } else {
      return 'adesso';
    }
  } catch (error) {
    console.warn('Erreur de formatage relative time:', error);
    return formatDate(date);
  }
}

// =========================
// MANIPULATION DE TEXTE
// =========================

/**
 * Tronque une chaîne avec ellipsis
 * @param {string} str - Chaîne à tronquer
 * @param {number} maxLength - Longueur maximale
 * @param {string} ellipsis - Caractères d'ellipsis
 * @returns {string} Chaîne tronquée
 */
export function truncate(str = '', maxLength = 60, ellipsis = '…') {
  if (typeof str !== 'string') return '';
  
  return str.length > maxLength 
    ? str.slice(0, maxLength - ellipsis.length) + ellipsis 
    : str;
}

/**
 * Capitalise la première lettre d'une chaîne
 * @param {string} str - Chaîne à capitaliser
 * @returns {string} Chaîne capitalisée
 */
export function capitalize(str) {
  if (typeof str !== 'string' || !str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Formate un nombre avec séparateurs
 * @param {number} number - Nombre à formater
 * @param {string} locale - Locale pour le formatage
 * @returns {string} Nombre formaté
 */
export function formatNumber(number, locale = 'it-IT') {
  if (typeof number !== 'number' || isNaN(number)) return '';
  
  return new Intl.NumberFormat(locale).format(number);
}

/**
 * Génère un slug à partir d'une chaîne
 * @param {string} str - Chaîne à slugifier
 * @returns {string} Slug
 */
export function slugify(str) {
  if (typeof str !== 'string') return '';
  
  return str
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9 -]/g, '') // Remove invalid chars
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/-+/g, '-'); // Replace multiple - with single -
}

// =========================
// VALIDATION
// =========================

/**
 * Valide un email
 * @param {string} email - Email à valider
 * @returns {boolean} True si l'email est valide
 */
export function validateEmail(email) {
  if (typeof email !== 'string') return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Valide un numéro de téléphone (format international simplifié)
 * @param {string} phone - Numéro de téléphone
 * @returns {boolean} True si le numéro est valide
 */
export function validatePhone(phone) {
  if (typeof phone !== 'string') return false;
  
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
}

/**
 * Nettoie et sécurise les entrées utilisateur
 * @param {string} input - Entrée à nettoyer
 * @returns {string} Entrée nettoyée
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript:
    .replace(/on\w+=/gi, ''); // Remove event handlers
}

/**
 * Valide une URL
 * @param {string} url - URL à valider
 * @returns {boolean} True si l'URL est valide
 */
export function validateUrl(url) {
  if (typeof url !== 'string') return false;
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// =========================
// GESTION DU DOM ET UI
// =========================

let loadingOverlay = null;

/**
 * Affiche un overlay de chargement
 * @param {string} message - Message à afficher
 */
export function showLoading(message = 'Caricamento...') {
  if (loadingOverlay) return;
  
  loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'loading-overlay';
  loadingOverlay.innerHTML = `
    <div class="loading-content">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Caricamento...</span>
      </div>
      ${message ? `<p class="mt-2 small text-muted">${message}</p>` : ''}
    </div>
  `;
  
  // Styles inline pour éviter la dépendance CSS
  loadingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;
  
  const loadingContent = loadingOverlay.querySelector('.loading-content');
  if (loadingContent) {
    loadingContent.style.cssText = `
      text-align: center;
      background: white;
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    `;
  }
  
  document.body.appendChild(loadingOverlay);
  document.body.style.overflow = 'hidden';
}

/**
 * Cache l'overlay de chargement
 */
export function hideLoading() {
  if (loadingOverlay && loadingOverlay.parentNode) {
    loadingOverlay.parentNode.removeChild(loadingOverlay);
    loadingOverlay = null;
  }
  document.body.style.overflow = '';
}

/**
 * Bascule l'état de chargement d'un bouton
 * @param {HTMLElement} button - Bouton à modifier
 * @param {boolean} isLoading - État de chargement
 * @param {string} loadingText - Texte pendant le chargement
 */
export function toggleLoading(button, isLoading, loadingText = 'Caricamento...') {
  if (!button || !(button instanceof HTMLElement)) return;
  
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status"></span>
      ${loadingText}
    `;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || 'Invia';
    delete button.dataset.originalText;
  }
}

/**
 * Affiche une notification toast
 * @param {string} message - Message à afficher
 * @param {string} type - Type de notification (success, error, warning, info)
 * @param {number} duration - Durée d'affichage en ms
 */
export function showNotification(message, type = 'info', duration = 5000) {
  const types = {
    success: { class: 'alert-success', icon: '✓' },
    error: { class: 'alert-danger', icon: '⚠' },
    warning: { class: 'alert-warning', icon: '⚠' },
    info: { class: 'alert-info', icon: 'ℹ' }
  };
  
  const config = types[type] || types.info;
  
  const notification = document.createElement('div');
  notification.className = `alert ${config.class} alert-dismissible fade show notification-toast`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9998;
    min-width: 300px;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border: none;
    border-radius: 8px;
  `;
  
  notification.innerHTML = `
    <div class="d-flex align-items-center">
      <span class="me-2">${config.icon}</span>
      <span class="flex-grow-1">${message}</span>
      <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="alert"></button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Animation d'entrée
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Auto-dismiss
  const dismissTimeout = setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, duration);
  
  // Annuler l'auto-dismiss si l'utilisateur interagit
  notification.addEventListener('mouseenter', () => {
    clearTimeout(dismissTimeout);
  });
  
  notification.addEventListener('mouseleave', () => {
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 1000);
  });
}

/**
 * Affiche une erreur dans un conteneur
 * @param {HTMLElement} container - Conteneur d'erreur
 * @param {string} message - Message d'erreur
 */
export function showError(container, message) {
  if (!container || !(container instanceof HTMLElement)) return;
  
  container.textContent = message;
  container.className = 'alert alert-danger mt-2';
  container.style.display = 'block';
  
  // Focus sur le premier champ erreur si possible
  const form = container.closest('form');
  if (form) {
    const firstInvalid = form.querySelector('.is-invalid');
    if (firstInvalid) {
      firstInvalid.focus();
    }
  }
}

/**
 * Cache une erreur
 * @param {HTMLElement} container - Conteneur d'erreur
 */
export function hideError(container) {
  if (container && container instanceof HTMLElement) {
    container.style.display = 'none';
    container.className = '';
    container.textContent = '';
  }
}

// =========================
// GESTION DES DONNÉES
// =========================

/**
 * Débounce une fonction
 * @param {Function} func - Fonction à débouncer
 * @param {number} wait - Temps d'attente en ms
 * @returns {Function} Fonction débouncée
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Deep clone un objet
 * @param {*} obj - Objet à cloner
 * @returns {*} Clone de l'objet
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Récupère un paramètre d'URL
 * @param {string} param - Nom du paramètre
 * @returns {string|null} Valeur du paramètre
 */
export function getUrlParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

/**
 * Met à jour l'URL sans recharger la page
 * @param {Object} params - Paramètres à mettre à jour
 */
export function updateUrlParams(params) {
  const url = new URL(window.location);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });
  
  window.history.replaceState({}, '', url);
}

// =========================
// PERFORMANCE ET DEBUG
// =========================

/**
 * Mesure le temps d'exécution d'une fonction
 * @param {Function} fn - Fonction à mesurer
 * @param {string} label - Label pour le console
 * @returns {*} Résultat de la fonction
 */
export function measureTime(fn, label = 'Function') {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  
  console.log(`${label} exécuté en: ${(end - start).toFixed(2)}ms`);
  return result;
}

/**
 * Logger conditionnel (seulement en développement)
 * @param {string} level - Niveau de log
 * @param {...any} args - Arguments à logger
 */
export function debugLog(level, ...args) {
  const isDev = window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1';
  
  if (!isDev) return;
  
  const styles = {
    info: 'color: blue; font-weight: bold;',
    warn: 'color: orange; font-weight: bold;',
    error: 'color: red; font-weight: bold;',
    success: 'color: green; font-weight: bold;'
  };
  
  const style = styles[level] || '';
  
  console.log(`%c[DEBUG]`, style, ...args);
}

// =========================
// EXPORT DES UTILITAIRES GROUPÉS
// =========================

export const DateUtils = {
  formatDate,
  formatDateTime,
  formatRelativeTime
};

export const StringUtils = {
  truncate,
  capitalize,
  formatNumber,
  slugify
};

export const ValidationUtils = {
  validateEmail,
  validatePhone,
  validateUrl,
  sanitizeInput
};

export const UIUtils = {
  showLoading,
  hideLoading,
  toggleLoading,
  showNotification,
  showError,
  hideError
};

export const DataUtils = {
  debounce,
  deepClone,
  getUrlParam,
  updateUrlParams
};

export const DebugUtils = {
  measureTime,
  debugLog
};

// Export par défaut pour une importation facile
export default {
  ...DateUtils,
  ...StringUtils,
  ...ValidationUtils,
  ...UIUtils,
  ...DataUtils,
  ...DebugUtils
};