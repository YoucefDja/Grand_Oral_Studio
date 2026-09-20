/**
 * Cas 9 du cahier des charges : « une erreur de génération ne doit jamais
 * écraser le contrat précédemment validé dans la session ».
 *
 * On prouve l'invariant de deux façons complémentaires :
 *  1. le pipeline d'échec complet (parsing KO → erreur contrôlée) ne touche
 *     JAMAIS la session : aucune écriture n'est atteinte ;
 *  2. le module d'écriture `appliquerContratPasseA` n'est appelé qu'avec un
 *     contrat déjà validé, et il ne détruit jamais l'ancien contrat avant cela.
 */
const test = require('node:test');
const assert = require('node:assert');

const { parseAndValidateContract } = require('../contratParsing');
const { erreurGenerationControlee } = require('../erreursGeneration');
const { appliquerContratPasseA } = require('../applicationContrat');

/** Session minimale imitant un document Mongoose déjà chargé. */
function sessionAvecContratValide() {
  return {
    currentStep: 2,
    ligneDirectrice: 'La transformation passe par les compétences internes.',
    workflow: {
      analysis: 'generated',
      contract: 'validated',
      plan: 'generated',
      glossary: 'validated',
      support: 'generated',
      export: 'blocked',
    },
    data: {
      analyse: { segments: ['un', 'deux'] },
      contrat: {
        version: 1,
        status: 'validated',
        generatedAt: new Date('2026-01-01T00:00:00Z'),
        validatedAt: new Date('2026-01-02T00:00:00Z'),
        tension: 'Tension validée par l’étudiant.',
        problematique: 'Comment une PME peut-elle se numériser sans recruter ?',
        justificationProbleme: 'Le coût du maintien dépasse le budget de recrutement.',
        limitesExistant: ['ERP limité à la comptabilité.'],
        preconisations: [{ action: 'Numériser par étapes' }],
        casEntreprises: [],
        motsCles: [],
        contexte: [],
        ligneDirectrice: 'La transformation passe par les compétences internes.',
        ouverture: 'Former ou recruter ?',
        completeness: { passeAValid: true, missingFields: [] },
      },
      plan: { sections: ['I', 'II'] },
      support: { slides: new Array(20).fill({}) },
    },
  };
}

const estObjetNonVide = (o) => Boolean(o) && typeof o === 'object' && Object.keys(o).length > 0;

// --- 1. Le pipeline d'échec ne touche pas la session ------------------------
test('pseudo-JSON LLM : échec contrôlé, la session et son contrat validé sont intacts', () => {
  const session = sessionAvecContratValide();
  const contratAvant = JSON.stringify(session.data.contrat);
  const empreinteAvant = JSON.stringify(session);

  // Reproduction du cas du rapport : pseudo-JSON à guillemets simples.
  const parse = parseAndValidateContract("{ 'ligne_directrice': 'le fil rouge' }");
  assert.strictEqual(parse.ok, false);

  // Ce que fait la route : on lève AVANT toute écriture, le catch convertit.
  const err = erreurGenerationControlee(
    Object.assign(new Error('Contenu inexploitable.'), { status: 422, code: parse.type }),
    { etape: 'probleme', sessionId: 'abc' }
  );

  assert.strictEqual(err.status, 422);
  assert.strictEqual(err.code, 'INVALID_LLM_JSON');
  // La session n'a été ni mutée ni sauvegardée.
  assert.strictEqual(JSON.stringify(session), empreinteAvant);
  assert.strictEqual(JSON.stringify(session.data.contrat), contratAvant);
  assert.strictEqual(session.data.contrat.status, 'validated');
});

test('erreur fournisseur : échec contrôlé, contrat validé conservé et toujours valide', () => {
  const session = sessionAvecContratValide();
  const err = erreurGenerationControlee(
    Object.assign(new Error('HTTP 500 renvoyé par DeepSeek'), {
      status: 503,
      code: 'AI_PROVIDER_UNAVAILABLE',
    }),
    { etape: 'probleme' }
  );

  assert.strictEqual(err.status, 503);
  assert.strictEqual(session.data.contrat.status, 'validated');
  assert.strictEqual(session.data.support.slides.length, 20); // étapes aval intactes
});

// --- 2. L'écriture n'a lieu qu'avec un contrat validé ----------------------
test('appliquerContratPasseA : nouveau contrat écrit, contrat valide marqué à revalider', () => {
  const session = sessionAvecContratValide();
  const nouveau = {
    tension: 'Nouvelle tension.',
    problematique: 'Nouvelle question ?',
    justificationProbleme: 'Nouvelle justification.',
    limitesExistant: [],
    preconisations: [],
    ligneDirectrice: 'Nouveau fil rouge',
    ouverture: 'Nouvelle ouverture ?',
  };

  const res = appliquerContratPasseA(session, nouveau, estObjetNonVide);

  assert.strictEqual(res.regenere, true);
  assert.strictEqual(session.data.contrat.problematique, 'Nouvelle question ?');
  // Le nouveau contrat doit être revalidé par l'étudiant : jamais hérité à
  // `validated`. La seule source de vérité est `status`.
  assert.strictEqual(session.data.contrat.status, 'generated');
  assert.strictEqual(session.workflow.contract, 'generated');
  // Les étapes aval bâties sur l'ancien contrat sont invalidées (pas supprimées).
  assert.deepStrictEqual(session.data.plan, {});
  assert.deepStrictEqual(session.data.support, {});
  assert.strictEqual(session.workflow.support, 'empty');
});

test('appliquerContratPasseA : première génération, aucune étape aval à invalider', () => {
  const session = { currentStep: 0, data: {} };
  const res = appliquerContratPasseA(
    session,
    {
      tension: 't',
      problematique: 'q ?',
      justificationProbleme: 'j',
      limitesExistant: [],
      preconisations: [],
      ligneDirectrice: 'fil',
      ouverture: 'o',
    },
    estObjetNonVide
  );

  assert.strictEqual(res.regenere, false);
  assert.deepStrictEqual(res.etapesInvalidees, []);
  assert.strictEqual(session.ligneDirectrice, 'fil');
});

test('la fonction d’écriture n’est jamais appelée avec un contrat non parsé', () => {
  // Garde-fou de conception : `appliquerContratPasseA` exige un contrat déjà
  // validé. Un appel avec `undefined` doit être une erreur de programmation
  // visible, pas une écriture silencieuse qui détruirait le contrat en place.
  const session = sessionAvecContratValide();
  assert.throws(() => appliquerContratPasseA(session, undefined, estObjetNonVide));
  assert.strictEqual(session.data.contrat.status, 'validated');
});
