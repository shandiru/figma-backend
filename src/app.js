const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cfg = require('./config');
const { refine, modelList } = require('./gemini');
const { fixHtml } = require('./fixer');
const { connect, enabled: dbEnabled } = require('./db');
const Generation = require('./models/Generation');

const app = express();
app.set('trust proxy', 1);

// Figma plugin iframes send Origin: null, so we can't whitelist by origin.
// Protection = x-plugin-key header + rate limits.
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'x-plugin-key'], maxAge: 86400 }));
app.use(express.json({ limit: '4mb' }));
const limiter = (limit, msg) => rateLimit({ windowMs: 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { error: msg } });
app.use(limiter(60, 'Too many requests. Wait a minute and try again.'));

function auth(req, res, next) {
  if (cfg.PLUGIN_KEY && req.get('x-plugin-key') !== cfg.PLUGIN_KEY) return res.status(401).json({ error: 'Invalid plugin key' });
  next();
}

// Safe DB log: never breaks a response and never waits more than 1.5s (e.g. when Atlas IP access is not allowed yet)
async function log(doc) {
  const work = (async () => { if (await connect()) await Generation.create(doc); })().catch((e) => console.error('DB log failed:', e.message));
  await Promise.race([work, new Promise((r) => setTimeout(r, 1500))]);
}

app.get('/', (_req, res) => res.type('text').send('Design to Tailwind API is running'));

app.get('/api/health', auth, async (_req, res) => {
  let db = 'off';
  if (dbEnabled()) { try { db = (await connect()) ? 'connected' : 'off'; } catch (e) { db = 'error: ' + e.message; } }
  res.json({ ok: true, geminiKey: !!cfg.GEMINI_API_KEY && !cfg.GEMINI_API_KEY.startsWith('PASTE_'), models: modelList(), db });
});

// ---- default path: rule-based fix (no AI) ----
app.post('/api/fix', auth, async (req, res) => {
  const { html } = req.body || {};
  if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ error: 'html is required' });
  const t = Date.now();
  const out = fixHtml(html);
  await log({ kind: 'fix', inputChars: html.length, outputChars: out.html.length, changes: out.stats.total, ms: Date.now() - t });
  res.json({ html: out.html, stats: out.stats });
});

// ---- optional path: Gemini refine ----
app.post('/api/refine', auth, limiter(8, 'AI limit reached (8/min). Wait a bit.'), async (req, res) => {
  const { html, format = 'html', instructions = '', width } = req.body || {};
  let { screenshot } = req.body || {};

  if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ error: 'html is required' });
  if (html.length > 350000) return res.status(413).json({ error: 'Design is too large for AI refine. Select a smaller frame (a section) and try again.' });
  if (!['html', 'react'].includes(format)) return res.status(400).json({ error: 'format must be html or react' });
  if (typeof screenshot === 'string') {
    screenshot = screenshot.replace(/^data:image\/\w+;base64,/, '');
    if (screenshot.length > 3500000) screenshot = '';
  } else screenshot = '';

  const started = Date.now();
  const note = String(instructions).slice(0, 1000);
  try {
    const out = await refine({ html, format, instructions: note, screenshot, width });
    const ms = Date.now() - started;
    await log({ kind: 'ai', format, model: out.model, instructions: note, inputChars: html.length, outputChars: out.code.length, ms, output: out.code });
    res.json({ code: out.code, model: out.model, ms, truncated: out.truncated });
  } catch (e) {
    await log({ kind: 'ai', format, instructions: note, inputChars: html.length, ms: Date.now() - started, ok: false, error: e.message });
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/history', auth, async (req, res) => {
  try {
    if (!(await connect())) return res.json({ items: [], note: 'MongoDB disabled' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const items = await Generation.find({}, '-output').sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large (max 4 MB). Select a smaller frame.' });
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

module.exports = app;
