import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { user, initializing, acceptInvite } = useAuth();
  const { t } = useSettings();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  if (initializing) return <p className="muted">{t('common.loading')}</p>;
  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t('invite.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('invite.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await acceptInvite(token, password);
      setDone(true);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div style={{ maxWidth: 440, margin: '40px auto' }}>
        <div className="card panel">
          <h1 className="page-title">{t('invite.invalidTitle')}</h1>
          <div className="alert alert-error">{t('invite.invalidMessage')}</div>
          <Link to="/login">← {t('invite.backToLogin')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 440, margin: '40px auto' }}>
      <div className="card panel">
        <h1 className="page-title">{t('invite.title')}</h1>
        <p className="muted">{t('invite.intro')}</p>
        {done ? (
          <div className="alert alert-success">{t('invite.success')}</div>
        ) : null}
        <form onSubmit={handleSubmit}>
          <label className="field">
            {t('invite.passwordLabel')}
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="field">
            {t('invite.confirmLabel')}
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <button type="submit" className="btn-primary" disabled={busy || !password || !confirm}>
            {busy ? t('invite.activating') : t('invite.activate')}
          </button>
        </form>
      </div>
    </div>
  );
}
