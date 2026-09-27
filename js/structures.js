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
  kelp: mat('#3a2a08', '#5e4610', '#8a6a1c', '#b8943a'), kelpBlade: mat('#4a3a0c', '#76601a', '#a08a2c', '#ccb450'),
  bark: mat('#1a120a', '#2a1e12', '#3e2c1a', '#544028'), moss2: mat('#1e2e14', '#2e461e', '#44622a', '#628a3c'),
  bone: mat('#8a8274', '#b2aa98', '#d6cebc', '#f4eee0'), mat: mat('#8a4a1a', '#c0702a', '#e89a4a', '#ffc88a'),
  wormTube: mat('#8a8a82', '#b4b4aa', '#d8d8ce', '#f6f6ee'), plume: mat('#8a0e1a', '#c01e2a', '#ee3a3a', '#ff8a7a'),
  smoke: mat('#0a0a0c', '#141418', '#1e1e24', '#2a2a32'), deepCrystal: mat('#3a1a8a', '#5a3ac8', '#8a70f0', '#d8c8ff'),
  idol: mat('#1a2018', '#2a3226', '#3e4838', '#566250'), idolEye: mat('#1a8a3a', '#2ac85a', '#6af08a', '#d0ffd8'),
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
  // The deep: each opens with its depth tier (and needs water that deep).
  kelp: {
    label: 'Kelp forest', pearls: 160, essence: 20, r: 74, size: 16, wet: true, habitat: 'salt', tier: 2,
    desc: 'tall kelp swaying over everything: shelter that calms the water, and a nursery where fish breed more',
    aura: { aggression: -0.2, fertility: 1.2, comfort: 0.08 }, water: 1, plankton: 0.5,
  },
  drowned: {
    label: 'Drowned forest', pearls: 160, essence: 20, r: 74, size: 22, wet: true, habitat: 'fresh', tier: 2,
    desc: 'sunken trees and their roots: shelter that calms the water, and a nursery where fish breed more',
    aura: { aggression: -0.2, fertility: 1.2, comfort: 0.08 }, water: -1, plankton: 0.4,
  },
  smoker: {
    label: 'Black smoker', pearls: 220, essence: 40, r: 66, size: 12, wet: true, habitat: 'salt', tier: 3, deepMin: 0.35,
    desc: 'a mineral chimney on the deep floor, ringed with tube worms: warmth and food for deep life, and essence each dawn',
    aura: { fertility: 1.3, comfort: 0.1 }, plankton: 1, dawnEssence: 4, water: 2,
  },
  grotto: {
    label: 'Crystal grotto', pearls: 220, essence: 40, r: 66, size: 12, wet: true, habitat: 'fresh', tier: 3, deepMin: 0.35,
    desc: 'crystals that glow in the dark: light for cave life, calm, and essence each dawn',
    aura: { comfort: 0.18, aggression: -0.1 }, plankton: 0.6, dawnEssence: 4, water: -2,
  },
  whalefall: {
    label: 'Whale fall', pearls: 300, essence: 60, r: 80, size: 30, wet: true, habitat: 'salt', tier: 4, deepMin: 0.55,
    desc: 'a whale’s bones on the abyss floor: a feast for deep life that lasts, and essence each dawn',
    aura: { comfort: 0.2, fertility: 1.25 }, plankton: 1.4, dawnEssence: 7,
  },
  idol: {
    label: 'Drowned idol', pearls: 300, essence: 80, r: 90, size: 12, wet: true, habitat: 'fresh', tier: 4, deepMin: 0.55, unique: true,
    desc: 'something old, carved by no one: it draws the mythic up out of the dark and pays essence each dawn, but nothing near it rests easy',
    aura: { comfort: -0.12, aggression: 0.1 }, dawnEssence: 10, lure: 4,
  },
};
const STRUCT_CODES = ['ship', 'island', 'vent', 'spring', 'shrine', 'aerator', 'seedbed', 'hatchery', 'kelp', 'drowned', 'smoker', 'grotto', 'whalefall', 'idol']; // append-only (links)
// Species that especially like a structure nearby (see LIKES in game.js).
const STRUCT_LIKES = {
  ship: ['eel', 'octopus', 'crab', 'puffer', 'wild', 'ray'], island: ['frog', 'turtle', 'crab', 'snail', 'duck', 'starfish'],
  vent: ['shrimp', 'crab', 'starfish'], spring: ['axolotl', 'tetra', 'frog', 'snail'], shrine: ['jelly', 'clown', 'koi'],
  aerator: ['koi', 'tetra', 'wild'], seedbed: ['snail', 'shrimp'], hatchery: [],
  kelp: ['wild', 'clown', 'shark', 'puffer', 'ray'], drowned: ['koi', 'catfish', 'turtle', 'axolotl', 'eel'],
  smoker: ['isopod', 'vampire', 'gulper', 'shrimp', 'crab'], grotto: ['cavefish', 'olm', 'isopod'],
  whalefall: ['isopod', 'angler', 'gulper', 'kraken', 'crab'], idol: ['watcher', 'leviathan'],
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
  if (def.tier && ((world.erosion && world.erosion.tier) || 0) < def.tier) return `the pond isn't that deep yet (it needs ${tierName(world, def.tier).toLowerCase()})`;
  if (def.deepMin && depthAt(world, x, y) < def.deepMin) return 'it needs deeper water';
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
  kelp(s) { s.stalks = Array.from({ length: randi(8, 11) }, () => ({ ox: rand(-11, 11), oy: rand(-11, 11), h: rand(30, 42), ph: rand(0, TAU) })); },
  drowned(s) {
    s.trunks = Array.from({ length: 3 }, (_, k) => ({ a: rand(0, TAU), len: rand(28, 42), r: rand(2.6, 3.4), ox: rand(-6, 6), oy: rand(-6, 6) }));
  },
  smoker(s) { s.h = rand(16, 22); s.R = rand(7, 9); s.worms = Array.from({ length: 14 }, () => { const a = rand(0, TAU), d = rand(8, 14); return [Math.cos(a) * d, Math.sin(a) * d, rand(2, 4)]; }); },
  grotto(s) { s.crystals = Array.from({ length: randi(9, 13) }, () => ({ ox: rand(-7, 7), oy: rand(-7, 7), a: rand(0, TAU), len: rand(5, 13), lean: rand(0.2, 0.6) })); },
  whalefall(s) { s.ang = rand(-PI, PI); s.L = rand(60, 72); s.bend = rand(-0.4, 0.4); },
  idol(s) { s.ang = rand(-PI, PI); s.h = rand(18, 22); },
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
    const dark = s.branch === 'dark', zAt = (ox, oy) => (typeof islandTopAt === 'function' ? islandTopAt(s, ox, oy) : 0);
    // A raised island stands in terraces, a step for each level: a ring of dark soil at
    // each edge, sand low down, then grass (or, on the stone's island, dead black moss).
    if (typeof islandTerraces === 'function') {
      const T = islandTerraces(s);
      T.forEach(([tx, ty, rr, ang, top], i) => {
        const z0 = top - TERRACE_STEP, m = i < T.length / 3 ? SM.sand : dark && i >= T.length / 2 ? SM.moss2 : SM.grass;
        r.ellipsoid(x + tx, y + ty, rr + 1.3, (rr + 1.3) * 0.92, ang, z0 - 0.2, TERRACE_STEP * 0.7, SM.soil, next(SM.soil));
        r.ellipsoid(x + tx, y + ty, rr, rr * 0.92, ang, z0, TERRACE_STEP, m, next(m));
      });
    }
    // Out over the deep, its edge is a cliff: a ring of dark rock where the sea meets it.
    if ((s.deep || 0) > 0.15) {
      const G0 = typeof islandGrow === 'function' ? islandGrow(s.stack || 1) : 1, cid = next(SM.basalt), n = Math.round(18 + 14 * G0);
      for (let k = 0; k < n; k++) {
        const a = k / n * TAU + hash2(k, s.seed % 91, 5) * 0.2, d = R * G0 * (1.02 + 0.12 * hash2(k, 3, s.seed % 79)), sz = 2.2 + 2.6 * s.deep * hash2(k, 9, 1);
        r.ellipsoid(x + Math.cos(a) * d, y + Math.sin(a) * d, sz, sz * 0.8, a, 0, sz * (1 + s.deep), SM.basalt, cid);
      }
    }
    const grassId = next(SM.grass);
    for (const [ox, oy, a] of s.tufts) r.ellipsoid(x + ox, y + oy, a, a * 0.8, ox, zAt(ox, oy), a * 0.9, SM.grass, grassId);
    const rockId = next(SM.stone);
    for (const [ox, oy, a] of s.rocks) r.ellipsoid(x + ox, y + oy, a, a * 0.8, oy, zAt(ox, oy), a * 0.7, SM.stone, rockId);
    // The palm: a leaning, ringed trunk, fronds drooping from the top, coconuts.
    const trunkId = next(SM.trunk);
    let px = x + s.palm[0], py = y + s.palm[1], pz = zAt(s.palm[0], s.palm[1]);
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
    // Raised islands (traits.js) grow lusher: more grass, a second and third palm, flowers.
    // (Drawn after the rest, so the island's first shape never changes.)
    const lush = (s.stack || 1) - 1, G = typeof islandGrow === 'function' ? islandGrow(s.stack || 1) : 1;
    const gid = next(dark ? SM.smoke : SM.grass);
    for (let i = 0; i < lush * 12; i++) {
      const a = rand(0, TAU), d = Math.sqrt(Math.random()) * R * (0.55 + 0.1 * Math.min(lush, 4) + 0.06 * Math.max(0, lush - 4)), sz = rand(0.8, 1.6), ox = Math.cos(a) * d, oy = Math.sin(a) * d;
      r.ellipsoid(x + ox, y + oy, sz, sz * 0.8, a, zAt(ox, oy), sz, dark ? SM.smoke : SM.grass, gid);
    }
    // More palms as it rises (up to eight), spread over the terraces, and taller on the higher ones.
    for (let k = 1; k <= Math.min(7, lush); k++) {
      const a = s.lean + k * 2.2, dd = R * G * (k <= 2 ? 0.35 : 0.2 + 0.08 * (k % 4)), bx = x + Math.cos(a) * dd, by = y + Math.sin(a) * dd;
      const z0 = zAt(bx - x, by - y), h = z0 + s.h * (0.7 + 0.1 * (k % 3));
      r.tube(bx, by, 1.5, z0, bx + Math.cos(a) * 3, by + Math.sin(a) * 3, 1, h, 0.9, ring, trunkId);
      for (let f = 0; f < 6; f++) {
        const fa = f / 6 * TAU + k, tx = bx + Math.cos(a) * 3, ty = by + Math.sin(a) * 3;
        r.ellipsoid(tx + Math.cos(fa) * 3.5, ty + Math.sin(fa) * 3.5, 2.6, 1, fa, h, 0.5, dark ? SM.moss2 : SM.frond, frondId);
      }
    }
    if (lush >= 2 && !dark) {
      const fl = next(SM.plume);
      for (let i = 0; i < lush * 6; i++) { const a = rand(0, TAU), d = rand(0.2, 0.7) * R * Math.min(G, 1.6), ox = Math.cos(a) * d, oy = Math.sin(a) * d; r.ellipsoid(x + ox, y + oy, 0.9, 0.9, 0, 1.5 + zAt(ox, oy), 0.8, pick([SM.plume, SM.eggGlow, SM.crystal]), fl); }
    }
    // The whispering stone: a black standing stone on the summit, taller at each level.
    if (dark) {
      const sid = next(SM.idol), z0 = zAt(0, -0.5), h = z0 + 14 + 4 * (s.blv || 1);
      r.tube(x - 0.8, y - 0.5, 2.4, z0, x + 0.8, y - 0.5, 1.2, h, 1, SM.idol, sid);
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

Object.assign(BAKE, {
  kelp(r, s, next) {
    const id = next(SM.stone);
    for (const st of s.stalks) r.ellipsoid(s.x + st.ox, s.y + st.oy, 1.8, 1.5, st.ph, 0, 1.4, SM.stone, id);
  },
  drowned(r, s, next) {
    const id = next(SM.bark), bark = (u, v, px, py) => (vnoise(px * 0.3, py * 0.3, s.seed % 61) > 0.66 ? SM.moss2 : ((u * 12) % 1 < 0.2 ? SM.woodDark : SM.bark));
    for (const t of s.trunks) {
      const x0 = s.x + t.ox, y0 = s.y + t.oy, x1 = x0 + Math.cos(t.a) * t.len, y1 = y0 + Math.sin(t.a) * t.len;
      r.tube(x0, y0, t.r, 0, x1, y1, t.r * 0.45, 0, 0.8, bark, id);
      // Roots splayed at the base, a couple of branch stubs along the trunk.
      for (let k = 0; k < 6; k++) {
        const a = t.a + PI + (k - 2.5) * 0.45, L = rand(5, 9);
        r.tube(x0, y0, 1.2, 0.5, x0 + Math.cos(a) * L, y0 + Math.sin(a) * L, 0.5, 0, 0.8, SM.bark, id);
      }
      for (const f of [0.45, 0.7]) {
        const bx = lerp(x0, x1, f), by = lerp(y0, y1, f), a = t.a + (f > 0.5 ? 1 : -1) * 0.9;
        r.tube(bx, by, 1, t.r * 0.6, bx + Math.cos(a) * 7, by + Math.sin(a) * 7, 0.5, t.r * 0.6 + 3, 0.8, SM.bark, id);
      }
    }
  },
  smoker(r, s, next) {
    const { x, y, h, R } = s, id = next(SM.basalt), wid = next(SM.wormTube);
    for (let k = 0; k < 8; k++) {
      const f = k / 7, rad = lerp(R, 2.2, f) * (1 + Math.sin(k * 2.3) * 0.12);
      r.ellipsoid(x + Math.sin(k * 1.9) * 0.8, y + Math.cos(k * 1.4) * 0.8, rad, rad * 0.9, k, f * h * 0.9, h / 7,
        (lx, ly, px, py) => (k < 3 && vnoise(px * 0.4, py * 0.4, s.seed % 53) > 0.62 ? SM.pale : SM.basalt), id);
    }
    // Tube worms around the base, each with a red plume.
    for (const [ox, oy, hh] of s.worms) {
      r.tube(x + ox, y + oy, 0.6, 0, x + ox, y + oy, 0.5, hh, 0.9, SM.wormTube, wid);
      r.ellipsoid(x + ox, y + oy, 1.1, 1.1, 0, hh, 0.8, SM.plume, wid);
    }
  },
  grotto(r, s, next) {
    const id = next(SM.basalt);
    for (let k = 0; k < 6; k++) { const a = k * 1.05; r.ellipsoid(s.x + Math.cos(a) * 8, s.y + Math.sin(a) * 8, rand(3, 5), rand(2.5, 4), a, 0, 3, SM.basalt, id); }
  },
  whalefall(r, s, next) {
    const id = next(SM.bone), mid = next(SM.mat), { x, y, ang, L, bend } = s;
    const P = (u) => { const a = ang + bend * u; return [x + Math.cos(a) * u * L / 2, y + Math.sin(a) * u * L / 2]; };
    // Bacterial mats on the silt where the whale lies.
    r.ellipsoid(x, y, L * 0.5, 9, ang, 0, 0.5, (lx, ly, px, py) => (vnoise(px * 0.2, py * 0.2, s.seed % 41) > 0.52 ? SM.mat : null), mid);
    for (let i = 0; i <= 22; i++) {
      const u = -1 + 2 * i / 22, [vx, vy] = P(u), rad = 1.6 + (u > 0.5 ? 0 : 0.6);
      r.ellipsoid(vx, vy, rad, rad * 0.8, ang, 0, rad, SM.bone, id);
      // Ribs arch out from the front half of the spine.
      if (u > -0.2 && u < 0.6 && i % 2 === 0) {
        for (const side of [-1, 1]) {
          const a = ang + bend * u + side * PI / 2, span = 9 * (1 - Math.abs(u - 0.2));
          r.tube(vx, vy, 0.8, 2, vx + Math.cos(a) * span * 0.6, vy + Math.sin(a) * span * 0.6, 0.7, 6, 0.8, SM.bone, id);
          r.tube(vx + Math.cos(a) * span * 0.6, vy + Math.sin(a) * span * 0.6, 0.7, 6, vx + Math.cos(a - side * 0.5) * span, vy + Math.sin(a - side * 0.5) * span, 0.5, 1, 0.8, SM.bone, id);
        }
      }
    }
    const [hx, hy] = P(1.12);
    r.ellipsoid(hx, hy, 9, 5.5, ang, 0, 4, SM.bone, id);
    for (const side of [-1, 1]) {
      const a = ang + side * 0.12;
      r.tube(hx, hy + side * 2, 1.2, 1, hx + Math.cos(a) * 16, hy + Math.sin(a) * 16 + side * 2, 0.8, 0.5, 0.8, SM.bone, id);
    }
  },
  idol(r, s, next) {
    const { x, y, h } = s, id = next(SM.idol);
    for (let k = 0; k < 3; k++) r.ellipsoid(x, y, 7 - k * 1.6, 7 - k * 1.6, PI / 4, k * 1.4, 1.4, SM.stone, id);
    for (let k = 0; k < 5; k++) r.ellipsoid(x, y, 2.6, 2, s.ang, 4 + k * (h - 8) / 5, (h - 8) / 5 + 0.6, (lx, ly) => (Math.abs(ly) < 0.15 ? SM.basalt : SM.idol), id);
    // The head: a dome with tentacles hanging from it.
    r.ellipsoid(x, y, 4.2, 3.6, s.ang, h - 3, 3.4, SM.idol, id);
    for (let k = 0; k < 7; k++) {
      const a = s.ang + PI * 0.3 + k * 0.4;
      r.tube(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, 0.9, h - 2, x + Math.cos(a) * 6, y + Math.sin(a) * 6, 0.5, h - 9, 0.8, SM.idol, id);
    }
  },
});

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
  kelp(r, s, t, world) {
    const cur = world.current;
    for (const st of s.stalks) {
      let px = s.x + st.ox, py = s.y + st.oy, pz = 0;
      for (let k = 1; k <= 8; k++) {
        const f = k / 8, sway = Math.sin(t * 0.8 + st.ph + k * 0.45) * 0.6 * f;
        const nx = px + Math.cos(st.ph) * sway + cur.x * 2 * f, ny = py + Math.sin(st.ph) * sway + cur.y * 2 * f, nz = st.h * f;
        r.tube(px, py, lerp(0.9, 0.6, f), pz, nx, ny, lerp(0.9, 0.6, f + 0.12), nz, 0.8, SM.kelp, s.id);
        if (k % 2 === 0) { const a = st.ph + k * 1.7 + Math.sin(t + k) * 0.2; r.ellipsoid(nx + Math.cos(a) * 2, ny + Math.sin(a) * 2, 3.4, 1.1, a, nz - 1, 0.4, SM.kelpBlade, s.id); }
        px = nx; py = ny; pz = nz;
      }
    }
  },
  smoker(r, s, t, world) {
    const k = 1.3 + Math.sin(t * 2.1 + s.seed) * 0.3;
    r.ellipsoid(s.x, s.y, k, k, 0, s.h + 0.4, 0.8, SM.ember, s.id);
    // Black smoke billowing up and drifting with the current.
    if (s.smokeId == null) { s.smokeId = newId(hexToInt('#050508')); FADE[s.smokeId] = 1; }
    for (let i = 0; i < 6; i++) {
      const ph = (t * 0.25 + i / 6) % 1, z = s.h + 1 + ph * 22, rad = 1.4 + ph * 3.5;
      r.alpha = 1 - ph * 0.8;
      r.ellipsoid(s.x + world.current.x * ph * 12 + Math.sin(i * 2.7 + t) * ph * 2, s.y + world.current.y * ph * 12, rad, rad, i, z, rad * 0.8, SM.smoke, s.smokeId);
    }
    r.alpha = 1;
  },
  grotto(r, s, t) {
    EMISSIVE[s.id] = 2;
    const pulse = 0.5 + Math.sin(t * 0.9 + s.seed) * 0.5, m = pulse > 0.5 ? SM.crystal : SM.deepCrystal;
    for (const c of s.crystals) {
      const tx = s.x + c.ox + Math.cos(c.a) * c.len * c.lean, ty = s.y + c.oy + Math.sin(c.a) * c.len * c.lean;
      r.tube(s.x + c.ox, s.y + c.oy, 1.3, 0, tx, ty, 0.35, c.len, 0.9, m, s.id);
    }
  },
  idol(r, s, t) {
    const open = Math.sin(t * 0.4 + s.seed) > -0.3, x = s.x + Math.cos(s.ang) * 2.4, y = s.y + Math.sin(s.ang) * 2.4;
    if (!open) return;
    EMISSIVE[s.id] = 2;
    for (const side of [-1, 1]) {
      const a = s.ang + side * PI / 2;
      r.dot(x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4, s.h + 0.6, SM.idolEye, s.id);
    }
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
// Upgrades (see traits.js) widen a structure's reach and strengthen its effect;
// raised islands reach further, and an island of life comforts and lights the night.
const auraR = (world, s) => STRUCTURES[s.kind].r * (1 + 0.2 * ((s.lv && s.lv.reach) || 0)) * (s.kind === 'island' ? islandGrow(s.stack || 1) : 1);
const auraK = (s) => 1 + 0.25 * ((s.lv && s.lv.strength) || 0);

function auraAt(world, x, y) {
  let comfort = 0, fertility = 1, aging = 1, light = 0;
  for (const s of world.structures || []) {
    const def = STRUCTURES[s.kind], R = auraR(world, s), d = Math.hypot(s.x - x, s.y - y);
    if (d >= R) continue;
    const w = (1 - d / R) * auraK(s), a = def.aura;
    comfort += (a.comfort || 0) * w;
    if (a.fertility) fertility *= 1 + (a.fertility - 1) * w;
    if (a.aging) aging *= 1 + (a.aging - 1) * w;
    if (a.light && world.darkness > 0.4) light += a.light * w;
    if (s.branch === 'life') { comfort += 0.08 * (s.blv || 1) * w; fertility *= 1 + 0.05 * (s.blv || 1) * w; if (world.darkness > 0.4) light += 0.1 * (s.blv || 1) * w; }
  }
  return { comfort: comfort + light, fertility, aging };
}

// Called by the ecology grid: a structure's effect on the temper and the water around it.
function structureZones(world, s, put, tA, infl) {
  const def = STRUCTURES[s.kind], z = world.zones, R = auraR(world, s), K = auraK(s), mixed = world.opts.habitat === 'mixed';
  for (let j = Math.max(0, Math.floor((s.y - R) / ZONE)); j <= Math.min(z.rows - 1, Math.floor((s.y + R) / ZONE)); j++) {
    for (let i = Math.max(0, Math.floor((s.x - R) / ZONE)); i <= Math.min(z.cols - 1, Math.floor((s.x + R) / ZONE)); i++) {
      const d = Math.hypot((i + 0.5) * ZONE - s.x, (j + 0.5) * ZONE - s.y);
      if (d >= R) continue;
      const w = (1 - d / R) * K, k = j * z.cols + i;
      tA[k] += ((def.aura.aggression || 0) + (s.branch === 'dark' ? 0.08 * (s.blv || 1) : 0)) * w;
      if (mixed && def.water) infl[k] += def.water * w;
    }
  }
}

// Islands raise the beach elevation into dry land (applied after makeShore).
function applyShoreEdits(world) {
  const shore = world.shore, { W, H } = world;
  if (!shore) return;
  if (typeof applySand === 'function') applySand(world); // sandbars, the delta, spits in the lee (sand.js)
  if (typeof applyRiver === 'function') applyRiver(world); // the river cuts the beach, and through the sand (coast.js)
  if (typeof applyIslands === 'function') applyIslands(world);
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
  let coins = 0, ess = 0;
  for (const s of world.structures || []) { coins += STRUCTURES[s.kind].dawnPearls || 0; ess += STRUCTURES[s.kind].dawnEssence || 0; }
  if (coins) {
    const got = award(world, coins, 'salvage', null, { flat: true });
    if (got) logEvent(world, `Coins turned up in the silt around the wreck: +${got} pearls`, null, { cat: 'pond', pri: 0 });
  }
  if (ess) gainEssence(world, ess, 'the deep structures');
  sproutAround(world);
  seedPlants(world);
  applyStains(world);
  dawnFinds(world);
  if (typeof dawnCoast === 'function') dawnCoast(world);
  if (typeof dawnAbyss === 'function') dawnAbyss(world);
  if (typeof dawnQuirks === 'function') dawnQuirks(world);
}

// Plants take root around structures, rocks and plants that have been there a while.
function sproutAround(world) {
  const cap = world.W * world.H / 2200;
  if (world.plants.length >= cap) return;
  const sources = [
    ...(world.structures || []).map((s) => ({ x: s.x, y: s.y, age: world.days - s.born, k: STRUCTURES[s.kind].sprout || 1, r: STRUCTURES[s.kind].size + 8 })),
    ...world.rocks.map((r) => ({ x: r.x, y: r.y, age: world.days - (r.born ?? -8), k: 0.35, r: Math.max(r.a, r.b) + 4 })),
    ...(world.river ? [{ x: world.river.mouth[0], y: world.river.mouth[1], age: 9, k: 0.9, r: world.river.w + 4 }] : []), // the river brings seeds down
  ];
  let grown = 0;
  for (const src of sources) {
    if (src.age < 1 || Math.random() > 0.3 * src.k || world.plants.length >= cap) continue;
    for (let tries = 0; tries < 4; tries++) {
      const a = rand(0, TAU), d = src.r + rand(2, 16), x = src.x + Math.cos(a) * d, y = src.y + Math.sin(a) * d;
      if (x < 8 || y < 8 || x > world.W - 8 || y > world.H - 8 || (world.shore && shoreAt(world, x, y) > world.tide.level - 0.25)) continue;
      if (world.plants.filter((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 400).length >= 3) continue;
      const salt = saltAt(world, x, y) > 0, deep = depthAt(world, x, y) > 0.35;
      const kind = deep ? (salt ? 'blackcoral' : 'glowcap') : salt ? pick(['coral', 'coral', 'anemone', 'weed']) : pick(['weed', 'weed', 'eelgrass', 'marimo']);
      const p = sprouting(makePlant(kind, world, x, y, kind === 'weed' ? { habitat: salt ? 'salt' : 'fresh' } : {}));
      p.born = world.days;
      world.plants.push(p);
      grown++;
      break;
    }
  }
  if (grown) logEvent(world, `${grown} new plant${grown > 1 ? 's' : ''} took root around the old stones and structures`, null, { cat: 'life', pri: 0, key: 'sprout' });
}

// ---- plant life ---------------------------------------------------------------------------------------
// Every plant grows from a seedling, lives out its span (in pond days, by kind:
// weeds and duckweed come and go, corals and moss balls last), then dies back
// and is gone. Mature plants seed around them each dawn, so the pond fills in
// over time without overcrowding. The pond's maturity (plant life against its
// size) decides which animals it can support (see succession in main.js).
const PLANT_LIFE = {
  weed: [0.25, 30, 60], eelgrass: [0.22, 30, 60], duckweed: [0.35, 15, 30], lily: [0.22, 20, 45], marimo: [0.08, 100, 200],
  anemone: [0.15, 60, 120], coral: [0.09, 80, 150], urchin: [0.15, 40, 80], blackcoral: [0.05, 150, 260], glowcap: [0.25, 20, 40],
}; // [growth per day, lifespan in days (min, max)]
const SEEDS = { weed: 0.14, eelgrass: 0.12, duckweed: 0.2, lily: 0.1, marimo: 0.04, anemone: 0.05, coral: 0.05, urchin: 0.04, blackcoral: 0.03, glowcap: 0.12 };

function sprouting(p, growth = 0.15) {
  const L = PLANT_LIFE[p.make] || [0.4, 40, 80];
  p.growth = growth; p.age = 0; p.span = rand(L[1], L[2]);
  return p;
}

let plantTick = 0;
function updatePlantLife(world, dt) {
  plantTick -= dt;
  if (plantTick > 0) return;
  const step = (1 - plantTick) / world.opts.dayLength; // pond days since the last tick
  plantTick = 1;
  let biomass = 0, died = 0;
  for (const list of [world.plants, world.pads]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.growth == null) { p.growth = 1; p.age = rand(0, 30); p.span = rand(...(PLANT_LIFE[p.make] || [0, 40, 80]).slice(1)); } // older saves: grown plants, mid-life
      const [rate] = PLANT_LIFE[p.make] || [0.4];
      p.age += step;
      // Litter nearby stunts it (hardy plants mind less).
      const foul = world.litter && world.litter.length ? Math.min(0.8, pollutionAt(world, p.x, p.y) * 1.5 * (1 - 0.3 * ((p.tr && p.tr.hardy) || 0))) : 0;
      if (p.age < p.span) p.growth = Math.min(1, p.growth + rate * step * (1 - foul));
      else p.growth -= 0.4 * step; // dying back
      if (p.growth < 0.12) {
        if (p.oi != null) (list === world.pads ? world.removed.pads : world.removed.plants).push(p.oi);
        p.dead = true;
        list.splice(i, 1);
        died++;
        continue;
      }
      biomass += p.growth;
    }
  }
  world.maturity = clamp(biomass / (world.W * world.H / 4500), 0, 1); // 1: about as much as a wild pond grows
  if (died) logEvent(world, `${died} old plant${died > 1 ? 's' : ''} died back`, null, { cat: 'life', pri: 0, key: 'plants-died', merge: (e) => `${e.n} old plants died back` });
}

// Each dawn, mature plants may drop a seedling nearby (room permitting).
function seedPlants(world) {
  const cap = world.W * world.H / 2200;
  let seeded = 0;
  for (const p of [...world.plants, ...world.pads]) {
    if (world.plants.length + world.pads.length >= cap || seeded >= 10) break;
    if ((p.growth ?? 1) < 0.9 || Math.random() > (SEEDS[p.make] || 0.05) * (1 + 0.8 * ((p.tr && p.tr.seed) || 0))) continue;
    const a = rand(0, TAU), d = rand(12, 30), x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (x < 8 || y < 8 || x > world.W - 8 || y > world.H - 8 || (world.shore && shoreAt(world, x, y) > world.tide.level - 0.2)) continue;
    if ((p.make === 'blackcoral' || p.make === 'glowcap') && depthAt(world, x, y) < 0.3) continue;
    if (world.plants.filter((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < 400).length >= 3) continue;
    const child = sprouting(makePlant(p.make, world, x, y, { ...(p.args || {}) }));
    child.born = world.days;
    (p.make === 'lily' ? world.pads : world.plants).push(child);
    seeded++;
  }
}

// ---- stains: the ground discolours around old things -------------------------------------------
// The floor keeps an unstained copy (from bakeBackground); each day the stains are
// painted over it again, a little wider and deeper than before.

const STAIN_FRESH = hexToInt('#34461c'), STAIN_SALT = hexToInt('#6e3a5e'), STAIN_DRY = hexToInt('#8a8448');

// (With rect, only that part is repainted: the rest of the floor keeps its stains.)
let STAIN_BUF = null;
function applyStains(world, rect = null) {
  if (!world.bgBase) return;
  const { W, H } = world;
  if (!STAIN_BUF || STAIN_BUF.length !== W * H) STAIN_BUF = new Float32Array(W * H);
  const stain = STAIN_BUF, [qx0, qy0, qx1, qy1] = rect || [0, 0, W - 1, H - 1];
  if (rect) for (let y = qy0; y <= qy1; y++) stain.fill(0, qx0 + y * W, qx1 + 1 + y * W); else stain.fill(0);
  const sources = [
    ...(world.structures || []).map((s) => [s.x, s.y, world.days - s.born, STRUCTURES[s.kind].size + 10, s.seed]),
    ...world.rocks.map((r) => [r.x, r.y, world.days - (r.born ?? -8), Math.max(r.a, r.b) + 4, r.seed]),
    ...world.plants.filter((p) => p.born != null).map((p) => [p.x, p.y, world.days - p.born, 5, p.seed]),
  ];
  for (const [sx, sy, age, base, seed] of sources) {
    if (age < 0.5) continue;
    const R = Math.min(base + 34, base * 0.4 + 5 + age * 1.6), depth = Math.min(0.5, 0.06 + age * 0.035);
    if (sx + R < qx0 || sx - R > qx1 || sy + R < qy0 || sy - R > qy1) continue;
    for (let y = Math.max(qy0, Math.floor(sy - R)); y <= Math.min(qy1, Math.ceil(sy + R)); y++) {
      for (let x = Math.max(qx0, Math.floor(sx - R)); x <= Math.min(qx1, Math.ceil(sx + R)); x++) {
        const d = Math.hypot(x - sx, y - sy);
        if (d >= R) continue;
        const v = (1 - d / R) * depth * (0.55 + 0.9 * vnoise(x * 0.14, y * 0.14, seed % 71));
        const p = x + y * W;
        if (v > stain[p]) stain[p] = v;
      }
    }
  }
  const bg = world.bg, bgL = world.bgLight, bgD = world.bgDry, shore = world.shore;
  for (let y = qy0; y <= qy1; y++) {
    for (let x = qx0, p = qx0 + y * W; x <= qx1; x++, p++) {
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
  dream: { label: 'The deep dream', eld: true },
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
    if (i === 0 && H.infuse) { applyAncientGene(g, H.infuse); H.infuse = null; }
    // Bred for the deep dream: the mark, now and then, stronger under the lamp.
    if (focus.eld && Math.random() < 0.18 + 0.06 * H.levels.lamp) g.eld = true;
    if (focus.eld) { /* the other traits are left as inheritance made them */ } else if (focus.mutate || H.levels.lamp) {
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
  deepenBy(world, 0.02);
  const ess = gainEssence(world, 2 + H.levels.tank, 'hatchery');
  logEvent(world, `The hatchery hatched ${n} young from ${a.name} & ${b.name}, bred for ${focus.label.toLowerCase()} · +${ess} essence`, babies[0], { cat: 'life', pri: 1, key: 'hatch-brood', merge: (e) => `The hatchery hatched ${e.n} broods` });
}

// Schooling fish hatch (or come back) as a school of their own.
function schoolFor(rec, s) {
  if (rec.k === 'tetra') return { tx: s.x, ty: s.y, tz: 22, until: 0, kind: rec.schoolKind || 'neon' };
  if (rec.k === 'wild' && rec.args.sp && rec.args.sp.schooling) return { tx: s.x, ty: s.y, tz: (rec.args.sp.zMin + rec.args.sp.zMax) / 2, until: 0, wild: rec.args.sp };
  return null;
}

// Breeding lines in the pond with at least two grown animals, each with its
// most valuable pair, most valuable lines first. With one animal already
// stocked, only its own line, as single animals to pair it with.
function hatchCandidates(world) {
  const H = world.hatchery, lines = new Map(), worth = (c) => recycleValue(c) + tierOf(c.life.traits) * 10;
  for (const c of world.creatures) {
    if (!c.life || c.leaving || c.unsettled || c.dying || c.species === 'tadpole' || c.life.scale < 0.9 || !BREED[c.species]) continue;
    const key = breedKey(c);
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(c);
  }
  const out = [];
  for (const [key, list] of lines) {
    if (H.stock.length === 1 ? key !== H.stock[0].key : list.length < 2) continue;
    list.sort((a, b) => worth(b) - worth(a));
    out.push({ key, list, value: list.slice(0, 2).reduce((a, c) => a + worth(c), 0) });
  }
  return out.sort((a, b) => b.value - a.value);
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
