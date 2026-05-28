// backend/models/Review.js
import mongoose from 'mongoose';

// Constants
const VALIDATION = {
  RATING: {
    MIN: 1,
    MAX: 5
  },
  COMMENT: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 2000
  },
  RESPONSE: {
    MAX_LENGTH: 1000
  }
};

const STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const REVIEW_TYPES = {
  PROJECT: 'project',
  SERVICE: 'service',
  GENERAL: 'general'
};

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'L\'utilisateur est obligatoire'],
      index: true
    },
    rating: {
      type: Number,
      required: [true, 'La note est obligatoire'],
      min: [VALIDATION.RATING.MIN, `La note minimum est ${VALIDATION.RATING.MIN}`],
      max: [VALIDATION.RATING.MAX, `La note maximum est ${VALIDATION.RATING.MAX}`],
      validate: {
        validator: Number.isInteger,
        message: 'La note doit être un nombre entier'
      },
      index: true
    },
    comment: {
      type: String,
      required: [true, 'Le commentaire est obligatoire'],
      trim: true,
      minlength: [VALIDATION.COMMENT.MIN_LENGTH, `Le commentaire doit contenir au moins ${VALIDATION.COMMENT.MIN_LENGTH} caractères`],
      maxlength: [VALIDATION.COMMENT.MAX_LENGTH, `Le commentaire ne peut pas dépasser ${VALIDATION.COMMENT.MAX_LENGTH} caractères`]
    },
    title: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
      index: 'text'
    },
    status: {
      type: String,
      enum: {
        values: Object.values(STATUS),
        message: 'Statut d\'avis non valide'
      },
      default: STATUS.PENDING,
      index: true
    },
    reviewType: {
      type: String,
      enum: {
        values: Object.values(REVIEW_TYPES),
        message: 'Type d\'avis non valide'
      },
      default: REVIEW_TYPES.GENERAL,
      index: true
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true
    },
    featuredOrder: {
      type: Number,
      default: 0,
      min: 0,
      index: true
    },
    adminResponse: {
      text: {
        type: String,
        trim: true,
        maxlength: [VALIDATION.RESPONSE.MAX_LENGTH, `La réponse ne peut pas dépasser ${VALIDATION.RESPONSE.MAX_LENGTH} caractères`],
        default: null
      },
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      },
      respondedAt: {
        type: Date,
        default: null
      },
      isPublic: {
        type: Boolean,
        default: true
      }
    },
    helpful: {
      count: {
        type: Number,
        default: 0,
        min: 0
      },
      users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    },
    notHelpful: {
      count: {
        type: Number,
        default: 0,
        min: 0
      },
      users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    },
    reports: [{
      reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      reason: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
      },
      reportedAt: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ['pending', 'reviewed', 'dismissed'],
        default: 'pending'
      }
    }],
    edited: {
      isEdited: {
        type: Boolean,
        default: false
      },
      editHistory: [{
        previousComment: {
          type: String,
          required: true
        },
        editedAt: {
          type: Date,
          default: Date.now
        },
        editedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        reason: {
          type: String,
          trim: true,
          maxlength: 200,
          default: null
        }
      }],
      lastEditedAt: {
        type: Date,
        default: null
      }
    },
    verification: {
      isVerified: {
        type: Boolean,
        default: false
      },
      verifiedAt: {
        type: Date,
        default: null
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      },
      verificationMethod: {
        type: String,
        enum: ['email', 'purchase', 'admin', 'automated'],
        default: null
      }
    },
    metadata: {
      ipAddress: {
        type: String,
        trim: true,
        maxlength: 45,
        sparse: true
      },
      userAgent: {
        type: String,
        trim: true,
        maxlength: 500,
        sparse: true
      },
      location: {
        country: {
          type: String,
          trim: true,
          maxlength: 100,
          default: null
        },
        city: {
          type: String,
          trim: true,
          maxlength: 100,
          default: null
        }
      }
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 30
    }],
    moderationNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null
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
        
        // Masquer les champs sensibles selon le contexte
        if (!ret.showSensitive) {
          delete ret.reports;
          delete ret.metadata;
          delete ret.moderationNotes;
          delete ret.helpful?.users;
          delete ret.notHelpful?.users;
        }
        
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
reviewSchema.index({ status: 1, isFeatured: -1, featuredOrder: 1, createdAt: -1 });
reviewSchema.index({ user: 1, createdAt: -1 });
reviewSchema.index({ project: 1, status: 1, createdAt: -1 });
reviewSchema.index({ rating: 1, status: 1 });
reviewSchema.index({ reviewType: 1, status: 1, createdAt: -1 });
reviewSchema.index({ 'helpful.count': -1, status: 1 });
reviewSchema.index({ status: 1, createdAt: -1 });

// Index textuel pour la recherche
reviewSchema.index({
  title: 'text',
  comment: 'text',
  tags: 'text'
});

// Virtual pour l'âge de l'avis
reviewSchema.virtual('ageInDays').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual pour indiquer si l'avis est récent
reviewSchema.virtual('isRecent').get(function() {
  return (Date.now() - this.createdAt) < (7 * 24 * 60 * 60 * 1000); // 7 jours
});

// Virtual pour le score d'utilité
reviewSchema.virtual('helpfulnessScore').get(function() {
  const totalVotes = this.helpful.count + this.notHelpful.count;
  if (totalVotes === 0) return 0;
  return (this.helpful.count / totalVotes * 100).toFixed(1);
});

// Virtual pour le nombre total de rapports
reviewSchema.virtual('totalReports').get(function() {
  return this.reports ? this.reports.length : 0;
});

// Virtual pour les rapports en attente
reviewSchema.virtual('pendingReports').get(function() {
  return this.reports ? this.reports.filter(report => report.status === 'pending').length : 0;
});

// Middleware pre-save
reviewSchema.pre('save', function(next) {
  // Mettre à jour les compteurs basés sur les tableaux
  if (this.helpful?.users) {
    this.helpful.count = this.helpful.users.length;
  }
  
  if (this.notHelpful?.users) {
    this.notHelpful.count = this.notHelpful.users.length;
  }

  // Nettoyer les tags
  if (this.tags && Array.isArray(this.tags)) {
    this.tags = this.tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0 && tag.length <= 30)
      .filter((tag, index, array) => array.indexOf(tag) === index); // Déduplication
  }

  // Générer un titre par défaut si non fourni
  if (!this.title && this.comment) {
    this.title = this.comment.substring(0, 50).trim();
    if (this.comment.length > 50) {
      this.title += '...';
    }
  }

  next();
});

// Méthodes d'instance
reviewSchema.methods.approve = function(approvedBy = null) {
  this.status = STATUS.APPROVED;
  if (approvedBy) {
    this.verification.verifiedBy = approvedBy;
    this.verification.verifiedAt = new Date();
    this.verification.isVerified = true;
  }
  return this.save();
};

reviewSchema.methods.reject = function(reason = null) {
  this.status = STATUS.REJECTED;
  if (reason) {
    this.moderationNotes = reason;
  }
  return this.save();
};

reviewSchema.methods.toggleFeatured = function() {
  this.isFeatured = !this.isFeatured;
  if (this.isFeatured && this.featuredOrder === 0) {
    this.featuredOrder = Date.now(); // Utiliser le timestamp comme ordre par défaut
  }
  return this.save();
};

reviewSchema.methods.addHelpful = function(userId) {
  // Retirer du "not helpful" si présent
  if (this.notHelpful.users.includes(userId)) {
    this.notHelpful.users = this.notHelpful.users.filter(id => !id.equals(userId));
  }
  
  // Ajouter au "helpful" si pas déjà présent
  if (!this.helpful.users.includes(userId)) {
    this.helpful.users.push(userId);
  }
  
  return this.save();
};

reviewSchema.methods.addNotHelpful = function(userId) {
  // Retirer du "helpful" si présent
  if (this.helpful.users.includes(userId)) {
    this.helpful.users = this.helpful.users.filter(id => !id.equals(userId));
  }
  
  // Ajouter au "not helpful" si pas déjà présent
  if (!this.notHelpful.users.includes(userId)) {
    this.notHelpful.users.push(userId);
  }
  
  return this.save();
};

reviewSchema.methods.removeVote = function(userId) {
  this.helpful.users = this.helpful.users.filter(id => !id.equals(userId));
  this.notHelpful.users = this.notHelpful.users.filter(id => !id.equals(userId));
  return this.save();
};

reviewSchema.methods.addReport = function(userId, reason) {
  // Vérifier si l'utilisateur a déjà reporté
  const existingReport = this.reports.find(report => report.reportedBy.equals(userId));
  if (existingReport) {
    throw new Error('Vous avez déjà signalé cet avis');
  }

  this.reports.push({
    reportedBy: userId,
    reason: reason,
    reportedAt: new Date(),
    status: 'pending'
  });

  return this.save();
};

reviewSchema.methods.addResponse = function(text, respondedBy, isPublic = true) {
  this.adminResponse = {
    text: text.trim(),
    respondedBy: respondedBy,
    respondedAt: new Date(),
    isPublic: isPublic
  };
  return this.save();
};

reviewSchema.methods.editComment = function(newComment, editedBy, reason = null) {
  // Sauvegarder l'historique
  if (!this.edited.editHistory) {
    this.edited.editHistory = [];
  }

  this.edited.editHistory.push({
    previousComment: this.comment,
    editedAt: new Date(),
    editedBy: editedBy,
    reason: reason
  });

  // Mettre à jour le commentaire
  this.comment = newComment.trim();
  this.edited.isEdited = true;
  this.edited.lastEditedAt = new Date();

  return this.save();
};

reviewSchema.methods.getEditHistory = function() {
  return this.edited.editHistory || [];
};

// Méthodes statiques
reviewSchema.statics.findApproved = function() {
  return this.find({ status: STATUS.APPROVED })
    .populate('user', 'name email role')
    .sort({ isFeatured: -1, featuredOrder: 1, createdAt: -1 });
};

reviewSchema.statics.findFeatured = function() {
  return this.find({ 
    status: STATUS.APPROVED, 
    isFeatured: true 
  })
  .populate('user', 'name email role')
  .sort({ featuredOrder: 1, createdAt: -1 });
};

reviewSchema.statics.findByUser = function(userId) {
  return this.find({ user: userId })
    .populate('user', 'name email')
    .sort({ createdAt: -1 });
};

reviewSchema.statics.findByProject = function(projectId) {
  return this.find({ 
    project: projectId,
    status: STATUS.APPROVED 
  })
  .populate('user', 'name email role')
  .sort({ isFeatured: -1, createdAt: -1 });
};

reviewSchema.statics.findPending = function() {
  return this.find({ status: STATUS.PENDING })
    .populate('user', 'name email role')
    .sort({ createdAt: -1 });
};

reviewSchema.statics.findByRating = function(minRating, maxRating = 5) {
  return this.find({
    status: STATUS.APPROVED,
    rating: { $gte: minRating, $lte: maxRating }
  })
  .populate('user', 'name email role')
  .sort({ rating: -1, createdAt: -1 });
};

reviewSchema.statics.search = function(query) {
  return this.find({
    $text: { $search: query },
    status: STATUS.APPROVED
  }, {
    score: { $meta: 'textScore' }
  })
  .populate('user', 'name email role')
  .sort({
    score: { $meta: 'textScore' },
    isFeatured: -1,
    createdAt: -1
  });
};

reviewSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        averageRating: { $avg: '$rating' },
        ratingDistribution: {
          $push: {
            rating: '$rating',
            count: 1
          }
        },
        statusCount: {
          $push: {
            status: '$status',
            count: 1
          }
        },
        typeCount: {
          $push: {
            type: '$reviewType',
            count: 1
          }
        },
        featuredCount: {
          $sum: { $cond: [{ $eq: ['$isFeatured', true] }, 1, 0] }
        },
        totalHelpful: { $sum: '$helpful.count' },
        totalReports: { $sum: { $size: '$reports' } }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        averageRating: { $round: ['$averageRating', 2] },
        featuredCount: 1,
        totalHelpful: 1,
        totalReports: 1,
        ratingDistribution: {
          $arrayToObject: {
            $map: {
              input: [1, 2, 3, 4, 5],
              as: 'r',
              in: {
                k: { $toString: '$$r' },
                v: {
                  $size: {
                    $filter: {
                      input: '$ratingDistribution',
                      as: 'rd',
                      cond: { $eq: ['$$rd.rating', '$$r'] }
                    }
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
              as: 's',
              in: {
                k: '$$s',
                v: {
                  $size: {
                    $filter: {
                      input: '$statusCount',
                      as: 'sc',
                      cond: { $eq: ['$$sc.status', '$$s'] }
                    }
                  }
                }
              }
            }
          }
        },
        typeCount: {
          $arrayToObject: {
            $map: {
              input: Object.values(REVIEW_TYPES),
              as: 't',
              in: {
                k: '$$t',
                v: {
                  $size: {
                    $filter: {
                      input: '$typeCount',
                      as: 'tc',
                      cond: { $eq: ['$$tc.type', '$$t'] }
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

// Export des constantes
export {
  STATUS as REVIEW_STATUS,
  REVIEW_TYPES,
  VALIDATION as REVIEW_VALIDATION
};

export default mongoose.model('Review', reviewSchema);