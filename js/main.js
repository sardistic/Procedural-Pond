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
const NIGHT = [0.28, 0.38, 0.66];
const LIGHTS = {
  cycle: { label: 'Day/night cycle' },
  day: { label: 'Always day', tint: [1, 1, 1] },
  dusk: { label: 'Always dusk', tint: [1.0, 0.72, 0.6] },
  night: { label: 'Always night', tint: NIGHT },
};
// Tint keyframes over one day; 0 = midnight, 0.5 = noon.
const CYCLE = [
  [0, NIGHT], [0.2, NIGHT], [0.26, [0.62, 0.5, 0.72]], [0.3, [0.95, 0.72, 0.7]], [0.36, [1, 0.95, 0.9]],
  [0.42, [1, 1, 1]], [0.62, [1, 1, 1]], [0.69, [1, 0.78, 0.58]], [0.74, [0.9, 0.55, 0.55]],
  [0.78, [0.55, 0.42, 0.66]], [0.83, NIGHT], [1, NIGHT],
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
  W: 0, H: 0, t: 0, clock: 0.4, darkness: 0, light: null, // start mid-morning
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
world.seed = (params.get('pond') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || newSeedName();

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
  const o = world.opts;
  let tint = (LIGHTS[o.light] || LIGHTS.cycle).tint;
  if (!tint) {
    const c = world.clock;
    let i = 0;
    while (i < CYCLE.length - 2 && CYCLE[i + 1][0] <= c) i++;
    const [t0, a] = CYCLE[i], [t1, b] = CYCLE[i + 1], k = clamp((c - t0) / (t1 - t0), 0, 1);
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

function spawn(kind, x, y) {
  if (world.creatures.length >= world.maxPop + 60) return;
  if (x === undefined) [x, y] = openSpot();
  const group = SPECIES[kind].spawn(world, x, y);
  for (const c of group) initLife(c, { alpha: 0 });
  world.creatures.push(...group);
  world.targets[kind] = (world.targets[kind] || 0) + group.length;
  updateCounts();
}

// Scenery and starting animals come from the seed (and habitat), so a shared
// link reproduces the same pond. Everything after that is free-running.
function buildPond() {
  release();
  stopFollow();
  Object.assign(world, { creatures: [], food: [], eggs: [], effects: [], swarms: [], targets: {}, journal: [], glints: [] });
  Object.assign(ECO, { births: 0, arrivals: 0, departures: 0, eaten: 0, rares: 0 });
  WILD_SPECIES.length = 0;
  withSeed(`${world.seed}/${world.opts.habitat}`, () => { generateScenery(world); populate(); });
  $('seed-name').textContent = world.seed;
  const kind = { fresh: 'freshwater pond', salt: 'saltwater pond', mixed: 'pond' }[world.opts.habitat];
  logEvent(world, `You found a ${kind} called ${world.seed}`);
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
  const before = world.clock;
  if (world.opts.light === 'cycle') world.clock = (world.clock + dt / world.opts.dayLength) % 1;
  const crossed = (mark) => (before < mark && world.clock >= mark) || (world.clock < before && (mark > before || mark <= world.clock));
  if (crossed(0.27)) logEvent(world, 'Dawn breaks over the pond');
  else if (crossed(0.5)) logEvent(world, 'The sun is high: midday');
  else if (crossed(0.77)) logEvent(world, 'Dusk settles and the fireflies come out');
  world.light = lighting();
  world.darkness = world.light.darkness;
  updateFireflies(dt);
  updateLife(world, dt);
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

// Fireflies drift in after dark and fly off at dawn.
function updateFireflies(dt) {
  const target = world.darkness > 0.55 ? Math.round(world.W * world.H / 9000) + 4 : 0;
  const flies = world.creatures.filter((c) => c.species === 'firefly' && !c.leaving);
  if (flies.length < target && Math.random() < dt * 3) {
    const f = new Firefly(world, rand(10, world.W - 10), rand(10, world.H - 10));
    f.alpha = 0;
    world.creatures.push(f);
  }
  else if (flies.length > target && Math.random() < dt * 3) flies[0].leaving = true;
  if (world.creatures.some((c) => c.gone)) world.creatures = world.creatures.filter((c) => !c.gone);
}

// Sun glints: brief sparkles on the surface in daylight.
const GLINT = hexToInt('#f6fcff'), GLINT_SOFT = hexToInt('#cfe6ee');
function updateGlints(dt) {
  world.glints = world.glints.filter((g) => (g.t += dt) < 0.35);
  const [x0, y0, x1, y1] = visibleRect();
  const k = (1 - world.darkness) * (1 - world.weather.rain) * (world.opts.caustics ? 1 : 0.4);
  let n = (x1 - x0) * (y1 - y0) * 0.000007 * k * dt * 60;
  while (Math.random() < n) { world.glints.push({ x: randi(x0 + 1, x1 - 1), y: randi(y0 + 1, y1 - 1), t: 0, star: Math.random() < 0.25 }); n--; }
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
  world.motes.draw(r);
  r.castShadows = false;
  for (const e of world.effects) e.draw(r, t);
  r.castShadows = true;
  r.alpha = 1;
  // Refraction: rows and columns of the floor shift by a pixel as the surface moves.
  const water = WATERS[o.water] || WATERS.teal, wob = world.wob, amp = water.wobble * (1 + Math.max(0, world.weather.gust) * 0.5);
  for (let y = rect[1]; y <= rect[3]; y++) wob.x[y] = Math.round(Math.sin(y * 0.19 + t * 1.9) * amp * (0.55 + 0.45 * Math.sin(t * 0.4 + y * 0.013)));
  for (let x = rect[0]; x <= rect[2]; x++) wob.y[x] = Math.round(Math.sin(x * 0.15 + t * 1.6) * amp * (0.55 + 0.45 * Math.sin(t * 0.35 + x * 0.011)));
  r.compose(out, {
    bg: world.bg, bgLight: world.bgLight, caustic: world.caustic, t,
    outline: OUTLINE, emissive: EMISSIVE, fade: FADE, thick: THICK, anyThick, tint: light.tint,
    caustics: o.caustics && light.caustics, causticT: water.caustic, shadows: o.shadows, outlines: o.outlines,
    fog: { color: world.waterColor, amount: water.fog }, wob,
  }, rect);
  drawGlints();
  if (world.bones) drawBones();
  if (full || world.bones) ctx.putImageData(image, 0, 0);
  else ctx.putImageData(image, 0, 0, rect[0], rect[1], rect[2] - rect[0] + 1, rect[3] - rect[1] + 1);
  updateClock(light);
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

let last = performance.now(), countTimer = 0, mapTimer = 0;
function frame(now) {
  // The first rAF timestamp can predate the load-time performance.now(); never step backwards.
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (!world.paused) update(dt * world.opts.speed);
  updateCamera(dt);
  render();
  updateCard(dt);
  Sound.update(world, world.paused ? 0 : dt);
  countTimer -= dt;
  if (countTimer <= 0) { countTimer = 0.5; updateCounts(); renderJournal(); }
  mapTimer -= dt;
  if (mapTimer <= 0) { mapTimer = 0.12; drawMinimap(); }
  requestAnimationFrame(frame);
}

// ---- tools --------------------------------------------------------------------

const TOOLS = {
  feed: { label: 'Feed', hint: 'click to feed · drag animals · scroll to zoom · drag water to pan' },
  net: { label: 'Net', hint: 'click an animal, plant or rock to remove it' },
  weed: { label: 'Weed', place: (x, y) => world.plants.push(new Weed(x, y)) },
  eelgrass: { label: 'Eelgrass', place: (x, y) => world.plants.push(new Eelgrass(x, y)) },
  anemone: { label: 'Anemone', place: (x, y) => world.plants.push(new Anemone(x, y)) },
  coral: { label: 'Coral', place: (x, y) => world.plants.push(new Coral(x, y)) },
  urchin: { label: 'Urchin', place: (x, y) => world.plants.push(new Urchin(x, y)) },
  marimo: { label: 'Marimo', place: (x, y) => world.plants.push(new Marimo(x, y)) },
  duckweed: { label: 'Duckweed', place: (x, y) => world.plants.push(new Duckweed(x, y)) },
  lily: { label: 'Lily pad', place: (x, y) => world.pads.push(new LilyPad(world, x, y)) },
  rock: { label: 'Rock', place: (x, y) => { world.rocks.push(makeRock(x, y, rand(5, 10))); bakeBackground(world); paintMinimapBackground(); } },
};

function useTool(x, y) {
  const tool = TOOLS[world.tool];
  if (tool.place) tool.place(x, y);
  else if (world.food.filter((f) => f.kind === 'pellet').length < 90) {
    for (let i = 0; i < 4; i++) world.food.push(new Food(x + rand(-3, 3), y + rand(-3, 3)));
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
  if (c) {
    world.creatures.splice(world.creatures.indexOf(c), 1);
    if (world.targets[c.species]) world.targets[c.species]--;
    addRipple(world, c.x, c.y, 0.8);
    updateCounts();
    return;
  }
  for (const list of [world.pads, world.plants]) {
    const i = list.findLastIndex((p) => p.hit(x, y));
    if (i >= 0) { list[i].dead = true; list.splice(i, 1); return; }
  }
  const ri = world.rocks.findIndex((r) => Math.hypot(r.x - x, r.y - y) < Math.max(r.a, r.b));
  if (ri >= 0) { world.rocks.splice(ri, 1); bakeBackground(world); paintMinimapBackground(); }
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

function pointerEnd(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  if (press && !press.panning && e.type === 'pointerup') useTool(press.x, press.y);
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
  updateChip();
}

function stopFollow() {
  cam.follow = null;
  cam.tour = false;
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

function paintMinimapBackground() {
  const src = document.createElement('canvas');
  src.width = world.W; src.height = world.H;
  src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(world.bg.buffer.slice(0)), world.W, world.H), 0, 0);
  miniBg.width = mini.width; miniBg.height = mini.height;
  const g = miniBg.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(src, 0, 0, miniBg.width, miniBg.height);
  g.globalAlpha = 0.45;
  g.fillStyle = `#${[world.waterColor & 255, (world.waterColor >> 8) & 255, (world.waterColor >>> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  g.fillRect(0, 0, miniBg.width, miniBg.height);
  g.globalAlpha = 1;
}

function drawMinimap() {
  const mw = mini.width, mh = mini.height, sx = mw / world.W, sy = mh / world.H;
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

// ---- HUD ----------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const hud = $('hud');

function button(label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  return b;
}

for (const [kind, s] of Object.entries(SPECIES)) {
  const b = button('');
  b.dataset.spawn = kind;
  b.title = `Add ${s.label.toLowerCase()}`;
  b.innerHTML = `<i style="--c:${s.color}"></i><span>${s.label}</span><b>0</b>`;
  b.addEventListener('click', () => spawn(kind));
  $('animals').append(b);
}

function updateCounts() {
  const n = {};
  for (const c of world.creatures) n[c.species] = (n[c.species] || 0) + 1;
  for (const btn of document.querySelectorAll('[data-spawn]')) btn.querySelector('b').textContent = n[btn.dataset.spawn] || 0;
  // Wild species seen in the pond right now.
  const wild = new Map();
  for (const c of world.creatures) if (c.species === 'wild') wild.set(c.sp, (wild.get(c.sp) || 0) + 1);
  $('wildlist').innerHTML = [...wild].map(([sp, k]) => `<li><i style="--c:${sp.color}"></i>${sp.name}<b>${k}</b></li>`).join('');
  $('wildcount').textContent = WILD_SPECIES.length ? `${WILD_SPECIES.length} discovered` : '';
  const rares = world.creatures.filter((c) => c.life && c.life.traits.length).length;
  $('stats').textContent = `born ${ECO.births} · arrived ${ECO.arrivals} · left ${ECO.departures} · eaten ${ECO.eaten} · rares here ${rares}`;
}

// Journal: newest first; entries about an animal that is still around can be clicked to follow it.
const clockLabel = (c) => `${String(Math.floor(c * 24)).padStart(2, '0')}:${String(Math.floor((c * 24 % 1) * 60)).padStart(2, '0')}`;
let lastTicked = null, tickerTimer = 0;
function renderJournal() {
  if (world.journal[0] && world.journal[0] !== lastTicked) {
    lastTicked = world.journal[0];
    showTicker(lastTicked.text);
  }
  if (!world.journalDirty) return;
  world.journalDirty = false;
  const list = $('journal');
  list.replaceChildren(...world.journal.slice(0, 40).map((e) => {
    const li = document.createElement('li'), time = document.createElement('time');
    time.textContent = clockLabel(e.clock);
    li.append(time, document.createTextNode(e.text));
    if (e.subject) {
      li.classList.add('link');
      li.title = 'Follow';
      li.addEventListener('click', () => { if (alive(e.subject)) follow(e.subject); else showTicker('They are no longer in the pond'); });
    }
    return li;
  }));
}

function showTicker(text) {
  const t = $('ticker');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(tickerTimer);
  tickerTimer = setTimeout(() => t.classList.remove('show'), 6000);
}

function shareUrl() {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
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
  card.querySelector('.traits').textContent = [d.traits.length && `✦ ${d.traits.join(' · ')}`, d.carries.length && `carries ${d.carries.join(', ')}`].filter(Boolean).join('  ·  ');
  card.querySelector('.meta').textContent = [d.stage, d.gen != null && `gen ${d.gen}`, age].filter(Boolean).join(' · ');
  card.querySelector('.mood').textContent = d.mood;
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
  for (const b of $('tools').children) b.setAttribute('aria-pressed', b.dataset.tool === name);
  $('hint').textContent = TOOLS[name].hint || `click to place ${TOOLS[name].label.toLowerCase()} · drag to pan`;
}
for (const [name, t] of Object.entries(TOOLS)) {
  const b = button(t.label);
  b.dataset.tool = name;
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
  for (const b of document.querySelectorAll('[data-hab]')) b.setAttribute('aria-pressed', b.dataset.hab === world.opts.habitat);
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
  setOpt('world', e.target.value);
  if (e.target.value === 'auto') world.autoSize = screenWorld();
  layout(true);
  history.replaceState(null, '', new URL(shareUrl()).search);
});

// Switching habitat picks fitting water and floor, then regrows the pond from the same seed.
function setHabitat(h) {
  setOpt('habitat', h);
  const d = HABITAT_DEFAULTS[h];
  setOpt('water', d.water); setOpt('floor', d.floor);
  $('opt-water').value = d.water; $('opt-floor').value = d.floor;
  const u = new URL(shareUrl());
  history.replaceState(null, '', u.search);
  layout(true);
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

// The clock shows the time of day; clicking it steps through the light modes.
const clockBtn = $('clock');
const LIGHT_ORDER = Object.keys(LIGHTS);
let clockText = '';
function updateClock(light) {
  const o = world.opts, c = world.clock;
  const icon = light.darkness > 0.6 ? '☾' : light.tint ? '◐' : '☀';
  const text = o.light === 'cycle' ? `${icon} ${clockLabel(c)}` : `${icon} ${o.light}`;
  if (text !== clockText) { clockText = text; clockBtn.textContent = text; }
}
function setLight(mode) {
  setOpt('light', mode);
  $('opt-light').value = mode;
}
clockBtn.addEventListener('click', () => setLight(LIGHT_ORDER[(LIGHT_ORDER.indexOf(world.opts.light) + 1) % LIGHT_ORDER.length]));

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
$('clear').addEventListener('click', () => { release(); world.creatures = []; world.eggs = []; world.targets = {}; updateCounts(); });
$('reset').addEventListener('click', () => {
  world.seed = newSeedName();
  world.autoSize = screenWorld(); // a new pond fits the window as it is now
  world.current.base = rand(-PI, PI);
  layout(true);
  history.replaceState(null, '', new URL(shareUrl()).search);
});
$('share').addEventListener('click', async () => {
  const url = shareUrl();
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Procedural Pond', text: `Come see my pond, ${world.seed}`, url });
    else { await navigator.clipboard.writeText(url); showTicker('Link copied: anyone who opens it gets this pond'); }
  } catch {
    prompt('Copy this link to share your pond:', url);
  }
});
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
  else if (e.key === 'l' || e.key === 'L') clockBtn.click();
  else if (e.key === '+' || e.key === '=') zoomStep(1);
  else if (e.key === '-' || e.key === '_') zoomStep(-1);
  else if (e.key === '0') resetView();
  else if (e.key === 'f' || e.key === 'F') { if (world.hover) follow(world.hover); else stopFollow(); }
  else if (e.key === 't' || e.key === 'T') $('tour').click();
  else if (e.key === 'm' || e.key === 'M') $('sound').click();
  else if (e.key === 'Escape') stopFollow();
});

addEventListener('resize', () => applyView());

setTool('feed');
layout(true);
if (innerWidth < 600) setHud(false); // on phones the pond comes first; ☰ opens the panel
if (!params.get('pond') || (world.opts.world === 'auto' && !params.get('size'))) history.replaceState(null, '', `${new URL(shareUrl()).search}${location.hash}`);
if (location.hash.includes('bones')) setBones(true);
requestAnimationFrame(frame);
