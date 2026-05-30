// Generates the extension's PNG icons (a simple clock on a blue tile) with no
// external dependencies — just Node's built-in zlib for PNG compression.
// Run with: npm run icons

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

const BG = [37, 99, 235]; // #2563eb
const FACE = [248, 250, 252]; // near-white
const HAND = [15, 23, 42]; // dark slate

function lerp(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

// Distance from point p to segment a-b.
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function renderIcon(size) {
  const data = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const faceR = size * 0.42;
  const edge = Math.max(1, size * 0.04); // anti-alias band
  const handW = Math.max(0.8, size * 0.035);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x - c, y - c);
      let color = BG;

      // Clock face (anti-aliased circle).
      if (d <= faceR + edge) {
        const t = Math.min(1, Math.max(0, (faceR + edge - d) / (2 * edge)));
        color = lerp(BG, FACE, t);
      }
      // Hands: minute hand straight up, hour hand to ~4 o'clock.
      if (d <= faceR) {
        const minute = distToSegment(x, y, c, c, c, c - faceR * 0.78);
        const hour = distToSegment(x, y, c, c, c + faceR * 0.5, c + faceR * 0.32);
        if (minute <= handW || hour <= handW || d <= handW * 1.6) {
          color = HAND;
        }
      }

      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  return data;
}

// --- minimal PNG encoder -----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(body.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])));
  return Buffer.concat([lenBuf, typeBuf, body, crcBuf]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10..12 already zero (compression / filter / interlace)

  // Add the per-scanline filter byte (0 = none).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  const png = encodePng(size, renderIcon(size));
  writeFileSync(join(OUT_DIR, `icon${size}.png`), png);
  console.log(`wrote icons/icon${size}.png (${png.length} bytes)`);
}
