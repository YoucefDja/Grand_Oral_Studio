import React, { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function LoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-mark">GO</span>
          <span className="logo-text">
            <strong>Grand Oral Studio</strong>
            <small>News — veille IA &amp; Big Data</small>
          </span>
        </div>
        <p className="muted">
          Connectez-vous avec le compte que votre administrateur vous a créé pour consulter les
          articles.
        </p>

        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <label className="field">
            E-mail
            <input
              type="email"
              autoComplete="username"
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
              placeholder="••••••••"
              required
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy || !email.trim() || !password}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="muted login-hint">
          Pas de compte ? Demandez une invitation à votre administrateur (interface web).
        </p>
      </div>
    </div>
  );
}
