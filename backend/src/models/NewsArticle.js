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
    // Contenu intégral (texte nettoyé) — permet la lecture de l'article DANS
    // l'application (web + mobile), sans redirection obligatoire.
    content: { type: String, default: '' },
    // Thèmes admin (labels de la collection Theme) jugés pertinents par DeepSeek.
    themes: { type: [String], index: true, default: [] },
    // Langue d'origine détectée à la première lecture (fr|en) — permet de
    // savoir si une traduction est nécessaire selon la langue choisie.
    originalLang: { type: String, enum: ['fr', 'en'], default: null },
    // Traductions générées À LA LECTURE par DeepSeek (cache). Un article n'est
    // traduit que si un utilisateur l'ouvre réellement dans l'autre langue.
    translations: {
      type: [
        {
          lang: { type: String, enum: ['fr', 'en'] },
          title: { type: String, default: '' },
          resume: { type: String, default: '' },
          content: { type: String, default: '' },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
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
