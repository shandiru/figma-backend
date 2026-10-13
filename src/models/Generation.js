const mongoose = require('mongoose');

const GenerationSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['fix', 'ai'], default: 'ai' },
    format: { type: String, enum: ['html', 'react'], default: 'html' },
    changes: Number,
    model: String,
    instructions: String,
    inputChars: Number,
    outputChars: Number,
    ms: Number,
    ok: { type: Boolean, default: true },
    error: String,
    output: String
  },
  { timestamps: true }
);

module.exports = mongoose.models.Generation || mongoose.model('Generation', GenerationSchema);
