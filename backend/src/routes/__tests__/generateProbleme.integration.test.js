/**
 * Test d'intégration de la route POST /api/sessions/:id/generate/probleme.
 *
 * Scénario EXACT du log de production 8cd6fbdc-0fb5-4d78-9753-5e84c88eef61 :
 *  - la réponse IA est valide ;
 *  - `formulations[0].question` est promue en problématique ;
 *  - la tension est récupérée depuis l'Analyse (jamais inventée) ;
 *  - `justificationProbleme` est absente ;
 *  - contrat core valide → sauvegarde de la session → HTTP 200.
 *
 * `node_modules` n'étant pas installé dans cet environnement, on n'ouvre pas de
 * port HTTP : on parcourt la VRAIE pile de la route (couche de handlers express
 * enregistrée sur le router) avec de fausses requêtes/réponses. Le modèle Session
 * et le provider DeepSeek sont remplacés (aucun réseau, aucune base).
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

/**
 * Doublure MINIMALE d'express (`node_modules` n'est pas installé ici) : seul ce
 * que le router de sessions utilise est implémenté — `Router()`, `use`, `get`,
 * `post`, `patch`, `delete`, et le passage des handlers enregistrés.
 */
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
  router.use = (...args) => {
    // Middlewares de routeur (montage) : ignorés, ils ne servent pas au test.
    if (typeof args[0] === 'string') return router;
    return router;
  };
  router.get = (chemin, ...handlers) => ajouter('get', chemin, ...handlers);
  router.post = (chemin, ...handlers) => ajouter('post', chemin, ...handlers);
  router.patch = (chemin, ...handlers) => ajouter('patch', chemin, ...handlers);
  router.delete = (chemin, ...handlers) => ajouter('delete', chemin, ...handlers);
  return router;
}

const expressFactice = { Router: creerRouterFactice };

/** Doublure minimale de mongoose : seule la validation d'ObjectId est utilisée. */
const mongooseFactice = {
  isValidObjectId: (id) => /^[a-f\d]{24}$/i.test(String(id)),
  Types: { ObjectId: { isValid: (id) => /^[a-f\d]{24}$/i.test(String(id)) } },
  model: () => FauxSession,
  Schema: function Schema() {},
};

/**
 * Doublures des services d'EXPORT uniquement : la route les importe, mais le
 * scénario testé (génération de la Passe A) ne les appelle jamais.
 */
const cheminPptx = path.join(__dirname, '..', '..', 'services', 'pptx.js');
require.cache[cheminPptx] = {
  id: cheminPptx,
  filename: cheminPptx,
  loaded: true,
  exports: { buildPptx: async () => Buffer.from('') },
};

/**
 * Doublure de models/StepSchema : `buildStepPrompt` lit le schéma de sortie de
 * l'étape via `findOne({ stepKey }).lean()`. Aucun schéma n'est en base ici, on
 * renvoie une description neutre : le prompt n'est pas ce qui est vérifié.
 */
const FauxStepSchema = {
  findOne: () => ({ lean: async () => ({ jsonSchemaDescription: 'contrat Passe A' }) }),
};

Module.prototype.require = function (requete) {
  if (requete === 'express') return expressFactice;
  if (requete === 'mongoose') return mongooseFactice;
  if (requete === 'pptxgenjs') return function PptxGenJS() {};
  // L'authentification est testée ailleurs : on neutralise jwt (aucune vérif ici).
  if (requete === 'jsonwebtoken') return { verify: () => ({ sub: 'utilisateur-de-test' }) };
  if (requete.endsWith('models/Session')) return FauxSession;
  if (requete.endsWith('models/StepSchema')) return FauxStepSchema;
  return chargerOriginal.apply(this, arguments);
};

// --- Faux provider DeepSeek (aucun appel réseau) -----------------------------
const REPONSE_IA = JSON.stringify({
  ligne_directrice:
    'La découverte culturelle se joue dans la tension entre profusion algorithmique et curiosité personnelle.',
  formulations: [
    {
      question:
        'Dans quelle mesure les algorithmes de recommandation transforment-ils notre rapport à la découverte culturelle ?',
      justification_recommandation:
        'Cette question relie la promesse d’un accès infini à l’enfermement dans les goûts déjà connus.',
    },
  ],
  recommandation:
    'Cette question relie la promesse d’un accès infini à l’enfermement dans les goûts déjà connus.',
  preconisations: [],
});

const cheminDeepseek = path.join(__dirname, '..', '..', 'services', 'deepseek.js');
require.cache[cheminDeepseek] = {
  id: cheminDeepseek,
  filename: cheminDeepseek,
  loaded: true,
  exports: { generateDeepseek: async () => REPONSE_IA },
};

const routerSessions = require(path.join(__dirname, '..', 'sessions.js'));

// --- Parcours de la vraie pile de handlers du router -------------------------
function memeRoute(couche, chemin) {
  return couche.route && couche.route.path === chemin;
}

/** Exécute la première couche POST de `chemin` et renvoie { status, body }. */
async function executerPost(chemin, params, body) {
  const couche = routerSessions.stack.find((c) => memeRoute(c, chemin));
  assert.ok(couche, `route ${chemin} introuvable dans le router`);
  const handlers = couche.route.stack
    .filter((h) => h.method === 'post')
    .map((h) => h.handle);
  assert.ok(handlers.length > 0, `aucun handler POST pour ${chemin}`);

  const req = { params, body: body || {}, headers: {}, method: 'POST' };
  const res = {
    statut: null,
    corps: null,
    status(code) {
      this.statut = code;
      return this;
    },
    json(payload) {
      this.corps = payload;
      // Express applique 200 par défaut quand aucun status() n'a été appelé :
      // on reproduit ce comportement, sinon un succès paraîtrait « sans réponse ».
      if (this.statut === null) this.statut = 200;
      return this;
    },
  };

  // On déroule la pile : `asyncHandler` encapsule le vrai traitement. Une erreur
  // contrôlée est propagée à `next` (jamais renvoyée telle quelle) ; on la capte
  // ici comme le ferait le handler d'erreur global d'Express.
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
        },
      },
      req,
      erreur: erreurPropagee,
    };
  }
  return { status: res.statut, body: res.corps, req, erreur: null };
}

const ANALYSE = {
  reformulation: 'L’influence des algorithmes sur la découverte culturelle.',
  mots_cles: [{ mot: 'bulle de filtres', definition: 'Enfermement algorithmique.' }],
  notions_a_maitriser: [],
  tensions: [
    {
      pole_a: 'Accès infini à la culture',
      pole_b: 'Enfermement dans les goûts déjà connus',
      description:
        'Les algorithmes de recommandation promettent un accès infini à la culture mais enferment l’auditeur dans ses goûts.',
    },
  ],
  positionnement_strategique: 'Un enjeu de diversité culturelle.',
};

const ID_SESSION = '507f1f77bcf86cd799439011';

async function sessionPrete(analyse) {
  const doc = new FauxDocument({
    _id: ID_SESSION,
    titre: 'Les algorithmes de recommandation et la culture',
    theme: 'Culture',
    currentStep: 1,
    data: { analyse: analyse || ANALYSE, contrat: {}, probleme: {} },
  });
  await doc.save();
}

test('scénario du log 8cd6fbdc : contrat core valide → HTTP 200, jamais 500', async () => {
  await sessionPrete();

  const { status, body, erreur } = await executerPost('/:id/generate/:step', {
    id: ID_SESSION,
    step: 'probleme',
  });
  assert.equal(
    status,
    200,
    `attendu 200, reçu ${status} : ${JSON.stringify(body)}\n${erreur && erreur.stack ? erreur.stack : ''}`
  );
  assert.equal(body.error, undefined, 'aucune erreur ne doit être renvoyée');

  const contrat = body.data.contrat;
  assert.ok(contrat, 'le contrat doit être présent dans la réponse');
  assert.notEqual(contrat.tension, '', 'la tension doit venir de l’Analyse');
  assert.match(contrat.problematique, /\?$/, 'la problématique doit être une question');
  assert.equal(contrat.justificationProbleme, '', 'la justification reste vide, sans blocage');
  assert.equal(contrat.completeness.isCoreValid, true);
  assert.ok(
    contrat.completeness.missingSecondaryFields.includes('justificationProbleme'),
    'la justification doit être signalée comme secondaire manquante'
  );

  // La session a bien été sauvegardée : le parcours peut continuer.
  const relue = await FauxSession.findById(ID_SESSION);
  assert.equal(relue.sauvegardes, 2, 'la session doit être sauvegardée après la génération');
  assert.equal(relue.data.contrat.problematique, contrat.problematique);
  assert.equal(relue.data.contrat.tension, contrat.tension);
  assert.equal(relue.data.contrat.valide, undefined, 'le contrat n’est pas validé d’office');
});

test('persistance : champs secondaires absents et justification vide sont stockés sans erreur', async () => {
  await sessionPrete({ ...ANALYSE, mots_cles: [], notions_a_maitriser: [] });

  const { status, body } = await executerPost('/:id/generate/:step', {
    id: ID_SESSION,
    step: 'probleme',
  });
  assert.equal(status, 200);
  assert.equal(body.error, undefined);

  const relue = await FauxSession.findById(ID_SESSION);
  const contrat = relue.data.contrat;
  // Aucun `undefined` ne doit être persisté : le contrat est complet par construction.
  ['tension', 'problematique', 'justificationProbleme', 'ligneDirectrice', 'ouverture'].forEach(
    (champ) => {
      assert.equal(typeof contrat[champ], 'string', `${champ} doit être une chaîne persistée`);
    }
  );
  ['preconisations', 'limitesExistant', 'casEntreprises', 'motsCles'].forEach((champ) => {
    assert.ok(Array.isArray(contrat[champ]), `${champ} doit être un tableau persisté`);
  });
  assert.equal(contrat.justificationProbleme, '');
  assert.equal(contrat.completeness.isCoreValid, true);
});

test('échec de persistance : HTTP 500 CONTRACT_PERSISTENCE_FAILED, contrat intact', async () => {
  await sessionPrete();

  // La base refuse l'écriture : le contrat est pourtant généré et valide.
  const sauvegardeOriginale = FauxDocument.prototype.save;
  FauxDocument.prototype.save = async function saveEnEchec() {
    throw new Error('MongoServerError: write concern failed');
  };
  try {
    const { status, body } = await executerPost('/:id/generate/:step', {
      id: ID_SESSION,
      step: 'probleme',
    });
    assert.equal(status, 500);
    assert.equal(body.error.code, 'CONTRACT_PERSISTENCE_FAILED');
    assert.match(body.error.message, /n’a pas pu être enregistré/);

    // Le contrat précédemment stocké n'a pas été écrasé par un demi-écrit.
    const relue = await FauxSession.findById(ID_SESSION);
    assert.deepEqual(relue.data.contrat, {});
  } finally {
    FauxDocument.prototype.save = sauvegardeOriginale;
  }
});
