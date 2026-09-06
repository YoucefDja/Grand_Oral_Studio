/**
 * Planification quotidienne du module News (node-cron).
 *
 * Par défaut : tous les jours à 06h30 (fuseau Europe/Paris).
 * Surcharges possibles :
 *   NEWS_CRON_ENABLED=false        → désactive le cron ;
 *   NEWS_CRON_SCHEDULE="0 6 * * *" → expression cron ;
 *   NEWS_CRON_TZ="Europe/Paris"    → fuseau.
 */
const cron = require('node-cron');
const { runNewsScan } = require('./newsScanner');

let task = null;
let running = false;

const DEFAULT_SCHEDULE = '30 6 * * *';
const DEFAULT_TZ = 'Europe/Paris';

async function execScan(reason) {
  console.log(`[news] Balayage démarré (${reason})…`);
  const report = await runNewsScan();
  console.log(
    `[news] Terminé : ${report.sourcesTraitees} source(s), ${report.totalTrouves} lien(s) trouvé(s), ` +
      `${report.totalNouveaux} nouvel article / nouveaux articles, glossaire du jour : ` +
      `${report.glossaire ? 'généré' : 'non généré'}.`
  );
  return report;
}

/** Exécution sérialisée : jamais deux balayages simultanés. */
async function safeRun(reason) {
  if (running) {
    throw Object.assign(new Error('Un balayage est déjà en cours. Réessayez dans quelques instants.'), {
      status: 409,
    });
  }
  running = true;
  try {
    return await execScan(reason);
  } finally {
    running = false;
  }
}

/** Démarre le cron quotidien (appelé au boot du serveur). */
function startNewsScheduler() {
  if (String(process.env.NEWS_CRON_ENABLED).toLowerCase() === 'false') {
    console.log('[news] Cron quotidien désactivé (NEWS_CRON_ENABLED=false).');
    return null;
  }
  if (task) return task;
  const schedule = process.env.NEWS_CRON_SCHEDULE || DEFAULT_SCHEDULE;
  const tz = process.env.NEWS_CRON_TZ || DEFAULT_TZ;
  if (!cron.validate(schedule)) {
    console.warn(`[news] Expression cron invalide ("${schedule}") : planification ignorée.`);
    return null;
  }
  task = cron.schedule(
    schedule,
    () => {
      safeRun('cron quotidien').catch((err) => {
        // 409 (déjà en cours) ou erreur réseau : on loggue, pas de crash.
        console.warn('[news] Cron ignoré/échoué :', err.message);
      });
    },
    { timezone: tz }
  );
  console.log(`[news] Cron quotidien programmé : "${schedule}" (${tz}).`);
  return task;
}

/** Point d'entrée du bouton « Lancer le scraping manuellement » (admin). */
async function runManualScan() {
  return safeRun('déclenchement manuel admin');
}

module.exports = { startNewsScheduler, runManualScan };
