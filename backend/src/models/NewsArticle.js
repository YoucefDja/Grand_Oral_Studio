const mongoose = require('mongoose');

/**
 * NewsArticle — un article récupéré par le module News.
 *
 * Anti-doublon : l'URL d'origine est unique en base. Un article dont l'URL (ou
 * le hash de titre) existe déjà est ignoré, jamais récupéré deux fois.
 */
const newsArticleSchema = new mongoose.Schema(
  {
    // Source d'origine (copie dénormalisée du NewsSource, pour l'affichage).
    sourceName: { type: String, required: true, trim: true },
    sourceUrl: { type: String, default: '', trim: true },
    // URL unique d'origine (anti-doublon) + hash de sécurité.
    url: { type: String, required: true, unique: true, trim: true },
    titleHash: { type: String, index: true },
    title: { type: String, required: true, trim: true },
    resume: { type: String, default: '' },
    // Date de publication (si disponible) sinon date de récupération.
    publishedAt: { type: Date, default: null },
    // Classement produit par DeepSeek (thème IA / Big Data, etc.).
    category: { type: String, default: '' },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

newsArticleSchema.index({ publishedAt: -1 });
newsArticleSchema.index({ sourceName: 1 });

module.exports = mongoose.model('NewsArticle', newsArticleSchema);
