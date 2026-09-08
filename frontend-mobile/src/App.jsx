import React, { useState } from 'react';
import { useAuth } from './auth.jsx';
import { useSettings } from './settings.jsx';
import LoginView from './components/LoginView.jsx';
import NewsView from './components/NewsView.jsx';
import GlossaryView from './components/GlossaryView.jsx';

/* Pastille segmentée des sélecteurs langue / thème (fond bleu de la topbar). */
const barSeg = (active) => ({
  background: active ? 'rgba(255, 255, 255, 0.95)' : 'transparent',
  color: active ? '#1f4e79' : 'rgba(255, 255, 255, 0.92)',
  border: '1px solid ' + (active ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.4)'),
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 12,
  fontWeight: active ? 700 : 600,
  lineHeight: 1.5,
});

/* Sélecteurs FR/EN (pastilles) + bouton unique thème clair/sombre (lune/soleil). */
function DisplayControls() {
  const { lang, setLang, setTheme, isDark, t } = useSettings();

  const labelStyle = { fontSize: 11, fontWeight: 600, opacity: 0.9 };
  const buttonsStyle = { display: 'inline-flex', gap: 4 };
  const themeBtn = {
    background: 'rgba(255,255,255,0.16)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.5)',
    borderRadius: 999,
    width: 36,
    height: 36,
    fontSize: 18,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  function toggleTheme() {
    setTheme(isDark ? 'light' : 'dark');
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '6px 10px',
        marginLeft: 'auto',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={labelStyle}>{t('settings.language')}</span>
        <span style={buttonsStyle}>
          <button
            type="button"
            aria-pressed={lang === 'fr'}
            onClick={() => setLang('fr')}
            style={barSeg(lang === 'fr')}
          >
            FR
          </button>
          <button
            type="button"
            aria-pressed={lang === 'en'}
            onClick={() => setLang('en')}
            style={barSeg(lang === 'en')}
          >
            EN
          </button>
        </span>
      </span>
      <button
        type="button"
        onClick={toggleTheme}
        style={themeBtn}
        aria-label={t('settings.toggleTheme')}
        title={isDark ? t('settings.themeLight') : t('settings.themeDark')}
      >
        {isDark ? '☀' : '☾'}
      </button>
    </span>
  );
}

/**
 * Coquille connectée : barre haute (marque, langue/thème, déconnexion) +
 * onglets News / Glossaire, puis le contenu de l'onglet actif.
 */
function MobileShell() {
  const { user, logout } = useAuth();
  const { t } = useSettings();
  const [tab, setTab] = useState('news'); // 'news' | 'glossary'
  const [refreshTick, setRefreshTick] = useState(0);

  const isNews = tab === 'news';
  const title = isNews ? t('news.news') : t('glossary.title');

  return (
    <div className="app-mobile">
      <div className="shell-sticky">
        <header className="topbar">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px 10px',
              width: '100%',
            }}
          >
            <div className="topbar-title">
              <span className="logo-mark small">GO</span>
              <div>
                <strong>{title}</strong>
                <small>{user?.email}</small>
              </div>
            </div>
            <div className="topbar-actions">
              {isNews ? (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setRefreshTick((x) => x + 1)}
                  aria-label={t('news.refresh')}
                >
                  ⟳
                </button>
              ) : null}
              <button type="button" className="icon-btn" onClick={logout} aria-label={t('app.logout')}>
                ⎋
              </button>
            </div>
            <DisplayControls />
          </div>
        </header>
        <nav className="tabsbar" role="tablist" aria-label={t('app.tabs')}>
          <button
            type="button"
            role="tab"
            aria-selected={isNews}
            className={'shell-tab' + (isNews ? ' active' : '')}
            onClick={() => setTab('news')}
          >
            {t('news.news')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isNews}
            className={'shell-tab' + (!isNews ? ' active' : '')}
            onClick={() => setTab('glossary')}
          >
            {t('glossary.title')}
          </button>
        </nav>
      </div>

      {isNews ? <NewsView refreshTick={refreshTick} /> : <GlossaryView />}
    </div>
  );
}

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
  return <MobileShell />;
}
