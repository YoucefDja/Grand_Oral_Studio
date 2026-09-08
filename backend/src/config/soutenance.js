/**
 * Métadonnées du candidat pour la page de titre du .pptx de soutenance.
 * Modifiable ici ou via variables d'environnement (CANDIDAT_NOM, CANDIDAT_ANNEE).
 */
const path = require('path');
const fs = require('fs');

const NOM = process.env.CANDIDAT_NOM || 'Youcef Djarane';
const ANNEE = process.env.CANDIDAT_ANNEE || '2025-2026';

// Logo CESI embarqué dans le dépôt (backend/assets/logo_cesi.png) :
// il est déployé avec le backend, donc disponible en production (Railway).
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo_cesi.png');
const LOGO_DISPO = fs.existsSync(LOGO_PATH);

module.exports = { NOM, ANNEE, LOGO_PATH, LOGO_DISPO };
