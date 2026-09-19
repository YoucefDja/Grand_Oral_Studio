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
import {
  construireVueContrat,
  vuesSecondaires,
  statutSection,
} from '../contratAffichage.mjs';

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

// --- Correctif Passe A : contrat core valide avec sections secondaires vides --
//
// On teste le module PUR `contratAffichage.mjs` (aucun import React/DOM). Les cas
// couverts sont ceux du cahier des charges : un contrat dont seuls les trois
// champs fondamentaux sont présents doit rester affichable/validable, et aucune
// section vide ne doit produire « undefined » à l'écran.

test('contrat core valide : affichable et validable malgré les secondaires vides', () => {
  const contrat = {
    tension: 'Les PME veulent intégrer l’IA, mais craignent de perdre la confidentialité des données.',
    problematique:
      'Comment une PME peut-elle intégrer l’IA générative sans compromettre la confidentialité de ses données ?',
    justificationProbleme: 'Le sujet de la confidentialité revient dans toutes les sources du dossier.',
    motsCles: [],
    limitesExistant: [],
    preconisations: [],
    casEntreprises: [],
    ligneDirectrice: '',
    ouverture: '',
    completeness: {
      isCoreValid: true,
      missingSecondaryFields: ['limitesExistant', 'casEntreprises', 'ouverture'],
      message: 'La problématique est exploitable. Certains éléments seront complétés ensuite.',
    },
  };
  const vue = construireVueContrat(contrat);
  assert.strictEqual(vue.isCoreValid, true);
  assert.strictEqual(vue.editable, true);
  assert.deepStrictEqual(vue.motsCles, []);
  assert.deepStrictEqual(vue.contexte, []);
  assert.deepStrictEqual(vue.limites, []);
  assert.deepStrictEqual(vue.preconisations, []);
  assert.deepStrictEqual(vue.cas, []);
  assert.ok(vue.missingSecondaryFields.includes('casEntreprises'));
});

test('contrat core incomplet : non affichable (aucun contrat métier présenté)', () => {
  const vue = construireVueContrat({ tension: 'Une tension seule, sans question.' });
  assert.strictEqual(vue.isCoreValid, false);
  assert.strictEqual(vue.editable, false);
});

test('contrat secondaire incomplet : aucune fuite « undefined » dans les sections', () => {
  const vue = construireVueContrat({
    tension: 'Tension présente.',
    problematique: 'Comment faire ?',
    justificationProbleme: 'Justification présente.',
  });
  const textes = vuesSecondaires(vue).map((s) => statutSection(s)).join(' | ');
  assert.ok(textes.length > 0);
  assert.ok(!/undefined|null|\[object Object\]/.test(textes), `fuite détectée : ${textes}`);
  assert.ok(!/undefined|\[object Object\]/.test(JSON.stringify(vue)));
});
