/**
 * Ligne directrice continue du support Grand Oral CESI.
 *
 * Le jury évalue d'abord l'exercice ORAL : les slides ne sont que des appuis.
 * Pour que la présentation se tienne comme un seul raisonnement — et non comme
 * une suite de slides indépendantes — chaque slide de contenu se termine par
 * une phrase de transition discrète, en bas de slide, qui annonce la suivante
 * et rappelle le fil conducteur (critères 2.1 « fil directeur visible » et
 * 2.4 « impact visuel »).
 *
 * Répartition des zones en bas de slide (hauteur totale 7,5 pouces) :
 *  - fil rouge (rappel de la problématique) : y 6,8 → 7,4 ;
 *  - phrase de transition (ligne continue)  : y 6,5 → 6,95 ;
 *  - les deux peuvent coexister, la transition restant au-dessus du fil rouge.
 *
 * Ce module est le pendant « rendu natif » de la spécification textuelle
 * injectée dans le .md exporté (voir services/chartePptxClaude.js) et de la
 * consigne de contenu (voir services/promptBuilder.js, SUPPORT_STRUCTURE).
 */

const TRANSITION_TOP = 6.5;
const TRANSITION_HEIGHT = 0.45;
const TRANSITION_BOTTOM = TRANSITION_TOP + TRANSITION_HEIGHT; // 6,95
const TRANSITION_GAP = 0.1;

/** Types de slide portant une transition (la page de titre n'en a pas). */
const TYPES_SANS_TRANSITION = new Set(['titre']);

/** Normalise un texte pour comparaison (minuscules, sans accents). */
function normaliser(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function estSlideProblematique(slide) {
  const type = normaliser(slide && slide.type).replace(/[^a-z]/g, '');
  const titre = normaliser(slide && slide.titre);
  return type.includes('problematique') || type.includes('problem') || titre.includes('problematique');
}

function estSlideCasEntreprises(slide) {
  const type = normaliser(slide && slide.type).replace(/[^a-z]/g, '');
  const titre = normaliser(slide && slide.titre);
  return (
    type.includes('exempleentreprise') ||
    type.includes('casentreprise') ||
    /cas d.entreprise|cas reel|benchmark/.test(titre)
  );
}

/**
 * Phrase de transition de la slide : celle rédigée par l'IA quand elle existe
 * (champ "transition"), sinon une relance calculée — la ligne directrice ne
 * doit jamais s'interrompre d'une slide à l'autre.
 *
 * @param {object} item Slide courante (data.support.slides[i]).
 * @returns {string} Phrase de transition, sans guillemets ni ponctuation finale.
 */
function phraseTransition(item) {
  if (!item || typeof item !== 'object') return '';
  if (TYPES_SANS_TRANSITION.has(normaliser(item.type).trim())) return '';

  const explicite = String(item.transition || '').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  if (explicite) return explicite;

  if (estSlideCasEntreprises(item)) {
    return "Ces cas réels éclairent le problème : voyons ce que j'en retiens pour agir";
  }
  if (estSlideProblematique(item)) {
    return "C'est précisément cette question qui structure toute la suite de mon analyse";
  }
  return 'Poursuivons le raisonnement pour répondre à cette question';
}

/**
 * Zone de la phrase de transition. Elle rétrécit quand le rappel de la
 * problématique occupe le pied de slide, pour ne jamais le chevaucher.
 */
function zoneTransition({ withProblem } = {}) {
  const bottom = withProblem ? TRANSITION_BOTTOM : TRANSITION_BOTTOM + 0.35;
  return {
    x: 0.6,
    y: TRANSITION_TOP,
    w: 13.33 - 2.4,
    h: Math.max(0.35, bottom - TRANSITION_TOP),
  };
}

/** Y a-t-il un pied de slide sous la phrase de transition ? */
function doitReserverPied(withProblem) {
  return Boolean(withProblem);
}

module.exports = {
  phraseTransition,
  zoneTransition,
  doitReserverPied,
  TRANSITION_TOP,
  TRANSITION_HEIGHT,
  TRANSITION_GAP,
};
