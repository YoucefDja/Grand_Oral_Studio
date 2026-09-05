import React, { useState } from 'react';
import StepShell from '../StepShell.jsx';
import { STEP_EXPLANATIONS, ligneDirectriceOf, glossaireValide } from '../../steps.js';
import { downloadPptx } from '../../api.js';

function SlideCard({ slide, index, sessionId }) {
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

export default function StepSupport({ session, busy, error, onGenerate, goStep }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState(null);
  const ld = ligneDirectriceOf(session);
  const valide = glossaireValide(session);
  const slides = Array.isArray(session?.data?.support?.slides)
    ? session.data.support.slides
    : [];

  async function handleExport() {
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
            {valide ? (
              <span className="badge badge-done">Glossaire validé</span>
            ) : null}
            <span className="badge badge-progress">{slides.length} slides générées</span>
            <button type="button" className="btn-ghost" onClick={() => goStep(3)}>
              Revoir le glossaire validé
            </button>
          </div>

          {slides.map((slide, i) => (
            <SlideCard key={i} slide={slide} index={i} />
          ))}

          <div style={{ marginTop: 20 }}>
            <button type="button" className="btn-ok" disabled={downloading || slides.length === 0} onClick={handleExport}>
              {downloading ? (
                <>
                  <span className="spin" /> Génération du .pptx…
                </>
              ) : (
                '⬇ Télécharger le support .pptx'
              )}
            </button>
            {downloadMsg ? (
              <div className={`alert ${downloading ? '' : downloadMsg.includes('téléchargé') ? 'alert-success' : 'alert-error'}`} style={{ marginTop: 10 }}>
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
  );
}
