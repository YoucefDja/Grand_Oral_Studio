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
};

export const MESSAGE_GENERIQUE =
  'La génération est temporairement indisponible. Réessayez dans quelques instants.';

/**
 * Traduit une erreur d'appel API en message sûr pour le candidat.
 *
 * On privilégie le code applicatif (seule source fiable) ; sinon on ne réutilise
 * le message que s'il est explicitement fourni par nos erreurs contrôlées.
 * Toute autre situation (HTML, body vide, JSON non conforme, erreur réseau)
 * retombe sur le message générique de disponibilité.
 */
export function messageCandidat(err) {
  if (err && typeof err.code === 'string' && MESSAGES_PAR_CODE[err.code]) {
    return MESSAGES_PAR_CODE[err.code];
  }
  return err && typeof err.message === 'string' && err.message.trim()
    ? err.message
    : MESSAGE_GENERIQUE;
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
