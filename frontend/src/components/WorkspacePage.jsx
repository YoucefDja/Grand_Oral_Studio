import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { STEPS, ligneDirectriceOf } from '../steps.js';
import StepTracker from './StepTracker.jsx';
import { stepComponents } from './steps/index.js';

export default function WorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [busyStep, setBusyStep] = useState(null);
  const [stepError, setStepError] = useState(null);
  const firstLoadRef = useRef(true);

  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/api/sessions/${id}`);
      setSession(data);
      if (firstLoadRef.current) {
        // À l'ouverture : on atterrit sur la prochaine étape à faire.
        firstLoadRef.current = false;
        setActiveIndex(Math.min(Math.max(data.currentStep, 0), STEPS.length - 1));
      } else {
        setActiveIndex((prev) => Math.min(prev, Math.max(data.currentStep, 0)));
      }
    } catch (err) {
      setFatalError(err.message || 'Session introuvable.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const ld = useMemo(() => (session ? ligneDirectriceOf(session) : ''), [session]);

  const handleGenerate = useCallback(
    async (stepKey) => {
      setBusyStep(stepKey);
      setStepError(null);
      try {
        const updated = await api.post(`/api/sessions/${id}/generate/${stepKey}`);
        setSession(updated);
      } catch (err) {
        setStepError(err.message);
      } finally {
        setBusyStep(null);
      }
    },
    [id]
  );

  const goStep = useCallback(
    (index) => {
      if (!session) return;
      const maxReached = Math.min(session.currentStep, STEPS.length - 1);
      if (index < 0 || index > maxReached) return;
      setStepError(null);
      setActiveIndex(index);
    },
    [session]
  );

  async function handleDelete() {
    if (!session) return;
    if (!window.confirm(`Supprimer la session « ${session.titre} » ? Toutes les étapes seront perdues.`)) return;
    try {
      await api.del(`/api/sessions/${id}`);
      navigate('/');
    } catch (err) {
      setStepError(err.message);
    }
  }

  if (loading) {
    return <p className="muted">Chargement de la session…</p>;
  }
  if (fatalError || !session) {
    return (
      <div className="card panel">
        <div className="alert alert-error">{fatalError || 'Session introuvable.'}</div>
        <Link to="/">← Retour à mes sessions</Link>
      </div>
    );
  }

  const activeStep = STEPS[activeIndex];
  const StepComponent = stepComponents[activeStep.key];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <Link to="/" className="muted">← Mes sessions</Link>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{session.titre}</h1>
          <div className="muted">
            {session.theme ? `${session.theme} · ` : ''}
            {session.currentStep >= STEPS.length ? 'parcours terminé' : `prochaine étape : ${STEPS[session.currentStep].label}`}
          </div>
        </div>
        <button type="button" className="btn-danger" onClick={handleDelete}>
          Supprimer la session
        </button>
      </div>

      <StepTracker currentStep={session.currentStep} activeIndex={activeIndex} onSelect={goStep} />

      {ld && activeIndex >= 2 && activeIndex <= 4 ? (
        <div className="ld-banner" style={{ marginTop: 0 }}>
          <span className="ld-tag">Fil conducteur de la présentation</span>
          <p className="ld-text">« {ld} »</p>
        </div>
      ) : null}

      <StepComponent
        key={activeStep.key}
        session={session}
        busy={busyStep}
        error={stepError}
        onGenerate={handleGenerate}
        goStep={goStep}
        onSessionRefresh={loadSession}
      />
    </div>
  );
}
