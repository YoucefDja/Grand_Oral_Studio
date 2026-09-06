const express = require('express');
const NewsArticle = require('../models/NewsArticle');
const NewsGlossary = require('../models/NewsGlossary');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Pages "News" visibles par tout utilisateur connecté (user comme admin).
router.use(requireAuth);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Champs légers exposés dans les listes (le contenu plein est réservé au détail). */
const LIST_SELECT =
  '_id sourceName sourceUrl url title resume category tags themes publishedAt createdAt';

// GET /api/news — flux principal : articles récents + glossaire du jour.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 200);

    const query = {};
    if (req.query.theme) query.themes = String(req.query.theme);

    const articles = await NewsArticle.find(query)
      .select(LIST_SELECT)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    // Dernier glossaire disponible (celui du jour si le cron est passé).
    const glossaire = await NewsGlossary.findOne().sort({ date: -1, createdAt: -1 }).lean();

    res.json({ articles, glossaire: glossaire || null });
  })
);

// GET /api/news/articles/:id — détail complet d'un article (contenu pour la
// lecture intégrée dans l'app web/mobile). Le contenu n'est jamais envoyé en
// liste afin de garder des payloads légers.
router.get(
  '/articles/:id',
  asyncHandler(async (req, res) => {
    const article = await NewsArticle.findById(req.params.id).lean();
    if (!article) throw httpError(404, 'Article introuvable.');
    res.json(article);
  })
);

// GET /api/news/glossaire — liste des glossaires récents (historique).
router.get(
  '/glossaire',
  asyncHandler(async (_req, res) => {
    const glossaires = await NewsGlossary.find().sort({ date: -1 }).limit(15).lean();
    res.json(glossaires);
  })
);

// GET /api/news/articles — liste brute d'articles (affichage simple).
router.get(
  '/articles',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 200);
    const articles = await NewsArticle.find()
      .select(LIST_SELECT)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(articles);
  })
);

module.exports = router;
