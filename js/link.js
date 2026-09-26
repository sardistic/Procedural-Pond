'use strict';
// Pond links. The whole living pond packs into the link's #fragment, which
// browsers never send to the server. Most of a pond can be recomputed, so the
// link stores only what can't:
//  - scenery regrows from the pond's seed; only the player's edits are stored
//  - wild species are stored as the seeds that generated them
//  - an animal's seed follows from the pond seed and its number, so only a
//    small step between numbers is stored
//  - genes follow from the seed (founders, newcomers) or from the parents plus
//    the seed (babies), so usually no gene bytes are stored at all
//  - names and lifespans follow from the seed
// What's left per animal is about 6 bytes: kind, number step, place, age,
// energy/growth, and parents or generation. The bytes are deflated and
// written as base64url: "p2z.<data>". Version 1 links still open.

const LINK_V = 2;
// Append-only code tables: an index written into a link must keep its meaning.
const KIND_CODES = ['koi', 'tetra', 'eel', 'axolotl', 'turtle', 'crab', 'ray', 'frog', 'snake', 'snail', 'jelly', 'clown',
  'puffer', 'octopus', 'duck', 'shrimp', 'dragonfly', 'wild', 'starfish', 'tadpole'];
const PLANT_CODES = ['weed', 'eelgrass', 'anemone', 'coral', 'urchin', 'marimo', 'duckweed', 'lily'];
const HAB_CODES = ['fresh', 'mixed', 'salt'];
const FLOOR_CODES = ['sand', 'coral', 'pebbles', 'river', 'leaves', 'tiles'];
const WATER_CODES = ['teal', 'pond', 'clear', 'reef', 'deep', 'murky'];
const WORLD_CODES = ['auto', 'small', 'medium', 'large'];
const CAT_CODES = ['pond', 'life', 'rare', 'hunt', 'come', 'sky'];
const DUCK_CODES = ['hen', 'baby', 'drake'];
const SCHOOL_CODES = [null, 'neon', 'lemon'];
const GENE_KEYS = ['size', 'hue', 'sat', 'light', 'speed', 'girth', 'length'];
const LINK_JOURNAL = 5;

const q8 = (v, lo, hi) => Math.round((clamp(v, lo, hi) - lo) / (hi - lo) * 255);
const dq8 = (b, lo, hi) => lo + b / 255 * (hi - lo);
const zig = (v) => (v >= 0 ? v * 2 : -v * 2 - 1);
const unzig = (v) => (v % 2 ? -(v + 1) / 2 : v / 2);

class ByteWriter {
  constructor() { this.a = []; }
  u8(v) { this.a.push(v & 255); }
  u16(v) { this.u8(v); this.u8(v >> 8); }
  vu(v) { // unsigned varint
    v = Math.max(0, Math.floor(v) || 0);
    while (v > 127) { this.a.push((v % 128) | 128); v = Math.floor(v / 128); }
    this.a.push(v);
  }
  str(s) { const b = new TextEncoder().encode(s); this.vu(b.length); for (const x of b) this.a.push(x); }
  bytes() { return Uint8Array.from(this.a); }
}

class ByteReader {
  constructor(b) { this.b = b; this.i = 0; }
  u8() { if (this.i >= this.b.length) throw new Error('pond link ends early'); return this.b[this.i++]; }
  u16() { return this.u8() | (this.u8() << 8); }
  vu() { let v = 0, m = 1, c; do { c = this.u8(); v += (c & 127) * m; m *= 128; } while (c & 128 && m < 2 ** 49); return v; }
  str() { const n = this.vu(); if (this.i + n > this.b.length) throw new Error('pond link ends early'); const s = new TextDecoder().decode(this.b.subarray(this.i, this.i + n)); this.i += n; return s; }
}

// Pond names like "misty-reed-42" pack into 2 bytes; anything else is spelled out.
function packSeed(w, seed) {
  const m = /^([a-z]+)-([a-z]+)-([1-9]\d?)$/.exec(seed);
  const a = m ? SEED_WORDS[0].indexOf(m[1]) : -1, b = m ? SEED_WORDS[1].indexOf(m[2]) : -1;
  if (a >= 0 && b >= 0) { w.u8(1); w.u16(a | (b << 4) | (+m[3] << 8)); } else { w.u8(0); w.str(seed); }
}
function unpackSeed(r) {
  if (!r.u8()) return r.str();
  const v = r.u16();
  return `${SEED_WORDS[0][v & 15]}-${SEED_WORDS[1][(v >> 4) & 15]}-${v >> 8}`;
}

const instToNum = (inst) => (/^[0-9a-z]{1,8}$/.test(inst || '') ? parseInt(inst, 36) : 0);
const numToInst = (n) => (n ? n.toString(36).padStart(8, '0') : '');

// ---- packing ---------------------------------------------------------------------------

function packPond(world) {
  const w = new ByteWriter(), { W, H, opts } = world;
  w.u8(LINK_V);
  packSeed(w, world.seed);
  w.u8(Math.max(0, HAB_CODES.indexOf(opts.habitat)) | (Math.max(0, FLOOR_CODES.indexOf(FLOOR_ALIASES[opts.floor] || opts.floor)) << 2));
  w.u8(Math.max(0, WATER_CODES.indexOf(opts.water)) | (Math.max(0, WORLD_CODES.indexOf(opts.world)) << 3));
  w.u16(W); w.u16(H);
  w.vu(Math.round(world.days * 1000));
  w.vu(Math.round(world.t));
  w.u8(q8(world.moon0, 0, 1)); w.u8(q8(world.tide0, 0, 1));
  w.u8(Math.round(clamp(world.weather.rain, 0, 1) * 15) | (Math.round(clamp(world.weather.target, 0, 1) * 15) << 4));
  w.u8(clamp(Math.round(world.weather.next), 0, 255));
  w.u8(q8(wrapAngle(world.current.base), -PI, PI));
  w.u8(world.records ? Math.min(255, world.records.gen) : 0);
  w.vu(world.spawnNight + 1);
  for (const k of ['births', 'arrivals', 'departures', 'eaten', 'rares']) w.vu(ECO[k]);
  w.vu(world.spawnCount || 0);
  w.vu(instToNum(world.inst));

  // Wild species in discovery order (their ids are their positions): 21-bit seed + habitat bit.
  w.vu(WILD_SPECIES.length);
  for (const sp of WILD_SPECIES) {
    const v = ((sp.seed || 0) & 0x1fffff) + (sp.habitat === 'salt' ? 0x200000 : 0);
    w.u8(v); w.u8(v >> 8); w.u8(v >> 16);
  }

  const saved = world.creatures.filter((c) => c.make && c.life && !c.leaving && !c.gone && !c.caught && KIND_CODES.includes(c.make));
  const index = new Map(saved.map((c, i) => [c, i])), bySeed = new Map(saved.map((c, i) => [c.seed, i]));
  const schools = [], schoolIdx = new Map();
  for (const c of saved) {
    if (c.school && !schoolIdx.has(c.school)) { schoolIdx.set(c.school, schools.length); schools.push(c.school); }
  }
  w.u8(Math.min(255, schools.length));
  for (const s of schools.slice(0, 255)) w.u8(Math.max(0, SCHOOL_CODES.indexOf(s.kind || null)));

  // Scenery: what the player removed from the generated pond, and what they added.
  const removed = world.removed || { plants: [], pads: [], rocks: [] };
  for (const key of ['plants', 'pads', 'rocks']) { w.vu(removed[key].length); for (const i of removed[key]) w.vu(i); }
  const added = [...world.plants, ...world.pads].filter((p) => p.oi == null && p.make && PLANT_CODES.includes(p.make));
  w.vu(added.length);
  for (const p of added) {
    w.u8(PLANT_CODES.indexOf(p.make) | (p.make === 'weed' ? [null, 'fresh', 'salt'].indexOf(p.args.habitat ?? null) << 4 : 0));
    w.vu(p.seed); w.u16(Math.round(p.x)); w.u16(Math.round(p.y));
  }
  const rocks = world.rocks.filter((r) => r.oi == null);
  w.vu(rocks.length);
  for (const r of rocks) {
    w.u16(Math.round(r.x)); w.u16(Math.round(r.y));
    w.u8(clamp(Math.round(r.a * 10), 0, 255)); w.u8(clamp(Math.round(r.b * 10), 0, 255)); w.u8(clamp(Math.round(r.h * 10), 0, 255));
    w.u8(q8(wrapAngle(r.ang), -PI, PI)); w.u8(Math.max(0, ROCK_MATS.indexOf(r.m))); w.vu(r.seed);
  }

  // Animals, in the order they appeared.
  w.vu(saved.length);
  let prevSn = 0;
  saved.forEach((c, i) => {
    const L = c.life, g = L.genome;
    const numbered = c.sn != null && c.seed === seedFor(world.seedBase, c.sn);
    // Parents in the link (earlier in the list) whose genes reproduce this animal's exactly.
    const par = L.parents ? L.parents.map((s) => bySeed.get(s)) : null;
    const hasParents = !!par && par.every((j) => j != null && j < i) &&
      L.gen === Math.max(saved[par[0]].life.gen, saved[par[1]].life.gen) + 1 &&
      sameGenome(g, childGenomeFor(c.seed, saved[par[0]].life.genome, saved[par[1]].life.genome));
    const explicit = !hasParents && !sameGenome(g, genomeFor(c.seed));
    const hasName = L.name !== nameFor(c.seed), hasLife = Math.abs(L.lifespan - lifespanFor(c.species, c.seed)) > 1;
    const extra = (c.state === 'sit' ? 1 : 0) | (hasName ? 2 : 0) | (hasLife ? 4 : 0) | (numbered ? 0 : 8);
    w.u8(KIND_CODES.indexOf(c.make) | (hasParents ? 32 : 0) | (explicit ? 64 : 0) | (extra ? 128 : 0));
    if (extra) w.u8(extra);
    if (numbered) { w.vu(zig(c.sn - prevSn)); prevSn = c.sn; }
    w.u8(Math.min(15, Math.floor(c.x / W * 16)) | (Math.min(15, Math.floor(c.y / H * 16)) << 4));
    w.u8(Math.min(255, Math.round(L.age / 4)));
    w.u8(Math.round(clamp(L.energy, 0, 1) * 15) | ((L.scale >= 0.999 ? 15 : Math.min(14, Math.round(L.scale * 15))) << 4));
    const a = c.args || {};
    if (c.make === 'koi') w.u8(a.variety == null ? 0 : a.variety + 1);
    else if (c.make === 'tetra') w.u8(a.school ? schoolIdx.get(a.school) + 1 : 0);
    else if (c.make === 'wild') { w.vu(a.sp ? a.sp.id : 0); w.u8(a.school ? schoolIdx.get(a.school) + 1 : 0); }
    else if (c.make === 'duck') w.vu(Math.max(0, DUCK_CODES.indexOf(a.kind)) | ((index.has(c.leader) ? index.get(c.leader) + 1 : 0) << 2));
    if (hasParents) { w.vu(i - par[0]); w.vu(i - par[1]); } else w.vu(L.gen);
    if (explicit) {
      for (const k of GENE_KEYS) w.u8(q8(g[k], ...GENE_LIMITS[k]));
      const g2 = (g.xanthic || 0) | ((g.axanthic || 0) << 2) | (g.glow ? 16 : 0) | (g.ghost ? 32 : 0);
      w.u8((g.albino || 0) | ((g.melanistic || 0) << 2) | ((g.piebald || 0) << 4) | (g.shiny ? 64 : 0) | (g2 ? 128 : 0));
      if (g.shiny) w.u8(clamp(Math.round(g.shinyHue), 0, 255));
      if (g.piebald === 2) w.u16(g.seed || 0);
      if (g2) w.u8(g2); // genes added later: xanthic, axanthic, glow, ghost
    }
    if (!numbered) w.vu(c.seed);
    if (hasName) w.str(L.name);
    if (hasLife) w.vu(L.lifespan);
  });

  const lines = world.journal.slice(0, LINK_JOURNAL);
  w.u8(lines.length);
  for (const e of lines) { w.u8(Math.max(0, CAT_CODES.indexOf(e.cat))); w.vu(e.day); w.u8(q8(e.clock, 0, 1)); w.str(e.text.slice(0, 100)); }
  // Added later, at the end so older links simply stop before it: the score.
  const G = world.game;
  if (G) { w.vu(G.points); w.vu(G.pearls); w.u8(G.board ? 1 : 0); }
  return w.bytes();
}

function unpackV2(r) {
  const s = { seed: unpackSeed(r) };
  if (!/^[a-z0-9-]{1,40}$/.test(s.seed)) throw new Error('bad pond name');
  const o1 = r.u8(), o2 = r.u8();
  s.habitat = HAB_CODES[o1 & 3] || 'mixed';
  s.floor = FLOOR_CODES[o1 >> 2] || 'sand';
  s.water = WATER_CODES[o2 & 7] || 'teal';
  s.world = WORLD_CODES[o2 >> 3] || 'auto';
  s.W = clamp(r.u16(), 200, 2000); s.H = clamp(r.u16(), 200, 2000);
  s.days = r.vu() / 1000; s.t = r.vu();
  s.moon0 = r.u8() / 255; s.tide0 = r.u8() / 255;
  const wb = r.u8();
  s.weather = { rain: (wb & 15) / 15, target: (wb >> 4) / 15, next: r.u8(), gust: 0 };
  s.currentBase = dq8(r.u8(), -PI, PI);
  const rec = r.u8();
  s.records = rec ? { gen: rec } : null;
  s.spawnNight = r.vu() - 1;
  s.eco = {};
  for (const k of ['births', 'arrivals', 'departures', 'eaten', 'rares']) s.eco[k] = r.vu();
  s.spawnCount = r.vu();
  s.inst = numToInst(r.vu());
  s.wild = [];
  for (let n = r.vu(); n > 0; n--) { const v = r.u8() | (r.u8() << 8) | (r.u8() << 16); s.wild.push([v & 0x200000 ? 'salt' : 'fresh', v & 0x1fffff]); }
  s.schools = [];
  for (let n = r.u8(); n > 0; n--) s.schools.push({ tx: s.W / 2, ty: s.H / 2, tz: 22, until: 0, kind: SCHOOL_CODES[r.u8()] || null });
  s.removed = {};
  for (const key of ['plants', 'pads', 'rocks']) { s.removed[key] = []; for (let n = r.vu(); n > 0; n--) s.removed[key].push(r.vu()); }
  s.addedPlants = [];
  for (let n = r.vu(); n > 0; n--) {
    const b = r.u8(), k = PLANT_CODES[b & 15], h = b >> 4, seed = r.vu(), x = r.u16(), y = r.u16();
    if (k) s.addedPlants.push({ k, s: seed, x, y, a: k === 'weed' && h ? { habitat: h === 1 ? 'fresh' : 'salt' } : {} });
  }
  s.addedRocks = [];
  for (let n = r.vu(); n > 0; n--) {
    s.addedRocks.push({ x: r.u16(), y: r.u16(), a: r.u8() / 10, b: r.u8() / 10, h: r.u8() / 10, ang: dq8(r.u8(), -PI, PI), m: r.u8(), seed: r.vu() });
  }
  const base = hashString(s.seed), genomes = [], gens = [], seeds = [];
  s.creatures = [];
  let prevSn = 0;
  for (let i = 0, n = r.vu(); i < n; i++) {
    const b = r.u8(), k = KIND_CODES[b & 31], extra = b & 128 ? r.u8() : 0;
    const numbered = !(extra & 8);
    let sn = null;
    if (numbered) { sn = prevSn + unzig(r.vu()); prevSn = sn; }
    const pos = r.u8(), cw = s.W / 16, ch = s.H / 16;
    const x = ((pos & 15) + rand(0.2, 0.8)) * cw, y = ((pos >> 4) + rand(0.2, 0.8)) * ch;
    const age = r.u8() * 4, es = r.u8();
    const L = { age, energy: (es & 15) / 15, scale: (es >> 4) === 15 ? 1 : (es >> 4) / 15 };
    const a = {};
    if (k === 'koi') { const v = r.u8(); if (v) a.variety = v - 1; }
    else if (k === 'tetra') { const j = r.u8(); a.school = j ? j - 1 : null; }
    else if (k === 'wild') { a.sp = r.vu(); const j = r.u8(); a.school = j ? j - 1 : null; }
    else if (k === 'duck') { const v = r.vu(); a.kind = DUCK_CODES[v & 3] || 'hen'; a.leader = v >> 2 ? (v >> 2) - 1 : null; }
    let pi = -1, mi = -1;
    if (b & 32) { pi = i - r.vu(); mi = i - r.vu(); } else L.gen = r.vu();
    let g = null;
    if (b & 64) {
      g = {};
      for (const key of GENE_KEYS) g[key] = dq8(r.u8(), ...GENE_LIMITS[key]);
      const t = r.u8();
      Object.assign(g, { albino: t & 3, melanistic: (t >> 2) & 3, piebald: (t >> 4) & 3, shiny: !!(t & 64) });
      g.shinyHue = g.shiny ? r.u8() : rand(100, 240);
      g.seed = g.piebald === 2 ? r.u16() : randi(0, 9999);
      if (t & 128) { const x = r.u8(); Object.assign(g, { xanthic: x & 3, axanthic: (x >> 2) & 3, glow: !!(x & 16), ghost: !!(x & 32) }); }
    }
    const seed = numbered ? seedFor(base, sn) : r.vu();
    if (extra & 2) L.name = r.str();
    if (extra & 4) L.lifespan = r.vu();
    if (b & 32) {
      if (!(pi >= 0 && mi >= 0 && pi < i && mi < i)) throw new Error('bad parent reference');
      L.gen = Math.max(gens[pi], gens[mi]) + 1;
      g = g || childGenomeFor(seed, genomes[pi], genomes[mi]);
      L.parents = [seeds[pi], seeds[mi]];
    }
    g = g || genomeFor(seed);
    L.genome = g;
    genomes.push(g); gens.push(L.gen); seeds.push(seed);
    if (k) s.creatures.push({ k, seed, sn, x, y, sit: !!(extra & 1), a, L });
  }
  s.journal = [];
  for (let n = r.u8(); n > 0; n--) s.journal.push({ cat: CAT_CODES[r.u8()] || 'pond', day: r.vu(), clock: r.u8() / 255, text: r.str() });
  if (r.i < r.b.length) s.game = { points: r.vu(), pearls: r.vu(), board: !!r.u8() };
  return s;
}

// Version 1 links (early September 2026): every animal stored in full.
function unpackV1(r) {
  const s = { seed: r.str() };
  if (!/^[a-z0-9-]{1,40}$/.test(s.seed)) throw new Error('bad pond name');
  s.habitat = HAB_CODES[r.u8()] || 'mixed';
  s.floor = FLOOR_CODES[r.u8()] || 'sand';
  s.water = WATER_CODES[r.u8()] || 'teal';
  s.world = WORLD_CODES[r.u8()] || 'auto';
  s.W = clamp(r.u16(), 200, 2000); s.H = clamp(r.u16(), 200, 2000);
  s.days = r.vu() / 10000; s.t = r.vu() / 10;
  s.moon0 = r.u16() / 65535; s.tide0 = r.u16() / 65535;
  s.weather = { rain: r.u8() / 255, target: r.u8() / 255, next: r.u8(), gust: 0 };
  s.currentBase = dq8(r.u8(), -PI, PI);
  const rec = r.u8();
  s.records = rec ? { gen: rec } : null;
  s.spawnNight = r.vu() - 1;
  s.eco = {};
  for (const k of ['births', 'arrivals', 'departures', 'eaten', 'rares']) s.eco[k] = r.vu();
  s.targets = {};
  for (let n = r.u8(); n > 0; n--) { const k = KIND_CODES[r.u8()], v = r.vu(); if (k) s.targets[k] = v; }
  s.inst = r.str();
  r.vu(); // saved-at time, unused now
  s.wild = [];
  for (let n = r.vu(); n > 0; n--) s.wild.push([r.u8() ? 'salt' : 'fresh', r.vu()]);
  s.schools = [];
  for (let n = r.u8(); n > 0; n--) {
    s.schools.push({ tx: dq8(r.u8(), 0, s.W), ty: dq8(r.u8(), 0, s.H), tz: dq8(r.u8(), 0, 50), until: 0, kind: SCHOOL_CODES[r.u8()] || null });
  }
  s.removed = {};
  for (const key of ['plants', 'pads', 'rocks']) { s.removed[key] = []; for (let n = r.vu(); n > 0; n--) s.removed[key].push(r.vu()); }
  s.addedPlants = [];
  for (let n = r.vu(); n > 0; n--) {
    const k = PLANT_CODES[r.u8()], seed = r.vu(), x = r.u16(), y = r.u16(), h = r.u8();
    if (k) s.addedPlants.push({ k, s: seed, x, y, a: k === 'weed' && h ? { habitat: h === 1 ? 'fresh' : 'salt' } : {} });
  }
  s.addedRocks = [];
  for (let n = r.vu(); n > 0; n--) {
    s.addedRocks.push({ x: r.u16(), y: r.u16(), a: r.u8() / 10, b: r.u8() / 10, h: r.u8() / 10, ang: dq8(r.u8(), -PI, PI), m: r.u8(), seed: r.vu() });
  }
  s.creatures = [];
  for (let n = r.vu(); n > 0; n--) {
    const k = KIND_CODES[r.u8()], seed = r.vu(), x = dq8(r.u8(), 0, s.W), y = dq8(r.u8(), 0, s.H), flags = r.u8();
    const a = {};
    if (k === 'koi') { const v = r.u8(); if (v) a.variety = v - 1; }
    else if (k === 'tetra') { const i = r.u8(); a.school = i ? i - 1 : null; }
    else if (k === 'wild') { a.sp = r.vu(); const i = r.u8(); a.school = i ? i - 1 : null; }
    else if (k === 'duck') { a.kind = DUCK_CODES[r.u8()] || 'hen'; const l = r.vu(); a.leader = l ? l - 1 : null; }
    const L = { age: r.vu(), energy: r.u8() / 255, gen: r.u8(), scale: flags & 16 ? r.u8() / 255 : 1 };
    const g = {};
    for (const key of GENE_KEYS) g[key] = dq8(r.u8(), ...GENE_LIMITS[key]);
    const t = r.u8();
    Object.assign(g, { albino: t & 3, melanistic: (t >> 2) & 3, piebald: (t >> 4) & 3, shiny: !!(t & 64) });
    g.shinyHue = g.shiny ? r.u8() : rand(100, 240);
    g.seed = g.piebald === 2 ? r.u16() : randi(0, 9999);
    L.genome = g;
    if (flags & 4) L.name = r.str();
    if (flags & 8) L.lifespan = r.vu();
    if (k) s.creatures.push({ k, seed, sn: null, x, y, sit: !!(flags & 1), a, L });
  }
  s.journal = [];
  for (let n = r.u8(); n > 0; n--) s.journal.push({ cat: CAT_CODES[r.u8()] || 'pond', day: r.vu(), clock: r.u8() / 255, text: r.str() });
  return s;
}

// Turn a decoded link into a regular save (see save.js), regrowing the scenery
// from the seed and the wild species from theirs.
function linkToSave(s) {
  const tmp = { W: s.W, H: s.H, seed: s.seed, opts: { habitat: s.habitat }, tide: { level: 0.5 }, rocks: [], plants: [], pads: [], creatures: [] };
  withSeed(`${s.seed}/${s.habitat}`, () => generateScenery(tmp));
  const keep = (list, key) => list.filter((o) => !s.removed[key].includes(o.oi));
  const plants = [...keep(tmp.plants, 'plants'), ...keep(tmp.pads, 'pads')];

  const before = WILD_SPECIES.splice(0);
  for (const [hab, seed] of s.wild) genWildSpecies(hab, seed);
  const wild = WILD_SPECIES.splice(0);
  WILD_SPECIES.push(...before);

  // Links since v2 don't carry population targets: the pond aims to keep what it has.
  const targets = s.targets || {};
  if (!s.targets) for (const c of s.creatures) targets[c.k] = (targets[c.k] || 0) + 1;

  return {
    v: SAVE_VERSION, seed: s.seed, savedAt: 0, inst: s.inst, removed: s.removed, spawnCount: s.spawnCount,
    opts: { habitat: s.habitat, floor: s.floor, water: s.water, world: s.world },
    size: [s.W, s.H], shoreSide: tmp.shoreSide,
    t: s.t, days: s.days, moon0: s.moon0, tide0: s.tide0, weather: s.weather, currentBase: s.currentBase,
    records: s.records, spawnNight: s.spawnNight, targets, eco: s.eco, journalSeq: s.journal.length, wild, game: s.game || null,
    rocks: [
      ...keep(tmp.rocks, 'rocks').map((r) => ({ x: r.x, y: r.y, a: r.a, b: r.b, ang: r.ang, h: r.h, m: ROCK_MATS.indexOf(r.m), seed: r.seed, oi: r.oi })),
      ...s.addedRocks,
    ],
    pebbles: tmp.pebbles.map((p) => [p.x, p.y, p.s, PEBBLE_MATS.indexOf(p.m)]),
    plants: [...plants.map((p) => ({ k: p.make, s: p.seed, x: p.x, y: p.y, a: p.args, oi: p.oi })), ...s.addedPlants],
    schools: s.schools,
    creatures: s.creatures.map((c) => {
      const lifespan = c.L.lifespan || lifespanFor(c.k, c.seed);
      return {
        k: c.k, s: c.seed, sn: c.sn, x: c.x, y: c.y, h: rand(-PI, PI), z: 0, a: c.a, st: c.sit ? 'sit' : undefined,
        L: {
          ...c.L, name: c.L.name || nameFor(c.seed), lifespan, old: c.L.age > lifespan * 0.8,
          cooldown: rand(20, 80), traits: traitsOf(c.L.genome), parents: c.L.parents || null,
        },
      };
    }),
    eggs: [],
    journal: s.journal.map((e, i) => ({ t: s.t, clock: e.clock, day: e.day, text: e.text, cat: e.cat, key: null, n: 1, data: [], seq: s.journal.length - i })),
  };
}

// ---- text form ---------------------------------------------------------------------------

async function pipeBytes(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

// The pond as link text: "p2z.<deflated base64url>", or "p2r." where compression isn't available.
async function encodePond(world) {
  const raw = packPond(world);
  if (typeof CompressionStream === 'undefined') return `p${LINK_V}r.${toBase64Url(raw)}`;
  const z = await pipeBytes(raw, new CompressionStream('deflate-raw'));
  return z.length < raw.length ? `p${LINK_V}z.${toBase64Url(z)}` : `p${LINK_V}r.${toBase64Url(raw)}`;
}

// Link text back to a save object, or null if it can't be read.
async function decodePond(text) {
  try {
    const m = /^p(\d+)([zr])\.([A-Za-z0-9_-]+)$/.exec(text);
    if (!m) return null;
    let bytes = fromBase64Url(m[3]);
    if (m[2] === 'z') bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
    const r = new ByteReader(bytes), v = r.u8();
    if (v !== +m[1]) return null;
    if (v === 2) return linkToSave(unpackV2(r));
    if (v === 1) return linkToSave(unpackV1(r));
    return null;
  } catch {
    return null;
  }
}
