import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const router = Router();

// GET /api/seed/reset-admin
router.get('/reset-admin', async (_req, res) => {
  try {
    const email = 'ggoumou254.gg@gmail.com';
    const passwordPlain = 'Raphael1997@';
    const hashed = await bcrypt.hash(passwordPlain, 10);

    const result = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: { name: 'Goumou Raphael', email: email.toLowerCase(), password: hashed, role: 'admin' }, $unset: { isAdmin: '' } },
      { new: true, upsert: true }
    );

    return res.json({ message: 'Admin ripristinato', credentials: { email, password: passwordPlain }, user: { id: result._id, email: result.email, role: result.role } });
  } catch (e) {
    console.error('reset-admin error:', e);
    return res.status(500).json({ message: 'Errore reset admin' });
  }
});

export default router;
