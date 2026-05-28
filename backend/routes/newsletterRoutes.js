import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { body, validationResult } from 'express-validator';

import Subscriber from '../models/Subscriber.js';
import {
  subscribe,
  unsubscribe,
  getSubscribers,
  getNewsletterStats,
  broadcastNewsletter
} from '../controllers/newsletterController.js';
import { verifyToken, requireAdmin, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

/* =========================
   Feature flags / Env
========================= */
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEBUG = process.env.DEBUG_NEWSLETTER === 'true';
const ANTI_SPAM = process.env.ANTI_SPAM
  ? process.env.ANTI_SPAM !== 'false'
  : NODE_ENV !== 'development';

/* =========================
   Helpers
========================= */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  if (DEBUG) {
    console.warn('[NEWSLETTER] VALIDATION_ERROR', {
      path: req.path,
      body: req.body,
      errors: errors.array()
    });
  }

  return res.status(422).json({
    success: false,
    message: 'Validation error',
    code: 'VALIDATION_ERROR',
    errors: errors.array().map(e => ({ field: e.param, msg: e.msg }))
  });
};

const honeypot = (req, res, next) => {
  if (!ANTI_SPAM) return next();
  const hasHoney = typeof req.body?.website === 'string' && req.body.website.trim().length > 0;
  if (hasHoney) {
    if (DEBUG) console.warn('[NEWSLETTER] BOT_HONEYPOT trigger', { website: req.body.website });
    return res.status(400).json({
      success: false,
      message: 'Bot détecté',
      code: 'BOT_HONEYPOT'
    });
  }
  next();
};

const timingGuard = (req, res, next) => {
  if (!ANTI_SPAM) return next();
  const raw = req.body?.startedAt;
  if (raw === undefined || raw === null || raw === '') return next();

  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt)) {
    if (DEBUG) console.warn('[NEWSLETTER] BOT_TIMING_BLOCK invalid startedAt', { startedAt: raw });
    return res.status(400).json({
      success: false,
      message: 'startedAt non valido',
      code: 'BOT_TIMING_BLOCK'
    });
  }
  const elapsed = Date.now() - startedAt;
  if (elapsed < 2000 || elapsed > 30 * 60 * 1000) {
    if (DEBUG) console.warn('[NEWSLETTER] BOT_TIMING_BLOCK window', { elapsed });
    return res.status(400).json({
      success: false,
      message: 'Envoi non valide (timing)',
      code: 'BOT_TIMING_BLOCK'
    });
  }
  next();
};

/* =========================
   Rate limiting (FIX IPv6)
========================= */
// chiave sicura: IP normalizzato (helper) + user-agent (troncato)
const keyUA = (req) =>
  `${ipKeyGenerator(req)}|${(req.headers['user-agent'] || '').slice(0, 200)}`;

const subscriptionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyGenerator: keyUA,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Trop de tentatives d'inscription, veuillez réessayer dans 15 minutes.",
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: keyUA,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer plus tard.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

const broadcastLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 2,
  keyGenerator: keyUA,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Trop de tentatives d'envoi de newsletter, veuillez réessayer dans 1 heure.",
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

/* =========================
   Validation rules
========================= */
const subscribeValidation = [
  body('email').trim().normalizeEmail().bail().isEmail().withMessage('Veuillez fournir une adresse email valide'),
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Le nom doit contenir entre 2 et 50 caractères').escape(),
  body('source').optional().isIn(['website', 'mobile', 'api', 'other']).withMessage("La source doit être l'une des valeurs autorisées"),
  body('website').optional({ checkFalsy: true }).isEmpty().withMessage('Bot détecté'),
  body('startedAt').optional({ checkFalsy: true }).isNumeric().withMessage('startedAt doit être un timestamp')
];

const unsubscribeValidation = [
  body('email').trim().normalizeEmail().bail().isEmail().withMessage('Veuillez fournir une adresse email valide')
];

const broadcastValidation = [
  body('subject').trim().isLength({ min: 5, max: 100 }).withMessage('Le sujet doit contenir entre 5 et 100 caractères').escape(),
  body('content').trim().isLength({ min: 10, max: 10000 }).withMessage('Le contenu doit contenir entre 10 et 10000 caractères'),
  body('preview').optional().trim().isLength({ max: 200 }).withMessage("L'aperçu ne doit pas dépasser 200 caractères").escape()
];

/* =========================
   Routes
========================= */
router.post('/subscribe', subscriptionLimiter, honeypot, subscribeValidation, validate, timingGuard, subscribe);
router.post('/unsubscribe', subscriptionLimiter, unsubscribeValidation, validate, unsubscribe);

router.get('/subscribers', verifyToken, requireRole(['admin', 'moderator']), adminLimiter, getSubscribers);
router.get('/stats', verifyToken, requireRole(['admin', 'moderator']), getNewsletterStats);
router.post('/broadcast', verifyToken, requireAdmin, broadcastLimiter, broadcastValidation, validate, broadcastNewsletter);

router.get('/export/csv', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status, source } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (source) filter.source = source;

    const subs = await Subscriber.find(filter).sort({ createdAt: -1 }).lean();

    const bom = '\uFEFF';
    const headers = ['Email', 'Statut', 'Source', "Date d'inscription", 'Date de désinscription'];
    const esc = (v) => (`${v ?? ''}`).replace(/"/g, '""').replace(/\r?\n/g, ' ').trim();
    const toISO = (d) => (d ? new Date(d).toISOString() : '');

    const rows = subs.map(s => [
      esc(s.email),
      esc(s.status),
      esc(s.source || 'website'),
      esc(toISO(s.subscribedAt || s.createdAt)),
      esc(toISO(s.unsubscribedAt))
    ]);

    const csv = bom + headers.join(',') + '\n' + rows.map(r => r.map(x => `"${x}"`).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=subscribers-${new Date().toISOString().slice(0,10)}.csv`);
    return res.send(csv);
  } catch (error) {
    console.error('❌ Newsletter export error:', {
      message: error.message,
      adminId: req.user?.id,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: "Erreur lors de l'export des abonnés",
      code: 'EXPORT_ERROR'
    });
  }
});

// Legacy
router.post('/', subscriptionLimiter, honeypot, subscribeValidation, validate, timingGuard, subscribe);

export default router;
