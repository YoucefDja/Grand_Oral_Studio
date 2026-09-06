/**
 * Hachage / vérification de mots de passe — scrypt natif de Node.js
 * (aucune dépendance externe). Format stocké : "scrypt:<salt>:<hash hex>".
 */
const { scryptSync, randomBytes, timingSafeEqual } = require('crypto');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hex] = parts;
  const expected = Buffer.from(hex, 'hex');
  const actual = scryptSync(String(password), salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function generateInviteToken() {
  return randomBytes(24).toString('hex');
}

module.exports = { hashPassword, verifyPassword, generateInviteToken };
