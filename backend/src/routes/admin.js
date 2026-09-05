const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const MethodologySection = require('../models/MethodologySection');
const StepSchema = require('../models/StepSchema');
const Theme = require('../models/Theme');
const { requireAdminAuth } = require('../middleware/requireAdminAuth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

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

/** Compare deux chaînes en temps constant (évite les fuites temporelles). */
function passwordsMatch(password, expected) {
  if (!expected) return false;
  const a = Buffer.from(String(password || ''));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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

function pick(body, keys) {
  const out = {};
  for (const key of keys) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

// POST /api/admin/login — vérifie ADMIN_PASSWORD, émet un JWT
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    if (!process.env.ADMIN_PASSWORD) {
      throw httpError(500, 'ADMIN_PASSWORD n’est pas configurée côté serveur.');
    }
    if (!process.env.JWT_SECRET) {
      throw httpError(500, 'JWT_SECRET n’est pas configurée côté serveur.');
    }
    const { password } = req.body || {};
    if (!passwordsMatch(password, process.env.ADMIN_PASSWORD)) {
      throw httpError(401, 'Mot de passe incorrect.');
    }
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ token });
  })
);

// ---------------------------------------------------------------------------
// MethodologySection
// ---------------------------------------------------------------------------
router.get(
  '/methodology',
  requireAdminAuth,
  asyncHandler(async (_req, res) => {
    const sections = await MethodologySection.find().sort({ order: 1, sectionId: 1 }).lean();
    res.json(sections);
  })
);

router.put(
  '/methodology/:id',
  requireAdminAuth,
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
  requireAdminAuth,
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
  requireAdminAuth,
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
  requireAdminAuth,
  asyncHandler(async (_req, res) => {
    const schemas = await StepSchema.find().sort({ stepKey: 1 }).lean();
    res.json(schemas);
  })
);

router.put(
  '/step-schemas/:id',
  requireAdminAuth,
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
  requireAdminAuth,
  asyncHandler(async (_req, res) => {
    const themes = await Theme.find().sort({ order: 1, label: 1 }).lean();
    res.json(themes);
  })
);

router.post(
  '/themes',
  requireAdminAuth,
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
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    isObjectIdOr404(req.params.id);
    const theme = await Theme.findByIdAndDelete(req.params.id);
    if (!theme) throw httpError(404, 'Thème introuvable.');
    res.json({ ok: true, id: req.params.id });
  })
);

module.exports = router;
