/**
 * Métadonnées des 5 étapes visibles du parcours Grand Oral.
 * Ordre imposé par la méthodologie : analyse → problématique → plan →
 * glossaire → support. La recherche documentaire n'est plus une étape : elle
 * est produite automatiquement en arrière-plan avant le plan.
 */
export const STEPS = [
  { key: 'analyse', label: 'Analyse du sujet', short: 'Analyse' },
  { key: 'probleme', label: 'Problématique', short: 'Problématique' },
  { key: 'plan', label: 'Plan détaillé', short: 'Plan' },
  { key: 'glossaire', label: 'Glossaire & résumés de sources', short: 'Glossaire' },
  { key: 'support', label: 'Support de présentation', short: 'Support' },
];

export function stepIndex(key) {
  return STEPS.findIndex((s) => s.key === key);
}

export const STEP_EXPLANATIONS = {
  analyse:
    'Produit une analyse ouverte du sujet (mots-clés, tensions provisoires) — socle de toute la suite.',
  probleme:
    'Produit le contrat métier (Passe A) : mots-clés, tension, UNE problématique, justification, préconisations et cas d’entreprises — à valider avant les slides.',
  plan:
    'Découpe la démonstration en parties minutées, reliées à la problématique et à la ligne directrice. La recherche documentaire est lancée automatiquement en arrière-plan pour l’étayer.',
  glossaire:
    'Définit les termes et acronymes réellement employés dans le plan, en résumant les sources trouvées en arrière-plan — à valider avant le support.',
  support:
    'Transforme le plan en slides concises + notes orateur, puis permet l’export .pptx.',
};

export function hasStepData(session, stepKey) {
  if (!session || !session.data) return false;
  const value = session.data[stepKey];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).some((k) => {
    const v = value[k];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return String(v).trim() !== '';
  });
}

export function glossaireValide(session) {
  const g = session?.data?.glossaire;
  const sources = Array.isArray(g?.sources) ? g.sources : [];
  const termes = Array.isArray(g?.termes) ? g.termes : [];
  return sources.length > 0 && termes.length > 0;
}

/** Ligne directrice : champ session ou repli sur la ligne directrice du contrat (Passe A). */
export function ligneDirectriceOf(session) {
  const fromSession = (session?.ligneDirectrice || '').trim();
  if (fromSession) return fromSession;
  const ld = session?.data?.contrat?.ligneDirectrice;
  return typeof ld === 'string' ? ld.trim() : '';
}

/** Contrat métier (Passe A) validé : condition d'ouverture de la Passe B et de l'export. */
export function contratValide(session) {
  return session?.data?.contrat?.valide === true;
}
