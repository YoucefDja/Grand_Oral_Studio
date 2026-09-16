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
 *  - les 5 StepSchema du parcours visible (analyse, probleme, plan, glossaire,
 *    support) + le StepSchema "recherche" conservé pour la génération
 *    automatique en arrière-plan ;
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

const ETAPE_4_GLOSSAIRE = `Produis le glossaire et les résumés de sources APRÈS le plan détaillé, en t'appuyant sur le plan fourni plus haut et sur les résultats de la recherche documentaire.

Objectif : ne définir que les termes que l'étudiant est SÛR d'employer dans sa présentation. Le plan fait autorité : c'est lui qui détermine quels termes entrent au glossaire.

Contenu attendu :
- une liste « termes » : parcours le plan section par section et relève tous les acronymes et termes techniques qui y figurent effectivement (dans les points clés comme dans les notes) ; pour chacun :
  - terme : l'acronyme ou le terme technique,
  - definition : une définition COURTE — une seule phrase, 20 mots maximum — en langage clair, qu'un étudiant peut se réapproprier et redire à l'oral sans hésitation devant un jury (pas une définition savante). Va à l'essentiel : ce que le terme désigne dans le contexte du sujet, rien de plus. Pas d'exemple, pas d'historique, pas de développement, pas de seconde phrase.
  - theme : le thème auquel ce terme se rattache. Utilise en priorité le thème de la session fourni en contexte (le sujet traité). Si le terme relève manifestement d'un domaine distinct et identifiable, indique ce domaine ; sinon reprends le thème de la session. Un seul thème par terme, court (2 à 4 mots).
- une liste « sources » : pour chaque source réellement mobilisée (issue de la recherche documentaire), un objet avec :
  - titre : nom précis et identifiable de la source (rapport, article, organisme, livre, site…),
  - resume : résumé en 2 phrases maximum indiquant ce que dit la source et quelle donnée chiffrée ou exemple concret elle apporte.

Contraintes :
- N'inclus dans le glossaire que les termes réellement présents dans le plan — pas un inventaire de cours, pas de termes « au cas où ».
- Aucun acronyme ou terme technique ne devra ensuite apparaître dans le support de présentation s'il ne figure pas dans cette liste.
- Tout terme nouveau qui émergerait à l'étape support devra y être ajouté au préalable, jamais utilisé sans définition.`;

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
    title: 'Recherche documentaire — produite en arrière-plan',
    order: 10,
    appliesToSteps: ['recherche'],
    from: 'etape_3_recherche_documentaire',
  },
  {
    sectionId: 'etape_3_plan_detaille',
    title: 'Étape 3 — Plan détaillé',
    order: 10,
    appliesToSteps: ['plan'],
    from: 'etape_4_plan_detaille',
  },
  {
    sectionId: 'etape_4_glossaire',
    title: 'Étape 4 — Glossaire et résumés des sources',
    order: 10,
    appliesToSteps: ['glossaire'],
    content: ETAPE_4_GLOSSAIRE,
  },
  {
    sectionId: 'etape_5_support_visuel',
    title: 'Étape 5 — Support de présentation',
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
      '- "notions_a_maitriser" : tableau d\'objets { "notion": chaîne, "definition": chaîne, "reference_theorique": chaîne } — chaque notion technique ou de gestion à maîtriser est présentée en DEUX temps : (1) "definition" = une définition COURTE (une phrase, 25 mots maximum) et contextualisée au sujet traité — pas une définition de dictionnaire, elle dit ce que la notion recouvre concrètement dans le cadre de ce sujet ; (2) "reference_theorique" = le modèle, la norme, l\'auteur ou le cadre académique qui fonde la notion, en quelques mots. La référence théorique est conservée en arrière-plan : elle sert à satisfaire le critère 1.3 de la grille jury (mobilisation de connaissances théoriques) et sera réutilisée explicitement dans les slides et les notes orateur. La définition courte, elle, n\'est PAS reprise telle quelle dans les slides : elle sert à l\'étudiant pour comprendre la notion.',
      '- "tensions" : tableau d\'objets { "pole_a": chaîne, "pole_b": chaîne, "description": chaîne } — tensions/contradictions repérables à ce stade, même provisoires.',
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
      'LONGUEUR IMPOSÉE DE LA QUESTION : chaque "formulation" doit tenir en UNE SEULE phrase de 35 mots maximum (240 caractères maximum), point d\'interrogation inclus. Une problématique est un fil rouge que l\'étudiant doit pouvoir redire de mémoire et que le support rappelle en pied de chaque slide : au-delà de cette longueur elle n\'est plus utilisable. Supprime les subordonnées, les incises et les énumérations : garde le verbe d\'action, les deux pôles de la tension et le contexte du sujet, rien de plus.',
      'CE QU\'UNE PROBLÉMATIQUE N\'EST PAS : ce n\'est pas un débat d\'opinion. Les tournures du type « Faut-il… ? », « Doit-on… ? », « Est-ce bien ou mal… ? », « Est-ce souhaitable… ? », « Est-ce moral… ? », « Peut-on accepter… ? » sont INTERDITES : elles appellent un jugement de valeur et un choix de société (pour / contre), pas un travail d\'analyse documenté. Une problématique soulève un PROBLÈME RÉEL à instruire — une difficulté concrète que des organisations rencontrent et à laquelle on peut apporter une réponse argumentée, nuancée et étayée, en plusieurs parties.',
      'CE QU\'UNE PROBLÉMATIQUE N\'EST PAS (bis) : ce n\'est pas une reformulation du sujet. Reprendre l\'intitulé en le retournant ou en ajoutant un point d\'interrogation est éliminatoire. La question doit faire apparaître un angle que l\'intitulé ne contient pas déjà : la tension, le conflit de logiques ou le nœud de décision que le sujet recouvre.',
      'CE QU\'UNE PROBLÉMATIQUE DOIT PERMETTRE (double exigence de fond) : (1) elle soulève un PROBLÈME RÉEL, c\'est-à-dire une difficulté concrète et documentée que des entreprises ou des organisations rencontrent effectivement — pas une question purement théorique, pas un simple constat (« pourquoi le problème existe-t-il ? ») et pas un débat de société ; (2) elle appelle une SOLUTION APPORTABLE : l\'étudiant doit pouvoir y répondre par des préconisations concrètes, contextualisées et argumentées, et non se contenter de décrire ou de déplorer le problème. C\'est le sens même du travail de veille. Une formulation qui se borne à constater une difficulté sans qu\'aucune réponse actionnable ne puisse être proposée est à écarter : reformule-la autour du levier de résolution possible, en gardant les deux pôles de la tension.',
      'Cette double exigence se vérifie aussi en aval : le plan détaillé puis le support visuel doivent RÉPONDRE explicitement à la problématique retenue, et comporter une partie préconisations. Une problématique qui n\'est plus traitée (ou une réponse qui sort du périmètre des mots-clés du sujet) constitue un hors-sujet pénalisé par le jury.',
      '- "recommandation" : chaîne — la formulation recommandée, retenue parmi les propositions.',
      '- "justification_recommandation" : chaîne — pourquoi cette formulation est la plus solide.',
      'Toutes les formulations doivent passer les tests anti-dérive (pas de reformulation plate, pas de réponse évidente, périmètre borné par le sujet, tension réelle, argumentation possible en plusieurs parties).',
    ].join('\n'),
  },
  {
    stepKey: 'recherche',
    jsonSchemaDescription: [
      'Cette étape est produite automatiquement par le système, en arrière-plan, juste avant le plan détaillé : l\'étudiant ne la voit jamais. Le résultat sert de socle documentaire au plan, au glossaire et au support. Produis donc un socle factuel directement exploitable.',
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
      '- "sources" : tableau d\'objets { "titre": chaîne, "resume": chaîne } — UN objet par source retenue ; resume = 2 phrases maximum : ce que dit la source et quelle donnée ou exemple concret elle apporte. Ce tableau n\'est PAS montré à l\'étudiant : il est conservé en base pour être réinjecté dans le support.',
      '- "termes" : tableau d\'objets { "terme": chaîne, "definition": chaîne, "theme": chaîne } — glossaire des acronymes et termes techniques réellement utilisés. "definition" est COURTE : une seule phrase, 20 mots maximum, langage clair et réutilisable à l\'oral, sans exemple ni développement. "theme" est le thème de rattachement du terme (2 à 4 mots) : reprends le thème de la session fourni en contexte, sauf si le terme relève manifestement d\'un domaine distinct et identifiable.',
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
      'RÉPONSE À LA PROBLÉMATIQUE (exigence de cohérence) : le plan doit RÉPONDRE à la question retenue, pas seulement la poser. Il comporte obligatoirement une partie « Solutions / préconisations » qui apporte une réponse concrète, actionnable et contextualisée (posture consultant), et chaque partie du développement doit contribuer à cette réponse. Une problématique posée puis non traitée, ou une réponse qui sort du périmètre des mots-clés du sujet, constitue un hors-sujet pénalisé par le jury.',
    ].join('\n'),
  },
  {
    stepKey: 'support',
    jsonSchemaDescription: [
      'Objet JSON avec une clé "slides" : tableau d\'objets { "titre": chaîne, "type": chaîne, "forme_visuelle": chaîne, "puces": [chaînes], "visuel": objet|null, "transition": chaîne (OBLIGATOIRE sur chaque slide de contenu), "nom_entreprise": chaîne (slides "exemple_entreprise" uniquement), "domaine": chaîne (slides "exemple_entreprise" uniquement), "secteur": chaîne (slides "exemple_entreprise" uniquement), "source": chaîne (slides "exemple_entreprise" uniquement), "chiffres_cles": tableau (slides "exemple_entreprise" uniquement), "notes_orateur": chaîne }, PLUS une clé "notes_globales" (chaîne optionnelle).',
      '- "type" parmi : "contexte" | "enjeux" | "problematique" | "existant" | "donnees" | "exemple_entreprise" | "solutions" | "conclusion".',
      '- "titre" : titre de la slide, JAMAIS une phrase. Deux ou trois mots maximum, en mots-clés, lisibles d\'un coup d\'œil par le jury. Nomenclature IMPOSÉE, dans cet ordre : "Plan de présentation", "Contexte", "Mots clés du sujet", "Enjeux", "Problématique", "Existant", "Chiffres clés", "Cas d\'entreprises", "Solutions", "Conclusion". Aucun verbe conjugué, aucun point, aucun sous-titre explicatif : le développement va dans les puces et les notes, jamais dans le titre.',
      '- "transition" : phrase de transition OBLIGATOIRE sur CHAQUE slide de contenu (sauf la conclusion) — c\'est la ligne directrice continue du support. Une seule phrase courte (12 à 18 mots), discrète, qui part du contenu de la slide courante et annonce explicitement la suivante : « … ce qui m\'amène à… », « … voyons maintenant… », « … d\'où la question suivante… ». Elle s\'affiche en bas de slide, en petit. Elle ne répète pas une puce, n\'introduit aucun chiffre ni terme nouveau, et ne pose JAMAIS la problématique avant sa slide dédiée. Elle ne se réduit pas à une formule creuse (« passons à la suite ») : elle rend visible le fil du raisonnement d\'un bout à l\'autre de l\'oral. La dernière slide de contenu n\'a pas de transition.',
      'CHAMPS OBLIGATOIRES DES SLIDES "exemple_entreprise" — ils alimentent un encadré visuel avec le logo réel de l\'entreprise, donc leur exactitude conditionne le rendu :',
      '  · "nom_entreprise" : raison sociale courante de l\'entreprise (ex. "Amazon Web Services", "OVHcloud", "SNCF"). Jamais un sigle ambigu, jamais "l\'entreprise X".',
      '  · "domaine" : nom de domaine officiel de l\'entreprise, sans "https://" ni "www." (ex. "aws.amazon.com", "ovhcloud.com", "sncf.com"). Ce domaine sert à télécharger le logo officiel de la marque : il doit être exact et correspondre à l\'entreprise réellement citée. En cas de doute sur le domaine exact, choisis le domaine principal du groupe (ex. "amazon.fr" plutôt qu\'un sous-domaine incertain) — un domaine erroné afficherait un logo sans rapport.',
      '  · "secteur" : secteur d\'activité suivi du siège, sur une ligne (ex. "Cloud public — Seattle, États-Unis").',
      '  · "chiffres_cles" : tableau de 2 à 3 objets { "valeur": chaîne, "libelle": chaîne } mis en avant dans des pastilles (ex. { "valeur": "31 %", "libelle": "Part de marché mondiale" }). Les valeurs doivent être réelles, datées et cohérentes avec les puces.',
      '  · "source" : référence de la source du cas et des chiffres (elle s\'affiche sous le nom de l\'entreprise). Jamais de source inventée.',
      '- "forme_visuelle" : chaîne OBLIGATOIRE décrivant la mise en forme de la slide, choisie dans cette liste : "puces" (liste à puces sobre), "chiffre_cle" (un grand chiffre mis en avant avec son explication), "deux_colonnes" (comparaison, ex. avant / après, deux périodes, succès / échec), "carte" (un encadré par idée, 2 à 4 encadrés), "frise" (étapes chronologiques, ex. avant / pendant / après), "question" (la question mise en grand au centre). La slide "problematique" utilise TOUJOURS "question". La forme "deux_colonnes" est réservée aux slides "existant", "donnees", "exemple_entreprise" ou "solutions" : elle est INTERDITE sur la slide "problematique", qui n\'oppose jamais deux camps. Varie les formes d\'une slide à l\'autre : un enchaînement de slides toutes en "puces" est pénalisé par le jury sur l\'impact visuel (critère 2.4).',
      '- "puces" : phrases courtes (le détail argumentatif va dans les notes orateur, jamais sur la slide). Maximum 6 puces par slide, chaque puce tenant en une ligne : une slide surchargée est pénalisée sur les critères 2.4 (impact visuel) et 2.6 (capacités de synthèse).',
      '- "visuel" : objet { "type": chaîne, "legende": chaîne, "donnees": tableau } ou null. Utilise-le quand la slide gagne à être illustrée : "type" vaut "donnees" (donnees = tableau d\'objets { "libelle": chaîne, "valeur": nombre } → histogramme), "repartition" (donnees = même structure → anneau/parts), "comparaison" (donnees = tableau d\'objets { "critere": chaîne, "valeur_a": nombre, "valeur_b": nombre } → barres groupées, avec les libellés des deux séries dans "legende" séparés par " | ") ou "chronologie" (donnees = tableau d\'objets { "etape": chaîne, "description": chaîne } → frise d\'étapes). "legende" titre le visuel. Les valeurs doivent être des chiffres réels, cohérents avec les puces et sourcés ; n\'invente jamais un graphique décoratif.',
      '- "notes_orateur" : texte destiné au panneau « Notes » du présentateur. Rôle : permettre à l\'étudiant de reprendre la parole sans relire, PAS de rédiger un cours.',
      'RÈGLES DES NOTES ORATEUR (à respecter STRICTEMENT pour CHAQUE slide de contenu) :',
      '  1. UNE LIGNE PAR PUCE DE LA SLIDE : les notes reprennent les puces de la slide UNE À UNE, une ligne courte par puce, dans le même ordre. S\'il y a 4 puces sur la slide, il y a 4 lignes de notes (plus une éventuelle ligne d\'ouverture/transition) — jamais de paragraphe rédigé qui mélange plusieurs puces.',
      '  2. LONGUEUR PLAFOND ABSOLUE : 5 lignes maximum, 60 mots maximum par slide. Chaque ligne tient en une phrase courte (10-15 mots). Une note plus longue est considérée comme fausse et doit être raccourcie.',
      '  3. AUCUN PARAGRAPHE : le champ "notes_orateur" est un texte à LIGNES COURTES séparées par des retours à la ligne, pas un bloc de prose. Interdit absolu de produire plusieurs paragraphes.',
      '  4. UNIQUEMENT LE CONTENU DE LA SLIDE : chaque ligne promet et développe ce qui est DÉJÀ affiché sur la slide (la puce, le chiffre, l\'exemple, la source). Aucune idée, aucun chiffre, aucun exemple, aucune théorie qui ne figure pas sur la slide.',
      '  5. STYLE ORAL DIRECT : phrase courte, comme on la dirait à l\'oral, à la première personne quand c\'est naturel (« je préconise… », « ce chiffre montre que… »). L\'étudiant doit pouvoir lire la note une fois et parler sans la relire.',
      '  6. FORMES DES LIGNES : une puce = une ligne qui l\'explicite (ne recopie pas la puce mot pour mot, dis-la autrement) ; un chiffre = une ligne qui le commente ; une transition = une ligne qui annonce la slide suivante. Pas de phrase d\'introduction, pas de conclusion de la note.',
      '  7. INTERDITS : paragraphe fleuve, développement théorique, définition académique, énumération de données absentes de la slide, recopie mot pour mot des puces, plus de 5 lignes, plus de 60 mots.',
      '  Pour la page de titre : aucune note. Pour la slide « problématique » : la question mise en avant, puis en une ligne le problème concret qu\'elle soulève — 2 lignes courtes maximum.',
      'SLIDE « problematique » — RENDU IMPOSÉ (une seule slide dans tout le support) : elle met en avant UNIQUEMENT la question centrale. Forme visuelle "question" : la question seule, en grand, centrée, encadrée sobrement. AUCUN visuel opposant deux camps : pas de deux colonnes, pas de « Pour / Contre », pas de « Oui / Non », pas de « Avantages / Risques », pas de pôle A face à un pôle B. Une problématique mal formulée comme un débat d\'opinion est un défaut de fond : elle doit soulever un PROBLÈME CONCRET à instruire, pas un sujet clivant. L\'état des lieux, les observations préliminaires et le contexte sont déjà portés par les slides précédentes ("contexte", "enjeux") : cette slide ne les répète pas et n\'ajoute aucune puce de comparaison. Elle appelle une réponse structurée en trois temps, développée dans les slides suivantes : voici l\'existant, voici ses limites, voici ce que je préconise.',
      'Ordre narratif IMPOSÉ des slides — référence absolue : la spécification de structure du support Grand Oral CESI. VOLUME : le fichier final compte EXACTEMENT 20 slides, page de titre comprise, soit 19 slides de contenu produites par toi (la page de titre est ajoutée automatiquement). La progression est un entonnoir, non négociable : Contexte → Enjeux → Problématique posée → Existant (fondements & théorie) → Données statistiques sourcées et récentes → Cas réels d\'entreprise sourcés (benchmarks) → Solutions et préconisations (posture consultant) → Conclusion. Concrètement : 2e slide du dossier, une slide « Plan de présentation » (type "contexte") qui annonce les parties du support en 4 à 5 puces très courtes, sans problématique (c\'est le sommaire de l\'oral, il est systématique) ; puis une slide "contexte" et une slide « Mots clés du sujet » (type "contexte") qui rappelle le SUJET COMPLET dans ses puces, puis identifie chaque mot clé du sujet avec sa définition courte — c\'est le vocabulaire que tu réutilises ensuite sans le redéfinir ; puis les enjeux ; puis l\'unique slide "problematique" POSÉE APRÈS le contexte et les enjeux (ne la formule jamais avant sa slide dédiée, elle découle du contexte et des enjeux) ; puis, dans cet ordre, les slides "existant" (concepts académiques et état de l\'art), les slides "donnees" (chiffres du marché, chacun avec sa source en bas de slide et la plus récente possible), les slides "exemple_entreprise" (cas réels succès ET échecs, chacun sourcé en bas de slide avec une référence actualisée), et enfin les slides "solutions" (réponse stratégique actionnable, contextualisée par la taille d\'entreprise, structurée avant / pendant / après). Toutes les slides "exemple_entreprise" sont regroupées : les cas d\'entreprises tiennent sur UNE SEULE slide, DEUX au maximum en tout — une slide « Cas d\'entreprises » (type "exemple_entreprise") peut comparer 2 ou 3 entreprises, dont au moins un échec ou une limite, chacune avec sa source. Jamais un cas par slide au-delà de deux slides.',
      'Exigences de fond imposées par la grille du jury (chaque exigence doit être visible sur au moins une slide) : une slide "contexte" qui présente le sujet, ses mots-clés, un ou deux chiffres clés et le positionnement stratégique (critère 1.1) ; les enjeux structurés par la grille TOHEE — Technique, Organisationnel, Humain, Économique, Environnemental — restreinte au cœur du sujet (critère 1.2) ; au moins une slide "existant" qui mobilise NOMMÉMENT les références théoriques fournies dans l\'analyse et la recherche documentaire (critère 1.3) ; au moins une slide "exemple_entreprise" présentant une entreprise réelle avec sa source, et au moins une slide rapportant un échec ou une limite, pas uniquement des réussites (critère 1.4, benchmark nuancé) ; les slides "solutions" structurées selon le champ applicatif avant / pendant / après (critère 1.6, pragmatisme) ; une slide "conclusion" qui répond explicitement à la problématique, rappelle le fil directeur et se termine par la question d\'ouverture du plan, posée sans y répondre (critères 2.1 et 2.7) ; sur au moins une slide, une prise de position affirmée formulée comme telle, avec la condition de sa réussite (critères 1.5 et 2.3).',
      'RÉPONSE À LA PROBLÉMATIQUE (cohérence obligatoire) : le support doit RÉPONDRE à la problématique retenue, pas seulement l\'exposer. Les slides "solutions" apportent des préconisations concrètes et actionnables, et la conclusion referme explicitement la question posée. Chaque slide du développement doit contribuer à cette réponse : aucune slide ne doit traiter un aspect étranger aux mots-clés du sujet (hors-sujet) ni se contenter de décrire le problème sans avancer vers sa résolution.',
      'Exigence visuelle (critère 2.4 « impact visuel ») : au moins 6 slides doivent porter un objet "visuel" non nul, réparties sur la présentation, dont au moins une dans la partie contexte. Les autres slides utilisent une "forme_visuelle" autre que "puces". Aucune slide ne doit se réduire à un bloc de texte. Chaque slide "exemple_entreprise" est rendue automatiquement sous forme d\'encadré avec le logo réel de la marque (téléchargé à partir du "domaine" fourni) et ses "chiffres_cles" en pastilles : renseigner "nom_entreprise", "domaine" et "chiffres_cles" est donc indispensable pour que le cas réel soit identifiable d\'un coup d\'œil, comme l\'attend le jury sur les benchmarks.',
      'Provenance : quand une slide présente un chiffre, une donnée ou un exemple rapporté du web, ajouter en dessous une ligne courte « Source : … » citant une source validée fournie dans le glossaire (jamais une source inventée). Cette règle est notée par le jury : toute donnée chiffrée non sourcée affaiblit les critères 1.1, 1.2 et 1.6.',
      'LIGNE DIRECTRICE CONTINUE (exigence prioritaire) — l\'évaluation du grand oral porte d\'abord sur la qualité de l\'exercice ORAL : les slides sont des appuis, pas un document à lire. Deux conséquences non négociables. (1) Chaque slide de contenu se termine par une phrase de transition discrète (champ "transition") qui rebondit sur le contenu de la slide courante et annonce la suivante, pour que l\'enchaînement s\'entende et qu\'aucune slide ne donne l\'impression d\'être indépendante des autres. (2) Aucune slide n\'est un bloc de texte : 3 à 5 puces courtes suffisent, une ligne par puce, jamais un paragraphe sur la slide — le développement argumenté reste dans les notes orateur. L\'étudiant doit pouvoir parler en s\'appuyant sur la slide, jamais la lire.',
      'ÉQUILIBRE TECHNIQUE ET VULGARISATION : utilise un vocabulaire RICHE, précis et professionnel, mais qui reste simple à comprendre et facile à prendre en main par l\'étudiant à l\'oral. Évite la pauvreté lexicale tout en fuyant le jargon inutile. N\'accumule pas les termes techniques sur chaque slide : utilise-les avec parcimonie pour ne pas noyer le jury sous une liste interminable en fin de présentation. Priorise la clarté et la concision pour éviter les questions pièges.',
      'SUPPRESSION DU JARGON TECHNIQUE (posture de fond, non négociable) : ne mets en avant AUCUNE référence directe aux normes et référentiels complexes (ISO 27031, ISO 22301, NIST, EBIOS, ITIL, etc.) ni aucun acronyme technique posé sans explication. Remplace-les systématiquement par le vocabulaire managérial et organisationnel équivalent : gouvernance, pilotage, tests réguliers, communication de crise, sensibilisation des équipes, sauvegarde isolée, plan de communication, exercices de crise, désignation d\'un responsable. Un référentiel ne peut apparaître que s\'il est immédiatement traduit en une conséquence concrète pour l\'organisation, et jamais comme une vitrine de connaissances. Dans le doute : supprime-le.',
      'VULGARISATION ET ARGUMENTATION (posture de fond) : chaque point du support doit montrer que l\'étudiant a compris les ENJEUX (pourquoi c\'est critique pour l\'entreprise) et non le FONCTIONNEMENT technique (comment ça marche). Le fil conducteur est la vulgarisation : on expose un problème réel d\'entreprise, puis on apporte des solutions pragmatiques. Une slide se lit et s\'explique sans hésitation : si un terme demande une explication technique, il n\'a pas sa place tel quel.',
      'PROBLÉMATIQUE — ANCRAGE (posture de fond) : la problématique n\'est JAMAIS une reformulation du sujet. Elle interroge le sujet et pointe un problème réel à résoudre par l\'entreprise. Formulation attendue : une question qui met en tension un levier humain / organisationnel et un levier technique, et qui appelle une prise de position. Exemple de ton attendu : « Dans quelle mesure l\'anticipation humaine et organisationnelle est-elle plus déterminante que la simple technique pour garantir la reprise d\'activité d\'une entreprise post-cyberattaque ? » Elle reste une question, jamais un débat d\'opinion.',
      'CAS D\'ENTREPRISES ET SOLUTIONS — ANCRAGE (posture de fond) : les slides "exemple_entreprise" (l\'existant) doivent illustrer concrètement le problème soulevé par la problématique — elles montrent le problème à l\'œuvre, pas une fiche descriptive d\'entreprise. Les slides "solutions" doivent répondre DIRECTEMENT à la problématique, en se concentrant sur des actions humaines, organisationnelles et de gouvernance (l\'avant, le pendant, l\'après).',
      'CONTRAINTES DE FORME INÉBRANLABLES : EXACTEMENT 20 slides au total, page de titre comprise (19 slides de contenu). AUCUNE image générée par l\'IA, aucun visuel photoréaliste, aucun clipart : uniquement des formes simples (rectangles arrondis, cartes, encadrés, badges), des frises, des schémas sobres et des icônes sobres. AUCUNE phrase longue sur les slides : uniquement des listes à puces très courtes, en fragments nominaux (3 à 5 puces, 6 maximum, une ligne chacune, jamais de verbe conjugué ni de point final). Les phrases complètes vont UNIQUEMENT dans les notes du présentateur. Chaque slide de contenu (sauf la page de titre et la conclusion) se termine par la petite phrase de transition en italique prévue par le champ "transition".',
      'Un paragraphe d\'une puce ne doit jamais dépasser une ligne ; si une idée demande plus, elle va dans les notes orateur (critères 2.4 et 2.6).',
      'RÈGLE ABSOLUE : aucun acronyme ou terme technique absent du glossaire fourni ne doit apparaître dans les puces, les visuels ou les notes orateur.',
    ].join('\n'),
  },
];

/** Les 5 thèmes du Grand Oral CESI (modifiables ensuite dans le panneau admin). */
const THEMES = [
  { label: 'Gestion de la sécurité', order: 1 },
  { label: 'Architecture du SI', order: 2 },
  { label: 'Management du SI', order: 3 },
  { label: 'Virtualisation, cloud & IoT', order: 4 },
  { label: 'Big data & IA', order: 5 },
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
  // Supprime les thèmes qui ne font plus partie de la liste canonique.
  const labels = THEMES.map((theme) => theme.label);
  const retires = await Theme.deleteMany({ label: { $nin: labels } });
  if (retires.deletedCount) {
    console.log(`Theme : ${retires.deletedCount} thème(s) obsolète(s) supprimé(s).`);
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
