import { Router } from 'express';
import Subscriber from '../models/Subscriber.js';
import { sendMail } from '../nodemailer.config.js';

const router = Router();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function subscribeCore(email, res, okMessage) {
  if (!email) return res.status(400).json({ message: 'Email obbligatoria' });
  if (!emailRegex.test(String(email))) return res.status(400).json({ message: 'Email non valida' });

  const existing = await Subscriber.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ message: 'Email già iscritta' });

  await Subscriber.create({ email: email.toLowerCase() });
  try {
    await sendMail({
      from: `"Portfolio" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '✅ Iscrizione alla Newsletter',
      text: 'Grazie per esserti iscritto!'
    });
  } catch (e) { console.warn('Newsletter mail failed:', e.message); }

  return res.status(201).json({ message: okMessage });
}

router.post('/', async (req, res) => { await subscribeCore(req.body.email, res, 'Iscrizione avvenuta con successo'); });
router.post('/subscribe', async (req, res) => { await subscribeCore(req.body.email, res, 'Grazie per esserti iscritto!'); });

export default router;
