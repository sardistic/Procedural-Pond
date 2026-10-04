'use strict';
// Twenty-nine more things to build, each raised on the shape of one already in the pond (its form) in its own
// colours, with its own aura, gifts, water, stage and the animals that love it. Everything they do is data the
// pond already reads (aura, plankton, water, dawn pearls, essence and corruption, lures, glow at night).

const sm = (...hex) => mat(...hex);
// kind: label, form, pearls, essence, r (reach), size, habitat, tier, deepMin, desc, aura, gifts, glow, likes, mats.
const STRUCTURES2 = {
  // ---- the shallows ----
  coralhead: { form: 'shrine', label: 'Coral head', pearls: 110, r: 60, size: 9, habitat: 'salt', desc: 'a boulder of living coral: reef fish crowd around it, and the water calms',
    aura: { comfort: 0.1, aggression: -0.05 }, plankton: 0.5, likes: ['clown', 'damselfish', 'butterflyfish', 'parrotfish', 'goby', 'wrasse'],
    mats: { crystal: sm('#6a2a3a', '#a04a5a', '#e07a7a', '#ffc0b0'), basalt: sm('#4a3a30', '#6e5a48', '#94806a', '#baa890') } },
  lilyraft: { form: 'seedbed', label: 'Lily raft', pearls: 70, r: 48, size: 10, habitat: 'fresh', desc: 'a floating raft that lily pads and duckweed root around: frogs and fry shelter under it',
    aura: { comfort: 0.06, fertility: 1.08 }, likes: ['frog', 'killifish', 'guppy', 'molly', 'gourami'], mats: { sprout: sm('#1e4a14', '#2e6e1e', '#4a9a2c', '#ff9ac8') } },
  bubblestone: { form: 'aerator', label: 'Bubble stone', pearls: 80, r: 66, size: 6, desc: 'a porous stone streaming fine bubbles: animals nearby age slower and the water is bright',
    aura: { aging: 0.9, comfort: 0.06 }, likes: ['tetra', 'rasbora', 'danio', 'platy'], mats: { steel: sm('#4a4a44', '#6e6e64', '#94948a', '#bcbcb0') } },
  cleanerstation: { form: 'shrine', label: 'Cleaning station', pearls: 140, r: 62, size: 8, habitat: 'salt', desc: 'a rock where cleaner wrasse and shrimp pick the parasites off visitors: animals nearby stay healthier and calmer',
    aura: { comfort: 0.12, aggression: -0.15, aging: 0.92 }, likes: ['cleaner', 'shrimp', 'grouper', 'triggerfish', 'tang'], mats: { crystal: sm('#1a3a6a', '#2a5aa0', '#4a8ad0', '#9ad0ff') } },
  beaverlodge: { form: 'drowned', label: 'Beaver lodge', pearls: 130, r: 70, size: 18, habitat: 'fresh', desc: 'a dome of sticks and mud: shelter that calms the water and a nursery among the branches',
    aura: { aggression: -0.15, fertility: 1.12, comfort: 0.06 }, water: -0.6, likes: ['perch', 'pike', 'catfishcory', 'turtle', 'mudpuppy'],
    mats: { bark: sm('#2a1a0c', '#442c16', '#644422', '#86602e'), trunk: sm('#3a2814', '#5a3e1e', '#7a582a', '#9c7438') } },
  tidepool: { form: 'spring', label: 'Rock pool', pearls: 100, r: 54, size: 11, habitat: 'salt', desc: 'a ring of rocks holding its own little pool: small shore life breeds well here',
    aura: { fertility: 1.2, comfort: 0.05 }, plankton: 0.7, water: 1.2, likes: ['blenny', 'sculpin', 'chiton', 'urchincrab', 'hermit', 'starfish'],
    mats: { crystal: sm('#1a4a5a', '#2a6a7a', '#4a90a0', '#8ac8d0') } },
  mangroveroots: { form: 'drowned', label: 'Mangrove roots', pearls: 160, essence: 10, r: 74, size: 20, habitat: 'salt', desc: 'arching stilt roots over brackish water: the reef\'s nursery, where the young of everything hide',
    aura: { aggression: -0.18, fertility: 1.25, comfort: 0.08 }, water: 0.4, likes: ['mudskipper', 'goby', 'crab', 'pipefish', 'sculpin'],
    mats: { bark: sm('#2a1e12', '#463220', '#664a30', '#8a6844') } },
  // ---- the pools and the twilight ----
  oysterbed: { form: 'whalefall', label: 'Oyster reef', pearls: 170, essence: 10, r: 70, size: 18, habitat: 'salt', tier: 1, desc: 'a reef of oysters that filter the water clean and pay a pearl now and then',
    aura: { comfort: 0.1 }, plankton: 0.4, dawnPearls: 5, likes: ['crab', 'blenny', 'goby', 'starfish', 'cowrie'], mats: { bone: sm('#6a6a60', '#9a9a8a', '#c8c8b8', '#eeeee2') } },
  musselbank: { form: 'whalefall', label: 'Mussel bank', pearls: 150, essence: 10, r: 66, size: 16, habitat: 'fresh', tier: 1, desc: 'a bank of freshwater mussels: the water clears, bitterling lay their eggs here, and pearls turn up',
    aura: { comfort: 0.08, fertility: 1.08 }, dawnPearls: 4, likes: ['bitterling', 'mussel', 'catfishcory', 'crayfish'], mats: { bone: sm('#1a2a3a', '#2a4058', '#40607e', '#6a8aa8') } },
  sunkenbell: { form: 'ship', label: 'Sunken bell', pearls: 190, essence: 15, r: 70, size: 14, tier: 2, desc: 'a church bell lost to the water: it rings in a storm, and the fish that shelter under it grow calm',
    aura: { aggression: -0.22, comfort: 0.1 }, dawnPearls: 3, likes: ['eel', 'koi', 'grouper', 'bowfin', 'bellcarp'],
    mats: { wood: sm('#4a3a10', '#806418', '#c09a28', '#f0d060'), woodDark: sm('#2a2008', '#4a3a10', '#6a5418', '#8a7020'), woodLight: sm('#6a5418', '#a08426', '#d0b03a', '#ffe070') } },
  kelpcathedral: { form: 'kelp', label: 'Kelp cathedral', pearls: 220, essence: 30, r: 82, size: 18, habitat: 'salt', tier: 2, desc: 'a towering kelp stand, lit through from above: a nursery and a calm for the whole twilight',
    aura: { aggression: -0.25, fertility: 1.25, comfort: 0.1 }, water: 1, plankton: 0.7, likes: ['opah', 'cuttlefish', 'sargassum', 'grouper', 'bullkelp'],
    mats: { kelp: sm('#2a3a08', '#465e10', '#668a1c', '#90b83a'), kelpBlade: sm('#3a4a0c', '#5e761a', '#86a02c', '#b4cc50') } },
  sunkenlog: { form: 'drowned', label: 'Sunken log', pearls: 90, r: 58, size: 14, habitat: 'fresh', tier: 1, desc: 'a fallen trunk grown over with moss: catfish and crayfish make their homes beneath it',
    aura: { aggression: -0.1, comfort: 0.06 }, water: -0.4, likes: ['catfishcory', 'crayfish', 'mudpuppy', 'pleco', 'loach'],
    mats: { bark: sm('#1e2e14', '#2e461e', '#44622a', '#628a3c') } },
  glowreef: { form: 'grotto', label: 'Glowing reef', pearls: 240, essence: 40, r: 68, size: 12, habitat: 'salt', tier: 2, deepMin: 0.3, glow: true, desc: 'coral that glows blue in the twilight: deep fish gather in its light, and it pays essence each dawn',
    aura: { comfort: 0.14, light: 0.2 }, plankton: 0.5, dawnEssence: 3, likes: ['lanternfish', 'hatchetfish', 'bristlemouth', 'midshipman'],
    mats: { crystal: sm('#1a3a8a', '#2a5ac8', '#4a8af0', '#a8d8ff'), deepCrystal: sm('#1a3a8a', '#2a5ac8', '#4a8af0', '#a8d8ff') } },
  // ---- the midnight and the cave ----
  methaneseep: { form: 'smoker', label: 'Cold seep', pearls: 240, essence: 40, r: 66, size: 12, habitat: 'salt', tier: 3, deepMin: 0.4, desc: 'methane bubbling up through the mud, with mussels and tube worms living on it: food for the deep, essence each dawn',
    aura: { fertility: 1.25, comfort: 0.08 }, plankton: 0.9, dawnEssence: 5, water: 1.5, likes: ['yeticrab', 'grenadier', 'isopod', 'fangtooth'],
    mats: { smoke: sm('#1a1a14', '#2a2a20', '#3a3a2e', '#4e4e40'), plume: sm('#6a6a50', '#9a9a78', '#c8c8a0', '#eeeec8') } },
  stalagmites: { form: 'grotto', label: 'Stalagmite hall', pearls: 230, essence: 40, r: 66, size: 12, habitat: 'fresh', tier: 3, deepMin: 0.4, desc: 'pillars of dripstone rising in the dark: cave life rests easy here, and essence gathers each dawn',
    aura: { comfort: 0.16, aging: 0.9 }, plankton: 0.4, dawnEssence: 5, water: -1.5, likes: ['blindcrayfish', 'cavecatfish', 'isopodcave', 'olm', 'cavefish'],
    mats: { crystal: sm('#4a4034', '#6e6250', '#948870', '#d0c4a8'), deepCrystal: sm('#4a4034', '#6e6250', '#948870', '#d0c4a8') } },
  bioluminbloom: { form: 'lantern', label: 'Glow bloom', pearls: 260, essence: 50, r: 76, size: 10, tier: 3, deepMin: 0.4, glow: true, desc: 'a cloud of glowing plankton anchored to a stone: it draws deep life up toward it',
    aura: { comfort: 0.1, light: 0.3 }, lure: 1, plankton: 1.2, likes: ['stoplight', 'helmetjelly', 'cavejelly', 'bristlemouth'],
    mats: { ember: sm('#0a3a5a', '#1a6a8a', '#3aa0c0', '#9af0ff') } },
  // ---- the abyss and the cathedral ----
  hydrothermal: { form: 'vent', label: 'Hydrothermal field', pearls: 300, essence: 60, r: 80, size: 14, habitat: 'salt', tier: 4, deepMin: 0.55, desc: 'a field of shimmering vents: the deep\'s richest ground, breeding everything near it and paying essence',
    aura: { fertility: 1.4, aggression: 0.05 }, plankton: 1.4, dawnEssence: 8, water: 2.5, likes: ['yeticrab', 'abyssworm', 'anglerwhip', 'telescope'] },
  pewroots: { form: 'rootcathedral', label: 'Drowned pews', pearls: 300, essence: 60, r: 78, size: 16, habitat: 'fresh', tier: 4, deepMin: 0.55, desc: 'rows of drowned church pews under the black water: a quiet where the cathedral\'s animals rest, and essence each dawn',
    aura: { comfort: 0.15, aggression: -0.12 }, dawnEssence: 9, likes: ['psalmfish', 'cathedralgar', 'votivecrab', 'censerjelly'],
    mats: { bark: sm('#2a1a10', '#46301c', '#684a2c', '#8e6a40') } },
  manganese: { form: 'brinepool', label: 'Nodule field', pearls: 320, essence: 70, r: 70, size: 14, habitat: 'salt', tier: 4, deepMin: 0.6, desc: 'black metal nodules strewn over the abyss floor, grown a millimetre in a million years: essence each dawn',
    aura: { comfort: 0.05 }, dawnEssence: 12, likes: ['xenophyo', 'grenadier', 'hadalsnail'], mats: { basalt: sm('#0a0a0c', '#16161a', '#24242a', '#3a3a44') } },
  // ---- the trench and the crypts ----
  trenchwall: { form: 'spire', label: 'Trench wall', pearls: 380, essence: 90, r: 80, size: 14, habitat: 'salt', tier: 5, deepMin: 0.65, desc: 'a sheer wall dropping out of sight: hadal life clings to it, and essence gathers each dawn',
    aura: { fertility: 1.2, aggression: 0.05 }, dawnEssence: 16, likes: ['hadalsnail', 'trenchjelly', 'amphipod', 'cuskeel'], mats: { stone: sm('#14141a', '#24242e', '#383844', '#505060') } },
  catacomb: { form: 'ossuary', label: 'Catacomb', pearls: 360, essence: 90, r: 76, size: 16, habitat: 'fresh', tier: 5, deepMin: 0.65, desc: 'flooded tunnels lined with niches: the crypts\' animals breed here, and it pays essence and a little of the mark',
    aura: { fertility: 1.15 }, dawnEssence: 14, dawnCorruption: 2, likes: ['ossuarycrab', 'cryptlamprey', 'mourningfish', 'reliquaryfish'] },
  // ---- the black below and the roots ----
  abyssgarden: { form: 'spire', label: 'Sponge garden', pearls: 420, essence: 110, r: 82, size: 14, habitat: 'salt', tier: 6, deepMin: 0.7, glow: true, desc: 'glass sponges thousands of years old, in a garden on the black floor: calm, and essence each dawn',
    aura: { comfort: 0.2, aging: 0.85 }, dawnEssence: 22, likes: ['vampjelly', 'blackdevil', 'abyssworm'], mats: { stone: sm('#5a6a7a', '#8a9aaa', '#bccad6', '#eef6ff') } },
  rootheart: { form: 'rootcathedral', label: 'Root heart', pearls: 420, essence: 110, r: 82, size: 18, habitat: 'fresh', tier: 6, deepMin: 0.7, glow: true, desc: 'where the world\'s roots knot together around a slow green light: everything near it lives longer',
    aura: { comfort: 0.15, aging: 0.8 }, dawnEssence: 24, likes: ['rootfish', 'tunnelbeetle', 'deeplungfish', 'rootcrawler'], mats: { bark: sm('#1a2a10', '#2a4418', '#3e6224', '#5a8a34') } },
  // ---- the drowned city ----
  fountain: { form: 'shrine', label: 'Drowned fountain', pearls: 480, essence: 130, r: 80, size: 12, tier: 7, deepMin: 0.75, glow: true, desc: 'a city fountain still welling, far under the sea: the city\'s animals gather and breed around it',
    aura: { comfort: 0.18, fertility: 1.2, light: 0.2 }, plankton: 0.8, dawnEssence: 20, likes: ['mosaicfish', 'scribefish', 'bellcarp', 'colonnade', 'lampjelly'],
    mats: { crystal: sm('#4a5a6a', '#7a8a9a', '#aab8c4', '#e0ecf4') } },
  streetlamp: { form: 'lantern', label: 'Drowned streetlamp', pearls: 450, essence: 120, r: 84, size: 8, tier: 7, deepMin: 0.75, glow: true, desc: 'an iron lamp still lit on a drowned street: it calls deep life up out of the dark',
    aura: { light: 0.35 }, lure: 2, dawnEssence: 16, likes: ['lampjelly', 'gargoylecrab', 'scribefish'], mats: { ember: sm('#6a4a0a', '#a07a14', '#e0b02a', '#fff08a') } },
  // ---- the dreaming dark and beyond ----
  dreamstone: { form: 'idol', label: 'Dreamstone', pearls: 600, essence: 200, r: 96, size: 12, tier: 8, deepMin: 0.8, glow: true, unique: true, desc: 'a stone that hums when the pond sleeps: it draws the dreaming up, and pays in essence and the mark',
    aura: { comfort: -0.05, light: 0.2 }, lure: 3, dawnEssence: 40, dawnCorruption: 8, likes: ['sleeperjelly', 'omenfish', 'dreamcrawler', 'dreamer'],
    mats: { idol: sm('#1a1430', '#2a2048', '#3e3266', '#5a4a8a'), idolEye: sm('#5a2a9a', '#8a4ad8', '#b88aff', '#ecdcff') } },
  fossilwall: { form: 'ossuary', label: 'Fossil wall', pearls: 500, essence: 140, r: 80, size: 16, tier: 9, deepMin: 0.6, desc: 'a cliff of stone laid down when the deep past was alive: its creatures come back to it, and fossils work loose',
    aura: { comfort: 0.1, fertility: 1.15 }, dawnEssence: 24, likes: ['cladoselache', 'marrella', 'sacabambaspis', 'hallucigenia', 'trilobite', 'bothriolepis'],
    mats: { bone: sm('#4a4234', '#6e6450', '#948870', '#bab092') } },
  prism: { form: 'spire', label: 'Prism spire', pearls: 900, essence: 300, r: 96, size: 14, tier: 12, deepMin: 0.7, glow: true, desc: 'a spire of something like glass that splits the dark into colours: the reach\'s creatures circle it',
    aura: { comfort: 0.1, light: 0.4 }, lure: 2, dawnEssence: 60, dawnCorruption: 6, likes: ['prismfish', 'echofish', 'nullbell', 'anglewalker', 'glasseel'],
    mats: { stone: sm('#3a2a6a', '#6a4ab0', '#a07ae0', '#e8d8ff') } },
  hollowgate: { form: 'brinepool', label: 'Hollow pool', pearls: 1000, essence: 340, r: 90, size: 14, tier: 13, deepMin: 0.7, glow: true, desc: 'a pool of water darker than the water around it, with no bottom anyone has found: essence, the mark, and the strangest visitors',
    aura: { comfort: -0.08 }, lure: 3, dawnEssence: 80, dawnCorruption: 12, likes: ['hollowcarp', 'starmaw', 'thoughtjelly', 'hollowwalker', 'mirrorfish'],
    mats: { basalt: sm('#020204', '#06060c', '#0c0c18', '#16162a') } },
};

// A structure raised on another's form: the form builds and draws it, with its own colours swapped in.
function smSwap(def, fn) {
  const M = def.mats;
  if (!M) return fn();
  const old = {};
  for (const k in M) { old[k] = SM[k]; SM[k] = M[k]; }
  try { return fn(); } finally { for (const k in M) SM[k] = old[k]; }
}
for (const [k, def] of Object.entries(STRUCTURES2)) {
  if (STRUCTURES[k] || !STRUCTURES[def.form] || !BUILD[def.form]) { console.warn(`structures2: ${k} skipped`); continue; }
  const base = STRUCTURES[def.form];
  STRUCTURES[k] = { wet: true, essence: 0, ...def, form: def.form, r: def.r || base.r, size: def.size || base.size };
  BUILD[k] = (s, world) => BUILD[def.form](s, world);
  BAKE[k] = (r, s, next, world) => smSwap(def, () => BAKE[def.form](r, s, next, world));
  if (DRAW[def.form]) DRAW[k] = (r, s, t, world) => smSwap(def, () => DRAW[def.form](r, s, t, world));
  STRUCT_LIKES[k] = def.likes || [];
  LIKE_LABEL[k] = def.label.toLowerCase();
  STRUCT_CODES.push(k); // (append-only: links)
}
