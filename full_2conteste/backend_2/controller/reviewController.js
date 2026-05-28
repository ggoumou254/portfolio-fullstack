// backend/controllers/reviewController.js
import Review from '../models/Review.js';
import { sendMail } from '../nodemailer.config.js';

export async function listReviews(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const skip = (page - 1) * limit;

    const total = await Review.countDocuments();
    const reviews = await Review.find().populate('user', 'name email role').sort({ createdAt: -1 }).skip(skip).limit(limit);

    res.json({ total, page, pages: Math.ceil(total / limit), reviews });
  } catch (err) {
    console.error('listReviews error:', err);
    res.status(500).json({ message: 'Errore server' });
  }
}

export async function createReview(req, res) {
  try {
    const { rating, comment } = req.body || {};
    if (!rating) return res.status(400).json({ message: 'Rating obbligatorio' });

    const review = await Review.create({ user: req.user.id, rating, comment });

    try {
      await sendMail({ from: process.env.EMAIL_USER, to: process.env.EMAIL_USER, subject: 'Nuova recensione', text: `Rating: ${rating}\nComment: ${comment}`});
    } catch (e) { console.warn('sendMail failed:', e?.message || e); }

    res.status(201).json({ message: 'Recensione creata', review });
  } catch (err) {
    console.error('createReview error:', err);
    res.status(500).json({ message: 'Errore server' });
  }
}

export async function deleteReview(req, res) {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ message: 'Recensione eliminata' });
  } catch (err) {
    console.error('deleteReview error:', err);
    res.status(500).json({ message: 'Errore server' });
  }
}
