const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('../src/config');
const { parseReferences } = require('../src/references');
const { validateOutput, refine } = require('../src/gemini');
const { buildUserText } = require('../src/prompt');

test('viewport references validate dimensions, count and unique widths', () => {
  const reference = (width) => ({ width, height: 800, html: '<section>Design</section>', screenshot: 'AQID' });
  assert.deepEqual(parseReferences([reference(1440), reference(390)]).map((ref) => ref.width), [390, 1440]);
  assert.throws(() => parseReferences([reference(390)]), /2 or 3/);
  assert.throws(() => parseReferences([reference(390), reference(390)]), /widths must differ/);
  assert.throws(() => parseReferences([reference(-1), reference(1440)]), /positive dimensions/);
  assert.throws(() => parseReferences([{ ...reference(390), screenshot: '<bad>' }, reference(1440)]), /screenshot/);
});

test('AI output cannot remove assets, rewrite protected SVGs or add document scripts', () => {
  const input = '<!--SPRITE--><style>.photo{--im:url(__IMG_photo__)}</style><svg fill="none"><use href="#i1"/></svg>';
  assert.doesNotThrow(() => validateOutput(input, input));
  assert.throws(() => validateOutput(input, input.replace('__IMG_photo__', '')), /image asset/);
  assert.throws(() => validateOutput(input, input.replace('fill="none"', 'fill="black"')), /protected SVG/);
  assert.throws(() => validateOutput(input, input + '<script>alert(1)</script>'), /output format/);
  assert.throws(() => validateOutput(input, input + '<!--SPRITE-->'), /output format/);
});

test('prompt distinguishes responsive and fixed-layout requests', () => {
  assert.match(buildUserText({ html: '<section/>', width: 1440 }), /desktop max-width/);
  assert.match(buildUserText({ html: '<section/>', width: 1440, responsive: false }), /Do not introduce responsive transformations/);
});

test('AI requests carry labeled screenshots for each viewport and omit thought parts', async () => {
  const previousFetch = global.fetch;
  const previousKey = cfg.GEMINI_API_KEY;
  cfg.GEMINI_API_KEY = 'test-key-with-no-real-service-access';
  let request;
  global.fetch = async (url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'Internal reasoning' }, { text: '<!--SPRITE--><main>Complete output</main>' }] } }] }) };
  };
  try {
    const references = parseReferences([{ name: 'Mobile', width: 390, height: 800, html: '<main>Mobile</main>', screenshot: 'AQID' }, { name: 'Desktop', width: 1440, height: 900, html: '<main>Desktop</main>', screenshot: 'BAUG' }]);
    const result = await refine({ html: '<!--SPRITE--><main>Input</main>', format: 'html', references, width: 1440 });
    assert.equal(request.contents[0].parts.filter((part) => part.inlineData).length, 2);
    assert.ok(request.contents[0].parts.some((part) => part.text && part.text.includes('"width":390')));
    assert.doesNotMatch(result.code, /Internal reasoning/);
  } finally { global.fetch = previousFetch; cfg.GEMINI_API_KEY = previousKey; }
});

test('truncated AI output is rejected rather than replacing generated code', async () => {
  const previousFetch = global.fetch;
  const previousKey = cfg.GEMINI_API_KEY;
  cfg.GEMINI_API_KEY = 'test-key-with-no-real-service-access';
  global.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '<main>Incomplete' }] } }] }) });
  try { await assert.rejects(refine({ html: '<main/>', format: 'html' }), /exceeded the code limit/); }
  finally { global.fetch = previousFetch; cfg.GEMINI_API_KEY = previousKey; }
});
