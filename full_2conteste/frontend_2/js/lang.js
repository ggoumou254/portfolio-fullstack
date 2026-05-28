// frontend/js/lang.js

const SUPPORTED_LANG = ["it", "fr", "en"];
const DEFAULT_LANG = "it";
const LOCALES_PATH = "./locales/";

// Stato corrente
let currentLang = null;
let translations = {};

// Helpers
function getLangFromURL() {
  const url = new URL(location.href);
  const lang = url.searchParams.get("lang");
  return SUPPORTED_LANG.includes(lang) ? lang : null;
}

function detectLang() {
  return getLangFromURL() || localStorage.getItem("lang") || DEFAULT_LANG;
}

async function loadLocale(lang) {
  try {
    const res = await fetch(`${LOCALES_PATH}${lang}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Locale ${lang} non trovato`);
    return await res.json();
  } catch (err) {
    console.error("[i18n] loadLocale:", err);
    return {};
  }
}

function setTextOrAttr(el, key, value) {
  if (!value) return;
  // Placeholder/i18n attributi
  const phKey = el.getAttribute("data-i18n-placeholder");
  if (phKey && key === phKey) {
    el.setAttribute("placeholder", value);
    return;
  }
  // default: textContent
  el.textContent = value;
}

function getNested(obj, path) {
  return path.split(".").reduce((acc, k) => acc?.[k], obj);
}

function applyTranslations(root) {
  root = root || document;
  document.documentElement.lang = currentLang;

  // Elementi con testo
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const value = getNested(translations, key);
    if (value) setTextOrAttr(el, key, value);
  });

  // Placeholder
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    const value = getNested(translations, key);
    if (value) el.setAttribute("placeholder", value);
  });

  // Meta description e title (solo dal documento completo)
  if (root === document) {
    const metaDesc = document.querySelector('meta[name="description"]');
    const desc = getNested(translations, "page.description");
    if (metaDesc && desc) metaDesc.setAttribute("content", desc);

    const title = getNested(translations, "page.title");
    if (title) document.title = title;
  }
}

// Esposta globalmente per essere richiamata dal router dopo ogni navigazione
window.applyTranslations = applyTranslations;

function updateURLParam(lang) {
  const url = new URL(location.href);
  url.searchParams.set("lang", lang);
  history.replaceState(null, "", url.toString());
}

async function setLanguage(lang) {
  if (!SUPPORTED_LANG.includes(lang)) lang = DEFAULT_LANG;
  currentLang = lang;
  localStorage.setItem("lang", lang);
  translations = await loadLocale(lang);
  applyTranslations();
  updateURLParam(lang);
}

// Inizializza switcher se presente (supporta sia [data-lang] che dropdown Bootstrap)
function setupLangSwitcher() {
  // Esempio: <a data-lang="it">Italiano</a>
  document.querySelectorAll("[data-lang]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const lang = a.getAttribute("data-lang");
      setLanguage(lang);
    });
  });

  // Supporto legacy per id="langMenu"
  const dropdown = document.getElementById("langMenu");
  if (dropdown) {
    dropdown.parentElement
      ?.querySelectorAll(".dropdown-menu [data-lang]")
      .forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          setLanguage(a.getAttribute("data-lang"));
        });
      });
  }
}

// Boot
(async function initI18n() {
  await setLanguage(detectLang());
  setupLangSwitcher();
})();
