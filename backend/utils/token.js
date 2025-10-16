// backend/utils/token.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const isProd = process.env.NODE_ENV === 'production';

// ⚠️ Usa esattamente questi nomi, come nel tuo .env
const ACCESS_SECRET  = process.env.JWT_SECRET_ACCESS  || (isProd ? (() => { throw new Error('JWT_SECRET_ACCESS mancante'); })() : 'dev-access-secret');
const REFRESH_SECRET = process.env.JWT_SECRET_REFRESH || (isProd ? (() => { throw new Error('JWT_SECRET_REFRESH mancante'); })() : 'dev-refresh-secret');

// TTL (override opzionale da env)
const ACCESS_EXPIRES  = process.env.JWT_ACCESS_EXPIRES  || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';

// Cookie settings per refresh (opzionali)
const COOKIE_NAME    = process.env.REFRESH_COOKIE_NAME   || 'refreshToken';
const COOKIE_PATH    = process.env.REFRESH_COOKIE_PATH   || '/api/auth/refresh';
const COOKIE_DOMAIN  = process.env.REFRESH_COOKIE_DOMAIN || undefined; // es. ".tuodominio.com"
const COOKIE_SAMESITE= (process.env.REFRESH_COOKIE_SAMESITE || 'lax'); // 'lax' | 'strict' | 'none'

export function generateAccessToken(userId, role = 'user') {
  return jwt.sign({ id: String(userId), role, type: 'access' }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

export function generateRefreshToken(userId, role = 'user') {
  return jwt.sign({ id: String(userId), role, type: 'refresh' }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

export function decodeToken(token) {
  return jwt.decode(token);
}

export function hashToken(token = '') {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

const buildCookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  secure: isProd || (COOKIE_SAMESITE.toLowerCase() === 'none'), // richiesto da Chrome con SameSite=None
  sameSite: COOKIE_SAMESITE,
  maxAge: maxAgeMs,
  path: COOKIE_PATH,
  ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {})
});

export function setRefreshCookie(res, refreshToken) {
  // calcolo maxAge dal REFRESH_EXPIRES (semplice fallback 7d)
  const ms =
    typeof REFRESH_EXPIRES === 'string' && REFRESH_EXPIRES.endsWith('d')
      ? Number(REFRESH_EXPIRES.replace('d','')) * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
  res.cookie(COOKIE_NAME, refreshToken, buildCookieOptions(ms));
}

export function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, buildCookieOptions(0));
}

export function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const parts = h.split(' ').filter(Boolean);
  return parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;
}

// Alias legacy (se servono altrove)
export const signAccessToken  = generateAccessToken;
export const signRefreshToken = generateRefreshToken;

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  hashToken,
  setRefreshCookie,
  clearRefreshCookie,
  getBearerToken,
  signAccessToken,
  signRefreshToken
};
