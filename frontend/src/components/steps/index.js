import StepAnalyse from './StepAnalyse.jsx';
import StepProbleme from './StepProbleme.jsx';
import StepSource from './StepSource.jsx';
import StepRecherche from './StepRecherche.jsx';
import StepGlossaire from './StepGlossaire.jsx';
import StepPlan from './StepPlan.jsx';
import StepSupport from './StepSupport.jsx';

/** Registre : un composant par étape (clés alignées avec le backend). */
export const stepComponents = {
  analyse: StepAnalyse,
  probleme: StepProbleme,
  source: StepSource,
  recherche: StepRecherche,
  glossaire: StepGlossaire,
  plan: StepPlan,
  support: StepSupport,
};
