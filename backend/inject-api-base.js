// inject-api-base.js
import fs from "fs";
import path from "path";

// Percorso corretto ai file JS frontend
const JS_DIR = path.join("frontend", "js"); // eseguire dalla root del progetto
const API_BASE = "http://localhost:5000"; // o il tuo API_BASE

function injectApiBase(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");

  // Cerca eventuali righe già con API_BASE e le sostituisce
  const regex = /(const\s+API_BASE\s*=\s*)(["'`].*?["'`])/;
  if (regex.test(content)) {
    content = content.replace(regex, `$1"${API_BASE}"`);
  } else {
    // Se non presente, aggiungi all'inizio
    content = `const API_BASE = "${API_BASE}";\n` + content;
  }

  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`Aggiornato: ${filePath}`);
}

function scanDir(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      scanDir(fullPath);
    } else if (item.isFile() && fullPath.endsWith(".js")) {
      injectApiBase(fullPath);
    }
  }
}

scanDir(JS_DIR);
console.log("✅ Tutti i file JS frontend aggiornati con API_BASE.");
