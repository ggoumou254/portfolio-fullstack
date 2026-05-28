// backend/controllers/contactController.js
import Contact from '../models/Contact.js';
import { sendMail } from '../nodemailer.config.js'; // opzionale

/**
 * Public: sendMessage -> POST /api/contact
 * Salva messaggio e invia mail admin (se configurato)
 */
export async function sendMessage(req, res) {
  try {
    const { name, email, message } = req.body || {};
    if (!name || !email || !message) return res.status(400).json({ message: 'name, email e message obbligatori' });

    const doc = await Contact.create({ name, email, message });
    // invio mail admin (non bloccante)
    try {
      await sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: 'Nuovo messaggio dal sito',
        text: `Nuovo messaggio da ${name} <${email}>:\n\n${message}`
      });
    } catch (err) {
      console.warn('sendMail warning:', err?.message || err);
    }

    res.status(201).json({ message: 'Messaggio inviato', id: doc._id });
  } catch (err) {
    console.error('sendMessage error:', err);
    res.status(500).json({ message: 'Errore interno server' });
  }
}

/**
 * Admin: listar tutti i messaggi paginati
 */
export async function getMessages(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const total = await Contact.countDocuments();
    const docs = await Contact.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

    res.json({ total, page, pages: Math.ceil(total / limit), data: docs });
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ message: 'Errore interno server' });
  }
}

/**
 * Admin: dettaglio singolo
 */
export async function getMessageById(req, res) {
  try {
    const doc = await Contact.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'Messaggio non trovato' });
    res.json(doc);
  } catch (err) {
    console.error('getMessageById error:', err);
    res.status(500).json({ message: 'Errore interno server' });
  }
}

/**
 * Admin: delete
 */
export async function deleteMessage(req, res) {
  try {
    const del = await Contact.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ message: 'Messaggio non trovato' });
    res.json({ message: 'Messaggio eliminato' });
  } catch (err) {
    console.error('deleteMessage error:', err);
    res.status(500).json({ message: 'Errore interno server' });
  }
}
