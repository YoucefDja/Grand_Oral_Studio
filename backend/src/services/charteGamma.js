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

/** Ordre narratif imposé : titre de slide → rôle attendu. */
const SQUELETTE_SLIDES = [
  ['Plan de présentation', "Sommaire de l'oral : 4 à 5 puces très courtes avec repères numérotés (contexte et mots clés, enjeux, problématique, existant et chiffres, cas d'entreprises, solutions, conclusion). Aucune problématique, aucun chiffre."],
  ['Contexte', "Pourquoi le sujet compte aujourd'hui, un ou deux chiffres clés sourcés, en quoi les entreprises sont directement concernées."],
  ['Mots clés du sujet', "Reprendre le SUJET COMPLET dans un encadré, puis 2 à 4 mots clés du sujet, chacun suivi de sa définition courte (une ligne, langage clair)."],
  ['Enjeux', "Ce qui se joue pour l'entreprise, structuré TOHEE : Techniques, Organisationnels, Humains, Économiques, Environnementaux. Restreint au cœur du sujet."],
  ['Problématique', "La question SEULE, mise en grand, encadrée sobrement. Aucun visuel opposant deux camps. Aucune autre slide ne la cite avant."],
  ['Existant', "L'état des lieux : ce qui se fait aujourd'hui en entreprise, et pourquoi ça ne suffit pas. Illustre le problème soulevé par la problématique."],
  ['Chiffres clés', "2 ou 3 données chiffrées récentes, chacune avec sa source en dessous. Montre l'ampleur du problème."],
  ['Cas d\'entreprises', "UNE seule slide comparant 2 ou 3 entreprises réelles (dont un échec ou une limite), chacune avec son angle et sa source. Ils illustrent le problème, pas une fiche descriptive."],
  ['Solutions', "Les préconisations, structurées avant / pendant / après. Actions humaines, organisationnelles et de gouvernance : gouvernance, tests réguliers, communication de crise, sensibilisation, sauvegarde isolée. Réponse directe à la problématique."],
  ['Solutions', "(suite) Approfondissement des préconisations : conditions de réussite, moyens, indicateurs de suivi, gouvernance."],
  ['Solutions', "(suite) Déclinaison selon la taille d'entreprise : les priorités ne sont pas les mêmes en PME et en grand groupe."],
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
5. Sous la transition, sur toutes les slides postérieures à « Problématique » :
   le rappel de la problématique en 9 pt italique gris.

Éléments à NE PAS générer : images IA, photos, illustrations, icônes
décoratives, dégradés, ombres marquées, plus de 6 puces par slide.

---

## SQUELETTE DE TEXTE À COLLER (structure de référence)

Ce squelette couvre les slides 2 à 13. Complète-le par répétition des blocs
« Existant » (jusqu'à 4-5 slides), « Chiffres clés » (2-3 slides), « Cas
d'entreprises » (1 slide, 2 maximum) et « Solutions » (jusqu'à 4-5 slides) pour
atteindre EXACTEMENT 19 slides de contenu, soit 20 slides avec la page de titre.

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
- le total est EXACTEMENT de 20 slides, page de titre comprise ;
- la 2e slide du dossier est « Plan de présentation », sans aucune problématique ;
- la slide « Mots clés du sujet » reprend le sujet complet et définit chaque mot clé ;
- la problématique n'apparaît qu'à partir de sa slide dédiée, et n'y est jamais
  opposée à un camp adverse ;
- chaque slide de contenu se termine par sa phrase de transition (sauf la
  conclusion) ;
- les cas d'entreprises tiennent sur une seule slide (deux au maximum) ;
- aucune slide ne contient de phrase rédigée : uniquement des puces nominales
  courtes ;
- AUCUNE image générée par l'IA : uniquement des formes, frises ou icônes sobres ;
- chaque chiffre porte sa source juste en dessous ;
- aucun acronyme ni norme technique complexe n'apparaît sans être traduit en
  vocabulaire managérial.
`.trim();
}

module.exports = { buildGammaPrompt, COULEURS };
