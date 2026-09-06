const mongoose = require('mongoose');

/**
 * NewsGlossary — un jour de glossaire : la liste quotidienne des
 * acronymes / termes techniques générée par DeepSeek à partir des articles
 * du jour. Un document par jour (date unique, format YYYY-MM-DD).
 */
const newsGlossarySchema = new mongoose.Schema(
  {
    // Jour concerné, format YYYY-MM-DD (unique).
    date: { type: String, required: true, unique: true, trim: true },
    items: {
      type: [
        {
          terme: { type: String, required: true, trim: true },
          acronyme: { type: String, default: '', trim: true },
          explication: { type: String, required: true, trim: true },
        },
      ],
      default: [],
    },
    // Nombre d'articles analysés pour générer ce glossaire (traçabilité).
    sourceCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NewsGlossary', newsGlossarySchema);
