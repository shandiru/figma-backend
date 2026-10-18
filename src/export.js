const JSZip = require('jszip');
const { compileCss, exportTheme } = require('./compile');
const { MAX_HTML_CHARS } = require('./config');

async function createArchive({ html, theme, assets = [] }, stage = () => {}) {
  if (typeof html !== 'string' || !html.trim()) throw new Error('Export needs HTML');
  if (html.length > MAX_HTML_CHARS) throw new Error(`Export HTML exceeds the ${MAX_HTML_CHARS.toLocaleString()} character limit`);
  if (!Array.isArray(assets) || assets.length > 500) throw new Error('Export supports up to 500 assets');
  const safeTheme = exportTheme(theme);
  const zip = new JSZip();
  stage('Validating WebP images and SVG icons');
  const seen = new Set();
  for (const asset of assets) {
    if (!asset || typeof asset.path !== 'string' || !/^assets\/(?:images\/[\w-]+\.webp|icons\/[\w-]+\.svg)$/.test(asset.path) || seen.has(asset.path)) throw new Error('Invalid or duplicate asset path');
    seen.add(asset.path);
    if (typeof asset.content !== 'string') throw new Error('Invalid asset content');
    if (asset.path.endsWith('.webp')) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(asset.content)) throw new Error('Invalid WebP encoding');
      const buffer = Buffer.from(asset.content, 'base64');
      if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') throw new Error('Image must be WebP');
      zip.file(asset.path, buffer);
    } else {
      if (!/^\s*<svg\b/.test(asset.content) || /<script\b|\bon\w+\s*=|<!DOCTYPE|<!ENTITY/i.test(asset.content)) throw new Error('Invalid SVG icon');
      zip.file(asset.path, asset.content);
    }
  }
  stage('Compiling exact Tailwind CSS');
  const css = await compileCss(html, safeTheme);
  // Export receives a complete page from the plugin, with local asset paths.
  const page = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style data-compiled>[\s\S]*?<\/style>/gi, '');
  if (!/<\/head>/i.test(page)) throw new Error('Export requires a complete HTML page');
  const output = page.replace(/<\/head>/i, '<link rel="stylesheet" href="assets/tailwind.css">\n</head>');
  zip.file('index.html', output);
  zip.file('assets/tailwind.css', css);
  zip.file('tailwind.config.js', 'module.exports = ' + JSON.stringify({ content: ['./index.html'], theme: { extend: safeTheme } }, null, 2) + ';\n');
  zip.file('input.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
  zip.file('README.txt', 'Open index.html in your browser. Images are WebP and icons are SVG. CSS is compiled locally; Google Fonts need internet or a system fallback. The page preserves the selected Figma frame at its original size.\n');
  stage('Compressing HTML, CSS and assets into ZIP');
  return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), html: output };
}

module.exports = { createArchive };
