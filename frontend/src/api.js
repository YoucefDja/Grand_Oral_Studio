/**
 * Client API — tous les appels passent par le backend Express via VITE_API_URL.
 * Le token JWT (auth) est automatiquement attaché en `Authorization: Bearer`.
 */

import { MESSAGE_GENERIQUE } from './messagesErreur.js';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// --- Gestion de l'authentification persistée (token + user) ---
const AUTH_KEY = 'grand_oral_studio_auth';

export function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    return null;
  }
}

export function storeAuth({ token, user }) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user: user || null }));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

export function apiUrl(path) {
  return `${BASE}${path}`;
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const auth = getAuth();
  const authHeader = auth && auth.token ? { Authorization: `Bearer ${auth.token}` } : {};
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeader, ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      `Impossible de joindre le serveur (${BASE || 'même origine — aucune VITE_API_URL définie'}). ` +
        `VITE_API_URL est figée au build : si vous venez de l'ajouter sur Railway, redéployez le frontend. ` +
        `L'URL doit être complète (https://…), sans slash final, et orthographiée exactement VITE_API_URL (majuscules). ` +
        `Côté backend, vérifiez que FRONTEND_URL vaut le domaine exact du frontend.`
    );
  }

  if (!res.ok) {
    const err = await messageErreur(res);
    // Session expirée → on nettoie la session locale (sauf sur les routes publiques de login).
    if (
      res.status === 401 &&
      !path.startsWith('/api/auth/login') &&
      !path.startsWith('/api/auth/accept-invite')
    ) {
      clearAuth();
      window.dispatchEvent(new Event('grand_oral_studio:logout'));
    }
    throw err;
  }
  return res;
}

/**
 * Construit le message d'erreur à partir d'une réponse HTTP en échec, en
 * n'essayant de parser du JSON QUE si le serveur annonce du JSON.
 *
 * Objectif : ne jamais tenter de parser un body vide, du HTML (page d'erreur
 * d'un proxy) ou une réponse tronquée — ce qui produirait une exception de
 * parsing côté navigateur et masquerait la vraie cause.
 *
 * Le code applicatif (`error.code`) est attaché à l'erreur pour que l'appelant
 * puisse mapper un message utilisateur, sans jamais exposer de détail technique.
 * Le `requestId` serveur (`error.requestId`, sinon header `X-Request-Id`) est
 * attaché lui aussi : il permet au candidat de citer une référence précise pour
 * retrouver la tentative dans les logs, sans rien divulguer d'autre.
 * La fonction renvoie toujours une `Error` (jamais une chaîne), pour que
 * `err.code` survive jusqu'au composant.
 */
export async function messageErreur(res) {
  const requestIdHeader = (res.headers.get('X-Request-Id') || '').trim();
  const contentType = res.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    const err = new Error(MESSAGE_GENERIQUE);
    if (requestIdHeader) err.requestId = requestIdHeader;
    return err;
  }
  try {
    const data = await res.json();
    if (data && data.error && typeof data.error.message === 'string') {
      const err = new Error(data.error.message);
      if (typeof data.error.code === 'string') err.code = data.error.code;
      // Prérequis manquants (ex. SUPPORT_NOT_READY) : transmis tel quel pour
      // que l'UI affiche une checklist française et un bouton de retour.
      if (Array.isArray(data.error.missing)) err.missing = data.error.missing;
      const requestId =
        typeof data.error.requestId === 'string' && data.error.requestId.trim()
          ? data.error.requestId.trim()
          : requestIdHeader;
      if (requestId) err.requestId = requestId;
      return err;
    }
    if (data && typeof data.message === 'string') {
      const err = new Error(data.message);
      if (requestIdHeader) err.requestId = requestIdHeader;
      return err;
    }
  } catch {
    /* body vide ou JSON invalide → message générique */
  }
  const err = new Error(MESSAGE_GENERIQUE);
  if (requestIdHeader) err.requestId = requestIdHeader;
  return err;
}

export const api = {
  get: (path) => request(path).then((r) => r.json()),
  post: (path, body) => request(path, { method: 'POST', body }).then((r) => r.json()),
  put: (path, body) => request(path, { method: 'PUT', body }).then((r) => r.json()),
  patch: (path, body) => request(path, { method: 'PATCH', body }).then((r) => r.json()),
  del: (path) => request(path, { method: 'DELETE' }).then((r) => r.json()),
};

/**
 * Télécharge le prompt .md de l'étape 6.
 *  - `support-pptx-prompt` : Claude Desktop fabrique directement le .pptx
 *    (le document embarque la charte visuelle complète).
 */
export async function downloadSupportPrompt(
  sessionId,
  fallbackName = 'support-etape-6-generation-pptx-claude.md',
  endpoint = 'support-pptx-prompt'
) {
  const auth = getAuth();
  let res;
  try {
    res = await fetch(apiUrl(`/api/sessions/${sessionId}/${endpoint}`), {
      method: 'GET',
      headers: auth && auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
    });
  } catch {
    throw new Error('Impossible de joindre le serveur pour l’export du prompt.');
  }
  if (!res.ok) {
    const err = await messageErreur(res);
    if (res.status === 401) {
      clearAuth();
      window.dispatchEvent(new Event('grand_oral_studio:logout'));
    }
    throw err;
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/);
  let fileName = fallbackName;
  if (encoded) {
    try {
      fileName = decodeURIComponent(encoded[1]);
    } catch {
      fileName = fallbackName;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return fileName;
}

/** Télécharge le rapport de vérification (.md) produit avant l'export des fichiers Markdown. */
export async function downloadVerificationReport(
  sessionId,
  fallbackName = 'rapport-verification.md'
) {
  return downloadSupportPrompt(sessionId, fallbackName, 'support-conformite-rapport');
}

/** Télécharge le .pptx généré par le backend (route protégée). */
export async function downloadPptx(sessionId, fallbackName = 'presentation-grand-oral.pptx') {
  const auth = getAuth();
  let res;
  try {
    res = await fetch(apiUrl(`/api/sessions/${sessionId}/export-pptx`), {
      method: 'POST',
      headers: auth && auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
    });
  } catch {
    throw new Error('Impossible de joindre le serveur pour l’export .pptx.');
  }
  if (!res.ok) {
    const err = await messageErreur(res);
    if (res.status === 401) {
      clearAuth();
      window.dispatchEvent(new Event('grand_oral_studio:logout'));
    }
    throw err;
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/);
  let fileName = fallbackName;
  if (encoded) {
    try {
      fileName = decodeURIComponent(encoded[1]);
    } catch {
      fileName = fallbackName;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return fileName;
}
