/**
 * Recette de route — les exports Markdown (Gamma / Claude Design / PPTX-prompt)
 * doivent être AUTORISÉS dès que les intrants de préparation sont conformes,
 * même si le support n'est pas encore généré (0 slide / 0 note).
 *
 * Régression visée : la boucle bloquante
 *   pas de support → 0 slide et 0 note → export bloqué → support impossible.
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

const cheminPptx = path.join(__dirname, '..', '..', 'services', 'pptx.js');
require.cache[cheminPptx] = {
  id: cheminPptx,
  filename: cheminPptx,
  loaded: true,
  exports: { buildPptx: async () => Buffer.from('') },
};

const FauxStepSchema = {
  findOne: () => ({ lean: async () => ({ jsonSchemaDescription: 'support 20 slides' }) }),
};

// Sections de style / charte visuelle : présentes en base (seed joué).
const SECTIONS_METHODOLOGIE = [
  { sectionId: 'style_support', content: 'Ton direct, phrases courtes.' },
  { sectionId: 'charte_visuelle_support', content: 'Fond clair, accent CESI.' },
];

const FauxMethodologySection = {
  find: () => {
    const resultat = {
      sort: () => resultat,
      lean: async () => SECTIONS_METHODOLOGIE,
    };
    return resultat;
  },
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

const routerSessions = require(path.join(__dirname, '..', 'sessions.js'));

// --- Parcours de la vraie pile de handlers du router -------------------------
function memeRoute(couche, chemin) {
  return couche.route && couche.route.path === chemin;
}

/** Exécute la première couche GET de `chemin` et renvoie { status, corps, texte }. */
async function executerGet(chemin, params) {
  const couche = routerSessions.stack.find((c) => memeRoute(c, chemin));
  assert.ok(couche, `route ${chemin} introuvable dans le router`);
  const handlers = couche.route.stack.filter((h) => h.method === 'get').map((h) => h.handle);
  assert.ok(handlers.length > 0, `aucun handler GET pour ${chemin}`);

  const req = { params, body: {}, headers: {}, method: 'GET', userId: 'utilisateur-de-test' };
  let texte = null;
  const res = {
    statut: null,
    corps: null,
    entetes: {},
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
      this.entetes[cle] = valeur;
      return this;
    },
    header(cle, valeur) {
      return this.setHeader(cle, valeur);
    },
    send(payload) {
      texte = payload;
      if (this.statut === null) this.statut = 200;
      return this;
    },
    end(payload) {
      if (payload !== undefined) texte = payload;
      if (this.statut === null) this.statut = 200;
      return this;
    },
    download() {
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
      corps: {
        error: {
          code: typeof erreurPropagee.code === 'string' ? erreurPropagee.code : 'INTERNAL_ERROR',
          message: erreurPropagee.message,
        },
      },
      texte: null,
      erreur: erreurPropagee,
    };
  }
  return { status: res.statut, corps: res.corps, texte, erreur: null };
}

const ID_SESSION = '507f1f77bcf86cd799439011';

/** Session PCA/PRA : intrants validés, support jamais généré (0 slide). */
async function sessionPcaPra({ limitesExistant, preconisations } = {}) {
  const doc = new FauxDocument({
    _id: ID_SESSION,
    titre: 'Tests cyber réalistes et fiabilité des PCA/PRA',
    theme: 'Cybersécurité',
    currentStep: 4,
    ligneDirectrice:
      "La fiabilité d'un PCA/PRA après une cyberattaque ne dépend pas de la conformité du classeur, mais de la capacité à tester des scénarios cyber réalistes.",
    workflow: {
      analysis: 'generated',
      contract: 'validated',
      plan: 'generated',
      glossary: 'validated',
      support: 'empty',
      export: 'blocked',
    },
    data: {
      analyse: {
        reformulation: 'Les PCA/PRA face aux cyberattaques.',
        mots_cles: [{ mot: 'PCA/PRA', definition: "Plan de continuité et de reprise d'activité." }],
      },
      contrat: {
        version: 1,
        status: 'validated',
        validatedAt: '2026-01-05T11:00:00.000Z',
        tension:
          "Le classeur conforme rassure l'audit, mais le plan n'est jamais éprouvé par un scénario d'attaque réel.",
        problematique:
          'Comment une démarche de tests cyber réalistes permet-elle de concilier conformité des PCA/PRA et fiabilité en situation réelle ?',
        ligneDirectrice:
          "La fiabilité d'un PCA/PRA après une cyberattaque ne dépend pas de la conformité du classeur, mais de la capacité à tester des scénarios cyber réalistes.",
        justificationProbleme:
          "Le classeur conforme rassure l'audit mais ne dit rien de la tenue réelle du plan le jour de l'incident.",
        contexte: [
          { fait: 'En 2024, 41 % des PCA ne sont jamais testés.', source: 'ANSSI 2024' },
        ],
        limitesExistant:
          limitesExistant === undefined
            ? ["Les PCA/PRA sont validés sur dossier mais jamais éprouvés par un scénario d'attaque réel."]
            : limitesExistant,
        preconisations:
          preconisations === undefined
            ? [{ action: 'Tester le PCA/PRA par des scénarios cyber réalistes', cible: 'Direction des risques' }]
            : preconisations,
        casEntreprises: [],
        motsCles: [{ mot: 'PCA/PRA', definition: "Plan de continuité et de reprise d'activité." }],
      },
      plan: {
        parties: [
          { titre: 'Introduction' },
          { titre: "Limites de l'existant" },
          { titre: 'Préconisations' },
        ],
        ouverture: { question: 'Les dirigeants accepteront-ils de tester avant de certifier ?' },
      },
      glossaire: { termes: [{ mot: 'PCA/PRA' }], sources: [{ titre: 'ANSSI 2024' }] },
      recherche: { sources: [{ titre: 'ANSSI 2024' }] },
      support: {},
    },
  });
  await doc.save();
  return doc;
}

const ROUTES_MARKDOWN = [
  '/:id/support-pptx-prompt',
  '/:id/support-gamma-prompt',
  '/:id/support-claude-design-prompt',
];

test('PCA/PRA — pré-support conforme : les 3 exports Markdown sont autorisés', async () => {
  await sessionPcaPra();

  for (const chemin of ROUTES_MARKDOWN) {
    const { status, corps, erreur } = await executerGet(chemin, { id: ID_SESSION });
    assert.equal(
      status,
      200,
      `${chemin} doit répondre 200, reçu ${status} : ${JSON.stringify(corps)}${erreur ? `\n${erreur.stack}` : ''}`
    );
    assert.equal(corps?.error, undefined, `${chemin} ne doit renvoyer aucune erreur`);
  }
});

test('PCA/PRA — pré-support sans limites de l’existant : export Markdown bloqué (400) et message précis', async () => {
  await sessionPcaPra({ limitesExistant: [] });

  const { status, corps } = await executerGet('/:id/support-gamma-prompt', { id: ID_SESSION });

  assert.equal(status, 400, 'l’export doit être refusé, pas silencieusement produit');
  // httpError ne pose qu'un statut : le code affiché est le défaut du handler global.
  assert.equal(corps.error.code, 'INTERNAL_ERROR');
  assert.match(corps.error.message, /pas encore suffisant pour générer le support/);
  assert.match(corps.error.message, /Ajoutez les limites de l'existant/);
  assert.match(corps.error.message, /Limites de l’existant/, 'la section à compléter est nommée');
  // Les critères de slides ne doivent pas apparaître comme motif de refus.
  assert.doesNotMatch(corps.error.message, /notes du présentateur/i);
  assert.doesNotMatch(corps.error.message, /20 slides/i);
});

test('PCA/PRA — pré-support sans préconisation : export Markdown bloqué (400)', async () => {
  await sessionPcaPra({ preconisations: [] });

  const { status, corps } = await executerGet('/:id/support-claude-design-prompt', {
    id: ID_SESSION,
  });

  assert.equal(status, 400);
  assert.match(corps.error.message, /Aucune préconisation/);
});

test('PCA/PRA — 0 slide et 0 note ne bloquent jamais l’export Markdown', async () => {
  const doc = await sessionPcaPra();
  assert.equal(doc.data.support.slides, undefined, 'aucun slide en base');

  for (const chemin of ROUTES_MARKDOWN) {
    const { status, corps } = await executerGet(chemin, { id: ID_SESSION });
    assert.equal(status, 200, `${chemin} ne doit pas être bloqué par 0 slide / 0 note`);
    assert.equal(corps?.error, undefined);
  }
});
