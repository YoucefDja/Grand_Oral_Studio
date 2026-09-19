import React, { useCallback, useEffect, useState } from 'react';
import StepShell from '../StepShell.jsx';
import { useSettings } from '../../settings.jsx';
import { STEP_EXPLANATIONS, ligneDirectriceOf, glossaireValide, stepIndex } from '../../steps.js';
import { api, downloadPptx, downloadSupportPrompt, downloadVerificationReport } from '../../api.js';

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
      {slide.transition ? (
        <p className="muted" style={{ marginTop: 6, fontStyle: 'italic', fontSize: 12 }}>
          → {slide.transition}
        </p>
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

/** Étape de vérification systématique exécutée avant l'export des fichiers Markdown. */
function VerificationCard({ session, onSessionRefresh }) {
  const { t } = useSettings();
  const [rapport, setRapport] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [telechargement, setTelechargement] = useState(false);
  // Correction des points faibles : plan de correction, champ en cours de
  // traitement, proposition « avant / après » à valider.
  const [plan, setPlan] = useState(null);
  const [correctionEnCours, setCorrectionEnCours] = useState(null);
  const [proposition, setProposition] = useState(null);
  const [application, setApplication] = useState(false);

  const charger = useCallback(async () => {
    if (!session?._id) return;
    setChargement(true);
    setErreur(null);
    try {
      setRapport(await api.get(`/api/sessions/${session._id}/conformite-rapport`));
      setProposition(null);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  }, [session?._id]);

  useEffect(() => {
    charger();
  }, [charger, session?.data?.support?.slides?.length]);

  async function handleTelecharger() {
    setTelechargement(true);
    setErreur(null);
    try {
      await downloadVerificationReport(session._id, 'rapport-verification-grand-oral.md');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setTelechargement(false);
    }
  }

  // Étape 1 : demander à DeepSeek de réécrire le champ fautif. Rien n'est écrit
  // en base à ce stade — on récupère une proposition à prévisualiser.
  async function handleProposer(lot) {
    setCorrectionEnCours(`${lot.etape}::${lot.chemin}`);
    setErreur(null);
    setProposition(null);
    try {
      const res = await api.post(`/api/sessions/${session._id}/corriger-points-faibles`, {
        etape: lot.etape,
        chemin: lot.chemin,
      });
      setProposition(res);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setCorrectionEnCours(null);
    }
  }

  // Étape 2 : l'étudiant valide — la correction est écrite en base et les
  // fichiers Markdown seront renouvelés au prochain export.
  async function handleAppliquer() {
    if (!proposition) return;
    setApplication(true);
    setErreur(null);
    try {
      await api.post(`/api/sessions/${session._id}/corriger-points-faibles`, {
        etape: proposition.etape,
        chemin: proposition.chemin,
        appliquer: true,
      });
      setProposition(null);
      await charger();
      if (onSessionRefresh) await onSessionRefresh();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setApplication(false);
    }
  }

  // « Tout corriger » : enchaîne les propositions champ par champ, sans rien
  // écrire tant que l'étudiant n'a pas validé chacune d'elles.
  async function handlePlanifier() {
    setCorrectionEnCours('plan');
    setErreur(null);
    try {
      const res = await api.post(`/api/sessions/${session._id}/corriger-points-faibles`, {});
      setPlan(res.corrections || []);
      if ((res.corrections || []).length === 0) {
        setErreur(t('steps.verifCorrigerRien'));
      }
    } catch (err) {
      setErreur(err.message);
    } finally {
      setCorrectionEnCours(null);
    }
  }

  const afficherValeur = (valeur) => {
    if (valeur === undefined || valeur === null) return '—';
    if (typeof valeur === 'string') return valeur;
    return JSON.stringify(valeur, null, 2);
  };

  const statutLabel = (statut) => {
    if (statut === 'conforme') return t('steps.verifStatutConforme');
    if (statut === 'partiel') return t('steps.verifStatutPartiel');
    if (statut === 'non_conforme') return t('steps.verifStatutNonConforme');
    return t('steps.verifStatutNA');
  };

  const classeStatut = (statut) => {
    if (statut === 'conforme') return 'alert-success';
    if (statut === 'non_conforme') return 'alert-error';
    return 'alert-info';
  };

  return (
    <section className="card panel" style={{ marginTop: 20 }}>
      <h2 style={{ margin: '0 0 4px' }}>{t('steps.verifTitle')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t('steps.verifIntro')}
      </p>

      {chargement ? <div className="alert alert-info">{t('steps.verifLoading')}</div> : null}
      {erreur && !chargement ? <div className="alert alert-error">{erreur}</div> : null}

      {rapport && !chargement ? (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
            <span className={`badge ${rapport.conforme ? 'badge-done' : 'badge-progress'}`}>
              {t('steps.verifScore')} : {rapport.scoreTotal}/{rapport.scoreMax} ({rapport.pourcentage}%)
            </span>
            <span className="badge badge-progress">
              {rapport.volumeCible} {t('steps.slidesUnit')} {t('steps.verifVolumeCible')}
            </span>
            <button type="button" className="btn-ghost" onClick={charger}>
              {t('steps.verifRefresh')}
            </button>
          </div>

          <div className={`alert ${rapport.conforme ? 'alert-success' : 'alert-error'}`}>
            {rapport.conforme ? t('steps.verifConforme') : t('steps.verifBloque')}
          </div>

          <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>{t('steps.verifFilRougeTitle')}</h3>
          <p className="muted" style={{ margin: 0 }}>
            {t('steps.ldTag')} : « {rapport.ligneDirectrice || '—'} »
          </p>
          <p className="muted" style={{ margin: '2px 0' }}>
            Problématique : « {rapport.problematique || '—'} »
          </p>

          {rapport.pointsFaibles.length ? (
            <>
              <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>{t('steps.verifBlockTitle')}</h3>
              <ul className="ul-value">
                {rapport.pointsFaibles.map((p, i) => (
                  <li key={i}>
                    <strong>{p.critere}</strong> — {p.message}
                  </li>
                ))}
              </ul>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={correctionEnCours === 'plan'}
                  onClick={handlePlanifier}
                >
                  {correctionEnCours === 'plan'
                    ? t('steps.preparing')
                    : t('steps.verifCorriger')}
                </button>
              </div>

              {plan && plan.length ? (
                <div style={{ marginTop: 10 }}>
                  <p className="muted" style={{ margin: '0 0 6px' }}>
                    {t('steps.verifCorrigerIntro')}
                  </p>
                  <ul className="ul-value">
                    {plan.map((lot) => (
                      <li key={`${lot.etape}::${lot.chemin}`} style={{ marginBottom: 6 }}>
                        <strong>{lot.libelle}</strong>
                        <div style={{ marginTop: 4 }}>
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={correctionEnCours === `${lot.etape}::${lot.chemin}`}
                            onClick={() => handleProposer(lot)}
                          >
                            {correctionEnCours === `${lot.etape}::${lot.chemin}`
                              ? t('steps.preparing')
                              : t('steps.verifCorrigerUn')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="muted" style={{ marginTop: 10 }}>
              {t('steps.verifFilRougeOk')}
            </p>
          )}

          {proposition ? (
            <div className="card panel" style={{ marginTop: 12, background: 'rgba(0,0,0,.02)' }}>
              <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>
                {t('steps.verifAvantApres')} — {proposition.libelle}
              </h3>
              <p className="muted" style={{ margin: '0 0 2px', fontWeight: 600 }}>
                {t('steps.verifAvant')}
              </p>
              <pre className="alert alert-info" style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>
                {afficherValeur(proposition.avant)}
              </pre>
              <p className="muted" style={{ margin: '0 0 2px', fontWeight: 600 }}>
                {t('steps.verifApres')}
              </p>
              <pre className="alert alert-success" style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>
                {afficherValeur(proposition.apres)}
              </pre>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={application}
                  onClick={handleAppliquer}
                >
                  {application ? t('steps.preparing') : t('steps.verifValider')}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setProposition(null)}>
                  {t('steps.verifAnnuler')}
                </button>
              </div>
            </div>
          ) : null}

          <h3 style={{ fontSize: 14, margin: '16px 0 6px' }}>{t('steps.verifCriteria')}</h3>
          {(rapport.blocs || []).map((bloc, bi) => (
            <div key={bi} style={{ marginBottom: 10 }}>
              <p className="muted" style={{ margin: '0 0 4px', fontWeight: 600 }}>
                {bloc.libelle}
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '2px 6px' }}>{t('steps.verifCriteria')}</th>
                    <th style={{ textAlign: 'left', padding: '2px 6px' }}>{t('steps.verifStatut')}</th>
                    <th style={{ textAlign: 'right', padding: '2px 6px' }}>{t('steps.verifScoreCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(bloc.criteres || []).map((id) => {
                    const c = (rapport.criteres || []).find((x) => x.id === id);
                    if (!c) return null;
                    return (
                      <tr key={id} style={{ borderTop: '1px solid rgba(0,0,0,.08)' }}>
                        <td style={{ padding: '3px 6px' }}>
                          <strong>{c.id}</strong> {c.libelle}
                        </td>
                        <td style={{ padding: '3px 6px' }}>
                          <span className={`badge ${classeStatut(c.statut) === 'alert-success' ? 'badge-done' : 'badge-progress'}`}>
                            {statutLabel(c.statut)}
                          </span>
                        </td>
                        <td style={{ padding: '3px 6px', textAlign: 'right' }}>
                          {c.score}/{c.scoreMax}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          <button
            type="button"
            className="btn-ghost"
            style={{ marginTop: 10 }}
            disabled={telechargement}
            onClick={handleTelecharger}
          >
            {telechargement ? t('steps.preparing') : t('steps.verifDownloadReport')}
          </button>
        </>
      ) : null}
    </section>
  );
}

/** Badge + checklist du score « logique du sujet » (bloquant pour l'export .pptx). */
function ScoreLogiqueCard({ session }) {
  const { t } = useSettings();
  const [rapport, setRapport] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let annule = false;
    async function charger() {
      if (!session?._id) return;
      setChargement(true);
      setErreur(null);
      try {
        const res = await api.get(`/api/sessions/${session._id}/conformite-rapport`);
        if (!annule) setRapport(res);
      } catch (err) {
        if (!annule) setErreur(err.message);
      } finally {
        if (!annule) setChargement(false);
      }
    }
    charger();
    return () => {
      annule = true;
    };
  }, [session?._id, session?.data?.support?.slides?.length]);

  if (chargement) return <div className="alert alert-info">{t('steps.verifLoading')}</div>;
  if (erreur) return <div className="alert alert-error">{erreur}</div>;

  const score = rapport?.scoreLogique;
  if (!score) {
    return (
      <section className="card panel" style={{ marginTop: 20 }}>
        <h2 style={{ margin: '0 0 4px' }}>{t('logique.title')}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t('logique.fallback')}</p>
      </section>
    );
  }

  const items = Array.isArray(score.items) ? score.items : [];
  const rouges = items.filter((i) => !i.vert);
  const verts = items.filter((i) => i.vert);

  return (
    <section className="card panel" style={{ marginTop: 20 }}>
      <h2 style={{ margin: '0 0 4px' }}>{t('logique.title')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{t('logique.intro')}</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
        <span className={`badge ${score.conforme ? 'badge-done' : 'badge-progress'}`}>
          {t('logique.score')} : {score.verts}/{score.total} ({score.pourcentage}%)
        </span>
      </div>

      <div className={`alert ${score.conforme ? 'alert-success' : 'alert-error'}`}>
        {score.conforme ? t('logique.conforme') : t('logique.bloque')}
      </div>

      {rouges.length ? (
        <>
          <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>{t('logique.rouges')}</h3>
          <ul className="ul-value">
            {rouges.map((i) => (
              <li key={i.code}>
                <strong>{i.libelle}</strong>
                {i.detail ? <span className="muted">{` — ${i.detail}`}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <details style={{ marginTop: 10 }}>
        <summary className="muted" style={{ cursor: 'pointer' }}>
          {t('logique.ok')} ({verts.length})
        </summary>
        <ul className="ul-value">
          {verts.map((i) => (
            <li key={i.code} className="muted">
              ✅ {i.libelle}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Mode alternatif : générer le support dans Claude (chat) sans consommer de tokens API. */
function ClaudeModeCard({ session, onSessionRefresh }) {
  const { t } = useSettings();
  const [exportingPptx, setExportingPptx] = useState(false);
  const [exportingGamma, setExportingGamma] = useState(false);
  const [exportingClaudeDesign, setExportingClaudeDesign] = useState(false);
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

  async function handleExportGammaPrompt() {
    setExportingGamma(true);
    setError(null);
    setMsg(null);
    try {
      const fileName = await downloadSupportPrompt(
        session._id,
        'support-etape-6-generation-gamma.md',
        'support-gamma-prompt'
      );
      setMsg(t('steps.gammaPromptDownloaded').replace('{file}', fileName));
    } catch (err) {
      setError(err.message);
    } finally {
      setExportingGamma(false);
    }
  }

  async function handleExportClaudeDesignPrompt() {
    setExportingClaudeDesign(true);
    setError(null);
    setMsg(null);
    try {
      const fileName = await downloadSupportPrompt(
        session._id,
        'support-etape-6-generation-claude-design.md',
        'support-claude-design-prompt'
      );
      setMsg(t('steps.claudeDesignPromptDownloaded').replace('{file}', fileName));
    } catch (err) {
      setError(err.message);
    } finally {
      setExportingClaudeDesign(false);
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
            <button type="button" className="btn-ghost" disabled={exportingGamma} onClick={handleExportGammaPrompt}>
              {exportingGamma ? t('steps.preparing') : t('steps.gammaExportPrompt')}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={exportingClaudeDesign}
              onClick={handleExportClaudeDesignPrompt}
            >
              {exportingClaudeDesign ? t('steps.preparing') : t('steps.claudeDesignExportPrompt')}
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            {t('steps.claudePptxHint')}
          </p>
          <p className="muted" style={{ marginTop: 4 }}>
            {t('steps.gammaHint')}
          </p>
          <p className="muted" style={{ marginTop: 4 }}>
            {t('steps.claudeDesignHint')}
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
              <p className="muted" style={{ marginTop: 4 }}>
                {t('logique.bloque')}
              </p>
            </div>
          </div>
        )}
      />
      <VerificationCard session={session} onSessionRefresh={onSessionRefresh} />
      <ScoreLogiqueCard session={session} />
      <ClaudeModeCard session={session} onSessionRefresh={onSessionRefresh} />
    </>
  );
}
