import StepAnalyse from './StepAnalyse.jsx';
import StepProbleme from './StepProbleme.jsx';
import StepGlossaire from './StepGlossaire.jsx';
import StepPlan from './StepPlan.jsx';
import StepSupport from './StepSupport.jsx';

/**
 * Registre : un composant par étape visible (clés alignées avec le backend).
 * La recherche documentaire n'a plus de composant : elle est produite en
 * arrière-plan par le backend au moment de générer le plan.
 */
export const stepComponents = {
  analyse: StepAnalyse,
  probleme: StepProbleme,
  plan: StepPlan,
  glossaire: StepGlossaire,
  support: StepSupport,
};
