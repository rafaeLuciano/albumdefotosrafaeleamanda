// Gera as versões otimizadas das fotos a partir de ./fotos e escreve em ./site/gallery
// Uso: npm run fotos            (opções: --max=2048 --quality=82 --thumb=640)
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'fotos');
const OUT = path.join(ROOT, 'site', 'gallery');
const arg = (k, d) => Number((process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1]) || d;
const MAX = arg('max', 2048);       // maior lado da foto "web" (visualização, download e vídeo)
const QUALITY = arg('quality', 82); // qualidade JPEG da foto "web"
const THUMB = arg('thumb', 640);    // maior lado da miniatura

const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === '__MACOSX') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

const exists = f => fs.access(f).then(() => true, () => false);

const files = (await walk(SRC)).sort((a, b) => collator.compare(path.relative(SRC, a), path.relative(SRC, b)));
if (!files.length) {
  console.error('Nenhuma foto encontrada em ./fotos — extraia o ZIP lá dentro e rode de novo.');
  process.exit(1);
}
console.log(`${files.length} fotos encontradas. Gerando versões otimizadas...`);

await fs.mkdir(path.join(OUT, 'thumbs'), { recursive: true });
await fs.mkdir(path.join(OUT, 'web'), { recursive: true });

const pad = Math.max(4, String(files.length).length);
const ids = files.map((_, i) => String(i + 1).padStart(pad, '0'));
let done = 0, next = 0;

async function work() {
  while (next < files.length) {
    const i = next++;
    const id = ids[i];
    const tOut = path.join(OUT, 'thumbs', `${id}.webp`);
    const wOut = path.join(OUT, 'web', `${id}.jpg`);
    try {
      if (!(await exists(tOut)) || !(await exists(wOut))) {
        const base = sharp(files[i], { failOn: 'none', limitInputPixels: false }).rotate();
        await Promise.all([
          base.clone().resize(THUMB, THUMB, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 74 }).toFile(tOut),
          base.clone().resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: QUALITY, mozjpeg: true }).toFile(wOut),
        ]);
      }
    } catch (err) {
      console.warn(`\nFalha em ${files[i]}: ${err.message}`);
      ids[i] = null;
    }
    done++;
    if (done % 10 === 0 || done === files.length) process.stdout.write(`\r${done}/${files.length}`);
  }
}
sharp.concurrency(1);
await Promise.all(Array.from({ length: Math.max(1, Math.min(os.cpus().length, 6)) }, work));

const photos = ids.filter(Boolean);
await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ photos }));
console.log(`\nPronto: ${photos.length} fotos. Faça o deploy da pasta ./site`);
