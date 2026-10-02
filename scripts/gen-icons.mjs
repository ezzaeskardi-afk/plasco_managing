// Generates the PWA icon set as raw PNGs (no image libraries, works offline).
// Motif: the app's signature "stock stack" - nested bars on a basin-teal field.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const outDir = fileURLToPath(new URL('../public', import.meta.url));

const BASIN = [0x0b, 0x72, 0x85];
const PAPER = [0xff, 0xff, 0xff];

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4;
      raw[rowStart + 1 + x * 4] = pixels[p];
      raw[rowStart + 2 + x * 4] = pixels[p + 1];
      raw[rowStart + 3 + x * 4] = pixels[p + 2];
      raw[rowStart + 4 + x * 4] = pixels[p + 3];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Rounded-rect coverage at a point (0..1 anti-aliased edge approximation). */
function insideRoundedRect(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function drawIcon(size, { padding = 0.14, bars = 4, radius = 0.22 } = {}) {
  const px = new Uint8Array(size * size * 4);
  const pad = size * padding;
  const inner = size - pad * 2;
  const cornerR = size * radius;

  // Bars grow from the bottom; widths shrink upward like nested basins.
  const gap = inner * 0.055;
  const barH = (inner - gap * (bars - 1) - inner * 0.06) / bars;
  const barStartY = pad + size * 0.06;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4;
      let color = PAPER;
      let alpha = 255;

      if (!insideRoundedRect(x + 0.5, y + 0.5, size, cornerR)) {
        color = PAPER;
        alpha = 0;
      } else {
        color = BASIN;
        for (let b = 0; b < bars; b++) {
          const w = inner * (1 - b * 0.14);
          const bx = (size - w) / 2;
          const by = barStartY + b * (barH + gap);
          if (x + 0.5 >= bx && x + 0.5 <= bx + w && y + 0.5 >= by && y + 0.5 <= by + barH) {
            color = PAPER;
            break;
          }
        }
      }
      px[p] = color[0];
      px[p + 1] = color[1];
      px[p + 2] = color[2];
      px[p + 3] = alpha;
    }
  }
  return encodePng(size, px);
}

mkdirSync(outDir, { recursive: true });
const files = [
  ['pwa-192.png', drawIcon(192)],
  ['pwa-512.png', drawIcon(512)],
  ['pwa-maskable-512.png', drawIcon(512, { padding: 0.26, radius: 0.5, bars: 3 })],
  ['apple-touch-icon.png', drawIcon(180, { padding: 0.16, radius: 0.2 })],
];
for (const [name, buf] of files) {
  writeFileSync(join(outDir, name), buf);
  console.log(`wrote public/${name} (${buf.length} bytes)`);
}
