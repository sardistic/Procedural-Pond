'use strict';
// The coast: a river down the beach, islands the tides and seasons reshape,
// litter that washes up on popular ponds (and the blights that follow), and
// what building out into the deep opens up.
//
//  - River: seeded from the pond, so it runs the same way every time the pond
//    regrows. It comes in from the landward edge and cuts across the beach into
//    the pond: wide in fresh water, middling with both, a trickle in salt. It
//    widens and cuts deeper as the pond ages and deepens, keeps its channel wet
//    at every tide, calms the water at its mouth, freshens it (with both
//    waters), brings nutrients (plankton) and fresh plants, and fresh life likes it.
//  - Islands sit low, so high tides cover their rim and low tides bare a wide
//    beach. They swell and shrink over weeks of pond time (a slow cycle from
//    the island's seed), and can be raised in stacks (up to five), each bigger,
//    higher and lusher. From the third, an island can go one of two ways:
//    lanterns of life (small lights, fireflies, comfort) or the whispering stone
//    (corruption and madness spreading from it).
//  - Litter: the more a pond is visited and the higher its score (and the
//    deeper it gets), the more rubbish washes up along the tide line: bottles,
//    cans, bags, ghost nets, tyres, leaking drums. It spoils the water around it
//    (comfort, plant growth), ghost nets snare small animals, and the dirtier
//    and busier the pond, the likelier a blight at dawn: an algal bloom (a red
//    tide in salt water) or a sickness in the most crowded species. Click litter
//    (with any tool) to haul it out; aerators make blights rarer.
//  - The deep: structures (and deep plants) placed in deep water raise how many
//    animals the pond can hold, draw deep life up more often, and in time bring
//    deep species within reach without paying to unlock them.

// ---- beach-local coordinates: d from the landward edge, u along the beach ---------------------------
function coastXY(world, d, u) {
  const s = world.shoreSide, W = world.W, H = world.H;
  return s === 0 ? [d, u] : s === 1 ? [W - 1 - d, u] : s === 2 ? [u, d] : [u, H - 1 - d];
}
const beachBand = (world) => { const [W0, H0] = world.expandPx ? baseSize(world) : [world.W, world.H]; return Math.min(W0, H0) * 0.22; };

// ---- the river ------------------------------------------------------------------------------------
const RIVER_BASE = { fresh: 8, mixed: 5.5, salt: 3 }, RIVER_GROW = { fresh: 1, mixed: 0.65, salt: 0.35 };
const RIVER_FOAM = mat('#6aa8b8', '#9ccad6', '#cce6ee', '#f4fcff');

// How wide the river runs now: it grows as the pond ages and deepens (half-pixel steps).
function riverWidth(world) {
  const hab = world.opts.habitat || 'mixed', E = world.erosion;
  const age = clamp((E ? E.e : 0) / 22 + (world.days || 0) / 120, 0, 1.5);
  return Math.round(RIVER_BASE[hab] * (1 + RIVER_GROW[hab] * age) * 2) / 2;
}

function riverPlan(world) {
  return withSeed(`${world.seed}/river`, () => ({
    seed: world.seed, u: rand(0.2, 0.8), A: rand(6, 16), f: rand(0.035, 0.07), ph: rand(0, TAU), A2: rand(2, 6), f2: rand(0.12, 0.2), ph2: rand(0, TAU),
  }));
}

// Cut the channel into the beach (called from applyShoreEdits, before islands).
function applyRiver(world) {
  const shore = world.shore;
  world.river = null;
  if (!shore || world.riverOff) return;
  if (!world.riverPlan || world.riverPlan.seed !== world.seed) world.riverPlan = riverPlan(world);
  const P = world.riverPlan, hab = world.opts.habitat || 'mixed', side = world.shoreSide;
  const along = side < 2 ? world.H : world.W, band = beachBand(world), reach = band * 1.35;
  const w = world.riverW || (world.riverW = riverWidth(world));
  // The bed sits below the lowest tide (so it's always wet), deeper as it widens.
  const bed = Math.round(clamp(0.13 - 0.05 * (w / RIVER_BASE[hab] - 1), 0.03, 0.13) * 255);
  const u0 = P.u * along, pts = [];
  for (let d = 0; d <= reach; d++) {
    const uc = u0 + P.A * Math.sin(d * P.f + P.ph) + P.A2 * Math.sin(d * P.f2 + P.ph2);
    const half = w / 2 * (0.8 + 0.5 * d / reach); // it spreads toward the mouth
    for (let u = Math.floor(uc - half - 3); u <= Math.ceil(uc + half + 3); u++) {
      const [x, y] = coastXY(world, d, u);
      if (x < 0 || y < 0 || x >= world.W || y >= world.H) continue;
      const p = x + y * world.W, dist = Math.abs(u - uc);
      const v = dist <= half ? bed : Math.round(lerp(bed, shore[p], clamp((dist - half) / 3, 0, 1)));
      if (v < shore[p]) shore[p] = v;
    }
    if (d % 3 === 0) pts.push(coastXY(world, d, uc));
  }
  const mi = Math.min(pts.length - 1, Math.round(band * 0.95 / 3)), mouth = pts[mi];
  world.river = { pts: pts.slice(0, mi + 1), w, mouth, spot: { x: mouth[0], y: mouth[1], r: 8 + w } };
}

// Flow: flecks of foam riding the current down the channel.
function drawRiver(r, world, t) {
  const R = world.river;
  if (!R || R.pts.length < 2) return;
  const pts = R.pts, n = pts.length, flecks = Math.round(n * (1.2 + R.w / 8));
  r.castShadows = false;
  for (let k = 0; k < flecks; k++) {
    const s = (k / flecks + t * (0.018 + 0.004 * R.w) * (1 + hash2(k, 3, 5) * 0.5)) % 1, fi = s * (n - 1), i = fi | 0, f = fi - i;
    const a = pts[i], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
    const off = (hash2(k, 7, 3) - 0.5) * R.w * 0.8;
    r.dot(lerp(a[0], b[0], f) - dy / dl * off, lerp(a[1], b[1], f) + dx / dl * off, SURFACE_Z - 1, RIVER_FOAM, FX_ID);
  }
  r.castShadows = true;
}

// The river's pull on the water: calmer at the mouth and, with both waters, fresher.
function riverZones(world, put, tA, infl) {
  const R = world.river;
  if (!R) return;
  const [mx, my] = R.mouth, k = R.w / 6;
  put(tA, mx, my, -0.07 * k);
  if (world.opts.habitat === 'mixed') {
    put(infl, mx, my, -1.4 * k);
    const up = R.pts[Math.floor(R.pts.length * 0.6)];
    if (up) put(infl, up[0], up[1], -0.8 * k);
  }
}

// ---- islands ----------------------------------------------------------------------------------------
// Size swings slowly over the days (from the island's own seed; less in fresh
// water), and each stack raises and widens it.
function islandSand(world, s) {
  const d = Math.floor(world.days || 0), p1 = (s.seed % 1000) / 1000 * TAU, p2 = ((s.seed >> 10) % 1000) / 1000 * TAU;
  const k = world.opts.habitat === 'fresh' ? 0.5 : 1;
  return 1 + k * (0.16 * Math.sin(TAU * d / 23 + p1) + 0.07 * Math.sin(TAU * d / 7.3 + p2));
}
const islandRadius = (world, s) => s.R * (1 + 0.16 * ((s.stack || 1) - 1)) * islandSand(world, s);

function applyIslands(world) {
  const shore = world.shore, { W, H } = world;
  for (const s of world.structures || []) {
    if (s.kind !== 'island') continue;
    const R0 = islandRadius(world, s), R = R0 * 1.4, top = 0.97 + 0.06 * ((s.stack || 1) - 1);
    for (let y = Math.max(0, Math.floor(s.y - R)); y <= Math.min(H - 1, Math.ceil(s.y + R)); y++) {
      for (let x = Math.max(0, Math.floor(s.x - R)); x <= Math.min(W - 1, Math.ceil(s.x + R)); x++) {
        const d = Math.hypot(x - s.x, y - s.y) / R0;
        if (d >= 1.4) continue;
        // Low and broad: the tide covers the rim at high water and bares a wide beach at low.
        const e = top * (1 - (d / 1.4) ** 2) + (fbm(x * 0.08, y * 0.08, s.seed % 53) - 0.5) * 0.25;
        const p = x + y * W, v = Math.round(clamp(e, 0, 1) * 255);
        if (v > shore[p]) shore[p] = v;
      }
    }
  }
}

// Island lights (the life branch): little lanterns and glowing caps that come on at dusk.
const LANTERN = mat('#8a6a1a', '#d0a030', '#ffd870', '#fff8d0'), RUNE = mat('#0a4a2a', '#1a8a4a', '#3af08a', '#c0ffd8');
function drawIslandLife(r, s, t, world) {
  if (s.branch === 'life') {
    const n = 4 + 3 * (s.blv || 1), R = islandRadius(world, s) * 0.8, on = world.darkness > 0.3;
    if (s.lampId == null) { s.lampId = newId(hexToInt('#2a1a04')); EMISSIVE[s.lampId] = 2; }
    for (let k = 0; k < n; k++) {
      const a = hash2(k, s.seed % 97, 11) * TAU, d = (0.35 + 0.6 * hash2(k, 5, s.seed % 89)) * R;
      if (!on && k % 2) continue;
      const flick = on ? 0.5 + 0.5 * Math.sin(t * (2 + k * 0.3) + k) : 0;
      r.dot(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 3 + flick, on ? LANTERN : SM.egg, s.lampId);
    }
  } else if (s.branch === 'dark') {
    if (s.runeId == null) { s.runeId = newId(hexToInt('#020806')); EMISSIVE[s.runeId] = 2; }
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.3), h = 14 + 4 * (s.blv || 1);
    for (let k = 0; k < 5; k++) if (Math.sin(t * 2 + k * 1.7) > -0.3 * pulse) r.dot(s.x + (k % 2 ? 0.8 : -0.8), s.y - 0.5, 3 + k * h / 6, RUNE, s.runeId);
    if (world.darkness > 0.35) {
      const R = islandRadius(world, s) * 1.5;
      for (let k = 0; k < 16; k++) {
        if ((k + Math.floor(t * 2)) % 3 === 0) continue;
        const a = k / 16 * TAU - t * 0.15;
        r.dot(s.x + Math.cos(a) * R, s.y + Math.sin(a) * R, 1, ELD_SIGIL, s.runeId);
      }
    }
  }
}

DRAW.island = drawIslandLife;
// Fresh life likes the river mouth; crabs forage along it.
for (const k of ['koi', 'tetra', 'frog', 'duck', 'turtle', 'axolotl', 'snail', 'crab', 'catfish']) LIKES[k] = [...(LIKES[k] || []), 'river'];
LIKE_LABEL.river = 'the river mouth';

// ---- litter -----------------------------------------------------------------------------------------
const LITTER = {
  bottle: { w: 3, harm: 0.05, r: 28, hp: 1, label: 'a bottle' },
  can: { w: 3, harm: 0.04, r: 24, hp: 1, label: 'a can' },
  bag: { w: 2, harm: 0.07, r: 30, hp: 1, label: 'a plastic bag', floats: true },
  net: { w: 1.2, harm: 0.1, r: 34, hp: 2, label: 'a ghost net', floats: true },
  tire: { w: 1, harm: 0.09, r: 30, hp: 2, label: 'a tyre' },
  drum: { w: 0.5, harm: 0.22, r: 56, hp: 3, label: 'a leaking oil drum' },
};
const LITTER_CODES = ['bottle', 'can', 'bag', 'net', 'tire', 'drum']; // append-only (links)
const LM = {
  glass: mat('#0e3a1a', '#1a6a2e', '#3aa050', '#9ae0a8'), brown: mat('#2a1406', '#4a2a0e', '#6e4418', '#a07038'),
  tin: mat('#5a1010', '#a02020', '#d84040', '#f4a0a0'), steel: mat('#3a3e44', '#6a707a', '#a0a8b2', '#e0e6ee'),
  bag: mat('#8a9098', '#b8c0c8', '#dee4ea', '#ffffff'), net: mat('#0e2a2a', '#1a4a44', '#2e6e62', '#4e9a86'),
  rubber: mat('#060606', '#101012', '#1c1c20', '#2e2e34'), drum: mat('#1a2a5a', '#2a44a0', '#3a64d0', '#7aa0f0'),
  rust: mat('#3a1a06', '#6a320e', '#9a5018', '#c07a38'), oil: mat('#2a0a3a', '#1a4a6a', '#6a3a8a', '#d0a0ff'),
};

class Litter {
  constructor(k, x, y, born, hp = LITTER[k].hp, seed = newSeed()) {
    this.k = k; this.x = x; this.y = y; this.born = born; this.hp = hp; this.seed = seed;
    this.ang = hash2(seed % 997, 1, 9) * TAU;
    this.id = newId(outlineOf(LM.rubber));
  }

  draw(r, t, world) {
    const { x, y, ang, id, k } = this, ca = Math.cos(ang), sa = Math.sin(ang);
    const wet = !isDry(world, x, y), bob = wet && LITTER[k].floats ? Math.sin(t * 1.5 + this.seed) * 0.6 : 0;
    const z = wet && LITTER[k].floats ? SURFACE_Z - 3 + bob : wet ? 0.5 : 0.8;
    if (k === 'bottle') {
      const m = this.seed % 2 ? LM.glass : LM.brown;
      r.tube(x - ca * 3, y - sa * 3, 1.3, z, x + ca * 1.5, y + sa * 1.5, 1.3, z, 0.9, m, id);
      r.tube(x + ca * 1.5, y + sa * 1.5, 1.1, z, x + ca * 3.5, y + sa * 3.5, 0.55, z, 0.9, m, id);
    } else if (k === 'can') {
      r.tube(x - ca * 1.6, y - sa * 1.6, 1.2, z, x + ca * 1.6, y + sa * 1.6, 1.2, z, 0.9, (u) => (u < 0.15 || u > 0.85 ? LM.steel : LM.tin), id);
    } else if (k === 'bag') {
      r.alpha = 0.75;
      r.ellipsoid(x, y, 3.4, 2.4, ang + Math.sin(t * 0.7 + this.seed) * 0.3, z, 1, (lx, ly) => (hash2((lx * 4) | 0, (ly * 4) | 0, 3) < 0.2 ? null : LM.bag), id);
      r.alpha = 1;
    } else if (k === 'net') {
      for (let i = -3; i <= 3; i++) {
        r.tube(x - ca * 7 - sa * i * 2, y - sa * 7 + ca * i * 2, 0.35, z, x + ca * 7 - sa * i * 2, y + sa * 7 + ca * i * 2, 0.35, z + 0.2, 0.6, LM.net, id);
        r.tube(x + ca * i * 2 - sa * 6, y + sa * i * 2 + ca * 6, 0.35, z, x + ca * i * 2 + sa * 6, y + sa * i * 2 - ca * 6, 0.35, z + 0.2, 0.6, LM.net, id);
      }
    } else if (k === 'tire') {
      for (let i = 0; i < 10; i++) {
        const a0 = i / 10 * TAU, a1 = (i + 1) / 10 * TAU;
        r.tube(x + Math.cos(a0) * 4, y + Math.sin(a0) * 3.4, 1.6, z, x + Math.cos(a1) * 4, y + Math.sin(a1) * 3.4, 1.6, z, 1, LM.rubber, id);
      }
    } else if (k === 'drum') {
      r.tube(x - ca * 4, y - sa * 4, 3, z + 1, x + ca * 4, y + sa * 4, 3, z + 1, 1, (u, v) => (hash2((u * 9) | 0, (v * 5) | 0, this.seed % 31) < 0.3 ? LM.rust : LM.drum), id);
      // The sheen of oil spreading on the water around it.
      if (wet || world.tide.level > shoreAt(world, x, y) - 0.1) {
        r.castShadows = false;
        for (let i = 0; i < 18; i++) {
          const a = hash2(i, this.seed % 53, 2) * TAU + t * 0.05, d = 6 + hash2(i, 9, this.seed % 41) * 16;
          r.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, SURFACE_Z - 2, LM.oil, FX_ID);
        }
        r.castShadows = true;
      }
    }
  }

  hit(px, py) { return (px - this.x) ** 2 + (py - this.y) ** 2 < (this.k === 'net' || this.k === 'drum' ? 64 : 30); }
}

// How much a pond draws litter: its score (on a log curve), how many people come to see it, and its depth.
function litterPressure(world) {
  const G = world.game || {};
  return 0.2 * Math.log10(1 + (G.points || 0) / 1000) + 0.6 * Math.log10(1 + (G.views || 0)) + 0.08 * ((world.erosion && world.erosion.tier) || 0);
}

// How spoiled the water is here (0 clean .. 1 fouled).
function pollutionAt(world, x, y) {
  let v = 0;
  for (const l of world.litter || []) {
    const L = LITTER[l.k], d = Math.hypot(l.x - x, l.y - y);
    if (d < L.r) v += L.harm * 3 * (1 - d / L.r);
  }
  return Math.min(1, v);
}

function washUp(world) {
  if (!world.shore || world.litter.length >= 20) return;
  const total = LITTER_CODES.reduce((a, k) => a + LITTER[k].w, 0);
  let r = Math.random() * total, k = 'bottle';
  for (const key of LITTER_CODES) if ((r -= LITTER[key].w) <= 0) { k = key; break; }
  const tide = world.tide.level, wet = LITTER[k].floats && Math.random() < 0.4, reach = 0.15 + 0.15 * (1 - world.tide.range); // (a wider strand where tides barely move)
  for (let i = 0; i < 100; i++) {
    const x = rand(10, world.W - 10), y = rand(10, world.H - 10), e = shoreAt(world, x, y);
    if (wet ? e > tide - 0.05 || e < tide - 0.35 : e < tide - 0.02 || e > tide + reach) continue; // the wrack line (or just off it)
    world.litter.push(new Litter(k, x, y, world.days));
    logEvent(world, `The tide left ${LITTER[k].label} on the beach`, null, {
      cat: 'pond', pri: k === 'drum' ? 2 : 0, key: 'litter', data: LITTER[k].label, merge: (e) => `The tide left litter on the beach: ${tally(e.data)}`,
    });
    return;
  }
}

const litterAt = (world, x, y) => (world.litter || []).find((l) => l.hit(x, y));

function haulLitter(world, l) {
  l.hp--;
  addRipple(world, l.x, l.y, 0.6);
  if (l.hp > 0) { floatAward(l.x, l.y, 'heave…'); return; }
  world.litter.splice(world.litter.indexOf(l), 1);
  const got = award(world, l.k === 'drum' ? 4 : l.k === 'net' || l.k === 'tire' ? 2 : 1, 'clearing litter', null, { flat: true, quiet: true });
  floatAward(l.x, l.y, `+${got}`);
  logEvent(world, `Cleared ${LITTER[l.k].label} from the pond`, null, {
    cat: 'pond', pri: 0, key: 'cleared', data: LITTER[l.k].label, merge: (e) => `Cleared litter from the pond: ${tally(e.data)}`,
  });
}

// ---- blights ----------------------------------------------------------------------------------------
const BLIGHTS = {
  bloom: { label: (w) => (w.opts.habitat === 'fresh' ? 'an algal bloom' : 'a red tide'), comfort: 0.25 },
  sickness: { label: () => 'a sickness', comfort: 0.15 },
};
const BLIGHT_CODES = [null, 'bloom', 'sickness'];
const BLOOM_TINT = { fresh: hexToInt('#3a7a1a'), salt: hexToInt('#8a2a1a'), mixed: hexToInt('#6a4a1a') };

function blightRisk(world) {
  const aer = (world.structures || []).filter((s) => s.kind === 'aerator').length;
  return clamp(0.02 + 0.06 * litterPressure(world) * (0.4 + 2 * (world.pollution || 0)), 0, 0.45) * 0.7 ** Math.min(3, aer);
}

function startBlight(world) {
  const counts = {};
  for (const c of world.creatures) if (c.life && !c.leaving) counts[c.species] = (counts[c.species] || 0) + 1;
  const crowded = Object.entries(counts).filter(([, n]) => n >= 6).sort((a, b) => b[1] - a[1])[0];
  const k = !crowded || (world.pollution || 0) > 0.2 || Math.random() < 0.6 ? 'bloom' : 'sickness';
  world.blight = { k, until: world.days + rand(0.5, 1.2), sp: k === 'sickness' ? crowded[0] : null };
  const what = BLIGHTS[k].label(world);
  logEvent(world, `⚠ ${capFirst(what)} has come${k === 'sickness' ? ` over the ${plural(SINGULAR[crowded[0]] || crowded[0], 2).toLowerCase()}` : ' into the pond: the water is choked and weak animals are dying'}. Clearing litter and building aerators make these rarer`, null, { cat: 'rare', pri: 3 });
}

function blightStep(world) {
  const B = world.blight;
  if (!B) return;
  if (world.days > B.until) {
    logEvent(world, `The ${BLIGHTS[B.k].label(world).replace(/^an? /, '')} has passed`, null, { cat: 'pond', pri: 2 });
    world.blight = null;
    return;
  }
  for (const c of world.creatures) {
    const L = c.life;
    if (!L || c.dying || c.leaving || c.absorbing) continue;
    if (B.k === 'bloom' ? (L.energy < 0.35 || L.age > L.lifespan * 0.85) && Math.random() < 0.002 : c.species === B.sp && Math.random() < 0.0015) {
      c.dying = { t: 0, why: B.k === 'bloom' ? `choked in the ${BLIGHTS.bloom.label(world).replace(/^an? /, '')}` : 'of sickness' };
    }
  }
  if (B.k === 'bloom' && Math.random() < 0.3) world.food.push(new Food(rand(10, world.W - 10), rand(10, world.H - 10), rand(4, 30), 'plankton'));
}

// How much a blight weighs on an animal's comfort.
const blightComfort = (world, c) => (!world.blight ? 0 : world.blight.k === 'bloom' || c.species === world.blight.sp ? BLIGHTS[world.blight.k].comfort : 0);

// ---- the deep, built out ----------------------------------------------------------------------------
// How much has been placed in deep water, at or below a given depth.
function deepPlacedAt(world, min = 0.15) {
  let n = 0;
  for (const s of world.structures || []) { const d = depthAt(world, s.x, s.y); if (d >= min) n += d * (STRUCTURES[s.kind].tier ? 1.5 : 1); }
  for (const p of world.plants) if (p.born != null) { const d = depthAt(world, p.x, p.y); if (d >= Math.max(min, 0.3)) n += d * 0.25; }
  return n;
}

function dawnDeep(world) {
  world.deepPlaced = deepPlacedAt(world);
  world.maxPopBonus = Math.round(6 * world.deepPlaced);
  if (world.maxPopBase) world.maxPop = world.maxPopBase + world.maxPopBonus;
  // Deep species come within reach on their own once enough is built deep enough for them.
  const G = world.game, E = world.erosion;
  if (!G || !E) return;
  for (const [k, D] of Object.entries(DEEP)) {
    if ((G.unlocked || []).includes(k) || D.tier > E.tier || !fitsHabitat(world, D.branch)) continue;
    const need = D.mythic ? 5 : 0.8 + 0.7 * (D.tier - 1);
    if (deepPlacedAt(world, Math.max(0.15, D.deepMin)) < need) continue;
    G.unlocked = [...(G.unlocked || []), k];
    logEvent(world, `✦ What you've built in the deep has drawn ${plural(SINGULAR[k] || k, 2).toLowerCase()} closer: you can spawn them now, free of the unlock`, null, { cat: 'rare', pri: 3 });
  }
}

// ---- the tick ---------------------------------------------------------------------------------------
let coastTick = 0;
function updateCoast(world, dt) {
  if (!world.litter) world.litter = [];
  coastTick -= dt;
  if (coastTick > 0) return;
  const step = 1 - coastTick;
  coastTick = 1;
  let harm = 0;
  for (const l of world.litter) harm += LITTER[l.k].harm;
  world.pollution = Math.min(1, harm * 1.2);
  // Litter washes up with the pressure on the pond, more in big surf.
  if (world.opts.life !== false && world.shore) {
    const perDay = litterPressure(world) * (0.3 + 0.5 * world.tide.surf);
    if (Math.random() < perDay * step / world.opts.dayLength) washUp(world);
  }
  // Ghost nets snare small animals swimming through them.
  for (const l of world.litter) {
    if (l.k !== 'net' || isDry(world, l.x, l.y)) continue;
    for (const c of world.creatures) {
      if (!c.life || c.dying || c.leaving || (c.x - l.x) ** 2 + (c.y - l.y) ** 2 > 64) continue;
      if ((isPrey(c) || c.life.scale < 0.8) && Math.random() < 0.015) c.dying = { t: 0, why: 'tangled in a ghost net' };
    }
  }
  blightStep(world);
  plantTraitTick(world);
  // The river feeds the water at its mouth.
  const R = world.river;
  if (R && Math.random() < 0.15 * R.w / 6) {
    const [mx, my] = R.mouth;
    world.food.push(new Food(mx + rand(-R.w, R.w), my + rand(-R.w, R.w), rand(4, 26), 'plankton'));
  }
  // Islands gone dark spread madness and corruption; islands of life keep fireflies about at night.
  for (const s of world.structures || []) {
    if (s.kind !== 'island' || !s.branch) continue;
    const R2 = (islandRadius(world, s) * (1.6 + 0.3 * (s.blv || 1))) ** 2;
    if (s.branch === 'dark') {
      if (typeof gainCorruption === 'function') gainCorruption(world, 0.03 * (s.blv || 1) * step, null, { quiet: true });
      for (const c of world.creatures) {
        if (!c.life || c.life.genome.eld || (c.x - s.x) ** 2 + (c.y - s.y) ** 2 > R2) continue;
        c.life.comfort = Math.max(0, c.life.comfort - 0.03);
        if (Math.random() < 0.03 * (s.blv || 1)) c.maddened = 2;
      }
    } else if (world.darkness > 0.5) {
      const near = world.creatures.filter((c) => c.species === 'firefly' && (c.x - s.x) ** 2 + (c.y - s.y) ** 2 < R2).length;
      if (near < 3 * (s.blv || 1) && Math.random() < 0.3) {
        const f = new Firefly(world, s.x + rand(-20, 20), s.y + rand(-20, 20));
        f.alpha = 0;
        world.creatures.push(f);
      }
    }
  }
}

// Each dawn: blights may come; the river and islands are reshaped; the deep is counted.
function dawnCoast(world) {
  if (!world.blight && world.opts.life !== false && Math.random() < blightRisk(world)) startBlight(world);
  let reshape = false;
  if (world.shore) {
    const w = riverWidth(world);
    if (world.riverW && w > world.riverW) {
      logEvent(world, `The river has cut its channel wider${w > (world.riverW || 0) + 1 ? ' and deeper' : ''}`, null, { cat: 'pond', pri: 1 });
      reshape = true;
    }
    if (w !== world.riverW) { world.riverW = w; reshape = true; }
    const islands = (world.structures || []).filter((s) => s.kind === 'island');
    const key = islands.map((s) => islandRadius(world, s).toFixed(1)).join();
    if (islands.length && world.islandKey != null && key !== world.islandKey) {
      const grew = islands.reduce((a, s) => a + islandRadius(world, s) - (s.lastR || s.R), 0) > 0;
      logEvent(world, grew ? 'Calm weeks have built the island out a little' : 'The sea has taken some of the island', null, { cat: 'pond', pri: 1, key: 'island-size' });
      reshape = true;
    }
    for (const s of islands) s.lastR = islandRadius(world, s);
    world.islandKey = key;
  }
  // Scour around what's been placed on the floor changes the depths slowly.
  const sk = scourKey(world);
  if (sk !== world.scourKey) { world.scourKey = sk; reshape = true; }
  if (reshape && typeof structuresChanged === 'function') structuresChanged(true);
  dawnDeep(world);
}

// ---- scour: the floor wears deeper around what stands on it ---------------------------------------------
// Structures, rocks and plants placed in open water between the beach and the
// deep dig the floor out around them as the years go by, deeper nearer the
// drop-off and elongated toward it, so the deep creeps in where you build.
function scourSources(world) {
  const out = [], tier = (world.erosion && world.erosion.tier) || 0;
  const add = (x, y, born, w) => {
    if (born == null || (world.shore && shoreAt(world, x, y) > 0.08)) return;
    const k = clamp((world.days - born) / 25, 0, 1) * w * (0.4 + 0.2 * tier);
    if (k > 0.05) out.push({ x, y, k: Math.round(k * 10) / 10 });
  };
  for (const s of world.structures || []) add(s.x, s.y, s.born, 1);
  for (const r of world.rocks) if (r.oi == null) add(r.x, r.y, r.born ?? world.days - 30, 0.5);
  for (const p of world.plants) if (p.oi == null) add(p.x, p.y, p.born, 0.3);
  return out;
}
const scourKey = (world) => scourSources(world).map((s) => `${Math.round(s.x)},${Math.round(s.y)},${s.k}`).join(';');

function applyScour(world, depth) {
  const src = scourSources(world);
  if (!src.length) return depth;
  const { W, H } = world, N = world.shoreN || [0, 1], maxD = Math.max(0.35, (DEPTH_TIERS[(world.erosion && world.erosion.tier) || 0].depth || 0.35)) * 255;
  depth = depth || new Uint8Array(W * H);
  for (const s of src) {
    const R = 16 + 22 * s.k;
    for (let y = Math.max(0, Math.floor(s.y - R * 2)); y <= Math.min(H - 1, Math.ceil(s.y + R * 2)); y++) {
      for (let x = Math.max(0, Math.floor(s.x - R * 2)); x <= Math.min(W - 1, Math.ceil(s.x + R * 2)); x++) {
        const dx = x - s.x, dy = y - s.y, toward = -(dx * N[0] + dy * N[1]); // + away from the beach
        const stretch = toward > 0 ? 2 : 1, a = toward / stretch, b = dx * N[1] - dy * N[0];
        const d = Math.hypot(a, b) / R;
        if (d >= 1) continue;
        const p = x + y * W;
        if (world.shore && world.shore[p] > 20) continue;
        const v = Math.round(Math.min(maxD, s.k * 110 * (1 - d) ** 1.5 * (0.8 + 0.2 * fbm(x * 0.1, y * 0.1, 61))));
        if (v > depth[p]) depth[p] = v;
      }
    }
  }
  return depth;
}
