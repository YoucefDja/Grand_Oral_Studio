import React from 'react';
import StepShell from '../StepShell.jsx';
import { STEPS, STEP_EXPLANATIONS, glossaireValide } from '../../steps.js';

function SourcesView({ sources }) {
  const list = Array.isArray(sources) ? sources : [];
  if (list.length === 0) return null;
  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Sources retenues — résumés ({list.length})</h3>
      {list.map((s, i) => (
        <div className="obj-card" key={i}>
          <div className="obj-card-title">{s.titre || `Source ${i + 1}`}</div>
          <p className="text-value" style={{ margin: 0 }}>
            {s.resume || '—'}
          </p>
        </div>
      ))}
    </div>
  );
}

function TermesView({ termes }) {
  const list = Array.isArray(termes) ? termes : [];
  if (list.length === 0) return null;
  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Glossaire des termes & acronymes ({list.length})</h3>
      {list.map((t, i) => (
        <div className="obj-card" key={i}>
          <div className="obj-card-title">{t.terme || `Terme ${i + 1}`}</div>
          <p className="text-value" style={{ margin: 0 }}>
            {t.definition || '—'}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function StepGlossaire({ session, busy, error, onGenerate, goStep }) {
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
              Glossaire validé : relisez-le, corrigez-le si besoin (régénération), puis validez pour
              passer au plan.
            </div>
          ) : null}
        </div>
      }
      renderData={(data) => (
        <div className="grid-2">
          <SourcesView sources={data.sources} />
          <TermesView termes={data.termes} />
        </div>
      )}
      next={{
        label: valide
          ? '✓ Valider le glossaire et passer au plan détaillé →'
          : 'Valider le glossaire et passer au plan détaillé →',
        disabled: !valide,
        onClick: () => goStep(STEPS.findIndex((s) => s.key === 'plan')),
      }}
    />
  );
}
