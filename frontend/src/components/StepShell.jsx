import React from 'react';
import { useSettings } from '../settings.jsx';
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
  errorReference = null,
  intro,
  renderData,
  onGenerate,
  generateDisabled = false,
  next = null,
  allowRegenerate = true,
}) {
  const { t } = useSettings();
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
        {exists ? <span className="badge badge-done">{t('steps.contentGenerated')}</span> : null}
      </div>
      {intro}

      {error ? (
        <div className="alert alert-error" role="alert">
          <div>{error}</div>
          {/* Référence de corrélation, volontairement discrète : elle permet au
              candidat de citer la tentative précise sans rien comprendre de
              technique. Aucun détail (stack, JSON, code) n'est affiché. */}
          {errorReference ? <div className="muted error-reference">{errorReference}</div> : null}
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
              <Spinner text={`${t('steps.generating')} (${meta.short.toLowerCase()})…`} />
            ) : generateDisabled ? (
              t('steps.previousStepsRequired')
            ) : (
              `${t('steps.generate')} : ${meta.short}`
            )}
          </button>
          {generateDisabled ? (
            <p className="muted" style={{ marginTop: 8 }}>
              {t('steps.generateBlockedHint')}
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          {renderData ? renderData(data) : null}

          <div className="actions-row" style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            {allowRegenerate ? (
              <button type="button" className="btn-ghost" disabled={generating} onClick={() => onGenerate(stepKey)}>
                {generating ? <Spinner text={t('steps.regenerating')} /> : `↻ ${t('steps.regenerate')}`}
              </button>
            ) : null}
            {next ? (
              <button
                type="button"
                className="btn-primary"
                disabled={generating || next.disabled}
                onClick={next.onClick}
              >
                {next.label || t('steps.nextStepDefault')}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
