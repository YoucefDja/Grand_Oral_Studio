const test = require('node:test');
const assert = require('node:assert');

const {
  detecterFormulesIA,
  contientVerbeConjugue,
  estPhraseComplete,
  contientDeuxCamps,
  compresserPuce,
  compresserTitre,
  compresserSlide,
  compresserSupport,
  MAX_PUCES_SLIDE,
} = require('../compresseurTexte');

test('detecterFormulesIA repère les formules de copie IA', () => {
  const texte = "Il convient de renforcer la synergie afin de garantir la continuité.";
  const trouvees = detecterFormulesIA(texte);
  assert.ok(trouvees.includes('il convient de'));
  assert.ok(trouvees.includes('synergie'));
  assert.ok(trouvees.includes('afin de garantir'));
});

test('detecterFormulesIA ne signale rien sur un fragment nominal', () => {
  assert.deepStrictEqual(detecterFormulesIA('Sauvegarde isolée — test trimestriel'), []);
});

test('contientVerbeConjugue distingue fragment nominal et phrase conjuguée', () => {
  assert.strictEqual(contientVerbeConjugue('Plan de reprise — 48 h'), false);
  assert.strictEqual(contientVerbeConjugue('La direction doit arbitrer les priorités'), true);
});

test('estPhraseComplete déclenche sur phrase longue ou verbe conjugué', () => {
  assert.strictEqual(estPhraseComplete('Astreinte de crise — un nom par site'), false);
  assert.strictEqual(
    estPhraseComplete("L'entreprise a mis en place une démarche de continuité ambitieuse et structurée"),
    true
  );
});

test('contientDeuxCamps repère les montages Pour/Contre et Avantages/Risques', () => {
  assert.strictEqual(contientDeuxCamps('Débat pour / contre'), true);
  assert.strictEqual(contientDeuxCamps('Avantages / risques de la solution'), true);
  assert.strictEqual(contientDeuxCamps('Reprise en 48 h — sauvegarde isolée'), false);
});

test('compresserPuce retire les amorces impersonnelles et reverse le surplus', () => {
  const { texte, surplus } = compresserPuce(
    "Il faut mettre en place un plan de communication de crise détaillé et éprouvé"
  );
  assert.ok(!/il faut/i.test(texte));
  assert.ok(texte.length > 0);
  assert.ok(surplus.length > 0);
});

test('compresserPuce retire les formules IA mais garde le contenu', () => {
  const { texte } = compresserPuce('Une synergie au cœur de la gouvernance des risques');
  assert.ok(!/synergie/i.test(texte));
  assert.ok(!/au cœur de/i.test(texte));
  assert.ok(/gouvernance/i.test(texte));
});

test('compresserPuce coupe une puce trop longue à la virgule', () => {
  const { texte, surplus } = compresserPuce(
    "Cartographie des dépendances, désignation d'un responsable, exercices de crise semestriels, astreinte par site"
  );
  assert.ok(texte.split(/\s+/).length <= 12);
  assert.ok(surplus.length > 0);
});

test('compresserTitre borne le titre à 7 mots', () => {
  const titre = compresserTitre('Préconisations très détaillées pour la reprise après incident majeur');
  assert.ok(titre.split(/\s+/).length <= 7);
});

test('compresserSlide reverse les puces excédentaires dans les notes', () => {
  const slide = {
    titre: 'Enjeux',
    puces: ['Perte de CA', 'Clients perdus', 'Astreinte', 'Tests', 'Communication', 'Fournisseurs', 'Assurance'],
    notes_orateur: 'Je m’arrête sur le chiffre.',
  };
  const compressee = compresserSlide(slide);
  assert.strictEqual(compressee.puces.length, MAX_PUCES_SLIDE);
  assert.ok(compressee.notes_orateur.includes('Assurance'));
  assert.ok(compressee.notes_orateur.includes('Je m’arrête sur le chiffre.'));
});

test('compresserSupport produit un rapport d’anomalies', () => {
  const support = {
    slides: [
      { titre: 'Contexte', puces: ['La direction doit arbitrer les priorités'] },
      { titre: 'Solutions', puces: ['Il convient de renforcer la synergie'] },
    ],
  };
  const { support: compresse, rapport } = compresserSupport(support);
  assert.strictEqual(compresse.slides.length, 2);
  assert.ok(rapport.phrases >= 1);
  assert.ok(rapport.formulesIA.includes('synergie'));
});
