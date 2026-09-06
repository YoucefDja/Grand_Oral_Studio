import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function dateFr(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ArticleCard({ article, onOpen, t }) {
  return (
    <article className="news-card">
      <div className="news-card-head">
        {article.sourceName ? <span className="badge badge-progress">{article.sourceName}</span> : null}
        {article.category ? <span className="badge news-cat">{article.category}</span> : null}
        {Array.isArray(article.themes) && article.themes.length ? (
          <span className="badge news-theme">{article.themes.join(' · ')}</span>
        ) : null}
        {article.publishedAt ? <span className="muted news-date">{dateFr(article.publishedAt)}</span> : null}
      </div>
      <h3 className="news-title">
        <button type="button" className="news-title-btn" onClick={() => onOpen(article._id)}>
          {article.title}
        </button>
      </h3>
      {article.resume ? <p className="muted news-resume">{article.resume}</p> : null}
      <div className="news-foot">
        <button type="button" className="news-link btn-link" onClick={() => onOpen(article._id)}>
          {t('news.readInApp')}
        </button>
        {article.sourceUrl ? (
          <span className="muted">{t('news.sourceLabel')} {article.sourceName} ({hostOf(article.sourceUrl)})</span>
        ) : null}
      </div>
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
    <section className="card panel news-reader">
      <button type="button" className="btn-ghost" onClick={onBack}>
        ← {t('reader.backToList')}
      </button>

      <div className="news-card-head" style={{ marginTop: 14 }}>
        {article.sourceName ? <span className="badge badge-progress">{article.sourceName}</span> : null}
        {article.category ? <span className="badge news-cat">{article.category}</span> : null}
        {Array.isArray(article.themes) && article.themes.length ? (
          <span className="badge news-theme">{article.themes.join(' · ')}</span>
        ) : null}
        {article.publishedAt ? <span className="muted news-date">{dateFr(article.publishedAt)}</span> : null}
      </div>

      <h1 className="reader-title">{article.title}</h1>
      {article.translated ? (
        <p className="muted" style={{ marginTop: 0 }}>
          {t('reader.translatedFrom')}
        </p>
      ) : null}
      {article.resume ? <p className="reader-lead">{article.resume}</p> : null}

      {paragraphs.length ? (
        <div className="reader-body">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : (
        <p className="muted">{t('reader.contentUnavailable')}</p>
      )}

      <div className="reader-foot">
        {Array.isArray(article.tags) && article.tags.length ? (
          <p className="muted">
            {t('reader.tagsLabel')} {article.tags.map((x) => `#${x}`).join(' ')}
          </p>
        ) : null}
        <p className="muted">
          {t('reader.originalSourceLabel')}{' '}
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            {hostOf(article.url)} ↗
          </a>
        </p>
      </div>
    </section>
  );
}

function GlossaryBlock({ glossaire, t }) {
  if (!glossaire || !Array.isArray(glossaire.items) || glossaire.items.length === 0) return null;
  return (
    <section className="card panel">
      <h2 style={{ marginTop: 0 }}>{t('news.glossaryTitle')}</h2>
      <p className="muted">
        {t('news.glossarySubA')} — {t('news.glossarySubB')} {dateFr(glossaire.date)}.
      </p>
      <ul className="news-glossary">
        {glossaire.items.map((item, i) => (
          <li key={i}>
            <strong className="term">
              {item.acronyme ? `${item.acronyme} — ` : ''}
              {item.terme}
            </strong>
            <p>{item.explication}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function NewsPage() {
  const { t, lang } = useSettings();
  const [articles, setArticles] = useState([]);
  const [glossaire, setGlossaire] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [reader, setReader] = useState(null);
  const [readerLoading, setReaderLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/news?limit=60');
      setArticles(Array.isArray(data.articles) ? data.articles : []);
      setGlossaire(data.glossaire || null);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Retour liste : on rafraîchit doucement (aucun état local à perdre).
  function goBack() {
    setSelectedId(null);
    setReader(null);
  }

  async function openArticle(id) {
    setSelectedId(id);
    setReader(null);
    setReaderLoading(true);
    try {
      const article = await api.get(`/api/news/articles/${id}?lang=${lang}`);
      setReader(article);
    } catch (err) {
      setError(err.message);
      setSelectedId(null);
    } finally {
      setReaderLoading(false);
    }
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 0 }}>{t('news.title')}</h1>
      <p className="page-subtitle">{t('news.subtitle')}</p>

      {error ? (
        <div className="alert alert-error">
          {error}
          <button type="button" className="btn-danger" style={{ marginLeft: 12 }} onClick={() => setError(null)}>
            {t('common.close')}
          </button>
        </div>
      ) : null}

      {selectedId && reader ? (
        <div style={{ marginTop: 16 }}>
          <ArticleReader article={reader} onBack={goBack} />
        </div>
      ) : (
        <div className="news-layout">
          <div>
            {loading ? <p className="muted">{t('news.loadingArticles')}</p> : null}
            {readerLoading ? <p className="muted">{t('news.loadingArticle')}</p> : null}
            {!loading && articles.length === 0 ? (
              <div className="empty">{t('news.emptyArticles')}</div>
            ) : null}
            {articles.map((a) => (
              <ArticleCard key={a._id || a.url} article={a} onOpen={openArticle} t={t} />
            ))}
          </div>
          <aside>
            <GlossaryBlock glossaire={glossaire} t={t} />
          </aside>
        </div>
      )}
    </div>
  );
}
