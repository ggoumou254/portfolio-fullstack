import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
   Costanti di validazione
========================= */
const VALIDATION = {
  TITLE: { MIN_LENGTH: 3, MAX_LENGTH: 100 },
  DESCRIPTION: { MIN_LENGTH: 10, MAX_LENGTH: 2000 },
  CONTENT: { MAX_LENGTH: 10000 },
  TECHNOLOGIES: { MAX_ITEMS: 20, MAX_LENGTH: 50 },
  URL: { MAX_LENGTH: 500 },
  IMAGE: { MAX_LENGTH: 500 }
};

const STATUS = { DRAFT: 'draft', PUBLISHED: 'published', ARCHIVED: 'archived' };

const CATEGORIES = {
  WEB: 'web',
  MOBILE: 'mobile',
  DESKTOP: 'desktop',
  API: 'api',
  LIBRARY: 'library',
  TOOL: 'tool',
  OTHER: 'other'
};

const URL_REGEX = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* =========================
   Schema
========================= */
const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Le titre est obligatoire'],
      trim: true,
      minlength: [VALIDATION.TITLE.MIN_LENGTH, `Le titre doit contenir au moins ${VALIDATION.TITLE.MIN_LENGTH} caractères`],
      maxlength: [VALIDATION.TITLE.MAX_LENGTH, `Le titre ne peut pas dépasser ${VALIDATION.TITLE.MAX_LENGTH} caractères`],
      index: 'text'
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      match: [SLUG_REGEX, 'Le slug ne peut contenir que des lettres minuscules, chiffres et tirets'],
      index: true
    },
    description: {
      type: String,
      required: [true, 'La description est obligatoire'],
      trim: true,
      minlength: [VALIDATION.DESCRIPTION.MIN_LENGTH, `La description doit contenir au moins ${VALIDATION.DESCRIPTION.MIN_LENGTH} caractères`],
      maxlength: [VALIDATION.DESCRIPTION.MAX_LENGTH, `La description ne peut pas dépasser ${VALIDATION.DESCRIPTION.MAX_LENGTH} caractères`],
      index: 'text'
    },
    content: {
      type: String,
      trim: true,
      maxlength: [VALIDATION.CONTENT.MAX_LENGTH, `Le contenu ne peut pas dépasser ${VALIDATION.CONTENT.MAX_LENGTH} caractères`],
      default: ''
    },
    shortDescription: { type: String, trim: true, maxlength: 300, default: null },

    technologies: [{
      type: String,
      trim: true,
      maxlength: [VALIDATION.TECHNOLOGIES.MAX_LENGTH, `Une technologie ne peut pas dépasser ${VALIDATION.TECHNOLOGIES.MAX_LENGTH} caractères`]
    }],

    github: {
      type: String,
      trim: true,
      maxlength: [VALIDATION.URL.MAX_LENGTH, `L'URL GitHub ne peut pas dépasser ${VALIDATION.URL.MAX_LENGTH} caractères`],
      match: [URL_REGEX, 'Veuillez fournir une URL GitHub valide'],
      default: null
    },
    liveDemo: {
      type: String,
      trim: true,
      maxlength: [VALIDATION.URL.MAX_LENGTH, `L'URL de démo ne peut pas dépasser ${VALIDATION.URL.MAX_LENGTH} caractères`],
      match: [URL_REGEX, 'Veuillez fournir une URL de démo valide'],
      default: null
    },
    documentation: {
      type: String,
      trim: true,
      maxlength: [VALIDATION.URL.MAX_LENGTH, `L'URL de documentation ne peut pas dépasser ${VALIDATION.URL.MAX_LENGTH} caractères`],
      match: [URL_REGEX, 'Veuillez fournir une URL de documentation valide'],
      default: null
    },

    image: {
      type: String,
      trim: true,
      maxlength: [VALIDATION.IMAGE.MAX_LENGTH, `Le chemin de l'image ne peut pas dépasser ${VALIDATION.IMAGE.MAX_LENGTH} caractères`],
      default: null
    },
    images: [{
      url: { type: String, trim: true, required: true },
      alt: { type: String, trim: true, maxlength: 100, default: '' },
      caption: { type: String, trim: true, maxlength: 200, default: '' },
      order: { type: Number, default: 0, min: 0 }
    }],

    featured: { type: Boolean, default: false, index: true },

    status: {
      type: String,
      enum: { values: Object.values(STATUS), message: 'Statut de projet non valide' },
      default: STATUS.PUBLISHED,
      index: true
    },
    publishedAt: { type: Date, default: null },

    category: {
      type: String,
      enum: { values: Object.values(CATEGORIES), message: 'Catégorie de projet non valide' },
      default: CATEGORIES.WEB,
      index: true
    },
    difficulty: {
      type: String,
      enum: { values: ['beginner', 'intermediate', 'advanced', 'expert'], message: 'Niveau de difficulté non valide' },
      default: 'intermediate',
      index: true
    },

    duration: {
      weeks: { type: Number, min: 1, max: 104, default: null },
      unit: { type: String, enum: ['weeks', 'months'], default: 'weeks' }
    },

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    teamSize: { type: Number, min: 1, max: 50, default: 1 },

    client: {
      name: { type: String, trim: true, maxlength: 100, default: null },
      website: {
        type: String,
        trim: true,
        maxlength: VALIDATION.URL.MAX_LENGTH,
        match: [URL_REGEX, 'Veuillez fournir une URL de client valide'],
        default: null
      }
    },

    metrics: {
      stars: { type: Number, min: 0, default: 0 },
      forks: { type: Number, min: 0, default: 0 },
      downloads: { type: Number, min: 0, default: 0 },
      users: { type: Number, min: 0, default: 0 }
    },

    tags: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],

    seo: {
      metaTitle: { type: String, trim: true, maxlength: 60, default: null },
      metaDescription: { type: String, trim: true, maxlength: 160, default: null },
      keywords: [{ type: String, trim: true, lowercase: true, maxlength: 30 }]
    },

    views: { type: Number, default: 0, min: 0 },
    lastViewedAt: { type: Date, default: null },

    order: { type: Number, default: 0, min: 0, index: true },
    likes: { type: Number, default: 0, min: 0 },

    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        ret.id = String(ret._id || '');
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: function (_doc, ret) {
        ret.id = String(ret._id || '');
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

/* =========================
   Indici & virtuals & middleware
========================= */
projectSchema.index({ status: 1, featured: -1, createdAt: -1 });
projectSchema.index({ status: 1, publishedAt: -1 });
projectSchema.index({ category: 1, status: 1, createdAt: -1 });
projectSchema.index({ difficulty: 1, status: 1 });
projectSchema.index({ technologies: 1, status: 1 });
projectSchema.index({ featured: 1, status: 1, order: 1 });
projectSchema.index({ status: 1, startDate: -1 });
projectSchema.index({
  title: 'text',
  description: 'text',
  shortDescription: 'text',
  technologies: 'text',
  tags: 'text'
});

projectSchema.virtual('durationInWeeks').get(function () {
  if (this.duration?.weeks) return this.duration.unit === 'months' ? this.duration.weeks * 4 : this.duration.weeks;
  return null;
});

projectSchema.virtual('isActive').get(function () {
  const now = new Date();
  return (
    this.status === STATUS.PUBLISHED &&
    (!this.startDate || this.startDate <= now) &&
    (!this.endDate || this.endDate >= now)
  );
});

projectSchema.virtual('canonicalUrl').get(function () {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  return `${baseUrl}/projects/${this.slug || this._id}`;
});

projectSchema.virtual('developmentYear').get(function () {
  return this.startDate ? this.startDate.getFullYear() : this.createdAt.getFullYear();
});

projectSchema.pre('save', function (next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }
  if (this.isModified('status') && this.status === STATUS.PUBLISHED && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  if (Array.isArray(this.technologies)) {
    this.technologies = this.technologies
      .map(t => t.trim())
      .filter(t => t.length > 0 && t.length <= VALIDATION.TECHNOLOGIES.MAX_LENGTH)
      .slice(0, VALIDATION.TECHNOLOGIES.MAX_ITEMS);
  }
  if (Array.isArray(this.tags)) {
    this.tags = this.tags
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0 && t.length <= 30)
      .filter((t, i, a) => a.indexOf(t) === i);
  }
  if (this.seo?.keywords && Array.isArray(this.seo.keywords)) {
    this.seo.keywords = this.seo.keywords
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0 && k.length <= 30)
      .filter((k, i, a) => a.indexOf(k) === i);
  }
  if (!this.seo?.metaDescription && this.shortDescription) {
    this.seo = this.seo || {};
    this.seo.metaDescription = this.shortDescription.substring(0, 160);
  }
  if (!this.seo?.metaTitle && this.title) {
    this.seo = this.seo || {};
    this.seo.metaTitle = this.title.substring(0, 60);
  }
  next();
});

async function cleanupFiles(doc) {
  if (!doc) return;

  if (doc.image) {
    const p = path.join(__dirname, '../../', doc.image);
    try {
      await fs.unlink(p);
      console.log(`🗑️ Deleted project image: ${doc.image}`);
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`⚠️ Could not delete project image ${doc.image}:`, err.message);
    }
  }

  if (Array.isArray(doc.images)) {
    for (const img of doc.images) {
      if (!img?.url) continue;
      const p = path.join(__dirname, '../../', img.url);
      try {
        await fs.unlink(p);
        console.log(`🗑️ Deleted project additional image: ${img.url}`);
      } catch (err) {
        if (err.code !== 'ENOENT') console.warn(`⚠️ Could not delete project image ${img.url}:`, err.message);
      }
    }
  }
}

projectSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  await cleanupFiles(this);
  next();
});
projectSchema.post('findOneAndDelete', async function (doc) {
  await cleanupFiles(doc);
});

/* =========================
   Methods & statics
========================= */
projectSchema.methods.incrementViews = function () {
  this.views += 1;
  this.lastViewedAt = new Date();
  return this.save();
};
projectSchema.methods.publish = function () {
  this.status = STATUS.PUBLISHED;
  if (!this.publishedAt) this.publishedAt = new Date();
  return this.save();
};
projectSchema.methods.unpublish = function () {
  this.status = STATUS.DRAFT;
  return this.save();
};
projectSchema.methods.archive = function () {
  this.status = STATUS.ARCHIVED;
  return this.save();
};
projectSchema.methods.toggleFeatured = function () {
  this.featured = !this.featured;
  return this.save();
};
projectSchema.methods.addTechnology = function (technology) {
  const t = String(technology || '').trim();
  if (!t) return this;
  if (
    !this.technologies.includes(t) &&
    this.technologies.length < VALIDATION.TECHNOLOGIES.MAX_ITEMS &&
    t.length <= VALIDATION.TECHNOLOGIES.MAX_LENGTH
  ) {
    this.technologies.push(t);
  }
  return this.save();
};
projectSchema.methods.removeTechnology = function (technology) {
  const t = String(technology || '').trim();
  this.technologies = this.technologies.filter(x => x !== t);
  return this.save();
};
projectSchema.methods.addImage = function (imageData) {
  if (!this.images) this.images = [];
  const order = this.images.length > 0 ? Math.max(...this.images.map(img => img.order)) + 1 : 0;
  this.images.push({
    url: imageData.url,
    alt: imageData.alt || '',
    caption: imageData.caption || '',
    order: imageData.order ?? order
  });
  return this.save();
};

projectSchema.statics.findPublished = function () {
  return this.find({ status: STATUS.PUBLISHED }).sort({ featured: -1, order: 1, publishedAt: -1, createdAt: -1 });
};
projectSchema.statics.findFeatured = function () {
  return this.find({ status: STATUS.PUBLISHED, featured: true }).sort({ order: 1, publishedAt: -1, createdAt: -1 });
};
projectSchema.statics.findByTechnology = function (technology) {
  return this.find({
    status: STATUS.PUBLISHED,
    technologies: { $in: [new RegExp(String(technology || ''), 'i')] }
  }).sort({ featured: -1, publishedAt: -1, createdAt: -1 });
};
projectSchema.statics.findByCategory = function (category) {
  return this.find({ status: STATUS.PUBLISHED, category }).sort({ featured: -1, publishedAt: -1, createdAt: -1 });
};
projectSchema.statics.search = function (query) {
  return this.find(
    { $text: { $search: query }, status: STATUS.PUBLISHED },
    { score: { $meta: 'textScore' } }
  ).sort({ score: { $meta: 'textScore' }, featured: -1, publishedAt: -1, createdAt: -1 });
};
projectSchema.statics.getStats = function () {
  return this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        published: { $sum: { $cond: [{ $eq: ['$status', STATUS.PUBLISHED] }, 1, 0] } },
        featured: { $sum: { $cond: [{ $eq: ['$featured', true] }, 1, 0] } },
        byCategory: { $push: { category: '$category', count: 1 } },
        byStatus: { $push: { status: '$status', count: 1 } },
        totalViews: { $sum: '$views' },
        avgViews: { $avg: '$views' }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        published: 1,
        featured: 1,
        totalViews: 1,
        avgViews: { $round: ['$avgViews', 2] },
        categoryCount: {
          $arrayToObject: {
            $map: {
              input: Object.values(CATEGORIES),
              as: 'cat',
              in: {
                k: '$$cat',
                v: {
                  $size: {
                    $filter: {
                      input: '$byCategory',
                      as: 'bc',
                      cond: { $eq: ['$$bc.category', '$$cat'] }
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
              as: 'stat',
              in: {
                k: '$$stat',
                v: {
                  $size: {
                    $filter: {
                      input: '$byStatus',
                      as: 'bs',
                      cond: { $eq: ['$$bs.status', '$$stat'] }
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

export {
  STATUS as PROJECT_STATUS,
  CATEGORIES as PROJECT_CATEGORIES,
  VALIDATION as PROJECT_VALIDATION
};

const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);
export default Project;
