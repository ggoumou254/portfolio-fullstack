// backend/routes/registerRoutes.js
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { sendMail } from '../nodemailer.config.js';

const router = Router();

// Rate limiting pour l'inscription
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3, // 3 tentatives d'inscription par heure par IP
  message: {
    success: false,
    message: 'Trop de tentatives d\'inscription, veuillez réessayer dans 1 heure.',
    code: 'REGISTRATION_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation rules
const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le nom ne peut contenir que des lettres, espaces, tirets et apostrophes')
    .escape(),

  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Veuillez fournir une adresse email valide')
    .isLength({ max: 100 })
    .withMessage('L\'email ne doit pas dépasser 100 caractères'),

  body('password')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial')
    .isLength({ max: 100 })
    .withMessage('Le mot de passe ne doit pas dépasser 100 caractères'),

  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Les mots de passe ne correspondent pas');
      }
      return true;
    })
];

// Configuration
const SALT_ROUNDS = 12;

/**
 * Send welcome email (non-blocking)
 */
const sendWelcomeEmail = async (user) => {
  try {
    await sendMail({
      from: process.env.EMAIL_FROM || `"Portfolio" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: '🎉 Bienvenue sur notre plateforme !',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb; text-align: center;">Bienvenue ${user.name} !</h2>
          <div style="background: #f8fafc; padding: 25px; border-radius: 10px; margin: 20px 0;">
            <p style="font-size: 16px; color: #374151;">
              Félicitations ! Votre compte a été créé avec succès sur notre plateforme.
            </p>
            <p style="font-size: 16px; color: #374151;">
              Vous pouvez maintenant vous connecter et accéder à toutes les fonctionnalités.
            </p>
            <div style="background: #e0f2fe; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p style="margin: 0; color: #0369a1;">
                <strong>Email :</strong> ${user.email}<br>
                <strong>Nom :</strong> ${user.name}
              </p>
            </div>
          </div>
          <div style="text-align: center; margin-top: 30px;">
            <p style="font-size: 14px; color: #6b7280;">
              Si vous n'êtes pas à l'origine de cette inscription, veuillez nous contacter immédiatement.
            </p>
          </div>
        </div>
      `,
      text: `Bienvenue ${user.name} !\n\nVotre compte a été créé avec succès.\n\nEmail: ${user.email}\nNom: ${user.name}\n\nSi vous n'êtes pas à l'origine de cette inscription, veuillez nous contacter immédiatement.`
    });

    console.log(`✅ Welcome email sent to: ${user.email}`);
  } catch (error) {
    console.warn('⚠️ Welcome email failed (non-critical):', error.message);
  }
};

/**
 * Send admin notification (non-blocking)
 */
const sendAdminNotification = async (user) => {
  try {
    await sendMail({
      from: process.env.EMAIL_FROM || `"Portfolio" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      subject: '👤 Nouvel utilisateur inscrit',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #059669;">Nouvelle inscription</h2>
          <div style="background: #ecfdf5; padding: 20px; border-radius: 8px;">
            <p><strong>Nom :</strong> ${user.name}</p>
            <p><strong>Email :</strong> ${user.email}</p>
            <p><strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}</p>
            <p><strong>ID :</strong> ${user._id}</p>
          </div>
        </div>
      `,
      text: `Nouvel utilisateur inscrit:\n\nNom: ${user.name}\nEmail: ${user.email}\nDate: ${new Date().toLocaleString('fr-FR')}\nID: ${user._id}`
    });

    console.log(`✅ Admin notification sent for new user: ${user.email}`);
  } catch (error) {
    console.warn('⚠️ Admin notification email failed:', error.message);
  }
};

/**
 * @route   POST /api/register
 * @desc    Register new user
 * @access  Public
 * @body    {name, email, password, confirmPassword}
 * @returns {user}
 */
router.post('/', registerLimiter, registerValidation, async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    // Vérification de base supplémentaire
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs sont obligatoires',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Vérification de la confirmation du mot de passe
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Les mots de passe ne correspondent pas',
        code: 'PASSWORD_MISMATCH'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Un utilisateur avec cet email existe déjà',
        code: 'USER_ALREADY_EXISTS'
      });
    }

    // Vérifier les tentatives récentes d'inscription (anti-spam)
    const recentAttempt = await User.findOne({
      email: normalizedEmail,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } // 10 minutes
    });

    if (recentAttempt) {
      return res.status(429).json({
        success: false,
        message: 'Tentative d\'inscription trop récente, veuillez réessayer plus tard',
        code: 'RECENT_REGISTRATION_ATTEMPT'
      });
    }

    // Hacher le mot de passe
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Créer l'utilisateur
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'user',
      isActive: true,
      lastLoginAt: new Date()
    });

    // Préparer la réponse (sans le hash de mot de passe)
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt
    };

    // Envoyer les emails de notification (non-bloquant)
    if (process.env.SEND_WELCOME_EMAIL !== 'false') {
      sendWelcomeEmail(user);
    }

    if (process.env.SEND_ADMIN_NOTIFICATIONS !== 'false') {
      sendAdminNotification(user);
    }

    // Journaliser l'inscription
    console.log('✅ New user registered:', {
      userId: user._id,
      email: user.email,
      name: user.name,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'Inscription réussie ! Bienvenue sur notre plateforme.',
      data: {
        user: userResponse
      },
      code: 'REGISTRATION_SUCCESSFUL'
    });

  } catch (error) {
    console.error('❌ Registration error:', {
      message: error.message,
      email: req.body?.email,
      name: req.body?.name,
      stack: error.stack
    });

    // Gestion spécifique des erreurs MongoDB
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Données de validation invalides',
        errors: Object.values(error.errors).map(err => err.message),
        code: 'VALIDATION_ERROR'
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un utilisateur avec cet email existe déjà',
        code: 'DUPLICATE_EMAIL'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'inscription',
      code: 'REGISTRATION_ERROR'
    });
  }
});

/**
 * @route   GET /api/register/check-email
 * @desc    Check if email is available
 * @access  Public
 * @query   {email}
 * @returns {available}
 */
router.get('/check-email', registerLimiter, [
  query('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Veuillez fournir une adresse email valide')
], async (req, res) => {
  try {
    const { email } = req.query;

    const existingUser = await User.findOne({ email: email.toLowerCase() });

    res.json({
      success: true,
      data: {
        available: !existingUser,
        email: email
      },
      code: 'EMAIL_AVAILABILITY_CHECKED'
    });

  } catch (error) {
    console.error('❌ Check email error:', {
      message: error.message,
      email: req.query?.email,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification de l\'email',
      code: 'EMAIL_CHECK_ERROR'
    });
  }
});

export default router;