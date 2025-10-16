// backend/routes/userRoutes.js
import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import {
  verifyToken,
  requireAdmin,
  requireRole,        // si besoin ailleurs
  requireModerator
} from '../middleware/authMiddleware.js';

const router = Router();

/* ========== RATE LIMIT ========== */
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

const userManagementLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Trop d\'opérations de gestion utilisateur, veuillez ralentir.',
    code: 'USER_MANAGEMENT_RATE_LIMIT'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/* ========== VALIDATION HELPERS ========== */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Paramètres invalides',
      errors: errors.array(),
      code: 'VALIDATION_ERROR'
    });
  }
  next();
};

/* ========== RULESETS ========== */
const roleValidation = [
  body('role')
    .isIn(['user', 'moderator', 'admin', 'super_admin'])
    .withMessage('Le rôle doit être: user, moderator, admin ou super_admin')
];

const userIdValidation = [
  param('id').isMongoId().withMessage('ID utilisateur non valide')
];

const statusValidation = [
  body('status')
    .isIn(['active', 'inactive', 'suspended', 'pending'])
    .withMessage('Le statut doit être: active, inactive, suspended ou pending')
];

const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom doit contenir entre 2 et 100 caractères')
    .escape(),

  body('profile.bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La biographie ne peut pas dépasser 500 caractères')
    .escape(),

  body('profile.title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le titre ne peut pas dépasser 100 caractères')
    .escape(),

  body('profile.company')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le nom de l\'entreprise ne peut pas dépasser 100 caractères')
    .escape(),

  body('profile.website')
    .optional()
    .isURL()
    .withMessage('Veuillez fournir une URL de site web valide'),

  body('profile.location')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('La localisation ne peut pas dépasser 100 caractères')
    .escape(),

  body('preferences.emailNotifications.newsletter').optional().isBoolean(),
  body('preferences.emailNotifications.projectUpdates').optional().isBoolean(),
  body('preferences.emailNotifications.securityAlerts').optional().isBoolean(),
  body('preferences.emailNotifications.marketing').optional().isBoolean(),

  body('preferences.language')
    .optional()
    .isLength({ min: 2, max: 10 })
    .withMessage('La langue doit contenir entre 2 et 10 caractères'),

  body('preferences.theme')
    .optional()
    .isIn(['light', 'dark', 'auto'])
    .withMessage('Le thème doit être: light, dark ou auto')
];

const queryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('La page doit être un entier positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limite entre 1 et 100'),
  query('role').optional().isIn(['user', 'moderator', 'admin', 'super_admin']),
  query('status').optional().isIn(['active', 'inactive', 'suspended', 'pending']),
  query('sort')
    .optional()
    .isIn(['createdAt', '-createdAt', 'name', '-name', 'lastLoginAt', '-lastLoginAt', 'loginCount', '-loginCount'])
];

/* ========== ROUTES ========== */

/**
 * GET /api/users
 * Admin/Moderator — liste paginée + filtres
 */
router.get(
  '/',
  verifyToken,
  requireModerator,
  adminLimiter,
  queryValidation,
  validate,
  async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const skip = (page - 1) * limit;

      const filter = {};
      if (req.query.role) filter.role = req.query.role;
      if (req.query.status) filter.status = req.query.status;

      // recherche plein texte si index défini ; fallback sur regex safe
      if (req.query.search) {
        if (User.schema.indexes().some(([idx]) => '$**' in idx || 'name' in idx)) {
          filter.$text = { $search: req.query.search };
        } else {
          const s = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          filter.$or = [{ name: new RegExp(s, 'i') }, { email: new RegExp(s, 'i') }];
        }
      }

      const projection =
        '-passwordHash -refreshTokenHash -security.twoFactorSecret -security.backupCodes -security.loginHistory';

      const [users, total, activeCount, adminCount] = await Promise.all([
        User.find(filter)
          .select(projection)
          .sort(req.query.sort || '-createdAt')
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter),
        User.countDocuments({ status: 'active' }),
        User.countDocuments({ role: 'admin' })
      ]);

      res.json({
        success: true,
        message: 'Utilisateurs récupérés avec succès',
        data: {
          users,
          pagination: {
            page,
            limit,
            total,
            activeCount,
            adminCount,
            pages: Math.ceil(total / limit)
          }
        },
        code: 'USERS_RETRIEVED'
      });
    } catch (error) {
      console.error('❌ Get users error:', {
        message: error.message,
        adminId: req.user?.id,
        query: req.query,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des utilisateurs',
        code: 'USERS_RETRIEVAL_ERROR'
      });
    }
  }
);

/**
 * GET /api/users/stats
 * Admin — stats globales
 */
router.get('/stats', verifyToken, requireAdmin, adminLimiter, async (req, res) => {
  try {
    const stats = await User.getStats();
    const result = stats[0] || {
      total: 0,
      active: 0,
      totalProjects: 0,
      totalReviews: 0,
      totalContacts: 0,
      avgLoginCount: 0,
      verifiedEmails: 0,
      verificationRate: 0,
      roleCount: { user: 0, moderator: 0, admin: 0, super_admin: 0 },
      statusCount: { active: 0, inactive: 0, suspended: 0, pending: 0 }
    };

    const [todayUsers, weekUsers, inactiveUsers] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
      User.countDocuments({
        status: 'active',
        $or: [
          { lastLoginAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
          { lastLoginAt: null, createdAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } }
        ]
      })
    ]);

    res.json({
      success: true,
      data: {
        overview: result,
        realTime: { today: todayUsers, thisWeek: weekUsers, inactive: inactiveUsers },
        timestamp: new Date().toISOString()
      },
      code: 'USER_STATS_RETRIEVED'
    });
  } catch (error) {
    console.error('❌ User stats error:', {
      message: error.message,
      adminId: req.user?.id,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques utilisateurs',
      code: 'USER_STATS_ERROR'
    });
  }
});

/**
 * GET /api/users/:id
 * Propre profil OU admin/moderator
 */
router.get('/:id', verifyToken, userIdValidation, validate, async (req, res) => {
  try {
    if (req.user.id !== req.params.id && !['admin', 'moderator'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce profil utilisateur',
        code: 'ACCESS_DENIED'
      });
    }

    const user = await User.findById(req.params.id)
      .select('-passwordHash -refreshTokenHash -security.twoFactorSecret -security.backupCodes');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé', code: 'USER_NOT_FOUND' });
    }

    // Cacher quelques champs si non admin/moderator
    if (!['admin', 'moderator'].includes(req.user.role) && req.user.id !== req.params.id) {
      user.security.loginHistory = [];
      user.metadata = {};
      user.notes = null;
    }

    res.json({ success: true, data: { user }, code: 'USER_RETRIEVED' });
  } catch (error) {
    console.error('❌ Get user error:', {
      message: error.message,
      userId: req.params.id,
      viewerId: req.user.id,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'utilisateur',
      code: 'USER_RETRIEVAL_ERROR'
    });
  }
});

/**
 * PUT /api/users/:id
 * Mettre à jour son profil, ou tout profil pour admin/moderator
 */
router.put('/:id', verifyToken, userIdValidation, updateProfileValidation, validate, async (req, res) => {
  try {
    if (req.user.id !== req.params.id && !['admin', 'moderator'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé pour modifier ce profil',
        code: 'ACCESS_DENIED'
      });
    }

    const updateData = { ...req.body };

    if (!['admin', 'moderator'].includes(req.user.role)) {
      delete updateData.role;
      delete updateData.status;
      delete updateData.tags;
      delete updateData.notes;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    }).select('-passwordHash -refreshTokenHash');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé', code: 'USER_NOT_FOUND' });
    }

    res.json({
      success: true,
      message: 'Profil utilisateur mis à jour avec succès',
      data: { user },
      code: 'USER_UPDATED'
    });
  } catch (error) {
    console.error('❌ Update user error:', {
      message: error.message,
      userId: req.params.id,
      updaterId: req.user.id,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour de l\'utilisateur',
      code: 'USER_UPDATE_ERROR'
    });
  }
});

/**
 * POST /api/users/:id/role
 * Admin — changer rôle
 */
router.post(
  '/:id/role',
  verifyToken,
  requireAdmin,
  userManagementLimiter,
  userIdValidation,
  roleValidation,
  validate,
  async (req, res) => {
    try {
      const { role } = req.body;

      if (req.params.id === req.user.id && role !== 'admin') {
        return res.status(400).json({
          success: false,
          message: 'Vous ne pouvez pas retirer vos propres privilèges administrateur',
          code: 'SELF_DEMOTION_NOT_ALLOWED'
        });
      }

      const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select(
        '-passwordHash -refreshTokenHash'
      );

      if (!user) {
        return res.status(404).json({ success: false, message: 'Utilisateur non trouvé', code: 'USER_NOT_FOUND' });
      }

      console.log('🔧 User role updated:', {
        adminId: req.user.id,
        targetUserId: user._id,
        targetUserEmail: user.email,
        newRole: role,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        message: `Rôle utilisateur mis à jour: ${role}`,
        data: { user },
        code: 'USER_ROLE_UPDATED'
      });
    } catch (error) {
      console.error('❌ Update user role error:', {
        message: error.message,
        targetUserId: req.params.id,
        adminId: req.user.id,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du rôle utilisateur',
        code: 'USER_ROLE_UPDATE_ERROR'
      });
    }
  }
);

/**
 * POST /api/users/:id/status
 * Admin — changer statut (+ raison optionnelle)
 */
router.post(
  '/:id/status',
  verifyToken,
  requireAdmin,
  userManagementLimiter,
  userIdValidation,
  statusValidation,
  [
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('La raison ne peut pas dépasser 500 caractères')
      .escape()
  ],
  validate,
  async (req, res) => {
    try {
      const { status, reason } = req.body;

      if (req.params.id === req.user.id && status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Vous ne pouvez pas suspendre ou désactiver votre propre compte',
          code: 'SELF_SUSPENSION_NOT_ALLOWED'
        });
      }

      const updateData = { status };

      if (reason) {
        const user = await User.findById(req.params.id).select('notes');
        if (user) {
          updateData.notes = user.notes
            ? `${user.notes}\nChangement statut (${new Date().toLocaleDateString('fr-FR')}): ${reason}`
            : `Changement statut (${new Date().toLocaleDateString('fr-FR')}): ${reason}`;
        }
      }

      const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select(
        '-passwordHash -refreshTokenHash'
      );

      if (!updatedUser) {
        return res.status(404).json({ success: false, message: 'Utilisateur non trouvé', code: 'USER_NOT_FOUND' });
      }

      console.log('🔧 User status updated:', {
        adminId: req.user.id,
        targetUserId: updatedUser._id,
        targetUserEmail: updatedUser.email,
        newStatus: status,
        reason: reason || 'Non spécifiée',
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        message: `Statut utilisateur mis à jour: ${status}`,
        data: { user: updatedUser },
        code: 'USER_STATUS_UPDATED'
      });
    } catch (error) {
      console.error('❌ Update user status error:', {
        message: error.message,
        targetUserId: req.params.id,
        adminId: req.user.id,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du statut utilisateur',
        code: 'USER_STATUS_UPDATE_ERROR'
      });
    }
  }
);

/**
 * DELETE /api/users/:id
 * Admin — supprimer un utilisateur (pas soi-même)
 */
router.delete('/:id', verifyToken, requireAdmin, userManagementLimiter, userIdValidation, validate, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas supprimer votre propre compte',
        code: 'SELF_DELETION_NOT_ALLOWED'
      });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé', code: 'USER_NOT_FOUND' });
    }

    console.log('🗑️ User deleted:', {
      adminId: req.user.id,
      deletedUserId: user._id,
      deletedUserEmail: user.email,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, message: 'Utilisateur supprimé avec succès', code: 'USER_DELETED' });
  } catch (error) {
    console.error('❌ Delete user error:', {
      message: error.message,
      targetUserId: req.params.id,
      adminId: req.user.id,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de l\'utilisateur',
      code: 'USER_DELETION_ERROR'
    });
  }
});

/**
 * POST /api/users/:id/unlock
 * Admin — déverrouiller le compte
 */
router.post('/:id/unlock', verifyToken, requireAdmin, userManagementLimiter, userIdValidation, validate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé', code: 'USER_NOT_FOUND' });
    }

    await user.unlockAccount();

    console.log('🔓 User account unlocked:', {
      adminId: req.user.id,
      targetUserId: user._id,
      targetUserEmail: user.email,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Compte utilisateur déverrouillé',
      data: { user },
      code: 'USER_UNLOCKED'
    });
  } catch (error) {
    console.error('❌ Unlock user error:', {
      message: error.message,
      targetUserId: req.params.id,
      adminId: req.user.id,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Erreur lors du déverrouillage du compte utilisateur',
      code: 'USER_UNLOCK_ERROR'
    });
  }
});

/**
 * POST /api/users/:id/require-password-change
 * Admin — forcer le changement de mot de passe
 */
router.post(
  '/:id/require-password-change',
  verifyToken,
  requireAdmin,
  userManagementLimiter,
  userIdValidation,
  validate,
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({ success: false, message: 'Utilisateur non trouvé', code: 'USER_NOT_FOUND' });
      }

      await user.requirePasswordChange();

      console.log('🔐 Password change required:', {
        adminId: req.user.id,
        targetUserId: user._id,
        targetUserEmail: user.email,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Changement de mot de passe requis pour cet utilisateur',
        data: { user },
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    } catch (error) {
      console.error('❌ Require password change error:', {
        message: error.message,
        targetUserId: req.params.id,
        adminId: req.user.id,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Erreur lors de la demande de changement de mot de passe',
        code: 'PASSWORD_CHANGE_REQUIREMENT_ERROR'
      });
    }
  }
);

export default router;
