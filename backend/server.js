// backend/server.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
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
const ROOT = process.cwd(); // root del progetto (coerente con uploadRoutes)

// In hosting dietro proxy (HTTPS/X-Forwarded-Proto)
app.set('trust proxy', 1);

// ========= SECURITY (Helmet) =========
const API_ORIGIN = process.env.BACKEND_URL || 'http://localhost:5000';
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://127.0.0.1:5500';

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],   // preview locali / canvas
        mediaSrc: ["'self'", "data:", "https:", "blob:"], // <video>/<audio> locali
        fontSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
        connectSrc: [
          "'self'",
          API_ORIGIN,
          FRONTEND_ORIGIN,
          "https://www.raphaelgoumou.com",
          "https://cdn.jsdelivr.net"
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'", FRONTEND_ORIGIN, "https://www.raphaelgoumou.com"]
      }
    },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'sameorigin' }
  })
);

// ========= CORS =========
const envAllowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const ALLOWED = [
  FRONTEND_ORIGIN,
  'https://raphaelgoumou.com',
  'https://www.raphaelgoumou.com',
  ...envAllowed
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/cron
      if (ALLOWED.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'X-Requested-With'],
    exposedHeaders: ['X-Request-Id']
  })
);

// piccolo handler per errori CORS leggibili
app.use((err, _req, res, next) => {
  if (err?.message?.startsWith('CORS blocked')) {
    return res.status(403).json({ success: false, message: err.message, code: 'CORS_FORBIDDEN' });
  }
  next(err);
});

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
// Crea ROOT/uploads se non esiste
fs.mkdirSync(path.join(ROOT, 'uploads'), { recursive: true });

const staticHeaders = (res, filePath) => {
  if (/\.(png|jpe?g|webp|gif|svg|pdf|docx?|zip|mp4|mp3|webm|ogg)$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // 7gg
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }
};

// Mount principale: ROOT/uploads
app.use(
  '/uploads',
  express.static(path.join(ROOT, 'uploads'), {
    etag: true,
    lastModified: true,
    index: false,
    setHeaders: staticHeaders
  })
);

// Fallback legacy: backend/uploads (se hai file vecchi)
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    etag: true,
    lastModified: true,
    index: false,
    setHeaders: staticHeaders
  })
);

// ⚠️ NON serviamo asset frontend da Node in produzione: il frontend è su raphaelgoumou.com

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

// ========= FALLBACK solo API =========
app.get('/', (_req, res) => {
  res.json({ name: 'Portfolio API', status: 'running' });
});

// ❗️ Handlers 404/500 (dopo tutte le route)
app.use(notFound);
app.use(errorHandler);

// ========= DB =========
async function connectDatabase() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    mongoose.connection.on('error', (err) => console.error('❌ MongoDB error:', err));
    mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error?.message || error);
    process.exit(1);
  }
}

async function ensureOwner() {
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
  await mongoose.connection.close();
  console.log('✅ Mongo closed.');
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM. Closing DB…');
  await mongoose.connection.close();
  console.log('✅ Mongo closed.');
  process.exit(0);
});

// ========= START =========
(async function startServer() {
  await connectDatabase();
  await ensureOwner();
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server ${process.env.NODE_ENV || 'development'} on ${API_ORIGIN}`);
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') console.error(`❌ Port ${PORT} already in use`);
    else console.error('❌ Server error:', error);
    process.exit(1);
  });
})();

export default app;
