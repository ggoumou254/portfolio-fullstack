// backend/routes/seedRoutes.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import User from '../models/User.js';

const router = Router();

const SEED_CONFIG = {
  ADMIN: {
    name: 'Goumou Raphael',
    email: 'admin@example.com', // fallback, sovrascritto da ENV
    role: 'admin',
    status: 'active',
  },
  SALT_ROUNDS: 12,
  ALLOWED_ENVIRONMENTS: ['development', 'test'],
};

const seedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Trop de requêtes sur les routes de seed, réessayez plus tard.',
    code: 'SEED_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// --------- helpers ---------
function ensureDevEnv(res) {
  const currentEnv = process.env.NODE_ENV || 'development';
  if (!SEED_CONFIG.ALLOWED_ENVIRONMENTS.includes(currentEnv)) {
    res.status(403).json({
      success: false,
      message: 'Route réservée aux environnements de développement et test',
      code: 'SEED_NOT_ALLOWED',
    });
    return null;
  }
  return currentEnv;
}
const getAdminEmail = () =>
  (process.env.ADMIN_EMAIL || SEED_CONFIG.ADMIN.email).toLowerCase();

async function tryImportModel(path) {
  try {
    const mod = await import(path);
    return mod?.default || null;
  } catch {
    return null;
  }
}
function pickExistingModel(names = []) {
  // prova a prendere da mongoose.models
  for (const n of names) {
    if (mongoose.models[n]) return mongoose.models[n];
  }
  return null;
}

// -------------------------------------------
// INFO: elenco endpoint (utile da browser)
// ------------------------------------------
router.get('/', seedLimiter, (req, res) => {
  const env = process.env.NODE_ENV || 'development';
  return res.json({
    success: true,
    message: 'Seed & test utilities',
    data: {
      environment: env,
      allowed: SEED_CONFIG.ALLOWED_ENVIRONMENTS.includes(env),
      endpoints: {
        createAdmin: { method: 'POST', path: '/api/seed/admin', body: '{ "password": "Password123!" }' },
        adminStatus: { method: 'GET', path: '/api/seed/admin/status' },
        resetAdminPassword: { method: 'POST', path: '/api/seed/admin/reset-password', body: '{ "newPassword": "NewPass123!" }' },
        createTestData: { method: 'POST', path: '/api/seed/test-data' },
        cleanTestData: { method: 'DELETE', path: '/api/seed/test-data/clean' },
      }
    },
    code: 'SEED_HELP',
  });
});

// ⚠️ tutte le seed sono dev/test only
router.use((req, res, next) => {
  const env = ensureDevEnv(res);
  if (!env) return;
  next();
});

// Crea l’admin se assente (idempotente)
router.post('/admin', seedLimiter, async (req, res) => {
  try {
    const { password } = req.body || {};
    const adminPassword = password || process.env.ADMIN_SEED_PASSWORD;

    if (!adminPassword) {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe admin requis (body.password ou ADMIN_SEED_PASSWORD)',
        code: 'ADMIN_PASSWORD_REQUIRED',
      });
    }
    if (adminPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 8 caractères',
        code: 'WEAK_PASSWORD',
      });
    }

    const { name, role, status } = SEED_CONFIG.ADMIN;
    const email = getAdminEmail();

    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      return res.json({
        success: true,
        message: 'Compte administrateur déjà présent',
        data: {
          user: {
            id: existingAdmin._id,
            name: existingAdmin.name,
            email: existingAdmin.email,
            role: existingAdmin.role,
            status: existingAdmin.status,
            createdAt: existingAdmin.createdAt,
          },
          credentials: null,
        },
        code: 'ADMIN_ALREADY_EXISTS',
      });
    }

    const passwordHash = await bcrypt.hash(adminPassword, SEED_CONFIG.SALT_ROUNDS);

    const admin = await User.create({
      name,
      email,
      passwordHash,
      role,
      status,
      profile: { title: 'Administrateur Principal', company: 'Portfolio Platform' },
      emailVerification: { isVerified: true, verifiedAt: new Date() },
      security: { lastPasswordChange: new Date(), passwordChangeRequired: false },
      preferences: {
        emailNotifications: { newsletter: true, projectUpdates: true, securityAlerts: true, marketing: false },
        language: 'fr',
        timezone: 'Europe/Paris',
        theme: 'auto',
      },
      metadata: {
        registrationSource: 'seed',
        ipAddress: (req.ip || '').toString(),
        userAgent: req.get('User-Agent')?.substring(0, 500),
      },
      tags: ['admin', 'seed-created'],
    });

    return res.status(201).json({
      success: true,
      message: '✅ Compte administrateur créé avec succès',
      data: {
        user: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          status: admin.status,
          createdAt: admin.createdAt,
        },
        credentials: {
          email: admin.email,
          password: adminPassword,
          note: 'Conservez ces informations de connexion en lieu sûr',
        },
      },
      code: 'ADMIN_CREATED_SUCCESSFULLY',
    });
  } catch (error) {
    console.error('❌ Admin seed error:', { message: error.message, stack: error.stack });
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un administrateur avec cet email existe déjà',
        code: 'DUPLICATE_ADMIN_EMAIL',
      });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Données de validation invalides pour la création admin',
        errors: Object.values(error.errors).map((e) => e.message),
        code: 'ADMIN_VALIDATION_ERROR',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du compte administrateur',
      code: 'ADMIN_CREATION_ERROR',
    });
  }
});

// Statut admin
router.get('/admin/status', seedLimiter, async (_req, res) => {
  try {
    const email = getAdminEmail();
    const admin = await User.findOne({ email }).select('name email role status createdAt lastLoginAt loginCount');
    if (!admin) {
      return res.json({
        success: true,
        message: 'Aucun compte administrateur trouvé',
        data: { exists: false, user: null },
        code: 'ADMIN_NOT_FOUND',
      });
    }
    return res.json({
      success: true,
      message: 'Statut administrateur récupéré',
      data: {
        exists: true,
        user: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          status: admin.status,
          createdAt: admin.createdAt,
          lastLoginAt: admin.lastLoginAt,
          loginCount: admin.loginCount,
          accountAgeInDays: Math.floor((Date.now() - admin.createdAt) / (1000 * 60 * 60 * 24)),
        },
      },
      code: 'ADMIN_STATUS_RETRIEVED',
    });
  } catch (error) {
    console.error('❌ Admin status check error:', { message: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification du statut administrateur',
      code: 'ADMIN_STATUS_CHECK_ERROR',
    });
  }
});

// Reset password admin
router.post('/admin/reset-password', seedLimiter, async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Nouveau mot de passe requis',
        code: 'NEW_PASSWORD_REQUIRED',
      });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Le nouveau mot de passe doit contenir au moins 8 caractères',
        code: 'WEAK_NEW_PASSWORD',
      });
    }

    const email = getAdminEmail();
    const admin = await User.findOne({ email });
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Compte administrateur non trouvé',
        code: 'ADMIN_NOT_FOUND',
      });
    }

    if (typeof admin.changePassword === 'function') {
      await admin.changePassword(newPassword);
    } else {
      const hash = await bcrypt.hash(newPassword, SEED_CONFIG.SALT_ROUNDS);
      admin.passwordHash = hash;
      admin.security = {
        ...(admin.security || {}),
        lastPasswordChange: new Date(),
        passwordChangeRequired: false,
      };
      await admin.save();
    }

    return res.json({
      success: true,
      message: '✅ Mot de passe administrateur réinitialisé avec succès',
      data: { email: admin.email, note: 'Utilisez le nouveau mot de passe pour vous connecter.' },
      code: 'ADMIN_PASSWORD_RESET',
    });
  } catch (error) {
    console.error('❌ Admin password reset error:', { message: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la réinitialisation du mot de passe administrateur',
      code: 'ADMIN_PASSWORD_RESET_ERROR',
    });
  }
});

// Données de test (création)
router.post('/test-data', seedLimiter, async (req, res) => {
  try {
    const Project = (await tryImportModel('../models/Project.js')) || pickExistingModel(['Project']);
    const Review  = (await tryImportModel('../models/Review.js'))  || pickExistingModel(['Review']);
    const Contact = (await tryImportModel('../models/Contact.js')) || pickExistingModel(['Contact']);
    // Subscriber può chiamarsi in vari modi nei progetti
    const Subscriber =
      (await tryImportModel('../models/Subscriber.js')) ||
      pickExistingModel(['Subscriber','Newsletter','NewsletterSubscriber']);

    if (!Project) throw new Error('Modèle Project introuvable');

    const existingTestData = await Promise.all([
      Project.countDocuments({ tags: 'test-data' }),
      Review ? Review.countDocuments({ tags: 'test-data' }) : Promise.resolve(0),
      Contact ? Contact.countDocuments({ tags: 'test-data' }) : Promise.resolve(0),
      Subscriber ? Subscriber.countDocuments({ tags: 'test-data' }) : Promise.resolve(0),
    ]);

    const [testProjects, testReviews, testContacts, testSubscribers] = existingTestData;
    if (testProjects > 0 || testReviews > 0 || testContacts > 0 || testSubscribers > 0) {
      return res.json({
        success: true,
        message: 'Données de test déjà présentes',
        data: { testProjects, testReviews, testContacts, testSubscribers, note: 'Utilisez /api/seed/test-data/clean pour nettoyer' },
        code: 'TEST_DATA_ALREADY_EXISTS',
      });
    }

    // utenti test (crea se mancanti)
    const testUsers = await User.find({ tags: 'test-data' }).limit(5);
    let testUserIds = testUsers.map((u) => u._id);
    if (testUserIds.length < 2) {
      const newTestUsers = await User.create([
        {
          name: 'Test User 1',
          email: 'test1@example.com',
          passwordHash: await bcrypt.hash('Password@123', SEED_CONFIG.SALT_ROUNDS),
          role: 'user',
          status: 'active',
          tags: ['test-data'],
        },
        {
          name: 'Test User 2',
          email: 'test2@example.com',
          passwordHash: await bcrypt.hash('Password@123', SEED_CONFIG.SALT_ROUNDS),
          role: 'user',
          status: 'active',
          tags: ['test-data'],
        },
      ]);
      testUserIds = [...testUserIds, ...newTestUsers.map((u) => u._id)];
    }

    const testProjectsData = await Project.create([
      {
        title: 'Portfolio Website',
        description: 'Un site portfolio moderne avec React et Node.js',
        technologies: ['React', 'Node.js', 'MongoDB', 'Express'],
        github: 'https://github.com/test/portfolio',
        liveDemo: 'https://portfolio-test.example.com',
        status: 'published',
        featured: true,
        tags: ['test-data', 'web', 'react'],
      },
      {
        title: 'E-commerce API',
        description: 'API RESTful pour une plateforme e-commerce',
        technologies: ['Node.js', 'Express', 'MongoDB', 'JWT'],
        github: 'https://github.com/test/ecommerce-api',
        status: 'published',
        tags: ['test-data', 'api', 'nodejs'],
      },
    ]);

    const testReviewsData = Review
      ? await Review.create([
          {
            user: testUserIds[0],
            rating: 5,
            comment: 'Excellent travail ! Le portfolio est très professionnel.',
            status: 'approved',
            isFeatured: true,
            tags: ['test-data'],
          },
          {
            user: testUserIds[1],
            rating: 4,
            comment: 'Très bon développeur, je recommande vivement.',
            status: 'approved',
            tags: ['test-data'],
          },
        ])
      : [];

    const testContactsData = Contact
      ? await Contact.create([
          {
            name: 'Jean Dupont',
            email: 'jean.dupont@example.com',
            message: "Bonjour, je suis intéressé par vos services de développement.",
            status: 'new',
            tags: ['test-data'],
          },
          {
            name: 'Marie Martin',
            email: 'marie.martin@example.com',
            message: "Pouvez-vous me recontacter pour discuter d'un projet ?",
            status: 'read',
            tags: ['test-data'],
          },
        ])
      : [];

    const testSubscribersData = Subscriber
      ? await Subscriber.create([
          {
            email: 'subscriber1@example.com',
            name: 'Subscriber One',
            status: 'active',
            tags: ['test-data'],
          },
          {
            email: 'subscriber2@example.com',
            status: 'active',
            tags: ['test-data'],
          },
        ])
      : [];

    return res.status(201).json({
      success: true,
      message: '✅ Données de test créées avec succès',
      data: {
        created: {
          projects: testProjectsData.length,
          reviews: testReviewsData.length,
          contacts: testContactsData.length,
          subscribers: testSubscribersData.length,
          users: testUserIds.length,
        },
        note: 'Ces données sont taguées "test-data" et peuvent être nettoyées',
      },
      code: 'TEST_DATA_CREATED',
    });
  } catch (error) {
    console.error('❌ Test data creation error:', { message: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: 'Erreur lors de la création des données de test', code: 'TEST_DATA_CREATION_ERROR' });
  }
});

// Clean test data
router.delete('/test-data/clean', seedLimiter, async (req, res) => {
  try {
    const Project = (await tryImportModel('../models/Project.js')) || pickExistingModel(['Project']);
    const Review  = (await tryImportModel('../models/Review.js'))  || pickExistingModel(['Review']);
    const Contact = (await tryImportModel('../models/Contact.js')) || pickExistingModel(['Contact']);
    const Subscriber =
      (await tryImportModel('../models/Subscriber.js')) ||
      pickExistingModel(['Subscriber','Newsletter','NewsletterSubscriber']);

    // Projects: usa deleteOne documentale per attivare pre('deleteOne') e rimuovere file
    let projectsDeletedCount = 0;
    if (Project) {
      const toDelete = await Project.find({ tags: 'test-data' });
      for (const doc of toDelete) {
        await doc.deleteOne(); // triggers pre('deleteOne') => cancella immagini
        projectsDeletedCount++;
      }
    }

    const reviewsDeleted = Review ? await Review.deleteMany({ tags: 'test-data' }) : { deletedCount: 0 };
    const contactsDeleted = Contact ? await Contact.deleteMany({ tags: 'test-data' }) : { deletedCount: 0 };
    const subscribersDeleted = Subscriber ? await Subscriber.deleteMany({ tags: 'test-data' }) : { deletedCount: 0 };
    const usersDeleted = await User.deleteMany({ tags: 'test-data', email: { $ne: getAdminEmail() } });

    return res.json({
      success: true,
      message: '✅ Données de test nettoyées avec succès',
      data: {
        cleaned: {
          projects: projectsDeletedCount,
          reviews: reviewsDeleted.deletedCount || 0,
          contacts: contactsDeleted.deletedCount || 0,
          subscribers: subscribersDeleted.deletedCount || 0,
          users: usersDeleted.deletedCount || 0,
        },
      },
      code: 'TEST_DATA_CLEANED',
    });
  } catch (error) {
    console.error('❌ Test data clean error:', { message: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: 'Erreur lors du nettoyage des données de test', code: 'TEST_DATA_CLEAN_ERROR' });
  }
});

export default router;
