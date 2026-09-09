const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { lireChronoDureeMinutes } = require('../services/appSettings');

const router = express.Router();

// Réglages applicatifs lus par l'app : tout utilisateur connecté.
router.use(requireAuth);

/**
 * GET /api/settings/chrono — configuration du compte à rebours de session.
 * Renvoie la durée (minutes) définie par l'admin ET l'heure serveur : le
 * frontend calibre sa pendule sur le serveur pour rester juste même si
 * l'horloge de l'étudiant dérive.
 */
router.get(
  '/chrono',
  asyncHandler(async (_req, res) => {
    const dureeMinutes = await lireChronoDureeMinutes();
    res.json({ dureeMinutes, serverNow: Date.now() });
  })
);

module.exports = router;
