const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('../src/config');
// Smoke tests use memory history; no database or external model is contacted.
cfg.MONGODB_URI = '';
const app = require('../src/app');
test('dashboard, fix, logs and health still work', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'x-plugin-key': cfg.PLUGIN_KEY, 'Content-Type': 'application/json' };
  try {
    const fix = await fetch(base + '/api/fix', { method: 'POST', headers, body: JSON.stringify({ html: '<button class="p-[16px] p-4">Click</button>' }) });
    assert.equal(fix.status, 200);
    assert.match((await fix.json()).html, /type="button" class="p-4"/);
    const dashboard = await fetch(base + '/');
    assert.equal(dashboard.status, 200);
    const html = await dashboard.text();
    assert.match(html, /http-equiv="refresh" content="4"/);
    assert.match(html, /View generated code/);
    const health = await fetch(base + '/api/health', { headers });
    assert.equal((await health.json()).ok, true);
    const logs = await fetch(base + '/api/logs', { headers });
    assert.ok((await logs.json()).items.some((item) => item.kind === 'fix' && item.status === 'done'));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
