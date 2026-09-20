/**
 * Tests d'intégration de l'étape « Problématique » (Passe A) côté frontend.
 *
 * Le bug corrigé : `hasStepData(session, 'probleme')` cherchait les données sous
 * `session.data.probleme`, alors que le contrat Passe A est persisté par le
 * backend sous `session.data.contrat`. La coquille d'étape croyait donc qu'aucun
 * contenu n'existait et n'affichait que le bouton « Générer : Problématique » —
 * y compris après un rechargement, alors que le contrat était bien en base (le
 * Plan le prouvait, lui qui était déverrouillé et alimenté).
 *
 * On teste ici le chemin complet tel que le vit l'utilisateur :
 *   session serveur → hasStepData → état de l'écran → contenu affiché.
 * Ces tests ne touchent NI la génération, NI le Plan.
 */
import test from 'node:test';
import assert from 'node:assert';

import { hasStepData, STEPS, ligneDirectriceOf, contratValide } from '../steps.js';

/** Session telle que la renvoie GET /api/sessions/:id après une Passe A réussie. */
function sessionAvecContrat(surcharge = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    titre: 'IA générative et processus métiers en PME',
    theme: 'Transformation digitale',
    currentStep: 2,
    ligneDirectrice:
      "Une PME peut intégrer l'IA générative dans ses processus métiers à condition de choisir un cadre de gouvernance proportionné à ses moyens.",
    data: {
      analyse: { reformulation: 'Analyse du sujet', tensions: [{ pole_a: 'a', pole_b: 'b' }] },
      contrat: {
        tension: 'Gagner en productivité sans exposer ses données stratégiques.',
        problematique:
          'Comment une PME peut-elle intégrer l’IA générative sans compromettre la protection de ses données ?',
        justificationProbleme: '',
        ligneDirectrice:
          "Une PME peut intégrer l'IA générative dans ses processus métiers à condition de choisir un cadre de gouvernance proportionné à ses moyens.",
        preconisations: [],
        limitesExistant: [],
        casEntreprises: [],
        motsCles: [],
        ouverture: '',
        completeness: { isCoreValid: true, missingSecondaryFields: ['justificationProbleme'] },
        verification: { coreValide: true, rejets: [], rejetsSecondaires: [], avertissements: [] },
      },
      probleme: {},
      plan: { parties: [{ titre: 'Contexte' }] },
    },
    ...surcharge,
  };
}

/**
 * Reproduit la décision de la coquille d'étape : le contenu existe-t-il, et donc
 * affiche-t-on le contrat plutôt que le bouton de génération ?
 */
function ecranProbleme(session) {
  const exists = hasStepData(session, 'probleme');
  const contrat = session?.data?.contrat || {};
  const completeness = contrat.completeness || {};
  const isCoreValid =
    completeness.isCoreValid === true || Boolean(contrat.problematique && contrat.tension);
  return {
    actionPrincipale: exists && isCoreValid ? 'contrat' : 'generer',
    tension: contrat.tension || '',
    problematique: contrat.problematique || '',
    justification: contrat.justificationProbleme || '',
    encartJustification: (contrat.justificationProbleme || '').trim() === '',
    secondairesManquants: Array.isArray(completeness.missingSecondaryFields)
      ? completeness.missingSecondaryFields
      : [],
    valide: contrat.valide === true,
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
});

test('retour sur l’onglet après navigation : le contrat reste affiché', () => {
  const session = sessionAvecContrat();

  // On quitte l'onglet (rendu du Plan) puis on y revient : l'état vient de la
  // session serveur, jamais d'un state local vidé au démontage.
  const surLePlan = session.data.plan;
  assert.ok(surLePlan, 'le plan existe pendant la navigation');
  assert.strictEqual(ecranProbleme(session).actionPrincipale, 'contrat');
});

test('rechargement de page (hydratation session) : contrat affiché sans regénération', () => {
  // Après refresh, la seule source est GET /api/sessions/:id : le contrat doit
  // être retrouvé tel quel, sans nouvel appel IA.
  const sessionRechargee = JSON.parse(JSON.stringify(sessionAvecContrat()));
  const ecran = ecranProbleme(sessionRechargee);

  assert.strictEqual(ecran.actionPrincipale, 'contrat');
  assert.match(ecran.problematique, /IA générative/);
  assert.strictEqual(ecran.valide, false, 'le contrat n’est pas validé d’office');
});

test('justification absente : encadré non bloquant, contrat toujours affiché', () => {
  const ecran = ecranProbleme(sessionAvecContrat());

  assert.strictEqual(ecran.justification, '');
  assert.strictEqual(ecran.encartJustification, true, 'l’encadré doit inviter à approfondir');
  assert.strictEqual(ecran.actionPrincipale, 'contrat', 'un secondaire vide ne cache pas le contrat');
  assert.ok(ecran.secondairesManquants.includes('justificationProbleme'));
});

test('session sans contrat : le bouton Générer reste l’action principale', () => {
  const session = sessionAvecContrat();
  session.data.contrat = {};

  assert.strictEqual(ecranProbleme(session).actionPrincipale, 'generer');
  assert.strictEqual(hasStepData(session, 'probleme'), false);
});

test('contrat validé : statut validé et Plan accessible', () => {
  const session = sessionAvecContrat();
  session.data.contrat.valide = true;

  const ecran = ecranProbleme(session);
  assert.strictEqual(ecran.valide, true);
  assert.strictEqual(contratValide(session), true);
  assert.strictEqual(ecran.planAccessible, true, 'le plan reste accessible');
  assert.strictEqual(ecran.actionPrincipale, 'contrat');
});

test('aucune donnée persistée sous data.probleme : le contrat fait foi', () => {
  const session = sessionAvecContrat();

  // La clé historique `probleme` reste vide : c'est bien `contrat` qui porte le
  // contenu affiché, pas l'ancien format `formulations`.
  assert.deepStrictEqual(session.data.probleme, {});
  assert.strictEqual(hasStepData(session, 'probleme'), true);
});

test('régression : les autres étapes ne dépendent pas du contrat', () => {
  const session = sessionAvecContrat();

  assert.strictEqual(hasStepData(session, 'analyse'), true);
  assert.strictEqual(hasStepData(session, 'plan'), true);
  assert.strictEqual(hasStepData(session, 'glossaire'), false);
});
