'use strict';
// Greed and its price.
//  - Wrecks: the further out a ship goes down, the bigger the ship (a sloop in the shallows, a
//    galleon, a ship-of-the-line, a great liner over the deep), the dearer, and the richer the
//    salvage each dawn.
//  - Oil rigs, from the midnight zone: a fortune in pearls each dawn, pumped from the deep. But they
//    leak. Oil spreads across the surface in slicks that drift with the current: animals under
//    them sicken and sour, plants wither, and the water fouls. Click a slick to skim it off.
//  - And oil has a will of its own. Where slicks gather, the tar wakes: a living sludge that
//    crawls over the floor toward whatever grows, swallowing slicks to grow, killing the plants it
//    passes, poisoning what swims near and marking some of them. It starves without oil: take
//    the rigs down and clean the water, and it dwindles away.

// ---- wrecks -----------------------------------------------------------------------------------------
const WRECKS = [[1.3, 'a sloop'], [1.75, 'a galleon'], [2.2, 'a ship-of-the-line'], [9, 'a great liner']];
const wreckScale = (deep) => 1 + 1.3 * clamp(deep || 0, 0, 1);
const wreckName = (s) => (WRECKS.find(([k]) => (s.big || 1) < k) || WRECKS[3])[1];
const wreckCost = (deep) => 1 + 4 * clamp(deep || 0, 0, 1) ** 2;
// Size a ship by how deep it went down (once; from its depth, so links regrow it the same).
function growWreck(s) {
  if (s.kind !== 'ship' || s.grown || !s.deep) return s;
  s.big = wreckScale(s.deep); s.L *= s.big; s.B *= s.big; s.grown = true;
  return s;
}
const structSize = (s) => STRUCTURES[s.kind].size * (s.big || 1);

// ---- the rig -----------------------------------------------------------------------------------------
const PM = {
  steel: mat('#2a2e34', '#4a5058', '#707880', '#a0a8b0'), rust: mat('#4a2010', '#7a3818', '#a8582a', '#d8844a'),
  deck: mat('#3a3a30', '#5a5a48', '#7a7a62', '#9a9a80'), flare: mat('#8a2a04', '#e0600a', '#ffa030', '#fff0a0'),
  oil: mat('#040404', '#0a0a0e', '#14141c', '#22222e'), sheen: [hexToInt('#6a3aa8'), hexToInt('#2a8aa8'), hexToInt('#8aa82a'), hexToInt('#a86a2a')],
  tar: mat('#020203', '#08080c', '#12121a', '#2a2a3a'), tarEye: mat('#6a0404', '#b01010', '#ff3020', '#ffb0a0'),
};
Object.assign(STRUCTURES, {
  rig: {
    label: 'Oil rig', pearls: 3500, essence: 200, r: 90, size: 22, wet: true, tier: 3, deepMin: 0.35,
    desc: 'it pumps the deep for a fortune in pearls each dawn; but it leaks, and oil spreads over the water, poisoning what it touches (and oil has a will of its own)',
    aura: { comfort: -0.12, aggression: 0.08 }, dawnPearls: 260, dawnEssence: 10,
  },
});
STRUCT_CODES.push('rig');
BUILD.rig = (s) => { s.ang = rand(-PI, PI); s.h = SURFACE_Z - 3; };
BAKE.rig = (r, s, next) => {
  // Four legs down to the floor, braced.
  const id = next(PM.steel), ca = Math.cos(s.ang), sa = Math.sin(s.ang), leg = (u, v) => [s.x + ca * u - sa * v, s.y + sa * u + ca * v];
  const corners = [[-9, -9], [9, -9], [9, 9], [-9, 9]].map(([u, v]) => leg(u, v));
  for (const [x, y] of corners) r.tube(x, y, 2, 0, x, y, 1.6, s.h, 0.9, PM.steel, id);
  for (let k = 0; k < 4; k++) {
    const [ax, ay] = corners[k], [bx, by] = corners[(k + 1) % 4];
    for (const z of [8, 20, 32]) r.tube(ax, ay, 0.7, z, bx, by, 0.7, z, 0.9, PM.rust, id);
  }
};
DRAW.rig = (r, s, t) => {
  // The deck at the surface, the derrick, and the flare burning off gas.
  const ca = Math.cos(s.ang), sa = Math.sin(s.ang), z = SURFACE_Z - 1, id = s.id;
  r.ellipsoid(s.x, s.y, 13, 11, s.ang, z, 1.2, PM.deck, id);
  for (let k = 0; k < 4; k++) { const a = s.ang + k * PI / 2 + PI / 4; r.tube(s.x + Math.cos(a) * 5, s.y + Math.sin(a) * 5, 0.6, z + 1, s.x, s.y, 0.4, z + 12, 0.9, PM.rust, id); }
  if (s.flareId == null) { s.flareId = newId(hexToInt('#3a1004')); EMISSIVE[s.flareId] = 2; }
  const fx = s.x + ca * 12, fy = s.y + sa * 12, k = 1.2 + 0.6 * Math.sin(t * 9 + s.seed) + 0.3 * Math.sin(t * 23);
  r.tube(s.x + ca * 8, s.y + sa * 8, 0.5, z + 1, fx, fy, 0.5, z + 5, 0.9, PM.steel, id);
  r.ellipsoid(fx, fy, k, k, 0, z + 6, 1.4, PM.flare, s.flareId);
};
if (typeof LIGHT_STRUCTS !== 'undefined') LIGHT_STRUCTS.rig = { r: 26, col: '#ff8a2a', k: 0.6 };

// ---- slicks ------------------------------------------------------------------------------------------
// { x, y, r, oil (0..1 how thick), seed }
// `fromTar`: the tar's own thin bleed, kept apart (the tar can't live on what it leaks).
function spillOil(world, x, y, amt, fromTar = false) {
  const S = world.slicks || (world.slicks = []);
  const near = S.find((s) => Math.hypot(s.x - x, s.y - y) < s.r && !!s.fromTar === fromTar);
  if (near) { near.oil = Math.min(1, near.oil + amt); near.r = Math.min(46, near.r + amt * 6); return near; }
  if (S.length >= 14) return null;
  const s = { x, y, r: 6 + amt * 8, oil: Math.min(1, (fromTar ? 0.1 : 0.4) + amt), seed: randi(0, 9999) };
  if (fromTar) s.fromTar = true;
  S.push(s);
  return s;
}
const slickAt = (world, x, y) => (world.slicks || []).find((s) => Math.hypot(s.x - x, s.y - y) < s.r * 0.9);
function skimSlick(world, s) {
  s.oil -= 0.45; s.r *= 0.8;
  const got = award(world, 3 + Math.round(s.r / 6), 'skimming oil', null, { flat: true });
  logEvent(world, `You skimmed oil off the water: +${got} pearls`, null, { cat: 'pond', pri: 0, key: 'skim', merge: (e) => `You skimmed ${e.n} slicks of oil off the water` });
  addRipple(world, s.x, s.y, 1);
  if (s.oil <= 0.08) world.slicks.splice(world.slicks.indexOf(s), 1);
}
// How fouled the water is at a point by oil (0..1; pollutionAt adds it to the litter's).
function oilAt(world, x, y) {
  let v = 0;
  for (const s of world.slicks || []) { const d = Math.hypot(s.x - x, s.y - y); if (d < s.r * 1.3) v += s.oil * (1 - d / (s.r * 1.3)); }
  return Math.min(1, v);
}

// A slick on the surface: black, with a rainbow sheen, ragged at the edges. (Its shape is worked out
// once and kept until it has spread a little further: the noise per pixel per frame was costly.)
let OIL_ID = 0;
function slickMask(s) {
  if (s.mask && Math.abs(s.mask.r - s.r) < 1.5) return s.mask.pts;
  const R = s.r, pts = [];
  for (let dy = -Math.ceil(R); dy <= R; dy++) {
    for (let dx = -Math.ceil(R); dx <= R; dx++) {
      const d = Math.hypot(dx, dy) / R, edge = 0.72 + 0.28 * vnoise((s.x0 + dx) * 0.12, (s.y0 + dy) * 0.12, s.seed % 97);
      if (d > edge) continue;
      const thin = d / edge;
      if (thin > 0.7 && ((dx + dy) & 1)) continue; // (thinning at the edge)
      pts.push(dx, dy, thin, vnoise(dx * 0.2, dy * 0.2, s.seed % 53) * 2);
    }
  }
  s.mask = { r: R, pts };
  return pts;
}
function drawSlicks(r, world, t, rect) {
  if (!world.slicks || !world.slicks.length) return;
  if (!OIL_ID) OIL_ID = newId(hexToInt('#000000'));
  r.castShadows = false;
  for (const s of world.slicks) {
    if (rect && (s.x + s.r < rect[0] - 4 || s.x - s.r > rect[2] + 4 || s.y + s.r < rect[1] - 4 || s.y - s.r > rect[3] + 4)) continue;
    if (s.x0 == null) { s.x0 = Math.round(s.x); s.y0 = Math.round(s.y); }
    const pts = slickMask(s), x = Math.round(s.x), y = Math.round(s.y);
    r.alpha = Math.min(1, 0.55 + s.oil * 0.5);
    for (let i = 0; i < pts.length; i += 4) {
      const thin = pts[i + 2], band = (thin * 7 + t * 0.3 + pts[i + 3]) % 1;
      const m = thin > 0.55 && band < 0.25 ? solidOf(PM.sheen[(Math.floor(thin * 7 + t * 0.3) + s.seed) & 3]) : PM.oil;
      r.dot(x + pts[i], y + pts[i + 1], SURFACE_Z - 0.4, m, OIL_ID);
    }
  }
  r.alpha = 1;
  r.castShadows = true;
}
const SHEEN_MATS = new Map();
const solidOf = (c) => { let m = SHEEN_MATS.get(c); if (!m) { m = [c, c, c, c]; SHEEN_MATS.set(c, m); } return m; };

// ---- the tar ------------------------------------------------------------------------------------------
// { x, y, size (4..30), heading, t, name }
function wakeTar(world) {
  const S = world.slicks || [];
  const big = S.slice().sort((a, b) => b.r * b.oil - a.r * a.oil)[0];
  if (!big) return;
  world.tar = { x: big.x, y: big.y, size: 8, heading: rand(-PI, PI), t: 0, eaten: 0 };
  big.oil = Math.max(0.1, big.oil - 0.4);
  logEvent(world, '✦ The oil has come together into something that moves. The tar is awake', null, { cat: 'rare', pri: 3 });
  if (typeof narrate === 'function') narrate(world, 'tar');
  if (typeof scatterFrom === 'function') scatterFrom(world, { x: big.x, y: big.y }, 2);
}
function updateTar(world, dt) {
  const T = world.tar;
  if (!T) return;
  T.t += dt;
  // It crawls toward the thickest oil, or whatever grows nearest.
  let goal = null, gd = Infinity;
  for (const s of world.slicks || []) { if (s.fromTar) continue; const d = Math.hypot(s.x - T.x, s.y - T.y) / (0.5 + s.oil); if (d < gd) { gd = d; goal = s; } }
  if (!goal) for (const p of world.plants) { const d = Math.hypot(p.x - T.x, p.y - T.y); if (d < gd) { gd = d; goal = p; } }
  if (goal) { const a = Math.atan2(goal.y - T.y, goal.x - T.x); T.heading += clamp(wrapAngle(a - T.heading), -dt * 0.8, dt * 0.8); }
  T.heading += (vnoise(T.t * 0.3, 7, 3) - 0.5) * dt;
  const sp = 5 + 6 / Math.sqrt(T.size);
  T.x = clamp(T.x + Math.cos(T.heading) * sp * dt, 10, world.W - 10);
  T.y = clamp(T.y + Math.sin(T.heading) * sp * dt, 10, world.H - 10);
  if (world.shore && isDry(world, T.x, T.y)) T.heading += PI * dt; // (it keeps to the water)
  const R = T.size;
  // It swallows oil and grows; without it, it starves.
  for (const s of world.slicks || []) if (!s.fromTar && Math.hypot(s.x - T.x, s.y - T.y) < R + s.r * 0.5) { const bite = Math.min(s.oil, dt * 0.2); s.oil -= bite; T.size = Math.min(30, T.size + bite * 6); }
  world.slicks = (world.slicks || []).filter((s) => s.oil > 0.05);
  T.size -= dt * 0.03; // (starving, slowly)
  // Plants it passes over wither; animals near it sicken, and some are marked.
  for (const p of world.plants) if ((p.x - T.x) ** 2 + (p.y - T.y) ** 2 < R * R) p.growth = Math.max(0.05, (p.growth ?? 1) - dt * 0.4);
  if (Math.random() < dt * 0.5) forNear(world, T.x, T.y, R + 16, (o) => {
    if (!o.life || o.dying) return;
    o.life.comfort = Math.max(0, o.life.comfort - 0.1);
    if (Math.random() < 0.05 && typeof infect === 'function') infect(world, o, 'rot', 'from the tar');
    if (Math.random() < 0.01 && !o.life.genome.eld) { o.life.genome.eld = true; o.life.corruption = 0; o.life.traits = eldTraits(o.life); logEvent(world, `The tar got into ${o.life.name} the ${describe(o).label}: it has been marked`, o, { cat: 'rare', pri: 2 }); }
  });
  // And it bleeds new oil as it goes.
  if (Math.random() < dt * 0.05 * (T.size / 10)) spillOil(world, T.x + rand(-R, R), T.y + rand(-R, R), 0.15, true);
  if (typeof gainCorruption === 'function') gainCorruption(world, dt * 0.01 * T.size / 10, null, { quiet: true });
  if (T.size < 4) {
    world.tar = null;
    logEvent(world, '✦ The tar has starved: it came apart into nothing', null, { cat: 'rare', pri: 3 });
    if (typeof narrate === 'function') narrate(world, 'tarGone');
  }
}
let TAR_ID = 0, TAR_EYE = 0;
function drawTar(r, world, t) {
  const T = world.tar;
  if (!T) return;
  if (!TAR_ID) { TAR_ID = newId(hexToInt('#3a1a4a')); TAR_EYE = newId(hexToInt('#200000')); EMISSIVE[TAR_EYE] = 2; }
  const R = T.size, n = 5 + Math.round(R / 4);
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU + T.t * 0.3, d = R * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(T.t * 1.3 + k * 1.7))), lr = R * (0.35 + 0.15 * Math.sin(T.t * 2 + k));
    r.ellipsoid(T.x + Math.cos(a) * d, T.y + Math.sin(a) * d, lr, lr * 0.85, a, 1, lr * 0.7, PM.tar, TAR_ID);
  }
  r.ellipsoid(T.x, T.y, R * 0.6, R * 0.5, T.heading, 1, R * 0.55, PM.tar, TAR_ID);
  // Eyes that open and close, more of them as it grows.
  for (let k = 0; k < 2 + Math.floor(R / 7); k++) {
    const a = T.heading + (k - 1) * 0.6, d = R * 0.35;
    if (Math.sin(T.t * 0.8 + k * 2.1) > -0.4) r.dot(T.x + Math.cos(a) * d, T.y + Math.sin(a) * d, R * 0.55 + 1.5, PM.tarEye, TAR_EYE);
  }
}

// ---- the tick -----------------------------------------------------------------------------------------
let oilTick = 0;
function updatePollution(world, dt) {
  const S = world.slicks || (world.slicks = []);
  // Slicks drift with the current and spread thin; thin ones break up.
  const cur = world.current;
  for (const s of S) {
    s.x = clamp(s.x + (cur.x * 1.5 + (world.weather.gust || 0) * 2) * dt, 4, world.W - 4); s.y = clamp(s.y + cur.y * 1.5 * dt, 4, world.H - 4);
    s.r = Math.min(46, s.r + dt * 0.05 * s.oil);
    s.oil -= dt * 0.0015 * (1 + world.tide.surf); // (surf breaks it up)
  }
  world.slicks = S.filter((s) => s.oil > 0.05);
  updateTar(world, dt);
  oilTick -= dt;
  if (oilTick > 0) return;
  const step = 1 - oilTick;
  oilTick = 1;
  // The rigs leak.
  for (const s of world.structures || []) if (s.kind === 'rig' && !s.anim && Math.random() < 0.03 * step) spillOil(world, s.x + rand(-20, 20), s.y + rand(-20, 20), rand(0.2, 0.5));
  // Under a slick: animals sour and sicken (the oiled birds most).
  for (const s of world.slicks) {
    forNear(world, s.x, s.y, s.r, (o) => {
      if (!o.life || o.dying) return;
      o.life.comfort = Math.max(0, o.life.comfort - 0.04 * s.oil);
      if (Math.random() < 0.0015 * s.oil * step * (o.species === 'duck' || o.species === 'gull' ? 4 : 1) && typeof infect === 'function') infect(world, o, 'rot', 'from the oil');
    });
  }
  // Where the oil gathers thick, the tar may wake.
  const oil = world.slicks.reduce((a, s) => a + s.r * s.r * s.oil, 0);
  if (!world.tar && oil > 2600 && Math.random() < 0.01 * step * (oil / 2600)) wakeTar(world);
}
