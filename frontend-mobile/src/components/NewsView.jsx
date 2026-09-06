import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
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

/* Pastille segmentée des sélecteurs langue / thème (fond bleu de la topbar). */
const barSeg = (active) => ({
  background: active ? 'rgba(255, 255, 255, 0.95)' : 'transparent',
  color: active ? '#1f4e79' : 'rgba(255, 255, 255, 0.92)',
  border: '1px solid ' + (active ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.4)'),
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 12,
  fontWeight: active ? 700 : 600,
  lineHeight: 1.5,
});

/* Sélecteurs FR/EN + thème (Clair/Sombre/Auto), styles 100 % inline. */
function DisplayControls() {
  const { lang, setLang, theme, setTheme, t } = useSettings();

  const labelStyle = { fontSize: 11, fontWeight: 600, opacity: 0.9 };
  const groupStyle = { display: 'inline-flex', alignItems: 'center', gap: 6 };
  const buttonsStyle = { display: 'inline-flex', gap: 4 };

  return (
    <span
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '6px 10px',
        marginLeft: 'auto',
      }}
    >
      <span style={groupStyle}>
        <span style={labelStyle}>{t('settings.language')}</span>
        <span style={buttonsStyle}>
          <button
            type="button"
            aria-pressed={lang === 'fr'}
            onClick={() => setLang('fr')}
            style={barSeg(lang === 'fr')}
          >
            FR
          </button>
          <button
            type="button"
            aria-pressed={lang === 'en'}
            onClick={() => setLang('en')}
            style={barSeg(lang === 'en')}
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
            style={barSeg(theme === 'light')}
          >
            {t('settings.themeLight')}
          </button>
          <button
            type="button"
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
            style={barSeg(theme === 'dark')}
          >
            {t('settings.themeDark')}
          </button>
          <button
            type="button"
            aria-pressed={theme === 'system'}
            onClick={() => setTheme('system')}
            style={barSeg(theme === 'system')}
          >
            {t('settings.themeSystem')}
          </button>
        </span>
      </span>
    </span>
  );
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

export default function NewsView() {
  const { user, logout } = useAuth();
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
      const article = await api.get(`/api/news/articles/${id}?lang=${lang}`);
      setReader(article);
    } catch (err) {
      setError(err.message || tRef.current('reader.loadError'));
    } finally {
      setReaderLoading(false);
    }
  }

  return (
    <div className="app-mobile">
      <header className="topbar">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px 10px',
            width: '100%',
          }}
        >
          <div className="topbar-title">
            <span className="logo-mark small">GO</span>
            <div>
              <strong>{reader ? t('news.article') : t('news.news')}</strong>
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
                aria-label={t('news.refresh')}
              >
                {refreshing ? <span className="spin" /> : '⟳'}
              </button>
            ) : null}
            <button type="button" className="icon-btn" onClick={logout} aria-label={t('app.logout')}>
              ⎋
            </button>
          </div>
          <DisplayControls />
        </div>
      </header>

      {readerLoading ? (
        <main className="content">
          <p className="muted">{t('reader.loading')}</p>
        </main>
      ) : reader ? (
        <ArticleReader article={reader} onBack={goBack} />
      ) : (
        <main className="content">
          <h1 className="page-title">{t('news.pageTitle')}</h1>

          {error ? (
            <div className="alert alert-error">
              {error}
              <button type="button" className="btn-ghost" onClick={handleRefresh}>
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
            <button type="button" className="btn-ghost load-more" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? t('news.refreshing') : `⟳ ${t('news.refresh')}`}
            </button>
          ) : null}
        </main>
      )}
    </div>
  );
}
