'use strict';
// The land remembers. Over the days the floor takes on the character of what lives, dies, grows
// and stands on it, and slowly the landscape changes to match.
//  - A memory of the floor: a coarse grid over the pond, eight things it can hold: bone (what's
//    died there), life (what thrives there), light, the dark, madness, the alien, the cryptid (the
//    great things that pass) and the ancient. Animals leave their nature where they spend their time;
//    skeletons sink into the sand and enrich it by what they were; plants add to it as they grow and
//    as they die; structures, artifacts, blood and fossils mark it. Each dawn it fades a little and
//    spreads a little.
//  - What it becomes: where one thing holds, the floor turns: bone sand, the green, glow sand, the
//    ashen floor, red silt, the glass, the watched deep, fossil beds. Each tints and textures the
//    floor (repainted a patch at a time, so it changes slowly), and changes what happens there:
//    plants grow faster on bone and in the green and slower on ash, the green seeds itself, glow sand
//    calms the water and red silt sours it, the ash hurries the mark, the glass breeds parasites,
//    fossils turn up in fossil beds, and the watched deep wears deeper.
//  - Formations: where it holds strongly, the land grows its own features over days (and loses them
//    when it fades): bone reefs, mossy hummocks or coral heads, glow crystals, black shards, red spurs,
//    glass spires, great footprints, stromatolites.
//  - Skeletons: some stay, half sunk, and sink over the days into the sand they enrich.
//  - Islands: each has its own character from its seed (a palm cay, a coral cay, a rocky skerry, a reed
//    isle, a willow islet, a black islet out over the deep) and its own living flora that sprouts,
//    grows, dies and comes back, leaning toward what the land around it has become. Islands close to
//    each other grow a sandbar between them and join, and what they become together depends on what
//    each has become: a lagoon atoll, a black causeway, a bridge of glass, a fossil ridge, a bone bar,
//    twin cays.
// Everything moves slowly: formations, flora and sinking bones ease between one dawn's state and the
// next through the day. None of it travels in pond links (the saves and the server copy keep it).

const LAND_CELL = 16;
const LAND = {
  bone: { name: 'bone sand', col: '#e2d4ae', fleck: '#fff8e8', note: 'rich with old bones: plants grow faster, and scavengers gather' },
  life: { name: 'the green', col: '#3a7a30', fleck: '#8ad05a', note: 'where life thrives: plants take root by themselves and grow faster, and animals are content' },
  light: { name: 'glow sand', col: '#e8e4a0', fleck: '#ffffd8', note: 'lit by what lives there: it glimmers at night and calms the water' },
  dark: { name: 'the ashen floor', col: '#221a2a', fleck: '#6a3a8a', note: 'the dark has soaked in: plants wither, and the mark comes on faster' },
  mad: { name: 'red silt', col: '#842818', fleck: '#e04a2a', note: 'blood and madness: the water here is quick to anger' },
  alien: { name: 'the glass', col: '#9a3ac8', fleck: '#ff9aff', note: 'something not of this world: glass grows from it, and parasites breed' },
  cryptid: { name: 'the watched deep', col: '#0e3a48', fleck: '#3ab0c8', note: 'where the great things pass: the floor wears deeper, and the mythic come oftener' },
  ancient: { name: 'fossil beds', col: '#9a7440', fleck: '#e8c890', note: 'old stone and older life: fossils turn up here' },
};
const LAND_KEYS = Object.keys(LAND); // (the save's order: append only)
const LAND_FADE = { bone: 0.985, life: 0.965, light: 0.96, dark: 0.975, mad: 0.94, alien: 0.975, cryptid: 0.97, ancient: 0.99 };
const LAND_COL = Object.fromEntries(LAND_KEYS.map((k) => [k, hexToInt(LAND[k].col)]));
const LAND_FLECK = Object.fromEntries(LAND_KEYS.map((k) => [k, hexToInt(LAND[k].fleck)]));
const PREHISTORIC = new Set(['trilobite', 'anomalocaris', 'ammonite', 'eurypterid', 'lungfish', 'dunkleosteus', 'coelacanth', 'placoderm', 'temnospondyl',
  'plesiosaur', 'mosasaur', 'hyneria', 'opabinia', 'helicoprion', 'arandaspis', 'tiktaalik', 'sturgeon', 'paddlefish']);

const LAND_M = {
  coralSand: mat('#a09a88', '#c8c2ae', '#e8e2d0', '#fffaf0'), mud: mat('#3a2e1e', '#54442c', '#6e5c3e', '#8a7652'),
  lichen: mat('#3a4a2a', '#56663a', '#74844e', '#98a868'), reed: mat('#4a4a1a', '#6e6a26', '#948a36', '#bcae4e'),
  cattail: mat('#2a180a', '#422612', '#5c361a', '#784a24'), willow: mat('#3a5a14', '#5a821e', '#7eaa2e', '#a8d04a'),
  fern: mat('#14401a', '#1e602a', '#2e843c', '#48ac56'), pine: mat('#0e2a18', '#163e22', '#205430', '#2e6c40'),
  glowbloom: mat('#8a8a2a', '#c8c848', '#f0f07a', '#ffffd0'), dead: mat('#3a3630', '#56504a', '#76706a', '#9a948c'),
  blackmoss: mat('#0e0a14', '#1a1224', '#281c36', '#3a2a4a'), glass: mat('#6a1a8a', '#a03ac8', '#d070f0', '#f8d0ff'),
  glassCyan: mat('#0a5a6a', '#1a8aa0', '#3ac8e0', '#b0f4ff'), cycad: mat('#2a3a14', '#3e5a1e', '#56782a', '#76983c'),
  thorn: mat('#4a0e0a', '#7a1a12', '#a82a1e', '#d8503a'), obsidian: mat('#08060c', '#141020', '#221a34', '#3a2c52'),
  rust: mat('#3a1408', '#6a2410', '#9a3a1c', '#c8583a'), crystal: mat('#8a8a5a', '#c8c89a', '#ececc8', '#ffffff'),
  strom: mat('#5a4a2a', '#7e6a40', '#a28a5a', '#c6ae7c'), stromBand: mat('#3e321c', '#5a4a2a', '#766240', '#927c56'),
  print: mat('#0a1a20', '#12262e', '#1a343e', '#24444e'), moss: mat('#243a1c', '#34522a', '#4a6e3a', '#648c4e'),
  bush: mat('#1a4a18', '#2a6a22', '#3e8e30', '#5cb048'), flower: mat('#8a2a6a', '#c04a9a', '#f07ac8', '#ffc0ec'),
};

// ---- the grid ---------------------------------------------------------------------------------------------
function landGrid(world) {
  const cols = Math.max(1, Math.ceil(world.W / LAND_CELL)), rows = Math.max(1, Math.ceil(world.H / LAND_CELL));
  let L = world.land;
  if (!L || L.cols !== cols || L.rows !== rows) {
    const old = L;
    L = world.land = { cols, rows, ch: {}, tint: null, dirty: true, paint: null };
    for (const k of LAND_KEYS) L.ch[k] = new Float32Array(cols * rows);
    if (old) for (const k of LAND_KEYS) for (let y = 0; y < Math.min(rows, old.rows); y++) for (let x = 0; x < Math.min(cols, old.cols); x++) L.ch[k][x + y * cols] = old.ch[k][x + y * old.cols];
  }
  return L;
}
const landCell = (L, x, y) => clamp((x / LAND_CELL) | 0, 0, L.cols - 1) + clamp((y / LAND_CELL) | 0, 0, L.rows - 1) * L.cols;
function landVal(world, x, y, k) { const L = world.land; return L ? L.ch[k][landCell(L, x, y)] : 0; }
// Add v at (x, y), and less out to r cells around.
function landAdd(world, x, y, k, v, r = 0) {
  if (!(v > 0) || !world.W) return;
  const L = landGrid(world), A = L.ch[k], cx = clamp((x / LAND_CELL) | 0, 0, L.cols - 1), cy = clamp((y / LAND_CELL) | 0, 0, L.rows - 1);
  const R = Math.ceil(r);
  for (let j = -R; j <= R; j++) {
    const yy = cy + j;
    if (yy < 0 || yy >= L.rows) continue;
    for (let i = -R; i <= R; i++) {
      const xx = cx + i, d = Math.hypot(i, j);
      if (xx < 0 || xx >= L.cols || d > r + 0.01) continue;
      const q = xx + yy * L.cols;
      A[q] = Math.min(1, A[q] + v * (r ? 1 - 0.6 * d / (r + 0.5) : 1));
    }
  }
  L.dirty = true;
}
// What holds at a place: the strongest channel and how strongly (or null).
function landBiome(world, x, y, min = 0.22) {
  const L = world.land;
  if (!L) return null;
  const q = landCell(L, x, y);
  let best = null, bv = min;
  for (const k of LAND_KEYS) { const v = L.ch[k][q]; if (v > bv) { bv = v; best = k; } }
  return best ? { k: best, v: bv } : null;
}
// Averages over a circle (for an island, or a place's mood).
function landMean(world, x, y, R) {
  const L = world.land, out = Object.fromEntries(LAND_KEYS.map((k) => [k, 0]));
  if (!L) return out;
  let n = 0;
  for (let yy = y - R; yy <= y + R; yy += LAND_CELL / 2) for (let xx = x - R; xx <= x + R; xx += LAND_CELL / 2) {
    if ((xx - x) ** 2 + (yy - y) ** 2 > R * R || xx < 0 || yy < 0 || xx >= world.W || yy >= world.H) continue;
    const q = landCell(L, xx, yy);
    for (const k of LAND_KEYS) out[k] += L.ch[k][q];
    n++;
  }
  if (n) for (const k of LAND_KEYS) out[k] /= n;
  return out;
}
const topOf = (m, min = 0.12) => { let best = null, bv = min; for (const k of LAND_KEYS) if (m[k] > bv) { bv = m[k]; best = k; } return best; };

// ---- what things leave --------------------------------------------------------------------------------------
// An animal's nature, as what it leaves on the land (weights 0..1).
function landNature(c) {
  const L = c.life, n = {};
  if (!L) return n;
  const st = L.genome.eld && typeof eldStage === 'function' ? eldStage(L) : -1;
  if (st >= 0) n.dark = 0.4 + 0.3 * st;
  if (typeof hasWarp === 'function') {
    if (hasWarp(L, 'darkloving')) n.dark = (n.dark || 0) + 0.3;
    if (hasWarp(L, 'feral') || hasWarp(L, 'abomination')) n.mad = 0.6;
  }
  if (L.traits.includes('madness') || L.traits.includes('twitching')) n.mad = (n.mad || 0) + 0.5;
  if (L.para || L.genome.xeno) n.alien = 0.7;
  if ((DEEP[c.species] && DEEP[c.species].mythic) || c.species === 'deepone' || c.species === 'dreamer' || L.wanderer) n.cryptid = 0.8;
  if (PREHISTORIC.has(c.species) || L.traits.includes('ancient')) n.ancient = 0.7;
  if (L.genome.glow || L.genome.xeno === 3 || LIGHT_SPECIES[c.species] || L.paragon) n.light = 0.5;
  if ((L.comfort ?? 0) > 0.6 && L.energy > 0.5 && !n.dark && !n.mad) n.life = 0.5;
  return n;
}

let landClock = 0;
function landSample(world) {
  // Where the animals spend their time.
  for (const c of world.creatures) {
    if (!c.life || c.leaving || c.dying) continue;
    const n = landNature(c), big = 0.6 + 0.2 * ((SPECIES_STATS[c.species] || SPECIES_STATS.wild).size || 1);
    for (const k in n) landAdd(world, c.x, c.y, k, 0.0009 * n[k] * big);
  }
  // Blood in the water, oil on it.
  for (const b of world.bloodSpots || []) landAdd(world, b.x, b.y, 'mad', 0.004 * Math.min(2, b.amt || 1));
  for (const s of world.slicks || []) landAdd(world, s.x, s.y, 'dark', 0.0015 * (s.oil || 1), 1);
}

// A skeleton, sunk into the sand: rich where it lies, and marked by what it was.
function landBones(world, rm, k = 1) {
  const size = clamp((rm.bones ? rm.bones.length : 3) / 5 * (rm.thick || 1), 0.4, 3), r = size > 1.5 ? 2 : 1;
  landAdd(world, rm.x, rm.y, 'bone', 0.22 * size * k, r);
  for (const ch in rm.nature || {}) landAdd(world, rm.x, rm.y, ch, 0.14 * rm.nature[ch] * size * k, r);
  // Some stay, half sunk, and sink over the days.
  if (k >= 1 && rm.bones && rm.bones.length > 1 && Math.random() < 0.3 + 0.08 * (rm.tier || 0) && (!world.shore || shoreAt(world, rm.x, rm.y) < 0.9)) {
    const B = world.boneBeds || (world.boneBeds = []), top = topOf(rm.nature || {}, 0.2);
    if (B.length >= 60) B.shift();
    const b0 = rm.bones[0], b1 = rm.bones[rm.bones.length - 1];
    B.push({ x: rm.x, y: rm.y, ang: Math.atan2(b1[1] - b0[1], b1[0] - b0[0]), len: Math.min(60, Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) + 4), w: size, seed: newSeed(), born: world.days, k: top || 'bone', gs: 0 });
    landRebake(world, rm.x, rm.y, 40);
  }
}
// A plant that dies back leaves its goodness (and whatever it was touched by).
function landHumus(world, p) {
  const k = p.make === 'coral' || p.make === 'blackcoral' ? 0.05 : 0.03;
  if (typeof shedDetritus === 'function') shedDetritus(world, p.x, p.y, randi(1, 3), p.tr && p.tr.eld ? 'dark' : p.tr && p.tr.glow ? 'light' : 'life');
  landAdd(world, p.x, p.y, 'life', k);
  if (p.tr && p.tr.glow) landAdd(world, p.x, p.y, 'light', 0.05);
  if (p.tr && p.tr.eld) landAdd(world, p.x, p.y, 'dark', 0.06);
}
// How fast a plant grows here (1 is normal).
function landGrow(world, x, y) {
  const L = world.land;
  if (!L) return 1;
  const q = landCell(L, x, y), C = L.ch;
  return clamp(1 + 0.9 * C.bone[q] + 0.6 * C.life[q] + 0.2 * C.light[q] + 0.3 * C.ancient[q] - 0.6 * C.dark[q] - 0.4 * C.mad[q], 0.3, 2.2);
}

// What structures and other things leave each dawn.
const STRUCT_LAND = {
  shrine: { light: 0.05 }, lantern: { light: 0.06 }, grotto: { light: 0.05 }, quarantine: { light: 0.04 }, idol: { dark: 0.06, cryptid: 0.03 },
  gate: { dark: 0.08, cryptid: 0.05 }, cradle: { dark: 0.1, cryptid: 0.08 }, spire: { dark: 0.05, mad: 0.05 }, ossuary: { dark: 0.04, bone: 0.06 },
  whalefall: { bone: 0.08, life: 0.03 }, smoker: { life: 0.03 }, vent: { life: 0.03 }, spring: { life: 0.04 }, seedbed: { life: 0.05 },
  kelp: { life: 0.05 }, drowned: { life: 0.04, ancient: 0.01 }, reefnursery: { life: 0.04 }, spawnbed: { life: 0.03 }, amphibpool: { life: 0.03 },
  hatchery: { life: 0.02 }, rig: { dark: 0.04 }, brinepool: { life: 0.03, alien: 0.01 }, rootcathedral: { life: 0.05, ancient: 0.02 }, island: { life: 0.02 },
  broodchamber: { life: 0.02, cryptid: 0.01 },
};
function landDawnDeposits(world) {
  for (const s of world.structures || []) {
    const D = STRUCT_LAND[s.kind], r = Math.min(4, STRUCTURES[s.kind].r / LAND_CELL * 0.6);
    if (D) for (const k in D) landAdd(world, s.x, s.y, k, D[k], r);
    if (s.kind === 'island' && s.branch === 'life') landAdd(world, s.x, s.y, 'light', 0.03 * (s.blv || 1), r + 1);
    if (s.kind === 'island' && s.branch === 'dark') { landAdd(world, s.x, s.y, 'dark', 0.04 * (s.blv || 1), r + 1); landAdd(world, s.x, s.y, 'mad', 0.01 * (s.blv || 1), r + 1); }
  }
  for (const a of world.xeno || []) landAdd(world, a.x, a.y, 'alien', 0.08 + 0.01 * (a.gen || 0), 3);
  for (const a of world.xenoShards || []) landAdd(world, a.x, a.y, 'alien', 0.03, 1);
  for (const f of world.fossils || []) landAdd(world, f.x, f.y, 'ancient', 0.05, 1);
  for (const p of world.plants) {
    if ((p.growth ?? 1) < 0.5) continue;
    landAdd(world, p.x, p.y, 'life', 0.006);
    if (p.tr && p.tr.glow) landAdd(world, p.x, p.y, 'light', 0.02);
    if (p.tr && p.tr.eld) landAdd(world, p.x, p.y, 'dark', 0.03);
    if (typeof LIGHT_PLANTS !== 'undefined' && LIGHT_PLANTS[p.make]) landAdd(world, p.x, p.y, 'light', 0.01);
  }
  for (const b of world.boneBeds || []) landAdd(world, b.x, b.y, 'bone', 0.01);
  // Joined islands feed what joined them (see isleJoins).
  for (const j of Object.values(world.isleJoins || {})) if (j.kind && ISLE_JOINS[j.kind].land) landAdd(world, j.x, j.y, ISLE_JOINS[j.kind].land, 0.04, 2);
}

// ---- each dawn: fade, spread, turn -------------------------------------------------------------------------
function dawnLand(world) {
  if (!world.W || world.observe) return;
  const L = landGrid(world);
  landDawnDeposits(world);
  const { cols, rows } = L, tmp = new Float32Array(cols * rows);
  for (const k of LAND_KEYS) {
    const A = L.ch[k], f = LAND_FADE[k];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const q = x + y * cols;
      let s = 0, n = 0;
      if (x > 0) { s += A[q - 1]; n++; } if (x < cols - 1) { s += A[q + 1]; n++; }
      if (y > 0) { s += A[q - cols]; n++; } if (y < rows - 1) { s += A[q + cols]; n++; }
      tmp[q] = (A[q] * 0.9 + (n ? s / n : A[q]) * 0.1) * f;
    }
    A.set(tmp);
  }
  L.dirty = true;
  landMilestones(world);
  landForms(world);
  landSeedsPlants(world);
  landIslands(world);
  landFossils(world);
  // The watched deep wears deeper.
  let cry = 0;
  for (const v of L.ch.cryptid) cry += v;
  if (cry > 1 && typeof deepenBy === 'function') deepenBy(world, Math.min(0.4, cry * 0.004), 'land');
}

// First sightings of each kind of ground, and when it spreads (doubling), in the journal.
const LAND_NEWS = {
  bone: 'The sand has gone rich and pale where the bones settled: bone sand. Plants will grow faster there',
  life: 'The floor has greened over where life thrives: the green. Plants will take root there by themselves',
  light: 'The sand glimmers now, where the lights have been: glow sand, and the water over it is calmer',
  dark: 'The floor has gone to ash where the dark has soaked in. The mark comes on faster there',
  mad: 'The silt has turned red where the blood and the madness were. The water there is quick to anger',
  alien: 'Glass is growing in the floor where the thing from the sky came down',
  cryptid: 'Something vast has passed that way often enough to mark the floor: the watched deep',
  ancient: 'The old stone shows through the sand: fossil beds',
};
function landMilestones(world) {
  const L = world.land, area = Object.fromEntries(LAND_KEYS.map((k) => [k, 0]));
  for (let q = 0; q < L.cols * L.rows; q++) {
    let best = null, bv = 0.3;
    for (const k of LAND_KEYS) if (L.ch[k][q] > bv) { bv = L.ch[k][q]; best = k; }
    if (best) area[best]++;
  }
  world.landArea = area;
  const seen = world.landSeen || (world.landSeen = {});
  for (const k of LAND_KEYS) {
    const n = area[k], was = seen[k] || 0;
    if (n >= 3 && !was) { seen[k] = n; logEvent(world, `✦ ${LAND_NEWS[k]}`, null, { cat: k === 'dark' || k === 'mad' || k === 'alien' || k === 'cryptid' ? 'pond' : 'life', pri: 2 }); }
    else if (was && n >= was * 2 && n >= 12) { seen[k] = n; logEvent(world, `${capFirst(LAND[k].name)} is spreading: ${n * LAND_CELL * LAND_CELL > 40000 ? 'a wide stretch of the floor' : 'more of the floor'} has turned`, null, { cat: 'life', pri: 1 }); }
  }
}

// Where the green holds, it seeds itself (with plants touched by what else is there).
function landSeedsPlants(world) {
  const L = world.land, cap = world.W * world.H / 2200;
  let grown = 0;
  const green = [];
  for (let q = 0; q < L.cols * L.rows; q++) if (L.ch.life[q] + 0.6 * L.ch.bone[q] >= 0.45) green.push(q);
  for (let tries = 0; tries < 10 && green.length && grown < 3 && world.plants.length < cap; tries++) {
    const q = green[randi(0, green.length - 1)], life = L.ch.life[q] + 0.6 * L.ch.bone[q];
    if (Math.random() > life * 0.6) continue;
    const x = ((q % L.cols) + Math.random()) * LAND_CELL, y = (((q / L.cols) | 0) + Math.random()) * LAND_CELL;
    if (x < 8 || y < 8 || x > world.W - 8 || y > world.H - 8 || (world.shore && shoreAt(world, x, y) > world.tide.level - 0.25)) continue;
    if (world.plants.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 144)) continue;
    const salt = saltAt(world, x, y) > 0, deep = depthAt(world, x, y) > 0.35;
    const kind = deep ? (salt ? 'blackcoral' : 'glowcap') : salt ? pick(['coral', 'anemone', 'weed', 'eelgrass']) : pick(['weed', 'eelgrass', 'marimo', 'weed']);
    const p = sprouting(makePlant(kind, world, x, y, kind === 'weed' ? { habitat: salt ? 'salt' : 'fresh' } : {}));
    p.born = world.days;
    if (L.ch.light[q] > 0.35) p.tr = { ...(p.tr || {}), glow: 1 };
    if (L.ch.dark[q] > 0.4) { p.tr = { ...(p.tr || {}), eld: 1 }; if (typeof VOID_SKIN !== 'undefined') VOID_SKIN[p.id] = 4; }
    world.plants.push(p);
    grown++;
  }
  if (grown) logEvent(world, `The green seeded ${grown} new plant${grown > 1 ? 's' : ''} by itself`, null, { cat: 'life', pri: 0, key: 'land-seeds', merge: (e) => `The green seeded new plants by itself (${e.n} times)` });
}

// Fossil beds turn up fossils (in the water, not only on the beach).
function landFossils(world) {
  const L = world.land;
  if ((world.fossils || []).length >= 3 || typeof Fossil !== 'function') return;
  let best = -1, bv = 0.4;
  for (let q = 0; q < L.cols * L.rows; q++) if (L.ch.ancient[q] > bv) { bv = L.ch.ancient[q]; best = q; }
  if (best < 0 || Math.random() > 0.15 + 0.3 * bv) return;
  const x = ((best % L.cols) + Math.random()) * LAND_CELL, y = (((best / L.cols) | 0) + Math.random()) * LAND_CELL;
  const kind = typeof pickFossil === 'function' ? pickFossil(world) : 'ammonite';
  world.fossils.push(new Fossil(x, y, kind, typeof fossilGene === 'function' ? fossilGene(kind) : pickAncientGene(), world.days));
  logEvent(world, `✦ Something old has worked loose from the fossil beds: ${FOSSIL_KINDS[kind]}`, null, { cat: 'rare', pri: 2 });
}

// ---- formations: the land grows its own features ----------------------------------------------------------
const FORMS = {
  bone: { name: 'A bone reef', note: 'old bones, sunk and settled into a reef of their own' },
  life: { name: 'A hummock', note: 'a mound the green has built, thick with growth (a coral head in salt water)' },
  light: { name: 'Glow crystals', note: 'crystals grown from glow sand; they shine at night' },
  dark: { name: 'Black shards', note: 'glassy black stone pushed up through the ash' },
  mad: { name: 'Red spurs', note: 'jagged red rock, raw as a wound' },
  alien: { name: 'Glass spires', note: 'glass that grew from the floor, in no shape of this world; they shine at night' },
  cryptid: { name: 'A great footprint', note: 'pressed into the floor by something that passed this way, and the bones of something it caught' },
  ancient: { name: 'Stromatolites', note: 'layered mounds, the oldest life there is, with old shells in them' },
};
function landForms(world) {
  const F = world.forms || (world.forms = []), L = world.land, cap = 24 + Math.round(world.W * world.H / 25000);
  for (let i = F.length - 1; i >= 0; i--) {
    const f = F[i], v = landVal(world, f.x, f.y, f.k);
    f.g = v > 0.3 ? Math.min(1, f.g + 0.12 + 0.1 * v) : f.g - 0.1;
    if (f.g <= 0 && f.gs <= 0.02) { F.splice(i, 1); landRebake(world, f.x, f.y, 26); }
  }
  // (Chosen among the cells where something holds strongly, a couple a dawn at most.)
  const strong = [];
  for (let q = 0; q < L.cols * L.rows; q++) { let best = null, bv = 0.5; for (const k of LAND_KEYS) if (L.ch[k][q] > bv) { bv = L.ch[k][q]; best = k; } if (best) strong.push([q, best, bv]); }
  let made = 0;
  for (let tries = 0; tries < 8 && strong.length && F.length < cap && made < 2; tries++) {
    const [q, best, bv] = strong[randi(0, strong.length - 1)];
    if (Math.random() > 0.3 + 0.4 * (bv - 0.5)) continue;
    const x = ((q % L.cols) + 0.2 + Math.random() * 0.6) * LAND_CELL, y = (((q / L.cols) | 0) + 0.2 + Math.random() * 0.6) * LAND_CELL;
    if ((world.shore && shoreAt(world, x, y) > 0.3) || F.some((f) => (f.x - x) ** 2 + (f.y - y) ** 2 < 1296)) continue;
    if ((world.structures || []).some((s) => Math.hypot(s.x - x, s.y - y) < (s.kind === 'island' ? islandRadius(world, s) + 14 : STRUCTURES[s.kind].size + 8))) continue;
    F.push({ k: best, x, y, seed: newSeed(), born: world.days, g: 0.1, gs: 0 });
    made++;
    if (!(world.formSeen || {})[best]) {
      world.formSeen = { ...(world.formSeen || {}), [best]: world.days };
      logEvent(world, `✦ The land is changing: ${FORMS[best].name.toLowerCase()} ${best === 'cryptid' ? 'has appeared' : 'is growing'} on ${LAND[best].name}`, null, { cat: 'life', pri: 2 });
    }
  }
}
const formAt = (world, x, y) => (world.forms || []).find((f) => f.gs > 0.15 && (f.x - x) ** 2 + (f.y - y) ** 2 < (8 + 10 * f.gs) ** 2);

// ---- islands: a character each, and living flora -----------------------------------------------------------
const ISLE_KINDS = {
  palm: { name: 'a palm cay', water: 'any', w: 3, palm: true, flora: { palm: 2, bush: 2, flower: 2, grass: 3 } },
  coral: { name: 'a coral cay', water: 'salt', w: 3, palm: true, sand: 'coralSand', flora: { palm: 1, shrub: 3, grass: 3, flower: 1 } },
  rock: { name: 'a rocky skerry', water: 'any', w: 2, sand: 'stone', grass: 'lichen', flora: { moss: 3, pine: 2, shrub: 2 } },
  reed: { name: 'a reed isle', water: 'fresh', w: 3, sand: 'mud', flora: { reed: 5, bush: 1, flower: 2 } },
  willow: { name: 'a willow islet', water: 'fresh', w: 3, flora: { willow: 2, fern: 3, reed: 2, flower: 1 } },
  basalt: { name: 'a black islet', water: 'deep', w: 0, sand: 'basalt', grass: 'moss2', flora: { fern: 3, moss: 3, pine: 1 } },
};
// What the land around an island adds to what grows on it.
const ISLE_BIOME_FLORA = {
  life: { bush: 2, flower: 2, fern: 1 }, light: { glowbloom: 4 }, dark: { deadtree: 3, blackmoss: 3 }, mad: { thorn: 4 },
  alien: { glassshoot: 4 }, ancient: { cycad: 3, horsetail: 3 }, bone: { bones: 2, grass: 2 }, cryptid: { fern: 2, bones: 2 },
};
const ISLE_EVO = {
  life: 'lush with the green', light: 'aglow with blooms', dark: 'withered to black moss and dead wood', mad: 'overgrown with red thorns',
  alien: 'sprouting glass', ancient: 'grown over with ancient plants', bone: 'strewn with bleached bones', cryptid: 'shadowed by something vast',
};
function isleOf(s) {
  if (s.isle) return s.isle;
  if (typeof world === 'undefined' || !world.structures || !world.structures.includes(s)) return 'palm'; // (the build icon)
  const h = hash2(s.seed % 997, 17, 3), deep = (s.deep || 0) > 0.15;
  if (deep && h < 0.6) return (s.isle = 'basalt');
  const salt = world.opts.habitat === 'salt' || (world.opts.habitat === 'mixed' && saltAt(world, s.x, s.y) > 0);
  const opts = Object.entries(ISLE_KINDS).filter(([, K]) => K.w && (K.water === 'any' || K.water === (salt ? 'salt' : 'fresh')));
  let r = hash2(s.seed % 991, 29, 11) * opts.reduce((a, [, K]) => a + K.w, 0);
  for (const [k, K] of opts) if ((r -= K.w) <= 0) return (s.isle = k);
  return (s.isle = 'palm');
}
// For the island's bake (structures.js): its sand and grass, and whether it has the palm.
function isleLook(s) {
  const K = ISLE_KINDS[isleOf(s)];
  const realm = typeof realmShown === 'function' && realmShown(s); // (a realm grounds it in its own stone: realms.js)
  if (realm) return { palm: false, sand: realm.sand, grass: realm.grass, kind: isleOf(s) };
  return { palm: !!K.palm, sand: K.sand ? LAND_M[K.sand] || SM[K.sand] : SM.sand, grass: K.grass ? LAND_M[K.grass] || SM[K.grass] : SM.grass, kind: isleOf(s) };
}
const pickWeighted = (w) => { let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0); for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k; return Object.keys(w)[0]; };

function islandFloraRebakeRadius(world, s) {
  let reach = islandRadius(world, s) * 1.5 + 8;
  for (const f of s.flora || []) reach = Math.max(reach, Math.hypot(f.x, f.y) + 12);
  return reach;
}

function landIslands(world) {
  const isles = (world.structures || []).filter((s) => s.kind === 'island' && !s.anim);
  for (const s of isles) {
    const R = islandRadius(world, s), m = landMean(world, s.x, s.y, R * 1.6), top = topOf(m, 0.15), K = ISLE_KINDS[isleOf(s)];
    const was = s.evo;
    s.evo = top;
    if (top && top !== was) logEvent(world, `The island${s.name ? ` ${s.name}` : ''} is ${ISLE_EVO[top]}`, null, { cat: 'life', pri: 1 });
    const fl = s.flora || (s.flora = []), day = world.days;
    // Grow, age, die (dead wood lingers a few days, then goes back to the sand).
    for (let i = fl.length - 1; i >= 0; i--) {
      const f = fl[i], age = day - f.b;
      if (!f.dead && typeof islandDryGround === 'function' && !islandDryGround(world, s, s.x + f.x, s.y + f.y)) {
        f.dead = 1; f.b = day; f.span = rand(1, 2); continue; // the shaped coast, tide or lava has taken its ground
      }
      if (age < f.span) f.g = Math.min(1, f.g + 0.25);
      else if (!f.dead) { f.dead = 1; f.b = day; f.span = rand(2, 4); }
      else { fl.splice(i, 1); landAdd(world, s.x + f.x, s.y + f.y, 'life', 0.02); }
    }
    // New growth, as much as the island (and the land around it) can carry.
    const cap = Math.round(clamp((5 + 4 * ((s.stack || 1) - 1)) * (0.7 + 0.8 * m.life + 0.5 * m.bone + 0.3 * m.light - 0.4 * m.dark) * (typeof isleFloraK === 'function' ? isleFloraK(s) : 1), 2, 64));
    const weights = { ...K.flora };
    for (const k of LAND_KEYS) if (m[k] > 0.15 && ISLE_BIOME_FLORA[k]) for (const [t, w] of Object.entries(ISLE_BIOME_FLORA[k])) weights[t] = (weights[t] || 0) + w * m[k] * 4;
    if (typeof isleFloraWeights === 'function') isleFloraWeights(s, weights); // (as it matures, bigger trees: isles.js)
    if (typeof climateFloraWeights === 'function') climateFloraWeights(world, weights); // (and the pond's climate: flora.js)
    for (let n = 0; n < 3 && fl.length < cap; n++) {
      const a = rand(0, TAU), coast = typeof isleOutline === 'function' ? isleOutline(world, s, a) : 1;
      const d = Math.sqrt(Math.random()) * R * coast * 0.8, x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (typeof islandDryGround === 'function' && !islandDryGround(world, s, s.x + x, s.y + y)) continue;
      if (fl.some((f) => (f.x - x) ** 2 + (f.y - y) ** 2 < 16)) continue;
      const t = pickWeighted(weights), big = ['palm', 'willow', 'pine', 'deadtree', 'cycad'].includes(t);
      fl.push({ t, x: +x.toFixed(1), y: +y.toFixed(1), b: day, span: rand(big ? 18 : 6, big ? 40 : 16), g: 0.1, gs: 0, s: randi(0, 9999) });
    }
    landRebake(world, s.x, s.y, islandFloraRebakeRadius(world, s));
  }
  isleJoinsDawn(world, isles);
}

// ---- islands that join -------------------------------------------------------------------------------------
const ISLE_JOINS = {
  lagoon: { name: 'a lagoon atoll', note: 'the water between them is sheltered: calm, and a nursery', land: 'life' },
  causeway: { name: 'the black causeway', note: 'standing stones along the bar: the dark soaks into it, and the mark comes on faster', land: 'dark' },
  glass: { name: 'a bridge of glass', note: 'glass grows along the bar', land: 'alien' },
  fossil: { name: 'a fossil ridge', note: 'old stone along the bar, and old life in it', land: 'ancient' },
  bonebar: { name: 'a bone bar', note: 'bleached bones along the bar, making the sand rich', land: 'bone' },
  lantern: { name: 'a lantern walk', note: 'glow blooms along the bar, lit at night', land: 'light' },
  thornbar: { name: 'a thorn bar', note: 'red thorns along the bar; the water there is quick to anger', land: 'mad' },
  twin: { name: 'twin cays', note: 'a sandbar joins them: crabs and turtles cross', land: null },
};
// Which pairs are close enough to grow a bar, and how far along it is (from their ages: links regrow it).
function islePairs(world) {
  const isles = (world.structures || []).filter((s) => s.kind === 'island' && !s.anim), out = [];
  for (let i = 0; i < isles.length; i++) for (let j = i + 1; j < isles.length; j++) {
    const a = isles[i], b = isles[j], ra = islandRadius(world, a), rb = islandRadius(world, b), d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > (ra + rb) * 1.9 || d < (ra + rb) * 0.85) continue;
    const grow = clamp((world.days - Math.max(a.born || 0, b.born || 0) - 1.5) / 10, 0, 1);
    if (grow > 0) out.push({ a, b, ra, rb, d, grow, key: `${Math.min(a.seed, b.seed)}-${Math.max(a.seed, b.seed)}` });
  }
  return out;
}
function joinKindOf(world, a, b) {
  const ev = [a, b].map((s) => (s.branch === 'dark' ? 'dark' : s.branch === 'life' ? 'life' : s.evo || null));
  const has = (k) => ev.includes(k);
  return has('dark') ? 'causeway' : has('alien') ? 'glass' : has('mad') ? 'thornbar' : has('ancient') ? 'fossil' : has('bone') ? 'bonebar'
    : has('light') ? 'lantern' : ev.every((e) => e === 'life') ? 'lagoon' : isleOf(a) === 'coral' && isleOf(b) === 'coral' ? 'lagoon' : 'twin';
}
function isleJoinsDawn(world) {
  const J = world.isleJoins || (world.isleJoins = {}), live = new Set();
  for (const P of islePairs(world)) {
    live.add(P.key);
    const was = J[P.key], kind = P.grow >= 1 ? joinKindOf(world, P.a, P.b) : null;
    J[P.key] = { x: (P.a.x + P.b.x) / 2, y: (P.a.y + P.b.y) / 2, grow: P.grow, kind };
    if (kind && (!was || was.kind !== kind)) {
      logEvent(world, was && was.kind ? `✦ The joined islands have become ${ISLE_JOINS[kind].name}` : `✦ Two islands have joined: ${ISLE_JOINS[kind].name}. ${capFirst(ISLE_JOINS[kind].note)}`, null, { cat: 'rare', pri: 2 });
    } else if (!was) logEvent(world, 'A sandbar is building between two islands', null, { cat: 'pond', pri: 1 });
    landRebake(world, (P.a.x + P.b.x) / 2, (P.a.y + P.b.y) / 2, P.d / 2 + P.ra + P.rb);
  }
  for (const k of Object.keys(J)) if (!live.has(k)) delete J[k];
}
// The bar itself, raised in the beach map (coast.js calls this when it shapes the islands).
function applyIsleBars(world) {
  const shore = world.shore, { W, H } = world;
  if (!shore) return;
  for (const P of islePairs(world)) {
    const { a, b, ra, rb, d, grow } = P, ux = (b.x - a.x) / d, uy = (b.y - a.y) / d, w = 4 + 6 * grow;
    const t0 = ra * 0.7, t1 = d - rb * 0.7;
    for (let t = t0; t <= t1; t += 1) {
      const f = (t - t0) / Math.max(1, t1 - t0), mid = Math.sin(PI * f);
      // It builds from both ends and meets in the middle: under water at first, then a dry bar.
      const top = clamp(grow * 1.15 - 0.35 * mid * (1 - grow), 0, 1) * 0.93, ww = w * (1 - 0.3 * mid) + fbm(t * 0.1, 3, a.seed % 41) * 3;
      const cx = a.x + ux * t, cy = a.y + uy * t;
      for (let o = -ww; o <= ww; o += 0.7) {
        const x = Math.round(cx - uy * o), y = Math.round(cy + ux * o);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const v = Math.round(top * (1 - (o / ww) ** 2) * 255), p = x + y * W;
        if (v > shore[p]) shore[p] = v;
      }
    }
  }
}

// ---- slow animation ---------------------------------------------------------------------------------------
// Formations, flora and sinking bones ease toward the dawn's state over most of a day; the floor is
// repainted a patch at a time; anything that changed enough is redrawn.
function landRebake(world, x, y, r) {
  const rect = [Math.max(0, Math.floor(x - r)), Math.max(0, Math.floor(y - r)), Math.min(world.W - 1, Math.ceil(x + r)), Math.min(world.H - 1, Math.ceil(y + r))];
  if (rect[2] <= rect[0] || rect[3] <= rect[1]) return;
  if (typeof queueBake === 'function') queueBake(world, rect); else if (world.bgBase) bakeBackground(world, rect);
}
function updateLand(world, dt) {
  if (!world.W || world.observe) return;
  landClock -= dt;
  if (landClock > 0) return;
  const step = 2 - landClock; // (seconds since the last tick)
  landClock = 2;
  landSample(world);
  const L = world.land;
  if (!L) return;
  const dayK = step / Math.max(30, world.opts.dayLength) * 1.4; // (most of a day to catch up)
  const ease = (o) => { const d = o.g - (o.gs || 0); if (Math.abs(d) < 1e-3) return false; o.gs = (o.gs || 0) + Math.sign(d) * Math.min(Math.abs(d), dayK); return true; };
  for (const f of world.forms || []) if (ease(f) && Math.abs(f.gs - (f.baked ?? -1)) > 0.05) { f.baked = f.gs; landRebake(world, f.x, f.y, 24); }
  for (const b of world.boneBeds || []) {
    b.g = clamp((world.days - b.born) / 12, 0, 1);
    if (ease(b) && Math.abs(b.gs - (b.baked ?? -1)) > 0.06) { b.baked = b.gs; landRebake(world, b.x, b.y, b.len / 2 + 8); }
  }
  if (world.boneBeds) world.boneBeds = world.boneBeds.filter((b) => b.gs < 1 || (landAdd(world, b.x, b.y, 'bone', 0.1, 1), landRebake(world, b.x, b.y, b.len / 2 + 8), false));
  for (const s of world.structures || []) {
    if (s.kind !== 'island' || !s.flora) continue;
    let moved = false;
    for (const f of s.flora) {
      const target = f.dead ? Math.max(0.3, 1 - (world.days - f.b) / f.span) : f.g;
      const d = target - (f.gs || 0);
      if (Math.abs(d) > 1e-3) { f.gs = (f.gs || 0) + Math.sign(d) * Math.min(Math.abs(d), dayK); moved = true; }
    }
    const sum = s.flora.reduce((a, f) => a + f.gs, 0);
    if (moved && Math.abs(sum - (s.floraBaked ?? -99)) > 0.15) {
      s.floraBaked = sum;
      landRebake(world, s.x, s.y, islandFloraRebakeRadius(world, s));
    }
  }
  landRepaint(world, L, step);
}
// The floor's tint, a patch at a time (the whole pond about twice a day).
function landRepaint(world, L, step) {
  if (!world.bgBase || typeof applyStains !== 'function') return;
  if (L.dirty || !L.tint) { landTints(world, L); L.dirty = false; }
  if (!L.any) return;
  const T = 64, tx = Math.ceil(world.W / T), ty = Math.ceil(world.H / T);
  if (!L.paint || L.paint.n !== tx * ty) {
    const order = Array.from({ length: tx * ty }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = randi(0, i); [order[i], order[j]] = [order[j], order[i]]; }
    L.paint = { order, n: tx * ty, i: 0, acc: 0 };
  }
  const P = L.paint;
  P.acc += step * P.n / Math.max(30, world.opts.dayLength * 0.5);
  for (let k = 0; k < 6 && P.acc >= 1; k++, P.acc--) {
    const t = P.order[P.i++ % P.n], x0 = (t % tx) * T, y0 = ((t / tx) | 0) * T;
    applyStains(world, [x0, y0, Math.min(world.W - 1, x0 + T - 1), Math.min(world.H - 1, y0 + T - 1)]);
  }
  P.acc = Math.min(P.acc, 6);
}
// Each cell's tint: a colour and how much of it, from what the land holds there.
function landTints(world, L) {
  const n = L.cols * L.rows;
  if (!L.tint || L.tint.length !== n) { L.tint = new Uint32Array(n); L.amt = new Float32Array(n); L.fk = new Uint8Array(n); L.fv = new Float32Array(n); L.near = new Uint8Array(n); }
  let any = false;
  for (let q = 0; q < n; q++) {
    let r = 0, g = 0, b = 0, wsum = 0, top = 0, tv = 0;
    for (let i = 0; i < LAND_KEYS.length; i++) {
      const k = LAND_KEYS[i], v = L.ch[k][q];
      if (v < 0.06) continue;
      const c = LAND_COL[k], w = v * v;
      r += (c & 255) * w; g += ((c >> 8) & 255) * w; b += ((c >>> 16) & 255) * w; wsum += w;
      if (v > tv) { tv = v; top = i; }
    }
    if (!wsum) { L.amt[q] = 0; L.fv[q] = 0; continue; }
    any = true;
    L.tint[q] = (0xff000000 | (Math.round(b / wsum) << 16) | (Math.round(g / wsum) << 8) | Math.round(r / wsum)) >>> 0;
    L.amt[q] = Math.min(0.5, Math.sqrt(wsum) * 0.55);
    L.fk[q] = top; L.fv[q] = tv;
  }
  L.any = any;
  // Cells within two of any land colour (the sampling warp reaches about that far): the rest skip it entirely.
  L.near.fill(0);
  if (any) for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
    if (!L.amt[x + y * L.cols]) continue;
    for (let j = Math.max(0, y - 2); j <= Math.min(L.rows - 1, y + 2); j++) for (let i = Math.max(0, x - 2); i <= Math.min(L.cols - 1, x + 2); i++) L.near[i + j * L.cols] = 1;
  }
}
// Used by applyStains (structures.js), pixel by pixel: the land over the floor (not over things on it).
function landTintAt(world, x, y, c, dry = false) {
  const L = world.land;
  if (!L || !L.any || !L.tint) return c;
  if (L.near && !L.near[landCell(L, x, y)]) return c;
  // Where it samples the grid is warped by noise at two scales, so patches lie in organic shapes rather than the
  // circles they were added in, and their edges don't step along the 16 px cells.
  const sx = x + (fbm(x * 0.035, y * 0.035, 41) - 0.5) * LAND_CELL * 3.2 + (vnoise(x * 0.12, y * 0.12, 45) - 0.5) * LAND_CELL * 0.8;
  const sy = y + (fbm(x * 0.035 + 9.1, y * 0.035 - 4.7, 43) - 0.5) * LAND_CELL * 3.2 + (vnoise(x * 0.12 + 3.3, y * 0.12 + 7.7, 47) - 0.5) * LAND_CELL * 0.8;
  // How much: blended between the four nearest cells, then broken up with noise so it lies in patches.
  const fx = sx / LAND_CELL - 0.5, fy = sy / LAND_CELL - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const cx0 = clamp(ix, 0, L.cols - 1), cx1 = clamp(ix + 1, 0, L.cols - 1), cy0 = clamp(iy, 0, L.rows - 1), cy1 = clamp(iy + 1, 0, L.rows - 1), A = L.amt;
  const a00 = A[cx0 + cy0 * L.cols], a10 = A[cx1 + cy0 * L.cols], a01 = A[cx0 + cy1 * L.cols], a11 = A[cx1 + cy1 * L.cols];
  if (!(a00 || a10 || a01 || a11)) return c;
  const amt = (a00 * (1 - tx) + a10 * tx) * (1 - ty) + (a01 * (1 - tx) + a11 * tx) * ty;
  const a = amt * (0.25 + 1.0 * fbm(x * 0.07, y * 0.07, 17) + 0.5 * vnoise(x * 0.23, y * 0.23, 19));
  // Which colour: the warped cell, a small dithered step away (so borders between kinds of ground interleave).
  const q = landCell(L, sx + (dither(x, y) - 0.5) * LAND_CELL * 0.35, sy + (dither(y + 1, x + 2) - 0.5) * LAND_CELL * 0.35);
  if (!L.amt[q]) return c;
  const v = Math.floor((Math.min(0.55, a) * (dry ? 0.6 : 1) + dither(x, y) * 0.1) * 8) / 8;
  let out = v > 0 ? mixColor(c, L.tint[q], v) : c;
  // Flecks: bone chips, glints of glass, shell, ash, sparks of light.
  if (L.fv[q] > 0.3 && a > 0.18 && hash2(x, y, 7) < (L.fv[q] - 0.3) * 0.045) out = LAND_FLECK[LAND_KEYS[L.fk[q]]];
  return out;
}

// ---- drawing: formations, sinking bones, bars, and the islands' flora (baked into the floor) --------------
function bakeLand(r, world, next) {
  const ids = new Map(), id = (m) => { if (!ids.has(m)) ids.set(m, next(m)); return ids.get(m); };
  for (const f of world.forms || []) if (f.gs > 0.02) withSeed(`form/${f.seed}`, () => FORM_BAKE[f.k](r, f.x, f.y, f.gs, id, world));
  for (const b of world.boneBeds || []) withSeed(`bones/${b.seed}`, () => bakeBoneBed(r, b, id));
  for (const P of islePairs(world)) withSeed(`bar/${P.key}`, () => bakeBar(r, world, P, id));
}
const FORM_BAKE = {
  bone(r, x, y, g, id) {
    const m = SM.bone, n = randi(4, 6), a0 = rand(0, TAU), L = 10 + 8 * g;
    for (let k = 0; k < n; k++) {
      const t = (k / (n - 1) - 0.5) * L, cx = x + Math.cos(a0) * t, cy = y + Math.sin(a0) * t, pa = a0 + PI / 2, h = (2 + 3 * g) * (1 - Math.abs(t) / L);
      r.tube(cx - Math.cos(pa) * 4 * g, cy - Math.sin(pa) * 4 * g, 0.5 + 0.4 * g, 0, cx, cy, 0.4 + 0.3 * g, h, 0.8, m, id(m));
      r.tube(cx + Math.cos(pa) * 4 * g, cy + Math.sin(pa) * 4 * g, 0.5 + 0.4 * g, 0, cx, cy, 0.4 + 0.3 * g, h, 0.8, m, id(m));
    }
    r.ellipsoid(x + Math.cos(a0) * L * 0.6, y + Math.sin(a0) * L * 0.6, 2.4 * g + 0.8, 1.8 * g + 0.6, a0, 0, 1.6 * g + 0.4, m, id(m));
  },
  life(r, x, y, g, id, world) {
    const salt = saltAt(world, x, y) > 0;
    if (salt) {
      const m = pick(typeof CORAL_MATS !== 'undefined' ? CORAL_MATS : [LAND_M.flower]), rr = 3 + 5 * g;
      for (let k = 0; k < 7; k++) { const a = rand(0, TAU), d = rand(0, rr * 0.7); r.ellipsoid(x + Math.cos(a) * d, y + Math.sin(a) * d, rr * rand(0.3, 0.55), rr * rand(0.3, 0.5), a, 0, rr * rand(0.4, 0.8), m, id(m)); }
    } else {
      const rr = 4 + 5 * g;
      r.ellipsoid(x, y, rr, rr * 0.8, rand(0, PI), 0, rr * 0.5, LAND_M.moss, id(LAND_M.moss));
      for (let k = 0; k < 6 * g + 2; k++) { const a = rand(0, TAU), d = rand(0, rr * 0.7); r.ellipsoid(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.2, 1, a, rr * 0.4, 1.2, LAND_M.bush, id(LAND_M.bush)); }
    }
  },
  light(r, x, y, g, id) {
    for (let k = 0; k < 5 + 3 * g; k++) { const a = rand(0, TAU), d = rand(0, 4 * g), h = rand(3, 8) * g + 1, l = rand(0.2, 0.5); r.tube(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.9, 0, x + Math.cos(a) * (d + l * h), y + Math.sin(a) * (d + l * h), 0.2, h, 1, LAND_M.crystal, id(LAND_M.crystal)); }
  },
  dark(r, x, y, g, id) {
    for (let k = 0; k < 3 + 2 * g; k++) { const a = rand(0, TAU), d = rand(0, 4), h = rand(4, 10) * g + 1, l = rand(0.2, 0.6); r.tube(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.6, 0, x + Math.cos(a) * (d + l * h), y + Math.sin(a) * (d + l * h), 0.3, h, 1, LAND_M.obsidian, id(LAND_M.obsidian)); }
  },
  mad(r, x, y, g, id) {
    for (let k = 0; k < 4 + 3 * g; k++) { const a = rand(0, TAU), d = rand(0, 5), h = rand(3, 7) * g + 1, l = rand(0.4, 0.9); r.tube(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.3, 0, x + Math.cos(a) * (d + l * h), y + Math.sin(a) * (d + l * h), 0.2, h, 1, LAND_M.rust, id(LAND_M.rust)); }
  },
  alien(r, x, y, g, id) {
    for (let k = 0; k < 3 + 2 * g; k++) {
      const m = k % 2 ? LAND_M.glassCyan : LAND_M.glass, a = rand(0, TAU), d = rand(0, 4), h = rand(6, 14) * g + 2;
      const tx = x + Math.cos(a) * (d + 1.5), ty = y + Math.sin(a) * (d + 1.5);
      r.tube(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, 0, tx, ty, 0.3, h, 1, m, id(m));
      r.ellipsoid(tx, ty, 1 + g, 1 + g, 0, h - 0.5, 1.2 + g, m, id(m));
    }
  },
  cryptid(r, x, y, g, id) {
    const a = rand(0, TAU), s = 4 + 7 * g, m = LAND_M.print;
    r.ellipsoid(x, y, s, s * 0.7, a, -0.4, 0.5, m, id(m));
    for (let k = -1; k <= 1; k++) { const ta = a + k * 0.45, d = s * 1.35; r.ellipsoid(x + Math.cos(ta) * d, y + Math.sin(ta) * d, s * 0.35, s * 0.22, ta, -0.4, 0.5, m, id(m)); }
    if (g > 0.6) r.ellipsoid(x - Math.cos(a) * s * 1.6, y - Math.sin(a) * s * 1.6, 2.2, 1.6, a, 0, 1.6, SM.bone, id(SM.bone));
  },
  ancient(r, x, y, g, id) {
    for (let k = 0; k < 3 + 3 * g; k++) {
      const a = rand(0, TAU), d = rand(0, 6), rr = rand(2, 4) * (0.5 + 0.5 * g);
      r.ellipsoid(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, rr * 0.9, a, 0, rr * 0.9, (lx, ly, px, py, pz) => ((pz || 0) % 1 < 0.35 ? LAND_M.stromBand : LAND_M.strom), id(LAND_M.strom));
    }
    if (g > 0.5) {
      const a = rand(0, TAU), cx = x + Math.cos(a) * 7, cy = y + Math.sin(a) * 7;
      for (let k = 0; k < 10; k++) { const t = k / 10 * TAU * 1.6, rr = 0.4 + 0.25 * k; r.ellipsoid(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr, 0.8 + 0.08 * k, 0.8 + 0.08 * k, t, 0, 0.7, SM.stone, id(SM.stone)); }
    }
  },
};
// A skeleton sinking: at first most of it shows; over the days less and less.
function bakeBoneBed(r, b, id) {
  const up = 1 - b.gs, n = Math.max(3, Math.round(b.len / 5)), m = SM.bone, ux = Math.cos(b.ang), uy = Math.sin(b.ang);
  if (up < 0.05) return;
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1) - 0.5) * b.len, cx = b.x + ux * t, cy = b.y + uy * t, rib = (1 - Math.abs(t) / b.len) * 3 * b.w * up;
    if (k > 0 && k < n - 1 && rib > 0.6) r.tube(cx - uy * rib, cy + ux * rib, 0.4, 0, cx + uy * rib, cy - ux * rib, 0.4, 0, 0.6, m, id(m));
    if (k < n - 1) r.tube(cx, cy, 0.5 * b.w, 0, cx + ux * b.len / (n - 1), cy + uy * b.len / (n - 1), 0.45 * b.w, 0, 0.5 * up + 0.2, m, id(m));
  }
  r.ellipsoid(b.x + ux * b.len / 2, b.y + uy * b.len / 2, 1.5 * b.w * up + 0.5, 1.2 * b.w * up + 0.4, b.ang, 0, up + 0.3, m, id(m));
}
// A bar between islands: what grows or stands along it depends on what they became together.
function bakeBar(r, world, P, id) {
  const J = (world.isleJoins || {})[P.key], kind = J && J.kind, { a, b, ra, rb, d } = P;
  if (!kind || P.grow < 0.6) return;
  const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d, n = Math.round((d - ra - rb) / 7);
  for (let k = 1; k < n; k++) {
    const t = ra + (d - ra - rb) * k / n + rand(-2, 2), o = rand(-3, 3), x = a.x + ux * t - uy * o, y = a.y + uy * t + ux * o;
    const type = { causeway: 'stone', glass: 'glassshoot', fossil: 'cycad', bonebar: 'bones', lantern: 'glowbloom', thornbar: 'thorn', lagoon: 'palm', twin: 'grass' }[kind];
    if (type === 'stone') { const h = rand(6, 11); r.tube(x - 0.6, y, 1.6, 0.8, x + 0.6, y, 1, h, 1, LAND_M.obsidian, id(LAND_M.obsidian)); }
    else if (k % (type === 'palm' ? 2 : 1) === 0) FLORA[type](r, x, y, 0.8, 0.9, id);
  }
}
// The islands' flora, each at its growth (g: 0..1), at ground height z.
const FLORA = {
  palm(r, x, y, z, g, id) {
    const h = (8 + 8 * g) * g, a = rand(0, TAU), tx = x + Math.cos(a) * 2 * g, ty = y + Math.sin(a) * 2 * g;
    r.tube(x, y, 1 * g + 0.3, z, tx, ty, 0.7 * g + 0.2, z + h, 0.9, SM.trunk, id(SM.trunk));
    for (let f = 0; f < 6; f++) { const fa = f / 6 * TAU + a; r.ellipsoid(tx + Math.cos(fa) * 2.6 * g, ty + Math.sin(fa) * 2.6 * g, 2.2 * g + 0.3, 0.9 * g + 0.2, fa, z + h, 0.5, SM.frond, id(SM.frond)); }
  },
  bush(r, x, y, z, g, id) { for (let k = 0; k < 3; k++) r.ellipsoid(x + rand(-1.2, 1.2) * g, y + rand(-1.2, 1.2) * g, 1.6 * g + 0.3, 1.4 * g + 0.3, k, z, 1.6 * g + 0.3, LAND_M.bush, id(LAND_M.bush)); },
  shrub(r, x, y, z, g, id) { r.ellipsoid(x, y, 1.4 * g + 0.4, 1.2 * g + 0.4, 0, z, 1.3 * g + 0.3, SM.moss2, id(SM.moss2)); },
  grass(r, x, y, z, g, id) { for (let k = 0; k < 3; k++) r.ellipsoid(x + rand(-1.5, 1.5), y + rand(-1.5, 1.5), 0.9 * g + 0.2, 0.7 * g + 0.2, k, z, 0.9 * g, SM.grass, id(SM.grass)); },
  flower(r, x, y, z, g, id) { for (let k = 0; k < 3; k++) r.ellipsoid(x + rand(-1.2, 1.2), y + rand(-1.2, 1.2), 0.7 * g + 0.2, 0.7 * g + 0.2, 0, z + 0.8 * g, 0.6, k % 2 ? LAND_M.flower : SM.plume, id(k % 2 ? LAND_M.flower : SM.plume)); },
  reed(r, x, y, z, g, id) {
    for (let k = 0; k < 5; k++) {
      const a = rand(0, TAU), l = rand(0.5, 1.5), h = (5 + rand(0, 5)) * g + 0.5, tx = x + Math.cos(a) * l, ty = y + Math.sin(a) * l;
      r.tube(x + Math.cos(a) * 0.4, y + Math.sin(a) * 0.4, 0.35, z, tx, ty, 0.25, z + h, 1, LAND_M.reed, id(LAND_M.reed));
      if (k % 2 === 0 && g > 0.5) r.ellipsoid(tx, ty, 0.5, 0.5, 0, z + h - 0.4, 1.2, LAND_M.cattail, id(LAND_M.cattail));
    }
  },
  willow(r, x, y, z, g, id) {
    const h = (8 + 6 * g) * g;
    r.tube(x, y, 1.3 * g + 0.3, z, x + 0.5, y, 0.8 * g + 0.2, z + h, 0.9, SM.bark, id(SM.bark));
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, d = (2 + 2.5 * g) * g; r.ellipsoid(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.2 * g + 0.3, 0.8 * g + 0.2, a, z + h * 0.55, h * 0.45, LAND_M.willow, id(LAND_M.willow)); }
  },
  fern(r, x, y, z, g, id) { for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + rand(0, 0.5); r.ellipsoid(x + Math.cos(a) * 1.8 * g, y + Math.sin(a) * 1.8 * g, 1.8 * g + 0.2, 0.6 * g + 0.2, a, z + 0.6 * g, 0.4, LAND_M.fern, id(LAND_M.fern)); } },
  moss(r, x, y, z, g, id) { r.ellipsoid(x, y, 2 * g + 0.5, 1.6 * g + 0.4, rand(0, PI), z, 0.5, LAND_M.moss, id(LAND_M.moss)); },
  pine(r, x, y, z, g, id) {
    const h = (6 + 6 * g) * g;
    r.tube(x, y, 0.6 * g + 0.2, z, x, y, 0.4 * g + 0.1, z + h, 0.9, SM.bark, id(SM.bark));
    for (let k = 0; k < 3; k++) { const s = (2.6 - k * 0.7) * g + 0.2; r.ellipsoid(x, y, s, s, 0, z + h * (0.35 + k * 0.25), h * 0.25, LAND_M.pine, id(LAND_M.pine)); }
  },
  glowbloom(r, x, y, z, g, id) { r.tube(x, y, 0.25, z, x, y, 0.2, z + 3 * g + 0.5, 1, SM.frond, id(SM.frond)); r.ellipsoid(x, y, 0.9 * g + 0.3, 0.9 * g + 0.3, 0, z + 3 * g + 0.5, 1, LAND_M.glowbloom, id(LAND_M.glowbloom)); },
  deadtree(r, x, y, z, g, id) {
    const h = (7 + 5 * g) * g + 1;
    r.tube(x, y, 0.9 * g + 0.3, z, x + 0.4, y, 0.4 * g + 0.2, z + h, 0.9, LAND_M.dead, id(LAND_M.dead));
    for (let k = 0; k < 2; k++) { const a = rand(0, TAU); r.tube(x, y, 0.4, z + h * (0.5 + 0.2 * k), x + Math.cos(a) * 3 * g, y + Math.sin(a) * 3 * g, 0.2, z + h * (0.7 + 0.2 * k), 0.9, LAND_M.dead, id(LAND_M.dead)); }
  },
  blackmoss(r, x, y, z, g, id) { r.ellipsoid(x, y, 2 * g + 0.5, 1.5 * g + 0.4, rand(0, PI), z, 0.4, LAND_M.blackmoss, id(LAND_M.blackmoss)); },
  glassshoot(r, x, y, z, g, id) { const a = rand(0, TAU), h = (4 + 5 * g) * g + 1; r.tube(x, y, 0.6 * g + 0.2, z, x + Math.cos(a) * 1.2, y + Math.sin(a) * 1.2, 0.15, z + h, 1, LAND_M.glass, id(LAND_M.glass)); },
  cycad(r, x, y, z, g, id) {
    const h = 3 * g + 0.5;
    r.ellipsoid(x, y, 1.2 * g + 0.4, 1.2 * g + 0.4, 0, z, h, SM.bark, id(SM.bark));
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; r.ellipsoid(x + Math.cos(a) * 2.4 * g, y + Math.sin(a) * 2.4 * g, 2.4 * g + 0.3, 0.5 * g + 0.2, a, z + h + 0.5, 0.5, LAND_M.cycad, id(LAND_M.cycad)); }
  },
  horsetail(r, x, y, z, g, id) { for (let k = 0; k < 4; k++) { const ox = rand(-1.2, 1.2), oy = rand(-1.2, 1.2), h = (3 + rand(0, 4)) * g + 0.5; r.tube(x + ox, y + oy, 0.35, z, x + ox, y + oy, 0.3, z + h, 1, (lx, ly, px, py, pz) => ((pz || 0) % 1.2 < 0.3 ? SM.soil : LAND_M.cycad), id(LAND_M.cycad)); } },
  thorn(r, x, y, z, g, id) { for (let k = 0; k < 5; k++) { const a = rand(0, TAU), h = (2 + 3 * g) * g + 0.5; r.tube(x, y, 0.4, z, x + Math.cos(a) * 2.5 * g, y + Math.sin(a) * 2.5 * g, 0.1, z + h, 1, LAND_M.thorn, id(LAND_M.thorn)); } },
  bones(r, x, y, z, g, id) { const a = rand(0, TAU); r.tube(x - Math.cos(a) * 2 * g, y - Math.sin(a) * 2 * g, 0.4, z, x + Math.cos(a) * 2 * g, y + Math.sin(a) * 2 * g, 0.4, z + 0.4, 0.8, SM.bone, id(SM.bone)); r.ellipsoid(x + Math.cos(a) * 2.4 * g, y + Math.sin(a) * 2.4 * g, 0.9, 0.7, a, z, 0.8, SM.bone, id(SM.bone)); },
  coralstone(r, x, y, z, g, id) {
    const m = SM.barnacle, cid = id(m), h = 2 + 3 * g;
    r.ellipsoid(x, y, 2.2 * g + 0.6, 1.5 * g + 0.4, 0, z, 0.9 * g, m, cid);
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.4; r.tube(x, y, 0.5 * g, z + 0.5, x + Math.cos(a) * 1.8 * g, y + Math.sin(a) * 1.8 * g, 0.2, z + h, 0.8, m, cid); }
  },
};
// The island's own flora (called at the end of the island's bake in structures.js).
function bakeFlora(r, s, next) {
  if (!s.flora || !s.flora.length) return;
  const ids = new Map(), id = (m) => { if (!ids.has(m)) ids.set(m, next(m)); return ids.get(m); };
  for (const f of s.flora) {
    const g = Math.max(0, f.gs ?? f.g);
    if (g < 0.05) continue;
    const z = typeof islandTopAt === 'function' ? islandTopAt(s, f.x, f.y) : 0, type = f.dead && ['palm', 'willow', 'pine', 'cycad', 'bush', 'shrub', 'reed'].includes(f.t) ? 'deadtree' : f.t;
    withSeed(`flora/${f.s}`, () => (FLORA[type] || FLORA.grass)(r, s.x + f.x, s.y + f.y, z, g, id));
  }
}
// An island's own tree where the palm would be (for the characters without one).
function isleAnchor(r, s, x, y, z, k, next) {
  const kind = isleOf(s), ids = new Map(), id = (m) => { if (!ids.has(m)) ids.set(m, next(m)); return ids.get(m); };
  const t = { rock: 'pine', reed: 'reed', willow: 'willow', basalt: 'fern' }[kind] || 'palm';
  withSeed(`anchor/${s.seed}/${k}`, () => FLORA[t](r, x, y, z, 1, id));
  if (kind === 'reed') withSeed(`anchor2/${s.seed}/${k}`, () => FLORA.reed(r, x + 3, y + 2, z, 0.9, id));
}

// ---- effects ------------------------------------------------------------------------------------------------
// Comfort (game.js updateComfort): content in the green and on glow sand, uneasy on ash (unless it loves the dark) and red silt.
function landComfort(world, c) {
  const L = world.land;
  if (!L) return 0;
  const q = landCell(L, c.x, c.y), C = L.ch, dark = typeof hasWarp === 'function' && hasWarp(c.life, 'darkloving');
  return 0.08 * C.life[q] + 0.05 * C.light[q] * (1 + (world.darkness || 0)) + (dark ? 0.08 : -0.06) * C.dark[q] - 0.06 * C.mad[q];
}
// The water's temper (ecology.js updateZones): red silt sours it, glow sand and the green calm it.
function landZones(world, put, tA) {
  const L = world.land;
  if (!L || !L.any) return;
  const C = L.ch;
  for (let q = 0; q < L.cols * L.rows; q++) {
    const v = 0.1 * C.mad[q] + 0.03 * C.dark[q] - 0.05 * C.light[q] - 0.02 * C.life[q];
    if (Math.abs(v) > 0.004) put(tA, ((q % L.cols) + 0.5) * LAND_CELL, (((q / L.cols) | 0) + 0.5) * LAND_CELL, v * 0.4);
  }
}
// The mark (eldritch.js eldRate) comes on faster on ash; parasites (alien.js) breed faster on glass.
const landDarkRate = (world, c) => 1 + 1.5 * landVal(world, c.x, c.y, 'dark');
const landAlienRate = (world, c) => 1 + 1.2 * landVal(world, c.x, c.y, 'alien');
// Lights at night (depths.js buildLights): glow crystals, glass spires, glow blooms.
function landLights(M, world, big) {
  if ((world.darkness || 0) < 0.3) return;
  for (const f of world.forms || []) {
    if ((f.k !== 'light' && f.k !== 'alien') || f.gs < 0.2 || f.x < big[0] || f.x > big[2] || f.y < big[1] || f.y > big[3]) continue;
    splat(M, f.x, f.y, 10 + 10 * f.gs, f.k === 'light' ? 0xffb0f8ff : 0xffff6ae0, 0.5 * f.gs, 0, 0, big);
  }
  for (const s of world.structures || []) {
    if (s.kind !== 'island' || !s.flora) continue;
    for (const f of s.flora) if ((f.t === 'glowbloom' || f.t === 'glassshoot') && !f.dead && (f.gs || 0) > 0.3) splat(M, s.x + f.x, s.y + f.y, 6, f.t === 'glowbloom' ? 0xff90ffff : 0xffff6ae0, 0.35 * f.gs, 0, 0, big);
  }
  if (typeof isleLights === 'function') isleLights(M, world, big); // (an island's fire: isles.js)
}

// ---- the map layer, tips, and the card ----------------------------------------------------------------------
function landMiniColor(world, x, y, c) {
  const L = world.land;
  if (!L || !L.tint) return c;
  const q = landCell(L, x, y);
  return L.amt[q] ? mixColor(c, L.tint[q], Math.min(0.85, L.amt[q] * 1.8)) : c;
}
function landTipAt(world, x, y) {
  const f = formAt(world, x, y);
  if (f) return `${FORMS[f.k].name}\n${capFirst(FORMS[f.k].note)}. It grew from ${LAND[f.k].name}, and fades if the land does.`;
  const b = (world.boneBeds || []).find((q) => Math.hypot(q.x - x, q.y - y) < q.len / 2 + 3 && q.gs < 0.9);
  if (b) return 'Old bones\nA skeleton sinking into the sand. As it goes, it makes the sand rich (and marks it with what it was).';
  const bio = landBiome(world, x, y, 0.35);
  if (bio) return `${capFirst(LAND[bio.k].name)}\n${capFirst(LAND[bio.k].note)}.`;
  return null;
}
// The island's line on its card and tip: its character, what it's become, and whom it's joined.
function isleSummary(world, s) {
  const K = ISLE_KINDS[isleOf(s)], fl = (s.flora || []).filter((f) => !f.dead).length, dead = (s.flora || []).filter((f) => f.dead).length;
  const joins = Object.entries(world.isleJoins || {}).filter(([k, j]) => j.kind && k.split('-').includes(String(s.seed))).map(([, j]) => ISLE_JOINS[j.kind].name);
  const bar = Object.entries(world.isleJoins || {}).some(([k, j]) => !j.kind && k.split('-').includes(String(s.seed)));
  return `${capFirst(K.name)}${s.evo ? `, ${ISLE_EVO[s.evo]}` : ''}.${typeof isleStatus === 'function' ? isleStatus(world, s) : ''} ${fl} plant${fl === 1 ? '' : 's'} growing${dead ? `, ${dead} dying back` : ''}.${joins.length ? ` Joined to another: ${joins.join(', ')}.` : bar ? ' A sandbar is building toward another island.' : ''}`;
}

// ---- saving ------------------------------------------------------------------------------------------------
// The grid as bytes (0..255 per channel), zero runs squeezed, in base64.
function landPack(world) {
  const L = world.land;
  if (!L) return null;
  const n = L.cols * L.rows, bytes = [];
  for (const k of LAND_KEYS) {
    const A = L.ch[k];
    for (let q = 0; q < n;) {
      const v = Math.round(A[q] * 255);
      if (v === 0) { let run = 0; while (q < n && run < 255 && Math.round(L.ch[k][q] * 255) === 0) { run++; q++; } bytes.push(0, run); }
      else { bytes.push(v); q++; }
    }
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.slice(i, i + 8192));
  return { c: LAND_CELL, w: L.cols, h: L.rows, d: btoa(s) };
}
function landUnpack(world, P, sx = 0, sy = 0) {
  world.land = null;
  if (!P || !P.d || P.c !== LAND_CELL) return;
  const L = landGrid(world), raw = atob(P.d), n = P.w * P.h, ox = Math.round((sx || 0) / LAND_CELL), oy = Math.round((sy || 0) / LAND_CELL);
  let i = 0;
  for (const k of LAND_KEYS) {
    let q = 0;
    while (q < n && i < raw.length) {
      const v = raw.charCodeAt(i++);
      if (v === 0) { q += raw.charCodeAt(i++); continue; }
      const x = (q % P.w) + ox, y = ((q / P.w) | 0) + oy;
      if (x >= 0 && y >= 0 && x < L.cols && y < L.rows) L.ch[k][x + y * L.cols] = v / 255;
      q++;
    }
  }
  L.dirty = true;
}
