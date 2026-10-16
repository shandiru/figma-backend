const postcss = require('postcss');
const tailwind = require('tailwindcss');

function exportTheme(value = {}) {
  const theme = { colors: {}, fontFamily: {} };
  for (const group of Object.keys(theme)) {
    const values = value[group] || {};
    if (typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > 100) throw new Error('Invalid export theme');
    for (const [name, item] of Object.entries(values)) {
      if (!/^[a-z][a-z0-9-]{0,79}$/i.test(name)) throw new Error('Invalid theme token name');
      if (group === 'colors') {
        if (typeof item !== 'string' || !/^(?:#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/i.test(item)) throw new Error('Invalid theme color');
      } else if (!Array.isArray(item) || !item.length || item.length > 5 || item.some((font) => typeof font !== 'string' || font.length > 100 || /[;{}<>\\]/.test(font))) throw new Error('Invalid font family');
      theme[group][name] = item;
    }
  }
  return theme;
}

async function compileCss(html, theme) {
  const config = { content: [{ raw: html, extension: 'html' }], theme: { extend: theme }, plugins: [], corePlugins: { preflight: true } };
  const result = await postcss([tailwind(config)]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;', { from: undefined });
  return result.css;
}
module.exports = { compileCss, exportTheme };
