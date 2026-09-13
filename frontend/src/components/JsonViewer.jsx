import React, { useContext } from 'react';
import { useSettings } from '../settings.jsx';

/**
 * Visionneuse générique et tolérante : rend n'importe quelle donnée JSON
 * produite par le modèle sous forme de sections lisibles (clés humanisées).
 * S'adapte à des clés imprévues sans casser la page.
 */

const LABELS = {
  reformulation: 'Reformulation du sujet',
  mots_cles: 'Mots-clés du sujet',
  mot: 'Mot-clé',
  definition: 'Définition',
  notions_a_maitriser: 'Notions à maîtriser',
  tensions: 'Tensions / contradictions repérables',
  pole_a: 'Pôle A',
  pole_b: 'Pôle B',
  description: 'Description',
  ligne_directrice: 'Ligne directrice (fil rouge)',
  formulations: 'Formulations proposées',
  formulation: 'Formulation',
  pourquoi_discutable: 'Pourquoi elle est discutable',
  pourquoi_bornee_par_le_sujet: 'Pourquoi elle reste bornée par le sujet',
  recommandation: 'Formulation recommandée',
  justification_recommandation: 'Justification de la recommandation',
  axes_recherche: 'Axes de recherche',
  types_sources: 'Types de sources à mobiliser',
  organismes_exemples: 'Organismes, revues & rapports réels',
  donnees_a_rechercher: 'Données chiffrées à rechercher en priorité',
  exemples_entreprises: 'Exemples d’entreprises réelles',
  nom: 'Nom',
  contexte: 'Contexte',
  resultat: 'Résultat / retour',
  apport: 'Apport pour l’analyse',
  consignes_fiches_lecture: 'Consignes pour les fiches de lecture',
  pieges_a_eviter: 'Pièges méthodologiques à éviter',
  sources: 'Sources retenues — résumés',
  titre: 'Source / titre',
  resume: 'Résumé (2-3 phrases)',
  termes: 'Termes & acronymes du glossaire',
  terme: 'Terme',
  duree_totale_minutes: 'Durée totale de l’oral (minutes)',
  sections: 'Sections du plan',
  partie: 'Partie',
  role: 'Rôle dans la démonstration',
  minutes: 'Durée (min)',
  points: 'Points clés',
  repartition_temps: 'Répartition du temps (minutes)',
  slides: 'Slides générées',
  type: 'Type',
  puces: 'Puces (slides)',
  notes_orateur: 'Notes orateur',
  notes_globales: 'Notes globales',
  entreprise: 'Entreprise',
};

const TITLE_HINTS = [
  'formulation',
  'partie',
  'terme',
  'titre',
  'nom',
  'mot',
  'entreprise',
  'axe',
  'question',
];

const QUOTE_KEYS = new Set([
  'formulation',
  'recommandation',
  'ligne_directrice',
  'definition',
  'resume',
  'notes_orateur',
  'notes_globales',
  'description',
  'pourquoi_discutable',
  'pourquoi_bornee_par_le_sujet',
]);

/** Contexte interne fournissant la fonction de traduction aux sous-composants. */
const ViewerCtx = React.createContext(null);

/** Libellé traduit d'une clé de données, avec repli sur l'humanisation locale. */
function labelOf(key, t) {
  const dictKey = 'steps.jv.' + key;
  const translated = t(dictKey);
  if (typeof translated === 'string' && translated !== '' && translated !== dictKey) return translated;
  return humanLabel(key);
}

export function humanLabel(key) {
  if (LABELS[key]) return LABELS[key];
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

/** Affiche une valeur scalaire (string, number, bool). */
function Scalar({ value, quote }) {
  const t = useContext(ViewerCtx);
  const text = typeof value === 'boolean' ? (value ? t('steps.yes') : t('steps.no')) : String(value);
  if (quote) return <p className="quote-value">{text}</p>;
  return <p className="text-value">{text}</p>;
}

/** Cartouche dédié aux objets "tension" { pole_a, pole_b, description }. */
function TensionView({ obj }) {
  const t = useContext(ViewerCtx);
  const a = obj.pole_a || obj['pôle_a'];
  const b = obj.pole_b || obj['pôle_b'];
  return (
    <div className="obj-card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        {a ? <span className="badge badge-progress">{a}</span> : null}
        <span className="muted">{t('steps.vs')}</span>
        {b ? <span className="badge badge-done">{b}</span> : null}
      </div>
      {obj.description ? <p className="text-value" style={{ marginBottom: 0 }}>{obj.description}</p> : null}
    </div>
  );
}

/** Affiche une paire clé/valeur (récursif). */
function Entry({ k, v }) {
  if (isEmptyValue(v)) return null;
  const t = useContext(ViewerCtx);
  const label = labelOf(k, t);

  if (typeof v === 'string') {
    return (
      <div className="data-section">
        <div className="data-label">{label}</div>
        <Scalar value={v} quote={QUOTE_KEYS.has(k)} />
      </div>
    );
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return (
      <div className="data-section">
        <div className="data-label">{label}</div>
        <Scalar value={v} quote={false} />
      </div>
    );
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    const allScalars = v.every((x) => typeof x === 'string' || typeof x === 'number');
    return (
      <div className="data-section">
        <div className="data-label">{label}</div>
        {allScalars ? (
          <ul className="ul-value">
            {v.map((x, i) => (
              <li key={i}>{String(x)}</li>
            ))}
          </ul>
        ) : (
          <div>
            {v.map((item, i) =>
              item && typeof item === 'object' && !Array.isArray(item) ? (
                <ObjCard key={i} obj={item} />
              ) : (
                <Scalar key={i} value={item} quote={typeof item === 'string'} />
              )
            )}
          </div>
        )}
      </div>
    );
  }
  if (isPlainObject(v)) {
    return (
      <div className="data-section">
        <div className="data-label">{label}</div>
        <Nested obj={v} />
      </div>
    );
  }
  return null;
}

function Nested({ obj }) {
  return (
    <div>
      {Object.entries(obj).map(([k, v]) => (
        <Entry key={k} k={k} v={v} />
      ))}
    </div>
  );
}

/** Carte pour un élément d'un tableau d'objets. */
function ObjCard({ obj }) {
  const isTension = obj.pole_a !== undefined || obj['pôle_a'] !== undefined;
  if (isTension) return <TensionView obj={obj} />;

  const titleKey = Object.keys(obj).find((k) => TITLE_HINTS.includes(k) && typeof obj[k] === 'string');
  const title = titleKey ? String(obj[titleKey]) : null;

  return (
    <div className="obj-card">
      {title ? <div className="obj-card-title">{title}</div> : null}
      <Nested obj={obj} />
    </div>
  );
}

/** Racine : affiche un objet JSON en sections, ou un tableau d'objets. */
export default function JsonViewer({ value }) {
  const { t } = useSettings();
  if (!value) return <p className="muted">{t('steps.noData')}</p>;
  return (
    <ViewerCtx.Provider value={t}>
      {Array.isArray(value) ? (
        <div>
          {value.map((item, i) =>
            item && typeof item === 'object' && !Array.isArray(item) ? (
              <ObjCard key={i} obj={item} />
            ) : (
              <Scalar key={i} value={item} quote={typeof item === 'string'} />
            )
          )}
        </div>
      ) : isPlainObject(value) ? (
        <Nested obj={value} />
      ) : (
        <Scalar value={value} quote={false} />
      )}
    </ViewerCtx.Provider>
  );
}
