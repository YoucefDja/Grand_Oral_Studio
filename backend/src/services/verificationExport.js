/**
 * VÉRIFICATION SYSTÉMATIQUE AVANT EXPORT DES FICHIERS MARKDOWN
 *
 * Ce module implémente l'étape de contrôle qui s'exécute AVANT toute
 * exportation de fichier Markdown (Claude Desktop, Gamma, Claude Design). Elle
 * répond à cinq exigences produit :
 *
 * 1. PARCOURS DE LA GRILLE — les 14 critères du jury CESI sont lus depuis la
 *    section `grille_evaluation_cesi` stockée en base (source unique, éditable
 *    en admin : voir services/grilleEvaluation.js). Aucun critère n'est
 *    recopié en dur ici.
 *
 * 2. STATUT OBJECTIF PAR CRITÈRE — chaque critère reçoit un statut déterministe
 *    (conforme / partiel / non conforme) et un score chiffré, calculés à partir
 *    d'observations vérifiables dans les INTRANTS du Markdown : analyse,
 *    problématique, plan, glossaire et recherche. Aucune appréciation
 *    subjective : chaque verdict cite la preuve qui le fonde.
 *
 * 3. LE JUGEMENT PORTE SUR LE MARKDOWN, PAS SUR LES SLIDES — le fichier
 *    Markdown est assemblé à partir des étapes amont (voir
 *    services/promptBuilder.js) et sert ensuite de base à la génération des
 *    slides, quel que soit l'outil (Gamma, Claude Design, PowerPoint). Les
 *    slides sont donc un PRODUIT AVAL : les juger à l'export n'aurait aucun
 *    sens et rendrait la vérification muette. L'observation porte donc
 *    exclusivement sur les intrants, ceux-là mêmes qui composent le .md.
 *
 * 4. RAPPORT DÉTAILLÉ — le rapport liste chaque critère, son statut, son score
 *    et le détail des points faibles, en distinguant les non-conformités
 *    BLOQUANTES (le Markdown ne peut pas partir en export) des avertissements.
 *
 * 5. POINTS FAIBLES À RECORRIGER — le rapport isole explicitement les points
 *    faibles actionnables, en particulier :
 *      - la LIGNE DIRECTRICE à tenir tout au long de la présentation ;
 *      - la PROBLÉMATIQUE (méthode Armelle Aymond) qui doit évoquer un
 *        problème RÉEL et rester liée au sujet — jamais une simple
 *        reformulation du sujet, jamais un débat d'opinion, jamais hors sujet ;
 *      - la MÉTHODOLOGIE globale (Armelle Aymond), qui ne porte pas seulement
 *        sur la problématique mais sur l'ensemble de la présentation
 *        (entonnoir Contexte → Enjeux → Problématique → Existant → Données →
 *        Cas réels → Solutions → Conclusion, ligne directrice continue).
 *
 * Ces points faibles sont corrigeables EN PLACE : la route
 * `POST /api/sessions/:id/corriger-points-faibles` demande à DeepSeek de
 * réécrire le champ fautif de l'étape concernée, puis renouvelle les Markdown.
 */

const MethodologySection = require('../models/MethodologySection');
const { httpError } = require('../utils/httpError');
const { parserGrille, SECTION_ID } = require('./grilleEvaluation');
const { normaliser, VOLUME_CIBLE_TOTAL } = require('./conformiteSupport');

// ---------------------------------------------------------------------------
// Barème
// ---------------------------------------------------------------------------

const SCORE_CONFORME = 1;
const SCORE_PARTIEL = 0.5;
const SCORE_NON_CONFORME = 0;

/**
 * Un critère ne peut jamais être noté automatiquement sur sa QUALITÉ
 * RÉDACTIONNELLE OU ORALE (éloquence, gestion du stress, jeu de questions).
 * Le statut `partiel` traduit honnêtement cette limite au lieu de déclarer
 * « conforme » ce qu'on n'a pas mesuré — le jury reste seul juge.
 */
const CRITERES_QUALITATIFS = new Set(['2.2', '2.3', '2.4', '2.5', '2.7']);

// ---------------------------------------------------------------------------
// Procédure de secours — méthode Armelle Aymond (problématique & méthodologie)
//
// Ce bloc est un FILET DE SÉCURITÉ : la consigne complète vit en base
// (`principe_directeur_problematique`, `garde_fous_anti_derive`,
// `principe_ligne_directrice`, `role_et_objectif`). Il n'est utilisé que si ces
// sections n'ont pas été trouvées, pour que la vérification ne devienne jamais
// muette.
// ---------------------------------------------------------------------------

const SECOURS_PROBLEMATIQUE = `Une problématique conforme à la méthode Armelle Aymond n'est JAMAIS une simple reformulation du sujet avec un point d'interrogation, JAMAIS un débat d'opinion (« faut-il… », « est-ce bien… »), JAMAIS une question purement descriptive (« quelles sont les causes de… »). C'est un PROBLÈME RÉEL rencontré par des organisations, formulé comme une tension à deux pôles, borné par les mots-clés du sujet, et qui appelle une réponse argumentée et actionnable (des préconisations).`;

const SECOURS_LIGNE_DIRECTRICE = `La ligne directrice est le fil rouge qui relie toutes les slides : elle découle de la problématique, elle est énoncée dès l'introduction, elle est rappelée à chaque étape et elle est refermée en conclusion. Une ligne directrice absente, incohérente avec la problématique ou oubliée en cours de route se voit immédiatement à l'oral.`;

const SECOURS_METHODOLOGIE = `La méthode Armelle Aymond est GLOBALE : elle porte sur toute la présentation, pas seulement sur la problématique. L'enchaînement attendu est un entonnoir — Contexte → Enjeux (TOHEE) → Problématique posée → Existant et concepts théoriques → Données statistiques sourcées et récentes → Cas réels d'entreprise sourcés → Solutions → Préconisations → Conclusion. Chaque slide prépare la suivante et aucune ne paraît isolée.`;

// ---------------------------------------------------------------------------
// Lecture des sections de référence en base (avec repli)
// ---------------------------------------------------------------------------

async function lireSections(sectionIds) {
  const sections = await MethodologySection.find({ sectionId: { $in: sectionIds } }).lean();
  const parId = new Map(sections.map((s) => [s.sectionId, s]));
  return parId;
}

/**
 * Charge la grille et les référentiels méthodologiques. Renvoie aussi le
 * contenu de la grille, pour pouvoir être cité dans le rapport.
 */
async function chargerReferentiels() {
  const sections = await lireSections([
    SECTION_ID,
    'principe_directeur_problematique',
    'garde_fous_anti_derive',
    'principe_ligne_directrice',
    'role_et_objectif',
  ]);

  const grilleSection = sections.get(SECTION_ID);
  if (!grilleSection || !grilleSection.content) {
    throw httpError(
      500,
      `Section « ${SECTION_ID} » absente de la base : la vérification avant export ne peut pas parcourir la grille d'évaluation. Lancez le script de seed (npm run seed) puis relancez l'export.`
    );
  }

  const contenuOu = (id, secours) => {
    const s = sections.get(id);
    return s && s.content ? s.content : secours;
  };

  return {
    grille: parserGrille(grilleSection.content),
    consigneProblematique: contenuOu('principe_directeur_problematique', SECOURS_PROBLEMATIQUE),
    gardeFous: contenuOu('garde_fous_anti_derive', ''),
    consigneLigneDirectrice: contenuOu('principe_ligne_directrice', SECOURS_LIGNE_DIRECTRICE),
    methodologieGlobal: contenuOu('role_et_objectif', SECOURS_METHODOLOGIE),
  };
}

// ---------------------------------------------------------------------------
// Analyse du fil rouge : sujet ↔ problématique ↔ ligne directrice
// ---------------------------------------------------------------------------

/** Découpe un texte en jetons significatifs (lettres/chiffres, sans accents). */
function jetons(texte) {
  return normaliser(texte)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

const MOTS_OUTILS = new Set(
  [
    'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'au', 'aux', 'a', 'et', 'ou',
    'que', 'qui', 'quoi', 'dont', 'dans', 'avec', 'pour', 'sans', 'chez', 'sur',
    'sous', 'par', 'vers', 'entre', 'depuis', 'pendant', 'durant', 'selon', 'car',
    'mais', 'donc', 'ni', 'ne', 'ce', 'se', 'sa', 'son', 'ses', 'leur', 'leurs',
    'elle', 'il', 'ils', 'elles', 'on', 'nous', 'vous', 'je', 'tu', 'cette', 'cet',
    'ces', 'tout', 'tous', 'toute', 'toutes', 'comme', 'plus', 'moins', 'tres',
    'pas', 'non', 'oui', 'est', 'sont', 'etre', 'avoir', 'faire', 'peut', 'peuvent',
    'doit', 'doivent', 'faut', 'en', 'y', 'comment', 'pourquoi', 'quel', 'quelle',
    'quels', 'quelles', 'mesure', 'aujourdhui', 'meme', 'aussi', 'autre', 'autres',
    'chaque', 'plusieurs', 'quelques', 'toujours', 'souvent', 'jamais', 'dans',
  ].map((m) => m.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
);

/** Jetons « pleins » (hors mots-outils), utilisés pour mesurer un périmètre. */
function jetonsPleins(texte) {
  return jetons(texte).filter((j) => j.length >= 4 && !MOTS_OUTILS.has(j));
}

/**
 * Recouvrement relatif : part du vocabulaire de `reference` que l'on retrouve
 * dans `texte` (0 → aucun, 1 → tout).
 */
function recouvrement(reference, texte) {
  const ref = new Set(jetonsPleins(reference));
  if (ref.size === 0) return 0;
  const cible = new Set(jetonsPleins(texte));
  let communs = 0;
  ref.forEach((j) => {
    if (cible.has(j)) communs += 1;
  });
  return communs / ref.size;
}

/** Chevauchement de Jaccard, plus sévère que le recouvrement relatif. */
function jaccard(a, b) {
  const setA = new Set(jetonsPleins(a));
  const setB = new Set(jetonsPleins(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let communs = 0;
  setA.forEach((j) => {
    if (setB.has(j)) communs += 1;
  });
  return communs / (setA.size + setB.size - communs);
}

/**
 * Tournures qui disqualifient une problématique au regard de la méthode
 * Armelle Aymond : débat d'opinion, question purement descriptive. Ces
 * tournures sont EXACTEMENT celles que traque services/problemeVerification.js
 * (garde-fous anti-dérive) ; on les réutilise ici pour que le contrôle avant
 * export et le contrôle de génération ne puissent pas diverger.
 */
const TOURNURES_DEBAT = [
  'faut-il', 'fautil', 'doit-on', 'doiton', 'devrait-on', 'devraiton',
  'est-ce bien', 'estce bien', 'est-ce mal', 'estce mal', 'est-il legitime',
  'estil legitime', 'est-ce acceptable', 'estce acceptable', 'est-ce souhaitable',
  'estce souhaitable', 'est-ce moral', 'estce moral', 'a-t-on raison',
];

const TOURNURES_CONSTAT = [
  'quelles sont les causes', 'quelle est la cause', 'en quoi consiste',
  'qu est ce que', 'quels sont les freins', 'quels sont les obstacles',
  'pourquoi existe', 'd ou vient', 'quels sont les enjeux de',
];

const LEVIERS_SOLUTION = [
  'comment', 'dans quelle mesure', 'quelles conditions', 'par quels leviers',
  'quel role', 'quelle place', 'quelles pratiques', 'de quelle maniere',
];

/** Recherche une tournure (tolérante aux accents et à la ponctuation). */
function contientTournure(texteNormalise, tournures) {
  const plat = texteNormalise.replace(/[^a-z0-9]+/g, ' ').trim();
  return tournures.find((t) => plat.includes(t.replace(/[^a-z ]/g, ' '))) || null;
}

/**
 * Diagnostic du fil rouge. Renvoie { problematique, ligneDirectrice, constats }
 * où `constats` est une liste de points faibles horodatés par code.
 */
function diagnostiquerFilRouge(session) {
  const data = session?.data || {};
  const sujet = String(session?.titre || '').trim();
  const theme = String(session?.theme || '').trim();
  // Le fil rouge vit désormais dans le CONTRAT MÉTIER (Passe A, data.contrat) :
  // la problématique y est une chaîne unique et la tension une phrase de
  // friction (plus de formulations candidates ni de pôles pole_a / pole_b).
  const contrat = data.contrat && typeof data.contrat === 'object' ? data.contrat : {};
  const problematique = String(contrat.problematique || '').trim();
  const ligneDirectrice = String(
    session?.ligneDirectrice || contrat.ligneDirectrice || ''
  ).trim();
  const tension = String(contrat.tension || '').trim();

  const constats = [];
  const ajouter = (code, message) => constats.push({ code, message });

  // ---- Contrat métier validé (Passe A) ----
  // Source de vérité unique : le statut canonique (domain/contratPasseA.js).
  // `contrat.valide` (ancien booléen) n'est plus lu comme contrat métier.
  if (contrat.status !== 'validated') {
    ajouter(
      'contrat_non_valide',
      "Le contrat métier (Passe A) n'est pas validé : valide la tension et la problématique à l'écran de validation avant d'exporter le support."
    );
  }

  // ---- Problématique (méthode Armelle Aymond) ----
  if (!problematique) {
    ajouter(
      'problematique_absente',
      "Aucune problématique retenue : valide ta problématique à l'étape 2 avant d'exporter le support."
    );
  } else {
    const norm = normaliser(problematique);

    // 1. Jamais une simple reformulation du sujet.
    const rec = recouvrement(sujet, problematique);
    const jac = jaccard(sujet, problematique);
    if (sujet && (rec >= 0.9 || jac >= 0.7)) {
      ajouter(
        'problematique_reformulation',
        `La problématique recouvre ${Math.round(rec * 100)} % du vocabulaire de l'intitulé : c'est le sujet avec un point d'interrogation, pas une problématique. Ajoute une vraie tension et un périmètre propre.`
      );
    }

    // 2. Jamais un débat d'opinion.
    const debat = contientTournure(norm, TOURNURES_DEBAT);
    if (debat) {
      ajouter(
        'problematique_debat',
        `La tournure « ${debat} » ouvre un débat d'opinion (jugement de valeur) au lieu d'un problème à instruire. Reformule autour d'un problème réel et analysable.`
      );
    }

    // 3. Jamais une question purement descriptive : elle doit appeler une réponse.
    const constat = contientTournure(norm, TOURNURES_CONSTAT);
    if (constat) {
      ajouter(
        'problematique_descriptive',
        `La tournure « ${constat} » constate ou explique un phénomène sans appeler de réponse. La soutenance doit déboucher sur des préconisations : reformule autour du levier de résolution.`
      );
    }
    const aLevier = contientTournure(norm, LEVIERS_SOLUTION);
    if (!aLevier) {
      ajouter(
        'problematique_sans_levier',
        "Aucun levier de résolution n'est visible (pas de « comment », « dans quelle mesure », « quelles conditions »…) : vérifie que la question invite bien à apporter une SOLUTION argumentée."
      );
    }

    // 4. Friction réelle : la tension (phrase) doit être renseignée et ancrée
    // dans le sujet / la question.
    if (!tension) {
      ajouter(
        'problematique_sans_tension',
        "La tension (friction d'entreprise) n'est pas renseignée : la problématique doit naître d'une tension réelle, pas d'un simple constat."
      );
    } else {
      const recTension = recouvrement(tension, `${problematique} ${sujet}`);
      if (recTension < 0.1) {
        ajouter(
          'problematique_tension_decorrelee',
          "La tension ne recoupe ni la question ni le sujet : la problématique est posée sans friction d'entreprise identifiable."
        );
      }
    }

    // 4 bis. Les préconisations doivent répondre À CETTE question (vocabulaire
    // partagé) — sinon la réponse est décorrélée du problème posé.
    const preconisations = liste(contrat.preconisations);
    if (preconisations.length > 0) {
      const textePreco = aplatir(preconisations);
      const recPreco = recouvrement(problematique, `${textePreco} ${tension}`);
      if (recPreco < 0.2) {
        ajouter(
          'contrat_solutions_decorrelees',
          "Les préconisations ne reprennent pas le vocabulaire de la tension ni de la question : les solutions ne répondent pas à la problématique posée."
        );
      }
    }

    // 5. Le problème doit être ancré dans le sujet (jamais hors sujet).
    const recSujet = recouvrement(problematique, `${sujet} ${theme}`);
    if (recSujet < 0.2) {
      ajouter(
        'problematique_hors_sujet',
        `La problématique ne partage que ${Math.round(recSujet * 100)} % de vocabulaire avec le sujet et le thème : risque de hors-sujet. Elle doit rester liée au sujet sans le paraphraser.`
      );
    }
  }

  // ---- Ligne directrice (à tenir tout au long de la présentation) ----
  if (!ligneDirectrice) {
    ajouter(
      'ligne_directrice_absente',
      "Aucune ligne directrice : c'est le fil rouge qui doit être tenu d'un bout à l'autre de la présentation. Elle découle de la problématique et doit être formulée à l'étape 2."
    );
  } else {
    const recLd = recouvrement(ligneDirectrice, problematique) || recouvrement(problematique, ligneDirectrice);
    if (problematique && recLd < 0.15) {
      ajouter(
        'ligne_directrice_decrochee',
        "La ligne directrice ne recoupe pas la problématique retenue : le fil rouge annoncé ne correspond pas à la question posée. Réaligne-la sur la problématique."
      );
    }
    const recSujetLd = recouvrement(ligneDirectrice, sujet);
    if (sujet && recSujetLd === 0) {
      ajouter(
        'ligne_directrice_hors_sujet',
        "La ligne directrice ne partage aucun terme significatif avec l'intitulé du sujet : vérifie qu'elle reste bien dans son périmètre."
      );
    }
  }

  // ---- Méthodologie globale Armelle Aymond (toute la présentation) ----
  const plan = data.plan || {};
  const sectionsPlan = Array.isArray(plan.sections) ? plan.sections : [];
  if (sectionsPlan.length === 0) {
    ajouter(
      'methodologie_plan_absent',
      "Aucun plan détaillé : la méthode Armelle Aymond est globale et se matérialise d'abord par le plan (entonnoir Contexte → Enjeux → Problématique → Existant → Données → Cas réels → Solutions → Conclusion)."
    );
  }

  // ---- Justification du problème (CONTRÔLE DÉPLACÉ À L'EXPORT) ----
  // La justification est facultative à l'étape Passe A : elle peut être
  // construite ensuite, avec le contexte, les enjeux et l'existant. C'est ICI,
  // avant l'export du Markdown / PPTX, que l'on vérifie que l'ensemble final
  // démontre bien que le problème est réel et actuel — soit par une
  // justification explicitement renseignée, soit par sa démonstration dans le
  // contexte, les enjeux, l'existant ou la conclusion.
  if (problematique) {
    const justificationRenseignee = String(contrat.justificationProbleme || '').trim() !== '';
    const support = data.support || {};
    const recherche = data.recherche || {};
    const texteFilRouge = [
      aplatir(contrat),
      aplatir(plan),
      aplatir(support),
      aplatir(recherche),
    ].join(' \n ');
    const MOTIF_JUSTIFICATION_METIER =
      /(parce que|c'est pourquoi|en raison de|du fait de|puisque|car )|(aujourd'hui|actuellem|ces dernieres annees|en 20\d\d|depuis \d{4})|(cout|perte|manque a gagner|amende|penalite|risque|impact|urgence|menace|penurie|tension|pression)/;
    const justificationDemontee =
      MOTIF_JUSTIFICATION_METIER.test(texteFilRouge) &&
      /(contexte|enjeu|existant|conclusion|probleme|problematique)/.test(texteFilRouge);
    if (!justificationRenseignee && !justificationDemontee) {
      ajouter(
        'justification_absente_export',
        "L'ensemble final ne démontre nulle part en quoi le problème est réel et actuel pour l'entreprise : renseigne la justification du problème, ou démontre-le dans le contexte, les enjeux, l'existant ou la conclusion."
      );
    }
  }

  return {
    sujet,
    theme,
    problematique,
    ligneDirectrice,
    tension: tension || null,
    constats,
  };
}

// ---------------------------------------------------------------------------
// Observation déterministe des INTRANTS du Markdown, critère par critère
//
// Le fichier Markdown exporté (Claude Desktop, Gamma, Claude Design) est
// assemblé à partir des étapes AMONT de la session — analyse, problématique,
// plan, glossaire et recherche (voir services/promptBuilder.js). Le support
// n'est PAS un intrant de l'export : il est produit APRÈS, à partir de ce
// Markdown, puis réimporté. Juger les slides au moment de l'export n'aurait
// donc aucun sens et rendrait la vérification muette (tout « non applicable »).
// C'est pourquoi l'observation porte exclusivement sur les intrants.
// ---------------------------------------------------------------------------

/** Aplatit récursivement une valeur en texte exploitable par les règles. */
function aplatir(valeur, profondeur = 0) {
  if (valeur == null || profondeur > 6) return '';
  if (typeof valeur === 'string') return valeur;
  if (typeof valeur === 'number' || typeof valeur === 'boolean') return String(valeur);
  if (Array.isArray(valeur)) return valeur.map((v) => aplatir(v, profondeur + 1)).join(' \n ');
  if (typeof valeur === 'object') {
    return Object.values(valeur).map((v) => aplatir(v, profondeur + 1)).join(' \n ');
  }
  return '';
}

/** Liste sûre : renvoie le tableau ou un tableau vide. */
function liste(valeur) {
  return Array.isArray(valeur) ? valeur : [];
}

/** Texte d'un élément qui peut être une chaîne ou un objet. */
function texteDe(valeur) {
  if (typeof valeur === 'string') return valeur;
  return aplatir(valeur);
}

/**
 * Contexte d'observation : tout ce dont les règles de critères ont besoin,
 * calculé une seule fois sur les intrants du Markdown.
 */
function observer(session, filRouge) {
  const data = session?.data || {};
  const analyse = data.analyse || {};
  // Le contrat métier (Passe A) remplace l'ancienne étape `probleme` : c'est lui
  // qui porte la question, la tension, les préconisations et les cas réels.
  const contrat = data.contrat && typeof data.contrat === 'object' ? data.contrat : {};
  const plan = data.plan || {};
  const glossaire = data.glossaire || {};
  const recherche = data.recherche || {};
  const support = data.support || {};

  // ---- Justification métier à l'EXPORT ----
  // Depuis la Passe A, `justificationProbleme` est FACULTATIF à l'étape
  // Problématique : il peut être complété plus tard. Le contrôle strict est donc
  // déplacé ICI, au moment de l'export, où l'ensemble du travail existe.
  // La justification est considérée présente si elle est explicitement
  // renseignée, OU si le problème est démontré (réel, actuel, chiffré, d'entreprise)
  // dans le contexte, les enjeux, l'existant ou la conclusion.
  //
  // Lecture du contrat AVANT toute fonction qui l'utilise : `justification` est
  // consommée par le calcul ci-dessous. La déclarer plus bas (à côté des autres
  // champs du contrat) provoquait une ReferenceError de zone morte temporelle
  // (« Cannot access 'justification' before initialization »), remontée brute à
  // l'utilisateur au moment de la vérification d'export.
  const justification = String(contrat.justificationProbleme || '').trim();

  const texteAnalyse = aplatir(analyse);
  const texteContrat = aplatir(contrat);
  const textePlan = aplatir(plan);
  const texteGlossaire = aplatir(glossaire);
  const texteRecherche = aplatir(recherche);
  const texteSupport = aplatir(support);
  const texteAmont = [texteAnalyse, texteContrat, textePlan, texteGlossaire, texteRecherche].join(' \n ');

  // Sources où une justification métier peut légitimement vivre.
  const texteJustificationExport = [
    texteContrat,
    textePlan,
    texteSupport,
    texteRecherche,
    texteAnalyse,
  ].join(' \n ');
  const justificationProblemeRenseignee = justification !== '';
  // Un marqueur de problème RÉEL et ACTUEL : causalité, actualité, chronicité,
  // coût, urgence ou impact d'entreprise — pas une simple occurrence du mot
  // « problème ».
  const MOTIF_JUSTIFICATION_METIER =
    /(parce que|c'est pourquoi|en raison de|du fait de|puisque|car )|(aujourd'hui|actuellem|ces dernieres annees|en 20\d\d|depuis \d{4})|(cout|perte|manque a gagner|amende|penalite|risque|impact|urgence|menace|penurie|tension|pression)/;
  const justificationDansLeFil =
    MOTIF_JUSTIFICATION_METIER.test(texteJustificationExport) &&
    /(contexte|enjeu|existant|conclusion|probleme|problematique)/.test(texteJustificationExport);
  const justificationExport = justificationProblemeRenseignee || justificationDansLeFil;

  const aTexte = (regex) => regex.test(texteAmont);

  // ---- Étape analyse ----
  const motsCles = liste(analyse.mots_cles);
  const notions = liste(analyse.notions_a_maitriser);
  const tensionsAnalyse = liste(analyse.tensions);
  const positionnement = String(analyse.positionnement_strategique || '').trim();
  const reformulation = String(analyse.reformulation || '').trim();

  // ---- Contrat métier (Passe A) ----
  const questionContrat = String(contrat.problematique || '').trim();
  const tensionContrat = String(contrat.tension || '').trim();
  const limitesExistant = liste(contrat.limitesExistant);
  const preconisations = liste(contrat.preconisations);
  const casContrat = liste(contrat.casEntreprises);
  const ouvertureContrat = String(contrat.ouverture || '').trim();
  const motsClesContrat = liste(contrat.motsCles);

  // ---- Étape plan ----
  const sectionsPlan = liste(plan.sections);
  const filDirecteur = String(plan.fil_directeur || '').trim();
  const objections = liste(plan.objections_et_reponses);
  const ouverture = plan.ouverture || {};
  const dureePlan = Number(plan.duree_totale_minutes || 0);
  const repartition = plan.repartition_temps || {};
  const sommeRepartition = Object.values(repartition).reduce(
    (t, v) => t + (Number(v) || 0),
    0
  );
  const questionsJury = liste(recherche.questions_du_jury);

  // ---- Étape glossaire ----
  const termes = liste(glossaire.termes);
  const sources = liste(glossaire.sources);

  // ---- Étape recherche (alimente le fond du Markdown) ----
  const referencesTheoriques = liste(recherche.references_theoriques);
  const exemplesEntreprises = liste(recherche.exemples_entreprises);
  const donneesARech = liste(recherche.donnees_a_rechercher);
  const organismes = liste(recherche.organismes_exemples);

  // Cas d'entreprise du CONTRAT (Passe A) : chaque cas doit porter un nom, un
  // chiffre, un angle lié à la tension, une source, et au moins un échec.
  const casContratSources = casContrat.filter(
    (c) =>
      String(c?.nom || '').trim() !== '' &&
      String(c?.source || '').trim() !== '' &&
      String(c?.chiffre || '').trim() !== ''
  );
  const casContratEchec = casContrat.filter((c) => /echec/i.test(String(c?.issue || '')));

  // Cas d'entreprise issus de la recherche d'arrière-plan (repli si le contrat
  // n'a pas encore produit ses cas).
  const casSources = exemplesEntreprises.filter(
    (c) => String(c?.source || '').trim() !== '' && String(c?.nom || '').trim() !== ''
  );
  const casEchec = exemplesEntreprises.filter((c) =>
    /echec|limite/i.test(String(c?.issue || ''))
  );

  // Un exemple d'entreprise est « sourcé et daté » si sa source est renseignée.
  const aEchecOuLimite =
    casContratEchec.length > 0 ||
    casEchec.length > 0 ||
    /(echec|limite|contre-exemple|insuffisan|defaillance|faiblesse)/.test(texteRecherche);

  // ---- Chronologie du plan (méthode Armelle : entonnoir) ----
  // L'ordre attendu est porté par les intitulés de sections : Contexte → Enjeux
  // → Existant → Données → Cas réels → Solutions → Conclusion.
  const ORDRE_ATTENDU = [
    { cle: 'contexte', motif: /contexte|introduction|accroche|presentation du sujet/i },
    { cle: 'enjeux', motif: /enjeu/i },
    { cle: 'problematique', motif: /problematique|problème|question centrale/i },
    { cle: 'existant', motif: /existant|etat de l.art|concepts|theori|theorique/i },
    { cle: 'donnees', motif: /donnee|chiffre|statisti|marche/i },
    { cle: 'cas', motif: /cas|benchmark|entreprise|exemple/i },
    { cle: 'solutions', motif: /solution|preconisation|recommandation|reponse/i },
    { cle: 'conclusion', motif: /conclusion|ouverture|synthese/i },
  ];
  const rangsSections = sectionsPlan
    .map((section, i) => {
      const intitule = texteDe(section?.partie || section?.titre || section?.role || '');
      const trouve = ORDRE_ATTENDU.findIndex((o) => o.motif.test(intitule));
      return trouve === -1 ? null : { rang: trouve, index: i, intitule };
    })
    .filter(Boolean);
  let ordreInvalide = null;
  for (let i = 1; i < rangsSections.length; i += 1) {
    if (rangsSections[i].rang < rangsSections[i - 1].rang) {
      ordreInvalide = { avant: rangsSections[i - 1].intitule, apres: rangsSections[i].intitule };
      break;
    }
  }

  // ---- Couverture TOHEE dans les enjeux produits par l'analyse ----
  const texteEnjeux = [texteAnalyse, textePlan].join(' \n ');
  const dimensionsTohee = [
    /techni/i,
    /organisa/i,
    /humain|social|\brh\b|manager|equipe/i,
    /economi|cout|budget|financier|rentab/i,
    /environnement|ecolog|\brse\b|carbone|climat|durable/i,
  ];
  const dimensionsCouvertes = dimensionsTohee.filter((r) => r.test(texteEnjeux)).length;

  // ---- Volumétrie : le plan doit tenir dans le temps imparti ----
  const minutesSections = sectionsPlan.reduce((t, s) => t + (Number(s?.minutes) || 0), 0);
  const tempsPlan = dureePlan || minutesSections;
  // Le support compte 20 slides page de titre comprise (~1 min 15 par slide) :
  // on vérifie la compatibilité avec le temps du plan.
  const estimationTemps = Math.round(VOLUME_CIBLE_TOTAL * 1.25);

  return {
    // données brutes
    analyse,
    contrat,
    plan,
    glossaire,
    recherche,
    support,
    filRouge,
    // textes agrégés
    texteAnalyse,
    texteContrat,
    textePlan,
    texteGlossaire,
    texteRecherche,
    texteSupport,
    texteAmont,
    aTexte,
    // compteurs et listes exploitables
    notions,
    motsCles,
    tensionsAnalyse,
    positionnement,
    reformulation,
    questionContrat,
    tensionContrat,
    justification,
    // Justification jugée à l'EXPORT (explicite OU démontrée dans le fil rouge) :
    // c'est elle qui porte le contrôle strict, plus la Passe A.
    justificationExport,
    justificationProblemeRenseignee,
    limitesExistant,
    preconisations,
    casContrat,
    ouvertureContrat,
    motsClesContrat,
    sectionsPlan,
    filDirecteur,
    objections,
    ouverture,
    dureePlan,
    repartition,
    sommeRepartition,
    questionsJury,
    termes,
    sources,
    referencesTheoriques,
    exemplesEntreprises,
    casSources,
    casEchec,
    casContratSources,
    casContratEchec,
    donneesARech,
    organismes,
    aEchecOuLimite,
    dimensionsCouvertes,
    ordreInvalide,
    tempsPlan,
    estimationTemps,
  };
}

/**
 * Règles d'évaluation : une par critère de la grille. Chaque règle renvoie
 * { statut, pointsFaibles: string[], forces: string[] } — jamais un texte
 * d'appréciation libre.
 *
 * Les points faibles portent `{ code, message }` pour être actionnables et
 * dédupliqués avec les constats du fil rouge.
 */
function evaluerCritere(id, obs) {
  const pf = [];
  const forces = [];
  const faible = (code, message) => pf.push({ code, message });
  const force = (message) => forces.push(message);

  switch (id) {
    // ---- BLOC 1 : fond ----
    case '1.1': {
      if (!obs.reformulation && !obs.positionnement && !obs.filRouge.problematique) {
        faible('1.1-contexte', "Aucune reformulation du sujet ni positionnement stratégique (étape Analyse) : le Markdown ne peut pas présenter le contexte attendu par le jury.");
      } else {
        if (obs.positionnement) {
          force('Positionnement stratégique du sujet renseigné dans l’analyse.');
        } else {
          faible('1.1-positionnement', "Le positionnement stratégique du sujet (en quoi il compte pour l’entreprise et pour qui) n’est pas renseigné : le critère 1.1 du jury porte précisément dessus.");
        }
        if (obs.motsCles.length === 0) {
          faible('1.1-mots-cles', "Aucun mot clé du sujet défini dans l’analyse : le Markdown n’a pas de vocabulaire d’ancrage pour l’introduction.");
        } else {
          force(`${obs.motsCles.length} mot(s) clé(s) défini(s).`);
        }
      }
      break;
    }

    case '1.2': {
      if (obs.dimensionsCouvertes < 3) {
        faible('1.2-enjeux', `Seulement ${obs.dimensionsCouvertes} dimension(s) TOHEE sur 5 sont identifiables dans l’analyse et le plan : le jury attend un ancrage sur les cinq dimensions (Technique, Organisationnel, Humain, Économique, Environnemental).`);
      } else {
        force(`${obs.dimensionsCouvertes} dimensions TOHEE sur 5 identifiables.`);
      }
      if (obs.tensionsAnalyse.length === 0) {
        faible('1.2-tensions', "Aucune tension relevée dans l’analyse : les enjeux se lisent comme un constat, pas comme ce qui se joue réellement pour l’entreprise.");
      } else {
        force(`${obs.tensionsAnalyse.length} tension(s) identifiée(s).`);
      }
      break;
    }

    case '1.3': {
      const total = obs.notions.length + obs.referencesTheoriques.length;
      if (total === 0) {
        faible('1.3-concepts', "Aucun concept théorique nommé (modèle, norme, auteur, cadre) ni dans l’analyse ni dans la recherche : la rigueur académique attendue n’est pas démontrée.");
      } else {
        force(`${total} notion(s) et référence(s) académiques mobilisées.`);
        const notionsAvecRef = obs.notions.filter(
          (n) => String(n?.reference_theorique || '').trim() !== ''
        );
        if (notionsAvecRef.length === 0 && obs.referencesTheoriques.length === 0) {
          faible('1.3-references', "Les notions sont listées sans référence théorique associée : le jury attend des modèles, normes ou auteurs explicitement nommés.");
        } else {
          force(`${notionsAvecRef.length + obs.referencesTheoriques.length} référence(s) théorique(s) nommée(s).`);
        }
      }
      break;
    }

    case '1.4': {
      // Les cas du CONTRAT (Passe A) priment : c'est eux qui partent dans les
      // slides. La recherche d'arrière-plan sert seulement de repli.
      const nbCas = obs.casContrat.length || obs.exemplesEntreprises.length;
      if (nbCas === 0) {
        faible('1.4-benchmark', "Aucun cas d'entreprise réelle : le benchmark exigé par le jury est absent du contrat (Passe A) et de la recherche documentaire.");
      } else if (obs.casContrat.length > 0) {
        force(`${obs.casContrat.length} cas d’entreprise(s) dans le contrat (Passe A).`);
        if (obs.casContratSources.length < obs.casContrat.length) {
          faible('1.4-source-cas', `${obs.casContrat.length - obs.casContratSources.length} cas d'entreprise du contrat n'ont pas à la fois un nom, un chiffre et une source : chaque cas réel doit être sourcé et chiffré.`);
        } else {
          force('Tous les cas d’entreprise sont nommés, chiffrés et sourcés.');
        }
        if (!obs.aEchecOuLimite) {
          faible('1.4-echec', "Aucun échec ni limite dans les cas d'entreprise du contrat : le jury sanctionne le plaidoyer à sens unique (au moins un succès ET un échec sont attendus).");
        } else {
          force('Au moins un échec ou une limite vient nuancer le propos.');
        }
      } else {
        force(`${obs.exemplesEntreprises.length} cas d’entreprise(s) identifié(s) dans la recherche.`);
        if (obs.casSources.length < obs.exemplesEntreprises.length) {
          faible('1.4-source-cas', `${obs.exemplesEntreprises.length - obs.casSources.length} cas d’entreprise ne portent pas de source : chaque cas réel doit être sourcé et daté.`);
        } else {
          force('Tous les cas d’entreprise sont sourcés.');
        }
        if (!obs.aEchecOuLimite) {
          faible('1.4-echec', "Aucun échec ni limite mentionné dans les cas d’entreprise : le jury sanctionne le plaidoyer à sens unique (au moins un succès ET un échec ou une limite sont attendus).");
        } else {
          force('Au moins une limite ou un échec vient nuancer le propos.');
        }
        if (obs.exemplesEntreprises.length === 1) {
          faible('1.4-regroupe', "Un seul cas d’entreprise est mobilisé : le benchmark est trop étroit pour permettre une comparaison.");
        }
      }
      break;
    }

    case '1.5': {
      if (!obs.filRouge.problematique) {
        faible('1.5-solutions', "Aucune problématique retenue : sans question à instruire, la réponse stratégique attendue par le jury ne peut pas exister.");
      } else {
        force('La problématique retenue cadre la réponse stratégique.');
      }
      const existeSolutions = /solution|preconisation|recommandation|levier|action/i.test(
        obs.textePlan + ' ' + obs.texteRecherche
      );
      if (!existeSolutions) {
        faible('1.5-reponse', "Aucune section de solutions ou de préconisations dans le plan : le jury attend une prise de position claire et des propositions argumentées.");
      } else {
        force('Le plan porte une partie solutions / préconisations.');
      }
      if (!obs.justificationExport) {
        faible('1.5-justification', "L'ensemble final ne démontre nulle part en quoi le problème est réel et actuel pour l'entreprise : ni justification renseignée, ni démonstration dans le contexte, les enjeux, l'existant ou la conclusion.");
      } else {
        force('La problématique est justifiée (problème réel, actuel, d’entreprise).');
      }
      break;
    }

    case '1.6': {
      const texteSolutions = obs.textePlan;
      if (!/avant|pendant|apres/i.test(texteSolutions)) {
        faible('1.6-phases', "Aucune structuration avant / pendant / après dans le plan : le jury attend une vision globale du champ applicatif.");
      } else {
        force('Préconisations structurées en phases (avant / pendant / après).');
      }
      if (!/pme|eti|grand groupe|tpe|multinationale|taille|structure/i.test(texteSolutions)) {
        faible('1.6-taille', "Aucune contextualisation selon la taille ou le type de structure : la grille attend une solution adaptable au type d’entreprise.");
      } else {
        force('Préconisations déclinées selon le type de structure.');
      }
      break;
    }

    case '1.7': {
      // Les questions prévisibles du jury vivent dans la recherche
      // (`questions_du_jury`) et dans le plan (`objections_et_reponses`).
      const total = obs.questionsJury.length + obs.objections.length;
      if (total === 0) {
        faible('1.7-notes', "Aucune question prévisible du jury ni objection anticipée : rien ne prépare l’étudiant aux échanges avec le jury.");
      } else {
        force(`${total} question(s) / objection(s) du jury anticipée(s).`);
        const avecReponse = [
          ...obs.questionsJury.filter((q) => String(q?.angle_de_reponse || '').trim() !== ''),
          ...obs.objections.filter((o) => String(o?.reponse || '').trim() !== ''),
        ];
        if (avecReponse.length === 0) {
          faible('1.7-objections', "Les questions du jury sont listées sans élément de réponse : anticipe la réponse attendue pour chacune.");
        } else {
          force(`${avecReponse.length} question(s) accompagnée(s) d’un angle de réponse.`);
        }
      }
      break;
    }

    // ---- BLOC 2 : forme ----
    case '2.1': {
      if (obs.ordreInvalide) {
        faible('2.1-ordre', `L’enchaînement du plan ne respecte pas la structure imposée : « ${obs.ordreInvalide.avant} » puis « ${obs.ordreInvalide.apres} », alors que l’ordre attendu est Contexte → Enjeux → Problématique → Existant → Statistiques → Cas réels → Solutions → Conclusion.`);
      } else if (obs.sectionsPlan.length > 0) {
        force('L’ordre des sections respecte l’effet entonnoir.');
      }
      if (!obs.filDirecteur) {
        faible('2.1-fil-directeur', "Le plan ne porte pas de « fil directeur » : rien ne garantit que les parties s’enchaînent comme un seul raisonnement.");
      } else {
        force('Fil directeur du plan renseigné.');
        if (obs.filRouge.ligneDirectrice) {
          const recFd = recouvrement(obs.filDirecteur, obs.filRouge.ligneDirectrice);
          if (recFd < 0.15) {
            faible('2.1-fil-directeur-decroche', "Le fil directeur du plan ne recoupe pas la ligne directrice de la problématique : les deux fils rouges divergent.");
          }
        }
      }
      if (obs.sectionsPlan.length === 0) {
        faible('2.1-sections', "Aucune section dans le plan : la structure de la présentation n’est pas définie.");
      }
      break;
    }

    case '2.2':
      // Expression orale, écoute, remise en cause : non mesurable sur un fichier.
      forces.push('Critère oral (communication) : à défendre à l’oral, non mesurable sur le fichier.');
      break;

    case '2.3': {
      const aExemples = obs.exemplesEntreprises.length > 0 || obs.donneesARech.length > 0;
      if (!aExemples) {
        faible('2.3-illustration', "Aucun exemple d’entreprise ni donnée chiffrée à mobiliser : l’argumentation du Markdown manque d’illustrations percutantes.");
      } else {
        force('La démonstration pourra s’appuyer sur des exemples réels et/ou des données chiffrées.');
      }
      if (!obs.aEchecOuLimite) {
        faible('2.3-nuance', "Aucune limite ni contre-exemple : la prise de position paraîtra unilatérale, ce que le jury sanctionne sur le dynamisme de l’argumentation.");
      }
      break;
    }

    case '2.4': {
      if (obs.sectionsPlan.length === 0) {
        faible('2.4-plan', "Aucun plan : la maîtrise de l’exercice et la gestion du temps ne peuvent pas être évaluées.");
      } else {
        if (obs.tempsPlan && obs.estimationTemps > obs.tempsPlan * 1.3) {
          faible('2.4-temps', `Le volume cible (${VOLUME_CIBLE_TOTAL} slides, soit environ ${obs.estimationTemps} min) dépasse le temps prévu au plan (${obs.tempsPlan} min) : le respect du temps imparti est noté, resserre le contenu.`);
        } else if (obs.tempsPlan) {
          force(`Volume compatible avec le temps imparti (${obs.tempsPlan} min).`);
        }
        if (obs.dureePlan && obs.sommeRepartition && Math.abs(obs.sommeRepartition - obs.dureePlan) > 1) {
          faible('2.4-repartition', `La répartition du temps totalise ${obs.sommeRepartition} min pour une durée annoncée de ${obs.dureePlan} min : la gestion du temps n’est pas cohérente.`);
        } else if (obs.sommeRepartition) {
          force('Répartition du temps cohérente avec la durée annoncée.');
        }
      }
      break;
    }

    case '2.5': {
      if (!obs.filRouge.problematique) {
        faible('2.5-problematique', "Aucune problématique exploitable : la finesse du décryptage de la problématique ne peut pas être démontrée.");
      } else if (obs.filRouge.constats.some((c) => c.code.startsWith('problematique_'))) {
        faible('2.5-analyse', "La problématique présente des faiblesses d’analyse (voir les points faibles « problématique » ci-dessous) : le jury évalue la finesse du décryptage.");
      } else {
        force('La problématique retenue est analysable et bornée par le sujet.');
      }
      const tension = obs.tensionContrat;
      if (tension) {
        force('La tension (friction d’entreprise) est explicitée.');
      } else {
        faible('2.5-tension', "La tension du contrat n'est pas explicitée : le décryptage reste superficiel.");
      }
      if (obs.ordreInvalide) {
        faible('2.5-ordre', "Le décryptage n’est pas progressif : la rupture d’ordre dans le plan empêche l’analyse de se construire par étapes.");
      }
      break;
    }

    case '2.6': {
      if (obs.termes.length === 0) {
        faible('2.6-glossaire', "Aucun terme défini dans le glossaire : la capacité de synthèse (aller à l’essentiel, en langage clair) ne peut pas être démontrée.");
      } else {
        force(`${obs.termes.length} terme(s) défini(s) en langage clair.`);
        const definitionsLongues = obs.termes.filter((t) => {
          const mots = String(t?.definition || '').trim().split(/\s+/).filter(Boolean).length;
          return mots > 25;
        });
        if (definitionsLongues.length > 0) {
          faible('2.6-definitions', `${definitionsLongues.length} définition(s) dépassent 25 mots : une définition de glossaire doit rester une phrase de synthèse.`);
        } else {
          force('Définitions concises (une phrase).');
        }
      }
      if (obs.sources.length === 0) {
        faible('2.6-sources', "Aucun résumé de source dans le glossaire : les sources ne sont pas restituées sous forme synthétique.");
      } else {
        force(`${obs.sources.length} source(s) résumée(s).`);
      }
      break;
    }

    case '2.7': {
      const questionOuverture = String(obs.ouverture?.question || '').trim();
      if (!questionOuverture) {
        faible('2.7-ouverture', "Le plan ne porte pas de question d’ouverture prospective : la prise de recul attendue par le jury est absente.");
      } else if (!questionOuverture.includes('?')) {
        faible('2.7-ouverture-forme', "L’ouverture du plan n’est pas formulée comme une question ouverte : elle ne se lira pas comme une prise de recul.");
      } else {
        force('Le plan porte une question d’ouverture prospective.');
      }
      if (questionOuverture && !String(obs.ouverture?.pourquoi_elle_reste_ouverte || '').trim()) {
        faible('2.7-ouverture-justification', "L’ouverture n’explique pas pourquoi elle reste volontairement non résolue : le jury attend une prise de recul argumentée.");
      }
      break;
    }

    default:
      // Critère inconnu de ce module (grille modifiée en admin) : on ne
      // prétend pas l'évaluer automatiquement.
      break;
  }

  return { pointsFaibles: pf, forces };
}

/** Traduit les points faibles et la nature du critère en statut + score. */
function statuer(id, pointsFaibles) {
  if (pointsFaibles.length === 0) {
    return CRITERES_QUALITATIFS.has(id)
      ? { statut: 'partiel', score: SCORE_PARTIEL }
      : { statut: 'conforme', score: SCORE_CONFORME };
  }
  // Un point faible « bloquant » (le Markdown ne peut pas partir ainsi) fait
  // tomber le critère ; sinon le critère reste partiel.
  const bloquant = pointsFaibles.some((p) => CODES_BLOQUANTS.has(p.code));
  if (bloquant) return { statut: 'non_conforme', score: SCORE_NON_CONFORME };
  return { statut: 'partiel', score: SCORE_PARTIEL };
}

/**
 * Codes de points faibles qui INTERDISENT l'export. Un Markdown peut être
 * exporté avec des avertissements de forme ou de volume (dont l'étudiant reste
 * maître), mais jamais avec un fil rouge rompu : pas de problématique, pas de
 * ligne directrice, pas de structure, pas de réponse stratégique.
 */
const CODES_BLOQUANTS = new Set([
  // Contrat métier Passe A non validé : on n'exporte pas sur une question non relue.
  'contrat_non_valide',
  // Fil rouge et méthode Armelle Aymond
  'problematique_absente',
  'problematique_hors_sujet',
  'problematique_reformulation',
  'problematique_debat',
  'problematique_descriptive',
  'problematique_sans_tension',
  'problematique_tension_decorrelee',
  'contrat_solutions_decorrelees',
  'ligne_directrice_absente',
  'ligne_directrice_hors_sujet',
  'ligne_directrice_decrochee',
  'methodologie_plan_absent',
  // Justification métier : facultative en Passe A, EXIGÉE à l'export. On
  // n'envoie pas un support qui ne démontre nulle part que le problème est réel.
  'justification_absente_export',
  // Structure et fond minimum du Markdown
  '1.1-contexte',
  '1.2-enjeux',
  '1.3-concepts',
  '1.4-benchmark',
  '1.5-solutions',
  '2.1-ordre',
  '2.1-sections',
  '2.6-glossaire',
]);

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

const LIBELLES_STATUT = {
  conforme: 'Conforme',
  partiel: 'Partiellement conforme',
  non_conforme: 'Non conforme',
};

function arrondi(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Score « LOGIQUE DU SUJET » — checklist métier affichée dans l'UI
//
// Les 14 critères de la grille CESI mesurent la conformité académique. Ce score
// mesure autre chose, et c'est l'objectif n°1 du produit : le support TRAITE-T-IL
// LE SUJET ? La question est-elle liée au sujet et pose-t-elle un problème réel,
// solutionnable par les préconisations qui suivent ? Chaque item est binaire
// (vert / rouge) et l'export est bloqué tant qu'un seul item est rouge.
// ---------------------------------------------------------------------------

function construireScoreLogique(session, obs, filRouge) {
  const contrat = obs.contrat || {};
  const slides = Array.isArray(obs.support?.slides) ? obs.support.slides : [];
  const itemsBruts = [];
  const item = (code, libelle, ok, detail) => itemsBruts.push({ code, libelle, ok: ok === true, detail });

  const codesRejets = new Set([
    ...(filRouge.constats || []).map((c) => c.code),
    ...(contrat.verification?.rejets || []).map((r) => r.code),
    ...(contrat.verification?.avertissements || []).map((a) => a.code),
  ]);

  // 1. Problématique liée au sujet (mots-clés présents, non copie).
  const lieAuSujet =
    !!observationsProblematique(obs) &&
    !codesRejets.has('contrat_hors_sujet') &&
    !codesRejets.has('contrat_copie_sujet') &&
    !codesRejets.has('problematique_hors_sujet') &&
    !codesRejets.has('problematique_reformulation');
  item(
    'logique_pb_liee_sujet',
    'Problématique liée au sujet (mots-clés présents, pas une copie du sujet)',
    lieAuSujet
  );

  // 2. Problème réel : tension + justification présentes et cohérentes.
  // La justification est appréciée à l'EXPORT : explicite dans le contrat, ou
  // démontrée dans le contexte / les enjeux / l'existant / la conclusion. Elle
  // n'est plus exigée à l'étape Passe A.
  const problemeReel =
    !!obs.tensionContrat &&
    !!obs.justificationExport &&
    !codesRejets.has('problematique_sans_tension') &&
    !codesRejets.has('problematique_tension_decorrelee') &&
    !codesRejets.has('contrat_tension_absente');
  item('logique_probleme_reel', 'Problème réel (tension + justification d’entreprise)', problemeReel);

  // 3. L'existant diagnostique CETTE tension (limites explicitées).
  item(
    'logique_existant_diagnostic',
    'Existant = diagnostic de cette tension (limites face à elle)',
    obs.limitesExistant.length > 0,
    obs.limitesExistant.length > 0 ? `${obs.limitesExistant.length} limite(s) de l’existant` : 'Aucune limite de l’existant'
  );

  // 4. Les solutions répondent à la question (vocabulaire partagé).
  item(
    'logique_solutions_repondent',
    'Solutions qui répondent à la question posée',
    obs.preconisations.length > 0 && !codesRejets.has('contrat_solutions_decorrelees'),
    obs.preconisations.length > 0 ? `${obs.preconisations.length} préconisation(s)` : 'Aucune préconisation'
  );

  // 5. Cas d'entreprises dont au moins un échec, tous sourcés.
  const cas = obs.casContrat.length > 0 ? obs.casContrat : obs.exemplesEntreprises;
  const casOk =
    cas.length > 0 &&
    obs.aEchecOuLimite &&
    (obs.casContrat.length > 0
      ? obs.casContratSources.length === obs.casContrat.length
      : obs.casSources.length === obs.exemplesEntreprises.length);
  item(
    'logique_cas_sources',
    'Cas d’entreprises sourcés, dont au moins un échec',
    casOk,
    casOk ? `${cas.length} cas, dont un échec` : 'Cas manquants, non sourcés ou sans échec'
  );

  // 6. Concision : le compresseur est passé et n'a rien laissé de bloquant.
  const rapportCompression = obs.support?.rapport_compression || null;
  const concisionOk =
    slides.length > 0 &&
    (!rapportCompression ||
      ((rapportCompression.phrases || 0) === 0 &&
        (rapportCompression.formulesIA || []).length === 0 &&
        (rapportCompression.deuxCamps || 0) === 0));
  item(
    'logique_concision',
    'Slides concises (une idée par puce, fragments nominaux, pas de formule IA)',
    concisionOk
  );

  // 7. Sources sous CHAQUE chiffre (dans le contrat comme dans les slides).
  const chiffresSansSource = (contrat.contexte || []).filter(
    (c) => /\d/.test(String(c?.fait || '')) && !String(c?.source || '').trim()
  );
  item(
    'logique_sources_chiffres',
    'Une source sous chaque chiffre',
    chiffresSansSource.length === 0,
    chiffresSansSource.length === 0 ? 'Tous les chiffres sont sourcés' : `${chiffresSansSource.length} chiffre(s) sans source`
  );

  // 8. 20 slides, plan en 2e, problématique révélée seulement sur sa slide.
  const titres = slides.map((s) => String(s?.titre || ''));
  const nbSlidesOk = slides.length === VOLUME_CIBLE_TOTAL;
  const planEnDeuxieme = /plan/i.test(titres[1] || '');
  const indexPb = titres.findIndex((t) => /problematique/i.test(t));
  const pbReveleeSeulementSurSaSlide =
    indexPb === -1 ||
    titres.slice(0, indexPb).every((t) => !/problematique/i.test(t)) ||
    indexPb === titres.findIndex((t) => /problematique/i.test(t));
  item(
    'logique_structure_20_slides',
    '20 slides, plan en 2e, problématique révélée seulement sur sa slide',
    nbSlidesOk && planEnDeuxieme && pbReveleeSeulementSurSaSlide,
    `${slides.length} slides`
  );

  // 9. Pas de débat « deux camps » (Pour / Contre, Avantages / Risques).
  const deuxCampsSlide = slides.some((s) => {
    const t = aplatir(s);
    return /pour\s*\/\s*contre|avantages?\s*\/\s*risques?|d’un côté.{0,30}d’un autre/i.test(t);
  });
  item('logique_pas_deux_camps', 'Aucun débat à deux camps (Pour/Contre, Avantages/Risques)', !deuxCampsSlide);

  // 10. Notes du présentateur conformes (présentes et non vides).
  const notesOk =
    slides.length > 0 &&
    slides.every((s) => String(s?.notes || s?.notes_orateur || '').trim().length > 0);
  item('logique_notes_conformes', 'Notes du présentateur présentes sur chaque slide', notesOk);

  // 11. Texte qui sonne humain (filet anti-formules IA).
  const formulesIA = [
    'il convient', 'il est essentiel', 'dans un contexte en mutation', 'afin de garantir',
    'synergie', 'au cœur de', 'veritable levier', 'véritable levier', 'a l ere du', 'à l’ère du',
    'aujourd hui plus que jamais', 'aujourd’hui plus que jamais',
  ];
  const texteSlides = normaliser(slides.map((s) => aplatir(s)).join(' \n '));
  const formulesTrouvees = formulesIA.filter((f) => texteSlides.includes(normaliser(f)));
  item(
    'logique_style_humain',
    'Texte qui sonne humain (aucune formule IA)',
    formulesTrouvees.length === 0,
    formulesTrouvees.length === 0 ? 'Aucune formule IA détectée' : `Formules IA : ${formulesTrouvees.join(', ')}`
  );

  const items = itemsBruts.map((i) => ({ ...i, vert: i.ok === true }));
  const verts = items.filter((i) => i.vert).length;
  return {
    items,
    verts,
    total: items.length,
    pourcentage: items.length > 0 ? Math.round((verts / items.length) * 100) : 0,
    conforme: verts === items.length,
    rouges: items.filter((i) => !i.vert).map((i) => ({ code: i.code, libelle: i.libelle, detail: i.detail })),
  };
}

/** La problématique du contrat est-elle exploitable (présente et non triviale) ? */
function observationsProblematique(obs) {
  return String(obs?.questionContrat || '').trim();
}

/**
 * Construit le rapport de vérification complet.
 *
 * @returns {Promise<object>} rapport
 */
async function construireRapportVerification(session) {
  const referentiels = await chargerReferentiels();
  const filRouge = diagnostiquerFilRouge(session);
  const obs = observer(session, filRouge);

  const criteres = referentiels.grille.criteres.map((critere) => {
    const { pointsFaibles, forces } = evaluerCritere(critere.id, obs);
    const { statut, score } = statuer(critere.id, pointsFaibles);
    return { ...critere, statut, score, scoreMax: 1, pointsFaibles, forces };
  });

  // Les constats du fil rouge sont rattachés aux critères qu'ils font tomber,
  // pour qu'ils apparaissent dans le rapport à leur place : la problématique
  // relève de 2.5 (analyse) et 1.5 (réponse), la ligne directrice de 2.1.
  const rattacher = (ids, codesPrefixes, codeSpecifiques, libelle) => {
    const concernes = criteres.filter((c) => ids.includes(c.id));
    if (concernes.length === 0) return;
    const constats = filRouge.constats.filter(
      (c) =>
        (codesPrefixes.some((p) => c.code.startsWith(p)) || codeSpecifiques.includes(c.code))
    );
    if (constats.length === 0) return;
    const cible = concernes[0];
    constats.forEach((c) => {
      if (!cible.pointsFaibles.some((p) => p.code === c.code)) {
        cible.pointsFaibles.push({ code: c.code, message: c.message });
      }
    });
    // Recalcul du statut après rattachement.
    const reevalue = statuer(cible.id, cible.pointsFaibles);
    cible.statut = reevalue.statut;
    cible.score = reevalue.score;
    cible.filRouge = libelle;
  };

  rattacher(['2.5'], ['problematique_'], [], 'Problématique (méthode Armelle Aymond)');
  rattacher(['2.1'], ['ligne_directrice_'], ['methodologie_plan_absent'], 'Ligne directrice');

  // Les points faibles restants du fil rouge, s'ils n'ont pas trouvé de critère
  // hôte, sont exposés à part pour ne jamais être perdus.
  const codesRattaches = new Set(criteres.flatMap((c) => c.pointsFaibles.map((p) => p.code)));
  const pointsFaiblesHorsCritere = filRouge.constats.filter((c) => !codesRattaches.has(c.code));

  const scoreTotal = arrondi(criteres.reduce((t, c) => t + c.score, 0));
  const scoreMax = criteres.length;
  const nonConformes = criteres.filter((c) => c.statut === 'non_conforme');
  const bloquants = nonConformes.map((c) => ({
    critere: c.id,
    libelle: c.libelle,
    pointsFaibles: c.pointsFaibles,
  }));

  // Score « logique du sujet » : checklist métier binaire. Un seul item rouge
  // bloque l'export, au même titre qu'une non-conformité de la grille.
  const scoreLogique = construireScoreLogique(session, obs, filRouge);
  if (!scoreLogique.conforme) {
    bloquants.push({
      critere: 'logique',
      libelle: 'Logique du sujet',
      pointsFaibles: scoreLogique.rouges.map((r) => ({
        code: r.code,
        message: `${r.libelle}${r.detail ? ` — ${r.detail}` : ''}`,
      })),
    });
  }

  return {
    genereLe: new Date().toISOString(),
    sujet: filRouge.sujet,
    theme: filRouge.theme,
    problematique: filRouge.problematique,
    ligneDirectrice: filRouge.ligneDirectrice,
    // Volumétrie : le Markdown alimente un support cible de 20 slides, page de
    // titre comprise. On n'observe pas les slides (produit aval) mais on
    // rappelle la cible pour situer le contenu du Markdown.
    volumeCible: VOLUME_CIBLE_TOTAL,
    scoreTotal,
    scoreMax,
    pourcentage: scoreMax > 0 ? Math.round((scoreTotal / scoreMax) * 100) : 0,
    conforme: nonConformes.length === 0 && scoreLogique.conforme,
    scoreLogique,
    bloquants,
    nonConformes: nonConformes.map((c) => c.id),
    blocs: referentiels.grille.blocs.map((b) => ({
      libelle: b.libelle,
      criteres: criteres.filter((c) => c.bloc === b.libelle).map((c) => c.id),
    })),
    criteres,
    pointsFaibles: [
      ...criteres.flatMap((c) =>
        c.pointsFaibles.map((p) => ({ critere: c.id, code: p.code, message: p.message }))
      ),
      ...pointsFaiblesHorsCritere.map((c) => ({ critere: '—', code: c.code, message: c.message })),
    ],
    pointsFaiblesHorsCritere,
    referentiels: {
      grille: referentiels.grille,
      consigneProblematique: referentiels.consigneProblematique,
      consigneLigneDirectrice: referentiels.consigneLigneDirectrice,
      methodologieGlobal: referentiels.methodologieGlobal,
      gardeFous: referentiels.gardeFous,
    },
  };
}

// ---------------------------------------------------------------------------
// Rendu Markdown du rapport
// ---------------------------------------------------------------------------

const ICONES_STATUT = {
  conforme: '✅',
  partiel: '⚠️',
  non_conforme: '❌',
};

function rendreRapportMarkdown(rapport) {
  const lignes = [];
  lignes.push('# Rapport de vérification avant export');
  lignes.push('');
  lignes.push(`> Vérification systématique exécutée avant l'export du fichier Markdown, sur la base de la grille officielle du jury CESI (${rapport.scoreMax} critères).`);
  lignes.push('>');
  lignes.push('> Le jugement porte sur les INTRANTS du Markdown (analyse, problématique, plan, glossaire, recherche) : ce sont eux qui serviront de base à la génération des slides, quel que soit l\'outil utilisé ensuite (Gamma, Claude Design, PowerPoint).');
  lignes.push('');
  lignes.push(`- **Sujet** : ${rapport.sujet || '—'}`);
  if (rapport.theme) lignes.push(`- **Thème** : ${rapport.theme}`);
  lignes.push(`- **Problématique retenue** : ${rapport.problematique ? `« ${rapport.problematique} »` : '—'}`);
  lignes.push(`- **Ligne directrice** : ${rapport.ligneDirectrice ? `« ${rapport.ligneDirectrice} »` : '—'}`);
  lignes.push(`- **Volume cible du support** : ${rapport.volumeCible} slides, page de titre comprise`);
  lignes.push(`- **Score de conformité** : ${rapport.scoreTotal} / ${rapport.scoreMax} (${rapport.pourcentage} %)`);
  lignes.push(`- **Verdict** : ${rapport.conforme ? '✅ CONFORME — export autorisé' : '❌ NON CONFORME — export bloqué'}`);
  lignes.push('');

  lignes.push('## 1. Statut critère par critère');
  lignes.push('');
  rapport.blocs.forEach((bloc) => {
    lignes.push(`### ${bloc.libelle}`);
    lignes.push('');
    lignes.push('| Critère | Intitulé | Statut | Score |');
    lignes.push('| --- | --- | --- | --- |');
    bloc.criteres.forEach((id) => {
      const c = rapport.criteres.find((x) => x.id === id);
      if (!c) return;
      lignes.push(
        `| ${c.id} | ${c.libelle} | ${ICONES_STATUT[c.statut]} ${LIBELLES_STATUT[c.statut]} | ${c.score} / ${c.scoreMax} |`
      );
    });
    lignes.push('');
  });

  const faibles = rapport.pointsFaibles;
  lignes.push('## 1 bis. Score « logique du sujet » — le support traite-t-il le sujet ?');
  lignes.push('');
  if (rapport.scoreLogique) {
    lignes.push(
      `**${rapport.scoreLogique.verts} / ${rapport.scoreLogique.total} (${rapport.scoreLogique.pourcentage} %)** — ${
        rapport.scoreLogique.conforme ? '✅ tous les critères sont verts' : '❌ export bloqué tant qu’un critère est rouge'
      }`
    );
    lignes.push('');
    rapport.scoreLogique.items.forEach((i) => {
      lignes.push(`- ${i.vert ? '✅' : '❌'} ${i.libelle}${i.detail && !i.vert ? ` — ${i.detail}` : ''}`);
    });
  }
  lignes.push('');

  lignes.push('## 2. Points faibles à recorriger');
  lignes.push('');
  if (faibles.length === 0) {
    lignes.push('Aucun point faible détecté : le Markdown est conforme aux attendus vérifiables de la grille.');
  } else {
    lignes.push("Ces points faibles peuvent être corrigés en place : depuis l'écran Support, le bouton « Corriger les points faibles » demande à DeepSeek de réécrire le champ fautif de l'étape concernée, puis renouvelle les Markdown.");
    lignes.push('');
    faibles.forEach((p) => {
      lignes.push(`- **[critère ${p.critere}]** ${p.message}`);
    });
  }
  lignes.push('');

  lignes.push('## 3. Fil rouge : ligne directrice et problématique');
  lignes.push('');
  lignes.push('### 3.1 Problématique — méthode Armelle Aymond');
  lignes.push('');
  lignes.push(rapport.referentiels.consigneProblematique);
  lignes.push('');
  const pfProbleme = rapport.pointsFaibles.filter(
    (p) => p.code.startsWith('problematique_') || p.critere === '2.5'
  );
  lignes.push(
    pfProbleme.length === 0
      ? 'Constat : aucun écart détecté sur la problématique retenue.'
      : 'Constats à corriger :'
  );
  pfProbleme.forEach((p) => lignes.push(`- ${p.message}`));
  lignes.push('');

  lignes.push('### 3.2 Ligne directrice — à tenir tout au long de la présentation');
  lignes.push('');
  lignes.push(rapport.referentiels.consigneLigneDirectrice);
  lignes.push('');
  const pfLd = rapport.pointsFaibles.filter(
    (p) => p.code.startsWith('ligne_directrice_') || p.code === 'methodologie_plan_absent'
  );
  lignes.push(
    pfLd.length === 0
      ? 'Constat : la ligne directrice est présente, cohérente avec la problématique et reprise dans le plan.'
      : 'Constats à corriger :'
  );
  pfLd.forEach((p) => lignes.push(`- ${p.message}`));
  lignes.push('');

  lignes.push('### 3.3 Méthodologie globale Armelle Aymond');
  lignes.push('');
  lignes.push(rapport.referentiels.methodologieGlobal);
  lignes.push('');
  lignes.push("La méthode ne porte pas seulement sur la problématique : elle structure TOUTE la présentation. Vérifie que l'entonnoir est respecté de bout en bout dans le plan et le Markdown.");
  lignes.push('');

  lignes.push('---');
  lignes.push('');
  lignes.push(
    rapport.conforme
      ? "**Export autorisé.** Le rapport est joint au fichier exporté pour garder la trace de la vérification."
      : "**Export bloqué.** Utilise le bouton « Corriger les points faibles » pour faire réécrire par DeepSeek les champs fautifs des étapes concernées, puis relance l'export."
  );
  lignes.push('');
  return lignes.join('\n');
}

/**
 * Bloc compact inséré en tête des fichiers Markdown exportés.
 */
function rendreEnteteVerification(rapport) {
  const lignes = [];
  lignes.push('<!-- VÉRIFICATION AVANT EXPORT — générée automatiquement -->');
  lignes.push("<!-- Contrôle portant sur les intrants du Markdown (analyse, problématique, plan, glossaire, recherche) -->");

  // Rapport de phase 1 (pré-support) : pas de score CESI, seulement des
  // bloquants / avertissements et des critères annoncés pour plus tard.
  if (rapport.phase === 'pre_support') {
    lignes.push(
      `<!-- Préparation : ${rapport.blocking.length} bloquant(s), ${rapport.warnings.length} avertissement(s) -->`
    );
    rapport.warnings.forEach((w) => lignes.push(`<!-- Avertissement : ${w.message} -->`));
    if (rapport.pendingChecks.length > 0) {
      lignes.push('<!-- À vérifier après génération du support :');
      rapport.pendingChecks.forEach((c) => lignes.push(`     - ${c.libelle}`));
      lignes.push('-->');
    }
    lignes.push('');
    return lignes.join('\n');
  }

  lignes.push(`<!-- Score de conformité à la grille CESI : ${rapport.scoreTotal}/${rapport.scoreMax} (${rapport.pourcentage} %) -->`);
  lignes.push(`<!-- ${rapport.criteres.length} critères parcourus, ${rapport.nonConformes.length} non conforme(s) -->`);
  if (rapport.pointsFaibles.length > 0) {
    lignes.push('<!-- Points faibles signalés :');
    rapport.pointsFaibles.forEach((p) => lignes.push(`     - [critère ${p.critere}] ${p.message}`));
    lignes.push('-->');
  }
  lignes.push('');
  return lignes.join('\n');
}

// ---------------------------------------------------------------------------
// Point d'entrée bloquant
// ---------------------------------------------------------------------------

/**
 * Vérifie le support avant export. Lève une erreur 400 contenant le rapport
 * détaillé si des non-conformités bloquantes subsistent ; sinon renvoie le
 * rapport (utilisé pour enrichir le fichier exporté).
 *
 * @param {object} session Session Mongoose.
 * @returns {Promise<object>} rapport de vérification.
 */
async function assertVerificationExport(session) {
  const rapport = await construireRapportVerification(session);
  if (rapport.bloquants.length > 0) {
    const detail = rapport.bloquants
      .flatMap((b) => b.pointsFaibles.map((p) => `• [critère ${p.critere !== undefined ? p.critere : b.critere}] ${p.message}`))
      .join('\n');
    throw httpError(
      400,
      `Vérification avant export ÉCHOUÉE : le support n'est pas conforme à la grille d'évaluation du jury (score ${rapport.scoreTotal}/${rapport.scoreMax}).\n` +
        `${detail}\n` +
        "Corrige ces points faibles (fil rouge : ligne directrice et problématique selon la méthode Armelle Aymond) puis relance l'export. Télécharge le rapport complet pour le détail critère par critère."
    );
  }
  return rapport;
}

// ---------------------------------------------------------------------------
// VÉRIFICATION EN TROIS PHASES
//
// Le rapport ci-dessus parcourt la grille CESI complète. Mais tous ses critères
// ne sont pas applicables au même moment : certains portent sur les SLIDES, qui
// n'existent qu'APRÈS la génération du support. Les appliquer avant revenait à
// bloquer l'étudiant dans une boucle impossible :
//
//     Pas de support → 0 slide et 0 note → export bloqué → support impossible
//
// Les trois fonctions ci-dessous séparent strictement les moments :
//
//   1. verifyPreparationInputs(session)  — AVANT génération du support.
//      Contrôle les INTRANTS : analyse, contrat validé, plan, glossaire,
//      limites de l'existant, préconisations, sources des chiffres.
//      C'est cette phase qui autorise les exports Markdown (Gamma, Claude).
//
//   2. verifyGeneratedSupport(support)   — SEULEMENT si le support est généré.
//      Contrôle les slides : 20 slides, plan en 2e, problématique révélée sur
//      sa seule slide, notes, concision, transitions, progression.
//
//   3. verifyPptxVisualReview(review)    — APRÈS création du .pptx.
//      Contrôle la forme visuelle : charte CESI, fond clair, couleurs,
//      lisibilité, surcharge, logos, mise en page.
//
// AVANT génération, les critères des phases 2 et 3 ne sont ni bloquants ni
// rouges : ils sont listés dans `pendingChecks` (« à vérifier après génération
// du support »).
// ---------------------------------------------------------------------------

/** Champs de préparation lus depuis la session, quelle que soit leur place. */
function lireIntrantsPreparation(session) {
  const data = session?.data || {};
  const contrat = data.contrat || {};
  const plan = data.plan || {};
  const recherche = data.recherche || data.recherche_documentaire || {};
  const filRouge = diagnostiquerFilRouge(session);
  const obs = observer(session, filRouge);

  return { data, contrat, plan, recherche, filRouge, obs };
}

/**
 * PHASE 1 — Contrôles sur les données d'entrée, avant toute génération.
 *
 * Seuls les intrants exigés pour DEMANDER à Gamma ou Claude de fabriquer le
 * support sont vérifiés. Les critères de slides, de notes et de charte
 * visuelle sont renvoyés dans `pendingChecks`, jamais en `blocking`.
 *
 * @param {object} session Session Mongoose.
 * @returns {Promise<object>} rapport de phase 1.
 */
async function verifyPreparationInputs(session) {
  const { contrat, plan, recherche, obs } = lireIntrantsPreparation(session);
  const workflow = session?.workflow || {};

  const blocking = [];
  const warnings = [];
  const bloque = (code, message, sectionPlan) =>
    blocking.push(sectionPlan ? { code, message, sectionPlan } : { code, message });
  const avertit = (code, message) => warnings.push({ code, message });

  // --- 1. Contrat Passe A validé -------------------------------------------
  if (String(contrat.status || '') !== 'validated') {
    bloque(
      'prep_contrat_non_valide',
      "Le contrat Passe A (problématique) doit être validé avant de générer le support.",
      'Problématique'
    );
  }

  // --- 2. Problématique présente et exploitable ----------------------------
  if (!String(contrat.problematique || '').trim()) {
    bloque(
      'prep_problematique_absente',
      "La problématique est absente : elle cadre toute la présentation.",
      'Problématique'
    );
  }

  // --- 3. Ligne directrice présente ----------------------------------------
  if (!String(contrat.ligneDirectrice || session?.ligneDirectrice || '').trim()) {
    bloque(
      'prep_ligne_directrice_absente',
      "La ligne directrice est absente : le fil rouge de la présentation ne peut pas être tenu.",
      'Problématique'
    );
  }

  // --- 4. Plan généré ------------------------------------------------------
  if (workflow.plan !== 'generated') {
    bloque('prep_plan_non_genere', 'Le plan détaillé doit être généré avant le support.', 'Plan');
  }

  // --- 5. Glossaire validé -------------------------------------------------
  if (workflow.glossary !== 'validated') {
    bloque(
      'prep_glossaire_non_valide',
      'Le glossaire et les sources doivent être validés avant le support.',
      'Glossaire'
    );
  }

  // --- 6. Au moins une limite de l'existant --------------------------------
  const limites = Array.isArray(contrat.limitesExistant) ? contrat.limitesExistant : [];
  const limitesObs = Array.isArray(obs.limitesExistant) ? obs.limitesExistant : [];
  if (limites.length === 0 && limitesObs.length === 0) {
    bloque(
      'prep_limites_absentes',
      "Ajoutez les limites de l'existant : sans diagnostic de ce qui ne fonctionne pas déjà, le support n'a pas de problème à résoudre.",
      'Limites de l’existant'
    );
  }

  // --- 7. Au moins une préconisation ---------------------------------------
  const preconisations = Array.isArray(contrat.preconisations) ? contrat.preconisations : [];
  const preconisationsObs = Array.isArray(obs.preconisations) ? obs.preconisations : [];
  if (preconisations.length === 0 && preconisationsObs.length === 0) {
    bloque(
      'prep_preconisations_absentes',
      'Aucune préconisation : le support doit proposer une réponse argumentée au problème posé.',
      'Préconisations / Solutions'
    );
  }

  // --- 8. Chaque chiffre du contrat porte une source ------------------------
  const chiffresSansSource = (contrat.contexte || []).filter(
    (c) => /\d/.test(String(c?.fait || '')) && !String(c?.source || '').trim()
  );
  if (chiffresSansSource.length > 0) {
    bloque(
      'prep_chiffre_sans_source',
      `${chiffresSansSource.length} chiffre(s) sans source : le jury exige une source sous chaque chiffre.`,
      'Contexte / Données chiffrées'
    );
  }

  // --- Warnings : critères de forme et d'oral, jamais bloquants ------------
  if (String(contrat.justificationProbleme || '').trim() === '') {
    avertit(
      'prep_justification_a_completer',
      'Justification du problème à compléter : elle sera exigée avant l’export final.'
    );
  }
  if (obs.casContrat.length === 0 && obs.exemplesEntreprises.length === 0) {
    avertit('prep_cas_entreprises', 'Cas d’entreprise à ajouter pour nourrir le benchmark.');
  }
  if (!obs.aEchecOuLimite) {
    avertit(
      'prep_cas_echec',
      'Cas d’échec à compléter : le jury sanctionne le plaidoyer à sens unique.'
    );
  }
  if (!String(plan.ouverture?.question || '').trim()) {
    avertit('prep_ouverture', 'Ouverture à compléter dans le plan.');
  }
  avertit('prep_communication', 'Communication orale : critère évalué à la soutenance, non mesurable sur fichier.');
  avertit('prep_dynamisme', 'Dynamisme de l’argumentation : à défendre à l’oral.');
  avertit('prep_maitrise_exercice', 'Maîtrise de l’exercice et gestion du temps : à valider en conditions réelles.');
  avertit('prep_prise_de_recul', 'Prise de recul orale : à travailler à l’oral.');

  return {
    phase: 'pre_support',
    canGenerateSupport: blocking.length === 0,
    canExportMarkdown: blocking.length === 0,
    canExportPptx: false,
    blocking,
    warnings,
    pendingChecks: CHECKS_POST_SUPPORT,
  };
}

/**
 * Normalise un titre de slide pour les tests par expression régulière :
 * minuscules + suppression des accents. Évite qu'un titre saisi avec des
 * caractères Unicode composés (« Problématique ») échoue face à un motif
 * ASCII (« problematique »).
 *
 * @param {*} valeur Titre brut.
 * @returns {string} Titre minuscule sans diacritiques.
 */
function normaliserTitre(valeur) {
  return String(valeur || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Contrôles qui ne peuvent porter que sur un support DÉJÀ généré. Avant, ils
 * sont annoncés comme « à vérifier après génération », jamais comme des échecs.
 */
const CHECKS_POST_SUPPORT = [
  { code: 'slides_count', libelle: `${VOLUME_CIBLE_TOTAL} slides`, phase: 'post_support' },
  { code: 'plan_slide_position', libelle: 'Plan de présentation en 2e slide', phase: 'post_support' },
  { code: 'problematique_slide_position', libelle: 'Problématique révélée seulement sur sa slide', phase: 'post_support' },
  { code: 'notes_presentateur', libelle: 'Notes du présentateur sur chaque slide', phase: 'post_support' },
  { code: 'slides_concises', libelle: 'Slides concises (une idée par puce)', phase: 'post_support' },
  { code: 'sources_sous_chiffres', libelle: 'Source sous chaque chiffre des slides', phase: 'post_support' },
  { code: 'transitions', libelle: 'Transitions entre les slides', phase: 'post_support' },
  { code: 'conclusion', libelle: 'Conclusion qui répond à la problématique', phase: 'post_support' },
  { code: 'progression', libelle: 'Progression de l’entonnoir', phase: 'post_support' },
];

/** Contrôles qui ne peuvent porter que sur un .pptx DÉJÀ produit. */
const CHECKS_POST_PPTX = [
  { code: 'charte_cesi', libelle: 'Charte visuelle CESI' },
  { code: 'fond_clair', libelle: 'Fond clair' },
  { code: 'couleurs', libelle: 'Couleurs conformes' },
  { code: 'lisibilite', libelle: 'Lisibilité' },
  { code: 'surcharge', libelle: 'Absence de surcharge' },
  { code: 'logos', libelle: 'Logos' },
  { code: 'mise_en_page', libelle: 'Mise en page' },
];

/**
 * PHASE 2 — Contrôles sur les slides, seulement si le support est généré.
 *
 * @param {object} support Donnée `session.data.support`.
 * @returns {object} rapport de phase 2.
 */
function verifyGeneratedSupport(support) {
  const slides = Array.isArray(support?.slides) ? support.slides : [];
  const blocking = [];
  const warnings = [];

  if (slides.length === 0) {
    return {
      phase: 'post_support',
      canGenerateSupport: false,
      canExportMarkdown: false,
      canExportPptx: false,
      blocking: [
        {
          code: 'support_absent',
          message: 'Aucune slide : le support doit être généré ou importé avant les contrôles de forme.',
        },
      ],
      warnings,
      pendingChecks: CHECKS_POST_SUPPORT,
    };
  }

  const bloquant = (code, message) => blocking.push({ code, message });
  const avertit = (code, message) => warnings.push({ code, message });

  // 1. Volume cible.
  if (slides.length !== VOLUME_CIBLE_TOTAL) {
    bloquant(
      'support_slides_count',
      `${slides.length} slide(s) au lieu des ${VOLUME_CIBLE_TOTAL} attendues : ajuste le volume avant l’export .pptx.`
    );
  }

  const titres = slides.map((s) => normaliserTitre(s?.titre));

  // 2. Plan de présentation en 2e slide.
  if (!/plan/i.test(titres[1] || '')) {
    bloquant('support_plan_slide_position', 'La 2e slide doit être le plan de présentation.');
  }

  // 3. Problématique révélée seulement sur sa slide dédiée.
  const idxPb = titres.findIndex((t) => /problematique/i.test(t));
  const slidesPb = titres.filter((t) => /problematique/i.test(t)).length;
  if (idxPb === -1) {
    bloquant('support_problematique_slide_absente', 'Aucune slide dédiée à la problématique.');
  } else if (slidesPb > 1) {
    bloquant(
      'support_problematique_slide_position',
      'La problématique ne doit être révélée que sur sa propre slide, pas avant.'
    );
  }

  // 4. Notes du présentateur.
  const sansNotes = slides.filter((s) => String(s?.notes || s?.notes_orateur || '').trim() === '');
  if (sansNotes.length > 0) {
    bloquant(
      'support_notes_absentes',
      `${sansNotes.length} slide(s) sans notes du présentateur : chaque slide doit porter ses notes.`
    );
  }

  // 5. Concision : le compresseur ne doit rien avoir laissé de bloquant.
  const rapportCompression = support?.rapport_compression || null;
  if (
    rapportCompression &&
    ((rapportCompression.phrases || 0) > 0 ||
      (rapportCompression.formulesIA || []).length > 0 ||
      (rapportCompression.deuxCamps || 0) > 0)
  ) {
    avertit(
      'support_slides_concises',
      'Des phrases complètes ou formules IA subsistent dans les slides : resserre la formulation.'
    );
  }

  // 6. Transitions entre les slides.
  const sansTransition = slides.filter((s) => String(s?.transition || '').trim() === '');
  if (sansTransition.length > 0) {
    avertit('support_transitions', `${sansTransition.length} slide(s) sans transition vers la suivante.`);
  }

  // 7. Conclusion qui répond à la problématique.
  if (!titres.some((t) => /conclusion/i.test(t))) {
    avertit('support_conclusion', 'Aucune slide de conclusion : elle doit refermer la problématique.');
  }

  return {
    phase: 'post_support',
    canGenerateSupport: true,
    canExportMarkdown: true,
    canExportPptx: blocking.length === 0,
    blocking,
    warnings,
    pendingChecks: CHECKS_POST_PPTX,
  };
}

/**
 * PHASE 3 — Contrôles visuels, seulement APRÈS création du .pptx.
 *
 * Ces critères ne doivent JAMAIS bloquer l'export Markdown destiné à Gamma :
 * ils ne s'appliquent qu'une fois le fichier PowerPoint produit.
 *
 * @param {object} review Observations visuelles du .pptx produit.
 * @returns {object} rapport de phase 3.
 */
function verifyPptxVisualReview(review) {
  const obs = review || {};
  const blocking = [];
  const avertit = (code, message) => blocking.push({ code, message });

  if (obs.charteCesI === false || obs.charteCesi === false) {
    avertit('pptx_charte_cesi', 'La charte visuelle CESI n’est pas appliquée au .pptx.');
  }
  if (obs.fondClair === false) {
    avertit('pptx_fond_clair', 'Le fond du .pptx doit rester clair (lisibilité en projection).');
  }
  if (obs.couleursConformes === false) {
    avertit('pptx_couleurs', 'Les couleurs du .pptx ne respectent pas la charte.');
  }
  if (obs.lisibilite === false) {
    avertit('pptx_lisibilite', 'La lisibilité des slides est insuffisante.');
  }
  if (obs.surcharge === true) {
    avertit('pptx_surcharge', 'Les slides sont surchargées : réduis le contenu par slide.');
  }
  if (obs.logos === false) {
    avertit('pptx_logos', 'Les logos attendus sont absents du .pptx.');
  }
  if (obs.miseEnPage === false) {
    avertit('pptx_mise_en_page', 'La mise en page du .pptx ne suit pas la charte.');
  }

  return {
    phase: 'post_pptx',
    canGenerateSupport: true,
    canExportMarkdown: true,
    canExportPptx: blocking.length === 0,
    blocking,
    warnings: [],
    pendingChecks: [],
    review: obs,
  };
}

/**
 * Point d'entrée des exports Markdown : vérifie la phase 1, en signalant
 * clairement que les critères de slides restent à vérifier après génération.
 *
 * @param {object} session Session Mongoose.
 * @returns {Promise<object>} rapport de phase 1.
 */
async function assertExportMarkdownAutorise(session) {
  const rapport = await verifyPreparationInputs(session);
  if (!rapport.canExportMarkdown) {
    const detail = rapport.blocking
      .map((b) => `• ${b.message}${b.sectionPlan ? ` (section « ${b.sectionPlan} »)` : ''}`)
      .join('\n');
    throw httpError(
      400,
      "Le contenu de préparation n'est pas encore suffisant pour générer le support.\n" +
        `${detail}\n` +
        'Corrige ces points puis relance l’export. Les critères propres aux slides (volume, notes, concision) seront vérifiés après génération du support.'
    );
  }
  return rapport;
}

module.exports = {
  construireRapportVerification,
  assertVerificationExport,
  rendreRapportMarkdown,
  rendreEnteteVerification,
  diagnostiquerFilRouge,
  LIBELLES_STATUT,
  // Vérification en trois phases
  verifyPreparationInputs,
  verifyGeneratedSupport,
  verifyPptxVisualReview,
  assertExportMarkdownAutorise,
  CHECKS_POST_SUPPORT,
  CHECKS_POST_PPTX,
};
