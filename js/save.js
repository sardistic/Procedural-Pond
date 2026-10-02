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

// The season: when every pond is reset (the server wiped), this goes up by one, and each browser lets go of
// the ponds it kept from before, once, on its next visit (its settings and sign-in stay). The server takes
// ponds only from pages of this season, so a page left open from before can't bring an old pond back.
const SAVE_EPOCH = 2;
const saveReset = (() => {
  try {
    if (typeof localStorage === 'undefined' || localStorage.getItem('pond.epoch') === String(SAVE_EPOCH)) return false;
    let n = 0;
    for (const k of Object.keys(localStorage)) if (k.startsWith(SAVE_PREFIX) || k === SAVE_INDEX) { if (k !== SAVE_INDEX) n++; localStorage.removeItem(k); }
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('pond.home'); } catch { /* storage unavailable */ }
    localStorage.setItem('pond.epoch', String(SAVE_EPOCH));
    return n > 0;
  } catch { return false; }
})();

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
    seed: d.seed, habitat: d.opts.habitat, days: d.days, savedAt: d.savedAt, points: d.game ? d.game.points : 0, link: d.link ? d.link.id : null, slug: (d.link && d.link.slug) || null,
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
    weather: { rain: r2(world.weather.rain), target: r2(world.weather.target), next: r2(world.weather.next), blood: world.weather.blood || undefined },
    heavens: world.heavens || null,
    land: typeof landPack === 'function' ? landPack(world) : null, landSeen: world.landSeen || null, formSeen: world.formSeen || null, isleJoins: world.isleJoins || null,
    forms: (world.forms || []).map((f) => [f.k, r2(f.x), r2(f.y), f.seed, r2(f.born), r2(f.g), r2(f.gs || 0)]),
    boneBeds: (world.boneBeds || []).map((b) => [r2(b.x), r2(b.y), r2(b.ang), r2(b.len), r2(b.w), b.seed, r2(b.born), b.k]),
    detritus: (world.detritus || []).map((d) => [r2(d.x), r2(d.y), d.k, r2(d.v), r2(d.born)]),
    xeno: world.xeno || [], parasites: (world.parasites || []).map((p) => ({ x: r2(p.x), y: r2(p.y), z: r2(p.z), kind: p.kind, gen: p.gen, t: r2(p.t) })), xenoShards: world.xenoShards || [],
    slicks: (world.slicks || []).map((s) => ({ x: r2(s.x), y: r2(s.y), r: r2(s.r), oil: r2(s.oil), seed: s.seed, t: s.fromTar ? 1 : undefined })), tar: world.tar || null,
    currentBase: world.current.base, records: world.records, spawnNight: world.spawnNight,
    targets: world.targets, eco: { ...ECO }, journalSeq: world.journalSeq,
    game: world.game, lineage: world.lineage ? [...world.lineage.values()] : [], link: world.link || null,
    structures: (world.structures || []).map((s) => ({ k: s.kind, x: r2(s.x), y: r2(s.y), s: s.seed, born: r2(s.born), lv: s.lv, stack: s.stack, branch: s.branch, blv: s.blv, deep: s.deep || undefined, w: s.worth || undefined, evo: s.evo || undefined, ig: s.ig || undefined,
      fl: s.flora && s.flora.length ? s.flora.map((f) => [f.t, f.x, f.y, r2(f.b), r2(f.span), r2(f.g), f.s, f.dead ? 1 : 0]) : undefined })),
    story: world.story || null, darkAvg: world.darkAvg ?? null,
    litter: (world.litter || []).map((l) => ({ k: l.k, x: r2(l.x), y: r2(l.y), b: r2(l.born), hp: l.hp, s: l.seed })),
    blight: world.blight || null,
    meta: world.meta || null,
    fossils: (world.fossils || []).map((f) => ({ x: r2(f.x), y: r2(f.y), k: f.kind, g: f.gene, born: r2(f.born) })),
    erosion: world.erosion || null, expandPx: world.expandPx || 0, base: world.expandPx ? baseSize(world) : [world.W, world.H],
    hatchery: world.hatchery ? { ...world.hatchery, stock: packStock(world.hatchery) } : null,
    wild: WILD_SPECIES,
    rocks: world.rocks.map((r) => ({ x: r2(r.x), y: r2(r.y), a: r2(r.a), b: r2(r.b), ang: r2(r.ang), h: r2(r.h), m: ROCK_MATS.indexOf(r.m), seed: r.seed, oi: r.oi, born: r.born })),
    pebbles: world.pebbles.map((p) => [r2(p.x), r2(p.y), r2(p.s), PEBBLE_MATS.indexOf(p.m)]),
    plants: [...world.plants, ...world.pads].filter((p) => p.make).map((p) => ({
      k: p.make, s: p.seed, x: r2(p.x), y: r2(p.y), a: args(p.args), oi: p.oi, born: p.born,
      g: p.growth != null ? r2(p.growth) : undefined, age: p.age != null ? r2(p.age) : undefined, span: p.span != null ? r2(p.span) : undefined,
      tr: p.tr || undefined,
    })),
    succession: world.succession || null,
    creatures: saved.map((c) => creatureRecord(c, args(c.args))),
    schools,
    eggs: world.eggs.map((e) => ({ x: r2(e.x), y: r2(e.y), z: r2(e.z), place: e.place, n: e.cells.length, timer: r2(e.timer), p: parent(e.parent), m: parent(e.mate) })),
    journal: world.journal.slice(0, 120).map((e) => ({
      t: r2(e.t), clock: r2(e.clock), day: e.day, text: e.text, cat: e.cat, key: e.key, n: e.n, data: e.data, seq: e.seq,
      pri: e.pri, routine: e.routine || undefined, digestCount: e.digestCount || undefined,
      u: e.subject && uid.has(e.subject) ? uid.get(e.subject) : null,
    })),
    newsSeen: world.newsSeen instanceof Map ? [...world.newsSeen].map(([sig, v]) => [sig, v.n, r2(v.day), v.pending]) : undefined,
  };
}

// ---- restore -------------------------------------------------------------------------

function restoreRock(r) {
  const rock = makeRock(r.x, r.y, r.a, ROCK_MATS[r.m] || ROCK_MATS[0]);
  Object.assign(rock, { b: r.b, ang: r.ang, h: r.h, seed: r.seed, oi: r.oi, born: r.born });
  return rock;
}

// Put a rebuilt animal back where it was.
// One animal as a save holds it (a wanderer carries the same, without its construction args).
function creatureRecord(c, a = {}) {
  const L = c.life;
  return {
    k: c.make, s: c.seed, sn: c.sn, x: r2(c.x), y: r2(c.y), h: r2(c.heading), z: r2(c.z || 0), a,
    st: c.state === 'sit' ? 'sit' : undefined,
    L: {
      name: L.name, age: r2(L.age), energy: r2(L.energy), cooldown: r2(L.cooldown), fed: r2(L.fed || 0), comfort: r2(L.comfort ?? 0.5),
      corruption: L.genome.eld ? r2(L.corruption || 0) : undefined, bound: L.bound || undefined,
      absorbed: L.absorbed || undefined, ascended: L.ascended || undefined, boosts: L.boosts || undefined,
      quirks: L.quirks && L.quirks.length ? L.quirks : undefined, ill: L.ill && L.ill.length ? L.ill : undefined,
      hunt: L.hunt || undefined, hunter: L.hunter || undefined, madCount: L.madCount || undefined,
      mind: L.mind || undefined, mindMemory: L.mindMemory?.slice(-4),
      mindLog: typeof mindCleanLog==='function' && L.mindLog?.length ? mindCleanLog(L.mindLog) : undefined,
      safe: L.safe || undefined, paragon: L.paragon || undefined, warps: L.warps && L.warps.length ? L.warps : undefined,
      wanderer: L.wanderer || undefined, para: L.para || undefined,
      lifespan: r2(L.lifespan), gen: L.gen, scale: L.scale, old: !!L.old, inbred: r2(L.inbred || 0),
      genome: L.genome, traits: L.traits, parents: L.parents,
    },
  };
}
// And back: an animal made from its record (`a`, its construction args, already resolved).
function restoreCreature(world, r, a = {}) {
  const c = makeCreature(r.k, world, r.x, r.y, a, r.s);
  placeRestored(c, r);
  initLife(c, { genome: r.L.genome, gen: r.L.gen, scale: r.L.scale, age: r.L.age, alpha: 1, inbred: r.L.inbred || 0 });
  Object.assign(c.life, {
    name: r.L.name, energy: r.L.energy ?? 0.6, cooldown: r.L.cooldown ?? 30, lifespan: r.L.lifespan, old: !!r.L.old, parents: r.L.parents || null,
    fed: r.L.fed || 0, comfort: r.L.comfort ?? 0.5, corruption: r.L.corruption || 0, bound: !!r.L.bound,
    absorbed: r.L.absorbed || 0, ascended: !!r.L.ascended, boosts: r.L.boosts || null,
    quirks: r.L.quirks || [], ill: r.L.ill || [], hunt: r.L.hunt || null, hunter: !!r.L.hunter, madCount: r.L.madCount || 0,
    mind: r.L.mind === true, mindMemory: Array.isArray(r.L.mindMemory) ? r.L.mindMemory.slice(-4).filter(m =>
      ['fed','threat','prey_lost'].includes(m?.event) && typeof m.species === 'string' && m.species.length<=40) : [],
    mindLog: typeof mindCleanLog==='function' ? mindCleanLog(r.L.mindLog) : [],
    safe: !!r.L.safe, paragon: !!r.L.paragon, warps: r.L.warps && r.L.warps.length ? r.L.warps : null, wanderer: r.L.wanderer || null,
    para: r.L.para && typeof PARASITES !== 'undefined' && PARASITES[r.L.para.k] ? r.L.para : null,
  });
  if (r.L.paragon && c.id) { OUTLINE[c.id] = RARE_OUTLINE.paragon; THICK[c.id] = 1; }
  if (r.L.wanderer && c.id) { OUTLINE[c.id] = WANDER_OUTLINE; THICK[c.id] = 1; } // (a wanderer, still here: red-edged)
  c.life.traits = eldTraits(c.life);
  refreshBuffs(c);
  c.sn = r.sn ?? null;
  return c;
}
const WANDER_OUTLINE = hexToInt('#ff4a2a');

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
  d.creatures.forEach(mv); d.plants.forEach(mv); d.rocks.forEach(mv); (d.structures || []).forEach(mv); (d.eggs || []).forEach(mv); (d.fossils || []).forEach(mv); (d.litter || []).forEach(mv);
  d.pebbles = (d.pebbles || []).map(([x, y, s, m]) => [x + dx, y + dy, s, m]);
  for (const s of d.schools || []) { s.tx += dx; s.ty += dy; }
  if (d.erosion) (d.erosion.lagoons || []).forEach(mv);
  (d.xeno || []).forEach(mv); (d.xenoShards || []).forEach(mv); (d.parasites || []).forEach(mv); (d.slicks || []).forEach(mv); if (d.tar) mv(d.tar);
  // What the land remembers moves with it (the grid by whole cells, when it's unpacked).
  if (d.land) { d.land.sx = (d.land.sx || 0) + dx; d.land.sy = (d.land.sy || 0) + dy; }
  d.forms = (d.forms || []).map(([k, x, y, ...rest]) => [k, x + dx, y + dy, ...rest]);
  d.boneBeds = (d.boneBeds || []).map(([x, y, ...rest]) => [x + dx, y + dy, ...rest]);
  d.detritus = (d.detritus || []).map(([x, y, ...rest]) => [x + dx, y + dy, ...rest]);
  if (d.isleJoins) for (const j of Object.values(d.isleJoins)) { j.x += dx; j.y += dy; }
  if (d.game && d.game.nests) d.game = { ...d.game, nests: d.game.nests.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })) }; // (turtles' nests: shore.js)
  return d;
}

// Rebuild a world from a save. The world's size must already match d.size.
function restorePond(world, d) {
  if (d.seed) world.seed = d.seed; // the river (and anything else seeded from the pond) follows its name
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
  world.structures = (d.structures || []).filter((s) => STRUCTURES[s.k]).map((s) => Object.assign(makeStructure(s.k, world, s.x, s.y, s.s, s.born ?? world.days),
    s.lv ? { lv: s.lv } : {}, s.stack ? { stack: s.stack } : {}, s.branch ? { branch: s.branch, blv: s.blv || 1 } : {}, s.deep ? { deep: s.deep } : {}, s.w ? { worth: s.w } : {}, s.evo ? { evo: s.evo } : {}, s.ig ? { ig: { sz: 1, st: 0, lob: 0, bar: 0, ...s.ig, f: { ...(s.ig.f || {}) } } } : {},
    s.fl ? { flora: s.fl.map(([t, x, y, b, span, g, sd, dead]) => ({ t, x, y, b, span, g, gs: g, s: sd, ...(dead ? { dead: 1 } : {}) })) } : {}));
  if (typeof growWreck === 'function') for (const s of world.structures) growWreck(s); // (a wreck the size of how deep it went down)
  world.story = d.story || null;
  world.heavens = d.heavens || null;
  world.slicks = (d.slicks || []).map(({ t, ...s }) => (t ? { ...s, fromTar: true } : { ...s }));
  world.tar = d.tar || null;
  if (typeof landUnpack === 'function') landUnpack(world, d.land, d.land && d.land.sx, d.land && d.land.sy);
  world.landSeen = d.landSeen || {}; world.formSeen = d.formSeen || {}; world.isleJoins = d.isleJoins || {};
  world.forms = (d.forms || []).filter((f) => typeof FORMS !== 'undefined' && FORMS[f[0]]).map(([k, x, y, seed, born, g, gs]) => ({ k, x, y, seed, born, g, gs, baked: gs }));
  world.boneBeds = (d.boneBeds || []).map(([x, y, ang, len, w, seed, born, k]) => ({ x, y, ang, len, w, seed, born, k, gs: clamp(((d.days ?? world.days) - born) / 12, 0, 1) }));
  world.detritus = (d.detritus || []).map(([x, y, k, v, born]) => ({ x, y, k, v, born, ph: Math.random() * 6.3 }));
  world.xeno = (d.xeno || []).filter((a) => a && PARASITES[a.kind]);
  world.parasites = (d.parasites || []).filter((p) => p && PARASITES[p.kind]).map((p) => ({ ...p, h: rand(-PI, PI), ph: rand(0, TAU) }));
  world.xenoShards = (d.xenoShards || []).filter((s) => s && PARASITES[s.kind]);
  world.darkAvg = d.darkAvg ?? undefined;
  world.litter = (d.litter || []).filter((l) => LITTER[l.k]).map((l) => new Litter(l.k, l.x, l.y, l.b ?? world.days, l.hp, l.s));
  world.blight = d.blight || null;
  world.meta = d.meta || null;
  Object.assign(world, { riverW: 0, islandKey: null, scourKey: null }); // the river is re-cut at its width for the pond's age
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
    if (p.tr) { plant.tr = p.tr; if (p.tr.eld) VOID_SKIN[plant.id] = 4; }
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
    return restoreCreature(world, r, a);
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
  world.newsSeen = new Map((Array.isArray(d.newsSeen) ? d.newsSeen : [])
    .filter((r) => Array.isArray(r) && typeof r[0] === 'string' && r[0].length <= 110 && r.slice(1, 4).every(Number.isFinite))
    .slice(0, 240).map(([sig, n, day, pending]) => [sig, {
      n: Math.max(0, Math.min(10000, n)), day: Math.max(0, day), pending: Math.max(0, Math.min(18, pending)),
    }]));
  if (!Array.isArray(d.newsSeen)) restoreJournalPacing(world);
  Object.assign(ECO, d.eco || {});
}
