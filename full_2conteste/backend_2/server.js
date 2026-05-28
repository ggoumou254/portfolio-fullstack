import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

// Importa le routes
import usersRoutes from './routes/users.js';
import seedAdminReset from './routes/seedAdminReset.js';
import seedRoutes from './routes/seedAdmin.js';
import statsRoutes from './routes/statsRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import projects from './routes/projectsRoutes.js';
import contact from './routes/contactRoutes.js';
import newsletterRoutes from './routes/newsletterRoutes.js';
import authRoutes from './routes/authRoutes.js';

dotenv.config();

const app = express();

// Workaround per __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------
// MIDDLEWARE TRACING
// -----------------
import { v4 as uuidv4 } from 'uuid';
app.use((req, res, next) => {
  req._id = uuidv4();
  req._startAt = process.hrtime();
  console.log(`[REQ ${req._id}] -> ${new Date().toISOString()} ${req.method} ${req.url} ip=${req.ip} ua=${(req.headers['user-agent']||'').slice(0,60)} referer=${req.headers.referer||'-'}`);

  res.on('finish', () => {
    const diff = process.hrtime(req._startAt);
    const ms = Math.round(diff[0] * 1000 + diff[1] / 1e6);
    console.log(`[RES ${req._id}] <- ${req.method} ${req.url} status=${res.statusCode} time=${ms}ms`);
  });

  req.on('close', () => {
    console.log(`[CLOSE ${req._id}] connection closed before finish for ${req.method} ${req.url}`);
  });

  next();
});

// -----------------
// MIDDLEWARE
// -----------------
app.use(cors());
app.use(express.json());

// -----------------
// RATE-LIMIT /api/projects (opzionale, previene spike client)
// -----------------
const projectsLimiter = rateLimit({
  windowMs: 1000, // 1 secondo
  max: 10,        // max 10 richieste per IP in 1s
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste, riprova tra poco' }
});
app.use('/api/projects', projectsLimiter);

// -----------------
// ROTTE API
// -----------------
app.use('/api/users', usersRoutes);
app.use('/api/seed', seedAdminReset);
app.use('/api/seed', seedRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/projects', projects);
app.use('/api/contact', contact);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/stats', statsRoutes);

// -----------------
// STATIC FILES FRONTEND
// -----------------
app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));
app.use('/page', express.static(path.join(__dirname, '../frontend/page')));
app.use('/uploads', express.static('uploads'));

// Serve index.html aggiornato
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// -----------------
// DATABASE
// -----------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connesso'))
  .catch((err) => console.error('❌ Errore MongoDB:', err));

// -----------------
// AVVIO SERVER
// -----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server avviato su http://localhost:${PORT}`);
});
