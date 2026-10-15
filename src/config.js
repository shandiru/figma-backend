// Gemini credentials are server environment variables only. Never commit API keys.
// Other legacy settings below still support server environment overrides.
const pick = (name, fallback) => process.env[name] || fallback;

module.exports = {
  // Gemini key (only used by the optional "Enhance with AI" button)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: pick('GEMINI_MODEL', 'gemini-3.8-flash'),
  GEMINI_FALLBACK_MODELS: pick('GEMINI_FALLBACK_MODELS', 'gemini-3.5-flash-lite'),
  GEMINI_BASE_URL: pick('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/models'),

  // Must be the same string as PLUGIN_KEY inside plugin/ui.html
  PLUGIN_KEY: pick('PLUGIN_KEY', 'd2t-loughskin-plugin-key-2026'),

  MONGODB_URI: pick(
    'MONGODB_URI',
    'mongodb+srv://skin:skin@cluster0.z9fu7ey.mongodb.net/loughskin-email-test-figma'
  )
};
