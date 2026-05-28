import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const router = Router();

// GET /api/seed/admin
router.get('/admin', async (_req, res) => {
  try {
    const email = 'ggoumou254.gg@gmail.com';
    const existing = await User.findOne({ email });
    if (existing) return res.json({ message: 'Admin già presente', user: existing });

    const hashed = await bcrypt.hash('Raphael1997@', 10);
    const admin = await User.create({
      name: 'Goumou Raphael',
      email,
      password: hashed,
      role: 'admin',
    });

    res.status(201).json({ message: '✅ Admin creato con successo', credentials: { email, password: 'Raphael1997@' }, user: admin });
  } catch (err) {
    console.error('Errore seed admin:', err);
    res.status(500).json({ error: 'Errore creazione admin' });
  }
});

export default router;
