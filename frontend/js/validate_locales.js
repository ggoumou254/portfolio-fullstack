// frontend/js/validate-locales.js

/**
 * Script de validation avancé pour les fichiers de traduction
 * @version 2.0.0
 * @author Raphael Goumou
 */

class LocaleValidator {
  constructor(config = {}) {
    this.config = {
      locales: ['fr', 'en', 'it'],
      localesPath: '/locales',
      cacheBust: true,
      showSuccess: true,
      showWarnings: true,
      showErrors: true,
      deepValidation: true,
      maxDepth: 5,
      ...config
    };
    
    this.results = {
      loaded: {},
      errors: {},
      warnings: {},
      stats: {}
    };
    
    this.allKeys = new Set();
    this.keyStructure = new Map();
  }

  /**
   * Exécute la validation complète
   */
  async validate() {
    console.group('🌐 Validation des fichiers de traduction');
    
    try {
      await this.loadAllLocales();
      await this.collectAllKeys();
      await this.validateStructure();
      await this.validateCompleteness();
      await this.validateValues();
      await this.generateReport();
      
    } catch (error) {
      console.error('❌ Erreur lors de la validation:', error);
    } finally {
      console.groupEnd();
    }
    
    return this.results;
  }

  /**
   * Charge tous les fichiers de traduction
   */
  async loadAllLocales() {
    console.log('📥 Chargement des fichiers de traduction...');
    
    for (const locale of this.config.locales) {
      try {
        const url = `${this.config.localesPath}/${locale}.json`;
        const cacheOption = this.config.cacheBust ? { cache: 'no-store' } : {};
        
        const response = await fetch(url, cacheOption);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (typeof data !== 'object' || data === null) {
          throw new Error('Format JSON invalide');
        }
        
        this.results.loaded[locale] = data;
        this.results.stats[locale] = {
          totalKeys: this.countKeys(data),
          fileSize: JSON.stringify(data).length
        };
        
        console.log(`✅ ${locale}: ${this.results.stats[locale].totalKeys} clés chargées`);
        
      } catch (error) {
        console.error(`❌ ${locale}: Erreur de chargement - ${error.message}`);
        this.results.errors[locale] = this.results.errors[locale] || [];
        this.results.errors[locale].push(`Erreur chargement: ${error.message}`);
      }
    }
  }

  /**
   * Collecte toutes les clés de toutes les langues
   */
  async collectAllKeys() {
    console.log('🔍 Collecte de toutes les clés...');
    
    for (const [locale, data] of Object.entries(this.results.loaded)) {
      this.extractKeys(data, '', locale);
    }
    
    console.log(`📋 Total des clés uniques: ${this.allKeys.size}`);
  }

  /**
   * Extrait récursivement les clés d'un objet
   */
  extractKeys(obj, currentPath = '', locale = '') {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = currentPath ? `${currentPath}.${key}` : key;
      
      // Ajouter à l'ensemble global des clés
      this.allKeys.add(fullPath);
      
      // Stocker la structure
      if (!this.keyStructure.has(fullPath)) {
        this.keyStructure.set(fullPath, new Set());
      }
      this.keyStructure.get(fullPath).add(locale);
      
      // Exploration récursive si activée
      if (this.config.deepValidation && 
          typeof value === 'object' && 
          value !== null &&
          this.getDepth(fullPath) < this.config.maxDepth) {
        this.extractKeys(value, fullPath, locale);
      }
    }
  }

  /**
   * Calcule la profondeur d'une clé
   */
  getDepth(key) {
    return key.split('.').length;
  }

  /**
   * Compte le nombre total de clés dans un objet
   */
  countKeys(obj) {
    let count = 0;
    
    function countRecursive(currentObj) {
      if (typeof currentObj !== 'object' || currentObj === null) return;
      
      for (const key in currentObj) {
        count++;
        if (typeof currentObj[key] === 'object' && currentObj[key] !== null) {
          countRecursive(currentObj[key]);
        }
      }
    }
    
    countRecursive(obj);
    return count;
  }

  /**
   * Valide la structure des fichiers
   */
  async validateStructure() {
    console.log('🏗️  Validation de la structure...');
    
    for (const locale of this.config.locales) {
      const data = this.results.loaded[locale];
      if (!data) continue;
      
      this.results.warnings[locale] = this.results.warnings[locale] || [];
      
      // Vérifier les valeurs vides
      this.findEmptyValues(data, '', locale);
      
      // Vérifier la longueur des valeurs
      this.validateValueLengths(data, '', locale);
    }
  }

  /**
   * Trouve les valeurs vides
   */
  findEmptyValues(obj, currentPath = '', locale = '') {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = currentPath ? `${currentPath}.${key}` : key;
      
      if (typeof value === 'string' && value.trim() === '') {
        this.results.warnings[locale].push(`Valeur vide: "${fullPath}"`);
      } else if (typeof value === 'object' && value !== null) {
        this.findEmptyValues(value, fullPath, locale);
      }
    }
  }

  /**
   * Valide la longueur des valeurs
   */
  validateValueLengths(obj, currentPath = '', locale = '') {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = currentPath ? `${currentPath}.${key}` : key;
      
      if (typeof value === 'string') {
        if (value.length > 500) {
          this.results.warnings[locale].push(`Valeur très longue (${value.length} caractères): "${fullPath}"`);
        } else if (value.length < 2 && value.trim() !== '') {
          this.results.warnings[locale].push(`Valeur très courte: "${fullPath}"`);
        }
      } else if (typeof value === 'object' && value !== null) {
        this.validateValueLengths(value, fullPath, locale);
      }
    }
  }

  /**
   * Valide la complétude des traductions
   */
  async validateCompleteness() {
    console.log('✅ Validation de la complétude...');
    
    for (const locale of this.config.locales) {
      const data = this.results.loaded[locale];
      if (!data) continue;
      
      this.results.errors[locale] = this.results.errors[locale] || [];
      
      // Vérifier les clés manquantes
      const missingKeys = [];
      
      for (const key of this.allKeys) {
        if (!this.keyStructure.get(key)?.has(locale)) {
          missingKeys.push(key);
        }
      }
      
      if (missingKeys.length > 0) {
        this.results.errors[locale].push(...missingKeys.map(k => `Clé manquante: "${k}"`));
      }
      
      // Statistiques de complétude
      const totalKeysForLocale = this.countKeys(data);
      const completeness = this.allKeys.size > 0 
        ? ((this.allKeys.size - missingKeys.length) / this.allKeys.size * 100).toFixed(1)
        : 0;
      
      this.results.stats[locale].completeness = completeness;
      this.results.stats[locale].missingKeys = missingKeys.length;
    }
  }

  /**
   * Valide le contenu des valeurs
   */
  async validateValues() {
    console.log('🔤 Validation du contenu...');
    
    for (const locale of this.config.locales) {
      const data = this.results.loaded[locale];
      if (!data) continue;
      
      this.results.warnings[locale] = this.results.warnings[locale] || [];
      
      // Vérifier les placeholders non traduits
      this.findUntranslatedPlaceholders(data, '', locale);
      
      // Vérifier la cohérence des formats
      this.validateFormatConsistency(data, '', locale);
    }
  }

  /**
   * Trouve les placeholders non traduits
   */
  findUntranslatedPlaceholders(obj, currentPath = '', locale = '') {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = currentPath ? `${currentPath}.${key}` : key;
      
      if (typeof value === 'string') {
        // Détecter les patterns communs de placeholders
        const placeholderPatterns = [
          /\{\{.*?\}\}/g,    // {{placeholder}}
          /\%\{.*?\}/g,      // %{placeholder}
          /\$[A-Z_]+/g,      // $PLACEHOLDER
          /\[\[.*?\]\]/g     // [[placeholder]]
        ];
        
        for (const pattern of placeholderPatterns) {
          const matches = value.match(pattern);
          if (matches) {
            this.results.warnings[locale].push(
              `Placeholders détectés dans "${fullPath}": ${matches.join(', ')}`
            );
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        this.findUntranslatedPlaceholders(value, fullPath, locale);
      }
    }
  }

  /**
   * Valide la cohérence des formats
   */
  validateFormatConsistency(obj, currentPath = '', locale = '') {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = currentPath ? `${currentPath}.${key}` : key;
      
      if (typeof value === 'string') {
        // Vérifier les espaces superflus
        if (value !== value.trim()) {
          this.results.warnings[locale].push(`Espaces superflus dans: "${fullPath}"`);
        }
        
        // Vérifier la ponctuation finale
        if (value.length > 10 && !/[.!?…]$/.test(value.trim())) {
          this.results.warnings[locale].push(`Ponctuation finale manquante dans: "${fullPath}"`);
        }
      } else if (typeof value === 'object' && value !== null) {
        this.validateFormatConsistency(value, fullPath, locale);
      }
    }
  }

  /**
   * Génère le rapport final
   */
  async generateReport() {
    console.log('📊 Génération du rapport...');
    
    // Résumé général
    this.printGeneralSummary();
    
    // Détails par langue
    for (const locale of this.config.locales) {
      this.printLocaleDetails(locale);
    }
    
    // Recommandations
    this.printRecommendations();
    
    // Export des données (pour debugging)
    this.exportResults();
  }

  /**
   * Affiche le résumé général
   */
  printGeneralSummary() {
    console.group('📈 Résumé général');
    
    const totalKeys = this.allKeys.size;
    const loadedLocales = Object.keys(this.results.loaded).length;
    const totalErrors = Object.values(this.results.errors).flat().length;
    const totalWarnings = Object.values(this.results.warnings).flat().length;
    
    console.log(`🗂️  Langues chargées: ${loadedLocales}/${this.config.locales.length}`);
    console.log(`🔑 Clés uniques totales: ${totalKeys}`);
    console.log(`❌ Erreurs totales: ${totalErrors}`);
    console.log(`⚠️  Avertissements totaux: ${totalWarnings}`);
    
    // Tableau de complétude
    console.table(
      Object.entries(this.results.stats).reduce((acc, [locale, stats]) => {
        acc[locale] = {
          'Clés': stats.totalKeys || 0,
          'Complétude': `${stats.completeness || 0}%`,
          'Manquantes': stats.missingKeys || 0,
          'Taille': `${(stats.fileSize / 1024).toFixed(2)} KB`
        };
        return acc;
      }, {})
    );
    
    console.groupEnd();
  }

  /**
   * Affiche les détails par langue
   */
  printLocaleDetails(locale) {
    const hasErrors = this.results.errors[locale]?.length > 0;
    const hasWarnings = this.results.warnings[locale]?.length > 0;
    
    if (!hasErrors && !hasWarnings && this.config.showSuccess) {
      console.log(`✅ ${locale.toUpperCase()}: Aucun problème détecté`);
      return;
    }
    
    console.group(`${locale.toUpperCase()}: Détails`);
    
    // Erreurs
    if (hasErrors && this.config.showErrors) {
      console.group(`❌ Erreurs (${this.results.errors[locale].length})`);
      this.results.errors[locale].forEach(error => console.log(`• ${error}`));
      console.groupEnd();
    }
    
    // Avertissements
    if (hasWarnings && this.config.showWarnings) {
      console.group(`⚠️  Avertissements (${this.results.warnings[locale].length})`);
      this.results.warnings[locale].forEach(warning => console.log(`• ${warning}`));
      console.groupEnd();
    }
    
    // Statistiques
    const stats = this.results.stats[locale];
    if (stats) {
      console.log(`📊 Clés: ${stats.totalKeys}, Complétude: ${stats.completeness}%`);
    }
    
    console.groupEnd();
  }

  /**
   * Affiche les recommandations
   */
  printRecommendations() {
    const totalErrors = Object.values(this.results.errors).flat().length;
    const totalWarnings = Object.values(this.results.warnings).flat().length;
    
    if (totalErrors === 0 && totalWarnings === 0) {
      console.log('🎉 Excellent! Toutes les traductions sont valides et complètes.');
      return;
    }
    
    console.group('💡 Recommandations');
    
    if (totalErrors > 0) {
      console.log('🔧 Actions critiques:');
      console.log('• Complétez les clés manquantes dans chaque langue');
      console.log('• Corrigez les erreurs de structure');
    }
    
    if (totalWarnings > 0) {
      console.log('📝 Améliorations suggérées:');
      console.log('• Vérifiez les valeurs vides ou très courtes');
      console.log('• Traduisez les placeholders restants');
      console.log('• Uniformisez la ponctuation');
      console.log('• Évitez les espaces superflus');
    }
    
    console.log('🚀 Pour synchroniser automatiquement les clés:');
    console.log('• Utilisez un outil comme i18next-parser');
    console.log('• Mettez en place un pipeline CI/CD');
    console.log('• Utilisez une plateforme de gestion de traductions');
    
    console.groupEnd();
  }

  /**
   * Exporte les résultats pour debugging
   */
  exportResults() {
    // Créer un objet exportable
    const exportData = {
      timestamp: new Date().toISOString(),
      config: this.config,
      results: {
        allKeys: Array.from(this.allKeys),
        keyStructure: Object.fromEntries(
          Array.from(this.keyStructure.entries()).map(([key, locales]) => [
            key,
            Array.from(locales)
          ])
        ),
        stats: this.results.stats,
        errors: this.results.errors,
        warnings: this.results.warnings
      }
    };
    
    // Stocker dans window pour accès global
    window.localeValidationResults = exportData;
    
    console.log('💾 Résultats exportés dans window.localeValidationResults');
    
    // Option: Télécharger comme fichier JSON
    if (this.config.exportFile) {
      this.downloadResults(exportData);
    }
  }

  /**
   * Télécharge les résultats comme fichier JSON
   */
  downloadResults(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `locale-validation-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Génère un rapport de différences entre deux langues
   */
  compareLocales(locale1, locale2) {
    const keys1 = this.getFlatKeys(this.results.loaded[locale1] || {});
    const keys2 = this.getFlatKeys(this.results.loaded[locale2] || {});
    
    const uniqueTo1 = keys1.filter(k => !keys2.includes(k));
    const uniqueTo2 = keys2.filter(k => !keys1.includes(k));
    
    console.group(`🔍 Comparaison ${locale1} ↔ ${locale2}`);
    console.log(`Clés uniques à ${locale1}:`, uniqueTo1);
    console.log(`Clés uniques à ${locale2}:`, uniqueTo2);
    console.groupEnd();
    
    return { uniqueTo1, uniqueTo2 };
  }

  /**
   * Obtient toutes les clés d'un objet de manière plate
   */
  getFlatKeys(obj, prefix = '') {
    const keys = [];
    
    function collectKeys(currentObj, currentPrefix) {
      if (typeof currentObj !== 'object' || currentObj === null) return;
      
      for (const [key, value] of Object.entries(currentObj)) {
        const fullKey = currentPrefix ? `${currentPrefix}.${key}` : key;
        keys.push(fullKey);
        
        if (typeof value === 'object' && value !== null) {
          collectKeys(value, fullKey);
        }
      }
    }
    
    collectKeys(obj, prefix);
    return keys;
  }
}

// Interface simple pour utilisation rapide
window.validateLocales = async function(config = {}) {
  const validator = new LocaleValidator(config);
  return await validator.validate();
};

// Auto-exécution si demandé
if (window.AUTO_VALIDATE_LOCALES) {
  document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Validation automatique des locales...');
    await window.validateLocales();
  });
}

// Export pour les tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LocaleValidator };
}