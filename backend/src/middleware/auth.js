const jwt = require('jsonwebtoken');

/**
 * Middleware d'authentification par JWT (Authorization: Bearer <token>).
 * Le token est émis par POST /api/auth/login et contient { sub, role }.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ message: 'Authentification requise (token manquant).' });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'JWT_SECRET n’est pas configurée côté serveur.' });
  }
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET);
    req.userId = payload.sub;
    req.userRole = payload.role;
    if (!req.userId) throw new Error('payload invalide');
    return next();
  } catch (_err) {
    return res
      .status(401)
      .json({ message: 'Session expirée ou invalide. Reconnectez-vous.' });
  }
}

/** Réservé aux utilisateurs de rôle "admin". */
function requireAdmin(req, res, next) {
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs.' });
    }
    return next();
  });
}

module.exports = { requireAuth, requireAdmin };
