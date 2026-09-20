const test = require('node:test');
const assert = require('node:assert');

const {
  parseAndValidateContract,
  validatePasseAContract,
  retirerFences,
  extrairePremierObjet,
  ERREUR_JSON,
  ERREUR_SCHEMA,
  FIELD_ALIASES,
  ALIAS_FORMULATIONS,
  estAliasConnu,
  extraireTensionAnalyse,
  CHAMP_JUSTIFICATION_RECOMMANDATION,
} = require('../contratParsing');
const { verifierContrat, REJETS_CORE } = require('../contratVerification');

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

test('justificationProbleme absente : contrat ACCEPTÉ, champ secondaire signalé (jamais bloquant)', () => {
  const contrat = contratBrut();
  delete contrat.justificationProbleme;
  const res = parseAndValidateContract(JSON.stringify(contrat));
  // Régression historique corrigée : la justification est facultative à l'étape
  // Passe A. Son absence ne doit JAMAIS produire de rejet 422.
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.type, undefined);
  assert.strictEqual(res.contract.completeness.isCoreValid, true);
  assert.ok(res.contract.completeness.missingSecondaryFields.includes('justificationProbleme'));
  // Jamais `undefined` ni `null` : une chaîne vide, affichable.
  assert.strictEqual(res.contract.justificationProbleme, '');
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
  // La tension manque. Un simple intitulé n'est PAS une question : il n'est pas
  // promu, et une justification SANS question ne peut pas débloquer le core.
  assert.ok(res.manquants.includes('tension'));
  assert.ok(res.manquants.includes('problematique'));
  // La justification est secondaire : elle est signalée, jamais bloquante.
  assert.strictEqual(res.manquants.includes('justificationProbleme'), false);
  assert.strictEqual(res.coreFieldsPresent.core.tension, false);
  assert.strictEqual(res.coreFieldsPresent.core.problematique, false);
  assert.strictEqual(res.coreFieldsPresent.optional.justificationProbleme, false);
  // Aucune formulation n'a été retenue : la provenance le dit explicitement.
  assert.strictEqual(res.diagnostic.justificationSource, 'missing');
  assert.strictEqual(res.diagnostic.formulationCount, 1);
  assert.strictEqual(res.diagnostic.formulationIndexUsed, null);
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

test('les deux champs du noyau totalement absents : échec de schéma, coreMissing complet', () => {
  const res = parseAndValidateContract(
    JSON.stringify({ ligneDirectrice: 'un fil rouge', ouverture: 'une ouverture' })
  );
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_SCHEMA);
  assert.deepStrictEqual(res.coreFieldsPresent, {
    core: { tension: false, problematique: false },
    optional: { justificationProbleme: false },
  });
  assert.ok(res.manquants.includes('tension'));
  assert.ok(res.manquants.includes('problematique'));
  // La justification n'est JAMAIS un motif de rejet à cette étape.
  assert.strictEqual(res.manquants.includes('justificationProbleme'), false);
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

// --- Format réellement observé en production (log Railway) ------------------
// Le modèle renvoie `ligne_directrice` + `formulations` + `recommandation` +
// `justification_recommandation` : la question est dans `formulations[*].question`
// et la justification dans la même formulation. La tension, elle, n'est pas dans
// la réponse : elle est reprise de l'analyse déjà validée de la session.
// Fixtures anonymisées : aucun sujet réel, aucune donnée de session de recette.

/** Réponse Passe A telle que produite en production (structure, pas contenu réel). */
function contratFormatProduction() {
  return {
    ligne_directrice: 'Cadrer les usages avant de généraliser les outils.',
    formulations: [
      {
        question:
          'Dans quelle mesure une PME peut-elle intégrer l’IA générative dans ses processus métiers tout en protégeant ses données sensibles et la fiabilité de ses décisions ?',
        justification:
          'Les PME doivent concilier gains de productivité, confidentialité des données et fiabilité des décisions, avec peu de ressources internes.',
      },
    ],
    recommandation: 'Établir une charte d’usage et une revue des cas à risque.',
    justification_recommandation: 'Une charte rend les usages traçables et arbitrables.',
  };
}

/** Analyse de session : la tension y est déjà écrite, on ne fait que la reprendre. */
function analyseAvecTension() {
  return {
    tensions: [
      'Recherche de gains rapides contre maîtrise de la confidentialité et de la fiabilité.',
    ],
  };
}

// --- Cas 1 : format réel + analyse porteuse de tensions ---------------------
test('cas 1 — format réel : problematique et justification depuis formulations, tension depuis l’analyse', () => {
  const raw = contratFormatProduction();
  const res = parseAndValidateContract(JSON.stringify(raw), { analyse: analyseAvecTension() });

  assert.strictEqual(res.ok, true, 'le contrat doit être accepté');
  // Aucun rejet CORE_CONTRACT_FIELDS_MISSING : le type d'échec n'existe plus.
  assert.strictEqual(res.type, undefined);
  assert.deepStrictEqual(res.manquants, undefined);
  assert.deepStrictEqual(res.coreFieldsPresent, undefined);

  // Provenances, jamais les contenus.
  assert.strictEqual(res.diagnostic.tensionSource, 'analysis');
  assert.strictEqual(res.diagnostic.justificationSource, 'formulation');

  // La problématique et la justification viennent de la formulation complète.
  assert.strictEqual(res.contract.problematique, raw.formulations[0].question);
  assert.strictEqual(res.contract.justificationProbleme, raw.formulations[0].justification);
  // La tension est celle de l'analyse, mot pour mot.
  assert.strictEqual(res.contract.tension, analyseAvecTension().tensions[0]);

  // La ligne directrice reconstruite est bien récupérée de son alias snake_case.
  assert.strictEqual(res.contract.ligneDirectrice, raw.ligne_directrice);
  // `justification_recommandation` reste un champ SECONDAIRE : jamais promu.
  assert.notStrictEqual(res.contract.justificationProbleme, raw.justification_recommandation);
  assert.strictEqual(
    res.contract[CHAMP_JUSTIFICATION_RECOMMANDATION],
    raw.justification_recommandation
  );
  // Les clés de l'ancien format ne polluent pas le contrat stocké.
  assert.strictEqual(res.contract.formulations, undefined);
  assert.strictEqual(res.contract.ligne_directrice, undefined);
  assert.strictEqual(res.contract.justification_recommandation, undefined);

  assert.strictEqual(res.contract.completeness.isCoreValid, true);
  assert.ok(res.diagnostic.promotions.includes('tension←analyse'));
});

// --- Cas 2 : formulations[0] incomplète, formulations[1] complète -----------
test('cas 2 — la première formulation n’a qu’une question : la complète est retenue', () => {
  const raw = {
    tension: 'Les PME veulent avancer vite mais redoutent une décision non fiable.',
    formulations: [
      { question: 'L’IA générative peut-elle aider une PME à gagner du temps ?' },
      {
        question:
          'Dans quelle mesure une PME peut-elle intégrer l’IA générative tout en protégeant la fiabilité de ses décisions ?',
        justification:
          'Sans cadre, la PME arbitre entre vitesse et fiabilité sans garde-fou documenté.',
      },
    ],
  };
  const res = parseAndValidateContract(JSON.stringify(raw));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.diagnostic.formulationCount, 2);
  // On ne s'arrête PAS à formulations[0] : l'index retenu est celui de la
  // formulation qui porte effectivement question + justification.
  assert.strictEqual(res.diagnostic.formulationIndexUsed, 1);
  assert.strictEqual(res.contract.problematique, raw.formulations[1].question);
  assert.strictEqual(res.contract.justificationProbleme, raw.formulations[1].justification);
  assert.strictEqual(res.diagnostic.justificationSource, 'formulation');
});

// --- Cas 3 : question sans justification dans TOUTES les formulations -------
// Exigence « justification non bloquante » : c'est le cas EXACT du log Railway.
// La question et la tension suffisent, la justification reste à approfondir.
test('cas 3 — questions sans justification : contrat ACCEPTÉ, justification à approfondir', () => {
  const raw = {
    tension: 'Les PME veulent industrialiser l’IA mais manquent de cadre interne.',
    formulations: [
      { question: 'Comment une PME peut-elle encadrer les usages de l’IA générative ?' },
      { question: 'Quels garde-fous une PME peut-elle poser sur ses données sensibles ?' },
    ],
  };
  const res = parseAndValidateContract(JSON.stringify(raw), { analyse: analyseAvecTension() });
  assert.strictEqual(res.ok, true);
  // Aucun rejet de type CORE_CONTRACT_FIELDS_MISSING : la question est produite.
  assert.strictEqual(res.type, undefined);
  assert.strictEqual(res.manquants, undefined);
  assert.strictEqual(res.contract.completeness.isCoreValid, true);
  assert.ok(res.contract.completeness.missingSecondaryFields.includes('justificationProbleme'));
  // La question est promue, la justification reste vide (jamais `undefined`).
  assert.strictEqual(res.contract.problematique, raw.formulations[0].question);
  assert.strictEqual(res.contract.justificationProbleme, '');
  // La tension était dans le contrat : l'analyse n'a PAS à être sollicitée.
  assert.strictEqual(res.diagnostic.tensionSource, 'contract');
  assert.strictEqual(res.diagnostic.justificationSource, 'missing');
  assert.strictEqual(res.diagnostic.formulationIndexUsed, null);
});

// --- Cas 4 : justification canonique à la racine, prioritaire ---------------
test('cas 4 — justificationProbleme à la racine : prioritaire sur la formulation', () => {
  const raw = {
    tension: 'Les PME doivent cadrer l’IA générative sans brider leurs équipes.',
    problematique: 'Comment une PME peut-elle cadrer les usages de l’IA générative sans brider ses équipes ?',
    justificationProbleme: 'Sans cadre, chaque service outille son IA en silo : le risque devient systémique.',
    formulations: [
      {
        question: 'Dans quelle mesure une PME peut-elle cadrer les usages de l’IA générative ?',
        justification: 'Texte de la formulation qui ne doit PAS gagner.',
      },
    ],
  };
  const res = parseAndValidateContract(JSON.stringify(raw));
  assert.strictEqual(res.ok, true);
  // Le core canonique de la racine est conservé MOT POUR MOT.
  assert.strictEqual(res.contract.justificationProbleme, raw.justificationProbleme);
  assert.strictEqual(res.contract.problematique, raw.problematique);
  assert.strictEqual(res.diagnostic.justificationSource, 'contract');
  // La formulation n'écrase JAMAIS le core déjà présent à la racine.
  assert.notStrictEqual(res.contract.justificationProbleme, raw.formulations[0].justification);
  assert.notStrictEqual(res.contract.problematique, raw.formulations[0].question);
});

// --- Cas 5 : tension absente du contrat ET de l'analyse ---------------------
test('cas 5 — tension absente partout : rejet de schéma, tensionSource missing', () => {
  const raw = {
    formulations: [
      {
        question:
          'Dans quelle mesure une PME peut-elle intégrer l’IA générative tout en protégeant ses données sensibles ?',
        justification: 'La PME doit tenir la vitesse d’adoption et la maîtrise des données avec peu de ressources.',
      },
    ],
  };
  // Analyse présente mais SANS aucune structure de tension ni de contradiction.
  const analyse = { sujets: ['usages de l’IA générative'], contexte: [] };
  const res = parseAndValidateContract(JSON.stringify(raw), { analyse });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_SCHEMA);
  assert.ok(res.manquants.includes('tension'));
  assert.strictEqual(res.coreFieldsPresent.core.tension, false);
  assert.strictEqual(res.diagnostic.tensionSource, 'missing');
  // Aucune tension n'a été inventée : le champ reste vide.
  assert.strictEqual(res.contract, undefined);
});

test('cas 5bis — analyse absente : même rejet explicite, tensionSource missing', () => {
  const res = parseAndValidateContract(JSON.stringify(contratFormatProduction()));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_SCHEMA);
  assert.deepStrictEqual(res.manquants, ['tension']);
  assert.strictEqual(res.diagnostic.tensionSource, 'missing');
  // La justification, elle, a bien été récupérée de la formulation.
  assert.strictEqual(res.coreFieldsPresent.optional.justificationProbleme, true);
  assert.strictEqual(res.diagnostic.justificationSource, 'formulation');
});

test('extraireTensionAnalyse : prend le premier texte réel, ignore le reste', () => {
  // Objets riches : la clé texte reconnue est lue, elle n'est pas reformulée.
  assert.strictEqual(
    extraireTensionAnalyse({ contradictions: [{ texte: 'Croissance contre maîtrise du risque.' }] }),
    'Croissance contre maîtrise du risque.'
  );
  assert.strictEqual(
    extraireTensionAnalyse({ enjeux: [{ label: 'Souveraineté des données' }] }),
    'Souveraineté des données'
  );
  assert.strictEqual(
    extraireTensionAnalyse({ tensionsContradictions: ['   '] }),
    null
  );
  assert.strictEqual(extraireTensionAnalyse({ autreChamp: ['du texte libre'] }), null);
  assert.strictEqual(extraireTensionAnalyse(null), null);
  assert.strictEqual(extraireTensionAnalyse('texte brut'), null);
});

// --- Cas 6 : core récupéré mais question de mauvaise qualité ----------------
// Le parseur a fait son travail (core complet) : le rejet éventuel de qualité
// appartient à contratVerification, qui renvoie PROBLEMATIC_QUALITY_REJECTED.
test('cas 6 — core récupéré mais question invalide : le core passe, la qualité tranche', () => {
  // AUCUNE tension dans la réponse : elle vient de l'analyse, comme en production.
  const raw = {
    formulations: [
      {
        question: 'L’IA générative est-elle utile en PME ?',
        justification: 'Les PME n’ont pas de cadre pour arbitrer entre vitesse et confidentialité.',
      },
    ],
  };
  const res = parseAndValidateContract(JSON.stringify(raw), { analyse: analyseAvecTension() });
  // Le schéma est satisfait : la question, malgré sa forme, est bien une question.
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.contract.completeness.isCoreValid, true);
  assert.strictEqual(res.diagnostic.justificationSource, 'formulation');
  assert.strictEqual(res.diagnostic.tensionSource, 'analysis');

  // C'est le juge du FOND qui refuse, avec son code dédié — jamais
  // CORE_CONTRACT_FIELDS_MISSING (le core est présent).
  const verdict = verifierContrat({
    sujet: 'L’IA générative dans les processus métiers des PME',
    contrat: res.contract,
    mode: 'creation',
  });
  assert.strictEqual(verdict.coreValide, false);
  assert.ok(
    verdict.rejetsCore.some((r) => REJETS_CORE.has(r.code)),
    `un rejet core est attendu, obtenu : ${JSON.stringify(verdict.rejetsCore.map((r) => r.code))}`
  );
  // La question ne s'ouvre sur aucune amorce recevable : c'est un rejet de
  // qualité, distinct d'un champ core manquant.
  assert.ok(verdict.rejetsCore.some((r) => r.code === 'contrat_amorce_invalide'));
  assert.strictEqual(verdict.rejetsCore.some((r) => r.code === 'contrat_question_absente'), false);
  assert.strictEqual(verdict.rejetsCore.some((r) => r.code === 'contrat_tension_absente'), false);
  assert.strictEqual(verdict.rejetsCore.some((r) => r.code === 'contrat_justification_absente'), false);
});

test('cas 6bis — copie du sujet en mode strict : rejet core, jamais un rejet de champs manquants', () => {
  const sujet = 'La transformation digitale des PME industrielles';
  const raw = {
    tension: 'Les PME veulent se numériser mais leurs équipes manquent de compétences.',
    formulations: [
      {
        question: `${sujet} ?`,
        justification: 'Les PME industrielles n’ont ni profil informatique dédié ni budget disponible.',
      },
    ],
  };
  const res = parseAndValidateContract(JSON.stringify(raw), { analyse: analyseAvecTension() });
  assert.strictEqual(res.ok, true);
  // En RÉGÉNÉRATION (mode strict), la copie du sujet redevient un rejet bloquant.
  const verdict = verifierContrat({ sujet, contrat: res.contract, mode: 'regeneration' });
  assert.strictEqual(verdict.coreValide, false);
  assert.ok(verdict.rejetsCore.some((r) => r.code === 'contrat_copie_sujet'));
  // Les trois core sont présents : le rejet porte sur la qualité, pas sur un manque.
  assert.strictEqual(res.coreFieldsPresent, undefined); // ok === true
  assert.ok(res.contract.tension && res.contract.problematique && res.contract.justificationProbleme);
});

// ---------------------------------------------------------------------------
// Exigence « justification non bloquante » — noyau de Passe A = tension +
// problématique. La justification devient FACULTATIVE à cette étape ; son
// contrôle strict est déplacé à la vérification pré-export.
// ---------------------------------------------------------------------------

test('exigence 1 — tension + problématique sans justification : ACCEPTÉ, core valide, secondaire signalé', () => {
  const raw = {
    formulations: [
      {
        question:
          'Dans quelle mesure une PME peut-elle intégrer l’IA générative tout en protégeant ses données sensibles ?',
      },
    ],
    ligne_directrice: 'Cadrer les usages avant de généraliser les outils.',
  };
  const res = parseAndValidateContract(JSON.stringify(raw), { analyse: analyseAvecTension() });

  // HTTP 200 côté route : le parseur doit accepter, jamais rejeter.
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.type, undefined);
  assert.strictEqual(res.manquants, undefined);
  // Contrat affichable : les deux champs du noyau sont là.
  assert.ok(res.contract.tension);
  assert.strictEqual(res.contract.problematique, raw.formulations[0].question);
  // Complétude : core valide, justification listée comme champ secondaire.
  assert.strictEqual(res.contract.completeness.isCoreValid, true);
  assert.ok(res.contract.completeness.missingSecondaryFields.includes('justificationProbleme'));
  // Jamais `undefined` / `null` : une chaîne vide affichable par le frontend.
  assert.strictEqual(res.contract.justificationProbleme, '');
  // Provenances attendues, identiques au log Railway.
  assert.strictEqual(res.diagnostic.tensionSource, 'analysis');
  assert.strictEqual(res.diagnostic.justificationSource, 'missing');
});

test('exigence 2 — tension + problématique + justification : ACCEPTÉ, aucune justification manquante', () => {
  const raw = {
    formulations: [
      {
        question:
          'Dans quelle mesure une PME peut-elle intégrer l’IA générative tout en protégeant ses données sensibles ?',
        justification:
          'Sans cadre, la PME arbitre entre vitesse d’adoption et fiabilité de ses décisions, sans garde-fou documenté.',
      },
    ],
  };
  const res = parseAndValidateContract(JSON.stringify(raw), { analyse: analyseAvecTension() });

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.contract.completeness.isCoreValid, true);
  assert.strictEqual(
    res.contract.completeness.missingSecondaryFields.includes('justificationProbleme'),
    false
  );
  assert.strictEqual(res.contract.justificationProbleme, raw.formulations[0].justification);
});

test('exigence 3 — problématique présente mais tension absente partout : REJET de schéma', () => {
  const raw = {
    formulations: [
      {
        question:
          'Dans quelle mesure une PME peut-elle intégrer l’IA générative tout en protégeant ses données sensibles ?',
        justification: 'Sans cadre, la PME subit un risque de décision non fiable.',
      },
    ],
  };
  // Analyse présente mais SANS tension exploitable : aucun repli possible.
  const res = parseAndValidateContract(JSON.stringify(raw), {
    analyse: { sujets: ['usages de l’IA générative'] },
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_SCHEMA);
  assert.ok(res.manquants.includes('tension'));
  assert.strictEqual(res.coreFieldsPresent.core.problematique, true);
  // Sans le noyau complet, le contrat ne part pas : la route lève un 422.
  assert.strictEqual(res.contract, undefined);
});

test('exigence 4 — tension présente mais problématique absente : REJET de schéma', () => {
  const raw = {
    tension: 'Les PME veulent industrialiser l’IA mais manquent de cadre interne.',
    justificatif: 'Champ inconnu qui ne doit pas être promu.',
  };
  const res = parseAndValidateContract(JSON.stringify(raw), { analyse: analyseAvecTension() });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_SCHEMA);
  assert.ok(res.manquants.includes('problematique'));
  assert.strictEqual(res.coreFieldsPresent.core.tension, true);
  assert.strictEqual(res.coreFieldsPresent.core.problematique, false);
});

test('exigence 4bis — problématique sans « ? » : REJET de schéma, jamais masqué par la justification', () => {
  const raw = {
    tension: 'Les PME veulent industrialiser l’IA mais manquent de cadre interne.',
    problematique: 'Comment une PME peut-elle encadrer les usages de l’IA générative',
    justificationProbleme: 'Sans cadre, le risque de décision non fiable augmente.',
  };
  const res = parseAndValidateContract(JSON.stringify(raw));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.type, ERREUR_SCHEMA);
  assert.ok(res.manquants.some((m) => m.startsWith('problematique')));
});

test('exigence 5 — la justification absente ne fait plus partie des rejets CORE', () => {
  assert.strictEqual(REJETS_CORE.has('contrat_justification_absente'), false);
  assert.strictEqual(REJETS_CORE.has('contrat_tension_absente'), true);
  assert.strictEqual(REJETS_CORE.has('contrat_question_absente'), true);

  // Le juge du FOND ne rejette plus la justification : il l'avertit.
  const verdict = verifierContrat({
    sujet: 'L’IA générative dans les processus métiers des PME',
    contrat: {
      tension:
        'Dans les PME, l’IA générative progresse plus vite que les règles internes, ce qui expose les usages à des décisions non fiables.',
      problematique:
        'Dans quelle mesure une PME peut-elle encadrer les usages de l’IA générative sans bloquer l’innovation ?',
      justificationProbleme: '',
      motsCles: [{ mot: 'IA générative', definition: 'Modèles générateurs de contenu.' }],
    },
    mode: 'creation',
  });
  assert.strictEqual(verdict.coreValide, true);
  assert.strictEqual(
    verdict.rejetsCore.some((r) => r.code === 'contrat_justification_absente'),
    false
  );
  assert.ok(
    verdict.avertissements.some((a) => /justification/i.test(a)),
    `un avertissement sur la justification est attendu, obtenu : ${JSON.stringify(verdict.avertissements)}`
  );
});

// ---------------------------------------------------------------------------
// SOURCE DE VÉRITÉ UNIQUE — `validatePasseAContract`.
//
// Le log Railway requestId a12e994b montrait une contradiction interne :
// `schemaStatus = core_valid_justification_pending` (contrat normalisé valide)
// coexistait avec un `422 CORE_CONTRACT_FIELDS_MISSING` dont le champ manquant
// était `justificationProbleme`. Cause : la route refaisait sa propre liste de
// champs obligatoires APRÈS le parseur. Le noyau bloquant est désormais jugé par
// cette seule fonction, appliquée au contrat normalisé final.
// ---------------------------------------------------------------------------

test('validatePasseAContract — tension + problématique, justification absente : core valide', () => {
  const verdict = validatePasseAContract({
    tension: 'Les PME encadrent mal les usages de l’IA générative.',
    problematique: 'Comment une PME peut-elle encadrer les usages de l’IA générative ?',
    justificationProbleme: '',
    completeness: { missingSecondaryFields: ['justificationProbleme'] },
  });

  assert.strictEqual(verdict.isCoreValid, true);
  assert.deepStrictEqual(verdict.requiredFields, ['tension', 'problematique']);
  assert.deepStrictEqual(verdict.corePresence, { tension: true, problematique: true });
  assert.deepStrictEqual(verdict.coreMissing, []);
  assert.deepStrictEqual(verdict.optionalPresence, { justificationProbleme: false });
  assert.deepStrictEqual(verdict.missingSecondaryFields, ['justificationProbleme']);
  assert.strictEqual(verdict.schemaStatus, 'core_valid_justification_pending');
  assert.strictEqual(verdict.errorCode, null);
});

test('validatePasseAContract — justification renseignée : core valide, aucune justification en attente', () => {
  const verdict = validatePasseAContract({
    tension: 'Une tension.',
    problematique: 'Comment faire évoluer les usages ?',
    justificationProbleme: 'Sans cadre, le risque de décision non fiable augmente.',
  });
  assert.strictEqual(verdict.isCoreValid, true);
  assert.strictEqual(verdict.optionalPresence.justificationProbleme, true);
  assert.strictEqual(verdict.schemaStatus, 'core_valid');
  assert.deepStrictEqual(verdict.missingSecondaryFields, []);
});

test('validatePasseAContract — tension absente → core invalide, CORE_CONTRACT_FIELDS_MISSING', () => {
  const verdict = validatePasseAContract({
    problematique: 'Comment faire évoluer les usages ?',
    justificationProbleme: 'Une justification pourtant présente.',
  });
  assert.strictEqual(verdict.isCoreValid, false);
  assert.deepStrictEqual(verdict.coreMissing, ['tension']);
  assert.strictEqual(verdict.schemaStatus, 'core_invalid');
  assert.strictEqual(verdict.errorCode, 'CORE_CONTRACT_FIELDS_MISSING');
});

test('validatePasseAContract — problématique absente → core invalide, CORE_CONTRACT_FIELDS_MISSING', () => {
  const verdict = validatePasseAContract({
    tension: 'Une tension présente.',
    justificationProbleme: 'Une justification pourtant présente.',
  });
  assert.strictEqual(verdict.isCoreValid, false);
  assert.deepStrictEqual(verdict.coreMissing, ['problematique']);
  assert.strictEqual(verdict.schemaStatus, 'core_invalid');
  assert.strictEqual(verdict.errorCode, 'CORE_CONTRACT_FIELDS_MISSING');
});

test('validatePasseAContract — problématique sans « ? » → core invalide, même avec justification', () => {
  const verdict = validatePasseAContract({
    tension: 'Une tension présente.',
    problematique: 'Comment faire évoluer les usages',
    justificationProbleme: 'Une justification présente.',
  });
  assert.strictEqual(verdict.isCoreValid, false);
  assert.deepStrictEqual(verdict.coreMissing, ['problematique']);
  assert.strictEqual(verdict.errorCode, 'CORE_CONTRACT_FIELDS_MISSING');
});

test('la justification n’est JAMAIS un motif bloquant du noyau, quelle que soit sa forme', () => {
  [undefined, null, '', '   ', [], {}].forEach((valeur) => {
    const verdict = validatePasseAContract({
      tension: 'Une tension présente.',
      problematique: 'Comment faire évoluer les usages ?',
      justificationProbleme: valeur,
    });
    assert.strictEqual(verdict.isCoreValid, true, `justification=${JSON.stringify(valeur)} ne doit pas bloquer`);
    assert.strictEqual(verdict.errorCode, null);
    assert.deepStrictEqual(verdict.coreMissing, []);
    assert.strictEqual(verdict.schemaStatus, 'core_valid_justification_pending');
  });
});

// ---------------------------------------------------------------------------
// NON-RÉGRESSION — scénario EXACT du log Railway a12e994b :
//   ligne_directrice + formulations[*].question + recommandation
//   + justification_recommandation, tension reprise de l'analyse,
//   justificationProbleme absente.
// La route doit répondre 200 et le diagnostic doit être cohérent de bout en
// bout (aucune contradiction schemaStatus / validationOutcome).
// ---------------------------------------------------------------------------

test('non-régression (log a12e994b) — contrat normalisé accepté, diagnostic cohérent, jamais 422', () => {
  const raw = contratFormatProduction();
  // La justification de la formulation est RETIRÉE : c'est le cas de production.
  delete raw.formulations[0].justification;

  const res = parseAndValidateContract(JSON.stringify(raw), { analyse: analyseAvecTension() });

  // 1) Le parseur accepte : la route ne peut donc pas transformer cela en 422.
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.type, undefined);
  assert.strictEqual(res.diagnostic.tensionSource, 'analysis');
  assert.strictEqual(res.diagnostic.justificationSource, 'missing');

  // 2) Verdict unique : noyau valide, rien dans coreMissing, justification en attente.
  const verdict = res.validationPasseA;
  assert.strictEqual(verdict.isCoreValid, true);
  assert.deepStrictEqual(verdict.requiredFields, ['tension', 'problematique']);
  assert.deepStrictEqual(verdict.corePresence, { tension: true, problematique: true });
  assert.deepStrictEqual(verdict.coreMissing, []);
  assert.deepStrictEqual(verdict.optionalPresence, { justificationProbleme: false });
  assert.ok(verdict.missingSecondaryFields.includes('justificationProbleme'));
  assert.strictEqual(verdict.schemaStatus, 'core_valid_justification_pending');
  assert.strictEqual(verdict.errorCode, null);

  // 3) Contrat renvoyé au frontend : affichable et validable tel quel.
  assert.notStrictEqual(res.contract.tension, '');
  assert.match(res.contract.problematique, /\?$/);
  assert.strictEqual(res.contract.justificationProbleme, '');
  assert.strictEqual(res.contract.completeness.isCoreValid, true);
  assert.ok(res.contract.completeness.missingSecondaryFields.includes('justificationProbleme'));
  // La ligne directrice est bien reconstruite depuis son alias snake_case.
  assert.strictEqual(res.contract.ligneDirectrice, raw.ligne_directrice);

  // 4) Aucune contradiction possible : un core valide ne porte jamais de code d'erreur.
  assert.strictEqual(
    verdict.isCoreValid && verdict.errorCode !== null,
    false,
    'un core valide ne doit jamais coexister avec un code d’erreur bloquant'
  );
});

test('non-régression — le verdict du parseur est identique à celui recalculé par la route', () => {
  const raw = contratFormatProduction();
  delete raw.formulations[0].justification;
  const res = parseAndValidateContract(JSON.stringify(raw), { analyse: analyseAvecTension() });

  // La route utilise `resultat.validationPasseA` ; si elle devait le recalculer
  // sur le contrat final, elle doit obtenir EXACTEMENT le même verdict.
  const recalcule = validatePasseAContract(res.contract);
  assert.deepStrictEqual(recalcule.corePresence, res.validationPasseA.corePresence);
  assert.deepStrictEqual(recalcule.coreMissing, res.validationPasseA.coreMissing);
  assert.deepStrictEqual(recalcule.optionalPresence, res.validationPasseA.optionalPresence);
  assert.strictEqual(recalcule.schemaStatus, res.validationPasseA.schemaStatus);
  assert.strictEqual(recalcule.isCoreValid, res.validationPasseA.isCoreValid);
});
