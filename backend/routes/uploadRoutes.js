// backend/routes/uploadRoutes.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import sharp from 'sharp';
import { verifyToken, requireAdmin, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

/* =========================
   Config
========================= */
const UPLOAD_CONFIG = {
  ALLOWED_MIME: {
    IMAGES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
    DOCS: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ],
    ARCHIVES: ['application/zip', 'application/x-rar-compressed']
  },
  MAX_BYTES: {
    IMAGE: 10 * 1024 * 1024,    // 10 MB
    DOC:   20 * 1024 * 1024,    // 20 MB
    ARCH:  50 * 1024 * 1024,    // 50 MB
    DEFAULT: 10 * 1024 * 1024
  },
  DIR: {
    ROOT: 'uploads',
    IMAGES: 'uploads/images',
    DOCUMENTS: 'uploads/documents',
    ARCHIVES: 'uploads/archives',
    TEMP: 'uploads/temp'
  },
  IMG: {
    MAX_WIDTH: 1920,
    QUALITY: 80
  }
};

const allAllowedTypes = [
  ...UPLOAD_CONFIG.ALLOWED_MIME.IMAGES,
  ...UPLOAD_CONFIG.ALLOWED_MIME.DOCS,
  ...UPLOAD_CONFIG.ALLOWED_MIME.ARCHIVES
];

/* =========================
   Helpers filesystem / URL
========================= */
const ensureUploadDirs = async () => {
  try {
    for (const dir of Object.values(UPLOAD_CONFIG.DIR)) {
      await fs.mkdir(dir, { recursive: true });
    }
    // crea un .gitkeep se vuoi
    for (const d of [UPLOAD_CONFIG.DIR.IMAGES, UPLOAD_CONFIG.DIR.DOCUMENTS, UPLOAD_CONFIG.DIR.ARCHIVES]) {
      const keep = path.join(d, '.keep');
      if (!fsSync.existsSync(keep)) fsSync.writeFileSync(keep, '');
    }
    console.log('✅ Upload directories ready');
  } catch (error) {
    console.error('❌ Error creating upload directories:', error);
  }
};
ensureUploadDirs();

const publicUrlFor = (destAbsoluteOrRelative, filename) => {
  // dest: es. "uploads/images" -> url: "/uploads/images/<file>"
  const rel = destAbsoluteOrRelative.replace(/\\/g, '/'); // win compat
  const base = rel.startsWith('/') ? rel : '/' + rel;
  return `${base}/${filename}`.replace(/\/+/g, '/');
};

// piccola sanitizzazione nome file
const safeBaseName = (name) =>
  String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 80)
    .toLowerCase();

const guessBucketForMime = (mime) => {
  if (UPLOAD_CONFIG.ALLOWED_MIME.IMAGES.includes(mime)) return UPLOAD_CONFIG.DIR.IMAGES;
  if (UPLOAD_CONFIG.ALLOWED_MIME.DOCS.includes(mime)) return UPLOAD_CONFIG.DIR.DOCUMENTS;
  if (UPLOAD_CONFIG.ALLOWED_MIME.ARCHIVES.includes(mime)) return UPLOAD_CONFIG.DIR.ARCHIVES;
  return UPLOAD_CONFIG.DIR.TEMP;
};

const sizeLimitForMime = (mime) => {
  if (UPLOAD_CONFIG.ALLOWED_MIME.IMAGES.includes(mime)) return UPLOAD_CONFIG.MAX_BYTES.IMAGE;
  if (UPLOAD_CONFIG.ALLOWED_MIME.DOCS.includes(mime)) return UPLOAD_CONFIG.MAX_BYTES.DOC;
  if (UPLOAD_CONFIG.ALLOWED_MIME.ARCHIVES.includes(mime)) return UPLOAD_CONFIG.MAX_BYTES.ARCH;
  return UPLOAD_CONFIG.MAX_BYTES.DEFAULT;
};

/* =========================
   Multer storage & filter
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, guessBucketForMime(file.mimetype)),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const rnd = Math.random().toString(36).slice(2, 9);
    const ext = path.extname(file.originalname) || '';
    const base = safeBaseName(path.parse(file.originalname).name || 'file');
    cb(null, `${base}-${ts}-${rnd}${ext}`);
  }
});

const fileFilter = (_req, file, cb) => {
  if (allAllowedTypes.includes(file.mimetype)) return cb(null, true);
  const err = new Error(`Tipo file non permesso: ${file.mimetype}`);
  err.code = 'INVALID_FILE_TYPE';
  cb(err, false);
};

// wrapper che applica limiti dinamici per singolo file
function makeMulterSingle(field) {
  return (req, res, next) => {
    const upload = multer({
      storage,
      fileFilter,
      limits: { fileSize: UPLOAD_CONFIG.MAX_BYTES.DEFAULT } // limite base; verifichiamo dopo con per-mime
    }).single(field);

    upload(req, res, (err) => {
      if (err) return handleMulterErr(res, err);
      // limite “fine” per mime specifico
      if (req.file) {
        const max = sizeLimitForMime(req.file.mimetype);
        if (req.file.size > max) {
          fs.unlink(req.file.path).catch(() => {});
          return res.status(413).json({ success: false, message: 'File troppo grande per questo tipo', code: 'FILE_TOO_LARGE' });
        }
      }
      next();
    });
  };
}

function makeMulterArray(field, maxCount = 10) {
  return (req, res, next) => {
    const upload = multer({
      storage,
      fileFilter,
      limits: { fileSize: UPLOAD_CONFIG.MAX_BYTES.DEFAULT }
    }).array(field, maxCount);

    upload(req, res, async (err) => {
      if (err) return handleMulterErr(res, err);

      // verifica limiti per ciascun file
      if (req.files?.length) {
        for (const f of req.files) {
          const max = sizeLimitForMime(f.mimetype);
          if (f.size > max) {
            // cleanup tutti i caricati
            await Promise.all(req.files.map(x => fs.unlink(x.path).catch(() => {})));
            return res.status(413).json({
              success: false,
              message: `File troppo grande (${f.originalname})`,
              code: 'FILE_TOO_LARGE'
            });
          }
        }
      }
      next();
    });
  };
}

function handleMulterErr(res, err) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File troppo grande', code: 'FILE_TOO_LARGE' });
  }
  if (err?.code === 'INVALID_FILE_TYPE') {
    return res.status(415).json({ success: false, message: err.message || 'Tipo non permesso', code: 'INVALID_FILE_TYPE' });
  }
  return res.status(400).json({ success: false, message: 'Errore upload', code: 'UPLOAD_ERROR' });
}

/* =========================
   SVG basic sanitization
========================= */
const isSvg = (mime) => mime === 'image/svg+xml';
async function isSvgSafe(filePath) {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    const lower = txt.toLowerCase();
    // blocca script/handler/foreignObject
    if (lower.includes('<script') || /on\w+=/i.test(lower) || lower.includes('<foreignobject')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/* =========================
   Routes
========================= */

/**
 * POST /api/upload  (qualsiasi file permesso)
 */
router.post(
  '/',
  verifyToken,
  requireRole(['admin', 'moderator']),
  makeMulterSingle('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nessun file', code: 'NO_FILE' });
      }

      // controllo SVG
      if (isSvg(req.file.mimetype)) {
        const ok = await isSvgSafe(req.file.path);
        if (!ok) {
          await fs.unlink(req.file.path).catch(() => {});
          return res.status(415).json({ success: false, message: 'SVG non sicuro', code: 'UNSAFE_SVG' });
        }
      }

      let dimensions = null;
      if (UPLOAD_CONFIG.ALLOWED_MIME.IMAGES.includes(req.file.mimetype) && !isSvg(req.file.mimetype)) {
        try {
          const meta = await sharp(req.file.path).metadata();
          dimensions = { width: meta.width, height: meta.height };
        } catch { /* ignore */ }
      }

      const destDir = guessBucketForMime(req.file.mimetype);
      const fileInfo = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: publicUrlFor(destDir, req.file.filename),
        path: `/${destDir}/${req.file.filename}`.replace(/\/+/g, '/'),
        dimensions,
        uploadDate: new Date(),
        uploadedBy: { id: req.user.id, name: req.user.name, role: req.user.role }
      };

      console.log('✅ File uploaded:', { filename: fileInfo.filename, type: fileInfo.mimetype, size: fileInfo.size, user: req.user.id });
      return res.json({ success: true, message: 'Upload ok', data: { file: fileInfo }, code: 'FILE_UPLOADED' });
    } catch (error) {
      console.error('❌ Upload error:', error);
      if (req.file) { try { await fs.unlink(req.file.path); } catch {} }
      return res.status(500).json({ success: false, message: 'Errore upload', code: 'UPLOAD_ERROR' });
    }
  }
);

/**
 * POST /api/upload/images (immagine singola con ottimizzazione)
 * Campo: "image"
 */
router.post(
  '/images',
  verifyToken,
  requireRole(['admin', 'moderator']),
  makeMulterSingle('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nessuna immagine', code: 'NO_IMAGE' });
      }

      if (!UPLOAD_CONFIG.ALLOWED_MIME.IMAGES.includes(req.file.mimetype)) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(415).json({ success: false, message: 'Tipo immagine non supportato', code: 'INVALID_IMAGE_TYPE' });
      }

      // blocca SVG pericolosi
      if (isSvg(req.file.mimetype)) {
        const ok = await isSvgSafe(req.file.path);
        if (!ok) {
          await fs.unlink(req.file.path).catch(() => {});
          return res.status(415).json({ success: false, message: 'SVG non sicuro', code: 'UNSAFE_SVG' });
        }
      }

      let dimensions = null;

      // niente ottimizzazione per SVG/GIF
      const isGif = req.file.mimetype === 'image/gif';
      if (!isSvg(req.file.mimetype) && !isGif) {
        try {
          const img = sharp(req.file.path).withMetadata({ orientation: true });
          const meta = await img.metadata();

          dimensions = { width: meta.width, height: meta.height };

          // resize + qualità + strip metadata
          if (meta.width && meta.width > UPLOAD_CONFIG.IMG.MAX_WIDTH) {
            const tmpOut = req.file.path + '.opt';
            let pipeline = img.resize(UPLOAD_CONFIG.IMG.MAX_WIDTH);
            // preserva formato originario
            const fmt = (meta.format || '').toLowerCase();
            if (fmt === 'png') pipeline = pipeline.png({ quality: UPLOAD_CONFIG.IMG.QUALITY });
            else if (fmt === 'webp') pipeline = pipeline.webp({ quality: UPLOAD_CONFIG.IMG.QUALITY });
            else pipeline = pipeline.jpeg({ quality: UPLOAD_CONFIG.IMG.QUALITY });
            await pipeline.toFile(tmpOut);
            await fs.unlink(req.file.path);
            await fs.rename(tmpOut, req.file.path);

            const meta2 = await sharp(req.file.path).metadata();
            dimensions = { width: meta2.width, height: meta2.height };
          } else {
            // strip metadati anche se non ridimensioniamo
            const tmpOut = req.file.path + '.opt';
            const fmt = (meta.format || '').toLowerCase();
            let pipeline = img;
            if (fmt === 'png') pipeline = pipeline.png({ quality: UPLOAD_CONFIG.IMG.QUALITY });
            else if (fmt === 'webp') pipeline = pipeline.webp({ quality: UPLOAD_CONFIG.IMG.QUALITY });
            else pipeline = pipeline.jpeg({ quality: UPLOAD_CONFIG.IMG.QUALITY });
            await pipeline.toFile(tmpOut);
            await fs.unlink(req.file.path);
            await fs.rename(tmpOut, req.file.path);
          }
        } catch (e) {
          console.warn('⚠️ Image optimization failed:', e.message);
        }
      }

      const info = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: publicUrlFor(UPLOAD_CONFIG.DIR.IMAGES, req.file.filename),
        dimensions,
        uploadDate: new Date(),
        uploadedBy: req.user.id
      };

      console.log('✅ Image uploaded:', { filename: info.filename, dimensions: info.dimensions, size: info.size });
      return res.json({ success: true, message: 'Immagine caricata', data: { image: info }, code: 'IMAGE_UPLOADED' });
    } catch (error) {
      console.error('❌ Image upload error:', error);
      if (req.file) { try { await fs.unlink(req.file.path); } catch {} }
      return res.status(500).json({ success: false, message: 'Errore upload immagine', code: 'IMAGE_UPLOAD_ERROR' });
    }
  }
);

/**
 * POST /api/upload/multiple (max 10)
 * Campo: "files"
 */
router.post(
  '/multiple',
  verifyToken,
  requireAdmin,
  makeMulterArray('files', 10),
  async (req, res) => {
    try {
      if (!req.files?.length) {
        return res.status(400).json({ success: false, message: 'Nessun file', code: 'NO_FILES' });
      }

      const filesInfo = [];
      for (const file of req.files) {
        let dimensions = null;
        if (UPLOAD_CONFIG.ALLOWED_MIME.IMAGES.includes(file.mimetype) && !isSvg(file.mimetype)) {
          try {
            const meta = await sharp(file.path).metadata();
            dimensions = { width: meta.width, height: meta.height };
          } catch { /* ignore */ }
        }
        const bucket = guessBucketForMime(file.mimetype);
        filesInfo.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          url: publicUrlFor(bucket, file.filename),
          dimensions,
          uploadDate: new Date()
        });
      }

      console.log('✅ Multiple files uploaded:', { count: filesInfo.length, user: req.user.id });
      return res.json({
        success: true,
        message: `${filesInfo.length} file caricati`,
        data: { files: filesInfo, count: filesInfo.length, totalSize: filesInfo.reduce((t, f) => t + f.size, 0) },
        code: 'FILES_UPLOADED'
      });
    } catch (error) {
      console.error('❌ Multiple files upload error:', error);
      if (req.files?.length) {
        await Promise.all(req.files.map(f => fs.unlink(f.path).catch(() => {})));
      }
      return res.status(500).json({ success: false, message: 'Errore upload multiplo', code: 'FILES_UPLOAD_ERROR' });
    }
  }
);

/**
 * DELETE /api/upload/:filename
 */
router.delete('/:filename', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename || filename.includes('..') || /[\\/]/.test(filename)) {
      return res.status(400).json({ success: false, message: 'Nome file non valido', code: 'INVALID_FILENAME' });
    }

    let filePath = null;
    for (const dir of [UPLOAD_CONFIG.DIR.IMAGES, UPLOAD_CONFIG.DIR.DOCUMENTS, UPLOAD_CONFIG.DIR.ARCHIVES, UPLOAD_CONFIG.DIR.TEMP]) {
      const candidate = path.join(dir, filename);
      try {
        await fs.access(candidate);
        filePath = candidate;
        break;
      } catch { /* continue */ }
    }

    if (!filePath) {
      return res.status(404).json({ success: false, message: 'File non trovato', code: 'FILE_NOT_FOUND' });
    }

    await fs.unlink(filePath);
    console.log('🗑️ File deleted:', { filename, user: req.user.id });
    return res.json({ success: true, message: 'File eliminato', code: 'FILE_DELETED' });
  } catch (error) {
    console.error('❌ File deletion error:', error);
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ success: false, message: 'File non trovato', code: 'FILE_NOT_FOUND' });
    }
    return res.status(500).json({ success: false, message: 'Errore eliminazione', code: 'FILE_DELETION_ERROR' });
  }
});

/**
 * GET /api/upload/list?type=images|documents|archives|all&page=1&limit=20
 */
router.get('/list', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { type = 'all', page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    let directories = [];
    if (type === 'images') directories = [UPLOAD_CONFIG.DIR.IMAGES];
    else if (type === 'documents') directories = [UPLOAD_CONFIG.DIR.DOCUMENTS];
    else if (type === 'archives') directories = [UPLOAD_CONFIG.DIR.ARCHIVES];
    else directories = [UPLOAD_CONFIG.DIR.IMAGES, UPLOAD_CONFIG.DIR.DOCUMENTS, UPLOAD_CONFIG.DIR.ARCHIVES];

    const allFiles = [];

    for (const dir of directories) {
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          try {
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              allFiles.push({
                filename: file,
                url: publicUrlFor(dir, file),         // ← URL pubblico
                directory: dir,
                size: stats.size,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime
              });
            }
          } catch (e) {
            console.warn(`⚠️ Could not stat file ${filePath}:`, e.message);
          }
        }
      } catch (e) {
        console.warn(`⚠️ Could not read directory ${dir}:`, e.message);
      }
    }

    allFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);
    const total = allFiles.length;
    const paginated = allFiles.slice(skip, skip + limitNum);

    return res.json({
      success: true,
      data: { files: paginated, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum), type } },
      code: 'FILES_LIST_RETRIEVED'
    });
  } catch (error) {
    console.error('❌ Files list error:', error);
    return res.status(500).json({ success: false, message: 'Errore lista files', code: 'FILES_LIST_ERROR' });
  }
});

export default router;
