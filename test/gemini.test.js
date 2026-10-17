const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanModelHtml, visibleText, tagSignature } = require('../src/gemini');

test('Gemini output cleanup accepts fenced markup but rejects executable HTML', () => {
  assert.equal(cleanModelHtml('```html\n<main class="p-4">Safe</main>\n```'), '<main class="p-4">Safe</main>');
  assert.throws(() => cleanModelHtml('<main onclick="alert(1)">Unsafe</main>'), /unsafe markup/);
  assert.throws(() => cleanModelHtml('<script>alert(1)</script>'), /unsafe markup/);
});

test('Gemini guards can compare visible content and document structure', () => {
  const before = '<main><h1>Hello world</h1><p>Responsive code</p></main>';
  const after = '<main class="max-w-full"><h1 class="text-xl">Hello world</h1><p>Responsive code</p></main>';
  assert.equal(visibleText(after), visibleText(before));
  assert.equal(tagSignature(after), tagSignature(before));
  assert.notEqual(visibleText(after.replace('world', 'there')), visibleText(before));
  assert.notEqual(tagSignature(after.replace('<p>', '<section>')), tagSignature(before));
});
