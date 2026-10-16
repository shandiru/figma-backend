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
function nearest(value, scale, tolerance = 0.14, minimum = 1) {
  const key = Object.keys(scale).map(Number).sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0];
  return Math.abs(key - value) <= Math.max(minimum, Math.abs(value) * tolerance) ? scale[key] : null;
}
const sp = (pre, v) => { v = r(v); const step = nearest(v, SP); return step !== null ? `${pre}-${step}` : `${pre}-[${v}px]`; };
const TEXT_SCALE = { 12: 'xs', 14: 'sm', 16: 'base', 18: 'lg', 20: 'xl', 24: '2xl', 30: '3xl', 36: '4xl', 48: '5xl', 60: '6xl', 72: '7xl', 96: '8xl', 128: '9xl' };
const textSize = (v) => { const step = nearest(v, TEXT_SCALE); return step ? `text-${step}` : `text-[${r(v)}px]`; };
const maxWidth = (v) => { const step = nearest(v, { 320: 'xs', 384: 'sm', 448: 'md', 512: 'lg', 576: 'xl', 672: '2xl', 768: '3xl', 896: '4xl', 1024: '5xl', 1152: '6xl', 1280: '7xl' }); return step ? `max-w-${step}` : `max-w-[${r(v)}px]`; };
// Keep all preview breakpoints available; emit only meaningful layout changes.
const BPS = ['', 'sm', 'md', 'lg', 'xl', '2xl'];
const bp = (name, cls) => name ? `${name}:${cls}` : cls;
function responsiveVariants(values) {
  return values.flatMap((value, i) => i && value === values[i - 1] ? [] : [bp(BPS[i], value)]);
}
const rsp = (pre, v, opts, cfg) => {
  const o = Object.assign({ thr: 24, min: 0, factors: [0.5, 0.65, 0.78, 0.9, 1, 1] }, cfg || {});
  if (!opts.responsive || v < o.thr) return [sp(pre, v)];
  return responsiveVariants([0, 0, 2, 4, 4, 4].map((index) => sp(pre, Math.max(o.min, Math.round(v * o.factors[index])))));
};
const rspText = (fs, opts) => {
  if (!opts.responsive || fs < 28) return [textSize(fs)];
  const factors = fs >= 40 ? [0.55, 0.65, 0.78, 0.9, 1, 1] : [0.75, 0.82, 0.9, 0.96, 1, 1];
  return responsiveVariants([0, 0, 2, 4, 4, 4].map((index) => textSize(fs * factors[index])));
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
  if (isRoot) return ['mx-auto', 'w-full', 'max-w-7xl', 'px-4', 'sm:px-6', 'lg:px-8'];
  if (parent && isOverlay(n, parent)) return absClasses(n, parent, geomOf(n, parent));
  c.push('min-w-0');
  const horizontal = parent && parent.layoutMode === 'HORIZONTAL';
  const hz = n.layoutSizingHorizontal;
  if (hz === 'FILL' || n.layoutGrow === 1) c.push('w-full', 'max-w-full', ...(horizontal && !repeatedItems(parent) ? (stacked(parent, opts) ? ['lg:flex-1'] : ['flex-1']) : []));
  else if (hz === 'HUG' || n.type === 'TEXT' || /^(button|btn|link)/i.test(n.name || '')) c.push('w-fit', 'max-w-full');
  else c.push('w-full', maxWidth(typeof n.maxWidth === 'number' ? n.maxWidth : n.width));
  // Content determines height. Explicit Figma minima must also fit a phone.
  if (n.layoutSizingVertical === 'FILL' && !horizontal) c.push('flex-1');
  if (typeof n.minHeight === 'number' && n.minHeight > 0) c.push(sp('min-h', n.minHeight));
  return c;
}

// Layer coordinates are evidence for grouping, never the normal CSS positioning model.
function isOverlay(n, parent) {
  if (!parent) return false;
  return /\b(badge|overlay|floating|decoration|decorative)\b/i.test(n.name || '') &&
    (n.layoutPositioning === 'ABSOLUTE' || !parent.layoutMode || parent.layoutMode === 'NONE');
}
function layoutPlan(n) {
  const children = (n.children || []).filter((child) => child.visible !== false && !isOverlay(child, n));
  if (n.layoutMode && n.layoutMode !== 'NONE') return { rows: [children], inferred: false };
  const rows = [];
  for (const child of children.slice().sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0))) {
    const y = child.y || 0;
    const row = rows.find((row) => Math.abs(row.y - y) <= Math.max(8, Math.min(row.height, child.height || 1) * 0.35));
    if (row) { row.nodes.push(child); row.height = Math.min(row.height, child.height || 1); }
    else rows.push({ y, height: child.height || 1, nodes: [child] });
  }
  return { rows: rows.map((row) => row.nodes.sort((a, b) => (a.x || 0) - (b.x || 0))), inferred: true };
}
function repeatedItems(n) {
  const children = (n.children || []).filter((child) => child.visible !== false && !isOverlay(child, n));
  if (children.length < 3) return false;
  if (children.every((child) => /card|feature|pricing|plan|product|testimonial/i.test(child.name || ''))) return true;
  const first = children[0];
  const signature = (child) => (child.children || []).filter((n) => n.visible !== false).map((n) => n.type).join(',');
  return !!signature(first) && children.every((child) => child.type !== 'TEXT' &&
    signature(child) === signature(first) && Math.abs(child.width - first.width) <= first.width * 0.15 && Math.abs(child.height - first.height) <= first.height * 0.15) &&
    (n.layoutMode === 'HORIZONTAL' || layoutPlan(n).rows.some((row) => row.length > 1));
}

function flexClasses(n, opts, isRoot = false) {
  const c = [], plan = layoutPlan(n);
  const horiz = n.layoutMode === 'HORIZONTAL' || (plan.inferred && plan.rows.length === 1 && plan.rows[0].length > 1);
  const stk = horiz && opts.responsive && n.width >= 600;
  if (repeatedItems(n)) c.push('grid', 'grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
  else c.push('flex', ...(stk ? ['flex-col', 'lg:flex-row'] : [horiz ? 'flex-row' : 'flex-col']));
  if (n.layoutWrap === 'WRAP') c.push('flex-wrap');
  let gap = n.itemSpacing;
  if (plan.inferred) {
    const distances = plan.rows.length > 1
      ? plan.rows.slice(1).map((row, i) => (row[0].y || 0) - Math.max(...plan.rows[i].map((child) => (child.y || 0) + (child.height || 0))))
      : (plan.rows[0] || []).slice(1).map((child, i) => (child.x || 0) - ((plan.rows[0][i].x || 0) + (plan.rows[0][i].width || 0)));
    gap = distances.length ? Math.max(0, Math.min(...distances)) : 0;
  }
  if (gap > 0) c.push(...rsp('gap', gap, opts));
  else if (repeatedItems(n)) c.push('gap-6');
  if (n.layoutWrap === 'WRAP' && n.counterAxisSpacing > 0) c.push(...rsp('gap-y', n.counterAxisSpacing, opts));
  const pad = (pre, value) => { if (value > 0) c.push(...rsp(pre, value, opts)); };
  const t = n.paddingTop || 0, rr = n.paddingRight || 0, b = n.paddingBottom || 0, l = n.paddingLeft || 0;
  // The page container owns its responsive horizontal gutters.
  if (!isRoot && t === rr && rr === b && b === l) pad('p', t);
  else {
    if (!isRoot) { if (l === rr) pad('px', l); else { pad('pl', l); pad('pr', rr); } }
    if (t === b) pad('py', t); else { pad('pt', t); pad('pb', b); }
  }
  const just = { MIN: 'justify-start', CENTER: 'justify-center', MAX: 'justify-end', SPACE_BETWEEN: 'justify-between' }[n.primaryAxisAlignItems] || 'justify-start';
  const items = { MIN: 'items-start', CENTER: 'items-center', MAX: 'items-end', BASELINE: 'items-baseline' }[n.counterAxisAlignItems] || 'items-stretch';
  c.push(just, ...(stk ? rspSwitch('items-stretch', items) : [items]));
  return c;
}

/* ---------- visuals (frames / shapes) ---------- */
async function visualClasses(n, opts, ctx) {
  const cls = [], style = [];
  const bg = await bgFor(n, opts, ctx);
  cls.push(...bg.cls); style.push(...bg.style);
  if (n.type === 'ELLIPSE') cls.push('rounded-full');
  else if (typeof n.cornerRadius === 'number' && n.cornerRadius) {
    const radius = nearest(n.cornerRadius, { 2: 'sm', 4: '', 6: 'md', 8: 'lg', 12: 'xl', 16: '2xl', 24: '3xl', 999: 'full' });
    cls.push(radius !== null ? 'rounded' + (radius ? '-' + radius : '') : `rounded-[${r(n.cornerRadius)}px]`);
  }
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
    const ratio = lh.value / fs;
    const line = nearest(ratio, { 1: 'none', 1.25: 'tight', 1.375: 'snug', 1.5: 'normal', 1.625: 'relaxed', 2: 'loose' }, 0.04, 0.02);
    c.push(line ? `leading-${line}` : `leading-[${r(ratio)}]`);
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
    return fs >= 24 ? 'h2' : fs >= 20 ? 'h3' : 'p';
  }
  if (/^(button|btn|cta)/.test(name)) return 'button';
  if (/^(link|anchor)/.test(name)) return 'a';
  if (/^(input|email|search|textfield)/.test(name)) return 'input';
  if (/^(list|menu items)/.test(name)) return 'ul';
  if (/^(list item|item)/.test(name)) return 'li';
  if (/^(card|pricing|testimonial)/.test(name)) return 'article';
  if (/^(hero|features|pricing section)/.test(name)) return 'section';
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
  const parentTag = parent && tagFor(parent, 0);
  const tag = ['button', 'a', 'label'].includes(parentTag) ? 'span' : tagFor(n, segs[0].fontSize, ctx);
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
  const markup = cleanMarkup(await renderNode(n, parent, opts, depth, ctx));
  return opts.annotate ? markup.replace(/^(\s*<[a-z][\w-]*)(?=[\s>])/, (_, opening) => `${opening} data-layer="${esc(n.name)}" data-kind="${esc(n.type)}"`) : markup;
}

function cleanMarkup(markup) {
  const rank = (token) => {
    const t = token.replace(/^(?:sm:|md:|lg:|xl:|2xl:)/, '');
    if (/^(relative|absolute|flex|grid|block|inline|items-|justify-|self-|order-|shrink-|grow|overflow-)/.test(t)) return 0;
    if (/^(p[trblxy]?-|m[trblxy]?-|gap-)/.test(t)) return 1;
    if (/^(w-|h-|min-|max-|aspect-)/.test(t)) return 2;
    if (/^(font-|text-(?!\[?#)|leading-|tracking-|break-|whitespace-)/.test(t)) return 3;
    if (/^(bg-|text-|border-)/.test(t)) return 4;
    return 5;
  };
  return markup.replace(/class="([^"]*)"/g, (_, value) => `class="${[...new Set(value.split(/\s+/).filter(Boolean))].sort((a, b) => rank(a) - rank(b)).join(' ')}"`);
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
  const kids = n.children || [];
  const c = [...sz, ...(opts.exact ? [] : flexClasses(n, opts, isRoot))];
  const needsRel = opts.exact || kids.some((k) => isOverlay(k, n));
  if (needsRel && !sz.includes('absolute') && !sz.includes('relative')) c.push('relative');
  const vis = await visualClasses(n, opts, ctx);
  c.push(...vis.cls);
  const tag = isRoot && tagFor(n, 0) === 'div' ? 'main' : tagFor(n, 0);
  // Image-only layers are real, fluid images; image fills with text remain backgrounds.
  if (!opts.exact && hasImage(n) && !kids.length) {
    const paint = visible(n.fills).find((p) => p.type === 'IMAGE');
    const key = paint.imageHash;
    const imageClasses = c.filter((value) => !/^im\d+$/.test(value) && !['flex', 'flex-col', 'flex-row', 'items-stretch', 'justify-start', 'w-fit'].includes(value));
    imageClasses.push('w-full', 'h-auto', 'object-cover');
    return `${ind}<img class="${imageClasses.join(' ')}" src="${key && opts.images ? `__IMG_${key}__` : `https://placehold.co/${Math.round(n.width)}x${Math.round(n.height)}`}" width="${Math.round(n.width)}" height="${Math.round(n.height)}" alt="${esc(n.name)}">`;
  }
  const out = [];
  const plan = layoutPlan(n);
  const rows = !opts.exact && plan.inferred && !repeatedItems(n) ? plan.rows : [kids.filter((child) => !isOverlay(child, n))];
  for (const row of rows) {
    const wrap = plan.inferred && rows.length > 1 && row.length > 1;
    const contents = [];
    for (const ch of row) { const h = await toHtml(ch, n, opts, depth + (wrap ? 2 : 1), ctx); if (h) contents.push(h); }
    const rowAttrs = opts.annotate ? ` data-layer="Layout row ${rows.indexOf(row) + 1}" data-kind="INFERRED_ROW"` : '';
    if (contents.length) out.push(wrap ? `${ind}  <div${rowAttrs} class="flex flex-col gap-6 md:flex-row">\n${contents.join('\n')}\n${ind}  </div>` : contents.join('\n'));
  }
  for (const ch of kids.filter((child) => isOverlay(child, n))) {
    const h = await toHtml(ch, n, opts, depth + 1, ctx); if (h) out.push(h);
  }
  // Interactive elements cannot contain heading/paragraph controls or nested buttons.
  const attrs = tag === 'button' ? ' type="button"' : tag === 'a' ? ' href="#"' : tag === 'input' ? ` type="${/email/i.test(n.name) ? 'email' : /search/i.test(n.name) ? 'search' : 'text'}" aria-label="${esc(n.name)}"` : '';
  const open = `<${tag}${attrs} class="${c.join(' ')}"${vis.style.length ? ` style="${vis.style.join(';')}"` : ''}>`;
  if (tag === 'input') return `${ind}${open}`;
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
    const counts = new Map(), colors = {};
    const colorPattern = /(?:bg|text|border|outline|fill|stroke)-\[(#[0-9a-f]{6}|rgba\([^\]]+\))\]/gi;
    for (const ref of references) for (const match of ref.html.matchAll(colorPattern)) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
    for (const [color, count] of counts) if (count > 1) colors['design-' + (Object.keys(colors).length + 1)] = color;
    for (const ref of references) ref.html = ref.html.replace(colorPattern, (match, color) => {
      const key = Object.keys(colors).find((key) => colors[key] === color);
      return key ? match.slice(0, match.indexOf('-[')) + '-' + key : match;
    });
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
    figma.ui.postMessage({ type: 'result', html: head + desktop.html, fonts, colors, images, sizes, width: desktop.width, height: desktop.height, responsive: !!opts.responsive, references: multi ? references : [] });
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
figma.ui.onmessage = async (m) => {
  if (m.type === 'generate') generate(m.opts);
  if (m.type === 'ready') {
    sendSelection();
    if (figma.clientStorage) {
      const settings = await figma.clientStorage.getAsync('backend-settings').catch(() => null);
      if (settings) figma.ui.postMessage({ type: 'backend-settings', settings });
    }
  }

  if (m.type === 'debug') figma.ui.postMessage({ type: 'debug', json: JSON.stringify(figma.currentPage.selection.map((n) => dump(n, 0, false))) });
  if (m.type === 'ai-screenshots') captureAiScreenshots();
  if (m.type === 'save-backend-settings' && figma.clientStorage && m.settings) {
    await figma.clientStorage.setAsync('backend-settings', {
      url: String(m.settings.url || '').slice(0, 500), key: String(m.settings.key || '').slice(0, 500), logging: m.settings.logging !== false
    }).catch(() => null);
  }
  if (m.type === 'open-dashboard' && typeof m.url === 'string' && /^https:\/\/[^\s]+$|^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/.test(m.url)) figma.openExternal(m.url);
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
