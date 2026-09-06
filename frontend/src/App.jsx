import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useSettings } from './settings.jsx';
import HomePage from './components/HomePage.jsx';
import WorkspacePage from './components/WorkspacePage.jsx';
import AdminPage from './components/AdminPage.jsx';
import LoginPage from './components/LoginPage.jsx';
import AcceptInvitePage from './components/AcceptInvitePage.jsx';
import NewsPage from './components/NewsPage.jsx';

/** Sélecteurs langue (FR/EN) + thème (Clair/Sombre/Auto) dans l'en-tête. */
function DisplayPrefs() {
  const { lang, setLang, theme, setTheme, t } = useSettings();

  const seg = (active) => ({
    background: active ? 'rgba(255,255,255,0.92)' : 'transparent',
    color: active ? '#1f4e79' : 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(255,255,255,0.45)',
    borderRadius: 999,
    padding: '3px 9px',
    fontSize: 12,
    fontWeight: 700,
  });

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span
        title={t('settings.language')}
        style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}
      >
        <button type="button" onClick={() => setLang('fr')} style={seg(lang === 'fr')}>
          FR
        </button>
        <button type="button" onClick={() => setLang('en')} style={seg(lang === 'en')}>
          EN
        </button>
      </span>
      <span
        title={t('settings.theme')}
        style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}
      >
        <button type="button" onClick={() => setTheme('light')} style={seg(theme === 'light')}>
          {t('settings.themeLight')}
        </button>
        <button type="button" onClick={() => setTheme('dark')} style={seg(theme === 'dark')}>
          {t('settings.themeDark')}
        </button>
        <button type="button" onClick={() => setTheme('system')} style={seg(theme === 'system')}>
          {t('settings.themeSystem')}
        </button>
      </span>
    </span>
  );
}

function Header() {
  const { user, logout } = useAuth();
  const { t } = useSettings();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to={user ? '/' : '/login'} className="brand">
          <span className="brand-mark">GO</span>
          <span>
            <strong>Grand Oral Studio</strong>
            <small>{t('brand.sub')}</small>
          </span>
        </Link>
        <nav className="app-nav" style={{ alignItems: 'center' }}>
          {user ? (
            <>
              <Link to="/">{t('nav.sessions')}</Link>
              <Link to="/news">{t('nav.news')}</Link>
              {user.role === 'admin' ? <Link to="/admin">{t('nav.admin')}</Link> : null}
              <span
                className="role-chip"
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.15)',
                  fontSize: 13,
                  maxWidth: 260,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.email} · {user.role === 'admin' ? t('role.admin') : t('role.user')}
              </span>
              <DisplayPrefs />
              <button
                type="button"
                onClick={handleLogout}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', padding: '6px 12px', fontSize: 13 }}
              >
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <DisplayPrefs />
              <Link to="/login">{t('nav.login')}</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

/** Garde d'accès : connexion requise (+ rôle admin si demandé). */
function RequireAuth({ children, admin = false }) {
  const { user, initializing } = useAuth();
  const { t } = useSettings();
  if (initializing) {
    return <p className="muted">{t('common.loading')}</p>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <HomePage />
              </RequireAuth>
            }
          />
          <Route
            path="/session/:id"
            element={
              <RequireAuth>
                <WorkspacePage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth admin>
                <AdminPage />
              </RequireAuth>
            }
          />
          <Route
            path="/news"
            element={
              <RequireAuth>
                <NewsPage />
              </RequireAuth>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
