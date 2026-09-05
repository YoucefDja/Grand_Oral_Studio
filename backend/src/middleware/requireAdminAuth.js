const jwt = require('jsonwebtoken');

/**
 * Middleware de protection des routes /api/admin/*.
 * Vérifie le JWT signé avec JWT_SECRET, émis par POST /api/admin/login.
 */
function requireAdminAuth(req, res, next) {
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
    req.admin = payload;
    return next();
  } catch (_err) {
    return res.status(401).json({ message: 'Session admin invalide ou expirée. Reconnectez-vous.' });
  }
}

module.exports = { requireAdminAuth };
