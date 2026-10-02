'use strict';
// The deep: sharks, and the life that only appears once erosion has opened deep
// water (see erosion.js). Each deep species keeps to water at least `deepMin`
// deep, arrives by itself (rarely) once its zone exists, and can be unlocked on
// the evolution tree to spawn from the dock. The deeper the zone, the stranger
// the life, down to the mythic: the Kraken, the Leviathan and the Watcher.

const DM = {
  sharkBack: mat('#2a3440', '#465462', '#687888', '#94a4b4'), sharkFin: mat('#1e2630', '#36424e', '#566472', '#7e8e9e'),
  sharkBelly: mat('#6a7680', '#98a4ac', '#c4ced4', '#eef2f4'),
  sand: mat('#5a4a30', '#8a7650', '#b4a07a', '#d8c8a4'), sandSpot: mat('#2a2014', '#40321e', '#564630', '#6e5c40'),
  angler: mat('#0c0a0a', '#1a1614', '#2a241e', '#3e342a'), teeth: solid('#e8e0d0'), lure: mat('#6ac8ff', '#9ae0ff', '#d0f4ff', '#ffffff'),
  gulper: mat('#08080c', '#121218', '#1e1e28', '#2e2e3c'), gulperMouth: mat('#2a0a14', '#4a1424', '#6e2036', '#9a3450'),
  glowPink: mat('#c82a6a', '#ff4a8a', '#ff8ab4', '#ffd0e4'),
  vampire: mat('#2a060a', '#4a0c12', '#6e141c', '#962430'), vampEye: mat('#1a4aa0', '#2a7ae0', '#6ab4ff', '#d0ecff'),
  isopod: mat('#5a5460', '#86808e', '#b0aaba', '#d8d4e0'), isopodBand: mat('#3a3440', '#56505e', '#746e7e', '#948e9e'),
  catfish: mat('#1e2412', '#343c20', '#4e5830', '#6e7a46'), catSpot: mat('#0e120a', '#1a2012', '#262e1a', '#343e24'),
  catBelly: mat('#6a6a4a', '#8e8e68', '#b2b28c', '#d4d4b0'), barbel: mat('#3a3a22', '#5a5a36', '#7a7a4c', '#9a9a64'),
  cave: mat('#b07a80', '#d4a0a4', '#f0c8c8', '#fff0ec'), olm: mat('#a8908a', '#ccb4ac', '#ecd8d0', '#fff6f0'),
  olmGill: mat('#a83a4a', '#d45a6a', '#f0808c', '#ffb0b8'),
  kraken: mat('#1e0a1e', '#381436', '#56204e', '#7a3070'), krakenEye: mat('#8a6a0a', '#d0a414', '#ffd83a', '#fff8b0'),
  levi: mat('#06161a', '#0c2a30', '#16424a', '#2a6068'), leviSpine: mat('#1a3a3a', '#2e5a58', '#4a7e7a', '#72a8a2'),
  leviGlow: mat('#1aa0a0', '#3ad8d0', '#8af8f0', '#e0fffc'),
  sclera: mat('#8a8470', '#bab49c', '#dcd6c0', '#f6f2e2'), iris: mat('#0a6a2a', '#1aa844', '#4ae070', '#b0ffc4'),
  pupil: solid('#040404'), watcherFlesh: mat('#1a1412', '#2e2420', '#463630', '#624c42'),
};

// branch: which evolution branch lists it; tier: the depth tier its zone opens at;
// unlock: essence to spawn it from the dock; deepMin: how deep it keeps (0..1).
const DEEP = {
  sandshark: { branch: 'salt', tier: 1, unlock: 40, deepMin: 0 },
  shark: { branch: 'salt', tier: 2, unlock: 80, deepMin: 0 },
  catfish: { branch: 'fresh', tier: 2, unlock: 60, deepMin: 0.2 },
  angler: { branch: 'salt', tier: 3, unlock: 120, deepMin: 0.5 },
  gulper: { branch: 'salt', tier: 3, unlock: 120, deepMin: 0.55 },
  vampire: { branch: 'salt', tier: 3, unlock: 150, deepMin: 0.5 },
  isopod: { branch: 'both', tier: 3, unlock: 110, deepMin: 0.55 },
  cavefish: { branch: 'fresh', tier: 3, unlock: 90, deepMin: 0.45 },
  olm: { branch: 'fresh', tier: 3, unlock: 130, deepMin: 0.5 },
  kraken: { branch: 'salt', tier: 4, unlock: 400, deepMin: 0.8, mythic: true },
  leviathan: { branch: 'both', tier: 4, unlock: 500, deepMin: 0.75, mythic: true },
  watcher: { branch: 'fresh', tier: 4, unlock: 450, deepMin: 0.8, mythic: true },
};
Object.assign(SPECIES_STATS, {
  shark: { size: 4, rarity: 2, settle: 0.55, years: 25 }, sandshark: { size: 3, rarity: 2, settle: 0.6, years: 20 },
  angler: { size: 2, rarity: 3, settle: 0.5, years: 20 }, gulper: { size: 3, rarity: 3, settle: 0.45, years: 12 },
  vampire: { size: 2, rarity: 3, settle: 0.5, years: 8 }, isopod: { size: 2, rarity: 2, settle: 0.6, years: 30 },
  catfish: { size: 3, rarity: 1, settle: 0.75, years: 20 }, cavefish: { size: 1, rarity: 2, settle: 0.7, years: 12, group: 7 },
  olm: { size: 2, rarity: 3, settle: 0.55, years: 100 }, kraken: { size: 5, rarity: 4, settle: 0.35, years: 300 },
  leviathan: { size: 5, rarity: 4, settle: 0.3, years: 1000 }, watcher: { size: 4, rarity: 4, settle: 0.3, years: 2000 },
});
Object.assign(SPECIES_HABITAT, {
  shark: 'salt', sandshark: 'salt', angler: 'salt', gulper: 'salt', vampire: 'salt', isopod: 'both', catfish: 'fresh',
  cavefish: 'fresh', olm: 'fresh', kraken: 'salt', leviathan: 'both', watcher: 'fresh',
});
Object.assign(SINGULAR, {
  shark: 'Reef shark', sandshark: 'Sand shark', angler: 'Anglerfish', gulper: 'Gulper eel', vampire: 'Vampire squid',
  isopod: 'Giant isopod', catfish: 'Giant catfish', cavefish: 'Cavefish', olm: 'Olm', kraken: 'Kraken', leviathan: 'Leviathan', watcher: 'The Watcher',
});
Object.assign(LIKES, {
  shark: ['coral', 'rock'], sandshark: ['eelgrass', 'weed'], catfish: ['rock', 'weed'], cavefish: ['rock'], olm: ['rock'], isopod: ['rock'],
});
for (const k of ['shark', 'sandshark', 'angler', 'gulper', 'vampire', 'isopod', 'catfish', 'cavefish', 'olm', 'kraken', 'leviathan', 'watcher']) EATS.add(k);
for (const k of ['shark', 'sandshark', 'angler', 'gulper', 'catfish', 'cavefish', 'leviathan', 'isopod', 'olm']) SCALABLE.add(k);
Object.assign(BREED, {
  shark: { clutch: [1, 2], hatch: 45, cap: 3, eggs: 'floor' }, sandshark: { clutch: [1, 2], hatch: 40, cap: 4, eggs: 'floor' },
  catfish: { clutch: [2, 3], hatch: 35, cap: 5, eggs: 'floor' }, cavefish: { clutch: [3, 5], hatch: 25, cap: 16, eggs: 'floor' },
});
const DEEP_PREDATORS = new Set(['shark', 'sandshark', 'angler', 'gulper', 'catfish', 'kraken', 'leviathan']);

// Deep species steer toward water deep enough for them.
function deepPush(world, c) {
  const need = DEEP[c.species] && DEEP[c.species].deepMin;
  if (!need || !world.depth) return [0, 0];
  const d = depthAt(world, c.x, c.y);
  if (d >= need) return [0, 0];
  const gx = depthAt(world, c.x + 6, c.y) - depthAt(world, c.x - 6, c.y), gy = depthAt(world, c.x, c.y + 6) - depthAt(world, c.x, c.y - 6), gl = Math.hypot(gx, gy);
  if (gl < 0.001) {
    // Flat and shallow here: head for the deep side of the pond.
    const n = world.shoreN;
    return [-n[0] * 2, -n[1] * 2];
  }
  const f = 1 + (need - d) * 4;
  return [gx / gl * f, gy / gl * f];
}
const deepKeep = (need) => (world, x, y) => !world.depth || depthAt(world, x, y) >= need;

// ---- sharks -----------------------------------------------------------------------------------

class Shark extends Fish {
  constructor(world, x, y, sand = false) {
    const n = sand ? 11 : 12;
    const widths = sand ? [2.4, 3.3, 3.8, 3.8, 3.5, 3.0, 2.5, 2.0, 1.5, 1.1, 0.8, 0.5] : [2.0, 2.8, 3.4, 3.8, 3.9, 3.7, 3.2, 2.6, 2.0, 1.5, 1.1, 0.8, 0.5];
    super(world, x, y, {
      species: sand ? 'sandshark' : 'shark',
      links: new Array(n).fill(sand ? 2.5 : 3.1), widths,
      constraint: PI / 10, cruise: sand ? 7 : 10, maxSpeed: sand ? 20 : 28, turnRate: 1.3,
      wiggleAmp: 0.13, wiggleFreq: 3.4, zMin: sand ? 1.5 : 8, zMax: sand ? 5 : 26, sight: 110, skittish: false,
      outline: outlineOf(sand ? DM.sand : DM.sharkBack),
    });
    this.sand = sand;
    this.alwaysSwims = !sand; // a reef shark has to keep moving to breathe
    this.predWeight = sand ? 1.4 : 2.2;
    this.shoreMargin = sand ? 0.06 : SHORE_MARGIN; // sand sharks cruise right up the shallows
    const s = rand(0, 99);
    this.skin = sand ? bakeShader((u, v) => (vnoise(u * 20 + s, v * 3, 12) > 0.62 ? DM.sandSpot : Math.abs(v) > 0.8 ? DM.sharkBelly : DM.sand), 48, 12)
      : bakeShader((u, v) => (Math.abs(v) > 0.72 ? DM.sharkBelly : u < 0.04 ? DM.sharkFin : DM.sharkBack), 48, 12);
    this.fin = sand ? DM.sand : DM.sharkFin;
  }

  wander(world) {
    super.wander(world);
    if (this.alwaysSwims) this.cruiseNow = Math.max(this.cruiseNow, this.cruise * 0.75);
  }

  draw(r) {
    const b = this.body, w = b.w, z = this.z, id = this.id, n = b.n, a = b.a;
    this.drawSpine(r, 0, n - 1, z, this.sand ? 0.6 : 0.8, this.skin, id);
    // Pectoral fins swept back, the dorsal fin standing up (a ridge from above), and the tail with its long upper lobe.
    for (const s of [-1, 1]) {
      const pa = a[3] + PI + s * 0.95, px = b.px(3, s * PI / 2, 0), py = b.py(3, s * PI / 2, 0), L = w[3] * 1.9;
      r.tube(px, py, 1.1, z, px + Math.cos(pa) * L, py + Math.sin(pa) * L, 0.5, z - 0.5, 0.3, this.fin, id);
    }
    if (!this.sand) {
      const top = z + w[4] * 0.8;
      r.tube(b.x[4], b.y[4], 1, top, (b.x[4] + b.x[5]) / 2, (b.y[4] + b.y[5]) / 2, 0.45, top + 6, 0.5, this.fin, id);
      r.tube((b.x[4] + b.x[5]) / 2, (b.y[4] + b.y[5]) / 2, 0.45, top + 6, b.x[6], b.y[6], 0.8, top, 0.5, this.fin, id);
    }
    const ta = a[n - 1] + PI, tx = b.x[n - 1], ty = b.y[n - 1], T = w[3] * (this.sand ? 1.2 : 1.6);
    r.tube(tx, ty, 0.9, z, tx + Math.cos(ta + 0.32) * T * 1.3, ty + Math.sin(ta + 0.32) * T * 1.3, 0.4, z + 0.5, 0.3, this.fin, id);
    r.tube(tx, ty, 0.8, z, tx + Math.cos(ta - 0.45) * T * 0.7, ty + Math.sin(ta - 0.45) * T * 0.7, 0.4, z - 0.3, 0.3, this.fin, id);
    // Gill slits.
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) r.dot(b.px(1 + k * 0.4 | 0, s * PI / 2.2, -0.2 - k * 0.5), b.py(1 + k * 0.4 | 0, s * PI / 2.2, -0.2 - k * 0.5), z + w[1] * 0.6, DM.angler, id);
    this.drawEyes(r, 1.3, w[0] * 0.2, z + w[0] * 0.7, false);
  }
}

// ---- the deep: anglerfish, gulper eel, vampire squid, giant isopod -----------------------------

class Angler extends Fish {
  constructor(world, x, y) {
    super(world, x, y, {
      species: 'angler', links: [2.2, 2.2, 2, 1.8, 1.6], widths: [3.6, 4.8, 5, 4.3, 3, 1.6],
      constraint: PI / 6, cruise: 2.2, maxSpeed: 16, turnRate: 1.6, wiggleAmp: 0.3, wiggleFreq: 4,
      zMin: 2, zMax: 12, sight: 60, skittish: false, outline: outlineOf(DM.angler),
    });
    this.lureId = newId(hexToInt('#0a2a40'));
    EMISSIVE[this.lureId] = 2;
    this.keepIn = deepKeep(DEEP.angler.deepMin);
    this.predWeight = 1.2;
  }

  draw(r, t) {
    const b = this.body, w = b.w, z = this.z, id = this.id, h = b.a[0];
    this.drawSpine(r, 0, b.n - 1, z, 0.85, DM.angler, id);
    // The gaping jaw with its needle teeth.
    const mx = b.x[0] + Math.cos(h) * 1.6, my = b.y[0] + Math.sin(h) * 1.6;
    r.ellipsoid(mx, my, 2.6, 3.4, h, z + 0.5, 1.2, DM.gulperMouth, id);
    for (let k = -3; k <= 3; k++) r.dot(mx + Math.cos(h + k * 0.35) * 2.8, my + Math.sin(h + k * 0.35) * 2.8, z + 2, DM.teeth, id);
    // The lure: a stalk from the forehead, bobbing, ending in a light.
    const bob = Math.sin(t * 2 + this.phase) * 1.2, sx = b.x[1], sy = b.y[1], lx = mx + Math.cos(h) * (5 + bob), ly = my + Math.sin(h) * (5 + bob);
    r.tube(sx, sy, 0.5, z + w[1], lx, ly, 0.4, z + w[1] + 4, 0.8, DM.angler, id);
    r.ellipsoid(lx, ly, 1.3 + Math.sin(t * 5) * 0.2, 1.3, 0, z + w[1] + 4, 1.2, DM.lure, this.lureId);
    tail(r, b, z, DM.angler, id, w[2] * 0.9);
  }
}

class Gulper extends Fish {
  constructor(world, x, y) {
    const n = 26;
    super(world, x, y, {
      species: 'gulper', links: new Array(n - 1).fill(1.6),
      widths: Array.from({ length: n }, (_, i) => (i < 3 ? [3.4, 4.2, 2.6][i] : Math.max(0.4, 1.5 - i * 0.045))),
      constraint: PI / 7, cruise: 5, maxSpeed: 14, turnRate: 1.8, wiggleAmp: 0.5, wiggleFreq: 3.5,
      zMin: 4, zMax: 20, sight: 55, skittish: false, outline: outlineOf(DM.gulper),
    });
    this.glowId = newId(hexToInt('#2a0010'));
    EMISSIVE[this.glowId] = 2;
    this.keepIn = deepKeep(DEEP.gulper.deepMin);
  }

  draw(r, t) {
    const b = this.body, z = this.z, id = this.id, n = b.n, h = b.a[0];
    this.drawSpine(r, 2, n - 1, z, 0.9, DM.gulper, id);
    // The pelican-pouch mouth, far bigger than the body behind it.
    r.ellipsoid(b.x[1] + Math.cos(h) * 1.5, b.y[1] + Math.sin(h) * 1.5, 5, 3.6, h, z, 1.4, (lx) => (lx > 0.3 ? DM.gulperMouth : DM.gulper), id);
    const k = 0.7 + Math.sin(t * 3 + this.phase) * 0.3;
    r.ellipsoid(b.x[n - 1], b.y[n - 1], 1 + k * 0.4, 1 + k * 0.4, 0, z + 0.5, 1, DM.glowPink, this.glowId);
    this.drawEyes(r, 1.8, 1.4, z + 2, false);
  }
}

class VampireSquid extends Octopus {
  constructor(world, x, y) {
    super(world, x, y);
    this.species = 'vampire';
    this.base = DM.vampire; this.mat = DM.vampire;
    this.tipId = newId(hexToInt('#0a1430'));
    EMISSIVE[this.tipId] = 2;
    this.keepIn = deepKeep(DEEP.vampire.deepMin);
    OUTLINE[this.id] = outlineOf(DM.vampire);
  }

  updateMaterials() { this.mat = DM.vampire; this.spotMat = [DM.vampire[0], DM.vampire[0], DM.vampire[1], DM.vampire[2]]; }

  draw(r, t) {
    super.draw(r, t);
    // The cloak webbed between the arms, and a blue light at every arm tip.
    r.ellipsoid(this.x, this.y, 6.5, 6.5, 0, this.z + 0.2, 1, (lx, ly) => ((((Math.atan2(ly, lx) / TAU) * 8) % 1 + 1) % 1 < 0.7 ? DM.vampire : null), this.id);
    for (const arm of this.arms) {
      const ch = arm.ch, n = ch.n - 1;
      if (Math.sin(t * 2 + arm.phase * 3) > -0.2) r.dot(ch.x[n], ch.y[n], this.z + 1.5, DM.vampEye, this.tipId);
    }
  }
}

class Isopod extends Walker {
  constructor(world, x, y) {
    const legs = [];
    for (let k = 0; k < 7; k++) {
      for (const side of [1, -1]) {
        legs.push({ bi: 1 + (k * 5 / 7 | 0), off: PI / 2.2, side, group: (k + (side > 0 ? 0 : 1)) % 2, reach: 1.6, l1: 1.3, l2: 1.2, inset: 0.4, stepDist: 1.8, r1: 0.45, r2: 0.35, foot: 0.4 });
      }
    }
    super(world, x, y, {
      species: 'isopod', links: new Array(6).fill(1.9), widths: [2.2, 3, 3.4, 3.5, 3.3, 2.8, 2],
      constraint: PI / 10, cruise: 2.2, maxSpeed: 6, turnRate: 1.2, wiggleAmp: 0.05, gaitK: 1.4, stepDur: 0.18, lift: 0.6,
      zBody: 1, sight: 50, outline: outlineOf(DM.isopod), legs,
    });
    this.skin = bakeShader((u) => ((u * 8) % 1 < 0.22 ? DM.isopodBand : DM.isopod), 40, 4);
    this.keepIn = deepKeep(DEEP.isopod.deepMin);
  }

  draw(r) {
    const b = this.body, z = this.zBody, id = this.id, h = b.a[0];
    this.drawLegs(r, DM.isopodBand);
    this.drawSpine(r, 0, b.n - 1, z, 0.75, this.skin, id);
    for (const s of [-1, 1]) {
      const a = h + s * 0.5, x0 = b.x[0] + Math.cos(h) * 1.5, y0 = b.y[0] + Math.sin(h) * 1.5;
      r.tube(x0, y0, 0.4, z + 1.5, x0 + Math.cos(a) * 6, y0 + Math.sin(a) * 6, 0.3, z + 1, 0.8, DM.isopodBand, id);
    }
    this.drawEyes(r, 1.4, 0.6, z + b.w[0] * 0.8, false);
  }
}

// ---- fresh water: giant catfish, cavefish, olm ------------------------------------------------------

class Catfish extends Fish {
  constructor(world, x, y) {
    super(world, x, y, {
      species: 'catfish', links: new Array(10).fill(2.9), widths: [4, 4.6, 4.5, 4.1, 3.6, 3, 2.4, 1.8, 1.3, 0.8, 0.4],
      constraint: PI / 9, cruise: 5, maxSpeed: 15, turnRate: 1.2, wiggleAmp: 0.18, wiggleFreq: 3,
      zMin: 2, zMax: 9, sight: 80, skittish: false, outline: outlineOf(DM.catfish),
    });
    const s = rand(0, 99);
    this.skin = bakeShader((u, v) => (Math.abs(v) > 0.78 ? DM.catBelly : vnoise(u * 16 + s, v * 3, 14) > 0.6 ? DM.catSpot : DM.catfish), 40, 12);
    this.keepIn = deepKeep(DEEP.catfish.deepMin);
    this.predWeight = 0.8;
  }

  draw(r, t) {
    const b = this.body, w = b.w, z = this.z, id = this.id, h = b.a[0];
    this.drawSpine(r, 0, b.n - 1, z, 0.65, this.skin, id);
    // Four barbels sweeping from the mouth.
    for (const [side, len, spread] of [[1, 9, 0.5], [-1, 9, 0.5], [1, 5, 1.2], [-1, 5, 1.2]]) {
      const x0 = b.x[0] + Math.cos(h) * 2, y0 = b.y[0] + Math.sin(h) * 2;
      let px = x0, py = y0, a = h + side * spread;
      for (let k = 0; k < 3; k++) {
        a -= side * 0.35 + Math.sin(t * 2 + k + side) * 0.08;
        const nx = px + Math.cos(a) * len / 3, ny = py + Math.sin(a) * len / 3;
        r.tube(px, py, 0.45, z + 0.5, nx, ny, 0.35, z + 0.3, 0.8, DM.barbel, id);
        px = nx; py = ny;
      }
    }
    for (const s of [-1, 1]) r.ellipsoid(b.px(2, s * PI / 3, 0), b.py(2, s * PI / 3, 0), w[2], w[2] * 0.35, b.a[2] - s * PI / 3, z, 0.3, DM.catfish, id);
    tail(r, b, z, DM.catfish, id, w[3] * 0.9);
    this.drawEyes(r, 1.4, w[0] * 0.25, z + w[0] * 0.6, false);
  }
}

class Cavefish extends Fish {
  constructor(world, x, y, school) {
    super(world, x, y, {
      species: 'cavefish', links: new Array(6).fill(1.2), widths: [0.9, 1.2, 1.3, 1.1, 0.8, 0.4, 0],
      constraint: PI / 6, cruise: 11, maxSpeed: 24, turnRate: 4.5, wiggleAmp: 0.35, wiggleFreq: 12,
      zMin: 4, zMax: 18, sight: 45, skittish: true, outline: outlineOf(DM.cave),
    });
    this.school = school || { tx: x, ty: y, tz: 10, until: 0 };
    this.ox = rand(-8, 8); this.oy = rand(-8, 8);
    this.keepIn = deepKeep(DEEP.cavefish.deepMin);
  }

  wander(world) {
    const s = this.school;
    if (s.until <= world.t) {
      for (let i = 0; i < 12; i++) { s.tx = rand(10, world.W - 10); s.ty = rand(10, world.H - 10); if (this.keepIn(world, s.tx, s.ty)) break; }
      s.tz = rand(this.zMin, this.zMax); s.until = world.t + rand(3, 7);
      if (typeof deepZ === 'function') s.tz = deepZ(world, { x: s.tx, y: s.ty, zMin: this.zMin, species: this.species }, s.tz);
    }
    this.tx = s.tx + this.ox; this.ty = s.ty + this.oy; this.tz = s.tz + rand(-3, 3);
    this.timer = rand(0.5, 1.5); this.cruiseNow = this.cruise * rand(0.8, 1.1);
  }

  social(world) { return Tetra.prototype.social.call(this, world); }

  draw(r) {
    const b = this.body, z = this.z, id = this.id;
    this.drawSpine(r, 0, 4, z, 1, DM.cave, id); // blind: no eyes at all
    r.tube(b.x[4], b.y[4], 0.6, z, b.x[5], b.y[5], 1, z, 0.3, DM.cave, id);
    r.tube(b.x[5], b.y[5], 1, z, b.x[6], b.y[6], 1.4, z, 0.3, DM.cave, id);
  }
}

class Olm extends Walker {
  constructor(world, x, y) {
    super(world, x, y, {
      species: 'olm', links: new Array(18).fill(1.25), widths: [1.3, 1.5, 1.4, 1.3, 1.3, 1.3, 1.3, 1.3, 1.25, 1.2, 1.15, 1.1, 1, 0.9, 0.8, 0.7, 0.55, 0.45, 0.35],
      constraint: PI / 7, cruise: 3, maxSpeed: 8, turnRate: 1.6, wiggleAmp: 0.3, gaitK: 1.2, stepDur: 0.25, lift: 0.5, zBody: 0.9, sight: 40,
      outline: outlineOf(DM.olm),
      legs: legSpec({ bi: 3, off: PI / 3, reach: 1.2 }, { bi: 11, off: PI / 3, reach: 1.1 }, { l1: 1, l2: 0.9, inset: 0.3, stepDist: 1.6, r1: 0.4, r2: 0.3, foot: 0.4 }),
    });
    this.keepIn = deepKeep(DEEP.olm.deepMin);
  }

  draw(r, t) {
    const b = this.body, z = this.zBody, id = this.id;
    this.drawLegs(r, DM.olm);
    this.drawSpine(r, 0, b.n - 1, z, 0.8, DM.olm, id);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const a = b.a[1] + PI - s * (0.9 + k * 0.35) + Math.sin(t * 2 + k) * 0.1, bx = b.px(1, s * PI / 2, -0.3), by = b.py(1, s * PI / 2, -0.3);
      r.tube(bx, by, 0.4, z + 0.8, bx + Math.cos(a) * 1.8, by + Math.sin(a) * 1.8, 0.35, z + 1.2, 0.8, DM.olmGill, id);
    }
  }
}

// ---- the mythic -----------------------------------------------------------------------------------

class Kraken extends Octopus {
  constructor(world, x, y) {
    super(world, x, y);
    this.species = 'kraken';
    this.base = DM.kraken; this.mat = DM.kraken;
    this.cruise = 4; this.maxSpeed = 10; this.sight = 110;
    // Ten great arms instead of eight small ones.
    this.arms = Array.from({ length: 10 }, (_, k) => ({
      ang: (k + 0.5) / 10 * TAU, phase: rand(0, TAU),
      ch: new Chain(x, y, 0, new Array(12).fill(3.2), Array.from({ length: 13 }, (_, i) => 3.2 - i * 0.22), PI / 4),
      tx: x, ty: y, ox: x, oy: y, t: 1, stepping: false, lift: 0,
    }));
    this.eyeId = newId(hexToInt('#2a1a00'));
    EMISSIVE[this.eyeId] = 2;
    this.keepIn = deepKeep(DEEP.kraken.deepMin);
    OUTLINE[this.id] = outlineOf(DM.kraken);
    this.predWeight = 4;
    this.place(x, y);
  }

  armRest(arm, t) {
    const a = this.heading + arm.ang + Math.sin(t * 0.4 + arm.phase) * 0.25, d = 26 + Math.sin(t * 0.6 + arm.phase) * 5;
    return [this.x + Math.cos(a) * d, this.y + Math.sin(a) * d];
  }

  armBase(arm) { const a = this.heading + arm.ang; return [this.x + Math.cos(a) * 5, this.y + Math.sin(a) * 5, a]; }
  hit(px, py) { return Math.hypot(px - this.x, py - this.y) < 14; }
  updateMaterials() { this.mat = DM.kraken; this.spotMat = [DM.kraken[0], DM.kraken[0], DM.kraken[1], DM.kraken[2]]; }

  update(dt, world) {
    super.update(dt, world);
    // Anything small that strays within an arm's reach of a tip is taken.
    if (this.life && this.life.energy < 0.9 && Math.random() < dt * 0.5) {
      for (const arm of this.arms) {
        const ch = arm.ch, tx = ch.x[ch.n - 1], ty = ch.y[ch.n - 1];
        const prey = world.creatures.find((c) => c !== this && c.life && isPrey(c) && !c.caught && (c.x - tx) ** 2 + (c.y - ty) ** 2 < 36);
        if (prey) { eat(world, this, prey); break; }
      }
    }
  }

  draw(r, t) {
    const z = this.z, id = this.id, h = this.heading;
    for (const arm of this.arms) {
      const ch = arm.ch, n = ch.n;
      for (let i = 0; i < n - 1; i++) {
        const z0 = lerp(z + 3, arm.lift, i / (n - 1)), z1 = lerp(z + 3, arm.lift, (i + 1) / (n - 1));
        r.tube(ch.x[i], ch.y[i], ch.w[i], z0, ch.x[i + 1], ch.y[i + 1], ch.w[i + 1], z1, 0.8, (u, v) => (Math.abs(v) < 0.3 && (u * 30) % 1 < 0.3 ? DM.krakenEye : this.mat), id);
      }
    }
    r.ellipsoid(this.x, this.y, 8, 8, 0, z + 1, 6, this.mat, id);
    r.ellipsoid(this.x - Math.cos(h) * 7, this.y - Math.sin(h) * 7, 13, 10, h, z + 3, 11, this.mat, id);
    for (const s of [-1, 1]) {
      const ex = this.x + Math.cos(h + s * 1.0) * 5, ey = this.y + Math.sin(h + s * 1.0) * 5;
      r.ellipsoid(ex, ey, 2.2, 1.6, h, z + 8, 1.4, DM.krakenEye, this.eyeId);
      r.dot(ex, ey, z + 9.6, DM.pupil, this.eyeId);
    }
  }
}

class Leviathan extends Fish {
  constructor(world, x, y) {
    const n = 64;
    super(world, x, y, {
      species: 'leviathan', links: new Array(n - 1).fill(3.2),
      widths: Array.from({ length: n }, (_, i) => (i < 4 ? [5, 6.4, 7, 7.2][i] : Math.max(1.2, 7.2 - i * 0.09))),
      constraint: PI / 12, cruise: 7, maxSpeed: 14, turnRate: 0.6, wiggleAmp: 0.35, wiggleFreq: 1.4,
      zMin: 8, zMax: 24, sight: 140, skittish: false, outline: outlineOf(DM.levi),
    });
    this.glowId = newId(hexToInt('#021818'));
    EMISSIVE[this.glowId] = 2;
    this.keepIn = deepKeep(DEEP.leviathan.deepMin);
    this.predWeight = 3;
  }

  hit(px, py) { return Math.hypot(px - this.x, py - this.y) < 12; }

  draw(r, t) {
    const b = this.body, w = b.w, z = this.z, id = this.id, n = b.n;
    this.drawSpine(r, 0, n - 1, z, 0.85, DM.levi, id);
    // A ridge of spines down the back, and a row of lights along each flank that ripple.
    for (let i = 3; i < n - 4; i += 3) {
      r.tube(b.x[i], b.y[i], 0.9, z + w[i] * 0.85, b.x[i + 1], b.y[i + 1], 0.3, z + w[i] * 0.85 + 4, 0.6, DM.leviSpine, id);
      if (Math.sin(t * 2 - i * 0.25) > 0.2) for (const s of [-1, 1]) r.dot(b.px(i, s * PI / 2.4, 0), b.py(i, s * PI / 2.4, 0), z + w[i] * 0.5, DM.leviGlow, this.glowId);
    }
    this.drawEyes(r, 3, 1.8, z + w[0] * 0.8, true);
  }
}

// The Watcher: an eye as big as a boulder, drifting in the dark on a crown of
// short tentacles. Its pupil follows the pointer, or whatever moves nearest.
class Watcher extends Creature {
  constructor(world, x, y) {
    super(world, x, y);
    this.species = 'watcher';
    this.z = 14; this.cruise = 2.5; this.maxSpeed = 5; this.turnRate = 0.4; this.sight = 200;
    this.body = new Chain(x, y, this.heading, [3], [9, 6], PI);
    this.id = newId(outlineOf(DM.watcherFlesh));
    this.irisId = newId(hexToInt('#021a08'));
    EMISSIVE[this.irisId] = 2;
    this.tents = Array.from({ length: 9 }, (_, k) => ({ a: k / 9 * TAU, ph: rand(0, TAU), ch: new Chain(x, y, 0, new Array(6).fill(2.2), [1.6, 1.4, 1.2, 1, 0.8, 0.6, 0.4], PI / 3) }));
    this.look = [0, 0];
    this.keepIn = deepKeep(DEEP.watcher.deepMin);
  }

  hit(px, py) { return Math.hypot(px - this.x, py - this.y) < 11; }
  chains() { return this.tents.map((t) => t.ch); }

  update(dt, world) {
    this.timer -= dt;
    if (this.grabbed) {
      const [gx, gy, want] = this.pointerGoal(world);
      this.turnToward(Math.atan2(gy, gx), 3, dt); this.speed += (want - this.speed) * Math.min(1, dt * 2);
    } else {
      if (this.timer <= 0 || Math.hypot(this.tx - this.x, this.ty - this.y) < 8) { this.newTarget(world); this.timer = rand(8, 16); }
      const [ax, ay] = this.avoid(world, this.z), [dx, dy] = deepPush(world, this);
      const intent=typeof mindIntent==='function' ? mindIntent(world,this) : null;
      const gx = (intent?.x ?? this.tx) - this.x, gy = (intent?.y ?? this.ty) - this.y, gl = Math.hypot(gx, gy) || 1;
      this.turnToward(Math.atan2(gy / gl + ay * 2 + dy, gx / gl + ax * 2 + dx), this.turnRate, dt);
      this.speed += ((intent?.speed ?? this.cruise) - this.speed) * Math.min(1, dt);
      if(this.life?.mind && (this.threat || this.dread)){
        const th=this.threat||this.dread;
        this.turnToward(Math.atan2(this.y-th.y,this.x-th.x),3,dt);
        this.speed=this.maxSpeed;
      }
    }
    this.x = clamp(this.x + Math.cos(this.heading) * this.speed * dt, 8, world.W - 8);
    this.y = clamp(this.y + Math.sin(this.heading) * this.speed * dt, 8, world.H - 8);
    this.z = 14 + Math.sin(world.t * 0.5) * 2;
    this.body.resolve(this.x, this.y, this.heading);
    // The gaze: the pointer if it's near, otherwise the nearest thing that moves.
    const p = world.pointer;
    let tx = p.x, ty = p.y;
    if (!p.inside || Math.hypot(p.x - this.x, p.y - this.y) > 160) {
      let bd = Infinity;
      for (const c of world.creatures) {
        if (c === this || !c.life) continue;
        const d = (c.x - this.x) ** 2 + (c.y - this.y) ** 2;
        if (d < bd) { bd = d; tx = c.x; ty = c.y; }
      }
    }
    const la = Math.atan2(ty - this.y, tx - this.x), ld = Math.min(1, Math.hypot(tx - this.x, ty - this.y) / 60);
    this.look[0] += (Math.cos(la) * ld * 3.4 - this.look[0]) * Math.min(1, dt * 3);
    this.look[1] += (Math.sin(la) * ld * 3.4 - this.look[1]) * Math.min(1, dt * 3);
    for (const tn of this.tents) {
      const a = tn.a + world.t * 0.1, bx = this.x + Math.cos(a) * 7, by = this.y + Math.sin(a) * 7;
      const sw = Math.sin(world.t * 1.3 + tn.ph) * 0.4;
      tn.ch.resolve(bx, by, a + sw);
    }
  }

  draw(r, t) {
    const z = this.z, id = this.id;
    for (const tn of this.tents) {
      const ch = tn.ch;
      for (let i = 0; i < ch.n - 1; i++) r.tube(ch.x[i], ch.y[i], ch.w[i], z - i * 1.4, ch.x[i + 1], ch.y[i + 1], ch.w[i + 1], z - (i + 1) * 1.4, 0.8, DM.watcherFlesh, id);
    }
    r.ellipsoid(this.x, this.y, 10, 10, 0, z - 2, 4, DM.watcherFlesh, id);
    r.ellipsoid(this.x, this.y, 8.5, 8.5, 0, z, 7, DM.sclera, id);
    const ix = this.x + this.look[0], iy = this.y + this.look[1], blink = (t * 0.2 + this.phase) % 1 < 0.02;
    if (!blink) {
      r.ellipsoid(ix, iy, 4.4, 4.4, 0, z + 5.8, 2.4, DM.iris, this.irisId);
      r.ellipsoid(ix + this.look[0] * 0.2, iy + this.look[1] * 0.2, 1.9, 2.8, Math.atan2(this.look[1], this.look[0]), z + 7.6, 1.2, DM.pupil, this.irisId);
    }
  }
}

// A plain fish tail for the deep fish.
function tail(r, b, z, m, id, len) {
  const n = b.n - 1, a = b.a[n] + PI;
  for (const s of [-1, 1]) r.tube(b.x[n], b.y[n], 0.8, z, b.x[n] + Math.cos(a + s * 0.45) * len, b.y[n] + Math.sin(a + s * 0.45) * len, 0.5, z, 0.3, m, id);
}

// ---- construction, spawning, arriving -------------------------------------------------------------

Object.assign(CREATE, {
  shark: (w, x, y) => new Shark(w, x, y, false), sandshark: (w, x, y) => new Shark(w, x, y, true),
  angler: (w, x, y) => new Angler(w, x, y), gulper: (w, x, y) => new Gulper(w, x, y), vampire: (w, x, y) => new VampireSquid(w, x, y),
  isopod: (w, x, y) => new Isopod(w, x, y), catfish: (w, x, y) => new Catfish(w, x, y), cavefish: (w, x, y, a) => new Cavefish(w, x, y, a.school),
  olm: (w, x, y) => new Olm(w, x, y), kraken: (w, x, y) => new Kraken(w, x, y), leviathan: (w, x, y) => new Leviathan(w, x, y),
  watcher: (w, x, y) => new Watcher(w, x, y),
});

// While a mythic is in the pond: now and then an eerie line in the journal, and
// the Watcher's gaze unsettles everything near it.
const EERIE = {
  kraken: ['The water around the Kraken goes still and cold', 'An arm as long as the pond drags across the deep floor', 'Small fish vanish near the drop-off, one by one'],
  leviathan: ['Something long passes beneath everything, and keeps passing', 'The whole pond seems to lean toward the deep', 'Lights ripple along a flank that never seems to end'],
  watcher: ['The Watcher has not blinked in a long time', 'Everything in the pond feels looked at', 'The eye turns, slowly, toward the surface'],
};
let deepTick = 0;
function updateDeep(world, dt) {
  deepTick -= dt;
  if (deepTick > 0) return;
  deepTick = 2;
  for (const m of world.creatures) {
    if (!DEEP[m.species] || !DEEP[m.species].mythic || m.leaving) continue;
    if (Math.random() < 0.02) logEvent(world, pick(EERIE[m.species]), m, { cat: 'rare', pri: 1 });
    if (m.species === 'watcher') {
      for (const c of world.creatures) if (c.life && c !== m && (c.x - m.x) ** 2 + (c.y - m.y) ** 2 < 8100) c.life.comfort = Math.max(0, c.life.comfort - 0.05);
    }
  }
}

// ---- deep plants ----------------------------------------------------------------------------------

const BLACK_CORALS = [
  mat('#0a0606', '#1a0e0c', '#2e1a16', '#4a2a22'),
  mat('#060a13', '#111a28', '#263344', '#455568'),
  mat('#100813', '#241326', '#402941', '#68405a'),
];
const BLACK_TIPS = [mat('#5a0a0a', '#8a1a14', '#c02a1e', '#f0503a'), mat('#4a2838', '#86445a', '#ba6a78', '#f4aaa0')];
class BlackCoral extends Coral {
  constructor(x, y) {
    super(x, y, pick(['staghorn', 'staghorn', 'fan', 'fan', 'whip', 'tube']));
    this.m = pick(BLACK_CORALS);
    this.tip = pick(BLACK_TIPS);
    OUTLINE[this.id] = outlineOf(this.m);
    this.skin = (u) => (u > 0.72 ? this.tip : this.m);
  }
}

// Bioluminescent mushrooms that pulse in the dark.
const GLOWCAP = mat('#1a5a4a', '#2a8a70', '#4ac4a0', '#a0f4dc'), GLOW_STALK = mat('#4a4a3e', '#6e6e5c', '#94947e', '#bcbca4');
class Glowcap {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.caps = Array.from({ length: randi(5, 9) }, () => ({ ox: rand(-5, 5), oy: rand(-5, 5), h: rand(2, 5), r: rand(1.2, 2.4), ph: rand(0, TAU) }));
    this.id = newId(outlineOf(GLOW_STALK));
    this.capId = newId(hexToInt('#0a2a20'));
    EMISSIVE[this.capId] = 2;
  }

  hit(x, y) { return Math.hypot(x - this.x, y - this.y) < 7; }
  update() {}

  draw(r, t) {
    for (const c of this.caps) {
      const x = this.x + c.ox, y = this.y + c.oy;
      r.tube(x, y, 0.5, 0, x, y, 0.4, c.h, 0.9, GLOW_STALK, this.id);
      if (Math.sin(t * 0.8 + c.ph) > -0.6) r.ellipsoid(x, y, c.r, c.r, 0, c.h, c.r * 0.6, GLOWCAP, this.capId);
    }
  }
}
Object.assign(GROW, { blackcoral: (w, x, y) => new BlackCoral(x, y), glowcap: (w, x, y) => new Glowcap(x, y) });
Object.assign(PLANT_PRICE, { blackcoral: 20, glowcap: 20 });
Object.assign(LIKE_LABEL, { blackcoral: 'black coral', glowcap: 'glowcaps' });
for (const k of ['angler', 'gulper', 'vampire', 'isopod', 'shark']) LIKES[k] = [...(LIKES[k] || []), 'blackcoral'];
for (const k of ['cavefish', 'olm', 'isopod', 'catfish']) LIKES[k] = [...(LIKES[k] || []), 'glowcap'];
Object.assign(PLANT_WATER, { blackcoral: 0.8, glowcap: -0.8 });
Object.assign(PLANT_COVER, { blackcoral: 0.04, glowcap: 0.03 });
for (const k of ['kelp', 'drowned', 'smoker', 'grotto', 'whalefall', 'idol']) LIKE_LABEL[k] = STRUCTURES[k].label.toLowerCase();

// What each depth tier opens up besides animals, for the evolution tree:
// structures to build, food to drop, and plants that only grow that deep.
const DEEP_EXTRAS = [
  { kind: 'build', key: 'kelp' }, { kind: 'build', key: 'drowned' }, { kind: 'food', key: 'krill', label: 'Krill', branch: 'salt', tier: 2 },
  { kind: 'food', key: 'bloodworm', label: 'Bloodworms', branch: 'fresh', tier: 2 }, { kind: 'build', key: 'smoker' }, { kind: 'build', key: 'grotto' },
  { kind: 'plant', key: 'blackcoral', label: 'Black coral', branch: 'salt', tier: 3 }, { kind: 'plant', key: 'glowcap', label: 'Glowcaps', branch: 'fresh', tier: 3 },
  { kind: 'food', key: 'snow', label: 'Marine snow', branch: 'both', tier: 3 }, { kind: 'build', key: 'whalefall' }, { kind: 'build', key: 'idol' },
].map((e) => (e.kind === 'build' ? { ...e, label: STRUCTURES[e.key].label, branch: STRUCTURES[e.key].habitat, tier: STRUCTURES[e.key].tier } : e));

// A spot in the pond deep enough for a species (the deepest of a few tries).
function deepSpot(world, kind) {
  const need = DEEP[kind] ? DEEP[kind].deepMin : 0;
  let best = [world.W / 2, world.H / 2], bd = -1;
  for (let i = 0; i < 40; i++) {
    const x = rand(12, world.W - 12), y = rand(12, world.H - 12), d = depthAt(world, x, y);
    if (world.shore && shoreAt(world, x, y) > 0.05 && kind !== 'sandshark') continue;
    if (d >= need) return [x, y];
    if (d > bd) { bd = d; best = [x, y]; }
  }
  return best;
}

const one = (kind) => (w, x, y) => [makeCreature(kind, w, ...deepSpotIf(w, kind, x, y))];
const deepSpotIf = (w, kind, x, y) => (DEEP[kind].deepMin > 0 ? deepSpot(w, kind) : [x, y]);
Object.assign(SPECIES, {
  sandshark: { label: 'Sand shark', color: '#b4a07a', spawn: one('sandshark') },
  shark: { label: 'Reef shark', color: '#687888', spawn: one('shark') },
  catfish: { label: 'Giant catfish', color: '#4e5830', spawn: one('catfish') },
  angler: { label: 'Anglerfish', color: '#9ae0ff', spawn: one('angler') },
  gulper: { label: 'Gulper eel', color: '#ff4a8a', spawn: one('gulper') },
  vampire: { label: 'Vampire squid', color: '#962430', spawn: one('vampire') },
  isopod: { label: 'Giant isopod', color: '#b0aaba', spawn: one('isopod') },
  cavefish: {
    label: 'Cavefish', color: '#f0c8c8',
    spawn: (w) => {
      const [x, y] = deepSpot(w, 'cavefish'), school = { tx: x, ty: y, tz: 10, until: 0 };
      return Array.from({ length: randi(6, 9) }, () => makeCreature('cavefish', w, x + rand(-6, 6), y + rand(-6, 6), { school }));
    },
  },
  olm: { label: 'Olm', color: '#ecd8d0', spawn: one('olm') },
  kraken: { label: 'Kraken', color: '#7a3070', spawn: one('kraken') },
  leviathan: { label: 'Leviathan', color: '#2a6068', spawn: one('leviathan') },
  watcher: { label: 'The Watcher', color: '#4ae070', spawn: one('watcher') },
});

// Which deep species this pond's branch and depth allow.
function deepAvailable(world, kind) {
  const d = DEEP[kind], tier = world.erosion ? world.erosion.tier : 0;
  if (!d) return true;
  return tier >= d.tier && (d.branch === 'both' || fitsHabitat(world, d.branch));
}
const deepUnlocked = (world, kind) => !DEEP[kind] || (world.game && (world.game.unlocked || []).includes(kind));

// The deep draws its own visitors now and then, the mythic almost never.
const MYTHIC_ARRIVAL = {
  kraken: 'Something vast uncoils in the abyss. A Kraken has come',
  leviathan: 'The deep water heaves. A Leviathan passes through the pond',
  watcher: 'In the drowned dark, an eye opens. The Watcher is here',
};
function arriveDeep(world) {
  // The idol's lure, the Black Tide, and anything Ascended all draw the mythic up.
  const lure = (world.structures || []).reduce((a, s) => a + (STRUCTURES[s.kind].lure || 0), 0) +
    (typeof eldPath === 'function' && eldPath(world, 'tide') ? 1 : 0) + world.creatures.filter((c) => c.life && c.life.ascended).length;
  const stars = typeof heavenNow === 'function' && heavenNow(world, 'stars') ? 4 : 0; // (the stars are right: the mythic rise)
  // (A kind that's never been here waits its turn, and each pond has its own odds: arrivals.js.)
  const pool = Object.keys(DEEP).filter((k) => deepAvailable(world, k) && (!DEEP[k].mythic || Math.random() < 0.06 * (1 + lure + stars)) && (typeof canDiscover !== 'function' || canDiscover(world, k)));
  if (!pool.length) return;
  const kind = typeof pickByOdds === 'function' ? pickByOdds(world, pool) : pick(pool);
  if (world.creatures.filter((c) => c.species === kind).length >= (DEEP[kind].mythic ? 1 : 3)) return;
  const group = SPECIES[kind].spawn(world, ...deepSpot(world, kind));
  for (const c of group) { initLife(c, { alpha: 0 }); noteBorn(world, c, 'arrived'); }
  world.creatures.push(...group);
  ECO.arrivals += group.length;
  if (typeof knows === 'function' && !knows(world, kind)) discover(world, kind, group[0]);
  const G = world.game, first = G && !G.seen.includes(`species:${kind}`);
  if (first) { G.seen.push(`species:${kind}`); deepenBy(world, 0.1); }
  const pts = award(world, (DEEP[kind].mythic ? 150 : 20) + (first ? 30 : 0), DEEP[kind].mythic ? 'mythic sightings' : 'deep sightings', group[0]);
  const shallow = !DEEP[kind].deepMin && DEEP[kind].tier <= 1; // (the reef's and the pond's own find their way in; the deep's come up)
  const text = DEEP[kind].mythic ? `✦ ${MYTHIC_ARRIVAL[kind]} · +${pts}`
    : shallow ? `✦ New to the pond: ${withArticle(SINGULAR[kind].toLowerCase())}${group.length > 1 ? ` group of ${group.length}` : ''} found its way in${first ? ', a first for this pond' : ''} · +${pts}`
    : `✦ From the deep: ${withArticle(SINGULAR[kind].toLowerCase())}${group.length > 1 ? ` school of ${group.length}` : ''} came up out of the dark${first ? ', a first for this pond' : ''} · +${pts}`;
  logEvent(world, text, group[0], { cat: 'rare', pri: 3 });
  if (typeof narrate === 'function') narrate(world, DEEP[kind].mythic ? 'mythic' : 'deep', { what: capFirst(withArticle(SINGULAR[kind].toLowerCase())), subject: group[0] }, first);
  for (const c of group) if (c.life && c.life.traits.length) scoreArrival(world, c);
}
