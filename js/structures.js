'use strict';
// Structures: the big things you build with pearls (some also take essence).
// They're drawn by the same renderer as everything else: the solid parts are
// baked into the floor with the rocks, so animals swim over and behind them,
// and a few live parts (a vent's glow, a shrine's crystal, the hatchery's eggs,
// bubbles) are drawn every frame. Each has an aura, an area where it changes
// things: shelter calms the water, warmth makes animals fertile, clean water
// slows ageing, light comforts at night, vents and springs feed plankton, and
// each pulls the water fresh or salt in a pond with both. Islands raise dry land.
//
// Over days the ground around old structures, rocks and placed plants stains
// (algae in fresh water, coralline pink in salt), and plants gather around them.
// The hatchery is an idle game of its own: feed it by clicking (or with an
// auto-feeder), stock it with a pair from your pond, and it hatches broods that
// lean toward the trait you choose.

const SM = {
  wood: mat('#241810', '#3e2a1a', '#5c4028', '#7c5a3a'), woodDark: mat('#140c06', '#22160c', '#342212', '#48321c'),
  woodLight: mat('#3a2a18', '#5a4228', '#7e5e3a', '#a07e52'), brass: mat('#4a3a10', '#806418', '#c09a28', '#f0d060'),
  barnacle: mat('#6a6a60', '#9a9a8a', '#c8c8b8', '#eeeee2'), weedy: mat('#1e3a18', '#2e5a22', '#467e30', '#6aa848'),
  basalt: mat('#141418', '#24242a', '#383840', '#50505a'), ember: mat('#6a1a06', '#b8400a', '#f07a1a', '#ffd070'),
  stone: mat('#4a4a44', '#6e6e64', '#94948a', '#bcbcb0'), pale: mat('#7a7a6e', '#a4a496', '#cacabc', '#eeeee2'),
  crystal: mat('#2a5aa0', '#4a8ae0', '#8ac8ff', '#e0f6ff'), steel: mat('#2a3038', '#46505c', '#6a7684', '#98a4b2'),
  trunk: mat('#3a2a14', '#5a4020', '#7a5a2e', '#9a7640'), trunkRing: mat('#2a1c0c', '#3e2a14', '#56401e', '#6e5428'),
  frond: mat('#163e12', '#26621c', '#3e8c2a', '#6cbc48'), coconut: mat('#2a1a0c', '#442a14', '#5e3c1c', '#7a5028'),
  grass: mat('#1e4a14', '#2e6e1e', '#4a962c', '#7cc44c'), soil: mat('#1e140c', '#2e2014', '#40301e', '#56422a'),
  sand: mat('#8a7a5a', '#b0a07a', '#d0c49c', '#ece2c0'), egg: mat('#8a7a50', '#b8a676', '#e0d4a4', '#fff8dc'),
  eggGlow: mat('#8a5a1a', '#c88a2a', '#f8c050', '#fff0b0'), sprout: mat('#1e4a14', '#2e6e1e', '#4a9a2c', '#7ccc4c'),
};

// aura: aggression (added to the water's temper), comfort (for every animal),
// fertility and aging (multipliers), light (at night), plankton (per second).
// water: pull toward salt (+) or fresh (-) in a pond with both.
const STRUCTURES = {
  ship: {
    label: 'Sunken ship', pearls: 150, essence: 0, r: 72, size: 30, wet: true,
    desc: 'shelter: calms the water around it; eels, octopus, crabs and big fish love it; salvaged coins pay pearls each dawn',
    aura: { aggression: -0.25, comfort: 0.12 }, dawnPearls: 6,
  },
  island: {
    label: 'Island', pearls: 300, essence: 25, r: 64, size: 34, wet: true, shore: true,
    desc: 'dry land with a palm: frogs, turtles, crabs, snails and ducks bask and nest there; the water around it is sheltered',
    aura: { aggression: -0.1, comfort: 0.05, fertility: 1.1 },
  },
  vent: {
    label: 'Thermal vent', pearls: 180, essence: 0, r: 58, size: 12, wet: true, habitat: 'salt',
    desc: 'warm, mineral water: animals nearby breed more, and plankton blooms around it; pulls the water salt',
    aura: { aggression: 0.05, fertility: 1.35 }, plankton: 1.2, water: 2.5,
  },
  spring: {
    label: 'Spring', pearls: 180, essence: 0, r: 58, size: 12, wet: true, habitat: 'fresh',
    desc: 'cool, clear water welling up: animals nearby breed more and plankton gathers; pulls the water fresh',
    aura: { fertility: 1.3, comfort: 0.05 }, plankton: 1, water: -2.5,
  },
  shrine: {
    label: 'Glow shrine', pearls: 120, essence: 0, r: 66, size: 8, wet: true,
    desc: 'a crystal that glows at night: comfort in its light, and plankton drawn to it after dark',
    aura: { aggression: -0.08, light: 0.25 }, plankton: 0.6, night: true,
  },
  aerator: {
    label: 'Aerator', pearls: 90, essence: 0, r: 72, size: 7, wet: true,
    desc: 'oxygen-rich water: animals nearby age slower',
    aura: { aging: 0.85, comfort: 0.05 },
  },
  seedbed: {
    label: 'Seed bed', pearls: 60, essence: 0, r: 44, size: 10, wet: true,
    desc: 'plants take root around it each day, faster than anywhere else',
    aura: { comfort: 0.03 }, sprout: 3,
  },
  hatchery: {
    label: 'Hatchery', pearls: 250, essence: 40, r: 44, size: 12, wet: true, unique: true,
    desc: 'breed from a chosen pair: feed it by clicking, and its broods lean toward the trait you pick; upgrade it as you go',
    aura: { comfort: 0.05 },
  },
};
const STRUCT_CODES = ['ship', 'island', 'vent', 'spring', 'shrine', 'aerator', 'seedbed', 'hatchery']; // append-only (links)
// Species that especially like a structure nearby (see LIKES in game.js).
const STRUCT_LIKES = {
  ship: ['eel', 'octopus', 'crab', 'puffer', 'wild', 'ray'], island: ['frog', 'turtle', 'crab', 'snail', 'duck', 'starfish'],
  vent: ['shrimp', 'crab', 'starfish'], spring: ['axolotl', 'tetra', 'frog', 'snail'], shrine: ['jelly', 'clown', 'koi'],
  aerator: ['koi', 'tetra', 'wild'], seedbed: ['snail', 'shrimp'], hatchery: [],
};

function makeStructure(kind, world, x, y, seed = newSeed(), born = world.days) {
  const s = { kind, x, y, seed, born, t: 0 };
  withSeed(seed, () => BUILD[kind](s, world));
  s.id = newId(outlineOf(SM.basalt));
  if (kind === 'vent' || kind === 'shrine') EMISSIVE[s.id] = 2;
  if (kind === 'hatchery') EMISSIVE[s.id] = 1;
  return s;
}

const structureAt = (world, x, y) => (world.structures || []).find((s) => Math.hypot(s.x - x, s.y - y) < STRUCTURES[s.kind].size);

// Where a structure can go: in water, away from the edges and from other structures.
function canPlace(world, kind, x, y) {
  const def = STRUCTURES[kind], m = def.size + 6;
  if (x < m || y < m || x > world.W - m || y > world.H - m) return 'too close to the edge';
  if (def.habitat && !fitsHabitat(world, def.habitat)) return `it needs ${def.habitat} water`;
  if (def.shore && !world.shore) return 'a pool has no floor to raise';
  if (world.shore && shoreAt(world, x, y) > world.tide.level - 0.1) return 'too shallow here';
  for (const s of world.structures || []) {
    if (def.unique && s.kind === kind) return 'you already have one';
    if (Math.hypot(s.x - x, s.y - y) < def.size + STRUCTURES[s.kind].size) return 'too close to another structure';
  }
  return null;
}

// ---- shapes ------------------------------------------------------------------------------

const BUILD = {
  ship(s) {
    s.ang = rand(-PI, PI); s.L = rand(50, 60); s.B = s.L * rand(0.24, 0.29);
    s.mast = (Math.random() < 0.5 ? 1 : -1) * rand(0.6, 1.1); s.side = Math.random() < 0.5 ? 1 : -1;
  },
  island(s) {
    s.R = rand(24, 31); s.lean = rand(-PI, PI); s.h = rand(22, 27);
    s.palm = [rand(-4, 4), rand(-4, 4)];
    s.rocks = Array.from({ length: randi(2, 4) }, () => { const a = rand(0, TAU); return [Math.cos(a) * s.R * rand(0.75, 0.95), Math.sin(a) * s.R * rand(0.75, 0.95), rand(2.5, 4.5)]; });
    s.tufts = Array.from({ length: randi(14, 22) }, () => { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * s.R * 0.55; return [Math.cos(a) * d, Math.sin(a) * d, rand(0.8, 1.5)]; });
  },
  vent(s) { s.h = rand(10, 14); s.R = rand(6, 8); s.pebbles = Array.from({ length: 8 }, () => [rand(-12, 12), rand(-12, 12), rand(1, 2.2)]); },
  spring(s) { s.R = rand(7, 9); s.n = randi(8, 11); },
  shrine(s) { s.h = rand(12, 15); },
  aerator(s) { s.h = 6; },
  seedbed(s) { s.a = rand(8, 10); s.b = s.a * rand(0.65, 0.85); s.ang = rand(0, PI); s.sprouts = Array.from({ length: 14 }, () => [rand(-0.8, 0.8), rand(-0.8, 0.8), rand(2, 4)]); },
  hatchery(s) { s.R = 10; s.n = 10; },
};

// Solid parts, baked into the floor. `next(material)` hands out an outline id.
const BAKE = {
  ship(r, s, next) {
    const { x, y, ang, L, B } = s, ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (u, v) => [x + ca * u * L / 2 - sa * v * B / 2, y + sa * u * L / 2 + ca * v * B / 2];
    const width = (u) => B / 2 * Math.sqrt(Math.max(0.03, 1 - Math.abs(u) ** 3)) * (u > 0 ? 1 - 0.45 * u * u : 1);
    const hullId = next(SM.wood);
    const hull = (u, vv, px, py) => {
      if (((vv + 1) * 4.5) % 1 < 0.14) return SM.woodDark;
      if (hash2(px, py, s.seed) < 0.05) return SM.barnacle;
      return vnoise(px * 0.2, py * 0.2, s.seed % 97) > 0.66 ? SM.weedy : SM.wood;
    };
    const N = 10;
    for (let i = 0; i < N; i++) {
      const u0 = -1 + 2 * i / N, u1 = -1 + 2 * (i + 1) / N, [ax, ay] = P(u0, 0), [bx, by] = P(u1, 0);
      r.tube(ax, ay, width(u0), 0, bx, by, width(u1), 0, 0.55, hull, hullId, i / N, (i + 1) / N);
    }
    // The deck, with a couple of holes where the planks gave way.
    const deckId = next(SM.woodLight), top = B / 2 * 0.5;
    const holes = [[-0.2, 0.15], [0.35, -0.2]];
    const [dx, dy] = P(-0.05, 0);
    r.ellipsoid(dx, dy, L * 0.41, B * 0.33, ang, top, 0.8, (lx, ly) => {
      for (const [hx, hy] of holes) if ((lx - hx) ** 2 * 4 + (ly - hy) ** 2 < 0.06) return SM.woodDark;
      return ((lx + 1) * 10) % 1 < 0.12 ? SM.wood : SM.woodLight;
    }, deckId);
    // Rails along both sides, and portholes below them.
    const railId = next(SM.woodLight);
    for (const v of [-0.82, 0.82]) {
      for (let u = -0.75; u < 0.7; u += 0.25) {
        const [ax, ay] = P(u, v), [bx, by] = P(u + 0.25, v);
        r.tube(ax, ay, 0.7, top + 1, bx, by, 0.7, top + 1, 0.8, SM.woodLight, railId);
      }
    }
    const portId = next(SM.brass);
    for (const u of [-0.45, 0, 0.4]) {
      const [px, py] = P(u, s.side * 0.98);
      r.ellipsoid(px, py, 1.2, 1.2, 0, 1.5, 0.6, (lx, ly) => (lx * lx + ly * ly < 0.3 ? SM.woodDark : SM.brass), portId);
    }
    // The fallen mast and its yard.
    const mastId = next(SM.woodLight), [mx, my] = P(0.15, 0), ma = ang + s.mast, ml = L * 0.62;
    const ex = mx + Math.cos(ma) * ml, ey = my + Math.sin(ma) * ml;
    r.tube(mx, my, 1.6, top + 1.5, ex, ey, 1.1, 1, 0.9, SM.woodLight, mastId);
    const yx = mx + Math.cos(ma) * ml * 0.75, yy = my + Math.sin(ma) * ml * 0.75, ya = ma + PI / 2;
    r.tube(yx - Math.cos(ya) * 7, yy - Math.sin(ya) * 7, 0.8, 1.2, yx + Math.cos(ya) * 7, yy + Math.sin(ya) * 7, 0.8, 1.2, 0.9, SM.wood, mastId);
    // A treasure chest spilled beside the hull.
    const [cx, cy] = P(-0.55, s.side * 1.9);
    r.ellipsoid(cx, cy, 3.4, 2.3, ang, 0, 2.4, (lx) => (Math.abs(Math.abs(lx) - 0.55) < 0.1 ? SM.brass : SM.woodDark), next(SM.brass));
  },
  island(r, s, next) {
    const { x, y, R } = s;
    const grassId = next(SM.grass);
    for (const [ox, oy, a] of s.tufts) r.ellipsoid(x + ox, y + oy, a, a * 0.8, ox, 0, a * 0.9, SM.grass, grassId);
    const rockId = next(SM.stone);
    for (const [ox, oy, a] of s.rocks) r.ellipsoid(x + ox, y + oy, a, a * 0.8, oy, 0, a * 0.7, SM.stone, rockId);
    // The palm: a leaning, ringed trunk, fronds drooping from the top, coconuts.
    const trunkId = next(SM.trunk);
    let px = x + s.palm[0], py = y + s.palm[1], pz = 0;
    const la = s.lean, steps = 7, ring = (u) => ((u * 16) % 1 < 0.28 ? SM.trunkRing : SM.trunk);
    for (let i = 0; i < steps; i++) {
      const k = i / steps, lean = 1.4 * (1 - k * 0.5);
      const nx = px + Math.cos(la) * lean, ny = py + Math.sin(la) * lean, nz = pz + s.h / steps;
      r.tube(px, py, lerp(1.9, 1.2, k), pz, nx, ny, lerp(1.9, 1.2, k + 1 / steps), nz, 0.9, ring, trunkId, k, k + 1 / steps);
      px = nx; py = ny; pz = nz;
    }
    const frondId = next(SM.frond);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + s.seed % 7;
      for (let j = 0; j < 3; j++) {
        const d = 2.6 + j * 3.4, z = pz + 1 - j * j * 1.4;
        r.ellipsoid(px + Math.cos(a) * d, py + Math.sin(a) * d, 2.4, 1.1 - j * 0.15, a, z, 0.5, SM.frond, frondId);
      }
    }
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + 0.5;
      r.ellipsoid(px + Math.cos(a) * 1.3, py + Math.sin(a) * 1.3, 1, 1, 0, pz - 1.5, 1, SM.coconut, frondId);
    }
  },
  vent(r, s, next) {
    const { x, y, h, R } = s, id = next(SM.basalt);
    for (const [ox, oy, a] of s.pebbles) r.ellipsoid(x + ox, y + oy, a, a * 0.8, ox, 0, a * 0.7, SM.basalt, id);
    for (let k = 0; k < 6; k++) {
      const f = k / 5, rad = lerp(R, 2.4, f);
      r.ellipsoid(x + Math.sin(k * 1.7) * 0.6, y + Math.cos(k * 1.3) * 0.6, rad, rad * 0.9, k, f * h * 0.85, h / 5,
        (lx, ly, px, py) => (k >= 3 && vnoise(px * 0.6, py * 0.6, s.seed % 89) > 0.7 ? SM.ember : SM.basalt), id);
    }
  },
  spring(r, s, next) {
    const { x, y, R } = s, id = next(SM.pale);
    r.ellipsoid(x, y, R * 0.8, R * 0.8, 0, 0, 0.8, SM.sand, next(SM.sand));
    for (let k = 0; k < s.n; k++) {
      const a = k / s.n * TAU, rad = 1.8 + (k % 3) * 0.4;
      r.ellipsoid(x + Math.cos(a) * R, y + Math.sin(a) * R, rad, rad * 0.8, a, 0, rad * 0.8, SM.pale, id);
    }
  },
  shrine(r, s, next) {
    const { x, y, h } = s, id = next(SM.stone);
    r.ellipsoid(x, y, 5, 5, PI / 4, 0, 1.5, SM.stone, id);
    for (let k = 0; k < 4; k++) r.ellipsoid(x, y, 2.6 - k * 0.2, 2.6 - k * 0.2, PI / 4, 1.5 + k * (h - 2) / 4, (h - 2) / 4 + 0.5, SM.stone, id);
  },
  aerator(r, s, next) {
    const { x, y, h } = s, id = next(SM.steel);
    r.ellipsoid(x, y, 4, 4, 0, 0, 1.2, SM.stone, next(SM.stone));
    for (let k = 0; k < 4; k++) r.ellipsoid(x, y, 2.4, 2.4, 0, 1 + k * h / 4, h / 4 + 0.4, SM.steel, id);
    r.ellipsoid(x, y, 2.2, 2.2, 0, h + 1.4, 0.4, (lx, ly) => ((((lx + 1) * 4) % 1) < 0.3 ? SM.woodDark : SM.steel), id);
  },
  seedbed(r, s, next) {
    const { x, y, a, b, ang } = s;
    r.ellipsoid(x, y, a, b, ang, 0, 1.2, SM.soil, next(SM.soil));
    const id = next(SM.sprout), ca = Math.cos(ang), sa = Math.sin(ang);
    for (const [u, v, hgt] of s.sprouts) {
      const px = x + ca * u * a - sa * v * b, py = y + sa * u * a + ca * v * b;
      r.tube(px, py, 0.6, 1, px + 0.6, py - 0.4, 0.5, 1 + hgt, 0.8, SM.sprout, id);
      r.ellipsoid(px + 0.9, py - 0.6, 1, 0.6, u, 1 + hgt, 0.4, SM.sprout, id);
    }
  },
  hatchery(r, s, next) {
    const { x, y, R } = s, id = next(SM.pale);
    r.ellipsoid(x, y, R * 0.75, R * 0.75, 0, 0, 1.4, SM.sand, next(SM.sand));
    for (let k = 0; k < s.n; k++) {
      const a = k / s.n * TAU;
      r.ellipsoid(x + Math.cos(a) * R, y + Math.sin(a) * R, 2.4, 1.8, a, 0, 2.6, SM.stone, id);
    }
  },
};

// Live parts, drawn every frame.
const DRAW = {
  vent(r, s, t) {
    const k = 1.4 + Math.sin(t * 2.3 + s.seed) * 0.4;
    r.ellipsoid(s.x, s.y, k, k, 0, s.h + 0.3, 0.8, SM.ember, s.id);
  },
  shrine(r, s, t, world) {
    const glow = world.darkness > 0.3, bob = Math.sin(t * 1.2) * 0.4;
    EMISSIVE[s.id] = glow ? 2 : 1;
    r.ellipsoid(s.x, s.y, 2.2, 2.2, t * 0.3, s.h + 0.5 + bob, 2.6, SM.crystal, s.id);
    r.ellipsoid(s.x, s.y, 1.2, 1.2, t * 0.3, s.h + 3 + bob, 2, SM.crystal, s.id);
  },
  hatchery(r, s, t, world) {
    const H = world.hatchery, n = H ? Math.round(12 * Math.min(1, H.nutrients / hatchCost(H))) : 0, ready = H && H.nutrients >= hatchCost(H);
    EMISSIVE[s.id] = ready ? 2 : 0;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4, d = 1.2 + (i % 4) * 1.3;
      r.ellipsoid(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 1, 1, 0, 1.2 + Math.sin(t * 5 + i) * (ready ? 0.3 : 0), 0.9, ready ? SM.eggGlow : SM.egg, s.id);
    }
  },
};

// ---- auras ---------------------------------------------------------------------------------

// The combined aura at a point: comfort (added), fertility and aging (multiplied),
// light (at night). Each structure's effect fades toward the edge of its radius.
function auraAt(world, x, y) {
  let comfort = 0, fertility = 1, aging = 1, light = 0;
  for (const s of world.structures || []) {
    const def = STRUCTURES[s.kind], d = Math.hypot(s.x - x, s.y - y);
    if (d >= def.r) continue;
    const w = 1 - d / def.r, a = def.aura;
    comfort += (a.comfort || 0) * w;
    if (a.fertility) fertility *= 1 + (a.fertility - 1) * w;
    if (a.aging) aging *= 1 + (a.aging - 1) * w;
    if (a.light && world.darkness > 0.4) light += a.light * w;
  }
  return { comfort: comfort + light, fertility, aging };
}

// Called by the ecology grid: a structure's effect on the temper and the water around it.
function structureZones(world, s, put, tA, infl) {
  const def = STRUCTURES[s.kind], z = world.zones, R = def.r, mixed = world.opts.habitat === 'mixed';
  for (let j = Math.max(0, Math.floor((s.y - R) / ZONE)); j <= Math.min(z.rows - 1, Math.floor((s.y + R) / ZONE)); j++) {
    for (let i = Math.max(0, Math.floor((s.x - R) / ZONE)); i <= Math.min(z.cols - 1, Math.floor((s.x + R) / ZONE)); i++) {
      const d = Math.hypot((i + 0.5) * ZONE - s.x, (j + 0.5) * ZONE - s.y);
      if (d >= R) continue;
      const w = 1 - d / R, k = j * z.cols + i;
      tA[k] += (def.aura.aggression || 0) * w;
      if (mixed && def.water) infl[k] += def.water * w;
    }
  }
}

// Islands raise the beach elevation into dry land (applied after makeShore).
function applyShoreEdits(world) {
  const shore = world.shore, { W, H } = world;
  if (!shore) return;
  for (const s of world.structures || []) {
    if (s.kind !== 'island') continue;
    const R = s.R * 1.35;
    for (let y = Math.max(0, Math.floor(s.y - R)); y <= Math.min(H - 1, Math.ceil(s.y + R)); y++) {
      for (let x = Math.max(0, Math.floor(s.x - R)); x <= Math.min(W - 1, Math.ceil(s.x + R)); x++) {
        const d = Math.hypot(x - s.x, y - s.y) / s.R;
        if (d >= 1.35) continue;
        const e = 1.2 * (1 - (d / 1.35) ** 2) + (fbm(x * 0.08, y * 0.08, s.seed % 53) - 0.5) * 0.3;
        const p = x + y * W, v = Math.round(clamp(e, 0, 1) * 255);
        if (v > shore[p]) shore[p] = v;
      }
    }
  }
  if (typeof applyErosion === 'function') applyErosion(world);
}

// ---- the tick ------------------------------------------------------------------------------

function updateStructures(world, dt) {
  for (const s of world.structures || []) {
    const def = STRUCTURES[s.kind];
    s.t -= dt;
    if (s.t > 0) continue;
    s.t = s.kind === 'aerator' ? 0.15 : 0.5;
    if (s.kind === 'aerator') addBubbles(world, s.x + rand(-0.5, 0.5), s.y + rand(-0.5, 0.5), s.h + 2, 1);
    else if (s.kind === 'vent' || s.kind === 'spring') { if (Math.random() < 0.7) addBubbles(world, s.x + rand(-1, 1), s.y + rand(-1, 1), (s.h || 1) + 1, 1); }
    else if (s.kind === 'ship' && Math.random() < 0.08) addBubbles(world, s.x + rand(-10, 10), s.y + rand(-6, 6), 4, 1);
    // Plankton blooms: steadily around vents and springs, at night around the shrine.
    if (def.plankton && (!def.night || world.darkness > 0.4) && Math.random() < def.plankton * 0.5) {
      let near = 0;
      for (const f of world.food) if (f.kind === 'plankton' && (f.x - s.x) ** 2 + (f.y - s.y) ** 2 < 900) near++;
      if (near < 14) { const a = rand(0, TAU), d = rand(3, 26); world.food.push(new Food(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, rand(4, 26), 'plankton')); }
    }
  }
  updateHatchery(world, dt);
}

// Each dawn: the ship's salvage, plants gathering around old things, and the stains spreading.
function dawnStructures(world) {
  let coins = 0;
  for (const s of world.structures || []) coins += STRUCTURES[s.kind].dawnPearls || 0;
  if (coins) {
    const got = award(world, coins, 'salvage', null, { flat: true });
    if (got) logEvent(world, `Coins turned up in the silt around the wreck: +${got} pearls`, null, { cat: 'pond', pri: 0 });
  }
  sproutAround(world);
  applyStains(world);
}

// Plants take root around structures, rocks and plants that have been there a while.
function sproutAround(world) {
  const cap = world.W * world.H / 2200;
  if (world.plants.length >= cap) return;
  const sources = [
    ...(world.structures || []).map((s) => ({ x: s.x, y: s.y, age: world.days - s.born, k: STRUCTURES[s.kind].sprout || 1, r: STRUCTURES[s.kind].size + 8 })),
    ...world.rocks.map((r) => ({ x: r.x, y: r.y, age: world.days - (r.born ?? -8), k: 0.35, r: Math.max(r.a, r.b) + 4 })),
  ];
  let grown = 0;
  for (const src of sources) {
    if (src.age < 1 || Math.random() > 0.3 * src.k || world.plants.length >= cap) continue;
    for (let tries = 0; tries < 4; tries++) {
      const a = rand(0, TAU), d = src.r + rand(2, 16), x = src.x + Math.cos(a) * d, y = src.y + Math.sin(a) * d;
      if (x < 8 || y < 8 || x > world.W - 8 || y > world.H - 8 || (world.shore && shoreAt(world, x, y) > world.tide.level - 0.25)) continue;
      if (world.plants.filter((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 400).length >= 3) continue;
      const salt = saltAt(world, x, y) > 0;
      const kind = salt ? pick(['coral', 'coral', 'anemone', 'weed']) : pick(['weed', 'weed', 'eelgrass', 'marimo']);
      const p = makePlant(kind, world, x, y, kind === 'weed' ? { habitat: salt ? 'salt' : 'fresh' } : {});
      p.born = world.days;
      world.plants.push(p);
      grown++;
      break;
    }
  }
  if (grown) logEvent(world, `${grown} new plant${grown > 1 ? 's' : ''} took root around the old stones and structures`, null, { cat: 'life', pri: 0, key: 'sprout' });
}

// ---- stains: the ground discolours around old things -------------------------------------------
// The floor keeps an unstained copy (from bakeBackground); each day the stains are
// painted over it again, a little wider and deeper than before.

const STAIN_FRESH = hexToInt('#34461c'), STAIN_SALT = hexToInt('#6e3a5e'), STAIN_DRY = hexToInt('#8a8448');

function applyStains(world) {
  if (!world.bgBase) return;
  const { W, H } = world, stain = new Float32Array(W * H);
  const sources = [
    ...(world.structures || []).map((s) => [s.x, s.y, world.days - s.born, STRUCTURES[s.kind].size + 10, s.seed]),
    ...world.rocks.map((r) => [r.x, r.y, world.days - (r.born ?? -8), Math.max(r.a, r.b) + 4, r.seed]),
    ...world.plants.filter((p) => p.born != null).map((p) => [p.x, p.y, world.days - p.born, 5, p.seed]),
  ];
  for (const [sx, sy, age, base, seed] of sources) {
    if (age < 0.5) continue;
    const R = Math.min(base + 34, base * 0.4 + 5 + age * 1.6), depth = Math.min(0.5, 0.06 + age * 0.035);
    for (let y = Math.max(0, Math.floor(sy - R)); y <= Math.min(H - 1, Math.ceil(sy + R)); y++) {
      for (let x = Math.max(0, Math.floor(sx - R)); x <= Math.min(W - 1, Math.ceil(sx + R)); x++) {
        const d = Math.hypot(x - sx, y - sy);
        if (d >= R) continue;
        const v = (1 - d / R) * depth * (0.55 + 0.9 * vnoise(x * 0.14, y * 0.14, seed % 71));
        const p = x + y * W;
        if (v > stain[p]) stain[p] = v;
      }
    }
  }
  const bg = world.bg, bgL = world.bgLight, bgD = world.bgDry, shore = world.shore;
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p++) {
      // Dithered into a few steps, so stains read as pixel art rather than a smear.
      const v = Math.floor((stain[p] + dither(x, y) * 0.12) * 8) / 8;
      if (v <= 0) { bg[p] = world.bgBase[p]; bgL[p] = world.bgLightBase[p]; if (bgD) bgD[p] = world.bgDryBase[p]; continue; }
      const col = saltAt(world, x, y) > 0 ? STAIN_SALT : STAIN_FRESH;
      bg[p] = mixColor(world.bgBase[p], col, v);
      bgL[p] = mixColor(world.bgLightBase[p], col, v * 0.8);
      if (bgD && shore && shore[p]) bgD[p] = mixColor(world.bgDryBase[p], STAIN_DRY, v * 0.6);
    }
  }
}

// ---- the hatchery: an idle breeding game -----------------------------------------------------

const HATCH_FOCUS = {
  size: { label: 'Size', gene: 'size', hi: 1.5 }, speed: { label: 'Speed', gene: 'speed', hi: 1.3 },
  fertility: { label: 'Fertility', gene: 'fert', hi: 1 }, longevity: { label: 'Longevity', gene: 'lon', hi: 1 },
  vitality: { label: 'Vitality', gene: 'vit', hi: 1 }, intellect: { label: 'Intellect', gene: 'iq', hi: 1 },
  light: { label: 'Light', gene: 'lum', hi: 1 }, tolerance: { label: 'Tolerance', gene: 'tol', hi: 1 },
  calm: { label: 'Calm', gene: 'agg', hi: 0 }, rarity: { label: 'Rarity', mutate: true },
};
// Levers, bought with pearls (p) or essence (e); each level costs more than the last.
const HATCH_UPGRADES = {
  feeder: { label: 'Auto-feeder', cur: 'pearls', base: 40, grow: 1.6, max: 8, note: 'feeds the brood on its own, even while you are away' },
  paddle: { label: 'Bigger scoop', cur: 'pearls', base: 25, grow: 1.5, max: 8, note: 'each click feeds more' },
  tank: { label: 'Bigger tank', cur: 'pearls', base: 60, grow: 1.7, max: 6, note: 'one more young in every brood' },
  incubator: { label: 'Incubator', cur: 'pearls', base: 50, grow: 1.6, max: 6, note: 'broods need less food' },
  lamp: { label: 'UV lamp', cur: 'essence', base: 15, grow: 1.8, max: 5, note: 'more mutations, so more rare young' },
  filter: { label: 'Selective filter', cur: 'essence', base: 12, grow: 1.7, max: 5, note: 'pushes the chosen trait harder' },
};

const newHatchery = () => ({ nutrients: 0, focus: 'size', stock: [], broods: 0, levels: { feeder: 0, paddle: 0, tank: 0, incubator: 0, lamp: 0, filter: 0 } });
const hatchCost = (H) => Math.round(40 * 0.85 ** H.levels.incubator);
const hatchClick = (H) => 1 + H.levels.paddle * 0.75;
const hatchAuto = (H) => H.levels.feeder * 0.25; // food per second
const upgradeCost = (key, lvl) => Math.round(HATCH_UPGRADES[key].base * HATCH_UPGRADES[key].grow ** lvl);

function hatcheryStructure(world) { return (world.structures || []).find((s) => s.kind === 'hatchery'); }

// A pair from the same breeding line, if the stock holds one.
function hatchPair(H) {
  const [a, b] = H.stock;
  return a && b && a.key === b.key ? [a, b] : null;
}

function feedHatchery(world, amount) {
  const H = world.hatchery;
  if (!H) return;
  H.nutrients = Math.min(hatchCost(H) * 3, H.nutrients + amount);
}

function updateHatchery(world, dt) {
  const H = world.hatchery;
  if (!H || !hatcheryStructure(world)) return;
  if (hatchAuto(H)) feedHatchery(world, hatchAuto(H) * dt);
  if (H.nutrients >= hatchCost(H) && hatchPair(H) && world.creatures.length < world.maxPop + 40) {
    H.nutrients -= hatchCost(H);
    hatchBrood(world);
  }
}

// A brood from the stocked pair: ordinary inheritance, then the chosen trait pushed
// toward its extreme (harder with the filter), and more mutations under the lamp.
function hatchBrood(world) {
  const H = world.hatchery, s = hatcheryStructure(world), [a, b] = hatchPair(H);
  const focus = HATCH_FOCUS[H.focus] || HATCH_FOCUS.size, push = 0.25 + 0.12 * H.levels.filter;
  const n = 2 + H.levels.tank, babies = [], school = schoolFor(a, s);
  for (let i = 0; i < n; i++) {
    const ang = rand(0, TAU), x = s.x + Math.cos(ang) * 14, y = s.y + Math.sin(ang) * 14;
    const kind = a.k === 'frog' ? 'tadpole' : a.k;
    const c = makeCreature(kind, world, x, y, { ...(a.args || {}), ...(school ? { school } : {}) });
    const g = childGenomeFor(c.seed, a.genome, b.genome);
    if (focus.mutate || H.levels.lamp) {
      const tries = (focus.mutate ? 1 : 0) + H.levels.lamp * 0.3;
      if (Math.random() < tries) {
        const k = pick(['albino', 'melanistic', 'piebald', 'xanthic', 'axanthic', 'leu', 'glow', 'ghost', 'shiny']);
        if (k === 'glow' || k === 'ghost' || k === 'shiny') { if (Math.random() < 0.15) g[k] = true; } else g[k] = Math.min(2, (g[k] || 0) + 1);
      }
    } else {
      const k = focus.gene, lim = k === 'size' || k === 'speed' ? GENE_LIMITS[k] : [0, 1];
      g[k] = clamp(g[k] + push * (focus.hi - g[k]) * rand(0.5, 1), lim[0], lim[1]);
    }
    initLife(c, { genome: g, parents: [a.s, b.s], gen: Math.max(a.gen, b.gen) + 1, scale: 0.35, age: 0, alpha: 0 });
    world.creatures.push(c);
    noteBorn(world, c, 'hatchery');
    babies.push(c);
    ECO.births++;
  }
  H.broods++;
  scoreBirths(world, babies);
  const ess = gainEssence(world, 2 + H.levels.tank, 'hatchery');
  logEvent(world, `The hatchery hatched ${n} young from ${a.name} & ${b.name}, bred for ${focus.label.toLowerCase()} · +${ess} essence`, babies[0], { cat: 'life', pri: 1, key: 'hatch-brood', merge: (e) => `The hatchery hatched ${e.n} broods` });
}

// Schooling fish hatch (or come back) as a school of their own.
function schoolFor(rec, s) {
  if (rec.k === 'tetra') return { tx: s.x, ty: s.y, tz: 22, until: 0, kind: rec.schoolKind || 'neon' };
  if (rec.k === 'wild' && rec.args.sp && rec.args.sp.schooling) return { tx: s.x, ty: s.y, tz: (rec.args.sp.zMin + rec.args.sp.zMax) / 2, until: 0, wild: rec.args.sp };
  return null;
}

// Take an animal out of the pond into the hatchery's stock (two at most).
function stockHatchery(world, c) {
  const H = world.hatchery;
  if (!H || !c.life || !BREED[c.species === 'tadpole' ? 'frog' : c.species]) return 'only animals that lay eggs can be bred here';
  const rec = {
    k: c.make, key: breedKey(c), args: c.species === 'wild' ? { sp: c.sp } : c.species === 'koi' ? { variety: c.variety } : {},
    s: c.seed, name: c.life.name, gen: c.life.gen, genome: c.life.genome, species: c.species, traits: c.life.traits.slice(),
    schoolKind: c.school ? c.school.kind || null : null,
  };
  if (H.stock.length >= 2) H.stock.shift();
  H.stock.push(rec);
  world.creatures.splice(world.creatures.indexOf(c), 1);
  noteGone(world, c, 'to the hatchery');
  return null;
}

// Put a stocked animal back into the pond.
function releaseStock(world, i) {
  const H = world.hatchery, rec = H && H.stock[i], s = hatcheryStructure(world);
  if (!rec || !s) return;
  H.stock.splice(i, 1);
  const school = schoolFor(rec, s);
  const c = makeCreature(rec.k, world, s.x + rand(-12, 12), s.y + rand(-12, 12), { ...rec.args, ...(school ? { school } : {}) }, rec.s);
  initLife(c, { genome: rec.genome, gen: rec.gen, scale: 1, age: lifespanFor(rec.species, rec.s) * 0.3, alpha: 0 });
  c.life.name = rec.name;
  world.creatures.push(c);
  const r = world.lineage && world.lineage.get(rec.s);
  if (r) { r.d = null; r.why = null; }
}

// Stock records as saved (wild species by id), and back.
const packStock = (H) => H.stock.map((r) => ({ ...r, args: r.args && r.args.sp ? { sp: r.args.sp.id } : r.args }));
function unpackStock(stock) {
  const spById = new Map(WILD_SPECIES.map((s) => [s.id, s]));
  return (stock || []).map((r) => ({ ...r, genome: fillGenome({ ...r.genome }), args: r.args && r.args.sp != null ? { sp: spById.get(r.args.sp) } : r.args || {} }))
    .filter((r) => r.k !== 'wild' || (r.args && r.args.sp));
}
