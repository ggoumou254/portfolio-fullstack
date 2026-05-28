// backend/controllers/projectController.js
import Project from '../models/Project.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

/* ============================================
   Path & costanti
============================================ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'projects'); // robusto
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// ensure uploads dir (non-blocking)
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});

/* ============================================
   Messaggi standard
============================================ */
const MESSAGES = {
  PROJECT: {
    CREATED: 'Projet créé avec succès',
    UPDATED: 'Projet mis à jour avec succès',
    DELETED: 'Projet supprimé avec succès',
    NOT_FOUND: 'Projet non trouvé',
    LIST_SUCCESS: 'Projets récupérés avec succès',
    SINGLE_SUCCESS: 'Projet récupéré avec succès'
  },
  ERROR: {
    VALIDATION: 'Titre et description sont obligatoires',
    SERVER: 'Erreur interne du serveur',
    INVALID_TECHNOLOGIES: 'Technologies doivent être un tableau ou une chaîne séparée par des virgules',
    FILE_TOO_LARGE: 'Fichier trop volumineux (max 5MB)',
    INVALID_FILE_TYPE: 'Type de fichier non autorisé'
  }
};

// Sort consentiti (whitelist)
const ALLOWED_SORTS = new Set([
  'createdAt', '-createdAt',
  'updatedAt', '-updatedAt',
  'title', '-title',
  'publishedAt', '-publishedAt'
]);

/* ============================================
   Helpers
============================================ */
const safeStr = (v, max = 2000) =>
  String(v ?? '').replace(/<[^>]*>/g, '').trim().slice(0, max);

const parseTechnologies = (technologies) => {
  if (Array.isArray(technologies)) return technologies.map(t => safeStr(t, 40)).filter(Boolean);
  if (typeof technologies === 'string') {
    const s = technologies.trim();
    if (s.startsWith('[')) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr.map(t => safeStr(t, 40)).filter(Boolean);
      } catch {/* ignore */}
    }
    return s.split(',').map(t => safeStr(t, 40)).filter(Boolean);
  }
  return [];
};

const parseBool = (v) => {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return undefined;
  return ['true','1','yes','y','on'].includes(s) ? true :
         ['false','0','no','n','off'].includes(s) ? false : undefined;
};

const validateFile = (file) => {
  if (!file) return { isValid: true };
  if (file.size > MAX_FILE_SIZE) {
    return { isValid: false, error: MESSAGES.ERROR.FILE_TOO_LARGE, code: 'FILE_TOO_LARGE' };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    return { isValid: false, error: MESSAGES.ERROR.INVALID_FILE_TYPE, code: 'INVALID_FILE_TYPE' };
  }
  return { isValid: true };
};

const toFsPath = (u) => {
  // accetta "/uploads/..." o "uploads/..."
  const rel = String(u || '').replace(/^\/+/, '');
  return path.join(process.cwd(), rel);
};

const deleteOldImage = async (imagePath) => {
  if (!imagePath) return;
  try {
    const full = toFsPath(imagePath);
    await fs.unlink(full);
    console.log(`🗑️ Old image deleted: ${imagePath}`);
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('⚠️ Could not delete old image:', err.message);
  }
};

/** Normalizza `images` dal body in array di oggetti {url,alt,caption,order} */
const parseImagesArray = (images) => {
  if (!images) return [];
  let arr = images;

  // supporta JSON in stringa
  if (typeof images === 'string') {
    const s = images.trim();
    try { arr = JSON.parse(s); }
    catch { arr = s.split(',').map(x => x.trim()).filter(Boolean); }
  }

  if (!Array.isArray(arr)) return [];

  // mappa sia string → {url} che oggetto → {url,alt,caption,order}
  const mapped = arr
    .map((it, idx) => {
      if (typeof it === 'string') {
        const url = it.trim();
        if (!url) return null;
        return { url, alt: '', caption: '', order: idx };
      }
      if (it && typeof it === 'object' && typeof it.url === 'string' && it.url.trim()) {
        return {
          url: it.url.trim(),
          alt: safeStr(it.alt || '', 100),
          caption: safeStr(it.caption || '', 200),
          order: Number.isFinite(it.order) ? it.order : idx
        };
      }
      return null;
    })
    .filter(Boolean);

  // normalizza i path "uploads/..." in "/uploads/..."
  for (const m of mapped) {
    if (!m.url.startsWith('/')) m.url = '/' + m.url;
    m.url = m.url.replace(/\/{2,}/g, '/');
  }

  // ordina per order
  mapped.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return mapped;
};

/** Output snello per il client */
const sanitizeProject = (project) => {
  const obj = project?.toObject ? project.toObject() : project || {};

  // esponi galleria `images` come array di oggetti {url,alt,caption,order}
  const images = Array.isArray(obj.images)
    ? obj.images
        .map(x => (typeof x === 'string' ? { url: x } : x))
        .filter(x => x && typeof x.url === 'string' && x.url.trim())
        .map((x, i) => ({
          url: x.url.startsWith('/') ? x.url : `/${x.url}`,
          alt: x.alt || '',
          caption: x.caption || '',
          order: Number.isFinite(x.order) ? x.order : i
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];

  // cover: se manca `image`, usa la prima di `images`
  const cover = obj.image || (images[0]?.url ?? '');

  return {
    id: String(obj._id || ''),
    title: obj.title,
    slug: obj.slug || null,
    description: obj.description || '',
    content: obj.content || '',
    technologies: Array.isArray(obj.technologies) ? obj.technologies : [],
    github: obj.github || '',
    liveDemo: obj.liveDemo || '',
    demo: obj.liveDemo || '', // alias
    image: cover ? (cover.startsWith('/') ? cover : `/${cover}`) : '',
    images, // array di oggetti coerente con lo schema
    featured: !!obj.featured,
    status: obj.status || 'published',
    likes: obj.likes ?? 0,
    publishedAt: obj.publishedAt || null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
};

const isObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(String(id || ''));

const clampLimit = (req, res, value, def = 10, max = 100) => {
  let n = parseInt(value ?? def, 10);
  if (!Number.isFinite(n) || n < 1) n = def;
  if (n > max) {
    n = max;
    try { res.setHeader('X-Limit-Clamped', 'true'); } catch {}
    console.log('⚠️  limit clamped to 100 for request', req.originalUrl);
  }
  return n;
};

/* ============================================
   LIST (pubblica, con filtri) — compat {items,total,page,limit}
============================================ */
export const listProjects = async (req, res) => {
  try {
    const {
      featured,
      status,
      page = 1,
      limit = 10,
      sort = '-createdAt',
      q,
      tech,
      tag,
      ids
    } = req.query || {};

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = clampLimit(req, res, limit, 10, 100);
    const skip = (pageNum - 1) * limitNum;
    const sortSafe = ALLOWED_SORTS.has(sort) ? sort : '-createdAt';

    const filter = {};

    // status: default only published (+ alias)
    let st = status;
    if (st === 'active') st = 'published';
    if (st === 'inactive') st = 'draft';

    if (st === 'all') {
      // no filter
    } else if (st && ['draft', 'published', 'archived'].includes(st)) {
      filter.status = st;
    } else {
      filter.status = 'published';
    }

    // featured robusto
    const f = parseBool(featured);
    if (typeof f === 'boolean') filter.featured = f;

    // fulltext semplice
    if (q && String(q).trim()) {
      const rx = new RegExp(safeStr(q, 80), 'i');
      filter.$or = [
        { title: rx },
        { description: rx },
        { technologies: rx },
        { tags: rx }
      ];
    }

    // filtri tech/tag
    if (tech) {
      const arr = Array.isArray(tech) ? tech : String(tech).split(',');
      filter.technologies = { $in: arr.map(t => safeStr(t, 40)).filter(Boolean) };
    }
    if (tag) {
      const arr = Array.isArray(tag) ? tag : String(tag).split(',');
      filter.tags = { $in: arr.map(t => safeStr(t, 30).toLowerCase()).filter(Boolean) };
    }

    // ids
    if (ids) {
      const arr = String(ids).split(',').map(s => s.trim()).filter(isObjectId);
      if (arr.length) filter._id = { $in: arr };
    }

    const [projects, total] = await Promise.all([
      Project.find(filter).sort(sortSafe).skip(skip).limit(limitNum).lean(),
      Project.countDocuments(filter),
    ]);

    const mapped = projects.map(sanitizeProject);

    console.log(`📊 listProjects: ${mapped.length}/${total} progetti – filter:`, filter);

    return res.json({
      success: true,
      message: MESSAGES.PROJECT.LIST_SUCCESS,
      data: {
        projects: mapped,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.max(1, Math.ceil(total / limitNum)),
        },
      },
      code: 'PROJECTS_RETRIEVED',
      // compat
      items: mapped,
      total,
      page: pageNum,
      limit: limitNum
    });
  } catch (error) {
    console.error('❌ listProjects error:', { message: error.message, query: req.query, stack: error.stack });
    return res.status(500).json({ success: false, message: MESSAGES.ERROR.SERVER, code: 'SERVER_ERROR' });
  }
};

/* ============================================
   GET singolo (id o slug) — compat {item}
============================================ */
export const getProject = async (req, res) => {
  try {
    const idOrSlug = req.params.idOrSlug || req.params.id;
    const filter = isObjectId(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: safeStr(idOrSlug, 140).toLowerCase() };

    const project = await Project.findOne(filter);
    if (!project) {
      return res.status(404).json({ success: false, message: MESSAGES.PROJECT.NOT_FOUND, code: 'PROJECT_NOT_FOUND' });
    }

    const isAdmin = !!req.user && (req.user.role === 'admin');
    if (project.status !== 'published' && !isAdmin) {
      return res.status(404).json({ success: false, message: MESSAGES.PROJECT.NOT_FOUND, code: 'PROJECT_NOT_FOUND' });
    }

    const item = sanitizeProject(project);
    return res.json({
      success: true,
      message: MESSAGES.PROJECT.SINGLE_SUCCESS,
      data: { project: item },
      code: 'PROJECT_RETRIEVED',
      item
    });
  } catch (error) {
    console.error('❌ getProject error:', { message: error.message, param: req.params, stack: error.stack });
    return res.status(500).json({ success: false, message: MESSAGES.ERROR.SERVER, code: 'SERVER_ERROR' });
  }
};

/* ============================================
   CREATE (admin/mod)
============================================ */
export const createProject = async (req, res) => {
  try {
    const {
      title,
      description,
      technologies,
      github,
      liveDemo,
      featured = false,
      status = 'published',
      slug,
      images // <— supporto galleria dal body
    } = req.body || {};

    console.log('📝 createProject - Dati:', { title, status, featured, user: req.user?.id });

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ success: false, message: MESSAGES.ERROR.VALIDATION, code: 'VALIDATION_ERROR' });
    }

    const fv = validateFile(req.file);
    if (!fv.isValid) {
      return res.status(400).json({ success: false, message: fv.error, code: fv.code });
    }

    // status + alias
    let finalStatus = 'published';
    if (status && ['draft', 'published', 'archived', 'active', 'inactive'].includes(status)) {
      finalStatus = (status === 'active') ? 'published' : (status === 'inactive') ? 'draft' : status;
    }

    const doc = {
      title: safeStr(title, 200),
      slug: slug ? safeStr(slug, 120).toLowerCase() : undefined,
      description: safeStr(description, 2000),
      technologies: parseTechnologies(technologies),
      github: safeStr(github, 500) || '',
      liveDemo: safeStr(liveDemo, 500) || '',
      featured: parseBool(featured) === true,
      status: finalStatus,
      author: req.user?.id || null,
      publishedAt: finalStatus === 'published' ? new Date() : null,
      images: parseImagesArray(images) // array oggetti
    };

    // Se è stato caricato un file singolo come cover
    if (req.file) doc.image = `/uploads/projects/${req.file.filename}`;
    // Se non c'è cover ma c'è galleria, usa la prima come cover
    if (!doc.image && doc.images.length) doc.image = doc.images[0].url;

    const project = await Project.create(doc);
    const item = sanitizeProject(project);

    return res.status(201).json({
      success: true,
      message: MESSAGES.PROJECT.CREATED,
      data: { project: item },
      code: 'PROJECT_CREATED',
      item
    });
  } catch (error) {
    console.error('❌ createProject error:', {
      message: error.message, body: req.body, stack: error.stack,
      errorCode: error.code, errorName: error.name
    });
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Slug déjà utilisé', code: 'DUPLICATE_SLUG' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Errore di validazione: ' + error.message, code: 'VALIDATION_ERROR' });
    }
    return res.status(500).json({ success: false, message: MESSAGES.ERROR.SERVER, code: 'SERVER_ERROR' });
  }
};

/* ============================================
   UPDATE (admin/mod)
============================================ */
export const updateProject = async (req, res) => {
  try {
    const idOrSlug = req.params.idOrSlug || req.params.id;
    const filter = isObjectId(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: safeStr(idOrSlug, 140).toLowerCase() };

    const {
      title,
      description,
      technologies,
      github,
      liveDemo,
      featured,
      status,
      slug,
      images // <— supporto galleria dal body
    } = req.body || {};

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ success: false, message: MESSAGES.ERROR.VALIDATION, code: 'VALIDATION_ERROR' });
    }

    const fv = validateFile(req.file);
    if (!fv.isValid) {
      return res.status(400).json({ success: false, message: fv.error, code: fv.code });
    }

    const existing = await Project.findOne(filter);
    if (!existing) {
      return res.status(404).json({ success: false, message: MESSAGES.PROJECT.NOT_FOUND, code: 'PROJECT_NOT_FOUND' });
    }

    const payload = {
      title: safeStr(title, 200),
      description: safeStr(description, 2000),
      technologies: parseTechnologies(technologies),
      github: safeStr(github, 500) || '',
      liveDemo: safeStr(liveDemo, 500) || '',
    };

    // featured
    const f = parseBool(featured);
    if (typeof f === 'boolean') payload.featured = f;

    // slug
    if (slug) payload.slug = safeStr(slug, 120).toLowerCase();

    // status
    if (status && ['draft', 'published', 'archived', 'active', 'inactive'].includes(status)) {
      const normalized = (status === 'active') ? 'published' : (status === 'inactive') ? 'draft' : status;
      payload.status = normalized;
      if (normalized === 'published' && !existing.publishedAt) payload.publishedAt = new Date();
    }

    // cover caricata (singolo file)
    if (req.file) {
      if (existing.image) await deleteOldImage(existing.image);
      payload.image = `/uploads/projects/${req.file.filename}`;
    }

    // galleria dal body (sostituzione intera)
    const parsedImages = parseImagesArray(images);
    if (Array.isArray(parsedImages)) {
      payload.images = parsedImages;
      // se non c'è cover esplicita, usa prima dell’array
      if (!payload.image && parsedImages.length) payload.image = parsedImages[0].url;
    }

    const updated = await Project.findOneAndUpdate(filter, payload, { new: true, runValidators: true });
    const item = sanitizeProject(updated);

    return res.json({
      success: true,
      message: MESSAGES.PROJECT.UPDATED,
      data: { project: item },
      code: 'PROJECT_UPDATED',
      item
    });
  } catch (error) {
    console.error('❌ updateProject error:', { message: error.message, params: req.params, body: req.body, stack: error.stack });
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'Slug déjà utilisé', code: 'DUPLICATE_SLUG' });
    return res.status(500).json({ success: false, message: MESSAGES.ERROR.SERVER, code: 'SERVER_ERROR' });
  }
};

/* ============================================
   DELETE (admin)
============================================ */
export const deleteProject = async (req, res) => {
  try {
    const idOrSlug = req.params.idOrSlug || req.params.id;
    const filter = isObjectId(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: safeStr(idOrSlug, 140).toLowerCase() };

    const project = await Project.findOneAndDelete(filter);
    if (!project) {
      return res.status(404).json({ success: false, message: MESSAGES.PROJECT.NOT_FOUND, code: 'PROJECT_NOT_FOUND' });
    }

    // elimina cover legacy
    if (project.image) await deleteOldImage(project.image);
    // elimina galleria
    if (Array.isArray(project.images)) {
      for (const img of project.images) {
        const url = typeof img === 'string' ? img : img?.url;
        if (url) await deleteOldImage(url);
      }
    }

    return res.json({ success: true, message: MESSAGES.PROJECT.DELETED, code: 'PROJECT_DELETED' });
  } catch (error) {
    console.error('❌ deleteProject error:', { message: error.message, params: req.params, stack: error.stack });
    return res.status(500).json({ success: false, message: MESSAGES.ERROR.SERVER, code: 'SERVER_ERROR' });
  }
};

/* ============================================
   Toggle featured (admin/mod)
============================================ */
export const toggleFeatured = async (req, res) => {
  try {
    const idOrSlug = req.params.idOrSlug || req.params.id;
    const filter = isObjectId(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: safeStr(idOrSlug, 140).toLowerCase() };

    const project = await Project.findOne(filter);
    if (!project) {
      return res.status(404).json({ success: false, message: MESSAGES.PROJECT.NOT_FOUND, code: 'PROJECT_NOT_FOUND' });
    }

    project.featured = !project.featured;
    await project.save();

    const item = sanitizeProject(project);

    return res.json({
      success: true,
      message: `Projet ${project.featured ? 'mis en avant' : 'retiré des projets en avant'}`,
      data: { project: item },
      code: 'PROJECT_FEATURED_TOGGLED',
      item
    });
  } catch (error) {
    console.error('❌ toggleFeatured error:', { message: error.message, params: req.params, stack: error.stack });
    return res.status(500).json({ success: false, message: MESSAGES.ERROR.SERVER, code: 'SERVER_ERROR' });
  }
};
