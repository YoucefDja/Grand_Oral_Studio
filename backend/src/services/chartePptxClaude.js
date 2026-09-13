/**
 * Charte visuelle du support Grand Oral CESI — version « Claude Desktop ».
 *
 * L'application génère le .pptx elle-même (voir services/pptx.js) : la charte y
 * est appliquée en dur par pptxgenjs. Ce module en donne la spécification
 * textuelle, alignée sur pptx.js, afin de l'injecter dans le Markdown exporté
 * (route GET /api/sessions/:id/support-pptx-prompt) : Claude Desktop, qui ne
 * partage pas le code de l'application, peut alors produire le .pptx avec un
 * rendu aussi proche que possible de l'export natif.
 *
 * Toute évolution de pptx.js (couleurs, positions, tailles) doit être répercutée
 * ici : c'est le pendant documentaire de la mise en page réelle.
 */
const { NOM, ANNEE } = require('../config/soutenance');

// Couleurs CESI (identiques à COLORS dans pptx.js, sans le '#').
// Le jaune CESI #F2D934 est une couleur très claire : les textes posés dessus
// sont en gris foncé, jamais en blanc (illisible).
const COULEURS = {
  PRIMARY: '#F2D934', // jaune CESI — bandeau d'en-tête, liseré de la page de titre
  ACCENT: '#E0C200', // jaune CESI assombri — traits, barre de progression
  LIGHT: '#8A7A00', // ocre foncé — rail de progression, textes sur le bandeau jaune
  WHITE: '#FFFFFF',
  DARK: '#262626', // corps de texte
  GREY: '#595959', // pied de page, mentions secondaires
  SOFT: '#BFBFBF',
};

/**
 * Spécification complète à intégrer dans le .md exporté : géométrie des slides,
 * page de titre, bandeau, barre de progression, fil rouge et notes orateur.
 * Rédigée pour être lue et exécutée telle quelle par Claude Desktop.
 */
function buildChartePptxClaude() {
  return `
## CHARTE VISUELLE ET MISE EN PAGE — À APPLIQUER À LA LETTRE

Cette section décrit l'apparence exacte du diaporama. Elle fait autorité pour la
mise en page : le fichier de méthodologie n'en parle pas. Applique-la sans
inventer d'autres styles, couleurs ou dispositions.

### Format et repères de mise en page

- Format 16:9, dimensions 33,87 cm × 19,05 cm (soit 13,33 × 7,5 pouces).
- Repère : 1 pouce = 2,54 cm. Toutes les positions ci-dessous sont données en
  pouces (inch) depuis le coin supérieur gauche de la slide.
- Slide entièrement sur fond BLANC (${COULEURS.WHITE}). Jamais de fond sombre,
  jamais de dégradé.
- Police sans empattement : Arial (ou Calibri / Helvetica si Arial indisponible).
- Texte courant en gris très foncé ${COULEURS.DARK}, jamais du noir pur.

### Palette (usage strictement limité)

- Jaune CESI ${COULEURS.PRIMARY} : bandeau d'en-tête des slides de contenu, liseré
  supérieur de la page de titre. Usage structurel uniquement. C'est un jaune très
  clair : tout texte posé dessus est en gris très foncé ${COULEURS.DARK}, JAMAIS en
  blanc.
- Jaune CESI assombri ${COULEURS.ACCENT} : traits de séparation, partie remplie de la
  barre de progression, libellés d'accroche. Accent uniquement, jamais en aplat large.
- Ocre foncé ${COULEURS.LIGHT} : rail vide de la barre de progression, type de la
  slide (petit texte de droite du bandeau). C'est la seule teinte sombre de la
  famille jaune, réservée aux textes fins posés sur le bandeau.
- Gris ${COULEURS.GREY} : rappel de la problématique en pied de slide, année
  universitaire, mentions secondaires.
- Aucune autre couleur, en particulier aucun bleu. Pas de couleurs vives, pas de
  dégradés, pas de cliparts.

### PAGE DE TITRE (1re slide — sans numéro de progression)

Reproduis exactement cette disposition (dimensions en pouces, slide de 13,33 × 7,5) :

1. Fond blanc.
2. Liseré supérieur : rectangle plein de la largeur totale (x 0 / y 0 / w 13,33 /
   h 0,16), couleur ${COULEURS.PRIMARY}, sans bordure visible.
3. Logo CESI : le fichier logo_cesi.png se trouve dans les fichiers de ce projet
   Claude. Récupère-le là et insère-le tel quel, centré horizontalement, position
   x = (13,33 − largeur) / 2, y = 0,55. Taille maximale 2,6 × 1,15 pouces,
   proportions d'origine respectées (redimensionne selon le côté le plus
   contraignant, ne déforme jamais).
4. Libellé « GRAND ORAL CESI » : centré, y = 2,05, hauteur 0,5, corps 16 pt,
   gras, espacement des caractères large (≈ 6 pt), couleur ${COULEURS.ACCENT}.
5. LE SUJET SEUL, en grand, centré : y = 2,6, hauteur 1,9, largeur 13,33 − 2,4,
   gras, couleur ${COULEURS.DARK}, aligné au centre et centré verticalement.
   Taille adaptée à la longueur : 32 pt si le sujet fait 55 caractères ou moins,
   28 pt jusqu'à 100 caractères, 24 pt au-delà.
   N'ajoute NI le thème, NI la problématique, NI aucun sous-titre.
6. Trait de séparation horizontal : largeur 3,2 pouces, centré
   (x = (13,33 − 3,2) / 2, y = 4,75), couleur ${COULEURS.ACCENT}, épaisseur 1,5 pt.
7. Nom du candidat « ${NOM} » : centré, y = 5,0, hauteur 0,6, corps 24 pt, gras,
   couleur ${COULEURS.DARK}.
8. « Année universitaire ${ANNEE} » : centré, y = 5,7, hauteur 0,45, corps 14 pt,
   couleur ${COULEURS.GREY}.

### SLIDES DE CONTENU (toutes les autres)

Chaque slide de contenu comporte quatre zones, dans cet ordre :

1. BANDEAU D'EN-TÊTE : rectangle plein de toute la largeur, x 0 / y 0 / w 13,33 /
   h 1,05, couleur ${COULEURS.PRIMARY}, sans bordure.
   - Titre de la slide : x 0,5 / y 0,14 / w 13,33 − 2,6 / h 0,8, corps 20 pt, gras,
     couleur gris très foncé ${COULEURS.DARK}, centré verticalement. Aligné à gauche.
   - Type de la slide (contexte, enjeux, existant…) : x 13,33 − 2,2 / y 0,14 /
     w 1,8 / h 0,8, corps 10 pt, couleur ${COULEURS.LIGHT}, aligné à droite,
     centré verticalement. Écris-le en minuscules, sans underscore.
2. BARRE DE PROGRESSION (voir section dédiée ci-dessous), juste sous le bandeau.
3. CORPS : liste à puces, x 0,55 / y 1,3 / w 13,33 − 1,1, corps 15 pt, couleur
   ${COULEURS.DARK}, aligné en haut, avec de vraies puces (puces natives, pas de
   caractère « • » tapé dans le texte). Une ligne par puce, espacement de 8 pt
   après chaque puce, 6 puces maximum.
   - Hauteur du corps : 7,5 − 2,2 (= 5,3) lorsque le pied de slide n'affiche pas
     la problématique ; 7,5 − 3,1 (= 4,4) lorsqu'il l'affiche.
   - Si la slide n'a aucune puce, écris la mention en italique gris
     « Détail en notes orateur. » (x 0,5 / y 1,4 / corps 14 pt).
4. NOTES ORATEUR : le contenu du champ notes_orateur est placé dans les notes du
   présentateur de la slide (panneau « Notes »), jamais sur la slide elle-même.

### SLIDES « exemple_entreprise » — RENDU DÉDIÉ OBLIGATOIRE

Ces slides ne suivent PAS le gabarit ci-dessus : elles doivent montrer
l'entreprise, pas la décrire. Reproduis cette disposition :

1. Bandeau d'en-tête et barre de progression : identiques aux autres slides.
2. CARTE ENTREPRISE : rectangle arrondi x 0,55 / y 1,3 / w 13,33 − 1,1 /
   h 1,5, fond ${COULEURS.LIGHT}, contour ${COULEURS.ACCENT} épaisseur 1 pt.
   - LOGO RÉEL de l'entreprise, carré de 0,95 pouce, position x 0,85, centré
     verticalement dans la carte. Télécharge-le toi-même : va sur le site
     officiel de l'entreprise (le champ "domaine" te donne son adresse exacte)
     et récupère son logo, ou utilise une API publique de logos de marques
     (ex. https://www.google.com/s2/favicons?domain=<domaine>&sz=256 , ou
     https://img.logo.dev/<domaine>?size=256 ). Le logo est posé sur une
     pastille blanche arrondie (0,95 × 0,95, fond blanc, contour gris clair)
     avec 0,12 de marge, pour rester lisible quelle que soit la couleur de
     la marque. Si le logo est introuvable, remplace-le par une pastille
     ${COULEURS.PRIMARY} portant les initiales de l'entreprise en gris très
     foncé ${COULEURS.DARK}, 22 pt gras : n'affiche jamais un cadre vide ni une
     image cassée.
   - Nom de l'entreprise (champ "nom_entreprise") : à droite du logo, 22 pt,
     gras, couleur ${COULEURS.DARK}.
   - Secteur (champ "secteur") : sous le nom, 13 pt, couleur ${COULEURS.GREY}.
   - Source (champ "source") : sous le secteur, 9 pt, italique, gris, préfixée
     de « Source : ».
3. PASTILLES DE CHIFFRES CLÉS : sous la carte (y = 1,3 + 1,5 + 0,25), une
   pastille par entrée du champ "chiffres_cles" (2 à 3), réparties sur toute la
   largeur avec 0,25 d'écart, hauteur 1,0. Chaque pastille : rectangle arrondi
   fond blanc, contour ${COULEURS.ACCENT} 1 pt ; la valeur en 20 pt gras
   ${COULEURS.DARK} centrée, et le libellé en 10 pt gris centré dessous.
4. PUCES D'ANALYSE : sous les pastilles, 14 pt, mêmes règles que le corps
   standard (puces natives, 6 maximum).

### AUTRES VISUELS (champ "visuel" non nul)

Quand une slide porte un objet "visuel", ne te contente pas des puces :
construis le graphique correspondant dans la zone de corps, en respectant le
type annoncé, et place la "legende" en titre du graphique :

- "donnees" : histogramme vertical (une barre par entrée "libelle"/"valeur"),
  barres ${COULEURS.ACCENT}, valeurs affichées au-dessus de chaque barre.
- "repartition" : anneau (ou camembert) des parts, palette limitée à
  ${COULEURS.PRIMARY} et ${COULEURS.ACCENT} déclinés, pourcentages affichés.
- "comparaison" : barres groupées par "critere", deux séries (valeur_a et
  valeur_b) distinguées par ${COULEURS.PRIMARY} et ${COULEURS.ACCENT}, avec
  légende reprenant les deux libellés séparés par « | » dans "legende".
- "chronologie" : frise horizontale d'étapes reliées par des flèches
  ${COULEURS.ACCENT}, chaque "etape" en gras et sa "description" en dessous.

Les axes et les étiquettes restent sobres : pas de grille lourde, pas de
couleurs vives, texte en ${COULEURS.GREY} 10-11 pt.

### BARRE DE PROGRESSION (slides de contenu uniquement)

- Positionnée à l'intérieur du bandeau, en bas de celui-ci : y = 0,86, hauteur 0,09,
  x = 0,5, largeur = 13,33 − 1,0 (= 12,33).
- Rail complet : rectangle de ces dimensions, couleur ${COULEURS.LIGHT}, sans bordure.
- Partie remplie : même origine et même hauteur, largeur = 12,33 × (position de la
  slide ÷ nombre total de slides), couleur ${COULEURS.ACCENT}, sans bordure.
  La progression est calculée sur l'ensemble du diaporama, page de titre incluse.
- Compteur : juste sous la barre, x = 13,33 − 1,7 / y = 0,97 / w 1,2 / h 0,24,
  corps 9 pt, couleur ${COULEURS.LIGHT}, aligné à droite, au format « n / total »
  (ex. « 5 / 19 »).
- Rappel : elle est fine et discrète, elle ne doit jamais dominer le contenu.

### FIL ROUGE — RAPPEL DE LA PROBLÉMATIQUE EN PIED DE SLIDE

- Sur TOUTES les slides postérieures à la slide « Problématique », et sur la
  conclusion : affiche en bas de slide, en petit, la mention :
  « Problématique : « <texte de la problématique> » ».
- Position : x 0,6 / y 7,5 − 0,7 (= 6,8) / w 13,33 − 2,4 / h 0,6, corps 9 pt,
  italique, couleur ${COULEURS.GREY}, aligné à gauche, centré verticalement,
  retour à la ligne automatique activé.
- La slide de titre et les slides antérieures à la problématique n'affichent
  jamais ce rappel.

### CONTRÔLE FINAL AVANT LIVRAISON

Vérifie, slide par slide, que :
- le fond est blanc et les textes lisibles (aucun texte clair sur fond clair) ;
- chaque slide de contenu possède son bandeau jaune CESI et sa barre de progression ;
- la barre progresse bien d'une slide à l'autre et le compteur « n / total » est exact ;
- le rappel de la problématique apparaît uniquement après sa slide dédiée ;
- la page de titre ne mentionne ni le thème, ni la problématique ;
- les notes du présentateur sont remplies pour chaque slide de contenu ;
- aucune slide n'est un bloc de texte brut : au moins une forme, un encadré, un
  schéma ou un visuel structure l'information ;
- total entre 22 et 25 slides, page de titre comprise (fourchette stricte).
`.trim();
}

module.exports = { buildChartePptxClaude, COULEURS };
