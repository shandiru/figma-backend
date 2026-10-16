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
  const headers = { 'Content-Type': 'application/json' };
  try {
    const fix = await fetch(base + '/api/fix', { method: 'POST', headers, body: JSON.stringify({ html: '<button class="p-[16px] p-4">Click</button>' }) });
    assert.equal(fix.status, 200);
    assert.match((await fix.json()).html, /type="button" class="p-4"/);
    const dashboard = await fetch(base + '/');
    assert.equal(dashboard.status, 200);
    const html = await dashboard.text();
    assert.match(html, /updates every 2s/);
    assert.match(html, /View generated code/);
    const health = await fetch(base + '/api/health', { headers });
    assert.equal((await health.json()).ok, true);
    const logs = await fetch(base + '/api/logs', { headers });
    assert.ok((await logs.json()).items.some((item) => item.kind === 'fix' && item.status === 'done'));
    const event = { runId: 'generation-test-run', kind: 'generate', phase: 'started', stage: 'Reading layers' };
    assert.equal((await fetch(base + '/api/events', { method: 'POST', headers, body: JSON.stringify(event) })).status, 200);
    let items = (await (await fetch(base + '/api/logs', { headers })).json()).items;
    assert.equal(items.find((item) => item.runId === event.runId).status, 'processing');
    assert.equal((await fetch(base + '/api/events', { method: 'POST', headers, body: JSON.stringify({ ...event, phase: 'done', stage: 'Responsive HTML ready', output: '<main class="flex">Generated page</main>' }) })).status, 200);
    items = (await (await fetch(base + '/api/logs', { headers })).json()).items;
    assert.equal(items.filter((item) => item.runId === event.runId).length, 1);
    assert.equal(items.find((item) => item.runId === event.runId).status, 'done');
    const live = await (await fetch(base + '/')).text();
    assert.match(live, /Your design. Working code./);
    assert.equal((await fetch(base + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) })).status, 200);
    const compile = await fetch(base + '/api/compile', { method: 'POST', headers, body: JSON.stringify({ html: '<main class="flex flex-col lg:flex-row text-design-1">Page</main>', theme: { colors: { 'design-1': '#172554' } } }) });
    assert.equal(compile.status, 200);
    const css = (await compile.json()).css;
    assert.match(css, /min-width: 1024px/);
    assert.match(css, /\.text-design-1/);
    assert.equal((await fetch(base + '/api/compile', { method: 'POST', headers, body: JSON.stringify({ html: '<main/>', theme: { colors: { bad: 'url(secret)' } } }) })).status, 400);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
