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
 * Champs BLOQUANTS : les trois éléments qui portent la logique du sujet. Sans
 * eux, aucune Passe B n'est possible — on rejette.
 */
const CHAMPS_CORE = ['tension', 'problematique', 'justificationProbleme'];

/**
 * Champs NON BLOQUANTS à la première génération. Un LLM omet régulièrement l'un
 * d'eux : les exiger en « tout ou rien » bloquait tout le parcours. Ils sont
 * normalisés puis signalés dans `completeness.missingSecondaryFields`, et les
 * étapes aval (Passe B, export) se chargent de les construire ou de les exiger.
 */
const CHAMPS_SECONDAIRES = [
  'motsCles',
  'contexte',
  'limitesExistant',
  'preconisations',
  'casEntreprises',
  'ligneDirectrice',
  'ouverture',
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

  return manquants;
}

/**
 * Validation de SCHÉMA du contrat (indépendante de contratVerification, qui
 * juge le FOND).
 *
 * Seuls les TROIS champs core sont bloquants : `tension`, `problematique`
 * (question terminée par « ? ») et `justificationProbleme`. Tout le reste est
 * normalisé et signalé, jamais bloquant — un LLM oublie trop souvent un champ
 * secondaire pour qu'un « tout ou rien » soit acceptable.
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
  if (!chaineNonVide(contrat.justificationProbleme)) manquants.push('justificationProbleme');

  const missingSecondaryFields = normaliserChampsSecondaires(contrat);
  return { ok: manquants.length === 0, manquants, missingSecondaryFields };
}

/**
 * État des trois champs core — sert à la fois au log serveur et au frontend.
 * @returns {{ tension: boolean, problematique: boolean, justificationProbleme: boolean }}
 */
function champsCorePresents(contrat) {
  return {
    tension: chaineNonVide(contrat.tension),
    problematique: chaineNonVide(contrat.problematique),
    justificationProbleme: chaineNonVide(contrat.justificationProbleme),
  };
}

/** Message candidat accompagnant un contrat core valide mais incomplet. */
const MESSAGE_COMPLETUDE =
  'La problématique est exploitable. Certains éléments seront complétés ensuite.';

/**
 * Point d'entrée unique : normalise la réponse brute du modèle puis valide le
 * schéma du contrat. Ne lance JAMAIS d'exception et ne touche pas au réseau.
 *
 * Le contrat rendu est TOUJOURS complet du point de vue du frontend (aucune clé
 * `undefined`) et porte `completeness`, ce qui évite le comportement « tout ou
 * rien » : une clé secondaire oubliée n'empêche plus d'afficher et de valider la
 * problématique.
 *
 * @returns {{ ok: true, contract: object, missingSecondaryFields: string[], diagnostic: object }
 *          | { ok: false, type: 'INVALID_LLM_JSON'|'INVALID_CONTRACT_SCHEMA',
 *              internalReason: string, manquants: string[], coreFieldsPresent: object,
 *              diagnostic: object }}
 */
function parseAndValidateContract(rawModelContent) {
  const brut = typeof rawModelContent === 'string' ? rawModelContent : String(rawModelContent ?? '');
  const diagnostic = diagnostiquer(brut);

  if (!brut.trim()) {
    return {
      ok: false,
      type: ERREUR_JSON,
      internalReason: 'réponse du modèle vide',
      manquants: ['(objet)'],
      coreFieldsPresent: { tension: false, problematique: false, justificationProbleme: false },
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
      coreFieldsPresent: { tension: false, problematique: false, justificationProbleme: false },
      diagnostic,
    };
  }

  const coreFieldsPresent = champsCorePresents(objet);
  const { ok, manquants, missingSecondaryFields } = validerSchemaContrat(objet);

  if (!ok) {
    return {
      ok: false,
      type: ERREUR_SCHEMA,
      internalReason: `champs bloquants manquants ou invalides : ${manquants.join(', ')}`,
      manquants,
      coreFieldsPresent,
      diagnostic,
    };
  }

  // Le contrat part au frontend TOUJOURS complet : aucun `undefined` à afficher.
  objet.completeness = {
    isCoreValid: true,
    missingSecondaryFields,
    message: MESSAGE_COMPLETUDE,
  };

  return { ok: true, contract: objet, missingSecondaryFields, diagnostic };
}

module.exports = {
  parseAndValidateContract,
  validerSchemaContrat,
  normaliserChampsSecondaires,
  champsCorePresents,
  retirerFences,
  extrairePremierObjet,
  CHAMPS_CORE,
  CHAMPS_SECONDAIRES,
  MESSAGE_COMPLETUDE,
  ERREUR_JSON,
  ERREUR_SCHEMA,
};
