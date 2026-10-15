const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cfg = require('./config');
const { refine, modelList, hasGeminiKey, validGeminiKeyShape } = require('./gemini');
const { fixHtml } = require('./fixer');
const { parseReferences } = require('./references');
const { connect, enabled: dbEnabled } = require('./db');
const Generation = require('./models/Generation');

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

// Figma plugin iframes send Origin: null, so we can't whitelist by origin.
// Protection = x-plugin-key header + rate limits.
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'x-plugin-key'], maxAge: 86400 }));
app.use(express.json({ limit: '8mb' }));
const limiter = (limit, msg) => rateLimit({ windowMs: 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { error: msg } });
app.use(limiter(60, 'Too many requests. Wait a minute and try again.'));

function auth(req, res, next) {
  const key = req.get('x-plugin-key') || req.query.key;
  if (cfg.PLUGIN_KEY && key !== cfg.PLUGIN_KEY) return res.status(401).json({ error: 'Invalid plugin key' });
  next();
}

// Safe DB log: never breaks a response and never waits more than 1.5s (e.g. when Atlas IP access is not allowed yet)
function startLog(doc) {
  return upsertMemoryLog({
    ...doc,
    ok: null,
    status: 'processing',
    createdAt: new Date(),
    updatedAt: new Date(),
    _id: 'mem-' + Date.now() + '-' + Math.random().toString(16).slice(2)
  });
}

async function finishLog(entry, doc) {
  const finalDoc = { ...entry, ...doc, ok: doc.ok === false ? false : true, status: doc.ok === false ? 'error' : 'done', updatedAt: new Date() };
  upsertMemoryLog(finalDoc);
  const work = (async () => { if (await connect()) await Generation.create(doc); })().catch((e) => console.error('DB log failed:', e.message));
  await Promise.race([work, new Promise((r) => setTimeout(r, 1500))]);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
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
  return { ok: true, geminiKey: hasGeminiKey(), geminiKeyValid: validGeminiKeyShape(), models: modelList(), db };
}

async function recentLogs(limit = 25, includeOutput = true) {
  const fallback = () => memoryLogs.slice(0, Math.min(limit, 100)).map((x) => (includeOutput ? x : { ...x, output: undefined }));
  return Promise.race([
    (async () => {
      if (!(await connect())) return fallback();
      const query = Generation.find({}, includeOutput ? undefined : '-output');
      const items = await query.sort({ createdAt: -1 }).limit(Math.min(limit, 100)).lean();
      return items.length ? items : fallback();
    })(),
    timeout(2500, fallback())
  ]);
}

function codePreview(x) {
  if (!x.output) return '<span class="muted">No code saved for this event.</span>';
  const code = String(x.output);
  const preview = code.length > 12000 ? code.slice(0, 12000) + '\n\n... output trimmed in dashboard ...' : code;
  return `<details><summary>View generated code (${esc(code.length)} chars)</summary><pre>${esc(preview)}</pre></details>`;
}

function statusTag(x) {
  if (x.status === 'processing' || x.ok === null) return '<span class="tag warn">processing</span>';
  if (x.ok === false || x.status === 'error') return '<span class="tag bad">error</span>';
  return '<span class="tag good">done</span>';
}

app.get('/', async (req, res) => {
  let info = { ok: true, geminiKey: false, geminiKeyValid: false, models: [], db: 'checking' };
  let items = [];
  let error = '';

  try {
    info = await status();
    items = await recentLogs(parseInt(req.query.limit, 10) || 25);
  } catch (e) {
    error = e.message;
  }

  const logsHtml = items.length
        ? items.map((x) => `<tr>
            <td>${esc(new Date(x.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Colombo' }))}</td>
            <td>${statusTag(x)}</td>
            <td><span class="tag">${esc(x.kind)}</span></td>
            <td>${esc(x.format || '-')}</td>
            <td>${esc(x.model || '-')}</td>
            <td>${esc(x.ms || 0)} ms</td>
            <td>${esc(x.inputChars || 0)} -> ${esc(x.outputChars || 0)}</td>
            <td>${esc(x.error || x.instructions || '-')}</td>
            <td>${codePreview(x)}</td>
          </tr>`).join('')
        : '<tr><td colspan="9">No logs yet. Figma plugin-la Generate or Enhance AI click pannunga.</td></tr>';

  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Design to Tailwind Backend</title>
  <meta http-equiv="refresh" content="4">
  <style>
    :root { color-scheme: dark; --bg:#08090b; --panel:#111418; --line:#29313a; --text:#f6f7f8; --muted:#9aa4af; --good:#25c26e; --bad:#ff5c5c; --warn:#ffd15a; --brand:#ffd15a; }
    body { margin:0; font:14px/1.5 Inter,system-ui,Segoe UI,sans-serif; background:var(--bg); color:var(--text); }
    main { max-width:1120px; margin:0 auto; padding:32px 18px; }
    h1 { margin:0 0 4px; font-size:26px; }
    .muted { color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:22px 0; }
    .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px; }
    .label { color:var(--muted); font-size:12px; }
    .value { font-size:17px; font-weight:700; margin-top:4px; overflow-wrap:anywhere; }
    .good { color:var(--good); } .bad { color:var(--bad); } .warn { color:var(--warn); }
    table { width:100%; border-collapse:collapse; background:var(--panel); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
    th,td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
    th { color:var(--muted); font-size:12px; font-weight:600; }
    td { font-size:13px; }
    code,.tag { background:#1b2027; border:1px solid var(--line); border-radius:999px; padding:2px 7px; }
    details { min-width:260px; }
    summary { cursor:pointer; color:var(--brand); font-weight:700; }
    pre { max-width:520px; max-height:360px; overflow:auto; margin:8px 0 0; padding:12px; border:1px solid var(--line); border-radius:8px; background:#050607; color:#d8dee6; font:12px/1.5 Consolas,monospace; white-space:pre-wrap; overflow-wrap:anywhere; }
    .tag.good { border-color:rgba(37,194,110,.35); } .tag.bad { border-color:rgba(255,92,92,.35); } .tag.warn { border-color:rgba(255,209,90,.35); }
    .error { margin:16px 0; color:var(--bad); white-space:pre-wrap; }
    @media (max-width:760px) { .grid { grid-template-columns:1fr 1fr; } table { display:block; overflow:auto; } }
  </style>
</head>
<body>
  <main>
    <h1>Design to Tailwind Backend</h1>
    <div class="muted">Figma plugin Generate / Enhance AI process logs. Page auto-refreshes every 4 seconds.</div>
    ${error ? `<div class="error">${esc(error)}</div>` : ''}
    <section class="grid">
      <div class="card"><div class="label">API</div><div class="value good">online</div></div>
      <div class="card"><div class="label">Gemini key</div><div class="value ${info.geminiKeyValid ? 'good' : 'bad'}">${info.geminiKeyValid ? 'set' : (info.geminiKey ? 'invalid' : 'missing')}</div></div>
      <div class="card"><div class="label">MongoDB</div><div class="value ${info.db === 'connected' ? 'good' : 'bad'}">${esc(info.db)}</div></div>
      <div class="card"><div class="label">Models</div><div class="value">${esc(info.models.join(', ') || '-')}</div></div>
    </section>
    <h2>Recent Logs</h2>
    <table>
      <thead><tr><th>Time</th><th>Status</th><th>Kind</th><th>Format</th><th>Model</th><th>Duration</th><th>Chars</th><th>Note / Error</th><th>Code</th></tr></thead>
      <tbody>${logsHtml}</tbody>
    </table>
  </main>
</body>
</html>`);
});

app.get('/api/health', auth, async (_req, res) => {
  res.json(await status());
});

// ---- default path: rule-based fix (no AI) ----
app.post('/api/fix', auth, async (req, res) => {
  const { html } = req.body || {};
  if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ error: 'html is required' });
  const t = Date.now();
  const event = startLog({ kind: 'fix', format: 'html', inputChars: html.length });
  const out = fixHtml(html);
  await finishLog(event, { kind: 'fix', format: 'html', inputChars: html.length, outputChars: out.html.length, changes: out.stats.total, ms: Date.now() - t, output: out.html });
  res.json({ html: out.html, stats: out.stats });
});

// ---- optional path: Gemini refine ----
app.post('/api/refine', auth, limiter(8, 'AI limit reached (8/min). Wait a bit.'), async (req, res) => {
  const { html, format = 'html', instructions = '', width, height, responsive = true } = req.body || {};
  let { screenshot } = req.body || {};
  let references;
  try { references = parseReferences(req.body && req.body.references); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ error: 'html is required' });
  if (html.length + references.reduce((size, ref) => size + ref.html.length, 0) > 350000) return res.status(413).json({ error: 'Design is too large for AI refine. Select smaller matching sections.' });
  if (!['html', 'react'].includes(format)) return res.status(400).json({ error: 'format must be html or react' });
  if (typeof responsive !== 'boolean' || (references.length && !responsive)) return res.status(400).json({ error: 'Multiple viewport references require responsive mode.' });
  if (typeof screenshot === 'string') {
    screenshot = screenshot.replace(/^data:image\/\w+;base64,/, '');
    if (screenshot.length > 4500000) screenshot = '';
  } else screenshot = '';

  const started = Date.now();
  const note = String(instructions).slice(0, 1000);
  const event = startLog({ kind: 'ai', format, instructions: note, inputChars: html.length, model: modelList()[0] || 'gemini' });
  try {
    const desktop = references[references.length - 1];
    const out = await refine({ html, format, instructions: note, screenshot, width: desktop ? desktop.width : width, height: desktop ? desktop.height : height, references, responsive });
    const ms = Date.now() - started;
    await finishLog(event, { kind: 'ai', format, model: out.model, instructions: note, inputChars: html.length, outputChars: out.code.length, ms, output: out.code });
    res.json({ code: out.code, model: out.model, ms, truncated: out.truncated });
  } catch (e) {
    await finishLog(event, { kind: 'ai', format, instructions: note, inputChars: html.length, ms: Date.now() - started, ok: false, error: e.message });
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/history', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const items = await recentLogs(limit, req.query.output === '1');
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/logs', auth, async (req, res) => {
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
