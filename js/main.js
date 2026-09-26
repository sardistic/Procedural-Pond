'use strict';

const canvas = document.getElementById('pond');
const ctx = canvas.getContext('2d');

const OPTS_KEY = 'procedural-pond.opts';
const DEFAULT_OPTS = {
  v: 4, world: 'auto', habitat: 'mixed', floor: 'sand', water: 'teal', light: 'cycle', dayLength: 180,
  current: 25, speed: 1, caustics: true, shadows: true, outlines: true, life: true, weather: true, sound: false,
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
  grab: null, bones: false, paused: false, tool: 'feed',
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
  const lum = (tint[0] + tint[1] + tint[2]) / 3;
  return { tint: lum > 0.995 ? null : tint, darkness: clamp((0.92 - lum) / 0.48, 0, 1), caustics: lum > 0.8 && rain < 0.3 };
}

let image, out;

// (Re)create the world buffers. The world only changes size when the World
// option changes; window resizes just move the view.
function layout(regen) {
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
  mini.style.height = `${mini.height}px`;
  if (regen) buildPond();
  bakeBackground(world);
  paintMinimapBackground();
  resetView();
}

function openSpot() {
  const { W, H } = world;
  for (let i = 0; i < 20; i++) {
    const x = rand(W * 0.08, W * 0.92), y = rand(H * 0.08, H * 0.92);
    if (!world.rocks.some((r) => Math.hypot(r.x - x, r.y - y) < Math.max(r.a, r.b) + 8)) return [x, y];
  }
  return [W / 2, H / 2];
}

function spawn(kind, x, y, how = 'founder') {
  if (world.creatures.length >= world.maxPop + 60) return false;
  if (x === undefined) [x, y] = openSpot();
  const group = SPECIES[kind].spawn(world, x, y);
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
  if (world.creatures.length >= world.maxPop + 60) { showTicker('The pond is full: no room for more'); return false; }
  if (!spendEssence(world, price)) { notEnough(price, 'essence'); return false; }
  const [x, y] = openSpot();
  const group = SPECIES[kind].spawn(world, x, y);
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
    logEvent(world, `✦ The pond has deepened: ${world.silentRestore}`, null, { cat: 'rare', pri: 3 });
    world.silentRestore = null;
  } else if (resume) {
    const animals = world.creatures.length, rares = world.creatures.filter((c) => c.life && c.life.traits.length).length;
    const summary = `day ${Math.floor(world.days) + 1}, ${animals} animals${rares ? `, ${rares} rare` : ''}`;
    if (world.linkAdopt) {
      // Someone else's pond becomes your own copy, with its own score and link.
      world.inst = newInst();
      world.game = newGame();
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
    if (m < min || Math.random() > 0.05) continue;
    const group = arrive(world, kind);
    if (!group) continue;
    world.targets[kind] = have + group.length;
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
    // Only pioneers at first (and fewer of them); the rest wait for the pond to mature.
    if (world.succession && (SUCCESSION[kind] ?? 0.3) > 0) { if (count) world.succession.want[kind] = count; continue; }
    for (let i = 0; i < Math.ceil(count * (world.succession ? 0.6 : 1)); i++) spawn(kind);
  }
}

// ---- simulation & render ------------------------------------------------------

function update(dt) {
  world.t += dt;
  const cur = world.current;
  cur.s = world.opts.current / 100 * (1 + Math.max(0, world.weather.gust) * 0.8 + world.weather.rain * 0.4);
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
  updateQuirks(world, dt);
  updateBalance(world, dt);
  updateVertical(world, dt);
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
  world.glints = world.glints.filter((g) => (g.t += dt) < 0.35);
  const [x0, y0, x1, y1] = visibleRect();
  // Sunlight by day; a little moonlight on bright nights.
  const moon = world.moon ? world.moon.illum : 0;
  const k = ((1 - world.darkness) + world.darkness * moon * 0.35) * (1 - world.weather.rain) * (world.opts.caustics ? 1 : 0.4);
  let n = (x1 - x0) * (y1 - y0) * 0.000007 * k * dt * 60;
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
    out[p] = g.t > 0.07 && g.t < 0.28 ? GLINT : GLINT_SOFT;
    if (g.star && g.t > 0.1 && g.t < 0.24) { out[p - 1] = out[p + 1] = out[p - W] = out[p + W] = GLINT_SOFT; }
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

function render(full = false) {
  const r = world.raster, t = world.t, o = world.opts;
  const light = world.light || (world.light = lighting());
  const rect = full ? [0, 0, world.W - 1, world.H - 1] : visibleRect();
  // Rasterize a margin above/left of the view: shadows of things just off-screen still land on it.
  r.setClip(rect[0] - 30, rect[1] - 30, rect[2] + 3, rect[3] + 3);
  r.begin();
  for (const p of world.plants) drawGrown(r, p, t);
  for (const s of world.structures) { if (s.anim) drawBuildAnim(r, s, t); else if (DRAW[s.kind]) DRAW[s.kind](r, s, t, world); }
  drawRiver(r, world, t);
  for (const l of world.litter) l.draw(r, t, world);
  for (const rm of world.remains) rm.draw(r, t);
  for (const f of world.fossils) f.draw(r, t);
  for (const p of world.pads) drawGrown(r, p, t);
  for (const f of world.food) f.draw(r, t, world);
  let anyThick = false;
  for (const c of world.creatures) {
    const a = c.alpha ?? 1;
    r.alpha = a;
    FADE[c.id] = a < 1 ? 1 : 0;
    if (THICK[c.id]) anyThick = true;
    c.draw(r, t, world);
    if (c.life && c.life.genome.eld) drawEldritch(r, c, t, world);
    if (c.life) drawQuirks(r, c, t);
  }
  r.alpha = 1;
  for (const e of world.eggs) e.draw(r, t);
  world.motes.draw(r, world);
  r.castShadows = false;
  for (const e of world.effects) e.draw(r, t);
  r.castShadows = true;
  r.alpha = 1;
  // Refraction: rows and columns of the floor shift by a pixel as the surface moves.
  const water = WATERS[o.water] || WATERS.teal, wob = world.wob;
  const amp = water.wobble * (1 + Math.max(0, world.weather.gust) * 0.5 + world.tide.surf * 0.3);
  for (let y = rect[1]; y <= rect[3]; y++) wob.x[y] = Math.round(Math.sin(y * 0.19 + t * 1.9) * amp * (0.55 + 0.45 * Math.sin(t * 0.4 + y * 0.013)));
  for (let x = rect[0]; x <= rect[2]; x++) wob.y[x] = Math.round(Math.sin(x * 0.15 + t * 1.6) * amp * (0.55 + 0.45 * Math.sin(t * 0.35 + x * 0.011)));
  // A bloom turns the water green (a red tide, red); wind and surf raise a swell, bigger over the deep.
  const bloom = world.blight && world.blight.k === 'bloom', hab = world.opts.habitat;
  const fogColor = bloom ? mixColor(world.waterColor, BLOOM_TINT[hab] || BLOOM_TINT.mixed, 0.45) : world.waterColor;
  const swell = clamp(0.3 + world.tide.surf * 0.35 + Math.max(0, world.weather.gust) * 0.45 + world.weather.rain * 0.15, 0, 1.2) * (hab === 'fresh' ? 0.7 : 1);
  r.compose(out, {
    bg: world.bg, bgLight: world.bgLight, caustic: world.caustic, t,
    outline: OUTLINE, emissive: EMISSIVE, fade: FADE, thick: THICK, anyThick, tint: light.tint,
    caustics: o.caustics && light.caustics, causticT: water.caustic, shadows: o.shadows, outlines: o.outlines,
    fog: { color: fogColor, amount: water.fog + (bloom ? 0.12 : 0) }, wob,
    shore: world.shore, bgDry: world.bgDry, tide: world.tide.level, surf: world.tide.surf, wave: world.tide.wave,
    depth: world.depth, deepColor: DEEP_COLOR[world.opts.habitat] || DEEP_COLOR.mixed,
    voidSkin: world.eldMarks && world.eldMarks.length || world.plants.some((p) => p.tr && p.tr.eld) ? VOID_SKIN : null,
    swell, swellDir: world.shore ? world.shoreN : [0.8, 0.6], clouds: world.clouds, sky: skyReflection(light), skyK: 1 - world.weather.rain * 0.7,
    lights: buildLights(world, rect), lightVis: light.darkness || 0, deepColor2: deepTint(world), trench: world.trench, trenchGlow: TRENCH_GLOW[branchOf(world)],
    chop: clamp(0.18 + Math.max(0, world.weather.gust) * 0.9 + world.tide.surf * 0.35, 0, 1.2), spindrift: clamp((swell - 0.75) * 2.5, 0, 1),
  }, rect);
  drawGlints();
  if (world.bones) drawBones();
  if (full || world.bones) ctx.putImageData(image, 0, 0);
  else ctx.putImageData(image, 0, 0, rect[0], rect[1], rect[2] - rect[0] + 1, rect[3] - rect[1] + 1);
  updateSkyHud(light);
}

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
  if (scaled) r.setScale(p.x, p.y, Math.max(0.1, g), p.make === 'lily' || p.make === 'duckweed' ? 1 : Math.max(0.1, g)); // floating plants stay at the surface
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
  if (!world.paused) update(dt * world.opts.speed);
  updateCamera(dt);
  updateGlide(dt);
  render();
  updateCard(dt);
  Sound.update(world, world.paused ? 0 : dt, visibleRect(), view.k);
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
  feed: { label: 'Pellets', food: 'pellet', price: 0, hint: 'click to feed (free) · drag animals · scroll to zoom · drag water to pan' },
  spirulina: { label: 'Spirulina', food: 'spirulina', price: FOOD_PRICE.spirulina, hint: 'spirulina keeps animals well fed 5× longer: they age slower and stay' },
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
  rock: {
    label: 'Rock', price: PLANT_PRICE.rock, likedBy: 'rock',
    place: (x, y) => { const rk = makeRock(x, y, rand(5, 10)); rk.born = world.days; world.rocks.push(rk); bakeBackground(world); paintMinimapBackground(); },
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
  const add = Math.round((axisX ? W0 : H0) * frac), [sx, sy] = deepShifts(world.shoreSide) ? (axisX ? [add, 0] : [0, add]) : [0, 0];
  const cx = (innerWidth / 2 - view.tx) / view.k + sx, cy = (innerHeight / 2 - view.ty) / view.k + sy;
  const d = serializePond(world);
  shiftSave(d, sx, sy);
  world.expandPx = (world.expandPx || 0) + add;
  d.expandPx = world.expandPx;
  d.size = axisX ? [world.W + add, world.H] : [world.W, world.H + add];
  world.resume = d;
  world.silentRestore = why;
  const follow = cam.follow;
  layout();
  centerOn(cx, cy);
  if (follow) stopFollow();
  saveNow();
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
    } else if (Math.random() < dt * 10) addBubbles(world, s.x + rand(-R, R) * 0.6, s.y + rand(-R, R) * 0.6, 1, 1);
    if (A.t >= A.dur) {
      delete s.anim;
      // It settles: a ring of silt and bubbles, and it's part of the floor now.
      for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; addBubbles(world, s.x + Math.cos(a) * R, s.y + Math.sin(a) * R, 1, 1); }
      addRipple(world, s.x, s.y, s.kind === 'ship' || s.kind === 'island' ? 3 : 1.5);
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
  const def = STRUCTURES[kind], why = canPlace(world, kind, x, y), deep = kind === 'island' ? depthAt(world, x, y) : 0;
  if (why) { showTicker(`Can't build a ${def.label.toLowerCase()} here: ${why}`); return; }
  // An island out over the deep needs far more raised to reach the surface (and stands as a cliff).
  const k = kind === 'island' ? islandDeepCost(deep) : 1, pearls = Math.round(def.pearls * k), essence = Math.round(def.essence * k);
  if (world.game.pearls < pearls) { notEnough(pearls, 'pearls'); return; }
  if ((world.game.essence || 0) < essence) { notEnough(essence, 'essence'); return; }
  if (def.corruption && (world.game.corruption || 0) < def.corruption) { notEnough(def.corruption, 'corruption'); return; }
  if (def.corruption) spendCorruption(world, def.corruption);
  spend(world, pearls);
  spendEssence(world, essence);
  floatAward(x, y, `−${pearls}`, 'spend');
  const made = makeStructure(kind, world, x, y);
  if (kind === 'island') made.deep = Math.round(deep * 100) / 100;
  startBuildAnim(made); // it arrives in its own way, then settles into the floor
  world.structures.push(made);
  if (kind === 'hatchery' && !world.hatchery) world.hatchery = newHatchery();
  logEvent(world, `You built ${withArticle(def.label.toLowerCase())}${k > 1.05 ? ` out over the deep (×${k.toFixed(1)})` : ''}: ${def.desc}`, null, { cat: 'pond', pri: 2 });
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
  if (tool.build) { build(tool.build, x, y); return; }
  if (tool.food && world.food.filter((f) => f.fed).length >= 120) return;
  if (!tool.place && !tool.food) return;
  if (tool.deepMin && depthAt(world, x, y) < tool.deepMin) { showTicker(`${tool.label} only grows in deep water`); return; }
  if (!spend(world, price)) { notEnough(price); return; }
  if (price) floatAward(x, y, `−${price}`, 'spend');
  if (tool.place) tool.place(x, y);
  else {
    const spread = tool.spread || 3;
    for (let i = tool.n || (tool.food === 'pellet' ? 4 : 3); i > 0; i--) world.food.push(new Food(x + rand(-spread, spread), y + rand(-spread, spread), 40, tool.food));
    addRipple(world, x, y, 1);
  }
}

function creatureAt(x, y) {
  let best = null;
  for (const c of world.creatures) if (c.hit(x, y) && (!best || c.z > best.z)) best = c;
  return best;
}

function removeAt(x, y) {
  const li = litterAt(world, x, y);
  if (li) { haulLitter(world, li); return; }
  const c = creatureAt(x, y);
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

const view = { k: 3, tx: 0, ty: 0, r: 0, free: false };
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
// Never zoom out past the point where the pond covers the whole window: no empty
// border, and wheel/pinch gestures always land on the pond.
const coverK = () => { const [w, h] = view.r % 2 ? [world.H, world.W] : [world.W, world.H]; return Math.max(1, Math.ceil(Math.min(16, Math.max(innerWidth / w, innerHeight / h)) - 1e-6)); };
const defaultK = () => coverK() + 1; // one step in, so the pond carries on past the edges

// (Walking the beach keeps the zoom you walked in with, even where a pond is narrower than the screen.)
const minK = () => (view.minK ? Math.min(view.minK, coverK()) : coverK());
function applyView() {
  if (view.k < minK()) view.k = minK();
  const [w, h] = screenSize(), ax = beachAxisX();
  // (While you walk along the beach, the camera may run on past the end, into the next pond.)
  const freeX = view.free && ax, freeY = view.free && !ax;
  view.tx = freeX ? Math.round(view.tx) : w <= innerWidth ? Math.round((innerWidth - w) / 2) : Math.round(clamp(view.tx, innerWidth - w, 0));
  view.ty = freeY ? Math.round(view.ty) : h <= innerHeight ? Math.round((innerHeight - h) / 2) : Math.round(clamp(view.ty, innerHeight - h, 0));
  canvas.style.transform = canvasTransform(view.tx, view.ty, view.k, view.r, world.W, world.H);
  zoomLabel.textContent = `${view.k}×`;
  if (typeof placeBeyond === 'function') placeBeyond();
}

function zoomTo(k, cx = innerWidth / 2, cy = innerHeight / 2) {
  const nk = clamp(Math.round(k), minK(), 16), [wx, wy] = screenToWorld(cx, cy);
  view.k = nk;
  const [sx, sy] = worldToScreen(wx, wy);
  view.tx += cx - sx; view.ty += cy - sy;
  applyView();
}

const zoomStep = (dir, cx, cy) => zoomTo(view.k + dir, cx, cy);

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
    press = { cx: e.clientX, cy: e.clientY, tx: view.tx, ty: view.ty, x, y, panning: false, over: 0, ends: viewAtEnds() };
    return;
  }
  if (world.tool === 'net') { removeAt(x, y); return; }
  const c = creatureAt(x, y);
  if (c) {
    world.grab = c;
    c.grabbed = true;
    canvas.style.cursor = 'grabbing';
    tap = { x: e.clientX, y: e.clientY, t: performance.now(), c };
  } else {
    press = { cx: e.clientX, cy: e.clientY, tx: view.tx, ty: view.ty, x, y, panning: false, over: 0, ends: viewAtEnds() };
    // A long press opens the card of whatever is there (plants too).
    press.longT = setTimeout(() => { if (press && !press.panning) press.done = openThingAt(x, y); }, 550);
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

canvas.addEventListener('pointermove', (e) => {
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
      const wx = press.tx + dx, wy = press.ty + dy, ax = beachAxisX();
      view.glide = null; view.free = false;
      view.tx = wx; view.ty = wy; applyView();
      // Past the end of the beach: the next pond along (see neighbours). Only when the
      // view was already at that end when the drag began, so ordinary panning never counts;
      // once what's beyond is drawn, the camera walks on into it.
      const over = ax ? wx - view.tx : wy - view.ty, side = over > 0 ? 'west' : 'east';
      press.over = over && press.ends[side] ? over : 0;
      if (press.over && BEACH[side] && BEACH[side].snap) { view.free = true; if (ax) view.tx = wx; else view.ty = wy; applyView(); }
      else if (press.over && BEACH[side]) ensureBeyond(side);
      edgePull(press.over);
    }
    return;
  }
  if (world.grab) return;
  const over = creatureAt(world.pointer.x, world.pointer.y);
  world.hover = over;
  hoverAt = [e.clientX, e.clientY];
  canvas.style.cursor = world.tool === 'net' ? (over ? 'pointer' : 'crosshair') : over ? 'grab' : world.tool === 'feed' ? 'crosshair' : 'copy';
});

let tap = null;
function pointerEnd(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  if (press) clearTimeout(press.longT);
  // Let go more than about halfway across and you're there; sooner, and you spring back.
  if (press && press.panning && view.free) { if (!(Math.abs(press.over) >= crossNeeded() && crossTo(press.over > 0 ? 'west' : 'east'))) glideToRest(); }
  edgePull(0);
  if (press && press.done) press = null; // a long press opened a card
  if (press && !press.panning && e.type === 'pointerup') {
    // Clicking the hatchery opens it (with any tool but the Net); feeding over
    // another structure tells you about it.
    const st = world.tool !== 'net' && structureAt(world, press.x, press.y);
    const rm = world.tool !== 'net' && remainsAt(world, press.x, press.y), fo = world.tool !== 'net' && fossilAt(world, press.x, press.y);
    const li = litterAt(world, press.x, press.y);
    if (world.observe) { /* someone else's pond: look only */ }
    else if (li) haulLitter(world, li);
    else if (fo) collectFossil(world, fo);
    else if (rm) collectRemains(world, rm);
    else if (st && st.kind === 'hatchery') setHatchery(true);
    else if (st && world.tool === 'feed') showObject(st);
    else useTool(press.x, press.y);
  }
  // A quick click on an animal (not a drag) opens its card.
  if (tap && e.type === 'pointerup' && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6 && performance.now() - tap.t < 350 && tap.c.life) showCreature(tap.c);
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
  const k = view.k, e = Math.min(1, dt * 3);
  cam.fx += (innerWidth / 2 - c.x * k - cam.fx) * e;
  cam.fy += (innerHeight / 2 - c.y * k - cam.fy) * e;
  view.tx = cam.fx; view.ty = cam.fy;
  applyView();
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
const MINI_LAYERS = [['map', 'Map'], ['tension', 'Tension: red is aggressive water'], ['water', 'Water: green fresh, blue salt']];
let miniLayer = 0, miniKey = '', miniCell = null, miniWet = null, miniDry = null;
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
          dry.push(bgDry && shore && shore[p] ? bgDry[p] : bg[p]);
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
const crossNeeded = () => Math.max(300, 0.45 * (beachAxisX() ? innerWidth : innerHeight));
const edgePullNeeded = crossNeeded;
// Whether the view is already at either end of the beach.
function viewAtEnds() {
  const ax = beachAxisX(), [w, h] = screenSize();
  return ax ? { west: view.tx >= -1, east: view.tx <= innerWidth - w + 1 } : { west: view.ty >= -1, east: view.ty <= innerHeight - h + 1 };
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
      bg: pw.bg, bgLight: pw.bgLight, caustic: world.caustic, t, outline: OUTLINE, emissive: EMISSIVE, fade: FADE, thick: THICK, anyThick: false, tint: light.tint,
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
  const leaving = { id: world.observe ? world.observe.id : homeInfo.id, home: !world.observe, back: true, snap: captureSnap(), info: { depth: pondFathoms(world), habitat: world.opts.habitat } };
  const d = B.home ? loadSave(homeInfo.seed) : B.save;
  if (!d) return false;
  hideCreature(); hideObject(); closeSpawnCard(); setHatchery(false); setEvo(false);
  world.observe = B.home ? null : { id: B.id, updated: B.updated || Date.now(), home: homeInfo, homeId: homeInfo.id, dir: side };
  world.noSave = !B.home;
  document.body.classList.toggle('observing', !B.home);
  Object.assign(world.opts, d.opts);
  world.seed = d.seed; world.shoreSide = d.shoreSide; world.expandPx = d.expandPx || 0; world.autoSize = (d.base || d.size).slice();
  world.resume = d;
  world.quietRestore = true;
  view.r = B.snap.r;
  layout(true);
  world.quietRestore = false;
  // Exactly where its picture was, at the same zoom, then settle into it.
  view.minK = k;
  view.k = k; view.tx = bx; view.ty = by; view.free = true;
  applyView();
  BEACH[other] = leaving;
  BEACH[side] = null;
  glideToRest();
  if (B.home) {
    homeInfo = null;
    $('observe-bar').hidden = true;
    updateLink();
    logEvent(world, 'You walked back along the beach, home to your own pond', null, { cat: 'pond', pri: 1 });
  } else {
    $('observe-name').textContent = B.id;
    $('observe-bar').hidden = false;
    history.replaceState(null, '', `/${B.id}?observe=1`);
    logEvent(world, `You walked along the beach into ${B.id}, someone else's pond. Look around; nothing here is yours to touch`, null, { cat: 'pond', pri: 2 });
  }
  NB.at = 0; // look up what's beyond this one
  refreshNeighbours();
  return true;
}

// The camera settles back inside the pond (after a short pull, or after crossing).
function glideToRest() {
  const f = view.free, tx = view.tx, ty = view.ty;
  view.free = false; applyView();
  const to = [view.tx, view.ty];
  view.tx = tx; view.ty = ty; view.free = f || true;
  applyView();
  view.glide = to;
}
function updateGlide(dt) {
  const g = view.glide;
  if (!g) return;
  // (At least a pixel a frame: the view is kept to whole pixels, so a smaller step would stall.)
  const a = Math.min(1, dt * 8), step = (v, to) => (Math.abs(to - v) <= 1 ? to : v + Math.sign(to - v) * Math.max(1, Math.abs(to - v) * a));
  view.tx = step(view.tx, g[0]); view.ty = step(view.ty, g[1]);
  if (view.tx === g[0] && view.ty === g[1]) { view.glide = null; view.free = false; }
  applyView();
}

// The tab at each end of the beach, naming the pond beyond.
function edgeHints() {
  const ax = beachAxisX(), ends = viewAtEnds();
  for (const dir of ['west', 'east']) {
    const el = $(`edge-${dir}`), B = BEACH[dir];
    el.hidden = !B;
    if (!B) continue;
    el.classList.toggle('vertical', !ax);
    const info = B.info || {};
    el.querySelector('b').textContent = B.home ? 'your pond' : B.id;
    el.querySelector('span').textContent = B.home ? 'drag on past the end to walk home' : `${(info.depth || 1).toLocaleString()} fm · ${HABITATS[info.habitat] || ''} · drag on past the end to walk over`;
    el.classList.toggle('near', ends[dir]);
    if (ends[dir]) ensureBeyond(dir); // near the end: draw what's beyond it
  }
  placeEdgeTabs();
}
// Keep the tabs clear of the menu: beside it when the beach runs across the screen, below it when it runs up and down.
function placeEdgeTabs() {
  const h = $('hud'), hr = h.classList.contains('hidden') ? null : h.getBoundingClientRect();
  for (const dir of ['west', 'east']) {
    const el = $(`edge-${dir}`);
    el.style.left = el.style.top = el.style.bottom = '';
    if (el.hidden || !hr || !hr.width) continue;
    const r = el.getBoundingClientRect();
    if (r.right < hr.left || r.left > hr.right || r.bottom < hr.top || r.top > hr.bottom) continue;
    if (el.classList.contains('vertical')) { el.style.top = `${Math.round(hr.bottom + 8)}px`; el.style.bottom = 'auto'; }
    else el.style.left = `${Math.round(hr.right + 10)}px`;
  }
}
if (typeof ResizeObserver === 'function') new ResizeObserver(() => placeEdgeTabs()).observe(document.getElementById('hud'));

function edgePull(over) {
  const dir = over > 0 ? 'west' : 'east';
  for (const d of ['west', 'east']) {
    const el = $(`edge-${d}`);
    const k = d === dir && BEACH[d] ? clamp(Math.abs(over) / crossNeeded(), 0, 1) : 0;
    el.style.setProperty('--pull', k.toFixed(2));
    el.classList.toggle('pulling', k > 0.05);
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
  await ensureBeyond(dir);
  crossTo(dir);
});
document.getElementById('nb-stay').addEventListener('click', () => { document.getElementById('nb-ask').hidden = true; });
for (const d of ['west', 'east']) document.getElementById(`edge-${d}`).addEventListener('click', () => askNeighbour(d));

document.getElementById('observe-home').addEventListener('click', () => goHome());
function goHome() {
  const side = ['west', 'east'].find((s) => BEACH[s] && BEACH[s].home && BEACH[s].snap);
  if (side && crossTo(side)) return;
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
  if (!got || !(got.updated > world.observe.updated + 120000) || view.free) return;
  world.observe.updated = got.updated;
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
  traits.textContent = [d.traits.length && `✦ ${TIERS[d.tier]}: ${d.traits.join(' · ')}`, d.carries.length && `carries ${d.carries.join(', ')}`].filter(Boolean).join('  ·  ');
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
  for (const b of [...$('tools').children, ...$('builds').children]) b.setAttribute('aria-pressed', b.dataset.tool === name);
  $('hint').textContent = t.hint || [`click to place ${t.label.toLowerCase()} (${t.price} pearls)`, t.likedBy && likedByText(t.likedBy)].filter(Boolean).join(' · ');
}
for (const [name, t] of Object.entries(TOOLS)) {
  const b = button(t.label);
  b.dataset.tool = name;
  if (t.price != null) {
    b.append(Object.assign(document.createElement('b'), { className: t.price ? 'price' : 'price free', textContent: t.price ? t.price : 'free' }));
    b.title = t.price ? `${t.label}: ${t.price} pearls${t.essence ? ` and ${t.essence} essence` : ''}` : `${t.label}: free`;
  }
  if (t.essence) b.append(Object.assign(document.createElement('b'), { className: 'price ess', textContent: fmtShort(t.essence) }));
  if (t.corruption) b.append(Object.assign(document.createElement('b'), { className: 'price cor', textContent: fmtShort(t.corruption) }));
  if (t.build) b.title += ` · ${STRUCTURES[t.build].desc}`;
  b.addEventListener('click', () => setTool(name));
  $(t.build ? 'builds' : 'tools').append(b);
}

// Only offer animals and plants that live in this habitat.
function refreshSpeciesButtons() {
  // Deep species show once their zone exists and they're unlocked on the evolution tree.
  for (const b of document.querySelectorAll('[data-spawn]')) {
    const k = b.dataset.spawn;
    b.hidden = !fitsHabitat(world, SPECIES_HABITAT[k]) || !deepAvailable(world, k) || !deepUnlocked(world, k);
  }
  // Builds, foods and plants of the deep show once the pond is that deep.
  const tier = (world.erosion && world.erosion.tier) || 0;
  for (const b of $('builds').children) { const d = STRUCTURES[TOOLS[b.dataset.tool].build]; b.hidden = (!!d.habitat && !fitsHabitat(world, d.habitat)) || (d.tier || 0) > tier; }
  for (const b of $('tools').children) {
    const t = TOOLS[b.dataset.tool], salt = ['anemone', 'coral', 'urchin'].includes(b.dataset.tool), fresh = ['marimo', 'duckweed', 'lily'].includes(b.dataset.tool);
    b.hidden = (salt && !fitsHabitat(world, 'salt')) || (fresh && !fitsHabitat(world, 'fresh')) || (!!t.habitat && !fitsHabitat(world, t.habitat)) || (t.tier || 0) > tier;
  }
  for (const b of document.querySelectorAll('[data-hab]')) {
    b.setAttribute('aria-pressed', b.dataset.hab === world.opts.habitat);
    const D = DIFFICULTY[b.dataset.hab];
    b.title = `${HABITATS[b.dataset.hab]} water: ${D.label.toLowerCase()} (${D.note}). Points ×${D.points}.`;
  }
  if (MINI_LAYERS[miniLayer][0] === 'water' && world.opts.habitat !== 'mixed') setMiniLayer(0);
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
function setHud(show) { hud.classList.toggle('hidden', !show); $('show-hud').hidden = show; placeEdgeTabs(); }

$('bones').addEventListener('click', () => setBones(!world.bones));
$('pause').addEventListener('click', () => setPaused(!world.paused));
$('collapse').addEventListener('click', () => setHud(false));
$('show-hud').addEventListener('click', () => setHud(true));
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
    return true;
  } catch {
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
  $('pond-list').replaceChildren(...[here, ...list].map((s) => {
    const li = document.createElement('li'), open = document.createElement('button'), name = document.createElement('b'), meta = document.createElement('span');
    li.className = s.current ? 'pond-item current' : 'pond-item';
    open.type = 'button';
    open.className = 'pond-open';
    name.textContent = s.seed;
    meta.textContent = [HABITATS[s.habitat] || '', `day ${Math.floor(s.days) + 1}`, `${s.animals} animals`, s.rares && `✦ ${s.rares}`,
      `${(s.current ? pondFathoms(world) : s.depth || 1).toLocaleString()} fathoms`, s.current ? 'open now' : ago(Date.now() - s.savedAt)].filter(Boolean).join(' · ');
    if (s.link) open.title = `pond.nz/${s.link}`;
    open.append(name, meta);
    open.title = s.current ? 'The pond you are watching' : `Open ${s.seed}`;
    if (s.current && s.link) open.title = `The pond you are watching · ${location.host || 'pond.nz'}/${s.link}`;
    if (!s.current) open.addEventListener('click', () => openPond(s));
    li.append(open);
    if (!s.current) {
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
    view.tx += pan[0] * 80; view.ty += pan[1] * 80;
    applyView();
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
  else if (e.key === 'Escape') { stopFollow(); $('nb-ask').hidden = true; }
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
  setTool('feed');
  initHud();
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
      observe = { id: pathId, updated: got.updated, home: home || { path: '/', id: null }, homeId: home && home.id, seed: got.save.seed };
    }
  }
  if (observe) { /* nothing more to decide */ } else if (!linked && pathId) {
    // Your own pond's link opens your save straight away; anyone else's comes from the server.
    const own = listSaves().find((s) => s.link === pathId), mine = own && loadSave(own.seed);
    if (mine && mine.link && mine.link.id === pathId) resume = mine;
    else {
      const got = await fetchPond(pathId);
      if (got) { linked = got.save; shortId = pathId; }
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
    resume = loadSave(urlSeed);
  } else {
    const last = listSaves()[0];
    resume = last ? loadSave(last.seed) : null;
  }
  world.resume = resume;
  world.linkAdopt = adopt;
  world.observe = observe;
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
    $('observe-name').textContent = observe.id;
    $('observe-bar').hidden = false;
    logEvent(world, `You walked along the beach into ${observe.id}, someone else's pond. Look around; nothing here is yours to touch`, null, { cat: 'pond', pri: 2 });
  }
  setTimeout(refreshNeighbours, observe ? 500 : 4000);
  if (code && !linked) showTicker("That pond link couldn't be read, so this is its pond from day 1");
  if (pathId && !linked && !(world.link && world.link.id === pathId)) {
    showTicker(`No pond called ${pathId} was found (links left unused for a long while are cleared), so here is yours`);
  }
  if (innerWidth < 600) setHud(false); // on phones the pond comes first; ☰ opens the panel
  if (location.hash === '#bones') setBones(true);
  if (observe) { /* keep the address: it names the pond you're looking at */ } else if (HOME === '/') updateLink(); else history.replaceState(null, '', `${HOME}${new URL(shareUrl()).search}`);
  syncTimer = world.link ? 30 : adopt ? 2 : 8; // a pond without a link gets one in a few seconds
  requestAnimationFrame(frame);
}

boot();
