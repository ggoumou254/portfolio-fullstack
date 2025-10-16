// frontend/js/register.js

/**
 * Module d'inscription moderne avec validation avancée et expérience utilisateur améliorée
 * @version 2.0.0
 * @author Raphael Goumou
 */

import { CONFIG } from './config.js';
import { 
  showNotification, 
  toggleLoading, 
  validateEmail, 
  sanitizeInput,
  debounce,
  debugLog 
} from './utils.js';

// État du formulaire d'inscription
const registerState = {
  isSubmitting: false,
  validationErrors: {},
  passwordStrength: 0,
  termsAccepted: false,
  lastSubmission: null,
  cooldownPeriod: 30000 // 30 secondes entre les inscriptions
};

// Éléments DOM
let domElements = {};

/**
 * Initialise le module d'inscription
 */
export function initRegister() {
  debugLog('info', '👤 Initialisation du module d\'inscription');
  
  try {
    setupDOM();
    setupEventListeners();
    setupRealTimeValidation();
    loadFormState();
  } catch (error) {
    console.error('Erreur initialisation inscription:', error);
  }
}

/**
 * Configure les références DOM
 */
function setupDOM() {
  const form = document.getElementById('registerForm');
  if (!form) {
    debugLog('warn', 'Formulaire d\'inscription non trouvé');
    return;
  }

  domElements = {
    form,
    name: document.getElementById('name'),
    email: document.getElementById('email'),
    password: document.getElementById('password'),
    confirmPassword: document.getElementById('confirmPassword'),
    terms: document.getElementById('terms'),
    submitBtn: document.getElementById('register-submit'),
    errorBox: document.getElementById('register-error'),
    successBox: document.getElementById('register-success'),
    passwordToggle: document.getElementById('toggle-password'),
    passwordStrength: document.getElementById('password-strength'),
    passwordCriteria: document.getElementById('password-criteria')
  };

  // Initialiser l'UI de force du mot de passe
  updatePasswordStrengthUI();
}

/**
 * Configure les écouteurs d'événements
 */
function setupEventListeners() {
  const { form, passwordToggle, terms, submitBtn } = domElements;
  
  if (!form) return;

  // Soumission du formulaire
  form.addEventListener('submit', handleSubmit);

  // Basculer la visibilité du mot de passe
  if (passwordToggle) {
    passwordToggle.addEventListener('click', togglePasswordVisibility);
  }

  // Validation en temps réel
  const fields = ['name', 'email', 'password', 'confirmPassword'];
  fields.forEach(field => {
    const element = domElements[field];
    if (element) {
      element.addEventListener('blur', () => validateField(field));
      element.addEventListener('input', () => clearFieldError(field));
    }
  });

  // Conditions générales
  if (terms) {
    terms.addEventListener('change', (e) => {
      registerState.termsAccepted = e.target.checked;
      validateField('terms');
    });
  }

  // Protection contre les soumissions multiples
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      if (registerState.isSubmitting) {
        e.preventDefault();
        showNotification('Inscription déjà en cours...', 'warning');
      }
    });
  }

  // Sauvegarde automatique du formulaire
  setupAutoSave();
}

/**
 * Configure la validation en temps réel
 */
function setupRealTimeValidation() {
  const { email, password } = domElements;
  
  // Validation email avec debounce
  if (email) {
    const debouncedEmailValidation = debounce(() => {
      if (email.value.trim()) {
        validateField('email');
      }
    }, 500);
    
    email.addEventListener('input', debouncedEmailValidation);
  }

  // Force du mot de passe en temps réel
  if (password) {
    password.addEventListener('input', () => {
      checkPasswordStrength();
      validateField('password');
      validateField('confirmPassword');
    });
  }

  // Validation confirmation mot de passe
  if (domElements.confirmPassword) {
    domElements.confirmPassword.addEventListener('input', () => {
      validateField('confirmPassword');
    });
  }
}

/**
 * Configure l'auto-sauvegarde du formulaire
 */
function setupAutoSave() {
  const { name, email } = domElements;
  
  const saveField = (field) => {
    const value = field.value.trim();
    if (value) {
      localStorage.setItem(`register_${field.id}`, value);
    }
  };

  if (name) {
    name.addEventListener('input', debounce(() => saveField(name), 1000));
  }
  
  if (email) {
    email.addEventListener('input', debounce(() => saveField(email), 1000));
  }
}

/**
 * Charge l'état sauvegardé du formulaire
 */
function loadFormState() {
  const { name, email } = domElements;
  
  try {
    if (name) {
      const savedName = localStorage.getItem('register_name');
      if (savedName) name.value = savedName;
    }
    
    if (email) {
      const savedEmail = localStorage.getItem('register_email');
      if (savedEmail) email.value = savedEmail;
    }
  } catch (error) {
    console.warn('Erreur chargement état formulaire:', error);
  }
}

/**
 * Gère la soumission du formulaire
 */
async function handleSubmit(e) {
  e.preventDefault();
  
  if (registerState.isSubmitting) {
    showNotification('Inscription déjà en cours...', 'warning');
    return;
  }

  // Vérifier le cooldown
  if (isInCooldown()) {
    showNotification('Veuillez patienter avant une nouvelle inscription', 'warning');
    return;
  }

  // Validation complète
  if (!validateForm()) {
    showValidationErrors();
    return;
  }

  await submitRegistration();
}

/**
 * Valide le formulaire complet
 */
function validateForm() {
  const { name, email, password, confirmPassword, terms } = domElements;
  let isValid = true;

  registerState.validationErrors = {};

  // Nom
  if (!name || !name.value.trim()) {
    registerState.validationErrors.name = 'Le nom est requis';
    isValid = false;
  } else if (name.value.trim().length < 2) {
    registerState.validationErrors.name = 'Le nom doit contenir au moins 2 caractères';
    isValid = false;
  }

  // Email
  if (!email || !email.value.trim()) {
    registerState.validationErrors.email = "L'email est requis";
    isValid = false;
  } else if (!validateEmail(email.value.trim())) {
    registerState.validationErrors.email = "Format d'email invalide";
    isValid = false;
  }

  // Mot de passe
  if (!password || !password.value) {
    registerState.validationErrors.password = 'Le mot de passe est requis';
    isValid = false;
  } else if (password.value.length < 8) {
    registerState.validationErrors.password = 'Le mot de passe doit contenir au moins 8 caractères';
    isValid = false;
  } else if (registerState.passwordStrength < 2) {
    registerState.validationErrors.password = 'Le mot de passe est trop faible';
    isValid = false;
  }

  // Confirmation mot de passe
  if (!confirmPassword || !confirmPassword.value) {
    registerState.validationErrors.confirmPassword = 'Veuillez confirmer votre mot de passe';
    isValid = false;
  } else if (password && confirmPassword.value !== password.value) {
    registerState.validationErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    isValid = false;
  }

  // Conditions générales
  if (!terms || !terms.checked) {
    registerState.validationErrors.terms = 'Vous devez accepter les conditions générales';
    isValid = false;
  }

  return isValid;
}

/**
 * Valide un champ individuel
 */
function validateField(fieldName) {
  const field = domElements[fieldName];
  if (!field) return true;

  let isValid = true;
  const value = field.value.trim();

  switch (fieldName) {
    case 'name':
      if (!value) {
        registerState.validationErrors.name = 'Le nom est requis';
        isValid = false;
      } else if (value.length < 2) {
        registerState.validationErrors.name = 'Le nom doit contenir au moins 2 caractères';
        isValid = false;
      } else {
        delete registerState.validationErrors.name;
      }
      break;

    case 'email':
      if (!value) {
        registerState.validationErrors.email = "L'email est requis";
        isValid = false;
      } else if (!validateEmail(value)) {
        registerState.validationErrors.email = "Format d'email invalide";
        isValid = false;
      } else {
        delete registerState.validationErrors.email;
      }
      break;

    case 'password':
      if (!value) {
        registerState.validationErrors.password = 'Le mot de passe est requis';
        isValid = false;
      } else if (value.length < 8) {
        registerState.validationErrors.password = 'Le mot de passe doit contenir au moins 8 caractères';
        isValid = false;
      } else if (registerState.passwordStrength < 2) {
        registerState.validationErrors.password = 'Le mot de passe est trop faible';
        isValid = false;
      } else {
        delete registerState.validationErrors.password;
      }
      break;

    case 'confirmPassword':
      const passwordValue = domElements.password?.value || '';
      if (!value) {
        registerState.validationErrors.confirmPassword = 'Veuillez confirmer votre mot de passe';
        isValid = false;
      } else if (value !== passwordValue) {
        registerState.validationErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
        isValid = false;
      } else {
        delete registerState.validationErrors.confirmPassword;
      }
      break;

    case 'terms':
      const isChecked = domElements.terms?.checked || false;
      if (!isChecked) {
        registerState.validationErrors.terms = 'Vous devez accepter les conditions générales';
        isValid = false;
      } else {
        delete registerState.validationErrors.terms;
      }
      break;
  }

  updateFieldUI(fieldName, isValid);
  return isValid;
}

/**
 * Vérifie la force du mot de passe
 */
function checkPasswordStrength() {
  const { password } = domElements;
  if (!password || !password.value) {
    registerState.passwordStrength = 0;
    updatePasswordStrengthUI();
    return;
  }

  const pass = password.value;
  let strength = 0;

  // Longueur minimale
  if (pass.length >= 8) strength += 1;
  if (pass.length >= 12) strength += 1;

  // Complexité
  if (/[a-z]/.test(pass)) strength += 1; // minuscules
  if (/[A-Z]/.test(pass)) strength += 1; // majuscules
  if (/[0-9]/.test(pass)) strength += 1; // chiffres
  if (/[^a-zA-Z0-9]/.test(pass)) strength += 1; // caractères spéciaux

  registerState.passwordStrength = Math.min(strength, 5);
  updatePasswordStrengthUI();
}

/**
 * Met à jour l'UI de force du mot de passe
 */
function updatePasswordStrengthUI() {
  const { passwordStrength, passwordCriteria } = domElements;
  const strength = registerState.passwordStrength;

  if (passwordStrength) {
    const strengthText = ['Très faible', 'Faible', 'Moyen', 'Fort', 'Très fort'][strength] || 'Très faible';
    const strengthClass = ['danger', 'warning', 'info', 'success', 'success'][strength] || 'danger';
    
    passwordStrength.textContent = strengthText;
    passwordStrength.className = `password-strength strength-${strengthClass}`;
    
    // Barre de progression visuelle
    const progress = (strength / 4) * 100;
    passwordStrength.style.setProperty('--strength-progress', `${progress}%`);
  }

  if (passwordCriteria) {
    const criteria = {
      length: password.value.length >= 8,
      lowercase: /[a-z]/.test(password.value),
      uppercase: /[A-Z]/.test(password.value),
      number: /[0-9]/.test(password.value),
      special: /[^a-zA-Z0-9]/.test(password.value)
    };

    const criteriaHTML = `
      <div class="password-criteria-list">
        <div class="criteria-item ${criteria.length ? 'met' : ''}">
          <i class="bi ${criteria.length ? 'bi-check-circle-fill' : 'bi-circle'}"></i>
          Au moins 8 caractères
        </div>
        <div class="criteria-item ${criteria.lowercase ? 'met' : ''}">
          <i class="bi ${criteria.lowercase ? 'bi-check-circle-fill' : 'bi-circle'}"></i>
          Lettre minuscule
        </div>
        <div class="criteria-item ${criteria.uppercase ? 'met' : ''}">
          <i class="bi ${criteria.uppercase ? 'bi-check-circle-fill' : 'bi-circle'}"></i>
          Lettre majuscule
        </div>
        <div class="criteria-item ${criteria.number ? 'met' : ''}">
          <i class="bi ${criteria.number ? 'bi-check-circle-fill' : 'bi-circle'}"></i>
          Chiffre
        </div>
        <div class="criteria-item ${criteria.special ? 'met' : ''}">
          <i class="bi ${criteria.special ? 'bi-check-circle-fill' : 'bi-circle'}"></i>
          Caractère spécial
        </div>
      </div>
    `;

    passwordCriteria.innerHTML = criteriaHTML;
  }
}

/**
 * Met à jour l'UI d'un champ
 */
function updateFieldUI(fieldName, isValid) {
  const field = domElements[fieldName];
  const errorElement = document.getElementById(`${fieldName}-error`);
  
  if (!field) return;

  field.classList.remove('is-valid', 'is-invalid');
  field.classList.add(isValid ? 'is-valid' : 'is-invalid');

  if (errorElement) {
    if (!isValid && registerState.validationErrors[fieldName]) {
      errorElement.textContent = registerState.validationErrors[fieldName];
      errorElement.style.display = 'block';
    } else {
      errorElement.style.display = 'none';
    }
  }
}

/**
 * Efface l'erreur d'un champ
 */
function clearFieldError(fieldName) {
  const field = domElements[fieldName];
  const errorElement = document.getElementById(`${fieldName}-error`);
  
  if (field) {
    field.classList.remove('is-invalid');
  }
  
  if (errorElement) {
    errorElement.style.display = 'none';
  }
  
  delete registerState.validationErrors[fieldName];
}

/**
 * Affiche les erreurs de validation
 */
function showValidationErrors() {
  const { errorBox } = domElements;
  
  // Mettre à jour l'UI de chaque champ
  Object.keys(registerState.validationErrors).forEach(fieldName => {
    updateFieldUI(fieldName, false);
  });

  // Afficher le résumé des erreurs
  if (errorBox) {
    const errorList = Object.values(registerState.validationErrors)
      .map(error => `<li>${error}</li>`)
      .join('');
    
    errorBox.innerHTML = `
      <div class="alert alert-danger">
        <h6 class="alert-heading">Veuillez corriger les erreurs suivantes :</h6>
        <ul class="mb-0">${errorList}</ul>
      </div>
    `;
    errorBox.style.display = 'block';
    
    // Focus sur le premier champ en erreur
    const firstErrorField = Object.keys(registerState.validationErrors)[0];
    if (firstErrorField && domElements[firstErrorField]) {
      domElements[firstErrorField].focus();
    }
  }
}

/**
 * Bascule la visibilité du mot de passe
 */
function togglePasswordVisibility() {
  const { password, confirmPassword, passwordToggle } = domElements;
  
  if (!password) return;

  const isVisible = password.type === 'text';
  password.type = isVisible ? 'password' : 'text';
  
  if (confirmPassword) {
    confirmPassword.type = isVisible ? 'password' : 'text';
  }
  
  if (passwordToggle) {
    passwordToggle.innerHTML = isVisible ? 
      '<i class="bi bi-eye"></i> Afficher' : 
      '<i class="bi bi-eye-slash"></i> Masquer';
  }
}

/**
 * Soumet l'inscription à l'API
 */
async function submitRegistration() {
  const { name, email, password, submitBtn, terms } = domElements;
  
  registerState.isSubmitting = true;
  registerState.lastSubmission = Date.now();
  
  toggleLoading(submitBtn, true, 'Inscription...');

  try {
    const payload = {
      name: sanitizeInput(name.value.trim()),
      email: sanitizeInput(email.value.trim().toLowerCase()),
      password: password.value,
      termsAccepted: terms.checked,
      source: 'portfolio_website',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      language: navigator.language
    };

    debugLog('info', 'Tentative d\'inscription:', { 
      email: payload.email, 
      name: payload.name 
    });

    const response = await fetch(CONFIG.apiUrl(CONFIG.ENDPOINTS.AUTH.REGISTER), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const data = await parseResponse(response);

    // Succès
    handleSuccess(data);
    trackRegistration(true);

  } catch (error) {
    // Erreur
    handleError(error);
    trackRegistration(false);
    
  } finally {
    registerState.isSubmitting = false;
    toggleLoading(submitBtn, false, 'S\'inscrire');
  }
}

/**
 * Parse la réponse HTTP
 */
async function parseResponse(response) {
  const contentType = response.headers.get('content-type');
  
  if (!response.ok) {
    let errorMessage = `Erreur HTTP ${response.status}`;
    
    if (contentType?.includes('application/json')) {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
      
      // Messages personnalisés selon le statut
      if (response.status === 409) {
        errorMessage = errorData.message || 'Un compte avec cet email existe déjà';
      } else if (response.status === 400) {
        errorMessage = errorData.message || 'Données d\'inscription invalides';
      } else if (response.status === 429) {
        errorMessage = 'Trop de tentatives. Veuillez réessayer plus tard.';
      }
    } else {
      const text = await response.text();
      if (text) errorMessage = text;
    }
    
    throw new Error(errorMessage);
  }
  
  if (contentType?.includes('application/json')) {
    return await response.json();
  }
  
  return { message: 'Inscription réussie !' };
}

/**
 * Gère le succès de l'inscription
 */
function handleSuccess(data) {
  const { errorBox, successBox } = domElements;
  
  const successMessage = data?.message || 'Inscription réussie ! Redirection vers la page de connexion...';
  
  if (successBox) {
    successBox.innerHTML = `
      <div class="alert alert-success alert-dismissible fade show">
        <i class="bi bi-check-circle-fill me-2"></i>
        ${successMessage}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
    successBox.style.display = 'block';
  } else {
    showNotification(successMessage, 'success');
  }

  // Cacher les erreurs
  if (errorBox) {
    errorBox.style.display = 'none';
  }

  // Nettoyer le formulaire et le stockage
  cleanupAfterSuccess();

  // Redirection après délai
  setTimeout(() => {
    window.location.hash = 'login';
  }, 2000);
  
  debugLog('success', 'Inscription réussie:', data);
}

/**
 * Gère l'erreur d'inscription
 */
function handleError(error) {
  const { errorBox } = domElements;
  
  console.error('Erreur inscription:', error);
  
  let userMessage = error.message;
  
  if (error.message.includes('Network') || error.message.includes('Failed to fetch')) {
    userMessage = 'Erreur de connexion. Vérifiez votre connexion internet.';
  }

  if (errorBox) {
    errorBox.innerHTML = `
      <div class="alert alert-danger alert-dismissible fade show">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        ${userMessage}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
    errorBox.style.display = 'block';
  } else {
    showNotification(userMessage, 'error');
  }
}

/**
 * Nettoie après une inscription réussie
 */
function cleanupAfterSuccess() {
  const { form } = domElements;
  
  if (form) {
    form.reset();
  }
  
  // Nettoyer le stockage local
  ['register_name', 'register_email'].forEach(key => {
    localStorage.removeItem(key);
  });
  
  // Réinitialiser l'état
  registerState.validationErrors = {};
  registerState.passwordStrength = 0;
  registerState.termsAccepted = false;
}

/**
 * Vérifie si on est en période de cooldown
 */
function isInCooldown() {
  if (!registerState.lastSubmission) return false;
  
  const timeSinceLastSubmission = Date.now() - registerState.lastSubmission;
  return timeSinceLastSubmission < registerState.cooldownPeriod;
}

/**
 * Track l'inscription (pour analytics)
 */
function trackRegistration(success) {
  if (typeof gtag !== 'undefined') {
    gtag('event', success ? 'registration_success' : 'registration_error', {
      event_category: 'Authentication',
      event_label: 'Inscription utilisateur'
    });
  }
  
  // Événement personnalisé
  window.dispatchEvent(new CustomEvent('registrationAttempt', {
    detail: { success, timestamp: new Date() }
  }));
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('registerForm')) {
    initRegister();
  }
});

// Export pour les tests
export const _testExports = {
  registerState,
  validateForm,
  checkPasswordStrength
};