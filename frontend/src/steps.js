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

/**
 * État de workflow par défaut — miroir de `backend/src/models/Session.js`.
 * Toute autorisation d'affichage ou d'action dépend de cet état, jamais d'une
 * coche UI ni de la présence vague d'un objet.
 */
export const WORKFLOW_DEFAUT = {
  analysis: 'empty',
  contract: 'empty',
  plan: 'empty',
  glossary: 'empty',
  support: 'empty',
  export: 'blocked',
};

/** Lit l'état de workflow d'une session, avec valeurs de repli sûres. */
export function workflowOf(session) {
  const w = session?.workflow;
  return {
    ...WORKFLOW_DEFAUT,
    ...(w && typeof w === 'object' ? w : {}),
  };
}

/**
 * Clé de `session.data` qui porte réellement le contenu d'une étape.
 *
 * L'étape « Problématique » est la seule exception : le backend persiste son
 * contrat canonique sous `data.contrat` (vocabulaire métier), pas sous
 * `data.probleme`. Sans cette correspondance, la coquille d'étape croyait
 * n'avoir aucun contenu et ne proposait que le bouton de génération — alors que
 * le contrat était bien en base (le Plan, déverrouillé et alimenté, le prouvait).
 */
const CLE_DONNEES_PAR_ETAPE = { probleme: 'contrat' };

export function cleDonnees(stepKey) {
  return CLE_DONNEES_PAR_ETAPE[stepKey] || stepKey;
}

/**
 * État d'une étape, lu EXCLUSIVEMENT depuis le workflow du backend.
 * Retourne la chaîne d'état brute : 'empty' | 'generated' | 'validated'.
 */
export function etatEtape(session, stepKey) {
  const w = workflowOf(session);
  switch (stepKey) {
    case 'analyse':
      return w.analysis;
    case 'probleme':
      return w.contract;
    case 'plan':
      return w.plan;
    case 'glossaire':
      return w.glossary;
    case 'support':
      return w.support;
    default:
      return 'empty';
  }
}

export function hasStepData(session, stepKey) {
  const etat = etatEtape(session, stepKey);
  if (etat === 'generated' || etat === 'validated') return true;
  // Repli : certaines réponses (idées de sujets, sessions très anciennes) ne
  // portent pas encore de workflow. On ne s'appuie alors que sur la donnée
  // réellement persistée, jamais sur un état local.
  const value = session?.data?.[cleDonnees(stepKey)];
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
  const etat = workflowOf(session).glossary;
  if (etat === 'validated') return true;
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
  return etatEtape(session, 'probleme') === 'validated';
}

/**
 * Prérequis de la génération du support, dans l'ordre du parcours.
 * Chaque entrée porte l'étape de retour pour que l'UI propose un bouton utile.
 */
export function prerequisSupport(session) {
  const w = workflowOf(session);
  return [
    {
      cle: 'contract_validation',
      ok: w.contract === 'validated',
      label: 'Contrat Passe A validé',
      stepKey: 'probleme',
      retour: 'Valider la problématique',
    },
    {
      cle: 'plan_generation',
      ok: w.plan === 'generated',
      label: 'Plan détaillé généré',
      stepKey: 'plan',
      retour: 'Générer le plan',
    },
    {
      cle: 'glossary_validation',
      ok: w.glossary === 'validated',
      label: 'Glossaire & sources validés',
      stepKey: 'glossaire',
      retour: 'Valider le glossaire',
    },
  ];
}
