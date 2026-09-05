import React from 'react';
import { STEPS, hasStepData } from '../steps.js';

function Spinner({ text }) {
  return (
    <>
      <span className="spin" /> {text}
    </>
  );
}

/**
 * Coquille commune d'une étape :
 * - zone d'actions (générer / régénérer) avec état de chargement,
 * - messages d'erreur clairs,
 * - affichage du résultat produit (rendu propre à l'étape via renderData).
 */
export default function StepShell({
  stepKey,
  session,
  busy,
  error,
  intro,
  renderData,
  onGenerate,
  generateDisabled = false,
  next = null,
  allowRegenerate = true,
}) {
  const idx = STEPS.findIndex((s) => s.key === stepKey);
  const meta = STEPS[idx];
  const data = session?.data?.[stepKey];
  const exists = hasStepData(session, stepKey);
  const generating = busy === stepKey;

  return (
    <section className="card panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: '0 0 4px' }}>
          {idx + 1}. {meta.label}
        </h2>
        {exists ? <span className="badge badge-done">Contenu généré</span> : null}
      </div>
      {intro}

      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}

      {!exists ? (
        <div>
          <button
            type="button"
            className="btn-primary"
            disabled={generating || generateDisabled}
            onClick={() => onGenerate(stepKey)}
          >
            {generating ? (
              <Spinner text={`Génération en cours (${meta.short.toLowerCase()})…`} />
            ) : generateDisabled ? (
              'Étapes précédentes requises'
            ) : (
              `Générer : ${meta.short}`
            )}
          </button>
          {generateDisabled ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Cette étape ne peut être générée tant que les étapes précédentes ne sont pas terminées.
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          {renderData ? renderData(data) : null}

          <div className="actions-row" style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            {allowRegenerate ? (
              <button type="button" className="btn-ghost" disabled={generating} onClick={() => onGenerate(stepKey)}>
                {generating ? <Spinner text="Régénération…" /> : '↻ Régénérer'}
              </button>
            ) : null}
            {next ? (
              <button
                type="button"
                className="btn-primary"
                disabled={generating || next.disabled}
                onClick={next.onClick}
              >
                {next.label || 'Passer à l’étape suivante'}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
