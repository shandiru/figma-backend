// All settings hardcoded here (no .env needed).
// process.env.X still wins if you ever set it in Vercel, otherwise the value below is used.
const pick = (name, fallback) => process.env[name] || fallback;

module.exports = {
  // Gemini key (only used by the optional "Enhance with AI" button)
  GEMINI_API_KEY: pick('GEMINI_API_KEY', 'PASTE_GEMINI_API_KEY_HERE'),
  GEMINI_MODEL: pick('GEMINI_MODEL', 'gemini-flash-latest'),
  GEMINI_FALLBACK_MODELS: pick('GEMINI_FALLBACK_MODELS', 'gemini-flash-lite-latest'),
  GEMINI_BASE_URL: pick('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/models'),

  // Must be the same string as PLUGIN_KEY inside plugin/ui.html
  PLUGIN_KEY: pick('PLUGIN_KEY', 'd2t-loughskin-plugin-key-2026'),

  MONGODB_URI: pick(
    'MONGODB_URI',
    'mongodb+srv://skin:skin@cluster0.z9fu7ey.mongodb.net/loughskin-email-test-figma'
  )
};
