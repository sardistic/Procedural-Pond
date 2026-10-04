'use strict';
// More to grow again: twenty-six plants, each living as one of flora.js's forms does (floating or rooted, how it
// bends) but with its own shape (PLANT_SHAPES2, below), colours, size of life and liking. They join FLORA_PLANTS,
// so they're bought, come up by themselves by the warmth of the water, show in the side view and have their tips
// like the rest.

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

// ---- their own shapes ----------------------------------------------------------------------------------
// Each plant's own model, seen from above. It still lives as its form does (floating or rooted, bending from
// swimmers, the side view), but make lays out its parts and draw draws them. main and accent are the materials
// its two outlines take. (The water's surface is at about 44.)
const SURF = 44;
const P2 = {
  stem: fm('#2a4a1a', '#3e6a26', '#5a8e36', '#80b450'), arrow: fm('#1e4a14', '#2e6e1e', '#469a2c', '#6cc44a'), white: fm('#a0a090', '#d0d0c0', '#f0f0e8', '#ffffff'),
  papyrus: fm('#3a5a14', '#567e1e', '#76a42e', '#9ccc48'), umbel: fm('#4a6a1a', '#6a8e26', '#90b43a', '#c0e070'),
  nupharPad: fm('#1a3a12', '#28561a', '#3a7a26', '#56a038'), yellow: fm('#8a6a0a', '#c09a14', '#f0c83a', '#fff08a'),
  vicPad: fm('#1a3a14', '#2a5a1e', '#3e7a2a', '#5a9e3a'), vicRim: fm('#4a0e1a', '#7a1a2a', '#a8303a', '#d05050'), vicFlower: fm('#a08a90', '#e0d0d8', '#fff0f4', '#ffffff'),
  milfoil: fm('#2a3a14', '#3e5a1e', '#5a7a2a', '#7a9a3a'), milfoilTip: fm('#5a0e14', '#8a1a20', '#c0302e', '#f06050'),
  cabomba: fm('#1a4a14', '#2a6e1e', '#44962e', '#6abe44'), lettuce: fm('#3a5a2a', '#5a8040', '#80a85a', '#b8e090'), frogbit: fm('#1e4a16', '#2e6a20', '#44902e', '#66b848'),
  wood: fm('#1e140a', '#33231a', '#4c3626', '#664a34'), jmoss: fm('#0e2a0e', '#1a4418', '#2a5e22', '#3e7a30'), riccia: fm('#2a5a14', '#3e7e1e', '#5aa62e', '#8ad44a'),
  pearl: fm('#a0c0d0', '#d0f0ff', '#f0ffff', '#ffffff'), vallis: fm('#2a5a1a', '#3e7e26', '#5aa636', '#80cc50'), hair: fm('#2a5a1a', '#3e7e24', '#5aa634', '#86d04a'),
  penny: fm('#2a5a1a', '#3e8226', '#5aaa36', '#8ad85a'), runner: fm('#4a5a2a', '#62763a', '#7e9450', '#9cb26a'),
  bullStipe: fm('#2a1a0a', '#4a3014', '#6a4820', '#8e6430'), bullBlade: fm('#3a2a0a', '#5a4214', '#7e5e20', '#a47e32'), bullFloat: fm('#4a3a10', '#7a6020', '#a48430', '#ccac48'),
  sarg: fm('#5a4a0a', '#8a7014', '#b49420', '#d8b83a'), sargBerry: fm('#6a5014', '#9a7420', '#c49a30', '#ffe070'), turtle: fm('#1a4a14', '#2a6a1e', '#3e8e2a', '#5ab43e'),
  epi: fm('#6a6a50', '#9a9a78', '#c8c8a0', '#eeeec8'), shoal: fm('#3a5a1a', '#567e24', '#76a434', '#9cc84e'), rhizome: fm('#4a3a24', '#6a5434', '#8a7048', '#aa8e60'),
  gorg: fm('#3a1a5a', '#5a2a8a', '#8a4ab8', '#b88ae0'), polyp: fm('#8a6aa0', '#c0a0d8', '#e8d0ff', '#ffffff'), whipR: fm('#6a0a0a', '#a01a14', '#d03a24', '#ff6a4a'), whipO: fm('#7a3a0a', '#b05a14', '#e07a2a', '#ffa85a'),
  tubeP: fm('#3a1a4a', '#5a2a6a', '#7a4a8a', '#a07ab0'), tubeB: fm('#1a2a5a', '#2a3e8a', '#4a5eb4', '#7a8ae0'), hole: fm('#060408', '#0e0a12', '#18121e', '#24202c'),
  fire: fm('#7a1a0a', '#b02a14', '#e04a24', '#ff7a4a'), rock: fm('#2a2a2e', '#3e3e44', '#56565e', '#72727c'), caul: fm('#1a5a2a', '#2a7e3a', '#40a650', '#64cc6a'),
  hali: fm('#4a7a3a', '#6aa052', '#8ec46c', '#b8e494'), haliPale: fm('#7a8a6a', '#a4b490', '#ccdab8', '#f0f8e8'), turf: fm('#3a0e14', '#5a1a20', '#7a2a2e', '#a04040'),
  sheet: fm('#2a6a1a', '#3e9026', '#5ab83a', '#86e05a'), mroot: fm('#3a2a14', '#5a4220', '#7a5e30', '#9e7e44'), mleaf: fm('#1a4a14', '#2a6a1e', '#3e8e2a', '#5ab43e'), pod: fm('#3a4a14', '#566a1e', '#76902e', '#9cb848'),
};
const PLANT_SHAPES2 = {
  // ---- fresh ----
  arrowhead: { main: P2.arrow, accent: P2.white,
    make(F) { const n = randi(4, 6); F.leaves = Array.from({ length: n }, (_, k) => { const a = k / n * TAU + rand(-0.3, 0.3); return { ox: Math.cos(a) * 1.5, oy: Math.sin(a) * 1.5, a, out: rand(4, 6.5), h: rand(46, 50), ph: rand(0, TAU) }; }); F.spike = Math.random() < 0.7; },
    draw(F, r, t, world, g, cur) {
      for (const L of F.leaves) {
        const bx = F.x + L.ox, by = F.y + L.oy, tx = bx + Math.cos(L.a) * L.out * g + Math.sin(t * 0.8 + L.ph) * 0.4 + cur.x * 0.6 + F.px * 0.3, ty = by + Math.sin(L.a) * L.out * g + cur.y * 0.6 + F.py * 0.3, h = 6 + (L.h - 6) * g;
        r.tube(bx, by, 0.4, 0, tx, ty, 0.3, h, 1, P2.stem, F.id);
        // The arrow: a pointed blade with two lobes swept back, pointing out from the clump.
        if (g > 0.4) r.ellipsoid(tx, ty, 4 * g, 3 * g, L.a, h, 0.6, (lx, ly) => (lx > 0 ? (Math.abs(ly) < 1 - lx ? P2.arrow : null) : (Math.abs(ly) > 0.25 - lx * 0.4 || lx > -0.3 ? P2.arrow : null)), F.id);
      }
      if (F.spike && g > 0.7) { const sx = F.x + 1, sy = F.y; r.tube(sx, sy, 0.3, 0, sx, sy, 0.25, 51, 1, P2.stem, F.id); for (let k = 0; k < 3; k++) for (let q = 0; q < 3; q++) { const a = q / 3 * TAU + k; r.ellipsoid(sx + Math.cos(a) * 0.9, sy + Math.sin(a) * 0.9 - k * 1.2, 0.7, 0.7, 0, 48 + k, 0.6, P2.white, F.id2); } }
    } },
  papyrus: { main: P2.papyrus, accent: P2.umbel,
    make(F) { const n = randi(3, 5); F.stems = Array.from({ length: n }, (_, k) => { const a = k / n * TAU + rand(-0.4, 0.4), d = rand(2, 3.5); return { ox: Math.cos(a) * d, oy: Math.sin(a) * d, h: rand(52, 60), ph: rand(0, TAU), rays: randi(10, 14) }; }); },
    draw(F, r, t, world, g, cur) {
      for (const s of F.stems) {
        const bx = F.x + s.ox, by = F.y + s.oy, tx = bx + s.ox * 1.6 * g + Math.sin(t * 0.7 + s.ph) * 0.8 + cur.x + F.px * 0.3, ty = by + s.oy * 1.6 * g + Math.cos(t * 0.6 + s.ph) * 0.5 + cur.y + F.py * 0.3, h = 6 + (s.h - 6) * g;
        r.tube(bx, by, 0.5, 0, tx, ty, 0.35, h, 1, P2.papyrus, F.id);
        // Its starburst: fine rays bursting out and drooping.
        if (g > 0.6) for (let k = 0; k < s.rays; k++) { const a = k / s.rays * TAU + s.ph, L = 4.5 * g; r.tube(tx, ty, 0.2, h, tx + Math.cos(a) * L, ty + Math.sin(a) * L, 0.15, h - 1.5, 1, P2.umbel, F.id2); }
      }
    } },
  yellowlily: { main: P2.nupharPad, accent: P2.yellow,
    make(F) { const a0 = rand(0, TAU); F.pads = Array.from({ length: randi(3, 4) }, (_, k) => ({ ox: k ? Math.cos(a0 + k * 2.1) * 8.5 : 0, oy: k ? Math.sin(a0 + k * 2.1) * 8.5 : 0, r: rand(3.6, 5), a: rand(0, TAU) })); F.cups = randi(1, 2); },
    draw(F, r, t, world, g) {
      const bob = Math.sin(t * 0.5 + F.ph) * 0.2;
      for (const p of F.pads) r.ellipsoid(F.x + p.ox, F.y + p.oy, p.r * (0.5 + 0.5 * g), p.r * 0.85 * (0.5 + 0.5 * g), p.a, SURF + bob, 0.9, (lx, ly) => (lx > 0 && Math.abs(ly) < 0.12 ? null : P2.nupharPad), F.id); // (oval pads, a deep slit)
      // The flower: a thick yellow cup held just above the water.
      if (g > 0.7) for (let c = 0; c < F.cups; c++) { const cx = F.x + 2 + c * 3, cy = F.y - 1 - c * 2; r.tube(cx, cy, 0.3, SURF, cx, cy, 0.3, SURF + 3, 1, P2.stem, F.id); r.ellipsoid(cx, cy, 1.7, 1.7, 0, SURF + 3, 2.4, (lx, ly) => (lx * lx + ly * ly < 0.18 ? P2.nupharPad : P2.yellow), F.id2); }
    } },
  victoria: { main: P2.vicPad, accent: P2.vicFlower,
    make(F) { F.R = rand(11, 15); F.second = Math.random() < 0.6 ? { a: rand(0, TAU), R: rand(7, 10) } : null; F.bloom = Math.random() < 0.6; },
    draw(F, r, t, world, g) {
      const pad = (x, y, R) => {
        R *= 0.4 + 0.6 * g;
        // A huge round tray: ribbed from its centre, its rim turned up and showing red.
        r.ellipsoid(x, y, R, R, 0, SURF, 0.6, (lx, ly) => { const d = lx * lx + ly * ly; return d > 0.86 ? P2.vicRim : ((Math.atan2(ly, lx) * 9 / PI) % 1 + 1) % 1 < 0.12 ? P2.stem : P2.vicPad; }, F.id);
        r.ellipsoid(x, y, R, R, 0, SURF + 1.4, 0.6, (lx, ly) => (lx * lx + ly * ly > 0.9 ? P2.vicRim : null), F.id);
      };
      pad(F.x, F.y, F.R);
      if (F.second) pad(F.x + Math.cos(F.second.a) * (F.R + F.second.R + 1), F.y + Math.sin(F.second.a) * (F.R + F.second.R + 1), F.second.R);
      if (F.bloom && g > 0.8) { const open = 0.5 + 0.5 * Math.sin(t * 0.05 + F.ph), fx = F.x - F.R - 2, fy = F.y; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; r.ellipsoid(fx + Math.cos(a) * 2 * (0.6 + open * 0.4), fy + Math.sin(a) * 2 * (0.6 + open * 0.4), 2.2, 1, a, SURF + 1.5, 1.8, open < 0.5 ? P2.vicRim : P2.vicFlower, F.id2); } }
    } },
  milfoil: { main: P2.milfoil, accent: P2.milfoilTip,
    make(F) { F.stems = Array.from({ length: randi(2, 4) }, () => ({ ox: rand(-5, 5), oy: rand(-5, 5), h: rand(28, 44), ph: rand(0, TAU) })); },
    draw(F, r, t, world, g, cur) {
      for (const s of F.stems) {
        let px = F.x + s.ox, py = F.y + s.oy;
        const n = Math.max(3, Math.round(s.h * g / 6));
        for (let k = 1; k <= n; k++) {
          const f = k / n, nx = F.x + s.ox + (Math.sin(t * 0.8 + s.ph + k * 0.4) * 0.8 + cur.x * 1.6 + F.px * 0.3) * f, ny = F.y + s.oy + (cur.y * 1.6 + F.py * 0.3) * f, z = k * 6, top = k === n;
          r.tube(px, py, 0.35, z - 6, nx, ny, 0.3, z, 1, P2.milfoil, F.id);
          // A whorl of four feather leaves, each a rib with fine teeth; red at the tips.
          for (let q = 0; q < 4; q++) { const a = q / 4 * TAU + k * 0.8, m = top ? P2.milfoilTip : P2.milfoil, L = top ? 1.6 : 3.6, ex = nx + Math.cos(a) * L, ey = ny + Math.sin(a) * L;
            r.tube(nx, ny, 0.2, z, ex, ey, 0.15, z + 0.5, 1, m, top ? F.id2 : F.id);
            for (const u of [0.4, 0.7]) { const mx = lerp(nx, ex, u), my = lerp(ny, ey, u); r.dot(mx - Math.sin(a) * 0.8, my + Math.cos(a) * 0.8, z + 0.3, m, top ? F.id2 : F.id); r.dot(mx + Math.sin(a) * 0.8, my - Math.cos(a) * 0.8, z + 0.3, m, top ? F.id2 : F.id); } }
          px = nx; py = ny;
        }
      }
    } },
  cabomba: { main: P2.cabomba, accent: P2.cabomba,
    make(F) { F.stems = Array.from({ length: randi(2, 4) }, () => ({ ox: rand(-6, 6), oy: rand(-6, 6), h: rand(20, 34), ph: rand(0, TAU) })); },
    draw(F, r, t, world, g, cur) {
      for (const s of F.stems) {
        let px = F.x + s.ox, py = F.y + s.oy;
        const n = Math.max(2, Math.round(s.h * g / 7));
        for (let k = 1; k <= n; k++) {
          const f = k / n, nx = F.x + s.ox + (Math.sin(t * 0.9 + s.ph + k * 0.4) * 0.7 + cur.x * 1.4 + F.px * 0.3) * f, ny = F.y + s.oy + (cur.y * 1.4 + F.py * 0.3) * f, z = k * 7;
          r.tube(px, py, 0.3, z - 7, nx, ny, 0.25, z, 1, P2.cabomba, F.id);
          // A pair of opposite fans, each a half-circle of fine segments, turned a quarter at each node.
          for (const side of [0, PI]) { const a0 = k * PI / 2 + side; for (let q = -2; q <= 2; q++) { const a = a0 + q * 0.42; r.tube(nx, ny, 0.12, z, nx + Math.cos(a) * 3.6, ny + Math.sin(a) * 3.6, 0.1, z + 0.4, 1, P2.cabomba, F.id); r.dot(nx + Math.cos(a) * 3.9, ny + Math.sin(a) * 3.9, z + 0.5, P2.riccia, F.id); } }
          px = nx; py = ny;
        }
      }
    } },
  waterlettuce: { main: P2.lettuce, accent: P2.lettuce,
    make(F) { F.roses = Array.from({ length: randi(1, 3) }, (_, k) => ({ ox: k ? rand(-6, 6) : 0, oy: k ? rand(-6, 6) : 0, n: randi(7, 10), s: rand(0.7, 1.1) })); },
    draw(F, r, t, world, g) {
      const bob = Math.sin(t * 0.6 + F.ph) * 0.3;
      for (const R of F.roses) for (let k = 0; k < R.n; k++) {
        // Ridged, spoon-shaped leaves fanning out from the heart, inner ones standing higher.
        const a = k / R.n * TAU + R.ox, L = (k % 2 ? 2 : 2.8) * R.s * (0.5 + 0.5 * g);
        r.ellipsoid(F.x + R.ox + Math.cos(a) * L, F.y + R.oy + Math.sin(a) * L, 2.4 * R.s, 1.7 * R.s, a, SURF - 0.5 + bob + (k % 2) * 0.8, 1.4, (lx, ly) => (((ly + 1) * 4) % 1 < 0.22 ? P2.stem : P2.lettuce), F.id);
      }
    } },
  frogbit: { main: P2.frogbit, accent: P2.white,
    make(F) { F.a = rand(0, TAU); F.leaves = Array.from({ length: randi(5, 9) }, (_, k) => ({ d: k * 2.6 + rand(-0.5, 0.5), o: rand(-2.5, 2.5), r: rand(1.2, 1.8), a: rand(0, TAU) })); F.flowers = randi(0, 2); },
    draw(F, r, t, world, g) {
      const bob = Math.sin(t * 0.6 + F.ph) * 0.2, ca = Math.cos(F.a), sa = Math.sin(F.a);
      // A chain of little heart-shaped pads along a floating runner.
      const n = Math.max(2, Math.round(F.leaves.length * g));
      for (let i = 0; i < n; i++) { const L = F.leaves[i], x = F.x + ca * L.d - sa * L.o, y = F.y + sa * L.d + ca * L.o; r.ellipsoid(x, y, L.r, L.r, L.a, SURF + bob, 0.6, (lx, ly) => (lx > 0.4 && Math.abs(ly) < 0.15 ? null : P2.frogbit), F.id); }
      for (let i = 0; i < F.flowers && g > 0.7; i++) { const L = F.leaves[i * 2 + 1] || F.leaves[0], x = F.x + ca * L.d - sa * L.o + 1, y = F.y + sa * L.d + ca * L.o; for (let q = 0; q < 3; q++) { const a = q / 3 * TAU; r.ellipsoid(x + Math.cos(a) * 0.7, y + Math.sin(a) * 0.7, 0.8, 0.6, a, SURF + 1 + bob, 0.5, P2.white, F.id2); } r.dot(x, y, SURF + 1.6, P2.yellow, F.id2); }
    } },
  javamoss: { main: P2.jmoss, accent: P2.wood,
    make(F) { F.a = rand(0, PI); F.L = rand(10, 14); F.tangles = Array.from({ length: 26 }, () => ({ u: rand(-0.6, 0.6), o: rand(-3, 3), r: rand(0.8, 1.6), a: rand(0, TAU), len: rand(1.5, 3.5) })); },
    draw(F, r, t, world, g) {
      const ca = Math.cos(F.a), sa = Math.sin(F.a), L = F.L / 2;
      // A twist of driftwood, and the moss grown over it in loose strands.
      r.tube(F.x - ca * L, F.y - sa * L, 1.4, 0, F.x + ca * L, F.y + sa * L, 1, 0, 0.9, P2.wood, F.id2);
      r.tube(F.x + ca * L * 0.3, F.y + sa * L * 0.3, 0.7, 1, F.x + ca * L * 0.3 - sa * 4, F.y + sa * L * 0.3 + ca * 4, 0.5, 0.5, 0.9, P2.wood, F.id2);
      for (const q of F.tangles) {
        if (Math.abs(q.u) > 0.15 + 0.45 * g) continue;
        const x = F.x + ca * q.u * F.L - sa * q.o * 0.6, y = F.y + sa * q.u * F.L + ca * q.o * 0.6, z = 1.6 + Math.sin(t * 0.5 + q.a) * 0.2;
        r.ellipsoid(x, y, q.r, q.r * 0.8, q.a, z, q.r * 0.7, P2.jmoss, F.id);
        r.tube(x, y, 0.2, z, x + Math.cos(q.a) * q.len, y + Math.sin(q.a) * q.len, 0.15, z - 0.8, 1, P2.jmoss, F.id);
      }
    } },
  riccia: { main: P2.riccia, accent: P2.pearl,
    make(F) { F.lobes = Array.from({ length: 34 }, () => { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * 6; return { ox: Math.cos(a) * d, oy: Math.sin(a) * d * 0.8, a: rand(0, TAU) }; }); F.pearls = Array.from({ length: 10 }, () => [rand(-5, 5), rand(-4, 4), rand(0, TAU)]); },
    draw(F, r, t, world, g) {
      // A cushion of little forked lobes, pearling with oxygen in the light.
      const k = 0.5 + 0.5 * g;
      for (const L of F.lobes) { const x = F.x + L.ox * k, y = F.y + L.oy * k, z = 2.4 * (1 - (L.ox * L.ox + L.oy * L.oy) / 40) * k; for (const b of [-0.35, 0.35]) r.ellipsoid(x + Math.cos(L.a + b) * 0.8, y + Math.sin(L.a + b) * 0.8, 1, 0.45, L.a + b, z, 0.6, P2.riccia, F.id); }
      const lit = !world || (world.darkness || 0) < 0.5;
      if (lit) for (const [ox, oy, ph] of F.pearls) if (Math.sin(t * 0.8 + ph) > 0.2) r.dot(F.x + ox * k, F.y + oy * k, 3.4 * k, P2.pearl, F.id2);
    } },
  wildcelery: { main: P2.vallis, accent: P2.vallis,
    make(F) { F.ribbons = Array.from({ length: randi(6, 9) }, () => ({ ox: rand(-3, 3), oy: rand(-3, 3), ph: rand(0, TAU), lie: rand(6, 14), da: rand(-0.7, 0.7) })); },
    draw(F, r, t, world, g, cur) {
      const ang = Math.atan2(cur.y || 0.001, cur.x || 0.001);
      for (const R of F.ribbons) {
        // Up from the floor, then laid along the surface by the current, twisting as it goes.
        let px = F.x + R.ox, py = F.y + R.oy, pz = 0;
        const top = SURF * (0.3 + 0.7 * g);
        for (let k = 1; k <= 10; k++) {
          const f = k / 10, rise = Math.min(1, f * 1.6), along = Math.max(0, f - 0.6) / 0.4 * R.lie * g, sw = Math.sin(t * 0.7 + R.ph + k * 0.5);
          const nx = F.x + R.ox + Math.cos(ang + R.da + sw * 0.3) * along + sw * 0.6 * f + F.px * 0.3 * f, ny = F.y + R.oy + Math.sin(ang + R.da + sw * 0.3) * along + F.py * 0.3 * f, nz = top * rise;
          r.tube(px, py, 0.7, pz, nx, ny, 0.6, nz, 0.25 + 0.2 * Math.abs(sw), P2.vallis, F.id);
          px = nx; py = ny; pz = nz;
        }
      }
    } },
  hairgrass: { main: P2.hair, accent: P2.runner,
    make(F) { F.clumps = Array.from({ length: randi(3, 5) }, () => ({ ox: rand(-6, 6), oy: rand(-6, 6), blades: Array.from({ length: randi(8, 12) }, () => ({ a: rand(0, TAU), h: rand(4, 8), ph: rand(0, TAU) })) })); },
    draw(F, r, t, world, g, cur) {
      for (let i = 1; i < F.clumps.length; i++) { const a = F.clumps[i - 1], b = F.clumps[i]; r.tube(F.x + a.ox, F.y + a.oy, 0.25, 0.2, F.x + b.ox, F.y + b.oy, 0.25, 0.2, 0.6, P2.runner, F.id2); } // (runners between clumps)
      for (const c of F.clumps) for (const b of c.blades) {
        // A tuft of hair-fine blades fanning up.
        const bx = F.x + c.ox, by = F.y + c.oy, h = b.h * (0.3 + 0.7 * g), sw = 2 + Math.sin(t * 1.3 + b.ph) * 0.4;
        r.tube(bx, by, 0.2, 0, bx + Math.cos(b.a) * sw + cur.x * 1.5 + F.px * 0.2, by + Math.sin(b.a) * sw + cur.y * 1.5 + F.py * 0.2, 0.12, h, 1, P2.hair, F.id);
      }
    } },
  pennywort: { main: P2.penny, accent: P2.runner,
    make(F) { F.a = rand(0, TAU); F.L = rand(12, 18); F.leaves = Array.from({ length: randi(6, 9) }, (_, k) => ({ u: (k + 0.5) / 8, side: k % 2 ? 1 : -1, h: rand(1.5, 5), r: rand(1.4, 2.2) })); },
    draw(F, r, t, world, g) {
      const L = F.L * (0.4 + 0.6 * g), pt = (u) => { const a = F.a + Math.sin(u * 4 + F.ph) * 0.4; return [F.x + Math.cos(a) * L * u, F.y + Math.sin(a) * L * u]; };
      let [px, py] = pt(0);
      for (let k = 1; k <= 8; k++) { const [nx, ny] = pt(k / 8); r.tube(px, py, 0.35, 0.3, nx, ny, 0.3, 0.3, 1, P2.runner, F.id2); px = nx; py = ny; }
      // Round coin leaves on stalks, each held flat with its veins running from the middle.
      for (const lf of F.leaves) { if (lf.u > g + 0.1) continue; const [x, y] = pt(lf.u), ox = x - Math.sin(F.a) * lf.side * 2, oy = y + Math.cos(F.a) * lf.side * 2; r.tube(x, y, 0.2, 0.3, ox, oy, 0.2, lf.h, 1, P2.runner, F.id2); r.ellipsoid(ox, oy, lf.r, lf.r, 0, lf.h, 0.5, (lx, ly) => (((Math.atan2(ly, lx) * 5 / PI) % 1 + 1) % 1 < 0.15 && lx * lx + ly * ly > 0.08 ? P2.hair : P2.penny), F.id); }
    } },
  // ---- salt ----
  bullkelp: { main: P2.bullStipe, accent: P2.bullBlade,
    make(F) { F.ph2 = rand(0, TAU); F.n = randi(12, 16); F.blades = Array.from({ length: randi(10, 14) }, () => ({ a: rand(-0.8, 0.8), l: rand(8, 15), ph: rand(0, TAU) })); },
    draw(F, r, t, world, g, cur) {
      // One long whip of a stipe up to the surface, a round float, and a mane of long blades streaming downcurrent.
      let px = F.x, py = F.y, pz = 0;
      const top = SURF * (0.3 + 0.7 * g);
      for (let k = 1; k <= F.n; k++) {
        const f = k / F.n, lean = f * f, nx = F.x + (Math.sin(t * 0.5 + F.ph + k * 0.3) * 1.5 + cur.x * 7 + F.px * 0.4) * lean, ny = F.y + (Math.cos(t * 0.45 + F.ph2 + k * 0.3) * 1.2 + cur.y * 7 + F.py * 0.4) * lean, nz = top * f;
        r.tube(px, py, 0.45, pz, nx, ny, 0.4, nz, 1, P2.bullStipe, F.id);
        px = nx; py = ny; pz = nz;
      }
      r.ellipsoid(px, py, 2.4, 2.4, 0, pz - 1.5, 2.2, P2.bullFloat, F.id2);
      if (g > 0.6) { const down = Math.atan2(cur.y || 0.01, cur.x || 0.01); for (const b of F.blades) { const a = down + b.a + Math.sin(t * 0.6 + b.ph) * 0.15, L = b.l * g; r.tube(px, py, 0.9, pz - 0.5, px + Math.cos(a) * L, py + Math.sin(a) * L, 0.5, pz - 1, 0.3, P2.bullBlade, F.id2); } }
    } },
  sargassum: { main: P2.sarg, accent: P2.sargBerry,
    make(F) { F.sprigs = Array.from({ length: randi(9, 13) }, () => { const a = rand(0, TAU), d = rand(0, 8); return { ox: Math.cos(a) * d, oy: Math.sin(a) * d, a: rand(0, TAU), l: rand(3, 5) }; }); },
    draw(F, r, t, world, g) {
      // A drifting golden mat at the surface: branching sprigs of serrated leaves, and berry-like floats.
      const bob = Math.sin(t * 0.5 + F.ph) * 0.3, k = 0.5 + 0.5 * g, dx = Math.sin(t * 0.08 + F.ph) * 1.5;
      for (const s of F.sprigs) {
        const x = F.x + dx + s.ox * k, y = F.y + s.oy * k, z = SURF - 0.5 + bob;
        for (const b of [-0.6, 0, 0.6]) { const a = s.a + b, ex = x + Math.cos(a) * s.l, ey = y + Math.sin(a) * s.l; r.tube(x, y, 0.3, z, ex, ey, 0.2, z, 1, P2.sarg, F.id); r.ellipsoid(lerp(x, ex, 0.6), lerp(y, ey, 0.6), 1.2, 0.5, a + 0.6, z, 0.4, P2.sarg, F.id); r.ellipsoid(ex, ey, 0.6, 0.6, 0, z + 0.3, 0.7, P2.sargBerry, F.id2); }
      }
    } },
  turtlegrass: { main: P2.turtle, accent: P2.epi,
    make(F) { F.shoots = Array.from({ length: randi(5, 8) }, () => ({ ox: rand(-6, 6), oy: rand(-6, 6), blades: randi(3, 5), a: rand(0, TAU), h: rand(9, 14), ph: rand(0, TAU) })); },
    draw(F, r, t, world, g, cur) {
      for (const s of F.shoots) for (let b = 0; b < s.blades; b++) {
        // Broad, flat ribbons from each shoot, laid over in the swell, speckled with growth near their tips.
        const a = s.a + (b - s.blades / 2) * 0.35 + Math.sin(t * 1 + s.ph + b) * 0.25, h = s.h * (0.3 + 0.7 * g), L = 2.5 + cur.s * 3;
        const bx = F.x + s.ox, by = F.y + s.oy, ex = bx + Math.cos(a) * L + cur.x * 2 + F.px * 0.3, ey = by + Math.sin(a) * L + cur.y * 2 + F.py * 0.3;
        r.tube(bx, by, 0.75, 0, ex, ey, 0.6, h, 0.3, (u) => (u > 0.75 && ((u * 31 + b) % 1) < 0.3 ? P2.epi : P2.turtle), F.id);
      }
    } },
  shoalgrass: { main: P2.shoal, accent: P2.rhizome,
    make(F) { F.a = rand(0, TAU); F.L = rand(14, 20); F.n = randi(7, 10); F.ph2 = rand(0, TAU); },
    draw(F, r, t, world, g, cur) {
      // A buried runner in a line, putting up pairs of thin blades at each node.
      const ca = Math.cos(F.a), sa = Math.sin(F.a), L = F.L * (0.4 + 0.6 * g);
      r.tube(F.x - ca * L / 2, F.y - sa * L / 2, 0.35, 0.1, F.x + ca * L / 2, F.y + sa * L / 2, 0.35, 0.1, 0.5, P2.rhizome, F.id2);
      for (let i = 0; i < F.n; i++) {
        const u = (i + 0.5) / F.n - 0.5, bx = F.x + ca * u * L, by = F.y + sa * u * L;
        for (const side of [-1, 1]) { const a = F.a + side * 1.2 + Math.sin(t * 1.4 + i + F.ph2) * 0.3, h = (4 + (i % 3)) * (0.3 + 0.7 * g); r.tube(bx, by, 0.3, 0, bx + Math.cos(a) * 1.4 + cur.x * 1.5, by + Math.sin(a) * 1.4 + cur.y * 1.5, 0.2, h, 0.5, P2.shoal, F.id); }
      }
    } },
  gorgonian: { main: P2.gorg, accent: P2.polyp,
    make(F) { F.ang = rand(0, PI); F.tree = []; const grow = (x, y, z, a, len, d) => { const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len, ez = z + len * 0.6; F.tree.push([x, y, z, ex, ey, ez, d]); if (d < 5) for (const s of [-1, 1]) grow(ex, ey, ez, a + s * rand(0.3, 0.6), len * rand(0.78, 0.9), d + 1); }; grow(0, 0, 0, F.ang, 3.2, 0); },
    draw(F, r, t, world, g) {
      // A branching tree of purple lace, every twig dotted with open polyps.
      const sway = Math.sin(t * 0.7 + F.ph) * 0.5, k = 0.4 + 0.6 * g;
      for (const [x0, y0, z0, x1, y1, z1, d] of F.tree) {
        const s0 = sway * z0 / 20, s1 = sway * z1 / 20;
        r.tube(F.x + x0 * k + s0, F.y + y0 * k, 0.7 - d * 0.09, z0 * k, F.x + x1 * k + s1, F.y + y1 * k, 0.6 - d * 0.08, z1 * k, 1, P2.gorg, F.id);
        if (d >= 4 && Math.sin(t * 0.9 + x1 * 3) > -0.3) r.dot(F.x + x1 * k + s1, F.y + y1 * k, z1 * k + 0.4, P2.polyp, F.id2);
      }
    } },
  seawhip: { main: P2.whipR, accent: P2.polyp,
    make(F) { F.whips = Array.from({ length: randi(5, 9) }, () => ({ ox: rand(-3, 3), oy: rand(-3, 3), h: rand(12, 22), ph: rand(0, TAU) })); F.m2 = Math.random() < 0.5 ? P2.whipR : P2.whipO; },
    draw(F, r, t, world, g, cur) {
      // A stand of long unbranched whips, swaying together in the swell.
      const sw = Math.sin(t * 0.8 + F.ph);
      for (const w of F.whips) {
        let px = F.x + w.ox, py = F.y + w.oy, pz = 0;
        for (let k = 1; k <= 5; k++) { const f = k / 5, nx = F.x + w.ox + (w.ox * 2.2 + sw * 2.2 + cur.x * 3 + F.px * 0.3) * f * f, ny = F.y + w.oy + (w.oy * 2.2 + Math.cos(t * 0.6 + w.ph) * 0.6 + cur.y * 3 + F.py * 0.3) * f * f, nz = w.h * (0.4 + 0.6 * g) * f; r.tube(px, py, 0.55, pz, nx, ny, 0.45, nz, 1, (u) => ((u * 6 + k) % 1 < 0.2 ? P2.polyp : F.m2), F.id); px = nx; py = ny; pz = nz; }
      }
    } },
  tubesponge: { main: P2.tubeP, accent: P2.hole,
    make(F) { F.m2 = Math.random() < 0.5 ? P2.tubeP : P2.tubeB; F.pipes = Array.from({ length: randi(4, 7) }, (_, k) => { const a = k * 2.4, d = k ? rand(1.8, 3.5) : 0; return { ox: Math.cos(a) * d, oy: Math.sin(a) * d, r: rand(1.4, 2.1), h: rand(9, 18), lean: rand(-0.12, 0.12) }; }); },
    draw(F, r, t, world, g) {
      // Organ pipes from one foot: tall tubes leaning a little apart, each with a lipped rim and a dark well.
      for (const p of F.pipes) {
        const h = p.h * (0.3 + 0.7 * g), tx = F.x + p.ox * 2 + p.lean * h, ty = F.y + p.oy * 2;
        r.tube(F.x + p.ox * 0.5, F.y + p.oy * 0.5, p.r * 0.9, 0, tx, ty, p.r, h, 1, F.m2, F.id);
        r.ellipsoid(tx, ty, p.r * 1.15, p.r * 1.15, 0, h, 0.5, (lx, ly) => (lx * lx + ly * ly < 0.45 ? P2.hole : F.m2), F.id2);
      }
    } },
  firesponge: { main: P2.fire, accent: P2.hole,
    make(F) { F.blobs = Array.from({ length: randi(7, 11) }, () => { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * 7; return [Math.cos(a) * d, Math.sin(a) * d * 0.8, rand(2, 3.6)]; }); F.osc = Array.from({ length: randi(3, 5) }, () => [rand(-5, 5), rand(-4, 4)]); },
    draw(F, r, t, world, g) {
      // A crust of orange-red over a rock, spreading in lumps, with little volcano mouths here and there.
      const k = 0.5 + 0.5 * g;
      r.ellipsoid(F.x, F.y, 6, 5, F.ph, 0, 2.5, P2.rock, F.id2);
      for (const [ox, oy, R] of F.blobs) r.ellipsoid(F.x + ox * k, F.y + oy * k, R * k, R * k * 0.85, ox, 0.8, 1.6, (lx, ly, px, py) => (hash2(px, py, 13) > 0.85 ? P2.whipO : P2.fire), F.id);
      for (const [ox, oy] of F.osc) r.ellipsoid(F.x + ox * k, F.y + oy * k, 1.1, 1.1, 0, 2.2, 1.2, (lx, ly) => (lx * lx + ly * ly < 0.25 ? P2.hole : P2.fire), F.id);
    } },
  caulerpa: { main: P2.caul, accent: P2.runner,
    make(F) { F.a = rand(0, TAU); F.L = rand(12, 18); F.fronds = randi(5, 7); },
    draw(F, r, t, world, g, cur) {
      const L = F.L * (0.4 + 0.6 * g), pt = (u) => { const a = F.a + Math.sin(u * 3 + F.ph) * 0.4; return [F.x + Math.cos(a) * L * u, F.y + Math.sin(a) * L * u]; };
      let [px, py] = pt(0);
      for (let k = 1; k <= 8; k++) { const [nx, ny] = pt(k / 8); r.tube(px, py, 0.3, 0.3, nx, ny, 0.3, 0.3, 1, P2.runner, F.id2); px = nx; py = ny; }
      // Upright feathers off the runner: a midrib with fine pinnules down both sides.
      for (let i = 0; i < F.fronds; i++) {
        const u = (i + 0.5) / F.fronds; if (u > g + 0.1) continue;
        const [x, y] = pt(u), a = F.a + PI / 2 * (i % 2 ? 1 : -1) + Math.sin(t * 0.8 + i) * 0.15, H = 4, ex = x + Math.cos(a) * 4.5 + cur.x, ey = y + Math.sin(a) * 4.5 + cur.y;
        r.tube(x, y, 0.25, 0.3, ex, ey, 0.2, H, 1, P2.caul, F.id);
        for (let q = 1; q <= 5; q++) { const f = q / 6, mx = lerp(x, ex, f), my = lerp(y, ey, f), mz = lerp(0.3, H, f); for (const s of [-1, 1]) r.tube(mx, my, 0.15, mz, mx - Math.sin(a) * s * 1.2, my + Math.cos(a) * s * 1.2, 0.12, mz + 0.5, 1, P2.caul, F.id); }
      }
    } },
  halimeda: { main: P2.hali, accent: P2.haliPale,
    make(F) { F.chains = []; const grow = (x, y, z, a, n, d) => { for (let i = 0; i < n; i++) { x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.5; z += 1.3; F.chains.push([x, y, z, a, d]); a += rand(-0.25, 0.25); if (d < 2 && i === 1 && Math.random() < 0.7) grow(x, y, z, a + rand(0.5, 0.9) * (Math.random() < 0.5 ? -1 : 1), n - 1, d + 1); } }; for (let k = 0; k < 3; k++) grow(0, 0, 0.5, k / 3 * TAU + rand(-0.3, 0.3), randi(4, 6), 0); },
    draw(F, r, t, world, g) {
      // Chains of flat green discs, branching, going chalk-white where the oldest have died.
      const n = Math.max(3, Math.round(F.chains.length * (0.4 + 0.6 * g)));
      for (let i = 0; i < n; i++) { const [x, y, z, a, d] = F.chains[i]; r.ellipsoid(F.x + x, F.y + y, 1.2, 0.9, a + PI / 2, z, 0.5, d === 0 && i % 4 === 0 ? P2.haliPale : P2.hali, i % 4 === 0 ? F.id2 : F.id); }
    } },
  turfalgae: { main: P2.turf, accent: P2.rock,
    make(F) { F.rocks = Array.from({ length: randi(1, 3) }, (_, k) => [k ? rand(-5, 5) : 0, k ? rand(-5, 5) : 0, rand(3, 5)]); },
    draw(F, r, t, world, g) {
      // Rocks furred over in short red turf (the fuzz thins toward the edges as it spreads).
      for (const [ox, oy, R] of F.rocks) r.ellipsoid(F.x + ox, F.y + oy, R, R * 0.85, ox, 0, R * 0.7, (lx, ly, px, py) => { const d = lx * lx + ly * ly; return d < 0.3 + 0.6 * g && hash2(px, py, 17) > 0.15 ? (hash2(px, py, 5) > 0.7 ? P2.milfoilTip : P2.turf) : P2.rock; }, F.id);
    } },
  sealettuce: { main: P2.sheet, accent: P2.sheet,
    make(F) { F.sheets = Array.from({ length: randi(2, 4) }, () => ({ ox: rand(-5, 5), oy: rand(-5, 5), a: rand(0, TAU), r: rand(3, 5), s: rand(0, 9) })); },
    draw(F, r, t, world, g) {
      // Thin, ruffled green sheets drifting at the surface, torn and see-through in places.
      const bob = Math.sin(t * 0.5 + F.ph) * 0.3;
      for (const S of F.sheets) { const R = S.r * (0.5 + 0.5 * g); r.alpha = 0.85; r.ellipsoid(F.x + S.ox, F.y + S.oy, R * 1.3, R, S.a + Math.sin(t * 0.2 + S.s) * 0.1, SURF - 0.3 + bob, 0.4, (lx, ly, px, py) => { const edge = 1 - (lx * lx + ly * ly), n = vnoise(px * 0.5, py * 0.5, S.s | 0); return n > 0.72 || edge < 0.15 * (0.5 + Math.sin(Math.atan2(ly, lx) * 7)) ? null : n < 0.3 ? P2.turtle : P2.sheet; }, F.id); }
      r.alpha = 1;
    } },
  mangrove: { main: P2.mroot, accent: P2.mleaf,
    make(F) { F.trees = Array.from({ length: randi(2, 3) }, (_, k) => ({ ox: k ? rand(-6, 6) : 0, oy: k ? rand(-6, 6) : 0, roots: randi(5, 7), a0: rand(0, TAU), h: rand(50, 56) })); },
    draw(F, r, t, world, g) {
      for (const T of F.trees) {
        const tx = F.x + T.ox, ty = F.y + T.oy, h = 10 + (T.h - 10) * g;
        // Stilt roots arching down from low on the trunk, the trunk up through the water, a little crown above it.
        for (let k = 0; k < T.roots; k++) { const a = T.a0 + k / T.roots * TAU, mx = tx + Math.cos(a) * 2.2, my = ty + Math.sin(a) * 2.2; r.tube(tx, ty, 0.5, 14 * g, mx, my, 0.4, 10 * g, 1, P2.mroot, F.id); r.tube(mx, my, 0.4, 10 * g, tx + Math.cos(a) * 4.5, ty + Math.sin(a) * 4.5, 0.35, 0, 1, P2.mroot, F.id); }
        r.tube(tx, ty, 0.7, 10 * g, tx, ty, 0.5, h, 1, P2.mroot, F.id);
        if (g > 0.6) { for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + T.a0; r.ellipsoid(tx + Math.cos(a) * 1.8, ty + Math.sin(a) * 1.8, 1.8, 0.9, a, h, 0.8, P2.mleaf, F.id2); } r.tube(tx + 1, ty + 1, 0.3, h - 1, tx + 1.2, ty + 1.2, 0.3, h - 5, 1, P2.pod, F.id2); }
      }
    } },
};

// A plant grown on another's form: it lives as the form does, and draws in its own shape (or, without one, as the
// form, with its own colours swapped in while it does).
class FloraVariant extends FloraPlant {
  constructor(x, y, kind) {
    const V = FLORA_PLANTS2[kind];
    super(x, y, V.form);
    this.V = V;
    if (V.fans) this.m = pick(V.fans);
    this.shape2 = PLANT_SHAPES2[kind] || null;
    if (this.shape2) this.shape2.make(this);
    this.swap(() => { OUTLINE[this.id] = outlineOf(this.mainMat()); OUTLINE[this.id2] = outlineOf(this.accentMat()); });
  }
  mainMat() { return this.shape2 ? this.shape2.main : super.mainMat(); }
  accentMat() { return this.shape2 ? this.shape2.accent : super.accentMat(); }
  swap(fn) {
    const M = this.V.mats;
    if (!M) return fn();
    const old = {};
    for (const k in M) { old[k] = FM[k]; FM[k] = M[k]; }
    try { return fn(); } finally { for (const k in M) FM[k] = old[k]; }
  }
  draw(r, t, world) {
    if (!this.shape2) { this.swap(() => super.draw(r, t, world)); return; }
    const g = FLORA_FLOAT.has(this.kind) ? this.growth ?? 1 : 1, cur = world ? world.current : { x: 0, y: 0, s: 0 };
    this.shape2.draw(this, r, t, world, g, cur);
  }
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
