// Generates the extension icons (no dependencies) - a cream ledger page with a
// folded corner and an export arrow. Run: node scripts/generate-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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

function encodePNG(N, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0);
  ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(N * (N * 4 + 1));
  for (let y = 0; y < N; y++) {
    raw[y * (N * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const PAPER = [244, 241, 234];
const FLAP = [219, 212, 196];
const INK = [20, 18, 15];
const OXBLOOD = [122, 46, 42];

const PAD = 0.02;
const FOLD = 0.28; // dog-ear size, as a fraction of the tile
const RADIUS = 0.17;

// Signed distance to a rounded rect; negative inside.
function sdRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const bx = (x1 - x0) / 2 - r;
  const by = (y1 - y0) / 2 - r;
  const qx = Math.abs(x - cx) - bx;
  const qy = Math.abs(y - cy) - by;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

function inRect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// One sample of the mark in unit space. Returns [r,g,b] or null for transparent.
// `detail` drops the ledger rules at sizes where they would turn to mush.
function shade(x, y, detail) {
  const lo = PAD;
  const hi = 1 - PAD;
  const span = hi - lo;

  // Page outline = rounded rect intersected with the diagonal that cuts the
  // top-right corner off. max() of two distances gives the intersection.
  const dRect = sdRoundRect(x, y, lo, lo, hi, hi, RADIUS * span);
  const foldLine = hi - FOLD * span;
  const dFold = (x - y - foldLine + lo) / Math.SQRT2;
  const dPage = Math.max(dRect, dFold);
  if (dPage > 0) return null;

  const stroke = Math.max(0.05, 1.1 / detail.N);
  if (dPage > -stroke) return INK;

  // Dog-ear: the triangle left of the cut inside the corner box, drawn as the
  // folded-back flap. Its hairline is dropped at 16px, where it turns to mush.
  const foldX = hi - FOLD * span;
  const foldY = lo + FOLD * span;
  if (x > foldX && y < foldY) {
    if (detail.rules && dFold > -stroke * 1.4) return INK;
    return FLAP;
  }

  // Export arrow, pointing down out of the page.
  const a = detail.arrow;
  if (inRect(x, y, 0.5 - a.shaft, a.top, 0.5 + a.shaft, a.head)) return OXBLOOD;
  if (y >= a.head && y <= a.tip) {
    const w = a.wing * (1 - (y - a.head) / (a.tip - a.head));
    if (Math.abs(x - 0.5) <= w) return OXBLOOD;
  }

  // Ledger rules, standing in for the statement's text lines.
  if (detail.rules) {
    if (inRect(x, y, 0.16, 0.200, 0.58, 0.255)) return INK;
    if (inRect(x, y, 0.16, 0.315, 0.46, 0.370)) return INK;
  }

  return PAPER;
}

function draw(N) {
  const buf = Buffer.alloc(N * N * 4);
  const SS = 6; // supersampling factor, for smooth edges without a raster lib
  const rules = N >= 32;
  const detail = {
    N,
    rules,
    arrow: rules
      ? { shaft: 0.072, top: 0.42, head: 0.585, wing: 0.215, tip: 0.85 }
      : { shaft: 0.100, top: 0.30, head: 0.550, wing: 0.240, tip: 0.82 },
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((x + (sx + 0.5) / SS) / N, (y + (sy + 0.5) / SS) / N, detail);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (y * N + x) * 4;
      if (!a) continue;
      buf[i] = Math.round(r / a);
      buf[i + 1] = Math.round(g / a);
      buf[i + 2] = Math.round(b / a);
      buf[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return buf;
}

const outDir = path.join(__dirname, '..', 'extension', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const N of [16, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${N}.png`), encodePNG(N, draw(N)));
  console.log('wrote icons/icon' + N + '.png');
}
const storeIcon = path.join(__dirname, '..', 'store-assets', 'store-icon-128.png');
fs.copyFileSync(path.join(outDir, 'icon128.png'), storeIcon);
console.log('wrote store-assets/store-icon-128.png');
