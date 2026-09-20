const test = require('node:test');
const assert = require('node:assert');

const {
  verifyPreparationInputs,
  verifyGeneratedSupport,
  verifyPptxVisualReview,
  CHECKS_POST_SUPPORT,
} = require('../verificationExport');

/**
 * Session PCA/PRA de référence : Analyse, Problématique (contrat validé), Plan
 * et Glossaire validés, mais support NON encore généré.
 */
function sessionPcaPra() {
  return {
    titre: 'Tests cyber réalistes et fiabilité des PCA/PRA',
    ligneDirectrice:
      "La fiabilité d'un PCA/PRA après une cyberattaque ne dépend pas de la conformité du classeur, mais de la capacité à tester des scénarios cyber réalistes.",
    workflow: { analysis: 'generated', contract: 'validated', plan: 'generated', glossary: 'validated' },
    data: {
      contrat: {
        status: 'validated',
        problematique:
          'Comment une démarche de tests cyber réalistes permet-elle de concilier conformité des PCA/PRA et fiabilité en situation réelle ?',
        ligneDirectrice:
          "La fiabilité d'un PCA/PRA après une cyberattaque ne dépend pas de la conformité du classeur, mais de la capacité à tester des scénarios cyber réalistes.",
        justificationProbleme:
          "Le classeur conforme rassure l'audit mais ne dit rien de la tenue réelle du plan le jour de l'incident.",
        contexte: [
          { fait: 'En 2024, 41 % des entreprises déclarent un PCA jamais testé (source : étude ANSSI).', source: 'ANSSI 2024' },
        ],
        limitesExistant: [
          "Les PCA/PRA existants sont validés sur dossier mais jamais éprouvés par un scénario d'attaque réel.",
        ],
        preconisations: [
          { action: 'Tester le PCA/PRA par des scénarios cyber réalistes avant validation', cible: 'Direction des risques' },
        ],
        casEntreprises: [
          { entreprise: 'Cas A', statut: 'a_qualifier', chiffre: '9 mois', angle: 'PCA jamais testé' },
        ],
        motsCles: [{ mot: 'PCA/PRA', definition: "Plan de continuité et de reprise d'activité." }],
      },
      plan: {
        sections: [
          { titre: 'Introduction' },
          { titre: "Limites de l'existant" },
          { titre: 'Préconisations' },
        ],
        ouverture: { question: "Les dirigeants accepteront-ils de tester avant de certifier ?" },
      },
      recherche: { sources: [{ titre: 'ANSSI 2024' }] },
    },
  };
}

/** Support généré : 20 slides, plan en 2e, problématique dédiée, notes partout. */
function supportConforme() {
  const slides = [];
  for (let i = 1; i <= 20; i += 1) {
    slides.push({ titre: `Slide ${i}`, notes: 'n', transition: 't' });
  }
  slides[0].titre = 'Titre';
  slides[1].titre = 'Plan de présentation';
  slides[2].titre = 'Problématique';
  slides[19].titre = 'Conclusion';
  return { slides };
}

// ---------------------------------------------------------------------------
// Phase 1 — Pré-support
// ---------------------------------------------------------------------------

test('Phase 1 : session PCA/PRA conforme, support non généré → exports Markdown autorisés', async () => {
  const r = await verifyPreparationInputs(sessionPcaPra());
  assert.strictEqual(r.phase, 'pre_support');
  assert.strictEqual(r.canGenerateSupport, true, JSON.stringify(r.blocking));
  assert.strictEqual(r.canExportMarkdown, true, JSON.stringify(r.blocking));
  assert.strictEqual(r.canExportPptx, false);
  assert.deepStrictEqual(r.blocking, []);
});

test('Phase 1 : 0 slide et 0 note restent des contrôles en attente, jamais des blocages', async () => {
  const r = await verifyPreparationInputs(sessionPcaPra());
  assert.strictEqual(r.blocking.some((b) => /slide|notes/i.test(b.code)), false);
  const codes = r.pendingChecks.map((c) => c.code);
  assert.ok(codes.includes('slides_count'), 'le volume de slides doit être en attente');
  assert.ok(codes.includes('notes_presentateur'), 'les notes doivent être en attente');
  assert.ok(codes.includes('slides_concises'), 'la concision doit être en attente');
  assert.strictEqual(r.pendingChecks, CHECKS_POST_SUPPORT);
});

test('Phase 1 : sans limites de l’existant → export Markdown bloqué avec message précis', async () => {
  const session = sessionPcaPra();
  session.data.contrat.limitesExistant = [];
  session.data.plan.sections = [{ titre: 'Introduction' }, { titre: 'Préconisations' }];
  const r = await verifyPreparationInputs(session);
  assert.strictEqual(r.canExportMarkdown, false);
  const blocage = r.blocking.find((b) => b.code === 'prep_limites_absentes');
  assert.ok(blocage, JSON.stringify(r.blocking));
  assert.match(blocage.message, /Ajoutez les limites de l'existant/);
  assert.strictEqual(blocage.sectionPlan, 'Limites de l’existant');
});

test('Phase 1 : contrat non validé ou problématique absente → bloquant', async () => {
  const session = sessionPcaPra();
  session.data.contrat.status = 'draft';
  session.data.contrat.problematique = '';
  const r = await verifyPreparationInputs(session);
  assert.strictEqual(r.canExportMarkdown, false);
  const codes = r.blocking.map((b) => b.code);
  assert.ok(codes.includes('prep_contrat_non_valide'));
  assert.ok(codes.includes('prep_problematique_absente'));
});

test('Phase 1 : chiffre sans source → bloquant', async () => {
  const session = sessionPcaPra();
  session.data.contrat.contexte = [{ fait: '41 % des PCA ne sont jamais testés.' }];
  const r = await verifyPreparationInputs(session);
  assert.strictEqual(r.canExportMarkdown, false);
  assert.ok(r.blocking.some((b) => b.code === 'prep_chiffre_sans_source'));
});

test('Phase 1 : les critères oraux sont des avertissements, jamais des blocages', async () => {
  const r = await verifyPreparationInputs(sessionPcaPra());
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('prep_communication'));
  assert.ok(codes.includes('prep_dynamisme'));
  assert.ok(codes.includes('prep_maitrise_exercice'));
  assert.ok(codes.includes('prep_prise_de_recul'));
  assert.strictEqual(r.blocking.length, 0);
});

// ---------------------------------------------------------------------------
// Phase 2 — Post-support
// ---------------------------------------------------------------------------

test('Phase 2 : support conforme (20 slides, notes) → export PPTX autorisé', () => {
  const r = verifyGeneratedSupport(supportConforme());
  assert.strictEqual(r.phase, 'post_support');
  assert.strictEqual(r.canExportPptx, true, JSON.stringify(r.blocking));
  assert.strictEqual(r.canExportMarkdown, true);
});

test('Phase 2 : support généré avec 19 slides → export PPTX bloqué', () => {
  const support = supportConforme();
  support.slides.pop();
  const r = verifyGeneratedSupport(support);
  assert.strictEqual(r.canExportPptx, false);
  assert.ok(r.blocking.some((b) => b.code === 'support_slides_count'));
});

test('Phase 2 : support généré sans notes → export PPTX bloqué avec message précis', () => {
  const support = supportConforme();
  support.slides[4].notes = '';
  const r = verifyGeneratedSupport(support);
  assert.strictEqual(r.canExportPptx, false);
  const blocage = r.blocking.find((b) => b.code === 'support_notes_absentes');
  assert.ok(blocage, JSON.stringify(r.blocking));
  assert.match(blocage.message, /sans notes du présentateur/);
});

test('Phase 2 : problématique révélée avant sa slide → bloquant', () => {
  const support = supportConforme();
  support.slides[0].titre = 'Contexte — notre problématique';
  support.slides[2].titre = 'Problématique';
  const r = verifyGeneratedSupport(support);
  assert.ok(r.blocking.some((b) => b.code === 'support_problematique_slide_position'), JSON.stringify(r.blocking));
});

test('Phase 2 : concision et transitions sont des avertissements', () => {
  const support = supportConforme();
  support.slides.forEach((s) => {
    delete s.transition;
  });
  const r = verifyGeneratedSupport(support);
  assert.ok(r.warnings.some((w) => w.code === 'support_transitions'));
  assert.strictEqual(r.blocking.some((b) => b.code === 'support_transitions'), false);
});

// ---------------------------------------------------------------------------
// Phase 3 — Post-PPTX
// ---------------------------------------------------------------------------

test('Phase 3 : revue visuelle vierge → aucun blocage', () => {
  const r = verifyPptxVisualReview({});
  assert.strictEqual(r.phase, 'post_pptx');
  assert.strictEqual(r.blocking.length, 0);
  assert.strictEqual(r.canExportPptx, true);
});

test('Phase 3 : charte CESI absente et surcharge → blocages visuels seulement', () => {
  const r = verifyPptxVisualReview({ charteCesi: false, surcharge: true });
  assert.strictEqual(r.canExportPptx, false);
  const codes = r.blocking.map((b) => b.code);
  assert.ok(codes.includes('pptx_charte_cesi'));
  assert.ok(codes.includes('pptx_surcharge'));
  // Ces critères visuels ne concernent pas l'export Markdown.
  assert.strictEqual(r.canExportMarkdown, true);
});
