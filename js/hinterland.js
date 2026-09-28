'use strict';
// The land up the beach. Past the pond's landward edge the beach carries on up: a picture beside the
// pond, not part of it (nothing lives, is kept or is built there yet), that the view can pan into as
// far as it shows. It comes out of the haze a little further as the pond ages and deepens:
//  - the upper beach: dry sand, shells and weed the storms threw up, driftwood;
//  - dunes: ridges the wind heaps up, held by marram grass, ghost crabs' holes, the river cutting
//    down between them;
//  - scrub: shrubs and palms (willows and reeds by fresh water), the river narrower, stones in it;
//  - and at last the jungle: canopy so thick it's dark under it, going black further in, and eyes
//    that blink, shift and shy from the pointer. Nothing comes out of it. Yet.
// The river runs on up into it from wherever its course meets the pond, bending back into the valley
// it has always come down. The picture is painted a slice at a time when it's needed (a new pond, a
// new day's river), lit by the pond's light, with a few things moving over it: the river's flecks, a
// heron by day, fireflies at night, and the eyes.

const HINTER_MAX = 440;                             // how far up the beach the land can show (world px)
const HZ_SAND = 64, HZ_DUNE = 176, HZ_SCRUB = 292;  // where each band ends (the jungle past the last)
const HINTER_HAZE = 18;                             // the haze at the edge of what shows
const HINTER = {
  cv: null, sp: null, g: null, sg: null, img: null, px: null, base: null, cover: null, geo: null, key: '', hard: '',
  job: null, jobKey: '', shown: 0, seed: null, zone: -1, tint: [1, 1, 1], tintT: 0, dirty: true, ready: false, onScreen: false,
  gaps: [], riv: null, eyes: [], flies: [], flecks: [], heron: null, spT: 0, tf: '',
};

// How far up the beach shows: a little at first, more with every pond day and as the pond deepens.
function hinterReach(world) {
  if (!world.shore || world.shoreSide == null || !world.W) return 0;
  const E = world.erosion;
  return clamp(40 + 5.5 * (world.days || 0) + 3 * (E ? E.e || 0 : 0), 40, HINTER_MAX);
}

// Where the picture sits: a strip along the landward edge, in the pond's own coordinates.
function hinterGeo(world) {
  const s = world.shoreSide, W = world.W, H = world.H, M = HINTER_MAX;
  return s === 0 ? { s, cw: M, ch: H, ox: -M, oy: 0 } : s === 1 ? { s, cw: M, ch: H, ox: W, oy: 0 }
    : s === 2 ? { s, cw: W, ch: M, ox: 0, oy: -M } : { s, cw: W, ch: M, ox: 0, oy: H };
}
// Picture pixel <-> (dd: how far up from the pond's edge, u: along the beach), and directions likewise.
const hinterToPx = (s, dd, u) => (s === 0 ? [HINTER_MAX - 1 - dd, u] : s === 1 ? [dd, u] : s === 2 ? [u, HINTER_MAX - 1 - dd] : [u, dd]);
const hinterToLocal = (s, px, py) => (s === 0 ? [HINTER_MAX - 1 - px, py] : s === 1 ? [px, py] : s === 2 ? [HINTER_MAX - 1 - py, px] : [py, px]);
const hinterVec = (s, ddd, du) => (s === 0 ? [-ddd, du] : s === 1 ? [ddd, du] : s === 2 ? [du, -ddd] : [du, ddd]);
const hinterZone = (dd) => (dd < HZ_SAND ? 0 : dd < HZ_DUNE ? 1 : dd < HZ_SCRUB ? 2 : 3);

const HL = {
  wood: [hexToInt('#3a2a18'), hexToInt('#5e4428'), hexToInt('#86643c'), hexToInt('#a88658')],
  marram: [hexToInt('#4a5a22'), hexToInt('#6e7e34'), hexToInt('#98a24a'), hexToInt('#c4c26a')],
  shrub: [hexToInt('#142210'), hexToInt('#243e18'), hexToInt('#385a24'), hexToInt('#587c34')],
  palm: [hexToInt('#1a3010'), hexToInt('#2e5218'), hexToInt('#4a7a24'), hexToInt('#72a238')],
  willow: [hexToInt('#22401c'), hexToInt('#3a6228'), hexToInt('#5a8838'), hexToInt('#84ae50')],
  canopy: [hexToInt('#040804'), hexToInt('#0a160a'), hexToInt('#142a16'), hexToInt('#22421e')],
  crown: [hexToInt('#060c06'), hexToInt('#10220e'), hexToInt('#1e3c18'), hexToInt('#325a26')],
  reed: [hexToInt('#3a4a1a'), hexToInt('#566628'), hexToInt('#76863a'), hexToInt('#9ca458')],
  stone: [hexToInt('#3a3a36'), hexToInt('#5a5a54'), hexToInt('#7e7c74'), hexToInt('#a4a298')],
  soil: hexToInt('#5e5034'), grass: hexToInt('#4e6a2c'), jfloor: hexToInt('#0a120a'), black: hexToInt('#020402'),
  dune: hexToInt('#f4e6c6'), lit: hexToInt('#fff6de'), lee: hexToInt('#8a7652'), wet: hexToInt('#6a5e44'),
  shell: hexToInt('#efe6d6'), wrack: hexToInt('#3c3a1c'), hole: hexToInt('#2a2216'), haze: hexToInt('#aab8b2'), sun: hexToInt('#fff0d2'),
};
const hDry = (c) => mixColor(c, HL.sun, 46 / 256); // (the sunlit dry beach, as the renderer lights the pond's)

// The river's course up the land: where it meets the pond it runs the way its course runs there;
// further up it bends back into the valley it has always come down (the pond's first course).
function hinterRiver(world) {
  const Rv = world.river;
  if (!Rv || typeof riverState !== 'function') return null;
  const R = riverState(world), C = riverCourse(world, R.k), C0 = riverCourse(world, 0), along = world.shoreSide < 2 ? world.H : world.W;
  const uc = new Float32Array(HINTER_MAX), hw = new Float32Array(HINTER_MAX);
  for (let dd = 0; dd < HINTER_MAX; dd++) {
    const valley = C0.u * along + 24 * Math.sin(dd * 0.021 + C0.ph) + 9 * Math.sin(dd * 0.057 + C0.ph2);
    uc[dd] = lerp(riverCenter(world, C, -1 - dd), valley, smoothstep(0, 120, dd));
    hw[dd] = Math.max(1.3, Rv.w * 0.4 * lerp(1, 0.55, clamp(dd / 320, 0, 1)));
  }
  return { uc, hw, flow: Rv.flow || 1 };
}

// ---- painting ----------------------------------------------------------------------------------------
// A generator: each yield is a slice of rows or shapes, so a new picture never stalls a frame.
function* hinterPaint(world, geo) {
  const { s, cw, ch, ox, oy } = geo, M = HINTER_MAX, along = s < 2 ? ch : cw, N = cw * ch;
  const base = new Uint32Array(N), cover = new Uint8Array(N), Lm = new Float32Array(N), E = new Float32Array(N);
  const fk = FLOOR_ALIASES[world.opts.floor] || world.opts.floor, floor = FLOORS[fk] || FLOORS.sand;
  const [fx, fy] = world.expandPx && typeof originOf === 'function' ? originOf(world) : [0, 0];
  const hab = world.opts.habitat || 'mixed', S = hashString(`${world.seed}/hinter`) % 997, riv = hinterRiver(world);
  const water = world.waterColor || hexToInt('#2a6a78');
  // Where the pond's own sand meets the picture, the two blend (the floor's stains and deposits carry on a little).
  const edge = new Uint32Array(along), bg = world.bg;
  if (bg && typeof coastXY === 'function') for (let u = 0; u < along; u++) { const [x, y] = coastXY(world, 0, u), c = bg[x + y * world.W]; edge[u] = c >>> 24 ? hDry(c) : 0; }
  // 1. How far "in" each point is (a ragged line, not a ruler's), and the dunes' heights.
  for (let py = 0; py < ch; py++) {
    for (let px = 0; px < cw; px++) {
      const [dd, u] = hinterToLocal(s, px, py), i = px + py * cw;
      const L = dd + (fbm(u * 0.013, dd * 0.013, S + 91) - 0.5) * 56;
      Lm[i] = L;
      const env = smoothstep(46, 92, L) * (1 - smoothstep(180, 238, L));
      if (env > 0) {
        const f = (dd * 0.12 + (fbm(u * 0.01, dd * 0.01, S + 93) - 0.5) * 8) / TAU, g = f - Math.floor(f);
        E[i] = env * (g < 0.72 ? g / 0.72 : (1 - g) / 0.28) * (0.6 + 0.8 * vnoise(u * 0.03, dd * 0.03, S + 95)) * 5;
      }
    }
    if (py % 24 === 23) yield;
  }
  // 2. The ground: sand, lit dunes, the green coming in, soil, the jungle floor; the river through it.
  for (let py = 0; py < ch; py++) {
    for (let px = 0; px < cw; px++) {
      const [dd, u] = hinterToLocal(s, px, py), i = px + py * cw, L = Lm[i], b = dither(px, py);
      let c = hDry(floor.color(px + ox - fx, py + oy - fy));
      if (dd < 12 && edge[u]) c = mixColor(edge[u], c, smoothstep(0, 12, dd));
      // Dunes: bright on the faces toward the light (up and left), in shadow behind.
      const e = E[i];
      if (e > 0 || (px > 0 && py > 0 && E[i - 1 - cw] > 0)) {
        const a = px > 0 && py > 0 ? E[i - 1 - cw] : e, z = px < cw - 1 && py < ch - 1 ? E[i + 1 + cw] : e, sl = a - z;
        c = mixColor(c, HL.dune, Math.min(0.2, e * 0.05));
        const q = Math.floor(Math.min(3, Math.abs(sl) * 2.4 + b * 0.9)) / 3;
        if (q > 0) c = sl > 0 ? mixColor(c, HL.lit, q * 0.35) : mixColor(c, HL.lee, q * 0.4);
      }
      const veg = smoothstep(118, 206, L), soil = smoothstep(190, 262, L), jung = smoothstep(274, 322, L), deep = smoothstep(330, 436, L);
      if (veg > 0) c = mixColor(c, HL.grass, veg * (0.2 + 0.5 * vnoise(u * 0.08, dd * 0.08, S + 97)) * (b < 0.9 ? 1 : 0.7));
      if (soil > 0) c = mixColor(c, HL.soil, soil * 0.5);
      if (jung > 0) c = mixColor(c, HL.jfloor, jung * 0.88);
      if (deep > 0) c = mixColor(c, HL.black, deep * 0.8);
      // What the storms threw up: bits of weed and shell near the top of the sand.
      if (L < 44) { const h = hash2(px, py, S + 5); if (h < 0.004) c = HL.shell; else if (h < 0.02 && Math.abs(dd - 9 - 7 * vnoise(u * 0.05, 3, S)) < 2.5) c = HL.wrack; }
      // The river: deeper and darker down its middle, wet banks, darker still under the trees.
      if (riv) {
        const du = Math.abs(u - riv.uc[dd]), hw = riv.hw[dd];
        if (du <= hw) {
          const k = 1 - du / hw;
          c = mixColor(mixColor(c, water, 0.5 + 0.28 * k), HL.black, 0.05 + 0.12 * k + jung * 0.5);
          cover[i] = 2;
        } else if (du <= hw + 2.4) c = mixColor(c, HL.wet, 0.5 * (1 - (du - hw) / 2.4) * (1 - jung * 0.5));
      }
      base[i] = c;
    }
    if (py % 16 === 15) yield;
  }
  // 3. What grows and lies on it, from the ground up. (Laid out from the pond's seed: the same land every time.)
  const P = [];
  withSeed(`${world.seed}/hinter`, () => {
    for (let k = 0; k < along / 130; k++) P.push(['wood', rand(4, 52), rand(0, along), rand(6, 16), rand(-0.5, 0.5)]);
    for (let k = 0; k < along / 26; k++) P.push(['hole', rand(8, 150), rand(0, along)]);
    for (let k = 0; k < along * 1.5; k++) P.push(['tuft', rand(36, 250), rand(0, along), randi(4, 7)]);
    for (let k = 0; k < along * 0.5; k++) P.push(['shrub', rand(150, 300), rand(0, along), rand(2.4, 6)]);
    for (let k = 0; k < along * 0.1; k++) P.push([hab === 'fresh' ? 'willow' : 'palm', rand(168, 300), rand(0, along), hab === 'fresh' ? rand(5, 9) : rand(7, 11)]);
    if (riv) for (let dd = 80; dd < 300; dd += rand(2, 5)) for (const sd of [-1, 1]) if (Math.random() < 0.55) P.push(['reed', dd, riv.uc[dd | 0] + sd * (riv.hw[dd | 0] + rand(0.5, 2.5))]);
    if (riv) for (let dd = 96; dd < 300; dd += rand(8, 16)) P.push(['stone', dd, riv.uc[dd | 0] + rand(-1, 1) * riv.hw[dd | 0], rand(1, 2.2)]);
    for (let k = 0; k < along * 2.6; k++) P.push(['canopy', rand(262, 452), rand(-8, along + 8), rand(5, 13)]);
    for (let k = 0; k < along / 45; k++) P.push(['crown', rand(300, 420), rand(0, along), rand(11, 17)]);
  });
  const put = (px, py, c, mark) => { if (px < 0 || py < 0 || px >= cw || py >= ch) return; const i = (px | 0) + (py | 0) * cw; base[i] = c; if (mark) cover[i] = mark; };
  const at = (dd, u) => { const [px, py] = hinterToPx(s, dd | 0, u | 0); return px >= 0 && py >= 0 && px < cw && py < ch ? px + py * cw : -1; };
  const inRiver = (dd, u, m) => riv && dd >= 0 && dd < M && Math.abs(u - riv.uc[dd | 0]) < riv.hw[dd | 0] + m;
  // A lumpy ball of leaves, lit from up and left, dark at its rim, with its shadow cast down and right.
  const ball = (cx, cy, R, pal, mark, shadow) => {
    const R2 = R * R, sh = R * 0.45;
    if (shadow) for (let y = Math.floor(cy - R + sh); y <= cy + R + sh; y++) for (let x = Math.floor(cx - R + sh); x <= cx + R + sh; x++) {
      if (x < 0 || y < 0 || x >= cw || y >= ch || (x - cx - sh) ** 2 + (y - cy - sh) ** 2 > R2) continue;
      const i = x + y * cw;
      if (cover[i] !== 1) base[i] = mixColor(base[i], HL.black, 0.42);
    }
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
      const dx = x - cx, dy = y - cy, a = Math.atan2(dy, dx), r = R * (0.84 + 0.16 * vnoise(a * 2 + cx, cy * 0.1, S + 7));
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d2 / (r * r))), lum = 0.55 * nz + 0.45 * (-dx - dy) / (r * 1.414);
      let lv = Math.floor((lum + 0.25) * 2.6 + dither(x, y) * 0.9);
      if (hash2(x, y, S + 11) < 0.14) lv += hash2(x, y, S + 12) < 0.5 ? -1 : 1; // leaves catching the light, or not
      if (d2 > (r - 1) * (r - 1)) lv -= 2;
      base[x + y * cw] = pal[clamp(lv, 0, 3)];
      cover[x + y * cw] = mark;
    }
  };
  const line = (x0, y0, x1, y1, fn) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))); for (let k = 0; k <= n; k++) fn(lerp(x0, x1, k / n), lerp(y0, y1, k / n), k / n); };
  let done = 0;
  for (const q of P) {
    const [kind, dd, u] = q;
    const i0 = at(dd, u);
    if (i0 < 0 && kind !== 'canopy' && kind !== 'crown') continue;
    const L = i0 >= 0 ? Lm[i0] : dd, [cx, cy] = hinterToPx(s, dd, u);
    if (kind === 'wood') {
      if (inRiver(dd, u, 3)) continue;
      const [vx, vy] = hinterVec(s, Math.sin(q[4]), Math.cos(q[4])), len = q[3];
      line(cx, cy, cx + vx * len, cy + vy * len, (x, y, f) => {
        for (const [ax, ay, lv] of [[0, 0, 2], [1, 1, 1], [-1, -1, 3], [1, 0, 1]]) if (!(f > 0.92 && lv === 3)) put(x + ax * 0.6, y + ay * 0.6, HL.wood[lv]);
      });
    } else if (kind === 'hole') {
      if (L > 150 || inRiver(dd, u, 3)) continue;
      put(cx, cy, HL.hole); put(cx + 1, cy + 1, mixColor(base[i0], HL.lit, 0.3)); put(cx - 1, cy, mixColor(base[i0], HL.black, 0.25));
    } else if (kind === 'tuft') {
      // Marram: thick on the dunes, thinning out on the sand below and in the scrub above.
      const p = smoothstep(40, 96, L) * (1 - smoothstep(210, 262, L)) * 0.95;
      if (hash2(cx, cy, S + 21) > p || inRiver(dd, u, 2)) continue;
      put(cx + 1, cy + 1, mixColor(base[i0], HL.black, 0.3));
      for (let k = 0; k < q[3]; k++) {
        const a = hash2(k, cx, S + 23) * TAU, l = 1.5 + hash2(k, cy, S + 25) * 2.6;
        line(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l, (x, y, f) => put(x, y, HL.marram[f < 0.4 ? 1 : f < 0.8 ? 2 : Math.cos(a) + Math.sin(a) < 0 ? 3 : 1]));
      }
    } else if (kind === 'shrub') {
      if (L < 150 || L > 305 || inRiver(dd, u, q[3] + 1.5)) continue;
      ball(cx, cy, q[3], HL.shrub, 1, true);
    } else if (kind === 'palm') {
      if (L < 165 || L > 300 || inRiver(dd, u, 4)) continue;
      // From above: a star of fronds on a crown, the trunk's shadow running off down and right.
      const len = q[3];
      line(cx, cy, cx + len * 0.9, cy + len * 0.9, (x, y) => { const j = (x | 0) + (y | 0) * cw; if (x >= 0 && y >= 0 && x < cw && y < ch && cover[j] !== 1) base[j] = mixColor(base[j], HL.black, 0.45); });
      const nf = 7 + (hash2(cx, cy, S) * 3 | 0);
      for (let k = 0; k < nf; k++) {
        const a = k / nf * TAU + hash2(k, cx, S + 31) * 0.5, l = len * (0.75 + 0.3 * hash2(k, cy, S + 33));
        line(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l, (x, y, f) => {
          const lit = Math.cos(a) + Math.sin(a) < 0 ? 1 : 0;
          put(x, y, HL.palm[f > 0.85 ? 1 : 2 + lit], 1);
          if (f > 0.15 && f < 0.9 && ((f * l) | 0) % 2 === 0) for (const sd of [-1, 1]) put(x + Math.cos(a + sd * 1.3) * 1.4, y + Math.sin(a + sd * 1.3) * 1.4, HL.palm[1 + lit], 1);
        });
      }
      put(cx, cy, HL.wood[0], 1); put(cx + 1, cy, hexToInt('#3a2a12'), 1); put(cx, cy + 1, hexToInt('#4a3418'), 1);
    } else if (kind === 'willow') {
      if (L < 165 || L > 300 || inRiver(dd, u, q[3] * 0.5)) continue;
      ball(cx, cy, q[3], HL.willow, 1, true);
      for (let k = 0; k < q[3] * 3; k++) { const a = hash2(k, cx, S + 41) * TAU, r = q[3] * (0.5 + 0.5 * hash2(k, cy, S + 43)); line(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, cx + Math.cos(a) * r, cy + Math.sin(a) * r + 1.5, (x, y) => put(x, y, HL.willow[1], 1)); }
    } else if (kind === 'reed') {
      const [vx, vy] = hinterVec(s, 0.4, 0.2 * Math.sign(u - (riv ? riv.uc[dd | 0] : u)));
      line(cx, cy, cx + vx * 3 - 0.8, cy + vy * 3 - 1.4, (x, y, f) => put(x, y, HL.reed[f < 0.5 ? 1 : 2 + (hash2(cx, cy, S) < 0.5 ? 1 : 0)]));
    } else if (kind === 'stone') {
      ball(cx, cy, q[3], HL.stone, 2, false);
    } else if (kind === 'canopy' || kind === 'crown') {
      // The jungle: thick and dark, darker the further in. (Its trees over the river too: it goes under.)
      if (L < (kind === 'crown' ? 290 : 262) + (hash2(cx, cy, S + 51) - 0.5) * 30) continue;
      const pal = kind === 'crown' ? HL.crown : HL.canopy, fade = smoothstep(340, 440, L);
      ball(cx, cy, q[3], fade > 0.55 ? [pal[0], pal[0], pal[1], pal[1]] : fade > 0.2 ? [pal[0], pal[0], pal[1], pal[2]] : pal, 1, true);
    }
    if (++done % 90 === 0) yield;
  }
  // 4. Where eyes can look out from: the darkest gaps, well into the jungle.
  const gaps = [];
  withSeed(`${world.seed}/eyes`, () => {
    for (let k = 0; k < 6000 && gaps.length < 180; k++) {
      const dd = rand(300, M - 6), u = rand(3, along - 4), i = at(dd, u);
      if (i < 0 || Lm[i] < 305) continue;
      const c = base[i], lum = (c & 255) + ((c >> 8) & 255) + ((c >> 16) & 255);
      if (lum > 70) continue;
      const [px, py] = hinterToPx(s, dd | 0, u | 0);
      if (gaps.some((g) => Math.abs(g[0] - px) + Math.abs(g[1] - py) < 7)) continue;
      gaps.push([px, py, dd | 0]);
    }
  });
  return { base, cover, gaps, riv, geo };
}

// ---- showing it: lit with the pond's light, and hazed past what shows yet ---------------------------------
function hinterTint(dd0, dd1) {
  const H = HINTER, G = H.geo, { s, cw, ch } = G, M = HINTER_MAX, base = H.base, out = H.px, shown = H.shown;
  if (!base) return;
  dd0 = clamp(Math.floor(dd0), 0, M - 1); dd1 = clamp(Math.ceil(dd1), 0, M - 1);
  const tr = Math.round(H.tint[0] * 256), tg = Math.round(H.tint[1] * 256), tb = Math.round(H.tint[2] * 256), haze = HL.haze;
  let x0 = 0, x1 = cw - 1, y0 = 0, y1 = ch - 1;
  if (s < 2) { x0 = s === 0 ? M - 1 - dd1 : dd0; x1 = s === 0 ? M - 1 - dd0 : dd1; } else { y0 = s === 2 ? M - 1 - dd1 : dd0; y1 = s === 2 ? M - 1 - dd0 : dd1; }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0, i = x0 + y * cw; x <= x1; x++, i++) {
      const dd = s === 0 ? M - 1 - x : s === 1 ? x : s === 2 ? M - 1 - y : y;
      let c = base[i];
      if (dd > shown) { const k = Math.floor(Math.min(1, (dd - shown) / HINTER_HAZE) * 6 + dither(x, y) * 0.95) / 6; c = k >= 1 ? haze : mixColor(c, haze, k); }
      out[i] = (0xff000000 | (((((c >>> 16) & 255) * tb) >> 8) << 16) | (((((c >>> 8) & 255) * tg) >> 8) << 8) | (((c & 255) * tr) >> 8)) >>> 0;
    }
  }
  H.g.putImageData(H.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

// What the picture depends on: the pond, its beach's length and side, its floor and water (a different
// one of any of those, and the old picture goes at once), and its size and today's river (a new picture
// is painted while the old one stays up: growing out doesn't change the land, only where it sits).
const hinterHardKey = (world) => `${world.seed}|${world.shoreSide < 2 ? world.H : world.W}|${world.shoreSide}|${world.opts.floor}|${world.opts.habitat}|${world.opts.water}`;
const hinterKey = (world) => `${hinterHardKey(world)}|${world.W}x${world.H}|${world.river ? `${world.river.k}:${world.river.w}` : '-'}|${Math.floor(world.days || 0)}`;

// The two canvases (the land, and what moves over it), set just under the pond's own.
function hinterInit(pond) {
  if (HINTER.cv || typeof document === 'undefined') return null;
  for (const k of ['cv', 'sp']) {
    const c = document.createElement('canvas');
    c.className = 'hinter';
    c.hidden = true;
    pond.before(c);
    HINTER[k] = c;
  }
  HINTER.cv.style.pointerEvents = 'none';
  HINTER.g = HINTER.cv.getContext('2d');
  HINTER.sg = HINTER.sp.getContext('2d');
  return HINTER.sp;
}

// How far past the landward edge the view may go (world px): as far as shows, and a little haze.
function hinterSpan() {
  const H = HINTER;
  return H.ready && H.geo && world.W && H.geo.s === world.shoreSide ? Math.min(HINTER_MAX, Math.round(H.shown + 10)) : 0;
}

// Put the picture where the land lies on screen (the same scale and turn as the pond).
function placeHinter() {
  const H = HINTER;
  if (!H.cv) return;
  if (!H.ready || !H.geo || H.geo.s !== world.shoreSide) { H.cv.hidden = H.sp.hidden = true; H.onScreen = false; return; }
  const { cw, ch, ox, oy } = H.geo, a = worldToScreen(ox, oy), b = worldToScreen(ox + cw, oy + ch);
  const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  H.onScreen = x < innerWidth && y < innerHeight && x1 > 0 && y1 > 0;
  H.cv.hidden = H.sp.hidden = !H.onScreen;
  if (!H.onScreen) return;
  const tf = canvasTransform(x, y, view.k, view.r, cw, ch);
  if (H.tf !== tf) { H.tf = tf; H.cv.style.transform = H.sp.style.transform = tf; }
}

// Each frame: keep the picture current (painting a new one a slice at a time), creep the haze back,
// relight it as the light changes, and move what moves.
function hinterTick(world, dt) {
  const H = HINTER;
  if (!H.cv) return;
  const want = hinterReach(world);
  if (!want) { if (H.ready) { H.ready = false; placeHinter(); } return; }
  // A different pond (or size, or side): the old picture is wrong, so it goes at once.
  const hard = hinterHardKey(world), key = hinterKey(world);
  if (hard !== H.hard) { H.hard = hard; H.ready = false; H.job = null; H.key = ''; H.shown = want; H.zone = hinterZone(want); H.eyes = []; H.flies = []; H.heron = null; placeHinter(); }
  // A new day's river (or the first picture): paint it now if it's needed or on screen, later otherwise.
  if (key !== H.key && !H.job && (!H.ready || H.onScreen)) { H.job = hinterPaint(world, hinterGeo(world)); H.jobKey = key; }
  if (H.job) {
    const t0 = performance.now();
    let r;
    while (performance.now() - t0 < 6) { r = H.job.next(); if (r.done) break; }
    if (r && r.done) {
      const p = r.value;
      H.job = null; H.key = H.jobKey;
      H.base = p.base; H.cover = p.cover; H.gaps = p.gaps; H.riv = p.riv; H.geo = p.geo;
      if (H.cv.width !== p.geo.cw || H.cv.height !== p.geo.ch) {
        H.cv.width = H.sp.width = p.geo.cw; H.cv.height = H.sp.height = p.geo.ch;
        H.img = H.g.createImageData(p.geo.cw, p.geo.ch); H.px = new Uint32Array(H.img.data.buffer);
      }
      H.eyes = H.eyes.filter((e) => H.gaps[e.g]);
      H.ready = true; H.dirty = true; H.tf = '';
      if (typeof applyView === 'function') applyView();
    }
  }
  if (!H.ready) return;
  // Grown out on the beach's side, the pond has moved the land along with it: the picture follows.
  const g = hinterGeo(world);
  if (g.ox !== H.geo.ox || g.oy !== H.geo.oy) { H.geo = { ...H.geo, ox: g.ox, oy: g.oy }; H.tf = ''; placeHinter(); }
  // The haze lifts a little at a time (the first look at a pond starts from where it's got to).
  const was = H.shown;
  H.shown = want < H.shown ? want : Math.min(want, H.shown + dt * 2.5);
  const z = hinterZone(H.shown - 6);
  if (z > H.zone) {
    H.zone = z;
    const say = ['', 'The haze up the beach has lifted a little: past the sand, dunes, held together by marram grass',
      'Further up the beach, past the dunes: scrub, and trees where the river comes down',
      'At the top of the beach, the haze has lifted off a jungle. It is dark in there, and something is watching the pond'][z];
    if (say && typeof logEvent === 'function' && !world.observe) logEvent(world, say, null, { cat: 'pond', pri: z === 3 ? 3 : 2 });
  }
  // Relight when the light has moved on (a dusk goes by in a few steps), and redo the haze as it lifts.
  const T = (world.light && world.light.tint) || [1, 1, 1], now = performance.now();
  if (H.onScreen && (H.dirty || (now - H.tintT > 400 && T.some((v, j) => Math.abs(v - H.tint[j]) > 0.012)))) {
    H.tint = T.slice(); H.tintT = now; H.dirty = false;
    hinterTint(0, HINTER_MAX - 1);
  } else if (Math.floor(H.shown) !== Math.floor(was)) {
    if (H.onScreen) hinterTint(Math.min(was, H.shown) - 1, Math.max(was, H.shown) + HINTER_HAZE + 1); else H.dirty = true;
  }
  if (H.onScreen && (H.spT -= dt) <= 0) { H.spT = 1 / 15; hinterSprites(world); }
}

// ---- what moves ------------------------------------------------------------------------------------
const EYE_COLS = ['#ffd84a', '#f0b030', '#c8ff60', '#ffe8a0', '#ff4a2a', '#9ae8ff'];
function hinterSprites(world) {
  const H = HINTER, g = H.sg, { s, cw, ch } = H.geo, t = world.t, dark = world.darkness || 0, along = s < 2 ? ch : cw;
  g.clearRect(0, 0, cw, ch);
  const T = H.tint, css = (c, lit = false) => {
    const k = lit ? [1, 1, 1] : T;
    return `rgb(${Math.round((c & 255) * k[0])},${Math.round(((c >> 8) & 255) * k[1])},${Math.round(((c >> 16) & 255) * k[2])})`;
  };
  const dot = (x, y, col) => { g.fillStyle = col; g.fillRect(x | 0, y | 0, 1, 1); };
  const shown = H.shown, riv = H.riv, cover = H.cover;
  // The river's flecks, riding the current down toward the pond (only where the water shows).
  if (riv) {
    const span = Math.min(shown, HINTER_MAX - 1), n = Math.round(span / 7 * clamp(riv.flow, 0.5, 1.8)), foam = css(hexToInt('#dcecf0'));
    for (let k = 0; k < n; k++) {
      const sp = 7 + 5 * riv.flow + hash2(k, 5, 9) * 4, dd = (span - ((t * sp + hash2(k, 1, 3) * span) % span)) | 0;
      const u = riv.uc[dd] + (hash2(k, 7, 3) - 0.5) * riv.hw[dd] * 1.4, [px, py] = hinterToPx(s, dd, u | 0);
      if (px >= 0 && py >= 0 && px < cw && py < ch && cover[px + py * cw] === 2) dot(px, py, foam);
    }
    // A heron by day, standing at the water's edge in the dunes; now and then it strikes.
    if (dark < 0.4 && shown > 96) {
      if (!H.heron || H.heron.day !== Math.floor(world.days)) {
        const dd = 70 + (hashString(`${world.seed}/heron/${Math.floor(world.days)}`) % 80), sd = hash2(dd, 3, 7) < 0.5 ? -1 : 1;
        H.heron = { dd, sd, day: Math.floor(world.days), strike: 0 };
      }
      const hr = H.heron, u = riv.uc[hr.dd] + hr.sd * (riv.hw[hr.dd] + 0.5), [px, py] = hinterToPx(s, hr.dd, u | 0);
      if (Math.random() < 0.01) hr.strike = t + 0.5;
      const [fx, fy] = hinterVec(s, 0, -hr.sd), st = hr.strike > t ? 2 : 1, grey = css(hexToInt('#8e969e')), pale = css(hexToInt('#c8d0d6'));
      dot(px + 1, py + 1, css(hexToInt('#1a1a14'))); dot(px, py, grey); dot(px - fy, py + fx, grey); dot(px + fx * 0.5, py + fy * 0.5, pale);
      dot(px + fx * st, py + fy * st, pale); dot(px + fx * (st + 1), py + fy * (st + 1), css(hexToInt('#e0b030')));
    }
  }
  // Fireflies at night, over the scrub.
  if (dark > 0.5 && shown > HZ_DUNE + 20) {
    while (H.flies.length < 16) H.flies.push({ dd: rand(HZ_DUNE, Math.min(shown, HZ_SCRUB + 20)), u: rand(0, along), ph: rand(0, TAU), v: rand(0.4, 1.2) });
    for (const f of H.flies) {
      f.u += Math.sin(t * 0.4 + f.ph) * 0.15 * f.v; f.dd += Math.cos(t * 0.33 + f.ph * 2) * 0.1 * f.v;
      if (Math.sin(t * (1.3 + f.v) + f.ph) < 0.3) continue;
      const [px, py] = hinterToPx(s, f.dd | 0, f.u | 0);
      dot(px, py, css(hexToInt('#e8ff70'), true));
    }
  } else H.flies.length = 0;
  // The eyes: in the dark between the trees, a few by day and many at night. They blink, and look
  // about, and shut and go when the pointer comes near.
  if (shown > HZ_SCRUB + 14 && H.gaps.length) {
    const want = Math.round(lerp(3, 18, dark) * clamp((shown - HZ_SCRUB) / 110, 0.3, 1));
    const p = world.pointer, [pdd, pu] = p && p.inside !== false ? hinterWorldToLocal(world, p.x, p.y) : [-999, -999];
    H.eyes = H.eyes.filter((e) => t < e.end);
    if (H.eyes.length < want && Math.random() < 0.08) {
      const gi = randi(0, H.gaps.length - 1), G = H.gaps[gi];
      if (G[2] < shown - 4 && !H.eyes.some((e) => e.g === gi)) H.eyes.push({ g: gi, born: t, end: t + rand(6, 30), blink: t + rand(1, 5), col: EYE_COLS[Math.random() < 0.06 ? 4 : randi(0, 3)], dx: 0 });
    } else if (H.eyes.length > want + 2) H.eyes[0].end = Math.min(H.eyes[0].end, t + 0.2);
    const across = view.r % 2 === 0; // (the pair lies across the screen however the view is turned)
    for (const e of H.eyes) {
      const G = H.gaps[e.g];
      if (!G) continue;
      const [edd, eu] = hinterToLocal(s, G[0], G[1]);
      if (Math.abs(edd - pdd) + Math.abs(eu - pu) < 16 && !e.shy) { e.shy = true; e.end = Math.min(e.end, t + 0.35); }
      if (e.blink < t) { if (t > e.blink + 0.14) { e.blink = t + rand(1.5, 7); if (Math.random() < 0.2) e.dx = randi(-1, 1); } continue; }
      if (e.shy && t > e.end - 0.3) continue;
      const fresh = clamp((t - e.born) / 0.8, 0, 1), day = 1 - dark;
      const col = hexToInt(e.col), c = mixColor(col, HL.black, Math.max(1 - fresh, day * 0.5)), cs = css(c, true);
      const x = G[0] + (across ? e.dx : 0), y = G[1] + (across ? 0 : e.dx);
      dot(x, y, cs); dot(across ? x + 2 : x, across ? y : y + 2, cs);
    }
  } else H.eyes.length = 0;
}

// A point in the pond's coordinates (it may be past the edge) as (dd, u) up the beach.
function hinterWorldToLocal(world, x, y) {
  const s = world.shoreSide;
  return s === 0 ? [-1 - x, y] : s === 1 ? [x - world.W, y] : s === 2 ? [-1 - y, x] : [y - world.H, x];
}

// A click on the land: what it is.
function hinterClick(world, x, y) {
  const [dd, u] = hinterWorldToLocal(world, x, y), H = HINTER;
  if (dd < 0) return false;
  let text;
  if (dd > H.shown + 2) text = 'Haze\nThe land further up the beach shows itself a little more as your pond grows older and deeper.';
  else {
    const eye = H.geo && H.eyes.find((e) => { const G = H.gaps[e.g]; if (!G) return false; const [edd, eu] = hinterToLocal(H.geo.s, G[0], G[1]); return Math.abs(edd - dd) + Math.abs(eu - u) < 5; });
    const z = eye ? 4 : hinterZone(dd);
    text = [
      'The upper beach\nDry sand above the tides, and what the storms threw up: weed, shells, driftwood. The land carries on up from here.',
      'Dunes\nThe wind heaps the sand into ridges, and marram grass holds them. Ghost crabs dig their holes here.',
      `Scrub\n${world.opts.habitat === 'fresh' ? 'Willows and reeds' : 'Palms and shrubs'} where the river comes down to the beach. Herons fish its edges by day; fireflies come out over it at night.`,
      'The jungle\nIt is dark in there, and it goes on further than you can see. Something is watching the beach. Nothing has come out of it… yet.',
      'Eyes\nSomething in the jungle, watching the pond. It shuts its eyes and slips away when you come near. It hasn’t come out. Yet.',
    ][z];
  }
  if (typeof showTicker === 'function') showTicker(text.replace('\n', ': '));
  return true;
}
