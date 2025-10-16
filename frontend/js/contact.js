// frontend/js/contact.js

/**
 * Gestion moderne du formulaire de contact avec validation avancée
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

// État du formulaire
const contactState = {
  isSubmitting: false,
  lastSubmission: null,
  formData: {},
  validationErrors: {}
};

// Éléments DOM
let domElements = {};

/**
 * Initialise le module contact
 */
export function initContact() {
  debugLog('info', '📧 Initialisation du module contact');
  
  try {
    setupDOM();
    setupEventListeners();
    setupRealTimeValidation();
  } catch (error) {
    console.error('Erreur initialisation contact:', error);
  }
}

/**
 * Configure les références DOM
 */
function setupDOM() {
  const form = document.getElementById('contactForm');
  if (!form) {
    debugLog('warn', 'Formulaire de contact non trouvé');
    return;
  }

  domElements = {
    form,
    name: document.getElementById('name'),
    email: document.getElementById('email'),
    subject: document.getElementById('subject'),
    message: document.getElementById('message'),
    submitBtn: document.getElementById('contact-submit'),
    successMsg: document.getElementById('msg-success'),
    errorMsg: document.getElementById('msg-error'),
    validationContainer: document.getElementById('contact-validation'),
    characterCount: document.getElementById('message-character-count')
  };

  // Initialiser le compteur de caractères
  updateCharacterCount();
}

/**
 * Configure les écouteurs d'événements
 */
function setupEventListeners() {
  const { form, submitBtn } = domElements;
  
  if (!form) return;

  // Soumission du formulaire
  form.addEventListener('submit', handleSubmit);

  // Validation en temps réel
  const inputs = ['name', 'email', 'subject', 'message'];
  inputs.forEach(field => {
    const input = domElements[field];
    if (input) {
      input.addEventListener('blur', () => validateField(field));
      input.addEventListener('input', () => clearFieldError(field));
    }
  });

  // Compteur de caractères pour le message
  if (domElements.message) {
    domElements.message.addEventListener('input', updateCharacterCount);
  }

  // Protection contre les soumissions multiples
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      if (contactState.isSubmitting) {
        e.preventDefault();
        showNotification('Un envoi est déjà en cours...', 'warning');
      }
    });
  }

  // Réinitialisation manuelle
  const resetBtn = document.querySelector('[data-action="reset-contact"]');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetForm);
  }
}

/**
 * Configure la validation en temps réel
 */
function setupRealTimeValidation() {
  const { email } = domElements;
  
  if (email) {
    const debouncedEmailValidation = debounce(() => {
      if (email.value.trim()) {
        validateField('email');
      }
    }, 500);
    
    email.addEventListener('input', debouncedEmailValidation);
  }
}

/**
 * Met à jour le compteur de caractères
 */
function updateCharacterCount() {
  const { message, characterCount } = domElements;
  
  if (!message || !characterCount) return;
  
  const currentLength = message.value.length;
  const maxLength = message.getAttribute('maxlength') || 1000;
  
  characterCount.textContent = `${currentLength}/${maxLength}`;
  
  // Changer la couleur selon le niveau
  const percentage = (currentLength / maxLength) * 100;
  
  characterCount.className = 'form-text text-end';
  if (percentage > 90) {
    characterCount.classList.add('text-danger');
  } else if (percentage > 75) {
    characterCount.classList.add('text-warning');
  }
}

/**
 * Gère la soumission du formulaire
 */
async function handleSubmit(e) {
  e.preventDefault();
  
  if (contactState.isSubmitting) {
    showNotification('Un envoi est déjà en cours...', 'warning');
    return;
  }

  // Validation complète avant envoi
  if (!validateForm()) {
    showValidationErrors();
    return;
  }

  await submitForm();
}

/**
 * Valide le formulaire complet
 */
function validateForm() {
  const { name, email, message } = domElements;
  let isValid = true;

  contactState.validationErrors = {};

  // Nom
  if (!name || !name.value.trim()) {
    contactState.validationErrors.name = 'Le nom est requis';
    isValid = false;
  } else if (name.value.trim().length < 2) {
    contactState.validationErrors.name = 'Le nom doit contenir au moins 2 caractères';
    isValid = false;
  }

  // Email
  if (!email || !email.value.trim()) {
    contactState.validationErrors.email = "L'email est requis";
    isValid = false;
  } else if (!validateEmail(email.value.trim())) {
    contactState.validationErrors.email = "Format d'email invalide";
    isValid = false;
  }

  // Message
  if (!message || !message.value.trim()) {
    contactState.validationErrors.message = 'Le message est requis';
    isValid = false;
  } else if (message.value.trim().length < 10) {
    contactState.validationErrors.message = 'Le message doit contenir au moins 10 caractères';
    isValid = false;
  } else if (message.value.trim().length > 1000) {
    contactState.validationErrors.message = 'Le message ne peut pas dépasser 1000 caractères';
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
        contactState.validationErrors.name = 'Le nom est requis';
        isValid = false;
      } else if (value.length < 2) {
        contactState.validationErrors.name = 'Le nom doit contenir au moins 2 caractères';
        isValid = false;
      } else {
        delete contactState.validationErrors.name;
      }
      break;

    case 'email':
      if (!value) {
        contactState.validationErrors.email = "L'email est requis";
        isValid = false;
      } else if (!validateEmail(value)) {
        contactState.validationErrors.email = "Format d'email invalide";
        isValid = false;
      } else {
        delete contactState.validationErrors.email;
      }
      break;

    case 'message':
      if (!value) {
        contactState.validationErrors.message = 'Le message est requis';
        isValid = false;
      } else if (value.length < 10) {
        contactState.validationErrors.message = 'Le message doit contenir au moins 10 caractères';
        isValid = false;
      } else if (value.length > 1000) {
        contactState.validationErrors.message = 'Le message ne peut pas dépasser 1000 caractères';
        isValid = false;
      } else {
        delete contactState.validationErrors.message;
      }
      break;
  }

  updateFieldUI(fieldName, isValid);
  return isValid;
}

/**
 * Met à jour l'UI d'un champ
 */
function updateFieldUI(fieldName, isValid) {
  const field = domElements[fieldName];
  const errorElement = document.getElementById(`${fieldName}-error`);
  
  if (!field) return;

  // Mettre à jour les classes Bootstrap
  field.classList.remove('is-valid', 'is-invalid');
  field.classList.add(isValid ? 'is-valid' : 'is-invalid');

  // Mettre à jour le message d'erreur
  if (errorElement) {
    if (!isValid && contactState.validationErrors[fieldName]) {
      errorElement.textContent = contactState.validationErrors[fieldName];
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
  
  delete contactState.validationErrors[fieldName];
}

/**
 * Affiche les erreurs de validation
 */
function showValidationErrors() {
  const { validationContainer } = domElements;
  
  // Mettre à jour l'UI de chaque champ
  Object.keys(contactState.validationErrors).forEach(fieldName => {
    updateFieldUI(fieldName, false);
  });

  // Afficher le résumé des erreurs
  if (validationContainer) {
    const errorList = Object.values(contactState.validationErrors)
      .map(error => `<li>${error}</li>`)
      .join('');
    
    validationContainer.innerHTML = `
      <div class="alert alert-danger">
        <h6 class="alert-heading">Veuillez corriger les erreurs suivantes :</h6>
        <ul class="mb-0">${errorList}</ul>
      </div>
    `;
    validationContainer.style.display = 'block';
    
    // Focus sur le premier champ en erreur
    const firstErrorField = Object.keys(contactState.validationErrors)[0];
    if (firstErrorField && domElements[firstErrorField]) {
      domElements[firstErrorField].focus();
    }
  } else {
    const errorMessage = Object.values(contactState.validationErrors).join(', ');
    showNotification(`Erreurs de validation : ${errorMessage}`, 'error');
  }
}

/**
 * Soumet le formulaire à l'API
 */
async function submitForm() {
  const { name, email, subject, message, submitBtn } = domElements;
  
  contactState.isSubmitting = true;
  toggleLoading(submitBtn, true, 'Envoi en cours...');
  
  try {
    // Préparer les données
    const formData = {
      name: sanitizeInput(name.value.trim()),
      email: sanitizeInput(email.value.trim()),
      subject: subject ? sanitizeInput(subject.value.trim()) : 'Message depuis le portfolio',
      message: sanitizeInput(message.value.trim()),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      source: 'portfolio_website'
    };

    debugLog('info', 'Envoi du formulaire de contact:', formData);

    const response = await fetch(CONFIG.apiUrl(CONFIG.ENDPOINTS.CONTACT.SEND), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData)
    });

    const data = await parseResponse(response);

    // Succès
    handleSuccess(data);
    
    // Analytics (si activé)
    trackContactSubmission(true);

  } catch (error) {
    // Erreur
    handleError(error);
    trackContactSubmission(false);
    
  } finally {
    contactState.isSubmitting = false;
    toggleLoading(submitBtn, false, 'Envoyer le message');
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
    } else {
      const text = await response.text();
      if (text) errorMessage = text;
    }
    
    throw new Error(errorMessage);
  }
  
  if (contentType?.includes('application/json')) {
    return await response.json();
  }
  
  return { message: 'Message envoyé avec succès' };
}

/**
 * Gère le succès de l'envoi
 */
function handleSuccess(data) {
  const { successMsg, validationContainer } = domElements;
  
  // Afficher le message de succès
  const successMessage = data?.message || 'Votre message a été envoyé avec succès !';
  
  if (successMsg) {
    successMsg.innerHTML = `
      <div class="alert alert-success alert-dismissible fade show">
        <i class="bi bi-check-circle-fill me-2"></i>
        ${successMessage}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
    successMsg.style.display = 'block';
  } else {
    showNotification(successMessage, 'success');
  }

  // Cacher les erreurs
  if (validationContainer) {
    validationContainer.style.display = 'none';
  }

  // Réinitialiser le formulaire
  resetForm();
  
  // Sauvegarder le timestamp
  contactState.lastSubmission = new Date();
  
  debugLog('success', 'Formulaire de contact envoyé avec succès');
}

/**
 * Gère l'erreur d'envoi
 */
function handleError(error) {
  const { errorMsg, validationContainer } = domElements;
  
  console.error('Erreur envoi formulaire contact:', error);
  
  // Message d'erreur personnalisé selon le type d'erreur
  let userMessage = error.message;
  
  if (error.message.includes('Network') || error.message.includes('Failed to fetch')) {
    userMessage = 'Erreur de connexion. Vérifiez votre connexion internet.';
  } else if (error.message.includes('429')) {
    userMessage = 'Trop de tentatives. Veuillez réessayer dans quelques minutes.';
  } else if (error.message.includes('500')) {
    userMessage = 'Erreur serveur. Veuillez réessayer plus tard.';
  }

  // Afficher l'erreur
  if (errorMsg) {
    errorMsg.innerHTML = `
      <div class="alert alert-danger alert-dismissible fade show">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        ${userMessage}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
    errorMsg.style.display = 'block';
  } else {
    showNotification(userMessage, 'error');
  }

  // Cacher la validation
  if (validationContainer) {
    validationContainer.style.display = 'none';
  }
}

/**
 * Réinitialise le formulaire
 */
function resetForm() {
  const { form, successMsg, errorMsg, validationContainer, characterCount } = domElements;
  
  if (form) {
    form.reset();
    
    // Réinitialiser les états UI
    const fields = ['name', 'email', 'subject', 'message'];
    fields.forEach(field => {
      const element = domElements[field];
      if (element) {
        element.classList.remove('is-valid', 'is-invalid');
      }
      clearFieldError(field);
    });
    
    // Réinitialiser les compteurs
    updateCharacterCount();
    
    // Cacher les messages
    if (successMsg) successMsg.style.display = 'none';
    if (errorMsg) errorMsg.style.display = 'none';
    if (validationContainer) validationContainer.style.display = 'none';
    
    // Focus sur le premier champ
    if (domElements.name) {
      domElements.name.focus();
    }
  }
}

/**
 * Track l'envoi du formulaire (pour analytics)
 */
function trackContactSubmission(success) {
  if (typeof gtag !== 'undefined') {
    gtag('event', success ? 'contact_success' : 'contact_error', {
      event_category: 'Contact',
      event_label: 'Formulaire de contact'
    });
  }
  
  // Événement personnalisé pour d'autres trackers
  window.dispatchEvent(new CustomEvent('contactFormSubmitted', {
    detail: { success, timestamp: new Date() }
  }));
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
  // Vérifier si on est sur la page contact
  if (document.getElementById('contactForm')) {
    initContact();
  }
});

// Export pour les tests
export const _testExports = {
  contactState,
  validateForm,
  validateField
};