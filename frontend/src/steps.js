/**
 * Métadonnées des 7 étapes du parcours Grand Oral.
 * Ordre imposé par la méthodologie : l'étape « Source en ligne » (veille ciblée,
 * manuelle) intervient après la problématique, avant la recherche documentaire.
 */
export const STEPS = [
  { key: 'analyse', label: 'Analyse du sujet', short: 'Analyse' },
  { key: 'probleme', label: 'Problématique', short: 'Problématique' },
  { key: 'source', label: 'Source en ligne', short: 'Sources' },
  { key: 'recherche', label: 'Recherche documentaire', short: 'Recherche' },
  { key: 'glossaire', label: 'Glossaire & résumés de sources', short: 'Glossaire' },
  { key: 'plan', label: 'Plan détaillé', short: 'Plan' },
  { key: 'support', label: 'Support de présentation', short: 'Support' },
];

export function stepIndex(key) {
  return STEPS.findIndex((s) => s.key === key);
}

export const STEP_EXPLANATIONS = {
  analyse:
    'Produit une analyse ouverte du sujet (mots-clés, tensions provisoires) — socle de toute la suite.',
  probleme:
    'Formule 2 à 4 problématiques issues de tensions réelles + la ligne directrice (fil rouge) propagée ensuite.',
  source:
    'Récupère manuellement jusqu’à 4 articles ciblés sur le thème, le sujet et la problématique — archivés dans l’onglet News.',
  recherche:
    'Définit les axes, les sources réelles à consulter et les données chiffrées à chercher.',
  glossaire:
    'Résume chaque source retenue et établit le glossaire des termes — à valider avant le plan.',
  plan:
    'Découpe la démonstration en parties minutées, reliées à la problématique et à la ligne directrice.',
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

/** Ligne directrice : champ session ou repli sur la donnée de l'étape probleme. */
export function ligneDirectriceOf(session) {
  const fromSession = (session?.ligneDirectrice || '').trim();
  if (fromSession) return fromSession;
  const ld = session?.data?.probleme?.ligne_directrice;
  return typeof ld === 'string' ? ld.trim() : '';
}
