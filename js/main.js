'use strict';

const canvas = document.getElementById('pond');
const ctx = canvas.getContext('2d');

const OPTS_KEY = 'procedural-pond.opts';
const DEFAULT_OPTS = {
  v: 4, world: 'auto', habitat: 'mixed', floor: 'sand', water: 'teal', light: 'cycle', dayLength: 180,
  current: 25, speed: 1, caustics: true, shadows: true, outlines: true, life: true, weather: true, sound: false,
  music: false, musicLevel: 40, hard: false, // (hard: new ponds start in hard mode)
};
// The pond is a fixed-size world, larger than the screen at the default zoom.
// "Fit screen" makes it the window at 2x pixels, so zoom 2 fills the screen exactly.
const WORLD_SIZES = {
  auto: { label: 'Fit screen (2×)' },
  small: { label: 'Small', size: [720, 405] },
  medium: { label: 'Medium', size: [960, 540] },
  large: { label: 'Large', size: [1280, 720] },
};
const HABITAT_DEFAULTS = { fresh: { water: 'pond', floor: 'sand' }, mixed: { water: 'teal', floor: 'sand' }, salt: { water: 'reef', floor: 'coral' } };
// Night tint runs from a dark new-moon blue to a silvery full-moon blue.
const NIGHT_DARK = [0.2, 0.27, 0.5], NIGHT_MOON = [0.4, 0.48, 0.74];
const LIGHTS = {
  cycle: { label: 'Day/night cycle' },
  day: { label: 'Always day', tint: [1, 1, 1] },
  dusk: { label: 'Always dusk', tint: [1.0, 0.72, 0.6] },
  night: { label: 'Always night', tint: null },
};
// Tint keyframes over one day; 0 = midnight, 0.5 = noon. null = tonight's moonlit night.
const CYCLE = [
  [0, null], [0.2, null], [0.26, [0.62, 0.5, 0.72]], [0.3, [0.95, 0.72, 0.7]], [0.36, [1, 0.95, 0.9]],
  [0.42, [1, 1, 1]], [0.62, [1, 1, 1]], [0.69, [1, 0.78, 0.58]], [0.74, [0.9, 0.55, 0.55]],
  [0.78, [0.55, 0.42, 0.66]], [0.83, null], [1, null],
];

function loadOpts() {
  try {
    const stored = JSON.parse(localStorage.getItem(OPTS_KEY) || '{}');
    if (!stored.v || stored.v < 2) delete stored.light; // older saves predate the cycle
    if (!stored.v || stored.v < 3) delete stored.pixel; // pixel size became zoom
    if (!stored.v || stored.v < 4) delete stored.world; // world size now follows the screen by default
    if (FLOOR_ALIASES[stored.floor]) stored.floor = FLOOR_ALIASES[stored.floor];
    return { ...DEFAULT_OPTS, ...stored, v: 4 };
  } catch { return { ...DEFAULT_OPTS }; }
}
function saveOpts() {
  try { localStorage.setItem(OPTS_KEY, JSON.stringify(world.opts)); } catch { /* storage unavailable */ }
}

const world = {
  W: 0, H: 0, t: 0, days: 0.4, clock: 0.4, darkness: 0, light: null, // start mid-morning of day 1
  moon0: 0, tide0: 0, moon: null, tide: { level: 0.5, range: 0, rising: true, flow: 0, surf: 0, wave: 0 },
  shore: null, shoreSide: 3, shoreN: [0, 1], bgDry: null, spawning: 0, spawnNight: -1, records: null, journalSeq: 0,
  raster: null, bg: null, bgLight: null, waterColor: 0, motes: null, wob: null, glints: [],
  caustic: makeCausticTile(), clouds: makeCloudTile(),
  creatures: [], plants: [], pads: [], food: [], rocks: [], pebbles: [],
  effects: [], eggs: [], swarms: [], targets: {}, journal: [], journalDirty: false, seed: '', maxPop: 200, structures: [], hatchery: null, remains: [], fossils: [],
  weather: { rain: 0, target: 0, next: rand(60, 140), gust: 0 },
  current: { s: 0, angle: 0, base: rand(-PI, PI), x: 0, y: 0 },
  pointer: { x: -999, y: -999, inside: false },
  grab: null, bones: false, paused: false, tool: 'pointer',
  opts: loadOpts(),

  nearestFood(x, y, range, filter) {
    let best = null, bd = range * range;
    for (const f of this.food) {
      if (f.eaten || (filter && !filter(f))) continue;
      const d = (f.x - x) ** 2 + (f.y - y) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  },
};

// A shared link carries the pond seed and its habitat, floor and water.
const params = new URLSearchParams(location.search);
for (const [k, table] of [['floor', FLOORS], ['water', WATERS], ['light', LIGHTS], ['habitat', HABITATS], ['world', WORLD_SIZES]]) {
  const v = FLOOR_ALIASES[params.get(k)] || params.get(k);
  if (table[v]) world.opts[k] = v;
}
const urlSeed = (params.get('pond') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);

// Screen-sized worlds: half the window in each direction (2x pixels), within sane
// bounds. A shared link carries the exact size so the recipient gets the same pond.
const screenWorld = () => [clamp(Math.round(innerWidth / 2), 360, 1400), clamp(Math.round(innerHeight / 2), 300, 900)];
world.autoSize = (() => {
  const m = /^(\d{3,4})x(\d{3,4})$/.exec(params.get('size') || '');
  if (!m) return screenWorld();
  world.opts.world = 'auto';
  return [clamp(+m[1], 360, 1400), clamp(+m[2], 300, 900)];
})();
// The pond's size: the chosen (or screen) size, plus the deep bands erosion has opened.
function worldDims() {
  const [W0, H0] = (WORLD_SIZES[world.opts.world] || WORLD_SIZES.auto).size || world.autoSize, ex = world.expandPx || 0;
  return deepAxisX(world.shoreSide) ? [W0 + ex, H0] : [W0, H0 + ex];
}


function lighting() {
  const o = world.opts, m = world.moon || moonInfo(world.days, world.moon0);
  const night = NIGHT_DARK.map((v, j) => lerp(v, NIGHT_MOON[j], m.illum));
  let tint = o.light === 'night' ? night : (LIGHTS[o.light] || LIGHTS.cycle).tint;
  if (!tint) {
    const c = world.clock;
    let i = 0;
    while (i < CYCLE.length - 2 && CYCLE[i + 1][0] <= c) i++;
    const [t0, a0] = CYCLE[i], [t1, b0] = CYCLE[i + 1], k = clamp((c - t0) / (t1 - t0), 0, 1);
    const a = a0 || night, b = b0 || night;
    tint = a.map((v, j) => lerp(v, b[j], k));
  }
  const rain = world.weather.rain;
  if (rain > 0.01) tint = tint.map((v, j) => v * (1 - rain * [0.24, 0.2, 0.1][j])); // overcast
  if (typeof heavensLight === 'function') tint = heavensLight(world, tint); // eclipses, the blood moon, blood rain
  if (typeof castTint === 'function') tint = castTint(world, tint); // a cursed pond's sickly light, an alien one's violet, a dead one's grey
  const lum = (tint[0] + tint[1] + tint[2]) / 3;
  return { tint: lum > 0.995 ? null : tint, darkness: clamp((0.92 - lum) / 0.48, 0, 1), caustics: lum > 0.8 && rain < 0.3 };
}

let image, out;

// (Re)create the world buffers. The world only changes size when the World
// option changes; window resizes just move the view.
// Heavy work (the dawn's reshaping and redrawing on a big pond) split into pieces and run a
// slice at a time between frames, so nothing stalls; a new pond (layout) drops what's left.
const JOBS = [];
let jobGen = 0;
function queueJob(fn) { const g = jobGen; JOBS.push(() => { if (g === jobGen) fn(); }); }
function runJobs() { const t0 = performance.now(); while (JOBS.length && performance.now() - t0 < 12) JOBS.shift()(); }
// A part of the floor redrawn in bands of rows (about 25 ms each on the biggest ponds).
function queueBake(w, rect) {
  const [x0, y0, x1, y1] = rect, rows = Math.max(16, Math.floor(110000 / Math.max(1, x1 - x0 + 1)));
  for (let y = y0; y <= y1; y += rows) { const r = [x0, y, x1, Math.min(y1, y + rows - 1)]; queueJob(() => bakeBackground(w, r)); }
}
function queueStains(w) {
  const rows = Math.max(32, Math.floor(500000 / Math.max(1, w.W)));
  for (let y = 0; y < w.H; y += rows) { const r = [0, y, w.W - 1, Math.min(w.H - 1, y + rows - 1)]; queueJob(() => applyStains(w, r)); }
}

function layout(regen, deferBake = false) {
  jobGen++; JOBS.length = 0; // (whatever was queued was for the pond as it was)
  const [W, H] = worldDims();
  if (W !== world.W || H !== world.H) {
    world.W = W; world.H = H;
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    world.raster = new Raster(W, H);
    world.wob = { x: new Int8Array(H), y: new Int8Array(W) };
    image = ctx.createImageData(W, H);
    out = new Uint32Array(image.data.buffer);
    regen = true;
  }
  world.maxPopBase = Math.min(460, Math.round(W * H / 2400)); // (a vast pond still has a limit)
  world.maxPop = world.maxPopBase + (world.maxPopBonus || 0); // what's built in the deep lets it hold more
  // The minimap keeps the pond's shape.
  mini.height = clamp(Math.round(mini.width * (view.r % 2 ? W / H : H / W)), 54, 200);
  mini.style.aspectRatio = `${mini.width} / ${mini.height}`; // (the page sizes it: smaller on a phone)
  if (regen) buildPond();
  if (deferBake) {
    // (The floor's buffers, blank: the caller paints what's on screen and queues the rest.)
    world.bgBase = new Uint32Array(W * H); world.bg = new Uint32Array(W * H); world.bgLight = world.bgDry = null;
  } else {
    bakeBackground(world);
    paintMinimapBackground();
  }
  resetView();
}
// What's on screen first (with a margin), then the rest of the floor a band at a time, then the map.
function bakeVisibleFirst() {
  const [x0, y0, x1, y1] = visibleRect(), m = 96, { W, H } = world;
  const v = [Math.max(0, Math.floor(x0 - m)), Math.max(0, Math.floor(y0 - m)), Math.min(W - 1, Math.ceil(x1 + m)), Math.min(H - 1, Math.ceil(y1 + m))];
  bakeBackground(world, v);
  const rest = [];
  if (v[1] > 0) rest.push([0, 0, W - 1, v[1] - 1]);
  if (v[3] < H - 1) rest.push([0, v[3] + 1, W - 1, H - 1]);
  if (v[0] > 0) rest.push([0, v[1], v[0] - 1, v[3]]);
  if (v[2] < W - 1) rest.push([v[2] + 1, v[1], W - 1, v[3]]);
  for (const r of rest) queueBake(world, r);
  queueJob(() => paintMinimapBackground());
}

// Somewhere open for new arrivals: in the water, clear of rocks, and the least crowded of a dozen tries.
function openSpot() {
  const { W, H } = world;
  let best = null, bn = Infinity;
  for (let i = 0, tries = 0; i < 40 && tries < 12; i++) {
    const x = rand(W * 0.08, W * 0.92), y = rand(H * 0.08, H * 0.92);
    if (world.rocks.some((r) => Math.hypot(r.x - x, r.y - y) < Math.max(r.a, r.b) + 8) || (world.shore && isDry(world, x, y))) continue;
    tries++;
    let n = 0;
    forNear(world, x, y, 40, () => { n++; });
    if (n < bn) { bn = n; best = [x, y]; }
    if (!n) break;
  }
  return best || [W / 2, H / 2];
}
// A group that arrived on one spot fans out a little (a school keeps together, but not in a heap).
function spreadGroup(group) {
  if (group.length < 3) return;
  const R = 4 + group.length * 1.5;
  group.forEach((c, i) => {
    if (i === 0) return;
    const a = i / group.length * TAU + rand(-0.3, 0.3), d = rand(0.5, 1) * R;
    const x = clamp(c.x + Math.cos(a) * d, 4, world.W - 4), y = clamp(c.y + Math.sin(a) * d, 4, world.H - 4);
    c.x = x; c.y = y;
    if (c.place) c.place(x, y); else if (c.body) c.body.place(x, y, c.heading);
    if (c.footRest) for (const L of c.legs) [L.fx, L.fy] = c.footRest(L);
  });
}

function spawn(kind, x, y, how = 'founder') {
  if (world.creatures.length >= world.maxPop + 60) return false;
  if (x === undefined) [x, y] = openSpot();
  const group = SPECIES[kind].spawn(world, x, y);
  spreadGroup(group);
  for (const c of group) { initLife(c, { alpha: 0 }); noteBorn(world, c, how); }
  world.creatures.push(...group);
  world.targets[kind] = (world.targets[kind] || 0) + group.length;
  updateCounts();
  return true;
}

// Buying spawn with essence (the dock's spawn card). Each animal in it settles in
// with its species' chance (lower in harder habitats, higher when hardy); those
// that don't fade away and half their share comes back.
function buyAnimal(kind, enh = [], ancient = null, grade = 0) {
  const price = Math.round(spawnPrice(kind, enh) * GRADE_PRICE[grade]); // a guaranteed grade costs more
  if (hardMode(world)) { showTicker('Hard mode: animals can’t be bought. Build and plant what they like, and they find their way in'); return false; }
  if (world.creatures.length >= world.maxPop + 60) { showTicker('The pond is full: no room for more'); return false; }
  if (!spendEssence(world, price, 'life')) { notEnough(price, 'essence'); return false; }
  const [x, y] = openSpot();
  const group = SPECIES[kind].spawn(world, x, y);
  spreadGroup(group);
  const p = settleChance(world, kind, enh.includes('hardy') ? ENHANCE.hardy.settle : 0);
  let failed = 0;
  const genes = world.game.fossilGenes || [], ai = ancient ? genes.indexOf(ancient) : -1;
  group.forEach((c, i) => {
    // The first of the spawn carries the fossil's gene, and shows it.
    if (i === 0 && ai >= 0) { initLife(c, { alpha: 0, genome: applyAncientGene(genomeFor(c.seed), ancient) }); genes.splice(ai, 1); } else initLife(c, { alpha: 0 });
    meetGrade(c, grade);
    applyEnhancements(c, enh);
    spawnFx(c);
    noteBorn(world, c, 'bought');
    if (Math.random() >= p * (c.life && c.life.genome.sickly ? CURSES.sickly.settle : 1) && !(i === 0 && ai >= 0)) { c.unsettled = 3; failed++; } // a fossil's gift always takes
  });
  world.creatures.push(...group);
  const ok = group.length - failed, label = describe(group[0]).label;
  world.targets[kind] = (world.targets[kind] || 0) + ok;
  const back = failed ? gainEssence(world, price * failed / group.length * 0.5, 'unsettled spawn') : 0;
  logEvent(world, !failed ? `${capFirst(aOrN(ok, label))} settled in` : ok ? `${capFirst(aOrN(ok, label))} settled in; ${failed} didn't take (+${back} essence back)`
    : `The ${plural(label, group.length)} didn't take (+${back} essence back)`, ok ? group.find((c) => !c.unsettled) : null, { cat: 'come', pri: 1 });
  updateCounts();
  return true;
}

// Recycle an animal (the Net, or the creature card): it leaves, and its essence comes back.
function recycle(c, quiet = false) {
  if (!alive(c)) return 0;
  if (typeof isSafe === 'function' && isSafe(c)) { if (!quiet) showTicker(`${c.life.name} is kept safe: unmark it on its card to recycle it`); return 0; }
  const back = recycleValue(c), tier = c.life ? tierOf(c.life.traits) : 0;
  world.creatures.splice(world.creatures.indexOf(c), 1);
  noteGone(world, c, 'recycled');
  if (world.targets[c.species]) world.targets[c.species]--;
  addRipple(world, c.x, c.y, 0.8, quiet);
  if (back) gainEssence(world, back, 'recycling', c, { quiet });
  if (c.life && !quiet) {
    logEvent(world, `Recycled ${who(c)}: +${back} essence${tier >= 2 ? ` (${TIERS[tier]})` : ''}`, null, {
      cat: 'pond', pri: tier >= 2 ? 2 : 0, key: 'recycle', data: back,
      merge: (e) => `Recycled ${e.n} animals: +${e.data.reduce((a, b) => a + b, 0)} essence`,
    });
  }
  if (cam.follow === c) stopFollow();
  updateCounts();
  return back;
}

// Recycle every animal of a species (asking first, and naming the rare ones).
function recycleAll(kind) {
  const all = world.creatures.filter((c) => c.life && !c.leaving && !c.unsettled && (c.species === kind || (kind === 'frog' && c.species === 'tadpole')));
  const list = all.filter((c) => !(typeof isSafe === 'function' && isSafe(c))), kept = all.length - list.length;
  if (!list.length) { if (kept) showTicker(`All ${kept} are kept safe`); return 0; }
  const worth = list.reduce((a, c) => a + recycleValue(c), 0), label = SPECIES[kind] ? SPECIES[kind].label : kind;
  const rares = list.filter((c) => tierOf(c.life.traits) >= 2).sort((a, b) => tierOf(b.life.traits) - tierOf(a.life.traits));
  const warn = rares.length ? ` That includes ${rares.length} rare: ${rares.slice(0, 4).map((c) => `${c.life.name} (${TIERS[tierOf(c.life.traits)]} ${c.life.traits.join(' ')})`).join(', ')}${rares.length > 4 ? '…' : ''}.` : '';
  if (!confirm(`Recycle all ${list.length} ${label.toLowerCase()} for ${worth} essence?${warn}${kept ? ` (${kept} kept safe will stay.)` : ''}`)) return 0;
  let got = 0;
  for (const c of list) got += recycle(c, true);
  world.targets[kind] = kept;
  if (kind === 'frog') world.targets.tadpole = 0;
  logEvent(world, `Recycled all ${list.length} ${label.toLowerCase()}: +${got} essence`, null, { cat: 'pond', pri: 2 });
  floatAward(world.W / 2, world.H / 2, `+${got}◆`, 'essence');
  updateCounts();
  return got;
}

let poorAt = 0;
function notEnough(price, cur = 'pearls') {
  if (performance.now() - poorAt < 2500) return;
  poorAt = performance.now();
  const have = cur === 'essence' ? world.game.essence : world.game.pearls;
  const how = cur === 'essence' ? 'Essence comes back when you recycle animals with the Net, when animals live out their lives, and each dawn.'
    : 'Pearls come from births, rare animals and each dawn.';
  showTicker(`Not enough ${cur}: that costs ${price} and you have ${have}. ${how}`);
  flashPearls();
}

// Scenery and starting animals come from the seed (and habitat), so a shared
// link reproduces the same pond. Everything after that is free-running.
function buildPond() {
  release();
  stopFollow();
  Object.assign(world, {
    creatures: [], food: [], eggs: [], effects: [], swarms: [], targets: {}, journal: [], glints: [], structures: [], hatchery: null, remains: [], fossils: [],
    litter: [], blight: null, riverW: 0, islandKey: null, scourKey: null, deepPlaced: 0, maxPopBonus: 0, pollution: 0,
    // (A new pond starts clean of the last one's oil, sky, blood, fights, story and weather; a saved one restores its own.)
    slicks: [], tar: null, heavens: null, bloodSpots: [], natureDay: null, story: null, darkAvg: null, meta: null, xeno: [], parasites: [], xenoShards: [],
    land: null, forms: [], boneBeds: [], isleJoins: {}, landSeen: {}, formSeen: {}, landArea: null, detritus: [], acts: [],
    weather: { rain: 0, target: 0, next: 30, gust: 0 },
    days: 0.4, clock: 0.4, spawning: 0, spawnNight: -1, records: null, moon: null,
    tide: { level: 0.5, range: 0, rising: true, flow: 0, surf: 0, wave: 0 },
  });
  Object.assign(ECO, { births: 0, arrivals: 0, departures: 0, eaten: 0, rares: 0 });
  WILD_SPECIES.length = 0;
  const resume = world.resume;
  world.resume = null;
  world.seedBase = hashString(world.seed); // animal seeds follow from the pond's
  world.spawnCount = 0;
  if (resume) {
    restorePond(world, resume);
  } else {
    world.inst = newInst();
    world.game = newGame();
    if (world.opts.hard) world.game.hard = true; // (hard mode: see ecology.js)
    world.lineage = new Map();
    world.link = null;
    world.erosion = newErosion();
    world.expandPx = 0;
    world.succession = { want: {}, seen: [] };
    world.maturity = 0;
    withSeed(`${world.seed}/${world.opts.habitat}`, () => {
      generateScenery(world);
      barePond();
      populate();
      if (typeof ensureKnown === 'function') ensureKnown(world, true); // (a new pond knows only what it starts with)
      world.moon0 = Math.random();
      world.tide0 = Math.random();
    });
  }
  updateSky(world, 0);
  initZones(world);
  $('seed-name').textContent = world.seed;
  const m = moonInfo(world.days, world.moon0);
  if (resume && world.quietRestore) {
    // (an observed pond brought up to date: nothing to announce)
  } else if (resume && world.silentRestore) {
    if (world.quietExpand) logEvent(world, world.silentRestore, null, { cat: 'pond', pri: 0, key: 'reach', merge: (e) => `The pond has reached further out ${e.n} times lately` });
    else logEvent(world, `✦ The pond has deepened: ${world.silentRestore}`, null, { cat: 'rare', pri: 3 });
    world.silentRestore = null;
    world.quietExpand = false;
  } else if (resume) {
    const animals = world.creatures.length, rares = world.creatures.filter((c) => c.life && c.life.traits.length).length;
    const summary = `day ${Math.floor(world.days) + 1}, ${animals} animals${rares ? `, ${rares} rare` : ''}`;
    if (world.linkAdopt) {
      // Someone else's pond becomes your own copy, with its own score and link.
      const hard = hardMode(world);
      world.inst = newInst();
      world.game = newGame();
      if (hard) world.game.hard = true;
      world.link = null;
      logEvent(world, `You opened ${world.seed} from a link: ${summary}. This copy is yours, with its own score`, null, { cat: 'pond' });
    } else {
      logEvent(world, `Welcome back to ${world.seed}: ${summary}`, null, { cat: 'pond' });
    }
  } else {
    const kind = { fresh: 'freshwater pond', salt: 'saltwater pond', mixed: 'pond' }[world.opts.habitat];
    logEvent(world, `You found a ${kind} called ${world.seed}. Tonight: ${m.name.toLowerCase()}.`, null, { cat: 'pond' });
  }
  refreshSpeciesButtons();
}

// A new pond starts nearly bare: most of the plants its seed would grow are
// taken out (recorded as removed, so links still match), and the rest are
// seedlings. They grow, seed and die back from there.
function barePond() {
  for (const [list, key] of [[world.plants, 'plants'], [world.pads, 'pads']]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (hash2(p.oi * 7.3, 1.7, 404) < (key === 'pads' ? 0.7 : 0.6)) { world.removed[key].push(p.oi); list.splice(i, 1); continue; }
      sprouting(p, rand(0.15, 0.4));
    }
  }
}

// Which animals a pond can support as its plant life matures (0 = from the start).
const SUCCESSION = {
  snail: 0, shrimp: 0, crab: 0, starfish: 0, jelly: 0, dragonfly: 0.1, tetra: 0.15, frog: 0.2, clown: 0.25, wild: 0.25,
  puffer: 0.35, axolotl: 0.35, duck: 0.4, eel: 0.45, ray: 0.45, koi: 0.5, turtle: 0.55, octopus: 0.6, snake: 0.6,
};
// As the pond matures, the animals it's ready for find their way in.
function succession() {
  const S = world.succession;
  if (!S) return;
  const m = world.maturity ?? 0; // not measured yet: wait for the plants' first tick
  let left = 0;
  for (const [kind, want] of Object.entries(S.want)) {
    const min = SUCCESSION[kind] ?? 0.3, have = world.targets[kind] || 0;
    if (have >= want) continue;
    left++;
    if (m < min || Math.random() > (hardMode(world) ? 0.025 : 0.05)) continue; // (hard mode: slower to come)
    // (A kind that's never been here waits its turn: arrivals.js.)
    const fresh = typeof knows === 'function' && !knows(world, kind);
    if (fresh && !canDiscover(world, kind)) continue;
    const group = arrive(world, kind);
    if (!group) continue;
    world.targets[kind] = have + group.length;
    if (fresh) discover(world, kind, group[0]);
    if (!S.seen.includes(kind)) {
      S.seen.push(kind);
      logEvent(world, `✦ The pond is alive enough now for ${plural(SINGULAR[kind] || kind, 2).toLowerCase()}: the first ones found their way in`, group[0], { cat: 'come', pri: 2 });
    }
  }
  if (!left) world.succession = null;
}

// Starting population scales with the world's area and fits the habitat.
const POPULATION = {
  koi: 1.5, tetra: 0.5, eel: 0.3, axolotl: 0.35, turtle: 0.3, crab: 0.5, ray: 0.35, frog: 0.6, snail: 0.35, jelly: 0.6,
  clown: 0.35, puffer: 0.3, octopus: 0.25, duck: 0.25, shrimp: 0.4, dragonfly: 0.35, wild: 0.5, starfish: 0.8, snake: 0.1,
};
function populate() {
  const m = world.W * world.H / (480 * 270), pure = world.opts.habitat !== 'mixed';
  for (const [kind, per] of Object.entries(POPULATION)) {
    if (!fitsHabitat(world, SPECIES_HABITAT[kind])) continue;
    const n = per * m * (pure ? 1.4 : 1) * (kind === 'wild' && world.opts.habitat === 'salt' ? 2 : 1);
    const count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    // Only pioneers at first (and fewer of them); the rest wait for the pond to mature. (In hard mode, fewer
    // still: a few pioneers, and fewer to come.)
    const hard = hardMode(world);
    if (world.succession && (SUCCESSION[kind] ?? 0.3) > 0) { const want = hard ? Math.round(count * 0.6) : count; if (want) world.succession.want[kind] = want; continue; }
    const n0 = hard ? Math.floor(count * 0.3 + Math.random() * 0.8) : Math.ceil(count * (world.succession ? 0.6 : 1));
    for (let i = 0; i < n0; i++) spawn(kind);
  }
}

// ---- simulation & render ------------------------------------------------------

function update(dt) {
  world.t += dt;
  const cur = world.current;
  cur.s = world.opts.current / 100 * (1 + Math.max(0, world.weather.gust) * 0.8 + world.weather.rain * 0.4) * (typeof deadCalm === 'function' && deadCalm(world) ? 0.05 : 1); // (a dead pond lies still)
  cur.angle = cur.base + Math.sin(world.t * 0.05) * 0.8;
  cur.x = Math.cos(cur.angle) * cur.s;
  cur.y = Math.sin(cur.angle) * cur.s;
  updateSky(world, dt);
  if (world.shore) {
    // Tidal streams: the water floods toward the beach, then ebbs away.
    const k = world.tide.flow * 0.35;
    cur.x += world.shoreN[0] * k; cur.y += world.shoreN[1] * k;
  }
  world.light = lighting();
  world.darkness = world.light.darkness;
  updateFireflies(dt);
  updateLife(world, dt);
  updateErosion(world, dt);
  updateDeep(world, dt);
  updateEldritch(world, dt);
  updateCoast(world, dt);
  updateGulls(world, dt);
  if (typeof updateShoreLife === 'function') updateShoreLife(world, dt);
  if (typeof updateIsles === 'function') updateIsles(world, dt);
  updateQuirks(world, dt);
  updateBalance(world, dt);
  updateVertical(world, dt);
  updateHeavens(world, dt);
  updateNature(world, dt);
  updatePollution(world, dt);
  updateAlien(world, dt);
  if (typeof updateCharacter === 'function') updateCharacter(world, dt);
  if (typeof updateImps === 'function') updateImps(world, dt);
  if (typeof updateLand === 'function') updateLand(world, dt);
  if (typeof updateCycle === 'function') updateCycle(world, dt);
  if (typeof updateInteract === 'function') updateInteract(world, dt);
  updateDark(world, dt);
  updateStory(world, dt);
  updateZones(world, dt);
  updateGame(world, dt);
  for (const c of world.creatures) {
    if (c.dread && (c.dread.t -= dt) <= 0) c.dread = null;
    if (!c.dying && !c.absorbing) c.update(dt, world);
  }
  world.remains = world.remains.filter((rm) => rm.update(dt, world));
  world.fossils = world.fossils.filter((f) => f.update(dt, world));
  if (world.creatures.some((c) => c.gone || c.caught)) {
    if (world.grab && (world.grab.gone || world.grab.caught)) release();
    world.creatures = world.creatures.filter((c) => !c.gone && !c.caught);
  }
  for (const p of world.plants) p.update(dt, world);
  for (const p of world.pads) p.update(dt, world);
  updateStructures(world, dt);
  updateBuildAnims(dt);
  updatePlantLife(world, dt);
  for (const f of world.food) f.update(dt, world);
  world.food = world.food.filter((f) => !f.eaten);
  world.motes.update(dt, world);
  updateGlints(dt);
}

// Fireflies drift in after dark and fly off at dawn. How many come, and whether
// blue ones join them, follows the score (fireflyPlan in game.js).
function updateFireflies(dt) {
  const plan = world.darkness > 0.55 ? fireflyPlan(world) : { yellow: 0, blue: 0 };
  for (const blue of [false, true]) {
    const want = blue ? plan.blue : plan.yellow;
    const flies = world.creatures.filter((c) => c.species === 'firefly' && !c.leaving && c.blue === blue);
    if (flies.length < want && Math.random() < dt * 3) {
      const f = new Firefly(world, rand(10, world.W - 10), rand(10, world.H - 10), blue);
      f.alpha = 0;
      world.creatures.push(f);
    } else if (flies.length > want && Math.random() < dt * 3) flies[0].leaving = true;
  }
  if (world.creatures.some((c) => c.gone)) world.creatures = world.creatures.filter((c) => !c.gone);
}

// Sun glints: brief sparkles on the surface in daylight.
const GLINT = hexToInt('#f6fcff'), GLINT_SOFT = hexToInt('#cfe6ee');
function updateGlints(dt) {
  world.glints = world.glints.filter((g) => (g.t += dt) < 0.9);
  const [x0, y0, x1, y1] = visibleRect();
  // Sunlight by day; a little moonlight on bright nights.
  const moon = world.moon ? world.moon.illum : 0;
  const k = ((1 - world.darkness) + world.darkness * moon * 0.35) * (1 - world.weather.rain) * (world.opts.caustics ? 1 : 0.4);
  let n = (x1 - x0) * (y1 - y0) * 0.000003 * k * dt * 60;
  while (Math.random() < n) {
    const g = { x: randi(x0 + 1, x1 - 1), y: randi(y0 + 1, y1 - 1), t: 0, star: Math.random() < 0.25 };
    if (!isDry(world, g.x, g.y)) world.glints.push(g);
    n--;
  }
}

function drawGlints() {
  const W = world.W;
  for (const g of world.glints) {
    const p = g.x + g.y * W;
    out[p] = g.t > 0.2 && g.t < 0.7 ? GLINT : GLINT_SOFT;
    if (g.star && g.t > 0.3 && g.t < 0.6) { out[p - 1] = out[p + 1] = out[p - W] = out[p + W] = GLINT_SOFT; }
  }
}

// The part of the world on screen, in world pixels.
function visibleRect() {
  const W = world.W, H = world.H, a = screenToWorld(0, 0), b = screenToWorld(innerWidth, innerHeight);
  return [
    clamp(Math.floor(Math.min(a[0], b[0])), 0, W - 1), clamp(Math.floor(Math.min(a[1], b[1])), 0, H - 1),
    clamp(Math.ceil(Math.max(a[0], b[0])), 0, W - 1), clamp(Math.ceil(Math.max(a[1], b[1])), 0, H - 1),
  ];
}

// If frames run slow (a huge pond, a big window), the costliest surface touches step down (the
// sky's glints, the murk, the chop and spindrift; then the light pools and caustics), and come
// back when there's room again.
const QUALITY = { level: 0, ema: 12, at: 0 };
function render(full = false) {
  const r = world.raster, t = world.t, o = world.opts, t0 = performance.now(), q = QUALITY.level;
  const light = world.light || (world.light = lighting());
  const rect = full ? [0, 0, world.W - 1, world.H - 1] : visibleRect();
  // Rasterize a margin above/left of the view: shadows of things just off-screen still land on it.
  r.setClip(rect[0] - 30, rect[1] - 30, rect[2] + 3, rect[3] + 3);
  r.begin();
  // (Only what could show: things well off screen aren't drawn at all. Big ponds have thousands.)
  const [vx0, vy0, vx1, vy1] = rect, near = (x, y, m) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;
  for (const p of world.plants) if (near(p.x, p.y, 50)) drawGrown(r, p, t);
  for (const s of world.structures) { if (!near(s.x, s.y, 60 + (s.R || STRUCTURES[s.kind].size || 20) * 3)) continue; if (s.anim) drawBuildAnim(r, s, t); else if (DRAW[s.kind]) DRAW[s.kind](r, s, t, world); }
  drawRiver(r, world, t);
  if (typeof drawShoreLife === 'function') drawShoreLife(r, world, t, rect);
  for (const l of world.litter) l.draw(r, t, world);
  drawSlicks(r, world, t, rect);
  drawTar(r, world, t);
  drawXeno(r, world, t, rect);
  if (typeof drawDetritus === 'function') drawDetritus(r, world, rect);
  for (const rm of world.remains) rm.draw(r, t);
  for (const f of world.fossils) f.draw(r, t);
  for (const p of world.pads) if (near(p.x, p.y, 30)) drawGrown(r, p, t);
  for (const f of world.food) f.draw(r, t, world);
  let anyThick = false;
  // A dense crowd (more than about 140 animals on screen) is drawn coarser: half the spine
  // segments, no small fins, fewer tentacles. What you follow or point at stays whole.
  let onScreen = 0;
  for (const c of world.creatures) if (near(c.x, c.y, 20)) onScreen++;
  const crowd = onScreen > CROWD_LOD ? (onScreen > CROWD_LOD * 2 ? 2 : 1) : 0;
  for (const c of world.creatures) {
    if (!near(c.x, c.y, DEEP[c.species] && DEEP[c.species].mythic ? 220 : 110)) continue;
    r.lod = crowd && c !== cam.follow && c !== world.hover && c !== world.grab && !(DEEP[c.species] && DEEP[c.species].mythic) ? crowd : 0;
    const a = c.alpha ?? 1;
    r.alpha = a;
    FADE[c.id] = a < 1 ? 1 : 0;
    if (THICK[c.id]) anyThick = true;
    if (c.flare) r.setScale(c.x, c.y, 1 + 0.16 * c.flare); // (flaring up at a rival, or a warning)
    c.draw(r, t, world);
    if (c.flare) r.setScale();
    if (c.life && c.life.genome.eld) drawEldritch(r, c, t, world);
    if (c.life) drawQuirks(r, c, t);
  }
  r.alpha = 1;
  r.lod = 0;
  for (const e of world.eggs) e.draw(r, t);
  world.motes.draw(r, world);
  r.castShadows = false;
  for (const e of world.effects) e.draw(r, t);
  r.castShadows = true;
  r.alpha = 1;
  // Refraction: rows and columns of the floor shift by a pixel as the surface moves.
  const water = WATERS[o.water] || WATERS.teal, wob = world.wob;
  const amp = water.wobble * (1 + Math.max(0, world.weather.gust) * 0.5 + world.tide.surf * 0.3);
  for (let y = rect[1]; y <= rect[3]; y++) wob.x[y] = Math.round(Math.sin(y * 0.19 + t * 0.7) * amp * (0.55 + 0.45 * Math.sin(t * 0.2 + y * 0.013)));
  for (let x = rect[0]; x <= rect[2]; x++) wob.y[x] = Math.round(Math.sin(x * 0.15 + t * 0.6) * amp * (0.55 + 0.45 * Math.sin(t * 0.17 + x * 0.011)));
  // A bloom turns the water green (a red tide, red); wind and surf raise a swell, bigger over the deep.
  const bloom = world.blight && world.blight.k === 'bloom', hab = world.opts.habitat, glass = typeof isGlass === 'function' && isGlass(world);
  let fogColor = bloom ? mixColor(world.waterColor, BLOOM_TINT[hab] || BLOOM_TINT.mixed, 0.45) : world.waterColor;
  if (typeof bloodRain === 'function' && bloodRain(world)) fogColor = mixColor(fogColor, BLOOD_WATER, Math.min(0.5, world.weather.rain * 0.6));
  // (A glass day: the surface still, and the water clear far down into the deep.)
  const swell = glass ? 0.02 : clamp(0.3 + world.tide.surf * 0.35 + Math.max(0, world.weather.gust) * 0.45 + world.weather.rain * 0.15, 0, 1.2) * (hab === 'fresh' ? 0.7 : 1);
  r.compose(out, {
    bg: world.bg, bgLight: world.bgLight, lightTint: world.lightTint, caustic: world.caustic, t,
    outline: OUTLINE, emissive: EMISSIVE, fade: FADE, thick: THICK, anyThick, tint: light.tint,
    caustics: o.caustics && light.caustics && q < 2, causticT: water.caustic, shadows: o.shadows, outlines: o.outlines,
    fog: { color: fogColor, amount: (water.fog + (bloom ? 0.12 : 0)) * (glass ? 0.3 : 1) }, wob, deepK: glass ? 0.5 : 1,
    shore: world.shore, bgDry: world.bgDry, riverMask: world.riverMask || null, riverDeep: typeof riverDeepK === 'function' ? riverDeepK(world) : 0.5, riverColor: world.waterColor, tide: world.tide.level, surf: world.tide.surf, wave: world.tide.wave,
    depth: world.depth, deepColor: DEEP_COLOR[world.opts.habitat] || DEEP_COLOR.mixed,
    voidSkin: world.eldMarks && world.eldMarks.length || world.plants.some((p) => p.tr && p.tr.eld) ? VOID_SKIN : null,
    swell, swellDir: world.shore ? world.shoreN : [0.8, 0.6], clouds: q < 1 ? world.clouds : null, sky: typeof heavensSky === 'function' ? heavensSky(world, skyReflection(light)) : skyReflection(light), skyK: glass ? 1.4 : typeof heavenNow === 'function' && heavenNow(world, 'aurora') ? 1.6 : 1 - world.weather.rain * 0.7,
    lights: q < 2 ? buildLights(world, rect) : null, lightVis: light.darkness || 0, deepColor2: deepTint(world), trench: world.trench, trenchGlow: TRENCH_GLOW[branchOf(world)],
    chop: q < 1 && !glass ? clamp(0.18 + Math.max(0, world.weather.gust) * 0.9 + world.tide.surf * 0.35, 0, 1.2) : 0, spindrift: q < 1 ? clamp((swell - 0.75) * 2.5, 0, 1) : 0,
  }, rect);
  drawGlints();
  if (world.bones) drawBones();
  if (full || world.bones) ctx.putImageData(image, 0, 0);
  else ctx.putImageData(image, 0, 0, rect[0], rect[1], rect[2] - rect[0] + 1, rect[3] - rect[1] + 1);
  if (!full) {
    const now = performance.now(), Q = QUALITY;
    Q.ema += (now - t0 - Q.ema) * 0.05;
    if (Q.ema > 38 && Q.level < 2 && now - Q.at > 2000) { Q.level++; Q.at = now; Q.ema = 30; }
    else if (Q.ema < 18 && Q.level > 0 && now - Q.at > 5000) { Q.level--; Q.at = now; }
  }
  updateSkyHud(light);
}

const CROWD_LOD = 140; // animals on screen before the crowd is drawn coarser
const BLOOD_WATER = hexToInt('#5a0808');

// The colour calm water reflects: a pale day sky, warm at dawn and dusk, deep blue at night.
const SKY_DAY = hexToInt('#d8eaf4'), SKY_DUSK = hexToInt('#f0b890'), SKY_NIGHT = hexToInt('#2a3452');
function skyReflection(light) {
  const d = light.darkness || 0, dusk = Math.max(0, 1 - Math.abs(d - 0.45) * 3);
  return mixColor(mixColor(SKY_DAY, SKY_NIGHT, d), SKY_DUSK, dusk * 0.6);
}

// A plant drawn at its size as it grows (and shrinks as it dies back).
function drawGrown(r, p, t) {
  const g = (p.growth ?? 1) * (1 + 0.15 * ((p.tr && p.tr.lush) || 0)); // lush plants grow bigger
  const scaled = Math.abs(g - 1) > 0.001;
  if (scaled) r.setScale(p.x, p.y, Math.max(0.1, g), p.make === 'lily' || p.make === 'duckweed' || (typeof FLORA_FLOAT !== 'undefined' && FLORA_FLOAT.has(p.make)) ? 1 : Math.max(0.1, g)); // floating plants stay at the surface
  p.draw(r, t, world);
  if (scaled) r.setScale();
  if (p.tr) drawPlantExtras(r, p, t, world);
}

// X-ray view of the underlying model: spine links, joint radii, and leg IK.
const BONE = hexToInt('#f4f4f4'), RING = hexToInt('#7a6a3a'), JOINT = hexToInt('#ef476f'), LEG = hexToInt('#06d6a0');

function plot(x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < world.W && y < world.H) out[x + y * world.W] = c;
}

function line(x0, y0, x1, y1, c) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) plot(lerp(x0, x1, i / n), lerp(y0, y1, i / n), c);
}

function ring(cx, cy, rad, c) {
  const n = Math.max(8, Math.ceil(rad * 7));
  for (let i = 0; i < n; i++) plot(cx + Math.cos(i / n * TAU) * rad, cy + Math.sin(i / n * TAU) * rad, c);
}

function drawBones() {
  for (let i = 0; i < out.length; i++) out[i] = shadeColor(shadeColor(out[i]));
  for (const c of world.creatures) {
    for (const b of c.chains ? c.chains() : [c.body]) {
      for (let i = 0; i < b.n; i++) if (b.w[i] >= 1.5) ring(b.x[i], b.y[i], b.w[i], RING);
      for (let i = 0; i < b.n - 1; i++) line(b.x[i], b.y[i], b.x[i + 1], b.y[i + 1], BONE);
      for (let i = 0; i < b.n; i++) plot(b.x[i], b.y[i], JOINT);
    }
    for (const L of c.legs || []) {
      line(L.sx, L.sy, L.ex, L.ey, LEG);
      line(L.ex, L.ey, L.dfx ?? L.fx, L.dfy ?? L.fy, LEG);
      plot(L.ex, L.ey, JOINT);
    }
  }
}

let last = performance.now(), mapTimer = 0, nbTimer = 2;
function frame(now) {
  // The first rAF timestamp can predate the load-time performance.now(); never step backwards.
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (!world.paused) update(dt * world.opts.speed * (hardMode(world) ? HARD_PACE : 1)); // (hard mode runs slower)
  runJobs();
  growTick(now);
  updateCamera(dt);
  updateGlide(dt);
  render();
  if (typeof hinterTick === 'function') hinterTick(world, dt);
  updateCard(dt);
  Sound.update(world, world.paused ? 0 : dt, visibleRect(), view.k);
  if (typeof Music !== 'undefined') Music.update(dt);
  hudTick(dt);
  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = 15; saveNow(); }
  syncTimer -= dt;
  if (syncTimer <= 0) { syncTimer = 90; syncPond(); }
  observeSync(dt);
  nbTimer -= dt;
  if (nbTimer <= 0) { nbTimer = 1; edgeHints(); if (Date.now() - NB.at > 300000) refreshNeighbours(); }
  boardTimer -= dt;
  if (boardTimer <= 0) { boardTimer = 300; refreshBoard(); }
  statusTimer -= dt;
  if (statusTimer <= 0) { statusTimer = 1; updateSaveStatus(); }
  mapTimer -= dt;
  if (mapTimer <= 0) { mapTimer = 0.12; drawMinimap(); }
  requestAnimationFrame(frame);
}

// ---- tools --------------------------------------------------------------------

// Food and plants cost pearls (game.js). Each plant helps the species that like it.
const plantTool = (kind, label, list = 'plants') => ({
  label, price: PLANT_PRICE[kind], likedBy: kind,
  place: (x, y) => { const p = sprouting(makePlant(kind, world, x, y), 0.3); p.born = world.days; world[list].push(p); }, // it grows from a seedling
});
const TOOLS = {
  pointer: { label: 'Look', hint: 'click an animal, plant or structure to see it · drag animals · scroll to zoom · drag the water to pan' },
  feed: { label: 'Pellets', food: 'pellet', price: 0, hint: 'click to feed (free) · drag animals · scroll to zoom · drag water to pan' },
  spirulina: { label: 'Spirulina', food: 'spirulina', price: FOOD_PRICE.spirulina, hint: 'spirulina: keeps animals well fed five times longer, so they age slower and stay' },
  brine: { label: 'Brine', food: 'brine', price: FOOD_PRICE.brine, hint: 'live brine shrimp: a big meal that brings animals straight into breeding condition' },
  net: { label: 'Net', hint: 'click an animal, plant or rock to remove it' },
  weed: plantTool('weed', 'Weed'),
  eelgrass: plantTool('eelgrass', 'Eelgrass'),
  anemone: plantTool('anemone', 'Anemone'),
  coral: plantTool('coral', 'Coral'),
  urchin: plantTool('urchin', 'Urchin'),
  marimo: plantTool('marimo', 'Marimo'),
  duckweed: plantTool('duckweed', 'Duckweed'),
  lily: plantTool('lily', 'Lily pad', 'pads'),
  krill: { label: 'Krill', food: 'krill', price: 6, habitat: 'salt', tier: 2, hint: 'krill: a rich meal that brings animals into breeding condition, deep ones too' },
  bloodworm: { label: 'Bloodworms', food: 'bloodworm', price: 6, habitat: 'fresh', tier: 2, hint: 'bloodworms: a rich meal that brings animals into breeding condition, deep ones too' },
  snow: { label: 'Marine snow', food: 'snow', price: 4, tier: 3, spread: 22, n: 9, hint: 'marine snow drifts down slowly over a wide patch: food that reaches the deep' },
  blackcoral: { ...plantTool('blackcoral', 'Black coral'), habitat: 'salt', tier: 3, deepMin: 0.3 },
  glowcap: { ...plantTool('glowcap', 'Glowcaps'), habitat: 'fresh', tier: 3, deepMin: 0.3 },
  chum: { label: 'Chum', food: 'chum', price: 25, tier: 5, n: 5, spread: 6, hint: 'chum: a bloody feast; hunters and the deep come to it' },
  tubeworms: { ...plantTool('tubeworms', 'Tube worms'), habitat: 'salt', tier: 5, deepMin: 0.5 },
  paleroots: { ...plantTool('paleroots', 'Pale roots'), habitat: 'fresh', tier: 5, deepMin: 0.5 },
  sealily: { ...plantTool('sealily', 'Sea lilies'), habitat: 'salt', tier: 6, deepMin: 0.6 },
  weepmoss: { ...plantTool('weepmoss', 'Weeping moss'), habitat: 'fresh', tier: 6, deepMin: 0.6 },
  starweed: { ...plantTool('starweed', 'Star-weed'), tier: 7, deepMin: 0.6 },
  offering: { label: 'Offering', food: 'offering', price: 120, tier: 7, n: 4, spread: 5, hint: 'offerings: the marked that eat them change faster, and the pond yields corruption' },
  ...floraTools(plantTool), // (reeds, lotus, kelp, sea fans and the rest: flora.js)
  rock: {
    label: 'Rock', price: PLANT_PRICE.rock, likedBy: 'rock',
    place: (x, y) => { const rk = shapeRock(world, makeRock(x, y, rand(5, 10), rockFor(world, pick(ROCK_MATS.slice(0, 3))))); rk.born = world.days; world.rocks.push(rk); bakeBackground(world); paintMinimapBackground(); },
  },
};
// Structures (the Build section): bought with pearls, some also with essence.
for (const [kind, def] of Object.entries(STRUCTURES)) {
  TOOLS[`build-${kind}`] = { label: def.label, build: kind, price: def.pearls, essence: def.essence, corruption: def.corruption, tier: def.tier, habitat: def.habitat, likedBy: kind, hint: `click to build: ${def.desc}` };
}

// Deepening: the world grows toward the deep side by a fraction of its original
// size. The pond is saved, shifted if it grows left or up, and rebuilt bigger;
// the view keeps looking at the same place.
function expandWorld(frac, why) {
  const axisX = deepAxisX(world.shoreSide), [W0, H0] = baseSize(world);
  expandWorldPx(Math.round((axisX ? W0 : H0) * frac), why);
}
// (In pixels: a new depth tier is news. The pond's steady creep outward doesn't come this way: see growInPlace.)
function expandWorldPx(px, why, quiet = false) {
  const axisX = deepAxisX(world.shoreSide);
  const add = Math.min(px, maxDeepPx(world) - (world.expandPx || 0)), [sx, sy] = deepShifts(world.shoreSide) ? (axisX ? [add, 0] : [0, add]) : [0, 0];
  if (add <= 0) return;
  const cx = (innerWidth / 2 - view.tx) / view.k + sx, cy = (innerHeight / 2 - view.ty) / view.k + sy;
  const d = serializePond(world);
  shiftSave(d, sx, sy);
  // (The beach's own animals aren't in saves: they carry on as they were, moved with the pond.)
  const beach = world.creatures.filter((c) => c.ambient && !c.gone && !c.caught);
  if (typeof shiftShoreLife === 'function') shiftShoreLife(world, sx, sy, beach);
  world.expandPx = (world.expandPx || 0) + add;
  d.expandPx = world.expandPx;
  d.size = axisX ? [world.W + add, world.H] : [world.W, world.H + add];
  world.resume = d;
  world.silentRestore = why;
  world.quietExpand = quiet;
  // Whatever you were following or looking at carries on (the pond is rebuilt, so they're found again).
  const was = cam.follow && cam.follow.seed, card = creatureUi.c && creatureUi.c.seed, obj = objUi.o && objUi.o.seed, k0 = view.k;
  layout(false, true);
  world.creatures.push(...beach);
  view.k = Math.max(minK(), k0); // (the rebuild resets the view: keep the zoom you had)
  centerOn(cx, cy);
  bakeVisibleFirst();
  const again = (seed) => seed != null && world.creatures.find((c) => c.seed === seed);
  if (cam.follow) stopFollow();
  if (again(was)) follow(again(was));
  if (card != null) { if (again(card)) showCreature(again(card), creatureUi.auto); else hideCreature(); }
  if (obj != null) { const o = [...world.structures, ...world.plants, ...world.pads].find((q) => q.seed === obj); if (o) showObject(o); else hideObject(); }
  saveNow();
}

// The pond's creep outward, done in place: its buffers grow by a pixel, and everything in it carries on just as it
// was (nothing is rebuilt: the animals mid-stride, the food you dropped, the ripples, the skeletons, what's open on
// a card), moved over by the growth when the pond grows left or up. Only what hangs on the pond's size is redone:
// the beach and all that shapes it (sand, the river, islands, pools, the depths), the floor's new edge, and the
// ecology and land grids (a cell over at a time, as the growth adds up).
function growInPlace(add) {
  const axisX = deepAxisX(world.shoreSide);
  add = Math.min(add, maxDeepPx(world) - (world.expandPx || 0));
  if (add <= 0 || !world.bgBase || !world.bg || world.bgBase.length !== world.W * world.H) return false;
  const [sx, sy] = deepShifts(world.shoreSide) ? (axisX ? [add, 0] : [0, add]) : [0, 0];
  const cx = (innerWidth / 2 - view.tx) / view.k + sx, cy = (innerHeight / 2 - view.ty) / view.k + sy;
  const old = { W: world.W, H: world.H, bg: world.bg, base: world.bgBase, z: world.raster.zBase, sand: world.sand };
  if (sx || sy) shiftWorld(world, sx, sy);
  world.expandPx = (world.expandPx || 0) + add;
  const [W, H] = worldDims();
  world.W = W; world.H = H;
  canvas.width = W; canvas.height = H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  world.raster = new Raster(W, H);
  world.wob = { x: new Int8Array(H), y: new Int8Array(W) };
  image = ctx.createImageData(W, H);
  out = new Uint32Array(image.data.buffer);
  world.maxPopBase = Math.min(460, Math.round(W * H / 2400));
  world.maxPop = world.maxPopBase + (world.maxPopBonus || 0);
  mini.height = clamp(Math.round(mini.width * (view.r % 2 ? W / H : H / W)), 54, 200);
  mini.style.aspectRatio = `${mini.width} / ${mini.height}`;
  if (old.sand && old.sand.length === old.W * old.H) { world.sand = new Uint8Array(W * H); copyGrid(old.sand, old.W, old.H, world.sand, W, H, sx, sy); } // (the sand the water has moved)
  world.bgBase = new Uint32Array(W * H); world.bg = new Uint32Array(W * H); world.bgLight = world.bgDry = null;
  world.islandKey = world.scourKey = null;
  makeShore(world); // (the beach, and all that shapes it, at the new size: the depths with it)
  regridZones(sx, sy);
  regridLand(sx, sy);
  carryFloor(old, sx, sy);
  if (view.glide) { view.glide.tx -= view.k * sx; view.glide.ty -= view.k * sy; }
  centerOn(cx, cy);
  return true;
}
// A grid the size of the pond, copied into the bigger one (moved over by the growth).
function copyGrid(src, sw, sh, dst, dw, dh, sx, sy) {
  const rows = Math.min(sh, dh - sy), cols = Math.min(sw, dw - sx);
  for (let y = 0; y < rows; y++) dst.set(src.subarray(y * sw, y * sw + cols), sx + (y + sy) * dw);
}
// Everything in the pond that has a place in it, moved over (the pond grew left or up). Things that move on their
// own (feet, arms, targets) only need to be close: they catch up; things that stand still are moved exactly.
function shiftWorld(w, dx, dy) {
  const mv = (o) => { if (!o) return; if (typeof o.x === 'number') { o.x += dx; o.y += dy; } if (typeof o.tx === 'number' && typeof o.ty === 'number') { o.tx += dx; o.ty += dy; } };
  const pt = (v) => (Array.isArray(v) && typeof v[0] === 'number' ? [v[0] + dx, v[1] + dy] : v);
  const schools = new Set();
  for (const c of w.creatures) {
    mv(c);
    if (c.body && c.body.x) for (let i = 0; i < c.body.n; i++) { c.body.x[i] += dx; c.body.y[i] += dy; }
    for (const L of c.legs || []) for (const [a, b] of [['fx', 'fy'], ['sx', 'sy'], ['ex', 'ey'], ['dfx', 'dfy']]) if (typeof L[a] === 'number') { L[a] += dx; L[b] += dy; }
    for (const k of ['home', 'nest', 'lastTrack', 'roost', 'door']) if (Array.isArray(c[k])) c[k] = pt(c[k]);
    if (c.school) schools.add(c.school);
  }
  for (const s of schools) mv(s);
  if (typeof shiftShoreLife === 'function') shiftShoreLife(w, dx, dy, []); // (the beach's tracks, nests-to-be and burrows)
  for (const list of [w.plants, w.pads, w.rocks, w.pebbles, w.structures, w.food, w.effects, w.eggs, w.fossils, w.remains, w.xeno, w.xenoShards, w.parasites,
    w.litter, w.slicks, w.forms, w.boneBeds, w.detritus, w.swarms, w.bloodSpots, w.glints, w.acts, w.erosion && w.erosion.lagoons, w.game && w.game.nests]) for (const o of list || []) mv(o);
  for (const p of [...w.plants, ...w.pads]) if (p.segs) for (const s of p.segs) { s[0] += dx; s[1] += dy; s[4] += dx; s[5] += dy; } // (a staghorn's branches)
  for (const r of w.remains || []) for (const b of r.bones || []) { b[0] += dx; b[1] += dy; }
  for (const j of Object.values(w.isleJoins || {})) mv(j);
  mv(w.tar); mv(w.blight);
  if (w.motes) for (let i = 0; i < w.motes.x.length; i++) { w.motes.x[i] += dx; w.motes.y[i] += dy; }
}
// The ecology's grid (32 px cells) and the land's memory (16 px cells): bigger as the pond grows, and moved over a
// whole cell at a time as the growth to the left or up adds up to one.
function regridZones(sx, sy) {
  const z = world.zones;
  if (!z) return;
  const acc = world.zoneShift || (world.zoneShift = [0, 0]);
  acc[0] += sx; acc[1] += sy;
  const dcx = Math.floor(acc[0] / ZONE), dcy = Math.floor(acc[1] / ZONE), cols = Math.max(1, Math.ceil(world.W / ZONE)), rows = Math.max(1, Math.ceil(world.H / ZONE));
  if (cols === z.cols && rows === z.rows && !dcx && !dcy) return;
  acc[0] -= dcx * ZONE; acc[1] -= dcy * ZONE;
  const n = cols * rows, nz = { ...z, cols, rows, aggr: new Float32Array(n), heat: new Float32Array(n), salt: new Float32Array(n) };
  for (let j = 0; j < z.rows; j++) for (let i = 0; i < z.cols; i++) {
    const ni = i + dcx, nj = j + dcy;
    if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
    const a = i + j * z.cols, b = ni + nj * cols;
    nz.aggr[b] = z.aggr[a]; nz.heat[b] = z.heat[a]; nz.salt[b] = z.salt[a];
  }
  world.zones = nz;
}
function regridLand(sx, sy) {
  const L = world.land;
  if (!L || typeof LAND_KEYS === 'undefined') return;
  const acc = world.landShift || (world.landShift = [0, 0]);
  acc[0] += sx; acc[1] += sy;
  const dcx = Math.floor(acc[0] / LAND_CELL), dcy = Math.floor(acc[1] / LAND_CELL), cols = Math.max(1, Math.ceil(world.W / LAND_CELL)), rows = Math.max(1, Math.ceil(world.H / LAND_CELL));
  if (cols === L.cols && rows === L.rows && !dcx && !dcy) return;
  acc[0] -= dcx * LAND_CELL; acc[1] -= dcy * LAND_CELL;
  const N = { ...L, cols, rows, ch: {}, tint: null, dirty: true, paint: null }; // (as landGrid makes one, in full precision)
  for (const k of LAND_KEYS) {
    const A = new Float32Array(cols * rows), O = L.ch[k];
    for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) { const nx = x + dcx, ny = y + dcy; if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) A[nx + ny * cols] = O[x + y * L.cols]; }
    N.ch[k] = A;
  }
  world.land = N;
}
// The floor as it was, moved over by the growth (sx, sy), then the new edge drawn; every 24 px or so of creep, the
// whole floor again in the background (the deep's shelves stretch a little as it grows).
function carryFloor(old, sx, sy) {
  const { W, H } = world, rows = Math.min(old.H, H - sy), cols = Math.min(old.W, W - sx), z = world.raster.zBase;
  for (let y = 0; y < rows; y++) {
    const from = y * old.W, to = sx + (y + sy) * W;
    world.bgBase.set(old.base.subarray(from, from + cols), to);
    world.bg.set(old.bg.subarray(from, from + cols), to);
    z.set(old.z.subarray(from, from + cols), to);
  }
  const axisX = deepAxisX(world.shoreSide), e = 3; // (the new edge, and a little either side of the old one)
  const edge = deepShifts(world.shoreSide) ? (axisX ? [0, 0, sx + e, H - 1] : [0, 0, W - 1, sy + e]) : axisX ? [old.W - e, 0, W - 1, H - 1] : [0, old.H - e, W - 1, H - 1];
  bakeBackground(world, edge.map((v, i) => clamp(v, 0, i % 2 ? H - 1 : W - 1)));
  world.growBaked = (world.growBaked || 0) + 1;
  if (world.growBaked >= 24) { world.growBaked = 0; queueBake(world, [0, 0, W - 1, H - 1]); }
  queueJob(() => paintMinimapBackground());
}

// The pond's steady creep outward: a pixel at a time of what it's owed (game.growDue: the dawn's growth, a new
// depth's room), when nothing is being done with it, as often as it can without being felt (each step rebuilds
// the pond: about 20 ms on a young one, more on a big one, so the bigger the pond the longer between).
let growNext = 0;
function growTick(now) {
  const G = world.game;
  if (!G || !(G.growDue >= 1) || world.observe || world.grab || press || pinch || world.paused || document.hidden || now < growNext) return;
  if ((world.expandPx || 0) >= maxDeepPx(world) - 8) { G.growDue = 0; return; }
  const t0 = performance.now();
  G.growDue -= 1;
  if (!growInPlace(1)) { G.growDue += 1; growNext = now + 2500; return; }
  growNext = now + clamp((performance.now() - t0) * 120, 2500, 15000);
}

// ---- arrivals: each structure comes into the pond in its own way -----------------------------------
// An island rises out of a boil of bubbles; a ship sinks down from the surface and
// settles in a cloud of silt; the deep monuments rise slowly out of the dark; the
// rest push up out of the floor. Until it's done it's drawn live (scaled, lifted),
// then baked into the floor like the others.
const BUILD_ANIM = { island: 5, ship: 4.5, gate: 7, cradle: 9, spire: 5, rootcathedral: 5, brinepool: 3, ossuary: 3.5 };
function startBuildAnim(s) {
  s.anim = { t: 0, dur: BUILD_ANIM[s.kind] || 2.5 };
  if (STRUCTURES[s.kind].tier >= 5) Sound.omen(s.x, s.y);
}

function updateBuildAnims(dt) {
  for (const s of world.structures) {
    const A = s.anim;
    if (!A) continue;
    A.t += dt;
    const u = Math.min(1, A.t / A.dur), R = STRUCTURES[s.kind].size;
    if (s.kind === 'island') {
      if (Math.random() < dt * 40) addBubbles(world, s.x + rand(-1, 1) * s.R * (0.3 + u), s.y + rand(-1, 1) * s.R * (0.3 + u), 1, 2);
      if (Math.random() < dt * 5) addRipple(world, s.x + rand(-12, 12), s.y + rand(-12, 12), 1.2 + u, true);
    } else if (s.kind === 'ship') {
      if (Math.random() < dt * 14) addBubbles(world, s.x + rand(-R * 0.7, R * 0.7), s.y + rand(-R * 0.4, R * 0.4), 44 * (1 - u) + 2, 1);
      if (A.t < 0.2 && !A.splashed) { A.splashed = true; addRipple(world, s.x, s.y, 3); }
    } else if (!STRUCTURES[s.kind].dry && Math.random() < dt * 10) addBubbles(world, s.x + rand(-R, R) * 0.6, s.y + rand(-R, R) * 0.6, 1, 1);
    if (A.t >= A.dur) {
      delete s.anim;
      // It settles: a ring of silt and bubbles, and it's part of the floor now. (Up on the dry beach, just settles.)
      if (!STRUCTURES[s.kind].dry) {
        for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; addBubbles(world, s.x + Math.cos(a) * R, s.y + Math.sin(a) * R, 1, 1); }
        addRipple(world, s.x, s.y, s.kind === 'ship' || s.kind === 'island' ? 3 : 1.5);
      }
      structuresChanged(!!STRUCTURES[s.kind].shore);
    }
  }
}

function drawBuildAnim(r, s, t) {
  const u = Math.min(1, s.anim.t / s.anim.dur), e = u * u * (3 - 2 * u);
  let k = 1, kz = e, zoff = 0;
  if (s.kind === 'ship') { kz = 1; zoff = (1 - e) * 42; } // sinking down from the surface
  else if (s.kind === 'island') { k = 0.35 + 0.65 * e; } // rising, and spreading as it comes up
  else if (STRUCTURES[s.kind].tier >= 5) kz = e * e; // the deep ones rise slow, then all at once
  r.setScale(s.x, s.y, k, Math.max(0.02, kz), zoff);
  if (s.kind === 'island') r.ellipsoid(s.x, s.y, s.R * 1.15, s.R * 1.15, 0, 0, 4, SM.sand, animNext(s)(SM.sand));
  const next = animNext(s);
  withSeed(`bake/${s.seed}`, () => BAKE[s.kind](r, s, next));
  r.setScale();
}
// Outline ids for a structure drawn live, the same ones every frame.
function animNext(s) {
  const ids = s.animIds || (s.animIds = []);
  let i = 0;
  return (m) => { if (!ids[i]) ids[i] = newId(outlineOf(m)); return ids[i++]; };
}

// A new animal arrives in a ring of bubbles and a flash; something from the deep
// rises trailing them; the mythic make the whole pond scatter.
function spawnFx(c) {
  const b = c.body, x = c.x, y = c.y;
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; addBubbles(world, x + Math.cos(a) * 6, y + Math.sin(a) * 6, 1, 1); }
  addRipple(world, x, y, 1.5, true);
  if (world.effects.length < 200) for (let k = 0; k < 4; k++) world.effects.push(new Sparkle(x + rand(-4, 4), y + rand(-4, 4), (c.z || 4) + 4));
  if (DEEP[c.species]) {
    if (b) for (let k = 0; k < 8; k++) addBubbles(world, b.x[0] + rand(-3, 3), b.y[0] + rand(-3, 3), 1, 2);
    if (DEEP[c.species].mythic) { scatterFrom(world, c, 4); Sound.omen(x, y); }
  }
}

// Rebuild what depends on the floor after structures change (islands reshape the beach).
function structuresChanged(reshape) {
  if (reshape && world.shore) makeShore(world);
  bakeBackground(world);
  paintMinimapBackground();
}

function build(kind, x, y) {
  if (kind === 'island') {
    const base = world.structures.find((s) => s.kind === 'island' && Math.hypot(s.x - x, s.y - y) < islandRadius(world, s) * 1.2);
    if (base) { raiseIsland(world, base); return; }
  }
  const def = STRUCTURES[kind], why = canPlace(world, kind, x, y), deep = kind === 'island' || kind === 'ship' ? depthAt(world, x, y) : 0;
  if (why) { showTicker(`Can't build a ${def.label.toLowerCase()} here: ${why}`); return; }
  // An island out over the deep needs far more raised to reach the surface (and stands as a cliff);
  // a ship that goes down further out is a bigger ship, and dearer.
  const k = kind === 'island' ? islandDeepCost(deep) : kind === 'ship' ? wreckCost(deep) : 1, pearls = Math.round(def.pearls * k), essence = Math.round(def.essence * k);
  if (world.game.pearls < pearls) { notEnough(pearls, 'pearls'); return; }
  if ((world.game.essence || 0) < essence) { notEnough(essence, 'essence'); return; }
  if (def.corruption && (world.game.corruption || 0) < def.corruption) { notEnough(def.corruption, 'corruption'); return; }
  if (def.corruption) spendCorruption(world, def.corruption, 'build');
  spend(world, pearls, 'build');
  spendEssence(world, essence, 'build');
  floatAward(x, y, `−${pearls}`, 'spend');
  const made = makeStructure(kind, world, x, y);
  made.worth = pearls + essence * WORTH.essence + (def.corruption || 0) * WORTH.corruption; // (off the ledger again if it's taken down)
  const back = Math.round(made.worth * 0.1 * difficulty(world).points * sizeFairness(world));
  if (back > 0) setTimeout(() => floatAward(x, y - 8, `+${back}`), 450);
  if (kind === 'island' || kind === 'ship') made.deep = Math.round(deep * 100) / 100;
  growWreck(made);
  startBuildAnim(made); // it arrives in its own way, then settles into the floor
  world.structures.push(made);
  markBuilt();
  if (kind === 'hatchery' && !world.hatchery) world.hatchery = newHatchery();
  logEvent(world, kind === 'ship' ? `You sank ${wreckName(made)}${k > 1.05 ? ` out over the deep (×${k.toFixed(1)})` : ''}: ${def.desc}` : `You built ${withArticle(def.label.toLowerCase())}${k > 1.05 ? ` out over the deep (×${k.toFixed(1)})` : ''}: ${def.desc}`, null, { cat: 'pond', pri: 2 });
  if (def.tier >= 3 && typeof narrate === 'function') narrate(world, 'build', { what: capFirst(withArticle(def.label.toLowerCase())) });
  if (kind === 'hatchery') setHatchery(true);
}

function demolish(s) {
  const def = STRUCTURES[s.kind];
  if (!confirm(`Take down the ${def.label.toLowerCase()}? Half its pearls come back.`)) return;
  if (s.kind === 'hatchery' && world.hatchery) {
    while (world.hatchery.stock.length) releaseStock(world, 0);
    setHatchery(false);
  }
  world.structures.splice(world.structures.indexOf(s), 1);
  divest(world, 'build', s.worth || def.pearls);
  setTimeout(markBuilt, 0);
  world.game.pearls += Math.round(def.pearls / 2);
  world.gameDirty = true;
  structuresChanged(!!def.shore);
  showTicker(`Took down the ${def.label.toLowerCase()}: +${Math.round(def.pearls / 2)} pearls`);
}

// Which animals are happier near a plant or rock, for the tool's hint.
function likedByText(kind) {
  const who = Object.entries(LIKES).filter(([k, l]) => l.includes(kind) && k !== 'tadpole' && SPECIES[k] && fitsHabitat(world, SPECIES_HABITAT[k])).map(([k]) => SINGULAR[k].toLowerCase());
  return who.length ? `liked by ${who.slice(0, 4).join(', ')}${who.length > 4 ? '…' : ''}` : '';
}

function useTool(x, y) {
  const tool = TOOLS[world.tool], price = tool.price || 0;
  if (tool.build) { build(tool.build, x, y); noteToolUse(world.tool); return; }
  if (tool.food && world.food.filter((f) => f.fed).length >= 120) return;
  if (!tool.place && !tool.food) return;
  if (tool.deepMin && depthAt(world, x, y) < tool.deepMin) { showTicker(`${tool.label} only grows in deep water`); return; }
  if (!spend(world, price, tool.food ? null : 'plants')) { notEnough(price); return; }
  if (price) floatAward(x, y, `−${price}`, 'spend');
  noteToolUse(world.tool);
  if (tool.place) tool.place(x, y);
  else {
    const spread = tool.spread || 3;
    for (let i = tool.n || (tool.food === 'pellet' ? 4 : 3); i > 0; i--) world.food.push(new Food(x + rand(-spread, spread), y + rand(-spread, spread), 40, tool.food));
    addRipple(world, x, y, 1);
  }
}

// What's under the pointer: the pond's animals before the gnats and fireflies drifting over them.
function creatureAt(x, y) {
  let best = null, flier = null;
  for (const c of world.creatures) {
    if (!c.hit(x, y)) continue;
    if (!c.life && (c.species === 'gnat' || c.species === 'firefly')) { flier = flier || c; continue; }
    if (!best || c.z > best.z) best = c;
  }
  return best || flier;
}
// A fingertip is wider than a pixel: the nearest animal within r of the tap, if the tap itself missed.
function creatureNear(x, y, r) {
  let best = null, bd = Infinity;
  for (const c of world.creatures) {
    if (!c.life || c.leaving || c.dying) continue;
    const d = Math.hypot(c.x - x, c.y - y) - (c.body ? Math.max(...c.body.w) : 2);
    if (d < r && d < bd) { bd = d; best = c; }
  }
  return best;
}

function removeAt(x, y) {
  const li = litterAt(world, x, y);
  if (li) { haulLitter(world, li); return; }
  const xa = xenoAt(world, x, y);
  if (xa) { breakXeno(world, xa); return; }
  const c = creatureAt(x, y);
  if (c && c.noGrab) { if (c.note) showTicker(c.note(world)); return; } // (the beach's own: not yours to net)
  if (c) { recycle(c); return; }
  const st = structureAt(world, x, y);
  if (st) { demolish(st); return; }
  for (const [list, key] of [[world.pads, 'pads'], [world.plants, 'plants']]) {
    const i = list.findLastIndex((p) => p.hit(x, y));
    if (i < 0) continue;
    if (list[i].oi != null) world.removed[key].push(list[i].oi);
    list[i].dead = true;
    list.splice(i, 1);
    return;
  }
  const ri = world.rocks.findIndex((r) => Math.hypot(r.x - x, r.y - y) < Math.max(r.a, r.b));
  if (ri >= 0) {
    if (world.rocks[ri].oi != null) world.removed.rocks.push(world.rocks[ri].oi);
    world.rocks.splice(ri, 1);
    bakeBackground(world);
    paintMinimapBackground();
  }
}

// ---- view: zoom & pan -------------------------------------------------------------
// The canvas holds the whole world; a CSS transform scales it by a whole number
// k of screen pixels per world pixel (so the art stays crisp) and pans it.

// tx, ty: where the pond sits on screen. reach: which end the view may run on past (see beachRange).
const view = { k: 3, tx: 0, ty: 0, r: 0, reach: { west: false, east: false }, lastTx: 0, lastTy: 0, glide: null };
// The view can be turned a quarter at a time (r), so a neighbour's pond shows with
// its beach on the same side of the screen as yours. World ↔ screen:
const ROT_SIDE = [[0, 1, 2, 3], [2, 3, 1, 0], [1, 0, 3, 2], [3, 2, 0, 1]]; // where each side of the pond ends up on screen
const displaySide = (side, r = view.r) => ROT_SIDE[r][side];
const screenSize = (W = world.W, H = world.H, r = view.r) => (r % 2 ? [H * view.k, W * view.k] : [W * view.k, H * view.k]);
function worldToScreen(x, y) {
  const k = view.k, W = world.W, H = world.H;
  return view.r === 1 ? [view.tx + k * (H - y), view.ty + k * x] : view.r === 2 ? [view.tx + k * (W - x), view.ty + k * (H - y)]
    : view.r === 3 ? [view.tx + k * y, view.ty + k * (W - x)] : [view.tx + k * x, view.ty + k * y];
}
function screenToWorld(sx, sy) {
  const u = (sx - view.tx) / view.k, v = (sy - view.ty) / view.k, W = world.W, H = world.H;
  return view.r === 1 ? [v, H - u] : view.r === 2 ? [W - u, H - v] : view.r === 3 ? [W - v, u] : [u, v];
}
const canvasTransform = (tx, ty, k, r, W, H) => (r === 1 ? `translate(${tx + H * k}px, ${ty}px) scale(${k}) rotate(90deg)`
  : r === 2 ? `translate(${tx + W * k}px, ${ty + H * k}px) scale(${k}) rotate(180deg)`
  : r === 3 ? `translate(${tx}px, ${ty + W * k}px) scale(${k}) rotate(270deg)` : `translate(${tx}px, ${ty}px) scale(${k})`);
const zoomLabel = document.getElementById('zoom-level');
// The zoom at which the pond covers the whole window (no border): the view starts one step in from it.
const coverK = () => { const [w, h] = view.r % 2 ? [world.H, world.W] : [world.W, world.H]; return Math.max(1, Math.ceil(Math.min(16, Math.max(innerWidth / w, innerHeight / h)) - 1e-6)); };
const defaultK = () => coverK() + 1; // one step in, so the pond carries on past the edges

// Out as far as the pond exactly covers the window: no border anywhere, and edge to edge along one side. The one
// zoom that needn't be a whole number (the rest are, so the art stays crisp); never below 1×.
const fitK = () => {
  const [w, h] = view.r % 2 ? [world.H, world.W] : [world.W, world.H];
  return clamp(Math.max(innerWidth / w, innerHeight / h), 1, 16);
};
// (Walking the beach keeps the zoom you walked in with, even where a pond is narrower than the screen.)
const minK = () => { const k = Math.min(coverK(), fitK()); return view.minK ? Math.min(view.minK, k) : k; };
function applyView() {
  if (view.k < minK()) view.k = minK();
  const [w, h] = screenSize(), ax = beachAxisX(), perpFree = view.glide && view.glide.perp;
  // Across the beach the view keeps to the pond, and on up the land past its landward edge as far as
  // that shows (pre: before the pond on screen, post: after it; hinterland.js).
  const up = typeof hinterSpan === 'function' ? hinterSpan() * view.k : 0, ds = displaySide(world.shoreSide ?? 3);
  const across = (len, scr, v, pre, post) => (len + pre + post <= scr ? Math.round((scr - len - pre - post) / 2 + pre) : Math.round(clamp(v, scr - len - post, pre)));
  // (An animal's or a thing's card over part of the screen: room to bring what's under it out from under it,
  // past the pond's edge if need be.)
  const [cr, cb] = cardCover();
  if (ax) {
    const [lo, hi] = beachRange(w, innerWidth, view.lastTx);
    view.tx = Math.round(clamp(view.tx, lo - cr, hi));
    view.ty = perpFree ? Math.round(view.ty) : across(h, innerHeight, view.ty, ds === 2 ? up : 0, (ds === 3 ? up : 0) + cb);
  } else {
    const [lo, hi] = beachRange(h, innerHeight, view.lastTy);
    view.ty = Math.round(clamp(view.ty, lo - cb, hi));
    view.tx = perpFree ? Math.round(view.tx) : across(w, innerWidth, view.tx, ds === 0 ? up : 0, (ds === 1 ? up : 0) + cr);
  }
  view.lastTx = view.tx; view.lastTy = view.ty;
  canvas.style.transform = canvasTransform(view.tx, view.ty, view.k, view.r, world.W, world.H);
  zoomLabel.textContent = Number.isInteger(view.k) ? `${view.k}×` : 'fit'; // (zoomed all the way out, the pond just covering the window)
  if (typeof placeBeyond === 'function') { placeBeyond(); edgePull(); }
  if (typeof placeHinter === 'function') placeHinter();
}

function zoomTo(k, cx = innerWidth / 2, cy = innerHeight / 2) {
  const nk = clamp(Math.round(k), minK(), 16), [wx, wy] = screenToWorld(cx, cy);
  view.k = nk;
  const [sx, sy] = worldToScreen(wx, wy);
  view.tx += cx - sx; view.ty += cy - sy;
  applyView();
}

// (From the fitted zoom, in goes to the next whole one, crisp again.)
const zoomStep = (dir, cx, cy) => zoomTo(dir > 0 ? Math.floor(view.k + 1e-6) + 1 : Math.ceil(view.k - 1e-6) - 1, cx, cy);

function centerOn(x, y) {
  const [sx, sy] = worldToScreen(x, y);
  view.tx += innerWidth / 2 - sx; view.ty += innerHeight / 2 - sy;
  applyView();
}

function resetView() {
  view.k = defaultK();
  centerOn(world.W / 2, world.H / 2);
}

let wheelAcc = 0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  wheelAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
  if (Math.abs(wheelAcc) < 40) return;
  zoomStep(-Math.sign(wheelAcc), e.clientX, e.clientY);
  wheelAcc = 0;
}, { passive: false });

// ---- pointer --------------------------------------------------------------------
// A press on an animal grabs it. A press on empty water uses the tool if
// released in place, or pans if dragged. Two fingers pinch-zoom.

const touches = new Map();
let press = null, pinch = null;

function toWorld(e) {
  [world.pointer.x, world.pointer.y] = screenToWorld(e.clientX, e.clientY);
  world.pointer.inside = true;
}

function release() {
  if (world.grab) world.grab.grabbed = false;
  world.grab = null;
  canvas.style.cursor = 'crosshair';
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return; // right-click opens a card (contextmenu); it never uses the tool
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.k, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    press = null;
    release();
    return;
  }
  if (touches.size > 2) return;
  toWorld(e);
  const { x, y } = world.pointer;
  if (world.observe) {
    // Someone else's pond: pan and look; a tap on an animal opens its card.
    const c = creatureAt(x, y);
    if (c) tap = { x: e.clientX, y: e.clientY, t: performance.now(), c };
    press = { cx: e.clientX, cy: e.clientY, tx: view.tx, ty: view.ty, x, y, panning: false };
    view.reach = viewAtEnds();
    return;
  }
  if (world.tool === 'net') { removeAt(x, y); noteToolUse('net'); return; }
  const c = creatureAt(x, y) || (e.pointerType !== 'mouse' && world.tool === 'pointer' ? creatureNear(x, y, 14 / view.k) : null);
  if (c && !c.noGrab) {
    world.grab = c;
    c.grabbed = true;
    canvas.style.cursor = 'grabbing';
    tap = { x: e.clientX, y: e.clientY, t: performance.now(), c };
  } else {
    if (c) tap = { x: e.clientX, y: e.clientY, t: performance.now(), c }; // (a beach animal: not to be carried off; a drag pans)
    press = { cx: e.clientX, cy: e.clientY, tx: view.tx, ty: view.ty, x, y, panning: false };
    view.reach = viewAtEnds();
    // A long press opens the card of whatever is there (plants too).
    press.longT = setTimeout(() => { if (press && !press.panning) press.done = openThingAt(x, y) || (e.pointerType !== 'mouse' && typeof touchWorldTip === 'function' && touchWorldTip(x, y, e.clientX, e.clientY)); }, 550);
  }
});

// Right-click (or a long press) opens the card of an animal, plant or structure.
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); toWorld(e); openThingAt(world.pointer.x, world.pointer.y); });
function openThingAt(x, y) {
  const c = creatureAt(x, y);
  if (c && c.life) { showCreature(c); return true; }
  const st = structureAt(world, x, y);
  if (st) { showObject(st); return true; }
  const p = [...world.pads, ...world.plants].reverse().find((q) => q.hit(x, y));
  if (p) { showObject(p); return true; }
  return false;
}

canvas.addEventListener('pointermove', onPointerMove);
function onPointerMove(e) {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size === 2) {
    const [a, b] = [...touches.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    view.tx += mx - pinch.mx; view.ty += my - pinch.my;
    pinch.mx = mx; pinch.my = my;
    zoomTo(pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, mx, my);
    return;
  }
  toWorld(e);
  if (press) {
    const dx = e.clientX - press.cx, dy = e.clientY - press.cy;
    if (!press.panning && dx * dx + dy * dy > 36) { press.panning = true; canvas.style.cursor = 'move'; stopFollow(); }
    if (press.panning) {
      view.glide = null;
      view.tx = press.tx + dx; view.ty = press.ty + dy; applyView();
      // Pushing at an end: make sure what's beyond is being drawn, so the next push runs on into it.
      const ax = beachAxisX(), over = ax ? press.tx + dx - view.tx : press.ty + dy - view.ty;
      if (over) { const side = over > 0 ? 'west' : 'east'; if (BEACH[side] && !BEACH[side].snap) ensureBeyond(side); }
      const moved = checkCross();
      if (moved) { press.tx += moved[0]; press.ty += moved[1]; }
    }
    return;
  }
  if (world.grab) return;
  const over = creatureAt(world.pointer.x, world.pointer.y);
  world.hover = over;
  hoverAt = [e.clientX, e.clientY];
  canvas.style.cursor = over && over.noGrab ? 'help' : world.tool === 'net' ? (over ? 'pointer' : 'crosshair') : over ? 'grab' : world.tool === 'pointer' ? 'default' : world.tool === 'feed' ? 'crosshair' : 'copy';
}
// A press on the picture of the next pond along (while you're looking over the edge) only pans.
function beyondDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  e.currentTarget.setPointerCapture(e.pointerId);
  if (touches.size > 1) return;
  toWorld(e);
  stopFollow();
  press = { cx: e.clientX, cy: e.clientY, tx: view.tx, ty: view.ty, x: world.pointer.x, y: world.pointer.y, panning: false, beyond: true };
}

let tap = null, lastTap = null;
function pointerEnd(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  if (press) clearTimeout(press.longT);
  // Let go and the view stays where it is: no spring back, no settling.
  if (press) view.reach = { west: false, east: false };
  if (press && press.done) press = null; // a long press opened a card
  if (press && press.hinter && !press.panning && e.type === 'pointerup' && typeof hinterClick === 'function') hinterClick(world, press.x, press.y);
  const ambient = tap && tap.c && tap.c.noGrab; // (a beach animal that isn't the pond's: a click says what it is, and uses no tool)
  if (press && !press.panning && !press.beyond && !ambient && e.type === 'pointerup') {
    closeWindows(); // (one window at a time: a click in the pond closes the one that's open)
    // Clicking the hatchery opens it (with any tool but the Net); feeding over
    // another structure tells you about it.
    const st = world.tool !== 'net' && structureAt(world, press.x, press.y);
    const rm = world.tool !== 'net' && remainsAt(world, press.x, press.y), fo = world.tool !== 'net' && fossilAt(world, press.x, press.y);
    const li = litterAt(world, press.x, press.y), sl = !li && slickAt(world, press.x, press.y);
    if (world.observe) { /* someone else's pond: look only */ }
    else if (typeof nestAt === 'function' && nestAt(world, press.x, press.y)) showTicker(nestNote(world, nestAt(world, press.x, press.y)));
    else if (li) haulLitter(world, li);
    else if (sl && world.tool !== 'net' && !creatureAt(press.x, press.y)) skimSlick(world, sl);
    else if (fo) collectFossil(world, fo);
    else if (rm) collectRemains(world, rm);
    else if (st && st.kind === 'hatchery') setHatchery(true);
    else if (st && (world.tool === 'feed' || world.tool === 'pointer')) showObject(st);
    else if (world.tool === 'pointer') {
      // The pointer looks: a plant's card (an animal's opens below), and nothing at all on open water.
      const p = [...world.pads, ...world.plants].reverse().find((q) => q.hit && q.hit(press.x, press.y));
      if (p && !creatureAt(press.x, press.y)) showObject(p);
    } else useTool(press.x, press.y);
  }
  // A quick click on an animal (not a drag) opens its card.
  if (tap && e.type === 'pointerup' && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6 && performance.now() - tap.t < 350) {
    // (A second tap on the same animal, on a touchscreen, follows it: the double-click there.)
    if (e.pointerType !== 'mouse' && lastTap && lastTap.c === tap.c && performance.now() - lastTap.t < 450 && tap.c.life) { cam.tour = false; $('tour').setAttribute('aria-pressed', false); follow(tap.c); lastTap = null; }
    else {
      if (tap.c.life) { showCreature(tap.c); if (e.pointerType !== 'mouse') revealFromCard(tap.c); }
      else if (tap.c.note) showTicker(tap.c.note(world));
      lastTap = { c: tap.c, t: performance.now() };
    }
  }
  tap = null;
  press = null;
  release();
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('pointerleave', () => { if (!world.grab) world.pointer.inside = false; world.hover = null; });
canvas.addEventListener('dblclick', (e) => {
  toWorld(e);
  const c = creatureAt(world.pointer.x, world.pointer.y);
  if (c) { cam.tour = false; $('tour').setAttribute('aria-pressed', false); follow(c); }
});

// ---- follow cam & tour --------------------------------------------------------
// Double-click (or F over) an animal to ride along with it. Tour hops between
// whatever is most interesting: whoever the journal just mentioned, or anyone.

const cam = { follow: null, tour: false, next: 0, fx: 0, fy: 0 };
const alive = (c) => c && !c.gone && !c.caught && world.creatures.includes(c);

function follow(c) {
  cam.follow = c;
  if (c && view.k < defaultK() + 1) zoomTo(defaultK() + 1);
  cam.fx = view.tx; cam.fy = view.ty;
  if (c && c.life) showCreature(c, true); // riding along (or touring) shows who it is
  updateChip();
}

function stopFollow() {
  cam.follow = null;
  cam.tour = false;
  if (typeof creatureUi !== 'undefined' && creatureUi.auto) hideCreature();
  document.getElementById('tour')?.setAttribute('aria-pressed', false);
  updateChip();
}

function pickInteresting() {
  const recent = world.journal.map((e) => e.subject).find((s) => alive(s) && s !== cam.follow && (s.alpha ?? 1) > 0.5);
  if (recent && Math.random() < 0.6) return recent;
  const pool = world.creatures.filter((c) => c.life && c !== cam.follow && !c.leaving);
  return pool.length ? pick(pool) : null;
}

function updateCamera(dt) {
  if (cam.tour) {
    cam.next -= dt;
    if (cam.next <= 0 || !alive(cam.follow)) { follow(pickInteresting()); cam.next = 14; }
  } else if (cam.follow && !alive(cam.follow)) {
    cam.follow = null;
    updateChip();
  }
  const c = cam.follow;
  if (!c) return;
  const k = view.k, e = Math.min(1, dt * 3), [fx, fy] = viewFocus();
  cam.fx += (fx - c.x * k - cam.fx) * e;
  cam.fy += (fy - c.y * k - cam.fy) * e;
  view.tx = cam.fx; view.ty = cam.fy;
  applyView();
}

// How much of the screen an open card covers: [at the right, at the bottom] (a sheet from the bottom, or a panel
// down the right side).
function cardCover() {
  let r = 0, b = 0;
  for (const id of ['creature', 'object']) {
    const el = document.getElementById(id);
    if (!el || el.hidden) continue;
    const q = el.getBoundingClientRect();
    if (q.width > innerWidth * 0.8) { if (q.top > innerHeight * 0.2) b = Math.max(b, innerHeight - q.top); } else if (q.left > innerWidth * 0.4) r = Math.max(r, innerWidth - q.left);
  }
  return [Math.round(r), Math.round(b)];
}
// Where the eye goes: the middle of the screen, or of what an animal's (or a thing's) card leaves showing: above it
// when it comes up from the bottom (a phone held upright), beside it when it runs down the side.
function viewFocus() {
  let x1 = innerWidth, y1 = innerHeight;
  for (const id of ['creature', 'object']) {
    const el = document.getElementById(id);
    if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width > innerWidth * 0.8) { if (r.top > innerHeight * 0.2) y1 = Math.min(y1, r.top); } else if (r.left > innerWidth * 0.4) x1 = Math.min(x1, r.left);
  }
  return [x1 / 2 + (x1 < innerWidth ? 24 : 0), Math.max(80, y1 / 2 + (y1 < innerHeight ? 20 : 0))];
}
// A card opened on a touchscreen: ease the view so the animal isn't under it.
function revealFromCard(c) {
  if (!c || cam.follow) return;
  const [sx, sy] = worldToScreen(c.x, c.y), [fx, fy] = viewFocus();
  if (Math.abs(fx - innerWidth / 2) < 2 && Math.abs(fy - innerHeight / 2) < 2) return; // (nothing in the way)
  view.glide = { tx: view.tx + fx - sx, ty: view.ty + fy - sy };
}

let chipName = '';
function updateChip() {
  const chip = document.getElementById('follow');
  if (!chip) return;
  const c = cam.follow;
  chip.hidden = !c && !cam.tour;
  const text = c ? `${cam.tour ? 'Touring' : 'Following'} ${c.life ? `${c.life.name} the ${describe(c).label}` : describe(c).label}` : 'Touring…';
  if (text !== chipName) { chipName = text; chip.querySelector('span').textContent = text; }
}

// ---- minimap ------------------------------------------------------------------------
// The whole pond in miniature: the floor, a dot per animal, and the view rectangle.
// Click or drag on it to jump there.

const mini = document.getElementById('minimap'), mctx = mini.getContext('2d');
const miniBg = document.createElement('canvas');
// Layers: the pond, how tense the water is, and (with both waters) where it runs fresh or salt.
const MINI_LAYERS = [['map', 'Map'], ['tension', 'Tension: red is aggressive water'], ['water', 'Water: green fresh, blue salt'], ['land', 'Land: what the floor has become']];
let miniLayer = 0, miniKey = '', miniCell = null, miniWet = null, miniDry = null;
const SUN_DRY = hexToInt('#fff0d2'); // (the sunlit dry beach, as the renderer blends it)
const TENSION = hexToInt('#ef3a3a'), FRESH_TINT = hexToInt('#5ad25a'), SALT_TINT = hexToInt('#3a8aff');

// Each minimap pixel averages a 3x3 sample of its patch of pond, once as water and
// once as dry sand; which one it shows follows the tide.
// (Drawn the pond's own way round, then turned with the view: see miniDims and miniMatrix.)
const miniDims = () => (view.r % 2 ? [mini.height, mini.width] : [mini.width, mini.height]);
const miniMatrix = () => {
  const [DW, DH] = miniDims();
  return view.r === 1 ? [0, 1, -1, 0, DH, 0] : view.r === 2 ? [-1, 0, 0, -1, DW, DH] : view.r === 3 ? [0, -1, 1, 0, 0, DW] : [1, 0, 0, 1, 0, 0];
};
function paintMinimapBackground() {
  const [mw, mh] = miniDims(), { W, H, bg, bgDry, shore } = world, water = world.waterColor;
  const deep = DEEP_COLOR[world.opts.habitat] || DEEP_COLOR.mixed;
  miniCell = new Int32Array(mw * mh); miniWet = new Uint32Array(mw * mh); miniDry = new Uint32Array(mw * mh);
  const avg = (cs) => {
    let r = 0, g = 0, b = 0;
    for (const c of cs) { r += c & 255; g += (c >> 8) & 255; b += (c >>> 16) & 255; }
    const n = cs.length;
    return (0xff000000 | (Math.round(b / n) << 16) | (Math.round(g / n) << 8) | Math.round(r / n)) >>> 0;
  };
  for (let j = 0, k = 0; j < mh; j++) {
    for (let i = 0; i < mw; i++, k++) {
      const wet = [], dry = [], cells = [];
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const p = Math.min(W - 1, Math.floor((i + (sx + 0.5) / 3) / mw * W)) + Math.min(H - 1, Math.floor((j + (sy + 0.5) / 3) / mh * H)) * W;
          cells.push(p);
          wet.push(bg[p]);
          dry.push(shore && shore[p] ? (bgDry ? bgDry[p] : mixColor(bg[p], SUN_DRY, 0.18)) : bg[p]);
        }
      }
      miniCell[k] = Math.min(W - 1, Math.floor((i + 0.5) / mw * W)) + Math.min(H - 1, Math.floor((j + 0.5) / mh * H)) * W;
      // Deep water darkens as it does in the pond itself (averaged over the cell, so the drop-off shades in).
      let dd = 0;
      if (world.depth) for (const q of cells) dd += world.depth[q];
      miniWet[k] = mixColor(mixColor(avg(wet), water, 0.45), deep, (dd / cells.length / 255) * 0.85);
      miniDry[k] = avg(dry);
    }
  }
  miniKey = '';
}

function refreshMinimapBackground() {
  if (!miniCell) return;
  const layer = MINI_LAYERS[miniLayer][0], shore = world.shore, tideL = shore ? Math.round(world.tide.level * 255) : 999;
  const key = `${tideL}|${layer}|${layer === 'map' ? 0 : Math.floor(world.t)}`;
  if (key === miniKey) return;
  miniKey = key;
  const [mw, mh] = miniDims(), img = new ImageData(mw, mh), px = new Uint32Array(img.data.buffer);
  for (let k = 0; k < px.length; k++) {
    const p = miniCell[k], dry = shore && shore[p] > tideL;
    let c = dry ? miniDry[k] : miniWet[k];
    if (!dry && layer !== 'map') {
      const x = p % world.W, y = (p / world.W) | 0;
      if (layer === 'tension') c = mixColor(c, TENSION, Math.min(1, aggressionAt(world, x, y)) * 0.7);
      else if (layer === 'land') c = typeof landMiniColor === 'function' ? landMiniColor(world, x, y, c) : c;
      else { const s = saltAt(world, x, y); c = mixColor(c, s < 0 ? FRESH_TINT : SALT_TINT, Math.min(1, Math.abs(s)) * 0.55); }
    }
    px[k] = c;
  }
  miniBg.width = mw; miniBg.height = mh;
  miniBg.getContext('2d').putImageData(img, 0, 0);
}

function setMiniLayer(i) {
  const layers = MINI_LAYERS.filter(([k]) => k !== 'water' || world.opts.habitat === 'mixed');
  miniLayer = MINI_LAYERS.indexOf(layers[i % layers.length]);
  const [, label] = MINI_LAYERS[miniLayer];
  $('map-layer').textContent = label.split(':')[0];
  $('map-layer').title = `Map layer: ${label}. Click to switch.`;
  miniKey = '';
  drawMinimap();
}

function drawMinimap() {
  if (!mini.getClientRects().length) return; // (put away, on a phone)
  const [mw, mh] = miniDims(), sx = mw / world.W, sy = mh / world.H;
  refreshMinimapBackground();
  mctx.setTransform(...miniMatrix());
  mctx.drawImage(miniBg, 0, 0);
  for (const c of world.creatures) {
    if (c.species === 'gnat' || c.species === 'firefly') continue;
    const rare = c.life && c.life.traits.length;
    mctx.fillStyle = rare ? '#ffd166' : c.species === 'wild' ? c.sp.color : (SPECIES[c.species] || {}).color || '#dff6f0';
    const s = rare ? 3 : 2;
    mctx.fillRect(Math.round(c.x * sx) - 1, Math.round(c.y * sy) - 1, s, s);
  }
  const [x0, y0, x1, y1] = visibleRect();
  mctx.strokeStyle = '#ffd166';
  mctx.lineWidth = 1;
  mctx.strokeRect(Math.round(x0 * sx) + 0.5, Math.round(y0 * sy) + 0.5, Math.max(2, Math.round((x1 - x0) * sx)) - 1, Math.max(2, Math.round((y1 - y0) * sy)) - 1);
  mctx.setTransform(1, 0, 0, 1, 0, 0);
}

function miniJump(e) {
  const r = mini.getBoundingClientRect(), [DW, DH] = miniDims();
  const X = (e.clientX - r.left) / r.width * mini.width, Y = (e.clientY - r.top) / r.height * mini.height;
  const [u, v] = view.r === 1 ? [Y, DH - X] : view.r === 2 ? [DW - X, DH - Y] : view.r === 3 ? [DW - Y, X] : [X, Y];
  stopFollow();
  centerOn(u / DW * world.W, v / DH * world.H);
  drawMinimap();
}
mini.addEventListener('pointerdown', (e) => { mini.setPointerCapture(e.pointerId); miniJump(e); });
mini.addEventListener('pointermove', (e) => { if (e.buttons) miniJump(e); });
// On a phone the map comes and goes with a button beside the zoom (shown at first when the screen is short and
// wide, or big enough; remembered once you choose).
{
  const btn = document.getElementById('map-toggle');
  const set = (on, keep) => {
    document.body.classList.toggle('map-open', on);
    btn.setAttribute('aria-pressed', on);
    if (keep) try { localStorage.setItem('pond.map', on ? '1' : '0'); } catch { /* storage unavailable */ }
    if (on) requestAnimationFrame(() => drawMinimap());
  };
  let was = null;
  try { was = localStorage.getItem('pond.map'); } catch { /* storage unavailable */ }
  set(was != null ? was === '1' : innerHeight <= 500 || innerWidth > 760, false);
  btn.addEventListener('click', () => set(!document.body.classList.contains('map-open'), true));
}
document.getElementById('map-layer').addEventListener('click', () => {
  const layers = MINI_LAYERS.filter(([k]) => k !== 'water' || world.opts.habitat === 'mixed');
  setMiniLayer(layers.indexOf(MINI_LAYERS[miniLayer]) + 1);
});

// ---- neighbours: the shared beach ----------------------------------------------------------------
// Every pond lies on one long beach with the others, in the order they were made.
// Past each end of your beach lies the next pond along, shown right there beside
// yours at the same zoom and turned so its beach runs on from yours. Drag on past
// the end (starting from the end) and the camera walks into it; let go more than
// halfway across and you're there: that pond comes alive in place, run from its
// owner's latest save (the master copy on the server, re-applied as they play),
// to look at but not touch. Let go sooner and you spring back. The pond you left
// waits behind you the same way, so walking home is just as seamless.
const NB = { west: null, east: null, at: 0, busy: false };
// What lies past each end of the beach on screen ('west' is left or up, 'east' right or down):
// { id, info, home, save, snap: { canvas, W, H, r }, loading, rect }.
const BEACH = { west: null, east: null };
let homeInfo = null; // your own pond, while you're walking: { seed, id, path }
// The view along the beach. It pans the pond as far as its ends, and runs into the edge there
// and stops. Push on from an end (a drag that starts there, or a key) and, once the next pond is
// drawn, it runs on into it, as far as that pond reaches; let go and it stays put. When the middle
// of the screen is over the next pond, you're in it (crossTo): nothing on screen moves.
const CROSS_MARGIN = 24; // (how far past the seam the middle of the screen has to be)
function normalRange(len, scr) { const c = Math.round((scr - len) / 2); return len <= scr ? [c, c] : [scr - len, 0]; }
function beyondLen(side) {
  const B = BEACH[side];
  if (!B || !B.snap) return 0;
  const [bw, bh] = screenSize(B.snap.W, B.snap.H, B.snap.r);
  return beachAxisX() ? bw : bh;
}
// How far the view may go along the beach: the pond's own range, run on past an end that the view
// may reach (view.reach) or is already past (cur).
function beachRange(len, scr, cur) {
  const [lo0, hi0] = normalRange(len, scr);
  let lo = lo0, hi = hi0;
  if (view.reach.west || cur > hi0) hi = hi0 + beyondLen('west');
  if (view.reach.east || cur < lo0) lo = lo0 - beyondLen('east');
  return [lo, hi];
}
// Whether the view is at either end of the pond (or already past it).
function viewAtEnds() {
  const ax = beachAxisX(), [w, h] = screenSize(), len = ax ? w : h, scr = ax ? innerWidth : innerHeight, a = ax ? view.tx : view.ty, [lo0, hi0] = normalRange(len, scr);
  return { west: a >= hi0 - 1, east: a <= lo0 + 1 };
}
// How far past its own end the view is, toward the next pond: 0 (not at all) to 1 (crossing).
function pastEnd() {
  const ax = beachAxisX(), [w, h] = screenSize(), len = ax ? w : h, scr = ax ? innerWidth : innerHeight, a = ax ? view.tx : view.ty, [lo0, hi0] = normalRange(len, scr), mid = scr / 2;
  if (a > hi0) return { side: 'west', k: clamp((a - hi0) / Math.max(1, mid + CROSS_MARGIN - hi0), 0, 1) };
  if (a < lo0) return { side: 'east', k: clamp((lo0 - a) / Math.max(1, lo0 - (mid - CROSS_MARGIN - len)), 0, 1) };
  return null;
}
// Once the middle of the screen is over the next pond along, you're in it. Returns how far the
// pond's position on screen shifted (the view itself doesn't move), or null.
let crossing = false;
function checkCross() {
  const p = pastEnd();
  if (!p || p.k < 1 || crossing || !BEACH[p.side] || !BEACH[p.side].snap) return null;
  const bx = view.tx, by = view.ty;
  crossing = true;
  try { if (!crossTo(p.side)) return null; } finally { crossing = false; }
  return [view.tx - bx, view.ty - by];
}
const beachAxisX = () => displaySide(world.shoreSide ?? 3) >= 2; // a beach along the top or bottom of the screen runs left to right

async function refreshNeighbours() {
  if (NB.busy || !Net.base || IS_BOT) return;
  NB.busy = true;
  const id = world.observe ? world.observe.id : world.link && world.link.id;
  const r = await fetchNeighbours(id);
  Object.assign(NB, { west: r.west, east: r.east, at: Date.now(), busy: false });
  for (const side of ['west', 'east']) {
    const cur = BEACH[side], n = NB[side];
    if (cur && cur.back) continue; // the pond you came from stays where it is
    if (!n) { BEACH[side] = null; continue; }
    if (cur && cur.id === n.id) { cur.info = n; continue; }
    BEACH[side] = { id: n.id, info: n, home: !!(homeInfo && n.id === homeInfo.id) };
  }
  edgeHints();
}

// Render another pond from its save, whole, in its own orientation (for the view beyond the end).
function snapshotPond(save) {
  const keepWild = WILD_SPECIES.slice(), keepEco = { ...ECO }, [W, H] = save.size;
  const pw = {
    W, H, seed: save.seed, opts: { ...world.opts, ...save.opts }, shoreSide: save.shoreSide, expandPx: save.expandPx || 0,
    creatures: [], food: [], eggs: [], effects: [], swarms: [], targets: {}, journal: [], glints: [], structures: [], remains: [], fossils: [], litter: [],
    rocks: [], plants: [], pads: [], pebbles: [],
    tide: { ...world.tide }, weather: { rain: 0, target: 0, next: 30, gust: 0 }, current: { s: 0, angle: 0, x: 0, y: 0, base: 0 },
    pointer: { inside: false, x: -99, y: -99 }, days: 0, clock: 0.4, darkness: world.darkness, raster: new Raster(W, H), maturity: 1,
    nearestFood: () => null,
  };
  try {
    restorePond(pw, save);
    pw.tide = { ...world.tide }; // the same tide both sides of the beach
    bakeBackground(pw);
    const r = pw.raster, t = world.t;
    r.setClip(0, 0, W - 1, H - 1);
    r.begin();
    for (const p of [...pw.plants, ...pw.pads]) { const g = p.growth ?? 1; if (g < 0.999) r.setScale(p.x, p.y, Math.max(0.1, g)); p.draw(r, t, pw); r.setScale(); }
    for (const st of pw.structures) if (DRAW[st.kind]) DRAW[st.kind](r, st, t, pw);
    for (const c of pw.creatures) { r.alpha = 1; c.draw(r, t, pw); }
    r.alpha = 1;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), img = g.createImageData(W, H), px = new Uint32Array(img.data.buffer), water = WATERS[pw.opts.water] || WATERS.teal, light = world.light || lighting();
    r.compose(px, {
      bg: pw.bg, bgLight: pw.bgLight, lightTint: pw.lightTint, caustic: world.caustic, t, outline: OUTLINE, emissive: EMISSIVE, fade: FADE, thick: THICK, anyThick: false, tint: light.tint,
      caustics: false, causticT: water.caustic, shadows: true, outlines: true, fog: { color: pw.waterColor, amount: water.fog }, wob: null,
      shore: pw.shore, bgDry: pw.bgDry, tide: pw.tide.level, surf: 0, wave: 0, depth: pw.depth, deepColor: DEEP_COLOR[pw.opts.habitat] || DEEP_COLOR.mixed,
      voidSkin: null, swell: 0.3, swellDir: pw.shoreN || [0, 1],
    });
    g.putImageData(img, 0, 0);
    return { canvas: cv, W, H, shoreSide: save.shoreSide };
  } finally {
    WILD_SPECIES.length = 0; WILD_SPECIES.push(...keepWild); Object.assign(ECO, keepEco);
  }
}

// The pond you're in, as it looks right now, whole (it waits behind you when you walk on).
function captureSnap() {
  render(true);
  const cv = document.createElement('canvas');
  cv.width = world.W; cv.height = world.H;
  cv.getContext('2d').drawImage(canvas, 0, 0);
  return { canvas: cv, W: world.W, H: world.H, shoreSide: world.shoreSide, r: view.r };
}

// Fetch and draw what lies past one end (once, when you come near it).
async function ensureBeyond(side) {
  const B = BEACH[side];
  if (!B || B.snap || B.loading) return;
  B.loading = true;
  try {
    const got = B.home ? null : await fetchPond(B.id, true), save = B.home ? loadSave(homeInfo.seed) : got && got.save;
    if (!save || !isSave(save)) return;
    if (got) B.updated = got.updated;
    await new Promise((res) => setTimeout(res, 0)); // (let the frame finish before the heavy drawing)
    const snap = snapshotPond(save);
    // Turned so its beach is on the same side of the screen as this one's.
    const want = displaySide(world.shoreSide);
    snap.r = [0, 1, 2, 3].find((r) => ROT_SIDE[r][snap.shoreSide] === want) || 0;
    B.save = save; B.snap = snap;
  } finally {
    B.loading = false;
  }
  placeBeyond();
}

// Where the ponds beyond each end sit on screen: beside this one along the beach, their beaches lined up with its.
const beyondEl = {};
for (const side of ['west', 'east']) {
  const cv = document.createElement('canvas');
  cv.className = 'beyond';
  cv.hidden = true;
  canvas.before(cv);
  beyondEl[side] = cv;
  cv.addEventListener('pointerdown', beyondDown);
  cv.addEventListener('pointermove', onPointerMove);
  cv.addEventListener('pointerup', pointerEnd);
  cv.addEventListener('pointercancel', pointerEnd);
}
// The land up the beach (hinterland.js): dragged like the pond, and a click says what's there.
{
  const hc = typeof hinterInit === 'function' ? hinterInit(canvas) : null;
  if (hc) {
    hc.addEventListener('pointerdown', (e) => { beyondDown(e); if (press) press.hinter = true; });
    hc.addEventListener('pointermove', onPointerMove);
    hc.addEventListener('pointerup', pointerEnd);
    hc.addEventListener('pointercancel', pointerEnd);
    hc.addEventListener('wheel', (e) => { e.preventDefault(); canvas.dispatchEvent(new WheelEvent('wheel', e)); }, { passive: false }); // (zooms as the pond does)
    hc.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
function placeBeyond() {
  const ax = beachAxisX(), [w, h] = screenSize(), ds = displaySide(world.shoreSide ?? 3);
  for (const side of ['west', 'east']) {
    const B = BEACH[side], el = beyondEl[side];
    if (!B || !B.snap) { el.hidden = true; continue; }
    const S = B.snap, [bw, bh] = screenSize(S.W, S.H, S.r);
    let x, y;
    if (ax) { x = side === 'west' ? view.tx - bw : view.tx + w; y = ds === 3 ? view.ty + h - bh : view.ty; }
    else { y = side === 'west' ? view.ty - bh : view.ty + h; x = ds === 1 ? view.tx + w - bw : view.tx; }
    B.rect = [x, y];
    if (el.snapOf !== S) { el.width = S.W; el.height = S.H; el.getContext('2d').drawImage(S.canvas, 0, 0); el.snapOf = S; }
    el.style.transform = canvasTransform(x, y, view.k, S.r, S.W, S.H);
    el.hidden = x > innerWidth || y > innerHeight || x + bw < 0 || y + bh < 0;
  }
}

// Walk into the pond past one end: it comes alive exactly where its picture was.
function crossTo(side) {
  const B = BEACH[side];
  if (!B || !B.snap || (!B.save && !B.home)) return false;
  const other = side === 'west' ? 'east' : 'west', k = view.k;
  placeBeyond();
  const [bx, by] = B.rect;
  if (!world.observe) { saveNow(); homeInfo = { seed: world.seed, id: world.link && world.link.id, path: world.link ? `/${world.link.id}` : `/?pond=${encodeURIComponent(world.seed)}` }; }
  const leaving = { id: world.observe ? world.observe.id : homeInfo.id, home: !world.observe, back: true, snap: captureSnap(), info: { depth: pondFathoms(world), habitat: world.opts.habitat },
    save: world.observe ? world.observe.save : null, updated: world.observe ? world.observe.updated : 0 };
  const d = B.home ? loadSave(homeInfo.seed) : B.save;
  if (!d) return false;
  hideCreature(); hideObject(); closeSpawnCard(); setHatchery(false); setEvo(false);
  world.observe = B.home ? null : { id: B.id, updated: B.updated || Date.now(), home: homeInfo, homeId: homeInfo.id, dir: side, save: d };
  world.noSave = !B.home;
  document.body.classList.toggle('observing', !B.home);
  Object.assign(world.opts, d.opts);
  world.seed = d.seed; world.shoreSide = d.shoreSide; world.expandPx = d.expandPx || 0; world.autoSize = (d.base || d.size).slice();
  world.resume = d;
  world.quietRestore = true;
  view.r = B.snap.r;
  layout(true);
  world.quietRestore = false;
  // Exactly where its picture was, at the same zoom: nothing on screen moves. (Only if the new pond
  // is shorter across the beach than the view needs does it ease across to fit.)
  view.minK = k;
  BEACH[other] = leaving;
  BEACH[side] = null;
  view.k = k; view.tx = bx; view.ty = by; view.lastTx = bx; view.lastTy = by; view.reach = { west: false, east: false };
  view.glide = { tx: bx, ty: by, perp: true };
  applyView();
  const ax = beachAxisX(), [w2, h2] = screenSize(), fit = ax ? normalRange(h2, innerHeight) : normalRange(w2, innerWidth), cur = ax ? view.ty : view.tx, want = clamp(cur, fit[0], fit[1]);
  if (Math.abs(want - cur) > 1) { if (ax) view.glide.ty = want; else view.glide.tx = want; } else view.glide = null;
  if (B.home) {
    homeInfo = null;
    $('observe-bar').hidden = true;
    updateLink();
    logEvent(world, 'You walked back along the beach, home to your own pond', null, { cat: 'pond', pri: 1 });
  } else {
    $('observe-name').textContent = `${(B.info && B.info.title) || B.id}${B.info && B.info.by ? ` · ${B.info.by}'s pond` : ''}`;
    $('observe-bar').hidden = false;
    history.replaceState(null, '', `/${B.id}?observe=1`);
    logEvent(world, `You walked along the beach into ${B.id}, someone else's pond. Look around; nothing here is yours to touch`, null, { cat: 'pond', pri: 2 });
  }
  NB.at = 0; // look up what's beyond this one
  refreshNeighbours();
  return true;
}

// A walk the camera takes by itself: into the next pond when you choose Go (or Return), crossing
// on the way; or easing across after a crossing into a pond shorter across the beach.
function updateGlide(dt) {
  const g = view.glide;
  if (!g) return;
  // (At least a pixel a frame: the view is kept to whole pixels, so a smaller step would stall.)
  const a = Math.min(1, dt * 6), step = (v, to) => (Math.abs(to - v) <= 1 ? to : v + Math.sign(to - v) * Math.max(1, Math.abs(to - v) * a));
  if (g.side) view.reach = { west: g.side === 'west', east: g.side === 'east' };
  view.tx = step(view.tx, g.tx); view.ty = step(view.ty, g.ty);
  applyView();
  // (Crossing ends the walk where the new pond starts; crossTo sets up any easing across.)
  if (g.side && checkCross()) return;
  // Done, or held up (the view can't get any closer).
  if ((Math.abs(view.tx - g.tx) <= 1 && Math.abs(view.ty - g.ty) <= 1) || (g.px === view.tx && g.py === view.ty)) { view.glide = null; view.reach = { west: false, east: false }; return; }
  g.px = view.tx; g.py = view.ty;
}
// Walk on into the next pond along (the tab's Go, or Return to my pond when it's next door).
async function walkTo(side) {
  await ensureBeyond(side);
  const B = BEACH[side];
  if (!B || !B.snap) return false;
  stopFollow();
  const ax = beachAxisX(), [w, h] = screenSize(), len = ax ? w : h, scr = ax ? innerWidth : innerHeight, blen = beyondLen(side), [lo0, hi0] = normalRange(len, scr);
  // Far enough that the middle of the screen is well over it.
  const a = side === 'west' ? Math.min(hi0 + blen, scr / 2 + CROSS_MARGIN + 40) : Math.max(lo0 - blen, scr / 2 - CROSS_MARGIN - 40 - len);
  view.glide = { tx: ax ? a : view.tx, ty: ax ? view.ty : a, side };
  return true;
}

// The tab at each end of the beach, naming the pond beyond.
function edgeHints() {
  const ax = beachAxisX(), ends = viewAtEnds();
  for (const dir of ['west', 'east']) {
    const el = $(`edge-${dir}`), B = BEACH[dir], arrow = $(`nb-${dir}`);
    // (The ends of the beach are shown by little arrows by the pond's name now; the tabs stay hidden.)
    el.hidden = true;
    arrow.hidden = !B || HOME !== '/';
    if (!B) continue;
    const up = nbScreenDir(dir), info = B.info || {};
    arrow.textContent = up;
    arrow.classList.toggle('near', !!ends[dir]);
    arrow.title = B.home ? 'Your pond\nWalk back home along the beach' : `${info.title || B.id}\n${[info.by ? `${info.by}'s pond` : '', `${(info.depth || 1).toLocaleString()} fm`, HABITATS[info.habitat] || ''].filter(Boolean).join(' · ')}. Click to walk over (you can look, not touch), or drag on past the end of the beach.`;
    if (ends[dir]) ensureBeyond(dir); // near the end: draw what's beyond it
  }
  placeEdgeTabs();
}
// Keep the tabs clear of the menu and any open card or panel: the west tab steps out beside
// (or below) whatever covers it, the east tab beside (or above); where there's no room, it hides.
const TAB_AVOID = ['hud', 'rail', 'actions', 'creature', 'object', 'spawn-card', 'score-panel', 'sky-panel', 'census', 'hatchery', 'evo', 'guide', 'log-panel', 'nb-ask', 'lineage'];
function placeEdgeTabs() {
  // (Fixed panels have no offsetParent, so shown is judged by the hidden flag and a real size.)
  const boxes = TAB_AVOID.map((id) => document.getElementById(id)).filter((e) => e && !e.hidden && !e.classList.contains('hidden')).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 2 && r.height > 2);
  for (const dir of ['west', 'east']) {
    const el = document.getElementById(`edge-${dir}`);
    el.style.left = el.style.right = el.style.top = el.style.bottom = '';
    el.classList.remove('crowded');
    if (el.hidden) continue;
    const vert = el.classList.contains('vertical');
    for (let pass = 0; pass < 3; pass++) {
      const r = el.getBoundingClientRect(), hit = boxes.filter((b) => !(r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom));
      if (!hit.length) break;
      if (vert) {
        if (dir === 'west') { el.style.top = `${Math.round(Math.max(...hit.map((b) => b.bottom)) + 8)}px`; el.style.bottom = 'auto'; }
        else { el.style.bottom = `${Math.round(innerHeight - Math.min(...hit.map((b) => b.top)) + 8)}px`; el.style.top = 'auto'; }
      } else if (dir === 'west') el.style.left = `${Math.round(Math.max(...hit.map((b) => b.right)) + 10)}px`;
      else { el.style.right = `${Math.round(innerWidth - Math.min(...hit.map((b) => b.left)) + 10)}px`; el.style.left = 'auto'; }
    }
    // Still in the way (or pushed off screen): leave it out until there's room.
    const r = el.getBoundingClientRect();
    if (boxes.some((b) => !(r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom)) || r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) el.classList.add('crowded');
  }
}
{
  const again = () => requestAnimationFrame(placeEdgeTabs);
  const mo = new MutationObserver(again), ro = typeof ResizeObserver === 'function' ? new ResizeObserver(again) : null;
  for (const id of TAB_AVOID) { const e = document.getElementById(id); if (!e) continue; mo.observe(e, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] }); if (ro) ro.observe(e); }
  addEventListener('resize', again);
}

function edgePull() {
  const p = pastEnd();
  for (const d of ['west', 'east']) {
    const el = document.getElementById(`edge-${d}`);
    if (!el) continue;
    const k = p && p.side === d && BEACH[d] ? p.k : 0;
    if (el.dataset.pull === k.toFixed(2)) continue;
    el.dataset.pull = k.toFixed(2);
    el.style.setProperty('--pull', k.toFixed(2));
    el.classList.toggle('pulling', k > 0.02);
    el.classList.toggle('ready', k >= 1);
  }
}

// Clicking a tab asks first; Go walks you over (the camera slides into it).
function askNeighbour(dir) {
  const B = BEACH[dir];
  if (!B || HOME !== '/') return;
  $('nb-ask-text').textContent = B.home ? 'Walk back home to your pond?' : `Walk along the beach into ${B.id}? It's someone else's pond: you can look, but not touch.`;
  $('nb-ask').dataset.dir = dir;
  $('nb-ask').hidden = false;
  $('nb-go').focus();
}
document.getElementById('nb-go').addEventListener('click', async () => {
  const dir = document.getElementById('nb-ask').dataset.dir;
  document.getElementById('nb-ask').hidden = true;
  walkTo(dir);
});
document.getElementById('nb-stay').addEventListener('click', () => { document.getElementById('nb-ask').hidden = true; });
for (const d of ['west', 'east']) document.getElementById(`edge-${d}`).addEventListener('click', () => askNeighbour(d));
for (const d of ['west', 'east']) document.getElementById(`nb-${d}`).addEventListener('click', () => askNeighbour(d));
// Which way a neighbour lies on screen (the beach may run across the screen or up it, and the view turns).
function nbScreenDir(dir) {
  const [a, b] = beachAxisX() ? ['◂', '▸'] : ['▴', '▾'];
  return dir === 'west' ? a : b;
}

document.getElementById('observe-home').addEventListener('click', () => goHome());
function goHome() {
  const side = ['west', 'east'].find((s) => BEACH[s] && BEACH[s].home && BEACH[s].snap);
  if (side) { walkTo(side); return; }
  const home = (world.observe && world.observe.home) || homeInfo;
  world.noSave = true;
  location.assign(home ? home.path : '/');
}

// While observing: the owner's master copy, re-applied when it has moved on.
let observeTimer = 60;
async function observeSync(dt) {
  if (!world.observe || (observeTimer -= dt) > 0) return;
  observeTimer = 60;
  const got = await fetchPond(world.observe.id);
  if (!got || !(got.updated > world.observe.updated + 120000) || pastEnd() || view.glide) return;
  world.observe.updated = got.updated;
  world.observe.save = got.save;
  const [cx, cy] = screenToWorld(innerWidth / 2, innerHeight / 2), k = view.k, r = view.r;
  world.resume = got.save;
  world.quietRestore = true;
  layout(true);
  world.quietRestore = false;
  view.k = k; view.r = r;
  centerOn(cx, cy);
  showTicker(`${world.observe.id} has moved on: brought up to date from its owner's pond`);
}

// Start at one end of the beach (arriving from a neighbour by a link).
function startAtEdge(edge) {
  const ax = beachAxisX(), [w, h] = screenSize();
  if (ax) view.tx = edge === 'west' ? 0 : innerWidth - w; else view.ty = edge === 'west' ? 0 : innerHeight - h;
  applyView();
}

// ---- HUD ----------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const hud = $('hud');

function button(label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  return b;
}

// Where the page lives: "/" on the web; the file itself when opened from disk.
const HOME = location.protocol === 'file:' ? location.pathname : '/';

function shareUrl() {
  const u = new URL(location.href);
  u.pathname = HOME; u.search = ''; u.hash = '';
  u.searchParams.set('pond', world.seed);
  for (const k of ['habitat', 'floor', 'water', 'world']) if (world.opts[k] !== DEFAULT_OPTS[k]) u.searchParams.set(k, world.opts[k]);
  if (world.opts.world === 'auto') u.searchParams.set('size', `${world.W}x${world.H}`);
  return u.toString();
}

// Hover card: who is this, how old, how hungry, what are they up to.
const card = $('inspect');
let hoverAt = [0, 0], cardTimer = 0;
function updateCard(dt) {
  cardTimer -= dt;
  const c = world.hover;
  if (!c || c.gone || c.caught || world.grab || press) { card.hidden = true; return; }
  if (cardTimer > 0 && !card.hidden) return;
  cardTimer = 0.2;
  const d = describe(c), age = d.age == null ? '' : `${Math.floor(d.age / 60)}m ${String(Math.floor(d.age % 60)).padStart(2, '0')}s`;
  card.querySelector('.nm').textContent = d.name || d.label;
  card.querySelector('.sp').textContent = d.name ? d.label : '';
  const traits = card.querySelector('.traits');
  traits.textContent = [d.traits.length && `✦ ${TIERS[d.tier]}: ${traitText(d.traits, 5)}`, d.carries.length && `carries ${d.carries.join(', ')}`].filter(Boolean).join('  ·  ');
  traits.style.color = d.tier ? TIER_COLOR[d.tier] : '';
  card.querySelector('.meta').textContent = [d.stage, d.gen != null && `gen ${d.gen}`, age].filter(Boolean).join(' · ');
  card.querySelector('.mood').textContent = d.mood;
  const likes = c.life ? likesOf(c) : null;
  card.querySelector('.care').textContent = !c.life ? '' : [
    d.comfort != null && (likes ? `${comfortWord(d.comfort)} (likes ${likes.map((k) => LIKE_LABEL[k]).join(', ')})` : comfortWord(d.comfort)),
    d.fed && 'well fed', ...d.temper,
  ].filter(Boolean).join(' · ');
  const bar = card.querySelector('.bar');
  bar.hidden = d.energy == null;
  if (d.energy != null) bar.firstElementChild.style.width = `${Math.round(d.energy * 100)}%`;
  card.hidden = false;
  const [x, y] = hoverAt;
  card.style.left = `${Math.min(x + 14, innerWidth - card.offsetWidth - 8)}px`;
  card.style.top = `${Math.min(y + 14, innerHeight - card.offsetHeight - 8)}px`;
}

function setTool(name) {
  world.tool = name;
  const t = TOOLS[name];
  for (const b of document.querySelectorAll('button[data-tool]')) b.setAttribute('aria-pressed', b.dataset.tool === name);
  $('hint').textContent = (typeof forTouch === 'function' ? forTouch : (s) => s)(t.hint || [`click to place ${t.label.toLowerCase()} (${t.price} pearls)`, t.likedBy && likedByText(t.likedBy)].filter(Boolean).join(' · '));
}
// Each tool, plant and build is a tile in the actions panel, under its kind: an icon, its price,
// and (on hover) a + to pin it to the bar. Its name is in its tooltip.
const toolCat = (name, t) => (t.build ? 'build' : t.food ? 'food' : name === 'net' || name === 'pointer' ? 'tools' : 'plants');
const pinMark = () => Object.assign(document.createElement('span'), { className: 'pin', textContent: '+', title: 'Pin to the bar' });
for (const [name, t] of Object.entries(TOOLS)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.append(Object.assign(document.createElement('span'), { className: 'lbl', textContent: t.label }));
  b.setAttribute('aria-label', t.label);
  b.dataset.tool = name;
  if (t.price != null) {
    b.append(Object.assign(document.createElement('b'), { className: t.price ? 'price' : 'price free', textContent: t.price ? t.price : 'free' }));
    b.title = t.price ? `${t.label}: ${t.price} pearls${t.essence ? ` and ${t.essence} essence` : ''}` : `${t.label}: free`;
  }
  if (t.essence) b.append(Object.assign(document.createElement('b'), { className: 'price ess', textContent: fmtShort(t.essence) }));
  if (t.corruption) b.append(Object.assign(document.createElement('b'), { className: 'price cor', textContent: fmtShort(t.corruption) }));
  if (t.build) b.title += ` · ${STRUCTURES[t.build].desc}`;
  b.addEventListener('click', (e) => { if (e.target.closest('.pin')) { togglePin(name); return; } setTool(name); noteToolUse(name); });
  b.prepend(Object.assign(document.createElement('img'), { className: 'ticon', alt: '', width: 28, height: 28 }));
  b.append(pinMark());
  (t.build ? $('builds') : document.querySelector(`#tools [data-cat="${toolCat(name, t)}"] .act-grid`)).append(b);
}

// ---- tool icons, and the quick bar ------------------------------------------------------------
// Each tool's icon is drawn a few at a time once the pond is up (so the start isn't held up).
function setToolIcon(name) {
  const ic = toolIcon(name);
  for (const img of document.querySelectorAll(`[data-tool="${name}"] .ticon`)) {
    if (!ic) { img.remove(); continue; }
    const k = clamp(Math.floor(30 / Math.max(ic.nw, ic.nh)), 1, 4);
    img.src = ic.src; img.width = ic.nw * k; img.height = ic.nh * k;
  }
}
{
  const names = Object.keys(TOOLS);
  let i = 0;
  const step = () => {
    const t0 = performance.now();
    while (i < names.length && performance.now() - t0 < 6) setToolIcon(names[i++]);
    if (i < names.length) setTimeout(step, 40); else renderQuickBar();
  };
  setTimeout(step, 600);
}
// What gets used most (kept in this browser only): a pick counts, and so does each use.
const USE_KEY = 'pond.toolUse';
let toolUse = {};
try { toolUse = JSON.parse(localStorage.getItem(USE_KEY) || '{}') || {}; } catch { toolUse = {}; }
let useSaveT = 0;
function noteToolUse(name) {
  toolUse[name] = (toolUse[name] || 0) + 1;
  clearTimeout(useSaveT);
  useSaveT = setTimeout(() => { try { localStorage.setItem(USE_KEY, JSON.stringify(toolUse)); } catch { /* storage unavailable */ } }, 1000);
}
// The bar down the left: what you've pinned, or, until you pin anything, what you use most.
// Pins are tools (by name) or creatures ("life:koi"), kept in this browser only.
const QUICK_N = 8, QUICK_DEFAULT = ['feed', 'net', 'spirulina', 'weed', 'rock', 'brine'];
const PIN_KEY = 'pond.pins';
let pins = null;
try { const p = JSON.parse(localStorage.getItem(PIN_KEY) || 'null'); pins = Array.isArray(p) ? p.filter((k) => typeof k === 'string').slice(0, 30) : null; } catch { pins = null; }
const actionTile = (k) => document.querySelector(k.startsWith('life:') ? `#act-life [data-spawn="${k.slice(5)}"]` : `#actions [data-tool="${k}"]`);
const pinUsable = (k) => { if (k.startsWith('life:')) { const kind = k.slice(5); return !!SPECIES[kind] && fitsHabitat(world, SPECIES_HABITAT[kind]) && deepAvailable(world, kind) && deepUnlocked(world, kind); } const b = actionTile(k); return !!TOOLS[k] && !!b && !b.hidden; };
function barKeys() {
  if (pins) return ['pointer', ...pins.filter((k) => k !== 'pointer' && pinUsable(k))];
  const pick = Object.keys(toolUse).filter((n) => TOOLS[n] && pinUsable(n)).sort((a, b) => toolUse[b] - toolUse[a]).slice(0, QUICK_N);
  for (const n of QUICK_DEFAULT) if (pick.length < QUICK_N && !pick.includes(n) && pinUsable(n)) pick.push(n);
  return ['pointer', ...pick.filter((k) => k !== 'pointer')];
}
function togglePin(k) {
  const cur = pins || barKeys();
  pins = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
  try { localStorage.setItem(PIN_KEY, JSON.stringify(pins)); } catch { /* storage unavailable */ }
  renderQuickBar();
}
// The tiles show which are on the bar (their pin reads − to take one off).
function markPins() {
  const on = new Set(barKeys());
  for (const b of document.querySelectorAll('#actions [data-tool], #act-life [data-spawn]')) {
    const k = b.dataset.tool || `life:${b.dataset.spawn}`, p = b.querySelector('.pin');
    b.classList.toggle('pinned', on.has(k));
    if (p) { p.textContent = on.has(k) ? '−' : '+'; p.title = on.has(k) ? 'Take it off the bar' : 'Pin to the bar'; }
  }
}
function renderQuickBar() {
  const bar = $('quickbar');
  bar.hidden = !!world.observe;
  if (bar.hidden) return;
  const keys = barKeys(), sig = keys.join();
  if (bar.dataset.sig !== sig) {
    bar.dataset.sig = sig;
    bar.replaceChildren(...keys.map((k) => {
      const b = document.createElement('button'), life = k.startsWith('life:'), kind = life ? k.slice(5) : null, t = life ? null : TOOLS[k];
      b.type = 'button';
      if (life) {
        b.dataset.pin = k;
        b.append(iconImg(speciesIcon(kind), 28));
        b.title = `${SPECIES[kind].label}\nSpawn some (${spawnCost(kind)} essence) · − takes it off the bar`;
        b.setAttribute('aria-label', `Spawn ${SPECIES[kind].label.toLowerCase()}`);
      } else {
        b.dataset.tool = k;
        b.append(Object.assign(document.createElement('img'), { className: 'ticon', alt: '', width: 28, height: 28 }));
        b.setAttribute('aria-label', t.label);
        b.title = [t.label, t.price ? `${t.price} pearls${t.essence ? ` and ${t.essence} essence` : ''}` : t.price === 0 ? 'free' : '', t.build ? STRUCTURES[t.build].desc : t.hint, '− takes it off the bar'].filter(Boolean).join('\n');
      }
      const p = pinMark();
      p.textContent = '−'; p.title = 'Take it off the bar';
      b.append(p);
      b.addEventListener('click', (e) => {
        if (e.target.closest('.pin')) { togglePin(k); return; }
        if (life) openSpawnCard(kind, b); else { setTool(k); noteToolUse(k); }
      });
      return b;
    }));
    for (const k of keys) if (!k.startsWith('life:')) setToolIcon(k);
    if (typeof markBuilt === 'function') markBuilt();
  }
  for (const b of bar.children) b.setAttribute('aria-pressed', b.dataset.tool === world.tool);
  markPins();
}

// All actions, as icons, by kind; each kind folds away (remembered in this browser).
const CATS_KEY = 'pond.actCats';
let lifeTiles = false;
function setActions(open) {
  $('actions').hidden = !open;
  $('rail-more').setAttribute('aria-expanded', open);
  $('rail-more').textContent = open ? '▾' : '▴';
  if (open) {
    if (!hud.classList.contains('hidden')) setHud(false); // (one big window at a time)
    if (!lifeTiles) buildLifeTiles();
    markPins();
    placeActions();
  }
  placeEdgeTabs();
}
// Up from the item bar along the bottom, just above it (on a phone it's a sheet from the bottom instead).
function placeActions() {
  const box = $('actions');
  if (box.hidden) return;
  if (matchMedia('(max-width: 760px), (max-height: 500px)').matches) { box.style.bottom = ''; return; }
  box.style.bottom = `${Math.round(innerHeight - document.querySelector('.item-bar').getBoundingClientRect().top + 8)}px`;
}
addEventListener('resize', placeActions);
// Creatures: the dock's species, to spawn from here (or pin to the bar).
function buildLifeTiles() {
  lifeTiles = true;
  $('act-life').replaceChildren(...DOCK_KINDS.map((kind) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.spawn = kind;
    b.setAttribute('aria-label', `Spawn ${SPECIES[kind].label.toLowerCase()}`);
    b.title = `${SPECIES[kind].label}\nSpawn some for ${spawnCost(kind)} essence (a card opens to choose boosts)`;
    b.append(iconImg(speciesIcon(kind), 28), Object.assign(document.createElement('span'), { className: 'lbl', textContent: SPECIES[kind].label }),
      Object.assign(document.createElement('b'), { className: 'price', textContent: `${fmtShort(spawnCost(kind))}◆` }), pinMark());
    b.addEventListener('click', (e) => { if (e.target.closest('.pin')) { togglePin(`life:${kind}`); return; } openSpawnCard(kind, b); });
    return b;
  }));
  refreshSpeciesButtons();
}
{
  let folded = {};
  try { folded = JSON.parse(localStorage.getItem(CATS_KEY) || '{}') || {}; } catch { folded = {}; }
  for (const cat of document.querySelectorAll('#actions .act-cat')) {
    const head = cat.querySelector('.act-head'), key = cat.dataset.cat;
    head.setAttribute('aria-expanded', !folded[key]);
    head.addEventListener('click', () => {
      const open = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', open);
      folded[key] = !open;
      try { localStorage.setItem(CATS_KEY, JSON.stringify(folded)); } catch { /* storage unavailable */ }
    });
  }
  $('rail-more').addEventListener('click', () => setActions($('actions').hidden));
$('wild-btn').addEventListener('click', () => setWild(!wildUi.open));
$('wild-close').addEventListener('click', () => setWild(false));
  $('actions-close').addEventListener('click', () => setActions(false));
}

// ---- what's new, and what's built -------------------------------------------------------------------
// Anything that has become available since the pond last showed it to you (a new build, food or
// plant as it deepens, a species unlocked) is marked NEW until you point at it or use it; the pond
// keeps what it has shown you (G.seenAct), and its first look marks nothing. A one-of-a-kind build
// already in the pond is greyed out.
const newKey = (b) => b.dataset.tool || (b.dataset.spawn ? `life:${b.dataset.spawn}` : null);
function markNew() {
  const G = world.game;
  if (!G || world.observe) return;
  const tiles = [...document.querySelectorAll('#actions [data-tool], #act-life [data-spawn], #animals [data-spawn]')];
  const avail = tiles.filter((b) => !b.hidden).map(newKey);
  if (!G.seenAct) { G.seenAct = [...new Set(avail)]; world.gameDirty = true; }
  const seen = new Set(G.seenAct), fresh = new Set();
  for (const b of tiles) {
    const k = newKey(b), isNew = !b.hidden && !seen.has(k);
    b.classList.toggle('is-new', isNew);
    if (isNew && !b.closest('#animals')) fresh.add(k);
  }
  const more = $('rail-more');
  more.dataset.new = fresh.size ? String(fresh.size) : '';
  more.classList.toggle('has-new', fresh.size > 0);
}
function seeAct(k) {
  const G = world.game;
  if (!k || !G || !G.seenAct || G.seenAct.includes(k)) return;
  G.seenAct.push(k);
  world.gameDirty = true;
  markNew();
}
// Seen once you've pointed at it and moved on, or used it.
for (const box of [$('actions'), $('animals')]) {
  box.addEventListener('pointerout', (e) => { const b = e.target.closest('[data-tool], [data-spawn]'); if (b && b.classList.contains('is-new') && !b.contains(e.relatedTarget)) seeAct(newKey(b)); });
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-tool], [data-spawn]'); if (b) seeAct(newKey(b)); }, true);
}
function markBuilt() {
  for (const b of document.querySelectorAll('button[data-tool^="build-"]')) {
    const kind = TOOLS[b.dataset.tool].build, def = STRUCTURES[kind], done = !!def.unique && (world.structures || []).some((s) => s.kind === kind);
    b.classList.toggle('done', done);
    b.setAttribute('aria-disabled', done);
  }
}
// A one-of-a-kind already built can't be picked again.
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('button.done[data-tool^="build-"]');
  if (!b || e.target.closest('.pin')) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  showTicker(`There can only be one ${STRUCTURES[TOOLS[b.dataset.tool].build].label.toLowerCase()}, and it's already in the pond`);
}, true);

// Only offer animals and plants that live in this habitat.
function refreshSpeciesButtons() {
  // Deep species show once their zone exists and they're unlocked on the evolution tree.
  for (const b of document.querySelectorAll('[data-spawn]')) {
    const k = b.dataset.spawn;
    b.hidden = !fitsHabitat(world, SPECIES_HABITAT[k]) || !deepAvailable(world, k) || (typeof spawnable === 'function' ? !spawnable(world, k) : !deepUnlocked(world, k));
  }
  // Builds, foods and plants of the deep show once the pond is that deep.
  const tier = (world.erosion && world.erosion.tier) || 0;
  for (const b of $('builds').children) { const d = STRUCTURES[TOOLS[b.dataset.tool].build]; b.hidden = (!!d.habitat && !fitsHabitat(world, d.habitat)) || (d.tier || 0) > tier || (!!d.found && !(world.game && world.game[d.found])); } // (the tribute: once it's been found)
  for (const b of document.querySelectorAll('#tools [data-tool]')) {
    const t = TOOLS[b.dataset.tool], salt = ['anemone', 'coral', 'urchin'].includes(b.dataset.tool), fresh = ['marimo', 'duckweed', 'lily'].includes(b.dataset.tool);
    b.hidden = (salt && !fitsHabitat(world, 'salt')) || (fresh && !fitsHabitat(world, 'fresh')) || (!!t.habitat && !fitsHabitat(world, t.habitat)) || (t.tier || 0) > tier;
  }
  for (const b of document.querySelectorAll('[data-hab]')) {
    b.setAttribute('aria-pressed', b.dataset.hab === world.opts.habitat);
    const D = DIFFICULTY[b.dataset.hab];
    b.title = `${HABITATS[b.dataset.hab]} water: ${D.label.toLowerCase()} (${D.note}). Points ×${D.points}.`;
  }
  if (MINI_LAYERS[miniLayer][0] === 'water' && world.opts.habitat !== 'mixed') setMiniLayer(0);
  if (typeof renderQuickBar === 'function' && $('quickbar')) renderQuickBar();
  if (typeof markBuilt === 'function') { markBuilt(); markNew(); }
  if (typeof refreshWildButton === 'function') refreshWildButton();
  syncHard();
}

function fillSelect(el, entries, value) {
  el.replaceChildren();
  for (const [v, label] of entries) el.append(new Option(label, v));
  el.value = value;
}
fillSelect($('opt-floor'), Object.entries(FLOORS).map(([k, f]) => [k, f.label]), world.opts.floor);
fillSelect($('opt-water'), Object.entries(WATERS).map(([k, w]) => [k, w.label]), world.opts.water);
fillSelect($('opt-light'), Object.entries(LIGHTS).map(([k, l]) => [k, l.label]), world.opts.light);
fillSelect($('opt-world'), Object.entries(WORLD_SIZES).map(([k, w]) => [k, w.label]), world.opts.world);

function setOpt(key, value) {
  world.opts[key] = value;
  saveOpts();
}
const rebake = () => { bakeBackground(world); paintMinimapBackground(); };
$('opt-floor').addEventListener('change', (e) => { setOpt('floor', e.target.value); rebake(); });
$('opt-water').addEventListener('change', (e) => { setOpt('water', e.target.value); rebake(); });
$('opt-light').addEventListener('change', (e) => setOpt('light', e.target.value));
$('opt-world').addEventListener('change', (e) => {
  if (hasHistory() && !confirm(REGROW_WARNING)) { e.target.value = world.opts.world; return; }
  setOpt('world', e.target.value);
  if (e.target.value === 'auto') world.autoSize = screenWorld();
  regrow();
});

// Regrowing a pond (new habitat or world size) keeps its name and its link.
function regrow() {
  const link = world.link;
  world.expandPx = 0;
  layout(true);
  world.link = link;
  updateLink();
  syncTimer = Math.min(syncTimer, 6);
}

// Switching habitat picks fitting water and floor, then regrows the pond from the same seed.
const hasHistory = () => world.days > 1.3 || ECO.births > 0;
const REGROW_WARNING = 'This regrows the pond from day 1, and its current animals, rares and journal will be lost. ' +
  'To keep them, start a New pond from "Your ponds" instead. Continue?';

function setHabitat(h) {
  if (h !== world.opts.habitat && hasHistory() && !confirm(REGROW_WARNING)) { refreshSpeciesButtons(); return; }
  setOpt('habitat', h);
  const d = HABITAT_DEFAULTS[h];
  setOpt('water', d.water); setOpt('floor', d.floor);
  $('opt-water').value = d.water; $('opt-floor').value = d.floor;
  regrow();
}
for (const b of document.querySelectorAll('[data-hab]')) b.addEventListener('click', () => setHabitat(b.dataset.hab));

// Hard mode: this pond's own (game.hard), and how new ponds start (opts.hard). See ecology.js.
const HARD_ASK = 'Hard mode for this pond: animals can’t be bought or summoned, only drawn in by the habitat you build and plant (and lures). ' +
  'Fewer arrive and fewer breed, and time runs slower. Points count half again. New ponds will start in hard mode too, with fewer animals. Turn it on?';
function setHard(on) {
  if (!world.game || world.observe) { syncHard(); return; }
  if (on && !hardMode(world) && !confirm(HARD_ASK)) { syncHard(); return; }
  if (on) world.game.hard = true; else delete world.game.hard;
  setOpt('hard', on);
  world.gameDirty = true;
  logEvent(world, on ? 'Hard mode: from now on nothing can be bought here; the pond has to draw its own life in' : 'Hard mode is off: animals can be bought again', null, { cat: 'pond', pri: 2 });
  refreshSpeciesButtons();
  updateCounts();
  if (typeof spawnUi !== 'undefined' && spawnUi.kind) renderSpawnCard();
}
function syncHard() {
  const on = hardMode(world);
  $('opt-hard').checked = on;
  $('opt-hard').disabled = !!world.observe;
  $('bar-hard').hidden = !on;
  document.body.classList.toggle('hard', on);
}
$('opt-hard').addEventListener('change', (e) => setHard(e.target.checked));

function bindRange(id, key, fmt) {
  const input = $(id), output = input.nextElementSibling;
  input.value = world.opts[key];
  output.textContent = fmt(world.opts[key]);
  input.addEventListener('input', () => { setOpt(key, +input.value); output.textContent = fmt(+input.value); });
}
bindRange('opt-current', 'current', (v) => `${v}%`);
bindRange('opt-speed', 'speed', (v) => `${v}×`);
bindRange('opt-day', 'dayLength', (v) => `${v / 60}m`);

for (const b of document.querySelectorAll('[data-toggle]')) {
  const key = b.dataset.toggle;
  b.setAttribute('aria-pressed', world.opts[key]);
  b.addEventListener('click', () => { setOpt(key, !world.opts[key]); b.setAttribute('aria-pressed', world.opts[key]); });
}

// Light modes: L (or the sky panel) steps through them.
const LIGHT_ORDER = Object.keys(LIGHTS);
function setLight(mode) {
  setOpt('light', mode);
  $('opt-light').value = mode;
  showTicker(`Light: ${LIGHTS[mode].label}`);
}
const cycleLight = () => setLight(LIGHT_ORDER[(LIGHT_ORDER.indexOf(world.opts.light) + 1) % LIGHT_ORDER.length]);

function setBones(on) { world.bones = on; $('bones').setAttribute('aria-pressed', on); }
function setPaused(on) { world.paused = on; $('pause').setAttribute('aria-pressed', on); }
function setHud(show) {
  hud.classList.toggle('hidden', !show);
  $('show-hud').setAttribute('aria-pressed', show);
  if (show && typeof census !== 'undefined' && census.open) setCensus(false); // (one window down the left at a time)
  if (show && !$('actions').hidden) setActions(false); // (and one big window at a time)
  renderQuickBar();
  placeEdgeTabs();
}

$('bones').addEventListener('click', () => setBones(!world.bones));
$('pause').addEventListener('click', () => setPaused(!world.paused));
$('collapse').addEventListener('click', () => setHud(false));
$('show-hud').addEventListener('click', () => setHud(hud.classList.contains('hidden')));
$('zoom-in').addEventListener('click', () => zoomStep(1));
$('zoom-out').addEventListener('click', () => zoomStep(-1));
zoomLabel.addEventListener('click', resetView);
$('clear').addEventListener('click', () => {
  release();
  for (const c of world.creatures) noteGone(world, c, 'cleared');
  world.creatures = []; world.eggs = []; world.targets = {};
  updateCounts();
});
$('reset').addEventListener('click', () => {
  saveNow(); // the pond you're leaving stays in "Your ponds"
  world.seed = newSeedName();
  world.autoSize = screenWorld(); // a new pond fits the window as it is now
  world.current.base = rand(-PI, PI);
  world.expandPx = 0;
  layout(true);
  saveNow();
  renderPondList();
  syncTimer = 6; // its own link in a few seconds
});
// Share the pond: the link in the address bar, after bringing the server's copy
// up to date. Only without a server (opened from a file, or it's unreachable)
// does it fall back to a long link that carries the pond itself.
async function sharePond() {
  let url = null;
  if (Net.base) {
    try { await pushPond(world); saveNow(); refreshBoard(); url = shortUrl(world.link.id); } catch { /* fall back to the long link */ }
  }
  if (!url) url = `${shareUrl()}#s=${await encodePond(world)}`;
  const note = world.link ? `Link copied: ${url.replace(/^https?:\/\//, '')}, the same as your address bar. It opens your pond as it grows`
    : 'Link copied: the pond server is out of reach, so this long link carries the pond itself';
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Procedural Pond', text: `Come see my pond, ${world.seed}`, url });
    else { await navigator.clipboard.writeText(url); showTicker(note); }
  } catch {
    prompt('Copy this link to share your pond:', url);
  }
}
$('share').addEventListener('click', sharePond);
$('copy-link').addEventListener('click', sharePond);
$('tour').addEventListener('click', () => {
  if (cam.tour) { stopFollow(); return; }
  cam.tour = true; cam.next = 0;
  $('tour').setAttribute('aria-pressed', true);
  updateChip();
});
$('follow-stop').addEventListener('click', stopFollow);
function setSound(on) {
  Sound.setEnabled(on);
  setOpt('sound', on && Sound.on);
  $('sound').setAttribute('aria-pressed', Sound.on);
}
$('sound').addEventListener('click', () => setSound(!Sound.on));
// Browsers only allow audio after a gesture, so a saved "on" resumes at the first interaction.
if (world.opts.sound) addEventListener('pointerdown', () => { if (!Sound.on) setSound(true); }, { once: true });

// Save the whole pond (not just the view), upscaled with hard pixel edges.
$('snapshot').addEventListener('click', () => {
  render(true);
  const k = 3, c = document.createElement('canvas');
  c.width = world.W * k; c.height = world.H * k;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, 0, 0, c.width, c.height);
  const a = document.createElement('a');
  a.download = `pond-${world.seed}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
});

// ---- saving: autosave, your ponds, and the pond link ----------------------------------

let saveTimer = 4, statusTimer = 0, lastSaved = 0, saveFailed = false; // first save soon after load
let syncTimer = 8, boardTimer = 3, syncing = false;
// Search engines and previews render the page too; they don't get ponds of their own.
const IS_BOT = /bot|crawl|spider|slurp|lighthouse|pagespeed|preview|facebookexternalhit/i.test(navigator.userAgent);

// Every pond gets its own short link a few seconds after it opens, and the
// server's copy behind it is kept up to date from then on.
let syncWarned = false;
// Sync at the next chance (a pond renamed, say).
function syncSoon() { syncTimer = Math.min(syncTimer, 2); }
async function syncPond(force = false) {
  if (syncing || world.noSave || !world.raster || !world.game || !Net.base) return false;
  if (!world.link && IS_BOT && !force) return false;
  syncing = true;
  try {
    const had = !!world.link, finds = world.game.finds.length;
    await pushPond(world);
    saveNow();
    if (!had || finds) refreshBoard();
    if (!had) logEvent(world, `This pond's link is ${location.host}/${world.link.id}: the address bar always opens it, as it grows`, null, { cat: 'pond', pri: 1 });
    if (!had && Account.user) claimLocalPonds().then(renderAccount);
    return true;
  } catch (e) {
    if (e && e.status === 403 && world.link && !world.link.key && !syncWarned) {
      syncWarned = true;
      showTicker('This pond is kept in your account: sign in again (Your ponds) to keep it in sync');
    }
    return false;
  } finally {
    syncing = false;
  }
}

async function refreshBoard() {
  try { await fetchBoard(); renderScorePanel(true); } catch { /* offline: the pond carries on */ }
}

function saveNow() {
  if (world.noSave || world.observe || !world.raster) return;
  try {
    storeSave(serializePond(world));
    lastSaved = Date.now();
    saveFailed = false;
  } catch {
    saveFailed = true;
  }
  updateLink();
  updateSaveStatus();
  if ($('ponds').open) renderPondList();
}

const ago = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

function updateSaveStatus() {
  const el = $('save-status');
  if (world.observe) { el.textContent = 'look only'; el.title = "Someone else's pond: nothing here is saved or changed"; return; }
  el.textContent = saveFailed ? "can't save here" : lastSaved ? `saved ${ago(Date.now() - lastSaved)}` : 'saving…';
  el.title = saveFailed
    ? 'This browser is not letting the pond save (private browsing, or storage is full). Export keeps a copy as a file.'
    : 'Your pond saves itself in this browser. Export copies it to a file.';
}

// Switch to another saved pond (a page load, so everything starts clean).
function openPond(s) {
  if (s.seed !== world.seed) saveNow();
  world.noSave = true; // don't let the page-hide save overwrite what we're opening
  location.assign(s.link && HOME === '/' ? `/${s.link}` : `${HOME}?pond=${encodeURIComponent(s.seed)}`);
}

function renderPondList() {
  const list = listSaves().filter((s) => s.seed !== world.seed);
  const here = {
    seed: world.seed, habitat: world.opts.habitat, days: world.days, current: true, points: world.game.points, link: world.link && world.link.id,
    animals: world.creatures.filter((c) => c.life).length, rares: world.creatures.filter((c) => c.life && c.life.traits.length).length,
  };
  const local = new Set([here, ...list].map((s) => s.link).filter(Boolean));
  const kept = Account.ponds.filter((p) => !local.has(p.id)).map((p) => ({
    seed: p.id, habitat: p.habitat, days: p.days || 0, animals: p.animals || 0, rares: 0, depth: p.depth, savedAt: p.updated, link: p.id, remote: true,
  }));
  renderAccount();
  $('pond-list').replaceChildren(...[here, ...list, ...kept].map((s) => {
    const li = document.createElement('li'), open = document.createElement('button'), name = document.createElement('b'), meta = document.createElement('span');
    li.className = s.current ? 'pond-item current' : 'pond-item';
    open.type = 'button';
    open.className = 'pond-open';
    name.textContent = s.seed;
    meta.textContent = [HABITATS[s.habitat] || '', `day ${Math.floor(s.days) + 1}`, `${s.animals} animals`, s.rares && `✦ ${s.rares}`,
      `${(s.current ? pondFathoms(world) : s.depth || 1).toLocaleString()} fathoms`, s.current ? 'open now' : ago(Date.now() - s.savedAt),
      s.remote ? 'in your account (not in this browser yet)' : s.link && accountPond(s.link) ? 'kept in your account' : ''].filter(Boolean).join(' · ');
    if (s.remote) li.classList.add('remote');
    if (s.link) open.title = `pond.nz/${s.link}`;
    open.append(name, meta);
    open.title = s.current ? 'The pond you are watching' : `Open ${s.seed}`;
    if (s.current && s.link) open.title = `The pond you are watching · ${location.host || 'pond.nz'}/${s.link}`;
    if (s.remote) open.addEventListener('click', () => { saveNow(); world.noSave = true; location.assign(`/${s.link}`); });
    else if (!s.current) open.addEventListener('click', () => openPond(s));
    li.append(open);
    if (!s.current && !s.remote) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon';
      del.textContent = '×';
      del.setAttribute('aria-label', `Delete ${s.seed}`);
      del.title = 'Delete this pond';
      del.addEventListener('click', () => {
        if (!confirm(`Delete the pond "${s.seed}"? Its animals and journal will be gone for good.`)) return;
        deleteSave(s.seed);
        renderPondList();
      });
      li.append(del);
    }
    return li;
  }));
}

$('ponds').addEventListener('toggle', () => { if ($('ponds').open) renderPondList(); });

// The address bar always holds this pond's link, the same one Share copies: the
// short link (/amber-heron-moss-lantern) once the pond has one, and for the few
// seconds before that just its name and settings (?pond=misty-reed-42). Opened
// from a file there is no server, so there the whole pond rides in the #fragment.
let linkBusy = false;
async function updateLink() {
  if (linkBusy || world.noSave || !world.raster) return;
  if (HOME === '/') {
    const want = world.link ? `/${world.link.id}` : `/${new URL(shareUrl()).search}`;
    if (location.pathname + location.search !== want || (location.hash && location.hash !== '#bones')) {
      history.replaceState(null, '', want + (location.hash === '#bones' ? '#bones' : ''));
    }
    return;
  }
  linkBusy = true;
  try {
    const code = await encodePond(world);
    history.replaceState(null, '', `${HOME}${new URL(shareUrl()).search}#s=${code}`);
  } catch {
    /* keep the previous link */
  } finally {
    linkBusy = false;
  }
}

addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { saveNow(); syncPond(); } });
addEventListener('pagehide', saveNow);

const PAN_KEYS = { arrowleft: [1, 0], arrowright: [-1, 0], arrowup: [0, 1], arrowdown: [0, -1], a: [1, 0], d: [-1, 0], w: [0, 1], s: [0, -1] };
addEventListener('keydown', (e) => {
  if (e.target.closest && (e.target.closest('select, input') || (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')))) return;
  const pan = PAN_KEYS[e.key.toLowerCase()];
  if (pan && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    stopFollow();
    view.reach = viewAtEnds();
    view.tx += pan[0] * 80; view.ty += pan[1] * 80;
    applyView();
    view.reach = { west: false, east: false };
    checkCross();
    return;
  }
  if (e.key === 'b' || e.key === 'B') setBones(!world.bones);
  else if (e.key === ' ') { e.preventDefault(); setPaused(!world.paused); }
  else if (e.key === 'h' || e.key === 'H') setHud(hud.classList.contains('hidden'));
  else if (e.key === 'l' || e.key === 'L') cycleLight();
  else if (e.key === '+' || e.key === '=') zoomStep(1);
  else if (e.key === '-' || e.key === '_') zoomStep(-1);
  else if (e.key === '0') resetView();
  else if (e.key === 'f' || e.key === 'F') { if (world.hover) follow(world.hover); else stopFollow(); }
  else if (e.key === 't' || e.key === 'T') $('tour').click();
  else if (e.key === 'm' || e.key === 'M') $('sound').click();
  else if (e.key === 'p' || e.key === 'P') setScore(!scoreUi.open);
  else if (e.key === 'Escape') { stopFollow(); $('nb-ask').hidden = true; if (world.tool !== 'pointer') setTool('pointer'); }
});

addEventListener('resize', () => applyView());

function syncControls() {
  $('opt-floor').value = FLOOR_ALIASES[world.opts.floor] || world.opts.floor;
  $('opt-water').value = world.opts.water;
  $('opt-world').value = world.opts.world;
  $('opt-light').value = world.opts.light;
}

// Which pond opens:
//  - a short link (/amber-heron-moss-lantern) or a long pond link (#s=...):
//    that pond. If it's your own pond, the newer copy wins; if you already have
//    a different pond with that name, you're asked first. Anyone else's pond
//    becomes your own copy, with its own score.
//  - ?pond=<name> you have saved: yours. One you don't have starts on day 1.
//  - no link: the pond you last had open, or a brand-new one.
async function boot() {
  setTool('pointer');
  initHud();
  const meP = Net.base ? fetchMe() : Promise.resolve(Account); // (who's signed in, if anyone)
  const code = (/(?:^#|&)s=([A-Za-z0-9._-]+)/.exec(location.hash) || [])[1];
  const pathId = HOME === '/' && SHORT_ID.test(location.pathname.slice(1)) ? location.pathname.slice(1) : null;
  let linked = code ? await decodePond(code) : null, shortId = null, resume = null, adopt = false;
  const params = new URLSearchParams(location.search), edge = params.get('edge');
  let observe = null;
  if (pathId && params.get('observe') === '1') {
    // Walking the shared beach: someone else's pond, to look at only.
    const got = await fetchPond(pathId);
    let home = null;
    try { home = JSON.parse(sessionStorage.getItem('pond.home') || 'null'); } catch { /* none */ }
    if (got && !(home && home.id === pathId)) {
      resume = got.save;
      observe = { id: pathId, updated: got.updated, home: home || { path: '/', id: null }, homeId: home && home.id, seed: got.save.seed, by: (got.meta && got.meta.by) || null, title: (got.meta && got.meta.title) || null };
    }
  }
  if (observe) { /* nothing more to decide */ } else if (!linked && pathId) {
    // Your own pond's link opens your save straight away; anyone else's comes from the server.
    const own = listSaves().find((s) => s.link === pathId), mine = own && loadSave(own.seed);
    if (mine && mine.link && mine.link.id === pathId) resume = await newerFromAccount(mine, meP);
    else {
      const got = await fetchPond(pathId);
      if (got && got.mine) {
        // Yours, kept in your account (from another browser): your own pond here too, not a copy.
        resume = { ...got.save, link: { id: pathId, key: null } };
      } else if (got && got.meta && got.meta.lock) {
        // Its owner lets visitors look only: watch it, don't take a copy.
        resume = got.save;
        observe = { id: pathId, updated: got.updated, home: { path: '/', id: null }, homeId: null, seed: got.save.seed, locked: true, by: got.meta.by || null, title: got.meta.title || null };
        history.replaceState(null, '', `/${pathId}?observe=1`);
      } else if (got) { linked = got.save; shortId = pathId; }
    }
  }
  if (linked) {
    const mine = loadSave(linked.seed);
    if (mine && ((shortId && mine.link && mine.link.id === shortId) || mine.inst === linked.inst)) {
      // Your own pond: the copy that has lived longer, keeping your link, score and family trees.
      resume = mine.days >= linked.days - 0.001 ? mine : {
        ...linked, link: mine.link, lineage: linked.lineage && linked.lineage.length ? linked.lineage : mine.lineage,
        game: { ...(mine.game || {}), ...(linked.game && linked.game.points >= ((mine.game && mine.game.points) || 0) ? linked.game : {}) },
      };
    } else if (mine && !confirm(`This link opens the pond "${linked.seed}" on day ${Math.floor(linked.days) + 1}. ` +
        `You already have a different pond by that name here (day ${Math.floor(mine.days) + 1}). Open the link's version? Yours will be replaced.`)) {
      resume = mine;
    } else {
      resume = linked;
      adopt = true; // someone else's pond becomes your own copy
    }
  } else if (resume) {
    // your own short link, found above
  } else if (urlSeed) {
    resume = await newerFromAccount(loadSave(urlSeed), meP);
  } else {
    const last = listSaves()[0];
    resume = last ? await newerFromAccount(loadSave(last.seed), meP) : null;
  }
  world.resume = resume;
  world.linkAdopt = adopt;
  world.observe = observe;
  if (observe) observe.save = resume; // (kept, so the pond can be walked back into after you leave it)
  if (observe) { world.noSave = true; document.body.classList.add('observing'); }
  world.seed = resume ? resume.seed : urlSeed || newSeedName();
  if (resume) {
    Object.assign(world.opts, resume.opts);
    // The size before deepening; the deep bands are added back by worldDims.
    world.shoreSide = resume.shoreSide;
    world.expandPx = resume.expandPx || 0;
    world.autoSize = (resume.base || resume.size).slice();
  }
  syncControls();
  layout(true);
  world.linkAdopt = false;
  if (edge === 'west' || edge === 'east') startAtEdge(edge);
  if (observe) {
    $('observe-name').textContent = `${observe.title || observe.id}${observe.by ? ` · ${observe.by}'s pond` : ''}`;
    $('observe-bar').hidden = false;
    logEvent(world, `You walked along the beach into ${observe.id}, someone else's pond. Look around; nothing here is yours to touch`, null, { cat: 'pond', pri: 2 });
  }
  setTimeout(refreshNeighbours, observe ? 500 : 4000);
  if (code && !linked) showTicker("That pond link couldn't be read, so this is its pond from day 1");
  if (pathId && !linked && !(world.link && world.link.id === pathId)) {
    showTicker(`No pond called ${pathId} was found (links left unused for a long while are cleared), so here is yours`);
  }
  // The menu opens by itself (at Your ponds) only the very first time; after that ☰ opens it.
  let firstVisit = false;
  try { firstVisit = !localStorage.getItem('pond.visited'); localStorage.setItem('pond.visited', '1'); } catch { /* storage unavailable */ }
  if (innerWidth < 600 || !firstVisit || observe) setHud(false); else $('ponds').open = true;
  if (typeof saveReset !== 'undefined' && saveReset && !observe) logEvent(world, '✦ A fresh start: every pond was reset, so the ones this browser kept are gone. This one is new', null, { cat: 'pond', pri: 3 });
  // A word about signing in, once the pond has had a little while (and not again for a few days if put off).
  setTimeout(() => { if (typeof maybeNudgeSignIn === 'function') maybeNudgeSignIn(); }, firstVisit ? 90000 : 20000);
  if (location.hash === '#bones') setBones(true);
  if (observe) { /* keep the address: it names the pond you're looking at */ } else if (HOME === '/') updateLink(); else history.replaceState(null, '', `${HOME}${new URL(shareUrl()).search}`);
  syncTimer = world.link ? 30 : adopt ? 2 : 8; // a pond without a link gets one in a few seconds
  requestAnimationFrame(frame);
  // Back from signing in (or not); either way, your ponds go into your account.
  const login = params.get('login');
  meP.then(async () => {
    renderAccount();
    if (!Account.user) { if (login === 'failed') showTicker("Couldn't sign in with Discord just now. Try again in a moment"); return; }
    const n = await claimLocalPonds();
    renderAccount();
    if (login === 'ok') showTicker(`Signed in as ${Account.user.name}${n ? `: ${n === 1 ? 'your pond is' : `${n} ponds are`} kept in your account now` : ''}`);
  });
}

boot();
