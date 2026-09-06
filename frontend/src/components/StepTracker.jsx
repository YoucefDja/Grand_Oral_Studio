import React from 'react';
import { STEPS } from '../steps.js';
import { useSettings } from '../settings.jsx';

/**
 * Tracker des 6 étapes. Une étape est accessible si elle a déjà été terminée
 * (index < currentStep) ou si c'est l'étape en cours (index === currentStep).
 */
export default function StepTracker({ currentStep, activeIndex, onSelect }) {
  const { t } = useSettings();
  return (
    <div className="step-tracker" role="tablist" aria-label={t('steps.ariaJourney')}>
      {STEPS.map((step, i) => {
        const done = i < currentStep;
        const active = i === activeIndex;
        const locked = i > currentStep;
        const classes = ['step-pill', done ? 'done' : '', active ? 'active' : '', locked ? 'locked' : '', !locked ? 'clickable' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={step.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={classes}
            disabled={locked}
            onClick={() => onSelect && onSelect(i)}
            title={locked ? t('steps.previousStepsRequired') : step.label}
          >
            <span className="num">{done ? '✓' : i + 1}</span>
            <span className="lbl">{step.short}</span>
          </button>
        );
      })}
    </div>
  );
}
