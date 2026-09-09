const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const MethodologySection = require('../models/MethodologySection');
const StepSchema = require('../models/StepSchema');
const Theme = require('../models/Theme');
const { requireAdmin } = require('../middleware/auth');
const { generateInviteToken } = require('../services/password');
const { sendInviteEmail } = require('../services/resend');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  lireChronoDureeMinutes,
  validerChronoDureeMinutes,
  ecrireChronoDureeMinutes,
} = require('../services/appSettings');

const router = express.Router();

// Toutes les routes ci-dessous sont réservées au rôle admin.
router.use(requireAdmin);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isObjectIdOr404(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, 'Identifiant invalide.');
  }
  return id;
}

function pick(body, keys) {
  const out = {};
  for (const key of keys) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

function normalizeSteps(value) {
  if (value === undefined || value === null) return undefined;
  const list = Array.isArray(value)
    ? value
    : String(value)
        .split(',')
        .map((s) => s.trim());
  return list
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i);
}

/** Préparation du document user renvoyé à l'admin (jamais de hash/token). */
function serializeUser(u) {
  const doc = u.toObject ? u.toObject() : u;
  return {
    _id: doc._id,
    email: doc.email,
    role: doc.role,
    acceptedAt: doc.acceptedAt,
    createdAt: doc.createdAt,
    pending: !doc.passwordHash || !doc.acceptedAt,
  };
}

// ---------------------------------------------------------------------------
// Utilisateurs & invitations
// ---------------------------------------------------------------------------
const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48 h

router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json(users.map(serializeUser));
  })
);

/** Crée un utilisateur "user" à partir de son email et lui envoie l'invitation. */
router.post(
  '/users',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw httpError(400, 'Adresse e-mail invalide.');
    }

    let user = await User.findOne({ email });
    const isNew = !user;
    if (isNew) {
      user = new User({
        email,
        role: 'user',
        inviteToken: generateInviteToken(),
        inviteExpires: new Date(Date.now() + INVITE_TTL_MS),
        invitedBy: req.userId,
      });
    } else if (user.passwordHash) {
      throw httpError(409, 'Cet e-mail est déjà un utilisateur actif.');
    } else {
      // Déjà en attente → régénère un lien frais (nouvel e-mail).
      user.inviteToken = generateInviteToken();
      user.inviteExpires = new Date(Date.now() + INVITE_TTL_MS);
      user.invitedBy = req.userId;
    }
    await user.save();

    // L'envoi d'e-mail peut échouer (clé Resend absente, solde…) : l'utilisateur
    // reste en attente et l'admin peut relancer l'invitation.
    await sendInviteEmail({ email: user.email, token: user.inviteToken });

    res.status(isNew ? 201 : 200).json({
      user: serializeUser(user.toObject()),
      message: `E-mail d’invitation envoyé à ${email}.`,
    });
  })
);

/** Renvoie une invitation à un utilisateur encore en attente. */
router.post(
  '/users/:id/resend-invite',
  asyncHandler(async (req, res) => {
    isObjectIdOr404(req.params.id);
    const user = await User.findById(req.params.id);
    if (!user) throw httpError(404, 'Utilisateur introuvable.');
    if (user.passwordHash) {
      throw httpError(400, 'Cet utilisateur a déjà configuré son mot de passe.');
    }
    user.inviteToken = generateInviteToken();
    user.inviteExpires = new Date(Date.now() + INVITE_TTL_MS);
    user.invitedBy = req.userId;
    await user.save();

    await sendInviteEmail({ email: user.email, token: user.inviteToken });
    res.json({ user: serializeUser(user.toObject()), message: `Invitation renvoyée à ${user.email}.` });
  })
);

router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    isObjectIdOr404(req.params.id);
    const user = await User.findById(req.params.id);
    if (!user) throw httpError(404, 'Utilisateur introuvable.');
    if (user.role === 'admin') {
      throw httpError(400, 'Impossible de supprimer un compte administrateur.');
    }
    if (String(user._id) === String(req.userId)) {
      throw httpError(400, 'Impossible de supprimer votre propre compte.');
    }
    await user.deleteOne();
    res.json({ ok: true, id: req.params.id });
  })
);

// ---------------------------------------------------------------------------
// MethodologySection
// ---------------------------------------------------------------------------
router.get(
  '/methodology',
  asyncHandler(async (_req, res) => {
    const sections = await MethodologySection.find().sort({ order: 1, sectionId: 1 }).lean();
    res.json(sections);
  })
);

router.put(
  '/methodology/:id',
  asyncHandler(async (req, res) => {
    isObjectIdOr404(req.params.id);
    const body = pick(req.body, ['sectionId', 'title', 'content', 'order', 'appliesToSteps']);
    if (body.sectionId !== undefined) body.sectionId = String(body.sectionId).trim().toLowerCase();
    if (body.order !== undefined) body.order = Number(body.order);
    if (body.title !== undefined) body.title = String(body.title).trim();
    if (body.content !== undefined) body.content = String(body.content);

    const normalizedSteps = normalizeSteps(body.appliesToSteps);
    if (normalizedSteps) body.appliesToSteps = normalizedSteps;

    const section = await MethodologySection.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });
    if (!section) throw httpError(404, 'Section de méthodologie introuvable.');
    res.json(section);
  })
);

router.post(
  '/methodology',
  asyncHandler(async (req, res) => {
    const body = pick(req.body, ['sectionId', 'title', 'content', 'order', 'appliesToSteps']);
    if (!body.sectionId || !body.title || !body.content) {
      throw httpError(400, 'sectionId, title et content sont obligatoires.');
    }
    body.sectionId = String(body.sectionId).trim().toLowerCase();
    body.order = Number(body.order ?? 10);
    body.appliesToSteps = normalizeSteps(body.appliesToSteps ?? ['all']) || ['all'];
    const section = await MethodologySection.create(body);
    res.status(201).json(section);
  })
);

router.delete(
  '/methodology/:id',
  asyncHandler(async (req, res) => {
    isObjectIdOr404(req.params.id);
    const section = await MethodologySection.findByIdAndDelete(req.params.id);
    if (!section) throw httpError(404, 'Section de méthodologie introuvable.');
    res.json({ ok: true, id: req.params.id });
  })
);

// ---------------------------------------------------------------------------
// StepSchema
// ---------------------------------------------------------------------------
router.get(
  '/step-schemas',
  asyncHandler(async (_req, res) => {
    const schemas = await StepSchema.find().sort({ stepKey: 1 }).lean();
    res.json(schemas);
  })
);

router.put(
  '/step-schemas/:id',
  asyncHandler(async (req, res) => {
    isObjectIdOr404(req.params.id);
    const body = pick(req.body, ['stepKey', 'jsonSchemaDescription']);
    if (body.stepKey !== undefined) body.stepKey = String(body.stepKey).trim().toLowerCase();
    if (body.jsonSchemaDescription !== undefined) body.jsonSchemaDescription = String(body.jsonSchemaDescription);
    const schema = await StepSchema.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });
    if (!schema) throw httpError(404, 'StepSchema introuvable.');
    res.json(schema);
  })
);

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
router.get(
  '/themes',
  asyncHandler(async (_req, res) => {
    const themes = await Theme.find().sort({ order: 1, label: 1 }).lean();
    res.json(themes);
  })
);

router.post(
  '/themes',
  asyncHandler(async (req, res) => {
    const { label, order } = req.body || {};
    if (!label || !String(label).trim()) {
      throw httpError(400, 'Le label du thème est obligatoire.');
    }
    const theme = await Theme.create({ label: String(label).trim(), order: Number(order ?? 0) });
    res.status(201).json(theme);
  })
);

router.delete(
  '/themes/:id',
  asyncHandler(async (req, res) => {
    isObjectIdOr404(req.params.id);
    const theme = await Theme.findByIdAndDelete(req.params.id);
    if (!theme) throw httpError(404, 'Thème introuvable.');
    res.json({ ok: true, id: req.params.id });
  })
);

// ---------------------------------------------------------------------------
// Réglages applicatifs — durée du chrono de session
// ---------------------------------------------------------------------------
router.get(
  '/settings/chrono',
  asyncHandler(async (_req, res) => {
    res.json({ dureeMinutes: await lireChronoDureeMinutes() });
  })
);

router.put(
  '/settings/chrono',
  asyncHandler(async (req, res) => {
    const dureeMinutes = validerChronoDureeMinutes(req.body?.dureeMinutes);
    if (dureeMinutes === null) {
      throw httpError(
        400,
        'La durée du chrono doit être un nombre entier de minutes (entre 1 et 720).'
      );
    }
    await ecrireChronoDureeMinutes(dureeMinutes);
    res.json({ dureeMinutes });
  })
);

module.exports = router;
