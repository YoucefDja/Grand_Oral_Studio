const mongoose = require('mongoose');

/**
 * Utilisateur de la plateforme.
 *
 * rôles :
 *  - "admin" : accès complet (admin + gestion des utilisateurs) — créé une
 *    seule fois au démarrage depuis ADMIN_EMAIL / ADMIN_PASSWORD ;
 *  - "user"  : invité par un admin (email → lien de configuration du mot de
 *    passe), voit uniquement ses propres sessions.
 *
 * Un utilisateur "user" est en attente tant que passwordHash est vide
 * (invitation non acceptée).
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    passwordHash: { type: String, default: '' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    // Token d'invitation jetable pour la configuration du mot de passe.
    inviteToken: { type: String, default: null },
    inviteExpires: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    _id: this._id,
    email: this.email,
    role: this.role,
    acceptedAt: this.acceptedAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
