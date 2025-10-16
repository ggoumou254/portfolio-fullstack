// backend/models/Contact.js
import mongoose from 'mongoose';

// Constants
const VALIDATION = {
  NAME: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 100
  },
  EMAIL: {
    MAX_LENGTH: 255
  },
  MESSAGE: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 2000
  },
  PHONE: {
    MAX_LENGTH: 20
  }
};

const STATUS = {
  NEW: 'new',
  READ: 'read', 
  REPLIED: 'replied',
  ARCHIVED: 'archived',
  SPAM: 'spam'
};

const SOURCE = {
  WEBSITE: 'website',
  MOBILE: 'mobile',
  API: 'api',
  OTHER: 'other'
};

// Validation patterns
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const PHONE_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/;

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Le nom est obligatoire'],
      trim: true,
      minlength: [VALIDATION.NAME.MIN_LENGTH, `Le nom doit contenir au moins ${VALIDATION.NAME.MIN_LENGTH} caractères`],
      maxlength: [VALIDATION.NAME.MAX_LENGTH, `Le nom ne peut pas dépasser ${VALIDATION.NAME.MAX_LENGTH} caractères`],
      match: [/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le nom ne peut contenir que des lettres, espaces, tirets et apostrophes']
    },
    email: {
      type: String,
      required: [true, 'L\'email est obligatoire'],
      lowercase: true,
      trim: true,
      maxlength: [VALIDATION.EMAIL.MAX_LENGTH, `L'email ne peut pas dépasser ${VALIDATION.EMAIL.MAX_LENGTH} caractères`],
      match: [EMAIL_REGEX, 'Veuillez fournir une adresse email valide'],
      index: true
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [VALIDATION.PHONE.MAX_LENGTH, `Le numéro de téléphone ne peut pas dépasser ${VALIDATION.PHONE.MAX_LENGTH} caractères`],
      match: [PHONE_REGEX, 'Veuillez fournir un numéro de téléphone valide'],
      sparse: true
    },
    subject: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null
    },
    message: {
      type: String,
      required: [true, 'Le message est obligatoire'],
      trim: true,
      minlength: [VALIDATION.MESSAGE.MIN_LENGTH, `Le message doit contenir au moins ${VALIDATION.MESSAGE.MIN_LENGTH} caractères`],
      maxlength: [VALIDATION.MESSAGE.MAX_LENGTH, `Le message ne peut pas dépasser ${VALIDATION.MESSAGE.MAX_LENGTH} caractères`]
    },
    status: {
      type: String,
      enum: {
        values: Object.values(STATUS),
        message: 'Statut de contact non valide'
      },
      default: STATUS.NEW,
      index: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    },
    source: {
      type: String,
      enum: {
        values: Object.values(SOURCE),
        message: 'Source de contact non valide'
      },
      default: SOURCE.WEBSITE,
      index: true
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 45, // IPv6 support
      sparse: true
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 500,
      sparse: true
    },
    replySent: {
      type: Boolean,
      default: false
    },
    repliedAt: {
      type: Date,
      default: null
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'normal', 'high', 'urgent'],
        message: 'Priorité non valide'
      },
      default: 'normal',
      index: true
    },
    tags: [{
      type: String,
      trim: true,
      maxlength: 50,
      lowercase: true
    }],
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Index composés pour les requêtes fréquentes
contactSchema.index({ status: 1, createdAt: -1 });
contactSchema.index({ isRead: 1, createdAt: -1 });
contactSchema.index({ isArchived: 1, createdAt: -1 });
contactSchema.index({ email: 1, createdAt: -1 });
contactSchema.index({ priority: 1, createdAt: -1 });
contactSchema.index({ source: 1, createdAt: -1 });

// Index textuel pour la recherche
contactSchema.index({
  name: 'text',
  email: 'text', 
  message: 'text',
  subject: 'text',
  adminNotes: 'text'
});

// Virtual pour la durée depuis la création
contactSchema.virtual('ageInDays').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual pour indiquer si le message est récent (moins de 24h)
contactSchema.virtual('isRecent').get(function() {
  return (Date.now() - this.createdAt) < (24 * 60 * 60 * 1000);
});

// Middleware pre-save pour la cohérence des données
contactSchema.pre('save', function(next) {
  // Mettre à jour isArchived en fonction du status
  if (this.status === STATUS.ARCHIVED) {
    this.isArchived = true;
  } else if (this.isModified('status') && this.status !== STATUS.ARCHIVED) {
    this.isArchived = false;
  }

  // Mettre à jour isRead en fonction du status
  if (this.status === STATUS.READ || this.status === STATUS.REPLIED) {
    this.isRead = true;
  }

  // Nettoyer et valider les tags
  if (this.tags && Array.isArray(this.tags)) {
    this.tags = this.tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0 && tag.length <= 50)
      .filter((tag, index, array) => array.indexOf(tag) === index); // Déduplication
  }

  next();
});

// Méthodes d'instance
contactSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.status = STATUS.READ;
  return this.save();
};

contactSchema.methods.markAsReplied = function() {
  this.isRead = true;
  this.status = STATUS.REPLIED;
  this.replySent = true;
  this.repliedAt = new Date();
  return this.save();
};

contactSchema.methods.markAsSpam = function() {
  this.status = STATUS.SPAM;
  this.tags = [...new Set([...(this.tags || []), 'spam'])];
  return this.save();
};

contactSchema.methods.archive = function() {
  this.status = STATUS.ARCHIVED;
  this.isArchived = true;
  return this.save();
};

contactSchema.methods.unarchive = function() {
  this.status = STATUS.READ;
  this.isArchived = false;
  return this.save();
};

contactSchema.methods.addTag = function(tag) {
  const normalizedTag = tag.trim().toLowerCase();
  if (!this.tags) this.tags = [];
  if (!this.tags.includes(normalizedTag) && normalizedTag.length > 0) {
    this.tags.push(normalizedTag);
  }
  return this.save();
};

contactSchema.methods.removeTag = function(tag) {
  const normalizedTag = tag.trim().toLowerCase();
  if (this.tags) {
    this.tags = this.tags.filter(t => t !== normalizedTag);
  }
  return this.save();
};

// Méthodes statiques
contactSchema.statics.findByStatus = function(status) {
  return this.find({ status }).sort({ createdAt: -1 });
};

contactSchema.statics.findUnread = function() {
  return this.find({ isRead: false, status: { $ne: STATUS.ARCHIVED } }).sort({ createdAt: -1 });
};

contactSchema.statics.findRecent = function(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return this.find({ createdAt: { $gte: date } }).sort({ createdAt: -1 });
};

contactSchema.statics.findByEmail = function(email) {
  return this.find({ email: email.toLowerCase() }).sort({ createdAt: -1 });
};

contactSchema.statics.search = function(query) {
  return this.find({
    $text: { $search: query },
    status: { $ne: STATUS.ARCHIVED }
  }, {
    score: { $meta: 'textScore' }
  }).sort({
    score: { $meta: 'textScore' },
    createdAt: -1
  });
};

contactSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unread: {
          $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] }
        },
        byStatus: {
          $push: {
            status: '$status',
            count: 1
          }
        },
        bySource: {
          $push: {
            source: '$source',
            count: 1
          }
        },
        today: {
          $sum: {
            $cond: [
              { $gte: ['$createdAt', new Date(new Date().setHours(0, 0, 0, 0))] },
              1, 0
            ]
          }
        },
        thisWeek: {
          $sum: {
            $cond: [
              { $gte: ['$createdAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
              1, 0
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        unread: 1,
        today: 1,
        thisWeek: 1,
        statusCount: {
          $arrayToObject: {
            $map: {
              input: ['new', 'read', 'replied', 'archived', 'spam'],
              as: 's',
              in: {
                k: '$$s',
                v: {
                  $size: {
                    $filter: {
                      input: '$byStatus',
                      as: 'bs',
                      cond: { $eq: ['$$bs.status', '$$s'] }
                    }
                  }
                }
              }
            }
          }
        },
        sourceCount: {
          $arrayToObject: {
            $map: {
              input: ['website', 'mobile', 'api', 'other'],
              as: 'src',
              in: {
                k: '$$src',
                v: {
                  $size: {
                    $filter: {
                      input: '$bySource',
                      as: 'bs',
                      cond: { $eq: ['$$bs.source', '$$src'] }
                    }
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

// Export des constantes pour utilisation externe
export {
  STATUS as CONTACT_STATUS,
  SOURCE as CONTACT_SOURCE,
  VALIDATION as CONTACT_VALIDATION
};

export default mongoose.model('Contact', contactSchema);