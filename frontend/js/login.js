/**
 * Modulo di login moderno con validazione avanzata
 * @version 3.1.0 (Config optimized + error handling)
 */

// Configurazioni globali con fallback
const APP_CONFIG = window.__APP_CONFIG__ || { DEBUG: false };
const API_BASE = window.__API_BASE__ || 'http://localhost:5000';

// Importazioni con fallback sicuro e debug
let authModule, utilsModule;

// Funzione di debug condizionale
function debugLog(...args) {
  if (APP_CONFIG.DEBUG) {
    console.log('🔐 LOGIN:', ...args);
  }
}

function debugWarn(...args) {
  if (APP_CONFIG.DEBUG) {
    console.warn('⚠️ LOGIN:', ...args);
  }
}

function debugError(...args) {
  console.error('❌ LOGIN:', ...args);
}

try {
  authModule = await import('./auth.js');
  debugLog('Modulo auth caricato');
} catch (error) {
  debugWarn('Modulo auth non trovato, usando fallback');
  authModule = {
    login: async (email, password) => {
      // Simulazione login per sviluppo
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (email === 'admin@test.com' && password === 'password') {
            resolve({
              user: { id: 1, email, role: 'admin', name: 'Admin Test' },
              token: 'fake-jwt-token-for-dev',
              message: 'Login simulato per sviluppo'
            });
          } else {
            reject(new Error('Credenziali non valide'));
          }
        }, 1000);
      });
    },
    isAuthenticated: () => !!localStorage.getItem('auth_token'),
    getToken: () => localStorage.getItem('auth_token')
  };
}

try {
  utilsModule = await import('./utils.js');
  debugLog('Modulo utils caricato');
} catch (error) {
  debugWarn('Modulo utils non trovato, usando fallback');
  utilsModule = {
    showNotification: (msg, type) => {
      const colors = { success: 'green', error: 'red', warning: 'orange', info: 'blue' };
      console.log(`%c${type.toUpperCase()}: ${msg}`, `color: ${colors[type] || 'black'}; font-weight: bold;`);
      
      // Fallback UI notification
      if (typeof Toast !== 'undefined') {
        Toast.show(msg, type);
      }
    },
    toggleLoading: (btn, loading, text) => {
      if (btn) {
        btn.disabled = loading;
        if (loading) {
          btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${text}`;
          btn.setAttribute('data-original-text', btn.textContent);
        } else {
          btn.innerHTML = text || btn.getAttribute('data-original-text') || 'Accedi';
        }
      }
    },
    validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  };
}

const { login, isAuthenticated, getToken } = authModule;
const { showNotification, toggleLoading, validateEmail } = utilsModule;

// Stato del modulo
const loginState = {
  isSubmitting: false,
  validationErrors: {},
  isInitialized: false
};

// Elementi DOM
let domElements = {};

/**
 * Inizializza il modulo di login
 */
export function initLogin() {
  if (loginState.isInitialized) {
    debugLog('Modulo già inizializzato');
    return;
  }

  debugLog('Inizializzazione modulo di login', { DEBUG: APP_CONFIG.DEBUG, API_BASE });

  // Reindirizza se già autenticato
  if (isAuthenticated()) {
    handleAlreadyAuthenticated();
    return;
  }

  try {
    if (!setupDOM()) {
      debugError('Impossibile configurare il DOM');
      return;
    }

    setupEventListeners();
    loginState.isInitialized = true;
    
    debugLog('Modulo inizializzato correttamente');
    
    // Focus automatico su email
    setTimeout(() => {
      const { email } = domElements;
      if (email) {
        email.focus();
        debugLog('Focus automatico su campo email');
      }
    }, 300);
    
  } catch (error) {
    debugError('Errore durante l\'inizializzazione:', error);
    showNotification('Errore di inizializzazione del login', 'error');
  }
}

/**
 * Configura gli elementi DOM
 */
function setupDOM() {
  try {
    const form = document.getElementById('loginForm');
    if (!form) {
      debugWarn('Form di login non trovato');
      return false;
    }

    // Elementi principali con verifiche
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const submitBtn = document.getElementById('login-submit');

    if (!email || !password || !submitBtn) {
      debugError('Elementi critici mancanti');
      return false;
    }

    domElements = {
      form,
      email,
      password,
      submitBtn,
      errorBox: document.getElementById('login-error'),
      passwordToggle: document.getElementById('toggle-password'),
      emailError: document.querySelector('[data-error="email"]') || document.getElementById('email-error'),
      passwordError: document.querySelector('[data-error="password"]') || document.getElementById('password-error')
    };

    debugLog('Elementi DOM configurati', {
      form: !!domElements.form,
      email: !!domElements.email,
      password: !!domElements.password,
      submitBtn: !!domElements.submitBtn,
      errorBox: !!domElements.errorBox,
      passwordToggle: !!domElements.passwordToggle
    });

    return true;

  } catch (error) {
    debugError('Errore configurazione DOM:', error);
    return false;
  }
}

/**
 * Configura gli event listeners
 */
function setupEventListeners() {
  const { form, passwordToggle, email, password } = domElements;

  if (!form) return;

  // Invio del form
  form.addEventListener('submit', handleSubmit);

  // Toggle visibilità password
  if (passwordToggle) {
    passwordToggle.addEventListener('click', togglePasswordVisibility);
    passwordToggle.style.cursor = 'pointer';
    debugLog('Toggle password configurato');
  }

  // Validazione in tempo reale per email
  if (email) {
    email.addEventListener('blur', () => {
      if (email.value.trim()) validateField('email');
    });
    
    email.addEventListener('input', () => {
      if (loginState.validationErrors.email) {
        clearFieldError('email');
      }
    });

    email.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !loginState.isSubmitting) {
        e.preventDefault();
        if (password) password.focus();
      }
    });
  }

  // Validazione in tempo reale per password
  if (password) {
    password.addEventListener('blur', () => {
      if (password.value) validateField('password');
    });
    
    password.addEventListener('input', () => {
      if (loginState.validationErrors.password) {
        clearFieldError('password');
      }
    });

    password.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !loginState.isSubmitting) {
        e.preventDefault();
        handleSubmit(e);
      }
    });
  }

  // Pulsante di invio
  if (domElements.submitBtn) {
    domElements.submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleSubmit(e);
    });
  }

  debugLog('Event listeners configurati');
}

/**
 * Gestisce l'invio del form
 */
async function handleSubmit(e) {
  e.preventDefault();

  if (loginState.isSubmitting) {
    showNotification('Login già in corso...', 'warning');
    return;
  }

  debugLog('Tentativo di login...');

  // Nascondi errori precedenti
  hideError();

  // Validazione
  if (!validateForm()) {
    showValidationErrors();
    return;
  }

  await submitLogin();
}

/**
 * Valida l'intero form
 */
function validateForm() {
  const { email, password } = domElements;
  let isValid = true;

  // Reset errori
  loginState.validationErrors = {};

  // Validazione email
  if (!email || !email.value.trim()) {
    loginState.validationErrors.email = "L'email è obbligatoria";
    isValid = false;
  } else if (!validateEmail(email.value.trim())) {
    loginState.validationErrors.email = "Formato email non valido";
    isValid = false;
  }

  // Validazione password
  if (!password || !password.value) {
    loginState.validationErrors.password = 'La password è obbligatoria';
    isValid = false;
  } else if (password.value.length < 6) {
    loginState.validationErrors.password = 'La password deve essere di almeno 6 caratteri';
    isValid = false;
  }

  if (isValid) {
    debugLog('Validazione form superata');
  } else {
    debugWarn('Errori di validazione:', loginState.validationErrors);
  }

  return isValid;
}

/**
 * Valida un singolo campo
 */
function validateField(fieldName) {
  const field = domElements[fieldName];
  if (!field) {
    debugWarn(`Campo ${fieldName} non trovato`);
    return true;
  }

  let isValid = true;
  const value = field.value.trim();

  // Inizializza validationErrors se necessario
  if (!loginState.validationErrors) {
    loginState.validationErrors = {};
  }

  switch (fieldName) {
    case 'email':
      if (!value) {
        loginState.validationErrors.email = "L'email è obbligatoria";
        isValid = false;
      } else if (!validateEmail(value)) {
        loginState.validationErrors.email = "Formato email non valido";
        isValid = false;
      } else {
        delete loginState.validationErrors.email;
      }
      break;

    case 'password':
      if (!value) {
        loginState.validationErrors.password = 'La password è obbligatoria';
        isValid = false;
      } else if (value.length < 6) {
        loginState.validationErrors.password = 'La password deve essere di almeno 6 caratteri';
        isValid = false;
      } else {
        delete loginState.validationErrors.password;
      }
      break;
  }

  updateFieldUI(fieldName, isValid);
  return isValid;
}

/**
 * Aggiorna l'interfaccia del campo
 */
function updateFieldUI(fieldName, isValid) {
  const field = domElements[fieldName];
  const errorElement = domElements[`${fieldName}Error`];
  
  if (!field) return;

  // Rimuovi classi precedenti
  field.classList.remove('is-valid', 'is-invalid');
  
  // Aggiungi classe appropriata
  if (field.value.trim()) {
    field.classList.add(isValid ? 'is-valid' : 'is-invalid');
  }

  // Gestisci messaggio di errore
  if (errorElement) {
    if (!isValid && loginState.validationErrors[fieldName]) {
      errorElement.textContent = loginState.validationErrors[fieldName];
      errorElement.style.display = 'block';
      errorElement.classList.remove('d-none');
    } else {
      errorElement.style.display = 'none';
      errorElement.classList.add('d-none');
      errorElement.textContent = '';
    }
  }

  debugLog(`Campo ${fieldName} aggiornato - Valido: ${isValid}`);
}

/**
 * Pulisce gli errori di un campo
 */
function clearFieldError(fieldName) {
  debugLog(`Pulizia errori per ${fieldName}`);
  
  const field = domElements[fieldName];
  const errorElement = domElements[`${fieldName}Error`];

  // Pulisci campo
  if (field) {
    field.classList.remove('is-invalid');
  }

  // Pulisci errore
  if (errorElement) {
    errorElement.classList.add('d-none');
    errorElement.textContent = '';
    errorElement.style.display = 'none';
  }

  // Pulisci dalla memoria
  if (loginState.validationErrors && loginState.validationErrors[fieldName]) {
    delete loginState.validationErrors[fieldName];
  }
}

/**
 * Mostra gli errori di validazione
 */
function showValidationErrors() {
  const { errorBox } = domElements;

  // Aggiorna UI per ogni campo con errori
  Object.keys(loginState.validationErrors).forEach(fieldName => {
    updateFieldUI(fieldName, false);
  });

  // Mostra box errori generale
  if (errorBox && Object.keys(loginState.validationErrors).length > 0) {
    const errorList = Object.values(loginState.validationErrors)
      .map(error => `<li>${error}</li>`)
      .join('');

    errorBox.innerHTML = `
      <div class="alert alert-danger alert-dismissible fade show">
        <div class="d-flex align-items-center">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>
          <strong>Si prega di correggere i seguenti errori:</strong>
        </div>
        <ul class="mt-2 mb-0 ps-3">${errorList}</ul>
        <button type="button" class="btn-close btn-sm" data-bs-dismiss="alert"></button>
      </div>
    `;
    errorBox.classList.remove('d-none');

    // Focus sul primo campo con errore
    const firstErrorField = Object.keys(loginState.validationErrors)[0];
    if (firstErrorField && domElements[firstErrorField]) {
      domElements[firstErrorField].focus();
    }
  }

  debugLog('Errori di validazione mostrati');
}

/**
 * Alterna la visibilità della password
 */
function togglePasswordVisibility() {
  const { password, passwordToggle } = domElements;
  if (!password) return;

  const isVisible = password.type === 'text';
  password.type = isVisible ? 'password' : 'text';

  if (passwordToggle) {
    const icon = passwordToggle.querySelector('i');
    if (icon) {
      icon.className = isVisible ? 'bi bi-eye' : 'bi bi-eye-slash';
    } else {
      passwordToggle.innerHTML = isVisible ? 
        '<i class="bi bi-eye"></i>' : 
        '<i class="bi bi-eye-slash"></i>';
    }
    
    // Aggiungi tooltip
    passwordToggle.title = isVisible ? 'Nascondi password' : 'Mostra password';
  }

  debugLog(`Password visibility: ${isVisible ? 'hidden' : 'visible'}`);
}

/**
 * Invio del login
 */
async function submitLogin() {
  const { email, password, submitBtn } = domElements;

  if (!email || !password) {
    showNotification('Errore: campi mancanti', 'error');
    return;
  }

  loginState.isSubmitting = true;
  toggleLoading(submitBtn, true, 'Accesso in corso...');

  try {
    const credentials = {
      email: email.value.trim().toLowerCase(),
      password: password.value
    };

    debugLog('Tentativo di accesso con:', credentials.email);

    const result = await login(credentials.email, credentials.password);
    
    debugLog('Accesso riuscito:', result.user);
    handleLoginSuccess(result);

  } catch (error) {
    debugError('Errore di accesso:', error);
    handleLoginError(error);
  } finally {
    loginState.isSubmitting = false;
    toggleLoading(submitBtn, false, 'Accedi');
  }
}

/**
 * Gestisce il successo del login
 */
function handleLoginSuccess(data) {
  hideError();
  
  const successMessage = data?.message || 'Accesso effettuato con successo!';
  showNotification(successMessage, 'success');

  // Reindirizzamento
  const role = data?.user?.role || 'user';
  const redirectTo = getRedirectDestination(role);

  debugLog(`Reindirizzamento a: ${redirectTo}`);

  setTimeout(() => {
    window.location.hash = redirectTo;
  }, 1500);
}

/**
 * Determina la destinazione di reindirizzamento
 */
function getRedirectDestination(role) {
  // Prima controlla se c'è un reindirizzamento memorizzato
  const storedRedirect = sessionStorage.getItem('redirectAfterLogin');
  if (storedRedirect) {
    sessionStorage.removeItem('redirectAfterLogin');
    debugLog('Reindirizzamento da sessionStorage:', storedRedirect);
    return storedRedirect;
  }
  
  // Reindirizzamento basato sul ruolo
  const routes = {
    'admin': 'admin',
    'supervisor': 'dashboard', 
    'user': 'home',
    'guest': 'home'
  };
  
  const destination = routes[role] || 'home';
  debugLog(`Reindirizzamento per ruolo ${role}:`, destination);
  return destination;
}

/**
 * Gestisce gli errori di login
 */
function handleLoginError(error) {
  let userMessage = 'Errore di accesso. Riprova.';

  // Messaggi di errore specifici
  const errorMsg = error.message?.toLowerCase() || '';
  
  if (errorMsg.includes('network') || errorMsg.includes('failed to fetch')) {
    userMessage = 'Errore di connessione. Verifica la tua connessione internet.';
    debugError('Errore di rete - API Base:', API_BASE);
  } else if (errorMsg.includes('401') || errorMsg.includes('invalid') || errorMsg.includes('credential')) {
    userMessage = 'Email o password non validi.';
  } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
    userMessage = 'Utente non trovato.';
  } else if (errorMsg.includes('429')) {
    userMessage = 'Troppi tentativi. Riprova più tardi.';
  } else if (errorMsg.includes('500')) {
    userMessage = 'Errore del server. Riprova più tardi.';
  }

  showError(userMessage);

  // Focus sul campo appropriato
  if (errorMsg.includes('password')) {
    domElements.password?.focus();
  } else {
    domElements.email?.focus();
  }

  // Pulisci la password per sicurezza
  if (domElements.password) {
    domElements.password.value = '';
    validateField('password');
  }

  debugLog('Errore gestito:', userMessage);
}

/**
 * Mostra un errore
 */
function showError(message) {
  const { errorBox } = domElements;

  if (errorBox) {
    errorBox.innerHTML = `
      <div class="alert alert-danger alert-dismissible fade show">
        <div class="d-flex align-items-center">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>
          <span>${message}</span>
        </div>
        <button type="button" class="btn-close btn-sm" data-bs-dismiss="alert"></button>
      </div>
    `;
    errorBox.classList.remove('d-none');
  } else {
    // Fallback
    showNotification(message, 'error');
  }
}

/**
 * Nasconde gli errori
 */
function hideError() {
  const { errorBox } = domElements;
  if (errorBox) {
    errorBox.classList.add('d-none');
    errorBox.innerHTML = '';
  }
}

/**
 * Gestisce l'utente già autenticato
 */
function handleAlreadyAuthenticated() {
  debugLog('Utente già autenticato');
  
  try {
    const token = getToken();
    if (!token) {
      debugWarn('Token non trovato');
      return;
    }

    // Decodifica il token JWT
    const payload = JSON.parse(atob(token.split('.')[1]));
    const role = payload.role || 'user';
    const redirectTo = getRedirectDestination(role);
    
    showNotification('Sei già connesso', 'info');
    
    // Reindirizza dopo breve delay
    setTimeout(() => {
      window.location.hash = redirectTo;
      debugLog('Reindirizzamento automatico effettuato');
    }, 500);
    
  } catch (error) {
    debugError('Errore verifica token:', error);
    window.location.hash = 'home';
  }
}

/**
 * Distrugge il modulo (cleanup)
 */
export function destroyLogin() {
  const { form, passwordToggle } = domElements;
  
  if (form) {
    form.removeEventListener('submit', handleSubmit);
  }
  
  if (passwordToggle) {
    passwordToggle.removeEventListener('click', togglePasswordVisibility);
  }
  
  domElements = {};
  loginState.isInitialized = false;
  loginState.isSubmitting = false;
  loginState.validationErrors = {};
  
  debugLog('Modulo distrutto');
}

// Inizializzazione automatica
document.addEventListener('DOMContentLoaded', () => {
  debugLog('DOM pronto, verifico form di login...', { 
    DEBUG: APP_CONFIG.DEBUG,
    API_BASE: API_BASE 
  });
  
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    debugLog('Form di login trovato, inizializzo...');
    
    // Delay per assicurare che tutto sia caricato
    setTimeout(() => {
      try {
        initLogin();
      } catch (error) {
        debugError('Errore critico inizializzazione:', error);
        showNotification('Errore di inizializzazione della pagina di login', 'error');
      }
    }, 100);
  } else {
    debugLog('Nessun form di login su questa pagina');
  }
});

// Export per testing
export { 
  loginState, 
  domElements, 
  clearFieldError, 
  validateField,
  APP_CONFIG,
  API_BASE 
};