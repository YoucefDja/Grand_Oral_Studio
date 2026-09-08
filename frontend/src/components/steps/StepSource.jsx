import React, { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useSettings } from '../../settings.jsx';
import { STEPS, STEP_EXPLANATIONS } from '../../steps.js';

/**
 * Étape « Source en ligne » — veille ciblée MANUELLE (FACULTATIVE).
 * À partir du thème + du sujet + de la problématique retenue, DeepSeek déduit
 * des mots-clés, les sources actives (admin) sont interrogées via Serper, puis
 * jusqu'à 4 articles sont sélectionnés et archivés dans l'onglet News.
 * L'étudiant peut passer cette étape (« skip ») et la lancer plus tard.
 */
export default function StepSource({ session, goStep, onSessionRefresh, onSkipSource }) {
  const { t } = useSettings();
  const [busy, setBusy] = useState(null); // 'run' | 'skip' | null
  const [localError, setLocalError] = useState(null);

  const idx = STEPS.findIndex((s) => s.key === 'source');
  const meta = STEPS[idx] || { label: 'Source en ligne', short: 'Sources' };
  const data = session?.data?.source || {};
  const exists = Boolean(data?.generatedAt && Array.isArray(data?.articles));
  const skipped = data?.skipped === true;

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

  async function launchVeille() {
    setBusy('run');
    setLocalError(null);
    try {
      await api.post(`/api/sessions/${session._id}/source-veille`);
      await onSessionRefresh();
    } catch (err) {
      setLocalError(err.message || t('source.errorGeneric'));
    } finally {
      setBusy(null);
    }
  }

  // « Passer cette étape » : le parent (WorkspacePage) enregistre le skip puis
  // enchaîne directement sur l'étape suivante. La veille reste possible plus tard.
  async function skipSource() {
    setBusy('skip');
    setLocalError(null);
    try {
      if (typeof onSkipSource === 'function') {
        await onSkipSource();
      } else {
        await api.post(`/api/sessions/${session._id}/skip-source`);
        if (typeof onSessionRefresh === 'function') await onSessionRefresh();
      }
    } catch (err) {
      setLocalError(err.message || t('source.errorGeneric'));
    } finally {
      setBusy(null);
    }
  }

  const goNext = () => {
    if (typeof goStep === 'function') goStep(Math.min(idx + 1, STEPS.length - 1));
  };

  const spinner = (label) => (
    <>
      <span className="spin" /> {label}
    </>
  );

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
          {skipped ? (
            <div className="alert alert-info" style={{ marginTop: 0 }}>
              {t('source.skippedNote')}
            </div>
          ) : (
            <>
              <p className="muted">
                {t('source.recapLine').replace('{theme}', session?.theme || '—').replace('{sujet}', session?.titre || '—')}
              </p>
              {problematique ? (
                <div className="alert alert-info" style={{ marginTop: 0 }}>
                  <strong>{t('source.selectedProblem')}</strong>{' '}
                  <em>« {problematique} »</em>
                </div>
              ) : null}
            </>
          )}

          {!skipped ? (
            <div className="actions-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={busy !== null || priveDeProblematique}
                onClick={launchVeille}
                style={{ width: 'auto' }}
              >
                {busy === 'run' ? spinner(t('source.running')) : t('source.run')}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy !== null || priveDeProblematique}
                onClick={skipSource}
              >
                {busy === 'skip' ? spinner(t('source.skipping')) : t('source.skip')}
              </button>
            </div>
          ) : (
            <div className="actions-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={busy !== null || priveDeProblematique}
                onClick={launchVeille}
                style={{ width: 'auto' }}
              >
                {busy === 'run' ? spinner(t('source.running')) : t('source.run')}
              </button>
              <button type="button" className="btn-ghost" disabled={busy !== null} onClick={goNext}>
                {t('source.goNext')} →
              </button>
            </div>
          )}
          {!skipped ? (
            <p className="muted" style={{ marginTop: 8 }}>
              {t('source.runHint')}
            </p>
          ) : null}
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
            <button type="button" className="btn-ghost" disabled={busy !== null} onClick={launchVeille}>
              {busy === 'run' ? spinner(t('source.running')) : `↻ ${t('source.reRun')}`}
            </button>
            <button type="button" className="btn-primary" disabled={busy !== null} onClick={goNext}>
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
