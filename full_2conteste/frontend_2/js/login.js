// frontend/js/contact.js

export function initContact() {
  const form = document.getElementById("contactForm");
  if (!form) return;

  const btn = document.getElementById("contact-submit");
  const spin = btn?.querySelector(".spinner-border");
  const ok = document.getElementById("contact-success");
  const ko = document.getElementById("contact-error");

  function setLoading(v) {
    btn?.toggleAttribute("disabled", v);
    spin?.classList.toggle("d-none", !v);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // bootstrap validation
    if (!form.checkValidity()) {
      e.stopPropagation();
      form.classList.add("was-validated");
      return;
    }

    // honeypot
    if (document.getElementById("company")?.value) return;

    setLoading(true);
    ok?.classList.add("d-none");
    ko?.classList.add("d-none");

    try {
      const payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        message: form.message.value.trim(),
      };

      const res = await fetch(`${window.__API_BASE__}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Errore invio (${res.status})`);
      ok.textContent = "Messaggio inviato con successo!";
      ok.classList.remove("d-none");
      form.reset();
      form.classList.remove("was-validated");
    } catch (err) {
      ko.textContent = err.message || "Errore imprevisto. Riprova.";
      ko.classList.remove("d-none");
    } finally {
      setLoading(false);
    }
  });
}
