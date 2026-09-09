/**
 * Réglages applicatifs (clé/valeur) — accès centralisé aux valeurs éditables
 * par l'admin. Le chrono de session lit « chrono_duree_minutes ».
 */
const Setting = require('../models/Setting');

const CHRONO_DUREE_KEY = 'chrono_duree_minutes';
// Valeur par défaut si le réglage n'existe pas en base : 1 h 30.
const DEFAULT_CHRONO_DUREE_MINUTES = 90;
// Bornes de saisie côté admin : 1 min minimum, 12 h maximum.
const CHRONO_DUREE_MIN = 1;
const CHRONO_DUREE_MAX = 720;

/** Lit la durée du chrono en minutes (défaut 1h30 si non configurée). */
async function lireChronoDureeMinutes() {
  const setting = await Setting.findOne({ key: CHRONO_DUREE_KEY }).lean();
  if (!setting) return DEFAULT_CHRONO_DUREE_MINUTES;
  const value = Number(setting.value);
  if (!Number.isInteger(value) || value < CHRONO_DUREE_MIN) {
    return DEFAULT_CHRONO_DUREE_MINUTES;
  }
  return Math.min(value, CHRONO_DUREE_MAX);
}

/** Normalise une durée saisie côté admin ; renvoie null si invalide. */
function validerChronoDureeMinutes(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < CHRONO_DUREE_MIN || value > CHRONO_DUREE_MAX) {
    return null;
  }
  return value;
}

/** Enregistre la durée du chrono (upsert). */
async function ecrireChronoDureeMinutes(minutes) {
  await Setting.findOneAndUpdate(
    { key: CHRONO_DUREE_KEY },
    { value: minutes },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return minutes;
}

module.exports = {
  CHRONO_DUREE_KEY,
  DEFAULT_CHRONO_DUREE_MINUTES,
  CHRONO_DUREE_MIN,
  CHRONO_DUREE_MAX,
  lireChronoDureeMinutes,
  validerChronoDureeMinutes,
  ecrireChronoDureeMinutes,
};
