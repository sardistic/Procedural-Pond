// Regenerates the favicon and app icons by rendering a koi with the pond's own
// renderer, so the icon matches the art. Run with: node tools/make-icons.js
// Writes favicon.ico (16/32/48), icon-192.png, icon-512.png and apple-touch-icon.png.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const libs = ['core', 'raster', 'creatures']
  .map((f) => fs.readFileSync(path.join(root, 'js', `${f}.js`), 'utf8').replace("'use strict';", ''))
  .join('\n');

// Render an N x N icon: a curled kohaku koi over pond water. Returns RGBA bytes.
const renderIcon = new Function(`${libs}
return function renderIcon(N, s, rounded) {
  const r = new Raster(N, N);
  r.begin();
  const world = { W: N, H: N, rocks: [], creatures: [], pointer: { inside: false }, current: { x: 0, y: 0, s: 0 }, nearestFood: () => null };
  const koi = withSeed('pond-icon', () => new Koi(world, N / 2, N / 2, 0));
  const b = koi.body;
  for (let i = 0; i < b.links.length; i++) b.links[i] *= s;
  for (let i = 0; i < b.w.length; i++) b.w[i] *= s;
  // Swim the head around a circle so the body trails into a curl.
  const cx = N / 2, cy = N / 2 + N * 0.07, R = N * 0.27;
  let a = -PI * 0.95;
  b.place(cx + Math.cos(a) * R, cy + Math.sin(a) * R, a + PI / 2);
  for (let k = 0; k < 120; k++) { a += 0.02; b.resolve(cx + Math.cos(a) * R, cy + Math.sin(a) * R, a + PI / 2); }
  koi.z = N * 0.2;
  koi.draw(r);
  const light = hexToInt('#2f8a9c'), deep = hexToInt('#123e4c');
  const bg = new Uint32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x + 0.5 - N * 0.4, y + 0.5 - N * 0.35) / N;
    bg[x + y * N] = mixColor(light, deep, Math.min(1, Math.floor((d * 1.6 + BAYER4[(x & 3) | ((y & 3) << 2)] * 0.12) * 5) / 5));
  }
  const out = new Uint32Array(N * N);
  r.compose(out, { bg, bgLight: bg, caustic: new Float32Array(128 * 128), t: 0, outline: OUTLINE, emissive: EMISSIVE,
    fade: new Uint8Array(65536), tint: null, caustics: false, shadows: true, outlines: true });
  if (rounded) {
    // Rounded tile with a dark 1px rim; outside is transparent.
    const rad = N * 0.22, edge = hexToInt('#0b1a22');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const qx = Math.max(rad - x - 0.5, x + 0.5 - (N - rad), 0), qy = Math.max(rad - y - 0.5, y + 0.5 - (N - rad), 0);
      const d = Math.hypot(qx, qy);
      if (d > rad) out[x + y * N] = 0;
      else if (d > rad - 1 || x === 0 || y === 0 || x === N - 1 || y === N - 1) out[x + y * N] = edge;
    }
  }
  return Buffer.from(out.buffer);
};`)();

// Nearest-neighbour upscale keeps the pixels hard.
function upscale(rgba, n, k) {
  const out = Buffer.alloc(n * k * n * k * 4);
  for (let y = 0; y < n * k; y++) for (let x = 0; x < n * k; x++) {
    rgba.copy(out, (x + y * n * k) * 4, (((x / k) | 0) + ((y / k) | 0) * n) * 4, (((x / k) | 0) + ((y / k) | 0) * n) * 4 + 4);
  }
  return out;
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };

function png(rgba, w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4), crc = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]);
    len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ICO container holding PNG images (supported by all current browsers).
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    head[e] = size >= 256 ? 0 : size; head[e + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}

const i16 = renderIcon(16, 0.42, true), i24 = renderIcon(24, 0.62, true), i32 = renderIcon(32, 0.82, true);
const square32 = renderIcon(32, 0.82, false), square30 = renderIcon(30, 0.78, false);
fs.writeFileSync(path.join(root, 'favicon.ico'), ico([
  { size: 16, data: png(i16, 16, 16) },
  { size: 32, data: png(i32, 32, 32) },
  { size: 48, data: png(upscale(i24, 24, 2), 48, 48) },
]));
fs.writeFileSync(path.join(root, 'icon-192.png'), png(upscale(square32, 32, 6), 192, 192));
fs.writeFileSync(path.join(root, 'icon-512.png'), png(upscale(square32, 32, 16), 512, 512));
fs.writeFileSync(path.join(root, 'apple-touch-icon.png'), png(upscale(square30, 30, 6), 180, 180));
console.log('icons written');
