import React, { useState } from 'react';
import StepShell from '../StepShell.jsx';
import { useSettings } from '../../settings.jsx';
import { STEP_EXPLANATIONS, ligneDirectriceOf, glossaireValide, stepIndex } from '../../steps.js';
import { api, downloadPptx, downloadSupportPrompt } from '../../api.js';

function SlideCard({ slide, index, t }) {
  const puces = Array.isArray(slide.puces) ? slide.puces : [];
  return (
    <div className="obj-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span className="obj-card-title" style={{ marginBottom: 0 }}>
          {index + 1}. {slide.titre || t('steps.slideFallback')}
        </span>
        {slide.type ? <span className="badge badge-progress">{slide.type}</span> : null}
      </div>
      {puces.length ? (
        <ul className="ul-value">
          {puces.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : null}
      {slide.notes_orateur ? (
        <details style={{ marginTop: 6 }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>
            {t('steps.speakerNotes')}
          </summary>
          <div className="alert alert-info" style={{ whiteSpace: 'pre-line' }}>
            {slide.notes_orateur}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** Mode alternatif : générer le support dans Claude (chat) sans consommer de tokens API. */
function ClaudeModeCard({ session, onSessionRefresh }) {
  const { t } = useSettings();
  const [exportingPptx, setExportingPptx] = useState(false);
  const [json, setJson] = useState('');
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const valide = glossaireValide(session);

  async function handleExportPptxPrompt() {
    setExportingPptx(true);
    setError(null);
    setMsg(null);
    try {
      const fileName = await downloadSupportPrompt(
        session._id,
        'support-etape-6-generation-pptx-claude.md',
        'support-pptx-prompt'
      );
      setMsg(t('steps.claudePptxPromptDownloaded').replace('{file}', fileName));
    } catch (err) {
      setError(err.message);
    } finally {
      setExportingPptx(false);
    }
  }

  async function handleImport() {
    if (!json.trim()) return;
    setImporting(true);
    setError(null);
    setMsg(null);
    try {
      await api.post(`/api/sessions/${session._id}/import-support`, { json });
      setJson('');
      setMsg(t('steps.claudeImportSuccess'));
      await onSessionRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="card panel">
      <h2 style={{ margin: '0 0 4px' }}>{t('steps.claudeTitle')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t('steps.claudeIntro')}
      </p>
      <ol style={{ margin: '0 0 14px', paddingLeft: 20 }}>
        <li>{t('steps.claudeStep1a')} <strong>{t('steps.claudePromptMd')}</strong> {t('steps.claudeStep1b')}</li>
        <li>{t('steps.claudeStep2')}</li>
        <li>{t('steps.claudeStep3a')} <strong>JSON</strong> {t('steps.claudeStep3b')}</li>
        <li>{t('steps.claudeStep4')}</li>
      </ol>

      {!valide ? (
        <div className="alert alert-info">{t('steps.claudeNeedsGlossaire')}</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-ghost" disabled={exportingPptx} onClick={handleExportPptxPrompt}>
              {exportingPptx ? t('steps.preparing') : t('steps.claudeExportPptxPrompt')}
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            {t('steps.claudePptxHint')}
          </p>
          <label className="field" style={{ marginTop: 14 }}>
            {t('steps.claudeJsonLabel')}
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              rows={8}
              placeholder='{"slides": [{"titre": "…", "type": "…", "puces": ["…"], "notes_orateur": "…"}]}'
              className="code-block"
            />
          </label>
          <button type="button" className="btn-primary" disabled={importing || !json.trim()} onClick={handleImport}>
            {importing ? t('steps.importing') : t('steps.importValidate')}
          </button>
          {msg ? <div className="alert alert-success">{msg}</div> : null}
          {error ? <div className="alert alert-error">{error}</div> : null}
        </>
      )}
    </section>
  );
}

export default function StepSupport({ session, busy, error, onGenerate, goStep, onSessionRefresh }) {
  const { t } = useSettings();
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState(null);
  const [downloadOk, setDownloadOk] = useState(false);
  const ld = ligneDirectriceOf(session);
  const valide = glossaireValide(session);
  const slides = Array.isArray(session?.data?.support?.slides)
    ? session.data.support.slides
    : [];

  async function handleExportPptx() {
    setDownloading(true);
    setDownloadMsg(null);
    setDownloadOk(false);
    try {
      const fileName = await downloadPptx(session._id);
      setDownloadOk(true);
      setDownloadMsg(`${t('steps.downloaded')} : ${fileName}`);
    } catch (err) {
      setDownloadOk(false);
      setDownloadMsg(err.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <StepShell
        stepKey="support"
        session={session}
        busy={busy}
        error={error}
        onGenerate={onGenerate}
        intro={
          <p className="muted" style={{ marginTop: 0 }}>
            {STEP_EXPLANATIONS.support}
          </p>
        }
        renderData={(data) => (
          <div>
            {ld ? (
              <div className="ld-banner">
                <span className="ld-tag">{t('steps.ldTag')}</span>
                <p className="ld-text">« {ld} »</p>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0' }}>
              {valide ? <span className="badge badge-done">{t('steps.glossaireOk')}</span> : null}
              <span className="badge badge-progress">{slides.length} {t('steps.slidesUnit')}</span>
              <button type="button" className="btn-ghost" onClick={() => goStep(stepIndex('glossaire'))}>
                {t('steps.reviewGlossaire')}
              </button>
            </div>

            {slides.map((slide, i) => (
              <SlideCard key={i} slide={slide} index={i} t={t} />
            ))}

            <div style={{ marginTop: 20 }}>
              <button type="button" className="btn-ok" disabled={downloading || slides.length === 0} onClick={handleExportPptx}>
                {downloading ? (
                  <>
                    <span className="spin" /> {t('steps.generatingPptx')}
                  </>
                ) : (
                  t('steps.downloadPptx')
                )}
              </button>
              {downloadMsg ? (
                <div className={`alert ${downloadOk ? 'alert-success' : 'alert-error'}`} style={{ marginTop: 10 }}>
                  {downloadMsg}
                </div>
              ) : null}
              <p className="muted" style={{ marginTop: 10 }}>
                {t('steps.exportBlockedHint')}
              </p>
            </div>
          </div>
        )}
      />
      <ClaudeModeCard session={session} onSessionRefresh={onSessionRefresh} />
    </>
  );
}
