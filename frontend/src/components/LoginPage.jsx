import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function LoginPage() {
  const { user, initializing, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (initializing) return <p className="muted">Chargement…</p>;
  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 440, margin: '40px auto' }}>
      <div className="card panel">
        <h1 className="page-title">Connexion</h1>
        <p className="muted">
          Les comptes sont créés par l’administrateur : vous recevez un e-mail d’invitation pour
          configurer votre mot de passe.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="field">
            E-mail
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
              required
            />
          </label>
          <label className="field">
            Mot de passe
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <button type="submit" className="btn-primary" disabled={busy || !email.trim() || !password}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          Compte administrateur initial : l’e-mail défini par <code>ADMIN_EMAIL</code> et le mot de
          passe <code>ADMIN_PASSWORD</code> (configurés sur le backend).{' '}
          <Link to="/">← Retour à l’accueil</Link>
        </p>
      </div>
    </div>
  );
}
