// backend/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

/**
 * verifyToken: legge header Authorization: Bearer <token>
 * - se valido carica req.user (senza password)
 * - se manca/errato => 401
 *
 * Nota: non loggare il token completo (privacy), logghiamo solo un hint.
 */
export async function verifyToken(req, res, next) {
  try {
    // Allow preflight to pass through without token (CORS OPTIONS)
    if (req.method === "OPTIONS") return next();

    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    if (!authHeader) {
      return res.status(401).json({ message: "Token mancante" });
    }

    const parts = authHeader.split(" ").filter(Boolean);
    if (parts.length !== 2) {
      return res.status(401).json({ message: "Formato Authorization non valido" });
    }

    const [scheme, rawToken] = parts;
    if (!/^Bearer$/i.test(scheme)) {
      return res.status(401).json({ message: "Formato Authorization non valido" });
    }

    // Verifica token (può lanciare errori)
    let decoded;
    try {
      decoded = jwt.verify(rawToken, JWT_SECRET);
    } catch (err) {
      if (err?.name === "TokenExpiredError") return res.status(401).json({ message: "Token scaduto" });
      if (err?.name === "JsonWebTokenError") return res.status(401).json({ message: "Token non valido" });
      console.error("verifyToken unexpected error:", err);
      return res.status(401).json({ message: "Token non valido" });
    }

    // Carica utente senza password
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    // Evita log espliciti del token per sicurezza; mostriamo solo un hint
    const tokenHint = String(rawToken).slice(0, 8) + "...";
    console.log(`[auth] token valid, hint=${tokenHint}, user=${user.email}, role=${user.role}`);

    req.user = user; // mongoose document (senza password)
    req._id = req._id || decoded?.id || user._id; // compatibilità con tracing
    next();
  } catch (err) {
    console.error("verifyToken fatal error:", err);
    return res.status(500).json({ message: "Errore nella verifica del token" });
  }
}

/**
 * checkAdmin: middleware per proteggere rotte admin
 */
export function checkAdmin(req, res, next) {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Accesso riservato agli admin" });
    }
    next();
  } catch (err) {
    console.error("checkAdmin error:", err);
    return res.status(500).json({ message: "Errore controllo permessi" });
  }
}

/**
 * signToken: utility per creare token coerente
 */
export function signToken(user) {
  const payload = {
    id: user.id || user._id?.toString?.() || user._id,
    email: user.email,
    role: user.role || "user",
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

/**
 * tracingMiddleware: attach request id + simple timing logs
 * Usalo in server.js: tracingMiddleware(app);
 */
export function tracingMiddleware(app) {
  app.use((req, res, next) => {
    req._id = uuidv4();
    req._startAt = process.hrtime();
    const shortTs = new Date().toISOString();
    console.log(`[REQ ${req._id}] -> ${shortTs} ${req.method} ${req.url} ip=${req.ip} ua=${(req.headers['user-agent']||'').slice(0,60)} referer=${req.headers.referer||'-'}`);

    res.on('finish', () => {
      const diff = process.hrtime(req._startAt);
      const ms = Math.round(diff[0] * 1000 + diff[1] / 1e6);
      console.log(`[RES ${req._id}] <- ${req.method} ${req.url} status=${res.statusCode} time=${ms}ms`);
    });

    req.on('close', () => {
      console.log(`[CLOSE ${req._id}] connection closed before finish for ${req.method} ${req.url}`);
    });

    next();
  });
}
