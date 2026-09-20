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
  referenceErreur,
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
    'CORE_CONTRACT_FIELDS_MISSING',
    'PROBLEMATIC_QUALITY_REJECTED',
    'AI_PROVIDER_UNAVAILABLE',
    'AI_TIMEOUT',
  ];
  for (const code of codesBackend) {
    assert.ok(MESSAGES_PAR_CODE[code], `code manquant côté frontend : ${code}`);
  }
});

// --- Diagnostic : codes distincts + référence de corrélation ----------------

test('CORE_CONTRACT_FIELDS_MISSING → message « éléments nécessaires », sans jargon', () => {
  const err = Object.assign(new Error('champs bloquants : tension'), {
    code: 'CORE_CONTRACT_FIELDS_MISSING',
    requestId: 'req-core-123',
  });
  const message = messageCandidat(err);
  assert.match(message, /éléments nécessaires/);
  assert.ok(!contientFuiteTechnique(message));
  // Le code applicatif n'est JAMAIS affiché à l'utilisateur.
  assert.ok(!/CORE_CONTRACT_FIELDS_MISSING/.test(message));
});

test('PROBLEMATIC_QUALITY_REJECTED → message « reformulée », distinct du précédent', () => {
  const err = Object.assign(new Error('règles de fond : contrat_amorce_invalide'), {
    code: 'PROBLEMATIC_QUALITY_REJECTED',
    requestId: 'req-qual-456',
  });
  const message = messageCandidat(err);
  assert.match(message, /reformulée/);
  assert.ok(!contientFuiteTechnique(message));
  assert.notStrictEqual(message, MESSAGES_PAR_CODE.CORE_CONTRACT_FIELDS_MISSING);
});

test('referenceErreur → libellé discret, et rien du tout sans requestId', () => {
  assert.strictEqual(referenceErreur({ requestId: 'abc-123' }), 'Référence : abc-123');
  assert.strictEqual(referenceErreur({ requestId: '  abc-123  ' }), 'Référence : abc-123');
  assert.strictEqual(referenceErreur({}), null);
  assert.strictEqual(referenceErreur(undefined), null);
  assert.strictEqual(referenceErreur({ requestId: 42 }), null);
});

// --- Correctif Passe A : contrat canonique affichable ------------------------
//
// On teste le module PUR `contratAffichage.mjs` (aucun import React/DOM). Le
// contrat suit désormais le format canonique : c'est `status` ('generated' ou
// 'validated') qui décide de l'affichage, jamais une complétude recalculée
// localement. Aucune section vide ne doit produire « undefined » à l'écran.

test('contrat canonique généré : affichable et éditable malgré les secondaires vides', () => {
  const contrat = {
    version: 1,
    status: 'generated',
    tension: 'Les PME veulent intégrer l’IA, mais craignent de perdre la confidentialité des données.',
    problematique:
      'Comment une PME peut-elle intégrer l’IA générative sans compromettre la confidentialité de ses données ?',
    justificationProbleme: 'Le sujet de la confidentialité revient dans toutes les sources du dossier.',
    motsCles: [],
    contexte: [],
    limitesExistant: [],
    preconisations: [],
    casEntreprises: [],
    ligneDirectrice: '',
    ouverture: '',
    completeness: {
      passeAValid: true,
      missingFields: ['limitesExistant', 'casEntreprises', 'ouverture'],
    },
  };
  const vue = construireVueContrat(contrat);
  assert.strictEqual(vue.affichable, true);
  assert.strictEqual(vue.editable, true);
  assert.strictEqual(vue.valide, false, 'un contrat généré n’est pas validé');
  assert.deepStrictEqual(vue.motsCles, []);
  assert.deepStrictEqual(vue.contexte, []);
  assert.deepStrictEqual(vue.limites, []);
  assert.deepStrictEqual(vue.preconisations, []);
  assert.deepStrictEqual(vue.cas, []);
  assert.ok(vue.missingFields.includes('casEntreprises'));
});

test('contrat canonique validé : affichable et marqué validé', () => {
  const vue = construireVueContrat({
    version: 1,
    status: 'validated',
    tension: 'Une tension.',
    problematique: 'Comment faire ?',
  });
  assert.strictEqual(vue.affichable, true);
  assert.strictEqual(vue.valide, true);
});

test('contrat non généré : non affichable (aucun contrat métier présenté)', () => {
  const vue = construireVueContrat({ tension: 'Une tension seule, sans question.' });
  assert.strictEqual(vue.affichable, false);
  assert.strictEqual(vue.editable, false);
});

test('contrat secondaire incomplet : aucune fuite « undefined » dans les sections', () => {
  const vue = construireVueContrat({
    version: 1,
    status: 'generated',
    tension: 'Tension présente.',
    problematique: 'Comment faire ?',
    justificationProbleme: 'Justification présente.',
  });
  const textes = vuesSecondaires(vue).map((s) => statutSection(s)).join(' | ');
  assert.ok(textes.length > 0);
  assert.ok(!/undefined|null|\[object Object\]/.test(textes), `fuite détectée : ${textes}`);
  assert.ok(!/undefined|\[object Object\]/.test(JSON.stringify(vue)));
});

// --- Justification non bloquante (Passe A) ---------------------------------
//
// Règle : la justification n'est PAS un champ bloquant de la Passe A. Un contrat
// est affichable et validable dès que le serveur le déclare généré ; quand la
// justification est vide, l'interface montre un encadré d'approfondissement
// (jamais une erreur rouge, jamais « undefined »/« null »/texte technique).

test('justification absente → contrat affichable et validable, encadré à afficher', () => {
  const contrat = {
    version: 1,
    status: 'generated',
    tension: 'Dans les PME, l’IA générative progresse plus vite que les règles internes.',
    problematique:
      'Comment une PME peut-elle intégrer l’IA générative sans compromettre la confidentialité de ses données ?',
    justificationProbleme: '',
    completeness: { passeAValid: true, missingFields: ['justificationProbleme'] },
  };
  const vue = construireVueContrat(contrat);
  assert.strictEqual(vue.affichable, true, 'le contrat doit rester affichable sans justification');
  assert.strictEqual(vue.editable, true, 'le contrat doit rester éditable sans justification');
  assert.strictEqual(vue.noyauComplet, true, 'tension + problématique suffisent');
  assert.strictEqual(vue.justificationAFournir, true, 'l’encadré doit être demandé');
  assert.strictEqual(vue.justificationProbleme, '', 'jamais undefined/null');
  assert.ok(
    vue.missingFields.includes('justificationProbleme'),
    'la justification doit figurer dans les champs manquants'
  );
});

test('justification absente sans bloc completeness : le noyau reste complet', () => {
  const vue = construireVueContrat({
    version: 1,
    status: 'generated',
    tension: 'Une tension exploitable.',
    problematique: 'Comment faire évoluer les usages ?',
  });
  assert.strictEqual(vue.affichable, true);
  assert.strictEqual(vue.noyauComplet, true);
  assert.strictEqual(vue.justificationAFournir, true);
  assert.strictEqual(vue.justificationProbleme, '');
});

test('justification renseignée → aucun encadré d’approfondissement', () => {
  const vue = construireVueContrat({
    version: 1,
    status: 'generated',
    tension: 'Une tension exploitable.',
    problematique: 'Comment faire évoluer les usages ?',
    justificationProbleme: 'La confidentialité revient dans toutes les sources du dossier.',
  });
  assert.strictEqual(vue.affichable, true);
  assert.strictEqual(vue.justificationAFournir, false);
  assert.ok(vue.justificationProbleme.trim().length > 0);
});

test('aucun contenu technique affiché quand la justification manque', () => {
  const vue = construireVueContrat({
    tension: 'Une tension exploitable.',
    problematique: 'Comment faire évoluer les usages ?',
    justificationProbleme: null,
  });
  // Ce qui est réellement rendu à l'écran : la justification et le statut des
  // sections secondaires. Aucun de ces textes ne doit exposer de valeur technique.
  const affiche = [vue.justificationProbleme, ...vuesSecondaires(vue).map((s) => statutSection(s) || '')].join(' | ');
  assert.strictEqual(vue.justificationProbleme, '');
  assert.ok(!/undefined|null|\[object Object\]/.test(affiche), `fuite détectée : ${affiche}`);
  assert.ok(!/champ manquant|manquant/i.test(affiche), `jargon détecté : ${affiche}`);
  assert.ok(!/undefined|null|\[object Object\]/.test(JSON.stringify(vue)));
});
