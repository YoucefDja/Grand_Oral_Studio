import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';
import { STEPS, ligneDirectriceOf } from '../steps.js';
import StepTracker from './StepTracker.jsx';
import SessionTimer from './SessionTimer.jsx';
import { stepComponents } from './steps/index.js';

export default function WorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useSettings();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [busyStep, setBusyStep] = useState(null);
  const [stepError, setStepError] = useState(null);
  const [chronoBusy, setChronoBusy] = useState(false);
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
      setFatalError(err.message || t('workspace.notFound'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

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

  // Étape 2 : l'étudiant choisit SA formulation parmi celles générées.
  // Persiste le choix (recommandation + ligne directrice) et met à jour la session.
  const handleChoisirProbleme = useCallback(
    async (payload) => {
      setStepError(null);
      const updated = await api.post(`/api/sessions/${id}/choisir-probleme`, payload);
      setSession(updated);
      return updated;
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
    if (!window.confirm(t('workspace.confirmDelete').replace('{titre}', session.titre))) return;
    try {
      await api.del(`/api/sessions/${id}`);
      navigate('/');
    } catch (err) {
      setStepError(err.message);
    }
  }

  // Lance le chrono d'une session créée avant l'arrivée de cette fonctionnalité
  // (startedAt absent). Pour les nouvelles sessions, le backend le démarre seul.
  async function handleStartChrono() {
    if (chronoBusy || !session || session.startedAt) return;
    setChronoBusy(true);
    setStepError(null);
    try {
      const updated = await api.post(`/api/sessions/${id}/start-chrono`);
      setSession(updated);
    } catch (err) {
      setStepError(err.message);
    } finally {
      setChronoBusy(false);
    }
  }

  if (loading) {
    return <p className="muted">{t('workspace.loadingSession')}</p>;
  }
  if (fatalError || !session) {
    return (
      <div className="card panel">
        <div className="alert alert-error">{fatalError || t('workspace.notFound')}</div>
        <Link to="/">← {t('workspace.backToSessions')}</Link>
      </div>
    );
  }

  const activeStep = STEPS[activeIndex];
  const StepComponent = stepComponents[activeStep.key];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <Link to="/" className="muted">← {t('workspace.backLink')}</Link>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{session.titre}</h1>
          <div className="muted">
            {session.theme ? `${session.theme} · ` : ''}
            {session.currentStep >= STEPS.length
              ? t('workspace.finished')
              : `${t('workspace.nextStep')} ${STEPS[session.currentStep].label}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <SessionTimer
            startedAt={session.startedAt}
            onStart={handleStartChrono}
            startBusy={chronoBusy}
          />
          <button type="button" className="btn-danger" onClick={handleDelete}>
            {t('workspace.deleteSession')}
          </button>
        </div>
      </div>

      <StepTracker currentStep={session.currentStep} activeIndex={activeIndex} onSelect={goStep} />

      {ld && ['recherche', 'glossaire', 'plan'].includes(activeStep.key) ? (
        <div className="ld-banner" style={{ marginTop: 0 }}>
          <span className="ld-tag">{t('workspace.ldTag')}</span>
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
        onChoisirProbleme={handleChoisirProbleme}
      />
    </div>
  );
}
