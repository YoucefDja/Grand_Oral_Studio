const test = require('node:test');
const assert = require('node:assert');

const {
  parseAndValidateContract,
  retirerFences,
  extrairePremierObjet,
  ERREUR_JSON,
  ERREUR_SCHEMA,
} = require('../contratParsing');

/** Contrat de référence conforme au schéma attendu par la Passe A. */
function contratBrut() {
  return {
    sujet: 'La transformation digitale des PME industrielles',
    motsCles: [{ mot: 'transformation digitale', definition: 'Passage des processus au numérique.' }],
    contexte: [{ fait: '62 % des PME jugent leur outil inadapté', source: 'INSEE 2024' }],
    tension:
      "Les PME doivent se numériser, mais leurs équipes manquent de compétences et le budget est déjà consommé par le maintien du système existant.",
    problematique:
      "Dans quelle mesure une PME industrielle peut-elle engager sa transformation digitale sans recruter de profil informatique dédié ?",
    justificationProbleme:
      "Le sujet devient un problème d'entreprise quand on regarde le coût du maintien du système et le délai de recrutement.",
    limitesExistant: ["Les ERP existants couvrent la comptabilité mais pas le suivi de production."],
    preconisations: [{ action: 'Numériser le suivi de production par étapes', cible: 'PME' }],
    casEntreprises: [
      { nom: 'Cas A', chiffre: '48 %', angle: 'transformation bloquée', issue: 'succès', source: 'Source .md' },
      { nom: 'Cas B', chiffre: '3 ans', angle: 'échec de transformation', issue: 'echec', source: 'Source .md' },
    ],
    ligneDirectrice: 'La transformation digitale réussie passe par les compétences internes.',
    ouverture: 'Les PME sauront-elles former plutôt que recruter ?',
  };
}

// --- Cas 1 : JSON strict valide → contrat exploitable -----------------------
test('JSON strict valide : contrat accepté, aucune erreur', () => {
  const res = parseAndValidateContract(JSON.stringify(contratBrut()));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.contract.problematique, contratBrut().problematique);
});

// --- Cas 2 : fences Markdown → nettoyées ------------------------------------
test('JSON encadré de ```json … ``` : fences retirées, contrat accepté', () => {
  const encadre = '```json\n' + JSON.stringify(contratBrut()) + '\n```';
  const res = parseAndValidateContract(encadre);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.diagnostic.contientFence, true);
});

test('fence ouvrante sans fermeture (réponse tronquée) : contenu conservé', () => {
  const encadre = '```json\n' + JSON.stringify(contratBrut());
  const res = parseAndValidateContract(encadre);
  assert.strictEqual(res.ok, true);
});

test('retirerFences ne touche pas aux apostrophes françaises', () => {
  const texte = "```json\n{\"tension\":\"l'entreprise doit arbitrer\"}\n```";
  const nettoye = retirerFences(texte);
  assert.ok(nettoye.includes("l'entreprise"));
});

// --- Cas 3 : pseudo-JSON à guillemets simples → INVALID_LLM_JSON ------------
test("pseudo-JSON à apostrophes simples (cas du rapport) : INVALID_LLM_JSON, jamais 502", () => {
  const pseudo = "{ 'ligne_directrice': 'le fil rouge', 'formulation': '…' }";
  const res = parseAndValidateContract(pseudo);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_JSON);
  assert.match(res.internalReason, /pseudo-JSON/);
  // Le diagnostic porte un extrait court, mais celui-ci n'est jamais renvoyé au client.
  assert.ok(res.diagnostic.extrait.length <= 120);
});

test('JSON avec préfixe de prose : le premier objet équilibré est extrait', () => {
  const avecProse = 'Voici le contrat demandé :\n' + JSON.stringify(contratBrut()) + '\nBonne chance !';
  const res = parseAndValidateContract(avecProse);
  assert.strictEqual(res.ok, true);
});

test('prose pure sans objet : INVALID_LLM_JSON', () => {
  const res = parseAndValidateContract('Je ne peux pas générer ce contrat.');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_JSON);
});

// --- Cas 4 : texte / HTML / vide → erreur contrôlée, jamais 502 -------------
test('réponse vide : INVALID_LLM_JSON', () => {
  const res = parseAndValidateContract('');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_JSON);
});

test('réponse HTML (page d’erreur proxy) : INVALID_LLM_JSON', () => {
  const html = '<html><body><h1>502 Bad Gateway</h1></body></html>';
  const res = parseAndValidateContract(html);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_JSON);
});

test('affiche uniquement un diagnostic masqué (pas le contenu complet)', () => {
  const long = 'x'.repeat(5000);
  const res = parseAndValidateContract(long);
  assert.strictEqual(res.diagnostic.taille, 5000);
  assert.ok(res.diagnostic.extrait.length <= 120);
});

// --- Cas 5 : JSON valide mais champ manquant → INVALID_CONTRACT_SCHEMA ------
test('JSON valide sans problematique : INVALID_CONTRACT_SCHEMA', () => {
  const sansProblematique = contratBrut();
  delete sansProblematique.problematique;
  const res = parseAndValidateContract(JSON.stringify(sansProblematique));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_SCHEMA);
  assert.match(res.internalReason, /problematique/);
});

test('problematique non terminée par « ? » : INVALID_CONTRACT_SCHEMA', () => {
  const contrat = contratBrut();
  contrat.problematique = 'Une question sans point d’interrogation';
  const res = parseAndValidateContract(JSON.stringify(contrat));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_SCHEMA);
});

test('limitesExistant / preconisations non tableaux : normalisés, contrat accepté', () => {
  // Correctif Passe A : ces champs sont SECONDAIRES. Ils ne doivent plus
  // déclencher un rejet « tout ou rien » mais être ramenés à un tableau.
  const contrat = contratBrut();
  contrat.limitesExistant = 'une chaîne au lieu d’un tableau';
  contrat.preconisations = 'une chaîne au lieu d’un tableau';
  const res = parseAndValidateContract(JSON.stringify(contrat));
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.contract.limitesExistant, ['une chaîne au lieu d’un tableau']);
  assert.deepStrictEqual(res.contract.preconisations, ['une chaîne au lieu d’un tableau']);
});

// --- Cas 6 : tolérance aux champs secondaires (correctif Passe A) ----------
test('3 champs fondamentaux seuls : contrat accepté, secondaires normalisés à vide', () => {
  const minimal = {
    tension: "Les PME doivent se numériser mais n'ont ni budget ni compétence interne.",
    problematique:
      'Dans quelle mesure une PME peut-elle se numériser sans recruter un profil informatique dédié ?',
    justificationProbleme:
      "Le coût du maintien du système existant rend la transformation urgente pour les PME.",
  };
  const res = parseAndValidateContract(JSON.stringify(minimal));
  assert.strictEqual(res.ok, true);
  // Aucune clé `undefined` ne doit atteindre le frontend.
  assert.deepStrictEqual(res.contract.motsCles, []);
  assert.deepStrictEqual(res.contract.contexte, []);
  assert.deepStrictEqual(res.contract.limitesExistant, []);
  assert.deepStrictEqual(res.contract.preconisations, []);
  assert.deepStrictEqual(res.contract.casEntreprises, []);
  assert.strictEqual(res.contract.ligneDirectrice, '');
  assert.strictEqual(res.contract.ouverture, '');
  assert.strictEqual(res.contract.completeness.isCoreValid, true);
  assert.ok(res.contract.completeness.missingSecondaryFields.length > 0);
});

test('justificationProbleme absente : INVALID_CONTRACT_SCHEMA, champ bloquant journalisé', () => {
  const contrat = contratBrut();
  delete contrat.justificationProbleme;
  const res = parseAndValidateContract(JSON.stringify(contrat));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_SCHEMA);
  assert.ok(res.manquants.includes('justificationProbleme'));
  assert.strictEqual(res.coreFieldsPresent.justificationProbleme, false);
  assert.strictEqual(res.coreFieldsPresent.tension, true);
});

test('casEntreprises et ouverture absents : accepté, missingSecondaryFields renseigné', () => {
  const contrat = contratBrut();
  delete contrat.casEntreprises;
  delete contrat.ouverture;
  const res = parseAndValidateContract(JSON.stringify(contrat));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.contract.completeness.isCoreValid, true);
  assert.ok(res.contract.completeness.missingSecondaryFields.includes('casEntreprises'));
  assert.ok(res.contract.completeness.missingSecondaryFields.includes('ouverture'));
});

test('tableaux avec éléments nuls : filtrés sans crash', () => {
  const contrat = contratBrut();
  contrat.motsCles = [null, { mot: 'PME', definition: '' }, undefined, 42];
  contrat.preconisations = [null, undefined];
  const res = parseAndValidateContract(JSON.stringify(contrat));
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.contract.preconisations, []);
  assert.strictEqual(res.contract.motsCles.length, 1);
  assert.strictEqual(res.contract.motsCles[0].mot, 'PME');
});

test('champ mal typé mais convertible (nombre) : normalisé sans crash', () => {
  const contrat = contratBrut();
  contrat.ouverture = 42;
  contrat.limitesExistant = { texte: 'objet isolé' };
  const res = parseAndValidateContract(JSON.stringify(contrat));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.contract.ouverture, '42');
  assert.deepStrictEqual(res.contract.limitesExistant, [{ texte: 'objet isolé' }]);
});

test('completeness.message accompagne un contrat core incomplet', () => {
  const contrat = contratBrut();
  delete contrat.casEntreprises;
  const res = parseAndValidateContract(JSON.stringify(contrat));
  assert.strictEqual(res.ok, true);
  assert.match(res.contract.completeness.message, /exploitable/);
});

// --- Cas supplémentaire : alias `ligne_directrice` normalisé ---------------
test('alias ligne_directrice normalisé en ligneDirectrice', () => {
  const contrat = contratBrut();
  delete contrat.ligneDirectrice;
  contrat.ligne_directrice = 'le fil rouge';
  const res = parseAndValidateContract(JSON.stringify(contrat));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.contract.ligneDirectrice, 'le fil rouge');
  assert.strictEqual(res.contract.ligne_directrice, undefined);
});

// --- extrairePremierObjet : robustesse aux accolades dans les chaînes ------
test('extrairePremierObjet ignore les accolades situées dans une chaîne', () => {
  const texte = '{"a":"valeur avec } et {","b":1}';
  assert.strictEqual(extrairePremierObjet(texte), texte);
});
