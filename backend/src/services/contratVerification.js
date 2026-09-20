/**
 * VÉRIFICATION DU CONTRAT MÉTIER (Passe A).
 *
 * PHILOSOPHIE : la Passe A n'est PAS l'évaluation finale de la soutenance. Elle
 * sert à produire une problématique UTILISABLE, à l'afficher, à la laisser
 * éditer et valider — et à débloquer le Plan. Les contrôles détaillés de
 * cohérence, de sources, de cas d'entreprise, de préconisations et de grille
 * CESI sont faits PLUS TARD, à l'étape Support / Export (verificationExport.js).
 *
 * REJETS BLOQUANTS (les 6 conditions minimales) :
 *   - la problématique est absente ou vide ;
 *   - la tension est absente ou vide ;
 *   - la problématique n'est pas une question (pas de « ? ») ;
 *   - c'est une question oui / non évidente ;
 *   - c'est une copie presque identique du sujet ;
 *   - elle contient moins de 5 mots utiles.
 *
 * TOUT LE RESTE EST UN AVERTISSEMENT, jamais un blocage :
 *   tension décorrélée, mots-clés absents, justification absente,
 *   préconisations absentes ou décorrélées, cas absents, cas d'échec absent,
 *   ouverture absente, question trop large ou trop longue, amorce molle,
 *   faible recouvrement lexical.
 *
 * Une question n'est JAMAIS rejetée parce qu'elle n'emploie pas exactement les
 * mots de la tension : la tension est une phrase INTERNE issue de l'analyse, la
 * problématique une question REFORMULÉE et plus concrète. Elles peuvent décrire
 * le même problème avec des mots différents.
 *
 * En cas de rejet, `ciblerRegeneration()` indique quoi régénérer : UNIQUEMENT
 * tension + problematique, sans toucher aux mots-clés déjà validés.
 */

const MAX_MOTS_QUESTION = 45;
// Seuil bloquant : « moins de 5 mots utiles ». C'est la condition minimale du
// cahier des charges (PROBLEMATIC_TOO_SHORT) ; au-delà, la longueur n'est plus
// qu'un avertissement de lisibilité.
const MIN_MOTS_QUESTION = 5;
const MIN_RECOUVREMENT_SOLUTIONS = 0.12;
const MIN_RECOUVREMENT_MOT_CLE = 1;
// Au-delà de ce nombre de mots, la question reste valide mais devient difficile
// à mémoriser : avertissement, jamais un rejet.
const SEUIL_AVERTISSEMENT_MOTS_QUESTION = 45;

/** Amorces acceptables pour une problématique de Grand Oral. */
const AMORCES_VALIDES = [
  'comment',
  'en quoi',
  'dans quelle mesure',
  'quelles conditions',
  'par quels leviers',
  'quelle place',
  'quel role',
  'de quelle maniere',
  'sur quels leviers',
];

/**
 * Amorce « molle » : un verbe d'amélioration sans contrepartie nommée. Une
 * question qui commence comme ça et ne cite aucune contrainte est un vœu, pas
 * un problème d'entreprise.
 */
const AMORCES_MOLLES = [
  'comment optimiser',
  'comment ameliorer',
  'comment renforcer',
  'comment developper',
  'comment ameliorer',
  'comment moderniser',
  'comment digitaliser',
  'comment accelerer',
  'comment perfectionner',
  'comment maximiser',
  'comment booster',
  'comment reussir',
  'comment piloter',
  'comment industrialiser',
];

/**
 * Contraintes qui rendent une amorce « molle » acceptable. Uniquement des
 * frictions nommées : ni le vocabulaire du sujet (« transformation », « pme »),
 * ni des mots trop génériques, sinon n'importe quelle question molle passerait
 * grâce à un mot du décor.
 */
const CONTRAINTES = [
  'cout', 'couts', 'budget', 'prix', 'economi',
  'competence', 'competences', 'formation', 'expertise', 'maitrise',
  'dette', 'endettement', 'tresorerie', 'legacy', 'technique heritee',
  'conformite', 'reglementation', 'reglementaire', 'rgpd',
  'dependance', 'dependances', 'fournisseur', 'monopole',
  'delai', 'delais', 'urgence', 'penurie', 'turnover', 'attrition',
  'friction', 'resistance', 'adhesion', 'reticence',
  'cyber', 'securite', 'climat', 'carbone', 'energie',
];

/** Débats d'opinion : disqualifiants (question oui/non ou jugement de valeur). */
const TOURNURES_OUI_NON = [
  'faut-il', 'fautil', 'doit-on', 'doiton', 'devrait-on', 'devraiton',
  'est-ce', 'estce', 'peut-on', 'peuton', 'est-il', 'estil',
  'sont-ils', 'sontils', 'est-elle', 'estelle', 'est-ce que', 'estceque',
  'a-t-on', 'aton', 'y a-t-il', 'y atil',
];

/** Mots-outils exclus des calculs de recouvrement. */
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
    'chaque', 'plusieurs', 'quelques', 'toujours', 'souvent', 'jamais',
  ].map((m) => m.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
);

function normaliser(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Jetons bruts (lettres/chiffres). */
function jetons(texte) {
  return normaliser(texte)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Jetons « pleins » : longueur >= 4 et hors mots-outils. */
function jetonsPleins(texte) {
  return jetons(texte).filter((j) => j.length >= 4 && !MOTS_OUTILS.has(j));
}

/** Part du vocabulaire de `reference` retrouvée dans `texte`. */
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

/** Chevauchement de Jaccard entre deux textes. */
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

/** Retire accents et ponctuation pour comparer une tournure. */
function aplatir(texte) {
  return normaliser(texte).replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Mots-clés d'un contrat, tolérants aux deux formes (chaîne ou {mot, definition}).
 * @returns {string[]}
 */
function motsClesDe(contrat) {
  const bruts = Array.isArray(contrat?.motsCles) ? contrat.motsCles : [];
  return bruts
    .map((m) => (typeof m === 'string' ? m : m && m.mot))
    .map((m) => String(m || '').trim())
    .filter(Boolean);
}

/** Texte agrégé des préconisations (tolérant aux formes chaîne / objet). */
function textePreconisations(contrat) {
  const bruts = Array.isArray(contrat?.preconisations) ? contrat.preconisations : [];
  return bruts
    .map((p) => {
      if (typeof p === 'string') return p;
      if (!p || typeof p !== 'object') return '';
      return [p.action, p.intitule, p.titre, p.detail, p.description, p.moyen, p.cible]
        .filter(Boolean)
        .join(' ');
    })
    .join(' \n ');
}

function contientUne(textePlat, tournures) {
  return tournures.find((t) => textePlat.includes(aplatir(t))) || null;
}

/**
 * Vrai si la tournure apparaît comme MOT ENTIER (ou début de mot, pour gérer
 * les singuliers/pluriels et les suffixes : « economi » → « economique »).
 * Sans ça, « formation » matcherait « trans-formation » et n'importe quelle
 * contrainte passerait par accident.
 */
function contientMot(textePlat, tournure) {
  const t = aplatir(tournure);
  if (!t) return false;
  return new RegExp(`(^| )${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(textePlat);
}

/**
 * LES 6 REJETS BLOQUANTS DE LA PASSE A — liste fermée.
 *
 * Une génération structurellement valide ne doit plus être refusée pour une
 * heuristique sémantique (tension « décorrélée », mot-clé absent, cas d'échec
 * manquant…). Ces règles-là deviennent des avertissements : elles seront
 * revues à l'étape Support / Export, où l'étudiant dispose de tout son travail.
 *
 * Restent bloquants, et seulement eux :
 *   - problématique absente ou vide ;
 *   - tension absente ou vide ;
 *   - problématique qui n'est pas une question ;
 *   - question oui / non évidente ;
 *   - copie presque identique du sujet ;
 *   - moins de 5 mots utiles.
 */
const REJETS_CORE = new Set([
  'contrat_question_absente',
  'contrat_tension_absente',
  'contrat_pas_une_question',
  'contrat_question_courte',
  'contrat_question_oui_non',
  'contrat_copie_sujet',
]);

/**
 * Rejets désormais traités en AVERTISSEMENT à la Passe A. Conservés sous forme
 * de liste explicite pour la traçabilité du déplacement (livrable) : ces codes
 * ne bloquent plus la génération, mais restent visibles pour l'étudiant et
 * redeviennent stricts à la vérification pré-export.
 */
const REJETS_DEPLACES_EN_AVERTISSEMENT = new Set([
  'contrat_tension_decorrelee',
  'contrat_mots_cles_absents',
  'contrat_cas_sans_echec',
  'contrat_justification_absente',
  'contrat_preconisations_decorrelees',
  'contrat_solutions_decorrelees',
  'contrat_solutions_absentes',
  'contrat_cas_absents',
  'contrat_cas_sans_source',
  'contrat_ouverture_absente',
  'contrat_question_trop_large',
  'contrat_question_plus_large',
  'contrat_question_longue',
  'contrat_amorce_molle',
  'contrat_amorce_invalide',
  'contrat_hors_sujet',
  'contrat_ligne_directrice_absente',
  'contrat_question_inutile',
]);

/**
 * Vérifie un contrat métier (Passe A).
 *
 * @param {object} params
 * @param {string} params.sujet  Intitulé du sujet (session.titre).
 * @param {string} [params.theme]
 * @param {object} params.contrat Contrat issu de la Passe A.
 * @returns {{ valide: boolean, coreValide: boolean, rejets: Array<{code, message}>,
 *             rejetsCore: Array<{code, message}>, rejetsSecondaires: Array<{code, message}>,
 *             avertissements: string[], observations: object }}
 */
function verifierContrat({ sujet, theme = '', contrat, mode = 'creation' }) {
  const rejets = [];
  const avertissements = [];
  const rejeter = (code, message) => rejets.push({ code, message });
  // Depuis la simplification de la Passe A, les règles de QUALITÉ (amorce molle,
  // tension décorrélée, mots-clés, cas, préconisations…) ne bloquent PLUS JAMAIS
  // la génération, quel que soit le mode : elles deviennent des avertissements.
  // Seules les 6 conditions minimales de `REJETS_CORE` appellent `rejeter()`. Le
  // contrôle strict complet est déplacé à la vérification pré-export
  // (verificationExport.js), où l'étudiant dispose de tout son travail.

  const c = contrat && typeof contrat === 'object' ? contrat : {};
  const question = String(c.problematique || '').trim();
  const tension = typeof c.tension === 'string' ? c.tension.trim() : '';
  const justification = String(c.justificationProbleme || '').trim();
  const motsCles = motsClesDe(c);
  const texteContexte = typeof c.contexte === 'string' ? c.contexte : JSON.stringify(c.contexte || '');
  const texteSolutions = textePreconisations(c);
  const cas = Array.isArray(c.casEntreprises) ? c.casEntreprises : [];

  const questionPlat = aplatir(question);
  const sujetPlat = aplatir(`${sujet} ${theme}`);

  // ---- Structure minimale ----
  if (!question) {
    rejeter('contrat_question_absente', 'Aucune problématique dans le contrat : la Passe B ne peut pas démarrer.');
  }
  if (!tension) {
    rejeter('contrat_tension_absente', "La tension n'est pas renseignée : la question ne peut pas naître d'une friction d'entreprise.");
  }
  // La justification est VISIBLE mais FACULTATIVE en Passe A : son absence
  // devient un avertissement, jamais un rejet. Elle peut être complétée plus
  // tard (contexte, enjeux, existant, sources) sans changer la question. Le
  // contrôle strict est déplacé à la vérification pré-export.
  if (!justification) {
    avertissements.push(
      "La justification du problème reste à approfondir : son importance sera consolidée avec le contexte, les enjeux et l'existant."
    );
  }
  if (motsCles.length < MIN_RECOUVREMENT_MOT_CLE) {
    // Élément SECONDAIRE : les mots-clés sont hérités de l'Analyse
    // (domain/contratPasseA.js) et consolidés aux étapes suivantes. Leur absence
    // ne bloque jamais la Passe A — c'est un avertissement, exigé plus tard à
    // l'export.
    avertissements.push(
      'Aucun mot clé défini dans le contrat : ils seront hérités de l’Analyse et consolidés au Plan.'
    );
  }

  // ---- La question doit être une question ----
  const nbMots = jetons(question).length;
  if (question && !question.includes('?')) {
    rejeter('contrat_pas_une_question', `« ${question} » n'est pas une question : il manque le point d'interrogation.`);
  }
  // Condition minimale : « moins de 5 mots utiles ». En dessous, la question ne
  // porte rien ; au-dessus, elle reste acceptée.
  if (question && nbMots < MIN_MOTS_QUESTION) {
    rejeter('contrat_question_courte', `La question est trop courte (${nbMots} mots) : elle ne peut pas porter une tension.`);
  }
  // Longueur et amorce : AVERTISSEMENTS. Une question de 60 mots reste
  // exploitable, elle sera simplement resserrée en éditant ou au Support.
  if (question && nbMots > SEUIL_AVERTISSEMENT_MOTS_QUESTION) {
    avertissements.push(
      `La question fait ${nbMots} mots : au-delà de ${MAX_MOTS_QUESTION} mots elle devient difficile à rappeler en pied de slide. À resserrer avant l’export.`
    );
  }
  const amorce = contientUne(questionPlat, AMORCES_VALIDES);
  if (question && !amorce) {
    avertissements.push(
      "La question ne s'ouvre pas sur une amorce attendue (comment / en quoi / dans quelle mesure / quelles conditions / par quels leviers). À reformuler si possible — sans blocage."
    );
  }

  // ---- Copie / paraphrase du sujet : REJET BLOQUANT ----
  // Le seuil est haut : « comment optimiser la transformation digitale des PME »
  // reprend le sujet mot pour mot avec un « ? ». C'est le sujet, pas une
  // problématique — cela reste l'une des 6 conditions bloquantes.
  const rec = recouvrement(sujet, question);
  const jac = jaccard(sujet, question);
  const copieSujet = Boolean(sujet) && (rec >= 0.9 || jac >= 0.7);
  if (copieSujet) {
    rejeter(
      'contrat_copie_sujet',
      `La question recouvre ${Math.round(rec * 100)} % du vocabulaire du sujet : c'est le sujet avec un point d'interrogation, pas une problématique.`
    );
  }

  // ---- Question oui / non : REJET BLOQUANT ----
  // Une question fermée n'est pas un problème à instruire : condition minimale.
  const ouiNon = copieSujet ? null : contientUne(questionPlat, TOURNURES_OUI_NON);
  if (ouiNon) {
    rejeter(
      'contrat_question_oui_non',
      `La tournure « ${ouiNon} » ouvre une question fermée (oui / non) ou un débat d'opinion : le jury attend un problème à instruire, pas un verdict.`
    );
  }

  // ---- Amorce molle sans contrainte : AVERTISSEMENT ----
  // « comment optimiser X » sans contrainte nommée est un vœu plutôt qu'un
  // problème, mais ce n'est plus un motif de refus : l'étudiant peut éditer la
  // question, et le contrôle strict revient avant l'export.
  const amorceMolle = copieSujet ? null : contientUne(questionPlat, AMORCES_MOLLES);
  if (amorceMolle && !copieSujet && !CONTRAINTES.some((ct) => contientMot(questionPlat, ct))) {
    avertissements.push(
      `La question s'ouvre sur « ${amorceMolle} » sans nommer de contrainte (coût, compétence, dette, conformité, dépendance, délai, taille d'entreprise…). À préciser avant l’export.`
    );
  }

  // ---- Ancrage lexical : AVERTISSEMENT ----
  // Un faible recouvrement avec les mots-clés n'est plus un rejet : la tension
  // et la question peuvent décrire le même problème avec des mots différents.
  if (question && motsCles.length > 0) {
    const ancrage = motsCles.some((mc) => {
      const jetonsMc = jetonsPleins(mc);
      if (jetonsMc.length === 0) return false;
      return jetonsMc.some((j) => questionPlat.includes(j));
    });
    if (!ancrage) {
      avertissements.push(
        `Aucun mot-clé du sujet (${motsCles.join(', ')}) n’apparaît littéralement dans la question : vérifiez que le lien reste explicite pour le jury.`
      );
    }
  }

  // ---- Périmètre : AVERTISSEMENT ----
  // Une question « plus large que le sujet » reste exploitable ; le jury le
  // verra, l'export le contrôlera. On le signale sans bloquer.
  if (sujet && question) {
    const recSujet = recouvrement(question, sujet);
    if (recSujet === 0) {
      avertissements.push(
        "La question n'emprunte aucun terme significatif au sujet : vérifiez qu'elle reste dans le périmètre."
      );
    }
    const jetonsSujet = new Set(jetonsPleins(sujet));
    const jetonsQuestion = new Set(jetonsPleins(question));
    const nouveaux = [...jetonsQuestion].filter((j) => !jetonsSujet.has(j));
    if (jetonsSujet.size > 0 && nouveaux.length > jetonsQuestion.size * 0.9 && jetonsQuestion.size >= 6) {
      avertissements.push(
        'La question introduit un vocabulaire presque entièrement étranger au sujet : vérifiez qu’elle ne traite pas un autre sujet, plus large.'
      );
    }
  }

  // ---- Tension branchée sur la question : AVERTISSEMENT (jamais un rejet) ----
  // C'est LE correctif demandé : une question n'est JAMAIS refusée parce qu'elle
  // n'emploie pas exactement les mots de la tension. La tension est une phrase
  // interne issue de l'analyse ; la problématique est une question reformulée et
  // plus concrète. Le lien peut être évident pour un humain sans recouvrement
  // lexical. On le signale, on ne bloque pas.
  if (tension && question) {
    const recTension = Math.max(recouvrement(tension, question), recouvrement(question, tension));
    if (recTension < 0.1) {
      avertissements.push(
        "La tension et la question n'emploient pas le même vocabulaire : vérifiez qu'elles décrivent bien le même problème d'entreprise (le lien peut être reformulé)."
      );
    }
  }

  // ---- Préconisations branchées sur la tension / la question ----
  // Éléments SECONDAIRES : ils ne bloquent pas la validation de la problématique.
  // Un manque ou un décrochage devient un avertissement — l'export final reste
  // strict, lui.
  if (texteSolutions) {
    const recSolTension = tension ? recouvrement(tension, texteSolutions) : 0;
    const recSolQuestion = question ? recouvrement(question, texteSolutions) : 0;
    if (Math.max(recSolTension, recSolQuestion) < MIN_RECOUVREMENT_SOLUTIONS) {
      avertissements.push(
        "Les préconisations ne réutilisent ni le vocabulaire de la tension ni celui de la question : elles ne répondent pas au problème posé. À retravailler avant l’export."
      );
    }
  } else {
    avertissements.push(
      'Aucune préconisation dans le contrat : rien ne peut encore répondre à la question. Elles seront construites au Plan et au Support.'
    );
  }

  // ---- Cas d'entreprises : sourcés, dont un échec ----
  // Également secondaire : la Passe B et l'export les exigent, pas la Passe A.
  if (cas.length === 0) {
    avertissements.push(
      'Aucun cas d’entreprise dans le contrat : le jury attend des cas réels et sourcés. À ajouter avant l’export.'
    );
  } else {
    const sansSource = cas.filter((x) => !String((x && x.source) || '').trim());
    if (sansSource.length > 0) {
      avertissements.push(
        `${sansSource.length} cas d'entreprise ne portent pas de source : zéro source inventée, chaque cas doit être sourcé depuis le .md.`
      );
    }
    // Statut canonique explicite (domain/contratPasseA.js). Plus aucune
    // heuristique sur le JSON sérialisé : un cas sans statut explicite reste
    // « a_qualifier » et ne compte jamais comme un succès par défaut.
    const aEchec = cas.some((x) => x && (x.statut === 'echec' || x.statut === 'mixte'));
    if (!aEchec) {
      avertissements.push(
        "Aucun cas d'échec parmi les cas d'entreprise : le jury sanctionne le plaidoyer à sens unique. À compléter avant l’export."
      );
    }
  }

  // ---- Ouverture : une question, sans réponse ----
  const ouverture = typeof c.ouverture === 'string' ? c.ouverture.trim() : '';
  if (!ouverture) {
    avertissements.push("Pas de question d'ouverture : la conclusion manquera de prise de recul. À préparer avant l’export.");
  } else if (!ouverture.includes('?')) {
    avertissements.push("L'ouverture n'est pas formulée comme une question.");
  }

  // ---- Ligne directrice ----
  const ligneDirectrice = String(c.ligneDirectrice || c.ligne_directrice || '').trim();
  if (!ligneDirectrice) {
    avertissements.push('Aucune ligne directrice : le fil rouge de la présentation reste à préciser.');
  }

  // Décomposition : ce qui bloque la logique du sujet vs ce qui sera construit
  // ou exigé plus tard (Passe B, export).
  const rejetsCore = rejets.filter((r) => REJETS_CORE.has(r.code));
  const rejetsSecondaires = rejets.filter((r) => !REJETS_CORE.has(r.code));

  return {
    valide: rejets.length === 0,
    coreValide: rejetsCore.length === 0,
    rejets,
    rejetsCore,
    rejetsSecondaires,
    avertissements,
    observations: {
      nbMotsQuestion: nbMots,
      recouvrementSujet: Math.round(rec * 100) / 100,
      jaccardSujet: Math.round(jac * 100) / 100,
      motsCles: motsCles.length,
      cas: cas.length,
      amorce: amorce || null,
      contextePresent: texteContexte.trim().length > 0,
      casAvecEchec: cas.some((x) => x && (x.statut === 'echec' || x.statut === 'mixte')),
    },
  };
}

/**
 * Champs à régénérer après un rejet : UNIQUEMENT tension + problématique, les
 * deux seules informations bloquantes de la Passe A. La table reste volontairement
 * large : `ciblerRegeneration` sert aussi au contrôle pré-export, où les codes
 * déplacés en avertissement peuvent redevenir bloquants.
 */
function ciblerRegeneration(rejets) {
  const codeParChamp = {
    contrat_tension_absente: 'tension',
    contrat_tension_decorrelee: 'tension',
    contrat_question_absente: 'problematique',
    contrat_pas_une_question: 'problematique',
    contrat_question_courte: 'problematique',
    contrat_question_longue: 'problematique',
    contrat_amorce_invalide: 'problematique',
    contrat_question_oui_non: 'problematique',
    contrat_amorce_molle: 'problematique',
    contrat_copie_sujet: 'problematique',
    contrat_hors_sujet: 'problematique',
    contrat_question_plus_large: 'problematique',
    contrat_justification_absente: 'justificationProbleme',
    contrat_solutions_decorrelees: 'preconisations',
    contrat_question_inutile: 'preconisations',
    contrat_solutions_absentes: 'preconisations',
    contrat_cas_absents: 'casEntreprises',
    contrat_cas_sans_source: 'casEntreprises',
    contrat_cas_sans_echec: 'casEntreprises',
    contrat_ligne_directrice_absente: 'ligneDirectrice',
  };
  const champs = new Set();
  (Array.isArray(rejets) ? rejets : []).forEach((r) => {
    const champ = codeParChamp[r?.code];
    if (champ) champs.add(champ);
  });
  return [...champs];
}

/**
 * Message compact destiné au modèle de régénération ciblée.
 * @returns {string}
 */
function consigneRegeneration(rejets, champs) {
  const lignes = [
    `Régénère UNIQUEMENT ces champs du contrat : ${champs.join(', ')}.`,
    'Conserve MOT POUR MOT tous les autres champs (motsCles, contexte, casEntreprises) : ils sont déjà validés par la personne.',
    '',
    'Motifs du rejet :',
  ];
  (Array.isArray(rejets) ? rejets : []).forEach((r) => lignes.push(`- ${r.message}`));
  return lignes.join('\n');
}

module.exports = {
  verifierContrat,
  ciblerRegeneration,
  consigneRegeneration,
  recouvrement,
  jaccard,
  jetons,
  jetonsPleins,
  motsClesDe,
  textePreconisations,
  REJETS_CORE,
  REJETS_DEPLACES_EN_AVERTISSEMENT,
  AMORCES_VALIDES,
  AMORCES_MOLLES,
  CONTRAINTES,
  TOURNURES_OUI_NON,
  MAX_MOTS_QUESTION,
};
