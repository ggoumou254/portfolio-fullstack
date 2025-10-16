// backend/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const VALIDATION = {
  NAME: { MIN_LENGTH: 2, MAX_LENGTH: 100 },
  EMAIL: { MAX_LENGTH: 255 },
  PASSWORD: { MIN_LENGTH: 8, MAX_LENGTH: 100 },
  BIO: { MAX_LENGTH: 500 }
};

const ROLES = { USER: 'user', MODERATOR: 'moderator', ADMIN: 'admin', SUPER_ADMIN: 'super_admin' };
const STATUS = { ACTIVE: 'active', INACTIVE: 'inactive', SUSPENDED: 'suspended', PENDING: 'pending' };

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Le nom est obligatoire'],
      trim: true,
      minlength: [VALIDATION.NAME.MIN_LENGTH, `Le nom doit contenir au moins ${VALIDATION.NAME.MIN_LENGTH} caractères`],
      maxlength: [VALIDATION.NAME.MAX_LENGTH, `Le nom ne peut pas dépasser ${VALIDATION.NAME.MAX_LENGTH} caractères`],
      match: [/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le nom ne peut contenir que des lettres, espaces, tirets et apostrophes']
      // niente index qui: c'è un indice testo globale più sotto
    },
    email: {
      type: String,
      required: [true, "L'email est obligatoire"],
      unique: true,        // crea l’indice unico
      lowercase: true,
      trim: true,
      maxlength: [VALIDATION.EMAIL.MAX_LENGTH, `L'email ne peut pas dépasser ${VALIDATION.EMAIL.MAX_LENGTH} caractères`],
      match: [EMAIL_REGEX, 'Veuillez fournir une adresse email valide']
      // niente index: true (evita duplicati)
    },
    passwordHash: {
      type: String,
      required: [true, 'Le mot de passe est obligatoire'],
      minlength: [VALIDATION.PASSWORD.MIN_LENGTH, `Le mot de passe doit contenir au moins ${VALIDATION.PASSWORD.MIN_LENGTH} caractères`],
      maxlength: [VALIDATION.PASSWORD.MAX_LENGTH, `Le mot de passe ne peut pas dépasser ${VALIDATION.PASSWORD.MAX_LENGTH} caractères`],
      select: false
    },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER, index: true },
    status: { type: String, enum: Object.values(STATUS), default: STATUS.ACTIVE, index: true },
    profile: {
      avatar: { type: String, trim: true, maxlength: 500, default: null },
      bio: { type: String, trim: true, maxlength: [VALIDATION.BIO.MAX_LENGTH, `La biographie ne peut pas dépasser ${VALIDATION.BIO.MAX_LENGTH} caractères`], default: null },
      title: { type: String, trim: true, maxlength: 100, default: null },
      company: { type: String, trim: true, maxlength: 100, default: null },
      website: { type: String, trim: true, maxlength: 500, match: [/^https?:\/\/.+\..+$/, 'Veuillez fournir une URL de site web valide'], default: null },
      location: { type: String, trim: true, maxlength: 100, default: null },
      social: {
        github: { type: String, trim: true, maxlength: 100, default: null },
        linkedin: { type: String, trim: true, maxlength: 100, default: null },
        twitter: { type: String, trim: true, maxlength: 100, default: null },
        portfolio: { type: String, trim: true, maxlength: 500, default: null }
      }
    },
    preferences: {
      emailNotifications: {
        newsletter: { type: Boolean, default: true },
        projectUpdates: { type: Boolean, default: true },
        securityAlerts: { type: Boolean, default: true },
        marketing: { type: Boolean, default: false }
      },
      language: { type: String, default: 'fr', maxlength: 10 },
      timezone: { type: String, default: 'Europe/Paris', maxlength: 50 },
      theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' }
    },
    security: {
      lastPasswordChange: { type: Date, default: Date.now },
      passwordChangeRequired: { type: Boolean, default: false },
      failedLoginAttempts: { type: Number, default: 0, min: 0 },
      lastFailedLogin: { type: Date, default: null },
      lockUntil: { type: Date, default: null },
      twoFactorEnabled: { type: Boolean, default: false },
      twoFactorSecret: { type: String, select: false, default: null },
      backupCodes: [{ type: String, select: false }],
      loginHistory: [{
        ipAddress: { type: String, maxlength: 45 },
        userAgent: { type: String, maxlength: 500 },
        timestamp: { type: Date, default: Date.now },
        success: { type: Boolean, required: true }
      }]
    },
    refreshTokenHash: { type: String, select: false, default: null },
    emailVerification: {
      isVerified: { type: Boolean, default: false },
      verificationToken: { type: String, select: false, default: null },
      verificationSentAt: { type: Date, default: null },
      verifiedAt: { type: Date, default: null }
    },
    lastLoginAt: { type: Date, default: null, index: true },
    loginCount: { type: Number, default: 0, min: 0 },
    metadata: {
      registrationSource: { type: String, enum: ['website', 'mobile', 'api', 'admin', 'import', 'seed'], default: 'website' },
      ipAddress: { type: String, maxlength: 45, sparse: true },
      userAgent: { type: String, maxlength: 500, sparse: true },
      referrer: { type: String, maxlength: 500, default: null }
    },
    stats: {
      projectsCreated: { type: Number, default: 0, min: 0 },
      reviewsSubmitted: { type: Number, default: 0, min: 0 },
      contactsSent: { type: Number, default: 0, min: 0 }
    },
    tags: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],
    notes: { type: String, trim: true, maxlength: 1000, default: null }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id; delete ret.__v; delete ret.passwordHash; delete ret.refreshTokenHash;
        delete ret.security?.twoFactorSecret; delete ret.security?.backupCodes; delete ret.security?.loginHistory;
        delete ret.emailVerification?.verificationToken;
        delete ret.metadata?.ipAddress; delete ret.metadata?.userAgent;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; }
    }
  }
);

// Indici utili (evitiamo duplicati)
userSchema.index({ role: 1, status: 1, createdAt: -1 });
userSchema.index({ status: 1, lastLoginAt: -1 });
userSchema.index({ email: 1, status: 1 });
userSchema.index({
  name: 'text',
  email: 'text',
  'profile.bio': 'text',
  'profile.company': 'text',
  'profile.title': 'text'
});

// Virtuals
userSchema.virtual('accountAgeInDays').get(function () {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});
userSchema.virtual('isRecent').get(function () {
  return (Date.now() - this.createdAt) < (7 * 24 * 60 * 60 * 1000);
});
userSchema.virtual('isLocked').get(function () {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});
userSchema.virtual('daysSinceLastLogin').get(function () {
  if (!this.lastLoginAt) return null;
  return Math.floor((Date.now() - this.lastLoginAt) / (1000 * 60 * 60 * 24));
});
userSchema.virtual('activityLevel').get(function () {
  const total = this.stats.projectsCreated + this.stats.reviewsSubmitted + this.stats.contactsSent;
  if (total >= 20) return 'high';
  if (total >= 10) return 'medium';
  if (total >= 1) return 'low';
  return 'inactive';
});

// Hooks
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  try {
    const pwd = this.passwordHash;
    const alreadyHashed = typeof pwd === 'string' && BCRYPT_HASH_REGEX.test(pwd);
    if (!alreadyHashed) {
      if (!PASSWORD_REGEX.test(pwd)) {
        throw new Error('Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial et faire 8 caractères minimum');
      }
      this.passwordHash = await bcrypt.hash(pwd, 12);
    }
    this.security.lastPasswordChange = new Date();
    this.security.passwordChangeRequired = false;
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};
    const pwd = (update.$set && update.$set.passwordHash) ?? update.passwordHash;
    if (!pwd) return next();

    const alreadyHashed = typeof pwd === 'string' && BCRYPT_HASH_REGEX.test(pwd);
    if (!alreadyHashed) {
      if (!PASSWORD_REGEX.test(pwd)) {
        throw new Error('Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial et faire 8 caractères minimum');
      }
      const hashed = await bcrypt.hash(pwd, 12);
      if (update.$set && typeof update.$set === 'object') update.$set.passwordHash = hashed;
      else update.passwordHash = hashed;
      this.setUpdate(update);
    }

    if (!update.$set) update.$set = {};
    update.$set['security.lastPasswordChange'] = new Date();
    update.$set['security.passwordChangeRequired'] = false;
    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});

// Metodi
userSchema.methods.verifyPassword = async function (candidate) {
  if (!candidate || !this.passwordHash) return false;
  try { return await bcrypt.compare(candidate, this.passwordHash); } catch { return false; }
};
userSchema.methods.recordLogin = function (ip = null, ua = null, success = true) {
  if (success) {
    this.lastLoginAt = new Date();
    this.loginCount += 1;
    this.security.failedLoginAttempts = 0;
    this.security.lockUntil = null;
    this.security.lastFailedLogin = null;
  } else {
    this.security.failedLoginAttempts += 1;
    this.security.lastFailedLogin = new Date();
    if (this.security.failedLoginAttempts >= 5) this.security.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
  }
  this.security.loginHistory.push({ ipAddress: ip, userAgent: ua, timestamp: new Date(), success });
  return this.save();
};
userSchema.methods.changePassword = async function (newPassword) {
  this.passwordHash = newPassword; // verrà hashata dal pre-save
  this.security.lastPasswordChange = new Date();
  this.security.passwordChangeRequired = false;
  this.security.failedLoginAttempts = 0;
  this.security.lockUntil = null;
  return this.save();
};
userSchema.methods.unlockAccount = function () {
  this.security.failedLoginAttempts = 0;
  this.security.lockUntil = null;
  return this.save();
};
userSchema.methods.verifyEmail = function () {
  this.emailVerification.isVerified = true;
  this.emailVerification.verifiedAt = new Date();
  this.emailVerification.verificationToken = null;
  return this.save();
};
userSchema.methods.addTag = function (tag) {
  const t = String(tag || '').trim().toLowerCase();
  if (t && !this.tags.includes(t)) this.tags.push(t);
  return this.save();
};
userSchema.methods.removeTag = function (tag) {
  const t = String(tag || '').trim().toLowerCase();
  this.tags = this.tags.filter(x => x !== t);
  return this.save();
};

// Statics
userSchema.statics.findByEmail = function (email) { return this.findOne({ email: email.toLowerCase() }); };
userSchema.statics.findActive = function () { return this.find({ status: STATUS.ACTIVE }).sort({ createdAt: -1 }); };
userSchema.statics.findByRole = function (role) { return this.find({ role, status: STATUS.ACTIVE }).sort({ createdAt: -1 }); };
userSchema.statics.search = function (q) {
  return this.find({ $text: { $search: q }, status: STATUS.ACTIVE }, { score: { $meta: 'textScore' } })
             .sort({ score: { $meta: 'textScore' }, createdAt: -1 });
};

export { ROLES as USER_ROLES, STATUS as USER_STATUS, VALIDATION as USER_VALIDATION };

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
