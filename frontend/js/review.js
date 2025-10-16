// frontend/js/review.js

/**
 * Système d'avis modernisé avec validation avancée, gestion d'état et intégration API
 * @version 2.0.0
 * @author Raphael Goumou
 */

import { CONFIG } from './config.js';
import { 
  showNotification, 
  toggleLoading, 
  sanitizeInput,
  debounce,
  debugLog 
} from './utils.js';

// État du système d'avis
const reviewState = {
  selectedRating: 0,
  reviews: [],
  isSubmitting: false,
  validationErrors: {},
  currentHoverRating: 0,
  sortBy: 'newest',
  filterBy: 'all'
};

// Éléments DOM
let domElements = {};

/**
 * Initialise le système d'avis
 */
export async function initReviews() {
  debugLog('info', '⭐ Initialisation du système d\'avis');
  
  try {
    await setupDOM();
    await setupEventListeners();
    await loadReviews();
    setupValidation();
  } catch (error) {
    console.error('Erreur initialisation avis:', error);
  }
}

/**
 * Configure les références DOM
 */
async function setupDOM() {
  // Vérifier si les éléments critiques existent
  const reviewSection = document.getElementById('reviews');
  if (!reviewSection) {
    debugLog('warn', 'Section avis non trouvée');
    return;
  }

  domElements = {
    // Éléments de notation
    starsContainer: document.getElementById('star-rating'),
    stars: document.querySelectorAll('#star-rating .star'),
    currentRatingDisplay: document.getElementById('current-rating'),
    
    // Formulaire
    commentInput: document.getElementById('comment'),
    submitBtn: document.getElementById('submit-review'),
    reviewForm: document.getElementById('review-form'),
    
    // Liste d'avis
    reviewList: document.getElementById('reviews_body'),
    reviewLoading: document.getElementById('reviews-loading'),
    reviewError: document.getElementById('reviews-error'),
    reviewEmpty: document.getElementById('reviews-empty'),
    
    // Filtres et tri
    sortSelect: document.getElementById('review-sort'),
    filterSelect: document.getElementById('review-filter'),
    searchInput: document.getElementById('review-search'),
    
    // Compteurs
    reviewCount: document.getElementById('review-count'),
    averageRating: document.getElementById('average-rating'),
    
    // Validation
    validationContainer: document.getElementById('review-validation'),
    characterCount: document.getElementById('comment-character-count')
  };

  // Initialiser l'UI
  initializeUI();
}

/**
 * Initialise l'interface utilisateur
 */
function initializeUI() {
  // Initialiser les étoiles
  updateStarsDisplay(0);
  
  // Initialiser le compteur de caractères
  updateCharacterCount();
  
  // Afficher le skeleton loading
  showSkeletonLoading();
}

/**
 * Configure les écouteurs d'événements
 */
async function setupEventListeners() {
  const { 
    stars, 
    commentInput, 
    submitBtn, 
    reviewForm,
    sortSelect,
    filterSelect,
    searchInput
  } = domElements;
  
  if (!stars.length || !commentInput || !submitBtn) {
    debugLog('warn', 'Éléments de formulaire avis non trouvés');
    return;
  }

  // Événements des étoiles
  setupStarEvents();

  // Validation en temps réel du commentaire
  if (commentInput) {
    commentInput.addEventListener('input', () => {
      updateCharacterCount();
      clearFieldError('comment');
      validateComment();
    });
    
    commentInput.addEventListener('blur', () => validateComment());
  }

  // Soumission du formulaire
  if (reviewForm) {
    reviewForm.addEventListener('submit', handleSubmit);
  }

  // Protection contre les soumissions multiples
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      if (reviewState.isSubmitting) {
        e.preventDefault();
        showNotification('Un avis est déjà en cours d\'envoi...', 'warning');
      }
    });
  }

  // Filtres et tri
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      reviewState.sortBy = e.target.value;
      sortAndRenderReviews();
    });
  }

  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      reviewState.filterBy = e.target.value;
      filterAndRenderReviews();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      filterAndRenderReviews();
    }, 300));
  }

  // Raccourci clavier: Ctrl + Enter pour soumettre
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (document.activeElement === commentInput) {
        e.preventDefault();
        reviewForm.dispatchEvent(new Event('submit'));
      }
    }
  });
}

/**
 * Configure les événements des étoiles
 */
function setupStarEvents() {
  const { stars } = domElements;
  
  stars.forEach((star, index) => {
    const value = index + 1;

    // Configuration ARIA
    star.setAttribute('tabindex', '0');
    star.setAttribute('role', 'button');
    star.setAttribute('aria-label', `Noter ${value} étoile${value > 1 ? 's' : ''}`);
    star.setAttribute('aria-pressed', 'false');

    // Clic
    star.addEventListener('click', () => {
      setRating(value);
    });

    // Survol
    star.addEventListener('mouseenter', () => {
      reviewState.currentHoverRating = value;
      updateStarsDisplay(value, true);
    });

    star.addEventListener('mouseleave', () => {
      reviewState.currentHoverRating = 0;
      updateStarsDisplay(reviewState.selectedRating, false);
    });

    // Clavier
    star.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          setRating(value);
          break;
          
        case 'ArrowRight':
          e.preventDefault();
          const nextRating = Math.min(5, (reviewState.selectedRating || 0) + 1);
          setRating(nextRating);
          focusStar(nextRating - 1);
          break;
          
        case 'ArrowLeft':
          e.preventDefault();
          const prevRating = Math.max(1, (reviewState.selectedRating || 1) - 1);
          setRating(prevRating);
          focusStar(prevRating - 1);
          break;
          
        case 'Home':
          e.preventDefault();
          setRating(1);
          focusStar(0);
          break;
          
        case 'End':
          e.preventDefault();
          setRating(5);
          focusStar(4);
          break;
      }
    });

    // Focus
    star.addEventListener('focus', () => {
      star.classList.add('star-focused');
    });

    star.addEventListener('blur', () => {
      star.classList.remove('star-focused');
    });
  });
}

/**
 * Définit la notation
 */
function setRating(rating) {
  reviewState.selectedRating = rating;
  updateStarsDisplay(rating);
  clearFieldError('rating');
  
  // Mettre à jour l'affichage de la notation actuelle
  if (domElements.currentRatingDisplay) {
    domElements.currentRatingDisplay.textContent = `${rating}/5`;
  }
  
  debugLog('info', `Notation sélectionnée: ${rating} étoiles`);
}

/**
 * Met à jour l'affichage des étoiles
 */
function updateStarsDisplay(rating, isHover = false) {
  const { stars } = domElements;
  
  stars.forEach((star, index) => {
    const isActive = index < rating;
    const isHovered = isHover && index < reviewState.currentHoverRating;
    
    star.style.color = isActive ? '#ffc107' : (isHovered ? '#ffeaa7' : '#e9ecef');
    star.style.transform = isHovered ? 'scale(1.1)' : 'scale(1)';
    star.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    
    // Animation de transition
    star.style.transition = 'all 0.2s ease-in-out';
  });
}

/**
 * Focus sur une étoile spécifique
 */
function focusStar(index) {
  const { stars } = domElements;
  if (stars[index]) {
    stars[index].focus();
  }
}

/**
 * Configure la validation
 */
function setupValidation() {
  const { commentInput } = domElements;
  
  if (commentInput) {
    // Validation en temps réel avec debounce
    const debouncedValidation = debounce(() => {
      validateComment();
    }, 500);
    
    commentInput.addEventListener('input', debouncedValidation);
  }
}

/**
 * Valide le commentaire
 */
function validateComment() {
  const { commentInput } = domElements;
  
  if (!commentInput) return true;
  
  const comment = commentInput.value.trim();
  let isValid = true;
  
  if (!comment) {
    reviewState.validationErrors.comment = 'Le commentaire est requis';
    isValid = false;
  } else if (comment.length < 10) {
    reviewState.validationErrors.comment = 'Le commentaire doit contenir au moins 10 caractères';
    isValid = false;
  } else if (comment.length > 600) {
    reviewState.validationErrors.comment = 'Le commentaire ne peut pas dépasser 600 caractères';
    isValid = false;
  } else {
    delete reviewState.validationErrors.comment;
  }
  
  updateFieldUI('comment', isValid);
  return isValid;
}

/**
 * Valide le formulaire complet
 */
function validateForm() {
  let isValid = true;
  
  reviewState.validationErrors = {};
  
  // Validation de la notation
  if (reviewState.selectedRating === 0) {
    reviewState.validationErrors.rating = 'Veuillez sélectionner une notation';
    isValid = false;
  }
  
  // Validation du commentaire
  if (!validateComment()) {
    isValid = false;
  }
  
  return isValid;
}

/**
 * Met à jour l'UI d'un champ
 */
function updateFieldUI(fieldName, isValid) {
  const field = domElements[fieldName];
  const errorElement = document.getElementById(`${fieldName}-error`);
  
  if (!field) return;
  
  if (fieldName === 'comment' && field) {
    field.classList.remove('is-valid', 'is-invalid');
    field.classList.add(isValid ? 'is-valid' : 'is-invalid');
  }
  
  if (errorElement) {
    if (!isValid && reviewState.validationErrors[fieldName]) {
      errorElement.textContent = reviewState.validationErrors[fieldName];
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
  const errorElement = document.getElementById(`${fieldName}-error`);
  
  if (errorElement) {
    errorElement.style.display = 'none';
  }
  
  delete reviewState.validationErrors[fieldName];
}

/**
 * Met à jour le compteur de caractères
 */
function updateCharacterCount() {
  const { commentInput, characterCount } = domElements;
  
  if (!commentInput || !characterCount) return;
  
  const currentLength = commentInput.value.length;
  const maxLength = 600;
  
  characterCount.textContent = `${currentLength}/${maxLength}`;
  
  // Changer la couleur selon le niveau
  const percentage = (currentLength / maxLength) * 100;
  
  characterCount.className = 'form-text text-end';
  if (percentage > 90) {
    characterCount.classList.add('text-danger');
  } else if (percentage > 75) {
    characterCount.classList.add('text-warning');
  } else if (currentLength >= 10) {
    characterCount.classList.add('text-success');
  }
}

/**
 * Gère la soumission du formulaire
 */
async function handleSubmit(e) {
  e.preventDefault();
  
  if (reviewState.isSubmitting) {
    showNotification('Un avis est déjà en cours d\'envoi...', 'warning');
    return;
  }
  
  // Validation
  if (!validateForm()) {
    showValidationErrors();
    return;
  }
  
  await submitReview();
}

/**
 * Affiche les erreurs de validation
 */
function showValidationErrors() {
  const { validationContainer } = domElements;
  
  // Mettre à jour l'UI des champs
  Object.keys(reviewState.validationErrors).forEach(fieldName => {
    updateFieldUI(fieldName, false);
  });
  
  // Afficher le résumé des erreurs
  if (validationContainer) {
    const errorList = Object.values(reviewState.validationErrors)
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
    if (reviewState.validationErrors.rating) {
      focusStar(0);
    } else if (reviewState.validationErrors.comment) {
      domElements.commentInput?.focus();
    }
  }
}

/**
 * Soumet l'avis à l'API
 */
async function submitReview() {
  const { submitBtn, commentInput } = domElements;
  
  reviewState.isSubmitting = true;
  toggleLoading(submitBtn, true, 'Envoi en cours...');
  
  try {
    const reviewData = {
      rating: reviewState.selectedRating,
      comment: sanitizeInput(commentInput.value.trim()),
      name: 'Visiteur', // À remplacer par le nom de l'utilisateur si connecté
      email: null, // Optionnel
      source: 'portfolio_website',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      language: navigator.language
    };
    
    debugLog('info', 'Envoi de l\'avis:', reviewData);
    
    // Envoyer à l'API
    const response = await fetch(CONFIG.apiUrl(CONFIG.ENDPOINTS.REVIEWS.CREATE), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reviewData)
    });
    
    const data = await parseReviewResponse(response);
    
    // Succès
    handleReviewSuccess(data);
    
  } catch (error) {
    // Erreur - sauvegarder localement en fallback
    handleReviewError(error);
    
  } finally {
    reviewState.isSubmitting = false;
    toggleLoading(submitBtn, false, 'Envoyer l\'avis');
  }
}

/**
 * Parse la réponse de l'API avis
 */
async function parseReviewResponse(response) {
  const contentType = response.headers.get('content-type');
  
  if (!response.ok) {
    let errorMessage = `Erreur HTTP ${response.status}`;
    
    if (contentType?.includes('application/json')) {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    }
    
    throw new Error(errorMessage);
  }
  
  if (contentType?.includes('application/json')) {
    return await response.json();
  }
  
  return { message: 'Avis envoyé avec succès' };
}

/**
 * Gère le succès de l'envoi
 */
function handleReviewSuccess(data) {
  const { commentInput, validationContainer } = domElements;
  
  // Réinitialiser le formulaire
  reviewState.selectedRating = 0;
  updateStarsDisplay(0);
  
  if (commentInput) {
    commentInput.value = '';
    commentInput.classList.remove('is-valid');
  }
  
  updateCharacterCount();
  
  // Cacher les erreurs
  if (validationContainer) {
    validationContainer.style.display = 'none';
  }
  
  // Recharger les avis
  loadReviews();
  
  // Afficher la notification
  const successMessage = data?.message || 'Votre avis a été envoyé avec succès !';
  showNotification(successMessage, 'success');
  
  debugLog('success', 'Avis envoyé avec succès');
}

/**
 * Gère l'erreur d'envoi
 */
function handleReviewError(error) {
  console.error('Erreur envoi avis:', error);
  
  let userMessage = error.message;
  
  if (error.message.includes('Network') || error.message.includes('Failed to fetch')) {
    userMessage = 'Erreur de connexion. Votre avis a été sauvegardé localement.';
    saveReviewLocally();
  } else if (error.message.includes('429')) {
    userMessage = 'Trop de tentatives. Veuillez réessayer plus tard.';
  }
  
  showNotification(userMessage, 'error');
}

/**
 * Sauvegarde l'avis localement (fallback)
 */
function saveReviewLocally() {
  const { commentInput } = domElements;
  
  try {
    const review = {
      rating: reviewState.selectedRating,
      comment: commentInput.value.trim(),
      name: 'Visiteur',
      avatar: generateAvatar(),
      timestamp: new Date().toISOString(),
      id: 'local_' + Date.now()
    };
    
    const storedReviews = JSON.parse(localStorage.getItem('portfolio_reviews') || '[]');
    storedReviews.unshift(review);
    localStorage.setItem('portfolio_reviews', JSON.stringify(storedReviews.slice(0, 50)));
    
    // Ajouter à l'affichage
    addReviewToDOM(review);
    
  } catch (error) {
    console.error('Erreur sauvegarde locale avis:', error);
  }
}

/**
 * Charge les avis depuis l'API
 */
export async function loadReviews() {
  const { reviewLoading } = domElements;
  
  if (reviewLoading) {
    reviewLoading.style.display = 'block';
  }
  
  try {
    // Charger depuis l'API
    const apiReviews = await fetchReviewsFromAPI();
    
    // Charger depuis le stockage local
    const localReviews = loadLocalReviews();
    
    // Fusionner et trier
    reviewState.reviews = [...apiReviews, ...localReviews]
      .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
    
    renderReviews();
    updateReviewStats();
    
    debugLog('success', `${reviewState.reviews.length} avis chargés`);
    
  } catch (error) {
    console.error('Erreur chargement avis:', error);
    // Fallback sur les avis locaux
    reviewState.reviews = loadLocalReviews();
    renderReviews();
    updateReviewStats();
  } finally {
    if (reviewLoading) {
      reviewLoading.style.display = 'none';
    }
    hideSkeletonLoading();
  }
}

/**
 * Récupère les avis depuis l'API
 */
async function fetchReviewsFromAPI() {
  try {
    const response = await fetch(CONFIG.apiUrl(CONFIG.ENDPOINTS.REVIEWS.LIST), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    }
    
    return [];
  } catch (error) {
    debugLog('warn', 'API avis non disponible');
    return [];
  }
}

/**
 * Charge les avis du stockage local
 */
function loadLocalReviews() {
  try {
    const stored = localStorage.getItem('portfolio_reviews');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Erreur chargement avis locaux:', error);
    return [];
  }
}

/**
 * Affiche les avis
 */
function renderReviews() {
  const { reviewList, reviewEmpty } = domElements;
  
  if (!reviewList) return;
  
  const filteredReviews = getFilteredReviews();
  
  if (filteredReviews.length === 0) {
    if (reviewEmpty) {
      reviewEmpty.style.display = 'block';
    }
    reviewList.innerHTML = '';
    return;
  }
  
  if (reviewEmpty) {
    reviewEmpty.style.display = 'none';
  }
  
  const sortedReviews = sortReviews(filteredReviews);
  
  reviewList.innerHTML = sortedReviews.map(review => `
    <div class="col-12 col-md-6 col-lg-4 mb-4">
      <article class="card review-card h-100" data-review-id="${review.id}">
        <div class="card-body">
          <div class="d-flex align-items-center mb-3">
            <img src="${review.avatar || generateAvatar()}" 
                 alt="${review.name}" 
                 class="rounded-circle me-3"
                 width="50" 
                 height="50"
                 loading="lazy">
            <div>
              <h6 class="mb-0">${escapeHTML(review.name)}</h6>
              <div class="text-warning small">
                ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}
              </div>
            </div>
          </div>
          <p class="card-text">${escapeHTML(review.comment)}</p>
          <div class="text-muted small">
            <i class="bi bi-clock me-1"></i>
            ${formatReviewDate(review.timestamp)}
          </div>
        </div>
      </article>
    </div>
  `).join('');
}

/**
 * Filtre les avis
 */
function getFilteredReviews() {
  const { searchInput } = domElements;
  let filtered = [...reviewState.reviews];
  
  // Filtre par note
  if (reviewState.filterBy !== 'all') {
    const minRating = parseInt(reviewState.filterBy);
    filtered = filtered.filter(review => review.rating >= minRating);
  }
  
  // Recherche
  if (searchInput && searchInput.value.trim()) {
    const searchTerm = searchInput.value.trim().toLowerCase();
    filtered = filtered.filter(review => 
      review.comment.toLowerCase().includes(searchTerm) ||
      review.name.toLowerCase().includes(searchTerm)
    );
  }
  
  return filtered;
}

/**
 * Trie les avis
 */
function sortReviews(reviews) {
  switch (reviewState.sortBy) {
    case 'newest':
      return reviews.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    case 'oldest':
      return reviews.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    case 'highest':
      return reviews.sort((a, b) => b.rating - a.rating);
    case 'lowest':
      return reviews.sort((a, b) => a.rating - b.rating);
    default:
      return reviews;
  }
}

/**
 * Filtre et affiche les avis
 */
function filterAndRenderReviews() {
  renderReviews();
  updateReviewStats();
}

/**
 * Trie et affiche les avis
 */
function sortAndRenderReviews() {
  renderReviews();
}

/**
 * Met à jour les statistiques des avis
 */
function updateReviewStats() {
  const { reviewCount, averageRating } = domElements;
  
  if (reviewCount) {
    reviewCount.textContent = `${reviewState.reviews.length} avis`;
  }
  
  if (averageRating && reviewState.reviews.length > 0) {
    const average = reviewState.reviews.reduce((sum, review) => sum + review.rating, 0) / reviewState.reviews.length;
    averageRating.textContent = average.toFixed(1);
  }
}

/**
 * Ajoute un avis au DOM
 */
function addReviewToDOM(review) {
  const { reviewList } = domElements;
  
  if (!reviewList) return;
  
  const reviewElement = document.createElement('div');
  reviewElement.className = 'col-12 col-md-6 col-lg-4 mb-4';
  reviewElement.innerHTML = `
    <article class="card review-card h-100" data-review-id="${review.id}">
      <div class="card-body">
        <div class="d-flex align-items-center mb-3">
          <img src="${review.avatar || generateAvatar()}" 
               alt="${review.name}" 
               class="rounded-circle me-3"
               width="50" 
               height="50">
          <div>
            <h6 class="mb-0">${escapeHTML(review.name)}</h6>
            <div class="text-warning small">
              ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}
            </div>
          </div>
        </div>
        <p class="card-text">${escapeHTML(review.comment)}</p>
        <div class="text-muted small">
          <i class="bi bi-clock me-1"></i>
          ${formatReviewDate(review.timestamp)}
        </div>
      </div>
    </article>
  `;
  
  reviewList.prepend(reviewElement);
}

/**
 * Génère un avatar aléatoire
 */
function generateAvatar() {
  const avatars = [
    'https://randomuser.me/api/portraits/men/1.jpg',
    'https://randomuser.me/api/portraits/women/1.jpg',
    'https://randomuser.me/api/portraits/men/2.jpg',
    'https://randomuser.me/api/portraits/women/2.jpg',
    'https://randomuser.me/api/portraits/men/3.jpg',
    'https://randomuser.me/api/portraits/women/3.jpg'
  ];
  return avatars[Math.floor(Math.random() * avatars.length)];
}

/**
 * Formate la date de l'avis
 */
function formatReviewDate(timestamp) {
  if (!timestamp) return 'Date inconnue';
  
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return "Aujourd'hui";
    } else if (diffDays === 1) {
      return 'Hier';
    } else if (diffDays < 7) {
      return `Il y a ${diffDays} jours`;
    } else {
      return date.toLocaleDateString('fr-FR');
    }
  } catch {
    return 'Date inconnue';
  }
}

/**
 * Échappe le HTML pour la sécurité
 */
function escapeHTML(str = "") {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Affiche le skeleton loading
 */
function showSkeletonLoading() {
  const { reviewList } = domElements;
  if (!reviewList) return;
  
  reviewList.innerHTML = `
    <div class="col-12">
      <div class="row">
        ${Array.from({ length: 3 }, (_, i) => `
          <div class="col-md-6 col-lg-4 mb-4">
            <div class="card h-100">
              <div class="card-body">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-title"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-text short"></div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Cache le skeleton loading
 */
function hideSkeletonLoading() {
  // Géré par le chargement des avis
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('reviews')) {
    initReviews();
  }
});

// Export pour les tests
export const _testExports = {
  reviewState,
  validateForm,
  setRating
};