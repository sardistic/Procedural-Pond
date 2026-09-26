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
const SURFACE_Z = 46; // the water surface; fog fades out toward it
const FOAM = hexToInt('#f2fbf8'), FOAM_SOFT = hexToInt('#c4e4e0');

class Raster {
  constructor(W, H) {
    this.W = W; this.H = H;
    const n = W * H;
    this.col = new Uint32Array(n);
    this.z = new Float32Array(n);
    this.zBase = new Float32Array(n); // static scenery heights (rocks, pebbles), floor = 0
    this.id = new Uint16Array(n);
    this.sh = new Uint8Array(n);      // tallest caster whose shadow lands here
    this.alpha = 1;                   // < 1 draws an ordered-dither fraction of pixels (fades)
    this.castShadows = true;
    this.clip = [0, 0, W - 1, H - 1]; // only this rectangle is rasterized (the visible part)
    this.k = 1; this.kz = 1; this.kx = 0; this.ky = 0; // draw scaled by k about (kx, ky): see setScale
  }

  // Everything drawn until the next setScale() is scaled about (x, y); heights by kz.
  setScale(x = 0, y = 0, k = 1, kz = k) { this.kx = x; this.ky = y; this.k = k; this.kz = kz; }

  setClip(x0, y0, x1, y1) {
    this.clip = [Math.max(0, x0 | 0), Math.max(0, y0 | 0), Math.min(this.W - 1, x1 | 0), Math.min(this.H - 1, y1 | 0)];
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
    this.col[p] = m[l < 0.3 ? 0 : l < 0.55 ? 1 : l < 0.88 ? 2 : 3];
    this.z[p] = h;
    this.id[p] = id;
  }

  // Tapered capsule from a to b. Radii ar/br, base heights az/bz, hs = height
  // relative to radius (1 = round, <1 = flat). shader is a material or
  // (u along 0..1, v across -1..1, x, y) => material|null.
  tube(ax, ay, ar, az, bx, by, br, bz, hs, shader, id, u0 = 0, u1 = 1) {
    if (this.k !== 1) {
      const k = this.k, sx = this.kx, sy = this.ky;
      ax = sx + (ax - sx) * k; ay = sy + (ay - sy) * k; bx = sx + (bx - sx) * k; by = sy + (by - sy) * k;
      ar *= k; br *= k; az *= this.kz; bz *= this.kz;
    }
    const [cx0, cy0, cx1, cy1] = this.clip;
    if (ar < 0.72) ar = 0.72;
    if (br < 0.72) br = 0.72;
    const x0 = Math.max(cx0, Math.floor(Math.min(ax - ar, bx - br)));
    const x1 = Math.min(cx1, Math.ceil(Math.max(ax + ar, bx + br)));
    const y0 = Math.max(cy0, Math.floor(Math.min(ay - ar, by - br)));
    const y1 = Math.min(cy1, Math.ceil(Math.max(ay + ar, by + br)));
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
    if (this.k !== 1) {
      const k = this.k;
      cx = this.kx + (cx - this.kx) * k; cy = this.ky + (cy - this.ky) * k; a *= k; b *= k; z0 *= this.kz; hs *= k;
    }
    const [cx0, cy0, cx1, cy1] = this.clip;
    if (a < 0.6) a = 0.6;
    if (b < 0.6) b = 0.6;
    const R = Math.max(a, b);
    const x0 = Math.max(cx0, Math.floor(cx - R)), x1 = Math.min(cx1, Math.ceil(cx + R));
    const y0 = Math.max(cy0, Math.floor(cy - R)), y1 = Math.min(cy1, Math.ceil(cy + R));
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
    if (this.k !== 1) { x = this.kx + (x - this.kx) * this.k; y = this.ky + (y - this.ky) * this.k; h *= this.kz; }
    const xi = Math.floor(x), yi = Math.floor(y), [cx0, cy0, cx1, cy1] = this.clip;
    if (xi < cx0 || yi < cy0 || xi > cx1 || yi > cy1) return;
    this.put(xi, yi, h, m, 0, 0, 1, id);
  }

  // Resolve a rectangle of the frame into `out`:
  // - outlines where a shape meets anything lower (two pixels wide for rare animals)
  // - cast shadows and animated caustics on the floor
  // - refraction: the floor shimmers under the surface
  // - depth fog: the deeper a pixel, the more it takes on the water colour
  // - the beach: dry sand above the tide line, a foam line at the water's edge,
  //   and surf that rolls in toward it; shallow water is clearer
  // - an optional light tint (emissive ids resist it: level 1 half, level 2 fully)
  compose(out, s, rect = [0, 0, this.W - 1, this.H - 1]) {
    const { W, H, id, col, z, zBase, sh } = this;
    const { bg, bgLight, caustic, outline, emissive, tint, fade, thick, wob, fog } = s;
    const doCaustics = s.caustics, doShadows = s.shadows, doOutlines = s.outlines, anyThick = s.anyThick && thick;
    const mr = tint ? Math.round(tint[0] * 256) : 256, mg = tint ? Math.round(tint[1] * 256) : 256, mb = tint ? Math.round(tint[2] * 256) : 256;
    const sr = (mr + 256) >> 1, sg = (mg + 256) >> 1, sb = (mb + 256) >> 1;
    const TM = CAUSTIC_SIZE - 1, t = s.t, causticT = s.causticT || 0.09;
    const o1x = Math.floor(t * 3.1), o1y = Math.floor(t * 1.7);
    const o2x = Math.floor(-t * 2.3), o2y = Math.floor(t * 2.7);
    // Fog strength by height, in 64 steps from the floor up to the surface.
    let fogA = null, fr = 0, fgc = 0, fb = 0;
    if (fog && fog.amount > 0) {
      fogA = new Int32Array(65);
      for (let k = 0; k <= 64; k++) fogA[k] = Math.round(256 * fog.amount * Math.max(0, 1 - k / 64));
      fr = fog.color & 255; fgc = (fog.color >> 8) & 255; fb = (fog.color >>> 16) & 255;
    }
    const fogK = 64 / SURFACE_Z;
    const wx = wob ? wob.x : null, wy = wob ? wob.y : null;
    const shore = s.shore || null, bgDry = s.bgDry, tideL = (s.tide ?? 1) * 255;
    const surf = s.surf || 0, wave = s.wave || 0, surfReach = 30 + 70 * surf, foamW = 0.05 + 0.07 * surf;
    // The depths: deep water swallows the light (up to ~90%), except things that make their own.
    const depthMap = s.depth || null, dc = s.deepColor || 0xff0e0402;
    const dr = dc & 255, dg = (dc >> 8) & 255, db = (dc >>> 16) & 255;
    const [rx0, ry0, rx1, ry1] = rect;
    for (let y = ry0; y <= ry1; y++) {
      for (let x = rx0, p = rx0 + y * W; x <= rx1; x++, p++) {
        const i = id[p];
        let c, n, depth, fogScale = 1;
        if (shore) {
          const sp = shore[p];
          if (sp > tideL) fogScale = 0; else if (sp) fogScale = Math.min(1, (tideL - sp) / 60);
        }
        if (i === 0) {
          const zb = zBase[p];
          let best = 0, bz = zb + 0.5;
          if (doOutlines) {
            if (x > 0 && id[n = p - 1] && z[n] > bz) { best = id[n]; bz = z[n]; }
            if (x < W - 1 && id[n = p + 1] && z[n] > bz) { best = id[n]; bz = z[n]; }
            if (y > 0 && id[n = p - W] && z[n] > bz) { best = id[n]; bz = z[n]; }
            if (y < H - 1 && id[n = p + W] && z[n] > bz) { best = id[n]; bz = z[n]; }
            if (!best && anyThick) {
              // Second ring, only for rare animals flagged with a thick outline.
              const zt = zb + 0.5;
              if ((x > 1 && thick[id[n = p - 2]] && z[n] > zt) || (x < W - 2 && thick[id[n = p + 2]] && z[n] > zt) ||
                  (y > 1 && thick[id[n = p - 2 * W]] && z[n] > zt) || (y < H - 2 && thick[id[n = p + 2 * W]] && z[n] > zt) ||
                  (x > 0 && y > 0 && thick[id[n = p - W - 1]] && z[n] > zt) || (x < W - 1 && y > 0 && thick[id[n = p - W + 1]] && z[n] > zt) ||
                  (x > 0 && y < H - 1 && thick[id[n = p + W - 1]] && z[n] > zt) || (x < W - 1 && y < H - 1 && thick[id[n = p + W + 1]] && z[n] > zt)) {
                best = id[n]; bz = z[n];
              }
            }
          }
          if (best && !fade[best]) {
            c = outline[best];
            depth = bz;
          } else {
            let q = p;
            if (wx) {
              const qx = x + wx[y], qy = y + wy[x];
              q = (qx < 0 ? 0 : qx >= W ? W - 1 : qx) + (qy < 0 ? 0 : qy >= H ? H - 1 : qy) * W;
            }
            const se = shore ? shore[q] : 0;
            if (se > tideL) {
              // Beach above the waterline: sunlit dry sand, darker where the water just left.
              c = se < tideL + 9 ? shadeColor(bg[q]) : bgDry[q];
              if (doShadows && sh[p] > zb + 1.5) c = shadeColor(c);
              depth = 0;
            } else {
              c = doCaustics && caustic[((x + o1x) & TM) | (((y + o1y) & TM) << 7)] +
                  caustic[((y + o2y) & TM) | (((x + o2x) & TM) << 7)] < causticT ? bgLight[q] : bg[q];
              if (doShadows && sh[p] > zb + 1.5) c = shadeColor(c);
              depth = zBase[q];
              if (se) {
                // Foam at the water's edge, and waves that roll in toward it.
                const d = tideL - se;
                if (d < 2.5) { c = (x + y) & 1 ? FOAM : FOAM_SOFT; fogScale = 0; }
                else if (surf > 0 && d < surfReach) {
                  const w = (d * 0.045 + wave) % 1;
                  if (w < foamW * (1 - d / surfReach) && caustic[(x & TM) | ((y & TM) << 7)] > 0.18) {
                    c = d < surfReach * 0.45 ? FOAM : FOAM_SOFT;
                    fogScale = 0;
                  }
                }
              }
            }
          }
        } else {
          c = col[p];
          depth = z[p];
          const zp = depth + 2.5;
          if (doOutlines &&
              ((x > 0 && id[n = p - 1] && id[n] !== i && z[n] > zp && !fade[id[n]]) ||
               (x < W - 1 && id[n = p + 1] && id[n] !== i && z[n] > zp && !fade[id[n]]) ||
               (y > 0 && id[n = p - W] && id[n] !== i && z[n] > zp && !fade[id[n]]) ||
               (y < H - 1 && id[n = p + W] && id[n] !== i && z[n] > zp && !fade[id[n]]))) {
            c = outline[id[n]];
          } else if (doShadows && sh[p] > z[p] + 4) {
            c = shadeColor(c);
          }
        }
        if (fogA && fogScale > 0) {
          const k = (depth * fogK) | 0, a = (fogA[k < 0 ? 0 : k > 64 ? 64 : k] * fogScale) | 0;
          if (a) {
            const cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255;
            c = (0xff000000 | ((cb + (((fb - cb) * a) >> 8)) << 16) | ((cg + (((fgc - cg) * a) >> 8)) << 8) | (cr + (((fr - cr) * a) >> 8))) >>> 0;
          }
        }
        if (depthMap) {
          const dd = depthMap[p];
          if (dd && !(i && emissive[i] === 2)) {
            const a = (dd * 230) >> 8, cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255;
            c = (0xff000000 | ((cb + (((db - cb) * a) >> 8)) << 16) | ((cg + (((dg - cg) * a) >> 8)) << 8) | (cr + (((dr - cr) * a) >> 8))) >>> 0;
          }
        }
        if (tint) {
          const e = i ? emissive[i] : 0;
          if (e === 2) { out[p] = c; continue; }
          const tr = e ? sr : mr, tg = e ? sg : mg, tb = e ? sb : mb;
          c = (0xff000000 | ((((c >>> 16) & 255) * tb >> 8) << 16) | ((((c >>> 8) & 255) * tg >> 8) << 8) | ((c & 255) * tr >> 8)) >>> 0;
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
