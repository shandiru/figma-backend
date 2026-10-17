// Secrets stay on the backend. Never send GEMINI_API_KEY to the Figma iframe.
module.exports = {
  MONGODB_URI: process.env.MONGODB_URI || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  MAX_HTML_CHARS: 2_000_000,
  MAX_ACTIVITY_OUTPUT_CHARS: 350_000
};
