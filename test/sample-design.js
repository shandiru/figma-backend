// Figma plugin-shaped sample payload, with Auto Layout and coordinate-only frames.
const solid = (hex) => [{ type: 'SOLID', color: { r: parseInt(hex.slice(0, 2), 16) / 255, g: parseInt(hex.slice(2, 4), 16) / 255, b: parseInt(hex.slice(4, 6), 16) / 255 } }];
const node = (name, width, height, children = [], extra = {}) => ({
  id: name, name, type: 'FRAME', x: 0, y: 0, width, height, children,
  fills: [], strokes: [], layoutMode: 'NONE', layoutSizingHorizontal: 'FIXED', ...extra,
});
const text = (name, characters, fontSize, extra = {}) => node(name, 520, 80, [], {
  type: 'TEXT', characters, fontSize, layoutSizingHorizontal: 'FILL', ...extra,
  segments: [{ characters, fontSize, fontName: { family: 'Inter', style: 'Regular' }, fontWeight: fontSize >= 30 ? 700 : 400, lineHeight: { unit: 'PIXELS', value: fontSize * 1.25 }, fills: solid('172554') }],
});
function sampleDesign() {
  const copy = node('Hero copy', 520, 300, [
    text('Title', 'Build something remarkable', 60),
    text('Description', 'A responsive layout that adapts to your ideas and every screen.', 18),
    node('Button get started', 180, 48, [text('Button label', 'Get started', 16)], { layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'HUG', paddingTop: 12, paddingBottom: 12, paddingLeft: 24, paddingRight: 24, cornerRadius: 12, fills: solid('dbeafe') }),
  ], { layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', itemSpacing: 24 });
  const photo = node('Product photo', 560, 360, [], { x: 600, fills: [{ type: 'IMAGE', imageHash: 'photo', scaleMode: 'FILL' }], cornerRadius: 16 });
  const hero = node('Hero', 1200, 400, [copy, photo]);
  const cards = node('Features', 1200, 260, [0, 1, 2].map((i) => node('Card ' + (i + 1), 360, 240, [
    text('Feature title', ['Responsive', 'Readable', 'Reusable'][i], 24),
    text('Feature description', 'Content stays in flow on every screen.', 16),
  ], { x: i * 400, layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', itemSpacing: 17, paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24, cornerRadius: 13, fills: solid('dbeafe') })), { layoutMode: 'HORIZONTAL', itemSpacing: 24 });
  const icon = node('Logo', 40, 40, [], { type: 'VECTOR', fills: solid('172554'), svg: '<svg viewBox="0 0 40 40" fill="#172554"><path d="M0 0h40v40H0z"/></svg>' });
  return node('Page', 1440, 1100, [icon, hero, cards], { layoutMode: 'VERTICAL', itemSpacing: 48, paddingTop: 32, paddingBottom: 32 });
}
function hydrate(node) {
  if (node.segments) node.getStyledTextSegments = () => node.segments;
  node.exportAsync = async ({ format }) => {
    if (format === 'SVG_STRING') return node.svg;
    throw new Error('Unexpected raster export');
  };
  (node.children || []).forEach(hydrate);
  return node;
}
module.exports = { node, text, solid, sampleDesign, hydrate };
