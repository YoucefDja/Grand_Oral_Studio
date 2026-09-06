import React from 'react';
import { useAuth } from './auth.jsx';
import LoginView from './components/LoginView.jsx';
import NewsView from './components/NewsView.jsx';

export default function App() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <div className="screen-center">
        <span className="spin" />
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  if (!user) return <LoginView />;
  return <NewsView />;
}
