// frontend/js/router.js
import { getToken } from "./auth.js"; // guard admin

const APP_ID = "app"; // deve combaciare con index.html
const app = document.getElementById(APP_ID);

const DEFAULT_PAGE = "home";

// Moduli opzionali per eseguire JS dopo l'iniezione della pagina
const PAGE_MODULES = {
  home:      () => import("./home.js").then(m => m.initHome?.()),
  register:  () => import("./register.js").then(m => m.initRegister?.()),
  contact:   () => import("./contact.js").then(m => m.initContact?.()),
  login:     () => import("./auth.js").then(m => m.initLogin?.()),
  admin:     () => import("./admin.js").then(m => m.initAdmin?.()),
  projects:  () => import("./project.js").then(m => m.initProjects?.()),
  newsletter:() => import("./newsletter.js").then(m => m.initNewsletter?.()),
  stats:     () => import("./stats.js").then(m => m.initStats?.()),
};

const VALID_PAGES = new Set([
  "home","register","contact","login","admin","projects","newsletter","stats"
]);

const PROTECTED = new Set(["admin"]);
let currentPage = null;

async function loadPage(page) {
  try {
    app.innerHTML = `<div class="container py-4 text-center">Caricamento…</div>`;

    // Guard per route protette
    if (PROTECTED.has(page) && !getToken?.()) {
      location.hash = "login";
      return;
    }

    const res = await fetch(`./page/${page}.html`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Pagina "${page}" non trovata (${res.status})`);

    const html = await res.text();
    app.innerHTML = `<div class="fade-in">${html}</div>`;

    // Esegui eventuale modulo della pagina
    await PAGE_MODULES[page]?.();

    // Riapplica le traduzioni sul nuovo contenuto iniettato
    window.applyTranslations?.(app);

    highlightActiveLink(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    app.innerHTML = `
      <div class="container py-5">
        <h2 class="text-danger">Errore</h2>
        <p class="mb-0">${err.message}</p>
      </div>`;
  }
}

function highlightActiveLink(page) {
  document.querySelectorAll("nav a[data-page]").forEach(a => {
    const isActive = a.dataset.page === page;
    a.classList.toggle("active", isActive);
    if (isActive) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function resolvePageFromHash() {
  let page = location.hash.replace("#", "").trim() || DEFAULT_PAGE;
  if (!VALID_PAGES.has(page)) page = DEFAULT_PAGE;
  return page;
}

function handleHashChange() {
  const next = resolvePageFromHash();
  if (next === currentPage) return;
  currentPage = next;
  loadPage(next);
}

// Intercetta click su link SPA
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[data-page]');
  if (!a) return;
  e.preventDefault();
  const page = a.dataset.page;
  if (!page || page === currentPage) return;
  location.hash = page;
});

// Bootstrap routing
window.addEventListener("hashchange", handleHashChange);
window.addEventListener("DOMContentLoaded", () => {
  if (!location.hash) location.hash = DEFAULT_PAGE;
  handleHashChange();
});
