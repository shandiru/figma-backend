const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { node, text, sampleDesign, hydrate } = require('./sample-design');
function generator() {
  const messages = [];
  const ctx = vm.createContext({ __html__: '', figma: { showUI() {}, on() {}, currentPage: { selection: [] }, ui: { postMessage: (m) => messages.push(m) }, getImageByHash: () => ({ getBytesAsync: async () => new Uint8Array([1]) }) } });
  vm.runInContext(fs.readFileSync('plugin/code.js', 'utf8'), ctx);
  return { ctx, messages };
}
test('sample preserves measured design geometry, semantic HTML, images and named colors', async () => {
  const { ctx, messages } = generator();
  ctx.figma.currentPage.selection = [hydrate(sampleDesign())];
  await vm.runInContext('generate({ responsive: true, images: true })', ctx);
  const result = messages.find((m) => m.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  assert.match(result.html, /<main/);
  assert.match(result.html, /<section/);
  assert.match(result.html, /left-\[50%\]/);
  assert.match(result.html, /w-\[46\.6667%\]/);
  assert.match(result.html, /text-6xl/);
  assert.match(result.html, /<button type="button"/);
  assert.match(result.html, /<span[^>]*>Get started<\/span>/);
  assert.match(result.html, /<img[^>]+absolute[^>]+h-\[360px\][^>]+object-cover/);
  assert.match(result.html, /src="__IMG_photo__"/);
  assert.match(result.html, /bg-design-/);
  assert.ok(Object.keys(result.colors).length >= 2);
  assert.doesNotMatch(result.html, /max-w-7xl|sm:px-6|lg:px-8/);
  assert.match(result.html, /gap-\[17px\]/); // Preserve the original spacing.
});
test('coordinate-only mixed rows are inferred; only genuine overlays are absolute', async () => {
  const { ctx } = generator();
  ctx.payload = hydrate(node('Hero', 1200, 700, [
    text('Title', 'Title', 48, { y: 0 }),
    text('Left', 'Left', 16, { y: 140, x: 0 }),
    text('Right', 'Right', 16, { y: 142, x: 600 }),
    node('Badge', 48, 24, [], { layoutPositioning: 'ABSOLUTE', x: 20, y: 20 }),
  ]));
  const html = await vm.runInContext('toHtml(payload, null, { responsive: true }, 0, { fonts: {} })', ctx);
  assert.match(html, /relative/);
  assert.equal((html.match(/\babsolute\b/g) || []).length, 1);
  assert.match(html, /flex flex-col md:flex-row gap-6/);
  assert.doesNotMatch(html, /h-\[700px\]/);
});
module.exports = { generator };

test('unnamed coordinate cards form one grid without row wrappers', async () => {
  const { ctx } = generator();
  ctx.payload = hydrate(node('Features', 1200, 500, Array.from({ length: 6 }, (_, i) =>
    node('Frame ' + i, 360, 200, [text('Label', 'Feature', 24)], { x: (i % 3) * 400, y: Math.floor(i / 3) * 240 })
  )));
  const html = await vm.runInContext('toHtml(payload, null, { responsive: true }, 0, { fonts: {} })', ctx);
  assert.match(html, /grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3/);
  assert.equal((html.match(/<div /g) || []).length, 6);
  assert.doesNotMatch(html, /class="[^"]*\babsolute\b/);
});

test('free-positioned reference layers preserve coordinates instead of introducing row wrappers', async () => {
  const { ctx, messages } = generator();
  const design = (width) => hydrate(node('Page', width, 500, [
    text('Title', 'Shared title', 36, { y: 0 }),
    text('Left', 'Left content', 16, { y: 140, x: 0 }),
    text('Right', 'Right content', 16, { y: 140, x: width / 2 }),
  ]));
  ctx.figma.currentPage.selection = [design(390), design(1440)];
  await vm.runInContext('generate({ responsive: true, images: false })', ctx);
  const result = messages.find((message) => message.type === 'result');
  assert.ok(result);
  for (const reference of result.references) {
    assert.doesNotMatch(reference.html, /data-kind="INFERRED_ROW"/);
    assert.match(reference.html, /absolute/);
    assert.match(reference.html, /Left content/);
    assert.match(reference.html, /Right content/);
  }
});
