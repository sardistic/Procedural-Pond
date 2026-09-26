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
  if (!ex) { world.depth = null; return; }
  const depth = new Uint8Array(W * H), axisX = deepAxisX(side), shifts = deepShifts(side);
  const [W0, H0] = baseSize(world), tiers = (world.erosion ? world.erosion.tier : 0);
  const maxD = DEPTH_TIERS[Math.min(tiers, DEPTH_TIERS.length - 1)].depth || 0.4;
  const seed = hashString(world.seed || 'pond') % 97;
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p++) {
      // Distance past the original edge of the pond, into the deep band.
      const into = axisX ? (shifts ? ex - x : x - (W0 - 1)) : (shifts ? ex - y : y - (H0 - 1));
      const along = axisX ? y : x;
      // A ragged drop-off a few pixels before the old edge, then deeper step by step.
      const lip = 6 + (fbm(along * 0.04, seed, 31) - 0.5) * 16;
      const t = (into + lip) / (ex + lip);
      if (t <= 0) continue;
      const shelf = Math.floor(t * 4 + (fbm(x * 0.03, y * 0.03, 32) - 0.5) * 0.9) / 4; // terraces
      depth[p] = Math.round(clamp(0.25 + 0.75 * clamp(shelf, 0, 1), 0, 1) * maxD * 255);
    }
  }
  world.depth = depth;
}

// ---- the tick -----------------------------------------------------------------------------------

function updateErosion(world, dt) {
  const E = world.erosion;
  if (!E || !world.shore || world.opts.life === false) return;
  const tide = world.tide, hab = world.opts.habitat;
  // Surf and a big tidal range wear the pond fastest; lakes erode slowly.
  const rate = hab === 'fresh' ? 0.16 + 0.2 * tide.surf : 0.1 + 0.4 * tide.surf * Math.max(0.3, tide.range);
  E.e += dt / world.opts.dayLength * rate;
  E.next -= dt;
  if (E.next > 0) return;
  E.next = 3;
  // Tide pools, one per couple of units of erosion past the first tier.
  const want = E.e >= DEPTH_TIERS[1].erosion ? Math.min(MAX_LAGOONS, 1 + Math.floor((E.e - DEPTH_TIERS[1].erosion) / 3)) : 0;
  if (E.lagoons.length < want && carveLagoon(world)) {
    makeShore(world);
    bakeBackground(world);
    if (typeof paintMinimapBackground === 'function') paintMinimapBackground();
    logEvent(world, E.lagoons.length === 1 ? `The surf has scoured a ${hab === 'fresh' ? 'marsh pool' : 'tide pool'} into the beach: at low tide it's cut off from the open water`
      : `Another ${hab === 'fresh' ? 'marsh pool' : 'tide pool'} has worn into the beach`, null, { cat: 'sky', pri: 2 });
  }
  const next = DEPTH_TIERS[E.tier + 1];
  if (next && E.e >= next.erosion) {
    E.tier++;
    if (next.expand && typeof expandWorld === 'function') expandWorld(next.expand, `${tierName(world, E.tier)} opens beyond the drop-off`);
    else logEvent(world, `The pond has changed: ${tierName(world, E.tier).toLowerCase()}`, null, { cat: 'rare', pri: 3 });
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

// Spend essence to wear the pond faster.
const deepenCost = (world) => 12 + 10 * (world.erosion ? world.erosion.tier : 0);
function deepenPond(world) {
  const cost = deepenCost(world);
  if (!spendEssence(world, cost)) return false;
  world.erosion.e += 1;
  world.erosion.next = 0;
  return true;
}
