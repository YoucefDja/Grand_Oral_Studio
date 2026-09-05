import React from 'react';
import StepShell from '../StepShell.jsx';
import JsonViewer from '../JsonViewer.jsx';
import { STEPS, STEP_EXPLANATIONS } from '../../steps.js';

export default function StepRecherche({ session, busy, error, onGenerate, goStep }) {
  return (
    <StepShell
      stepKey="recherche"
      session={session}
      busy={busy}
      error={error}
      onGenerate={onGenerate}
      intro={
        <div>
          <p className="muted" style={{ marginTop: 0 }}>
            {STEP_EXPLANATIONS.recherche}
          </p>
          <div className="alert alert-info" style={{ marginTop: 0 }}>
            ⚠ Une IA seule ne suffit pas comme source : ce contenu est un guide pour vos propres
            recherches réelles (sources datées, données chiffrées, exemples vérifiables).
          </div>
        </div>
      }
      renderData={(data) => <JsonViewer value={data} />}
      next={{
        label: 'Passer au glossaire & résumés →',
        disabled: false,
        onClick: () => goStep(STEPS.findIndex((s) => s.key === 'glossaire')),
      }}
    />
  );
}
