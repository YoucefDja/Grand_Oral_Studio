/**
 * Construction des prompts d'une étape de génération.
 *
 * Le prompt système est assemblé en concaténant les MethodologySection
 * pertinentes (appliesToSteps contient "all" ou le step demandé), triées par
 * `order`, puis les suppléments dynamiques (ligne directrice, glossaire) et
 * enfin le StepSchema du step.
 */
const MethodologySection = require('../models/MethodologySection');
const StepSchemaModel = require('../models/StepSchema');

const STEP_KEYS = ['analyse', 'probleme', 'recherche', 'glossaire', 'plan', 'support'];

const STEP_LABELS = {
  analyse: 'Analyse du sujet',
  probleme: 'Problématique',
  recherche: 'Recherche documentaire',
  glossaire: 'Glossaire et résumés des sources',
  plan: 'Plan détaillé',
  support: 'Support de présentation',
};

// La ligne directrice est formulée à l'étape "probleme", puis réinjectée à
// toutes les étapes suivantes pour garantir le fil conducteur.
const LINE_DIRECTRICE_STEPS = new Set(['recherche', 'glossaire', 'plan', 'support']);

// Données des étapes précédentes réinjectées dans le prompt utilisateur.
const STEP_DEPENDENCIES = {
  analyse: [],
  probleme: ['analyse'],
  recherche: ['analyse', 'probleme'],
  glossaire: ['probleme', 'recherche'],
  plan: ['probleme', 'glossaire'],
  support: ['probleme', 'plan', 'glossaire'],
};

/** Bloc "résultats d'une étape précédente" — ignoré si l'objet est vide. */
function dataBlock(label, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  const hasContent = Object.keys(obj).some((k) => {
    const v = obj[k];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return String(v).trim() !== '';
  });
  if (!hasContent) return '';
  return [
    '',
    `### Résultats de l'étape « ${label} » (déjà produits par l'étudiant)`,
    'Utilise-les comme socle : ne les contredis pas, appuie-toi dessus.',
    '```json',
    JSON.stringify(obj, null, 2),
    '```',
  ].join('\n');
}

async function buildStepPrompt(session, stepKey) {
  const sections = await MethodologySection.find({
    appliesToSteps: { $in: [stepKey, 'all'] },
  })
    .sort({ order: 1, sectionId: 1 })
    .lean();

  const parts = sections.map((s) => s.content).filter(Boolean);

  // Ligne directrice déjà établie à l'étape "probleme".
  const ligneDirectrice =
    (session.ligneDirectrice || '').trim() ||
    (session.data && session.data.probleme && session.data.probleme.ligne_directrice
      ? String(session.data.probleme.ligne_directrice).trim()
      : '');

  if (ligneDirectrice && LINE_DIRECTRICE_STEPS.has(stepKey)) {
    parts.push(
      `Ligne directrice déjà établie pour cette présentation (elle doit rester visible, nommée et renforcée dans le contenu que tu produis) :\n« ${ligneDirectrice} »`
    );
  }

  // Glossaire validé — injecté obligatoirement avant la génération du support.
  if (stepKey === 'support') {
    const glossaire = session.data && session.data.glossaire;
    const termes = Array.isArray(glossaire?.termes) ? glossaire.termes : [];
    const sources = Array.isArray(glossaire?.sources) ? glossaire.sources : [];
    if (termes.length || sources.length) {
      const bloc = ["Glossaire et résumés de sources validés par l'étudiant :"];
      if (sources.length) {
        bloc.push('', 'Sources retenues :');
        sources.forEach((s) => bloc.push(`- ${s.titre} : ${s.resume}`));
      }
      if (termes.length) {
        bloc.push('', 'Termes / acronymes autorisés :');
        termes.forEach((t) => bloc.push(`- ${t.terme} : ${t.definition}`));
      }
      bloc.push(
        '',
        "RÈGLE STRICTE : aucun acronyme ou terme technique absent de ce glossaire ne doit apparaître sur les slides ni dans les notes orateur. Si un terme nouveau semble nécessaire, formule-le autrement plutôt que de l'utiliser sans définition."
      );
      parts.push(bloc.join('\n'));
    }
  }

  // Schéma de sortie attendu pour l'étape.
  const stepDoc = await StepSchemaModel.findOne({ stepKey }).lean();
  if (!stepDoc) {
    const err = new Error(
      `Aucun StepSchema en base pour l'étape "${stepKey}". Lancez le script de seed (npm run seed).`
    );
    err.status = 500;
    throw err;
  }
  parts.push(
    `Format de sortie attendu pour l'étape « ${STEP_LABELS[stepKey] || stepKey} » :\n${stepDoc.jsonSchemaDescription}`
  );
  parts.push(
    'Tu réponds UNIQUEMENT avec un objet JSON valide correspondant exactement au format de sortie attendu : aucune balise markdown de code, aucun texte avant ou après le JSON.'
  );

  const system = parts.filter(Boolean).join('\n\n---\n\n').trim();

  // ---- Prompt utilisateur ----
  const userLines = [
    `Sujet du Grand Oral : « ${session.titre} »`,
    session.theme ? `Thème : ${session.theme}` : '',
    session.contexte
      ? `Contexte et expérience de l'étudiant :\n${session.contexte}`
      : "Contexte et expérience de l'étudiant : aucun contexte précis fourni. Signale-le si c'est bloquant, ou appuie-toi sur des exemples d'entreprises réelles et vérifiables.",
    '',
    `Étape en cours : « ${STEP_LABELS[stepKey] || stepKey} ». Produis la sortie attendue pour cette étape, en suivant strictement la méthodologie fournie ci-dessus.`,
  ];

  const deps = (STEP_DEPENDENCIES[stepKey] || []).map((key) =>
    dataBlock(STEP_LABELS[key], session.data && session.data[key])
  );

  const user = [...userLines, ...deps].filter((l) => l !== '' && l != null).join('\n');

  return { system, user };
}

module.exports = { buildStepPrompt, STEP_KEYS, STEP_LABELS };
