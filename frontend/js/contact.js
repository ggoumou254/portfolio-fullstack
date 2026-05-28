/**
 * Modulo contatto con validazione
 * @version 2.1.0
 */
import { CONFIG } from './config.js';
import { showNotification, toggleLoading, validateEmail, sanitizeInput, debounce, debugLog } from './utils.js';

const contactState = {
  isSubmitting: false,
  lastSubmission: null,
  validationErrors: {}
};

let dom = {};

export function initContact() {
  debugLog('info', 'Inizializzazione modulo contatto');
  try {
    setupDOM();
    setupEvents();
  } catch (e) {
    console.error('Errore inizializzazione contatto:', e);
  }
}

function setupDOM() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  dom = {
    form,
    name: document.getElementById('name'),
    email: document.getElementById('email'),
    subject: document.getElementById('subject'),
    message: document.getElementById('message'),
    submitBtn: document.getElementById('contact-submit'),
    successDiv: document.getElementById('contact-success'),
    successMsg: document.getElementById('contact-success-message'),
    errorDiv: document.getElementById('contact-error'),
    errorMsg: document.getElementById('contact-error-message'),
    charCount: document.getElementById('message-character-count'),
  };

  updateCharCount();
}

function setupEvents() {
  if (!dom.form) return;

  dom.form.addEventListener('submit', handleSubmit);

  ['name', 'email', 'subject', 'message'].forEach(f => {
    dom[f]?.addEventListener('blur', () => validateField(f));
    dom[f]?.addEventListener('input', () => clearFieldError(f));
  });

  dom.message?.addEventListener('input', updateCharCount);
}

function updateCharCount() {
  if (!dom.message || !dom.charCount) return;
  const len = dom.message.value.length;
  const max = dom.message.getAttribute('maxlength') || 1000;
  dom.charCount.textContent = `${len}/${max}`;
  dom.charCount.className = 'form-text ' + (len / max > 0.9 ? 'text-danger' : len / max > 0.75 ? 'text-warning' : '');
}

async function handleSubmit(e) {
  e.preventDefault();
  if (contactState.isSubmitting) { showNotification('Invio gia in corso...', 'warning'); return; }
  if (!validateAll()) return;
  await submitForm();
}

function validateAll() {
  contactState.validationErrors = {};
  let ok = true;

  const name = dom.name?.value.trim() || '';
  if (!name) { contactState.validationErrors.name = 'Il nome e obbligatorio'; ok = false; }
  else if (name.length < 2) { contactState.validationErrors.name = 'Minimo 2 caratteri'; ok = false; }

  const email = dom.email?.value.trim() || '';
  if (!email) { contactState.validationErrors.email = 'L email e obbligatoria'; ok = false; }
  else if (!validateEmail(email)) { contactState.validationErrors.email = 'Email non valida'; ok = false; }

  const msg = dom.message?.value.trim() || '';
  if (!msg) { contactState.validationErrors.message = 'Il messaggio e obbligatorio'; ok = false; }
  else if (msg.length < 10) { contactState.validationErrors.message = 'Minimo 10 caratteri'; ok = false; }
  else if (msg.length > 1000) { contactState.validationErrors.message = 'Massimo 1000 caratteri'; ok = false; }

  Object.keys(contactState.validationErrors).forEach(f => updateFieldUI(f, false));
  if (!ok) showNotification('Correggi i campi evidenziati', 'error');
  return ok;
}

function validateField(fieldName) {
  const v = dom[fieldName]?.value.trim() || '';
  let ok = true;
  delete contactState.validationErrors[fieldName];

  if (fieldName === 'name') {
    if (!v) { contactState.validationErrors.name = 'Il nome e obbligatorio'; ok = false; }
    else if (v.length < 2) { contactState.validationErrors.name = 'Minimo 2 caratteri'; ok = false; }
  }
  if (fieldName === 'email') {
    if (!v) { contactState.validationErrors.email = 'L email e obbligatoria'; ok = false; }
    else if (!validateEmail(v)) { contactState.validationErrors.email = 'Email non valida'; ok = false; }
  }
  if (fieldName === 'message') {
    if (!v) { contactState.validationErrors.message = 'Il messaggio e obbligatorio'; ok = false; }
    else if (v.length < 10) { contactState.validationErrors.message = 'Minimo 10 caratteri'; ok = false; }
    else if (v.length > 1000) { contactState.validationErrors.message = 'Massimo 1000 caratteri'; ok = false; }
  }

  updateFieldUI(fieldName, ok);
  return ok;
}

function updateFieldUI(fieldName, ok) {
  const field = dom[fieldName];
  const errEl = document.getElementById(`${fieldName}-error`);
  if (!field) return;
  field.classList.toggle('is-valid', ok);
  field.classList.toggle('is-invalid', !ok);
  if (errEl) {
    errEl.textContent = ok ? '' : (contactState.validationErrors[fieldName] || '');
    errEl.style.display = ok ? 'none' : 'block';
  }
}

function clearFieldError(fieldName) {
  dom[fieldName]?.classList.remove('is-invalid');
  const errEl = document.getElementById(`${fieldName}-error`);
  if (errEl) errEl.style.display = 'none';
  delete contactState.validationErrors[fieldName];
}

async function submitForm() {
  contactState.isSubmitting = true;
  toggleLoading(dom.submitBtn, true, 'Invio in corso...');

  try {
    const payload = {
      name: sanitizeInput(dom.name.value.trim()),
      email: sanitizeInput(dom.email.value.trim()),
      subject: sanitizeInput(dom.subject?.value.trim() || 'Messaggio dal portfolio'),
      message: sanitizeInput(dom.message.value.trim()),
      source: 'portfolio_website'
    };

    const res = await fetch(CONFIG.apiUrl(CONFIG.ENDPOINTS.CONTACT.SEND), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Errore HTTP ${res.status}`);

    // Successo
    if (dom.successMsg) dom.successMsg.textContent = data.message || 'Messaggio inviato con successo!';
    dom.successDiv?.classList.remove('d-none');
    dom.errorDiv?.classList.add('d-none');
    dom.form.reset();
    updateCharCount();
    showNotification('Messaggio inviato!', 'success');
    contactState.lastSubmission = new Date();

  } catch (err) {
    console.error('Errore invio form contatto:', err);

    let msg = err.message || 'Errore durante l invio';
    if (/network|failed to fetch/i.test(msg)) msg = 'Errore di connessione. Controlla la tua rete.';
    if (msg.includes('429')) msg = 'Troppi tentativi. Riprova tra qualche minuto.';
    if (msg.includes('500')) msg = 'Errore server. Riprova piu tardi.';

    if (dom.errorMsg) dom.errorMsg.textContent = msg;
    dom.errorDiv?.classList.remove('d-none');
    dom.successDiv?.classList.add('d-none');
    showNotification(msg, 'error');

  } finally {
    contactState.isSubmitting = false;
    toggleLoading(dom.submitBtn, false, 'Invia il messaggio');
  }
}