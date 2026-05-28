// backend/routes/reviewRoutes.js
import { Router } from 'express';
import { body, query, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import Review from '../models/Review.js';
import {
  listReviews,
  createReview,
  deleteReview,
  updateReviewStatus,
  getReviewStats
} from '../controllers/reviewController.js';
import { verifyToken, requireAdmin, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

/* =========================
   Rate limiting
========================= */
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 2,
  message: {
    success: false,
    message: "Trop d'avis soumis, veuillez réessayer dans 1 heure.",
    code: 'REVIEW_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer dans 1 minute.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer plus tard.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/* =========================
   Validators
========================= */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({
    success: false,
    message: 'Validation error',
    errors: errors.array().map(e => ({ field: e.path, msg: e.msg })),
    code: 'VALIDATION_ERROR',
  });
};

const reviewValidation = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('La note doit être un nombre entier entre 1 et 5'),
  body('comment').optional().trim().isLength({ min: 10, max: 1000 }).withMessage('Le commentaire doit contenir entre 10 et 1000 caractères').escape(),
];

const updateStatusValidation = [
  body('status').optional().isIn(['pending', 'approved', 'rejected']).withMessage('Le statut doit être: pending, approved ou rejected'),
  body('isFeatured').optional().isBoolean().withMessage('Le champ isFeatured doit être un booléen'),
];

const queryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('La page doit être un nombre entier positif'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('La limite doit être un nombre entre 1 et 50'),
  query('status').optional().isIn(['pending', 'approved', 'rejected']).withMessage('Le statut doit être: pending, approved ou rejected'),
  query('featured').optional().isBoolean().withMessage('Le paramètre featured doit être un booléen'),
  query('minRating').optional().isInt({ min: 1, max: 5 }).withMessage('La note minimum doit être entre 1 et 5'),
  query('sort').optional().isIn(['createdAt', '-createdAt', 'rating', '-rating', 'updatedAt', '-updatedAt']).withMessage("Le tri doit être l'un des champs autorisés"),
];

/* =========================
   Routes
========================= */

// GET /api/reviews — public (lista, con filtri)
router.get('/', publicLimiter, queryValidation, validate, listReviews);

// GET /api/reviews/approved — solo approved/featured (public)
router.get(
  '/approved',
  publicLimiter,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('La page doit être un nombre entier positif'),
    query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('La limite doit être un nombre entre 1 et 20'),
    query('featured').optional().isBoolean().withMessage('Le paramètre featured doit être un booléen'),
    query('minRating').optional().isInt({ min: 1, max: 5 }).withMessage('La note minimum doit être entre 1 et 5'),
  ],
  validate,
  async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit) || 10, 20);
      const skip = (page - 1) * limit;

      const filter = { status: 'approved' };
      if (req.query.featured !== undefined) filter.isFeatured = req.query.featured === 'true';
      if (req.query.minRating) {
        const minRating = parseInt(req.query.minRating);
        if (!isNaN(minRating)) filter.rating = { $gte: minRating };
      }

      const [reviews, total, featuredCount] = await Promise.all([
        Review.find(filter)
          .populate('user', 'name email role')
          .sort({ isFeatured: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Review.countDocuments(filter),
        Review.countDocuments({ isFeatured: true, status: 'approved' }),
      ]);

      res.json({
        success: true,
        message: 'Avis approuvés récupérés avec succès',
        data: {
          reviews: reviews.map((r) => ({
            id: r._id,
            rating: r.rating,
            comment: r.comment,
            isFeatured: r.isFeatured,
            user: r.user
              ? { id: r.user._id, name: r.user.name, email: r.user.email, role: r.user.role }
              : null,
            createdAt: r.createdAt,
          })),
          pagination: {
            page,
            limit,
            total,
            featuredCount,
            pages: Math.ceil(total / limit),
          },
        },
        code: 'APPROVED_REVIEWS_RETRIEVED',
      });
    } catch (error) {
      console.error('❌ Approved reviews error:', { message: error.message, query: req.query, stack: error.stack });
      res.status(500).json({ success: false, message: 'Erreur lors de la récupération des avis approuvés', code: 'SERVER_ERROR' });
    }
  }
);

// GET /api/reviews/stats — admin/mod
router.get('/stats', verifyToken, requireRole(['admin', 'moderator']), getReviewStats);

// POST /api/reviews — creare review (utente autenticato)
router.post('/', verifyToken, reviewLimiter, reviewValidation, validate, createReview);

// PATCH /api/reviews/:id/status — admin/mod
router.patch('/:id/status', verifyToken, requireRole(['admin', 'moderator']), adminLimiter, updateStatusValidation, validate, updateReviewStatus);

// DELETE /api/reviews/:id — utente (propria) o admin
router.delete('/:id', verifyToken, deleteReview);

// GET /api/reviews/user/my-reviews — mie review (utente)
router.get(
  '/user/my-reviews',
  verifyToken,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('La page doit être un nombre entier positif'),
    query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('La limite doit être un nombre entre 1 et 20'),
  ],
  validate,
  async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit) || 10, 20);
      const skip = (page - 1) * limit;

      const [reviews, total] = await Promise.all([
        Review.find({ user: req.user.id })
          .populate('user', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Review.countDocuments({ user: req.user.id }),
      ]);

      res.json({
        success: true,
        message: 'Vos avis récupérés avec succès',
        data: {
          reviews: reviews.map((r) => ({
            id: r._id,
            rating: r.rating,
            comment: r.comment,
            status: r.status,
            isFeatured: r.isFeatured,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          })),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
        code: 'USER_REVIEWS_RETRIEVED',
      });
    } catch (error) {
      console.error('❌ User reviews error:', { message: error.message, userId: req.user.id, stack: error.stack });
      res.status(500).json({ success: false, message: 'Erreur lors de la récupération de vos avis', code: 'SERVER_ERROR' });
    }
  }
);

// POST /api/reviews/bulk/status — admin/mod
router.post(
  '/bulk/status',
  verifyToken,
  requireRole(['admin', 'moderator']),
  adminLimiter,
  [
    body('reviewIds').isArray({ min: 1 }).withMessage('reviewIds doit être un tableau non vide'),
    body('reviewIds.*').isMongoId().withMessage('Chaque ID doit être un ID MongoDB valide'),
    body('status').isIn(['pending', 'approved', 'rejected']).withMessage('Le statut doit être: pending, approved ou rejected'),
  ],
  validate,
  async (req, res) => {
    try {
      const { reviewIds, status } = req.body;
      const result = await Review.updateMany({ _id: { $in: reviewIds } }, { status });
      res.json({
        success: true,
        message: `${result.modifiedCount} avis mis à jour avec le statut: ${status}`,
        data: { modifiedCount: result.modifiedCount },
        code: 'BULK_STATUS_UPDATE_SUCCESS',
      });
    } catch (error) {
      console.error('❌ Bulk status update error:', { message: error.message, adminId: req.user?.id, stack: error.stack });
      res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour en lot des statuts', code: 'BULK_UPDATE_ERROR' });
    }
  }
);

// POST /api/reviews/bulk/featured — admin
router.post(
  '/bulk/featured',
  verifyToken,
  requireAdmin,
  adminLimiter,
  [
    body('reviewIds').isArray({ min: 1 }).withMessage('reviewIds doit être un tableau non vide'),
    body('reviewIds.*').isMongoId().withMessage('Chaque ID doit être un ID MongoDB valide'),
    body('isFeatured').isBoolean().withMessage('isFeatured doit être un booléen'),
  ],
  validate,
  async (req, res) => {
    try {
      const { reviewIds, isFeatured } = req.body;
      const result = await Review.updateMany({ _id: { $in: reviewIds } }, { isFeatured });
      res.json({
        success: true,
        message: `${result.modifiedCount} avis ${isFeatured ? 'mis en vedette' : 'retirés de la vedette'}`,
        data: { modifiedCount: result.modifiedCount },
        code: 'BULK_FEATURED_UPDATE_SUCCESS',
      });
    } catch (error) {
      console.error('❌ Bulk featured update error:', { message: error.message, adminId: req.user?.id, stack: error.stack });
      res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour en lot du statut vedette', code: 'BULK_UPDATE_ERROR' });
    }
  }
);

export default router;
