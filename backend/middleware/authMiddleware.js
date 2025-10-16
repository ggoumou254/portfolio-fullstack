// backend/middleware/authMiddleware.js
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User.js';
import { verifyAccessToken, getBearerToken } from '../utils/token.js';

const MESSAGES = {
  ERROR: {
    TOKEN_MISSING: "Token d'authentification manquant",
    TOKEN_INVALID: 'Token invalide',
    TOKEN_EXPIRED: 'Token expiré',
    FORMAT_INVALID: "Format d'authentification invalide",
    USER_NOT_FOUND: 'Utilisateur non trouvé',
    AUTH_REQUIRED: 'Authentification requise',
    INSUFFICIENT_PERMISSIONS: 'Permissions insuffisantes',
    SERVER_ERROR: "Erreur d'authentification"
  }
};

/** Helper: invia risposta JSON d’errore standard + headers utili */
function sendAuthError(res, status, message, code) {
  if (status === 401) {
    // conformità RFC 6750: utile ai client per capire che serve un Bearer
    res.setHeader('WWW-Authenticate', 'Bearer realm="api", error="invalid_token"');
  }
  // propaga X-Request-Id se presente
  if (res.req?.requestId) res.setHeader('X-Request-Id', res.req.requestId);
  return res.status(status).json({ success: false, message, code });
}

/** Richiede JWT valido, carica req.user */
export const verifyToken = async (req, res, next) => {
  try {
    if (req.method === 'OPTIONS') return next();

    // assicura un requestId
    req.requestId = req.requestId || uuidv4();

    const token = getBearerToken(req);
    if (!token) {
      return sendAuthError(res, 401, MESSAGES.ERROR.TOKEN_MISSING, 'MISSING_TOKEN');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      const name = err?.name;
      const code =
        name === 'TokenExpiredError' ? 'TOKEN_EXPIRED'
        : name === 'JsonWebTokenError' ? 'INVALID_TOKEN'
        : 'TOKEN_VERIFICATION_FAILED';

      const message =
        code === 'TOKEN_EXPIRED' ? MESSAGES.ERROR.TOKEN_EXPIRED : MESSAGES.ERROR.TOKEN_INVALID;

      return sendAuthError(res, 401, message, code);
    }

    const user = await User.findById(payload.id).select('-passwordHash -refreshTokenHash');
    if (!user) {
      return sendAuthError(res, 404, MESSAGES.ERROR.USER_NOT_FOUND, 'USER_NOT_FOUND');
    }
    if (user.isActive === false) {
      return sendAuthError(res, 403, 'Compte utilisateur désactivé', 'ACCOUNT_DISABLED');
    }

    const safeUser = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    };

    req.user = safeUser;
    res.locals.user = safeUser; // utile nei controller o view
    return next();
  } catch (error) {
    // log minimale con contesto utile, senza dati sensibili
    console.error('❌ verifyToken fatal error:', {
      message: error?.message,
      url: req.url,
      method: req.method,
      requestId: req.requestId
    });
    return sendAuthError(res, 500, MESSAGES.ERROR.SERVER_ERROR, 'AUTH_SERVER_ERROR');
  }
};

/** Auth opzionale: se JWT valido, attacca req.user ma non blocca la richiesta */
export const optionalAuth = async (req, _res, next) => {
  try {
    req.requestId = req.requestId || uuidv4();

    const token = getBearerToken(req);
    if (token) {
      try {
        const payload = verifyAccessToken(token);
        const user = await User.findById(payload.id).select('-passwordHash -refreshTokenHash');
        if (user && user.isActive !== false) {
          const safeUser = {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive
          };
          req.user = safeUser;
          res.locals.user = safeUser;
        }
      } catch {
        // silenzioso: auth opzionale
      }
    }
  } catch {
    // nessuna azione: non deve bloccare
  }
  return next();
};

/** Verifica ruolo (singolo o array) */
export const requireRole = (allowed) => {
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  return (req, res, next) => {
    if (!req.user) {
      return sendAuthError(res, 401, MESSAGES.ERROR.AUTH_REQUIRED, 'AUTH_REQUIRED');
    }
    if (!allowedRoles.includes(req.user.role)) {
      return sendAuthError(res, 403, MESSAGES.ERROR.INSUFFICIENT_PERMISSIONS, 'INSUFFICIENT_PERMISSIONS');
    }
    return next();
  };
};

export const requireAdmin     = requireRole(['admin']);
export const requireModerator = requireRole(['admin', 'moderator']);

/** Tracing semplice (facoltativo): assegna requestId e logga durata */
export const tracingMiddleware = (req, res, next) => {
  req.requestId = req.requestId || uuidv4();
  const start = process.hrtime();
  console.log(`[REQ ${req.requestId}] ${req.method} ${req.url}`);
  res.on('finish', () => {
    const [s, ns] = process.hrtime(start);
    const ms = Math.round(s * 1000 + ns / 1e6);
    console.log(`[RES ${req.requestId}] ${res.statusCode} - ${ms}ms`);
  });
  next();
};
