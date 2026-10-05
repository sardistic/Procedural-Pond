'use strict';
// The dark, and the light against it.
//  - Where the water is darkest, it drinks the light: an island out over the abyss is dimmed by it, the more the
//    deeper the water around it, breathing slowly as the dark pulls at it (the renderer darkens its ground and
//    everything on it by world.isleDrain). A beacon's light keeps an island bright.
//  - Once a pond has lived a thousand minutes and gone down to the abyss, the deep lights a beacon of its own: a
//    tall, engineered lighthouse on a rock of its own in the darkest water, its lamp turning. Its light reaches
//    even the black. Nothing corrupted or alien will stay in it (the marked, the evolved, the ridden, the reach's
//    own creatures are driven out), no parasite lives in it, the mark can't pass there, and nothing marked is
//    born there. It can be upgraded (Reach and Strength like any build, and its Lens array).
//  - Seeing it, you learn to build lighthouses of your own, on islands. Each one makes a harbor round it: warm,
//    clear, tropical water, safe (calm, and kept from the corrupt like the beacon), its edge marked by a ring of
//    channel lights; and the more of them there are, the wider each harbor grows. Harbors draw in their own life,
//    friendly kinds and stranger ones, plants and animals, each unlocked to bring in yourself once you've seen it.

const BEACON_R = 84, LIGHTHOUSE_R = 54, HARBOR_R = 64, LENS_MAX = 5;
const BEACON = { zones: [], harbors: [], zT: -1, drainT: 0, spawnT: 0, seeT: 0, ejectT: 0 };
const pondMinutes = (w) => (w.days || 0) * ((w.opts && w.opts.dayLength) || 180) / 60;
const BM = {
  rock: mat('#0e0e12', '#1e1e26', '#34343e', '#565664'), strip: mat('#1a6a7a', '#3ac0d8', '#8af0ff', '#e0ffff'),
  // (Self-lit, so toned down: steel and white as its own lamps light them.)
  lit: mat('#141a20', '#262e38', '#3c4652', '#5a6672'), litTower: mat('#3a424a', '#5c666e', '#808a94', '#a8b2bc'), litBand: mat('#06202a', '#0c3a4a', '#16586a', '#2a7a90'), deck: mat('#2a3038', '#46505c', '#6a7684', '#98a4b2'),
  tower: mat('#9aa4ae', '#c4ccd4', '#e4eaf0', '#ffffff'), band: mat('#0a2a3a', '#124a5e', '#1e7088', '#3aa0b8'),
  glass: mat('#2a8aa0', '#4ac8e0', '#9af0ff', '#eaffff'), lamp: mat('#a0f0ff', '#d0faff', '#f0ffff', '#ffffff'), red: mat('#6a0a0a', '#b01a1a', '#ff3a3a', '#ffb0b0'),
};

// ---- the builds ----------------------------------------------------------------------------------------------
Object.assign(STRUCTURES, {
  beacon: {
    label: 'The deep beacon', pearls: 1600, essence: 0, r: BEACON_R, size: 24, wet: true, unique: true, found: 'neverBuilt',
    desc: 'a lighthouse no one built, lit in the darkest water: its light reaches the black, and nothing corrupt or alien can stay in it',
    aura: { comfort: 0.15, aggression: -0.2, light: 0.45 },
  },
  lighthouse: {
    label: 'Lighthouse', pearls: 900, essence: 120, r: HARBOR_R, size: 5, wet: true, onIsland: true, found: 'beaconKnown',
    desc: 'built on an island: its light keeps the corrupt and the alien out, and the water round it turns to a warm, safe harbor that draws in its own life',
    aura: { comfort: 0.22, aggression: -0.35, fertility: 1.15, light: 0.3 },
  },
});
STRUCT_CODES.push('beacon', 'lighthouse'); // (append-only: links)
LIKE_LABEL.beacon = 'the beacon'; LIKE_LABEL.lighthouse = 'the harbor';
Object.assign(BUILD, {
  beacon(s) { s.h = rand(42, 48); s.R = rand(19, 23); s.rocks = Array.from({ length: 14 }, (_, i) => ({ a: i / 14 * TAU + rand(-0.2, 0.2), d: rand(0.6, 1.05), r: rand(3.5, 7), h: rand(2, 5) })); },
  lighthouse(s) { s.h = rand(20, 24); },
});
// The tower: a tapered white column banded in dark steel-blue, a gallery, the lantern room of glass.
function bakeTower(r, s, next, h, base, top) {
  const id = next(BM.tower);
  r.tube(s.x, s.y, base, 2, s.x, s.y, top, h, 1, (u) => ((u * 6) % 1 < 0.16 ? BM.band : BM.tower), id);
  r.ellipsoid(s.x, s.y, top + 2.2, top + 2.2, 0, h, 0.35, BM.deck, next(BM.deck));
}
Object.assign(BAKE, {
  beacon(r, s, next) {
    // Its rock: black stone broken out of the abyss, and a deck on it.
    const rid = next(BM.rock);
    r.ellipsoid(s.x, s.y, s.R, s.R * 0.85, s.seed % 7, 0, 3, BM.rock, rid);
    for (const k of s.rocks) r.ellipsoid(s.x + Math.cos(k.a) * s.R * k.d, s.y + Math.sin(k.a) * s.R * k.d * 0.85, k.r, k.r * 0.8, k.a, 0, k.h, BM.rock, rid);
    // (Its deck and tower are drawn live, lit by their own lamps: out here the dark drinks anything baked.)
  },
  lighthouse(r, s, next) {
    r.ellipsoid(s.x, s.y, 4.2, 4.2, 0, 1, 0.4, BM.deck, next(BM.deck));
    bakeTower(r, s, next, s.h, 2.8, 1.8);
  },
});
// The lantern: glass round a white-hot lamp, lens bars turning, a red light blinking on the gallery.
function drawLantern(r, s, t, h, top) {
  if (s.gid == null) { s.gid = newId(hexToInt('#04141a')); EMISSIVE[s.gid] = 2; }
  r.ellipsoid(s.x, s.y, top + 0.6, top + 0.6, 0, h + 0.3, 1.6, BM.glass, s.gid);
  r.ellipsoid(s.x, s.y, top * 0.6, top * 0.6, 0, h + 1.4, 1.2, BM.lamp, s.gid);
  const a = t * (0.9 + 0.1 * ((s.lv && s.lv.lens) || 0));
  for (const k of [0, PI]) r.dot(s.x + Math.cos(a + k) * (top + 0.8), s.y + Math.sin(a + k) * (top + 0.8), h + 2, BM.lamp, s.gid);
  if (Math.sin(t * 2.4 + s.seed) > 0.6) r.dot(s.x + top + 2.4, s.y, h + 0.6, BM.red, s.gid);
}
Object.assign(DRAW, {
  beacon(r, s, t) {
    // The deck of engineered plate, its landing spokes, the tower and its mast, in their own light.
    if (s.tid == null) { s.tid = newId(hexToInt('#05070a')); EMISSIVE[s.tid] = 2; }
    r.ellipsoid(s.x, s.y, 11, 11, 0, 4, 0.5, BM.lit, s.tid);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; r.tube(s.x + Math.cos(a) * 6, s.y + Math.sin(a) * 6, 1.1, 4.5, s.x + Math.cos(a) * 10.5, s.y + Math.sin(a) * 10.5, 1.1, 4.5, 0.6, BM.litBand, s.tid); }
    r.tube(s.x, s.y, 5.6, 4.5, s.x, s.y, 3.2, s.h, 1, (u) => ((u * 6) % 1 < 0.16 ? BM.litBand : BM.litTower), s.tid);
    r.ellipsoid(s.x, s.y, 5.4, 5.4, 0, s.h, 0.35, BM.lit, s.tid);
    r.tube(s.x, s.y, 0.5, s.h + 3, s.x, s.y, 0.3, s.h + 9, 1, BM.lit, s.tid);
    drawLantern(r, s, t, s.h, 3.2);
    // Perimeter lights running round the deck in sequence, and the beams laid across the water.
    const n = 16, on = Math.floor(t * 6) % n;
    for (let k = 0; k < n; k++) if ((k - on + n) % n < 4) r.dot(s.x + Math.cos(k / n * TAU) * 11.5, s.y + Math.sin(k / n * TAU) * 11.5, 5, BM.strip, s.gid);
    const a = t * 0.55 + (s.seed % 7), L = BEACON_R * (1 + 0.15 * ((s.lv && s.lv.lens) || 0));
    for (const k of [0, PI]) for (let d = 16; d < L * 1.4; d += 5) if (((d / 5) | 0) % 2) r.dot(s.x + Math.cos(a + k) * d, s.y + Math.sin(a + k) * d, 30, BM.glass, s.gid);
  },
  lighthouse(r, s, t) { drawLantern(r, s, t, s.h, 1.8); },
});

// ---- where the light holds ------------------------------------------------------------------------------------
const lighthouseCount = (w) => (w.structures || []).filter((s) => s.kind === 'lighthouse' && !s.anim).length;
function beaconZones(w) {
  const key = `${w.t}|${(w.structures || []).length}`; // (and anew whenever something is built or taken down)
  if (BEACON.zT === key && BEACON.zw === w) return BEACON.zones;
  BEACON.zT = key; BEACON.zw = w;
  const zones = [], harbors = [], n = lighthouseCount(w);
  for (const s of w.structures || []) {
    if (s.anim) continue;
    const reach = 1 + 0.2 * ((s.lv && s.lv.reach) || 0);
    if (s.kind === 'beacon') zones.push({ x: s.x, y: s.y, r: BEACON_R * reach * (1 + 0.15 * ((s.lv && s.lv.lens) || 0)), s });
    else if (s.kind === 'lighthouse') {
      // (Measured out from the edge of its island.)
      const isle = (w.structures || []).find((q) => q.kind === 'island' && !q.anim && Math.hypot(q.x - s.x, q.y - s.y) < islandRadius(w, q)), ir = isle ? islandRadius(w, isle) : 0;
      zones.push({ x: s.x, y: s.y, r: ir + LIGHTHOUSE_R * reach, s });
      harbors.push({ x: s.x, y: s.y, r: ir + HARBOR_R * reach * (1 + 0.12 * Math.max(0, n - 1)), ir, s }); // (more lighthouses, wider harbors)
    }
  }
  BEACON.zones = zones; BEACON.harbors = harbors;
  return zones;
}
function beaconCovers(w, x, y) {
  for (const z of beaconZones(w)) if ((z.x - x) ** 2 + (z.y - y) ** 2 < z.r * z.r) return true;
  return false;
}
// What the light won't suffer: the marked, the evolved, the ridden, the feral and abominable, the reach's own.
function corruptThing(c) {
  const L = c.life;
  if (!L || c.dying || c.gone) return false;
  if (L.genome && (L.genome.eld || L.genome.xeno)) return true;
  if (L.para || (L.warps && L.warps.some((k) => k === 'abomination' || k === 'feral'))) return true;
  return !!(typeof DEEP !== 'undefined' && DEEP[c.species] && DEEP[c.species].tier >= 11);
}
// Drive them out of the light, now and then saying so.
function ejectCorrupt(w) {
  const zones = beaconZones(w);
  if (!zones.length) return;
  for (const c of w.creatures) {
    if (!corruptThing(c)) continue;
    for (const z of zones) {
      const dx = c.x - z.x, dy = c.y - z.y, d = Math.hypot(dx, dy);
      if (d >= z.r) continue;
      const push = 1.2 + 2.5 * (1 - d / z.r) * (1 + 0.25 * ((z.s.lv && z.s.lv.strength) || 0)), ux = d > 0.1 ? dx / d : 1, uy = d > 0.1 ? dy / d : 0;
      if (!(typeof isDry === 'function' && isDry(w, c.x + ux * push, c.y + uy * push))) { c.x += ux * push; c.y += uy * push; if (c.body && c.body.resolve) c.body.resolve(c.x, c.y, c.heading || 0); }
      if (typeof startle === 'function') startle(w, c, z.x, z.y, 2);
      if (Number.isFinite(c.tx)) { c.tx = z.x + ux * (z.r + 20); c.ty = z.y + uy * (z.r + 20); }
      if (w.t - (BEACON.saidAt || -1e9) > 90 && c.life && c.life.name) {
        BEACON.saidAt = w.t;
        logEvent(w, `The ${z.s.kind === 'beacon' ? "beacon's" : "lighthouse's"} light drove ${c.life.name} the ${describe(c).label} back into the dark`, c, { cat: 'pond', pri: 1, key: 'beacon:eject', merge: (e) => `The light drove ${e.n} corrupted animals back into the dark` });
      }
      break;
    }
  }
}

// ---- the abyss drinks the islands' light ------------------------------------------------------------------------
// How far each island pixel is from its water (a two-pass chamfer, capped), rebuilt when the island ground changes.
function islandEdgeMap(w) {
  const G = w.islandGround;
  if (!G) return null;
  if (w.islandEdge && w.islandEdgeOf === G) return w.islandEdge;
  const W = w.W, H = w.H, E = new Uint8Array(W * H), CAP = 40;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = x + y * W;
    if (!G[p]) { E[p] = 0; continue; }
    let v = CAP;
    if (x > 0) v = Math.min(v, E[p - 1] + 1);
    if (y > 0) v = Math.min(v, E[p - W] + 1);
    E[p] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const p = x + y * W;
    if (!E[p]) continue;
    let v = E[p];
    if (x < W - 1) v = Math.min(v, E[p + 1] + 1);
    if (y < H - 1) v = Math.min(v, E[p + W] + 1);
    E[p] = v;
  }
  w.islandEdge = E; w.islandEdgeOf = G;
  return E;
}
function updateIsleDrain(w) {
  const isles = w.islandGroundIsles;
  if (!isles || !isles.length || !w.depth) { w.isleDrain = null; return; }
  islandEdgeMap(w);
  const out = new Float32Array(isles.length);
  for (let i = 0; i < isles.length; i++) {
    const s = isles[i];
    if (!s) continue;
    const R = (typeof islandRadius === 'function' ? islandRadius(w, s) : 24) * 1.5;
    let sum = 0, n = 0;
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, d = depthAt(w, s.x + Math.cos(a) * R, s.y + Math.sin(a) * R); if (Number.isFinite(d)) { sum += d; n++; } }
    const deep = n ? sum / n : 0;
    out[i] = clamp((deep - 0.55) / 0.3, 0, 1) * (beaconCovers(w, s.x, s.y) ? 0.15 : 1);
  }
  w.isleDrain = out;
}

// ---- the beacon lights itself -----------------------------------------------------------------------------------
function maybeLightBeacon(w) {
  if (w.observe || !w.game || w.game.beaconLit || !w.depth) return;
  if (((w.erosion && w.erosion.tier) || 0) < 4 || pondMinutes(w) < 1000) return;
  // The darkest open water there is, clear of what's built.
  let best = null, bd = -1;
  for (let i = 0; i < 400; i++) {
    const x = rand(40, w.W - 40), y = rand(40, w.H - 40), d = depthAt(w, x, y);
    if (d <= bd || (w.shore && shoreAt(w, x, y) > 0.05)) continue;
    if ((w.structures || []).some((s) => Math.hypot(s.x - x, s.y - y) < 60)) continue;
    best = [x, y]; bd = d;
  }
  if (!best || bd < 0.6) return;
  const s = makeStructure('beacon', w, best[0], best[1]);
  w.structures.push(s);
  w.game.beaconLit = true; w.game.beaconKnown = true; w.gameDirty = true;
  if (typeof structuresChanged === 'function' && w === world) structuresChanged(false, s); else if (typeof bakeBackground === 'function') bakeBackground(w);
  logEvent(w, '✦ Out in the darkest water, something has lit. A beacon stands on a rock of its own, its lamp turning, and the dark gives way round it. You could build lights like it: a lighthouse on an island (in Build)', s, { cat: 'rare', pri: 3 });
  if (typeof narrate === 'function') narrate(w, 'build', { what: 'A beacon' });
  if (typeof refreshSpeciesButtons === 'function') refreshSpeciesButtons();
}

// ---- its light ---------------------------------------------------------------------------------------------------
// (From buildLights: a steady glow at the lamp and two beams sweeping round, long enough to reach the black.)
function beaconLights(M, w, big) {
  for (const s of w.structures || []) {
    if ((s.kind !== 'beacon' && s.kind !== 'lighthouse') || s.anim) continue;
    const lens = (s.lv && s.lv.lens) || 0, reach = 1 + 0.2 * ((s.lv && s.lv.reach) || 0), R = (s.kind === 'beacon' ? 46 : 30) * reach * (1 + 0.12 * lens), a = w.t * 0.55 + (s.seed % 7);
    const lh = (s.h || 20) + 2;
    splat(M, s.x, s.y, R * 0.45, 0xffe8f8ff, 1.1, 0, 0, big, lh);
    splat(M, s.x, s.y, R * 1.6, 0xffc8f0ff, 0.11, 0, 0, big); // (its ambience, out into the dark)
    for (const k of [0, PI]) splat(M, s.x, s.y, R, 0xfff0ffff, 0.8, a + k, s.kind === 'beacon' ? 3.2 + 0.4 * lens : 2.4, big, lh);
  }
}

// ---- harbors: their own life, unlocked as you see it ---------------------------------------------------------------
const F2 = (o) => ({ shape: 'fish', ...o }), C2 = (o) => ({ shape: 'crawl', ...o }), D2 = (o) => ({ shape: 'drift', ...o });
const HARBOR_KINDS = [
  F2({ kind: 'manta', label: 'Reef manta', hab: 'both', tier: 0, unlock: 0, stats: [4, 2, 0.6, 40], z: [14, 30], cruise: 4, note: 'A gentle giant gliding on wide wings, sieving the harbor\'s plankton.',
    look: { len: 26, depth: 0.22, peak: 0.3, tail: 'long', tailLen: 0.7, fins: 0.5, base: [215, 0.5, 0.18], acc: [210, 0.1, 0.9], pat: 'belly', extras: ['wings'] } }),
  C2({ kind: 'hawksbill', label: 'Hawksbill turtle', hab: 'both', tier: 0, unlock: 0, stats: [3, 2, 0.7, 50], cruise: 2.4, note: 'A sea turtle with an amber, tortoiseshell back, at home in warm harbors.',
    look: { segs: 4, w: 3.4, legs: 2, leg: 2.2, shell: [32, 0.6, 0.4], base: [40, 0.3, 0.45], acc: [25, 0.7, 0.3], pat: 'spots' } }),
  F2({ kind: 'mahi', label: 'Mahi-mahi', hab: 'both', tier: 0, unlock: 0, stats: [2, 1, 0.7, 5], z: [10, 26], cruise: 11, note: 'Blazing gold and green, fast, and following anything that floats.',
    look: { len: 22, depth: 0.2, head: 1, peak: 0.25, tail: 'lyre', dorsal: 'sail', base: [100, 0.8, 0.45], acc: [50, 0.95, 0.55], pat: 'gradient' } }),
  F2({ kind: 'anthias', label: 'Fairy anthias', hab: 'both', tier: 0, unlock: 0, stats: [1, 1, 0.8, 5], z: [8, 22], cruise: 9, small: true, school: true, group: [5, 8], note: 'Clouds of tiny pink and orange fish over the harbor\'s coral.',
    look: { len: 7, depth: 0.24, tail: 'lyre', base: [345, 0.8, 0.62], acc: [30, 0.9, 0.6], pat: 'gradient' } }),
  F2({ kind: 'cardinal', label: 'Banggai cardinalfish', hab: 'both', tier: 0, unlock: 0, stats: [1, 1, 0.8, 4], z: [8, 20], cruise: 5, small: true, school: true, group: [3, 5], note: 'Silver with black bars and white dots; the father carries the eggs in his mouth.',
    look: { len: 8, depth: 0.3, tail: 'fan', dorsal: 'sail', base: [210, 0.1, 0.75], acc: [230, 0.3, 0.12], pat: 'bars', freq: 3 } }),
  D2({ kind: 'sunjelly', label: 'Sun jelly', hab: 'both', tier: 0, unlock: 0, stats: [1, 1, 0.8, 1], z: [16, 32], light: { r: 7, col: '#ffe08a' }, note: 'A golden, harmless jelly that glows softly like a small sun at dusk.',
    look: { R: 3.6, bell: [45, 0.7, 0.6], tent: [40, 0.6, 0.55], gonad: [50, 1, 0.7], lobes: 6, glow: true } }),
  F2({ kind: 'lumenray', label: 'Lumen ray', hab: 'both', tier: 0, unlock: 0, stats: [3, 4, 0.5, 60], z: [12, 30], cruise: 4, light: { r: 9, col: '#6af0ff' }, note: 'Not from any sea we know: a ray whose wings carry moving lines of light.',
    look: { len: 22, depth: 0.2, peak: 0.3, tail: 'long', tailLen: 0.8, base: [200, 0.4, 0.18], acc: [185, 0.9, 0.65], pat: 'stripe', psize: 0.08, extras: ['wings', 'glowspots'], glow: '#6af0ff' } }),
  C2({ kind: 'prismshrimp', label: 'Prism shrimp', hab: 'both', tier: 0, unlock: 0, stats: [1, 3, 0.7, 2], cruise: 2.2, light: { r: 4, col: '#d0a0ff' }, note: 'A shrimp of something like glass, splitting the harbor lights into colours as it walks.',
    look: { segs: 6, w: 1.4, legs: 4, antennae: 6, tailFan: true, base: [280, 0.5, 0.75], acc: [190, 0.8, 0.7], glow: '#d0a0ff' } }),
  D2({ kind: 'starglider', label: 'Starglider', hab: 'both', tier: 0, unlock: 0, stats: [2, 4, 0.5, 20], z: [18, 34], light: { r: 10, col: '#a0c0ff' }, note: 'A drifting star of a creature, five arms of soft light, calm as the harbor.',
    look: { R: 4.5, bell: [230, 0.3, 0.7], tent: [220, 0.7, 0.7], gonad: [200, 0.9, 0.8], lobes: 5, glow: true } }),
  F2({ kind: 'haloeel', label: 'Halo eel', hab: 'both', tier: 0, unlock: 0, stats: [2, 4, 0.5, 30], z: [4, 20], cruise: 5, light: { r: 6, col: '#8affc0' }, note: 'A ribbon of an eel trailing a faint halo, curious about lighthouses.',
    look: { len: 32, depth: 0.05, nb: 14, tail: 'round', base: [160, 0.4, 0.3], acc: [150, 0.9, 0.65], pat: 'dotline', extras: ['glowspots'], glow: '#8affc0' } }),
];
const HARBOR_SPECIES = [];
for (const d of HARBOR_KINDS) {
  if (CREATE[d.kind]) continue;
  registerDesign(d);
  delete DEEP[d.kind]; // (not on the evolution tree: harbor life is unlocked by being seen)
  HARBOR_SPECIES.push(d.kind);
}
STRUCT_LIKES.lighthouse = HARBOR_SPECIES.slice();
// Harbor plants: living as flora forms do, in their own shapes and colours, hidden from the tools until seen.
const HARBOR_PLANTS = {
  sunkelp: { form: 'kelp', label: 'Sun kelp', hab: 'mixed', price: 10, tier: 99, life: [0.2, 50, 100], seed: 0.06, cover: 0.05, water: 0, likes: ['manta', 'mahi', 'sunjelly'], warm: 0.8,
    tip: 'golden kelp that holds the harbor light long after dusk', mats: { stipe: mat('#5a4a0a', '#8a7414', '#c0a028', '#f0d050'), blade: mat('#6a5a0e', '#9a8018', '#d0b030', '#ffe070'), bladder: mat('#8a6a14', '#c09a28', '#f0c84a', '#fff09a') } },
  lumifern: { form: 'seafan', label: 'Lumifern', hab: 'mixed', price: 12, tier: 99, life: [0.1, 80, 160], seed: 0.05, cover: 0.03, water: 0, likes: ['lumenray', 'prismshrimp', 'anthias'], warm: 0.6,
    tip: 'a fan of cyan light, grown in no sea anyone knows', fans: [mat('#0a4a5a', '#1a8aa0', '#3ad0e8', '#a0f8ff')] },
  glasslily: { form: 'lotus', label: 'Glass lily', hab: 'mixed', price: 14, tier: 99, life: [0.12, 60, 120], seed: 0.05, cover: 0.03, water: 0, likes: ['hawksbill', 'starglider'], warm: 0.7,
    tip: 'a pad and a flower of something like crystal, ringing faintly in the wind', mats: { lotusPad: mat('#2a5a6a', '#4a8a9a', '#7ab8c8', '#c0eef8'), lotus: mat('#8a8ac0', '#b0b0e8', '#e0e0ff', '#ffffff') } },
  tidecoral: { form: 'sponge', label: 'Harbor coral', hab: 'mixed', price: 10, tier: 99, life: [0.1, 80, 160], seed: 0.05, cover: 0.02, water: 0, likes: ['anthias', 'cardinal', 'haloeel'], warm: 0.9,
    tip: 'pink and orange coral that only grows in the calm of a harbor', fans: [mat('#7a2a3a', '#b04a5a', '#e07a8a', '#ffb0c0'), mat('#7a3a0a', '#b06a1a', '#e09a3a', '#ffc87a')] },
};
// Their own shapes (flora2.js PLANT_SHAPES2), seen from above; the two that glow light themselves.
const HP = {
  sunStipe: mat('#5a4a0a', '#8a7414', '#c0a028', '#f0d050'), sunBlade: mat('#6a5a0e', '#9a8018', '#d0b030', '#ffe070'),
  fern: mat('#0a4a5a', '#1a8aa0', '#3ad0e8', '#a0f8ff'), fernTip: mat('#4ac0d8', '#8af0ff', '#d0ffff', '#ffffff'),
  glass: mat('#2a5a6a', '#4a8a9a', '#7ab8c8', '#c0eef8'), glassEdge: mat('#6a9ab0', '#a0d0e0', '#d8f4ff', '#ffffff'), glassFlower: mat('#8a8ac0', '#b0b0e8', '#e0e0ff', '#ffffff'),
  coralP: mat('#7a2a3a', '#b04a5a', '#e07a8a', '#ffb0c0'), coralO: mat('#7a3a0a', '#b06a1a', '#e09a3a', '#ffc87a'), polyp: mat('#c0a0a0', '#f0d0d0', '#fff0f0', '#ffffff'),
};
const HARBOR_SHAPES = {
  // Golden kelp: stipes in a ring, each crowned with a sunburst of broad blades lying at the surface.
  sunkelp: { main: HP.sunStipe, accent: HP.sunBlade,
    make(F) { EMISSIVE[F.id2] = 2; const n = randi(3, 4); F.stipes = Array.from({ length: n }, (_, k) => { const a = k / n * TAU + rand(-0.3, 0.3); return { ox: Math.cos(a) * 3, oy: Math.sin(a) * 3, a, ph: rand(0, TAU), blades: randi(6, 8) }; }); },
    draw(F, r, t, world, g, cur) {
      for (const s of F.stipes) {
        let px = F.x + s.ox, py = F.y + s.oy, pz = 0;
        const top = 44 * (0.3 + 0.7 * g);
        for (let k = 1; k <= 8; k++) { const f = k / 8, nx = F.x + s.ox + (Math.cos(s.a) * 5 + Math.sin(t * 0.5 + s.ph + k * 0.3) * 1.2 + cur.x * 5 + F.px * 0.4) * f * f, ny = F.y + s.oy + (Math.sin(s.a) * 5 + cur.y * 5 + F.py * 0.4) * f * f, nz = top * f; r.tube(px, py, 0.5, pz, nx, ny, 0.45, nz, 1, HP.sunStipe, F.id); px = nx; py = ny; pz = nz; }
        if (g > 0.6) for (let b = 0; b < s.blades; b++) { const a = b / s.blades * TAU + s.ph + Math.sin(t * 0.3 + b) * 0.1; r.ellipsoid(px + Math.cos(a) * 2.8, py + Math.sin(a) * 2.8, 3, 1.1, a, pz - 0.5, 0.4, HP.sunBlade, F.id2); }
      }
    } },
  // Glowing fern fronds unrolling from a crown: long pinnate fronds, and fiddleheads still curled.
  lumifern: { main: HP.fern, accent: HP.fernTip,
    make(F) { EMISSIVE[F.id] = 2; EMISSIVE[F.id2] = 2; const n = randi(5, 7); F.fronds = Array.from({ length: n }, (_, k) => ({ a: k / n * TAU + rand(-0.2, 0.2), L: rand(7, 10), curl: Math.random() < 0.3 })); },
    draw(F, r, t, world, g) {
      for (const fr of F.fronds) {
        const sw = Math.sin(t * 0.6 + fr.a * 3) * 0.12, a = fr.a + sw, L = fr.L * (0.4 + 0.6 * g);
        if (fr.curl) { for (let q = 0; q < 8; q++) { const u = q / 8, d = 3 * (1 - u * 0.7), b = a + u * 5; r.dot(F.x + Math.cos(a) * 2 + Math.cos(b) * d * 0.6, F.y + Math.sin(a) * 2 + Math.sin(b) * d * 0.6, 3 + u, HP.fernTip, F.id2); } continue; } // (a fiddlehead)
        const ex = F.x + Math.cos(a) * L, ey = F.y + Math.sin(a) * L;
        r.tube(F.x, F.y, 0.4, 1, ex, ey, 0.25, 6, 1, HP.fern, F.id);
        for (let q = 1; q <= 6; q++) { const u = q / 7, mx = lerp(F.x, ex, u), my = lerp(F.y, ey, u), mz = lerp(1, 6, u), pl = 2.2 * (1 - u * 0.6); for (const s of [-1, 1]) r.tube(mx, my, 0.2, mz, mx + Math.cos(a + s * 1.1) * pl, my + Math.sin(a + s * 1.1) * pl, 0.15, mz + 0.3, 1, HP.fern, F.id); }
        r.dot(ex, ey, 6.3, HP.fernTip, F.id2);
      }
    } },
  // Pads of something like crystal, cut in facets with bright edges, and a glass flower with pointed petals.
  glasslily: { main: HP.glass, accent: HP.glassFlower,
    make(F) { const a0 = rand(0, TAU); F.pads = Array.from({ length: randi(2, 3) }, (_, k) => ({ ox: k ? Math.cos(a0 + k * 2.4) * 8 : 0, oy: k ? Math.sin(a0 + k * 2.4) * 8 : 0, r: k ? rand(3.5, 4.5) : rand(5, 6.5), a: rand(0, TAU) })); },
    draw(F, r, t, world, g) {
      const bob = Math.sin(t * 0.5 + F.ph) * 0.2;
      for (const p of F.pads) r.ellipsoid(F.x + p.ox, F.y + p.oy, p.r * (0.5 + 0.5 * g), p.r * (0.5 + 0.5 * g), p.a, 44 + bob, 0.7, (lx, ly) => { const th = Math.atan2(ly, lx), d = Math.hypot(lx, ly), seg = ((th * 3 / PI) % 1 + 1) % 1; return d > 0.88 || seg < 0.06 ? HP.glassEdge : HP.glass; }, F.id); // (six facets)
      if (g > 0.7) { for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + F.ph; r.tube(F.x, F.y, 0.8, 45.5, F.x + Math.cos(a) * 2.6, F.y + Math.sin(a) * 2.6, 0.2, 47.5, 0.9, HP.glassFlower, F.id2); } if (Math.sin(t * 2 + F.ph) > 0.6) r.dot(F.x, F.y, 48, HP.glassEdge, F.id2); }
    } },
  // Harbor coral: branching staghorn in pink and orange, with a plate or two and polyps open at the tips.
  tidecoral: { main: HP.coralP, accent: HP.coralO,
    make(F) { F.m2 = Math.random() < 0.5 ? HP.coralP : HP.coralO; F.br = Array.from({ length: randi(6, 9) }, (_, k) => ({ a: k / 8 * TAU + rand(-0.3, 0.3), L: rand(4, 7), fork: rand(0.3, 0.7) })); F.plates = Array.from({ length: randi(1, 2) }, () => ({ a: rand(0, TAU), d: rand(4, 7), r: rand(2.4, 3.4) })); },
    draw(F, r, t, world, g) {
      const k = 0.4 + 0.6 * g;
      for (const p of F.plates) r.ellipsoid(F.x + Math.cos(p.a) * p.d * k, F.y + Math.sin(p.a) * p.d * k, p.r * k, p.r * k * 0.8, p.a, 2, 0.6, (lx, ly) => ((lx * lx + ly * ly) * 5 % 1 < 0.2 ? HP.polyp : F.m2 === HP.coralP ? HP.coralO : HP.coralP), F.id2);
      for (const b of F.br) {
        const mx = F.x + Math.cos(b.a) * b.L * 0.5 * k, my = F.y + Math.sin(b.a) * b.L * 0.5 * k;
        r.tube(F.x, F.y, 0.9, 0, mx, my, 0.6, 3 * k, 0.9, F.m2, F.id);
        for (const s of [-1, 1]) { const a = b.a + s * b.fork, ex = mx + Math.cos(a) * b.L * 0.5 * k, ey = my + Math.sin(a) * b.L * 0.5 * k; r.tube(mx, my, 0.5, 3 * k, ex, ey, 0.35, 5 * k, 0.9, F.m2, F.id); if (Math.sin(t * 1.2 + b.a * 4 + s) > -0.2) r.dot(ex, ey, 5 * k + 0.4, HP.polyp, F.id); }
      }
    } },
};
if (typeof FLORA_PLANTS2 !== 'undefined' && typeof FloraVariant === 'function') {
  for (const [k, F] of Object.entries(HARBOR_PLANTS)) {
    F.slice = FLORA_PLANTS[F.form].slice;
    FLORA_PLANTS2[k] = F; FLORA_PLANTS[k] = F;
    if (FLORA_FLOAT.has(F.form)) FLORA_FLOAT.add(k);
    GROW[k] = (w, x, y) => new FloraVariant(x, y, k);
    PLANT_PRICE[k] = F.price; PLANT_LIFE[k] = F.life; SEEDS[k] = F.seed; PLANT_COVER[k] = F.cover; PLANT_WATER[k] = F.water;
    LIKE_LABEL[k] = F.label.toLowerCase();
    for (const sp of F.likes) (LIKES[sp] || (LIKES[sp] = [])).push(k);
    if (!PLANT_CODES.includes(k)) PLANT_CODES.push(k);
  }
  if (typeof LIGHT_PLANTS !== 'undefined') { LIGHT_PLANTS.sunkelp = { r: 8, col: '#ffe08a', k: 0.5 }; LIGHT_PLANTS.lumifern = { r: 9, col: '#6af0ff', k: 0.6 }; }
  if (typeof PLANT_SHAPES2 !== 'undefined') Object.assign(PLANT_SHAPES2, HARBOR_SHAPES);
}
const harborSeen = (w) => (w.game && (w.game.harborSeen || (w.game.harborSeen = []))) || [];
// (A plant tool shows once its plant has been seen; species follow the known list, arrivals.js.)
function harborTools(w) { for (const k of Object.keys(HARBOR_PLANTS)) if (typeof TOOLS !== 'undefined' && TOOLS[k]) TOOLS[k].tier = harborSeen(w).includes(k) ? 0 : 99; }
const inHarbor = (h, x, y) => (h.x - x) ** 2 + (h.y - y) ** 2 < h.r * h.r;
function harborLife(w) {
  beaconZones(w);
  const H = BEACON.harbors;
  if (!H.length || w.observe) return;
  for (const h of H) {
    // Animals: a few at a time, oftener the more harbors there are.
    const here = w.creatures.filter((c) => HARBOR_SPECIES.includes(c.species) && inHarbor(h, c.x, c.y)).length;
    if (here < 6 + H.length && Math.random() < 0.3 * (1 + 0.3 * (H.length - 1))) {
      for (let i = 0; i < 24; i++) {
        const a = rand(0, TAU), d = (h.ir || 0) + 6 + Math.random() * (h.r - (h.ir || 0) - 8), x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d;
        if (x < 10 || y < 10 || x > w.W - 10 || y > w.H - 10 || isDry(w, x, y)) continue;
        const k = pick(HARBOR_SPECIES), got = SPECIES[k].spawn(w, x, y);
        for (const c of got) { if (typeof initLife === 'function' && !c.life) initLife(c); w.creatures.push(c); }
        break;
      }
    }
    // Plants.
    const plants = w.plants.filter((p) => HARBOR_PLANTS[p.make] && inHarbor(h, p.x, p.y)).length;
    if (plants < 10 && Math.random() < 0.35) {
      for (let i = 0; i < 24; i++) {
        const a = rand(0, TAU), d = (h.ir || 0) + 4 + Math.random() * (h.r - (h.ir || 0) - 6), x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d;
        if (x < 8 || y < 8 || x > w.W - 8 || y > w.H - 8 || isDry(w, x, y)) continue;
        const k = pick(Object.keys(HARBOR_PLANTS)), p = makePlant(k, w, x, y);
        if (typeof sprouting === 'function') sprouting(p, 0.3);
        p.born = w.days; (FLORA_FLOAT.has(k) && HARBOR_PLANTS[k].form === 'lotus' ? w.pads : w.plants).push(p);
        break;
      }
    }
  }
}
// Seen for the first time (on screen): it's yours to bring in from now on.
function harborSighting(w) {
  if (w.observe || typeof visibleRect !== 'function') return;
  const [x0, y0, x1, y1] = visibleRect(), seen = harborSeen(w), inView = (o) => o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1;
  for (const c of w.creatures) {
    if (!HARBOR_SPECIES.includes(c.species) || seen.includes(c.species) || !inView(c)) continue;
    seen.push(c.species); w.gameDirty = true;
    if (typeof discover === 'function') discover(w, c.species, c);
    logEvent(w, `✦ New to your harbor: the ${SINGULAR[c.species].toLowerCase()}. Now that you've seen one, you can bring them in yourself`, c, { cat: 'rare', pri: 2 });
    if (typeof refreshSpeciesButtons === 'function') refreshSpeciesButtons();
  }
  for (const p of w.plants.concat(w.pads)) {
    if (!HARBOR_PLANTS[p.make] || seen.includes(p.make) || !inView(p)) continue;
    seen.push(p.make); w.gameDirty = true; harborTools(w);
    logEvent(w, `✦ Growing in your harbor: ${HARBOR_PLANTS[p.make].label.toLowerCase()}. You can plant it yourself now`, null, { cat: 'rare', pri: 2 });
    if (typeof refreshSpeciesButtons === 'function') refreshSpeciesButtons();
  }
}

// ---- the beacon's own upgrade, in its card ---------------------------------------------------------------------------
function beaconCardButtons(w, o, tree) {
  if (o.kind !== 'beacon' || typeof traitButton !== 'function') return;
  const lv = (o.lv && o.lv.lens) || 0, cost = Math.round(160 * 1.9 ** lv);
  tree.append(traitButton('Lens array', 'essence', lv < LENS_MAX ? cost : null, 'a ring of lenses: its beams reach further and its light holds a wider ring of the dark', lv >= LENS_MAX, () => {
    if (!pay(w, 'essence', cost, 'build')) return false;
    o.lv = { ...(o.lv || {}), lens: lv + 1 }; w.gameDirty = true;
    logEvent(w, `The beacon's lens array is at ${lv + 1} of ${LENS_MAX}: its light reaches further into the dark`, null, { cat: 'pond', pri: 1 });
    return true;
  }, pips(lv, LENS_MAX), '#6af0ff', typeof renderObject === 'function' ? renderObject : null));
}

// ---- the clock -------------------------------------------------------------------------------------------------------
let beaconLastT = null;
setInterval(() => {
  if (typeof world === 'undefined' || !world.structures || world.paused) return;
  const t = world.t, dt = beaconLastT == null ? 0.25 : clamp(t - beaconLastT, 0, 5);
  beaconLastT = t;
  if (!dt) return;
  ejectCorrupt(world);
  if ((BEACON.drainT -= dt) <= 0) { BEACON.drainT = 2; updateIsleDrain(world); maybeLightBeacon(world); harborTools(world); }
  if ((BEACON.spawnT -= dt) <= 0) { BEACON.spawnT = 20; harborLife(world); }
  if ((BEACON.seeT -= dt) <= 0) { BEACON.seeT = 1; harborSighting(world); }
}, 250);
