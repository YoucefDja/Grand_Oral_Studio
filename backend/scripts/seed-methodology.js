/**
 * Seed de la méthodologie Tension.
 *
 * Usage (depuis /backend) :
 *   node scripts/seed-methodology.js
 *   # ou
 *   npm run seed
 *
 * Insère (upsert) :
 *  - les MethodologySection, dont le contenu est copié TEL QUEL depuis
 *    methodologie-grand-oral.md (extrait au build dans methodology-content.json) ;
 *  - les 6 StepSchema (analyse, probleme, recherche, glossaire, plan, support) ;
 *  - les 5 thèmes du Grand Oral CESI.
 *
 * Idempotent : peut être relancé sans risque.
 */
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Chargement du .env local si présent (Railway fournit les variables d'env).
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const MethodologySection = require('../src/models/MethodologySection');
const StepSchemaModel = require('../src/models/StepSchema');
const Theme = require('../src/models/Theme');

const raw = require('../methodology-content.json');

// Section "glossaire" absente de methodologie-grand-oral.md (nouvelle étape
// intermédiaire entre recherche et plan) : rédigée à partir du principe
// `principe_glossaire_sources`, appliqué concrètement.
// L'évaluation du Grand Oral ne dépend pas d'une appréciation globale : le jury
// note 14 critères (2 blocs de 7, chacun sur 28 points, total /56). Ce bloc est
// injecté à TOUTES les étapes pour que chaque livrable prépare explicitement un
// ou plusieurs critères, au lieu d'espérer qu'ils soient satisfaits par accident.
const GRILLE_EVALUATION_CESI = `L'étudiant est évalué par un jury sur une grille officielle CESI de 14 critères (deux blocs de 7, chacun noté sur 28 points, total sur 56). Chaque livrable que tu produis doit préparer explicitement les critères ci-dessous : ce ne sont pas des recommandations générales, ce sont les points sur lesquels l'étudiant sera noté.

BLOC 1 — Qualité de la réponse sur le fond (28 points) :
1.1 Présentation du contexte : intérêt du sujet, positionnement stratégique clair au sein de l'entreprise ou du secteur.
1.2 Enjeux dégagés : pertinence des enjeux et ancrage dans le questionnement actuel des entreprises, sur les cinq dimensions technique, organisationnelle, humaine, économique, environnementale (TOHEE).
1.3 Concepts et connaissances théoriques : mobilisation rigoureuse de concepts académiques et théoriques inhérents au sujet (auteurs, modèles, normes, cadres de référence nommés — pas seulement des notions de sens commun).
1.4 Benchmark et pratiques professionnelles : exemples d'entreprises réelles, retours d'expérience, comparaison de pratiques du marché (au moins un succès et un échec ou une limite, pour éviter le plaidoyer à sens unique).
1.5 Réponse stratégique aux enjeux : prise de position claire, hauteur de vue, propositions de solutions argumentées.
1.6 Professionnalisme et pragmatisme : opérationnalité et applicabilité concrète de la solution, vision globale du champ applicatif (avant, pendant, après le projet ou la démarche).
1.7 Pertinence des réponses aux questions du jury : capacité à argumenter, rebondir et convaincre (anticiper les objections et questions prévisibles du jury, avec les éléments de réponse).

BLOC 2 — Aptitudes générales et qualité de la forme (28 points) :
2.1 Structure de la présentation : organisation logique, clarté du plan, fil directeur visible.
2.2 Communication : qualité de l'expression orale, aptitude à la relation, sens de l'écoute, capacité de remise en cause.
2.3 Dynamisme de l'argumentation : prise de position affirmée, illustration par des exemples percutants, force de conviction.
2.4 Maîtrise de l'exercice : impact visuel et oral, gestion du stress, respect strict du temps imparti, aisance dans le jeu de questions/réponses.
2.5 Capacités d'analyse : finesse dans le décryptage de la problématique et des situations professionnelles exposées.
2.6 Capacités de synthèse : aptitude à aller à l'essentiel, structurer la pensée, restituer clairement les points clés.
2.7 Prise de recul et ouverture d'esprit : capacité à élargir la perspective, questionner l'avenir du sujet (questions d'ouverture) et nuancer le propos.

Exigences générales qui découlent de cette grille :
- Chaque affirmation quantitative doit être chiffrée et attribuée à une source identifiable ; une généralité non sourcée est notée comme une faiblesse sur 1.1, 1.2 et 1.6.
- Les concepts théoriques mobilisés doivent être nommés explicitement (modèle, norme, auteur, cadre d'analyse), pas seulement décrits en langage courant (critère 1.3).
- Les exemples d'entreprise doivent être réels, identifiables et datés ; ne jamais inventer un cas, un chiffre ou une source (critères 1.4 et 1.6).
- La démonstration doit être nuancée : reconnaître les limites, les contre-exemples et les conditions de réussite, plutôt que défendre une thèse unique (critères 2.3, 2.5, 2.7).
- Le temps imparti est évalué (critère 2.4) : toute production doit rester compatible avec la durée totale de l'oral fixée dans le plan, sans surcharge de contenu.
- Le support visuel est noté sur son impact (critère 2.4) : slides lisibles et structurées, jamais des blocs de texte dense.

Quand tu produis une étape, demande-toi explicitement quels critères cette étape prépare, et produis les éléments correspondants. Si une information manque pour satisfaire un critère, signale-le à l'étudiant au lieu de combler le vide par une généralité.`;

const ETAPE_4_GLOSSAIRE = `Produis le glossaire et les résumés de sources demandés avant toute mise en slides, en t'appuyant sur les résultats de la recherche documentaire fournis plus haut.

Contenu attendu :
- une liste « sources » : pour CHAQUE source retenue lors de la recherche documentaire, un objet avec :
  - titre : nom précis et identifiable de la source (rapport, article, organisme, livre, site…),
  - resume : résumé en 2-3 phrases indiquant ce que dit la source, pourquoi elle est pertinente pour la problématique, et quelle donnée chiffrée ou exemple concret elle apporte.
- une liste « termes » : glossaire des acronymes et termes techniques qui seront effectivement utilisés dans la présentation (slides ET notes orateur), avec pour chacun :
  - terme : l'acronyme ou le terme technique,
  - definition : une définition en langage clair, simple, qu'un étudiant peut se réapproprier et redire à l'oral sans hésitation devant un jury (pas une définition savante).

Contraintes :
- N'inclus dans le glossaire que les termes réellement nécessaires à la présentation — pas un inventaire de cours.
- Aucun acronyme ou terme technique ne devra ensuite apparaître dans le support de présentation s'il ne figure pas dans cette liste.
- Tout terme nouveau qui émergerait à une étape ultérieure devra y être ajouté au préalable, jamais utilisé sans définition.`;

/**
 * Liste canonique des sections en base. Les contenus sont copiés tels quels
 * depuis methodologie-grand-oral.md (clés du JSON) — jamais reformulés.
 * Les étapes renommées suite à l'ajout de l'étape glossaire pointent vers
 * leur section d'origine.
 */
const METHODOLOGY_SECTIONS = [
  {
    sectionId: 'role_et_objectif',
    title: 'Rôle et objectif de l’assistant',
    order: 1,
    appliesToSteps: ['all'],
    from: 'role_et_objectif',
  },
  {
    sectionId: 'principe_directeur_problematique',
    title: 'Principe directeur — construction de la problématique',
    order: 2,
    appliesToSteps: ['all'],
    from: 'principe_directeur_problematique',
  },
  {
    sectionId: 'garde_fous_anti_derive',
    title: 'Garde-fous anti-dérive (validation d’une problématique)',
    order: 3,
    appliesToSteps: ['all'],
    from: 'garde_fous_anti_derive',
  },
  {
    sectionId: 'principe_ligne_directrice',
    title: 'Ligne directrice — fil conducteur de la démonstration',
    order: 4,
    appliesToSteps: ['probleme', 'recherche', 'glossaire', 'plan', 'support'],
    from: 'principe_ligne_directrice',
  },
  {
    sectionId: 'principe_glossaire_sources',
    title: 'Glossaire et résumés des sources (principe)',
    order: 5,
    appliesToSteps: ['recherche', 'glossaire', 'support'],
    from: 'principe_glossaire_sources',
  },
  {
    sectionId: 'grille_evaluation_cesi',
    title: 'Grille d’évaluation du jury CESI (14 critères, /56)',
    order: 5,
    appliesToSteps: ['all'],
    content: GRILLE_EVALUATION_CESI,
  },
  {
    sectionId: 'etape_1_analyse_sujet',
    title: 'Étape 1 — Analyse du sujet',
    order: 10,
    appliesToSteps: ['analyse'],
    from: 'etape_1_analyse_sujet',
  },
  {
    sectionId: 'etape_2_problematique',
    title: 'Étape 2 — Problématique',
    order: 10,
    appliesToSteps: ['probleme'],
    from: 'etape_2_problematique',
  },
  {
    sectionId: 'etape_3_recherche_documentaire',
    title: 'Étape 3 — Recherche documentaire',
    order: 10,
    appliesToSteps: ['recherche'],
    from: 'etape_3_recherche_documentaire',
  },
  {
    sectionId: 'etape_4_glossaire',
    title: 'Étape 4 — Glossaire et résumés des sources',
    order: 10,
    appliesToSteps: ['glossaire'],
    content: ETAPE_4_GLOSSAIRE,
  },
  {
    sectionId: 'etape_5_plan_detaille',
    title: 'Étape 5 — Plan détaillé',
    order: 10,
    appliesToSteps: ['plan'],
    from: 'etape_4_plan_detaille',
  },
  {
    sectionId: 'etape_6_support_visuel',
    title: 'Étape 6 — Support de présentation',
    order: 10,
    appliesToSteps: ['support'],
    from: 'etape_5_support_visuel',
  },
  {
    sectionId: 'garde_fou_sujets_academiques',
    title: 'Garde-fou — sujets académiques à tension explicite',
    order: 20,
    appliesToSteps: ['all'],
    from: 'garde_fou_sujets_academiques',
  },
];

/** Descriptions textuelles des JSON attendus, injectées à la fin du prompt. */
const STEP_SCHEMAS = [
  {
    stepKey: 'analyse',
    jsonSchemaDescription: [
      'Objet JSON avec les clés suivantes (toutes en snake_case) :',
      '- "reformulation" : chaîne — reformulation fidèle du sujet en une phrase.',
      '- "mots_cles" : tableau d\'objets { "mot": chaîne, "definition": chaîne } — chaque mot-clé du sujet avec sa définition contextualisée (pas une définition de dictionnaire).',
      '- "notions_a_maitriser" : tableau d\'objets { "notion": chaîne, "reference_theorique": chaîne, "apport" : chaîne } — chaque notion à maîtriser avec le modèle, la norme, l\'auteur ou le cadre académique qui la fonde (reference_theorique) et ce qu\'elle apporte à la démonstration (apport). C\'est ce qui permet de satisfaire le critère 1.3 de la grille jury (mobilisation de connaissances théoriques), et ces références doivent ensuite être réutilisées explicitement dans les slides et les notes orateur, pas seulement listées ici.',
      '- "questions_ouvertes" : tableau de chaînes — questions ouvertes soulevées par le sujet.',
      '- "tensions" : tableau d\'objets { "pole_a": chaîne, "pole_b": chaîne, "description": chaîne } — tensions/contradictions repérables à ce stade, même provisoires.',
      '- "angles_approche" : tableau de chaînes — angles d\'approche possibles pour la suite.',
      '- "positionnement_strategique" : chaîne — en quoi ce sujet est stratégique pour l\'entreprise ou le secteur, et pour qui (grille jury, critère 1.1 « présentation du contexte »).',
      'Les enjeux et tensions doivent couvrir les cinq dimensions TOHEE quand elles sont pertinentes : technique, organisationnelle, humaine, économique, environnementale (grille jury, critère 1.2 « enjeux dégagés »).',
      'Ne choisis pas encore de problématique à cette étape : elle doit rester exploratoire.',
    ].join('\n'),
  },
  {
    stepKey: 'probleme',
    jsonSchemaDescription: [
      'Objet JSON avec les clés suivantes :',
      '- "ligne_directrice" : chaîne OBLIGATOIRE — la phrase unique « fil rouge » de toute la présentation, dérivée de la problématique retenue. Elle sera réutilisée et renforcée à toutes les étapes suivantes.',
      '- "formulations" : tableau de 2 à 4 objets { "formulation": chaîne, "tension": { "pole_a": chaîne, "pole_b": chaîne }, "pourquoi_discutable": chaîne, "pourquoi_bornee_par_le_sujet": chaîne } — chaque formulation est reliée à une tension réelle identifiée dans l\'analyse du sujet.',
      'LONGUEUR IMPOSÉE DE LA QUESTION : chaque "formulation" doit tenir en UNE SEULE phrase de 26 mots maximum (180 caractères maximum), point d\'interrogation inclus. Une problématique est un fil rouge que l\'étudiant doit pouvoir redire de mémoire et que le support rappelle en pied de chaque slide : au-delà de cette longueur elle n\'est plus utilisable. Supprime les subordonnées, les incises et les énumérations : garde le verbe d\'action, les deux pôles de la tension et le contexte du sujet, rien de plus.',
      'CE QU\'UNE PROBLÉMATIQUE N\'EST PAS : ce n\'est pas un débat d\'opinion. Les tournures du type « Faut-il… ? », « Doit-on… ? », « Est-ce bien ou mal… ? », « Est-ce souhaitable… ? », « Est-ce moral… ? », « Peut-on accepter… ? » sont INTERDITES : elles appellent un jugement de valeur et un choix de société (pour / contre), pas un travail d\'analyse documenté. Une problématique soulève un PROBLÈME RÉEL à instruire — une difficulté concrète que des organisations rencontrent et à laquelle on peut apporter une réponse argumentée, nuancée et étayée, en plusieurs parties.',
      'CE QU\'UNE PROBLÉMATIQUE N\'EST PAS (bis) : ce n\'est pas une reformulation du sujet. Reprendre l\'intitulé en le retournant ou en ajoutant un point d\'interrogation est éliminatoire. La question doit faire apparaître un angle que l\'intitulé ne contient pas déjà : la tension, le conflit de logiques ou le nœud de décision que le sujet recouvre.',
      '- "recommandation" : chaîne — la formulation recommandée, retenue parmi les propositions.',
      '- "justification_recommandation" : chaîne — pourquoi cette formulation est la plus solide.',
      'Toutes les formulations doivent passer les tests anti-dérive (pas de reformulation plate, pas de réponse évidente, périmètre borné par le sujet, tension réelle, argumentation possible en plusieurs parties).',
    ].join('\n'),
  },
  {
    stepKey: 'recherche',
    jsonSchemaDescription: [
      'Objet JSON avec les clés suivantes :',
      '- "axes_recherche" : tableau de chaînes — axes déduits de la problématique retenue.',
      '- "types_sources" : tableau de chaînes — types de sources à mobiliser.',
      '- "organismes_exemples" : tableau d\'objets { "nom": chaîne, "type": chaîne, "pourquoi": chaîne } — organismes, revues, cabinets ou rapports réels et identifiables.',
      '- "donnees_a_rechercher" : tableau de chaînes — données chiffrées et pourcentages à rechercher en priorité.',
      '- "exemples_entreprises" : tableau d\'objets { "nom": chaîne, "contexte": chaîne, "resultat": chaîne, "apport": chaîne, "issue": chaîne, "source": chaîne } — exemples réels, avec leur apport pour l\'analyse. "issue" vaut "succes" ou "echec_ou_limite" : la grille jury (critère 1.4, benchmark et pratiques professionnelles) exige une comparaison de pratiques du marché, donc au moins un exemple de chaque nature si le sujet le permet. "source" identifie précisément d\'où vient le cas (rapport, article, étude) : un exemple non sourcé ne compte pas dans le benchmark.',
      '- "references_theoriques" : tableau d\'objets { "reference": chaîne, "concept": chaîne, "usage": chaîne } — modèle, norme, auteur ou cadre académique à mobiliser, le concept qu\'il fonde et l\'usage qu\'en fera la présentation (critère 1.3). Il doit y en avoir au moins deux, cohérents avec les notions de l\'analyse du sujet.',
      '- "questions_du_jury" : tableau d\'objets { "question": chaîne, "angle_de_reponse": chaîne } — questions ou objections prévisibles du jury, avec l\'élément de réponse à mobiliser (critère 1.7 « pertinence des réponses aux questions du jury »). Couvre au moins une objection de fond, une question technique et une question de mise en œuvre.',
      '- "consignes_fiches_lecture" : tableau de chaînes — consignes pour constituer des fiches de lecture par source.',
      '- "pieges_a_eviter" : tableau de chaînes — pièges méthodologiques à éviter.',
      'Rappelle-toi qu\'une IA seule ne suffit pas comme source : le but est de guider des recherches réelles et vérifiables.',
    ].join('\n'),
  },
  {
    stepKey: 'glossaire',
    jsonSchemaDescription: [
      'Objet JSON avec exactement deux clés :',
      '- "sources" : tableau d\'objets { "titre": chaîne, "resume": chaîne } — UN objet par source retenue ; resume = 2-3 phrases : ce que dit la source, pourquoi elle est pertinente pour la problématique, quelle donnée ou exemple concret elle apporte.',
      '- "termes" : tableau d\'objets { "terme": chaîne, "definition": chaîne } — glossaire des acronymes et termes techniques réellement utilisés, définition en langage clair et réutilisable à l\'oral.',
      'Les deux tableaux doivent être non vides. Ne liste que des termes et sources réellement utiles à la présentation.',
    ].join('\n'),
  },
  {
    stepKey: 'plan',
    jsonSchemaDescription: [
      'Objet JSON avec les clés suivantes :',
      '- "duree_totale_minutes" : nombre — durée totale de l\'oral (20 par défaut).',
      '- "sections" : tableau d\'objets { "partie": chaîne, "role": chaîne, "minutes": nombre, "points": [chaînes] } — au minimum une section par grande partie : Introduction, Contexte (données chiffrées actuelles), Enjeux (TOHEE restreints au cœur de la problématique), Existant (état de l\'art + retours d\'expérience), Solutions / préconisations (posture consultant, contextualisées par taille d\'entreprise), Conclusion (réponse à la problématique + ouverture prospective sans y répondre).',
      '- "repartition_temps" : objet { "introduction": nombre, "contexte": nombre, "enjeux": nombre, "existant": nombre, "solutions": nombre, "conclusion": nombre } dont la somme égale duree_totale_minutes.',
      '- "fil_directeur" : chaîne — la phrase unique qui relie l\'introduction, chaque partie et la conclusion et que le jury doit pouvoir reformuler (critère 2.1 « structure de la présentation, fil directeur visible »). Elle découle de la ligne directrice déjà établie, sans la contredire.',
      '- "objections_et_reponses" : tableau d\'objets { "objection": chaîne, "reponse": chaîne } — les objections prévisibles du jury et la réponse à y apporter (critère 1.7). Reprends et complète les questions du jury issues de la recherche documentaire.',
      '- "ouverture" : objet { "question": chaîne, "pourquoi_elle_reste_ouverte": chaîne } — la question prospective finale (critère 2.7 « prise de recul et ouverture d\'esprit »). Elle doit rester explicitement sans réponse dans la conclusion.',
      'Chaque partie doit faire progresser explicitement la réponse à la problématique et renforcer la ligne directrice. Le minutage doit être réaliste (introduction/conclusion courtes) et le total respecté à la minute près, la gestion du temps étant notée par le jury (critère 2.4).',
    ].join('\n'),
  },
  {
    stepKey: 'support',
    jsonSchemaDescription: [
      'Objet JSON avec une clé "slides" : tableau d\'objets { "titre": chaîne, "type": chaîne, "forme_visuelle": chaîne, "puces": [chaînes], "visuel": objet|null, "nom_entreprise": chaîne (slides "exemple_entreprise" uniquement), "domaine": chaîne (slides "exemple_entreprise" uniquement), "secteur": chaîne (slides "exemple_entreprise" uniquement), "source": chaîne (slides "exemple_entreprise" uniquement), "chiffres_cles": tableau (slides "exemple_entreprise" uniquement), "notes_orateur": chaîne }, PLUS une clé "notes_globales" (chaîne optionnelle).',
      '- "type" parmi : "contexte" | "enjeux" | "problematique" | "existant" | "donnees" | "exemple_entreprise" | "solutions" | "conclusion".',
      'CHAMPS OBLIGATOIRES DES SLIDES "exemple_entreprise" — ils alimentent un encadré visuel avec le logo réel de l\'entreprise, donc leur exactitude conditionne le rendu :',
      '  · "nom_entreprise" : raison sociale courante de l\'entreprise (ex. "Amazon Web Services", "OVHcloud", "SNCF"). Jamais un sigle ambigu, jamais "l\'entreprise X".',
      '  · "domaine" : nom de domaine officiel de l\'entreprise, sans "https://" ni "www." (ex. "aws.amazon.com", "ovhcloud.com", "sncf.com"). Ce domaine sert à télécharger le logo officiel de la marque : il doit être exact et correspondre à l\'entreprise réellement citée. En cas de doute sur le domaine exact, choisis le domaine principal du groupe (ex. "amazon.fr" plutôt qu\'un sous-domaine incertain) — un domaine erroné afficherait un logo sans rapport.',
      '  · "secteur" : secteur d\'activité suivi du siège, sur une ligne (ex. "Cloud public — Seattle, États-Unis").',
      '  · "chiffres_cles" : tableau de 2 à 3 objets { "valeur": chaîne, "libelle": chaîne } mis en avant dans des pastilles (ex. { "valeur": "31 %", "libelle": "Part de marché mondiale" }). Les valeurs doivent être réelles, datées et cohérentes avec les puces.',
      '  · "source" : référence de la source du cas et des chiffres (elle s\'affiche sous le nom de l\'entreprise). Jamais de source inventée.',
      '- "forme_visuelle" : chaîne OBLIGATOIRE décrivant la mise en forme de la slide, choisie dans cette liste : "puces" (liste à puces sobre), "chiffre_cle" (un grand chiffre mis en avant avec son explication), "deux_colonnes" (comparaison, ex. pôle A / pôle B, avant / après, succès / échec), "carte" (un encadré par idée, 2 à 4 encadrés), "frise" (étapes chronologiques, ex. avant / pendant / après), "question" (la question mise en grand au centre). Varie les formes d\'une slide à l\'autre : un enchaînement de slides toutes en "puces" est pénalisé par le jury sur l\'impact visuel (critère 2.4).',
      '- "puces" : phrases courtes (le détail argumentatif va dans les notes orateur, jamais sur la slide). Maximum 6 puces par slide, chaque puce tenant en une ligne : une slide surchargée est pénalisée sur les critères 2.4 (impact visuel) et 2.6 (capacités de synthèse).',
      '- "visuel" : objet { "type": chaîne, "legende": chaîne, "donnees": tableau } ou null. Utilise-le quand la slide gagne à être illustrée : "type" vaut "donnees" (donnees = tableau d\'objets { "libelle": chaîne, "valeur": nombre } → histogramme), "repartition" (donnees = même structure → anneau/parts), "comparaison" (donnees = tableau d\'objets { "critere": chaîne, "valeur_a": nombre, "valeur_b": nombre } → barres groupées, avec les libellés des deux séries dans "legende" séparés par " | ") ou "chronologie" (donnees = tableau d\'objets { "etape": chaîne, "description": chaîne } → frise d\'étapes). "legende" titre le visuel. Les valeurs doivent être des chiffres réels, cohérents avec les puces et sourcés ; n\'invente jamais un graphique décoratif.',
      '- "notes_orateur" : argumentation complète en français oral fluide, prête à être dite à voix haute.',
      'Ordre narratif IMPOSÉ des slides — référence absolue : la spécification de structure du support Grand Oral CESI. La progression est un entonnoir, non négociable : Contexte → Enjeux → Problématique posée → Existant (fondements & théorie) → Données statistiques sourcées et récentes → Cas réels d\'entreprise sourcés (benchmarks) → Solutions et préconisations (posture consultant) → Conclusion. Concrètement : unique slide "problematique" POSÉE APRÈS le contexte et les enjeux (ne la formule jamais avant sa slide dédiée, elle émerge de leur tension) ; puis, dans cet ordre, les slides "existant" (concepts académiques et état de l\'art), les slides "donnees" (chiffres du marché, chacun avec sa source en bas de slide et la plus récente possible), les slides "exemple_entreprise" (cas réels succès ET échecs, chacun sourcé en bas de slide avec une référence actualisée), et enfin les slides "solutions" (réponse stratégique actionnable, contextualisée par la taille d\'entreprise, structurée avant / pendant / après).',
      'Cible de volume : environ 20 slides au total dans le fichier final, page de titre comprise (elle est ajoutée automatiquement à l\'export) : génère donc 18 à 19 slides de contenu, la slide de conclusion incluse, tolérance ±2. Répartition indicative : contexte & accroche 2, enjeux 1-2, slide problématique 1, existant / état de l\'art 4-5, statistiques chiffrées 2-3, cas réels d\'entreprise 3-4, solutions & préconisations 4-5, conclusion 1. Ne gonfle jamais artificiellement le contenu pour atteindre le chiffre.',
      'Exigences de fond imposées par la grille du jury (chaque exigence doit être visible sur au moins une slide) : une slide "contexte" qui présente le sujet, ses mots-clés, un ou deux chiffres clés et le positionnement stratégique (critère 1.1) ; les enjeux structurés par la grille TOHEE — Technique, Organisationnel, Humain, Économique, Environnemental — restreinte au cœur du sujet (critère 1.2) ; au moins une slide "existant" qui mobilise NOMMÉMENT les références théoriques fournies dans l\'analyse et la recherche documentaire (critère 1.3) ; au moins une slide "exemple_entreprise" présentant une entreprise réelle avec sa source, et au moins une slide rapportant un échec ou une limite, pas uniquement des réussites (critère 1.4, benchmark nuancé) ; les slides "solutions" structurées selon le champ applicatif avant / pendant / après (critère 1.6, pragmatisme) ; une slide "conclusion" qui répond explicitement à la problématique, rappelle le fil directeur et se termine par la question d\'ouverture du plan, posée sans y répondre (critères 2.1 et 2.7) ; sur au moins une slide, une prise de position affirmée formulée comme telle, avec la condition de sa réussite (critères 1.5 et 2.3).',
      'Exigence visuelle (critère 2.4 « impact visuel ») : au moins 6 slides doivent porter un objet "visuel" non nul, réparties sur la présentation, dont au moins une dans la partie contexte. Les autres slides utilisent une "forme_visuelle" autre que "puces". Aucune slide ne doit se réduire à un bloc de texte. Chaque slide "exemple_entreprise" est rendue automatiquement sous forme d\'encadré avec le logo réel de la marque (téléchargé à partir du "domaine" fourni) et ses "chiffres_cles" en pastilles : renseigner "nom_entreprise", "domaine" et "chiffres_cles" est donc indispensable pour que le cas réel soit identifiable d\'un coup d\'œil, comme l\'attend le jury sur les benchmarks.',
      'Provenance : quand une slide présente un chiffre, une donnée ou un exemple rapporté du web, ajouter en dessous une ligne courte « Source : … » citant une source validée fournie dans le glossaire (jamais une source inventée). Cette règle est notée par le jury : toute donnée chiffrée non sourcée affaiblit les critères 1.1, 1.2 et 1.6.',
      'Un paragraphe d\'une puce ne doit jamais dépasser une ligne ; si une idée demande plus, elle va dans les notes orateur (critères 2.4 et 2.6).',
      'RÈGLE ABSOLUE : aucun acronyme ou terme technique absent du glossaire fourni ne doit apparaître dans les puces, les visuels ou les notes orateur.',
    ].join('\n'),
  },
];

/** Les 5 thèmes du Grand Oral CESI (modifiables ensuite dans le panneau admin). */
const THEMES = [
  { label: 'Numérique, IA & transformation digitale', order: 1 },
  { label: 'Industrie du futur & robotique', order: 2 },
  { label: 'Transition écologique & énergie', order: 3 },
  { label: 'Santé & biotechnologies', order: 4 },
  { label: 'Société, éthique & responsabilité', order: 5 },
];

async function seedMethodology() {
  const url = process.env.MONGO_URL;
  if (!url) {
    console.error('MONGO_URL manquante. Renseignez backend/.env (local) ou liez le plugin MongoDB (Railway).');
    process.exit(1);
  }
  await mongoose.connect(url, { serverSelectionTimeoutMS: 8000 });
  console.log('Connecté à MongoDB.');

  // ---- MethodologySection ----
  for (const def of METHODOLOGY_SECTIONS) {
    let content = def.content;
    if (content === undefined) {
      if (!raw[def.from]) {
        throw new Error(`Contenu introuvable pour la section "${def.sectionId}" (clé "${def.from}").`);
      }
      content = raw[def.from];
    }
    await MethodologySection.findOneAndUpdate(
      { sectionId: def.sectionId },
      {
        $set: {
          title: def.title,
          content,
          order: def.order,
          appliesToSteps: def.appliesToSteps,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  const sectionCount = await MethodologySection.countDocuments();
  console.log(`MethodologySection : ${METHODOLOGY_SECTIONS.length} upsertées (total en base : ${sectionCount}).`);

  // ---- StepSchema ----
  for (const def of STEP_SCHEMAS) {
    await StepSchemaModel.findOneAndUpdate(
      { stepKey: def.stepKey },
      { $set: { jsonSchemaDescription: def.jsonSchemaDescription } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`StepSchema : ${STEP_SCHEMAS.length} upsertés.`);

  // ---- Theme ----
  for (const theme of THEMES) {
    const exists = await Theme.findOne({ label: theme.label });
    if (!exists) await Theme.create(theme);
  }
  // Supprime un éventuel doublon de thème issu d'un seed précédent.
  for (const theme of THEMES) {
    const matches = await Theme.find({ label: theme.label }).sort({ createdAt: 1 });
    for (let i = 1; i < matches.length; i += 1) {
      await matches[i].deleteOne();
    }
  }
  const themeCount = await Theme.countDocuments();
  console.log(`Theme : ${THEMES.length} thèmes garantis (total en base : ${themeCount}).`);

  console.log('Seed terminé avec succès.');
}

seedMethodology()
  .catch((err) => {
    console.error('Seed échoué :', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
