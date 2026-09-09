import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';

/**
 * Chrono de session de travail — compte à rebours affiché sous forme de cercle.
 *
 * - Démarre à la création de la session (backend pose startedAt). La durée par
 *   défaut (1 h 30) est configurée par l'admin ; le composant la lit sur
 *   GET /api/settings/chrono, qui renvoie aussi l'heure serveur : on calibre
 *   la pendule locale sur le serveur pour rester juste malgré la dérive
 *   d'horloge du poste de l'étudiant.
 * - L'anneau représente le temps RESTANT : plein et vert au départ, il se vide
 *   et passe du vert à l'orange puis au rouge à mesure que le temps s'écoule.
 *   À 0 il s'affiche en rouge plein « 00:00:00 » (indication visuelle seule,
 *   aucun blocage).
 * - Une session créée avant cette fonctionnalité n'a pas de startedAt : on
 *   propose alors un bouton « Démarrer le chrono » (POST /start-chrono).
 */
export default function SessionTimer({ startedAt, onStart, startBusy }) {
  const { t } = useSettings();

  const [cfg, setCfg] = useState(null); // { dureeMinutes, skewMs }
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [configError, setConfigError] = useState(false);
  const skewRef = useRef(0);
  const timerRef = useRef(null);

  // Lecture de la durée définie par l'admin + calibrage sur l'heure serveur.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/settings/chrono')
      .then((data) => {
        if (cancelled) return;
        const dureeMinutes = Number(data?.dureeMinutes) || 0;
        const serverNow = Number(data?.serverNow) || Date.now();
        skewRef.current = serverNow - Date.now();
        setCfg(dureeMinutes > 0 ? { dureeMinutes } : null);
      })
      .catch(() => {
        if (!cancelled) setConfigError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tic du chrono (léger) : rafraîchit l'affichage ~4×/s pour une seconde fluide.
  useEffect(() => {
    if (!startedAt) return undefined;
    timerRef.current = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(timerRef.current);
  }, [startedAt]);

  if (configError) return null; // chrono indisponible : on n'affiche rien.
  if (!cfg) {
    return <div className="session-chrono session-chrono--loading" aria-hidden="true" />;
  }

  const startedMs = startedAt ? Date.parse(startedAt) : NaN;
  const running = Number.isFinite(startedMs) && startedMs > 0;

  const dureeMs = cfg.dureeMinutes * 60 * 1000;
  const realNow = nowMs + skewRef.current;
  const remainingMs = running ? startedMs + dureeMs - realNow : dureeMs;
  const expired = running && remainingMs <= 0;
  const ratio = running
    ? Math.max(0, Math.min(1, remainingMs / dureeMs))
    : 1; // pas encore lancé : cercle plein (gris, bouton Démarrer)

  // Couleur : vert (beaucoup de temps) → jaune → orange → rouge (fin).
  const hue = Math.round(120 * Math.max(0, Math.min(1, ratio)));
  const ringColor = !running
    ? '#aab6c2' // pas encore lancé : anneau neutre + bouton « Démarrer »
    : expired || hue <= 12
      ? '#c0392b'
      : `hsl(${hue}, 78%, 42%)`;

  function formatTime() {
    const total = running ? Math.max(0, Math.floor(remainingMs / 1000)) : 0;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  const label = running
    ? expired
      ? t('workspace.timeUp')
      : t('workspace.timeLeft')
    : t('workspace.chronoLabel');

  const size = 78;
  const stroke = 6;
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;

  // Arc affiché : temps restant (se vide). À 0 : cercle rouge plein bien visible.
  const arc = expired ? 1 : ratio;

  return (
    <div
      className={`session-chrono ${expired ? 'is-expired' : ''} ${running ? 'is-running' : 'is-idle'}`}
      title={`${label}${running ? ` — ${formatTime()}` : ''}`}
    >
      <div className="session-chrono-ring">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${running ? formatTime() : ''}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(127,140,158,0.25)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * arc} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke 0.8s linear, stroke-dasharray 0.25s linear' }}
          />
        </svg>
        <div className={`session-chrono-text ${running ? '' : 'is-idle'}`}>
          {running ? formatTime() : '–:––:––'}
        </div>
      </div>
      <div className="session-chrono-label">{label}</div>
      {!running ? (
        <button
          type="button"
          className="btn-primary session-chrono-start"
          onClick={onStart}
          disabled={startBusy}
        >
          {startBusy ? t('workspace.chronoStarting') : t('workspace.startChrono')}
        </button>
      ) : null}
    </div>
  );
}
