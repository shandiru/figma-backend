const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
require('../src/config').MONGODB_URI = '';
const app = require('../src/app');

test('Express generation and ZIP export preserve exact CSS and SVG assets', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const response = await post('/api/generate', { runId: 'keyless-generate', html: '<main class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 p-[16px] p-4"><button>Go</button></main>' });
    assert.equal(response.status, 200);
    const generated = await response.json();
    assert.match(generated.html, /type="button"/);
    assert.doesNotMatch(generated.html, /p-\[16px\]/);
    assert.match(generated.css, /min-width: 768px/);
    assert.match(generated.css, /min-width: 1024px/);
    const html = '<!doctype html><html><head><title>Export</title><style data-compiled>' + generated.css + '</style></head><body>' + generated.html + '<img src="assets/icons/logo.svg" alt="Logo"></body></html>';
    const assets = [{ path: 'assets/icons/logo.svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="none"><path stroke="#fff" d="M0 0L10 10"/></svg>' }];
    const exported = await post('/api/export', { runId: 'keyless-export', html, assets });
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-type'), /application\/zip/);
    const zip = await JSZip.loadAsync(await exported.arrayBuffer());
    const index = await zip.file('index.html').async('string');
    assert.match(index, /href="assets\/tailwind.css"/);
    assert.match(index, /<style data-compiled(?:="")?>/);
    assert.match(await zip.file('assets/tailwind.css').async('string'), /grid-template-columns: repeat\(3/);
    assert.match(await zip.file('assets/icons/logo.svg').async('string'), /fill="none"/);
    const logs = (await (await fetch(base + '/api/logs')).json()).items;
    for (const id of ['keyless-generate', 'keyless-export']) {
      const run = logs.find(item => item.runId === id);
      assert.equal(run.status, 'done');
      assert.ok(run.stages.length >= 3);
      assert.ok(run.output.includes('<main'));
    }
    assert.equal((await post('/api/export', { runId: 'invalid-asset', html, assets: [{ path: '../escape.svg', content: '<svg/>' }] })).status, 400);
    assert.equal((await post('/api/export', { runId: 'invalid-webp', html, assets: [{ path: 'assets/images/photo.webp', content: 'bm90IHdlYnA=' }] })).status, 400);
    assert.equal((await post('/api/generate', { runId: 'invalid-theme', html, theme: { colors: { invalid: 'url(secret)' } } })).status, 400);
    const invalidRun = await post('/api/generate', { html: '<main></main>' });
    assert.equal(invalidRun.status, 400);
    assert.match((await invalidRun.json()).error, /valid runId/);
    const large = await post('/api/generate', { runId: 'large-html-run', html: '<main class="p-4">' + 'x'.repeat(360000) + '</main>' });
    assert.equal(large.status, 200);
    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.engine, 'figma-exact');
    assert.equal(health.maxHtmlChars, 2000000);
    assert.equal('ai' in health, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
