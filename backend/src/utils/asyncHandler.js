/** Enveloppe d'Express pour les handlers async — les erreurs partent au handler global. */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { asyncHandler };
