/**
 * Modulo login
 * @version 3.2.0
 */
import { login, isAuthenticated, getToken } from './auth.js';
import { showNotification, toggleLoading, validateEmail } from './utils.js';

const state = { isSubmitting: false, errors: {} };
let dom = {};

export function initLogin() {
  // Redirect se gia autenticato
  if (isAuthenticated()) {
    const stored = sessionStorage.getItem('redirectAfterLogin');
    if (stored) { sessionStorage.removeItem('redirectAfterLogin'); window.location.hash = stored; }
    else window.location.hash = 'home';
    return;
  }

  const form = document.getElementById('loginForm');
  if (!form) return;

  dom = {
    form,
    email: document.getElementById('email'),
    password: document.getElementById('password'),
    submitBtn: document.getElementById('login-submit'),
    errorBox: document.getElementById('login-error'),
    errorMsg: document.getElementById('login-error-message'),
    passwordToggle: document.getElementById('toggle-password'),
  };

  setupEvents();

  // Focus automatico
  setTimeout(() => dom.email?.focus(), 200);
}

function setupEvents() {
  dom.form.addEventListener('submit', handleSubmit);

  dom.passwordToggle?.addEventListener('click', () => {
    const visible = dom.password.type === 'text';
    dom.password.type = visible ? 'password' : 'text';
    const icon = dom.passwordToggle.querySelector('i');
    if (icon) icon.className = visible ? 'bi bi-eye' : 'bi bi-eye-slash';
  });

  dom.email?.addEventListener('blur', () => validateField('email'));
  dom.email?.addEventListener('input', () => clearErr('email'));
  dom.password?.addEventListener('blur', () => validateField('password'));
  dom.password?.addEventListener('input', () => clearErr('password'));
}

async function handleSubmit(e) {
  e.preventDefault();
  if (state.isSubmitting) { showNotification('Login gia in corso...', 'warning'); return; }
  hideError();
  if (!validateAll()) return;
  await submitLogin();
}

function validateAll() {
  state.errors = {};
  let ok = true;

  const email = dom.email?.value.trim() || '';
  if (!email) { state.errors.email = 'L email e obbligatoria'; ok = false; }
  else if (!validateEmail(email)) { state.errors.email = 'Email non valida'; ok = false; }

  const pwd = dom.password?.value || '';
  if (!pwd) { state.errors.password = 'La password e obbligatoria'; ok = false; }
  else if (pwd.length < 6) { state.errors.password = 'Minimo 6 caratteri'; ok = false; }

  Object.keys(state.errors).forEach(f => setFieldInvalid(f, state.errors[f]));
  return ok;
}

function validateField(f) {
  const v = dom[f]?.value.trim() || '';
  let err = null;
  if (f === 'email') {
    if (!v) err = 'L email e obbligatoria';
    else if (!validateEmail(v)) err = 'Email non valida';
  }
  if (f === 'password') {
    if (!v) err = 'La password e obbligatoria';
    else if (v.length < 6) err = 'Minimo 6 caratteri';
  }
  if (err) { state.errors[f] = err; setFieldInvalid(f, err); }
  else { delete state.errors[f]; clearErr(f); }
}

function setFieldInvalid(f, msg) {
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

function showError(msg) {
  if (dom.errorMsg) dom.errorMsg.textContent = msg;
  dom.errorBox?.classList.remove('d-none');
}

function hideError() {
  dom.errorBox?.classList.add('d-none');
  if (dom.errorMsg) dom.errorMsg.textContent = '';
}

async function submitLogin() {
  state.isSubmitting = true;
  toggleLoading(dom.submitBtn, true, 'Accesso in corso...');

  try {
    const result = await login(
      dom.email.value.trim().toLowerCase(),
      dom.password.value
    );

    showNotification(result?.message || 'Accesso effettuato!', 'success');

    const role = result?.user?.role || 'user';
    const stored = sessionStorage.getItem('redirectAfterLogin');
    const redirect = stored || (role === 'admin' ? 'admin' : 'home');
    if (stored) sessionStorage.removeItem('redirectAfterLogin');

    setTimeout(() => { window.location.hash = redirect; }, 1000);

  } catch (err) {
    const msg = err.message?.toLowerCase() || '';
    let userMsg = 'Errore di accesso. Riprova.';

    if (/network|failed to fetch/.test(msg)) userMsg = 'Errore di connessione. Controlla la rete.';
    else if (/401|invalid|credential/.test(msg)) userMsg = 'Email o password non validi.';
    else if (/404|not found/.test(msg)) userMsg = 'Utente non trovato.';
    else if (/429/.test(msg)) userMsg = 'Troppi tentativi. Riprova piu tardi.';
    else if (/500/.test(msg)) userMsg = 'Errore del server. Riprova piu tardi.';

    showError(userMsg);
    if (dom.password) { dom.password.value = ''; dom.password.focus(); }

  } finally {
    state.isSubmitting = false;
    toggleLoading(dom.submitBtn, false, 'Accedi');
  }
}