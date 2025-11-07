// backend/routes/contactRoutes.js
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { body, param, validationResult } from 'express-validator';

import Contact from '../models/Contact.js';
import {
  sendMessage,
  getMessages,
  getMessageById,
  deleteMessage,
  markAsRead,
  getContactStats
} from '../controllers/contactController.js';
import { verifyToken, requireAdmin, requireRole } from '../middleware/authMiddleware.js';
import { verifySmtp } from '../nodemailer.config.js';

const router = Router();

/* =========================================
   Utils
========================================= */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const stripTags = (s = '') => String(s).replace(/<[^>]*>/g, '');
const sanitize = (s = '', { max = 1000 } = {}) =>
  stripTags(s).trim().replace(/\s+/g, ' ').slice(0, max);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(422).json({
    success: false,
    message: 'Validation error',
    code: 'VALIDATION_ERROR',
    errors: errors.array().map(e => ({ field: e.param, msg: e.msg }))
  });
};

/* =========================================
   Rate limits
========================================= */
const keyUA = (req) =>
  `${ipKeyGenerator(req)}|${(req.headers['user-agent'] || '').slice(0, 200)}`;

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyUA,
  message: {
    success: false,
    message: 'Trop de messages envoyés, veuillez réessayer dans 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyUA,
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer plus tard.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

/* =========================================
   Validation rules
========================================= */
const contactValidation = [
  body('name')
    .customSanitizer(v => sanitize(v, { max: 80 }))
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères'),

  body('email')
    .customSanitizer(v => String(v || '').trim())
    .matches(EMAIL_RE).withMessage('Veuillez fournir une adresse email valide'),

  body('subject')
    .optional({ checkFalsy: true })
    .customSanitizer(v => sanitize(v, { max: 140 }))
    .isLength({ min: 3 }).withMessage('Le sujet doit contenir au moins 3 caractères'),

  body('message')
    .customSanitizer(v => sanitize(v, { max: 5000 }))
    .isLength({ min: 10, max: 5000 })
    .withMessage('Le message doit contenir entre 10 et 5000 caractères'),

  body('website')
    .optional({ checkFalsy: true })
    .isEmpty()
    .withMessage('Bot détecté'),

  body('startedAt')
    .optional({ checkFalsy: true })
    .isNumeric()
    .withMessage('startedAt doit être un timestamp')
];

/* =========================================
   Timing anti-bot
========================================= */
const timingGuard = (req, res, next) => {
  const raw = req.body?.startedAt;
  if (!raw) return next();
  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt)) {
    return res.status(400).json({ success: false, code: 'BOT_TIMING_BLOCK', message: 'startedAt non valide' });
  }
  const elapsed = Date.now() - startedAt;
  if (elapsed < 2000 || elapsed > 30 * 60 * 1000) {
    return res.status(400).json({ success: false, code: 'BOT_TIMING_BLOCK', message: 'Envoi non valide (timing)' });
  }
  return next();
};

/* =========================================
   Normalizzazione (subject default)
========================================= */
const normalizeContactBody = (req, _res, next) => {
  const b = req.body || {};
  if (!b.subject || String(b.subject).trim().length < 3) {
    b.subject = 'Nouveau message du portfolio';
  }
  if (b.name) b.name = String(b.name).trim();
  if (b.email) b.email = String(b.email).trim();
  req.body = b;
  next();
};

/* =========================================
   ROUTES
========================================= */

// Preflight CORS
router.options('/', (_req, res) => res.sendStatus(200));

// Invio messaggio
router.post('/', contactLimiter, contactValidation, validate, timingGuard, normalizeContactBody, sendMessage);

// Health SMTP
router.get('/health', async (_req, res) => {
  try {
    await verifySmtp();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'smtp verify failed' });
  }
});

// Admin routes
router.get('/', verifyToken, requireRole(['admin', 'moderator']), adminLimiter, getMessages);
router.get('/stats', verifyToken, requireRole(['admin', 'moderator']), getContactStats);
router.get('/:id', verifyToken, requireRole(['admin', 'moderator']), param('id').isMongoId(), validate, getMessageById);
router.patch('/:id/read', verifyToken, requireRole(['admin', 'moderator']), param('id').isMongoId(), validate, markAsRead);
router.delete('/:id', verifyToken, requireAdmin, param('id').isMongoId(), validate, deleteMessage);

export default router;
