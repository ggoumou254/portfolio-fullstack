// backend/server.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

import { optionalAuth } from './middleware/authMiddleware.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sendMail, getEmailStatus } from './nodemailer.config.js';
import User from './models/User.js';

import aiRoutes from './routes/aiRoutes.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/usersRoutes.js';
import projectRoutes from './routes/projectsRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import newsletterRoutes from './routes/newsletterRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';

// ========= ENV & APP =========
dotenv.config();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In hosting dietro proxy (HTTPS/X-Forwarded-Proto)
app.set('trust proxy', 1);

// ========= ORIGINI & URL =========
const API_ORIGIN = process.env.BACKEND_URL || '';
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || '';
const ALLOWED_FROM_ENV = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Utility: consenti origin se
// - non presente (es. curl / healthcheck)
// - è esattamente in lista
// - termina con ".up.railway.app" (domini Railway)
// - è il FRONTEND_ORIGIN o BACKEND_URL
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_FROM_ENV.includes(origin)) return true;
  if (FRONTEND_ORIGIN && origin === FRONTEND_ORIGIN) return true;
  if (API_ORIGIN && origin === API_ORIGIN) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname.endsWith('.up.railway.app')) return true;
  } catch (_) {}
  return false;
}

// ========= SECURITY (Helmet) =========
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
        connectSrc: [
          "'self'",
          ...(API_ORIGIN ? [API_ORIGIN] : []),
          ...(FRONTEND_ORIGIN ? [FRONTEND_ORIGIN] : []),
          "https://cdn.jsdelivr.net"
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'", ...(FRONTEND_ORIGIN ? [FRONTEND_ORIGIN] : [])]
      }
    },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'sameorigin' }
  })
);

// ========= CORS =========
app.use(
  cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
  })
);

// ========= PERFORMANCE & BODY =========
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ========= LOGGING =========
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
});

// ========= RATE LIMIT =========
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Troppe richieste, riprova tra 15 min.', code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Troppi tentativi, riprova tra 15 min.', code: 'AUTH_RATE_LIMIT' }
});
const projectsLimiter = rateLimit({
  windowMs: 1000,
  max: 20,
  message: { error: 'Troppe richieste progetti, rallenta.', code: 'PROJECTS_RATE_LIMIT' }
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Troppe richieste AI, riprova più tardi.', code: 'AI_RATE_LIMIT' }
});

// ========= HEALTH =========
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV, time: new Date().toISOString() });
});

// ========= ANTI-CACHE API =========
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// ========= LIMITERS =========
app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/projects', projectsLimiter);
app.use('/api/ai', aiLimiter);

// ========= NORMALIZZATORE URL =========
app.use((req, _res, next) => {
  req.url = req.url.replace(/%20/g, '');
  if (req.path.length > 1) req.url = req.url.replace(/\/+$/, '');
  next();
});

// ========= BLOCCA .map =========
app.use((req, res, next) => {
  if (req.path.endsWith('.map')) {
    return res.status(404).json({ error: 'Source map non disponibile' });
  }
  next();
});

// ========= STATIC (UPLOADS) =========
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    etag: true,
    lastModified: true,
    index: false,
    setHeaders(res, filePath) {
      if (/\.(png|jpe?g|webp|gif|svg|pdf|docx?|zip)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  })
);

// ========= FRONTEND STATIC (opzionale) =========
// Attiva questa feature mettendo FRONTEND_STATIC=true e assicurati che la cartella ../frontend esista nell’immagine.
if (process.env.FRONTEND_STATIC === 'true') {
  const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
  app.use(express.static(FRONTEND_DIR));
  app.get('/', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
} else {
  // fallback API root
  app.get('/', (_req, res) => {
    res.json({ name: 'Portfolio API', status: 'running' });
  });
}

// ========= DEV EMAIL ROUTES (solo in dev) =========
if (process.env.NODE_ENV !== 'production') {
  app.get('/_dev/email-status', (_req, res) => res.json(getEmailStatus()));
  app.get('/_dev/email-test', async (_req, res) => {
    try {
      const info = await sendMail({
        to: process.env.SMTP_USER,
        subject: '🚀 Test Gmail + Nodemailer',
        html: '<h1>Funziona!</h1><p>Email inviata dal backend.</p>',
        text: 'Email inviata dal backend.'
      });
      res.json({ ok: true, messageId: info.messageId });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

// ========= AUTH opzionale SOLO /api =========
app.use('/api', optionalAuth);

// ========= ROUTES API =========
app.use('/api/ai', aiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/upload', uploadRoutes);

// ========= FALLBACK 404/500 =========
app.use(notFound);
app.use(errorHandler);

// ========= DB =========
let mongoConnected = false;

async function connectDatabase() {
  if (!process.env.MONGO_URI) {
    console.warn('⚠️  MONGO_URI non impostata: avvio senza DB (le rotte DB falliranno finché non la imposti).');
    return;
  }
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    mongoConnected = true;
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    mongoose.connection.on('error', (err) => console.error('❌ MongoDB error:', err));
    mongoose.connection.on('disconnected', () => {
      mongoConnected = false;
      console.warn('⚠️  MongoDB disconnected');
    });
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error?.message || error);
    // Non killare il processo: permetti healthcheck & debug. Re-try manuale con un nuovo deploy.
  }
}

async function ensureOwner() {
  if (!mongoConnected) return;
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('ADMIN_EMAIL/ADMIN_PASSWORD non settati: skip ensureOwner');
    return;
  }
  let user = await User.findOne({ email });
  if (!user) {
    const hash = await bcrypt.hash(password, 12);
    user = await User.create({
      name: 'Owner',
      email,
      passwordHash: hash,
      role: 'admin',
      status: 'active',
      emailVerification: { isVerified: true, verifiedAt: new Date() },
      security: { lastPasswordChange: new Date(), passwordChangeRequired: false },
      preferences: { language: 'fr', timezone: 'Europe/Paris', theme: 'auto' },
      tags: ['owner', 'seed-auto']
    });
    console.log(`✅ Admin creato all'avvio: ${email}`);
  } else if (process.env.RESET_ADMIN_PASSWORD_ON_BOOT === 'true') {
    user.passwordHash = await bcrypt.hash(password, 12);
    user.security = { ...(user.security || {}), lastPasswordChange: new Date(), passwordChangeRequired: false };
    await user.save();
    console.log('🔐 Password admin aggiornata all\'avvio');
  }
}

// ========= GRACEFUL SHUTDOWN =========
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT. Closing DB…');
  try { await mongoose.connection.close(); } catch {}
  console.log('✅ Mongo closed.');
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM. Closing DB…');
  try { await mongoose.connection.close(); } catch {}
  console.log('✅ Mongo closed.');
  process.exit(0);
});

// ========= START =========
(async function startServer() {
  await connectDatabase();
  await ensureOwner();

  const PORT = process.env.PORT || 5000;
  const HOST = '0.0.0.0';
  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Server ${process.env.NODE_ENV || 'development'} listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') console.error(`❌ Port ${PORT} already in use`);
    else console.error('❌ Server error:', error);
    process.exit(1);
  });
})();

export default app;
