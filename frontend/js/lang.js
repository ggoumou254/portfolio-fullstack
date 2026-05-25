/**
 * Internazionalizzazione
 * @version 2.1.0
 */
import { debugLog, showNotification } from './utils.js';

const I18N_CONFIG = {
  DEFAULT_LANGUAGE: 'it',
  SUPPORTED_LANGUAGES: ['it', 'fr', 'en'],
  LOCALES_PATH: './locales',
  STORAGE_KEY: 'app_language',
  FALLBACK_ENABLED: true,
  AUTO_SAVE: true
};

const i18nState = {
  currentLanguage: null,
  translations: {},
  isInitialized: false,
  isLoading: false,
};

const translationsCache = new Map();

export async function initI18n() {
  debugLog('info', 'Initialisation i18n');
  if (i18nState.isInitialized) return;
  try {
    setupEventListeners();
    const lang = await detectLanguage();
    await loadLanguage(lang);
    i18nState.isInitialized = true;
    debugLog('success', `Langue initialisee: ${lang}`);
  } catch (error) {
    console.error('Erreur initialisation i18n:', error);
    await loadLanguage(I18N_CONFIG.DEFAULT_LANGUAGE);
  }
}

function setupEventListeners() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lang]');
    if (!btn) return;
    e.preventDefault();
    switchLanguage(btn.dataset.lang);
  });

  window.addEventListener('popstate', handleUrlChange);

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
            applyTranslationsToSingleElement(node);
            applyTranslationsToElement(node);
          }
        });
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

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
  } catch { }
  return null;
}

export function getStoredLanguage() {
  try {
    const stored = localStorage.getItem(I18N_CONFIG.STORAGE_KEY);
    if (stored && I18N_CONFIG.SUPPORTED_LANGUAGES.includes(stored)) return stored;
  } catch { }
  return null;
}

export function getBrowserLanguage() {
  try {
    const candidates = [navigator.language, navigator.userLanguage].filter(Boolean);
    for (const l of candidates) {
      const base = l.split('-')[0].toLowerCase();
      if (I18N_CONFIG.SUPPORTED_LANGUAGES.includes(base)) return base;
    }
  } catch { }
  return null;
}

export async function loadLanguage(lang) {
  if (i18nState.isLoading) return;
  if (!I18N_CONFIG.SUPPORTED_LANGUAGES.includes(lang)) lang = I18N_CONFIG.DEFAULT_LANGUAGE;

  const prevLang = i18nState.currentLanguage;
  i18nState.isLoading = true;

  try {
    if (translationsCache.has(lang)) {
      i18nState.translations = translationsCache.get(lang);
    } else {
      const t = await loadTranslations(lang);
      i18nState.translations = t;
      translationsCache.set(lang, t);
      debugLog('info', `Traductions chargees: ${lang}`);
    }

    i18nState.currentLanguage = lang;
    if (I18N_CONFIG.AUTO_SAVE) saveLanguagePreference(lang);
    updateURLWithLanguage(lang);
    await applyAllTranslations();
    dispatchLanguageChangeEvent(lang, prevLang);
    debugLog('success', `Langue chargee: ${lang}`);
  } catch (error) {
    console.error(`Erreur chargement langue ${lang}:`, error);
    if (I18N_CONFIG.FALLBACK_ENABLED && lang !== I18N_CONFIG.DEFAULT_LANGUAGE) {
      await loadLanguage(I18N_CONFIG.DEFAULT_LANGUAGE);
    }
  } finally {
    i18nState.isLoading = false;
  }
}

async function loadTranslations(lang) {
  const url = `${I18N_CONFIG.LOCALES_PATH}/${lang}.json`;
  debugLog('info', `Fetch translations: ${url}`);
  const res = await fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-cache' });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 100)}`);
  try {
    const json = JSON.parse(text);
    if (!json || typeof json !== 'object') throw new Error('JSON non valido');
    return json;
  } catch (e) {
    throw new Error(`Traduzione ${lang} non valida`);
  }
}

async function applyAllTranslations() {
  document.documentElement.lang = i18nState.currentLanguage;
  applyTranslationsToSingleElement(document.body);
  applyTranslationsToElement(document.body);
  updateLanguageSwitcher();
}

function applyTranslationsToElement(root) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = getTranslation(key);
    if (val !== undefined) applyTranslationToElement(el, val, key);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    try {
      const obj = JSON.parse(el.getAttribute('data-i18n-attr'));
      Object.entries(obj).forEach(([attr, key]) => {
        const val = getTranslation(key);
        if (val !== undefined) el.setAttribute(attr, val);
      });
    } catch { }
  });
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const val = getTranslation(key);
    if (val !== undefined) el.innerHTML = val;
  });
}

function applyTranslationsToSingleElement(el) {
  if (!(el instanceof Element)) return;
  if (el.hasAttribute('data-i18n')) {
    const key = el.getAttribute('data-i18n');
    const val = getTranslation(key);
    if (val !== undefined) applyTranslationToElement(el, val, key);
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
  if (tag === 'img') { element.alt = translation; return; }
  if (tag === 'meta') return;
  element.textContent = translation;
}

export function getTranslation(key, translations = i18nState.translations) {
  if (!key || !translations) return undefined;
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

export async function switchLanguage(lang) {
  if (!I18N_CONFIG.SUPPORTED_LANGUAGES.includes(lang)) return;
  if (lang === i18nState.currentLanguage) return;
  try {
    await loadLanguage(lang);
    showNotification(t('language.changed', `Lingua cambiata: ${lang}`), 'success');
  } catch (e) {
    showNotification('Errore cambio lingua', 'error');
  }
}

function saveLanguagePreference(lang) {
  try { localStorage.setItem(I18N_CONFIG.STORAGE_KEY, lang); } catch { }
}

function updateURLWithLanguage(lang) {
  try {
    const url = new URL(window.location);
    if (url.searchParams.get('lang') === lang) return;
    url.searchParams.set('lang', lang);
    window.history.replaceState({}, '', url.toString());
  } catch { }
}

function handleUrlChange() {
  const urlLang = getLanguageFromURL();
  if (urlLang && urlLang !== i18nState.currentLanguage) loadLanguage(urlLang);
}

function dispatchLanguageChangeEvent(lang, previousLanguage) {
  window.dispatchEvent(new CustomEvent('languageChanged', {
    detail: { language: lang, previousLanguage, translations: i18nState.translations }
  }));
}