const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { verifyPassword, hashPassword } = require('../services/password');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '12h',
  });
}

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    if (!process.env.JWT_SECRET) {
      throw httpError(500, 'JWT_SECRET n’est pas configurée côté serveur.');
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      throw httpError(400, 'Email et mot de passe sont obligatoires.');
    }
    const user = await User.findOne({ email });
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      throw httpError(401, 'Email ou mot de passe incorrect.');
    }
    res.json({ token: signToken(user), user: user.toPublic() });
  })
);

// GET /api/auth/me — valide le token et renvoie l'utilisateur courant.
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw httpError(401, 'Utilisateur introuvable.');
    res.json({ user: user.toPublic() });
  })
);

// POST /api/auth/accept-invite — configure le mot de passe depuis le lien reçu par e-mail.
router.post(
  '/accept-invite',
  asyncHandler(async (req, res) => {
    if (!process.env.JWT_SECRET) {
      throw httpError(500, 'JWT_SECRET n’est pas configurée côté serveur.');
    }
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (!token) throw httpError(400, 'Lien d’invitation invalide ou manquant.');
    if (password.length < 8) {
      throw httpError(400, 'Le mot de passe doit contenir au moins 8 caractères.');
    }

    const user = await User.findOne({ inviteToken: token });
    if (!user || user.passwordHash) {
      throw httpError(400, 'Ce lien d’invitation est invalide ou déjà utilisé.');
    }
    if (!user.inviteExpires || user.inviteExpires < new Date()) {
      throw httpError(410, 'Ce lien d’invitation a expiré. Demandez un nouvel e-mail à votre administrateur.');
    }

    user.passwordHash = hashPassword(password);
    user.acceptedAt = new Date();
    user.inviteToken = null;
    user.inviteExpires = null;
    await user.save();

    res.json({ token: signToken(user), user: user.toPublic() });
  })
);

module.exports = router;
