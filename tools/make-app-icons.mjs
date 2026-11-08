// Dibuja el ícono de la app (PNG) sin dependencias externas.
// Uso: npm run app-icons
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'icons');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel((x + 0.5) / size, (y + 0.5) / size, 1 / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

const BG = [4, 6, 10], CYAN = [0, 229, 255], BLUE = [47, 123, 255];
const PTS = [[0.2, 0.67], [0.4, 0.5], [0.55, 0.59], [0.79, 0.33]];
const W = 0.034, DOT = 0.062;
function lineY(u) {
  for (let i = 0; i < PTS.length - 1; i++) {
    const [ax, ay] = PTS[i], [bx, by] = PTS[i + 1];
    if (u >= ax && u <= bx) return ay + (by - ay) * (u - ax) / (bx - ax);
  }
  return null;
}

function pixel(u, v, px) {
  let col = [...BG];
  // halo central
  const g = Math.exp(-((u - 0.5) ** 2 + (v - 0.45) ** 2) / 0.09) * 0.22;
  col = mix(col, CYAN, g);
  // grilla tenue
  const gx = Math.abs(((u * 8) % 1) - 0.5), gy = Math.abs(((v * 8) % 1) - 0.5);
  const grid = (smooth(0.47, 0.5, gx) + smooth(0.47, 0.5, gy)) * 0.05 * (1 - v * 0.8);
  col = mix(col, CYAN, clamp(grid));
  // área bajo la curva
  const ly = lineY(u);
  if (ly !== null && v > ly) col = mix(col, CYAN, clamp(0.16 * (1 - (v - ly) / 0.3)));
  // línea
  let d = Infinity;
  for (let i = 0; i < PTS.length - 1; i++) d = Math.min(d, segDist(u, v, ...PTS[i], ...PTS[i + 1]));
  col = mix(col, CYAN, 0.5 * Math.exp(-Math.max(d - W, 0) / 0.035));
  const lineCol = mix(BLUE, CYAN, smooth(0.2, 0.75, u));
  col = mix(col, lineCol, smooth(W + px, W - px, d));
  // punto final
  const [ex, ey] = PTS[PTS.length - 1];
  const dd = Math.hypot(u - ex, v - ey);
  col = mix(col, CYAN, 0.6 * Math.exp(-Math.max(dd - DOT, 0) / 0.04));
  col = mix(col, mix(CYAN, [235, 253, 255], smooth(DOT, 0, dd)), smooth(DOT + px, DOT - px, dd));
  return col.map(c => Math.round(clamp(c, 0, 255)));
}

await mkdir(outDir, { recursive: true });
for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) {
  await writeFile(path.join(outDir, name), png(size, pixel));
  console.log('ok', name);
}
