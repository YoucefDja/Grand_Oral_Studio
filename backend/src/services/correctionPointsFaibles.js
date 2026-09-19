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
  // ---- Contrat métier (Passe A, session.data.contrat) ----
  contrat_non_valide: { etape: 'contrat', chemin: 'problematique' },
  problematique_absente: { etape: 'contrat', chemin: 'problematique' },
  problematique_reformulation: { etape: 'contrat', chemin: 'problematique' },
  problematique_debat: { etape: 'contrat', chemin: 'problematique' },
  problematique_descriptive: { etape: 'contrat', chemin: 'problematique' },
  problematique_sans_levier: { etape: 'contrat', chemin: 'problematique' },
  problematique_sans_tension: { etape: 'contrat', chemin: 'tension' },
  problematique_tension_decorrelee: { etape: 'contrat', chemin: 'tension' },
  problematique_hors_sujet: { etape: 'contrat', chemin: 'problematique' },
  contrat_solutions_decorrelees: { etape: 'contrat', chemin: 'preconisations' },
  contrat_hors_sujet: { etape: 'contrat', chemin: 'problematique' },
  contrat_copie_sujet: { etape: 'contrat', chemin: 'problematique' },
  contrat_amorce_molle: { etape: 'contrat', chemin: 'problematique' },
  contrat_question_oui_non: { etape: 'contrat', chemin: 'problematique' },
  contrat_question_plus_large: { etape: 'contrat', chemin: 'problematique' },
  contrat_question_inutile: { etape: 'contrat', chemin: 'problematique' },
  contrat_question_absente: { etape: 'contrat', chemin: 'problematique' },
  contrat_tension_absente: { etape: 'contrat', chemin: 'tension' },
  contrat_justification_absente: { etape: 'contrat', chemin: 'justificationProbleme' },
  contrat_ligne_directrice_absente: { etape: 'contrat', chemin: 'ligneDirectrice' },
  ligne_directrice_absente: { etape: 'contrat', chemin: 'ligneDirectrice' },
  ligne_directrice_hors_sujet: { etape: 'contrat', chemin: 'ligneDirectrice' },
  ligne_directrice_decrochee: { etape: 'contrat', chemin: 'ligneDirectrice' },
  '1.5-justification': { etape: 'contrat', chemin: 'justificationProbleme' },

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

  // ---- Cas d'entreprises : portés par le contrat (Passe A) ----
  '1.4-benchmark': { etape: 'contrat', chemin: 'casEntreprises' },
  '1.4-source-cas': { etape: 'contrat', chemin: 'casEntreprises' },
  '1.4-echec': { etape: 'contrat', chemin: 'casEntreprises' },
  '1.4-regroupe': { etape: 'contrat', chemin: 'casEntreprises' },

  // ---- Recherche (étape d'arrière-plan) ----
  '1.7-notes': { etape: 'recherche', chemin: 'questions_du_jury' },
  '2.3-illustration': { etape: 'recherche', chemin: 'donnees_a_rechercher' },
  '2.3-nuance': { etape: 'recherche', chemin: 'exemples_entreprises' },
};

const LIBELLES_ETAPES = {
  analyse: 'Analyse du sujet',
  contrat: 'Contrat métier (problématique)',
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
    ligne_directrice: String(session?.ligneDirectrice || data.contrat?.ligneDirectrice || '').trim(),
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
    // Sortie du modèle inexploitable : erreur contrôlée (jamais un 502 de proxy).
    throw Object.assign(
      new Error('La correction proposée par le modèle est inutilisable. Réessayez.'),
      { status: 422, code: 'INVALID_LLM_JSON' }
    );
  }

  return { etape, chemin, avant, apres: parsed.valeur };
}

/** Rappel du rôle du champ, pour que le modèle ne se trompe pas de registre. */
function roleDuChamp(chemin) {
  if (chemin === 'problematique') {
    return 'La problématique elle-même : UNE question précise (comment / en quoi / dans quelle mesure), liée au sujet, qui pose un problème d’entreprise réel, solutionnable par les préconisations. Jamais une copie du sujet, jamais une question oui/non, jamais un débat Pour/Contre.';
  }
  if (chemin === 'tension') {
    return 'La friction réelle, en une phrase interne : ce qui coince concrètement dans l’entreprise sur ce sujet (coût, compétence, dette, conformité, dépendance, délai, taille d’entreprise…). Ce n’est pas affiché tel quel sur les slides.';
  }
  if (chemin === 'justificationProbleme') {
    return 'Pourquoi c’est un problème d’entreprise aujourd’hui, en une ou deux phrases : ce que l’entreprise perd ou risque si rien ne bouge.';
  }
  if (chemin === 'ligneDirectrice') {
    return 'Fil rouge de toute la présentation : une phrase qui découle de la problématique et sera rappelée à chaque étape.';
  }
  if (chemin === 'preconisations') {
    return 'Les préconisations qui répondent à la question, calibrées par taille d’entreprise (PME / ETI / grand groupe), actionnables avant / pendant / après. Elles doivent réutiliser le vocabulaire de la tension et de la question.';
  }
  if (chemin === 'limitesExistant') {
    return 'Ce qui existe déjà sur ce sujet et POURQUOI ça ne suffit pas face à cette tension précise. Pas un inventaire de normes.';
  }
  if (chemin === 'contexte') {
    return 'Les faits et chiffres d’actualité qui cadrent le sujet [{fait, source}] : chaque chiffre porte sa source.';
  }
  if (chemin === 'motsCles') {
    return 'Les mots-clés du sujet [{mot, definition}] : définition métier d’une seule ligne, pas une définition de wiki.';
  }
  if (chemin === 'casEntreprises') {
    return 'Les cas d’entreprise réels [{nom, chiffre, angle, source, issue (succes | echec)}] liés à la tension, avec au moins un échec. Nom d’entreprise connu + ce qu’ils ont fait (ou raté), jamais un cas vitrine hors sujet.';
  }
  if (chemin === 'ouverture') {
    return 'La question d’ouverture prospective, volontairement laissée SANS réponse.';
  }
  if (chemin === 'positionnement_strategique') {
    return 'En quoi le sujet compte pour l’entreprise, et pour qui précisément.';
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
