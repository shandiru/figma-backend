const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const prettier = require('prettier');
const JSZip = require('jszip');
const { sampleDesign, hydrate } = require('./sample-design');
const cfg = require('../src/config');
cfg.MONGODB_URI = '';
cfg.PLUGIN_KEY = 'browser-test-key';
const app = require('../src/app');

async function main() {
  const out = path.resolve('test/artifacts');
  fs.mkdirSync(out, { recursive: true });
  const messages = [];
  const design = hydrate(sampleDesign());
  fs.writeFileSync(path.join(out, 'sample-figma.json'), JSON.stringify(design, null, 2));
  const figma = { showUI() {}, on() {}, currentPage: { selection: [design] }, ui: { postMessage: (m) => messages.push(m) }, getImageByHash: () => ({ getBytesAsync: async () => new Uint8Array([1]) }) };
  const ctx = vm.createContext({ __html__: '', figma });
  vm.runInContext(fs.readFileSync('plugin/code.js', 'utf8'), ctx);
  await vm.runInContext('generate({ responsive: true, images: true })', ctx);
  const result = messages.find((m) => m.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  fs.writeFileSync(path.join(out, 'after.html'), await prettier.format(result.html, { parser: 'html' }));
  const beforeMessages = [];
  const beforeCtx = vm.createContext({ __html__: '', figma: { ...figma, ui: { postMessage: (m) => beforeMessages.push(m) } } });
  const beforeSource = execFileSync('git', ['show', 'HEAD:plugin/code.js'], { encoding: 'utf8' });
  vm.runInContext(beforeSource, beforeCtx);
  await vm.runInContext('generate({ responsive: true, images: true })', beforeCtx);
  fs.writeFileSync(path.join(out, 'before.html'), await prettier.format(beforeMessages.find((m) => m.type === 'result').html, { parser: 'html' }));
  const config = { content: [{ raw: result.html }], theme: { extend: { colors: result.colors, fontFamily: { inter: ['Inter', 'sans-serif'] } } } };
  fs.writeFileSync(path.join(out, 'compile.config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(out, 'input.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;');
  execFileSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-c', path.join(out, 'compile.config.json'), '-i', path.join(out, 'input.css'), '-o', path.join(out, 'compiled.css')]);
  const css = fs.readFileSync(path.join(out, 'compiled.css'), 'utf8');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const backend = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://**/*', async (route) => {
      const url = route.request().url();
      if (url.includes('cdn.tailwindcss.com')) return route.fulfill({ contentType: 'application/javascript', body: 'window.tailwind={};const style=document.createElement("style");style.textContent=' + JSON.stringify(css) + ';document.head.appendChild(style);' });
      return route.abort();
    });
    await page.setContent(fs.readFileSync('plugin/ui.html', 'utf8'), { waitUntil: 'load' });
    await page.locator('details > summary').click();
    await page.locator('#apiurl').fill(backend);
    await page.locator('#pluginkey').fill(cfg.PLUGIN_KEY);
    await page.locator('#gen').click();
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 560; canvas.height = 360;
      const c = canvas.getContext('2d'); c.fillStyle = '#bfdbfe'; c.fillRect(0, 0, 560, 360);
      c.fillStyle = '#172554'; c.font = '36px sans-serif'; c.fillText('Responsive preview', 100, 180);
      return canvas.toDataURL().split(',')[1];
    });
    result.images.photo = Array.from(Buffer.from(png, 'base64'));
    await page.evaluate((payload) => { payload.images.photo = new Uint8Array(payload.images.photo); window.postMessage({ pluginMessage: payload }, '*'); }, result);
    await page.waitForFunction(() => !document.querySelector('#zip').disabled);
    await page.waitForFunction(() => document.querySelector('#prev').contentDocument.querySelector('style')?.textContent.includes('--tw-'));
    await page.evaluate(() => eventQueue);
    let items = (await (await fetch(backend + '/api/logs', { headers: { 'x-plugin-key': cfg.PLUGIN_KEY } })).json()).items;
    assert.ok(items.some((item) => item.kind === 'generate' && item.status === 'done' && item.output.includes('<main')));
    let pendingDownload = page.waitForEvent('download');
    await page.locator('#zip').click();
    await (await pendingDownload).saveAs(path.join(out, 'design-preview.zip'));
    assert.equal(await page.locator('#zip-save').isVisible(), true);
    // A real user click must work after async preparation, too.
    pendingDownload = page.waitForEvent('download');
    await page.locator('#zip-save').click();
    await (await pendingDownload).saveAs(path.join(out, 'design-save-link.zip'));
    assert.deepEqual(fs.readFileSync(path.join(out, 'design-preview.zip')), fs.readFileSync(path.join(out, 'design-save-link.zip')));
    // Exercise the failure users saw: no stylesheet ever loaded in the preview.
    await page.evaluate(() => document.querySelector('#prev').contentDocument.querySelectorAll('style').forEach((el) => el.remove()));
    pendingDownload = page.waitForEvent('download');
    await page.locator('#zip').click();
    await (await pendingDownload).saveAs(path.join(out, 'design.zip'));
    await page.evaluate(() => eventQueue);
    items = (await (await fetch(backend + '/api/logs', { headers: { 'x-plugin-key': cfg.PLUGIN_KEY } })).json()).items;
    assert.equal(items.filter((item) => item.kind === 'export' && item.status === 'done').length, 2);
    const dashboard = await (await fetch(backend)).text();
    assert.match(dashboard, /ZIP ready/);
    assert.match(dashboard, /Responsive HTML ready/);
    const bytes = fs.readFileSync(path.join(out, 'design.zip'));
    const zip = await JSZip.loadAsync(Buffer.from(bytes));
    for (const name of ['index.html', 'tailwind.config.js', 'assets/images/photo.webp', 'assets/icons/i1.svg', 'assets/tailwind.css']) assert.ok(zip.file(name), name);
    const image = await zip.file('assets/images/photo.webp').async('nodebuffer');
    assert.equal(image.subarray(8, 12).toString(), 'WEBP');
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const dest = path.join(out, 'export', entry.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, await entry.async('nodebuffer'));
    }
    await page.goto(pathToFileURL(path.join(out, 'export/index.html')).href);
    await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
    const measurements = [];
    for (const width of [375, 639, 640, 767, 768, 1023, 1024, 1279, 1280, 1440, 1536, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      const value = await page.evaluate(() => {
        const root = document.querySelector('main');
        const hero = root.querySelector('section');
        const rects = [...hero.children].map((el) => el.getBoundingClientRect());
        const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        const siblingOverlap = [...document.querySelectorAll('main, section, article, button')].some((parent) => {
          const boxes = [...parent.children].filter((el) => getComputedStyle(el).position !== 'absolute').map((el) => el.getBoundingClientRect());
          return boxes.some((a, i) => boxes.slice(i + 1).some((b) => overlaps(a, b)));
        });
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, direction: getComputedStyle(hero).flexDirection, columns: getComputedStyle(root.children[2]).gridTemplateColumns.split(' ').length, siblingOverlap, imageLoaded: document.querySelector('img[alt="Product photo"]').naturalWidth > 0, heroOverlap: overlaps(rects[0], rects[1]) };
      });
      assert.ok(value.scrollWidth <= width, JSON.stringify(value));
      assert.equal(value.siblingOverlap, false, JSON.stringify(value));
      assert.equal(value.heroOverlap, false, JSON.stringify(value));
      assert.equal(value.direction, width >= 1024 ? 'row' : 'column');
      assert.equal(value.columns, width >= 1024 ? 3 : width >= 768 ? 2 : 1);
      measurements.push(value);
      if ([375, 1440].includes(width)) await page.screenshot({ path: path.join(out, `preview-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(measurements, null, 2));
    console.log('PASS: Download ZIP and Save ZIP produce real downloads with bundled libraries; missing preview CSS compiles on backend; Generate/ZIP appear in dashboard.');
    console.log('PASS: extracted ZIP opens from disk; WebP/SVG load; no horizontal scroll or overlap at 12 widths from 375 to 1920px.');
    console.log('Artifacts: test/artifacts/export/index.html, design.zip, before.html, after.html, preview-375.png, preview-1440.png');
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
