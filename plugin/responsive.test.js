const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ui = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
const script = ui.slice(ui.indexOf('<script>') + 8, ui.lastIndexOf('</script>'));
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

test('UI JavaScript parses and generation contains no API calls', () => {
  new vm.Script(script);
  assert.doesNotMatch(script, /\bfetch\s*\(|\/api\//);
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
  assert.match(result.html, /sm:text-/);
  assert.match(result.html, /lg:text-\[64px\]/);
  assert.match(result.html, /@media\(min-width:768px\).*color:green/);
  assert.match(result.html, /@media\(min-width:1024px\).*__IMG_desktop__/);
  assert.match(result.html, /lg:order-\[1\]/);
  assert.equal(result.unmatched, 0);
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
  assert.equal((result.html.match(/<div/g) || []).length, 1);
  await vm.runInContext('generate({ responsive: false, images: false, exact: true })', ctx);
  assert.equal(messages.at(-1).type, 'error');
});
