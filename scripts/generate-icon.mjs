/**
 * Genera src-tauri/icons/source.png (1024x1024) disegnando il logo LlamaDesk
 * in modo procedurale: nessuna dipendenza, nessun rasterizzatore esterno.
 *
 * Da qui, `tauri icon src-tauri/icons/source.png` produce l'intero set di
 * icone richieste da Windows (.ico compreso).
 *
 * Uso: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SIZE = 1024;
const SS = 2; // supersampling: disegniamo a 2048 e riduciamo, per l'antialiasing
const N = 4.5; // esponente della superellisse (squircle)

const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

const C1 = hex('#7C7CF0');
const C2 = hex('#8B5CF6');
const C3 = hex('#22D3EE');

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Distanza da un segmento: serve a disegnare i collegamenti del glifo. */
function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = clamp01(((px - x1) * dx + (py - y1) * dy) / lengthSquared);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Glifo in coordinate 512, riscalate sotto: hub centrale + tre nodi collegati.
const HUB = [256, 272, 42];
const NODES = [
  [150, 168, 27],
  [362, 168, 27],
  [256, 388, 27],
];
const STROKE = 13; // meta' spessore della linea (26 nel viewBox 512)

function render() {
  const dim = SIZE * SS;
  const pixels = new Uint8ClampedArray(dim * dim * 4);
  const half = dim / 2;
  const scale = dim / 512;

  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const index = (y * dim + x) * 4;

      // 1. Maschera: siamo dentro la superellisse?
      const nx = (x + 0.5 - half) / half;
      const ny = (y + 0.5 - half) / half;
      if (Math.abs(nx) ** N + Math.abs(ny) ** N > 1) continue;

      // 2. Superficie: gradiente diagonale a tre fermate.
      const t = clamp01((nx + ny + 2) / 4);
      let r;
      let g;
      let b;
      if (t < 0.45) {
        const k = t / 0.45;
        r = lerp(C1[0], C2[0], k);
        g = lerp(C1[1], C2[1], k);
        b = lerp(C1[2], C2[2], k);
      } else {
        const k = (t - 0.45) / 0.55;
        r = lerp(C2[0], C3[0], k);
        g = lerp(C2[1], C3[1], k);
        b = lerp(C2[2], C3[2], k);
      }

      // 3. Riflesso di luce in alto a sinistra.
      const sheen =
        0.45 *
        Math.max(
          0,
          1 - Math.hypot((x - dim * 0.29) / (dim * 0.62), (y - dim * 0.21) / (dim * 0.58)),
        );
      r = lerp(r, 255, sheen);
      g = lerp(g, 255, sheen);
      b = lerp(b, 255, sheen);

      // 4. Glifo bianco: hub, nodi e collegamenti.
      const gx = x / scale;
      const gy = y / scale;
      let inGlyph = Math.hypot(gx - HUB[0], gy - HUB[1]) <= HUB[2];
      if (!inGlyph) {
        for (const [cx, cy, radius] of NODES) {
          if (Math.hypot(gx - cx, gy - cy) <= radius) {
            inGlyph = true;
            break;
          }
          if (distanceToSegment(gx, gy, HUB[0], HUB[1], cx, cy) <= STROKE) {
            inGlyph = true;
            break;
          }
        }
      }
      if (inGlyph) {
        r = 255;
        g = 255;
        b = 255;
      }

      pixels[index] = r;
      pixels[index + 1] = g;
      pixels[index + 2] = b;
      pixels[index + 3] = 255;
    }
  }

  return downsample(pixels, dim, SS);
}

/** Media a blocchi SSxSS: l'antialiasing di bordi e glifo. */
function downsample(source, dim, factor) {
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const si = ((y * factor + dy) * dim + (x * factor + dx)) * 4;
          const alpha = source[si + 3] / 255;
          r += source[si] * alpha;
          g += source[si + 1] * alpha;
          b += source[si + 2] * alpha;
          a += alpha;
        }
      }
      const di = (y * SIZE + x) * 4;
      if (a > 0) {
        out[di] = r / a;
        out[di + 1] = g / a;
        out[di + 2] = b / a;
      }
      out[di + 3] = (a / (factor * factor)) * 255;
    }
  }
  return out;
}

/* ------------------------------- encoder PNG (RGBA, filtro 0) ------------- */

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

function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro "None"
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const target = 'src-tauri/icons/source.png';
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, encodePng(render(), SIZE));
console.log(`${target} generato (${SIZE}x${SIZE}).`);
console.log('Passo successivo: npx tauri icon src-tauri/icons/source.png');
