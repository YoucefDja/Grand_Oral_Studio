import React from 'react';
import StepShell from '../StepShell.jsx';
import { useSettings } from '../../settings.jsx';
import { STEPS, STEP_EXPLANATIONS, glossaireValide } from '../../steps.js';

function SourcesView({ sources, t }) {
  const list = Array.isArray(sources) ? sources : [];
  if (list.length === 0) return null;
  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>
        {t('steps.sourcesTitle')} ({list.length})
      </h3>
      {list.map((s, i) => (
        <div className="obj-card" key={i}>
          <div className="obj-card-title">{s.titre || `${t('steps.sourceFallback')} ${i + 1}`}</div>
          <p className="text-value" style={{ margin: 0 }}>
            {s.resume || '—'}
          </p>
        </div>
      ))}
    </div>
  );
}

function TermesView({ termes, t }) {
  const list = Array.isArray(termes) ? termes : [];
  if (list.length === 0) return null;
  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>
        {t('steps.glossaireTitle')} ({list.length})
      </h3>
      {list.map((t2, i) => (
        <div className="obj-card" key={i}>
          <div className="obj-card-title">{t2.terme || `${t('steps.termeFallback')} ${i + 1}`}</div>
          <p className="text-value" style={{ margin: 0 }}>
            {t2.definition || '—'}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function StepGlossaire({ session, busy, error, onGenerate, goStep }) {
  const { t } = useSettings();
  const valide = glossaireValide(session);
  return (
    <StepShell
      stepKey="glossaire"
      session={session}
      busy={busy}
      error={error}
      onGenerate={onGenerate}
      intro={
        <div>
          <p className="muted" style={{ marginTop: 0 }}>
            {STEP_EXPLANATIONS.glossaire}
          </p>
          {valide ? (
            <div className="alert alert-success" style={{ marginTop: 0 }}>
              {t('steps.glossaireValidatedMsg')}
            </div>
          ) : null}
        </div>
      }
      renderData={(data) => (
        <div className="grid-2">
          <SourcesView sources={data.sources} t={t} />
          <TermesView termes={data.termes} t={t} />
        </div>
      )}
      next={{
        label: `${valide ? '✓ ' : ''}${t('steps.validateGlossaire')}`,
        disabled: !valide,
        onClick: () => goStep(STEPS.findIndex((s) => s.key === 'plan')),
      }}
    />
  );
}
