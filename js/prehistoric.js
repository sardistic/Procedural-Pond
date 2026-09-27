'use strict';
// Further out and darker still: the depths open onto the deep past, a gene pool of creatures that
// should be long gone, and then on and on (the tiers past the dreaming dark are made up as the
// pond reaches them, each wearing it a little further out, to a limit).
//  9  the Cambrian sea / the Carboniferous swamps, from erosion 300: trilobites, anomalocaris and
//     living ammonites (salt); sea scorpions and lungfish (fresh).
//  10 the Devonian dark / the Devonian lakes, from 450: dunkleosteus and the coelacanth (salt);
//     placoderms and giant amphibians (fresh).
//  11 the Permian deep / the primordial mire, from 680: plesiosaurs and mosasaurs (salt); Hyneria,
//     the great lobe-finned hunter (fresh).
//  12+ the depths go on: named as they come, with no new life of their own, only more room.

// ---- the tiers ------------------------------------------------------------------------------------------
const PRE_NAMES = {
  salt: ['The Cambrian sea', 'The Devonian dark', 'The Permian deep', 'The Starfall trench', 'The Glass garden', 'The Other sea'],
  fresh: ['The Carboniferous swamps', 'The Devonian lakes', 'The primordial mire', 'The Fallen-star mire', 'The Grey fen', 'The Other water'],
};
const NAMED = PRE_NAMES.salt.length; // (past these, the names are made up)
const DEEP_ADJ = ['Nameless', 'Sunless', 'Unmade', 'Older', 'Hollow', 'Endless', 'Starless', 'Forgotten', 'Silent', 'Ancestral'];
const DEEP_NOUN = { salt: ['Deep', 'Gulf', 'Abyss', 'Dark', 'Sea'], fresh: ['Mire', 'Waters', 'Well', 'Dark', 'Fen'] };
// Make sure the tiers exist up to index n (the pond asks as it deepens).
function ensureTiers(n) {
  while (DEPTH_TIERS.length <= n) {
    const i = DEPTH_TIERS.length, j = i - 9; // (tiers 0..8 are fixed; 9, 10, 11 are the deep past)
    const erosion = Math.round(200 * 1.5 ** (i - 8) / 10) * 10; // (300, 450, 680, 1010, ...)
    const name = (b) => (j < NAMED ? PRE_NAMES[b][j] : `The ${DEEP_ADJ[(j * 7) % DEEP_ADJ.length]} ${DEEP_NOUN[b][(j * 3) % DEEP_NOUN[b].length]}${j >= NAMED + DEEP_ADJ.length ? ` ${['II', 'III', 'IV', 'V'][Math.min(3, Math.floor((j - NAMED) / DEEP_ADJ.length) - 1)]}` : ''}`);
    DEPTH_TIERS.push({ erosion, salt: name('salt'), fresh: name('fresh'), depth: 1, expand: j < NAMED ? 0.3 : 0.2, dark: true });
  }
}
ensureTiers(40); // (far past anything a pond will reach: tier 40 needs erosion in the tens of millions)

// ---- the look ---------------------------------------------------------------------------------------------
const PM2 = {
  trilo: mat('#3a2a1a', '#6a4e30', '#9a7a52', '#c8a87a'), triloRidge: mat('#2a1e12', '#4a3620', '#6e5434', '#94764c'),
  eury: mat('#2a2a1e', '#4e4a32', '#78704c', '#a49a70'), euryDark: mat('#1a1a12', '#2e2c1e', '#46422e', '#625c42'),
  ammo: mat('#6a4a2a', '#a07a4a', '#d0aa74', '#f4d8a8'), ammoBand: mat('#3a2410', '#5e3c1c', '#80562e', '#a07444'), ammoArm: mat('#6a3a3a', '#9a5a5a', '#c47e7e', '#e8a8a8'),
  anomalo: mat('#5a1a1a', '#8a2e2a', '#b84a3a', '#e07a5a'), anomaloFlap: mat('#6a2a2a', '#9a4a3a', '#c86a4a', '#f09a6a'),
  dunkle: mat('#1e1a14', '#342e24', '#524838', '#766852'), plate: mat('#5a5448', '#8a8270', '#b4ac96', '#dcd4bc'),
  coela: mat('#12203a', '#1e3456', '#2e4c78', '#4a6e9e'), coelaSpot: mat('#8a9ab0', '#b4c2d4', '#d8e2ee', '#ffffff'),
  plesio: mat('#1e2a2a', '#344646', '#4e6666', '#708e8e'), plesioBelly: mat('#6a7a70', '#94a498', '#bccabe', '#e0ece2'),
  mosa: mat('#1a2418', '#2e3e2a', '#465a40', '#627a58'), mosaBelly: mat('#7a7a5a', '#a4a47e', '#cacaa2', '#ececc8'),
  lung: mat('#2a2a14', '#46462a', '#666642', '#8a8a5e'), lungSpot: mat('#14140a', '#222214', '#34341e', '#4a4a2c'),
  placo: mat('#2a2014', '#463824', '#665438', '#8a7650'), temno: mat('#2a2014', '#46361e', '#6a522e', '#927244'), temnoSpot: mat('#1a140c', '#2a2014', '#3e301e', '#54422a'),
  hyneria: mat('#141a10', '#242e1a', '#384628', '#52643a'), hyneriaFin: mat('#1e2414', '#34401e', '#4e5e2c', '#6c7e3e'),
};

// Trilobites: three lobes down their length under a wide head shield, scuttling on the floor.
class Trilobite extends Walker {
  constructor(world, x, y) {
    const legs = [];
    for (let k = 0; k < 6; k++) for (const side of [1, -1]) legs.push({ bi: 1 + (k * 4 / 6 | 0), off: PI / 2.1, side, group: (k + (side > 0 ? 0 : 1)) % 2, reach: 1.2, l1: 0.9, l2: 0.8, inset: 0.3, stepDist: 1.4, r1: 0.3, r2: 0.25, foot: 0.3 });
    super(world, x, y, {
      species: 'trilobite', links: new Array(5).fill(1.7), widths: [3.4, 3.2, 3, 2.7, 2.3, 1.6],
      constraint: PI / 12, cruise: 2, maxSpeed: 5, turnRate: 1.1, wiggleAmp: 0.04, gaitK: 1.5, stepDur: 0.16, lift: 0.5, zBody: 0.8, sight: 40, outline: outlineOf(PM2.trilo), legs,
    });
    this.skin = bakeShader((u, v) => (Math.abs(v) < 0.28 ? PM2.triloRidge : (u * 9) % 1 < 0.2 ? PM2.triloRidge : PM2.trilo), 36, 8);
    this.keepIn = deepKeep(DEEP.trilobite.deepMin);
  }
  draw(r) {
    const b = this.body, z = this.zBody, id = this.id, h = b.a[0];
    this.drawLegs(r, PM2.triloRidge);
    this.drawSpine(r, 0, b.n - 1, z, 0.55, this.skin, id);
    r.ellipsoid(b.x[0] + Math.cos(h) * 1.2, b.y[0] + Math.sin(h) * 1.2, 3.2, 4.2, h, z, 1.6, PM2.trilo, id); // the head shield
    for (const s of [-1, 1]) {
      const a = h + s * 2.3; // its spines trail back
      r.tube(b.px(0, s * PI / 2, 0.2), b.py(0, s * PI / 2, 0.2), 0.5, z, b.x[0] + Math.cos(a) * 7, b.y[0] + Math.sin(a) * 7, 0.2, z, 0.8, PM2.triloRidge, id);
      r.dot(b.px(0, s * 0.9, -0.6), b.py(0, s * 0.9, -0.6), z + 1.6, EYE, id);
    }
  }
}

// Sea scorpions: a long segmented body, a spiked tail, two swimming paddles and grasping claws.
class Eurypterid extends Walker {
  constructor(world, x, y) {
    super(world, x, y, {
      species: 'eurypterid', links: new Array(10).fill(2.1), widths: [2.6, 3.2, 3.4, 3.2, 2.9, 2.5, 2, 1.6, 1.2, 0.9, 0.6],
      constraint: PI / 9, cruise: 4, maxSpeed: 12, turnRate: 1.4, wiggleAmp: 0.08, gaitK: 1.3, stepDur: 0.2, lift: 0.6, zBody: 1.2, sight: 70, outline: outlineOf(PM2.eury),
      legs: legSpec({ bi: 1, off: PI / 2.4, reach: 2.2 }, { bi: 3, off: PI / 2, reach: 2 }, { l1: 1.6, l2: 1.4, inset: 0.3, stepDist: 2, r1: 0.45, r2: 0.35, foot: 0.4 }),
    });
    this.skin = bakeShader((u) => ((u * 11) % 1 < 0.2 ? PM2.euryDark : PM2.eury), 44, 4);
    this.keepIn = deepKeep(DEEP.eurypterid.deepMin);
    this.predWeight = 1.5;
  }
  draw(r, t) {
    const b = this.body, z = this.zBody, id = this.id, n = b.n, h = b.a[0];
    this.drawLegs(r, PM2.euryDark);
    this.drawSpine(r, 0, n - 1, z, 0.6, this.skin, id);
    const ta = b.a[n - 1] + PI;
    r.tube(b.x[n - 1], b.y[n - 1], 0.6, z, b.x[n - 1] + Math.cos(ta) * 6, b.y[n - 1] + Math.sin(ta) * 6, 0.15, z + 0.6, 0.8, PM2.euryDark, id); // the telson
    for (const s of [-1, 1]) {
      const pa = b.a[4] + PI + s * (1.1 + 0.3 * Math.sin(t * 4)); // the paddles, rowing
      r.ellipsoid(b.px(4, s * PI / 2, 0) + Math.cos(pa) * 3, b.py(4, s * PI / 2, 0) + Math.sin(pa) * 3, 3, 1.3, pa, z, 0.5, PM2.eury, id);
      const ca = h + s * 0.4; // the claws
      r.tube(b.x[0], b.y[0], 0.5, z + 0.5, b.x[0] + Math.cos(ca) * 5, b.y[0] + Math.sin(ca) * 5, 0.35, z + 0.5, 0.8, PM2.euryDark, id);
    }
    this.drawEyes(r, 1.5, 0.4, z + b.w[0] * 0.6, false);
  }
}

// Ammonites: a coiled shell, jetting slowly backwards, arms trailing ahead.
class Ammonite extends Fish {
  constructor(world, x, y) {
    super(world, x, y, {
      species: 'ammonite', links: [2, 2], widths: [2.2, 2.6, 1.8], constraint: PI / 6, cruise: 3, maxSpeed: 8, turnRate: 1.2,
      wiggleAmp: 0.05, wiggleFreq: 1.4, zMin: 8, zMax: 30, sight: 40, skittish: true, outline: outlineOf(PM2.ammo),
    });
    this.keepIn = deepKeep(DEEP.ammonite.deepMin);
  }
  draw(r, t) {
    const b = this.body, z = this.z, id = this.id, h = this.heading, cx = b.x[1] - Math.cos(h) * 2, cy = b.y[1] - Math.sin(h) * 2;
    // The shell: a logarithmic spiral of chambers.
    for (let k = 0; k < 12; k++) {
      const a = h + PI + k * 0.55, rr = 5.5 * Math.pow(0.86, k), d = 5.5 * Math.pow(0.86, k) * 0.9;
      r.ellipsoid(cx + Math.cos(a) * d * 0.6, cy + Math.sin(a) * d * 0.6, rr, rr * 0.9, a, z, rr * 0.9, k % 2 ? PM2.ammoBand : PM2.ammo, id);
    }
    for (let k = 0; k < 8; k++) {
      const a = h + (k - 3.5) * 0.14 + Math.sin(t * 3 + k) * 0.12, L = 5 + (k % 3);
      r.tube(b.x[0], b.y[0], 0.4, z, b.x[0] + Math.cos(a) * L, b.y[0] + Math.sin(a) * L, 0.2, z - 0.5, 0.8, PM2.ammoArm, id);
    }
    this.drawEyes(r, 1.2, 0.5, z + 1.5, true);
  }
}

// Anomalocaris: flaps rippling down both sides, two spiny grasping arms ahead of it, eyes on stalks.
class Anomalocaris extends Fish {
  constructor(world, x, y) {
    super(world, x, y, {
      species: 'anomalocaris', links: new Array(9).fill(2.4), widths: [2, 2.6, 2.8, 2.8, 2.6, 2.3, 2, 1.6, 1.2, 1.4],
      constraint: PI / 9, cruise: 7, maxSpeed: 20, turnRate: 1.5, wiggleAmp: 0.1, wiggleFreq: 2.5, zMin: 6, zMax: 26, sight: 90, skittish: false, outline: outlineOf(PM2.anomalo),
    });
    this.keepIn = deepKeep(DEEP.anomalocaris.deepMin);
    this.predWeight = 1.6;
  }
  draw(r, t) {
    const b = this.body, z = this.z, id = this.id, n = b.n, h = b.a[0];
    this.drawSpine(r, 0, n - 1, z, 0.5, PM2.anomalo, id);
    for (let i = 1; i < n - 1; i++) for (const s of [-1, 1]) {
      const wave = Math.sin(t * 6 - i * 0.9) * 0.5, a = b.a[i] + s * (PI / 2 + 0.2 + wave * 0.4);
      r.ellipsoid(b.px(i, s * PI / 2, 0) + Math.cos(a) * 1.8, b.py(i, s * PI / 2, 0) + Math.sin(a) * 1.8, 2.4, 1.2, a, z + wave, 0.3, PM2.anomaloFlap, id);
    }
    for (const s of [-1, 1]) {
      let px = b.x[0], py = b.y[0], a = h + s * 0.35;
      for (let k = 0; k < 5; k++) { a -= s * 0.28; const nx = px + Math.cos(a) * 1.8, ny = py + Math.sin(a) * 1.8; r.tube(px, py, 0.5, z + 0.5, nx, ny, 0.45, z + 0.5, 0.8, PM2.anomaloFlap, id); px = nx; py = ny; }
      const ea = h + s * 1.1;
      r.tube(b.x[0], b.y[0], 0.3, z + 1, b.x[0] + Math.cos(ea) * 2.5, b.y[0] + Math.sin(ea) * 2.5, 0.3, z + 1.5, 0.8, PM2.anomalo, id);
      r.dot(b.x[0] + Math.cos(ea) * 2.8, b.y[0] + Math.sin(ea) * 2.8, z + 2, EYE, id);
    }
  }
}

// Armoured fish: dunkleosteus (vast, salt) and the smaller placoderms (fresh): bone plates over the
// head and blade-jaws where teeth should be.
class Placoderm extends Shark {
  constructor(world, x, y, kind = 'dunkleosteus') {
    super(world, x, y, false);
    this.species = kind;
    const big = kind === 'dunkleosteus';
    const k = big ? 1.5 : 0.8;
    for (let i = 0; i < this.body.links.length; i++) this.body.links[i] *= k;
    for (let i = 0; i < this.body.w.length; i++) this.body.w[i] *= k * (i < 3 ? 1.15 : 1);
    this.skin = big ? PM2.dunkle : PM2.placo;
    this.fin = big ? PM2.dunkle : PM2.placo;
    OUTLINE[this.id] = outlineOf(this.skin);
    this.keepIn = deepKeep(DEEP[kind].deepMin);
    this.predWeight = big ? 3 : 1.6;
    this.cruise *= big ? 0.8 : 1; this.maxSpeed *= big ? 0.9 : 1;
  }
  draw(r, t) {
    super.draw(r, t);
    const b = this.body, z = this.z, id = this.id, h = b.a[0];
    r.ellipsoid(b.x[1], b.y[1], b.w[1] * 1.3, b.w[1] * 1.15, b.a[1], z + b.w[1] * 0.3, b.w[1] * 0.9, PM2.plate, id); // the head armour
    for (const s of [-1, 1]) r.tube(b.x[0], b.y[0], 0.5, z, b.x[0] + Math.cos(h + s * 0.2) * b.w[0] * 1.2, b.y[0] + Math.sin(h + s * 0.2) * b.w[0] * 1.2, 0.3, z, 0.8, PM2.plate, id); // blade jaws
  }
}

// The coelacanth: steel-blue and speckled, with lobed fins that move like legs.
class Coelacanth extends Fish {
  constructor(world, x, y) {
    super(world, x, y, {
      species: 'coelacanth', links: new Array(8).fill(2.6), widths: [2.4, 3.2, 3.6, 3.6, 3.3, 2.9, 2.3, 1.6, 1.4],
      constraint: PI / 10, cruise: 4, maxSpeed: 12, turnRate: 1.2, wiggleAmp: 0.1, wiggleFreq: 1.8, zMin: 4, zMax: 20, sight: 60, skittish: false, outline: outlineOf(PM2.coela),
    });
    const s = rand(0, 99);
    this.skin = bakeShader((u, v) => (hash2(Math.floor(u * 30), Math.floor(v * 6), s) < 0.12 ? PM2.coelaSpot : PM2.coela), 48, 12);
    this.keepIn = deepKeep(DEEP.coelacanth.deepMin);
  }
  draw(r, t) {
    const b = this.body, z = this.z, id = this.id, n = b.n;
    this.drawSpine(r, 0, n - 1, z, 0.8, this.skin, id);
    for (const [i, off] of [[2, PI / 2], [5, PI / 2]]) for (const s of [-1, 1]) {
      const a = b.a[i] + s * (off + 0.5 + 0.35 * Math.sin(t * 3 + i + s)), bx = b.px(i, s * PI / 2, 0), by = b.py(i, s * PI / 2, 0);
      r.ellipsoid(bx + Math.cos(a) * 2, by + Math.sin(a) * 2, 2.2, 1.1, a, z, 0.8, PM2.coela, id); // the lobe
      r.ellipsoid(bx + Math.cos(a) * 4, by + Math.sin(a) * 4, 1.8, 1.4, a, z, 0.3, PM2.coelaSpot, id); // its fin
    }
    const ta = b.a[n - 1] + PI;
    for (const d of [-0.5, 0, 0.5]) r.tube(b.x[n - 1], b.y[n - 1], 0.8, z, b.x[n - 1] + Math.cos(ta + d) * 4, b.y[n - 1] + Math.sin(ta + d) * 4, 0.4, z, 0.3, PM2.coela, id);
    this.drawEyes(r, 1.3, 0.8, z + b.w[0] * 0.7, true);
  }
}

// Marine reptiles: plesiosaurs (a long neck, a small head, four great flippers) and mosasaurs (a
// long-jawed sea lizard, four small flippers and a fluked tail).
class SeaReptile extends Fish {
  constructor(world, x, y, kind = 'plesiosaur') {
    const plesio = kind === 'plesiosaur';
    super(world, x, y, plesio ? {
      species: kind, links: [2.4, 2.4, 2.4, 2.4, 2.4, 2.6, 3.2, 3.4, 3.4, 3.2, 3, 2.6, 2.2],
      widths: [1.5, 1.2, 1.2, 1.3, 1.4, 1.6, 3.4, 5.2, 5.8, 5.4, 4.4, 3, 1.8, 0.9],
      constraint: PI / 8, cruise: 6, maxSpeed: 16, turnRate: 1.1, wiggleAmp: 0.06, wiggleFreq: 1.2, zMin: 10, zMax: 34, sight: 130, skittish: false, outline: outlineOf(PM2.plesio),
    } : {
      species: kind, links: new Array(14).fill(3.2), widths: [2, 2.6, 3.2, 3.8, 4.4, 4.8, 4.8, 4.5, 4, 3.4, 2.8, 2.2, 1.6, 1.2, 0.8],
      constraint: PI / 9, cruise: 8, maxSpeed: 24, turnRate: 1.2, wiggleAmp: 0.16, wiggleFreq: 2.4, zMin: 8, zMax: 30, sight: 140, skittish: false, outline: outlineOf(PM2.mosa),
    });
    this.plesio = plesio;
    this.skin = bakeShader((u, v) => (Math.abs(v) > 0.7 ? (plesio ? PM2.plesioBelly : PM2.mosaBelly) : plesio ? PM2.plesio : PM2.mosa), 56, 12);
    this.keepIn = deepKeep(DEEP[kind].deepMin);
    this.predWeight = plesio ? 2.6 : 3.4;
    this.alwaysSwims = true;
  }
  draw(r, t) {
    const b = this.body, z = this.z, id = this.id, n = b.n, fin = this.plesio ? PM2.plesio : PM2.mosa;
    this.drawSpine(r, 0, n - 1, z, 0.75, this.skin, id);
    const [fi, bi] = this.plesio ? [7, 10] : [4, 9], L = this.plesio ? 7 : 3.5;
    for (const [i, ph] of [[fi, 0], [bi, 1.2]]) for (const s of [-1, 1]) {
      const a = b.a[i] + PI + s * (1.1 + 0.45 * Math.sin(t * (this.plesio ? 1.8 : 3) + ph));
      const bx = b.px(i, s * PI / 2, 0), by = b.py(i, s * PI / 2, 0);
      r.ellipsoid(bx + Math.cos(a) * L * 0.55, by + Math.sin(a) * L * 0.55, L * 0.7, L * 0.22, a, z, 0.4, fin, id);
    }
    if (!this.plesio) {
      const ta = b.a[n - 1] + PI; // the fluke
      r.ellipsoid(b.x[n - 1] + Math.cos(ta) * 2, b.y[n - 1] + Math.sin(ta) * 2, 1.6, 4.4, ta, z, 0.5, fin, id);
      r.tube(b.x[0], b.y[0], 1.2, z, b.x[0] + Math.cos(b.a[0]) * 4, b.y[0] + Math.sin(b.a[0]) * 4, 0.6, z, 0.7, fin, id); // the long jaws
    }
    this.drawEyes(r, this.plesio ? 0.7 : 1.4, this.plesio ? 0.3 : 1, z + b.w[0] * 0.6, false);
  }
}

// Lungfish: eel-like and olive, with long thread-like paired fins.
class Lungfish extends Fish {
  constructor(world, x, y) {
    super(world, x, y, {
      species: 'lungfish', links: new Array(12).fill(2.2), widths: [2, 2.6, 2.8, 2.8, 2.7, 2.5, 2.3, 2, 1.7, 1.4, 1.1, 0.8, 0.5],
      constraint: PI / 7, cruise: 4, maxSpeed: 11, turnRate: 1.5, wiggleAmp: 0.3, wiggleFreq: 2, zMin: 1.5, zMax: 12, sight: 60, skittish: false, outline: outlineOf(PM2.lung),
    });
    const s = rand(0, 99);
    this.skin = bakeShader((u, v) => (vnoise(u * 18 + s, v * 3, 8) > 0.64 ? PM2.lungSpot : PM2.lung), 48, 10);
    this.keepIn = deepKeep(DEEP.lungfish.deepMin);
  }
  draw(r, t) {
    const b = this.body, z = this.z, id = this.id;
    this.drawSpine(r, 0, b.n - 1, z, 0.75, this.skin, id);
    for (const i of [2, 6]) for (const s of [-1, 1]) {
      const a = b.a[i] + PI + s * (0.7 + 0.25 * Math.sin(t * 2 + i)), bx = b.px(i, s * PI / 2, 0), by = b.py(i, s * PI / 2, 0);
      r.tube(bx, by, 0.35, z, bx + Math.cos(a) * 7, by + Math.sin(a) * 7, 0.2, z - 0.4, 0.8, PM2.lungSpot, id);
    }
    this.drawEyes(r, 1.1, 0.8, z + b.w[0] * 0.6, false);
  }
}

// The giant amphibians of the old swamps: an olm grown vast, with a broad flat head.
class Temnospondyl extends Olm {
  constructor(world, x, y) {
    super(world, x, y);
    this.species = 'temnospondyl';
    const k = 2.4;
    for (let i = 0; i < this.body.links.length; i++) this.body.links[i] *= k;
    for (let i = 0; i < this.body.w.length; i++) this.body.w[i] *= k * (i < 2 ? 1.5 : 1.15);
    for (const L of this.legs) { L.l1 *= 2.2; L.l2 *= 2.2; L.reach *= 2.2; L.stepDist *= 2; L.r1 *= 2; L.r2 *= 2; L.foot *= 2; }
    OUTLINE[this.id] = outlineOf(PM2.temno);
    const s = rand(0, 99);
    this.skin = bakeShader((u, v) => (vnoise(u * 14 + s, v * 4, 5) > 0.62 ? PM2.temnoSpot : PM2.temno), 48, 10);
    this.keepIn = deepKeep(DEEP.temnospondyl.deepMin);
    this.predWeight = 2;
  }
  draw(r) {
    const b = this.body, z = this.zBody, id = this.id;
    this.drawLegs(r, PM2.temnoSpot);
    this.drawSpine(r, 0, b.n - 1, z, 0.55, this.skin, id);
    r.ellipsoid(b.x[0] + Math.cos(b.a[0]) * 1.5, b.y[0] + Math.sin(b.a[0]) * 1.5, b.w[0] * 1.3, b.w[0] * 1.6, b.a[0], z, b.w[0] * 0.5, PM2.temno, id); // the flat head
    this.drawEyes(r, 0.9, 0.5, z + b.w[0] * 0.6, false);
  }
}

// Hyneria: a great lobe-finned hunter of the old rivers, dark and heavy-jawed.
class Hyneria extends Shark {
  constructor(world, x, y) {
    super(world, x, y, false);
    this.species = 'hyneria';
    for (let i = 0; i < this.body.links.length; i++) this.body.links[i] *= 1.35;
    for (let i = 0; i < this.body.w.length; i++) this.body.w[i] *= 1.35;
    this.skin = PM2.hyneria; this.fin = PM2.hyneriaFin;
    OUTLINE[this.id] = outlineOf(PM2.hyneria);
    this.keepIn = deepKeep(DEEP.hyneria.deepMin);
    this.predWeight = 3;
  }
}

// ---- registering them ------------------------------------------------------------------------------
Object.assign(DEEP, {
  trilobite: { branch: 'salt', tier: 9, unlock: 900, deepMin: 0.6 },
  anomalocaris: { branch: 'salt', tier: 9, unlock: 1300, deepMin: 0.65 },
  ammonite: { branch: 'salt', tier: 9, unlock: 1000, deepMin: 0.6 },
  eurypterid: { branch: 'fresh', tier: 9, unlock: 1100, deepMin: 0.6 },
  lungfish: { branch: 'fresh', tier: 9, unlock: 900, deepMin: 0.55 },
  dunkleosteus: { branch: 'salt', tier: 10, unlock: 2200, deepMin: 0.7 },
  coelacanth: { branch: 'both', tier: 10, unlock: 1600, deepMin: 0.7 },
  placoderm: { branch: 'fresh', tier: 10, unlock: 1500, deepMin: 0.65 },
  temnospondyl: { branch: 'fresh', tier: 10, unlock: 1900, deepMin: 0.65 },
  plesiosaur: { branch: 'salt', tier: 11, unlock: 4000, deepMin: 0.75 },
  mosasaur: { branch: 'salt', tier: 11, unlock: 5000, deepMin: 0.75 },
  hyneria: { branch: 'fresh', tier: 11, unlock: 3800, deepMin: 0.7 },
});
Object.assign(SPECIES_STATS, {
  trilobite: { size: 1, rarity: 3, settle: 0.6, years: 8, group: 4 }, anomalocaris: { size: 3, rarity: 4, settle: 0.4, years: 10 }, ammonite: { size: 2, rarity: 3, settle: 0.5, years: 12 },
  eurypterid: { size: 3, rarity: 3, settle: 0.45, years: 12 }, lungfish: { size: 2, rarity: 3, settle: 0.55, years: 80 },
  dunkleosteus: { size: 5, rarity: 5, settle: 0.3, years: 40 }, coelacanth: { size: 3, rarity: 4, settle: 0.4, years: 100 }, placoderm: { size: 3, rarity: 4, settle: 0.45, years: 30 },
  temnospondyl: { size: 4, rarity: 4, settle: 0.4, years: 60 }, plesiosaur: { size: 5, rarity: 5, settle: 0.3, years: 100 }, mosasaur: { size: 5, rarity: 5, settle: 0.28, years: 80 },
  hyneria: { size: 5, rarity: 5, settle: 0.3, years: 60 },
});
Object.assign(SPECIES_HABITAT, {
  trilobite: 'salt', anomalocaris: 'salt', ammonite: 'salt', eurypterid: 'fresh', lungfish: 'fresh', dunkleosteus: 'salt', coelacanth: 'both',
  placoderm: 'fresh', temnospondyl: 'fresh', plesiosaur: 'salt', mosasaur: 'salt', hyneria: 'fresh',
});
Object.assign(SINGULAR, {
  trilobite: 'Trilobite', anomalocaris: 'Anomalocaris', ammonite: 'Ammonite', eurypterid: 'Sea scorpion', lungfish: 'Lungfish', dunkleosteus: 'Dunkleosteus',
  coelacanth: 'Coelacanth', placoderm: 'Placoderm', temnospondyl: 'Giant amphibian', plesiosaur: 'Plesiosaur', mosasaur: 'Mosasaur', hyneria: 'Hyneria',
});
for (const k of ['anomalocaris', 'eurypterid', 'dunkleosteus', 'placoderm', 'temnospondyl', 'plesiosaur', 'mosasaur', 'hyneria']) DEEP_PREDATORS.add(k);
Object.assign(CREATE, {
  trilobite: (w, x, y) => new Trilobite(w, x, y), anomalocaris: (w, x, y) => new Anomalocaris(w, x, y), ammonite: (w, x, y) => new Ammonite(w, x, y),
  eurypterid: (w, x, y) => new Eurypterid(w, x, y), lungfish: (w, x, y) => new Lungfish(w, x, y), dunkleosteus: (w, x, y) => new Placoderm(w, x, y, 'dunkleosteus'),
  coelacanth: (w, x, y) => new Coelacanth(w, x, y), placoderm: (w, x, y) => new Placoderm(w, x, y, 'placoderm'), temnospondyl: (w, x, y) => new Temnospondyl(w, x, y),
  plesiosaur: (w, x, y) => new SeaReptile(w, x, y, 'plesiosaur'), mosasaur: (w, x, y) => new SeaReptile(w, x, y, 'mosasaur'), hyneria: (w, x, y) => new Hyneria(w, x, y),
});
Object.assign(SPECIES, {
  trilobite: {
    label: 'Trilobite', color: '#c8a87a',
    spawn: (w) => { const [x, y] = deepSpot(w, 'trilobite'); return Array.from({ length: randi(3, 5) }, () => makeCreature('trilobite', w, x + rand(-10, 10), y + rand(-10, 10))); },
  },
  anomalocaris: { label: 'Anomalocaris', color: '#e07a5a', spawn: one('anomalocaris') },
  ammonite: { label: 'Ammonite', color: '#f4d8a8', spawn: one('ammonite') },
  eurypterid: { label: 'Sea scorpion', color: '#a49a70', spawn: one('eurypterid') },
  lungfish: { label: 'Lungfish', color: '#8a8a5e', spawn: one('lungfish') },
  dunkleosteus: { label: 'Dunkleosteus', color: '#b4ac96', spawn: one('dunkleosteus') },
  coelacanth: { label: 'Coelacanth', color: '#4a6e9e', spawn: one('coelacanth') },
  placoderm: { label: 'Placoderm', color: '#8a7650', spawn: one('placoderm') },
  temnospondyl: { label: 'Giant amphibian', color: '#927244', spawn: one('temnospondyl') },
  plesiosaur: { label: 'Plesiosaur', color: '#708e8e', spawn: one('plesiosaur') },
  mosasaur: { label: 'Mosasaur', color: '#627a58', spawn: one('mosasaur') },
  hyneria: { label: 'Hyneria', color: '#52643a', spawn: one('hyneria') },
});
KIND_CODES.push('trilobite', 'anomalocaris', 'ammonite', 'eurypterid', 'lungfish', 'dunkleosteus', 'coelacanth', 'placoderm', 'temnospondyl', 'plesiosaur', 'mosasaur', 'hyneria');
// The deep past breeds in the brood chamber, like the rest of the deep's own kind.
if (STRUCTURES.broodchamber) STRUCTURES.broodchamber.habitatFor.push('trilobite', 'anomalocaris', 'ammonite', 'eurypterid', 'lungfish', 'dunkleosteus', 'coelacanth', 'placoderm', 'temnospondyl', 'plesiosaur', 'mosasaur', 'hyneria');
// In the dark of the deep past, a faint light about each of them (so they can be made out at all).
Object.assign(LIGHT_SPECIES, {
  trilobite: { r: 4, c: 1 }, ammonite: { r: 7, c: 4 }, anomalocaris: { r: 6, c: 2 }, eurypterid: { r: 5, c: 1 }, lungfish: { r: 5, c: 3 }, dunkleosteus: { r: 10, beam: 1.4, c: 2 },
  coelacanth: { r: 8, c: 0 }, placoderm: { r: 5, c: 1 }, temnospondyl: { r: 7, c: 4 }, plesiosaur: { r: 14, c: 1 }, mosasaur: { r: 14, beam: 1.6, c: 2 }, hyneria: { r: 10, beam: 1.4, c: 3 },
});
