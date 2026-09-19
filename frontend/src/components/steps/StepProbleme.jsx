import React, { useCallback, useEffect, useMemo, useState } from 'react';
import StepShell from '../StepShell.jsx';
import { useSettings } from '../../settings.jsx';
import { STEP_EXPLANATIONS, STEPS } from '../../steps.js';
import { api } from '../../api.js';
import { messageCandidat } from '../../messagesErreur.js';

function Ligne({ label, children }) {
  if (!children) return null;
  return (
    <div className="data-section">
      <div className="data-label">{label}</div>
      {children}
    </div>
  );
}

function ListeValeurs({ items, rendu, vide }) {
  if (!Array.isArray(items) || items.length === 0) {
    return vide ? <p className="muted">{vide}</p> : null;
  }
  return (
    <ul className="ul-value">
      {items.map((item, i) => (
        <li key={i}>{rendu(item, i)}</li>
      ))}
    </ul>
  );
}

/**
 * Écran de VALIDATION DU CONTRAT (gate Passe A → Passe B).
 *
 * L'étudiant relit le contrat métier produit par la Passe A : mots-clés, tension,
 * l'UNIQUE question, justification, préconisations et cas d'entreprises. Il peut
 * ÉDITER la tension, la problématique, la justification, la ligne directrice et
 * l'ouverture — jamais les mots-clés ni les cas (qui viennent du .md et des
 * sources). Tant que le backend refuse le contrat, la Passe B reste fermée.
 */
function ValidationContrat({ session, disabled, onSessionRefresh, onValide }) {
  const { t } = useSettings();
  const contrat = session?.data?.contrat || {};
  const completeness = contrat.completeness || {};
  // Les trois éléments fondamentaux (tension, problématique, justification) sont
  // la SEULE condition d'affichage et de validation : une section secondaire
  // vide ne doit plus cacher le contrat à l'étudiant.
  const isCoreValid =
    completeness.isCoreValid === true ||
    Boolean(
      contrat.problematique && contrat.tension && contrat.justificationProbleme
    );
  const editable = Boolean(
    isCoreValid && contrat.problematique && contrat.tension
  );

  const [tension, setTension] = useState('');
  const [problematique, setProblematique] = useState('');
  const [justification, setJustification] = useState('');
  const [ligneDirectrice, setLigneDirectrice] = useState('');
  const [ouverture, setOuverture] = useState('');
  const [saving, setSaving] = useState(false);
  const [regenerant, setRegenerant] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [verification, setVerification] = useState(contrat.verification || null);

  // Le contrat peut changer sous nos pieds (génération, régénération) : on
  // resynchronise les champs éditables sur la version serveur.
  const signature = useMemo(
    () =>
      JSON.stringify({
        tension: contrat.tension || '',
        problematique: contrat.problematique || '',
        justificationProbleme: contrat.justificationProbleme || '',
        ligneDirectrice: contrat.ligneDirectrice || '',
        ouverture: contrat.ouverture || '',
        valide: contrat.valide === true,
      }),
    [contrat]
  );

  useEffect(() => {
    setTension(contrat.tension || '');
    setProblematique(contrat.problematique || '');
    setJustification(contrat.justificationProbleme || '');
    setLigneDirectrice(contrat.ligneDirectrice || '');
    setOuverture(typeof contrat.ouverture === 'string' ? contrat.ouverture : '');
    setVerification(contrat.verification || null);
    setLocalError(null);
  }, [signature]);

  const valideContrat = contrat.valide === true;
  const rejets = Array.isArray(verification?.rejets) ? verification.rejets : [];
  // En création, les rejets de fond non bloquants sont remontés à part : on les
  // affiche comme des avertissements, pas comme des blocages.
  const rejetsSec = Array.isArray(verification?.rejetsSecondaires)
    ? verification.rejetsSecondaires
    : [];
  const avertissements = [
    ...(Array.isArray(verification?.avertissements) ? verification.avertissements : []),
    ...rejetsSec.map((r) => r?.message).filter(Boolean),
  ];
  const missingSecondaryFields = Array.isArray(
    contrat.completeness?.missingSecondaryFields
  )
    ? contrat.completeness.missingSecondaryFields
    : [];
  const manqueSecondaire = (champ) => missingSecondaryFields.includes(champ);

  // Éditer invalide la validation précédente : on repasse par le gate serveur.
  const modifie =
    tension !== (contrat.tension || '') ||
    problematique !== (contrat.problematique || '') ||
    justification !== (contrat.justificationProbleme || '') ||
    ligneDirectrice !== (contrat.ligneDirectrice || '') ||
    ouverture !== (typeof contrat.ouverture === 'string' ? contrat.ouverture : '');

  const handleValider = useCallback(async () => {
    if (disabled || saving) return;
    setSaving(true);
    setLocalError(null);
    try {
      const updated = await onValide({
        tension: tension.trim(),
        problematique: problematique.trim(),
        justificationProbleme: justification.trim(),
        ligneDirectrice: ligneDirectrice.trim(),
        ouverture: ouverture.trim(),
      });
      setVerification(updated?.data?.contrat?.verification || null);
      if (onSessionRefresh) await onSessionRefresh();
    } catch (err) {
      // Un échec de validation ne doit pas effacer le contrat affiché : on garde
      // les champs locaux et on resynchronise depuis le serveur.
      setLocalError(messageCandidat(err));
      if (onSessionRefresh) await onSessionRefresh();
    } finally {
      setSaving(false);
    }
  }, [
    disabled,
    saving,
    tension,
    problematique,
    justification,
    ligneDirectrice,
    ouverture,
    onValide,
    onSessionRefresh,
    t,
  ]);

  const handleRegenerer = useCallback(async () => {
    if (disabled || regenerant || !session?._id) return;
    setRegenerant(true);
    setLocalError(null);
    try {
      const res = await api.post(`/api/sessions/${session._id}/regenerer-contrat`, {});
      setVerification(res?.verification || null);
      if (onSessionRefresh) await onSessionRefresh();
    } catch (err) {
      // Le contrat déjà validé reste en base : on se contente d'afficher le
      // message mappé sur le code applicatif, puis on resynchronise l'écran.
      setLocalError(messageCandidat(err));
      if (onSessionRefresh) await onSessionRefresh();
    } finally {
      setRegenerant(false);
    }
  }, [disabled, regenerant, session?._id, onSessionRefresh, t]);

  if (!editable) {
    return <p className="muted">{t('contrat.pasDeContrat')}</p>;
  }

  const motsCles = Array.isArray(contrat.motsCles) ? contrat.motsCles : [];
  const contexte = Array.isArray(contrat.contexte) ? contrat.contexte : [];
  const limites = Array.isArray(contrat.limitesExistant) ? contrat.limitesExistant : [];
  const preconisations = Array.isArray(contrat.preconisations) ? contrat.preconisations : [];
  const cas = Array.isArray(contrat.casEntreprises) ? contrat.casEntreprises : [];

  return (
    <div>
      <div className="alert alert-info" style={{ marginTop: 0 }}>
        {t('contrat.intro')}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
        <span className={`badge ${valideContrat && !modifie ? 'badge-done' : 'badge-progress'}`}>
          {valideContrat && !modifie ? t('contrat.valideBadge') : t('contrat.nonValideBadge')}
        </span>
        <span className="badge badge-progress">
          {t('contrat.sujet')} : {session?.titre || '—'}
        </span>
      </div>

      {isCoreValid && missingSecondaryFields.length > 0 ? (
        <p className="muted" style={{ margin: '0 0 8px' }}>{t('contrat.exploitable')}</p>
      ) : null}

      {localError ? (
        <div className="alert alert-error" role="alert">
          {localError}
        </div>
      ) : null}

      {rejets.length ? (
        <>
          <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>{t('contrat.rejetsTitle')}</h3>
          <ul className="ul-value">
            {rejets.map((r, i) => (
              <li key={i}>
                <strong>{r.code}</strong> — {r.message}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {avertissements.length ? (
        <>
          <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>{t('contrat.avertissementsTitle')}</h3>
          <ul className="ul-value">
            {avertissements.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="data-section">
        <div className="data-label">{t('contrat.motsCles')}</div>
        <ListeValeurs
          items={motsCles}
          vide={manqueSecondaire('motsCles') ? t('contrat.aCompleterEtapeSuivante') : undefined}
          rendu={(m) =>
            typeof m === 'string' ? m : <><strong>{m?.mot}</strong> — {m?.definition}</>
          }
        />
      </div>

      <div className="data-section">
        <div className="data-label">{t('contrat.contexte')}</div>
        <ListeValeurs
          items={contexte}
          vide={t('contrat.nonGenere')}
          rendu={(f, i) => {
            if (typeof f === 'string') return f;
            return (
              <>
                {f?.fait}
                {f?.source ? (
                  <span className="muted">{` — ${t('contrat.sourceLabel')} : ${f.source}`}</span>
                ) : null}
              </>
            );
          }}
        />
      </div>

      <div className="data-section">
        <div className="data-label">{t('contrat.tension')}</div>
        <p className="muted" style={{ margin: '0 0 4px' }}>{t('contrat.tensionHint')}</p>
        <textarea
          className="input-textarea"
          rows={2}
          value={tension}
          disabled={disabled || saving}
          onChange={(e) => setTension(e.target.value)}
        />
      </div>

      <div className="data-section">
        <div className="data-label">{t('contrat.problematique')}</div>
        <p className="muted" style={{ margin: '0 0 4px' }}>{t('contrat.problematiqueHint')}</p>
        <textarea
          className="input-textarea"
          rows={2}
          value={problematique}
          disabled={disabled || saving}
          onChange={(e) => setProblematique(e.target.value)}
        />
      </div>

      <div className="data-section">
        <div className="data-label">{t('contrat.justification')}</div>
        <textarea
          className="input-textarea"
          rows={3}
          value={justification}
          disabled={disabled || saving}
          onChange={(e) => setJustification(e.target.value)}
        />
      </div>

      <Ligne label={t('contrat.limitesExistant')}>
        <ListeValeurs
          items={limites}
          vide={t('contrat.nonGenere')}
          rendu={(l) => (typeof l === 'string' ? l : JSON.stringify(l))}
        />
      </Ligne>

      <Ligne label={t('contrat.preconisations')}>
        <ListeValeurs
          items={preconisations}
          vide={t('contrat.nonGenere')}
          rendu={(p) => {
            if (typeof p === 'string') return p;
            return (
              <>
                <strong>{p?.action || p?.intitule || p?.titre || ''}</strong>
                {p?.detail || p?.description ? ` — ${p.detail || p.description}` : ''}
                {p?.cible ? <span className="muted">{` (${p.cible})`}</span> : null}
              </>
            );
          }}
        />
      </Ligne>

      <Ligne label={t('contrat.casEntreprises')}>
        {cas.length === 0 ? (
          <p className="muted">{t('contrat.aucunCas')}</p>
        ) : (
          <ul className="ul-value">
            {cas.map((c, i) => {
              const echec = /echec|limite|contre-exemple/i.test(JSON.stringify(c));
              return (
                <li key={i}>
                  <strong>{c?.nom}</strong>
                  <span className={`badge ${echec ? 'badge-progress' : 'badge-done'}`} style={{ marginLeft: 6 }}>
                    {echec ? t('contrat.issueEchec') : t('contrat.issueSucces')}
                  </span>
                  {c?.chiffre ? ` — ${c.chiffre}` : ''}
                  {c?.angle ? ` — ${c.angle}` : ''}
                  {c?.source ? (
                    <span className="muted">{` — ${t('contrat.sourceLabel')} : ${c.source}`}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Ligne>

      <div className="data-section">
        <div className="data-label">{t('contrat.ligneDirectrice')}</div>
        <textarea
          className="input-textarea"
          rows={2}
          value={ligneDirectrice}
          disabled={disabled || saving}
          onChange={(e) => setLigneDirectrice(e.target.value)}
        />
      </div>

      <div className="data-section">
        <div className="data-label">{t('contrat.ouverture')}</div>
        <textarea
          className="input-textarea"
          rows={2}
          value={ouverture}
          disabled={disabled || saving}
          onChange={(e) => setOuverture(e.target.value)}
        />
      </div>

      <div className="actions-row" style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-primary"
          disabled={disabled || saving || regenerant || (valideContrat && !modifie)}
          onClick={handleValider}
        >
          {saving ? t('contrat.validant') : t('contrat.valider')}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={disabled || saving || regenerant}
          onClick={handleRegenerer}
        >
          {regenerant ? t('contrat.regenerant') : t('contrat.regenerer')}
        </button>
      </div>

      <p className="muted" style={{ marginTop: 6 }}>{t('contrat.regenerationHint')}</p>
      {valideContrat && !modifie ? (
        <div className="alert alert-success">{t('contrat.valideOk')}</div>
      ) : null}
    </div>
  );
}

export default function StepProbleme({ session, busy, error, onGenerate, goStep, onSessionRefresh }) {
  const contrat = session?.data?.contrat;
  // Le Plan s'ouvre dès que les TROIS éléments fondamentaux sont validés : les
  // sections secondaires seront construites/vérifiées plus tard (Passe B, export).
  const valide = Boolean(contrat?.valide === true);

  const handleValide = useCallback(
    async (payload) => {
      const updated = await api.post(`/api/sessions/${session._id}/valider-contrat`, payload);
      return updated;
    },
    [session?._id]
  );

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
      renderData={() => (
        <ValidationContrat
          session={session}
          disabled={busy === 'probleme'}
          onSessionRefresh={onSessionRefresh}
          onValide={handleValide}
        />
      )}
      next={
        valide
          ? {
              label: `Passer au plan détaillé →`,
              onClick: () => goStep(STEPS.findIndex((s) => s.key === 'plan')),
            }
          : null
      }
    />
  );
}
