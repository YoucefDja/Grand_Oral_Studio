import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';

/**
 * Onglet Glossaire de la PWA — termes & acronymes cumulés (sans doublon)
 * depuis les glossaires de session de l'utilisateur connecté (côté site web).
 * Contenu seul : la barre haute (titre, langue/thème, déconnexion) est gérée
 * par la coquille MobileShell.
 */
export default function GlossaryView() {
  const { t } = useSettings();
  const [termes, setTermes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/glossaire');
      setTermes(Array.isArray(data.termes) ? data.termes : []);
      setError(null);
    } catch (err) {
      setError(err.message || tRef.current('glossary.loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="content">
      <h1 className="page-title">{t('glossary.pageTitle')}</h1>
      <p className="muted" style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.5 }}>
        {t('glossary.subtitle')}
      </p>

      {error ? (
        <div className="alert alert-error">
          {error}
          <button type="button" className="btn-ghost" onClick={load}>
            {t('news.retry')}
          </button>
        </div>
      ) : null}

      {loading ? <p className="muted">{t('glossary.loading')}</p> : null}
      {!loading && termes.length === 0 && !error ? (
        <div className="empty">{t('glossary.empty')}</div>
      ) : null}

      {!loading && termes.length > 0 ? (
        <ul className="glossary-list">
          {termes.map((entry) => (
            <li key={entry.terme}>
              <strong>{entry.terme}</strong>
              <p>{entry.definition || t('glossary.noDefinition')}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
