/**
 * Génère les icônes PWA (PNG) sans dépendance externe :
 * un carré bleu CESI (#1f4e79) avec une "carte article" blanche — motif News.
 *
 * Usage : node scripts/generate-icons.js   (écrit dans public/icons/)
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');

const BRAND = [31, 78, 121, 255]; // #1f4e79
const WHITE = [255, 255, 255, 255];
const LINE = [31, 78, 121, 255];

// --- CRC32 (PNG) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // compression 0, filter 0, interlace 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    rgba.copy ? null : null;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (size * 4 + 1) + 1 + x * 4;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      raw[dst + 3] = rgba[src + 3];
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Dessine l'icône : fond bleu plein + carte blanche arrondie avec lignes de
 * texte bleues (évoque un article). Pour maskable, le motif reste dans la
 * "safe zone" centrale (80 %).
 */
function drawIcon(size, maskable = false) {
  const rgba = new Uint8Array(size * size * 4);
  const pad = maskable ? size * 0.1 : 0;
  const s = size - pad * 2;
  const bgR = maskable ? size * 0.12 : 0; // coins adoucis même si plein cadre
  const cardX0 = pad + s * 0.2;
  const cardY0 = pad + s * 0.24;
  const cardX1 = pad + s * 0.8;
  const cardY1 = pad + s * 0.78;
  const cardR = size * 0.06;

  // Lignes de "texte" de l'article (bleu sur carte blanche).
  const lines = [];
  const lx0 = cardX0 + s * 0.09;
  const lx1a = cardX0 + s * 0.68;
  const lx1b = cardX0 + s * 0.48;
  const ly0 = cardY0 + s * 0.09;
  const lh = s * 0.045;
  const step = s * 0.085;
  for (let i = 0; i < 4; i++) {
    lines.push({ x0: lx0, x1: i === 3 ? lx1b : lx1a, y: ly0 + i * step, h: lh });
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = BRAND;
      if (inRoundRect(x, y, pad, pad, size - pad - 1, size - pad - 1, bgR)) {
        color = BRAND;
      } else {
        color = [0, 0, 0, 0];
      }
      if (color[3] === 255 && inRoundRect(x, y, cardX0, cardY0, cardX1, cardY1, cardR)) {
        color = WHITE;
        for (const l of lines) {
          if (y >= l.y && y <= l.y + l.h && x >= l.x0 && x <= l.x1) {
            color = LINE;
            break;
          }
        }
      }
      const idx = (y * size + x) * 4;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = color[3];
    }
  }
  return encodePng(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];
for (const [name, size, maskable] of targets) {
  writeFileSync(join(OUT_DIR, name), drawIcon(size, maskable));
  console.log(`Icône générée : public/icons/${name} (${size}x${size})`);
}
