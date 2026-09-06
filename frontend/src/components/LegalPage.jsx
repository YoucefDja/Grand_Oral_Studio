import React from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../settings.jsx';
import { LEGAL_CONTENT } from '../legalContent.js';
import { LEGAL_CONFIG } from '../legalConfig.js';

/** Remplace les jetons {…} d'une ligne par les valeurs légales. */
function fillLine(line, vars) {
  return String(line).replace(/\{(\w+)\}/g, (match, key) =>
    vars[key] !== undefined && vars[key] !== '' ? String(vars[key]) : match
  );
}

/**
 * Page légale générique (mentions légales / confidentialité / CGU).
 * Contenu FR ou EN selon la langue choisie dans l'interface.
 */
export default function LegalPage({ page }) {
  const { lang, t } = useSettings();
  const content = LEGAL_CONTENT[page]?.[lang] || LEGAL_CONTENT[page]?.fr;

  const vars = {
    site: LEGAL_CONFIG.product,
    editor: LEGAL_CONFIG.editor,
    email: LEGAL_CONFIG.contactEmail,
    hostName: LEGAL_CONFIG.host,
    hostAddressFull: LEGAL_CONFIG.hostAddress,
    hostLink: LEGAL_CONFIG.hostUrl,
    year: String(LEGAL_CONFIG.year),
    location: LEGAL_CONFIG.editorCity
      ? LEGAL_CONFIG.editorCity
      : lang === 'en'
        ? 'not disclosed — available on request'
        : 'non publiée — communiquée sur demande',
  };

  return (
    <div>
      <Link to="/" className="muted">← {t('legal.backHome')}</Link>
      <h1 className="page-title">{content.title}</h1>

      {content.notice ? (
        <div className="alert alert-info" style={{ marginTop: 0 }}>
          {content.notice}
        </div>
      ) : null}

      <div className="card panel">
        {content.sections.map((sec, i) => (
          <section key={i} style={{ marginBottom: i === content.sections.length - 1 ? 0 : 22 }}>
            <h2 style={{ fontSize: 17, marginTop: 0, marginBottom: 8 }}>{sec.h}</h2>
            {sec.lines.map((line, j) => {
              const filled = fillLine(line, vars);
              if (filled.startsWith('• ')) {
                return (
                  <p key={j} style={{ margin: '2px 0', paddingLeft: 14 }}>
                    {filled}
                  </p>
                );
              }
              return (
                <p key={j} style={{ margin: '2px 0', lineHeight: 1.6 }}>
                  {filled}
                </p>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
