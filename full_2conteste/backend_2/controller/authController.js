// backend/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

/**
 * verifyToken: legge header Authorization: Bearer <token>
 * - se valido carica req.user (senza password)
 * - se manca/errato => 401
 */
export async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    if (!authHeader) return res.status(401).json({ message: 'Token mancante' });

    const parts = authHeader.split(' ').filter(Boolean);
    if (parts.length !== 2) return res.status(401).json({ message: 'Formato Authorization non valido' });

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) return res.status(401).json({ message: 'Formato Authorization non valido' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token scaduto' });
      return res.status(401).json({ message: 'Token non valido' });
    }

    // carica utente (senza password)
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(404).json({ message: 'Utente non trovato' });

    // espone poche proprietà essenziali
    req.user = { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
    req._id = user._id; // compatibilità con codice esistente
    next();
  } catch (err) {
    console.error('verifyToken error:', err);
    return res.status(500).json({ message: 'Errore nella verifica del token' });
  }
}

/**
 * checkAdmin: middleware per proteggere rotte admin
 * - usa req.user popolato da verifyToken
 */
export function checkAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Accesso negato: admin richiesto' });
  }
  next();
}

/**
 * signToken: utility per creare token coerente
 */
export function signToken(user) {
  const payload = {
    id: user._id?.toString?.() || user.id,
    email: user.email,
    role: user.role || 'user',
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' });
}
