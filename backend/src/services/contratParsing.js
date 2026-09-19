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
 * Validation de SCHÉMA du contrat (indépendante de contratVerification, qui
 * juge le FOND). On ne vérifie ici que la présence et le type des champs
 * indispensables à la Passe B, pour distinguer « JSON illisible » de
 * « JSON lisible mais incomplet ».
 */
function validerSchemaContrat(contrat) {
  const manquants = [];
  if (!contrat || typeof contrat !== 'object' || Array.isArray(contrat)) {
    return { ok: false, manquants: ['(objet)'] };
  }
  if (!chaineNonVide(contrat.tension)) manquants.push('tension');
  if (!chaineNonVide(contrat.problematique)) manquants.push('problematique');
  else if (!contrat.problematique.trim().endsWith('?')) manquants.push('problematique (doit se terminer par « ? »)');
  if (!chaineNonVide(contrat.justificationProbleme)) manquants.push('justificationProbleme');
  if (!Array.isArray(contrat.limitesExistant)) manquants.push('limitesExistant (tableau)');
  if (!Array.isArray(contrat.preconisations)) manquants.push('preconisations (tableau)');
  if (!chaineNonVide(contrat.ligneDirectrice) && !chaineNonVide(contrat.ligne_directrice)) {
    manquants.push('ligneDirectrice');
  }
  if (!chaineNonVide(contrat.ouverture)) manquants.push('ouverture');
  return { ok: manquants.length === 0, manquants };
}

/**
 * Point d'entrée unique : normalise la réponse brute du modèle puis valide le
 * schéma du contrat. Ne lance JAMAIS d'exception et ne touche pas au réseau.
 *
 * @returns {{ ok: true, contract: object }
 *          | { ok: false, type: 'INVALID_LLM_JSON'|'INVALID_CONTRACT_SCHEMA',
 *              internalReason: string, diagnostic: object }}
 */
function parseAndValidateContract(rawModelContent) {
  const brut = typeof rawModelContent === 'string' ? rawModelContent : String(rawModelContent ?? '');
  const diagnostic = diagnostiquer(brut);

  if (!brut.trim()) {
    return {
      ok: false,
      type: ERREUR_JSON,
      internalReason: 'réponse du modèle vide',
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
    return { ok: false, type: ERREUR_JSON, internalReason: cause, diagnostic };
  }

  const { ok, manquants } = validerSchemaContrat(objet);
  if (!ok) {
    return {
      ok: false,
      type: ERREUR_SCHEMA,
      internalReason: `champs manquants ou invalides : ${manquants.join(', ')}`,
      diagnostic,
    };
  }

  // Le modèle alterne parfois `ligne_directrice` et `ligneDirectrice` : on
  // normalise une bonne fois pour toutes.
  if (!chaineNonVide(objet.ligneDirectrice) && chaineNonVide(objet.ligne_directrice)) {
    objet.ligneDirectrice = objet.ligne_directrice;
  }
  delete objet.ligne_directrice;

  return { ok: true, contract: objet, diagnostic };
}

module.exports = {
  parseAndValidateContract,
  validerSchemaContrat,
  retirerFences,
  extrairePremierObjet,
  ERREUR_JSON,
  ERREUR_SCHEMA,
};
