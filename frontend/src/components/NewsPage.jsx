import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

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

function ArticleCard({ article }) {
  const host = hostOf(article.url);
  return (
    <article className="news-card">
      <div className="news-card-head">
        {article.sourceName ? <span className="badge badge-progress">{article.sourceName}</span> : null}
        {article.category ? <span className="badge news-cat">{article.category}</span> : null}
        {article.publishedAt ? <span className="muted news-date">{dateFr(article.publishedAt)}</span> : null}
      </div>
      <h3 className="news-title">
        <a href={article.url} target="_blank" rel="noopener noreferrer">
          {article.title}
        </a>
      </h3>
      {article.resume ? <p className="muted news-resume">{article.resume}</p> : null}
      <div className="news-foot">
        <a className="news-link" href={article.url} target="_blank" rel="noopener noreferrer">
          Lire sur {host || 'la source'} ↗
        </a>
        {article.sourceUrl ? (
          <span className="muted">via {hostOf(article.sourceUrl)}</span>
        ) : null}
      </div>
    </article>
  );
}

function GlossaryBlock({ glossaire }) {
  if (!glossaire || !Array.isArray(glossaire.items) || glossaire.items.length === 0) return null;
  return (
    <section className="card panel">
      <h2 style={{ marginTop: 0 }}>Acronymes & termes techniques du jour</h2>
      <p className="muted">
        Généré quotidiennement par IA à partir de la veille du jour — glossaire du {dateFr(glossaire.date)}.
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
  const [articles, setArticles] = useState([]);
  const [glossaire, setGlossaire] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get('/api/news?limit=60');
        if (cancelled) return;
        setArticles(Array.isArray(data.articles) ? data.articles : []);
        setGlossaire(data.glossaire || null);
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

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 0 }}>News — Veille IA & Big Data</h1>
      <p className="page-subtitle">
        Articles récupérés automatiquement chaque jour depuis des sources autorisées, avec le
        glossaire technique quotidien.
      </p>

      {error ? (
        <div className="alert alert-error">
          {error}
          <button type="button" className="btn-danger" style={{ marginLeft: 12 }} onClick={() => setError(null)}>
            Fermer
          </button>
        </div>
      ) : null}

      <div className="news-layout">
        <div>
          {loading ? <p className="muted">Chargement des articles…</p> : null}
          {!loading && articles.length === 0 ? (
            <div className="empty">
              Aucun article pour le moment. La collecte quotidienne (cron) n’a pas encore tourné :
              un administrateur peut la lancer depuis Administration → News.
            </div>
          ) : null}
          {articles.map((a) => (
            <ArticleCard key={a._id || a.url} article={a} />
          ))}
        </div>
        <aside>
          <GlossaryBlock glossaire={glossaire} />
        </aside>
      </div>
    </div>
  );
}
