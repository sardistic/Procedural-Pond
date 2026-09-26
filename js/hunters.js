'use strict';
// Hunters: any predator (and any swimmer you wake to the hunt) can be built up,
// ten levels in each of eight ways, each level dearer than the last: pearls for
// the body (jaws, burst, senses), essence for the drive (hunger, maw, tenacity),
// corruption for what it spreads (contagion, devour). Built up far enough, a
// hunter takes anything smaller than itself, and a marked hunter with contagion
// seeds the mark wherever it kills; an unmarked one spreads the rot.

const HUNT = {
  jaws: { label: 'Jaws', cur: 'pearls', base: 300, note: 'reaches and holds prey better' },
  burst: { label: 'Burst', cur: 'pearls', base: 250, note: 'faster in the chase' },
  senses: { label: 'Senses', cur: 'pearls', base: 250, note: 'finds prey from further off, and sees through camouflage' },
  hunger: { label: 'Hunger', cur: 'essence', base: 40, note: 'hunts long before it is hungry' },
  maw: { label: 'Maw', cur: 'essence', base: 60, note: 'takes bigger prey, and grows a little with each level' },
  tenacity: { label: 'Tenacity', cur: 'essence', base: 50, note: 'lives longer and tires slower' },
  contagion: { label: 'Contagion', cur: 'corruption', base: 20, note: 'its kills taint the water: the mark (if it carries it) or the rot spreads to those nearby' },
  devour: { label: 'Devour', cur: 'corruption', base: 30, note: 'each kill feeds it: it grows, and the pond yields corruption' },
};
const HUNT_MAX = 10;
const huntLv = (c, k) => (c.life && c.life.hunt && c.life.hunt[k]) || 0;
const huntCost = (c, k) => Math.round(HUNT[k].base * 1.75 ** huntLv(c, k));
const canBeHunter = (c) => !!c.life && c instanceof Fish;

function buyHunt(world, c, k) {
  const lv = huntLv(c, k);
  if (lv >= HUNT_MAX || !isPredator(c) || !pay(world, HUNT[k].cur, huntCost(c, k))) return false;
  c.life.hunt = { ...(c.life.hunt || {}), [k]: lv + 1 };
  if (k === 'maw' && SCALABLE.has(c.species) && c.base) { c.life.genome.size = Math.min(2, (c.life.genome.size || 1) * 1.03); applyScale(c, c.life.scale * c.life.genome.size); }
  refreshBuffs(c);
  return true;
}

// Waking a grazer to the hunt.
const AWAKEN = { essence: 50, corruption: 25 };
function awakenHunter(world, c) {
  if (!canBeHunter(c) || isPredator(c) || (world.game.essence || 0) < AWAKEN.essence || (world.game.corruption || 0) < AWAKEN.corruption) return false;
  spendEssence(world, AWAKEN.essence);
  spendCorruption(world, AWAKEN.corruption);
  c.life.hunter = true;
  c.life.traits = eldTraits(c.life);
  refreshBuffs(c);
  logEvent(world, `You woke ${c.life.name} to the hunt. It looks at the others differently now`, c, { cat: 'rare', pri: 2 });
  return true;
}

// ---- how the hunt uses them (called from assignHunts and the fish's chase) -----------------------
// Hunger lets it hunt before it's really hungry.
const huntThreshold = (p, base) => Math.min(0.97, base + 0.05 * huntLv(p, 'hunger'));
const huntRange = (p) => 1 + 0.15 * huntLv(p, 'senses');
const huntSees = (p) => 1 - 0.08 * huntLv(p, 'senses'); // how much of prey's stealth still works
const huntReach = (p) => 1 + 0.15 * huntLv(p, 'jaws');
const huntBurst = (p) => 1 + 0.07 * huntLv(p, 'burst');
// What else it can take besides the usual prey: anything smaller than itself (the maw),
// the young of its own kind (a cannibal).
function huntExtra(p, q) {
  if (q === p || !q.life || !p.body || !q.body) return false;
  const maw = huntLv(p, 'maw');
  if (maw > 0 || p.life.hunter) {
    const pw = Math.max(...p.body.w), qw = Math.max(...q.body.w);
    if (qw < pw * (0.45 + 0.1 * maw)) return true;
  }
  if (p.life.genome.cannibal && q.species === p.species && q.life.scale < 0.7) return true;
  return false;
}

// After a kill: devouring, and the taint spreading from it.
function onKill(world, c, prey) {
  if (!c.life) return;
  const dev = huntLv(c, 'devour'), con = huntLv(c, 'contagion');
  if (dev) {
    gainCorruption(world, 0.5 * dev, c, { quiet: true });
    const g = c.life.genome;
    if (SCALABLE.has(c.species) && c.base && g.size < 1.8) { g.size = Math.min(1.8, g.size * (1 + 0.004 * dev)); applyScale(c, c.life.scale * g.size); }
  }
  if (con && Math.random() < 0.08 * con) {
    const near = world.creatures.filter((o) => o !== c && o.life && !o.dying && (o.x - prey.x) ** 2 + (o.y - prey.y) ** 2 < 900);
    const o = near.length && pick(near);
    if (!o) return;
    if (c.life.genome.eld && !o.life.genome.eld) {
      o.life.genome.eld = true; o.life.corruption = 0; o.life.traits = eldTraits(o.life);
      logEvent(world, `${who(o)} swam through ${c.life.name}'s kill and woke touched`, o, { cat: 'rare', pri: 2 });
    } else if (!c.life.genome.eld && typeof infect === 'function') infect(world, o, 'rot', `from ${c.life.name}'s kill`);
  }
}
