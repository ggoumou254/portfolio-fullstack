// frontend/js/newsletter.js
const API_BASE =
  window.__API_BASE__ ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "");

const NEWSLETTER_ENDPOINT = "/api/newsletter/subscribe";

export function initNewsletter() {
  const form = document.getElementById("newsletterForm");
  if (!form) return;

  const emailEl = document.getElementById("subEmail");
  const msgEl = document.getElementById("subMsg");
  const btn = document.getElementById("newsletter-submit");

  // === campi anti-spam (honeypot + timing) ===
  let websiteEl = form.querySelector('input[name="website"]');
  if (!websiteEl) {
    websiteEl = document.createElement("input");
    websiteEl.type = "text";
    websiteEl.name = "website";
    websiteEl.autocomplete = "off";
    websiteEl.tabIndex = -1;
    websiteEl.style.position = "absolute";
    websiteEl.style.left = "-9999px";
    websiteEl.style.opacity = "0";
    // Importante: lascialo VUOTO
    websiteEl.value = "";
    form.appendChild(websiteEl);
  } else {
    // se esiste già ed è stato riempito da un autofill, svuotiamolo
    websiteEl.value = "";
  }

  let startedAtEl = form.querySelector('input[name="startedAt"]');
  if (!startedAtEl) {
    startedAtEl = document.createElement("input");
    startedAtEl.type = "hidden";
    startedAtEl.name = "startedAt";
    form.appendChild(startedAtEl);
  }
  const setStartedAtOnce = () => {
    if (!startedAtEl.value) startedAtEl.value = String(Date.now());
  };
  ["focusin", "mousemove", "keydown", "touchstart"].forEach((evt) =>
    document.addEventListener(evt, setStartedAtOnce, { once: true, passive: true })
  );

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
      // prepara payload; NON mandiamo 'website' se è vuoto
      const payload = {
        email,
        source: "website",
      };
      if (websiteEl.value) payload.website = websiteEl.value;
      if (startedAtEl.value) payload.startedAt = startedAtEl.value;

      const res = await fetch(`${API_BASE}${NEWSLETTER_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const already = data?.already === true || data?.code === "ALREADY_SUBSCRIBED";
        setMsg(
          already ? "Sei già iscritto alla newsletter ✅" : (data?.message || "Iscrizione completata ✅"),
          "success"
        );
        if (!already) form.reset();
        return;
      }

      // Errori frequenti
      let uiMsg = "Errore durante l'iscrizione.";
      const code = data?.code;
      if (code === "VALIDATION_ERROR") {
        uiMsg = "Dati non validi. Controlla l'email e riprova.";
      } else if (code === "BOT_HONEYPOT" || code === "BOT_TIMING_BLOCK") {
        uiMsg = "Invio non valido. Riprova tra qualche secondo.";
      } else if (code === "RATE_LIMIT_EXCEEDED") {
        uiMsg = "Troppe richieste. Riprova tra qualche minuto.";
      } else if (code === "SERVER_ERROR") {
        uiMsg = "Errore del server. Riprova più tardi.";
      } else if (res.status === 409) {
        uiMsg = "Sei già iscritto alla newsletter.";
      } else {
        uiMsg = data?.message || `${uiMsg} (status ${res.status})`;
      }

      throw new Error(uiMsg);
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

// Disiscrizione veloce
(() => {
  const btnUnsub = document.getElementById("newsletter-unsubscribe");
  const emailEl = document.getElementById("subEmail");
  const msg = (t, type="") => {
    const el = document.getElementById("subMsg");
    if (!el) return;
    el.textContent = t || "";
    el.className = `mt-3 ${type ? `text-${type}` : ""}`;
  };
  if (!btnUnsub) return;

  btnUnsub.addEventListener("click", async () => {
    const email = (emailEl?.value || "").trim();
    if (!email) {
      msg("Inserisci prima l'email nel campo sopra.", "danger");
      emailEl?.focus();
      return;
    }
    btnUnsub.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/api/newsletter/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Errore disiscrizione");
      msg("Sei stato disiscritto. 👋", "success");
    } catch (e) {
      msg(e.message || "Errore di rete", "danger");
    } finally {
      btnUnsub.disabled = false;
    }
  });
})();
