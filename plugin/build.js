// Figma loads one HTML string. Bundle runtime libraries into that file instead
// of relying on script URLs or relative files inside its sandboxed iframe.
const fs = require('node:fs');
const path = require('node:path');
const libraries = [
  ['prettier', 'prettier/standalone'],
  ['prettier-html', 'prettier/plugins/html'],
  ['jszip', 'jszip/dist/jszip.min.js'],
];
const vendor = libraries.map(([name, module]) => {
  const source = fs.readFileSync(require.resolve(module), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script data-vendor="${name}">${source}</script>`;
}).join('\n');
const source = fs.readFileSync(path.join(__dirname, 'ui.source.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'ui.html'), source.replace('<!-- BUNDLED_LIBRARIES -->', () => vendor));
const licenses = [['prettier', 'LICENSE'], ['jszip', 'LICENSE.markdown']].map(([name, file]) => {
  const directory = path.dirname(require.resolve(name + '/package.json'));
  return name + '\n' + fs.readFileSync(path.join(directory, file), 'utf8');
});
fs.writeFileSync(path.join(__dirname, 'THIRD_PARTY_NOTICES.txt'), licenses.join('\n\n'));
console.log('Built plugin/ui.html with bundled Prettier and JSZip.');
