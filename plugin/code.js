figma.showUI(__html__, { width: 1000, height: 820, themeColors: true });

/* ---------- helpers ---------- */
const r = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : 0);
const h2 = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
const hex = (c) => '#' + h2(c.r) + h2(c.g) + h2(c.b);
const rgba = (c, a) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${r(a)})`;
const colorStr = (c, a) => (a >= 0.999 ? hex(c) : rgba(c, a));
const op = (p) => (typeof p.opacity === 'number' ? p.opacity : 1);
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cssEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const visible = (a) => (Array.isArray(a) ? a.filter((p) => p.visible !== false) : []);
const topPaint = (a) => { const v = visible(a); return v.length ? v[v.length - 1] : null; };
const isGrad = (p) => p && p.type.indexOf('GRADIENT') === 0;
const SHAPES = ['VECTOR', 'STAR', 'POLYGON', 'LINE', 'BOOLEAN_OPERATION', 'ELLIPSE', 'RECTANGLE'];
const VECTORS = ['VECTOR', 'STAR', 'POLYGON', 'LINE', 'BOOLEAN_OPERATION'];
const hasImage = (n) => visible(n.fills).some((f) => f.type === 'IMAGE');
const hasDirectMask = (n) => Array.isArray(n && n.children) && n.children.some((ch) => ch && ch.visible !== false && ch.isMask);
const hasTextDesc = (n) => n && n.visible !== false && (n.type === 'TEXT' || (Array.isArray(n.children) && n.children.some(hasTextDesc)));
const shouldRasterizeMask = (n) => {
  if (!n) return false;
  if (n.isMask) return true;
  if (!hasDirectMask(n)) return false;
  const name = String(n.name || '');
  return !hasTextDesc(n) || /image|img|photo|picture|video|media|thumbnail|mask/i.test(name);
};
// Tailwind scale class (gap-4) illana arbitrary (gap-[18px])
const SP = { 0: '0', 1: 'px', 2: '0.5', 4: '1', 6: '1.5', 8: '2', 10: '2.5', 12: '3', 14: '3.5', 16: '4', 20: '5', 24: '6', 28: '7', 32: '8', 36: '9', 40: '10', 44: '11', 48: '12', 56: '14', 64: '16', 80: '20', 96: '24' };
const sp = (pre, v) => { v = r(v); return SP[v] !== undefined ? `${pre}-${SP[v]}` : `${pre}-[${v}px]`; };
// responsive value: mobile-first, then sm/md/lg/xl/2xl progressively restores desktop scale
const BPS = ['', 'sm', 'md', 'lg', 'xl', '2xl'];
const bp = (name, cls) => name ? `${name}:${cls}` : cls;
function responsiveVariants(values) {
  return values.flatMap((value, i) => i && value === values[i - 1] ? [] : [bp(BPS[i], value)]);
}
const rsp = (pre, v, opts, cfg) => {
  const o = Object.assign({ thr: 24, min: 0, factors: [0.5, 0.65, 0.78, 0.9, 1, 1] }, cfg || {});
  if (!opts.responsive || v < o.thr) return [sp(pre, v)];
  return responsiveVariants(BPS.map((_, i) => sp(pre, Math.max(o.min, Math.round(v * o.factors[i])))));
};
const rspText = (fs, opts) => {
  if (!opts.responsive || fs < 28) return [`text-[${r(fs)}px]`];
  const factors = fs >= 40 ? [0.55, 0.65, 0.78, 0.9, 1, 1] : [0.75, 0.82, 0.9, 0.96, 1, 1];
  return responsiveVariants(factors.map((factor) => `text-[${r(fs * factor)}px]`));
};
const rspSwitch = (smallCls, largeCls) => responsiveVariants(BPS.map((_, i) => i < 3 ? smallCls : largeCls));
const WNAME = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'normal', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };
const slug = (f) => 'font-' + f.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- gradients ---------- */
function inv(m, x, y) {
  const a = m[0][0], b = m[0][1], c = m[0][2], d = m[1][0], e = m[1][1], f = m[1][2];
  const det = a * e - b * d;
  if (!det) return { x, y };
  const px = x - c, py = y - f;
  return { x: (e * px - b * py) / det, y: (-d * px + a * py) / det };
}
function gradCss(p, w, h) {
  const o = op(p), st = p.gradientStops, m = p.gradientTransform;
  const col = (s) => rgba(s.color, s.color.a * o);
  if (p.type === 'GRADIENT_LINEAR') {
    const s = inv(m, 0, 0.5), e = inv(m, 1, 0.5);
    const sx = s.x * w, sy = s.y * h, dx = e.x * w - sx, dy = e.y * h - sy;
    const Lf = Math.hypot(dx, dy) || 1, ux = dx / Lf, uy = dy / Lf;
    const ang = (Math.atan2(dx, -dy) * 180) / Math.PI, rad = (ang * Math.PI) / 180;
    const L = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)) || 1;
    const proj = (sx - w / 2) * ux + (sy - h / 2) * uy;
    return `linear-gradient(${r(ang)}deg,${st.map((g) => `${col(g)} ${r((0.5 + (proj + g.position * Lf) / L) * 100)}%`).join(',')})`;
  }
  if (p.type === 'GRADIENT_RADIAL') {
    const c = inv(m, 0.5, 0.5), px = inv(m, 1, 0.5), py = inv(m, 0.5, 1);
    const rx = Math.hypot((px.x - c.x) * w, (px.y - c.y) * h), ry = Math.hypot((py.x - c.x) * w, (py.y - c.y) * h);
    return `radial-gradient(${r(rx)}px ${r(ry)}px at ${r(c.x * w)}px ${r(c.y * h)}px,${st.map((g) => `${col(g)} ${r(g.position * 100)}%`).join(',')})`;
  }
  const c0 = col(st[0]);
  return `linear-gradient(${c0},${c0})`;
}

// image bytes direct ah embed pannala: class la token vachu, UI compress panni replace pannum
function imageRef(p, w, h, opts, ctx, cls) {
  if (!opts.images || !p.imageHash || cls.some((x) => /^im\d+$/.test(x))) return `url(https://placehold.co/${Math.round(w)}x${Math.round(h)})`;
  let c = ctx.imgCls[p.imageHash];
  if (!c) { c = 'im' + (++ctx.imgN); ctx.imgCls[p.imageHash] = c; }
  ctx.imgSize[p.imageHash] = Math.max(ctx.imgSize[p.imageHash] || 0, Math.max(w, h) * 2);
  cls.push(c);
  return 'var(--im)';
}

function rasterRef(n, ctx) {
  let c = ctx.maskCls[n.id];
  if (!c) {
    c = 'mk' + (++ctx.maskN);
    const key = 'mask' + ctx.maskN;
    ctx.maskCls[n.id] = c;
    ctx.maskKey[n.id] = key;
    ctx.bytes[key] = n.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: Math.max(0.25, Math.min(2, 1600 / Math.max(n.width || 1, n.height || 1))) }
    }).catch(() => null);
    ctx.imgSize[key] = Math.max(n.width || 800, n.height || 600) * 2;
  }
  return c;
}

function rasterClasses(n, parent, opts, isRoot, ctx) {
  const c = sizeClasses(n, parent, opts, isRoot);
  const hasHeight = c.some((x) => /(^|:)h-/.test(x) || /(^|:)min-h-/.test(x) || x === 'self-stretch' || x === 'flex-1');
  if (!hasHeight) c.push(`aspect-[${Math.max(1, Math.round(n.width || 1))}/${Math.max(1, Math.round(n.height || 1))}]`);
  c.push(rasterRef(n, ctx), 'bg-center', 'bg-no-repeat', 'bg-cover', 'overflow-hidden');
  return c;
}

// fills -> single solid = tailwind class, multiple/gradient/image = inline style
async function bgFor(n, opts, ctx) {
  const fills = visible(n.fills);
  if (!fills.length) return { cls: [], style: [] };
  if (fills.length === 1 && fills[0].type === 'SOLID') return { cls: [`bg-[${colorStr(fills[0].color, op(fills[0]))}]`], style: [] };
  const L = [], cls = [];
  for (const p of fills.slice().reverse()) {
    if (p.type === 'SOLID') { const c = colorStr(p.color, op(p)); L.push({ img: `linear-gradient(${c},${c})`, size: 'auto', rep: 'no-repeat' }); }
    else if (isGrad(p)) L.push({ img: gradCss(p, n.width, n.height), size: 'auto', rep: 'no-repeat' });
    else if (p.type === 'IMAGE') {
      const u = imageRef(p, n.width, n.height, opts, ctx, cls);
      L.push({ img: u, size: p.scaleMode === 'FIT' ? 'contain' : p.scaleMode === 'TILE' ? 'auto' : 'cover', rep: p.scaleMode === 'TILE' ? 'repeat' : 'no-repeat' });
    }
  }
  if (!L.length) return { cls: [], style: [] };
  return { cls, style: [`background-image:${L.map((l) => l.img).join(',')}`, `background-size:${L.map((l) => l.size).join(',')}`, 'background-position:center', `background-repeat:${L.map((l) => l.rep).join(',')}`] };
}

/* rotated / zero-thickness vectors (LINE) ku rotated bounding box use pannanum */
function geom(n, parent) {
  const rot = typeof n.rotation === 'number' && Math.abs(n.rotation) > 0.01;
  const thin = n.type === 'LINE' || n.width < 1 || n.height < 1;
  const b = n.absoluteRenderBounds || n.absoluteBoundingBox;
  if ((rot || thin) && b) {
    const pb = parent && parent.absoluteBoundingBox;
    return { x: pb ? b.x - pb.x : n.x, y: pb ? b.y - pb.y : n.y, w: Math.max(1, b.width), h: Math.max(1, b.height), rot: true };
  }
  return { x: n.x, y: n.y, w: Math.max(n.width, 0), h: Math.max(n.height, 0), rot: false };
}
const geomOf = (n, parent) => (VECTORS.includes(n.type) ? geom(n, parent) : { x: n.x, y: n.y, w: n.width, h: n.height, rot: false });

/* ---------- sizing / positioning ---------- */
const stacked = (n, opts) => opts.responsive && n.layoutMode === 'HORIZONTAL' && n.layoutWrap !== 'WRAP' && n.width >= 600;

function absClasses(n, parent, G) {
  const W = G.w, Ht = G.h;
  const c = ['absolute'];
  const grp = parent.type === 'GROUP' && !G.rot;
  const x = G.x - (grp ? parent.x : 0), y = G.y - (grp ? parent.y : 0);
  const cs = !grp && n.constraints ? n.constraints : { horizontal: 'MIN', vertical: 'MIN' };
  const pw = parent.width || 1, ph = parent.height || 1;
  const isText = n.type === 'TEXT', fitW = isText && n.textAutoResize === 'WIDTH_AND_HEIGHT';
  const H = cs.horizontal, V = cs.vertical;
  if (H === 'MAX') c.push(sp('right', pw - x - W));
  else if (H === 'CENTER') c.push('left-1/2', '-translate-x-1/2', `ml-[${r(x + W / 2 - pw / 2)}px]`);
  else if (H === 'STRETCH') c.push(sp('left', x), sp('right', pw - x - W));
  else if (H === 'SCALE') c.push(`left-[${r((x / pw) * 100)}%]`, `w-[${r((W / pw) * 100)}%]`);
  else c.push(sp('left', x));
  if (H !== 'STRETCH' && H !== 'SCALE' && !fitW) c.push(sp('w', W));
  if (V === 'MAX') c.push(sp('bottom', ph - y - Ht));
  else if (V === 'CENTER') c.push('top-1/2', '-translate-y-1/2', `mt-[${r(y + Ht / 2 - ph / 2)}px]`);
  else if (V === 'STRETCH') c.push(sp('top', y), sp('bottom', ph - y - Ht));
  else if (V === 'SCALE') c.push(`top-[${r((y / ph) * 100)}%]`, `h-[${r((Ht / ph) * 100)}%]`);
  else c.push(sp('top', y));
  if (V !== 'STRETCH' && V !== 'SCALE' && !isText) c.push(sp('h', Ht));
  return c;
}

function sizeClasses(n, parent, opts, isRoot) {
  const c = [];
  if (opts.exact) {   // Exact mode: Figma-la irukkura x/y/size apdiye
    if (isRoot || !parent) return ['relative', 'mx-auto', sp('w', n.width), sp('h', n.height)];
    const G = geomOf(n, parent);
    const grp = parent.type === 'GROUP' && !G.rot;
    c.push('absolute', sp('left', G.x - (grp ? parent.x : 0)), sp('top', G.y - (grp ? parent.y : 0)));
    const isT = n.type === 'TEXT', fit = isT && n.textAutoResize === 'WIDTH_AND_HEIGHT';
    if (!fit) c.push(sp('w', G.w));
    if (!isT) c.push(sp('h', G.h));
    return c;
  }
  if (isRoot) return ['w-full', `max-w-[${r(n.width)}px]`, 'mx-auto'];
  const parentAuto = parent && parent.layoutMode && parent.layoutMode !== 'NONE';
  const g = geomOf(n, parent);
  if (parentAuto && n.layoutPositioning !== 'ABSOLUTE') {
    const along = parent.layoutMode === 'HORIZONTAL', stk = stacked(parent, opts);
    const hz = n.layoutSizingHorizontal, vt = n.layoutSizingVertical;
    const al = { MIN: '', CENTER: 'self-center', MAX: 'self-end' }[parent.counterAxisAlignItems] || '';
    if (hz === 'FILL') {
      if (along) c.push(...(stk ? ['w-full', 'sm:w-full', 'md:w-full', 'lg:flex-1', 'lg:min-w-0', 'xl:flex-1', 'xl:min-w-0', '2xl:flex-1', '2xl:min-w-0'] : ['flex-1', 'min-w-0']));
      else if (typeof n.maxWidth === 'number') c.push('w-full', al);   // stretch + max-width left la ottum, adhunaala w-full + self-center
      else c.push('self-stretch');
    }
    else if (hz === 'FIXED') {
      if (along && stk && g.w >= 200) c.push('w-full', 'sm:w-full', 'md:w-full', `lg:${sp('w', g.w)}`, `xl:${sp('w', g.w)}`, `2xl:${sp('w', g.w)}`, 'lg:shrink-0', 'xl:shrink-0', '2xl:shrink-0');
      else c.push(sp('w', g.w), along ? 'max-w-full shrink-0' : 'max-w-full');
    }
    if (vt === 'FILL') {
      if (along && typeof n.maxHeight === 'number' && !stk) c.push('h-full', al);
      else if (along && stk) c.push('sm:self-auto', 'md:self-auto', 'lg:self-stretch', 'xl:self-stretch', '2xl:self-stretch');
      else c.push(along ? 'self-stretch' : 'flex-1');
    }
    else if (vt === 'FIXED' && n.type !== 'TEXT') c.push(sp('h', g.h));
  } else if (parent) c.push(...absClasses(n, parent, g));
  if (typeof n.minWidth === 'number') c.push(`min-w-[${r(n.minWidth)}px]`);
  if (typeof n.maxWidth === 'number') c.push(`max-w-[${r(n.maxWidth)}px]`);
  if (typeof n.minHeight === 'number') c.push(`min-h-[${r(n.minHeight)}px]`);
  if (typeof n.maxHeight === 'number') c.push(`max-h-[${r(n.maxHeight)}px]`);
  return c;
}

function flexClasses(n, opts) {
  const c = [];
  if (!n.layoutMode || n.layoutMode === 'NONE') return c;
  const horiz = n.layoutMode === 'HORIZONTAL', stk = stacked(n, opts);
  c.push('flex');
  if (horiz ? stk : true) c.push(...(horiz ? rspSwitch('flex-col', 'flex-row') : ['flex-col']));
  if (n.layoutWrap === 'WRAP') c.push('flex-wrap');
  if (n.itemSpacing) c.push(...rsp('gap', n.itemSpacing, opts, { thr: 16, min: 8, factors: [0.55, 0.65, 0.78, 0.9, 1, 1] }));
  if (n.layoutWrap === 'WRAP' && typeof n.counterAxisSpacing === 'number' && n.counterAxisSpacing) c.push(...rsp('gap-y', n.counterAxisSpacing, opts, { thr: 16, min: 8, factors: [0.55, 0.65, 0.78, 0.9, 1, 1] }));
  const t = n.paddingTop, rr = n.paddingRight, b = n.paddingBottom, l = n.paddingLeft;
  const pad = (pre, v) => { if (v) c.push(...rsp(pre, v, opts, { thr: 16, min: 8, factors: [0.5, 0.62, 0.76, 0.9, 1, 1] })); };
  if (t === rr && rr === b && b === l) pad('p', t);
  else {
    if (l === rr) pad('px', l); else { pad('pl', l); pad('pr', rr); }
    if (t === b) pad('py', t); else { pad('pt', t); pad('pb', b); }
  }
  const just = { MIN: 'justify-start', CENTER: 'justify-center', MAX: 'justify-end', SPACE_BETWEEN: 'justify-between' }[n.primaryAxisAlignItems] || 'justify-start';
  const items = { MIN: 'items-start', CENTER: 'items-center', MAX: 'items-end', BASELINE: 'items-baseline' }[n.counterAxisAlignItems] || 'items-start';
  if (stk) { c.push(...rspSwitch('items-stretch', items)); c.push(...(just === 'justify-start' ? ['justify-start'] : rspSwitch('justify-start', just))); }
  else { if (just !== 'justify-start') c.push(just); c.push(items); }
  return c;
}

/* ---------- visuals (frames / shapes) ---------- */
async function visualClasses(n, opts, ctx) {
  const cls = [], style = [];
  const bg = await bgFor(n, opts, ctx);
  cls.push(...bg.cls); style.push(...bg.style);
  if (n.type === 'ELLIPSE') cls.push('rounded-full');
  else if (typeof n.cornerRadius === 'number' && n.cornerRadius) cls.push(`rounded-[${r(n.cornerRadius)}px]`);
  else if (typeof n.cornerRadius === 'symbol') cls.push(`rounded-tl-[${r(n.topLeftRadius)}px]`, `rounded-tr-[${r(n.topRightRadius)}px]`, `rounded-br-[${r(n.bottomRightRadius)}px]`, `rounded-bl-[${r(n.bottomLeftRadius)}px]`);
  const strokeP = visible(n.strokes).filter((p) => p.type === 'SOLID').pop();
  if (strokeP) {
    const sc = colorStr(strokeP.color, op(strokeP));
    if (n.strokeAlign === 'OUTSIDE' && typeof n.strokeWeight === 'number') cls.push(`outline outline-[${r(n.strokeWeight)}px] outline-[${sc}]`);
    else if (typeof n.strokeWeight === 'number') { if (n.strokeWeight) cls.push(n.strokeWeight === 1 ? 'border' : `border-[${r(n.strokeWeight)}px]`, `border-[${sc}]`); }
    else {
      cls.push(`border-[${sc}]`);
      if (n.strokeTopWeight) cls.push(`border-t-[${r(n.strokeTopWeight)}px]`);
      if (n.strokeRightWeight) cls.push(`border-r-[${r(n.strokeRightWeight)}px]`);
      if (n.strokeBottomWeight) cls.push(`border-b-[${r(n.strokeBottomWeight)}px]`);
      if (n.strokeLeftWeight) cls.push(`border-l-[${r(n.strokeLeftWeight)}px]`);
    }
    if (Array.isArray(n.dashPattern) && n.dashPattern.length) cls.push('border-dashed');
  }
  if (n.clipsContent) cls.push('overflow-hidden');
  effects(n, cls, style);
  return { cls, style };
}

function effects(n, cls, style) {
  if (typeof n.opacity === 'number' && n.opacity < 1) cls.push(`opacity-[${r(n.opacity)}]`);
  if (!Array.isArray(n.effects)) return;
  const ef = n.effects.filter((e) => e.visible !== false);
  const sh = ef.filter((e) => e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW');
  if (sh.length) {
    if (n.type === 'TEXT') style.push('text-shadow:' + sh.map((e) => `${r(e.offset.x)}px ${r(e.offset.y)}px ${r(e.radius)}px ${rgba(e.color, e.color.a)}`).join(','));
    else style.push('box-shadow:' + sh.map((e) => `${e.type === 'INNER_SHADOW' ? 'inset ' : ''}${r(e.offset.x)}px ${r(e.offset.y)}px ${r(e.radius)}px ${r(e.spread || 0)}px ${rgba(e.color, e.color.a)}`).join(','));
  }
  const lb = ef.find((e) => e.type === 'LAYER_BLUR'); if (lb) style.push(`filter:blur(${r(lb.radius / 2)}px)`);
  const bb = ef.find((e) => e.type === 'BACKGROUND_BLUR'); if (bb) style.push(`backdrop-filter:blur(${r(bb.radius / 2)}px)`, `-webkit-backdrop-filter:blur(${r(bb.radius / 2)}px)`);
}

/* ---------- text ---------- */
function segStyle(seg, n, opts, ctx, force) {
  const c = [], st = [], fs = seg.fontSize;
  c.push(...rspText(fs, opts));
  const fam = seg.fontName.family;
  (ctx.fonts[fam] = ctx.fonts[fam] || new Set()).add(seg.fontWeight);
  c.push(slug(fam)); if (seg.fontWeight !== 400 || force) c.push(WNAME[seg.fontWeight] ? `font-${WNAME[seg.fontWeight]}` : `font-[${seg.fontWeight}]`);
  if (/italic/i.test(seg.fontName.style)) c.push('italic');
  const lh = seg.lineHeight;
  if (lh && lh.unit === 'PIXELS') {
    const factors = !opts.responsive || fs < 28 ? [1] : fs >= 40 ? [0.55, 0.65, 0.78, 0.9, 1, 1] : [0.75, 0.82, 0.9, 0.96, 1, 1];
    c.push(...responsiveVariants(factors.map((factor) => `leading-[${r(lh.value * factor)}px]`)));
  }
  else if (lh && lh.unit === 'PERCENT') c.push(`leading-[${r(lh.value)}%]`);
  const ls = seg.letterSpacing;
  if (ls && ls.value) c.push(ls.unit === 'PIXELS' ? `tracking-[${r(ls.value)}px]` : `tracking-[${r(ls.value / 100)}em]`);
  if (seg.textDecoration === 'UNDERLINE') c.push('underline');
  if (seg.textDecoration === 'STRIKETHROUGH') c.push('line-through');
  if (seg.textCase === 'UPPER') c.push('uppercase');
  if (seg.textCase === 'LOWER') c.push('lowercase');
  if (seg.textCase === 'TITLE') c.push('capitalize');
  const f = topPaint(seg.fills);
  if (f && f.type === 'SOLID') c.push(`text-[${colorStr(f.color, op(f))}]`);
  else if (isGrad(f)) st.push(`background-image:${gradCss(f, n.width, n.height)}`, '-webkit-background-clip:text', 'background-clip:text', '-webkit-text-fill-color:transparent', 'color:transparent');
  return { cls: c, style: st };
}

function tagFor(n, fs, ctx) {
  const name = n.name.toLowerCase();
  if (n.type === 'TEXT') {
    if (fs >= 40) { if (ctx && !ctx.h1) { ctx.h1 = 1; return 'h1'; } return 'h2'; }
    return fs >= 28 ? 'h2' : fs >= 20 ? 'h3' : 'p';
  }
  if (/^(button|btn)/.test(name)) return 'button';
  const m = name.match(/^(nav|header|footer|section|main|aside)/);
  return m ? m[1] : 'div';
}

const txt = (s) => esc(s).replace(/[\n\u2028]/g, '<br>');

async function textHtml(n, parent, opts, ctx, ind, isRoot) {
  const c = sizeClasses(n, parent, opts, isRoot), style = [];
  const segs = n.getStyledTextSegments(['fontSize', 'fontName', 'fontWeight', 'fills', 'letterSpacing', 'lineHeight', 'textDecoration', 'textCase']);
  if (!segs.length) return '';
  const base = segStyle(segs[0], n, opts, ctx);
  c.push(...base.cls); style.push(...base.style);
  if (n.textAlignHorizontal === 'CENTER') c.push('text-center');
  else if (n.textAlignHorizontal === 'RIGHT') c.push('text-right');
  else if (n.textAlignHorizontal === 'JUSTIFIED') c.push('text-justify');
  if (opts.responsive) c.push('min-w-0', 'max-w-full', 'break-words');
  else if (n.textAutoResize === 'WIDTH_AND_HEIGHT' && c.indexOf('whitespace-nowrap') < 0) c.push('whitespace-nowrap');
  if (n.textTruncation === 'ENDING') c.push(n.maxLines ? `line-clamp-${n.maxLines}` : 'truncate');
  effects(n, c, style);
  let inner;
  if (segs.length > 1) {
    inner = segs.map((s) => {
      const ss = segStyle(s, n, opts, ctx, true);
      return `<span class="${ss.cls.join(' ')}"${ss.style.length ? ` style="${ss.style.join(';')}"` : ''}>${txt(s.characters)}</span>`;
    }).join('');
  } else inner = txt(segs[0].characters);
  const tag = tagFor(n, segs[0].fontSize, ctx);
  return `${ind}<${tag} class="${c.join(' ')}"${style.length ? ` style="${style.join(';')}"` : ''}>${inner}</${tag}>`;
}

/* ---------- icons / vectors ---------- */
function pureShapes(n) {
  if (n.visible === false) return true;
  if (SHAPES.includes(n.type)) return !hasImage(n);
  if (['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'].includes(n.type) && n.children && n.children.length) return n.children.every(pureShapes);
  return false;
}
function hasVector(n) {
  if (VECTORS.includes(n.type)) return true;
  return n.children ? n.children.some(hasVector) : false;
}
const isIcon = (n) => n.children && n.children.length && ((n.width <= 160 && n.height <= 160) || /\b(logo|wordmark|brandmark)\b/i.test(n.name || '')) && pureShapes(n) && hasVector(n);

function namespaceSvg(svg, prefix, overrides = {}) {
  const ids = new Map();
  svg.replace(/\bid\s*=\s*(["'])([^"']+)\1/g, (_, quote, id) => { ids.set(id, overrides[id] || prefix + id); return _; });
  return svg
    .replace(/\bid\s*=\s*(["'])([^"']+)\1/g, (match, quote, id) => `id=${quote}${ids.get(id)}${quote}`)
    .replace(/url\(\s*(["']?)#([^\s)'"(]+)\1\s*\)/g, (match, quote, id) => ids.has(id) ? `url(${quote}#${ids.get(id)}${quote})` : match)
    .replace(/\b((?:xlink:)?href)\s*=\s*(["'])#([^"']+)\2/g, (match, attr, quote, id) => ids.has(id) ? `${attr}=${quote}#${ids.get(id)}${quote}` : match);
}

function spriteSymbol(svg, id) {
  const root = svg.match(/^\s*<svg\b([^>]*)>/);
  const rootId = root && root[1].match(/\bid\s*=\s*(["'])([^"']+)\1/);
  const scoped = namespaceSvg(svg, id + '-', rootId ? { [rootId[2]]: id } : {});
  const match = scoped.match(/^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/);
  if (!match) return null;
  // Paint and opacity on the original SVG root must inherit into every path.
  const attributes = match[1].replace(/\s+(?:id|width|height|xmlns(?::[\w-]+)?)\s*=\s*(["'])[^"']*\1/g, '');
  return `<symbol id="${id}"${attributes}>${match[2]}</symbol>`;
}

async function svgHtml(n, parent, opts, ind, isRoot, ctx) {
  const vis = (a) => visible(a).length > 0;
  if (VECTORS.includes(n.type) && !vis(n.fills) && !vis(n.strokes)) return '';
  let svg;
  try { svg = ctx.svgP[n.id] ? await ctx.svgP[n.id] : await n.exportAsync({ format: 'SVG_STRING' }); } catch (e) { svg = null; }
  if (!svg) return `${ind}<!-- skipped: ${esc(n.name)} (export failed) -->`;
  const c = sizeClasses(n, parent, opts, isRoot);
  const gm = geomOf(n, parent);
  if (!c.some((x) => /(^|:)(w-|flex-1)|self-stretch/.test(x))) c.push(sp('w', gm.w));
  if (!c.some((x) => /(^|:)h-|self-stretch/.test(x)) && !c.some((x) => x.indexOf('top-') === 0 && x !== 'top-1/2')) c.push(sp('h', gm.h));
  c.push('shrink-0');
  const o = []; effects(n, c, o);
  let inner;
  let id = ctx.syms[svg];
  if (!id) {
    const candidate = 'i' + (ctx.symN + 1);
    const symbol = spriteSymbol(svg, candidate);
    if (symbol) { id = candidate; ctx.symN++; ctx.syms[svg] = id; ctx.symDefs.push(symbol); }
  }
  if (id) inner = `<svg class="block w-full h-full" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
  else inner = namespaceSvg(svg, 'inline-' + (++ctx.symN) + '-').replace('<svg ', '<svg class="block w-full h-full" ');
  return `${ind}<div class="${c.join(' ')}">${inner}</div>`;
}

// icons + images munnadiye parallel ah export panna start pannum (romba fast)
function prefetch(n, opts, ctx) {
  if (n.visible === false || n.type === 'TEXT') return;
  if (VECTORS.includes(n.type) || isIcon(n)) {
    if (!ctx.svgP[n.id] && (visible(n.fills).length || visible(n.strokes).length || !VECTORS.includes(n.type))) ctx.svgP[n.id] = n.exportAsync({ format: 'SVG_STRING' }).catch(() => null);
    return;
  }
  if (opts.images) {
    for (const p of visible(n.fills)) {
      if (p.type === 'IMAGE' && p.imageHash && !ctx.bytes[p.imageHash]) {
        const img = figma.getImageByHash(p.imageHash);
        ctx.bytes[p.imageHash] = img ? img.getBytesAsync().catch(() => null) : Promise.resolve(null);
      }
    }
  }
  (n.children || []).forEach((ch) => prefetch(ch, opts, ctx));
}

/* ---------- main tree walk ---------- */
async function toHtml(n, parent, opts, depth, ctx) {
  const markup = await renderNode(n, parent, opts, depth, ctx);
  return opts.annotate ? markup.replace(/^(\s*<[a-z][\w-]*)(?=[\s>])/, (_, opening) => `${opening} data-layer="${esc(n.name)}" data-kind="${esc(n.type)}"`) : markup;
}

async function renderNode(n, parent, opts, depth, ctx) {
  if (n.visible === false) return '';
  const ind = '  '.repeat(depth), isRoot = depth === 0;
  if (n.type === 'TEXT') return textHtml(n, parent, opts, ctx, ind, isRoot);
  if (opts.images && shouldRasterizeMask(n)) {
    const c = rasterClasses(n, parent, opts, isRoot, ctx);
    return `${ind}<div class="${c.join(' ')}" aria-label="${esc(n.name)}"></div>`;
  }
  if (VECTORS.includes(n.type) || isIcon(n)) return svgHtml(n, parent, opts, ind, isRoot, ctx);

  const sz = sizeClasses(n, parent, opts, isRoot);
  const noAuto = opts.exact || !n.layoutMode || n.layoutMode === 'NONE';
  const kids = n.children || [];
  const c = [...sz, ...(opts.exact ? [] : flexClasses(n, opts))];
  const needsRel = (noAuto && kids.length) || kids.some((k) => k.layoutPositioning === 'ABSOLUTE');
  if (needsRel && !sz.includes('absolute') && !sz.includes('relative')) c.push('relative');
  if (noAuto && kids.length && !sz.some((x) => /^h-\[|^h-full/.test(x))) c.push(`h-[${r(n.height)}px]`);
  const vis = await visualClasses(n, opts, ctx);
  c.push(...vis.cls);
  const tag = tagFor(n, 0);
  const out = [];
  for (const ch of kids) { const h = await toHtml(ch, n, opts, depth + 1, ctx); if (h) out.push(h); }
  const open = `<${tag} class="${c.join(' ')}"${vis.style.length ? ` style="${vis.style.join(';')}"` : ''}>`;
  if (!out.length) return `${ind}${open}</${tag}>`;
  return `${ind}${open}\n${out.join('\n')}\n${ind}</${tag}>`;
}

const say = (msg) => figma.ui.postMessage({ type: 'progress', msg });
let lastGeneratedSelection = [];

async function generate(opts) {
  const sel = [...figma.currentPage.selection].sort((a, b) => a.width - b.width);
  if (!sel.length) return figma.ui.postMessage({ type: 'error', msg: 'Oru Frame select pannunga.' });
  const multi = sel.length > 1;
  if (multi && (!opts.responsive || opts.exact)) return figma.ui.postMessage({ type: 'error', msg: 'Enable Responsive to combine mobile, tablet and desktop designs.' });
  if (multi && (sel.length > 3 || sel.some((n) => !['FRAME', 'COMPONENT', 'INSTANCE'].includes(n.type)) || new Set(sel.map((n) => Math.round(n.width))).size !== sel.length)) {
    return figma.ui.postMessage({ type: 'error', msg: 'Select 2 or 3 matching designs at different widths: mobile, optional tablet, desktop.' });
  }
  if (opts.exact) opts.responsive = false;
  const ctx = { fonts: {}, imgCls: {}, imgN: 0, imgSize: {}, bytes: {}, svgP: {}, syms: {}, symDefs: [], symN: 0, maskCls: {}, maskKey: {}, maskN: 0 };
  try {
    say('Exporting icons & images...');
    sel.forEach((n) => prefetch(n, opts, ctx));
    say('Building HTML...');
    const references = [];
    for (const n of sel) {
      // Measure supplied designs without heuristic scaling; the UI merges their layers locally.
      ctx.h1 = 0;
      const markup = await toHtml(n, null, multi ? { ...opts, responsive: false, annotate: true } : opts, 0, ctx);
      references.push({ name: n.name, width: Math.round(n.width), height: Math.round(n.height), html: markup });
    }
    const desktop = references[references.length - 1];
    const fonts = {};
    Object.keys(ctx.fonts).forEach((f) => { fonts[f] = Array.from(ctx.fonts[f]).sort((a, b) => a - b); });
    let head = '';
    if (ctx.symDefs.length) head += `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${ctx.symDefs.join('')}</defs></svg>\n`;
    const hashes = Object.keys(ctx.imgCls);
    const maskKeys = Object.keys(ctx.maskKey).map((id) => ctx.maskKey[id]);
    const assetKeys = hashes.concat(maskKeys);
    const images = {}, sizes = {};
    for (const h of assetKeys) { const b = await ctx.bytes[h]; if (b) { images[h] = b; sizes[h] = Math.round(ctx.imgSize[h]); } }
    const imageCss = hashes.map((h) => `.${ctx.imgCls[h]}{--im:url(__IMG_${h}__)}`);
    const maskCss = Object.keys(ctx.maskKey).map((id) => `.${ctx.maskCls[id]}{background-image:url(__IMG_${ctx.maskKey[id]}__)}`);
    const fontCss = Object.keys(fonts).map((f) => `.${slug(f)}{font-family:"${cssEsc(f)}",${/mono|code|courier/i.test(f) ? 'monospace' : (/serif|playfair|merriweather|lora|georgia|times|garamond|cormorant|bodoni/i.test(f) && !/sans/i.test(f)) ? 'serif' : 'sans-serif'}}`);
    if (imageCss.length || maskCss.length || fontCss.length) head += '<style>' + imageCss.concat(maskCss, fontCss).join('') + '</style>\n';
    lastGeneratedSelection = sel.slice();
    figma.ui.postMessage({ type: 'result', html: head + desktop.html, fonts, images, sizes, width: desktop.width, height: desktop.height, responsive: !!opts.responsive, references: multi ? references : [] });
  } catch (e) {
    figma.ui.postMessage({ type: 'error', msg: String(e && e.stack ? e.stack : e) });
  }
}

function dump(n, d, pAuto) {
  const o = { n: n.name, t: n.type, w: r(n.width), h: r(n.height) };
  if (n.layoutMode && n.layoutMode !== 'NONE') { o.lm = n.layoutMode[0]; o.pa = n.primaryAxisAlignItems; o.ca = n.counterAxisAlignItems; o.gap = n.itemSpacing; o.pad = [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].join(','); if (n.layoutWrap === 'WRAP') o.wrap = 1; }
  if (n.layoutSizingHorizontal) o.sz = n.layoutSizingHorizontal[0] + n.layoutSizingVertical[0];
  ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'].forEach((k) => { if (typeof n[k] === 'number') o[k] = n[k]; });
  if (n.layoutPositioning === 'ABSOLUTE') o.abs = 1;
  if (!pAuto && n.constraints) o.c = n.constraints.horizontal[0] + n.constraints.vertical[0] + ' x' + r(n.x) + ' y' + r(n.y);
  if (n.type === 'TEXT') o.txt = n.characters.slice(0, 18);
  const auto = n.layoutMode && n.layoutMode !== 'NONE';
  if (d < 6 && n.children && !isIcon(n)) o.k = n.children.filter((c) => c.visible !== false).map((c) => dump(c, d + 1, auto));
  return o;
}

function sendSelection() {
  const sel = figma.currentPage.selection;
  figma.ui.postMessage({ type: 'selection', count: sel.length, names: sel.map((n) => n.name) });
}
figma.on('selectionchange', sendSelection);
figma.ui.onmessage = (m) => {
  if (m.type === 'generate') generate(m.opts);
  if (m.type === 'ready') {
    sendSelection();

  }

  if (m.type === 'debug') figma.ui.postMessage({ type: 'debug', json: JSON.stringify(figma.currentPage.selection.map((n) => dump(n, 0, false))) });
  if (m.type === 'ai-screenshots') captureAiScreenshots();
};

async function captureAiScreenshots() {
  try {
    if (!lastGeneratedSelection.length) throw new Error('Generate a design first.');
    const screenshots = await Promise.all(lastGeneratedSelection.map(async (node) => {
      if (node.removed) throw new Error('A generated frame was removed. Generate again.');
      const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: Math.max(0.1, Math.min(1, 1440 / node.width, 2400 / node.height)) } });
      return { width: Math.round(node.width), height: Math.round(node.height), bytes };
    }));
    figma.ui.postMessage({ type: 'ai-screenshots', screenshots });
  } catch (error) { figma.ui.postMessage({ type: 'ai-screenshots', error: error.message || String(error) }); }
}
