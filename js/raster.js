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
    // Each row's span of drawn pixels (ids): compose skips the outline search on floor far from anything.
    this.rowMin = new Int32Array(H).fill(W); this.rowMax = new Int32Array(H).fill(-1);
    this.alpha = 1;                   // < 1 draws an ordered-dither fraction of pixels (fades)
    this.castShadows = true;
    this.clip = [0, 0, W - 1, H - 1]; // only this rectangle is rasterized (the visible part)
    this.k = 1; this.kz = 1; this.kzo = 0; this.kx = 0; this.ky = 0; this.scaled = false; // draw scaled by k about (kx, ky): see setScale
  }

  // Everything drawn until the next setScale() is scaled about (x, y); heights by kz, then lifted by zoff.
  setScale(x = 0, y = 0, k = 1, kz = k, zoff = 0) { this.kx = x; this.ky = y; this.k = k; this.kz = kz; this.kzo = zoff; this.scaled = k !== 1 || kz !== 1 || zoff !== 0; }

  setClip(x0, y0, x1, y1) {
    this.clip = [Math.max(0, x0 | 0), Math.max(0, y0 | 0), Math.min(this.W - 1, x1 | 0), Math.min(this.H - 1, y1 | 0)];
  }

  // Clear the frame, only as far as the clip (compose only reads inside it; a big pond needn't wipe it all).
  begin() {
    const [x0, y0, x1, y1] = this.clip, W = this.W;
    if (x0 === 0 && y0 === 0 && x1 === W - 1 && y1 === this.H - 1) { this.z.set(this.zBase); this.id.fill(0); this.sh.fill(0); this.rowMin.fill(W); this.rowMax.fill(-1); return; }
    this.rowMin.fill(W, y0, y1 + 1); this.rowMax.fill(-1, y0, y1 + 1);
    for (let y = y0; y <= y1; y++) {
      const a = x0 + y * W, b = x1 + 1 + y * W;
      this.z.set(this.zBase.subarray(a, b), a); this.id.fill(0, a, b); this.sh.fill(0, a, b);
    }
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
    if (x < this.rowMin[y]) this.rowMin[y] = x;
    if (x > this.rowMax[y]) this.rowMax[y] = x;
  }

  // Tapered capsule from a to b. Radii ar/br, base heights az/bz, hs = height
  // relative to radius (1 = round, <1 = flat). shader is a material or
  // (u along 0..1, v across -1..1, x, y) => material|null.
  tube(ax, ay, ar, az, bx, by, br, bz, hs, shader, id, u0 = 0, u1 = 1) {
    if (this.scaled) {
      const k = this.k, sx = this.kx, sy = this.ky;
      ax = sx + (ax - sx) * k; ay = sy + (ay - sy) * k; bx = sx + (bx - sx) * k; by = sy + (by - sy) * k;
      ar *= k; br *= k; az = az * this.kz + this.kzo; bz = bz * this.kz + this.kzo;
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

  // A whole spine at once: the same picture as a tube per link (same z and hs along it),
  // but each pixel is worked out once. Every link that covers a pixel is a candidate, and
  // the one standing highest there (the most inside it) wins, just as the z-test would.
  // Rows only look at the links whose extent reaches them.
  strip(xs, ys, ws, from, to, z, hs, shader, id) {
    if (this.scaled || to - from < 2) { for (let i = from; i < to; i++) this.tube(xs[i], ys[i], ws[i], z, xs[i + 1], ys[i + 1], ws[i + 1], z, hs, shader, id, (i - from) / (to - from), (i + 1 - from) / (to - from)); return; }
    const n = to - from, S = STRIP;
    if (S.ax.length < n) { for (const k of Object.keys(S)) S[k] = new Float64Array(n * 2); STRIP_ACT = new Int32Array(n * 2); }
    const [cx0, cy0, cx1, cy1] = this.clip;
    let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const i = from + k, ax = xs[i], ay = ys[i], bx = xs[i + 1], by = ys[i + 1];
      const ar = ws[i] < 0.72 ? 0.72 : ws[i], br = ws[i + 1] < 0.72 ? 0.72 : ws[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      S.ax[k] = ax; S.ay[k] = ay; S.dx[k] = dx; S.dy[k] = dy; S.ar[k] = ar; S.br[k] = br;
      S.iL2[k] = L2 > 1e-9 ? 1 / L2 : 0; S.iL[k] = L2 > 1e-9 ? 1 / Math.sqrt(L2) : 0;
      S.x0[k] = Math.floor(Math.min(ax - ar, bx - br)); S.x1[k] = Math.ceil(Math.max(ax + ar, bx + br));
      S.y0[k] = Math.floor(Math.min(ay - ar, by - br)); S.y1[k] = Math.ceil(Math.max(ay + ar, by + br));
      if (S.x0[k] < X0) X0 = S.x0[k]; if (S.x1[k] > X1) X1 = S.x1[k]; if (S.y0[k] < Y0) Y0 = S.y0[k]; if (S.y1[k] > Y1) Y1 = S.y1[k];
    }
    const x0 = Math.max(cx0, X0), x1 = Math.min(cx1, X1), y0 = Math.max(cy0, Y0), y1 = Math.min(cy1, Y1);
    if (x0 > x1 || y0 > y1) return;
    const fn = typeof shader === 'function', ihs = 1 / (hs > 0.05 ? hs : 0.05), act = STRIP_ACT;
    for (let y = y0; y <= y1; y++) {
      let na = 0, rx0 = Infinity, rx1 = -Infinity;
      for (let k = 0; k < n; k++) if (y >= S.y0[k] && y <= S.y1[k]) { act[na++] = k; if (S.x0[k] < rx0) rx0 = S.x0[k]; if (S.x1[k] > rx1) rx1 = S.x1[k]; }
      if (!na) continue;
      const xa = Math.max(x0, rx0), xb = Math.min(x1, rx1);
      for (let x = xa; x <= xb; x++) {
        let best = 0, bk = -1, bt = 0, box = 0, boy = 0, brr = 0;
        for (let j = 0; j < na; j++) {
          const k = act[j];
          if (x < S.x0[k] || x > S.x1[k]) continue;
          const px = x + 0.5 - S.ax[k], py = y + 0.5 - S.ay[k], dx = S.dx[k], dy = S.dy[k];
          let t = (px * dx + py * dy) * S.iL2[k];
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ox = px - dx * t, oy = py - dy * t, r = S.ar[k] + (S.br[k] - S.ar[k]) * t, q = r * r - (ox * ox + oy * oy);
          if (q > best) { best = q; bk = k; bt = t; box = ox; boy = oy; brr = r; }
        }
        if (bk < 0) continue;
        const r = brr, nz = Math.sqrt(best) / r, h = z + nz * r * hs;
        let m = shader;
        if (fn) {
          m = shader((bk + bt) / n, (S.dx[bk] * boy - S.dy[bk] * box) * S.iL[bk] / r, x, y);
          if (!m) continue;
        }
        const nx = box / r, ny = boy / r, nzz = nz * ihs;
        const kk = 1 / Math.sqrt(nx * nx + ny * ny + nzz * nzz);
        this.put(x, y, h, m, nx * kk, ny * kk, nzz * kk, id);
      }
    }
  }

  // Rotated half-ellipsoid: semi-axes a (along ang) and b, dome height hs.
  // Function shaders get local coords (lx, ly) in -1..1.
  ellipsoid(cx, cy, a, b, ang, z0, hs, shader, id) {
    if (this.scaled) {
      const k = this.k;
      cx = this.kx + (cx - this.kx) * k; cy = this.ky + (cy - this.ky) * k; a *= k; b *= k; z0 = z0 * this.kz + this.kzo; hs *= k;
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
    if (this.scaled) { x = this.kx + (x - this.kx) * this.k; y = this.ky + (y - this.ky) * this.k; h = h * this.kz + this.kzo; }
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
    const WAVE_EDGE_LO = 40, WAVE_EDGE_HI = 80; // (shore units either side of the tide that a crest's wet edge can reach)
    const { W, H, id, col, z, zBase, sh } = this;
    const { bg, bgLight, caustic, outline, emissive, tint, fade, thick, wob, fog } = s;
    // The floor where the caustics light it, and the sunlit dry beach: blended from the floor as it's
    // drawn (a pond-sized copy of each cost 8 bytes a pixel), unless a copy is handed in.
    const lc = s.lightTint ?? 0xffd2fff0, lcr = lc & 255, lcg = (lc >> 8) & 255, lcb = (lc >>> 16) & 255;
    const lit = (c) => { const r = c & 255, g = (c >> 8) & 255, b = (c >>> 16) & 255; return 0xff000000 | ((b + (((lcb - b) * 36) >> 8)) << 16) | ((g + (((lcg - g) * 36) >> 8)) << 8) | (r + (((lcr - r) * 36) >> 8)); };
    const dryLit = (c) => { const r = c & 255, g = (c >> 8) & 255, b = (c >>> 16) & 255; return 0xff000000 | ((b + (((0xd2 - b) * 46) >> 8)) << 16) | ((g + (((0xf0 - g) * 46) >> 8)) << 8) | (r + (((0xff - r) * 46) >> 8)); };
    const doCaustics = s.caustics, doShadows = s.shadows, doOutlines = s.outlines, anyThick = s.anyThick && thick;
    // The close-up overlay draws creature outlines at its own 4× or 8× pixel size. Keep other outlines here.
    const fineCreature = typeof FINE !== 'undefined' && FINE.rec ? FINE.creatureId : null;
    const mr = tint ? Math.round(tint[0] * 256) : 256, mg = tint ? Math.round(tint[1] * 256) : 256, mb = tint ? Math.round(tint[2] * 256) : 256;
    const sr = (mr + 256) >> 1, sg = (mg + 256) >> 1, sb = (mb + 256) >> 1;
    const TM = CAUSTIC_SIZE - 1, t = s.t, causticT = s.causticT || 0.09;
    // (Everything on the surface moves slowly: quick flicker reads as noise, not water.)
    const o1x = Math.floor(t * 1.2), o1y = Math.floor(t * 0.65);
    const o2x = Math.floor(-t * 0.9), o2y = Math.floor(t * 1.05);
    // Fog strength by height, in 64 steps from the floor up to the surface.
    let fogA = null, fr = 0, fgc = 0, fb = 0;
    if (fog && fog.amount > 0) {
      fogA = new Int32Array(65);
      for (let k = 0; k <= 64; k++) fogA[k] = Math.round(256 * fog.amount * Math.max(0, 1 - k / 64));
      fr = fog.color & 255; fgc = (fog.color >> 8) & 255; fb = (fog.color >>> 16) & 255;
    }
    const fogK = 64 / SURFACE_Z;
    const wx = wob ? wob.x : null, wy = wob ? wob.y : null;
    const shore = s.shore || null, bgDry = s.bgDry, tideL = (s.tide ?? 1) * 255, RM = s.riverMask || null, riverDeep = s.riverDeep ?? 0.5;
    const rc = s.riverColor ?? (fog ? fog.color : 0), rr = rc & 255, rg = (rc >> 8) & 255, rb = (rc >>> 16) & 255; // (the river's own water: not a bloom's)
    // (The river's channels up the beach: the surf breaks at the sea, not in them.)
    const inland = (x, y) => !!RM && x >= RM.x0 && y >= RM.y0 && x < RM.x0 + RM.w && y < RM.y0 + RM.h && RM.data[(x - RM.x0) + (y - RM.y0) * RM.w] === 1;
    // Fade the surf into either river bank. A full-bright tide line ending at the
    // channel's edge reads as a straight cut across the river.
    const riverBankSurf = (x, y) => {
      if (!RM) return 1;
      for (let d = 1; d <= 8; d++) {
        if (inland(x - d, y) || inland(x + d, y) || inland(x, y - d) || inland(x, y + d)) return Math.min(1, (d - 1) / 7);
      }
      return 1;
    };
    const surf = s.surf || 0, wave = s.wave || 0, surfReach = 30 + 70 * surf, foamW = 0.05 + 0.07 * surf;
    // The depths: deep water swallows the light (up to ~90%), except things that make their own.
    const depthMap = s.depth || null, dc = s.deepColor || 0xff0e0402, dc2 = s.deepColor2 ?? dc, deepK = s.deepK ?? 1;
    const dr0 = dc & 255, dg0 = (dc >> 8) & 255, db0 = (dc >>> 16) & 255, dr1 = dc2 & 255, dg1 = (dc2 >> 8) & 255, db1 = (dc2 >>> 16) & 255;
    // Trenches (black chasms with faint lights along their rims) and the light cast by glowing things.
    const trench = s.trench || null, tg = s.trenchGlow || 0xffffb02a, tgr = tg & 255, tgg = (tg >> 8) & 255, tgb = (tg >>> 16) & 255;
    const LM = s.lights || null, LD = LM ? LM.data : null, lw = LM ? LM.lw : 0, lh = LM ? LM.lh : 0, lvis = s.lightVis || 0;
    // Chop: short, quick waves in the shallows when it blows; spindrift: streaks of foam blown along the deep in a storm.
    const chop = s.chop || 0, spin = s.spindrift || 0, L3 = 10, w3x = (sw0x(s) * 1024) / L3, w3y = (sw0y(s) * 1024) / L3, w3t = t * 4 * 1024 / L3;
    // The eldritch: veins of void in marked skin, crawling slowly, with stars in them.
    const voidL = s.voidSkin || null, vox = Math.floor(t * 0.9), voy = Math.floor(t * 0.6), starT = Math.floor(t * 0.4) * 83492791;
    // Swell: two trains of waves rolling toward the beach, bigger over the deep, whitecaps on the biggest.
    // In a big swell the waves run longer and faster; calm water shows the sky instead.
    const swell = s.swell || 0, sw = s.swellDir || [0, 1], L1 = 40 + 50 * swell, L2 = 26 + 20 * swell;
    const w1x = sw[0] * 1024 / L1, w1y = sw[1] * 1024 / L1, w1t = t * (3 + 3.5 * swell) * 1024 / L1;
    const c2 = Math.cos(0.7), s2 = Math.sin(0.7), w2x = (sw[0] * c2 - sw[1] * s2) * 1024 / L2, w2y = (sw[0] * s2 + sw[1] * c2) * 1024 / L2, w2t = t * (2 + 2 * swell) * 1024 / L2;
    const clouds = s.clouds || null, sky = s.sky || 0xffe0d8c8, calm = clamp(1 - swell * 1.5, 0, 1) * (s.skyK ?? 1);
    const skr = sky & 255, skg = (sky >> 8) & 255, skb = (sky >>> 16) & 255, cdx = t * 1.1, cdy = t * 0.35, mdx = t * 0.2;
    // (Wave marks: always drawn level, the way top-down water is; they drift with the swell.)
    const wd = t * (1.2 + 2 * swell), wdu = -sw[0] * wd, wdv = -sw[1] * wd;
    const surfaceVis = s.surfaceVis ?? 1;
    const meshWaves = s.waveMode === 'mesh';
    const hdWaves = surfaceVis > 0 && (s.waveMode === 'hd' || meshWaves) && typeof waveField === 'function';
    const physical = hdWaves ? waveField({ ...s, t: s.waveT ?? s.t }) : null, surface = hdWaves ? new Float32Array(4) : null;
    const [rx0, ry0, rx1, ry1] = rect, rowMin = this.rowMin, rowMax = this.rowMax, ring = anyThick ? 2 : 1;
    for (let y = ry0; y <= ry1; y++) {
      // (The outline search reaches one pixel, or two for a thick outline: only near this row's or a neighbour's drawn span.)
      let oLo = W, oHi = -1;
      for (let yy = Math.max(0, y - ring); yy <= Math.min(H - 1, y + ring); yy++) { if (rowMin[yy] < oLo) oLo = rowMin[yy]; if (rowMax[yy] > oHi) oHi = rowMax[yy]; }
      oLo -= ring; oHi += ring;
      for (let x = rx0, p = rx0 + y * W; x <= rx1; x++, p++) {
        const i = id[p];
        // With a mesh, only the moving shoreline needs a CPU surface sample, and only near the tide line:
        // the sample only shifts the wet edge (by well under WAVE_EDGE_LO/HI), so ground far above or
        // below it is dry or wet either way. Open water is evaluated once by the GPU (or software fallback).
        const edge = hdWaves && shore && shore[p] && shore[p] > tideL - WAVE_EDGE_LO && shore[p] < tideL + WAVE_EDGE_HI;
        if (hdWaves && (!meshWaves || edge)) waveAt(physical, x, y, p, surface);
        const localTide = edge ? tideL + surface[0] * 2.5 * surfaceVis : tideL;
        let c, n, depth, fogScale = 1, waveS = 0, waveC = 0, refl = 0, dry = false, stroke = 0;
        if (shore) {
          const sp = shore[p];
          if (sp > localTide) { fogScale = 0; dry = true; } else if (sp) fogScale = Math.min(1, (localTide - sp) / 60);
        }
        if (i === 0) {
          const zb = zBase[p];
          let best = 0, bz = zb + 0.5;
          if (doOutlines && x >= oLo && x <= oHi) {
            if (x > 0 && id[n = p - 1] && (!fineCreature || !fineCreature[id[n]]) && z[n] > bz) { best = id[n]; bz = z[n]; }
            if (x < W - 1 && id[n = p + 1] && (!fineCreature || !fineCreature[id[n]]) && z[n] > bz) { best = id[n]; bz = z[n]; }
            if (y > 0 && id[n = p - W] && (!fineCreature || !fineCreature[id[n]]) && z[n] > bz) { best = id[n]; bz = z[n]; }
            if (y < H - 1 && id[n = p + W] && (!fineCreature || !fineCreature[id[n]]) && z[n] > bz) { best = id[n]; bz = z[n]; }
            if (!best && anyThick) {
              // Second ring, only for rare animals flagged with a thick outline.
              const zt = zb + 0.5;
              if ((x > 1 && thick[id[n = p - 2]] && (!fineCreature || !fineCreature[id[n]]) && z[n] > zt) ||
                  (x < W - 2 && thick[id[n = p + 2]] && (!fineCreature || !fineCreature[id[n]]) && z[n] > zt) ||
                  (y > 1 && thick[id[n = p - 2 * W]] && (!fineCreature || !fineCreature[id[n]]) && z[n] > zt) ||
                  (y < H - 2 && thick[id[n = p + 2 * W]] && (!fineCreature || !fineCreature[id[n]]) && z[n] > zt) ||
                  (x > 0 && y > 0 && thick[id[n = p - W - 1]] && (!fineCreature || !fineCreature[id[n]]) && z[n] > zt) ||
                  (x < W - 1 && y > 0 && thick[id[n = p - W + 1]] && (!fineCreature || !fineCreature[id[n]]) && z[n] > zt) ||
                  (x > 0 && y < H - 1 && thick[id[n = p + W - 1]] && (!fineCreature || !fineCreature[id[n]]) && z[n] > zt) ||
                  (x < W - 1 && y < H - 1 && thick[id[n = p + W + 1]] && (!fineCreature || !fineCreature[id[n]]) && z[n] > zt)) {
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
              const qx = x + wx[y] + (hdWaves && !meshWaves ? Math.round(surface[1] * 2.5 * surfaceVis) : 0);
              const qy = y + wy[x] + (hdWaves && !meshWaves ? Math.round(surface[2] * 2.5 * surfaceVis) : 0);
              q = (qx < 0 ? 0 : qx >= W ? W - 1 : qx) + (qy < 0 ? 0 : qy >= H ? H - 1 : qy) * W;
            }
            const se = shore ? shore[q] : 0;
            if (hdWaves ? dry : se > localTide) {
              // Beach above the waterline: sunlit dry sand, darker where the water just left.
              // (Damp a little way above the water, in dithered steps: the flats and the lower beach the tide has just left.)
              c = se < localTide + 9 + 22 * (BAYER4[(x & 3) | ((y & 3) << 2)] + 0.5) ? shadeColor(bg[q]) : bgDry ? bgDry[q] : dryLit(bg[q]);
              if (doShadows && sh[p] > zb + 1.5) c = shadeColor(c);
              depth = 0;
            } else {
              c = doCaustics && caustic[((x + o1x) & TM) | (((y + o1y) & TM) << 7)] +
                  caustic[((y + o2y) & TM) | (((x + o2x) & TM) << 7)] < causticT ? (bgLight ? bgLight[q] : lit(bg[q])) : bg[q];
              if (doShadows && sh[p] > zb + 1.5) c = shadeColor(c);
              depth = zBase[q];
              if (hdWaves && !meshWaves) {
                // The same height field moves the floor refraction, the wet edge,
                // and the light on a crest. Foam forms where a steep crest shoals.
                waveS = clamp(-(surface[1] * sw[0] + surface[2] * sw[1]) * 5, -1.8, 1.8);
                const crest = surface[3];
                if (crest > 0.12 && crest > BAYER4[(x & 3) | ((y & 3) << 2)] * 0.55) waveC = crest > 0.58 ? 9 : 8;
              } else if (!meshWaves && swell > 0) {
                const dd = depthMap ? depthMap[p] : 0;
                // Each wave lit on the face toward the light and shadowed behind, broken up along
                // its length by a slow patchy noise, and bigger over the deep.
                const patch = 0.45 + caustic[(((x >> 2) + o1x) & TM) | ((((y >> 2) + o2y) & TM) << 7)] * 0.9;
                const i1 = ((x * w1x + y * w1y - w1t) | 0) & 1023, i2 = ((x * w2x + y * w2y - w2t) | 0) & 1023, amp = swell * (0.55 + dd * 0.004) * patch;
                waveS = (WAVE_TAB[(i1 + 24) & 1023] - WAVE_TAB[(i1 - 24) & 1023] + 0.5 * (WAVE_TAB[(i2 + 24) & 1023] - WAVE_TAB[(i2 - 24) & 1023])) * amp;
                waveC = (WAVE_TAB[i1] + 0.5 * WAVE_TAB[i2]) * amp;
                // Out over the deep the swell shows as wave marks: little arcs on a staggered grid,
                // drifting with the swell, each swelling up, breaking and fading on its own time,
                // more of them and bolder in rough water and over the deep.
                if (dd > 50) {
                  const k = Math.min(1, (dd - 50) / 110) * Math.min(1, amp * 1.2 + 0.3);
                  const U = x + wdu, V = y + wdv, row = Math.floor(V / 11), U2 = U + (row & 1) * 9, col = Math.floor(U2 / 18);
                  const h = Math.imul(Math.imul(row, 0x85ebca6b) ^ Math.imul(col, 0xc2b2ae35), 0x9e3779b1) >>> 0;
                  if ((h & 255) < 70 + 150 * Math.min(1, swell) * k) {
                    const w = 5 + ((h >>> 8) % 5), gu = (h >>> 12) % (18 - w), gv = (h >>> 18) % 7;
                    const lu = Math.floor(U2 - col * 18) - gu, lv = Math.floor(V - row * 11) - gv;
                    if (lu >= 0 && lu < w && lv >= 0 && lv < 3) {
                      const life = Math.sin(t * (0.22 + ((h >>> 24) & 7) * 0.03) + (h >>> 21)); // swelling, breaking, gone (slowly)
                      const edge = lu === 0 || lu === w - 1, mid = lu >= 2 && lu <= w - 3;
                      if (life > -0.25) {
                        if (lv === 0 && !edge && (life > 0.25 || mid)) stroke = k;
                        else if (lv === 1 && edge && life > 0.25) stroke = k * 0.6;
                        else if (lv === 1 && !edge && life > 0.25) stroke = -k;
                      }
                    }
                  }
                }
                // The shallows chop: short steep ripples across the swell (none out over the deep).
                if (chop > 0 && dd < 160) {
                  const i3 = ((x * w3x + y * w3y - w3t) | 0) & 1023, ck = chop * (1 - dd / 160) * (0.6 + 0.8 * caustic[((x + o2x) & TM) | (((y >> 1) & TM) << 7)]);
                  waveS += (WAVE_TAB[(i3 + 40) & 1023] - WAVE_TAB[(i3 - 40) & 1023]) * ck;
                }
                // Out over the deep in a storm, the wind tears streaks of spindrift along the swell.
                if (spin > 0 && dd > 110) {
                  const a = x * sw[1] - y * sw[0], b = (x * sw[0] + y * sw[1]) * 0.12 - t * 3;
                  const v = caustic[((a | 0) & TM) | (((b | 0) & TM) << 7)];
                  if (v < 0.035 * spin * (dd - 110) / 145 && ((x ^ y ^ starT) & 1)) waveC = 8;
                }
                // Whitecaps: foam breaking in thin, ragged runs right along the tops of the biggest crests.
                if (swell > 0.45 && amp > 0.8 && patch > 0.95) {
                  const top = Math.max(WAVE_TAB[i1] - 1.18, (WAVE_TAB[i2] - 1.24) * 0.8) * 6 * Math.min(1, (amp - 0.8) * 1.5) * Math.min(1, (patch - 0.95) * 3);
                  if (top > 0) {
                    const h = Math.imul(Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ starT, 0x9e3779b1) >>> 24;
                    if (h < top * 300) waveC = h < top * 140 ? 9 : 8;
                  }
                }
              }
              // Calm water holds the sky the way rippled water does: in little facets. Short
              // ripple dashes drift and twinkle across it, crowding and brightening under the
              // bright parts of the clouds, so the sky shows as a field of glints (and the dark
              // deep reads as a surface, not a haze).
              if (clouds && calm > 0.02) {
                const cv = clouds[(((x * 0.3 + cdx) | 0) & 127) | ((((y * 0.45 + cdy) | 0) & 127) << 7)], dens = (cv - 0.38) * 1.6 * (1 - 0.65 * (depthMap ? depthMap[p] : 0) / 255);
                if (dens > 0) {
                  // Each 8 px stretch of each 4 px band may hold one dash, on a line of its own within the band.
                  const row = y >> 2, sx = x + ((Math.imul(row, 0x9e3779b1) >>> 27) << 1) + ((t * 0.45) | 0), seg = sx >> 3;
                  const h = Math.imul(Math.imul(row, 0x85ebca6b) ^ Math.imul(seg, 0xc2b2ae35) ^ (((t * 0.08 + (seg & 7) / 8) | 0) * 0x27d4eb2d), 0x9e3779b1) >>> 0;
                  const len = 2 + ((h >>> 8) & 3), at = sx & 7;
                  if ((h >>> 24) < dens * dens * 210 && (y & 3) === ((h >>> 4) & 3) && at < len) {
                    const mid = at > 0 && at < len - 1; // lit in the middle, dimmer at the ends
                    refl = calm * (mid ? 0.2 + 0.28 * cv : 0.1 + 0.12 * cv) * ((h & 1) ? 1 : 0.7);
                  }
                }
              }
              if (!hdWaves && se && !(RM && inland(x, y))) {
                // Foam at the water's edge, and waves that roll in toward it.
                const d = tideL - se;
                if (d < 2.5) {
                  const bank = riverBankSurf(x, y);
                  if (bank > 0) { c = bank >= 1 ? ((x + y) & 1 ? FOAM : FOAM_SOFT) : mixColor(c, FOAM_SOFT, bank); fogScale = 0; }
                }
                else if (surf > 0 && d < surfReach) {
                  const w = (d * 0.045 + wave) % 1;
                  const chance = foamW * (1 - d / surfReach);
                  if (w < chance && caustic[(x & TM) | ((y & TM) << 7)] > 0.18) {
                    const bank = riverBankSurf(x, y);
                    if (bank > 0 && w < chance * bank) {
                      c = d < surfReach * 0.45 && bank >= 1 ? FOAM : mixColor(c, FOAM_SOFT, bank);
                      fogScale = 0;
                    }
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
              ((x > 0 && id[n = p - 1] && id[n] !== i && (!fineCreature || !fineCreature[id[n]]) && z[n] > zp && !fade[id[n]]) ||
               (x < W - 1 && id[n = p + 1] && id[n] !== i && (!fineCreature || !fineCreature[id[n]]) && z[n] > zp && !fade[id[n]]) ||
               (y > 0 && id[n = p - W] && id[n] !== i && (!fineCreature || !fineCreature[id[n]]) && z[n] > zp && !fade[id[n]]) ||
               (y < H - 1 && id[n = p + W] && id[n] !== i && (!fineCreature || !fineCreature[id[n]]) && z[n] > zp && !fade[id[n]]))) {
            c = outline[id[n]];
          } else {
            if (doShadows && sh[p] > z[p] + 4) c = shadeColor(c);
            const lv = voidL ? voidL[i] : 0;
            if (lv) {
              const v = caustic[((x + vox) & TM) | (((y + voy) & TM) << 7)], th = VOID_T[lv];
              if (v < th) c = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ starT) & 31) === 0 ? VOID_STAR : VOID_BLACK;
              else if (v < th + 0.03) c = VOID_RIM;
              else if (lv > 2) { const cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255, a = lv * 14; c = (0xff000000 | ((cb + (((90 - cb) * a) >> 8)) << 16) | ((cg + (((30 - cg) * a) >> 8)) << 8) | (cr + (((70 - cr) * a) >> 8))) >>> 0; }
            }
          }
        }
        if (fogA && fogScale > 0) {
          const k = (depth * fogK) | 0, a = (fogA[k < 0 ? 0 : k > 64 ? 64 : k] * fogScale) | 0;
          if (a) {
            const cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255;
            c = (0xff000000 | ((cb + (((fb - cb) * a) >> 8)) << 16) | ((cg + (((fgc - cg) * a) >> 8)) << 8) | (cr + (((fr - cr) * a) >> 8))) >>> 0;
          }
        }
        // A river's channel runs deep: its water as the land up the beach paints it (hinterland.js), full water over
        // the bed and darkening toward the middle by how deep the river has cut, so it carries on across the join.
        if (RM && RM.deep && !dry) {
          const rx = x - RM.x0, ry = y - RM.y0;
          if (rx >= 0 && ry >= 0 && rx < RM.w && ry < RM.h) {
            const v = RM.deep[rx + ry * RM.w];
            if (v) {
              const e = v / 255, kk = e * e * (3 - 2 * e), fadeIn = Math.min(1, e * 6); // (e: toward the middle, and fading out at the mouth)
              let wa = (0.66 + 0.3 * kk) * fadeIn, ba = (0.08 + (0.14 + 0.3 * riverDeep) * kk) * fadeIn;
              if (i) { wa *= 0.4; ba *= 0.4; }
              const cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255, keep = 1 - ba;
              c = (0xff000000 | (((cb + (rb - cb) * wa) * keep) << 16) | (((cg + (rg - cg) * wa) * keep) << 8) | ((cr + (rr - cr) * wa) * keep)) >>> 0;
            }
          }
        }
        if (depthMap && !dry) {
          const dd = depthMap[p];
          if (dd && !(i && emissive[i] === 2)) {
            let a = (dd * 230 * deepK) >> 8;
            const m = (dd * dd) >> 8, dr = dr0 + (((dr1 - dr0) * m) >> 8), dg = dg0 + (((dg1 - dg0) * m) >> 8), db = db0 + (((db1 - db0) * m) >> 8);
            if (i) a = (a * (256 - Math.min(200, (z[p] * 256 / SURFACE_Z * 0.78) | 0))) >> 8; // nearer the surface, less of the dark
            // Over the floor, the dark comes in dithered steps with a slow murk moving through it
            // (lighter and darker reaches), so the deep has a texture of its own, not a smooth smear.
            if (!i) {
              const murk = clouds ? clouds[(((x * 0.5 + mdx) | 0) & 127) | ((((y * 0.5 + 64) | 0) & 127) << 7)] - 0.5 : 0;
              a += murk * 34 * (dd / 255);
              a = Math.max(0, Math.min(240, ((a + 6 + BAYER4[(x & 3) | ((y & 3) << 2)] * 12) / 12 | 0) * 12));
            }
            const cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255;
            c = (0xff000000 | ((cb + (((db - cb) * a) >> 8)) << 16) | ((cg + (((dg - cg) * a) >> 8)) << 8) | (cr + (((dr - cr) * a) >> 8))) >>> 0;
          }
          // A trench: the floor falls away into black, and things glint along its edges.
          if (trench && !i && trench[p]) {
            const tv = trench[p], v = (tv & 127) / 127, lit = tv >= 128, bq = BAYER4[(x & 3) | ((y & 3) << 2)];
            let f = 256;
            if (v > 0.62) c = v < 0.72 && ((x ^ y) & 1) ? 0xff06070c : 0xff010103; // the floor of it, far down
            else if (v > 0.3) f = v + bq * 0.1 > 0.47 ? 60 : 120; // the walls, stepping down into the dark
            else if (lit) {
              // The lip on the side the light falls on catches it; now and then something glints there.
              if (v > 0.12 && ((Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ (starT >> 3)) >>> 27) === 0) c = (0xff000000 | (tgb << 16) | (tgg << 8) | tgr) >>> 0;
              else { const cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255, a = v > 0.15 ? 70 : 40; c = (0xff000000 | ((cb + (((190 - cb) * a) >> 8)) << 16) | ((cg + (((200 - cg) * a) >> 8)) << 8) | (cr + (((190 - cr) * a) >> 8))) >>> 0; }
            } else f = 185; // the far lip, in shadow
            if (f < 256) c = (0xff000000 | (((((c >>> 16) & 255) * f) >> 8) << 16) | (((((c >> 8) & 255) * f) >> 8) << 8) | (((c & 255) * f) >> 8)) >>> 0;
          }
        }
        // The surface over it all (after the deep has darkened the floor below): the sky in calm
        // water, the lit and shadowed faces of waves, foam on the biggest.
        stroke *= surfaceVis; waveS *= surfaceVis; refl *= surfaceVis;
        if (surfaceVis < 1 && waveC >= 8 && BAYER4[(x & 3) | ((y & 3) << 2)] > surfaceVis) waveC = 0;
        if (stroke && waveC < 8) {
          const cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255;
          if (stroke > 0) { const a = (stroke * 150) | 0; c = (0xff000000 | ((cb + (((0xf0 - cb) * a) >> 8)) << 16) | ((cg + (((0xe8 - cg) * a) >> 8)) << 8) | (cr + (((0xdc - cr) * a) >> 8))) >>> 0; }
          else { const f = 256 - ((-stroke * 70) | 0); c = (0xff000000 | (((cb * f) >> 8) << 16) | (((cg * f) >> 8) << 8) | ((cr * f) >> 8)) >>> 0; }
        } else if (waveC === 9) { c = (Math.imul(Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ starT, 0x9e3779b1) >>> 30) ? 0xfff0f4f6 : 0xffd6e4ea; }
        else if (waveC === 8) { const cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255; c = (0xff000000 | ((cb + ((0xf2 - cb) >> 1)) << 16) | ((cg + ((0xf0 - cg) >> 1)) << 8) | (cr + ((0xe8 - cr) >> 1))) >>> 0; }
        else if (waveS || refl) {
          let cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255;
          if (refl > 0) { const a = (refl * 256) | 0; cr += ((skr - cr) * a) >> 8; cg += ((skg - cg) * a) >> 8; cb += ((skb - cb) * a) >> 8; }
          // (Wave faces in dithered steps, like everything else, not smooth gradients.)
          const bq = BAYER4[(x & 3) | ((y & 3) << 2)];
          if (waveS > 0.14) {
            const a = Math.min(4, ((waveS - 0.14) * 4.2 + 0.5 + bq) | 0) * 30;
            if (a) { cr += ((0xe8 - cr) * a) >> 8; cg += ((0xf0 - cg) * a) >> 8; cb += ((0xf4 - cb) * a) >> 8; }
          } else if (waveS < -0.14) {
            const f = 256 - Math.min(4, ((-waveS - 0.14) * 4 + 0.5 + bq) | 0) * 26;
            cr = (cr * f) >> 8; cg = (cg * f) >> 8; cb = (cb * f) >> 8;
          }
          c = (0xff000000 | (cb << 16) | (cg << 8) | cr) >>> 0;
        }
        if (tint) {
          const e = i ? emissive[i] : 0;
          if (e === 2) { out[p] = c; continue; }
          const tr = e ? sr : mr, tgn = e ? sg : mg, tb = e ? sb : mb;
          c = (0xff000000 | ((((c >>> 16) & 255) * tb >> 8) << 16) | ((((c >>> 8) & 255) * tgn >> 8) << 8) | ((c & 255) * tr >> 8)) >>> 0;
        }
        // Light cast by glowing things: pools, in dithered steps, seen at night and in the deep.
        if (LD) {
          // (One cell per pixel, the cell picked with an ordered dither near its edges: soft pools for a single read.)
          const bq = BAYER4[(x & 3) | ((y & 3) << 2)], gx = ((x + 2 + bq * 3.6) >> 2), gy = ((y + 2 - bq * 3.6) >> 2);
          const li = ((gx < lw ? gx : lw - 1) + (gy < lh ? gy : lh - 1) * lw) * 3, lr = LD[li], lg = LD[li + 1], lb = LD[li + 2];
          if (lr + lg + lb > 0.004) {
            const dd = depthMap ? depthMap[p] : 0, vis = Math.max(lvis, dd / 255 * 0.45, 0.06);
            const m0 = lr > lg ? (lr > lb ? lr : lb) : (lg > lb ? lg : lb), mt = m0 / (1 + m0); // overlapping lights saturate softly
            const q = Math.min(4, (mt * vis * 5 + 0.5 + bq) | 0) / 4;
            if (q > 0) {
              const s = q / Math.max(m0, 0.001), cr0 = c & 255, cg0 = (c >> 8) & 255, cb0 = (c >>> 16) & 255;
              // Lit: the floor brightened in the light's colour, plus a little of the colour itself.
              const cr = Math.min(255, cr0 + ((cr0 * lr * s * 1.6 + lr * s * 46) | 0)), cg = Math.min(255, cg0 + ((cg0 * lg * s * 1.6 + lg * s * 46) | 0)), cb = Math.min(255, cb0 + ((cb0 * lb * s * 1.6 + lb * s * 46) | 0));
              c = (0xff000000 | (cb << 16) | (cg << 8) | cr) >>> 0;
            }
          }
        }
        out[p] = c;
      }
    }
  }
}

// The chop's direction: across the swell, a little skewed.
const sw0x = (s) => { const sw = s.swellDir || [0, 1]; return sw[0] * 0.6 - sw[1] * 0.8; };
const sw0y = (s) => { const sw = s.swellDir || [0, 1]; return sw[1] * 0.6 + sw[0] * 0.8; };

// Scratch space for Raster.strip (the links of one spine, and which reach the current row).
const STRIP = Object.fromEntries(['ax', 'ay', 'dx', 'dy', 'ar', 'br', 'iL2', 'iL', 'x0', 'x1', 'y0', 'y1'].map((k) => [k, new Float64Array(64)]));
let STRIP_ACT = new Int32Array(64);

// Swell across the surface: one wavelength of a sharp-crested wave (see compose).
const WAVE_TAB = new Float32Array(1024);
for (let i = 0; i < 1024; i++) { const s = 0.5 + 0.5 * Math.sin(i / 1024 * Math.PI * 2); WAVE_TAB[i] = s * s * s * 1.8 - 0.45; }
const WAVE_LIGHT = 0xfff4ece0, VOID_BLACK = 0xff14040a, VOID_RIM = 0xffc84a8a, VOID_STAR = 0xfffff0e8;
const VOID_T = [0, 0.05, 0.08, 0.12, 0.17, 0.22, 0.28, 0.35]; // how much of a marked animal's skin opens onto the void, by level

// Soft tileable cloud noise (128 × 128, 0..1): the sky's reflection on calm water.
function makeCloudTile() {
  const S = 128, T = new Float32Array(S * S), lat = [8, 16, 32].map((n) => ({ n, v: Array.from({ length: n * n }, () => Math.random()) }));
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0, w = 0, amp = 1;
      for (const L of lat) {
        const fx = x / S * L.n, fy = y / S * L.n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
        const g = (i, j) => L.v[((j % L.n) * L.n) + (i % L.n)];
        v += amp * lerp(lerp(g(x0, y0), g(x0 + 1, y0), tx), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), tx), ty); w += amp; amp *= 0.5;
      }
      T[x + y * S] = v / w;
    }
  }
  let lo = 1, hi = 0;
  for (const v of T) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < T.length; i++) T[i] = (T[i] - lo) / (hi - lo);
  return T;
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
