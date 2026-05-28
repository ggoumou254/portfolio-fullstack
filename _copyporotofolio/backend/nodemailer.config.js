// backend/nodemailer.config.js
import nodemailer from 'nodemailer';
import fs from 'node:fs/promises';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====================
// CONFIGURAZIONE EMAIL
// ====================

// secure: se non specificato, true quando porta=465 (Gmail), altrimenti false
const PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SECURE = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === 'true'
  : PORT === 465;

const EMAIL_CONFIG = {
  SMTP: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: PORT,
    secure: SECURE, // Gmail: true + 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },
  DEFAULTS: {
    from: process.env.EMAIL_FROM || `"Portfolio" <${process.env.SMTP_USER}>`,
    replyTo: process.env.SMTP_USER,
  },
  ENV: process.env.NODE_ENV || 'development',
  OUTDIR: process.env.EMAIL_OUTPUT_DIR || path.join(__dirname, '_emails'),
};

// ====================
// LOGGER STRUTTURATO
// ====================
const logger = {
  info: (msg, data) => console.log(`[EMAIL] ℹ️ ${msg}`, data || ''),
  success: (msg, data) => console.log(`[EMAIL] ✅ ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[EMAIL] ⚠️ ${msg}`, data || ''),
  error: (msg, data) => console.error(`[EMAIL] ❌ ${msg}`, data || ''),
};

// ====================
// UTILS
// ====================
function isSmtpConfigured() {
  const ok = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!ok) {
    logger.warn('Config SMTP mancante', {
      user: !process.env.SMTP_USER,
      pass: !process.env.SMTP_PASS,
    });
  }
  return ok;
}

function sanitizeFileName(str = '') {
  return str
    .toString()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// ====================
// CREAZIONE TRANSPORTER
// ====================
let transporter = null;

if (isSmtpConfigured()) {
  transporter = nodemailer.createTransport(EMAIL_CONFIG.SMTP);

  // Verifica senza warning TS6133
  transporter.verify((err) => {
    if (err) {
      logger.error('Errore verifica SMTP', { message: err.message });
    } else {
      logger.success('SMTP verificato', {
        host: EMAIL_CONFIG.SMTP.host,
        port: EMAIL_CONFIG.SMTP.port,
        secure: EMAIL_CONFIG.SMTP.secure,
      });
    }
  });
} else if (EMAIL_CONFIG.ENV === 'development') {
  // Mock email fallback in dev (scrive su file, non invia realmente)
  logger.warn('Usando fallback email MOCK (dev): salvataggio file in _emails/');
  transporter = {
    sendMail: async (opts) => {
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
        <hr />
        ${opts.html || `<pre>${opts.text || ''}</pre>`}
      `;

      await fs.writeFile(htmlPath, html, 'utf8');
      if (opts.text) await fs.writeFile(txtPath, opts.text, 'utf8');
      await fs.writeFile(
        metaPath,
        JSON.stringify(
          { to: opts.to, subject: opts.subject, createdAt: new Date().toISOString() },
          null,
          2
        ),
        'utf8'
      );

      logger.info('Email mock salvata', { htmlPath });
      return { messageId: `mock-${ts}`, files: { htmlPath, txtPath, metaPath } };
    },
  };
}

// ====================
// FUNZIONE INVIO BASE
// ====================
export async function sendMail({ to, subject, html, text }) {
  if (!transporter) throw new Error('SMTP non configurato');
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
// STATO CONFIGURAZIONE
// ====================
export function getEmailStatus() {
  return {
    configured: isSmtpConfigured(),
    env: EMAIL_CONFIG.ENV,
    smtp: {
      host: EMAIL_CONFIG.SMTP.host,
      port: EMAIL_CONFIG.SMTP.port,
      secure: EMAIL_CONFIG.SMTP.secure,
      user: EMAIL_CONFIG.SMTP.auth.user ? `${EMAIL_CONFIG.SMTP.auth.user.slice(0, 3)}...` : 'non configurato',
    },
    outputDir: EMAIL_CONFIG.OUTDIR,
  };
}

export { transporter };
