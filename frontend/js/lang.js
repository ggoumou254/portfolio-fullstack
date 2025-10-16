// frontend/js/lang.js

/**
 * Système d'internationalisation moderne avec gestion avancée des langues
 * @version 2.0.1
 * @author Raphael
 */

import './config.js';
import { debugLog, showNotification } from './utils.js';

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------
const I18N_CONFIG = {
  DEFAULT_LANGUAGE: 'fr',
  SUPPORTED_LANGUAGES: ['fr', 'en', 'it'],
  LOCALES_PATH: './locales', // relativo alla pagina → /locales
  STORAGE_KEY: 'app_language',
  FALLBACK_ENABLED: true,
  AUTO_SAVE: true
};

// -----------------------------------------------------------------------------
// STATE
// -----------------------------------------------------------------------------
const i18nState = {
  currentLanguage: null,
  translations: {},
  isInitialized: false,
  isLoading: false,
  fallbackUsed: false
};

const translationsCache = new Map();

// -----------------------------------------------------------------------------
// INIT
// -----------------------------------------------------------------------------
export async function initI18n() {
  debugLog('info', '🌐 Initialisation i18n');
  if (i18nState.isInitialized) return;

  try {
    setupEventListeners();
    const lang = await detectLanguage();
    await loadLanguage(lang);
    i18nState.isInitialized = true;
    debugLog('success', `Langue initialisée: ${lang}`);
  } catch (error) {
    console.error('Erreur initialisation i18n:', error);
    await loadLanguage(I18N_CONFIG.DEFAULT_LANGUAGE);
  }
}

function setupEventListeners() {
  // Trigger via click data-lang
  document.addEventListener('click', (e) => {
    const langButton = e.target.closest('[data-lang]');
    if (!langButton) return;
    e.preventDefault();
    switchLanguage(langButton.dataset.lang);
  });

  // URL changes (back/forward)
  window.addEventListener('popstate', handleUrlChange);

  // Compat entrante: ascolta sia languageChange che languageChanged
  ['languageChange', 'languageChanged'].forEach(evt =>
    window.addEventListener(evt, (e) => {
      const lang = e?.detail?.language;
      if (lang) switchLanguage(lang);
    })
  );

  setupDOMObserver();
}

function setupDOMObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Applica al nodo stesso…
            applyTranslationsToSingleElement(node);
            // …e ai suoi discendenti
            applyTranslationsToElement(node);
          }
        });
      } else if (m.type === 'attributes') {
        if (m.attributeName?.startsWith('data-i18n')) {
          applyTranslationsToSingleElement(m.target);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-i18n', 'data-i18n-attr', 'data-i18n-html']
  });
}

// -----------------------------------------------------------------------------
// DETECTION
// -----------------------------------------------------------------------------
export async function detectLanguage() {
  const urlLang = getLanguageFromURL();
  if (urlLang) return urlLang;

  const stored = getStoredLanguage();
  if (stored) return stored;

  const browser = getBrowserLanguage();
  if (browser) return browser;

  return I18N_CONFIG.DEFAULT_LANGUAGE;
}

export function getLanguageFromURL() {
  try {
    const lang = new URLSearchParams(window.location.search).get('lang');
    if (lang && I18N_CONFIG.SUPPORTED_LANGUAGES.includes(lang)) return lang;
  } catch (e) {
    debugLog('warn', 'URL lang parse error:', e);
  }
  return null;
}

export function getStoredLanguage() {
  try {
    const stored = localStorage.getItem(I18N_CONFIG.STORAGE_KEY);
    if (stored && I18N_CONFIG.SUPPORTED_LANGUAGES.includes(stored)) return stored;
  } catch (e) {
    debugLog('warn', 'Storage lang read error:', e);
  }
  return null;
}

export function getBrowserLanguage() {
  try {
    const candidates = [
      navigator.language,
      navigator.userLanguage,
      navigator.browserLanguage,
      navigator.systemLanguage
    ].filter(Boolean);

    for (const l of candidates) {
      const base = l.split('-')[0].split(';')[0].toLowerCase();
      if (I18N_CONFIG.SUPPORTED_LANGUAGES.includes(base)) return base;
    }
  } catch (e) {
    debugLog('warn', 'Browser lang detect error:', e);
  }
  return null;
}

// -----------------------------------------------------------------------------
// LOAD
// -----------------------------------------------------------------------------
export async function loadLanguage(lang) {
  if (i18nState.isLoading) return;
  if (!I18N_CONFIG.SUPPORTED_LANGUAGES.includes(lang)) lang = I18N_CONFIG.DEFAULT_LANGUAGE;

  const prevLang = i18nState.currentLanguage;
  i18nState.isLoading = true;

  try {
    if (translationsCache.has(lang)) {
      i18nState.translations = translationsCache.get(lang);
      debugLog('info', `Traductions depuis cache: ${lang}`);
    } else {
      const t = await loadTranslations(lang);
      i18nState.translations = t;
      translationsCache.set(lang, t);
      debugLog('info', `Traductions chargées: ${lang}`);
    }

    i18nState.currentLanguage = lang;

    if (I18N_CONFIG.AUTO_SAVE) saveLanguagePreference(lang);
    updateURLWithLanguage(lang);

    await applyAllTranslations();

    dispatchLanguageChangeEvent(lang, prevLang);
    debugLog('success', `Langue chargée: ${lang}`);
  } catch (error) {
    console.error(`Erreur chargement langue ${lang}:`, error);
    if (I18N_CONFIG.FALLBACK_ENABLED && lang !== I18N_CONFIG.DEFAULT_LANGUAGE) {
      debugLog('warn', `Fallback → ${I18N_CONFIG.DEFAULT_LANGUAGE}`);
      await loadLanguage(I18N_CONFIG.DEFAULT_LANGUAGE);
      i18nState.fallbackUsed = true;
    } else {
      throw error;
    }
  } finally {
    i18nState.isLoading = false;
  }
}

async function loadTranslations(lang) {
  const url = `${I18N_CONFIG.LOCALES_PATH}/${lang}.json`;
  debugLog('info', `Fetch translations: ${url}`);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache'
    },
    cache: 'no-cache'
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText} — body: ${text.slice(0, 140)}`);
  }

  try {
    const json = JSON.parse(text);
    if (!json || typeof json !== 'object') throw new Error('Invalid translations JSON');
    return json;
  } catch (e) {
    console.error(`[i18n] Risposta non JSON da ${url}:`, text.slice(0, 200));
    throw new Error(`Traduzione ${lang} non valida`);
  }
}

// -----------------------------------------------------------------------------
// APPLY
// -----------------------------------------------------------------------------
async function applyAllTranslations() {
  document.documentElement.lang = i18nState.currentLanguage;
  updateMetadata();

  // Applica al body e discendenti
  applyTranslationsToSingleElement(document.body);
  applyTranslationsToElement(document.body);

  updateLanguageSwitcher();
}

function updateMetadata() {
  // usa getTranslation per chiavi annidate
  const title = getTranslation('page.title');
  if (title) document.title = title;

  const desc = getTranslation('page.description');
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && desc) metaDesc.setAttribute('content', desc);

  const keywords = getTranslation('page.keywords');
  const metaKw = document.querySelector('meta[name="keywords"]');
  if (metaKw && keywords) metaKw.setAttribute('content', keywords);

  updateOpenGraphMetadata();
}

function updateOpenGraphMetadata() {
  const map = {
    'og:title': 'og.title',
    'og:description': 'og.description',
    'og:site_name': 'og.site_name'
  };
  Object.entries(map).forEach(([prop, key]) => {
    const val = getTranslation(key);
    const el = document.querySelector(`meta[property="${prop}"]`);
    if (el && val) el.setAttribute('content', val);
  });
}

function applyTranslationsToElement(root) {
  // data-i18n
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const t = getTranslation(key);
    if (t !== undefined) applyTranslationToElement(el, t, key);
  });

  // data-i18n-attr (JSON: {"title":"nav.home","aria-label":"nav.home"})
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    const cfg = el.getAttribute('data-i18n-attr');
    try {
      const obj = JSON.parse(cfg);
      Object.entries(obj).forEach(([attr, key]) => {
        const t = getTranslation(key);
        if (t !== undefined) el.setAttribute(attr, t);
      });
    } catch {
      console.warn('Configuration data-i18n-attr invalide:', cfg);
    }
  });

  // data-i18n-html
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const t = getTranslation(key);
    if (t !== undefined) el.innerHTML = t;
  });
}

// applica al nodo stesso (se marcato)
function applyTranslationsToSingleElement(el) {
  if (!(el instanceof Element)) return;

  if (el.hasAttribute('data-i18n')) {
    const key = el.getAttribute('data-i18n');
    const t = getTranslation(key);
    if (t !== undefined) applyTranslationToElement(el, t, key);
  }

  if (el.hasAttribute('data-i18n-attr')) {
    const cfg = el.getAttribute('data-i18n-attr');
    try {
      const obj = JSON.parse(cfg);
      Object.entries(obj).forEach(([attr, key]) => {
        const t = getTranslation(key);
        if (t !== undefined) el.setAttribute(attr, t);
      });
    } catch {
      console.warn('Configuration data-i18n-attr invalide:', cfg);
    }
  }

  if (el.hasAttribute('data-i18n-html')) {
    const key = el.getAttribute('data-i18n-html');
    const t = getTranslation(key);
    if (t !== undefined) el.innerHTML = t;
  }
}

function applyTranslationToElement(element, translation, key) {
  const tag = element.tagName.toLowerCase();

  if (tag === 'input' || tag === 'textarea') {
    const type = element.getAttribute('type');
    if (type === 'submit' || type === 'button') element.value = translation;
    else element.placeholder = translation;
    return;
  }

  if (tag === 'img') {
    const alt = getTranslation(`${key}.alt`);
    if (alt) element.alt = alt;
    return;
  }

  if (tag === 'meta') return; // metadata handled elsewhere

  element.textContent = translation;
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------
export function getTranslation(key, translations = i18nState.translations) {
  if (!key || !translations) return undefined;
  // percorso annidato: 'nav.home'
  return key.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), translations);
}

export function t(key, fallback = '') {
  const val = getTranslation(key);
  return typeof val === 'string' ? val : fallback;
}

function updateLanguageSwitcher() {
  const current = i18nState.currentLanguage;
  document.querySelectorAll('[data-lang]').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-lang') === current);
  });
}

// switch
export async function switchLanguage(lang) {
  if (!I18N_CONFIG.SUPPORTED_LANGUAGES.includes(lang)) {
    showNotification(`Langue non supportée: ${lang}`, 'warning');
    return;
  }
  if (lang === i18nState.currentLanguage) return;

  try {
    await loadLanguage(lang);
    showNotification(t('language.changed', `Langue changée en ${lang}`), 'success');
  } catch (e) {
    console.error(`Erreur changement langue ${lang}:`, e);
    showNotification(t('language.error', 'Erreur lors du changement de langue'), 'error');
  }
}

function saveLanguagePreference(lang) {
  try {
    localStorage.setItem(I18N_CONFIG.STORAGE_KEY, lang);
  } catch (e) {
    debugLog('warn', 'Save lang pref error:', e);
  }
}

function updateURLWithLanguage(lang) {
  try {
    const url = new URL(window.location);
    if (url.searchParams.get('lang') === lang) return;
    url.searchParams.set('lang', lang);
    window.history.replaceState({}, '', url.toString());
  } catch (e) {
    debugLog('warn', 'URL update error:', e);
  }
}

function handleUrlChange() {
  const urlLang = getLanguageFromURL();
  if (urlLang && urlLang !== i18nState.currentLanguage) loadLanguage(urlLang);
}

function dispatchLanguageChangeEvent(lang, previousLanguage) {
  const event = new CustomEvent('languageChanged', {
    detail: {
      language: lang,
      previousLanguage,
      translations: i18nState.translations
    }
  });
  window.dispatchEvent(event);
}

// -----------------------------------------------------------------------------
// AUTO-INIT
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => initI18n(), 100);
});

// Test exports
export const _testExports = { i18nState, getTranslation, detectLanguage };
