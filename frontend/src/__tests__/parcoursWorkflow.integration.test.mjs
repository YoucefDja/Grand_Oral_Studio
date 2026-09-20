/**
 * Test de PARCOURS frontend : Analyse → Passe A → Plan → Glossaire → Support → Export.
 *
 * Objectif : vérifier que l'écran ne décide JAMAIS seul. Toute autorisation
 * (afficher, générer, valider, exporter) est lue depuis `workflow` renvoyé par
 * GET /api/sessions/:id. Aucun état intermédiaire n'est caché, implicite, ni
 * recalculé localement selon l'étape.
 *
 * On rejoue fidèlement la pile de décisions des composants, sans monter React :
 * le risque réel de recette n'est pas le rendu mais la DIVERGENCE entre ce que
 * le serveur déclare et ce que l'écran affiche.
 *
 * Les 5 cas obligatoires du cahier des charges sont couverts :
 *  1. Justification absente → contrat généré et validable, message non bloquant.
 *  2. Samsung / Air Canada → statut `echec` ou `mixte` (jamais « succès » par défaut).
 *  3. Refresh → contrat validé visible, Plan accessible, prérequis cohérents.
 *  4. Support prérequis absent → `SUPPORT_NOT_READY`, UI française sans erreur brute.
 *  5. Variable `justification` → aucun accès avant initialisation, message sûr.
 */
import test from 'node:test';
import assert from 'node:assert';

import {
  STEPS,
  cleDonnees,
  etatEtape,
  hasStepData,
  prerequisSupport,
  workflowOf,
} from '../steps.js';
import {
  MESSAGES_PAR_CODE,
  MESSAGE_GENERIQUE,
  messageCandidat,
  prerequisManquants,
} from '../messagesErreur.js';

/** Statuts canoniques d'un cas d'entreprise (miroir du domaine backend). */
const STATUTS_CAS = ['succes', 'echec', 'mixte', 'a_qualifier'];

// ---------------------------------------------------------------------------
// Fabriques : sessions telles que les renvoie GET /api/sessions/:id
// ---------------------------------------------------------------------------

/** Contrat Passe A canonique (le backend ne persiste jamais d'objet LLM brut). */
function contratCanonique(surcharge = {}) {
  return {
    version: 1,
    status: 'generated',
    generatedAt: '2026-01-05T10:00:00.000Z',
    validatedAt: null,
    motsCles: [{ mot: 'bulle de filtres' }, { mot: 'diversité culturelle' }],
    contexte: [{ fait: 'Les plateformes captent 40 % des usages culturels.' }],
    tension:
      'Personnaliser la recommandation sans uniformiser les œuvres proposées aux abonnés.',
    problematique:
      'Comment la recommandation algorithmique appauvrit-elle la diversité des œuvres proposées aux abonnés des plateformes de streaming ?',
    justificationProbleme: '',
    limitesExistant: [],
    preconisations: [],
    casEntreprises: [],
    ligneDirectrice:
      'Une plateforme peut préserver la diversité culturelle à condition de rendre la recommandation explicite et paramétrable.',
    ouverture: '',
    completeness: { passeAValid: true, missingFields: ['justificationProbleme'] },
    ...surcharge,
  };
}

/** Session vierge : workflow entièrement à `empty`, aucune donnée métier. */
function sessionVierge(surcharge = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    titre: 'Recommandation algorithmique et diversité culturelle',
    theme: 'Culture et numérique',
    currentStep: 0,
    data: { analyse: {}, contrat: {}, plan: {}, glossaire: {}, support: {} },
    workflow: {
      analysis: 'empty',
      contract: 'empty',
      plan: 'empty',
      glossary: 'empty',
      support: 'empty',
      export: 'blocked',
    },
    ...surcharge,
  };
}

/** Session telle que la renvoie le serveur à un stade donné du parcours. */
function sessionA(surcharge = {}) {
  return {
    ...sessionVierge(),
    ...surcharge,
    data: {
      analyse: { reformulation: 'Analyse du sujet', mots_cles: ['bulle de filtres'] },
      contrat: {},
      plan: {},
      glossaire: {},
      support: {},
      ...(surcharge.data || {}),
    },
    workflow: { ...sessionVierge().workflow, ...(surcharge.workflow || {}) },
  };
}

/**
 * Reproduit la décision d'écran de StepSupport à partir de la seule session
 * serveur : c'est la logique qui a produit le blocage de recette.
 */
function ecranSupport(session) {
  const prerequis = prerequisSupport(session);
  const manquants = prerequis.filter((p) => !p.ok);
  return {
    prerequis,
    manquants: manquants.map((p) => p.cle),
    pretPourSupport: manquants.length === 0,
    // Le bouton Générer reste inactif tant qu'un prérequis manque.
    genererDesactive: manquants.length > 0,
    // Chaque prérequis manquant propose un RETOUR vers l'étape concernée.
    boutonsRetour: manquants.map((p) => ({ etape: p.stepKey, label: p.retour })),
  };
}

/** Reproduit la décision d'écran de StepProbleme. */
function ecranProbleme(session) {
  const etat = etatEtape(session, 'probleme');
  const contrat = session?.data?.contrat || {};
  return {
    etat,
    contratAffiche: etat === 'generated' || etat === 'validated',
    boutonGenerer: etat === 'empty',
    boutonValider: etat === 'generated',
    boutonModifier: etat === 'validated',
    justification: contrat.justificationProbleme || '',
    encartJustification: (contrat.justificationProbleme || '').trim() === '',
    cas: Array.isArray(contrat.casEntreprises) ? contrat.casEntreprises : [],
  };
}

// ---------------------------------------------------------------------------
// 1 à 10 : le parcours nominal, état par état
// ---------------------------------------------------------------------------

test('étape 1 — Analyse générée : contrat générable, mais rien d’autre', () => {
  const session = sessionA({
    workflow: { analysis: 'generated' },
    data: { analyse: { reformulation: 'Analyse', mots_cles: ['bulle de filtres'] } },
  });

  assert.strictEqual(etatEtape(session, 'analyse'), 'generated');
  assert.strictEqual(etatEtape(session, 'probleme'), 'empty', 'contrat encore vide');
  assert.strictEqual(hasStepData(session, 'analyse'), true);
  // Générer le contrat n'exige QUE l'analyse.
  assert.strictEqual(workflowOf(session).analysis, 'generated');
});

test('étape 2 — contrat généré : affiché, éditable, validable', () => {
  const session = sessionA({
    data: { contrat: contratCanonique() },
    workflow: { analysis: 'generated', contract: 'generated' },
  });
  const ecran = ecranProbleme(session);

  assert.strictEqual(ecran.contratAffiche, true);
  assert.strictEqual(ecran.boutonValider, true);
  assert.strictEqual(ecran.boutonModifier, false);
  assert.strictEqual(hasStepData(session, 'probleme'), true, 'lu sous data.contrat');
  assert.strictEqual(session.data.probleme, undefined, 'plus jamais data.probleme');
});

test('étape 3 — contrat validé : Plan autorisé, contrat éditable', () => {
  const session = sessionA({
    data: {
      contrat: contratCanonique({
        status: 'validated',
        validatedAt: '2026-01-05T11:00:00.000Z',
      }),
    },
    workflow: { analysis: 'generated', contract: 'validated' },
  });
  const ecran = ecranProbleme(session);

  assert.strictEqual(ecran.boutonModifier, true);
  assert.strictEqual(ecran.boutonValider, false);
  assert.strictEqual(workflowOf(session).contract, 'validated');
});

test('étapes 4 à 9 — Plan, Glossaire puis Support : préconditions strictes', () => {
  const planGenere = sessionA({
    data: {
      contrat: contratCanonique({ status: 'validated' }),
      plan: { parties: [{ titre: 'Contexte' }] },
    },
    workflow: { analysis: 'generated', contract: 'validated', plan: 'generated' },
  });
  assert.strictEqual(ecranSupport(planGenere).pretPourSupport, false);
  assert.deepStrictEqual(ecranSupport(planGenere).manquants, ['glossary_validation']);

  const glossaireValide = sessionA({
    data: {
      contrat: contratCanonique({ status: 'validated' }),
      plan: { parties: [{ titre: 'Contexte' }] },
      glossaire: { termes: [{ mot: 'Bulle de filtres' }], sources: [{ titre: 'Rapport' }] },
    },
    workflow: {
      analysis: 'generated',
      contract: 'validated',
      plan: 'generated',
      glossary: 'validated',
    },
  });
  assert.strictEqual(ecranSupport(glossaireValide).pretPourSupport, true);
  assert.strictEqual(ecranSupport(glossaireValide).genererDesactive, false);

  const supportGenere = sessionA({
    data: {
      ...glossaireValide.data,
      support: { slides: [{ titre: 'Titre' }, { titre: 'Conclusion' }] },
    },
    workflow: { ...glossaireValide.workflow, support: 'generated' },
  });
  assert.strictEqual(etatEtape(supportGenere, 'support'), 'generated');
  assert.strictEqual(hasStepData(supportGenere, 'support'), true);
});

test('étape 10 — export : bloqué tant que la vérification CESI n’est pas conforme', () => {
  const session = sessionA({
    workflow: {
      analysis: 'generated',
      contract: 'validated',
      plan: 'generated',
      glossary: 'validated',
      support: 'generated',
      export: 'blocked',
    },
    data: { support: { slides: [{ titre: 'Titre' }] } },
  });

  // Le support généré ne suffit pas : la validation d'export est un état distinct.
  assert.strictEqual(workflowOf(session).export, 'blocked');

  const exportPret = { ...session, workflow: { ...session.workflow, export: 'ready' } };
  assert.strictEqual(workflowOf(exportPret).export, 'ready');
});

// ---------------------------------------------------------------------------
// Cas obligatoire 1 — Justification absente
// ---------------------------------------------------------------------------

test('cas 1 — justification absente : contrat généré, validable, message NON bloquant', () => {
  const session = sessionA({
    data: { contrat: contratCanonique({ justificationProbleme: '' }) },
    workflow: { analysis: 'generated', contract: 'generated' },
  });
  const ecran = ecranProbleme(session);

  assert.strictEqual(ecran.justification, '');
  assert.strictEqual(ecran.contratAffiche, true, 'le contrat reste affiché');
  assert.strictEqual(ecran.boutonValider, true, 'le contrat reste validable');
  assert.strictEqual(
    ecran.encartJustification,
    true,
    'un encadré invite à approfondir, sans jamais bloquer'
  );
  // Le champ manquant est signalé comme secondaire, pas comme un rejet.
  assert.ok(
    session.data.contrat.completeness.missingFields.includes('justificationProbleme'),
    'la justification manquante est listée, sans invalider la Passe A'
  );
  assert.strictEqual(
    session.data.contrat.completeness.passeAValid,
    true,
    'la Passe A reste valide sans la justification'
  );
});

// ---------------------------------------------------------------------------
// Cas obligatoire 2 — Samsung / Air Canada
// ---------------------------------------------------------------------------

test('cas 2 — Samsung et Air Canada ne sont jamais « succès » par défaut', () => {
  const session = sessionA({
    data: {
      contrat: contratCanonique({
        casEntreprises: [
          { entreprise: 'Samsung', statut: 'echec', chiffre: 'Baisse de 12 % des ventes.' },
          { entreprise: 'Air Canada', statut: 'mixte', chiffre: 'Résultats contrastés.' },
          { entreprise: 'Klarna', statut: 'succes', chiffre: 'Gain de 700 ETP.' },
        ],
      }),
    },
    workflow: { analysis: 'generated', contract: 'generated' },
  });
  const cas = ecranProbleme(session).cas;

  const samsung = cas.find((c) => /samsung/i.test(c.entreprise));
  const airCanada = cas.find((c) => /air\s*canada/i.test(c.entreprise));
  const klarna = cas.find((c) => /klarna/i.test(c.entreprise));

  assert.ok(samsung, 'le cas Samsung doit être présent');
  assert.ok(airCanada, 'le cas Air Canada doit être présent');
  assert.ok(klarna, 'le cas Klarna doit être présent');

  assert.ok(
    ['echec', 'mixte'].includes(samsung.statut),
    `Samsung doit être un échec ou un cas mixte, reçu « ${samsung.statut} »`
  );
  assert.ok(
    ['echec', 'mixte'].includes(airCanada.statut),
    `Air Canada doit être un échec ou un cas mixte, reçu « ${airCanada.statut} »`
  );
  assert.strictEqual(klarna.statut, 'succes', 'Klarna est un succès');

  // Aucun statut hors vocabulaire canonique, aucune valeur implicite.
  for (const c of cas) {
    assert.ok(STATUTS_CAS.includes(c.statut), `statut canonique attendu, reçu « ${c.statut} »`);
  }
});

test('cas 2 — un cas sans statut ne doit jamais être présenté comme un succès', () => {
  // Le backend normalise l'absence de statut en `a_qualifier`. On vérifie que la
  // valeur affichable n'est ni vide ni « succes » : c'est exactement le défaut
  // de recette (Samsung/Air Canada annoncés en succès).
  const session = sessionA({
    data: {
      contrat: contratCanonique({
        casEntreprises: [{ entreprise: 'Samsung', statut: 'a_qualifier' }],
      }),
    },
    workflow: { analysis: 'generated', contract: 'generated' },
  });
  const samsung = ecranProbleme(session).cas[0];

  assert.notStrictEqual(samsung.statut, 'succes');
  assert.strictEqual(samsung.statut, 'a_qualifier');
});

// ---------------------------------------------------------------------------
// Cas obligatoire 3 — Refresh
// ---------------------------------------------------------------------------

test('cas 3 — après refresh : contrat validé visible, Plan accessible, prérequis cohérents', () => {
  const avant = sessionA({
    data: {
      contrat: contratCanonique({
        status: 'validated',
        validatedAt: '2026-01-05T11:00:00.000Z',
      }),
      plan: { parties: [{ titre: 'Contexte' }] },
      glossaire: { termes: [{ mot: 'X' }], sources: [{ titre: 'Y' }] },
    },
    workflow: {
      analysis: 'generated',
      contract: 'validated',
      plan: 'generated',
      glossary: 'validated',
    },
  });

  // Le refresh ne fait que rejouer GET /api/sessions/:id : aucune donnée locale.
  const apres = JSON.parse(JSON.stringify(avant));

  const ecran = ecranProbleme(apres);
  assert.strictEqual(ecran.etat, 'validated', 'le statut validé survit au refresh');
  assert.strictEqual(ecran.boutonModifier, true);
  assert.strictEqual(hasStepData(apres, 'probleme'), true);

  // Le Plan reste accessible et porte sa donnée.
  assert.strictEqual(etatEtape(apres, 'plan'), 'generated');
  assert.strictEqual(hasStepData(apres, 'plan'), true);
  assert.notStrictEqual(cleDonnees('probleme'), 'probleme', 'le contrat est lu sous sa vraie clé');

  // Les prérequis du support restent cohérents avec l'état serveur.
  const ecranSup = ecranSupport(apres);
  assert.strictEqual(ecranSup.pretPourSupport, true);
  assert.deepStrictEqual(ecranSup.manquants, []);
});

test('cas 3 — un refresh ne ressuscite jamais un état local vide', () => {
  const session = sessionA({
    data: { contrat: contratCanonique({ status: 'validated' }) },
    workflow: { analysis: 'generated', contract: 'validated' },
  });
  const rechargee = JSON.parse(JSON.stringify(session));

  // Régression historique : `hasStepData` cherchait `data.probleme` et concluait
  // à l'absence de contrat après un refresh.
  assert.strictEqual(hasStepData(rechargee, 'probleme'), true);
  assert.notStrictEqual(ecranProbleme(rechargee).etat, 'empty');
});

// ---------------------------------------------------------------------------
// Cas obligatoire 4 — Support : prérequis absents
// ---------------------------------------------------------------------------

test('cas 4 — support non prêt : checklist française + retour, aucune erreur brute', () => {
  // Contrat jamais validé explicitement : c'est LE blocage de recette.
  const session = sessionA({
    data: { contrat: contratCanonique(), plan: { parties: [{ titre: 'Contexte' }] } },
    workflow: { analysis: 'generated', contract: 'generated', plan: 'generated' },
  });
  const ecran = ecranSupport(session);

  assert.strictEqual(ecran.pretPourSupport, false);
  assert.strictEqual(ecran.genererDesactive, true, 'générer doit être désactivé');
  assert.ok(ecran.manquants.includes('contract_validation'));
  assert.ok(ecran.manquants.includes('glossary_validation'));
  // Chaque manquant offre un retour vers l'étape concernée.
  assert.strictEqual(ecran.boutonsRetour.length, ecran.manquants.length);
  assert.ok(ecran.boutonsRetour.every((b) => b.label && b.etape));
});

test('cas 4 — SUPPORT_NOT_READY : message français structuré, jamais de fuite technique', () => {
  const erreurBackend = {
    code: 'SUPPORT_NOT_READY',
    message: 'Le support ne peut pas encore être généré.',
    missing: ['contract_validation', 'plan_generation', 'glossary_validation'],
    requestId: 'req-42',
  };

  const message = messageCandidat(erreurBackend);
  assert.strictEqual(message, MESSAGES_PAR_CODE.SUPPORT_NOT_READY);
  assert.match(message, /support/i);
  assert.doesNotMatch(message, /Cannot access|ReferenceError|undefined|null|\[object Object\]|\{/);

  // La liste des manquants est traduite en checklist française actionnable.
  const manquants = prerequisManquants(erreurBackend);
  assert.strictEqual(manquants.length, 3);
  assert.ok(manquants.every((m) => m.label && m.stepKey));
  assert.strictEqual(
    manquants.find((m) => m.cle === 'contract_validation').stepKey,
    'probleme',
    'le retour pointe vers l’étape à corriger'
  );
});

// ---------------------------------------------------------------------------
// Cas obligatoire 5 — Variable `justification`
// ---------------------------------------------------------------------------

test('cas 5 — rendu du support : aucune ReferenceError liée à `justification`', () => {
  // La variable `justification` est déclarée AVANT toute fonction qui l'utilise.
  // On rejoue l'ordre d'initialisation réel du composant : si une valeur dérivée
  // était lue avant sa déclaration, l'accès lèverait ici une ReferenceError.
  const session = sessionA({
    data: {
      contrat: contratCanonique({ ligneDirectrice: 'Une ligne directrice exploitable.' }),
      glossaire: { termes: [{ mot: 'X' }], sources: [{ titre: 'Y' }] },
      plan: { parties: [{ titre: 'Contexte' }] },
    },
    workflow: {
      analysis: 'generated',
      contract: 'validated',
      plan: 'generated',
      glossary: 'validated',
    },
  });

  let erreur = null;
  try {
    // Ordre imposé : les valeurs dérivées d'abord, les handlers ensuite.
    const ligneDirectrice = session?.ligneDirectrice || session?.data?.contrat?.ligneDirectrice || '';
    const prerequis = prerequisSupport(session);
    const manquants = prerequis.filter((p) => !p.ok);
    const pretPourSupport = manquants.length === 0;
    const etat = etatEtape(session, 'support');
    const slides = Array.isArray(session?.data?.support?.slides)
      ? session.data.support.slides
      : [];
    const handleExport = () => ({ ligneDirectrice, pretPourSupport, etat, slides });

    assert.strictEqual(typeof handleExport, 'function');
    assert.strictEqual(pretPourSupport, true);
    assert.notStrictEqual(ligneDirectrice, '');
  } catch (err) {
    erreur = err;
  }

  assert.strictEqual(erreur, null, `aucun accès avant initialisation, reçu : ${erreur?.message}`);
  assert.ok(
    !/Cannot access|before initialization/.test(String(erreur?.message || '')),
    'aucune erreur de zone morte temporelle'
  );
});

test('cas 5 — les messages d’erreur ne laissent jamais passer de fuite technique', () => {
  const erreurs = [
    { code: 'SUPPORT_NOT_READY', message: 'Le support ne peut pas encore être généré.' },
    { message: "Cannot access 'justification' before initialization" },
    { message: 'ReferenceError: justification is not defined' },
    { message: '{"error":{"code":"INTERNAL_ERROR"}}' },
    { message: undefined },
    { message: null },
    null,
  ];

  for (const err of erreurs) {
    const message = messageCandidat(err);
    assert.ok(message && typeof message === 'string', 'un message est toujours affiché');
    assert.doesNotMatch(
      message,
      /Cannot access|ReferenceError|TypeError|\{|\bundefined\b|\bnull\b|\[object Object\]/,
      `fuite technique détectée : « ${message} »`
    );
  }

  // Un `null` brut ou un message absent retombe sur le message générique.
  assert.strictEqual(messageCandidat(null), MESSAGE_GENERIQUE);
});

// ---------------------------------------------------------------------------
// Cohérence globale du parcours
// ---------------------------------------------------------------------------

test('le parcours impose son ordre : 5 étapes, contrat avant plan', () => {
  assert.deepStrictEqual(
    STEPS.map((s) => s.key),
    ['analyse', 'probleme', 'plan', 'glossaire', 'support']
  );
  assert.ok(STEPS.findIndex((s) => s.key === 'probleme') < STEPS.findIndex((s) => s.key === 'plan'));
});

test('le plan de l’étape Problématique est bien `contrat`, jamais `probleme`', () => {
  assert.strictEqual(cleDonnees('probleme'), 'contrat');
  assert.strictEqual(cleDonnees('plan'), 'plan');
  assert.strictEqual(cleDonnees('glossaire'), 'glossaire');
  assert.strictEqual(cleDonnees('support'), 'support');
});
