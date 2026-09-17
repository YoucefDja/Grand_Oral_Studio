/**
 * VÉRIFICATION SYSTÉMATIQUE AVANT EXPORT DES FICHIERS MARKDOWN
 *
 * Ce module implémente l'étape de contrôle qui s'exécute AVANT toute
 * exportation de fichier Markdown (Claude Desktop, Gamma, Claude Design). Elle
 * répond à quatre exigences produit :
 *
 * 1. PARCOURS DE LA GRILLE — les 14 critères du jury CESI sont lus depuis la
 *    section `grille_evaluation_cesi` stockée en base (source unique, éditable
 *    en admin : voir services/grilleEvaluation.js). Aucun critère n'est
 *    recopié en dur ici.
 *
 * 2. STATUT OBJECTIF PAR CRITÈRE — chaque critère reçoit un statut déterministe
 *    (conforme / partiel / non conforme / non applicable) et un score chiffré,
 *    calculés à partir d'observations vérifiables dans les données de la
 *    session (slides, plan, analyse, glossaire, problématique, ligne
 *    directrice). Aucune appréciation subjective : chaque verdict cite la
 *    preuve qui le fonde.
 *
 * 3. RAPPORT DÉTAILLÉ — le rapport liste chaque critère, son statut, son score
 *    et le détail des points faibles, en distinguant les non-conformités
 *    BLOQUANTES (le support ne peut pas partir en export) des avertissements.
 *
 * 4. BLOCAGE DE L'EXPORT — `assertVerificationExport` lève une erreur 400
 *    contenant le rapport lorsque des non-conformités bloquantes subsistent.
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
 */

const MethodologySection = require('../models/MethodologySection');
const { httpError } = require('../utils/httpError');
const { parserGrille, SECTION_ID } = require('./grilleEvaluation');
const {
  detecterManquesSupport,
  normaliser,
  texteSlide,
  typeDe,
  rempli,
  aUnVisuelExploitable,
  detecterOrdreInvalide,
  VOLUME_CIBLE_TOTAL,
} = require('./conformiteSupport');
const { problemeRetenuPourSuite } = require('./promptBuilder');

// ---------------------------------------------------------------------------
// Barème
// ---------------------------------------------------------------------------

const SCORE_CONFORME = 1;
const SCORE_PARTIEL = 0.5;
const SCORE_NON_CONFORME = 0;

/** Un critère est « non applicable » quand aucune slide n'est exploitable. */
const STATUT_NON_APPLICABLE = 'non_applicable';

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
  const retenu = problemeRetenuPourSuite(data.probleme);
  const problematique = String(retenu?.formulation_retenue?.formulation || '').trim();
  const ligneDirectrice = String(
    session?.ligneDirectrice || data.probleme?.ligne_directrice || ''
  ).trim();
  const tensionA = String(retenu?.formulation_retenue?.tension?.pole_a || '').trim();
  const tensionB = String(retenu?.formulation_retenue?.tension?.pole_b || '').trim();

  const constats = [];
  const ajouter = (code, message) => constats.push({ code, message });

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

    // 4. Tension réelle à deux pôles distincts.
    if (!tensionA || !tensionB) {
      ajouter(
        'problematique_sans_tension',
        "La tension à deux pôles n'est pas renseignée (pole_a / pole_b) : la problématique doit naître d'une tension, pas d'un simple constat."
      );
    } else if (normaliser(tensionA) === normaliser(tensionB)) {
      ajouter(
        'problematique_tension_identique',
        'Les deux pôles de la tension sont identiques : il n’y a pas de tension réelle à instruire.'
      );
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

  return {
    sujet,
    theme,
    problematique,
    ligneDirectrice,
    tension: tensionA && tensionB ? { poleA: tensionA, poleB: tensionB } : null,
    constats,
  };
}

// ---------------------------------------------------------------------------
// Observation déterministe du support, critère par critère
// ---------------------------------------------------------------------------

/**
 * Contexte d'observation : tout ce dont les règles de critères ont besoin,
 * calculé une seule fois. Renvoie aussi les cartes de règles par critère.
 */
function observer(session, filRouge) {
  const data = session?.data || {};
  const slides = Array.isArray(data.support?.slides) ? data.support.slides : [];
  const textes = slides.map(texteSlide);
  const types = slides.map(typeDe);
  const plan = data.plan || {};
  const analyse = data.analyse || {};
  const recherche = data.recherche || {};
  const glossaire = data.glossaire || {};

  const aTexte = (regex) => textes.some((t) => regex.test(t));
  const slidesDe = (predicat) =>
    slides.filter((slide, i) => predicat(slide, textes[i], types[i]));
  const aSlideDe = (predicat) => slidesDe(predicat).length > 0;

  const slidesContexte = slidesDe((_s, _t, type) => type.includes('contexte') || type.includes('context'));
  const slidesEnjeux = slidesDe((_s, _t, type) => type.includes('enjeux'));
  const slidesSolutions = slidesDe(
    (_s, _t, type) => type.includes('solution') || type.includes('preconisation')
  );
  const slidesConclusion = slidesDe(
    (_s, texte, type) => type.includes('conclusion') || /conclusion/.test(texte)
  );
  const indexConclusion = types.findIndex(
    (type, i) => type.includes('conclusion') || /conclusion/.test(textes[i])
  );

  const slidesCas = slidesDe(
    (_s, texte, type) => type.includes('exempleentreprise') || /cas d.entreprise|cas reel/.test(texte)
  );

  const slidesChiffrees = slides.filter((slide, i) => {
    if (aUnVisuelExploitable(slide)) {
      const donnees = Array.isArray(slide.visuel.donnees) ? slide.visuel.donnees : [];
      if (donnees.some((d) => d && typeof d === 'object' && ['valeur', 'valeur_a', 'valeur_b'].some((c) => typeof d[c] === 'number'))) {
        return true;
      }
    }
    return /\d+([.,]\d+)?\s*%/.test(textes[i]) || /(chiffre|donnee|pourcent|enquete|etude|barometre|sondage|statistique)/.test(textes[i]);
  });

  const slidesAvecSource = slides.filter(
    (slide, i) => /source\s*:/.test(textes[i]) || (slide.visuel && /source/i.test(String(slide.visuel.source || '')))
  );

  const surcharges = slides.filter((s) => Array.isArray(s.puces) && s.puces.length > 6);
  const vides = slides.filter(
    (s) => (!Array.isArray(s.puces) || s.puces.length === 0) && !String(s.notes_orateur || '').trim()
  );
  const sansTransition = slides.filter(
    (slide, i) => !/conclusion/.test(types[i]) && !String(slide.transition || '').trim()
  );
  const avecVisuel = slides.filter(aUnVisuelExploitable);
  const aForme = slides.some((s) => typeof s.forme_visuelle === 'string' && s.forme_visuelle.trim() !== '');

  const notionsAnalyse = Array.isArray(analyse.notions_a_maitriser) ? analyse.notions_a_maitriser : [];
  const refsRecherche = Array.isArray(recherche.references_theoriques) ? recherche.references_theoriques : [];
  const aReferenceNommee = aTexte(/(modele|theorie|theorique|norme|referentiel|cadre\s|auteur|concept)/);

  const aExempleEntreprise = slidesCas.length > 0 || aSlideDe(
    (_s, texte, type) =>
      type.includes('exemple') ||
      /(entreprise|cas\s|societe|groupe|firme|start-?up|pme|eti|grand\s*compte|multinationale)/.test(texte)
  );
  const aEchecOuLimite = aTexte(/(echec|limite|contre-exemple|a echoue|n a pas suffi|insuffisan|ratage|defaillance|faiblesse)/);

  const questionOuverture = (() => {
    if (indexConclusion === -1) return false;
    const t = textes[indexConclusion];
    return t.includes('?') && /(ouverture|avenir|perspective|demain|futur|prospective|a terme)/.test(t);
  })();

  const ordreInvalide = detecterOrdreInvalide(types);
  const conclusionsMultiples = slidesConclusion.length > 1;
  const estimationTemps = Math.round(slides.length * 1.25); // ~1 min 15 par slide
  const tempsPlan = Number(plan.duree_minutes || plan.duree || 0);

  return {
    slides,
    textes,
    types,
    plan,
    analyse,
    recherche,
    glossaire,
    // compteurs
    nbSlides: slides.length,
    slidesContexte,
    slidesEnjeux,
    slidesSolutions,
    slidesConclusion,
    slidesCas,
    slidesChiffrees,
    slidesAvecSource,
    surcharges,
    vides,
    sansTransition,
    avecVisuel,
    aForme,
    notionsAnalyse,
    refsRecherche,
    aReferenceNommee,
    aExempleEntreprise,
    aEchecOuLimite,
    questionOuverture,
    ordreInvalide,
    conclusionsMultiples,
    estimationTemps,
    tempsPlan,
    filRouge,
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
      if (obs.slidesContexte.length === 0) {
        faible('1.1-contexte', 'Aucune slide « Contexte » : le jury évalue la présentation du sujet et son positionnement stratégique.');
      } else {
        force(`${obs.slidesContexte.length} slide(s) de contexte.`);
        if (obs.slidesAvecSource.length === 0) {
          faible('1.1-source', 'Aucune source citée (« Source : … ») : les données du contexte ne sont pas attribuées.');
        } else {
          force(`${obs.slidesAvecSource.length} slide(s) citent une source.`);
        }
      }
      break;
    }

    case '1.2': {
      if (obs.slidesEnjeux.length === 0) {
        faible('1.2-enjeux', 'Aucune slide « Enjeux » : les dimensions TOHEE (technique, organisationnelle, humaine, économique, environnementale) attendues par le jury ne sont pas exposées.');
      } else {
        force(`${obs.slidesEnjeux.length} slide(s) d’enjeux.`);
        const texteEnjeux = obs.slidesEnjeux
          .flatMap((s) => (Array.isArray(s.puces) ? s.puces : []))
          .join(' ');
        const dimensions = [
          /techni/i, /organisa/i, /humain|social|rh/i, /economi|co[uû]t|budget/i, /environnement|ecolog|rse|carbone/i,
        ];
        const couvertes = dimensions.filter((r) => r.test(texteEnjeux)).length;
        if (couvertes < 3) {
          faible('1.2-tohee', `Seulement ${couvertes} dimension(s) TOHEE sur 5 sont identifiables dans les enjeux : le jury attend un ancrage sur les cinq dimensions.`);
        } else {
          force(`${couvertes} dimensions TOHEE sur 5 identifiables.`);
        }
      }
      break;
    }

    case '1.3': {
      if (obs.notionsAnalyse.length === 0 && obs.refsRecherche.length === 0 && !obs.aReferenceNommee) {
        faible('1.3-concepts', 'Aucun concept théorique nommé (modèle, norme, auteur, cadre) : la rigueur académique attendue n’est pas démontrée.');
      } else {
        const total = obs.notionsAnalyse.length + obs.refsRecherche.length;
        force(total > 0 ? `${total} notion(s) et référence(s) académiques mobilisées.` : 'Des concepts théoriques nommés apparaissent sur les slides.');
      }
      break;
    }

    case '1.4': {
      if (!obs.aExempleEntreprise) {
        faible('1.4-benchmark', 'Aucun exemple d’entreprise réelle identifié : le benchmark exigé par le jury est absent.');
      } else {
        force(`${obs.slidesCas.length} slide(s) de cas d’entreprise.`);
        if (obs.slidesCas.length === 1) {
          faible('1.4-regroupe', 'Les cas d’entreprises sont regroupés sur une seule slide : chaque entreprise doit disposer de sa propre slide, présentée de façon distincte et individualisée.');
        }
        if (!obs.aEchecOuLimite) {
          faible('1.4-echec', 'Aucun échec ni limite mentionné dans les cas d’entreprise : le jury sanctionne le plaidoyer à sens unique (au moins un succès ET un échec ou une limite sont attendus).');
        } else {
          force('Au moins une limite ou un échec vient nuancer le propos.');
        }
        const casSansSource = obs.slidesCas.filter((slide, i) => !/source\s*:/.test(texteSlide(slide)));
        if (casSansSource.length > 0) {
          faible('1.4-source-cas', `${casSansSource.length} slide(s) de cas d’entreprise sans source : chaque cas réel doit être sourcé et daté.`);
        }
      }
      break;
    }

    case '1.5': {
      if (obs.slidesSolutions.length === 0) {
        faible('1.5-solutions', 'Aucune slide de solutions ni de préconisations : le jury attend une prise de position claire et des propositions argumentées.');
      } else {
        force(`${obs.slidesSolutions.length} slide(s) de solutions / préconisations.`);
        if (obs.filRouge.problematique && obs.slidesConclusion.length > 0) {
          const recReponse = recouvrement(
            obs.filRouge.problematique,
            obs.slidesConclusion.flatMap((s) => [s.titre || '', ...(Array.isArray(s.puces) ? s.puces : [])]).join(' ')
          );
          if (recReponse < 0.1) {
            faible('1.5-reponse', 'La conclusion ne reprend pas le vocabulaire de la problématique : la réponse stratégique ne se lit pas comme une réponse à la question posée.');
          } else {
            force('La conclusion répond explicitement à la problématique.');
          }
        }
      }
      break;
    }

    case '1.6': {
      if (obs.slidesSolutions.length === 0) {
        faible('1.6-operationnel', 'Aucune préconisation opérationnelle : l’applicabilité concrète de la solution ne peut pas être évaluée.');
      } else {
        const texteSolutions = obs.slidesSolutions
          .flatMap((s) => [s.titre || '', ...(Array.isArray(s.puces) ? s.puces : [])])
          .join(' ');
        if (!/(avant|pendant|apres|après)/i.test(texteSolutions)) {
          faible('1.6-phases', 'Aucune structuration avant / pendant / après dans les préconisations : le jury attend une vision globale du champ applicatif.');
        } else {
          force('Préconisations structurées en phases (avant / pendant / après).');
        }
        if (!/(pme|eti|grand groupe|tpe|multinationale|taille)/i.test(texteSolutions)) {
          faible('1.6-taille', 'Aucune contextualisation selon la taille d’entreprise : la grille attend une solution adaptable au type de structure.');
        } else {
          force('Préconisations déclinées selon la taille d’entreprise.');
        }
      }
      break;
    }

    case '1.7': {
      // Anticipation des questions du jury : les notes orateur sont le lieu
      // naturel des objections traitées ; le plan peut aussi porter une liste
      // de questions prévisibles.
      const texteNotes = obs.slides.map((s) => String(s.notes_orateur || '')).join(' ');
      const planQ = String(obs.plan.questions_previsibles || obs.plan.questions_jury || '');
      if (!texteNotes.trim() && !planQ.trim()) {
        faible('1.7-notes', 'Aucune note orateur et aucune liste de questions prévisibles : rien ne prépare l’étudiant aux objections du jury.');
      } else if (/(objection|question|jury|counter|contre-argument|critique)/i.test(texteNotes + planQ)) {
        force('Des objections ou questions prévisibles sont anticipées.');
      } else {
        faible('1.7-objections', 'Les notes orateur ne mentionnent aucune objection ni question prévisible du jury : anticipe au moins les deux questions les plus probables avec leurs éléments de réponse.');
      }
      break;
    }

    // ---- BLOC 2 : forme ----
    case '2.1': {
      if (obs.ordreInvalide) {
        faible('2.1-ordre', `L’enchaînement des blocs ne respecte pas la structure imposée : « ${obs.ordreInvalide.apres} » apparaît avant « ${obs.ordreInvalide.avant} », alors que l’ordre attendu est Contexte → Enjeux → Problématique → Existant → Statistiques → Cas réels → Solutions → Conclusion.`);
      } else {
        force('L’ordre des blocs respecte l’effet entonnoir.');
      }
      if (obs.slides.length && obs.sansTransition.length > 0) {
        faible('2.1-transitions', `${obs.sansTransition.length} slide(s) n’ont pas de phrase de transition : la ligne directrice s’interrompt et les slides paraissent indépendantes à l’oral.`);
      } else if (obs.slides.length) {
        force('Chaque slide se termine par une phrase de transition.');
      }
      if (obs.conclusionsMultiples) {
        faible('2.1-conclusions', `${obs.slidesConclusion.length} slides de conclusion : une seule conclusion est attendue, sinon le fil directeur se perd.`);
      }
      const bandeau = obs.slides.filter((s) => /ligne directrice|fil directeur|fil rouge/i.test(`${s.titre || ''} ${String(s.notes_orateur || '')}`));
      if (obs.slides.length && bandeau.length === 0) {
        faible('2.1-rappel-ld', 'La ligne directrice n’est rappelée nulle part dans les slides (ni en introduction, ni en pied de slide) : le fil rouge n’est pas visible pour le jury.');
      } else if (obs.slides.length) {
        force('La ligne directrice est rappelée dans le support.');
      }
      break;
    }

    case '2.2':
      // Expression orale, écoute, remise en cause : non mesurable sur un fichier.
      forces.push('Critère oral (communication) : à défendre à l’oral, non mesurable sur le fichier.');
      break;

    case '2.3': {
      const aExemples = obs.aExempleEntreprise || obs.slidesChiffrees.length > 0;
      if (!aExemples) {
        faible('2.3-illustration', 'Aucun exemple percutant ni donnée chiffrée pour appuyer la démonstration : l’argumentation manque d’illustrations.');
      } else {
        force('La démonstration est appuyée par des exemples réels et/ou des données chiffrées.');
      }
      if (!obs.aEchecOuLimite) {
        faible('2.3-nuance', 'Aucune limite ni contre-exemple : la prise de position paraît unilatérale, ce que le jury sanctionne sur le dynamisme de l’argumentation.');
      }
      break;
    }

    case '2.4': {
      if (obs.avecVisuel.length === 0) {
        faible('2.4-visuel', 'Aucun visuel (graphique, comparaison, frise) dans le support : l’impact visuel attendu est absent.');
      } else if (!obs.aForme) {
        faible('2.4-forme', 'Aucune indication de mise en forme (« forme_visuelle ») : le support risque de se réduire à des blocs de texte.');
      } else {
        force(`${obs.avecVisuel.length} slide(s) portent un visuel exploitable.`);
      }
      if (obs.nbSlides + 1 !== VOLUME_CIBLE_TOTAL) {
        const ecart = obs.nbSlides + 1 - VOLUME_CIBLE_TOTAL;
        faible('2.4-volume', `Le support compte ${obs.nbSlides + 1} slides page de titre comprise au lieu des ${VOLUME_CIBLE_TOTAL} attendues (${ecart > 0 ? `retirez ${ecart}` : `ajoutez ${-ecart}`} slide(s)).`);
      } else {
        force(`Volume conforme : ${VOLUME_CIBLE_TOTAL} slides page de titre comprise.`);
      }
      if (obs.tempsPlan && obs.estimationTemps > obs.tempsPlan * 1.3) {
        faible('2.4-temps', `Le volume déroulé représente environ ${obs.estimationTemps} min pour un oral prévu en ${obs.tempsPlan} min : le respect du temps imparti est noté, réduis le contenu.`);
      }
      break;
    }

    case '2.5': {
      if (!obs.filRouge.problematique) {
        faible('2.5-problematique', 'Aucune problématique exploitable : la finesse du décryptage de la problématique ne peut pas être démontrée.');
      } else if (obs.filRouge.constats.some((c) => c.code.startsWith('problematique_'))) {
        faible('2.5-analyse', 'La problématique présente des faiblesses d’analyse (voir les points faibles « problématique » ci-dessous) : le jury évalue la finesse du décryptage.');
      } else {
        force('La problématique retenue est analysable et bornée par le sujet.');
      }
      if (obs.ordreInvalide) {
        faible('2.5-ordre', 'Le décryptage n’est pas progressif : la rupture d’ordre empêche l’analyse de se construire par étapes.');
      }
      break;
    }

    case '2.6': {
      if (obs.surcharges.length > 0) {
        faible('2.6-puces', `${obs.surcharges.length} slide(s) portent plus de 6 puces : la synthèse attendue (aller à l’essentiel) n’est pas respectée.`);
      } else if (obs.nbSlides > 0) {
        force('Aucune slide ne dépasse 6 puces.');
      }
      if (obs.vides.length > 0) {
        faible('2.6-vides', `${obs.vides.length} slide(s) sont vides (aucune puce, aucune note orateur) : la pensée n’est pas restituée.`);
      }
      break;
    }

    case '2.7': {
      if (obs.slidesConclusion.length === 0) {
        faible('2.7-conclusion', 'Aucune conclusion : la prise de recul et l’ouverture ne peuvent pas être évaluées.');
      } else if (!obs.questionOuverture && !rempli(obs.plan.ouverture)) {
        faible('2.7-ouverture', 'La conclusion ne porte pas de question d’ouverture prospective : la prise de recul attendue par le jury est absente.');
      } else {
        force('La conclusion porte une question d’ouverture prospective.');
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
  // Un point faible « bloquant » (fond, non corrigeable par une décision de
  // l'étudiant) fait tomber le critère ; sinon le critère reste partiel.
  const bloquant = pointsFaibles.some((p) => CODES_BLOQUANTS.has(p.code));
  if (bloquant) return { statut: 'non_conforme', score: SCORE_NON_CONFORME };
  return { statut: 'partiel', score: SCORE_PARTIEL };
}

/**
 * Codes de points faibles qui INTERDISENT l'export. Un support peut être
 * exporté avec des avertissements de forme ou de volume (dont l'étudiant reste
 * maître), mais jamais sans réponse stratégique ni avec un fil rouge rompu.
 */
const CODES_BLOQUANTS = new Set([
  // Fil rouge et méthode Armelle Aymond
  'problematique_absente',
  'problematique_hors_sujet',
  'problematique_reformulation',
  'problematique_debat',
  'problematique_descriptive',
  'ligne_directrice_absente',
  'ligne_directrice_hors_sujet',
  'ligne_directrice_decrochee',
  'methodologie_plan_absent',
  // Structure minimum du support
  '1.1-contexte',
  '1.2-enjeux',
  '1.5-solutions',
  '2.1-ordre',
  '2.1-conclusions',
]);

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

const LIBELLES_STATUT = {
  conforme: 'Conforme',
  partiel: 'Partiellement conforme',
  non_conforme: 'Non conforme',
  [STATUT_NON_APPLICABLE]: 'Non applicable (aucune slide)',
};

function arrondi(n) {
  return Math.round(n * 100) / 100;
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
  const sansSlides = obs.nbSlides === 0;

  const criteres = referentiels.grille.criteres.map((critere) => {
    if (sansSlides) {
      return {
        ...critere,
        statut: STATUT_NON_APPLICABLE,
        score: 0,
        scoreMax: 1,
        pointsFaibles: [],
        forces: [],
      };
    }
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

  // Manques structurels déjà détectés par le contrôle de conformité : ils
  // complètent le rapport sans être comptés deux fois.
  const manquesStructurels = detecterManquesSupport(session);

  const scoreTotal = arrondi(criteres.reduce((t, c) => t + c.score, 0));
  const scoreMax = criteres.length;
  const nonConformes = criteres.filter((c) => c.statut === 'non_conforme');
  const bloquants = [
    ...nonConformes.map((c) => ({ critere: c.id, libelle: c.libelle, pointsFaibles: c.pointsFaibles })),
  ];

  const totalSlides = obs.nbSlides + (obs.nbSlides > 0 ? 1 : 0);

  return {
    genereLe: new Date().toISOString(),
    sujet: filRouge.sujet,
    theme: filRouge.theme,
    problematique: filRouge.problematique,
    ligneDirectrice: filRouge.ligneDirectrice,
    slides: obs.nbSlides,
    slidesPageDeTitreComprise: totalSlides,
    volumeCible: VOLUME_CIBLE_TOTAL,
    scoreTotal,
    scoreMax,
    pourcentage: scoreMax > 0 ? Math.round((scoreTotal / scoreMax) * 100) : 0,
    conforme: nonConformes.length === 0,
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
    manquesStructurels: manquesStructurels.manques,
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
  [STATUT_NON_APPLICABLE]: '➖',
};

function rendreRapportMarkdown(rapport) {
  const lignes = [];
  lignes.push('# Rapport de vérification avant export');
  lignes.push('');
  lignes.push(`> Vérification systématique exécutée avant l'export du fichier Markdown, sur la base de la grille officielle du jury CESI (${rapport.scoreMax} critères).`);
  lignes.push('');
  lignes.push(`- **Sujet** : ${rapport.sujet || '—'}`);
  if (rapport.theme) lignes.push(`- **Thème** : ${rapport.theme}`);
  lignes.push(`- **Problématique retenue** : ${rapport.problematique ? `« ${rapport.problematique} »` : '—'}`);
  lignes.push(`- **Ligne directrice** : ${rapport.ligneDirectrice ? `« ${rapport.ligneDirectrice} »` : '—'}`);
  lignes.push(`- **Support** : ${rapport.slides} slide(s), ${rapport.slidesPageDeTitreComprise} page de titre comprise (cible : ${rapport.volumeCible})`);
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
  lignes.push('## 2. Points faibles à recorriger');
  lignes.push('');
  if (faibles.length === 0) {
    lignes.push('Aucun point faible détecté : le support est parfaitement conforme aux attendus vérifiables de la grille.');
  } else {
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
      ? 'Constat : la ligne directrice est présente, cohérente avec la problématique et rappelée dans le support.'
      : 'Constats à corriger :'
  );
  pfLd.forEach((p) => lignes.push(`- ${p.message}`));
  lignes.push('');

  lignes.push('### 3.3 Méthodologie globale Armelle Aymond');
  lignes.push('');
  lignes.push(rapport.referentiels.methodologieGlobal);
  lignes.push('');
  lignes.push("La méthode ne porte pas seulement sur la problématique : elle structure TOUTE la présentation. Vérifie que l'entonnoir est respecté de bout en bout.");
  lignes.push('');

  if (rapport.manquesStructurels.length > 0) {
    lignes.push('## 4. Manques structurels complémentaires');
    lignes.push('');
    rapport.manquesStructurels.forEach((m) => lignes.push(`- **[critère ${m.critere}]** ${m.message}`));
    lignes.push('');
  }

  lignes.push('---');
  lignes.push('');
  lignes.push(
    rapport.conforme
      ? "**Export autorisé.** Le rapport est joint au fichier exporté pour garder la trace de la vérification."
      : "**Export bloqué.** Corrige les points faibles bloquants ci-dessus (en régénérant l'étape concernée ou en ajustant le plan, la problématique et le glossaire), puis relance l'export."
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

module.exports = {
  construireRapportVerification,
  assertVerificationExport,
  rendreRapportMarkdown,
  rendreEnteteVerification,
  diagnostiquerFilRouge,
  LIBELLES_STATUT,
};
