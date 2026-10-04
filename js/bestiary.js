'use strict';
// A far larger bestiary: fifty-eight more species through every stage of the pond, from the reef
// and the pond down through the twilight and the abyss, the trench and the drowned city, the deep
// past and the alien reach. They're designed, not generated: each is a fixed design (a body
// profile, colours and pattern, and extras such as a lure, glowing spots, barbels, spines, a snout,
// fangs, horns, stilts or wings), drawn by one of three shapes:
//  - fish (the wild-fish renderer, with a fixed design and the extras),
//  - crawlers (a segmented body on legs, with claws, a shell, antennae, frills),
//  - drifters (a bell and tentacles, like the jellyfish).
// Every one is on the evolution tree at its stage, to unlock with essence (the shallow ones too),
// and the deep ones turn up by themselves once their stage is open. The shallow ones (the reef or
// the pond, and the pools) eat and breed like the first animals; the deep ones breed in the brood
// chamber, as the deep's own kind do.

// ---- the shapes ----------------------------------------------------------------------------------------
const glowOf = (hex) => { const m = solid(hex); return m; };

// A fish body from a design, built once per species (the same every time).
function designSp(d) {
  const L = d.look, nb = L.nb || 9, length = L.len, link = length / (nb - 1), W = Math.max(1, length * L.depth);
  const peak = L.peak ?? 0.3, head = L.head ?? 0.6, tailW = L.tailW ?? 0.2, ex = L.ex ?? 1.2;
  const widths = Array.from({ length: nb }, (_, i) => {
    const u = i / (nb - 1), k = u < peak ? lerp(head, 1, Math.sin(u / peak * PI / 2)) : lerp(1, tailW, Math.pow((u - peak) / (1 - peak), ex));
    return Math.max(0.6, W * k);
  });
  const tail = L.tail || 'fork', tailJoints = tail === 'long' ? 4 : tail === 'fan' || tail === 'round' ? 2 : 0;
  const links = new Array(nb - 1 + tailJoints).fill(link);
  for (let i = 0; i < tailJoints; i++) widths.push(0);
  const [h, s, l] = L.base, a = L.acc || [h, s, Math.max(0.28, l - 0.2)], f = L.fin || [h, s * 0.7, Math.min(0.78, l + 0.18)];
  const sp = {
    id: `d:${d.kind}`, name: d.label, habitat: d.hab, nb, links, widths, W, tail, tailLen: (L.tailLen ?? 1) * W, tailJoints,
    fins: L.fins ?? 0.8, dorsal: L.dorsal || null, hs: L.hs ?? 1, base: ramp(h, s, l), accent: ramp(...a), fin: ramp(...f),
    pattern: L.pat || 'solid', freq: L.freq ?? 5, size: L.psize ?? 0.2,
    schooling: !!d.school, predator: !!d.predator, small: !!d.small, zMin: d.z[0], zMax: d.z[1], cruise: d.cruise ?? 8, length,
    extras: new Set(L.extras || []), glow: L.glow ? glowOf(L.glow) : null, alpha: L.alpha ?? 1,
  };
  const c = sp.base[2];
  sp.color = '#' + [c & 255, (c >> 8) & 255, (c >> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('');
  return sp;
}

class DesignedFish extends WildFish {
  constructor(world, x, y, kind, school = null) {
    const d = DESIGNS[kind];
    super(world, x, y, d.sp, school);
    this.species = kind;
    if (d.deep) this.keepIn = deepKeep(d.deep);
    if (d.predator) this.predWeight = 1.3 + 0.1 * (d.stats[0] || 1);
    if (d.sp.glow) { this.glowId = newId(hexToInt('#04080c')); EMISSIVE[this.glowId] = 2; }
  }

  draw(r, t) {
    const sp = this.sp, a0 = r.alpha;
    if (sp.alpha < 1) r.alpha = Math.min(a0, sp.alpha);
    super.draw(r, t);
    if (!r.lod) this.drawExtras(r, t || 0);
    r.alpha = a0;
  }

  drawExtras(r, t) {
    const sp = this.sp, X = sp.extras, b = this.body, w = b.w, z = this.z, id = this.id, nb = sp.nb, h = b.a[0], k = w[0] / sp.widths[0];
    const top = (i) => z + w[i] * sp.hs + 0.2, fin = this.fin;
    if (X.has('longsnout')) r.tube(b.x[0], b.y[0], w[0] * 0.45, z, b.x[0] + Math.cos(h) * sp.length * 0.3 * k, b.y[0] + Math.sin(h) * sp.length * 0.3 * k, 0.4, z, 0.6, sp.base, id);
    if (X.has('barbels')) for (const s of [-1, 1]) { const a = h + PI - s * 0.5 + Math.sin(t * 2 + s) * 0.2; r.tube(b.x[0], b.y[0], 0.3, z - 0.3, b.x[0] + Math.cos(a) * 4 * k, b.y[0] + Math.sin(a) * 4 * k, 0.2, z - 0.8, 0.8, fin, id); }
    if (X.has('fangs')) for (const s of [-1, 1]) r.tube(b.px(0, s * 0.4, -0.2), b.py(0, s * 0.4, -0.2), 0.35, z, b.x[0] + Math.cos(h + s * 0.15) * 2.4 * k, b.y[0] + Math.sin(h + s * 0.15) * 2.4 * k, 0.15, z - 0.6, 0.8, WHITE_FANG, id);
    if (X.has('horns')) for (const s of [-1, 1]) r.tube(b.px(0, s * 1.2, 0.3), b.py(0, s * 1.2, 0.3), 0.6, top(0), b.x[0] + Math.cos(h + s * 0.7) * 4 * k, b.y[0] + Math.sin(h + s * 0.7) * 4 * k, 0.2, top(0) + 2.5, 0.8, sp.accent, id);
    if (X.has('crest')) r.tube(b.x[0], b.y[0], 0.7, top(0), b.x[1], b.y[1], 0.3, top(1) + 3, 0.6, fin, id);
    if (X.has('spines')) for (let i = 1; i < nb - 2; i++) r.tube(b.x[i], b.y[i], 0.35, top(i), b.x[i] + Math.cos(b.a[i] + PI) * 1.5, b.y[i] + Math.sin(b.a[i] + PI) * 1.5, 0.15, top(i) + 3.5 * k, 0.8, fin, id);
    if (X.has('stilts')) for (const [i, s] of [[1, 1], [1, -1], [nb - 2, 0]]) r.tube(b.px(i, s * PI / 2, 0), b.py(i, s * PI / 2, 0), 0.25, z - 0.5, b.px(i, s * PI / 2, 0) + (s ? Math.cos(b.a[i] + s * PI / 2) * 2 : 0), b.py(i, s * PI / 2, 0) + (s ? Math.sin(b.a[i] + s * PI / 2) * 2 : 0), 0.2, 0, 0.8, fin, id);
    if (X.has('wings')) for (const s of [-1, 1]) { const i = Math.round(nb * 0.35), a = b.a[i] + s * PI / 2 + Math.sin(t * 1.4) * 0.25 * s; r.ellipsoid(b.px(i, s * PI / 2, 0) + Math.cos(a) * sp.W * 0.9 * k, b.py(i, s * PI / 2, 0) + Math.sin(a) * sp.W * 0.9 * k, sp.W * 1.1 * k, sp.W * 0.45 * k, a, z, 0.3, sp.base, id); }
    if (X.has('plates')) r.ellipsoid(b.x[1], b.y[1], w[1] * 1.15, w[1] * 1.05, b.a[1], top(1) - w[1] * 0.4, w[1] * 0.6, sp.accent, id);
    if (X.has('whorl')) { const cx = b.x[0] + Math.cos(h) * 1.5 * k, cy = b.y[0] + Math.sin(h) * 1.5 * k; for (let i = 0; i < 8; i++) { const u = i / 8 * TAU * 1.5 + h, R = (1.8 - i * 0.18) * k; r.dot(cx + Math.cos(u) * R, cy + Math.sin(u) * R, z - 0.4, WHITE_FANG, id); } }
    if (X.has('dome')) r.ellipsoid(b.x[0], b.y[0], w[0] * 1.1, w[0] * 1.1, h, top(0), w[0] * 0.9, DOME_MAT, id);
    const gid = this.glowId || id, gm = sp.glow || sp.accent;
    if (X.has('lure')) {
      const sway = Math.sin(t * 1.7 + this.phase) * 0.5, lx = b.x[0] + Math.cos(h + sway) * 7 * k, ly = b.y[0] + Math.sin(h + sway) * 7 * k;
      r.tube(b.x[0], b.y[0], 0.25, z, lx, ly, 0.2, z + 1, 0.8, fin, id);
      r.ellipsoid(lx, ly, 1, 1, 0, z + 1, 1, gm, gid);
    }
    if (X.has('glowspots')) for (let i = 1; i < nb - 1; i += 2) for (const s of [-1, 1]) r.dot(b.px(i, s * PI / 2.4, 0.3), b.py(i, s * PI / 2.4, 0.3), z + w[i] * 0.4, gm, gid);
    if (X.has('eyes')) for (let i = 1; i < nb - 1; i++) for (const s of [-1, 1]) if (Math.sin(t * 0.8 + i * 1.3 + s) > -0.3) r.dot(b.px(i, s * PI / 3, 0), b.py(i, s * PI / 3, 0), top(i), gm, gid);
  }
}
const WHITE_FANG = mat('#8a8a80', '#bcbcb0', '#e4e4d8', '#ffffff'), DOME_MAT = mat('#3a6a5a', '#5a9a8a', '#8ad0c0', '#d0fff0');

// A crawler: a segmented body on legs, from a design.
class DesignedCrawler extends Walker {
  constructor(world, x, y, kind) {
    const d = DESIGNS[kind], L = d.look, n = L.segs || 6, pairs = L.legs ?? 3, leg = L.leg ?? 1.1;
    const legs = [];
    for (let k = 0; k < pairs; k++) for (const side of [1, -1]) {
      legs.push({ bi: Math.min(n - 1, 1 + Math.floor(k * Math.max(1, n - 2) / pairs)), off: PI / 2.2, side, group: (k + (side > 0 ? 0 : 1)) % 2,
        reach: L.reach ?? leg * 1.2, l1: leg, l2: leg * 0.9, inset: 0.3, stepDist: 1.2 + leg * 0.5, r1: 0.35, r2: 0.28, foot: 0.3 });
    }
    const widths = Array.from({ length: n + 1 }, (_, i) => { const u = i / n; return Math.max(0.5, L.w * (u < 0.3 ? lerp(L.head ?? 0.75, 1, u / 0.3) : lerp(1, L.tailW ?? 0.45, (u - 0.3) / 0.7))); });
    const cruise = d.cruise ?? 2.2;
    super(world, x, y, {
      species: kind, links: new Array(n).fill(L.link ?? 1.7), widths, constraint: PI / (L.stiff ?? 9), cruise, maxSpeed: cruise * 2.6, turnRate: 1.2,
      wiggleAmp: L.wiggle ?? (pairs ? 0.05 : 0.2), gaitK: pairs ? 1.4 : 0, stepDur: pairs ? 0.18 : 1, lift: pairs ? 0.55 : 0, zBody: pairs ? 1 : 0.7, sight: 50,
      outline: outlineOf(ramp(...L.base)), legs,
    });
    this.col = ramp(...L.base);
    this.colA = ramp(...(L.acc || [L.base[0], L.base[1], Math.max(0.25, L.base[2] - 0.18)]));
    const pat = L.pat || 'bands', freq = L.freq ?? 6;
    this.skin = bakeShader((u, v) => (pat === 'bands' ? ((u * freq) % 1 < 0.22 ? this.colA : this.col) : pat === 'spots' ? (vnoise(u * freq * 2, v * 3, 17) > 0.64 ? this.colA : this.col) : pat === 'belly' ? (Math.abs(v) > 0.6 ? this.colA : this.col) : this.col), 40, 8);
    if (d.deep) this.keepIn = deepKeep(d.deep);
    if (d.predator) this.predWeight = 1.3;
    if (L.glow) { this.glowId = newId(hexToInt('#04080c')); EMISSIVE[this.glowId] = 2; this.glowMat = glowOf(L.glow); }
  }

  draw(r, t) {
    const d = DESIGNS[this.species], L = d.look, b = this.body, z = this.zBody, id = this.id, h = b.a[0], n = b.n, T = t || 0;
    this.drawLegs(r, this.colA);
    this.drawSpine(r, 0, n - 1, z, 0.6, this.skin, id);
    if (L.shell) { const i = Math.min(n - 1, Math.round(n * 0.55)); r.ellipsoid(b.x[i], b.y[i], b.w[i] * 1.7, b.w[i] * 1.5, b.a[i], z + b.w[i] * 0.3, b.w[i] * 1.4, ramp(...L.shell), id); }
    if (L.claws) for (const s of [-1, 1]) {
      const a = h + s * 0.55, ex = b.x[0] + Math.cos(a) * 3.2, ey = b.y[0] + Math.sin(a) * 3.2;
      r.tube(b.px(0, s * 0.8, 0), b.py(0, s * 0.8, 0), 0.5, z, ex, ey, 0.6, z + 0.4, 0.8, this.colA, id);
      r.ellipsoid(ex + Math.cos(a) * 0.8, ey + Math.sin(a) * 0.8, 1.2, 0.75, a, z + 0.4, 0.8, this.col, id);
    }
    if (L.antennae) for (const s of [-1, 1]) { const a = h + s * (0.35 + 0.1 * Math.sin(T * 3 + s)); r.tube(b.x[0], b.y[0], 0.2, z + 0.6, b.x[0] + Math.cos(a) * L.antennae, b.y[0] + Math.sin(a) * L.antennae, 0.12, z + 0.9, 0.8, this.colA, id); }
    if (L.proboscis) { const a = h + Math.sin(T * 1.5) * 0.3; r.tube(b.x[0], b.y[0], 0.4, z + 0.3, b.x[0] + Math.cos(a) * 5, b.y[0] + Math.sin(a) * 5, 0.3, z + 0.3, 0.8, this.colA, id); }
    if (L.gills) for (let i = 1; i < n - 1; i++) for (const s of [-1, 1]) { const a = b.a[i] + s * (PI / 2 + 0.3), bx = b.px(i, s * PI / 2, -0.2), by = b.py(i, s * PI / 2, -0.2); r.tube(bx, by, 0.35, z + 0.6, bx + Math.cos(a) * 1.4, by + Math.sin(a) * 1.4, 0.3, z + 1.4 + 0.3 * Math.sin(T * 2 + i), 0.8, this.colA, id); }
    if (L.crest) for (let i = 1; i < n - 2; i++) r.tube(b.x[i], b.y[i], 0.3, z + b.w[i] * 0.6, b.x[i + 1], b.y[i + 1], 0.15, z + b.w[i] * 0.6 + 1.2, 0.8, this.colA, id);
    if (L.horns) for (const s of [-1, 1]) r.tube(b.px(0, s * 1.1, 0.2), b.py(0, s * 1.1, 0.2), 0.5, z + b.w[0] * 0.7, b.x[0] + Math.cos(h + s * 0.8) * 3.2, b.y[0] + Math.sin(h + s * 0.8) * 3.2, 0.15, z + b.w[0] + 2, 0.8, this.colA, id);
    if (L.tailFan) { const a = b.a[n - 1] + PI; for (const s of [-1, 0, 1]) r.ellipsoid(b.x[n - 1] + Math.cos(a + s * 0.5) * 1.4, b.y[n - 1] + Math.sin(a + s * 0.5) * 1.4, 1.2, 0.7, a + s * 0.5, z, 0.4, this.colA, id); }
    if (L.eyes5) for (let i = 0; i < 5; i++) { const a = h + (i - 2) * 0.35; r.tube(b.x[0], b.y[0], 0.2, z + 0.8, b.x[0] + Math.cos(a) * 1.6, b.y[0] + Math.sin(a) * 1.6, 0.2, z + 2, 0.8, this.col, id); r.dot(b.x[0] + Math.cos(a) * 1.7, b.y[0] + Math.sin(a) * 1.7, z + 2.2, EYE, id); }
    else if (L.glow) for (const s of [-1, 1]) r.dot(b.px(0, s * 0.7, -0.3), b.py(0, s * 0.7, -0.3), z + b.w[0] * 0.8 + 0.3, this.glowMat, this.glowId);
    else this.drawEyes(r, 0.8, 0.4, z + b.w[0] * 0.8, false);
  }
}

// A drifter: a bell and tentacles, from a design (the jellyfish's shape, its own colours and size).
class DesignedDrifter extends Jelly {
  constructor(world, x, y, kind) {
    super(world, x, y);
    const d = DESIGNS[kind], L = d.look;
    this.species = kind;
    const bell = ramp(...L.bell), tent = ramp(...L.tent), gonad = ramp(...(L.gonad || L.tent));
    this.v = { bell, tent, gonad };
    this.R = L.R * rand(0.85, 1.15);
    OUTLINE[this.id] = outlineOf(bell);
    EMISSIVE[this.id] = L.glow ? 2 : 1;
    this.bellShader = (lx, ly) => {
      const dd = Math.sqrt(lx * lx + ly * ly), a = Math.atan2(ly, lx) - this.spin;
      if (dd > 0.86) return tent;
      if (dd > 0.22 && dd < 0.5 && Math.cos((L.lobes || 4) * a) > 0.35) return gonad;
      return bell;
    };
    const k = L.tentLen ?? this.R / 4.5;
    for (const ch of this.tents) for (let i = 0; i < ch.links.length; i++) ch.links[i] = 1.4 * k;
    this.z = this.tz = rand(d.z[0], d.z[1]);
    if (d.deep) this.keepIn = deepKeep(d.deep);
    this.place(x, y);
  }
}

// ---- the catalogue ----------------------------------------------------------------------------------------
// kind, label, habitat, stage (tier), essence to unlock, deepMin, stats [size, rarity, settle, years],
// z band, cruise, group size, flags, and the look. (Append only: links carry each kind's place in KIND_CODES.)
const F = (o) => ({ shape: 'fish', ...o }), C = (o) => ({ shape: 'crawl', ...o }), D = (o) => ({ shape: 'drift', ...o });
const DESIGN_LIST = [
  // The reef and the pond, and their pools.
  F({ kind: 'mandarin', label: 'Mandarinfish', hab: 'salt', tier: 0, unlock: 40, stats: [1, 3, 0.6, 6], z: [2, 8], cruise: 5, small: true, likes: ['coral', 'rock'],
    look: { len: 10, depth: 0.2, nb: 8, tail: 'round', fins: 1.1, base: [205, 0.8, 0.45], acc: [25, 0.9, 0.55], fin: [25, 0.8, 0.6], pat: 'netted', freq: 4 } }),
  F({ kind: 'tang', label: 'Blue tang', hab: 'salt', tier: 0, unlock: 50, stats: [2, 2, 0.7, 12], z: [8, 24], cruise: 9, group: [1, 3], likes: ['coral', 'anemone'],
    look: { len: 16, depth: 0.26, peak: 0.4, dorsal: 'ridge', base: [220, 0.85, 0.5], acc: [215, 0.9, 0.28], fin: [50, 0.9, 0.55], pat: 'twotone' } }),
  F({ kind: 'lionfish', label: 'Lionfish', hab: 'salt', tier: 0, unlock: 90, stats: [2, 3, 0.6, 15], z: [4, 16], cruise: 5, predator: true, likes: ['coral', 'rock'],
    look: { len: 17, depth: 0.2, tail: 'fan', fins: 1.5, base: [10, 0.6, 0.62], acc: [5, 0.8, 0.35], fin: [15, 0.5, 0.7], pat: 'bars', freq: 7, extras: ['spines'] } }),
  F({ kind: 'seahorse', label: 'Seahorse', hab: 'salt', tier: 0, unlock: 70, stats: [1, 3, 0.55, 5], z: [6, 20], cruise: 2.5, small: true, likes: ['eelgrass', 'coral'],
    look: { len: 12, depth: 0.13, peak: 0.25, head: 0.9, tail: 'long', tailLen: 0.6, fins: 0.4, base: [45, 0.8, 0.55], acc: [35, 0.7, 0.4], pat: 'dotline', extras: ['longsnout', 'crest'] } }),
  F({ kind: 'moray', label: 'Moray eel', hab: 'salt', tier: 1, unlock: 110, stats: [3, 3, 0.5, 25], z: [1, 6], cruise: 4, predator: true, likes: ['rock', 'coral'], rhythm: 'night',
    look: { len: 38, depth: 0.06, nb: 14, peak: 0.2, head: 0.8, tailW: 0.35, tail: 'round', fins: 0.2, dorsal: 'ridge', base: [80, 0.45, 0.42], acc: [60, 0.6, 0.25], pat: 'spots', freq: 5, psize: 0.3 } }),
  C({ kind: 'hermit', label: 'Hermit crab', hab: 'salt', tier: 1, unlock: 45, stats: [1, 2, 0.7, 10], cruise: 1.8, likes: ['rock', 'coral'], rhythm: 'night',
    look: { segs: 4, w: 2.2, legs: 3, leg: 1.2, claws: true, antennae: 4, shell: [30, 0.45, 0.5], base: [10, 0.7, 0.5], acc: [30, 0.5, 0.35] } }),
  F({ kind: 'cleaner', label: 'Cleaner wrasse', hab: 'salt', tier: 1, unlock: 55, stats: [1, 2, 0.7, 5], z: [6, 18], cruise: 11, small: true, school: true, group: [3, 5], likes: ['coral', 'anemone'],
    look: { len: 9, depth: 0.1, base: [210, 0.8, 0.62], acc: [230, 0.5, 0.15], pat: 'stripe', psize: 0.15 } }),
  C({ kind: 'nudibranch', label: 'Nudibranch', hab: 'salt', tier: 1, unlock: 80, stats: [1, 4, 0.5, 4], cruise: 1.2, likes: ['coral', 'anemone'],
    look: { segs: 5, w: 1.8, legs: 0, gills: true, base: [285, 0.8, 0.55], acc: [45, 0.95, 0.6], pat: 'belly' } }),
  F({ kind: 'goldfish', label: 'Goldfish', hab: 'fresh', tier: 0, unlock: 20, stats: [1, 1, 0.9, 20], z: [4, 16], cruise: 6, group: [1, 3], likes: ['weed', 'lily'],
    look: { len: 13, depth: 0.24, peak: 0.35, tail: 'fan', tailLen: 1.4, fins: 1, base: [30, 0.9, 0.55], acc: [18, 0.9, 0.5], pat: 'gradient' } }),
  F({ kind: 'guppy', label: 'Guppy', hab: 'fresh', tier: 0, unlock: 25, stats: [1, 1, 0.85, 3], z: [8, 24], cruise: 10, small: true, school: true, group: [4, 7], likes: ['weed', 'duckweed'],
    look: { len: 7, depth: 0.15, tail: 'lyre', tailLen: 1.8, base: [190, 0.3, 0.6], acc: [330, 0.85, 0.55], fin: [280, 0.8, 0.6], pat: 'gradient' } }),
  F({ kind: 'betta', label: 'Betta', hab: 'fresh', tier: 0, unlock: 60, stats: [1, 3, 0.6, 4], z: [10, 26], cruise: 4, likes: ['lily', 'duckweed'],
    look: { len: 11, depth: 0.18, tail: 'long', tailLen: 2, fins: 1.5, dorsal: 'sail', base: [350, 0.85, 0.45], acc: [230, 0.8, 0.45], fin: [300, 0.8, 0.5], pat: 'gradient' } }),
  F({ kind: 'loach', label: 'Clown loach', hab: 'fresh', tier: 0, unlock: 35, stats: [1, 2, 0.75, 15], z: [1, 6], cruise: 7, group: [2, 4], likes: ['rock', 'weed'], rhythm: 'night',
    look: { len: 14, depth: 0.12, base: [35, 0.9, 0.55], acc: [20, 0.4, 0.12], pat: 'bars', freq: 3, extras: ['barbels'] } }),
  C({ kind: 'crayfish', label: 'Crayfish', hab: 'fresh', tier: 1, unlock: 50, stats: [1, 2, 0.7, 8], cruise: 2, likes: ['rock', 'weed'], rhythm: 'night',
    look: { segs: 6, w: 2.2, legs: 4, claws: true, antennae: 6, tailFan: true, base: [8, 0.7, 0.42], acc: [15, 0.6, 0.3] } }),
  C({ kind: 'newt', label: 'Crested newt', hab: 'fresh', tier: 1, unlock: 60, stats: [1, 2, 0.7, 12], cruise: 2.4, likes: ['weed', 'marimo'],
    look: { segs: 9, w: 1.4, legs: 2, leg: 1.2, tailW: 0.25, wiggle: 0.25, crest: true, base: [80, 0.2, 0.3], acc: [30, 0.9, 0.5], pat: 'spots' } }),
  F({ kind: 'pleco', label: 'Pleco', hab: 'fresh', tier: 1, unlock: 70, stats: [2, 2, 0.75, 20], z: [1, 4], cruise: 3, likes: ['rock'], rhythm: 'night',
    look: { len: 20, depth: 0.16, head: 1, peak: 0.2, fins: 1.2, dorsal: 'sail', base: [30, 0.35, 0.35], acc: [40, 0.3, 0.55], pat: 'spots', freq: 7, psize: 0.35, extras: ['barbels'] } }),
  F({ kind: 'pike', label: 'Pike', hab: 'fresh', tier: 1, unlock: 120, stats: [3, 3, 0.55, 20], z: [4, 16], cruise: 7, predator: true, likes: ['eelgrass', 'weed'],
    look: { len: 30, depth: 0.09, head: 0.7, peak: 0.4, base: [95, 0.45, 0.42], acc: [70, 0.5, 0.62], pat: 'spots', freq: 4 } }),
  // The twilight zone and the deep lake.
  F({ kind: 'lanternfish', label: 'Lanternfish', hab: 'salt', tier: 2, unlock: 160, deep: 0.35, stats: [1, 2, 0.7, 3], z: [10, 30], cruise: 9, small: true, school: true, group: [5, 8], light: { r: 6, col: '#6ac8ff' },
    look: { len: 8, depth: 0.14, base: [220, 0.25, 0.35], acc: [210, 0.3, 0.25], extras: ['glowspots'], glow: '#6ac8ff' } }),
  F({ kind: 'hatchetfish', label: 'Hatchetfish', hab: 'salt', tier: 2, unlock: 180, deep: 0.4, stats: [1, 3, 0.6, 4], z: [14, 32], cruise: 7, small: true, school: true, group: [4, 7], light: { r: 5, col: '#9ae0ff' },
    look: { len: 8, depth: 0.32, peak: 0.3, head: 1, base: [220, 0.1, 0.72], acc: [220, 0.2, 0.5], pat: 'twotone', extras: ['glowspots'], glow: '#9ae0ff' } }),
  D({ kind: 'combjelly', label: 'Comb jelly', hab: 'salt', tier: 2, unlock: 200, deep: 0.35, stats: [1, 3, 0.6, 2], z: [16, 34], light: { r: 7, col: '#c0a0ff' },
    look: { R: 3.5, bell: [180, 0.3, 0.75], tent: [300, 0.9, 0.7], gonad: [60, 0.9, 0.7], lobes: 8, glow: true } }),
  F({ kind: 'sturgeon', label: 'Sturgeon', hab: 'fresh', tier: 2, unlock: 260, deep: 0.35, stats: [4, 3, 0.5, 100], z: [1, 8], cruise: 5,
    look: { len: 36, depth: 0.09, head: 0.6, tail: 'lyre', dorsal: 'ridge', base: [210, 0.12, 0.45], acc: [210, 0.1, 0.7], pat: 'dotline', freq: 6, extras: ['barbels', 'longsnout'] } }),
  F({ kind: 'burbot', label: 'Burbot', hab: 'fresh', tier: 2, unlock: 170, deep: 0.35, stats: [2, 2, 0.6, 15], z: [1, 8], cruise: 5, predator: true, rhythm: 'night',
    look: { len: 22, depth: 0.1, tail: 'round', dorsal: 'ridge', base: [60, 0.35, 0.35], acc: [40, 0.4, 0.22], pat: 'netted', extras: ['barbels'] } }),
  F({ kind: 'paddlefish', label: 'Paddlefish', hab: 'fresh', tier: 2, unlock: 230, deep: 0.35, stats: [3, 3, 0.55, 50], z: [8, 24], cruise: 7,
    look: { len: 30, depth: 0.1, head: 0.7, base: [210, 0.15, 0.5], acc: [210, 0.15, 0.35], pat: 'gradient', extras: ['longsnout'] } }),
  // The midnight zone and the sunless cave.
  F({ kind: 'viperfish', label: 'Viperfish', hab: 'salt', tier: 3, unlock: 300, deep: 0.5, stats: [2, 3, 0.5, 10], z: [8, 28], cruise: 6, predator: true, light: { r: 8, col: '#40a0ff' },
    look: { len: 20, depth: 0.09, head: 0.9, base: [230, 0.35, 0.22], acc: [200, 0.6, 0.35], extras: ['fangs', 'glowspots'], glow: '#40a0ff' } }),
  F({ kind: 'dragonfish', label: 'Black dragonfish', hab: 'salt', tier: 3, unlock: 340, deep: 0.5, stats: [2, 4, 0.45, 10], z: [6, 26], cruise: 5, predator: true, light: { r: 10, beam: 1.6, col: '#ff5a6a' },
    look: { len: 24, depth: 0.07, nb: 12, base: [270, 0.3, 0.14], acc: [280, 0.4, 0.25], extras: ['lure', 'fangs'], glow: '#ff5a6a' } }),
  F({ kind: 'oarfish', label: 'Oarfish', hab: 'salt', tier: 3, unlock: 420, deep: 0.5, stats: [5, 4, 0.4, 30], z: [10, 30], cruise: 3,
    look: { len: 60, depth: 0.05, nb: 16, tail: 'round', dorsal: 'sail', fins: 0.3, base: [220, 0.1, 0.72], acc: [0, 0.9, 0.5], fin: [0, 0.9, 0.5], pat: 'spots', freq: 9, psize: 0.15, extras: ['crest'] } }),
  C({ kind: 'cavecrab', label: 'Cave crab', hab: 'fresh', tier: 3, unlock: 260, deep: 0.45, stats: [1, 2, 0.7, 15], cruise: 2, rhythm: 'always',
    look: { segs: 4, w: 2.6, legs: 4, claws: true, antennae: 7, base: [30, 0.1, 0.8], acc: [20, 0.15, 0.6] } }),
  F({ kind: 'glassfish', label: 'Glassfish', hab: 'fresh', tier: 3, unlock: 280, deep: 0.45, stats: [1, 2, 0.65, 4], z: [6, 22], cruise: 8, small: true, school: true, group: [4, 7], light: { r: 5, col: '#c8f0ff' },
    look: { len: 9, depth: 0.18, alpha: 0.55, base: [190, 0.15, 0.8], acc: [190, 0.2, 0.6], extras: ['glowspots'], glow: '#c8f0ff' } }),
  C({ kind: 'cavesalamander', label: 'Cave salamander', hab: 'fresh', tier: 3, unlock: 320, deep: 0.45, stats: [1, 3, 0.6, 40], cruise: 2,
    look: { segs: 10, w: 1.3, legs: 2, tailW: 0.2, wiggle: 0.3, gills: true, base: [350, 0.35, 0.78], acc: [350, 0.5, 0.6], pat: 'none' } }),
  // The abyss and the drowned cathedral.
  F({ kind: 'barreleye', label: 'Barreleye', hab: 'salt', tier: 4, unlock: 450, deep: 0.6, stats: [2, 4, 0.45, 10], z: [10, 30], cruise: 3, light: { r: 7, col: '#6aff8a' },
    look: { len: 14, depth: 0.16, head: 0.9, tail: 'fan', base: [215, 0.3, 0.3], acc: [100, 0.9, 0.55], extras: ['dome'], glow: '#6aff8a' } }),
  F({ kind: 'tripodfish', label: 'Tripodfish', hab: 'salt', tier: 4, unlock: 480, deep: 0.6, stats: [2, 3, 0.5, 12], z: [5, 7], cruise: 1.5,
    look: { len: 18, depth: 0.09, fins: 1, base: [200, 0.1, 0.5], acc: [200, 0.1, 0.35], extras: ['stilts'] } }),
  C({ kind: 'seaspider', label: 'Sea spider', hab: 'salt', tier: 4, unlock: 420, deep: 0.6, stats: [1, 3, 0.55, 10], cruise: 1.6, rhythm: 'always',
    look: { segs: 3, w: 1, legs: 4, leg: 3.5, reach: 3, base: [0, 0.6, 0.5], acc: [10, 0.6, 0.35] } }),
  F({ kind: 'wraithcarp', label: 'Wraith carp', hab: 'fresh', tier: 4, unlock: 460, deep: 0.6, stats: [3, 4, 0.45, 60], z: [8, 28], cruise: 4, light: { r: 9, col: '#d0f0ff' },
    look: { len: 24, depth: 0.22, tail: 'fan', tailLen: 1.5, fins: 1.2, alpha: 0.6, base: [190, 0.1, 0.85], acc: [200, 0.2, 0.7], pat: 'gradient', glow: '#d0f0ff' } }),
  D({ kind: 'belljelly', label: 'Bell jelly', hab: 'fresh', tier: 4, unlock: 400, deep: 0.6, stats: [2, 3, 0.5, 3], z: [16, 34], light: { r: 8, col: '#ffe08a' },
    look: { R: 5, bell: [45, 0.3, 0.75], tent: [40, 0.4, 0.6], gonad: [50, 0.6, 0.7], lobes: 6, glow: true } }),
  F({ kind: 'choirfish', label: 'Choirfish', hab: 'fresh', tier: 4, unlock: 520, deep: 0.6, stats: [2, 4, 0.45, 40], z: [6, 24], cruise: 4,
    look: { len: 20, depth: 0.2, tail: 'round', dorsal: 'sail', base: [270, 0.25, 0.35], acc: [45, 0.6, 0.6], extras: ['spines'] } }),
  // The hadal trench and the flooded crypts.
  C({ kind: 'amphipod', label: 'Giant amphipod', hab: 'salt', tier: 5, unlock: 600, deep: 0.65, stats: [1, 3, 0.55, 6], cruise: 2.4,
    look: { segs: 7, w: 1.6, legs: 5, antennae: 6, base: [20, 0.2, 0.85], acc: [15, 0.3, 0.7] } }),
  F({ kind: 'cuskeel', label: 'Cusk-eel', hab: 'salt', tier: 5, unlock: 650, deep: 0.65, stats: [2, 3, 0.5, 15], z: [1, 8], cruise: 3,
    look: { len: 30, depth: 0.07, nb: 12, tail: 'round', fins: 0.3, base: [30, 0.1, 0.8], acc: [20, 0.15, 0.65], pat: 'gradient' } }),
  C({ kind: 'cryptcrab', label: 'Crypt crab', hab: 'fresh', tier: 5, unlock: 600, deep: 0.65, stats: [2, 3, 0.55, 30], cruise: 1.6,
    look: { segs: 4, w: 2.8, legs: 4, claws: true, base: [40, 0.1, 0.82], acc: [0, 0, 0.25], pat: 'spots' } }),
  F({ kind: 'shroudfish', label: 'Shroudfish', hab: 'fresh', tier: 5, unlock: 650, deep: 0.65, stats: [2, 3, 0.5, 20], z: [8, 26], cruise: 3,
    look: { len: 22, depth: 0.12, tail: 'long', tailLen: 1.6, fins: 1.4, base: [260, 0.15, 0.2], acc: [260, 0.2, 0.75], pat: 'bars', freq: 6 } }),
  // The black below and the roots of the world.
  D({ kind: 'firesquid', label: 'Firefly squid', hab: 'salt', tier: 6, unlock: 800, deep: 0.7, stats: [1, 3, 0.55, 1], z: [10, 34], group: [3, 5], light: { r: 9, col: '#3ab0ff' },
    look: { R: 2.6, bell: [220, 0.5, 0.35], tent: [210, 0.9, 0.6], gonad: [200, 1, 0.7], glow: true } }),
  F({ kind: 'swallower', label: 'Black swallower', hab: 'salt', tier: 6, unlock: 900, deep: 0.7, stats: [2, 4, 0.45, 8], z: [6, 26], cruise: 5, predator: true,
    look: { len: 18, depth: 0.2, peak: 0.6, base: [270, 0.2, 0.12], acc: [260, 0.3, 0.3], extras: ['fangs'] } }),
  C({ kind: 'rootcrawler', label: 'Root crawler', hab: 'fresh', tier: 6, unlock: 850, deep: 0.7, stats: [2, 3, 0.5, 40], cruise: 1.8,
    look: { segs: 10, w: 1.2, legs: 8, leg: 1, base: [25, 0.35, 0.25], acc: [30, 0.4, 0.4] } }),
  F({ kind: 'lampeel', label: 'Lamp eel', hab: 'fresh', tier: 6, unlock: 900, deep: 0.7, stats: [2, 3, 0.5, 30], z: [2, 20], cruise: 5, light: { r: 8, col: '#ffe04a' },
    look: { len: 34, depth: 0.06, nb: 14, tail: 'round', base: [240, 0.3, 0.2], acc: [60, 0.9, 0.6], extras: ['glowspots'], glow: '#ffe04a' } }),
  // The drowned city and the sunken city.
  F({ kind: 'gargoyle', label: 'Gargoyle fish', hab: 'salt', tier: 7, unlock: 1100, deep: 0.75, stats: [3, 4, 0.45, 200], z: [2, 14], cruise: 3, predator: true,
    look: { len: 22, depth: 0.22, head: 1, tail: 'round', fins: 1.2, base: [120, 0.1, 0.42], acc: [120, 0.1, 0.28], pat: 'spots', extras: ['horns', 'spines'] } }),
  D({ kind: 'lanternjelly', label: 'Lantern jelly', hab: 'salt', tier: 7, unlock: 1000, deep: 0.75, stats: [2, 4, 0.45, 5], z: [14, 34], light: { r: 12, col: '#3aff9a' },
    look: { R: 6, bell: [150, 0.8, 0.35], tent: [140, 0.9, 0.5], gonad: [120, 1, 0.6], glow: true } }),
  C({ kind: 'bellwarden', label: 'Bell warden', hab: 'fresh', tier: 7, unlock: 1200, deep: 0.75, stats: [3, 4, 0.45, 300], cruise: 1.4,
    look: { segs: 5, w: 3, legs: 3, leg: 1.6, shell: [100, 0.15, 0.35], horns: true, base: [100, 0.1, 0.3], acc: [140, 0.8, 0.5], glow: '#4af08a' } }),
  F({ kind: 'runefish', label: 'Runefish', hab: 'fresh', tier: 7, unlock: 1000, deep: 0.75, stats: [1, 3, 0.55, 30], z: [8, 26], cruise: 8, small: true, school: true, group: [4, 6], light: { r: 5, col: '#4af08a' },
    look: { len: 10, depth: 0.16, base: [200, 0.1, 0.3], acc: [140, 0.9, 0.55], pat: 'netted', extras: ['glowspots'], glow: '#4af08a' } }),
  // The dreaming dark.
  D({ kind: 'dreamer', label: 'The Dreamer', hab: 'both', tier: 8, unlock: 2600, deep: 0.8, stats: [4, 5, 0.35, 1000], z: [18, 36], light: { r: 20, col: '#c04aff' },
    look: { R: 10, bell: [280, 0.5, 0.25], tent: [300, 0.7, 0.45], gonad: [320, 0.9, 0.6], lobes: 3, glow: true } }),
  F({ kind: 'thoughtfish', label: 'Thoughtfish', hab: 'both', tier: 8, unlock: 2200, deep: 0.8, stats: [3, 5, 0.35, 500], z: [8, 30], cruise: 4, light: { r: 10, col: '#ffe04a' },
    look: { len: 26, depth: 0.2, tail: 'fan', base: [260, 0.35, 0.2], acc: [50, 0.9, 0.6], extras: ['eyes'], glow: '#ffe04a' } }),
  // The deep past.
  C({ kind: 'opabinia', label: 'Opabinia', hab: 'salt', tier: 9, unlock: 1200, deep: 0.6, stats: [1, 4, 0.5, 5], cruise: 1.6,
    look: { segs: 8, w: 1.6, legs: 0, gills: true, proboscis: true, eyes5: true, base: [20, 0.5, 0.4], acc: [10, 0.6, 0.55] } }),
  F({ kind: 'helicoprion', label: 'Helicoprion', hab: 'salt', tier: 10, unlock: 2400, deep: 0.7, stats: [5, 5, 0.3, 40], z: [8, 30], cruise: 8, predator: true,
    look: { len: 40, depth: 0.1, tail: 'lyre', dorsal: 'ridge', base: [210, 0.2, 0.4], acc: [210, 0.15, 0.7], pat: 'twotone', extras: ['whorl'] } }),
  F({ kind: 'arandaspis', label: 'Arandaspis', hab: 'fresh', tier: 9, unlock: 1100, deep: 0.55, stats: [1, 4, 0.5, 10], z: [1, 6], cruise: 3,
    look: { len: 16, depth: 0.14, head: 1, peak: 0.2, tail: 'round', fins: 0.2, base: [40, 0.3, 0.4], acc: [40, 0.3, 0.6], pat: 'dotline', extras: ['plates'] } }),
  C({ kind: 'tiktaalik', label: 'Tiktaalik', hab: 'fresh', tier: 10, unlock: 2000, deep: 0.6, stats: [3, 5, 0.4, 30], cruise: 2, predator: true,
    look: { segs: 9, w: 2, legs: 2, leg: 1.8, tailW: 0.3, wiggle: 0.2, base: [70, 0.3, 0.35], acc: [60, 0.3, 0.5], pat: 'spots' } }),
  // Where it stops being of this world.
  F({ kind: 'glasseel', label: 'Glass eel', hab: 'salt', tier: 12, unlock: 4000, deep: 0.7, stats: [2, 5, 0.4, 50], z: [6, 30], cruise: 6, light: { r: 8, col: '#ff6ae0' },
    look: { len: 36, depth: 0.05, nb: 14, alpha: 0.5, base: [190, 0.4, 0.85], acc: [300, 0.8, 0.7], extras: ['glowspots'], glow: '#ff6ae0' } }),
  F({ kind: 'voidmanta', label: 'Void manta', hab: 'salt', tier: 13, unlock: 5500, deep: 0.7, stats: [4, 5, 0.3, 500], z: [12, 32], cruise: 5, light: { r: 12, col: '#8ab0ff' },
    look: { len: 22, depth: 0.2, peak: 0.3, tail: 'long', tailLen: 0.5, base: [260, 0.3, 0.12], acc: [200, 0.2, 0.9], pat: 'spots', freq: 8, psize: 0.1, extras: ['wings'], glow: '#8ab0ff' } }),
  D({ kind: 'lattice', label: 'Lattice', hab: 'salt', tier: 14, unlock: 8000, deep: 0.7, stats: [3, 5, 0.3, 5000], z: [14, 34], light: { r: 14, col: '#e0ffff' },
    look: { R: 7, bell: [60, 0.2, 0.85], tent: [180, 0.9, 0.6], gonad: [300, 0.9, 0.6], lobes: 6, glow: true } }),
  F({ kind: 'starfin', label: 'Starfin', hab: 'fresh', tier: 12, unlock: 4000, deep: 0.7, stats: [1, 5, 0.45, 100], z: [10, 30], cruise: 10, small: true, school: true, group: [3, 6], light: { r: 6, col: '#fff09a' },
    look: { len: 11, depth: 0.2, tail: 'lyre', base: [230, 0.5, 0.15], acc: [55, 1, 0.7], pat: 'spots', freq: 9, psize: 0.1, extras: ['glowspots'], glow: '#fff09a' } }),
  C({ kind: 'hollowwalker', label: 'Hollow walker', hab: 'fresh', tier: 13, unlock: 5500, deep: 0.7, stats: [3, 5, 0.35, 1000], cruise: 1.4, light: { r: 8, col: '#c060ff' },
    look: { segs: 6, w: 2.4, legs: 3, leg: 3, reach: 2.6, shell: [0, 0, 0.1], base: [0, 0, 0.12], acc: [280, 0.6, 0.6], glow: '#c060ff' } }),
  F({ kind: 'mirrorfish', label: 'Mirrorfish', hab: 'fresh', tier: 14, unlock: 8000, deep: 0.7, stats: [2, 5, 0.3, 1000], z: [8, 30], cruise: 6, light: { r: 10, col: '#ffffff' },
    look: { len: 18, depth: 0.3, base: [200, 0.05, 0.88], acc: [200, 0.05, 0.6], pat: 'twotone', extras: ['glowspots'], glow: '#ffffff' } }),
];

// ---- registering them -------------------------------------------------------------------------------------
const DESIGNS = {};
// (Also used by bestiary2.js, for the second catalogue.)
function registerDesign(d) {
  DESIGNS[d.kind] = d;
  if (d.shape === 'fish') d.sp = designSp(d);
  const k = d.kind, shallow = d.tier <= 1;
  DEEP[k] = { branch: d.hab, tier: d.tier, unlock: d.unlock, deepMin: d.deep || 0 };
  SPECIES_STATS[k] = { size: d.stats[0], rarity: d.stats[1], settle: d.stats[2], years: d.stats[3], ...(d.group ? { group: Math.round((d.group[0] + d.group[1]) / 2) } : {}) };
  SPECIES_HABITAT[k] = d.hab;
  SINGULAR[k] = d.label;
  if (d.predator) DEEP_PREDATORS.add(k);
  if (d.likes) LIKES[k] = d.likes;
  if (d.rhythm) RHYTHM[k] = d.rhythm;
  if (d.light) LIGHT_SPECIES[k] = d.light;
  if (d.shape !== 'drift') SCALABLE.add(k);
  if (shallow) { EATS.add(k); BREED[k] = { clutch: d.school ? [3, 5] : [1, 3], hatch: 25, cap: d.school ? 16 : 8, eggs: d.shape === 'crawl' ? 'floor' : 'plant' }; }
  else if (d.shape !== 'drift' && STRUCTURES.broodchamber) STRUCTURES.broodchamber.habitatFor.push(k); // (the deep's own kind breed in the brood chamber)
  CREATE[k] = d.shape === 'fish' ? (w, x, y, a) => new DesignedFish(w, x, y, k, (a && a.school) || null)
    : d.shape === 'crawl' ? (w, x, y) => new DesignedCrawler(w, x, y, k) : (w, x, y) => new DesignedDrifter(w, x, y, k);
  const color = d.shape === 'fish' ? d.sp.color : '#' + (() => { const c = ramp(...(d.look.base || d.look.bell))[2]; return [c & 255, (c >> 8) & 255, (c >> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join(''); })();
  SPECIES[k] = {
    label: d.label, color,
    spawn: (w, x, y) => {
      const [sx, sy] = d.deep ? deepSpot(w, k) : [x, y], n = d.group ? randi(d.group[0], d.group[1]) : 1;
      const school = d.school ? { tx: sx, ty: sy, tz: (d.z[0] + d.z[1]) / 2, until: 0 } : null;
      return Array.from({ length: n }, () => makeCreature(k, w, sx + (n > 1 ? rand(-8, 8) : 0), sy + (n > 1 ? rand(-8, 8) : 0), school ? { school } : {}));
    },
  };
  if (d.school) SCHOOL_KINDS.add(k);
  KIND_CODES.push(k);
}
for (const d of DESIGN_LIST) registerDesign(d);
// The brood chamber's breeders get their breeding (this runs after every species file, prehistoric's too).
for (const k of STRUCTURES.broodchamber.habitatFor) if (!BREED[k]) BREED[k] = { clutch: [1, 3], hatch: 40, cap: 6, eggs: 'floor', needs: true };
