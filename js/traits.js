'use strict';
// Growing individuals: every animal, plant and structure can be built up from
// its card, each with a small tree of traits.
//  - Animals (their card): raise a working gene up to three levels (fertile,
//    long-lived, hardy, clever, bright, calm, adaptable) with essence, each level
//    dearer than the last; and, with corruption, the eldritch traits (eldritch.js).
//  - Plants (right-click or long-press one): lush (bigger, more cover), hardy
//    (lives longer, minds litter less) and seeding (spreads further) for pearls;
//    glowing (little lights at night that comfort animals and draw plankton) for
//    essence; corrupted (black and wrong: it yields corruption, unsettles those
//    near it and marks young born by it) for corruption.
//  - Structures (click one): reach and strength for pearls. An island can be
//    raised (up to five times, bigger, higher and lusher each time; building
//    another island on it does the same), and from the third level it can go one
//    of two ways, three steps each: lanterns of life (essence) or the whispering
//    stone (corruption).

const pay = (world, cur, n, cat = null) => (cur === 'essence' ? spendEssence(world, n, cat) : cur === 'corruption' ? spendCorruption(world, n, cat) : spend(world, n, cat));
const have = (world, cur) => (cur === 'essence' ? world.game.essence || 0 : cur === 'corruption' ? world.game.corruption || 0 : world.game.pearls);

// ---- animals -------------------------------------------------------------------------------------
const ANIMAL_TRAITS = ['fertile', 'longlived', 'hardy', 'clever', 'bright', 'calm', 'adaptable'];
const animalLevel = (c, key) => (c.life.boosts && c.life.boosts[key]) || 0;
const ANIMAL_MAX = 10;
const animalTraitCost = (c, key) => Math.round((3 + spawnCost(c.species === 'tadpole' ? 'frog' : c.species) * 0.12) * 1.75 ** animalLevel(c, key));
function buyAnimalTrait(world, c, key) {
  const L = c.life, lv = animalLevel(c, key), E = ENHANCE[key];
  if (lv >= ANIMAL_MAX || !pay(world, 'essence', animalTraitCost(c, key), 'evolve')) return false;
  L.boosts = { ...(L.boosts || {}), [key]: lv + 1 };
  L.genome[E.gene] = clamp(L.genome[E.gene] + E.add * (lv < 3 ? 0.5 : 0.2), 0, 1);
  L.traits = eldTraits(L);
  refreshBuffs(c);
  return true;
}

// ---- plants --------------------------------------------------------------------------------------
const PLANT_TRAITS = {
  lush: { label: 'Lush', max: 3, cur: 'pearls', cost: (lv) => 6 * (lv + 1), note: 'bigger, with more cover (calmer water around it)' },
  hardy: { label: 'Hardy', max: 3, cur: 'pearls', cost: (lv) => 5 * (lv + 1), note: 'lives half as long again, and minds litter less' },
  seed: { label: 'Seeding', max: 3, cur: 'pearls', cost: (lv) => 5 * (lv + 1), note: 'seeds more around itself each dawn' },
  glow: { label: 'Glowing', max: 1, cur: 'essence', cost: () => 10, note: 'little lights at night: animals near it are comforted, and plankton gathers' },
  eld: { label: 'Corrupted', max: 1, cur: 'corruption', cost: () => 8, note: 'black and wrong: it yields corruption, unsettles those near it, and marks young born by it' },
};
const PLANT_NAMES = {
  weed: 'Weed', eelgrass: 'Eelgrass', anemone: 'Anemone', coral: 'Coral', urchin: 'Urchin', marimo: 'Marimo moss ball', duckweed: 'Duckweed',
  lily: 'Lily pad', blackcoral: 'Black coral', glowcap: 'Glowcaps',
};
function buyPlantTrait(world, p, key) {
  const T = PLANT_TRAITS[key], lv = (p.tr && p.tr[key]) || 0;
  if (lv >= T.max || !pay(world, T.cur, T.cost(lv), 'plants')) return false;
  p.tr = { ...(p.tr || {}), [key]: lv + 1 };
  if (key === 'hardy' && p.span) p.span *= 1.5;
  if (key === 'eld') { VOID_SKIN[p.id] = 4; logEvent(world, `You corrupted ${withArticle((PLANT_NAMES[p.make] || p.make).toLowerCase())}: it has gone black, and nothing near it rests easy`, null, { cat: 'rare', pri: 2 }); }
  return true;
}
// Packed into one byte for links: lush (2 bits), hardy (2), seeding (2), glow, eld.
const packPlantTraits = (tr) => (tr ? (tr.lush || 0) | ((tr.hardy || 0) << 2) | ((tr.seed || 0) << 4) | ((tr.glow ? 1 : 0) << 6) | ((tr.eld ? 1 : 0) << 7) : 0);
const unpackPlantTraits = (b) => (b ? { lush: b & 3, hardy: (b >> 2) & 3, seed: (b >> 4) & 3, glow: (b >> 6) & 1, eld: (b >> 7) & 1 } : null);

// Glowing plants' little lights, drawn over the plant at night.
const PLANT_LIGHT = mat('#2a6a3a', '#4ac070', '#9af0b0', '#f0fff4');
function drawPlantExtras(r, p, t, world) {
  if (!p.tr) return;
  if (p.tr.glow && world.darkness > 0.3) {
    if (p.lightId == null) { p.lightId = newId(hexToInt('#04140a')); EMISSIVE[p.lightId] = 2; }
    for (let k = 0; k < 5; k++) {
      const a = hash2(k, p.seed % 97, 5) * TAU + Math.sin(t * 0.5 + k) * 0.3, d = 2 + hash2(k, 3, p.seed % 89) * 6;
      if (Math.sin(t * (1.5 + k * 0.4) + k * 2) > -0.4) r.dot(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 6 + k * 2, PLANT_LIGHT, p.lightId);
    }
  }
  if (p.tr.eld) VOID_SKIN[p.id] = 4;
}

// Each second: glowing plants comfort and feed at night; corrupted ones unsettle and yield corruption.
function plantTraitTick(world) {
  for (const p of world.plants) {
    if (!p.tr) continue;
    if (p.tr.glow && world.darkness > 0.4) {
      for (const c of world.creatures) if (c.life && (c.x - p.x) ** 2 + (c.y - p.y) ** 2 < 900) c.life.comfort = Math.min(1, c.life.comfort + 0.02);
      if (Math.random() < 0.1) world.food.push(new Food(p.x + rand(-8, 8), p.y + rand(-8, 8), rand(4, 26), 'plankton'));
    }
    if (p.tr.eld) {
      gainCorruption(world, 0.01, null, { quiet: true });
      for (const c of world.creatures) {
        if (!c.life || c.life.genome.eld || (c.x - p.x) ** 2 + (c.y - p.y) ** 2 > 900) continue;
        c.life.comfort = Math.max(0, c.life.comfort - 0.02);
        if (Math.random() < 0.02) c.maddened = 2;
      }
    }
  }
}

// ---- structures ----------------------------------------------------------------------------------
const STRUCT_TRAITS = {
  reach: { label: 'Reach', max: 10, cost: (s, lv) => Math.round(STRUCTURES[s.kind].pearls * 0.3 * 1.8 ** lv), note: 'its effect reaches a fifth further' },
  strength: { label: 'Strength', max: 10, cost: (s, lv) => Math.round(STRUCTURES[s.kind].pearls * 0.4 * 1.8 ** lv), note: 'its effect is a quarter stronger' },
};
function buyStructTrait(world, s, key) {
  const lv = (s.lv && s.lv[key]) || 0;
  if (lv >= STRUCT_TRAITS[key].max || !pay(world, 'pearls', STRUCT_TRAITS[key].cost(s, lv), 'build')) return false;
  s.worth = (s.worth || 0) + STRUCT_TRAITS[key].cost(s, lv);
  s.lv = { ...(s.lv || {}), [key]: lv + 1 };
  return true;
}

// An island can be raised ten times over, each level a terrace higher and wider, and dearer
// than the last; its branch (from level 3) can grow a step for each level above the second, to six.
const ISLAND_MAX = 10, ISLAND_BRANCH_MAX = 6;
const raiseCost = (s) => { const n = s.stack || 1, k = typeof islandDeepCost === 'function' ? islandDeepCost(s.deep || 0) : 1; return { pearls: Math.round(STRUCTURES.island.pearls * 0.6 * n * 1.35 ** (n - 1) * k), essence: Math.round(10 * n * 1.25 ** (n - 1) * k) }; };
const islandBranchMax = (s) => Math.min(ISLAND_BRANCH_MAX, (s.stack || 1) - 2);
function raiseIsland(world, s) {
  if ((s.stack || 1) >= ISLAND_MAX) { if (typeof showTicker === 'function') showTicker('The island can’t be raised any higher'); return false; }
  const c = raiseCost(s);
  if (world.game.pearls < c.pearls || (world.game.essence || 0) < c.essence) { if (typeof notEnough === 'function') notEnough(world.game.pearls < c.pearls ? c.pearls : c.essence, world.game.pearls < c.pearls ? 'pearls' : 'essence'); return false; }
  spend(world, c.pearls, 'build');
  spendEssence(world, c.essence, 'build');
  s.worth = (s.worth || 0) + c.pearls + c.essence * WORTH.essence;
  s.stack = (s.stack || 1) + 1;
  for (let k = 0; k < 30; k++) addBubbles(world, s.x + rand(-1, 1) * s.R * 1.3, s.y + rand(-1, 1) * s.R * 1.3, 1, 2);
  addRipple(world, s.x, s.y, 3);
  if (typeof structuresChanged === 'function') structuresChanged(true);
  if (typeof narrate === 'function') narrate(world, 'island', { level: s.stack });
  logEvent(world, `You raised the island (level ${s.stack}): a new terrace, higher, wider and greener${s.stack === 3 ? '. It can go one of two ways now: lanterns of life, or the whispering stone' : s.stack > 3 && s.branch ? `, and room for the ${s.branch === 'life' ? 'lanterns' : 'stone'} to grow` : ''}`, null, { cat: 'pond', pri: 2 });
  return true;
}

const ISLAND_BRANCH = {
  life: { label: 'Lanterns of life', cur: 'essence', cost: (lv) => Math.round(40 * (lv + 1) * 1.3 ** lv), note: 'little lights among the palms; fireflies gather; animals nearby are comforted and breed more' },
  dark: { label: 'The whispering stone', cur: 'corruption', cost: (lv) => Math.round(25 * (lv + 1) * 1.3 ** lv), note: 'a black stone that hums: corruption spreads from it, animals nearby lose their minds, young born near it may wake touched' },
};
function growIsland(world, s, branch) {
  if ((s.stack || 1) < 3 || (s.branch && s.branch !== branch) || (s.blv || 0) >= islandBranchMax(s)) return false;
  const B = ISLAND_BRANCH[branch], lv = s.blv || 0;
  if (!pay(world, B.cur, B.cost(lv), 'build')) { if (typeof notEnough === 'function') notEnough(B.cost(lv), B.cur); return false; }
  s.branch = branch;
  s.blv = lv + 1;
  if (typeof structuresChanged === 'function') structuresChanged(false);
  logEvent(world, branch === 'life' ? `✦ The island glows with lanterns of life (level ${s.blv})` : `✦ The whispering stone on the island has grown (level ${s.blv}): the water near it will not stay sane`, null, { cat: 'rare', pri: 2 });
  if (branch === 'dark' && typeof scatterFrom === 'function') scatterFrom(world, s, 2);
  return true;
}
