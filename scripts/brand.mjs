/**
 * Asset del marchio LlamaDesk, generati da `src/components/brand/geometry.json`
 * (la stessa geometria che React disegna): nessuna dipendenza, nessun
 * rasterizzatore esterno.
 *
 *   node scripts/brand.mjs          → src-tauri/icons/source.png (1024) e docs/brand/*.svg
 *   node scripts/brand.mjs --ico    → icon.ico e 32x32.png con la versione piccola
 *                                     sotto i 32px (da lanciare DOPO `tauri icon`)
 *
 * `npm run icons` fa tutto nell'ordine giusto.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const geometry = JSON.parse(readFileSync('src/components/brand/geometry.json', 'utf8'));
const VIEW = geometry.viewBox;

const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ------------------------------------------------------------ geometria */

/** Distanza con segno da un rettangolo con raggi per angolo (negativa dentro). */
function roundedRectDistance(px, py, { x, y, w, h, r }) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  const cx = x + w / 2;
  const cy = y + h / 2;
  const radius = px < cx ? (py < cy ? tl : bl) : py < cy ? tr : br;
  const qx = Math.abs(px - cx) - (w / 2 - radius);
  const qy = Math.abs(py - cy) - (h / 2 - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

/** La tacca a V delle orecchie unite: triangolo con la punta verso il basso. */
function inNotch(px, py, { x, y, w, notch }) {
  if (!notch || py > y + notch) return false;
  const half = notch * 0.6 * (1 - (py - y) / notch);
  return Math.abs(px - (x + w / 2)) < half;
}

function coverage(px, py, shape) {
  if (inNotch(px, py, shape)) return 0;
  return roundedRectDistance(px, py, shape) <= 0 ? 1 : 0;
}

/* -------------------------------------------------------------- raster */

/**
 * Icona dell'app a `size` pixel: tessera grafite con gradiente verticale e
 * simbolo al 72%. `small` sceglie la versione con le orecchie unite.
 */
export function renderIcon(size, small) {
  const samples = size <= 64 ? 8 : 3;
  const shapes = small ? geometry.small : geometry.regular;
  const tile = geometry.tile;
  const radius = VIEW * tile.radiusRatio;
  const scale = small ? tile.smallSymbolScale : tile.symbolScale;
  const offset = (VIEW * (1 - scale)) / 2;
  const top = hex(tile.top);
  const bottom = hex(tile.bottom);
  const ink = hex(geometry.ink.onTile);
  const brand = hex(geometry.brand.onTile);
  const pixels = new Uint8ClampedArray(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const vx = ((px + (sx + 0.5) / samples) / size) * VIEW;
          const vy = ((py + (sy + 0.5) / samples) / size) * VIEW;
          if (roundedRectDistance(vx, vy, { x: 0, y: 0, w: VIEW, h: VIEW, r: radius }) > 0) {
            continue;
          }
          const t = vy / VIEW;
          let color = top.map((channel, i) => channel + (bottom[i] - channel) * t);
          const sxv = (vx - offset) / scale;
          const syv = (vy - offset) / scale;
          for (const shape of shapes) {
            if (coverage(sxv, syv, shape)) color = shape.tone === 'brand' ? brand : ink;
          }
          r += color[0];
          g += color[1];
          b += color[2];
          a += 1;
        }
      }
      const index = (py * size + px) * 4;
      if (a > 0) {
        pixels[index] = r / a;
        pixels[index + 1] = g / a;
        pixels[index + 2] = b / a;
      }
      pixels[index + 3] = (a / (samples * samples)) * 255;
    }
  }
  return pixels;
}

/* --------------------------------------------------------- PNG e ICO */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO con immagini PNG (supportato da Windows Vista in poi). */
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

/* ---------------------------------------------------------------- SVG */

function shapePath({ x, y, w, h, r, notch }) {
  const [tl, tr, br, bl] = r;
  const right = x + w;
  const bottom = y + h;
  const top = notch ? `H${x + w / 2 - notch * 0.6}L${x + w / 2} ${y + notch}L${x + w / 2 + notch * 0.6} ${y}` : '';
  const corner = (radius, toX, toY) => (radius > 0 ? `A${radius} ${radius} 0 0 1 ${toX} ${toY}` : `L${toX} ${toY}`);
  return (
    `M${x + tl} ${y}${top}H${right - tr}${corner(tr, right, y + tr)}V${bottom - br}` +
    `${corner(br, right - br, bottom)}H${x + bl}${corner(bl, x, bottom - bl)}V${y + tl}${corner(tl, x + tl, y)}Z`
  );
}

function symbolPaths(shapes, ink, brand) {
  return shapes
    .map((shape) => `<path d="${shapePath(shape)}" fill="${shape.tone === 'brand' ? brand : ink}"/>`)
    .join('');
}

const svg = (width, height, body, title = 'LlamaDesk') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

function appIconSvg() {
  const { tile } = geometry;
  const offset = (VIEW * (1 - tile.symbolScale)) / 2;
  return svg(
    VIEW,
    VIEW,
    `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tile.top}"/><stop offset="1" stop-color="${tile.bottom}"/></linearGradient></defs>` +
      `<rect width="${VIEW}" height="${VIEW}" rx="${VIEW * tile.radiusRatio}" fill="url(#t)"/>` +
      `<g transform="translate(${offset} ${offset}) scale(${tile.symbolScale})">${symbolPaths(geometry.regular, geometry.ink.onTile, geometry.brand.onTile)}</g>`,
  );
}

/** Logo orizzontale: simbolo a 96 e nome in Segoe UI Variable Display. */
function logoSvg(mode) {
  const ink = geometry.ink[mode];
  const brand = geometry.brand[mode];
  const background = mode === 'dark' ? '#101415' : '#F3F5F4';
  const scale = 96 / VIEW;
  return svg(
    420,
    128,
    `<rect width="420" height="128" fill="${background}"/>` +
      `<g transform="translate(16 16) scale(${scale})">${symbolPaths(geometry.regular, ink, brand)}</g>` +
      `<text x="126" y="83" fill="${ink}" font-family="'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif" font-size="50" font-weight="600" letter-spacing="-1">LlamaDesk</text>`,
  );
}

/* ------------------------------------------------------------- uscita */

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`  ${path}`);
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (!isMain) {
  // Importato (per esempio da un'anteprima): nessun file scritto.
} else if (process.argv.includes('--ico')) {
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const images = sizes.map((size) => ({
    size,
    // Fino a 32 px la versione piccola, piu' grande nella tessera: come in React.
    png: encodePng(renderIcon(size, size <= 32), size),
  }));
  write('src-tauri/icons/icon.ico', encodeIco(images));
  write('src-tauri/icons/32x32.png', images.find((image) => image.size === 32).png);
} else {
  write('src-tauri/icons/source.png', encodePng(renderIcon(1024, false), 1024));
  write('docs/brand/app-icon.svg', appIconSvg());
  write('docs/brand/symbol.svg', svg(VIEW, VIEW, symbolPaths(geometry.regular, geometry.ink.light, geometry.brand.light)));
  write('docs/brand/symbol-dark.svg', svg(VIEW, VIEW, symbolPaths(geometry.regular, geometry.ink.dark, geometry.brand.dark)));
  write('docs/brand/symbol-small.svg', svg(VIEW, VIEW, symbolPaths(geometry.small, geometry.ink.light, geometry.brand.light)));
  write('docs/brand/symbol-mono.svg', svg(VIEW, VIEW, symbolPaths(geometry.regular, '#000000', '#000000')));
  write('docs/brand/logo-light.svg', logoSvg('light'));
  write('docs/brand/logo-dark.svg', logoSvg('dark'));
}
