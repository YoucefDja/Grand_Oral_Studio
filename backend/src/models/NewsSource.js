const mongoose = require('mongoose');

/**
 * NewsSource — un site source interrogé par le module News.
 * Le scraping quotidien ne lit que les sources actives (active: true).
 * Géré dynamiquement par l'admin (onglet News → Sources).
 */
const newsSourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // URL "racine" du site source (page de liste, catégorie ou flux).
    url: { type: String, required: true, trim: true, unique: true },
    active: { type: Boolean, default: true },
    description: { type: String, default: '', trim: true },
    lastScrapedAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NewsSource', newsSourceSchema);
