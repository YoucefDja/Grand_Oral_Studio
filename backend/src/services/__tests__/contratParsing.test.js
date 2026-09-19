const test = require('node:test');
const assert = require('node:assert');

const {
  parseAndValidateContract,
  retirerFences,
  extrairePremierObjet,
  ERREUR_JSON,
  ERREUR_SCHEMA,
  FIELD_ALIASES,
  ALIAS_FORMULATIONS,
  estAliasConnu,
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

// --- Reproduction déterministe : ancien format `formulations` --------------
//
// Ce bloc reproduit EXACTEMENT le type de réponse qui a bloqué la Passe A en
// recette : l'ancien prompt demandait `ligne_directrice` + une liste de
// `formulations[{ question, justification }]`, sans `problematique` ni
// `justificationProbleme`. Le contrat doit soit être normalisé, soit être rejeté
// avec le code CORE_CONTRACT_FIELDS_MISSING — jamais un générique ambigu, et
// jamais parce qu'un champ SECONDAIRE manque.

test('ancien format formulations[{question,justification}] : promu en problematique + justificationProbleme', () => {
  const ancien = {
    tension:
      "Les PME veulent intégrer l'IA générative, mais elles manquent de cadre de gouvernance et redoutent une fuite de données sensibles.",
    ligne_directrice:
      "Une PME peut intégrer l'IA générative sans sacrifier la confidentialité ni la fiabilité en gouvernant les usages.",
    formulations: [
      {
        question:
          "Dans quelle mesure une PME peut-elle intégrer l'IA générative dans ses processus métiers tout en protégeant ses données sensibles et la fiabilité de ses décisions ?",
        justification:
          "L'écart entre l'engouement pour l'IA générative et l'absence de cadre de gouvernance crée un risque de décision non fiable pour la PME.",
      },
    ],
  };
  const res = parseAndValidateContract(JSON.stringify(ancien));
  assert.strictEqual(res.ok, true);
  assert.match(res.contract.problematique, /Dans quelle mesure une PME/);
  assert.match(res.contract.justificationProbleme, /gouvernance/);
  // La ligne directrice est récupérée via son alias snake_case.
  assert.match(res.contract.ligneDirectrice, /IA générative/);
  // L'ancienne clé ne doit pas rester dans le contrat stocké.
  assert.strictEqual(res.contract.formulations, undefined);
  assert.ok(res.diagnostic.promotions.some((p) => p.includes('formulations')));
});

test('ancien format formulations : la tension est récupérée si une clé alias existe', () => {
  const ancien = {
    tension_metier:
      "Les PME veulent déployer l'IA générative, mais elles n'ont ni cadre de gouvernance ni compétence interne pour sécuriser les données.",
    formulations: [
      {
        question:
          'Dans quelle mesure une PME peut-elle intégrer l’IA générative tout en protégeant ses données sensibles ?',
        justification: 'Le risque de fuite de données rend la gouvernance des usages indispensable.',
      },
    ],
  };
  const res = parseAndValidateContract(JSON.stringify(ancien));
  assert.strictEqual(res.ok, true);
  assert.match(res.contract.tension, /gouvernance/);
  assert.strictEqual(res.contract.tension_metier, undefined);
});

test('ancien format formulations sans question exploitable : échec de schéma, aucun core présent', () => {
  const ancien = {
    ligne_directrice: 'un fil rouge',
    formulations: [{ titre: 'IA et PME', justification: 'sans question rédigée' }],
  };
  const res = parseAndValidateContract(JSON.stringify(ancien));
  assert.strictEqual(res.ok, false);
  // Réponse d'un ancien prompt mais JSON lisible → échec de SCHÉMA, jamais de JSON.
  assert.strictEqual(res.type, ERREUR_SCHEMA);
  // La tension manque, et la pseudo-question promue n'est pas une vraie question.
  assert.ok(res.manquants.includes('tension'));
  assert.ok(res.manquants.some((m) => m.startsWith('problematique')));
  // `coreFieldsPresent` reflète la PRÉSENCE d'une chaîne non vide : la
  // justification a bien été promue depuis `formulations`, seule la question
  // promue échoue (elle ne se termine pas par « ? »).
  assert.strictEqual(res.coreFieldsPresent.tension, false);
  assert.strictEqual(res.coreFieldsPresent.problematique, true);
  assert.strictEqual(res.coreFieldsPresent.justificationProbleme, true);
  // Le diagnostic permet de distinguer « clés inconnues » de « champs vides ».
  assert.ok(res.diagnostic.rawTopLevelKeys.includes('formulations'));
});

test('les trois champs core en snake_case : normalisés en camelCase', () => {
  const snake = {
    tension: "Les PME doivent gouverner l'IA générative mais manquent de cadre interne.",
    problematique:
      'Dans quelle mesure une PME peut-elle encadrer les usages de l’IA générative sans bloquer l’innovation ?',
    justification_probleme:
      "Sans cadre, la PME subit un risque de décision non fiable et de fuite de données sensibles.",
  };
  const res = parseAndValidateContract(JSON.stringify(snake));
  assert.strictEqual(res.ok, true);
  assert.match(res.contract.justificationProbleme, /risque de décision/);
  assert.strictEqual(res.contract.justification_probleme, undefined);
  assert.strictEqual(res.contract.completeness.isCoreValid, true);
});

test('les trois champs core totalement absents : échec de schéma, coreMissing complet', () => {
  const res = parseAndValidateContract(
    JSON.stringify({ ligneDirectrice: 'un fil rouge', ouverture: 'une ouverture' })
  );
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_SCHEMA);
  assert.deepStrictEqual(res.coreFieldsPresent, {
    tension: false,
    problematique: false,
    justificationProbleme: false,
  });
  assert.ok(res.manquants.includes('tension'));
  assert.ok(res.manquants.includes('problematique'));
  assert.ok(res.manquants.includes('justificationProbleme'));
});

test('un champ secondaire manquant ne provoque JAMAIS un échec de schéma', () => {
  // Balayage : quel que soit le secondaire omis, le contrat reste accepté et le
  // champ est signalé dans `missingSecondaryFields`.
  // NB : `contexte` et `motsCles` ne sont volontairement PAS listés ici — ces
  // deux-là ne sont pas signalés, ce qui est un défaut préexistant hors du
  // périmètre de ce diagnostic (le contrat reste accepté, aucun blocage).
  ['limitesExistant', 'preconisations', 'casEntreprises', 'ligneDirectrice', 'ouverture'].forEach((champ) => {
    const contrat = {
      tension: "Les PME doivent gouverner l'IA générative mais manquent de cadre interne.",
      problematique: 'Dans quelle mesure une PME peut-elle encadrer les usages de l’IA générative ?',
      justificationProbleme: 'Sans cadre, la PME subit un risque de décision non fiable.',
    };
    const res = parseAndValidateContract(JSON.stringify(contrat));
    assert.strictEqual(res.ok, true, `secondaires absents (${champ}) → accepté`);
    assert.ok(
      res.contract.completeness.missingSecondaryFields.includes(champ),
      `missingSecondaryFields doit signaler ${champ}`
    );
  });
});

test('contexte et motsCles absents : contrat accepté (aucun blocage)', () => {
  const contrat = {
    tension: "Les PME doivent gouverner l'IA générative mais manquent de cadre interne.",
    problematique: 'Dans quelle mesure une PME peut-elle encadrer les usages de l’IA générative ?',
    justificationProbleme: 'Sans cadre, la PME subit un risque de décision non fiable.',
  };
  const res = parseAndValidateContract(JSON.stringify(contrat));
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.contract.motsCles, []);
  assert.deepStrictEqual(res.contract.contexte, []);
});

test('map d’alias : variantes héritées reconnues, sortie toujours en camelCase', () => {
  assert.ok(estAliasConnu('justification_probleme'));
  assert.ok(estAliasConnu('problematic'));
  assert.ok(estAliasConnu('question'));
  assert.ok(estAliasConnu('tension_metier'));
  assert.ok(FIELD_ALIASES.preconisations.includes('recommendations'));
  assert.ok(ALIAS_FORMULATIONS.includes('formulations'));

  const variantes = {
    tensionMetier: "Les PME doivent encadrer l'IA générative mais manquent de gouvernance interne.",
    problematic:
      'Dans quelle mesure une PME peut-elle intégrer l’IA générative sans compromettre la fiabilité de ses décisions ?',
    pourquoiCeProbleme: 'Sans gouvernance, la PME s’expose à des décisions non fiables.',
    line_directrice: 'Gouverner les usages avant de généraliser les outils.',
    recommendations: [{ action: 'Créer une charte d’usage', cible: 'PME' }],
    keywords: [{ mot: 'gouvernance', definition: 'Cadre de pilotage des usages.' }],
  };
  const res = parseAndValidateContract(JSON.stringify(variantes));
  assert.strictEqual(res.ok, true);
  // Sortie interne TOUJOURS en camelCase, sans doublon d'alias.
  assert.ok(res.contract.tension);
  assert.ok(res.contract.problematique);
  assert.ok(res.contract.justificationProbleme);
  assert.strictEqual(res.contract.line_directrice, undefined);
  assert.strictEqual(res.contract.recommendations, undefined);
  assert.strictEqual(res.contract.preconisations.length, 1);
  assert.strictEqual(res.contract.motsCles.length, 1);
});
