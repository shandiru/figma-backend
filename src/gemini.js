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
  const text = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || '').join('') : '';
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
  return hasGeminiKey() && /^AIza[0-9A-Za-z_-]{20,}$/.test(cfg.GEMINI_API_KEY);
}

async function refine({ html, format, instructions, screenshot, width, height }) {
  if (!hasGeminiKey()) throw httpError(500, 'Gemini key not set. Paste a valid Google AI Studio API key in backend/src/config.js (GEMINI_API_KEY) or set GEMINI_API_KEY in Vercel.');
  if (!validGeminiKeyShape()) throw httpError(401, 'Gemini API key is invalid. Use a Google AI Studio key that starts with AIza...');

  const parts = [];
  if (screenshot) parts.push({ inlineData: { mimeType: 'image/jpeg', data: screenshot } });
  parts.push({ text: buildUserText({ html, format, instructions, width, height }) });

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastErr;
  for (const model of modelList()) {
    const left = deadline - Date.now();
    if (left < 3000) break;
    try {
      const out = await callModel(model, parts, AbortSignal.timeout(left));
      return { code: stripFences(out.text), model, truncated: out.truncated };
    } catch (e) {
      lastErr = e.name === 'TimeoutError' ? httpError(504, 'Gemini timed out') : e;
      if (lastErr.status === 401 || lastErr.status === 403) {
        throw httpError(lastErr.status, 'Gemini authentication failed. Check GEMINI_API_KEY in backend/src/config.js or Vercel env; use a Google AI Studio API key.');
      }
      if (!RETRY_STATUS.includes(lastErr.status)) throw lastErr;
    }
  }
  const status = lastErr && lastErr.status === 429 ? 429 : 502;
  throw httpError(status, lastErr ? `All Gemini models failed: ${lastErr.message}` : 'No time left to call Gemini');
}

module.exports = { refine, modelList, hasGeminiKey, validGeminiKeyShape };
