import React, { useMemo, useState } from 'react';
import StepShell from '../StepShell.jsx';
import { useSettings } from '../../settings.jsx';
import { STEPS, STEP_EXPLANATIONS, glossaireValide } from '../../steps.js';

function themeDe(terme, thèmeParDefaut) {
  const brut = terme && typeof terme.theme === 'string' ? terme.theme.trim() : '';
  return brut || thèmeParDefaut || '';
}

function TermesView({ termes, thèmeParDefaut, t }) {
  const [filtre, setFiltre] = useState('');

  const list = useMemo(() => {
    const arr = Array.isArray(termes) ? termes : [];
    return arr.map((terme) => ({ ...terme, _theme: themeDe(terme, thèmeParDefaut) }));
  }, [termes, thèmeParDefaut]);

  const themes = useMemo(() => {
    const vus = new Set();
    list.forEach((terme) => {
      if (terme._theme) vus.add(terme._theme);
    });
    return Array.from(vus).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [list]);

  if (list.length === 0) return null;

  const affiches = filtre ? list.filter((terme) => terme._theme === filtre) : list;

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>
        {t('steps.glossaireTitle')} ({affiches.length}
        {filtre ? ` / ${list.length}` : ''})
      </h3>

      {themes.length > 1 ? (
        <div className="glossaire-filtre">
          <button
            type="button"
            className={`chip${filtre === '' ? ' chip-active' : ''}`}
            onClick={() => setFiltre('')}
          >
            {t('steps.glossaireAllThemes')} ({list.length})
          </button>
          {themes.map((theme) => (
            <button
              type="button"
              key={theme}
              className={`chip${filtre === theme ? ' chip-active' : ''}`}
              onClick={() => setFiltre(theme)}
            >
              {theme} ({list.filter((terme) => terme._theme === theme).length})
            </button>
          ))}
        </div>
      ) : null}

      {affiches.length === 0 ? (
        <p className="muted">{t('steps.glossaireNoThemeMatch')}</p>
      ) : (
        affiches.map((terme, i) => (
          <div className="obj-card" key={`${terme.terme || i}-${terme._theme}`}>
            <div className="obj-card-title">
              {terme.terme || `${t('steps.termeFallback')} ${i + 1}`}
              {terme._theme ? <span className="theme-badge">{terme._theme}</span> : null}
            </div>
            <p className="text-value" style={{ margin: 0 }}>
              {terme.definition || '—'}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

export default function StepGlossaire({ session, busy, error, onGenerate, goStep }) {
  const { t } = useSettings();
  const valide = glossaireValide(session);
  const thèmeParDefaut = (session && session.theme) || '';
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
        <TermesView termes={data.termes} thèmeParDefaut={thèmeParDefaut} t={t} />
      )}
      next={{
        label: `${valide ? '✓ ' : ''}${t('steps.validateGlossaire')}`,
        disabled: !valide,
        onClick: () => goStep(STEPS.findIndex((s) => s.key === 'support')),
      }}
    />
  );
}
