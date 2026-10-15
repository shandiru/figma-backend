const { SYSTEM, buildUserText } = require('./prompt');
const cfg = require('./config');

const BASE = cfg.GEMINI_BASE_URL;
const RETRY_STATUS = [404, 429, 500, 502, 503, 504]; // try the next model on these
const TOTAL_BUDGET_MS = 52000; // Vercel maxDuration is 60s

function modelList() {
  const list = [
    cfg.GEMINI_MODEL,
    ...(cfg.GEMINI_FALLBACK_MODELS || '').split(',')
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function callModel(model, parts, signal) {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 32768 }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(res.status, (data.error && data.error.message) || `Gemini HTTP ${res.status}`);

  const cand = data.candidates && data.candidates[0];
  const text = cand && cand.content && cand.content.parts ? cand.content.parts.filter((p) => !p.thought).map((p) => p.text || '').join('') : '';
  if (!text.trim()) {
    const why = (data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason) || 'empty response';
    throw httpError(422, `Gemini returned no code (${why})`);
  }
  return { text, truncated: cand.finishReason === 'MAX_TOKENS' };
}

const stripFences = (s) =>
  s.trim().replace(/^```[a-zA-Z]*\s*\n/, '').replace(/\n?```\s*$/, '').trim();

function hasGeminiKey() {
  return !!cfg.GEMINI_API_KEY && !cfg.GEMINI_API_KEY.startsWith('PASTE_');
}

function validGeminiKeyShape() {
  // Key formats can evolve; only Google can validate authentication.
  return hasGeminiKey() && cfg.GEMINI_API_KEY.length >= 20 && !/\s/.test(cfg.GEMINI_API_KEY);
}

async function refine({ html, format, instructions, screenshot, width, height, references = [], responsive = true }) {
  if (!hasGeminiKey()) throw httpError(503, 'Set GEMINI_API_KEY in your server environment (Vercel Settings > Environment Variables), then redeploy. Never commit the key.');
  if (!validGeminiKeyShape()) throw httpError(401, 'GEMINI_API_KEY has an invalid format. Set a current Google AI Studio API key in the server environment.');

  const parts = [];
  parts.push({ text: buildUserText({ html, format, instructions, width, height, references, responsive }) });
  if (references.length) {
    for (const ref of references) {
      parts.push({ text: 'VIEWPORT REFERENCE (JSON data):\n' + JSON.stringify({ name: ref.name, width: ref.width, height: ref.height, html: ref.html }) });
      if (ref.screenshot) parts.push({ inlineData: { mimeType: 'image/jpeg', data: ref.screenshot } });
    }
  } else if (screenshot) parts.push({ inlineData: { mimeType: 'image/jpeg', data: screenshot } });

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastErr;
  for (const model of modelList()) {
    const left = deadline - Date.now();
    if (left < 3000) break;
    try {
      const out = await callModel(model, parts, AbortSignal.timeout(left));
      if (out.truncated) throw httpError(422, 'AI output exceeded the code limit. Select a smaller section.');
      const code = stripFences(out.text);
      validateOutput(html, code, format);
      return { code, model, truncated: false };
    } catch (e) {
      lastErr = e.name === 'TimeoutError' ? httpError(504, 'Gemini timed out') : e;
      if (lastErr.status === 401 || lastErr.status === 403) {
        throw httpError(lastErr.status, 'Gemini authentication failed. Update GEMINI_API_KEY in the server environment with a current Google AI Studio key, then redeploy.');
      }
      if (!RETRY_STATUS.includes(lastErr.status)) throw lastErr;
    }
  }
  const status = lastErr && lastErr.status === 429 ? 429 : 502;
  throw httpError(status, lastErr ? `All Gemini models failed: ${lastErr.message}` : 'No time left to call Gemini');
}

function validateOutput(input, output, format = 'html') {
  const markers = output.match(/<!--SPRITE-->/g) || [];
  if (markers.length !== 1 || /<(?:script|html|head|body)\b/i.test(output)) throw httpError(422, 'AI changed the output format. Your generated code is preserved.');
  for (const token of new Set(input.match(/__IMG_[A-Za-z0-9_-]+__/g) || [])) {
    if (!output.includes(token)) throw httpError(422, 'AI removed an image asset. Your generated code is preserved.');
  }
  for (const svg of format === 'html' ? input.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/g) || [] : []) {
    if (!output.includes(svg)) throw httpError(422, 'AI changed a protected SVG. Your generated code is preserved.');
  }
}

module.exports = { refine, modelList, hasGeminiKey, validGeminiKeyShape, validateOutput };
