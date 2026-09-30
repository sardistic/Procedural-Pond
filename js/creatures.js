'use strict';
// Animals. Each one is a Chain (spine) whose head is steered by a small
// behaviour loop; the renderer then skins the chain with tubes and ellipsoids.

const PAL = {
  koiWhite: mat('#7f8b99', '#c3ccd4', '#eceee8', '#ffffff'),
  koiRed: mat('#7a1f18', '#b83a26', '#e5602f', '#ff9a5c'),
  koiBlack: mat('#0e1118', '#1e2331', '#30374a', '#525c76'),
  koiGold: mat('#7c4e0e', '#c0841a', '#efb42c', '#fff08a'),
  koiBronze: mat('#4a2c14', '#7a4a22', '#a86c34', '#d99a58'),
  koiSlate: mat('#1f3348', '#36577a', '#5d84a8', '#9cc2de'),
  finWhite: mat('#8a9aa6', '#c2d0d6', '#e6efef', '#ffffff'),
  finRed: mat('#a0482e', '#dd7a50', '#f7a57a', '#ffd2b0'),
  finGold: mat('#a0782a', '#dcb14c', '#f7da84', '#fff6c8'),
  finDark: mat('#2a2f3e', '#4a5268', '#7a8398', '#b0b8c8'),

  neon: mat('#0c3a6e', '#1a70c0', '#2fb8f0', '#a8f4ff'),
  tetraRed: mat('#5a0e1c', '#9e1c2a', '#e0363a', '#ff7a6a'),
  tetraFin: mat('#6a8290', '#98b0bc', '#c8dae2', '#eef8ff'),
  lemon: mat('#6a5a10', '#b0981c', '#e8d23a', '#fff49a'),

  moray: mat('#1f2a0e', '#3a4e16', '#617a22', '#9fb04a'),
  morayDot: mat('#6a5810', '#a88f1e', '#dcc038', '#fff27a'),
  ribbon: mat('#07184c', '#113896', '#1e62d4', '#5aa0ff'),
  ribbonFin: mat('#8a7a0a', '#c8b21a', '#f2da2e', '#fff8a0'),
  snowflake: mat('#8a8e94', '#c4c8cc', '#eceae4', '#ffffff'),
  snowBlot: mat('#0c0e12', '#1c2028', '#2e3440', '#4c5466'),

  axoPink: mat('#9a4a60', '#d27a92', '#f4a9bb', '#ffd8e2'),
  axoGill: mat('#6e1430', '#ad2a4c', '#de4c6a', '#ff8aa0'),
  axoWild: mat('#262a18', '#41462a', '#62683e', '#8e955e'),
  axoWildSpot: mat('#14160c', '#22261a', '#33382a', '#4a5040'),
  axoWildGill: mat('#2e1a2a', '#4e2c44', '#74446a', '#a46c96'),
  axoGold: mat('#8e6420', '#cc9a32', '#f2c95a', '#fff0a8'),
  axoGoldGill: mat('#9a4a2a', '#d4764a', '#f4a070', '#ffd0a8'),
  axoBlack: mat('#0c0c14', '#1a1a26', '#2a2a3a', '#444458'),
  axoBlackGill: mat('#1a1022', '#2e1c3c', '#482c5c', '#6e4a88'),

  turtleSkin: mat('#233318', '#3e5628', '#607e3c', '#93b362'),
  turtleShell: mat('#241c0e', '#46391a', '#6a5a28', '#948238'),
  turtleSeam: mat('#6a5a18', '#a89228', '#d8c24a', '#f6e68a'),
  turtleRim: mat('#3a3212', '#5e5320', '#877a34', '#b4a652'),
  turtleEar: mat('#6a1414', '#a02222', '#d63a2e', '#ff7050'),

  weed: mat('#0e3020', '#185632', '#2a8444', '#58c060'),
  weedKelp: mat('#262a0c', '#4c5418', '#76842a', '#aabc48'),
  weedRed: mat('#3a0e22', '#6a1c34', '#9a3048', '#d0586a'),
  pad: mat('#12381a', '#205e28', '#368a38', '#68bc50'),
  padVein: mat('#0e2a14', '#184a20', '#256c2c', '#3e8e3a'),
  padRim: mat('#1c4a1e', '#2e7430', '#4ca040', '#86d064'),
  petal: mat('#a8406e', '#dc76a2', '#ffaccd', '#ffe6f2'),
  petalCore: mat('#9a7010', '#d6a820', '#ffd84a', '#fff4a8'),
  pellet: mat('#3a200c', '#663a18', '#925c28', '#c48846'),
  grass: mat('#123a18', '#1e6428', '#34963a', '#6ccc5a'),
  grassOlive: mat('#2a3410', '#48581a', '#6c8228', '#a0b848'),
  marimo: mat('#0e2c12', '#1a4a1c', '#2a6e28', '#4a9a3a'),
  marimoLight: mat('#1a4a1c', '#2a6e28', '#4a9a3a', '#7cc458'),
  duckweed: mat('#1e5a14', '#34881e', '#58b42c', '#9ae05a'),
  eelFresh: mat('#1e1c10', '#34301a', '#4e4826', '#6e6838'),
  eelFreshBelly: mat('#5a5430', '#7a7244', '#9a905a', '#bab078'),
};

const EYE = solid('#0a0c10');
const EYE_SHINE = solid('#f4f8ff');
const OUTLINE = new Uint32Array(65536);
const EMISSIVE = new Uint8Array(65536); // 1 = stays brighter at night, 2 = its own light source
const THICK = new Uint8Array(65536);    // rare animals get a two-pixel outline
const VOID_SKIN = new Uint8Array(65536); // the eldritch: how wide the veins of void run (0 none, up to 7)
const FOOD_ID = 1;
OUTLINE[FOOD_ID] = hexToInt('#1c1008');

let NEXT_ID = 10;
function newId(outline) {
  const id = NEXT_ID++;
  if (NEXT_ID > 65000) NEXT_ID = 10;
  OUTLINE[id] = outline;
  EMISSIVE[id] = 0;
  THICK[id] = 0;
  VOID_SKIN[id] = 0;
  return id;
}
const outlineOf = (m) => mixColor(m[0], 0xff000000, 0.55);

// ---- reproducible construction ----------------------------------------------------
// Every animal is built under its own seed, so a saved pond can rebuild it
// exactly (same variety, pattern and proportions) from its kind, args and seed.
// Args hold the non-random inputs: a school, a wild species, a duckling's leader.
const CREATE = {}; // kind -> (world, x, y, args) => creature; each file registers its own
const newSeed = () => (Math.random() * 2097152) >>> 0; // 21 bits: 3 bytes in a pond link

// In a pond, animals are numbered in the order they appear and each seed follows
// from the pond's seed and that number, so a link can store the small number.
const seedFor = (base, n) => hashString(`${base}:${n}`) & 0x1fffff;

function makeCreature(kind, world, x, y, args = {}, seed) {
  let sn = null;
  if (seed === undefined) {
    if (world.seedBase != null) { sn = world.spawnCount++; seed = seedFor(world.seedBase, sn); } else seed = newSeed();
  }
  const c = withSeed(seed, () => CREATE[kind](world, x, y, args));
  c.make = kind; c.seed = seed; c.args = args; c.sn = sn;
  return c;
}

// Something frightening at (x, y): run from it for a while. Fish steer away from
// it (their dread); everything else picks somewhere well away to be.
function startle(world, o, x, y, secs) {
  const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy) || 1, run = rand(60, 130);
  o.dread = { x, y, t: secs };
  o.tx = clamp(o.x + dx / d * run, 8, world.W - 8); o.ty = clamp(o.y + dy / d * run, 8, world.H - 8);
  o.timer = Math.max(o.timer || 0, secs);
  if (o.species === 'gull') { if (o.mode === 'walk' || o.mode === 'land') o.mode = 'rise'; return; }
  if ('mode' in o) o.mode = o.species === 'dragonfly' ? 'dart' : 'walk';
  if (o.species === 'frog' && o.state === 'sit') { o.state = 'swim'; o.pad = null; }
}

// ---- base ------------------------------------------------------------------

class Creature {
  constructor(world, x, y) {
    this.x = x; this.y = y;
    this.heading = rand(-PI, PI);
    this.speed = 0;
    this.tx = x; this.ty = y;
    this.timer = 0;
    this.phase = rand(0, TAU);
    this.grabbed = false;
  }

  hit(px, py) {
    const b = this.body;
    for (let i = 0; i < b.n; i++) {
      const r = b.w[i] + 2;
      if ((b.x[i] - px) ** 2 + (b.y[i] - py) ** 2 < r * r) return true;
    }
    return false;
  }

  // Push away from tank walls and from rocks tall enough to be in the way.
  avoid(world, clearZ, margin = 16) {
    let fx = 0, fy = 0;
    const { W, H } = world;
    if (!this.leaving) {
      if (this.x < margin) fx += (margin - this.x) / margin;
      if (this.x > W - margin) fx -= (this.x - (W - margin)) / margin;
      if (this.y < margin) fy += (margin - this.y) / margin;
      if (this.y > H - margin) fy -= (this.y - (H - margin)) / margin;
    }
    // The beach: water animals keep a margin of water between them and the
    // waterline, looking ahead as well as where they are, so a falling tide
    // turns them back before they're left in the shallows.
    if (world.shore && !AMPHIBIOUS.has(this.species)) {
      // (Never below the open water's own level, or every fish would flee the beach at a spring low tide.)
      const lim = Math.max(0.02, world.tide.level - (this.shoreMargin ?? SHORE_MARGIN)), ah = this.heading;
      const e = Math.max(shoreAt(world, this.x, this.y), shoreAt(world, this.x + Math.cos(ah) * 12, this.y + Math.sin(ah) * 12));
      if (e > lim) {
        // Push down the slope toward open water, whichever way it runs here (islands too).
        const f = Math.min(4, 0.6 + (e - lim) * 16), x = this.x, y = this.y;
        const gx = shoreAt(world, x + 4, y) - shoreAt(world, x - 4, y), gy = shoreAt(world, x, y + 4) - shoreAt(world, x, y - 4), gl = Math.hypot(gx, gy);
        const [nx, ny] = gl > 0.004 ? [gx / gl, gy / gl] : world.shoreN;
        fx -= nx * f; fy -= ny * f;
      }
    }
    for (const r of world.rocks) {
      if (r.h + 2 < clearZ) continue;
      const dx = this.x - r.x, dy = this.y - r.y, d = Math.hypot(dx, dy) || 1;
      const lim = Math.max(r.a, r.b) + 6;
      if (d < lim) {
        const f = (lim - d) / lim * 1.6;
        fx += dx / d * f; fy += dy / d * f;
      }
    }
    return [fx, fy];
  }

  newTarget(world, avoidRocks) {
    const m = Math.min(28, world.W * 0.15, world.H * 0.15), wet = world.shore && !AMPHIBIOUS.has(this.species);
    // More often than not, head for somewhere this species likes (less often where it's crowded:
    // a horde spreads out over the pond instead of circling one patch).
    const crowd = typeof crowdAt === 'function' ? crowdAt(world, this.x, this.y) : 0;
    if (this.life && Math.random() < 0.55 / (1 + crowd / 6) && typeof likedSpot === 'function') {
      const s = likedSpot(world, this);
      if (s) {
        const a = rand(0, TAU), R = spotRadius(s) + rand(3, 14);
        const x = clamp(s.x + Math.cos(a) * R, m, world.W - m), y = clamp(s.y + Math.sin(a) * R, m, world.H - m);
        if ((!wet || shoreAt(world, x, y) <= world.tide.level - (this.shoreMargin ?? SHORE_MARGIN) - 0.06) && (!this.keepIn || this.keepIn(world, x, y))) {
          this.tx = x; this.ty = y;
          return;
        }
      }
    }
    // Anywhere open: the least crowded of the first few good spots (so a horde spreads over the pond).
    let best = null, be = Infinity, good = null, gc = Infinity, ok = 0;
    for (let tries = 0; tries < 12 && ok < 4; tries++) {
      const x = rand(m, world.W - m), y = rand(m, world.H - m);
      if (this.keepIn && !this.keepIn(world, x, y)) continue;
      const e = wet ? shoreAt(world, x, y) : 0;
      if (e < be) { be = e; best = [x, y]; }
      if (wet && e > world.tide.level - SHORE_MARGIN - 0.06) continue;
      if (!avoidRocks || !world.rocks.some((r) => Math.hypot(r.x - x, r.y - y) < Math.max(r.a, r.b) + 6)) {
        ok++;
        const n = typeof crowdAt === 'function' ? crowdAt(world, x, y) : 0;
        if (n < gc) { gc = n; good = [x, y]; }
        if (!n) break;
      }
    }
    if (good || best) [this.tx, this.ty] = good || best;
  }

  turnToward(angle, rate, dt) {
    const d = wrapAngle(angle - this.heading), m = rate * dt;
    this.heading = wrapAngle(this.heading + clamp(d, -m, m));
  }

  pointerGoal(world) {
    const p = world.pointer;
    const gx = p.x - this.x, gy = p.y - this.y;
    return [gx, gy, Math.min(Math.hypot(gx, gy) * 4, this.maxSpeed * 3)];
  }

  // The body along the spine, in one pass (Raster.strip: the same picture as a tube per link, far cheaper).
  drawSpine(r, from, to, z, hs, shader, id) {
    const b = this.body;
    r.strip(b.x, b.y, b.w, from, to, z, hs, shader, id);
  }

  drawEyes(r, off, inset, z, shine) {
    const b = this.body;
    for (const s of [-1, 1]) {
      const ex = b.px(0, s * off, -inset), ey = b.py(0, s * off, -inset);
      r.dot(ex, ey, z, this.eyeMat || EYE, this.id);
      if (shine) r.dot(ex - 0.6, ey - 0.6, z + 0.1, EYE_SHINE, this.id);
      if (typeof FINE !== 'undefined' && FINE.rec) FINE.eyes.push(ex, ey, this.id); // (close up, a glint in it: fine.js)
    }
  }
}

// ---- swimmers ----------------------------------------------------------------

class Fish extends Creature {
  constructor(world, x, y, spec) {
    super(world, x, y);
    Object.assign(this, spec);
    this.z = this.tz = rand(this.zMin, this.zMax);
    this.cruiseNow = this.cruise;
    this.body = new Chain(x, y, this.heading, this.links, this.widths, this.constraint);
    this.id = newId(this.outline);
  }

  update(dt, world) {
    this.timer -= dt;
    let gx, gy, want;
    if (this.grabbed) {
      [gx, gy, want] = this.pointerGoal(world);
      this.tz = this.zMax;
    } else {
      const hungry = !this.life || this.life.energy < 0.8;
      const prey = this.prey && !this.prey.caught && !this.prey.gone ? this.prey : null;
      const f = prey || world.nearestFood(this.x, this.y, this.sight * (hungry ? 1.4 : 1),
        (fd) => (hungry || fd.fed) && (!this.foodFilter || this.foodFilter(fd)));
      this.chasing = !!f;
      if (f) {
        gx = f.x - this.x; gy = f.y - this.y;
        want = this.maxSpeed * (prey ? (1.05 + 0.4 * (typeof hungerOf === 'function' ? hungerOf(this) : 0.5)) * (typeof huntBurst === 'function' ? huntBurst(this) : 1) : 1); // the hungrier, the harder it chases
        this.tz = clamp(f.z, this.zMin * 0.4, this.zMax);
        const reach = (this.widths[0] + 1.2 + (prey ? prey.body.w[0] : 0)) * (prey && typeof huntReach === 'function' ? huntReach(this) : 1);
        if (Math.hypot(gx, gy) < reach && Math.abs(f.z - this.z) < 8) {
          eat(world, this, f);
          this.timer = 0;
        }
      } else {
        if (this.timer <= 0 || Math.hypot(this.tx - this.x, this.ty - this.y) < 8) this.wander(world);
        gx = this.tx - this.x; gy = this.ty - this.y;
        want = this.cruiseNow * activity(world, this);
      }
      const p = world.pointer;
      if (this.skittish && p.inside && !world.grab) {
        const dx = this.x - p.x, dy = this.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d < 22) {
          const k = (22 - d) / 22 * 4, gl = Math.hypot(gx, gy) || 1;
          gx = gx / gl + dx / d * k; gy = gy / gl + dy / d * k;
          want = this.maxSpeed;
        }
      }
      const th = this.threat || this.dread;
      if (th) {
        const dx = this.x - th.x, dy = this.y - th.y, d = Math.hypot(dx, dy) || 1, gl = Math.hypot(gx, gy) || 1, k = this.threat ? 4 : 5;
        gx = gx / gl + dx / d * k; gy = gy / gl + dy / d * k;
        want = this.maxSpeed;
      }
    }
    if (this.hold > world.t) want = Math.min(want, 0.4); // (holding still: being cleaned, say)
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl; gy /= gl;
    if (!this.grabbed) {
      const [ax, ay] = this.avoid(world, this.z);
      const [sx, sy] = this.social(world);
      const [dx, dy] = deepPush(world, this);
      const [ex, ey] = typeof eldPush === 'function' ? eldPush(world, this) : [0, 0]; // everyone keeps clear of the marked
      const [px, py] = this.personalSpace(world, dt), pk = this.chasing ? 0.3 : 1; // (going for food or prey, it shoulders in)
      gx += ax * 2 + sx + dx + ex + px * pk; gy += ay * 2 + sy + dy + ey + py * pk;
    }
    const sp = this.speed / this.maxSpeed;
    this.turnToward(Math.atan2(gy, gx), this.turnRate * (this.grabbed ? 3 : 0.6 + sp), dt);
    this.speed += (want - this.speed) * Math.min(1, dt * 1.8);
    // Tail-beat: the head sways around its heading, and the chain turns that into a travelling wave.
    this.phase += dt * this.wiggleFreq * (0.35 + sp);
    // Too near a transcendent thing, a fish swims wrong: jerking, twitching, off course.
    if (this.maddened) this.heading = wrapAngle(this.heading + (Math.random() - 0.5) * dt * 10);
    const dir = this.heading + Math.sin(this.phase) * this.wiggleAmp * (0.25 + Math.min(sp, 1.2)) * (this.maddened ? 2.5 : 1);
    this.x = clamp(this.x + Math.cos(dir) * this.speed * dt, 1, world.W - 1);
    this.y = clamp(this.y + Math.sin(dir) * this.speed * dt, 1, world.H - 1);
    this.z += (this.tz - this.z) * Math.min(1, dt * 0.6);
    this.body.resolve(this.x, this.y, dir);
  }

  wander(world) {
    this.newTarget(world, this.zMax < 8);
    this.timer = rand(3, 9);
    this.cruiseNow = this.cruise * (Math.random() < 0.2 ? 0.3 : rand(0.6, 1.1));
    // In a crowd it sets off properly for somewhere emptier, and keeps going.
    if (typeof crowdAt === 'function' && crowdAt(world, this.x, this.y) >= 10) { this.timer = rand(12, 20); this.cruiseNow = this.cruise * rand(0.9, 1.2); }
    this.tz = rand(this.zMin, this.zMax);
    if (typeof deepZ === 'function') this.tz = deepZ(world, this, this.tz); // over the deep: up at night, down by day
    // Out of its active hours it rests: near cover, low down, drifting slowly.
    if (this.life && activity(world, this) < 0.55 && !this.alwaysSwims) {
      const s = (typeof crowdAt !== 'function' || crowdAt(world, this.x, this.y) < 10 || Math.random() < 0.3) && likedSpot(world, this);
      if (s) { const a = rand(0, TAU), R = spotRadius(s) + rand(2, 8); this.tx = clamp(s.x + Math.cos(a) * R, 8, world.W - 8); this.ty = clamp(s.y + Math.sin(a) * R, 8, world.H - 8); }
      this.tz = this.zMin;
      this.timer = rand(7, 15);
      this.cruiseNow = this.cruise * 0.3;
    }
  }

  social() { return [0, 0]; }

  // Personal space: a swimmer eases away from others pressed right up against it, so a crowd
  // spreads out instead of heaping on one spot. (A few times a second, from the neighbour grid;
  // a school's own boids already do this, and a hunter doesn't shy from its quarry.)
  personalSpace(world, dt) {
    if ((this.spaceT = (this.spaceT ?? Math.random() * 0.25) - dt) > 0) return this.space || NO_SPACE;
    this.spaceT = 0.25;
    if (this.school || typeof forNear !== 'function' || !this.body) return (this.space = NO_SPACE);
    const R = Math.min(16, this.body.w[0] * 2.2 + 5);
    let sx = 0, sy = 0, n = 0;
    forNear(world, this.x, this.y, R, (o, d2) => {
      if (o === this || n >= 14 || !o.body || o === this.prey || o.grabbed || Math.abs((o.z || 0) - this.z) > 8) return;
      n++;
      if (d2 < 0.01) { const a = Math.random() * TAU; sx += Math.cos(a); sy += Math.sin(a); return; }
      const d = Math.sqrt(d2), f = (R - d) / R;
      sx += (this.x - o.x) / d * f; sy += (this.y - o.y) / d * f;
    });
    const m = Math.hypot(sx, sy), k = 1.4;
    return (this.space = m > 1 ? [sx / m * k, sy / m * k] : [sx * k, sy * k]);
  }
}
const NO_SPACE = [0, 0];

const KOI_VARIETIES = [
  { base: 'koiWhite', fin: 'finWhite', spots: [['koiRed', 0.5]] },                       // kohaku
  { base: 'koiBlack', fin: 'finDark', spots: [['koiRed', 0.56], ['koiWhite', 0.64]] },    // showa
  { base: 'koiWhite', fin: 'finWhite', spots: [['koiRed', 0.52], ['koiBlack', 0.7]] },    // sanke
  { base: 'koiGold', fin: 'finGold', spots: [] },                                         // ogon
  { base: 'koiWhite', fin: 'finWhite', tancho: true },                                    // tancho
  { base: 'koiRed', fin: 'finRed', spots: [['koiWhite', 0.66]] },                        // orange
  { base: 'koiBronze', fin: 'finRed', spots: [] },                                        // chagoi
  { base: 'koiSlate', fin: 'finWhite', asagi: true },                                     // asagi
];

class Koi extends Fish {
  constructor(world, x, y, variety = randi(0, KOI_VARIETIES.length - 1)) {
    const v = KOI_VARIETIES[variety];
    const s = rand(0.85, 1.15);
    super(world, x, y, {
      species: 'koi',
      links: new Array(11).fill(3.2 * s),
      widths: [3.7, 4.5, 4.6, 4.6, 4.2, 3.5, 2.8, 2.1, 1.8, 1.0, 0, 0].map((w) => w * s),
      constraint: PI / 8,
      cruise: 9, maxSpeed: 20, turnRate: 1.6,
      wiggleAmp: 0.2, wiggleFreq: 6,
      zMin: 10, zMax: 28, sight: 90, skittish: false,
      outline: outlineOf(PAL[v.base]),
    });
    this.variety = variety;
    this.fin = PAL[v.fin];
    const sx = rand(0, 100), sy = rand(0, 100);
    const base = PAL[v.base], spots = (v.spots || []).map(([m, th], k) => [PAL[m], th, k * 31]);
    this.skin = bakeShader((u, vv) => {
      if (v.tancho) return (u - 0.1) ** 2 * 60 + vv * vv * 0.6 < 0.3 ? PAL.koiRed : base;
      if (v.asagi) return Math.abs(vv) > 0.72 || u < 0.06 ? PAL.koiRed : base;
      let m = base;
      for (const [sm, th, o] of spots) if (vnoise(u * 7 + sx + o, vv * 1.8 + sy, o) > th) m = sm;
      return m;
    });
  }

  draw(r) {
    const b = this.body, w = b.w, z = this.z, id = this.id;
    this.drawSpine(r, 0, 9, z, 1, this.skin, id);
    if (r.lod > 1) { r.tube(b.x[9], b.y[9], w[9], z, b.x[11], b.y[11], w[9] * 3.3, z, 0.25, this.fin, id); return; } // (a dense crowd: the tail in one, no eyes)
    r.tube(b.x[9], b.y[9], w[9], z, b.x[10], b.y[10], w[9] * 2.1, z, 0.25, this.fin, id);
    r.tube(b.x[10], b.y[10], w[9] * 2.1, z, b.x[11], b.y[11], w[9] * 3.3, z, 0.25, this.fin, id);
    if (r.lod) { this.drawEyes(r, 1.15, 1.1, z + w[0] + 0.6, false); return; } // (in a crowd: no small fins)
    for (const s of [-1, 1]) {
      r.ellipsoid(b.px(3, s * PI / 3, 0), b.py(3, s * PI / 3, 0), w[3] * 0.92, w[3] * 0.36, b.a[2] - s * PI / 4, z + 0.3, 0.5, this.fin, id);
      r.ellipsoid(b.px(7, s * PI / 2, 0), b.py(7, s * PI / 2, 0), w[3] * 0.55, w[3] * 0.2, b.a[6] - s * PI / 4, z + 0.3, 0.4, this.fin, id);
    }
    r.tube(b.x[4], b.y[4], 0.8, z + w[4] + 0.1, b.x[7], b.y[7], 0.6, z + w[7] + 0.1, 0.6, this.fin, id);
    this.drawEyes(r, 1.15, 1.1, z + w[0] + 0.6, false);
  }
}

class Tetra extends Fish {
  constructor(world, x, y, school) {
    const lemon = school.kind === 'lemon';
    super(world, x, y, {
      species: 'tetra',
      links: new Array(6).fill(1.3),
      widths: [0.9, 1.25, 1.3, 1.1, 0.8, 0, 0],
      constraint: PI / 6,
      cruise: 14, maxSpeed: 30, turnRate: 5,
      wiggleAmp: 0.35, wiggleFreq: 14,
      zMin: 14, zMax: 32, sight: 55, skittish: true,
      outline: hexToInt('#0a1a2a'),
    });
    this.school = school;
    this.ox = rand(-10, 10); this.oy = rand(-10, 10);
    this.skin = lemon ? PAL.lemon : (u) => (u < 0.55 ? PAL.neon : PAL.tetraRed);
    this.fin = PAL.tetraFin;
  }

  wander(world) {
    const s = this.school;
    if (s.until <= world.t) {
      const m = Math.min(28, world.W * 0.15, world.H * 0.15);
      [s.tx, s.ty] = wetPoint(world, m, Math.max(0, world.tide.level - SHORE_MARGIN - 0.06));
      const fav = Math.random() < 0.5 && typeof likedSpot === 'function' && likedSpot(world, this);
      if (fav && shoreAt(world, fav.x, fav.y) <= world.tide.level - SHORE_MARGIN - 0.06) { s.tx = fav.x + rand(-10, 10); s.ty = fav.y + rand(-10, 10); }
      s.tz = rand(this.zMin, this.zMax);
      if (typeof deepZ === 'function') s.tz = deepZ(world, { x: s.tx, y: s.ty, zMin: this.zMin, species: this.species }, s.tz); // the school rises and sinks together
      s.until = world.t + rand(3, 7);
    }
    this.tx = s.tx + this.ox; this.ty = s.ty + this.oy;
    this.tz = s.tz + rand(-3, 3);
    this.timer = rand(0.5, 1.5);
    this.cruiseNow = this.cruise * rand(0.8, 1.1);
  }

  // Boids: separation, alignment, cohesion within the same school.
  social(world) {
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
    for (const o of world.creatures) {
      if (o === this || o.school !== this.school) continue;
      const dx = o.x - this.x, dy = o.y - this.y, d2 = dx * dx + dy * dy;
      if (d2 > 400) continue;
      n++;
      ax += Math.cos(o.heading); ay += Math.sin(o.heading);
      cx += dx; cy += dy;
      if (d2 < 49) { const d = Math.sqrt(d2) || 1; sx -= dx / d * (7 - d) / 7; sy -= dy / d * (7 - d) / 7; }
    }
    if (!n) return [0, 0];
    return [sx * 2.2 + ax / n * 0.7 + cx / n * 0.03, sy * 2.2 + ay / n * 0.7 + cy / n * 0.03];
  }

  draw(r) {
    const b = this.body, z = this.z, id = this.id;
    this.drawSpine(r, 0, 4, z, 1, this.skin, id);
    r.tube(b.x[4], b.y[4], 0.6, z, b.x[5], b.y[5], 1.0, z, 0.3, this.fin, id);
    r.tube(b.x[5], b.y[5], 1.0, z, b.x[6], b.y[6], 1.5, z, 0.3, this.fin, id);
  }
}

const EEL_VARIETIES = [
  { skin: 'moray', spot: 'morayDot', mode: 'spots', habitat: 'salt' },
  { skin: 'ribbon', spot: 'ribbonFin', mode: 'ribbon', habitat: 'salt' },
  { skin: 'snowflake', spot: 'snowBlot', mode: 'blotch', habitat: 'salt' },
  { skin: 'eelFresh', spot: 'eelFreshBelly', mode: 'plain', habitat: 'fresh' },
];

class Eel extends Fish {
  constructor(world, x, y) {
    const v = pick(EEL_VARIETIES.filter((e) => fitsHabitat(world, e.habitat)));
    const n = 34;
    super(world, x, y, {
      species: 'eel',
      links: new Array(n - 1).fill(1.7),
      widths: Array.from({ length: n }, (_, i) => (i === 0 ? 1.5 : i === 1 ? 1.8 : Math.max(0.5, 2.0 - i * 0.045))),
      constraint: PI / 7,
      cruise: 8, maxSpeed: 18, turnRate: 2.2,
      wiggleAmp: 0.55, wiggleFreq: 4.5,
      zMin: 1.5, zMax: 5, sight: 70, skittish: false,
      outline: outlineOf(PAL[v.skin]),
    });
    const base = PAL[v.skin], spot = PAL[v.spot], sx = rand(0, 100);
    this.skin = bakeShader((u, vv) => {
      if (v.mode === 'ribbon') return Math.abs(vv) < 0.3 || u < 0.04 ? spot : base;
      if (v.mode === 'plain') return Math.abs(vv) > 0.72 ? spot : base;
      if (v.mode === 'blotch') {
        if (vnoise(u * 22 + sx, vv * 1.5, 3) > 0.6) return spot;
        return vnoise(u * 60 + sx, vv * 3, 9) > 0.78 ? PAL.morayDot : base;
      }
      return vnoise(u * 55 + sx, vv * 3, 5) > 0.62 ? spot : base;
    }, 160, 8);
  }

  draw(r) {
    this.drawSpine(r, 0, this.body.n - 1, this.z, 0.9, this.skin, this.id);
    this.drawEyes(r, 0.9, 0.6, this.z + this.body.w[0] + 0.6, false);
  }
}

// ---- walkers -------------------------------------------------------------------
// Feet stay planted until the body pulls too far from them, then step in
// diagonal pairs (a trot), like the lizard in the original sketch.

class Walker extends Creature {
  constructor(world, x, y, spec) {
    super(world, x, y);
    Object.assign(this, spec);
    this.z = this.zBody;
    this.mode = 'pause';
    this.body = new Chain(x, y, this.heading, this.links, this.widths, this.constraint);
    this.id = newId(this.outline);
    this.legs = this.legs.map((l) => ({
      ang: l.side * l.off, sAng: l.side * PI / 2, bend: l.side, ...l,
      fx: 0, fy: 0, sx: 0, sy: 0, ex: 0, ey: 0, dfx: 0, dfy: 0, t: 1, stepping: false, lift: 0,
    }));
    for (const L of this.legs) [L.fx, L.fy] = this.footRest(L);
    this.updateLegs(0);
  }

  // Frame the legs are laid out in; crabs override this to face sideways.
  legBase(L) { return this.body.a[L.bi]; }

  // Head for a spot on dry sand just above the waterline (turtles basking,
  // crabs foraging the bared beach), marked to rest there a good while.
  haulOut(world) {
    if (!world.shore) return false;
    for (let i = 0; i < 24; i++) {
      const x = rand(10, world.W - 10), y = rand(10, world.H - 10), e = shoreAt(world, x, y);
      if (e > world.tide.level + 0.02 && e < world.tide.level + 0.25 && Math.hypot(x - this.x, y - this.y) < 260) {
        this.tx = x; this.ty = y; this.restHere = true;
        return true;
      }
    }
    return false;
  }

  footRest(L) {
    const b = this.body, a = this.legBase(L) + L.ang, d = b.w[L.bi] + L.reach;
    return [b.x[L.bi] + Math.cos(a) * d, b.y[L.bi] + Math.sin(a) * d];
  }

  postMove() {}

  update(dt, world) {
    this.timer -= dt;
    let gx = Math.cos(this.heading), gy = Math.sin(this.heading), want = 0;
    if (this.grabbed) {
      [gx, gy, want] = this.pointerGoal(world);
    } else {
      const hungry = !this.life || this.life.energy < 0.8;
      const f = world.nearestFood(this.x, this.y, this.sight, (fd) => fd.z < 3 && (hungry || fd.fed));
      if (f) {
        gx = f.x - this.x; gy = f.y - this.y;
        want = this.maxSpeed;
        if (Math.hypot(gx, gy) < this.widths[0] + 1.5) eat(world, this, f);
      } else if (this.mode === 'walk') {
        if (this.timer <= 0 || Math.hypot(this.tx - this.x, this.ty - this.y) < 6) {
          const act = activity(world, this);
          if (Math.random() < 0.35 + 0.5 * (1 - act)) { this.mode = 'pause'; this.timer = rand(1, 4) * (2.5 - act) * (this.restHere ? 5 : 1); this.restHere = false; }
          else { this.newTarget(world, true); this.timer = rand(3, 7); }
        }
        gx = this.tx - this.x; gy = this.ty - this.y;
        want = this.mode === 'walk' ? this.cruise * Math.max(0.5, activity(world, this)) : 0;
      } else if (this.timer <= 0) {
        this.mode = 'walk';
        this.newTarget(world, true);
        this.timer = rand(3, 8);
      }
    }
    if (this.hold > world.t) want = Math.min(want, 0.4); // (holding still: being cleaned, say)
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl; gy /= gl;
    if (!this.grabbed) {
      const [ax, ay] = this.avoid(world, 0), [dx, dy] = deepPush(world, this);
      gx += ax * 2.5 + dx; gy += ay * 2.5 + dy;
    }
    const sp = this.speed / this.maxSpeed;
    this.turnToward(Math.atan2(gy, gx), this.turnRate * (this.grabbed ? 3 : 0.2 + sp), dt);
    this.speed += (want - this.speed) * Math.min(1, dt * 3);
    this.phase += this.speed * dt * this.gaitK;
    const dir = this.heading + Math.sin(this.phase) * this.wiggleAmp * Math.min(1, sp * 1.5);
    this.x = clamp(this.x + Math.cos(dir) * this.speed * dt, 1, world.W - 1);
    this.y = clamp(this.y + Math.sin(dir) * this.speed * dt, 1, world.H - 1);
    this.body.resolve(this.x, this.y, dir);
    this.postMove(dt);
    this.updateLegs(dt);
  }

  updateLegs(dt) {
    const b = this.body, lead = Math.min(1, this.speed / this.maxSpeed), a = this.heading;
    for (const L of this.legs) {
      const [wx, wy] = this.footRest(L);
      if (!L.stepping) {
        const d = Math.hypot(wx - L.fx, wy - L.fy);
        const busy = this.legs.some((o) => o.stepping && o.group !== L.group);
        if ((d > L.stepDist && !busy) || d > L.stepDist * 2.2) {
          L.stepping = true; L.t = 0; L.ox = L.fx; L.oy = L.fy;
        }
      }
      if (L.stepping) {
        L.t = Math.min(1, L.t + dt / this.stepDur);
        const e = L.t * L.t * (3 - 2 * L.t);
        const tx = wx + Math.cos(a) * L.stepDist * 0.45 * lead, ty = wy + Math.sin(a) * L.stepDist * 0.45 * lead;
        L.fx = lerp(L.ox, tx, e); L.fy = lerp(L.oy, ty, e);
        L.lift = Math.sin(PI * L.t) * this.lift;
        if (L.t >= 1) { L.stepping = false; L.lift = 0; }
      }
      const sa = this.legBase(L) + L.sAng, sd = b.w[L.bi] - L.inset;
      L.sx = b.x[L.bi] + Math.cos(sa) * sd;
      L.sy = b.y[L.bi] + Math.sin(sa) * sd;
      [L.ex, L.ey, L.dfx, L.dfy] = solveLimb(L.sx, L.sy, L.fx, L.fy, L.l1, L.l2, L.bend);
    }
  }

  drawLegs(r, m) {
    const z = this.zBody, id = this.id, a = this.body.a;
    for (const L of this.legs) {
      const ez = 0.8 + L.lift * 0.7;
      r.tube(L.sx, L.sy, L.r1, z + 0.6, L.ex, L.ey, L.r2, ez, 0.8, m, id);
      r.tube(L.ex, L.ey, L.r2, ez, L.dfx, L.dfy, L.r2 * 0.9, L.lift, 0.8, m, id);
      r.ellipsoid(L.dfx, L.dfy, L.foot, L.foot * 0.8, a[L.bi], L.lift, 0.8, m, id);
    }
  }
}

const legSpec = (front, back, common) => [
  { ...common, ...front, side: 1, group: 0 },
  { ...common, ...front, side: -1, group: 1 },
  { ...common, ...back, side: 1, group: 1 },
  { ...common, ...back, side: -1, group: 0 },
];

const AXOLOTL_VARIETIES = [
  { skin: 'axoPink', gill: 'axoGill' },
  { skin: 'axoWild', gill: 'axoWildGill', spot: 'axoWildSpot' },
  { skin: 'axoGold', gill: 'axoGoldGill' },
  { skin: 'axoBlack', gill: 'axoBlackGill' },
];

class Axolotl extends Walker {
  constructor(world, x, y) {
    const v = pick(AXOLOTL_VARIETIES);
    super(world, x, y, {
      species: 'axolotl',
      links: new Array(16).fill(1.45),
      widths: [2.4, 3.1, 3.2, 2.6, 2.0, 2.2, 2.4, 2.4, 2.2, 1.9, 1.6, 1.4, 1.2, 1.0, 0.8, 0.6, 0.4],
      constraint: PI / 8,
      cruise: 6, maxSpeed: 13, turnRate: 1.8,
      wiggleAmp: 0.22, gaitK: 0.9, stepDur: 0.22, lift: 1.2, zBody: 1.0, sight: 60,
      outline: outlineOf(PAL[v.skin]),
      legs: legSpec(
        { bi: 4, off: PI / 4, reach: 2.4 },
        { bi: 9, off: PI / 3, reach: 2.2 },
        { l1: 2.0, l2: 1.9, inset: 0.6, stepDist: 3.2, r1: 0.9, r2: 0.75, foot: 1.0 },
      ),
    });
    const base = PAL[v.skin], spot = v.spot && PAL[v.spot], fin = mixColor(base[3], base[2], 0.4), sx = rand(0, 100);
    this.finMat = [base[2], base[3], fin, base[3]];
    this.gill = PAL[v.gill];
    this.skinMat = base;
    this.skin = bakeShader((u, vv) => {
      if (u > 0.55 && Math.abs(vv) > 0.7) return this.finMat;
      if (spot && vnoise(u * 26 + sx, vv * 3, 4) > 0.68) return spot;
      return base;
    });
  }

  draw(r, t) {
    const b = this.body, z = this.zBody, id = this.id;
    this.drawSpine(r, 0, 9, z, 0.85, this.skin, id);
    this.drawSpine(r, 9, b.n - 1, z, 0.55, this.skin, id);
    this.drawLegs(r, this.skinMat);
    // Three feathery gill stalks per side, swaying gently.
    for (const s of [-1, 1]) {
      const bx = b.px(1, s * (PI / 2 + 0.2), -0.5), by = b.py(1, s * (PI / 2 + 0.2), -0.5);
      for (let k = 0; k < 3; k++) {
        const a = b.a[1] + PI - s * (0.6 + k * 0.45) + Math.sin(t * 2.2 + k * 1.3 + s) * 0.14;
        const ex = bx + Math.cos(a) * 3.2, ey = by + Math.sin(a) * 3.2;
        r.tube(bx, by, 0.8, z + 1.6, ex, ey, 0.55, z + 2.4, 0.7, this.gill, id);
        r.ellipsoid(ex, ey, 1.0, 0.8, a, z + 2.2, 0.8, this.gill, id);
      }
    }
    this.drawEyes(r, 1.2, 0.7, z + b.w[0] * 0.85 + 1, false);
  }
}

class Turtle extends Walker {
  // By day, a turtle that isn't hungry often hauls out onto the beach to bask.
  newTarget(world, avoidRocks) {
    if (world.darkness < 0.3 && (!this.life || this.life.energy > 0.5) && Math.random() < 0.35 && this.haulOut(world)) return;
    super.newTarget(world, avoidRocks);
  }

  constructor(world, x, y) {
    super(world, x, y, {
      species: 'turtle',
      links: [2.2, 3.0, 3.4, 3.4, 2.4, 1.8],
      widths: [1.7, 1.2, 3.0, 3.4, 3.0, 1.0, 0.5],
      constraint: PI / 10,
      cruise: 4, maxSpeed: 9, turnRate: 1.0,
      wiggleAmp: 0.04, gaitK: 0.6, stepDur: 0.35, lift: 0.8, zBody: 1.2, sight: 70,
      outline: hexToInt('#10160a'),
      legs: legSpec(
        { bi: 2, off: 1.1, reach: 4.2, l1: 2.6, l2: 2.6 },
        { bi: 4, off: 2.0, reach: 3.2, l1: 2.2, l2: 2.2 },
        { inset: 0.8, stepDist: 3, r1: 1.2, r2: 1.0, foot: 1.3 },
      ),
    });
    this.head = (u, vv) => (u > 0.3 && Math.abs(vv) > 0.55 ? PAL.turtleEar : PAL.turtleSkin);
    this.shell = bakeShader((lx, ly) => {
      const d2 = lx * lx + ly * ly;
      if (d2 > 0.78) {
        const k = ((Math.atan2(ly, lx) + PI) / TAU * 22) % 1;
        return k < 0.12 ? PAL.turtleSeam : PAL.turtleRim;
      }
      const ay = Math.abs(ly);
      if (Math.abs(ay - 0.36) < 0.09) return PAL.turtleSeam;
      const cuts = ay < 0.36 ? [-0.38, 0.02, 0.42] : [-0.18, 0.28];
      for (const c of cuts) if (Math.abs(lx - c) < 0.07) return PAL.turtleSeam;
      return PAL.turtleShell;
    }, 48, 48, -1);
  }

  draw(r) {
    const b = this.body, z = this.zBody, id = this.id;
    this.drawSpine(r, 1, b.n - 1, z, 0.8, PAL.turtleSkin, id);
    r.tube(b.x[0], b.y[0], b.w[0], z + 0.8, b.x[1], b.y[1], b.w[1], z + 0.6, 0.9, this.head, id);
    this.drawLegs(r, PAL.turtleSkin);
    r.ellipsoid(b.x[3], b.y[3], 7.4, 5.9, b.a[3], z + 0.4, 5.2, this.shell, id);
    this.drawEyes(r, 1.0, 0.5, z + b.w[0] + 1.2, false);
  }
}

Object.assign(CREATE, {
  koi: (w, x, y, a) => new Koi(w, x, y, a.variety),
  tetra: (w, x, y, a) => new Tetra(w, x, y, a.school),
  eel: (w, x, y) => new Eel(w, x, y),
  axolotl: (w, x, y) => new Axolotl(w, x, y),
  turtle: (w, x, y) => new Turtle(w, x, y),
});

const SPECIES = {
  koi: { label: 'Koi', color: '#e5602f', spawn: (w, x, y) => [makeCreature('koi', w, x, y)] },
  tetra: {
    label: 'Tetras', color: '#2fb8f0',
    spawn: (w, x, y) => {
      const school = { tx: x, ty: y, tz: 22, until: 0, kind: Math.random() < 0.3 ? 'lemon' : 'neon' };
      return Array.from({ length: randi(9, 14) }, () => makeCreature('tetra', w, x + rand(-8, 8), y + rand(-8, 8), { school }));
    },
  },
  eel: { label: 'Eel', color: '#617a22', spawn: (w, x, y) => [makeCreature('eel', w, x, y)] },
  axolotl: { label: 'Axolotl', color: '#f4a9bb', spawn: (w, x, y) => [makeCreature('axolotl', w, x, y)] },
  turtle: { label: 'Turtle', color: '#6a5a28', spawn: (w, x, y) => [makeCreature('turtle', w, x, y)] },
};
