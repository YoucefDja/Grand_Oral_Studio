const express = require('express');
const NewsArticle = require('../models/NewsArticle');
const { getArticleForLang } = require('../services/newsTranslate');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Pages "News" visibles par tout utilisateur connecté (user comme admin).
router.use(requireAuth);

/** Champs légers exposés dans les listes (le contenu plein est réservé au détail). */
const LIST_SELECT =
  '_id sourceName sourceUrl url title resume category tags themes publishedAt createdAt contexts';

// GET /api/news — flux principal : les articles issus des sessions de veille
// (étape « Source en ligne »), du plus récent au plus ancien.
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

    // Contexte de génération allégé (dernière entrée utile pour la carte).
    const light = articles.map((a) => ({
      ...a,
      contexts: Array.isArray(a.contexts)
        ? a.contexts
            .slice(-3)
            .reverse()
            .map((c) => ({
              sessionId: c.sessionId || null,
              sessionTitle: c.sessionTitle || '',
              sessionTheme: c.sessionTheme || '',
              problematique: c.problematique || '',
              keywords: Array.isArray(c.keywords) ? c.keywords : [],
            }))
        : [],
    }));

    res.json({ articles: light });
  })
);

// GET /api/news/articles/:id — détail complet d'un article (contenu pour la
// lecture intégrée dans l'app web/mobile). Le contenu n'est jamais envoyé en
// liste afin de garder des payloads légers.
// Paramètre optionnel ?lang=fr|en : l'article est renvoyé dans la langue
// demandée — traduit à la lecture par DeepSeek (avec cache) si sa langue
// d'origine diffère. Sans paramètre, version brute inchangée.
router.get(
  '/articles/:id',
  asyncHandler(async (req, res) => {
    const lang = String(req.query.lang || '').toLowerCase();
    const article = await getArticleForLang(req.params.id, lang === 'en' ? 'en' : lang === 'fr' ? 'fr' : null);
    res.json(article);
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
