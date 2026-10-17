const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const prettier = require('prettier');
const JSZip = require('jszip');
const { sampleDesign, hydrate, node, text, solid } = require('./sample-design');
const cfg = require('../src/config');
cfg.MONGODB_URI = '';
const app = require('../src/app');

async function verifyReferencePair(browser, backend, out) {
  const mobile = sampleDesign(), desktop = sampleDesign();
  mobile.type = 'COMPONENT'; mobile.width = 390;
  desktop.type = 'INSTANCE';
  mobile.children[1].layoutMode = 'VERTICAL';
  mobile.children[1].width = 358;
  mobile.children[2].layoutMode = 'VERTICAL';
  desktop.children[1].layoutMode = 'HORIZONTAL';
  mobile.children[1].children[0].children[0].segments[0].fontSize = 32;
  mobile.children[1].children[0].children[0].fontSize = 32;
  function rename(node, prefix, count = { value: 0 }) {
    node.id = prefix + '-' + count.value++;
    node.name = (node.type === 'TEXT' ? 'Text ' : 'Frame ') + node.id;
    for (const child of node.children || []) rename(child, prefix, count);
    return node;
  }
  hydrate(rename(mobile, 'mobile')); hydrate(rename(desktop, 'desktop'));
  const page = await browser.newPage(), pending = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const figma = { showUI() {}, on() {}, currentPage: { selection: [mobile] }, ui: { postMessage: message => pending.push(message) } };
  const ctx = vm.createContext({ __html__: '', figma });
  vm.runInContext(fs.readFileSync('plugin/code.js', 'utf8'), ctx);
  await page.exposeFunction('dispatchToFigma', async message => {
    await figma.ui.onmessage(message);
    for (const reply of pending.splice(0)) await page.evaluate(payload => window.postMessage({ pluginMessage: payload }, '*'), reply);
  });
  await page.route('https://**/*', route => route.abort());
  const bridge = `<script>window.addEventListener('message',event=>{const message=event.data.pluginMessage;if(message&&['ready','capture-reference','clear-references','generate','save-backend-settings'].includes(message.type))window.dispatchToFigma(message);});</script>`;
  await page.setContent(fs.readFileSync('plugin/ui.html', 'utf8').replace('<script id="plugin-app">', bridge + '<script id="plugin-app">'));
  await page.locator('details > summary').click();
  await page.locator('#apiurl').fill(backend);
  await page.locator('label.switch').filter({ has: page.locator('#img') }).click();
  await page.locator('#capture-mobile').click();
  await page.waitForFunction(() => document.querySelector('#mobile-ref').textContent.includes('390px'));
  figma.currentPage.selection = [desktop];
  await page.locator('#capture-desktop').click();
  await page.waitForFunction(() => document.querySelector('#desktop-ref').textContent.includes('1440px'));
  figma.currentPage.selection = [];
  await page.locator('#gen').click();
  await page.waitForFunction(() => !document.querySelector('#zip').disabled);
  assert.equal(await page.locator('#err').textContent(), '');
  const measurements = [];
  for (const width of [375, 640, 768, 1024, 1280, 1440, 1536, 1920]) {
    await page.locator('#viewport').fill(String(width));
    const value = await page.locator('#prev').evaluate(frame => {
      const doc = frame.contentDocument, root = doc.querySelector('main');
      return { width: frame.contentWindow.innerWidth, scroll: doc.documentElement.scrollWidth, rootWidth: root.getBoundingClientRect().width, headings: [...doc.querySelectorAll('h1')].filter(el => el.textContent.includes('Build something remarkable')).length, titleSize: parseFloat(getComputedStyle(root.querySelector('h1')).fontSize) };
    });
    assert.ok(value.scroll <= width, JSON.stringify(value));
    assert.equal(value.headings, 1, JSON.stringify(value));
    if (width >= 1440) assert.equal(value.rootWidth, 1440, JSON.stringify(value));
    measurements.push(value);
  }
  assert.ok(measurements.find(x => x.width === 768).titleSize > measurements[0].titleSize);
  assert.ok(measurements.find(x => x.width === 768).titleSize < measurements.find(x => x.width === 1440).titleSize);
  const download = page.waitForEvent('download');
  await page.locator('#zip').click();
  await (await download).saveAs(path.join(out, 'paired-components.zip'));
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'paired-measurements.json'), JSON.stringify(measurements, null, 2));
  await page.screenshot({ path: path.join(out, 'paired-plugin.png'), fullPage: true });
  await page.close();
  console.log('PASS: separate mobile component + desktop instance capture, renamed layers, tablet typography, XL container and ZIP.');
}

async function verifyMeasuredDesign(browser, backend, out, png) {
  const label = text('Label', 'Accurate design', 19, { width: 200, height: 25, layoutSizingHorizontal: 'FIXED' });
  label.segments[0].lineHeight.value = 25;
  const logo = node('Mark', 31, 31, [], { type: 'RECTANGLE', cornerRadius: 7, fills: solid('172554') });
  const header = node('Header', 835, 53, [logo, label], { layoutMode: 'HORIZONTAL', itemSpacing: 17, paddingLeft: 13, paddingRight: 13, counterAxisAlignItems: 'CENTER' });
  const image = node('Photo', 147, 83, [], { fills: [{ type: 'IMAGE', imageHash: 'photo', scaleMode: 'FILL' }] });
  const panel = node('Panel', 835, 211, [image], { layoutMode: 'HORIZONTAL', paddingLeft: 21, paddingTop: 21, cornerRadius: 13, fills: solid('dbeafe') });
  const design = hydrate(node('Page', 901, 500, [header, panel], { layoutMode: 'VERTICAL', layoutSizingVertical: 'FIXED', paddingLeft: 37, paddingRight: 29, paddingTop: 19, paddingBottom: 23, itemSpacing: 17, counterAxisAlignItems: 'MIN' }));
  const messages = [];
  const ctx = vm.createContext({ __html__: '', figma: { showUI() {}, on() {}, currentPage: { selection: [design] }, ui: { postMessage: message => messages.push(message) }, getImageByHash: () => ({ getBytesAsync: async () => new Uint8Array(Buffer.from(png, 'base64')) }) } });
  vm.runInContext(fs.readFileSync('plugin/code.js', 'utf8'), ctx);
  await vm.runInContext('generate({ responsive: false, exact: true, images: true })', ctx);
  const payload = messages.find(message => message.type === 'result');
  assert.ok(payload, JSON.stringify(messages));
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await page.route('https://**/*', route => route.abort());
  await page.setContent(fs.readFileSync('plugin/ui.html', 'utf8'));
  await page.locator('details > summary').click();
  await page.locator('#apiurl').fill(backend);
  await page.locator('#gen').click();
  await page.evaluate(result => window.postMessage({ pluginMessage: result }, '*'), payload);
  await page.waitForFunction(() => !document.querySelector('#zip').disabled);
  const actual = await page.locator('#prev').evaluate(frame => {
    const doc = frame.contentDocument, root = doc.querySelector('main'), header = doc.querySelector('header'), panel = root.children[1], logo = header.children[0], label = header.children[1], image = panel.querySelector('img, .im1');
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return { root: box(root), header: box(header), panel: box(panel), logo: box(logo), label: box(label), image: box(image), fontSize: getComputedStyle(label).fontSize, lineHeight: getComputedStyle(label).lineHeight, radius: getComputedStyle(logo).borderRadius };
  });
  assert.deepEqual(actual.root, { x: 0, y: 0, width: 901, height: 500 });
  assert.deepEqual(actual.header, { x: 37, y: 19, width: 835, height: 53 });
  assert.deepEqual(actual.logo, { x: 50, y: 30, width: 31, height: 31 });
  assert.deepEqual(actual.label, { x: 98, y: 33, width: 200, height: 25 });
  assert.deepEqual(actual.panel, { x: 37, y: 89, width: 835, height: 211 });
  assert.deepEqual(actual.image, { x: 58, y: 110, width: 147, height: 83 });
  assert.equal(actual.fontSize, '19px'); assert.ok(Math.abs(parseFloat(actual.lineHeight) - 25) < 0.01, actual.lineHeight); assert.equal(actual.radius, '7px');
  // Force traditional scrollbar dimensions, as in the Windows Figma iframe.
  await page.addStyleTag({ content: '#stage::-webkit-scrollbar{width:17px;height:17px}' });
  await page.locator('#prev').evaluate(frame => {
    const style = frame.contentDocument.createElement('style');
    style.textContent = 'html::-webkit-scrollbar{width:17px;height:17px}';
    frame.contentDocument.head.appendChild(style);
  });
  for (const panelWidth of [1000, 800]) {
    await page.setViewportSize({ width: panelWidth, height: 900 });
    // Exact mode intentionally keeps its native 901px canvas; narrower device
    // adaptation is covered by the Responsive-mode checks above.
    for (const width of [901, 1440]) {
      await page.locator('#viewport').fill(String(width));
      await page.waitForFunction(expected => {
        const stage = document.querySelector('#stage'), frame = document.querySelector('#prev'), doc = frame.contentDocument;
        return frame.contentWindow.innerWidth === expected && stage.scrollWidth <= stage.clientWidth && doc.documentElement.scrollWidth <= doc.documentElement.clientWidth && doc.documentElement.scrollHeight <= doc.documentElement.clientHeight + 1;
      }, width);
    }
  }
  // Growing image/font content remains reachable using the outer stage scroll.
  await page.locator('#prev').evaluate(frame => { frame.contentDocument.querySelector('main').style.minHeight = '1800px'; });
  await page.waitForFunction(() => {
    const stage = document.querySelector('#stage'), frame = document.querySelector('#prev'), doc = frame.contentDocument;
    return stage.scrollHeight > stage.clientHeight && doc.documentElement.scrollHeight <= doc.documentElement.clientHeight + 1 && stage.scrollWidth <= stage.clientWidth;
  });
  await page.locator('#prev').evaluate(frame => { frame.contentDocument.querySelector('main').style.minHeight = ''; });
  fs.writeFileSync(path.join(out, 'accuracy-measurements.json'), JSON.stringify(actual, null, 2));
  await page.screenshot({ path: path.join(out, 'accuracy-plugin.png'), fullPage: true });
  await page.close();
  console.log('PASS: original positions, 17px gaps, asymmetric padding, fixed sizes, image crop box, 19px text, 25px leading and 7px radius match exactly.');
}

async function main() {
  const out = path.resolve('test/artifacts');
  fs.mkdirSync(out, { recursive: true });
  const messages = [];
  const design = hydrate(sampleDesign());
  fs.writeFileSync(path.join(out, 'sample-figma.json'), JSON.stringify(design, null, 2));
  const figma = { showUI() {}, on() {}, currentPage: { selection: [design] }, ui: { postMessage: (m) => messages.push(m) }, getImageByHash: () => ({ getBytesAsync: async () => new Uint8Array([1]) }) };
  const ctx = vm.createContext({ __html__: '', figma });
  vm.runInContext(fs.readFileSync('plugin/code.js', 'utf8'), ctx);
  await vm.runInContext('generate({ responsive: true, exact: false, images: true })', ctx);
  const result = messages.find((m) => m.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  fs.writeFileSync(path.join(out, 'after.html'), await prettier.format(result.html, { parser: 'html' }));
  const beforeMessages = [];
  const beforeCtx = vm.createContext({ __html__: '', figma: { ...figma, ui: { postMessage: (m) => beforeMessages.push(m) } } });
  const beforeSource = execFileSync('git', ['show', 'HEAD:plugin/code.js'], { encoding: 'utf8' });
  vm.runInContext(beforeSource, beforeCtx);
  await vm.runInContext('generate({ responsive: true, exact: false, images: true })', beforeCtx);
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
    let items = (await (await fetch(backend + '/api/logs', {})).json()).items;
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
    items = (await (await fetch(backend + '/api/logs', {})).json()).items;
    assert.equal(items.filter((item) => item.kind === 'export' && item.status === 'done').length, 2);
    const dashboard = await (await fetch(backend)).text();
    assert.match(dashboard, /Your design. Working code./);
    assert.ok(items.some(item => item.stages.some(stage => stage.stage.includes('Compiling'))));
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
    await page.addStyleTag({ content: 'html::-webkit-scrollbar{width:17px;height:17px}' });
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
        return { width: innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, direction: getComputedStyle(hero).flexDirection, columns: getComputedStyle(root.children[2]).gridTemplateColumns.split(' ').length, siblingOverlap, imageLoaded: document.querySelector('img[alt="Product photo"]').naturalWidth > 0, heroOverlap: overlaps(rects[0], rects[1]) };
      });
      assert.ok(value.scrollWidth <= value.clientWidth, JSON.stringify(value));
      if (width >= 1440) {
        assert.equal(value.siblingOverlap, false, JSON.stringify(value));
        assert.equal(value.heroOverlap, false, JSON.stringify(value));
      }
      assert.equal(value.direction, width >= 1024 ? 'row' : 'column');
      assert.equal(value.columns, width >= 1024 ? 3 : width >= 768 ? 2 : 1);
      measurements.push(value);
      if ([375, 1440].includes(width)) await page.screenshot({ path: path.join(out, `preview-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(measurements, null, 2));
    await page.goto(backend);
    await page.locator('#runs .run').first().waitFor();
    await page.locator('#runs .run').first().click();
    await page.locator('#code summary').click();
    assert.match(await page.locator('#output').textContent(), /<html|<main/);
    assert.ok(await page.locator('#stages li').count() >= 3);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(out, `dashboard-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    await verifyReferencePair(browser, backend, out);
    await verifyMeasuredDesign(browser, backend, out, png);
    console.log('PASS: Download ZIP and Save ZIP produce real downloads with bundled libraries; CSS and ZIP compile on backend without a key; Generate/ZIP appear in dashboard.');
    console.log('PASS: extracted ZIP preserves the selected desktop layout; paired references resize from 375 to 1920px.');
    console.log('Artifacts: test/artifacts/export/index.html, design.zip, before.html, after.html, preview-375.png, preview-1440.png');
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
