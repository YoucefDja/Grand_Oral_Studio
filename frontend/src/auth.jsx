import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getAuth, storeAuth, clearAuth } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const saved = getAuth();
      if (saved && saved.token) {
        try {
          const { user: me } = await api.get('/api/auth/me');
          if (cancelled) return;
          storeAuth({ token: saved.token, user: me });
          setUser(me);
        } catch {
          if (!cancelled) {
            clearAuth();
            setUser(null);
          }
        }
      }
      if (!cancelled) setInitializing(false);
    }
    init();

    function onLogout() {
      setUser(null);
    }
    window.addEventListener('tension:logout', onLogout);
    return () => {
      cancelled = true;
      window.removeEventListener('tension:logout', onLogout);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password });
    storeAuth(data);
    setUser(data.user);
    return data.user;
  }, []);

  const acceptInvite = useCallback(async (token, password) => {
    const data = await api.post('/api/auth/accept-invite', { token, password });
    storeAuth(data);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const saved = getAuth();
    if (!saved || !saved.token) return null;
    try {
      const { user: me } = await api.get('/api/auth/me');
      storeAuth({ token: saved.token, user: me });
      setUser(me);
      return me;
    } catch {
      clearAuth();
      setUser(null);
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, initializing, login, logout, acceptInvite, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>.');
  return ctx;
}
