'use strict';
// Erosion and the depths. Every tide wears at the pond, harder in big surf (so
// salt water erodes fastest and fresh water slowest). As erosion builds up:
//  - tide pools: the surf scours hollows into the beach that stay wet at low
//    tide, cut off from the open water until the tide comes back;
//  - the drop-off: the far side of the pond (away from the beach) falls away
//    into deep water, and the world grows that way, one band per depth tier,
//    each darker than the last: the twilight zone, the midnight zone and the
//    abyss in salt water; a deep lake, a sunless cave and a drowned cathedral in fresh.
// world.depth holds how deep each pixel is (0 = the ordinary floor, 255 = the
// bottom of the abyss); the renderer darkens the water by it, and deep-water
// species keep to it. Deeper tiers unlock species on the evolution tree.

const DEPTH_TIERS = [
  { erosion: 0, salt: 'The reef', fresh: 'The pond', depth: 0 },
  { erosion: 2, salt: 'Tide pools', fresh: 'Marsh pools', depth: 0 },
  { erosion: 5, salt: 'The twilight zone', fresh: 'The deep lake', depth: 0.4, expand: 0.22 },
  { erosion: 11, salt: 'The midnight zone', fresh: 'The sunless cave', depth: 0.7, expand: 0.22 },
  { erosion: 22, salt: 'The abyss', fresh: 'The drowned cathedral', depth: 1, expand: 0.22 },
];
const DEEP_COLOR = { salt: hexToInt('#02040e'), fresh: hexToInt('#050806'), mixed: hexToInt('#03050c') };

// ---- depth is the score -------------------------------------------------------------------------
// A pond's score is its deepest point, in fathoms, rising through the real zones:
// in salt water the twilight zone starts near 110 fathoms, the midnight zone 550 and
// the abyss 2,200, the hadal trench 6,000; then past any real sea: the black
// below 20,000, the drowned city 80,000, the dreaming dark 400,000. Fresh water
// runs shallower all the way. Between these points it rises geometrically; past
// the last it keeps going, slowly and steadily (no runaway).
const FATHOM_KNOTS = {
  salt: [[0, 2], [2, 8], [5, 110], [11, 550], [22, 2200], [40, 6000], [70, 20000], [120, 80000], [200, 400000]],
  fresh: [[0, 1], [2, 4], [5, 60], [11, 300], [22, 900], [40, 1700], [70, 6000], [120, 24000], [200, 120000]],
};
const FATHOM_TAIL = { salt: 2000, fresh: 600 }; // fathoms per unit of erosion past the last knot
function fathomsOf(e, branch) {
  const K = FATHOM_KNOTS[branch] || FATHOM_KNOTS.salt, last = K[K.length - 1];
  if (e > last[0]) return Math.round(last[1] + (e - last[0]) * (FATHOM_TAIL[branch] || FATHOM_TAIL.salt));
  let i = 0;
  while (i < K.length - 2 && e > K[i + 1][0]) i++;
  const [e0, f0] = K[i], [e1, f1] = K[i + 1], t = (e - e0) / (e1 - e0);
  return Math.max(1, Math.round(f0 * (f1 / f0) ** t));
}
const pondFathoms = (world) => fathomsOf(world.erosion ? world.erosion.e : 0, branchOf(world));

// What wears the pond deeper. Points count too, but on a log curve, so a deep,
// high-scoring pond can't run away with itself: 1,000 points add 0.6, 10,000
// add 2.1, 100,000 add 4, 1,000,000 add 6.
const pointsDepth = (p) => 2 * Math.log10(1 + Math.max(0, p) / 1000);
const DEPTH_PARTS = { tide: 'the tides', time: 'time', built: 'your structures', growth: 'plant life', life: 'evolution', points: 'points', essence: 'essence spent' };

// Evolution deepens the pond a step at a time: new generations, rare births,
// discoveries and hatchery broods.
function deepenBy(world, amount, part = 'life') {
  const E = world.erosion;
  if (!E || !(amount > 0)) return;
  if (E.acc == null) E.acc = E.e || 0;
  E.acc += amount;
  E.parts = E.parts || {};
  E.parts[part] = (E.parts[part] || 0) + amount;
}
const MAX_LAGOONS = 4;

const newErosion = () => ({ e: 0, tier: 0, lagoons: [], next: 0 });

// The deep side is opposite the beach. Growing toward the left or top shifts
// everything already there, so the world keeps an origin: where the original pond starts.
const deepAxisX = (side) => side === 0 || side === 1;
const deepShifts = (side) => side === 1 || side === 3; // the deep side is left or top
function originOf(world) {
  const ex = world.expandPx || 0;
  return deepShifts(world.shoreSide) ? (deepAxisX(world.shoreSide) ? [ex, 0] : [0, ex]) : [0, 0];
}
// The size the pond started at (before any deepening).
function baseSize(world) {
  const ex = world.expandPx || 0;
  return deepAxisX(world.shoreSide) ? [world.W - ex, world.H] : [world.W, world.H - ex];
}

const depthAt = (world, x, y) => (world.depth ? world.depth[clamp(y | 0, 0, world.H - 1) * world.W + clamp(x | 0, 0, world.W - 1)] / 255 : 0);
const branchOf = (world) => (world.opts.habitat === 'fresh' ? 'fresh' : 'salt');
const tierName = (world, t) => DEPTH_TIERS[t][branchOf(world)];

// ---- shaping the floor --------------------------------------------------------------------------
// Called from applyShoreEdits (after makeShore and islands): tide pools are cut
// into the beach, and the depth map is laid over the deep band.
function applyErosion(world) {
  const E = world.erosion, shore = world.shore, { W, H } = world;
  if (E && shore) {
    for (const L of E.lagoons) {
      const R = L.r * 1.25;
      for (let y = Math.max(0, Math.floor(L.y - R)); y <= Math.min(H - 1, Math.ceil(L.y + R)); y++) {
        for (let x = Math.max(0, Math.floor(L.x - R)); x <= Math.min(W - 1, Math.ceil(L.x + R)); x++) {
          const d = Math.hypot((x - L.x) / L.r, (y - L.y) / (L.r * 0.75)) + (vnoise(x * 0.12, y * 0.12, L.seed % 83) - 0.5) * 0.35;
          if (d >= 1) continue;
          const p = x + y * W;
          shore[p] = Math.min(shore[p], Math.round(shore[p] * d ** 4)); // a bowl: open water in the middle, the old beach at the rim
        }
      }
    }
  }
  buildDepth(world);
}

function buildDepth(world) {
  const ex = world.expandPx || 0, { W, H } = world, side = world.shoreSide;
  // Scour around what's been placed (coast.js) digs pockets of depth even before the pond opens up.
  if (!ex) { world.depth = typeof applyScour === 'function' ? applyScour(world, null) : null; return; }
  const depth = new Uint8Array(W * H), axisX = deepAxisX(side), shifts = deepShifts(side);
  const [W0, H0] = baseSize(world), tiers = (world.erosion ? world.erosion.tier : 0);
  const maxD = DEPTH_TIERS[Math.min(tiers, DEPTH_TIERS.length - 1)].depth || 0.4;
  const seed = hashString(world.seed || 'pond') % 97;
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p++) {
      // Distance past the original edge of the pond, into the deep band.
      const into = axisX ? (shifts ? ex - x : x - (W0 - 1)) : (shifts ? ex - y : y - (H0 - 1));
      const along = axisX ? y : x;
      // A ragged drop-off that wanders well either side of the old edge (no straight seam),
      // a slope down from it, then terraces whose risers slope into each other.
      const lip = 12 + (fbm(along * 0.011, seed, 31) - 0.5) * 80 + (fbm(along * 0.05, seed, 33) - 0.5) * 22;
      const t = (into + lip) / (ex + lip);
      if (t <= 0) continue;
      const s = t * 4 + (fbm(x * 0.03, y * 0.03, 32) - 0.5) * 0.9, f = s - Math.floor(s);
      const shelf = (Math.floor(s) + smoothstep(0.7, 1, f)) / 4;
      const slope = smoothstep(0, 0.2, t) * (0.85 + 0.3 * fbm(x * 0.06, y * 0.06, 34)); // the lip: down gently, unevenly
      depth[p] = Math.round(clamp((0.25 + 0.75 * clamp(shelf, 0, 1)) * slope, 0, 1) * maxD * 255);
    }
  }
  world.depth = typeof applyScour === 'function' ? applyScour(world, depth) : depth;
}

// ---- the tick -----------------------------------------------------------------------------------

function updateErosion(world, dt) {
  const E = world.erosion;
  if (!E || world.opts.life === false || dt <= 0) return;
  if (E.acc == null) E.acc = E.e || 0; // ponds from before: what they'd worn so far
  const P = E.parts || (E.parts = {}), tide = world.tide, hab = world.opts.habitat, days = dt / world.opts.dayLength;
  // Experience with the tide: surf and a big tidal range wear the pond fastest (lakes and pools barely).
  const tideRate = !world.shore ? 0 : hab === 'fresh' ? 0.07 + 0.12 * tide.surf : 0.05 + 0.26 * tide.surf * Math.max(0.3, tide.range);
  // Time alive, structures built (deep ones more), and the pond's plant life.
  const builtRate = Math.min(0.1, (world.structures || []).reduce((a, s) => a + (STRUCTURES[s.kind].tier ? 0.03 : 0.012), 0));
  const lode = typeof hasArtifact === 'function' && hasArtifact(world, 'lodestone') ? 1.5 : 1; // the lodestone of the deep
  const rates = { tide: tideRate * lode, time: 0.05 * lode, built: builtRate * lode, growth: 0.05 * (world.maturity ?? 1) * lode };
  for (const [k, r] of Object.entries(rates)) { P[k] = (P[k] || 0) + r * days; E.acc += r * days; }
  const before = E.e;
  E.pts = pointsDepth(world.game ? world.game.points : 0);
  E.e = Math.max(E.e, E.acc + E.pts);
  // The recent pace, for the time-to-next-tier estimate (erosion per pond second).
  const inst = (E.e - before) / dt;
  E.pace = E.pace ? E.pace + (inst - E.pace) * Math.min(1, dt / 120) : inst;
  E.next -= dt;
  if (E.next > 0) return;
  E.next = 3;
  // Tide pools, one per couple of units of erosion past the first tier.
  const want = E.e >= DEPTH_TIERS[1].erosion ? Math.min(MAX_LAGOONS, 1 + Math.floor((E.e - DEPTH_TIERS[1].erosion) / 3)) : 0;
  if (world.shore && E.lagoons.length < want && carveLagoon(world)) {
    makeShore(world);
    bakeBackground(world);
    if (typeof paintMinimapBackground === 'function') paintMinimapBackground();
    logEvent(world, E.lagoons.length === 1 ? `The surf has scoured a ${hab === 'fresh' ? 'marsh pool' : 'tide pool'} into the beach: at low tide it's cut off from the open water`
      : `Another ${hab === 'fresh' ? 'marsh pool' : 'tide pool'} has worn into the beach`, null, { cat: 'sky', pri: 2 });
  }
  const next = DEPTH_TIERS[E.tier + 1];
  if (next && E.e >= next.erosion) {
    E.tier++;
    if (typeof refreshSpeciesButtons === 'function') setTimeout(refreshSpeciesButtons, 0); // new builds, foods and plants
    if (next.expand && typeof expandWorld === 'function') expandWorld(next.expand, `${tierName(world, E.tier)} opens beyond the drop-off`);
    else logEvent(world, `The pond has deepened: ${tierName(world, E.tier).toLowerCase()}`, null, { cat: 'rare', pri: 3 });
  }
}

// A hollow in the middle of the beach, away from other pools.
function carveLagoon(world) {
  const E = world.erosion, { W, H } = world, lo = 0.35, hi = 0.62;
  for (let tries = 0; tries < 60; tries++) {
    const x = rand(20, W - 20), y = rand(20, H - 20), e = shoreAt(world, x, y);
    if (e < lo || e > hi) continue;
    const r = rand(12, 20);
    if (E.lagoons.some((L) => Math.hypot(L.x - x, L.y - y) < L.r + r + 10)) continue;
    if ((world.structures || []).some((s) => Math.hypot(s.x - x, s.y - y) < STRUCTURES[s.kind].size + r)) continue;
    E.lagoons.push({ x, y, r, seed: randi(0, 99999) });
    return true;
  }
  return false;
}

// Roughly how long until the next tier at the recent pace, in real seconds.
function tierEta(world) {
  const E = world.erosion, next = E && DEPTH_TIERS[E.tier + 1];
  if (!next || !E.pace) return null;
  return (next.erosion - E.e) / E.pace / Math.max(0.25, world.opts.speed);
}
const etaLabel = (s) => (s == null ? '' : s < 90 ? 'about a minute' : s < 3600 ? `about ${Math.round(s / 60)} minutes` : `about ${(s / 3600).toFixed(s < 36000 ? 1 : 0)} hours`);

// Spend essence to wear the pond faster.
// Wearing it deeper with essence gets dearer each time (a sink for a rich pond).
const deepenCost = (world) => Math.round((12 + 10 * (world.erosion ? world.erosion.tier : 0)) * 1.15 ** ((world.erosion && world.erosion.bought) || 0));
function deepenPond(world) {
  const cost = deepenCost(world);
  if (!spendEssence(world, cost)) return false;
  world.erosion.bought = (world.erosion.bought || 0) + 1;
  deepenBy(world, 1, 'essence');
  world.erosion.next = 0;
  return true;
}
