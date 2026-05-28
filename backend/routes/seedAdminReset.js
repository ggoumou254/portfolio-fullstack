// backend/routes/seedAdminReset.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const router = Router();

// Configuration
const RESET_CONFIG = {
  ADMIN: {
    name: 'Goumou Raphael',
    email: 'ggoumou254.gg@gmail.com',
    // Le mot de passe sera défini via les variables d'environnement
    role: 'admin',
    status: 'active'
  },
  SALT_ROUNDS: 12,
  // Protection pour éviter l'exécution en production
  ALLOWED_ENVIRONMENTS: ['development', 'test']
};

/**
 * @route   POST /api/seed/reset-admin
 * @desc    Reset or create admin user (Development/Test only)
 * @access  Public (Restricted to development/test environments)
 * @body    {password} (optional - uses env var by default)
 * @returns {user, credentials}
 */
router.post('/reset-admin', async (req, res) => {
  try {
    // Vérifier l'environnement
    const currentEnv = process.env.NODE_ENV || 'development';
    if (!RESET_CONFIG.ALLOWED_ENVIRONMENTS.includes(currentEnv)) {
      return res.status(403).json({
        success: false,
        message: 'Réinitialisation admin réservée aux environnements de développement et test',
        code: 'ADMIN_RESET_NOT_ALLOWED'
      });
    }

    const { password } = req.body;
    const adminPassword = password || process.env.ADMIN_RESET_PASSWORD || 'Raphael1997@';

    // Vérifier la force du mot de passe
    if (adminPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 8 caractères',
        code: 'WEAK_PASSWORD'
      });
    }

    const { name, email, role, status } = RESET_CONFIG.ADMIN;

    // Hacher le mot de passe
    const passwordHash = await bcrypt.hash(adminPassword, RESET_CONFIG.SALT_ROUNDS);

    // Préparer les données de mise à jour complètes
    const updateData = {
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      status,
      profile: {
        title: 'Administrateur Principal',
        company: 'Portfolio Platform',
        bio: 'Administrateur du système portfolio'
      },
      emailVerification: {
        isVerified: true,
        verifiedAt: new Date()
      },
      security: {
        lastPasswordChange: new Date(),
        passwordChangeRequired: false,
        failedLoginAttempts: 0,
        lockUntil: null,
        lastFailedLogin: null
      },
      preferences: {
        emailNotifications: {
          newsletter: true,
          projectUpdates: true,
          securityAlerts: true,
          marketing: false
        },
        language: 'fr',
        timezone: 'Europe/Paris',
        theme: 'auto'
      },
      metadata: {
        registrationSource: 'admin-reset',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 500),
        lastResetAt: new Date()
      },
      tags: ['admin', 'reset-created'],
      $unset: {
        isAdmin: '', // Nettoyer l'ancien champ si existant
        oldPassword: ''
      }
    };

    // Rechercher et mettre à jour ou créer l'admin
    const result = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: updateData },
      { 
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    ).select('-passwordHash -refreshTokenHash -security.twoFactorSecret -security.backupCodes');

    const wasCreated = !result.createdAt || (Date.now() - result.createdAt) < 5000;

    console.log(`✅ Admin ${wasCreated ? 'created' : 'reset'} successfully:`, {
      userId: result._id,
      email: result.email,
      role: result.role,
      action: wasCreated ? 'created' : 'reset',
      environment: currentEnv,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: wasCreated ? 
        '✅ Compte administrateur créé avec succès' : 
        '✅ Compte administrateur réinitialisé avec succès',
      data: {
        user: {
          id: result._id,
          name: result.name,
          email: result.email,
          role: result.role,
          status: result.status,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt
        },
        credentials: {
          email: result.email,
          password: adminPassword,
          note: 'Conservez ces informations de connexion en lieu sûr'
        },
        action: wasCreated ? 'created' : 'reset',
        environment: currentEnv
      },
      code: wasCreated ? 'ADMIN_CREATED' : 'ADMIN_RESET'
    });

  } catch (error) {
    console.error('❌ Admin reset error:', {
      message: error.message,
      stack: error.stack,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });

    // Gestion spécifique des erreurs MongoDB
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Conflit lors de la création/réinitialisation de l\'admin',
        code: 'ADMIN_RESET_CONFLICT'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Données de validation invalides pour l\'admin',
        errors: Object.values(error.errors).map(err => err.message),
        code: 'ADMIN_VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la réinitialisation du compte administrateur',
      code: 'ADMIN_RESET_ERROR'
    });
  }
});

/**
 * @route   GET /api/seed/reset-admin
 * @desc    Reset or create admin user - GET version (Development/Test only)
 * @access  Public (Restricted to development/test environments)
 * @returns {user, credentials}
 */
router.get('/reset-admin', async (req, res) => {
  try {
    // Vérifier l'environnement
    const currentEnv = process.env.NODE_ENV || 'development';
    if (!RESET_CONFIG.ALLOWED_ENVIRONMENTS.includes(currentEnv)) {
      return res.status(403).json({
        success: false,
        message: 'Réinitialisation admin réservée aux environnements de développement et test',
        code: 'ADMIN_RESET_NOT_ALLOWED'
      });
    }

    const adminPassword = process.env.ADMIN_RESET_PASSWORD || 'Raphael1997@';
    const { name, email, role, status } = RESET_CONFIG.ADMIN;

    // Hacher le mot de passe
    const passwordHash = await bcrypt.hash(adminPassword, RESET_CONFIG.SALT_ROUNDS);

    // Préparer les données de mise à jour
    const updateData = {
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      status,
      security: {
        lastPasswordChange: new Date(),
        passwordChangeRequired: false,
        failedLoginAttempts: 0,
        lockUntil: null
      },
      emailVerification: {
        isVerified: true,
        verifiedAt: new Date()
      },
      metadata: {
        registrationSource: 'admin-reset-get',
        lastResetAt: new Date()
      },
      tags: ['admin', 'reset-created'],
      $unset: {
        isAdmin: '',
        oldPassword: ''
      }
    };

    const result = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: updateData },
      { 
        new: true,
        upsert: true,
        runValidators: true
      }
    ).select('-passwordHash -refreshTokenHash');

    const wasCreated = !result.createdAt || (Date.now() - result.createdAt) < 5000;

    console.log(`✅ Admin ${wasCreated ? 'created' : 'reset'} via GET:`, {
      userId: result._id,
      email: result.email,
      action: wasCreated ? 'created' : 'reset',
      environment: currentEnv,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: wasCreated ? 
        '✅ Compte administrateur créé avec succès' : 
        '✅ Compte administrateur réinitialisé avec succès',
      data: {
        user: {
          id: result._id,
          name: result.name,
          email: result.email,
          role: result.role,
          status: result.status,
          createdAt: result.createdAt
        },
        credentials: {
          email: result.email,
          password: adminPassword,
          note: 'Conservez ces informations de connexion en lieu sûr'
        },
        action: wasCreated ? 'created' : 'reset',
        environment: currentEnv,
        warning: 'Il est recommandé d\'utiliser la méthode POST avec un mot de passe personnalisé'
      },
      code: wasCreated ? 'ADMIN_CREATED' : 'ADMIN_RESET'
    });

  } catch (error) {
    console.error('❌ Admin reset GET error:', {
      message: error.message,
      stack: error.stack,
      environment: process.env.NODE_ENV
    });

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la réinitialisation du compte administrateur',
      code: 'ADMIN_RESET_ERROR'
    });
  }
});

/**
 * @route   POST /api/seed/reset-admin/force
 * @desc    Force reset admin user including security data (Development/Test only)
 * @access  Public (Restricted to development/test environments)
 * @body    {password} (optional)
 * @returns {user, credentials}
 */
router.post('/reset-admin/force', async (req, res) => {
  try {
    // Vérifier l'environnement
    const currentEnv = process.env.NODE_ENV || 'development';
    if (!RESET_CONFIG.ALLOWED_ENVIRONMENTS.includes(currentEnv)) {
      return res.status(403).json({
        success: false,
        message: 'Réinitialisation forcée admin réservée aux environnements de développement et test',
        code: 'ADMIN_FORCE_RESET_NOT_ALLOWED'
      });
    }

    const { password } = req.body;
    const adminPassword = password || process.env.ADMIN_FORCE_RESET_PASSWORD || 'Raphael1997@';

    const { name, email, role, status } = RESET_CONFIG.ADMIN;

    // Hacher le mot de passe
    const passwordHash = await bcrypt.hash(adminPassword, RESET_CONFIG.SALT_ROUNDS);

    // Réinitialisation forcée - nettoyage complet
    const forceUpdateData = {
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      status,
      profile: {
        title: 'Administrateur Principal',
        company: 'Portfolio Platform'
      },
      emailVerification: {
        isVerified: true,
        verifiedAt: new Date(),
        verificationToken: null
      },
      security: {
        lastPasswordChange: new Date(),
        passwordChangeRequired: false,
        failedLoginAttempts: 0,
        lockUntil: null,
        lastFailedLogin: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: [],
        loginHistory: []
      },
      refreshTokenHash: null,
      lastLoginAt: null,
      loginCount: 0,
      preferences: {
        emailNotifications: {
          newsletter: true,
          projectUpdates: true,
          securityAlerts: true,
          marketing: false
        },
        language: 'fr',
        timezone: 'Europe/Paris',
        theme: 'auto'
      },
      metadata: {
        registrationSource: 'admin-force-reset',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 500),
        forceResetAt: new Date()
      },
      tags: ['admin', 'force-reset'],
      stats: {
        projectsCreated: 0,
        reviewsSubmitted: 0,
        contactsSent: 0
      },
      notes: null,
      $unset: {
        isAdmin: '',
        oldPassword: '',
        temporaryPassword: ''
      }
    };

    const result = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: forceUpdateData },
      { 
        new: true,
        upsert: true,
        runValidators: true
      }
    ).select('-passwordHash -refreshTokenHash -security.twoFactorSecret -security.backupCodes');

    console.log('✅ Admin force reset successfully:', {
      userId: result._id,
      email: result.email,
      environment: currentEnv,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '✅ Compte administrateur réinitialisé de force avec succès',
      data: {
        user: {
          id: result._id,
          name: result.name,
          email: result.email,
          role: result.role,
          status: result.status,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt
        },
        credentials: {
          email: result.email,
          password: adminPassword,
          note: 'Toutes les données de sécurité ont été réinitialisées'
        },
        resetType: 'force',
        environment: currentEnv
      },
      code: 'ADMIN_FORCE_RESET'
    });

  } catch (error) {
    console.error('❌ Admin force reset error:', {
      message: error.message,
      stack: error.stack,
      environment: process.env.NODE_ENV
    });

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la réinitialisation forcée de l\'admin',
      code: 'ADMIN_FORCE_RESET_ERROR'
    });
  }
});

export default router;