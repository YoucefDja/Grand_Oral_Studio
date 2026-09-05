const mongoose = require('mongoose');

const themeSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Theme', themeSchema);
