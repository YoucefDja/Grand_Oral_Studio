/**
 * CORRECTION CIBLÉE DES POINTS FAIBLES (DeepSeek)
 *
 * Le rapport de vérification avant export juge les INTRANTS du Markdown
 * (analyse, problématique, plan, glossaire, recherche) et liste des points
 * faibles actionnables. Ce module les rend corrigeables EN PLACE : plutôt que
 * de faire régénérer toute une étape (ce qui détruirait le travail déjà
 * validé), on demande à DeepSeek de RÉÉCRIRE UNIQUEMENT le champ fautif, en
 * conservant tout le reste de la structure et du contenu.
 *
 * Principe de sûreté : rien n'est écrit en base ici. Le module renvoie une
 * proposition « avant / après » ; c'est la route qui applique (voir
 * routes/sessions.js → POST /:id/corriger-points-faibles).
 */

const { generateDeepseek } = require('./deepseek');
const { parseJsonStrict } = require('./anthropic');

// ---------------------------------------------------------------------------
// Répartition d'un point faible : quel champ précis doit être réécrit ?
// ---------------------------------------------------------------------------

/**
 * Chaque code du rapport est rattaché à un « chemin » de correction :
 *   { etape, chemin, libelle }
 * où `etape` est la clé de session.data et `chemin` le champ à réécrire.
 *
 * Un code sans chemin connu n'est pas corrigeable automatiquement (critère
 * purement oral, par exemple) : il est ignoré, jamais deviné.
 */
const CIBLES = {
  // ---- Problématique (étape 2) ----
  problematique_absente: { etape: 'probleme', chemin: 'formulations[0].formulation' },
  problematique_reformulation: { etape: 'probleme', chemin: 'formulations[0].formulation' },
  problematique_debat: { etape: 'probleme', chemin: 'formulations[0].formulation' },
  problematique_descriptive: { etape: 'probleme', chemin: 'formulations[0].formulation' },
  problematique_sans_levier: { etape: 'probleme', chemin: 'formulations[0].formulation' },
  problematique_sans_tension: { etape: 'probleme', chemin: 'formulations[0].tension' },
  problematique_tension_identique: { etape: 'probleme', chemin: 'formulations[0].tension' },
  problematique_hors_sujet: { etape: 'probleme', chemin: 'formulations[0].formulation' },
  ligne_directrice_absente: { etape: 'probleme', chemin: 'ligne_directrice' },
  ligne_directrice_hors_sujet: { etape: 'probleme', chemin: 'ligne_directrice' },
  ligne_directrice_decrochee: { etape: 'probleme', chemin: 'ligne_directrice' },
  '1.5-justification': { etape: 'probleme', chemin: 'formulations[0].pourquoi_discutable' },

  // ---- Analyse (étape 1) ----
  '1.1-positionnement': { etape: 'analyse', chemin: 'positionnement_strategique' },
  '1.1-contexte': { etape: 'analyse', chemin: 'reformulation' },
  '1.1-mots-cles': { etape: 'analyse', chemin: 'mots_cles' },
  '1.2-tensions': { etape: 'analyse', chemin: 'tensions' },
  '1.2-enjeux': { etape: 'analyse', chemin: 'tensions' },
  '1.3-concepts': { etape: 'analyse', chemin: 'notions_a_maitriser' },
  '1.3-references': { etape: 'analyse', chemin: 'notions_a_maitriser' },

  // ---- Plan (étape 3) ----
  '2.1-sections': { etape: 'plan', chemin: 'sections' },
  '2.1-ordre': { etape: 'plan', chemin: 'sections' },
  '2.1-fil-directeur': { etape: 'plan', chemin: 'fil_directeur' },
  '2.1-fil-directeur-decroche': { etape: 'plan', chemin: 'fil_directeur' },
  '1.5-reponse': { etape: 'plan', chemin: 'sections' },
  '1.6-phases': { etape: 'plan', chemin: 'sections' },
  '1.6-taille': { etape: 'plan', chemin: 'sections' },
  '2.4-repartition': { etape: 'plan', chemin: 'repartition_temps' },
  '2.4-temps': { etape: 'plan', chemin: 'sections' },
  '2.7-ouverture': { etape: 'plan', chemin: 'ouverture' },
  '2.7-ouverture-forme': { etape: 'plan', chemin: 'ouverture' },
  '2.7-ouverture-justification': { etape: 'plan', chemin: 'ouverture' },
  '1.7-objections': { etape: 'plan', chemin: 'objections_et_reponses' },

  // ---- Glossaire (étape 4) ----
  '2.6-definitions': { etape: 'glossaire', chemin: 'termes' },
  '2.6-sources': { etape: 'glossaire', chemin: 'sources' },
  '2.6-glossaire': { etape: 'glossaire', chemin: 'termes' },

  // ---- Recherche (étape d'arrière-plan) ----
  '1.4-benchmark': { etape: 'recherche', chemin: 'exemples_entreprises' },
  '1.4-source-cas': { etape: 'recherche', chemin: 'exemples_entreprises' },
  '1.4-echec': { etape: 'recherche', chemin: 'exemples_entreprises' },
  '1.4-regroupe': { etape: 'recherche', chemin: 'exemples_entreprises' },
  '1.7-notes': { etape: 'recherche', chemin: 'questions_du_jury' },
  '2.3-illustration': { etape: 'recherche', chemin: 'donnees_a_rechercher' },
  '2.3-nuance': { etape: 'recherche', chemin: 'exemples_entreprises' },
};

const LIBELLES_ETAPES = {
  analyse: 'Analyse du sujet',
  probleme: 'Problématique',
  plan: 'Plan détaillé',
  glossaire: 'Glossaire',
  recherche: 'Recherche documentaire',
};

/**
 * Détermine, pour une liste de points faibles, le travail à faire : un lot de
 * corrections GROUPÉ PAR (étape, champ). Plusieurs points faibles portant sur
 * le même champ ne déclenchent qu'un seul appel au modèle.
 *
 * @returns {Array<{etape, chemin, libelle, codes, messages}>}
 */
function planifierCorrections(pointsFaibles) {
  const lots = new Map();
  (Array.isArray(pointsFaibles) ? pointsFaibles : []).forEach((pf) => {
    const cible = CIBLES[pf?.code];
    if (!cible) return; // point faible non corrigeable automatiquement
    const cle = `${cible.etape}::${cible.chemin}`;
    if (!lots.has(cle)) {
      lots.set(cle, {
        etape: cible.etape,
        chemin: cible.chemin,
        libelle: `${LIBELLES_ETAPES[cible.etape] || cible.etape} — champ « ${cible.chemin} »`,
        codes: [],
        messages: [],
      });
    }
    const lot = lots.get(cle);
    if (!lot.codes.includes(pf.code)) lot.codes.push(pf.code);
    if (pf.message) lot.messages.push(pf.message);
  });
  return [...lots.values()];
}

// ---------------------------------------------------------------------------
// Lecture / écriture d'un champ par chemin (« a.b[0].c »)
// ---------------------------------------------------------------------------

/** Découpe un chemin en segments : "formulations[0].tension" → ['formulations', 0, 'tension']. */
function decouperChemin(chemin) {
  return String(chemin)
    .split('.')
    .flatMap((segment) => {
      const morceaux = [];
      const motif = /([^[\]]+)|\[(\d+)\]/g;
      let m;
      while ((m = motif.exec(segment)) !== null) {
        morceaux.push(m[1] !== undefined ? m[1] : Number(m[2]));
      }
      return morceaux;
    });
}

function lireChemin(objet, chemin) {
  return decouperChemin(chemin).reduce(
    (acc, cle) => (acc == null ? undefined : acc[cle]),
    objet
  );
}

/**
 * Écrit `valeur` au chemin indiqué, en créant les conteneurs manquants et en
 * respectant le type du conteneur existant (objet ou tableau).
 */
function ecrireChemin(racine, chemin, valeur) {
  const segments = decouperChemin(chemin);
  let courant = racine;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const cle = segments[i];
    const suivante = segments[i + 1];
    if (courant[cle] == null || typeof courant[cle] !== 'object') {
      courant[cle] = typeof suivante === 'number' ? [] : {};
    }
    courant = courant[cle];
  }
  courant[segments[segments.length - 1]] = valeur;
}

// ---------------------------------------------------------------------------
// Appel du modèle
// ---------------------------------------------------------------------------

const CONSIGNE_COMMUNE = `Tu corriges un livrable de Grand Oral (CESI) destiné à servir de base à la génération d'une présentation. Tu ne réécris QUE le champ demandé, tu ne changes rien d'autre, tu ne commentes pas ton travail, tu ne renvoies que du JSON valide.`;

/**
 * Corrige un champ à partir des points faibles qui le visent.
 *
 * @param {object} params
 * @param {object} params.session     Session Mongoose (sujet, thème, ligne directrice).
 * @param {string} params.etape       Clé de session.data (« analyse », « probleme »…).
 * @param {string} params.chemin      Chemin du champ à réécrire.
 * @param {Array<{code,message}>} params.pointsFaibles Points faibles visant ce champ.
 * @returns {Promise<{etape, chemin, avant, apres}>}
 */
async function corrigerChamp({ session, etape, chemin, pointsFaibles }) {
  const data = session?.data || {};
  const contenuEtape = data[etape];
  if (!contenuEtape || typeof contenuEtape !== 'object') {
    throw Object.assign(
      new Error(
        `L'étape « ${LIBELLES_ETAPES[etape] || etape} » n'est pas encore générée : lance sa génération avant de corriger ses points faibles.`
      ),
      { status: 400 }
    );
  }

  const avant = lireChemin(contenuEtape, chemin);
  if (avant === undefined) {
    throw Object.assign(
      new Error(`Le champ « ${chemin} » est introuvable dans l'étape « ${etape} ».`),
      { status: 400 }
    );
  }

  const system = [
    CONSIGNE_COMMUNE,
    'La méthode de référence est celle d’Armelle Aymond : la problématique évoque un PROBLÈME RÉEL sous forme de tension à deux pôles, jamais une simple reformulation du sujet, jamais un débat d’opinion, jamais une question purement descriptive ; elle appelle une réponse argumentée et actionnable.',
    'Tu réponds UNIQUEMENT par un objet JSON : {"valeur": …}. La valeur a EXACTEMENT le même type que le champ fourni (chaîne, objet ou tableau) et respecte sa structure interne.',
  ].join(' ');

  const user = JSON.stringify({
    sujet: String(session?.titre || '').trim(),
    theme: String(session?.theme || '').trim(),
    ligne_directrice: String(session?.ligneDirectrice || data.probleme?.ligne_directrice || '').trim(),
    etape,
    champ: chemin,
    role_du_champ: roleDuChamp(chemin),
    points_faibles_a_corriger: pointsFaibles.map((p) => ({ code: p.code, probleme: p.message })),
    valeur_actuelle: avant,
    contexte_de_l_etape: contenuEtape,
  });

  const brut = await generateDeepseek(system, user);
  const parsed = parseJsonStrict(brut);
  if (!parsed || parsed.valeur === undefined) {
    throw Object.assign(
      new Error('La correction proposée par le modèle est inutilisable. Réessayez.'),
      { status: 502 }
    );
  }

  return { etape, chemin, avant, apres: parsed.valeur };
}

/** Rappel du rôle du champ, pour que le modèle ne se trompe pas de registre. */
function roleDuChamp(chemin) {
  if (chemin === 'ligne_directrice') {
    return 'Fil rouge de toute la présentation : une phrase qui découle de la problématique et sera rappelée à chaque étape.';
  }
  if (chemin === 'positionnement_strategique') {
    return 'En quoi le sujet compte pour l’entreprise, et pour qui précisément.';
  }
  if (chemin === 'formulations[0].formulation') {
    return 'La problématique elle-même, formulée en une question courte (240 caractères maximum).';
  }
  if (chemin === 'formulations[0].tension') {
    return 'La tension à deux pôles opposés ({pole_a, pole_b}) dont naît la problématique.';
  }
  if (chemin === 'formulations[0].pourquoi_discutable') {
    return 'Pourquoi le problème est réellement discutable (il existe des réponses défendables différentes).';
  }
  if (chemin === 'sections') {
    return 'Les sections du plan, chacune {partie, role, minutes, points[]}, dans l’ordre de l’entonnoir Contexte → Enjeux → Problématique → Existant → Données → Cas réels → Solutions → Conclusion.';
  }
  if (chemin === 'fil_directeur') {
    return 'Le fil directeur du plan : la phrase qui fait s’enchaîner les parties comme un seul raisonnement.';
  }
  if (chemin === 'ouverture') {
    return 'La question d’ouverture prospective {question, pourquoi_elle_reste_ouverte}, volontairement non résolue.';
  }
  if (chemin === 'repartition_temps') {
    return 'La répartition du temps par partie, en minutes ; le total doit égaler la durée annoncée.';
  }
  if (chemin === 'objections_et_reponses') {
    return 'Les objections prévisibles du jury et les réponses à y apporter [{objection, reponse}].';
  }
  if (chemin === 'termes') {
    return 'Les termes du glossaire, chacun {terme, definition (une phrase), theme}.';
  }
  if (chemin === 'sources') {
    return 'Les sources résumées, chacune {titre, resume}.';
  }
  if (chemin === 'exemples_entreprises') {
    return 'Les cas d’entreprise réels sourcés [{nom, contexte, resultat, apport, issue (succes | echec_ou_limite), source}]. Au moins un succès ET un échec ou une limite.';
  }
  if (chemin === 'questions_du_jury') {
    return 'Les questions prévisibles du jury et l’angle de réponse [{question, angle_de_reponse}].';
  }
  if (chemin === 'donnees_a_rechercher') {
    return 'Les données chiffrées à rechercher pour étayer la démonstration.';
  }
  return 'Le champ à corriger, dans le même registre que la valeur actuelle.';
}

module.exports = {
  planifierCorrections,
  corrigerChamp,
  lireChemin,
  ecrireChemin,
  CIBLES,
};
