const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { fixHtml } = require('./fixer');
const { connect, enabled: dbEnabled } = require('./db');
const Generation = require('./models/Generation');
const { compileCss, exportTheme } = require('./compile');
const { createArchive } = require('./export');
const { refineHtml } = require('./gemini');
const { GEMINI_API_KEY, GEMINI_MODEL, MAX_HTML_CHARS, MAX_ACTIVITY_OUTPUT_CHARS } = require('./config');
const path = require('node:path');

const app = express();
app.set('trust proxy', 1);
const memoryLogs = global._generationMemoryLogs || (global._generationMemoryLogs = []);
const upsertMemoryLog = (entry) => {
  const i = memoryLogs.findIndex((x) => x._id === entry._id);
  if (i >= 0) memoryLogs[i] = { ...memoryLogs[i], ...entry };
  else memoryLogs.unshift(entry);
  memoryLogs.splice(50);
  return entry;
};

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'], maxAge: 86400 }));
app.use(express.json({ limit: '12mb' }));
const limiter = (limit, msg) => rateLimit({ windowMs: 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { error: msg } });
app.use(limiter(120, 'Too many requests. Wait a minute and try again.'));

// Safe DB log: never breaks a response and never waits more than 1.5s (e.g. when Atlas IP access is not allowed yet)
function startLog(doc) {
  return upsertMemoryLog({
    ...doc,
    ok: null,
    status: 'processing',
    createdAt: new Date(),
    updatedAt: new Date(),
    _id: doc.runId ? 'plugin-' + doc.runId : 'mem-' + Date.now() + '-' + Math.random().toString(16).slice(2)
  });
}

async function finishLog(entry, doc) {
  const finalDoc = { ...entry, ...doc, runId: entry.runId || entry._id, ok: doc.ok === false ? false : true, status: doc.ok === false ? 'error' : 'done', updatedAt: new Date() };
  upsertMemoryLog(finalDoc);
  const { _id, ...persistDoc } = finalDoc;
  const work = (async () => { if (await connect()) await Generation.findOneAndUpdate({ runId: persistDoc.runId }, { $set: persistDoc }, { upsert: true, runValidators: true }); })().catch((e) => console.error('DB log failed:', e.message));
  await Promise.race([work, new Promise((r) => setTimeout(r, 1500))]);
}

const timeout = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

async function status() {
  let db = 'off';
  if (dbEnabled()) {
    try {
      db = await Promise.race([
        (async () => ((await connect()) ? 'connected' : 'off'))(),
        timeout(1800, 'timeout')
      ]);
    } catch (e) { db = 'error: ' + e.message; }
  }
  return { ok: true, engine: 'figma-rules', ai: { enabled: !!GEMINI_API_KEY, model: GEMINI_MODEL }, db, maxHtmlChars: MAX_HTML_CHARS, breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 } };
}

async function recentLogs(limit = 25, includeOutput = true) {
  const fallback = () => memoryLogs.slice(0, Math.min(limit, 100)).map((x) => (includeOutput ? x : { ...x, output: undefined }));
  const merge = (items) => {
    const entries = new Map();
    for (const entry of [...items, ...fallback()]) {
      const key = entry.runId || String(entry._id), previous = entries.get(key);
      if (!previous || new Date(entry.updatedAt || entry.createdAt) >= new Date(previous.updatedAt || previous.createdAt)) entries.set(key, entry);
    }
    return [...entries.values()].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, Math.min(limit, 100));
  };
  return Promise.race([
    (async () => {
      if (!(await connect())) return fallback();
      const query = Generation.find({}, includeOutput ? undefined : '-output');
      const items = await query.sort({ createdAt: -1 }).limit(Math.min(limit, 100)).lean();
      return merge(items);
    })().catch(() => fallback()),
    timeout(2500, fallback())
  ]);
}

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.get('/api/health', async (_req, res) => {
  res.json(await status());
});

function operationLog(kind, runId) {
  const previous = memoryLogs.find((entry) => entry._id === 'plugin-' + runId);
  const entry = previous || startLog({ kind, runId, format: 'html', stages: [] });
  const stage = (message) => {
    entry.stage = message;
    entry.stages = [...(entry.stages || []), { stage: message, phase: 'progress', at: new Date() }].slice(-80);
    entry.updatedAt = new Date();
    upsertMemoryLog(entry);
    console.log(`[${kind}:${runId}] ${message}`);
  };
  return { entry, stage };
}

const validRun = (value) => typeof value === 'string' && /^[a-zA-Z0-9-]{8,100}$/.test(value);
app.post('/api/generate', limiter(15, 'Generation limit reached. Wait a minute.'), async (req, res) => {
  const { html, theme, runId } = req.body || {};
  if (!validRun(runId)) return res.status(400).json({ error: 'A valid runId is required' });
  if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ error: 'HTML is required' });
  if (html.length > MAX_HTML_CHARS) return res.status(413).json({ error: `HTML is ${html.length.toLocaleString()} characters; the maximum is ${MAX_HTML_CHARS.toLocaleString()}. Split the design into smaller matching sections.` });
  let safeTheme;
  try { safeTheme = exportTheme(theme); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const started = Date.now(), { entry, stage } = operationLog('generate', runId);
  try {
    stage('Cleaning semantic HTML and Tailwind utilities');
    let result = fixHtml(html);
    let aiResult = { applied: false, reason: 'Gemini is not configured; exact deterministic output was used' };
    if (GEMINI_API_KEY) {
      stage(`Polishing responsive markup with ${GEMINI_MODEL}`);
      aiResult = await refineHtml(result.html);
      if (aiResult.applied) result = fixHtml(aiResult.html);
      else stage(aiResult.reason);
    }
    stage('Compiling mobile, sm, md, lg, xl and 2xl styles');
    const css = await compileCss(result.html, safeTheme);
    stage('Responsive HTML and compiled CSS ready');
    await finishLog(entry, { output: result.html, outputChars: result.html.length, inputChars: html.length, ms: Date.now() - started });
    res.json({ html: result.html, css, stats: result.stats, runId, ai: { applied: aiResult.applied, reason: aiResult.reason, model: GEMINI_MODEL } });
  } catch (error) {
    await finishLog(entry, { ok: false, error: error.message, ms: Date.now() - started });
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/refine', limiter(10, 'Gemini limit reached. Wait a minute.'), async (req, res) => {
  const { html, theme, runId, instruction } = req.body || {};
  if (!validRun(runId)) return res.status(400).json({ error: 'A valid runId is required' });
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'Gemini is not configured on the backend. Add GEMINI_API_KEY to the hosting environment and redeploy.' });
  if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ error: 'Generated HTML is required before running Gemini' });
  if (html.length > MAX_HTML_CHARS) return res.status(413).json({ error: `HTML exceeds the ${MAX_HTML_CHARS.toLocaleString()} character limit` });
  if (instruction !== undefined && (typeof instruction !== 'string' || instruction.length > 1000)) return res.status(400).json({ error: 'Gemini instruction must be under 1000 characters' });
  let safeTheme;
  try { safeTheme = exportTheme(theme); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const started = Date.now(), { entry, stage } = operationLog('generate', runId);
  try {
    stage(`Reviewing responsive code with ${GEMINI_MODEL}`);
    const refined = await refineHtml(fixHtml(html).html, instruction);
    if (!refined.applied) throw new Error(refined.reason || 'Gemini could not refine the code');
    const result = fixHtml(refined.html);
    stage('Compiling Gemini-refined Tailwind CSS');
    const css = await compileCss(result.html, safeTheme);
    stage('Gemini responsive polish ready');
    await finishLog(entry, { output: result.html, outputChars: result.html.length, inputChars: html.length, ms: Date.now() - started });
    res.json({ html: result.html, css, stats: result.stats, runId, ai: { applied: true, model: GEMINI_MODEL } });
  } catch (error) {
    await finishLog(entry, { ok: false, error: error.message, ms: Date.now() - started });
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/export', limiter(10, 'Export limit reached. Wait a minute.'), async (req, res) => {
  if (!validRun(req.body?.runId)) return res.status(400).json({ error: 'A valid runId is required' });
  const started = Date.now(), { entry, stage } = operationLog('export', req.body.runId);
  try {
    const { buffer, html } = await createArchive(req.body, stage);
    stage('ZIP ready for download');
    await finishLog(entry, { ms: Date.now() - started, output: html, outputChars: html.length });
    res.set('Content-Disposition', 'attachment; filename="design.zip"').type('application/zip').send(buffer);
  } catch (error) {
    await finishLog(entry, { ok: false, error: error.message, ms: Date.now() - started });
    res.status(400).json({ error: error.message });
  }
});

// Figma extraction, compilation and export share a run timeline.
app.post('/api/events', async (req, res) => {
  const { runId, kind, phase, stage, output, ms } = req.body || {};
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(runId) || !['generate', 'export'].includes(kind) || !['started', 'progress', 'done', 'error'].includes(phase)) return res.status(400).json({ error: 'Invalid activity event' });
  if (output !== undefined && (typeof output !== 'string' || output.length > MAX_ACTIVITY_OUTPUT_CHARS)) return res.status(400).json({ error: `Activity output exceeds ${MAX_ACTIVITY_OUTPUT_CHARS.toLocaleString()} characters` });
  const id = 'plugin-' + runId;
  const previous = memoryLogs.find((entry) => entry._id === id);
  const timestamp = new Date();
  const stages = [...(previous?.stages || []), { stage: String(stage || phase).slice(0, 500), phase, at: timestamp }].slice(-80);
  const doc = { runId, kind, stages, format: 'html', stage: String(stage || phase).slice(0, 500),
    status: phase === 'error' ? 'error' : phase === 'done' ? 'done' : 'processing',
    ok: phase === 'error' ? false : phase === 'done' ? true : null,
    ...(output !== undefined ? { output, outputChars: output.length } : {}),
    ...(Number.isFinite(ms) && ms >= 0 ? { ms } : {}), updatedAt: timestamp };
  upsertMemoryLog({ ...previous, ...doc, _id: id, createdAt: previous ? previous.createdAt : timestamp });
  // Upsert stages too: Vercel requests can reach different warm instances.
  const persist = (async () => { if (await connect()) await Generation.findOneAndUpdate({ runId }, { $set: doc, $setOnInsert: { createdAt: timestamp } }, { upsert: true, runValidators: true }); })().catch((error) => console.error('Activity log failed:', error.message));
  await Promise.race([persist, timeout(1500)]);
  res.json({ ok: true, runId });
});

// Compile the current markup on Express.
app.post('/api/compile', limiter(10, 'Export limit reached. Wait a minute.'), async (req, res) => {
  const { html, theme } = req.body || {};
  if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ error: 'HTML is required' });
  if (html.length > MAX_HTML_CHARS) return res.status(413).json({ error: `HTML exceeds the ${MAX_HTML_CHARS.toLocaleString()} character limit` });
  let safeTheme;
  try { safeTheme = exportTheme(theme); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  try { res.json({ css: await compileCss(html, safeTheme) }); }
  catch (error) { res.status(500).json({ error: 'Tailwind compilation failed: ' + error.message }); }
});

// Normalize generated utility classes.
app.post('/api/fix', async (req, res) => {
  const { html } = req.body || {};
  if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ error: 'html is required' });
  const t = Date.now();
  const event = startLog({ kind: 'fix', format: 'html', inputChars: html.length });
  const out = fixHtml(html);
  await finishLog(event, { kind: 'fix', format: 'html', inputChars: html.length, outputChars: out.html.length, changes: out.stats.total, ms: Date.now() - t, output: out.html });
  res.json({ html: out.html, stats: out.stats });
});

app.get('/api/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const items = await recentLogs(limit, req.query.output === '1');
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    res.json({ items: await recentLogs(limit, true) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large (max 8 MB). Select smaller matching sections.' });
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

module.exports = app;
