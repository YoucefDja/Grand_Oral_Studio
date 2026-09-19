/**
 * Version de l'application servie, utilisée par le diagnostic de déploiement.
 *
 * Pourquoi : en recette, il est impossible de savoir si le backend déployé
 * contient bien le dernier correctif. On expose donc une version lisible :
 *
 *   - `APP_VERSION` (recommandé) : injectée au build/deploy (ex. le SHA Git
 *     court, `railway variables`, Docker build-arg…).
 *   - `RAILWAY_GIT_COMMIT_SHA` : fournie automatiquement par Railway ; on en
 *     garde les 7 premiers caractères, comme `git rev-parse --short`.
 *   - fallback local explicite : `dev-local`.
 *
 * Aucun secret n'est jamais exposé ici : uniquement un identifiant de version.
 */

const VERSION_LOCALE = 'dev-local';

function lireVersion() {
  const explicite = (process.env.APP_VERSION || '').trim();
  if (explicite) return explicite;

  const sha = (process.env.RAILWAY_GIT_COMMIT_SHA || '').trim();
  if (sha) return sha.slice(0, 7);

  return VERSION_LOCALE;
}

const APP_VERSION = lireVersion();

/** `production` | `development` — jamais autre chose, pour rester filtrable. */
function environnement() {
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

module.exports = {
  APP_VERSION,
  VERSION_LOCALE,
  environnement,
};
