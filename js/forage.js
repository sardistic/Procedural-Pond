'use strict';
// What a meal is worth, what it costs, and what an awakened mind learns about both.
//  - Biomass: a bigger animal is more food (more energy, more growth, more of its genes).
//  - Risk: some animals cost to take: poison (pufferfish), stings (jellies), spines (lionfish),
//    claws, barbs and bites; and anything big enough fights back.
//  - Learning: each mind keeps, for every kind it has eaten or fought, what it gained and what it cost
//    (a running average, more trusted the more tries), and weighs a target by learned value against
//    learned risk, sharpened by hunger and tempered by how bold it is. Toxic kinds get avoided; easy,
//    rich ones get sought out.
//  - Experience opens more choices: a novice forages and fights; after a few hunts it is a hunter; then
//    a stalker (a slow approach lands a first strike harder); then a pack hunter (kin nearby join in).
// Deterministic game code; the controllers only see the options and numbers it offers.

const PREY_RISK = {
  puffer: { harm: 0.45, why: 'poison', toxic: true }, lionfish: { harm: 0.3, why: 'spines', toxic: true },
  jelly: { harm: 0.15, why: 'a sting', toxic: true }, crab: { harm: 0.08, why: 'claws' }, ray: { harm: 0.12, why: 'a barb' },
  stingray: { harm: 0.12, why: 'a barb' }, eel: { harm: 0.1, why: 'a bite' }, moray: { harm: 0.15, why: 'a bite' },
  snake: { harm: 0.12, why: 'fangs' }, octopus: { harm: 0.06, why: 'ink and arms' }, shark: { harm: 0.2, why: 'teeth' },
  pike: { harm: 0.1, why: 'teeth' }, turtle: { harm: 0.1, why: 'a shell and a beak' }, urchin: { harm: 0.2, why: 'spines', toxic: true },
};
const FORAGE_TIERS = [
  { name: 'novice', hunts: 0, note: 'forages, flees and fights' },
  { name: 'hunter', hunts: 4, note: 'weighs prey by what it is worth and what it costs' },
  { name: 'stalker', hunts: 10, note: 'can stalk: a slow approach lands its first strike harder' },
  { name: 'pack hunter', hunts: 20, note: 'can call its kin: those nearby join the attack' },
];
const FORAGE_SPECIES_RE = /^[a-zA-Z][a-zA-Z0-9 -]{0,39}$/;

const bodyWidth = (q) => (q.body && q.body.w ? Math.max(...q.body.w) : q.R || 1);
// Biomass, relative: width squared along its length, and bigger for growth from feeding.
const biomassOf = (q) => bodyWidth(q) ** 2 * Math.max(1, (q.body && q.body.n) || 3) * (1 + ((q.life && q.life.grown) || 0));

function forageMemory(c) {
  const M = typeof mindLearn === 'function' ? mindLearn(c) : (c.life.mindLearn || (c.life.mindLearn = {}));
  if (!M.prey) M.prey = {};
  return M.prey;
}
const forageHunts = (c) => Object.values((c.life && c.life.mindLearn && c.life.mindLearn.prey) || {}).reduce((n, s) => n + (s.n || 0), 0);
function forageTier(c) { const n = forageHunts(c); let t = 0; FORAGE_TIERS.forEach((T, i) => { if (n >= T.hunts) t = i; }); return t; }

// What it expects of a target: gain (food, from biomass) and harm (its kind's defences and size),
// blended with what it has learned of that kind, the more so the more tries.
function forageEstimate(c, q) {
  const ratio = clamp(biomassOf(q) / Math.max(0.5, biomassOf(c)), 0, 3), wr = bodyWidth(q) / Math.max(0.5, bodyWidth(c));
  const priorGain = clamp(0.15 + 0.5 * Math.min(1.2, ratio), 0, 1);
  const fights = typeof mindFightDrive === 'function' && q.life ? mindFightDrive(world, q).value : 0.3;
  const priorHarm = clamp((PREY_RISK[q.species] ? PREY_RISK[q.species].harm : 0) + 0.18 * Math.max(0, wr - 0.6) ** 2 * (0.5 + fights), 0, 1);
  const S = c.life && c.life.mindLearn && c.life.mindLearn.prey && c.life.mindLearn.prey[q.species];
  const k = S ? S.n / (S.n + 3) : 0;
  return { gain: lerp(priorGain, S ? S.gain : priorGain, k), harm: lerp(priorHarm, S ? S.harm : priorHarm, k), tries: S ? S.n : 0, ratio };
}
// Worth going for: gain sharpened by hunger, risk tempered by boldness (its fight drive). Health is dearer than
// a meal, so a well-fed animal shuns what hurt it, and a starving one may still take the risk.
function forageValue(w, c, q) {
  const E = forageEstimate(c, q), hunger = clamp(1 - c.life.energy, 0, 1), bold = typeof mindFightDrive === 'function' ? mindFightDrive(w, c).value : 0.3;
  return { ...E, value: E.gain * (0.4 + hunger) - E.harm * (2.2 - 0.8 * bold) };
}
// After an encounter with a kind: what it gained (energy, growth) and what it cost (health).
function forageLearn(c, species, gain, harm) {
  if (!c.life || !c.life.mind || !FORAGE_SPECIES_RE.test(species || '')) return;
  const P = forageMemory(c), S = P[species] || (P[species] = { n: 0, gain: 0, harm: 0 });
  const a = S.n ? 0.3 : 1;
  S.gain = Math.round((S.gain + (clamp(gain, 0, 1) - S.gain) * a) * 1000) / 1000;
  S.harm = Math.round((S.harm + (clamp(harm, 0, 1) - S.harm) * a) * 1000) / 1000;
  S.n = Math.min(9999, S.n + 1);
  const keys = Object.keys(P);
  if (keys.length > 10) delete P[keys.reduce((x, y) => (P[x].n <= P[y].n ? x : y))];
}

// ---- defences: what taking something costs the one who takes it ---------------------------------------
// (For every animal, awakened or not: poison and spines hurt whoever eats them.)
function preyDefence(world, eater, prey) {
  const R = PREY_RISK[prey.species];
  if (!R || !R.toxic || !eater.life || typeof hurt !== 'function') return 0;
  const before = eater.life.hp ?? 1, resist = (geneBuffs(eater).resilience || 0) + (geneBuffs(eater).tolerance || 0) * 0.5;
  hurt(world, eater, R.harm * (1 - Math.min(0.8, resist)), { why: `poisoned by ${prey.species === 'puffer' ? 'a pufferfish' : `a ${prey.species}`}`, canKill: false });
  if (typeof floatAward === 'function') floatAward(eater.x, eater.y - 6, R.why, 'spend');
  if (typeof playAnim === 'function') playAnim(world, eater, 'hit');
  return Math.max(0, before - (eater.life.hp ?? 1));
}

// ---- the moves experience opens -------------------------------------------------------------------------
// A stalker that comes in slowly lands its first strike harder; kin nearby make a pack.
function forageStrikeBonus(w, c, q) {
  const tier = forageTier(c);
  let k = 1;
  if (tier >= 2 && (c.speed || 0) < (c.maxSpeed || 10) * 0.45) k *= 1.35;
  if (tier >= 3) { let kin = 0; forNear(w, c.x, c.y, 30, (o) => { if (o !== c && o.species === c.species && o.life && !o.dying && kin < 2) kin++; }); k *= 1 + 0.25 * kin; }
  return k;
}
// When a pack hunter attacks, kin within reach close in on the target too.
function forageCallKin(w, c, q) {
  if (forageTier(c) < 3 || typeof steer !== 'function') return 0;
  let n = 0;
  forNear(w, c.x, c.y, 40, (o) => { if (n >= 3 || o === c || o.species !== c.species || !o.life || o.dying || o.life.mind || o.grabbed) return; steer(o, q.x, q.y, (o.maxSpeed || o.cruise || 8) * 0.9); n++; });
  return n;
}
// For saves.
function cleanForageMemory(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, s] of Object.entries(raw).slice(0, 10)) if (FORAGE_SPECIES_RE.test(k) && s && Number.isFinite(s.n)) {
    out[k] = { n: Math.floor(clamp(s.n, 0, 9999)), gain: Number.isFinite(s.gain) ? Math.round(clamp(s.gain, 0, 1) * 1000) / 1000 : 0, harm: Number.isFinite(s.harm) ? Math.round(clamp(s.harm, 0, 1) * 1000) / 1000 : 0 };
  }
  return out;
}
