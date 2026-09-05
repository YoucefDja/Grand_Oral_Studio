const mongoose = require('mongoose');

/**
 * Session — une session de travail d'un étudiant sur un sujet du Grand Oral.
 * Pas d'authentification : l'app est mono-utilisateur côté étudiant.
 *
 * currentStep : nombre d'étapes terminées (0 à 6).
 * ligneDirectrice : phrase « fil rouge » formulée à l'étape probleme, puis
 * réinjectée dans le prompt de toutes les étapes suivantes.
 */
const sessionSchema = new mongoose.Schema(
  {
    titre: { type: String, required: true, trim: true },
    theme: { type: String, default: '' },
    contexte: { type: String, default: '' },
    currentStep: { type: Number, default: 0 },
    ligneDirectrice: { type: String, default: '' },
    data: {
      type: Object,
      default: () => ({
        analyse: {},
        probleme: {},
        recherche: {},
        glossaire: {},
        plan: {},
        support: {},
      }),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', sessionSchema);
