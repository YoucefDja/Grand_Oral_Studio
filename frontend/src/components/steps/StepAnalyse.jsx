import React from 'react';
import StepShell from '../StepShell.jsx';
import JsonViewer from '../JsonViewer.jsx';
import { useSettings } from '../../settings.jsx';
import { STEPS, STEP_EXPLANATIONS } from '../../steps.js';

export default function StepAnalyse({ session, busy, error, onGenerate, goStep }) {
  const { t } = useSettings();
  return (
    <StepShell
      stepKey="analyse"
      session={session}
      busy={busy}
      error={error}
      onGenerate={onGenerate}
      intro={
        <p className="muted" style={{ marginTop: 0 }}>
          {STEP_EXPLANATIONS.analyse}
        </p>
      }
      renderData={(data) => <JsonViewer value={data} />}
      next={{
        label: t('steps.toProblematique'),
        disabled: false,
        onClick: () => goStep(STEPS.findIndex((s) => s.key === 'probleme')),
      }}
    />
  );
}
