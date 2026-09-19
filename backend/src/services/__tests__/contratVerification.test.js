const test = require('node:test');
const assert = require('node:assert');

const { verifierContrat, ciblerRegeneration, recouvrement } = require('../contratVerification');

/** Contrat de référence, conforme : sert de base aux tests de rejet. */
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
      { nom: 'Cas A (source .md)', chiffre: '48 %', angle: 'transformation digitale bloquée par le manque de compétences', source: 'Source .md §3' },
      { nom: 'Cas B (source .md)', chiffre: '3 ans', angle: 'échec de transformation digitale', issue: 'echec', source: 'Source .md §5' },
    ],
    ligneDirectrice: 'La transformation digitale réussie passe par les compétences internes, pas par un recrutement informatique.',
    ouverture: 'Les PME industrielles sauront-elles former plutôt que recruter ?',
  };
}

function codes(resultat) {
  return resultat.rejets.map((r) => r.code);
}

test('un contrat conforme passe la vérification', () => {
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: contratValide() });
  assert.strictEqual(res.valide, true, JSON.stringify(res.rejets));
  assert.strictEqual(res.rejets.length, 0);
});

test('rejet : question qui recopie le sujet', () => {
  const c = contratValide();
  c.problematique = 'Comment réussir la transformation digitale des PME industrielles ?';
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c });
  assert.ok(codes(res).includes('contrat_copie_sujet'));
});

test('rejet : question oui / non', () => {
  const c = contratValide();
  c.problematique = 'Faut-il vraiment digitaliser la transformation des PME industrielles ?';
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c });
  assert.ok(codes(res).includes('contrat_question_oui_non'));
});

test('rejet : amorce molle sans contrainte', () => {
  const c = contratValide();
  // Question qui reprend un mot-clé du sujet mais sans contrainte nommée.
  // Tension alignée sur la question pour que seul le défaut d'amorce soit en cause.
  c.problematique = 'Comment optimiser la transformation digitale des équipes ?';
  c.tension =
    'Les équipes attendent une transformation digitale, mais la direction veut optimiser sans dégager de moyens.';
  c.preconisations = [
    { action: 'Transformation digitale portée par les équipes, sans recrutement', cible: 'PME' },
  ];
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c });
  assert.ok(codes(res).includes('contrat_amorce_molle'), JSON.stringify(res.rejets));
});

test('amorce molle avec contrainte nommée : acceptée', () => {
  const c = contratValide();
  c.problematique =
    'Comment optimiser la transformation digitale d’une PME industrielle dont le budget informatique et les compétences internes sont limités ?';
  c.tension =
    'Les PME industrielles doivent se digitaliser alors que leur budget informatique et leurs compétences internes sont limités.';
  c.preconisations = [
    { action: 'Transformation digitale des PME industrielles à budget contraint', cible: 'PME' },
  ];
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c });
  assert.ok(!codes(res).includes('contrat_amorce_molle'), JSON.stringify(res.rejets));
});

test('rejet : aucun mot-clé du sujet dans la question', () => {
  const c = contratValide();
  c.problematique = 'Dans quelle mesure une entreprise peut-elle se passer de recrutement externe ?';
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c });
  assert.ok(codes(res).includes('contrat_hors_sujet'));
});

test('rejet : préconisations décorrélées de la tension et de la question', () => {
  const c = contratValide();
  c.preconisations = [
    { action: 'Acheter des licences logicielles auprès d’un éditeur international', cible: 'grand groupe' },
  ];
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c });
  assert.ok(codes(res).includes('contrat_solutions_decorrelees'));
});

test('rejet : pas une question (pas de point d’interrogation)', () => {
  const c = contratValide();
  c.problematique = 'Dans quelle mesure une PME industrielle peut engager sa transformation digitale';
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c });
  assert.ok(codes(res).includes('contrat_pas_une_question'));
});

test('rejet : cas d’entreprise sans source', () => {
  const c = contratValide();
  c.casEntreprises = [{ nom: 'Cas inventé', chiffre: '12 %', angle: 'transformation digitale' }];
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c });
  assert.ok(codes(res).includes('contrat_cas_sans_source'));
});

test('rejet : aucun cas d’échec', () => {
  const c = contratValide();
  c.casEntreprises = [
    { nom: 'Cas A', chiffre: '48 %', angle: 'transformation digitale', source: 'Source .md', issue: 'succes' },
  ];
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c });
  assert.ok(codes(res).includes('contrat_cas_sans_echec'));
});

test('rejet : tension absente', () => {
  const c = contratValide();
  delete c.tension;
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c });
  assert.ok(codes(res).includes('contrat_tension_absente'));
});

test('rejet : tension non recoupée par la question', () => {
  const c = contratValide();
  c.tension = 'Les dirigeants hésitent entre embaucher et sous-traiter la paie des salariés saisonniers.';
  const res = verifierContrat({ sujet: 'La transformation digitale des PME industrielles', contrat: c });
  assert.ok(codes(res).includes('contrat_tension_decorrelee'));
});

test('ciblerRegeneration ne renvoie que tension / problématique / justification', () => {
  const res = verifierContrat({
    sujet: 'La transformation digitale des PME industrielles',
    contrat: { ...contratValide(), problematique: 'Faut-il digitaliser les PME ?' },
  });
  const champs = ciblerRegeneration(res.rejets);
  assert.ok(champs.includes('problematique'));
  assert.ok(!champs.includes('motsCles'));
  assert.ok(!champs.includes('contexte'));
});

test('recouvrement vaut 1 quand tout le vocabulaire est repris', () => {
  assert.strictEqual(recouvrement('transformation digitale', 'la transformation digitale des PME'), 1);
});
