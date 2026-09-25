'use strict';

const canvas = document.getElementById('pond');
const ctx = canvas.getContext('2d');

const OPTS_KEY = 'procedural-pond.opts';
const DEFAULT_OPTS = {
  v: 2, pixel: 'auto', floor: 'sand', water: 'teal', light: 'cycle', dayLength: 180,
  current: 25, speed: 1, caustics: true, shadows: true, outlines: true, life: true, weather: true, sound: false,
};
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
    if (stored.v !== 2) delete stored.light; // older saves predate the cycle; default to it
    return { ...DEFAULT_OPTS, ...stored, v: 2 };
  } catch { return { ...DEFAULT_OPTS }; }
}
function saveOpts() {
  try { localStorage.setItem(OPTS_KEY, JSON.stringify(world.opts)); } catch { /* storage unavailable */ }
}

const world = {
  W: 0, H: 0, scale: 1, t: 0, clock: 0.3, darkness: 0, light: null,
  raster: null, bg: null, bgLight: null,
  caustic: makeCausticTile(),
  creatures: [], plants: [], pads: [], food: [], rocks: [], pebbles: [],
  effects: [], eggs: [], swarms: [], targets: {}, journal: [], journalDirty: false, seed: '',
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

// A shared link carries the pond seed, and optionally its floor and water.
const params = new URLSearchParams(location.search);
for (const [k, table] of [['floor', FLOORS], ['water', WATERS], ['light', LIGHTS]]) {
  if (table[params.get(k)]) world.opts[k] = params.get(k);
}
world.seed = (params.get('pond') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || newSeedName();

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
const MAX_CREATURES = 250;

// Size the low-res buffer to the window. Existing things keep their relative
// positions; pass regen to lay out fresh scenery instead.
function layout(regen) {
  const auto = Math.max(2, Math.round(Math.sqrt(innerWidth * innerHeight / 120000)));
  const scale = world.opts.pixel === 'auto' ? auto : +world.opts.pixel;
  const W = Math.ceil(innerWidth / scale), H = Math.ceil(innerHeight / scale);
  const sx = world.W ? W / world.W : 1, sy = world.H ? H / world.H : 1;
  world.scale = scale; world.W = W; world.H = H;
  canvas.width = W; canvas.height = H;
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
  world.raster = new Raster(W, H);
  image = ctx.createImageData(W, H);
  out = new Uint32Array(image.data.buffer);
  if (regen) {
    buildPond();
  } else {
    for (const o of [...world.rocks, ...world.pebbles, ...world.plants, ...world.pads, ...world.food]) { o.x *= sx; o.y *= sy; }
  }
  for (const c of world.creatures) {
    c.x = clamp(c.x * sx, 2, W - 2); c.y = clamp(c.y * sy, 2, H - 2);
    if (c.place) c.place(c.x, c.y); else c.body.place(c.x, c.y, c.heading);
  }
  bakeBackground(world);
  view.z = 1;
  applyView();
}

function openSpot() {
  const { W, H } = world;
  for (let i = 0; i < 20; i++) {
    const x = rand(W * 0.15, W * 0.85), y = rand(H * 0.15, H * 0.85);
    if (!world.rocks.some((r) => Math.hypot(r.x - x, r.y - y) < Math.max(r.a, r.b) + 8)) return [x, y];
  }
  return [W / 2, H / 2];
}

function spawn(kind, x, y) {
  if (world.creatures.length >= MAX_CREATURES) return;
  if (x === undefined) [x, y] = openSpot();
  const group = SPECIES[kind].spawn(world, x, y);
  for (const c of group) initLife(c, { alpha: 0 });
  world.creatures.push(...group);
  world.targets[kind] = (world.targets[kind] || 0) + group.length;
  updateCounts();
}

// Scenery and starting animals are generated from the seed at a fixed reference
// size, then stretched to the window, so a link makes the same pond on any screen.
const REF_W = 480, REF_H = 270;

function buildPond() {
  release();
  stopFollow();
  Object.assign(world, { creatures: [], food: [], eggs: [], effects: [], swarms: [], targets: {}, journal: [] });
  Object.assign(ECO, { births: 0, arrivals: 0, departures: 0, eaten: 0 });
  WILD_SPECIES.length = 0;
  const W = world.W, H = world.H;
  world.W = REF_W; world.H = REF_H;
  try {
    withSeed(world.seed, () => { generateScenery(world); populate(); });
  } finally {
    world.W = W; world.H = H;
  }
  const sx = W / REF_W, sy = H / REF_H;
  for (const o of [...world.rocks, ...world.pebbles, ...world.plants, ...world.pads]) { o.x *= sx; o.y *= sy; }
  for (const c of world.creatures) {
    c.x = clamp(c.x * sx, 2, W - 2); c.y = clamp(c.y * sy, 2, H - 2);
    c.tx *= sx; c.ty *= sy;
    if (c.place) c.place(c.x, c.y); else c.body.place(c.x, c.y, c.heading);
  }
  $('seed-name').textContent = world.seed;
  logEvent(world, `You found a pond called ${world.seed}`);
}

function populate() {
  const area = world.W * world.H;
  const koi = clamp(Math.round(area / 25000), 3, 6);
  for (let i = 0; i < koi; i++) spawn('koi');
  spawn('tetra');
  if (area > 60000) spawn('tetra');
  for (const kind of ['eel', 'axolotl', 'turtle', 'crab', 'crab', 'ray', 'frog', 'frog', 'snail', 'jelly', 'jelly',
    'clown', 'puffer', 'octopus', 'duck', 'shrimp', 'dragonfly', 'wild', 'wild']) spawn(kind);
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

function render() {
  const r = world.raster, t = world.t, o = world.opts;
  const light = world.light || (world.light = lighting());
  r.begin();
  for (const p of world.plants) p.draw(r, t, world);
  for (const p of world.pads) p.draw(r, t, world);
  for (const f of world.food) f.draw(r, t, world);
  for (const c of world.creatures) {
    const a = c.alpha ?? 1;
    r.alpha = a;
    FADE[c.id] = a < 1 ? 1 : 0;
    c.draw(r, t, world);
  }
  r.alpha = 1;
  for (const e of world.eggs) e.draw(r, t);
  r.castShadows = false;
  for (const e of world.effects) e.draw(r, t);
  r.castShadows = true;
  r.alpha = 1;
  r.compose(out, {
    bg: world.bg, bgLight: world.bgLight, caustic: world.caustic, t,
    outline: OUTLINE, emissive: EMISSIVE, fade: FADE, tint: light.tint,
    caustics: o.caustics && light.caustics, shadows: o.shadows, outlines: o.outlines,
  });
  if (world.bones) drawBones();
  ctx.putImageData(image, 0, 0);
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

let last = performance.now(), countTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!world.paused) update(dt * world.opts.speed);
  updateCamera(dt);
  render();
  updateCard(dt);
  Sound.update(world, world.paused ? 0 : dt);
  countTimer -= dt;
  if (countTimer <= 0) { countTimer = 0.5; updateCounts(); renderJournal(); }
  requestAnimationFrame(frame);
}

// ---- tools --------------------------------------------------------------------

const TOOLS = {
  feed: { label: 'Feed', hint: 'click to feed · drag animals · scroll to zoom' },
  net: { label: 'Net', hint: 'click an animal, plant or rock to remove it' },
  weed: { label: 'Weed', place: (x, y) => world.plants.push(new Weed(x, y)) },
  eelgrass: { label: 'Eelgrass', place: (x, y) => world.plants.push(new Eelgrass(x, y)) },
  anemone: { label: 'Anemone', place: (x, y) => world.plants.push(new Anemone(x, y)) },
  marimo: { label: 'Marimo', place: (x, y) => world.plants.push(new Marimo(x, y)) },
  duckweed: { label: 'Duckweed', place: (x, y) => world.plants.push(new Duckweed(x, y)) },
  lily: { label: 'Lily pad', place: (x, y) => world.pads.push(new LilyPad(world, x, y)) },
  rock: { label: 'Rock', place: (x, y) => { world.rocks.push(makeRock(x, y, rand(5, 10))); bakeBackground(world); } },
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
  if (ri >= 0) { world.rocks.splice(ri, 1); bakeBackground(world); }
}

// ---- zoom & pan -----------------------------------------------------------------
// The canvas is scaled with a CSS transform. Zoom levels keep each world pixel a
// whole number of screen pixels so the pixel art stays crisp.

const view = { z: 1, tx: 0, ty: 0 };
const zoomLabel = document.getElementById('zoom-level');

function applyView() {
  const w = world.W * world.scale * view.z, h = world.H * world.scale * view.z;
  view.tx = Math.round(clamp(view.tx, Math.min(0, innerWidth - w), 0));
  view.ty = Math.round(clamp(view.ty, Math.min(0, innerHeight - h), 0));
  canvas.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`;
  zoomLabel.textContent = `${Math.round(view.z * 100)}%`;
}

function zoomTo(k, cx = innerWidth / 2, cy = innerHeight / 2) {
  const s = world.scale, nz = clamp(Math.round(k), s, s * 8) / s;
  view.tx = cx - (cx - view.tx) * (nz / view.z);
  view.ty = cy - (cy - view.ty) * (nz / view.z);
  view.z = nz;
  applyView();
}

function zoomStep(dir, cx, cy) {
  const k = Math.round(view.z * world.scale);
  zoomTo(dir > 0 ? Math.max(k + 1, Math.round(k * 1.25)) : Math.min(k - 1, Math.round(k / 1.25)), cx, cy);
}

function resetZoom() { view.z = 1; applyView(); }

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
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.z * world.scale, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
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
  cam.fx = view.tx; cam.fy = view.ty;
  if (c && view.z < 2.5) zoomTo(world.scale * 3);
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
  const k = world.scale * view.z, e = Math.min(1, dt * 3);
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
  $('stats').textContent = `born ${ECO.births} · arrived ${ECO.arrivals} · left ${ECO.departures} · eaten ${ECO.eaten}`;
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
  if (world.opts.floor !== DEFAULT_OPTS.floor) u.searchParams.set('floor', world.opts.floor);
  if (world.opts.water !== DEFAULT_OPTS.water) u.searchParams.set('water', world.opts.water);
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

function fillSelect(el, entries, value) {
  for (const [v, label] of entries) el.append(new Option(label, v));
  el.value = value;
}
fillSelect($('opt-floor'), Object.entries(FLOORS).map(([k, f]) => [k, f.label]), world.opts.floor);
fillSelect($('opt-water'), Object.entries(WATERS).map(([k, w]) => [k, w.label]), world.opts.water);
fillSelect($('opt-light'), Object.entries(LIGHTS).map(([k, l]) => [k, l.label]), world.opts.light);
fillSelect($('opt-pixel'), [['auto', 'Auto'], ...[2, 3, 4, 5, 6, 8].map((n) => [String(n), `${n}×`])], String(world.opts.pixel));

function setOpt(key, value) {
  world.opts[key] = value;
  saveOpts();
}
$('opt-floor').addEventListener('change', (e) => { setOpt('floor', e.target.value); bakeBackground(world); });
$('opt-water').addEventListener('change', (e) => { setOpt('water', e.target.value); bakeBackground(world); });
$('opt-light').addEventListener('change', (e) => setOpt('light', e.target.value));
$('opt-pixel').addEventListener('change', (e) => { setOpt('pixel', e.target.value); layout(false); });

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
  const hh = Math.floor(c * 24), mm = Math.floor((c * 24 % 1) * 60);
  const text = o.light === 'cycle'
    ? `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    : `${icon} ${o.light}`;
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
zoomLabel.addEventListener('click', resetZoom);
$('clear').addEventListener('click', () => { release(); world.creatures = []; world.eggs = []; world.targets = {}; updateCounts(); });
$('reset').addEventListener('click', () => {
  world.seed = newSeedName();
  world.current.base = rand(-PI, PI);
  history.replaceState(null, '', `?pond=${world.seed}`);
  layout(true);
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

// Save the current frame, upscaled with hard pixel edges.
$('snapshot').addEventListener('click', () => {
  const k = Math.max(world.scale, 4), c = document.createElement('canvas');
  c.width = world.W * k; c.height = world.H * k;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, 0, 0, c.width, c.height);
  const a = document.createElement('a');
  a.download = `pond-${Date.now()}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
});

addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('button, select, input') && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key === 'b' || e.key === 'B') setBones(!world.bones);
  else if (e.key === ' ') { e.preventDefault(); setPaused(!world.paused); }
  else if (e.key === 'h' || e.key === 'H') setHud(hud.classList.contains('hidden'));
  else if (e.key === 'l' || e.key === 'L') clockBtn.click();
  else if (e.key === '+' || e.key === '=') zoomStep(1);
  else if (e.key === '-' || e.key === '_') zoomStep(-1);
  else if (e.key === '0') resetZoom();
  else if (e.key === 'f' || e.key === 'F') { if (world.hover) follow(world.hover); else stopFollow(); }
  else if (e.key === 't' || e.key === 'T') $('tour').click();
  else if (e.key === 'm' || e.key === 'M') $('sound').click();
  else if (e.key === 'Escape') stopFollow();
});

let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => layout(false), 150);
});

setTool('feed');
if (!params.get('pond')) history.replaceState(null, '', `?pond=${world.seed}${location.hash}`);
layout(true);
if (location.hash.includes('bones')) setBones(true);
requestAnimationFrame(frame);
