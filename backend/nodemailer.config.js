// backend/nodemailer.config.js
import nodemailer from 'nodemailer';
import fs from 'node:fs/promises';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- PARAMETRI ENV ----------
const PORT = Number(process.env.SMTP_PORT || 587);
// secure=true solo se porta 465 o se forzato via env
const SECURE = (process.env.SMTP_SECURE === 'true') || PORT === 465;

const EMAIL_CONFIG = {
  SMTP: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: PORT,
    secure: SECURE, // 465 -> true (TLS implicito), 587 -> false (STARTTLS)
    auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  },
  DEFAULTS: {
    // Preferisci EMAIL_FROM (nome+indirizzo). Se assente, fallback su SMTP_USER.
    from:
      process.env.EMAIL_FROM ||
      (process.env.SMTP_USER ? `"Portfolio" <${process.env.SMTP_USER}>` : undefined),
    replyTo: process.env.SMTP_USER || undefined,
    // A chi recapitare i messaggi “Contact”
    contactReceiver:
      process.env.CONTACT_RECEIVER ||
      process.env.TO_EMAIL || // compat vecchia
      process.env.SMTP_USER,   // fallback finale
  },
  ENV: process.env.NODE_ENV || 'development',
  OUTDIR: process.env.EMAIL_OUTPUT_DIR || path.join(__dirname, '_emails'),
};

// ---------- LOGGER ----------
const log = {
  info: (msg, data) => console.log(`[EMAIL] ℹ️ ${msg}`, data || ''),
  ok:   (msg, data) => console.log(`[EMAIL] ✅ ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[EMAIL] ⚠️ ${msg}`, data || ''),
  err:  (msg, data) => console.error(`[EMAIL] ❌ ${msg}`, data || ''),
};

// ---------- UTILS ----------
function isSmtpConfigured() {
  const ok = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!ok) {
    log.warn('Config SMTP mancante', {
      SMTP_USER: !!process.env.SMTP_USER,
      SMTP_PASS: !!process.env.SMTP_PASS,
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

// ---------- TRANSPORTER ----------
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
    family: 4, // forza IPv4
    tls: {
      minVersion: 'TLSv1.2',
      servername: EMAIL_CONFIG.SMTP.host,
      // Se necessario per reti “strane”, sblocca TEMPORANEAMENTE:
      // rejectUnauthorized: false,
    },
  });

  // Verifica non-bloccante in prod, esplicita in dev
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
} else if (EMAIL_CONFIG.ENV !== 'production') {
  // MOCK in dev: salva file su disco
  log.warn('Usando fallback email MOCK (dev): salvataggio file in _emails/');
  transporter = {
    sendMail: async (opts) => {
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
      await fs.writeFile(metaPath, JSON.stringify(
        { to: opts.to, subject: opts.subject, createdAt: new Date().toISOString() },
        null, 2
      ), 'utf8');

      log.info('Email mock salvata', { htmlPath });
      return { messageId: `mock-${ts}`, files: { htmlPath, txtPath, metaPath } };
    },
  };
}

// ---------- API PUBBLICHE ----------
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
  log.ok('Email inviata', { to, subject, messageId: info.messageId });
  return info;
}

// Helper: invio email “Contact”
export async function sendContactEmail({ name, email, subject, message }) {
  const dest = EMAIL_CONFIG.DEFAULTS.contactReceiver;
  if (!dest) throw new Error('Nessun destinatario configurato per i messaggi di contatto');

  const safeName = String(name || '').slice(0, 100);
  const safeEmail = String(email || '').slice(0, 200);
  const safeSubject = subject && subject.trim() ? subject.trim() : 'Nuovo messaggio dal Portfolio';

  const html = `
    <h2>📨 Nuovo messaggio dal Portfolio</h2>
    <p><strong>Da:</strong> ${safeName} &lt;${safeEmail}&gt;</p>
    <p><strong>Oggetto:</strong> ${safeSubject}</p>
    <hr />
    <pre style="white-space:pre-wrap;font-family:inherit">${message || ''}</pre>
  `;
  const text =
    `Nuovo messaggio dal Portfolio\n` +
    `Da: ${safeName} <${safeEmail}>\n` +
    `Oggetto: ${safeSubject}\n\n` +
    `${message || ''}`;

  return sendMail({ to: dest, subject: `📮 [Contact] ${safeSubject}`, html, text });
}

// Stato per /_dev o health
export function getEmailStatus() {
  return {
    configured: isSmtpConfigured(),
    env: EMAIL_CONFIG.ENV,
    smtp: {
      host: EMAIL_CONFIG.SMTP.host,
      port: EMAIL_CONFIG.SMTP.port,
      secure: EMAIL_CONFIG.SMTP.secure,
      user: EMAIL_CONFIG.SMTP.auth?.user ? `${EMAIL_CONFIG.SMTP.auth.user.slice(0, 3)}…` : 'non configurato',
    },
    defaults: {
      from: EMAIL_CONFIG.DEFAULTS.from || 'non configurato',
      contactReceiver: EMAIL_CONFIG.DEFAULTS.contactReceiver || 'non configurato',
    },
    outputDir: EMAIL_CONFIG.OUTDIR,
  };
}

// ✅ Funzione richiesta da contactRoutes.js
export async function verifySmtp() {
  if (!transporter) {
    return { ok: false, reason: 'SMTP non configurato' };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || 'verify failed' };
  }
}

export { transporter };
