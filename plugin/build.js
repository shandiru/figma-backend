// Figma loads one HTML string. Bundle runtime libraries into that file instead
// of relying on script URLs or relative files inside its sandboxed iframe.
const fs = require('node:fs');
const path = require('node:path');
const libraries = [
  ['prettier', 'prettier/standalone'],
  ['prettier-html', 'prettier/plugins/html'],
];
const vendor = libraries.map(([name, module]) => {
  const source = fs.readFileSync(require.resolve(module), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script data-vendor="${name}">${source}</script>`;
}).join('\n');
const source = fs.readFileSync(path.join(__dirname, 'ui.source.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'ui.html'), source.replace('<!-- BUNDLED_LIBRARIES -->', () => vendor));
const licenses = [['prettier', 'LICENSE']].map(([name, file]) => {
  const directory = path.dirname(require.resolve(name + '/package.json'));
  return name + '\n' + fs.readFileSync(path.join(directory, file), 'utf8');
});
fs.writeFileSync(path.join(__dirname, 'THIRD_PARTY_NOTICES.txt'), licenses.join('\n\n'));
console.log('Built plugin/ui.html with bundled Prettier.');

// Keep the top-level development plugin in sync with the tracked backend copy.
const publicPlugin = path.resolve(__dirname, '../../plugin');
if (fs.existsSync(publicPlugin)) for (const file of ['code.js', 'ui.html', 'manifest.json', 'responsive.test.js']) fs.copyFileSync(path.join(__dirname, file), path.join(publicPlugin, file));
