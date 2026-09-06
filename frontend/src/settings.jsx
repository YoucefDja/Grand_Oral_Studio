/**
 * Réglages d'affichage (langue + thème clair/sombre) pour l'application web.
 *
 * - Langue : 'fr' | 'en' — interface (boutons, libellés, navigation). Le contenu
 *   IA du parcours Grand Oral reste en français (contenu pédagogique).
 * - Thème : 'light' | 'dark' | 'system' — 'system' suit l'appareil.
 *
 * Persistance : localStorage pour répondre instantanément (même hors connexion),
 * + synchronisation sur le profil du compte (PUT /api/auth/profile) afin que le
 * choix soit partagé entre le site web et l'app mobile.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from './auth.jsx';
import { api } from './api.js';
import { LOCALES } from './locales.js';

const SettingsContext = createContext(null);

const KEY_LANG = 'gos_lang';
const KEY_THEME = 'gos_theme';

const LANGS = ['fr', 'en'];
const THEMES = ['light', 'dark', 'system'];

function readLS(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage indisponible (navigation privée…) */
  }
}

function systemPrefersDark() {
  try {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch {
    return false;
  }
}

export function resolveTheme(theme) {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme === 'dark' ? 'dark' : 'light';
}

/** Applique l'attribut data-theme sur <html> (appelable avant le rendu React). */
export function applyThemeAttr(theme) {
  const resolved = resolveTheme(theme);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.theme = resolved;
  }
  return resolved;
}

/** À appeler au démarrage (avant React) pour éviter le flash clair/sombre. */
export function applyStoredTheme() {
  applyThemeAttr(readLS(KEY_THEME, 'system'));
}

export function SettingsProvider({ children }) {
  const { user } = useAuth();

  const [lang, setLangState] = useState(() => {
    const v = readLS(KEY_LANG, 'fr');
    return LANGS.includes(v) ? v : 'fr';
  });
  const [theme, setThemeState] = useState(() => {
    const v = readLS(KEY_THEME, 'system');
    return THEMES.includes(v) ? v : 'system';
  });

  // Référence courante pour l'écouteur media (sans recréer l'effet).
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Compte connecté → on applique ses préférences SEULEMENT si elles ont été
  // explicitement choisies. Les valeurs « système » (theme system / langue fr)
  // sont des défauts : elles n'écrasent pas un choix fait avant/après connexion
  // (sinon le dark choisi avant de se connecter serait perdu au login).
  useEffect(() => {
    if (!user) return;
    if (user.language && user.language !== 'fr') {
      setLangState(user.language);
      writeLS(KEY_LANG, user.language);
    }
    if (user.theme === 'light' || user.theme === 'dark') {
      setThemeState(user.theme);
      writeLS(KEY_THEME, user.theme);
    }
  }, [user]);

  // Application du thème + suivi du réglage système quand demandé.
  useEffect(() => {
    applyThemeAttr(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (themeRef.current === 'system') applyThemeAttr('system');
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Synchronisation silencieuse vers le compte (si connecté).
  const pushProfile = useCallback(
    async (patch) => {
      if (!user) return;
      try {
        await api.put('/api/auth/profile', patch);
      } catch {
        /* hors ligne ou serveur indisponible : le local fait foi pour la session */
      }
    },
    [user]
  );

  const setLang = useCallback(
    (next) => {
      const v = LANGS.includes(next) ? next : 'fr';
      setLangState(v);
      writeLS(KEY_LANG, v);
      pushProfile({ language: v });
    },
    [pushProfile]
  );

  const setTheme = useCallback(
    (next) => {
      const v = THEMES.includes(next) ? next : 'system';
      setThemeState(v);
      writeLS(KEY_THEME, v);
      pushProfile({ theme: v });
    },
    [pushProfile]
  );

  // Traduction : clé → texte dans la langue active, repli sur le français.
  const t = useCallback(
    (key) => {
      const dict = LOCALES[lang] || LOCALES.fr;
      const value = dict[key];
      if (typeof value === 'string' && value !== '') return value;
      const fallback = LOCALES.fr[key];
      return typeof fallback === 'string' ? fallback : key;
    },
    [lang]
  );

  const value = { lang, setLang, theme, setTheme, t, isDark: resolveTheme(theme) === 'dark' };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings doit être utilisé à l’intérieur de <SettingsProvider>.');
  return ctx;
}
