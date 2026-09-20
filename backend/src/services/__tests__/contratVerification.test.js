const test = require('node:test');
const assert = require('node:assert');

const {
  verifierContrat,
  ciblerRegeneration,
  recouvrement,
  REJETS_CORE,
  REJETS_DEPLACES_EN_AVERTISSEMENT,
} = require('../contratVerification');

/** Contrat de référence, conforme : sert de base aux tests. */
function contratValide() {
  return {
    sujet: 'La transformation digitale des PME industrielles',
    motsCles: [
      { mot: 'transformation digitale', definition: 'Passage des processus métier au numérique.' },
      { mot: 'PME industrielle', definition: 'Entreprise de production de moins de 250 salariés.' },
    ],
    contexte: 'En 2024, 62 % des PME industrielles françaises jugent leur outil numérique inadapté (source : étude .md).',
    tension:
      "Les PME industrielles doivent se numériser pour rester compétitives, mais leurs équipes de production manquent des compétences et le budget informatique est déjà consommé par le maintien du système existant.",
    problematique:
      'Dans quelle mesure une PME industrielle peut-elle engager sa transformation digitale sans recruter de profil informatique dédié ?',
    justificationProbleme:
      "Le sujet devient un problème d'entreprise dès que l'on regarde le coût du maintien du système existant et le délai de recrutement sur ces profils.",
    limitesExistant: [
      "Les ERP existants couvrent la comptabilité mais pas le suivi de production : ils ne répondent pas à la transformation digitale attendue.",
    ],
    preconisations: [
      { action: "Transformation digitale par étapes sur le suivi de production d'une PME", cible: 'PME' },
      { action: 'Formation des chefs d’équipe plutôt que recrutement informatique', cible: 'ETI' },
    ],
    casEntreprises: [
      { entreprise: 'Cas A (source .md)', statut: 'a_qualifier', chiffre: '48 %', angle: 'transformation digitale bloquée par le manque de compétences', source: 'Source .md §3' },
      { entreprise: 'Cas B (source .md)', statut: 'echec', chiffre: '3 ans', angle: 'échec de transformation digitale', source: 'Source .md §5' },
    ],
    ligneDirectrice: 'La transformation digitale réussie passe par les compétences internes, pas par un recrutement informatique.',
    ouverture: 'Les PME industrielles sauront-elles former plutôt que recruter ?',
  };
}

function codes(resultat) {
  return resultat.rejets.map((r) => r.code);
}

function avertissements(resultat) {
  return resultat.avertissements.join(' \u2022 ');
}

test('un contrat conforme passe la vérification', () => {
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: contratValide(), mode: 'regeneration' });
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.strictEqual(res.rejets.length, 0);
});

test('mode création : un contrat conforme passe aussi', () => {
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: contratValide(), mode: 'creation' });
  assert.strictEqual(res.coreValide, true, JSON.stringify(res.rejetsCore));
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
});

// --- LES 6 REJETS BLOQUANTS DE LA PASSE A ----------------------------------

test('rejet bloquant : question absente', () => {
  const c = contratValide();
  c.problematique = '   ';
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'creation' });
  assert.strictEqual(res.coreValide, false);
  assert.ok(codes(res).includes('contrat_question_absente'));
});

test('rejet bloquant : tension absente', () => {
  const c = contratValide();
  delete c.tension;
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'regeneration' });
  assert.strictEqual(res.coreValide, false);
  assert.ok(codes(res).includes('contrat_tension_absente'));
});

test('rejet bloquant : pas une question (pas de point d’interrogation)', () => {
  const c = contratValide();
  c.problematique = 'Dans quelle mesure une PME industrielle peut engager sa transformation digitale';
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'regeneration' });
  assert.strictEqual(res.coreValide, false);
  assert.ok(codes(res).includes('contrat_pas_une_question'));
});

test('rejet bloquant : question oui / non', () => {
  const c = contratValide();
  c.problematique = 'Faut-il vraiment digitaliser la transformation des PME industrielles ?';
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'regeneration' });
  assert.strictEqual(res.coreValide, false);
  assert.ok(codes(res).includes('contrat_question_oui_non'));
});

test('rejet bloquant : question qui recopie le sujet', () => {
  const c = contratValide();
  c.problematique = 'Comment réussir la transformation digitale des PME industrielles ?';
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'regeneration' });
  assert.strictEqual(res.coreValide, false);
  assert.ok(codes(res).includes('contrat_copie_sujet'));
});

test('rejet bloquant : question trop courte (moins de 5 mots utiles)', () => {
  const c = contratValide();
  c.problematique = 'Comment digitaliser la PME ?';
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'creation' });
  assert.strictEqual(res.coreValide, false);
  assert.ok(codes(res).includes('contrat_question_courte'));
});

// --- CE QUI N'EST PLUS BLOQUANT : LES 4 CAS DU CAHIER DES CHARGES ---------

test('warning : tension décorrélée — contrat validable, HTTP 200', () => {
  // Reproduit le cas de recette : la tension (phrase interne issue de
  // l'analyse) et la question (reformulée, plus concrète) ne partagent presque
  // aucun mot. Le lien reste évident pour un humain → avertissement, jamais 422.
  const c = contratValide();
  c.tension =
    'Recherche de gains rapides contre maîtrise de la confidentialité et de la fiabilité.';
  c.problematique =
    'Comment une PME peut-elle intégrer l’IA générative dans ses processus métiers sans exposer ses données sensibles ni fragiliser la qualité de ses décisions ?';
  c.motsCles = [{ mot: 'IA générative', definition: 'Modèles génératifs appliqués aux processus métiers.' }];
  c.preconisations = [{ action: 'Cadrer l’usage de l’IA générative par une charte de gouvernance', cible: 'PME' }];
  const res = verifierContrat({
    sujet: 'L’intégration de l’IA générative dans les PME',
    contrat: c,
    mode: 'regeneration',
  });
  assert.strictEqual(res.coreValide, true, JSON.stringify(res.rejetsCore));
  assert.deepStrictEqual(res.rejetsCore, []);
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.ok(
    res.avertissements.some((a) => /même vocabulaire|reformulé/i.test(a)),
    avertissements(res),
  );
});

test('warning : aucun mot-clé du sujet dans la question — contrat validable', () => {
  const c = contratValide();
  c.problematique = 'Dans quelle mesure une entreprise peut-elle se passer de recrutement externe ?';
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'regeneration' });
  assert.strictEqual(res.coreValide, true, JSON.stringify(res.rejetsCore));
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.ok(res.avertissements.length > 0);
});

test('warning : mots-clés absents du contrat — contrat validable', () => {
  const c = { ...contratValide(), motsCles: [] };
  const res = verifierContrat({
    sujet: 'La transformation digitale des PME industrielles',
    contrat: c,
    mode: 'regeneration',
  });
  assert.strictEqual(res.coreValide, true, JSON.stringify(res.rejetsCore));
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.ok(!codes(res).includes('contrat_mots_cles_absents'));
});

test('warning : justification absente — contrat validable', () => {
  const c = contratValide();
  delete c.justificationProbleme;
  const res = verifierContrat({
    sujet: 'La transformation digitale des PME industrielles',
    contrat: c,
    mode: 'regeneration',
  });
  assert.strictEqual(res.coreValide, true, JSON.stringify(res.rejetsCore));
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.ok(!codes(res).includes('contrat_justification_absente'));
  assert.ok(res.avertissements.some((a) => /justification/i.test(a)), avertissements(res));
});

test('warning : cas d’échec absent — contrat validable', () => {
  const c = contratValide();
  c.casEntreprises = [
    { entreprise: 'Cas A', statut: 'succes', chiffre: '48 %', angle: 'transformation digitale', source: 'Source .md' },
  ];
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'regeneration' });
  assert.strictEqual(res.coreValide, true, JSON.stringify(res.rejetsCore));
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.ok(!codes(res).includes('contrat_cas_sans_echec'));
  assert.ok(res.avertissements.some((a) => /échec/i.test(a)), avertissements(res));
});

test('warning : cas d’entreprise sans source — contrat validable', () => {
  const c = contratValide();
  c.casEntreprises = [{ entreprise: 'Cas inventé', statut: 'succes', chiffre: '12 %', angle: 'transformation digitale' }];
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'regeneration' });
  assert.strictEqual(res.coreValide, true, JSON.stringify(res.rejetsCore));
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.ok(!codes(res).includes('contrat_cas_sans_source'));
});

test('warning : préconisations décorrélées — contrat validable', () => {
  const c = contratValide();
  c.preconisations = [
    { action: 'Acheter des licences logicielles auprès d’un éditeur international', cible: 'grand groupe' },
  ];
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'regeneration' });
  assert.strictEqual(res.coreValide, true, JSON.stringify(res.rejetsCore));
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.ok(!codes(res).includes('contrat_solutions_decorrelees'));
});

test('warning : amorce molle sans contrainte — contrat validable', () => {
  const c = contratValide();
  c.problematique = 'Comment optimiser la transformation digitale des équipes ?';
  c.tension =
    'Les équipes attendent une transformation digitale, mais la direction veut optimiser sans dégager de moyens.';
  c.preconisations = [
    { action: 'Transformation digitale portée par les équipes, sans recrutement', cible: 'PME' },
  ];
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'regeneration' });
  assert.strictEqual(res.coreValide, true, JSON.stringify(res.rejetsCore));
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.ok(!codes(res).includes('contrat_amorce_molle'));
});

test('amorce molle avec contrainte nommée : acceptée, sans avertissement dédié', () => {
  const c = contratValide();
  c.problematique =
    'Comment optimiser la transformation digitale d’une PME industrielle dont le budget informatique et les compétences internes sont limités ?';
  c.tension =
    'Les PME industrielles doivent se digitaliser alors que leur budget informatique et leurs compétences internes sont limités.';
  c.preconisations = [
    { action: 'Transformation digitale des PME industrielles à budget contraint', cible: 'PME' },
  ];
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'regeneration' });
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.ok(!avertissements(res).includes('sans nommer de contrainte'), avertissements(res));
});

test('warning : cas / préconisations / ligne directrice absents — contrat validable', () => {
  const c = contratValide();
  delete c.casEntreprises;
  delete c.preconisations;
  delete c.ligneDirectrice;
  const res = verifierContrat({
    sujet: 'La transformation digitale des PME industrielles',
    contrat: c,
    mode: 'creation',
  });
  assert.strictEqual(res.coreValide, true, JSON.stringify(res.rejetsCore));
  assert.strictEqual(res.rejetsCore.length, 0);
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.ok(res.avertissements.length > 0);
});

test('warning : ouverture absente — contrat validable', () => {
  const c = contratValide();
  delete c.ouverture;
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c, mode: 'regeneration' });
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.ok(res.avertissements.some((a) => /ouverture/i.test(a)), avertissements(res));
});

// --- GARANTIES DE LA SIMPLIFICATION ----------------------------------------

test('REJETS_CORE ne contient que les 6 conditions minimales', () => {
  assert.deepStrictEqual(
    [...REJETS_CORE].sort(),
    [
      'contrat_copie_sujet',
      'contrat_pas_une_question',
      'contrat_question_absente',
      'contrat_question_courte',
      'contrat_question_oui_non',
      'contrat_tension_absente',
    ].sort(),
  );
});

test('aucun rejet déplacé en avertissement ne bloque, quel que soit le mode', () => {
  const c = contratValide();
  delete c.casEntreprises;
  delete c.preconisations;
  delete c.justificationProbleme;
  c.tension = 'Recherche de gains rapides contre maîtrise de la confidentialité.';
  c.ouverture = 'Et demain ?';
  for (const mode of ['creation', 'regeneration']) {
    const res = verifierContrat({
      sujet: 'La transformation digitale des PME industrielles',
      contrat: c,
      mode,
    });
    assert.strictEqual(res.rejets.length, 0, `${mode} : ${JSON.stringify(res.rejets)}`);
    assert.strictEqual(res.valide, true);
    for (const r of res.rejets) {
      assert.ok(!REJETS_DEPLACES_EN_AVERTISSEMENT.has(r.code), `${mode} : ${r.code} bloque encore`);
    }
  }
});

// --- RÉGÉNÉRATION CIBLÉE ---------------------------------------------------

test('ciblerRegeneration ne renvoie que tension / problématique / justification', () => {
  const res = verifierContrat({
    sujet: 'La transformation digitale des PME industrielles',
    contrat: { ...contratValide(), problematique: 'Faut-il digitaliser les PME ?' },
    mode: 'regeneration',
  });
  const champs = ciblerRegeneration(res.rejets);
  assert.ok(champs.includes('problematique'));
  assert.ok(!champs.includes('motsCles'));
  assert.ok(!champs.includes('contexte'));
});

test('recouvrement vaut 1 quand tout le vocabulaire est repris', () => {
  assert.strictEqual(recouvrement('transformation digitale', 'la transformation digitale des PME'), 1);
});
