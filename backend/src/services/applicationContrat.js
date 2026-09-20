/**
 * Application du contrat Passe A à la session — isolée de la route pour être
 * testable hors ligne (cas 9 du cahier des charges : « une erreur de génération
 * ne doit jamais écraser le contrat précédemment validé »).
 *
 * Invariant central : l'écriture n'a lieu qu'APRÈS un parsing et une validation
 * réussis. Tant qu'une génération peut échouer (parseur, schéma, fournisseur),
 * la session en base garde son contrat intact.
 */

const {
  normalizeContract,
  rafraichirCompletude,
} = require('../domain/contratPasseA');

/**
 * Garantit la présence de l'état de workflow sur une session (sessions
 * antérieures créées avant l'introduction du champ).
 */
function assurerWorkflow(session) {
  if (!session.workflow || typeof session.workflow !== 'object') {
    session.workflow = {};
  }
  const defauts = {
    analysis: 'empty',
    contract: 'empty',
    plan: 'empty',
    glossary: 'empty',
    support: 'empty',
    export: 'blocked',
  };
  for (const [cle, valeur] of Object.entries(defauts)) {
    if (typeof session.workflow[cle] !== 'string') session.workflow[cle] = valeur;
  }
  return session.workflow;
}

/**
 * Recalcule l'état de workflow à partir de l'état réel des données.
 * Utilisé à la lecture (GET session) et après migration : l'état ne doit
 * jamais être déduit d'une coche UI, seulement des données persistées.
 */
function recalculerWorkflow(session) {
  const workflow = assurerWorkflow(session);
  const data = session.data && typeof session.data === 'object' ? session.data : {};
  const estObjetNonVide = (o) => Boolean(o) && typeof o === 'object' && Object.keys(o).length > 0;

  workflow.analysis = estObjetNonVide(data.analyse) ? 'generated' : 'empty';

  const contrat = data.contrat && typeof data.contrat === 'object' ? data.contrat : {};
  if (contrat.status === 'validated') workflow.contract = 'validated';
  else if (estObjetNonVide(contrat)) workflow.contract = 'generated';
  else workflow.contract = 'empty';

  workflow.plan = estObjetNonVide(data.plan) ? 'generated' : 'empty';

  const glossaire = data.glossaire && typeof data.glossaire === 'object' ? data.glossaire : {};
  const sources = Array.isArray(glossaire.sources) ? glossaire.sources : [];
  const termes = Array.isArray(glossaire.termes) ? glossaire.termes : [];
  workflow.glossary = sources.length > 0 && termes.length > 0 ? 'validated' : 'empty';

  workflow.support = estObjetNonVide(data.support) ? 'generated' : 'empty';

  // L'export reste bloqué tant que le support n'est pas généré et le contrat
  // validé : la conformité CESI est vérifiée séparément par `verificationExport`.
  const exportDejaValide = session.data?.verification?.export === 'ready';
  workflow.export =
    workflow.support === 'generated' && workflow.contract === 'validated' && exportDejaValide
      ? 'ready'
      : 'blocked';

  return workflow;
}

/**
 * Écrit le contrat canonique produit par la Passe A dans `session.data.contrat`.
 *
 * @param {object} session   session Mongoose (mutée en place, non sauvegardée ici)
 * @param {object} contrat   contrat DÉJÀ parsé et validé
 * @param {Function} estObjetNonVide prédicat partagé avec la route
 * @returns {{ regenere: boolean, etapesInvalidees: string[], currentStep: number }}
 */
function appliquerContratPasseA(session, contrat, estObjetNonVide) {
  if (!contrat) throw new Error('contrat manquant');

  const ancienContrat = session.data && session.data.contrat;
  const regenere = estObjetNonVide(ancienContrat);

  // Normalisation canonique : jamais d'objet LLM brut persisté.
  const canonique = normalizeContract(contrat, session.data?.analyse || {});
  const ld = canonique.ligneDirectrice;
  session.ligneDirectrice = ld;

  // Régénération : la validation précédente est caduque, l'étudiant doit
  // revalider ce nouveau contrat.
  canonique.status = 'generated';
  canonique.validatedAt = null;
  canonique.generatedAt = new Date();
  if (contrat.verification) canonique.verification = contrat.verification;
  if (!regenere && Array.isArray(contrat.champsARegenerer)) {
    canonique.champsARegenerer = contrat.champsARegenerer;
  }
  rafraichirCompletude(canonique);

  // Les étapes aval étaient bâties sur l'ancien contrat : elles doivent être
  // re-générées (recherche d'arrière-plan, plan, glossaire, support).
  const etapesInvalidees = [];
  if (regenere) {
    ['recherche', 'plan', 'glossaire', 'support'].forEach((k) => {
      if (session.data && session.data[k]) {
        session.data[k] = {};
        etapesInvalidees.push(k);
      }
    });
  }

  session.data.contrat = canonique;
  session.data.probleme = undefined;

  const workflow = assurerWorkflow(session);
  workflow.contract = 'generated';
  workflow.plan = 'empty';
  workflow.glossary = 'empty';
  workflow.support = 'empty';
  workflow.export = 'blocked';

  return { regenere, etapesInvalidees, currentStep: session.currentStep };
}

/**
 * Construit le contrat canonique à PERSISTER à partir du contrat parsé.
 *
 * Ne persiste jamais un objet LLM brut : la sortie du parseur est normalisée
 * par `normalizeContract`.
 *
 * @param {object} source   contrat parsé
 * @param {object} analyse  `session.data.analyse` (héritage mots-clés)
 * @returns {object} contrat canonique prêt à persister
 */
function construireContratSur(source, analyse = {}) {
  return normalizeContract(source || {}, analyse);
}

module.exports = {
  appliquerContratPasseA,
  construireContratSur,
  assurerWorkflow,
  recalculerWorkflow,
};
