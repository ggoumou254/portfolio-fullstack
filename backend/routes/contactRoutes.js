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

const router = Router();

/* =========================================
   Utils: sanitizzazione + validator helper
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
   Rate limits (IPv6-safe key using ipKeyGenerator)
========================================= */
const keyUA = (req) =>
  `${ipKeyGenerator(req)}|${(req.headers['user-agent'] || '').slice(0, 200)}`;

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
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

  // honeypot (doit rester vide)
  body('website')
    .optional({ checkFalsy: true })
    .isEmpty()
    .withMessage('Bot détecté'),

  // timing opzionale
  body('startedAt')
    .optional({ checkFalsy: true })
    .isNumeric()
    .withMessage('startedAt doit être un timestamp')
];

/* =========================================
   Anti-bot timing middleware
========================================= */
const timingGuard = (req, res, next) => {
  const raw = req.body?.startedAt;
  if (raw === undefined || raw === null || raw === '') return next(); // opzionale
  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt)) {
    return res.status(400).json({
      success: false,
      message: 'startedAt non valide',
      code: 'BOT_TIMING_BLOCK'
    });
  }
  const elapsed = Date.now() - startedAt;
  if (elapsed < 2000 || elapsed > 30 * 60 * 1000) {
    return res.status(400).json({
      success: false,
      message: 'Envoi non valide (timing)',
      code: 'BOT_TIMING_BLOCK'
    });
  }
  return next();
};

/* =========================================
   ROUTES
========================================= */

// POST /api/contact
router.post('/', contactLimiter, contactValidation, validate, timingGuard, sendMessage);

// GET /api/contact
router.get('/', verifyToken, requireRole(['admin', 'moderator']), adminLimiter, getMessages);

// GET /api/contact/stats
router.get('/stats', verifyToken, requireRole(['admin', 'moderator']), getContactStats);

// GET /api/contact/:id
router.get(
  '/:id',
  verifyToken,
  requireRole(['admin', 'moderator']),
  param('id').isMongoId().withMessage('ID non valido'),
  validate,
  getMessageById
);

// PATCH /api/contact/:id/read
router.patch(
  '/:id/read',
  verifyToken,
  requireRole(['admin', 'moderator']),
  [
    param('id').isMongoId().withMessage('ID non valido'),
    body('isRead').optional().isBoolean().withMessage('Le champ isRead doit être un booléen')
  ],
  validate,
  markAsRead
);

// DELETE /api/contact/:id
router.delete(
  '/:id',
  verifyToken,
  requireAdmin,
  param('id').isMongoId().withMessage('ID non valido'),
  validate,
  deleteMessage
);

// GET /api/contact/export/csv
router.get('/export/csv', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const contacts = await Contact.find(filter).sort({ createdAt: -1 }).lean();

    const bom = '\uFEFF';
    const headers = ['Nom', 'Email', 'Sujet', 'Message', 'Statut', 'Lu', 'Date'];
    const esc = (v) => (`${v ?? ''}`).replace(/"/g, '""').replace(/\r?\n/g, ' ').trim();

    const rows = contacts.map(c => [
      esc(c.name),
      esc(c.email),
      esc(c.subject || ''),
      esc(c.message),
      esc(c.status || ''),
      c.isRead ? 'Oui' : 'Non',
      c.createdAt ? new Date(c.createdAt).toISOString() : ''
    ]);

    const csv = bom + headers.join(',') + '\n' + rows.map(r => r.map(x => `"${x}"`).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=contacts-${new Date().toISOString().slice(0,10)}.csv`);
    return res.send(csv);
  } catch (error) {
    console.error('❌ Contact export error:', {
      message: error.message,
      adminId: req.user?.id,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: "Erreur lors de l'export des contacts",
      code: 'EXPORT_ERROR'
    });
  }
});

// POST /api/contact/bulk/read
router.post(
  '/bulk/read',
  verifyToken,
  requireRole(['admin', 'moderator']),
  [
    body('messageIds').isArray({ min: 1 }).withMessage('messageIds doit être un tableau non vide'),
    body('messageIds.*').isMongoId().withMessage('Chaque ID doit être un ID MongoDB valide'),
    body('isRead').isBoolean().withMessage('isRead doit être un booléen')
  ],
  validate,
  async (req, res) => {
    try {
      const { messageIds, isRead } = req.body;
      const result = await Contact.updateMany(
        { _id: { $in: messageIds } },
        { isRead, status: isRead ? 'read' : 'new' }
      );
      return res.json({
        success: true,
        message: `${result.modifiedCount} messages marqués comme ${isRead ? 'lus' : 'non lus'}`,
        data: { modifiedCount: result.modifiedCount },
        code: 'BULK_UPDATE_SUCCESS'
      });
    } catch (error) {
      console.error('❌ Bulk read update error:', {
        message: error.message,
        adminId: req.user?.id,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour en lot',
        code: 'BULK_UPDATE_ERROR'
      });
    }
  }
);

// POST /api/contact/bulk/delete
router.post(
  '/bulk/delete',
  verifyToken,
  requireAdmin,
  [
    body('messageIds').isArray({ min: 1 }).withMessage('messageIds doit être un tableau non vide'),
    body('messageIds.*').isMongoId().withMessage('Chaque ID doit être un ID MongoDB valide')
  ],
  validate,
  async (req, res) => {
    try {
      const { messageIds } = req.body;
      const result = await Contact.deleteMany({ _id: { $in: messageIds } });
      return res.json({
        success: true,
        message: `${result.deletedCount} messages supprimés`,
        data: { deletedCount: result.deletedCount },
        code: 'BULK_DELETE_SUCCESS'
      });
    } catch (error) {
      console.error('❌ Bulk delete error:', {
        message: error.message,
        adminId: req.user?.id,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression en lot',
        code: 'BULK_DELETE_ERROR'
      });
    }
  }
);

export default router;
