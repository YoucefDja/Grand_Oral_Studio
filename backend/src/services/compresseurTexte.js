/**
 * Compresseur de texte déterministe (post-LLM, avant PPTX).
 *
 * Rôle : reprendre les slides telles que sorties du modèle et les ramener à une
 * forme tenable à l'oral :
 *   - puces en fragments nominaux courts, une idée par puce ;
 *   - suppression des verbes conjugués, des « il faut », « il convient »,
 *     du « je » / « nous » ;
 *   - surplus (phrases complètes, formules creuses) reversé dans les notes du
 *     présentateur plutôt que supprimé ;
 *   - titres courts, sans verbe.
 *
 * Aucune dépendance externe : la fonction est pure, testable et idempotente.
 */

/**
 * Formules « copie IA » interdites à l'écrit. Chaque entrée porte la
 * remédiation attendue (souvent : supprimer et dire la chose directement).
 */
const FORMULES_IA = [
  'il convient de',
  'il convient',
  'il est essentiel de',
  'il est essentiel',
  'il est important de',
  'il est primordial de',
  'il est nécessaire de',
  'dans un contexte en mutation',
  'dans un monde en constante évolution',
  'afin de garantir',
  'afin de',
  'à l\'ère du',
  'à l\'ère de',
  'au cœur de',
  'véritable levier',
  'véritable enjeu',
  'aujourd\'hui plus que jamais',
  'plus que jamais',
  'force est de constater',
  'synergie',
  'synergies',
  'notamment',
  'par ailleurs',
  'en conclusion',
  'en définitive',
  'il va sans dire',
  'à noter que',
  'le défi consiste à',
  'in fine',
];

/** Débuts de tournures impersonnelles à évacuer d'une puce. */
const AMORCES_IMPERSONNELLES = [
  /^il faut\s+/i,
  /^il convient de\s+/i,
  /^il est (essentiel|important|primordial|nécessaire|crucial) de\s+/i,
  /^on doit\s+/i,
  /^nous devons\s+/i,
  /^nous pouvons\s+/i,
  /^je pense que\s+/i,
  /^nous pensons que\s+/i,
  /^notons que\s+/i,
  /^il s'agit de\s+/i,
  /^c'est-\à-dire\s+/i,
];

/** Tournures de deux camps : interdites sur la slide Problématique. */
const TOURNURES_DEUX_CAMPS = [
  /\bpour\s*\/\s*contre\b/i,
  /\bavantages?\s*(et|\/)\s*(inconvénients?|limites?|risques?)\b/i,
  /\bforces?\s*(et|\/)\s*faiblesses?\b/i,
  /\bd'un côté\b/i,
  /\bde l'autre côté\b/i,
];

/** Verbes conjugués fréquents en début de fragment nominal. */
const VERBES_CONJUGUES = [
  'est', 'sont', 'était', 'étaient', 'sera', 'seront',
  'a', 'ont', 'avait', 'avaient', 'aura', 'auront',
  'permet', 'permettent', 'permettait', 'permettront',
  'doit', 'doivent', 'devait', 'devront',
  'peut', 'peuvent', 'pouvait', 'pourront',
  'faut', 'convient', 'suffit',
  'devient', 'deviennent', 'reste', 'restent',
  'constitue', 'constituent', 'représente', 'représentent',
  'nécessite', 'nécessitent', 'implique', 'impliquent',
  'offre', 'offrent', 'apporte', 'apportent',
  'renforce', 'renforcent', 'améliore', 'améliorent',
  'réduit', 'réduisent', 'augmente', 'augmentent',
  'génère', 'génèrent', 'créé', 'créent',
];

const MAX_MOTS_PUCE = 12;
const MAX_PUCES_SLIDE = 6;
const MAX_MOTS_TITRE = 7;

function normaliser(valeur) {
  return String(valeur == null ? '' : valeur).replace(/\s+/g, ' ').trim();
}

/** Retire le point final et les puces de liste parasites. */
function nettoyerBord(texte) {
  return normaliser(texte)
    .replace(/^[-•–—*\u2022]+\s*/, '')
    .replace(/\s*[.;,]+$/, '')
    .trim();
}

/**
 * Détecte les formules « copie IA » présentes dans un texte.
 * @returns {string[]} liste des formules trouvées (dédoublonnée)
 */
function detecterFormulesIA(texte) {
  const base = normaliser(texte).toLowerCase();
  const trouvees = [];
  FORMULES_IA.forEach((formule) => {
    if (base.includes(formule) && !trouvees.includes(formule)) {
      trouvees.push(formule);
    }
  });
  return trouvees;
}

/** Vrai si le texte contient un verbe conjugué (3e personne du singulier/pluriel). */
function contientVerbeConjugue(texte) {
  const mots = normaliser(texte)
    .toLowerCase()
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return mots.some((mot) => VERBES_CONJUGUES.includes(mot));
}

/** Vrai si la puce ressemble à une phrase complète (verbe + longueur). */
function estPhraseComplete(texte) {
  const base = normaliser(texte);
  if (!base) return false;
  const nbMots = base.split(/\s+/).length;
  return nbMots > MAX_MOTS_PUCE || contientVerbeConjugue(base);
}

/** Vrai si le texte propose deux camps (débat Pour/Contre, avantages/risques). */
function contientDeuxCamps(texte) {
  const base = normaliser(texte);
  return TOURNURES_DEUX_CAMPS.some((re) => re.test(base));
}

/**
 * Compresse une puce en fragment nominal.
 * @returns {{ texte: string, surplus: string[] }}
 */
function compresserPuce(puce) {
  const surplus = [];
  let texte = nettoyerBord(puce);
  if (!texte) return { texte: '', surplus };

  // 1. Amorces impersonnelles (« il faut », « il convient de »...).
  AMORCES_IMPERSONNELLES.forEach((re) => {
    const avant = texte;
    texte = texte.replace(re, '');
    if (avant !== texte) surplus.push(avant);
  });

  // 2. Formules IA : on les retire, la phrase garde son contenu utile.
  FORMULES_IA.forEach((formule) => {
    const re = new RegExp(`\\b${formule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    texte = texte.replace(re, '');
  });

  // 3. Premier pluriel « nous / je » : on repasse en nominal.
  texte = texte.replace(/\b(nous|je)\s+(?:allons|pouvons|devons|voulons)\s+/gi, '');

  texte = nettoyerBord(texte.replace(/\s{2,}/g, ' '));

  // 4. Trop long : on coupe à la virgule la plus proche, le reste va en notes.
  const mots = texte.split(/\s+/);
  if (mots.length > MAX_MOTS_PUCE) {
    const garde = mots.slice(0, MAX_MOTS_PUCE).join(' ');
    const reste = mots.slice(MAX_MOTS_PUCE).join(' ');
    const coupe = garde.lastIndexOf(',');
    if (coupe > 20) {
      surplus.push(garde.slice(coupe + 1).trim() + ' ' + reste);
      texte = garde.slice(0, coupe).trim();
    } else {
      surplus.push(reste);
      texte = garde;
    }
  }

  return { texte: nettoyerBord(texte), surplus };
}

/** Compresse un titre : court, sans verbe, sans point. */
function compresserTitre(titre) {
  let texte = nettoyerBord(titre);
  AMORCES_IMPERSONNELLES.forEach((re) => {
    texte = texte.replace(re, '');
  });
  const mots = texte.split(/\s+/);
  if (mots.length > MAX_MOTS_TITRE) texte = mots.slice(0, MAX_MOTS_TITRE).join(' ');
  return nettoyerBord(texte);
}

/**
 * Compresse une slide complète : puces, titre, visuel.
 * Le surplus alimente `notes_orateur` (jamais perdu).
 */
function compresserSlide(slide) {
  const base = slide && typeof slide === 'object' ? slide : {};
  const surplus = [];

  const pucesBrutes = Array.isArray(base.puces) ? base.puces : [];
  const puces = [];
  pucesBrutes.forEach((puce) => {
    const { texte, surplus: reste } = compresserPuce(puce);
    surplus.push(...reste);
    if (texte) puces.push(texte);
  });

  // Trop de puces : le débordement part en notes, l'idée n'est jamais coupée
  // sur deux slides.
  const pucesGardees = puces.slice(0, MAX_PUCES_SLIDE);
  const pucesRetirees = puces.slice(MAX_PUCES_SLIDE);
  // Puce de trop : on ne la jette pas, on la repasse en amorce numérotée dans
  // les notes du présentateur.
  pucesRetirees.forEach((puce) => surplus.push(`• ${puce}`));

  const notesExistantes = normaliser(base.notes_orateur);
  const notes = [notesExistantes, ...surplus].filter(Boolean).join(' ');

  const resultat = {
    ...base,
    titre: compresserTitre(base.titre),
    puces: pucesGardees,
    notes_orateur: notes,
  };

  // Le visuel doit rester une forme simple : pas de texte long dedans.
  if (base.visuel && typeof base.visuel === 'object' && typeof base.visuel.texte === 'string') {
    resultat.visuel = { ...base.visuel, texte: compresserTitre(base.visuel.texte) };
  }

  return resultat;
}

/**
 * Compresse un support entier.
 * @returns {{ support: object, rapport: object }}
 */
function compresserSupport(support) {
  const base = support && typeof support === 'object' ? support : {};
  const slides = Array.isArray(base.slides) ? base.slides : [];

  const anomalies = { phrases: 0, formulesIA: [], deuxCamps: 0 };
  const slidesCompressees = slides.map((slide) => {
    const brute = slide && typeof slide === 'object' ? slide : {};
    (Array.isArray(brute.puces) ? brute.puces : []).forEach((puce) => {
      if (estPhraseComplete(puce)) anomalies.phrases += 1;
      detecterFormulesIA(puce).forEach((f) => {
        if (!anomalies.formulesIA.includes(f)) anomalies.formulesIA.push(f);
      });
      if (contientDeuxCamps(puce)) anomalies.deuxCamps += 1;
    });
    return compresserSlide(brute);
  });

  return {
    support: { ...base, slides: slidesCompressees },
    rapport: anomalies,
  };
}

module.exports = {
  FORMULES_IA,
  TOURNURES_DEUX_CAMPS,
  VERBES_CONJUGUES,
  MAX_MOTS_PUCE,
  MAX_PUCES_SLIDE,
  MAX_MOTS_TITRE,
  normaliser,
  detecterFormulesIA,
  contientVerbeConjugue,
  estPhraseComplete,
  contientDeuxCamps,
  compresserPuce,
  compresserTitre,
  compresserSlide,
  compresserSupport,
};
