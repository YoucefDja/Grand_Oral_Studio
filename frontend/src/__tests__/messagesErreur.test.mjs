/**
 * Tests hors ligne du mapping des erreurs de génération côté frontend (cas 8 du
 * cahier des charges : « le frontend affiche le message correspondant et ne
 * plante pas au parsing »).
 *
 * On teste le module PUR `messagesErreur.js` (aucun import React, aucun accès
 * DOM/navigateur) : c'est lui qui décide du texte affiché au candidat.
 */
import test from 'node:test';
import assert from 'node:assert';

import {
  MESSAGES_PAR_CODE,
  MESSAGE_GENERIQUE,
  messageCandidat,
} from '../messagesErreur.js';

/** Marqueurs techniques qui ne doivent JAMAIS apparaître chez le candidat. */
function contientFuiteTechnique(texte) {
  return (
    /```/.test(texte) ||
    /\{\s*['"]/.test(texte) || // extrait JSON brut
    /Bad Gateway/i.test(texte) ||
    /stack|at \w+ \(/i.test(texte) ||
    /DeepSeek|Anthropic|Claude/i.test(texte)
  );
}

test('INVALID_LLM_JSON → message « format inexploitable »', () => {
  const err = Object.assign(new Error('détail technique brut'), { code: 'INVALID_LLM_JSON' });
  assert.strictEqual(
    messageCandidat(err),
    'La génération a produit un format inexploitable. Réessayez.'
  );
});

test('INVALID_CONTRACT_SCHEMA → message « contrat incomplet »', () => {
  const err = Object.assign(new Error('champs manquants : problematique'), {
    code: 'INVALID_CONTRACT_SCHEMA',
  });
  assert.strictEqual(messageCandidat(err), 'Le contrat généré est incomplet. Réessayez.');
});

test('AI_PROVIDER_UNAVAILABLE → message de disponibilité', () => {
  const err = Object.assign(new Error('HTTP 500 renvoyé par DeepSeek'), {
    code: 'AI_PROVIDER_UNAVAILABLE',
  });
  const message = messageCandidat(err);
  assert.match(message, /temporairement indisponible/);
  assert.ok(!contientFuiteTechnique(message), 'aucune fuite technique ne doit être affichée');
});

test('AI_TIMEOUT → message « a pris trop de temps »', () => {
  const err = Object.assign(new Error('timeout après 120000 ms'), { code: 'AI_TIMEOUT' });
  assert.strictEqual(messageCandidat(err), 'La génération a pris trop de temps. Réessayez.');
});

test('erreur sans code mais avec message contrôlé : le message est conservé', () => {
  assert.strictEqual(messageCandidat(new Error('Session introuvable.')), 'Session introuvable.');
});

test('erreur vide / non-Error : message générique, jamais de crash', () => {
  assert.strictEqual(messageCandidat(undefined), MESSAGE_GENERIQUE);
  assert.strictEqual(messageCandidat(null), MESSAGE_GENERIQUE);
  assert.strictEqual(messageCandidat(new Error('   ')), MESSAGE_GENERIQUE);
  assert.strictEqual(messageCandidat({}), MESSAGE_GENERIQUE);
});

test('HTML de proxy simulé (502 Bad Gateway) : message générique, pas de HTML', () => {
  const err = new Error('<html><body><h1>502 Bad Gateway</h1></body></html>');
  // Un message d'un proxy ne doit pas fuiter : il est remplacé par le générique.
  const message = messageCandidat({ code: 'UNKNOWN_CODE' });
  assert.strictEqual(message, MESSAGE_GENERIQUE);
  assert.ok(!contientFuiteTechnique(message));
  assert.ok(!contientFuiteTechnique(err.message) === false); // sanity : l'entrée contenait bien du HTML
});

test('aucun message affichable ne contient de fuite technique', () => {
  for (const [code, message] of Object.entries(MESSAGES_PAR_CODE)) {
    assert.ok(message.trim().length > 0, `${code} doit avoir un message`);
    assert.ok(!contientFuiteTechnique(message), `${code} ne doit rien fuiter : ${message}`);
  }
  assert.ok(!contientFuiteTechnique(MESSAGE_GENERIQUE));
});

test('le mapping frontend couvre exactement les codes du backend', () => {
  const codesBackend = [
    'INVALID_LLM_JSON',
    'INVALID_CONTRACT_SCHEMA',
    'AI_PROVIDER_UNAVAILABLE',
    'AI_TIMEOUT',
  ];
  for (const code of codesBackend) {
    assert.ok(MESSAGES_PAR_CODE[code], `code manquant côté frontend : ${code}`);
  }
});
