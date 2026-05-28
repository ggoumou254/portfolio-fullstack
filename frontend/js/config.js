/**
 * Configurazione centralizzata
 * @version 2.4.0
 */

const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',

  PRODUCTION: 'production'
};

const getEnvironment = () => {
  const { hostname, port } = window.location || {};

  // localhost e IP locali/hotspot
  const localHosts = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
  const localRanges = ['192.168.', '10.', '172.'];

  if (!hostname || localHosts.includes(hostname)) return ENVIRONMENTS.DEVELOPMENT;
  if (localRanges.some(r => hostname.startsWith(r))) return ENVIRONMENTS.DEVELOPMENT;

  // Porte di sviluppo
  const devPorts = ['3000', '5500', '5501', '8080', '8000', '4200', '4000'];
  if (port && devPorts.includes(port)) return ENVIRONMENTS.DEVELOPMENT;

  if (hostname.includes('staging.') || hostname.includes('test.')) return ENVIRONMENTS.STAGING;
  return ENVIRONMENTS.PRODUCTION;
};

const ENV_CONFIG = {
  [ENVIRONMENTS.DEVELOPMENT]: {
    API_BASE: 'http://localhost:5000',
    DEBUG: true,
    PATHS: { ASSETS: '/assets', IMAGES: '/assets/img', ICONS: '/assets/icons', LOCALES: '/locales' }
  },
  [ENVIRONMENTS.STAGING]: {
    API_BASE: 'https://staging-api.raphaelgoumou.com',
    DEBUG: true,
    PATHS: { ASSETS: '/assets', IMAGES: '/assets/img', ICONS: '/assets/icons', LOCALES: '/locales' }
  },
  [ENVIRONMENTS.PRODUCTION]: {
    API_BASE: 'https://portfolio-fullstack-j5am.onrender.com',
    DEBUG: false,
    PATHS: { ASSETS: '/assets', IMAGES: '/assets/img', ICONS: '/assets/icons', LOCALES: '/locales' }
  }
};

class AppConfig {
  constructor() {
    this.environment = getEnvironment();
    this.config = this._loadConfig();
    this._setupErrorHandling();
    this._logConfig();
  }

  _loadConfig() {
    const cfg = { ...ENV_CONFIG[this.environment] };
    if (window.__API_BASE__) cfg.API_BASE = this._normalize(window.__API_BASE__);
    cfg.API_BASE = this._normalize(cfg.API_BASE);
    return cfg;
  }

  _normalize(base) {
    if (!base) return ENV_CONFIG[this.environment].API_BASE;
    return String(base).trim().replace(/\/+$/, '');
  }

  _setupErrorHandling() {
    if (!this.config.DEBUG) return;
    window.addEventListener('error', e => console.error('[GlobalError]', e.error || e.message));
    window.addEventListener('unhandledrejection', e => console.error('[UnhandledRejection]', e.reason));
  }

  _logConfig() {
    if (!this.config.DEBUG) return;
    console.log('🔧 AppConfig');
    console.log('Env:', this.environment);
    console.log('API Base:', this.config.API_BASE);
    console.log('Paths:', this.config.PATHS);
  }

  isDevelopment() { return this.environment === ENVIRONMENTS.DEVELOPMENT; }
  isProduction() { return this.environment === ENVIRONMENTS.PRODUCTION; }

  apiUrl(endpoint = '') {
    if (!endpoint) return this.config.API_BASE;
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    const norm = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    return `${this.config.API_BASE}/${norm}`.replace(/([^:]\/)\/+/g, '$1');
  }

  get(key, def = null) { return this.config[key] ?? def; }
  set(key, value) { this.config[key] = value; }
}

const appConfig = new AppConfig();

export const API_BASE = appConfig.get('API_BASE');
export const APP_CONFIG = appConfig;

export const CONFIG = {
  ENVIRONMENT: appConfig.environment,
  IS_DEV: appConfig.isDevelopment(),
  IS_PROD: appConfig.isProduction(),

  apiUrl: (endpoint) => appConfig.apiUrl(endpoint),
  get: (k, d) => appConfig.get(k, d),
  set: (k, v) => appConfig.set(k, v),

  ENDPOINTS: {
    AUTH: {
      LOGIN: 'api/auth/login',
      REGISTER: 'api/auth/register',
      LOGOUT: 'api/auth/logout',
      REFRESH: 'api/auth/refresh',
      PROFILE: 'api/auth/profile',
      VERIFY: 'api/auth/verify'
    },
    PROJECTS: {
      LIST: 'api/projects',
      CREATE: 'api/projects',
      UPDATE: 'api/projects/:id',
      DELETE: 'api/projects/:id',
      ADMIN_ALL: 'api/projects/admin/all'
    },
    STATS: {
      OVERVIEW: 'api/stats/overview',
      TECHNOLOGIES: 'api/stats/technologies',
      HEALTH: 'api/stats/health'
    },
    CONTACT: {
      SEND: 'api/contact',
      MESSAGES: 'api/contact/messages'
    },
    NEWSLETTER: {
      SUBSCRIBE: 'api/newsletter/subscribe',
      UNSUBSCRIBE: 'api/newsletter/unsubscribe'
    },
    REVIEWS: {
      LIST: 'api/reviews',
      CREATE: 'api/reviews'
    }
  }
};

export default CONFIG;