/**
 * Configuration centralisée de l'application
 * @version 2.2.0 (PATHS absolus + hardening prod + override runtime)
 */

const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production'
};

const getEnvironment = () => {
  const { hostname } = window.location || {};
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return ENVIRONMENTS.DEVELOPMENT;
  if (hostname.includes('staging.') || hostname.includes('test.')) return ENVIRONMENTS.STAGING;
  return ENVIRONMENTS.PRODUCTION;
};

const ENV_CONFIG = {
  [ENVIRONMENTS.DEVELOPMENT]: {
    API_BASE: 'http://localhost:5000',
    DEBUG: true,
    LOG_LEVEL: 'debug',
    ENABLE_ANALYTICS: false,
    CACHE_STRATEGY: 'no-cache',
    USE_MOCK_API: false,
    // Percorsi ASSOLUTI per funzionare anche dentro /page/...
    PATHS: {
      ASSETS: '/assets',
      IMAGES: '/assets/img',
      ICONS:  '/assets/icons',
      LOCALES:'/locales',
      MOCK:   '/mock'
    }
  },
  [ENVIRONMENTS.STAGING]: {
    API_BASE: 'https://staging.api.raphaelgoumou.com',
    DEBUG: true,
    LOG_LEVEL: 'info',
    ENABLE_ANALYTICS: false,
    CACHE_STRATEGY: 'default',
    USE_MOCK_API: false,
    PATHS: {
      ASSETS: '/assets',
      IMAGES: '/assets/img',
      ICONS:  '/assets/icons',
      LOCALES:'/locales',
      MOCK:   '/mock'
    }
  },
  [ENVIRONMENTS.PRODUCTION]: {
    API_BASE: 'https://api.raphaelgoumou.com',
    DEBUG: false,
    LOG_LEVEL: 'warn',
    ENABLE_ANALYTICS: true,
    CACHE_STRATEGY: 'default',
    USE_MOCK_API: false,
    PATHS: {
      ASSETS: '/assets',
      IMAGES: '/assets/img',
      ICONS:  '/assets/icons',
      LOCALES:'/locales',
      MOCK:   '/mock'
    }
  }
};

class AppConfig {
  constructor() {
    this.environment = getEnvironment();
    this.config = this.loadConfig();
    this.validateConfig();
    this.setupGlobalErrorHandling();
  }

  loadConfig() {
    // Base per env corrente
    const envConfig = { ...ENV_CONFIG[this.environment] };

    // Overrides runtime opzionali
    if (window.__APP_CONFIG__) Object.assign(envConfig, window.__APP_CONFIG__);
    if (window.__API_BASE__) envConfig.API_BASE = this.normalizeApiBase(window.__API_BASE__);

    // Normalizza sempre API_BASE
    envConfig.API_BASE = this.normalizeApiBase(envConfig.API_BASE);

    // Header default per fetch
    envConfig.DEFAULT_HEADERS = {
      'Content-Type': 'application/json',
      'Cache-Control': envConfig.CACHE_STRATEGY || 'no-cache'
    };

    return envConfig;
  }

  normalizeApiBase(apiBase) {
    if (!apiBase) return ENV_CONFIG[this.environment].API_BASE;
    return apiBase
      .toString().trim().replace(/\s+/g, '')
      .replace(/([^:]\/)\/+/g, '$1')
      .replace(/\/+$/g, '');
  }

  validateConfig() {
    const { API_BASE } = this.config;
    if (!API_BASE) throw new Error('API_BASE non configurée');
    if (this.environment === ENVIRONMENTS.PRODUCTION && !API_BASE.startsWith('https://')) {
      console.warn('[Config] API_BASE en production devrait utiliser HTTPS');
    }
  }

  setupGlobalErrorHandling() {
    if (!this.config.DEBUG) return;
    window.addEventListener('error', (event) => {
      console.error('[GlobalError]', event.error || event.message);
    });
    window.addEventListener('unhandledrejection', (event) => {
      console.error('[UnhandledRejection]', event.reason);
    });
  }

  // Helpers env
  isDevelopment() { return this.environment === ENVIRONMENTS.DEVELOPMENT; }
  isProduction() { return this.environment === ENVIRONMENTS.PRODUCTION; }

  // Cache-busting per debug
  withCacheBust(url) {
    if (!this.config.DEBUG) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${Date.now()}`;
  }

  // Costruzione URL API e asset
  apiUrl(endpoint = '') {
    if (!endpoint) return this.config.API_BASE;
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    const normalized = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    return `${this.config.API_BASE}/${normalized}`.replace(/([^:]\/)\/+/g, '$1');
  }

  assetUrl(p = '') {
    const base = this.config.PATHS?.ASSETS || '/assets';
    const s = p.startsWith('/') ? p.slice(1) : p;
    return `${base}/${s}`.replace(/\/{2,}/g, '/');
  }
  imageUrl(p = '') {
    const base = this.config.PATHS?.IMAGES || '/assets/img';
    const s = p.startsWith('/') ? p.slice(1) : p;
    return `${base}/${s}`.replace(/\/{2,}/g, '/');
  }
  iconUrl(p = '') {
    const base = this.config.PATHS?.ICONS || '/assets/icons';
    const s = p.startsWith('/') ? p.slice(1) : p;
    return `${base}/${s}`.replace(/\/{2,}/g, '/');
  }
  localeUrl(lang = 'fr') {
    const base = this.config.PATHS?.LOCALES || '/locales';
    const safe = (lang || 'fr').toLowerCase();
    return this.withCacheBust(`${base}/${safe}.json`);
  }
  mockUrl(file = '') {
    const base = this.config.PATHS?.MOCK || '/mock';
    const s = file.startsWith('/') ? file.slice(1) : file;
    return `${base}/${s}`.replace(/\/{2,}/g, '/');
  }

  // Get/Set dinamici
  get(key, def = null) { return this.config[key] ?? def; }
  set(key, value) { this.config[key] = value; }

  // Log rapidi
  logConfig() {
    if (!this.get('DEBUG')) return;
    console.group('🔧 AppConfig');
    console.log('Env:', this.environment);
    console.log('API Base:', this.get('API_BASE'));
    console.log('Paths:', this.get('PATHS'));
    console.groupEnd();
  }
}

const appConfig = new AppConfig();

// Export principali
export const API_BASE  = appConfig.get('API_BASE');
export const APP_CONFIG = appConfig;

export const CONFIG = {
  ENVIRONMENT: appConfig.environment,
  IS_DEV: appConfig.isDevelopment(),
  IS_PROD: appConfig.isProduction(),

  apiUrl: (endpoint) => appConfig.apiUrl(endpoint),
  assetUrl: (path) => appConfig.assetUrl(path),
  imageUrl: (path) => appConfig.imageUrl(path),
  iconUrl: (path) => appConfig.iconUrl(path),
  localeUrl: (lang) => appConfig.localeUrl(lang),
  mockUrl: (file) => appConfig.mockUrl(file),
  withCacheBust: (url) => appConfig.withCacheBust(url),

  get: (k, d) => appConfig.get(k, d),
  set: (k, v) => appConfig.set(k, v),

  DEFAULT_HEADERS: appConfig.get('DEFAULT_HEADERS'),
  ENDPOINTS: {
    AUTH: {
      LOGIN:    'api/auth/login',
      REGISTER: 'api/auth/register',
      LOGOUT:   'api/auth/logout',
      REFRESH:  'api/auth/refresh',
      PROFILE:  'api/auth/profile',
      VERIFY:   'api/auth/verify' // per verifyToken()
    },
    PROJECTS: {
      LIST:       'api/projects',
      CREATE:     'api/projects',
      UPDATE:     'api/projects/:id',
      DELETE:     'api/projects/:id',
      ADMIN_ALL:  'api/projects/admin/all' // pannello admin
    },
    STATS: {
      OVERVIEW:     'api/stats/overview',
      TECHNOLOGIES: 'api/stats/technologies',
      TIMELINE:     'api/stats/timeline',
      HEALTH:       'api/stats/health'
    },
    CONTACT: {
      SEND:      'api/contact',
      MESSAGES:  'api/contact/messages'
    },
    NEWSLETTER: {
      SUBSCRIBE:   'api/newsletter/subscribe',
      UNSUBSCRIBE: 'api/newsletter/unsubscribe',
      SUBSCRIBERS: 'api/newsletter/subscribers'
    },
    REVIEWS: {
      LIST:   'api/reviews',
      CREATE: 'api/reviews',
      UPDATE: 'api/reviews/:id',
      DELETE: 'api/reviews/:id'
    }
  }
};

// Debug automatico in dev
document.addEventListener('DOMContentLoaded', () => {
  appConfig.logConfig();
  if (appConfig.isDevelopment()) {
    window.__CONFIG_DEBUG__ = {
      config: appConfig.config,
      environment: appConfig.environment,
      endpoints: CONFIG.ENDPOINTS
    };
  }
});

export default CONFIG;
