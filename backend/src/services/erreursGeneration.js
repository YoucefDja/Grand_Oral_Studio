/**
 * Gestion d'erreur CONTRÔLÉE de la génération IA.
 *
 * Extrait de la route pour être testable hors ligne : c'est ici que se joue la
 * garantie « jamais de 502 ». Toute erreur qui remonte d'une génération
 * (parsing, schéma, fournisseur, timeout, bug inattendu) est convertie en
 * couple (statut HTTP, code applicatif, message utilisateur simple).
 *
 * Le message utilisateur ne contient JAMAIS :
 *  - d'extrait brut de la réponse du modèle ;
 *  - de JSON technique ;
 *  - de stack trace ;
 *  - de détail fournisseur.
 * Ces éléments partent uniquement dans les logs serveur (voir `logGeneration`).
 */

/** Erreur HTTP portant un statut, un code applicatif stable et un détail technique (logs). */
function httpError(status, message, code, detailTechnique) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (detailTechnique) err.detailTechnique = detailTechnique;
  return err;
}

/**
 * Log structuré d'une génération IA — sans fuite de données.
 *
 * On journalise UNIQUEMENT des métadonnées techniques (durée, statut, taille,
 * code d'erreur, diagnostic de schéma Passe A). Jamais le contenu de la
 * session, jamais la clé API, jamais la réponse complète du modèle : les
 * diagnostics ne portent que des NOMS de champs et des booléens, ce qui permet
 * de savoir ce qui a bloqué sans journaliser de contenu métier.
 */
function logGeneration({
  requestId,
  sessionId,
  etape,
  provider,
  dureeMs,
  statut,
  code,
  taille,
  detail,
  stage,
  parsed,
  coreFieldsPresent,
  missingSecondaryFields,
  champsManquants,
  validationOutcome,
  diagnosticContrat,
}) {
  const ligne = {
    requestId,
    sessionId,
    etape,
    provider,
    dureeMs,
    statut,
    code: code || null,
  };
  if (Number.isFinite(taille)) ligne.tailleReponse = taille;
  // Diagnostic Passe A : uniquement des noms de champs et des booléens.
  if (stage) ligne.stage = stage;
  if (typeof parsed === 'boolean') ligne.parsed = parsed;
  if (coreFieldsPresent) ligne.coreFieldsPresent = coreFieldsPresent;
  if (Array.isArray(missingSecondaryFields)) ligne.missingSecondaryFields = missingSecondaryFields;
  if (Array.isArray(champsManquants)) ligne.champsManquants = champsManquants;
  if (validationOutcome) ligne.validationOutcome = validationOutcome;

  // Diagnostic de contrat COMPLET (événement dédié) : liste des clés reçues,
  // statuts de parsing/schéma/vérification. Aucun contenu métier, aucune source,
  // aucun e-mail, aucune clé : seulement des noms de champs et des booléens.
  if (diagnosticContrat) {
    ligne.event = 'contract_generation_diagnostic';
    ligne.appVersion = diagnosticContrat.appVersion;
    ligne.rawTopLevelKeys = diagnosticContrat.rawTopLevelKeys || [];
    ligne.normalizedTopLevelKeys = diagnosticContrat.normalizedTopLevelKeys || [];
    ligne.aliasUsed = diagnosticContrat.aliasUsed || [];
    ligne.promotions = diagnosticContrat.promotions || [];
    // Provenance des champs core : un nom de source, jamais un contenu.
    ligne.tensionSource = diagnosticContrat.tensionSource || 'missing';
    ligne.justificationSource = diagnosticContrat.justificationSource || 'missing';
    ligne.formulationCount = diagnosticContrat.formulationCount || 0;
    ligne.formulationIndexUsed = diagnosticContrat.formulationIndexUsed ?? null;
    ligne.corePresence = diagnosticContrat.corePresence || {};
    ligne.coreMissing = diagnosticContrat.coreMissing || [];
    ligne.parseStatus = diagnosticContrat.parseStatus;
    ligne.schemaStatus = diagnosticContrat.schemaStatus;
    ligne.verificationStatus = diagnosticContrat.verificationStatus;
    ligne.rejectionCode = diagnosticContrat.rejectionCode ?? null;
  }

  // L'extrait brut n'apparaît qu'en développement, et il est déjà tronqué.
  const estDev = process.env.NODE_ENV !== 'production';
  if (estDev && detail) ligne.detail = detail;
  console.error('[generation]', JSON.stringify(ligne));
}

/**
 * Codes applicatifs renvoyés au frontend. Le message est VOLONTAIREMENT simple :
 * ni extrait brut, ni JSON technique, ni détail fournisseur.
 *
 * Passe A : deux échecs internes distincts, pour ne plus renvoyer un générique
 * ambigu impossible à diagnostiquer en recette.
 *  - `CORE_CONTRACT_FIELDS_MISSING` : le modèle n'a pas produit les DEUX
 *    éléments qui portent la logique du sujet (tension, problématique). La
 *    justification est FACULTATIVE à cette étape et n'est jamais la cause de ce
 *    rejet ;
 *  - `PROBLEMATIC_QUALITY_REJECTED` : la problématique existe mais les règles
 *    métier de `contratVerification` la refusent (copie du sujet, oui/non…).
 */
const MESSAGES_ERREUR = {
  INVALID_LLM_JSON: {
    status: 422,
    message: 'La génération a produit un format inexploitable. Réessayez.',
  },
  INVALID_CONTRACT_SCHEMA: {
    status: 422,
    message: 'Le contrat généré est incomplet. Réessayez.',
  },
  CORE_CONTRACT_FIELDS_MISSING: {
    status: 422,
    message:
      'La génération ne contient pas les éléments nécessaires pour formuler une problématique. Réessayez.',
  },
  PROBLEMATIC_QUALITY_REJECTED: {
    status: 422,
    message: 'La problématique générée doit être reformulée pour être exploitable. Réessayez.',
  },
  AI_PROVIDER_UNAVAILABLE: {
    status: 503,
    message:
      'Le service de génération est temporairement indisponible. Réessayez dans quelques instants.',
  },
  AI_TIMEOUT: {
    status: 504,
    message: 'La génération a pris trop de temps. Réessayez.',
  },
  AI_OUTPUT_TRUNCATED: {
    status: 500,
    message: 'La génération a été interrompue. Réessayez.',
  },
  // Le contrat est métier-valide : seul son ENREGISTREMENT a échoué. On le dit
  // explicitement pour ne pas renvoyer un INTERNAL_ERROR opaque (l'étudiant peut
  // réessayer sans régénérer).
  CONTRACT_PERSISTENCE_FAILED: {
    status: 500,
    message: 'Le contrat a été généré mais n’a pas pu être enregistré. Réessayez.',
  },
  INTERNAL_ERROR: {
    status: 500,
    message: 'Une erreur interne est survenue pendant la génération. Réessayez.',
  },
};

/**
 * Convertit n'importe quelle erreur de génération en erreur HTTP CONTRÔLÉE.
 *
 * Objectif non négociable : l'endpoint ne doit jamais laisser remonter une
 * erreur non gérée (que le proxy transformerait en 502 Bad Gateway). Tout
 * devient un couple (statut, code applicatif, message utilisateur simple).
 */
function erreurGenerationControlee(err, contexte = {}) {
  // Erreur déjà qualifiée par la couche provider (deepseek.js) ou notre couche
  // de parsing : on la propage en gardant son code applicatif.
  if (err && typeof err.code === 'string' && MESSAGES_ERREUR[err.code]) {
    const cible = MESSAGES_ERREUR[err.code];
    logGeneration({
      ...contexte,
      statut: cible.status,
      code: err.code,
      detail: err.detailTechnique || err.internalReason || err.message,
    });
    const controlee = httpError(
      cible.status,
      cible.message,
      err.code,
      err.detailTechnique || err.internalReason || err.message
    );
    // Le requestId suit l'erreur jusqu'au handler global, qui le renvoie au
    // frontend : c'est la clé de corrélation avec cette ligne de log.
    if (contexte.requestId) controlee.requestId = contexte.requestId;
    return controlee;
  }

  // Erreur portant déjà un statut (404, 400… de nos garde-fous) : on la garde.
  if (err && Number.isInteger(err.status) && err.status < 500) {
    if (contexte.requestId && !err.requestId) err.requestId = contexte.requestId;
    return err;
  }

  // Tout le reste est INATTENDU : 500 JSON contrôlé, jamais un 502 de proxy.
  logGeneration({
    ...contexte,
    statut: 500,
    code: err?.code || 'INTERNAL_ERROR',
    detail: err?.stack || err?.message,
  });
  const controlee = httpError(
    500,
    MESSAGES_ERREUR.INTERNAL_ERROR.message,
    'INTERNAL_ERROR',
    err?.stack || err?.message
  );
  if (contexte.requestId) controlee.requestId = contexte.requestId;
  return controlee;
}

module.exports = {
  httpError,
  logGeneration,
  MESSAGES_ERREUR,
  erreurGenerationControlee,
};
