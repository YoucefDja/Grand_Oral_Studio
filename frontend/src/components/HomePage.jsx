import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STEPS } from '../steps.js';

function stepLabelOf(session) {
  const done = Number(session.currentStep || 0);
  if (done >= STEPS.length) return 'Parcours terminé — support prêt';
  return `${STEPS[done].label}`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [themes, setThemes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({ titre: '', theme: '', contexte: '' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [themesData, sessionsData] = await Promise.all([api.get('/api/themes'), api.get('/api/sessions')]);
        if (cancelled) return;
        setThemes(themesData);
        setSessions(sessionsData);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshSessions() {
    try {
      const data = await api.get('/api/sessions');
      setSessions(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.titre.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const session = await api.post('/api/sessions', {
        titre: form.titre.trim(),
        theme: form.theme,
        contexte: form.contexte.trim(),
      });
      navigate(`/session/${session._id}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  async function handleDelete(e, session) {
    e.stopPropagation();
    if (!window.confirm(`Supprimer la session « ${session.titre} » ?`)) return;
    setError(null);
    try {
      await api.del(`/api/sessions/${session._id}`);
      await refreshSessions();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1 className="page-title">
        {user?.email ? `Bonjour ${user.email.split('@')[0]} 👋` : 'Préparer un Grand Oral'}
      </h1>
      <p className="page-subtitle">
        Suivez les 6 étapes méthodologiques pour construire votre sujet, votre problématique, votre
        plan… jusqu’au support .pptx prêt pour le jury.
      </p>

      {error ? (
        <div className="alert alert-error">
          {error}
          <button
            type="button"
            className="btn-danger"
            style={{ marginLeft: 12 }}
            onClick={() => setError(null)}
          >
            Fermer
          </button>
        </div>
      ) : null}

      <section className="card panel">
        <h2 style={{ marginTop: 0 }}>Nouvelle session</h2>
        <form onSubmit={handleCreate}>
          <label className="field">
            Sujet du Grand Oral *
            <input
              type="text"
              value={form.titre}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              placeholder="Ex. Le cloud signe-t-il la fin des infrastructures sur site ?"
              required
            />
          </label>
          <div className="row-2">
            <label className="field">
              Thème
              <select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
                <option value="">— Choisir un thème —</option>
                {themes.map((t) => (
                  <option key={t._id} value={t.label}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            Contexte & expérience (entreprise, projet, motivations)
            <small>Plus il est riche, plus le contenu généré sera ancré dans votre réalité.</small>
            <textarea
              value={form.contexte}
              onChange={(e) => setForm({ ...form, contexte: e.target.value })}
              placeholder="Ex. Alternance chez …, mission sur …, expérience personnelle…"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={creating || !form.titre.trim()}>
            {creating ? (
              <>
                <span className="spin" /> Création…
              </>
            ) : (
              'Créer la session et commencer'
            )}
          </button>
        </form>
      </section>

      <section>
        <h2 style={{ marginTop: 26 }}>Mes sessions</h2>
        {loading ? <p className="muted">Chargement…</p> : null}
        {!loading && sessions.length === 0 ? (
          <div className="empty">Aucune session pour le moment. Créez-en une ci-dessus.</div>
        ) : null}
        {sessions.map((s) => (
          <div className="session-row" key={s._id} onClick={() => navigate(`/session/${s._id}`)} style={{ cursor: 'pointer' }}>
            <div>
              <strong>{s.titre}</strong>
              <div className="meta">
                {s.theme ? `${s.theme} · ` : ''}
                {s.ligneDirectrice ? <em>« {s.ligneDirectrice} »</em> : null}
              </div>
            </div>
            <div className="session-actions">
              <span className={`badge ${s.currentStep >= STEPS.length ? 'badge-done' : 'badge-progress'}`}>
                {stepLabelOf(s)}
              </span>
              <button
                type="button"
                className="btn-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/session/${s._id}`);
                }}
              >
                Ouvrir
              </button>
              <button type="button" className="btn-danger" onClick={(e) => handleDelete(e, s)}>
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
