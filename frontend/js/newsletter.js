/**
 * Modulo newsletter
 * @version 2.1.0
 */
import { CONFIG } from './config.js';

export function initNewsletter() {
  const form = document.getElementById('newsletterForm');
  if (!form) return;

  const emailEl = document.getElementById('subEmail');
  const msgEl = document.getElementById('subMsg');
  const btn = document.getElementById('newsletter-submit');
  const unsubBtn = document.getElementById('newsletter-unsubscribe');

  // honeypot
  let websiteEl = form.querySelector('input[name="website"]');
  if (websiteEl) websiteEl.value = '';

  // timing
  let startedAtEl = form.querySelector('input[name="startedAt"]');
  if (startedAtEl && !startedAtEl.value) {
    const setTs = () => { if (!startedAtEl.value) startedAtEl.value = String(Date.now()); };
    ['focusin', 'mousemove', 'keydown', 'touchstart'].forEach(ev =>
      document.addEventListener(ev, setTs, { once: true, passive: true })
    );
  }

  const setMsg = (text, type = '') => {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.className = `mt-3 ${type ? `text-${type}` : ''}`;
  };

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('');

    const email = emailEl?.value?.trim() || '';
    if (!email || !emailRe.test(email)) {
      setMsg('Inserisci un email valida.', 'danger');
      emailEl?.focus();
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Iscrizione...'; }

    try {
      const payload = { email, source: 'website' };
      if (websiteEl?.value) payload.website = websiteEl.value;
      if (startedAtEl?.value) payload.startedAt = startedAtEl.value;

      const url = CONFIG.apiUrl('api/newsletter/subscribe');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const already = data?.already === true || data?.code === 'ALREADY_SUBSCRIBED';
        setMsg(already ? 'Sei gia iscritto alla newsletter.' : (data?.message || 'Iscrizione completata!'), 'success');
        if (!already) form.reset();
        return;
      }

      const code = data?.code;
      let uiMsg = 'Errore durante l iscrizione.';
      if (code === 'VALIDATION_ERROR') uiMsg = 'Dati non validi. Controlla l email e riprova.';
      else if (code === 'BOT_HONEYPOT' || code === 'BOT_TIMING_BLOCK') uiMsg = 'Invio non valido. Riprova tra qualche secondo.';
      else if (code === 'RATE_LIMIT_EXCEEDED') uiMsg = 'Troppe richieste. Riprova tra qualche minuto.';
      else if (code === 'SERVER_ERROR') uiMsg = 'Errore del server. Riprova piu tardi.';
      else if (res.status === 409) uiMsg = 'Sei gia iscritto alla newsletter.';
      else uiMsg = data?.message || uiMsg;

      throw new Error(uiMsg);

    } catch (err) {
      const hint = err instanceof TypeError ? ' (controlla la connessione)' : '';
      setMsg((err?.message || 'Errore di rete') + hint, 'danger');
      console.error('Newsletter error:', err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Iscriviti'; }
    }
  });

  // Disiscrizione
  unsubBtn?.addEventListener('click', async () => {
    const email = emailEl?.value?.trim() || '';
    if (!email) { setMsg('Inserisci prima l email.', 'danger'); emailEl?.focus(); return; }

    unsubBtn.disabled = true;
    try {
      const res = await fetch(CONFIG.apiUrl('api/newsletter/unsubscribe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Errore disiscrizione');
      setMsg('Sei stato disiscritto.', 'success');
    } catch (e) {
      setMsg(e.message || 'Errore di rete', 'danger');
    } finally {
      unsubBtn.disabled = false;
    }
  });
}