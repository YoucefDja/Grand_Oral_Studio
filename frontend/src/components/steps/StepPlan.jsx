import React from 'react';
import StepShell from '../StepShell.jsx';
import { STEPS, STEP_EXPLANATIONS } from '../../steps.js';

function SectionCard({ section }) {
  const points = Array.isArray(section.points) ? section.points : [];
  return (
    <div className="obj-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span className="obj-card-title" style={{ marginBottom: 0 }}>
          {section.partie || 'Partie'}
        </span>
        {typeof section.minutes === 'number' ? (
          <span className="badge badge-progress">{section.minutes} min</span>
        ) : null}
      </div>
      {section.role ? <p className="muted" style={{ margin: '6px 0' }}>{section.role}</p> : null}
      {points.length ? (
        <ul className="ul-value" style={{ marginBottom: 0 }}>
          {points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function StepPlan({ session, busy, error, onGenerate, goStep }) {
  return (
    <StepShell
      stepKey="plan"
      session={session}
      busy={busy}
      error={error}
      onGenerate={onGenerate}
      intro={
        <div>
          <p className="muted" style={{ marginTop: 0 }}>
            {STEP_EXPLANATIONS.plan}
          </p>
          {typeof session?.data?.plan?.duree_totale_minutes === 'number' ? (
            <div className="alert alert-info" style={{ marginTop: 0 }}>
              Durée totale visée : {session.data.plan.duree_totale_minutes} minutes.
            </div>
          ) : null}
        </div>
      }
      renderData={(data) => {
        const sections = Array.isArray(data.sections) ? data.sections : [];
        const repartition =
          data.repartition_temps && typeof data.repartition_temps === 'object'
            ? Object.entries(data.repartition_temps)
            : [];
        return (
          <div>
            {sections.map((section, i) => (
              <SectionCard key={i} section={section} />
            ))}
            {repartition.length ? (
              <div className="data-section">
                <div className="data-label">Répartition du temps (minutes)</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {repartition.map(([part, min]) => (
                    <span key={part} className="badge badge-progress">
                      {part}: {min} min
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      }}
      next={{
        label: 'Passer au support de présentation →',
        disabled: false,
        onClick: () => goStep(STEPS.findIndex((s) => s.key === 'support')),
      }}
    />
  );
}
