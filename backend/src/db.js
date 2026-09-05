const mongoose = require('mongoose');

/**
 * Connexion MongoDB. L'URL provient exclusivement de la variable
 * d'environnement MONGO_URL (jamais hardcodée).
 */
async function connectDb() {
  const url = process.env.MONGO_URL;
  if (!url) {
    throw new Error(
      'MONGO_URL est manquante. Liez le plugin MongoDB au service (Railway) ' +
        'ou renseignez MONGO_URL dans backend/.env pour le développement local.'
    );
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(url, {
    serverSelectionTimeoutMS: 8000,
  });
  console.log('Connexion MongoDB établie.');
}

module.exports = { connectDb };
