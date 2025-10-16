import Subscriber from '../models/Subscriber.js';
import { sendMail } from '../nodemailer.config.js';
import { validationResult } from 'express-validator';

// Constants
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_PAGINATION = {
  PAGE: 1,
  LIMIT: 50,
  MAX_LIMIT: 200
};

// Response messages
const MESSAGES = {
  NEWSLETTER: {
    SUBSCRIBED: 'Inscription à la newsletter réussie',
    UNSUBSCRIBED: 'Désinscription de la newsletter réussie',
    ALREADY_SUBSCRIBED: 'Vous êtes déjà inscrit à notre newsletter',
    NOT_SUBSCRIBED: 'Adresse email non trouvée dans nos abonnés',
    LIST_SUCCESS: 'Abonnés récupérés avec succès',
    STATS_SUCCESS: 'Statistiques récupérées avec succès'
  },
  ERROR: {
    VALIDATION: 'Données de formulaire invalides',
    EMAIL_REQUIRED: 'Adresse email obligatoire',
    INVALID_EMAIL: 'Adresse email invalide',
    SERVER: 'Erreur interne du serveur'
  },
  EMAIL: {
    WELCOME_SUBJECT: '🎉 Bienvenue dans notre newsletter !',
    WELCOME_TEXT: 'Merci de vous être abonné à notre newsletter. Vous recevrez nos dernières actualités et projets.',
    UNSUBSCRIBE_SUBJECT: '😢 Désinscription de notre newsletter',
    UNSUBSCRIBE_TEXT: 'Vous avez été désinscrit de notre newsletter. Nous espérons vous revoir bientôt !',
    NEWSLETTER_SUBJECT: '📰 Notre dernière newsletter'
  }
};

/* =========================
   Utils
========================= */
const sanitizeSubscriber = (subscriber) => {
  const obj = subscriber?.toObject ? subscriber.toObject() : subscriber;
  return {
    id: obj._id,
    email: obj.email,
    status: obj.status || 'active',
    source: obj.source || 'website',
    subscribedAt: obj.subscribedAt || obj.createdAt,
    unsubscribedAt: obj.unsubscribedAt,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
};

const sendWelcomeEmail = async (email, name = 'Abonné') => {
  try {
    await sendMail({
      from: process.env.EMAIL_FROM || `"Portfolio" <${process.env.SMTP_USER}>`,
      to: email,
      subject: MESSAGES.EMAIL.WELCOME_SUBJECT,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb; text-align: center;">Bienvenue dans notre communauté !</h2>
          <div style="background: #f8fafc; padding: 25px; border-radius: 10px; margin: 20px 0;">
            <p style="font-size: 16px; color: #374151;">Bonjour <strong>${name}</strong>,</p>
            <p style="font-size: 16px; color: #374151;">Merci de vous être abonné à notre newsletter. Vous serez parmi les premiers à être informés de :</p>
            <ul style="font-size: 16px; color: #374151;">
              <li>🚀 Mes derniers projets et réalisations</li>
              <li>💡 Articles techniques et tutoriels</li>
              <li>🎯 Conseils et bonnes pratiques en développement</li>
              <li>📅 Événements et annonces importantes</li>
            </ul>
          </div>
          <div style="text-align: center; margin-top: 30px;">
            <p style="font-size: 14px; color: #6b7280;">
              Vous pouvez vous désinscrire à tout moment en cliquant sur le lien en bas de nos emails.
            </p>
          </div>
        </div>
      `,
      text: `Bonjour ${name},\n\nMerci de vous être abonné à notre newsletter. Vous recevrez nos dernières actualités, projets et conseils en développement.\n\nVous pouvez vous désinscrire à tout moment en utilisant le lien en bas de nos emails.\n\nÀ bientôt !`
    });
    console.log(`✅ Welcome email sent to: ${email}`);
  } catch (error) {
    console.warn('⚠️ Welcome email failed (non-critical):', error.message);
  }
};

const sendUnsubscribeEmail = async (email) => {
  try {
    await sendMail({
      from: process.env.EMAIL_FROM || `"Portfolio" <${process.env.SMTP_USER}>`,
      to: email,
      subject: MESSAGES.EMAIL.UNSUBSCRIBE_SUBJECT,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6b7280; text-align: center;">Nous sommes tristes de vous voir partir</h2>
          <div style="background: #fef2f2; padding: 25px; border-radius: 10px; margin: 20px 0;">
            <p style="font-size: 16px; color: #374151;">
              Vous avez été désinscrit de notre newsletter. Nous espérons que nos contenus vous ont été utiles.
            </p>
            <p style="font-size: 16px; color: #374151;">
              Si vous changez d'avis, vous pouvez vous réinscrire à tout moment sur notre site.
            </p>
          </div>
          <div style="text-align: center; margin-top: 30px;">
            <p style="font-size: 14px; color: #6b7280;">
              Merci pour le temps que vous nous avez accordé.
            </p>
          </div>
        </div>
      `,
      text: `Vous avez été désinscrit de notre newsletter. Nous espérons que nos contenus vous ont été utiles.\n\nSi vous changez d'avis, vous pouvez vous réinscrire à tout moment sur notre site.\n\nMerci pour le temps que vous nous avez accordé.`
    });
    console.log(`✅ Unsubscribe email sent to: ${email}`);
  } catch (error) {
    console.warn('⚠️ Unsubscribe email failed (non-critical):', error.message);
  }
};

/* =========================
   Controllers
========================= */

/**
 * PUBLIC: Subscribe to newsletter (idempotente)
 * POST /api/newsletter/subscribe
 */
export const subscribe = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: MESSAGES.ERROR.VALIDATION,
        errors: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { email, source = 'website', name } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.ERROR.EMAIL_REQUIRED,
        code: 'EMAIL_REQUIRED'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.ERROR.INVALID_EMAIL,
        code: 'INVALID_EMAIL'
      });
    }

    // Se già attivo → 200 idempotente (NO 409)
    const existingActive = await Subscriber.findOne({ email: normalizedEmail, status: 'active' }).lean();
    if (existingActive) {
      return res.status(200).json({
        success: true,
        already: true,
        message: MESSAGES.NEWSLETTER.ALREADY_SUBSCRIBED,
        code: 'ALREADY_SUBSCRIBED'
      });
    }

    // Se esiste (es. unsubscribed) → riattiva
    const existingAny = await Subscriber.findOne({ email: normalizedEmail }).lean();
    if (existingAny && existingAny.status !== 'active') {
      await Subscriber.updateOne(
        { _id: existingAny._id },
        { $set: { status: 'active', unsubscribedAt: null, source } }
      );
      if (process.env.SEND_WELCOME_EMAIL !== 'false') {
        sendWelcomeEmail(normalizedEmail, name);
      }
      return res.status(201).json({
        success: true,
        message: MESSAGES.NEWSLETTER.SUBSCRIBED,
        data: { subscriber: sanitizeSubscriber({ ...existingAny, status: 'active', unsubscribedAt: null, source }) },
        code: 'SUBSCRIBED_SUCCESSFULLY'
      });
    }

    // Nuova iscrizione
    const created = await Subscriber.create({
      email: normalizedEmail,
      source,
      status: 'active',
      subscribedAt: new Date()
    });

    if (process.env.SEND_WELCOME_EMAIL !== 'false') {
      sendWelcomeEmail(normalizedEmail, name);
    }

    return res.status(201).json({
      success: true,
      message: MESSAGES.NEWSLETTER.SUBSCRIBED,
      data: { subscriber: sanitizeSubscriber(created) },
      code: 'SUBSCRIBED_SUCCESSFULLY'
    });
  } catch (error) {
    console.error('❌ subscribe error:', {
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

/**
 * PUBLIC: Unsubscribe from newsletter
 * POST /api/newsletter/unsubscribe
 */
export const unsubscribe = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.ERROR.EMAIL_REQUIRED,
        code: 'EMAIL_REQUIRED'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const subscriber = await Subscriber.findOne({ email: normalizedEmail, status: 'active' });
    if (!subscriber) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.NEWSLETTER.NOT_SUBSCRIBED,
        code: 'NOT_SUBSCRIBED'
      });
    }

    subscriber.status = 'unsubscribed';
    subscriber.unsubscribedAt = new Date();
    await subscriber.save();

    if (process.env.SEND_UNSUBSCRIBE_EMAIL !== 'false') {
      sendUnsubscribeEmail(normalizedEmail);
    }

    return res.json({
      success: true,
      message: MESSAGES.NEWSLETTER.UNSUBSCRIBED,
      code: 'UNSUBSCRIBED_SUCCESSFULLY'
    });
  } catch (error) {
    console.error('❌ unsubscribe error:', {
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

/**
 * ADMIN: Get all subscribers with pagination
 * GET /api/newsletter/subscribers
 */
export const getSubscribers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || DEFAULT_PAGINATION.PAGE, 1);
    const limit = Math.min(parseInt(req.query.limit) || DEFAULT_PAGINATION.LIMIT, DEFAULT_PAGINATION.MAX_LIMIT);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.source) filter.source = req.query.source;
    if (req.query.search) filter.email = { $regex: req.query.search, $options: 'i' };

    const [subscribers, total, activeCount] = await Promise.all([
      Subscriber.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Subscriber.countDocuments(filter),
      Subscriber.countDocuments({ status: 'active' })
    ]);

    return res.json({
      success: true,
      message: MESSAGES.NEWSLETTER.LIST_SUCCESS,
      data: {
        subscribers: subscribers.map(sanitizeSubscriber),
        pagination: {
          page,
          limit,
          total,
          activeCount,
          pages: Math.ceil(total / limit)
        }
      },
      code: 'SUBSCRIBERS_RETRIEVED'
    });
  } catch (error) {
    console.error('❌ getSubscribers error:', {
      message: error.message,
      query: req.query,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * ADMIN: Get newsletter statistics
 * GET /api/newsletter/stats
 */
export const getNewsletterStats = async (req, res) => {
  try {
    const stats = await Subscriber.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$count' },
          statuses: { $push: { status: '$_id', count: '$count' } },
          active: { $sum: { $cond: [{ $eq: ['$_id', 'active'] }, '$count', 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          total: 1,
          active: 1,
          statuses: 1,
          inactive: { $subtract: ['$total', '$active'] }
        }
      }
    ]);

    const result = stats[0] || { total: 0, active: 0, inactive: 0, statuses: [] };

    const todaySubscribers = await Subscriber.countDocuments({
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthSubscribers = await Subscriber.countDocuments({ createdAt: { $gte: startOfMonth } });

    return res.json({
      success: true,
      message: MESSAGES.NEWSLETTER.STATS_SUCCESS,
      data: {
        stats: { ...result, today: todaySubscribers, thisMonth: monthSubscribers }
      },
      code: 'NEWSLETTER_STATS_RETRIEVED'
    });
  } catch (error) {
    console.error('❌ getNewsletterStats error:', { message: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * ADMIN: Send newsletter to all active subscribers
 * POST /api/newsletter/broadcast
 */
export const broadcastNewsletter = async (req, res) => {
  try {
    const { subject, content, preview } = req.body;

    if (!subject?.trim() || !content?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Sujet et contenu sont obligatoires',
        code: 'MISSING_CONTENT'
      });
    }

    const subscribers = await Subscriber.find({ status: 'active' });
    if (subscribers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucun abonné actif trouvé',
        code: 'NO_ACTIVE_SUBSCRIBERS'
      });
    }

    const listUnsubBase =
      process.env.BASE_URL?.replace(/\/+$/, '') ||
      process.env.PUBLIC_URL?.replace(/\/+$/, '') ||
      'http://localhost:5000';

    const BATCH_SIZE = 10;
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((s) =>
          sendMail({
            from: process.env.EMAIL_FROM || `"Portfolio" <${process.env.SMTP_USER}>`,
            to: s.email,
            subject: subject.trim(),
            html: content,
            text: preview || content.replace(/<[^>]*>/g, ''),
            headers: {
              'List-Unsubscribe': `<${listUnsubBase}/newsletter/unsubscribe?email=${encodeURIComponent(
                s.email
              )}>`
            }
          })
        )
      );
      successful += results.filter(r => r.status === 'fulfilled').length;
      failed += results.filter(r => r.status === 'rejected').length;

      if (i + BATCH_SIZE < subscribers.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return res.json({
      success: true,
      message: `Newsletter envoyée à ${successful} abonnés`,
      data: {
        total: subscribers.length,
        successful,
        failed,
        batchSize: BATCH_SIZE
      },
      code: 'NEWSLETTER_BROADCASTED'
    });
  } catch (error) {
    console.error('❌ broadcastNewsletter error:', { message: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

export default {
  subscribe,
  unsubscribe,
  getSubscribers,
  getNewsletterStats,
  broadcastNewsletter
};
