const express = require('express');
const mongoose = require('mongoose');
const NewsSource = require('../models/NewsSource');
const { DEFAULT_NEWS_SOURCES } = require('../data/defaultNewsSources');
const { runManualScan } = require('../services/newsScheduler');
const { requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

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

function normalizeUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch (_e) {
    return '';
  }
}

// GET /api/admin/news-sources — liste des sources configurées.
router.get(
  '/news-sources',
  asyncHandler(async (_req, res) => {
    const sources = await NewsSource.find().sort({ active: -1, name: 1 }).lean();
    res.json(sources);
  })
);

// POST /api/admin/news-sources — ajoute une source.
router.post(
  '/news-sources',
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const url = normalizeUrl(req.body?.url);
    const active = req.body?.active !== false;

    if (!name) throw httpError(400, 'Le nom de la source est obligatoire.');
    if (!url) throw httpError(400, 'URL invalide (http/https requis).');

    const exists = await NewsSource.findOne({ url });
    if (exists) throw httpError(409, 'Cette URL est déjà une source configurée.');

    const source = await NewsSource.create({
      name,
      url,
      active,
      description: String(req.body?.description || '').trim(),
    });
    res.status(201).json(source);
  })
);

// PUT /api/admin/news-sources/:id — modifie une source.
router.put(
  '/news-sources/:id',
  asyncHandler(async (req, res) => {
    isObjectIdOr404(req.params.id);
    const source = await NewsSource.findById(req.params.id);
    if (!source) throw httpError(404, 'Source introuvable.');

    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) throw httpError(400, 'Le nom de la source est obligatoire.');
      source.name = name;
    }
    if (req.body?.url !== undefined) {
      const url = normalizeUrl(req.body.url);
      if (!url) throw httpError(400, 'URL invalide (http/https requis).');
      const exists = await NewsSource.findOne({ url, _id: { $ne: source._id } });
      if (exists) throw httpError(409, 'Cette URL est déjà une source configurée.');
      source.url = url;
    }
    if (req.body?.active !== undefined) source.active = Boolean(req.body.active);
    if (req.body?.description !== undefined) {
      source.description = String(req.body.description || '').trim();
    }

    await source.save();
    res.json(source);
  })
);

// DELETE /api/admin/news-sources/:id — supprime une source.
router.delete(
  '/news-sources/:id',
  asyncHandler(async (req, res) => {
    isObjectIdOr404(req.params.id);
    const source = await NewsSource.findByIdAndDelete(req.params.id);
    if (!source) throw httpError(404, 'Source introuvable.');
    res.json({ ok: true, id: req.params.id });
  })
);

// POST /api/admin/news-sources/reset — restaure les 10 sources par défaut.
router.post(
  '/news-sources/reset',
  asyncHandler(async (_req, res) => {
    let ajoutees = 0;
    for (const s of DEFAULT_NEWS_SOURCES) {
      const exists = await NewsSource.findOne({ url: s.url });
      if (!exists) {
        await NewsSource.create({ name: s.name, url: s.url, active: true });
        ajoutees += 1;
      }
    }
    res.json({ ok: true, ajoutees, message: `${ajoutees} source(s) par défaut restaurée(s).` });
  })
);

// POST /api/admin/news/run — déclenchement manuel du scraping + glossaire du jour.
router.post(
  '/news/run',
  asyncHandler(async (_req, res) => {
    const report = await runManualScan();
    res.json(report);
  })
);

module.exports = router;
