'use strict';
// The living pond: genes, hunger, growth, breeding, predators and prey,
// animals migrating in and out, plankton, gnats, ripples, bubbles and weather.

// ---- genes ------------------------------------------------------------------

function makeGenome() {
  return { size: rand(0.85, 1.15), hue: rand(-12, 12), sat: rand(0.88, 1.12), light: rand(0.94, 1.06), speed: rand(0.9, 1.15) };
}

const GENE_LIMITS = { size: [0.7, 1.35], hue: [-30, 30], sat: [0.7, 1.3], light: [0.85, 1.15], speed: [0.75, 1.3] };
const GENE_DRIFT = { size: 0.05, hue: 5, sat: 0.05, light: 0.03, speed: 0.05 };

// Blend two parents, then mutate a little, so lineages drift over generations.
function childGenome(a, b) {
  const g = {};
  for (const k of Object.keys(GENE_LIMITS)) {
    const v = lerp(a[k], b[k], Math.random()) + (Math.random() + Math.random() - 1) * GENE_DRIFT[k];
    g[k] = clamp(v, ...GENE_LIMITS[k]);
  }
  return g;
}

const isMat = (v) => Array.isArray(v) && v.length === 4 && typeof v[0] === 'number' && v[0] >= 0xff000000;

function makeDye(g) {
  const cache = new Map();
  return (m) => {
    let d = cache.get(m);
    if (!d) {
      d = m.map((c) => { const [h, s, l] = rgbToHsl(c); return hsl(h + g.hue, s * g.sat, l * g.light); });
      cache.set(m, d);
    }
    return d;
  };
}

// Re-colour an individual: its own materials, baked pattern tables, and its variety object.
function dyeCreature(c, dye) {
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (isMat(v)) c[k] = dye(v);
    else if (typeof v === 'function' && v.table) {
      for (let i = 0; i < v.table.length; i++) if (isMat(v.table[i])) v.table[i] = dye(v.table[i]);
    } else if (k === 'v' && v && typeof v === 'object' && !Array.isArray(v)) {
      const o = { ...v };
      for (const kk of Object.keys(o)) if (isMat(o[kk])) o[kk] = dye(o[kk]);
      c[k] = o;
    }
  }
}

// ---- life -------------------------------------------------------------------

const LIFESPAN = {
  koi: [600, 900], tetra: [360, 540], wild: [400, 700], clown: [450, 650], shrimp: [300, 450], snail: [450, 650],
  axolotl: [600, 840], frog: [480, 700], tadpole: [1e9, 1e9], puffer: [450, 720],
};
const GROUPS = new Set(['tetra', 'shrimp', 'snail', 'duck', 'wild', 'clown']);
const NO_LIFE = new Set(['firefly', 'gnat']);
const EATS = new Set(['koi', 'tetra', 'eel', 'axolotl', 'turtle', 'crab', 'ray', 'frog', 'snake', 'snail', 'clown', 'puffer', 'octopus', 'duck', 'shrimp', 'wild', 'tadpole']);
const SCALABLE = new Set(['koi', 'tetra', 'eel', 'clown', 'puffer', 'ray', 'snake', 'wild', 'tadpole', 'axolotl', 'turtle', 'crab', 'snail', 'shrimp', 'frog']);
const LEG_KEYS = ['reach', 'l1', 'l2', 'r1', 'r2', 'foot', 'stepDist', 'inset'];
const BREED = {
  koi: { clutch: [2, 3], hatch: 25, cap: 10, eggs: 'plant' },
  tetra: { clutch: [3, 5], hatch: 18, cap: 30, eggs: 'plant' },
  wild: { clutch: [2, 4], hatch: 20, cap: 16, eggs: 'plant' },
  clown: { clutch: [1, 2], hatch: 20, cap: 6, eggs: 'plant' },
  shrimp: { clutch: [2, 4], hatch: 15, cap: 16, eggs: 'floor' },
  snail: { clutch: [2, 3], hatch: 30, cap: 10, eggs: 'rock' },
  axolotl: { clutch: [1, 2], hatch: 30, cap: 4, eggs: 'plant' },
  frog: { clutch: [2, 4], hatch: 20, cap: 6, eggs: 'surface' },
};
const SINGULAR = {
  koi: 'Koi', tetra: 'Tetra', eel: 'Eel', axolotl: 'Axolotl', turtle: 'Turtle', crab: 'Crab', ray: 'Stingray', frog: 'Frog',
  snake: 'Water snake', snail: 'Snail', jelly: 'Jellyfish', clown: 'Clownfish', puffer: 'Pufferfish', octopus: 'Octopus',
  duck: 'Duck', shrimp: 'Shrimp', dragonfly: 'Dragonfly', firefly: 'Firefly', gnat: 'Gnat', tadpole: 'Tadpole',
};
const ECO = { births: 0, arrivals: 0, departures: 0, eaten: 0 };
const ARRIVE_VERB = { dragonfly: 'flew in', frog: 'hopped in', crab: 'scuttled in', snail: 'crept in', turtle: 'paddled in', axolotl: 'wandered in' };
// Seconds from full to empty. Grazers nibble algae as they go, so they rarely go hungry.
const METABOLISM = { snail: 900, crab: 600, turtle: 700, ray: 600, frog: 520, shrimp: 500 };

// ---- journal: a running story of the pond --------------------------------------

function logEvent(world, text, subject = null) {
  world.journal.unshift({ clock: world.clock, text, subject });
  if (world.journal.length > 80) world.journal.pop();
  world.journalDirty = true;
}

const who = (c) => (c.life ? `${c.life.name} the ${describe(c).label}` : `a ${describe(c).label.toLowerCase()}`);
const plural = (label, n) => (n === 1 || /fish|shrimp|koi|sh$/i.test(label) ? label : label.endsWith('y') ? label.slice(0, -1) + 'ies' : label + 's');
const SCHOOLING = (c) => c.species === 'tetra' || c.species === 'shrimp' || (c.species === 'wild' && c.sp.schooling);

function captureBase(c) {
  const b = c.body;
  c.base = {
    links: Array.from(b.links), w: Array.from(b.w), puff: c.baseW && c.baseW.slice(),
    legs: (c.legs || []).map((L) => Object.fromEntries(LEG_KEYS.filter((k) => typeof L[k] === 'number').map((k) => [k, L[k]]))),
  };
}

function applyScale(c, s) {
  const b = c.body, base = c.base;
  for (let i = 0; i < b.links.length; i++) b.links[i] = base.links[i] * s;
  for (let i = 0; i < b.w.length; i++) b.w[i] = base.w[i] * s;
  if (base.puff) c.baseW = base.puff.map((v) => v * s);
  (c.legs || []).forEach((L, i) => { for (const k in base.legs[i]) L[k] = base.legs[i][k] * s; });
  c.appliedScale = s;
}

function initLife(c, { genome = makeGenome(), gen = 0, scale = 1, age, alpha = 1 } = {}) {
  c.alpha = alpha;
  if (NO_LIFE.has(c.species)) return c;
  const [a, b] = LIFESPAN[c.species] || [450, 800];
  const lifespan = rand(a, b);
  c.life = {
    genome, gen, lifespan, scale, name: personName(),
    age: age ?? rand(0.05, 0.5) * lifespan,
    energy: rand(0.6, 0.9), cooldown: rand(40, 100),
  };
  dyeCreature(c, makeDye(genome));
  if (SCALABLE.has(c.species)) { captureBase(c); applyScale(c, scale * genome.size); }
  if (c.cruise) c.cruise *= genome.speed;
  if (c.maxSpeed) c.maxSpeed *= genome.speed;
  return c;
}

function eat(world, c, f) {
  let gain;
  if (f instanceof Creature) {
    f.caught = true;
    gain = 0.55;
    ECO.eaten++;
    addBubbles(world, f.x, f.y, f.z, 3);
    if (f.life) logEvent(world, `${who(c)} caught ${who(f)}`, c);
  } else {
    f.eaten = true;
    gain = f.kind === 'plankton' ? 0.1 : 0.3;
  }
  if (c.life) c.life.energy = Math.min(1, c.life.energy + gain);
  if ((f.z ?? 0) > 32) addRipple(world, f.x, f.y, 0.6);
}

const isPredator = (c) => c.species === 'eel' || c.species === 'snake' || c.species === 'octopus' || (c.species === 'wild' && c.sp.predator);
const isPrey = (c) => c.species === 'tetra' || c.species === 'shrimp' || c.species === 'tadpole' ||
  (c.species === 'wild' && c.sp.small) || (c.life && c.life.scale < 0.55);

// ---- effects: ripples and bubbles --------------------------------------------

const FX_ID = 2, BUBBLE_ID = 3, PLANKTON_ID = 4;
const FADE = new Uint8Array(65536); // ids drawn dithered this frame: no outlines around them
FADE[FX_ID] = FADE[BUBBLE_ID] = FADE[PLANKTON_ID] = 1;
const RIPPLE_MAT = mat('#9cc8d0', '#bfe0e6', '#dff2f4', '#ffffff');
const BUBBLE_MAT = mat('#a8d4e0', '#cfeaf0', '#eefafc', '#ffffff');
const PLANKTON_MAT = solid('#b8e07a');

class Ripple {
  constructor(x, y, size) {
    this.x = x; this.y = y; this.r = 0.6;
    this.max = 3 + size * 5; this.speed = 5 + size * 4;
  }

  update(dt) { this.r += dt * this.speed; return this.r < this.max; }

  draw(r) {
    const inner = Math.max(0, (this.r - 1.1) / this.r), i2 = inner * inner;
    r.alpha = 1 - this.r / this.max;
    r.ellipsoid(this.x, this.y, this.r, this.r * 0.92, 0, 44.7, 0.1, (lx, ly) => (lx * lx + ly * ly > i2 ? RIPPLE_MAT : null), FX_ID);
  }
}

class Bubble {
  constructor(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.r = rand(0.6, 1.4); this.vz = rand(6, 10); this.ph = rand(0, TAU);
  }

  update(dt, world) {
    this.z += this.vz * dt;
    this.x += (Math.sin(this.z * 0.5 + this.ph) * 1.5 + world.current.x * 2) * dt;
    this.y += world.current.y * 2 * dt;
    if (this.z < 44) return true;
    addRipple(world, this.x, this.y, 0.3);
    return false;
  }

  draw(r) {
    r.alpha = 1;
    if (this.r < 1) { r.dot(this.x, this.y, this.z, BUBBLE_MAT, BUBBLE_ID); return; }
    r.ellipsoid(this.x, this.y, this.r, this.r, 0, this.z, this.r,
      (lx, ly) => (lx * lx + ly * ly > 0.45 || (lx < -0.1 && ly < -0.1) ? BUBBLE_MAT : null), BUBBLE_ID);
  }
}

function addRipple(world, x, y, size = 1, silent = false) {
  if (world.effects.length < 220) world.effects.push(new Ripple(x, y, size));
  if (!silent && typeof Sound !== 'undefined') Sound.plop(x / world.W, size);
}

function addBubbles(world, x, y, z, n) {
  for (let i = 0; i < n && world.effects.length < 220; i++) world.effects.push(new Bubble(x + rand(-1, 1), y + rand(-1, 1), z + rand(0, 2)));
}

// ---- eggs & young -------------------------------------------------------------

const EGG_LOOKS = {
  plant: mat('#b8a878', '#d8cc9c', '#f0e8c4', '#ffffff'),
  floor: mat('#8a5a40', '#b07a58', '#d8a07a', '#f4c8a8'),
  rock: mat('#b0506a', '#d07890', '#f0a0b4', '#ffd0dc'),
  surface: mat('#7a8a70', '#a0b098', '#c4d2bc', '#eef6ea'),
};

class Eggs {
  constructor(world, parent, mate, x, y, z, place) {
    this.parent = parent; this.mate = mate;
    this.x = x; this.y = y; this.z = z; this.place = place;
    this.key = breedKey(parent);
    const [a, b] = BREED[parent.species].clutch;
    this.cells = Array.from({ length: randi(a, b) }, () => ({ ox: rand(-2.2, 2.2), oy: rand(-2.2, 2.2), p: rand(0, TAU) }));
    this.timer = BREED[parent.species].hatch * rand(0.85, 1.2);
    this.look = EGG_LOOKS[place];
    this.id = newId(outlineOf(this.look));
    this.alpha = 0;
  }

  update(dt, world) {
    this.alpha = Math.min(1, this.alpha + dt);
    this.timer -= dt;
    if (this.timer > 0) return true;
    let first = null, n = 0;
    for (const cell of this.cells) {
      const baby = makeBaby(world, this.parent, this.mate, this.x + cell.ox, this.y + cell.oy);
      if (baby) { world.creatures.push(baby); ECO.births++; n++; first = first || baby; }
    }
    if (first) {
      const young = first.species === 'tadpole' ? `${n} tadpole${n > 1 ? 's' : ''}` : `${n} young ${plural(describe(first).label, n)}`;
      logEvent(world, `${this.parent.life.name} & ${this.mate.life.name}'s eggs hatched: ${young} (gen ${first.life.gen})`, first);
    }
    if (this.z > 30) addRipple(world, this.x, this.y, 0.8);
    return false;
  }

  draw(r, t) {
    r.alpha = this.alpha;
    FADE[this.id] = this.alpha < 1 ? 1 : 0;
    const wob = this.timer < 4 ? 0.4 : 0.1;
    for (const c of this.cells) {
      const x = this.x + c.ox + Math.sin(t * 6 + c.p) * wob, y = this.y + c.oy;
      r.ellipsoid(x, y, 0.95, 0.95, 0, this.z, 0.9, this.look, this.id);
      if (this.place === 'surface') r.dot(x, y, this.z + 1, EYE, this.id);
    }
  }
}

const breedKey = (c) => (c.species === 'wild' ? `wild:${c.sp.id}` : c.species);

function makeBaby(world, p, m, x, y) {
  let c;
  switch (p.species) {
    case 'koi': c = new Koi(world, x, y, Math.random() < 0.85 ? (Math.random() < 0.5 ? p.variety : m.variety) : undefined); break;
    case 'tetra': c = new Tetra(world, x, y, p.school); break;
    case 'wild': c = new WildFish(world, x, y, p.sp, p.school); break;
    case 'clown': c = new Clownfish(world, x, y); break;
    case 'shrimp': c = new Shrimp(world, x, y); break;
    case 'snail': c = new Snail(world, x, y); break;
    case 'axolotl': c = new Axolotl(world, x, y); break;
    case 'frog': c = new Tadpole(world, x, y); break;
    default: return null;
  }
  return initLife(c, {
    genome: childGenome(p.life.genome, m.life.genome),
    gen: Math.max(p.life.gen, m.life.gen) + 1, scale: 0.35, age: 0, alpha: 0,
  });
}

const TAD = mat('#1a1c10', '#2c3018', '#424a26', '#606c3a');
const TAD_FIN = mat('#3a3e2a', '#5a6044', '#7e8664', '#a8b090');

class Tadpole extends Fish {
  constructor(world, x, y) {
    super(world, x, y, {
      species: 'tadpole',
      links: new Array(5).fill(0.9), widths: [1.4, 1.6, 1.2, 0.7, 0.5, 0.3],
      constraint: PI / 5, cruise: 5, maxSpeed: 11, turnRate: 4,
      wiggleAmp: 0.8, wiggleFreq: 14, zMin: 26, zMax: 38, sight: 30, skittish: true,
      outline: outlineOf(TAD),
    });
    this.skin = TAD; this.fin = TAD_FIN;
  }

  draw(r) {
    const b = this.body, z = this.z, id = this.id;
    this.drawSpine(r, 0, 2, z, 1, this.skin, id);
    this.drawSpine(r, 2, b.n - 1, z, 0.3, this.fin, id);
    this.drawEyes(r, 1.0, 0.3, z + b.w[0] + 0.5, false);
  }
}

// A froglet climbs out of the tadpole once it is big enough.
function metamorphose(world, t) {
  const f = new Frog(world, t.x, t.y);
  f.pad = null; f.targetPad = null; f.state = 'swim';
  f.x = t.x; f.y = t.y; f.heading = t.heading;
  f.body.place(f.x, f.y, f.heading);
  initLife(f, { genome: t.life.genome, gen: t.life.gen, scale: 0.6, age: 0, alpha: 0.2 });
  f.life.name = t.life.name;
  t.gone = true;
  addBubbles(world, t.x, t.y, t.z, 3);
  world.creatures.push(f);
  logEvent(world, `${f.life.name} the tadpole grew legs and became a froglet`, f);
}

// ---- gnats: day-time swarms over the surface, food for frogs -------------------

const GNAT = solid('#14120a'), GNAT_WING = solid('#d8e0e0');

class Gnat extends Creature {
  constructor(world, x, y, swarm) {
    super(world, x, y);
    this.species = 'gnat';
    this.swarm = swarm;
    this.z = rand(50, 58);
    this.ox = rand(-7, 7); this.oy = rand(-7, 7);
    this.rate = rand(7, 12);
    this.body = new Chain(x, y, 0, [0.5], [0.4, 0.3], PI);
    this.id = newId(hexToInt('#0a0a04'));
  }

  hit(px, py) { return Math.hypot(px - this.x, py - this.y) < 2.5; }

  update(dt, world) {
    this.phase += dt * this.rate;
    const p = world.pointer, s = this.swarm;
    const tx = this.grabbed ? p.x : s.x + this.ox + Math.sin(this.phase) * 3;
    const ty = this.grabbed ? p.y : s.y + this.oy + Math.cos(this.phase * 1.3) * 3;
    const k = Math.min(1, dt * 6);
    this.heading = Math.atan2(ty - this.y, tx - this.x);
    this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    this.body.resolve(this.x, this.y, this.heading);
  }

  draw(r, t) {
    r.dot(this.x, this.y, this.z, GNAT, this.id);
    if (Math.sin(t * 60 + this.phase) > 0) r.dot(this.x + 1, this.y, this.z, GNAT_WING, this.id);
  }
}

function updateGnats(world, dt) {
  const area = world.W * world.H;
  const want = world.darkness < 0.4 ? clamp(Math.round(area / 60000) + 1, 1, 3) : 0;
  const live = world.swarms.filter((s) => !s.dying);
  if (live.length < want && Math.random() < dt * 0.2) {
    const anchor = pick([...world.pads, ...world.plants]) || { x: world.W / 2, y: world.H / 2 };
    const s = { x: anchor.x, y: anchor.y, seed: rand(0, 99), dying: false };
    world.swarms.push(s);
    for (let i = randi(6, 10); i > 0; i--) {
      const g = new Gnat(world, s.x + rand(-6, 6), s.y + rand(-6, 6), s);
      g.alpha = 0;
      world.creatures.push(g);
    }
  } else if (live.length > want && Math.random() < dt * 0.5) {
    live[0].dying = true;
  }
  for (const s of world.swarms) {
    s.x = clamp(s.x + (vnoise(world.t * 0.2, s.seed, 71) - 0.5) * dt * 30 + world.current.x * dt * 2, 10, world.W - 10);
    s.y = clamp(s.y + (vnoise(world.t * 0.2, s.seed, 72) - 0.5) * dt * 30 + world.current.y * dt * 2, 10, world.H - 10);
  }
  for (const c of world.creatures) {
    if (c.species !== 'gnat') continue;
    if (c.swarm.dying) { c.alpha -= dt; if (c.alpha <= 0) c.gone = true; }
  }
  world.swarms = world.swarms.filter((s) => !s.dying || world.creatures.some((c) => c.swarm === s && !c.gone));
}

// ---- weather --------------------------------------------------------------------

function updateWeather(world, dt) {
  const w = world.weather;
  w.next -= dt;
  if (world.opts.weather === false) w.target = 0;
  else if (w.next <= 0) {
    if (w.target === 0) { w.target = rand(0.45, 1); w.next = rand(25, 60); logEvent(world, 'Clouds roll in and it starts to rain'); }
    else { w.target = 0; w.next = rand(90, 240); logEvent(world, 'The rain eases off'); }
  }
  w.rain += (w.target - w.rain) * Math.min(1, dt * 0.12);
  w.gust = world.opts.weather === false ? 0 : (vnoise(world.t * 0.15, 3, 77) - 0.5) * 2;
  // Raindrops land as small ripples all over the surface.
  let drops = w.rain * world.W * world.H / 1800 * dt;
  while (Math.random() < drops) { addRipple(world, rand(0, world.W), rand(0, world.H), rand(0.2, 0.6), true); drops -= 1; }
}

// ---- the tick ---------------------------------------------------------------------

let lifeTick = 0, breedTick = 0, migrateTick = 0;

function updateLife(world, dt) {
  const { W, H } = world;
  const on = world.opts.life !== false;

  world.effects = world.effects.filter((e) => e.update(dt, world));
  world.eggs = world.eggs.filter((e) => e.update(dt, world));
  updateWeather(world, dt);
  updateGnats(world, dt);

  for (const c of world.creatures) {
    if (c.alpha === undefined) c.alpha = 1;
    // Fade in on arrival; fade out once a leaving animal reaches the edge.
    if (c.leaving && !c.grabbed && c.species !== 'firefly') {
      steerOut(c, world);
      if (Math.min(c.x, W - c.x, c.y, H - c.y) < 10) {
        c.alpha -= dt * 0.8;
        if (c.alpha <= 0) {
          c.gone = true;
          ECO.departures++;
          if (c.life && !SCHOOLING(c) && c.species !== 'tadpole') {
            const m = Math.floor(c.life.age / 60);
            logEvent(world, `${who(c)} moved on${c.life.energy <= 0 ? ' in search of food' : m ? ` after ${m} minutes` : ''}`);
          }
        }
      }
    } else if (c.alpha < 1 && !(c.swarm && c.swarm.dying)) {
      c.alpha = Math.min(1, c.alpha + dt * 0.8);
    }

    // Wakes, splashes and the odd bubble.
    if (c.species === 'duck' && c.speed > 1.5) {
      c.wakeT = (c.wakeT || 0) - dt;
      if (c.wakeT <= 0) { const b = c.body, n = b.n - 1; addRipple(world, b.x[n], b.y[n], 0.35 * c.k); c.wakeT = 0.35; }
    }
    if (c.species === 'frog') {
      if (c.state !== c.lastState && (c.state === 'hop' || c.lastState === 'hop')) addRipple(world, c.x, c.y, 1);
      c.lastState = c.state;
    }
    if (c.species === 'octopus' && c.jet > 1.1 && !c.puffed) { addBubbles(world, c.x, c.y, c.z, 5); c.puffed = true; }
    if (c.species === 'octopus' && c.jet <= 0) c.puffed = false;
    if (c instanceof Fish && c.z < 40 && Math.random() < dt * 0.04) addBubbles(world, c.body.x[0], c.body.y[0], c.z + 1, 1);

    const L = c.life;
    if (!L || !on) continue;
    L.age += dt;
    if (EATS.has(c.species)) L.energy = Math.max(0, L.energy - dt / (METABOLISM[c.species] || (c.body.w[0] > 2.5 ? 420 : 260)));
    L.cooldown -= dt;
    if (L.scale < 1) {
      L.scale = Math.min(1, L.scale + dt * (L.energy > 0.3 ? 0.008 : 0.003));
      if (c.base && Math.abs(L.scale * L.genome.size - c.appliedScale) > 0.02) applyScale(c, L.scale * L.genome.size);
    }
    if (c.species === 'tadpole' && L.age > 50 && L.scale > 0.65) metamorphose(world, c);
    if (!c.leaving && !c.grabbed && (L.age > L.lifespan || L.energy <= 0)) c.leaving = true;
  }

  if (!on) {
    for (const c of world.creatures) { c.prey = null; c.threat = null; }
    return;
  }

  lifeTick -= dt;
  if (lifeTick <= 0) { lifeTick = 0.25; assignHunts(world); }
  breedTick -= dt;
  if (breedTick <= 0) { breedTick = 1; breed(world); growPlankton(world); }
  migrateTick -= dt;
  if (migrateTick <= 0) { migrateTick = 6; migrate(world); }
}

function steerOut(c, world) {
  const { W, H } = world;
  if (!c.exit) {
    const d = [c.x, W - c.x, c.y, H - c.y], i = d.indexOf(Math.min(...d));
    c.exit = [[2, c.y], [W - 2, c.y], [c.x, 2], [c.x, H - 2]][i];
  }
  [c.tx, c.ty] = c.exit;
  c.timer = 5;
  c.prey = null;
  if ('mode' in c) c.mode = c.species === 'dragonfly' ? 'dart' : 'walk';
  if (c.species === 'frog' && c.state === 'sit') { c.state = 'swim'; c.pad = null; }
  if (c.species === 'frog') c.targetPad = null;
}

function assignHunts(world) {
  const preds = [], prey = [];
  for (const c of world.creatures) {
    if (c.grabbed || c.leaving || c.gone || c.caught) continue;
    if (isPredator(c)) preds.push(c);
    else if (isPrey(c)) prey.push(c);
  }
  for (const p of preds) {
    if (!p.life || p.life.energy > 0.6) { p.prey = null; continue; }
    const cur = p.prey;
    if (cur && !cur.caught && !cur.gone && Math.hypot(cur.x - p.x, cur.y - p.y) < 90) continue;
    let best = null, bd = 60 * 60;
    for (const q of prey) {
      if (Math.abs(q.z - p.z) > 14 || q === p) continue;
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    p.prey = best;
  }
  for (const q of prey) {
    q.threat = null;
    let bd = 26 * 26;
    for (const p of preds) {
      if (!p.prey || Math.abs(q.z - p.z) > 14) continue;
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (d < bd) { bd = d; q.threat = p; }
    }
  }
}

function breed(world) {
  if (world.creatures.length > 130) return; // the pond is full
  const counts = {};
  for (const c of world.creatures) if (!c.leaving) counts[breedKey(c)] = (counts[breedKey(c)] || 0) + 1;
  for (const e of world.eggs) counts[e.key] = (counts[e.key] || 0) + e.cells.length;
  const ready = (c) => c.life && BREED[c.species] && !c.leaving && !c.grabbed && c.life.scale >= 0.95 &&
    c.life.age > 45 && c.life.energy > 0.65 && c.life.cooldown <= 0;
  for (const c of world.creatures) {
    if (!ready(c)) continue;
    const key = breedKey(c), rule = BREED[c.species];
    const cap = c.species === 'wild' ? (c.sp.schooling ? 14 : 5) : rule.cap;
    if ((counts[key] || 0) >= cap) continue;
    const mate = world.creatures.find((m) => m !== c && breedKey(m) === key && ready(m) && (m.x - c.x) ** 2 + (m.y - c.y) ** 2 < 1600);
    if (!mate) continue;
    let x = (c.x + mate.x) / 2, y = (c.y + mate.y) / 2, z = 0.6;
    if (rule.eggs === 'plant') {
      const p = world.plants.find((pl) => (pl.x - x) ** 2 + (pl.y - y) ** 2 < 1600);
      if (p) { x = p.x + rand(-3, 3); y = p.y + rand(-3, 3); z = rand(2, 6); }
    } else if (rule.eggs === 'rock') {
      const rk = world.rocks.find((r) => (r.x - x) ** 2 + (r.y - y) ** 2 < 1600);
      if (rk) { x = rk.x + rand(-2, 2); y = rk.y + rand(-2, 2); z = rk.h * 0.9; }
    } else if (rule.eggs === 'surface') z = 41;
    const eggs = new Eggs(world, c, mate, x, y, z, rule.eggs);
    world.eggs.push(eggs);
    counts[key] = (counts[key] || 0) + eggs.cells.length;
    for (const p of [c, mate]) { p.life.cooldown = rand(80, 140); p.life.energy -= 0.3; }
  }
}

function growPlankton(world) {
  const want = Math.round(world.W * world.H / 1600 * (1 - 0.4 * world.darkness));
  let have = 0;
  for (const f of world.food) if (f.kind === 'plankton') have++;
  for (let i = 0; i < 3 && have < want; i++, have++) {
    const src = Math.random() < 0.7 && pick(world.plants);
    const x = src ? src.x + rand(-6, 6) : rand(5, world.W - 5), y = src ? src.y + rand(-6, 6) : rand(5, world.H - 5);
    world.food.push(new Food(x, y, rand(4, 30), 'plankton'));
  }
}

// Keep each species near the population the pond was set up with, by letting
// newcomers swim in from the edges. Now and then a new wild species turns up.
function migrate(world) {
  const pop = {};
  for (const c of world.creatures) if (!c.leaving) pop[c.species] = (pop[c.species] || 0) + 1;
  for (const [kind, target] of Object.entries(world.targets)) {
    const n = pop[kind] || 0;
    // Groups arrive together, so wait until a group's worth is missing.
    if (n < target && (!GROUPS.has(kind) || n <= target * 0.6) && Math.random() < 0.5) arrive(world, kind);
  }
  const activeWild = new Set(world.creatures.filter((c) => c.species === 'wild').map((c) => c.sp)).size;
  if (activeWild < 4 && Math.random() < 0.025) arrive(world, 'wild', true);
}

function arrive(world, kind, discover = false) {
  const { W, H } = world, side = randi(0, 3);
  const x = side === 0 ? 4 : side === 1 ? W - 4 : rand(20, W - 20);
  const y = side === 2 ? 4 : side === 3 ? H - 4 : rand(20, H - 20);
  let group;
  if (discover) {
    const sp = genWildSpecies();
    const school = sp.schooling ? { tx: x, ty: y, tz: (sp.zMin + sp.zMax) / 2, until: 0, wild: sp } : null;
    group = Array.from({ length: sp.schooling ? randi(5, 8) : randi(1, 2) }, () => new WildFish(world, x + rand(-4, 4), y + rand(-4, 4), sp, school));
    world.targets.wild = (world.targets.wild || 0) + group.length;
  } else {
    group = SPECIES[kind].spawn(world, x, y);
  }
  const heading = Math.atan2(H / 2 - y, W / 2 - x);
  for (const c of group) {
    c.x = clamp(c.x, 2, W - 2); c.y = clamp(c.y, 2, H - 2);
    c.heading = heading;
    if (c.place) c.place(c.x, c.y); else c.body.place(c.x, c.y, heading);
    c.tx = W / 2 + rand(-W / 4, W / 4); c.ty = H / 2 + rand(-H / 4, H / 4);
    c.timer = 4;
    if ('mode' in c) c.mode = 'walk';
    initLife(c, { alpha: 0 });
  }
  world.creatures.push(...group);
  ECO.arrivals += group.length;
  const c = group[0];
  if (discover) logEvent(world, `New species spotted: ${c.sp.name}${group.length > 1 ? ` (a school of ${group.length})` : ''}`, c);
  else if (kind === 'duck') logEvent(world, 'A duck family paddled in', c);
  else if (group.length > 1) logEvent(world, `${SCHOOLING(c) ? 'A school' : 'A group'} of ${group.length} ${plural(describe(c).label, group.length)} arrived`, c);
  else logEvent(world, `${who(c)} ${ARRIVE_VERB[kind] || 'swam in'}`, c);
}

// ---- inspector ----------------------------------------------------------------

function describe(c) {
  const L = c.life;
  const label = c.species === 'wild' ? c.sp.name : c.species === 'duck' ? { hen: 'Duck (hen)', drake: 'Duck (drake)', baby: 'Duckling' }[c.kind] : SINGULAR[c.species] || c.species;
  let mood = 'content';
  if (c.grabbed) mood = 'being held';
  else if (c.leaving) mood = 'moving on';
  else if (c.prey) mood = 'hunting';
  else if (c.threat) mood = 'fleeing';
  else if (c.inflate > 0.3) mood = 'puffed up';
  else if (L && L.energy < 0.35) mood = 'hungry';
  else if (L && L.scale < 0.9) mood = 'growing';
  const stage = !L ? '' : L.scale < 0.6 ? 'young' : L.age > L.lifespan * 0.8 ? 'elder' : 'adult';
  return { name: L ? L.name : '', label, stage, mood, gen: L ? L.gen : null, age: L ? L.age : null, energy: L ? L.energy : null };
}
