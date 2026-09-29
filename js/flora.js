'use strict';
// More to grow. Ten more plants for the pond, each its own shape, each to buy (Plants & rocks) and each
// coming up by itself where the pond suits it:
//  - fresh: reeds and cattails standing up out of the shallows, lotus (a pad and a pink flower held above
//    the water), hornwort (feathery whorls), water hyacinth (floating rosettes with purple spikes) and a
//    moss carpet over the floor;
//  - salt: giant kelp from the floor to the surface, seagrass meadows, sea fans (a lattice held up into the
//    current), barrel sponges, and sea grapes creeping over the sand.
// What comes up by itself follows the pond's character (character.js): warm water grows lotus, hyacinth,
// seagrass, sponges and fans; cold water kelp, hornwort and moss; and every pond favours two or three of
// them of its own (by its seed), so no two ponds' floors fill in alike. Islands grow to their climate too:
// cactus and agave where it's dry, bamboo, hibiscus and bananas where it's warm and wet, birches where cold.

const FM = {
  reed: mat('#3a4a1a', '#566628', '#76863a', '#9ca458'), cattail: mat('#2a1a0e', '#4a2e16', '#6a4222', '#8a5a30'),
  lotusPad: mat('#1e4a1c', '#2e6a26', '#4a8c34', '#6aae4a'), lotus: mat('#a0406a', '#d06a94', '#f0a0c0', '#ffe0ec'), gold: mat('#8a6a0a', '#c09a14', '#f0c83a', '#fff08a'),
  hornwort: mat('#0e2a10', '#1a4418', '#2a6224', '#448434'), hyLeaf: mat('#1a4a1a', '#2a6a26', '#46903a', '#6ab854'), hyFlower: mat('#3a2a6a', '#5a44a0', '#8a70d0', '#c0b0f0'),
  moss: mat('#1a3a12', '#2a5a1c', '#3e7a2a', '#5e9a3a'), mossLit: mat('#2a4a1a', '#3e6a26', '#5a8e36', '#7eb04a'),
  stipe: mat('#2a2a0a', '#4a4414', '#6a6420', '#8e8a34'), blade: mat('#3a3a0e', '#5a5a18', '#7e7a26', '#a4a03a'), bladder: mat('#5a4a14', '#8a7020', '#b09430', '#d0b84a'),
  seagrass: mat('#1a5a1a', '#2a7a26', '#44a034', '#6ac44a'),
  fans: [mat('#4a1a4a', '#7a2a7a', '#a84aa8', '#d88ad8'), mat('#7a2a0a', '#b0441a', '#e0662a', '#ff9a5a'), mat('#6a5a0a', '#a08a14', '#d0b42a', '#f0dc5a')],
  sponges: [mat('#6a5a0a', '#a08a14', '#d0b42a', '#f0dc5a'), mat('#7a3a0a', '#b05a14', '#e07a2a', '#ffa85a'), mat('#3a1a4a', '#5a2a6a', '#7a4a8a', '#a07ab0')],
  spongeHole: mat('#140a04', '#20120a', '#2e1c10', '#3e2a18'), runner: mat('#1a4a1a', '#2a6a26', '#3a8a34', '#5aaa4a'), grape: mat('#2a6a2a', '#3a9a3a', '#5ac44a', '#9aee7a'),
};

// kind: label, water, price (pearls), opens with tier, [growth a day, lifespan min, max], seeding, cover, pulls the water
// (fresh -, salt +), who likes it, its line, how it shows in the side view, and where it comes up by itself (warm/cold: the water it favours).
const FLORA_PLANTS = {
  reeds: { label: 'Reeds', hab: 'fresh', price: 6, tier: 0, life: [0.25, 40, 80], seed: 0.12, cover: 0.05, water: -0.5, likes: ['frog', 'dragonfly', 'duck', 'snake'],
    tip: 'reeds and cattails standing up out of the shallows: dragonflies perch on them, frogs and ducks shelter in them', slice: ['reed', 0, 'reed'], warm: 0.2 },
  lotus: { label: 'Lotus', hab: 'fresh', price: 14, tier: 1, life: [0.12, 60, 120], seed: 0.06, cover: 0.03, water: -1, likes: ['frog', 'koi', 'turtle', 'dragonfly'],
    tip: 'a broad pad with a pink flower held above the water: koi and turtles love its shade', slice: ['flower', 0, 'flower'], warm: 0.8 },
  hornwort: { label: 'Hornwort', hab: 'fresh', price: 5, tier: 0, life: [0.3, 25, 50], seed: 0.14, cover: 0.05, water: -0.4, likes: ['tetra', 'axolotl', 'snail', 'koi'],
    tip: 'feathery whorls on long stems: small fish hide in it, and it keeps the water clear', slice: ['hornwort', 5, 'strand'], warm: -0.6 },
  hyacinth: { label: 'Water hyacinth', hab: 'fresh', price: 7, tier: 1, life: [0.35, 15, 35], seed: 0.18, cover: 0.03, water: -0.6, likes: ['frog', 'duck', 'tetra'],
    tip: 'floating rosettes with purple flower spikes: it spreads fast in warm water, and frogs and ducks like it', slice: [null, 0, 'surface'], warm: 0.7 },
  moss: { label: 'Moss carpet', hab: 'fresh', price: 4, tier: 0, life: [0.2, 50, 100], seed: 0.08, cover: 0.02, water: -0.3, likes: ['snail', 'shrimp', 'axolotl'],
    tip: 'a soft green carpet over the floor: snails graze it, shrimp pick through it', slice: ['marimo', 1, 'blob'], warm: -0.4 },
  kelp: { label: 'Giant kelp', hab: 'salt', price: 12, tier: 1, life: [0.2, 50, 100], seed: 0.07, cover: 0.06, water: 0.6, likes: ['octopus', 'ray', 'eel', 'shrimp'],
    tip: 'a forest from the floor to the surface, held up on gas bladders: it calms the water, and octopus and eels hunt in it', slice: ['kelp', 0, 'kelp'], warm: -0.8 },
  seagrass: { label: 'Seagrass', hab: 'salt', price: 4, tier: 0, life: [0.28, 30, 60], seed: 0.15, cover: 0.04, water: 0.4, likes: ['ray', 'turtle', 'starfish', 'shrimp'],
    tip: 'a meadow of short bright blades: turtles graze it, rays and starfish keep to it', slice: ['weed', 3, 'strand'], warm: 0.5 },
  seafan: { label: 'Sea fan', hab: 'salt', price: 16, tier: 2, life: [0.08, 90, 170], seed: 0.04, cover: 0.03, water: 0.8, likes: ['puffer', 'clown', 'shrimp'],
    tip: 'a lattice fan held up into the current to catch what drifts by: puffers and shrimp shelter behind it', slice: ['fan', 4, 'fan'], warm: 0.6 },
  sponge: { label: 'Barrel sponge', hab: 'salt', price: 10, tier: 1, life: [0.1, 80, 160], seed: 0.05, cover: 0.02, water: 0.6, likes: ['crab', 'starfish', 'puffer', 'shrimp'],
    tip: 'barrels and tubes that filter the water clean: crabs and starfish keep close', slice: ['sponge', 3, 'blob'], warm: 0.3 },
  seagrapes: { label: 'Sea grapes', hab: 'salt', price: 5, tier: 0, life: [0.3, 25, 50], seed: 0.14, cover: 0.02, water: 0.4, likes: ['snail', 'crab', 'starfish'],
    tip: 'a creeping runner hung with little green grapes: snails and crabs graze it', slice: ['grape', 1, 'dot'], warm: 0.1 },
};

// (These reach the surface or stand above it, so as they grow they're scaled across but not in height: the
// height is their own, by growth. The rest the renderer scales whole, like any plant.)
const FLORA_FLOAT = new Set(['lotus', 'hyacinth', 'reeds', 'kelp']);

class FloraPlant {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind;
    this.ph = rand(0, TAU); this.px = 0; this.py = 0;
    const F = this;
    if (kind === 'reeds') F.stems = Array.from({ length: randi(6, 10) }, () => ({ ox: rand(-3, 3), oy: rand(-3, 3), h: rand(48, 56), head: Math.random() < 0.55, ph: rand(0, TAU) }));
    else if (kind === 'lotus') { F.r = rand(7, 10); F.ang = rand(-PI, PI); F.raised = Array.from({ length: randi(0, 2) }, () => ({ a: rand(0, TAU), d: rand(6, 10), r: rand(3, 5), h: rand(47, 50) })); F.bloom = Math.random() < 0.8; }
    else if (kind === 'hornwort') F.stems = Array.from({ length: randi(3, 6) }, () => ({ ox: rand(-3, 3), oy: rand(-3, 3), h: rand(16, 30), a: rand(0, TAU), ph: rand(0, TAU) }));
    else if (kind === 'hyacinth') { const n = randi(5, 8); F.leaves = Array.from({ length: n }, (_, k) => ({ a: k / n * TAU + rand(-0.2, 0.2), l: rand(2.2, 3.2) })); F.spike = Math.random() < 0.7; }
    else if (kind === 'moss') F.tufts = Array.from({ length: randi(12, 20) }, () => ({ ox: rand(-6, 6), oy: rand(-5, 5), r: rand(1.2, 2.4), lit: Math.random() < 0.35 }));
    else if (kind === 'kelp') F.stipes = Array.from({ length: randi(1, 3) }, () => ({ ox: rand(-3, 3), oy: rand(-3, 3), ph: rand(0, TAU), n: randi(9, 12) }));
    else if (kind === 'seagrass') F.blades = Array.from({ length: randi(9, 15) }, () => ({ ox: rand(-5, 5), oy: rand(-5, 5), h: rand(7, 12), rest: rand(-PI, PI), ph: rand(0, TAU) }));
    else if (kind === 'seafan') { F.ang = rand(0, PI); F.m = pick(FM.fans); F.ribs = randi(7, 11); F.h = rand(11, 16); F.w = rand(7, 10); }
    else if (kind === 'sponge') { F.m = pick(FM.sponges); F.tubes = Array.from({ length: randi(2, 5) }, () => ({ ox: rand(-4, 4), oy: rand(-4, 4), r: rand(1.5, 2.6), h: rand(4, 10) })); }
    else if (kind === 'seagrapes') { F.a = rand(0, TAU); F.len = rand(10, 16); F.bunches = randi(4, 7); }
    this.id = newId(outlineOf(this.mainMat()));
    this.id2 = newId(outlineOf(this.accentMat()));
  }

  mainMat() { return { reeds: FM.reed, lotus: FM.lotusPad, hornwort: FM.hornwort, hyacinth: FM.hyLeaf, moss: FM.moss, kelp: FM.stipe, seagrass: FM.seagrass, seafan: this.m, sponge: this.m, seagrapes: FM.runner }[this.kind]; }
  accentMat() { return { reeds: FM.cattail, lotus: FM.lotus, hornwort: FM.hornwort, hyacinth: FM.hyFlower, moss: FM.mossLit, kelp: FM.blade, seagrass: FM.seagrass, seafan: this.m, sponge: FM.spongeHole, seagrapes: FM.grape }[this.kind]; }

  hit(x, y) { return Math.hypot(x - this.x, y - this.y) < (this.kind === 'moss' || this.kind === 'seagrapes' ? 8 : 7); }

  // The soft ones bend away from what swims through them.
  update(dt, world) {
    if (this.kind === 'sponge' || this.kind === 'moss' || this.kind === 'seagrapes' || this.kind === 'lotus') return;
    const [tx, ty] = pushFrom(world, this.x, this.y, 16, 30), k = Math.min(1, dt * 4);
    this.px += (tx * 5 - this.px) * k; this.py += (ty * 5 - this.py) * k;
  }

  draw(r, t, world) {
    const { x, y, id, id2, kind } = this, cur = world ? world.current : { x: 0, y: 0, s: 0 }, g = FLORA_FLOAT.has(kind) ? this.growth ?? 1 : 1;
    if (kind === 'reeds') {
      for (const s of this.stems) {
        const sw = Math.sin(t * 0.9 + s.ph) * 0.6 + cur.x * 0.8, sv = Math.cos(t * 0.8 + s.ph) * 0.4 + cur.y * 0.8, h = 6 + (s.h - 6) * g;
        const bx = x + s.ox, by = y + s.oy, tx = bx + sw + this.px * 0.3, ty = by + sv + this.py * 0.3;
        r.tube(bx, by, 0.45, 0, tx, ty, 0.3, h, 1, FM.reed, id);
        if (s.head && g > 0.6) r.tube(lerp(bx, tx, 0.85), lerp(by, ty, 0.85), 0.8, h - 6, lerp(bx, tx, 0.92), lerp(by, ty, 0.92), 0.8, h - 2, 0.9, FM.cattail, id2);
      }
    } else if (kind === 'lotus') {
      const R = this.r;
      r.ellipsoid(x, y, R, R * 0.97, this.ang, 44, 1.2, FM.lotusPad, id);
      for (const p of this.raised) if (g > 0.5) { const px = x + Math.cos(p.a) * p.d, py = y + Math.sin(p.a) * p.d; r.tube(px, py, 0.3, 40, px, py, 0.3, p.h, 1, FM.stipe, id); r.ellipsoid(px, py, p.r, p.r * 0.9, p.a, p.h, 0.8, FM.lotusPad, id); }
      if (this.bloom && g > 0.7) {
        const fz = 50 + Math.sin(t * 0.5 + this.ph) * 0.3;
        r.tube(x, y, 0.35, 44, x, y, 0.3, fz, 1, FM.stipe, id);
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + this.ph; r.ellipsoid(x + Math.cos(a) * 1.8, y + Math.sin(a) * 1.8, 2.2, 1.1, a, fz + 0.6, 2, FM.lotus, id2); }
        r.ellipsoid(x, y, 1.1, 1.1, 0, fz + 1.4, 1, FM.gold, id2);
      }
    } else if (kind === 'hornwort') {
      for (const s of this.stems) {
        let px = x + s.ox, py = y + s.oy;
        const n = Math.max(2, Math.round(s.h * g / 3));
        for (let k = 1; k <= n; k++) {
          const f = k / n, nx = x + s.ox + (Math.sin(t * 0.9 + s.ph + k * 0.4) * 0.8 + cur.x * 1.5 + this.px * 0.3) * f, ny = y + s.oy + (cur.y * 1.5 + this.py * 0.3) * f, z = k * 3;
          r.tube(px, py, 0.4, z - 3, nx, ny, 0.35, z, 1, FM.hornwort, id);
          for (let q = 0; q < 6; q++) { const a = q / 6 * TAU + k; r.tube(nx, ny, 0.25, z, nx + Math.cos(a) * 2.2, ny + Math.sin(a) * 2.2, 0.15, z + 1.2, 1, FM.hornwort, id); }
          px = nx; py = ny;
        }
      }
    } else if (kind === 'hyacinth') {
      const bob = Math.sin(t * 0.7 + this.ph) * 0.3;
      for (const l of this.leaves) r.ellipsoid(x + Math.cos(l.a) * l.l, y + Math.sin(l.a) * l.l, 2.4, 1.6, l.a, 43.5 + bob, 1.6, FM.hyLeaf, id);
      if (this.spike && g > 0.6) for (let k = 0; k < 5; k++) r.ellipsoid(x + 0.2 * k, y, 0.9, 0.9, 0, 46 + k * 1.1 + bob, 1, FM.hyFlower, id2);
    } else if (kind === 'moss') {
      for (const f of this.tufts) r.ellipsoid(x + f.ox * (0.5 + 0.5 * g), y + f.oy * (0.5 + 0.5 * g), f.r * g + 0.3, f.r * g * 0.9 + 0.3, f.ox, 0, (f.r * 0.8) * g + 0.3, f.lit ? FM.mossLit : FM.moss, f.lit ? id2 : id);
    } else if (kind === 'kelp') {
      for (const s of this.stipes) {
        let px = x + s.ox, py = y + s.oy, pz = 0;
        const top = 44 * (0.3 + 0.7 * g), n = s.n;
        for (let k = 1; k <= n; k++) {
          const f = k / n, lean = f * f, nx = x + s.ox + (Math.sin(t * 0.6 + s.ph + k * 0.3) * 1.6 + cur.x * 6 + this.px * 0.4) * lean, ny = y + s.oy + (Math.cos(t * 0.5 + s.ph + k * 0.3) * 1.2 + cur.y * 6 + this.py * 0.4) * lean, nz = top * f;
          r.tube(px, py, 0.55, pz, nx, ny, 0.5, nz, 1, FM.stipe, id);
          if (k % 2 === 0) { const a = t * 0.3 + s.ph + k; r.ellipsoid(nx + Math.cos(a) * 2.2, ny + Math.sin(a) * 2.2, 3.2, 1.1, a, nz - 0.5, 0.5, FM.blade, id2); r.ellipsoid(nx, ny, 0.7, 0.7, 0, nz - 1, 1.2, FM.bladder, id2); }
          px = nx; py = ny; pz = nz;
        }
        if (g > 0.85) for (let q = 0; q < 4; q++) { const a = q / 4 * TAU + s.ph + t * 0.1; r.ellipsoid(px + Math.cos(a) * 3.5, py + Math.sin(a) * 3.5, 4, 1.2, a, 43, 0.5, FM.blade, id2); } // (the canopy, lying on the surface)
      }
    } else if (kind === 'seagrass') {
      for (const b of this.blades) {
        const h = b.h * (0.3 + 0.7 * g), a = b.rest + Math.sin(t * 1.2 + b.ph) * 0.4, sw = 1.2 + cur.s * 2;
        const bx = x + b.ox, by = y + b.oy;
        r.tube(bx, by, 0.5, 0, bx + Math.cos(a) * sw + cur.x * 2 + this.px * 0.3, by + Math.sin(a) * sw + cur.y * 2 + this.py * 0.3, 0.3, h, 0.7, FM.seagrass, id);
      }
    } else if (kind === 'seafan') {
      const ca = Math.cos(this.ang), sa = Math.sin(this.ang), sway = Math.sin(t * 0.8 + this.ph) * 0.6 + this.px * 0.1, H = this.h * (0.4 + 0.6 * g), Wd = this.w * (0.4 + 0.6 * g);
      // (It leans back into the current, so from above it shows as a fan, not an edge.)
      const tip = (k, f) => { const u = (k / (this.ribs - 1) - 0.5) * 2, lean = H * 0.5 * f + sway * f * f; return [x + ca * u * Wd * f - sa * lean, y + sa * u * Wd * f + ca * lean, 1 + H * 0.8 * f * (1 - 0.25 * u * u)]; };
      r.tube(x, y, 1, 0, x, y, 0.7, 2, 1, this.m, id);
      for (let k = 0; k < this.ribs; k++) {
        let [px, py, pz] = tip(k, 0.1);
        for (let q = 2; q <= 5; q++) { const [nx, ny, nz] = tip(k, q / 5); r.tube(px, py, 0.35, pz, nx, ny, 0.25, nz, 1, this.m, id); px = nx; py = ny; pz = nz; }
      }
      for (let q = 2; q <= 5; q++) for (let k = 0; k < this.ribs - 1; k++) { const [ax, ay, az] = tip(k, q / 5), [bx, by, bz] = tip(k + 1, q / 5); r.tube(ax, ay, 0.2, az, bx, by, 0.2, bz, 1, this.m, id); }
    } else if (kind === 'sponge') {
      for (const tb of this.tubes) {
        const h = tb.h * (0.3 + 0.7 * g), bx = x + tb.ox, by = y + tb.oy, R = tb.r * (0.6 + 0.4 * g);
        for (let k = 0; k < 3; k++) r.ellipsoid(bx, by, R * (1 - k * 0.05), R * (1 - k * 0.05), 0, k * h / 3, h / 3 + 0.4, this.m, id);
        r.ellipsoid(bx, by, R * 0.55, R * 0.55, 0, h + 0.1, 0.3, FM.spongeHole, id2);
      }
    } else if (kind === 'seagrapes') {
      const L = this.len * (0.4 + 0.6 * g);
      let px = x, py = y;
      for (let k = 1; k <= 6; k++) {
        const f = k / 6, a = this.a + Math.sin(f * 5 + this.ph) * 0.5, nx = x + Math.cos(a) * L * f, ny = y + Math.sin(a) * L * f;
        r.tube(px, py, 0.4, 0.4, nx, ny, 0.35, 0.4, 1, FM.runner, id);
        if (k <= this.bunches) for (let q = 0; q < 4; q++) { const qa = q / 4 * TAU + k; r.ellipsoid(nx + Math.cos(qa) * 0.8, ny + Math.sin(qa) * 0.8, 0.7, 0.7, 0, 1.4 + q * 0.5, 0.7, FM.grape, id2); }
        px = nx; py = ny;
      }
    }
  }
}

// ---- wiring them in (the plants' tables in plants.js, game.js, structures.js, ecology.js, link.js) ------------------
for (const [k, F] of Object.entries(FLORA_PLANTS)) {
  GROW[k] = (w, x, y) => new FloraPlant(x, y, k);
  PLANT_PRICE[k] = F.price;
  PLANT_LIFE[k] = F.life;
  SEEDS[k] = F.seed;
  PLANT_COVER[k] = F.cover;
  PLANT_WATER[k] = F.water;
  LIKE_LABEL[k] = F.label.toLowerCase();
  for (const sp of F.likes) if (LIKES[sp] && !LIKES[sp].includes(k)) LIKES[sp].push(k);
  if (!PLANT_CODES.includes(k)) PLANT_CODES.push(k); // (append-only: links)
}
// Their tools (main.js puts them in the Plants & rocks list).
function floraTools(plantTool) {
  const out = {};
  for (const [k, F] of Object.entries(FLORA_PLANTS)) out[k] = { ...plantTool(k, F.label), habitat: F.hab, tier: F.tier || undefined };
  return out;
}

// ---- what comes up by itself --------------------------------------------------------------------------------------
// This pond's favourites: two or three kinds (of its water) that come up here far oftener than anywhere else.
function floraFavourites(world) {
  const s = hashString(`${world.seed || 'pond'}/flora`) % 99991, kinds = Object.keys(FLORA_PLANTS);
  const n = 2 + (hash2(s, 1, 9) < 0.4 ? 1 : 0), out = [];
  for (let i = 0; out.length < n && i < 40; i++) { const k = kinds[Math.floor(hash2(s, i + 3, 11) * kinds.length * 0.999)]; if (!out.includes(k)) out.push(k); }
  return out;
}
// A plant that comes up by itself here: the old ones, and the new ones by the warmth of the water and this pond's liking.
function naturalPlant(world, x, y, salt, deep) {
  if (deep) return salt ? 'blackcoral' : 'glowcap';
  const t = typeof waterTemp === 'function' ? waterTemp(world) : 0, fav = floraFavourites(world), shallow = world.shore ? shoreAt(world, x, y) : 0;
  const w = salt ? { coral: 2, anemone: 1, weed: 1 } : { weed: 2, eelgrass: 1, marimo: 1 };
  for (const [k, F] of Object.entries(FLORA_PLANTS)) {
    if ((F.hab === 'salt') !== salt) continue;
    let v = 0.6 * (1 + F.warm * t) * (fav.includes(k) ? 3 : 1);
    if (k === 'reeds') v *= shallow > 0.05 ? 3 : 0.2; // (reeds stand in the shallows)
    if (k === 'kelp') v *= depthAt(world, x, y) > 0.1 || shallow < 0.02 ? 1.4 : 0.6;
    if (v > 0) w[k] = v;
  }
  return pickWeighted(w);
}

// ---- the islands' flora by climate ----------------------------------------------------------------------------------
Object.assign(FLORA, {
  cactus(r, x, y, z, g, id) {
    const h = (4 + 5 * g) * g + 0.5, m = FM.hyLeaf;
    r.tube(x, y, 1 * g + 0.4, z, x, y, 0.9 * g + 0.3, z + h, 1, m, id(m));
    for (const sd of [-1, 1]) if (g > 0.5) { const ah = z + h * rand(0.35, 0.6); r.tube(x, y, 0.5, ah, x + sd * 2 * g, y, 0.5, ah + 0.5, 1, m, id(m)); r.tube(x + sd * 2 * g, y, 0.5, ah + 0.5, x + sd * 2 * g, y, 0.45, ah + 2.5 * g, 1, m, id(m)); }
    if (g > 0.8) r.ellipsoid(x, y, 0.8, 0.8, 0, z + h + 0.3, 0.6, FM.lotus, id(FM.lotus));
  },
  agave(r, x, y, z, g, id) { const m = mat('#2a4a3a', '#3e6a52', '#5a8e6e', '#80b490'); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + rand(0, 0.3); r.tube(x, y, 0.8 * g, z, x + Math.cos(a) * 3 * g, y + Math.sin(a) * 3 * g, 0.15, z + 2.2 * g, 0.8, m, id(m)); } },
  bamboo(r, x, y, z, g, id) {
    const m = mat('#3a5a14', '#567e1e', '#76a42e', '#9ccc48');
    for (let k = 0; k < 4; k++) {
      const ox = rand(-1.2, 1.2), oy = rand(-1.2, 1.2), h = (8 + rand(0, 6)) * g + 1;
      r.tube(x + ox, y + oy, 0.45, z, x + ox + 0.6, y + oy, 0.4, z + h, 1, (lx, ly, px, py, pz) => ((pz || 0) % 2.6 < 0.4 ? FM.stipe : m), id(m));
      if (g > 0.5) r.ellipsoid(x + ox + 0.6, y + oy, 1.8, 0.7, rand(0, TAU), z + h, 0.4, SM.frond, id(SM.frond));
    }
  },
  hibiscus(r, x, y, z, g, id) {
    for (let k = 0; k < 3; k++) r.ellipsoid(x + rand(-1.2, 1.2) * g, y + rand(-1.2, 1.2) * g, 1.5 * g + 0.3, 1.3 * g + 0.3, k, z, 1.5 * g + 0.3, LAND_M.bush, id(LAND_M.bush));
    const fl = mat('#8a0a1a', '#c01a2a', '#f0403a', '#ff9a8a');
    if (g > 0.4) for (let k = 0; k < 4; k++) r.ellipsoid(x + rand(-1.6, 1.6) * g, y + rand(-1.6, 1.6) * g, 0.7, 0.7, 0, z + 1.6 * g + 0.3, 0.5, fl, id(fl));
  },
  banana(r, x, y, z, g, id) {
    const h = (5 + 4 * g) * g + 0.5, m = mat('#2a5a14', '#3e7e1e', '#5aa62e', '#86cc4a');
    r.tube(x, y, 0.8 * g + 0.3, z, x, y, 0.6 * g + 0.2, z + h, 1, SM.trunk, id(SM.trunk));
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + rand(0, 0.4); r.ellipsoid(x + Math.cos(a) * 2.6 * g, y + Math.sin(a) * 2.6 * g, 3 * g + 0.3, 1.2 * g + 0.2, a, z + h - 0.5, 0.4, m, id(m)); }
  },
  birch(r, x, y, z, g, id) {
    const h = (7 + 6 * g) * g + 1, bark = mat('#8a8a82', '#c8c8c0', '#ecece4', '#ffffff'), leaf = mat('#3a5a14', '#5a821e', '#86aa36', '#b0d060');
    r.tube(x, y, 0.5 * g + 0.2, z, x + 0.3, y, 0.35 * g + 0.1, z + h, 1, (lx, ly, px, py, pz) => ((pz || 0) % 1.7 < 0.3 ? SM.bark : bark), id(bark));
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; r.ellipsoid(x + Math.cos(a) * 1.4 * g, y + Math.sin(a) * 1.4 * g, 1.6 * g + 0.3, 1.4 * g + 0.3, a, z + h * 0.6, h * 0.35, leaf, id(leaf)); }
  },
});
// What the pond's climate adds to what grows on its islands: dry ponds cactus and agave, warm wet ones bamboo,
// hibiscus and bananas, cold ones birches and pines.
function climateFloraWeights(world, weights) {
  if (typeof pondChar !== 'function') return;
  const C = pondChar(world), t = typeof waterTemp === 'function' ? waterTemp(world) : C.temp;
  if (C.wet < 0.85) { weights.cactus = (weights.cactus || 0) + 2.5 * (0.85 - C.wet) / 0.3 + 0.5; weights.agave = (weights.agave || 0) + 1.5; }
  if (t > 0.2 && C.wet > 0.95) { weights.bamboo = (weights.bamboo || 0) + 1.5; weights.hibiscus = (weights.hibiscus || 0) + 2; weights.banana = (weights.banana || 0) + 1.2; }
  if (t < -0.3) { weights.birch = (weights.birch || 0) + 2; weights.pine = (weights.pine || 0) + 1.5; }
}
