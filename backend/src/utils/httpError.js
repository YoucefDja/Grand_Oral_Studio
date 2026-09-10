/** Erreur HTTP portant un statut, destinée au handler d'erreurs global. */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { httpError };
