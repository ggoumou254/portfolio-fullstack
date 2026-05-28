// frontend/js/review.js

// Util: escape per evitare HTML injection
function escapeHTML(str = "") {
  return str.replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}

// Prova a prendere i nodi del footer (possono non esserci in qualche pagina)
const stars = document.querySelectorAll('#star-rating .star');
const commentInput = document.getElementById('comment');
const submitBtn = document.getElementById('submit-review');
const reviewList = document.getElementById('reviews_body');

// Se non esistono, esci silenziosamente
if (!stars.length || !commentInput || !submitBtn || !reviewList) {
  // console.debug('[review] elementi non presenti in DOM');
} else {
  let selectedRating = 0;

  // Carica da localStorage (facoltativo, utile per test)
  const STORAGE_KEY = "rg_reviews_local";
  function loadLocalReviews() {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      arr.forEach(addReviewToDOM);
    } catch {}
  }
  function saveLocalReview(review) {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      arr.unshift(review);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, 50))); // cap a 50
    } catch {}
  }

  // Aggiorna stelle (mouse e tastiera)
  function paint(count) {
    stars.forEach((star, idx) => {
      star.style.color = idx < count ? 'gold' : 'lightgray';
      star.setAttribute('aria-pressed', idx < count ? 'true' : 'false');
    });
  }

  // Eventi per ogni stella
  stars.forEach((star, index) => {
    const value = index + 1;

    // Ruoli ARIA per accessibilità
    star.setAttribute('tabindex', '0');
    star.setAttribute('role', 'button');
    star.setAttribute('aria-label', `${value} stella${value > 1 ? 'e' : ''}`);

    star.addEventListener('click', () => {
      selectedRating = value;
      paint(selectedRating);
    });

    star.addEventListener('mouseover', () => paint(value));
    star.addEventListener('mouseout', () => paint(selectedRating));

    // Tastiera: Enter/Space
    star.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectedRating = value;
        paint(selectedRating);
      }
      // Frecce sinistra/destra
      if (e.key === 'ArrowRight') {
        selectedRating = Math.min(5, selectedRating + 1 || 1);
        paint(selectedRating);
        stars[Math.max(0, selectedRating - 1)].focus();
      }
      if (e.key === 'ArrowLeft') {
        selectedRating = Math.max(1, (selectedRating || 1) - 1);
        paint(selectedRating);
        stars[Math.max(0, selectedRating - 1)].focus();
      }
    });
  });

  function addReviewToDOM({ rating, comment, avatar, name }) {
    const safeComment = escapeHTML(comment || "");
    const safeName = escapeHTML(name || "Utente anonimo");
    const safeAvatar = avatar || "https://randomuser.me/api/portraits/men/75.jpg";

    const newReview = document.createElement('div');
    newReview.classList.add('review');
    newReview.innerHTML = `
      <img src="${safeAvatar}" alt="utente" loading="lazy">
      <div class="review-content">
        <h3>${safeName} <span class="stars">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span></h3>
        <p>${safeComment}</p>
      </div>
    `;
    reviewList.prepend(newReview);
  }

  submitBtn.addEventListener('click', () => {
    const comment = (commentInput.value || "").trim();

    if (selectedRating === 0 || !comment) {
      alert('Inserisci una valutazione e un commento!');
      return;
    }
    if (comment.length > 600) {
      alert('Il commento è troppo lungo (max 600 caratteri).');
      return;
    }

    const review = {
      rating: selectedRating,
      comment,
      name: "Utente anonimo",
      avatar: "https://randomuser.me/api/portraits/men/75.jpg"
    };

    addReviewToDOM(review);
    saveLocalReview(review);

    // Reset UI
    selectedRating = 0;
    paint(selectedRating);
    commentInput.value = '';
  });

  // init
  paint(0);
  loadLocalReviews();
}
