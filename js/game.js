'use strict';
// The game layer. Points are your score and never go down; pearls are what you
// spend, and every point earned also pays a pearl. Rare animals score by tier,
// more each time you breed the same rare again. Animals are comfortable near the
// plants and rocks their species likes, and comfort and good food help them live
// longer and stay. The family tree of every animal is kept for the dock's charts,
// and the fireflies at night show how your score compares to the high scores.

const START_PEARLS = 60;
const TIER_VALUE = [1, 3, 8, 20, 50, 150];   // points for a birth by tier (arrivals score half)
const FIRST_BONUS = 20;                       // the first of a rare kind in this pond
const HIGH_FLOOR = 10000;                     // the high-score range, until the leaderboard sets it higher

const PLANT_PRICE = { weed: 4, eelgrass: 4, duckweed: 3, marimo: 8, lily: 8, anemone: 15, coral: 15, urchin: 6, rock: 2 };
const FOOD_PRICE = { pellet: 0, spirulina: 3, brine: 5 };
const ANIMAL_PRICE = {
  koi: 12, tetra: 8, eel: 20, axolotl: 25, turtle: 20, crab: 8, ray: 18, frog: 10, snake: 20, snail: 4, jelly: 10,
  clown: 15, puffer: 15, octopus: 30, duck: 20, shrimp: 5, dragonfly: 6, wild: 15, starfish: 6,
};

const newGame = () => ({ points: 0, pearls: START_PEARLS, earned: {}, lines: {}, seen: [], finds: [], best: null, recent: [], dawn: null, board: true });

// Credit points (and as many pearls). `subject` gets the points in its family
// record, and unless quiet a "+N" floats up from it.
function award(world, n, why, subject = null, opts = {}) {
  const G = world.game;
  n = Math.round(n);
  if (!G || n <= 0) return 0;
  G.points += n;
  G.pearls += n;
  G.earned[why] = (G.earned[why] || 0) + n;
  const top = G.recent[0];
  if (top && top.why === why && world.t - top.t < 30) { top.n += n; top.t = world.t; } else {
    G.recent.unshift({ n, why, t: world.t, day: Math.floor(world.days) + 1, clock: world.clock });
    G.recent.length = Math.min(G.recent.length, 10);
  }
  if (subject && subject.seed != null && world.lineage) {
    const r = world.lineage.get(subject.seed);
    if (r) r.pts += n;
  }
  if (subject && !opts.quiet && typeof floatAward === 'function') floatAward(subject.x, subject.y, `+${n}`);
  world.gameDirty = true;
  return n;
}

// Pay for something; false (and nothing spent) if there aren't enough pearls.
function spend(world, n) {
  const G = world.game;
  if (!n) return true;
  if (!G || G.pearls < n) return false;
  G.pearls -= n;
  world.gameDirty = true;
  return true;
}

// ---- rare animals ------------------------------------------------------------------

const rareKey = (c) => `${c.species === 'wild' ? `wild:${c.sp.id}` : c.species === 'tadpole' ? 'frog' : c.species}|${c.life.traits.join('+')}`;
const withArticle = (s) => `${/^[aeiou]/i.test(s) ? 'An' : 'A'} ${s}`;

function scoreBirths(world, babies) {
  let common = 0;
  for (const b of babies) {
    const tier = tierOf(b.life.traits);
    if (tier) scoreRare(world, b, tier, 'born'); else common++;
  }
  if (common) award(world, common, 'births', babies[0], { quiet: true });
}

function scoreArrival(world, c) {
  const tier = tierOf(c.life.traits);
  if (tier) scoreRare(world, c, tier, 'arrived');
}

// A rare birth is worth its tier, and 25% more for each earlier birth of the same
// rare kind in this pond (up to 3x): establishing a line of rares pays.
function scoreRare(world, c, tier, how) {
  const G = world.game;
  if (!G) return;
  const key = rareKey(c), first = !G.seen.includes(key), label = describe(c).label, traits = c.life.traits.join(' ');
  if (first) G.seen.push(key);
  let pts = TIER_VALUE[tier] / 2;
  if (how === 'born') {
    const bred = G.lines[key] || 0;
    G.lines[key] = bred + 1;
    pts = TIER_VALUE[tier] * (1 + 0.25 * Math.min(bred, 8));
  }
  const n = award(world, pts + (first ? FIRST_BONUS : 0), how === 'born' ? 'rare births' : 'rare arrivals', c);
  const bred = G.lines[key] || 0, verb = how === 'born' ? 'hatched' : 'arrived';
  const note = first ? ', a first for this pond' : how === 'born' && bred > 1 ? `, bred ${bred}×` : '';
  logEvent(world, `✦ ${TIERS[tier]}! ${withArticle(`${traits} ${label}`)} ${verb}: ${c.life.name}${note} · +${n}`, c, {
    cat: 'rare', pri: tier >= 3 ? 3 : 2, key: `rare:${key}:${how}`, data: n,
    merge: (e) => `✦ ${TIERS[tier]}! ${e.n} ${traits} ${plural(label, e.n)} ${verb}${how === 'born' ? `, bred ${bred}×` : ''} · +${e.data.reduce((a, b) => a + b, 0)}`,
  });
  noteFind(world, c, tier, how);
}

// The best find so far, and rare finds waiting to go to the shared feed.
function noteFind(world, c, tier, how) {
  const G = world.game;
  const find = { tier, species: c.species === 'tadpole' ? 'frog' : c.species, traits: c.life.traits.slice(), how, label: describe(c).label, name: c.life.name };
  if (!G.best || tier > G.best.tier) G.best = find;
  // A clutch of the same rare goes to the shared feed once.
  const same = (f) => f.species === find.species && f.how === find.how && f.traits.join() === find.traits.join();
  if (tier >= 2 && !G.finds.some(same)) {
    G.finds.push(find);
    if (G.finds.length > 5) G.finds.shift();
  }
}

// ---- care: comfort and food ---------------------------------------------------------------
// Each species likes certain plants or rocks nearby. Comfort follows how many
// are close, and eases slowly so a quick swim past a weed doesn't count for much.

const LIKES = {
  koi: ['lily', 'weed', 'eelgrass'], tetra: ['weed', 'eelgrass', 'duckweed'], eel: ['rock', 'eelgrass'], axolotl: ['weed', 'marimo', 'rock'],
  turtle: ['rock', 'lily'], crab: ['rock', 'coral'], ray: ['eelgrass', 'coral'], frog: ['lily', 'duckweed'], snake: ['eelgrass', 'lily'],
  snail: ['marimo', 'weed', 'rock'], clown: ['anemone'], puffer: ['coral', 'urchin'], octopus: ['rock', 'coral'], duck: ['duckweed', 'lily'],
  shrimp: ['weed', 'coral', 'anemone'], dragonfly: ['eelgrass', 'lily'], starfish: ['coral', 'urchin', 'rock'], tadpole: ['duckweed', 'weed', 'lily'],
};
const LIKE_LABEL = {
  lily: 'lily pads', weed: 'weeds', eelgrass: 'eelgrass', anemone: 'anemones', coral: 'coral', urchin: 'urchins',
  marimo: 'marimo', duckweed: 'duckweed', rock: 'rocks',
};
const COMFORT_R = 56;

function likesOf(c) {
  if (c.species === 'wild') return c.sp.habitat === 'salt' ? ['coral', 'anemone', 'weed'] : ['weed', 'eelgrass', 'lily'];
  return LIKES[c.species] || null;
}

function updateComfort(world) {
  const spots = { rock: world.rocks };
  for (const p of world.plants) (spots[p.make] || (spots[p.make] = [])).push(p);
  for (const p of world.pads) if (!p.dead) (spots.lily || (spots.lily = [])).push(p);
  const R2 = COMFORT_R * COMFORT_R;
  for (const c of world.creatures) {
    const L = c.life;
    if (!L) continue;
    const likes = likesOf(c);
    if (!likes) { L.comfort = 0.6; continue; } // drifters don't mind
    let n = 0;
    for (const k of likes) {
      for (const s of spots[k] || []) if ((s.x - c.x) ** 2 + (s.y - c.y) ** 2 < R2 && ++n >= 3) break;
      if (n >= 3) break;
    }
    L.comfort += (n / 3 - L.comfort) * 0.2;
  }
}

// How fast an animal ages (1 = as the clock runs), and its chance of wandering
// off at each migration check (every 6 s).
const ageRate = (L) => (1 / (L.vigor || 1)) * (1.1 - 0.4 * (L.comfort ?? 0.5)) * (L.fed > 0 ? 0.85 : 1);
const leaveChance = (L) => 0.004 * (L.wander ?? 0.3) * (1 - (L.comfort ?? 0.5)) ** 2 * (L.fed > 0 ? 0.4 : 1);
const comfortWord = (v) => (v > 0.7 ? 'very comfortable' : v > 0.45 ? 'comfortable' : v > 0.25 ? 'unsettled' : 'uneasy');

// ---- family trees ------------------------------------------------------------------
// One record per animal that has lived here, kept after it leaves so the dock can
// chart each species' lineage: who begat whom, their genes, and their points.

const LINEAGE_MAX = 600, LINEAGE_KEEP = 480;
const hex6 = (c) => `#${[c & 255, (c >> 8) & 255, (c >>> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// The animal's main colour after its genes have dyed it.
function swatchOf(c) {
  const base = c.species === 'wild' ? c.sp.color : c.species === 'tadpole' ? '#4a5a2c' : (SPECIES[c.species] || {}).color || '#9ab8b4';
  return hex6(makeDye(c.life.genome)([hexToInt(base)])[0]);
}

function noteBorn(world, c, how) {
  if (!c.life || c.seed == null || !world.lineage || world.lineage.has(c.seed)) return;
  world.lineage.set(c.seed, {
    s: c.seed, k: c.species, w: c.species === 'wild' ? c.sp.id : null, n: c.life.name, g: c.life.gen, p: c.life.parents || null,
    t: c.life.traits.slice(), c: swatchOf(c), b: Math.round(world.days * 100) / 100, how, d: null, why: null, pts: 0,
  });
  if (world.lineage.size > LINEAGE_MAX) {
    const gone = [...world.lineage.values()].filter((r) => r.d != null).sort((a, b) => a.d - b.d);
    for (const r of gone.slice(0, world.lineage.size - LINEAGE_KEEP)) world.lineage.delete(r.s);
  }
}

function noteGone(world, c, why) {
  const r = world.lineage && c.seed != null ? world.lineage.get(c.seed) : null;
  if (r && r.d == null) { r.d = Math.round(world.days * 100) / 100; r.why = why; }
}

// A tadpole's record carries on as the frog it becomes.
function rekeyLineage(world, t, f) {
  const r = world.lineage && world.lineage.get(t.seed);
  if (!r) return noteBorn(world, f, 'born');
  world.lineage.delete(t.seed);
  Object.assign(r, { s: f.seed, k: 'frog' });
  world.lineage.set(f.seed, r);
}

// Saves from before family trees: start one from whoever is here.
function seedLineage(world) {
  for (const c of world.creatures) noteBorn(world, c, c.life && c.life.gen ? 'born' : 'founder');
}

// ---- the daily round -----------------------------------------------------------------------

let gameTick = 0;
function updateGame(world, dt) {
  const G = world.game;
  if (!G || world.opts.life === false) return;
  gameTick -= dt;
  if (gameTick <= 0) { gameTick = 2; updateComfort(world); }
  const dawn = Math.floor(world.days - 0.27);
  if (G.dawn == null || dawn < G.dawn) G.dawn = dawn;
  else if (dawn > G.dawn) { G.dawn = dawn; dawnIncome(world); }
}

// Each dawn pays a pearl per species in the pond, plus up to 5 for how comfortable everyone is.
function dawnIncome(world) {
  const species = new Set();
  let n = 0, comfort = 0;
  for (const c of world.creatures) {
    if (!c.life || c.leaving) continue;
    species.add(c.species === 'wild' ? `w${c.sp.id}` : c.species);
    n++;
    comfort += c.life.comfort;
  }
  if (!n) return;
  const got = award(world, species.size + Math.round(5 * comfort / n), 'daily pearls');
  logEvent(world, `A new day's pearls: +${got} for ${species.size} species, ${comfortWord(comfort / n)}`, null, { cat: 'pond', pri: 1 });
}

// ---- fireflies keep score --------------------------------------------------------------------
// A full swarm means your score is in the high-score range (the leaderboard's top
// ten, or HIGH_FLOOR while that is lower). Past it, blue fireflies join: two at
// first and two more each time the score doubles; the top three ponds get more.

function fireflyPlan(world) {
  const full = Math.round(world.W * world.H / 9000) + 4, pts = world.game ? world.game.points : 0;
  const net = typeof Net !== 'undefined' ? Net : null;
  const high = Math.max(HIGH_FLOOR, (net && net.board && net.board.high) || 0);
  const yellow = pts <= 0 ? 0 : Math.max(1, Math.round(full * Math.sqrt(Math.min(1, pts / high))));
  let blue = pts >= high ? 2 + 2 * Math.floor(Math.log2(pts / high)) : 0;
  const rank = net && net.rank;
  if (blue && rank === 1) blue = Math.max(blue, Math.round(full * 0.75));
  else if (blue && rank && rank <= 3) blue = Math.max(blue, Math.round(full * 0.4));
  return { yellow, blue: Math.min(full, blue), full, high };
}
