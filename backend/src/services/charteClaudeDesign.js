/**
 * Export « Claude Design » — document .md AUTO-SUFFISANT.
 *
 * Claude Design est un outil de génération de diaporamas TOTALEMENT isolé : il
 * n'a accès ni aux Projets Claude de l'étudiant, ni à ses instructions, ni à
 * ses diaporamas exemples, ni à son style. Le markdown habituel (destiné à une
 * conversation d'un Projet Claude, qui porte déjà tout ce contexte) ne suffit
 * donc pas : il faut un document qui embarque LUI-MÊME le contexte complet.
 *
 * Ce module assemble les 7 sections imposées :
 *   1. RÔLE ET MISSION             — ce que Claude Design doit produire
 *   2. SUJET ET THÈME              — le sujet, le thème, le public, le contexte
 *   3. TON, STYLE ET VOCABULAIRE   — relu depuis la base (section « style_support »)
 *   4. STRUCTURE IMPOSÉE DES SLIDES — squelette slide par slide
 *   5. CONTENU GÉNÉRÉ PAR L'APP     — analyse, problématique, glossaire, plan
 *   6. EXEMPLES DE RÉFÉRENCE        — extraits réels des diaporamas de l'étudiant
 *   7. CONSIGNES FINALES            — les garde-fous adressés à Claude Design
 *
 * Règle d'architecture : AUCUN contenu de style n'est dupliqué en dur ici. Le
 * bloc « ton, style et vocabulaire » est relu depuis la collection
 * `MethodologySection` (sectionId `style_support`), c'est-à-dire depuis la même
 * source que celle qui alimente les prompts système. L'éditer en admin puis
 * relancer le seed suffit à mettre à jour tous les exports.
 */
const { NOM, ANNEE } = require('../config/soutenance');
const { CONSIGNES_FOND_VULGARISATION, CONSIGNES_FORME_SUPPORT } = require('./consignesSupport');
const {
  CONSIGNE_EXEMPLES,
  EXEMPLES_SLIDES,
  EXEMPLES_NOTES,
  TITRES_OBSERVES,
} = require('./exemplesStyle');

/** Durée et volume cibles de l'oral — alignés sur le code (20 slides exactement). */
const DUREE_MINUTES = 20;
const NB_SLIDES_TOTAL = 20;

/**
 * Squelette imposé du support : une entrée par slide de contenu (la page de
 * titre est ajoutée par l'outil). Le rôle de chaque slide y est décrit en clair,
 * pour qu'un outil qui ne connaît rien au projet sache quoi mettre dedans.
 * L'ordre est l'ordre narratif réel de la méthodologie : contexte → plan →
 * mots clés → enjeux → problématique → existant → chiffres → cas → solutions →
 * conclusion.
 */
const SQUELETTE_SLIDES = [
  {
    titre: 'Page de titre',
    role: 'Slide 1, ajoutée automatiquement par l\'outil.',
    contenu:
      "Le sujet SEUL, en grand et centré (aucun sous-titre, aucune problématique, aucun thème). Libellé « GRAND ORAL CESI », nom du candidat, année universitaire.",
  },
  {
    titre: 'Plan de présentation',
    role: 'Slide 2 — sommaire de l\'oral, obligatoirement en deuxième position.',
    contenu:
      "4 à 5 puces très courtes annonçant les parties dans l'ordre où elles seront présentées (contexte et mots clés, enjeux, problématique, existant et chiffres, cas d'entreprises, solutions, conclusion). Aucune problématique, aucun chiffre, aucun développement.",
  },
  {
    titre: 'Contexte',
    role: 'Slide 3 — accroche et positionnement du sujet.',
    contenu:
      "Une accroche qui capte le jury, puis pourquoi le sujet est d'actualité et pourquoi les entreprises sont directement concernées. Positionnement stratégique du sujet dans l'entreprise ou le secteur.",
  },
  {
    titre: 'Mots clés du sujet',
    role: 'Slide 4 — cadrage du vocabulaire.',
    contenu:
      "Le SUJET COMPLET repris tel qu'il est posé (encadré), puis 2 à 4 mots clés du sujet, chacun suivi de sa définition courte (une ligne, langage clair) issue du glossaire validé.",
  },
  {
    titre: 'Enjeux',
    role: 'Slide 5 — ce qui se joue pour l\'entreprise.',
    contenu:
      "Structuré par la grille TOHEE nommée en clair : Techniques, Organisationnels, Humains, Économiques, Environnementaux. Restreint au cœur du sujet, pas un inventaire. Déclinaison « Gain : … / Perte : … » possible quand un arbitrage doit être exposé.",
  },
  {
    titre: 'Problématique',
    role: 'Slide 6 — la question centrale, et rien d\'autre.',
    contenu:
      "La question SEULE, mise en grand et encadrée sobrement. C'est un problème concret à instruire, pas un débat d'opinion : aucun visuel opposant deux camps, pas de deux colonnes « Pour / Contre ». La problématique n'apparaît sur AUCUNE slide antérieure.",
  },
  {
    titre: 'Existant',
    role: 'Slides 7 à 10 — état des lieux et fondements (répéter le bloc jusqu\'à 4-5 slides).',
    contenu:
      "Ce qui se fait aujourd'hui en entreprise sur ce sujet et pourquoi ça ne suffit pas. Les concepts et cadres d'analyse sont mobilisés et nommés, mais toujours traduits en conséquence concrète pour l'organisation (jamais une vitrine de normes). Chaque slide illustre le problème soulevé par la problématique.",
  },
  {
    titre: 'Chiffres clés',
    role: 'Slides 11 à 13 — ampleur du problème (2-3 slides).',
    contenu:
      "2 ou 3 données chiffrées récentes par slide, chacune affichée seule et en grand, avec sa source citée juste en dessous. Le sens du chiffre est expliqué dans la note de présentateur, pas sur la slide.",
  },
  {
    titre: 'Cas d\'entreprises',
    role: 'Slide 14 — benchmark réel (2 slides au maximum dans tout le support).',
    contenu:
      "UNE slide comparant 2 ou 3 entreprises réelles, nommées, dont au moins un échec ou une limite. Chacune avec son angle précis (ce qui lui est arrivé) et sa source. Les cas montrent le problème à l'œuvre, ce ne sont pas des fiches descriptives.",
  },
  {
    titre: 'Solutions',
    role: 'Slides 15 à 18 — préconisations (4-5 slides).',
    contenu:
      "Réponse directe à la problématique, structurée avant / pendant / après. Actions humaines, organisationnelles et de gouvernance : gouvernance, tests réguliers, communication de crise, sensibilisation des équipes, sauvegarde isolée. Puis approfondissement : conditions de réussite, moyens, indicateurs de suivi, déclinaison selon la taille d'entreprise.",
  },
  {
    titre: 'Conclusion',
    role: 'Slide 19-20 — fermeture.',
    contenu:
      "Réponse explicite à la problématique, rappel du fil directeur, puis ouverture prospective posée comme une question et volontairement laissée sans réponse. Dernière slide : pas de phrase de transition.",
  },
];

/** Rend un tableau de puces en bloc markdown. */
function blocPuces(puces) {
  return puces.map((p) => `- ${p}`).join('\n');
}

/** Rend un exemple de slide (titre + puces + note) en bloc lisible. */
function blocExempleSlide(ex) {
  return [
    `**${ex.titre}** *(${ex.provenance})*`,
    '',
    blocPuces(ex.puces),
    '',
    `> Note orateur : ${ex.note}`,
  ].join('\n');
}

/**
 * Assemble le document Claude Design.
 *
 * @param {object} params
 * @param {object} params.session   session Mongoose (titre, theme, owner)
 * @param {string} params.analyse   contenu de l'étape analyse (JSON pretty-printé)
 * @param {string} params.plan      contenu de l'étape plan détaillé
 * @param {string} params.glossaire contenu de l'étape glossaire
 * @param {string} params.problematique  problématique retenue, en clair
 * @param {string} params.ligneDirectrice fil conducteur, en clair
 * @param {string} params.styleSupport   bloc « ton, style et vocabulaire » relu en base
 * @returns {string} le markdown complet
 */
function buildClaudeDesignExport({
  session,
  analyse,
  plan,
  glossaire,
  problematique,
  ligneDirectrice,
  styleSupport,
}) {
  const sujet = String(session.titre || '').trim();
  const theme = String(session.theme || '').trim();

  const squelette = SQUELETTE_SLIDES.map((s, i) => {
    const numero = i === 0 ? 'Slide 1' : `Slides ${i + 1}`;
    return [
      `#### ${numero} — « ${s.titre} »`,
      `*Rôle :* ${s.role}`,
      `*Contenu attendu :* ${s.contenu}`,
    ].join('\n');
  }).join('\n\n');

  const exemples = EXEMPLES_SLIDES.map(blocExempleSlide).join('\n\n---\n\n');

  const notesExemples = EXEMPLES_NOTES.map((n) => `- ${n}`).join('\n');

  return `
# GRAND ORAL CESI — BRIEF COMPLET POUR GÉNÉRATION DU DIAPORAMA

> **Ce document est auto-suffisant.** Il contient tout le contexte nécessaire :
> la mission, le sujet, le ton et le vocabulaire attendus, la structure imposée
> slide par slide, le contenu déjà rédigé, et des exemples de référence réels.
> Tu n'as besoin d'aucune autre source ni d'aucun accès externe : lis-le en
> entier avant de produire quoi que ce soit.

---

## 1. RÔLE ET MISSION

Tu produis une **présentation de soutenance orale académique** (Grand Oral CESI) destinée à être projetée pendant que l'étudiant parle devant un jury.

- **Durée cible de l'oral : ${DUREE_MINUTES} minutes.**
- **Volume imposé : EXACTEMENT ${NB_SLIDES_TOTAL} slides**, page de titre comprise.
- **Rythme attendu : environ 1 slide toutes les 45 à 60 secondes.** C'est ce rythme qui garantit que l'étudiant tient le temps imparti : si une slide demande plus d'une minute d'explication, elle est trop dense et doit être condensée.
- **Ce que tu produis n'est PAS un document à lire.** Les slides sont des appuis visuels pour l'orateur : elles portent des mots clés et des formes sobres, jamais des paragraphes. L'argumentation complète vit dans la note de présentateur, qui accompagne chaque slide.
- Tu produis le **contenu des slides** (titre, puces, formes, note de présentateur) et tu appliques la **charte sobre** décrite plus bas. Tu ne produis rien d'autre.

---

## 2. SUJET ET THÈME

- **Sujet traité :** « ${sujet} »
- **Thème parent :** ${theme || 'non précisé'}
- **Public visé :** un **jury de Grand Oral CESI** (école d'ingénieurs), composé d'enseignants et de professionnels.
- **Contexte :** un **oral académique** de ${DUREE_MINUTES} minutes, suivi d'un jeu de questions/réponses avec le jury. L'étudiant est évalué sur une grille officielle de 14 critères portant à la fois sur le fond (contexte, enjeux, concepts mobilisés, benchmark d'entreprises réelles, prise de position, pragmatisme) et sur la forme (structure visible, dynamisme de l'argumentation, impact visuel, maîtrise du temps, synthèse, ouverture d'esprit).

Ce que le jury doit pouvoir dire en sortant : *l'étudiant a compris un problème réel d'entreprise, il l'a documenté avec des sources, et il propose des réponses opérationnelles argumentées.*

---

## 3. TON, STYLE ET VOCABULAIRE (CRUCIAL)

Cette section fait autorité sur tout le reste du document : en cas de conflit avec une autre consigne, c'est elle qui prime.

${styleSupport}

---

## 4. STRUCTURE IMPOSÉE DES SLIDES

L'enchaînement ci-dessous est **non négociable** : le jury évalue la clarté du plan et la construction en entonnoir (on pose le contexte, on en déduit les enjeux, la problématique en découle, puis chaque bloc suivant la traite avant de refermer sur une conclusion qui y répond).

**Règles de progression :**
1. **Interdiction absolue de dévoiler la problématique avant sa slide dédiée** (slide 6). Les slides précédentes la préparent sans jamais la formuler, la slide « Plan de présentation » comprise.
2. La progression est **Contexte → Plan de présentation → Mots clés du sujet → Enjeux → Problématique → Existant → Chiffres clés → Cas d'entreprises → Solutions → Conclusion**.
3. **N'ajoute, ne fusionne et ne supprime aucune slide hors de cette structure.** Les seuls ajustements autorisés sont les répétitions explicitement indiquées (Existant 4-5 slides, Chiffres clés 2-3 slides, Cas d'entreprises 1-2 slides, Solutions 4-5 slides), dans les limites indiquées, pour atteindre EXACTEMENT ${NB_SLIDES_TOTAL} slides.
4. **Chaque slide de contenu se termine par une phrase de transition** en italique, en bas de slide, qui part de la slide courante et annonce la suivante (12 à 18 mots). Seule la conclusion n'en a pas.
5. **Chaque chiffre ou cas d'entreprise porte sa source** juste en dessous, en petit. Une donnée non sourcée ne compte pas.

${squelette}

---

## 5. CONTENU GÉNÉRÉ PAR L'APPLICATION

Tout ce qui suit a déjà été produit et validé par l'étudiant. **Utilise-le comme matière première des slides** : ne le contredis pas, ne le réinvente pas, ne le complète pas de ton propre chef.

### 5.1 Sujet et fil conducteur

- **Sujet :** « ${sujet} »
- **Problématique retenue (la question centrale, à placer SEULE sur sa slide dédiée) :**
  « ${problematique} »
- **Ligne directrice (fil conducteur de toute la démonstration, à rendre visible d'un bout à l'autre) :**
  « ${ligneDirectrice || 'non précisée'} »

### 5.2 Analyse du sujet

${analyse}

### 5.3 Plan détaillé

${plan}

### 5.4 Glossaire et sources validés

*Rappel impératif : aucun acronyme ni terme technique absent de ce glossaire ne doit apparaître sur une slide ou dans une note. Tout terme nouveau doit être reformulé en langage clair.*

${glossaire}

---

## 6. EXEMPLES DE RÉFÉRENCE (STYLE)

${CONSIGNE_EXEMPLES}

### 6.1 Slides de référence

${exemples}

### 6.2 Notes de présentateur de référence

Ces notes montrent le style d'élocution réel : lignes courtes, ton direct, une idée par ligne.

${notesExemples}

### 6.3 Titres de sections réellement utilisés par l'étudiant

À imiter dans leur sobriété (2 à 3 mots, jamais une phrase) :

${TITRES_OBSERVES.map((t) => `- ${t}`).join('\n')}

---

## 7. CONSIGNES FINALES À CLAUDE DESIGN

1. **« Respecte strictement le ton, le vocabulaire et la structure ci-dessus. »**
2. **« N'invente aucun contenu hors des éléments fournis. »** Si une information n'est pas dans la section 5, elle n'existe pas : ne la fabrique pas, ne comble pas les vides par des généralités, et n'ajoute ni chiffre, ni entreprise, ni source de ton cru.
3. **« Si une information manque, pose la question au lieu de la fabriquer. »**
4. **« Ne décore pas à outrance : sobriété académique. »** Aucune image générée par IA, aucune photographie, aucune illustration, aucun clipart, aucun dégradé. Uniquement des formes simples, des frises, des encadrés et des icônes sobres.
5. **Contraintes de forme, non négociables :**
   - **${NB_SLIDES_TOTAL} slides exactement**, page de titre comprise — ni plus, ni moins.
   - **AUCUNE phrase rédigée sur une slide** : uniquement des listes à puces très courtes (fragments nominaux, 3 à 5 puces, 6 maximum, une ligne, jamais de verbe conjugué ni de point final).
   - **Jamais « je » ni « nous » sur une slide.**
   - **AUCUNE image générée par l'IA.**
   - **La phrase de transition en italique en bas de chaque slide de contenu** (sauf conclusion) est obligatoire.
   - **Chaque chiffre et chaque cas d'entreprise porte sa source** juste en dessous.

---

## RAPPEL DES CONTRAINTES DE FOND (rappel intégré)

${CONSIGNES_FOND_VULGARISATION}

---

## RAPPEL DES CONTRAINTES DE FORME (rappel intégré)

${CONSIGNES_FORME_SUPPORT}

---

*Fin du brief. Tu disposes maintenant de tout le contexte nécessaire : mission, sujet, ton et vocabulaire, structure slide par slide, contenu rédigé et exemples de référence. Produis le diaporama en respectant l'intégralité de ce document.*
`.trim();
}

module.exports = {
  buildClaudeDesignExport,
  DUREE_MINUTES,
  NB_SLIDES_TOTAL,
  SQUELETTE_SLIDES,
  NOM,
  ANNEE,
};
