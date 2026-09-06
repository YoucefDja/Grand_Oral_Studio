/**
 * Client API — mêmes endpoints que le site web (backend Express partagé).
 * Le token JWT (auth) est attaché en `Authorization: Bearer` et persisté.
 */

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

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

function apiUrl(path) {
  return `${BASE}${path}`;
}

async function request(path, { method = 'GET', body } = {}) {
  const auth = getAuth();
  const authHeader = auth && auth.token ? { Authorization: `Bearer ${auth.token}` } : {};
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      'Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.'
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
    if (res.status === 401 && !path.startsWith('/api/auth/login')) {
      clearAuth();
      window.dispatchEvent(new Event('grand_oral_studio:logout'));
    }
    throw new Error(message);
  }
  return res;
}

export const api = {
  get: (path) => request(path).then((r) => r.json()),
  post: (path, body) => request(path, { method: 'POST', body }).then((r) => r.json()),
};
