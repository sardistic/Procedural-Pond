'use strict';
// Sand: where the water drops it. Worked out each dawn from the pond's age, its surf, the river
// and what stands near the beach, so it builds and moves by itself (and links regrow it exactly).
//  - Sandbars: long low bars offshore, parallel to the beach, broken into shoals. They build with
//    the surf (salt water most, fresh least) and creep along the beach over the weeks. At low tide
//    their crests come up as pale sand; at high tide they're clear shallows.
//  - The delta: a fan of sand spreading in lobes from the river mouth (the river cuts on through
//    it). When the river moves, its old delta is slowly worn away.
//  - In the lee: sand piles up between an island (or anything built near the beach) and the beach,
//    a spit reaching out to it that in time joins it to the shore.
//  - Plant beds: where plants grow thick, their roots and fronds trap drifting sand; the floor
//    under an old bed goes pale and ripple-marked (it doesn't rise: the water stays swimmable).
// Where sand lies the floor goes paler and ripple-marked, so it shows underwater too.

const SAND_TINT = hexToInt('#e2d2a4'), SAND_RIPPLE = hexToInt('#c8b484');

// Deposits, as how high each pixel of floor has been built up (0..1 of the beach's height).
function applySand(world) {
  const { W, H } = world, shore = world.shore;
  if (!shore) { world.sand = null; return; }
  const S = world.sand && world.sand.length === W * H ? world.sand : (world.sand = new Uint8Array(W * H));
  S.fill(0);
  const days = typeof riverDay === 'function' ? riverDay(world) : Math.floor(world.days || 0) + 0.5;
  const hab = world.opts.habitat || 'mixed', side = world.shoreSide, band = beachBand(world);
  const along = side < 2 ? H : W, across = side < 2 ? W : H, seed = hashString(world.seed || 'pond') % 997;
  const surf = hab === 'fresh' ? 0.4 : hab === 'mixed' ? 0.75 : 1;
  // Raise a pixel of floor to v (0..1 of the feature's height): the beach rises to meet it, up to
  // cap (so crests reach about the low-tide line, never dry land); nothing is lowered here.
  const raise = (x, y, v, cap = 0.42) => {
    if (v <= 0.01 || x < 0 || y < 0 || x >= W || y >= H) return;
    const p = (x | 0) + (y | 0) * W, e = Math.round(Math.min(1, v) * 255);
    if (e > S[p]) S[p] = e;
    const top = Math.round(Math.min(cap, v * cap) * 255);
    if (top > shore[p]) shore[p] = top;
  };

  // Sandbars: two lines of shoals off the beach, building over the first month or so, creeping along it.
  const build = clamp(days / 28, 0, 1) * surf;
  if (build > 0.02) {
    for (let k = 0; k < 2; k++) {
      const w = 5 + 4 * k, drift = days * (1.3 + 0.8 * k);
      for (let u = 0; u < along; u++) {
        const shoal = clamp((fbm((u + drift) * 0.011, k * 5.1, seed) - 0.43) * 3.2, 0, 1);
        if (shoal <= 0) continue;
        const c = band * (1.05 + 0.38 * k) + 7 * Math.sin(u * 0.018 + k * 2 + days * 0.04) + 4 * Math.sin(u * 0.061 + seed);
        const h = shoal * build * (1 - 0.35 * k);
        for (let d = Math.floor(c - w); d <= Math.ceil(c + w); d++) {
          if (d < 0 || d >= across) continue;
          const t = 1 - Math.abs(d - c) / w;
          if (t > 0) { const [x, y] = coastXY(world, d, u); raise(x, y, h * t * (2 - t)); }
        }
      }
    }
  }

  // The river's delta (and what's left of the last one, wearing away).
  if (typeof riverState === 'function' && !world.riverOff) {
    const R = riverState(world), fans = [[R.k, clamp(R.f * 3, 0.2, 1)]];
    if (R.k > 0 && R.f < 0.6) fans.push([R.k - 1, 1 - R.f / 0.6]);
    const w = world.riverW || riverWidth(world);
    for (const [k, amt] of fans) {
      const C = riverCourse(world, k), d0 = band * 0.92, grow = clamp(days / 40, 0.15, 1) * amt, Rr = (12 + 3 * w) * grow + 6;
      const uc = riverCenter(world, C, d0);
      for (let dd = -12; dd <= Rr * 1.3; dd++) {
        for (let du = Math.floor(-Rr * 1.9); du <= Rr * 1.9; du++) {
          // A fan whose edge wanders with a slow noise, not a ring: lobes spread wider than they reach,
          // fading in from the river mouth (no hard edge on the landward side).
          const a = Math.atan2(du, dd + 6), r = Math.hypot(du / 1.35, dd + 6) / Rr;
          const edge = 0.62 + 0.5 * fbm(a * 1.6 + k * 3, seed * 0.01, seed + 5);
          const t = (1 - r / edge) * clamp((dd + 12) / 14, 0, 1);
          if (t <= 0) continue;
          const lumpy = 0.55 + 0.45 * fbm((uc + du) * 0.06, (d0 + dd) * 0.06, seed + k);
          const [x, y] = coastXY(world, d0 + dd, uc + du);
          raise(x, y, Math.sqrt(t) * lumpy * grow * 1.2, 0.37);
        }
      }
    }
  }

  // Plant beds trap sand: a pale patch under each thick, old bed (shown on the floor only).
  const beds = new Map();
  for (const p of world.plants || []) {
    if (p.born == null && p.oi == null) continue;
    const age = clamp((days - (p.born ?? days - 40)) / 20, 0, 1) * (p.growth ?? 1);
    if (age < 0.1) continue;
    const key = ((p.x / 24) | 0) + ((p.y / 24) | 0) * 4096, b = beds.get(key) || { x: 0, y: 0, w: 0, n: 0 };
    b.x += p.x * age; b.y += p.y * age; b.w += age; b.n++;
    beds.set(key, b);
  }
  for (const b of beds.values()) {
    if (b.n < 3) continue;
    const cx = b.x / b.w, cy = b.y / b.w, R = 8 + 4 * Math.sqrt(b.n), amt = Math.min(0.65, 0.12 * b.w);
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.ceil(cy + R)); y++) {
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++) {
        const t = 1 - Math.hypot(x - cx, y - cy) / (R * (0.75 + 0.5 * fbm(x * 0.09, y * 0.09, seed + 41)));
        if (t <= 0) continue;
        const p = x + y * W, e = Math.round(Math.min(1, t * 1.6) * amt * 255);
        if (e > S[p]) S[p] = e;
      }
    }
  }

  // In the lee: a spit from the beach out toward an island or anything built near the beach.
  for (const s of world.structures || []) {
    if (s.anim) continue;
    const isl = s.kind === 'island', size = isl ? islandRadius(world, s) : STRUCTURES[s.kind].size || 10;
    const age = clamp((days - (s.born ?? days)) / (isl ? 14 : 24), 0, 1) * (isl ? 1 : 0.6);
    if (age <= 0.02) continue;
    // Where it stands in beach terms: d from the landward edge, u along it.
    const dS = side === 0 ? s.x : side === 1 ? W - 1 - s.x : side === 2 ? s.y : H - 1 - s.y, uS = side < 2 ? s.y : s.x;
    if (dS > band * 2.6 || (world.depth && depthAt(world, s.x, s.y) > 0.3)) continue; // out in deep water, the sand falls away
    const half = size * (isl ? 0.8 : 0.9), dFrom = band * 0.72, dTo = dS - size * 0.3, bendDir = (s.seed || 1) % 2 ? 1 : -1;
    for (let d = Math.floor(dFrom); d <= dTo; d++) {
      const t = (d - dFrom) / Math.max(1, dTo - dFrom);
      // It grows out from the island and from the beach, and meets in the middle once it's old enough.
      const fromEnd = Math.min(t, 1 - t), made = age * 0.9 - fromEnd;
      if (made <= 0) continue;
      // Curving with the drift, wide at both ends and pinched in the middle, its edges ragged.
      const uc = uS + bendDir * size * 0.45 * Math.sin(t * PI) + (fbm(d * 0.05, seed, 23) - 0.5) * size * 0.3;
      const neck = half * (0.35 + 0.65 * Math.abs(t - 0.5) * 2) * (0.7 + 0.6 * fbm(d * 0.09, uS * 0.01, seed + 29));
      const lift = Math.min(1, made * 2.5) * (0.6 + 0.4 * Math.abs(t - 0.5) * 2); // low in the middle: awash at high tide
      for (let du = Math.floor(-neck - 2); du <= neck + 2; du++) {
        const edge = 1 - Math.abs(du) / neck;
        if (edge <= 0) continue;
        const v = Math.sqrt(edge) * lift * (0.7 + 0.3 * fbm((uc + du) * 0.12, d * 0.12, seed + 17));
        const [x, y] = coastXY(world, d, uc + du);
        raise(x, y, v, 0.45);
      }
    }
  }
}

// How the floor looks where sand lies: paler, with ripple marks running along the beach.
function sandOver(world, c, s, x, y) {
  const k = s / 255, side = world.shoreSide, u = side < 2 ? y : x, d = side < 2 ? x : y;
  const ripple = ((d * 0.42 + Math.sin(u * 0.07) * 2.2 + fbm(u * 0.05, d * 0.05, 71) * 3) % 3) < 0.9;
  return mixColor(c, ripple && k > 0.2 ? SAND_RIPPLE : SAND_TINT, Math.min(0.72, 0.15 + k * 0.7) * ((x + y) & 1 && k < 0.35 ? 0.6 : 1));
}
