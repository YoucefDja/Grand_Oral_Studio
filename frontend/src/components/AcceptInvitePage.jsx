import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { user, initializing, acceptInvite } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  if (initializing) return <p className="muted">Chargement…</p>;
  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
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
          <h1 className="page-title">Lien d’invitation invalide</h1>
          <div className="alert alert-error">
            Ce lien est incomplet ou a déjà été utilisé. Demandez à votre administrateur de vous
            renvoyer une invitation.
          </div>
          <Link to="/login">← Aller à la page de connexion</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 440, margin: '40px auto' }}>
      <div className="card panel">
        <h1 className="page-title">Configurer mon mot de passe</h1>
        <p className="muted">
          Vous avez été invité(e) à utiliser Tension. Choisissez un mot de passe (8 caractères
          minimum) pour activer votre compte.
        </p>
        {done ? (
          <div className="alert alert-success">
            Compte activé. Connexion en cours…
          </div>
        ) : null}
        <form onSubmit={handleSubmit}>
          <label className="field">
            Mot de passe
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
            Confirmer le mot de passe
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
            {busy ? 'Activation…' : 'Activer mon compte'}
          </button>
        </form>
      </div>
    </div>
  );
}
