'use strict';
// More to grow again: twenty-six plants, each grown on one of flora.js's forms (its shape and how it moves) with
// its own colours, size of life and liking. They join FLORA_PLANTS, so they're bought, come up by themselves by the
// warmth of the water, show in the side view and have their tips like the rest.

const fm = (...hex) => mat(...hex);
// kind: as flora.js, plus form (whose shape it grows in) and mats (the form's colours, swapped for its own) or
// fans (a sea fan's or sponge's choice of colours).
const FLORA_PLANTS2 = {
  // ---- fresh ----
  arrowhead: { form: 'reeds', label: 'Arrowhead', hab: 'fresh', price: 6, tier: 0, life: [0.25, 35, 70], seed: 0.12, cover: 0.05, water: -0.5, likes: ['frog', 'dragonfly', 'killifish'], warm: 0.3,
    tip: 'arrow-shaped leaves standing out of the shallows, with little white flowers: frogs sit beneath them',
    mats: { reed: fm('#2a4a1a', '#3e6a26', '#5a8e36', '#80b450'), cattail: fm('#a0a090', '#d0d0c0', '#f0f0e8', '#ffffff') } },
  papyrus: { form: 'reeds', label: 'Papyrus', hab: 'fresh', price: 9, tier: 1, life: [0.2, 50, 100], seed: 0.08, cover: 0.06, water: -0.6, likes: ['frog', 'duck', 'snake', 'mudskipper'], warm: 0.9,
    tip: 'tall green stems with starbursts of fine leaves at the top: the Nile\'s own reed, for warm water',
    mats: { reed: fm('#3a5a14', '#567e1e', '#76a42e', '#9ccc48'), cattail: fm('#4a6a1a', '#6a8e26', '#90b43a', '#b8d860') } },
  yellowlily: { form: 'lotus', label: 'Yellow water lily', hab: 'fresh', price: 10, tier: 0, life: [0.14, 50, 100], seed: 0.07, cover: 0.03, water: -0.8, likes: ['koi', 'frog', 'goldfish', 'turtle'], warm: -0.2,
    tip: 'round pads and a cup of a yellow flower: it smells of brandy, and fish love its shade',
    mats: { lotus: fm('#8a6a0a', '#c09a14', '#f0c83a', '#fff08a') } },
  victoria: { form: 'lotus', label: 'Giant water lily', hab: 'fresh', price: 24, tier: 2, life: [0.08, 90, 160], seed: 0.03, cover: 0.04, water: -1, likes: ['koi', 'turtle', 'discus', 'oscar'], warm: 1,
    tip: 'pads big enough to hold a child, with upturned rims, and a flower that opens white and closes pink',
    mats: { lotusPad: fm('#1a3a14', '#2a5a1e', '#3e7a2a', '#5a9e3a'), lotus: fm('#a0a0a0', '#e0d0d8', '#fff0f4', '#ffffff') } },
  milfoil: { form: 'hornwort', label: 'Red milfoil', hab: 'fresh', price: 6, tier: 0, life: [0.3, 25, 50], seed: 0.13, cover: 0.05, water: -0.4, likes: ['tetra', 'rasbora', 'danio', 'stickleback'], warm: -0.2,
    tip: 'feathery whorls blushing red at the tips: small fish weave through it',
    mats: { hornwort: fm('#3a0e14', '#5a1a20', '#80302e', '#b05040') } },
  cabomba: { form: 'hornwort', label: 'Cabomba', hab: 'fresh', price: 5, tier: 0, life: [0.32, 20, 45], seed: 0.15, cover: 0.05, water: -0.4, likes: ['tetra', 'guppy', 'platy', 'molly'], warm: 0.5,
    tip: 'bright green fans of leaves stacked up a stem, like a bottle brush',
    mats: { hornwort: fm('#1a4a14', '#2a6e1e', '#44962e', '#6abe44') } },
  waterlettuce: { form: 'hyacinth', label: 'Water lettuce', hab: 'fresh', price: 5, tier: 0, life: [0.35, 15, 30], seed: 0.18, cover: 0.03, water: -0.5, likes: ['gourami', 'frog', 'duck'], warm: 0.8,
    tip: 'velvety pale green rosettes floating like heads of lettuce, with roots trailing below',
    mats: { hyLeaf: fm('#3a5a2a', '#5a8040', '#80a85a', '#aed080'), hyFlower: fm('#3a5a2a', '#5a8040', '#80a85a', '#aed080') } },
  frogbit: { form: 'hyacinth', label: 'Frogbit', hab: 'fresh', price: 4, tier: 0, life: [0.35, 15, 30], seed: 0.17, cover: 0.03, water: -0.4, likes: ['frog', 'killifish', 'bitterling'], warm: -0.3,
    tip: 'little round floating leaves with a small white flower: tadpoles hide under them',
    mats: { hyFlower: fm('#a0a090', '#d0d0c0', '#f0f0e8', '#ffffff') } },
  javamoss: { form: 'moss', label: 'Java moss', hab: 'fresh', price: 4, tier: 0, life: [0.22, 45, 90], seed: 0.08, cover: 0.02, water: -0.3, likes: ['shrimp', 'catfishcory', 'mussel', 'snail'], warm: 0.4,
    tip: 'a dark green tangle over stones and wood: shrimp pick through it all day',
    mats: { moss: fm('#0e2a0e', '#1a4418', '#2a5e22', '#3e7a30'), mossLit: fm('#1a3a14', '#2a5a1e', '#3e762a', '#56943a') } },
  riccia: { form: 'moss', label: 'Riccia', hab: 'fresh', price: 5, tier: 1, life: [0.25, 30, 60], seed: 0.1, cover: 0.02, water: -0.3, likes: ['shrimp', 'snail', 'axolotl'], warm: 0.2,
    tip: 'a bright lime cushion that pearls with bubbles of oxygen in the light',
    mats: { moss: fm('#2a5a14', '#3e7e1e', '#5aa62e', '#7ecc44'), mossLit: fm('#4a7a1a', '#6aa026', '#90c83a', '#c0f070') } },
  wildcelery: { form: 'kelp', label: 'Wild celery', hab: 'fresh', price: 8, tier: 1, life: [0.22, 40, 80], seed: 0.08, cover: 0.06, water: -0.5, likes: ['perch', 'pike', 'duck', 'turtle'], warm: -0.4,
    tip: 'long ribbons of leaf from the floor to the surface in the current: ducks dive for its roots',
    mats: { stipe: fm('#2a4a14', '#3e6a1e', '#5a8e2e', '#7eb444'), blade: fm('#2a5a1a', '#3e7e26', '#5aa636', '#80cc50'), bladder: fm('#2a5a1a', '#3e7e26', '#5aa636', '#80cc50') } },
  hairgrass: { form: 'seagrass', label: 'Hairgrass', hab: 'fresh', price: 4, tier: 0, life: [0.3, 25, 55], seed: 0.15, cover: 0.04, water: -0.3, likes: ['catfishcory', 'rasbora', 'shrimp'], warm: 0,
    tip: 'a fine lawn of thin blades over the floor: little catfish root through it',
    mats: { seagrass: fm('#2a5a1a', '#3e7e24', '#5aa634', '#86d04a') } },
  pennywort: { form: 'seagrapes', label: 'Pennywort', hab: 'fresh', price: 5, tier: 0, life: [0.3, 25, 50], seed: 0.14, cover: 0.02, water: -0.3, likes: ['snail', 'molly', 'platy'], warm: 0.3,
    tip: 'a creeping stem hung with round coin-like leaves: snails graze along it',
    mats: { grape: fm('#2a5a1a', '#3e8226', '#5aaa36', '#8ad85a') } },
  // ---- salt ----
  bullkelp: { form: 'kelp', label: 'Bull kelp', hab: 'salt', price: 11, tier: 1, life: [0.22, 40, 90], seed: 0.07, cover: 0.06, water: 0.6, likes: ['octopus', 'cuttlefish', 'sculpin', 'grouper'], warm: -0.9,
    tip: 'a whip of a stipe ending in a round float and a mane of brown blades, in cold water',
    mats: { stipe: fm('#2a1a0a', '#4a3014', '#6a4820', '#8e6430'), blade: fm('#3a2a0a', '#5a4214', '#7e5e20', '#a47e32'), bladder: fm('#4a3a10', '#7a6020', '#a48430', '#ccac48') } },
  sargassum: { form: 'kelp', label: 'Sargassum', hab: 'salt', price: 7, tier: 0, life: [0.3, 25, 55], seed: 0.12, cover: 0.05, water: 0.4, likes: ['filefish', 'pipefish', 'seahorse', 'turtle'], warm: 0.6,
    tip: 'golden weed buoyed on berry-like floats: a drifting nursery for the young of the sea',
    mats: { stipe: fm('#5a4a0a', '#8a7014', '#b49420', '#d8b83a'), blade: fm('#6a5a0e', '#9a8018', '#c4a828', '#e8cc44'), bladder: fm('#6a5014', '#9a7420', '#c49a30', '#e8c04a') } },
  turtlegrass: { form: 'seagrass', label: 'Turtle grass', hab: 'salt', price: 4, tier: 0, life: [0.28, 30, 60], seed: 0.15, cover: 0.04, water: 0.4, likes: ['turtle', 'cucumber', 'pipefish', 'ray'], warm: 0.6,
    tip: 'broad ribbon blades in a meadow: sea turtles graze it short',
    mats: { seagrass: fm('#1a4a14', '#2a6a1e', '#3e8e2a', '#5ab43e') } },
  shoalgrass: { form: 'seagrass', label: 'Shoal grass', hab: 'salt', price: 3, tier: 0, life: [0.32, 20, 45], seed: 0.16, cover: 0.04, water: 0.3, likes: ['goby', 'blenny', 'shrimp'], warm: 0.3,
    tip: 'thin, flat blades in the very shallows, first to come back after a storm',
    mats: { seagrass: fm('#3a5a1a', '#567e24', '#76a434', '#9cc84e') } },
  gorgonian: { form: 'seafan', label: 'Purple gorgonian', hab: 'salt', price: 15, tier: 2, life: [0.08, 90, 170], seed: 0.04, cover: 0.03, water: 0.8, likes: ['butterflyfish', 'angelfish', 'filefish'], warm: 0.7,
    tip: 'a tall purple lace fan, its polyps open to the current like tiny flowers',
    fans: [fm('#3a1a5a', '#5a2a8a', '#8a4ab8', '#b88ae0')] },
  seawhip: { form: 'seafan', label: 'Sea whip', hab: 'salt', price: 12, tier: 1, life: [0.1, 70, 140], seed: 0.05, cover: 0.03, water: 0.7, likes: ['pipefish', 'goby', 'shrimp'], warm: 0.5,
    tip: 'bright red whips standing in a cluster, swaying together in the swell',
    fans: [fm('#6a0a0a', '#a01a14', '#d03a24', '#ff6a4a'), fm('#7a3a0a', '#b05a14', '#e07a2a', '#ffa85a')] },
  tubesponge: { form: 'sponge', label: 'Tube sponge', hab: 'salt', price: 9, tier: 1, life: [0.1, 80, 160], seed: 0.05, cover: 0.02, water: 0.6, likes: ['goby', 'blenny', 'urchincrab'], warm: 0.4,
    tip: 'a bundle of purple organ pipes that little fish use as a home',
    fans: [fm('#3a1a4a', '#5a2a6a', '#7a4a8a', '#a07ab0'), fm('#1a2a5a', '#2a3e8a', '#4a5eb4', '#7a8ae0')] },
  firesponge: { form: 'sponge', label: 'Fire sponge', hab: 'salt', price: 10, tier: 1, life: [0.1, 80, 160], seed: 0.05, cover: 0.02, water: 0.6, likes: ['hermit', 'cowrie', 'starfish'], warm: 0.6,
    tip: 'a crust of bright orange-red that stings whatever brushes it',
    fans: [fm('#7a1a0a', '#b02a14', '#e04a24', '#ff7a4a')] },
  caulerpa: { form: 'seagrapes', label: 'Feather caulerpa', hab: 'salt', price: 5, tier: 0, life: [0.32, 25, 50], seed: 0.15, cover: 0.02, water: 0.4, likes: ['seahare', 'cowrie', 'snail'], warm: 0.3,
    tip: 'a runner sprouting feathery green fronds: sea hares feed on it',
    mats: { grape: fm('#1a5a2a', '#2a7e3a', '#40a650', '#64cc6a') } },
  halimeda: { form: 'seagrapes', label: 'Cactus algae', hab: 'salt', price: 6, tier: 1, life: [0.25, 35, 70], seed: 0.1, cover: 0.02, water: 0.5, likes: ['parrotfish', 'cucumber', 'crab'], warm: 0.5,
    tip: 'chains of little chalky green discs: when they die they become the white sand of the reef',
    mats: { runner: fm('#5a6a3a', '#7a8e52', '#9cb070', '#c0d494'), grape: fm('#4a7a3a', '#6aa052', '#8ec46c', '#b8e494') } },
  turfalgae: { form: 'moss', label: 'Red turf algae', hab: 'salt', price: 3, tier: 0, life: [0.3, 25, 50], seed: 0.14, cover: 0.02, water: 0.3, likes: ['damselfish', 'surgeonfish', 'blenny', 'chiton'], warm: 0.2,
    tip: 'a short red fuzz over the rock: damselfish farm and guard their patch of it',
    mats: { moss: fm('#3a0e14', '#5a1a20', '#7a2a2e', '#a04040'), mossLit: fm('#5a1a20', '#7e2a2e', '#a24040', '#c86058') } },
  sealettuce: { form: 'hyacinth', label: 'Sea lettuce', hab: 'salt', price: 4, tier: 0, life: [0.35, 15, 30], seed: 0.18, cover: 0.03, water: 0.3, likes: ['seahare', 'turtle', 'mullet'], warm: 0,
    tip: 'thin bright green sheets drifting at the surface, thin as tissue paper',
    mats: { hyLeaf: fm('#2a6a1a', '#3e9026', '#5ab83a', '#86e05a'), hyFlower: fm('#2a6a1a', '#3e9026', '#5ab83a', '#86e05a') } },
  mangrove: { form: 'reeds', label: 'Mangrove seedlings', hab: 'salt', price: 10, tier: 1, life: [0.15, 70, 140], seed: 0.06, cover: 0.06, water: 0.5, likes: ['mudskipper', 'crab', 'sculpin', 'goby'], warm: 0.9,
    tip: 'stilted young trees standing in the salt shallows: a nursery for crabs and mudskippers',
    mats: { reed: fm('#3a2a14', '#5a4220', '#7a5e30', '#9e7e44'), cattail: fm('#2a5a1a', '#3e7e26', '#5aa636', '#80cc50') } },
};
// (They take the form's view in the side cut, and those that reach the surface are scaled like it.)
for (const [k, F] of Object.entries(FLORA_PLANTS2)) {
  F.slice = FLORA_PLANTS[F.form].slice;
  FLORA_PLANTS[k] = F;
  if (FLORA_FLOAT.has(F.form)) FLORA_FLOAT.add(k);
}

// A plant grown on another's form: the form draws it, with its own colours swapped in while it does.
class FloraVariant extends FloraPlant {
  constructor(x, y, kind) {
    const V = FLORA_PLANTS2[kind];
    super(x, y, V.form);
    this.V = V;
    if (V.fans) this.m = pick(V.fans);
    this.swap(() => { OUTLINE[this.id] = outlineOf(this.mainMat()); OUTLINE[this.id2] = outlineOf(this.accentMat()); });
  }
  swap(fn) {
    const M = this.V.mats;
    if (!M) return fn();
    const old = {};
    for (const k in M) { old[k] = FM[k]; FM[k] = M[k]; }
    try { return fn(); } finally { for (const k in M) FM[k] = old[k]; }
  }
  draw(r, t, world) { this.swap(() => super.draw(r, t, world)); }
}

// ---- wiring them in (as flora.js does for its own) ---------------------------------------------------------------
for (const [k, F] of Object.entries(FLORA_PLANTS2)) {
  GROW[k] = (w, x, y) => new FloraVariant(x, y, k);
  PLANT_PRICE[k] = F.price;
  PLANT_LIFE[k] = F.life;
  SEEDS[k] = F.seed;
  PLANT_COVER[k] = F.cover;
  PLANT_WATER[k] = F.water;
  LIKE_LABEL[k] = F.label.toLowerCase();
  for (const sp of F.likes) if (LIKES[sp] && !LIKES[sp].includes(k)) LIKES[sp].push(k); else if (!LIKES[sp] && typeof DESIGNS !== 'undefined' && DESIGNS[sp]) LIKES[sp] = [k];
  if (!PLANT_CODES.includes(k)) PLANT_CODES.push(k); // (append-only: links)
}
