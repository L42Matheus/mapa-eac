// Gera um único arquivo HTML (mapa-convento.html) com o Three.js, o app e —
// se existir a pasta seed/ — os pontos e mídias embutidos (window.__SEED).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const r = await build({
  entryPoints: ['src/app.js'], bundle: true, format: 'iife', minify: true, write: false,
  target: 'es2020', logLevel: 'warning',
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\/script');

let seedTag = '';
if (existsSync('seed/meta.json')) {
  const meta = JSON.parse(readFileSync('seed/meta.json', 'utf8'));
  const media = [];
  for (const m of meta.media) {
    const fn = 'seed/media/' + m.markerId.slice(0, 8) + '__' + m.name.replace(/[\/:*?"<>|]/g, '_');
    if (!existsSync(fn)) { console.warn('seed: faltando', fn); continue; }
    media.push({ id: m.id, markerId: m.markerId, name: m.name, type: m.type, createdAt: m.createdAt, b64: readFileSync(fn).toString('base64') });
  }
  seedTag = `<script id="seed">window.__SEED=${JSON.stringify({ markers: meta.markers, media })}</script>\n`;
  console.log(`seed embutido: ${meta.markers.length} pontos, ${media.length}/${meta.media.length} mídias`);
}

const html = readFileSync('src/index.html', 'utf8').replace('<!--APP-->', () => seedTag + `<script>${js}</script>`);
writeFileSync('mapa-convento.html', html);
console.log('ok ->', 'mapa-convento.html', (html.length / 1048576).toFixed(1) + ' MB');
