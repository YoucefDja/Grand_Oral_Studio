import React from 'react';
import StepShell from '../StepShell.jsx';
import JsonViewer from '../JsonViewer.jsx';
import { STEPS, STEP_EXPLANATIONS } from '../../steps.js';

export default function StepProbleme({ session, busy, error, onGenerate, goStep }) {
  return (
    <StepShell
      stepKey="probleme"
      session={session}
      busy={busy}
      error={error}
      onGenerate={onGenerate}
      intro={
        <p className="muted" style={{ marginTop: 0 }}>
          {STEP_EXPLANATIONS.probleme}
        </p>
      }
      renderData={(data) => (
        <div>
          {typeof data.ligne_directrice === 'string' && data.ligne_directrice.trim() ? (
            <div className="ld-banner">
              <span className="ld-tag">Ligne directrice — fil rouge de la présentation</span>
              <p className="ld-text">« {data.ligne_directrice} »</p>
            </div>
          ) : null}
          <JsonViewer value={data} />
        </div>
      )}
      next={{
        label: 'Passer à la recherche documentaire →',
        disabled: false,
        onClick: () => goStep(STEPS.findIndex((s) => s.key === 'recherche')),
      }}
    />
  );
}
