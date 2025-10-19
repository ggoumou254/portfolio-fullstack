// backend/routes/projectsRoutes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { body, query, validationResult } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { fileURLToPath } from 'url';

import Project from '../models/Project.js';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  toggleFeatured
} from '../controllers/projectController.js';
import { verifyToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

/* =========================
   No-cache su tutte le /projects
========================= */
const noCache = (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
};
router.use(noCache);

/* =========================
   Log query & referer (debug)
========================= */
router.use((req, _res, next) => {
  if (req.method === 'GET') {
    console.log('>>> /api/projects', req.query, 'ref:', req.get('referer') || '-');
  }
  next();
});

/* =========================
   Upload config => usa ROOT/uploads/projects
========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

const uploadRoot = path.join(ROOT, 'uploads');
const uploadDir = path.join(uploadRoot, 'projects');

const ensureUploadDir = async () => {
  try {
    // crea /uploads e /uploads/projects se mancano
    await fs.mkdir(uploadRoot, { recursive: true });
    await fs.mkdir(uploadDir, { recursive: true });
  } catch (e) {
    console.error('❌ ensureUploadDir error:', e);
  }
};
await ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    const base = path
      .basename(file.originalname, ext)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9.-]/g, '')
      .toLowerCase();
    cb(null, `project-${unique}-${base}${ext}`);
  }
});

// accetta anche SVG opzionale
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const fileFilter = (_req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) return cb(null, true);
  const err = new Error('INVALID_FILE_TYPE');
  err.code = 'INVALID_FILE_TYPE';
  cb(err, false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

// wrapper errori multer
const uploadImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'Immagine troppo grande (max 5MB)', code: 'FILE_TOO_LARGE' });
    }
    if (err.code === 'INVALID_FILE_TYPE') {
      return res.status(415).json({ success: false, message: 'Tipo di file non consentito. Ammessi: JPEG, PNG, WebP, GIF, SVG.', code: 'INVALID_FILE_TYPE' });
    }
    return res.status(400).json({ success: false, message: 'Errore durante il caricamento del file', code: 'UPLOAD_ERROR' });
  });
};

/* =========================
   Rate limit (IPv6/proxy-safe)
========================= */
const withUAKey = (req, res) => {
  const ip = ipKeyGenerator(req, res);
  const ua = (req.get('user-agent') || '').slice(0, 160);
  return `${ip}|${ua}`;
};

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: withUAKey,
  message: {
    success: false,
    message: 'Troppe richieste, riprova tra 1 minuto.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: withUAKey,
  message: {
    success: false,
    message: 'Troppe richieste, riprova più tardi.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/* =========================
   Normalizzazione body
========================= */
const normalizeProjectBody = (req, _res, next) => {
  const b = req.body || {};

  if (typeof b.technologies === 'string') {
    const s = b.technologies.trim();
    if (s.startsWith('[')) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) b.technologies = arr;
      } catch {
        b.technologies = s.split(',').map(t => t.trim()).filter(Boolean);
      }
    } else {
      b.technologies = s.split(',').map(t => t.trim()).filter(Boolean);
    }
  }
  if (b.technologies === undefined) b.technologies = [];

  if (b.demo && !b.liveDemo) b.liveDemo = b.demo;

  if (typeof b.featured === 'string') {
    b.featured = ['true', '1', 'on', 'yes'].includes(b.featured.toLowerCase());
  }

  if (b.status === 'active') b.status = 'published';
  if (b.status === 'inactive') b.status = 'draft';
  if (!b.status || b.status === '') b.status = 'published';

  if (req.file && !b.image) {
    // salva path pubblico coerente con app.use('/uploads', express.static(...))
    b.image = `/uploads/projects/${req.file.filename}`;
  }

  req.body = b;
  next();
};

/* =========================
   Normalizzazione query + clamp limit (Express 5 safe)
========================= */
const normalizeProjectQuery = (req, res, next) => {
  const q = { ...(req.query || {}) };

  // featured -> boolean
  if (typeof q.featured === 'string') {
    q.featured = ['true', '1', 'yes', 'on'].includes(q.featured.toLowerCase());
  }

  // page -> int ≥ 1
  if (typeof q.page === 'string') {
    const p = Number.parseInt(q.page, 10);
    if (Number.isFinite(p) && p >= 1) q.page = String(p);
    else delete q.page;
  }

  // sort default
  if (!q.sort) q.sort = '-createdAt';

  // clamp limit [1..100]
  if (typeof q.limit === 'string') {
    const n = Number.parseInt(q.limit, 10);
    if (Number.isFinite(n)) {
      if (n < 1) q.limit = '1';
      if (n > 100) {
        q.limit = '100';
        res.setHeader('X-Limit-Clamped', 'true');
        console.log('⚠️  limit clamped to 100 for request', req.originalUrl);
      }
    } else {
      delete q.limit;
    }
  }

  // ❗ In Express 5 req.query è un getter: non riassegnare
  Object.assign(req.query, q);
  next();
};

/* =========================
   Validators (IT)
========================= */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({
    success: false,
    message: 'Errore di validazione',
    errors: errors.array().map(e => ({ field: e.path, msg: e.msg })),
    code: 'VALIDATION_ERROR'
  });
};

const ALLOWED_STATUS = ['draft', 'published', 'archived', 'active', 'inactive'];

const projectValidation = [
  body('title').trim().isLength({ min: 3, max: 100 }).withMessage('Il titolo deve contenere tra 3 e 100 caratteri'),
  body('description').trim().isLength({ min: 10, max: 2000 }).withMessage('La descrizione deve contenere tra 10 e 2000 caratteri'),
  body('technologies').optional().custom((value) => {
    if (Array.isArray(value)) return value.every(tech => typeof tech === 'string' && tech.trim().length > 0);
    if (typeof value === 'string') return value.split(',').every(tech => tech.trim().length > 0);
    return false;
  }).withMessage('Le tecnologie devono essere un array o una stringa separata da virgole'),
  body('github').optional().isURL().withMessage('Il link GitHub deve essere un URL valido'),
  body('liveDemo').optional().isURL().withMessage('Il link Demo deve essere un URL valido'),
  body('featured').optional().isBoolean().withMessage('Il campo "featured" deve essere booleano'),
  body('status').optional().isIn(ALLOWED_STATUS).withMessage(`Lo status deve essere uno tra: ${ALLOWED_STATUS.join(', ')}`)
];

const updateProjectValidation = [
  body('title').optional().trim().isLength({ min: 3, max: 100 }).withMessage('Il titolo deve contenere tra 3 e 100 caratteri'),
  body('description').optional().trim().isLength({ min: 10, max: 2000 }).withMessage('La descrizione deve contenere tra 10 e 2000 caratteri'),
  body('technologies').optional().custom((value) => {
    if (Array.isArray(value)) return value.every(tech => typeof tech === 'string' && tech.trim().length > 0);
    if (typeof value === 'string') return value.split(',').every(tech => tech.trim().length > 0);
    return false;
  }).withMessage('Le tecnologie devono essere un array o una stringa separata da virgole'),
  body('github').optional().isURL().withMessage('Il link GitHub deve essere un URL valido'),
  body('liveDemo').optional().isURL().withMessage('Il link Demo deve essere un URL valido'),
  body('featured').optional().isBoolean().withMessage('Il campo "featured" deve essere booleano'),
  body('status').optional().isIn(ALLOWED_STATUS).withMessage(`Lo status deve essere uno tra: ${ALLOWED_STATUS.join(', ')}`)
];

const queryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Il parametro "page" deve essere un intero positivo'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Il parametro "limit" deve essere tra 1 e 100'),
  query('featured').optional().isBoolean().withMessage('Il parametro "featured" deve essere booleano'),
  query('status').optional().isIn(['draft', 'published', 'archived', 'all']).withMessage('Lo status deve essere uno tra: draft, published, archived, all'),
  query('sort').optional().isIn(['createdAt', '-createdAt', 'title', '-title', 'updatedAt', '-updatedAt']).withMessage('Il sort non è tra i campi consentiti')
];

/* =========================
   Rotte
========================= */

// LIST pubblica (normalize PRIMA dei validator)
router.get('/', publicLimiter, normalizeProjectQuery, queryValidation, validate, listProjects);

// Featured: riusa normalize + validators + controller
router.get(
  '/featured',
  publicLimiter,
  (req, _res, next) => {
    req.query.featured = 'true';
    req.query.status = 'published';
    if (!req.query.limit) req.query.limit = '6';
    if (!req.query.sort) req.query.sort = '-createdAt';
    next();
  },
  normalizeProjectQuery,
  queryValidation,
  validate,
  listProjects
);

// Admin: pubblica tutti (utility)
router.post('/publish-all', verifyToken, requireAdmin, async (_req, res) => {
  try {
    const result = await Project.updateMany({}, { $set: { status: 'published' } });
    const publishedCount = await Project.countDocuments({ status: 'published' });
    const totalCount = await Project.countDocuments();
    res.json({
      success: true,
      message: `${result.modifiedCount} progetti pubblicati`,
      data: { modified: result.modifiedCount, totalPublished: publishedCount, totalProjects: totalCount },
      code: 'PROJECTS_PUBLISHED'
    });
  } catch (error) {
    console.error('❌ Publish all error:', error);
    res.status(500).json({ success: false, message: 'Errore durante la pubblicazione dei progetti', code: 'PUBLISH_ERROR' });
  }
});

// Admin: elenco completo
router.get('/admin/all', verifyToken, requireAdmin, async (_req, res) => {
  try {
    const projects = await Project.find({}).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: {
        projects: projects.map(p => ({
          id: p._id,
          title: p.title,
          status: p.status,
          featured: p.featured,
          technologies: p.technologies,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          github: p.github || '',
          liveDemo: p.liveDemo || '',
          image: p.image || ''
        }))
      },
      code: 'ALL_PROJECTS_RETRIEVED'
    });
  } catch (error) {
    console.error('❌ Admin all projects error:', error);
    res.status(500).json({ success: false, message: 'Errore durante il recupero dei progetti', code: 'SERVER_ERROR' });
  }
});

// Admin: creazione rapida con upload integrato
router.post('/admin', verifyToken, requireAdmin, uploadImage, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      status = 'draft',
      technologies,
      github,
      demo,
      featured
    } = req.body;

    let techs = [];
    if (Array.isArray(technologies)) techs = technologies;
    else if (typeof technologies === 'string') {
      techs = technologies.split(',').map(t => t.trim()).filter(Boolean);
    }

    let image = null;
    if (req.file) image = `/uploads/projects/${req.file.filename}`;
    if (!image && req.body.imageUrl) image = String(req.body.imageUrl);

    const project = await Project.create({
      title,
      description,
      category,
      status,
      technologies: techs,
      github,
      liveDemo: demo || undefined,
      featured: featured === '1' || featured === 'true' || featured === true,
      image
    });

    return res.json({ success: true, data: { project }, message: 'Progetto creato', code: 'PROJECT_CREATED' });
  } catch (e) {
    console.error('Create project error:', e);
    return res.status(500).json({ success: false, message: 'Errore creazione progetto', code: 'PROJECT_CREATE_ERROR' });
  }
});

// GET singolo pubblico (id o slug)
router.get('/:idOrSlug', publicLimiter, getProject);

// CREATE (admin)
router.post(
  '/',
  verifyToken,
  requireAdmin,
  adminLimiter,
  uploadImage,
  normalizeProjectBody,
  projectValidation,
  validate,
  createProject
);

// UPDATE (admin)
router.put(
  '/:idOrSlug',
  verifyToken,
  requireAdmin,
  adminLimiter,
  uploadImage,
  normalizeProjectBody,
  updateProjectValidation,
  validate,
  updateProject
);

// Toggle featured (admin)
router.patch('/:idOrSlug/featured', verifyToken, requireAdmin, adminLimiter, toggleFeatured);

// Update status (admin)
router.patch(
  '/:idOrSlug/status',
  verifyToken,
  requireAdmin,
  adminLimiter,
  [body('status').isIn(ALLOWED_STATUS).withMessage(`Lo status deve essere uno tra: ${ALLOWED_STATUS.join(', ')}`)],
  normalizeProjectBody,
  validate,
  async (req, res) => {
    try {
      const { status } = req.body;
      const project = await Project.findByIdAndUpdate(
        req.params.idOrSlug,
        { status, ...(status === 'published' ? { publishedAt: new Date() } : {}) },
        { new: true }
      );
      if (!project) return res.status(404).json({ success: false, message: 'Progetto non trovato', code: 'PROJECT_NOT_FOUND' });
      res.json({
        success: true,
        message: `Status del progetto aggiornato: ${status}`,
        data: {
          project: {
            id: project._id,
            title: project.title,
            status: project.status,
            featured: !!project.featured,
            updatedAt: project.updatedAt
          }
        },
        code: 'PROJECT_STATUS_UPDATED'
      });
    } catch (error) {
      console.error('❌ Update project status error:', error);
      res.status(500).json({ success: false, message: 'Errore durante l’aggiornamento dello status', code: 'SERVER_ERROR' });
    }
  }
);

// DELETE (admin)
router.delete('/:idOrSlug', verifyToken, requireAdmin, adminLimiter, deleteProject);

export default router;
