import React, { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useSettings } from '../../settings.jsx';
import { STEPS, STEP_EXPLANATIONS } from '../../steps.js';

/**
 * Étape « Source en ligne » — veille ciblée MANUELLE.
 * À partir du thème + du sujet + de la problématique retenue, DeepSeek déduit
 * des mots-clés, les sources actives (admin) sont interrogées via Serper, puis
 * jusqu'à 4 articles sont sélectionnés et archivés dans l'onglet News.
 */
export default function StepSource({ session, goStep, onSessionRefresh }) {
  const { t } = useSettings();
  const [running, setRunning] = useState(false);
  const [localError, setLocalError] = useState(null);

  const idx = STEPS.findIndex((s) => s.key === 'source');
  const meta = STEPS[idx] || { label: 'Source en ligne', short: 'Sources' };
  const data = session?.data?.source || {};
  const exists = Boolean(data?.generatedAt && Array.isArray(data?.articles));

  // Problématique retenue (même logique que le backend : recommandation sinon 1re).
  const problematique = useMemo(() => {
    const p = session?.data?.probleme || {};
    const formulations = Array.isArray(p.formulations) ? p.formulations : [];
    const recommande = String(p.recommandation || '').trim();
    const retenue =
      formulations.find((f) => f && String(f.formulation || '').trim() === recommande) ||
      formulations[0];
    return retenue && typeof retenue.formulation === 'string' ? retenue.formulation.trim() : '';
  }, [session]);

  const priveDeProblematique = !problematique;

  async function launch() {
    setRunning(true);
    setLocalError(null);
    try {
      await api.post(`/api/sessions/${session._id}/source-veille`);
      await onSessionRefresh();
    } catch (err) {
      setLocalError(err.message || t('source.errorGeneric'));
    } finally {
      setRunning(false);
    }
  }

  function goNext() {
    if (typeof goStep !== 'function') return;
    const n = Math.min(idx + 1, STEPS.length - 1);
    goStep(n);
  }

  return (
    <section className="card panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: '0 0 4px' }}>
          {idx + 1}. {meta.label}
        </h2>
        {exists ? <span className="badge badge-done">{t('source.doneBadge')}</span> : null}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {STEP_EXPLANATIONS.source}
      </p>

      {localError ? (
        <div className="alert alert-error" role="alert">
          {localError}
        </div>
      ) : null}

      {priveDeProblematique ? (
        <div className="alert alert-info">{t('source.needProblem')}</div>
      ) : null}

      {!exists ? (
        <div>
          <p className="muted">
            {t('source.recapLine').replace('{theme}', session?.theme || '—').replace('{sujet}', session?.titre || '—')}
          </p>
          {problematique ? (
            <div className="alert alert-info" style={{ marginTop: 0 }}>
              <strong>{t('source.selectedProblem')}</strong>{' '}
              <em>« {problematique} »</em>
            </div>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            disabled={running || priveDeProblematique}
            onClick={launch}
          >
            {running ? (
              <>
                <span className="spin" /> {t('source.running')}
              </>
            ) : (
              t('source.run')
            )}
          </button>
          <p className="muted" style={{ marginTop: 8 }}>
            {t('source.runHint')}
          </p>
        </div>
      ) : (
        <div>
          <div className="data-section">
            <div className="data-label">{t('source.contextLabel')}</div>
            <p style={{ margin: '6px 0 0', whiteSpace: 'pre-line' }}>
              {data.sujet ? <strong>{data.sujet}</strong> : null}
              {data.problematique ? (
                <>
                  <br />
                  <em>« {data.problematique} »</em>
                </>
              ) : null}
            </p>
          </div>

          {Array.isArray(data.mots_cles) && data.mots_cles.length ? (
            <div className="data-section">
              <div className="data-label">{t('source.keywordsLabel')}</div>
              <p style={{ margin: '6px 0 0' }}>
                {data.mots_cles.map((k) => (
                  <span key={k} className="badge news-theme" style={{ margin: '0 6px 6px 0' }}>
                    {k}
                  </span>
                ))}
              </p>
            </div>
          ) : null}

          <div className="data-section">
            <div className="data-label">{t('source.selectedArticles')}</div>
            {data.articles.map((a, i) => (
              <div key={a._id || a.url} className="obj-card">
                <div className="obj-card-title">
                  {i + 1}. {a.title}
                </div>
                {a.resume ? <p className="muted" style={{ margin: '0 0 8px' }}>{a.resume}</p> : null}
                <p className="muted" style={{ margin: 0 }}>
                  {a.sourceName} —{' '}
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer">
                      {t('reader.originalSourceLabel')} ↗
                    </a>
                  ) : null}
                </p>
              </div>
            ))}
          </div>

          <div className="actions-row" style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button type="button" className="btn-ghost" disabled={running} onClick={launch}>
              {running ? (
                <>
                  <span className="spin" /> {t('source.running')}
                </>
              ) : (
                `↻ ${t('source.reRun')}`
              )}
            </button>
            <button type="button" className="btn-primary" onClick={goNext} disabled={running}>
              {t('source.goNext')} →
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            {t('source.archiveHint')}
          </p>
        </div>
      )}
    </section>
  );
}
