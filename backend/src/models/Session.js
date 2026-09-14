const mongoose = require('mongoose');

/**
 * Session — une session de travail d'un étudiant sur un sujet du Grand Oral.
 * Pas d'authentification : l'app est mono-utilisateur côté étudiant.
 *
 * currentStep : nombre d'étapes terminées (0 à 7).
 * ligneDirectrice : phrase « fil rouge » formulée à l'étape probleme, puis
 * réinjectée dans le prompt de toutes les étapes suivantes.
 */
const sessionSchema = new mongoose.Schema(
  {
    titre: { type: String, required: true, trim: true },
    theme: { type: String, default: '' },
    // Propriétaire : chaque utilisateur ne voit que ses propres sessions.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    currentStep: { type: Number, default: 0 },
    ligneDirectrice: { type: String, default: '' },
    // Début du chrono de session (compte à rebours) : posé à la création, ou
    // a posteriori via POST /:id/start-chrono pour les sessions antérieures.
    startedAt: { type: Date, default: null },
    data: {
      type: Object,
      default: () => ({
        analyse: {},
        probleme: {},
        // Produit automatiquement en arrière-plan, jamais montré à l'étudiant.
        recherche: {},
        plan: {},
        glossaire: {},
        support: {},
      }),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', sessionSchema);
