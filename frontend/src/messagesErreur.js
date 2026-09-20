/**
 * Messages d'erreur de génération affichés au CANDIDAT.
 *
 * Module volontairement PUR (aucun import React, aucun accès réseau) pour être
 * testable hors ligne. C'est le pendant frontend de la garantie backend
 * « jamais de 502 » : quel que soit ce que renvoie le serveur (JSON contrôlé,
 * HTML d'un proxy, body vide), l'interface affiche un message simple et
 * compréhensible, sans jamais exposer de détail technique.
 *
 * Interdits absolus dans les messages affichés :
 *  - extrait JSON brut ;
 *  - stack trace ;
 *  - message de proxy (« 502 Bad Gateway »…) ;
 *  - détail fournisseur IA.
 */

export const MESSAGES_PAR_CODE = {
  INVALID_LLM_JSON: 'La génération a produit un format inexploitable. Réessayez.',
  INVALID_CONTRACT_SCHEMA: 'Le contrat généré est incomplet. Réessayez.',
  CORE_CONTRACT_FIELDS_MISSING:
    'La génération ne contient pas les éléments nécessaires pour formuler une problématique. Réessayez.',
  PROBLEMATIC_QUALITY_REJECTED:
    'La problématique générée doit être reformulée pour être exploitable. Réessayez.',
  AI_PROVIDER_UNAVAILABLE:
    'Le service de génération est temporairement indisponible. Réessayez dans quelques instants.',
  AI_TIMEOUT: 'La génération a pris trop de temps. Réessayez.',
  AI_OUTPUT_TRUNCATED: 'La génération a été interrompue. Réessayez.',
  CONTRACT_PERSISTENCE_FAILED:
    'Le contrat a été généré mais n’a pas pu être enregistré. Réessayez.',
  SUPPORT_NOT_READY: 'Le support ne peut pas encore être généré.',
  EXPORT_NOT_READY: 'L’export n’est pas encore possible.',
  CONTRACT_NOT_READY:
    'Le contrat métier (Passe A) doit être généré puis validé avant de continuer.',
  GLOSSARY_NOT_READY:
    'Le glossaire doit être généré puis validé avant de continuer.',
  INTERNAL_ERROR:
    'Une erreur interne est survenue pendant la génération. Réessayez.',
};

/** Libellés des prérequis manquants (réponse structurée `missing`). */
export const LIBELLES_PREREQUIS = {
  contract_generation: 'Contrat Passe A généré',
  contract_validation: 'Contrat Passe A validé',
  plan_generation: 'Plan détaillé généré',
  glossary_validation: 'Glossaire & sources validés',
  support_generation: 'Support généré',
  export_verification: 'Vérification export conforme',
};

/** Étape du parcours vers laquelle renvoyer l'utilisateur pour un prérequis. */
export const ETAPE_PAR_PREREQUIS = {
  contract_generation: 'probleme',
  contract_validation: 'probleme',
  plan_generation: 'plan',
  glossary_validation: 'glossaire',
  support_generation: 'support',
  export_verification: 'support',
};

export const MESSAGE_GENERIQUE =
  'La génération est temporairement indisponible. Réessayez dans quelques instants.';

/**
 * Motifs de fuite technique : jamais affichés à l'utilisateur, même si le
 * serveur les a laissés passer.
 */
const MOTIFS_TECHNIQUES = [
  /\bstack\b/i,
  /ReferenceError/,
  /TypeError/,
  /SyntaxError/,
  /Cannot access/,
  /is not (a function|defined)/,
  /\bat\s+\w+\s*\(/,
  /\[object Object\]/,
  /"(error|message|code)"\s*:/,
  /\bundefined\b/,
  /\bnull\b/,
  /\b\d{3}\s+(Bad Gateway|Internal Server Error|Service Unavailable)\b/i,
];

/** Vrai si le texte est sûr à afficher : ni fuite technique, ni vide. */
export function messageSur(texte) {
  if (typeof texte !== 'string') return false;
  const t = texte.trim();
  if (!t) return false;
  if (t.length > 400) return false;
  return !MOTIFS_TECHNIQUES.some((motif) => motif.test(t));
}

/**
 * Traduit une erreur d'appel API en message sûr pour le candidat.
 *
 * On privilégie le code applicatif (seule source fiable) ; sinon on ne réutilise
 * le message que s'il passe le filtre de sûreté. Toute autre situation (HTML,
 * body vide, JSON non conforme, stack trace, erreur réseau) retombe sur le
 * message générique : aucune erreur technique ne doit atteindre l'écran.
 */
export function messageCandidat(err) {
  if (err && typeof err.code === 'string' && MESSAGES_PAR_CODE[err.code]) {
    return MESSAGES_PAR_CODE[err.code];
  }
  return messageSur(err?.message) ? err.message : MESSAGE_GENERIQUE;
}

/**
 * Liste des prérequis manquants, prête à afficher en checklist française.
 * Renvoie un tableau vide si l'erreur n'en porte pas.
 */
export function prerequisManquants(err) {
  const manquants = Array.isArray(err?.missing) ? err.missing : [];
  return manquants
    .map((cle) => ({
      cle,
      label: LIBELLES_PREREQUIS[cle] || 'Prérequis du parcours',
      stepKey: ETAPE_PAR_PREREQUIS[cle] || null,
    }))
    .filter(Boolean);
}

/**
 * Libellé discret de corrélation, affiché sous l'alerte d'erreur.
 *
 * Objectif : permettre au candidat de citer une référence précise (« Référence :
 * 3f2a… ») pour retrouver la tentative dans les logs serveur, sans jamais
 * exposer de détail technique. Renvoie `null` quand aucune référence n'est
 * disponible : on n'affiche alors simplement rien.
 */
export function referenceErreur(err) {
  const requestId = err && typeof err.requestId === 'string' ? err.requestId.trim() : '';
  return requestId ? `Référence : ${requestId}` : null;
}
