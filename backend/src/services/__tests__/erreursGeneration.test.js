const test = require('node:test');
const assert = require('node:assert');

const {
  httpError,
  erreurGenerationControlee,
  MESSAGES_ERREUR,
} = require('../erreursGeneration');

// --- Codes applicatifs : statut + message attendus --------------------------
test('INVALID_LLM_JSON → HTTP 422, message utilisateur simple', () => {
  const err = httpError(422, 'x', 'INVALID_LLM_JSON', "pseudo-JSON : { 'a': 1 }");
  const finale = erreurGenerationControlee(err, { etape: 'probleme', sessionId: 's1' });
  assert.strictEqual(finale.status, 422);
  assert.strictEqual(finale.code, 'INVALID_LLM_JSON');
  assert.strictEqual(finale.message, 'La génération a produit un format inexploitable. Réessayez.');
  // Le message ne contient NI extrait brut NI détail technique.
  assert.ok(!finale.message.includes('pseudo-JSON'));
  assert.ok(!finale.message.includes("'a'"));
});

test('INVALID_CONTRACT_SCHEMA → HTTP 422, message « contrat incomplet »', () => {
  const err = httpError(422, 'x', 'INVALID_CONTRACT_SCHEMA', 'champs manquants : problematique');
  const finale = erreurGenerationControlee(err, { etape: 'probleme' });
  assert.strictEqual(finale.status, 422);
  assert.strictEqual(finale.code, 'INVALID_CONTRACT_SCHEMA');
  assert.strictEqual(finale.message, 'Le contrat généré est incomplet. Réessayez.');
});

// --- Cas 6 : erreur fournisseur simulée → 503 AI_PROVIDER_UNAVAILABLE -------
test('erreur fournisseur IA simulée → HTTP 503 AI_PROVIDER_UNAVAILABLE', () => {
  const err = httpError(503, 'panne', 'AI_PROVIDER_UNAVAILABLE', 'HTTP 500 renvoyé par DeepSeek');
  const finale = erreurGenerationControlee(err, { etape: 'probleme', provider: 'deepseek' });
  assert.strictEqual(finale.status, 503);
  assert.strictEqual(finale.code, 'AI_PROVIDER_UNAVAILABLE');
  assert.strictEqual(
    finale.message,
    'Le service de génération est temporairement indisponible. Réessayez dans quelques instants.'
  );
});

// --- Cas 7 : timeout simulé → 504 AI_TIMEOUT -------------------------------
test('timeout fournisseur simulé → HTTP 504 AI_TIMEOUT', () => {
  const err = httpError(504, 'timeout', 'AI_TIMEOUT');
  const finale = erreurGenerationControlee(err, { etape: 'probleme', provider: 'deepseek' });
  assert.strictEqual(finale.status, 504);
  assert.strictEqual(finale.code, 'AI_TIMEOUT');
  assert.strictEqual(finale.message, 'La génération a pris trop de temps. Réessayez.');
});

// --- Jamais de 502 : un bug inattendu devient un 500 contrôlé --------------
test('erreur inattendue → HTTP 500 INTERNAL_ERROR, jamais 502', () => {
  const finale = erreurGenerationControlee(new TypeError('x is not a function'), { etape: 'probleme' });
  assert.strictEqual(finale.status, 500);
  assert.strictEqual(finale.code, 'INTERNAL_ERROR');
  assert.ok(finale.status !== 502);
});

test('aucun code retourné par erreurGenerationControlee n’est 502', () => {
  const cas = [
    new Error('brut'),
    httpError(502, 'ancien 502', 'LEGACY'),
    httpError(500, 'HTTP 500 fournisseur'),
    Object.assign(new Error('bad gateway'), { status: 502 }),
  ];
  cas.forEach((err) => {
    const finale = erreurGenerationControlee(err, { etape: 'probleme' });
    assert.notStrictEqual(finale.status, 502);
  });
});

// --- Les garde-fous statut < 500 restent inchangés --------------------------
test('erreur 404/400 de nos garde-fous : statut et message conservés', () => {
  const notFound = httpError(404, 'Session introuvable.');
  const finale = erreurGenerationControlee(notFound, { etape: 'probleme' });
  assert.strictEqual(finale.status, 404);
  assert.strictEqual(finale.message, 'Session introuvable.');
});

// --- Cohérence de la table des messages ------------------------------------
test('chaque code applicatif connu porte un statut et un message non vides', () => {
  Object.entries(MESSAGES_ERREUR).forEach(([code, cible]) => {
    assert.ok(Number.isInteger(cible.status), `${code} doit porter un statut entier`);
    assert.ok(typeof cible.message === 'string' && cible.message.trim(), `${code} doit porter un message`);
    assert.notStrictEqual(cible.status, 502, `${code} ne doit jamais être un 502`);
  });
});
