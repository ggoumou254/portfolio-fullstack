//register.js
const API_BASE =
  window.__API_BASE__ ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "");

function $(sel, root = document) { return root.querySelector(sel); }

function setStatus(el, msg, type = "danger") {
  if (!el) return;
  el.textContent = msg || "";
  el.className = msg ? `alert alert-${type} mt-2` : "";
}

function toggleLoading(btn, on) {
  if (!btn) return;
  btn.disabled = !!on;
  btn.dataset.originalText ??= btn.textContent;
  btn.textContent = on ? "Invio..." : btn.dataset.originalText;
}

// validazione base
function validate({ name, email, password }) {
  const errors = {};
  if (!name || name.trim().length < 2) errors.name = "Il nome deve avere almeno 2 caratteri.";
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email || "")) errors.email = "Inserisci un'email valida.";
  if (!password || password.length < 8) errors.password = "La password deve avere almeno 8 caratteri.";
  return errors;
}

export function initRegister() {
  const form = $("#registerForm");
  if (!form) return;

  const nameEl = $("#name", form);
  const emailEl = $("#email", form);
  const passEl = $("#password", form);
  const errorBox = $("#register-error", form) || $("#register-error");
  const btn = $("#register-submit", form) || form.querySelector("[type=submit]");

  setStatus(errorBox, "");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      name: nameEl?.value?.trim(),
      email: emailEl?.value?.trim(),
      password: passEl?.value || "",
    };

    const errs = validate(payload);
    if (Object.keys(errs).length) {
      const first = Object.values(errs)[0];
      setStatus(errorBox, first, "warning");
      return;
    }

    toggleLoading(btn, true);
    setStatus(errorBox, "");

    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data = null;
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        const msg = data?.message || data?.error || `Registrazione fallita (${res.status})`;
        throw new Error(msg);
      }

      // Registrazione completata, tutti i nuovi utenti sono user normali
      setStatus(errorBox, "Registrazione completata!", "success");
      location.hash = "login"; // rimanda al login
    } catch (err) {
      const isCors = err instanceof TypeError;
      const hint = isCors ? " (verifica CORS su http://127.0.0.1:5502)" : "";
      setStatus(errorBox, `Errore durante la registrazione${hint}: ${err.message}`, "danger");
    } finally {
      toggleLoading(btn, false);
    }
  });

  // mostra/nascondi password
  const toggle = $("#toggle-password", form);
  if (toggle && passEl) {
    toggle.addEventListener("click", () => {
      const t = passEl.getAttribute("type") === "password" ? "text" : "password";
      passEl.setAttribute("type", t);
      toggle.textContent = t === "password" ? "Mostra" : "Nascondi";
    });
  }
}
