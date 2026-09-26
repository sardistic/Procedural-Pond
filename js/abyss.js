'use strict';
// Past the abyss: four more depth tiers, each wearing the pond further out and
// deeper, each stranger, with its own life, structures, plants and food.
//  5  the hadal trench (salt) / the flooded crypts (fresh), from erosion 40:
//     snailfish and frilled sharks, or crypt eels; brine pools or ossuaries;
//     tube worms or pale roots; chum.
//  6  the black below / the roots of the world, from 70: siphonophores and giant
//     squid; the spire of teeth or the root cathedral; lure lanterns; sea lilies
//     or weeping moss.
//  7  the drowned city / the sunken city, from 120: the Deep Ones; the Cyclopean
//     gate (unique, vast); star-weed; offerings.
//  8  the dreaming dark, from 200: the Sleeper's cradle (unique, and very dear),
//     and the Sleeper itself.
// The fathoms keep going too (see FATHOM_KNOTS): beyond any real sea past the trench.

DEPTH_TIERS.push(
  { erosion: 40, salt: 'The hadal trench', fresh: 'The flooded crypts', depth: 1, expand: 0.25 },
  { erosion: 70, salt: 'The black below', fresh: 'The roots of the world', depth: 1, expand: 0.25 },
  { erosion: 120, salt: 'The drowned city', fresh: 'The sunken city', depth: 1, expand: 0.3 },
  { erosion: 200, salt: 'The dreaming dark', fresh: 'The dreaming dark', depth: 1, expand: 0.3 },
);

const AM = {
  snail: mat('#b07a88', '#d8a4b0', '#f4ccd4', '#fff0f4'), frill: mat('#1e140e', '#34241a', '#4e3828', '#6e5038'),
  frillGill: mat('#6a1a1a', '#9a2a24', '#c8443a', '#f07a6a'), bone: mat('#8a8274', '#b2aa98', '#d6cebc', '#f4eee0'),
  siph: mat('#3a1a4a', '#5a2a6e', '#8a4aa0', '#c08ad8'), siphGlow: mat('#1a8aa0', '#3ac8e0', '#8af0ff', '#e0ffff'),
  squid: mat('#5a0a0a', '#8a1a14', '#b8322a', '#e06a5a'), squidEye: mat('#2a2a5a', '#4a4a9a', '#8a8ad8', '#e0e0ff'),
  deepone: mat('#0e2218', '#1a3a2a', '#2a5a40', '#468060'), deeponeFin: mat('#0a1810', '#14281c', '#20402c', '#346048'),
  deepEye: mat('#6a6a0a', '#a8a81a', '#e8e83a', '#ffffb0'),
  sleeper: mat('#0c0614', '#1a0e26', '#2c1a3e', '#44285c'), sleeperEye: mat('#6a0a2a', '#b01a4a', '#ff3a7a', '#ffc0d8'),
  brine: mat('#04080c', '#0a141c', '#142430', '#24404e'), mussel: mat('#1a1a22', '#2e2e3a', '#46465a', '#6a6a82'),
  spire: mat('#6a6458', '#948c7c', '#bab2a0', '#e4dcc8'), root: mat('#1e140c', '#322216', '#4a3422', '#664a30'),
  lantern: mat('#1a8a6a', '#3ad8a8', '#8affd8', '#e0fff4'), gate: mat('#141a14', '#222a22', '#343e34', '#4a564a'),
  rune: mat('#0a6a3a', '#1aa85a', '#4af08a', '#c0ffd8'), pit: mat('#000000', '#040208', '#0a0612', '#140c1e'),
  tube: mat('#8a8a82', '#b4b4aa', '#d8d8ce', '#f6f6ee'), plume: mat('#8a0e1a', '#c01e2a', '#ee3a3a', '#ff8a7a'),
  paleroot: mat('#8a8070', '#b0a690', '#d4ccb4', '#f0ead8'), lily: mat('#6a3a1a', '#9a5a2a', '#c88040', '#f0b070'),
  moss: mat('#1a2a1a', '#2a422a', '#3e5e3e', '#5a825a'), starStalk: mat('#0a0610', '#140c1e', '#20142e', '#301e44'),
  starTip: mat('#2a6a9a', '#4aa0e0', '#9ad8ff', '#f0faff'),
};

// ---- the life ------------------------------------------------------------------------------------------
// Snailfish: small, pink and see-through, schooling in the trench.
class Snailfish extends Cavefish {
  constructor(world, x, y, school) {
    super(world, x, y, school);
    this.species = 'snailfish';
    this.keepIn = deepKeep(DEEP.snailfish.deepMin);
    OUTLINE[this.id] = outlineOf(AM.snail);
  }

  draw(r) {
    const b = this.body, z = this.z, id = this.id;
    r.alpha = Math.min(r.alpha, 0.8);
    this.drawSpine(r, 0, 4, z, 1, AM.snail, id);
    r.tube(b.x[4], b.y[4], 0.6, z, b.x[5], b.y[5], 1.1, z, 0.3, AM.snail, id);
    r.tube(b.x[5], b.y[5], 1.1, z, b.x[6], b.y[6], 1.3, z, 0.3, AM.snail, id);
    r.alpha = 1;
    this.drawEyes(r, 0.6, 0.3, z + 1, false);
  }
}

// The frilled shark (salt) and the crypt eel (fresh): long and eel-like, with frilled gills.
class Frilled extends Fish {
  constructor(world, x, y, kind = 'frilled') {
    const n = 18, pale = kind === 'boneeel';
    super(world, x, y, {
      species: kind, links: new Array(n - 1).fill(2.2), widths: Array.from({ length: n }, (_, i) => Math.max(0.4, (i < 3 ? [1.4, 1.8, 1.9][i] : 1.9 - i * 0.08))),
      constraint: PI / 8, cruise: 7, maxSpeed: 22, turnRate: 1.6, wiggleAmp: 0.4, wiggleFreq: 3, zMin: 3, zMax: 16, sight: 90, skittish: false,
      outline: outlineOf(pale ? AM.bone : AM.frill),
    });
    this.m = pale ? AM.bone : AM.frill;
    this.keepIn = deepKeep(DEEP[kind].deepMin);
    this.predWeight = 1.6;
  }

  draw(r, t) {
    const b = this.body, z = this.z, id = this.id;
    this.drawSpine(r, 0, b.n - 1, z, 0.8, this.m, id);
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
      const i = 1 + (k >> 1), a = b.a[i] + s * (PI / 2 + 0.3) + Math.sin(t * 5 + k) * 0.2;
      r.tube(b.px(i, s * PI / 2, -0.2), b.py(i, s * PI / 2, -0.2), 0.4, z, b.px(i, s * PI / 2, -0.2) + Math.cos(a) * 1.6, b.py(i, s * PI / 2, -0.2) + Math.sin(a) * 1.6, 0.25, z, 0.6, AM.frillGill, id);
    }
    this.drawEyes(r, 0.8, 0.4, z + b.w[0] * 0.7, this.species === 'boneeel');
  }
}

// Siphonophores: a colony strung out like a lit necklace, drifting.
class Siphon extends Fish {
  constructor(world, x, y) {
    const n = 34;
    super(world, x, y, {
      species: 'siphon', links: new Array(n - 1).fill(1.7), widths: Array.from({ length: n }, (_, i) => (i === 0 ? 1.3 : 0.75)),
      constraint: PI / 5, cruise: 2.5, maxSpeed: 5, turnRate: 0.8, wiggleAmp: 0.5, wiggleFreq: 0.9, zMin: 10, zMax: 30, sight: 20, skittish: false,
      outline: outlineOf(AM.siph),
    });
    this.glowId = newId(hexToInt('#021418'));
    EMISSIVE[this.glowId] = 2;
    this.keepIn = deepKeep(DEEP.siphon.deepMin);
  }

  draw(r, t) {
    const b = this.body, z = this.z, id = this.id;
    r.alpha = Math.min(r.alpha, 0.85);
    this.drawSpine(r, 0, b.n - 1, z, 1, AM.siph, id);
    r.alpha = 1;
    for (let i = 2; i < b.n; i += 2) if (Math.sin(t * 3 - i * 0.4) > -0.2) r.dot(b.x[i], b.y[i], z + 1, AM.siphGlow, this.glowId);
  }
}

// The giant squid: a smaller, red cousin of the kraken, with two long feeding arms.
class GiantSquid extends Kraken {
  constructor(world, x, y) {
    super(world, x, y);
    this.species = 'squid';
    this.mat = AM.squid; this.base = AM.squid;
    this.cruise = 6; this.maxSpeed = 16;
    this.arms = Array.from({ length: 10 }, (_, k) => {
      const long = k === 0 || k === 5, len = long ? 14 : 8;
      return {
        ang: (k + 0.5) / 10 * TAU, phase: rand(0, TAU), long,
        ch: new Chain(x, y, 0, new Array(len).fill(2.2), Array.from({ length: len + 1 }, (_, i) => Math.max(0.35, 1.6 - i * (long ? 0.09 : 0.15))), PI / 4),
        tx: x, ty: y, ox: x, oy: y, t: 1, stepping: false, lift: 0,
      };
    });
    this.keepIn = deepKeep(DEEP.squid.deepMin);
    OUTLINE[this.id] = outlineOf(AM.squid);
    this.predWeight = 2.5;
    this.place(x, y);
  }

  armRest(arm, t) {
    const a = this.heading + PI + (arm.ang - PI) * 0.35 + Math.sin(t * 0.7 + arm.phase) * 0.2, d = (arm.long ? 26 : 14) + Math.sin(t + arm.phase) * 3;
    return [this.x + Math.cos(a) * d, this.y + Math.sin(a) * d];
  }

  hit(px, py) { return Math.hypot(px - this.x, py - this.y) < 9; }
  updateMaterials() { this.mat = AM.squid; this.spotMat = [AM.squid[0], AM.squid[0], AM.squid[1], AM.squid[2]]; }

  draw(r, t) {
    const z = this.z, id = this.id, h = this.heading;
    for (const arm of this.arms) {
      const ch = arm.ch, n = ch.n;
      for (let i = 0; i < n - 1; i++) r.tube(ch.x[i], ch.y[i], ch.w[i], z + 1, ch.x[i + 1], ch.y[i + 1], ch.w[i + 1], z + 1, 0.8, this.mat, id);
    }
    r.ellipsoid(this.x + Math.cos(h) * 6, this.y + Math.sin(h) * 6, 11, 4.2, h, z + 2, 5, this.mat, id);
    for (const s of [-1, 1]) {
      const fx = this.x + Math.cos(h) * 14 + Math.cos(h + s * PI / 2) * 3, fy = this.y + Math.sin(h) * 14 + Math.sin(h + s * PI / 2) * 3;
      r.ellipsoid(fx, fy, 3, 2, h + s * 0.6, z + 3, 1, this.mat, id);
      const ex = this.x + Math.cos(h + s * 0.5) * 3, ey = this.y + Math.sin(h + s * 0.5) * 3;
      r.ellipsoid(ex, ey, 1.8, 1.8, 0, z + 5, 1.2, AM.squidEye, this.eyeId);
    }
  }
}

// The Deep Ones: they walk the drowned streets on webbed feet, fins down their backs, eyes that catch no light.
class DeepOne extends Olm {
  constructor(world, x, y) {
    super(world, x, y);
    this.species = 'deepone';
    const k = 1.8;
    for (let i = 0; i < this.body.links.length; i++) this.body.links[i] *= k;
    for (let i = 0; i < this.body.w.length; i++) this.body.w[i] *= k * 1.1;
    this.eyeId = newId(hexToInt('#1a1a00'));
    EMISSIVE[this.eyeId] = 2;
    this.keepIn = deepKeep(DEEP.deepone.deepMin);
    OUTLINE[this.id] = outlineOf(AM.deepone);
    this.predWeight = 1.8;
  }

  draw(r, t) {
    const b = this.body, z = this.zBody, id = this.id;
    this.drawLegs(r, AM.deeponeFin);
    this.drawSpine(r, 0, b.n - 1, z, 0.8, (u) => ((u * 22) % 1 < 0.25 ? AM.deeponeFin : AM.deepone), id);
    for (let i = 2; i < b.n - 3; i += 2) r.tube(b.x[i], b.y[i], 0.8, z + b.w[i] * 0.8, b.x[i + 1], b.y[i + 1], 0.3, z + b.w[i] * 0.8 + 2.5, 0.6, AM.deeponeFin, id);
    for (const s of [-1, 1]) r.dot(b.px(0, s * 0.8, -0.3), b.py(0, s * 0.8, -0.3), z + b.w[0] * 0.9, AM.deepEye, this.eyeId);
  }
}

// The Sleeper: vaster than the Leviathan, and every few joints an eye that opens, slowly.
class Sleeper extends Leviathan {
  constructor(world, x, y) {
    super(world, x, y);
    this.species = 'sleeper';
    for (let i = 0; i < this.body.links.length; i++) this.body.links[i] *= 1.25;
    for (let i = 0; i < this.body.w.length; i++) this.body.w[i] *= 1.35;
    this.cruise = 4; this.maxSpeed = 8;
    this.keepIn = deepKeep(DEEP.sleeper.deepMin);
    OUTLINE[this.id] = outlineOf(AM.sleeper);
  }

  hit(px, py) { return Math.hypot(px - this.x, py - this.y) < 16; }

  draw(r, t) {
    const b = this.body, w = b.w, z = this.z, id = this.id, n = b.n;
    this.drawSpine(r, 0, n - 1, z, 0.85, AM.sleeper, id);
    for (let i = 4; i < n - 4; i += 4) {
      const open = Math.sin(t * 0.35 + i * 0.7) > 0.3;
      for (const s of [-1, 1]) {
        const ex = b.px(i, s * PI / 2.6, -0.5), ey = b.py(i, s * PI / 2.6, -0.5);
        r.ellipsoid(ex, ey, 1.6, open ? 1.1 : 0.3, b.a[i], z + w[i] * 0.6, 0.8, open ? AM.sleeperEye : AM.sleeper, open ? this.glowId : id);
      }
    }
    this.drawEyes(r, 4, 2.4, z + w[0] * 0.8, true);
  }
}

// branch, tier, unlock (essence), deepMin, and the mythic.
Object.assign(DEEP, {
  snailfish: { branch: 'salt', tier: 5, unlock: 220, deepMin: 0.7 },
  frilled: { branch: 'salt', tier: 5, unlock: 260, deepMin: 0.65 },
  boneeel: { branch: 'fresh', tier: 5, unlock: 240, deepMin: 0.65 },
  siphon: { branch: 'both', tier: 6, unlock: 320, deepMin: 0.75 },
  squid: { branch: 'salt', tier: 6, unlock: 420, deepMin: 0.75 },
  deepone: { branch: 'both', tier: 7, unlock: 700, deepMin: 0.8 },
  sleeper: { branch: 'both', tier: 8, unlock: 2500, deepMin: 0.85, mythic: true },
});
Object.assign(SPECIES_STATS, {
  snailfish: { size: 1, rarity: 3, settle: 0.6, years: 10, group: 6 }, frilled: { size: 3, rarity: 3, settle: 0.45, years: 25 },
  boneeel: { size: 3, rarity: 3, settle: 0.45, years: 30 }, siphon: { size: 3, rarity: 3, settle: 0.4, years: 5 },
  squid: { size: 4, rarity: 4, settle: 0.35, years: 5 }, deepone: { size: 3, rarity: 4, settle: 0.3, years: 500 },
  sleeper: { size: 5, rarity: 5, settle: 0.25, years: 10000 },
});
Object.assign(SPECIES_HABITAT, { snailfish: 'salt', frilled: 'salt', boneeel: 'fresh', siphon: 'both', squid: 'salt', deepone: 'both', sleeper: 'both' });
Object.assign(SINGULAR, {
  snailfish: 'Snailfish', frilled: 'Frilled shark', boneeel: 'Crypt eel', siphon: 'Siphonophore', squid: 'Giant squid', deepone: 'Deep One', sleeper: 'The Sleeper',
});
for (const k of ['frilled', 'boneeel', 'squid', 'deepone', 'sleeper']) DEEP_PREDATORS.add(k);
Object.assign(CREATE, {
  snailfish: (w, x, y, a) => new Snailfish(w, x, y, a.school), frilled: (w, x, y) => new Frilled(w, x, y, 'frilled'),
  boneeel: (w, x, y) => new Frilled(w, x, y, 'boneeel'), siphon: (w, x, y) => new Siphon(w, x, y), squid: (w, x, y) => new GiantSquid(w, x, y),
  deepone: (w, x, y) => new DeepOne(w, x, y), sleeper: (w, x, y) => new Sleeper(w, x, y),
});
Object.assign(SPECIES, {
  snailfish: {
    label: 'Snailfish', color: '#f4ccd4',
    spawn: (w) => {
      const [x, y] = deepSpot(w, 'snailfish'), school = { tx: x, ty: y, tz: 10, until: 0 };
      return Array.from({ length: randi(5, 8) }, () => makeCreature('snailfish', w, x + rand(-6, 6), y + rand(-6, 6), { school }));
    },
  },
  frilled: { label: 'Frilled shark', color: '#6e5038', spawn: one('frilled') },
  boneeel: { label: 'Crypt eel', color: '#d6cebc', spawn: one('boneeel') },
  siphon: { label: 'Siphonophore', color: '#8af0ff', spawn: one('siphon') },
  squid: { label: 'Giant squid', color: '#e06a5a', spawn: one('squid') },
  deepone: { label: 'Deep One', color: '#468060', spawn: one('deepone') },
  sleeper: { label: 'The Sleeper', color: '#ff3a7a', spawn: one('sleeper') },
});
Object.assign(MYTHIC_ARRIVAL, { sleeper: 'The dark itself turns over. The Sleeper has come up from the dreaming dark' });
Object.assign(EERIE, {
  sleeper: ['Every eye along the Sleeper opens at once, then closes', 'The whole pond is dreaming the same dream', 'Something the size of the sea is breathing, very slowly'],
});

// ---- structures -----------------------------------------------------------------------------------------
Object.assign(STRUCTURES, {
  brinepool: {
    label: 'Brine pool', pearls: 900, essence: 120, r: 80, size: 26, wet: true, habitat: 'salt', tier: 5, deepMin: 0.6,
    desc: 'a lake beneath the sea, rimmed with mussels: deep life breeds around its edge, and it yields essence each dawn',
    aura: { fertility: 1.4, comfort: 0.05 }, dawnEssence: 14,
  },
  ossuary: {
    label: 'Ossuary', pearls: 900, essence: 120, r: 80, size: 22, wet: true, habitat: 'fresh', tier: 5, deepMin: 0.6,
    desc: 'the bones of everything that ever drowned here: scavengers gather, and it yields corruption each dawn',
    aura: { aggression: 0.05, fertility: 1.1 }, dawnEssence: 8, dawnCorruption: 3,
  },
  spire: {
    label: 'Spire of teeth', pearls: 2400, essence: 300, r: 96, size: 16, wet: true, habitat: 'salt', tier: 6, deepMin: 0.7,
    desc: 'a tower of old teeth: hunters near it grow savage, and it yields essence and corruption each dawn',
    aura: { aggression: 0.12, fertility: 1.2 }, dawnEssence: 20, dawnCorruption: 5,
  },
  rootcathedral: {
    label: 'Root cathedral', pearls: 2400, essence: 300, r: 96, size: 24, wet: true, habitat: 'fresh', tier: 6, deepMin: 0.7,
    desc: 'vast roots arched like a nave: everything under them lives longer and rests easy, and it yields essence each dawn',
    aura: { comfort: 0.12, aging: 0.8 }, dawnEssence: 24,
  },
  lantern: {
    label: 'Lure lantern', pearls: 600, essence: 60, r: 70, size: 8, wet: true, tier: 6, deepMin: 0.5,
    desc: 'a hanging light in the dark: deep life comes up to it more often, and the mythic are drawn a little',
    aura: { light: 0.3 }, lure: 0.4, deepLure: 0.5,
  },
  gate: {
    label: 'Cyclopean gate', pearls: 20000, essence: 2000, r: 140, size: 30, wet: true, tier: 7, deepMin: 0.75, unique: true,
    desc: 'a gate of green stone in angles that are wrong: the mark comes on twice as fast near it, the mythic rise, and it yields a great deal each dawn',
    aura: { aggression: 0.1 }, lure: 2, dawnEssence: 60, dawnCorruption: 15, eldRate: 2,
  },
  cradle: {
    label: "The Sleeper's cradle", pearls: 100000, essence: 10000, corruption: 1000, r: 180, size: 40, wet: true, tier: 8, deepMin: 0.8, unique: true,
    desc: 'a ring of monoliths about a pit with no bottom: the Sleeper comes to it, everything eldritch runs faster, and the dawns are rich',
    aura: { comfort: -0.05 }, lure: 4, dawnEssence: 200, dawnCorruption: 40, eldRate: 1.5,
  },
});
STRUCT_CODES.push('brinepool', 'ossuary', 'spire', 'rootcathedral', 'lantern', 'gate', 'cradle');
Object.assign(STRUCT_LIKES, {
  brinepool: ['snailfish', 'frilled', 'squid', 'isopod'], ossuary: ['boneeel', 'isopod', 'catfish', 'crab'], spire: ['frilled', 'shark', 'squid', 'angler'],
  rootcathedral: ['olm', 'cavefish', 'boneeel', 'catfish'], lantern: ['siphon', 'angler', 'snailfish'], gate: ['deepone'], cradle: ['deepone', 'sleeper'],
});
for (const k of ['brinepool', 'ossuary', 'spire', 'rootcathedral', 'lantern', 'gate', 'cradle']) LIKE_LABEL[k] = STRUCTURES[k].label.toLowerCase();

Object.assign(BUILD, {
  brinepool(s) { s.a = rand(20, 26); s.b = s.a * rand(0.55, 0.7); s.ang = rand(0, PI); s.n = randi(40, 56); },
  ossuary(s) { s.bones = Array.from({ length: randi(26, 34) }, () => [rand(-16, 16), rand(-12, 12), rand(0, TAU), rand(3, 7)]); s.skulls = Array.from({ length: randi(4, 6) }, () => [rand(-12, 12), rand(-9, 9), rand(1.6, 2.6)]); },
  spire(s) { s.h = rand(40, 52); s.teeth = Array.from({ length: 16 }, (_, k) => [rand(0, TAU), rand(0.1, 0.95), rand(2, 5)]); },
  rootcathedral(s) { s.roots = Array.from({ length: 7 }, (_, k) => ({ a: k / 7 * TAU + rand(-0.2, 0.2), len: rand(24, 34), h: rand(14, 22) })); },
  lantern(s) { s.h = rand(26, 32); },
  gate(s) { s.ang = rand(-PI, PI); s.w = rand(26, 32); s.h = rand(36, 44); },
  cradle(s) { s.n = 11; s.R = rand(30, 36); },
});

Object.assign(BAKE, {
  brinepool(r, s, next) {
    const id = next(AM.brine);
    r.ellipsoid(s.x, s.y, s.a, s.b, s.ang, -0.5, 0.8, AM.brine, id);
    const mid = next(AM.mussel);
    for (let k = 0; k < s.n; k++) {
      const a = k / s.n * TAU + hash2(k, 1, s.seed % 97) * 0.2, ca = Math.cos(s.ang), sa = Math.sin(s.ang);
      const ex = Math.cos(a) * (s.a + 1.5), ey = Math.sin(a) * (s.b + 1.5);
      r.ellipsoid(s.x + ex * ca - ey * sa, s.y + ex * sa + ey * ca, 1.4, 1, a, 0, 1.2, AM.mussel, mid);
    }
  },
  ossuary(r, s, next) {
    const id = next(AM.bone);
    for (const [ox, oy, a, L] of s.bones) r.tube(s.x + ox - Math.cos(a) * L / 2, s.y + oy - Math.sin(a) * L / 2, 0.8, 0.8, s.x + ox + Math.cos(a) * L / 2, s.y + oy + Math.sin(a) * L / 2, 0.8, 1.2, 0.8, AM.bone, id);
    for (const [ox, oy, R] of s.skulls) r.ellipsoid(s.x + ox, s.y + oy, R, R * 0.85, ox, 1.5, R, (lx, ly) => ((lx + 0.3) ** 2 + (ly - 0.35) ** 2 < 0.06 || (lx - 0.3) ** 2 + (ly - 0.35) ** 2 < 0.06 ? AM.pit : AM.bone), id);
  },
  spire(r, s, next) {
    const id = next(AM.spire);
    r.tube(s.x, s.y, 7, 0, s.x + 1, s.y - 1, 1.2, s.h, 0.9, AM.spire, id);
    for (const [a, u, L] of s.teeth) {
      const z = u * s.h, R = 7 * (1 - u) + 1.2, bx = s.x + Math.cos(a) * R, by = s.y + Math.sin(a) * R;
      r.tube(bx, by, 1, z, bx + Math.cos(a) * L, by + Math.sin(a) * L, 0.2, z + L * 0.6, 0.8, AM.spire, id);
    }
  },
  rootcathedral(r, s, next) {
    const id = next(AM.root);
    for (const R of s.roots) {
      let px = s.x, py = s.y, pz = 2;
      for (let i = 1; i <= 8; i++) {
        const u = i / 8, nx = s.x + Math.cos(R.a) * R.len * u, ny = s.y + Math.sin(R.a) * R.len * u, nz = 2 + Math.sin(u * PI) * R.h;
        r.tube(px, py, 3.2 - u * 1.6, pz, nx, ny, 3.2 - (u + 0.12) * 1.6, nz, 0.8, AM.root, id);
        px = nx; py = ny; pz = nz;
      }
    }
  },
  lantern(r, s, next) {
    const id = next(AM.root);
    r.tube(s.x, s.y, 1.2, 0, s.x, s.y, 0.6, s.h, 0.9, AM.root, id);
  },
  gate(r, s, next) {
    const id = next(AM.gate), ca = Math.cos(s.ang), sa = Math.sin(s.ang);
    for (const side of [-1, 1]) {
      const px = s.x + ca * side * s.w / 2, py = s.y + sa * side * s.w / 2;
      r.tube(px, py, 4.5, 0, px + sa * 0.8, py - ca * 0.8, 3.6, s.h, 0.9, (u) => ((u * 7) % 1 < 0.08 ? AM.rune : AM.gate), id);
    }
    r.tube(s.x - ca * (s.w / 2 + 5), s.y - sa * (s.w / 2 + 5), 4, s.h, s.x + ca * (s.w / 2 + 5), s.y + sa * (s.w / 2 + 5), 4, s.h + 3, 0.9, AM.gate, id);
    r.ellipsoid(s.x, s.y, s.w * 0.4, s.w * 0.25, s.ang, -0.5, 0.4, AM.pit, id);
  },
  cradle(r, s, next) {
    const id = next(AM.gate);
    r.ellipsoid(s.x, s.y, s.R * 0.6, s.R * 0.6, 0, -0.5, 0.5, AM.pit, id);
    for (let k = 0; k < s.n; k++) {
      const a = k / s.n * TAU, px = s.x + Math.cos(a) * s.R, py = s.y + Math.sin(a) * s.R, h = 30 + 10 * hash2(k, 5, s.seed % 91);
      r.tube(px, py, 3.4, 0, px - Math.cos(a) * 2, py - Math.sin(a) * 2, 2.4, h, 0.9, (u) => ((u * 9 + k) % 1 < 0.1 ? AM.rune : AM.gate), id);
    }
  },
});

Object.assign(DRAW, {
  brinepool(r, s, t, world) {
    if (s.gid == null) { s.gid = newId(hexToInt('#020608')); EMISSIVE[s.gid] = 1; }
    for (let k = 0; k < 6; k++) {
      const a = t * 0.1 + k, x = s.x + Math.cos(a * 1.3) * s.a * 0.5, y = s.y + Math.sin(a) * s.b * 0.5;
      if (Math.sin(t * 2 + k) > 0.6) r.dot(x, y, 0.4, AM.lantern, s.gid);
    }
  },
  lantern(r, s, t, world) {
    if (s.gid == null) { s.gid = newId(hexToInt('#021410')); EMISSIVE[s.gid] = 2; }
    const sway = Math.sin(t * 0.8 + s.seed) * 1.5;
    r.ellipsoid(s.x + sway, s.y, 2.4, 2.4, 0, s.h - 2, 2.4, AM.lantern, s.gid);
  },
  gate(r, s, t, world) {
    if (s.gid == null) { s.gid = newId(hexToInt('#020806')); EMISSIVE[s.gid] = 2; }
    const ca = Math.cos(s.ang), sa = Math.sin(s.ang);
    for (let k = 0; k < 9; k++) {
      const u = (k + 0.5) / 9, x = s.x - ca * s.w / 2 + ca * s.w * u, y = s.y - sa * s.w / 2 + sa * s.w * u;
      if (Math.sin(t * 1.5 + k * 1.3) > 0) r.dot(x, y, s.h + 4.5, AM.rune, s.gid);
    }
  },
  cradle(r, s, t, world) {
    if (s.gid == null) { s.gid = newId(hexToInt('#100208')); EMISSIVE[s.gid] = 2; }
    for (let k = 0; k < s.n; k++) {
      const a = k / s.n * TAU, on = Math.sin(t * 0.7 - k * 0.9) > 0.2;
      if (on) r.dot(s.x + Math.cos(a) * (s.R - 2), s.y + Math.sin(a) * (s.R - 2), 24, AM.sleeperEye, s.gid);
    }
  },
});

// ---- plants ---------------------------------------------------------------------------------------------
class DeepPlant {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind;
    const m = { tubeworms: AM.tube, paleroots: AM.paleroot, sealily: AM.lily, weepmoss: AM.moss, starweed: AM.starStalk }[kind];
    this.id = newId(outlineOf(m));
    if (kind === 'starweed') { this.tipId = newId(hexToInt('#02080e')); EMISSIVE[this.tipId] = 2; }
    this.parts = Array.from({ length: kind === 'tubeworms' ? randi(7, 11) : kind === 'sealily' ? randi(2, 4) : randi(5, 8) }, () => ({ ox: rand(-5, 5), oy: rand(-5, 5), h: rand(5, 12), ph: rand(0, TAU), a: rand(0, TAU) }));
  }

  update() { return true; }

  draw(r, t) {
    const { x, y, id, kind } = this;
    for (const p of this.parts) {
      const bx = x + p.ox, by = y + p.oy, sway = Math.sin(t * 0.7 + p.ph) * 0.8;
      if (kind === 'tubeworms') {
        r.tube(bx, by, 0.9, 0, bx + sway * 0.3, by, 0.8, p.h, 0.9, AM.tube, id);
        r.ellipsoid(bx + sway * 0.3, by, 1.4, 1.4, 0, p.h + 0.6, 1.2, AM.plume, id);
      } else if (kind === 'paleroots') {
        r.tube(bx, by, 0.9, 0, bx + Math.cos(p.a) * 6 + sway, by + Math.sin(p.a) * 6, 0.3, 2, 0.8, AM.paleroot, id);
      } else if (kind === 'sealily') {
        r.tube(bx, by, 0.6, 0, bx + sway, by, 0.5, p.h + 6, 0.9, AM.lily, id);
        for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + sway * 0.1; r.tube(bx + sway, by, 0.5, p.h + 6, bx + sway + Math.cos(a) * 4.5, by + Math.sin(a) * 4.5, 0.25, p.h + 5, 0.6, AM.lily, id); }
      } else if (kind === 'weepmoss') {
        r.tube(bx, by, 0.8, p.h, bx + sway, by + 1, 0.4, 0, 0.7, AM.moss, id);
      } else {
        r.tube(bx, by, 0.6, 0, bx + sway, by, 0.4, p.h, 0.9, AM.starStalk, id);
        if (Math.sin(t * 1.3 + p.ph) > -0.3) r.dot(bx + sway, by, p.h + 1, AM.starTip, this.tipId);
      }
    }
  }

  hit(px, py) { return (px - this.x) ** 2 + (py - this.y) ** 2 < 49; }
}
const DEEP_PLANTS = { tubeworms: ['salt', 5], paleroots: ['fresh', 5], sealily: ['salt', 6], weepmoss: ['fresh', 6], starweed: ['both', 7] };
for (const k of Object.keys(DEEP_PLANTS)) {
  GROW[k] = (w, x, y) => new DeepPlant(x, y, k);
  PLANT_PRICE[k] = 30 + 15 * (DEEP_PLANTS[k][1] - 5);
}
PLANT_CODES.push(...Object.keys(DEEP_PLANTS));
Object.assign(LIKE_LABEL, { tubeworms: 'tube worms', paleroots: 'pale roots', sealily: 'sea lilies', weepmoss: 'weeping moss', starweed: 'star-weed' });
Object.assign(PLANT_LIFE, { tubeworms: [0.1, 120, 220], paleroots: [0.15, 80, 160], sealily: [0.08, 150, 260], weepmoss: [0.2, 40, 80], starweed: [0.12, 60, 120] });
Object.assign(SEEDS, { tubeworms: 0.05, paleroots: 0.06, sealily: 0.03, weepmoss: 0.08, starweed: 0.04 });
Object.assign(PLANT_COVER, { tubeworms: 0.03, paleroots: 0.03, sealily: 0.04, weepmoss: 0.04 });
Object.assign(PLANT_NAMES, { tubeworms: 'Tube worms', paleroots: 'Pale roots', sealily: 'Sea lilies', weepmoss: 'Weeping moss', starweed: 'Star-weed' });
for (const [plant, kinds] of Object.entries({ tubeworms: ['snailfish', 'frilled', 'isopod'], paleroots: ['boneeel', 'olm', 'cavefish'], sealily: ['siphon', 'squid', 'snailfish'], weepmoss: ['boneeel', 'deepone'], starweed: ['deepone', 'sleeper'] })) {
  for (const k of kinds) LIKES[k] = [...(LIKES[k] || []), plant];
}

// Foods of the deep: chum (a bloody feast that brings the hunters), and offerings (the marked grow on them).
Object.assign(FOOD_GAIN, { chum: 0.6, offering: 0.2 });
Object.assign(FOOD_FED, { chum: 90, offering: 60 });

DEEP_EXTRAS.push(
  ...['brinepool', 'ossuary', 'spire', 'rootcathedral', 'lantern', 'gate', 'cradle'].map((k) => ({ kind: 'build', key: k, label: STRUCTURES[k].label, branch: STRUCTURES[k].habitat, tier: STRUCTURES[k].tier })),
  ...Object.entries(DEEP_PLANTS).map(([k, [b, t]]) => ({ kind: 'plant', key: k, label: PLANT_NAMES[k], branch: b === 'both' ? undefined : b, tier: t })),
  { kind: 'food', key: 'chum', label: 'Chum', branch: 'both', tier: 5 }, { kind: 'food', key: 'offering', label: 'Offerings', branch: 'both', tier: 7 },
);

// The deep structures' dawns: corruption from the dark ones (essence is paid with the others).
function dawnAbyss(world) {
  let cor = 0;
  for (const s of world.structures || []) cor += STRUCTURES[s.kind].dawnCorruption || 0;
  if (cor && typeof gainCorruption === 'function') gainCorruption(world, cor, null, { quiet: true });
  // The Sleeper comes to its cradle.
  if ((world.structures || []).some((s) => s.kind === 'cradle')) {
    const G = world.game;
    if (G && !(G.unlocked || []).includes('sleeper')) {
      G.unlocked = [...(G.unlocked || []), 'sleeper'];
      logEvent(world, '✦ The cradle is ready. The Sleeper can be called up now', null, { cat: 'rare', pri: 3 });
    }
  }
}
// How much faster the mark comes on near the dark structures.
function eldStructRate(world, c) {
  let k = 1;
  for (const s of world.structures || []) {
    const d = STRUCTURES[s.kind];
    if (d.eldRate && Math.hypot(s.x - c.x, s.y - c.y) < d.r) k *= d.eldRate;
  }
  return k;
}
