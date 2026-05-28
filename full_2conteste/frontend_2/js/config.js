// frontend/js/config.js
export const API_BASE = (window.__API_BASE__ || (
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : ""
))
  .toString()
  .trim()
  .replace(/\s+/g, '')     // rimuove spazi accidentali
  .replace(/\/+$/g, '');   // rimuove slash finali
