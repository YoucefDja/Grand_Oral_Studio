const express = require('express');
const Session = require('../models/Session');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Glossaire personnel : tout utilisateur connecté consulte SES termes cumulés.
router.use(requireAuth);

/** Nettoie un terme : garde la première graphie rencontrée, dédoublonne insensible à la casse. */
function cleanTerme(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

// GET /api/glossaire — glossaire de révision propre à l'utilisateur connecté.
// Les termes proviennent des glossaires générés à l'étape « Glossaire » de ses
// sessions (données déjà validées : terme + définition courte). Chaque terme
// n'apparaît qu'une fois ; s'il revient dans plusieurs sessions, on conserve la
// définition de la session la plus récente et on référence toutes les sessions
// concernées (pour rouvrir le contexte d'origine).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Sessions du propriétaire les plus récemment mises à jour en premier :
    // la première définition rencontrée pour un terme est donc la plus fraîche.
    const sessions = await Session.find({ owner: req.userId })
      .select('titre theme updatedAt data.glossaire')
      .sort({ updatedAt: -1 })
      .lean();

    const byKey = new Map();
    for (const session of sessions) {
      const glossaire = session.data && session.data.glossaire;
      const termes = Array.isArray(glossaire && glossaire.termes) ? glossaire.termes : [];
      if (!termes.length) continue;

      const sessionRef = {
        _id: String(session._id),
        titre: String(session.titre || '').trim() || 'Session',
        theme: String(session.theme || '').trim(),
      };

      for (const item of termes) {
        const terme = cleanTerme(item && item.terme);
        if (!terme) continue;

        const key = terme.toLowerCase();
        let entry = byKey.get(key);
        if (!entry) {
          entry = { terme, definition: '', sessions: [] };
          byKey.set(key, entry);
        }
        // Définition retenue : celle de la session la plus récente ; sinon on
        // complète avec la première définition disponible.
        if (!entry.definition) {
          const definition = String(item && item.definition || '').trim();
          if (definition) entry.definition = definition;
        }
        // Dédoublonnage des références de session pour ce terme.
        if (!entry.sessions.some((s) => s._id === sessionRef._id)) {
          entry.sessions.push(sessionRef);
        }
      }
    }

    const termes = Array.from(byKey.values())
      .map((entry) => ({
        terme: entry.terme,
        definition: entry.definition,
        occurrence: entry.sessions.length,
        sessions: entry.sessions,
      }))
      .sort((a, b) => a.terme.localeCompare(b.terme, 'fr', { sensitivity: 'base' }));

    res.json({ termes, total: termes.length });
  })
);

module.exports = router;
