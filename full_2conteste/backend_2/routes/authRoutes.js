import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// GET /api/auth/me
router.get('/me', verifyToken, (req, res) => {
  res.json({ message: 'Token valido', user: req.user });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email o password mancanti' });

    email = String(email).toLowerCase();
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Credenziali non valide' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Credenziali non valide' });

    const token = signToken(user);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Errore login:', err);
    res.status(500).json({ message: 'Errore durante il login' });
  }
});

export default router;
