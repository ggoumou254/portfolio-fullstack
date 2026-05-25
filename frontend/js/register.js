/**
 * Modulo registrazione
 * @version 2.1.0
 */
import { CONFIG } from './config.js';
import { showNotification, toggleLoading, validateEmail, sanitizeInput } from './utils.js';

const state = { isSubmitting: false, errors: {} };
let dom = {};

export function initRegister() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  dom = {
    form,
    name: document.getElementById('name'),
    email: document.getElementById('email'),
    password: document.getElementById('password'),
    password2: document.getElementById('password2'),
    submitBtn: document.getElementById('register-submit'),
    successDiv: document.getElementById('register-success'),
    errorDiv: document.getElementById('register-error'),
    pwdToggle: document.getElementById('toggle-password'),
  };

  setupEvents();
  setTimeout(() => dom.name?.focus(), 200);
}

function setupEvents() {
  dom.form.addEventListener('submit', handleSubmit);

  dom.pwdToggle?.addEventListener('click', () => {
    const visible = dom.password.type === 'text';
    dom.password.type = visible ? 'password' : 'text';
    dom.password2.type = visible ? 'password' : 'text';
    const icon = dom.pwdToggle.querySelector('i');
    if (icon) icon.className = visible ? 'bi bi-eye' : 'bi bi-eye-slash';
  });

  ['name', 'email', 'password', 'password2'].forEach(f => {
    dom[f]?.addEventListener('blur', () => validateField(f));
    dom[f]?.addEventListener('input', () => clearErr(f));
  });
}

async function handleSubmit(e) {
  e.preventDefault();
  if (state.isSubmitting) { showNotification('Registrazione gia in corso...', 'warning'); return; }
  if (!validateAll()) return;
  await submitRegister();
}

function validateAll() {
  state.errors = {};
  let ok = true;

  const name = dom.name?.value.trim() || '';
  if (!name) { state.errors.name = 'Il nome e obbligatorio'; ok = false; }
  else if (name.length < 2) { state.errors.name = 'Minimo 2 caratteri'; ok = false; }

  const email = dom.email?.value.trim() || '';
  if (!email) { state.errors.email = 'L email e obbligatoria'; ok = false; }
  else if (!validateEmail(email)) { state.errors.email = 'Email non valida'; ok = false; }

  const pwd = dom.password?.value || '';
  if (!pwd) { state.errors.password = 'La password e obbligatoria'; ok = false; }
  else if (pwd.length < 8) { state.errors.password = 'Minimo 8 caratteri'; ok = false; }

  const pwd2 = dom.password2?.value || '';
  if (!pwd2) { state.errors.password2 = 'Conferma la password'; ok = false; }
  else if (pwd2 !== pwd) { state.errors.password2 = 'Le password non coincidono'; ok = false; }

  Object.keys(state.errors).forEach(f => setInvalid(f, state.errors[f]));
  if (!ok) showNotification('Correggi i campi evidenziati', 'error');
  return ok;
}

function validateField(f) {
  const v = dom[f]?.value.trim() || '';
  let err = null;

  if (f === 'name') {
    if (!v) err = 'Il nome e obbligatorio';
    else if (v.length < 2) err = 'Minimo 2 caratteri';
  }
  if (f === 'email') {
    if (!v) err = 'L email e obbligatoria';
    else if (!validateEmail(v)) err = 'Email non valida';
  }
  if (f === 'password') {
    if (!v) err = 'La password e obbligatoria';
    else if (v.length < 8) err = 'Minimo 8 caratteri';
  }
  if (f === 'password2') {
    const pwd = dom.password?.value || '';
    if (!v) err = 'Conferma la password';
    else if (v !== pwd) err = 'Le password non coincidono';
  }

  if (err) { state.errors[f] = err; setInvalid(f, err); }
  else { delete state.errors[f]; clearErr(f); }
}

function setInvalid(f, msg) {
  dom[f]?.classList.add('is-invalid');
  const el = document.getElementById(`${f}-error`);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function clearErr(f) {
  dom[f]?.classList.remove('is-invalid');
  const el = document.getElementById(`${f}-error`);
  if (el) { el.textContent = ''; el.style.display = 'none'; }
  delete state.errors[f];
}

async function submitRegister() {
  state.isSubmitting = true;
  toggleLoading(dom.submitBtn, true, 'Registrazione...');

  try {
    const payload = {
      name: sanitizeInput(dom.name.value.trim()),
      email: sanitizeInput(dom.email.value.trim().toLowerCase()),
      password: dom.password.value,
      source: 'portfolio_website'
    };

    const res = await fetch(CONFIG.apiUrl(CONFIG.ENDPOINTS.AUTH.REGISTER), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      let msg = data.message || `Errore HTTP ${res.status}`;
      if (res.status === 409) msg = 'Un account con questa email esiste gia.';
      if (res.status === 429) msg = 'Troppi tentativi. Riprova piu tardi.';
      throw new Error(msg);
    }

    const successMsg = data.message || 'Registrazione completata! Reindirizzamento al login...';
    if (dom.successDiv) { dom.successDiv.textContent = successMsg; dom.successDiv.classList.remove('d-none'); }
    dom.errorDiv?.classList.add('d-none');
    dom.form.reset();
    showNotification('Registrazione completata!', 'success');
    setTimeout(() => { window.location.hash = 'login'; }, 2000);

  } catch (err) {
    const msg = /network|failed to fetch/i.test(err.message)
      ? 'Errore di connessione. Controlla la rete.'
      : err.message || 'Errore durante la registrazione.';

    if (dom.errorDiv) { dom.errorDiv.textContent = msg; dom.errorDiv.classList.remove('d-none'); }
    dom.successDiv?.classList.add('d-none');
    showNotification(msg, 'error');

  } finally {
    state.isSubmitting = false;
    toggleLoading(dom.submitBtn, false, 'Registrati');
  }
}