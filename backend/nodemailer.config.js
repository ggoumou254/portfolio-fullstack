// backend/nodemailer.config.js (ESM, SOLO SMTP Gmail 587 + MOCK in dev)
import nodemailer from 'nodemailer';
import fs from 'node:fs/promises';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====================
// CONFIG
// ====================
const ENV = process.env.NODE_ENV || 'development';

const PORT = Number(process.env.SMTP_PORT || 587);        // 587 = STARTTLS
const SECURE = (process.env.SMTP_SECURE === 'true') || PORT === 465; // true solo su 465

const EMAIL_CONFIG = {
  SMTP: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: PORT,
    secure: SECURE, // false su 587 (STARTTLS), true su 465 (TLS implicito)
    auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  },
  DEFAULTS: {
    from:
      process.env.MAIL_FROM ||
      process.env.EMAIL_FROM ||
      (process.env.SMTP_USER ? `"Portfolio" <${process.env.SMTP_USER}>` : undefined),
    replyTo: process.env.MAIL_REPLY_TO || process.env.SMTP_USER || undefined,
  },
  ENV,
  OUTDIR: process.env.EMAIL_OUTPUT_DIR || path.join(__dirname, '_emails'),
};

const logger = {
  info: (m, d) => console.log(`[EMAIL] ℹ️ ${m}`, d || ''),
  success: (m, d) => console.log(`[EMAIL] ✅ ${m}`, d || ''),
  warn: (m, d) => console.warn(`[EMAIL] ⚠️ ${m}`, d || ''),
  error: (m, d) => console.error(`[EMAIL] ❌ ${m}`, d || ''),
};

function isSmtpConfigured() {
  const ok = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!ok) {
    logger.warn('Config SMTP mancante', {
      hostMissing: !process.env.SMTP_HOST,
      userMissing: !process.env.SMTP_USER,
      passMissing: !process.env.SMTP_PASS,
    });
  }
  return ok;
}

function sanitizeFileName(str = '') {
  return String(str)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// ====================
// TRANSPORTER
// ====================
let transporter = null;

if (isSmtpConfigured()) {
  transporter = nodemailer.createTransport({
    host: EMAIL_CONFIG.SMTP.host,
    port: EMAIL_CONFIG.SMTP.port,
    secure: EMAIL_CONFIG.SMTP.secure, // false su 587
    auth: EMAIL_CONFIG.SMTP.auth,
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    connectionTimeout: 15000,
    greetingTimeout: 7000,
    socketTimeout: 20000,
    // niente `family: 4` (evita warning DNS su alcuni hosting)
    tls: {
      minVersion: 'TLSv1.2',
      servername: EMAIL_CONFIG.SMTP.host,
      // Per debug reti intermedie (NON in prod):
      // rejectUnauthorized: false,
    },
  });
} else if (EMAIL_CONFIG.ENV === 'development') {
  // Mock in DEV: salva su disco (come avevi già)
  logger.warn('Usando fallback email MOCK (dev): salvataggio file in _emails/');
  transporter = {
    async verify() { return true; },
    async sendMail(opts) {
      await fs.mkdir(EMAIL_CONFIG.OUTDIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '');
      const base = `${ts}-${sanitizeFileName(opts.subject || 'no-subject')}`;
      const htmlPath = path.join(EMAIL_CONFIG.OUTDIR, `${base}.html`);
      const txtPath = path.join(EMAIL_CONFIG.OUTDIR, `${base}.txt`);
      const metaPath = path.join(EMAIL_CONFIG.OUTDIR, `${base}.json`);
      const html = `
        <h3>📩 MOCK EMAIL (DEV)</h3>
        <p><strong>To:</strong> ${opts.to}</p>
        <p><strong>Subject:</strong> ${opts.subject}</p>
        <hr />${opts.html || `<pre>${opts.text || ''}</pre>`}
      `;
      await fs.writeFile(htmlPath, html, 'utf8');
      if (opts.text) await fs.writeFile(txtPath, opts.text, 'utf8');
      await fs.writeFile(metaPath, JSON.stringify(
        { to: opts.to, subject: opts.subject, createdAt: new Date().toISOString() },
        null, 2
      ), 'utf8');
      logger.info('Email mock salvata', { htmlPath });
      return { messageId: `mock-${ts}`, files: { htmlPath, txtPath, metaPath } };
    },
  };
}

// Verifica non-bloccante (solo logging)
export async function verifySmtp() {
  if (!transporter || !transporter.verify) {
    return { ok: false, error: 'SMTP non configurato o in MOCK' };
  }
  try {
    await transporter.verify(); // su 587 avvia STARTTLS se richiesto
    logger.success('SMTP verificato', {
      host: EMAIL_CONFIG.SMTP.host,
      port: EMAIL_CONFIG.SMTP.port,
      secure: EMAIL_CONFIG.SMTP.secure,
    });
    return { ok: true };
  } catch (err) {
    logger.warn('SMTP non raggiungibile', { message: err?.message });
    return { ok: false, error: err?.message || 'verify failed' };
  }
}

// ====================
// INVIO
// ====================
export async function sendMail({ to, subject, html, text }) {
  if (!transporter) throw new Error('SMTP non configurato (o no MOCK in prod).');
  if (!to) throw new Error('Campo "to" mancante');
  if (!subject) throw new Error('Campo "subject" mancante');
  if (!html && !text) throw new Error('Serve "html" o "text"');

  const opts = {
    from: EMAIL_CONFIG.DEFAULTS.from,
    replyTo: EMAIL_CONFIG.DEFAULTS.replyTo,
    to,
    subject,
    html,
    text,
    headers: { 'X-App': 'Portfolio' },
  };

  const info = await transporter.sendMail(opts);
  logger.success('Email inviata', { to, subject, messageId: info.messageId });
  return info;
}

// ====================
// STATO
// ====================
export function getEmailStatus() {
  return {
    configured: !!(transporter && EMAIL_CONFIG.SMTP.auth),
    env: EMAIL_CONFIG.ENV,
    smtp: {
      host: EMAIL_CONFIG.SMTP.host,
      port: EMAIL_CONFIG.SMTP.port,
      secure: EMAIL_CONFIG.SMTP.secure,
      user: EMAIL_CONFIG.SMTP.auth?.user ? `${EMAIL_CONFIG.SMTP.auth.user.slice(0, 3)}...` : 'non configurato',
    },
    defaults: {
      from: EMAIL_CONFIG.DEFAULTS.from || '—',
      replyTo: EMAIL_CONFIG.DEFAULTS.replyTo || '—',
    },
    outputDir: EMAIL_CONFIG.OUTDIR,
  };
}

export { transporter };
