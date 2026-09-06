import React from 'react';
import { useAuth } from './auth.jsx';
import { useSettings } from './settings.jsx';
import LoginView from './components/LoginView.jsx';
import NewsView from './components/NewsView.jsx';

export default function App() {
  const { user, initializing } = useAuth();
  const { t } = useSettings();

  if (initializing) {
    return (
      <div className="screen-center">
        <span className="spin" />
        <p className="muted">{t('app.loading')}</p>
      </div>
    );
  }

  if (!user) return <LoginView />;
  return <NewsView />;
}
