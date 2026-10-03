'use strict';
// Breeding habitats, and keeping populations in check.
//
// Habitats: places built for one kind of life to breed. Each lets its animals
// breed near it (some can breed nowhere else) and lay more, and what stands
// around it shapes the young born there, for better or worse:
//  - Spawning gravel: fish (koi, tetras, wild fish, eels, rays, pufferfish).
//  - Amphibian pool: frogs, axolotls, snails, turtles and crabs.
//  - Reef nursery (salt): clownfish, shrimp, starfish, jellies, octopus, crabs.
//  - Brood chamber (deep water, from the midnight zone): the deep's own kind,
//    who breed nowhere else.
// Near a habitat (within 70 px of it): glowing plants or a shrine and young may
// glow; springs, aerators and root cathedrals make them hardier; vents, smokers
// and brine pools bigger; an island of life longer-lived; corals and anemones
// luckier; the idol, the gate, the cradle, a dark island or a corrupted plant
// may mark them; litter may leave them sickly or frail; carrion may leave them
// rotting.
//
// Keeping numbers in check (without letting them crash): a species crowded well
// past what the pond holds for it starts to fight (the weaker can die of it) and
// breeds sickness (the rot); a species down to its last few seeks itself out and
// breeds sooner, and neither blights nor sickness take the very last three.

Object.assign(STRUCTURES, {
  spawnbed: {
    label: 'Spawning gravel', pearls: 240, essence: 20, r: 70, size: 14, wet: true,
    desc: 'clean gravel where fish spawn: koi, tetras, wild fish, eels, rays and pufferfish breed here (the last three nowhere else), and lay more',
    aura: { comfort: 0.04 }, habitatFor: ['koi', 'tetra', 'wild', 'eel', 'ray', 'puffer'],
  },
  amphibpool: {
    label: 'Amphibian pool', pearls: 240, essence: 20, r: 70, size: 16, wet: true,
    desc: 'shallows and mud: frogs, axolotls, snails, turtles and crabs breed here (turtles and crabs nowhere else), and lay more',
    aura: { comfort: 0.04 }, habitatFor: ['frog', 'axolotl', 'snail', 'turtle', 'crab'],
  },
  reefnursery: {
    label: 'Reef nursery', pearls: 280, essence: 25, r: 70, size: 16, wet: true, habitat: 'salt',
    desc: 'a sheltered reef for the young: clownfish, shrimp, starfish, jellies, octopus and crabs breed here (all but the first two nowhere else)',
    aura: { comfort: 0.05 }, habitatFor: ['clown', 'shrimp', 'starfish', 'jelly', 'octopus', 'crab'],
  },
  broodchamber: {
    label: 'Brood chamber', pearls: 700, essence: 120, r: 80, size: 16, wet: true, tier: 3, deepMin: 0.4,
    desc: 'a hollow in the deep: the deep’s own kind breed here, and nowhere else',
    aura: { comfort: 0.05 }, habitatFor: ['shark', 'sandshark', 'catfish', 'angler', 'gulper', 'vampire', 'isopod', 'cavefish', 'olm', 'snailfish', 'frilled', 'boneeel', 'siphon', 'squid', 'deepone'],
  },
});
STRUCT_CODES.push('spawnbed', 'amphibpool', 'reefnursery', 'broodchamber');
Object.assign(STRUCT_LIKES, { spawnbed: ['koi', 'tetra', 'wild'], amphibpool: ['frog', 'axolotl', 'turtle'], reefnursery: ['clown', 'shrimp', 'starfish'], broodchamber: ['cavefish', 'isopod'] });
for (const k of ['spawnbed', 'amphibpool', 'reefnursery', 'broodchamber']) LIKE_LABEL[k] = STRUCTURES[k].label.toLowerCase();

const HM = {
  gravel: mat('#4a4a44', '#6e6e64', '#94948a', '#bcbcb0'), mud: mat('#2a1e10', '#40301c', '#5a462a', '#766040'),
  reed: mat('#2a4a1a', '#3e6a26', '#5a8a34', '#7eae4a'), reef: mat('#8a3a4a', '#c05a6a', '#e88a94', '#ffc0c4'),
  chamber: mat('#0e0c14', '#1a1622', '#2a2434', '#3e364c'), eggGlow: mat('#6a8a1a', '#9ac82a', '#d0f04a', '#f4ffb0'),
};
Object.assign(BUILD, {
  spawnbed(s) { s.stones = Array.from({ length: 34 }, () => [rand(-12, 12), rand(-9, 9), rand(0.8, 1.8)]); },
  amphibpool(s) { s.reeds = Array.from({ length: 12 }, () => { const a = rand(0, TAU), d = rand(9, 14); return [Math.cos(a) * d, Math.sin(a) * d, rand(6, 11)]; }); },
  reefnursery(s) { s.heads = Array.from({ length: 9 }, () => [rand(-11, 11), rand(-8, 8), rand(2, 4)]); },
  broodchamber(s) { s.ribs = 9; s.R = rand(11, 13); },
});
Object.assign(BAKE, {
  spawnbed(r, s, next) { const id = next(HM.gravel); for (const [ox, oy, a] of s.stones) r.ellipsoid(s.x + ox, s.y + oy, a, a * 0.8, ox, 0, a * 0.6, HM.gravel, id); },
  amphibpool(r, s, next) {
    const id = next(HM.mud);
    r.ellipsoid(s.x, s.y, 13, 10, 0, 0, 1.2, HM.mud, id);
    const rid = next(HM.reed);
    for (const [ox, oy, h] of s.reeds) r.tube(s.x + ox, s.y + oy, 0.6, 0, s.x + ox + 1, s.y + oy - 1, 0.3, h, 0.8, HM.reed, rid);
  },
  reefnursery(r, s, next) { const id = next(HM.reef); for (const [ox, oy, a] of s.heads) r.ellipsoid(s.x + ox, s.y + oy, a, a, ox, 0, a * 1.2, (lx, ly) => (((lx + ly) * 6) % 1 < 0.3 ? SM.pale : HM.reef), id); },
  broodchamber(r, s, next) {
    const id = next(HM.chamber);
    for (let k = 0; k < s.ribs; k++) {
      const a = k / s.ribs * TAU;
      r.tube(s.x + Math.cos(a) * s.R, s.y + Math.sin(a) * s.R, 1.8, 0, s.x + Math.cos(a) * s.R * 0.4, s.y + Math.sin(a) * s.R * 0.4, 0.8, 12, 0.8, HM.chamber, id);
    }
  },
});
Object.assign(DRAW, {
  broodchamber(r, s, t) {
    if (s.gid == null) { s.gid = newId(hexToInt('#0a1402')); EMISSIVE[s.gid] = 2; }
    for (let k = 0; k < 7; k++) if (Math.sin(t * 1.2 + k * 1.9) > 0) r.dot(s.x + Math.cos(k * 2.4) * 4, s.y + Math.sin(k * 2.4) * 4, 2, HM.eggGlow, s.gid);
  },
});

// Who can breed only at a habitat, and how.
Object.assign(BREED, {
  eel: { clutch: [2, 4], hatch: 30, cap: 6, eggs: 'plant', needs: true }, ray: { clutch: [1, 3], hatch: 35, cap: 5, eggs: 'floor', needs: true },
  puffer: { clutch: [2, 4], hatch: 25, cap: 6, eggs: 'plant', needs: true }, turtle: { clutch: [2, 4], hatch: 45, cap: 6, eggs: 'floor', needs: true },
  crab: { clutch: [3, 6], hatch: 25, cap: 10, eggs: 'floor', needs: true }, starfish: { clutch: [2, 4], hatch: 30, cap: 8, eggs: 'floor', needs: true },
  jelly: { clutch: [3, 5], hatch: 20, cap: 10, eggs: 'floor', needs: true }, octopus: { clutch: [2, 4], hatch: 35, cap: 4, eggs: 'rock', needs: true },
});
for (const k of STRUCTURES.broodchamber.habitatFor) if (!BREED[k]) BREED[k] = { clutch: [1, 3], hatch: 40, cap: 6, eggs: 'floor', needs: true };
BREED.catfish = BREED.catfish || { clutch: [1, 3], hatch: 40, cap: 6, eggs: 'floor', needs: true };

// The habitat an animal is breeding at (the nearest that takes its kind), if any.
function habitatFor(world, c) {
  let best = null, bd = Infinity;
  for (const s of world.structures || []) {
    const def = STRUCTURES[s.kind];
    if (!def.habitatFor || !def.habitatFor.includes(c.species) || s.anim) continue;
    const d = Math.hypot(s.x - c.x, s.y - c.y);
    if (d < auraR(world, s) && d < bd) { bd = d; best = s; }
  }
  return best;
}
// Can it breed here? (Those that need a habitat need to be at one.)
const canBreedHere = (world, c) => !BREED[c.species] || !BREED[c.species].needs || !!habitatFor(world, c);
// A habitat's own kind lay half as many again (more with its strength upgrades).
const habitatFert = (world, c) => { const s = habitatFor(world, c); return s ? 1.5 * auraK(s) : 1; };

// What the surroundings of a habitat do to the young born there.
const NUDGES = [
  { what: (o) => o.make === 'glowcap' || o.make === 'starweed' || (o.tr && o.tr.glow) || o.kind === 'shrine', note: 'glowing things nearby: the young may glow', apply: (g) => { if (Math.random() < 0.03) g.glow = true; } },
  { what: (o) => o.kind === 'aerator' || o.kind === 'spring' || o.kind === 'rootcathedral', note: 'clean water nearby: the young are hardier', apply: (g) => { g.vit = Math.min(1, (g.vit ?? 0.5) + 0.05); } },
  { what: (o) => o.kind === 'vent' || o.kind === 'smoker' || o.kind === 'brinepool', note: 'warm mineral water nearby: the young grow bigger', apply: (g) => { g.size = Math.min(1.5, (g.size || 1) * 1.04); } },
  { what: (o) => o.kind === 'island' && o.branch === 'life', note: 'an island of life nearby: the young live longer', apply: (g) => { g.lon = Math.min(1, (g.lon ?? 0.5) + 0.05); } },
  { what: (o) => o.make === 'coral' || o.make === 'anemone', note: 'coral nearby: the young are luckier', apply: (g) => { if (Math.random() < 0.01) g.shiny = true; } },
  { what: (o) => ['idol', 'gate', 'cradle'].includes(o.kind) || (o.kind === 'island' && o.branch === 'dark') || (o.tr && o.tr.eld), note: 'something dark nearby: the young may wake touched', apply: (g) => { if (Math.random() < 0.04) g.eld = true; } },
  { what: (o) => o instanceof Litter, note: 'litter nearby: the young may be sickly or frail', apply: (g) => { if (Math.random() < 0.06) g[pick(['sickly', 'frail'])] = true; } },
  { what: (o) => o instanceof Remains, note: 'carrion nearby: the young may be rotting', apply: (g) => { if (Math.random() < 0.04) g.rotting = true; } },
];
function habitatNeighbours(world, s) {
  const near = (o) => (o.x - s.x) ** 2 + (o.y - s.y) ** 2 < 4900 && o !== s;
  return [...world.plants.filter(near), ...(world.structures || []).filter(near), ...(world.litter || []).filter(near), ...(world.remains || []).filter(near)];
}
const habitatInfluences = (world, s) => { const around = habitatNeighbours(world, s); return NUDGES.filter((n) => around.some(n.what)).map((n) => n.note); };
// Called for each young born: its habitat's surroundings shape its genes.
function habitatNudge(world, x, y, species, g) {
  const s = habitatFor(world, { x, y, species });
  if (!s) return;
  const around = habitatNeighbours(world, s);
  for (const n of NUDGES) if (around.some(n.what)) n.apply(g);
}

// ---- keeping numbers in check -------------------------------------------------------------------------
const lastFew = (world, c) => world.creatures.filter((o) => o.life && o.species === c.species && !o.dying && !o.leaving).length <= 3;
let balanceTick = 0;
function updateBalance(world, dt) {
  balanceTick -= dt;
  if (balanceTick > 0 || world.opts.life === false) return;
  balanceTick = 3;
  const by = new Map();
  for (const c of world.creatures) {
    if (!c.life || c.dying || c.leaving || c.absorbing || c.species === 'tadpole') continue;
    const k = breedKey(c);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(c);
  }
  for (const [, list] of by) {
    const kind = list[0].species, target = world.targets[kind] || list.length, n = list.length;
    // Crowded: fights break out, and sickness.
    if (n > Math.max(10, target * 1.5)) {
      if (Math.random() < 0.35) {
        const a = pick(list), b = list.find((o) => o !== a && (o.x - a.x) ** 2 + (o.y - a.y) ** 2 < 400 && o.life.scale > 0.8);
        if (b && a.life.scale > 0.8) {
          const score = (c) => (c.life.hp ?? 1) * geneBuffs(c).vitality * geneBuffs(c).aggression * (1 + (c.life.grown || 0)) * rand(0.6, 1.4);
          const loser = score(a) < score(b) ? a : b;
          if (typeof hurt === 'function') hurt(world, loser, 0.35, { why: 'killed in a fight' });
          loser.life.comfort = Math.max(0, loser.life.comfort - 0.2);
          addHeat(world, loser.x, loser.y, 0.2);
          addRipple(world, loser.x, loser.y, 1, true);
          const label = describe(a).label;
          logEvent(world, `The crowded ${plural(label, 2).toLowerCase()} are fighting over room`, loser, { cat: 'hunt', pri: 0, key: `fight:${kind}`, merge: (e) => `The crowded ${plural(label, 2).toLowerCase()} keep fighting over room (${e.n} fights)` });
        }
      }
      if (Math.random() < 0.03 && typeof infect === 'function') infect(world, pick(list), 'rot', 'in the crowd');
    }
    // Scarce: the last few seek each other out and breed sooner.
    if (n >= 2 && n <= Math.max(2, target * 0.35) && BREED[kind]) {
      for (const c of list) {
        const L = c.life;
        L.cooldown = Math.max(0, L.cooldown - 15);
        L.energy = Math.min(1, L.energy + 0.02);
        const mate = list.find((o) => o !== c);
        if (mate && (mate.x - c.x) ** 2 + (mate.y - c.y) ** 2 > 1600 && Math.random() < 0.3) { c.tx = mate.x + rand(-6, 6); c.ty = mate.y + rand(-6, 6); c.timer = 4; }
      }
    }
  }
}
