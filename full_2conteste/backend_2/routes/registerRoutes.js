import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const router = Router();
const SALT_ROUNDS = 10;

// POST /api/auth/register
router.post('/', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Nome, email e password obbligatori.' });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ message: 'Utente già registrato.' });

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = await User.create({ name, email: email.toLowerCase(), password: hashed, role: 'user' });

    res.status(201).json({ message: 'Registrazione completata', user: { id: newUser._id, name, email, role: 'user' } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Errore interno server' });
  }
});

export default router;
