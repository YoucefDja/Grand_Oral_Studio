import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import HomePage from './components/HomePage.jsx';
import WorkspacePage from './components/WorkspacePage.jsx';
import AdminPage from './components/AdminPage.jsx';
import LoginPage from './components/LoginPage.jsx';
import AcceptInvitePage from './components/AcceptInvitePage.jsx';
import NewsPage from './components/NewsPage.jsx';

function Header() {
  const { user, logout } = useAuth();
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
            <small>Préparation au Grand Oral CESI</small>
          </span>
        </Link>
        <nav className="app-nav" style={{ alignItems: 'center' }}>
          {user ? (
            <>
              <Link to="/">Mes sessions</Link>
              <Link to="/news">News</Link>
              {user.role === 'admin' ? <Link to="/admin">Administration</Link> : null}
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
                {user.email} · {user.role === 'admin' ? 'admin' : 'utilisateur'}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', padding: '6px 12px', fontSize: 13 }}
              >
                Se déconnecter
              </button>
            </>
          ) : (
            <Link to="/login">Se connecter</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

/** Garde d'accès : connexion requise (+ rôle admin si demandé). */
function RequireAuth({ children, admin = false }) {
  const { user, initializing } = useAuth();
  if (initializing) {
    return <p className="muted">Chargement…</p>;
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
