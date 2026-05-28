// frontend/js/router.js
import { getToken } from "./auth.js";

const outlet = document.getElementById("app");
const DEFAULT_PAGE = "home";

const VALID_PAGES = new Set([
  "home", "about", "projects", "contact",
  "newsletter", "stats", "login", "register", "admin", "ai"
]);
const PROTECTED = new Set(["admin"]);

const ROUTE_TITLES = {
  home: "Home – RG Portfolio",
  about: "Chi sono – RG Portfolio",
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

/* -----------------------------------------------
   PAGE MODULES — lazy import + init
----------------------------------------------- */
const PAGE_MODULES = {
  home: () => import("./home.js").then(m => m.initHome?.()).catch(console.error),
  about: () => import("./about.js").then(m => m.initAbout?.()).catch(console.error),
  projects: () => import("./project.js").then(m => m.initProjects?.()).catch(console.error),
  contact: () => import("./contact.js").then(m => m.initContact?.()).catch(console.error),
  newsletter: () => import("./newsletter.js").then(m => m.initNewsletter?.()).catch(console.error),
  stats: () => import("./stats.js").then(m => m.initStats?.()).catch(console.error),
  login: () => import("./login.js").then(m => m.initLogin?.()).catch(console.error),
  register: () => import("./register.js").then(m => m.initRegister?.()).catch(console.error),
  ai: () => import("./ai.js").then(m => m.initAI?.()).catch(console.error),
};

/* -----------------------------------------------
   Utils auth
----------------------------------------------- */
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

/* -----------------------------------------------
   sanitizeFragment
   - Per l'admin NON rimuove onclick (servono per __adminEdit/__adminDelete)
   - Rimuove solo script inline e style (XSS)
   - NON rimuove stili inline sugli elementi
----------------------------------------------- */
function sanitizeFragment(html, { isAdmin = false } = {}) {
  // rimuovi solo blocchi <script> e <style>
  let pre = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  const parser = new DOMParser();
  const doc = parser.parseFromString(pre, "text/html");

  // porta nel <head> i CSS locali del frammento (evita duplicati)
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    try {
      const href = link.getAttribute("href") || "";
      const abs = new URL(href, location.origin).href;
      const already = [...document.head.querySelectorAll('link[rel="stylesheet"]')]
        .some(l => l.href === abs);
      if (!already) document.head.appendChild(link.cloneNode(true));
      link.remove();
    } catch { }
  });

  // rimuovi handler inline SOLO se non siamo in admin
  if (!isAdmin) {
    doc.querySelectorAll("*").forEach(el => {
      for (const attr of [...el.attributes]) {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      }
    });
  }

  const frag = document.createDocumentFragment();
  [...doc.body.childNodes].forEach(node => frag.appendChild(node));
  return frag;
}

/* -----------------------------------------------
   Render helpers
----------------------------------------------- */
function renderLoading() {
  outlet.replaceChildren();
  const c = document.createElement("div");
  c.className = "container py-5 text-center";
  c.innerHTML = `
    <div class="rg-page-loader">
      <div class="rg-page-loader__inner">
        <div class="rg-spinner"></div>
        <p class="rg-page-loader__text">Caricamento…</p>
      </div>
    </div>`;
  outlet.appendChild(c);
}

function errorBlock(title, message) {
  const s = document.createElement("section");
  s.className = "container py-5";
  s.innerHTML = `
    <div class="rg-alert rg-alert--error" role="alert">
      <i class="bi bi-exclamation-triangle"></i>
      <div><h2 class="h5 mb-2">${title}</h2><p class="mb-0"></p></div>
    </div>`;
  s.querySelector("p").textContent = message;
  return s;
}

function afterInjectEnhance() {
  try { window.hljs?.highlightAll(); } catch { }
  outlet.setAttribute("tabindex", "-1");
  outlet.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "auto" });
  window.dispatchEvent(new Event("routeChanged"));
}

function injectPage(html, opts = {}) {
  const frag = sanitizeFragment(html, opts);
  const wrapper = document.createElement("div");
  wrapper.className = "fade-in";
  wrapper.appendChild(frag);
  outlet.replaceChildren(wrapper);
  afterInjectEnhance();
}

function setPageTitle(page) {
  document.title = ROUTE_TITLES[page] || "RG Portfolio";
}

function highlightActiveLink(page) {
  document.querySelectorAll("a[data-page]").forEach(a => {
    const active = a.dataset.page === page;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

/* -----------------------------------------------
   Fetch frammenti con cache
----------------------------------------------- */
async function fetchPageFragment(page, { noStore = false } = {}) {
  const key = `page:${page}`;
  const now = Date.now();

  if (!noStore && FRAGMENT_CACHE.has(key)) {
    const cached = FRAGMENT_CACHE.get(key);
    if (now - cached.t < CACHE_TTL_MS) return cached.html;
    FRAGMENT_CACHE.delete(key);
  }

  const url = `./page/${page}.html`;
  const res = await fetch(url, {
    cache: noStore ? "no-store" : (["login", "register"].includes(page) ? "no-store" : "no-cache"),
    headers: { "Accept": "text/html" }
  });

  if (!res.ok) throw new Error(`Pagina "${page}" non trovata (${res.status})`);
  const html = await res.text();
  if (!noStore) FRAGMENT_CACHE.set(key, { t: now, html });
  return html;
}

/* -----------------------------------------------
   Loader pagine
----------------------------------------------- */
async function loadGenericPage(page) {
  const html = await fetchPageFragment(page);
  injectPage(html);
  await PAGE_MODULES[page]?.();
  highlightActiveLink(page);
  setPageTitle(page);
}

async function loadAdminPage() {
  const html = await fetchPageFragment("admin", { noStore: true });
  // ✅ isAdmin: true → mantieni onclick per __adminEdit/__adminDelete
  injectPage(html, { isAdmin: true });

  try {
    const mod = await import("./admin.js");
    if (typeof mod.initAdmin === "function") await mod.initAdmin();
  } catch (err) {
    console.error("Errore caricamento admin.js:", err);
    outlet.querySelector("#admin-root")?.replaceWith(
      errorBlock("Errore", "Impossibile caricare il pannello admin.")
    );
  }

  highlightActiveLink("admin");
  setPageTitle("admin");
}

/* -----------------------------------------------
   Routing
----------------------------------------------- */
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
        outlet.replaceChildren(errorBlock("403", "Accesso negato."));
        highlightActiveLink("home");
        setPageTitle("home");
        return;
      }
      await loadAdminPage();
      return;
    }

    await loadGenericPage(page);
  } catch (err) {
    outlet.replaceChildren(errorBlock("Errore", err.message || "Impossibile caricare la pagina."));
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

/* -----------------------------------------------
   Prefetch su hover
----------------------------------------------- */
let prefetchTimer = null;
document.addEventListener("mouseover", e => {
  const a = e.target.closest("a[data-page]");
  if (!a || !navigator.onLine) return;
  const page = a.dataset.page;
  if (!page || page === "admin" || page === currentPage || !VALID_PAGES.has(page)) return;
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    if (!FRAGMENT_CACHE.has(`page:${page}`)) fetchPageFragment(page).catch(() => { });
  }, 120);
});

/* -----------------------------------------------
   Event wiring
----------------------------------------------- */
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-page]");
  if (!a) return;
  e.preventDefault();
  const page = a.dataset.page;
  if (!page || page === currentPage) return;
  location.hash = page;
});

window.addEventListener("hashchange", handleHashChange);
window.addEventListener("DOMContentLoaded", handleHashChange);