// backend/models/Subscriber.js
import mongoose from 'mongoose';
// Se usi spesso .lean() con virtuals, abilita questo plugin (opzionale):
// import mongooseLeanVirtuals from 'mongoose-lean-virtuals';

/* =========================
   Costanti di validazione & enum
========================= */
const VALIDATION = {
  EMAIL: { MAX_LENGTH: 255 },
  NAME: { MAX_LENGTH: 100 },
  SOURCE: { MAX_LENGTH: 50 },
  NOTES: { MAX_LENGTH: 500 }
};

const STATUS = {
  ACTIVE: 'active',
  UNSUBSCRIBED: 'unsubscribed',
  BOUNCED: 'bounced',
  COMPLAINED: 'complained',
  INACTIVE: 'inactive'
};

const SOURCE = {
  WEBSITE: 'website',
  LANDING_PAGE: 'landing_page',
  MOBILE: 'mobile',
  API: 'api',
  IMPORT: 'import',
  REFERRAL: 'referral',
  SOCIAL: 'social',
  OTHER: 'other'
};

const PREFERENCES = {
  NEWSLETTER: 'newsletter',
  PROJECT_UPDATES: 'project_updates',
  BLOG_POSTS: 'blog_posts',
  PROMOTIONAL: 'promotional',
  ALL: 'all'
};

// RFC-like email regex (robusto ma non eccessivo)
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/* =========================
   Schema
========================= */
const subscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "L'email est obligatoire"],
      lowercase: true,
      trim: true,
      maxlength: [VALIDATION.EMAIL.MAX_LENGTH, `L'email ne peut pas dépasser ${VALIDATION.EMAIL.MAX_LENGTH} caractères`],
      match: [EMAIL_REGEX, 'Veuillez fournir une adresse email valide'],
      // ⚠️ RIMOSSO: index: true - USA SOLO L'INDICE UNIVOCO SOTTO
    },
    name: {
      type: String,
      trim: true,
      maxlength: [VALIDATION.NAME.MAX_LENGTH, `Le nom ne peut pas dépasser ${VALIDATION.NAME.MAX_LENGTH} caractères`],
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: { values: Object.values(STATUS), message: "Statut d'abonné non valide" },
      default: STATUS.ACTIVE,
      index: true
    },
    source: {
      type: String,
      enum: { values: Object.values(SOURCE), message: "Source d'abonnement non valide" },
      default: SOURCE.WEBSITE,
      index: true
    },
    sourceDetail: {
      type: String,
      trim: true,
      maxlength: [VALIDATION.SOURCE.MAX_LENGTH, `Le détail de la source ne peut pas dépasser ${VALIDATION.SOURCE.MAX_LENGTH} caractères`],
      default: null
    },
    preferences: [{
      type: String,
      enum: { values: Object.values(PREFERENCES), message: 'Préférence non valide' }
    }],
    subscribedAt: { type: Date, default: Date.now, index: true },
    unsubscribedAt: { type: Date, default: null, index: true },
    lastEngagementAt: { type: Date, default: null, index: true },

    engagementScore: { type: Number, min: 0, max: 100, default: 0 },
    emailSent: { type: Number, default: 0, min: 0 },
    emailOpened: { type: Number, default: 0, min: 0 },
    emailClicked: { type: Number, default: 0, min: 0 },
    openRate: { type: Number, min: 0, max: 100, default: 0 },
    clickRate: { type: Number, min: 0, max: 100, default: 0 },
    lastEmailSentAt: { type: Date, default: null },

    bounceCount: { type: Number, default: 0, min: 0 },
    lastBounceAt: { type: Date, default: null },
    complaintCount: { type: Number, default: 0, min: 0 },
    lastComplaintAt: { type: Date, default: null },

    location: {
      country: { type: String, trim: true, maxlength: 100, default: null, index: true },
      city: { type: String, trim: true, maxlength: 100, default: null },
      timezone: { type: String, trim: true, maxlength: 50, default: null },
      language: { type: String, trim: true, maxlength: 10, default: 'fr' }
    },

    metadata: {
      ipAddress: { type: String, trim: true, maxlength: 45, sparse: true },
      userAgent: { type: String, trim: true, maxlength: 500, sparse: true },
      referrer: { type: String, trim: true, maxlength: 500, default: null },
      utmSource: { type: String, trim: true, maxlength: 100, default: null },
      utmMedium: { type: String, trim: true, maxlength: 100, default: null },
      utmCampaign: { type: String, trim: true, maxlength: 100, default: null },
      utmTerm: { type: String, trim: true, maxlength: 100, default: null },
      utmContent: { type: String, trim: true, maxlength: 100, default: null }
    },

    tags: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],
    notes: {
      type: String,
      trim: true,
      maxlength: [VALIDATION.NOTES.MAX_LENGTH, `Les notes ne peuvent pas dépasser ${VALIDATION.NOTES.MAX_LENGTH} caractères`],
      default: null
    },

    doubleOptIn: {
      isVerified: { type: Boolean, default: false },
      verifiedAt: { type: Date, default: null },
      verificationToken: { type: String, trim: true, default: null },
      verificationSentAt: { type: Date, default: null }
    },

    segments: [{ type: String, trim: true, lowercase: true, maxlength: 50 }],

    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        // nascondi token double opt-in
        if (ret.doubleOptIn) delete ret.doubleOptIn.verificationToken;
        // nascondi meta sensibili di default
        if (!ret.showSensitive) {
          if (ret.metadata) {
            delete ret.metadata.ipAddress;
            delete ret.metadata.userAgent;
          }
        }
        delete ret.showSensitive; // non esporlo mai
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

/* =========================
   Indici
========================= */
// ⚠️ CORRETTO: Unicità email case-insensitive - SOLO QUESTO INDICE PER EMAIL
subscriberSchema.index({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

// Query frequenti
subscriberSchema.index({ status: 1, subscribedAt: -1 });
subscriberSchema.index({ source: 1, status: 1, subscribedAt: -1 });
subscriberSchema.index({ 'location.country': 1, status: 1 });
subscriberSchema.index({ status: 1, lastEngagementAt: -1 });
subscriberSchema.index({ engagementScore: -1, status: 1 });
subscriberSchema.index({ tags: 1, status: 1 });
subscriberSchema.index({ segments: 1, status: 1 });

// Preferenze
subscriberSchema.index({ preferences: 1, status: 1 });

// Ricerca testuale
subscriberSchema.index({ email: 'text', name: 'text', tags: 'text', notes: 'text' });

/* =========================
   Normalizzazione & Hooks
========================= */
// Normalizza PRIMA della validazione (fondamentale per unique+collation)
subscriberSchema.pre('validate', function (next) {
  if (this.email) this.email = String(this.email).trim().toLowerCase();
  if (this.name) this.name = String(this.name).trim();
  next();
});

// Pre-save: calcolo tassi e score, pulizia tag/segmenti, gestione status
subscriberSchema.pre('save', function (next) {
  // openRate
  if (this.isModified('emailOpened') || this.isModified('emailSent')) {
    const val = this.emailSent > 0 ? (this.emailOpened / this.emailSent) * 100 : 0;
    this.openRate = Math.max(0, Math.min(100, Math.round(val * 100) / 100));
  }
  // clickRate
  if (this.isModified('emailClicked') || this.isModified('emailSent')) {
    const val = this.emailSent > 0 ? (this.emailClicked / this.emailSent) * 100 : 0;
    this.clickRate = Math.max(0, Math.min(100, Math.round(val * 100) / 100));
  }

  // engagementScore (trigger minimo)
  if (this.isModified('emailOpened') || this.isModified('emailClicked') || this.isModified('lastEngagementAt')) {
    this.calculateEngagementScore();
  }

  // set unsubscribedAt se status cambia a UNSUBSCRIBED
  if (this.isModified('status') && this.status === STATUS.UNSUBSCRIBED && !this.unsubscribedAt) {
    this.unsubscribedAt = new Date();
  }
  // regole bounce/complaint
  if (this.bounceCount >= 3) this.status = STATUS.BOUNCED;
  if (this.complaintCount >= 1) this.status = STATUS.COMPLAINED;

  // pulizia tags
  if (Array.isArray(this.tags)) {
    this.tags = this.tags
      .map(t => String(t).trim().toLowerCase())
      .filter(t => t.length > 0 && t.length <= 30)
      .filter((t, i, arr) => arr.indexOf(t) === i);
  }
  // pulizia segments
  if (Array.isArray(this.segments)) {
    this.segments = this.segments
      .map(s => String(s).trim().toLowerCase())
      .filter(s => s.length > 0 && s.length <= 50)
      .filter((s, i, arr) => arr.indexOf(s) === i);
  }

  next();
});

/* =========================
   Virtuals
========================= */
subscriberSchema.virtual('subscriptionAgeInDays').get(function () {
  const startDate = this.subscribedAt || this.createdAt;
  return Math.floor((Date.now() - startDate) / (1000 * 60 * 60 * 24));
});

subscriberSchema.virtual('isRecent').get(function () {
  const subscriptionDate = this.subscribedAt || this.createdAt;
  return Date.now() - subscriptionDate < 7 * 24 * 60 * 60 * 1000; // 7 jours
});

subscriberSchema.virtual('engagementStatus').get(function () {
  if (this.engagementScore >= 80) return 'high';
  if (this.engagementScore >= 50) return 'medium';
  if (this.engagementScore >= 20) return 'low';
  return 'inactive';
});

subscriberSchema.virtual('daysSinceLastEngagement').get(function () {
  if (!this.lastEngagementAt) return null;
  return Math.floor((Date.now() - this.lastEngagementAt) / (1000 * 60 * 60 * 24));
});

subscriberSchema.virtual('calculatedOpenRate').get(function () {
  if (this.emailSent === 0) return 0;
  return ((this.emailOpened / this.emailSent) * 100).toFixed(2);
});

subscriberSchema.virtual('calculatedClickRate').get(function () {
  if (this.emailSent === 0) return 0;
  return ((this.emailClicked / this.emailSent) * 100).toFixed(2);
});

/* =========================
   Metodi di istanza
========================= */
subscriberSchema.methods.calculateEngagementScore = function () {
  let score = 0;

  // open/click
  if (this.openRate > 0) score += Math.min(this.openRate * 0.5, 30); // max 30
  if (this.clickRate > 0) score += Math.min(this.clickRate * 0.8, 40); // max 40

  // ultimo engagement
  if (this.lastEngagementAt) {
    const days = (Date.now() - this.lastEngagementAt) / (1000 * 60 * 60 * 24);
    if (days <= 7) score += 20;
    else if (days <= 30) score += 10;
  }

  // anzianità
  const age = this.subscriptionAgeInDays;
  if (age >= 365) score += 10;
  else if (age >= 180) score += 5;

  this.engagementScore = Math.max(0, Math.min(100, score));
  return this.engagementScore;
};

subscriberSchema.methods.unsubscribe = function (reason = null) {
  this.status = STATUS.UNSUBSCRIBED;
  this.unsubscribedAt = new Date();
  if (reason) {
    this.notes = this.notes ? `${this.notes}\nDésinscription: ${reason}` : `Désinscription: ${reason}`;
  }
  return this.save();
};

subscriberSchema.methods.resubscribe = function () {
  this.status = STATUS.ACTIVE;
  this.unsubscribedAt = null;
  this.bounceCount = 0;
  this.complaintCount = 0;
  return this.save();
};

subscriberSchema.methods.recordEmailSent = function () {
  this.emailSent += 1;
  this.lastEmailSentAt = new Date();
  return this.save();
};

subscriberSchema.methods.recordEmailOpened = function () {
  this.emailOpened += 1;
  this.lastEngagementAt = new Date();
  return this.save();
};

subscriberSchema.methods.recordEmailClicked = function () {
  this.emailClicked += 1;
  this.lastEngagementAt = new Date();
  return this.save();
};

subscriberSchema.methods.recordBounce = function () {
  this.bounceCount += 1;
  this.lastBounceAt = new Date();
  return this.save();
};

subscriberSchema.methods.recordComplaint = function () {
  this.complaintCount += 1;
  this.lastComplaintAt = new Date();
  return this.save();
};

subscriberSchema.methods.addTag = function (tag) {
  const t = String(tag).trim().toLowerCase();
  if (t && !this.tags.includes(t)) this.tags.push(t);
  return this.save();
};

subscriberSchema.methods.removeTag = function (tag) {
  const t = String(tag).trim().toLowerCase();
  this.tags = this.tags.filter(x => x !== t);
  return this.save();
};

subscriberSchema.methods.addToSegment = function (segment) {
  const s = String(segment).trim().toLowerCase();
  if (s && !this.segments.includes(s)) this.segments.push(s);
  return this.save();
};

subscriberSchema.methods.removeFromSegment = function (segment) {
  const s = String(segment).trim().toLowerCase();
  this.segments = this.segments.filter(x => x !== s);
  return this.save();
};

subscriberSchema.methods.updatePreferences = function (newPreferences) {
  if (Array.isArray(newPreferences)) {
    this.preferences = newPreferences.filter(pref => Object.values(PREFERENCES).includes(pref));
  }
  return this.save();
};

// Helper safe-increment (utile in processi concorrenti)
subscriberSchema.methods.incCounters = async function ({ sent = 0, opened = 0, clicked = 0 } = {}) {
  const inc = {};
  if (sent) inc.emailSent = sent;
  if (opened) inc.emailOpened = opened;
  if (clicked) inc.emailClicked = clicked;
  if (!Object.keys(inc).length) return this;

  const updated = await this.constructor.findByIdAndUpdate(
    this._id,
    { $inc: inc, $set: { lastEngagementAt: (opened || clicked) ? new Date() : this.lastEngagementAt } },
    { new: true }
  );
  return updated;
};

/* =========================
   Metodi statici
========================= */
subscriberSchema.statics.findActive = function () {
  return this.find({ status: STATUS.ACTIVE }).sort({ subscribedAt: -1 });
};
subscriberSchema.statics.findBySource = function (source) {
  return this.find({ status: STATUS.ACTIVE, source }).sort({ subscribedAt: -1 });
};
subscriberSchema.statics.findByPreference = function (preference) {
  return this.find({ status: STATUS.ACTIVE, preferences: preference }).sort({ subscribedAt: -1 });
};
subscriberSchema.statics.findBySegment = function (segment) {
  return this.find({ status: STATUS.ACTIVE, segments: segment }).sort({ subscribedAt: -1 });
};
subscriberSchema.statics.findHighEngagement = function (minScore = 70) {
  return this.find({ status: STATUS.ACTIVE, engagementScore: { $gte: minScore } }).sort({ engagementScore: -1 });
};
subscriberSchema.statics.findInactive = function (maxEngagementDays = 90) {
  const cutoff = new Date(Date.now() - maxEngagementDays * 24 * 60 * 60 * 1000);
  return this.find({
    status: STATUS.ACTIVE,
    $or: [{ lastEngagementAt: { $lt: cutoff } }, { lastEngagementAt: null }]
  });
};
subscriberSchema.statics.search = function (query) {
  return this.find(
    { $text: { $search: query }, status: STATUS.ACTIVE },
    { score: { $meta: 'textScore' } }
  ).sort({ score: { $meta: 'textScore' }, subscribedAt: -1 });
};
subscriberSchema.statics.getStats = function () {
  return this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$status', STATUS.ACTIVE] }, 1, 0] } },
        unsubscribed: { $sum: { $cond: [{ $eq: ['$status', STATUS.UNSUBSCRIBED] }, 1, 0] } },
        bySource: { $push: { source: '$source', count: 1 } },
        byStatus: { $push: { status: '$status', count: 1 } },
        totalEmailsSent: { $sum: '$emailSent' },
        totalEmailsOpened: { $sum: '$emailOpened' },
        totalEmailsClicked: { $sum: '$emailClicked' },
        avgEngagementScore: { $avg: '$engagementScore' }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        active: 1,
        unsubscribed: 1,
        totalEmailsSent: 1,
        totalEmailsOpened: 1,
        totalEmailsClicked: 1,
        avgEngagementScore: { $round: ['$avgEngagementScore', 2] },
        overallOpenRate: {
          $cond: [{ $eq: ['$totalEmailsSent', 0] }, 0, { $multiply: [{ $divide: ['$totalEmailsOpened', '$totalEmailsSent'] }, 100] }]
        },
        overallClickRate: {
          $cond: [{ $eq: ['$totalEmailsSent', 0] }, 0, { $multiply: [{ $divide: ['$totalEmailsClicked', '$totalEmailsSent'] }, 100] }]
        },
        sourceCount: {
          $arrayToObject: {
            $map: {
              input: Object.values(SOURCE),
              as: 'src',
              in: {
                k: '$$src',
                v: {
                  $size: {
                    $filter: { input: '$bySource', as: 'bs', cond: { $eq: ['$$bs.source', '$$src'] } }
                  }
                }
              }
            }
          }
        },
        statusCount: {
          $arrayToObject: {
            $map: {
              input: Object.values(STATUS),
              as: 'stat',
              in: {
                k: '$$stat',
                v: {
                  $size: {
                    $filter: { input: '$byStatus', as: 'bs', cond: { $eq: ['$$bs.status', '$$stat'] } }
                  }
                }
              }
            }
          }
        }
      }
    }
  ]);
};

/* =========================
   Plugin opzionale
========================= */
// subscriberSchema.plugin(mongooseLeanVirtuals);

/* =========================
   Export
========================= */
export {
  STATUS as SUBSCRIBER_STATUS,
  SOURCE as SUBSCRIBER_SOURCE,
  PREFERENCES as SUBSCRIBER_PREFERENCES,
  VALIDATION as SUBSCRIBER_VALIDATION
};

export default mongoose.model('Subscriber', subscriberSchema);