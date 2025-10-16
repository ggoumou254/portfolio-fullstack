// frontend/js/router.js
// Router a frammenti HTML, CSP-safe, con protezione semplice per l’area Admin

import { getToken } from "./auth.js";

const outlet = document.getElementById("app");
const DEFAULT_PAGE = "home";

const VALID_PAGES = new Set(["home","projects","contact","newsletter","stats","login","register","admin","ai"]);
const PROTECTED   = new Set(["admin"]);

const ROUTE_TITLES = {
  home: "Home – RG Portfolio",
  projects: "Progetti – RG Portfolio",
  contact: "Contatti – RG Portfolio",
  newsletter: "Newsletter – RG Portfolio",
  stats: "Statistiche – RG Portfolio",
  login: "Login – RG Portfolio",
  register: "Registrati – RG Portfolio",
  admin: "Admin – RG Portfolio",
  ai: "AI – RG Portfolio"
};

let currentPage = null;

const FRAGMENT_CACHE = new Map();
const CACHE_TTL_MS = 2 * 60 * 1000;

/* =========================
   Lazy init per pagina
========================= */
const PAGE_MODULES = {
  home:       () => import("./home.js").then(m => m.initHome?.()).catch(() => {}),
  projects:   () => import("./project.js").then(m => m.initProjects?.()).catch(() => {}),
  contact:    () => import("./contact.js").then(m => m.initContact?.()).catch(() => {}),
  newsletter: () => import("./newsletter.js").then(m => m.initNewsletter?.()).catch(() => {}),
  stats:      () => import("./stats.js").then(m => m.initStats?.()).catch(() => {}),
  login:      () => import("./login.js").then(m => m.initLogin?.()).catch(() => {}),
  register:   () => import("./register.js").then(m => m.initRegister?.()).catch(() => {}),
  ai:         () => import("./ai.js").then(m => m.initAI?.()).catch(() => {}),
  // admin: gestito in loadAdminPage()
};

/* =========================
   Utils
========================= */
function getRoleFromToken(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    return payload?.role || (Array.isArray(payload?.roles) ? payload.roles[0] : null) || null;
  } catch { return null; }
}
function isAdmin() {
  const token = getToken?.();
  return !!token && getRoleFromToken(token) === "admin";
}

function sanitizeFragment(html) {
  const pre = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/\sstyle\s*=\s*"(?:[^"\\]|\\.)*"/gi, "")
    .replace(/\sstyle\s*=\s*'(?:[^'\\]|\\.)*'/gi, "");

  const parser = new DOMParser();
  const doc = parser.parseFromString(pre, "text/html");

  // porta nel <head> eventuali CSS locali del frammento (evita duplicati)
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    try {
      const href = link.getAttribute("href") || "";
      const abs = new URL(href, location.origin).href;
      const already = [...document.head.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href === abs);
      if (!already) document.head.appendChild(link.cloneNode(true));
      link.remove();
    } catch {}
  });

  // rimuovi handler inline
  doc.querySelectorAll("*").forEach(el => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
  });

  const frag = document.createDocumentFragment();
  [...doc.body.childNodes].forEach(node => frag.appendChild(node));
  return frag;
}

function renderLoading() {
  outlet.replaceChildren();
  const c = document.createElement("div");
  c.className = "container py-5 text-center";
  c.innerHTML = `
    <div class="spinner-border text-primary" role="status" aria-hidden="true"></div>
    <p class="mt-3 mb-0">Caricamento…</p>`;
  outlet.appendChild(c);
}

function errorBlock(title, message) {
  const section = document.createElement("section");
  section.className = "container py-5";
  section.innerHTML = `
    <div class="alert alert-danger" role="alert">
      <h2 class="h5 mb-2">${title}</h2>
      <p class="mb-0"></p>
    </div>`;
  section.querySelector("p").textContent = message;
  return section;
}

function afterInjectEnhance() {
  // Ricolora snippet codice se highlight.js è presente
  try { window.hljs && window.hljs.highlightAll(); } catch {}
  // Focus & scroll
  outlet.setAttribute("tabindex", "-1");
  outlet.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "auto" });
}

function injectPage(html) {
  const frag = sanitizeFragment(html);
  const wrapper = document.createElement("div");
  wrapper.className = "fade-in";
  wrapper.appendChild(frag);
  outlet.replaceChildren(wrapper);
  afterInjectEnhance();
}

function setPageTitle(page) {
  document.title = ROUTE_TITLES[page] || "RG Portfolio";
}

/* =========================
   Fetch frammenti con cache
========================= */
async function fetchPageFragment(page, { noStore = false } = {}) {
  const key = `page:${page}`;
  const now = Date.now();

  if (!noStore && FRAGMENT_CACHE.has(key)) {
    const cached = FRAGMENT_CACHE.get(key);
    if (now - cached.t < CACHE_TTL_MS) return cached.html;
    FRAGMENT_CACHE.delete(key);
  }

  // path ASSOLUTO: evita problemi di base path
  const url = `/page/${page}.html`;

  const res = await fetch(url, {
    cache: noStore ? "no-store" : (page === "login" || page === "register" ? "no-store" : "no-cache"),
    headers: { "Accept": "text/html" }
  });

  if (!res.ok) throw new Error(`Pagina "${page}" non trovata (${res.status})`);
  const html = await res.text();

  if (!noStore) FRAGMENT_CACHE.set(key, { t: now, html });
  return html;
}

/* =========================
   Loader pagine
========================= */
async function loadGenericPage(page) {
  const html = await fetchPageFragment(page);
  injectPage(html);
  await PAGE_MODULES[page]?.();
  highlightActiveLink(page);
  setPageTitle(page);
}

async function loadAdminPage() {
  const html = await fetchPageFragment("admin", { noStore: true });
  injectPage(html);

  try {
    const adminModule = await import("./admin.js");
    if (typeof adminModule.initAdmin === "function") {
      await adminModule.initAdmin();
    }
  } catch (err) {
    console.error("Errore caricamento admin.js:", err);
    outlet.querySelector("#admin-root")?.replaceWith(
      errorBlock("Erreur", "Erreur chargement du panel admin.")
    );
  }

  highlightActiveLink("admin");
  setPageTitle("admin");
}

/* =========================
   Routing
========================= */
function highlightActiveLink(page) {
  document.querySelectorAll("a[data-page]").forEach(a => {
    const isActive = a.dataset.page === page;
    a.classList.toggle("active", isActive);
    if (isActive) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function resolvePageFromHash() {
  const page = (location.hash || "").replace("#", "").trim() || DEFAULT_PAGE;
  return VALID_PAGES.has(page) ? page : DEFAULT_PAGE;
}

async function loadPage(page) {
  try {
    renderLoading();

    if (page === "admin") {
      const token = getToken?.();
      if (!token) {
        sessionStorage.setItem("redirectAfterLogin", "admin");
        location.hash = "login";
        return;
      }
      if (!isAdmin()) {
        outlet.replaceChildren(
          errorBlock("403", "Accesso negato. Non hai i permessi necessari.")
        );
        highlightActiveLink("home");
        setPageTitle("home");
        return;
      }
      await loadAdminPage();
      return;
    }

    await loadGenericPage(page);

  } catch (err) {
    const section = errorBlock("Errore", err.message || "Impossibile caricare la pagina.");
    outlet.replaceChildren(section);
    highlightActiveLink("home");
    setPageTitle("home");
    console.error(err);
  }
}

function handleHashChange() {
  const page = resolvePageFromHash();
  if (page === currentPage) return;

  if (PROTECTED.has(page) && !getToken?.()) {
    sessionStorage.setItem("redirectAfterLogin", page);
    location.hash = "login";
    return;
  }

  currentPage = page;
  loadPage(page);
}

/* =========================
   Prefetch frammenti su hover
========================= */
let prefetchTimer = null;
document.addEventListener("mouseover", (e) => {
  const a = e.target.closest("a[data-page]");
  if (!a || !navigator.onLine) return;
  const page = a.dataset.page;
  if (!page || page === "admin" || page === currentPage || !VALID_PAGES.has(page)) return;

  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    const key = `page:${page}`;
    if (FRAGMENT_CACHE.has(key)) return;
    fetchPageFragment(page).catch(() => {});
  }, 120);
});

/* =========================
   Event wiring
========================= */
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-page]");
  if (!a) return;
  e.preventDefault();
  const page = a.dataset.page;
  if (!page || page === currentPage) return;
  location.hash = page;
});

window.addEventListener("hashchange", handleHashChange);
window.addEventListener("DOMContentLoaded", handleHashChange);
