import { Routes, Route, Navigate, Link } from 'react-router-dom';
import HomePage from './components/HomePage.jsx';
import WorkspacePage from './components/WorkspacePage.jsx';
import AdminPage from './components/AdminPage.jsx';

function Header() {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">T</span>
          <span>
            <strong>Tension</strong>
            <small>Préparation au Grand Oral CESI</small>
          </span>
        </Link>
        <nav className="app-nav">
          <Link to="/">Mes sessions</Link>
          <Link to="/admin">Administration</Link>
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/:id" element={<WorkspacePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
