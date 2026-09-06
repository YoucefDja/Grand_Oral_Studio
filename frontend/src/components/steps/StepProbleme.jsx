import React, { useMemo, useState } from 'react';
import StepShell from '../StepShell.jsx';
import { STEPS, STEP_EXPLANATIONS } from '../../steps.js';

/**
 * UI de choix de la formulation retenue. L'étudiant sélectionne LA problématique
 * qu'il défendra : le choix est persisté côté backend (recommandation) puis on
 * enchaîne sur la recherche documentaire. La ligne directrice reste modifiable.
 */
function ProblemeChooser({ data, disabled, onValider }) {
  const formulations = useMemo(
    () => (Array.isArray(data?.formulations) ? data.formulations : []),
    [data]
  );
  const recommande = typeof data?.recommandation === 'string' ? data.recommandation.trim() : '';

  const defaultIndex = useMemo(() => {
    const i = formulations.findIndex(
      (f) => f && typeof f.formulation === 'string' && f.formulation.trim() === recommande
    );
    return i >= 0 ? i : 0;
  }, [formulations, recommande]);

  const [selectedIdx, setSelectedIdx] = useState(defaultIndex);
  const [ligne, setLigne] = useState(
    typeof data?.ligne_directrice === 'string' ? data.ligne_directrice : ''
  );
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState(null);

  if (formulations.length === 0) return null;
  const selected = formulations[selectedIdx];

  async function handleValider() {
    if (!selected || disabled || saving) return;
    setSaving(true);
    setLocalError(null);
    try {
      await onValider({
        formulation: String(selected.formulation || '').trim(),
        index: selectedIdx,
        ligneDirectrice: ligne.trim(),
      });
    } catch (err) {
      setLocalError(err.message || 'Impossible d’enregistrer le choix.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="alert alert-info" style={{ marginTop: 0 }}>
        L’IA a proposé {formulations.length} formulations. <strong>Choisissez celle que vous
        défendrez</strong> : elle seule sera transmise aux étapes suivantes (recherche, glossaire,
        plan, support) comme « problématique retenue ».
      </div>

      {localError ? (
        <div className="alert alert-error" role="alert">
          {localError}
        </div>
      ) : null}

      <div className="formulation-list">
        {formulations.map((f, i) => {
          const isSel = i === selectedIdx;
          const texte = typeof f?.formulation === 'string' ? f.formulation : '';
          return (
            <button
              type="button"
              key={i}
              className={`formulation-option${isSel ? ' selected' : ''}`}
              disabled={disabled || saving}
              onClick={() => setSelectedIdx(i)}
            >
              <span className="formulation-radio" aria-hidden="true">
                {isSel ? '✓' : ''}
              </span>
              <span className="formulation-body">
                <span className="formulation-text">« {texte || `Formulation ${i + 1}`} »</span>
                {typeof f?.pourquoi_discutable === 'string' && f.pourquoi_discutable ? (
                  <span className="formulation-note">
                    Pourquoi elle est discutable : {f.pourquoi_discutable}
                  </span>
                ) : null}
                {typeof f?.pourquoi_bornee_par_le_sujet === 'string' && f.pourquoi_bornee_par_le_sujet ? (
                  <span className="formulation-note">
                    Bornée par le sujet : {f.pourquoi_bornee_par_le_sujet}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="data-section">
        <div className="data-label">Ligne directrice — fil rouge de la présentation (modifiable)</div>
        <textarea
          className="input-textarea"
          rows={3}
          value={ligne}
          disabled={disabled || saving}
          onChange={(e) => setLigne(e.target.value)}
        />
      </div>

      <div className="actions-row" style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-primary"
          disabled={disabled || saving || !selected}
          onClick={handleValider}
        >
          {saving ? 'Enregistrement du choix…' : '✓ Valider ma problématique choisie et continuer →'}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        Le choix enregistré devient la problématique officielle : la ligne directrice ci-dessus est
        ajustable avant validation.
      </p>
    </div>
  );
}

export default function StepProbleme({ session, busy, error, onGenerate, goStep, onChoisirProbleme }) {
  const data = session?.data?.probleme;
  const signature = useMemo(
    () =>
      JSON.stringify({
        recommandation: data?.recommandation || '',
        formulations: data?.formulations || [],
        ligne_directrice: data?.ligne_directrice || '',
      }),
    [data]
  );

  const handleChoisirEtContinuer = useMemo(() => {
    return async (payload) => {
      if (typeof onChoisirProbleme !== 'function') return;
      const updated = await onChoisirProbleme(payload);
      // On enchaîne sur la prochaine étape à faire (backend : currentStep = nombre
      // d'étapes terminées). Après un changement de formulation, le backend a
      // re-vidé recherche → support et ramené currentStep à 2 : on retombe sur la
      // recherche. Si le parcours est terminé (6), on reste sur place.
      const next = Number(updated?.currentStep) || 0;
      if (next >= 2 && next < STEPS.length) goStep(next);
    };
  }, [onChoisirProbleme, goStep]);

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
      renderData={(d) => (
        <ProblemeChooser
          key={signature}
          data={d}
          disabled={busy === 'probleme'}
          onValider={handleChoisirEtContinuer}
        />
      )}
      next={null}
    />
  );
}
