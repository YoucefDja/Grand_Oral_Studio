const mongoose = require('mongoose');

/**
 * MethodologySection — un bloc de méthodologie éditable par l'admin.
 * Le contenu est concaténé pour former le prompt système lors d'une
 * génération (jamais codé en dur dans le code).
 */
const methodologySectionSchema = new mongoose.Schema(
  {
    sectionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    order: { type: Number, default: 10 },
    // ex. ["analyse", "probleme"] ou ["all"]
    appliesToSteps: {
      type: [String],
      default: ['all'],
      set: (v) => (Array.isArray(v) ? v.map((s) => String(s).trim().toLowerCase()) : v),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MethodologySection', methodologySectionSchema);
