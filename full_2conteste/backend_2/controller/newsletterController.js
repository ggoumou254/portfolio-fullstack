// backend/controllers/newsletterController.js
import Subscriber from '../models/Subscriber.js';
import { sendMail } from '../nodemailer.config.js';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function subscribe(req, res) {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Email obbligatoria' });
    if (!emailRegex.test(String(email))) return res.status(400).json({ message: 'Email non valida' });

    const exists = await Subscriber.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Email già iscritta' });

    await Subscriber.create({ email: email.toLowerCase() });
    try {
      await sendMail({
        from: `"Portfolio" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '✅ Iscrizione alla newsletter',
        text: 'Grazie per esserti iscritto!'
      });
    } catch (e) { console.warn('sendMail failed:', e?.message || e); }

    res.status(201).json({ message: 'Iscrizione avvenuta con successo' });
  } catch (err) {
    console.error('subscribe error:', err);
    res.status(500).json({ message: 'Errore interno server' });
  }
}
