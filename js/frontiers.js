'use strict';
// Named frontiers and an append-only catalogue. Existing kind codes and tier thresholds stay valid.
const FRONTIERS = [
  ['coast', 'The lantern coast', 'The lights in the roots', '#719f9b', '#c8d3af', '#d6c385'],
  ['brine', 'The brine labyrinth', 'The saltless well', '#34535c', '#6f9396', '#83d5c4'],
  ['bone', 'The ossuary plain', 'The bone aquifer', '#413e50', '#968b94', '#c6c4dd'],
  ['vents', 'The sulphur chimneys', 'The hot roots', '#382825', '#805844', '#dfab70'],
  ['ruins', 'The drowned observatory', 'The blind archive', '#263948', '#647b8b', '#8fb9dc'],
  ['mirror', 'The mirror basin', 'The black mirror', '#232d43', '#5c718c', '#b3dbe8'],
  ['hush', 'The hush', 'The stillness', '#273c38', '#527b70', '#86bdaa'],
  ['unmade', 'The unmade sea', 'The unwritten fen', '#30213e', '#6e5287', '#c6a2dc'],
  ['nursery', 'The night nursery', 'The sleeping roots', '#342735', '#785464', '#d4a4bf'],
].map(([key,salt,fresh,floor,ridge,glow],i)=>({ key,salt,fresh,floor:hexToInt(floor),ridge:hexToInt(ridge),glow, tier:15+i }));
for (const f of FRONTIERS) {
  PRE_NAMES.salt[f.tier - 9] = f.salt; PRE_NAMES.fresh[f.tier - 9] = f.fresh;
  Object.assign(DEPTH_TIERS[f.tier], { salt:f.salt, fresh:f.fresh, biome:f.key });
  SEA_KINDS[f.key] = { name:f.salt.toLowerCase(), glow:[f.glow] };
}
const frontierSeaBase = seaWanted;
seaWanted = (w) => { const tier = w.erosion?.tier || 0; return tier >= 15 ? FRONTIERS[Math.min(FRONTIERS.length-1,tier-15)].key : frontierSeaBase(w); };
const FRONTIER_BY_KEY = Object.fromEntries(FRONTIERS.map(f=>[f.key,f]));

// Every addition has a different body profile, silhouette, gait and habitat.
const FRONTIER_DESIGNS = [
  C({kind: 'porcelainhermit', label: 'Porcelain hermit', hab: 'salt', tier: 0, unlock: 38, deep: 0.00, stats: [2, 1, 0.55, 20], cruise: 1.4, note: 'A small pale scavenger, with thin grasping claws and a spiral shell.',
    look: { segs: 4, w: 2.1, legs: 3, leg: 1.4, reach: 1.8, claws: true, antennae: 3, shell: [4, 0.2, 0.4], base: [4, 0.3, 0.3], acc: [34, 0.55, 0.65], pat: 'spots' } }),
  F({kind: 'reedneedle', label: 'Reed needle', hab: 'fresh', tier: 0, unlock: 38, deep: 0.00, stats: [1, 1, 0.55, 20], z: [6, 26], cruise: 7, predator: true, small: true, school: true, group: [3, 5], note: 'A needle-thin hunter that hangs between the reeds.',
    look: { len: 15, depth: 0.07, nb: 12, tail: 'long', fins: 0.6, base: [12, 0.35, 0.45], acc: [47, 0.65, 0.65], pat: 'netted', extras: ['barbels', 'fangs', 'filaments'], glow: '#c6c4dd' } }),
  F({kind: 'velvetribbon', label: 'Velvet ribbon', hab: 'salt', tier: 1, unlock: 82, deep: 0.00, stats: [2, 1, 0.55, 55], z: [6, 26], cruise: 7, note: 'A red ribbon that folds round stones, its fins almost transparent.',
    look: { len: 20, depth: 0.07, nb: 12, tail: 'long', fins: 0.6, base: [24, 0.35, 0.45], acc: [59, 0.65, 0.65], pat: 'spots', extras: ['barbels', 'filaments'], glow: '#dfab70' } }),
  C({kind: 'marshstilt', label: 'Marsh stilt', hab: 'fresh', tier: 1, unlock: 82, deep: 0.00, stats: [1, 1, 0.55, 55], cruise: 1.4, note: 'A long-legged creature that feels for food before taking a step.',
    look: { segs: 7, w: 1.7, legs: 3, leg: 3.5, reach: 4.5, claws: true, antennae: 6, shell: [95, 0.2, 0.4], base: [95, 0.3, 0.3], acc: [125, 0.55, 0.65], pat: 'bars' } }),
  D({kind: 'copperbell', label: 'Copper bell', hab: 'both', tier: 2, unlock: 150, deep: 0.30, stats: [2, 1, 0.55, 90], z: [12, 32], light: { r: 8, col: '#b3dbe8' }, note: 'A copper-coloured bell trailing a long, uneven curtain of threads.',
    look: { R: 4.5, bell: [34, 0.3, 0.3], tent: [59, 0.45, 0.65], gonad: [79, 0.8, 0.6], lobes: 9, tentLen: 1.3, glow: true } }),
  F({kind: 'duskneedle', label: 'Dusk needle', hab: 'both', tier: 2, unlock: 150, deep: 0.30, stats: [2, 1, 0.55, 90], z: [6, 26], cruise: 7, predator: true, light: { r: 8, col: '#86bdaa' }, note: 'A low-lit hunter with a long snout and a single light under its throat.',
    look: { len: 20, depth: 0.07, nb: 12, tail: 'long', fins: 0.6, base: [18, 0.35, 0.45], acc: [53, 0.65, 0.65], pat: 'netted', extras: ['glowspots', 'fangs', 'filaments'], glow: '#86bdaa' } }),
  C({kind: 'threadcrab', label: 'Thread crab', hab: 'both', tier: 3, unlock: 238, deep: 0.34, stats: [2, 1, 0.55, 125], cruise: 1.4, light: { r: 8, col: '#c6a2dc' }, note: 'Its thread-thin legs feel across the cave floor. The claws stay folded until it strikes.',
    look: { segs: 5, w: 2.1, legs: 3, leg: 2.8, reach: 3.6, claws: true, antennae: 4, shell: [180, 0.2, 0.4], base: [180, 0.3, 0.3], acc: [210, 0.55, 0.65], pat: 'spots' } }),
  F({kind: 'falseface', label: 'False-face fish', hab: 'both', tier: 3, unlock: 238, deep: 0.34, stats: [3, 1, 0.55, 125], z: [6, 26], cruise: 4, predator: true, light: { r: 10, col: '#d4a4bf' }, note: 'Its pale mask turns toward prey before the dark body follows.',
    look: { len: 25, depth: 0.22, nb: 9, tail: 'lyre', fins: 0.6, base: [215, 0.35, 0.45], acc: [250, 0.65, 0.65], pat: 'twotone', extras: ['glowspots', 'fangs', 'plates', 'ribcage'], glow: '#d4a4bf' } }),
  D({kind: 'veilmedusa', label: 'Veil medusa', hab: 'both', tier: 4, unlock: 346, deep: 0.38, stats: [3, 2, 0.55, 160], z: [12, 32], light: { r: 10, col: '#83d5c4' }, note: 'A translucent veil. The lights in its bell close one at a time.',
    look: { R: 5.5, bell: [275, 0.3, 0.3], tent: [300, 0.45, 0.65], gonad: [320, 0.8, 0.6], lobes: 8, tentLen: 1.3, glow: true } }),
  F({kind: 'cinderjaw', label: 'Cinderjaw', hab: 'both', tier: 4, unlock: 346, deep: 0.38, stats: [4, 2, 0.55, 160], z: [6, 26], cruise: 4, predator: true, light: { r: 12, col: '#c6c4dd' }, note: 'A dark jaw with ember-coloured teeth, resting beside warm fissures.',
    look: { len: 30, depth: 0.16, nb: 9, tail: 'lyre', fins: 0.6, base: [5, 0.35, 0.2], acc: [40, 0.65, 0.65], pat: 'netted', extras: ['glowspots', 'fangs', 'wings'], glow: '#c6c4dd' } }),
  C({kind: 'ribwalker', label: 'Rib walker', hab: 'both', tier: 5, unlock: 472, deep: 0.42, stats: [3, 2, 0.55, 195], cruise: 1.9, light: { r: 10, col: '#dfab70' }, note: 'Pale ribs stand above the body. A forest of planted feet supports each slow lunge.',
    look: { segs: 4, w: 2.5, legs: 4, leg: 2.8, reach: 3.6, claws: true, antennae: 3, base: [15, 0.3, 0.3], acc: [45, 0.55, 0.65], pat: 'spots' } }),
  F({kind: 'lanternribbon', label: 'Lantern ribbon', hab: 'both', tier: 5, unlock: 472, deep: 0.42, stats: [3, 2, 0.55, 195], z: [6, 26], cruise: 4, light: { r: 10, col: '#8fb9dc' }, note: 'Its lights travel from head to tail, and sometimes travel back.',
    look: { len: 25, depth: 0.07, nb: 12, tail: 'long', fins: 0.6, base: [27, 0.35, 0.2], acc: [62, 0.65, 0.65], pat: 'twotone', extras: ['glowspots', 'filaments'], glow: '#8fb9dc' } }),
  F({kind: 'rootmaw', label: 'Root maw', hab: 'fresh', tier: 6, unlock: 617, deep: 0.46, stats: [4, 2, 0.55, 230], z: [6, 26], cruise: 4, predator: true, light: { r: 12, col: '#b3dbe8' }, note: 'It lies among the old roots with the jaw slightly open.',
    look: { len: 30, depth: 0.16, nb: 9, tail: 'lyre', fins: 0.6, base: [120, 0.35, 0.2], acc: [155, 0.65, 0.65], pat: 'dotline', extras: ['glowspots', 'fangs', 'wings'], glow: '#b3dbe8' } }),
  C({kind: 'saltwidow', label: 'Salt widow', hab: 'salt', tier: 6, unlock: 617, deep: 0.46, stats: [3, 2, 0.55, 230], cruise: 1.9, light: { r: 10, col: '#86bdaa' }, note: 'A narrow, black scavenger with a pair of bright grasping limbs.',
    look: { segs: 7, w: 2.5, legs: 4, leg: 2.1, reach: 2.7, claws: true, antennae: 6, base: [205, 0.3, 0.3], acc: [235, 0.55, 0.65], pat: 'bars' } }),
  D({kind: 'windowbell', label: 'Window bell', hab: 'both', tier: 7, unlock: 780, deep: 0.50, stats: [3, 2, 0.55, 265], z: [12, 32], light: { r: 10, col: '#c6a2dc' }, note: 'Something moves inside the bell like a silhouette behind wet glass.',
    look: { R: 5.5, bell: [190, 0.3, 0.3], tent: [215, 0.45, 0.65], gonad: [235, 0.8, 0.6], lobes: 9, tentLen: 1.9, glow: true } }),
  F({kind: 'choirneedle', label: 'Choir needle', hab: 'both', tier: 8, unlock: 959, deep: 0.54, stats: [3, 3, 0.55, 300], z: [6, 26], cruise: 4, small: true, school: true, group: [3, 5], light: { r: 10, col: '#d4a4bf' }, note: 'White needles gather in a circle without ever quite touching.',
    look: { len: 25, depth: 0.07, nb: 12, tail: 'long', fins: 0.6, base: [250, 0.35, 0.2], acc: [285, 0.65, 0.65], pat: 'twotone', extras: ['glowspots', 'filaments'], glow: '#d4a4bf' } }),
  F({kind: 'lanternskate', label: 'Lantern skate', hab: 'both', tier: 15, unlock: 2666, deep: 0.82, stats: [3, 4, 0.55, 545], z: [6, 26], cruise: 4, light: { r: 10, col: '#83d5c4' }, note: 'Broad fins fan past the last lanterns, stirring the pale sand.',
    look: { len: 25, depth: 0.22, nb: 9, tail: 'fan', fins: 1.3, base: [170, 0.35, 0.2], acc: [205, 0.65, 0.65], pat: 'dotline', extras: ['glowspots', 'wings'], glow: '#83d5c4' } }),
  C({kind: 'harborwidow', label: 'Harbor widow', hab: 'both', tier: 15, unlock: 2666, deep: 0.82, stats: [3, 4, 0.55, 545], cruise: 2.4, light: { r: 10, col: '#c6c4dd' }, note: 'A blue scavenger that waits underneath the harbor stones.',
    look: { segs: 6, w: 2.5, legs: 5, leg: 2.1, reach: 2.7, claws: true, antennae: 5, base: [30, 0.3, 0.3], acc: [60, 0.55, 0.65], pat: 'bars' } }),
  D({kind: 'afterlight', label: 'Afterlight bell', hab: 'both', tier: 15, unlock: 2666, deep: 0.82, stats: [2, 4, 0.55, 545], z: [12, 32], light: { r: 8, col: '#dfab70' }, note: 'It carries the last warm light a little farther into the dark.',
    look: { R: 4.5, bell: [40, 0.3, 0.3], tent: [65, 0.45, 0.65], gonad: [85, 0.8, 0.6], lobes: 8, tentLen: 1.9, glow: true } }),
  F({kind: 'saltglass', label: 'Saltglass eel', hab: 'both', tier: 16, unlock: 2971, deep: 0.82, stats: [3, 5, 0.55, 580], z: [6, 26], cruise: 4, light: { r: 10, col: '#8fb9dc' }, note: 'A transparent spine above the still brine; it never breaks the surface.',
    look: { len: 25, depth: 0.22, nb: 9, tail: 'fan', fins: 0.6, base: [170, 0.35, 0.2], acc: [205, 0.65, 0.65], pat: 'twotone', extras: ['glowspots', 'wings'], glow: '#8fb9dc' } }),
  C({kind: 'brineweaver', label: 'Brine weaver', hab: 'both', tier: 16, unlock: 2971, deep: 0.82, stats: [3, 5, 0.55, 580], cruise: 2.4, light: { r: 10, col: '#b3dbe8' }, note: 'Long antennae trace the salt crust before the feet follow.',
    look: { segs: 4, w: 2.5, legs: 5, leg: 1.4, reach: 1.8, claws: true, antennae: 3, base: [160, 0.3, 0.3], acc: [190, 0.55, 0.65], pat: 'spots' } }),
  D({kind: 'saltveil', label: 'Salt veil', hab: 'both', tier: 16, unlock: 2971, deep: 0.82, stats: [3, 5, 0.55, 580], z: [12, 32], light: { r: 10, col: '#86bdaa' }, note: 'Its lower threads hang motionless in the heavy water.',
    look: { R: 5.5, bell: [185, 0.3, 0.3], tent: [210, 0.45, 0.65], gonad: [230, 0.8, 0.6], lobes: 6, tentLen: 1.6, glow: true } }),
  F({kind: 'marrowmaw', label: 'Marrow maw', hab: 'both', tier: 17, unlock: 3291, deep: 0.82, stats: [5, 5, 0.55, 615], z: [6, 26], cruise: 4, predator: true, light: { r: 14, col: '#c6a2dc' }, note: 'A blunt, armoured head and a mouth lined with moving ivory.',
    look: { len: 35, depth: 0.22, nb: 9, tail: 'lyre', fins: 0.6, base: [20, 0.35, 0.2], acc: [55, 0.65, 0.65], pat: 'spots', extras: ['glowspots', 'fangs', 'plates', 'ribcage'], glow: '#c6a2dc' } }),
  C({kind: 'ossuaryspider', label: 'Ossuary spider', hab: 'both', tier: 17, unlock: 3291, deep: 0.82, stats: [4, 5, 0.55, 615], cruise: 2.4, light: { r: 12, col: '#d4a4bf' }, note: 'A ribbed body hangs high above eight feeler-like legs.',
    look: { segs: 7, w: 2.9, legs: 5, leg: 3.5, reach: 4.5, claws: true, antennae: 6, base: [45, 0.3, 0.3], acc: [75, 0.55, 0.65], pat: 'bars' } }),
  D({kind: 'ribcagebell', label: 'Ribcage bell', hab: 'both', tier: 17, unlock: 3291, deep: 0.82, stats: [3, 5, 0.55, 615], z: [12, 32], light: { r: 10, col: '#83d5c4' }, note: 'Pale spokes open like ribs around a dark centre.',
    look: { R: 5.5, bell: [45, 0.3, 0.3], tent: [70, 0.45, 0.65], gonad: [90, 0.8, 0.6], lobes: 9, tentLen: 1.3, glow: true } }),
  F({kind: 'emberlung', label: 'Ember lung', hab: 'both', tier: 18, unlock: 3626, deep: 0.82, stats: [4, 5, 0.55, 650], z: [6, 26], cruise: 4, light: { r: 12, col: '#c6c4dd' }, note: 'A long dark body with a throat glowing beneath each breath.',
    look: { len: 30, depth: 0.22, nb: 9, tail: 'fan', fins: 0.6, base: [12, 0.35, 0.2], acc: [47, 0.65, 0.65], pat: 'netted', extras: ['glowspots', 'wings'], glow: '#c6c4dd' } }),
  C({kind: 'chimneykeeper', label: 'Chimney keeper', hab: 'both', tier: 18, unlock: 3626, deep: 0.82, stats: [4, 5, 0.55, 650], cruise: 2.4, light: { r: 12, col: '#dfab70' }, note: 'A heavy crawler, claws raised over the warm stone.',
    look: { segs: 5, w: 2.9, legs: 5, leg: 2.8, reach: 3.6, claws: true, antennae: 4, base: [20, 0.3, 0.3], acc: [50, 0.55, 0.65], pat: 'spots' } }),
  D({kind: 'sulphurghost', label: 'Sulphur ghost', hab: 'both', tier: 18, unlock: 3626, deep: 0.82, stats: [3, 5, 0.55, 650], z: [12, 32], light: { r: 10, col: '#8fb9dc' }, note: 'Its golden threads vanish and return in the plumes.',
    look: { R: 5.5, bell: [40, 0.3, 0.3], tent: [65, 0.45, 0.65], gonad: [85, 0.8, 0.6], lobes: 7, tentLen: 2.2, glow: true } }),
  F({kind: 'orreryfish', label: 'Orrery fish', hab: 'both', tier: 19, unlock: 3974, deep: 0.82, stats: [4, 5, 0.55, 685], z: [6, 26], cruise: 4, light: { r: 12, col: '#b3dbe8' }, note: 'A crown of little lights orbits the empty-looking head.',
    look: { len: 30, depth: 0.22, nb: 9, tail: 'fan', fins: 0.6, base: [220, 0.35, 0.2], acc: [255, 0.65, 0.65], pat: 'dotline', extras: ['glowspots', 'crown'], glow: '#b3dbe8' } }),
  C({kind: 'archivist', label: 'The archivist', hab: 'both', tier: 19, unlock: 3974, deep: 0.82, stats: [4, 5, 0.55, 685], cruise: 2.4, light: { r: 12, col: '#86bdaa' }, note: 'It walks the broken paving in the same order each night.',
    look: { segs: 8, w: 2.9, legs: 5, leg: 2.1, reach: 2.7, claws: true, antennae: 7, base: [230, 0.3, 0.3], acc: [260, 0.55, 0.65], pat: 'bars' } }),
  D({kind: 'lensmedusa', label: 'Lens medusa', hab: 'both', tier: 19, unlock: 3974, deep: 0.82, stats: [3, 5, 0.55, 685], z: [12, 32], light: { r: 10, col: '#c6a2dc' }, note: 'The water seen through its bell seems farther away.',
    look: { R: 5.5, bell: [205, 0.3, 0.3], tent: [230, 0.45, 0.65], gonad: [250, 0.8, 0.6], lobes: 5, tentLen: 1.9, glow: true } }),
  F({kind: 'mirrormaw', label: 'Mirror maw', hab: 'both', tier: 20, unlock: 4337, deep: 0.82, stats: [5, 5, 0.55, 720], z: [6, 26], cruise: 4, predator: true, light: { r: 14, col: '#d4a4bf' }, note: 'Silver along the spine, completely black inside the mouth.',
    look: { len: 35, depth: 0.22, nb: 9, tail: 'lyre', fins: 0.6, base: [210, 0.35, 0.2], acc: [245, 0.65, 0.65], pat: 'twotone', extras: ['glowspots', 'fangs', 'wings'], glow: '#d4a4bf' } }),
  C({kind: 'shardwalker', label: 'Shard walker', hab: 'both', tier: 20, unlock: 4337, deep: 0.82, stats: [4, 5, 0.55, 720], cruise: 2.4, light: { r: 12, col: '#83d5c4' }, note: 'A slender body carried between splayed crystalline limbs.',
    look: { segs: 6, w: 2.9, legs: 5, leg: 1.4, reach: 1.8, claws: true, antennae: 5, base: [225, 0.3, 0.3], acc: [255, 0.55, 0.65], pat: 'spots' } }),
  D({kind: 'reflectionbell', label: 'Reflection bell', hab: 'both', tier: 20, unlock: 4337, deep: 0.82, stats: [3, 5, 0.55, 720], z: [12, 32], light: { r: 10, col: '#c6c4dd' }, note: 'Its pale rim is visible long before the animal inside it.',
    look: { R: 5.5, bell: [200, 0.3, 0.3], tent: [225, 0.45, 0.65], gonad: [245, 0.8, 0.6], lobes: 8, tentLen: 1.6, glow: true } }),
  F({kind: 'hushribbon', label: 'Hush ribbon', hab: 'both', tier: 21, unlock: 4714, deep: 0.82, stats: [4, 5, 0.55, 755], z: [6, 26], cruise: 4, light: { r: 12, col: '#dfab70' }, note: 'A nearly colourless ribbon with fins that barely seem to move.',
    look: { len: 30, depth: 0.07, nb: 12, tail: 'long', fins: 0.6, base: [145, 0.35, 0.2], acc: [180, 0.65, 0.65], pat: 'spots', extras: ['glowspots', 'filaments'], glow: '#dfab70' } }),
  C({kind: 'stillkeeper', label: 'Stillkeeper', hab: 'both', tier: 21, unlock: 4714, deep: 0.82, stats: [4, 5, 0.55, 755], cruise: 2.4, light: { r: 12, col: '#8fb9dc' }, note: 'It keeps every foot planted while the head slowly turns.',
    look: { segs: 4, w: 2.9, legs: 5, leg: 3.5, reach: 4.5, claws: true, antennae: 3, base: [160, 0.3, 0.3], acc: [190, 0.55, 0.65], pat: 'bars' } }),
  D({kind: 'muteveil', label: 'Mute veil', hab: 'both', tier: 21, unlock: 4714, deep: 0.82, stats: [3, 5, 0.55, 755], z: [12, 32], light: { r: 10, col: '#b3dbe8' }, note: 'A greenish bell, trailing a net too fine to see from a distance.',
    look: { R: 5.5, bell: [165, 0.3, 0.3], tent: [190, 0.45, 0.65], gonad: [210, 0.8, 0.6], lobes: 6, tentLen: 1.3, glow: true } }),
  F({kind: 'unwritten', label: 'The unwritten', hab: 'both', tier: 22, unlock: 5106, deep: 0.82, stats: [5, 5, 0.55, 790], z: [6, 26], cruise: 4, predator: true, light: { r: 14, col: '#86bdaa' }, note: 'A shifting outline with a dark gap where its face should be.',
    look: { len: 35, depth: 0.22, nb: 9, tail: 'lyre', fins: 0.6, base: [275, 0.35, 0.2], acc: [310, 0.65, 0.65], pat: 'netted', extras: ['glowspots', 'fangs', 'wings'], glow: '#86bdaa' } }),
  C({kind: 'wrongjoint', label: 'Wrong-joint crawler', hab: 'both', tier: 22, unlock: 5106, deep: 0.82, stats: [4, 5, 0.55, 790], cruise: 2.4, light: { r: 12, col: '#c6a2dc' }, note: 'Too many limbs, each finding the floor a moment after the others.',
    look: { segs: 7, w: 2.9, legs: 5, leg: 2.8, reach: 3.6, claws: true, antennae: 6, base: [285, 0.3, 0.3], acc: [315, 0.55, 0.65], pat: 'spots' } }),
  D({kind: 'absencebell', label: 'Absence bell', hab: 'both', tier: 22, unlock: 5106, deep: 0.82, stats: [4, 5, 0.55, 790], z: [12, 32], light: { r: 12, col: '#d4a4bf' }, note: 'Its lights mark the edges of something the eye refuses to hold.',
    look: { R: 6.5, bell: [265, 0.3, 0.3], tent: [290, 0.45, 0.65], gonad: [310, 0.8, 0.6], lobes: 9, tentLen: 2.2, glow: true } }),
  F({kind: 'cradleeel', label: 'Cradle eel', hab: 'both', tier: 23, unlock: 5511, deep: 0.82, stats: [5, 5, 0.55, 825], z: [6, 26], cruise: 4, light: { r: 14, col: '#83d5c4' }, note: 'It coils around the small lights below, guarding them from the larger dark.',
    look: { len: 35, depth: 0.07, nb: 12, tail: 'long', fins: 0.6, base: [325, 0.35, 0.2], acc: [0, 0.65, 0.65], pat: 'dotline', extras: ['glowspots', 'filaments'], glow: '#83d5c4' } }),
  C({kind: 'nightnurse', label: 'Night nurse', hab: 'both', tier: 23, unlock: 5511, deep: 0.82, stats: [4, 5, 0.55, 825], cruise: 2.4, light: { r: 12, col: '#c6c4dd' }, note: 'Pale grasping limbs lift and fold above a body full of slow light.',
    look: { segs: 5, w: 2.9, legs: 5, leg: 2.1, reach: 2.7, claws: true, antennae: 4, base: [335, 0.3, 0.3], acc: [5, 0.55, 0.65], pat: 'bars' } }),
  D({kind: 'sleepingcrown', label: 'Sleeping crown', hab: 'both', tier: 23, unlock: 5511, deep: 0.82, stats: [4, 5, 0.55, 825], z: [12, 32], light: { r: 12, col: '#dfab70' }, note: 'Its many threads gather inward like fingers closing over a dream.',
    look: { R: 6.5, bell: [310, 0.3, 0.3], tent: [335, 0.45, 0.65], gonad: [355, 0.8, 0.6], lobes: 7, tentLen: 1.9, glow: true } }),
  F({kind: 'fringegoby', label: 'Fringe goby', hab: 'salt', tier: 0, unlock: 38, deep: 0.00, stats: [1, 1, 0.55, 20], z: [6, 26], cruise: 7, small: true, school: true, group: [3, 5], note: 'A squat reef fish that braces on the floor with wide fins.',
    look: { len: 15, depth: 0.22, nb: 9, tail: 'fan', fins: 0.6, base: [40, 0.35, 0.45], acc: [75, 0.65, 0.65], pat: 'twotone', extras: ['barbels', 'wings'], glow: '#8fb9dc' } }),
  C({kind: 'mossmantis', label: 'Moss mantis', hab: 'fresh', tier: 0, unlock: 38, deep: 0.00, stats: [1, 1, 0.55, 20], cruise: 2.4, note: 'A green floor hunter with two folded, hooked front limbs.',
    look: { segs: 8, w: 1.7, legs: 5, leg: 1.4, reach: 1.8, claws: true, antennae: 7, base: [100, 0.3, 0.3], acc: [130, 0.55, 0.65], pat: 'spots' } }),
  F({kind: 'inkdarter', label: 'Ink darter', hab: 'both', tier: 1, unlock: 82, deep: 0.00, stats: [1, 1, 0.55, 55], z: [6, 26], cruise: 7, small: true, school: true, group: [3, 5], note: 'A small dark fish with bright eyes and a quick, curling escape.',
    look: { len: 15, depth: 0.16, nb: 9, tail: 'fan', fins: 0.6, base: [255, 0.35, 0.45], acc: [290, 0.65, 0.65], pat: 'netted', extras: ['barbels', 'wings'], glow: '#86bdaa' } }),
  C({kind: 'reedlobster', label: 'Reed lobster', hab: 'fresh', tier: 2, unlock: 150, deep: 0.30, stats: [2, 1, 0.55, 90], cruise: 1.9, light: { r: 8, col: '#c6a2dc' }, note: 'Long claws reach through the weed while its hind feet brace.',
    look: { segs: 5, w: 2.1, legs: 4, leg: 2.8, reach: 3.6, claws: true, antennae: 4, base: [60, 0.3, 0.3], acc: [90, 0.55, 0.65], pat: 'spots' } }),
  F({kind: 'siltserpent', label: 'Silt serpent', hab: 'both', tier: 9, unlock: 1155, deep: 0.58, stats: [4, 3, 0.55, 335], z: [6, 26], cruise: 4, predator: true, light: { r: 12, col: '#d4a4bf' }, note: 'A long, jointed ribbon from the older waters, crested in bronze.',
    look: { len: 30, depth: 0.07, nb: 12, tail: 'long', fins: 0.6, base: [70, 0.35, 0.2], acc: [105, 0.65, 0.65], pat: 'twotone', extras: ['glowspots', 'fangs', 'wings'], glow: '#d4a4bf' } }),
 ];
for (const d of FRONTIER_DESIGNS) {
  if (CREATE[d.kind]) throw Error(`Duplicate frontier species: ${d.kind}`);
  if (['mossmantis', 'saltwidow', 'chimneykeeper'].includes(d.kind)) d.predator = true;
  registerDesign(d);
}
for (const d of FRONTIER_DESIGNS) if (d.tier > 1 && d.shape !== 'drift') BREED[d.kind] = { clutch: [1,3], hatch:40, cap:6, eggs:'floor', needs:true };

// Floor palettes also vary through the earlier reaches. These stay anchored to the
// original pond so growing to the left cannot shuffle existing formations.
const EARLY_FLOORS = {
  reef: { key:'reef', floor:hexToInt('#476c69'), ridge:hexToInt('#a5aca1'), glow:'#83c9bd' },
  roots: { key:'roots', floor:hexToInt('#353f2b'), ridge:hexToInt('#788061'), glow:'#9bba86' },
  silt: { key:'silt', floor:hexToInt('#24354a'), ridge:hexToInt('#667489'), glow:'#84adca' },
  cold: { key:'cold', floor:hexToInt('#2f4241'), ridge:hexToInt('#728e84'), glow:'#9ac9b6' },
};
const frontierCapped = (w) => (w.expandPx || 0) >= Math.max(0, maxDeepPx(w) - 8);
function frontierReached(w) {
  if ((w.erosion?.tier || 0) < 15 || !frontierCapped(w)) return;
  // At the memory limit, descend through the existing far rim instead of allocating
  // more pixels. This keeps later habitats available on phones and large old ponds.
  const axis = deepAxisX(w.shoreSide), shifts = deepShifts(w.shoreSide), size = axis ? w.W : w.H;
  const lo = shifts ? 0 : Math.max(0,size-182), hi = shifts ? Math.min(size-1,182) : size-1;
  const rect = axis ? [lo,0,hi,w.H-1] : [0,lo,w.W-1,hi];
  if (typeof queueBake === 'function') queueBake(w,rect);
}
function frontierSampler(w) {
  const into = intoOf(w), bands = seaBands(w), fresh = branchOf(w) === 'fresh';
  const tier=w.erosion?.tier || 0, rim=tier>=15 && frontierCapped(w) ? FRONTIERS[Math.min(FRONTIERS.length-1,tier-15)] : null;
  return (x,y,p) => {
    const a = into(x,y);
    if (rim && a >= (w.expandPx || 0)-180) return rim;
    for (let i = bands.length - 1; i >= 0; i--) if (a >= bands[i].from) {
      const f = FRONTIER_BY_KEY[bands[i].k];
      if (f) return f;
      break;
    }
    const depth = w.depth ? w.depth[p] / 255 : 0;
    if (depth > 0.45) return fresh ? EARLY_FLOORS.cold : EARLY_FLOORS.silt;
    return fresh ? EARLY_FLOORS.roots : EARLY_FLOORS.reef;
  };
}
function frontierFloorFn(w) {
  const sample = frontierSampler(w), [ox,oy] = originOf(w), seed = hashString(w.seed || 'pond') % 997;
  return (c,x,y,p) => {
    // Beach and island ground keep their own palette. A baked floor's colour
    // must stay independent of the tide when only one patch is redrawn.
    if (w.shore && w.shore[p] > 0) return c;
    const f = sample(x,y,p), xx=x-ox, yy=y-oy, grain=hash2(xx,yy,seed);
    // Broad ripples, crossed salt cracks, paving, parallel ribs and glass facets.
    let ridge = ((xx + (yy >> 2)) % 19 + 19) % 19 < 2;
    if (f.key==='brine') ridge = ((xx + (yy >> 3)) % 37 + 37) % 37 < 2 || ((yy - (xx >> 3)) % 31 + 31) % 31 < 2;
    else if (f.key==='bone') ridge = ((xx + (yy >> 2)) % 28 + 28) % 28 < 3 && grain > 0.25;
    else if (f.key==='ruins') ridge = ((xx + ((yy >> 5) & 1) * 16) & 31) < 2 || (yy & 31) < 2;
    else if (f.key==='mirror' || f.key==='unmade') ridge = ((xx + yy * 2) & 47) < 2;
    else if (f.key==='vents') ridge = ((xx - yy) % 43 + 43) % 43 < 2;
    const col = mixColor(f.floor,f.ridge,ridge ? 0.6 : grain * 0.16);
    return mixColor(c,col, f.tier ? 0.82 : 0.24 + (w.depth?.[p] || 0)/850);
  };
}

const FRONTIER_MATS = Object.fromEntries(Object.entries({...EARLY_FLOORS,...FRONTIER_BY_KEY}).map(([k,f])=>[k,mat(
  '#' + [f.floor&255,(f.floor>>8)&255,(f.floor>>16)&255].map(v=>v.toString(16).padStart(2,'0')).join(''),
  '#' + [f.ridge&255,(f.ridge>>8)&255,(f.ridge>>16)&255].map(v=>v.toString(16).padStart(2,'0')).join(''), f.glow,f.glow)]));
function bakeFrontiers(w,r,next,rect) {
  if (!w.depth) return;
  const C=88, [ox,oy]=originOf(w), sample=frontierSampler(w), seed=hashString(w.seed || 'pond')%997;
  const [x0,y0,x1,y1]=rect || [0,0,w.W-1,w.H-1], margin=48;
  for (let gy=Math.floor((y0-margin-oy)/C); gy*C+oy<=y1+margin; gy++) for (let gx=Math.floor((x0-margin-ox)/C); gx*C+ox<=x1+margin; gx++) {
    const x=ox+(gx+0.3+hash2(gx,gy,seed)*0.4)*C, y=oy+(gy+0.3+hash2(gx,gy,seed+1)*0.4)*C;
    if (x<12 || y<12 || x>=w.W-12 || y>=w.H-12 || isDry(w,x,y)) continue;
    const p=(x|0)+(y|0)*w.W, f=sample(x,y,p), m=FRONTIER_MATS[f.key];
    if (!f.tier && w.depth[p]<95 && hash2(gx,gy,seed+2)<0.7) continue;
    const id=next(m), h=hash2(gx,gy,seed+3), angle=h*TAU;
    if (f.key==='bone' || f.key==='nursery') {
      for (let i=0;i<5;i++) {
        const bx=x+(i-2)*3, by=y+Math.sin(i*0.7)*2;
        for (const s of [-1,1]) r.tube(bx,by,0.6,0,bx+s*4,by+2,0.4,4+i%2,0.8,m,id);
      }
    } else if (f.key==='vents') {
      for (let i=0;i<3;i++) r.ellipsoid(x+i*4-4,y+i%2*2,2,2,angle,0,5+i*2,m,id);
    } else if (f.key==='ruins' || f.key==='unmade') {
      for (const s of [-1,1]) r.tube(x+s*5,y,1.1,0,x+s*5,y+2,0.6,9,0.9,m,id);
      r.tube(x-5,y+2,0.8,9,x+5,y+2,0.8,9,0.9,m,id);
    } else if (f.key==='mirror' || f.key==='brine') {
      for (let i=0;i<3;i++) r.tube(x,y,1,0,x+Math.cos(angle+i)*4,y+Math.sin(angle+i)*4,0.1,5+i*2,0.7,m,id);
    } else if (f.key==='roots' || f.key==='hush') {
      for (let i=0;i<4;i++) r.tube(x+(i-2)*2,y,0.7,0,x+(i-2)*3,y-2,0.15,4+i%2*3,0.8,m,id);
    } else r.ellipsoid(x,y,4+h*3,2.2,angle,0,1.5+h*2,m,id);
  }
}

const FRONTIER_MOTES = Object.fromEntries(Object.entries({...EARLY_FLOORS,...FRONTIER_BY_KEY}).map(([k,f])=>[k,solid(f.glow)]));
function frontierLights(M,w,rect) {
  if (!seaBands(w).some(b=>FRONTIER_BY_KEY[b.k]) && !((w.erosion?.tier || 0)>=15 && frontierCapped(w))) return;
  const C=88,[ox,oy]=originOf(w),sample=frontierSampler(w),seed=hashString(w.seed||'pond')%997;
  let count=0;
  for(let gy=Math.floor((rect[1]-oy)/C)-1;gy*C+oy<=rect[3]+C;gy++) for(let gx=Math.floor((rect[0]-ox)/C)-1;gx*C+ox<=rect[2]+C;gx++) {
    if(count>=48) break;
    const x=ox+(gx+0.3+hash2(gx,gy,seed)*0.4)*C,y=oy+(gy+0.3+hash2(gx,gy,seed+1)*0.4)*C;
    if(x<12||y<12||x>=w.W-12||y>=w.H-12||isDry(w,x,y))continue;
    const f=sample(x,y,(x|0)+(y|0)*w.W);
    if(!f.tier||f.key==='coast'||f.key==='hush')continue;
    const pulse=0.7+0.12*Math.sin((w.t||0)*0.28+gx*0.7+gy);
    splat(M,x,y,18,hexToInt(f.glow),pulse,0,0,rect,3); M.any=true;count++;
  }
}
let FRONTIER_FX_ID = 0;
function drawFrontierAtmosphere(r,w,rect) {
  if (!w.depth || !rect) return;
  if (!FRONTIER_FX_ID) { FRONTIER_FX_ID=newId(hexToInt('#0a1118')); EMISSIVE[FRONTIER_FX_ID]=1; }
  const [ox,oy]=originOf(w), sample=frontierSampler(w), C=64, seed=hashString(w.seed || 'pond')%557, t=w.t || 0;
  const was=r.alpha, shadows=r.castShadows; r.castShadows=false;
  let count=0;
  for (let gy=Math.floor((rect[1]-oy)/C)-1; gy*C+oy<=rect[3]+C; gy++) for (let gx=Math.floor((rect[0]-ox)/C)-1; gx*C+ox<=rect[2]+C; gx++) {
    if (count>=96) break;
    const h=hash2(gx,gy,seed), x=ox+(gx+0.5)*C+Math.sin(t*0.09+h*17)*8, y=oy+(gy+0.5)*C+Math.cos(t*0.06+h*19)*8;
    if (x<1 || y<1 || x>=w.W-1 || y>=w.H-1 || isDry(w,x,y)) continue;
    const p=(x|0)+(y|0)*w.W, depth=w.depth[p]/255;
    if (depth<0.25 || h>0.6) continue;
    const f=sample(x,y,p), mat=FRONTIER_MOTES[f.key]; count++;
    const hush=f.key==='hush', phase=(t*(hush?0.035:0.12)+h)%1;
    r.alpha=was*(0.12+0.12*Math.sin(PI*phase));
    if (f.key==='vents') {
      r.tube(x,y,0.8,0,x+Math.sin(t*0.3+h*5)*3,y+3,2.2,14*phase,0.5,mat,FRONTIER_FX_ID);
    } else {
      r.ellipsoid(x,y+(hush?0:phase*9),h>0.3?0.65:1.1,0.35,h*TAU,4+phase*14,0.4,mat,FRONTIER_FX_ID);
      if (f.key==='nursery') r.dot(x+3*Math.sin(t*0.2+h*9),y+3*Math.cos(t*0.2+h*9),6,mat,FRONTIER_FX_ID);
    }
  }
  r.alpha=was; r.castShadows=shadows;
}
