import { Router } from 'express';
import { verifyToken, checkAdmin } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

const router = Router();

// POST /api/users/:id/role  body: { role: "admin" | "user" }
router.post('/:id/role', verifyToken, checkAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ message: 'Ruolo non valido' });

  const updated = await User.findByIdAndUpdate(req.params.id, { $set: { role } }, { new: true });
  if (!updated) return res.status(404).json({ message: 'Utente non trovato' });

  res.json({ message: 'Ruolo aggiornato', user: updated });
});

export default router;
