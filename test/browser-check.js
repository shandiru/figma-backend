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
    const selected = sampleDesign();
    selected.width = 1920;
    selected.height = 1080;
    hydrate(selected);
    const figma = { showUI() {}, on() {}, currentPage: { selection: [selected] }, ui: { postMessage: message => messages.push(message) } };
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
    assert.equal(await page.locator('#design-size').textContent(), '1920 × 1080px');
    assert.equal(await page.locator('#capture-mobile').count(), 0);
    assert.equal(await page.locator('#viewport').count(), 0);
    const measured = await page.locator('#prev').evaluate(frame => {
      const doc = frame.contentDocument;
      const root = doc.querySelector('main');
      const photo = [...doc.querySelectorAll('[style]')].find(element => element.style.backgroundImage.includes('placehold'));
      return {
        frameWidth: frame.contentWindow.innerWidth,
        rootWidth: root.getBoundingClientRect().width,
        rootHeight: root.getBoundingClientRect().height,
        hasResponsiveClass: /(?:sm|md|lg|xl|2xl):/.test(root.outerHTML),
        photoLeft: photo ? photo.getBoundingClientRect().left - root.getBoundingClientRect().left : null
      };
    });
    assert.equal(measured.frameWidth, 1920, JSON.stringify(measured));
    assert.equal(measured.rootWidth, 1920, JSON.stringify(measured));
    assert.equal(measured.rootHeight, 1080, JSON.stringify(measured));
    assert.equal(measured.hasResponsiveClass, false, JSON.stringify(measured));

    const download = page.waitForEvent('download');
    await page.locator('#zip').click();
    const zipPath = path.join(output, 'exact-design.zip');
    await (await download).saveAs(zipPath);
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    const html = await zip.file('index.html').async('string');
    assert.match(html, /w-\[1920px\]/);
    assert.doesNotMatch(html, /(?:sm|md|lg|xl|2xl):/);
    assert.match(html, /<style data-compiled(?:="")?>/);
    const exportedPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await exportedPage.route('https://**/*', route => route.abort());
    await exportedPage.setContent(html, { waitUntil: 'domcontentloaded' });
    const exported = await exportedPage.locator('main').evaluate(root => {
      const photo = [...document.querySelectorAll('[style]')].find(element => element.style.backgroundImage.includes('placehold'));
      return {
        rootWidth: root.getBoundingClientRect().width,
        rootHeight: root.getBoundingClientRect().height,
        photoLeft: photo ? photo.getBoundingClientRect().left - root.getBoundingClientRect().left : null
      };
    });
    assert.deepEqual(exported, { rootWidth: measured.rootWidth, rootHeight: measured.rootHeight, photoLeft: measured.photoLeft });
    await exportedPage.screenshot({ path: path.join(output, 'exact-zip.png'), fullPage: true });
    await exportedPage.close();
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, 'exact-plugin.png'), fullPage: true });
    await page.close();
    console.log('PASS: one selected Figma frame preserves its exact 1920x1080 desktop layout with no AI or responsive output.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
