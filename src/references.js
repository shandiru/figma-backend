function badRequest(message) {
  const error = new Error(message); error.status = 400; throw error;
}

function parseReferences(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || ![0, 2, 3].includes(value.length)) badRequest('Select 2 or 3 matching viewport references.');
  const references = value.map((ref) => {
    if (!ref || !Number.isFinite(ref.width) || ref.width <= 0 || !Number.isFinite(ref.height) || ref.height <= 0 || typeof ref.html !== 'string' || !ref.html.trim()) badRequest('References need positive dimensions and non-empty markup.');
    const screenshot = ref.screenshot || '';
    if (typeof screenshot !== 'string' || screenshot.length > 2500000 || (screenshot && !/^[A-Za-z0-9+/]+={0,2}$/.test(screenshot))) badRequest('Invalid or oversized reference screenshot.');
    return { name: String(ref.name || '').slice(0, 200), width: ref.width, height: ref.height, html: ref.html, screenshot };
  }).sort((a, b) => a.width - b.width);
  if (new Set(references.map((ref) => ref.width)).size !== references.length) badRequest('Reference viewport widths must differ.');
  return references;
}

module.exports = { parseReferences };
