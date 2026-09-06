import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';

export default function LoginPage() {
  const { user, initializing, login } = useAuth();
  const { t } = useSettings();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (initializing) return <p className="muted">{t('common.loading')}</p>;
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
        <h1 className="page-title">{t('login.title')}</h1>
        <p className="muted">{t('login.intro')}</p>
        <form onSubmit={handleSubmit}>
          <label className="field">
            {t('login.emailLabel')}
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('login.emailPlaceholder')}
              required
            />
          </label>
          <label className="field">
            {t('login.passwordLabel')}
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
            {busy ? t('login.signingIn') : t('login.submit')}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          <Link to="/">← {t('login.backHome')}</Link>
        </p>
      </div>
    </div>
  );
}
