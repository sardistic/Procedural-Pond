'use strict';
// Skins: named colour varieties within each species (koi come as kohaku, showa, ogon...). A seventh gene stream
// (genome7/<seed>) holds one roll in [0, 1) that picks the variety from the species' list, so a link rebuilds it
// from the animal's seed and parents like every other gene. Young usually take one parent's roll, and now and then
// a new one; the wild variety is the commonest. A skin is cosmetic: it doesn't change the rarity tier.
//
// Each variety is a tone (how its colours shift) and a pattern painted into its baked skin (where a body has one):
//   tone:   ember, jade, cobalt, violet, sand, ink, white, gold, rose, frost, rust, moss
//   paint:  patches, bands, spots, saddle, speckle, stripe, belly, cap   (with an accent colour or 'dark'/'light')

const SKIN_TONES = {
  ember: (h, s, l) => [12 + (h - 12) * 0.25, Math.min(1, s * 1.2 + 0.1), l],
  jade: (h, s, l) => [150, Math.min(1, s * 0.9 + 0.05), l],
  cobalt: (h, s, l) => [215, Math.min(1, s * 1.05 + 0.08), l * 0.92],
  violet: (h, s, l) => [282, Math.min(1, s * 0.9 + 0.08), l],
  sand: (h, s, l) => [38, s * 0.4, Math.min(0.85, l * 1.08 + 0.06)],
  ink: (h, s, l) => [h, s * 0.35, l * 0.42],
  white: (h, s, l) => [h, s * 0.08, 0.7 + l * 0.3],
  gold: (h, s, l) => [44, Math.min(1, s * 1.1 + 0.2), Math.min(0.88, l * 1.1 + 0.08)],
  rose: (h, s, l) => [340, Math.min(1, s * 0.8 + 0.12), Math.min(0.85, l * 1.05 + 0.05)],
  frost: (h, s, l) => [196, s * 0.35, Math.min(0.9, l * 1.1 + 0.1)],
  rust: (h, s, l) => [22, s * 0.75, l * 0.78],
  moss: (h, s, l) => [92, s * 0.6, l * 0.82],
};
// [name, tone, paint, accent]: accent is a colour, or 'dark' / 'light' (the skin's own colour darkened or paled).
const SKINS = {
  koi: [['kohaku', 'white', 'patches', '#d8341e'], ['sanke', 'white', 'patches', '#d8341e'], ['showa', 'ink', 'patches', '#e04a1e'], ['ogon', 'gold', null, null],
    ['asagi', 'frost', 'belly', '#e0602a'], ['tancho', 'white', 'cap', '#e0281e'], ['utsuri', 'ink', 'patches', '#f0e8d8'], ['chagoi', 'rust', 'speckle', 'light']],
  tetra: [['cardinal', 'ember', 'stripe', '#3ad0ff'], ['black neon', 'ink', 'stripe', '#c8ffe8'], ['ember', 'ember', null, null], ['glowlight', 'frost', 'stripe', '#ff7a3a'], ['blue', 'cobalt', null, null]],
  eel: [['ribbon', 'cobalt', 'stripe', '#ffd84a'], ['dragon', 'ember', 'spots', 'light'], ['zebra', 'ink', 'bands', '#f0e8d8'], ['golden', 'gold', 'speckle', 'dark'], ['ghost', 'frost', null, null]],
  axolotl: [['golden albino', 'gold', null, null], ['copper', 'rust', 'speckle', 'dark'], ['melanoid', 'ink', null, null], ['wild-type', 'moss', 'spots', 'dark'], ['firefly', 'jade', 'speckle', '#a8ff6a']],
  turtle: [['map', 'moss', 'bands', '#e8d070'], ['painted', 'ink', 'stripe', '#e8402a'], ['yellow-bellied', 'sand', 'belly', '#f0d040'], ['red-eared', 'jade', 'cap', '#e0402a'], ['amber', 'gold', null, null]],
  crab: [['blue', 'cobalt', null, null], ['calico', 'sand', 'spots', '#c84a2a'], ['halloween', 'ink', 'patches', '#ff7a1e'], ['ghost', 'frost', null, null], ['rust', 'rust', 'speckle', 'dark']],
  ray: [['spotted eagle', 'ink', 'spots', '#f0f0e8'], ['blue-spotted', 'sand', 'spots', '#3aa8ff'], ['marbled', 'rust', 'speckle', 'light'], ['pale', 'frost', null, null]],
  frog: [['poison-dart blue', 'cobalt', 'spots', 'dark'], ['strawberry', 'ember', 'speckle', 'dark'], ['golden', 'gold', null, null], ['tiger', 'jade', 'bands', 'dark'], ['glass', 'frost', null, null]],
  snake: [['coral', 'ember', 'bands', '#1a1418'], ['banded', 'ink', 'bands', '#f0e8d8'], ['emerald', 'jade', 'speckle', 'light'], ['sand', 'sand', 'saddle', 'dark'], ['blue', 'cobalt', 'stripe', 'light']],
  snail: [['ramshorn', 'ember', null, null], ['mystery gold', 'gold', null, null], ['zebra nerite', 'ink', 'bands', '#f0d040'], ['blue', 'cobalt', null, null]],
  jelly: [['moon', 'frost', null, null], ['sea nettle', 'ember', 'stripe', 'dark'], ['blue blubber', 'cobalt', null, null], ['spotted lagoon', 'sand', 'spots', 'light'], ['crystal', 'white', null, null]],
  clown: [['black ocellaris', 'ink', 'bands', '#f8f4ea'], ['maroon', 'rust', 'bands', '#f0d040'], ['snowflake', 'ember', 'patches', '#f8f4ea'], ['platinum', 'white', null, null], ['lightning', 'ember', 'speckle', '#f8f4ea']],
  puffer: [['dogface', 'sand', 'spots', 'dark'], ['starry', 'ink', 'speckle', '#f0f0e8'], ['golden', 'gold', null, null], ['spotted green', 'jade', 'spots', 'dark']],
  octopus: [['blue-ringed', 'sand', 'spots', '#2a7aff'], ['mimic', 'sand', 'bands', 'dark'], ['red', 'ember', null, null], ['ghost', 'frost', 'speckle', 'light'], ['violet', 'violet', 'speckle', 'light']],
  duck: [['mandarin', 'ember', 'cap', '#3a7aff'], ['wood', 'jade', 'cap', '#e8402a'], ['white pekin', 'white', null, null], ['black', 'ink', null, null], ['buff', 'sand', null, null]],
  shrimp: [['cherry', 'ember', null, null], ['blue dream', 'cobalt', null, null], ['crystal red', 'white', 'bands', '#e0281e'], ['golden back', 'gold', 'saddle', '#f8f4ea'], ['tiger', 'sand', 'bands', 'dark']],
  dragonfly: [['scarlet', 'ember', null, null], ['azure', 'cobalt', null, null], ['emerald', 'jade', null, null], ['amber-winged', 'gold', null, null], ['violet dropwing', 'violet', null, null]],
  firefly: [['green', 'jade', null, null], ['amber', 'gold', null, null], ['blue ghost', 'frost', null, null]],
  starfish: [['blue linckia', 'cobalt', null, null], ['chocolate chip', 'sand', 'spots', '#2a1a10'], ['red', 'ember', null, null], ['purple', 'violet', 'speckle', 'light'], ['sunflower', 'gold', 'speckle', 'dark']],
};
// Any other kind (the invented wild fish and the rest) draws from these.
const SKINS_ANY = [['ember', 'ember', null, null], ['jade', 'jade', 'spots', 'dark'], ['cobalt', 'cobalt', 'stripe', 'light'], ['banded', 'sand', 'bands', 'dark'],
  ['speckled', 'ink', 'speckle', 'light'], ['saddled', 'rust', 'saddle', 'dark'], ['violet', 'violet', null, null], ['frost', 'frost', 'belly', 'light']];
// The wild variety takes about half the rolls; the others share the rest, the later ones rarer.
const SKIN_WILD = 0.5;

function makeGenome7() { return { skin: Math.random() }; }
function childGenome7(a, b, m = 1) {
  const r = Math.random();
  if (r < 0.06 * m) return { skin: Math.random() }; // a new variety turns up
  return { skin: r < 0.53 ? a.skin ?? Math.random() : b.skin ?? Math.random() };
}
const skinList = (species) => SKINS[species] || SKINS_ANY;
// The variety a roll gives in a species: null for the wild one.
function skinFor(species, roll) {
  if (roll == null || roll < SKIN_WILD) return null;
  const list = skinList(species), n = list.length;
  // (Weights 1, 0.85, 0.72, ...: the first varieties are the commonest.)
  let total = 0;
  for (let i = 0; i < n; i++) total += 0.85 ** i;
  let x = (roll - SKIN_WILD) / (1 - SKIN_WILD) * total;
  for (let i = 0; i < n; i++) { x -= 0.85 ** i; if (x <= 0) return list[i]; }
  return list[n - 1];
}
const skinOf = (c) => (c && c.life && c.life.genome ? skinFor(c.species, c.life.genome.skin) : null);
const skinName = (c) => { const s = skinOf(c); return s ? s[0] : null; };

// Four shades of one colour, for an accent painted into a skin.
const SKIN_ACCENTS = new Map();
function skinAccent(hex) {
  let m = SKIN_ACCENTS.get(hex);
  if (!m) {
    const [h, s, l] = rgbToHsl(hexToInt(hex));
    m = [0.55, 0.78, 1, 1.18].map((k) => hsl(h, s, Math.min(0.95, l * k)));
    SKIN_ACCENTS.set(hex, m);
  }
  return m;
}
// Whether a cell of a baked skin (u along the body 0..1, v across it -1..1) takes the pattern.
function skinPaint(kind, u, v, seed) {
  switch (kind) {
    case 'patches': return vnoise(u * 4.5 + seed, v * 1.8, 71) > 0.55;
    case 'bands': return ((u * 7 + vnoise(u * 3, v, 72 + seed) * 0.6) % 1) < 0.28;
    case 'spots': return vnoise(u * 11 + seed, v * 4, 73) > 0.68;
    case 'saddle': return v > 0.1 && ((u * 5) % 1) < 0.45;
    case 'speckle': return vnoise(u * 26 + seed, v * 9, 74) > 0.72;
    case 'stripe': return Math.abs(v - 0.15) < 0.16;
    case 'belly': return v < -0.25;
    case 'cap': return u < 0.16 && Math.abs(v) < 0.75;
    default: return false;
  }
}
// The accent for one cell: a colour, or the skin's own colour made darker or paler.
function skinAccentFor(accent, own) {
  if (accent === 'dark') return own.map((c) => { const [h, s, l] = rgbToHsl(c); return hsl(h, s, l * 0.5); });
  if (accent === 'light') return own.map((c) => { const [h, s, l] = rgbToHsl(c); return hsl(h, s * 0.6, Math.min(0.92, l * 1.25 + 0.12)); });
  return skinAccent(accent);
}
