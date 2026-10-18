const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { node, text, sampleDesign, hydrate } = require('./sample-design');

function generator() {
  const messages = [];
  const ctx = vm.createContext({ __html__: '', figma: { showUI() {}, on() {}, currentPage: { selection: [] }, ui: { postMessage: message => messages.push(message) }, getImageByHash: () => ({ getBytesAsync: async () => new Uint8Array([1]) }) } });
  vm.runInContext(fs.readFileSync('plugin/code.js', 'utf8'), ctx);
  return { ctx, messages };
}

test('generation preserves exact desktop geometry and returns an exact mobile reference', async () => {
  const { ctx, messages } = generator();
  const mobile = sampleDesign(); mobile.id = 'Mobile'; mobile.name = 'Mobile'; mobile.width = 390;
  const desktop = sampleDesign(); desktop.id = 'Desktop'; desktop.name = 'Desktop';
  ctx.figma.currentPage.selection = [hydrate(desktop), hydrate(mobile)];
  await vm.runInContext('generate({ responsive: true, exact: false, images: true })', ctx);
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  assert.equal(result.responsive, true);
  assert.deepEqual(Array.from(result.references, reference => reference.width), [390, 1440]);
  assert.match(result.html, /<main/);
  assert.match(result.html, /<section/);
  assert.match(result.html, /w-\[1440px\]/);
  assert.match(result.html, /left-\[600px\]/);
  assert.match(result.html, /w-\[560px\]/);
  assert.match(result.html, /text-6xl/);
  assert.match(result.html, /<button type="button"/);
  assert.match(result.html, /<span[^>]*>Get started<\/span>/);
  assert.match(result.html, /<div[^>]+absolute[^>]+h-\[360px\][^>]+im1/);
  assert.match(result.html, /url\(__IMG_photo__\)/);
  assert.match(result.html, /bg-design-/);
  assert.ok(Object.keys(result.colors).length >= 2);
  assert.doesNotMatch(result.html, /(?:sm|md|lg|xl|2xl):/);
});

test('free-positioned children keep exact coordinates in each viewport tree', async () => {
  const { ctx, messages } = generator();
  const desktop = hydrate(node('Desktop', 1200, 500, [
    text('Title', 'Shared title', 36, { y: 0 }),
    text('Left', 'Left content', 16, { y: 140, x: 0 }),
    text('Right', 'Right content', 16, { y: 140, x: 600 })
  ]));
  const mobile = hydrate(node('Mobile', 390, 500, [text('Title mobile', 'Shared title', 28, { y: 0 })]));
  ctx.figma.currentPage.selection = [desktop, mobile];
  await vm.runInContext('generate({ images: false })', ctx);
  const result = messages.find(message => message.type === 'result');
  assert.ok(result);
  assert.match(result.html, /left-\[600px\]/);
  assert.match(result.html, /top-\[140px\]/);
  assert.doesNotMatch(result.html, /md:flex-row|grid-cols/);
});
