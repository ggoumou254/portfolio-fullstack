// frontend/js/contact.js
const API_BASE =
  window.__API_BASE__ ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "");

export function initContact() {
  const form = document.getElementById("contactForm");
  if (!form) return; // non siamo nella pagina contact

  const msg = document.getElementById("msg-success");
  const btn = document.getElementById("contact-submit");

  const setMsg = (text, type = "") => {
    if (!msg) return;
    msg.textContent = text || "";
    msg.className = `mt-3 ${type ? `text-${type}` : ""}`;
  };

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name")?.value?.trim();
    const email = document.getElementById("email")?.value?.trim();
    const message = document.getElementById("message")?.value?.trim();

    // validazione semplice
    if (!name || !email || !message) {
      setMsg("Per favore compila tutti i campi.", "danger");
      return;
    }
    if (!emailRe.test(email)) {
      setMsg("Inserisci un'email valida.", "danger");
      return;
    }

    // UI loading
    if (btn) {
      btn.disabled = true;
      btn.dataset._txt ??= btn.textContent;
      btn.textContent = "Invio…";
    }
    setMsg("");

    try {
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.message || `Errore durante l'invio (${res.status})`);
      }

      setMsg(data?.message || "Messaggio inviato con successo!", "success");
      form.reset();
    } catch (err) {
      const hint =
        err instanceof TypeError
          ? " (controlla che il backend consenta CORS da http://127.0.0.1:5502)"
          : "";
      setMsg((err?.message || "Errore di rete.") + hint, "danger");
      console.error("Contact error:", err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset._txt || "Invia";
      }
    }
  });
}
