'use strict';
// The game layer. Three currencies:
//  - points (★): your score; they never go down. Harder habitats pay more.
//  - pearls (●): every point also pays a pearl; they buy plants, food and structures.
//  - essence (◆): the stuff of life. It buys new animals (priced by size, rarity,
//    how reliably they settle and how long they live) and gene boosts for them,
//    and comes back when animals are recycled (more for rarer ones) or live out their lives.
// Rare animals score by tier, more each time you breed the same rare again.
// Animals are comfortable near the plants and rocks their species likes, in calm
// water of their own kind, and comfort and good food help them live longer and
// stay. The family tree of every animal is kept for the dock's charts, and the
// fireflies at night show how your score compares to the high scores.

const START_PEARLS = 30;
const START_ESSENCE = 15;
const TIER_ESSENCE = [0, 2, 5, 12, 30, 80]; // extra essence for recycling a rare, by tier
const TIER_VALUE = [1, 3, 8, 20, 50, 150];   // points for a birth by tier (arrivals score half)
const FIRST_BONUS = 20;                       // the first of a rare kind in this pond
const HIGH_FLOOR = 110;                        // the high-score depth (fathoms), until the leaderboard sets it deeper

const PLANT_PRICE = { weed: 4, eelgrass: 4, duckweed: 3, marimo: 8, lily: 8, anemone: 15, coral: 15, urchin: 6, rock: 2 };
const FOOD_PRICE = { pellet: 0, spirulina: 3, brine: 5 };
const newGame = () => ({
  points: 0, pearls: START_PEARLS, essence: START_ESSENCE, earned: {}, lines: {}, seen: [], finds: [], best: null, recent: [], dawn: null, board: true,
});

// ---- essence: buying new spawn --------------------------------------------------------
// A spawn's price follows its size, rarity, how reliably it settles, and how long it
// lives (a long life is worth more). A spawn that doesn't settle returns half.
function spawnCost(kind) {
  const s = SPECIES_STATS[kind] || SPECIES_STATS.wild;
  const one = (1 + s.size ** 1.5 * 1.6) * (1 + 0.8 * s.rarity) * Math.pow(s.years, 0.3) * (0.55 + 0.45 * s.settle);
  return Math.max(2, Math.round(one * 0.5 * Math.pow(s.group || 1, 0.55)));
}
const settleChance = (world, kind, extra = 0) => clamp((SPECIES_STATS[kind] || SPECIES_STATS.wild).settle * difficulty(world).settle + extra, 0.05, 0.99);

// Gene boosts to buy with a spawn: each nudges a working gene of every animal in it.
const ENHANCE = {
  fertile: { label: 'Fertile', gene: 'fert', add: 0.25, buff: 'fertility', note: 'lays more eggs, sooner' },
  longlived: { label: 'Long-lived', gene: 'lon', add: 0.25, buff: 'longevity', note: 'ages slower' },
  hardy: { label: 'Hardy', gene: 'vit', add: 0.25, buff: 'vitality', settle: 0.1, note: 'settles more often and goes hungry slower' },
  clever: { label: 'Clever', gene: 'iq', add: 0.25, buff: 'intellect', note: 'spots food and danger from further off' },
  bright: { label: 'Bright', gene: 'lum', add: 0.35, buff: 'light', note: 'glows at night; plankton gathers in its light' },
  calm: { label: 'Calm', gene: 'agg', add: -0.3, buff: 'aggression', note: 'less aggressive, so the water around it stays calm' },
  adaptable: { label: 'Adaptable', gene: 'tol', add: 0.4, buff: 'tolerance', note: 'copes with the other water' },
  carrier: { label: 'Rare carrier', carrier: true, buff: 'luck', note: 'carries one hidden copy of a rare colour gene' },
};
const enhanceCost = (kind, key) => {
  const base = spawnCost(kind);
  return Math.round(key === 'carrier' ? 6 + base * 0.45 : 2 + base * 0.2);
};
const spawnPrice = (kind, enh = []) => spawnCost(kind) + enh.reduce((a, k) => a + enhanceCost(kind, k), 0);

function applyEnhancements(c, enh) {
  if (!c.life || !enh.length) return;
  const g = c.life.genome;
  for (const key of enh) {
    const e = ENHANCE[key];
    if (e.carrier) {
      const k = pick(['albino', 'melanistic', 'piebald', 'xanthic', 'axanthic', 'leu']);
      g[k] = Math.max(g[k] || 0, 1);
    } else g[e.gene] = clamp(g[e.gene] + e.add, 0, 1);
  }
  c.life.traits = traitsOf(g);
  refreshBuffs(c);
}

// What each species in the pond amounts to: how many, their total worth (what
// recycling them all would return), the rarest tier among them, how many kinds
// of rare look they show, and their genetic diversity (average share of
// heterozygous loci, 0..1). Tadpoles count with frogs.
function speciesSummary(world) {
  const by = new Map();
  for (const c of world.creatures) {
    if (!c.life || c.leaving || c.unsettled) continue;
    const kind = c.species === 'tadpole' ? 'frog' : c.species;
    let s = by.get(kind);
    if (!s) by.set(kind, s = { kind, n: 0, value: 0, best: 0, looks: new Set(), het: 0, list: [] });
    s.n++;
    s.value += recycleValue(c);
    s.best = Math.max(s.best, tierOf(c.life.traits));
    s.looks.add(c.life.traits.join('+'));
    s.het += LOCI.filter((k) => c.life.genome[k] === 1).length / LOCI.length;
    s.list.push(c);
  }
  for (const s of by.values()) s.diversity = s.het / s.n;
  return by;
}
const diversityWord = (d) => (d > 0.25 ? 'very diverse' : d > 0.12 ? 'diverse' : d > 0.04 ? 'a little diverse' : 'uniform');

function gainEssence(world, n, why, subject = null, opts = {}) {
  const G = world.game;
  n = Math.round(n);
  if (!G || n <= 0) return 0;
  G.essence = (G.essence || 0) + n;
  G.recent.unshift({ n, why, ess: true, t: world.t, day: Math.floor(world.days) + 1, clock: world.clock });
  G.recent.length = Math.min(G.recent.length, 10);
  if (subject && !opts.quiet && typeof floatAward === 'function') floatAward(subject.x, subject.y, `+${n}◆`, 'essence');
  world.gameDirty = true;
  return n;
}

function spendEssence(world, n) {
  const G = world.game;
  if (!n) return true;
  if (!G || (G.essence || 0) < n) return false;
  G.essence -= n;
  world.gameDirty = true;
  return true;
}

// What recycling an animal gives back: part of what one costs, more for grown
// ones, and a bonus by rarity tier.
function recycleValue(c) {
  if (!c.life) return 0;
  const kind = c.species === 'tadpole' ? 'frog' : c.species, s = SPECIES_STATS[kind] || SPECIES_STATS.wild;
  const one = spawnCost(kind) / (s.group || 1), grown = 0.4 + 0.6 * Math.min(1, c.life.scale);
  return Math.max(1, Math.round((one * 0.4 * grown + TIER_ESSENCE[tierOf(c.life.traits)]) * (typeof gradeWorth === 'function' ? gradeWorth(c.life.genome) : 1)));
}

// Bigger ponds hold more animals, so they'd out-earn small ones: points scale by the
// square root of a reference area over the pond's original area (deepening doesn't count).
function sizeFairness(world) {
  const [W0, H0] = typeof baseSize === 'function' && world.expandPx ? baseSize(world) : [world.W, world.H];
  return clamp(Math.sqrt(960 * 540 / Math.max(1, W0 * H0)), 0.6, 1.5);
}

// Credit points (and as many pearls). `subject` gets the points in its family
// record, and unless quiet a "+N" floats up from it.
function award(world, n, why, subject = null, opts = {}) {
  const G = world.game;
  n = Math.round(n * (opts.flat ? 1 : difficulty(world).points * sizeFairness(world)));
  if (!G || n <= 0) return 0;
  G.points += n;
  G.pearls += typeof hasArtifact === 'function' && hasArtifact(world, 'pearlheart') ? Math.round(n * 1.25) : n; // the heart of pearl
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
  // Firsts deepen the pond; repeats only a little (less in a big pond, where there are more of them).
  if (typeof deepenBy === 'function') deepenBy(world, tier * (first ? 0.03 : (how === 'born' ? 0.002 : 0.001) * clamp(960 * 540 / (world.W * world.H), 0.4, 2.5)));
  const bred = G.lines[key] || 0, verb = how === 'born' ? 'hatched' : 'arrived';
  const note = first ? ', a first for this pond' : how === 'born' && bred > 1 ? `, bred ${bred}×` : '';
  if (tier <= 1 && how === 'arrived' && !first) { noteFind(world, c, tier, how); return; } // uncommon newcomers just score
  logEvent(world, `✦ ${TIERS[tier]}! ${withArticle(`${traits} ${label}`)} ${verb}: ${c.life.name}${note} · +${n}`, c, {
    cat: 'rare', pri: tier >= 3 ? 3 : tier === 2 ? 2 : 0, key: `rare:${key}:${how}`, data: n,
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
  marimo: 'marimo', duckweed: 'duckweed', rock: 'rocks', ship: 'the wreck', island: 'islands', vent: 'vents',
  spring: 'springs', shrine: 'the shrine', aerator: 'the aerator', seedbed: 'the seed bed', hatchery: 'the hatchery',
};
const COMFORT_R = 56;

// What an animal likes nearby: plants and rocks, plus structures its species favours.
function likesOf(c) {
  const kind = c.species === 'tadpole' ? 'frog' : c.species;
  const base = c.species === 'wild' ? (c.sp.habitat === 'salt' ? ['coral', 'anemone', 'weed'] : ['weed', 'eelgrass', 'lily']) : LIKES[c.species] || null;
  if (!base) return null; // drifters don't mind
  return [...base, ...Object.keys(STRUCT_LIKES).filter((k) => STRUCT_LIKES[k].includes(kind))];
}

// Comfort: liked plants and rocks nearby, less in hostile water or the wrong water
// (unless tolerant), and at night a little more in the light of a glowing neighbour.
function updateComfort(world) {
  const spots = { rock: world.rocks };
  for (const p of world.plants) (spots[p.make] || (spots[p.make] = [])).push(p);
  for (const p of world.pads) if (!p.dead) (spots.lily || (spots.lily = [])).push(p);
  for (const s of world.structures || []) (spots[s.kind] || (spots[s.kind] = [])).push(s);
  spots.remains = world.remains || [];
  spots.river = world.river ? [world.river.spot] : [];
  world.likeSpots = spots;
  const litter = world.litter && world.litter.length, blight = world.blight;
  const lights = world.darkness > 0.5 ? world.creatures.filter((c) => geneBuffs(c).light > 0.3) : [];
  const R2 = COMFORT_R * COMFORT_R;
  for (const c of world.creatures) {
    const L = c.life;
    if (!L) continue;
    const likes = likesOf(c);
    let n = likes ? 0 : 1.8; // drifters don't mind
    if (likes) {
      for (const k of likes) {
        for (const s of spots[k] || []) if ((s.growth ?? 1) >= 0.4 && (s.x - c.x) ** 2 + (s.y - c.y) ** 2 < R2 && ++n >= 3) break;
        if (n >= 3) break;
      }
    }
    L.aura = auraAt(world, c.x, c.y);
    let target = n / 3 + L.aura.comfort - aggressionAt(world, c.x, c.y) * 0.3 - mismatch(world, c) * (1 - L.buffs.tolerance) * 0.6;
    for (const l of lights) if (l !== c && (l.x - c.x) ** 2 + (l.y - c.y) ** 2 < 1600) { target += 0.15; break; }
    if (litter) target -= 0.8 * pollutionAt(world, c.x, c.y); // litter spoils the water
    if (blight) target -= blightComfort(world, c);
    L.comfort += (clamp(target, 0, 1) - L.comfort) * 0.2;
  }
}

// ---- natural rhythms and favourite places ---------------------------------------------------
// When each species is about: most fish and birds by day; eels, octopus, catfish,
// crabs, frogs, shrimp, snails and axolotls at night (resting near cover by day);
// rays and hunting wild fish at dawn and dusk; sharks, jellies, starfish and the
// deep all the time.
const RHYTHM = {
  eel: 'night', octopus: 'night', catfish: 'night', crab: 'night', frog: 'night', shrimp: 'night', snail: 'night', axolotl: 'night',
  ray: 'dusk', snake: 'day', shark: 'always', sandshark: 'dusk', jelly: 'always', starfish: 'always', kraken: 'night', watcher: 'night',
};
function activity(world, c) {
  const r = RHYTHM[c.species] || (typeof DEEP !== 'undefined' && DEEP[c.species] ? 'always' : c.species === 'wild' && c.sp.predator ? 'dusk' : 'day');
  const d = world.darkness || 0;
  if (r === 'always') return 1;
  if (r === 'night') return 0.35 + 0.8 * d;
  if (r === 'dusk') return 0.5 + 0.7 * (1 - Math.abs(d - 0.5) * 2);
  return 1 - 0.65 * d;
}

// Somewhere an animal likes to be (a liked plant, rock or structure), nearer ones
// more likely, so each species gathers where it's most comfortable.
function likedSpot(world, c) {
  const likes = likesOf(c), spots = world.likeSpots;
  if (!likes || !spots) return null;
  const cand = [];
  let total = 0;
  for (const k of likes) {
    for (const s of spots[k] || []) {
      if ((s.growth ?? 1) < 0.4) continue;
      const d = Math.hypot(s.x - c.x, s.y - c.y);
      if (d > 220) continue;
      const w = 1 / (d + 40);
      cand.push([s, w]); total += w;
    }
  }
  if (!cand.length) return null;
  let r = Math.random() * total;
  for (const [s, w] of cand) if ((r -= w) <= 0) return s;
  return cand[0][0];
}
const spotRadius = (s) => (s.kind && STRUCTURES[s.kind] ? STRUCTURES[s.kind].size : s.R || s.r || s.a || 6);

// How fast an animal ages (1 = as the clock runs), and its chance of wandering
// off at each migration check (every 6 s).
const ageRate = (L) => (1 / ((L.vigor || 1) * (L.buffs ? L.buffs.longevity : 1))) * (1.1 - 0.4 * (L.comfort ?? 0.5)) * (L.fed > 0 ? 0.85 : 1) * (L.aura ? L.aura.aging : 1);
// Restlessness (wanderlust when ill at ease), fear (local aggression, eased by
// resilience) and being in the wrong water (eased by tolerance), halved when well fed.
function leaveChance(L, aggr = 0, mm = 0) {
  const B = L.buffs || NO_BUFFS;
  const restless = (L.wander ?? 0.3) * (1 - (L.comfort ?? 0.5)) ** 2;
  const fear = aggr * 0.75 * (1 - B.resilience), wrong = mm * 0.45 * (1 - B.tolerance);
  return 0.004 * (restless + fear + wrong) * (L.fed > 0 ? 0.5 : 1);
}
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
  else if (dawn > G.dawn) { G.dawn = dawn; dawnIncome(world); dawnStructures(world); }
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
  // Deep life enriches the pond: a little more essence for every deep-water animal.
  const deep = typeof DEEP === 'undefined' ? 0 : world.creatures.filter((c) => DEEP[c.species] && !c.leaving).length;
  const ess = gainEssence(world, 2 + Math.floor(species.size / 4) + deep, 'dawn');
  logEvent(world, `A new day: +${got} pearls and +${ess} essence for ${species.size} species, ${comfortWord(comfort / n)}`, null, { cat: 'pond', pri: 1 });
}

// ---- fireflies keep score --------------------------------------------------------------------
// A full swarm means your score is in the high-score range (the leaderboard's top
// ten, or HIGH_FLOOR while that is lower). Past it, blue fireflies join: two at
// first and two more each time the score doubles; the top three ponds get more.

function fireflyPlan(world) {
  const full = Math.round(world.W * world.H / 9000) + 4, f = typeof pondFathoms === 'function' ? pondFathoms(world) : 1;
  const net = typeof Net !== 'undefined' ? Net : null;
  const high = Math.max(HIGH_FLOOR, (net && net.board && net.board.high) || 0);
  const yellow = Math.max(1, Math.round(full * clamp(Math.log(1 + f) / Math.log(1 + high), 0, 1)));
  let blue = f >= high ? 2 + 2 * Math.floor(Math.log2(f / high)) : 0;
  const rank = net && net.rank;
  if (blue && rank === 1) blue = Math.max(blue, Math.round(full * 0.75));
  else if (blue && rank && rank <= 3) blue = Math.max(blue, Math.round(full * 0.4));
  return { yellow, blue: Math.min(full, blue), full, high };
}
