// backend/nodemailer.config.js
import nodemailer from 'nodemailer';
import fs from 'node:fs/promises';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ==============================
   CONFIGURAZIONE E DEFAULTS
============================== */
const PORT = Number(process.env.SMTP_PORT || 587);
// secure=true solo su 465 (TLS implicito) oppure se forzato via env
const SECURE = (process.env.SMTP_SECURE === 'true') || PORT === 465;

const EMAIL_CONFIG = {
  SMTP: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: PORT,
    secure: SECURE,
    auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  },
  DEFAULTS: {
    from:
      process.env.EMAIL_FROM ||
      (process.env.SMTP_USER ? `"Portfolio" <${process.env.SMTP_USER}>` : undefined),
    replyTo: process.env.SMTP_USER || undefined,
    contactReceiver:
      process.env.CONTACT_RECEIVER ||
      process.env.TO_EMAIL ||
      process.env.SMTP_USER || undefined,
  },
  ENV: process.env.NODE_ENV || 'development',
  OUTDIR: process.env.EMAIL_OUTPUT_DIR || path.join(__dirname, '_emails'),
};

/* ==============================
   LOGGER
============================== */
const log = {
  info: (m, d) => console.log(`[EMAIL] ℹ️ ${m}`, d || ''),
  ok:   (m, d) => console.log(`[EMAIL] ✅ ${m}`, d || ''),
  warn: (m, d) => console.warn(`[EMAIL] ⚠️ ${m}`, d || ''),
  err:  (m, d) => console.error(`[EMAIL] ❌ ${m}`, d || ''),
};

/* ==============================
   UTILS
============================== */
function isSmtpConfigured() {
  const ok = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!ok) {
    log.warn('Config SMTP mancante', {
      userMissing: !process.env.SMTP_USER,
      passMissing: !process.env.SMTP_PASS,
    });
  }
  return ok;
}

function sanitizeFileName(str = '') {
  return String(str)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/* ==============================
   CREAZIONE TRANSPORTER
============================== */
let transporter = null;

if (isSmtpConfigured()) {
  transporter = nodemailer.createTransport({
    host: EMAIL_CONFIG.SMTP.host,
    port: EMAIL_CONFIG.SMTP.port,
    secure: EMAIL_CONFIG.SMTP.secure, // 465=true, 587=false (STARTTLS)
    auth: EMAIL_CONFIG.SMTP.auth,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 15000,
    greetingTimeout: 7000,
    socketTimeout: 20000,
    family: 4, // forza IPv4
    tls: {
      minVersion: 'TLSv1.2',
      servername: EMAIL_CONFIG.SMTP.host,
      // NB: sbloccare SOLO per test su reti problematiche
      // rejectUnauthorized: false,
    },
  });

  // Verifica non bloccante in prod, bloccante in dev
  if (EMAIL_CONFIG.ENV === 'production') {
    transporter.verify()
      .then(() => log.ok('SMTP raggiungibile (prod)', {
        host: EMAIL_CONFIG.SMTP.host, port: EMAIL_CONFIG.SMTP.port, secure: EMAIL_CONFIG.SMTP.secure,
      }))
      .catch(err => log.warn('SMTP non raggiungibile ora (prod, non fatale)', { message: err?.message }));
  } else {
    transporter.verify((err) => {
      if (err) log.err('Errore verifica SMTP', { message: err.message });
      else log.ok('SMTP verificato', {
        host: EMAIL_CONFIG.SMTP.host, port: EMAIL_CONFIG.SMTP.port, secure: EMAIL_CONFIG.SMTP.secure,
      });
    });
  }
} else if (EMAIL_CONFIG.ENV === 'development') {
  // Fallback: mock in DEV (scrive file su disco)
  log.warn('Usando fallback email MOCK (dev): salvataggio file in _emails/');
  transporter = {
    async sendMail(opts) {
      await fs.mkdir(EMAIL_CONFIG.OUTDIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '');
      const base = `${ts}-${sanitizeFileName(opts.subject || 'no-subject')}`;
      const htmlPath = path.join(EMAIL_CONFIG.OUTDIR, `${base}.html`);
      const txtPath  = path.join(EMAIL_CONFIG.OUTDIR, `${base}.txt`);
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

      log.info('Email mock salvata', { htmlPath });
      return { messageId: `mock-${ts}`, files: { htmlPath, txtPath, metaPath } };
    },
  };
}

/* ==============================
   API DI INVIO
============================== */
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
  log.ok('Email inviata', { to, subject, messageId: info.messageId });
  return info;
}

/**
 * Helper dedicato per i messaggi del form Contatti.
 * Se non passi "to", usa CONTACT_RECEIVER/TO_EMAIL/SMTP_USER.
 */
export async function sendContactEmail({ subject, html, text, replyTo }) {
  const to = EMAIL_CONFIG.DEFAULTS.contactReceiver;
  if (!to) throw new Error('CONTACT_RECEIVER/TO_EMAIL/SMTP_USER non configurato');
  return sendMail({ to, subject, html, text, replyTo });
}

/* ==============================
   STATO E VERIFICA
============================== */
export function getEmailStatus() {
  return {
    configured: !!transporter,
    env: EMAIL_CONFIG.ENV,
    smtp: {
      host: EMAIL_CONFIG.SMTP.host,
      port: EMAIL_CONFIG.SMTP.port,
      secure: EMAIL_CONFIG.SMTP.secure,
      user: EMAIL_CONFIG.SMTP.auth?.user
        ? `${EMAIL_CONFIG.SMTP.auth.user.slice(0, 3)}...`
        : 'non configurato',
    },
    defaults: {
      from: EMAIL_CONFIG.DEFAULTS.from || 'non configurato',
      replyTo: EMAIL_CONFIG.DEFAULTS.replyTo || 'non configurato',
      contactReceiver: EMAIL_CONFIG.DEFAULTS.contactReceiver || 'non configurato',
    },
    outputDir: EMAIL_CONFIG.OUTDIR,
  };
}

/**
 * Esporta una verifySmtp usabile dalle routes (fix per l’errore):
 *  - ritorna { ok: boolean, message?: string }
 */
export async function verifySmtp() {
  if (!transporter) {
    return { ok: false, message: 'SMTP non configurato (transporter nullo)' };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err?.message || String(err) };
  }
}

export { transporter };
