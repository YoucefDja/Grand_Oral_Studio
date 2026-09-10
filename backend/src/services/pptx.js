/**
 * Génération du support .pptx (pptxgenjs).
 *
 * Mise en page « soutenance Grand Oral CESI » :
 *  - slide de titre : logo CESI + « Grand Oral CESI » + année universitaire +
 *    nom du candidat + sujet (sans le thème, sans la problématique) ;
 *  - slides de contenu dans l'ordre narratif demandé par la méthodologie
 *    (contexte & mots-clés → enjeux → slide Problématique → développement qui
 *    répond à la question → conclusion) ;
 *  - après la slide « Problématique », chaque slide rappelle la problématique
 *    en petit en bas (fil rouge) + numéro de page.
 *
 * Pièges évités :
 *  - pres.layout défini AVANT d'ajouter les slides ;
 *  - couleurs hex sans '#' et sans canal alpha ;
 *  - pas de '•' littéral dans le texte : on passe par l'option bullet: true ;
 *  - un objet d'options neuf à chaque addText (pptxgenjs mute les objets).
 */
const fs = require('fs');
const pptxgen = require('pptxgenjs');
const { NOM, ANNEE, LOGO_PATH, LOGO_DISPO } = require('../config/soutenance');
const { recupererLogosSupport } = require('./entrepriseLogos');

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

/** Problématique retenue par l'étudiant (recommandation) ou 1re formulation. */
function problematiqueRetenue(session) {
  const probleme = session.data && session.data.probleme;
  if (!probleme || typeof probleme !== 'object') return '';
  const formulations = Array.isArray(probleme.formulations) ? probleme.formulations : [];
  const recommandee = String(probleme.recommandation || '').trim();
  const retenue =
    formulations.find(
      (f) => f && typeof f === 'object' && String(f.formulation || '').trim() === recommandee
    ) || formulations[0];
  return retenue && typeof retenue.formulation === 'string' ? retenue.formulation.trim() : '';
}

function isProblemeSlide(item) {
  const type = String(item.type || '').toLowerCase();
  const titre = String(item.titre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return type.includes('problematique') || type.includes('problem') || titre.includes('problematique');
}

/** La slide raconte-t-elle une entreprise réelle (donc : logo + chiffres clés) ? */
function isExempleEntreprise(item) {
  const type = String(item.type || '').toLowerCase();
  return type.includes('exemple') || type.includes('entreprise') || Boolean(item.nom_entreprise);
}

/** Initiales d'une entreprise, pour la pastille de repli si le logo manque. */
function initialesEntreprise(nom) {
  const mots = String(nom || '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (!mots.length) return '?';
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

/**
 * Chiffres clés exploitables de la slide : priorité au visuel chiffré, puis
 * aux entrées `chiffres_cles` fournies par l'IA.
 */
function chiffresCles(item) {
  const explicites = Array.isArray(item.chiffres_cles) ? item.chiffres_cles : [];
  const depuisVisuel =
    item.visuel && Array.isArray(item.visuel.donnees)
      ? item.visuel.donnees
          .filter((d) => d && (d.valeur !== undefined && d.valeur !== null))
          .map((d) => ({ libelle: d.libelle, valeur: d.valeur }))
      : [];
  return (explicites.length ? explicites : depuisVisuel)
    .filter((d) => d && (d.valeur !== undefined && d.valeur !== null))
    .slice(0, 3);
}

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

/** Dimensions d'une image PNG depuis son en-tête (pour respecter les proportions). */
function pngSize(buffer) {
  if (!buffer || buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
}

/** Charge le logo CESI en base64 (null si absent — le rendu continue sans lui). */
function cesiLogo() {
  if (!LOGO_DISPO) return null;
  try {
    const buffer = fs.readFileSync(LOGO_PATH);
    const size = pngSize(buffer);
    if (!size) return null;
    return { data: `data:image/png;base64,${buffer.toString('base64')}`, size };
  } catch {
    return null;
  }
}

/**
 * Slide de titre — logo CESI, Grand Oral CESI, année universitaire, nom du
 * candidat et SUJET SEUL (sans thème, sans problématique).
 */
function addTitleSlide(pres, { titre, logo }) {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.WHITE };

  if (logo) {
    const maxW = 2.6;
    const maxH = 1.15;
    let h = maxH;
    let w = h * (logo.size.w / logo.size.h);
    if (w > maxW) {
      w = maxW;
      h = w * (logo.size.h / logo.size.w);
    }
    slide.addImage({
      data: logo.data,
      x: (LAYOUT_W - w) / 2,
      y: 0.55,
      w,
      h,
    });
  }

  // Bande supérieure discrète pour ancrer la charte CESI.
  slide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: LAYOUT_W,
    h: 0.16,
    fill: { color: COLORS.PRIMARY },
    line: { color: COLORS.PRIMARY },
  });

  const titreText = String(titre || '').trim();
  const fontSize = titreText.length > 100 ? 24 : titreText.length > 55 ? 28 : 32;

  slide.addText('GRAND ORAL CESI', {
    x: 1,
    y: 2.05,
    w: LAYOUT_W - 2,
    h: 0.5,
    fontSize: 16,
    bold: true,
    charSpacing: 6,
    color: COLORS.ACCENT,
    align: 'center',
  });

  slide.addText(titreText, {
    x: 1.2,
    y: 2.6,
    w: LAYOUT_W - 2.4,
    h: 1.9,
    fontSize,
    bold: true,
    color: COLORS.DARK,
    align: 'center',
    valign: 'middle',
  });

  slide.addShape(pres.ShapeType.line, {
    x: (LAYOUT_W - 3.2) / 2,
    y: 4.75,
    w: 3.2,
    h: 0,
    line: { color: COLORS.ACCENT, width: 1.5 },
  });

  slide.addText(NOM, {
    x: 1,
    y: 5.0,
    w: LAYOUT_W - 2,
    h: 0.6,
    fontSize: 24,
    bold: true,
    color: COLORS.PRIMARY,
    align: 'center',
  });

  slide.addText(`Année universitaire ${ANNEE}`, {
    x: 1,
    y: 5.7,
    w: LAYOUT_W - 2,
    h: 0.45,
    fontSize: 14,
    color: COLORS.GREY,
    align: 'center',
  });
}

/** Rappel de la problématique en pied de slide (fil rouge visible). */
function addProblemFooter(slide, problematique) {
  const texte = String(problematique || '').trim();
  if (!texte) return;
  slide.addText(`Problématique : « ${texte} »`, {
    x: 0.6,
    y: LAYOUT_H - 0.7,
    w: LAYOUT_W - 2.4,
    h: 0.6,
    fontSize: 9,
    italic: true,
    color: COLORS.GREY,
    align: 'left',
    valign: 'middle',
    wrap: true,
  });
}

/** Pied de slide : rappel de la problématique après sa slide dédiée. */
function addFooter(slide, withProblem) {
  if (withProblem) addProblemFooter(slide, slide.problematiqueTexte || '');
}

/**
 * Barre de progression fine intégrée au bandeau d'en-tête : matérialise
 * l'avancement dans la présentation (curseur rempli jusqu'à la slide courante)
 * et affiche « n / total » juste en dessous, pour que le jury et l'étudiant
 * situent immédiatement le temps restant (critère 2.4, gestion du temps).
 */
function addProgressBar(pres, slide, index, total) {
  const barY = 0.86;
  const barH = 0.09;
  const barX = 0.5;
  const barW = LAYOUT_W - 1.0;

  // Rail vide (fond clair, discret).
  slide.addShape(pres.ShapeType.rect, {
    x: barX,
    y: barY,
    w: barW,
    h: barH,
    fill: { color: COLORS.LIGHT },
    line: { color: COLORS.LIGHT },
  });

  // Partie remplie proportionnelle à la position de la slide.
  const ratio = total > 0 ? Math.min(Math.max(index / total, 0), 1) : 0;
  if (ratio > 0) {
    slide.addShape(pres.ShapeType.rect, {
      x: barX,
      y: barY,
      w: barW * ratio,
      h: barH,
      fill: { color: COLORS.ACCENT },
      line: { color: COLORS.ACCENT },
    });
  }

  slide.addText(`${index} / ${total}`, {
    x: LAYOUT_W - 1.7,
    y: barY + barH + 0.02,
    w: 1.2,
    h: 0.24,
    fontSize: 9,
    color: COLORS.LIGHT,
    align: 'right',
  });
}

/**
 * Zone de contenu réutilisable : liste à puces bornée à une zone donnée.
 * Mutualise le rendu entre la slide standard et la slide « exemple entreprise ».
 */
function ajouterPuces(slide, puces, zone) {
  if (!puces.length) return;
  slide.addText(
    puces.map((p) => ({
      text: p,
      options: { bullet: true, breakLine: true, paraSpaceAfter: 8 },
    })),
    {
      x: zone.x,
      y: zone.y,
      w: zone.w,
      h: zone.h,
      fontSize: zone.fontSize || 15,
      color: COLORS.DARK,
      valign: 'top',
      wrap: true,
    }
  );
}

/**
 * Slide « exemple d'entreprise » : encadré dédié avec le logo réel de la marque
 * (téléchargé à la demande), chips de chiffres clés mis en avant, puis les
 * puces d'analyse. Jamais un simple bloc de texte : on identifie l'entreprise
 * d'un coup d'œil avant de lire.
 */
function addExempleSlide(pres, item, showProblem, problematique, progress, logo) {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.WHITE };
  if (showProblem && problematique) slide.problematiqueTexte = problematique;

  // Bandeau d'en-tête
  slide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: LAYOUT_W,
    h: 1.05,
    fill: { color: COLORS.PRIMARY },
    line: { color: COLORS.PRIMARY },
  });
  slide.addText(item.titre || 'Exemple', {
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
  if (progress) addProgressBar(pres, slide, progress.index, progress.total);

  // --- Carte entreprise : logo + nom + secteur ---
  const carteY = 1.3;
  const carteH = 1.5;
  slide.addShape(pres.ShapeType.roundRect, {
    x: 0.55,
    y: carteY,
    w: LAYOUT_W - 1.1,
    h: carteH,
    fill: { color: COLORS.LIGHT },
    line: { color: COLORS.ACCENT, width: 1 },
    rectRadius: 0.08,
  });

  const nom = String(item.nom_entreprise || '').trim();
  const secteur = String(item.secteur || '').trim();
  const logoBox = 0.95;
  const logoX = 0.85;
  const logoY = carteY + (carteH - logoBox) / 2;

  if (logo) {
    // Le logo est posé sur une pastille blanche : il reste lisible quelle que
    // soit la couleur d'origine de la marque.
    slide.addShape(pres.ShapeType.roundRect, {
      x: logoX,
      y: logoY,
      w: logoBox,
      h: logoBox,
      fill: { color: COLORS.WHITE },
      line: { color: COLORS.SOFT, width: 0.75 },
      rectRadius: 0.06,
    });
    const marge = 0.12;
    slide.addImage({
      data: logo.data,
      x: logoX + marge,
      y: logoY + marge,
      w: logoBox - marge * 2,
      h: logoBox - marge * 2,
    });
  } else {
    // Repli : pastille d'initiales aux couleurs CESI (jamais d'image cassée).
    slide.addShape(pres.ShapeType.roundRect, {
      x: logoX,
      y: logoY,
      w: logoBox,
      h: logoBox,
      fill: { color: COLORS.PRIMARY },
      line: { color: COLORS.PRIMARY },
      rectRadius: 0.06,
    });
    slide.addText(initialesEntreprise(nom), {
      x: logoX,
      y: logoY,
      w: logoBox,
      h: logoBox,
      fontSize: 22,
      bold: true,
      color: COLORS.WHITE,
      align: 'center',
      valign: 'middle',
    });
  }

  if (nom) {
    slide.addText(nom, {
      x: logoX + logoBox + 0.3,
      y: carteY + 0.18,
      w: LAYOUT_W - logoX - logoBox - 1.2,
      h: 0.5,
      fontSize: 22,
      bold: true,
      color: COLORS.PRIMARY,
      valign: 'middle',
    });
  }
  if (secteur) {
    slide.addText(secteur, {
      x: logoX + logoBox + 0.3,
      y: carteY + 0.68,
      w: LAYOUT_W - logoX - logoBox - 1.2,
      h: 0.4,
      fontSize: 13,
      color: COLORS.GREY,
      valign: 'middle',
    });
  }
  if (String(item.source || '').trim()) {
    slide.addText(`Source : ${String(item.source).trim()}`, {
      x: logoX + logoBox + 0.3,
      y: carteY + 1.05,
      w: LAYOUT_W - logoX - logoBox - 1.2,
      h: 0.3,
      fontSize: 9,
      italic: true,
      color: COLORS.GREY,
      valign: 'middle',
    });
  }

  // --- Chips de chiffres clés ---
  const chiffres = chiffresCles(item);
  let chipsBottom = carteY + carteH;
  if (chiffres.length) {
    const chipsY = carteY + carteH + 0.25;
    const gap = 0.25;
    const chipW = (LAYOUT_W - 1.1 - gap * (chiffres.length - 1)) / chiffres.length;
    const chipH = 1.0;
    chiffres.forEach((c, i) => {
      const x = 0.55 + i * (chipW + gap);
      slide.addShape(pres.ShapeType.roundRect, {
        x,
        y: chipsY,
        w: chipW,
        h: chipH,
        fill: { color: COLORS.WHITE },
        line: { color: COLORS.ACCENT, width: 1 },
        rectRadius: 0.08,
      });
      slide.addText(String(c.valeur), {
        x,
        y: chipsY + 0.1,
        w: chipW,
        h: 0.5,
        fontSize: 20,
        bold: true,
        color: COLORS.PRIMARY,
        align: 'center',
        valign: 'middle',
      });
      slide.addText(String(c.libelle || ''), {
        x: x + 0.1,
        y: chipsY + 0.58,
        w: chipW - 0.2,
        h: 0.34,
        fontSize: 10,
        color: COLORS.GREY,
        align: 'center',
        valign: 'middle',
      });
    });
    chipsBottom = chipsY + chipH;
  }

  // --- Puces d'analyse, sous la carte et les chips ---
  const puces = (Array.isArray(item.puces) ? item.puces : []).map(cleanBullet).filter(Boolean);
  const bodyY = chipsBottom + 0.25;
  const bodyH = (showProblem && problematique ? LAYOUT_H - 0.8 : LAYOUT_H - 0.2) - bodyY;
  if (puces.length && bodyH > 0.5) {
    ajouterPuces(slide, puces, { x: 0.55, y: bodyY, w: LAYOUT_W - 1.1, h: bodyH, fontSize: 14 });
  }

  if (item.notes_orateur) slide.addNotes(String(item.notes_orateur).trim());
  return slide;
}

/** Slide de contenu standard (bandeau titre + puces + notes orateur). */
function addContentSlide(pres, item, showProblem, problematique, progress) {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.WHITE };
  if (showProblem && problematique) slide.problematiqueTexte = problematique;

  // Bandeau d'en-tête
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

  // Barre de progression fine, intégrée sous le bandeau.
  if (progress) addProgressBar(pres, slide, progress.index, progress.total);

  const puces = (Array.isArray(item.puces) ? item.puces : [])
    .map(cleanBullet)
    .filter(Boolean);

  // Zone de texte réduite quand la problématique occupe le pied de slide.
  const bodyH = showProblem && problematique ? LAYOUT_H - 3.1 : LAYOUT_H - 2.2;
  if (puces.length > 0) {
    ajouterPuces(slide, puces, {
      x: 0.55,
      y: 1.3,
      w: LAYOUT_W - 1.1,
      h: bodyH,
      fontSize: 15,
    });
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
  return slide;
}

/**
 * @param {object} session  Session Mongoose (session.data.support.slides)
 * @returns {{ buffer: Buffer, fileName: string }}
 */
async function buildPptx(session) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // AVANT tout addSlide
  pres.author = NOM;

  const titre = session.titre || 'Présentation Grand Oral';
  const problematique = problematiqueRetenue(session);
  const slides = Array.isArray(session.data?.support?.slides) ? session.data.support.slides : [];

  // ---- Slide de titre (jamais le thème, jamais la problématique) ----
  addTitleSlide(pres, { titre, logo: cesiLogo() });

  // ---- Détermine à partir de quelle slide la problématique doit être
  //      rappelée en pied de slide (toutes celles APRÈS la slide dédiée) ----
  const problemIndex = slides.findIndex((s) => isProblemeSlide(s));
  const showProblemAfter = problematique && problemIndex >= 0 ? problemIndex + 1 : -1;

  // Conclusion systématique ajoutée si le modèle ne l'a pas produite.
  const hasConclusion = slides.some(
    (s) =>
      String(s.type || '').toLowerCase().includes('conclusion') ||
      /conclusion|ouverture/i.test(String(s.titre || ''))
  );
  const extraConclusion = !hasConclusion;

  const total = slides.length + 1 + (extraConclusion ? 1 : 0);
  let footerIndex = 1;

  // ---- Logos des entreprises citées (téléchargés à la demande, avec cache).
  //      Un échec n'interrompt jamais l'export : repli sur pastille d'initiales.
  const logos = await recupererLogosSupport(slides);

  // ---- Slides de contenu ----
  slides.forEach((item, i) => {
    footerIndex += 1;
    const showProblem = i >= showProblemAfter;
    const progress = { index: footerIndex, total };
    const slide = isExempleEntreprise(item)
      ? addExempleSlide(pres, item, showProblem, problematique, progress, logos.get(i) || null)
      : addContentSlide(pres, item, showProblem, problematique, progress);
    addFooter(slide, showProblem);
  });

  // ---- Slide de conclusion ajoutée si absente (rappelle le fil rouge) ----
  if (extraConclusion) {
    footerIndex += 1;
    const conclusionItem = {
      titre: 'Conclusion',
      type: 'conclusion',
      puces: [
        'Synthèse de la démonstration et réponse apportée à la problématique.',
      ],
      notes_orateur: '',
    };
    if (problematique) {
      conclusionItem.puces.push(`La démonstration a répondu à : « ${problematique} ».`);
    }
    const withProblemFooter = Boolean(problematique);
    const slide = addContentSlide(pres, conclusionItem, withProblemFooter, problematique, {
      index: footerIndex,
      total,
    });
    addFooter(slide, withProblemFooter);
  }

  const buffer = await pres.write({ outputType: 'nodebuffer' });
  return { buffer, fileName: `${slugifyTitre(titre)}.pptx` };
}

module.exports = { buildPptx };
