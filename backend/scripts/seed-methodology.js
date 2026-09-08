/**
 * Seed de la méthodologie Tension.
 *
 * Usage (depuis /backend) :
 *   node scripts/seed-methodology.js
 *   # ou
 *   npm run seed
 *
 * Insère (upsert) :
 *  - les MethodologySection, dont le contenu est copié TEL QUEL depuis
 *    methodologie-grand-oral.md (extrait au build dans methodology-content.json) ;
 *  - les 6 StepSchema (analyse, probleme, recherche, glossaire, plan, support) ;
 *  - les 5 thèmes du Grand Oral CESI.
 *
 * Idempotent : peut être relancé sans risque.
 */
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Chargement du .env local si présent (Railway fournit les variables d'env).
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const MethodologySection = require('../src/models/MethodologySection');
const StepSchemaModel = require('../src/models/StepSchema');
const Theme = require('../src/models/Theme');

const raw = require('../methodology-content.json');

// Section "glossaire" absente de methodologie-grand-oral.md (nouvelle étape
// intermédiaire entre recherche et plan) : rédigée à partir du principe
// `principe_glossaire_sources`, appliqué concrètement.
const ETAPE_4_GLOSSAIRE = `Produis le glossaire et les résumés de sources demandés avant toute mise en slides, en t'appuyant sur les résultats de la recherche documentaire fournis plus haut.

Contenu attendu :
- une liste « sources » : pour CHAQUE source retenue lors de la recherche documentaire, un objet avec :
  - titre : nom précis et identifiable de la source (rapport, article, organisme, livre, site…),
  - resume : résumé en 2-3 phrases indiquant ce que dit la source, pourquoi elle est pertinente pour la problématique, et quelle donnée chiffrée ou exemple concret elle apporte.
- une liste « termes » : glossaire des acronymes et termes techniques qui seront effectivement utilisés dans la présentation (slides ET notes orateur), avec pour chacun :
  - terme : l'acronyme ou le terme technique,
  - definition : une définition en langage clair, simple, qu'un étudiant peut se réapproprier et redire à l'oral sans hésitation devant un jury (pas une définition savante).

Contraintes :
- N'inclus dans le glossaire que les termes réellement nécessaires à la présentation — pas un inventaire de cours.
- Aucun acronyme ou terme technique ne devra ensuite apparaître dans le support de présentation s'il ne figure pas dans cette liste.
- Tout terme nouveau qui émergerait à une étape ultérieure devra y être ajouté au préalable, jamais utilisé sans définition.`;

/**
 * Liste canonique des sections en base. Les contenus sont copiés tels quels
 * depuis methodologie-grand-oral.md (clés du JSON) — jamais reformulés.
 * Les étapes renommées suite à l'ajout de l'étape glossaire pointent vers
 * leur section d'origine.
 */
const METHODOLOGY_SECTIONS = [
  {
    sectionId: 'role_et_objectif',
    title: 'Rôle et objectif de l’assistant',
    order: 1,
    appliesToSteps: ['all'],
    from: 'role_et_objectif',
  },
  {
    sectionId: 'principe_directeur_problematique',
    title: 'Principe directeur — construction de la problématique',
    order: 2,
    appliesToSteps: ['all'],
    from: 'principe_directeur_problematique',
  },
  {
    sectionId: 'garde_fous_anti_derive',
    title: 'Garde-fous anti-dérive (validation d’une problématique)',
    order: 3,
    appliesToSteps: ['all'],
    from: 'garde_fous_anti_derive',
  },
  {
    sectionId: 'principe_ligne_directrice',
    title: 'Ligne directrice — fil conducteur de la démonstration',
    order: 4,
    appliesToSteps: ['probleme', 'recherche', 'glossaire', 'plan', 'support'],
    from: 'principe_ligne_directrice',
  },
  {
    sectionId: 'principe_glossaire_sources',
    title: 'Glossaire et résumés des sources (principe)',
    order: 5,
    appliesToSteps: ['recherche', 'glossaire', 'support'],
    from: 'principe_glossaire_sources',
  },
  {
    sectionId: 'etape_1_analyse_sujet',
    title: 'Étape 1 — Analyse du sujet',
    order: 10,
    appliesToSteps: ['analyse'],
    from: 'etape_1_analyse_sujet',
  },
  {
    sectionId: 'etape_2_problematique',
    title: 'Étape 2 — Problématique',
    order: 10,
    appliesToSteps: ['probleme'],
    from: 'etape_2_problematique',
  },
  {
    sectionId: 'etape_3_recherche_documentaire',
    title: 'Étape 3 — Recherche documentaire',
    order: 10,
    appliesToSteps: ['recherche'],
    from: 'etape_3_recherche_documentaire',
  },
  {
    sectionId: 'etape_4_glossaire',
    title: 'Étape 4 — Glossaire et résumés des sources',
    order: 10,
    appliesToSteps: ['glossaire'],
    content: ETAPE_4_GLOSSAIRE,
  },
  {
    sectionId: 'etape_5_plan_detaille',
    title: 'Étape 5 — Plan détaillé',
    order: 10,
    appliesToSteps: ['plan'],
    from: 'etape_4_plan_detaille',
  },
  {
    sectionId: 'etape_6_support_visuel',
    title: 'Étape 6 — Support de présentation',
    order: 10,
    appliesToSteps: ['support'],
    from: 'etape_5_support_visuel',
  },
  {
    sectionId: 'garde_fou_sujets_academiques',
    title: 'Garde-fou — sujets académiques à tension explicite',
    order: 20,
    appliesToSteps: ['all'],
    from: 'garde_fou_sujets_academiques',
  },
];

/** Descriptions textuelles des JSON attendus, injectées à la fin du prompt. */
const STEP_SCHEMAS = [
  {
    stepKey: 'analyse',
    jsonSchemaDescription: [
      'Objet JSON avec les clés suivantes (toutes en snake_case) :',
      '- "reformulation" : chaîne — reformulation fidèle du sujet en une phrase.',
      '- "mots_cles" : tableau d\'objets { "mot": chaîne, "definition": chaîne } — chaque mot-clé du sujet avec sa définition contextualisée (pas une définition de dictionnaire).',
      '- "notions_a_maitriser" : tableau de chaînes — notions techniques ou de gestion à maîtriser.',
      '- "questions_ouvertes" : tableau de chaînes — questions ouvertes soulevées par le sujet.',
      '- "tensions" : tableau d\'objets { "pole_a": chaîne, "pole_b": chaîne, "description": chaîne } — tensions/contradictions repérables à ce stade, même provisoires.',
      '- "angles_approche" : tableau de chaînes — angles d\'approche possibles pour la suite.',
      'Ne choisis pas encore de problématique à cette étape : elle doit rester exploratoire.',
    ].join('\n'),
  },
  {
    stepKey: 'probleme',
    jsonSchemaDescription: [
      'Objet JSON avec les clés suivantes :',
      '- "ligne_directrice" : chaîne OBLIGATOIRE — la phrase unique « fil rouge » de toute la présentation, dérivée de la problématique retenue. Elle sera réutilisée et renforcée à toutes les étapes suivantes.',
      '- "formulations" : tableau de 2 à 4 objets { "formulation": chaîne, "tension": { "pole_a": chaîne, "pole_b": chaîne }, "pourquoi_discutable": chaîne, "pourquoi_bornee_par_le_sujet": chaîne } — chaque formulation est reliée à une tension réelle identifiée dans l\'analyse du sujet.',
      '- "recommandation" : chaîne — la formulation recommandée, retenue parmi les propositions.',
      '- "justification_recommandation" : chaîne — pourquoi cette formulation est la plus solide.',
      'Toutes les formulations doivent passer les tests anti-dérive (pas de reformulation plate, pas de réponse évidente, périmètre borné par le sujet, tension réelle, argumentation possible en plusieurs parties).',
    ].join('\n'),
  },
  {
    stepKey: 'recherche',
    jsonSchemaDescription: [
      'Objet JSON avec les clés suivantes :',
      '- "axes_recherche" : tableau de chaînes — axes déduits de la problématique retenue.',
      '- "types_sources" : tableau de chaînes — types de sources à mobiliser.',
      '- "organismes_exemples" : tableau d\'objets { "nom": chaîne, "type": chaîne, "pourquoi": chaîne } — organismes, revues, cabinets ou rapports réels et identifiables.',
      '- "donnees_a_rechercher" : tableau de chaînes — données chiffrées et pourcentages à rechercher en priorité.',
      '- "exemples_entreprises" : tableau d\'objets { "nom": chaîne, "contexte": chaîne, "resultat": chaîne, "apport": chaîne } — exemples réels (succès et échecs), avec leur apport pour l\'analyse.',
      '- "consignes_fiches_lecture" : tableau de chaînes — consignes pour constituer des fiches de lecture par source.',
      '- "pieges_a_eviter" : tableau de chaînes — pièges méthodologiques à éviter.',
      'Rappelle-toi qu\'une IA seule ne suffit pas comme source : le but est de guider des recherches réelles et vérifiables.',
    ].join('\n'),
  },
  {
    stepKey: 'glossaire',
    jsonSchemaDescription: [
      'Objet JSON avec exactement deux clés :',
      '- "sources" : tableau d\'objets { "titre": chaîne, "resume": chaîne } — UN objet par source retenue ; resume = 2-3 phrases : ce que dit la source, pourquoi elle est pertinente pour la problématique, quelle donnée ou exemple concret elle apporte.',
      '- "termes" : tableau d\'objets { "terme": chaîne, "definition": chaîne } — glossaire des acronymes et termes techniques réellement utilisés, définition en langage clair et réutilisable à l\'oral.',
      'Les deux tableaux doivent être non vides. Ne liste que des termes et sources réellement utiles à la présentation.',
    ].join('\n'),
  },
  {
    stepKey: 'plan',
    jsonSchemaDescription: [
      'Objet JSON avec les clés suivantes :',
      '- "duree_totale_minutes" : nombre — durée totale de l\'oral (20 par défaut).',
      '- "sections" : tableau d\'objets { "partie": chaîne, "role": chaîne, "minutes": nombre, "points": [chaînes] } — au minimum une section par grande partie : Introduction, Contexte (données chiffrées actuelles), Enjeux (TOHEE restreints au cœur de la problématique), Existant (état de l\'art + retours d\'expérience), Solutions / préconisations (posture consultant, contextualisées par taille d\'entreprise), Conclusion (réponse à la problématique + ouverture prospective sans y répondre).',
      '- "repartition_temps" : objet { "introduction": nombre, "contexte": nombre, "enjeux": nombre, "existant": nombre, "solutions": nombre, "conclusion": nombre } dont la somme égale duree_totale_minutes.',
      'Chaque partie doit faire progresser explicitement la réponse à la problématique et renforcer la ligne directrice. Le minutage doit être réaliste (introduction/conclusion courtes).',
    ].join('\n'),
  },
  {
    stepKey: 'support',
    jsonSchemaDescription: [
      'Objet JSON avec une clé "slides" : tableau d\'objets { "titre": chaîne, "type": chaîne, "puces": [chaînes], "notes_orateur": chaîne }, PLUS une clé "notes_globales" (chaîne optionnelle).',
      '- "type" parmi : "contexte" | "enjeux" | "problematique" | "existant" | "solutions" | "donnees" | "exemple_entreprise" | "conclusion".',
      '- "puces" : phrases courtes (le détail argumentatif va dans les notes orateur, jamais sur la slide).',
      '- "notes_orateur" : argumentation complète en français oral fluide, prête à être dite à voix haute.',
      'Ordre narratif imposé des slides : contexte & mots-clés → enjeux → UNE slide dédiée "problematique" → développement qui répond à la question (existant, solutions, données, exemples d\'entreprises réelles) → conclusion. Ne formule jamais la problématique avant sa slide dédiée.',
      'Exigences : une slide "contexte" qui présente le sujet, ses mots-clés et un ou deux chiffres clés ; au moins une slide "donnees" (chiffres) dans le développement ; au moins une slide "exemple_entreprise" réelle ; une slide "conclusion" qui répond explicitement à la problématique, rappelle la ligne directrice et s\'ouvre sur une question prospective sans y répondre.',
      'Provenance : quand une slide présente un chiffre, une donnée ou un exemple rapporté du web, ajouter en dessous une ligne courte « Source : … » citant une source validée fournie dans le glossaire (jamais une source inventée).',
      'RÈGLE ABSOLUE : aucun acronyme ou terme technique absent du glossaire fourni ne doit apparaître dans les puces ou les notes orateur.',
    ].join('\n'),
  },
];

/** Les 5 thèmes du Grand Oral CESI (modifiables ensuite dans le panneau admin). */
const THEMES = [
  { label: 'Numérique, IA & transformation digitale', order: 1 },
  { label: 'Industrie du futur & robotique', order: 2 },
  { label: 'Transition écologique & énergie', order: 3 },
  { label: 'Santé & biotechnologies', order: 4 },
  { label: 'Société, éthique & responsabilité', order: 5 },
];

async function seedMethodology() {
  const url = process.env.MONGO_URL;
  if (!url) {
    console.error('MONGO_URL manquante. Renseignez backend/.env (local) ou liez le plugin MongoDB (Railway).');
    process.exit(1);
  }
  await mongoose.connect(url, { serverSelectionTimeoutMS: 8000 });
  console.log('Connecté à MongoDB.');

  // ---- MethodologySection ----
  for (const def of METHODOLOGY_SECTIONS) {
    let content = def.content;
    if (content === undefined) {
      if (!raw[def.from]) {
        throw new Error(`Contenu introuvable pour la section "${def.sectionId}" (clé "${def.from}").`);
      }
      content = raw[def.from];
    }
    await MethodologySection.findOneAndUpdate(
      { sectionId: def.sectionId },
      {
        $set: {
          title: def.title,
          content,
          order: def.order,
          appliesToSteps: def.appliesToSteps,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  const sectionCount = await MethodologySection.countDocuments();
  console.log(`MethodologySection : ${METHODOLOGY_SECTIONS.length} upsertées (total en base : ${sectionCount}).`);

  // ---- StepSchema ----
  for (const def of STEP_SCHEMAS) {
    await StepSchemaModel.findOneAndUpdate(
      { stepKey: def.stepKey },
      { $set: { jsonSchemaDescription: def.jsonSchemaDescription } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`StepSchema : ${STEP_SCHEMAS.length} upsertés.`);

  // ---- Theme ----
  for (const theme of THEMES) {
    const exists = await Theme.findOne({ label: theme.label });
    if (!exists) await Theme.create(theme);
  }
  // Supprime un éventuel doublon de thème issu d'un seed précédent.
  for (const theme of THEMES) {
    const matches = await Theme.find({ label: theme.label }).sort({ createdAt: 1 });
    for (let i = 1; i < matches.length; i += 1) {
      await matches[i].deleteOne();
    }
  }
  const themeCount = await Theme.countDocuments();
  console.log(`Theme : ${THEMES.length} thèmes garantis (total en base : ${themeCount}).`);

  console.log('Seed terminé avec succès.');
}

seedMethodology()
  .catch((err) => {
    console.error('Seed échoué :', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
