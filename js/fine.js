'use strict';
// Close-up detail. From 6× a finer picture lies over the pond: 2× detail at 6–9×, 4× at 10–14×, and 8× at 15–16×. It is the
// frame as drawn, scaled up by Scale2x (smoother edges, still pixel art), plus what only shows up close, all of it slow:
//  - the floor: sand grains, shell flecks and ripples; pebbles and wind ripples up the beach; rock speckled and
//    cracked, lit along its top edge; a finer net of light drifting over the floor by day;
//  - the water: glints that twinkle now and then, and motes drifting in it (some glowing, at night in the sea);
//  - animals: scales on fish (mottled skin on the rest), rays in their fins, a gill that breathes, a glint in the eye,
//    and every shape lit along its top edge and shaded along its lower one;
//  - plants: veins along leaves and stems, and leaf tips that stir.
// It covers only what's on screen and is rebuilt every
// frame from the raster: what's at each pixel (`id`), its height and its own colour before the light. Scene → Detail
// turns it off, and it steps aside when frames run slow.

const FINE_MIN_K = 6;
const FINE_CREATURE_PARTS = ['eyeId', 'glowId', 'starId', 'lureId', 'tipId', 'irisId', 'inkId', 'eldId', 'crownId'];
const FINE = {
  rec: false, eyes: [], cv: null, g: null, img: null, buf: null, cw: 0, ch: 0, lw: 0, lh: 0, x0: 0, y0: 0, f: 4,
  a2: null, a4: null, id2: null, id4: null, ids: null, creatureId: new Uint8Array(65536),
  own: new Array(65536).fill(null), kind: new Uint8Array(65536), used: [], spines: new Map(), ema: 0, off: 0, ms: 0,
};
const FINE_SHELL = hexToInt('#eef0e6'), FINE_GRIT = hexToInt('#2a2c30'), FINE_GLINT = hexToInt('#fbfdff'), FINE_EYE = hexToInt('#f6f8fc');
const FINE_MOTE = hexToInt('#e4ecea'), FINE_GLOW = hexToInt('#90ffd8');

const fineHash = (x, y) => {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
function fineK(c, f) {
  let r = (c & 255) * f, g = ((c >> 8) & 255) * f, b = ((c >>> 16) & 255) * f;
  if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
  return (0xff000000 | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
}
function fineMix(c, d, a) {
  const r = c & 255, g = (c >> 8) & 255, b = (c >>> 16) & 255;
  return (0xff000000 | ((b + (((d >>> 16) & 255) - b) * a) << 16) | ((g + (((d >> 8) & 255) - g) * a) << 8) | (r + ((d & 255) - r) * a)) >>> 0;
}
// A smooth noise tile at the fine scale, for the ripples' waviness.
const FINE_NOISE = (() => {
  const N = 256, G = 16, L = new Float32Array(G * G), T = new Float32Array(N * N);
  for (let i = 0; i < L.length; i++) L[i] = fineHash(i, 7) / 4294967296;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / (N / G), fy = y / (N / G), ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
    const sx = ax * ax * (3 - 2 * ax), sy = ay * ay * (3 - 2 * ay), a = ix % G, b = (ix + 1) % G, c = iy % G, d = (iy + 1) % G;
    T[x + y * N] = (L[a + c * G] * (1 - sx) + L[b + c * G] * sx) * (1 - sy) + (L[a + d * G] * (1 - sx) + L[b + d * G] * sx) * sy;
  }
  return T;
})();

const fineWanted = () => world.opts.fine !== false && view.k >= FINE_MIN_K && !world.bones && QUALITY.level < 2 && performance.now() > FINE.off;
// (Before the frame is drawn: the eyes are noted as they're drawn.)
function fineBegin(overlay = true) {
  FINE.eyes.length = 0;
  FINE.rec = overlay && fineWanted();
  if (FINE.rec) {
    FINE.creatureId.fill(0);
    for (const c of world.creatures) {
      if (c.id) FINE.creatureId[c.id] = 1;
      for (const key of FINE_CREATURE_PARTS) if (c[key]) FINE.creatureId[c[key]] = 1;
    }
  }
}

function fineCanvas() {
  if (!FINE.cv) {
    const cv = document.createElement('canvas');
    cv.className = 'fine';
    cv.setAttribute('aria-hidden', 'true');
    canvas.after(cv);
    FINE.cv = cv; FINE.g = cv.getContext('2d');
  }
  return FINE.cv;
}
// Over the pond exactly: the pond's own transform, then to where this picture starts, at its detail scale.
function placeFine() {
  if (!FINE.cv || FINE.cv.hidden) return;
  FINE.cv.style.transform = `${canvasTransform(view.tx, view.ty, view.k, view.r, world.W, world.H)} translate(${FINE.x0}px, ${FINE.y0}px) scale(${1 / FINE.f})`;
}
function hideFine() { if (FINE.cv && !FINE.cv.hidden) FINE.cv.hidden = true; }

// One pass of Scale2x: src (sw × sh) into dst (2sw × 2sh, row length ds).
function fineScale2x(src, sw, sh, ss, sx0, sy0, dst, ds) {
  for (let y = 0; y < sh; y++) {
    const row = (sy0 + y) * ss, up = (sy0 + (y > 0 ? y - 1 : 0)) * ss, dn = (sy0 + (y < sh - 1 ? y + 1 : y)) * ss;
    let o = y * 2 * ds;
    for (let x = 0; x < sw; x++, o += 2) {
      const gx = sx0 + x, P = src[row + gx], A = src[up + gx], D = src[dn + gx];
      const C = src[row + (x > 0 ? gx - 1 : gx)], B = src[row + (x < sw - 1 ? gx + 1 : gx)];
      if (A !== D && C !== B) {
        dst[o] = C === A ? C : P; dst[o + 1] = A === B ? B : P;
        dst[o + ds] = C === D ? C : P; dst[o + ds + 1] = D === B ? B : P;
      } else dst[o] = dst[o + 1] = dst[o + ds] = dst[o + ds + 1] = P;
    }
  }
}

// An animal's spine for this frame: each joint's place along the body (u), direction and width.
function fineSpine(c) {
  let s = FINE.spines.get(c.id);
  if (s !== undefined) return s;
  const b = c.body;
  s = null;
  if (b && b.n > 1 && b.x && b.w) {
    const n = b.n, DX = new Float32Array(n), DY = new Float32Array(n), U = new Float32Array(n);
    let u = 0;
    for (let k = 0; k < n; k++) {
      const a = k < n - 1 ? k : k - 1, dx = b.x[a + 1] - b.x[a], dy = b.y[a + 1] - b.y[a], L = Math.hypot(dx, dy) || 1;
      DX[k] = dx / L; DY[k] = dy / L;
      if (k) u += Math.hypot(b.x[k] - b.x[k - 1], b.y[k] - b.y[k - 1]);
      U[k] = u;
    }
    s = { n, X: b.x, Y: b.y, DX, DY, U, Wd: b.w, fish: typeof Fish !== 'undefined' && c instanceof Fish, fin: Array.isArray(c.fin) && c.fin.length === 4 ? c.fin : null,
      eye: c.eyeMat ? c.eyeMat[0] : EYE[0], pulse: 0.5 + 0.5 * Math.sin(world.t * 2.1 + c.id * 0.7), key: c.id * 131 };
  }
  FINE.spines.set(c.id, s);
  return s;
}

function renderFine(rect) {
  if (!FINE.rec || !world.raster || !out) { hideFine(); FINE.rec = false; return; }
  const t0 = performance.now(), cv = fineCanvas(), F = view.k >= 15 ? 8 : view.k >= 10 ? 4 : 2, g = FINE.g;
  const [x0, y0, x1, y1] = rect, w = x1 - x0 + 1, h = y1 - y0 + 1, WF = w * F, HF = h * F;
  if (WF > FINE.cw || HF > FINE.ch) {
    FINE.cw = cv.width = Math.max(WF, FINE.cw) + 32; FINE.ch = cv.height = Math.max(HF, FINE.ch) + 32;
    FINE.img = g.createImageData(FINE.cw, FINE.ch); FINE.buf = new Uint32Array(FINE.img.data.buffer); FINE.lw = FINE.lh = 0;
  }
  const S = FINE.cw, buf = FINE.buf, W = world.W, H = world.H, w2 = w * 2, h2 = h * 2, w4 = w * 4, h4 = h * 4;
  if (!FINE.a2 || FINE.a2.length < w2 * h2) FINE.a2 = new Uint32Array(Math.ceil(w2 * h2 * 1.3));
  if (!FINE.id2 || FINE.id2.length < w2 * h2) FINE.id2 = new Uint16Array(Math.ceil(w2 * h2 * 1.3));
  if (!FINE.ids || FINE.ids.length < WF * HF) FINE.ids = new Uint16Array(Math.ceil(WF * HF * 1.3));
  // 1. The frame and its object IDs, scaled together so the thin outlines follow the finer silhouettes.
  fineScale2x(out, w, h, W, x0, y0, FINE.a2, w2);
  fineScale2x(world.raster.id, w, h, W, x0, y0, FINE.id2, w2);
  if (F === 2) {
    // The first Scale2x pass is already the finished picture at the middle zooms.
    for (let y = 0; y < h2; y++) {
      buf.set(FINE.a2.subarray(y * w2, (y + 1) * w2), y * S);
      FINE.ids.set(FINE.id2.subarray(y * w2, (y + 1) * w2), y * WF);
    }
  } else if (F === 4) {
    fineScale2x(FINE.a2, w2, h2, w2, 0, 0, buf, S);
    fineScale2x(FINE.id2, w2, h2, w2, 0, 0, FINE.ids, WF);
  } else {
    if (!FINE.a4 || FINE.a4.length < w4 * h4) FINE.a4 = new Uint32Array(Math.ceil(w4 * h4 * 1.3));
    if (!FINE.id4 || FINE.id4.length < w4 * h4) FINE.id4 = new Uint16Array(Math.ceil(w4 * h4 * 1.3));
    fineScale2x(FINE.a2, w2, h2, w2, 0, 0, FINE.a4, w4);
    fineScale2x(FINE.id2, w2, h2, w2, 0, 0, FINE.id4, w4);
    fineScale2x(FINE.a4, w4, h4, w4, 0, 0, buf, S);
    fineScale2x(FINE.id4, w4, h4, w4, 0, 0, FINE.ids, WF);
  }

  // 2. Whose each id is (animals, plants), for this frame.
  const own = FINE.own, kind = FINE.kind, used = FINE.used;
  for (const i of used) { own[i] = null; kind[i] = 0; }
  used.length = 0;
  FINE.spines.clear();
  const near = (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
  for (const c of world.creatures) if (c.id && near(c.x, c.y, 60)) { own[c.id] = c; kind[c.id] = 1; used.push(c.id); }
  for (const list of [world.plants, world.pads]) for (const p of list) if (p.id && near(p.x, p.y, 60)) { own[p.id] = p; kind[p.id] = 2; used.push(p.id); }

  // 3. Each pond pixel's detail, by what it is. (Only the fine pixels still its own colour: Scale2x gave the rest of
  //    its corners to its neighbours.)
  const r = world.raster, id = r.id, z = r.z, zb = r.zBase, col = r.col;
  const shore = world.shore, tideL = world.tide.level * 255, dmap = world.depth || null, t = world.t;
  const k = clamp((view.k - 10) / 6, 0.3, 1), light = world.light || {}, dark = light.darkness || 0;
  const cst = world.caustic, TM = CAUSTIC_SIZE - 1, cDay = cst && world.opts.caustics && light.caustics && QUALITY.level < 1 ? (1 - dark) * k : 0;
  const o1x = Math.floor(t * 1.6), o1y = Math.floor(t * 0.9), o2x = Math.floor(-t * 1.2), o2y = Math.floor(t * 1.3);
  const sn = world.shoreN || [0.8, 0.6], rsx = sn[0] / 14, rsy = sn[1] / 14, NT = FINE_NOISE;
  const eye0 = EYE[0], shine0 = EYE_SHINE[0], side = shore ? world.shoreSide : -1;
  for (let y = 0; y < h; y++) {
    const gy = y0 + y;
    for (let x = 0; x < w; x++) {
      const gx = x0 + x, p = gx + gy * W, c = out[p], i = id[p], q0 = y * F * S + x * F;
      if (i === 0) {
        // Where a larger object's outline remains, leave its colour alone. Creature outlines are drawn below at the
        // fine scale, so their neighbouring floor pixels still get detail.
        const zt = zb[p] + 0.5;
        const ci = FINE.creatureId;
        if (world.opts.outlines &&
            ((gx > 0 && id[p - 1] && !ci[id[p - 1]] && z[p - 1] > zt) ||
             (gx < W - 1 && id[p + 1] && !ci[id[p + 1]] && z[p + 1] > zt) ||
             (gy > 0 && id[p - W] && !ci[id[p - W]] && z[p - W] > zt) ||
             (gy < H - 1 && id[p + W] && !ci[id[p + W]] && z[p + W] > zt))) continue;
        const dry = !!shore && shore[p] > tideL, rock = zb[p] > 1.5, dd = dmap ? dmap[p] : 0;
        // (Fading out toward the landward edge and the beach's two ends: the land and the neighbours past them are
        //  drawn at the pond's own scale, so no seam there.)
        const ed = side < 0 ? 99 : Math.min(side === 0 ? gx : side === 1 ? W - 1 - gx : side === 2 ? gy : H - 1 - gy, side < 2 ? Math.min(gy, H - 1 - gy) : Math.min(gx, W - 1 - gx));
        const fade = (dry ? 1 : 1 - Math.min(0.85, dd / 140)) * (ed < 24 ? ed / 24 : 1), ripple = !rock && (dry || dd < 26);
        if (ed < 24 && (fineHash(gx, gy + 999) & 255) >= ed * 256 / 24) {
          // (And the smoothing too, in a dither: pixel for pixel the land's own blocks, more of them nearer the land.)
          for (let jj = 0; jj < F; jj++) buf.fill(c, q0 + jj * S, q0 + jj * S + F);
          continue;
        }
        if (fade <= 0) continue;
        const up = rock && gy > 0 && zb[p - W] < zb[p] - 0.6, lf = rock && gx > 0 && zb[p - 1] < zb[p] - 0.6;
        const dn = rock && gy < H - 1 && zb[p + W] < zb[p] - 0.6, rt = rock && gx < W - 1 && zb[p + 1] < zb[p] - 0.6;
        for (let jj = 0; jj < F; jj++) {
          for (let ii = 0, q = q0 + jj * S; ii < F; ii++, q++) {
            if (buf[q] !== c) continue;
            const X = gx * F + ii, Y = gy * F + jj, hs = fineHash(X, Y);
            let f = 1, v = c;
            // Grains: a few a little lighter or darker; now and then a fleck of shell or grit.
            if ((hs & 1023) < (dry ? 160 : 110)) f += (((hs >>> 10) & 15) - 7.5) * (dry ? 0.011 : 0.008) * k * fade;
            const fl = (hs >>> 16) & 4095;
            if (fl < 9) v = fineMix(v, FINE_SHELL, 0.3 * k * fade);
            else if (fl < 14) v = fineMix(v, FINE_GRIT, 0.25 * k * fade);
            if (rock) {
              // Rock: speckled, a crack here and there, lit along its upper edge and shaded along its lower.
              if ((hs & 255) < 46) f += (((hs >>> 8) & 7) - 3.5) * 0.024 * k * fade;
              const cx = (X / 6) | 0, cy = (Y / 6) | 0, hc = fineHash(cx * 7 + 3, cy * 13 + 5);
              if ((hc & 7) === 0) { const lx = X - cx * 6, ly = Y - cy * 6; if (lx > 0 && lx < 5 && ((hc >> 3) & 1 ? lx === ly : lx === 5 - ly)) f -= 0.14 * k * fade; }
              if (up && jj === 0) f += 0.09 * k; if (lf && ii === 0) f += 0.06 * k; if (dn && jj === F - 1) f -= 0.08 * k; if (rt && ii === F - 1) f -= 0.05 * k;
            } else if (dry) {
              // Pebbles up the beach (two fine pixels, lit on top).
              const cx = (X / 3) | 0, cy = (Y / 3) | 0, hc = fineHash(cx + 91, cy - 37);
              if ((hc & 511) < 5) { const lx = X - cx * 3, ly = Y - cy * 3; if (lx < 2 && ly < 2) f += (lx + ly === 0 ? 0.05 : -0.13) * k * fade; }
            }
            if (ripple) {
              // Ripples in the sand, across the way the waves come in (and the wind, up the beach).
              const s = X * rsx + Y * rsy + NT[((X >> 1) & 255) | (((Y >> 1) & 255) << 8)] * 1.1, fr = s - Math.floor(s);
              if (fr < 0.08) f += 0.032 * k * fade; else if (fr > 0.5 && fr < 0.58) f -= 0.02 * k * fade;
            }
            if (cDay && !dry) {
              // A finer net of light than the pond's own, drifting slowly.
              const cv2 = cst[((X + o1x) & TM) | (((Y + o1y) & TM) << 7)] + cst[((Y + o2y) & TM) | (((X + o2x) & TM) << 7)];
              if (cv2 < 0.08) f += (0.08 - cv2) * 1.1 * cDay * fade;
            }
            buf[q] = f === 1 ? v : fineK(v, f);
          }
        }
        continue;
      }
      // Something drawn: lit along its top and left edges, shaded along its lower and right ones.
      const upD = gy === 0 || id[p - W] !== i, lfD = gx === 0 || id[p - 1] !== i, dnD = gy === H - 1 || id[p + W] !== i, rtD = gx === W - 1 || id[p + 1] !== i;
      const kd = kind[i], ow = own[i], cp = col[p];
      let sp = null, u = 0, v = 0, dx = 1, dy = 0, wk = 1, fin = false, skin = false, kn = 0;
      if (kd === 1 && cp !== eye0 && cp !== shine0 && (sp = fineSpine(ow))) {
        // Where on the animal: along its spine (u, from the head) and across it (v).
        const px = gx + 0.5, py = gy + 0.5;
        let best = 1e9;
        for (let kk = 0; kk < sp.n; kk++) { const ex = px - sp.X[kk], ey = py - sp.Y[kk], d = ex * ex + ey * ey; if (d < best) { best = d; kn = kk; } }
        dx = sp.DX[kn]; dy = sp.DY[kn]; wk = Math.max(0.5, sp.Wd[kn] || 0.5);
        const ex = px - sp.X[kn], ey = py - sp.Y[kn];
        u = sp.U[kn] + ex * dx + ey * dy; v = -ex * dy + ey * dx;
        fin = !!sp.fin && (cp === sp.fin[0] || cp === sp.fin[1] || cp === sp.fin[2] || cp === sp.fin[3]);
        skin = !fin;
      }
      let ridgeH = false, ridgeV = false, tip = 0;
      if (kd === 2) {
        // Leaves and stems: a vein along the ridge (the highest line down the middle).
        ridgeH = !lfD && !rtD && z[p] >= z[p - 1] && z[p] >= z[p + 1];
        ridgeV = !upD && !dnD && z[p] >= z[p - W] && z[p] >= z[p + W];
        const same = (!upD) + (!lfD) + (!dnD) + (!rtD);
        if (same === 1) tip = !dnD ? 1 : !upD ? 2 : !rtD ? 3 : 4; // (a tip, open upward, downward, to the left, to the right)
      }
      const gU = sp ? sp.U[1] + 0.25 : 0, gW = sp ? Math.max(0.6, sp.Wd[1] || 0.6) : 1;
      for (let jj = 0; jj < F; jj++) {
        for (let ii = 0, q = q0 + jj * S; ii < F; ii++, q++) {
          if (buf[q] !== c) continue;
          let f = 1;
          if (upD && jj === 0) f += 0.07 * k; if (lfD && ii === 0) f += 0.05 * k;
          if (dnD && jj === F - 1) f -= 0.06 * k; if (rtD && ii === F - 1) f -= 0.04 * k;
          if (sp) {
            const ox = (ii + 0.5) / F - 0.5, oy = (jj + 0.5) / F - 0.5, uu = u + ox * dx + oy * dy, vv = v - ox * dy + oy * dx;
            if (fin) {
              // Fin rays, fanning out from where the fin meets the body (the tail's from its root).
              const kb = kn >= sp.n - 3 ? Math.max(0, sp.n - 3) : kn, ru = uu - sp.U[kb], th = Math.atan2(vv, ru) * 5 / Math.PI;
              if (th - Math.floor(th) < 0.15 && ru * ru + vv * vv > 0.4) f -= 0.1 * k;
            } else if (skin && sp.fish) {
              // A fish: its gill, breathing, and scales in rows from there back.
              const du = uu - gU - 0.45 * vv * vv / gW;
              if (du > -0.14 && du < 0.14 && Math.abs(vv) < gW * 0.8) f -= (0.05 + 0.07 * sp.pulse) * k;
              else if (uu > gU && Math.abs(vv) < wk * 0.85) {
                const rv = vv / 0.75 + 100, row = Math.floor(rv), cu = uu + (row & 1) * 0.5, a = cu - Math.floor(cu), b = rv - row;
                if (b < 0.3 && a > 0.2 && a < 0.8) f += 0.055 * k; else if (b > 0.78) f -= 0.03 * k;
              }
            } else if (skin) {
              // Everyone else: mottled.
              const hm = fineHash(Math.floor(uu * 3) + sp.key, Math.floor(vv * 3 + 50)) & 31;
              if (hm < 3) f -= 0.07 * k; else if (hm === 31) f += 0.05 * k;
            }
          }
          if ((ridgeH && ii === 1 + ((z[p - 1] < z[p + 1]) | 0)) || (ridgeV && jj === 1 + ((z[p - W] < z[p + W]) | 0))) f += 0.07 * k;
          if (f !== 1) buf[q] = fineK(c, f);
        }
      }
      if (tip) {
        // A leaf's tip stirs: now a fine pixel short, now a fine pixel on (slowly, each on its own time).
        const s = Math.sin(t * 0.8 + gx * 0.37 + gy * 0.23 + i * 0.1);
        if (s > 0.45 || s < -0.45) {
          const vert = tip <= 2, edge = tip === 1 || tip === 3 ? 0 : F - 1;
          if (s > 0.45) {
            const bc = tip === 1 ? (gy > 0 ? out[p - W] : c) : tip === 2 ? (gy < H - 1 ? out[p + W] : c) : tip === 3 ? (gx > 0 ? out[p - 1] : c) : (gx < W - 1 ? out[p + 1] : c);
            for (let m = 1; m < F - 1; m++) buf[vert ? q0 + edge * S + m : q0 + m * S + edge] = bc;
          } else {
            // (Only over what's lower than the leaf: not over an animal beside it.)
            const np = tip === 1 ? p - W : tip === 2 ? p + W : tip === 3 ? p - 1 : p + 1;
            const nq = tip === 1 ? (y > 0 ? q0 - S : -1) : tip === 2 ? (y < h - 1 ? q0 + F * S : -1) : tip === 3 ? (x > 0 ? q0 - 1 : -1) : (x < w - 1 ? q0 + F : -1);
            if (nq >= 0 && (id[np] === 0 || z[np] < z[p])) for (let m = 1; m < F - 1; m++) buf[vert ? nq + m : nq + m * S] = fineK(c, 1 - 0.04 * k);
          }
        }
      }
    }
  }

  // 4. A glint in each eye (up toward the light).
  const E = FINE.eyes;
  for (let e = 0; e < E.length; e += 3) {
    const px = Math.floor(E[e]), py = Math.floor(E[e + 1]);
    if (px < x0 || py < y0 || px > x1 || py > y1 || id[px + py * W] !== E[e + 2]) continue;
    const q = ((py - y0) * F + 1) * S + (px - x0) * F + 1;
    buf[q] = fineMix(buf[q], FINE_EYE, 0.85 * k);
  }

  // 5. Glints on the water, twinkling now and then (fewer at night, none on the beach).
  const gk = k * (0.2 + 0.8 * (1 - dark)) * (1 - 0.6 * Math.min(1, world.weather.rain || 0));
  const X0 = x0 * F, Y0 = y0 * F;
  if (gk > 0.02) {
    for (let cy = Math.floor(Y0 / 8); cy * 8 < Y0 + HF; cy++) {
      for (let cx = Math.floor(X0 / 8); cx * 8 < X0 + WF; cx++) {
        const hc = fineHash(cx * 3 + 1, cy * 5 + 2);
        if ((hc & 15) !== 0) continue;
        const b = Math.sin(t * (0.3 + ((hc >>> 20) & 7) * 0.05) + ((hc >>> 10) & 1023) * 0.00614);
        if (b < 0.93) continue;
        const lx = cx * 8 + ((hc >>> 4) & 7) - X0, ly = cy * 8 + ((hc >>> 7) & 7) - Y0;
        if (lx < 1 || ly < 1 || lx >= WF - 1 || ly >= HF - 1) continue;
        const pp = x0 + Math.floor(lx / F) + (y0 + Math.floor(ly / F)) * W;
        if (id[pp] || (shore && shore[pp] > tideL)) continue;
        const a = (b - 0.93) / 0.07, q = lx + ly * S;
        buf[q] = fineMix(buf[q], FINE_GLINT, 0.75 * a * gk);
        if (a > 0.6) for (const n of [q - 1, q + 1, q - S, q + S]) buf[n] = fineMix(buf[n], FINE_GLINT, 0.3 * a * gk);
      }
    }
  }

  // 6. Motes drifting in the water, each at its own depth (hidden under anything higher); in the sea at night a few glow.
  const cur = world.current || { x: 0, y: 0 }, base = Math.hypot(cur.x, cur.y) > 0.01 ? Math.atan2(cur.y, cur.x) : 0.6, salt = world.opts.habitat !== 'fresh';
  for (let cy = Math.floor(Y0 / 24) - 1; cy * 24 < Y0 + HF + 24; cy++) {
    for (let cx = Math.floor(X0 / 24) - 1; cx * 24 < X0 + WF + 24; cx++) {
      const hm = fineHash(cx * 17 + 5, cy * 29 + 11);
      if (hm % 3) continue;
      const speed = 0.6 + ((hm >>> 8) & 7) * 0.15, ang = base + (((hm >>> 12) & 255) / 255 - 0.5) * 0.8;
      const travel = t * speed + ((hm >>> 2) & 63), pr = (travel % 24) / 24, d = pr * 24 - 12, wob = Math.sin(t * 0.3 + (hm & 1023)) * 1.5;
      const mx = Math.round(cx * 24 + 12 + Math.cos(ang) * d - Math.sin(ang) * wob) - X0, my = Math.round(cy * 24 + 12 + Math.sin(ang) * d + Math.cos(ang) * wob) - Y0;
      if (mx < 0 || my < 0 || mx >= WF || my >= HF) continue;
      const pp = x0 + Math.floor(mx / F) + (y0 + Math.floor(my / F)) * W, md = 6 + ((hm >>> 20) & 31);
      if ((shore && shore[pp] > tideL) || z[pp] > md) continue;
      const alpha = Math.sin(Math.PI * pr), q = mx + my * S;
      if (salt && (hm >>> 28) === 0) buf[q] = fineMix(buf[q], FINE_GLOW, alpha * (0.15 + 0.6 * dark) * k);
      else buf[q] = fineMix(buf[q], FINE_MOTE, alpha * 0.28 * k * (1 - 0.8 * dark));
    }
  }

  // 7. Draw creatures' outlines at this scale: one detail pixel, or two for rare creatures. At the pond scale those
  // rings would be four or eight times wider on screen. Keep the outline outside the smoothed creature silhouette.
  if (world.opts.outlines) {
    const mask = FINE.ids, ci = FINE.creatureId;
    for (let yy = 0; yy < HF; yy++) for (let xx = 0; xx < WF; xx++) {
      const q = xx + yy * WF, i = mask[q];
      if (!ci[i] || FADE[i]) continue;
      if ((xx === 0 || mask[q - 1] === i) && (xx === WF - 1 || mask[q + 1] === i) &&
          (yy === 0 || mask[q - WF] === i) && (yy === HF - 1 || mask[q + WF] === i)) continue;
      const source = (x0 + Math.floor(xx / F)) + (y0 + Math.floor(yy / F)) * W;
      const rim = fineMix(buf[xx + yy * S], OUTLINE[i], 0.82), width = THICK[i] ? 2 : 1;
      for (let d = 1; d <= width; d++) {
        for (let side = 0; side < 4; side++) {
          const nx = xx + (side === 0 ? -d : side === 1 ? d : 0);
          const ny = yy + (side === 2 ? -d : side === 3 ? d : 0);
          if (nx < 0 || ny < 0 || nx >= WF || ny >= HF) continue;
          const nq = nx + ny * WF, other = mask[nq];
          if (other === i || ci[other]) continue;
          if (other && z[source] <= z[(x0 + Math.floor(nx / F)) + (y0 + Math.floor(ny / F)) * W] + 2.5) continue;
          buf[nx + ny * S] = rim;
        }
      }
    }
  }

  g.putImageData(FINE.img, 0, 0, 0, 0, WF, HF);
  if (WF < FINE.lw) g.clearRect(WF, 0, FINE.cw - WF, FINE.ch);
  if (HF < FINE.lh) g.clearRect(0, HF, FINE.cw, FINE.ch - HF);
  FINE.lw = WF; FINE.lh = HF; FINE.x0 = x0; FINE.y0 = y0; FINE.f = F;
  cv.hidden = false;
  placeFine();
  // (Too slow for this machine: off for a while, and the pond as it was.)
  const ms = performance.now() - t0;
  FINE.ms = ms;
  FINE.ema += (ms - FINE.ema) * 0.05;
  if (FINE.ema > 9) { FINE.off = performance.now() + 8000; FINE.ema = 4; hideFine(); }
  FINE.rec = false;
}
