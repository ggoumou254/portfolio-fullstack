// backend/controllers/contactController.js
import Contact from '../models/Contact.js';
import { sendMail } from '../nodemailer.config.js';
import { validationResult } from 'express-validator';

/* =========================
   Costanti & util
========================= */
const DEFAULT_PAGINATION = { PAGE: 1, LIMIT: 20, MAX_LIMIT: 100 };

const MESSAGES = {
  CONTACT: {
    CREATED: 'Message envoyé avec succès',
    LIST_SUCCESS: 'Messages récupérés avec succès',
    SINGLE_SUCCESS: 'Message récupéré avec succès',
    DELETED: 'Message supprimé avec succès',
    NOT_FOUND: 'Message non trouvé'
  },
  ERROR: {
    VALIDATION: 'Données de formulaire invalides',
    REQUIRED_FIELDS: 'Nom, email et message sont obligatoires',
    INVALID_EMAIL: 'Adresse email invalide',
    SERVER: 'Erreur interne du serveur',
    RATE_LIMIT: 'Trop de messages envoyés, veuillez réessayer plus tard'
  },
  EMAIL: {
    SUBJECT: 'Nouveau message de contact - Portfolio',
    ADMIN_SUBJECT: 'Nouveau message de contact reçu'
  }
};

const ADMIN_EMAIL = process.env.CONTACT_RECEIVER || process.env.SMTP_USER;
const FROM_ADDR = process.env.EMAIL_FROM || `Portfolio <${process.env.SMTP_USER}>`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (email) => EMAIL_RE.test(String(email || '').trim());

const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const stripTags = (s = '') => String(s).replace(/<[^>]*>/g, '');
const sanitizeInline = (s = '', max = 1000) =>
  stripTags(s).trim().replace(/\s+/g, ' ').slice(0, max);

const toPlainObj = (doc) => (doc?.toObject ? doc.toObject() : doc);

/* =========================
   Sanitizer per risposta
========================= */
const sanitizeContact = (contact) => {
  const obj = toPlainObj(contact);
  return {
    id: String(obj._id || obj.id || ''),
    name: obj.name,
    email: obj.email,
    message: obj.message,
    isRead: Boolean(obj.isRead),
    status: obj.status || 'new',
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
};

/* =========================
   Email notifications (non-blocking)
========================= */
const sendNotificationEmails = async ({ name, email, message, subject }) => {
  try {
    const safeMsgHtml = escapeHtml(message).replace(/\n/g, '<br>');
    const adminHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color:#111;margin:0 0 8px">Nouveau message de contact</h2>
        <p style="color:#555;margin:0 0 12px">Reçu via /api/contact</p>
        <table cellpadding="8" cellspacing="0" style="background:#f7f7f8;border-radius:8px;width:100%;max-width:640px">
          <tr><td><strong>Nom</strong></td><td>${escapeHtml(name)}</td></tr>
          <tr><td><strong>Email</strong></td><td>${escapeHtml(email)}</td></tr>
          ${subject ? `<tr><td><strong>Sujet</strong></td><td>${escapeHtml(subject)}</td></tr>` : ''}
          <tr><td style="vertical-align:top"><strong>Message</strong></td><td>${safeMsgHtml}</td></tr>
          <tr><td><strong>Date</strong></td><td>${new Date().toLocaleString('fr-FR')}</td></tr>
        </table>
      </div>
    `;

    const adminEmailPromise = sendMail({
      to: ADMIN_EMAIL,
      subject: MESSAGES.EMAIL.ADMIN_SUBJECT,
      html: adminHtml,
      text: `De: ${name} <${email}>\nSujet: ${subject || '-'}\n\n${message}`,
      // Permette "Répondre" diretto al mittente
      replyTo: `${sanitizeInline(name, 80)} <${email}>`,
      from: FROM_ADDR
    });

    const userAutoReply =
      process.env.SEND_AUTO_REPLY === 'true'
        ? sendMail({
            to: email,
            subject: MESSAGES.EMAIL.SUBJECT,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color:#111;margin:0 0 8px">Merci pour votre message</h2>
                <p>Bonjour <strong>${escapeHtml(name)}</strong>,</p>
                <p>J'ai bien reçu votre message et je vous répondrai dans les plus brefs délais.</p>
                <div style="background:#f7f7f8;padding:12px;border-radius:8px;margin:16px 0">
                  <strong>Votre message :</strong>
                  <div style="background:#fff;padding:10px;border-radius:6px;margin-top:6px">${safeMsgHtml}</div>
                </div>
                <p>Cordialement,<br/>Portfolio</p>
              </div>
            `,
            text: `Bonjour ${name},\n\nJ'ai bien reçu votre message et je vous répondrai dans les plus brefs délais.\n\nVotre message:\n${message}\n\nCordialement,\nPortfolio`,
            from: FROM_ADDR
          })
        : Promise.resolve();

    await Promise.allSettled([adminEmailPromise, userAutoReply]);
  } catch (err) {
    console.warn('⚠️ Email notification failed (non-critical):', err.message);
  }
};

/* =========================
   PUBLIC: POST /api/contact
========================= */
export const sendMessage = async (req, res) => {
  try {
    // Se la route usa express-validator, questo consolida eventuali errori
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: MESSAGES.ERROR.VALIDATION,
        errors: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { name, email, message, subject } = req.body;

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.ERROR.REQUIRED_FIELDS,
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.ERROR.INVALID_EMAIL,
        code: 'INVALID_EMAIL'
      });
    }

    // Anti-duplicate 5 min
    const recentSubmission = await Contact.findOne({
      email: email.trim().toLowerCase(),
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
    }).lean();
    if (recentSubmission) {
      return res.status(429).json({
        success: false,
        message: MESSAGES.ERROR.RATE_LIMIT,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    // Crea record
    const contactData = {
      name: sanitizeInline(name, 80),
      email: email.trim().toLowerCase(),
      message: sanitizeInline(message, 5000),
      subject: subject ? sanitizeInline(subject, 140) : undefined,
      status: 'new',
      isRead: false
    };
    const contact = await Contact.create(contactData);

    // Invio notifiche non-blocking (no await)
    sendNotificationEmails(contactData);

    return res.status(201).json({
      success: true,
      message: MESSAGES.CONTACT.CREATED,
      data: { contact: sanitizeContact(contact) },
      code: 'MESSAGE_SENT_SUCCESSFULLY'
    });
  } catch (error) {
    console.error('❌ sendMessage error:', {
      message: error.message,
      email: req.body?.email,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

/* =========================
   ADMIN: GET /api/contact
========================= */
export const getMessages = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || DEFAULT_PAGINATION.PAGE, 1);
    const limit = Math.min(parseInt(req.query.limit) || DEFAULT_PAGINATION.LIMIT, DEFAULT_PAGINATION.MAX_LIMIT);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.isRead !== undefined) filter.isRead = req.query.isRead === 'true';
    if (req.query.search) {
      const q = String(req.query.search);
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { message: { $regex: q, $options: 'i' } },
        { subject: { $regex: q, $options: 'i' } },
      ];
    }

    const [docs, total, unreadCount] = await Promise.all([
      Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Contact.countDocuments(filter),
      Contact.countDocuments({ ...filter, isRead: false })
    ]);

    return res.json({
      success: true,
      message: MESSAGES.CONTACT.LIST_SUCCESS,
      data: {
        messages: docs.map(sanitizeContact),
        pagination: {
          page, limit, total, unreadCount, pages: Math.ceil(total / limit)
        }
      },
      code: 'MESSAGES_RETRIEVED'
    });
  } catch (error) {
    console.error('❌ getMessages error:', { message: error.message, query: req.query, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

/* =========================
   ADMIN: GET /api/contact/:id
========================= */
export const getMessageById = async (req, res) => {
  try {
    const message = await Contact.findById(req.params.id);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.CONTACT.NOT_FOUND,
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    if (!message.isRead) {
      message.isRead = true;
      message.status = 'read';
      await message.save();
    }

    return res.json({
      success: true,
      message: MESSAGES.CONTACT.SINGLE_SUCCESS,
      data: { message: sanitizeContact(message) },
      code: 'MESSAGE_RETRIEVED'
    });
  } catch (error) {
    console.error('❌ getMessageById error:', { message: error.message, messageId: req.params.id, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

/* =========================
   ADMIN: DELETE /api/contact/:id
========================= */
export const deleteMessage = async (req, res) => {
  try {
    const deleted = await Contact.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.CONTACT.NOT_FOUND,
        code: 'MESSAGE_NOT_FOUND'
      });
    }
    return res.json({
      success: true,
      message: MESSAGES.CONTACT.DELETED,
      code: 'MESSAGE_DELETED'
    });
  } catch (error) {
    console.error('❌ deleteMessage error:', { message: error.message, messageId: req.params.id, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

/* =========================
   ADMIN: PATCH /api/contact/:id/read
========================= */
export const markAsRead = async (req, res) => {
  try {
    const { isRead = true } = req.body;
    const updated = await Contact.findByIdAndUpdate(
      req.params.id,
      { isRead: Boolean(isRead), status: isRead ? 'read' : 'new' },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.CONTACT.NOT_FOUND,
        code: 'MESSAGE_NOT_FOUND'
      });
    }
    return res.json({
      success: true,
      message: `Message marqué comme ${isRead ? 'lu' : 'non lu'}`,
      data: { message: sanitizeContact(updated) },
      code: 'MESSAGE_UPDATED'
    });
  } catch (error) {
    console.error('❌ markAsRead error:', { message: error.message, messageId: req.params.id, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

/* =========================
   ADMIN: GET /api/contact/stats
========================= */
export const getContactStats = async (_req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stats = await Contact.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
          today: { $sum: { $cond: [{ $gte: ['$createdAt', startOfToday] }, 1, 0] } },
          last7Days: { $sum: { $cond: [{ $gte: ['$createdAt', last7Days] }, 1, 0] } }
        }
      }
    ]);

    const result = stats[0] || { total: 0, unread: 0, today: 0, last7Days: 0 };

    return res.json({
      success: true,
      data: { stats: result },
      code: 'STATS_RETRIEVED'
    });
  } catch (error) {
    console.error('❌ getContactStats error:', { message: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

export default {
  sendMessage,
  getMessages,
  getMessageById,
  deleteMessage,
  markAsRead,
  getContactStats
};
