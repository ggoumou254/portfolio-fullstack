// frontend/js/utils.js

// Formatta una data ISO in dd/mm/yyyy
export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Tronca una stringa a n caratteri con ellissi
export function truncate(str = "", n = 60) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}
