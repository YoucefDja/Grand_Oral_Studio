/**
 * Configuration des pages légales — À PERSONNALISER.
 *
 * Ces valeurs alimentent les mentions légales, la politique de confidentialité
 * et les CGU affichées dans le footer du site (routes /mentions-legales,
 * /confidentialite, /cgu). Le site étant un projet étudiant / démo, les textes
 * sont des modèles à faire valider par un professionnel avant une mise en
 * production publique.
 */
export const LEGAL_CONFIG = {
  // Nom / pseudo de l'éditeur (personne physique).
  editor: 'YoucefDja',
  // Ville de l'éditeur (facultatif pour un projet démo).
  editorCity: '',
  // E-mail de contact public (adresse no-reply du domaine).
  contactEmail: 'no-reply@mon-grand-oral.site',
  // Nom du service / produit.
  product: 'Grand Oral Studio',
  // Hébergeur (Railway — voir railway.com/legal).
  host: 'Railway Corporation',
  hostAddress: '548 Market St, Suite 68956, San Francisco, CA 94104, États-Unis',
  hostUrl: 'https://railway.com',
  // Année du copyright.
  year: '2026',
};

/** Copie sécurisée pour injection dans les textes. */
export function legalVars(cfg = LEGAL_CONFIG) {
  return {
    ...cfg,
    editorLocation: cfg.editorCity ? `${cfg.editor}, ${cfg.editorCity}` : cfg.editor,
    email: cfg.contactEmail,
    site: cfg.product,
    hostName: cfg.host,
    hostAddressFull: cfg.hostAddress,
    hostLink: cfg.hostUrl,
    year: String(cfg.year),
  };
}
