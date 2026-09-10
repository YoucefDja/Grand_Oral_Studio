const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const { connectDb } = require('./db');

// Chargement des variables d'environnement (backend/.env en local).
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const themesRouter = require('./routes/themes');
const sessionsRouter = require('./routes/sessions');
const adminRouter = require('./routes/admin');
const authRouter = require('./routes/auth');
const glossaireRouter = require('./routes/glossaire');
const settingsRouter = require('./routes/settings');
const { ensureInitialAdmin, migrateOwnerlessSessions } = require('./bootstrap');

const app = express();

// CORS : uniquement les origines frontend autorisées.
// En local sans FRONTEND_URL, on tolère les origines Vite locales.
const frontendUrls = (process.env.FRONTEND_URL || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!process.env.FRONTEND_URL) {
  console.warn('[cors] FRONTEND_URL absente : le CORS est restreint aux origines locales (http://localhost:5173...). En production, le frontend déployé sera bloqué. Définissez FRONTEND_URL = domaine exact du frontend (https://...) dans les variables Railway du backend.');
}

app.use(
  cors({
    origin(origin, callback) {
      // Requêtes sans origine (curl, santé…) autorisées.
      if (!origin || frontendUrls.includes(origin)) return callback(null, true);
      console.warn('[cors] Origine rejetée : ' + origin);
      return callback(new Error('Origine CORS non autorisée.'), false);
    },
  })
);

app.use(express.json({ limit: '1mb' }));

// Route racine — informations générales du service.
app.get('/', (_req, res) =>
  res.json({
    service: 'grand-oral-studio-backend',
    message: 'API Grand Oral Studio — assistant Grand Oral CESI',
    health: '/health',
    api: '/api',
  })
);

// Santé — utile pour les checks Railway.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/themes', themesRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/auth', authRouter);
app.use('/api/glossaire', glossaireRouter);
app.use('/api/settings', settingsRouter);

// 404 JSON pour les routes /api inconnues.
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Route API introuvable.' });
});

// Handler d'erreur global — jamais d'échec silencieux, toujours un message clair.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.message && err.message.startsWith('Origine CORS')) {
    return res.status(403).json({ message: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Identifiant invalide.' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'Un doublon existe déjà pour cet identifiant.' });
  }
  const status = Number.isInteger(err.status) ? err.status : 500;
  return res.status(status).json({ message: err.message || 'Erreur interne du serveur.' });
});

const PORT = Number(process.env.PORT || 4000);

async function start() {
  await connectDb();

  // Compte admin initial (ADMIN_EMAIL / ADMIN_PASSWORD) + migration des sessions
  // créées avant l'authentification vers ce compte.
  const admin = await ensureInitialAdmin();
  await migrateOwnerlessSessions(admin);

  app.listen(PORT, () => {
    console.log(`Grand Oral Studio backend démarré sur le port ${PORT}.`);
  });
}

start().catch((err) => {
  console.error('[démarrage] Échec de l’initialisation :', err.message);
  process.exit(1);
});
