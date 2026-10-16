const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ui = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
const appStart = '<script id="plugin-app">';
const script = ui.slice(ui.indexOf(appStart) + appStart.length, ui.lastIndexOf('</script>'));
const helpers = script.slice(script.indexOf('  const VIEWPORTS'), script.indexOf('  onmessage ='));

// Small DOM fixture for exercising the merge independently of Figma or network access.
class Element {
  constructor(tag, layer, classes, children = [], text = '', style = '') {
    this.tagName = tag.toUpperCase();
    this.attributes = { class: classes, 'data-layer': layer, 'data-kind': tag === 'p' ? 'TEXT' : 'FRAME' };
    this.children = children;
    this.text = text;
    const values = new Map();
    this.style = {
      get cssText() { return [...values].map(([key, value]) => `${key}:${value}`).join(';'); },
      set cssText(value) { values.clear(); for (const entry of value.split(';')) { const at = entry.indexOf(':'); if (at > 0) values.set(entry.slice(0, at).trim(), entry.slice(at + 1).trim()); } },
      getPropertyValue(key) { return values.get(key) || ''; },
      [Symbol.iterator]() { return values.keys(); }
    };
    this.style.cssText = style;
  }
  getAttribute(key) { return key === 'style' ? this.style.cssText : this.attributes[key] ?? null; }
  setAttribute(key, value) { this.attributes[key] = value; }
  hasAttribute(key) { return key in this.attributes; }
  removeAttribute(key) { if (key === 'style') this.style.cssText = ''; else delete this.attributes[key]; }
  get classList() {
    const element = this;
    return {
      add(value) { element.attributes.class = (element.attributes.class + ' ' + value).trim(); },
      remove(value) { element.attributes.class = element.attributes.class.split(/\s+/).filter((item) => item !== value).join(' '); },
      [Symbol.iterator]() { return element.attributes.class.split(/\s+/).filter(Boolean)[Symbol.iterator](); }
    };
  }
  get textContent() { return this.text + this.children.map((node) => node.textContent).join(''); }
  cloneNode(deep) {
    const clone = new Element(this.tagName.toLowerCase(), '', '', deep ? this.children.map((node) => node.cloneNode(true)) : [], this.text, this.style.cssText);
    clone.attributes = { ...this.attributes };
    return clone;
  }
  replaceChildren() { this.children = []; this.text = ''; }
  appendChild(child) { this.children.push(child); }
  querySelectorAll() { return this.children.flatMap((child) => [child, ...child.querySelectorAll()]); }
  get outerHTML() {
    const attrs = Object.entries(this.attributes).map(([key, value]) => ` ${key}="${value}"`).join('');
    return `<${this.tagName.toLowerCase()}${attrs}>${this.text}${this.children.map((child) => child.outerHTML).join('')}</${this.tagName.toLowerCase()}>`;
  }
}

function context(fixtures = {}) {
  const ctx = vm.createContext({ DOMParser: class { parseFromString(key) { return { body: { firstElementChild: fixtures[key].cloneNode(true) } }; } } });
  vm.runInContext(helpers, ctx);
  return ctx;
}

test('UI JavaScript parses; Express compiles generation and packages exports without keys', () => {
  new vm.Script(script);
  const generate = script.slice(script.indexOf("  $('gen').onclick"), script.indexOf("  $('dbg').onclick"));
  const result = script.slice(script.indexOf("    if (m.type === 'result')"), script.indexOf('  function renderStats'));
  assert.match(result, /backendRequest\('\/api\/generate'/);
  assert.match(generate, /reportGeneration/);
  assert.match(result, /reportGeneration\('done'/);
  assert.match(script, /backendRequest\('\/api\/events'/);
  assert.doesNotMatch(ui, /<script src="https:\/\/cdn\.jsdelivr/);
  assert.match(script, /\/api\/export/);
  assert.doesNotMatch(script, /pluginkey|\/api\/refine|\$\('ai'\)/);
});

test('phone and desktop card grids infer a two-column tablet without another frame', () => {
  const ctx = context();
  ctx.mobile = new Element('div', 'Cards', 'grid grid-cols-1');
  ctx.desktop = new Element('div', 'Cards', 'grid grid-cols-3');
  const classes = vm.runInContext('mergeClassMaps([classMap(mobile), classMap(desktop)], [0, 3])', ctx);
  assert.match(classes, /grid-cols-1 md:grid-cols-2 lg:grid-cols-3/);
});

test('one shared tree merges layout, inline paints, images, order and tablet sizes', () => {
  const title = (size, style) => new Element('p', 'Title', `text-[${size}px] leading-[${size + 8}px]`, [], 'Shared title', style);
  const fixtures = {
    mobile: new Element('section', 'Mobile', 'w-full max-w-[390px] flex flex-col p-4', [title(28, 'color:red'), new Element('div', 'Photo', 'im1 bg-cover')]),
    tablet: new Element('section', 'Tablet', 'w-full max-w-[768px] flex flex-row p-8', [title(40, 'color:green'), new Element('div', 'Photo', 'im1 bg-cover')]),
    desktop: new Element('section', 'Desktop', 'w-full max-w-[1440px] flex flex-row p-16', [new Element('div', 'Photo', 'im2 bg-cover'), title(64, 'color:blue')])
  };
  const ctx = context(fixtures);
  ctx.refs = [390, 768, 1440].map((width, i) => ({ width, html: ['mobile', 'tablet', 'desktop'][i] }));
  const result = vm.runInContext('mergeResponsive(refs, ".im1{--im:url(__IMG_mobile__)}.im2{--im:url(__IMG_desktop__)}")', ctx);
  assert.equal((result.html.match(/Shared title/g) || []).length, 1);
  assert.equal((result.html.match(/<section/g) || []).length, 1);
  assert.match(result.html, /max-w-\[1440px\]/);
  assert.doesNotMatch(result.html, /max-w-\[390px\]|data-layer|data-kind/);
  assert.match(result.html, /md:flex-row/);
  assert.doesNotMatch(result.html, /sm:text-/);
  assert.match(result.html, /lg:text-\[64px\]/);
  assert.match(result.html, /@media\(min-width:768px\).*color:green/);
  assert.match(result.html, /@media\(min-width:1024px\).*__IMG_desktop__/);
  assert.match(result.html, /lg:order-\[1\]/);
  assert.equal(result.unmatched, 0);
});

test('component and instance trees with renamed and repeated layers match by content and structure', () => {
  const cards = (offset, type) => new Element('section', 'Frame ' + offset, 'grid grid-cols-1', Array.from({ length: 12 }, (_, index) => {
    const card = new Element('div', 'Frame ' + (offset + index), 'flex flex-col', [new Element('p', 'Text ' + (offset + index), 'text-[24px]', [], 'Feature ' + index)]);
    card.attributes['data-kind'] = type;
    return card;
  }));
  const ctx = context({ mobile: cards(100, 'COMPONENT'), desktop: cards(900, 'INSTANCE') });
  ctx.refs = [{ width: 390, html: 'mobile' }, { width: 1440, html: 'desktop' }];
  const result = vm.runInContext('mergeResponsive(refs)', ctx);
  assert.equal(result.unmatched, 0);
  assert.equal((result.html.match(/Feature /g) || []).length, 12);
  assert.doesNotMatch(result.html, /hidden/);
});

test('two references infer tablet typography and spacing while retaining the desktop values', () => {
  const ctx = context();
  ctx.mobile = new Element('p', 'Title Mobile', 'text-[28px] p-4 gap-4');
  ctx.desktop = new Element('p', 'Title Desktop', 'text-[64px] p-16 gap-12');
  const classes = vm.runInContext('mergeClassMaps([classMap(mobile), classMap(desktop)], [0, 3])', ctx);
  assert.match(classes, /text-\[28px\] md:text-\[46px\] lg:text-\[64px\]/);
  assert.match(classes, /md:pt-\[40px\] lg:pt-16/);
});

test('mobile and desktop references can be captured separately and component sets expand to variants', async () => {
  const messages = [];
  const frame = (id, width, type) => ({ id, name: id, type, width, height: 800, layoutMode: 'VERTICAL', children: [], fills: [], strokes: [] });
  const mobile = frame('mobile', 390, 'COMPONENT'), desktop = frame('desktop', 1440, 'INSTANCE');
  const figma = { showUI() {}, on() {}, currentPage: { selection: [mobile] }, ui: { postMessage: message => messages.push(message) } };
  const ctx = vm.createContext({ __html__: '', figma });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'code.js'), 'utf8'), ctx);
  await figma.ui.onmessage({ type: 'capture-reference', role: 'mobile' });
  await vm.runInContext('generate({ responsive: true })', ctx);
  assert.match(messages.at(-1).msg, /Set both Mobile and Desktop/);
  figma.currentPage.selection = [desktop];
  await figma.ui.onmessage({ type: 'capture-reference', role: 'desktop' });
  figma.currentPage.selection = [];
  await vm.runInContext('generate({ responsive: false, exact: true })', ctx);
  assert.deepEqual(Array.from(messages.findLast(message => message.type === 'result').references, ref => ref.width), [390, 1440]);
  desktop.removed = true;
  await vm.runInContext('generate({ responsive: true })', ctx);
  assert.match(messages.at(-1).msg, /Set both Mobile and Desktop/);
  desktop.removed = false;
  await figma.ui.onmessage({ type: 'clear-references' });
  figma.currentPage.selection = [{ type: 'COMPONENT_SET', children: [desktop, mobile] }];
  await vm.runInContext('generate({ responsive: true })', ctx);
  assert.deepEqual(Array.from(messages.findLast(message => message.type === 'result').references, ref => ref.width), [390, 1440]);
});

test('unmatched controls are hidden outside their source viewport and reported', () => {
  const ctx = context({
    mobile: new Element('section', 'Mobile', 'flex flex-col', [new Element('button', 'Menu', 'block', [], 'Menu')]),
    desktop: new Element('section', 'Desktop', 'flex flex-row', [new Element('nav', 'Navigation', 'flex', [], 'Navigation')])
  });
  ctx.refs = [{ width: 390, html: 'mobile' }, { width: 1440, html: 'desktop' }];
  const result = vm.runInContext('mergeResponsive(refs)', ctx);
  assert.match(result.html, /lg:hidden/);
  assert.match(result.html, /hidden lg:flex/);
  assert.equal(result.unmatched, 2);
});

test('utility groups preserve border width, color, backgrounds and reset positioning', () => {
  const ctx = context();
  ctx.mobile = new Element('div', 'Box', 'absolute left-4 p-4 border border-[#ff0000] bg-[#ffffff] bg-cover bg-center');
  ctx.desktop = new Element('div', 'Box', 'flex px-8');
  const classes = vm.runInContext('mergeClassMaps([classMap(mobile), classMap(desktop)], [0, 3])', ctx);
  assert.match(classes, /(?:^| )border(?: |$)/);
  assert.match(classes, /border-\[#ff0000\]/);
  assert.match(classes, /bg-\[#ffffff\]/);
  assert.match(classes, /bg-cover/);
  assert.match(classes, /lg:static/);
  assert.match(classes, /lg:left-auto/);
  assert.match(classes, /lg:pt-0/);
  assert.match(classes, /lg:pr-8/);
});

test('Figma selection exports sorted viewport references without screenshots or a server', async () => {
  const messages = [];
  const frame = (width) => ({ id: String(width), name: `Frame ${width}`, type: 'FRAME', width, height: 800, layoutMode: 'VERTICAL', children: [], fills: [], strokes: [], exportAsync() { throw new Error('Screenshot export must not run'); } });
  const ctx = vm.createContext({ __html__: '', figma: { showUI() {}, on() {}, currentPage: { selection: [frame(1440), frame(390)] }, ui: { postMessage(message) { messages.push(message); } } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'code.js'), 'utf8'), ctx);
  await vm.runInContext('generate({ responsive: true, images: false, exact: false })', ctx);
  const result = messages.find((message) => message.type === 'result');
  assert.ok(result);
  assert.equal(result.width, 1440);
  assert.deepEqual(Array.from(result.references, (ref) => ref.width), [390, 1440]);
  assert.equal((result.html.match(/<main/g) || []).length, 1);
  await vm.runInContext('generate({ responsive: false, images: false, exact: true })', ctx);
  assert.equal(messages.at(-1).type, 'error');
});

function svgContext() {
  const ctx = vm.createContext({ __html__: '', figma: { showUI() {}, on() {}, ui: {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'code.js'), 'utf8'), ctx);
  return ctx;
}

test('SVG symbols preserve root fill, stroke, opacity and paint references', () => {
  const ctx = svgContext();
  ctx.svg = '<svg id="Logo" width="240" height="80" viewBox="0 0 240 80" fill="none" stroke="#ff0000" opacity="0.5"><path d="M0 0L10 10"/></svg>';
  const symbol = vm.runInContext('spriteSymbol(svg, "i1")', ctx);
  assert.match(symbol, /fill="none"/);
  assert.match(symbol, /stroke="#ff0000"/);
  assert.match(symbol, /opacity="0.5"/);
  assert.match(symbol, /viewBox="0 0 240 80"/);
  assert.doesNotMatch(symbol, /width=|height=/);
  assert.equal((symbol.match(/\bid=/g) || []).length, 1);
});

test('gradient, mask and clip IDs are unique for every exported SVG', () => {
  const ctx = svgContext();
  ctx.svg = `<svg viewBox="0 0 10 10"><defs><linearGradient id="paint0"/><mask id='mask0'/><clipPath id="clip0"/></defs><path fill="url(#paint0)" mask="url('#mask0')" clip-path="url(#clip0)"/><use href="#clip0"/><use xlink:href='#paint0'/></svg>`;
  const first = vm.runInContext('spriteSymbol(svg, "i1")', ctx);
  const second = vm.runInContext('spriteSymbol(svg, "i2")', ctx);
  assert.match(first, /id="i1-paint0"/);
  assert.match(first, /url\(#i1-paint0\)/);
  assert.match(first, /url\('#i1-mask0'\)/);
  assert.match(first, /href="#i1-clip0"/);
  assert.match(first, /xlink:href='#i1-paint0'/);
  assert.match(second, /id="i2-paint0"/);
  assert.doesNotMatch(second, /i1-/);
});

test('SVGs with different root colors are not deduplicated into one symbol', async () => {
  const ctx = svgContext();
  ctx.assets = { fonts: {}, syms: {}, symN: 0, symDefs: [], svgP: {} };
  ctx.node = { id: 'logo', type: 'VECTOR', width: 240, height: 80, fills: [{ type: 'SOLID' }], strokes: [], name: 'Logo', exportAsync() {} };
  ctx.assets.svgP.logo = '<svg viewBox="0 0 240 80" fill="#ffffff"><path d="M0 0L1 1"/></svg>';
  await vm.runInContext('svgHtml(node, null, {}, "", true, assets)', ctx);
  ctx.assets.svgP.logo = '<svg viewBox="0 0 240 80" fill="#ff0000"><path d="M0 0L1 1"/></svg>';
  await vm.runInContext('svgHtml(node, null, {}, "", true, assets)', ctx);
  assert.equal(ctx.assets.symDefs.length, 2);
  assert.match(ctx.assets.symDefs[0], /fill="#ffffff"/);
  assert.match(ctx.assets.symDefs[1], /fill="#ff0000"/);
});

test('responsive typography scales line height and removes inherited duplicate classes', () => {
  const ctx = svgContext();
  const values = vm.runInContext('rspText(64, { responsive: true })', ctx);
  assert.ok(values.includes('text-[35.2px]') && values.includes('lg:text-[64px]'));
  assert.ok(!values.some((value) => value.startsWith('2xl:')));
  const switched = vm.runInContext('rspSwitch("flex-col", "flex-row")', ctx);
  assert.deepEqual(Array.from(switched), ['flex-col', 'lg:flex-row']);
  ctx.segment = { fontSize: 64, fontName: { family: 'Inter', style: 'Regular' }, fontWeight: 400, lineHeight: { unit: 'PIXELS', value: 72 }, fills: [] };
  const styles = vm.runInContext('segStyle(segment, {}, { responsive: true }, { fonts: {} })', ctx);
  assert.ok(styles.cls.includes('leading-[1.125]'));
  assert.ok(!styles.cls.some((value) => /(?:sm|md|lg|xl):leading-/.test(value)));
});
