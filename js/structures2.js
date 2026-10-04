'use strict';
// Twenty-nine more things to build, each with its own model (SHAPES2, below; its form is the older build it's kin
// to), its own aura, gifts, water, stage and the animals that love it. Everything they do is data the pond already
// reads (aura, plankton, water, dawn pearls, essence and corruption, lures, glow at night).

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

// ---- their own shapes ----------------------------------------------------------------------------------
// Each one's own model, seen from above as everything in the pond is: build lays it out (from its seed, so a saved
// pond rebuilds it the same), bake draws the solid parts into the floor, draw adds what moves or glows.
const S2 = {
  rock: sm('#2a2a2e', '#3e3e44', '#56565e', '#72727c'), coralP: sm('#6a2a3a', '#a04a5a', '#e07a7a', '#ffc0b0'), coralO: sm('#6a3a10', '#a85a18', '#e8862a', '#ffc070'),
  coralV: sm('#3a1a5a', '#5a2a8a', '#8a4ac0', '#c890f0'), brain: sm('#5a4a1a', '#8a7a2a', '#bcaa48', '#e8dc8a'), raft: sm('#2a1e10', '#46321c', '#6a4e2c', '#8e6c40'),
  pad: sm('#143a14', '#1e5a1e', '#2e8a2c', '#5ab848'), bloom: sm('#8a2a5a', '#c84a8a', '#ff8ac8', '#ffe0f0'), pore: sm('#2a2a26', '#4a4a44', '#6e6e64', '#94948a'),
  bubble: sm('#6a8a9a', '#9ac0d0', '#c8e8f0', '#ffffff'), shrimp: sm('#8a1a1a', '#c83a2a', '#ff6a4a', '#ffe0d0'), wrasse: sm('#0a1a4a', '#1a3a9a', '#3a7aff', '#d0e8ff'),
  stick: sm('#3a2410', '#5a3a1c', '#7c5630', '#9e7646'), peeled: sm('#6a5634', '#94784a', '#bca06a', '#e0c890'), mud: sm('#0e0a06', '#1a120a', '#261c10', '#342618'), pool: sm('#0a3a4a', '#1a5a6a', '#3a8a9a', '#8ad0e0'),
  star: sm('#8a2a0a', '#c84a1a', '#f07a3a', '#ffb070'), barn: sm('#6a6a60', '#9a9a8a', '#c8c8b8', '#eeeee2'), mroot: sm('#2a1e12', '#463220', '#664a30', '#8a6844'),
  oyster: sm('#4a4a42', '#76766a', '#a4a496', '#d4d4c6'), pearl: sm('#b8b0a0', '#e0d8c8', '#f8f2e8', '#ffffff'), mussel: sm('#0a0e1a', '#18203a', '#2a3a5a', '#5a6a8a'),
  gravel: sm('#3a3426', '#5a5238', '#7a704e', '#9a9068'), bronze: sm('#3a2a0a', '#6a4e14', '#a07a22', '#d8b040'), verd: sm('#1a4a3a', '#2a6a54', '#4a9a7a', '#8ad0b0'),
  beam: sm('#1e140a', '#34241a', '#4e3826', '#6a5038'), kelp: sm('#2a3a08', '#465e10', '#668a1c', '#90b83a'), kelpBlade: sm('#3a4a0c', '#5e761a', '#86a02c', '#b4cc50'),
  log: sm('#1e140a', '#33231a', '#4c3626', '#664a34'), ring: sm('#5a4428', '#7a5e3a', '#9a7a50', '#bc9a6a'), moss: sm('#1e2e14', '#2e461e', '#44622a', '#628a3c'),
  fungus: sm('#6a4a1a', '#9a7030', '#c89a4a', '#f0c870'), glowB: sm('#1a3a8a', '#2a5ac8', '#4a8af0', '#a8d8ff'), glowTip: sm('#4a8ad0', '#8ac8ff', '#c8f0ff', '#ffffff'),
  bact: sm('#8a8a7a', '#b8b8a4', '#e0e0cc', '#fafaf0'), worm: sm('#8a8a82', '#b4b4aa', '#d8d8ce', '#f6f6ee'), plumeR: sm('#8a0e1a', '#c01e2a', '#ee3a3a', '#ff8a7a'),
  drip: sm('#4a4034', '#6e6250', '#948870', '#d0c4a8'), dripWet: sm('#3a4a4a', '#5a6e6e', '#80989a', '#b8d0d0'), bloomG: sm('#0a3a5a', '#1a6a8a', '#3aa0c0', '#9af0ff'),
  basalt: sm('#0e0e12', '#1c1c22', '#2c2c34', '#40404a'), sulfur: sm('#6a5a0a', '#a08a14', '#d8c02a', '#fff07a'), emberC: sm('#6a1a06', '#b8400a', '#f07a1a', '#ffd070'),
  pew: sm('#140a04', '#26160a', '#3a2412', '#4e341c'), pewTop: sm('#4a3220', '#6e4c30', '#946a44', '#b88c5c'), altar: sm('#3a3a36', '#56564e', '#76766c', '#9a9a8e'),
  root: sm('#1a120a', '#2a1e12', '#3e2c1a', '#544028'), nodule: sm('#060608', '#0e0e12', '#1a1a20', '#2c2c36'), silt: sm('#1a1a1c', '#26262a', '#343438', '#46464c'),
  wall: sm('#0e0e14', '#1c1c26', '#2e2e3a', '#464656'), pit: sm('#000000', '#020204', '#040408', '#08080e'), snail: sm('#4a4a5a', '#6a6a7e', '#9090a8', '#c0c0d8'),
  crypt: sm('#2a2622', '#3e3832', '#56504a', '#726a62'), skull: sm('#8a8274', '#b2aa98', '#d6cebc', '#f4eee0'), glass: sm('#5a6a7a', '#8a9aaa', '#bccad6', '#eef6ff'),
  glassGlow: sm('#6a9ac0', '#9ad0f0', '#d0f0ff', '#ffffff'), rootG: sm('#1a2a10', '#2a4418', '#3e6224', '#5a8a34'), heart: sm('#1a6a2a', '#3aa04a', '#7ae07a', '#d0ffd0'),
  marble: sm('#4a5a6a', '#7a8a9a', '#aab8c4', '#e0ecf4'), water: sm('#1a4a6a', '#2a6a8a', '#5a9ac0', '#b0e0ff'), iron: sm('#14161a', '#22262c', '#343a42', '#4e5660'),
  lamp: sm('#8a5a0a', '#d0961a', '#ffd04a', '#fff8c0'), cobble: sm('#2a2a2a', '#3e3c3a', '#565250', '#706a66'), dream: sm('#1a1430', '#2a2048', '#3e3266', '#5a4a8a'),
  rune: sm('#5a2a9a', '#8a4ad8', '#b88aff', '#ecdcff'), strata: sm('#4a4234', '#6e6450', '#948870', '#bab092'), strata2: sm('#2a241a', '#40382a', '#5a503e', '#766c56'),
  fossil: sm('#b0a488', '#d4c8aa', '#f0e6cc', '#fffaf0'), hollow: sm('#000000', '#010103', '#030308', '#06060e'), obsid: sm('#08080e', '#12121c', '#20202e', '#343448'),
  starDot: sm('#8a8ac0', '#b0b0e8', '#d8d8ff', '#ffffff'),
  prismC: [sm('#6a1a2a', '#b02a4a', '#f05a7a', '#ffc0d0'), sm('#6a4a0a', '#b08a1a', '#f0c83a', '#fff0a0'), sm('#1a5a2a', '#2a9a4a', '#5ad07a', '#c0ffd0'), sm('#1a3a8a', '#2a5ac8', '#5a9af0', '#c0e0ff'), sm('#4a1a8a', '#7a3ac8', '#a86af0', '#e8d0ff')],
};
// (Points in a structure's own frame: u along its heading, v across.)
const at2 = (s, u, v) => { const c = Math.cos(s.ang || 0), n = Math.sin(s.ang || 0); return [s.x + c * u - n * v, s.y + n * u + c * v]; };
const bar2 = (r, s, u0, v0, u1, v1, rad, z0, z1, hs, m, id) => { const [ax, ay] = at2(s, u0, v0), [bx, by] = at2(s, u1, v1); r.tube(ax, ay, rad, z0, bx, by, rad, z1, hs, m, id); };
const ring2 = (n, f) => { for (let k = 0; k < n; k++) f(k / n * TAU, k); };

const SHAPES2 = {
  coralhead: {
    build(s) { s.h = 7; s.heads = Array.from({ length: randi(6, 9) }, () => { const a = rand(0, TAU), d = rand(0, 6); return { x: Math.cos(a) * d, y: Math.sin(a) * d, R: rand(2, 3.8), k: randi(0, 3), a: rand(0, TAU) }; }); },
    bake(r, s, next) {
      const rid = next(S2.rock), cid = next(S2.coralP);
      r.ellipsoid(s.x, s.y, 8, 7, 0.4, 0, 3, S2.rock, rid);
      for (const c of s.heads) {
        const x = s.x + c.x, y = s.y + c.y;
        if (c.k === 0) r.ellipsoid(x, y, c.R, c.R, 0, 2.5, c.R * 0.9, (lx, ly) => (Math.sin((lx * 3 + Math.sin(ly * 4) * 0.6) * 5) > 0.2 ? S2.brain : S2.coralO), cid); // (brain coral: its grooves)
        else if (c.k === 1) for (let b = 0; b < 5; b++) { const a = c.a + b * 1.25; r.tube(x, y, 0.8, 3, x + Math.cos(a) * c.R * 1.5, y + Math.sin(a) * c.R * 1.5, 0.4, 6, 0.9, S2.coralO, cid); } // (staghorn)
        else if (c.k === 2) r.ellipsoid(x, y, c.R * 1.4, c.R, c.a, 3.5, 0.6, (lx, ly) => ((lx * lx + ly * ly) * 6 % 1 < 0.25 ? S2.coralV : S2.coralP), cid); // (a plate)
        else for (let b = 0; b < 7; b++) r.dot(x + rand(-1.5, 1.5), y + rand(-1.5, 1.5), 4.5, S2.coralP, cid); // (polyps)
      }
    },
  },
  lilyraft: {
    build(s) { s.ang = rand(0, PI); s.h = 3; s.pads = Array.from({ length: randi(9, 13) }, () => { const a = rand(0, TAU), d = rand(7, 12); return [Math.cos(a) * d, Math.sin(a) * d, rand(2, 3.4), rand(0, TAU), Math.random() < 0.3]; }); },
    bake(r, s, next) {
      const id = next(S2.raft), pid = next(S2.pad);
      // Lashed poles, two crossbars, and pads rooted round it.
      for (let k = -3; k <= 3; k++) bar2(r, s, -8, k * 1.6, 8 + (k % 2), k * 1.6, 0.8, 2, 2, 0.9, S2.raft, id);
      for (const u of [-5, 5]) bar2(r, s, u, -6.5, u, 6.5, 0.6, 3, 3, 0.9, S2.stick, id);
      for (const [px, py, R, a, fl] of s.pads) {
        r.ellipsoid(s.x + px, s.y + py, R, R, a, 1.8, 0.3, (lx, ly) => (Math.abs(Math.atan2(ly, lx)) < 0.35 ? null : S2.pad), pid);
        if (fl) { r.ellipsoid(s.x + px, s.y + py, 1.1, 1.1, 0, 2.2, 0.8, S2.bloom, pid); }
      }
    },
  },
  bubblestone: {
    build(s) { s.h = 5; },
    bake(r, s, next) {
      const id = next(S2.pore);
      ring2(9, (a) => r.ellipsoid(s.x + Math.cos(a) * 6, s.y + Math.sin(a) * 6, 1.2, 1, a, 0, 1, S2.gravel, id));
      r.ellipsoid(s.x, s.y, 4, 3.4, 0.6, 0, 4.5, (lx, ly, px, py) => (vnoise(px * 0.9, py * 0.9, 7) > 0.62 ? S2.basalt : S2.pore), id);
    },
    draw(r, s, t) {
      if (s.bid == null) { s.bid = newId(hexToInt('#3a5a6a')); FADE[s.bid] = 1; }
      for (let i = 0; i < 9; i++) {
        const ph = (t * 0.6 + i / 9) % 1, a = i * 2.4;
        r.alpha = 1 - ph * 0.7;
        r.dot(s.x + Math.cos(a) * 1.5 + Math.sin(t * 3 + i) * ph, s.y + Math.sin(a) * 1.5, 5 + ph * 18, S2.bubble, s.bid);
      }
      r.alpha = 1;
    },
  },
  cleanerstation: {
    build(s) { s.h = 6; s.shrimp = Array.from({ length: 4 }, () => [rand(-3, 3), rand(-3, 3), rand(0, TAU)]); },
    bake(r, s, next) {
      const id = next(S2.rock), sid = next(S2.shrimp);
      r.ellipsoid(s.x, s.y, 7.5, 6, 0.3, 0, 4, (lx, ly, px, py) => (lx * lx + ly * ly < 0.45 ? S2.rock : vnoise(px * 0.5, py * 0.5, 3) > 0.6 ? S2.barn : S2.rock), id);
      for (const [ox, oy, a] of s.shrimp) {
        r.tube(s.x + ox, s.y + oy, 0.5, 4.2, s.x + ox + Math.cos(a) * 2.2, s.y + oy + Math.sin(a) * 2.2, 0.35, 4.2, 0.9, (u) => ((u * 4) % 1 < 0.5 ? S2.shrimp : S2.barn), sid);
      }
    },
    draw(r, s, t) {
      // Cleaner wrasse, circling for the next client.
      for (let i = 0; i < 2; i++) {
        const a = t * (0.8 + i * 0.3) + i * 3, x = s.x + Math.cos(a) * (9 + i * 2), y = s.y + Math.sin(a) * (7 + i * 2), h = Math.atan2(Math.cos(a) * 7, -Math.sin(a) * 9);
        r.tube(x, y, 0.6, 5, x - Math.cos(h) * 2.4, y - Math.sin(h) * 2.4, 0.4, 5, 0.8, (u, v) => (Math.abs(v) < 0.3 ? S2.basalt : S2.wrasse), s.id);
      }
    },
  },
  beaverlodge: {
    build(s) { s.h = 10; s.door = rand(0, TAU); s.sticks = Array.from({ length: 70 }, () => ({ a: rand(0, TAU), d: Math.sqrt(Math.random()) * 13, l: rand(6, 12), t: rand(0, PI), pale: Math.random() < 0.4 })); },
    bake(r, s, next) {
      const mid = next(S2.mud), id = next(S2.stick);
      r.ellipsoid(s.x, s.y, 14, 13, 0, 0, 8, S2.mud, mid);
      // Sticks laid over the dome, each at the height of the dome where it lies; the door a dark gap at its foot.
      const dome = (x, y) => 8 * Math.sqrt(Math.max(0, 1 - ((x - s.x) / 14) ** 2 - ((y - s.y) / 13) ** 2));
      for (const k of s.sticks) {
        const cx = s.x + Math.cos(k.a) * k.d, cy = s.y + Math.sin(k.a) * k.d, ax = cx - Math.cos(k.t) * k.l / 2, ay = cy - Math.sin(k.t) * k.l / 2, bx = cx + Math.cos(k.t) * k.l / 2, by = cy + Math.sin(k.t) * k.l / 2;
        r.tube(ax, ay, 0.6, dome(ax, ay) + 0.3, bx, by, 0.5, dome(bx, by) + 0.3, 0.9, k.pale ? S2.peeled : S2.stick, id);
      }
      r.ellipsoid(s.x + Math.cos(s.door) * 13, s.y + Math.sin(s.door) * 12, 2.6, 1.8, s.door + PI / 2, 0.6, 1.2, S2.pit, id);
    },
  },
  tidepool: {
    build(s) { s.h = 4; s.n = randi(11, 14); s.stars = Array.from({ length: randi(1, 3) }, () => [rand(-4, 4), rand(-4, 4), rand(0, TAU)]); },
    bake(r, s, next) {
      const pid = next(S2.pool), id = next(S2.rock), lid = next(S2.star);
      r.ellipsoid(s.x, s.y, 8, 7, 0, 0.5, 0.3, (lx, ly) => ((lx * lx + ly * ly) * 4 % 1 < 0.12 ? S2.bubble : S2.pool), pid);
      ring2(s.n, (a, k) => { const R = 2.2 + hash2(k, 3, s.seed % 89) * 1.6; r.ellipsoid(s.x + Math.cos(a) * 9, s.y + Math.sin(a) * 8, R, R * 0.8, a, 0, R * 1.1, (lx, ly, px, py) => (vnoise(px, py, 5) > 0.66 ? S2.barn : S2.rock), id); });
      for (const [ox, oy, a] of s.stars) for (let k = 0; k < 5; k++) { const b = a + k / 5 * TAU; r.tube(s.x + ox, s.y + oy, 0.7, 1, s.x + ox + Math.cos(b) * 2.2, s.y + oy + Math.sin(b) * 2.2, 0.35, 1, 0.6, S2.star, lid); }
    },
  },
  mangroveroots: {
    build(s) { s.h = 16; s.trunks = Array.from({ length: randi(2, 3) }, () => ({ x: rand(-5, 5), y: rand(-5, 5), roots: randi(7, 10), a0: rand(0, TAU) })); },
    bake(r, s, next) {
      const id = next(S2.mroot);
      for (const T of s.trunks) {
        const tx = s.x + T.x, ty = s.y + T.y;
        r.ellipsoid(tx, ty, 2.6, 2.6, 0, 6, 10, S2.mroot, id);
        // Stilt roots arch out from high on the trunk and down into the mud, in two bends.
        for (let k = 0; k < T.roots; k++) {
          const a = T.a0 + k / T.roots * TAU + rand(-0.2, 0.2), L = rand(10, 17), mx = tx + Math.cos(a) * L * 0.45, my = ty + Math.sin(a) * L * 0.45;
          r.tube(tx, ty, 1, 12, mx, my, 0.8, 9, 0.9, S2.mroot, id);
          r.tube(mx, my, 0.8, 9, tx + Math.cos(a + 0.15) * L, ty + Math.sin(a + 0.15) * L, 0.6, 0, 0.9, S2.mroot, id);
        }
      }
    },
  },
  oysterbed: {
    build(s) { s.h = 4; s.ang = rand(0, PI); s.shells = Array.from({ length: 60 }, () => { const u = rand(-1, 1), v = rand(-1, 1) * (1 - u * u * 0.6); return [u * 15, v * 8, rand(1.4, 2.4), rand(0, TAU), Math.random() < 0.08]; }); },
    bake(r, s, next) {
      const id = next(S2.oyster);
      r.ellipsoid(s.x, s.y, 16, 9, s.ang, 0, 2, S2.gravel, id);
      for (const [u, v, R, a, open] of s.shells) {
        const [x, y] = at2(s, u, v), z = 2 * Math.sqrt(Math.max(0, 1 - (u / 16) ** 2 - (v / 9) ** 2));
        r.ellipsoid(x, y, R * 1.3, R, a, z, 0.9, (lx, ly) => (open && lx * lx + ly * ly < 0.3 ? S2.pit : ((lx * 4 + ly) % 1 + 1) % 1 < 0.3 ? S2.barn : S2.oyster), id);
        if (open) r.dot(x, y, z + 1, S2.pearl, id);
      }
    },
  },
  musselbank: {
    build(s) { s.h = 3; s.ang = rand(0, PI); s.clumps = Array.from({ length: randi(6, 8) }, () => [rand(-12, 12), rand(-5, 5), randi(5, 9)]); },
    bake(r, s, next) {
      const gid = next(S2.gravel), id = next(S2.mussel);
      r.ellipsoid(s.x, s.y, 15, 7, s.ang, 0, 1.4, (lx, ly, px, py) => (hash2(px, py, 3) > 0.8 ? S2.oyster : S2.gravel), gid);
      for (const [u, v, n] of s.clumps) for (let k = 0; k < n; k++) {
        const [x, y] = at2(s, u + rand(-2.5, 2.5), v + rand(-2, 2)), a = rand(0, TAU);
        r.ellipsoid(x, y, 1.8, 0.9, a, 1.4, 1, (lx) => (lx > 0.6 ? S2.barn : S2.mussel), id);
      }
    },
  },
  sunkenbell: {
    build(s) { s.ang = rand(0, TAU); s.h = 9; },
    bake(r, s, next) {
      const id = next(S2.bronze), bid = next(S2.beam);
      const shade = (u, v, px, py) => (vnoise(px * 0.35, py * 0.35, s.seed % 31) > 0.72 ? S2.verd : ((u * 5) % 1 < 0.12 && u > 0.3 ? S2.beam : S2.bronze));
      // The bell lies on its side: crown to lip, flaring, ridged bands round it, and its mouth turned toward you as
      // a dark hollow, the clapper lying in it.
      const [cx, cy] = at2(s, -7, 0), [lx, ly] = at2(s, 5.5, 0), [mx, my] = at2(s, 7, 0);
      r.tube(cx, cy, 3.4, 1, lx, ly, 7.4, 1, 0.9, shade, id);
      r.ellipsoid(mx, my, 2.4, 8, s.ang, 0.5, 7.5, (u, v) => (u * u + v * v < 0.5 ? S2.pit : S2.bronze), id);
      const [kx, ky] = at2(s, 7.6, 1.6); r.ellipsoid(kx, ky, 1.7, 1.7, 0, 2.5, 1.7, S2.beam, id);
      const [ox, oy] = at2(s, -10.5, 0); r.ellipsoid(ox, oy, 2, 2.8, s.ang, 2, 2.2, (u, v) => (u * u + v * v < 0.3 ? null : S2.bronze), id);
      // Its broken yoke beside it.
      bar2(r, s, -8, 9, 7, 7.5, 1.1, 0.8, 0.8, 0.9, S2.beam, bid);
      bar2(r, s, 7, 7.5, 9, 4, 0.9, 0.6, 0.6, 0.9, S2.beam, bid);
    },
  },
  kelpcathedral: {
    // Two rows of giant kelp make a nave, light coming down its aisle.
    build(s) { s.ang = rand(0, PI); s.h = 24; s.stalks = []; for (const side of [-1, 1]) for (let k = 0; k < 6; k++) s.stalks.push({ u: -15 + k * 6 + rand(-1, 1), v: side * (7 + rand(-0.8, 0.8)), h: rand(36, 48) * (1 - Math.abs(k - 2.5) * 0.06), ph: rand(0, TAU) }); },
    bake(r, s, next) {
      const id = next(S2.rock);
      for (const st of s.stalks) { const [x, y] = at2(s, st.u, st.v); r.ellipsoid(x, y, 2, 1.7, st.ph, 0, 1.5, S2.rock, id); }
      const [ax, ay] = at2(s, -18, 0), [bx, by] = at2(s, 18, 0); r.tube(ax, ay, 2.4, 0, bx, by, 2.4, 0, 0.15, S2.gravel, id);
    },
    draw(r, s, t, world) {
      const cur = world.current;
      for (const st of s.stalks) {
        let [px, py] = at2(s, st.u, st.v), pz = 0;
        const lean = st.v > 0 ? -1 : 1; // (each row leans in over the aisle, like an arch)
        for (let k = 1; k <= 9; k++) {
          const f = k / 9, sway = Math.sin(t * 0.7 + st.ph + k * 0.4) * 0.5 * f;
          const [ix, iy] = at2(s, st.u, st.v + lean * f * f * 5);
          const nx = ix + sway + cur.x * 2 * f, ny = iy + sway * 0.5 + cur.y * 2 * f, nz = st.h * f;
          r.tube(px, py, lerp(1, 0.6, f), pz, nx, ny, lerp(1, 0.6, f + 0.1), nz, 0.8, S2.kelp, s.id);
          if (k % 2 === 1) { const a = st.ph + k * 1.9 + Math.sin(t + k) * 0.2; r.ellipsoid(nx + Math.cos(a) * 2.2, ny + Math.sin(a) * 2.2, 3.6, 1.1, a, nz - 1, 0.4, S2.kelpBlade, s.id); }
          px = nx; py = ny; pz = nz;
        }
      }
    },
  },
  sunkenlog: {
    build(s) { s.ang = rand(0, TAU); s.h = 5; s.L = rand(28, 34); s.fungi = Array.from({ length: randi(3, 5) }, () => [rand(-0.4, 0.4), Math.random() < 0.5 ? -1 : 1]); },
    bake(r, s, next) {
      const id = next(S2.log), fid = next(S2.fungus), L = s.L;
      const bark = (u, v, px, py) => (vnoise(px * 0.3, py * 0.3, s.seed % 43) > 0.6 ? S2.moss : ((u * 16) % 1 < 0.15 ? S2.root : S2.log));
      const [ax, ay] = at2(s, -L / 2, 0), [bx, by] = at2(s, L / 2, 0);
      r.tube(ax, ay, 3.6, 0, bx, by, 3.2, 0, 0.9, bark, id);
      // The cut end with its rings, a broken branch, and shelf fungus on its sides.
      const [ex, ey] = at2(s, L / 2 + 0.6, 0); r.ellipsoid(ex, ey, 1, 3.2, s.ang, 0.4, 3, (u, v) => ((Math.hypot(u * 0.4, v) * 4) % 1 < 0.35 ? S2.log : S2.ring), id);
      bar2(r, s, -L * 0.15, 2.5, -L * 0.05, 10, 1, 2, 4, 0.9, S2.log, id);
      for (const [f, side] of s.fungi) { const [fx, fy] = at2(s, f * L, side * 3.6); r.ellipsoid(fx, fy, 1.8, 1.1, s.ang, 2.4, 0.5, S2.fungus, fid); }
    },
  },
  glowreef: {
    build(s) { s.h = 8; s.fans = Array.from({ length: randi(5, 7) }, () => { const a = rand(0, TAU), d = rand(0, 6); return { x: Math.cos(a) * d, y: Math.sin(a) * d, a: rand(0, TAU), n: randi(4, 6), L: rand(4, 7) }; }); },
    bake(r, s, next) {
      const id = next(S2.rock);
      r.ellipsoid(s.x, s.y, 8, 7, 0.2, 0, 2.5, S2.rock, id);
    },
    draw(r, s, t) {
      // Branching fans of blue coral, the tips glowing in a slow wave.
      for (const f of s.fans) {
        const x = s.x + f.x, y = s.y + f.y;
        for (let b = 0; b < f.n; b++) {
          const a = f.a + (b - f.n / 2) * 0.45, mx = x + Math.cos(a) * f.L * 0.55, my = y + Math.sin(a) * f.L * 0.55, ex = x + Math.cos(a + 0.2) * f.L, ey = y + Math.sin(a + 0.2) * f.L;
          r.tube(x, y, 0.7, 2.5, mx, my, 0.5, 5, 0.9, S2.glowB, s.id);
          r.tube(mx, my, 0.5, 5, ex, ey, 0.35, 7, 0.9, S2.glowB, s.id);
          if (Math.sin(t * 1.5 + b + f.a * 3) > -0.2) r.dot(ex, ey, 7.5, S2.glowTip, s.id);
        }
      }
    },
  },
  methaneseep: {
    build(s) { s.h = 4; s.vents = Array.from({ length: 4 }, () => [rand(-6, 6), rand(-6, 6)]); s.worms = Array.from({ length: 16 }, () => [rand(-9, 9), rand(-9, 9), rand(2, 4)]); },
    bake(r, s, next) {
      const id = next(S2.mud), bid = next(S2.bact), wid = next(S2.worm);
      r.ellipsoid(s.x, s.y, 12, 10, 0.5, 0, 2.5, (lx, ly, px, py) => (vnoise(px * 0.25, py * 0.25, s.seed % 37) > 0.55 ? S2.bact : S2.mud), id);
      for (const [ox, oy] of s.vents) r.ellipsoid(s.x + ox, s.y + oy, 1.4, 1.4, 0, 2, 0.4, S2.pit, bid);
      for (const [ox, oy] of s.vents) for (let k = 0; k < 6; k++) { const a = k; r.ellipsoid(s.x + ox + Math.cos(a) * 2.6, s.y + oy + Math.sin(a) * 2.6, 1.2, 0.6, a, 2, 0.8, S2.mussel, bid); }
      for (const [ox, oy, h] of s.worms) { r.tube(s.x + ox, s.y + oy, 0.4, 2, s.x + ox + 0.4, s.y + oy - 0.4, 0.35, 2 + h, 0.9, S2.worm, wid); r.dot(s.x + ox + 0.4, s.y + oy - 0.4, 2.5 + h, S2.plumeR, wid); }
    },
    draw(r, s, t, world) {
      if (s.bid == null) { s.bid = newId(hexToInt('#3a4a3a')); FADE[s.bid] = 1; }
      s.vents.forEach(([ox, oy], i) => {
        for (let k = 0; k < 4; k++) {
          const ph = (t * 0.45 + k / 4 + i * 0.37) % 1;
          r.alpha = 1 - ph * 0.8;
          r.dot(s.x + ox + world.current.x * ph * 8 + Math.sin(t * 2 + k) * 0.6, s.y + oy + world.current.y * ph * 8, 3 + ph * 20, S2.bubble, s.bid);
        }
      });
      r.alpha = 1;
    },
  },
  stalagmites: {
    build(s) { s.h = 18; s.cones = Array.from({ length: randi(8, 11) }, () => { const a = rand(0, TAU), d = rand(0, 9); return [Math.cos(a) * d, Math.sin(a) * d, rand(1.8, 3.4), rand(8, 22)]; }); },
    bake(r, s, next) {
      const id = next(S2.drip), pid = next(S2.dripWet);
      r.ellipsoid(s.x + 3, s.y + 4, 5, 3.5, 0.4, 0, 0.3, S2.dripWet, pid); // (a still pool among them)
      for (const [ox, oy, R, h] of s.cones) {
        const x = s.x + ox, y = s.y + oy;
        r.ellipsoid(x, y, R * 1.3, R * 1.2, ox, 0, 1, S2.drip, id);
        r.tube(x, y, R, 0, x + 0.3, y - 0.3, 0.3, h, 1, (u) => ((u * h / 2.5) % 1 < 0.2 ? S2.dripWet : S2.drip), id);
      }
    },
  },
  bioluminbloom: {
    build(s) { s.h = 14; s.motes = Array.from({ length: 34 }, () => ({ a: rand(0, TAU), d: rand(1, 9), z: rand(4, 22), w: rand(0.2, 0.6), ph: rand(0, TAU) })); },
    bake(r, s, next) {
      const id = next(S2.rock);
      r.ellipsoid(s.x, s.y, 3.6, 3, 0.4, 0, 2.6, S2.rock, id);
      r.tube(s.x, s.y, 0.35, 2.6, s.x + 1, s.y - 1, 0.25, 12, 0.9, S2.root, id); // (its tether)
    },
    draw(r, s, t) {
      // A slow cloud of glowing plankton, each mote orbiting and breathing.
      for (const m of s.motes) {
        const a = m.a + t * m.w * 0.4, d = m.d + Math.sin(t * 0.7 + m.ph) * 1.2;
        if (Math.sin(t * 1.3 + m.ph) > -0.4) r.dot(s.x + 1 + Math.cos(a) * d, s.y - 1 + Math.sin(a) * d * 0.8, m.z + Math.sin(t + m.ph) * 1.5, S2.bloomG, s.id);
      }
    },
  },
  hydrothermal: {
    build(s) { s.h = 8; s.chim = Array.from({ length: randi(4, 6) }, () => { const a = rand(0, TAU), d = rand(3, 13); return [Math.cos(a) * d, Math.sin(a) * d, rand(5, 11), rand(1.6, 2.6)]; }); },
    bake(r, s, next) {
      const id = next(S2.basalt);
      r.ellipsoid(s.x, s.y, 16, 14, 0.3, 0, 1.6, (lx, ly, px, py) => { const n = vnoise(px * 0.2, py * 0.2, s.seed % 29); return Math.abs(n - 0.5) < 0.03 ? S2.pit : n > 0.68 ? S2.sulfur : S2.basalt; }, id);
      for (const [ox, oy, h, R] of s.chim) for (let k = 0; k < 4; k++) { const f = k / 3; r.ellipsoid(s.x + ox, s.y + oy, lerp(R, R * 0.5, f), lerp(R, R * 0.5, f), k, 1.5 + f * h * 0.8, h / 4, k === 3 ? S2.sulfur : S2.basalt, id); }
    },
    draw(r, s, t) {
      for (const [ox, oy, h, R] of s.chim) { const k = R * 0.4 + Math.sin(t * 2.4 + ox) * 0.25; r.ellipsoid(s.x + ox, s.y + oy, k, k, 0, 1.6 + h, 0.6, S2.emberC, s.id); }
    },
  },
  pewroots: {
    // Rows of church pews either side of an aisle, facing a stone step where the altar stood; some knocked askew,
    // roots grown over the back rows.
    build(s) {
      s.ang = rand(0, TAU); s.h = 5;
      s.pews = [];
      for (let row = 0; row < 5; row++) for (const side of [-1, 1]) {
        const off = Math.random() < 0.2;
        s.pews.push({ u: -14 + row * 6.5, v: side * 8.5, tilt: off ? rand(-0.3, 0.3) : 0, du: off ? rand(-0.8, 0.8) : 0, gone: row > 0 && Math.random() < 0.07 });
      }
      s.roots = Array.from({ length: randi(2, 3) }, () => ({ v: rand(-14, 14), len: rand(6, 11) }));
    },
    bake(r, s, next) {
      const id = next(S2.pew), aid = next(S2.altar), rid = next(S2.root);
      // The altar step, and the aisle's worn floor.
      { const [x, y] = at2(s, 16, 0); r.ellipsoid(x, y, 3, 9, s.ang, 0, 1.6, (u, v) => (Math.abs(v) > 0.9 ? null : S2.altar), aid); }
      { const [x, y] = at2(s, 18.5, 0); r.ellipsoid(x, y, 1.8, 4, s.ang, 1.6, 2.4, S2.altar, aid); }
      for (const p of s.pews) {
        if (p.gone) continue;
        const c = Math.cos(p.tilt), n = Math.sin(p.tilt), half = 6, u = p.u + p.du;
        const end = (k, back) => { const vv = k * half, uu = back ? -1.9 : 0; return [u + uu * c - vv * n, p.v + uu * n + vv * c]; };
        // A pale seat plank, then the dark, taller back along its rear edge, and an end-board at each end.
        const [s0u, s0v] = end(-1, false), [s1u, s1v] = end(1, false), [b0u, b0v] = end(-1, true), [b1u, b1v] = end(1, true);
        bar2(r, s, s0u, s0v, s1u, s1v, 1.3, 2, 2, 0.3, S2.pewTop, id);
        bar2(r, s, b0u, b0v, b1u, b1v, 0.6, 4.5, 4.5, 1, S2.pew, id);
        for (const k of [-1, 1]) { const [eu, ev] = end(k, false), [fu, fv] = end(k, true); bar2(r, s, eu, ev, fu, fv, 0.55, 3.6, 4.8, 1, S2.pew, id); }
      }
      // Roots creeping in over the back pews.
      for (const R of s.roots) { let pu = -22, pv = R.v; for (let i = 1; i <= 4; i++) { const nu = -22 + R.len * i / 4, nv = R.v + Math.sin(i * 1.3 + R.v) * 1.2; bar2(r, s, pu, pv, nu, nv, 0.9 - i * 0.12, i === 1 ? 0 : 5, 5.2 - i * 0.3, 0.9, S2.root, rid); pu = nu; pv = nv; } }
    },
  },
  manganese: {
    build(s) { s.h = 2; s.nod = Array.from({ length: 70 }, () => { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * 15; return [Math.cos(a) * d, Math.sin(a) * d * 0.75, rand(0.9, 2)]; }); s.track = rand(0, PI); },
    bake(r, s, next) {
      const sid = next(S2.silt), id = next(S2.nodule);
      r.ellipsoid(s.x, s.y, 17, 13, 0.2, -0.2, 0.4, (lx, ly) => (Math.abs(lx * Math.sin(s.track) - ly * Math.cos(s.track)) < 0.05 ? S2.pit : S2.silt), sid); // (a creature's track through it)
      for (const [ox, oy, R] of s.nod) r.ellipsoid(s.x + ox, s.y + oy, R, R * 0.85, ox, 0, R * 0.8, (lx, ly, px, py) => (hash2(px, py, 9) > 0.75 ? S2.basalt : S2.nodule), id);
    },
  },
  trenchwall: {
    build(s) { s.ang = rand(0, TAU); s.h = 22; s.ledges = Array.from({ length: 6 }, () => [rand(-14, 14), rand(6, 18)]); s.snails = Array.from({ length: 7 }, () => [rand(-14, 14), rand(-1, 1)]); },
    bake(r, s, next) {
      const pid = next(S2.pit), id = next(S2.wall), nid = next(S2.snail);
      // The drop: black below the wall's foot on one side; the wall itself a long, sheer, ragged ridge.
      { const [x, y] = at2(s, 0, 9); r.ellipsoid(x, y, 20, 8, s.ang, -1, 0.2, S2.pit, pid); }
      for (let i = 0; i <= 16; i++) {
        const u = -18 + i * 2.25, h = 18 + Math.sin(i * 1.7 + s.seed) * 4 + hash2(i, 2, s.seed % 71) * 4;
        const [x, y] = at2(s, u, -1 + Math.sin(i * 0.9) * 0.8); r.ellipsoid(x, y, 2.6, 4.2, s.ang, 0, h, (lx, ly) => (ly > 0.45 ? S2.basalt : lx * lx + ly * ly < 0.2 ? S2.snail : S2.wall), id);
        if (i % 2) { const [tx, ty] = at2(s, u + 1, 4.5); r.tube(x, y, 1.4, h * 0.6, tx, ty, 0.4, h * 0.3, 0.9, S2.wall, id); } // (a buttress dropping toward the dark)
      }
      for (const [u, z] of s.ledges) { const [x, y] = at2(s, u, 2.6); r.ellipsoid(x, y, 2.4, 1.2, s.ang, z - 1, 1, S2.wall, id); }
      for (const [u, v] of s.snails) { const [x, y] = at2(s, u, -4 + v); r.ellipsoid(x, y, 0.9, 0.9, 0, 4, 0.8, S2.snail, nid); }
    },
  },
  catacomb: {
    // A flooded crypt seen from above: walls round a grid of passages, niches cut into them, skulls in the niches.
    build(s) { s.ang = rand(0, PI / 2); s.h = 7; s.skulls = Array.from({ length: 10 }, () => [randi(0, 3), randi(0, 3), Math.random() < 0.5 ? -1 : 1]); },
    bake(r, s, next) {
      const fid = next(S2.pit), id = next(S2.crypt), kid = next(S2.skull);
      { r.ellipsoid(s.x, s.y, 15, 15, s.ang, -0.6, 0.3, (u, v) => (Math.max(Math.abs(u), Math.abs(v)) < 0.68 ? S2.pit : null), fid); }
      const G = 7;
      for (let i = 0; i <= 3; i++) {
        const o = -1.5 * G + i * G;
        // (Walls with gaps for doorways.)
        bar2(r, s, -1.5 * G, o, -0.4 * G, o, 1.1, 0, 0, 3, S2.crypt, id); bar2(r, s, 0.4 * G, o, 1.5 * G, o, 1.1, 0, 0, 3, S2.crypt, id);
        if (i === 0 || i === 3) bar2(r, s, -0.4 * G, o, 0.4 * G, o, 1.1, 0, 0, 3, S2.crypt, id);
        bar2(r, s, o, -1.5 * G, o, -0.6 * G, 1.1, 0, 0, 3, S2.crypt, id); bar2(r, s, o, 0.6 * G, o, 1.5 * G, 1.1, 0, 0, 3, S2.crypt, id);
        if (i === 0 || i === 3) bar2(r, s, o, -0.6 * G, o, 0.6 * G, 1.1, 0, 0, 3, S2.crypt, id);
      }
      for (const [a, b, side] of s.skulls) { const [x, y] = at2(s, -1.5 * G + a * G + side * 1.6, -1.5 * G + b * G + 3.5); r.ellipsoid(x, y, 0.9, 0.8, 0, 1, 0.9, (lx, ly) => (ly > 0.1 && Math.abs(lx) > 0.25 && Math.abs(lx) < 0.6 ? S2.pit : S2.skull), kid); }
    },
  },
  abyssgarden: {
    build(s) { s.h = 12; s.vases = Array.from({ length: randi(5, 7) }, () => { const a = rand(0, TAU), d = rand(2, 12); return [Math.cos(a) * d, Math.sin(a) * d, rand(2.4, 4), rand(6, 12)]; }); s.stalks = Array.from({ length: 6 }, () => [rand(-12, 12), rand(-12, 12), rand(0, TAU)]); },
    bake(r, s, next) {
      const id = next(S2.glass);
      // Venus's flower baskets: open lattice vases, and branching stalks of glass.
      for (const [ox, oy, R, h] of s.vases) r.ellipsoid(s.x + ox, s.y + oy, R, R, 0, h - R, R, (lx, ly) => { const d = lx * lx + ly * ly; return d < 0.4 ? S2.pit : ((Math.atan2(ly, lx) * 4 + d * 6) % 1 + 1) % 1 < 0.45 ? S2.glass : null; }, id);
      for (const [ox, oy, a] of s.stalks) { const x = s.x + ox, y = s.y + oy; for (const b of [-0.5, 0, 0.5]) r.tube(x, y, 0.5, 0, x + Math.cos(a + b) * 4, y + Math.sin(a + b) * 4, 0.3, 6, 0.9, S2.glass, id); }
    },
    draw(r, s, t) {
      s.vases.forEach(([ox, oy, R, h], i) => { if (Math.sin(t * 0.8 + i * 1.7) > 0.3) ring2(6, (a) => r.dot(s.x + ox + Math.cos(a + t * 0.2) * R, s.y + oy + Math.sin(a + t * 0.2) * R, h + 0.3, S2.glassGlow, s.id)); });
    },
  },
  rootheart: {
    build(s) { s.h = 10; s.roots = Array.from({ length: 9 }, (_, k) => ({ a: k / 9 * TAU + rand(-0.2, 0.2), len: rand(16, 24), turn: rand(0.6, 1.1) * (k % 2 ? 1 : -1) })); },
    bake(r, s, next) {
      const id = next(S2.rootG);
      // Roots spiralling in to a knot round the heart.
      for (const R of s.roots) {
        let px = s.x + Math.cos(R.a) * R.len, py = s.y + Math.sin(R.a) * R.len, pz = 0;
        for (let i = 1; i <= 10; i++) {
          const f = i / 10, a = R.a + R.turn * f, d = R.len * (1 - f) + 4.5, nx = s.x + Math.cos(a) * d, ny = s.y + Math.sin(a) * d, nz = Math.sin(f * PI * 0.8) * 7;
          r.tube(px, py, lerp(1, 2.2, f), pz, nx, ny, lerp(1, 2.2, f + 0.1), nz, 0.9, (u, v, x, y) => (vnoise(x * 0.4, y * 0.4, 11) > 0.65 ? S2.moss : S2.rootG), id);
          px = nx; py = ny; pz = nz;
        }
      }
    },
    draw(r, s, t) {
      const k = 3 + Math.sin(t * 0.9 + s.seed) * 0.6;
      r.ellipsoid(s.x, s.y, k, k, 0, 5, k, S2.heart, s.id);
    },
  },
  fountain: {
    build(s) { s.h = 12; },
    bake(r, s, next) {
      const id = next(S2.marble), wid = next(S2.water);
      // A round basin, its rim, and a column of three tiered bowls.
      r.ellipsoid(s.x, s.y, 12, 12, 0, 0, 2.6, (lx, ly) => (lx * lx + ly * ly > 0.78 ? S2.marble : null), id);
      r.ellipsoid(s.x, s.y, 10.6, 10.6, 0, 0, 0.6, (lx, ly) => ((lx * lx + ly * ly) * 5 % 1 < 0.18 ? S2.bubble : S2.water), wid);
      r.tube(s.x, s.y, 1.6, 0, s.x, s.y, 1.2, 10, 1, S2.marble, id);
      for (const [R, z] of [[6, 4], [4, 7.5], [2.4, 10.5]]) r.ellipsoid(s.x, s.y, R, R, 0, z, 1, (lx, ly) => (lx * lx + ly * ly > 0.6 ? S2.marble : S2.water), id);
      ring2(8, (a) => r.ellipsoid(s.x + Math.cos(a) * 12, s.y + Math.sin(a) * 12, 1.2, 1.2, a, 2, 1.2, S2.marble, id));
    },
    draw(r, s, t) {
      // Water welling over the top bowl and spilling, catching the light.
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU + t * 0.3, ph = (t * 0.8 + i * 0.13) % 1, d = 2 + ph * 4;
        r.dot(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 12 - ph * 6, S2.glassGlow, s.id);
      }
    },
  },
  streetlamp: {
    build(s) { s.h = 20; s.ang = rand(0, TAU); s.cobbles = []; for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) if (Math.random() < 0.85) s.cobbles.push([-9.5 + i * 2.7 + (j % 2) * 1.3, -2.6 + j * 2.6]); },
    bake(r, s, next) {
      const cid = next(S2.cobble), id = next(S2.iron);
      // A patch of the street it stood on: cobbles and a kerb.
      for (const [u, v] of s.cobbles) { const [x, y] = at2(s, u, v); r.ellipsoid(x, y, 1.2, 1.1, s.ang, 0, 0.5, S2.cobble, cid); }
      bar2(r, s, -11, 5, 11, 5, 1, 0, 0, 0.8, S2.altar, cid);
      // Its iron post on a plinth, the arm curling out to the lamp.
      r.ellipsoid(s.x, s.y, 2.2, 2.2, PI / 4, 0, 2, S2.iron, id);
      r.tube(s.x, s.y, 0.8, 2, s.x, s.y, 0.6, s.h - 2, 1, S2.iron, id);
      const [ax, ay] = at2(s, 0, -4); r.tube(s.x, s.y, 0.5, s.h - 2, ax, ay, 0.4, s.h - 1, 0.9, S2.iron, id);
    },
    draw(r, s, t) {
      const [x, y] = at2(s, 0, -4), flick = Math.sin(t * 7 + s.seed) > 0.92 ? SM.ember : S2.lamp;
      r.ellipsoid(x, y, 2.8, 2.8, PI / 4, s.h - 3, 2.6, (lx, ly) => (Math.abs(lx) < 0.12 || Math.abs(ly) < 0.12 || lx * lx + ly * ly > 0.8 ? S2.iron : flick), s.id);
      r.ellipsoid(x, y, 1, 1, 0, s.h, 0.8, S2.iron, s.id); // (its cap)
    },
  },
  dreamstone: {
    build(s) { s.h = 14; s.ang = rand(0, TAU); s.ring = randi(7, 9); },
    bake(r, s, next) {
      const id = next(S2.dream), sid = next(S2.rock);
      ring2(s.ring, (a) => r.ellipsoid(s.x + Math.cos(a) * 11, s.y + Math.sin(a) * 9, 1.6, 1.3, a, 0, 2, S2.rock, sid));
      r.ellipsoid(s.x, s.y, 6, 4.4, s.ang, 0, s.h, (lx, ly) => { const a = Math.atan2(ly, lx), d = Math.hypot(lx, ly); return ((d * 5 - a / TAU) % 1 + 1) % 1 < 0.14 ? S2.basalt : S2.dream; }, id);
    },
    draw(r, s, t) {
      // Its spiral of runes waking in turn.
      for (let i = 0; i < 14; i++) {
        const f = i / 14, a = f * TAU * 2.4 + s.ang, d = 0.8 + f * 4.4;
        if (Math.sin(t * 1.2 - i * 0.5) > 0.3) r.dot(s.x + Math.cos(a) * d * (6 / 6), s.y + Math.sin(a) * d * (4.4 / 6), s.h * Math.sqrt(Math.max(0, 1 - (d / 5.5) ** 2)) + 0.4, S2.rune, s.id);
      }
    },
  },
  fossilwall: {
    build(s) { s.ang = rand(0, TAU); s.h = 9; s.fossils = Array.from({ length: randi(5, 7) }, (_, k) => [-12 + k * 4.5 + rand(-1, 1), rand(-3, 3), k % 3, rand(2, 3.2), rand(0, TAU)]); },
    bake(r, s, next) {
      const id = next(S2.strata), fid = next(S2.fossil);
      // A slab of layered rock, its strata showing, with ammonites, trilobites and a fish weathering out.
      r.ellipsoid(s.x, s.y, 16, 7, s.ang, 0, s.h, (lx, ly) => (((ly + 1) * 5 + Math.sin(lx * 3) * 0.3) % 1 < 0.45 ? S2.strata2 : S2.strata), id);
      for (const [u, v, k, R, a] of s.fossils) {
        const [x, y] = at2(s, u, v), z = s.h * Math.sqrt(Math.max(0, 1 - (u / 16) ** 2 - (v / 7) ** 2)) + 0.2;
        if (k === 0) r.ellipsoid(x, y, R, R, a, z, 0.5, (lx, ly) => { const d = Math.hypot(lx, ly), th = Math.atan2(ly, lx); return ((Math.log(d + 0.05) * 2.2 - th / TAU) % 1 + 1) % 1 < 0.3 ? S2.strata2 : S2.fossil; }, fid);
        else if (k === 1) r.ellipsoid(x, y, R * 1.3, R * 0.8, a, z, 0.6, (lx, ly) => (Math.abs(ly) < 0.15 || ((lx + 1) * 3.5) % 1 < 0.25 ? S2.strata2 : S2.fossil), fid);
        else { const [ex, ey] = [x + Math.cos(a) * R * 2, y + Math.sin(a) * R * 2]; r.tube(x, y, 0.5, z, ex, ey, 0.5, z, 0.4, S2.fossil, fid); for (let b = 1; b < 4; b++) { const mx = lerp(x, ex, b / 4), my = lerp(y, ey, b / 4); r.tube(mx - Math.sin(a), my + Math.cos(a), 0.3, z, mx + Math.sin(a), my - Math.cos(a), 0.3, z, 0.4, S2.fossil, fid); } }
      }
    },
  },
  prism: {
    build(s) { s.h = 34; s.xtals = Array.from({ length: randi(6, 8) }, (_, k) => { const a = rand(0, TAU), d = k ? rand(2, 8) : 0; return [Math.cos(a) * d, Math.sin(a) * d, k ? rand(10, 24) : s.h, k ? rand(1.4, 2.4) : 3.6, k % 5, rand(0, TAU)]; }); },
    bake(r, s, next) {
      const id = next(S2.prismC[3]);
      r.ellipsoid(s.x, s.y, 9, 9, 0, 0, 1.4, S2.obsid, id);
      for (const [ox, oy, h, R, c, a] of s.xtals) {
        const x = s.x + ox, y = s.y + oy, tx = x + Math.cos(a) * h * 0.12, ty = y + Math.sin(a) * h * 0.12;
        r.tube(x, y, R, 0, tx, ty, 0.3, h, 1, (u, v) => (v > 0.3 ? S2.prismC[(c + 1) % 5] : S2.prismC[c]), id); // (two faces lit differently)
      }
    },
    draw(r, s, t) {
      // Light split into colours, running up the great crystal and scattering round it.
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU + t * 0.25, d = 10 + Math.sin(t + i) * 2;
        r.dot(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 1, S2.prismC[(i + ((t * 2) | 0)) % 5], s.id);
      }
      const z = ((t * 6) % s.h); r.dot(s.x + Math.cos(s.xtals[0][5]) * z * 0.12, s.y + Math.sin(s.xtals[0][5]) * z * 0.12, z + 1, S2.glassGlow, s.id);
    },
  },
  hollowgate: {
    build(s) { s.h = 6; s.R = rand(10, 12); s.stones = randi(6, 8); s.stars = Array.from({ length: 16 }, () => { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * 0.85; return [Math.cos(a) * d, Math.sin(a) * d, rand(0, TAU)]; }); },
    bake(r, s, next) {
      const id = next(S2.obsid), hid = next(S2.hollow);
      // A perfectly round pool, darker than the dark round it, rimmed in smooth black stone, with standing stones
      // leaning in over it.
      r.ellipsoid(s.x, s.y, s.R, s.R, 0, -1.5, 0.2, S2.hollow, hid);
      r.ellipsoid(s.x, s.y, s.R + 2, s.R + 2, 0, 0, 1.4, (lx, ly) => (lx * lx + ly * ly > 0.72 ? S2.obsid : null), id);
      ring2(s.stones, (a) => { const px = s.x + Math.cos(a) * (s.R + 4.5), py = s.y + Math.sin(a) * (s.R + 4.5); r.tube(px, py, 1.6, 0, px - Math.cos(a) * 2.5, py - Math.sin(a) * 2.5, 1, 10, 1, S2.obsid, id); });
    },
    draw(r, s, t) {
      // Points of light far down in it, that aren't the reflection of anything.
      for (const [u, v, ph] of s.stars) if (Math.sin(t * 0.7 + ph) > 0.2) r.dot(s.x + u * s.R, s.y + v * s.R, -1, S2.starDot, s.id);
    },
  },
};

// (Any without a shape of its own is raised on another's form: the form builds and draws it, in its own colours.)
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
  const own = SHAPES2[k];
  if (own) {
    BUILD[k] = (s, world) => own.build(s, world);
    BAKE[k] = (r, s, next, world) => own.bake(r, s, next, world);
    if (own.draw) DRAW[k] = (r, s, t, world) => own.draw(r, s, t, world);
  } else {
    BUILD[k] = (s, world) => BUILD[def.form](s, world);
    BAKE[k] = (r, s, next, world) => smSwap(def, () => BAKE[def.form](r, s, next, world));
    if (DRAW[def.form]) DRAW[k] = (r, s, t, world) => smSwap(def, () => DRAW[def.form](r, s, t, world));
  }
  STRUCT_LIKES[k] = def.likes || [];
  LIKE_LABEL[k] = def.label.toLowerCase();
  STRUCT_CODES.push(k); // (append-only: links)
}
