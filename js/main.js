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
  caustic: makeCausticTile(),
  creatures: [], plants: [], pads: [], food: [], rocks: [], pebbles: [],
  effects: [], eggs: [], swarms: [], targets: {}, journal: [], journalDirty: false, seed: '', maxPop: 200,
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
const worldDims = () => (WORLD_SIZES[world.opts.world] || WORLD_SIZES.auto).size || world.autoSize;


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
  world.maxPop = Math.round(W * H / 2400);
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
function buyAnimal(kind, enh = []) {
  const price = spawnPrice(kind, enh);
  if (world.creatures.length >= world.maxPop + 60) { showTicker('The pond is full: no room for more'); return false; }
  if (!spendEssence(world, price)) { notEnough(price, 'essence'); return false; }
  const [x, y] = openSpot();
  const group = SPECIES[kind].spawn(world, x, y);
  const p = settleChance(world, kind, enh.includes('hardy') ? ENHANCE.hardy.settle : 0);
  let failed = 0;
  for (const c of group) {
    initLife(c, { alpha: 0 });
    applyEnhancements(c, enh);
    noteBorn(world, c, 'bought');
    if (Math.random() >= p) { c.unsettled = 3; failed++; }
  }
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
function recycle(c) {
  if (!alive(c)) return 0;
  const back = recycleValue(c), tier = c.life ? tierOf(c.life.traits) : 0;
  world.creatures.splice(world.creatures.indexOf(c), 1);
  noteGone(world, c, 'recycled');
  if (world.targets[c.species]) world.targets[c.species]--;
  addRipple(world, c.x, c.y, 0.8);
  if (back) gainEssence(world, back, 'recycling', c);
  if (c.life) {
    logEvent(world, `Recycled ${who(c)}: +${back} essence${tier >= 2 ? ` (${TIERS[tier]})` : ''}`, null, {
      cat: 'pond', pri: tier >= 2 ? 2 : 0, key: 'recycle', data: back,
      merge: (e) => `Recycled ${e.n} animals: +${e.data.reduce((a, b) => a + b, 0)} essence`,
    });
  }
  if (cam.follow === c) stopFollow();
  updateCounts();
  return back;
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
    creatures: [], food: [], eggs: [], effects: [], swarms: [], targets: {}, journal: [], glints: [],
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
    withSeed(`${world.seed}/${world.opts.habitat}`, () => {
      generateScenery(world);
      populate();
      world.moon0 = Math.random();
      world.tide0 = Math.random();
    });
  }
  updateSky(world, 0);
  initZones(world);
  $('seed-name').textContent = world.seed;
  const m = moonInfo(world.days, world.moon0);
  if (resume) {
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
    for (let i = 0; i < count; i++) spawn(kind);
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
  updateZones(world, dt);
  updateGame(world, dt);
  for (const c of world.creatures) c.update(dt, world);
  if (world.creatures.some((c) => c.gone || c.caught)) {
    if (world.grab && (world.grab.gone || world.grab.caught)) release();
    world.creatures = world.creatures.filter((c) => !c.gone && !c.caught);
  }
  for (const p of world.plants) p.update(dt, world);
  for (const p of world.pads) p.update(dt, world);
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
  const k = view.k, W = world.W, H = world.H;
  return [
    clamp(Math.floor(-view.tx / k), 0, W - 1), clamp(Math.floor(-view.ty / k), 0, H - 1),
    clamp(Math.ceil((innerWidth - view.tx) / k), 0, W - 1), clamp(Math.ceil((innerHeight - view.ty) / k), 0, H - 1),
  ];
}

function render(full = false) {
  const r = world.raster, t = world.t, o = world.opts;
  const light = world.light || (world.light = lighting());
  const rect = full ? [0, 0, world.W - 1, world.H - 1] : visibleRect();
  // Rasterize a margin above/left of the view: shadows of things just off-screen still land on it.
  r.setClip(rect[0] - 30, rect[1] - 30, rect[2] + 3, rect[3] + 3);
  r.begin();
  for (const p of world.plants) p.draw(r, t, world);
  for (const p of world.pads) p.draw(r, t, world);
  for (const f of world.food) f.draw(r, t, world);
  let anyThick = false;
  for (const c of world.creatures) {
    const a = c.alpha ?? 1;
    r.alpha = a;
    FADE[c.id] = a < 1 ? 1 : 0;
    if (THICK[c.id]) anyThick = true;
    c.draw(r, t, world);
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
  r.compose(out, {
    bg: world.bg, bgLight: world.bgLight, caustic: world.caustic, t,
    outline: OUTLINE, emissive: EMISSIVE, fade: FADE, thick: THICK, anyThick, tint: light.tint,
    caustics: o.caustics && light.caustics, causticT: water.caustic, shadows: o.shadows, outlines: o.outlines,
    fog: { color: world.waterColor, amount: water.fog }, wob,
    shore: world.shore, bgDry: world.bgDry, tide: world.tide.level, surf: world.tide.surf, wave: world.tide.wave,
  }, rect);
  drawGlints();
  if (world.bones) drawBones();
  if (full || world.bones) ctx.putImageData(image, 0, 0);
  else ctx.putImageData(image, 0, 0, rect[0], rect[1], rect[2] - rect[0] + 1, rect[3] - rect[1] + 1);
  updateSkyHud(light);
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

let last = performance.now(), mapTimer = 0;
function frame(now) {
  // The first rAF timestamp can predate the load-time performance.now(); never step backwards.
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (!world.paused) update(dt * world.opts.speed);
  updateCamera(dt);
  render();
  updateCard(dt);
  Sound.update(world, world.paused ? 0 : dt);
  hudTick(dt);
  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = 15; saveNow(); }
  syncTimer -= dt;
  if (syncTimer <= 0) { syncTimer = 90; syncPond(); }
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
  place: (x, y) => world[list].push(makePlant(kind, world, x, y)),
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
  rock: {
    label: 'Rock', price: PLANT_PRICE.rock, likedBy: 'rock',
    place: (x, y) => { world.rocks.push(makeRock(x, y, rand(5, 10))); bakeBackground(world); paintMinimapBackground(); },
  },
};

// Which animals are happier near a plant or rock, for the tool's hint.
function likedByText(kind) {
  const who = Object.entries(LIKES).filter(([k, l]) => l.includes(kind) && k !== 'tadpole' && SPECIES[k] && fitsHabitat(world, SPECIES_HABITAT[k])).map(([k]) => SINGULAR[k].toLowerCase());
  return who.length ? `liked by ${who.slice(0, 4).join(', ')}${who.length > 4 ? '…' : ''}` : '';
}

function useTool(x, y) {
  const tool = TOOLS[world.tool], price = tool.price || 0;
  if (tool.food && world.food.filter((f) => f.fed).length >= 90) return;
  if (!tool.place && !tool.food) return;
  if (!spend(world, price)) { notEnough(price); return; }
  if (price) floatAward(x, y, `−${price}`, 'spend');
  if (tool.place) tool.place(x, y);
  else {
    for (let i = tool.food === 'pellet' ? 4 : 3; i > 0; i--) world.food.push(new Food(x + rand(-3, 3), y + rand(-3, 3), 40, tool.food));
    addRipple(world, x, y, 1);
  }
}

function creatureAt(x, y) {
  let best = null;
  for (const c of world.creatures) if (c.hit(x, y) && (!best || c.z > best.z)) best = c;
  return best;
}

function removeAt(x, y) {
  const c = creatureAt(x, y);
  if (c) { recycle(c); return; }
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

const view = { k: 3, tx: 0, ty: 0 };
const zoomLabel = document.getElementById('zoom-level');
// Never zoom out past the point where the pond covers the whole window: no empty
// border, and wheel/pinch gestures always land on the pond.
const coverK = () => Math.max(1, Math.ceil(Math.min(16, Math.max(innerWidth / world.W, innerHeight / world.H)) - 1e-6));
const defaultK = () => coverK() + 1; // one step in, so the pond carries on past the edges

function applyView() {
  if (view.k < coverK()) view.k = coverK();
  const w = world.W * view.k, h = world.H * view.k;
  view.tx = w <= innerWidth ? Math.round((innerWidth - w) / 2) : Math.round(clamp(view.tx, innerWidth - w, 0));
  view.ty = h <= innerHeight ? Math.round((innerHeight - h) / 2) : Math.round(clamp(view.ty, innerHeight - h, 0));
  canvas.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`;
  zoomLabel.textContent = `${view.k}×`;
}

function zoomTo(k, cx = innerWidth / 2, cy = innerHeight / 2) {
  const nk = clamp(Math.round(k), coverK(), 16);
  view.tx = cx - (cx - view.tx) * (nk / view.k);
  view.ty = cy - (cy - view.ty) * (nk / view.k);
  view.k = nk;
  applyView();
}

const zoomStep = (dir, cx, cy) => zoomTo(view.k + dir, cx, cy);

function centerOn(x, y) {
  view.tx = innerWidth / 2 - x * view.k;
  view.ty = innerHeight / 2 - y * view.k;
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
  const rect = canvas.getBoundingClientRect();
  world.pointer.x = (e.clientX - rect.left) / rect.width * world.W;
  world.pointer.y = (e.clientY - rect.top) / rect.height * world.H;
  world.pointer.inside = true;
}

function release() {
  if (world.grab) world.grab.grabbed = false;
  world.grab = null;
  canvas.style.cursor = 'crosshair';
}

canvas.addEventListener('pointerdown', (e) => {
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
  if (world.tool === 'net') { removeAt(x, y); return; }
  const c = creatureAt(x, y);
  if (c) {
    world.grab = c;
    c.grabbed = true;
    canvas.style.cursor = 'grabbing';
    tap = { x: e.clientX, y: e.clientY, t: performance.now(), c };
  } else {
    press = { cx: e.clientX, cy: e.clientY, tx: view.tx, ty: view.ty, x, y, panning: false };
  }
});

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
    if (press.panning) { view.tx = press.tx + dx; view.ty = press.ty + dy; applyView(); }
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
  if (press && !press.panning && e.type === 'pointerup') useTool(press.x, press.y);
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
function paintMinimapBackground() {
  const mw = mini.width, mh = mini.height, { W, H, bg, bgDry, shore } = world, water = world.waterColor;
  miniCell = new Int32Array(mw * mh); miniWet = new Uint32Array(mw * mh); miniDry = new Uint32Array(mw * mh);
  const avg = (cs) => {
    let r = 0, g = 0, b = 0;
    for (const c of cs) { r += c & 255; g += (c >> 8) & 255; b += (c >>> 16) & 255; }
    const n = cs.length;
    return (0xff000000 | (Math.round(b / n) << 16) | (Math.round(g / n) << 8) | Math.round(r / n)) >>> 0;
  };
  for (let j = 0, k = 0; j < mh; j++) {
    for (let i = 0; i < mw; i++, k++) {
      const wet = [], dry = [];
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const p = Math.min(W - 1, Math.floor((i + (sx + 0.5) / 3) / mw * W)) + Math.min(H - 1, Math.floor((j + (sy + 0.5) / 3) / mh * H)) * W;
          wet.push(bg[p]);
          dry.push(bgDry && shore && shore[p] ? bgDry[p] : bg[p]);
        }
      }
      miniCell[k] = Math.min(W - 1, Math.floor((i + 0.5) / mw * W)) + Math.min(H - 1, Math.floor((j + 0.5) / mh * H)) * W;
      miniWet[k] = mixColor(avg(wet), water, 0.45);
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
  const mw = mini.width, mh = mini.height, img = new ImageData(mw, mh), px = new Uint32Array(img.data.buffer);
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
  const mw = mini.width, mh = mini.height, sx = mw / world.W, sy = mh / world.H;
  refreshMinimapBackground();
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
}

function miniJump(e) {
  const r = mini.getBoundingClientRect();
  stopFollow();
  centerOn((e.clientX - r.left) / r.width * world.W, (e.clientY - r.top) / r.height * world.H);
  drawMinimap();
}
mini.addEventListener('pointerdown', (e) => { mini.setPointerCapture(e.pointerId); miniJump(e); });
mini.addEventListener('pointermove', (e) => { if (e.buttons) miniJump(e); });
document.getElementById('map-layer').addEventListener('click', () => {
  const layers = MINI_LAYERS.filter(([k]) => k !== 'water' || world.opts.habitat === 'mixed');
  setMiniLayer(layers.indexOf(MINI_LAYERS[miniLayer]) + 1);
});

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
  for (const b of $('tools').children) b.setAttribute('aria-pressed', b.dataset.tool === name);
  $('hint').textContent = t.hint || [`click to place ${t.label.toLowerCase()} (${t.price} pearls)`, t.likedBy && likedByText(t.likedBy)].filter(Boolean).join(' · ');
}
for (const [name, t] of Object.entries(TOOLS)) {
  const b = button(t.label);
  b.dataset.tool = name;
  if (t.price != null) {
    b.append(Object.assign(document.createElement('b'), { className: t.price ? 'price' : 'price free', textContent: t.price ? t.price : 'free' }));
    b.title = t.price ? `${t.label}: ${t.price} pearls` : `${t.label}: free`;
  }
  b.addEventListener('click', () => setTool(name));
  $('tools').append(b);
}

// Only offer animals and plants that live in this habitat.
function refreshSpeciesButtons() {
  for (const b of document.querySelectorAll('[data-spawn]')) b.hidden = !fitsHabitat(world, SPECIES_HABITAT[b.dataset.spawn]);
  for (const b of $('tools').children) {
    const salt = ['anemone', 'coral', 'urchin'].includes(b.dataset.tool), fresh = ['marimo', 'duckweed', 'lily'].includes(b.dataset.tool);
    b.hidden = (salt && !fitsHabitat(world, 'salt')) || (fresh && !fitsHabitat(world, 'fresh'));
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
function setHud(show) { hud.classList.toggle('hidden', !show); $('show-hud').hidden = show; }

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
  if (world.noSave || !world.raster) return;
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
      s.points && `★ ${s.points.toLocaleString()}`, s.current ? 'open now' : ago(Date.now() - s.savedAt)].filter(Boolean).join(' · ');
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
  else if (e.key === 'Escape') stopFollow();
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
  if (!linked && pathId) {
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
  world.seed = resume ? resume.seed : urlSeed || newSeedName();
  if (resume) {
    Object.assign(world.opts, resume.opts);
    world.autoSize = resume.size.slice();
  }
  syncControls();
  layout(true);
  world.linkAdopt = false;
  if (code && !linked) showTicker("That pond link couldn't be read, so this is its pond from day 1");
  if (pathId && !linked && !(world.link && world.link.id === pathId)) {
    showTicker(`No pond called ${pathId} was found (links left unused for a long while are cleared), so here is yours`);
  }
  if (innerWidth < 600) setHud(false); // on phones the pond comes first; ☰ opens the panel
  if (location.hash === '#bones') setBones(true);
  if (HOME === '/') updateLink(); else history.replaceState(null, '', `${HOME}${new URL(shareUrl()).search}`);
  syncTimer = world.link ? 30 : adopt ? 2 : 8; // a pond without a link gets one in a few seconds
  requestAnimationFrame(frame);
}

boot();
