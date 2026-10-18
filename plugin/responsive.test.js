const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ui = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
const appStart = '<script id="plugin-app">';
const script = ui.slice(ui.indexOf(appStart) + appStart.length, ui.lastIndexOf('</script>'));

const frame = (id, width = 1440) => ({
  id, name: id, type: 'FRAME', x: 0, y: 0, width, height: 900,
  layoutMode: 'NONE', layoutSizingHorizontal: 'FIXED', children: [], fills: [], strokes: []
});

function plugin(selection) {
  const messages = [];
  const figma = { showUI() {}, on() {}, currentPage: { selection }, ui: { postMessage: message => messages.push(message) } };
  const context = vm.createContext({ __html__: '', figma });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'code.js'), 'utf8'), context);
  return { context, messages };
}

test('UI exposes one exact-layout flow with no AI or responsive controls', () => {
  new vm.Script(script);
  const generate = script.slice(script.indexOf("$('gen').onclick"), script.indexOf("$('dbg').onclick"));
  assert.match(generate, /responsive: false/);
  assert.match(generate, /exact: true/);
  assert.match(ui, /Exact selected-frame output/);
  assert.doesNotMatch(ui, /Auto Gemini|Gemini responsive|Mobile reference|Tablet reference|Desktop reference/);
  assert.doesNotMatch(ui, /id="(?:ai|rsp|exact|pair-mode|run-ai|capture-mobile|viewport|devices)"/);
  assert.match(script, /backendRequest\('\/api\/generate'/);
  assert.match(script, /backendUrl\(\) \+ '\/api\/export'/);
  assert.doesNotMatch(script, /\/api\/refine/);
});

test('generation always exports one selected frame with exact measured geometry', async () => {
  const { context, messages } = plugin([frame('Desktop design', 1440)]);
  await vm.runInContext('generate({ responsive: true, exact: false, images: false })', context);
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  assert.equal(result.width, 1440);
  assert.equal(result.responsive, false);
  assert.deepEqual(Array.from(result.references), []);
  assert.match(result.html, /relative mx-auto w-\[1440px\] max-w-full h-\[900px\]/);
  assert.doesNotMatch(result.html, /(?:sm|md|lg|xl|2xl):/);
});

test('generation rejects multiple selections instead of combining layouts', async () => {
  const { context, messages } = plugin([frame('Mobile', 390), frame('Desktop', 1440)]);
  await vm.runInContext('generate({ responsive: true, exact: false, images: false })', context);
  assert.equal(messages.at(-1).type, 'error');
  assert.match(messages.at(-1).msg, /one Frame/);
  assert.equal(messages.some(message => message.type === 'result'), false);
});
