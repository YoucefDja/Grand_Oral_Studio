/**
 * Lecture de la grille d'évaluation du jury CESI telle qu'elle est stockée en
 * base (section `grille_evaluation_cesi`, order 5, appliesToSteps ['all']).
 *
 * Le contenu de cette section est le référentiel unique : il est éditable en
 * admin. On le PARSE ici au lieu de redupliquer les 14 critères en dur, afin
 * qu'une modification de la grille en admin soit immédiatement prise en compte
 * par la vérification et par le rapport d'export.
 *
 * Format reconnu (celui produit par le seed) :
 *   BLOC 1 — Qualité de la réponse sur le fond (28 points) :
 *   1.1 Présentation du contexte : intitulé…
 *   1.2 Enjeux dégagés : intitulé…
 */

const SECTION_ID = 'grille_evaluation_cesi';

/**
 * @param {string} contenu Contenu texte de la section de grille.
 * @returns {{ blocs: Array<{libelle:string, points:number|null, criteres:Array<{id:string, libelle:string, attendu:string, bloc:string}>}>, criteres: Array, scoreMax:number }}
 */
function parserGrille(contenu) {
  const blocs = [];
  const criteres = [];
  let blocCourant = null;

  const lignes = String(contenu || '').split(/\r?\n/);
  for (const ligne of lignes) {
    const texte = ligne.trim();
    if (!texte) continue;

    // En-tête de bloc : « BLOC 1 — Qualité de la réponse sur le fond (28 points) : »
    const blocMatch = texte.match(/^BLOC\s+(\d+)\s*[—–-]\s*(.+?)\s*(?:\((\d+)\s*points?\))?\s*:?$/i);
    if (blocMatch) {
      const points = blocMatch[3] ? Number(blocMatch[3]) : null;
      blocCourant = { libelle: `Bloc ${blocMatch[1]} — ${blocMatch[2].trim()}`, points, criteres: [] };
      blocs.push(blocCourant);
      continue;
    }

    // Critère : « 1.2 Enjeux dégagés : ... »
    const critereMatch = texte.match(/^(\d+\.\d+)\s+(.+)$/);
    if (critereMatch && blocCourant) {
      const id = critereMatch[1];
      const reste = critereMatch[2].trim();
      const sep = reste.indexOf(' : ');
      const libelle = sep === -1 ? reste.replace(/:$/, '').trim() : reste.slice(0, sep).trim();
      const attendu = sep === -1 ? '' : reste.slice(sep + 3).trim();
      const critere = { id, libelle, attendu, bloc: blocCourant.libelle };
      blocCourant.criteres.push(critere);
      criteres.push(critere);
    }
  }

  const scoreMax = criteres.reduce((total, c) => {
    const bloc = blocs.find((b) => b.libelle === c.bloc);
    const points = bloc && bloc.points ? bloc.points : 0;
    const nb = bloc ? bloc.criteres.length : 0;
    return total + (nb > 0 ? points / nb : 0);
  }, 0);

  return { blocs, criteres, scoreMax: Math.round(scoreMax * 100) / 100 };
}

module.exports = { parserGrille, SECTION_ID };
