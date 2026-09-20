import React, { useCallback, useEffect, useMemo, useState } from 'react';
import StepShell from '../StepShell.jsx';
import { useSettings } from '../../settings.jsx';
import { STEP_EXPLANATIONS, STEPS, etatEtape } from '../../steps.js';
import { api } from '../../api.js';
import { messageCandidat } from '../../messagesErreur.js';

/** Statuts canoniques d'un cas d'entreprise (miroir du domaine backend). */
const BADGE_PAR_STATUT = {
  succes: { classe: 'badge-done', cle: 'contrat.issueSucces' },
  echec: { classe: 'badge-progress', cle: 'contrat.issueEchec' },
  mixte: { classe: 'badge-progress', cle: 'contrat.issueMixte' },
  a_qualifier: { classe: 'badge-progress', cle: 'contrat.issueAQualifier' },
};

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
 * Passe A — TROIS ZONES, PUIS VALIDATION.
 *
 * La Passe A n'est PAS l'évaluation finale : elle sert à générer une
 * problématique utilisable, à l'afficher, à la laisser éditer et valider — et à
 * débloquer le Plan. L'écran affiche donc, dans cet ordre :
 *   1. la tension repérée (issue de l'analyse) ;
 *   2. la problématique proposée (UNE question) ;
 *   3. la ligne directrice.
 * Puis `Modifier` / `Valider la problématique` / `Regénérer`.
 *
 * Les contrôles détaillés (justification, cas d'entreprise, ouverture, sources,
 * grille CESI, conformité PPTX) sont déplacés AVANT L'EXPORT : ici ils
 * apparaissent dans une zone discrète « À approfondir avant l'export », jamais
 * en message rouge. Un bloc « Rejets bloquants » n'apparaît QUE si l'une des
 * conditions minimales n'est pas remplie (question ou tension absente, pas une
 * question, oui/non, copie du sujet, moins de 5 mots utiles).
 *
 * L'état affiché vient EXCLUSIVEMENT de `workflow.contract` (source de vérité
 * serveur) : aucun recalcul local des règles de validation.
 */
function ValidationContrat({ session, disabled, onSessionRefresh, onValide }) {
  const { t } = useSettings();
  const contrat = session?.data?.contrat || {};
  const completeness = contrat.completeness || {};
  const etat = etatEtape(session, 'probleme');
  const [tension, setTension] = useState('');
  const [problematique, setProblematique] = useState('');
  const [justification, setJustification] = useState('');
  const [ligneDirectrice, setLigneDirectrice] = useState('');
  const [ouverture, setOuverture] = useState('');
  const [edition, setEdition] = useState(false);
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
        status: contrat.status || '',
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
    setEdition(false);
  }, [signature]);

  const valideContrat = etat === 'validated';
  // Seuls les rejets CORE bloquent la Passe A. Les rejets secondaires du
  // serveur sont, par construction, déjà convertis en avertissements.
  const rejets = Array.isArray(verification?.rejetsCore) ? verification.rejetsCore : [];
  const avertissements = [
    ...(Array.isArray(verification?.avertissements) ? verification.avertissements : []),
    ...(Array.isArray(verification?.rejetsSecondaires)
      ? verification.rejetsSecondaires.map((r) => r?.message).filter(Boolean)
      : []),
  ];
  const missingFields = Array.isArray(completeness.missingFields) ? completeness.missingFields : [];
  const manque = (champ) => missingFields.includes(champ);

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
  }, [disabled, regenerant, session?._id, onSessionRefresh]);

  // Un contrat existe dès que le serveur le déclare `generated` ou `validated`.
  // On ne juge JAMAIS sur la complétude locale : un contrat généré comportant
  // des champs secondaires vides doit rester affichable et validable.
  if (etat !== 'generated' && etat !== 'validated') {
    return <p className="muted">{t('contrat.pasDeContrat')}</p>;
  }

  const motsCles = Array.isArray(contrat.motsCles) ? contrat.motsCles : [];
  const contexte = Array.isArray(contrat.contexte) ? contrat.contexte : [];
  const limites = Array.isArray(contrat.limitesExistant) ? contrat.limitesExistant : [];
  const preconisations = Array.isArray(contrat.preconisations) ? contrat.preconisations : [];
  const cas = Array.isArray(contrat.casEntreprises) ? contrat.casEntreprises : [];
  const detailVide =
    motsCles.length === 0 &&
    contexte.length === 0 &&
    limites.length === 0 &&
    preconisations.length === 0 &&
    cas.length === 0 &&
    justification.trim() === '' &&
    ouverture.trim() === '';

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

      {localError ? (
        <div className="alert alert-error" role="alert">
          {localError}
        </div>
      ) : null}

      {/* Bloc rouge : UNIQUEMENT les conditions minimales non satisfaites. */}
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

      {/* ZONE 1 — Tension repérée */}
      <div className="data-section">
        <div className="data-label">{t('contrat.tension')}</div>
        <p className="muted" style={{ margin: '0 0 4px' }}>{t('contrat.tensionHint')}</p>
        {edition ? (
          <textarea
            className="input-textarea"
            rows={2}
            value={tension}
            disabled={disabled || saving}
            onChange={(e) => setTension(e.target.value)}
          />
        ) : (
          <p style={{ margin: 0 }}>{tension || t('contrat.nonGenere')}</p>
        )}
      </div>

      {/* ZONE 2 — Problématique proposée */}
      <div className="data-section">
        <div className="data-label">{t('contrat.problematique')}</div>
        <p className="muted" style={{ margin: '0 0 4px' }}>{t('contrat.problematiqueHint')}</p>
        {edition ? (
          <textarea
            className="input-textarea"
            rows={2}
            value={problematique}
            disabled={disabled || saving}
            onChange={(e) => setProblematique(e.target.value)}
          />
        ) : (
          <p style={{ margin: 0, fontWeight: 600 }}>{problematique || t('contrat.nonGenere')}</p>
        )}
      </div>

      {/* ZONE 3 — Ligne directrice */}
      <div className="data-section">
        <div className="data-label">{t('contrat.ligneDirectrice')}</div>
        <p className="muted" style={{ margin: '0 0 4px' }}>{t('contrat.ligneDirectriceHint')}</p>
        {edition ? (
          <textarea
            className="input-textarea"
            rows={2}
            value={ligneDirectrice}
            disabled={disabled || saving}
            onChange={(e) => setLigneDirectrice(e.target.value)}
          />
        ) : (
          <p style={{ margin: 0 }}>{ligneDirectrice || t('contrat.nonGenere')}</p>
        )}
      </div>

      {/* Zone discrets d'avertissements — jamais en rouge, jamais bloquante. */}
      {avertissements.length ? (
        <div className="encart-approfondir">
          <strong>{t('contrat.avertissementsTitle')}</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>{t('contrat.avertissementsIntro')}</p>
          <ul className="ul-value">
            {avertissements.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="actions-row" style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-ghost"
          disabled={disabled || saving || regenerant}
          onClick={() => setEdition((v) => !v)}
        >
          {t('contrat.modifier')}
        </button>
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

      {/* Éléments SECONDAIRES : facultatifs en Passe A, repliés par défaut. */}
      <details style={{ marginTop: 14 }} open={!detailVide}>
        <summary style={{ cursor: 'pointer' }}>
          <strong>{t('contrat.detailsTitle')}</strong>
        </summary>
        <p className="muted" style={{ margin: '4px 0 8px' }}>{t('contrat.detailsHint')}</p>

        <div className="data-section">
          <div className="data-label">{t('contrat.justification')}</div>
          <textarea
            className="input-textarea"
            rows={3}
            value={justification}
            disabled={disabled || saving}
            onChange={(e) => setJustification(e.target.value)}
          />
          {/* Justification vide : encadré d'invitation, JAMAIS une erreur ni un
              contenu technique. La problématique reste exploitable et validable. */}
          {justification.trim() === '' ? (
            <div className="encart-approfondir">
              <strong>{t('contrat.justificationAFournir')}</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {t('contrat.justificationAFournirDetail')}
              </p>
            </div>
          ) : null}
        </div>

        <div className="data-section">
          <div className="data-label">{t('contrat.motsCles')}</div>
          <ListeValeurs
            items={motsCles}
            vide={manque('motsCles') ? t('contrat.aCompleterEtapeSuivante') : t('contrat.nonGenere')}
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
            rendu={(f) => {
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
          <div className="data-label">{t('contrat.limitesExistant')}</div>
          <ListeValeurs
            items={limites}
            vide={t('contrat.nonGenere')}
            rendu={(l) => (typeof l === 'string' ? l : l?.limite || l?.fait || '')}
          />
        </div>

        <div className="data-section">
          <div className="data-label">{t('contrat.preconisations')}</div>
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
        </div>

        <div className="data-section">
          <div className="data-label">{t('contrat.casEntreprises')}</div>
          {cas.length === 0 ? (
            <p className="muted">{t('contrat.aucunCas')}</p>
          ) : (
            <ul className="ul-value">
              {cas.map((c, i) => {
                // Statut canonique fourni par le backend : plus aucune déduction
                // depuis le texte libre (qui affichait « succès » sur un échec
                // dès que le mot « échec » n'était pas écrit noir sur blanc).
                const badge = BADGE_PAR_STATUT[c?.statut] || BADGE_PAR_STATUT.a_qualifier;
                return (
                  <li key={i}>
                    <strong>{c?.entreprise || c?.nom}</strong>
                    <span className={`badge ${badge.classe}`} style={{ marginLeft: 6 }}>
                      {t(badge.cle)}
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
      </details>
    </div>
  );
}

export default function StepProbleme({ session, busy, error, errorReference, onGenerate, goStep, onSessionRefresh }) {
  // L'ouverture de la Passe B dépend de l'état serveur, jamais d'une complétude
  // recalculée côté navigateur.
  const valide = etatEtape(session, 'probleme') === 'validated';

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
      errorReference={errorReference}
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
