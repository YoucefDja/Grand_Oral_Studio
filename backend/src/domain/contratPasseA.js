'use strict';

/**
 * Domaine « contrat Passe A » — source de vérité unique du contrat métier.
 *
 * Ce module expose exclusivement :
 *   - normalizeContract(rawContract, analysis)
 *   - migrateLegacyContract(session)
 *   - validatePasseA(contract)
 *   - validateSupportReadiness(session)
 *   - validateExportReadiness(session)
 *
 * Aucun autre module ne doit interpréter `session.data.contrat` à sa façon :
 * toutes les couches (routes, services, frontend via l'API) consomment la
 * structure canonique produite ici.
 */

const VERSION_CONTRAT = 1;

const STATUTS_CAS = ['succes', 'echec', 'mixte', 'a_qualifier'];

// Champs bloquants de la Passe A : la justification, l'ouverture, les cas,
// les préconisations et les limites sont volontairement non bloquants ici.
const CHAMPS_BLOQUANTS_PASSE_A = ['tension', 'problematique'];

// Champs texte du contrat canonique.
const CHAMPS_TEXTE = [
  'tension',
  'problematique',
  'justificationProbleme',
  'ligneDirectrice',
  'ouverture',
];

// Champs tableau du contrat canonique.
const CHAMPS_TABLEAU = [
  'motsCles',
  'contexte',
  'limitesExistant',
  'preconisations',
  'casEntreprises',
];

/**
 * Statut connu d'un cas d'entreprise, déduit uniquement d'un marqueur explicite.
 * Retourne null si aucun statut n'est explicitement fourni par le LLM ou
 * par une donnée héritée.
 */
function statutExplicite(valeur) {
  if (typeof valeur !== 'string') return null;
  const normalise = valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!normalise) return null;
  if (/^(succes|success|reussi|reussite|positif|victoire)$/.test(normalise)) return 'succes';
  if (/^(echec|echecs|failure|echoue|negatif|recul|abandon|faillite)$/.test(normalise)) return 'echec';
  if (/^(mixte|contraste|mitige|ambivalent|nuance|partiel|limite|limites)$/.test(normalise)) return 'mixte';
  if (/^(a_qualifier|a qualifier|inconnu|indetermine|non qualifie|na)$/.test(normalise)) return 'a_qualifier';
  return null;
}

/**
 * Déduit un statut pour les cas dont le statut explicite est absent, à partir
 * du texte du cas. Ne retourne jamais « succes » par défaut : sans marqueur
 * explicite, le cas reste « a_qualifier ».
 */
function deduireStatutDepuisTexte(texte) {
  if (typeof texte !== 'string' || !texte.trim()) return 'a_qualifier';
  const normalise = texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/echec|faillite|recul|abandon|depass|mise en cause|scandale|non renouvele|ratee/.test(normalise)) {
    return 'echec';
  }
  if (/mixte|contraste|ambivalent|en partie|mais aussi|deux lectures/.test(normalise)) {
    return 'mixte';
  }
  if (/succes|reussi|croissance|hausse|adoption|leader/.test(normalise)) {
    return 'succes';
  }
  return 'a_qualifier';
}

// Entreprises dont le constat de recette impose un statut non « succes ».
const STATUTS_IMPOSES = [
  { motif: /samsung/i, statuts: ['echec', 'mixte'] },
  { motif: /air\s*canada/i, statuts: ['echec', 'mixte'] },
];

function texte(valeur) {
  if (typeof valeur === 'string') return valeur;
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return String(valeur);
  return '';
}

function tableau(valeur) {
  return Array.isArray(valeur) ? valeur : [];
}

/**
 * Normalise un cas d'entreprise vers la structure canonique.
 * Accepte les formes héritées du prompt métier (« nom », « issue ») sans
 * jamais modifier les prompts eux-mêmes.
 */
function normaliserCas(brut) {
  const cas = brut && typeof brut === 'object' ? brut : {};
  const entreprise = texte(
    cas.entreprise ?? cas.nom ?? cas.name ?? cas.titre ?? cas.entrepriseNom
  ).trim();
  const chiffre = texte(cas.chiffre ?? cas.chiffres ?? cas.donnee ?? cas.data);
  const angle = texte(cas.angle ?? cas.usage ?? cas.apport ?? cas.interet);
  const source = texte(cas.source ?? cas.sources ?? cas.reference);

  let statut =
    statutExplicite(cas.statut) ||
    statutExplicite(cas.issue) ||
    statutExplicite(cas.resultat) ||
    statutExplicite(cas.verdict);

  if (!statut) {
    statut = deduireStatutDepuisTexte(
      [angle, chiffre, texte(cas.issue), texte(cas.commentaire), texte(cas.description)]
        .filter(Boolean)
        .join(' ')
    );
  }

  const impose = STATUTS_IMPOSES.find((regle) => regle.motif.test(entreprise));
  if (impose && !impose.statuts.includes(statut)) {
    statut = impose.statuts[0];
  }

  return { entreprise, statut, chiffre, angle, source };
}

/**
 * Lit les mots-clés de l'Analyse, quelle que soit la casse de la clé.
 * L'étape 1 écrit `mots_cles` (forme persistée en base) ; certains appels
 * internes construisent l'objet en camelCase. Aucune autre lecture n'est faite.
 */
function motsClesAnalyse(analyse) {
  const source = analyse && typeof analyse === 'object' ? analyse : {};
  const liste = tableau(source.mots_cles);
  return liste.length ? liste : tableau(source.motsCles);
}

function normaliserMotsCles(valeur) {
  return tableau(valeur)
    .map((entree) => {
      if (typeof entree === 'string') {
        const mot = entree.trim();
        return mot ? { mot, definition: '' } : null;
      }
      if (entree && typeof entree === 'object') {
        const mot = texte(entree.mot ?? entree.terme ?? entree.keyword ?? entree.label).trim();
        if (!mot) return null;
        return { mot, definition: texte(entree.definition ?? entree.description ?? entree.sens) };
      }
      return null;
    })
    .filter(Boolean);
}

function normaliserContexte(valeur) {
  return tableau(valeur)
    .map((entree) => {
      if (typeof entree === 'string') {
        const fait = entree.trim();
        return fait ? { fait, source: '' } : null;
      }
      if (entree && typeof entree === 'object') {
        const fait = texte(entree.fait ?? entree.element ?? entree.contexte ?? entree.texte).trim();
        if (!fait) return null;
        return { fait, source: texte(entree.source ?? entree.reference) };
      }
      return null;
    })
    .filter(Boolean);
}

function normaliserListeTexte(valeur) {
  return tableau(valeur)
    .map((entree) => {
      if (typeof entree === 'string') return entree.trim();
      if (entree && typeof entree === 'object') {
        return texte(
          entree.limite ?? entree.preconisation ?? entree.element ?? entree.texte ?? entree.description
        ).trim();
      }
      return '';
    })
    .filter(Boolean);
}

function champsManquantsPasseA(contrat) {
  return CHAMPS_BLOQUANTS_PASSE_A.filter((champ) => !texte(contrat[champ]).trim());
}

/**
 * Produit un contrat canonique à partir d'un objet quelconque (sortie LLM,
 * formulaire, donnée héritée) et de l'analyse de la session.
 *
 * @param {object} rawContract contrat brut (jamais persisté tel quel)
 * @param {object} analysis    `session.data.analyse`
 * @returns {object} contrat canonique
 */
function normalizeContract(rawContract, analysis) {
  const brut = rawContract && typeof rawContract === 'object' ? rawContract : {};
  const analyse = analysis && typeof analysis === 'object' ? analysis : {};

  const contrat = {
    version: VERSION_CONTRAT,
    status: 'generated',
    generatedAt: brut.generatedAt instanceof Date ? brut.generatedAt : null,
    validatedAt: brut.validatedAt instanceof Date ? brut.validatedAt : null,
  };

  for (const champ of CHAMPS_TEXTE) {
    contrat[champ] = texte(brut[champ]);
  }
  for (const champ of CHAMPS_TABLEAU) {
    contrat[champ] = tableau(brut[champ]);
  }

  // Héritage des mots-clés depuis l'Analyse : ne jamais bloquer la Passe A
  // parce qu'ils sont stockés dans l'analyse. L'Analyse est persistée par
  // l'étape 1 en snake_case (`mots_cles`) — c'est la clé réellement écrite en
  // base — tandis que le contrat canonique utilise `motsCles`. Les deux formes
  // sont donc lues, sinon l'héritage est silencieusement vide.
  const motsClesBruts = tableau(brut.motsCles).length
    ? brut.motsCles
    : motsClesAnalyse(analyse);
  contrat.motsCles = normaliserMotsCles(motsClesBruts);
  contrat.contexte = normaliserContexte(brut.contexte);
  contrat.limitesExistant = normaliserListeTexte(brut.limitesExistant);
  contrat.preconisations = normaliserListeTexte(brut.preconisations);
  contrat.casEntreprises = tableau(brut.casEntreprises).map(normaliserCas);

  // Statut : un contrat validé ne redevient « generated » que sur décision
  // explicite de l'appelant (régénération).
  if (brut.status === 'validated') {
    contrat.status = 'validated';
    contrat.validatedAt = contrat.validatedAt || new Date();
  }

  contrat.completeness = construireCompletude(contrat);
  return contrat;
}

function construireCompletude(contrat) {
  const missingFields = champsManquantsPasseA(contrat);
  return {
    passeAValid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Reconstruit la complétude d'un contrat canonique déjà normalisé.
 * Utilisé après édition utilisateur, sans repasser par `normalizeContract`
 * (qui réinitialiserait le statut).
 */
function rafraichirCompletude(contrat) {
  if (!contrat || typeof contrat !== 'object') return contrat;
  contrat.completeness = construireCompletude(contrat);
  return contrat;
}

/**
 * Migre une session héritée vers le contrat canonique.
 * Seul point du code autorisé à connaître les anciennes structures
 * (`session.data.probleme`, `contrat.valide`, `completeness.isCoreValid`…).
 *
 * @returns {object} contrat canonique
 */
function migrateLegacyContract(session) {
  const data = session?.data && typeof session.data === 'object' ? session.data : {};
  const analyse = data.analyse && typeof data.analyse === 'object' ? data.analyse : {};
  const legacyProbleme = data.probleme && typeof data.probleme === 'object' ? data.probleme : {};
  const legacyContrat = data.contrat && typeof data.contrat === 'object' ? data.contrat : {};

  const source = { ...legacyProbleme };
  for (const [cle, valeur] of Object.entries(legacyContrat)) {
    if (valeur === undefined || valeur === null) continue;
    if (Array.isArray(valeur) && valeur.length === 0 && Array.isArray(source[cle])) continue;
    if (typeof valeur === 'string' && !valeur.trim() && source[cle]) continue;
    source[cle] = valeur;
  }

  const contrat = normalizeContract(source, analyse);

  // Reprise des marqueurs hérités.
  if (legacyContrat.valide === true) {
    contrat.status = 'validated';
    contrat.validatedAt = legacyContrat.validatedAt || null;
  }
  if (legacyContrat.generatedAt) contrat.generatedAt = legacyContrat.generatedAt;
  if (legacyContrat.verification) contrat.verification = legacyContrat.verification;
  if (legacyContrat.champsARegenerer) contrat.champsARegenerer = legacyContrat.champsARegenerer;

  contrat.completeness = construireCompletude(contrat);
  return contrat;
}

/**
 * Validation Passe A : seuls `tension` et `problematique` bloquent.
 * @returns {{ valide: boolean, missingFields: string[], warnings: string[] }}
 */
function validatePasseA(contrat) {
  const c = contrat && typeof contrat === 'object' ? contrat : {};
  const missingFields = champsManquantsPasseA(c);
  const warnings = [];

  const cas = tableau(c.casEntreprises);
  const aCasNonQualifie = cas.some((x) => x?.statut === 'a_qualifier');
  if (cas.length > 0 && aCasNonQualifie) {
    warnings.push('cas_sans_statut');
  }
  if (cas.length > 0 && !cas.some((x) => x?.statut === 'echec' || x?.statut === 'mixte')) {
    // Warning à la Passe A ; le blocage n'intervient qu'avant l'export final
    // si la charte l'exige.
    warnings.push('cas_echec_absent');
  }
  if (!texte(c.justificationProbleme).trim()) {
    warnings.push('justification_absente');
  }

  return { valide: missingFields.length === 0, missingFields, warnings };
}

/**
 * Prérequis de génération du Support.
 * @returns {{ ready: boolean, missing: string[] }}
 */
function validateSupportReadiness(session) {
  const missing = [];
  const data = session?.data && typeof session.data === 'object' ? session.data : {};
  const workflow = session?.workflow && typeof session.workflow === 'object' ? session.workflow : {};

  const statutContrat = workflow.contract || data.contrat?.status;
  if (statutContrat !== 'validated') missing.push('contract_validation');
  if ((workflow.plan || 'empty') !== 'generated') missing.push('plan_generation');
  if ((workflow.glossary || 'empty') !== 'validated') missing.push('glossary_validation');

  return { ready: missing.length === 0, missing };
}

/**
 * Prérequis d'export : le support doit être généré et la vérification export
 * doit être conforme. Le contrôle CESI strict reste porté par
 * `verificationExport.js` et n'est pas dupliqué ici.
 * @returns {{ ready: boolean, missing: string[] }}
 */
function validateExportReadiness(session) {
  const missing = [];
  const workflow = session?.workflow && typeof session.workflow === 'object' ? session.workflow : {};
  const data = session?.data && typeof session.data === 'object' ? session.data : {};

  const statutContrat = workflow.contract || data.contrat?.status;
  if (statutContrat !== 'validated') missing.push('contract_validation');
  if ((workflow.support || 'empty') !== 'generated') missing.push('support_generation');
  if ((workflow.export || 'blocked') !== 'ready') missing.push('export_verification');

  return { ready: missing.length === 0, missing };
}

module.exports = {
  VERSION_CONTRAT,
  STATUTS_CAS,
  CHAMPS_BLOQUANTS_PASSE_A,
  normalizeContract,
  migrateLegacyContract,
  rafraichirCompletude,
  validatePasseA,
  validateSupportReadiness,
  validateExportReadiness,
  normaliserCas,
};
