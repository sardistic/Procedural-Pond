'use strict';
// Saving and resuming ponds. A save holds the whole living pond: time, moon,
// tide and weather; the scenery (rocks, pebbles, plants, where the beach is);
// every animal (its build seed plus genes, name, age, energy and generation);
// eggs, schools, discovered wild species, population targets and the journal;
// the score and family trees (game.js), and the pond's short link if it has one.
// Saves live in localStorage, one per pond seed; link.js packs the same pond into
// a URL, and net.js keeps a copy on the server behind a short link.
// Ambient things (plankton, ripples, fireflies, gnats) simply regrow.

const SAVE_VERSION = 1;
const SAVE_PREFIX = 'procedural-pond.save.';
const SAVE_INDEX = 'procedural-pond.saves';
const MAX_SAVES = 12;

const r2 = (v) => Math.round(v * 100) / 100;
// Identifies this browser's copy of a pond, so a link to an older state of your
// own pond doesn't roll it back, while someone else's copy of the same seed asks first.
const newInst = () => Array.from({ length: 8 }, () => Math.floor(Math.random() * 36).toString(36)).join('');

function readIndex() {
  try { return JSON.parse(localStorage.getItem(SAVE_INDEX) || '[]'); } catch { return []; }
}

// Saved ponds, most recently played first: [{ seed, habitat, days, animals, rares, savedAt }].
function listSaves() {
  return readIndex().sort((a, b) => b.savedAt - a.savedAt);
}

function loadSave(seed) {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_PREFIX + seed) || 'null');
    return isSave(d) && d.seed === seed ? d : null;
  } catch { return null; }
}

const isSave = (d) => !!d && d.v === SAVE_VERSION && typeof d.seed === 'string' && /^[a-z0-9-]{1,40}$/.test(d.seed) &&
  Array.isArray(d.creatures) && Array.isArray(d.plants) && Array.isArray(d.rocks) && Array.isArray(d.size);

function deleteSave(seed) {
  try {
    localStorage.removeItem(SAVE_PREFIX + seed);
    localStorage.setItem(SAVE_INDEX, JSON.stringify(readIndex().filter((s) => s.seed !== seed)));
  } catch { /* storage unavailable */ }
}

// Store a save and index it. Past MAX_SAVES, or when storage is full, the
// least recently played ponds are dropped to make room. Throws if even that fails.
function storeSave(d) {
  const text = JSON.stringify(d);
  const list = listSaves().filter((s) => s.seed !== d.seed);
  while (list.length >= MAX_SAVES) localStorage.removeItem(SAVE_PREFIX + list.pop().seed);
  for (;;) {
    try { localStorage.setItem(SAVE_PREFIX + d.seed, text); break; } catch (e) {
      if (!list.length) throw e;
      localStorage.removeItem(SAVE_PREFIX + list.pop().seed);
    }
  }
  list.unshift({
    seed: d.seed, habitat: d.opts.habitat, days: d.days, savedAt: d.savedAt, points: d.game ? d.game.points : 0, link: d.link ? d.link.id : null,
    depth: fathomsOf(d.erosion ? d.erosion.e : 0, d.opts.habitat === 'fresh' ? 'fresh' : 'salt'),
    animals: d.creatures.length, rares: d.creatures.filter((c) => c.L.traits && c.L.traits.length).length,
  });
  localStorage.setItem(SAVE_INDEX, JSON.stringify(list));
}

// ---- serialize ---------------------------------------------------------------------

function serializePond(world) {
  const saved = world.creatures.filter((c) => c.make && c.life && !c.leaving && !c.dying && !c.gone && !c.caught);
  const uid = new Map(saved.map((c, i) => [c, i]));
  const schools = [], schoolIdx = new Map();
  const schoolRef = (s) => {
    if (!s) return null;
    if (!schoolIdx.has(s)) {
      schoolIdx.set(s, schools.length);
      schools.push({ tx: r2(s.tx), ty: r2(s.ty), tz: r2(s.tz), until: r2(s.until), kind: s.kind || null });
    }
    return schoolIdx.get(s);
  };
  // Object references in construction args become indexes and ids.
  const args = (a) => {
    const o = {};
    for (const [k, v] of Object.entries(a || {})) {
      if (k === 'school') o.school = schoolRef(v);
      else if (k === 'sp') o.sp = v ? v.id : null;
      else if (k === 'leader') o.leader = uid.has(v) ? uid.get(v) : null;
      else if (v === undefined || typeof v !== 'object') o[k] = v;
    }
    return o;
  };
  const parent = (c) => ({
    species: c.species, variety: c.variety, school: schoolRef(c.school), sp: c.sp ? c.sp.id : null,
    life: { name: c.life.name, gen: c.life.gen, genome: c.life.genome },
  });
  return {
    v: SAVE_VERSION, seed: world.seed, savedAt: Date.now(), inst: world.inst, removed: world.removed, spawnCount: world.spawnCount,
    opts: { habitat: world.opts.habitat, floor: world.opts.floor, water: world.opts.water, world: world.opts.world },
    size: [world.W, world.H], shoreSide: world.shoreSide,
    t: r2(world.t), days: world.days, moon0: world.moon0, tide0: world.tide0,
    weather: { rain: r2(world.weather.rain), target: r2(world.weather.target), next: r2(world.weather.next) },
    currentBase: world.current.base, records: world.records, spawnNight: world.spawnNight,
    targets: world.targets, eco: { ...ECO }, journalSeq: world.journalSeq,
    game: world.game, lineage: world.lineage ? [...world.lineage.values()] : [], link: world.link || null,
    structures: (world.structures || []).map((s) => ({ k: s.kind, x: r2(s.x), y: r2(s.y), s: s.seed, born: r2(s.born) })),
    fossils: (world.fossils || []).map((f) => ({ x: r2(f.x), y: r2(f.y), k: f.kind, g: f.gene, born: r2(f.born) })),
    erosion: world.erosion || null, expandPx: world.expandPx || 0, base: world.expandPx ? baseSize(world) : [world.W, world.H],
    hatchery: world.hatchery ? { ...world.hatchery, stock: packStock(world.hatchery) } : null,
    wild: WILD_SPECIES,
    rocks: world.rocks.map((r) => ({ x: r2(r.x), y: r2(r.y), a: r2(r.a), b: r2(r.b), ang: r2(r.ang), h: r2(r.h), m: ROCK_MATS.indexOf(r.m), seed: r.seed, oi: r.oi, born: r.born })),
    pebbles: world.pebbles.map((p) => [r2(p.x), r2(p.y), r2(p.s), PEBBLE_MATS.indexOf(p.m)]),
    plants: [...world.plants, ...world.pads].filter((p) => p.make).map((p) => ({
      k: p.make, s: p.seed, x: r2(p.x), y: r2(p.y), a: args(p.args), oi: p.oi, born: p.born,
      g: p.growth != null ? r2(p.growth) : undefined, age: p.age != null ? r2(p.age) : undefined, span: p.span != null ? r2(p.span) : undefined,
    })),
    succession: world.succession || null,
    creatures: saved.map((c) => ({
      k: c.make, s: c.seed, sn: c.sn, x: r2(c.x), y: r2(c.y), h: r2(c.heading), z: r2(c.z || 0), a: args(c.args),
      st: c.state === 'sit' ? 'sit' : undefined,
      L: {
        name: c.life.name, age: r2(c.life.age), energy: r2(c.life.energy), cooldown: r2(c.life.cooldown), fed: r2(c.life.fed || 0), comfort: r2(c.life.comfort ?? 0.5),
        corruption: c.life.genome.eld ? r2(c.life.corruption || 0) : undefined, bound: c.life.bound || undefined,
        lifespan: r2(c.life.lifespan), gen: c.life.gen, scale: c.life.scale, old: !!c.life.old, inbred: r2(c.life.inbred || 0),
        genome: c.life.genome, traits: c.life.traits, parents: c.life.parents,
      },
    })),
    schools,
    eggs: world.eggs.map((e) => ({ x: r2(e.x), y: r2(e.y), z: r2(e.z), place: e.place, n: e.cells.length, timer: r2(e.timer), p: parent(e.parent), m: parent(e.mate) })),
    journal: world.journal.slice(0, 120).map((e) => ({
      t: r2(e.t), clock: r2(e.clock), day: e.day, text: e.text, cat: e.cat, key: e.key, n: e.n, data: e.data, seq: e.seq,
      u: e.subject && uid.has(e.subject) ? uid.get(e.subject) : null,
    })),
  };
}

// ---- restore -------------------------------------------------------------------------

function restoreRock(r) {
  const rock = makeRock(r.x, r.y, r.a, ROCK_MATS[r.m] || ROCK_MATS[0]);
  Object.assign(rock, { b: r.b, ang: r.ang, h: r.h, seed: r.seed, oi: r.oi, born: r.born });
  return rock;
}

// Put a rebuilt animal back where it was.
function placeRestored(c, r) {
  if (c.species === 'frog' && r.st === 'sit' && c.pad) return; // back on a lily pad
  if (c.species === 'frog') { c.pad = null; c.targetPad = null; c.state = 'swim'; }
  c.heading = r.h; c.x = r.x; c.y = r.y;
  if (c.place) c.place(r.x, r.y); else c.body.place(r.x, r.y, r.h);
  if (c.footRest) {
    for (const L of c.legs) [L.fx, L.fy] = c.footRest(L);
    c.updateLegs(0);
  }
  if (r.z) { c.z = r.z; if ('tz' in c) c.tz = r.z; }
}

// Move everything in a save by (dx, dy), for a world that grows left or up.
function shiftSave(d, dx, dy) {
  if (!dx && !dy) return d;
  const mv = (o) => { if (o) { o.x += dx; o.y += dy; } };
  d.creatures.forEach(mv); d.plants.forEach(mv); d.rocks.forEach(mv); (d.structures || []).forEach(mv); (d.eggs || []).forEach(mv); (d.fossils || []).forEach(mv);
  d.pebbles = (d.pebbles || []).map(([x, y, s, m]) => [x + dx, y + dy, s, m]);
  for (const s of d.schools || []) { s.tx += dx; s.ty += dy; }
  if (d.erosion) (d.erosion.lagoons || []).forEach(mv);
  return d;
}

// Rebuild a world from a save. The world's size must already match d.size.
function restorePond(world, d) {
  Object.assign(world, {
    t: d.t || 0, days: d.days, moon0: d.moon0, tide0: d.tide0, shoreSide: d.shoreSide,
    records: d.records || null, spawnNight: d.spawnNight ?? -1, targets: d.targets || {}, journalSeq: d.journalSeq || 0,
    inst: d.inst || newInst(), removed: d.removed || { plants: [], pads: [], rocks: [] },
    game: { ...newGame(), ...(d.game || {}) }, link: d.link && d.link.id ? { ...d.link } : null,
    lineage: new Map((d.lineage || []).filter((r) => r && r.s != null).map((r) => [r.s, r])),
  });
  world.clock = ((world.days % 1) + 1) % 1;
  Object.assign(world.weather, d.weather || {});
  if (typeof d.currentBase === 'number') world.current.base = d.currentBase;
  WILD_SPECIES.length = 0;
  WILD_SPECIES.push(...(d.wild || []));
  const spById = new Map(WILD_SPECIES.map((s) => [s.id, s]));

  world.expandPx = d.expandPx || 0;
  world.succession = d.succession || null;
  world.erosion = { ...newErosion(), ...(d.erosion || {}), next: 0 };
  // Structures first: islands shape the beach that makeShore builds.
  world.structures = (d.structures || []).filter((s) => STRUCTURES[s.k]).map((s) => makeStructure(s.k, world, s.x, s.y, s.s, s.born ?? world.days));
  world.fossils = (d.fossils || []).map((f) => new Fossil(f.x, f.y, f.k, f.g, f.born));
  world.remains = [];
  world.hatchery = null;
  if (d.hatchery) {
    const h = newHatchery();
    world.hatchery = { ...h, ...d.hatchery, levels: { ...h.levels, ...(d.hatchery.levels || {}) }, stock: unpackStock(d.hatchery.stock) };
    // The auto-feeder kept working while you were away (up to 8 hours).
    if (d.savedAt) feedHatchery(world, hatchAuto(world.hatchery) * Math.min(8 * 3600, Math.max(0, (Date.now() - d.savedAt) / 1000)));
  }
  makeShore(world);
  world.rocks = d.rocks.map(restoreRock);
  world.pebbles = (d.pebbles || []).map(([x, y, s, m]) => ({ x, y, s, m: PEBBLE_MATS[m] || PEBBLE_MATS[0] }));
  world.plants = [];
  world.pads = [];
  for (const p of d.plants) {
    if (!GROW[p.k]) continue;
    const plant = makePlant(p.k, world, p.x, p.y, p.a || {}, p.s);
    plant.oi = p.oi;
    if (p.born != null) plant.born = p.born;
    if (p.g != null) Object.assign(plant, { growth: p.g, age: p.age, span: p.span });
    (p.k === 'lily' ? world.pads : world.plants).push(plant);
  }
  world.motes = new Motes(world);

  const schools = (d.schools || []).map((s) => ({ ...s }));
  const resolve = (a) => {
    const o = { ...a };
    if ('school' in o) o.school = o.school == null ? null : schools[o.school] || null;
    if ('sp' in o) o.sp = spById.get(o.sp) || null;
    if ('leader' in o) o.leader = null; // linked once everyone exists
    return o;
  };
  const made = d.creatures.map((r) => {
    const a = resolve(r.a || {});
    if (!CREATE[r.k] || (r.k === 'wild' && !a.sp)) return null;
    const c = makeCreature(r.k, world, r.x, r.y, a, r.s);
    placeRestored(c, r);
    initLife(c, { genome: r.L.genome, gen: r.L.gen, scale: r.L.scale, age: r.L.age, alpha: 1, inbred: r.L.inbred || 0 });
    Object.assign(c.life, {
      name: r.L.name, energy: r.L.energy, cooldown: r.L.cooldown, lifespan: r.L.lifespan, old: r.L.old, parents: r.L.parents || null,
      fed: r.L.fed || 0, comfort: r.L.comfort ?? 0.5, corruption: r.L.corruption || 0, bound: !!r.L.bound,
    });
    if (c.life.genome.eld) c.life.traits = eldTraits(c.life);
    c.sn = r.sn ?? null;
    return c;
  });
  d.creatures.forEach((r, i) => {
    const c = made[i];
    if (c && r.a && r.a.leader != null && made[r.a.leader]) { c.leader = made[r.a.leader]; c.args.leader = c.leader; }
  });
  world.creatures = made.filter(Boolean);
  world.spawnCount = d.spawnCount ?? world.creatures.reduce((n, c) => Math.max(n, (c.sn ?? -1) + 1), 0);
  seedLineage(world); // anyone missing from the family trees (older saves, links)

  world.eggs = [];
  for (const e of d.eggs || []) {
    const stub = (s) => ({ ...s, school: s.school == null ? null : schools[s.school] || null, sp: s.sp != null ? spById.get(s.sp) : null });
    const p = stub(e.p), m = stub(e.m);
    if (!BREED[p.species] || (p.species === 'wild' && !p.sp)) continue;
    const egg = new Eggs(world, p, m, e.x, e.y, e.z, e.place);
    egg.cells.length = Math.min(egg.cells.length, e.n);
    while (egg.cells.length < e.n) egg.cells.push({ ox: rand(-2.2, 2.2), oy: rand(-2.2, 2.2), p: rand(0, TAU) });
    egg.timer = e.timer;
    egg.alpha = 1;
    world.eggs.push(egg);
  }

  world.journal = (d.journal || []).map(({ u, ...e }) => ({ ...e, data: e.data || [], subject: u != null ? made[u] || null : null }));
  Object.assign(ECO, d.eco || {});
}
