import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

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

function ArticleCard({ article, onOpen }) {
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
      {article.resume ? <p className="news-resume">{article.resume}</p> : null}
      <button type="button" className="news-link-btn" onClick={() => onOpen(article._id)}>
        Lire dans l'app →
      </button>
    </article>
  );
}

function ArticleReader({ article, onBack }) {
  const paragraphs = String(article.content || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <main className="content">
      <button type="button" className="btn-ghost" onClick={onBack}>
        ← Retour aux articles
      </button>

      <div className="news-card-head reader-head">
        {article.sourceName ? <span className="badge badge-source">{article.sourceName}</span> : null}
        {article.category ? <span className="badge badge-cat">{article.category}</span> : null}
        {article.publishedAt ? <span className="news-date">{dateFr(article.publishedAt)}</span> : null}
      </div>
      {Array.isArray(article.themes) && article.themes.length ? (
        <p className="reader-themes">{article.themes.join(' · ')}</p>
      ) : null}

      <h1 className="reader-title">{article.title}</h1>
      {article.resume ? <p className="reader-lead">{article.resume}</p> : null}

      {paragraphs.length ? (
        <div className="reader-body">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : (
        <p className="muted">
          Le contenu complet de cet article n’a pas pu être récupéré. Vous pouvez consulter la source
          d’origine ci-dessous.
        </p>
      )}

      <div className="reader-foot">
        {Array.isArray(article.tags) && article.tags.length ? (
          <p className="muted">
            Tags : {article.tags.map((t) => `#${t}`).join(' ')}
          </p>
        ) : null}
        <p className="muted">
          Source d’origine :{' '}
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            {hostOf(article.url) || 'site d’origine'} ↗
          </a>
        </p>
      </div>
    </main>
  );
}

function Glossary({ glossaire }) {
  if (!glossaire || !Array.isArray(glossaire.items) || glossaire.items.length === 0) return null;
  const [open, setOpen] = useState(false);
  return (
    <section className="glossary">
      <button type="button" className="glossary-head" onClick={() => setOpen((v) => !v)}>
        <span>
          <strong>Acronymes &amp; termes du jour</strong>
          <small>{dateFr(glossaire.date)}</small>
        </span>
        <span className={`chevron ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open ? (
        <ul className="glossary-list">
          {glossaire.items.map((item, i) => (
            <li key={i}>
              <strong>
                {item.acronyme ? `${item.acronyme} — ` : ''}
                {item.terme}
              </strong>
              <p>{item.explication}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default function NewsView() {
  const { user, logout } = useAuth();
  const [articles, setArticles] = useState([]);
  const [glossaire, setGlossaire] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [reader, setReader] = useState(null);
  const [readerLoading, setReaderLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/news?limit=50');
      setArticles(Array.isArray(data.articles) ? data.articles : []);
      setGlossaire(data.glossaire || null);
      setError(null);
    } catch (err) {
      setError(err.message || 'Impossible de charger les articles.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    await load();
  }

  function goBack() {
    setReader(null);
  }

  async function openArticle(id) {
    setReaderLoading(true);
    setReader(null);
    try {
      const article = await api.get(`/api/news/articles/${id}`);
      setReader(article);
    } catch (err) {
      setError(err.message || 'Impossible de charger l’article.');
    } finally {
      setReaderLoading(false);
    }
  }

  return (
    <div className="app-mobile">
      <header className="topbar">
        <div className="topbar-title">
          <span className="logo-mark small">GO</span>
          <div>
            <strong>{reader ? 'Article' : 'News'}</strong>
            <small>{user?.email}</small>
          </div>
        </div>
        <div className="topbar-actions">
          {!reader ? (
            <button
              type="button"
              className="icon-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Actualiser"
            >
              {refreshing ? <span className="spin" /> : '⟳'}
            </button>
          ) : null}
          <button type="button" className="icon-btn" onClick={logout} aria-label="Se déconnecter">
            ⎋
          </button>
        </div>
      </header>

      {readerLoading ? (
        <main className="content">
          <p className="muted">Chargement de l’article…</p>
        </main>
      ) : reader ? (
        <ArticleReader article={reader} onBack={goBack} />
      ) : (
        <main className="content">
          <h1 className="page-title">Veille IA &amp; Big Data</h1>

          {error ? (
            <div className="alert alert-error">
              {error}
              <button type="button" className="btn-ghost" onClick={handleRefresh}>
                Réessayer
              </button>
            </div>
          ) : null}

          <Glossary glossaire={glossaire} />

          {loading ? <p className="muted">Chargement des articles…</p> : null}
          {!loading && articles.length === 0 && !error ? (
            <div className="empty">
              Aucun article pour le moment. La collecte quotidienne n’a pas encore tourné — réessayez
              plus tard.
            </div>
          ) : null}

          <div className="news-list">
            {articles.map((a) => (
              <ArticleCard key={a._id || a.url} article={a} onOpen={openArticle} />
            ))}
          </div>

          {!loading && articles.length > 0 ? (
            <button type="button" className="btn-ghost load-more" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Actualisation…' : '⟳ Actualiser'}
            </button>
          ) : null}
        </main>
      )}
    </div>
  );
}
