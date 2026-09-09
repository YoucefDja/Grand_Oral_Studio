import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { STEPS } from '../steps.js';

function stepLabelOf(session, t) {
  const done = Number(session.currentStep || 0);
  if (done >= STEPS.length) return t('home.finishedBadge');
  return `${STEPS[done].label}`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, lang } = useSettings();
  const [themes, setThemes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({ titre: '', theme: '', contexte: '' });
  const [ideas, setIdeas] = useState([]);
  const [ideasLoading, setIdeasLoading] = useState(false);

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

  async function handleGenerateIdeas() {
    if (!form.theme || ideasLoading) return;
    setIdeasLoading(true);
    setError(null);
    try {
      const data = await api.post('/api/sessions/ideas', {
        theme: form.theme,
        contexte: form.contexte,
        nb: 3,
        lang,
      });
      setIdeas(Array.isArray(data.sujets) ? data.sujets : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIdeasLoading(false);
    }
  }

  function pickIdea(sujet) {
    setForm((prev) => ({ ...prev, titre: sujet }));
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
    if (!window.confirm(t('home.confirmDelete').replace('{titre}', session.titre))) return;
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
        {user?.email
          ? `${t('home.hello')} ${user.email.split('@')[0]} 👋`
          : t('home.prepareTitle')}
      </h1>
      <p className="page-subtitle">{t('home.subtitle')}</p>

      {error ? (
        <div className="alert alert-error">
          {error}
          <button
            type="button"
            className="btn-danger"
            style={{ marginLeft: 12 }}
            onClick={() => setError(null)}
          >
            {t('common.close')}
          </button>
        </div>
      ) : null}

      <section className="card panel">
        <h2 style={{ marginTop: 0 }}>{t('home.newSession')}</h2>
        <form onSubmit={handleCreate}>
          <label className="field">
            {t('home.themeLabel')}
            <small>{t('home.ideaFirst')}</small>
            <select
              value={form.theme}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, theme: e.target.value }));
                setIdeas([]);
              }}
            >
              <option value="">{t('home.themeChoice')}</option>
              {themes.map((themeOpt) => (
                <option key={themeOpt._id} value={themeOpt.label}>
                  {themeOpt.label}
                </option>
              ))}
            </select>
          </label>

          {form.theme ? (
            <div className="ideas-box">
              {ideas.length === 0 ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleGenerateIdeas}
                  disabled={ideasLoading}
                >
                  {ideasLoading ? (
                    <>
                      <span className="spin" /> {t('home.ideaGenerating')}
                    </>
                  ) : (
                    t('home.ideaGenerate')
                  )}
                </button>
              ) : (
                <>
                  <p className="muted" style={{ margin: '0 0 8px' }}>
                    {t('home.ideaIntro').replace('{theme}', form.theme)}
                  </p>
                  <div className="ideas-list">
                    {ideas.map((sujet, idx) => (
                      <button
                        type="button"
                        key={`${idx}-${sujet}`}
                        className="btn-ghost idea-chip"
                        onClick={() => pickIdea(sujet)}
                      >
                        {sujet}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={handleGenerateIdeas}
                    disabled={ideasLoading}
                    style={{ marginTop: 10 }}
                  >
                    {ideasLoading ? (
                      <>
                        <span className="spin" /> {t('home.ideaGenerating')}
                      </>
                    ) : (
                      t('home.ideaMore')
                    )}
                  </button>
                </>
              )}
            </div>
          ) : null}

          <label className="field">
            {t('home.subjectLabel')}
            {ideas.length > 0 ? (
              <small>{t('home.subjectChosen')}</small>
            ) : null}
            <input
              type="text"
              value={form.titre}
              onChange={(e) => setForm((prev) => ({ ...prev, titre: e.target.value }))}
              placeholder={t('home.subjectPlaceholder')}
              required
            />
          </label>

          <label className="field">
            {t('home.contextLabel')}
            <small>{t('home.contextHint')}</small>
            <textarea
              value={form.contexte}
              onChange={(e) => setForm((prev) => ({ ...prev, contexte: e.target.value }))}
              placeholder={t('home.contextPlaceholder')}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={creating || !form.titre.trim()}>
            {creating ? (
              <>
                <span className="spin" /> {t('home.creating')}
              </>
            ) : (
              t('home.createAndStart')
            )}
          </button>
        </form>
      </section>

      <section>
        <h2 style={{ marginTop: 26 }}>{t('home.mySessions')}</h2>
        {loading ? <p className="muted">{t('common.loading')}</p> : null}
        {!loading && sessions.length === 0 ? (
          <div className="empty">{t('home.emptySessions')}</div>
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
                {stepLabelOf(s, t)}
              </span>
              <button
                type="button"
                className="btn-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/session/${s._id}`);
                }}
              >
                {t('home.open')}
              </button>
              <button type="button" className="btn-danger" onClick={(e) => handleDelete(e, s)}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
