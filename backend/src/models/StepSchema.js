const mongoose = require('mongoose');

/**
 * StepSchema — description textuelle du JSON attendu en sortie pour une
 * étape donnée. Éditable en admin : un schéma de sortie peut évoluer sans
 * toucher au code.
 */
const stepSchema = new mongoose.Schema(
  {
    stepKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    jsonSchemaDescription: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StepSchema', stepSchema);
