// Generates the extension icons (no dependencies) — ascending green bars on a
// dark background. Run: node scripts/generate-icons.js
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
  // rows with filter byte 0
  const raw = Buffer.alloc(N * (N * 4 + 1));
  for (let y = 0; y < N; y++) {
    raw[y * (N * 4 + 1)] = 0;
    rgba.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function draw(N) {
  const buf = Buffer.alloc(N * N * 4);
  const set = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  // Rounded-rect mask with a subtle vertical background gradient.
  const radius = N * 0.22;
  const inCorner = (x, y) => {
    const cx = x < radius ? radius : x > N - radius ? N - radius : x;
    const cy = y < radius ? radius : y > N - radius ? N - radius : y;
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    return dx * dx + dy * dy <= radius * radius;
  };
  for (let y = 0; y < N; y++) {
    const t = y / (N - 1);
    const bg = [Math.round(18 - 6 * t), Math.round(23 - 7 * t), Math.round(30 - 9 * t)];
    for (let x = 0; x < N; x++) {
      if (inCorner(x, y)) set(x, y, bg[0], bg[1], bg[2], 255);
    }
  }
  // Ascending bars.
  const pad = Math.max(2, Math.round(N * 0.24));
  const base = N - pad;
  const inner = N - 2 * pad;
  const bw = Math.max(1, Math.round((inner / 3) * 0.62));
  const gap = Math.max(1, Math.round((inner - 3 * bw) / 2));
  const heights = [0.42, 0.68, 1.0];
  const colors = [[26, 122, 88], [24, 160, 110], [23, 199, 132]];
  const barR = Math.max(1, Math.round(bw * 0.3)); // rounded bar tops
  const drawBar = (x0, h, c) => {
    const top = base - h;
    for (let y = top; y < base; y++) {
      for (let x = x0; x < x0 + bw; x++) {
        // round only the two top corners
        if (y < top + barR && (x < x0 + barR || x > x0 + bw - barR)) {
          const cx = x < x0 + barR ? x0 + barR : x0 + bw - barR;
          const cy = top + barR;
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          if (dx * dx + dy * dy > barR * barR) continue;
        }
        if (inCorner(x, y)) set(x, y, c[0], c[1], c[2], 255);
      }
    }
  };
  for (let b = 0; b < 3; b++) drawBar(pad + b * (bw + gap), Math.max(1, Math.round(inner * heights[b])), colors[b]);
  // Brand-red baseline accent under the bars.
  const by = base + Math.max(1, Math.round(N * 0.03));
  const bh = Math.max(1, Math.round(N * 0.035));
  for (let y = by; y < by + bh; y++) for (let x = pad; x < N - pad; x++) if (inCorner(x, y)) set(x, y, 232, 53, 46, 255);
  return buf;
}

const outDir = path.join(__dirname, '..', 'extension', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const N of [16, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${N}.png`), encodePNG(N, draw(N)));
  console.log('wrote icons/icon' + N + '.png');
}
