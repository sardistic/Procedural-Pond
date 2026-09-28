'use strict';
// Life on the beach itself. None of it is the pond's (no genes, not kept in saves, not yours to net
// or carry off: a click says what it is), but it lives off the pond and its sand:
//  - Sea turtles (salt and mixed ponds). On some dark nights a turtle comes in from the sea and hauls
//    herself up the beach in heaves, leaving a track like a tyre's. Above the high-water mark she digs,
//    lays, covers the nest and goes back down to the sea. Two or three pond days later, at dusk or dawn,
//    the nest hatches and the hatchlings run for the water. Gulls and ghost crabs take some; each that
//    makes it is worth a little essence. The tide washes the tracks away.
//  - Ghost crabs (salt and mixed): pale crabs with burrows high up the beach. Out at dusk and through
//    the night, they dash and freeze and dash, chase hatchlings, and duck into their holes when
//    anything comes near.
//  - Sandpipers (any beach): a little flock by day, running the water's edge as the waves come and go
//    and probing the wet sand, flying off low along the beach if you come close. They leave at dusk.

const SHORE_FX_ID = 8;
FADE[SHORE_FX_ID] = 1;
const SEA = {
  shell: mat('#2e2412', '#50401e', '#76602e', '#9c8446'), mottle: mat('#3a2410', '#5e3a18', '#864f22', '#aa6a34'),
  scute: mat('#1a1408', '#2c2210', '#40321a', '#564426'), rim: mat('#241c0e', '#3c3018', '#584626', '#766036'),
  skin: mat('#35382e', '#575c4c', '#7c826c', '#a4aa90'), hatch: mat('#121210', '#22221c', '#36362c', '#4c4c40'),
  ghost: mat('#8e826a', '#b8ac8e', '#dcd2b6', '#f6eed8'), eye: solid('#0c0c0c'),
  piper: mat('#5e5040', '#857258', '#a89274', '#cbb898'), belly: mat('#aaa89e', '#cfccc2', '#ebe8e0', '#ffffff'), bill: solid('#141414'), leg: solid('#3a3a30'),
};
const SEA_SHELL = bakeShader((lx, ly) => {
  if (lx * lx + ly * ly > 0.84) return SEA.rim;
  const ay = Math.abs(ly);
  if (Math.abs(ay - 0.34) < 0.07) return SEA.scute;
  for (const c of ay < 0.34 ? [-0.5, -0.1, 0.3, 0.64] : [-0.42, 0.02, 0.44]) if (Math.abs(lx - c) < 0.06) return SEA.scute;
  return vnoise((lx + 1) * 5, (ly + 1) * 5, 17) > 0.6 ? SEA.mottle : SEA.shell;
}, 48, 48, -1);
Object.assign(SINGULAR, { seaturtle: 'Sea turtle', hatchling: 'Turtle hatchling', ghostcrab: 'Ghost crab', sandpiper: 'Sandpiper' });
if (typeof GULL_PREY === 'object') GULL_PREY.hatchling = 0.5; // (a gull takes a running hatchling half the times it dives)

// ---- the beach, as they see it ------------------------------------------------------------------------
const seaTides = (world) => world.opts.habitat !== 'fresh';
// The highest the tide comes (at springs), with a little to spare: above it the sand stays dry.
const highWater = (world) => 0.5 + 0.32 * ((typeof TIDE_RANGE === 'object' && TIDE_RANGE[world.opts.habitat || 'mixed']) || 0.75) + 0.03;
const dryHigh = (world, x, y, m = 0) => shoreAt(world, x, y) > highWater(world) + m;
const seaward = (world) => [-world.shoreN[0], -world.shoreN[1]];
const alongBeach = (world) => [-world.shoreN[1], world.shoreN[0]];
// Downhill to the water from here (the slope of the sand, channels and islands included).
function downhill(world, x, y) {
  const gx = shoreAt(world, x + 3, y) - shoreAt(world, x - 3, y), gy = shoreAt(world, x, y + 3) - shoreAt(world, x, y - 3), gl = Math.hypot(gx, gy), [sx, sy] = seaward(world);
  return gl > 0.004 ? [-gx / gl * 0.7 + sx * 0.3, -gy / gl * 0.7 + sy * 0.3] : [sx, sy];
}
// The sand's own colour at a spot (as the sun lights it), a shade darker or lighter, for marks in it.
function sandAt(world, x, y, k = 0) {
  const bg = world.bg, p = clamp(x | 0, 0, world.W - 1) + clamp(y | 0, 0, world.H - 1) * world.W;
  const c = bg && bg[p] >>> 24 ? mixColor(bg[p], hexToInt('#fff0d2'), 0.18) : hexToInt('#d8c8a0');
  return k < 0 ? mixColor(c, 0xff000000, -k) : mixColor(c, 0xffffffff, k);
}
const flat = (c) => [c, c, c, c];
// The water's edge near a point (where the waves run up and back): the nearest of a few tries.
function swashNear(world, x, y, R) {
  // Straight up or down the beach from near here to the water's edge (the sand rises steadily up a beach).
  const [sx, sy] = seaward(world), lv = world.tide.level, a0 = rand(0, TAU), r0 = rand(0, R * 0.5);
  let px = clamp(x + Math.cos(a0) * r0, 6, world.W - 6), py = clamp(y + Math.sin(a0) * r0, 6, world.H - 6), e = shoreAt(world, px, py) - lv;
  const dir = e > 0 ? 1 : -1;
  for (let k = 0; k < 400; k++) {
    if (e >= -0.004 && e <= 0.02) return [px, py];
    const nx = px + sx * dir, ny = py + sy * dir;
    if (nx < 6 || ny < 6 || nx > world.W - 6 || ny > world.H - 6) break;
    const ne = shoreAt(world, nx, ny) - lv;
    if ((dir > 0 && ne < -0.004) || (dir < 0 && ne > 0.02)) return [px, py]; // (stepped right over it: as near as it gets)
    px = nx; py = ny; e = ne;
  }
  // (Or, failing that, the nearest of a few tries around.)
  let best = null, bd = Infinity;
  for (let k = 0; k < 28; k++) {
    const a = rand(0, TAU), d = rand(0, R * (k < 14 ? 1 : 2.5)), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (px < 6 || py < 6 || px > world.W - 6 || py > world.H - 6) continue;
    const e = shoreAt(world, px, py) - world.tide.level;
    if (e < -0.004 || e > 0.02) continue;
    const dd = (px - x) ** 2 + (py - y) ** 2;
    if (dd < bd) { bd = dd; best = [px, py]; }
  }
  return best;
}
function shoreLifeOf(world) {
  const key = String(world.seed); // (kept as the pond grows: shiftShoreLife moves it with the pond)
  if (!world.shoreLife || world.shoreLife.key !== key) world.shoreLife = { key, tracks: [], flicks: [], burrows: null, batches: [], flock: null, night: false, turtleAt: 0, tick: 0 };
  return world.shoreLife;
}

// The pond grows (away from the beach, or with the beach moving): everything here moves with it.
function shiftShoreLife(world, dx, dy, beach) {
  if (!dx && !dy) return;
  const S = world.shoreLife;
  if (S) {
    for (const o of [...S.tracks, ...S.flicks, ...S.batches, ...(S.flock ? [S.flock] : [])]) { o.x += dx; o.y += dy; }
    for (const b of S.burrows || []) { b[0] += dx; b[1] += dy; } // (in place: a crab's home is one of these)
  }
  for (const c of beach) {
    c.x += dx; c.y += dy;
    if (c.tx != null) { c.tx += dx; c.ty += dy; }
    if (c.body) for (let i = 0; i < c.body.n; i++) { c.body.x[i] += dx; c.body.y[i] += dy; }
    if (c.nest) c.nest = [c.nest[0] + dx, c.nest[1] + dy];
    if (c.lastTrack) c.lastTrack = [c.lastTrack[0] + dx, c.lastTrack[1] + dy];
    if (c.roost) c.roost = [c.roost[0] + dx, c.roost[1] + dy]; // (a tern's nest on its island: isles.js)
  }
}

// ---- sea turtles ------------------------------------------------------------------------------------
class SeaTurtle extends Creature {
  constructor(world, x, y, nest) {
    super(world, x, y);
    this.species = 'seaturtle'; this.ambient = true; this.noGrab = true;
    this.body = new Chain(x, y, this.heading, [3.2, 4.2, 5.2, 5.2, 3.4], [2.1, 1.6, 5.0, 5.8, 5.0, 1.4], PI / 12);
    this.id = newId(hexToInt('#12100a'));
    this.nest = nest; this.act = 'in'; this.timer = 0; this.stroke = 0; this.zb = 24; this.z = 24; this.alpha = 0; this.lastTrack = null;
    this.eggs = randi(8, 15);
    const [sx, sy] = seaward(world);
    this.heading = Math.atan2(-sy, -sx);
    this.body.place(x, y, this.heading);
  }
  update(dt, world) {
    const e = shoreAt(world, this.x, this.y), wet = e < world.tide.level - 0.015, [nx, ny] = this.nest;
    this.alpha = Math.min(1, (this.alpha ?? 1) + dt * 0.5);
    let gx = 0, gy = 0, want = 0;
    if (this.act === 'in') {
      gx = nx - this.x; gy = ny - this.y; want = wet ? 9 : 2.6;
      if (!wet && !this.landed) { this.landed = true; turtleAshore(world, this); }
      if (Math.hypot(gx, gy) < 2 || (!wet && this.timer > 60)) { this.act = 'dig'; this.timer = 9; }
      if (!wet) this.timer += dt;
    } else if (this.act === 'dig' || this.act === 'lay' || this.act === 'cover') {
      this.timer -= dt;
      if (this.act !== 'lay' && Math.random() < dt * 12) sandFlick(world, this.body.x[4], this.body.y[4], this.heading + PI);
      if (this.timer <= 0) {
        if (this.act === 'dig') { this.act = 'lay'; this.timer = 8; }
        else if (this.act === 'lay') { this.act = 'cover'; this.timer = 6; }
        else { layNest(world, this); this.act = 'back'; }
      }
    } else if (this.act === 'back') {
      [gx, gy] = downhill(world, this.x, this.y); want = wet ? 9 : 2.6;
      if (wet && e < world.tide.level - 0.07) { this.act = 'out'; this.timer = 22; }
    } else {
      [gx, gy] = seaward(world); want = 10; this.timer -= dt;
      if (this.timer < 3) this.alpha = Math.max(0, Math.min(this.alpha, this.timer / 3));
      if (this.timer <= 0 || this.x < -12 || this.y < -12 || this.x > world.W + 12 || this.y > world.H + 12) this.gone = true;
    }
    // High in the water out there, down on the bottom in the shallows, and on the sand.
    const zWant = wet ? clamp((world.tide.level - e) * 90, 1.4, 24) : 1.4;
    this.zb += (zWant - this.zb) * Math.min(1, dt * 1.5); this.z = this.zb;
    if (want > 0) {
      const gl = Math.hypot(gx, gy) || 1;
      this.turnToward(Math.atan2(gy / gl, gx / gl), 0.9, dt);
      // On land she heaves herself along, a pull at a time; in the water she flies.
      const pull = wet ? 1 : 0.3 + 0.7 * Math.max(0, Math.sin(this.stroke));
      this.speed += (want * pull - this.speed) * Math.min(1, dt * 3);
      this.stroke += dt * (wet ? 2.6 : 2.2);
    } else {
      this.speed *= Math.max(0, 1 - dt * 4);
      if (this.act === 'dig' || this.act === 'cover') this.stroke += dt * 6;
    }
    this.x += Math.cos(this.heading) * this.speed * dt; this.y += Math.sin(this.heading) * this.speed * dt;
    if (this.act !== 'out') { this.x = clamp(this.x, 2, world.W - 2); this.y = clamp(this.y, 2, world.H - 2); }
    this.body.resolve(this.x, this.y, this.heading);
    // Her track: flipper marks either side of the drag of her shell, in the dry sand.
    if (!wet && this.speed > 0.2) {
      const L = this.lastTrack, tx = this.body.x[4], ty = this.body.y[4];
      if (!L || Math.hypot(L[0] - tx, L[1] - ty) > 2.2) { this.lastTrack = [tx, ty]; addTrack(world, tx, ty, this.body.a[4], 4.4); }
    }
  }
  draw(r) {
    const b = this.body, z = this.zb, id = this.id, h = b.a[2], sw = Math.sin(this.stroke), dig = this.act === 'dig' || this.act === 'cover';
    for (const sd of [-1, 1]) {
      // Front flippers, long blades sweeping together: a heave on land, a wingbeat in the water.
      const sx = b.px(2, sd * PI / 2, -1.6), sy = b.py(2, sd * PI / 2, -1.6), a = h + sd * (PI / 2 - 0.25 + 0.55 * sw);
      const ex = sx + Math.cos(a) * 4.6, ey = sy + Math.sin(a) * 4.6, a2 = a + sd * 0.55;
      r.tube(sx, sy, 1.5, z + 0.5, ex, ey, 1.3, z + 0.4, 0.5, SEA.skin, id);
      r.tube(ex, ey, 1.3, z + 0.4, ex + Math.cos(a2) * 4.2, ey + Math.sin(a2) * 4.2, 0.6, z + 0.3, 0.5, SEA.skin, id);
      // Back flippers: short paddles (scooping, when she digs).
      const hx = b.px(4, sd * PI / 2, -1.2), hy = b.py(4, sd * PI / 2, -1.2), ba = h + PI - sd * (0.6 + (dig ? 0.5 * Math.sin(this.stroke + sd) : 0.15 * sw));
      r.tube(hx, hy, 1.1, z + 0.3, hx + Math.cos(ba) * 3.2, hy + Math.sin(ba) * 3.2, 0.9, z + 0.2, 0.5, SEA.skin, id);
    }
    r.tube(b.x[0], b.y[0], b.w[0], z + 1, b.x[1], b.y[1], b.w[1], z + 0.8, 0.9, SEA.skin, id);
    r.ellipsoid(b.x[3], b.y[3], 9.2, 7.4, b.a[3], z + 0.4, 5.6, SEA_SHELL, id);
    this.drawEyes(r, 1.1, 0.6, z + b.w[0] + 1.3, false);
  }
  doing() { return { in: 'hauling herself up the beach to nest', dig: 'digging a nest', lay: 'laying her eggs', cover: 'covering her nest', back: 'going back to the sea', out: 'swimming away' }[this.act]; }
  note() { return 'A sea turtle: she came in from the sea to lay her eggs above the tide, and she goes back when she is done. Two or three pond days later, at dusk or dawn, the hatchlings run for the water.'; }
}

// She's out of the water (the first ever gets a bigger line).
function turtleAshore(world, T) {
  const G = world.game;
  if (world.observe || !G) return;
  G.turtles = (G.turtles || 0) + 1;
  logEvent(world, G.turtles === 1 ? 'In the dark, something big hauled itself out of the sea: a sea turtle, dragging herself up the beach to nest'
    : 'A sea turtle came ashore in the dark to nest', null, { cat: 'come', pri: G.turtles === 1 ? 3 : 1 });
}
function layNest(world, T) {
  const G = world.game;
  if (!G) return;
  const N = { x: Math.round(T.x), y: Math.round(T.y), n: T.eggs, laid: Math.round(world.days * 1000) / 1000, due: Math.round((world.days + rand(2, 3.2)) * 1000) / 1000 };
  (G.nests || (G.nests = [])).push(N);
  if (!world.observe) logEvent(world, `The sea turtle laid ${N.n} eggs high on the beach and covered them over. They should hatch in two or three pond days, at dusk or dawn`, null, { cat: 'life', pri: 2 });
}
// Somewhere she'd nest: high and dry above the tides (walking in from the top of the beach, where
// the dry strip can be narrow), not on another nest or under a build.
function dryStripSpot(world, avoid, gap) {
  const along = world.shoreSide < 2 ? world.H : world.W;
  for (let k = 0; k < 60; k++) {
    const u = rand(8, along - 8);
    let dmax = 0;
    for (let d = 1; d < 80; d++) { const [x, y] = coastXY(world, d, u); if (!dryHigh(world, x, y, 0.005)) break; dmax = d; }
    if (dmax < 2) continue;
    const [x, y] = coastXY(world, rand(1, dmax), u);
    if (avoid.some((n) => Math.hypot((n.x ?? n[0]) - x, (n.y ?? n[1]) - y) < gap)) continue;
    if ((world.structures || []).some((s) => Math.hypot(s.x - x, s.y - y) < (s.R || 12) + 8)) continue;
    return [x, y];
  }
  return null;
}
const nestSpot = (world) => dryStripSpot(world, (world.game && world.game.nests) || [], 16);
// Where she comes in from: straight out to sea from the nest, in water deep enough to swim.
function seaEntry(world, x, y) {
  const [sx, sy] = seaward(world);
  let px = x, py = y;
  for (let k = 0; k < 500; k++) {
    px += sx * 3; py += sy * 3;
    if (px < 4 || py < 4 || px > world.W - 4 || py > world.H - 4) break;
    if (shoreAt(world, px, py) < world.tide.level - 0.12) { px += sx * 30; py += sy * 30; break; }
  }
  return [clamp(px, 4, world.W - 4), clamp(py, 4, world.H - 4)];
}
// A turtle comes in now (if there's anywhere for her to nest). Returns her.
function seaTurtleNow(world) {
  if (!world.shore || !seaTides(world)) return null;
  const spot = nestSpot(world);
  if (!spot) return null;
  const [x, y] = seaEntry(world, ...spot), T = new SeaTurtle(world, x, y, spot);
  world.creatures.push(T);
  return T;
}
const nestAt = (world, x, y) => ((world.game && world.game.nests) || []).find((n) => Math.hypot(n.x - x, n.y - y) < 4.5) || null;
function nestNote(world, N) {
  const mins = Math.max(0, Math.round((N.due - world.days) * world.opts.dayLength / 60));
  return `A sea turtle's nest: ${N.n} eggs under the sand. ${N.due <= world.days ? 'They are ready: they hatch at the next dusk or dawn.' : `They hatch in about ${mins ? `${mins} minute${mins === 1 ? '' : 's'}` : 'a moment'}, at dusk or dawn.`} The hatchlings run for the sea; each that makes it is worth a little essence.`;
}

// ---- hatchlings ---------------------------------------------------------------------------------------
class Hatchling extends Creature {
  constructor(world, x, y, batch) {
    super(world, x, y);
    this.species = 'hatchling'; this.ambient = true; this.noGrab = true; this.batch = batch;
    this.body = new Chain(x, y, this.heading, [1.0, 1.1], [0.8, 1.5, 0.7], PI / 5);
    this.id = newId(hexToInt('#060604'));
    this.act = 'run'; this.z = 0.9; this.zb = 0.9; this.wob = rand(0, TAU); this.pace = rand(5, 8.5); this.alpha = 1; this.step = 0;
  }
  update(dt, world) {
    const e = shoreAt(world, this.x, this.y), wet = e < world.tide.level - 0.01;
    let gx, gy, want;
    if (this.act === 'run') {
      // A scramble: down the sand toward the water, veering, stopping and starting.
      const [dx, dy] = downhill(world, this.x, this.y), w = Math.sin(world.t * 3 + this.wob) * 0.8, c = Math.cos(w), s = Math.sin(w);
      gx = dx * c - dy * s; gy = dx * s + dy * c;
      want = this.pace * (0.5 + 0.5 * Math.abs(Math.sin(world.t * 5 + this.wob)));
      if (wet) { this.act = 'swim'; this.timer = rand(10, 16); if (this.batch) this.batch.safe++; }
    } else {
      const [sx, sy] = seaward(world);
      gx = sx + Math.sin(world.t + this.wob) * 0.3; gy = sy + Math.cos(world.t * 1.3 + this.wob) * 0.3; want = 11;
      this.timer -= dt;
      if (this.timer < 2) this.alpha = Math.max(0, this.timer / 2);
      if (this.timer <= 0) this.gone = true;
    }
    const zWant = this.act === 'swim' ? clamp((world.tide.level - e) * 80, 1, 30) : 0.9;
    this.zb += (zWant - this.zb) * Math.min(1, dt * 2); this.z = this.zb;
    const gl = Math.hypot(gx, gy) || 1;
    this.turnToward(Math.atan2(gy / gl, gx / gl), 5, dt);
    this.speed += (want - this.speed) * Math.min(1, dt * 5);
    this.x += Math.cos(this.heading) * this.speed * dt; this.y += Math.sin(this.heading) * this.speed * dt;
    if (this.x < -6 || this.y < -6 || this.x > world.W + 6 || this.y > world.H + 6) this.gone = true;
    this.body.resolve(this.x, this.y, this.heading);
    this.step += this.speed * dt * 1.6;
  }
  draw(r) {
    const b = this.body, z = this.zb, id = this.id, h = b.a[1], f = Math.sin(this.step * 3);
    for (const sd of [-1, 1]) {
      const sx = b.px(1, sd * PI / 2, -0.4), sy = b.py(1, sd * PI / 2, -0.4), a = h + sd * (PI / 2 - 0.4) + 0.6 * f;
      r.dot(sx + Math.cos(a) * 1.2, sy + Math.sin(a) * 1.2, z + 0.2, SEA.hatch, id);
    }
    r.ellipsoid(b.x[1], b.y[1], 1.6, 1.3, b.a[1], z + 0.2, 1.1, SEA.hatch, id);
    r.dot(b.x[0], b.y[0], z + 0.4, SEA.hatch, id);
  }
  doing() { return this.act === 'run' ? 'running for the sea' : 'swimming out to sea'; }
  note() { return 'A turtle hatchling, just out of the sand and running for the sea. Gulls and ghost crabs take some; each that makes it is worth a little essence.'; }
}

// A nest hatches: the hatchlings come up out of the sand a few at a time.
function hatchNest(world, N) {
  const G = world.game, S = shoreLifeOf(world);
  if (G && G.nests) G.nests = G.nests.filter((n) => n !== N);
  const B = { x: N.x, y: N.y, n: N.n, out: 0, safe: 0, next: 0 };
  S.batches.push(B);
  if (!world.observe) logEvent(world, `The turtle nest is hatching: ${N.n} hatchlings are coming up out of the sand to run for the sea`, null, { cat: 'life', pri: 2 });
  return B;
}
function updateBatches(world, S, dt) {
  for (const B of S.batches) {
    if (B.out < B.n && (B.next -= dt) <= 0) {
      B.next = rand(0.3, 0.8);
      B.out++;
      world.creatures.push(new Hatchling(world, B.x + rand(-1.5, 1.5), B.y + rand(-1.5, 1.5), B));
      if (Math.random() < 0.5) sandFlick(world, B.x, B.y, rand(0, TAU));
    }
  }
  // Once they've all come up and none is left on the sand, tell how it went.
  S.batches = S.batches.filter((B) => {
    if (B.out < B.n || world.creatures.some((c) => c.batch === B && c.act === 'run')) return true;
    if (!world.observe) {
      const got = B.safe ? gainEssence(world, B.safe, 'hatchlings reaching the sea') : 0;
      logEvent(world, B.safe === B.n ? `All ${B.n} turtle hatchlings made it to the sea${got ? ` (+${got} essence)` : ''}`
        : `Of ${B.n} turtle hatchlings, ${B.safe} made it to the sea${got ? ` (+${got} essence)` : ''}; the gulls and ghost crabs had the rest`, null, { cat: 'life', pri: 2 });
    }
    return false;
  });
}

// ---- ghost crabs --------------------------------------------------------------------------------------
class GhostCrab extends Creature {
  constructor(world, burrow) {
    super(world, burrow[0], burrow[1]);
    this.species = 'ghostcrab'; this.ambient = true; this.noGrab = true; this.home = burrow;
    this.body = new Chain(this.x, this.y, 0, [0.5], [2.2, 2.2], PI);
    this.id = newId(outlineOf(SEA.ghost));
    this.act = 'peek'; this.timer = rand(0.8, 2); this.z = 1.1; this.face = rand(0, TAU); this.dir = this.face; this.gait = 0; this.moving = false;
  }
  hit(px, py) { return this.act !== 'in' && Math.hypot(px - this.x, py - this.y) < 3.5; }
  threatened(world, pointer = true) {
    const p = world.pointer;
    if (pointer && p && p.inside && (p.x - this.x) ** 2 + (p.y - this.y) ** 2 < 900) return true;
    for (const c of world.creatures) if ((c.species === 'gull' || c.species === 'seaturtle') && c.z < 30 && (c.x - this.x) ** 2 + (c.y - this.y) ** 2 < 1600) return true;
    return false;
  }
  update(dt, world) {
    this.timer -= dt;
    const [hx, hy] = this.home;
    let gx = 0, gy = 0, want = 0;
    if (this.act === 'peek') {
      // (Peering out, it holds still and watches the pointer: you can look at it. A gull sends it under.)
      if (this.threatened(world, false) || this.leaving) { this.act = 'in'; this.timer = this.leaving ? 0 : rand(4, 10); }
      else if (this.timer <= 0) { this.act = 'out'; this.timer = 0; }
    } else if (this.act === 'in') {
      if (this.timer <= 0) { if (this.leaving) { this.gone = true; return; } this.act = 'peek'; this.timer = rand(0.8, 2); }
    } else if (this.act === 'home') {
      gx = hx - this.x; gy = hy - this.y; want = 42;
      if (Math.hypot(gx, gy) < 1.5) { this.act = 'in'; this.timer = this.leaving ? 0 : rand(5, 14); this.x = hx; this.y = hy; this.speed = 0; }
    } else if (this.threatened(world) || this.leaving || !dryHigh(world, hx, hy)) this.act = 'home';
    else {
      // Out on the sand: a dash, a freeze, another dash; a hatchling within reach, chased.
      let prey = this.prey;
      if (!prey || prey.gone || prey.caught || prey.act !== 'run') prey = this.prey = world.creatures.find((c) => c.species === 'hatchling' && c.act === 'run' && (c.x - this.x) ** 2 + (c.y - this.y) ** 2 < 900) || null;
      if (prey) {
        gx = prey.x - this.x; gy = prey.y - this.y; want = 30;
        if (Math.hypot(gx, gy) < 1.8) {
          if (Math.random() < 0.4) { prey.caught = true; this.fed = (this.fed || 0) + 1; }
          this.prey = null; this.moving = false; this.timer = rand(1, 2);
        }
      } else {
        if (this.timer <= 0) {
          if (this.moving) { this.moving = false; this.timer = rand(0.6, 2.5); }
          else {
            const a = rand(0, TAU), d = rand(6, 22);
            let tx = this.x + Math.cos(a) * d, ty = this.y + Math.sin(a) * d;
            if (Math.hypot(tx - hx, ty - hy) > 40 || !dryHigh(world, tx, ty, -0.05)) { tx = lerp(this.x, hx, 0.6); ty = lerp(this.y, hy, 0.6); }
            this.tx = tx; this.ty = ty; this.moving = true; this.timer = rand(0.5, 1.2);
          }
        }
        if (this.moving) { gx = this.tx - this.x; gy = this.ty - this.y; want = Math.hypot(gx, gy) > 1 ? 26 : 0; }
      }
    }
    // It runs sideways: it faces across the way it's going (whichever side is nearer).
    if (want > 0) {
      this.dir = Math.atan2(gy, gx);
      const f = this.dir + (Math.cos(this.face - this.dir - PI / 2) >= 0 ? PI / 2 : -PI / 2);
      this.face += wrapAngle(f - this.face) * Math.min(1, dt * 8);
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 10);
    this.x = clamp(this.x + Math.cos(this.dir) * this.speed * dt, 2, world.W - 3); this.y = clamp(this.y + Math.sin(this.dir) * this.speed * dt, 2, world.H - 3);
    this.gait += this.speed * dt * 1.8;
    this.heading = this.face;
    this.body.resolve(this.x, this.y, this.face);
  }
  draw(r) {
    if (this.act === 'in') return;
    const z = this.z, id = this.id, f = this.face, cx = this.x, cy = this.y;
    if (this.act === 'peek') { for (const sd of [-1, 1]) r.dot(cx + Math.cos(f + sd * 0.5) * 1.2, cy + Math.sin(f + sd * 0.5) * 1.2, 1.4, SEA.eye, id); return; }
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
      const a = f + sd * (PI / 2 + (k - 1) * 0.55), st = Math.sin(this.gait + k * 2 + (sd > 0 ? 0 : PI)) * 0.35;
      r.tube(cx + Math.cos(a) * 1.6, cy + Math.sin(a) * 1.6, 0.5, z, cx + Math.cos(a + st) * 3.2, cy + Math.sin(a + st) * 3.2, 0.4, 0.3, 0.6, SEA.ghost, id);
    }
    r.ellipsoid(cx, cy, 2.3, 1.8, f + PI / 2, z, 1.4, SEA.ghost, id);
    for (const sd of [-1, 1]) { const a = f + sd * 0.55; r.ellipsoid(cx + Math.cos(a) * 2.4, cy + Math.sin(a) * 2.4, sd > 0 ? 1.1 : 0.8, 0.7, a, z, 0.8, SEA.ghost, id); }
    for (const sd of [-1, 1]) r.dot(cx + Math.cos(f + sd * 0.3) * 1.7, cy + Math.sin(f + sd * 0.3) * 1.7, z + 1.4, SEA.eye, id);
  }
  doing() { return this.act === 'peek' ? 'peering out of its burrow' : this.act === 'home' ? 'running for its burrow' : this.prey ? 'chasing a hatchling' : this.moving ? 'dashing over the sand' : 'frozen still'; }
  note() { return 'A ghost crab: pale as the sand, out of its burrow at dusk and by night. It runs for its hole when anything comes near, and chases turtle hatchlings.'; }
}
// Their burrows, high on the beach where the tide doesn't reach (from the pond's seed).
function burrowsOf(world, S) {
  if (S.burrows) return S.burrows;
  const along = world.shoreSide < 2 ? world.H : world.W, out = [];
  withSeed(`${world.seed}/burrows`, () => {
    const n = clamp(Math.round(along / 70), 4, 16);
    for (let k = 0; k < 40 && out.length < n; k++) { const p = dryStripSpot(world, out, 18); if (p) out.push([Math.round(p[0]), Math.round(p[1])]); }
  });
  return (S.burrows = out);
}

// ---- sandpipers ---------------------------------------------------------------------------------------
class Sandpiper extends Creature {
  constructor(world, x, y, flock) {
    super(world, x, y);
    this.species = 'sandpiper'; this.ambient = true; this.noGrab = true; this.flock = flock;
    this.body = new Chain(x, y, this.heading, [1.3, 1.5], [0.8, 1.2, 0.9], PI / 4);
    this.id = newId(outlineOf(SEA.piper));
    // (Its place in the flock: spread along the water's edge, not up and down the beach.)
    const [ax, ay] = alongBeach(world), [sx, sy] = seaward(world), o = rand(-11, 11), q = rand(-1.5, 1.5);
    this.act = 'fly'; this.z = 10; this.flap = rand(0, TAU); this.bob = rand(0, TAU); this.off = [ax * o + sx * q, ay * o + sy * q]; this.speed = 30;
  }
  update(dt, world) {
    const F = this.flock;
    this.timer -= dt;
    let gx = 0, gy = 0, want = 0;
    if (F.act === 'fly' || F.act === 'leave') {
      // Low and quick along the beach, all together.
      this.act = 'fly';
      gx = F.x + this.off[0] - this.x; gy = F.y + this.off[1] - this.y;
      want = F.act === 'leave' ? 40 : Math.min(40, Math.hypot(gx, gy) * 1.5 + 8);
      this.z += (9 - this.z) * Math.min(1, dt * 3);
      if (F.act === 'leave' && (this.x < -20 || this.y < -20 || this.x > world.W + 20 || this.y > world.H + 20)) this.gone = true;
    } else {
      this.z += (1.6 - this.z) * Math.min(1, dt * 4);
      if (this.act === 'fly') {
        gx = F.x + this.off[0] - this.x; gy = F.y + this.off[1] - this.y; want = Math.min(20, Math.hypot(gx, gy) * 2);
        if (this.z < 3 && Math.hypot(gx, gy) < 3) { this.act = 'probe'; this.timer = rand(0.3, 1); }
      } else if (this.act === 'probe') {
        if (this.timer <= 0) {
          const p = swashNear(world, F.x + this.off[0], F.y + this.off[1], 8);
          if (p) { this.tx = p[0]; this.ty = p[1]; this.act = 'run'; this.timer = 2.5; } else this.timer = rand(0.3, 0.8);
        }
      } else {
        gx = this.tx - this.x; gy = this.ty - this.y; want = 18;
        if (Math.hypot(gx, gy) < 1 || this.timer <= 0) { this.act = 'probe'; this.timer = rand(0.4, 1.6); }
      }
    }
    if (want > 0 && (gx || gy)) this.turnToward(Math.atan2(gy, gx), this.act === 'fly' ? 5 : 12, dt);
    this.speed += (want - this.speed) * Math.min(1, dt * 6);
    this.x += Math.cos(this.heading) * this.speed * dt; this.y += Math.sin(this.heading) * this.speed * dt;
    this.flap += dt * 22; if (this.act === 'probe') this.bob += dt * 9;
    this.body.resolve(this.x, this.y, this.heading);
  }
  draw(r) {
    const b = this.body, z = this.z, id = this.id, h = b.a[1];
    if (this.act === 'fly') {
      const beat = Math.sin(this.flap), span = 4.2 * (0.7 + 0.3 * Math.cos(this.flap));
      for (const sd of [-1, 1]) {
        const a = h + sd * (PI / 2 + 0.35 + 0.2 * beat), ex = b.x[1] + Math.cos(a) * span, ey = b.y[1] + Math.sin(a) * span;
        r.tube(b.x[1], b.y[1], 0.8, z + 0.2, ex, ey, 0.35, z + 0.4 + beat * 0.5, 0.5, (u) => (u > 0.35 && u < 0.55 ? SEA.belly : SEA.piper), id);
      }
    } else if (this.speed > 2) {
      const st = Math.sin(this.flap * 0.8);
      for (const sd of [-1, 1]) r.dot(b.px(1, sd * PI / 2, -0.6) + Math.cos(h) * st * sd * 0.7, b.py(1, sd * PI / 2, -0.6) + Math.sin(h) * st * sd * 0.7, 0.6, SEA.leg, id);
    }
    r.ellipsoid(b.x[1], b.y[1], 1.8, 1.15, h, z, 1.2, SEA.piper, id);
    const dip = this.act === 'probe' ? Math.max(0, Math.sin(this.bob)) * 0.9 : 0, hx = b.x[0], hy = b.y[0], ha = b.a[0];
    r.dot(hx, hy, z + 0.8 - dip, SEA.piper, id);
    r.tube(hx, hy, 0.35, z + 0.7 - dip, hx + Math.cos(ha) * 2.2, hy + Math.sin(ha) * 2.2, 0.25, z + 0.2 - dip * 1.2, 0.5, SEA.bill, id);
  }
  doing() { return this.act === 'fly' ? 'flying low along the beach' : this.act === 'probe' ? 'probing the wet sand' : 'running after the waves'; }
  note() { return 'A sandpiper: one of a little flock that runs the water\'s edge by day, after the waves, probing the wet sand. Come close and they all take off along the beach.'; }
}
// The flock: where it's feeding, whether it's flying, and where to.
function flockUpdate(world, S) {
  const F = S.flock, day = world.darkness < 0.4;
  if (!F) {
    if (!day || Math.random() > 0.03) return;
    const [x0, y0, x1, y1] = beachRect(world), p = swashNear(world, rand(x0, x1), rand(y0, y1), 60);
    if (!p) return;
    const [ax, ay] = alongBeach(world), sd = Math.random() < 0.5 ? -1 : 1, n = randi(4, 8);
    const ex = clamp(p[0] + ax * sd * 400, -20, world.W + 20), ey = clamp(p[1] + ay * sd * 400, -20, world.H + 20);
    const nf = S.flock = { x: p[0], y: p[1], act: 'fly', birds: n };
    for (let k = 0; k < n; k++) { const b = new Sandpiper(world, ex + rand(-6, 6), ey + rand(-6, 6), nf); b.heading = Math.atan2(p[1] - ey, p[0] - ex); world.creatures.push(b); }
    return;
  }
  const birds = world.creatures.filter((c) => c.flock === F);
  if (!birds.length) { S.flock = null; return; }
  if (F.act === 'leave') return;
  if (!day) { F.act = 'leave'; const [ax, ay] = alongBeach(world), sd = Math.random() < 0.5 ? -1 : 1; F.x = F.x + ax * sd * 900; F.y = F.y + ay * sd * 900; return; }
  if (F.act === 'fly') {
    const near = birds.filter((b) => Math.hypot(b.x - F.x - b.off[0], b.y - F.y - b.off[1]) < 12).length;
    if (near >= birds.length * 0.6) F.act = 'feed';
    return;
  }
  // Feeding: the flock keeps to the water's edge as the tide comes and goes.
  const p = swashNear(world, F.x, F.y, 14);
  if (p) { F.x = lerp(F.x, p[0], 0.5); F.y = lerp(F.y, p[1], 0.5); }
  // Too close (the pointer, a gull coming down, a turtle, a crab running at them): up and away along the beach.
  const P = world.pointer, scare = (P && P.inside && birds.some((b) => (P.x - b.x) ** 2 + (P.y - b.y) ** 2 < 900)) ||
    world.creatures.some((c) => ((c.species === 'gull' && c.z < 40) || c.species === 'seaturtle' || (c.species === 'ghostcrab' && c.speed > 10)) && (c.x - F.x) ** 2 + (c.y - F.y) ** 2 < 1600);
  if (scare) {
    // Along the beach, whichever way there's more of it.
    const [ax, ay] = alongBeach(world), d = rand(70, 140);
    const q = [1, -1].map((sd) => swashNear(world, clamp(F.x + ax * sd * d, 8, world.W - 8), clamp(F.y + ay * sd * d, 8, world.H - 8), 20)).filter(Boolean)
      .sort((a, b) => Math.hypot(b[0] - F.x, b[1] - F.y) - Math.hypot(a[0] - F.x, a[1] - F.y))[0];
    if (q) { F.x = q[0]; F.y = q[1]; F.act = 'fly'; }
  }
}

// ---- the tracks, the flicked sand, the nests and burrows ---------------------------------------------------
function addTrack(world, x, y, a, w) {
  const S = shoreLifeOf(world);
  S.tracks.push({ x, y, a, w, day: world.days, c: flat(sandAt(world, x, y, -0.2)), n: S.tracks.length });
  if (S.tracks.length > 600) S.tracks.shift();
}
function sandFlick(world, x, y, a) {
  const S = shoreLifeOf(world), s = rand(10, 22), aa = a + rand(-0.6, 0.6);
  S.flicks.push({ x, y, z: 1, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, vz: rand(8, 16), c: flat(sandAt(world, x, y, 0.08)) });
  if (S.flicks.length > 120) S.flicks.shift();
}

// Each frame: the flicked sand; the hatchlings coming up. Each second: who comes and goes.
function updateShoreLife(world, dt) {
  if (!world.shore || world.opts.life === false || !world.game) return;
  const S = shoreLifeOf(world), G = world.game;
  for (const f of S.flicks) { f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.vz -= 40 * dt; }
  S.flicks = S.flicks.filter((f) => f.z > 0);
  updateBatches(world, S, dt);
  if ((S.tick -= dt) > 0) return;
  S.tick = 1;
  const dark = world.darkness || 0, sea = seaTides(world);
  // A turtle may come in on a dark night (salt water likelier), unless the beach is full of nests.
  if (sea) {
    if (dark > 0.6 && !S.night) {
      S.night = true;
      const p = (world.opts.habitat === 'salt' ? 0.5 : 0.3) * ((G.nests || []).length >= 3 ? 0 : 1);
      if (Math.random() < p && !world.creatures.some((c) => c.species === 'seaturtle')) S.turtleAt = world.t + rand(2, 20);
    } else if (dark < 0.3) S.night = false;
    if (S.turtleAt && world.t >= S.turtleAt) { S.turtleAt = 0; seaTurtleNow(world); }
    // Nests hatch at dusk or dawn, once they're due.
    if (dark > 0.2 && dark < 0.62) for (const N of (G.nests || []).slice()) if (world.days >= N.due) hatchNest(world, N);
    // A nest the sea has reached (the beach moved) is lost.
    if (G.nests && G.nests.length) G.nests = G.nests.filter((N) => shoreAt(world, N.x, N.y) > world.tide.level + 0.02);
    // Ghost crabs: a few out at dusk, more at night, one peering out now and then by day.
    const B = burrowsOf(world, S), crabs = world.creatures.filter((c) => c.species === 'ghostcrab' && !c.leaving);
    const want = Math.min(B.length, dark > 0.5 ? 7 : dark > 0.28 ? 3 : Math.random() < 0.3 ? 1 : 0);
    if (crabs.length < want && Math.random() < 0.35) {
      const free = B.filter((b) => dryHigh(world, b[0], b[1]) && !crabs.some((c) => c.home === b));
      if (free.length) world.creatures.push(new GhostCrab(world, pick(free)));
    } else if (crabs.length > want && Math.random() < 0.3) crabs[0].leaving = true;
  }
  flockUpdate(world, S);
  // The tide washes tracks away; the rest fade in a day or so.
  if (S.tracks.length) S.tracks = S.tracks.filter((k) => world.days - k.day < 1.6 && shoreAt(world, k.x, k.y) > world.tide.level + 0.005);
}

function drawShoreLife(r, world, t, rect) {
  const S = world.shoreLife;
  if (!S || !world.shore) return;
  const [x0, y0, x1, y1] = rect, near = (x, y, m = 8) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
  r.castShadows = false;
  for (const k of S.tracks) {
    if (!near(k.x, k.y)) continue;
    const px = -Math.sin(k.a), py = Math.cos(k.a), age = world.days - k.day;
    if (age > 1 && k.n % 2) continue; // (older tracks thin out)
    for (const sd of [-1, 1]) r.dot(k.x + px * k.w * sd, k.y + py * k.w * sd, 0.05, k.c, SHORE_FX_ID);
    if (k.n % 2 === 0) r.dot(k.x, k.y, 0.05, k.c, SHORE_FX_ID);
  }
  for (const f of S.flicks) if (near(f.x, f.y)) r.dot(f.x, f.y, f.z, f.c, SHORE_FX_ID);
  for (const N of (world.game && world.game.nests) || []) {
    if (!near(N.x, N.y)) continue;
    // Dug and filled: a patch of darker, turned sand, heaped a little lighter round its rim.
    const dim = flat(sandAt(world, N.x, N.y, -0.2)), mid = flat(sandAt(world, N.x, N.y, -0.1)), lit = flat(sandAt(world, N.x, N.y, 0.14));
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 3.4) continue;
      r.dot(N.x + dx, N.y + dy, 0.08, d > 2.5 ? (hash2(dx, dy, N.n) < 0.6 ? lit : mid) : hash2(dx + 7, dy, N.n) < 0.35 ? mid : dim, SHORE_FX_ID);
    }
    if (world.days > N.due - 0.3) r.dot(N.x, N.y, 0.08, flat(sandAt(world, N.x, N.y, -0.35)), SHORE_FX_ID); // (sinking as they stir under it)
  }
  if (S.burrows) for (const [bx, by] of S.burrows) {
    if (!near(bx, by) || !dryHigh(world, bx, by)) continue;
    r.dot(bx, by, 0.06, SHORE_HOLE, SHORE_FX_ID);
    r.dot(bx + 1, by + 1, 0.06, flat(sandAt(world, bx + 1, by + 1, 0.12)), SHORE_FX_ID);
  }
  r.castShadows = true;
}
const SHORE_HOLE = solid('#2a2216');
