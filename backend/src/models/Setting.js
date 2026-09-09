const mongoose = require('mongoose');

/**
 * Setting — réglage applicatif clé/valeur, édité par l'admin.
 * Clé actuellement utilisée : « chrono_duree_minutes » (durée par défaut du
 * compte à rebours d'une session de travail, en minutes).
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
