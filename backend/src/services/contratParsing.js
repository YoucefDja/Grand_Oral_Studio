/**
 * Parsing et validation ROBUSTES de la sortie LLM de la Passe A (contrat métier).
 *
 * Pourquoi ce module existe : la route ne doit JAMAIS provoquer un 502 quand le
 * modèle renvoie autre chose qu'un JSON strict (pseudo-JSON à guillemets
 * simples, prose, balises Markdown, réponse tronquée, HTML d'un proxy…). Toute
 * réponse inexploitable devient une erreur applicative contrôlée :
 *
 *   - `INVALID_LLM_JSON`      : impossible d'extraire un objet JSON exploitable ;
 *   - `INVALID_CONTRACT_SCHEMA` : JSON lisible mais champs du contrat manquants.
 *
 * Le détail technique reste côté serveur (`internalReason`) et n'est jamais
 * renvoyé tel quel au client.
 */

const ERREUR_JSON = 'INVALID_LLM_JSON';
const ERREUR_SCHEMA = 'INVALID_CONTRACT_SCHEMA';

/**
 * Retire les fences Markdown éventuelles (```json … ``` ou ``` … ```).
 * Ne touche à rien d'autre : surtout pas aux apostrophes, qui seraient cassées
 * par une conversion aveugle `'` → `"` et masqueraient un mauvais output LLM.
 */
function retirerFences(raw) {
  let texte = String(raw || '').trim();
  const fence = texte.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```/);
  if (fence) return fence[1].trim();
  // Fence ouvrante sans fermeture (réponse tronquée) : on garde le contenu.
  texte = texte.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '');
  texte = texte.replace(/\n?```\s*$/, '');
  return texte.trim();
}

/**
 * Extrait le premier objet `{ … }` équilibré, en respectant les chaînes JSON
 * (une accolade dans une chaîne ne doit pas fausser le comptage). Si le modèle
 * a ajouté une phrase avant ou après, elle est ignorée.
 */
function extrairePremierObjet(texte) {
  const debut = texte.indexOf('{');
  if (debut === -1) return null;
  let profondeur = 0;
  let dansChaine = false;
  let echappe = false;
  for (let i = debut; i < texte.length; i += 1) {
    const c = texte[i];
    if (echappe) {
      echappe = false;
      continue;
    }
    if (c === '\\') {
      if (dansChaine) echappe = true;
      continue;
    }
    if (c === '"') {
      dansChaine = !dansChaine;
      continue;
    }
    if (dansChaine) continue;
    if (c === '{') profondeur += 1;
    else if (c === '}') {
      profondeur -= 1;
      if (profondeur === 0) return texte.slice(debut, i + 1);
    }
  }
  return null; // objet non fermé (troncature)
}

/** Marque typique d'un pseudo-JSON à guillemets simples renvoyé par un LLM. */
function ressembleAPseudoJson(texte) {
  return /(^|[\s{,])'[^']+'\s*:/.test(texte);
}

/**
 * Diagnostic technique (log serveur uniquement, jamais renvoyé au client).
 * On ne conserve qu'un extrait court, une seule ligne.
 */
function diagnostiquer(texte) {
  return {
    taille: texte.length,
    premierCaractere: texte.slice(0, 1) || '(vide)',
    contientFence: /```/.test(texte),
    pseudoJson: ressembleAPseudoJson(texte),
    // Extrait masqué : jamais le contenu complet d'une session.
    extrait: texte.slice(0, 120).replace(/\s+/g, ' '),
  };
}

/** Vrai si la valeur est une chaîne non vide (après trim). */
function chaineNonVide(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * ALIAS DE CHAMPS — le modèle (et l'historique du prompt) produit régulièrement
 * une clé sous un autre nom : snake_case, accent, synonyme anglais, ou ancien
 * format. Rejeter une génération pour cette seule raison serait absurde : on
 * accepte la variante et on la ramène TOUJOURS en camelCase en interne.
 *
 * L'ordre compte : le premier alias trouvé non vide gagne.
 */
const FIELD_ALIASES = {
  tension: [
    'tension',
    'tensionMetier',
    'tension_metier',
    'tensionPrincipale',
    'tension_principale',
    'probleme',
    'problème',
    'contradiction',
  ],
  problematique: ['problematique', 'problématique', 'problematic', 'problem', 'question'],
  justificationProbleme: [
    'justificationProbleme',
    'justification_probleme',
    'justification',
    'pourquoiCeProbleme',
    'pourquoi_ce_probleme',
  ],
  ligneDirectrice: ['ligneDirectrice', 'ligne_directrice', 'lineDirectrice', 'line_directrice'],
  preconisations: ['preconisations', 'préconisations', 'recommendations', 'recommandation'],
  justificationRecommandation: ['justificationRecommandation', 'justification_recommandation'],
  motsCles: ['motsCles', 'mots_cles', 'motsClés', 'keywords'],
  limitesExistant: ['limitesExistant', 'limites_existant', 'limites'],
  casEntreprises: ['casEntreprises', 'cas_entreprises', 'cas'],
  ouverture: ['ouverture', 'opening'],
  contexte: ['contexte', 'context'],
  sujet: ['sujet', 'subject'],
};

/**
 * Champs de la variante historique : le prompt demandait une LISTE de
 * `formulations` candidates (`{ question, justification }`) au lieu d'une
 * problématique unique. Une réponse produite par un ancien déploiement — ou par
 * un modèle qui a gardé ce réflexe — reste exploitable : on promeut une
 * formulation complète en `problematique` + `justificationProbleme`.
 *
 * On ne devine rien : la promotion n'a lieu que si le champ core est ABSENT,
 * que la formulation porte bien une question terminée par « ? », et on continue
 * de parcourir les formulations tant que la justification manque (la première
 * peut ne porter qu'une question, une suivante être complète).
 */
const ALIAS_FORMULATIONS = ['formulations', 'formulation', 'candidates', 'propositions'];

/** Clés d'une formulation qui peuvent porter la question. */
const FORMULATION_QUESTION_ALIASES = ['question', 'problematique', 'problématique', 'texte', 'formulation'];

/** Clés d'une formulation qui peuvent porter la justification du problème. */
const FORMULATION_JUSTIFICATION_ALIASES = [
  'justificationProbleme',
  'justification_probleme',
  'justification',
  'pourquoi',
  'raison',
  'raisons',
  'enjeu',
  'explication',
  'contexte',
  'motivation',
];

/**
 * `justification_recommandation` justifie la PRÉCONISATION, pas le problème
 * d'entreprise : la mapper sur `justificationProbleme` ferait passer un texte
 * de solution pour un diagnostic. On la conserve donc comme champ SECONDAIRE
 * dédié, en camelCase, sans jamais l'utiliser pour débloquer le core.
 */
const CHAMP_JUSTIFICATION_RECOMMANDATION = 'justificationRecommandation';

/** Récupère la première valeur non vide parmi les alias camelCase d'un champ. */
function valeurParAlias(source, champ) {
  const alias = FIELD_ALIASES[champ] || [champ];
  for (const cle of alias) {
    if (!(cle in source)) continue;
    const valeur = source[cle];
    if (valeur === undefined || valeur === null) continue;
    if (typeof valeur === 'string' && valeur.trim() === '') continue;
    if (Array.isArray(valeur) && valeur.length === 0) continue;
    return valeur;
  }
  return undefined;
}

/** Vrai si la clé est un alias connu d'un champ core (sert au diagnostic). */
function estAliasConnu(cle) {
  return Object.values(FIELD_ALIASES).some((liste) => liste.includes(cle));
}

/**
 * Extrait le core (question + justification) d'une liste de `formulations`.
 *
 * Fonction PURE et testable : c'est elle qui porte la rétrocompatibilité avec
 * l'ancien format que le modèle continue de produire. Elle parcourt TOUTES les
 * formulations et retient la première qui porte une vraie question ET une
 * justification : la première peut n'avoir qu'une question, une suivante être
 * complète. Une formulation réduite à une question ne clôt donc pas la
 * recherche de la justification.
 *
 * Aucun contenu n'est inventé : une clé absente reste absente.
 *
 * @param {Array} formulations liste brute issue de la réponse du modèle
 * @param {{ question?: string, justificationProbleme?: string }} dejaConnus
 *        valeurs déjà présentes à la racine : elles ne sont JAMAIS écrasées
 * @returns {{ problematique: string|null, justificationProbleme: string|null,
 *             formulationCount: number, formulationIndexUsed: number|null,
 *             questionIndex: number|null }}
 */
function extractCoreFromFormulations(formulations, dejaConnus = {}) {
  const liste = Array.isArray(formulations)
    ? formulations.filter((f) => f && typeof f === 'object' && !Array.isArray(f))
    : [];
  const resultat = {
    problematique: null,
    justificationProbleme: null,
    formulationCount: liste.length,
    formulationIndexUsed: null,
    questionIndex: null,
  };
  if (liste.length === 0) return resultat;

  const lireQuestion = (f) =>
    FORMULATION_QUESTION_ALIASES.map((cle) => f[cle]).find((v) => chaineNonVide(v)) || null;
  const lireJustification = (f) =>
    FORMULATION_JUSTIFICATION_ALIASES.map((cle) => f[cle]).find((v) => chaineNonVide(v)) || null;

  // Une question ne compte que si c'est VRAIMENT une question : une formulation
  // qui ne porte qu'un titre ne doit pas être promue en problématique.
  const estVraieQuestion = (texte) => typeof texte === 'string' && texte.trim().endsWith('?');

  let questionSeule = null;
  let questionSeuleIndex = null;

  for (let i = 0; i < liste.length; i += 1) {
    const question = lireQuestion(liste[i]);
    const justification = lireJustification(liste[i]);
    if (question && estVraieQuestion(question) && justification) {
      resultat.problematique = String(question).trim();
      resultat.justificationProbleme = String(justification).trim();
      resultat.formulationIndexUsed = i;
      resultat.questionIndex = i;
      return resultat;
    }
    // Question exploitable sans justification : on la garde en réserve mais on
    // CONTINUE de chercher une formulation complète.
    if (!questionSeule && question && estVraieQuestion(question)) {
      questionSeule = String(question).trim();
      questionSeuleIndex = i;
    }
  }

  // Aucune formulation complète : la question seule est promue si la racine n'a
  // rien, la justification reste absente (le core sera donc rejeté, avec le bon
  // code — jamais un générique ambigu).
  if (!chaineNonVide(dejaConnus.problematique) && questionSeule) {
    resultat.problematique = questionSeule;
    resultat.questionIndex = questionSeuleIndex;
  }
  return resultat;
}

/** Clés sous lesquelles l'analyse d'une session peut porter une tension. */
const CLES_TENSION_ANALYSE = ['tensions', 'contradictions', 'tensionsContradictions', 'enjeux'];

const CLES_TEXTE_TENSION = [
  'texte',
  'tension',
  'contradiction',
  'libelle',
  'label',
  'intitule',
  'description',
  'enjeu',
  'resume',
  'titre',
];

/**
 * Récupère une tension DÉJÀ ÉCRITE dans l'analyse validée de la session.
 *
 * Règle non négociable : on ne reformule rien, on ne résume rien, on n'invente
 * rien. On prend le premier texte non vide réellement présent dans les
 * structures connues de l'analyse. Si l'analyse n'en contient aucun, on renvoie
 * `null` : le core restera invalide et le rejet 422 explicite.
 *
 * @returns {string|null}
 */
function extraireTensionAnalyse(analyse) {
  if (!analyse || typeof analyse !== 'object' || Array.isArray(analyse)) return null;

  const premierTexte = (element) => {
    if (chaineNonVide(element)) return String(element).trim();
    if (!element || typeof element !== 'object' || Array.isArray(element)) return null;
    for (const cle of CLES_TEXTE_TENSION) {
      if (chaineNonVide(element[cle])) return String(element[cle]).trim();
    }
    return null;
  };

  for (const cle of CLES_TENSION_ANALYSE) {
    const valeur = analyse[cle];
    if (!valeur) continue;
    const elements = Array.isArray(valeur) ? valeur : [valeur];
    for (const element of elements) {
      const texte = premierTexte(element);
      if (texte) return texte;
    }
  }
  return null;
}

/**
 * Récupère une tension exploitable : d'abord celle du contrat (avec tous ses
 * alias), sinon celle de l'analyse sauvegardée. On ne devine jamais.
 *
 * @returns {{ tension: string, tensionSource: 'contract'|'analysis'|'missing' }}
 */
function resoudreTension(contrat, analyse) {
  const duContrat = valeurParAlias(contrat, 'tension');
  if (chaineNonVide(duContrat)) {
    return { tension: String(duContrat).trim(), tensionSource: 'contract' };
  }
  const deLAnalyse = extraireTensionAnalyse(analyse);
  if (chaineNonVide(deLAnalyse)) {
    return { tension: String(deLAnalyse).trim(), tensionSource: 'analysis' };
  }
  return { tension: '', tensionSource: 'missing' };
}

/**
 * Applique le map de compatibilité sur l'objet brut : chaque champ canonique est
 * écrit en camelCase, les clés d'alias sont supprimées pour ne pas laisser de
 * doublons dans le contrat stocké.
 *
 * @returns {{ promotions: string[], aliasUtilises: string[], formulationCount: number,
 *             formulationIndexUsed: number|null, justificationSource: string }}
 */
function appliquerAlias(objet) {
  const promotions = [];
  const aliasUtilises = [];

  Object.keys(FIELD_ALIASES).forEach((champ) => {
    const valeur = valeurParAlias(objet, champ);
    if (valeur === undefined) return;
    if (!(champ in objet) || !chaineNonVide(objet[champ])) {
      if (champ !== FIELD_ALIASES[champ][0] || !(champ in objet)) {
        aliasUtilises.push(champ);
      }
    }
    if (!(champ in objet)) {
      objet[champ] = valeur;
      promotions.push(`${champ}←alias`);
    }
    // Nettoyage des alias pour ne garder que camelCase dans le contrat stocké.
    (FIELD_ALIASES[champ] || []).forEach((cle) => {
      if (cle !== champ && cle in objet) {
        if (objet[champ] === undefined && objet[cle] !== undefined) objet[champ] = objet[cle];
        delete objet[cle];
      }
    });
  });

  // Ancien format `formulations: [{ question, justification }]` : on cherche une
  // formulation COMPLÈTE, pas seulement la première.
  const formulations = ALIAS_FORMULATIONS.map((cle) => objet[cle]).find((v) => Array.isArray(v) && v.length > 0);
  let formulationCount = 0;
  let formulationIndexUsed = null;
  let justificationSource = 'missing';
  const justificationRacine = chaineNonVide(objet.justificationProbleme);

  if (Array.isArray(formulations)) {
    formulationCount = formulations.filter((f) => f && typeof f === 'object' && !Array.isArray(f)).length;
    const extrait = extractCoreFromFormulations(formulations, {
      problematique: objet.problematique,
      justificationProbleme: objet.justificationProbleme,
    });
    formulationIndexUsed = extrait.formulationIndexUsed;

    // La RACINE est prioritaire : une `problematique` ou une
    // `justificationProbleme` déjà présente n'est jamais écrasée.
    if (!chaineNonVide(objet.problematique) && extrait.problematique) {
      objet.problematique = extrait.problematique;
      promotions.push(`problematique←formulations[${extrait.questionIndex}].question`);
    }
    if (!justificationRacine && extrait.justificationProbleme) {
      objet.justificationProbleme = extrait.justificationProbleme;
      promotions.push(`justificationProbleme←formulations[${extrait.formulationIndexUsed}].justification`);
      justificationSource = 'formulation';
    }
  }
  // La clé canonique déjà présente à la racine reste prioritaire sur la promotion.
  if (justificationRacine) justificationSource = 'contract';

  ALIAS_FORMULATIONS.forEach((cle) => delete objet[cle]);

  return { promotions, aliasUtilises, formulationCount, formulationIndexUsed, justificationSource };
}

/**
 * Champs BLOQUANTS : les deux éléments qui portent la logique du sujet. Sans
 * eux, aucune Passe B n'est possible — on rejette.
 *
 * `justificationProbleme` a été RETIRÉ de ce noyau : une problématique concrète
 * reliée à une tension suffit à lancer le Plan. L'importance du problème sera
 * consolidée plus tard avec le contexte, les enjeux, l'existant et les sources,
 * puis contrôlée avant l'export final (voir verificationExport.js).
 */
const CHAMPS_CORE = ['tension', 'problematique'];

/**
 * Champs NON BLOQUANTS à la première génération. Un LLM omet régulièrement l'un
 * d'eux : les exiger en « tout ou rien » bloquait tout le parcours. Ils sont
 * normalisés puis signalés dans `completeness.missingSecondaryFields`, et les
 * étapes aval (Passe B, export) se chargent de les construire ou de les exiger.
 *
 * `justificationProbleme` figure ici : malgré son nom historique « core », il
 * devient SECONDAIRE à l'étape Passe A (Problématique). Ce choix est volontaire
 * et documenté — le contrôle strict de la justification est déplacé à la
 * vérification pré-export.
 */
const CHAMPS_SECONDAIRES = [
  'motsCles',
  'contexte',
  'limitesExistant',
  'preconisations',
  'casEntreprises',
  'ligneDirectrice',
  'ouverture',
  'justificationProbleme',
];

/** Ramène une valeur à un tableau, en déballant les tableaux imbriqués d'un niveau. */
function normaliserEnTableau(valeur) {
  if (Array.isArray(valeur)) return valeur.filter((x) => x !== null && x !== undefined);
  if (valeur === null || valeur === undefined) return [];
  if (typeof valeur === 'string') {
    const t = valeur.trim();
    return t === '' ? [] : [t];
  }
  if (typeof valeur === 'object') {
    // Objet isolé là où un tableau était attendu : on l'enveloppe plutôt que de
    // perdre le contenu produit par le modèle.
    return [valeur];
  }
  return [];
}

/** Ramène une valeur à une chaîne : nombre et booléen convertis, objet/tableau rejetés. */
function normaliserEnChaine(valeur) {
  if (typeof valeur === 'string') return valeur;
  if (typeof valeur === 'number' || typeof valeur === 'boolean') return String(valeur);
  return '';
}

/**
 * Complète le contrat pour que le frontend ne voie JAMAIS `undefined` :
 * tableaux vides, chaînes vides. On n'invente aucun fond (règle C du cahier des
 * charges) : les valeurs par défaut sont vides par construction.
 *
 * @returns {string[]} noms des champs secondaires réellement absents ou vides
 */
function normaliserChampsSecondaires(contrat) {
  const manquants = [];
  const vide = (v) =>
    v === undefined ||
    v === null ||
    (typeof v === 'string' && v.trim() === '') ||
    (Array.isArray(v) && v.length === 0);

  // `motsCles` : tolérant aux formes chaîne et objet { mot, definition }.
  const motsCles = normaliserEnTableau(contrat.motsCles)
    .map((m) => {
      if (typeof m === 'string') return { mot: m.trim(), definition: '' };
      if (m && typeof m === 'object') {
        return { ...m, mot: normaliserEnChaine(m.mot).trim(), definition: normaliserEnChaine(m.definition).trim() };
      }
      return null;
    })
    .filter(Boolean);
  if (vide(contrat.motsCles)) manquants.push('motsCles');
  contrat.motsCles = motsCles;

  // `contexte` : liste de faits sourcés, laissée vide si le modèle n'a rien.
  const contexte = normaliserEnTableau(contrat.contexte)
    .map((f) => {
      if (typeof f === 'string') return { fait: f.trim(), source: '' };
      if (f && typeof f === 'object') {
        return { ...f, fait: normaliserEnChaine(f.fait).trim(), source: normaliserEnChaine(f.source).trim() };
      }
      return null;
    })
    .filter(Boolean);
  contrat.contexte = contexte;

  ['limitesExistant', 'preconisations', 'casEntreprises'].forEach((champ) => {
    if (vide(contrat[champ])) manquants.push(champ);
    contrat[champ] = normaliserEnTableau(contrat[champ]);
  });

  // `ligneDirectrice` accepte l'alias `ligne_directrice` produit par le modèle.
  const ld = chaineNonVide(contrat.ligneDirectrice)
    ? contrat.ligneDirectrice
    : chaineNonVide(contrat.ligne_directrice)
      ? contrat.ligne_directrice
      : normaliserEnChaine(contrat.ligneDirectrice);
  if (vide(ld)) manquants.push('ligneDirectrice');
  contrat.ligneDirectrice = typeof ld === 'string' ? ld.trim() : '';
  delete contrat.ligne_directrice;

  if (vide(contrat.ouverture)) manquants.push('ouverture');
  // L'ouverture n'est pas un tableau : une liste renvoyée par erreur est ignorée.
  contrat.ouverture = Array.isArray(contrat.ouverture) ? '' : normaliserEnChaine(contrat.ouverture).trim();

  if (vide(contrat.sujet)) contrat.sujet = '';

  // `justificationProbleme` : secondaire à l'étape Passe A. On la normalise en
  // chaîne vide (jamais `undefined` côté frontend) et on la signale comme
  // manquante — sans jamais bloquer la génération de la question.
  if (vide(contrat.justificationProbleme)) manquants.push('justificationProbleme');
  contrat.justificationProbleme = Array.isArray(contrat.justificationProbleme)
    ? ''
    : normaliserEnChaine(contrat.justificationProbleme).trim();

  return manquants;
}

/**
 * Validation de SCHÉMA du contrat (indépendante de contratVerification, qui
 * juge le FOND).
 *
 * Seuls les DEUX champs du noyau sont bloquants : `tension` et `problematique`
 * (question terminée par « ? »). `justificationProbleme` est désormais
 * facultatif à l'étape Passe A : son absence est signalée dans
 * `missingSecondaryFields` mais ne provoque PLUS de rejet 422. Tout le reste
 * est normalisé et signalé, jamais bloquant — un LLM oublie trop souvent un
 * champ secondaire pour qu'un « tout ou rien » soit acceptable.
 *
 * @returns {{ ok: boolean, manquants: string[], missingSecondaryFields: string[] }}
 */
function validerSchemaContrat(contrat) {
  if (!contrat || typeof contrat !== 'object' || Array.isArray(contrat)) {
    return { ok: false, manquants: ['(objet)'], missingSecondaryFields: [] };
  }
  const manquants = [];
  if (!chaineNonVide(contrat.tension)) manquants.push('tension');
  if (!chaineNonVide(contrat.problematique)) manquants.push('problematique');
  else if (!contrat.problematique.trim().endsWith('?')) {
    manquants.push('problematique (doit se terminer par « ? »)');
  }

  const missingSecondaryFields = normaliserChampsSecondaires(contrat);
  return { ok: manquants.length === 0, manquants, missingSecondaryFields };
}

/**
 * État des champs du contrat — sert à la fois au log serveur et au frontend.
 *
 * `core` ne contient plus que les champs réellement bloquants ; `optional`
 * porte ceux qui sont visibles mais facultatifs à cette étape (dont
 * `justificationProbleme`, historiquement « core », devenu secondaire en
 * Passe A).
 *
 * @returns {{ core: { tension: boolean, problematique: boolean },
 *             optional: { justificationProbleme: boolean } }}
 */
function champsCorePresents(contrat) {
  return {
    core: {
      tension: chaineNonVide(contrat.tension),
      problematique: chaineNonVide(contrat.problematique),
    },
    optional: {
      justificationProbleme: chaineNonVide(contrat.justificationProbleme),
    },
  };
}

/** Message candidat accompagnant un contrat core valide mais incomplet. */
const MESSAGE_COMPLETUDE =
  'La problématique est exploitable. Certains éléments seront complétés ensuite.';

/**
 * Champs BLOQUANTS à l'étape Passe A. SOURCE DE VÉRITÉ UNIQUE : la route ne doit
 * jamais reconstruire sa propre liste ailleurs (c'est précisément ce qui
 * produisait un 422 CORE_CONTRACT_FIELDS_MISSING alors que le contrat normalisé
 * était valide et que la justification est facultative).
 */
const REQUIRED_PASSE_A_FIELDS = CHAMPS_CORE;

/**
 * VALIDATION UNIQUE DE LA PASSE A — source de vérité du noyau bloquant.
 *
 * Elle s'applique EXCLUSIVEMENT au contrat NORMALISÉ FINAL (après alias,
 * promotion `formulations.question` et repli de tension depuis l'analyse) et
 * jamais à l'objet brut pré-normalisé. Une seule règle : `tension` et
 * `problematique` doivent exister, la problématique doit être une question.
 * `justificationProbleme` est FACULTATIF et n'est jamais un motif de rejet —
 * seul le noyau bloquant décide du sort de la requête.
 *
 * @param {object} contract contrat normalisé final
 * @returns {{ isCoreValid: boolean, requiredFields: string[],
 *             corePresence: { tension: boolean, problematique: boolean },
 *             coreMissing: string[],
 *             optionalPresence: { justificationProbleme: boolean },
 *             missingSecondaryFields: string[],
 *             schemaStatus: 'core_valid'|'core_valid_justification_pending'|'core_invalid',
 *             errorCode: null|'CORE_CONTRACT_FIELDS_MISSING' }}
 */
function validatePasseAContract(contract) {
  const c = contract && typeof contract === 'object' && !Array.isArray(contract) ? contract : {};
  const presence = champsCorePresents(c);
  const coreMissing = REQUIRED_PASSE_A_FIELDS.filter((champ) => !presence.core[champ]);
  // La question doit rester une question : une problématique non terminée par
  // « ? » est traitée comme un noyau invalide (jamais comme un simple
  // avertissement), exactement au même titre qu'un champ absent.
  if (
    presence.core.problematique &&
    !String(c.problematique || '').trim().endsWith('?') &&
    !coreMissing.includes('problematique')
  ) {
    coreMissing.push('problematique');
  }
  const isCoreValid = coreMissing.length === 0;
  const secondaires = c.completeness && Array.isArray(c.completeness.missingSecondaryFields)
    ? c.completeness.missingSecondaryFields
    : [];
  const missingSecondaryFields = secondaires.filter(
    (champ) => typeof champ === 'string' && champ.length > 0
  );

  return {
    isCoreValid,
    requiredFields: [...REQUIRED_PASSE_A_FIELDS],
    corePresence: presence.core,
    coreMissing,
    optionalPresence: presence.optional,
    missingSecondaryFields,
    schemaStatus: !isCoreValid
      ? 'core_invalid'
      : presence.optional.justificationProbleme
        ? 'core_valid'
        : 'core_valid_justification_pending',
    errorCode: isCoreValid ? null : 'CORE_CONTRACT_FIELDS_MISSING',
  };
}

/**
 * Point d'entrée unique : normalise la réponse brute du modèle puis valide le
 * schéma du contrat. Ne lance JAMAIS d'exception et ne touche pas au réseau.
 *
 * Le contrat rendu est TOUJOURS complet du point de vue du frontend (aucune clé
 * `undefined`) et porte `completeness`, ce qui évite le comportement « tout ou
 * rien » : une clé secondaire oubliée n'empêche plus d'afficher et de valider la
 * problématique.
 *
 * @param {string} rawModelContent réponse brute du modèle
 * @param {{ analyse?: object }} [options] analyse validée de la session : sert
 *        UNIQUEMENT de source de repli pour la tension (jamais de contenu
 *        inventé, jamais de reformulation).
 * @returns {{ ok: true, contract: object, missingSecondaryFields: string[], diagnostic: object }
 *          | { ok: false, type: 'INVALID_LLM_JSON'|'INVALID_CONTRACT_SCHEMA',
 *              internalReason: string, manquants: string[], coreFieldsPresent: object,
 *              diagnostic: object }}
 */
function parseAndValidateContract(rawModelContent, options = {}) {
  const analyse = options && typeof options.analyse === 'object' ? options.analyse : null;
  const brut = typeof rawModelContent === 'string' ? rawModelContent : String(rawModelContent ?? '');
  const diagnostic = diagnostiquer(brut);

  if (!brut.trim()) {
    return {
      ok: false,
      type: ERREUR_JSON,
      internalReason: 'réponse du modèle vide',
      manquants: ['(objet)'],
      coreFieldsPresent: {
        core: { tension: false, problematique: false },
        optional: { justificationProbleme: false },
      },
      diagnostic,
    };
  }

  const nettoye = retirerFences(brut);

  let objet = null;
  try {
    objet = JSON.parse(nettoye);
  } catch (_e) {
    const extrait = extrairePremierObjet(nettoye);
    if (extrait) {
      try {
        objet = JSON.parse(extrait);
      } catch (_e2) {
        objet = null;
      }
    }
  }

  if (!objet || typeof objet !== 'object' || Array.isArray(objet)) {
    // Le pseudo-JSON à guillemets simples est le cas le plus fréquent : on le
    // nomme explicitement dans la raison interne pour rendre le log lisible.
    const cause = diagnostic.pseudoJson
      ? 'pseudo-JSON détecté (guillemets simples ou clés non quotées) — réponse non conforme à RFC 8259'
      : 'aucun objet JSON exploitable dans la réponse du modèle';
    return {
      ok: false,
      type: ERREUR_JSON,
      internalReason: cause,
      manquants: ['(objet)'],
      coreFieldsPresent: {
        core: { tension: false, problematique: false },
        optional: { justificationProbleme: false },
      },
      diagnostic: { ...diagnostic, rawTopLevelKeys: [], normalizedTopLevelKeys: [], aliasUsed: [], promotions: [] },
    };
  }

  const rawTopLevelKeys = Object.keys(objet);
  // Compatibilité de nommage AVANT toute validation : un `justification_probleme`
  // ou un ancien `formulations[{ question, justification }]` ne doit JAMAIS
  // provoquer un rejet, ni une régénération inutile.
  const { promotions, aliasUtilises, formulationCount, formulationIndexUsed, justificationSource } =
    appliquerAlias(objet);

  // Tension : si la réponse Passe A n'en porte aucune (même via ses alias), on
  // récupère celle DÉJÀ ÉCRITE dans l'analyse validée de la session. Aucune
  // reformulation, aucune invention : si l'analyse n'en contient pas, la tension
  // reste vide et le rejet 422 reste explicite.
  const { tension, tensionSource } = resoudreTension(objet, analyse);
  if (tensionSource === 'analysis' && !chaineNonVide(objet.tension)) {
    objet.tension = tension;
    promotions.push('tension←analyse');
  }

  const normalizedTopLevelKeys = Object.keys(objet);

  const coreFieldsPresent = champsCorePresents(objet);
  const { ok, manquants, missingSecondaryFields } = validerSchemaContrat(objet);
  // Le verdict du noyau est calculé par la MÊME fonction que celle utilisée par
  // la route : impossible que le parseur accepte un contrat que la route
  // rejetterait (ou l'inverse).
  const validationPasseA = validatePasseAContract({
    ...objet,
    completeness: { missingSecondaryFields },
  });

  const diagnosticComplet = {
    ...diagnostic,
    rawTopLevelKeys,
    normalizedTopLevelKeys,
    aliasUsed: aliasUtilises,
    promotions,
    tensionSource,
    justificationSource,
    formulationCount,
    formulationIndexUsed,
  };

  if (!ok) {
    return {
      ok: false,
      type: ERREUR_SCHEMA,
      internalReason: `champs bloquants manquants ou invalides : ${manquants.join(', ')}`,
      manquants,
      coreFieldsPresent,
      validationPasseA,
      diagnostic: diagnosticComplet,
    };
  }

  // Le contrat part au frontend TOUJOURS complet : aucun `undefined` à afficher.
  objet.completeness = {
    isCoreValid: true,
    missingSecondaryFields,
    message: MESSAGE_COMPLETUDE,
  };

  return {
    ok: true,
    contract: objet,
    missingSecondaryFields,
    validationPasseA,
    diagnostic: diagnosticComplet,
  };
}

module.exports = {
  parseAndValidateContract,
  validatePasseAContract,
  REQUIRED_PASSE_A_FIELDS,
  validerSchemaContrat,
  normaliserChampsSecondaires,
  champsCorePresents,
  retirerFences,
  extrairePremierObjet,
  appliquerAlias,
  extractCoreFromFormulations,
  extraireTensionAnalyse,
  resoudreTension,
  FIELD_ALIASES,
  ALIAS_FORMULATIONS,
  FORMULATION_QUESTION_ALIASES,
  FORMULATION_JUSTIFICATION_ALIASES,
  CHAMP_JUSTIFICATION_RECOMMANDATION,
  CLES_TENSION_ANALYSE,
  estAliasConnu,
  CHAMPS_CORE,
  CHAMPS_SECONDAIRES,
  MESSAGE_COMPLETUDE,
  ERREUR_JSON,
  ERREUR_SCHEMA,
};
