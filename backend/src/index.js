const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

const { connectDb } = require('./db');
const { APP_VERSION, environnement } = require('./config/version');

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

// Derrière un proxy (Railway), on fait confiance au premier hop pour l'IP.
app.set('trust proxy', 1);

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
    // Le frontend lit ces deux en-têtes pour afficher la référence et vérifier
    // la version déployée : sans exposition explicite, le navigateur les masque.
    exposedHeaders: ['X-Request-Id', 'X-App-Version'],
  })
);

app.use(express.json({ limit: '1mb' }));

/**
 * Identifiant de requête + version, posés AVANT tout routage pour qu'ils soient
 * présents sur TOUTES les réponses, y compris les erreurs et les 404. C'est ce
 * qui permet de retrouver une tentative précise dans les logs de production.
 */
app.use((req, res, next) => {
  const recu = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].trim() : '';
  req.requestId = req.requestId || (recu && recu.length <= 128 ? recu : crypto.randomUUID());
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('X-App-Version', APP_VERSION);
  next();
});

// Route racine — informations générales du service.
app.get('/', (_req, res) =>
  res.json({
    service: 'grand-oral-backend',
    message: 'API Grand Oral Studio — assistant Grand Oral CESI',
    version: APP_VERSION,
    health: '/api/health',
    api: '/api',
  })
);

// Santé — utile pour les checks Railway.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Diagnostic de DÉPLOIEMENT : aucun secret, uniquement de quoi confirmer depuis
// la production quelle version est réellement servie.
app.get('/api/health', (_req, res) =>
  res.json({
    status: 'ok',
    service: 'grand-oral-backend',
    version: APP_VERSION,
    environment: environnement(),
  })
);

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
// Les erreurs portant un CODE APPLICATIF (INVALID_LLM_JSON, AI_TIMEOUT…) sont
// renvoyées sous la forme { error: { code, message, requestId } } pour que le
// frontend puisse mapper un message utilisateur sans jamais parser de HTML ni de
// body vide, et afficher une référence corrélable avec les logs serveur.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const requestId = res.getHeader('X-Request-Id') || _req.requestId || undefined;
  if (err.message && err.message.startsWith('Origine CORS')) {
    return res.status(403).json({ message: err.message, requestId });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Identifiant invalide.', requestId });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message, requestId });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'Un doublon existe déjà pour cet identifiant.', requestId });
  }
  // `err.code` de Mongoose est numérique (ex. 11000) : on ne traite comme code
  // applicatif que les chaînes (nos codes métier).
  const codeApplicatif = typeof err.code === 'string' ? err.code : undefined;
  const status = Number.isInteger(err.status) ? err.status : 500;
  if (codeApplicatif) {
    // Le détail technique reste côté serveur : il ne part jamais au client.
    if (err.detailTechnique) {
      console.error('[erreur]', codeApplicatif, err.detailTechnique);
    }
    return res.status(status).json({
      error: {
        code: codeApplicatif,
        message: err.message || 'Erreur interne du serveur.',
        requestId,
      },
    });
  }
  return res.status(status).json({ message: err.message || 'Erreur interne du serveur.', requestId });
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
