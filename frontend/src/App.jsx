import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useSettings } from './settings.jsx';
import { LEGAL_CONFIG } from './legalConfig.js';
import HomePage from './components/HomePage.jsx';
import WorkspacePage from './components/WorkspacePage.jsx';
import AdminPage from './components/AdminPage.jsx';
import LoginPage from './components/LoginPage.jsx';
import AcceptInvitePage from './components/AcceptInvitePage.jsx';
import NewsPage from './components/NewsPage.jsx';
import LegalPage from './components/LegalPage.jsx';

/** Sélecteurs langue (FR/EN) + bouton unique thème clair/sombre (lune/soleil). */
function DisplayPrefs() {
  const { lang, setLang, setTheme, isDark, t } = useSettings();

  const seg = (active) => ({
    background: active ? 'rgba(255,255,255,0.92)' : 'transparent',
    color: active ? '#1f4e79' : 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(255,255,255,0.45)',
    borderRadius: 999,
    padding: '3px 9px',
    fontSize: 12,
    fontWeight: 700,
  });

  const themeBtn = {
    background: 'rgba(255,255,255,0.14)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.5)',
    borderRadius: 999,
    padding: '3px 10px',
    fontSize: 15,
    lineHeight: 1.35,
  };

  function toggleTheme() {
    setTheme(isDark ? 'light' : 'dark');
  }

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

/** Pied de page : accès aux pages légales + copyright. */
function Footer() {
  const { t } = useSettings();
  return (
    <footer className="app-footer">
      <nav className="app-footer-nav" aria-label={t('footer.legal')}>
        <Link to="/mentions-legales">{t('footer.mentions')}</Link>
        <Link to="/confidentialite">{t('footer.privacy')}</Link>
        <Link to="/cgu">{t('footer.cgu')}</Link>
      </nav>
      <p className="app-footer-copy">
        © {LEGAL_CONFIG.year} {LEGAL_CONFIG.product} — {t('footer.rights')}
      </p>
    </footer>
  );
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
          {/* Pages légales publiques (accessibles connecté ou non). */}
          <Route path="/mentions-legales" element={<LegalPage page="mentions" />} />
          <Route path="/confidentialite" element={<LegalPage page="privacy" />} />
          <Route path="/cgu" element={<LegalPage page="cgu" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
