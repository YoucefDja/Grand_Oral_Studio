/**
 * VÉRIFICATION DURE DU CONTRAT MÉTIER (Passe A).
 *
 * Le contrat est le document qui engage toute la suite : si la problématique
 * est molle, les 20 slides seront molles. Ce module applique donc des REJETS
 * BLOQUANTS (pas des avertissements) avant d'autoriser la Passe B :
 *
 *   - la question ne doit pas être le sujet recopié ou paraphrasé ;
 *   - ce doit être une question (point d'interrogation + amorce comment / en
 *     quoi / dans quelle mesure / quelles conditions) ;
 *   - pas de question oui / non ;
 *   - pas d'amorce molle (« comment optimiser X ») sans contrainte nommée
 *     (coût, compétence, dette, conformité, dépendance, délai, taille…) ;
 *   - au moins un mot-clé du sujet doit apparaître dans la question ;
 *   - la question ne doit pas être plus large que le sujet ;
 *   - les préconisations doivent réutiliser le vocabulaire de la tension ;
 *   - test inverse : si les préconisations tiennent sans la question, c'est que
 *     la question ne sert à rien → contrat invalide.
 *
 * En cas de rejet, `ciblerRegeneration()` indique quoi régénérer : UNIQUEMENT
 * tension + problematique + justification, sans toucher aux mots-clés déjà
 * validés par l'utilisateur.
 */

const MAX_MOTS_QUESTION = 45;
const MIN_MOTS_QUESTION = 6;
const MIN_RECOUVREMENT_SOLUTIONS = 0.12;
const MIN_RECOUVREMENT_MOT_CLE = 1;

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

/** Texte agrégé des cas d'entreprise (pour vérifier sources et échec). */
function texteCas(contrat) {
  const bruts = Array.isArray(contrat?.casEntreprises) ? contrat.casEntreprises : [];
  return bruts
    .map((c) => {
      if (!c || typeof c !== 'object') return String(c || '');
      return [c.nom, c.chiffre, c.angle, c.source, c.issue, c.resultat].filter(Boolean).join(' ');
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
 * Vérifie un contrat métier (Passe A).
 *
 * @param {object} params
 * @param {string} params.sujet  Intitulé du sujet (session.titre).
 * @param {string} [params.theme]
 * @param {object} params.contrat Contrat issu de la Passe A.
 * @returns {{ valide: boolean, rejets: Array<{code, message}>, avertissements: string[], observations: object }}
 */
function verifierContrat({ sujet, theme = '', contrat }) {
  const rejets = [];
  const avertissements = [];
  const rejeter = (code, message) => rejets.push({ code, message });

  const c = contrat && typeof contrat === 'object' ? contrat : {};
  const question = String(c.problematique || '').trim();
  const tension = typeof c.tension === 'string' ? c.tension.trim() : '';
  const justification = String(c.justificationProbleme || '').trim();
  const motsCles = motsClesDe(c);
  const texteContexte = typeof c.contexte === 'string' ? c.contexte : JSON.stringify(c.contexte || '');
  const texteSolutions = textePreconisations(c);
  const texteCasTxt = texteCas(c);
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
  if (!justification) {
    rejeter('contrat_justification_absente', "La justification du problème est absente : rien ne démontre que le problème se pose aujourd'hui.");
  }
  if (motsCles.length < MIN_RECOUVREMENT_MOT_CLE) {
    rejeter('contrat_mots_cles_absents', 'Aucun mot clé défini : la question ne peut pas être bornée par le sujet.');
  }

  // ---- La question doit être une question ----
  const nbMots = jetons(question).length;
  if (question && !question.includes('?')) {
    rejeter('contrat_pas_une_question', `« ${question} » n'est pas une question : il manque le point d'interrogation.`);
  }
  if (question && nbMots < MIN_MOTS_QUESTION) {
    rejeter('contrat_question_courte', `La question est trop courte (${nbMots} mots) : elle ne peut pas porter une tension.`);
  }
  if (question && nbMots > MAX_MOTS_QUESTION) {
    rejeter(
      'contrat_question_longue',
      `La question fait ${nbMots} mots : au-delà de ${MAX_MOTS_QUESTION} mots elle n'est plus mémorisable ni rappelable en pied de slide.`
    );
  }
  const amorce = contientUne(questionPlat, AMORCES_VALIDES);
  if (question && !amorce) {
    rejeter(
      'contrat_amorce_invalide',
      "La question ne s'ouvre pas sur une amorce recevable (comment / en quoi / dans quelle mesure / quelles conditions / par quels leviers)."
    );
  }

  // ---- Copie / paraphrase du sujet ----
  // Le seuil est haut : « comment optimiser la transformation digitale des PME »
  // reprend le sujet mot pour mot avec un « ? ». On le teste AVANT les tournures
  // fermées et l'amorce molle, qui ne sont alors que des symptômes du même
  // défaut et ne doivent pas masquer le diagnostic principal.
  const rec = recouvrement(sujet, question);
  const jac = jaccard(sujet, question);
  const copieSujet = Boolean(sujet) && (rec >= 0.9 || jac >= 0.7);
  if (copieSujet) {
    rejeter(
      'contrat_copie_sujet',
      `La question recouvre ${Math.round(rec * 100)} % du vocabulaire du sujet : c'est le sujet avec un point d'interrogation, pas une problématique.`
    );
    const communs = [...new Set(jetonsPleins(question))].filter((j) =>
      new Set(jetonsPleins(sujet)).has(j)
    );
    rejeter(
      'contrat_amorce_molle',
      `La question ne fait que reprendre les termes du sujet (${communs.join(', ')}) sans nommer la moindre contrainte (coût, compétence, dette, conformité, dépendance, délai, taille d'entreprise…). C'est un vœu, pas un problème d'entreprise.`
    );
  }

  // ---- Question oui / non ----
  const ouiNon = copieSujet ? null : contientUne(questionPlat, TOURNURES_OUI_NON);
  if (ouiNon) {
    rejeter(
      'contrat_question_oui_non',
      `La tournure « ${ouiNon} » ouvre une question fermée (oui / non) ou un débat d'opinion : le jury attend un problème à instruire, pas un verdict.`
    );
  }

  // ---- Amorce molle sans contrainte ----
  const amorceMolle = copieSujet ? null : contientUne(questionPlat, AMORCES_MOLLES);
  const copieDejaRejetee = rejets.some((r) => r.code === 'contrat_copie_sujet');
  if (amorceMolle && !copieDejaRejetee && !CONTRAINTES.some((ct) => contientMot(questionPlat, ct))) {
    rejeter(
      'contrat_amorce_molle',
      `La question s'ouvre sur « ${amorceMolle} » sans nommer la moindre contrainte (coût, compétence, dette, conformité, dépendance, délai, taille d'entreprise…). C'est un vœu, pas un problème d'entreprise.`
    );
  }

  // ---- Ancrage : au moins un mot-clé du sujet présent dans la question ----
  if (question && motsCles.length > 0) {
    const ancrage = motsCles.some((mc) => {
      const jetonsMc = jetonsPleins(mc);
      if (jetonsMc.length === 0) return false;
      return jetonsMc.some((j) => questionPlat.includes(j));
    });
    if (!ancrage) {
      rejeter(
        'contrat_hors_sujet',
        `Aucun mot-clé du sujet (${motsCles.join(', ')}) n'apparaît dans la question : elle a décroché du sujet.`
      );
    }
  }

  // ---- La question ne doit pas être plus large que le sujet ----
  if (sujet) {
    const recSujet = recouvrement(question, sujet);
    if (recSujet === 0 && question) {
      rejeter(
        'contrat_question_plus_large',
        "La question n'emprunte aucun terme significatif au sujet : elle est plus large que lui (ou hors périmètre)."
      );
    }
    const jetonsSujet = new Set(jetonsPleins(sujet));
    const jetonsQuestion = new Set(jetonsPleins(question));
    const nouveaux = [...jetonsQuestion].filter((j) => !jetonsSujet.has(j));
    if (jetonsSujet.size > 0 && nouveaux.length > jetonsQuestion.size * 0.9 && jetonsQuestion.size >= 6) {
      rejeter(
        'contrat_question_plus_large',
        'La question introduit un vocabulaire presque entièrement étranger au sujet : elle traite un autre sujet, plus large.'
      );
    }
  }

  // ---- Tension réellement branchée sur la question ----
  // Uniquement si aucune règle de fond n'a déjà tranché : sinon un rejet de
  // tension viendrait masquer le vrai diagnostic (copie du sujet, amorce molle,
  // question fermée) derrière un symptôme secondaire.
  if (tension && question && rejets.length === 0) {
    const recTension = Math.max(recouvrement(tension, question), recouvrement(question, tension));
    if (recTension < 0.1) {
      rejeter(
        'contrat_tension_decorrelee',
        "La tension ne recoupe pas la question : la friction décrite n'est pas celle qu'interroge la problématique."
      );
    }
  }

  // ---- Préconisations branchées sur la tension / la question ----
  if (texteSolutions) {
    const recSolTension = tension ? recouvrement(tension, texteSolutions) : 0;
    const recSolQuestion = question ? recouvrement(question, texteSolutions) : 0;
    if (Math.max(recSolTension, recSolQuestion) < MIN_RECOUVREMENT_SOLUTIONS) {
      rejeter(
        'contrat_solutions_decorrelees',
        "Les préconisations ne réutilisent ni le vocabulaire de la tension ni celui de la question : elles ne répondent pas au problème posé."
      );
    }
    const rejetsPourQuestionSeule = rejets.filter((r) => r.code !== 'contrat_solutions_decorrelees');
    if (rejetsPourQuestionSeule.length === 0 && Math.max(recSolTension, recSolQuestion) < 0.25) {
      rejeter(
        'contrat_question_inutile',
        "Test inverse : les préconisations tiennent sans la question. La problématique n'oriente rien — elle est trop molle."
      );
    }
  } else {
    rejeter('contrat_solutions_absentes', 'Aucune préconisation dans le contrat : rien ne peut répondre à la question.');
  }

  // ---- Cas d'entreprises : sourcés, dont un échec ----
  if (cas.length === 0) {
    rejeter('contrat_cas_absents', 'Aucun cas d’entreprise dans le contrat : le jury attend des cas réels et sourcés.');
  } else {
    const sansSource = cas.filter((x) => !String((x && x.source) || '').trim());
    if (sansSource.length > 0) {
      rejeter(
        'contrat_cas_sans_source',
        `${sansSource.length} cas d'entreprise ne portent pas de source : zéro source inventée, chaque cas doit être sourcé depuis le .md.`
      );
    }
    const aEchec = cas.some((x) => /echec|echec_ou_limite|limite|contre-exemple|insuffisan/i.test(JSON.stringify(x)));
    if (!aEchec) {
      rejeter('contrat_cas_sans_echec', "Aucun cas d'échec parmi les cas d'entreprise : le jury sanctionne le plaidoyer à sens unique.");
    }
  }

  // ---- Ouverture : une question, sans réponse ----
  const ouverture = typeof c.ouverture === 'string' ? c.ouverture.trim() : '';
  if (!ouverture) {
    avertissements.push("Pas de question d'ouverture : la conclusion manquera de prise de recul.");
  } else if (!ouverture.includes('?')) {
    avertissements.push("L'ouverture n'est pas formulée comme une question.");
  }

  // ---- Ligne directrice ----
  if (!String(c.ligneDirectrice || '').trim()) {
    rejeter('contrat_ligne_directrice_absente', 'Aucune ligne directrice : le fil rouge de la présentation est absent.');
  }

  return {
    valide: rejets.length === 0,
    rejets,
    avertissements,
    observations: {
      nbMotsQuestion: nbMots,
      recouvrementSujet: Math.round(rec * 100) / 100,
      jaccardSujet: Math.round(jac * 100) / 100,
      motsCles: motsCles.length,
      cas: cas.length,
      amorce: amorce || null,
      contextePresent: texteContexte.trim().length > 0,
      casAvecEchec: /echec|limite|contre-exemple/i.test(texteCasTxt),
    },
  };
}

/**
 * Champs à régénérer après un rejet : UNIQUEMENT tension + problématique +
 * justification. Les mots-clés et le contexte déjà validés sont conservés.
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
  AMORCES_VALIDES,
  AMORCES_MOLLES,
  CONTRAINTES,
  TOURNURES_OUI_NON,
  MAX_MOTS_QUESTION,
};
