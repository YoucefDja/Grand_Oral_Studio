import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';

/**
 * Glossaire personnel — cumul des termes & acronymes définis à l'étape
 * « Glossaire » des sessions de l'utilisateur connecté (dédoublonnés).
 * Rangement par thème (sections repliables) pour retrouver vite un terme.
 */
export default function GlossaryPage() {
  const { t } = useSettings();
  const [termes, setTermes] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/glossaire');
      const list = Array.isArray(data.termes) ? data.termes : [];
      setTermes(list);
      setTotal(Number(data.total) || list.length);
      setError(null);
    } catch (err) {
      setError(err.message || t('glossary.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return termes;
    return termes.filter(
      (e) =>
        String(e.terme || '').toLowerCase().includes(q) ||
        String(e.definition || '').toLowerCase().includes(q) ||
        String(e.theme || '').toLowerCase().includes(q)
    );
  }, [termes, query]);

  // Regroupement par thème, dans l'ordre alphabétique ; « Autres » en dernier.
  const groupes = useMemo(() => {
    const map = new Map();
    for (const terme of filtered) {
      const label = String(terme.theme || '').trim();
      const key = label.toLowerCase() || '__autres__';
      if (!map.has(key)) map.set(key, { key, label, termes: [] });
      map.get(key).termes.push(terme);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (!a.label) return 1;
      if (!b.label) return -1;
      return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' });
    });
  }, [filtered]);

  const searching = Boolean(query.trim());
  const isOpen = (key) => (searching ? true : !collapsed[key]);

  return (
    <div>
      <section className="card panel" style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: '0 0 4px' }}>
          {t('glossary.pageTitle')}
        </h1>
        <p className="page-subtitle" style={{ marginBottom: 14 }}>
          {t('glossary.subtitle')}
        </p>
        <div className="glossary-toolbar">
          <input
            type="text"
            className="glossary-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('glossary.searchPlaceholder')}
          />
          <span className="badge badge-done">
            {t('glossary.count').replace('{n}', String(query ? filtered.length : total))}
          </span>
        </div>
      </section>

      {error ? (
        <div className="alert alert-error" role="alert">
          {error}{' '}
          <button type="button" className="btn-ghost" style={{ marginLeft: 10 }} onClick={load}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {loading ? <p className="muted">{t('glossary.loading')}</p> : null}

      {!loading && !error && filtered.length === 0 ? (
        <div className="empty">
          {query
            ? t('glossary.noMatch').replace('{q}', query)
            : t('glossary.empty')}
        </div>
      ) : null}

      {!loading && !error && groupes.length > 0 ? (
        <div className="glossary-groups">
          {groupes.map((groupe) => {
            const open = isOpen(groupe.key);
            return (
              <section key={groupe.key} className="glossary-group">
                <button
                  type="button"
                  className="glossary-group-head"
                  onClick={() =>
                    setCollapsed((prev) => ({ ...prev, [groupe.key]: !prev[groupe.key] }))
                  }
                  aria-expanded={open}
                >
                  <span className={`glossary-caret${open ? ' is-open' : ''}`} aria-hidden="true" />
                  <span className="glossary-group-title">
                    {groupe.label || t('glossary.otherTheme')}
                  </span>
                  <span className="badge badge-done glossary-group-count">
                    {t('glossary.groupCount').replace('{n}', String(groupe.termes.length))}
                  </span>
                </button>

                {open ? (
                  <div className="glossary-list">
                    {groupe.termes.map((entry) => (
                      <article key={entry.terme} className="obj-card">
                        <div className="obj-card-title glossary-term">{entry.terme}</div>
                        <p className="glossary-def">
                          {entry.definition || t('glossary.noDefinition')}
                        </p>
                        {Array.isArray(entry.sessions) && entry.sessions.length ? (
                          <p className="muted glossary-src">
                            {entry.sessions.length === 1
                              ? t('glossary.fromSession')
                              : t('glossary.fromSessions').replace('{n}', String(entry.sessions.length))}{' '}
                            {entry.sessions.map((s, i) => (
                              <React.Fragment key={s._id}>
                                {i > 0 ? ' · ' : null}
                                <Link to={`/session/${s._id}`} title={s.theme || s.titre}>
                                  {s.titre}
                                </Link>
                              </React.Fragment>
                            ))}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
