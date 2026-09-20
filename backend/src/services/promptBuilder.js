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
const {
  CONSIGNES_FOND_VULGARISATION,
  CONSIGNES_FORME_SUPPORT,
} = require('./consignesSupport');

// Parcours visible de l'étudiant. La recherche documentaire n'y figure plus :
// elle est produite automatiquement en arrière-plan (voir HIDDEN_STEPS).
const STEP_KEYS = ['analyse', 'probleme', 'plan', 'glossaire', 'support'];

// Passe A : le contrat métier est produit DANS l'étape "probleme" (pas de 6e
// étape visible). Il est stocké dans session.data.contrat et validé par
// l'étudiant avant toute Passe B.
const STEP_CONTRAT = 'contrat';

// Étapes techniques produites sans intervention de l'étudiant, déclenchées par
// une étape visible (la recherche alimente le plan puis le glossaire).
const HIDDEN_STEPS = ['recherche'];

// Étapes où la « base de vocabulaire du thème » est réinjectée : l'analyse
// (qui fixe les mots-clés) et le glossaire (qui fixe les termes réutilisables).
// Aux autres étapes, on s'appuie sur les résultats de la session en cours.
const VOCAB_REUSE_STEPS = new Set(['analyse', 'glossaire']);

const STEP_LABELS = {
  analyse: 'Analyse du sujet',
  probleme: 'Problématique',
  contrat: 'Contrat métier (Passe A)',
  recherche: 'Recherche documentaire',
  plan: 'Plan détaillé',
  glossaire: 'Glossaire et résumés des sources',
  support: 'Support de présentation',
};

// La ligne directrice est formulée à l'étape "probleme" (Passe A), puis
// réinjectée à toutes les étapes suivantes pour garantir le fil conducteur.
const LINE_DIRECTRICE_STEPS = new Set(['recherche', 'plan', 'glossaire', 'support']);

// Données des étapes précédentes réinjectées dans le prompt utilisateur.
const STEP_DEPENDENCIES = {
  analyse: [],
  // Passe A : le contrat s'appuie sur l'analyse validée du sujet.
  probleme: ['analyse'],
  // Le plan est produit après la recherche d'arrière-plan : il s'appuie dessus.
  plan: ['probleme', 'recherche'],
  // Le glossaire vient après le plan et ne définit que les termes réellement
  // mobilisés par ce plan (plus les sources trouvées en arrière-plan).
  glossaire: ['probleme', 'recherche', 'plan'],
  // Passe B : la découpe en slides part du CONTRAT VALIDÉ, du plan et du glossaire.
  support: ['contrat', 'plan', 'glossaire'],
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
 * Structure narrative imposée au support (étape 6).
 *
 * Référence absolue : structure_support_grand_oral_cesi.md. L'enchaînement est
 * chronologique et non négociable — c'est l'ordre d'un entonnoir : on pose le
 * contexte, on en déduit les enjeux, la problématique en découle et est
 * formulée comme un problème concret à instruire (jamais un débat d'opinion),
 * puis chaque bloc suivant la traite (existant → statistiques sourcées → cas
 * réels sourcés → solutions) avant de refermer sur une conclusion qui y répond
 * et ouvre une question non résolue. La problématique n'est jamais dévoilée
 * avant sa slide dédiée. Les sources sont citées sous les chiffres et les cas,
 * sans slide « Sources » dédiée.
 *
 * Cette structure prépare explicitement les critères de la grille d'évaluation
 * du jury CESI (contexte et positionnement stratégique 1.1 ; enjeux TOHEE 1.2 ;
 * concepts théoriques nommés 1.3 ; benchmark d'entreprises réelles nuancé 1.4 ;
 * prise de position 1.5 ; champ applicatif avant/pendant/après 1.6 ; fil
 * directeur visible 2.1 ; prise de position affirmée 2.3 ; impact visuel et
 * gestion du temps 2.4 ; synthèse 2.6 ; ouverture 2.7).
 */
const SUPPORT_STRUCTURE = `
### Structure narrative du support de présentation — à appliquer STRICTEMENT
Référence absolue : la spécification de structure du support Grand Oral CESI. L'enchaînement chronologique ci-dessous est NON NÉGOCIABLE : le jury évalue la clarté du plan et la construction en entonnoir.
Le .pptx ajoute automatiquement la page de titre (logo, école, candidat, sujet) : tu ne produis donc PAS de slide de titre.
Chaque slide doit porter un "type" parmi : contexte | enjeux | problematique | existant | donnees | exemple_entreprise | solutions | conclusion.

VOLUME IMPOSÉ : le fichier final compte EXACTEMENT 20 slides AU TOTAL (page de titre comprise) — ni plus, ni moins. Comme la page de titre est ajoutée automatiquement, produis donc EXACTEMENT 19 slides de contenu, LA slide de conclusion incluse dans ce nombre. Répartition cible : plan de présentation 1, contexte & mots clés 2, enjeux 1-2, problématiques 1, existant / état de l'art 3-4, statistiques chiffrées 2, cas d'entreprises 1-2, solutions & préconisations 5-6, conclusion 1. C'est un support CONCIS : une idée par slide, pas de slide de remplissage. Si tu dépasses, condense le contenu — ne splitte jamais une idée sur deux slides et ne crée jamais de slide de transition ni de rappel.

Ordre impératif des slides (6 blocs, dans cet ordre exact) :
BLOC 1 — Introduction & Contextualisation
 1. « Contexte » (type contexte) : une phrase d'accroche qui capte le jury, puis pourquoi le sujet est d'actualité et pourquoi les entreprises sont directement concernées, avec le positionnement stratégique du sujet au sein de l'entreprise ou du secteur et pour qui (critère 1.1).
 2. « Plan de présentation » (type contexte) : SYSTÉMATIQUEMENT la 2e slide du dossier. C'est le sommaire de l'oral : 4 à 5 puces très courtes annonçant les parties du support, dans l'ordre où elles seront présentées (contexte et mots clés, enjeux, problématique, existant et chiffres, cas d'entreprises, solutions, conclusion). Aucune problématique, aucun chiffre, aucun développement ici : le jury doit voir la construction d'un coup d'œil.
 3. « Mots clés » (type contexte) : reprends d'abord le SUJET COMPLET tel qu'il est posé (une puce ou un encadré), puis identifie chaque mot clé du sujet accompagné de sa définition courte et simple (issue de l'analyse et du glossaire validé) — 2 à 4 mots clés maximum. C'est le vocabulaire que tu réutilises ensuite dans tout le support, sans le redéfinir.
 4. « Enjeux » (type enjeux) : ce qui se joue pour l'entreprise, structuré par la grille TOHEE — Technique, Organisationnel, Humain, Économique, Environnemental — restreinte au cœur du sujet, pas un inventaire (critère 1.2).
 5. UNE slide dédiée « Problématiques » (type problematique) : elle met en avant UNIQUEMENT la question centrale, formulée comme un PROBLÈME CONCRET à instruire (pas un débat d'opinion), mise en grand et en évidence. Si le sujet appelle plusieurs angles, répartis-les sur plusieurs slides titrées « Problématiques — <précision> », une question par slide. C'est le fil rouge de toute la suite : « voici l'existant, voici ses limites, voici ce que je préconise ».
    RÈGLE : ne formule JAMAIS la problématique avant cette slide ; les slides précédentes (plan de présentation inclus) ne font que préparer sa venue. Cette slide n'oppose aucun camp : pas de deux colonnes opposées, pas de « Pour / Contre ». L'état des lieux et les observations préliminaires restent sur les slides précédentes.
BLOC 2 — L'Existant (Fondements & Théorie), type existant
 6. Analyse des concepts académiques et techniques du sujet : mobilise NOMMÉMENT les modèles, normes, auteurs ou cadres théoriques issus de l'analyse et de la recherche documentaire — le jury note la rigueur académique (critère 1.3).
 7. État de l'art des pratiques professionnelles : où en sont les organisations aujourd'hui sur ce sujet (critère 1.4).
BLOC 3 — Données Statistiques et Chiffrées, type donnees
 8. Une à trois slides illustrant le marché par des graphiques ou des chiffres clés.
    RÈGLE ABSOLUE : chaque statistique porte obligatoirement sa source en bas de slide (« Source : … ») et doit être la plus récente possible. Une donnée non sourcée est un point perdu.
BLOC 4 — Cas Réels d'Entreprise (Benchmarks), type exemple_entreprise
 9. UNE SLIDE PAR ENTREPRISE : chaque cas réel occupe sa propre slide, présentée de façon distincte et individualisée, avec son titre « Cas d'entreprises — <nom> » (précision de deux ou trois mots, obligatoire). Deux entreprises ne partagent JAMAIS une slide : le jury doit consacrer à chacune le temps d'analyse qu'elle mérite. Chaque slide confronte le cas à la problématique (succès ET échec ou limite), avec sa source en bas de slide et une référence actualisée. Un cas non sourcé ne compte pas comme benchmark (critères 1.4 et 2.3).
BLOC 5 — Solutions et Préconisations (Posture de Consultant), type solutions
 10. Réponse stratégique, pragmatique et actionnable à la problématique : prise de position explicite (« je préconise… parce que… »), contextualisée selon la structure et la taille d'entreprise, et structurée selon les phases du champ applicatif avant / pendant / après (critères 1.5, 1.6 et 2.3). Répartis ces préconisations sur PLUSIEURS slides plutôt que de les entasser : dès qu'une catégorie occupe plusieurs slides, chaque titre reprend le titre principal suivi de deux ou trois mots de précision (« Solutions — Continuité d'activité », « Préconisations — Avant la crise », « Préconisations — Pendant la crise ») — jamais deux titres identiques.
BLOC 6 — Conclusion
 11. « Conclusion » (type conclusion) : synthèse des points clés qui répond directement à la problématique (critère 2.6), rappel du fil directeur (critère 2.1), puis ouverture prospective sous forme de question ouverte volontairement NON RÉSOLUE (critère 2.7).

FIL DIRECTEUR CONTINU (exigence prioritaire) : l'évaluation porte d'abord sur la qualité de l'exercice ORAL — les slides sont des appuis, pas un document à lire. Chaque slide de contenu doit donc porter, dans le champ "transition", UNE phrase de transition discrète (12 à 18 mots) qui part du contenu de la slide courante et annonce explicitement la suivante : elle est affichée en bas de slide, en petit, et rend le raisonnement continu d'un bout à l'autre (aucune slide ne doit donner l'impression d'être isolée). Elle ne répète pas une puce, n'introduit ni chiffre ni terme nouveau, ne pose jamais la problématique avant sa slide dédiée et ne se réduit pas à une formule creuse. La dernière slide de contenu n'a pas de transition. Côté volume, chaque titre de slide doit se lire comme une étape du même raisonnement, et l'ensemble doit respecter la progression Contexte → Plan de présentation → Mots clés → Enjeux → Problématiques → Existant → Statistiques sourcées et récentes → Cas d'entreprises sourcés (une slide par entreprise) → Solutions → Préconisations → Conclusion. Le jury doit pouvoir reformuler en une phrase le fil qui relie l'introduction, chaque partie et la conclusion (critère 2.1). Si une slide ne fait pas avancer la réponse à la problématique, elle est hors sujet : supprime-la.

IMPACT VISUEL (critère 2.4) : le support est noté sur son impact visuel et oral. Aucune slide ne se réduit à un bloc de texte, et aucune slide ne se remplit de texte au point qu'il faille la lire : 3 à 5 puces courtes suffisent, une ligne par puce, 6 maximum. Pour chaque slide, choisis une "forme_visuelle" adaptée ("puces", "chiffre_cle", "deux_colonnes", "carte", "frise", "question") et, quand la slide gagne à être illustrée, renseigne l'objet "visuel" (histogramme de données, répartition, comparaison de deux séries, chronologie d'étapes) avec des chiffres réels et sourcés. Tout le détail argumentatif reste dans les notes orateur.

ÉQUILIBRE TECHNIQUE ET VULGARISATION : utilise un vocabulaire RICHE, précis et professionnel, mais qui reste simple à comprendre et facile à prendre en main par l'étudiant à l'oral. Évite la pauvreté lexicale tout en fuyant le jargon inutile. Pour les référentiels et normes (ISO, ITIL, NIST, etc.), explique-les toujours avec des mots simples. N'accumule pas les termes techniques sur chaque slide : utilise-les avec parcimonie pour ne pas noyer le jury sous une liste interminable en fin de présentation. Priorise la clarté et la concision pour éviter les questions pièges.

VOCABULAIRE : tout terme ou acronyme présent sur une slide ou dans les notes orateur doit provenir du glossaire validé en amont. Aucune exception.

GESTION DU TEMPS (critère 2.4) : le nombre de slides doit rester compatible avec la durée totale de l'oral et la répartition issues du plan. Ne dépasse pas le temps imparti : en cas d'arbitrage, coupe une slide plutôt que de la surcharger.

Provenance des chiffres, données et exemples rapportés du web : dès qu'une slide en présente un, ajoute juste en dessous une ligne courte commençant par « Source : » en citant l'une des sources validées fournies plus haut (jamais une source inventée). S'il n'existe pas de source correspondante, présente le chiffre comme « à vérifier » plutôt que de l'affirmer.`.trim();

/**
 * Charte couleur CESI imposée au support : le jaune institutionnel #F2D934
 * remplace le bleu historique. Le jaune est très clair — tout texte posé dessus
 * reste en gris très foncé, jamais en blanc. Le .pptx applique ces couleurs en
 * dur (voir services/pptx.js) ; ce bloc aligne la génération par l'API Claude.
 */
const SUPPORT_CHARTE_COULEUR = `
### CHARTE COULEUR DU SUPPORT — JAUNE CESI #F2D934 (NON NÉGOCIABLE)
Le support est aux couleurs CESI : le jaune institutionnel #F2D934 remplace tout bleu.
- Bandeau d'en-tête de chaque slide de contenu : aplat jaune #F2D934. Le titre posé dessus est en gris très foncé #262626, JAMAIS en blanc (le jaune est trop clair, du texte blanc serait illisible).
- Barre de progression : rail en ocre foncé #8A7A00, partie remplie en jaune assombri #E0C200.
- Accents, traits de séparation, contours de cartes et de pastilles : jaune assombri #E0C200.
- Chiffres clés et noms d'entreprise mis en avant : gris très foncé #262626 sur fond blanc.
- Corps de texte en gris très foncé #262626 ; mentions secondaires et pied de slide en gris #595959.
- Aucun bleu, aucune couleur vive, aucun dégradé. La palette se limite à #F2D934, #E0C200, #8A7A00, #262626, #595959, #BFBFBF et le blanc.
`.trim();

/**
 * Contrat métier (Passe A) réduit à ce qui est réinjecté aux étapes suivantes.
 * La Passe A produit UNE problématique : plus de formulations alternatives ni de
 * choix utilisateur à l'étape suivante — l'étudiant valide ou édite le contrat.
 * On ne réinjecte que les champs de fond (la question, la tension, la ligne
 * directrice et le périmètre), pas les métadonnées de validation.
 */
function contratPourSuite(contrat) {
  if (!contrat || typeof contrat !== 'object' || Array.isArray(contrat)) return contrat;
  return {
    sujet: contrat.sujet || '',
    motsCles: Array.isArray(contrat.motsCles) ? contrat.motsCles : [],
    tension: contrat.tension || '',
    problematique: contrat.problematique || '',
    justificationProbleme: contrat.justificationProbleme || '',
    limitesExistant: Array.isArray(contrat.limitesExistant) ? contrat.limitesExistant : [],
    preconisations: Array.isArray(contrat.preconisations) ? contrat.preconisations : [],
    casEntreprises: Array.isArray(contrat.casEntreprises) ? contrat.casEntreprises : [],
    ligneDirectrice: contrat.ligneDirectrice || '',
    ouverture: contrat.ouverture || '',
  };
}

/**
 * Style d'écriture IMPOSÉ, injecté dans les deux passes. Les slides ne sont pas
 * un rapport : ce sont des appuis pour l'oral, écrits par quelqu'un qui parle
 * devant un comité de direction. Toute formule qui « sonne IA » est un défaut
 * de génération, pas un détail de style.
 */
const STYLE_HUMAIN = `
### STYLE D'ÉCRITURE — HUMAIN, ORAL, CONCRET (NON NÉGOCIABLE)
Écris comme on pense à voix haute devant un comité de direction : direct, un peu sec, concret. On doit voir l'entreprise, pas un cours.

SLIDES
- Puces en NOMS : un truc + un angle. Jamais une mini-dissertation, jamais une phrase complète.
- Vocabulaire professionnel mais PARLÉ : on doit pouvoir le relire à l'oral sans ravaler sa salive.
- Un cas = un nom d'entreprise connue + ce qu'ils ont FAIT (ou raté). Jamais « l'entreprise X a mis en œuvre une démarche… ».
- Si un mot technique est indispensable, mets à côté ce que ça change pour le métier — jamais une définition de wiki.

NOTES DU PRÉSENTATEUR
- Comme à un pote du master en sortant de cours, mais propre : phrases courtes, présent, un peu d'oral.
- Elles COMMENTENT ce qui est à l'écran, elles ne le relisent pas. Une respiration, pas un script d'allocution.

FORMULES INTERDITES (elles disqualifient le texte) : « il convient », « il est essentiel de », « dans un contexte en mutation », « afin de garantir », « ainsi », « par ailleurs », « en conclusion », « synergie », « au cœur de », « véritable levier », « à l'ère du », « aujourd'hui plus que jamais ».
RYTHMES INTERDITS : liste marketing (trois adjectifs collés), antithèse toute faite, formule miroir.
Si ça sonne IA, le texte est à réécrire.
`.trim();

/**
 * Passe A — contrat métier. Le modèle ne produit AUCUNE slide ici : il produit
 * une problématique UTILISABLE (tension + une question + ligne directrice) que
 * l'étudiant lira, éditera et validera avant de débloquer le Plan.
 *
 * La Passe A n'est PAS l'évaluation finale : les éléments secondaires
 * (justification, mots-clés, préconisations, cas d'entreprise, ouverture) sont
 * FACULTATIFS ici et seront consolidés au Plan, au Glossaire, à la Recherche et
 * au Support — où le contrôle pré-export, lui, reste strict.
 */
const PASSE_A_CONTRAT = `
### PASSE A — CONTRAT MÉTIER (AVANT TOUTE SLIDE)
Tu produis le CONTRAT de fond de la présentation. Tu ne produis aucune slide, aucune mise en forme : tu fixes le raisonnement qui sera ensuite découpé en slides à la Passe B.

MÉCANISME DE RESSERREMENT (ne le recopie pas comme contenu) : un sujet large devient une question resserrée. Le sujet donne le décor ; la question donne le problème à instruire.

SORTIE MINIMALE OBLIGATOIRE — trois champs, sans eux le contrat est refusé :
1. TENSION — la friction réelle que l'entreprise doit arbitrer sur CE sujet : ce qu'elle gagne ou perd, ce qu'elle doit sacrifier. Une phrase de travail interne, jamais affichée telle quelle.
2. PROBLÉMATIQUE — UNE seule question.
   - La problématique doit transformer le sujet en problème d'entreprise concret.
   - Elle commence naturellement par Comment, Dans quelle mesure ou En quoi.
   - Elle contient une contrainte, un arbitrage, un risque ou une limite réelle.
   - Elle ne doit pas recopier le sujet et ne doit pas être une question oui/non.
   - Elle se termine par « ? » et compte au moins 5 mots utiles.
3. LIGNE DIRECTRICE — une phrase indiquant l'orientation de réponse probable.

CHAMPS FACULTATIFS — produis-les SEULEMENT si les sources les justifient ; sinon renvoie [] ou "". Un champ vide est accepté, un champ inventé est refusé :
justificationProbleme, motsCles, limitesExistant, preconisations, casEntreprises, ouverture.

Ne bloque pas sur les informations secondaires : elles seront consolidées au Plan, au Glossaire, à la Recherche et au Support. N'invente aucun fond métier : tout vient du sujet et du .md de préparation. Zéro source inventée.

SCHÉMA JSON EXACT — toutes ces clés sont attendues à ce niveau racine :
{
  "tension": "la friction réelle que l'entreprise doit arbitrer (phrase interne, jamais affichée)",
  "problematique": "UNE question concrète qui se termine par ?",
  "ligneDirectrice": "le fil rouge de l'oral, en une phrase",
  "justificationProbleme": "",
  "motsCles": [{ "mot": "…", "definition": "une ligne, langage clair" }],
  "limitesExistant": [],
  "preconisations": [{ "action": "…", "detail": "…", "cible": "PME | ETI | grand groupe" }],
  "casEntreprises": [{ "nom": "…", "chiffre": "…", "angle": "…", "source": "…", "issue": "succès | échec" }],
  "ouverture": ""
}

Réponds exclusivement avec UN objet JSON valide RFC 8259. N'ajoute aucun texte, aucun commentaire, aucune balise Markdown. Utilise uniquement des guillemets doubles " pour les clés et les chaînes. N'utilise jamais d'apostrophe simple en guise de guillemet.`.trim();

/**
 * Passe B — découpe du contrat validé en 20 slides. La problématique est FIGÉE
 * par la validation : elle ne peut plus changer ici.
 */
const PASSE_B_DECOUPE = `
### PASSE B — DÉCOUPE EN SLIDES depuis le contrat validé
Le contrat ci-dessous a été VALIDÉ par l'étudiant. Tu le découpes en slides, tu ne le remets pas en cause.

INTERDIT ABSOLU : changer la problématique. Le champ "problematique" du contrat est repris MOT POUR MOT sur la slide « Problématiques ». Tu ne reformules pas, tu ne nuances pas, tu n'ajoutes pas d'angle.

STRUCTURE NARRATIVE IMPOSÉE après la slide Problématique : existant → limites → préconisations.
- EXISTANT = diagnostic de LA MÊME tension : les concepts, pratiques et chiffres n'y figurent que s'ils éclairent cette tension. Pas de théorie orpheline.
- Les enjeux TOHEE sont générés À PARTIR de la problématique validée : chaque enjeu est un gain OU une perte sur CETTE question, une ligne. Pas d'inventaire générique.
- CAS D'ENTREPRISES : une slide dédiée (deux maximum si ça déborde vraiment). Blocs compacts : nom, pastille initiales jaune, UN chiffre, UN angle = preuve de la problématique, source. Au moins un échec.
- PRÉCONISATIONS : elles répondent à la question, calibrées par taille d'entreprise, actionnables.
- CONCLUSION : la phrase qui RÉPOND à la question, le rappel de la ligne directrice, l'ouverture — sans y répondre.

TITRES : nomenclature imposée uniquement, courts. Aucun acronyme hors glossaire (sinon une définition d'une ligne dans « Mots clés », puis réemploi sans redéfinir).
VOLUME : slides concises. Une idée par puce, fragments courts. Si une slide dépasse, CONDENSE — ne splitte jamais une idée sur deux slides, ne crée jamais de slide de transition ni de rappel.
`.trim();

async function buildStepPrompt(session, stepKey, options = {}) {
  const pourPptxClaude = options.pourPptxClaude === true;
  const sections = await MethodologySection.find({
    appliesToSteps: { $in: [stepKey, 'all'] },
  })
    .sort({ order: 1, sectionId: 1 })
    .lean();

  const parts = sections.map((s) => s.content).filter(Boolean);

  // Ligne directrice déjà établie à l'étape "probleme" (Passe A).
  const ligneDirectrice =
    (session.ligneDirectrice || '').trim() ||
    (session.data && session.data.contrat && session.data.contrat.ligneDirectrice
      ? String(session.data.contrat.ligneDirectrice).trim()
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
        termes.forEach((t) => {
          const theme = t && t.theme ? ` [${t.theme}]` : '';
          bloc.push(`- ${t.terme}${theme} : ${t.definition}`);
        });
      }
      bloc.push(
        '',
        "RÈGLE STRICTE : aucun acronyme ou terme technique absent de ce glossaire ne doit apparaître sur les slides ni dans les notes orateur. Si un terme nouveau semble nécessaire, formule-le autrement plutôt que de l'utiliser sans définition. Respecte l'ÉQUILIBRE TECHNIQUE ET VULGARISATION : utilise ces termes avec précision professionnelle mais explique-les toujours simplement."
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
  if (pourPptxClaude) {
    // Export « Claude Desktop fabrique le .pptx » : on ne demande PAS de JSON.
    // Le schéma de sortie reste utile comme description des champs de contenu,
    // mais la consigne finale impose la fabrication du fichier .pptx.
    parts.push(
      `Description des champs de contenu de chaque slide (à mettre en forme, PAS à renvoyer en JSON) :\n${stepDoc.jsonSchemaDescription}`
    );
  } else {
    parts.push(
      `Format de sortie attendu pour l'étape « ${STEP_LABELS[stepKey] || stepKey} » :\n${stepDoc.jsonSchemaDescription}`
    );
  }

  // Passe A (étape problème) : on demande le contrat métier, pas des slides.
  // Passe B (étape support) : on part du contrat validé.
  if (stepKey === 'probleme') {
    parts.push(PASSE_A_CONTRAT);
  }
  if (stepKey === 'support') {
    parts.push(PASSE_B_DECOUPE);
  }

  // Style d'écriture imposé : sur les deux passes du fil logique (contrat et
  // slides). Ce n'est pas un nice-to-have : si ça sonne IA, c'est un défaut.
  if (stepKey === 'probleme' || stepKey === 'support') {
    parts.push(STYLE_HUMAIN);
  }

  // Structure narrative du diaporama (étape Support) — fait autorité sur l'ordre
  // des slides et la révélation progressive de la problématique.
  if (stepKey === 'support') {
    parts.push(SUPPORT_STRUCTURE);
    parts.push(SUPPORT_CHARTE_COULEUR);
    parts.push(CONSIGNES_FOND_VULGARISATION);
    parts.push(CONSIGNES_FORME_SUPPORT);
  }

  if (pourPptxClaude) {
    parts.push(
      "Tu ne réponds PAS en JSON : tu fabriques directement le fichier PowerPoint (.pptx) binaire, téléchargeable, en appliquant la charte visuelle et la mise en page décrites plus bas dans ce document. Les sections ci-dessus décrivent le CONTENU et la STRUCTURE des slides à produire, jamais un format de réponse."
    );
  } else {
    parts.push(
      'Tu réponds UNIQUEMENT avec un objet JSON valide correspondant exactement au format de sortie attendu : aucune balise markdown de code, aucun texte avant ou après le JSON.'
    );
  }

  const system = parts.filter(Boolean).join('\n\n---\n\n').trim();

  // ---- Prompt utilisateur ----
  const userLines = [
    `Sujet du Grand Oral : « ${session.titre} »`,
    session.theme ? `Thème : ${session.theme}` : '',
    '',
    `Étape en cours : « ${STEP_LABELS[stepKey] || stepKey} ». Produis la sortie attendue pour cette étape, en suivant strictement la méthodologie fournie ci-dessus.`,
  ];

  const deps = (STEP_DEPENDENCIES[stepKey] || []).map((key) => {
    let obj = session.data && session.data[key];
    // La Passe A produit UN contrat (plus de formulations candidates) : pour la
    // Passe B on ne réinjecte que les champs de fond, pas les métadonnées de
    // validation (valide, rejets…).
    if (key === 'contrat') obj = contratPourSuite(obj);
    return dataBlock(STEP_LABELS[key], obj);
  });

  const user = [...userLines, ...deps].filter((l) => l !== '' && l != null).join('\n');

  return { system, user };
}

module.exports = {
  buildStepPrompt,
  STEP_KEYS,
  STEP_LABELS,
  STEP_CONTRAT,
  HIDDEN_STEPS,
  contratPourSuite,
};
