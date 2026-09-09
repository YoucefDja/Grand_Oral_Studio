const express = require('express');
const mongoose = require('mongoose');
const Session = require('../models/Session');
const { buildStepPrompt, STEP_KEYS, STEP_LABELS } = require('../services/promptBuilder');
const { generateAnthropic, parseJsonStrict } = require('../services/anthropic');
const { generateDeepseek } = require('../services/deepseek');
const { verifierEtCorrigerProbleme } = require('../services/problemeVerification');
const { runVeille } = require('../services/veille');
const { buildPptx } = require('../services/pptx');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Toutes les routes de session exigent un utilisateur connecté ; chaque
// utilisateur n'accède qu'à ses propres sessions (owner).
router.use(requireAuth);

// Routage des providers selon l'étape IA :
//  - étapes génératives 1,2,4,5,6 → DeepSeek (deepseek-v4-flash, non-thinking)
//  - étape support          → Anthropic Claude (inchangée)
// L'étape « source » (3, veille manuelle) n'utilise PAS generate/:step.
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

function findSessionOr404(id, userId) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, 'Identifiant de session invalide.');
  }
  return Session.findOne({ _id: id, owner: userId });
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
  asyncHandler(async (req, res) => {
    const sessions = await Session.find({ owner: req.userId }).sort({ updatedAt: -1 }).lean();
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
      owner: req.userId,
      currentStep: 0,
    });
    res.status(201).json(session);
  })
);

// POST /api/sessions/ideas — suggestions de sujets (Grand Oral) pour un thème.
// DeepSeek génère plusieurs idées en rapport avec le thème choisi ; l'étudiant
// peut ensuite en sélectionner une (pré-remplit le sujet) ou saisir le sien.
router.post(
  '/ideas',
  asyncHandler(async (req, res) => {
    const theme = String(req.body?.theme || '').trim();
    if (!theme) {
      throw httpError(400, 'Choisissez un thème pour générer des idées de sujets.');
    }
    const nb = Math.min(Math.max(parseInt(req.body?.nb, 10) || 6, 3), 10);
    const lang = req.body?.lang === 'en' ? 'en' : 'fr';
    const langue = lang === 'en' ? 'English' : 'French';

    const system = [
      'Tu conçois des sujets pour le Grand Oral d’un étudiant ingénieur (CESI).',
      'À partir du thème choisi (et éventuellement du contexte de l’étudiant), propose des sujets',
      'percutants, originaux et réalisables, qui portent une vraie tension ou question à défendre.',
      'Chaque sujet est court (1 phrase), sous forme de question ou de sujet d’oral.',
      `Rédige les sujets en ${langue}.`,
      'Réponds UNIQUEMENT par un objet JSON : {"sujets":["…","…"]} — aucun commentaire, aucune balise.',
    ].join(' ');

    const user = JSON.stringify({
      theme,
      nombre: nb,
      contexte_etudiant: String(req.body?.contexte || '').trim().slice(0, 800) || null,
    });

    let sujets = [];
    try {
      const raw = await generateDeepseek(system, user);
      const parsed = parseJsonStrict(raw);
      sujets = Array.isArray(parsed?.sujets)
        ? parsed.sujets.map((s) => String(s).trim()).filter((s) => s.length >= 10)
        : [];
    } catch (err) {
      throw httpError(502, `Génération d’idées impossible (${err.message}). Réessayez.`);
    }
    if (sujets.length < 2) {
      throw httpError(502, 'Aucune idée exploitable générée pour ce thème. Réessayez.');
    }
    res.json({ sujets: sujets.slice(0, nb) });
  })
);

// GET /api/sessions/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');
    res.json(session);
  })
);

// PATCH /api/sessions/:id
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');

    const { titre, theme, contexte, currentStep } = req.body || {};
    if (titre !== undefined) session.titre = String(titre).trim();
    if (theme !== undefined) session.theme = String(theme);
    if (contexte !== undefined) session.contexte = String(contexte);
    if (currentStep !== undefined) {
      const step = Number(currentStep);
      if (!Number.isInteger(step) || step < 0 || step > STEP_KEYS.length) {
        throw httpError(400, `currentStep doit être un entier entre 0 et ${STEP_KEYS.length}.`);
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
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');
    await session.deleteOne();
    res.json({ ok: true, id: req.params.id });
  })
);

// POST /api/sessions/:id/generate/:step
// step = analyse | probleme | recherche | glossaire | plan | support
// (l'étape « source » — veille en ligne — est déclenchée par /source-veille)
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
    if (stepKey === 'source') {
      throw httpError(
        400,
        'L’étape « Source en ligne » ne se génère pas par IA : utilisez le bouton de récupération des articles.'
      );
    }

    const session = await findSessionOr404(req.params.id, req.userId);
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

    // Filet de qualité sur la problématique : les heuristiques déterministes
    // signalent structure / reformulation plate / hors-sujet lexical, puis un
    // second passage du modèle re-vérifie les 5 tests anti-dérive (méthodo
    // Armelle) et corrige les formulations défaillantes.
    if (stepKey === 'probleme') {
      parsed = await verifierEtCorrigerProbleme({ system, session, problemeGenere: parsed });
    }

    let regenereProbleme = false;
    if (stepKey === 'probleme') {
      // Régénération de la problématique : un contenu précédent existait peut-être.
      regenereProbleme = isNonEmptyObject(session.data && session.data.probleme);
      session.ligneDirectrice = String(parsed.ligne_directrice).trim();
      if (regenereProbleme) {
        // Les étapes 3 à 7 étaient bâties sur l'ancienne problématique : elles
        // doivent être re-générées (source, recherche, glossaire, plan, support).
        ['source', 'recherche', 'glossaire', 'plan', 'support'].forEach((k) => {
          if (session.data && session.data[k]) session.data[k] = {};
        });
      }
    }

    session.data[stepKey] = parsed;
    session.markModified('data');

    // Avance la progression si la génération est un pas en avant. Si la
    // problématique a été régénérée alors que le parcours était déjà avancé, on
    // rabat currentStep sur l'étape suivante pour forcer le recommencement des
    // étapes aval.
    const nextIndex = STEP_KEYS.indexOf(stepKey) + 1;
    session.currentStep = Math.max(session.currentStep || 0, nextIndex);
    if (regenereProbleme) {
      session.currentStep = Math.min(session.currentStep, nextIndex);
    }

    await session.save();
    res.json(session);
  })
);

// POST /api/sessions/:id/source-veille
// Étape « Source en ligne » : récupération MANUELLE (bouton) de 4 articles
// ciblés sur le thème + le sujet + la problématique de la session. Les articles
// retenus sont archivés dans l'onglet News puis référencés dans session.data.source.
router.post(
  '/:id/source-veille',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');

    const payload = await runVeille(session);
    session.data.source = payload;
    session.markModified('data');

    const nextIndex = STEP_KEYS.indexOf('source') + 1;
    session.currentStep = Math.max(session.currentStep || 0, nextIndex);

    await session.save();
    res.json(session);
  })
);

// POST /api/sessions/:id/skip-source
// L'étape « Source en ligne » est FACULTATIVE : l'étudiant peut la passer et
// continuer la préparation. La veille reste possible à tout moment ensuite.
router.post(
  '/:id/skip-source',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');

    session.data.source = {
      ...(session.data && session.data.source ? session.data.source : {}),
      skipped: true,
      skippedAt: new Date().toISOString(),
    };
    session.markModified('data');

    const nextIndex = STEP_KEYS.indexOf('source') + 1;
    session.currentStep = Math.max(session.currentStep || 0, nextIndex);

    await session.save();
    res.json(session);
  })
);

// POST /api/sessions/:id/choisir-probleme
// L'étudiant choisit, parmi les formulations générées à l'étape 2, celle qu'il
// défendra : met à jour "recommandation" (utilisée ensuite par promptBuilder
// pour ne réinjecter que cette formulation dans les étapes 3 à 6) et permet
// d'affiner la ligne directrice. Body : { formulation, ligneDirectrice? }.
router.post(
  '/:id/choisir-probleme',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');

    const probleme = session.data && session.data.probleme;
    const formulations = Array.isArray(probleme?.formulations) ? probleme.formulations : [];
    if (formulations.length === 0) {
      throw httpError(400, 'Aucune formulation à choisir : générez d’abord la problématique (étape 2).');
    }

    const formulation = String(req.body?.formulation || '').trim();
    const index = Number.isInteger(req.body?.index) ? req.body.index : -1;
    const retenue =
      formulations.find((f) => f && typeof f === 'object' && String(f.formulation || '').trim() === formulation) ??
      (index >= 0 && index < formulations.length ? formulations[index] : null);
    if (!retenue || typeof retenue !== 'object') {
      throw httpError(400, 'La formulation choisie ne correspond à aucune des formulations générées.');
    }

    const ancienneRecommandation = String(probleme.recommandation || '').trim();
    const nouvelleRecommandation = String(retenue.formulation || '').trim();
    const ancienneLD = String(probleme.ligne_directrice || '').trim();

    // La formulation retenue devient la référence pour toute la suite du parcours.
    probleme.recommandation = nouvelleRecommandation;
    probleme.justification_recommandation =
      [
        `Formulation choisie par l'étudiant.`,
        retenue.pourquoi_discutable ? `Pourquoi elle est discutable : ${retenue.pourquoi_discutable}` : '',
        retenue.pourquoi_bornee_par_le_sujet
          ? `Pourquoi elle reste bornée par le sujet : ${retenue.pourquoi_bornee_par_le_sujet}`
          : '',
      ]
        .filter(Boolean)
        .join(' ');

    // Ligne directrice éventuellement ajustée par l'étudiant après son choix.
    let nouvelleLD = ancienneLD;
    if (req.body?.ligneDirectrice !== undefined) {
      nouvelleLD = String(req.body.ligneDirectrice).trim();
      if (!nouvelleLD) {
        throw httpError(400, 'La ligne directrice ne peut pas être vide.');
      }
      probleme.ligne_directrice = nouvelleLD;
      session.ligneDirectrice = nouvelleLD;
    } else if (ancienneLD) {
      session.ligneDirectrice = ancienneLD;
    }

    // Si la formulation retenue OU la ligne directrice CHANGE, les étapes aval
    // (source → support) sont basées sur l'ancienne problématique / l'ancien
    // fil rouge : elles doivent être re-faites (elles ne sont plus valides).
    const changementProbleme = ancienneRecommandation && ancienneRecommandation !== nouvelleRecommandation;
    const changementLD = nouvelleLD && nouvelleLD !== ancienneLD;
    if (changementProbleme || changementLD) {
      ['source', 'recherche', 'glossaire', 'plan', 'support'].forEach((k) => {
        if (session.data && session.data[k]) session.data[k] = {};
      });
      const seuil = STEP_KEYS.indexOf('probleme') + 1; // bloque à l'étape « Source en ligne » (étape 3)
      session.currentStep = Math.min(session.currentStep || 0, seuil);
    }

    session.markModified('data');
    await session.save();
    res.json(session);
  })
);

// GET /api/sessions/:id/support-prompt
// Exporte un fichier .md complet à coller dans Claude (claude.ai) : la même
// méthodologie/schéma que l'app enverrait à l'API, afin de générer le support
// SANS consommer de tokens Claude. La réponse JSON de Claude peut ensuite être
// ré-importée via POST /api/sessions/:id/import-support.
router.get(
  '/:id/support-prompt',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');
    assertGlossaireValide(session, 'support');

    const { system, user } = await buildStepPrompt(session, 'support');
    const md = [
      '# Grand Oral Studio — Génération du support de présentation (étape 6)',
      '',
      "> Mode « sans consommation de tokens Claude » : collez l'INTÉGRALITÉ de ce document dans Claude (claude.ai), puis collez la réponse JSON reçue dans l'application (étape 6 → « Importer le JSON produit par Claude ») et téléchargez le .pptx. Le résultat est identique à la génération via l'API.",
      '',
      '---',
      '',
      '## INSTRUCTIONS À SUIVRE (méthodologie, glossaire, format de sortie)',
      '',
      system,
      '',
      '---',
      '',
      '## CONTEXTE ET DONNÉES DE L’ÉTUDIANT',
      '',
      user,
      '',
    ].join('\n');

    const fileName = 'support-etape-6-prompt-claude.md';
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.send(md);
  })
);

// POST /api/sessions/:id/import-support
// Ré-importe le JSON produit par Claude (mode sans tokens API) : valide la
// structure (tableau slides non vide), l'enregistre comme data.support et
// permet ensuite l'export .pptx sans appel à l'API Anthropic.
router.post(
  '/:id/import-support',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');
    assertGlossaireValide(session, 'support');

    const raw = String(req.body?.json || '').trim();
    if (!raw) {
      throw httpError(400, 'Collez le JSON produit par Claude avant de valider.');
    }
    const parsed = parseJsonStrict(raw);
    if (!Array.isArray(parsed?.slides) || parsed.slides.length === 0) {
      throw httpError(
        400,
        'Le JSON importé ne contient pas de tableau "slides" exploitable. Vérifiez la réponse de Claude (elle doit être un objet JSON avec une clé "slides").'
      );
    }

    session.data.support = parsed;
    session.markModified('data');
    session.currentStep = Math.max(session.currentStep || 0, STEP_KEYS.length);
    await session.save();
    res.json(session);
  })
);

// POST /api/sessions/:id/export-pptx
router.post(
  '/:id/export-pptx',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
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
