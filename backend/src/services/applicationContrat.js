/**
 * Application du contrat Passe A à la session — isolée de la route pour être
 * testable hors ligne (cas 9 du cahier des charges : « une erreur de génération
 * ne doit jamais écraser le contrat précédemment validé »).
 *
 * Invariant central : l'écriture n'a lieu qu'APRÈS un parsing et une validation
 * réussis. Tant qu'une génération peut échouer (parseur, schéma, fournisseur),
 * la session en base garde son contrat intact.
 */

/**
 * Écrit le contrat produit par la Passe A dans `session.data.contrat`.
 *
 * @param {object} session   session Mongoose (mutée en place, non sauvegardée ici)
 * @param {object} contrat   contrat DÉJÀ parsé et validé
 * @param {Function} estObjetNonVide prédicat partagé avec la route
 * @returns {{ regenere: boolean, etapesInvalidees: string[], currentStep: number }}
 */
function appliquerContratPasseA(session, contrat, estObjetNonVide) {
  const ancienContrat = session.data && session.data.contrat;
  const regenere = estObjetNonVide(ancienContrat);

  const ld = String(contrat.ligneDirectrice || contrat.ligne_directrice || '').trim();
  session.ligneDirectrice = ld;
  contrat.ligneDirectrice = ld;

  // Régénération : la validation précédente est caduque, l'étudiant doit
  // revalider ce nouveau contrat.
  if (regenere) contrat.valide = false;

  // Les étapes aval étaient bâties sur l'ancien contrat : elles doivent être
  // re-générées (recherche d'arrière-plan, plan, glossaire, support).
  const etapesInvalidees = [];
  if (regenere) {
    ['recherche', 'plan', 'glossaire', 'support'].forEach((k) => {
      if (session.data && session.data[k]) {
        session.data[k] = {};
        etapesInvalidees.push(k);
      }
    });
  }

  session.data.contrat = contrat;
  return { regenere, etapesInvalidees, currentStep: session.currentStep };
}

module.exports = { appliquerContratPasseA };
