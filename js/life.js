'use strict';
// The living pond: genes, hunger, growth, breeding, predators and prey,
// animals migrating in and out, plankton, gnats, ripples, bubbles and weather.

// ---- genes ------------------------------------------------------------------
// Continuous genes (size, colour, body shape, speed) blend between parents and
// drift. Albino, melanistic, piebald, xanthic (golden) and axanthic (blue-grey)
// are recessive: every animal carries 0, 1 or 2 copies, and only two copies
// show. Two carriers can surprise you with a rare baby. Shiny, glow
// (bioluminescent) and ghost (pale, see-through colours) are rare mutations that
// often pass on; dwarfs and giants come from the size gene.

const RECESSIVE = ['albino', 'melanistic', 'piebald'];
const RECESSIVE2 = ['xanthic', 'axanthic'];
const CARRIER_RATE = { albino: 0.06, melanistic: 0.05, piebald: 0.07, xanthic: 0.04, axanthic: 0.03 }; // (made rarer: rare should mean rare)
const allele = (p) => (Math.random() < p ? 1 : 0) + (Math.random() < p ? 1 : 0);

function makeGenome() {
  const g = {
    size: rand(0.85, 1.15) * (Math.random() < 0.008 ? 1.3 : 1),
    hue: rand(-18, 18), sat: rand(0.85, 1.18), light: rand(0.92, 1.08), speed: rand(0.88, 1.18),
    girth: rand(0.88, 1.14), length: rand(0.92, 1.1),
    shiny: Math.random() < 1 / 300, shinyHue: rand(100, 240), seed: randi(0, 9999),
  };
  for (const k of RECESSIVE) g[k] = allele(CARRIER_RATE[k]);
  return g;
}

// Genes added later draw from their own random stream (see genomeFor), so every
// seed's original genes stay exactly what they were.
function makeGenome2() {
  const g = { glow: Math.random() < 1 / 800, ghost: Math.random() < 1 / 1000 };
  for (const k of RECESSIVE2) g[k] = allele(CARRIER_RATE[k]);
  if (Math.random() < 1 / 160) g.size = rand(0.7, 0.75); // a dwarf
  return g;
}

function childGenome2(a, b, m = 1) {
  const g = {};
  for (const k of RECESSIVE2) g[k] = Math.min(2, passOn(a[k] || 0) + passOn(b[k] || 0) + (Math.random() < m / 900 ? 1 : 0));
  for (const [k, p] of [['glow', 1 / 1200], ['ghost', 1 / 1500]]) {
    const n = (a[k] ? 1 : 0) + (b[k] ? 1 : 0);
    g[k] = Math.random() < (n === 2 ? 0.4 : n === 1 ? 0.15 : p * m);
  }
  if (Math.random() < m / 600) g.size = rand(0.7, 0.75);
  return g;
}

// ---- working genes (a third stream, genome3/<seed>) ------------------------------
// Quantitative traits, 0..1 around 0.5 and polygenic (they blend and drift):
// fertility, longevity, vitality, intellect, luminance, aggression, tolerance
// (of the other water), territory (how hard it claims its water) and resilience.
// Plus loci that inherit the ways real genes do:
//  - leucism (leu) is incompletely dominant: one copy pales, two make it white.
//  - marbled (mar) is dominant: one copy shows; two copies are frail, like merle.
//  - a mutator allele (mut), doubled, makes offspring mutate far more often.
//  - chimera (chi) is not inherited: a developmental accident, two halves in one.
const FGENES = ['fert', 'lon', 'vit', 'iq', 'lum', 'agg', 'tol', 'ter', 'res'];
const FGENE_DRIFT = 0.06;
const bell = () => clamp(0.5 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.28, 0, 1);

function makeGenome3() {
  const g = {};
  for (const k of FGENES) g[k] = bell();
  g.leu = allele(0.03);
  g.mar = Math.random() < 1 / 350 ? 1 : 0;
  g.mut = allele(0.03);
  g.chi = Math.random() < 1 / 1500;
  return g;
}

function childGenome3(a, b, m = 1) {
  const g = {};
  for (const k of FGENES) g[k] = clamp(lerp(a[k] ?? 0.5, b[k] ?? 0.5, Math.random()) + (Math.random() + Math.random() - 1) * FGENE_DRIFT * Math.sqrt(m), 0, 1);
  g.leu = Math.min(2, passOn(a.leu || 0) + passOn(b.leu || 0) + (Math.random() < m / 1000 ? 1 : 0));
  g.mar = Math.min(2, passOn(a.mar || 0) + passOn(b.mar || 0) + (Math.random() < m / 900 ? 1 : 0));
  g.mut = Math.min(2, passOn(a.mut || 0) + passOn(b.mut || 0));
  g.chi = Math.random() < m / 1500;
  return g;
}

// The eldritch mark ('eld', a fourth stream): almost never out of nowhere, but
// passed on readily; what it becomes is up to the pond (see eldritch.js).
function makeGenome4() { return { eld: Math.random() < 1 / 3000 }; }
function childGenome4(a, b, m = 1) {
  const n = (a.eld ? 1 : 0) + (b.eld ? 1 : 0);
  return { eld: Math.random() < (n === 2 ? 0.35 : n === 1 ? 0.15 : m / 3000) };
}

// Hypermutable parents (two mutator copies) and shiny ones ("luck") raise the odds of new mutations.
const mutFactor = (a, b) => (1 + 1.5 * ((a.mut === 2 ? 1 : 0) + (b.mut === 2 ? 1 : 0))) * (a.shiny || b.shiny ? 1.5 : 1);

const GENE_LIMITS = {
  size: [0.7, 1.5], hue: [-40, 40], sat: [0.7, 1.35], light: [0.82, 1.18], speed: [0.75, 1.3],
  girth: [0.8, 1.25], length: [0.85, 1.18],
};
const GENE_DRIFT = { size: 0.05, hue: 6, sat: 0.05, light: 0.03, speed: 0.05, girth: 0.04, length: 0.03 };

// Pass on one copy of a recessive gene from a parent holding n copies.
const passOn = (n) => (n === 2 ? 1 : n === 1 ? (Math.random() < 0.5 ? 1 : 0) : 0);

// Blend two parents, then mutate a little, so lineages drift over generations.
function childGenome(a, b, m = 1) {
  const g = { seed: randi(0, 9999) };
  for (const k of Object.keys(GENE_LIMITS)) {
    const v = lerp(a[k], b[k], Math.random()) + (Math.random() + Math.random() - 1) * GENE_DRIFT[k];
    g[k] = clamp(v, ...GENE_LIMITS[k]);
  }
  for (const k of RECESSIVE) g[k] = Math.min(2, passOn(a[k] || 0) + passOn(b[k] || 0) + (Math.random() < m / 900 ? 1 : 0));
  const shinyParent = a.shiny ? a : b.shiny ? b : null;
  g.shiny = Math.random() < (shinyParent ? 0.2 : m / 600);
  g.shinyHue = shinyParent ? shinyParent.shinyHue : rand(100, 240);
  return g;
}

// Visible rare traits, most striking first. Only one colour morph shows: albino
// hides the others, then axanthic, xanthic, melanistic.
function traitsOf(g) {
  const t = [];
  if (g.eld) t.push('touched');
  if (g.chi) t.push('chimera');
  if (g.shiny) t.push('shiny');
  if (g.glow) t.push('glow');
  if (g.ghost) t.push('ghost');
  let morph = true;
  if (g.albino === 2) t.push('albino');
  else if (g.leu === 2) t.push('leucistic');
  else if (g.axanthic === 2) t.push('axanthic');
  else if (g.xanthic === 2) t.push('xanthic');
  else if (g.melanistic === 2) t.push('melanistic');
  else morph = false;
  if (g.mar) t.push('marbled');
  if (g.piebald === 2) t.push('piebald');
  if (g.size > 1.3) t.push('giant');
  else if (g.size < 0.76) t.push('dwarf');
  if (g.leu === 1 && !morph) t.push('pale');
  if (typeof quirkTraits === 'function') quirkTraits(g, t); // gifts and curses (quirks.js)
  if (g.xeno && typeof XENO_TRAITS !== 'undefined' && XENO_TRAITS[g.xeno - 1]) t.push(XENO_TRAITS[g.xeno - 1]); // the evolved (alien.js)
  return t;
}
const carriesOf = (g) => [...RECESSIVE, ...RECESSIVE2].filter((k) => g[k] === 1);
const LOCI = [...RECESSIVE, ...RECESSIVE2, 'leu', 'mar', 'mut'];

// Rarity tiers: each trait adds its rarity, and the sum sets the tier.
const TRAIT_RARITY = {
  pale: 1, piebald: 1, giant: 2, dwarf: 2, melanistic: 2, xanthic: 2, marbled: 2, axanthic: 3, albino: 3, leucistic: 3,
  shiny: 4, ghost: 4, glow: 4, chimera: 5, touched: 4, changed: 5, eldritch: 7, ascended: 9,
};
const TIERS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const TIER_COLOR = ['#8fbcb8', '#7ee0c3', '#6fb7ef', '#c38bff', '#ffb347', '#ff6fae'];
function tierOf(traits) {
  const s = traits.reduce((a, t) => a + (TRAIT_RARITY[t] || 1), 0);
  return s === 0 ? 0 : s === 1 ? 1 : s <= 3 ? 2 : s <= 5 ? 3 : s <= 7 ? 4 : 5;
}

const RARE_OUTLINE = {
  shiny: hexToInt('#ffd166'), glow: hexToInt('#7dffb0'), ghost: hexToInt('#eaf6ff'), albino: hexToInt('#ff9eb5'),
  axanthic: hexToInt('#8ecbff'), xanthic: hexToInt('#ffe45c'), melanistic: hexToInt('#a78bfa'), piebald: hexToInt('#7ee0c3'),
  giant: hexToInt('#ffb86b'), dwarf: hexToInt('#c3a6ff'), leucistic: hexToInt('#f4f0e8'), marbled: hexToInt('#d8a0ff'),
  chimera: hexToInt('#ff6fae'), touched: hexToInt('#8a5ae0'), changed: hexToInt('#6a3ac8'), eldritch: hexToInt('#3aff9a'), ascended: hexToInt('#ff4ad8'),
};
const RED_EYE = solid('#d8203a');
const PIEBALD_WHITE = mat('#9aa0a6', '#d0d4d6', '#f0f0ec', '#ffffff');

const isMat = (v) => Array.isArray(v) && v.length === 4 && typeof v[0] === 'number' && v[0] >= 0xff000000;

function makeDye(g) {
  const cache = new Map(), albino = g.albino === 2, axanthic = !albino && g.axanthic === 2;
  const leuc = !albino && g.leu === 2, pale = !albino && !leuc && g.leu === 1;
  const xanthic = !albino && !axanthic && g.xanthic === 2, melanistic = !albino && !axanthic && !xanthic && g.melanistic === 2;
  return (m) => {
    let d = cache.get(m);
    if (!d) {
      d = m.map((c) => {
        let [h, s, l] = rgbToHsl(c);
        h += g.hue; s *= g.sat; l *= g.light;
        if (g.shiny) { h += g.shinyHue; s = Math.min(1, s * 1.2 + 0.12); }
        if (albino) { s *= 0.12; l = 0.62 + l * 0.38; h = 350; }
        else if (leuc) { s *= 0.1; l = 0.72 + l * 0.28; }
        else if (axanthic) { h = 205; s *= 0.32; l = l * 0.9 + 0.06; } // no yellow or red pigment
        else if (xanthic) { h = 46 + (((h - 46) % 360 + 540) % 360 - 180) * 0.2; s = Math.min(1, s * 1.15 + 0.12); l = Math.min(0.9, l * 1.08 + 0.05); }
        else if (melanistic) { l *= 0.38; s *= 0.45; }
        if (pale) { s *= 0.6; l = l * 0.82 + 0.16; }
        if (g.ghost) { h = 190; s *= 0.22; l = 0.64 + l * 0.36; }
        if (g.glow) { s = Math.min(1, s * 1.1 + 0.1); l = Math.min(0.92, l * 1.06 + 0.04); }
        return hsl(h, s, l);
      });
      cache.set(m, d);
    }
    return d;
  };
}

// Re-colour an individual: its own materials, baked pattern tables (with
// piebald patches painted in), and its variety object.
// Patterns painted into baked tables: piebald patches, marbled veins, and a
// chimera's second half dyed as if it were another animal.
function dyeCreature(c, g) {
  const dye = makeDye(g), piebald = g.piebald === 2, marbled = g.mar > 0;
  const other = g.chi ? makeDye({ ...g, hue: g.hue + 150, chi: false, shiny: !g.shiny, shinyHue: 200 }) : null;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (isMat(v)) c[k] = dye(v);
    else if (typeof v === 'function' && v.table) {
      const T = v.table, orig = T.slice();
      for (let i = 0; i < T.length; i++) if (isMat(T[i])) T[i] = dye(T[i]);
      if ((piebald || marbled || other) && v.dims) {
        const [nu, nv, u0] = v.dims;
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
          const u = u0 + (i + 0.5) / nu * (1 - u0), vv = (j + 0.5) / nv * 2 - 1, q = i + j * nu;
          if (!isMat(T[q])) continue;
          if (other && vv < 0) T[q] = other(orig[q]);
          if (marbled && Math.abs(vnoise(u * 9 + g.seed, vv * 3, 93) - 0.5) < 0.05) T[q] = [T[q][0], T[q][0], T[q][1], T[q][2]];
          if (piebald && vnoise(u * 5 + g.seed, vv * 2.2, 91) > 0.56) T[q] = PIEBALD_WHITE;
        }
      }
    } else if (k === 'v' && v && typeof v === 'object' && !Array.isArray(v)) {
      const o = { ...v };
      for (const kk of Object.keys(o)) if (isMat(o[kk])) o[kk] = dye(o[kk]);
      c[k] = o;
    }
  }
  if (g.albino === 2) c.eyeMat = RED_EYE;
  if (g.glow && c.id && !EMISSIVE[c.id]) EMISSIVE[c.id] = 1; // bioluminescent: stays bright at night
  // Rare animals are marked with a thick outline in their trait's colour.
  const rare = traitsOf(g).find((t) => RARE_OUTLINE[t]);
  if (rare && c.id) { OUTLINE[c.id] = RARE_OUTLINE[rare]; THICK[c.id] = 1; }
}

// ---- life -------------------------------------------------------------------

// What each species is like, for its price and its life: size class (1-5),
// rarity (0 common .. 4 legendary), how often a bought spawn settles in, its
// real-world lifespan in years, and how many come in one purchase.
const SPECIES_STATS = {
  koi: { size: 3, rarity: 1, settle: 0.9, years: 30 },
  tetra: { size: 1, rarity: 0, settle: 0.8, years: 5, group: 11 },
  eel: { size: 3, rarity: 1, settle: 0.75, years: 20 },
  axolotl: { size: 2, rarity: 2, settle: 0.65, years: 12 },
  turtle: { size: 3, rarity: 1, settle: 0.85, years: 30 },
  crab: { size: 1, rarity: 0, settle: 0.9, years: 4 },
  ray: { size: 3, rarity: 1, settle: 0.7, years: 15 },
  frog: { size: 1, rarity: 0, settle: 0.85, years: 8 },
  snake: { size: 2, rarity: 1, settle: 0.75, years: 9 },
  snail: { size: 1, rarity: 0, settle: 0.95, years: 2, group: 3 },
  jelly: { size: 2, rarity: 0, settle: 0.7, years: 1 },
  clown: { size: 1, rarity: 1, settle: 0.8, years: 8, group: 2 },
  puffer: { size: 2, rarity: 1, settle: 0.75, years: 10 },
  octopus: { size: 3, rarity: 2, settle: 0.6, years: 1.5 },
  duck: { size: 3, rarity: 0, settle: 0.9, years: 7, group: 5 },
  shrimp: { size: 1, rarity: 0, settle: 0.85, years: 1.5, group: 4 },
  dragonfly: { size: 1, rarity: 0, settle: 0.9, years: 0.3 },
  wild: { size: 2, rarity: 1, settle: 0.8, years: 6 },
  starfish: { size: 1, rarity: 0, settle: 0.9, years: 30 },
};
// Real years compress into pond time: a snail lives about 7 minutes here, a koi
// half an hour, and the longest-lived species for hours.
const lifeSeconds = (years) => 300 * Math.pow(years, 0.55);
function lifeRange(species) {
  if (species === 'tadpole') return [1e9, 1e9];
  const s = lifeSeconds((SPECIES_STATS[species] || SPECIES_STATS.wild).years);
  return [s * 0.85, s * 1.15];
}
const GROUPS = new Set(['tetra', 'shrimp', 'snail', 'duck', 'wild', 'clown']);
const NO_LIFE = new Set(['firefly', 'gnat']);
const EATS = new Set(['koi', 'tetra', 'eel', 'axolotl', 'turtle', 'crab', 'ray', 'frog', 'snake', 'snail', 'clown', 'puffer', 'octopus', 'duck', 'shrimp', 'wild', 'tadpole', 'starfish']);
const SCALABLE = new Set(['koi', 'tetra', 'eel', 'clown', 'puffer', 'ray', 'snake', 'wild', 'tadpole', 'axolotl', 'turtle', 'crab', 'snail', 'shrimp', 'frog']);
const LEG_KEYS = ['reach', 'l1', 'l2', 'r1', 'r2', 'foot', 'stepDist', 'inset'];
// Short-lived species lay more and breed sooner (more rolls of the genetic dice);
// long-lived ones breed again and again over a long life. Fertility genes scale
// clutches and the rest between them; see breed().
const BREED = {
  koi: { clutch: [2, 4], hatch: 25, cap: 10, eggs: 'plant' },
  tetra: { clutch: [4, 7], hatch: 18, cap: 30, eggs: 'plant' },
  wild: { clutch: [2, 5], hatch: 20, cap: 16, eggs: 'plant' },
  clown: { clutch: [1, 3], hatch: 20, cap: 6, eggs: 'plant' },
  shrimp: { clutch: [3, 5], hatch: 15, cap: 16, eggs: 'floor' },
  snail: { clutch: [2, 4], hatch: 30, cap: 10, eggs: 'rock' },
  axolotl: { clutch: [1, 3], hatch: 30, cap: 4, eggs: 'plant' },
  frog: { clutch: [3, 5], hatch: 20, cap: 6, eggs: 'surface' },
};
const matureAt = (L) => Math.max(30, L.lifespan * 0.12);
const SINGULAR = {
  koi: 'Koi', tetra: 'Tetra', eel: 'Eel', axolotl: 'Axolotl', turtle: 'Turtle', crab: 'Crab', ray: 'Stingray', frog: 'Frog',
  snake: 'Water snake', snail: 'Snail', jelly: 'Jellyfish', clown: 'Clownfish', puffer: 'Pufferfish', octopus: 'Octopus',
  duck: 'Duck', shrimp: 'Shrimp', dragonfly: 'Dragonfly', firefly: 'Firefly', gnat: 'Gnat', tadpole: 'Tadpole', starfish: 'Starfish',
};
const ECO = { births: 0, arrivals: 0, departures: 0, eaten: 0, rares: 0 };
const ARRIVE_VERB = { dragonfly: 'flew in', frog: 'hopped in', crab: 'scuttled in', snail: 'crept in', turtle: 'paddled in', axolotl: 'wandered in' };
// Seconds from full to empty. Grazers nibble algae as they go, so they rarely go hungry.
const METABOLISM = { snail: 900, crab: 600, turtle: 700, ray: 600, frog: 520, shrimp: 500, starfish: 1500 };

// ---- journal: a running story of the pond --------------------------------------
// Entries carry a category (life, rare, hunt, come, sky, pond). Events that share
// a merge key within MERGE_WINDOW sim-seconds fold into one line: the entry keeps
// every event's data and `merge(entry)` rewrites its text, so a burst of
// departures reads "4 Tetras moved on (3 of old age, 1 hungry)" instead of four lines.

const MERGE_WINDOW = 40;
// How much an entry deserves the ticker: 0 routine (full journal only when busy),
// 1 normal, 2 notable, 3 important (rares, discoveries, records, the pond itself).
const CAT_PRI = { pond: 3, rare: 3, sky: 1, life: 1, hunt: 1, come: 0 };

function logEvent(world, text, subject = null, opts = {}) {
  const { cat = 'pond', key = null, merge = null, data } = opts, pri = opts.pri ?? CAT_PRI[cat] ?? 1;
  const now = world.t || 0;
  if (key) {
    const e = world.journal.find((j) => j.key === key && now - j.t < MERGE_WINDOW);
    if (e) {
      e.n++;
      e.t = now; e.clock = world.clock; e.day = Math.floor(world.days || 0) + 1;
      if (data !== undefined) e.data.push(data);
      if (subject) e.subject = subject;
      if (merge) e.text = merge(e);
      e.pri = Math.max(e.pri, pri);
      world.journal.splice(world.journal.indexOf(e), 1);
      world.journal.unshift(e);
      e.seq = ++world.journalSeq;
      world.journalDirty = true;
      return e;
    }
  }
  const e = {
    t: now, clock: world.clock, day: Math.floor(world.days || 0) + 1, text, subject, cat, key, n: 1, pri,
    data: data !== undefined ? [data] : [], seq: (world.journalSeq = (world.journalSeq || 0) + 1),
  };
  world.journal.unshift(e);
  if (world.journal.length > 150) world.journal.pop();
  world.journalDirty = true;
  if (typeof musicFromLog === 'function') musicFromLog(world, e); // (the music, if it's on, may answer it)
  return e;
}

const who = (c) => (c.life ? `${c.life.name} the ${describe(c).label}` : `a ${describe(c).label.toLowerCase()}`);
const plural = (label, n) => (n === 1 || /fish|shrimp|koi|sh$|is$/i.test(label) ? label : /[^aeiou]y$/i.test(label) ? label.slice(0, -1) + 'ies'
  : /(ch|x|ss|us)$/i.test(label) && !/branch$/i.test(label) ? label + 'es' : label + 's');
const aOrN = (n, label) => (n === 1 ? `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}` : `${n} ${plural(label, n)}`);
const capFirst = (s) => s[0].toUpperCase() + s.slice(1);
// "3 Tetras and a Shrimp" from a list of labels.
function tally(labels) {
  const counts = new Map();
  for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
  const parts = [...counts].sort((a, b) => b[1] - a[1]).map(([l, n]) => aOrN(n, l));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}
const SCHOOLING = (c) => c.species === 'tetra' || c.species === 'shrimp' || (c.species === 'wild' && c.sp.schooling);

function captureBase(c) {
  const b = c.body;
  c.base = {
    links: Array.from(b.links), w: Array.from(b.w), puff: c.baseW && c.baseW.slice(),
    legs: (c.legs || []).map((L) => Object.fromEntries(LEG_KEYS.filter((k) => typeof L[k] === 'number').map((k) => [k, L[k]]))),
  };
}

function applyScale(c, s) {
  const b = c.body, base = c.base, g = c.life ? c.life.genome : null;
  const ls = s * (g ? g.length : 1), ws = s * (g ? g.girth : 1);
  for (let i = 0; i < b.links.length; i++) b.links[i] = base.links[i] * ls;
  for (let i = 0; i < b.w.length; i++) b.w[i] = base.w[i] * ws;
  if (base.puff) c.baseW = base.puff.map((v) => v * ws);
  (c.legs || []).forEach((L, i) => { for (const k in base.legs[i]) L[k] = base.legs[i][k] * s; });
  c.appliedScale = s;
}

const nameFor = (seed) => withSeed(`name/${seed}`, personName);
function lifespanFor(species, seed) {
  const [a, b] = lifeRange(species);
  return withSeed(`life/${seed}`, () => rand(a, b));
}

// Genes follow from seeds: a founder's or newcomer's from its own seed, a baby's
// from its parents' genes plus its seed. A link can then store "parents #12 and
// #15" (or nothing) instead of the genes themselves.
const genomeFor = (seed) => ({
  ...withSeed(`genome/${seed}`, makeGenome), ...withSeed(`genome2/${seed}`, makeGenome2), ...withSeed(`genome3/${seed}`, makeGenome3),
  ...withSeed(`genome4/${seed}`, makeGenome4), ...(typeof makeGenome5 === 'function' ? withSeed(`genome5/${seed}`, makeGenome5) : {}),
});
function childGenomeFor(seed, a, b) {
  const m = mutFactor(a, b);
  return {
    ...withSeed(`genome/${seed}`, () => childGenome(a, b, m)), ...withSeed(`genome2/${seed}`, () => childGenome2(a, b, m)),
    ...withSeed(`genome3/${seed}`, () => childGenome3(a, b, m)), ...withSeed(`genome4/${seed}`, () => childGenome4(a, b, m)),
    ...(typeof childGenome5 === 'function' ? withSeed(`genome5/${seed}`, () => childGenome5(a, b, m)) : {}),
    ...(typeof childXeno === 'function' ? withSeed(`genome6/${seed}`, () => childXeno(a, b)) : {}),
  };
}
const GENOME_KEYS = [...Object.keys(GENE_LIMITS), 'shiny', 'shinyHue', 'seed', ...RECESSIVE, ...RECESSIVE2, 'glow', 'ghost', ...FGENES, 'leu', 'mar', 'mut', 'chi', 'eld'];
const sameGenome = (a, b) => GENOME_KEYS.every((k) => (a[k] || 0) === (b[k] || 0));
// Genomes saved before a gene existed read as not having it (working genes read as average).
function fillGenome(g) {
  for (const k of [...RECESSIVE2, 'leu', 'mar', 'mut']) g[k] = g[k] || 0;
  for (const k of FGENES) if (typeof g[k] !== 'number') g[k] = 0.5;
  g.glow = !!g.glow; g.ghost = !!g.ghost; g.chi = !!g.chi; g.eld = !!g.eld; g.xeno = g.xeno || 0;
  if (typeof G5_KEYS !== 'undefined') for (const k of G5_KEYS) g[k] = !!g[k];
  return g;
}

// ---- buffs: what an animal's genes do ------------------------------------------------
// Multipliers around 1 (fertility, longevity, vitality, intellect, aggression,
// territory, speed) and capacities from 0 (tolerance, resilience, stealth, light,
// calming, luck). Rare traits add their own, sometimes with a cost elsewhere
// (pleiotropy): giants live long but lay fewer eggs; albinos see poorly.
// Heterozygous loci give hybrid vigour; inbreeding costs fertility and longevity.
const MULT_BUFFS = new Set(['fertility', 'longevity', 'vitality', 'intellect', 'aggression', 'territory', 'speed']);
const TRAIT_BUFFS = {
  shiny: { luck: 0.5 }, glow: { light: 0.7 }, ghost: { stealth: 0.6 },
  giant: { calming: 0.12, longevity: 0.15, fertility: -0.2, speed: -0.1 }, dwarf: { fertility: 0.3, longevity: -0.1 },
  xanthic: { vitality: 0.3 }, axanthic: { longevity: 0.25 }, melanistic: { resilience: 0.3 }, piebald: { intellect: 0.2 },
  albino: { longevity: 0.1, intellect: -0.15 }, leucistic: { vitality: 0.2 }, marbled: { territory: 0.4, aggression: 0.1 },
  chimera: { tolerance: 0.6 },
};
const NO_BUFFS = {
  fertility: 1, longevity: 1, vitality: 1, intellect: 1, aggression: 1, territory: 1, speed: 1,
  tolerance: 0, resilience: 0, stealth: 0, light: 0, calming: 0, luck: 0, vigor: 1,
};
function computeBuffs(L) {
  const g = L.genome, F = L.inbred || 0;
  const het = LOCI.filter((k) => g[k] === 1).length, vigor = 1 + 0.03 * het;
  const b = {
    fertility: (0.6 + 0.8 * g.fert) * (1 - F) * vigor,
    longevity: (0.75 + 0.5 * g.lon) * (1 - 0.5 * F) * vigor * (g.mar === 2 ? 0.7 : 1),
    vitality: (0.7 + 0.6 * g.vit) * vigor,
    intellect: 0.7 + 0.6 * g.iq,
    aggression: 0.5 + g.agg,
    territory: 0.5 + g.ter,
    speed: 1,
    tolerance: Math.max(0, g.tol - 0.3) * 0.8,
    resilience: g.res * 0.5,
    stealth: 0, light: Math.max(0, g.lum - 0.78) * 2, calming: 0, luck: 0, vigor, appetite: 1,
  };
  for (const t of L.traits) {
    for (const [k, v] of Object.entries(TRAIT_BUFFS[t] || {})) {
      if (MULT_BUFFS.has(k)) b[k] *= 1 + v; else b[k] += v;
    }
  }
  // A hunter's tenacity (hunters.js).
  const ten = L.hunt ? L.hunt.tenacity || 0 : 0;
  if (ten) { b.longevity *= 1 + 0.06 * ten; b.vitality *= 1 + 0.06 * ten; }
  b.tolerance = Math.min(0.95, b.tolerance);
  b.resilience = Math.max(0, Math.min(0.9, b.resilience));
  b.stealth = Math.max(0, b.stealth);
  return b;
}
const geneBuffs = (c) => (c.life && c.life.buffs) || NO_BUFFS;

// Apply buffs that change how an animal moves and senses (again after a boost).
function refreshBuffs(c) {
  const L = c.life;
  L.buffs = computeBuffs(L);
  if (c.sight) { if (c.baseSight == null) c.baseSight = c.sight; c.sight = c.baseSight * L.buffs.intellect; }
  if (L.buffs.light > 0.2 && c.id && !EMISSIVE[c.id]) EMISSIVE[c.id] = 1;
}

// Wright's inbreeding coefficient, near enough: for each nearest common ancestor
// of the parents, (1/2)^(n1 + n2 + 1) over the generations to it on each side.
function inbreedingOf(world, pa, pb) {
  if (!world.lineage || pa == null || pb == null) return 0;
  const up = (seed) => {
    const dist = new Map([[seed, 0]]);
    let front = [seed];
    for (let d = 1; d <= 4 && front.length; d++) {
      const next = [];
      for (const s of front) for (const p of (world.lineage.get(s) || {}).p || []) if (!dist.has(p)) { dist.set(p, d); next.push(p); }
      front = next;
    }
    return dist;
  };
  const A = up(pa), B = up(pb), common = [...A.keys()].filter((s) => B.has(s));
  // Only the nearest: skip common ancestors that are ancestors of another common ancestor.
  const upSets = new Map(common.map((s) => [s, up(s)]));
  let F = 0;
  for (const s of common) {
    if (common.some((o) => o !== s && upSets.get(o).has(s))) continue;
    F += 0.5 ** (A.get(s) + B.get(s) + 1);
  }
  return Math.min(0.5, F);
}

// Temperament is rolled at birth from the seed: vigor (how slowly it ages) and
// wanderlust (how readily it leaves). Good care softens both; see updateLife.
const temperFor = (seed) => withSeed(`temper/${seed}`, () => ({ vigor: rand(0.8, 1.25), wander: Math.random() ** 1.5 }));

function initLife(c, { genome, gen = 0, scale = 1, age, alpha = 1, parents = null, inbred = 0 } = {}) {
  c.alpha = alpha;
  if (NO_LIFE.has(c.species)) return c;
  if (!genome) genome = c.seed != null ? genomeFor(c.seed) : { ...makeGenome(), ...makeGenome2(), ...makeGenome3() };
  fillGenome(genome);
  const [a, b] = lifeRange(c.species);
  const lifespan = c.seed != null ? lifespanFor(c.species, c.seed) : rand(a, b);
  const temper = c.seed != null ? temperFor(c.seed) : { vigor: rand(0.8, 1.25), wander: Math.random() ** 1.5 };
  c.life = {
    genome, gen, lifespan, scale, name: c.seed != null ? nameFor(c.seed) : personName(),
    age: age ?? rand(0.05, 0.5) * lifespan,
    energy: rand(0.6, 0.9), cooldown: rand(40, 100), parents, ...temper, comfort: 0.5, fed: 0, inbred, corruption: 0,
  };
  dyeCreature(c, genome);
  if (SCALABLE.has(c.species)) { captureBase(c); applyScale(c, scale * genome.size); }
  if (c.species === 'starfish') c.len *= genome.size;
  c.life.traits = traitsOf(genome);
  if (c.life.traits.length) ECO.rares++;
  refreshBuffs(c);
  const sp = genome.speed * c.life.buffs.speed;
  if (c.cruise) c.cruise *= sp;
  if (c.maxSpeed) c.maxSpeed *= sp;
  return c;
}

function eat(world, c, f) {
  let gain;
  if (f instanceof Creature) {
    f.caught = true;
    noteGone(world, f, 'eaten');
    addHeat(world, f.x, f.y, 0.5);
    if (typeof addBlood === 'function') addBlood(world, f.x, f.y, f.z || 6, f.body ? clamp(Math.max(...f.body.w) / 4, 0.3, 1.2) : 0.5);
    // A meal the size of the prey; afterwards the hunter is sated for a while (longer after a big one).
    const ratio = c.body && f.body ? clamp(Math.max(...f.body.w) / Math.max(0.5, ...c.body.w), 0.15, 1.2) : 0.5;
    gain = clamp(0.2 + 0.55 * ratio, 0.2, 0.8);
    if (c.life) { c.life.satedUntil = world.t + (18 + 70 * ratio) * (c.life.genome.ravenous ? 0.4 : 1); c.prey = null; }
    ECO.eaten++;
    if (c.life && c.life.wanderer) c.life.wanderer.kills++;
    if (typeof paraEaten === 'function') paraEaten(world, c, f);
    if (typeof afterCatch === 'function') afterCatch(world, c, f); // (scraps, and a cull's bounty)
    addBubbles(world, f.x, f.y, f.z, 3);
    if (typeof onKill === 'function') onKill(world, c, f); // a hunter's devour and contagion
    if (f.life) {
      logEvent(world, `${who(c)} caught ${who(f)}`, c, {
        cat: 'hunt', key: `catch:${c.id}`, data: describe(f).label,
        merge: (e) => `${who(c)} caught ${tally(e.data)}`,
      });
    }
  } else {
    f.eaten = true;
    gain = FOOD_GAIN[f.kind] ?? 0.3;
    // An offering: the marked grow on it, and the pond yields corruption.
    if (f.kind === 'offering' && c.life && c.life.genome.eld) {
      c.life.corruption = Math.min(1, (c.life.corruption || 0) + 0.06);
      if (typeof gainCorruption === 'function') gainCorruption(world, 0.5, null, { quiet: true });
    }
  }
  if (c.life) {
    const L = c.life;
    L.energy = Math.min(1, L.energy + gain);
    // A good meal keeps an animal well fed for a while: it ages slower, stays put
    // and is readier to breed. Brine shrimp brings animals into breeding condition.
    L.fed = Math.max(L.fed || 0, FOOD_FED[f.kind] || (f instanceof Creature ? 60 : 0));
    if (CONDITIONING.has(f.kind)) L.cooldown = Math.min(L.cooldown, 5);
  }
  if ((f.z ?? 0) > 32) addRipple(world, f.x, f.y, 0.6);
}

const FOOD_GAIN = { plankton: 0.1, pellet: 0.3, spawn: 0.3, brine: 0.5, spirulina: 0.35, krill: 0.5, bloodworm: 0.5, snow: 0.25 };
const FOOD_FED = { pellet: 45, spawn: 45, brine: 90, spirulina: 240, krill: 120, bloodworm: 120, snow: 200 };
const CONDITIONING = new Set(['brine', 'krill', 'bloodworm']); // foods that bring animals into breeding condition

// Who's near: a coarse grid of the animals, built at most once per frame when asked, so the
// once-a-second jobs (the marked, quirks and ills) don't compare every animal with every other.
const NEAR_CELL = 48;
function nearGrid(world) {
  const G = world.nearGrid;
  if (G && G.t === world.t && G.n === world.creatures.length) return G;
  const cols = Math.ceil(world.W / NEAR_CELL) + 2, cells = new Map();
  for (const c of world.creatures) {
    if (c.gone) continue;
    const k = ((Math.max(0, c.x) / NEAR_CELL) | 0) + ((Math.max(0, c.y) / NEAR_CELL) | 0) * cols;
    let a = cells.get(k);
    if (!a) cells.set(k, (a = []));
    a.push(c);
  }
  return (world.nearGrid = { t: world.t, n: world.creatures.length, cols, cells });
}
// How many animals share the grid cell at (x, y): a rough, instant measure of crowding.
function crowdAt(world, x, y) {
  const G = nearGrid(world), a = G.cells.get(((Math.max(0, x) / NEAR_CELL) | 0) + ((Math.max(0, y) / NEAR_CELL) | 0) * G.cols);
  return a ? a.length : 0;
}
// Call fn(o, d2) for every animal within r of (x, y).
function forNear(world, x, y, r, fn) {
  const G = nearGrid(world), r2 = r * r;
  const i0 = Math.max(0, ((x - r) / NEAR_CELL) | 0), i1 = Math.max(0, ((x + r) / NEAR_CELL) | 0);
  const j0 = Math.max(0, ((y - r) / NEAR_CELL) | 0), j1 = Math.max(0, ((y + r) / NEAR_CELL) | 0);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const a = G.cells.get(i + j * G.cols);
      if (!a) continue;
      for (const o of a) { const d2 = (o.x - x) ** 2 + (o.y - y) ** 2; if (d2 <= r2) fn(o, d2); }
    }
  }
}

// How hungry: 0 full, 1 starving.
const hungerOf = (c) => (c.life ? clamp(1 - c.life.energy, 0, 1) : 0);
// Starving, a hunter takes what it would usually leave: anything well smaller than itself that
// isn't one of the big ones, even its own kind's young (though not its own grown kin).
function desperateFor(p, q) {
  if (q === p || !q.life || !p.body || !q.body || DEEP_PREDATORS.has(q.species) || (DEEP[q.species] && DEEP[q.species].mythic)) return false;
  if (q.species === p.species && q.life.scale >= 0.7) return false;
  return Math.max(...q.body.w) < Math.max(...p.body.w) * 0.6;
}
const isPredator = (c) => c.species === 'eel' || c.species === 'snake' || c.species === 'octopus' || (!!c.sp && c.sp.predator) ||
  (typeof DEEP_PREDATORS !== 'undefined' && DEEP_PREDATORS.has(c.species)) ||
  (!!c.life && c instanceof Fish && (!!c.life.hunter || !!c.life.genome.cannibal || !!(c.life.quirks && c.life.quirks.includes('hungering')))); // woken, cursed or changed
const isPrey = (c) => c.species === 'tetra' || c.species === 'shrimp' || c.species === 'tadpole' || c.species === 'cavefish' ||
  (!!c.sp && c.sp.small) || (c.life && c.life.scale < 0.55); // (wild and designed fish alike)

// ---- effects: ripples and bubbles --------------------------------------------

const FX_ID = 2, BUBBLE_ID = 3, PLANKTON_ID = 4;
const FADE = new Uint8Array(65536); // ids drawn dithered this frame: no outlines around them
FADE[FX_ID] = FADE[BUBBLE_ID] = FADE[PLANKTON_ID] = 1;
const RIPPLE_MAT = mat('#9cc8d0', '#bfe0e6', '#dff2f4', '#ffffff');
const BUBBLE_MAT = mat('#a8d4e0', '#cfeaf0', '#eefafc', '#ffffff');
const PLANKTON_MAT = solid('#b8e07a');

const BLOOD_RIPPLE = mat('#4a0606', '#7a0a0a', '#a81414', '#d83a3a');
class Ripple {
  constructor(x, y, size, m = null) {
    this.x = x; this.y = y; this.r = 0.6; this.m = m || RIPPLE_MAT;
    this.max = 3 + size * 5; this.speed = 5 + size * 4;
  }

  update(dt) { this.r += dt * this.speed; return this.r < this.max; }

  draw(r) {
    const inner = Math.max(0, (this.r - 1.1) / this.r), i2 = inner * inner;
    r.alpha = 1 - this.r / this.max;
    const m = this.m;
    r.ellipsoid(this.x, this.y, this.r, this.r * 0.92, 0, 44.7, 0.1, (lx, ly) => (lx * lx + ly * ly > i2 ? m : null), FX_ID);
  }
}

class Bubble {
  constructor(x, y, z, audible = false) {
    this.x = x; this.y = y; this.z = z; this.audible = audible;
    this.r = rand(0.6, 1.4); this.vz = rand(6, 10); this.ph = rand(0, TAU);
  }

  update(dt, world) {
    this.z += this.vz * dt;
    this.x += (Math.sin(this.z * 0.5 + this.ph) * 1.5 + world.current.x * 2) * dt;
    this.y += world.current.y * 2 * dt;
    if (this.z < 44) return true;
    addRipple(world, this.x, this.y, 0.3, true);
    if (this.audible && typeof Sound !== 'undefined') Sound.bubble(this.x, this.y); // (only a burst is heard; a lone bubble surfaces silently)
    return false;
  }

  draw(r) {
    r.alpha = 1;
    if (this.r < 1) { r.dot(this.x, this.y, this.z, BUBBLE_MAT, BUBBLE_ID); return; }
    r.ellipsoid(this.x, this.y, this.r, this.r, 0, this.z, this.r,
      (lx, ly) => (lx * lx + ly * ly > 0.45 || (lx < -0.1 && ly < -0.1) ? BUBBLE_MAT : null), BUBBLE_ID);
  }
}

// A little four-point twinkle that marks shiny animals.
const SPARKLE = solid('#fff6c8');
class Sparkle {
  constructor(x, y, z) { this.x = x; this.y = y; this.z = z; this.t = 0; }
  update(dt) { this.t += dt; return this.t < 0.6; }
  draw(r) {
    const k = Math.sin(this.t / 0.6 * PI), arm = Math.round(k * 2);
    r.alpha = 1;
    r.dot(this.x, this.y, this.z, SPARKLE, FX_ID);
    for (let i = 1; i <= arm; i++) {
      r.dot(this.x + i, this.y, this.z, SPARKLE, FX_ID); r.dot(this.x - i, this.y, this.z, SPARKLE, FX_ID);
      r.dot(this.x, this.y + i, this.z, SPARKLE, FX_ID); r.dot(this.x, this.y - i, this.z, SPARKLE, FX_ID);
    }
  }
}

function addRipple(world, x, y, size = 1, silent = false, m = null) {
  if (world.shore && isDry(world, x, y)) return;
  if (world.effects.length < 220) world.effects.push(new Ripple(x, y, size, m));
  if (!silent && typeof Sound !== 'undefined') Sound.plop(x, y, size);
}

// A burst of three or more is heard as it surfaces (one of them, rationed); the steady trickle
// (a fish breathing, a wake, an aerator, a vent) is only seen. (A trickle heard every time made a
// constant bubbling nobody could place.)
function addBubbles(world, x, y, z, n) {
  for (let i = 0; i < n && world.effects.length < 220; i++) world.effects.push(new Bubble(x + rand(-1, 1), y + rand(-1, 1), z + rand(0, 2), n >= 3 && i === 0));
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
    const babies = [];
    const risk = Math.min(0.6, aggressionAt(world, this.x, this.y) * 0.5); // eggs get eaten in hostile water
    for (const cell of this.cells) {
      if (Math.random() < risk) continue;
      const baby = makeBaby(world, this.parent, this.mate, this.x + cell.ox, this.y + cell.oy);
      if (baby) { world.creatures.push(baby); ECO.births++; babies.push(baby); noteBorn(world, baby, 'born'); }
    }
    if (babies.length) {
      const first = babies[0], n = babies.length, label = describe(first).label, gen = first.life.gen;
      const young = first.species === 'tadpole' ? `${n} tadpole${n > 1 ? 's' : ''}` : `${n} young ${plural(label, n)}`;
      logEvent(world, `${this.parent.life.name} & ${this.mate.life.name}'s eggs hatched: ${young} (gen ${gen})`, first, {
        cat: 'life', key: `hatch:${this.key}`, data: { n, gen },
        merge: (e) => {
          const total = e.data.reduce((a, d) => a + d.n, 0), top = Math.max(...e.data.map((d) => d.gen));
          return `${e.n} clutches of ${plural(label, 2)} hatched: ${total} young, up to gen ${top}`;
        },
      });
      const record = world.records || (world.records = { gen: 2 });
      if (gen > record.gen) {
        record.gen = gen;
        const pts = award(world, 5 * gen, 'record', first);
        if (typeof deepenBy === 'function') deepenBy(world, 0.1);
        logEvent(world, `A new record: ${label} lineage reaches generation ${gen}${pts ? ` · +${pts}` : ''}`, first, { cat: 'rare' });
      }
      scoreBirths(world, babies);
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

const breedKey = (c) => (c.species === 'wild' ? `wild:${c.sp.id}` : c.species === 'tadpole' ? 'frog' : c.species);

function makeBaby(world, p, m, x, y) {
  let c;
  switch (p.species) {
    // Koi usually inherit a parent's pattern; now and then a new one appears.
    case 'koi': c = makeCreature('koi', world, x, y, Math.random() < 0.85 ? { variety: Math.random() < 0.5 ? p.variety : m.variety } : {}); break;
    case 'tetra': c = makeCreature('tetra', world, x, y, { school: p.school }); break;
    case 'wild': c = makeCreature('wild', world, x, y, { sp: p.sp, school: p.school }); break;
    case 'clown': case 'shrimp': case 'snail': case 'axolotl': case 'catfish': case 'shark': case 'sandshark': c = makeCreature(p.species, world, x, y); break;
    case 'cavefish': c = makeCreature('cavefish', world, x, y, { school: p.school }); break;
    case 'frog': c = makeCreature('tadpole', world, x, y); break;
    case 'snailfish': c = makeCreature('snailfish', world, x, y, { school: p.school }); break;
    default:
      // The designed (bestiary.js): one of their own kind, in their parent's school.
      if (typeof DESIGNS !== 'undefined' && DESIGNS[p.species]) { c = makeCreature(p.species, world, x, y, p.school ? { school: p.school } : {}); break; }
      // Those that breed only at a habitat (see habitats.js): one of their own kind.
      if (BREED[p.species] && BREED[p.species].needs && CREATE[p.species]) { c = makeCreature(p.species, world, x, y); break; }
      return null;
  }
  const g = childGenomeFor(c.seed, p.life.genome, m.life.genome);
  if (typeof curseAtBirth === 'function') curseAtBirth(world, g); // a pond pushed too fast breeds wrongness
  if (typeof cometGift === 'function') cometGift(world, g); // born under a comet
  if (typeof habitatNudge === 'function') habitatNudge(world, x, y, p.species, g); // what stands around its birthplace
  if (!g.eld && typeof eldBirthChance === 'function' && Math.random() < eldBirthChance(world, x, y)) g.eld = true;
  // The Deep Dream: the mark passes more readily to young.
  if (!g.eld && (p.life.genome.eld || m.life.genome.eld) && typeof eldPath === 'function' && eldPath(world, 'dream') && Math.random() < 0.12) g.eld = true;
  return initLife(c, {
    genome: g, parents: [p.seed, m.seed],
    gen: Math.max(p.life.gen, m.life.gen) + 1, scale: 0.35, age: 0, alpha: 0, inbred: inbreedingOf(world, p.seed, m.seed),
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

CREATE.tadpole = (w, x, y) => new Tadpole(w, x, y);

// A froglet climbs out of the tadpole once it is big enough.
function metamorphose(world, t) {
  const f = makeCreature('frog', world, t.x, t.y);
  f.pad = null; f.targetPad = null; f.state = 'swim';
  f.x = t.x; f.y = t.y; f.heading = t.heading;
  f.body.place(f.x, f.y, f.heading);
  initLife(f, { genome: t.life.genome, gen: t.life.gen, scale: 0.6, age: 0, alpha: 0.2, parents: t.life.parents, inbred: t.life.inbred });
  f.life.name = t.life.name;
  rekeyLineage(world, t, f);
  t.gone = true;
  addBubbles(world, t.x, t.y, t.z, 3);
  world.creatures.push(f);
  logEvent(world, `${f.life.name} the tadpole grew legs and became a froglet`, f, {
    cat: 'life', key: 'froglet', merge: (e) => `${e.n} tadpoles grew legs and became froglets`,
  });
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
    if (w.target === 0) {
      w.target = rand(0.45, 1); w.next = rand(20, 50);
      // Rain that falls red: when the stars are right, under a blood moon, or on a pond steeped in corruption.
      const dark = 1 - 1 / (1 + ((world.game && world.game.corruptionEarned) || 0) / 600);
      w.blood = typeof heavenNow === 'function' && (!!heavenNow(world, 'stars') || (!!heavenNow(world, 'bloodmoon') && Math.random() < 0.5) || Math.random() < 0.12 * dark);
      logEvent(world, w.blood ? '✦ The clouds are the wrong colour. It is raining blood' : w.target > 0.8 ? 'Dark clouds roll in: a downpour' : 'Clouds roll in and it starts to rain', null, { cat: 'sky', pri: w.blood ? 3 : 1 });
      if (w.blood && typeof narrate === 'function') narrate(world, 'bloodrain');
    } else { w.target = 0; w.next = rand(150, 420); w.blood = false; logEvent(world, 'The rain eases off', null, { cat: 'sky' }); } // (clear spells run long)
  }
  if (typeof metaWeather === 'function') metaWeather(world, w); // the storm glass
  w.rain += (w.target - w.rain) * Math.min(1, dt * 0.12);
  w.gust = world.opts.weather === false ? 0 : (vnoise(world.t * 0.15, 3, 77) - 0.5) * 2;
  if (typeof metaNow === 'function' && metaNow(world, 'weather') === 'storm') w.gust = Math.max(w.gust, 0.6 + 0.4 * Math.sin(world.t * 0.7));
  // Raindrops land as small ripples all over the surface.
  let drops = w.rain * world.W * world.H / 1800 * dt;
  while (Math.random() < drops) { addRipple(world, rand(0, world.W), rand(0, world.H), rand(0.2, 0.6), true, w.blood ? BLOOD_RIPPLE : null); drops -= 1; }
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
    if (c.absorbing) { absorbStep(world, c, dt); continue; }
    if (c.dying) { dieStep(world, c, dt); continue; }
    if (c.unsettled) { // a bought spawn that didn't take: it shows faintly, then is gone
      c.unsettled -= dt;
      c.alpha = clamp(c.unsettled / 2, 0, 0.6);
      if (c.unsettled <= 0) { c.gone = true; noteGone(world, c, "didn't settle"); }
      continue;
    }
    // Fade in on arrival; fade out once a leaving animal reaches the edge.
    if (c.leaving && !c.grabbed && c.species !== 'firefly') {
      steerOut(c, world);
      if (Math.min(c.x, W - c.x, c.y, H - c.y) < 10) {
        c.alpha -= dt * 0.8;
        if (c.alpha <= 0) {
          c.gone = true;
          ECO.departures++;
          noteGone(world, c, c.leaveWhy || 'restless');
          if (c.leaveWhy !== 'of old age' && c.life && typeof sendWanderer === 'function') sendWanderer(world, c); // (the fierce may turn up in someone else's pond)
          if (c.leaveWhy === 'of old age' && c.life) {
            award(world, 1, 'full lives', c, { quiet: true });
            gainEssence(world, 1 + TIER_ESSENCE[tierOf(c.life.traits)] / 2, 'returned to the pond', c, { quiet: true });
          }
          if (c.life && c.species !== 'tadpole') {
            const m = Math.floor(c.life.age / 60), label = describe(c).label;
            const why = c.leaveWhy || 'restless';
            logEvent(world, `${who(c)} moved on${why === 'hungry' ? ' in search of food' : m ? ` after ${m} minutes` : ''}`, null, {
              cat: 'come', key: `leave:${c.species === 'wild' ? c.sp.id : c.species}`, data: why,
              merge: (e) => {
                const why = new Map();
                for (const d of e.data) why.set(d, (why.get(d) || 0) + 1);
                return `${e.n} ${plural(label, e.n)} moved on (${[...why].map(([k, n]) => `${n} ${k}`).join(', ')})`;
              },
            });
          }
        }
      }
    } else if (c.alpha < 1 && !(c.swarm && c.swarm.dying)) {
      c.alpha = Math.min(1, c.alpha + dt * 0.8);
    }

    // Wakes, splashes and the odd bubble.
    if (c.species === 'duck' && c.speed > 1.5) {
      c.wakeT = (c.wakeT || 0) - dt;
      if (c.wakeT <= 0) { const b = c.body, n = b.n - 1; addRipple(world, b.x[n], b.y[n], 0.35 * c.k, true); c.wakeT = 0.35; } // (a wake is seen, not heard)
    }
    if (c.species === 'frog') {
      if (c.state !== c.lastState && (c.state === 'hop' || c.lastState === 'hop')) addRipple(world, c.x, c.y, 1);
      c.lastState = c.state;
    }
    if (c.species === 'octopus' && c.jet > 1.1 && !c.puffed) { addBubbles(world, c.x, c.y, c.z, 5); c.puffed = true; }
    if (c.species === 'octopus' && c.jet <= 0) c.puffed = false;
    if (c instanceof Fish && c.z < 40 && Math.random() < dt * 0.04) addBubbles(world, c.body.x[0], c.body.y[0], c.z + 1, 1);
    if (c.life && c.life.genome.shiny && (c.alpha ?? 1) > 0.5) {
      c.sparkT = (c.sparkT || 0) - dt;
      if (c.sparkT <= 0 && world.effects.length < 220) {
        const b = c.body, i = randi(0, b.n - 1);
        world.effects.push(new Sparkle(b.x[i] + rand(-3, 3), b.y[i] + rand(-3, 3), (c.z || 0) + 6));
        c.sparkT = rand(0.5, 1.3);
      }
    }

    const L = c.life;
    if (!L || !on) continue;
    // Hardy animals age slower, and so do comfortable, well-fed ones.
    L.age += dt * ageRate(L);
    if (L.fed > 0) L.fed = Math.max(0, L.fed - dt);
    if (EATS.has(c.species)) L.energy = Math.max(0, L.energy - dt / (METABOLISM[c.species] || (c.body.w[0] > 2.5 ? 420 : 260)) / L.buffs.vitality * (L.buffs.appetite || 1));
    L.cooldown -= dt;
    if (L.scale < 1) {
      L.scale = Math.min(1, L.scale + dt * (L.energy > 0.3 ? 0.008 : 0.003) * (L.genome.stunted ? 0.5 : 1));
      if (c.base && Math.abs(L.scale * L.genome.size - c.appliedScale) > 0.02) applyScale(c, L.scale * L.genome.size);
      if (L.scale >= 1 && L.gen > 0 && c.species !== 'tadpole') {
        const label = describe(c).label;
        logEvent(world, `${who(c)} is fully grown`, c, { cat: 'life', pri: 0, key: `grown:${c.species}`, merge: (e) => `${e.n} young ${plural(label, e.n)} grew up` });
      }
    }
    if (!L.old && L.age > L.lifespan * 0.8) {
      L.old = true;
      const label = describe(c).label;
      logEvent(world, `${who(c)} is getting old: ${Math.floor(L.age / 60)} minutes in the pond`, c, {
        cat: 'life', pri: 0, key: `old:${c.species}`, merge: (e) => `${e.n} ${plural(label, e.n)} are getting on in years`,
      });
    }
    if (c.species === 'tadpole' && L.age > 50 && L.scale > 0.65) metamorphose(world, c);
    if (!c.leaving && !c.dying && !c.grabbed && (L.age > L.lifespan || L.energy <= 0)) {
      c.dying = { t: 0, why: L.energy <= 0 ? 'of hunger' : 'of old age' };
    }
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
    const d = [c.x, W - c.x, c.y, H - c.y];
    if (world.shore && !AMPHIBIOUS.has(c.species)) d[world.shoreSide] = Infinity; // not across the beach
    const i = d.indexOf(Math.min(...d));
    c.exit = [[2, c.y], [W - 2, c.y], [c.x, 2], [c.x, H - 2]][i];
  }
  [c.tx, c.ty] = c.exit;
  c.timer = 5;
  c.prey = null;
  if ('mode' in c) c.mode = c.species === 'dragonfly' ? 'dart' : 'walk';
  if (c.species === 'frog' && c.state === 'sit') { c.state = 'swim'; c.pad = null; }
  if (c.species === 'frog') c.targetPad = null;
}

// (Hunters look only at what's near them, through the neighbour grid: a marked horde enraged at
// night is hundreds of hunters at once.)
let huntStamp = 0;
function assignHunts(world) {
  const preds = [], prey = [], stamp = ++huntStamp;
  if (typeof widthStamp !== 'undefined') widthStamp++;
  for (const c of world.creatures) {
    if (c.grabbed || c.leaving || c.gone || c.caught) continue;
    if (isPredator(c) || (typeof enraged === 'function' && enraged(world, c))) { preds.push(c); c.predT = stamp; }
    else if (isPrey(c)) { prey.push(c); c.preyT = stamp; }
  }
  const night = world.darkness > 0.5;
  for (const p of preds) {
    const P = geneBuffs(p);
    // Hunger drives the hunt. Just fed, a predator is sated and lets prey be (longer after a
    // bigger meal). Past its threshold (aggressive ones sooner) it hunts, and the hungrier it
    // is the further it looks and the longer it keeps after one quarry; starving, it will take
    // bigger prey than usual, even its own kind's young.
    const h = p.life ? hungerOf(p) : 0;
    // (Rage: the dark, the sky and corruption make a hunter hungrier for it; the enraged hunt whatever their hunger.)
    const rage = typeof rageOf === 'function' ? rageOf(world, p) : 1, mad = typeof enraged === 'function' && enraged(world, p);
    if (!p.life || p.life.satedUntil > world.t || (!mad && p.life.energy > huntThreshold(p, Math.min(0.92, 0.6 * P.aggression * rage * (0.4 + 0.6 * activity(world, p)))))) { p.prey = null; continue; }
    const cur = p.prey;
    if (cur && !cur.caught && !cur.gone && Math.hypot(cur.x - p.x, cur.y - p.y) < 60 + 110 * h) continue;
    // (The merely enraged look again every fourth pass, each on its own beat.)
    if (mad && !isPredator(p) && (p.id + stamp) % 4) { if (cur && (cur.caught || cur.gone)) p.prey = null; continue; }
    let best = null, bd = Infinity;
    const starving = h > 0.75;
    const R = 60 * P.intellect * huntRange(p) * (0.55 + 1.1 * Math.max(h, mad ? 0.6 : 0)), extra = mad || starving || !!p.life.hunter || huntLv(p, 'maw') > 0 || !!p.life.genome.cannibal;
    forNear(world, p.x, p.y, R * 1.5, (q, d0) => {
      // (A culled kind looks nearer than it is; a protected one, or one in a refuge, isn't there at all: interact.js.)
      const d = typeof huntWeight === 'function' ? d0 / huntWeight(world, q) : d0;
      if (q === p || d >= bd || Math.abs(q.z - p.z) > 14) return;
      if (typeof huntable === 'function' && q.preyT === stamp && !huntable(world, q)) return;
      if (q.preyT !== stamp) { if (!extra || !q.life || q.grabbed || q.leaving || q.gone || q.caught || q.dying || !(huntExtra(p, q) || (starving && desperateFor(p, q)) || (mad && rageTarget(p, q)))) return; }
      else if (extra && q.dying) return;
      const Q = geneBuffs(q);
      // Ghostly prey is hard to see; glowing prey stands out at night.
      // (The Veil of Stars: hunters look straight through the marked.)
      const veil = q.life && q.life.genome.eld && typeof eldPath === 'function' && eldPath(world, 'veil') ? 0.35 : 0;
      const seen = R * (1 - Math.min(1, Q.stealth + veil) * 0.7 * huntSees(p)) * (night && Q.light > 0 ? 1.5 : 1);
      if (d0 < seen * seen) { bd = d; best = q; }
    });
    p.prey = best;
  }
  for (const q of prey) {
    q.threat = null;
    const r = 26 * geneBuffs(q).intellect;
    let bd = r * r;
    forNear(world, q.x, q.y, r, (p, d) => { if (p.predT === stamp && p.prey && d < bd && Math.abs(q.z - p.z) <= 14) { bd = d; q.threat = p; } });
  }
}

function breed(world) {
  if (world.creatures.length > (world.maxPop || 130)) return; // the pond is full
  const counts = {};
  for (const c of world.creatures) if (!c.leaving) counts[breedKey(c)] = (counts[breedKey(c)] || 0) + 1;
  for (const e of world.eggs) counts[e.key] = (counts[e.key] || 0) + e.cells.length;
  const ready = (c) => c.life && BREED[c.species] && !c.leaving && !c.grabbed && c.life.scale >= 0.95 && (typeof canBreedHere !== 'function' || canBreedHere(world, c)) &&
    c.life.age > matureAt(c.life) && c.life.energy > 0.65 && c.life.cooldown <= 0 && aggressionAt(world, c.x, c.y) < 0.75;
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
    // Fertile parents lay more; tense water fewer.
    const fert = (geneBuffs(c).fertility + geneBuffs(mate).fertility) / 2 * (1 - 0.4 * Math.min(1, aggressionAt(world, x, y))) * auraAt(world, x, y).fertility *
      (typeof habitatFert === 'function' ? habitatFert(world, c) : 1); // at a breeding habitat for its kind
    const n = clamp(Math.round(eggs.cells.length * fert), 1, 12);
    while (eggs.cells.length > n) eggs.cells.pop();
    while (eggs.cells.length < n) eggs.cells.push({ ox: rand(-2.2, 2.2), oy: rand(-2.2, 2.2), p: rand(0, TAU) });
    world.eggs.push(eggs);
    const where = rule.eggs === 'surface' ? 'at the surface' : rule.eggs === 'rock' ? 'on a rock'
      : rule.eggs === 'plant' && z > 1 ? 'in the weeds' : 'on the floor', label = describe(c).label;
    logEvent(world, `${c.life.name} & ${mate.life.name} laid ${eggs.cells.length} eggs ${where}`, c, {
      cat: 'life', pri: 0, key: `eggs:${key}`, data: eggs.cells.length,
      merge: (e) => `${e.n} pairs of ${plural(label, 2)} laid ${e.data.reduce((a, b) => a + b, 0)} eggs`,
    });
    counts[key] = (counts[key] || 0) + eggs.cells.length;
    for (const p of [c, mate]) { p.life.cooldown = Math.max(40, p.life.lifespan * 0.1 * rand(0.8, 1.2) / geneBuffs(p).fertility); p.life.energy -= 0.3; }
  }
}

function growPlankton(world) {
  const want = Math.round(world.W * world.H / 1600 * (1 - 0.4 * world.darkness));
  let have = 0;
  for (const f of world.food) if (f.kind === 'plankton') have++;
  const lights = world.darkness > 0.5 ? world.creatures.filter((c) => geneBuffs(c).light > 0.3) : [];
  for (let i = 0; i < 3 && have < want; i++, have++) {
    const src = lights.length && Math.random() < 0.3 ? pick(lights) : Math.random() < 0.7 && pick(world.plants);
    const x = src ? src.x + rand(-6, 6) : rand(5, world.W - 5), y = src ? src.y + rand(-6, 6) : rand(5, world.H - 5);
    world.food.push(new Food(x, y, rand(4, 30), 'plankton'));
  }
}

// Keep each species near the population the pond was set up with, by letting
// newcomers swim in from the edges. Now and then a new wild species turns up.
function migrate(world) {
  const pop = {};
  for (const c of world.creatures) if (!c.leaving) pop[c.species] = (pop[c.species] || 0) + 1;
  const calm = 1 - Math.min(0.7, world.zones ? world.zones.avg : 0);
  for (const [kind, target] of Object.entries(world.targets)) {
    const n = pop[kind] || 0;
    // Groups arrive together, so wait until a group's worth is missing. Hostile ponds draw fewer.
    if (n < target && (!GROUPS.has(kind) || n <= target * 0.6) && Math.random() < 0.5 * calm) arrive(world, kind);
  }
  // Animals leave when restless and ill at ease, when the water around them turns
  // hostile, or when they're stuck in the wrong water; care and good genes hold them.
  for (const c of world.creatures) {
    const L = c.life;
    if (!L || c.leaving || c.grabbed || L.scale < 0.9 || c.species === 'tadpole') continue;
    const a = aggressionAt(world, c.x, c.y), mm = mismatch(world, c);
    if (Math.random() < leaveChance(L, a, mm)) {
      c.leaving = true;
      c.leaveWhy = a > 0.7 ? 'fled the danger' : mm > 0.5 ? 'in the wrong water' : 'restless';
    }
  }
  if (typeof succession === 'function') succession();
  // Deep water draws its own visitors, once erosion has opened it.
  // (What's been built in the deep draws its life up more often.)
  const deepLure = (world.structures || []).reduce((a, s) => a + (STRUCTURES[s.kind].deepLure || 0), 0); // lure lanterns
  const eye = typeof hasArtifact === 'function' && hasArtifact(world, 'deepeye') ? 2 : 1; // the eye of the deep
  if (world.erosion && world.erosion.tier >= 1 && Math.random() < 0.02 * (1 + 0.4 * (world.deepPlaced || 0)) * (1 + deepLure) * eye && typeof arriveDeep === 'function') arriveDeep(world);
  const activeWild = new Set(world.creatures.filter((c) => c.species === 'wild').map((c) => c.sp)).size;
  const young = world.succession && typeof SUCCESSION === 'object' && (world.maturity ?? 0) < SUCCESSION.wild; // a new pond isn't ready for them yet
  if (activeWild < 4 && !young && Math.random() < 0.025 && (typeof canDiscover !== 'function' || canDiscover(world, 'wild'))) {
    const g = arrive(world, 'wild', true);
    if (g && typeof knows === 'function' && !knows(world, 'wild')) discover(world, 'wild', g[0]);
  }
}

function arrive(world, kind, discover = false) {
  const { W, H } = world;
  // Newcomers come in by the calmest edge (of two tried).
  const edge = (s) => aggressionAt(world, s === 0 ? 8 : s === 1 ? W - 8 : W / 2, s === 2 ? 8 : s === 3 ? H - 8 : H / 2);
  const sides = [0, 1, 2, 3].filter((s) => !(world.shore && s === world.shoreSide && !AMPHIBIOUS.has(kind)));
  const s1 = pick(sides), s2 = pick(sides), side = edge(s1) <= edge(s2) ? s1 : s2;
  const x = side === 0 ? 4 : side === 1 ? W - 4 : rand(20, W - 20);
  const y = side === 2 ? 4 : side === 3 ? H - 4 : rand(20, H - 20);
  let group;
  if (discover) {
    const sp = genWildSpecies(wildHabitat(world));
    const school = sp.schooling ? { tx: x, ty: y, tz: (sp.zMin + sp.zMax) / 2, until: 0, wild: sp } : null;
    group = Array.from({ length: sp.schooling ? randi(5, 8) : randi(1, 2) }, () => makeCreature('wild', world, x + rand(-4, 4), y + rand(-4, 4), { sp, school }));
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
    noteBorn(world, c, 'arrived');
  }
  world.creatures.push(...group);
  ECO.arrivals += group.length;
  const c = group[0], label = describe(c).label;
  if (discover) {
    const sp = c.sp, habits = [sp.schooling && 'schools', sp.predator && 'hunts smaller fish', sp.habitat === 'salt' ? 'reef fish' : 'freshwater'].filter(Boolean);
    const pts = award(world, 10, 'new species', c);
    if (typeof deepenBy === 'function') deepenBy(world, 0.1);
    logEvent(world, `✦ New species spotted: ${sp.name}${group.length > 1 ? `, a school of ${group.length}` : ''} (${habits.join(', ')})${pts ? ` · +${pts}` : ''}`, c, { cat: 'rare' });
  } else if (kind === 'duck') {
    logEvent(world, `A duck family paddled in: ${group.length} ducks`, c, { cat: 'come', pri: 1 });
  } else {
    const first = group.length > 1 ? `${SCHOOLING(c) ? 'A school' : 'A group'} of ${group.length} ${plural(label, group.length)} arrived` : `${who(c)} ${ARRIVE_VERB[kind] || 'swam in'}`;
    logEvent(world, first, c, {
      cat: 'come', key: `arrive:${kind}`, data: group.length,
      merge: (e) => `${e.data.reduce((a, b) => a + b, 0)} ${plural(label, 2)} arrived`,
    });
  }
  for (const r of group) if (r.life && r.life.traits.length) scoreArrival(world, r);
  return group;
}

// ---- inspector ----------------------------------------------------------------

function describe(c) {
  const L = c.life;
  const label = c.species === 'wild' ? c.sp.name : c.species === 'duck' ? { hen: 'Duck (hen)', drake: 'Duck (drake)', baby: 'Duckling' }[c.kind] : SINGULAR[c.species] || c.species;
  let mood = 'content';
  if (c.grabbed) mood = 'being held';
  else if (c.leaving) mood = 'moving on';
  else if (c.prey) mood = L && L.energy < 0.25 ? 'starving, hunting' : 'hunting';
  else if (c.threat) mood = 'fleeing';
  else if (L && L.satedUntil && typeof world !== 'undefined' && L.satedUntil > world.t && isPredator(c)) mood = 'sated after a kill';
  if (typeof world !== 'undefined' && typeof enraged === 'function' && enraged(world, c) && !c.grabbed) mood = c.prey ? 'in a rage, hunting' : 'in a rage';
  if (L && L.wanderer && !c.grabbed && !c.leaving) mood = `come over from ${L.wanderer.from} to terrorize the pond${c.prey ? ', hunting' : ''}${L.wanderer.kills ? ` (${L.wanderer.kills} kills here)` : ''}`;
  else if (c.inflate > 0.3) mood = 'puffed up';
  else if (L && L.energy < 0.35) mood = 'hungry';
  else if (L && L.scale < 0.9) mood = 'growing';
  const stage = !L ? '' : L.scale < 0.6 ? 'young' : L.age > L.lifespan * 0.8 ? 'elder' : 'adult';
  const temper = !L ? [] : [L.vigor > 1.12 ? 'hardy' : L.vigor < 0.9 ? 'frail' : '', L.wander > 0.6 ? 'restless' : L.wander < 0.15 ? 'homebody' : ''].filter(Boolean);
  return {
    name: L ? L.name : '', label, stage, mood, gen: L ? L.gen : null, age: L ? L.age : null, energy: L ? L.energy : null,
    traits: L ? L.traits : [], carries: L ? carriesOf(L.genome) : [], tier: L ? tierOf(L.traits) : 0,
    comfort: L ? L.comfort : null, fed: L ? L.fed > 0 : false, temper,
    lifespan: L ? L.lifespan : null, buffs: L ? L.buffs : null, inbred: L ? L.inbred || 0 : 0,
  };
}
