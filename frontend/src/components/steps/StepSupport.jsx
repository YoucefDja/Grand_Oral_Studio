import React, { useState } from 'react';
import StepShell from '../StepShell.jsx';
import { STEP_EXPLANATIONS, ligneDirectriceOf, glossaireValide } from '../../steps.js';
import { api, downloadPptx, downloadSupportPrompt } from '../../api.js';

function SlideCard({ slide, index }) {
  const puces = Array.isArray(slide.puces) ? slide.puces : [];
  return (
    <div className="obj-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span className="obj-card-title" style={{ marginBottom: 0 }}>
          {index + 1}. {slide.titre || 'Slide'}
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
            Notes orateur
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
  const [exporting, setExporting] = useState(false);
  const [json, setJson] = useState('');
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const valide = glossaireValide(session);

  async function handleExport() {
    setExporting(true);
    setError(null);
    setMsg(null);
    try {
      const fileName = await downloadSupportPrompt(session._id);
      setMsg(`Prompt téléchargé : ${fileName} — collez-le dans Claude (claude.ai).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
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
      setMsg('Support importé et validé : téléchargez le .pptx ci-dessus (aucun token Claude consommé).');
      await onSessionRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="card panel">
      <h2 style={{ margin: '0 0 4px' }}>Autre option : générer dans Claude (sans tokens API)</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Choix entre consommer vos tokens Claude (génération ci-dessus) ou utiliser Claude directement
        (claude.ai) : le résultat du .pptx est identique.
      </p>
      <ol style={{ margin: '0 0 14px', paddingLeft: 20 }}>
        <li>Téléchargez le <strong>prompt complet .md</strong> ci-dessous.</li>
        <li>Collez son intégralité dans Claude (claude.ai).</li>
        <li>Collez ici le <strong>JSON</strong> renvoyé par Claude.</li>
        <li>Validez, puis téléchargez le .pptx (0 token Claude consommé).</li>
      </ol>

      {!valide ? (
        <div className="alert alert-info">
          Cette option nécessite un glossaire validé (étape 4) avant le support.
        </div>
      ) : (
        <>
          <button type="button" className="btn-ghost" disabled={exporting} onClick={handleExport}>
            {exporting ? 'Préparation…' : '⬇ Exporter le prompt .md (à coller dans Claude)'}
          </button>
          <label className="field" style={{ marginTop: 14 }}>
            JSON renvoyé par Claude (objet avec une clé "slides")
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              rows={8}
              placeholder='{"slides": [{"titre": "…", "type": "…", "puces": ["…"], "notes_orateur": "…"}]}'
              className="code-block"
            />
          </label>
          <button type="button" className="btn-primary" disabled={importing || !json.trim()} onClick={handleImport}>
            {importing ? 'Validation…' : 'Importer et valider le support'}
          </button>
          {msg ? <div className="alert alert-success">{msg}</div> : null}
          {error ? <div className="alert alert-error">{error}</div> : null}
        </>
      )}
    </section>
  );
}

export default function StepSupport({ session, busy, error, onGenerate, goStep, onSessionRefresh }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState(null);
  const ld = ligneDirectriceOf(session);
  const valide = glossaireValide(session);
  const slides = Array.isArray(session?.data?.support?.slides)
    ? session.data.support.slides
    : [];

  async function handleExportPptx() {
    setDownloading(true);
    setDownloadMsg(null);
    try {
      const fileName = await downloadPptx(session._id);
      setDownloadMsg(`Fichier téléchargé : ${fileName}`);
    } catch (err) {
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
                <span className="ld-tag">Ligne directrice de la présentation</span>
                <p className="ld-text">« {ld} »</p>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0' }}>
              {valide ? <span className="badge badge-done">Glossaire validé</span> : null}
              <span className="badge badge-progress">{slides.length} slides</span>
              <button type="button" className="btn-ghost" onClick={() => goStep(3)}>
                Revoir le glossaire validé
              </button>
            </div>

            {slides.map((slide, i) => (
              <SlideCard key={i} slide={slide} index={i} />
            ))}

            <div style={{ marginTop: 20 }}>
              <button type="button" className="btn-ok" disabled={downloading || slides.length === 0} onClick={handleExportPptx}>
                {downloading ? (
                  <>
                    <span className="spin" /> Génération du .pptx…
                  </>
                ) : (
                  '⬇ Télécharger le support .pptx'
                )}
              </button>
              {downloadMsg ? (
                <div className={`alert ${downloadMsg.includes('téléchargé') ? 'alert-success' : 'alert-error'}`} style={{ marginTop: 10 }}>
                  {downloadMsg}
                </div>
              ) : null}
              <p className="muted" style={{ marginTop: 10 }}>
                L’export est bloqué tant que le glossaire n’a pas été généré et validé.
              </p>
            </div>
          </div>
        )}
      />
      <ClaudeModeCard session={session} onSessionRefresh={onSessionRefresh} />
    </>
  );
}
