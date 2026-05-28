import { validationResult } from 'express-validator';
import User from '../models/User.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  hashToken
} from '../utils/token.js';

/* =========================
   Messaggi standard
========================= */
const MESSAGES = {
  AUTH: {
    REGISTER_SUCCESS: 'Inscription réussie',
    LOGIN_SUCCESS: 'Connexion réussie',
    LOGOUT_SUCCESS: 'Déconnexion réussie',
    TOKEN_REFRESHED: 'Token actualisé avec succès',
    PROFILE_RETRIEVED: 'Profil récupéré avec succès',
    PROFILE_UPDATED: 'Profil mis à jour avec succès'
  },
  ERROR: {
    VALIDATION: 'Données de formulaire invalides',
    EMAIL_EXISTS: 'Cette adresse email est déjà utilisée',
    INVALID_CREDENTIALS: 'Email ou mot de passe incorrect',
    USER_NOT_FOUND: 'Utilisateur non trouvé',
    INVALID_REFRESH_TOKEN: 'Token de rafraîchissement invalide',
    MISSING_REFRESH_TOKEN: 'Token de rafraîchissement manquant',
    SERVER: 'Erreur interne du serveur',
    UNAUTHORIZED: 'Non autorisé',
    ACCOUNT_LOCKED: 'Compte verrouillé temporairement',
    ACCOUNT_INACTIVE: 'Compte inactif'
  }
};

/* =========================
   Helpers
========================= */
const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: MESSAGES.ERROR.VALIDATION,
      errors: errors.array(),
      code: 'VALIDATION_ERROR'
    });
  }
  return null;
};

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  isActive: user.status === 'active',
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const generateAndSaveTokens = async (user, res) => {
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);

  user.refreshTokenHash = hashToken(refreshToken);
  user.lastLoginAt = new Date();
  await user.save();

  setRefreshCookie(res, refreshToken);
  return { accessToken, refreshToken };
};

/* =========================
   Controllers
========================= */
export const register = async (req, res) => {
  const validationError = handleValidationErrors(req, res);
  if (validationError) return validationError;

  const { name, email, password } = req.body || {};
  try {
    const lowerEmail = (email || '').toLowerCase().trim();
    const existing = await User.findOne({ email: lowerEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: MESSAGES.ERROR.EMAIL_EXISTS,
        code: 'EMAIL_ALREADY_EXISTS'
      });
    }

    // Il model deve gestire l'hash (pre-save) oppure assegniamo direttamente passwordHash=plain
    const user = await User.create({
      name,
      email: lowerEmail,
      passwordHash: password, // il tuo model gestisce hash e validazioni (verifyPassword etc.)
      role: 'user',
      status: 'active',
      emailVerification: { isVerified: true, verifiedAt: new Date() },
      metadata: {
        registrationSource: 'website',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 500)
      }
    });

    const { accessToken } = await generateAndSaveTokens(user, res);

    return res.status(201).json({
      success: true,
      message: MESSAGES.AUTH.REGISTER_SUCCESS,
      data: { user: sanitizeUser(user), accessToken },
      code: 'REGISTRATION_SUCCESSFUL'
    });
  } catch (error) {
    if (error?.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: MESSAGES.ERROR.VALIDATION,
        errors: Object.values(error.errors).map(e => e.message),
        code: 'MODEL_VALIDATION_ERROR'
      });
    }
    console.error('❌ Registration error:', { message: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: MESSAGES.ERROR.SERVER, code: 'SERVER_ERROR' });
  }
};

export const login = async (req, res) => {
  const validationError = handleValidationErrors(req, res);
  if (validationError) return validationError;

  const { email, password } = req.body || {};
  try {
    const lowerEmail = (email || '').toLowerCase().trim();
    const user = await User.findOne({ email: lowerEmail })
      .select('+passwordHash +security.lockUntil +status +role');

    if (!user) {
      return res.status(401).json({ success: false, message: MESSAGES.ERROR.INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' });
    }
    if (user.isLocked) {
      return res.status(423).json({ success: false, message: MESSAGES.ERROR.ACCOUNT_LOCKED, code: 'ACCOUNT_LOCKED' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: MESSAGES.ERROR.ACCOUNT_INACTIVE, code: 'ACCOUNT_INACTIVE' });
    }

    const ok = await user.verifyPassword(password);
    if (!ok) {
      await user.recordLogin(req.ip, req.get('User-Agent'), false);
      return res.status(401).json({ success: false, message: MESSAGES.ERROR.INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' });
    }

    await user.recordLogin(req.ip, req.get('User-Agent'), true);

    const { accessToken } = await generateAndSaveTokens(user, res);

    return res.json({
      success: true,
      message: MESSAGES.AUTH.LOGIN_SUCCESS,
      data: { user: sanitizeUser(user), accessToken },
      code: 'LOGIN_SUCCESSFUL'
    });
  } catch (error) {
    console.error('❌ Login error:', { message: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: MESSAGES.ERROR.SERVER, code: 'SERVER_ERROR' });
  }
};

export const refresh = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) {
      return res.status(401).json({ success: false, message: MESSAGES.ERROR.MISSING_REFRESH_TOKEN, code: 'MISSING_REFRESH_TOKEN' });
    }

    const payload = verifyRefreshToken(token);
    const userId = payload?.id || payload?.sub;
    const user = await User.findById(userId).select('+refreshTokenHash +status +role');

    if (!user || user.status !== 'active' || !user.refreshTokenHash) {
      return res.status(401).json({ success: false, message: MESSAGES.ERROR.INVALID_REFRESH_TOKEN, code: 'INVALID_REFRESH_TOKEN' });
    }

    if (user.refreshTokenHash !== hashToken(token)) {
      user.refreshTokenHash = null;
      await user.save();
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, message: MESSAGES.ERROR.INVALID_REFRESH_TOKEN, code: 'INVALID_REFRESH_TOKEN' });
    }

    // Rotazione
    const newAccess = generateAccessToken(user._id, user.role);
    const newRefresh = generateRefreshToken(user._id, user.role);

    user.refreshTokenHash = hashToken(newRefresh);
    await user.save();

    setRefreshCookie(res, newRefresh);

    return res.json({
      success: true,
      message: MESSAGES.AUTH.TOKEN_REFRESHED,
      data: { accessToken: newAccess },
      code: 'TOKEN_REFRESHED'
    });
  } catch (error) {
    console.error('❌ Token refresh error:', { message: error.message, stack: error.stack });
    return res.status(401).json({ success: false, message: MESSAGES.ERROR.UNAUTHORIZED, code: 'REFRESH_TOKEN_INVALID' });
  }
};

export const logout = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        const userId = payload?.id || payload?.sub;
        if (userId) {
          await User.findByIdAndUpdate(userId, { $set: { refreshTokenHash: null } });
        }
      } catch (err) {
        console.warn('⚠️ Token invalide lors de la déconnexion:', err.message);
      }
    }
    clearRefreshCookie(res);
    return res.json({ success: true, message: MESSAGES.AUTH.LOGOUT_SUCCESS, code: 'LOGOUT_SUCCESSFUL' });
  } catch (error) {
    console.error('❌ Logout error:', { message: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: MESSAGES.ERROR.SERVER, code: 'SERVER_ERROR' });
  }
};

export const profile = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId || req.auth?.id || req.auth?.sub;
    if (!userId) return res.status(401).json({ success: false, message: MESSAGES.ERROR.UNAUTHORIZED, code: 'UNAUTHORIZED' });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: MESSAGES.ERROR.USER_NOT_FOUND, code: 'USER_NOT_FOUND' });
    }

    return res.json({
      success: true,
      message: MESSAGES.AUTH.PROFILE_RETRIEVED,
      data: { user: sanitizeUser(user) },
      code: 'PROFILE_RETRIEVED'
    });
  } catch (error) {
    console.error('❌ Profile error:', { message: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: MESSAGES.ERROR.SERVER, code: 'SERVER_ERROR' });
  }
};

export const updateProfile = async (req, res) => {
  const validationError = handleValidationErrors(req, res);
  if (validationError) return validationError;

  try {
    const userId = req.user?.id || req.userId || req.auth?.id || req.auth?.sub;
    if (!userId) return res.status(401).json({ success: false, message: MESSAGES.ERROR.UNAUTHORIZED, code: 'UNAUTHORIZED' });

    const { name } = req.body || {};
    const user = await User.findByIdAndUpdate(
      userId,
      { name },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: MESSAGES.ERROR.USER_NOT_FOUND, code: 'USER_NOT_FOUND' });
    }

    return res.json({
      success: true,
      message: MESSAGES.AUTH.PROFILE_UPDATED,
      data: { user: sanitizeUser(user) },
      code: 'PROFILE_UPDATED'
    });
  } catch (error) {
    console.error('❌ Profile update error:', { message: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: MESSAGES.ERROR.SERVER, code: 'SERVER_ERROR' });
  }
};

export const changePassword = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId || req.auth?.id || req.auth?.sub;
    if (!userId) return res.status(401).json({ success: false, message: MESSAGES.ERROR.UNAUTHORIZED, code: 'UNAUTHORIZED' });

    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Paramètres manquants: currentPassword, newPassword, confirmPassword',
        code: 'VALIDATION_ERROR'
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Le nouveau mot de passe et sa confirmation ne correspondent pas', code: 'PASSWORD_MISMATCH' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Le nouveau mot de passe doit contenir au moins 8 caractères', code: 'WEAK_PASSWORD' });
    }

    const user = await User.findById(userId).select('+passwordHash +status +role');
    if (!user) return res.status(404).json({ success: false, message: MESSAGES.ERROR.USER_NOT_FOUND, code: 'USER_NOT_FOUND' });

    const ok = await user.verifyPassword(currentPassword);
    if (!ok) {
      await user.recordLogin(req.ip, req.get('User-Agent'), false);
      return res.status(400).json({ success: false, message: 'Mot de passe actuel incorrect', code: 'INVALID_CURRENT_PASSWORD' });
    }

    await user.changePassword(newPassword);

    clearRefreshCookie(res);
    const newAccess = generateAccessToken(user._id, user.role);
    const newRefresh = generateRefreshToken(user._id, user.role);
    user.refreshTokenHash = hashToken(newRefresh);
    await user.save();
    setRefreshCookie(res, newRefresh);

    return res.json({
      success: true,
      message: 'Mot de passe modifié avec succès',
      data: { accessToken: newAccess, user: sanitizeUser(user) },
      code: 'PASSWORD_CHANGED'
    });
  } catch (error) {
    console.error('❌ changePassword error:', { message: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: 'Erreur lors du changement de mot de passe', code: 'CHANGE_PASSWORD_ERROR' });
  }
};

export const getAdminStats = async (_req, res) => {
  try {
    const UserModel = (await import('../models/User.js')).default;
    const Project = (await import('../models/Project.js')).default;
    const Review = (await import('../models/Review.js')).default;

    const [totalUsers, activeUsers, adminCount, totalProjects, totalReviews] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ status: 'active' }),
      UserModel.countDocuments({ role: 'admin' }),
      Project.countDocuments(),
      Review.countDocuments()
    ]);

    res.json({
      success: true,
      message: 'Statistiques administrateur récupérées avec succès',
      data: {
        users: { total: totalUsers, active: activeUsers, admins: adminCount },
        content: { projects: totalProjects, reviews: totalReviews },
        timestamp: new Date().toISOString()
      },
      code: 'ADMIN_STATS_OK'
    });
  } catch (error) {
    console.error('❌ getAdminStats error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques admin',
      code: 'ADMIN_STATS_ERROR'
    });
  }
};
