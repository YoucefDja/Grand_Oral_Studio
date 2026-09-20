/**
 * Règles PURES d'affichage du contrat métier (Passe A) côté frontend.
 *
 * Module sans dépendance React/DOM, donc testable hors ligne. Un contrat est
 * affichable/validable dès que le SERVEUR le déclare (`status: 'generated'` ou
 * `'validated'`) : la complétude (`completeness.passeAValid`) n'est qu'une
 * information secondaire, jamais un filtre d'affichage. `justificationProbleme`
 * est FACULTATIF à l'étape Passe A : son absence est signalée comme un élément à
 * approfondir, jamais comme une erreur bloquante. Le contrôle strict est
 * déplacé à l'export. Les sections secondaires vides restent affichées avec un
 * statut explicite, jamais « undefined ».
 */

/** Statuts d'une section vide, alignés sur les libellés i18n. */
export const STATUTS_SECTION = {
  A_COMPLETER: 'aCompleterEtapeSuivante',
  NON_GENERE: 'nonGenere',
  AUCUN_CAS: 'aucunCas',
};

/** Statuts canoniques du contrat, miroir de `backend/src/domain/contratPasseA.js`. */
export const STATUTS_CONTRAT = { GENERATED: 'generated', VALIDATED: 'validated' };

/** Marqueurs d'une valeur non exploitable : jamais affichés à l'étudiant. */
const VALEURS_INTERDITES = new Set(['undefined', 'null', '[object Object]']);

function estTexteNonVide(valeur) {
  return typeof valeur === 'string' && valeur.trim().length > 0;
}

function tableauSur(valeur) {
  return Array.isArray(valeur) ? valeur : [];
}

/**
 * Construit la vue d'affichage du contrat : booléens de disponibilité et
 * tableaux normalisés (jamais `undefined`).
 */
export function construireVueContrat(contrat) {
  const c = contrat && typeof contrat === 'object' ? contrat : {};
  const completeness = c.completeness && typeof c.completeness === 'object' ? c.completeness : {};

  // Un contrat est affichable dès que le serveur le déclare généré ou validé.
  const etat = typeof c.status === 'string' ? c.status : '';
  const affichable = etat === STATUTS_CONTRAT.GENERATED || etat === STATUTS_CONTRAT.VALIDATED;
  const valide = etat === STATUTS_CONTRAT.VALIDATED;

  // Noyau métier : tension + problématique (seuls bloquants de la Passe A).
  // La justification n'entre PAS dans la validité du core.
  const noyauComplet = estTexteNonVide(c.problematique) && estTexteNonVide(c.tension);

  const missingFields = tableauSur(completeness.missingFields).filter(
    (champ) => typeof champ === 'string' && champ.length > 0
  );

  // Justification à approfondir : vide mais NON bloquante. On ne renvoie jamais
  // `undefined` ni `null` — juste un booléen d'affichage pilotant l'encadré.
  const justificationProbleme =
    typeof c.justificationProbleme === 'string' ? c.justificationProbleme : '';
  const justificationAFournir = justificationProbleme.trim() === '';

  return {
    affichable,
    valide,
    noyauComplet,
    editable: affichable,
    justificationProbleme,
    justificationAFournir,
    missingFields,
    motsCles: tableauSur(c.motsCles),
    contexte: tableauSur(c.contexte),
    limites: tableauSur(c.limitesExistant),
    preconisations: tableauSur(c.preconisations),
    cas: tableauSur(c.casEntreprises),
    ligneDirectrice: typeof c.ligneDirectrice === 'string' ? c.ligneDirectrice : '',
    ouverture: typeof c.ouverture === 'string' ? c.ouverture : '',
    avertissements: [...tableauSur(c.verification?.avertissements), ...tableauSur(c.verification?.rejetsSecondaires)],
  };
}

/** Sections secondaires susceptibles d'être vides à la première génération. */
export function vuesSecondaires(vue) {
  const v = vue && typeof vue === 'object' ? vue : {};
  return [
    { cle: 'motsCles', items: tableauSur(v.motsCles) },
    { cle: 'contexte', items: tableauSur(v.contexte) },
    { cle: 'limitesExistant', items: tableauSur(v.limites) },
    { cle: 'preconisations', items: tableauSur(v.preconisations) },
    { cle: 'casEntreprises', items: tableauSur(v.cas) },
  ];
}

/**
 * Statut textuel d'une section : `null` si elle a du contenu, sinon le statut
 * explicite correspondant. Jamais de valeur technique (`undefined`, etc.).
 */
export function statutSection(section) {
  const items = tableauSur(section && section.items);
  if (items.length === 0) {
    if (section && section.cle === 'casEntreprises') return STATUTS_SECTION.AUCUN_CAS;
    return STATUTS_SECTION.NON_GENERE;
  }
  const premier = items[0];
  if (typeof premier === 'string' && VALEURS_INTERDITES.has(premier)) {
    return STATUTS_SECTION.NON_GENERE;
  }
  return null;
}
