// frontend/js/newsletter.js
const API_BASE =
  window.__API_BASE__ ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "");

// Scegli un endpoint e tienilo anche nel backend (coerenza!)
const NEWSLETTER_ENDPOINT = "/api/newsletter/subscribe";
// Se preferisci /api/newsletter:
// const NEWSLETTER_ENDPOINT = "/api/newsletter";

export function initNewsletter() {
  const form = document.getElementById("newsletterForm");
  if (!form) return; // non siamo nella pagina newsletter

  const emailEl = document.getElementById("subEmail");
  const msgEl = document.getElementById("subMsg");
  const btn = document.getElementById("newsletter-submit");

  const setMsg = (text, type = "") => {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.className = `mt-3 ${type ? `text-${type}` : ""}`;
  };

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");

    const email = emailEl?.value?.trim() || "";
    if (!email || !emailRe.test(email)) {
      setMsg("Inserisci un'email valida.", "danger");
      emailEl?.focus();
      return;
    }

    // UI: loading
    if (btn) {
      btn.disabled = true;
      btn.dataset._txt ??= btn.textContent;
      btn.textContent = "Iscrizione…";
    }

    try {
      const res = await fetch(`${API_BASE}${NEWSLETTER_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Gestione classica: 409 già iscritto, 400 form errato, ecc.
        const msg =
          data?.message ||
          (res.status === 409
            ? "Sei già iscritto alla newsletter."
            : `Errore durante l'iscrizione (${res.status})`);
        throw new Error(msg);
      }

      setMsg(data?.message || "Iscrizione avvenuta con successo!", "success");
      form.reset();
    } catch (err) {
      const hint =
        err instanceof TypeError
          ? " (controlla la connessione o il CORS del backend)"
          : "";
      setMsg((err?.message || "Errore di rete") + hint, "danger");
      console.error("Newsletter error:", err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset._txt || "Iscriviti";
      }
    }
  });
}
