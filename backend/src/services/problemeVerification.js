/**
 * Filet de qualité sur la problématique (étape 2).
 *
 * La conformité aux consignes d'Armelle Aymond ne peut pas reposer sur le seul
 * premier passage de génération : ce module lui superpose deux contrôles.
 *
 * 1. HEURISTIQUES DÉTERMINISTES (rapides, sans IA) :
 *    - structure : chaque formulation est complète (question, tension à deux
 *      pôles distincts, justification « discutable » et « bornée par le sujet ») ;
 *    - reformulation plate : chevauchement de vocabulaire anormalement fort
 *      entre la formulation et l'intitulé du sujet ;
 *    - périmètre lexical : termes de la formulation absents du vocabulaire du
 *      sujet / de l'analyse (suspects de hors-sujet).
 *    Les heuristiques produisent des SIGNALEMENTS, pas des verdicts : le texte
 *    d'un sujet peut légitimement recouper l'intitulé (sujets à tension
 *    explicite). C'est le second passage qui tranche.
 *
 * 2. SECOND PASSAGE D'AUTO-VÉRIFICATION PAR LE MODÈLE (systématique) :
 *    on soumet la problématique générée à une relecture indépendante avec les
 *    sept tests anti-dérive (reformulation plate, réponse évidente, périmètre,
 *    tension, argumentation possible, problème réel, solution apportable) + les
 *    signalements automatiques. Le modèle renvoie l'objet « probleme » final
 *    complet, formulations valides conservées mot pour mot et formulations
 *    défaillantes corrigées.
 *
 * Décision finale : si après ce passage il reste moins de 2 formulations
 * structurellement exploitables, on renvoie une erreur explicite (502) invitant
 * l'étudiant à relancer la génération — plutôt que de valider en silence une
 * problématique défaillante.
 *
 * Le prompt système utilisé est celui de l'étape « probleme » (buildStepPrompt) :
 * il contient déjà la méthodologie Armelle Aymond, les garde-fous anti-dérive
 * et le schéma JSON de sortie. On ne duplique donc aucune consigne.
 */

const { generateDeepseek } = require('./deepseek');
const { parseJsonStrict } = require('./anthropic');

/** Nombres minimum de formulations exploitables exigés en sortie. */
const MIN_FORMULATIONS = 2;
const MAX_FORMULATIONS = 4;

/** Longueurs plancher pour qu'un champ soit considéré comme réellement rempli. */
const MIN_FORMULATION_LEN = 12;
const MIN_POLE_LEN = 3;
const MIN_JUSTIFICATION_LEN = 8;

/**
 * Bornes de longueur de la question elle-même. Une problématique de soutenance
 * doit rester une phrase unique, mémorisable et rappelable en pied de slide :
 * au-delà de MAX_FORMULATION_LEN caractères elle devient lourde à l'oral et ne
 * peut plus servir de fil rouge (critères 2.1 et 2.6 de la grille CESI). La
 * borne est volontairement souple pour autoriser une question un peu riche
 * (deux pôles de tension + contexte) sans tomber dans la problématique-fleuve.
 */
const MAX_FORMULATION_LEN = 240;
const MAX_FORMULATION_MOTS = 35;

// Mots-outils français fréquents : exclus du contrôle de périmètre lexical
// (on ne signale que des termes « pleins » potentiellement hors-sujet).
const MOTS_OUTILS = new Set(
  [
    'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'au', 'aux', 'a', 'et', 'ou',
    'que', 'qui', 'quoi', 'dont', 'dans', 'avec', 'pour', 'sans', 'chez', 'sur',
    'sous', 'par', 'vers', 'entre', 'depuis', 'pendant', 'durant', 'selon', 'car',
    'mais', 'donc', 'ni', 'ne', 'ce', 'se', 'sa', 'son', 'ses', 'leur', 'leurs',
    'elle', 'il', 'ils', 'elles', 'on', 'nous', 'vous', 'je', 'tu', 'cela', 'cela',
    'cette', 'cet', 'ces', 'ceci', 'celui', 'celle', 'ceux', 'celles', 'tout',
    'tous', 'toute', 'toutes', 'comme', 'plus', 'moins', 'tres', 'pas', 'non',
    'oui', 'est', 'sont', 'etre', 'avoir', 'faire', 'peut', 'peuvent', 'peux',
    'doit', 'doivent', 'faut', 'vaut', 'permet', 'permettent', 'permettront',
    'permettrait', 'en', 'y', 'où', 'comment', 'pourquoi', 'quel', 'quelle',
    'quels', 'quelles', 'dansquelle', 'mesure', 'mesures', 'estce', 'estelle',
    'garantitelle', 'signetelle', 'resteelle', 'peuton', 'doiton', 'fautil',
    'aujourdhui', 'vraiment', 'reellement', 'reel', 'reelle', 'veritablement',
    'davantage', 'plutot', 'notamment', 'ainsi', 'voire', 'cest', 'dun', 'dune',
    'aupres', 'autour', 'meme', 'aussi', 'autre', 'autres', 'certain', 'certains',
    'certaines', 'chaque', 'plusieurs', 'quelques', 'toujours', 'souvent', 'jamais',
    'tre', 'pouvoir', 'devoir', 'deux', 'trois', 'grand', 'grande', 'petit', 'petite',
  ].map((m) => m.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Minuscules sans accents ni ponctuation, prêtes pour la comparaison. */
function normaliser(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Découpe un texte en jetons (lettres/chiffres uniquement). */
function jetons(texte) {
  return normaliser(texte)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Champs exigés sur CHAQUE formulation du schéma « probleme ». */
function formulationCompletes(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return { ok: false, raison: 'objet absent' };
  const formulation = String(f.formulation || '').trim();
  const poleA = String(f.tension?.pole_a || '').trim();
  const poleB = String(f.tension?.pole_b || '').trim();
  const discutable = String(f.pourquoi_discutable || '').trim();
  const bornee = String(f.pourquoi_bornee_par_le_sujet || '').trim();
  if (formulation.length < MIN_FORMULATION_LEN) {
    return { ok: false, raison: 'question vide ou trop courte' };
  }
  if (poleA.length < MIN_POLE_LEN || poleB.length < MIN_POLE_LEN) {
    return { ok: false, raison: 'tension incomplète ou trop courte (un pôle est vide ou bref)' };
  }
  if (normaliser(poleA) === normaliser(poleB)) {
    return { ok: false, raison: 'les deux pôles de la tension sont identiques (pas de vraie tension)' };
  }
  if (discutable.length < MIN_JUSTIFICATION_LEN || bornee.length < MIN_JUSTIFICATION_LEN) {
    return {
      ok: false,
      raison:
        'justification manquante ou trop courte (pourquoi_discutable / pourquoi_bornee_par_le_sujet)',
    };
  }
  return { ok: true };
}

/**
 * Vocabulaire de référence (périmètre) du sujet : intitulé + thème + analyse
 * (mots-clés, définitions, notions, tensions, angles). Un terme de formulation
 * absent de ce vocabulaire est un suspect de hors-sujet (simple signalement).
 */
function vocabulairePerimetre(sujet, theme, analyse) {
  const mots = new Set();
  const ajouter = (t) => {
    if (t) jetons(t).forEach((j) => mots.add(j));
  };
  ajouter(sujet);
  ajouter(theme);
  const an = analyse || {};
  (Array.isArray(an.mots_cles) ? an.mots_cles : []).forEach((m) => {
    ajouter(m && m.mot);
    ajouter(m && m.definition);
  });
  (Array.isArray(an.notions_a_maitriser) ? an.notions_a_maitriser : []).forEach(ajouter);
  (Array.isArray(an.tensions) ? an.tensions : []).forEach((t) => {
    ajouter(t && t.pole_a);
    ajouter(t && t.pole_b);
    ajouter(t && t.description);
  });
  (Array.isArray(an.angles_approche) ? an.angles_approche : []).forEach(ajouter);
  return mots;
}

/**
 * Heuristiques déterministes : renvoie un tableau de signalements humainement
 * lisibles (un par problème détecté), destiné au second passage modèle.
 */
function detecterSignalements({ sujet, theme, analyse, formulations }) {
  const signalements = [];
  if (!Array.isArray(formulations)) {
    signalements.push('Aucune formulation exploitable (formulations absent ou non tableau).');
    return signalements;
  }
  const vocab = vocabulairePerimetre(sujet, theme, analyse);
  const jetonsSujet = new Set(jetons(sujet));

  formulations.forEach((f, i) => {
    const numero = i + 1;
    const controle = formulationCompletes(f);
    if (!controle.ok) {
      signalements.push(`Formulation n°${numero} — ${controle.raison}. À corriger ou compléter.`);
    }

    const question = String(f && f.formulation || '').trim();
    if (question.length < MIN_FORMULATION_LEN) return; // déjà signalé (structure)

    // Longueur : une problématique-fleuve n'est ni mémorisable ni utilisable
    // comme fil rouge (elle est rappelée en pied de chaque slide suivante).
    const nbMots = jetons(question).length;
    if (question.length > MAX_FORMULATION_LEN || nbMots > MAX_FORMULATION_MOTS) {
      signalements.push(
        `Formulation n°${numero} — trop longue (${nbMots} mots, ${question.length} caractères ; ` +
          `maximum admis : ${MAX_FORMULATION_MOTS} mots et ${MAX_FORMULATION_LEN} caractères). ` +
          'Raccourcis la question sans perdre les deux pôles de la tension : elle doit tenir ' +
          'en une phrase brève, immédiatement mémorisable et rappelable en pied de slide.'
      );
    }

    // Débat d'opinion : « faut-il », « doit-on », « est-ce bien / mal », etc.
    // Ces tournures appellent un jugement de valeur ou un choix de société, pas
    // une réponse argumentée et documentée : elles transforment la soutenance en
    // débat et sortent de la posture d'analyse attendue par le jury.
    const tournuresDebat = [
      'faut-il', 'fautil', 'doit-on', 'doiton', 'devrait-on', 'devraiton',
      'est-ce bien', 'estce bien', 'est-ce mal', 'estce mal', 'est-il legitime',
      'estil legitime', 'est-ce acceptable', 'estce acceptable', 'peut-on accepter',
      'peuton accepter', 'est-ce souhaitable', 'estce souhaitable', 'est-ce moral',
      'estce moral', 'a-t-on raison', 'aton raison',
    ];
    const questionNorm = normaliser(question).replace(/[^a-z0-9]+/g, ' ').trim();
    const tournureTrouvee = tournuresDebat.find((t) => questionNorm.includes(t.replace(/[^a-z ]/g, ' ')));
    if (tournureTrouvee) {
      signalements.push(
        `Formulation n°${numero} — la tournure « ${tournureTrouvee} » ouvre un débat d'opinion ` +
          '(jugement de valeur) plutôt qu\'un problème à instruire. Reformule autour d\'un ' +
          'problème réel et analysable, avec une réponse argumentée possible, pas un choix ' +
          'de société sur lequel on peut seulement être pour ou contre.'
      );
    }

    // Question purement constatative : « Pourquoi X existe-t-il ? », « Quelles sont
    // les causes de… ? », « En quoi consiste… ? ». Ces questions décrivent ou
    // expliquent un phénomène sans appeler de réponse actionnable : l'étudiant
    // décrirait le problème au lieu de proposer une solution, alors que la
    // soutenance doit aboutir à des préconisations.
    const tournuresConstat = [
      'quelles sont les causes', 'quelle est la cause', 'en quoi consiste',
      'qu est ce que', 'quels sont les freins', 'quels sont les obstacles',
      'pourquoi existe', 'd ou vient', 'quels sont les enjeux de',
    ];
    const tournureConstat = tournuresConstat.find((t) => questionNorm.includes(t.replace(/[^a-z ]/g, ' ')));
    if (tournureConstat) {
      signalements.push(
        `Formulation n°${numero} — la tournure « ${tournureConstat} » mène à une question ` +
          'purement descriptive ou explicative : elle constate le problème au lieu d\'appeler ' +
          'une réponse. Or la soutenance doit déboucher sur des préconisations concrètes. ' +
          'Reformule autour du levier de résolution (comment concilier / dans quelle mesure ' +
          'faire évoluer / quelles conditions pour…), en conservant les deux pôles de la tension.'
      );
    }

    // Absence de levier de solution : aucune trace de comment agir / résoudre /
    // concilier. Combinée à un constat, c'est le signe d'une problématique sans
    // réponse apportable possible. Signalement indicatif (le second passage tranche).
    const leviers = [
      'comment', 'dans quelle mesure', 'quelles conditions', 'par quels leviers',
      'quel role', 'quelle place', 'quelles pratiques', 'de quelle maniere',
    ];
    const aLevier = leviers.some((l) => questionNorm.includes(l.replace(/[^a-z ]/g, ' ')));
    if (!aLevier) {
      signalements.push(
        `Formulation n°${numero} — aucun levier de résolution n'est visible (pas de « comment », ` +
          '« dans quelle mesure », « quelles conditions »…). Vérifie que la question invite bien ' +
          'à apporter une SOLUTION argumentée, et non à décrire le problème ou à en constater ' +
          'l\'existence.'
      );
    }

    // Reformulation plate : si le vocabulaire de la question recouvre presque
    // entièrement celui de l'intitulé, suspicion de sujet recopié + « ? ».
    const jetonsQuestion = jetons(question);
    if (jetonsSujet.size > 0 && jetonsQuestion.length > 0) {
      const commun = new Set([...jetonsQuestion].filter((j) => jetonsSujet.has(j)));
      const recouvrement = commun.size / jetonsSujet.size;
      const jaccard = commun.size / (jetonsSujet.size + jetonsQuestion.length - commun.size);
      if (recouvrement >= 0.95 || jaccard >= 0.75) {
        signalements.push(
          `Formulation n°${numero} — chevauchement de vocabulaire très fort avec l'intitulé ` +
            `(recouvrement ${Math.round(recouvrement * 100)} %) : risque de reformulation plate. ` +
            'Vérifie que la question ajoute une vraie tension et n’est pas le sujet avec un « ? ».'
        );
      }
    }

    // Périmètre lexical : une formulation est suspecte de hors-sujet lorsque
    // une part IMPORTANTE de sa longueur provient de termes « pleins » inconnus
    // du vocabulaire du sujet / de l'analyse. Seuil volontairement haut (0,6) :
    // un terme nouveau isolé et bien relié au sujet n'est pas un signal, et le
    // second passage modèle reste de toute façon systématique — l'heuristique
    // ne sert qu'à attirer son attention sur les décrochages nets.
    const jetonsComplets = jetons(question).filter((j) => j.length >= 6);
    const totalLettres = normaliser(question).replace(/[^a-z0-9]/g, '').length;
    if (jetonsComplets.length > 0 && totalLettres > 0) {
      const suspects = [
        ...new Set(jetonsComplets.filter((j) => !MOTS_OUTILS.has(j) && !vocab.has(j))),
      ];
      const lettresSuspectes = suspects.reduce((s, j) => s + j.length, 0);
      if (lettresSuspectes / totalLettres >= 0.6) {
        signalements.push(
          `Formulation n°${numero} — le vocabulaire « ${suspects.join(', ')} » est en grande ` +
            'partie étranger au sujet et à l’analyse : risque de hors-sujet. Confirme que ' +
            'chaque concept reste borné par les mots-clés, sinon recentre la question.'
        );
      }
    }
  });
  return signalements;
}

/**
 * Répare les écarts résiduels du JSON renvoyé par le second passage :
 * - supprime les formulations structurellement incomplètes ;
 * - borne le nombre de formulations (2 à 4) ;
 * - s'assure que « recommandation » pointe bien une formulation présente et
 *   que la ligne directrice / justification restent non vides (repli sur la
 *   génération initiale si le second passage les a omises).
 * Renvoie un objet « probleme » propre, ou lève une erreur 502 si moins de
 * MIN_FORMULATIONS formulations exploitables subsistent.
 */
function assainirProbleme(corrige, original) {
  if (!corrige || typeof corrige !== 'object' || Array.isArray(corrige)) {
    throw httpError(502, 'Le second passage de vérification n’a pas renvoyé d’objet utilisable. Réessayez.');
  }

  let formulations = (Array.isArray(corrige.formulations) ? corrige.formulations : [])
    .filter((f) => formulationCompletes(f).ok);

  if (formulations.length > MAX_FORMULATIONS) {
    formulations = formulations.slice(0, MAX_FORMULATIONS);
  }

  const ligneDirectrice =
    (typeof corrige.ligne_directrice === 'string' && corrige.ligne_directrice.trim()) ||
    (original && typeof original.ligne_directrice === 'string' && original.ligne_directrice.trim()) ||
    '';
  if (!ligneDirectrice) {
    throw httpError(502, 'La problématique vérifiée n’a pas de ligne directrice exploitable. Réessayez.');
  }

  if (formulations.length < MIN_FORMULATIONS) {
    throw httpError(
      502,
      'Après vérification, moins de 2 formulations de problématique conformes subsistent. ' +
        'Relancez la génération pour obtenir de nouvelles propositions.'
    );
  }

  let recommandation = (typeof corrige.recommandation === 'string' ? corrige.recommandation : '').trim();
  const texteFormulations = formulations.map((f) => String(f.formulation).trim());
  if (!texteFormulations.includes(recommandation)) {
    // Repli cohérent avec problemeRetenuPourSuite (promptBuilder) : première formulation.
    recommandation = texteFormulations[0];
  }

  const justification =
    (typeof corrige.justification_recommandation === 'string' &&
      corrige.justification_recommandation.trim()) ||
    (original && typeof original.justification_recommandation === 'string'
      ? original.justification_recommandation.trim()
      : '') ||
    '';

  return {
    ligne_directrice: ligneDirectrice.trim(),
    formulations,
    recommandation,
    justification_recommandation: justification,
  };
}

/**
 * Point d'entrée : prend la problématique issue du premier passage, la soumet
 * aux heuristiques puis à un second passage d'auto-vérification par le modèle,
 * et renvoie l'objet « probleme » final (schéma identique au premier passage).
 *
 * En cas d'échec d'infrastructure du second passage (réseau, parsing, budget),
 * on renonce au filet plutôt que de bloquer l'étudiant : la génération initiale
 * est conservée — le comportement reste celui d'avant. Les erreurs de NON
 * conformité (moins de 2 formulations valides) lèvent en revanche un 502.
 */
async function verifierEtCorrigerProbleme({ system, session, problemeGenere }) {
  const original = problemeGenere && typeof problemeGenere === 'object' ? problemeGenere : {};
  const analyse =
    session.data && session.data.analyse && typeof session.data.analyse === 'object'
      ? session.data.analyse
      : {};

  const signalements = detecterSignalements({
    sujet: session.titre,
    theme: session.theme,
    analyse,
    formulations: original.formulations,
  });

  // ---- Second passage d'auto-vérification par le modèle ----
  const user = JSON.stringify({
    tache:
      'Relecture INDÉPENDANTE de la problématique produite par un premier passage. ' +
      'Applique les sept tests anti-dérive (reformulation plate, réponse évidente, périmètre ' +
      'borné par le sujet, tension réelle à deux pôles, argumentation possible en plusieurs ' +
      'parties, PROBLÈME RÉEL rencontré par des organisations, SOLUTION APPORTABLE par des ' +
      'préconisations concrètes) à CHAQUE formulation, puis au signalement des contrôles ' +
      'automatiques ci-dessous. Exige un problème réel : écarte toute formulation purement ' +
      'descriptive ou explicative (« pourquoi X existe-t-il ? ») qui ne débouche sur aucune ' +
      'réponse actionnable, c\'est un critère éliminatoire. ' +
      'Conserve MOT POUR MOT toute formulation qui passe les sept tests (ne reformule jamais ' +
      'gratuitement une formulation valide). Corrige toute formulation défaillante — question ' +
      'recentrée, tension renforcée, justification mise à jour pour rester vraie. ' +
      'Renvoie l’objet « probleme » FINAL complet, au format de sortie exact attendu : ' +
      'ligne_directrice, formulations (2 à 4, ordre conservé), recommandation (texte exact de ' +
      'la formulation la plus solide), justification_recommandation.',
    sujet: String(session.titre || '').trim(),
    theme: String(session.theme || '').trim(),
    contexte_etudiant: String(session.contexte || '').trim() || null,
    analyse_sujet: {
      reformulation: analyse.reformulation || '',
      mots_cles: analyse.mots_cles || [],
      notions_a_maitriser: analyse.notions_a_maitriser || [],
      tensions: analyse.tensions || [],
      angles_approche: analyse.angles_approche || [],
    },
    problematique_candidate: original,
    signalements_automatiques: signalements,
  });

  let corrige;
  try {
    const raw = await generateDeepseek(system, user);
    corrige = parseJsonStrict(raw);
  } catch (_err) {
    // Le second passage est un filet de qualité, pas un point de défaillance
    // unique : si l'appel échoue (réseau, parsing, budget), on rend le premier
    // passage tel quel — comportement strictement identique à avant ce filet.
    return original;
  }

  return assainirProbleme(corrige, original);
}

module.exports = {
  verifierEtCorrigerProbleme,
  detecterSignalements,
  formulationCompletes,
  normaliser,
};
