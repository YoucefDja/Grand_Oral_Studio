const express = require('express');
const mongoose = require('mongoose');
const Session = require('../models/Session');
const { buildStepPrompt, STEP_KEYS, STEP_LABELS } = require('../services/promptBuilder');
const { generateAnthropic, parseJsonStrict } = require('../services/anthropic');
const { generateDeepseek } = require('../services/deepseek');
const { buildPptx } = require('../services/pptx');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Routage des providers selon l'étape :
//  - étapes 1 à 5  → DeepSeek (deepseek-v4-flash, non-thinking)
//  - étape 6       → Anthropic Claude (inchangée)
const DEEPSEEK_STEPS = ['analyse', 'probleme', 'recherche', 'glossaire', 'plan'];
const CLAUDE_STEPS = ['support'];

function getProviderForStep(step) {
  if (DEEPSEEK_STEPS.includes(step)) return 'deepseek';
  if (CLAUDE_STEPS.includes(step)) return 'claude';
  throw httpError(400, `Étape inconnue : ${step}`);
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function findSessionOr404(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, 'Identifiant de session invalide.');
  }
  return Session.findById(id);
}

function isNonEmptyObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Object.keys(obj).some((k) => {
    const v = obj[k];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return String(v).trim() !== '';
  });
}

/** Contrôles de cohérence minimale sur le JSON renvoyé par l'IA — erreur explicite sinon. */
function validateStepOutput(stepKey, parsed) {
  if (!isNonEmptyObject(parsed)) {
    throw httpError(
      502,
      `Le contenu généré pour l'étape « ${STEP_LABELS[stepKey]} » est vide ou inutilisable. Réessayez.`
    );
  }
  if (stepKey === 'probleme') {
    if (!Array.isArray(parsed.formulations) || parsed.formulations.length === 0) {
      throw httpError(502, 'La problématique générée ne contient aucune formulation exploitable.');
    }
    if (typeof parsed.ligne_directrice !== 'string' || !parsed.ligne_directrice.trim()) {
      throw httpError(502, 'La problématique générée ne contient pas de ligne_directrice (fil rouge).');
    }
  }
  if (stepKey === 'glossaire') {
    const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
    const termes = Array.isArray(parsed.termes) ? parsed.termes : [];
    if (sources.length === 0 || termes.length === 0) {
      throw httpError(502, 'Le glossaire généré doit contenir au moins une source résumée et un terme défini.');
    }
  }
  if (stepKey === 'plan' && (!Array.isArray(parsed.sections) || parsed.sections.length === 0)) {
    throw httpError(502, 'Le plan généré ne contient aucune section exploitable.');
  }
  if (stepKey === 'support') {
    if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      throw httpError(502, 'Le support généré ne contient aucune slide exploitable.');
    }
  }
  return true;
}

function assertGlossaireValide(session, pourEtape) {
  const glossaire = session.data && session.data.glossaire;
  const sources = Array.isArray(glossaire?.sources) ? glossaire.sources : [];
  const termes = Array.isArray(glossaire?.termes) ? glossaire.termes : [];
  if (sources.length === 0 || termes.length === 0) {
    throw httpError(
      400,
      `L'étape « ${STEP_LABELS[pourEtape]} » exige un glossaire validé (étapes précédentes). Générez d'abord le glossaire.`
    );
  }
}

// GET /api/sessions — liste des sessions (plus récentes d'abord)
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const sessions = await Session.find().sort({ updatedAt: -1 }).lean();
    res.json(sessions);
  })
);

// POST /api/sessions — création d'une session
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { titre, theme, contexte } = req.body || {};
    if (!titre || !String(titre).trim()) {
      throw httpError(400, 'Le sujet (titre) est obligatoire pour créer une session.');
    }
    const session = await Session.create({
      titre: String(titre).trim(),
      theme: theme ? String(theme) : '',
      contexte: contexte ? String(contexte) : '',
      currentStep: 0,
    });
    res.status(201).json(session);
  })
);

// GET /api/sessions/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id);
    if (!session) throw httpError(404, 'Session introuvable.');
    res.json(session);
  })
);

// PATCH /api/sessions/:id
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id);
    if (!session) throw httpError(404, 'Session introuvable.');

    const { titre, theme, contexte, currentStep } = req.body || {};
    if (titre !== undefined) session.titre = String(titre).trim();
    if (theme !== undefined) session.theme = String(theme);
    if (contexte !== undefined) session.contexte = String(contexte);
    if (currentStep !== undefined) {
      const step = Number(currentStep);
      if (!Number.isInteger(step) || step < 0 || step > STEP_KEYS.length) {
        throw httpError(400, 'currentStep doit être un entier entre 0 et 6.');
      }
      session.currentStep = step;
    }
    await session.save();
    res.json(session);
  })
);

// DELETE /api/sessions/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id);
    if (!session) throw httpError(404, 'Session introuvable.');
    await session.deleteOne();
    res.json({ ok: true, id: req.params.id });
  })
);

// POST /api/sessions/:id/generate/:step
// step = analyse | probleme | recherche | glossaire | plan | support
router.post(
  '/:id/generate/:step',
  asyncHandler(async (req, res) => {
    const stepKey = String(req.params.step || '').trim().toLowerCase();
    if (!STEP_KEYS.includes(stepKey)) {
      throw httpError(
        400,
        `Étape inconnue "${stepKey}". Attendue : ${STEP_KEYS.join(' | ')}.`
      );
    }

    const session = await findSessionOr404(req.params.id);
    if (!session) throw httpError(404, 'Session introuvable.');

    // Règle produit : glossaire obligatoire avant plan et support.
    if (stepKey === 'plan' || stepKey === 'support') {
      assertGlossaireValide(session, stepKey);
    }

    const { system, user } = await buildStepPrompt(session, stepKey);

    // Sélection du provider : DeepSeek pour les étapes 1-5, Claude pour le support.
    const provider = getProviderForStep(stepKey);
    let parsed;
    if (provider === 'deepseek') {
      const raw = await generateDeepseek(system, user);
      parsed = parseJsonStrict(raw);
    } else {
      parsed = await generateAnthropic(system, user);
    }
    validateStepOutput(stepKey, parsed);

    if (stepKey === 'probleme') {
      session.ligneDirectrice = String(parsed.ligne_directrice).trim();
    }

    session.data[stepKey] = parsed;
    session.markModified('data');

    // Avance la progression si la génération est un pas en avant.
    const nextIndex = STEP_KEYS.indexOf(stepKey) + 1;
    session.currentStep = Math.max(session.currentStep || 0, nextIndex);

    await session.save();
    res.json(session);
  })
);

// POST /api/sessions/:id/export-pptx
router.post(
  '/:id/export-pptx',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id);
    if (!session) throw httpError(404, 'Session introuvable.');

    const glossaire = session.data && session.data.glossaire;
    const sources = Array.isArray(glossaire?.sources) ? glossaire.sources : [];
    const termes = Array.isArray(glossaire?.termes) ? glossaire.termes : [];
    if (sources.length === 0 || termes.length === 0) {
      throw httpError(
        400,
        'Le glossaire doit être généré et validé avant d’exporter le support (règle produit).'
      );
    }

    const slides = Array.isArray(session.data?.support?.slides) ? session.data.support.slides : [];
    if (slides.length === 0) {
      throw httpError(400, 'Le support de présentation n’a pas encore été généré (étape Support).');
    }

    const { buffer, fileName } = await buildPptx(session);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.send(buffer);
  })
);

module.exports = router;
