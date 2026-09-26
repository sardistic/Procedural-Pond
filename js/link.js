'use strict';
// Pond links. The whole living pond packs into the link's #fragment, which
// browsers never send to the server, so length is no problem there. The link
// carries the seed and settings, time, moon, tide and weather, every animal
// (build seed, place, age, energy, generation and genes), schools, wild species
// (by their generation seeds), scenery changes, counters and recent journal lines.
// Scenery regrows from the seed, and names and lifespans follow from each
// animal's seed, so neither is stored. Genes keep 1/255 of their range.
// The bytes are deflated and written as base64url: "p1z.<data>".

const LINK_V = 1;
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
const LINK_JOURNAL = 10;

const q8 = (v, lo, hi) => Math.round((clamp(v, lo, hi) - lo) / (hi - lo) * 255);
const dq8 = (b, lo, hi) => lo + b / 255 * (hi - lo);

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

// ---- packing ---------------------------------------------------------------------------

function packPond(world) {
  const w = new ByteWriter(), { W, H, opts } = world;
  w.u8(LINK_V);
  w.str(world.seed);
  w.u8(Math.max(0, HAB_CODES.indexOf(opts.habitat)));
  w.u8(Math.max(0, FLOOR_CODES.indexOf(FLOOR_ALIASES[opts.floor] || opts.floor)));
  w.u8(Math.max(0, WATER_CODES.indexOf(opts.water)));
  w.u8(Math.max(0, WORLD_CODES.indexOf(opts.world)));
  w.u16(W); w.u16(H);
  w.vu(Math.round(world.days * 10000));
  w.vu(Math.round(world.t * 10));
  w.u16(Math.round(world.moon0 * 65535)); w.u16(Math.round(world.tide0 * 65535));
  w.u8(q8(world.weather.rain, 0, 1)); w.u8(q8(world.weather.target, 0, 1)); w.u8(clamp(Math.round(world.weather.next), 0, 255));
  w.u8(q8(wrapAngle(world.current.base), -PI, PI));
  w.u8(world.records ? Math.min(255, world.records.gen) : 0);
  w.vu(world.spawnNight + 1);
  for (const k of ['births', 'arrivals', 'departures', 'eaten', 'rares']) w.vu(ECO[k]);
  const targets = Object.entries(world.targets).filter(([k]) => KIND_CODES.includes(k));
  w.u8(targets.length);
  for (const [k, n] of targets) { w.u8(KIND_CODES.indexOf(k)); w.vu(n); }
  w.str(world.inst || '');
  w.vu(Math.floor(Date.now() / 1000));

  // Wild species, in discovery order (their ids are their positions).
  w.vu(WILD_SPECIES.length);
  for (const sp of WILD_SPECIES) { w.u8(sp.habitat === 'salt' ? 1 : 0); w.vu(sp.seed || 0); }

  const saved = world.creatures.filter((c) => c.make && c.life && !c.leaving && !c.gone && !c.caught && KIND_CODES.includes(c.make));
  const uid = new Map(saved.map((c, i) => [c, i]));
  const schools = [], schoolIdx = new Map();
  for (const c of saved) {
    if (c.school && !schoolIdx.has(c.school)) { schoolIdx.set(c.school, schools.length); schools.push(c.school); }
  }
  w.u8(Math.min(255, schools.length));
  for (const s of schools.slice(0, 255)) {
    w.u8(q8(s.tx, 0, W)); w.u8(q8(s.ty, 0, H)); w.u8(q8(s.tz, 0, 50)); w.u8(Math.max(0, SCHOOL_CODES.indexOf(s.kind || null)));
  }

  // Scenery: what the player removed from the generated pond, and what they added.
  const removed = world.removed || { plants: [], pads: [], rocks: [] };
  for (const key of ['plants', 'pads', 'rocks']) { w.vu(removed[key].length); for (const i of removed[key]) w.vu(i); }
  const added = [...world.plants, ...world.pads].filter((p) => p.oi == null && p.make && PLANT_CODES.includes(p.make));
  w.vu(added.length);
  for (const p of added) {
    w.u8(PLANT_CODES.indexOf(p.make)); w.vu(p.seed); w.u16(Math.round(p.x)); w.u16(Math.round(p.y));
    w.u8(p.make === 'weed' ? [null, 'fresh', 'salt'].indexOf(p.args.habitat ?? null) : 0);
  }
  const rocks = world.rocks.filter((r) => r.oi == null);
  w.vu(rocks.length);
  for (const r of rocks) {
    w.u16(Math.round(r.x)); w.u16(Math.round(r.y));
    w.u8(clamp(Math.round(r.a * 10), 0, 255)); w.u8(clamp(Math.round(r.b * 10), 0, 255)); w.u8(clamp(Math.round(r.h * 10), 0, 255));
    w.u8(q8(wrapAngle(r.ang), -PI, PI)); w.u8(Math.max(0, ROCK_MATS.indexOf(r.m))); w.vu(r.seed);
  }

  // Animals.
  w.vu(saved.length);
  for (const c of saved) {
    const L = c.life, g = L.genome;
    const hasName = L.name !== nameFor(c.seed), hasLife = Math.abs(L.lifespan - lifespanFor(c.species, c.seed)) > 1;
    w.u8(KIND_CODES.indexOf(c.make)); w.vu(c.seed);
    w.u8(q8(c.x, 0, W)); w.u8(q8(c.y, 0, H));
    w.u8((c.state === 'sit' ? 1 : 0) | (L.old ? 2 : 0) | (hasName ? 4 : 0) | (hasLife ? 8 : 0) | (L.scale < 0.999 ? 16 : 0));
    const a = c.args || {};
    if (c.make === 'koi') w.u8(a.variety == null ? 0 : a.variety + 1);
    else if (c.make === 'tetra') w.u8(a.school ? schoolIdx.get(a.school) + 1 : 0);
    else if (c.make === 'wild') { w.vu(a.sp ? a.sp.id : 0); w.u8(a.school ? schoolIdx.get(a.school) + 1 : 0); }
    else if (c.make === 'duck') { w.u8(Math.max(0, DUCK_CODES.indexOf(a.kind))); w.vu(uid.has(c.leader) ? uid.get(c.leader) + 1 : 0); }
    w.vu(L.age); w.u8(q8(L.energy, 0, 1)); w.u8(Math.min(255, L.gen));
    if (L.scale < 0.999) w.u8(q8(L.scale, 0, 1));
    for (const k of GENE_KEYS) w.u8(q8(g[k], ...GENE_LIMITS[k]));
    w.u8((g.albino || 0) | ((g.melanistic || 0) << 2) | ((g.piebald || 0) << 4) | (g.shiny ? 64 : 0));
    if (g.shiny) w.u8(clamp(Math.round(g.shinyHue), 0, 255));
    if (g.piebald === 2) w.u16(g.seed || 0);
    if (hasName) w.str(L.name);
    if (hasLife) w.vu(L.lifespan);
  }

  // The latest journal lines.
  const lines = world.journal.slice(0, LINK_JOURNAL);
  w.u8(lines.length);
  for (const e of lines) { w.u8(Math.max(0, CAT_CODES.indexOf(e.cat))); w.vu(e.day); w.u8(q8(e.clock, 0, 1)); w.str(e.text.slice(0, 160)); }
  return w.bytes();
}

function unpackPond(bytes) {
  const r = new ByteReader(bytes);
  if (r.u8() !== LINK_V) throw new Error('unknown pond link version');
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
  s.savedAt = r.vu() * 1000;
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
    const L = { age: r.vu(), energy: r.u8() / 255, gen: r.u8(), scale: flags & 16 ? r.u8() / 255 : 1, old: !!(flags & 2) };
    const g = {};
    for (const key of GENE_KEYS) g[key] = dq8(r.u8(), ...GENE_LIMITS[key]);
    const t = r.u8();
    Object.assign(g, { albino: t & 3, melanistic: (t >> 2) & 3, piebald: (t >> 4) & 3, shiny: !!(t & 64) });
    g.shinyHue = g.shiny ? r.u8() : rand(100, 240);
    g.seed = g.piebald === 2 ? r.u16() : randi(0, 9999);
    L.genome = g;
    if (flags & 4) L.name = r.str();
    if (flags & 8) L.lifespan = r.vu();
    if (k) s.creatures.push({ k, seed, x, y, sit: !!(flags & 1), a, L });
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

  return {
    v: SAVE_VERSION, seed: s.seed, savedAt: s.savedAt, inst: s.inst, removed: s.removed,
    opts: { habitat: s.habitat, floor: s.floor, water: s.water, world: s.world },
    size: [s.W, s.H], shoreSide: tmp.shoreSide,
    t: s.t, days: s.days, moon0: s.moon0, tide0: s.tide0, weather: s.weather, currentBase: s.currentBase,
    records: s.records, spawnNight: s.spawnNight, targets: s.targets, eco: s.eco, journalSeq: s.journal.length, wild,
    rocks: [
      ...keep(tmp.rocks, 'rocks').map((r) => ({ x: r.x, y: r.y, a: r.a, b: r.b, ang: r.ang, h: r.h, m: ROCK_MATS.indexOf(r.m), seed: r.seed, oi: r.oi })),
      ...s.addedRocks,
    ],
    pebbles: tmp.pebbles.map((p) => [p.x, p.y, p.s, PEBBLE_MATS.indexOf(p.m)]),
    plants: [...plants.map((p) => ({ k: p.make, s: p.seed, x: p.x, y: p.y, a: p.args, oi: p.oi })), ...s.addedPlants],
    schools: s.schools,
    creatures: s.creatures.map((c) => ({
      k: c.k, s: c.seed, x: c.x, y: c.y, h: rand(-PI, PI), z: 0, a: c.a, st: c.sit ? 'sit' : undefined,
      L: {
        ...c.L, name: c.L.name || nameFor(c.seed), lifespan: c.L.lifespan || lifespanFor(c.k, c.seed),
        cooldown: rand(20, 80), traits: traitsOf(c.L.genome),
      },
    })),
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

// The pond as link text: "p1z.<deflated base64url>", or "p1r." where compression isn't available.
async function encodePond(world) {
  const raw = packPond(world);
  if (typeof CompressionStream === 'undefined') return `p${LINK_V}r.${toBase64Url(raw)}`;
  return `p${LINK_V}z.${toBase64Url(await pipeBytes(raw, new CompressionStream('deflate-raw')))}`;
}

// Link text back to a save object, or null if it can't be read.
async function decodePond(text) {
  try {
    const m = /^p(\d+)([zr])\.([A-Za-z0-9_-]+)$/.exec(text);
    if (!m || +m[1] !== LINK_V) return null;
    let bytes = fromBase64Url(m[3]);
    if (m[2] === 'z') bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
    return linkToSave(unpackPond(bytes));
  } catch {
    return null;
  }
}
