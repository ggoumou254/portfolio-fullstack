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

const PORT = Number(process.env.SMTP_PORT || 587);
const SECURE = (process.env.SMTP_SECURE === 'true') || PORT === 465;

const EMAIL_CONFIG = {
  SMTP: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: PORT,
    secure: SECURE, // 587 STARTTLS, 465 TLS implicito
    auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  },
  DEFAULTS: {
    // Con Gmail è più sicuro usare "from" identico allo user; il nome è libero
    from: process.env.EMAIL_FROM
      || (process.env.SMTP_USER ? `"Raphaël Portfolio" <${process.env.SMTP_USER}>` : undefined),
    replyTo: process.env.SMTP_USER
  },
  // Dove inviare i messaggi del form contatti:
  CONTACT_TO: process.env.CONTACT_RECEIVER || process.env.TO_EMAIL || process.env.SMTP_USER,
  ENV: process.env.NODE_ENV || 'development',
  OUTDIR: process.env.EMAIL_OUTPUT_DIR || path.join(__dirname, '_emails'),
};

// ====================
// LOGGER
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
  return str.toString()
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
  transporter = nodemailer.createTransport({
    host: EMAIL_CONFIG.SMTP.host,
    port: EMAIL_CONFIG.SMTP.port,
    secure: EMAIL_CONFIG.SMTP.secure,
    auth: EMAIL_CONFIG.SMTP.auth,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 15000,
    greetingTimeout: 7000,
    socketTimeout: 20000,
    family: 4,
    tls: {
      minVersion: 'TLSv1.2',
      servername: EMAIL_CONFIG.SMTP.host,
      // rejectUnauthorized: false, // solo se reti “strane”
    }
  });

  if (EMAIL_CONFIG.ENV === 'production') {
    transporter.verify()
      .then(() => logger.success('SMTP raggiungibile (prod)', {
        host: EMAIL_CONFIG.SMTP.host, port: EMAIL_CONFIG.SMTP.port, secure: EMAIL_CONFIG.SMTP.secure
      }))
      .catch(err => logger.warn('SMTP non raggiungibile ora (prod, non fatale)', { message: err?.message }));
  } else {
    transporter.verify((err) => {
      if (err) logger.error('Errore verifica SMTP', { message: err.message });
      else logger.success('SMTP verificato', {
        host: EMAIL_CONFIG.SMTP.host, port: EMAIL_CONFIG.SMTP.port, secure: EMAIL_CONFIG.SMTP.secure
      });
    });
  }

} else if (EMAIL_CONFIG.ENV === 'development') {
  // Mock (solo dev)
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
        JSON.stringify({ to: opts.to, subject: opts.subject, createdAt: new Date().toISOString() }, null, 2),
        'utf8'
      );
      logger.info('Email mock salvata', { htmlPath });
      return { messageId: `mock-${ts}`, files: { htmlPath, txtPath, metaPath } };
    },
  };
}

// ====================
// INVIO GENERICO
// ====================
export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!transporter) throw new Error('SMTP non configurato');
  if (!to) throw new Error('Campo "to" mancante');
  if (!subject) throw new Error('Campo "subject" mancante');
  if (!html && !text) throw new Error('Serve "html" o "text"');

  const opts = {
    from: EMAIL_CONFIG.DEFAULTS.from,
    replyTo: replyTo || EMAIL_CONFIG.DEFAULTS.replyTo,
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
// UTILE PER FORM CONTATTI
// ====================
export async function sendContactEmail({ fromName, fromEmail, subject, messageHtml, messageText }) {
  const to = EMAIL_CONFIG.CONTACT_TO;
  const safeSubject = subject && subject.trim() ? subject : 'Nouveau message (Portfolio)';
  return sendMail({
    to,
    subject: safeSubject,
    html: messageHtml,
    text: messageText,
    // replyTo = email del visitatore: così rispondi con un click
    replyTo: fromEmail,
  });
}

// ====================
// STATO CONFIG
// ====================
export function getEmailStatus() {
  return {
    configured: isSmtpConfigured(),
    env: EMAIL_CONFIG.ENV,
    smtp: {
      host: EMAIL_CONFIG.SMTP.host,
      port: EMAIL_CONFIG.SMTP.port,
      secure: EMAIL_CONFIG.SMTP.secure,
      user: EMAIL_CONFIG.SMTP.auth?.user ? `${EMAIL_CONFIG.SMTP.auth.user.slice(0, 3)}...` : 'non configurato',
    },
    contact_to: EMAIL_CONFIG.CONTACT_TO ? 'configurato' : 'manca',
    outputDir: EMAIL_CONFIG.OUTDIR,
  };
}

export { transporter };
