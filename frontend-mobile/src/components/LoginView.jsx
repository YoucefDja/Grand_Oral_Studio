import React, { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';

/* Pastille segmentée des sélecteurs langue / thème (sur carte claire). */
const cardSeg = (active) => ({
  background: active ? 'var(--cesi-primary)' : 'transparent',
  color: active ? '#fff' : 'var(--ink-soft)',
  border: '1px solid ' + (active ? 'var(--cesi-primary)' : 'var(--line)'),
  borderRadius: 999,
  padding: '3px 10px',
  fontSize: 12,
  fontWeight: active ? 700 : 600,
  lineHeight: 1.5,
});

/* Sélecteurs FR/EN + thème (Clair/Sombre/Auto), styles 100 % inline. */
function DisplayControls() {
  const { lang, setLang, theme, setTheme, t } = useSettings();

  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' };
  const groupStyle = { display: 'inline-flex', alignItems: 'center', gap: 6 };
  const buttonsStyle = { display: 'inline-flex', gap: 4 };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px 12px',
        marginBottom: 16,
      }}
    >
      <span style={groupStyle}>
        <span style={labelStyle}>{t('settings.language')}</span>
        <span style={buttonsStyle}>
          <button
            type="button"
            aria-pressed={lang === 'fr'}
            onClick={() => setLang('fr')}
            style={cardSeg(lang === 'fr')}
          >
            FR
          </button>
          <button
            type="button"
            aria-pressed={lang === 'en'}
            onClick={() => setLang('en')}
            style={cardSeg(lang === 'en')}
          >
            EN
          </button>
        </span>
      </span>
      <span style={groupStyle}>
        <span style={labelStyle}>{t('settings.theme')}</span>
        <span style={buttonsStyle}>
          <button
            type="button"
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
            style={cardSeg(theme === 'light')}
          >
            {t('settings.themeLight')}
          </button>
          <button
            type="button"
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
            style={cardSeg(theme === 'dark')}
          >
            {t('settings.themeDark')}
          </button>
          <button
            type="button"
            aria-pressed={theme === 'system'}
            onClick={() => setTheme('system')}
            style={cardSeg(theme === 'system')}
          >
            {t('settings.themeSystem')}
          </button>
        </span>
      </span>
    </div>
  );
}

export default function LoginView() {
  const { login } = useAuth();
  const { t } = useSettings();
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
      setError(err.message || t('login.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <DisplayControls />
        <div className="login-logo">
          <span className="logo-mark">GO</span>
          <span className="logo-text">
            <strong>Grand Oral Studio</strong>
            <small>{t('login.subtitle')}</small>
          </span>
        </div>
        <p className="muted">{t('login.intro')}</p>

        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <label className="field">
            {t('login.email')}
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('login.emailPlaceholder')}
              required
            />
          </label>
          <label className="field">
            {t('login.password')}
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
            {busy ? t('login.connecting') : t('login.submit')}
          </button>
        </form>

        <p className="muted login-hint">{t('login.noAccount')}</p>
      </div>
    </div>
  );
}
