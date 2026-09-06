/**
 * Génération du support .pptx (pptxgenjs).
 *
 * Pièges évités :
 *  - pres.layout défini AVANT d'ajouter les slides ;
 *  - couleurs hex sans '#' et sans canal alpha ;
 *  - pas de '•' littéral dans le texte : on passe par l'option bullet: true ;
 *  - un objet d'options neuf à chaque addText (pptxgenjs mute les objets).
 */
const pptxgen = require('pptxgenjs');

const COLORS = {
  PRIMARY: '1F4E79', // bleu CESI foncé
  ACCENT: '2E74B5', // bleu CESI clair
  LIGHT: 'D9E2F3', // bandeau très clair
  WHITE: 'FFFFFF',
  DARK: '262626',
  GREY: '595959',
  SOFT: 'BFBFBF',
};

const LAYOUT_W = 13.33;
const LAYOUT_H = 7.5;

function slugifyTitre(titre) {
  const slug = String(titre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'presentation-grand-oral';
}

function cleanBullet(text) {
  return String(text || '')
    .replace(/\r/g, '')
    // retire les marqueurs de liste déjà présents (évite le double bullet)
    .replace(/^\s*(?:[-•▪◦‣*]|\d{1,2}[.)])\s+/, '')
    .trim();
}

function addFooter(slide, index, total) {
  slide.addText('Grand Oral Studio — Grand Oral CESI', {
    x: 0.4,
    y: LAYOUT_H - 0.38,
    w: 6,
    h: 0.3,
    fontSize: 9,
    color: COLORS.GREY,
    align: 'left',
  });
  slide.addText(`${index} / ${total}`, {
    x: LAYOUT_W - 1.6,
    y: LAYOUT_H - 0.38,
    w: 1.2,
    h: 0.3,
    fontSize: 9,
    color: COLORS.GREY,
    align: 'right',
  });
}

/**
 * @param {object} session  Session Mongoose (session.data.support.slides)
 * @returns {{ buffer: Buffer, fileName: string }}
 */
async function buildPptx(session) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // AVANT tout addSlide
  pres.author = 'Grand Oral Studio';

  const titre = session.titre || 'Présentation Grand Oral';
  const theme = session.theme || '';
  const ligneDirectrice = (session.ligneDirectrice || '').trim();
  const slides = Array.isArray(session.data?.support?.slides) ? session.data.support.slides : [];

  // ---- Slide de titre ----
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: COLORS.PRIMARY };
  titleSlide.addText('GRAND ORAL — CESI ÉCOLE D’INGÉNIEURS', {
    x: 0.8,
    y: 1.5,
    w: LAYOUT_W - 1.6,
    h: 0.4,
    fontSize: 14,
    charSpacing: 4,
    color: COLORS.LIGHT,
    align: 'center',
  });
  titleSlide.addText(titre, {
    x: 0.8,
    y: 2.1,
    w: LAYOUT_W - 1.6,
    h: 1.6,
    fontSize: 34,
    bold: true,
    color: COLORS.WHITE,
    align: 'center',
    valign: 'middle',
  });
  if (theme) {
    titleSlide.addText(theme, {
      x: 0.8,
      y: 3.9,
      w: LAYOUT_W - 1.6,
      h: 0.4,
      fontSize: 18,
      color: COLORS.LIGHT,
      align: 'center',
    });
  }
  if (ligneDirectrice) {
    titleSlide.addText(`« ${ligneDirectrice} »`, {
      x: 1.6,
      y: 4.7,
      w: LAYOUT_W - 3.2,
      h: 1.2,
      fontSize: 13,
      italic: true,
      color: COLORS.SOFT,
      align: 'center',
      valign: 'top',
    });
  }

  // ---- Slides de contenu ----
  const total = slides.length + 1;
  let footerIndex = 1;

  for (const item of slides) {
    footerIndex += 1;
    const slide = pres.addSlide();
    slide.background = { color: COLORS.WHITE };

    // bandeau d'en-tête
    slide.addShape(pres.ShapeType.rect, {
      x: 0,
      y: 0,
      w: LAYOUT_W,
      h: 1.05,
      fill: { color: COLORS.PRIMARY },
      line: { color: COLORS.PRIMARY },
    });
    slide.addText(item.titre || 'Slide', {
      x: 0.5,
      y: 0.14,
      w: LAYOUT_W - 2.6,
      h: 0.8,
      fontSize: 20,
      bold: true,
      color: COLORS.WHITE,
      valign: 'middle',
    });
    if (item.type) {
      slide.addText(String(item.type).replace(/_/g, ' '), {
        x: LAYOUT_W - 2.2,
        y: 0.14,
        w: 1.8,
        h: 0.8,
        fontSize: 10,
        color: COLORS.LIGHT,
        align: 'right',
        valign: 'middle',
      });
    }

    const puces = (Array.isArray(item.puces) ? item.puces : [])
      .map(cleanBullet)
      .filter(Boolean);
    if (puces.length > 0) {
      // Un paragraphe par puce, bullet géré par la lib (jamais de '•' littéral)
      slide.addText(
        puces.map((p) => ({
          text: p,
          options: { bullet: true, breakLine: true, paraSpaceAfter: 10 },
        })),
        {
          x: 0.5,
          y: 1.3,
          w: LAYOUT_W - 1.0,
          h: LAYOUT_H - 2.2,
          fontSize: 15,
          color: COLORS.DARK,
          valign: 'top',
          wrap: true,
        }
      );
    } else {
      slide.addText('Détail en notes orateur.', {
        x: 0.5,
        y: 1.4,
        w: LAYOUT_W - 1.0,
        h: 0.5,
        fontSize: 14,
        italic: true,
        color: COLORS.GREY,
      });
    }

    if (item.notes_orateur) {
      slide.addNotes(String(item.notes_orateur).trim());
    }
    addFooter(slide, footerIndex, total);
  }

  // ---- Slide de conclusion systématique si absente (rappelle le fil rouge) ----
  const hasConclusion = slides.some(
    (s) =>
      String(s.type || '').toLowerCase().includes('conclusion') ||
      /conclusion|ouverture/i.test(String(s.titre || ''))
  );
  if (!hasConclusion) {
    footerIndex += 1;
    const slide = pres.addSlide();
    slide.background = { color: COLORS.WHITE };
    slide.addShape(pres.ShapeType.rect, {
      x: 0,
      y: 0,
      w: LAYOUT_W,
      h: 1.05,
      fill: { color: COLORS.ACCENT },
      line: { color: COLORS.ACCENT },
    });
    slide.addText('Conclusion', {
      x: 0.5,
      y: 0.14,
      w: LAYOUT_W - 1,
      h: 0.8,
      fontSize: 20,
      bold: true,
      color: COLORS.WHITE,
      valign: 'middle',
    });
    const body = [
      "Synthèse de la démonstration et réponse apportée à la problématique.",
    ];
    if (ligneDirectrice) body.push(`Ligne directrice de la présentation : ${ligneDirectrice}`);
    slide.addText(
      body.map((p) => ({ text: p, options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } })),
      {
        x: 0.5,
        y: 1.3,
        w: LAYOUT_W - 1.0,
        h: LAYOUT_H - 2.2,
        fontSize: 16,
        color: COLORS.DARK,
        valign: 'top',
        wrap: true,
      }
    );
    addFooter(slide, footerIndex, total);
  }

  const buffer = await pres.write({ outputType: 'nodebuffer' });
  return { buffer, fileName: `${slugifyTitre(titre)}.pptx` };
}

module.exports = { buildPptx };
