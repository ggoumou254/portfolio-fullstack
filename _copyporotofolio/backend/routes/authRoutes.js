// backend/routes/authRoutes.js
import express from 'express';
import { body } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import bcrypt from 'bcryptjs';

import {
  register,
  login,
  refresh,
  logout,
  profile,
  updateProfile,
  changePassword,
  getAdminStats
} from '../controllers/authController.js';

import { verifyToken, requireAdmin } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

import {
  generateAccessToken,
  generateRefreshToken,
  setRefreshCookie
} from '../utils/token.js';

const router = express.Router();

/* =========================
   Rate limit (IPv6/proxy-safe)
========================= */
const withUAKey = (req, res) => {
  const ip = ipKeyGenerator(req, res);
  const ua = (req.get('user-agent') || '').slice(0, 160);
  return `${ip}|${ua}`;
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: withUAKey,
  message: {
    success: false,
    message: 'Trop de tentatives de connexion, veuillez réessayer dans 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const ownerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: withUAKey,
  message: {
    success: false,
    message: 'Trop de tentatives owner-login, réessayez plus tard.',
    code: 'OWNER_RATE_LIMIT'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: withUAKey,
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer plus tard.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/* =========================
   Validation
========================= */
const registerValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Nom requis (min 2 caractères)'),
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Doit contenir majuscule, minuscule et chiffre'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Mot de passe requis (min 8)'),
];

const updateProfileValidation = [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Nom invalide'),
  body('email').optional().isEmail().withMessage('Email invalide').normalizeEmail(),
];

/* =========================
   OWNER LOGIN (passphrase -> JWT admin)
========================= */
router.post('/owner-login', ownerLimiter, async (req, res) => {
  try {
    const { pass } = req.body || {};
    const OWNER_PASSPHRASE = process.env.OWNER_PASSPHRASE;
    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

    if (!OWNER_PASSPHRASE || !ADMIN_EMAIL) {
      return res.status(500).json({
        success: false,
        message: 'OWNER_PASSPHRASE o ADMIN_EMAIL non configurati',
        code: 'OWNER_LOGIN_MISCONFIGURED'
      });
    }
    if (!pass || pass !== OWNER_PASSPHRASE) {
      return res.status(401).json({
        success: false,
        message: 'Passphrase errata',
        code: 'OWNER_PASSPHRASE_INVALID'
      });
    }

    let user = await User.findOne({ email: ADMIN_EMAIL });
    if (!user) {
      const pwd = process.env.ADMIN_PASSWORD;
      if (!pwd || pwd.length < 8) {
        return res.status(500).json({
          success: false,
          message: 'Admin non trovato et ADMIN_PASSWORD non configurata per crearlo',
          code: 'OWNER_LOGIN_NO_ADMIN'
        });
      }
      const hash = await bcrypt.hash(pwd, 12);
      user = await User.create({
        name: 'Owner',
        email: ADMIN_EMAIL,
        passwordHash: hash,
        role: 'admin',
        status: 'active',
        emailVerification: { isVerified: true, verifiedAt: new Date() },
        security: { lastPasswordChange: new Date(), passwordChangeRequired: false },
        preferences: { language: 'fr', timezone: 'Europe/Paris', theme: 'auto' },
        tags: ['owner', 'seed-auto'],
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Compte administrateur inactif',
        code: 'ADMIN_INACTIVE'
      });
    }

    const accessToken = generateAccessToken(user._id.toString(), user.role);
    const refreshToken = generateRefreshToken(user._id.toString(), user.role);
    setRefreshCookie(res, refreshToken);

    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    };

    return res.json({
      success: true,
      message: 'Owner login OK',
      token: accessToken,
      refreshToken,
      user: safeUser,
      data: { user: safeUser, accessToken },
      code: 'OWNER_LOGIN_OK'
    });
  } catch (e) {
    console.error('❌ owner-login error:', e);
    return res.status(500).json({ success: false, message: 'Erreur owner-login', code: 'OWNER_LOGIN_ERROR' });
  }
});

/* =========================
   Routes publiques
========================= */
router.post('/register', generalLimiter, registerValidation, register);
router.post('/login', authLimiter, loginValidation, login);
router.post('/refresh', generalLimiter, refresh);

/* =========================
   Routes privées
========================= */
router.post('/logout', verifyToken, logout);
router.get('/profile', verifyToken, profile);
router.put('/profile', verifyToken, updateProfileValidation, updateProfile);

/* =========================
   Verify (utilisé par frontend/auth.js -> verifyToken)
========================= */
router.get('/verify', verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

/* =========================
   Change password
========================= */
router.post('/change-password', verifyToken, [
  body('currentPassword').notEmpty().withMessage('Le mot de passe actuel est requis'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('Le nouveau mot de passe doit être différent de l\'actuel');
      }
      return true;
    })
], changePassword);

/* =========================
   Admin
========================= */
router.get('/admin/stats', verifyToken, requireAdmin, getAdminStats);

export default router;
