/**
 * Charte de génération du support Grand Oral CESI — version « Gamma ».
 *
 * Gamma ne fabrique pas un .pptx via python-pptx : il génère une présentation à
 * partir d'un texte structuré (mode « Texte à présentation » ou « Coller du
 * texte »). Ce module produit donc deux choses :
 *
 *  1. la spécification visuelle textuelle (thème, couleurs CESI, structure des
 *     cartes), alignée sur la charte du support natif (chartePptxClaude.js) ;
 *  2. le SQUELETTE DE TEXTE prêt à coller dans Gamma : un bloc par slide
 *     (titre + puces + phrase de transition + note orateur), dans l'ordre
 *     narratif imposé.
 *
 * Particularité Gamma : les notes du présentateur n'existent pas en tant que
 * champ. La phrase complète que l'étudiant dira à l'oral est donc écrite dans la
 * slide sous la forme « Note orateur : … », à supprimer une fois la carte
 * générée (ou à laisser en tout petit si l'étudiant présente depuis l'écran).
 */
const { NOM, ANNEE } = require('../config/soutenance');
const COULEURS = {
  PRIMARY: '#F2D934', // jaune CESI
  ACCENT: '#E0C200', // jaune CESI assombri
  LIGHT: '#8A7A00', // ocre foncé
  DARK: '#262626',
  GREY: '#595959',
  SOFT: '#BFBFBF',
  WHITE: '#FFFFFF',
};

/**
 * Ordre narratif imposé : titre de slide → rôle attendu.
 *
 * NOMENCLATURE ET DÉCLINAISON DES TITRES : la nomenclature est classique et
 * structurée (« Plan de présentation », « Contexte », « Mots clés », « Enjeux »,
 * « Problématiques », « Existant », « Chiffres clés », « Cas d'entreprises »,
 * « Solutions », « Préconisations », « Conclusion »). Dès qu'une catégorie
 * occupe PLUSIEURS slides, chaque titre reprend le titre principal suivi de
 * deux ou trois mots de précision séparés par un tiret (« Solutions —
 * Continuité d'activité »). Deux slides ne portent jamais le même titre.
 *
 * VOLUME : 1 page de titre + 24 slides de contenu = 25 slides au total. Les
 * nombres entre parenthèses ci-dessous situent chaque bloc dans ce total.
 */
const SQUELETTE_SLIDES = [
  ['Plan de présentation', "Sommaire de l'oral : 4 à 5 puces très courtes avec repères numérotés (contexte et mots clés, enjeux, problématiques, existant et chiffres, cas d'entreprises, solutions, préconisations, conclusion). Aucune problématique, aucun chiffre."],
  ['Contexte', "Pourquoi le sujet compte aujourd'hui, un ou deux chiffres clés sourcés, en quoi les entreprises sont directement concernées."],
  ['Mots clés', "Reprendre le SUJET COMPLET dans un encadré, puis 2 à 4 mots clés du sujet, chacun suivi de sa définition courte (une ligne, langage clair)."],
  ['Enjeux — Volet technique et économique', "Ce qui se joue pour l'entreprise, structuré TOHEE : Techniques, Organisationnels, Humains, Économiques, Environnementaux. Restreint au cœur du sujet."],
  ['Enjeux — Volet humain et organisationnel', "(suite) Les volets humain et organisationnel des enjeux, développés sans condenser."],
  ['Problématiques — Question centrale', "La question SEULE, mise en grand, encadrée sobrement. Aucun visuel opposant deux camps. Aucune autre slide ne la cite avant."],
  ['Problématiques — Angle complémentaire', "(suite, seulement si le sujet appelle un second angle) Une seconde question, une seule par slide, formulée dans la continuité de la première."],
  ['Existant — État des lieux', "L'état des lieux : ce qui se fait aujourd'hui en entreprise, et pourquoi ça ne suffit pas. Illustre le problème soulevé par la problématique."],
  ['Existant — Références théoriques', "(suite) Les concepts académiques et référentiels mobilisés, traduits en vocabulaire managérial."],
  ['Existant — Limites et angles morts', "(suite) Ce que les pratiques actuelles ne couvrent pas."],
  ['Chiffres clés — Ampleur du phénomène', "2 ou 3 données chiffrées récentes, chacune avec sa source en dessous. Montre l'ampleur du problème."],
  ['Chiffres clés — Coûts et impacts', "(suite) Les coûts et impacts chiffrés, chacun avec sa source."],
  ['Cas d\'entreprises — <nom de l\'entreprise>', "UNE SLIDE PAR ENTREPRISE : chaque cas réel occupe sa propre slide, présentée de façon distincte et individualisée (jamais deux entreprises sur la même slide), avec son angle et sa source. Il illustre le problème, pas une fiche descriptive."],
  ['Cas d\'entreprises — <nom de l\'entreprise>', "(suite) Le deuxième cas, sur sa propre slide, avec son angle, ses chiffres clés et sa source."],
  ['Cas d\'entreprises — <nom de l\'entreprise>', "(suite) Le troisième cas, sur sa propre slide — dont au moins un échec ou une limite."],
  ['Chiffres clés — Synthèse comparative', "Ce que les chiffres et les cas révèlent ensemble, en une lecture d'ensemble sourcée."],
  ['Solutions — Anticipation et gouvernance', "Les préconisations, structurées avant / pendant / après. Actions humaines, organisationnelles et de gouvernance : gouvernance, tests réguliers, communication de crise, sensibilisation, sauvegarde isolée. Réponse directe à la problématique."],
  ['Solutions — Réponse à incident', "(suite) La conduite à tenir pendant la crise : pilotage, communication, décisions immédiates."],
  ['Solutions — Reprise et amélioration continue', "(suite) L'après-crise : retour d'expérience, plan d'amélioration, indicateurs de suivi."],
  ['Préconisations — Conditions de réussite', "Ce qui conditionne la réussite des préconisations : moyens à mobiliser, portage, gouvernance."],
  ['Préconisations — Déclinaison selon la taille', "Les priorités ne sont pas les mêmes en PME et en grand groupe : décliner les préconisations par taille d'entreprise."],
  ['Préconisations — Indicateurs de suivi', "Les indicateurs qui montrent que les préconisations produisent leur effet, et à quelle échéance."],
  ['Préconisations — Feuille de route', "La séquence de mise en œuvre proposée, étape par étape."],
  ['Conclusion', "Réponse explicite à la problématique, rappel du fil directeur, puis ouverture prospective posée comme une question et laissée sans réponse."],
];

function buildGammaPrompt() {
  const squelette = SQUELETTE_SLIDES.map(
    ([titre, role], i) => `${i + 2}. ${titre}\n   ${role}`
  ).join('\n');

  return `
## MODE D'EMPLOI GAMMA

1. Dans Gamma, choisis « Créer » puis « Coller du texte » (ou « Texte à
   présentation ») et colle le bloc « SQUELETTE DE TEXTE À COLLER » ci-dessous.
2. Gamma génère une première version : remplace chaque texte entre crochets
   « […] » par le contenu réel demandé.
3. Applique ensuite la charte visuelle : dans Gamma, va sur « Modifier le
   thème » → « Couleurs » et saisis les couleurs CESI de la section
   « CHARTE VISUELLE GAMMA ». Choisis une police sans empattement et un fond
   blanc, sans image de fond.
4. Interdiction absolue : ne clique JAMAIS sur « Générer une image avec l'IA ».
   Si Gamma propose des images, désactive l'option et remplace-les par des
   formes simples (rectangles arrondis, cartes, badges, frises).

---

## CHARTE VISUELLE GAMMA — JAUNE CESI

Format 16:9, fond BLANC ou blanc cassé (jamais de fond sombre, jamais de
dégradé, jamais de photo de fond).

Palette à saisir, utilisée avec parcimonie :
- Jaune CESI ${COULEURS.PRIMARY} : bandeau ou titre d'accroche des slides.
- Jaune CESI assombri ${COULEURS.ACCENT} : filets, séparateurs, contours de
  cartes, accents.
- Ocre foncé ${COULEURS.LIGHT} : petits textes fins, compteur de progression.
- Gris très foncé ${COULEURS.DARK} : tout le corps de texte (jamais du noir pur).
- Gris ${COULEURS.GREY} : mentions secondaires, rappel de la problématique,
  phrase de transition.
- Aucune autre couleur, en particulier AUCUN bleu. Pas de couleurs vives, pas de
  cliparts.

Typographie : sans empattement (Arial, Calibri, Helvetica). Titres 24-32 pt,
corps 18-24 pt, rappel de problématique et phrase de transition 9-10 pt italique
gris. Le jaune CESI est très clair : tout texte posé dessus est en gris très
foncé ${COULEURS.DARK}, jamais en blanc.

Structure type d'une slide de contenu :
1. Bandeau ou titre d'accroche en haut, fond jaune CESI ${COULEURS.PRIMARY},
   titre de la slide en gris très foncé.
2. Corps : 3 à 5 puces très courtes, en fragments nominaux, une idée par puce.
   Aucun paragraphe, aucune phrase conjuguée.
3. Formes : cartes ou encadrés à contour ${COULEURS.ACCENT} pour les chiffres
   clés, badges pour les mots clés, frise horizontale pour toute chronologie
   (avant / pendant / après).
4. En bas de slide, en petit et en italique gris, précédée d'une flèche « → » :
   la phrase de transition.
5. Sous la transition, sur toutes les slides postérieures aux « Problématiques » :
   le rappel de la problématique en 9 pt italique gris.

Éléments à NE PAS générer : images IA, photos, illustrations, icônes
décoratives, dégradés, ombres marquées, plus de 6 puces par slide.

---

## SQUELETTE DE TEXTE À COLLER (structure de référence)

Ce squelette couvre les slides 2 à 25, soit 24 slides de contenu. Il est déjà
complet : chaque bloc y figure à sa place, dans l'ordre narratif imposé. Tu peux
développer un bloc sur une slide supplémentaire si le sujet le réclame, mais le
total reste EXACTEMENT de 25 slides, page de titre comprise.

NOMENCLATURE ET DÉCLINAISON DES TITRES — deux règles non négociables :
- Les titres suivent la nomenclature classique et structurée : « Plan de
  présentation », « Contexte », « Mots clés », « Enjeux », « Problématiques »,
  « Existant », « Chiffres clés », « Cas d'entreprises », « Solutions »,
  « Préconisations », « Conclusion ». Jamais une phrase, jamais de verbe
  conjugué, jamais de point.
- Dès qu'une catégorie occupe PLUSIEURS slides, chaque titre reprend le titre
  principal suivi de DEUX OU TROIS MOTS de précision, séparés par un tiret, qui
  disent ce que la slide a d'unique : « Enjeux — Volet humain », « Solutions —
  Continuité d'activité », « Préconisations — Avant la crise ». Deux slides ne
  portent JAMAIS le même titre. Les cas d'entreprises portent le nom de
  l'entreprise : « Cas d'entreprises — Thalès ».

CAS D'ENTREPRISES : UNE slide par entreprise, présentée de façon distincte et
individualisée. Aucun regroupement de deux entreprises sur une même slide.

Chaque bloc suit toujours ce format :

Titre de la slide
- puce courte
- puce courte
- puce courte
→ Phrase de transition (12 à 18 mots)
Note orateur : phrase complète à dire à l'oral (une ligne par puce, 5 lignes et
60 mots maximum).

Liste de référence :
${squelette}

---

## PAGE DE TITRE (slide 1 — à créer manuellement dans Gamma)

- Fond blanc, format 16:9.
- Logo CESI centré en haut, tel quel, proportionné (jamais déformé).
- Libellé « GRAND ORAL CESI » centré, en jaune assombri ${COULEURS.ACCENT},
  16 pt, gras.
- LE SUJET SEUL, en grand et centré (32 pt si 55 caractères ou moins, 28 pt
  jusqu'à 100, 24 pt au-delà), en gris très foncé ${COULEURS.DARK}. N'ajoute NI
  le thème, NI la problématique, NI aucun sous-titre.
- Nom du candidat « ${NOM} » : centré, 24 pt gras.
- « Année universitaire ${ANNEE} » : centré, 14 pt, gris ${COULEURS.GREY}.

---

## CONTRÔLE FINAL AVANT EXPORT

Vérifie, slide par slide, que :
- le total est EXACTEMENT de 25 slides, page de titre comprise, soit 24 slides
  de contenu ;
- la 2e slide du dossier est « Plan de présentation », sans aucune problématique ;
- les titres suivent la nomenclature imposée, et chaque slide d'une catégorie
  déclinée porte sa précision de deux ou trois mots après un tiret : aucun titre
  n'est répété d'une slide à l'autre ;
- la slide « Mots clés » reprend le sujet complet et définit chaque mot clé ;
- la problématique n'apparaît qu'à partir de sa slide dédiée, et n'y est jamais
  opposée à un camp adverse ;
- chaque slide de contenu se termine par sa phrase de transition (sauf la
  conclusion) ;
- chaque cas d'entreprise occupe sa PROPRE slide, présentée de façon distincte
  et individualisée : jamais deux entreprises sur la même slide ;
- aucune slide ne contient de phrase rédigée : uniquement des puces nominales
  courtes ;
- AUCUNE image générée par l'IA : uniquement des formes, frises ou icônes sobres ;
- chaque chiffre porte sa source juste en dessous ;
- aucun acronyme ni norme technique complexe n'apparaît sans être traduit en
  vocabulaire managérial.
`.trim();
}

module.exports = { buildGammaPrompt, COULEURS };
