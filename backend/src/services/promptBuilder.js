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
const { getThemeVocabulary } = require('./vocabulaire');

const STEP_KEYS = ['analyse', 'probleme', 'source', 'recherche', 'glossaire', 'plan', 'support'];

// Étapes où la « base de vocabulaire du thème » est réinjectée : l'analyse
// (qui fixe les mots-clés) et le glossaire (qui fixe les termes réutilisables).
// Aux autres étapes, on s'appuie sur les résultats de la session en cours.
const VOCAB_REUSE_STEPS = new Set(['analyse', 'glossaire']);

const STEP_LABELS = {
  analyse: 'Analyse du sujet',
  probleme: 'Problématique',
  source: 'Source en ligne',
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

/** Bloc "vocabulaire habituel du thème" — base de connaissance des sessions passées. */
function vocabBlock(theme, vocab) {
  const entries = vocab.map((v) => `- ${v.terme}${v.definition ? ` : ${v.definition}` : ''}`);
  return [
    `Vocabulaire habituel du thème « ${theme} » — base de connaissance issue des travaux précédents de l'étudiant sur ce même thème :`,
    ...entries,
    '',
    "Règles d'utilisation (bon sens) :",
    '- Réutilise ce vocabulaire chaque fois qu’il est pertinent pour le sujet traité : privilégie ces termes habituels aux synonymes que tu inventerais, afin d’assurer une continuité entre les différents sujets de ce même thème.',
    '- Cette base n’est ni exhaustive ni obligatoire : tu peux toujours introduire de nouveaux termes réellement nécessaires au nouveau sujet (recherches supplémentaires comprises).',
    '- Écarte tout terme de la base qui n’a rien à voir avec le sujet : ne l’inclus que s’il sert réellement à traiter ce sujet-ci.',
  ].join('\n');
}

/**
 * Structure narrative imposée au support (étape 6). La problématique n'est pas
 * dévoilée d'emblée : le diaporama y mène (contexte & mots-clés → enjeux), la
 * pose sur une slide dédiée, puis chaque slide qui suit sert à y répondre sans
 * sortir du sujet. Les sources sont citées sous les chiffres/exemples, sans
 * slide « Sources » dédiée.
 */
const SUPPORT_STRUCTURE = `
### Structure narrative du support de présentation — à appliquer STRICTEMENT
Le .pptx ajoute automatiquement la page de titre (logo, école, candidat, sujet) : tu ne produis donc PAS de slide de titre.
Chaque slide doit porter un "type" parmi : contexte | enjeux | problematique | existant | solutions | donnees | exemple_entreprise | conclusion.

Ordre impératif des slides :
1. « Contexte du sujet & mots-clés » (type contexte) : pourquoi ce sujet compte aujourd'hui ; présente les mots-clés du sujet avec leur définition courte (issus de l'analyse) et 1 à 2 chiffres clés actuels.
2. « Enjeux » (type enjeux) : les enjeux TOHEE directement au cœur du sujet — pas un inventaire.
3. UNE slide dédiée « Problématique » (type problematique) : la tension sous-jacente, puis la question formulée en une phrase et mise en avant.
   RÈGLE : ne formule JAMAIS la problématique avant cette slide ; les slides précédentes ne font que préparer sa venue.
4. À partir de cette slide et jusqu'à la fin, chaque slide doit faire progresser la réponse à CETTE problématique, sans jamais sortir du sujet :
   - l'existant / l'analyse (type existant), illustré si utile par des slides données ou exemples d'entreprises réelles (types donnees / exemple_entreprise) ;
   - les solutions / préconisations (type solutions), posture consultant contextualisée par la taille d'entreprise.
5. « Conclusion » (type conclusion) : synthèse qui répond explicitement à la problématique, rappelle la ligne directrice, puis une ouverture prospective (question) sans y répondre.

Provenance des chiffres, données et exemples rapportés du web : dès qu'une slide en présente un, ajoute juste en dessous une ligne courte commençant par « Source : » en citant l'une des sources validées fournies plus haut (jamais une source inventée). S'il n'existe pas de source correspondante, présente le chiffre comme « à vérifier » plutôt que de l'affirmer.`.trim();

/**
 * Réduit l'objet "probleme" (2 à 4 formulations) à la SEULE formulation retenue
 * pour les étapes suivantes : celle pointée par `recommandation` (choisie par
 * l'étudiant à l'étape 2). Retombe sur la première formulation si le marqueur
 * est absent ou incohérent, et conserve la ligne directrice associée.
 */
function problemeRetenuPourSuite(probleme) {
  if (!probleme || typeof probleme !== 'object' || Array.isArray(probleme)) return probleme;
  const formulations = Array.isArray(probleme.formulations) ? probleme.formulations : [];
  if (formulations.length === 0) return probleme;

  const recommandation = String(probleme.recommandation || '').trim();
  const retenue =
    formulations.find(
      (f) => f && typeof f === 'object' && String(f.formulation || '').trim() === recommandation
    ) || formulations[0];

  return {
    ligne_directrice:
      typeof probleme.ligne_directrice === 'string' ? probleme.ligne_directrice : '',
    formulation_retenue: retenue,
  };
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

  // Base de vocabulaire du thème (sessions précédentes du même thème) : les
  // étapes analyse & glossaire réutilisent les termes habituels quand ils
  // collent au sujet, au lieu de tout réinventer à chaque session.
  if (VOCAB_REUSE_STEPS.has(stepKey)) {
    const vocab = await getThemeVocabulary({
      userId: session.owner,
      theme: session.theme,
      excludeSessionId: session._id,
    });
    if (vocab.length) parts.push(vocabBlock(session.theme, vocab));
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

  // Structure narrative du diaporama (étape Support) — fait autorité sur l'ordre
  // des slides et la révélation progressive de la problématique.
  if (stepKey === 'support') {
    parts.push(SUPPORT_STRUCTURE);
  }

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

  const deps = (STEP_DEPENDENCIES[stepKey] || []).map((key) => {
    let obj = session.data && session.data[key];
    // La problématique peut contenir 2 à 4 formulations candidates : pour les
    // étapes suivantes on ne réinjecte que la formulation RETENUE (celle pointée
    // par "recommandation"), pas toutes les alternatives, afin que le fil de la
    // démonstration reste unique.
    if (key === 'probleme') obj = problemeRetenuPourSuite(obj);
    return dataBlock(STEP_LABELS[key], obj);
  });

  const user = [...userLines, ...deps].filter((l) => l !== '' && l != null).join('\n');

  return { system, user };
}

module.exports = { buildStepPrompt, STEP_KEYS, STEP_LABELS };
