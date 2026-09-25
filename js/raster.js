'use strict';
// A tiny z-buffered height-field rasterizer. Every body part is a tapered tube
// or an ellipsoid; each covered pixel gets a height and a surface normal, which
// turns into banded, dithered lighting plus a height-offset drop shadow. That
// is what gives the chunky voxel / pixel-art look.

const LIGHT = (() => {
  const l = [-0.45, -0.6, 0.66], m = Math.hypot(...l);
  return l.map((v) => v / m);
})();
const SHADOW_X = 0.3, SHADOW_Y = 0.42;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const CAUSTIC_SIZE = 128;

class Raster {
  constructor(W, H) {
    this.W = W; this.H = H;
    const n = W * H;
    this.col = new Uint32Array(n);
    this.z = new Float32Array(n);
    this.zBase = new Float32Array(n); // static scenery heights (rocks), floor = 0
    this.id = new Uint16Array(n);
    this.sh = new Uint8Array(n);      // tallest caster whose shadow lands here
    this.alpha = 1;                   // < 1 draws an ordered-dither fraction of pixels (fades)
    this.castShadows = true;
  }

  begin() {
    this.z.set(this.zBase);
    this.id.fill(0);
    this.sh.fill(0);
  }

  put(x, y, h, m, nx, ny, nz, id) {
    const W = this.W;
    if (this.alpha < 1 && BAYER4[(x & 3) | ((y & 3) << 2)] + 0.5 >= this.alpha) return;
    if (h > 1 && this.castShadows) {
      const sx = x + Math.round(h * SHADOW_X), sy = y + Math.round(h * SHADOW_Y);
      if (sx < W && sy < this.H) {
        const q = sx + sy * W;
        if (h > this.sh[q]) this.sh[q] = h > 255 ? 255 : h;
      }
    }
    const p = x + y * W;
    if (h <= this.z[p]) return;
    const l = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] + BAYER4[(x & 3) | ((y & 3) << 2)] * 0.16;
    const c = m[l < 0.3 ? 0 : l < 0.55 ? 1 : l < 0.88 ? 2 : 3];
    this.col[p] = c;
    this.z[p] = h;
    this.id[p] = id;
  }

  // Tapered capsule from a to b. Radii ar/br, base heights az/bz, hs = height
  // relative to radius (1 = round, <1 = flat). shader is a material or
  // (u along 0..1, v across -1..1, x, y) => material|null.
  tube(ax, ay, ar, az, bx, by, br, bz, hs, shader, id, u0 = 0, u1 = 1) {
    const W = this.W, H = this.H;
    if (ar < 0.72) ar = 0.72;
    if (br < 0.72) br = 0.72;
    const x0 = Math.max(0, Math.floor(Math.min(ax - ar, bx - br)));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax + ar, bx + br)));
    const y0 = Math.max(0, Math.floor(Math.min(ay - ar, by - br)));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay + ar, by + br)));
    if (x0 > x1 || y0 > y1) return;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const invL2 = L2 > 1e-9 ? 1 / L2 : 0, invL = L2 > 1e-9 ? 1 / Math.sqrt(L2) : 0;
    const fn = typeof shader === 'function';
    const ihs = 1 / (hs > 0.05 ? hs : 0.05);
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5 - ay;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - ax;
        let t = (px * dx + py * dy) * invL2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ox = px - dx * t, oy = py - dy * t;
        const r = ar + (br - ar) * t;
        const d2 = ox * ox + oy * oy, r2 = r * r;
        if (d2 >= r2) continue;
        const nz = Math.sqrt(1 - d2 / r2);
        const h = az + (bz - az) * t + nz * r * hs;
        let m = shader;
        if (fn) {
          m = shader(u0 + (u1 - u0) * t, (dx * oy - dy * ox) * invL / r, x, y);
          if (!m) continue;
        }
        const nx = ox / r, ny = oy / r, nzz = nz * ihs;
        const k = 1 / Math.sqrt(nx * nx + ny * ny + nzz * nzz);
        this.put(x, y, h, m, nx * k, ny * k, nzz * k, id);
      }
    }
  }

  // Rotated half-ellipsoid: semi-axes a (along ang) and b, dome height hs.
  // Function shaders get local coords (lx, ly) in -1..1.
  ellipsoid(cx, cy, a, b, ang, z0, hs, shader, id) {
    const W = this.W, H = this.H;
    if (a < 0.6) a = 0.6;
    if (b < 0.6) b = 0.6;
    const R = Math.max(a, b);
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
    if (x0 > x1 || y0 > y1) return;
    const ca = Math.cos(ang), sa = Math.sin(ang), ia = 1 / a, ib = 1 / b;
    const fn = typeof shader === 'function';
    const ihs = 1 / (hs > 0.05 ? hs : 0.05);
    for (let y = y0; y <= y1; y++) {
      const oy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const ox = x + 0.5 - cx;
        const lx = (ox * ca + oy * sa) * ia, ly = (-ox * sa + oy * ca) * ib;
        const d2 = lx * lx + ly * ly;
        if (d2 >= 1) continue;
        const nz = Math.sqrt(1 - d2);
        let m = shader;
        if (fn) {
          m = shader(lx, ly, x, y);
          if (!m) continue;
        }
        const gx = lx * ia, gy = ly * ib;
        const nx = gx * ca - gy * sa, ny = gx * sa + gy * ca, nzz = nz * ihs;
        const k = 1 / Math.sqrt(nx * nx + ny * ny + nzz * nzz);
        this.put(x, y, z0 + nz * hs, m, nx * k, ny * k, nzz * k, id);
      }
    }
  }

  dot(x, y, h, m, id) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.W || yi >= this.H) return;
    this.put(xi, yi, h, m, 0, 0, 1, id);
  }

  // Resolve the frame into `out`: outlines where a shape meets anything lower,
  // cast shadows, animated caustics on the floor, and an optional light tint.
  // Emissive ids resist the tint: level 1 half as much, level 2 not at all.
  compose(out, s) {
    const { W, H, id, col, z, zBase, sh } = this;
    const { bg, bgLight, caustic, outline, emissive, tint, fade } = s;
    const doCaustics = s.caustics, doShadows = s.shadows, doOutlines = s.outlines;
    const mr = tint ? Math.round(tint[0] * 256) : 256, mg = tint ? Math.round(tint[1] * 256) : 256, mb = tint ? Math.round(tint[2] * 256) : 256;
    const TM = CAUSTIC_SIZE - 1, t = s.t;
    const sr = (mr + 256) >> 1, sg = (mg + 256) >> 1, sb = (mb + 256) >> 1;
    const o1x = Math.floor(t * 3.1), o1y = Math.floor(t * 1.7);
    const o2x = Math.floor(-t * 2.3), o2y = Math.floor(t * 2.7);
    for (let y = 0, p = 0; y < H; y++) {
      for (let x = 0; x < W; x++, p++) {
        const i = id[p];
        let c, n;
        if (i === 0) {
          const zb = zBase[p];
          let best = 0, bz = zb + 0.5;
          if (doOutlines) {
            if (x > 0 && id[n = p - 1] && z[n] > bz) { best = id[n]; bz = z[n]; }
            if (x < W - 1 && id[n = p + 1] && z[n] > bz) { best = id[n]; bz = z[n]; }
            if (y > 0 && id[n = p - W] && z[n] > bz) { best = id[n]; bz = z[n]; }
            if (y < H - 1 && id[n = p + W] && z[n] > bz) { best = id[n]; bz = z[n]; }
          }
          if (best && !fade[best]) {
            c = outline[best];
          } else {
            c = doCaustics && caustic[((x + o1x) & TM) | (((y + o1y) & TM) << 7)] +
                caustic[((y + o2y) & TM) | (((x + o2x) & TM) << 7)] < 0.09 ? bgLight[p] : bg[p];
            if (doShadows && sh[p] > zb + 1.5) c = shadeColor(c);
          }
        } else {
          c = col[p];
          const zp = z[p] + 2.5;
          if (doOutlines &&
              ((x > 0 && id[n = p - 1] && id[n] !== i && z[n] > zp && !fade[id[n]]) ||
               (x < W - 1 && id[n = p + 1] && id[n] !== i && z[n] > zp && !fade[id[n]]) ||
               (y > 0 && id[n = p - W] && id[n] !== i && z[n] > zp && !fade[id[n]]) ||
               (y < H - 1 && id[n = p + W] && id[n] !== i && z[n] > zp && !fade[id[n]]))) {
            c = outline[id[n]];
          } else if (doShadows && sh[p] > z[p] + 4) {
            c = shadeColor(c);
          }
          const e = emissive[i];
          if (e) {
            if (tint && e === 1) c = (0xff000000 | ((((c >>> 16) & 255) * sb >> 8) << 16) | ((((c >>> 8) & 255) * sg >> 8) << 8) | ((c & 255) * sr >> 8)) >>> 0;
            out[p] = c;
            continue;
          }
        }
        if (tint) {
          c = (0xff000000 | ((((c >>> 16) & 255) * mb >> 8) << 16) | ((((c >>> 8) & 255) * mg >> 8) << 8) | ((c & 255) * mr >> 8)) >>> 0;
        }
        out[p] = c;
      }
    }
  }
}

// Tileable Worley-noise web (F2 - F1), sampled twice with drifting offsets for caustics.
function makeCausticTile(count = 14) {
  const S = CAUSTIC_SIZE;
  const pts = Array.from({ length: count }, () => [Math.random() * S, Math.random() * S]);
  const T = new Float32Array(S * S);
  let max = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let f1 = 1e9, f2 = 1e9;
      for (const [px, py] of pts) {
        for (let ox = -S; ox <= S; ox += S) {
          for (let oy = -S; oy <= S; oy += S) {
            const dx = x - px - ox, dy = y - py - oy, d = dx * dx + dy * dy;
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
          }
        }
      }
      const v = Math.sqrt(f2) - Math.sqrt(f1);
      T[x + y * S] = v;
      if (v > max) max = v;
    }
  }
  for (let i = 0; i < T.length; i++) T[i] /= max;
  return T;
}
