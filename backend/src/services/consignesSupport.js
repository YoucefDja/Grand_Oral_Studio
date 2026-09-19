/**
 * Consignes de fond et de forme communes aux exports « génération du support ».
 *
 * Ces règles ne dépendent pas de l'outil qui fabrique le diaporama (Claude
 * Desktop ou Gamma) : elles portent sur ce que dit le support et sur la façon de
 * le dire. Elles ont été alignées sur la logique « managériale et
 * organisationnelle » demandée pour l'oral :
 *   - pas de jargon ni de normes techniques alignées en vitrine ;
 *   - chaque point démontre la compréhension des enjeux (pourquoi c'est
 *     critique) plutôt que le fonctionnement technique (comment ça marche) ;
 *   - les cas d'entreprises illustrent le problème soulevé par la
 *     problématique, les préconisations y répondent.
 *
 * Le détail visuel (charte CESI, géométrie) reste propre à chaque outil : voir
 * chartePptxClaude.js pour Claude Desktop.
 */

/**
 * Bloc « posture de fond » : suppression du jargon technique, vulgarisation
 * managériale, problématique-problème, cas et solutions reliés.
 */
const CONSIGNES_FOND_VULGARISATION = `
### POSTURE DE FOND — VULGARISATION MANAGÉRIALE (NON NÉGOCIABLE)

Le support n'est pas une fiche technique : c'est la démonstration, par un futur
manager, qu'il a compris un problème d'entreprise et qu'il sait proposer des
réponses pragmatiques.

1. SUPPRESSION DU JARGON TECHNIQUE
- Ne mets en avant AUCUNE référence directe aux normes et référentiels complexes
  (ISO 27031, ISO 22301, NIST, EBIOS, ITIL, etc.) ni aucun acronyme technique
  posé sans explication.
- Remplace-les systématiquement par le vocabulaire managérial et organisationnel
  équivalent : gouvernance, pilotage, tests réguliers, communication de crise,
  sensibilisation des équipes, sauvegarde isolée, plan de communication,
  exercices de crise, désignation d'un responsable.
- Un référentiel ne peut apparaître que s'il est immédiatement traduit en une
  conséquence concrète pour l'organisation, et jamais comme une vitrine de
  connaissances. Dans le doute : supprime-le.

2. VULGARISATION ET ARGUMENTATION
- Chaque point du support doit montrer que tu as compris les ENJEUX (pourquoi
  c'est critique pour l'entreprise) et non le FONCTIONNEMENT technique (comment
  ça marche).
- Le fil conducteur est la vulgarisation : on expose un problème réel
  d'entreprise, puis on apporte des solutions pragmatiques.
- Vocabulaire RICHE, précis et professionnel, mais immédiatement compréhensible
  et facile à reprendre à l'oral. Évite la pauvreté lexicale comme le jargon.
- Une slide se lit et s'explique sans hésitation : si un terme demande une
  explication technique, il n'a pas sa place tel quel.

3. PROBLÉMATIQUE
- La problématique n'est JAMAIS une reformulation du sujet. Elle interroge le
  sujet et pointe un problème réel à résoudre par l'entreprise.
- Formulation attendue : une question qui met en tension un levier humain /
  organisationnel et un levier technique, et qui appelle une prise de position.
  Exemple de ton attendu : « Dans quelle mesure l'anticipation humaine et
  organisationnelle est-elle plus déterminante que la simple technique pour
  garantir la reprise d'activité d'une entreprise post-cyberattaque ? »
- Elle reste une question, jamais un débat d'opinion, et n'est jamais dévoilée
  avant sa slide dédiée.

4. CAS D'ENTREPRISES ET SOLUTIONS
- Les cas d'entreprises (l'existant) doivent illustrer concrètement le problème
  soulevé par la problématique : ils montrent le problème à l'œuvre, pas une
  fiche descriptive d'entreprise.
- Les préconisations doivent répondre DIRECTEMENT à la problématique, et se
  concentrer sur des actions humaines, organisationnelles et de gouvernance.
- Structure les préconisations selon le champ applicatif : l'avant, le pendant,
  l'après.
`.trim();

/**
 * Bloc « contraintes de forme inébranlables » : structure en 20 slides, aucune
 * image générée par IA, puces nominales courtes, phrase de transition.
 */
const CONSIGNES_FORME_SUPPORT = `
### CONTRAINTES DE FORME INÉBRANLABLES (À APPLIQUER PARTOUT)

- STRUCTURE : EXACTEMENT 20 slides au total, page de titre comprise (donc 19
  slides de contenu, conclusion incluse). Ni plus, ni moins. Le support est
  CONCIS : une idée par slide, pas de slide de remplissage. Si tu dépasses,
  condense — ne splitte jamais une idée sur deux slides.
- IMAGES : AUCUNE image générée par l'IA, aucun visuel photoréaliste, aucun
  clipart. Uniquement des formes simples (rectangles arrondis, cartes, encadrés,
  badges), des frises, des schémas sobres et des icônes sobres.
- TEXTE DES SLIDES : AUCUNE phrase longue. Uniquement des listes à puces très
  courtes, en fragments nominaux (3 à 5 puces, 6 maximum, une ligne chacune,
  jamais de verbe conjugué ni de point final). Jamais « je » ni « nous » sur une
  slide.
- PHRASES COMPLÈTES : elles vont UNIQUEMENT dans les notes du présentateur,
  jamais sur la slide.
- LIGNE DIRECTRICE : chaque slide de contenu (sauf la page de titre et la
  conclusion) se termine par une petite phrase de transition en italique, en bas
  de slide, qui part de la slide courante et annonce la suivante (12 à 18 mots).
- NOMENCLATURE DES TITRES : jamais une phrase, jamais de verbe conjugué, jamais
  de point. Nomenclature classique et structurée : « Plan de présentation »,
  « Contexte », « Mots clés », « Enjeux », « Problématiques », « Solutions »,
  « Préconisations », « Conclusion », complétée par les blocs de contenu de la
  méthodologie (« Existant », « Chiffres clés », « Cas d'entreprises »).
- DÉCLINAISON DES TITRES (obligatoire) : dès qu'une catégorie occupe PLUSIEURS
  slides, chaque slide reprend le titre principal suivi de DEUX OU TROIS MOTS de
  précision, séparés par un tiret, qui identifient ce qui la distingue des autres
  slides de la même catégorie — par exemple « Solutions — Continuité d'activité »
  ou « Préconisations — Avant la crise ». Deux slides ne portent JAMAIS le même
  titre : le jury doit suivre la progression sur le seul sommaire des titres.
- CAS D'ENTREPRISES : UNE slide dédiée aux cas (deux maximum si ça déborde
  vraiment), en blocs compacts : nom, pastille d'initiales jaune, UN chiffre, UN
  angle qui prouve la problématique, la source. Au moins un échec.
`.trim();

module.exports = {
  CONSIGNES_FOND_VULGARISATION,
  CONSIGNES_FORME_SUPPORT,
};
