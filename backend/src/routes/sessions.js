const express = require('express');
const { randomUUID } = require('crypto');
const mongoose = require('mongoose');
const Session = require('../models/Session');
const MethodologySection = require('../models/MethodologySection');
const {
  buildStepPrompt,
  STEP_KEYS,
  STEP_LABELS,
  HIDDEN_STEPS,
  contratPourSuite,
} = require('../services/promptBuilder');
const { generateAnthropic, parseJsonStrict } = require('../services/anthropic');
const { generateDeepseek } = require('../services/deepseek');
const {
  verifierContrat,
  ciblerRegeneration,
  consigneRegeneration,
} = require('../services/contratVerification');
const { compresserSupport } = require('../services/compresseurTexte');
const { buildPptx } = require('../services/pptx');
const { buildChartePptxClaude } = require('../services/chartePptxClaude');
const { buildGammaPrompt } = require('../services/charteGamma');
const { buildClaudeDesignExport } = require('../services/charteClaudeDesign');
const {
  CONSIGNES_FOND_VULGARISATION,
  CONSIGNES_FORME_SUPPORT,
} = require('../services/consignesSupport');
const { assertConformiteSupport } = require('../services/conformiteSupport');
const {
  construireRapportVerification,
  assertVerificationExport,
  rendreRapportMarkdown,
  rendreEnteteVerification,
} = require('../services/verificationExport');
const {
  planifierCorrections,
  corrigerChamp,
  ecrireChemin,
} = require('../services/correctionPointsFaibles');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { APP_VERSION } = require('../config/version');
const { parseAndValidateContract } = require('../services/contratParsing');
const { appliquerContratPasseA } = require('../services/applicationContrat');
const {
  httpError,
  logGeneration,
  MESSAGES_ERREUR,
  erreurGenerationControlee,
} = require('../services/erreursGeneration');

const router = express.Router();

// Toutes les routes de session exigent un utilisateur connecté ; chaque
// utilisateur n'accède qu'à ses propres sessions (owner).
router.use(requireAuth);

// Identifiant de requête, pour corréler les logs serveur d'une même génération
// (utile quand un utilisateur signale « ça a échoué » sans autre détail).
router.use((req, _res, next) => {
  req.requestId = req.requestId || randomUUID();
  next();
});

// Routage des providers selon l'étape IA :
//  - étapes DeepSeek : parcours visible + recherche d'arrière-plan (deepseek-v4-flash, non-thinking)
//  - étape support  : Anthropic Claude (inchangée)
const DEEPSEEK_STEPS = [...STEP_KEYS.filter((k) => k !== 'support'), ...HIDDEN_STEPS];
const CLAUDE_STEPS = ['support'];

function getProviderForStep(step) {
  if (DEEPSEEK_STEPS.includes(step)) return 'deepseek';
  if (CLAUDE_STEPS.includes(step)) return 'claude';
  throw httpError(400, `Étape inconnue : ${step}`);
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

/**
 * Contrôles de cohérence minimale sur le JSON renvoyé par l'IA.
 *
 * Renvoie `true` si le contenu est exploitable pour l'étape, sinon lève une
 * erreur PORTANT UN CODE APPLICATIF — jamais un 502 : c'est
 * `erreurGenerationControlee` qui décide du statut HTTP final (422 pour un
 * contenu inexploitable/inexploitable, 500 pour un périmètre inattendu).
 */
function validateStepOutput(stepKey, parsed) {
  if (!isNonEmptyObject(parsed)) {
    throw httpError(
      422,
      `Le contenu généré pour l'étape « ${STEP_LABELS[stepKey]} » est vide ou inutilisable. Réessayez.`,
      'INVALID_CONTRACT_SCHEMA'
    );
  }
  if (stepKey === 'probleme') {
    // Passe A : contrat métier (plus de formulations candidates). Seuls les TROIS
    // champs qui portent la logique du sujet sont exigés ici : la question, la
    // tension et la justification. Tout le reste (mots-clés, cas d'entreprises,
    // ligne directrice, ouverture…) est un élément secondaire que la Passe B et
    // l'export construiront ou exigeront plus tard : l'exiger en « tout ou rien »
    // bloquait tout le parcours dès qu'une clé secondaire manquait.
    const bloquants = [];
    if (typeof parsed.problematique !== 'string' || !parsed.problematique.trim()) {
      bloquants.push('problematique');
    }
    if (typeof parsed.tension !== 'string' || !parsed.tension.trim()) {
      bloquants.push('tension');
    }
    if (typeof parsed.justificationProbleme !== 'string' || !parsed.justificationProbleme.trim()) {
      bloquants.push('justificationProbleme');
    }
    if (bloquants.length > 0) {
      const err = httpError(
        422,
        `Le contrat généré ne contient pas les éléments indispensables : ${bloquants.join(', ')}.`,
        'CORE_CONTRACT_FIELDS_MISSING'
      );
      err.champsManquants = bloquants;
      throw err;
    }
  }
  if (stepKey === 'glossaire') {
    const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
    const termes = Array.isArray(parsed.termes) ? parsed.termes : [];
    if (sources.length === 0 || termes.length === 0) {
      throw httpError(
        422,
        'Le glossaire généré doit contenir au moins une source résumée et un terme défini.',
        'INVALID_CONTRACT_SCHEMA'
      );
    }
  }
  if (stepKey === 'plan' && (!Array.isArray(parsed.sections) || parsed.sections.length === 0)) {
    throw httpError(422, 'Le plan généré ne contient aucune section exploitable.', 'INVALID_CONTRACT_SCHEMA');
  }
  if (stepKey === 'support') {
    if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      throw httpError(422, 'Le support généré ne contient aucune slide exploitable.', 'INVALID_CONTRACT_SCHEMA');
    }
  }
  return true;
}

/**
 * Diagnostic SERVEUR de la Passe A — jamais renvoyé à l'étudiant.
 *
 * Objectif : rendre le rejet observable en production sans fuite de données.
 * On ne journalise QUE des noms de clés et des booléens de présence — jamais le
 * contenu du sujet, de la réponse du modèle, des sources ou des secrets.
 *
 * @param {object} resultat sortie de `parseAndValidateContract`
 * @param {{ requestId: string, sessionId: string, dureeMs: number, appVersion: string }} contexte
 * @returns {object} bloc `contract_generation_diagnostic`
 */
function construireDiagnosticContrat(resultat, contexte = {}) {
  const diagnostic = (resultat && resultat.diagnostic) || {};
  const corePresence =
    (resultat && resultat.coreFieldsPresent) || {
      tension: false,
      problematique: false,
      justificationProbleme: false,
    };
  // Seuls les trois champs core qui portent la logique du sujet bloquent.
  const coreMissing = ['tension', 'problematique', 'justificationProbleme'].filter((c) => !corePresence[c]);
  const missingSecondaryFields = Array.isArray(resultat && resultat.missingSecondaryFields)
    ? resultat.missingSecondaryFields
    : [];

  return {
    stage: 'probleme',
    requestId: contexte.requestId,
    sessionId: contexte.sessionId,
    appVersion: contexte.appVersion || APP_VERSION,
    rawTopLevelKeys: Array.isArray(diagnostic.rawTopLevelKeys) ? diagnostic.rawTopLevelKeys : [],
    normalizedTopLevelKeys: Array.isArray(diagnostic.normalizedTopLevelKeys)
      ? diagnostic.normalizedTopLevelKeys
      : [],
    aliasUsed: Array.isArray(diagnostic.aliasUsed) ? diagnostic.aliasUsed : [],
    promotions: Array.isArray(diagnostic.promotions) ? diagnostic.promotions : [],
    corePresence,
    coreMissing,
    secondaryMissing: missingSecondaryFields,
    parseStatus: resultat && resultat.ok === false && resultat.type === 'INVALID_LLM_JSON' ? 'failed' : 'ok',
    schemaStatus: resultat && resultat.ok ? 'core_valid' : 'core_invalid',
    verificationStatus: 'pending',
    rejectionCode: null,
    dureeMs: contexte.dureeMs,
  };
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

/**
 * GATE PROBLÉMATIQUE — porte obligatoire entre Passe A et Passe B.
 *
 * Tant que l'étudiant n'a pas explicitement validé le contrat métier
 * (`data.contrat.valide === true`), aucune slide ne peut être produite ni
 * exportée : sinon on figerait 20 slides sur une problématique non relue.
 */
function assertContratValide(session, pourEtape) {
  const contrat = session.data && session.data.contrat;
  const question = contrat && typeof contrat.problematique === 'string' ? contrat.problematique.trim() : '';
  if (!question) {
    throw httpError(
      400,
      `L'étape « ${STEP_LABELS[pourEtape]} » exige un contrat métier généré (Passe A). Générez d'abord la problématique.`
    );
  }
  if (contrat.valide !== true) {
    throw httpError(
      400,
      "Le contrat métier doit être validé (Passe A) avant la génération du support. Validez ou éditez la problématique dans l'écran de validation."
    );
  }
}

/**
 * Produit la recherche documentaire en arrière-plan (sources, références
 * théoriques, exemples d'entreprises) et la stocke dans session.data.recherche.
 * L'étudiant ne voit jamais cette étape : elle alimente le plan et le glossaire.
 * Best-effort : en cas d'échec, on laisse data.recherche vide et on continue.
 */
async function genererRechercheArrierePlan(session) {
  try {
    const { system, user } = await buildStepPrompt(session, 'recherche');
    const raw = await generateDeepseek(system, user);
    const parsed = parseJsonStrict(raw);
    if (isNonEmptyObject(parsed)) {
      session.data.recherche = parsed;
      session.markModified('data');
    }
  } catch (err) {
    // Non bloquant : le plan et le glossaire restent générables sans recherche.
    // On journalise tout de même la cause (sans contenu métier) pour diagnostic.
    logGeneration({ etape: 'recherche', provider: 'deepseek', statut: 'ignore', code: err?.code || null });
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
    const { titre, theme } = req.body || {};
    if (!titre || !String(titre).trim()) {
      throw httpError(400, 'Le sujet (titre) est obligatoire pour créer une session.');
    }
    const session = await Session.create({
      titre: String(titre).trim(),
      theme: theme ? String(theme) : '',
      owner: req.userId,
      currentStep: 0,
      // « Créer la session et commencer » : le chrono de travail démarre ici.
      startedAt: new Date(),
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
    const nb = 3; // Nombre de suggestions demandées à l'IA : limité à 3 sujets.
    const lang = req.body?.lang === 'en' ? 'en' : 'fr';
    const langue = lang === 'en' ? 'English' : 'French';

    const system = [
      'Tu conçois des sujets pour le Grand Oral d’un étudiant ingénieur (CESI).',
      'À partir du thème choisi, propose des sujets percutants, originaux et réalisables,',
      'qui portent une vraie tension ou question à défendre.',
      'Chaque sujet est court (1 phrase), sous forme de question ou de sujet d’oral.',
      `Rédige les sujets en ${langue}.`,
      'Réponds UNIQUEMENT par un objet JSON : {"sujets":["…","…"]} — aucun commentaire, aucune balise.',
    ].join(' ');

    const user = JSON.stringify({
      theme,
      nombre: nb,
    });

    let sujets = [];
    const debut = Date.now();
    try {
      const raw = await generateDeepseek(system, user);
      const parsed = parseJsonStrict(raw);
      sujets = Array.isArray(parsed?.sujets)
        ? parsed.sujets.map((s) => String(s).trim()).filter((s) => s.length >= 10)
        : [];
    } catch (err) {
      throw erreurGenerationControlee(err, {
        requestId: req.requestId,
        sessionId: null,
        etape: 'ideas',
        provider: 'deepseek',
        dureeMs: Date.now() - debut,
      });
    }
    if (sujets.length < 2) {
      throw httpError(
        422,
        'Aucune idée exploitable générée pour ce thème. Réessayez.',
        'INVALID_LLM_JSON'
      );
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

    const { titre, theme, currentStep } = req.body || {};
    if (titre !== undefined) session.titre = String(titre).trim();
    if (theme !== undefined) session.theme = String(theme);
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

// POST /api/sessions/:id/start-chrono
// Lance (une seule fois) le compte à rebours d'une session de travail. Les
// nouvelles sessions démarrent le chrono à leur création ; ce endpoint sert aux
// sessions créées avant cette fonctionnalité. Idempotent : ne réinitialise
// jamais un chrono déjà lancé.
router.post(
  '/:id/start-chrono',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');
    if (!session.startedAt) {
      session.startedAt = new Date();
      await session.save();
    }
    res.json(session);
  })
);

// POST /api/sessions/:id/generate/:step
// step = analyse | probleme | plan | glossaire | support
//
// ROBUSTESSE (correctif 502) : le handler est intégralement encadré. Aucune
// erreur de génération ne remonte telle quelle — elle devient un couple
// (statut HTTP, code applicatif, message utilisateur simple) via
// `erreurGenerationControlee`. En particulier, un JSON LLM invalide ne peut
// plus produire un 502 : c'est un 422 `INVALID_LLM_JSON`. Et un échec
// n'écrase JAMAIS le contrat déjà validé dans la session.
router.post(
  '/:id/generate/:step',
  asyncHandler(async (req, res) => {
    const stepKey = String(req.params.step || '').trim().toLowerCase();
    const contexteLog = {
      requestId: req.requestId,
      sessionId: req.params.id,
      etape: stepKey,
      provider: null,
    };
    const debut = Date.now();
    // Diagnostic Passe A : renseigné dès le parsing, journalisé dans tous les cas
    // (succès comme échec) pour rendre le rejet observable en production.
    let diagnosticContrat = null;

    try {
      if (![...STEP_KEYS, ...HIDDEN_STEPS].includes(stepKey)) {
        throw httpError(
          400,
          `Étape inconnue "${stepKey}". Attendue : ${STEP_KEYS.join(' | ')}.`
        );
      }

      const session = await findSessionOr404(req.params.id, req.userId);
      if (!session) throw httpError(404, 'Session introuvable.');

      // Règle produit : contrat métier validé (Passe A) ET glossaire obligatoires
      // avant la Passe B (support).
      if (stepKey === 'support') {
        assertContratValide(session, stepKey);
        assertGlossaireValide(session, stepKey);
      }

      // La recherche documentaire n'est plus une étape visible : elle est produite
      // automatiquement en arrière-plan juste avant le plan, pour que le plan (puis
      // le glossaire) s'appuient sur des sources réelles. Un échec n'est pas
      // bloquant : le plan sera simplement généré sans socle documentaire.
      if (stepKey === 'plan' && !isNonEmptyObject(session.data && session.data.recherche)) {
        await genererRechercheArrierePlan(session);
      }

      const { system, user } = await buildStepPrompt(session, stepKey);

      // Sélection du provider : DeepSeek pour les étapes 1-5, Claude pour le support.
      const provider = getProviderForStep(stepKey);
      contexteLog.provider = provider;

      let parsed;
      if (provider === 'deepseek') {
        if (stepKey === 'probleme') {
          // PASSE A — mode JSON strict : le fournisseur ne peut plus encadrer sa
          // réponse de prose, et la température basse évite la variation créative
          // qui produisait le pseudo-JSON à guillemets simples.
          const raw = await generateDeepseek(system, user, { temperature: 0.2, jsonObject: true });
          contexteLog.taille = raw.length;
          const resultat = parseAndValidateContract(raw);
          // Diagnostic exploitable côté serveur : quelles clés sont réellement
          // reçues, lesquelles manquent. Aucun contenu métier n'est journalisé.
          diagnosticContrat = construireDiagnosticContrat(resultat, {
            requestId: req.requestId,
            sessionId: req.params.id,
            dureeMs: Date.now() - debut,
            appVersion: APP_VERSION,
          });
          if (!resultat.ok) {
            const code = resultat.type === 'INVALID_LLM_JSON' ? 'INVALID_LLM_JSON' : 'CORE_CONTRACT_FIELDS_MISSING';
            const err = httpError(422, 'Contenu inexploitable.', code, resultat.internalReason);
            err.internalReason = resultat.internalReason;
            // Diagnostic de schéma : quels champs bloquent, et lesquels manquent.
            err.coreFieldsPresent = resultat.coreFieldsPresent;
            err.champsManquants = resultat.manquants;
            // Inspection des clés reçues, en DÉVELOPPEMENT uniquement : jamais en
            // production, et jamais le contenu des valeurs.
            if (process.env.NODE_ENV !== 'production') {
              err.detailTechnique = [
                resultat.internalReason,
                `clés reçues : ${(resultat.diagnostic.rawTopLevelKeys || []).join(', ') || '(aucune)'}`,
              ].join(' | ');
            }
            throw err;
          }
          parsed = resultat.contract;
        } else {
          const raw = await generateDeepseek(system, user);
          contexteLog.taille = raw.length;
          parsed = parseJsonStrict(raw);
        }
      } else {
        parsed = await generateAnthropic(system, user);
      }
      validateStepOutput(stepKey, parsed);

      // Passe A : le contrat métier est vérifié, mais seuls les rejets qui
      // portent la LOGIQUE DU SUJET (question, tension, justification) bloquent
      // l'affichage. Les manques secondaires (cas d'entreprises, préconisations,
      // ouverture…) sont normalisés en amont et deviennent des avertissements :
      // l'étudiant voit et édite le contrat, la Passe B complétera ensuite.
      let diagnosticProbleme = null;
      if (stepKey === 'probleme') {
        const verification = verifierContrat({
          sujet: session.titre,
          theme: session.theme,
          contrat: parsed,
          mode: 'creation',
        });
        parsed.valide = verification.coreValide === true;
        parsed.verification = {
          valide: verification.valide,
          coreValide: verification.coreValide,
          rejets: verification.rejets,
          rejetsCore: verification.rejetsCore,
          rejetsSecondaires: verification.rejetsSecondaires,
          avertissements: verification.avertissements,
          observations: verification.observations,
        };
        if (!verification.coreValide) {
          parsed.champsARegenerer = ciblerRegeneration(verification.rejetsCore);
        }
        const completeness = parsed.completeness || {};
        diagnosticProbleme = {
          requestId: req.requestId,
          sessionId: req.params.id,
          stage: 'probleme',
          parsed: true,
          coreFieldsPresent: {
            tension: typeof parsed.tension === 'string' && parsed.tension.trim() !== '',
            problematique: typeof parsed.problematique === 'string' && parsed.problematique.trim() !== '',
            justificationProbleme:
              typeof parsed.justificationProbleme === 'string' && parsed.justificationProbleme.trim() !== '',
          },
          missingSecondaryFields: Array.isArray(completeness.missingSecondaryFields)
            ? completeness.missingSecondaryFields
            : [],
          validationOutcome: verification.coreValide ? 'accepted' : 'rejected_core',
        };

        // La problématique existe mais les règles métier la refusent : c'est un
        // rejet distinct d'un core absent, et l'étudiant doit pouvoir le savoir.
        if (!verification.coreValide) {
          const motif = (verification.rejetsCore[0] && verification.rejetsCore[0].code) || 'probleme_qualite';
          const err = httpError(
            422,
            'La problématique générée doit être reformulée pour être exploitable. Réessayez.',
            'PROBLEMATIC_QUALITY_REJECTED'
          );
          err.detailTechnique = `règles de fond : ${(verification.rejetsCore || [])
            .map((r) => r.code)
            .join(', ')}`;
          err.diagnosticContrat = {
            ...(diagnosticContrat || {}),
            verificationStatus: 'rejected',
            rejectionCode: motif,
          };
          throw err;
        }

        if (diagnosticContrat) {
          diagnosticContrat.verificationStatus = 'accepted';
          diagnosticContrat.rejectionCode = null;
        }
      }

      // Passe B : le compresseur de texte passe AVANT le stockage et l'export. Le
      // support doit être concis par construction (fragments nominaux, une idée
      // par puce) : les phrases complètes et formules IA migrent dans les notes du
      // présentateur au lieu d'être supprimées silencieusement.
      if (stepKey === 'support') {
        const { support: compresse, rapport } = compresserSupport(parsed);
        parsed = compresse;
        parsed.rapport_compression = rapport;
      }

      // Passe A : le contrat est stocké dans data.contrat et sert de source unique
      // à toutes les étapes aval. Il n'est PAS validé d'office : c'est l'étudiant
      // qui pose `valide: true` (ou qui édite puis valide) à l'écran de validation.
      let regenereProbleme = false;
      if (stepKey === 'probleme') {
        // L'écriture du contrat est isolée dans un module testable : elle n'a lieu
        // qu'ici, donc APRÈS un parsing et une validation réussis. Un échec en
        // amont laisse le contrat précédemment validé strictement intact.
        ({ regenere: regenereProbleme } = appliquerContratPasseA(
          session,
          parsed,
          isNonEmptyObject
        ));
      } else {
        session.data[stepKey] = parsed;
      }
      session.markModified('data');

      // Avance la progression si la génération est un pas en avant. Si le contrat
      // a été régénéré alors que le parcours était déjà avancé, on rabat
      // currentStep sur l'étape suivante pour forcer le recommencement des étapes
      // aval (la Passe B repartira du contrat revalidé).
      const nextIndex = STEP_KEYS.indexOf(stepKey) + 1;
      session.currentStep = Math.max(session.currentStep || 0, nextIndex);
      if (stepKey === 'probleme' && regenereProbleme) {
        session.currentStep = Math.min(session.currentStep, nextIndex);
      }

      await session.save();
      logGeneration({
        ...contexteLog,
        dureeMs: Date.now() - debut,
        statut: 200,
        ...(diagnosticProbleme || {}),
      });
      // La Passe A invalide : on renvoie le diagnostic au front pour l'écran de
      // validation (l'étudiant voit les critères rouges et peut régénérer).
      if (stepKey === 'probleme' && parsed.valide !== true) {
        return res.json({ session, verification: parsed.verification || null });
      }
      return res.json(session);
    } catch (err) {
      // Point de sortie UNIQUE des erreurs de génération : tout devient contrôlé.
      // Aucune mutation de la session n'a été persistée avant l'échec, donc un
      // contrat précédemment validé reste intact.
      const diagErreur =
        err && err.diagnosticContrat
          ? { ...err.diagnosticContrat, dureeMs: Date.now() - debut, requestId: req.requestId, sessionId: req.params.id }
          : stepKey === 'probleme' && diagnosticContrat
            ? {
                ...diagnosticContrat,
                dureeMs: Date.now() - debut,
                requestId: req.requestId,
                sessionId: req.params.id,
                verificationStatus:
                  err && err.code === 'PROBLEMATIC_QUALITY_REJECTED' ? 'rejected' : diagnosticContrat.verificationStatus,
              }
            : null;
      throw erreurGenerationControlee(err, {
        ...contexteLog,
        dureeMs: Date.now() - debut,
        // Diagnostic Passe A quand le schéma core est en défaut : on journalise
        // précisément les champs bloquants, jamais exposés à l'étudiant.
        ...(stepKey === 'probleme'
          ? {
              stage: 'probleme',
              parsed: err && err.code !== 'INVALID_LLM_JSON',
              coreFieldsPresent: err && err.coreFieldsPresent ? err.coreFieldsPresent : undefined,
              champsManquants: err && err.champsManquants ? err.champsManquants : undefined,
              validationOutcome:
                err && err.code === 'PROBLEMATIC_QUALITY_REJECTED'
                  ? 'rejected_core'
                  : err && err.code === 'CORE_CONTRACT_FIELDS_MISSING'
                    ? 'rejected_core'
                    : undefined,
              diagnosticContrat: diagErreur,
            }
          : {}),
      });
    }
  })
);

// POST /api/sessions/:id/valider-contrat
// GATE PROBLÉMATIQUE (Passe A → Passe B). L'étudiant valide — éventuellement
// après édition — la tension et la problématique du contrat. On re-vérifie le
// contrat édité avec les mêmes règles bloquantes : impossible de forcer le
// passage avec une question molle. Body : { tension?, problematique?,
// justificationProbleme?, ligneDirectrice?, ouverture? }.
router.post(
  '/:id/valider-contrat',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');

    const contrat = session.data && session.data.contrat;
    if (!isNonEmptyObject(contrat)) {
      throw httpError(400, 'Aucun contrat à valider : générez d’abord la problématique (Passe A).');
    }

    // Édition : on ne laisse toucher qu'aux champs de fond éditables, jamais aux
    // mots-clés ni aux cas d'entreprises (qui viennent du .md et des sources).
    const champsEditables = ['tension', 'problematique', 'justificationProbleme', 'ligneDirectrice', 'ouverture'];
    champsEditables.forEach((champ) => {
      if (req.body && req.body[champ] !== undefined) {
        contrat[champ] = String(req.body[champ] || '').trim();
      }
    });

    const verification = verifierContrat({
      sujet: session.titre,
      theme: session.theme,
      contrat,
      // Validation explicite : on repasse en mode STRICT. À ce stade l'étudiant
      // a vu le contrat et peut l'éditer ; on refuse une question molle, une
      // copie du sujet ou un décrochage. La tolérance de la création ne joue
      // que sur la première génération.
      mode: 'regeneration',
    });
    contrat.verification = {
      valide: verification.valide,
      coreValide: verification.coreValide,
      rejets: verification.rejets,
      rejetsCore: verification.rejetsCore,
      rejetsSecondaires: verification.rejetsSecondaires,
      avertissements: verification.avertissements,
      observations: verification.observations,
    };

    if (!verification.valide) {
      contrat.valide = false;
      contrat.champsARegenerer = ciblerRegeneration(verification.rejets);
      session.markModified('data');
      await session.save();
      return res.status(422).json({
        session,
        verification: contrat.verification,
        message: 'Contrat refusé : la problématique ne passe pas encore les règles de fond.',
      });
    }

    // Contrat validé : la Passe B peut démarrer.
    contrat.valide = true;
    delete contrat.champsARegenerer;
    if (contrat.ligneDirectrice) session.ligneDirectrice = contrat.ligneDirectrice;

    session.markModified('data');
    await session.save();
    res.json(session);
  })
);

// POST /api/sessions/:id/regenerer-contrat
// Régénération CIBLÉE après rejet : on ne redemande au modèle QUE la tension, la
// problématique et la justification (via consigneRegeneration). Les mots-clés, le
// contexte et les cas d'entreprises déjà produits sont conservés MOT POUR MOT.
router.post(
  '/:id/regenerer-contrat',
  asyncHandler(async (req, res) => {
    const contexteLog = {
      requestId: req.requestId,
      sessionId: req.params.id,
      etape: 'probleme',
      provider: 'deepseek',
    };
    const debut = Date.now();
    let session;
    let contrat;
    try {
      session = await findSessionOr404(req.params.id, req.userId);
      if (!session) throw httpError(404, 'Session introuvable.');

      contrat = session.data && session.data.contrat;
      if (!isNonEmptyObject(contrat)) {
        throw httpError(400, 'Aucun contrat à régénérer : générez d’abord la problématique (Passe A).');
      }

      const rejets = Array.isArray(contrat.verification?.rejets) ? contrat.verification.rejets : [];
      const champs = ciblerRegeneration(rejets);

      const { system, user } = await buildStepPrompt(session, 'probleme');
      const consigne = consigneRegeneration(rejets, champs.length ? champs : ['tension', 'problematique', 'justificationProbleme']);
      const userRegen = [
        user,
        '',
        '---',
        '',
        "### RÉGÉNÉRATION CIBLÉE — le contrat actuel vient d'être refusé",
        consigne,
        '',
        'Contrat actuel (conserve les champs non listés MOT POUR MOT) :',
        '```json',
        JSON.stringify(contratPourSuite(contrat), null, 2),
        '```',
        '',
        'Renvoie le contrat COMPLET au même format JSON, avec uniquement les champs listés corrigés.',
      ].join('\n');

      // Même mode JSON strict qu'en Passe A : la régénération ciblée ne doit pas
      // réintroduire le pseudo-JSON à guillemets simples.
      const raw = await generateDeepseek(system, userRegen, { temperature: 0.2, jsonObject: true });
      contexteLog.taille = raw.length;
      const resultat = parseAndValidateContract(raw);
      if (!resultat.ok) {
        const err = httpError(422, 'Contenu inexploitable.', resultat.type, resultat.internalReason);
        err.internalReason = resultat.internalReason;
        throw err;
      }
      const parsed = resultat.contract;
      validateStepOutput('probleme', parsed);

      // Fusion : on ne remplace QUE les champs ciblés, le reste est intouchable.
      const champsCibles = champs.length ? champs : ['tension', 'problematique', 'justificationProbleme'];
      champsCibles.forEach((champ) => {
        if (parsed[champ] !== undefined) contrat[champ] = parsed[champ];
      });

      const verification = verifierContrat({
        sujet: session.titre,
        theme: session.theme,
        contrat,
        mode: 'regeneration',
      });
      contrat.valide = false; // l'étudiant doit (re)valider explicitement
      contrat.champsARegenerer = ciblerRegeneration(verification.rejets);
      contrat.verification = {
        valide: verification.valide,
        coreValide: verification.coreValide,
        rejets: verification.rejets,
        rejetsCore: verification.rejetsCore,
        rejetsSecondaires: verification.rejetsSecondaires,
        avertissements: verification.avertissements,
        observations: verification.observations,
      };

      session.markModified('data');
      await session.save();
      logGeneration({ ...contexteLog, dureeMs: Date.now() - debut, statut: 200 });
      return res.json({ session, verification: contrat.verification });
    } catch (err) {
      // Un échec de régénération ne doit pas détruire le contrat existant : la
      // fusion n'a lieu qu'APRÈS un parsing réussi, et rien n'est persisté ici.
      throw erreurGenerationControlee(err, {
        ...contexteLog,
        dureeMs: Date.now() - debut,
      });
    }
  })
);

// GET /api/sessions/:id/support-pptx-prompt
// Exporte un fichier .md destiné à Claude Desktop : ce document demande à
// Claude de fabriquer DIRECTEMENT le .pptx. Il contient donc, en plus de la
// méthodologie et du schéma de contenu, la charte visuelle complète
// (chartePptxClaude) que Claude doit appliquer lui-même.
router.get(
  '/:id/support-pptx-prompt',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');
    assertContratValide(session, 'support');
    assertGlossaireValide(session, 'support');

    // VÉRIFICATION SYSTÉMATIQUE AVANT EXPORT : parcourt les 14 critères de la
    // grille du jury, bloque l'export si le support n'est pas conforme, et
    // renvoie le rapport (joint au fichier exporté pour en garder la trace).
    const rapport = await assertVerificationExport(session);

    const { system, user } = await buildStepPrompt(session, 'support', {
      pourPptxClaude: true,
    });
    const md = [
      rendreEnteteVerification(rapport),
      '# Grand Oral Studio — Génération DIRECTE du .pptx par Claude Desktop',
      '',
      "> Mode « Claude Desktop » : joins ce document à une conversation Claude puis demande-lui de produire le .pptx. Claude fabrique lui-même le fichier PowerPoint en appliquant la charte visuelle décrite en fin de document — aucun réimport dans l'application n'est nécessaire.",
      '',
      '---',
      '',
      '## CE QUE TU DOIS PRODUIRE',
      '',
      "Tu produis un fichier PowerPoint (.pptx) binaire téléchargeable, prêt à présenter devant un jury, à partir du contenu ci-dessous. N'écris pas un JSON, n'écris pas un texte : fabrique le fichier .pptx lui-même (compétence PowerPoint / python-pptx).",
      "Le contenu des slides (titres, types, puces, visuels, notes orateur) suit la structure narrative et le format décrits dans les instructions ci-après : ce sont les données à mettre en forme. La mise en page, elle, est décrite dans la section « CHARTE VISUELLE ET MISE EN PAGE » en fin de document — applique-la à la lettre.",
      '',
      '---',
      '',
      '## INSTRUCTIONS À SUIVRE (méthodologie, glossaire, structure, format du contenu)',
      '',
      system,
      '',
      '---',
      '',
      CONSIGNES_FOND_VULGARISATION,
      '',
      '---',
      '',
      CONSIGNES_FORME_SUPPORT,
      '',
      '---',
      '',
      '## CONTEXTE ET DONNÉES DE L’ÉTUDIANT',
      '',
      user,
      '',
      '---',
      '',
      buildChartePptxClaude(),
      '',
    ].join('\n');

    const safeTitre = session.titre.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    const safeTheme = (session.theme || 'Sans_theme').replace(/[^a-z0-9]/gi, '_').substring(0, 20);
    const fileName = `Grand-Oral-${safeTitre}-${safeTheme}-support-claude.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.send(md);
  })
);

// GET /api/sessions/:id/support-gamma-prompt
// Exporte un fichier .md destiné à Gamma : l'étudiant le colle dans Gamma
// (mode « Coller du texte ») pour obtenir directement sa présentation.
// Comme Gamma ne fabrique pas de .pptx, ce document contient à la fois les
// consignes de fond (vulgarisation managériale, sans jargon technique), la
// charte visuelle CESI transposée à Gamma, et le squelette de texte à coller.
router.get(
  '/:id/support-gamma-prompt',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');
    assertGlossaireValide(session, 'support');

    // VÉRIFICATION SYSTÉMATIQUE AVANT EXPORT (grille CESI complète).
    const rapport = await assertVerificationExport(session);

    const { system, user } = await buildStepPrompt(session, 'support');
    const md = [
      rendreEnteteVerification(rapport),
      '# Grand Oral Studio — Génération du support dans Gamma',
      '',
      '> Colle ce document dans un nouveau chat Gamma (mode « Coller du texte »), puis applique la charte visuelle décrite plus bas. Gamma génère la présentation ; aucun réimport dans l\'application n\'est nécessaire.',
      '',
      '---',
      '',
      '## CE QUE TU DOIS PRODUIRE',
      '',
      "Tu génères une présentation de Grand Oral CESI prête à présenter devant un jury, à partir du contenu ci-dessous. Tu appliques à la lettre : la structure narrative, la posture de fond (vulgarisation managériale, sans jargon technique), les contraintes de forme, puis la charte visuelle Gamma.",
      '',
      '---',
      '',
      '## INSTRUCTIONS À SUIVRE (méthodologie, glossaire, structure, format du contenu)',
      '',
      system,
      '',
      '---',
      '',
      CONSIGNES_FOND_VULGARISATION,
      '',
      '---',
      '',
      CONSIGNES_FORME_SUPPORT,
      '',
      '---',
      '',
      '## CONTEXTE ET DONNÉES DE L\'ÉTUDIANT',
      '',
      user,
      '',
      '---',
      '',
      buildGammaPrompt(),
      '',
    ].join('\n');

    const safeTitre = session.titre.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    const safeTheme = (session.theme || 'Sans_theme').replace(/[^a-z0-9]/gi, '_').substring(0, 20);
    const fileName = `Grand-Oral-${safeTitre}-${safeTheme}-support-gamma.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.send(md);
  })
);

// GET /api/sessions/:id/support-claude-design-prompt
// Exporte un fichier .md AUTO-SUFFISANT destiné à Claude Design. Contrairement
// aux deux exports précédents, ce document ne suppose AUCUN contexte externe :
// Claude Design n'a accès ni aux Projets Claude de l'étudiant, ni à ses
// instructions, ni à ses diaporamas exemples. Le document embarque donc lui-même
// la mission, le ton et le vocabulaire, la structure slide par slide, le contenu
// déjà généré (analyse, plan, glossaire, problématique) et des exemples de
// style réels. Le bloc de style est relu depuis la base (section
// `style_support`), jamais dupliqué en dur.
router.get(
  '/:id/support-claude-design-prompt',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');
    assertGlossaireValide(session, 'support');

    // VÉRIFICATION SYSTÉMATIQUE AVANT EXPORT (grille CESI complète).
    const rapport = await assertVerificationExport(session);

    // Source de style et charte visuelle : sections en base, éditables en
    // admin, partagées avec les prompts système. Si elles sont absentes, c'est
    // que le seed n'a pas été relancé après leur ajout.
    const sections = await MethodologySection.find({
      sectionId: { $in: ['style_support', 'charte_visuelle_support'] },
    }).lean();
    const styleSection = sections.find((s) => s.sectionId === 'style_support');
    const charteSection = sections.find((s) => s.sectionId === 'charte_visuelle_support');
    const manquantes = [];
    if (!styleSection || !styleSection.content) manquantes.push('style_support');
    if (!charteSection || !charteSection.content) manquantes.push('charte_visuelle_support');
    if (manquantes.length) {
      throw httpError(
        500,
        `Bloc(s) « ${manquantes.join(' », « ')} » absent(s) de la base. Lancez le script de seed (npm run seed) puis relancez l'export.`
      );
    }

    const data = session.data || {};
    const contrat = data.contrat || {};
    const problematique = String(contrat.problematique || '').trim();
    const ligneDirectrice = String(session.ligneDirectrice || contrat.ligneDirectrice || '').trim();

    const md = [
      rendreEnteteVerification(rapport),
      buildClaudeDesignExport({
        session,
        analyse: JSON.stringify(data.analyse || {}, null, 2),
        plan: JSON.stringify(data.plan || {}, null, 2),
        glossaire: JSON.stringify(data.glossaire || {}, null, 2),
        problematique,
        ligneDirectrice,
        styleSupport: styleSection.content,
        charteVisuelle: charteSection.content,
      }),
    ].join('\n');

    const safeTitre = session.titre.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    const safeTheme = (session.theme || 'Sans_theme').replace(/[^a-z0-9]/gi, '_').substring(0, 20);
    const fileName = `Grand-Oral-${safeTitre}-${safeTheme}-claude-design.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.send(md);
  })
);

// GET /api/sessions/:id/conformite-rapport
// Rapport de vérification avant export, en JSON : parcourt les 14 critères de
// la grille CESI, donne pour chacun un statut et un score, liste les points
// faibles (fil rouge : ligne directrice et problématique) et indique si
// l'export est autorisé. Sert à l'affichage dans l'interface, AVANT toute
// exportation de fichier Markdown.
router.get(
  '/:id/conformite-rapport',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');
    const rapport = await construireRapportVerification(session);
    res.json(rapport);
  })
);

// GET /api/sessions/:id/support-conformite-rapport
// Même rapport, en fichier Markdown téléchargeable, pour conserver une trace
// détaillée de la vérification critère par critère.
router.get(
  '/:id/support-conformite-rapport',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');
    const rapport = await construireRapportVerification(session);
    const md = rendreRapportMarkdown(rapport);

    const safeTitre = session.titre.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    const safeTheme = (session.theme || 'Sans_theme').replace(/[^a-z0-9]/gi, '_').substring(0, 20);
    const fileName = `Grand-Oral-${safeTitre}-${safeTheme}-rapport-verification.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.send(md);
  })
);

// POST /api/sessions/:id/corriger-points-faibles
// Le rapport de vérification juge les INTRANTS du Markdown et liste les points
// faibles. Cette route les rend corrigeables EN PLACE :
//  - sans body       → renvoie le plan de correction (quels champs, quels points faibles) ;
//  - body { champ }  → DeepSeek réécrit CE champ seulement et renvoie une
//                      proposition « avant / après », SANS RIEN ÉCRIRE en base ;
//  - body { champ, appliquer: true } → la proposition est écrite en base, le
//                      champ est marqué modifié et les Markdown sont donc
//                      renouvelés au prochain export.
// Les étapes aval ne sont jamais invalidées : seule la valeur du champ change.
router.post(
  '/:id/corriger-points-faibles',
  asyncHandler(async (req, res) => {
    const session = await findSessionOr404(req.params.id, req.userId);
    if (!session) throw httpError(404, 'Session introuvable.');

    const rapport = await construireRapportVerification(session);
    const etapeDemandee = String(req.body?.etape || '').trim();
    const cheminDemande = String(req.body?.chemin || '').trim();

    // 1) Aucun champ visé : on renvoie le plan de correction.
    if (!etapeDemandee || !cheminDemande) {
      const corrections = planifierCorrections(rapport.pointsFaibles);
      return res.json({
        rapport,
        corrections,
        // Points faibles qu'aucune règle automatique ne sait réécrire (critères
        // oraux, par exemple) : ils restent affichés, sans promesse de correction.
        nonCorrigeables: rapport.pointsFaibles.filter((pf) => {
          return !corrections.some((c) => c.codes.includes(pf.code));
        }),
      });
    }

    // 2) Un champ est visé : on vérifie qu'il correspond bien à un lot planifié
    // (on ne laisse pas le client réécrire un champ arbitraire de la session).
    const corrections = planifierCorrections(rapport.pointsFaibles);
    const lot = corrections.find(
      (c) => c.etape === etapeDemandee && c.chemin === cheminDemande
    );
    if (!lot) {
      throw httpError(
        400,
        `Aucun point faible du rapport ne porte sur le champ « ${cheminDemande} » de l'étape « ${etapeDemandee} ». Relance la vérification avant export.`
      );
    }

    const proposition = await corrigerChamp({
      session,
      etape: lot.etape,
      chemin: lot.chemin,
      pointsFaibles: lot.codes.map((code, i) => ({ code, message: lot.messages[i] })),
    });

    // 3) Prévisualisation seule : rien n'est écrit tant que l'étudiant n'a pas
    // validé explicitement (appliquer: true).
    if (req.body?.appliquer !== true) {
      return res.json({
        applique: false,
        etape: lot.etape,
        chemin: lot.chemin,
        libelle: lot.libelle,
        codes: lot.codes,
        avant: proposition.avant,
        apres: proposition.apres,
      });
    }

    // 4) Validation : la correction ne doit pas vider le champ (le Markdown se
    // dégraderait au lieu de s'améliorer).
    const vide =
      proposition.apres === undefined ||
      proposition.apres === null ||
      (typeof proposition.apres === 'string' && !proposition.apres.trim()) ||
      (Array.isArray(proposition.apres) && proposition.apres.length === 0);
    if (vide) {
      throw httpError(
        422,
        `La correction proposée pour « ${cheminDemande} » est vide : elle n'a pas été appliquée. Réessayez ou corrige le champ à la main dans l'étape concernée.`,
        'INVALID_LLM_JSON'
      );
    }

    ecrireChemin(session.data[lot.etape], lot.chemin, proposition.apres);
    session.markModified('data');
    // Le fil rouge vit aussi à la racine de la session : on le tient à jour.
    if (lot.etape === 'contrat' && lot.chemin === 'ligneDirectrice') {
      session.ligneDirectrice = String(proposition.apres).trim();
    }
    await session.save();

    // Rapport recalculé après correction : l'étudiant voit immédiatement le
    // critère repasser au vert, sans relancer la vérification à la main.
    const rapportApres = await construireRapportVerification(session);
    res.json({
      applique: true,
      etape: lot.etape,
      chemin: lot.chemin,
      avant: proposition.avant,
      apres: proposition.apres,
      session,
      rapport: rapportApres,
    });
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

    // GATE PROBLÉMATIQUE : pas d'export tant que le contrat (Passe A) n'est pas
    // validé — sinon on exporterait 20 slides bâties sur une question non relue.
    assertContratValide(session, 'support');

    const slides = Array.isArray(session.data?.support?.slides) ? session.data.support.slides : [];
    if (slides.length === 0) {
      throw httpError(400, 'Le support de présentation n’a pas encore été généré (étape Support).');
    }

    // Règle produit : le support exporté doit matérialiser les attendus
    // structurels de la grille d'évaluation du jury (slide problématique,
    // benchmark d'entreprise, données chiffrées sourcées, ouverture, visuels…).
    // Un manque bloque l'export avec la liste précise des points à corriger.
    assertConformiteSupport(session);

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
