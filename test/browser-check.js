const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const JSZip = require('jszip');
const { sampleDesign, hydrate } = require('./sample-design');

require('../src/config').MONGODB_URI = '';
const app = require('../src/app');

async function main() {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const backend = `http://127.0.0.1:${server.address().port}`;
  const output = path.join(__dirname, 'artifacts');
  fs.mkdirSync(output, { recursive: true });

  try {
    const messages = [];
    const mobile = sampleDesign(); mobile.id = 'Mobile'; mobile.name = 'Mobile'; mobile.width = 390;
    const desktop = sampleDesign(); desktop.id = 'Desktop'; desktop.name = 'Desktop';
    hydrate(mobile); hydrate(desktop);
    const figma = { showUI() {}, on() {}, currentPage: { selection: [desktop, mobile] }, ui: { postMessage: message => messages.push(message) } };
    const context = vm.createContext({ __html__: '', figma });
    vm.runInContext(fs.readFileSync('plugin/code.js', 'utf8'), context);

    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.exposeFunction('dispatchToFigma', async message => {
      await figma.ui.onmessage(message);
      for (const reply of messages.splice(0)) await page.evaluate(payload => window.postMessage({ pluginMessage: payload }, '*'), reply);
    });
    const bridge = `<script>window.addEventListener('message',event=>{const message=event.data.pluginMessage;if(message&&['ready','generate','save-backend-settings'].includes(message.type))window.dispatchToFigma(message);});</script>`;
    await page.setContent(fs.readFileSync('plugin/ui.html', 'utf8').replace('<script id="plugin-app">', bridge + '<script id="plugin-app">'));
    await page.locator('details > summary').click();
    await page.locator('#apiurl').fill(backend);
    await page.locator('label.switch').filter({ has: page.locator('#img') }).click();
    await page.locator('#gen').click();
    await page.waitForFunction(() => !document.querySelector('#zip').disabled);

    assert.equal(await page.locator('#err').textContent(), '');
    assert.equal(await page.locator('#design-size').textContent(), '1440 × 1100px');
    assert.equal(await page.locator('#capture-mobile').count(), 0);
    assert.equal(await page.locator('#viewport').count(), 0);
    const measured = await page.locator('#prev').evaluate(frame => {
      const doc = frame.contentDocument;
      const root = [...doc.querySelectorAll('main')].find(element => element.getBoundingClientRect().width > 0);
      const photo = [...doc.querySelectorAll('[style]')].find(element => element.style.backgroundImage.includes('placehold'));
      return {
        frameWidth: frame.contentWindow.innerWidth,
        rootWidth: root.getBoundingClientRect().width,
        rootHeight: root.getBoundingClientRect().height,
        visibleRoots: [...doc.querySelectorAll('main')].filter(element => element.getBoundingClientRect().width > 0).length,
        photoLeft: photo ? photo.getBoundingClientRect().left - root.getBoundingClientRect().left : null
      };
    });
    assert.equal(measured.frameWidth, 1440, JSON.stringify(measured));
    assert.equal(measured.rootWidth, 1440, JSON.stringify(measured));
    assert.equal(measured.rootHeight, 1100, JSON.stringify(measured));
    assert.equal(measured.visibleRoots, 1, JSON.stringify(measured));
    await page.locator('#preview-mobile').click();
    await page.waitForFunction(() => document.querySelector('#prev').contentWindow.innerWidth === 390);
    const mobileMeasured = await page.locator('#prev').evaluate(frame => {
      const roots = [...frame.contentDocument.querySelectorAll('main')].filter(element => element.getBoundingClientRect().width > 0);
      return { width: frame.contentWindow.innerWidth, roots: roots.length, rootWidth: roots[0]?.getBoundingClientRect().width || 0 };
    });
    assert.deepEqual(mobileMeasured, { width: 390, roots: 1, rootWidth: 390 });

    const download = page.waitForEvent('download');
    await page.locator('#zip').click();
    const zipPath = path.join(output, 'exact-design.zip');
    await (await download).saveAs(zipPath);
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    const html = await zip.file('index.html').async('string');
    assert.match(html, /w-\[1440px\]/);
    assert.match(html, /block lg:hidden/);
    assert.match(html, /hidden lg:block/);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, 'exact-plugin.png'), fullPage: true });
    await page.close();
    console.log('PASS: selected Mobile + Desktop frames remain exact and switch responsively with no AI rewrite.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
