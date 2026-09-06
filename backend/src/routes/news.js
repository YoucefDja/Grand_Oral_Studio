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

// GET /api/news — flux principal : articles récents + glossaire du jour.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 200);

    const articles = await NewsArticle.find()
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    // Dernier glossaire disponible (celui du jour si le cron est passé).
    const glossaire = await NewsGlossary.findOne().sort({ date: -1, createdAt: -1 }).lean();

    res.json({ articles, glossaire: glossaire || null });
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
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(articles);
  })
);

module.exports = router;
