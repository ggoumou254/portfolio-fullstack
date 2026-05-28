// frontend/js/stats.js
const API_BASE =
  window.__API_BASE__ ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "");

let techChartInstance = null;

function $(sel, root = document) { return root.querySelector(sel); }
function setErr(msg) { const box = $("#stats-error"); if (box) box.textContent = msg || ""; }

// --- MOCK (usato se API down o se ?mock=1) ---
const MOCK_DATA = {
  projectsCount: 8,
  contactsCount: 21,
  subscribersCount: 134,
  techUsage: {
    "React": 7,
    "Node.js": 6,
    "Express": 5,
    "MongoDB": 4,
    "Bootstrap": 3,
    "Tailwind": 2
  }
};

function shouldUseMock() {
  const url = new URL(location.href);
  return url.searchParams.get("mock") === "1";
}

// carica Chart.js solo se manca
async function ensureChartJs() {
  if (window.Chart) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Impossibile caricare Chart.js"));
    document.head.appendChild(s);
  });
}

async function fetchStats() {
  const res = await fetch(`${API_BASE}/api/stats`, { cache: "no-cache" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Errore nel recupero dati (${res.status}) ${txt || ""}`);
  }
  return res.json();
}

function updateCounters({ projectsCount = 0, contactsCount = 0, subscribersCount = 0 } = {}) {
  $("#total-projects").textContent = projectsCount;
  $("#total-contacts").textContent = contactsCount;
  $("#total-subscribers").textContent = subscribersCount;
}

function createTechChart(techUsage = {}) {
  const canvas = $("#techChart");
  if (!canvas) return;

  const labels = Object.keys(techUsage);
  const values = Object.values(techUsage);

  if (techChartInstance) {
    techChartInstance.destroy();
    techChartInstance = null;
  }

  const ctx = canvas.getContext("2d");
  techChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        label: "Tecnologie usate",
        data: values,
        backgroundColor: [
          "#0d6efd", "#198754", "#ffc107", "#dc3545", "#20c997", "#6f42c1", "#6610f2", "#fd7e14"
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } }
    }
  });
}

export async function initStats() {
  setErr("");
  try {
    await ensureChartJs();

    let data;
    if (shouldUseMock()) {
      // forzato da querystring
      data = MOCK_DATA;
    } else {
      try {
        data = await fetchStats();
      } catch (apiErr) {
        console.warn("API stats non disponibile, uso MOCK:", apiErr);
        data = MOCK_DATA;
        setErr("API non disponibile: visualizzazione dati di esempio.");
      }
    }

    updateCounters(data || {});
    createTechChart(data?.techUsage || {});
  } catch (err) {
    console.error(err);
    setErr(
      (err instanceof TypeError
        ? "Errore di rete (controlla backend/CORS). "
        : "") + (err.message || "Errore sconosciuto.")
    );
  }
}
