import React from 'react';
import StepShell from '../StepShell.jsx';
import JsonViewer from '../JsonViewer.jsx';
import { useSettings } from '../../settings.jsx';
import { STEPS, STEP_EXPLANATIONS } from '../../steps.js';

export default function StepRecherche({ session, busy, error, onGenerate, goStep }) {
  const { t } = useSettings();
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
            {t('steps.rechercheIaWarning')}
          </div>
        </div>
      }
      renderData={(data) => <JsonViewer value={data} />}
      next={{
        label: t('steps.toGlossaire'),
        disabled: false,
        onClick: () => goStep(STEPS.findIndex((s) => s.key === 'glossaire')),
      }}
    />
  );
}
