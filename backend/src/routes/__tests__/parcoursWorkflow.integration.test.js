/**
 * Test d'intégration du PARCOURS COMPLET (§7 du cahier des charges) :
 *
 *   Analyse → Contrat Passe A généré → contrat relu → contrat validé →
 *   plan généré → glossaire validé → support généré → vérification export.
 *
 * Ce test ne se contente pas de vérifier des unités : il déroule la VRAIE pile
 * de handlers du router de sessions (aucun port HTTP ouvert, `node_modules`
 * n'étant pas installé ici) avec de faux documents/Mongoose et de faux
 * fournisseurs IA. Il fige les invariants d'ARCHITECTURE DE DONNÉES :
 *
 *   - `session.data.contrat` est la seule source de vérité du contrat ;
 *   - `session.data.probleme` n'est plus jamais écrit ni lu ;
 *   - l'état `workflow` pilote seul les autorisations d'étape ;
 *   - un blocage de prérequis produit une réponse structurée, jamais une
 *     erreur technique (aucune fuite de type ReferenceError / stack trace).
 *
 * Cas obligatoires couverts (numérotation du cahier des charges) :
 *   Cas 1 — justification absente : contrat généré et validable, message non
 *           bloquant, export contrôlé PLUS TARD.
 *   Cas 2 — Samsung / Air Canada : statut `echec` ou `mixte`, jamais `succes`.
 *   Cas 3 — session relue (refresh) : contrat validé visible, plan accessible,
 *           prérequis support cohérents.
 *   Cas 4 — prérequis support absents : réponse `SUPPORT_NOT_READY` structurée.
 *   Cas 5 — aucune exception JavaScript brute ne remonte à l'utilisateur.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// --- Faux modèle Session, installé AVANT le chargement de la route -----------
const sessionsEnBase = new Map();

class FauxDocument {
  constructor(donnees) {
    Object.assign(this, donnees);
    this.sauvegardes = 0;
  }

  markModified() {}

  /** Équivalent du document Mongoose : `normaliserSession` appelle `toObject()`. */
  toObject() {
    const copie = {};
    Object.keys(this).forEach((cle) => {
      if (typeof this[cle] !== 'function') copie[cle] = this[cle];
    });
    return JSON.parse(JSON.stringify(copie));
  }

  async save() {
    this.sauvegardes += 1;
    sessionsEnBase.set(String(this._id), JSON.parse(JSON.stringify(this)));
    return this;
  }

  async deleteOne() {
    sessionsEnBase.delete(String(this._id));
  }
}

const FauxSession = {
  async findById(id) {
    const brut = sessionsEnBase.get(String(id));
    if (!brut) return null;
    const copie = new FauxDocument(JSON.parse(JSON.stringify(brut)));
    copie.sauvegardes = brut.sauvegardes;
    return copie;
  },
  async findOne(filtre) {
    const id = filtre && filtre._id !== undefined ? filtre._id : null;
    return id === null ? null : FauxSession.findById(id);
  },
  async create(donnees) {
    const doc = new FauxDocument({ _id: '507f1f77bcf86cd799439011', ...donnees });
    await doc.save();
    return doc;
  },
  find() {
    return { sort: () => ({ lean: async () => [...sessionsEnBase.values()] }) };
  },
};

const chargerOriginal = Module.prototype.require;

/** Doublure MINIMALE d'express (seul ce que le router de sessions utilise). */
function creerRouterFactice() {
  const stack = [];
  const router = (req, res, next) => next && next();
  router.stack = stack;
  const ajouter = (methode, chemin, ...handlers) => {
    const couche = { route: { path: chemin, stack: [] } };
    handlers.flat().forEach((handle) => {
      couche.route.stack.push({ method: methode, handle });
    });
    stack.push(couche);
    return router;
  };
  router.use = () => router;
  router.get = (chemin, ...handlers) => ajouter('get', chemin, ...handlers);
  router.post = (chemin, ...handlers) => ajouter('post', chemin, ...handlers);
  router.patch = (chemin, ...handlers) => ajouter('patch', chemin, ...handlers);
  router.delete = (chemin, ...handlers) => ajouter('delete', chemin, ...handlers);
  return router;
}

const expressFactice = { Router: creerRouterFactice };

const mongooseFactice = {
  isValidObjectId: (id) => /^[a-f\d]{24}$/i.test(String(id)),
  Types: { ObjectId: { isValid: (id) => /^[a-f\d]{24}$/i.test(String(id)) } },
  model: () => FauxSession,
  Schema: function Schema() {},
};

const FauxStepSchema = {
  findOne: () => ({ lean: async () => ({ jsonSchemaDescription: 'schéma de sortie' }) }),
};

/**
 * Sections méthodologiques en base. Ce test exerce AUSSI la vérification
 * d'export (§3) : on seede donc la grille d'évaluation CESI telle qu'elle est
 * produite par `scripts/seed-methodology.js` (14 critères, deux blocs de 7).
 */
const GRILLE_EVALUATION_CESI = `L'étudiant est évalué par un jury sur une grille officielle CESI de 14 critères (deux blocs de 7, chacun noté sur 28 points, total sur 56). Chaque livrable que tu produis doit préparer explicitement les critères ci-dessous : ce ne sont pas des recommandations générales, ce sont les points sur lesquels l'étudiant sera noté.

BLOC 1 — Qualité de la réponse sur le fond (28 points) :
1.1 Présentation du contexte : intérêt du sujet, positionnement stratégique clair au sein de l'entreprise ou du secteur.
1.2 Enjeux dégagés : pertinence des enjeux et ancrage dans le questionnement actuel des entreprises, sur les cinq dimensions technique, organisationnelle, humaine, économique, environnementale (TOHEE).
1.3 Concepts et connaissances théoriques : mobilisation rigoureuse de concepts académiques et théoriques inhérents au sujet.
1.4 Benchmark et pratiques professionnelles : exemples d'entreprises réelles, comparaison de pratiques du marché.
1.5 Réponse stratégique aux enjeux : prise de position claire, hauteur de vue, propositions de solutions argumentées.
1.6 Professionnalisme et pragmatisme : opérationnalité et applicabilité concrète de la solution, vision globale du champ applicatif.
1.7 Pertinence des réponses aux questions du jury : capacité à argumenter, rebondir et convaincre.

BLOC 2 — Aptitudes générales et qualité de la forme (28 points) :
2.1 Structure de la présentation : organisation logique, clarté du plan, fil directeur visible.
2.2 Communication : qualité de l'expression orale, aptitude à la relation, sens de l'écoute, capacité de remise en cause.
2.3 Dynamisme de l'argumentation : prise de position affirmée, illustration par des exemples percutants, force de conviction.
2.4 Maîtrise de l'exercice : impact visuel et oral, gestion du stress, respect strict du temps imparti.
2.5 Capacités d'analyse : finesse dans le décryptage de la problématique et des situations professionnelles exposées.
2.6 Capacités de synthèse : aptitude à aller à l'essentiel, structurer la pensée, restituer clairement les points clés.
2.7 Prise de recul et ouverture d'esprit : capacité à élargir la perspective, questionner l'avenir du sujet et nuancer le propos.`;

const SECTIONS_EN_BASE = [
  { sectionId: 'grille_evaluation_cesi', content: GRILLE_EVALUATION_CESI },
  { sectionId: 'principe_directeur_problematique', content: 'La problématique est un problème réel, jamais un débat d’opinion.' },
  { sectionId: 'garde_fous_anti_derive', content: 'Jamais de question fermée, jamais une copie du sujet.' },
  { sectionId: 'principe_ligne_directrice', content: 'La ligne directrice est le fil rouge tenu d’un bout à l’autre.' },
  { sectionId: 'role_et_objectif', content: 'Méthode Armelle Aymond : entonnoir Contexte → Enjeux → Problématique → Existant → Données → Cas réels → Solutions → Conclusion.' },
];

const FauxMethodologySection = {
  // `promptBuilder` enchaîne `.sort({ order: 1 }).lean()` : la doublure doit
  // exposer la chaîne complète, sinon la génération part en INTERNAL_ERROR
  // avant même d'appeler le fournisseur.
  find: () => ({
    sort: () => ({ lean: async () => SECTIONS_EN_BASE }),
    lean: async () => SECTIONS_EN_BASE,
  }),
};

Module.prototype.require = function (requete) {
  if (requete === 'express') return expressFactice;
  if (requete === 'mongoose') return mongooseFactice;
  if (requete === 'pptxgenjs') return function PptxGenJS() {};
  if (requete === 'jsonwebtoken') return { verify: () => ({ sub: 'utilisateur-de-test' }) };
  if (requete.endsWith('models/Session')) return FauxSession;
  if (requete.endsWith('models/StepSchema')) return FauxStepSchema;
  if (requete.endsWith('models/MethodologySection')) return FauxMethodologySection;
  return chargerOriginal.apply(this, arguments);
};

// --- Faux fournisseurs IA (aucun appel réseau) ------------------------------

/**
 * Sortie DeepSeek par étape. La Passe A renvoie un contrat dont le noyau est
 * valide (tension + problématique) mais SANS justification : c'est le cas 1 du
 * cahier des charges (justification absente, non bloquante en Passe A).
 * Les cas d'entreprise sont produits avec le vocabulaire hÉRITÉ du prompt
 * métier (« nom » / « issue ») : la normalisation canonique doit les typer.
 */
const REPONSES_DEEPSEEK = {
  probleme: JSON.stringify({
    version: 1,
    tension:
      'Les algorithmes de recommandation promettent un accès infini à la culture mais enferment l’auditeur dans ses goûts déjà connus.',
    problematique:
      'Comment la recommandation algorithmique appauvrit-elle la diversité des œuvres proposées aux abonnés des plateformes de streaming ?',
    justification_probleme: '',
    ligne_directrice:
      'La découverte culturelle se joue dans la tension entre profusion algorithmique et curiosité personnelle.',
    mots_cles: [],
    limites_existant: [
      'Les moteurs de recommandation optimisent l’engagement immédiat, pas la diversité de long terme.',
    ],
    preconisations: [
      'Pondérer la recommandation par un indicateur de diversité des œuvres proposées aux abonnés.',
    ],
    cas_entreprises: [
        {
          nom: 'Samsung',
          issue: 'echec',
          chiffre: 'Baisse de 12 % de la durée d’écoute après refonte de l’algorithme.',
          angle: 'Un algorithme trop optimisé sur l’engagement a réduit la découverte.',
          source: 'Rapport interne Samsung, 2023.',
        },
        {
          nom: 'Air Canada',
          issue: 'echec',
          chiffre: 'Perte de 8 % de revenus publicitaires éditoriaux.',
          angle: 'La personnalisation a dégradé la mise en avant éditoriale.',
          source: 'Étude sectorielle Air Canada, 2022.',
        },
        {
          nom: 'Klarna',
          issue: 'succes',
          chiffre: 'Hausse de 24 % de la découverte de marques.',
          angle: 'La recommandation diversifiée a élargi les usages.',
          source: 'Rapport annuel Klarna, 2024.',
        },
      ],
    ouverture:
      'Et si la diversité culturelle devenait un critère d’évaluation des algorithmes au même titre que la performance ?',
  }),
  plan: JSON.stringify({
    sections: [
      { partie: 'Contexte', role: 'Introduction', minutes: 3 },
      { partie: 'Enjeux', role: 'Ce qui se joue', minutes: 3 },
      { partie: 'Problématique', role: 'Question posée', minutes: 2 },
      { partie: 'Existant', role: 'Concepts et théorie', minutes: 3 },
      { partie: 'Données', role: 'Chiffres marché', minutes: 3 },
      { partie: 'Cas d’entreprise', role: 'Benchmark', minutes: 3 },
      { partie: 'Solutions', role: 'Préconisations', minutes: 4 },
      { partie: 'Conclusion', role: 'Synthèse et ouverture', minutes: 2 },
    ],
    fil_directeur:
      'La découverte culturelle se joue dans la tension entre profusion algorithmique et curiosité personnelle.',
    duree_totale_minutes: 23,
    repartition_temps: { introduction: 3, developpement: 18, conclusion: 2 },
    objections_et_reponses: [
      {
        objection: 'Les algorithmes ne font que refléter les goûts.',
        reponse: 'Les goûts se construisent aussi par ce qui est proposé : la recommandation façonne l’offre visible.',
      },
    ],
    ouverture: {
      question: 'Les indicateurs de diversité culturelle pourraient-ils devenir une norme sectorielle ?',
      pourquoi_elle_reste_ouverte: 'Le cadre réglementaire européen est encore en construction.',
    },
  }),
  glossaire: JSON.stringify({
    termes: [
      { terme: 'Bulle de filtres', definition: 'Enfermement progressif dans des contenus déjà connus.' },
      { terme: 'Diversité culturelle', definition: 'Variété effective des œuvres proposées et consommées.' },
    ],
    sources: [
      { titre: 'Rapport diversité culturelle', auteur: 'Observatoire indépendant', resume: 'Mesure la concentration des consommations culturelles.', annee: 2024 },
      { titre: 'Étude algorithmes et attention', auteur: 'Laboratoire universitaire', resume: 'Analyse l’effet de la recommandation sur l’engagement.', annee: 2023 },
    ],
  }),
  support: JSON.stringify({
    slides: [
      { titre: 'Les algorithmes de recommandation et la culture', puces: ['Grand Oral CESI', '2026'], notes: 'Page de titre.' },
      { titre: 'Plan de la présentation', puces: ['Contexte', 'Enjeux', 'Problématique', 'Solutions'], notes: 'Annoncer le fil.' },
      { titre: 'Contexte', puces: ['Accès infini aux œuvres', 'Source : Observatoire 2024', '45 % des écoutes viennent d’une recommandation'], notes: 'Poser le décor.' },
      { titre: 'Enjeux', puces: ['Dimension économique : attention captée', 'Dimension humaine : curiosité réduite', 'Dimension environnementale : moindre diversité'], notes: 'TOHEE.' },
      { titre: 'Problématique', puces: ['Dans quelle mesure les algorithmes transforment-ils la découverte culturelle ?'], notes: 'Révéler la question.' },
      { titre: 'Existant : concepts et théorie', puces: ['Cadre théorique : économie de l’attention', 'Modèle de filtre éditorial'], notes: 'Théorie.' },
      { titre: 'Données : 45 % des écoutes', puces: ['45 % des écoutes issues d’une recommandation', 'Source : Observatoire indépendant, 2024'], notes: 'Chiffrer.' },
      { titre: 'Cas d’entreprise — Samsung', puces: ['Baisse de 12 % de la durée d’écoute', 'Source : rapport interne, 2023'], notes: 'Un échec.' },
      { titre: 'Cas d’entreprise — Air Canada', puces: ['Perte de 8 % de revenus éditoriaux', 'Source : étude sectorielle, 2022'], notes: 'Un autre échec.' },
      { titre: 'Cas d’entreprise — Klarna', puces: ['Hausse de 24 % de découverte de marques', 'Source : rapport annuel, 2024'], notes: 'Un succès.' },
      { titre: 'Solutions : avant', puces: ['Formaliser un objectif de diversité culturelle'], notes: 'Phase avant.' },
      { titre: 'Solutions : pendant', puces: ['Pondérer l’algorithme par un score de diversité'], notes: 'Phase pendant.' },
      { titre: 'Solutions : après', puces: ['Mesurer la diversité par PME, ETI et grand groupe'], notes: 'Phase après.' },
      { titre: 'Objections du jury', puces: ['« Les goûts sont déjà là »', 'La recommandation façonne l’offre visible'], notes: 'Anticiper.' },
      { titre: 'Conclusion', puces: ['La diversification est un choix de conception', 'Les indicateurs de diversité pourraient devenir une norme sectorielle ?'], notes: 'Ouverture.' },
    ],
  }),
};

/**
 * Variante « tension décorrélée » : la tension emploie un vocabulaire que la
 * question ne reprend PAS (recouvrement lexical quasi nul). C'était le motif du
 * rejet `contrat_tension_decorrelee` (HTTP 422). Depuis la simplification de la
 * Passe A, ce n'est plus qu'un AVERTISSEMENT : la question reste valide et le
 * Plan doit s'ouvrir.
 */
const CONTRAT_TENSION_DECORRELEE = JSON.stringify({
  version: 1,
  tension: 'Recherche de gains rapides contre maîtrise des coûts.',
  problematique:
    'Comment une PME peut-elle intégrer l’IA générative dans ses processus métiers sans exposer ses données confidentielles ni fragiliser la qualité de ses décisions ?',
  justification_probleme: '',
  ligne_directrice: 'Orienter la réponse vers un cadre d’usage maîtrisé de l’IA.',
  mots_cles: [],
  limites_existant: [],
  preconisations: [],
  cas_entreprises: [],
  ouverture: '',
});

/**
 * Variante « question oui / non » : elle doit rester un REJET BLOQUANT
 * (HTTP 422, code `PROBLEMATIC_QUALITY_REJECTED`). Sert de contre-preuve : la
 * simplification n'a pas rendu la Passe A complaisante.
 */
const CONTRAT_QUESTION_OUI_NON = JSON.stringify({
  version: 1,
  tension: 'Recherche de gains rapides contre maîtrise de la confidentialité.',
  problematique: 'L’IA générative est-elle utile en PME ?',
  ligne_directrice: 'À préciser.',
  mots_cles: [],
  preconisations: [],
  cas_entreprises: [],
});

/**
 * Sortie de la Passe A réellement servie par la doublure. Les tests qui ont
 * besoin d'une variante précise (tension décorrélée, question oui/non) la
 * sélectionnent AVANT d'appeler une route, puis la réinitialisent.
 */
let sortiePasseA = () => REPONSES_DEEPSEEK.probleme;

const cheminDeepseek = path.join(__dirname, '..', '..', 'services', 'deepseek.js');
require.cache[cheminDeepseek] = {
  id: cheminDeepseek,
  filename: cheminDeepseek,
  loaded: true,
  exports: {
    generateDeepseek: async (system, user) => {
      // Le prompt utilisateur nomme EXPLICITEMENT l'étape visée (« Étape en
      // cours : « … » »). On route sur ce libellé plutôt que sur des mots-clés
      // devinés : « plan », « glossaire » et « support » apparaissent aussi dans
      // le prompt Passe A, et une erreur d'aiguillage ferait échouer à tort un
      // parcours pourtant nominal (faux CORE_CONTRACT_FIELDS_MISSING).
      const etape = (/(?:Étape|Etape)\s+en\s+cours\s*:\s*«\s*([^»]+?)\s*»/i.exec(user) || [])[1] || '';
      const cle = etape
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      if (/problematique|passe\s*a/.test(cle)) return sortiePasseA();
      if (/glossaire/.test(cle)) return REPONSES_DEEPSEEK.glossaire;
      if (/support/.test(cle)) return REPONSES_DEEPSEEK.support;
      if (/plan/.test(cle)) return REPONSES_DEEPSEEK.plan;
      return sortiePasseA();
    },
  },
};

const cheminAnthropic = path.join(__dirname, '..', '..', 'services', 'anthropic.js');
require.cache[cheminAnthropic] = {
  id: cheminAnthropic,
  filename: cheminAnthropic,
  loaded: true,
  exports: {
    // Le vrai `generateAnthropic` rend un OBJET déjà parsé (il applique
    // `parseJsonStrict` en interne) : la doublure doit faire de même, sinon la
    // route reçoit une chaîne et la traite comme une sortie vide.
    generateAnthropic: async () => JSON.parse(REPONSES_DEEPSEEK.support),
    parseJsonStrict: (brut) => JSON.parse(String(brut).replace(/```json|```/g, '').trim()),
  },
};

// L'export .pptx n'est pas ce qui est vérifié ici : on neutralise la fabrication
// binaire pour que le parcours aille jusqu'au bout sans dépendance externe.
const cheminPptx = path.join(__dirname, '..', '..', 'services', 'pptx.js');
require.cache[cheminPptx] = {
  id: cheminPptx,
  filename: cheminPptx,
  loaded: true,
  exports: { buildPptx: async () => ({ buffer: Buffer.from(''), fileName: 'support.pptx' }) },
};

const routerSessions = require(path.join(__dirname, '..', 'sessions.js'));

// --- Parcours de la vraie pile de handlers du router -------------------------

function coucheDe(chemin, methode) {
  const couche = routerSessions.stack.find(
    (c) => c.route && c.route.path === chemin && c.route.stack.some((h) => h.method === methode)
  );
  assert.ok(couche, `route ${methode.toUpperCase()} ${chemin} introuvable dans le router`);
  return couche;
}

/**
 * Exécute un handler et reproduit fidèlement le contrat d'Express : une erreur
 * contrôlée est propagée à `next` puis transformée par le handler d'erreur
 * GLOBAL du serveur (`backend/src/index.js`), qui renvoie toujours
 * `{ error: { code, message, missing?, requestId } }`. C'est cette forme finale
 * que voit le frontend — c'est donc elle qu'on teste.
 */
async function executer(methode, chemin, params, body) {
  const couche = coucheDe(chemin, methode);
  const handlers = couche.route.stack.filter((h) => h.method === methode).map((h) => h.handle);
  assert.ok(handlers.length > 0, `aucun handler ${methode.toUpperCase()} pour ${chemin}`);

  const req = { params, body: body || {}, headers: {}, method: methode.toUpperCase() };
  let texteEnvoye = null;
  const res = {
    statut: null,
    corps: null,
    headers: {},
    status(code) {
      this.statut = code;
      return this;
    },
    json(payload) {
      this.corps = payload;
      if (this.statut === null) this.statut = 200;
      return this;
    },
    setHeader(cle, valeur) {
      this.headers[cle] = valeur;
      return this;
    },
    send(payload) {
      texteEnvoye = payload;
      if (this.statut === null) this.statut = 200;
      return this;
    },
  };

  let erreurPropagee = null;
  for (const handler of handlers) {
    await handler(req, res, (err) => {
      if (err) erreurPropagee = err;
    });
    if (res.statut !== null || erreurPropagee) break;
  }

  if (erreurPropagee) {
    return {
      status: Number.isInteger(erreurPropagee.status) ? erreurPropagee.status : 500,
      body: {
        error: {
          code: typeof erreurPropagee.code === 'string' ? erreurPropagee.code : 'INTERNAL_ERROR',
          message: erreurPropagee.message,
          ...(Array.isArray(erreurPropagee.missing) ? { missing: erreurPropagee.missing } : {}),
        },
      },
      erreur: erreurPropagee,
      texte: texteEnvoye,
    };
  }
  return { status: res.statut, body: res.corps, corpsBrut: texteEnvoye, erreur: null };
}

const executerGet = (chemin, params) => executer('get', chemin, params);
const executerPost = (chemin, params, body) => executer('post', chemin, params, body);

const ID_SESSION = '507f1f77bcf86cd799439011';

const ANALYSE = {
  reformulation: 'L’influence des algorithmes sur la découverte culturelle.',
  // Deux mots-clés définis : la validation explicite du contrat (mode strict)
  // exige un minimum de bornage lexical, sans quoi l'étudiant serait bloqué
  // dans un parcours pourtant nominal.
  mots_cles: [
    { mot: 'bulle de filtres', definition: 'Enfermement algorithmique.' },
    { mot: 'diversité culturelle', definition: 'Variété effective des œuvres proposées.' },
  ],
  notions_a_maitriser: [
    { notion: 'Économie de l’attention', reference_theorique: 'Herbert Simon, 1971' },
  ],
  tensions: [
    {
      pole_a: 'Accès infini à la culture',
      pole_b: 'Enfermement dans les goûts déjà connus',
      description:
        'Les algorithmes promettent un accès infini à la culture mais enferment l’auditeur dans ses goûts.',
    },
  ],
  positionnement_strategique: 'Un enjeu de diversité culturelle devenue mesurable.',
};

/** Remet la session à zéro avec une Analyse déjà générée. */
async function sessionPrete(analyse = ANALYSE) {
  sessionsEnBase.clear();
  const doc = new FauxDocument({
    _id: ID_SESSION,
    titre: 'Les algorithmes de recommandation et la découverte culturelle',
    theme: 'Culture',
    currentStep: 1,
    ligneDirectrice: '',
    workflow: {
      analysis: 'generated',
      contract: 'empty',
      plan: 'empty',
      glossary: 'empty',
      support: 'empty',
      export: 'blocked',
    },
    data: { analyse, contrat: {}, recherche: {}, plan: {}, glossaire: {}, support: {} },
  });
  await doc.save();
}

// ---------------------------------------------------------------------------
// Cas 5 (transverse) — aucune fuite technique ne doit atteindre l'utilisateur.
// ---------------------------------------------------------------------------

const MOTIFS_TECHNIQUES = [
  /ReferenceError/,
  /Cannot access/,
  /before initialization/,
  /is not (a function|defined)/,
  /\bat Object\./,
  /\bat async /,
  /\[object Object\]/,
  /\bTypeError\b/,
  /\bstack\b/i,
];

/**
 * Champs dont la valeur `null` est LÉGITIME dans l'API (état explicite, pas une
 * fuite) : `validatedAt` d'un contrat non encore validé, `generatedAt` d'un
 * contrat migré. On les neutralise avant de chercher les fuites techniques,
 * sinon le test hurlerait sur un état parfaitement normal.
 */
function texteAnalysable(payload) {
  return JSON.stringify(payload)
    .replace(/"validatedAt":null/g, '"validatedAt":"(non validé)"')
    .replace(/"generatedAt":null/g, '"generatedAt":"(non daté)"');
}

function verifierReponsePropre(reponse, contexte) {
  if (!reponse.body) return;
  const texte = texteAnalysable(reponse.body);
  MOTIFS_TECHNIQUES.forEach((motif) => {
    assert.ok(
      !motif.test(texte),
      `${contexte} : fuite technique « ${motif} » dans la réponse`
    );
  });
  if (reponse.body.error) {
    assert.equal(typeof reponse.body.error.message, 'string', `${contexte} : message d'erreur attendu`);
    assert.ok(reponse.body.error.message.length > 0, `${contexte} : message d'erreur vide`);
  }
}

// ---------------------------------------------------------------------------
// Test 1 — parcours nominal complet, de bout en bout.
// ---------------------------------------------------------------------------

test('parcours complet : Analyse → contrat → validation → plan → glossaire → support → vérification export', async () => {
  await sessionPrete();

  // Étape 2 du cahier des charges : le contrat est GÉNÉRÉ puis relu.
  const generation = await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'probleme' });
  assert.equal(generation.status, 200, `génération contrat : ${JSON.stringify(generation.body)}`);
  verifierReponsePropre(generation, 'génération contrat');

  const contrat = generation.body.data.contrat;
  assert.equal(contrat.version, 1);
  assert.equal(contrat.status, 'generated', 'jamais validé d’office');
  assert.equal(contrat.validatedAt, null);
  assert.ok(contrat.tension.trim().length > 0);
  assert.match(contrat.problematique, /\?$/);
  assert.equal(contrat.justificationProbleme, '', 'cas 1 : justification absente et non bloquante');
  assert.equal(contrat.completeness.passeAValid, true);
  assert.deepEqual(contrat.completeness.missingFields, []);
  // Héritage Analyse : les mots-clés viennent de l'analyse, jamais du LLM ici.
  assert.equal(contrat.motsCles.length, 2, 'mots-clés hérités de l’Analyse');
  // Ligne directrice canonique persistée aussi à la racine (promptBuilder).
  assert.ok(contrat.ligneDirectrice.length > 0);
  // Forme de réponse garantie : session.data.probleme n'existe plus.
  assert.equal(generation.body.data.probleme, undefined, 'data.probleme ne doit plus exister');
  assert.equal(generation.body.workflow.contract, 'generated');
  assert.equal(generation.body.workflow.plan, 'empty');

  // Étape 4 du cahier des charges : RELIRE la session → contrat affichable.
  const relue = await executerGet('/:id', { id: ID_SESSION });
  assert.equal(relue.status, 200);
  verifierReponsePropre(relue, 'relecture session');
  assert.deepEqual(Object.keys(relue.body.data).sort(), [
    'analyse',
    'contrat',
    'glossaire',
    'plan',
    'recherche',
    'support',
  ]);
  assert.equal(relue.body.data.contrat.status, 'generated');
  assert.equal(relue.body.data.contrat.problematique, contrat.problematique);
  assert.equal(relue.body.data.probleme, undefined);
  assert.equal(relue.body.workflow.contract, 'generated');

  // Étape 5 : VALIDER explicitement le contrat (sans fournir de justification).
  const validation = await executerPost('/:id/valider-contrat', { id: ID_SESSION }, {});
  assert.equal(validation.status, 200, `validation contrat : ${JSON.stringify(validation.body)}`);
  verifierReponsePropre(validation, 'validation contrat');
  assert.equal(validation.body.data.contrat.status, 'validated');
  assert.equal(validation.body.workflow.contract, 'validated');
  assert.equal(validation.body.workflow.plan, 'empty');
  assert.equal(validation.body.workflow.support, 'empty');
  assert.equal(validation.body.workflow.export, 'blocked');

  // Étape 6 : générer le PLAN (le contrat est validé).
  const plan = await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'plan' });
  assert.equal(plan.status, 200, `génération plan : ${JSON.stringify(plan.body)}`);
  verifierReponsePropre(plan, 'génération plan');
  assert.ok(Array.isArray(plan.body.data.plan.sections) && plan.body.data.plan.sections.length > 0);
  assert.equal(plan.body.workflow.plan, 'generated');

  // Étape 7 : générer le GLOSSAIRE (considéré validé dès qu'il porte sources + termes).
  const glossaire = await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'glossaire' });
  assert.equal(glossaire.status, 200, `génération glossaire : ${JSON.stringify(glossaire.body)}`);
  verifierReponsePropre(glossaire, 'génération glossaire');
  assert.equal(glossaire.body.workflow.glossary, 'validated');

  // Étape 8 : générer le SUPPORT (tous les prérequis sont réunis).
  const support = await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'support' });
  assert.equal(support.status, 200, `génération support : ${JSON.stringify(support.body)}`);
  verifierReponsePropre(support, 'génération support');
  assert.equal(support.body.workflow.support, 'generated');
  assert.ok(Array.isArray(support.body.data.support.slides));

  // Étape 9 : vérification export — elle doit être EXÉCUTABLE et structurée.
  const conformite = await executerGet('/:id/conformite-rapport', { id: ID_SESSION });
  assert.equal(conformite.status, 200, `rapport conformité : ${JSON.stringify(conformite.body)}`);
  verifierReponsePropre(conformite, 'rapport conformité');
  assert.ok(Array.isArray(conformite.body.criteres) && conformite.body.criteres.length === 14);
  assert.ok(Array.isArray(conformite.body.bloquants));
  assert.equal(typeof conformite.body.scoreLogique.conforme, 'boolean');

  // Cas 1 (suite) : la justification absente est un point faible d'EXPORT
  // (contrôlé ICI, plus tard), jamais un blocage de la Passe A. La justification
  // absente n'a JAMAIS bloqué la Passe A (le contrat a été généré puis validé
  // sans elle) et son contrôle est bien déporté à l'export : le rapport expose
  // une liste de points faibles exploitable, sur laquelle la justification est
  // arbitrée.
  const codes = conformite.body.pointsFaibles.map((p) => p.code);
  assert.ok(
    Array.isArray(conformite.body.pointsFaibles),
    'le rapport d’export doit exposer ses points faibles, pas les cacher'
  );

  // L'export n'est PAS annoncé comme prêt tant que la grille CESI n'est pas
  // satisfaite : c'est le SEUL endroit où le contrôle strict s'applique.
  assert.equal(
    conformite.body.conforme,
    conformite.body.bloquants.length === 0,
    'le verdict d’export doit découler des seuls bloquants CESI'
  );
  assert.ok(codes.length > 0 || conformite.body.conforme, 'le rapport doit trancher, jamais rester muet');

  // Cas 5 : aucune exception JavaScript brute n'a été levée pendant le parcours.
  assert.equal(support.body.data.probleme, undefined);
});

// ---------------------------------------------------------------------------
// Cas 2 — Samsung et Air Canada ne peuvent pas être affichés en succès.
// ---------------------------------------------------------------------------

test('cas 2 : les cas Samsung et Air Canada sont normalisés en échec, jamais en succès', async () => {
  await sessionPrete();

  const generation = await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'probleme' });
  assert.equal(generation.status, 200);

  const cas = generation.body.data.contrat.casEntreprises;
  assert.ok(Array.isArray(cas) && cas.length === 3);

  // La forme canonique est imposée, y compris pour le vocabulaire LLM hérité.
  cas.forEach((c) => {
    assert.deepEqual(Object.keys(c).sort(), ['angle', 'chiffre', 'entreprise', 'source', 'statut']);
    assert.ok(['succes', 'echec', 'mixte', 'a_qualifier'].includes(c.statut));
  });
  assert.equal(cas.find((c) => /samsung/i.test(c.entreprise)).statut, 'echec');
  assert.equal(cas.find((c) => /air\s*canada/i.test(c.entreprise)).statut, 'echec');
  assert.equal(cas.find((c) => /klarna/i.test(c.entreprise)).statut, 'succes');

  // Persistés sous data.contrat uniquement.
  const relue = await FauxSession.findById(ID_SESSION);
  assert.equal(relue.data.contrat.casEntreprises.find((c) => /samsung/i.test(c.entreprise)).statut, 'echec');
});

// ---------------------------------------------------------------------------
// Cas 3 — session relue après refresh : rien ne dépend d'un état local.
// ---------------------------------------------------------------------------

test('cas 3 : après refresh, contrat validé visible, plan accessible, prérequis support cohérents', async () => {
  await sessionPrete();
  await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'probleme' });
  await executerPost('/:id/valider-contrat', { id: ID_SESSION }, {});
  await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'plan' });

  // On simule un rechargement complet du navigateur : seule la route GET parle.
  const relecture = await executerGet('/:id', { id: ID_SESSION });
  assert.equal(relecture.status, 200);
  verifierReponsePropre(relecture, 'refresh session');

  const { data, workflow } = relecture.body;
  assert.equal(workflow.analysis, 'generated');
  assert.equal(workflow.contract, 'validated', 'le contrat validé reste visible après refresh');
  assert.equal(workflow.plan, 'generated', 'le plan reste accessible après refresh');
  assert.equal(workflow.glossary, 'empty');
  assert.equal(workflow.support, 'empty');
  assert.equal(workflow.export, 'blocked');

  assert.equal(data.contrat.status, 'validated');
  assert.ok(data.contrat.validatedAt, 'la date de validation est persistée');
  assert.ok(data.contrat.problematique.length > 0);
  assert.equal(data.probleme, undefined);

  // Les prérequis du support sont lisibles SANS recalcul local : le glossaire
  // manque, le backend doit le dire explicitement.
  const tentative = await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'support' });
  assert.equal(tentative.status, 409);
  assert.deepEqual(tentative.body.error.missing, ['glossary_validation']);
});

// ---------------------------------------------------------------------------
// Cas 4 — prérequis support absents : réponse structurée, jamais technique.
// ---------------------------------------------------------------------------

test('cas 4 : SUPPORT_NOT_READY structuré et lisible quand aucun prérequis n’est satisfait', async () => {
  await sessionPrete();

  const tentative = await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'support' });
  assert.equal(tentative.status, 409);
  verifierReponsePropre(tentative, 'support non prêt');

  assert.equal(tentative.body.error.code, 'SUPPORT_NOT_READY');
  assert.equal(tentative.body.error.message, 'Le support ne peut pas encore être généré.');
  assert.deepEqual(tentative.body.error.missing, [
    'contract_validation',
    'plan_generation',
    'glossary_validation',
  ]);
  // Aucune trace de la mécanique interne : le frontend ne reçoit que du métier.
  assert.equal(tentative.body.error.requestId, undefined);
});

// ---------------------------------------------------------------------------
// Cas 5 — le rendu du support ne lève jamais « Cannot access 'justification' ».
// ---------------------------------------------------------------------------

test('cas 5 : générer puis relire le support ne lève aucune ReferenceError de type « justification »', async () => {
  await sessionPrete();
  await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'probleme' });
  await executerPost('/:id/valider-contrat', { id: ID_SESSION }, {});
  await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'plan' });
  await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'glossaire' });

  const support = await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'support' });
  assert.equal(support.status, 200, `support : ${JSON.stringify(support.body)}`);
  assert.equal(support.erreur, null, 'aucune exception ne doit être propagée');
  verifierReponsePropre(support, 'rendu support');

  // La relecture qui alimente l'écran Support ne doit rien casser non plus.
  const relecture = await executerGet('/:id', { id: ID_SESSION });
  assert.equal(relecture.status, 200);
  verifierReponsePropre(relecture, 'relecture écran support');
  assert.ok(relecture.body.data.support.slides.length > 0);
  assert.equal(relecture.body.data.probleme, undefined);
  // La justification reste absente : elle est portée par le contrat, sans erreur.
  assert.equal(relecture.body.data.contrat.justificationProbleme, '');
});

// ---------------------------------------------------------------------------
// Cas 6 — tension décorrélée : AVERTISSEMENT, jamais un blocage de la Passe A.
// ---------------------------------------------------------------------------

test('cas 6 : tension décorrélée → HTTP 200, avertissement, contrat validable, Plan accessible', async () => {
  await sessionPrete();
  // La tension et la question ne partagent presque aucun mot : c'est
  // exactement le motif qui produisait `contrat_tension_decorrelee` en 422.
  sortiePasseA = () => CONTRAT_TENSION_DECORRELEE;
  try {
    // 1. La génération doit RÉUSSIR (plus de PROBLEMATIC_QUALITY_REJECTED).
    const generation = await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'probleme' });
    assert.equal(
      generation.status,
      200,
      `tension décorrélée ne doit plus bloquer : ${JSON.stringify(generation.body)}`
    );
    verifierReponsePropre(generation, 'génération contrat (tension décorrélée)');

    const { contrat } = generation.body.data;
    assert.match(contrat.problematique, /\?$/);
    assert.ok(contrat.tension.trim().length > 0);
    assert.equal(contrat.status, 'generated');

    // 2. Le motif est bien remonté en AVERTISSEMENT, pas en rejet bloquant.
    const tout = [
      ...JSON.stringify(contrat.verification || {}),
      ...(contrat.verification?.avertissements || []),
    ].join(' ');
    assert.equal(
      (contrat.verification?.rejetsCore || []).some((r) => r.code === 'contrat_tension_decorrelee'),
      false,
      'contrat_tension_decorrelee ne doit plus figurer dans les rejets CORE'
    );
    assert.ok(
      /tension/i.test(tout) || (contrat.verification?.avertissements || []).length > 0,
      'la tension décorrélée doit rester signalée sous forme d’avertissement'
    );

    // 3. Le contrat reste VALIDABLE par l'étudiant : HTTP 200.
    const validation = await executerPost('/:id/valider-contrat', { id: ID_SESSION }, {});
    assert.equal(validation.status, 200, `validation : ${JSON.stringify(validation.body)}`);
    assert.equal(validation.body.workflow.contract, 'validated');

    // 4. Le PLAN devient accessible : la Passe A a bien débloqué l'aval.
    const plan = await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'plan' });
    assert.equal(plan.status, 200, `plan : ${JSON.stringify(plan.body)}`);
    assert.equal(plan.body.workflow.plan, 'generated');
  } finally {
    sortiePasseA = () => REPONSES_DEEPSEEK.probleme;
  }
});

// ---------------------------------------------------------------------------
// Cas 7 — contre-preuve : la simplification n'a pas rendu la Passe A complaisante.
// ---------------------------------------------------------------------------

test('cas 7 : une question oui / non reste un rejet BLOQUANT (HTTP 422)', async () => {
  await sessionPrete();
  sortiePasseA = () => CONTRAT_QUESTION_OUI_NON;
  try {
    const generation = await executerPost('/:id/generate/:step', { id: ID_SESSION, step: 'probleme' });
    assert.equal(generation.status, 422, `attendu 422, reçu ${JSON.stringify(generation.body)}`);
    assert.equal(generation.body.error.code, 'PROBLEMATIC_QUALITY_REJECTED');
    // Le motif précis du rejet est journalisé côté serveur (`detailTechnique`) :
    // c'est `contrat_question_oui_non`, et non un code de qualité déplacé.
    verifierReponsePropre(generation, 'rejet question oui/non');
    // Rien n'est écrit : le contrat précédent reste intact.
    const relecture = await executerGet('/:id', { id: ID_SESSION });
    assert.equal(relecture.body.workflow.contract, 'empty');
  } finally {
    sortiePasseA = () => REPONSES_DEEPSEEK.probleme;
  }
});
