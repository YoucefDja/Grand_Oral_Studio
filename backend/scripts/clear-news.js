/**
 * Nettoyage du module News — supprime TOUS les articles et glossaires déjà
 * récupérés/générés, pour repartir d'une base vierge.
 *
 * Usage (depuis /backend) :
 *   node scripts/clear-news.js
 *
 * Attention :
 *  - La liste des SOURCES (NewsSource, configurée dans l'admin) est CONSERVÉE.
 *  - Les thèmes, sessions et autres données ne sont pas touchés.
 */
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Chargement du .env local si présent (Railway fournit les variables d'env).
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const NewsArticle = require('../src/models/NewsArticle');
const NewsGlossary = require('../src/models/NewsGlossary');

async function clearNews() {
  const url = process.env.MONGO_URL;
  if (!url) {
    console.error('MONGO_URL manquante. Renseignez backend/.env (local) ou liez le plugin MongoDB (Railway).');
    process.exit(1);
  }
  await mongoose.connect(url, { serverSelectionTimeoutMS: 8000 });
  console.log('Connecté à MongoDB.');

  const [articlesSupp, glossairesSupp] = await Promise.all([
    NewsArticle.deleteMany({}),
    NewsGlossary.deleteMany({}),
  ]);

  console.log(`Articles supprimés : ${articlesSupp.deletedCount}`);
  console.log(`Glossaires supprimés : ${glossairesSupp.deletedCount}`);
  console.log('Sources (NewsSource) conservées. Nettoyage terminé.');
}

clearNews()
  .catch((err) => {
    console.error('Nettoyage échoué :', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
