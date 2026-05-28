import { Router } from 'express';
import Review from '../models/Review.js';
import { verifyToken, checkAdmin } from '../middleware/authMiddleware.js';
import { sendMail } from '../nodemailer.config.js';

const router = Router();

// GET (admin)
router.get('/', verifyToken, checkAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const total = await Review.countDocuments();
    const reviews = await Review.find()
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ total, page, pages: Math.ceil(total / limit), reviews });
  } catch {
    res.status(500).json({ message: 'Errore nel recupero delle recensioni' });
  }
});

// POST (user loggato)
router.post('/', verifyToken, async (req, res) => {
  const { rating, comment } = req.body || {};
  try {
    const review = await Review.create({ user: req.user.id, rating, comment });

    try {
      await sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: 'Nuova recensione ricevuta',
        text: `Hai una nuova recensione:\nRating: ${rating}\nCommento: ${comment}`
      });
    } catch (e) { console.warn('sendMail failed:', e.message); }

    res.status(201).json({ message: 'Recensione creata', review });
  } catch {
    res.status(500).json({ message: 'Errore nella creazione della recensione' });
  }
});

// DELETE (admin)
router.delete('/:id', verifyToken, checkAdmin, async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ message: "Errore nell'eliminazione" });
  }
});

export default router;
