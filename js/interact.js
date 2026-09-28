'use strict';
// Animals together: what different kinds do when they meet, each with its own little dance, and
// what you can do about the balance between them.
//  - Cleaning stations: a cleaner wrasse or a shrimp swims up to a bigger fish (hunters too), which
//    stops and holds still while the cleaner circles its head, picking it over. The fish comes away
//    calmer; now and then the cleaner takes off a parasite that was riding it, or a sickness.
//  - Displays: territorial kinds (bettas, clownfish, crabs, hermit crabs, crayfish, lionfish, morays,
//    pike) that meet something of about their size flare up and circle each other until one backs down.
//  - Riders: small fish ride alongside a big calm animal (a turtle, a ray, a shark, a sturgeon, a whale
//    of a thing) for a while, sheltered: hunters leave them be while they're there.
//  - Bait balls: a school a hunter comes close to swirls tight around its middle.
//  - Warnings: lionfish, pufferfish and sea spiders flare at a hunter that comes for them, and it
//    thinks better of it.
//  - Scraps: scavengers trail a hunter at a distance, and when it catches something, pick up the scraps.
// And the balance, by hand:
//  - Protect a kind (its census row): hunters leave it alone; it costs a few pearls a dawn for each one.
//  - Cull a kind: hunters go for it first, and every catch pays a bounty.
//  - The refuge (a build): a thicket of stone and weed; nothing inside it can be caught.

const CLEANERS = new Set(['cleaner', 'shrimp']);
const TERRITORIAL = new Set(['betta', 'clown', 'crab', 'hermit', 'crayfish', 'lionfish', 'moray', 'pike']);
const WARNERS = new Set(['lionfish', 'puffer', 'seaspider']);
const HOSTS = new Set(['turtle', 'ray', 'shark', 'sandshark', 'sturgeon', 'paddlefish', 'coelacanth', 'plesiosaur', 'voidmanta', 'leviathan', 'oarfish', 'koi', 'catfish']);
const RIDERS = new Set(['tetra', 'guppy', 'cleaner', 'lanternfish', 'hatchetfish', 'glassfish', 'runefish', 'starfin', 'cavefish', 'snailfish']);
const GLYPH = {
  bang: [[0, 0], [0, 1], [0, 2], [0, 4]], heart: [[-1, 0], [1, 0], [-2, 1], [0, 1], [2, 1], [-1, 2], [1, 2], [0, 3]], spark: [[0, 0], [-1, 1], [1, 1], [0, 2]],
  swirl: [[0, 0], [1, 0], [2, 1], [2, 2], [1, 3], [0, 3], [-1, 2]],
};
const GLYPH_MAT = { bang: solid('#ff5a4a'), heart: solid('#ff7ac8'), spark: solid('#bff4ff'), swirl: solid('#ffe08a'), warn: solid('#ffd14a') };
let GLYPH_ID = 0;

// A little sign over an animal: rising, then gone.
class Glyph {
  constructor(x, y, z, kind, mat = kind) { this.x = x; this.y = y; this.z = z; this.kind = kind; this.m = GLYPH_MAT[mat] || GLYPH_MAT.spark; this.t = 0; }
  update(dt) { this.t += dt; this.z += dt * 3; return this.t < 1.4; }
  draw(r) {
    if (!GLYPH_ID) { GLYPH_ID = newId(hexToInt('#0a0a0a')); EMISSIVE[GLYPH_ID] = 1; }
    if (this.t > 1.1 && ((this.t * 20) | 0) % 2) return;
    for (const [dx, dy] of GLYPH[this.kind] || GLYPH.spark) r.dot(this.x + dx, this.y - 6 + dy, this.z + 6, this.m, GLYPH_ID);
  }
}
const glyph = (world, c, kind, mat) => { if (world.effects.length < 220) world.effects.push(new Glyph(c.x, c.y, (c.z || 0) + 2, kind, mat)); };

// ---- what's going on between them --------------------------------------------------------------------------
const busy = (c) => !c || !c.life || c.leaving || c.dying || c.gone || c.caught || c.grabbed || c.act;
const sizeOf = (c) => (SPECIES_STATS[c.species] || SPECIES_STATS.wild).size * (c.life ? c.life.scale || 1 : 1);
let actClock = 0;
function updateInteract(world, dt) {
  if (!world.W || world.observe) return;
  const A = world.acts || (world.acts = []);
  // Play out what's going on (every frame: it's the dance).
  for (let i = A.length - 1; i >= 0; i--) {
    const x = A[i];
    x.t += dt;
    if (x.t >= x.dur || busyGone(x) || !ACTS[x.kind].step(world, x, dt)) { end(world, x); A.splice(i, 1); }
  }
  actClock -= dt;
  if (actClock > 0) return;
  actClock = 0.6;
  if (A.length >= 14) return;
  // Look for new meetings (a few a pass).
  let started = 0;
  for (const c of world.creatures) {
    if (started >= 2 || A.length >= 14) break;
    if (busy(c) || Math.random() > 0.08) continue;
    for (const [k, D] of Object.entries(ACTS)) {
      if (!D.who(c)) continue;
      const b = D.find(world, c);
      if (b) { const x = { kind: k, a: c, b, t: 0, dur: D.dur(), ang: Math.random() * TAU }; c.act = x; if (!D.solo) b.act = x; A.push(x); D.start(world, x); started++; break; }
    }
  }
}
const busyGone = (x) => [x.a, x.b].some((c) => c && (c.gone || c.caught || c.dying || c.leaving));
function end(world, x) {
  for (const c of [x.a, x.b]) if (c && c.act === x) { c.act = null; c.flare = 0; if (c.timer != null) c.timer = 0; }
  if (ACTS[x.kind].end) ACTS[x.kind].end(world, x);
}
// Steer an animal toward a point at a speed (for its next moments), the way it steers anyway.
function steer(c, x, y, speed) {
  // (Always a little way off in the right direction: an animal that reaches its target picks a new one.)
  let dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy);
  if (d < 0.5) { dx = Math.cos(c.heading || 0); dy = Math.sin(c.heading || 0); d = 1; }
  if (d < 10) { x = c.x + dx / d * 10; y = c.y + dy / d * 10; }
  c.tx = x; c.ty = y;
  if (c.timer != null) c.timer = 1;
  if (c.cruiseNow != null) c.cruiseNow = speed;
  if (c.mode === 'pause' || c.mode === 'walk') c.mode = speed < 0.5 ? 'pause' : 'walk'; // (walkers)
}
const nearest = (world, c, R, ok) => { let best = null, bd = R * R; forNear(world, c.x, c.y, R, (q, d) => { if (q !== c && d < bd && ok(q)) { bd = d; best = q; } }); return best; };

const ACTS = {
  clean: {
    who: (c) => CLEANERS.has(c.species) && c.life.energy < 0.95,
    find: (world, c) => nearest(world, c, 50, (q) => !busy(q) && q.life && sizeOf(q) >= 2 && !q.prey && !CLEANERS.has(q.species) && !(q.life.cleaned > world.t - 90)),
    dur: () => rand(6, 10),
    start(world, x) { glyph(world, x.b, 'spark'); },
    step(world, x, dt) {
      const { a: cl, b: host } = x, hx = host.body ? host.body.x[0] : host.x, hy = host.body ? host.body.y[0] : host.y;
      steer(host, host.x, host.y, 0.15); // (it holds still)
      host.hold = world.t + 0.3;
      x.ang += dt * 2.2;
      const R = 3 + sizeOf(host) * 1.5;
      steer(cl, hx + Math.cos(x.ang) * R, hy + Math.sin(x.ang) * R, cl.cruise * 1.2);
      if (Math.random() < dt * 1.5 && world.effects.length < 220) world.effects.push(new Sparkle(hx + rand(-2, 2), hy + rand(-2, 2), 2));
      return true;
    },
    end(world, x) {
      const host = x.b;
      if (!host.life || x.t < 3) return;
      host.life.cleaned = world.t;
      host.life.comfort = Math.min(1, (host.life.comfort || 0) + 0.25);
      x.a.life.energy = Math.min(1, x.a.life.energy + 0.12);
      if (host.life.para && Math.random() < 0.3) {
        const k = host.life.para.k;
        host.life.para = null;
        if (typeof eldTraits === 'function') host.life.traits = host.life.traits.filter((t) => !['latched', 'coiled', 'sporing'].includes(t));
        logEvent(world, `${who(x.a)} picked a ${PARASITES[k] ? PARASITES[k].label : 'parasite'} off ${who(host)}`, host, { cat: 'life', pri: 1 });
      } else if (Math.random() < 0.1) {
        const ill = host.life.traits.find((t) => ['rot', 'spore', 'glassing'].includes(t));
        if (ill) { host.life.traits = host.life.traits.filter((t) => t !== ill); logEvent(world, `${who(x.a)} cleaned ${who(host)}: its ${ILLS[ill] ? ILLS[ill].name : ill} is gone`, host, { cat: 'life', pri: 1 }); }
      }
      glyph(world, host, 'heart');
    },
  },
  display: {
    who: (c) => TERRITORIAL.has(c.species) && c.life.scale > 0.8,
    find: (world, c) => nearest(world, c, 26, (q) => !busy(q) && q.life && q.species !== c.species && Math.abs(sizeOf(q) - sizeOf(c)) <= 1 && !isPrey(q) && q.prey !== c && c.prey !== q),
    dur: () => rand(2.5, 4),
    start(world, x) { glyph(world, x.a, 'bang'); glyph(world, x.b, 'bang'); },
    step(world, x, dt) {
      const { a, b } = x, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      x.ang += dt * 1.6;
      for (const [c, s] of [[a, 1], [b, -1]]) { c.flare = Math.min(1, (c.flare || 0) + dt * 2); steer(c, mx + Math.cos(x.ang) * 6 * s, my + Math.sin(x.ang) * 6 * s, c.cruise * 0.6); }
      return true;
    },
    end(world, x) {
      if (x.t < 2) return;
      const { a, b } = x, sa = sizeOf(a) * geneBuffs(a).aggression, sb = sizeOf(b) * geneBuffs(b).aggression, loser = sa >= sb ? b : a, winner = loser === a ? b : a;
      loser.dread = { x: winner.x, y: winner.y, t: 3 };
      glyph(world, winner, 'swirl', 'warn');
    },
  },
  ride: {
    who: (c) => RIDERS.has(c.species) && Math.random() < 0.4,
    find: (world, c) => nearest(world, c, 40, (q) => !busy(q) && q.life && HOSTS.has(q.species) && !isPredator(q)),
    dur: () => rand(12, 25),
    solo: true, // (the host carries on as it was; only the rider changes course)
    start() {},
    step(world, x) {
      const { a: rider, b: host } = x, side = x.ang > PI ? 1 : -1, hd = host.heading || 0, R = 2 + sizeOf(host) * 1.6;
      rider.sheltered = world.t;
      steer(rider, host.x + Math.cos(hd + side * PI / 2) * R, host.y + Math.sin(hd + side * PI / 2) * R, Math.max(rider.cruise, (host.speed || host.cruise || 4) * 1.1));
      return !host.leaving;
    },
  },
  baitball: {
    who: (c) => !!c.school && !!c.threat && isPrey(c),
    find: (world, c) => c,
    dur: () => rand(3, 5),
    solo: true,
    start(world, x) { x.cx = x.a.x; x.cy = x.a.y; },
    step(world, x, dt) {
      const c = x.a, school = world.creatures.filter((q) => q.school === c.school && !q.act && !q.gone);
      x.ang += dt * 3;
      let n = 0;
      for (const q of school) { if (n++ > 16) break; const a = x.ang + n * 0.7; steer(q, x.cx + Math.cos(a) * (3 + (n % 3) * 2), x.cy + Math.sin(a) * (3 + (n % 3) * 2), q.maxSpeed * 0.8); }
      return true;
    },
  },
  warn: {
    who: (c) => WARNERS.has(c.species),
    find: (world, c) => nearest(world, c, 22, (q) => q.prey === c && !q.act),
    dur: () => 2.2,
    start(world, x) { glyph(world, x.a, 'bang', 'warn'); },
    step(world, x, dt) { x.a.flare = Math.min(1, (x.a.flare || 0) + dt * 3); steer(x.a, x.a.x, x.a.y, 0.2); x.a.hold = world.t + 0.3; if (x.b.prey === x.a) x.b.prey = null; x.b.dread = { x: x.a.x, y: x.a.y, t: 2 }; return true; },
  },
  scraps: {
    who: (c) => typeof SCAVENGE !== 'undefined' && SCAVENGE.has(c.species) && c.life.energy < 0.7,
    find: (world, c) => nearest(world, c, 70, (q) => !!q.prey && isPredator(q)),
    dur: () => rand(10, 18),
    solo: true,
    start() {},
    step(world, x) {
      const { a: s, b: hunter } = x, dx = s.x - hunter.x, dy = s.y - hunter.y, d = Math.hypot(dx, dy) || 1;
      steer(s, hunter.x + dx / d * 14, hunter.y + dy / d * 14, s.cruise);
      return !!hunter.prey || x.t < 3;
    },
  },
};

// When a hunter catches something: scraps for whoever's trailing it, and the bounty if its kind is culled.
function afterCatch(world, hunter, prey) {
  if (typeof dropDetritus === 'function') dropDetritus(world, prey.x + rand(-3, 3), prey.y + rand(-3, 3), 'bone', 0.7);
  const G = world.game, k = prey.species === 'tadpole' ? 'frog' : prey.species;
  if (G && G.stance && G.stance[k] === 'cull') {
    const pts = award(world, 2 + (SPECIES_STATS[k] || SPECIES_STATS.wild).size, 'keeping the balance', prey, { quiet: true });
    G.culled = (G.culled || 0) + 1;
    if (pts && world.effects.length < 220) world.effects.push(new Glyph(prey.x, prey.y, prey.z || 0, 'spark', 'warn'));
  }
}

// ---- the balance, by hand ----------------------------------------------------------------------------------
// May a hunter take this one? Not a protected kind, not in a refuge, not riding with a big calm animal.
function huntable(world, q) {
  const G = world.game, k = q.species === 'tadpole' ? 'frog' : q.species;
  if (G && G.stance && G.stance[k] === 'protect') return false;
  if (q.sheltered && world.t - q.sheltered < 1.5) return false;
  for (const s of world.structures || []) if (s.kind === 'refuge' && (s.x - q.x) ** 2 + (s.y - q.y) ** 2 < auraR(world, s) ** 2) return false;
  return true;
}
// How much a hunter wants it (a culled kind first).
const huntWeight = (world, q) => { const G = world.game; return G && G.stance && G.stance[q.species === 'tadpole' ? 'frog' : q.species] === 'cull' ? 6 : 1; };
function setStance(world, k, stance) {
  const G = world.game;
  G.stance = { ...(G.stance || {}) };
  if (!stance || G.stance[k] === stance) delete G.stance[k]; else G.stance[k] = stance;
  const now = G.stance[k];
  logEvent(world, now === 'protect' ? `You're protecting the ${plural(SINGULAR[k] || k, 2).toLowerCase()}: the hunters will leave them be (a few pearls a dawn)`
    : now === 'cull' ? `You've called a cull on the ${plural(SINGULAR[k] || k, 2).toLowerCase()}: the hunters go for them first, and each catch pays`
      : `The ${plural(SINGULAR[k] || k, 2).toLowerCase()} are left to nature again`, null, { cat: 'pond', pri: 1 });
}
// Each dawn, protection is paid for (a pearl for every two protected); if it can't be, it lapses.
function dawnStances(world) {
  const G = world.game;
  if (!G || !G.stance) return;
  for (const [k, s] of Object.entries(G.stance)) {
    if (s !== 'protect') continue;
    const n = world.creatures.filter((c) => c.species === k && c.life).length, cost = Math.max(1, Math.ceil(n / 2));
    if (!spend(world, cost, null)) { delete G.stance[k]; logEvent(world, `The protection on the ${plural(SINGULAR[k] || k, 2).toLowerCase()} has lapsed: not enough pearls`, null, { cat: 'pond', pri: 2 }); }
  }
}
// Kinds that have outgrown the pond (well past their breeding cap, or a big share of everything).
function overAbundant(world, k) {
  const n = world.creatures.filter((c) => c.species === k && c.life).length, all = world.creatures.filter((c) => c.life).length;
  const cap = BREED[k] ? BREED[k].cap * Math.max(1, world.W * world.H / (960 * 540)) : Infinity;
  return n >= 8 && (n > cap * 1.3 || n > all * 0.35);
}

// ---- the refuge -------------------------------------------------------------------------------------------------
STRUCTURES.refuge = {
  label: 'Refuge', pearls: 220, essence: 10, r: 40, size: 10, wet: true,
  desc: 'a thicket of stone arches and weed: nothing inside it can be caught, so small animals shelter there',
  aura: { comfort: 0.08, aggression: -0.05 },
};
STRUCT_CODES.push('refuge');
STRUCT_LIKES.refuge = ['tetra', 'guppy', 'shrimp', 'snail', 'cleaner', 'seahorse', 'mandarin', 'goldfish'];
BUILD.refuge = (s) => { s.arches = Array.from({ length: randi(3, 4) }, () => ({ a: rand(0, TAU), d: rand(3, 8), h: rand(5, 8), w: rand(4, 6) })); s.weed = Array.from({ length: 10 }, () => [rand(-10, 10), rand(-10, 10), rand(3, 7)]); };
BAKE.refuge = (r, s, next) => {
  const sid = next(SM.stone), wid = next(SM.weedy);
  for (const A of s.arches) {
    const cx = s.x + Math.cos(A.a) * A.d, cy = s.y + Math.sin(A.a) * A.d, pa = A.a + PI / 2;
    const x0 = cx - Math.cos(pa) * A.w, y0 = cy - Math.sin(pa) * A.w, x1 = cx + Math.cos(pa) * A.w, y1 = cy + Math.sin(pa) * A.w;
    r.tube(x0, y0, 1.3, 0, cx, cy, 1.1, A.h, 0.9, SM.stone, sid);
    r.tube(cx, cy, 1.1, A.h, x1, y1, 1.3, 0, 0.9, SM.stone, sid);
  }
  for (const [ox, oy, h] of s.weed) r.tube(s.x + ox, s.y + oy, 0.6, 0, s.x + ox * 1.1, s.y + oy * 1.1, 0.3, h, 1, SM.weedy, wid);
};
