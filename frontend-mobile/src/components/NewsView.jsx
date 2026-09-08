import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function dateFr(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function contextLine(article, t) {
  const ctx = Array.isArray(article.contexts) ? article.contexts[0] : null;
  if (!ctx) return null;
  return (
    <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.45, margin: '0 0 8px' }}>
      <strong>{t('news.veilleFor')}</strong> « {ctx.sessionTitle} »
      {ctx.problematique ? <> — <em>{ctx.problematique}</em></> : null}
    </p>
  );
}

function ArticleCard({ article, onOpen }) {
  const { t } = useSettings();
  return (
    <article className="news-card">
      <div className="news-card-head">
        {article.sourceName ? <span className="badge badge-source">{article.sourceName}</span> : null}
        {article.category ? <span className="badge badge-cat">{article.category}</span> : null}
        {article.publishedAt ? <span className="news-date">{dateFr(article.publishedAt)}</span> : null}
      </div>
      <h3 className="news-title">
        <button type="button" className="news-title-btn" onClick={() => onOpen(article._id)}>
          {article.title}
        </button>
      </h3>
      {contextLine(article, t)}
      {article.resume ? <p className="news-resume">{article.resume}</p> : null}
      <button type="button" className="news-link-btn" onClick={() => onOpen(article._id)}>
        {t('news.readInApp')}
      </button>
    </article>
  );
}

function ArticleReader({ article, onBack }) {
  const { t } = useSettings();
  const paragraphs = String(article.content || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <main className="content">
      <button type="button" className="btn-ghost" onClick={onBack}>
        ← {t('reader.back')}
      </button>

      <div className="news-card-head reader-head">
        {article.sourceName ? <span className="badge badge-source">{article.sourceName}</span> : null}
        {article.category ? <span className="badge badge-cat">{article.category}</span> : null}
        {article.publishedAt ? <span className="news-date">{dateFr(article.publishedAt)}</span> : null}
      </div>
      {Array.isArray(article.themes) && article.themes.length ? (
        <p className="reader-themes">{article.themes.join(' · ')}</p>
      ) : null}

      {article.translated ? (
        <p className="muted" style={{ fontSize: 12, fontStyle: 'italic', margin: '0 0 8px' }}>
          {t('reader.translatedFrom')}
        </p>
      ) : null}
      {contextLine(article, t)}

      <h1 className="reader-title">{article.title}</h1>
      {article.resume ? <p className="reader-lead">{article.resume}</p> : null}

      {paragraphs.length ? (
        <div className="reader-body">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : (
        <p className="muted">{t('reader.unavailable')}</p>
      )}

      <div className="reader-foot">
        {Array.isArray(article.tags) && article.tags.length ? (
          <p className="muted">
            {t('reader.tagsLabel')} {article.tags.map((tag) => `#${tag}`).join(' ')}
          </p>
        ) : null}
        <p className="muted">
          {t('reader.sourceLabel')}{' '}
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            {hostOf(article.url) || t('reader.siteOrigin')} ↗
          </a>
        </p>
      </div>
    </main>
  );
}

/**
 * Onglet News de la PWA — contenu seul (liste + lecteur intégré).
 * La barre haute (titre, langue/thème, déconnexion) vit dans la coquille
 * MobileShell ; `refreshTick` y est incrémenté pour forcer un rechargement.
 */
export default function NewsView({ refreshTick = 0 }) {
  const { lang, t } = useSettings();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [reader, setReader] = useState(null);
  const [readerLoading, setReaderLoading] = useState(false);

  // Traduit les messages de repli avec la langue courante, sans redéclencher
  // load() (mémorisé via useCallback([])) à chaque changement de langue.
  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/news?limit=50');
      setArticles(Array.isArray(data.articles) ? data.articles : []);
      setError(null);
    } catch (err) {
      setError(err.message || tRef.current('news.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const reload = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    await load();
  }, [load]);

  // Au montage, puis à chaque demande de rafraîchissement de la barre haute.
  useEffect(() => {
    reload();
  }, [reload, refreshTick]);

  function goBack() {
    setReader(null);
  }

  async function openArticle(id) {
    setReaderLoading(true);
    setReader(null);
    try {
      const article = await api.get(`/api/news/articles/${id}?lang=${lang}`);
      setReader(article);
    } catch (err) {
      setError(err.message || tRef.current('reader.loadError'));
    } finally {
      setReaderLoading(false);
    }
  }

  if (readerLoading) {
    return (
      <main className="content">
        <p className="muted">{t('reader.loading')}</p>
      </main>
    );
  }

  if (reader) {
    return <ArticleReader article={reader} onBack={goBack} />;
  }

  return (
    <div className="content">
      <h1 className="page-title">{t('news.pageTitle')}</h1>

      {error ? (
        <div className="alert alert-error">
          {error}
          <button type="button" className="btn-ghost" onClick={reload}>
            {t('news.retry')}
          </button>
        </div>
      ) : null}

      {loading ? <p className="muted">{t('news.loading')}</p> : null}
      {!loading && articles.length === 0 && !error ? (
        <div className="empty">{t('news.empty')}</div>
      ) : null}

      <div className="news-list">
        {articles.map((a) => (
          <ArticleCard key={a._id || a.url} article={a} onOpen={openArticle} />
        ))}
      </div>

      {!loading && articles.length > 0 ? (
        <button type="button" className="btn-ghost load-more" onClick={reload} disabled={refreshing}>
          {refreshing ? t('news.refreshing') : `⟳ ${t('news.refresh')}`}
        </button>
      ) : null}
    </div>
  );
}
