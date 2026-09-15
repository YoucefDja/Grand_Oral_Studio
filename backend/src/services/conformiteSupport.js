/**
 * Contrôle de conformité du support avant export .pptx.
 *
 * La grille d'évaluation du jury CESI note 14 critères répartis en deux blocs
 * (fond /56 et forme /56). Certains de ces critères reposent sur des attendus
 * STRUCTURELS qui doivent être présents dans le diaporama, faute de quoi
 * l'étudiant se présente devant le jury sans l'élément évalué (ex. aucune slide
 * « Problématique », aucun benchmark d'entreprise, aucune donnée chiffrée).
 *
 * Ce module ne juge pas la QUALITÉ rédactionnelle (qui relève de la génération
 * et de la relecture humaine) : il vérifie de façon déterministe que chaque
 * attendu structurel est bien matérialisé par au moins une slide, et renvoie la
 * liste des manques. L'appelant décide de bloquer l'export (règle produit
 * retenue) ou de simples avertir.
 *
 * Les correspondances slide ↔ critère sont volontairement lisibles : chaque
 * manque renvoyé cite le numéro du critère de la grille qu'il empêche de
 * satisfaire, pour que l'étudiant sache quoi corriger.
 */

const { httpError } = require('../utils/httpError');

/** Normalise un texte (minuscules, sans accents) pour les recherches lexicales. */
function normaliser(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Texte agrégé d'une slide : titre + puces + notes + légende du visuel. */
function texteSlide(slide) {
  if (!slide || typeof slide !== 'object') return '';
  const puces = Array.isArray(slide.puces) ? slide.puces.join(' ') : '';
  const visuel = slide.visuel && typeof slide.visuel === 'object' ? slide.visuel.legende || '' : '';
  return normaliser(`${slide.titre || ''} ${puces} ${slide.notes_orateur || ''} ${visuel}`);
}

function typeDe(slide) {
  return normaliser(slide && slide.type).replace(/[^a-z]/g, '');
}

/** Un champ exploitable : objet/tableau non vide ou chaîne non vide. */
function rempli(valeur) {
  if (valeur === undefined || valeur === null) return false;
  if (Array.isArray(valeur)) return valeur.length > 0;
  if (typeof valeur === 'object') return Object.keys(valeur).length > 0;
  return String(valeur).trim() !== '';
}

/** Y a-t-il au moins un visuel réellement exploitable sur les slides ? */
function aUnVisuelExploitable(slide) {
  const visuel = slide && slide.visuel;
  if (!visuel || typeof visuel !== 'object') return false;
  return Array.isArray(visuel.donnees) && visuel.donnees.length > 0;
}

// Mots-clés signalant une donnée chiffrée rapportée (et non un simple numéro
// de slide ou une année de contexte).
const MARQUEURS_CHIFFRES = [
  'chiffre',
  'donnee',
  'pourcent',
  'enquete',
  'etude',
  'barometre',
  'sondage',
  'statistique',
];

// Ordre impératif des blocs du support (structure_support_grand_oral_cesi.md) :
// Contexte → Enjeux → Problématique → Existant → Statistiques → Cas réels →
// Solutions → Conclusion. `null` = bloc facultatif dans une session donnée
// (ex. un sujet peut n'avoir aucun cas d'entreprise réel à citer).
// Rappel : le volume cible du support est de 20 slides page de titre comprise
// (voir services/supportLayout.js pour la ligne directrice continue).
const VOLUME_CIBLE_TOTAL = 20;

const ORDRE_BLOCS = [
  { cle: 'contexte', libelle: 'Contexte', tester: (t) => t.includes('contexte') },
  { cle: 'enjeux', libelle: 'Enjeux', tester: (t) => t.includes('enjeux') },
  { cle: 'problematique', libelle: 'Problématique', tester: (t) => t.includes('problematique') },
  {
    cle: 'existant',
    libelle: 'Existant (fondements & théorie)',
    tester: (t) => t.includes('existant'),
    facultatif: true,
  },
  { cle: 'donnees', libelle: 'Données statistiques et chiffrées', tester: (t) => t.includes('donnees') },
  {
    cle: 'exemple_entreprise',
    libelle: 'Cas réels d’entreprise',
    tester: (t) => t.includes('exempleentreprise'),
    facultatif: true,
  },
  { cle: 'solutions', libelle: 'Solutions et préconisations', tester: (t) => t.includes('solutions') },
  { cle: 'conclusion', libelle: 'Conclusion', tester: (t) => t.includes('conclusion') },
];

/**
 * Vérifie que les blocs se succèdent dans l'ordre imposé par la spécification
 * de structure du support. Un bloc facultatif manquant n'est pas une erreur ;
 * en revanche un bloc qui apparaît APRÈS un bloc qu'il devrait suivre est une
 * rupture de l'effet entonnoir, que le jury sanctionne (critère 2.1).
 */
function detecterOrdreInvalide(types) {
  const positions = ORDRE_BLOCS.map((bloc) => ({
    ...bloc,
    index: types.findIndex((t) => bloc.tester(t)),
  }));
  const presents = positions.filter((p) => p.index !== -1);

  for (let i = 1; i < presents.length; i += 1) {
    if (presents[i].index < presents[i - 1].index) {
      return {
        avant: presents[i - 1].libelle,
        apres: presents[i].libelle,
      };
    }
  }
  return null;
}

/**
 * Analyse le support et renvoie les manques structurels au regard de la grille
 * du jury. Un manque = { critere, message }.
 *
 * @param {object} session Session Mongoose (data.support.slides, data.plan, data.recherche).
 * @returns {{ slides: number, manques: Array<{critere:string, message:string}> }}
 */
function detecterManquesSupport(session) {
  const slides = Array.isArray(session?.data?.support?.slides) ? session.data.support.slides : [];
  const manques = [];
  const ajouter = (critere, message) => manques.push({ critere, message });

  if (slides.length === 0) {
    return {
      slides: 0,
      manques: [{ critere: '—', message: 'Le support ne contient aucune slide exploitable.' }],
    };
  }

  const textes = slides.map(texteSlide);
  const types = slides.map(typeDe);

  // ---- Ordre structurel imposé par la spécification du support ----
  const ordreInvalide = detecterOrdreInvalide(types);
  if (ordreInvalide) {
    ajouter(
      '2.1',
      `L’enchaînement des blocs ne respecte pas la structure imposée : « ${ordreInvalide.apres} » apparaît avant « ${ordreInvalide.avant} », alors que l’ordre attendu est Contexte → Enjeux → Problématique → Existant → Statistiques → Cas réels → Solutions → Conclusion.`
    );
  }

  const aSlide = (predicat) => slides.some((slide, i) => predicat(slide, textes[i], types[i]));
  const aTexte = (regex) => textes.some((t) => regex.test(t));

  // ---- Critère 2.1 : structure et fil directeur ----
  if (!aSlide((_s, _t, type) => type.includes('problematique') || type.includes('problem'))) {
    ajouter(
      '2.1',
      'Aucune slide « Problématique » identifiable : le fil directeur de la démonstration n’est pas visible.'
    );
  }

  const conclusionIndex = slides.findIndex(
    (slide, i) => types[i].includes('conclusion') || /conclusion/.test(textes[i])
  );
  if (conclusionIndex === -1) {
    ajouter('2.1', 'Aucune slide de conclusion : la démonstration n’est pas refermée.');
  }

  // ---- Critère 2.7 : prise de recul et ouverture d'esprit ----
  if (conclusionIndex !== -1) {
    const texteConclusion = textes[conclusionIndex];
    const aQuestionOuverture =
      texteConclusion.includes('?') &&
      /(ouverture|avenir|perspective|demain|futur|prospective|a l'avenir|a terme)/.test(texteConclusion);
    const ouverturePlan = session?.data?.plan?.ouverture;
    if (!aQuestionOuverture && !rempli(ouverturePlan)) {
      ajouter(
        '2.7',
        'La conclusion ne porte pas de question d’ouverture prospective (l’ouverture reste notée comme absente).'
      );
    }
  }

  // ---- Critère 1.1 : présentation du contexte ----
  if (!aSlide((_s, _t, type) => type.includes('contexte'))) {
    ajouter('1.1', 'Aucune slide de contexte : le jury évalue la présentation du sujet et son positionnement stratégique.');
  } else if (!aTexte(/source\s*:/)) {
    ajouter(
      '1.1',
      'Aucune source citée (« Source : … ») sous les chiffres du contexte : les données ne sont pas attribuées.'
    );
  }

  // ---- Critère 1.2 : enjeux dégagés ----
  if (!aSlide((_s, _t, type) => type.includes('enjeux'))) {
    ajouter('1.2', 'Aucune slide d’enjeux : les dimensions TOHEE attendues par le jury ne sont pas exposées.');
  }

  // ---- Critère 1.3 : concepts et connaissances théoriques ----
  const notionsAnalyse = Array.isArray(session?.data?.analyse?.notions_a_maitriser)
    ? session.data.analyse.notions_a_maitriser
    : [];
  const referencesRecherche = Array.isArray(session?.data?.recherche?.references_theoriques)
    ? session.data.recherche.references_theoriques
    : [];
  const aReferencesExplicites = aTexte(/(modele|theorie|theorique|norme|referentiel|cadre\s|auteur|concept)/);
  if (notionsAnalyse.length === 0 && referencesRecherche.length === 0 && !aReferencesExplicites) {
    ajouter(
      '1.3',
      'Aucun concept théorique nommé (modèle, norme, auteur, cadre) dans les slides : la rigueur académique attendue par la grille n’est pas démontrée.'
    );
  }

  // ---- Critère 1.4 : benchmark et pratiques professionnelles ----
  const aExempleEntreprise = aSlide(
    (_s, texte, type) =>
      type.includes('exemple') ||
      /(entreprise|cas\s|societe|groupe|firme|start-?up|startup|pme|eti|grand\s*compte|multinationale)/.test(texte)
  );
  if (!aExempleEntreprise) {
    ajouter(
      '1.4',
      'Aucun exemple d’entreprise réelle identifié : le benchmark exigé par le jury est absent.'
    );
  }

  // ---- Critères 1.1 / 1.2 / 1.6 : données chiffrées sourcées et exploitables ----
  const aChiffres = slides.some((slide, i) => {
    if (aUnVisuelExploitable(slide)) {
      const visuel = slide.visuel;
      const chiffre = Array.isArray(visuel.donnees)
        ? visuel.donnees.some((d) => {
            if (!d || typeof d !== 'object') return false;
            return ['valeur', 'valeur_a', 'valeur_b'].some((cle) => typeof d[cle] === 'number');
          })
        : false;
      if (chiffre) return true;
    }
    return MARQUEURS_CHIFFRES.some((m) => textes[i].includes(m)) || /\d+([.,]\d+)?\s*%/.test(textes[i]);
  });
  if (!aChiffres) {
    ajouter(
      '1.2/1.6',
      'Aucune donnée chiffrée exploitable (valeur numérique ou pourcentage) dans le développement : le jury attend des données actuelles et quantifiées, pas des généralités.'
    );
  }

  // ---- Critère 2.4 : impact visuel ----
  const avecVisuel = slides.filter(aUnVisuelExploitable).length;
  if (avecVisuel === 0) {
    ajouter(
      '2.4',
      'Aucun visuel (graphique, comparaison, frise) dans le support : l’impact visuel attendu par le jury est absent.'
    );
  }
  const aForme = slides.some(
    (slide) => typeof slide.forme_visuelle === 'string' && slide.forme_visuelle.trim() !== ''
  );
  if (!aForme && avecVisuel === 0) {
    ajouter(
      '2.4',
      'Aucune indication de mise en forme (“forme_visuelle”) : le support risque de se réduire à des blocs de texte.'
    );
  }

  // ---- Critère 2.6 : capacités de synthèse ----
  const surcharges = slides.filter((slide) => Array.isArray(slide.puces) && slide.puces.length > 6).length;
  if (surcharges > 0) {
    ajouter(
      '2.6',
      `${surcharges} slide(s) portent plus de 6 puces : la synthèse attendue (aller à l’essentiel) n’est pas respectée.`
    );
  }

  // ---- Critère 1.4 : benchmark condensé (une slide, deux au maximum) ----
  const slidesCas = slides.filter(
    (slide, i) => types[i].includes('exempleentreprise') || /cas d.entreprise|cas reel/.test(textes[i])
  );
  if (slidesCas.length > 2) {
    ajouter(
      '1.4',
      `Les cas d’entreprises occupent ${slidesCas.length} slides : ils doivent être regroupés sur une seule slide (deux au maximum) pour laisser la place à la réponse à la problématique.`
    );
  }

  // ---- Ligne directrice continue (critères 2.1 et 2.4) ----
  const sansTransition = slides.filter(
    (slide, i) =>
      !/conclusion/.test(types[i]) && !String(slide.transition || '').trim()
  ).length;
  if (slides.length > 3 && sansTransition > 0) {
    ajouter(
      '2.1',
      `${sansTransition} slide(s) n’ont pas de phrase de transition : la ligne directrice s’interrompt et les slides paraissent indépendantes à l’oral. Régénérez le support pour obtenir la ligne directrice continue.`
    );
  }

  // ---- Volume cible : 19 slides de contenu, soit 20 slides page de titre comprise.
  //      Avertissement seulement : la génération conclut d'elle-même si la
  //      conclusion manque, et un support un peu plus long reste présentable.
  const totalAvecTitre = slides.length + 1 < VOLUME_CIBLE_TOTAL ? slides.length + 1 : VOLUME_CIBLE_TOTAL;
  if (slides.length + 1 !== VOLUME_CIBLE_TOTAL) {
    const ecart = slides.length + 1 - VOLUME_CIBLE_TOTAL;
    ajouter(
      '2.4',
      `Le support compte ${totalAvecTitre} slides page de titre comprise au lieu des ${VOLUME_CIBLE_TOTAL} attendues (${ecart > 0 ? `retirez ${ecart}` : `ajoutez ${-ecart}`} slide(s) : condensez les cas d’entreprises et les redondances, ou développez l’existant et les solutions).`
    );
  }

  return { slides: slides.length, manques };
}

/**
 * Lève une erreur 400 détaillant les manques structurels, ou renvoie le rapport.
 * Utilisé avant la génération du .pptx (export et prévisualisation).
 *
 * Les attendus issus du durcissement du support (ligne directrice continue,
 * volume de 20 slides, cas d'entreprises condensés) sont signalés à titre
 * d'AVERTISSEMENT : ils guident la régénération sans bloquer l'export d'un
 * support déjà généré, dont l'étudiant reste maître.
 */
const TYPES_AVERTISSEMENT = new Set(['2.1', '2.4']);

function assertConformiteSupport(session) {
  const rapport = detecterManquesSupport(session);
  const bloquants = rapport.manques.filter((m) => !TYPES_AVERTISSEMENT.has(m.critere));
  if (bloquants.length > 0) {
    const detail = bloquants.map((m) => `• [critère ${m.critere}] ${m.message}`).join('\n');
    throw httpError(
      400,
      `Le support n’est pas conforme aux attendus structurels de la grille d’évaluation du jury :\n${detail}\n` +
        'Régénérez le support (étape 6) après avoir corrigé ces points, ou complétez le plan et le glossaire en amont.'
    );
  }
  return rapport;
}

module.exports = { detecterManquesSupport, assertConformiteSupport };
