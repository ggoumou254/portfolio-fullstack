// validate_locales.js
// Usage: ouvrir la page dans un serveur local (ex: npx serve) puis ouvrir la console et ce script s'exécutera automatiquement.
// Il va charger les 3 locales et lister les clés manquantes par fichier.

(async () => {
  const locales = ['fr', 'en', 'it'];
  const base = '/locales';
  async function load(l) {
    try {
      const r = await fetch(`${base}/${l}.json`, {cache: 'no-store'});
      return await r.json();
    } catch (e) {
      console.error('Impossible de charger', l, e);
      return null;
    }
  }

  const data = {};
  for (const l of locales) {
    data[l] = await load(l);
  }

  const allKeys = new Set();
  for (const l of locales) {
    if (data[l]) Object.keys(data[l]).forEach(k => allKeys.add(k));
  }

  const report = {};
  for (const l of locales) {
    report[l] = [];
    if (!data[l]) {
      report[l].push('Fichier non chargé');
      continue;
    }
    for (const k of allKeys) {
      if (!(k in data[l])) report[l].push(k);
    }
  }

  console.group('Validation locales');
  for (const l of locales) {
    if (report[l].length === 0) {
      console.log(`${l}: OK — toutes les clés présentes`);
    } else {
      console.warn(`${l}: clés manquantes ->`, report[l]);
    }
  }
  console.groupEnd();
})();
