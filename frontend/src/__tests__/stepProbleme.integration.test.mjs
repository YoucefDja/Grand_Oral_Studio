/**
 * Tests d'intégration de l'étape « Problématique » (Passe A) côté frontend.
 *
 * Deux bugs corrigés, testés ici de bout en bout :
 *  1. `hasStepData(session, 'probleme')` cherchait les données sous
 *     `session.data.probleme`, alors que le contrat Passe A est persisté par le
 *     backend sous `session.data.contrat` — le contrat restait invisible.
 *  2. L'affichage était recalculé localement (`completeness.isCoreValid`), d'où
 *     un contrat affiché comme exploitable tout en portant des rejets bloquants.
 *
 * Désormais l'état vient EXCLUSIVEMENT de `workflow` renvoyé par le serveur.
 * On teste le chemin complet tel que le vit l'utilisateur :
 *   session serveur → état de workflow → décision d'écran → contenu affiché.
 */
import test from 'node:test';
import assert from 'node:assert';

import {
  hasStepData,
  STEPS,
  contratValide,
  etatEtape,
  ligneDirectriceOf,
  prerequisSupport,
} from '../steps.js';

/** Contrat canonique tel que le renvoie GET /api/sessions/:id. */
export function contratCanonique(surcharge = {}) {
  return {
    version: 1,
    status: 'generated',
    generatedAt: '2026-01-05T10:00:00.000Z',
    validatedAt: null,
    motsCles: [],
    contexte: [],
    tension: 'Gagner en productivité sans exposer ses données stratégiques.',
    problematique:
      'Comment une PME peut-elle intégrer l’IA générative sans compromettre la protection de ses données ?',
    justificationProbleme: '',
    limitesExistant: [],
    preconisations: [],
    casEntreprises: [],
    ligneDirectrice:
      "Une PME peut intégrer l'IA générative dans ses processus métiers à condition de choisir un cadre de gouvernance proportionné à ses moyens.",
    ouverture: '',
    completeness: { passeAValid: true, missingFields: ['justificationProbleme'] },
    ...surcharge,
  };
}

/** Session telle que la renvoie GET /api/sessions/:id après une Passe A réussie. */
export function sessionAvecContrat(surcharge = {}) {
  const { contrat: surchargeContrat, workflow: surchargeWorkflow, ...reste } = surcharge;
  return {
    _id: '507f1f77bcf86cd799439011',
    titre: 'IA générative et processus métiers en PME',
    theme: 'Transformation digitale',
    currentStep: 2,
    data: {
      analyse: { reformulation: 'Analyse du sujet', motsCles: ['IA générative', 'PME'] },
      contrat: contratCanonique(surchargeContrat),
      plan: { parties: [{ titre: 'Contexte' }] },
      glossaire: {},
      support: {},
    },
    workflow: {
      analysis: 'generated',
      contract: 'generated',
      plan: 'empty',
      glossary: 'empty',
      support: 'empty',
      export: 'blocked',
      ...surchargeWorkflow,
    },
    ...reste,
  };
}

/** Reproduit la décision d'écran de `StepProbleme` / `StepShell`. */
function ecranProbleme(session) {
  const etat = etatEtape(session, 'probleme');
  const contrat = session?.data?.contrat || {};
  const completeness = contrat.completeness || {};
  return {
    etat,
    // Le contrat s'affiche si le serveur le déclare généré ou validé.
    actionPrincipale: etat === 'generated' || etat === 'validated' ? 'contrat' : 'generer',
    boutonValider: etat === 'generated',
    boutonModifier: etat === 'validated',
    tension: contrat.tension || '',
    problematique: contrat.problematique || '',
    justification: contrat.justificationProbleme || '',
    encartJustification: (contrat.justificationProbleme || '').trim() === '',
    champsManquants: Array.isArray(completeness.missingFields) ? completeness.missingFields : [],
    valide: etat === 'validated',
    statutBrut: contrat.status || '',
    ligneDirectrice: ligneDirectriceOf(session),
    planAccessible: session?.currentStep >= STEPS.findIndex((s) => s.key === 'plan'),
  };
}

test('session avec contrat persisté : le contrat s’affiche, pas le bouton Générer', () => {
  const ecran = ecranProbleme(sessionAvecContrat());

  assert.strictEqual(ecran.actionPrincipale, 'contrat');
  assert.notStrictEqual(ecran.tension, '', 'la tension doit être affichée');
  assert.notStrictEqual(ecran.problematique, '', 'la problématique doit être affichée');
  assert.match(ecran.problematique, /\?$/, 'la problématique est une question');
  assert.notStrictEqual(ecran.ligneDirectrice, '');
  assert.strictEqual(hasStepData(sessionAvecContrat(), 'probleme'), true);
});

test('contrat `generated` : bouton Valider disponible, bouton Modifier absent', () => {
  const ecran = ecranProbleme(sessionAvecContrat());

  assert.strictEqual(ecran.statutBrut, 'generated');
  assert.strictEqual(ecran.boutonValider, true);
  assert.strictEqual(ecran.boutonModifier, false);
  assert.strictEqual(ecran.valide, false, 'le contrat n’est pas validé d’office');
});

test('contrat `validated` : bouton Modifier, Plan accessible', () => {
  const session = sessionAvecContrat({
    contrat: { status: 'validated', validatedAt: '2026-01-05T11:00:00.000Z' },
    workflow: { contract: 'validated' },
  });
  const ecran = ecranProbleme(session);

  assert.strictEqual(ecran.valide, true);
  assert.strictEqual(ecran.boutonValider, false);
  assert.strictEqual(ecran.boutonModifier, true);
  assert.strictEqual(contratValide(session), true);
  assert.strictEqual(ecran.planAccessible, true, 'le plan reste accessible');
});

test('rechargement de page (hydratation session) : contrat affiché sans regénération', () => {
  // Après refresh, la seule source est GET /api/sessions/:id : le contrat doit
  // être retrouvé tel qu'il est, sans nouvel appel IA ni état local vide.
  const sessionRechargee = JSON.parse(JSON.stringify(sessionAvecContrat()));
  const ecran = ecranProbleme(sessionRechargee);

  assert.strictEqual(ecran.actionPrincipale, 'contrat');
  assert.match(ecran.problematique, /IA générative/);
});

test('rechargement avec contrat validé : le statut validé survit au refresh', () => {
  const session = sessionAvecContrat({
    contrat: { status: 'validated', validatedAt: '2026-01-05T11:00:00.000Z' },
    workflow: { contract: 'validated' },
  });
  const rechargee = JSON.parse(JSON.stringify(session));

  assert.strictEqual(ecranProbleme(rechargee).etat, 'validated');
  assert.strictEqual(prerequisSupport(rechargee)[0].ok, true, 'prérequis contrat vu comme rempli');
});

test('justification absente : encadré non bloquant, contrat toujours affiché et validable', () => {
  const ecran = ecranProbleme(sessionAvecContrat());

  assert.strictEqual(ecran.justification, '');
  assert.strictEqual(ecran.encartJustification, true, 'l’encadré doit inviter à approfondir');
  assert.strictEqual(ecran.actionPrincipale, 'contrat', 'un champ secondaire vide ne cache pas le contrat');
  assert.strictEqual(ecran.boutonValider, true, 'le contrat reste validable');
  assert.ok(ecran.champsManquants.includes('justificationProbleme'));
});

test('contrat portant des rejets : l’affichage suit le statut serveur, pas la complétude locale', () => {
  // Régression : un contrat pouvait être présenté comme exploitable alors que le
  // serveur le refusait. On suit exclusivement `workflow.contract`.
  const session = sessionAvecContrat({
    contrat: { completeness: { passeAValid: false, missingFields: ['tension'] } },
  });
  const ecran = ecranProbleme(session);

  assert.strictEqual(ecran.actionPrincipale, 'contrat');
  assert.strictEqual(ecran.boutonValider, true, 'seul le serveur décide de la validabilité');
  assert.deepStrictEqual(ecran.champsManquants, ['tension']);
});

test('session sans contrat : le bouton Générer reste l’action principale', () => {
  const session = sessionAvecContrat();
  // Session vierge : aucun contrat persisté, workflow à `empty` des deux côtés.
  session.data.contrat = {};
  session.workflow.contract = 'empty';

  assert.strictEqual(ecranProbleme(session).actionPrincipale, 'generer');
  assert.strictEqual(hasStepData(session, 'probleme'), false);
});

test('aucune donnée persistée sous data.probleme : le contrat fait foi', () => {
  const session = sessionAvecContrat();

  assert.strictEqual(session.data.probleme, undefined);
  assert.strictEqual(hasStepData(session, 'probleme'), true);
});

test('régression : les autres étapes ne dépendent pas du contrat', () => {
  const session = sessionAvecContrat();

  assert.strictEqual(hasStepData(session, 'analyse'), true);
  assert.strictEqual(hasStepData(session, 'plan'), true);
  assert.strictEqual(hasStepData(session, 'glossaire'), false);
  assert.strictEqual(hasStepData(session, 'support'), false);
});
