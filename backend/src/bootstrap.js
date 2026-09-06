/**
 * Initialisation à froid de l'application :
 *  1. s'assure qu'un compte admin initial existe (ADMIN_EMAIL / ADMIN_PASSWORD) ;
 *  2. rattache les sessions sans propriétaire (créées avant l'auth) au compte admin.
 */
const User = require('./models/User');
const Session = require('./models/Session');
const { hashPassword } = require('./services/password');

const DEFAULT_ADMIN_EMAIL = 'admin@tension.local';

async function ensureInitialAdmin() {
  const email = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      '[bootstrap] ADMIN_PASSWORD absente : le compte admin initial ne peut pas être créé/activé. ' +
        'Définissez ADMIN_PASSWORD (et ADMIN_EMAIL) sur Railway.'
    );
  }
  if (email === DEFAULT_ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    console.warn(
      `[bootstrap] ADMIN_EMAIL absente : utilisation de l'email par défaut "${DEFAULT_ADMIN_EMAIL}". ` +
        'Définissez ADMIN_EMAIL sur Railway pour personnaliser la connexion admin.'
    );
  }

  const existing = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
  if (existing) {
    // Synchronise l'email/mot de passe admin depuis l'environnement.
    let changed = false;
    if (email && existing.email !== email) {
      existing.email = email;
      changed = true;
    }
    if (process.env.ADMIN_PASSWORD) {
      const { verifyPassword } = require('./services/password');
      if (!verifyPassword(process.env.ADMIN_PASSWORD, existing.passwordHash || '')) {
        existing.passwordHash = hashPassword(process.env.ADMIN_PASSWORD);
        changed = true;
      }
    }
    if (changed) await existing.save();
    return existing;
  }

  if (!process.env.ADMIN_PASSWORD) return null;
  const admin = await User.create({
    email,
    role: 'admin',
    passwordHash: hashPassword(process.env.ADMIN_PASSWORD),
    acceptedAt: new Date(),
  });
  console.log(`[bootstrap] Compte admin initial créé : ${admin.email} (rôle admin).`);
  return admin;
}

/** Rattache les anciennes sessions (pré-auth) au compte admin. */
async function migrateOwnerlessSessions(admin) {
  if (!admin) return;
  const res = await Session.updateMany(
    { owner: { $exists: false } },
    { $set: { owner: admin._id } }
  );
  if (res.modifiedCount > 0) {
    console.log(`[bootstrap] ${res.modifiedCount} session(s) rattachée(s) au compte admin.`);
  }
}

module.exports = { ensureInitialAdmin, migrateOwnerlessSessions, DEFAULT_ADMIN_EMAIL };
