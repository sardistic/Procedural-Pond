'use strict';
// More genetics, from a fifth gene stream (genome5/<seed>), so every animal
// born before keeps exactly the genes it had:
//  - Gifts, rare and good: iridescent (a sheen that cycles through every colour),
//    starry (flecks of light), vigorous, keen, swift, ancient (long-lived) and
//    titan (vast for its kind). Rarer than anything before; two gifted parents
//    pass a gift on often.
//  - Curses, the evil permutations: ravenous (burns through food and starves),
//    barren, frail, rotting (ages early), twitching (fits of wrong movement),
//    cannibal (hunts its own kind's young), feral (tempers flare around it),
//    sickly (often fails to settle; falls ill), stunted (grows slowly, lays
//    less), addled (its eggs often fail) and brittle (dies of unease). They
//    appear out of nowhere rarely, pass on like any gene, and come far oftener
//    when the pond is run fast or its days are short: time pushed too hard
//    breeds wrongness.
//  - Quality: every animal is graded from its genes (working genes above or below
//    the average, gifts up, curses down): Poor, Fair, Good, Fine, Superb or
//    Pristine. It shows on its card, raises its worth, and can be paid for when
//    spawning.
//  - Madness quirks: when one of the marked changes, sometimes something stays
//    with it: whispering, many-mouthed, weeping, phasing, hungering, dreaming or
//    hollow-eyed. Each does what it says (see QUIRKS).
//  - Infections: the rot (caught from carrion and fouled water, passed by touch
//    within a kind, ages its host fast; it may pass off at dawn) and the madness
//    (caught by being driven mad over and over, or from another mad animal at
//    night; its host twitches and snaps).

const GIFTS = {
  iridescent: { p: 1 / 1400, rarity: 3, color: '#f0a0ff', buffs: { luck: 0.3 }, note: 'a sheen that cycles through every colour' },
  starry: { p: 1 / 1200, rarity: 3, color: '#b0e0ff', buffs: { light: 0.35, luck: 0.15 }, note: 'flecks of light across its back' },
  vigorous: { p: 1 / 500, rarity: 2, color: '#8ae08a', buffs: { vitality: 0.3 }, note: 'hardy and slow to tire' },
  keen: { p: 1 / 600, rarity: 2, color: '#a8a0ff', buffs: { intellect: 0.35 }, note: 'sharp-sensed' },
  swift: { p: 1 / 600, rarity: 2, color: '#8ef0f0', buffs: { speed: 0.15 }, note: 'quick' },
  ancient: { p: 1 / 1000, rarity: 3, color: '#e0d0a0', buffs: { longevity: 0.4 }, note: 'lives on and on' },
  titan: { p: 1 / 2500, rarity: 5, color: '#ffa060', buffs: { calming: 0.2, longevity: 0.2, fertility: -0.3, speed: -0.15 }, note: 'vast for its kind' },
};
const CURSES = {
  ravenous: { color: '#a05a2a', buffs: { appetite: 0.8 }, note: 'always hungry: it burns through food and starves fast' },
  barren: { color: '#7a6a5a', buffs: { fertility: -0.8 }, note: 'lays few eggs, or none' },
  frail: { color: '#8a8a7a', buffs: { vitality: -0.35, longevity: -0.3 }, note: 'weak and short-lived' },
  rotting: { color: '#5a6a2a', buffs: { longevity: -0.45 }, note: 'ages before its time' },
  twitching: { color: '#9a7a9a', buffs: { intellect: -0.2 }, note: 'fits of wrong movement' },
  cannibal: { color: '#8a1a1a', buffs: { aggression: 0.5 }, note: 'hunts the young of its own kind' },
  feral: { color: '#c83a2a', buffs: { aggression: 0.6, territory: 0.3 }, note: 'tempers flare around it' },
  sickly: { color: '#6a7a4a', buffs: { vitality: -0.3 }, settle: 0.6, note: 'often fails to settle in, and falls ill easily' },
  stunted: { color: '#7a6a4a', buffs: { fertility: -0.25 }, growth: 0.5, note: 'grows slowly and stays small' },
  addled: { color: '#8a7a6a', buffs: { fertility: -0.4 }, note: 'its eggs often fail to hatch' },
  brittle: { color: '#9a8a8a', buffs: { resilience: -0.3 }, note: 'dies of unease' },
};
const QUIRKS = {
  whispering: { color: '#b08ae0', buffs: {}, note: 'those near it grow uneasy' },
  'many-mouthed': { color: '#c05a8a', buffs: { appetite: 0.5 }, note: 'always feeding: it takes in its own kind twice as often' },
  weeping: { color: '#6a8ac8', buffs: {}, note: 'it leaks the mark: anything that brushes it may wake touched' },
  phasing: { color: '#a0a0e0', buffs: { stealth: 0.4 }, note: 'it flickers in and out of the water' },
  hungering: { color: '#a02a4a', buffs: { aggression: 0.4 }, note: 'it hunts, whatever it was before' },
  dreaming: { color: '#7a5ae0', buffs: {}, note: 'it yields twice the corruption' },
  'hollow-eyed': { color: '#3a3a6a', buffs: { intellect: 0.3 }, note: 'it sees in the dark' },
};
const ILLS = {
  rot: { color: '#4a5a1a', buffs: { longevity: -0.4, vitality: -0.2 }, note: 'the rot: it ages fast, and passes to its kind by touch' },
  madness: { color: '#c04ac0', buffs: { aggression: 0.4, intellect: -0.2 }, note: 'the madness: it twitches and snaps, and it spreads at night' },
};
const GIFT_KEYS = Object.keys(GIFTS), CURSE_KEYS = Object.keys(CURSES), G5_KEYS = [...GIFT_KEYS, ...CURSE_KEYS];

// Registered with the older genetics: rarity (curses and ills count for nothing),
// outline colours, and what each does.
for (const [k, d] of Object.entries(GIFTS)) { TRAIT_RARITY[k] = d.rarity; RARE_OUTLINE[k] = hexToInt(d.color); TRAIT_BUFFS[k] = d.buffs; }
for (const [k, d] of Object.entries(CURSES)) { TRAIT_RARITY[k] = 0; RARE_OUTLINE[k] = hexToInt(d.color); TRAIT_BUFFS[k] = d.buffs; }
for (const [k, d] of Object.entries(QUIRKS)) { TRAIT_RARITY[k] = 3; RARE_OUTLINE[k] = hexToInt(d.color); TRAIT_BUFFS[k] = d.buffs; }
for (const [k, d] of Object.entries(ILLS)) { TRAIT_RARITY[k] = 0; RARE_OUTLINE[k] = hexToInt(d.color); TRAIT_BUFFS[k] = d.buffs; }
TRAIT_RARITY.awakened = 2; RARE_OUTLINE.awakened = hexToInt('#e04a3a'); TRAIT_BUFFS.awakened = { aggression: 0.3 };
MULT_BUFFS.add('appetite');
NO_BUFFS.appetite = 1;
const TRAIT_NOTES = { ...Object.fromEntries(Object.entries({ ...GIFTS, ...CURSES, ...QUIRKS, ...ILLS }).map(([k, d]) => [k, d.note])), awakened: 'woken to the hunt' };

// ---- the fifth gene stream ----------------------------------------------------------------------------
function makeGenome5() {
  const g = {};
  for (const [k, d] of Object.entries(GIFTS)) g[k] = Math.random() < d.p;
  for (const k of CURSE_KEYS) g[k] = Math.random() < 1 / 3000;
  if (g.titan) g.size = 1.5;
  return g;
}
function childGenome5(a, b, m = 1) {
  const g = {};
  for (const [k, d] of Object.entries(GIFTS)) { const n = (a[k] ? 1 : 0) + (b[k] ? 1 : 0); g[k] = Math.random() < (n === 2 ? 0.45 : n === 1 ? 0.15 : d.p * m * 0.6); }
  for (const k of CURSE_KEYS) { const n = (a[k] ? 1 : 0) + (b[k] ? 1 : 0); g[k] = Math.random() < (n === 2 ? 0.6 : n === 1 ? 0.3 : m / 3000); }
  if (g.titan) g.size = 1.5;
  return g;
}
const packG5 = (g) => G5_KEYS.reduce((a, k, i) => a + (g[k] ? 2 ** i : 0), 0);
function unpackG5(g, bits) { G5_KEYS.forEach((k, i) => { g[k] = Math.floor(bits / 2 ** i) % 2 === 1; }); return g; }

// How hard the pond is being pushed: sim speed over 1 and days shorter than 3 minutes.
const evilPressure = (world) => clamp((world.opts.speed - 1) * 0.8 + Math.max(0, 180 / world.opts.dayLength - 1) * 0.6, 0, 4);
// A birth under pressure may come out cursed (on top of what it inherits).
function curseAtBirth(world, g) {
  const p = 0.008 * evilPressure(world); // up to about 1 birth in 30 at full pressure
  if (p > 0 && Math.random() < p) g[pick(CURSE_KEYS)] = true;
}

// Visible gifts and curses, after the older traits.
function quirkTraits(g, t) {
  for (const k of GIFT_KEYS) if (g[k]) t.push(k);
  for (const k of CURSE_KEYS) if (g[k]) t.push(k);
}

// ---- quality -------------------------------------------------------------------------------------------
const GRADES = ['Poor', 'Fair', 'Good', 'Fine', 'Superb', 'Pristine'];
const GRADE_COLOR = ['#8a7a6a', '#b0b0a0', '#7ed07a', '#6fb7ef', '#c38bff', '#ffd166'];
const GRADE_PRICE = [1, 1, 1.6, 3.5, 9, 30]; // what a guaranteed grade costs, times the spawn's price
const GRADE_GENES = ['fert', 'lon', 'vit', 'iq', 'tol', 'res'];
function qualityOf(g) {
  let s = GRADE_GENES.reduce((a, k) => a + ((g[k] ?? 0.5) - 0.5), 0) / GRADE_GENES.length;
  for (const k of GIFT_KEYS) if (g[k]) s += 0.05;
  for (const k of CURSE_KEYS) if (g[k]) s -= 0.12;
  if (g.shiny || g.glow || g.ghost) s += 0.02;
  return s;
}
const gradeOf = (g) => { const s = qualityOf(g); return s < -0.065 ? 0 : s < -0.02 ? 1 : s < 0.045 ? 2 : s < 0.095 ? 3 : s < 0.14 ? 4 : 5; };
const gradeWorth = (g) => 0.7 + 0.12 * gradeOf(g); // Poor 0.7× … Pristine 1.3×

// A spawn that must meet a grade: its genes are rolled again (from its seed, so it's repeatable) until they do.
function meetGrade(c, min) {
  if (!c.life || min <= 0 || gradeOf(c.life.genome) >= min) return;
  for (let i = 1; i < 600; i++) {
    const g = genomeFor(hashString(`${c.seed}/grade/${i}`) & 0x1fffff);
    if (gradeOf(g) >= min) { initLife(c, { genome: g, alpha: 0 }); return; }
  }
}

// ---- madness quirks, infections, and what they all do ---------------------------------------------------
// When one of the marked changes (see eldritch.js), sometimes a quirk stays with it.
function maybeQuirk(world, c) {
  const L = c.life, have = L.quirks || [];
  if (Math.random() > 0.3 * (1 + 0.3 * evilPressure(world)) * (typeof lightMadness === 'function' ? lightMadness(world) : 1)) return;
  const opts = Object.keys(QUIRKS).filter((k) => !have.includes(k));
  if (!opts.length) return;
  const k = pick(opts);
  L.quirks = [...have, k];
  L.traits = eldTraits(L);
  refreshBuffs(c);
  logEvent(world, `✦ The change has left ${L.name} ${k}: ${QUIRKS[k].note}`, c, { cat: 'rare', pri: 2 });
}

function infect(world, c, ill, why) {
  const L = c.life;
  if (!L || (L.ill || []).includes(ill)) return false;
  L.ill = [...(L.ill || []), ill];
  L.traits = eldTraits(L);
  refreshBuffs(c);
  logEvent(world, `${who(c)} has ${ill === 'rot' ? 'the rot' : 'the madness'}${why ? ` (${why})` : ''}`, c, {
    cat: 'life', pri: 1, key: `ill:${ill}`, data: 1, merge: (e) => `${e.n} animals have ${ill === 'rot' ? 'the rot' : 'the madness'}`,
  });
  return true;
}
const hasQ = (L, k) => !!(L && ((L.genome && L.genome[k]) || (L.quirks && L.quirks.includes(k)) || (L.ill && L.ill.includes(k))));

let quirkTick = 0;
function updateQuirks(world, dt) {
  const t = world.t;
  // Every frame: the iridescent cycle their outlines, the phasing flicker.
  for (const c of world.creatures) {
    const L = c.life;
    if (!L) continue;
    if (L.genome.iridescent && c.id) OUTLINE[c.id] = hslToInt((t * 40 + c.phase * 60) % 360, 0.8, 0.7);
    if (L.quirks && L.quirks.includes('phasing') && !c.dying && !c.absorbing) c.alpha = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.9 + c.phase));
  }
  quirkTick -= dt;
  if (quirkTick > 0) return;
  const step = 1 - quirkTick;
  quirkTick = 1;
  const night = world.darkness > 0.5;
  for (const c of world.creatures) {
    const L = c.life;
    if (!L || c.dying || c.leaving || c.absorbing) continue;
    // Curses at work.
    if (hasQ(L, 'twitching') && Math.random() < 0.05 * step) c.maddened = 1.5;
    if (hasQ(L, 'madness') && Math.random() < 0.1 * step) c.maddened = 1.5;
    if (L.genome.brittle && L.comfort < 0.3 && Math.random() < 0.002 * step && !lastFew(world, c)) c.dying = { t: 0, why: 'of a weak heart' };
    // Being driven mad, again and again, can leave the madness behind.
    if (c.maddened && !c.wasMad) { L.madCount = (L.madCount || 0) + 1; if (L.madCount >= 12 && Math.random() < 0.04 * lightMadness(world)) infect(world, c, 'madness', 'driven mad too often'); }
    c.wasMad = !!c.maddened;
    // The rot: from foul water, and (for the sickly, more) out of nowhere.
    if (world.pollution > 0.3 && Math.random() < 0.0004 * world.pollution * (L.genome.sickly ? 3 : 1) * step) infect(world, c, 'rot', 'from the fouled water');
    const touches = hasQ(L, 'whispering') || L.genome.feral || hasQ(L, 'weeping') || hasQ(L, 'rot') || (night && hasQ(L, 'madness'));
    if (!touches) continue;
    forNear(world, c.x, c.y, 40, (o, d2) => {
      if (o === c || !o.life || o.dying) return;
      if (hasQ(L, 'whispering') && !o.life.genome.eld) o.life.comfort = Math.max(0, o.life.comfort - 0.03);
      if (L.genome.feral && d2 < 625) o.life.comfort = Math.max(0, o.life.comfort - 0.02);
      if (d2 < 100 && hasQ(L, 'weeping') && !o.life.genome.eld && Math.random() < 0.003 * step) {
        o.life.genome.eld = true; o.life.corruption = 0; o.life.traits = eldTraits(o.life);
        logEvent(world, `${who(o)} brushed against ${L.name} and woke touched`, o, { cat: 'rare', pri: 2 });
      }
      if (d2 < 64 && hasQ(L, 'rot') && o.species === c.species && Math.random() < 0.002 * (o.life.genome.sickly ? 3 : 1) * step) infect(world, o, 'rot', `from ${L.name}`);
      if (night && d2 < 144 && hasQ(L, 'madness') && Math.random() < 0.0002 * step * lightMadness(world)) infect(world, o, 'madness', `from ${L.name}`);
    });
  }
}

// At dawn the rot may pass off (the hardy shake it off more often), and now and then the madness.
function dawnQuirks(world) {
  for (const c of world.creatures) {
    const L = c.life;
    if (!L || !L.ill || !L.ill.length) continue;
    const r = L.buffs.resilience || 0;
    // (Daylight helps the mad come back to themselves; an endless dark keeps them.)
    const keep = L.ill.filter((k) => !(k === 'rot' ? Math.random() < 0.15 + 0.4 * r : Math.random() < (0.08 + 0.2 * r) * (2.2 - lightMadness(world))));
    if (keep.length !== L.ill.length) { L.ill = keep; L.traits = eldTraits(L); refreshBuffs(c); }
  }
}

// Starry animals twinkle; the rotting and the rot show dark flecks.
const STAR_DOT = mat('#6ab0e0', '#9ad0ff', '#d0ecff', '#ffffff'), ROT_DOT = mat('#1a2008', '#2a3410', '#3a4618', '#4e5a22');
function drawQuirks(r, c, t) {
  const L = c.life, b = c.body;
  if (!L || !b) return;
  if (L.paragon && typeof drawParagon === 'function') drawParagon(r, c, t);
  const z = (c.zBody ?? c.z ?? 1) + 1;
  if (L.genome.starry) {
    if (c.starId == null) { c.starId = newId(hexToInt('#04101a')); EMISSIVE[c.starId] = 2; }
    for (let i = 0; i < b.n; i += 2) if (Math.sin(t * 3 + i * 1.7 + c.phase) > 0.4) r.dot(b.x[i], b.y[i], z + b.w[i] * 0.8, STAR_DOT, c.starId);
  }
  if (hasQ(L, 'rot') || L.genome.rotting) for (let i = 1; i < b.n; i += 3) r.dot(b.px(i, (i % 2 ? 1 : -1) * 0.8, -0.4), b.py(i, (i % 2 ? 1 : -1) * 0.8, -0.4), z + b.w[i] * 0.7, ROT_DOT, c.id);
}

// Colour for a hue in degrees (the iridescent outline).
function hslToInt(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return (0xff000000 | (f(4) << 16) | (f(8) << 8) | f(0)) >>> 0;
}
