'use strict';
// How the deep looks and moves.
//  - Light: things that glow cast pools of light around them, on the floor and on
//    whatever swims through: glowing fish, the deep's own lamps (the angler's lure
//    throws a long beam ahead of it, the squid and gulper shorter ones), paragons
//    and the marked, glowing plants and the deep's plants, and structures that
//    burn with an eerie neon. Salt water glows cyan, blue and magenta; fresh
//    water foxfire green, amber and violet. The pools show at night and in deep
//    water (by day in the shallows they're lost in the sun).
//  - The deep gets its own look as the pond goes down: the dark shifts toward a
//    different colour for each tier past the abyss (indigo, then violet, then the
//    green of the drowned city, then the red-black of the dream in salt water;
//    crypt brown, root black, sunken green, dream red in fresh), marine snow
//    starts to glow, and from the trench on, long chasms open across the deep,
//    black, with faint lights along their rims.
//  - Things move up and down: out over the deep, swimmers rise toward the surface
//    at night and sink by day (the daily migration of real deep water), the big
//    deep hunters and monsters surge up now and then and dive again, and the
//    floor-crawling deep things (the kraken, the squids) lift off and rise. The
//    dark covers what swims low over the deep and lets go of what comes up.

const NEON = {
  salt: ['#2af0ff', '#3a7aff', '#ff3ad8', '#3affc0', '#8a5aff'].map(hexToInt),
  fresh: ['#8aff3a', '#ffc03a', '#d8ff5a', '#b05aff', '#3affa0'].map(hexToInt),
};
function neon(world, i) {
  const h = world.opts.habitat, P = NEON[h === 'fresh' ? 'fresh' : h === 'salt' ? 'salt' : (i & 1 ? 'fresh' : 'salt')];
  return P[((i % P.length) + P.length) % P.length];
}
// Creatures that cast light: radius, beam (stretch ahead of the head), neon index; night: only after dark.
const LIGHT_SPECIES = {
  angler: { r: 22, beam: 2.4, c: 0 }, gulper: { r: 12, beam: 1.8, c: 2 }, squid: { r: 14, beam: 1.6, c: 2 }, vampire: { r: 12, c: 2 },
  siphon: { r: 16, c: 1 }, jelly: { r: 9, c: 3, night: true }, snailfish: { r: 6, c: 4 }, frilled: { r: 7, c: 1 }, boneeel: { r: 8, c: 3 },
  deepone: { r: 10, c: 3 }, sleeper: { r: 34, c: 2 }, leviathan: { r: 26, c: 1 }, kraken: { r: 22, c: 2 }, watcher: { r: 26, c: 0 },
  cavefish: { r: 6, c: 3 }, olm: { r: 6, c: 4 }, isopod: { r: 5, c: 1 }, catfish: { r: 5, c: 1 },
};
const LIGHT_PLANTS = { glowcap: { r: 9, c: 0, k: 0.6 }, starweed: { r: 11, c: 4, k: 0.7 }, sealily: { r: 8, c: 2, k: 0.5 }, weepmoss: { r: 6, c: 3, k: 0.4 }, tubeworms: { r: 6, col: '#ff4a3a', k: 0.4 }, paleroots: { r: 6, c: 4, k: 0.4 }, blackcoral: { r: 6, c: 1, k: 0.4 } };
const LIGHT_STRUCTS = {
  shrine: { r: 34, col: '#9af0ff', k: 0.8 }, grotto: { r: 28, col: '#b08aff', k: 0.7 }, smoker: { r: 22, col: '#ff7a2a', k: 0.7 }, lantern: { r: 40, c: 0 }, gate: { r: 46, col: '#4af08a', k: 0.8 },
  cradle: { r: 60, col: '#ff3a9a', k: 0.8 }, spire: { r: 22, col: '#ff4a5a', k: 0.5 }, rootcathedral: { r: 32, c: 0, k: 0.6 }, brinepool: { r: 26, col: '#3a8aff', k: 0.7 },
  ossuary: { r: 20, col: '#d8ffd0', k: 0.4 }, idol: { r: 26, col: '#3aff9a', k: 0.7 }, broodchamber: { r: 16, col: '#ff9a4a', k: 0.5 }, reefnursery: { r: 12, c: 2, k: 0.4 },
};
const colOf = (world, d, i) => (d.col ? (typeof d.col === 'string' ? (d.col = hexToInt(d.col)) : d.col) : neon(world, d.c + i));

// The light map: a coarse grid (4 px cells) of added light, rebuilt each frame over what's on screen.
const LIGHT_CELL = 4;
function lightMap(world) {
  const lw = Math.ceil(world.W / LIGHT_CELL), lh = Math.ceil(world.H / LIGHT_CELL);
  let M = world.lightMap;
  if (!M || M.lw !== lw || M.lh !== lh) M = world.lightMap = { lw, lh, shift: 2, data: new Float32Array(lw * lh * 3), any: false };
  return M;
}
// What stands in the light's way: the tallest thing in each cell of the light map (the floor's own baked rocks and
// builds, and whatever is drawn this frame), and from it how hemmed in each cell is (ambient occlusion). Built each
// frame over the lit area, from the raster's height buffers. A light given a height (lh) then casts shadows: from
// each cell it reaches, a ray back to the lamp, and anything taller than the ray on the way blocks it (softly).
function occluders(world, M, rect) {
  const r = world.raster;
  if (!r || !r.zBase || !r.z || !r.id) { M.occ = null; return; }
  if (!M.occ || M.occ.length !== M.lw * M.lh) { M.occ = new Float32Array(M.lw * M.lh); M.ao = new Float32Array(M.lw * M.lh); }
  const cs = LIGHT_CELL, W = world.W, zB = r.zBase, z = r.z, id = r.id, O = M.occ, A = M.ao;
  const gx0 = Math.max(0, Math.floor(rect[0] / cs)), gx1 = Math.min(M.lw - 1, Math.floor(rect[2] / cs));
  const gy0 = Math.max(0, Math.floor(rect[1] / cs)), gy1 = Math.min(M.lh - 1, Math.floor(rect[3] / cs));
  M.ob = [gx0, gy0, gx1, gy1];
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    let h = 0;
    for (const [sx, sy] of [[1, 1], [3, 3]]) { // (two samples a cell)
      const px = gx * cs + sx, py = gy * cs + sy;
      if (px >= W || py >= world.H) continue;
      const p = px + py * W, v = id[p] ? Math.max(zB[p], z[p]) : zB[p];
      if (v > h) h = v;
    }
    O[gx + gy * M.lw] = h;
  }
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const i = gx + gy * M.lw, h = O[i];
    let a = 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = gx + ox, ny = gy + oy;
      if (nx < gx0 || ny < gy0 || nx > gx1 || ny > gy1) continue;
      const d = O[nx + ny * M.lw] - h;
      if (d > 0) a += Math.min(1, d / 12);
    }
    A[i] = Math.min(0.55, a / 8 * 0.9);
  }
}
function splat(M, x, y, R, col, k, ang, beam, rect, lh) {
  if (R < 10) { k *= R / 10; R = 10; } // (small lights spread a little, or the grid shows as squares)
  // (The occluders are built the first time a light that casts shadows needs them this frame.)
  if (lh != null && !M.occReady && M.occWorld) { occluders(M.occWorld, M, M.occRect); M.occReady = true; }
  const shade = lh != null && M.occ && M.ob, O = M.occ, AO = M.ao, lgx = x / LIGHT_CELL, lgy = y / LIGHT_CELL;
  const cs = LIGHT_CELL, ahead = beam ? R * beam : R;
  const ext = Math.max(R, ahead) + 2;
  if (x + ext < rect[0] || x - ext > rect[2] || y + ext < rect[1] || y - ext > rect[3]) return;
  const cr = (col & 255) / 255, cg = ((col >> 8) & 255) / 255, cb = ((col >>> 16) & 255) / 255, ca = Math.cos(ang || 0), sa = Math.sin(ang || 0);
  const gx0 = Math.max(0, Math.floor((x - ext) / cs)), gx1 = Math.min(M.lw - 1, Math.floor((x + ext) / cs));
  const gy0 = Math.max(0, Math.floor((y - ext) / cs)), gy1 = Math.min(M.lh - 1, Math.floor((y + ext) / cs));
  const D = M.data;
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const dx = gx * cs + cs / 2 - x, dy = gy * cs + cs / 2 - y;
      let u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      if (beam) u = u > 0 ? u / beam : u * 1.4; // a beam: long ahead, short behind
      const d2 = (u * u + v * v) / (R * R);
      if (d2 >= 1) continue;
      let f = (1 - d2) * (1 - d2) * k;
      const ci = gx + gy * M.lw, i = ci * 3;
      if (shade) {
        // The shadow: march from this cell to the lamp; anything standing higher than the ray blocks some light.
        const ddx = lgx - (gx + 0.5), ddy = lgy - (gy + 0.5), dist = Math.hypot(ddx, ddy), n = Math.min(28, Math.ceil(dist));
        let block = 0;
        for (let s = 1; s < n; s++) {
          const fr = s / n;
          if (dist * (1 - fr) < 1.6) break; // (not the lamp's own body)
          const sx = Math.floor(gx + 0.5 + ddx * fr), sy = Math.floor(gy + 0.5 + ddy * fr);
          if (sx < M.ob[0] || sy < M.ob[1] || sx > M.ob[2] || sy > M.ob[3]) continue;
          const ray = 0.5 + (lh - 0.5) * fr, over = O[sx + sy * M.lw] - ray;
          if (over > 0.4) { block += Math.min(1, over / 3) * 0.7; if (block >= 1) break; }
        }
        f *= Math.max(0.08, 1 - block) * (1 - AO[ci]);
      }
      D[i] += cr * f; D[i + 1] += cg * f; D[i + 2] += cb * f;
    }
  }
  M.any = true;
}

// Gather this frame's lights (on screen, plus their reach).
function buildLights(world, rect) {
  const M = lightMap(world), D = M.data, cs = LIGHT_CELL, night = world.darkness || 0, t = world.t;
  const gx0 = Math.max(0, Math.floor((rect[0] - 90) / cs)), gx1 = Math.min(M.lw - 1, Math.ceil((rect[2] + 90) / cs));
  const gy0 = Math.max(0, Math.floor((rect[1] - 90) / cs)), gy1 = Math.min(M.lh - 1, Math.ceil((rect[3] + 90) / cs));
  for (let gy = gy0; gy <= gy1; gy++) D.fill(0, (gx0 + gy * M.lw) * 3, (gx1 + 1 + gy * M.lw) * 3);
  M.any = false;
  const big = [rect[0] - 90, rect[1] - 90, rect[2] + 90, rect[3] + 90];
  M.occReady = false; M.occWorld = world; M.occRect = big;
  // A crowd glows as a few lamps, not hundreds: one creature light per 12 px patch.
  const taken = new Set();
  for (const c of world.creatures) {
    if (c.gone || (c.alpha ?? 1) < 0.2 || c.x < big[0] || c.x > big[2] || c.y < big[1] || c.y > big[3]) continue;
    const cell = ((c.x / 12) | 0) + ((c.y / 12) | 0) * 4096;
    if (taken.has(cell)) continue;
    const L = c.life, def = LIGHT_SPECIES[c.species], hx = c.body ? c.body.x[0] : c.x, hy = c.body ? c.body.y[0] : c.y;
    // Higher up, a light spreads wider over the floor and fainter.
    const lift = 1 + clamp((c.z || 0) / SURFACE_Z, 0, 1) * 0.6;
    if (def && !(def.night && night < 0.4)) { splat(M, hx, hy, def.r * lift, colOf(world, def, c.seed & 3), 1 / lift, c.heading, def.beam, big, (c.z || 0) + 1); taken.add(cell); }
    if (!L) continue;
    const g = L.genome;
    if (g.glow || L.paragon || (g.eld && eldStage(L) === 2)) taken.add(cell);
    if (g.glow) splat(M, c.x, c.y, (9 + 5 * (g.size || 1)) * lift, neon(world, (c.seed >> 3) & 7), 0.9 / lift, 0, 0, big);
    if (L.paragon) splat(M, hx, hy, 12 * lift, 0xff4ad2ff, 0.9, 0, 0, big);
    if (g.starry) splat(M, c.x, c.y, 6, 0xffffe0b0, 0.6, 0, 0, big);
    if (g.iridescent) splat(M, c.x, c.y, 8, hslToInt((t * 60 + c.seed) % 360, 0.9, 0.6), 0.6, 0, 0, big);
    if (g.eld && eldStage(L) === 2) splat(M, c.x, c.y, 9 + 2 * Math.min(3, L.absorbed || 0), 0xffff4a9a, 0.35, 0, 0, big);
  }
  for (const p of world.plants) {
    const def = LIGHT_PLANTS[p.make], gl = p.tr && p.tr.glow;
    if (!def && !gl) continue;
    const g = Math.max(0.2, p.growth ?? 1), pulse = 0.8 + 0.2 * Math.sin(t * 1.3 + p.x * 0.1);
    if (def) splat(M, p.x, p.y, def.r * (0.6 + 0.4 * g), colOf(world, def, (p.x | 0) & 3), pulse * (def.k || 0.6), 0, 0, big);
    if (gl) splat(M, p.x, p.y, 8 + 3 * gl, neon(world, (p.y | 0) & 7), pulse * 0.6, 0, 0, big);
  }
  for (const s of world.structures) {
    const def = LIGHT_STRUCTS[s.kind];
    if (s.anim) continue;
    if (def) {
      const R = def.r * (1 + 0.15 * ((s.lv && s.lv.reach) || 0)), col = colOf(world, def, s.seed & 3), k = (def.k || 1) * (0.85 + 0.15 * Math.sin(t * 0.9 + s.x));
      splat(M, s.x, s.y, R, col, k, 0, 0, big, Math.min(10, (s.h || 8) * 0.5 + 2));
      splat(M, s.x, s.y, R * 2, col, k * 0.09, 0, 0, big); // (and a faint ambience far round it, in the dark)
    }
    if (s.kind === 'island' && s.branch === 'life') splat(M, s.x, s.y, islandRadius(world, s) * 0.9, 0xff70d8ff, 0.2 + 0.05 * (s.blv || 1), 0, 0, big);
    if (s.kind === 'island' && s.branch === 'dark') splat(M, s.x, s.y, islandRadius(world, s) * 1.1, 0xff8aff3a, 0.2 + 0.06 * (s.blv || 1), 0, 0, big);
  }
  for (const f of world.fossils || []) if (f.kind === 'relic') splat(M, f.x, f.y, 14, 0xff8ad03a, 0.8, 0, 0, big);
  if (typeof xenoLights === 'function') xenoLights(M, world, big);
  if (typeof landLights === 'function') landLights(M, world, big);
  if (typeof beaconLights === 'function') beaconLights(M, world, big); // (beacons and lighthouses: beacons.js)
  return M.any ? M : null;
}

// ---- the look of each tier past the abyss --------------------------------------------------------------
const TIER_DARK = {
  salt: ['#0a0420', '#12031e', '#021a12', '#1a0210'].map(hexToInt),
  fresh: ['#0e0a04', '#060c02', '#04160c', '#16060e'].map(hexToInt),
};
const DEEP_MID = { salt: hexToInt('#02040e'), fresh: hexToInt('#050806'), mixed: hexToInt('#03050c') };
function deepTint(world) {
  // (The middle depths' colour; the deepest water past it is true black.)
  const tier = (world.erosion && world.erosion.tier) || 0, base = DEEP_MID[world.opts.habitat] || DEEP_MID.mixed;
  if (tier < 5) return base;
  const t = mixColor(base, TIER_DARK[branchOf(world)][Math.min(3, tier - 5)] || base, 0.5);
  return tier > 8 ? mixColor(t, 0xff000000, Math.min(0.8, 0.25 * (tier - 8))) : t; // (the deep past: darker every tier)
}
const TRENCH_GLOW = { salt: hexToInt('#2ab0ff'), fresh: hexToInt('#8aff4a') };

// Trenches: from the hadal trench (tier 5) on, a long canyon across the deep (a second from the
// drowned city): a black floor far down, walls that step down into it, and a lip either side, the
// one facing the light lit. Stored per pixel: 0..127 how far in, +128 on the lit side.
function carveTrenches(world, depth, rect) {
  const tier = (world.erosion && world.erosion.tier) || 0, ex = world.expandPx || 0;
  if (tier < 5 || !ex) { world.trench = null; return; }
  const { W, H } = world, T = world.trench && world.trench.length === W * H ? world.trench : (world.trench = new Uint8Array(W * H));
  const [x0, y0, x1, y1] = rect || [0, 0, W - 1, H - 1];
  for (let y = y0; y <= y1; y++) T.fill(0, x0 + y * W, x1 + 1 + y * W);
  const seed = hashString(world.seed || 'pond') % 89, n = tier >= 7 ? 2 : 1, side = world.shoreSide;
  const axisX = deepAxisX(side), shifts = deepShifts(side), [W0, H0] = baseSize(world);
  const tr = Array.from({ length: n }, (_, k) => ({
    c: ex * (n === 1 ? 0.55 : 0.42 + 0.3 * k) + ex * 0.06 * (hash2(k, seed, 7) - 0.5),
    a1: ex * 0.05, f1: 0.0035 + 0.002 * hash2(k, seed, 9), p1: hash2(k, seed, 11) * TAU,
    a2: ex * 0.012, f2: 0.012, p2: hash2(k, seed, 13) * TAU, w: 9 + 5 * hash2(k, seed, 17),
  }));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0, p = x0 + y * W; x <= x1; x++, p++) {
      const a = axisX ? (shifts ? ex - x : x - (W0 - 1)) : (shifts ? ex - y : y - (H0 - 1));
      if (a < ex * 0.2) continue;
      const u = axisX ? y : x;
      let best = 0, lit = false;
      for (const t of tr) {
        const cc = t.c + t.a1 * Math.sin(u * t.f1 + t.p1) + t.a2 * Math.sin(u * t.f2 + t.p2), w = t.w * (0.8 + 0.2 * Math.sin(u * 0.02 + t.p2));
        const v = 1 - Math.abs(a - cc) / w;
        if (v > best) { best = v; lit = a < cc; }
      }
      if (best > 0) { T[p] = Math.round(best * 127) + (lit ? 128 : 0); if (best > 0.3) depth[p] = 255; }
    }
  }
}

// ---- up and down ----------------------------------------------------------------------------------------
// Where a swimmer heads, up or down, out over the deep: up at night, down by day; the big ones surge.
function deepZ(world, c, tz) {
  const d = depthAt(world, c.x, c.y);
  if (d < 0.25) return tz;
  const top = SURFACE_Z - 4, night = (world.darkness || 0) > 0.5, big = DEEP_PREDATORS.has(c.species) || (DEEP[c.species] && DEEP[c.species].mythic);
  if (big && Math.random() < 0.18) return top; // a surge toward the surface
  const rise = night ? rand(0.45, 1) : rand(0, 0.3);
  return lerp(c.zMin || 2, top, rise * Math.min(1, d * 1.3));
}
// The floor-crawlers of the deep (the kraken, the squids) lift off and rise now and then.
const RISERS = new Set(['kraken', 'vampire', 'squid']);
function updateVertical(world, dt) {
  for (const c of world.creatures) {
    if (!RISERS.has(c.species) || c.grabbed || c.dying) continue;
    c.riseT = (c.riseT ?? rand(10, 40)) - dt;
    if (c.riseT <= 0) {
      const up = !c.rising && depthAt(world, c.x, c.y) > 0.3;
      c.rising = up;
      c.riseZ = up ? rand(18, SURFACE_Z - 6) : 1.2;
      c.riseT = up ? rand(6, 14) : rand(20, 60);
    }
    const want = c.riseZ ?? 1.2;
    c.z += (want - c.z) * Math.min(1, dt * 0.5);
  }
}

// ---- islands out over the deep ----------------------------------------------------------------------------
// Raising land from the deep takes far more: up to six times the price over the deepest water.
const islandDeepCost = (d) => 1 + 5 * clamp(d || 0, 0, 1) ** 2;
