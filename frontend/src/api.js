/**
 * Client API — tous les appels passent par le backend Express via VITE_API_URL.
 * Aucun appel direct à l'API Anthropic depuis le navigateur.
 */

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export function apiUrl(path) {
  return `${BASE}${path}`;
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
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
    let message = `Erreur ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.message) message = data.message;
    } catch {
      /* réponse non JSON */
    }
    throw new Error(message);
  }
  return res;
}

export const api = {
  get: (path) => request(path).then((r) => r.json()),
  post: (path, body) => request(path, { method: 'POST', body }).then((r) => r.json()),
  patch: (path, body) => request(path, { method: 'PATCH', body }).then((r) => r.json()),
  del: (path) => request(path, { method: 'DELETE' }).then((r) => r.json()),
};

// --- Client admin (JWT en sessionStorage) ---

export function getAdminToken() {
  return sessionStorage.getItem('tension_admin_token');
}
export function setAdminToken(token) {
  if (token) sessionStorage.setItem('tension_admin_token', token);
  else sessionStorage.removeItem('tension_admin_token');
}

async function adminRequest(path, { method = 'GET', body } = {}) {
  const token = getAdminToken();
  if (!token) throw new Error('Non authentifié. Reconnectez-vous.');
  return request(path, {
    method,
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
}

export const adminApi = {
  get: (path) => adminRequest(path).then((r) => r.json()),
  put: (path, body) => adminRequest(path, { method: 'PUT', body }).then((r) => r.json()),
  post: (path, body) => adminRequest(path, { method: 'POST', body }).then((r) => r.json()),
  del: (path) => adminRequest(path, { method: 'DELETE' }).then((r) => r.json()),
};

/** Télécharge le .pptx généré par le backend. */
export async function downloadPptx(sessionId, fallbackName = 'presentation-grand-oral.pptx') {
  let res;
  try {
    res = await fetch(apiUrl(`/api/sessions/${sessionId}/export-pptx`), { method: 'POST' });
  } catch {
    throw new Error('Impossible de joindre le serveur pour l’export .pptx.');
  }
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.message) message = data.message;
    } catch {
      /* non JSON */
    }
    throw new Error(message);
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
