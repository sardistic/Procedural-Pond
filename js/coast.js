'use strict';
// The coast: a river down the beach, islands the tides and seasons reshape,
// litter that washes up on popular ponds (and the blights that follow), and
// what building out into the deep opens up.
//
//  - River: seeded from the pond, so it runs the same way every time the pond
//    regrows. It comes in from the landward edge and cuts across the beach into
//    the pond: wide in fresh water, middling with both, narrower in salt. It
//    widens and cuts deeper as the pond ages and deepens (and swells and shrinks
//    with the wet and dry seasons), its bends grow and creep downstream, and
//    every so often it breaks its banks and cuts a new course to the sea while
//    the old channel silts up. It keeps its channel wet at every tide, calms the
//    water at its mouth, freshens it (with both waters), brings nutrients
//    (plankton) and fresh plants, and fresh life likes it. All of it follows from
//    the pond's name and age, so it regrows the same way anywhere.
//  - Islands sit low, so high tides cover their rim and low tides bare a wide
//    beach. They swell and shrink over weeks of pond time (a slow cycle from
//    the island's seed), and can be raised in stacks (up to ten), each a terrace
//    higher, wider and lusher: a stepped mound. From the third, an island can go
//    one of two ways, growing a step with each level above the second:
//    lanterns of life (small lights, fireflies, comfort) or the whispering stone
//    (corruption and madness spreading from it).
//  - Litter: the more a pond is visited and the higher its score (and the
//    deeper it gets), the more rubbish washes up along the tide line: bottles,
//    cans, bags, ghost nets, tyres, leaking drums. It spoils the water around it
//    (comfort, plant growth), ghost nets snare small animals, and the dirtier
//    and busier the pond, the likelier a blight at dawn: an algal bloom (a red
//    tide in salt water) or a sickness in the most crowded species. Click litter
//    (with any tool) to haul it out; aerators make blights rarer.
//  - The deep: structures (and deep plants) placed in deep water raise how many
//    animals the pond can hold, draw deep life up more often, and in time bring
//    deep species within reach without paying to unlock them.

// ---- beach-local coordinates: d from the landward edge, u along the beach ---------------------------
function coastXY(world, d, u) {
  const s = world.shoreSide, W = world.W, H = world.H;
  return s === 0 ? [d, u] : s === 1 ? [W - 1 - d, u] : s === 2 ? [u, d] : [u, H - 1 - d];
}
const beachBand = (world) => { const [W0, H0] = world.expandPx ? baseSize(world) : [world.W, world.H]; return Math.min(W0, H0) * 0.22; };

// The part of the pond the sand and the river can change: the beach and the water off it.
function beachRect(world) {
  const { W, H } = world, side = world.shoreSide, reach = Math.ceil(beachBand(world) * 2.9 + 40);
  return side === 0 ? [0, 0, Math.min(W - 1, reach), H - 1] : side === 1 ? [Math.max(0, W - 1 - reach), 0, W - 1, H - 1]
    : side === 2 ? [0, 0, W - 1, Math.min(H - 1, reach)] : [0, Math.max(0, H - 1 - reach), W - 1, H - 1];
}

// ---- the river ------------------------------------------------------------------------------------
const RIVER_BASE = { fresh: 20, mixed: 16, salt: 13 }, RIVER_GROW = { fresh: 0.9, mixed: 0.7, salt: 0.55 }; // (a young pond's river runs wide; it grows wider still)
// How deep the river has cut its bed: 0 (new) to 1, with the pond's age and depth (it darkens the channel down its middle).
const riverDeepK = (world) => clamp(0.35 + riverDay(world) / 80 + ((world.erosion && world.erosion.e) || 0) / 40, 0, 1);
const RIVER_FOAM = mat('#6aa8b8', '#9ccad6', '#cce6ee', '#f4fcff');

// The pond's age as the river knows it: whole days, so it only reshapes at dawn.
const riverDay = (world) => Math.floor(world.days || 0) + 0.5;
// How much water it's carrying today: wet and dry seasons, and now and then a flood (a day or two
// of it running high, wide and fast) or a drought (down to a trickle), all from the pond's seed.
function riverFlow(world) {
  const days = riverDay(world), d = Math.floor(days), seed = hashString(`${world.seed}/flow`) % 997;
  const season = 1 + 0.3 * Math.sin(days / 17 * TAU + (hashString(`${world.seed}/season`) % 628) / 100);
  let event = 1, kind = null;
  for (let back = 0; back < 3; back++) {
    const h = hash2(d - back, seed, 71);
    if (h < 0.07 && back < 2) { event = 1.9 - 0.35 * back; kind = 'flood'; break; }
    if (h > 0.9) { event = 0.45 + 0.1 * back; kind = 'drought'; break; }
  }
  return { k: season * event, kind };
}
// How wide the river runs now: it grows as the pond ages and deepens, and with its flow (half-pixel steps).
function riverWidth(world) {
  const hab = world.opts.habitat || 'mixed', E = world.erosion, days = riverDay(world);
  const age = clamp((E ? E.e : 0) / 22 + days / 90, 0, 2.2);
  return Math.round(RIVER_BASE[hab] * (1 + RIVER_GROW[hab] * age) * clamp(riverFlow(world).k, 0.65, 2) * 2) / 2; // (a drought thins it, but not to a trickle)
}

// Each course the river takes (the first is the one it always had). It keeps one for a while, then
// breaks out: the new channel breaks through over the last days of the old, which then silts up.
const riverPeriod = (world) => 9 + 9 * ((hashString(`${world.seed}/period`) % 1000) / 1000);
// (A new course comes out of the same valley: its mouth wanders a little way either side of the first one's, so up
// the land it bends back into the valley gently, not in a long diagonal across the beach.)
function riverCourse(world, k) {
  const C = world.riverCourses && world.riverCourses.seed === world.seed ? world.riverCourses : (world.riverCourses = { seed: world.seed });
  const u0 = k === 0 ? 0 : riverCourse(world, 0).u;
  if (!C[k]) C[k] = withSeed(k === 0 ? `${world.seed}/river` : `${world.seed}/river/${k}`, () => ({
    u: k === 0 ? rand(0.2, 0.8) : clamp(u0 + (rand(0.2, 0.8) - 0.5) * 0.4, 0.12, 0.88), A: rand(6, 16), f: rand(0.035, 0.07), ph: rand(0, TAU), A2: rand(2, 6), f2: rand(0.12, 0.2), ph2: rand(0, TAU),
  }));
  return C[k];
}
// Where it is now: this course k, how far through it (f), and whether the next is breaking through or the last silting up.
function riverState(world) {
  const T = riverDay(world) / riverPeriod(world), k = Math.floor(T), f = T - k;
  return { k, f, next: f > 0.82 ? (f - 0.82) / 0.18 : 0, old: k > 0 && f < 0.35 ? 1 - f / 0.35 : 0 };
}
// The middle of a course at distance d from the landward edge: its bends grow with age and creep downstream.
function riverCenter(world, C, d) {
  const along = world.shoreSide < 2 ? world.H : world.W, days = riverDay(world), grow = 1 + 0.7 * clamp(days / 60, 0, 1);
  return C.u * along + C.A * grow * Math.sin(d * C.f + C.ph - days * 0.07) + C.A2 * Math.sin(d * C.f2 + C.ph2 - days * 0.11);
}

// Cut the channel into the beach (called from applyShoreEdits, after the sand and before islands).
function applyRiver(world) {
  const shore = world.shore;
  world.river = null;
  if (!shore || world.riverOff) return;
  const hab = world.opts.habitat || 'mixed', band = beachBand(world), reach = band * 1.35 + 30;
  const w = world.riverW || (world.riverW = riverWidth(world));
  // The bed sits below the lowest tide (so it's always wet), deeper as it widens, and deeper still
  // down its middle the longer it has run this course.
  const R = riverState(world);
  const bed = Math.round(clamp(0.13 - 0.05 * (w / RIVER_BASE[hab] - 1) - 0.04 * R.f, 0.01, 0.13) * 255);
  // The inland water (the channels up the beach), so the surf breaks at the sea and not in them.
  const [mx0, my0, mx1, my1] = beachRect(world), M = { x0: mx0, y0: my0, w: mx1 - mx0 + 1, h: my1 - my0 + 1 };
  M.data = new Uint8Array(M.w * M.h);
  M.deep = new Uint8Array(M.w * M.h); // (the channel: toward its middle, fading out at the mouth; the renderer paints it as river)
  const mouthD = band * 0.95;
  // (top: where a channel that isn't the river's own now begins: an old one silting up from its head down, a new one
  // not yet through; it tapers in from there, so nothing ends in a straight cut at the top of the beach.)
  const cut = (C, width, bedAt, keep, deepAt = 0, top = 0) => {
    const pts = [];
    for (let d = 0; d <= reach; d++) {
      const uc = riverCenter(world, C, d), half = width / 2 * (0.8 + 0.5 * Math.min(1, d / (band * 1.35))) * (top ? smoothstep(top, top + 18, d) : 1); // it spreads toward the mouth
      if (half < 0.3) { if (keep && d % 3 === 0) pts.push(coastXY(world, d, uc)); continue; }
      const fade = clamp((mouthD * 1.25 - d) / (mouthD * 0.5), 0, 1); // (its depth fades out as it opens into the sea)
      for (let u = Math.floor(uc - half - 3); u <= Math.ceil(uc + half + 3); u++) {
        const [x, y] = coastXY(world, d, u);
        if (x < 0 || y < 0 || x >= world.W || y >= world.H) continue;
        const p = x + y * world.W, dist = Math.abs(u - uc);
        // (A deeper line down the middle: the channel's floor dips toward its centre.)
        const v = dist <= half ? Math.round(bedAt * (0.55 + 0.45 * (dist / Math.max(1, half)) ** 2)) : Math.round(lerp(bedAt, shore[p], clamp((dist - half) / 3, 0, 1)));
        if (v < shore[p]) shore[p] = v;
        if (x >= M.x0 && y >= M.y0 && x < M.x0 + M.w && y < M.y0 + M.h) {
          const q = (x - M.x0) + (y - M.y0) * M.w;
          if (d < mouthD) M.data[q] = 1;
          if (deepAt && dist < half) { const e = Math.max(0.02, 1 - (dist / half) ** 2), dv = Math.round(255 * deepAt * e * fade); if (dv > M.deep[q]) M.deep[q] = dv; }
        }
      }
      if (keep && d % 3 === 0) pts.push(coastXY(world, d, uc));
    }
    return pts;
  };
  // Old courses linger as creeks, silting up slowly over the next few courses (the last one fastest to go).
  for (let back = 3; back >= 1; back--) {
    if (R.k - back < 0) continue;
    const age = (back - 1 + R.f) / 3; // 0: just left, 1: gone
    if (age >= 1) continue;
    cut(riverCourse(world, R.k - back), w * (0.85 - 0.6 * age), Math.round(lerp(bed + 12, 0.46 * 255, age)), false, 0.3 * (1 - age), band * (0.18 + 0.45 * age));
  }
  // The new one breaking through: a thin shallow channel, cutting deeper.
  if (R.next > 0) cut(riverCourse(world, R.k + 1), w * (0.25 + 0.5 * R.next), Math.round(lerp(0.36 * 255, bed + 8, R.next)), false, 0.3 * R.next, Math.max(6, band * 0.35 * (1 - R.next)));
  const pts = cut(riverCourse(world, R.k), w, bed, true, 1);
  world.riverMask = M;
  const mi = Math.min(pts.length - 1, Math.round(band * 0.95 / 3)), mouth = pts[mi];
  const flow = riverFlow(world);
  world.river = { pts: pts.slice(0, mi + 1), w, mouth, spot: { x: mouth[0], y: mouth[1], r: 8 + w }, k: R.k, flow: flow.k, event: flow.kind };
}

// Flow: flecks of foam riding the current down the channel.
function drawRiver(r, world, t) {
  const R = world.river;
  if (!R || R.pts.length < 2) return;
  const pts = R.pts, n = pts.length, flow = R.flow || 1, flecks = Math.round(n * (1.2 + R.w / 8) * clamp(flow, 0.4, 1.8));
  r.castShadows = false;
  for (let k = 0; k < flecks; k++) {
    const s = (k / flecks + t * (0.018 + 0.004 * R.w) * clamp(flow, 0.5, 2.2) * (1 + hash2(k, 3, 5) * 0.5)) % 1, fi = s * (n - 1), i = fi | 0, f = fi - i;
    const a = pts[i], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
    const off = (hash2(k, 7, 3) - 0.5) * R.w * 0.8;
    r.dot(lerp(a[0], b[0], f) - dy / dl * off, lerp(a[1], b[1], f) + dx / dl * off, SURFACE_Z - 1, RIVER_FOAM, FX_ID);
  }
  r.castShadows = true;
}

// The river's pull on the water: calmer at the mouth and, with both waters, fresher.
function riverZones(world, put, tA, infl) {
  const R = world.river;
  if (!R) return;
  const [mx, my] = R.mouth, k = Math.min(3, R.w / 8);
  put(tA, mx, my, -0.07 * k);
  if (world.opts.habitat === 'mixed') {
    put(infl, mx, my, -1.4 * k);
    const up = R.pts[Math.floor(R.pts.length * 0.6)];
    if (up) put(infl, up[0], up[1], -0.8 * k);
  }
}

// ---- islands ----------------------------------------------------------------------------------------
// Size swings slowly over the days (from the island's own seed; less in fresh
// water), and each stack raises and widens it.
function islandSand(world, s) {
  const d = Math.floor(world.days || 0), p1 = (s.seed % 1000) / 1000 * TAU, p2 = ((s.seed >> 10) % 1000) / 1000 * TAU;
  const k = world.opts.habitat === 'fresh' ? 0.5 : 1;
  return 1 + k * (0.16 * Math.sin(TAU * d / 23 + p1) + 0.07 * Math.sin(TAU * d / 7.3 + p2));
}
// Levels request more width; isles.js eases that request into the available water.
const islandGrow = (stack = 1) => 1 + 0.16 * Math.min(stack - 1, 4) + 0.12 * Math.max(0, stack - 5);
function islandRadius(world, s) {
  const raw = s.R * islandGrow(s.stack || 1) * islandSand(world, s) * ((s.ig && s.ig.sz) || 1);
  const radius = typeof islandGrowthRadius === 'function' ? islandGrowthRadius(world, s, raw) : raw;
  s.terrRadius = radius; // the raised ground and the stamped beach must share a footprint
  return radius;
}
// The terraces of a raised island, one per level above the first, from the widest up:
// [x offset, y offset, radius, tilt, height of its top]. Each raised shelf is
// tall enough to cast a distinct edge while leaving the island's beach visible.
const TERRACE_STEP = 1.15;
function islandTerraces(s) {
  const n = (s.stack || 1) - 1;
  const R = s.terrRadius || s.R * islandGrow(n + 1);
  if (s.terr && s.terr.n === n && s.terr.r === R) return s.terr.list;
  const list = [];
  for (let L = 1; L <= n; L++) {
    const f = 1 - L / (n + 1.4), rr = R * 0.9 * f;
    list.push([(hash2(L, s.seed % 97, 3) - 0.5) * rr * 0.25, (hash2(L, s.seed % 89, 7) - 0.5) * rr * 0.25, rr, hash2(L, 13, s.seed % 83) * PI, L * TERRACE_STEP]);
  }
  s.terr = { n, r: R, list };
  return list;
}
// How high the ground stands at a point on the island (offsets from its centre).
function islandTopAt(s, ox, oy) {
  let z = 0;
  for (const [tx, ty, rr, , top] of islandTerraces(s)) if ((ox - tx) ** 2 + (oy - ty) ** 2 < rr * rr * 0.9) z = top;
  return z;
}

function applyIslands(world) {
  const shore = world.shore, { W, H } = world;
  const islands = (world.structures || []).filter((s) => s.kind === 'island' && !s.anim);
  // Keep the island's footprint alongside the height map. The floor bake can
  // then paint its exposed shore as sand, even on a pond with a dark floor.
  const ground = islands.length ? new Uint16Array(W * H) : null;
  world.islandGround = ground;
  world.islandGroundIsles = islands;
  world.islandGroundSands = islands.map((s) => typeof isleLook === 'function' ? isleLook(s).sand : SM.sand);
  for (let k = 0; k < islands.length; k++) {
    const s = islands[k];
    // (Its shape is worked out once, as a stamp round its middle, and laid on the beach each time the beach is
    // made: only when the island itself changes (its size, its shape, its reef, the depth under it) is it redone.)
    const st = islandStamp(world, s), x0 = Math.round(s.x) - st.r, y0 = Math.round(s.y) - st.r, n = st.n;
    for (let j = Math.max(0, -y0); j < n && y0 + j < H; j++) {
      const row = j * n, yy = (y0 + j) * W;
      for (let i = Math.max(0, -x0); i < n && x0 + i < W; i++) { const v = st.v[row + i]; if (v) { const q = yy + x0 + i; if (v > shore[q]) { shore[q] = v; ground[q] = k + 1; } } }
    }
  }
  if (typeof applyIsleBars === 'function') applyIsleBars(world); // (islands close together grow a bar between them: land.js)
}
// The stamp owner at a point, used for landing room and for plants caught by a growing island.
function islandAt(world, x, y) {
  if (!world.islandGround) return null;
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= world.W || yi >= world.H) return null;
  return world.islandGroundIsles[world.islandGround[xi + yi * world.W] - 1] || null;
}

// Frogs, turtles and crabs use an island's beach, but a small cay cannot hold
// the pond's whole population. Snails and starfish stay on the wet flats.
const ISLAND_LANDERS = new Set(['frog', 'turtle', 'crab']);
function islandLandingRoom(world, x, y, c) {
  const s = islandAt(world, x, y);
  if (!s || shoreAt(world, x, y) <= world.tide.level + 0.015) return true;
  if (!ISLAND_LANDERS.has(c.species)) return false;
  const cap = Math.max(3, Math.floor(islandRadius(world, s) / 9));
  let here = 0;
  for (const other of world.creatures || []) {
    if (!other.life || other.leaving || other.dying || !ISLAND_LANDERS.has(other.species) || !isDry(world, other.x, other.y)) continue;
    if (islandAt(world, other.x, other.y) === s && ++here >= cap) return false;
  }
  return true;
}
// An island's shape as heights round its middle. Its shape is its kind's (isles.js isleForm): stretched along the
// current, ragged or smooth, with a bay, its coastline wandering as it ages and pushed out where lava has run; out
// over the deep it rises as a cliff. Round it lie flats that the tide covers at high water and bares at low (none
// where the water is deep), so it changes shape through the day; and its barrier reef, once it has risen.
function islandStamp(world, s) {
  const R0 = islandRadius(world, s), F = typeof isleForm === 'function' ? isleForm(world, s) : null, lobed = !!(s.ig && s.ig.lob) && typeof isleLobe === 'function';
  const deepHere = Math.round(depthAt(world, s.x, s.y) * 20);
  const key = [R0.toFixed(2), typeof isleShapeKey === 'function' ? isleShapeKey(s) : '', s.stack || 1, s.deep || 0, F ? F.ang.toFixed(2) : '-', deepHere, world.opts.habitat].join('|');
  if (s.stamp && s.stamp.key === key) return s.stamp;
  const bar = (s.ig && s.ig.bar) || 0, reachK = Math.max(F ? isleReachK(world, s, F) : 1.4 * (lobed ? 1.22 : 1), bar ? 2.35 : 0), r = Math.ceil(R0 * reachK) + 2, n = 2 * r + 1;
  const top = Math.min(1.5, 0.97 + 0.06 * ((s.stack || 1) - 1)), cliff = 2 + (F ? F.cliff : 8 * (s.deep || 0)), v = new Uint8Array(n * n);
  // (Its coast and its flats, along 256 bearings.)
  const NB = 256, OUT = new Float32Array(NB), FL = new Float32Array(NB), dm = world.depth, cx = Math.round(s.x), cy = Math.round(s.y), seed = s.seed % 997;
  for (let k = 0; k < NB; k++) { const a = k / NB * TAU - PI; OUT[k] = F ? isleOutline(world, s, a, F) : lobed ? isleLobe(s, a) : 1; FL[k] = F ? isleFlatsAt(F, a) : 0; }
  const rc0 = R0 * 1.75, rc1 = R0 * 2.15, crest = 0.3 + 0.16 * bar, mid = (rc0 + rc1) / 2, half = (rc1 - rc0) / 2;
  for (let j = 0; j < n; j++) {
    const dy = j - r, wy = cy + dy;
    for (let i = 0; i < n; i++) {
      const dx = i - r, dist = Math.hypot(dx, dy);
      if (dist > r) continue;
      const a = Math.atan2(dy, dx), bi = (((a + PI) / TAU * NB) | 0) & (NB - 1), d = dist / R0 / OUT[bi], wx = cx + dx;
      let e = d < 1.4 ? top * (1 - (d / 1.4) ** cliff) : 0;
      const fl = FL[bi];
      if (fl > 0.02 && d > 0.8 && d < 1 + fl) {
        const t = (d - 1) / fl, dp = dm && wx >= 0 && wy >= 0 && wx < world.W && wy < world.H ? dm[wx + wy * world.W] / 255 : 0, k = clamp(1 - dp * 4, 0, 1);
        const shelf = F.flatZ * k * (1 - smoothstep(0.5, 1, Math.max(0, t))) * (0.8 + 0.35 * fbm(dx * 0.06 + seed, dy * 0.06, 61));
        if (shelf > e) e = shelf;
      }
      if (e > 0) e += (fbm(dx * 0.08 + seed, dy * 0.08, 53) - 0.5) * 0.25;
      // The barrier reef: a ring offshore, rising over the days until its crest bares at low tide (a pass or two through it).
      if (bar) {
        const dd = dist / OUT[bi], t = 1 - Math.abs(dd - mid) / (half + 2);
        if (t > 0) { const pass = Math.sin(a * 3 + (s.seed % 17)) > 0.93, rv = crest * Math.min(1, t * 1.6) * (pass ? 0.45 : 1) * (0.9 + 0.2 * fbm(dx * 0.1 + seed, dy * 0.1, 7)); if (rv > e) e = rv; }
      }
      if (e > 0) v[j * n + i] = Math.round(clamp(e, 0, 1) * 255);
    }
  }
  return (s.stamp = { key, r, n, v });
}

// Island lights (the life branch): little lanterns and glowing caps that come on at dusk.
const LANTERN = mat('#8a6a1a', '#d0a030', '#ffd870', '#fff8d0'), RUNE = mat('#0a4a2a', '#1a8a4a', '#3af08a', '#c0ffd8');
function drawIslandLife(r, s, t, world) {
  if (s.branch === 'life') {
    const n = 4 + 3 * (s.blv || 1), R = islandRadius(world, s) * 0.8, on = world.darkness > 0.3;
    if (s.lampId == null) { s.lampId = newId(hexToInt('#2a1a04')); EMISSIVE[s.lampId] = 2; }
    for (let k = 0; k < n; k++) {
      const a = hash2(k, s.seed % 97, 11) * TAU, d = (0.35 + 0.6 * hash2(k, 5, s.seed % 89)) * R;
      if (!on && k % 2) continue;
      const flick = on ? 0.5 + 0.5 * Math.sin(t * (2 + k * 0.3) + k) : 0, ox = Math.cos(a) * d, oy = Math.sin(a) * d;
      r.dot(s.x + ox, s.y + oy, 3 + flick + islandTopAt(s, ox, oy), on ? LANTERN : SM.egg, s.lampId);
    }
  } else if (s.branch === 'dark') {
    if (s.runeId == null) { s.runeId = newId(hexToInt('#020806')); EMISSIVE[s.runeId] = 2; }
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.3), h = 14 + 4 * (s.blv || 1), z0 = islandTopAt(s, 0, -0.5);
    for (let k = 0; k < 5; k++) if (Math.sin(t * 2 + k * 1.7) > -0.3 * pulse) r.dot(s.x + (k % 2 ? 0.8 : -0.8), s.y - 0.5, z0 + 3 + k * h / 6, RUNE, s.runeId);
    if (world.darkness > 0.35) {
      const R = islandRadius(world, s) * 1.5;
      for (let k = 0; k < 16; k++) {
        if ((k + Math.floor(t * 2)) % 3 === 0) continue;
        const a = k / 16 * TAU - t * 0.15;
        r.dot(s.x + Math.cos(a) * R, s.y + Math.sin(a) * R, 1, ELD_SIGIL, s.runeId);
      }
    }
  }
}

DRAW.island = drawIslandLife;
// Fresh life likes the river mouth; crabs forage along it.
for (const k of ['koi', 'tetra', 'frog', 'duck', 'turtle', 'axolotl', 'snail', 'crab', 'catfish']) LIKES[k] = [...(LIKES[k] || []), 'river'];
LIKE_LABEL.river = 'the river mouth';

// ---- litter -----------------------------------------------------------------------------------------
const LITTER = {
  bottle: { w: 3, harm: 0.05, r: 28, hp: 1, label: 'a bottle' },
  can: { w: 3, harm: 0.04, r: 24, hp: 1, label: 'a can' },
  bag: { w: 2, harm: 0.07, r: 30, hp: 1, label: 'a plastic bag', floats: true },
  net: { w: 1.2, harm: 0.1, r: 34, hp: 2, label: 'a ghost net', floats: true },
  tire: { w: 1, harm: 0.09, r: 30, hp: 2, label: 'a tyre' },
  drum: { w: 0.5, harm: 0.22, r: 56, hp: 3, label: 'a leaking oil drum' },
};
const LITTER_CODES = ['bottle', 'can', 'bag', 'net', 'tire', 'drum']; // append-only (links)
const LM = {
  glass: mat('#0e3a1a', '#1a6a2e', '#3aa050', '#9ae0a8'), brown: mat('#2a1406', '#4a2a0e', '#6e4418', '#a07038'),
  tin: mat('#5a1010', '#a02020', '#d84040', '#f4a0a0'), steel: mat('#3a3e44', '#6a707a', '#a0a8b2', '#e0e6ee'),
  bag: mat('#8a9098', '#b8c0c8', '#dee4ea', '#ffffff'), net: mat('#0e2a2a', '#1a4a44', '#2e6e62', '#4e9a86'),
  rubber: mat('#060606', '#101012', '#1c1c20', '#2e2e34'), drum: mat('#1a2a5a', '#2a44a0', '#3a64d0', '#7aa0f0'),
  rust: mat('#3a1a06', '#6a320e', '#9a5018', '#c07a38'), oil: mat('#2a0a3a', '#1a4a6a', '#6a3a8a', '#d0a0ff'),
};

class Litter {
  constructor(k, x, y, born, hp = LITTER[k].hp, seed = newSeed()) {
    this.k = k; this.x = x; this.y = y; this.born = born; this.hp = hp; this.seed = seed;
    this.ang = hash2(seed % 997, 1, 9) * TAU;
    this.id = newId(outlineOf(LM.rubber));
  }

  draw(r, t, world) {
    const { x, y, ang, id, k } = this, ca = Math.cos(ang), sa = Math.sin(ang);
    const wet = !isDry(world, x, y), bob = wet && LITTER[k].floats ? Math.sin(t * 1.5 + this.seed) * 0.6 : 0;
    const z = wet && LITTER[k].floats ? SURFACE_Z - 3 + bob : wet ? 0.5 : 0.8;
    if (k === 'bottle') {
      const m = this.seed % 2 ? LM.glass : LM.brown;
      r.tube(x - ca * 3, y - sa * 3, 1.3, z, x + ca * 1.5, y + sa * 1.5, 1.3, z, 0.9, m, id);
      r.tube(x + ca * 1.5, y + sa * 1.5, 1.1, z, x + ca * 3.5, y + sa * 3.5, 0.55, z, 0.9, m, id);
    } else if (k === 'can') {
      r.tube(x - ca * 1.6, y - sa * 1.6, 1.2, z, x + ca * 1.6, y + sa * 1.6, 1.2, z, 0.9, (u) => (u < 0.15 || u > 0.85 ? LM.steel : LM.tin), id);
    } else if (k === 'bag') {
      r.alpha = 0.75;
      r.ellipsoid(x, y, 3.4, 2.4, ang + Math.sin(t * 0.7 + this.seed) * 0.3, z, 1, (lx, ly) => (hash2((lx * 4) | 0, (ly * 4) | 0, 3) < 0.2 ? null : LM.bag), id);
      r.alpha = 1;
    } else if (k === 'net') {
      for (let i = -3; i <= 3; i++) {
        r.tube(x - ca * 7 - sa * i * 2, y - sa * 7 + ca * i * 2, 0.35, z, x + ca * 7 - sa * i * 2, y + sa * 7 + ca * i * 2, 0.35, z + 0.2, 0.6, LM.net, id);
        r.tube(x + ca * i * 2 - sa * 6, y + sa * i * 2 + ca * 6, 0.35, z, x + ca * i * 2 + sa * 6, y + sa * i * 2 - ca * 6, 0.35, z + 0.2, 0.6, LM.net, id);
      }
    } else if (k === 'tire') {
      for (let i = 0; i < 10; i++) {
        const a0 = i / 10 * TAU, a1 = (i + 1) / 10 * TAU;
        r.tube(x + Math.cos(a0) * 4, y + Math.sin(a0) * 3.4, 1.6, z, x + Math.cos(a1) * 4, y + Math.sin(a1) * 3.4, 1.6, z, 1, LM.rubber, id);
      }
    } else if (k === 'drum') {
      r.tube(x - ca * 4, y - sa * 4, 3, z + 1, x + ca * 4, y + sa * 4, 3, z + 1, 1, (u, v) => (hash2((u * 9) | 0, (v * 5) | 0, this.seed % 31) < 0.3 ? LM.rust : LM.drum), id);
      // The sheen of oil spreading on the water around it.
      if (wet || world.tide.level > shoreAt(world, x, y) - 0.1) {
        r.castShadows = false;
        for (let i = 0; i < 18; i++) {
          const a = hash2(i, this.seed % 53, 2) * TAU + t * 0.05, d = 6 + hash2(i, 9, this.seed % 41) * 16;
          r.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, SURFACE_Z - 2, LM.oil, FX_ID);
        }
        r.castShadows = true;
      }
    }
  }

  hit(px, py) { return (px - this.x) ** 2 + (py - this.y) ** 2 < (this.k === 'net' || this.k === 'drum' ? 64 : 30); }
}

// How much a pond draws litter: its score (on a log curve), how many people come to see it, and its depth.
function litterPressure(world) {
  const G = world.game || {};
  return 0.2 * Math.log10(1 + (G.points || 0) / 1000) + 0.6 * Math.log10(1 + (G.views || 0)) + 0.08 * ((world.erosion && world.erosion.tier) || 0);
}

// How spoiled the water is here (0 clean .. 1 fouled).
function pollutionAt(world, x, y) {
  let v = typeof oilAt === 'function' ? oilAt(world, x, y) : 0; // (oil from the rigs, too)
  for (const l of world.litter || []) {
    const L = LITTER[l.k], d = Math.hypot(l.x - x, l.y - y);
    if (d < L.r) v += L.harm * 3 * (1 - d / L.r);
  }
  return Math.min(1, v);
}

function washUp(world) {
  if (!world.shore || world.litter.length >= 20) return;
  const total = LITTER_CODES.reduce((a, k) => a + LITTER[k].w, 0);
  let r = Math.random() * total, k = 'bottle';
  for (const key of LITTER_CODES) if ((r -= LITTER[key].w) <= 0) { k = key; break; }
  const tide = world.tide.level, wet = LITTER[k].floats && Math.random() < 0.4, reach = 0.15 + 0.15 * (1 - world.tide.range); // (a wider strand where tides barely move)
  for (let i = 0; i < 100; i++) {
    const x = rand(10, world.W - 10), y = rand(10, world.H - 10), e = shoreAt(world, x, y);
    if (wet ? e > tide - 0.05 || e < tide - 0.35 : e < tide - 0.02 || e > tide + reach) continue; // the wrack line (or just off it)
    world.litter.push(new Litter(k, x, y, world.days));
    logEvent(world, `The tide left ${LITTER[k].label} on the beach`, null, {
      cat: 'pond', pri: k === 'drum' ? 2 : 0, key: 'litter', data: LITTER[k].label, merge: (e) => `The tide left litter on the beach: ${tally(e.data)}`,
    });
    return;
  }
}

const litterAt = (world, x, y) => (world.litter || []).find((l) => l.hit(x, y));

function haulLitter(world, l) {
  l.hp--;
  addRipple(world, l.x, l.y, 0.6);
  if (l.hp > 0) { floatAward(l.x, l.y, 'heave…'); return; }
  world.litter.splice(world.litter.indexOf(l), 1);
  const got = award(world, l.k === 'drum' ? 4 : l.k === 'net' || l.k === 'tire' ? 2 : 1, 'clearing litter', null, { flat: true, quiet: true });
  floatAward(l.x, l.y, `+${got}`);
  logEvent(world, `Cleared ${LITTER[l.k].label} from the pond`, null, {
    cat: 'pond', pri: 0, key: 'cleared', data: LITTER[l.k].label, merge: (e) => `Cleared litter from the pond: ${tally(e.data)}`,
  });
}

// ---- blights ----------------------------------------------------------------------------------------
const BLIGHTS = {
  bloom: { label: (w) => (w.opts.habitat === 'fresh' ? 'an algal bloom' : 'a red tide'), comfort: 0.25 },
  sickness: { label: () => 'a sickness', comfort: 0.15 },
};
const BLIGHT_CODES = [null, 'bloom', 'sickness'];
const BLOOM_TINT = { fresh: hexToInt('#3a7a1a'), salt: hexToInt('#8a2a1a'), mixed: hexToInt('#6a4a1a') };

function blightRisk(world) {
  const aer = (world.structures || []).filter((s) => s.kind === 'aerator').length;
  return clamp(0.02 + 0.06 * litterPressure(world) * (0.4 + 2 * (world.pollution || 0)), 0, 0.45) * 0.7 ** Math.min(3, aer);
}

function startBlight(world) {
  const counts = {};
  for (const c of world.creatures) if (c.life && !c.leaving) counts[c.species] = (counts[c.species] || 0) + 1;
  const crowded = Object.entries(counts).filter(([, n]) => n >= 6).sort((a, b) => b[1] - a[1])[0];
  const k = !crowded || (world.pollution || 0) > 0.2 || Math.random() < 0.6 ? 'bloom' : 'sickness';
  world.blight = { k, until: world.days + rand(0.5, 1.2), sp: k === 'sickness' ? crowded[0] : null };
  const what = BLIGHTS[k].label(world);
  logEvent(world, `⚠ ${capFirst(what)} has come${k === 'sickness' ? ` over the ${plural(SINGULAR[crowded[0]] || crowded[0], 2).toLowerCase()}` : ' into the pond: the water is choked and weak animals are dying'}. Clearing litter and building aerators make these rarer`, null, { cat: 'rare', pri: 3 });
}

function blightStep(world) {
  const B = world.blight;
  if (!B) return;
  if (world.days > B.until) {
    logEvent(world, `The ${BLIGHTS[B.k].label(world).replace(/^an? /, '')} has passed`, null, { cat: 'pond', pri: 2 });
    world.blight = null;
    return;
  }
  for (const c of world.creatures) {
    const L = c.life;
    if (!L || c.dying || c.leaving || c.absorbing || (typeof lastFew === 'function' && lastFew(world, c))) continue;
    if (B.k === 'bloom' ? (L.energy < 0.35 || L.age > L.lifespan * 0.85) && Math.random() < 0.002 : c.species === B.sp && Math.random() < 0.0015) {
      c.dying = { t: 0, why: B.k === 'bloom' ? `choked in the ${BLIGHTS.bloom.label(world).replace(/^an? /, '')}` : 'of sickness' };
    }
  }
  if (B.k === 'bloom' && Math.random() < 0.3) {
    for (let i = 0; i < 8; i++) {
      const x = rand(10, world.W - 10), y = rand(10, world.H - 10);
      if (typeof aquaticFoodRoom === 'function' && !aquaticFoodRoom(world, x, y)) continue;
      world.food.push(new Food(x, y, rand(4, 30), 'plankton'));
      break;
    }
  }
}

// How much a blight weighs on an animal's comfort.
const blightComfort = (world, c) => (!world.blight ? 0 : world.blight.k === 'bloom' || c.species === world.blight.sp ? BLIGHTS[world.blight.k].comfort : 0);

// ---- the deep, built out ----------------------------------------------------------------------------
// How much has been placed in deep water, at or below a given depth.
function deepPlacedAt(world, min = 0.15) {
  let n = 0;
  for (const s of world.structures || []) { const d = depthAt(world, s.x, s.y); if (d >= min) n += d * (STRUCTURES[s.kind].tier ? 1.5 : 1); }
  for (const p of world.plants) if (p.born != null) { const d = depthAt(world, p.x, p.y); if (d >= Math.max(min, 0.3)) n += d * 0.25; }
  return n;
}

function dawnDeep(world) {
  world.deepPlaced = deepPlacedAt(world);
  world.maxPopBonus = Math.round(6 * world.deepPlaced);
  if (world.maxPopBase) world.maxPop = world.maxPopBase + world.maxPopBonus;
  // Deep species come within reach on their own once enough is built deep enough for them.
  const G = world.game, E = world.erosion;
  if (!G || !E) return;
  const drawn = [];
  for (const [k, D] of Object.entries(DEEP)) {
    if ((G.unlocked || []).includes(k) || D.tier > E.tier || !fitsHabitat(world, D.branch)) continue;
    if (typeof DESIGNS !== 'undefined' && DESIGNS[k] && !D.deepMin) continue; // (the reef's and the pond's own aren't drawn by the deep)
    const need = D.mythic ? 5 : 0.8 + 0.7 * (D.tier - 1);
    if (deepPlacedAt(world, Math.max(0.15, D.deepMin)) < need) continue;
    G.unlocked = [...(G.unlocked || []), k];
    drawn.push(plural(SINGULAR[k] || k, 2).toLowerCase());
  }
  if (drawn.length) {
    const who = drawn.length > 1 ? `${drawn.slice(0, -1).join(', ')} and ${drawn[drawn.length - 1]}` : drawn[0];
    logEvent(world, `✦ What you've built in the deep has drawn ${who} closer: you can spawn them now, free of the unlock`, null, { cat: 'rare', pri: 3 });
  }
}

// ---- the tick ---------------------------------------------------------------------------------------
let coastTick = 0;
function updateCoast(world, dt) {
  if (!world.litter) world.litter = [];
  coastTick -= dt;
  if (coastTick > 0) return;
  const step = 1 - coastTick;
  coastTick = 1;
  let harm = 0;
  for (const l of world.litter) harm += LITTER[l.k].harm;
  world.pollution = Math.min(1, harm * 1.2);
  // Litter washes up with the pressure on the pond, more in big surf.
  if (world.opts.life !== false && world.shore) {
    const perDay = litterPressure(world) * (0.3 + 0.5 * world.tide.surf);
    if (Math.random() < perDay * step / world.opts.dayLength) washUp(world);
  }
  // Ghost nets snare small animals swimming through them.
  for (const l of world.litter) {
    if (l.k !== 'net' || isDry(world, l.x, l.y)) continue;
    for (const c of world.creatures) {
      if (!c.life || c.dying || c.leaving || (c.x - l.x) ** 2 + (c.y - l.y) ** 2 > 64) continue;
      if ((isPrey(c) || c.life.scale < 0.8) && Math.random() < 0.015) c.dying = { t: 0, why: 'tangled in a ghost net' };
    }
  }
  blightStep(world);
  plantTraitTick(world);
  // The river feeds the water at its mouth.
  const R = world.river;
  if (R && Math.random() < 0.15 * Math.min(3, R.w / 8)) {
    const [mx, my] = R.mouth;
    for (let i = 0; i < 8; i++) {
      const x = mx + rand(-R.w, R.w), y = my + rand(-R.w, R.w);
      if (typeof aquaticFoodRoom === 'function' && !aquaticFoodRoom(world, x, y)) continue;
      world.food.push(new Food(x, y, rand(4, 26), 'plankton'));
      break;
    }
  }
  // Islands gone dark spread madness and corruption; islands of life keep fireflies about at night.
  for (const s of world.structures || []) {
    if (s.kind !== 'island' || !s.branch) continue;
    const R2 = (islandRadius(world, s) * (1.6 + 0.3 * Math.min(3, s.blv || 1) + 0.12 * Math.max(0, (s.blv || 1) - 3))) ** 2;
    if (s.branch === 'dark') {
      if (typeof gainCorruption === 'function') gainCorruption(world, 0.03 * (s.blv || 1) * step, null, { quiet: true });
      for (const c of world.creatures) {
        if (!c.life || c.life.genome.eld || (c.x - s.x) ** 2 + (c.y - s.y) ** 2 > R2) continue;
        c.life.comfort = Math.max(0, c.life.comfort - 0.03);
        if (Math.random() < 0.03 * (s.blv || 1)) c.maddened = 2;
      }
    } else if (world.darkness > 0.5) {
      const near = world.creatures.filter((c) => c.species === 'firefly' && (c.x - s.x) ** 2 + (c.y - s.y) ** 2 < R2).length;
      if (near < 3 * (s.blv || 1) && Math.random() < 0.3) {
        const f = new Firefly(world, s.x + rand(-20, 20), s.y + rand(-20, 20));
        f.alpha = 0;
        world.creatures.push(f);
      }
    }
  }
}

// Each dawn: blights may come; the river and islands are reshaped; the deep is counted.
function dawnCoast(world) {
  if (!world.blight && world.opts.life !== false && Math.random() < blightRisk(world)) startBlight(world);
  const islandRects = []; // (islands swell and shrink a little day to day: only round them is redrawn)
  if (world.shore) {
    const w = riverWidth(world), R = riverState(world), was = world.riverAt, flow = riverFlow(world);
    if (flow.kind === 'flood' && (!was || was.event !== 'flood') && !world.riverOff) logEvent(world, '✦ The river is in flood: running high, wide and fast, and carrying the land down to the sea', null, { cat: 'pond', pri: 2 });
    else if (flow.kind === 'drought' && (!was || was.event !== 'drought') && !world.riverOff) logEvent(world, 'A drought: the river has dropped to a trickle', null, { cat: 'pond', pri: 1 });
    else if (world.riverW && w > world.riverW + 0.25) logEvent(world, `The river has cut its channel wider${w > (world.riverW || 0) + 1 ? ' and deeper' : ''}`, null, { cat: 'pond', pri: 0, key: 'river-wide' });
    else if (world.riverW && w < world.riverW - 0.75) logEvent(world, 'The dry season: the river runs lower and narrower', null, { cat: 'pond', pri: 0, key: 'river-dry' });
    if (was && R.k > was.k && !world.riverOff) {
      logEvent(world, '✦ The river has broken its banks and cut a new course to the sea; its old channel lingers as a creek, silting up', null, { cat: 'pond', pri: 3 });
      if (typeof narrate === 'function') narrate(world, 'river');
    } else if (was && R.next > 0 && !was.next && !world.riverOff) logEvent(world, 'The river is breaking through its bank: a new channel is opening beside the old', null, { cat: 'pond', pri: 2 });
    world.riverAt = { k: R.k, next: R.next, event: flow.kind };
    if (w !== world.riverW) world.riverW = w;
    world.beachDaily = true; // (the bends creep and the sand moves a little every day: see below)
    const islands = (world.structures || []).filter((s) => s.kind === 'island');
    const key = islands.map((s) => islandRadius(world, s).toFixed(1) + (typeof isleShapeKey === 'function' ? isleShapeKey(s) : '')).join();
    if (islands.length && world.islandKey != null && key !== world.islandKey) {
      const grew = islands.reduce((a, s) => a + islandRadius(world, s) - (s.lastR || s.R), 0) > 0;
      logEvent(world, grew ? 'Calm weeks have built the island out a little' : 'The sea has taken some of the island', null, { cat: 'pond', pri: 1, key: 'island-size' });
      for (const s of islands) {
        const R = Math.max(islandRadius(world, s), s.lastR || s.R) * (typeof isleReach === 'function' ? isleReach(world, s) / islandRadius(world, s) : 1.45) + 8;
        islandRects.push([Math.max(0, Math.floor(s.x - R)), Math.max(0, Math.floor(s.y - R)), Math.min(world.W - 1, Math.ceil(s.x + R)), Math.min(world.H - 1, Math.ceil(s.y + R))]);
      }
    }
    for (const s of islands) s.lastR = islandRadius(world, s);
    world.islandKey = key;
  }
  // Scour around what's been placed on the floor changes the depths slowly (only its patches are redone).
  const sk = scourKey(world), scourMoved = sk !== world.scourKey;
  world.scourKey = sk;
  if ((world.beachDaily && world.shore) || scourMoved || islandRects.length) {
    // Reshape the beach and the scour's patches, and redraw just those (a big pond needn't redraw it all).
    world.depthDirty = [];
    if (world.shore) makeShore(world); else buildDepth(world);
    const dirty = world.depthDirty;
    world.depthDirty = null;
    if (!dirty) bakeBackground(world);
    else for (const r of mergeRects([...dirty, ...islandRects, ...(world.shore ? [beachRect(world)] : [])])) { if (typeof queueBake === 'function') queueBake(world, r); else bakeBackground(world, r); }
    if (typeof queueJob === 'function') queueJob(() => { if (typeof paintMinimapBackground === 'function') paintMinimapBackground(); });
    else if (typeof paintMinimapBackground === 'function') paintMinimapBackground();
  }
  world.beachDaily = false;
  dawnDeep(world);
}

// ---- scour: the floor wears deeper around what stands on it ---------------------------------------------
// Structures, rocks and plants placed in open water between the beach and the
// deep dig the floor out around them as the years go by, deeper nearer the
// drop-off and elongated toward it, so the deep creeps in where you build.
function scourSources(world) {
  // (It moves on every five days, not every day: redoing the depths is costly on a big pond.)
  const out = [], tier = (world.erosion && world.erosion.tier) || 0, now = Math.floor((world.days || 0) / 5) * 5;
  const add = (x, y, born, w) => {
    if (born == null || (world.shore && shoreAt(world, x, y) > 0.08)) return;
    const k = clamp((now - born) / 12, 0, 1) * w * (0.6 + 0.3 * tier);
    if (k > 0.05) out.push({ x, y, k: Math.round(k * 10) / 10, sturdy: w });
  };
  for (const s of world.structures || []) add(s.x, s.y, s.born, s.kind === 'island' ? 0 : 1);
  // Rocks scour together where they stand close: one source per 28 px patch, at their middle, as
  // strong as all of them (to a point). (Plants don't dig: their beds trap sand instead; see sand.js.)
  const cells = new Map();
  const group = (x, y, born, w) => {
    if (born == null || (world.shore && shoreAt(world, x, y) > 0.08)) return;
    const k = clamp((now - born) / 12, 0, 1) * w * (0.6 + 0.3 * tier);
    if (k <= 0.02) return;
    const key = ((x / 28) | 0) + ((y / 28) | 0) * 4096, c = cells.get(key) || { x: 0, y: 0, k: 0, w: 0, n: 0 };
    c.x += x * k; c.y += y * k; c.k += k; c.w += w * k; c.n++;
    cells.set(key, c);
  };
  for (const r of world.rocks || []) if (r.oi == null) group(r.x, r.y, r.born ?? world.days - 30, 0.5);
  for (const c of cells.values()) {
    const k = Math.min(0.8, c.k);
    if (k > 0.05) out.push({ x: Math.round(c.x / c.k), y: Math.round(c.y / c.k), k: Math.round(k * 10) / 10, sturdy: c.w / c.k });
  }
  return out;
}
// A little noise for the scour's edges, from a tile (fbm per pixel was the slow part).
let SCOUR_NOISE = null;
const scourNoise = (x, y) => {
  if (!SCOUR_NOISE) { SCOUR_NOISE = new Float32Array(128 * 128); for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) SCOUR_NOISE[i + j * 128] = fbm(i * 0.1, j * 0.1, 61); }
  return SCOUR_NOISE[(x & 127) + ((y & 127) << 7)];
};
const scourKeyOf = (src) => src.map((s) => `${Math.round(s.x)},${Math.round(s.y)},${s.k}`).join(';');
const scourKey = (world) => scourKeyOf(scourSources(world));

function applyScour(world, depth, src = scourSources(world), rect = null) {
  if (!src.length) return depth;
  const { W, H } = world, N = world.shoreN || [0, 1], maxD = Math.max(0.35, (DEPTH_TIERS[(world.erosion && world.erosion.tier) || 0].depth || 0.35)) * 255;
  depth = depth || new Uint8Array(W * H);
  const base = world.shoreBase || world.shore;
  // (Worked out on every other pixel and written as 2x2 blocks: a quarter of the work.)
  let qx0 = 0, qy0 = 0, qx1 = W - 1, qy1 = H - 1;
  if (rect) [qx0, qy0, qx1, qy1] = rect;
  const set = (x, y, v, plinth) => {
    for (let j = y; j <= y + 1 && j <= qy1; j++) {
      for (let i = x; i <= x + 1 && i <= qx1; i++) {
        if (i < qx0 || j < qy0) continue;
        const q = i + j * W;
        if (plinth) depth[q] = Math.round(depth[q] * v); else if (v > depth[q]) depth[q] = v;
      }
    }
  };
  // (Deep tiers scour harder, but a hollow stays a hollow: its size and depth are capped.)
  const cap = Math.min(maxD, 120);
  for (const s of src) {
    const kk = Math.min(1.3, s.k), R = 18 + 26 * kk, foot = 0.2 * (0.6 + 0.4 * s.sturdy); // what stands there is sturdier than the floor
    if (s.x + R * 2 < qx0 || s.x - R * 2 > qx1 || s.y + R * 2 < qy0 || s.y - R * 2 > qy1) continue;
    // (Aligned to the same 2x2 grid whether the whole pond or one patch is being done.)
    const x0 = Math.max(qx0, Math.floor(s.x - R * 2)) & ~1, y0 = Math.max(qy0, Math.floor(s.y - R * 2)) & ~1;
    for (let y = y0; y <= Math.min(H - 2, qy1, Math.ceil(s.y + R * 2)); y += 2) {
      for (let x = x0; x <= Math.min(W - 2, qx1, Math.ceil(s.x + R * 2)); x += 2) {
        const dx = x + 0.5 - s.x, dy = y + 0.5 - s.y, toward = -(dx * N[0] + dy * N[1]); // + away from the beach
        const stretch = toward > 0 ? 2 : 1, a = toward / stretch, b = dx * N[1] - dy * N[0];
        const d = Math.hypot(a, b) / R;
        if (d >= 1) continue;
        const p = x + y * W;
        if (base && base[p] > 20) continue; // (the bare beach: sand and the river come and go)
        // A plinth of harder ground stays under it; around it the floor is scoured into a hollow,
        // deepest just off it and trailing away toward the deep (not a ring).
        if (d < foot) { set(x, y, 0.4 + 0.6 * (d / foot) ** 2, true); continue; }
        const near = Math.exp(-(((d - foot) / 0.35) ** 2)), trail = toward > 0 ? 0.35 * (1 - d) : 0;
        set(x, y, Math.round(Math.min(cap, (0.5 + 0.5 * kk) * 110 * ((1 - d) ** 1.3 * 0.55 + near * 0.45 + trail) * (0.8 + 0.2 * scourNoise(x, y)))), false);
      }
    }
  }
  return depth;
}
