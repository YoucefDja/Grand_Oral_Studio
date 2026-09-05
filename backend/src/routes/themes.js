const express = require('express');
const Theme = require('../models/Theme');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// GET /api/themes
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const themes = await Theme.find().sort({ order: 1, label: 1 }).lean();
    res.json(themes);
  })
);

module.exports = router;
