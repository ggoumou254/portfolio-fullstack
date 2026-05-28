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
import { createRequire } from 'module';
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

const require = createRequire(import.meta.url);

// ========= ENV & APP =========
dotenv.config();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('trust proxy', 1);

// ========= SECURITY (Helmet) =========
const API_ORIGIN = process.env.API_PUBLIC_ORIGIN || 'http://localhost:5000';

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
          "https://cdn.jsdelivr.net",
          API_ORIGIN,
          "http://127.0.0.1:5500",
          "http://localhost:3000",
          "http://localhost:5173", // Vite dev
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  })
);

// ========= CORS =========
const ALLOWED =
  (process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS.split(',')) || [
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5173', // Vite dev
  ];

app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || ALLOWED.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  })
);

// ========= PERFORMANCE & BODY =========
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Auth opzionale solo per le API
app.use('/api', optionalAuth);

// ========= LOGGING =========
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ========= RATE LIMIT =========
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Troppe richieste, riprova tra 15 min.', code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Troppi tentativi, riprova tra 15 min.', code: 'AUTH_RATE_LIMIT' },
});
const projectsLimiter = rateLimit({
  windowMs: 1000,
  max: 20,
  message: { error: 'Troppe richieste progetti, rallenta.', code: 'PROJECTS_RATE_LIMIT' },
});

// no-cache per tutte le /api (prima delle routes)
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});
app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/projects', projectsLimiter);

// ========= NORMALIZZATORE URL (spazi & slash finali) =========
app.use((req, _res, next) => {
  req.url = req.url.replace(/%20/g, ''); // rimuove spazi URL-encoded
  if (req.path.length > 1) req.url = req.url.replace(/\/+$/, ''); // rimuove / finali
  next();
});

// ========= BLOCCA .map =========
app.use((req, res, next) => {
  if (req.path.endsWith('.map')) {
    console.log(`📁 Richiesta source map bloccata: ${req.path}`);
    return res.status(404).json({
      error: 'Source map non disponibile',
      message: 'I file di source map non sono stati inclusi nel deployment',
    });
  }
  next();
});

// ========= STATIC (UPLOADS con cache adeguata) =========
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    etag: true,
    lastModified: true,
    index: false,
    setHeaders(res, filePath) {
      if (/\.(png|jpe?g|webp|gif|svg|pdf|docx?|zip)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // 7 giorni
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

// ========= STATIC FILES (Frontend: NO CACHE) =========
const staticOptions = {
  maxAge: '0',
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
  },
};
app.use('/css', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css'), staticOptions));
app.use('/js/vendor', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js'), staticOptions));
app.use('/assets/bootstrap-icons', express.static(path.join(__dirname, 'node_modules/bootstrap-icons/font'), staticOptions));

app.use('/_emails', express.static(path.join(__dirname, '_emails'), staticOptions));
app.use('/mock', express.static(path.join(__dirname, '../frontend/mock'), staticOptions));
app.use('/locales', express.static(path.join(__dirname, '../frontend/locales'), staticOptions));
app.use('/css', express.static(path.join(__dirname, '../frontend/css'), staticOptions));
app.use('/js', express.static(path.join(__dirname, '../frontend/js'), staticOptions));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets'), staticOptions));
app.use('/page', express.static(path.join(__dirname, '../frontend/page'), staticOptions));

// ========= DEV EMAIL ROUTES =========
app.get('/_dev/email-status', (_req, res) => res.json(getEmailStatus()));
app.get('/_dev/email-test', async (_req, res) => {
  try {
    const info = await sendMail({
      to: process.env.SMTP_USER,
      subject: '🚀 Test Gmail + Nodemailer',
      html: '<h1>Funziona!</h1><p>Email inviata dal backend.</p>',
      text: 'Email inviata dal backend.',
    });
    res.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ========= ROUTES API =========
// logger di debug su projects (rimuovi quando hai finito)
app.use('/api/projects', (req, _res, next) => {
  console.log('>>> /api/projects', req.query, 'ref:', req.get('referer') || '-');
  next();
});

// monta TUTTE le route PRIMA dei 404
app.use('/api/ai', aiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/upload', uploadRoutes);

// ========= ADMIN SEED (dev only) =========
if (process.env.NODE_ENV === 'development') {
  (async () => {
    try {
      const { default: seedRoutes } = await import('./routes/seedRoutes.js');
      app.use('/api/seed', seedRoutes);
      console.log('🔓 seedRoutes.js attivo (dev)');
    } catch {
      console.log('ℹ️ seedRoutes.js non trovato, skip.');
    }
  })();
}

// Silenzia richiesta devtools di Chrome in locale
app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => {
  res.status(204).end();
});

// ========= SPA fallback – SOLO richieste HTML (no cache) =========
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    return res.sendFile(path.join(__dirname, '../frontend/index.html'));
  }
  return next();
});

// ========= Handlers 404/500 SOLO DOPO tutte le route =========
app.use(notFound);
app.use(errorHandler);

// ========= DB =========
async function connectDatabase() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
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
      tags: ['owner', 'seed-auto'],
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
    console.log(`🚀 Server ${process.env.NODE_ENV || 'development'} on http://localhost:${PORT}`);
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') console.error(`❌ Port ${PORT} already in use`);
    else console.error('❌ Server error:', error);
    process.exit(1);
  });
})();

export default app;
