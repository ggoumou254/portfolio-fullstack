// frontend/js/highlight-init.js
(function () {
  function sanitizeLanguageClasses() {
    document.querySelectorAll('code[class*="language-"]').forEach(el => {
      // prendi solo il PRIMO token "language-xxx"
      const m = el.className.match(/language-([a-z0-9#+\-]+)/i);
      if (m) {
        el.className = 'language-' + m[1].toLowerCase();
      } else {
        el.classList.add('nohighlight');
      }
    });
}

function initHighlight() {
    if (window.hljs?.highlightAll) {
    window.hljs.highlightAll();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    sanitizeLanguageClasses();
    initHighlight();
});
})();
