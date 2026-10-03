'use strict';
// Islands that live. Each island grows up over the days and keeps changing:
//  - It matures: bare sand, greening, wooded, forested, and at last old growth (with age, height,
//    what grows on it and the life in the land around it), each stage carrying more and bigger growth.
//  - Its size drifts toward what its water allows: sheltered water, a living shore, mangroves and a
//    reef build it out; surf wears it (salt water most, and hardest out over the deep); storms take
//    bites out of it, and it slowly heals; an eruption adds new rock. Its coastline wanders as it
//    ages, growing headlands and coves.
//  - Things arise on it of their own accord, where they suit it: a reef round a coral cay, reeds round
//    a fresh one, mangroves in salt shallows, birds nesting, tide pools in rock, a spring on a high
//    one, fire under a black one out over the deep, a great tree on old growth. Each can be grown
//    further from the island's card, along with sand to build it out and a grove to green it.
//  - Life comes to live on it: terns from a rookery (herons over fresh water), iguanas (skinks in
//    fresh water) basking on its rocks, seals hauling out on the bigger salt islands, and frogs and
//    fireflies about a spring.
//  - Its shape is its own kind's: a palm cay stretched along the current with a sand tail trailing down it,
//    a coral cay ringed by a wide reef flat with a lagoon bay on one side, a rocky skerry ragged and
//    steep, a reed isle low and marshy with mudflats, a willow islet long and narrow, a black islet
//    jagged and cliffed. Round it lie flats the tide covers at high water and bares at low, so it
//    changes shape through the day; out over deep water there are none, only cliffs.
//  - Fire under it (a black islet, one out over the deep, or one raised high enough) erupts now and
//    then: a tongue of lava runs out into the water and cools to black rock, pushing the coast out
//    past what sand and reef could ever build, and the cone at its heart grows each time.
// What an island has become is kept in its save (not in #s= links, like much that's newer).

const ISLE_SZ_MIN = 0.7, ISLE_SZ_MAX = 1.9, ISLE_LAVA_MAX = 16, ISLE_CONE_MAX = 6;
const ISLE_FX_ID = 9; // (the vent's glow and fire: its own light, no outline)
EMISSIVE[ISLE_FX_ID] = 2; FADE[ISLE_FX_ID] = 1;
const IM = {
  pool: mat('#1a4a5a', '#246878', '#3a8c9c', '#7ac0cc'), mud: mat('#2a2014', '#3e301e', '#54442c', '#6c5a3c'),
  mangrove: mat('#0e260c', '#1a4216', '#2a6022', '#447e32'), root: mat('#2a2014', '#44341e', '#62502e', '#806a44'),
  nest: mat('#3a2a14', '#5a4222', '#7a5c32', '#9a7a48'), guano: mat('#a8a49a', '#cfcbc0', '#ebe8e0', '#ffffff'), egg: mat('#8aa0a0', '#b0c8c4', '#d4e8e4', '#f4fffc'),
  ash: mat('#141210', '#24201c', '#38322c', '#4e4640'), crater: mat('#2a0804', '#4a0e06', '#6a1a0a', '#8a2a10'),
  lava: mat('#7a1a04', '#c0400a', '#f08020', '#ffd060'), smoke: mat('#4a4a4a', '#6a6a6a', '#8a8a8a', '#aaaaaa'),
  canopy: mat('#10280c', '#1c4414', '#2e641e', '#4a862c'), giantBark: mat('#2a1e14', '#463424', '#665038', '#86704e'),
  coralA: mat('#6a2a3a', '#a04858', '#d0707a', '#f0a0a0'), coralB: mat('#6a4a1a', '#a07a2a', '#d0a840', '#f0d070'),
  tern: mat('#9aa0a4', '#c8ccce', '#eceeee', '#ffffff'), ternTip: mat('#2a2e32', '#44484c', '#62666a', '#80848a'), cap: solid('#101214'),
  bill: mat('#a0400a', '#d0601a', '#f0802a', '#ffb060'), fish: mat('#6a7a8a', '#9aaab8', '#c8d4dc', '#eef4f8'),
  heron: mat('#5a6268', '#7e888e', '#a4aeb4', '#cad2d6'), heronBill: mat('#8a6a0a', '#c09a18', '#eec430', '#fff080'),
  iguana: mat('#141414', '#262624', '#3a3a36', '#524e48'), skink: mat('#3a3a1a', '#5a5a2a', '#7a7a3e', '#9e9a58'),
  seal: mat('#3a3630', '#5a544a', '#7e766a', '#a49a8c'),
};
Object.assign(SINGULAR, { tern: 'Tern', heron: 'Heron', iguana: 'Marine iguana', skink: 'Skink', seal: 'Seal' });

// ---- an island's state ------------------------------------------------------------------------------
const isleG = (s) => s.ig || (s.ig = { sz: 1, st: 0, f: {}, lob: 0, bar: 0 });
const isleLv = (s, k) => (s.ig && s.ig.f && s.ig.f[k]) || 0;
const isleSaltHere = (world, s) => world.opts.habitat === 'salt' || (world.opts.habitat === 'mixed' && typeof saltAt === 'function' && saltAt(world, s.x, s.y) > 0);
const isleDeep = (s) => (s.deep || 0) > 0.15;
const isleName = (s) => `the ${((typeof realmShown === 'function' && realmShown(s)) || (typeof ISLE_KINDS !== 'undefined' && ISLE_KINDS[isleOf(s)]) || { name: 'island' }).name.replace(/^an? /, '')}`;
const isleBySeed = (world, seed) => (world.structures || []).find((s) => s.kind === 'island' && s.seed === seed && !s.anim) || null;

// Living island flora needs ground that remains above spring high tide. The
// owner grid follows the stamped coastline, including coves and lava tongues.
function islandDryGround(world, s, x, y) {
  return !!world.shore && islandAt(world, x, y) === s &&
    shoreAt(world, x, y) > (typeof highWater === 'function' ? highWater(world) : 0.8) + 0.015;
}

// Find deeper water outward from a newly exposed island cell. Eggs and
// swimmers keep their identities while their positions move with the shore.
function islandWetRefuge(world, s, x0, y0, margin = SHORE_MARGIN + 0.04) {
  const safe = Math.max(0.02, world.tide.level - margin);
  const a0 = Math.atan2(y0 - s.y, x0 - s.x);
  const max = Math.min(Math.hypot(world.W, world.H), Math.max(60, isleReach(world, s) * 1.6));
  for (let d = 8; d <= max; d += 6) {
    for (const turn of [0, -0.35, 0.35, -0.7, 0.7, -1.2, 1.2]) {
      const a = a0 + turn, x = x0 + Math.cos(a) * d, y = y0 + Math.sin(a) * d;
      if (x < 8 || y < 8 || x >= world.W - 8 || y >= world.H - 8 || shoreAt(world, x, y) > safe) continue;
      return [x, y];
    }
  }
  return null;
}
// The narrow river has dry banks on both sides. Find its channel or the sea if
// a swimmer's body has been left on the beach after a tide or course change.
function shoreWetRefuge(world, x0, y0, margin = SHORE_MARGIN + 0.04) {
  const safe = Math.max(0.02, world.tide.level - margin);
  const n = world.shoreN || [0, 1], seaward = Math.atan2(-n[1], -n[0]);
  const turns = [0, -1, 1, -2, 2, -3, 3, 4, -4, -5, 5, -6, 6, -7, 7, 8];
  for (let d = 4, max = Math.min(Math.hypot(world.W, world.H), Math.max(240, Math.min(world.W, world.H) * 0.4)); d <= max; d += 4) {
    for (const turn of turns) {
      const a = seaward + turn * PI / 8, x = x0 + Math.cos(a) * d, y = y0 + Math.sin(a) * d;
      if (x < 8 || y < 8 || x >= world.W - 8 || y >= world.H - 8 || shoreAt(world, x, y) > safe) continue;
      return [x, y];
    }
  }
  return null;
}
// Target points can be wet on opposite sides of an island or river bank. A
// swimmer needs a water route, or it will repeatedly try to cross dry land.
function islandWaterRoute(world, x0, y0, x1, y1, margin = SHORE_MARGIN + 0.03) {
  if (!world.shore || !world.tide) return true;
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  for (let j = 1; j <= steps; j++) {
    const u = j / steps, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
    if (shoreAt(world, x, y) > world.tide.level - margin) return false;
  }
  return true;
}
// Keep the whole spine in swimming water, including fish in a winding river.
// This also repairs old saves and animals stranded by a tide or coast change.
function islandKeepSwimmerWet(world, c) {
  // Shore walkers, flying birds and island wildlife may cross dry ground.
  if (!world.shore || !world.tide || c.grabbed || c.leaving || c.dying || c.ambient ||
      AMPHIBIOUS.has(c.species) || c.species === 'gull') return false;
  let moved = false;
  for (let pass = 0; pass < 4; pass++) {
    let worst = null;
    const test = (x, y) => {
      const s = islandAt(world, x, y);
      const e = shoreAt(world, x, y);
      if (e > world.tide.level - 0.025 && (!worst || e > worst.e)) worst = { x, y, s, e };
    };
    test(c.x, c.y);
    if (c.body) for (let j = 0; j < c.body.n; j++) {
      test(c.body.x[j], c.body.y[j]);
      const w = c.body.w ? c.body.w[j] || 0 : 0;
      if (w > 1.5) {
        const a = (c.body.a && c.body.a[j] != null ? c.body.a[j] : c.heading) + PI / 2;
        for (const side of [-1, 1]) test(c.body.x[j] + Math.cos(a) * (w + 1), c.body.y[j] + Math.sin(a) * (w + 1));
      }
    }
    if (!worst) return moved;
    const margin = (c.shoreMargin ?? SHORE_MARGIN) + 0.08;
    const place = worst.s ? islandWetRefuge(world, worst.s, worst.x, worst.y, margin) : shoreWetRefuge(world, worst.x, worst.y, margin);
    if (!place) return moved;
    const dx = place[0] - worst.x, dy = place[1] - worst.y;
    c.x += dx; c.y += dy; c.tx = c.x; c.ty = c.y;
    if (c.body) for (let j = 0; j < c.body.n; j++) { c.body.x[j] += dx; c.body.y[j] += dy; }
    if (c.legs) for (const L of c.legs) for (const [kx, ky] of [['fx', 'fy'], ['sx', 'sy'], ['ex', 'ey'], ['dfx', 'dfy']]) {
      if (Number.isFinite(L[kx])) L[kx] += dx;
      if (Number.isFinite(L[ky])) L[ky] += dy;
    }
    moved = true;
  }
  // A long fish can straddle both banks of a narrow river. Translation alone
  // cannot fit that pose in the channel, so align it with nearby swimming water.
  const body = c.body, links = body && body.links || [], widths = body && body.w || [];
  const fits = (x, y, a) => {
    const ca = Math.cos(a), sa = Math.sin(a), na = a + PI / 2;
    let px = x, py = y;
    for (let j = 0; j < (body ? body.n : 1); j++) {
      if (px < 3 || py < 3 || px >= world.W - 3 || py >= world.H - 3 || shoreAt(world, px, py) > world.tide.level - 0.025) return false;
      const w = widths[j] || 0;
      if (w > 1.5) for (const side of [-1, 1]) {
        const sx = px + Math.cos(na) * (w + 1) * side, sy = py + Math.sin(na) * (w + 1) * side;
        if (sx < 3 || sy < 3 || sx >= world.W - 3 || sy >= world.H - 3 || shoreAt(world, sx, sy) > world.tide.level - 0.025) return false;
      }
      px -= ca * (links[j] || 0); py -= sa * (links[j] || 0);
    }
    return true;
  };
  const n = world.shoreN || [0, 1], seaward = Math.atan2(-n[1], -n[0]);
  const bearings = [0, -1, 1, -2, 2, -3, 3, 4], headings = [c.heading, seaward, seaward + PI, seaward - PI / 2, seaward + PI / 2];
  for (let d = 0, max = Math.min(Math.hypot(world.W, world.H), 240); d <= max; d += 8) for (const turn of bearings) {
    const bearing = seaward + turn * PI / 4, x = c.x + Math.cos(bearing) * d, y = c.y + Math.sin(bearing) * d;
    if (x < 8 || y < 8 || x >= world.W - 8 || y >= world.H - 8 || shoreAt(world, x, y) > world.tide.level - SHORE_MARGIN - 0.06) continue;
    for (const a of headings) if (fits(x, y, a)) {
      const dx = x - c.x, dy = y - c.y;
      c.x = x; c.y = y; c.tx = x; c.ty = y; c.heading = a; c.speed = 0;
      if (body && typeof body.place === 'function') body.place(x, y, a);
      else if (body) for (let j = 0; j < body.n; j++) { body.x[j] += dx; body.y[j] += dy; }
      if (c.legs) for (const L of c.legs) for (const [kx, ky] of [['fx', 'fy'], ['sx', 'sy'], ['ex', 'ey'], ['dfx', 'dfy']]) {
        if (Number.isFinite(L[kx])) L[kx] += dx;
        if (Number.isFinite(L[ky])) L[ky] += dy;
      }
      return true;
    }
  }
  return moved;
}

// When an island claims water that used to be open, rooted life changes with the
// ground. Water plants become the closest shore plant; coral leaves pale stone.
// The ordinary island flora lifecycle then grows and eventually replaces them.
const ISLE_LANDFORMS = {
  weed: 'reed', eelgrass: 'grass', seagrass: 'grass', hornwort: 'fern', reeds: 'reed',
  duckweed: 'grass', lily: 'flower', lotus: 'flower', hyacinth: 'flower',
  marimo: 'moss', moss: 'moss', glowcap: 'glowbloom', seaweed: 'grass', kelp: 'grass',
  coral: 'coralstone', blackcoral: 'coralstone', anemone: 'coralstone', urchin: 'coralstone',
  seafan: 'coralstone', sponge: 'coralstone', seagrapes: 'bush',
};
function islandShoreChanged(world, before) {
  if (!world.islandGround || !world.plants || !world.pads || !world.creatures || !world.tide) return;
  const high = typeof highWater === 'function' ? highWater(world) : 0.8, W = world.W;
  let rooted = 0, weathered = 0, relocated = 0, composted = 0;
  for (const [list, key] of [[world.plants, 'plants'], [world.pads, 'pads']]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i], ix = p.x | 0, iy = p.y | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= world.H || !p.make) continue;
      const q = ix + iy * W, s = islandAt(world, p.x, p.y);
      if (!s || before[q] / 255 >= high - 0.03 || world.shore[q] / 255 < high + 0.02) continue;
      const f = s.flora || (s.flora = []), t = ISLE_LANDFORMS[p.make] || 'grass';
      if (f.length < 64 && !f.some((v) => (v.x - (p.x - s.x)) ** 2 + (v.y - (p.y - s.y)) ** 2 < 16)) {
        const g = clamp(p.growth ?? 0.6, 0.2, 1);
        f.push({ t, x: +(p.x - s.x).toFixed(1), y: +(p.y - s.y).toFixed(1), b: world.days,
          span: t === 'coralstone' ? 35 : 14 + 12 * hash2(p.seed || 0, s.seed || 0, 95), g, gs: g, s: p.seed || (s.seed + i) });
        rooted++;
      } else if (typeof landHumus === 'function') landHumus(world, p);
      if (p.oi != null && world.removed && world.removed[key] && !world.removed[key].includes(p.oi)) world.removed[key].push(p.oi);
      p.dead = true; list.splice(i, 1);
    }
  }
  // Placed stones keep their identity, but the new shore weathers them: pale
  // limestone on a coral cay, black stone on a volcanic one, and native moss
  // at their feet elsewhere. Their existing rock save record carries the change.
  for (const r of world.rocks || []) {
    if (r.born == null) continue;
    const ix = r.x | 0, iy = r.y | 0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= world.H) continue;
    const q = ix + iy * W, s = islandAt(world, r.x, r.y);
    if (!s || before[q] / 255 >= high - 0.03 || world.shore[q] / 255 < high + 0.02) continue;
    const kind = isleOf(s), matIndex = kind === 'coral' ? 5 : kind === 'basalt' ? 3 : -1;
    if (matIndex >= 0 && ROCK_MATS[matIndex] && r.m !== ROCK_MATS[matIndex]) {
      r.m = ROCK_MATS[matIndex]; // makeRock's shader reads the rock's current material
      r.outline = outlineOf(r.m);
    }
    r.h = Math.max(1, r.h * 0.85);
    const f = s.flora || (s.flora = []), ox = r.x - s.x, oy = r.y - s.y;
    if (f.length < 64 && !f.some((v) => (v.x - ox) ** 2 + (v.y - oy) ** 2 < 16)) {
      const t = kind === 'basalt' ? 'blackmoss' : kind === 'reed' ? 'reed' : 'moss';
      f.push({ t, x: +ox.toFixed(1), y: +oy.toFixed(1), b: world.days, span: 18 + 12 * hash2(r.seed || 0, s.seed || 0, 96), g: 0.4, gs: 0.4, s: r.seed || (s.seed + ix) });
    }
    weathered++;
  }
  // Clutches cannot hatch on new dry land. Carry them to the nearest water
  // without changing parents, genes, hatch timer or the saved egg record.
  for (const e of world.eggs || []) {
    const ix = e.x | 0, iy = e.y | 0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= world.H) continue;
    const q = ix + iy * W, s = islandAt(world, e.x, e.y);
    if (!s || before[q] / 255 >= high - 0.03 || world.shore[q] / 255 < high + 0.02) continue;
    const place = islandWetRefuge(world, s, e.x, e.y);
    if (place) { [e.x, e.y] = place; relocated++; }
  }
  // Food caught by the rising beach becomes a little nourishment for its
  // plants. Existing structures, rocks and other placed objects stay intact.
  for (const f of world.food || []) {
    const ix = f.x | 0, iy = f.y | 0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= world.H || f.eaten) continue;
    const q = ix + iy * W, s = islandAt(world, f.x, f.y);
    if (!s || before[q] / 255 >= high - 0.03 || world.shore[q] / 255 < high + 0.02) continue;
    f.eaten = true;
    if (typeof landAdd === 'function') landAdd(world, f.x, f.y, 'life', f.fed ? 0.012 : 0.004);
    composted++;
  }
  if (rooted || weathered || relocated || composted) {
    if (typeof logEvent === 'function' && !world.observe) {
      const changes = [];
      if (rooted) changes.push(`rooted ${rooted} water plant${rooted === 1 ? '' : 's'}`);
      if (weathered) changes.push(`weathered ${weathered} stone${weathered === 1 ? '' : 's'}`);
      if (relocated) changes.push(`carried ${relocated} clutch${relocated === 1 ? '' : 'es'} to water`);
      if (composted) changes.push(`fed on ${composted} stranded food`);
      logEvent(world, `The island's new beach ${changes.join(', ')}`, null, { cat: 'life', pri: 1 });
    }
    if (typeof landRebake === 'function') for (const s of world.islandGroundIsles) landRebake(world, s.x, s.y, isleReach(world, s) + 8);
  }

  // A swimmer that was in water before the coast rose must have a wet route out.
  // Move the body with it so the next frame has no long, stretched joints.
  for (const c of world.creatures) if (c.life || c instanceof Fish) islandKeepSwimmerWet(world, c);
}

// Growing up: each stage wants age (a grove brings it on sooner), growth on it, height, and life about it.
const ISLE_STAGES = [
  { word: 'bare sand' },
  { word: 'greening', age: 3, flora: 5, note: 'grass and the first bushes' },
  { word: 'wooded', age: 8, flora: 10, note: 'trees now, and shade under them' },
  { word: 'forested', age: 16, flora: 16, stack: 3, note: 'a forest island, thick and green' },
  { word: 'old growth', age: 30, flora: 22, stack: 5, life: 0.2, note: 'old growth: the oldest trees in the pond' },
];
function isleStageFor(world, s, m) {
  const age = (world.days || 0) - (s.born || 0) + 3 * isleLv(s, 'grove'), fl = (s.flora || []).filter((f) => !f.dead).length;
  let st = 0;
  for (let i = 1; i < ISLE_STAGES.length; i++) {
    const S = ISLE_STAGES[i];
    if (age >= S.age && fl >= S.flora && (s.stack || 1) >= (S.stack || 1) && (m.life || 0) >= (S.life || 0)) st = i; else break;
  }
  return Math.max(st, (s.ig && s.ig.st) || 0); // (it doesn't go back)
}
// How much more can grow on it (land.js's cap), and what grows bigger as it matures.
const isleFloraK = (s) => 1 + 0.22 * ((s.ig && s.ig.st) || 0) + 0.15 * isleLv(s, 'grove');
function isleFloraWeights(s, w) {
  const st = (s.ig && s.ig.st) || 0, kind = isleOf(s);
  if (st < 2) return;
  const tree = { rock: 'pine', reed: 'willow', willow: 'willow', basalt: 'pine' }[kind] || 'palm';
  w[tree] = (w[tree] || 0) + st;
  if (st >= 3) { w.fern = (w.fern || 0) + 1; w.bush = (w.bush || 0) + 1; }
}

// ---- its shape: its kind's, a wandering coastline, flats the tide bares, lava, and a barrier reef -------
// How each kind lies: stretched along the current (and trailing a tail of flats down it), how ragged its edge,
// how far its flats reach (and how high they stand: what the tide covers and bares), a bay on one side, how
// steeply it falls away.
const ISLE_FORMS = {
  palm: { stretch: 1.25, rough: 0.35, flats: 0.55, tail: 1.1, flatZ: 0.36, cliff: 0, bay: 0 },
  coral: { stretch: 1.1, rough: 0.25, flats: 0.9, tail: 0.4, flatZ: 0.4, cliff: 0, bay: 0.38 },
  rock: { stretch: 1, rough: 1.3, flats: 0.3, tail: 0.1, flatZ: 0.34, cliff: 3, bay: 0 },
  reed: { stretch: 1.35, rough: 0.9, flats: 0.85, tail: 0.5, flatZ: 0.38, cliff: 0, bay: 0.18 },
  willow: { stretch: 1.6, rough: 0.45, flats: 0.45, tail: 0.8, flatZ: 0.36, cliff: 0, bay: 0 },
  basalt: { stretch: 1.05, rough: 1.1, flats: 0.12, tail: 0, flatZ: 0.32, cliff: 5, bay: 0 },
};
function isleForm(world, s) {
  const K = ISLE_FORMS[isleOf(s)] || ISLE_FORMS.palm, h = (k) => hash2(s.seed % 997, k, 131);
  const ang = ((world && world.current && world.current.base) || 0) + (h(1) - 0.5) * 0.8; // (along the pond's current, and down it)
  const F = { ...K, ang, bayAng: h(2) * TAU, flats: K.flats * clamp(1 - 2.2 * (s.deep || 0), 0, 1), cliff: K.cliff + 8 * (s.deep || 0) };
  return typeof realmForm === 'function' ? realmForm(s, F) : F; // (and its realm's: realms.js)
}
// How far out its coast lies along a bearing, as a share of its radius.
function isleOutline(world, s, a, F = isleForm(world, s)) {
  const G = s.ig || {}, h = s.seed | 0, c = Math.cos(a - F.ang), sn = Math.sin(a - F.ang), st = F.stretch;
  let o = 1 / Math.sqrt((c / st) ** 2 + (sn * st) ** 2); // (an ellipse along the current, the same size)
  o *= 1 + 0.06 * F.rough * (Math.sin(7 * a + (h % 17)) + 0.7 * Math.sin(11 * a + (h % 23) * 0.5) + 0.5 * Math.sin(17 * a + (h % 29)));
  if (F.bay) o *= 1 - F.bay * Math.max(0, Math.cos(a - F.bayAng)) ** 6;
  if ((F.facets || F.spike) && typeof realmOutline === 'function') o *= realmOutline(F, a); // (facets, crystal points: realms.js)
  o *= isleLobe(s, a);
  for (const L of G.lava || []) { const da = Math.abs(wrapAngle(a - L.a)); if (da < L.w) o += L.len * (1 - (da / L.w) ** 2); } // (the lava it has put out)
  return o;
}
// Give every coast, tidal flat and barrier reef a strip of open water at the
// pond edge. Above its original size, an island approaches that available room
// with diminishing returns instead of suddenly stopping at a hard radius.
// `raw` is the radius before this limit (coast.js islandRadius passes it in).
function islandGrowthRadius(world, s, raw) {
  if (!world || !s || !world.W || !world.H || !Number.isFinite(raw)) return raw;
  const G = s.ig || {}, lava = G.lava || [], roomKey = `${world.W}:${world.H}:${s.x}:${s.y}:${s.deep || 0}:${world.current && world.current.base || 0}:${G.lob || 0}:${G.bar || 0}:${lava.map((L) => `${L.a}/${L.len}/${L.w}`).join(',')}`;
  let cap = s.growthRoom && s.growthRoom.key === roomKey ? s.growthRoom.cap : null;
  if (cap == null) {
    const F = isleForm(world, s), bar = G.bar || 0;
    const margin = Math.max(20, Math.min(world.W, world.H) * 0.035);
    let room = Infinity;
    for (let k = 0; k < 64; k++) {
      const a = k * TAU / 64, ca = Math.cos(a), sa = Math.sin(a), outline = isleOutline(world, s, a, F);
      // The stamped coast extends to 1.4 radii, and flats/reef can reach farther.
      const extent = outline * Math.max(1.4, 1 + isleFlatsAt(F, a), bar ? 2.35 : 0);
      const dx = ca > 0.0001 ? (world.W - margin - s.x) / ca : ca < -0.0001 ? (s.x - margin) / -ca : Infinity;
      const dy = sa > 0.0001 ? (world.H - margin - s.y) / sa : sa < -0.0001 ? (s.y - margin) / -sa : Infinity;
      room = Math.min(room, (Math.min(dx, dy) - 2) / Math.max(0.2, extent));
    }
    cap = Math.max(2, room);
    s.growthRoom = { key: roomKey, cap };
  }
  const first = Math.min(cap, s.R * islandSand(world, s));
  if (raw <= first || cap <= first + 0.001) return Math.min(raw, cap);
  const spare = cap - first;
  return first + spare * (1 - Math.exp(-(raw - first) / spare));
}
// How far out its flats reach past the coast along a bearing (further down-current: its tail).
const isleFlatsAt = (F, a) => F.flats * (1 + F.tail * Math.max(0, Math.cos(a - F.ang)) ** 2);
// All it can reach, coast and flats, as a share of its radius.
const isleReachK = (world, s, F = isleForm(world, s)) => 1.4 * Math.max(F.stretch, 1 / F.stretch) * (1 + 0.14 * F.rough) * (s.ig && s.ig.lob ? 1.22 : 1)
  + Math.max(0, ...((s.ig && s.ig.lava) || []).map((L) => L.len)) + F.flats * (1 + F.tail) + 0.1;
function isleLobe(s, a) {
  const k = s.ig && s.ig.lob;
  if (!k) return 1;
  const h = s.seed | 0;
  return 1 + k * (0.1 * Math.sin(2 * a + (h % 7)) + 0.07 * Math.sin(3 * a + (h % 11) * 0.7) + 0.05 * Math.sin(5 * a + (h % 13) * 0.5));
}
const isleShapeKey = (s) => (s.ig ? `${Math.round((s.ig.lob || 0) * 10)}:${Math.round((s.ig.bar || 0) * 8)}:${(s.ig.lava || []).length}:${s.ig.cone || 0}:${s.ig.realm ? `${s.ig.realm.k}${Math.round((s.ig.realm.g || 0) * 4)}` : ''}` : '');
// How far out the island reaches (with its flats, its lava and its reef), for redrawing round it.
const isleReach = (world, s) => islandRadius(world, s) * Math.max(s.ig && s.ig.bar ? 2.35 : 0, isleReachK(world, s));
// (The barrier reef is drawn into the island's stamp: coast.js islandStamp.)

// ---- what it can grow ---------------------------------------------------------------------------------
const ISLE_FEATS = {
  nourish: { label: 'Nourish the beach', cur: 'pearls', max: 5, cost: (lv) => Math.round(60 * 1.6 ** lv), color: '#e8d8a8',
    note: 'sand brought in: the coast grows, though each addition yields less as open water narrows, and it holds better against surf' },
  grove: { label: 'Plant a grove', cur: 'pearls', max: 5, cost: (lv) => Math.round(45 * 1.5 ** lv), color: '#7cc44c',
    note: 'trees and undergrowth of its own kind, planted now: more grows on it from here on, and it matures sooner' },
  reef: { label: 'Fringing reef', cur: 'pearls', max: 3, cost: (lv) => Math.round(80 * 1.8 ** lv), color: '#f09090',
    note: 'coral and anemones round its shore, feeding sand to its beach; at the third, a barrier reef rises offshore over the days, with a calm lagoon inside it' },
  reeds: { label: 'Reed beds', cur: 'pearls', max: 3, cost: (lv) => Math.round(70 * 1.8 ** lv), color: '#a8b860',
    note: 'lilies and waterweed round its shore: a nursery for the young, and the island builds out behind them' },
  mangrove: { label: 'Mangroves', cur: 'essence', max: 3, cost: (lv) => Math.round(25 * 1.7 ** lv), color: '#4a8a36',
    note: 'trees standing on their roots in the shallows: the young shelter among them, and the island stops washing away' },
  rookery: { label: 'Rookery', cur: 'essence', max: 3, cost: (lv) => Math.round(30 * 1.7 ** lv), color: '#eceeee',
    note: 'birds come to nest (terns over salt water, herons over fresh): they fish the pond, and what they leave feeds the land and pays pearls and essence each dawn' },
  pools: { label: 'Tide pools', cur: 'pearls', max: 2, cost: (lv) => Math.round(70 * 1.8 ** lv), color: '#7ac0cc',
    note: 'rock pools along its shore: shrimp, crabs, starfish and snails do well by them, plankton gathers, and seals come' },
  spring: { label: 'Spring pool', cur: 'essence', max: 1, cost: () => 60, color: '#8ad0dc',
    note: 'fresh water welling up on the summit: frogs and dragonflies are glad of it, and fireflies come at night' },
  fire: { label: 'Wake the fire', cur: 'essence', max: 3, cost: (lv) => Math.round(80 * 2 ** lv), color: '#f08020',
    note: 'a volcano under it: warm water all round draws plankton, it glows at night, and now and then it erupts: lava runs out into the water and cools to new land, past the size sand and reef can build, and the cone grows' },
  giant: { label: 'The old giant', cur: 'essence', max: 1, cost: () => 150, color: '#86704e',
    note: 'a great tree on the summit: animals near it are calmer, and birds roost in it' },
};
const ISLE_FEAT_ORDER = ['nourish', 'grove', 'reef', 'reeds', 'mangrove', 'rookery', 'pools', 'spring', 'fire', 'giant'];
const isleFeatLabel = (world, s, k) => (k === 'rookery' ? (isleSaltHere(world, s) ? 'Tern rookery' : 'Heronry') : ISLE_FEATS[k].label);
// Why a feature can't grow on this island ('' if it can).
function isleFeatWhy(world, s, k) {
  const salt = isleSaltHere(world, s), st = (s.ig && s.ig.st) || 0, kind = isleOf(s);
  if ((k === 'reef' || k === 'mangrove') && !salt) return 'it needs salt water';
  if (k === 'mangrove' && isleDeep(s)) return 'the water is too deep here for roots';
  if (k === 'reeds' && salt) return 'it needs fresh water';
  if (k === 'pools' && kind !== 'rock' && kind !== 'basalt' && st < 2) return 'it needs a rocky island, or one grown wooded';
  if (k === 'spring' && (s.stack || 1) < 3) return 'raise the island to level 3 first';
  if (k === 'fire' && kind !== 'basalt' && !isleDeep(s) && (s.stack || 1) < 4) return 'only an island out over the deep, a black islet, or one raised to level 4 has fire under it';
  if (k === 'giant' && st < 3) return 'it has to grow into a forest first';
  return '';
}
function growIsleFeat(world, s, k) {
  const F = ISLE_FEATS[k], lv = isleLv(s, k);
  if (lv >= F.max || isleFeatWhy(world, s, k)) return false;
  const c = F.cost(lv);
  if (!pay(world, F.cur, c, 'build')) { if (typeof notEnough === 'function') notEnough(c, F.cur); return false; }
  s.worth = (s.worth || 0) + c * (F.cur === 'essence' ? WORTH.essence : 1);
  isleSetFeat(world, s, k, lv + 1, true);
  return true;
}
function isleSetFeat(world, s, k, lv, bought) {
  const G = isleG(s), salt = isleSaltHere(world, s), name = isleName(s);
  G.f[k] = lv;
  let reshape = false;
  if (k === 'nourish') { G.sz = Math.min(ISLE_SZ_MAX, (G.sz || 1) + 0.1); reshape = true; }
  if (k === 'grove') plantGrove(world, s, 3 + 2 * lv);
  if (k === 'reef' || k === 'reeds') isleShorePlants(world, s, 3 + 2 * lv);
  if (k === 'reef' && lv >= 3 && !G.bar) { G.bar = 0.05; reshape = true; }
  if (k === 'fire') G.erupt = world.t; // (it wakes with a show)
  const say = {
    nourish: `Sand brought to ${name}: it has grown (${lv} of 5)`,
    grove: `A grove planted on ${name} (${lv} of 5)`,
    reef: lv === 1 ? `✦ Coral has begun to grow round ${name}: a fringing reef` : lv >= 3 ? `✦ The reef round ${name} has grown thick: a barrier reef will rise offshore over the days` : `The reef round ${name} has grown (${lv} of 3)`,
    reeds: lv === 1 ? `✦ Reeds and lilies have taken hold round ${name}` : `The reed beds round ${name} have spread (${lv} of 3)`,
    mangrove: lv === 1 ? `✦ Mangroves have rooted in the shallows of ${name}` : `The mangroves round ${name} have spread (${lv} of 3)`,
    rookery: lv === 1 ? `✦ ${salt ? 'Terns have' : 'Herons have'} begun to nest on ${name}` : `The ${salt ? 'rookery' : 'heronry'} on ${name} has grown (${lv} of 3)`,
    pools: lv === 1 ? `✦ Tide pools have formed in the rocks along ${name}` : `More tide pools along ${name}`,
    spring: `✦ A spring has broken out on the summit of ${name}: a pool of fresh water`,
    fire: lv === 1 ? `✦ The fire under ${name} has woken: smoke rises from a vent at its heart` : `The fire under ${name} burns hotter (${lv} of 3)`,
    giant: `✦ A great tree stands on the summit of ${name}: the old giant`,
  }[k];
  if (say && typeof logEvent === 'function' && !world.observe) logEvent(world, say + (bought ? '' : ', all of its own accord'), null, { cat: bought ? 'pond' : 'life', pri: say.startsWith('✦') ? 2 : 1 });
  if (reshape && world.shore && typeof makeShore === 'function') makeShore(world);
  if (typeof landRebake === 'function') landRebake(world, s.x, s.y, isleReach(world, s) + 8);
  if (typeof queueJob === 'function' && typeof paintMinimapBackground === 'function') queueJob(() => paintMinimapBackground());
}
// A grove: its own kind of growth, planted at once and part grown.
function plantGrove(world, s, n) {
  const K = ISLE_KINDS[isleOf(s)], fl = s.flora || (s.flora = []), R = islandRadius(world, s), day = world.days;
  const w = { ...K.flora };
  isleFloraWeights(s, w);
  for (let k = 0, tries = 0; k < n && tries < n * 8; tries++) {
    const a = rand(0, TAU), d = Math.sqrt(Math.random()) * R * isleOutline(world, s, a) * 0.8, x = Math.cos(a) * d, y = Math.sin(a) * d;
    if (!islandDryGround(world, s, s.x + x, s.y + y)) continue;
    if (fl.some((f) => (f.x - x) ** 2 + (f.y - y) ** 2 < 12)) continue;
    const t = pickWeighted(w), big = ['palm', 'willow', 'pine', 'cycad'].includes(t);
    fl.push({ t, x: +x.toFixed(1), y: +y.toFixed(1), b: day, span: rand(big ? 24 : 8, big ? 50 : 20), g: 0.4, gs: 0.25, s: randi(0, 9999) });
    k++;
  }
}
// Living plants round its shore, in water that stays water: coral and anemones in salt, lilies and weed in fresh.
function isleShorePlants(world, s, n) {
  const salt = isleSaltHere(world, s), R = islandRadius(world, s), kinds = salt ? ['coral', 'coral', 'anemone', 'urchin'] : ['eelgrass', 'weed', 'lily', 'lily'];
  let made = 0;
  for (let k = 0; k < n * 10 && made < n; k++) {
    const a = rand(0, TAU), d = R * rand(1.15, 1.9) * isleOutline(world, s, a), x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d;
    if (x < 6 || y < 6 || x > world.W - 6 || y > world.H - 6 || shoreAt(world, x, y) > world.tide.level - 0.12) continue;
    const kind = pick(kinds), list = kind === 'lily' ? world.pads : world.plants;
    if (list.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 36)) continue;
    const p = sprouting(makePlant(kind, world, x, y), 0.3);
    p.born = world.days;
    list.push(p);
    made++;
  }
  return made;
}
const isleShoreCount = (world, s, R) => [...world.plants, ...world.pads].filter((p) => { const d = Math.hypot(p.x - s.x, p.y - s.y); return d > R * 1.05 && d < R * 2.1; }).length;

// ---- each dawn ----------------------------------------------------------------------------------------
function dawnIsles(world) {
  if (!world.W || world.observe) return;
  for (const s of (world.structures || []).filter((q) => q.kind === 'island' && !q.anim)) {
    const G = isleG(s), age = (world.days || 0) - (s.born || 0), R = islandRadius(world, s), salt = isleSaltHere(world, s), name = isleName(s);
    const m = typeof landMean === 'function' ? landMean(world, s.x, s.y, R * 1.6) : { life: 0 };
    // Growing up.
    const st = isleStageFor(world, s, m);
    if (st > (G.st || 0)) {
      G.st = st;
      if (typeof logEvent === 'function') logEvent(world, `${st >= 3 ? '✦ ' : ''}${capFirst(name)} is ${ISLE_STAGES[st].word} now: ${ISLE_STAGES[st].note}`, null, { cat: 'life', pri: st >= 3 ? 2 : 1 });
      if (st === 4 && typeof narrate === 'function') narrate(world, 'island', { level: s.stack || 1 });
    }
    // Its coastline wanders as it ages.
    G.lob = +clamp((age - 2) / 40, 0, 1).toFixed(2);
    // Its size drifts toward what its water allows: built out by shelter and life, worn by the surf.
    const mang = isleLv(s, 'mangrove'), reef = isleLv(s, 'reef'), hold = Math.max(0.2, 1 - 0.25 * mang - 0.2 * (G.bar || 0) - 0.06 * isleLv(s, 'nourish'));
    const surf = ((typeof TIDE_RANGE === 'object' && TIDE_RANGE[world.opts.habitat]) || 0.75) * (salt ? 0.005 : 0.003) * (isleDeep(s) ? 1.4 : 1) * hold;
    const build = 0.003 * (1 + 1.5 * (m.life || 0)) + 0.003 * mang + 0.002 * reef + 0.0015 * isleLv(s, 'reeds') + 0.002 * isleLv(s, 'nourish');
    let d = 0.02 * (1 + 0.3 * isleLv(s, 'fire') - (G.sz || 1)) + build - surf; // (a volcano's island settles bigger)
    if (Math.random() < (salt ? 0.025 : 0.01)) {
      d -= rand(0.03, 0.07) * hold;
      if (typeof logEvent === 'function') logEvent(world, `A storm took a bite out of ${name}${hold < 0.7 ? ' (the mangroves and the reef broke the worst of it)' : ''}; it will build back slowly`, null, { cat: 'pond', pri: 1 });
    }
    const fire = isleLv(s, 'fire');
    if (fire && Math.random() < 0.06 * fire) d += isleErupt(world, s, G, fire, R, name);
    // (A volcano's island can grow past what sand and reef could build: the cap rises with its fire, and what it has
    // grown is held; the surf only wears it back toward that.)
    const cap = ISLE_SZ_MAX + 0.35 * fire;
    G.sz = +clamp((G.sz || 1) + d, ISLE_SZ_MIN, Math.max(cap, fire ? G.sz || 1 : 0)).toFixed(3);
    // Things that arise on it of their own accord (one at a time).
    isleNatural(world, s, G, age, salt);
    // A barrier reef, once the reef is thick, rises over about ten days.
    if (reef >= 3 && (G.bar || 0) < 1) {
      G.bar = Math.min(1, (G.bar || 0) + 0.1);
      if (G.bar >= 1 && typeof logEvent === 'function') logEvent(world, `✦ A barrier reef has risen round ${name}: its crest bares at low tide, and the lagoon inside it is calm`, null, { cat: 'rare', pri: 2 });
    }
    // The reef and the reed beds fill in round its shore.
    const shoreLv = reef || isleLv(s, 'reeds');
    if (shoreLv && isleShoreCount(world, s, R) < 3 + 4 * shoreLv) isleShorePlants(world, s, 2);
    // Birds, trees, pools and fire mark the land; the rookery pays.
    const cells = R / LAND_CELL + 1;
    if (typeof landAdd === 'function') {
      const rk = isleLv(s, 'rookery');
      if (rk) { landAdd(world, s.x, s.y, 'life', 0.03 * rk, cells); landAdd(world, s.x, s.y, 'bone', 0.01 * rk, cells); }
      if (mang) landAdd(world, s.x, s.y, 'life', 0.03 * mang, cells + 1);
      if (isleLv(s, 'giant')) landAdd(world, s.x, s.y, 'life', 0.04, cells);
      if (isleLv(s, 'spring') || isleLv(s, 'pools')) landAdd(world, s.x, s.y, 'life', 0.02, cells);
      if (fire) landAdd(world, s.x, s.y, 'ancient', 0.02 * fire, cells);
    }
    const rk = isleLv(s, 'rookery');
    if (rk) {
      const got = typeof award === 'function' ? award(world, 3 * rk, 'the rookery', null, { flat: true }) : 0, ess = typeof gainEssence === 'function' ? gainEssence(world, rk, 'the rookery') : 0;
      if ((got || ess) && typeof logEvent === 'function') logEvent(world, `What the birds leave on ${name} feeds the land: +${got} pearls, +${ess} essence`, null, { cat: 'pond', pri: 0 });
    }
  }
}
// An eruption: a tongue of lava runs out into the water (where there's room) and cools to new land; the cone grows.
function isleErupt(world, s, G, fire, R, name) {
  G.erupt = world.t;
  const lava = G.lava || (G.lava = []);
  let flow = null;
  for (let tries = 0; tries < 8 && !flow; tries++) {
    const a = rand(-PI, PI), len = rand(0.18, 0.4) * (1 + 0.25 * fire), w = rand(0.28, 0.55), reach = R * (isleOutline(world, s, a) + len) + 6;
    const ex = s.x + Math.cos(a) * reach, ey = s.y + Math.sin(a) * reach;
    if (ex < 10 || ey < 10 || ex > world.W - 10 || ey > world.H - 10) continue;
    if ((world.structures || []).some((q) => q !== s && Math.hypot(q.x - ex, q.y - ey) < (q.kind === 'island' ? islandRadius(world, q) : STRUCTURES[q.kind].size) + 8)) continue;
    flow = { a: +a.toFixed(3), len: +len.toFixed(3), w: +w.toFixed(3), d: +(world.days || 0).toFixed(2) };
  }
  G.cone = Math.min(ISLE_CONE_MAX, (G.cone || 0) + 1);
  if (typeof landAdd === 'function') landAdd(world, s.x, s.y, 'ancient', 0.06, R / LAND_CELL + 1);
  if (!flow) { if (typeof logEvent === 'function') logEvent(world, `✦ The fire under ${name} erupted: ash and fire thrown up, and the cone has grown`, null, { cat: 'rare', pri: 2 }); return 0.02; }
  lava.push(flow);
  if (lava.length > ISLE_LAVA_MAX) lava.shift(); // (the oldest has long since become the island)
  if (typeof logEvent === 'function') logEvent(world, `✦ The fire under ${name} erupted: lava ran out into the water and cooled to new black rock, and the cone has grown`, null, { cat: 'rare', pri: 2 });
  return 0.02 + 0.015 * fire;
}
function isleNatural(world, s, G, age, salt) {
  const kind = isleOf(s), st = G.st || 0, f = G.f;
  const maybe = (k, p) => { if (f[k] || isleFeatWhy(world, s, k) || Math.random() >= p) return false; isleSetFeat(world, s, k, 1, false); return true; };
  if (salt && kind === 'coral' && age >= 4 ? maybe('reef', 0.12) : salt && st >= 2 && maybe('reef', 0.03)) return;
  if (!salt && age >= 3 && maybe('reeds', 0.08)) return;
  if (salt && st >= 2 && maybe('mangrove', 0.04)) return;
  if (st >= 2 && maybe('rookery', 0.05)) return;
  if ((kind === 'rock' || kind === 'basalt') && age >= 4 ? maybe('pools', 0.08) : st >= 3 && maybe('pools', 0.03)) return;
  if (st >= 3 && maybe('spring', 0.04)) return;
  if (kind === 'basalt' && isleDeep(s) && age >= 10 && maybe('fire', 0.02)) return;
  if (st >= 4) maybe('giant', 0.06);
}

// ---- what it does, every couple of seconds -------------------------------------------------------------
const ISLE_POOL_KINDS = new Set(['shrimp', 'crab', 'starfish', 'snail', 'hermit', 'isopod', 'amphipod']);
let isleClock = 0;
function updateIsles(world, dt) {
  if (!world.W || (isleClock -= dt) > 0) return;
  isleClock = 2;
  isleEffects(world);
  isleLifeTick(world);
}
function isleEffects(world) {
  for (const s of world.structures || []) {
    if (s.kind !== 'island' || !s.ig || s.anim) continue;
    const f = s.ig.f || {}, R = islandRadius(world, s), young = (f.mangrove || 0) + (f.reeds || 0), pools = f.pools || 0, giant = f.giant || 0, spring = f.spring || 0, fire = f.fire || 0, bar = s.ig.bar || 0;
    if (!(young || pools || giant || spring || fire || bar)) continue;
    const R2 = (R * 2.2) ** 2;
    for (const c of world.creatures) {
      if (!c.life || (c.x - s.x) ** 2 + (c.y - s.y) ** 2 > R2) continue;
      let k = 0.006 * giant + 0.004 * bar;
      if (young && c.life.scale < 0.7) k += 0.008 * young;
      if (pools && ISLE_POOL_KINDS.has(c.species)) k += 0.01 * pools;
      if (spring && (c.species === 'frog' || c.species === 'tadpole' || c.species === 'dragonfly')) k += 0.015;
      if (k) c.life.comfort = Math.min(1, c.life.comfort + k);
    }
    // Plankton about the pools and in the warm water off a vent.
    if ((pools || fire) && Math.random() < 0.08 * pools + 0.12 * fire && typeof Food === 'function') {
      const a = rand(0, TAU), d = R * rand(1.1, 1.8), x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d;
      if (typeof aquaticFoodRoom === 'function' && aquaticFoodRoom(world, x, y)) world.food.push(new Food(x, y, rand(4, 26), 'plankton'));
    }
    // Fireflies about a spring at night.
    if (spring && world.darkness > 0.5 && typeof Firefly === 'function' && Math.random() < 0.3) {
      const near = world.creatures.filter((c) => c.species === 'firefly' && (c.x - s.x) ** 2 + (c.y - s.y) ** 2 < R2).length;
      if (near < 4) { const ff = new Firefly(world, s.x + rand(-R, R) * 0.6, s.y + rand(-R, R) * 0.6); ff.alpha = 0; world.creatures.push(ff); }
    }
  }
}

// ---- life on it ---------------------------------------------------------------------------------------
const isleZ = (s, x, y) => (typeof islandTopAt === 'function' ? islandTopAt(s, x - s.x, y - s.y) : 0);
function isleSpot(world, s, k = 0.6) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * islandRadius(world, s) * k; return [s.x + Math.cos(a) * d, s.y + Math.sin(a) * d]; }
// Its beach along a bearing: out from the middle to the water, then a step back. [dry x, y, water x, y]
function isleBeach(world, s, a) {
  const R = islandRadius(world, s);
  for (let d = R * 0.5; d < R * 2.4; d += 1) {
    const x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d;
    if (x < 2 || y < 2 || x > world.W - 2 || y > world.H - 2) return null;
    if (shoreAt(world, x, y) < world.tide.level + 0.01) return [s.x + Math.cos(a) * (d - 2), s.y + Math.sin(a) * (d - 2), s.x + Math.cos(a) * (d + 8), s.y + Math.sin(a) * (d + 8)];
  }
  return null;
}
function isleWater(world, x, y, R) {
  for (let k = 0; k < 16; k++) { const a = rand(0, TAU), d = rand(R * 0.3, R), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; if (px > 4 && py > 4 && px < world.W - 4 && py < world.H - 4 && shoreAt(world, px, py) < world.tide.level - 0.08) return [px, py]; }
  return null;
}

class Tern extends Creature {
  constructor(world, s) {
    super(world, s.x, s.y);
    Object.assign(this, { species: 'tern', ambient: true, noGrab: true, isle: s.seed, act: 'nest', flap: rand(0, TAU), turn: rand(0.5, 0.9) * (Math.random() < 0.5 ? -1 : 1), fish: 0 });
    this.roost = isleSpot(world, s, 0.6);
    [this.x, this.y] = this.roost;
    this.body = new Chain(this.x, this.y, this.heading, [1.4, 1.8], [0.9, 1.3, 0.9], PI / 4);
    this.id = newId(outlineOf(IM.tern));
    this.z = isleZ(s, this.x, this.y) + 1.4; this.timer = rand(1, 8);
  }
  update(dt, world) {
    const s = isleBySeed(world, this.isle);
    if (!s) { this.gone = true; return; }
    this.timer -= dt;
    const day = world.darkness < 0.45;
    let gx = 0, gy = 0, want = 0, zt = this.z, rate = 1.5;
    if (this.act === 'nest') {
      [this.x, this.y] = this.roost; zt = isleZ(s, this.x, this.y) + 1.4; this.speed = 0;
      if (this.timer <= 0) { this.timer = rand(6, 16); if (day && Math.random() < 0.6) { this.act = 'fly'; this.timer = rand(8, 20); } }
    } else if (this.act === 'fly') {
      // Wheeling over the island and the water round it.
      this.heading += this.turn * dt;
      gx = Math.cos(this.heading) + (s.x - this.x) * 0.012; gy = Math.sin(this.heading) + (s.y - this.y) * 0.012;
      want = 26; zt = 55 + 8 * Math.sin(world.t * 0.5 + this.phase);
      if (this.timer <= 0) {
        const p = day && Math.random() < 0.65 && isleWater(world, this.x, this.y, 70);
        if (p) { this.act = 'dive'; [this.tx, this.ty] = p; this.timer = 12; } else this.act = 'home';
      }
    } else if (this.act === 'dive') {
      gx = this.tx - this.x; gy = this.ty - this.y;
      const d = Math.hypot(gx, gy);
      want = 30; zt = d > 14 ? 50 : 1; rate = d > 14 ? 1.5 : 4;
      if ((d < 3 && this.z < 6) || this.timer <= 0) { if (typeof addRipple === 'function') addRipple(world, this.x, this.y, 0.6); this.fish = world.t + 6; this.act = 'fly'; this.timer = rand(4, 9); }
    } else {
      gx = this.roost[0] - this.x; gy = this.roost[1] - this.y;
      const d = Math.hypot(gx, gy);
      want = Math.min(26, d * 1.5 + 4); zt = d > 20 ? 45 : isleZ(s, ...this.roost) + 1.4 + d;
      if (d < 1.5) { this.act = 'nest'; this.timer = rand(8, 20); }
    }
    this.z += (zt - this.z) * Math.min(1, dt * rate);
    if (want > 0) {
      const gl = Math.hypot(gx, gy) || 1;
      this.turnToward(Math.atan2(gy / gl, gx / gl), 3, dt);
      this.speed += (want - this.speed) * Math.min(1, dt * 3);
      this.x += Math.cos(this.heading) * this.speed * dt; this.y += Math.sin(this.heading) * this.speed * dt;
    }
    if (this.act !== 'nest') this.flap += dt * 12;
    this.body.resolve(this.x, this.y, this.heading);
  }
  draw(r, t, world) {
    const b = this.body, z = this.z, id = this.id, h = b.a[1];
    if (this.act !== 'nest') {
      const beat = Math.sin(this.flap), span = 6 * (0.75 + 0.25 * Math.cos(this.flap));
      for (const sd of [-1, 1]) {
        const a = h + sd * (PI / 2 + 0.3 + 0.2 * beat), ex = b.x[1] + Math.cos(a) * span * 0.5, ey = b.y[1] + Math.sin(a) * span * 0.5, a2 = a + sd * 0.45;
        r.tube(b.x[1], b.y[1], 0.8, z + 0.3, ex, ey, 0.6, z + 0.5 + beat * 0.4, 0.5, IM.tern, id);
        r.tube(ex, ey, 0.6, z + 0.5 + beat * 0.4, ex + Math.cos(a2) * span * 0.55, ey + Math.sin(a2) * span * 0.55, 0.25, z + 0.6 + beat * 0.8, 0.5, (u) => (u > 0.7 ? IM.ternTip : IM.tern), id);
      }
    }
    this.drawSpine(r, 0, b.n - 1, z, 0.9, IM.tern, id);
    const tl = b.n - 1, ta = b.a[tl] + PI;
    for (const sd of [-1, 1]) r.tube(b.x[tl], b.y[tl], 0.35, z, b.x[tl] + Math.cos(ta + sd * 0.35) * 2.2, b.y[tl] + Math.sin(ta + sd * 0.35) * 2.2, 0.2, z, 0.5, IM.tern, id);
    const hx = b.x[0], hy = b.y[0], ha = b.a[0];
    r.dot(hx, hy, z + 1.1, IM.cap, id);
    r.tube(hx + Math.cos(ha) * 0.6, hy + Math.sin(ha) * 0.6, 0.3, z + 0.9, hx + Math.cos(ha) * 2.4, hy + Math.sin(ha) * 2.4, 0.2, z + 0.6, 0.5, IM.bill, id);
    if (this.fish > ((world && world.t) || 0)) r.dot(hx + Math.cos(ha) * 2.7, hy + Math.sin(ha) * 2.7, z + 0.5, IM.fish, id);
  }
  doing() { return { nest: 'sitting on its nest', fly: 'wheeling over the water', dive: 'diving for a fish', home: 'flying home to its nest' }[this.act]; }
  note() { return 'A tern from the island’s rookery: it nests there, fishes the pond with a dive, and what the rookery leaves feeds the land and pays each dawn.'; }
}

class Heron extends Creature {
  constructor(world, s) {
    super(world, s.x, s.y);
    Object.assign(this, { species: 'heron', ambient: true, noGrab: true, isle: s.seed, act: 'stand', flap: 0, strike: 0, zb: 0 });
    this.pickStand(world, s);
    this.x = this.tx; this.y = this.ty; this.heading = this.face;
    this.body = new Chain(this.x, this.y, this.heading, [2.2], [1.6, 1.3], PI / 3);
    this.id = newId(outlineOf(IM.heron));
    this.z = 0; this.timer = rand(8, 25);
  }
  pickStand(world, s) {
    const e = isleBeach(world, s, rand(0, TAU));
    if (e) { this.tx = lerp(e[0], e[2], 0.25); this.ty = lerp(e[1], e[3], 0.25); this.face = Math.atan2(e[3] - e[1], e[2] - e[0]); this.perch = 0; }
    else { [this.tx, this.ty] = isleSpot(world, s, 0.5); this.face = rand(0, TAU); this.perch = 1; }
  }
  update(dt, world) {
    const s = isleBySeed(world, this.isle);
    if (!s) { this.gone = true; return; }
    this.timer -= dt;
    let zt = this.perch ? isleZ(s, this.x, this.y) : 0;
    if (this.act === 'stand') {
      this.turnToward(this.face, 1, dt);
      if (this.strike > 0) this.strike -= dt;
      else if (world.darkness < 0.5 && Math.random() < dt * 0.08) { this.strike = 0.6; if (Math.random() < 0.4 && typeof addRipple === 'function') addRipple(world, this.x + Math.cos(this.heading) * 4, this.y + Math.sin(this.heading) * 4, 0.3); }
      if (this.timer <= 0) { this.pickStand(world, s); this.act = 'fly'; this.timer = 20; }
    } else {
      const gx = this.tx - this.x, gy = this.ty - this.y, d = Math.hypot(gx, gy), v = Math.min(16, d * 1.2 + 3);
      this.turnToward(Math.atan2(gy, gx), 2, dt);
      this.x += Math.cos(this.heading) * v * dt; this.y += Math.sin(this.heading) * v * dt;
      zt = d > 10 ? 22 : zt + d;
      this.flap += dt * 5;
      if (d < 1.5 || this.timer <= 0) { this.act = 'stand'; this.timer = rand(15, 40); }
    }
    this.zb += (zt - this.zb) * Math.min(1, dt * 2); this.z = this.zb;
    this.body.resolve(this.x, this.y, this.heading);
  }
  draw(r) {
    const b = this.body, id = this.id, h = this.heading, z = this.zb, bx = b.x[1], by = b.y[1];
    if (this.act === 'fly') {
      const beat = Math.sin(this.flap);
      for (const sd of [-1, 1]) { const a = h + sd * (PI / 2 + 0.15 * beat); r.tube(bx, by, 1.2, z + 1, bx + Math.cos(a) * 8, by + Math.sin(a) * 8, 0.6, z + 1.5 + beat, 0.5, IM.heron, id); }
    } else for (const sd of [-1, 1]) r.tube(bx + Math.cos(h + sd * PI / 2) * 0.6, by + Math.sin(h + sd * PI / 2) * 0.6, 0.3, z + 4.5, bx + Math.cos(h + sd * PI / 2) * 0.8, by + Math.sin(h + sd * PI / 2) * 0.8, 0.25, z, 0.5, IM.heronBill, id);
    const bz = this.act === 'fly' ? z : z + 4.5;
    r.ellipsoid(bx, by, 2.4, 1.5, h, bz, 1.6, IM.heron, id);
    const reach = this.act === 'fly' ? 1.5 : 3 + this.strike * 4, hx = bx + Math.cos(h) * reach, hy = by + Math.sin(h) * reach, hz = this.act === 'fly' ? z + 0.8 : z + 8 - this.strike * 3;
    r.tube(bx + Math.cos(h) * 1.4, by + Math.sin(h) * 1.4, 0.55, bz + 1, hx, hy, 0.5, hz, 0.8, IM.heron, id);
    r.dot(hx, hy, hz + 0.4, IM.heron, id);
    r.tube(hx, hy, 0.3, hz, hx + Math.cos(h) * 2.6, hy + Math.sin(h) * 2.6, 0.18, hz - 0.4, 0.5, IM.heronBill, id);
  }
  doing() { return this.act === 'fly' ? 'flying low over the water' : this.strike > 0 ? 'striking at a fish' : 'standing still in the shallows'; }
  note() { return 'A heron from the island’s heronry: it stands still at the water’s edge, strikes at fish, and what the heronry leaves feeds the land and pays each dawn.'; }
}

class IsleLizard extends Creature {
  constructor(world, s, marine) {
    super(world, s.x, s.y);
    Object.assign(this, { species: marine ? 'iguana' : 'skink', ambient: true, noGrab: true, isle: s.seed, act: 'bask', marine, step: 0 });
    [this.x, this.y] = isleSpot(world, s, 0.65);
    const k = marine ? 1.25 : 0.85;
    this.body = new Chain(this.x, this.y, this.heading, [1.2, 1.3, 1.3, 1.3, 1.2, 1.1].map((v) => v * k), [0.9, 1.1, 1.3, 1.0, 0.8, 0.5, 0.3].map((v) => v * k), PI / 6);
    this.id = newId(outlineOf(marine ? IM.iguana : IM.skink));
    this.timer = rand(4, 20); this.z = isleZ(s, this.x, this.y) + 0.6;
  }
  update(dt, world) {
    const s = isleBySeed(world, this.isle);
    if (!s) { this.gone = true; return; }
    this.timer -= dt;
    let want = 0;
    if (this.act === 'walk') {
      const gx = this.tx - this.x, gy = this.ty - this.y, d = Math.hypot(gx, gy);
      this.turnToward(Math.atan2(gy, gx), 4, dt);
      want = d > 1 ? (this.marine ? 5 : 8) : 0;
      if (d < 1 || this.timer <= 0) { this.act = 'bask'; this.timer = rand(8, 30); }
    } else if (this.timer <= 0) {
      if (world.darkness < 0.5) { [this.tx, this.ty] = isleSpot(world, s, 0.65); this.act = 'walk'; this.timer = 8; } else this.timer = rand(10, 20);
    }
    this.speed = want;
    this.x += Math.cos(this.heading) * want * dt; this.y += Math.sin(this.heading) * want * dt;
    this.step += want * dt;
    this.z = isleZ(s, this.x, this.y) + 0.6;
    this.body.resolve(this.x, this.y, this.heading);
  }
  draw(r) {
    const b = this.body, z = this.z, id = this.id, m = this.marine ? IM.iguana : IM.skink, st = Math.sin(this.step * 2.5);
    this.drawSpine(r, 0, b.n - 1, z, 0.6, m, id);
    for (const [i, off] of [[1, 1], [3, -1]]) for (const sd of [-1, 1]) {
      const a = b.a[i] + sd * (PI / 2) - 0.4 * off * st, L = 1.8 * (this.marine ? 1.25 : 0.85);
      r.tube(b.x[i], b.y[i], 0.35, z, b.x[i] + Math.cos(a) * L, b.y[i] + Math.sin(a) * L, 0.3, z - 0.3, 0.6, m, id);
    }
    if (this.marine) for (let i = 1; i < 4; i++) r.dot(b.x[i], b.y[i], z + b.w[i] * 0.6 + 0.4, IM.ash, id); // (the spines down its back)
    this.drawEyes(r, 0.5, 0.3, z + 0.8, false);
  }
  doing() { return this.act === 'walk' ? 'scuttling to a better spot' : this.marine ? 'basking on the rocks, warming up' : 'basking in the sun'; }
  note() { return this.marine ? 'A marine iguana: it lives on the island, basks on its rocks to warm up, and grazes the weed in the shallows.' : 'A skink: it lives on the island and basks in the sun.'; }
}

class Seal extends Creature {
  constructor(world, s) {
    super(world, s.x, s.y);
    Object.assign(this, { species: 'seal', ambient: true, noGrab: true, isle: s.seed, act: 'haul', zb: 1.5, heave: 0, orbit: Math.random() < 0.5 ? 1 : -1 });
    const e = isleBeach(world, s, rand(0, TAU));
    if (e) { [this.x, this.y] = e; this.heading = Math.atan2(e[3] - e[1], e[2] - e[0]) + PI; } else [this.x, this.y] = isleSpot(world, s, 0.4);
    this.body = new Chain(this.x, this.y, this.heading, [2.2, 2.6, 2.6, 2.0], [1.8, 2.6, 3.0, 2.4, 1.2], PI / 7);
    this.id = newId(outlineOf(IM.seal));
    this.timer = rand(10, 40);
  }
  update(dt, world) {
    const s = isleBySeed(world, this.isle);
    if (!s) { this.gone = true; return; }
    this.timer -= dt;
    const e = shoreAt(world, this.x, this.y), wet = e < world.tide.level - 0.02;
    let gx = 0, gy = 0, want = 0;
    if (this.act === 'haul') {
      if (this.timer <= 0) {
        const b = isleBeach(world, s, Math.atan2(this.y - s.y, this.x - s.x));
        if (b) { this.tx = b[2]; this.ty = b[3]; this.act = 'enter'; this.timer = 20; } else this.timer = 20;
      }
    } else if (this.act === 'enter') {
      gx = this.tx - this.x; gy = this.ty - this.y; want = wet ? 10 : 3;
      if (wet || this.timer <= 0) { this.act = wet ? 'swim' : 'haul'; this.timer = rand(20, 45); }
    } else if (this.act === 'swim') {
      const a = Math.atan2(this.y - s.y, this.x - s.x) + this.orbit * 0.6, R = islandRadius(world, s) * 1.9;
      gx = s.x + Math.cos(a) * R - this.x; gy = s.y + Math.sin(a) * R - this.y; want = 12;
      if (this.timer <= 0) { const b = isleBeach(world, s, rand(0, TAU)); if (b) { this.tx = b[0]; this.ty = b[1]; this.act = 'out'; this.timer = 30; } else this.timer = 10; }
    } else {
      gx = this.tx - this.x; gy = this.ty - this.y; want = wet ? 10 : 2.5;
      if (Math.hypot(gx, gy) < 1.5 || this.timer <= 0) { this.act = 'haul'; this.timer = rand(25, 70); }
    }
    if (want > 0) {
      const gl = Math.hypot(gx, gy) || 1;
      this.turnToward(Math.atan2(gy / gl, gx / gl), wet ? 2.5 : 1.2, dt);
      const pull = wet ? 1 : 0.3 + 0.7 * Math.max(0, Math.sin(this.heave));
      this.speed += (want * pull - this.speed) * Math.min(1, dt * 3);
      this.heave += dt * (wet ? 3 : 2.4);
    } else this.speed *= Math.max(0, 1 - dt * 4);
    this.x = clamp(this.x + Math.cos(this.heading) * this.speed * dt, 2, world.W - 2); this.y = clamp(this.y + Math.sin(this.heading) * this.speed * dt, 2, world.H - 2);
    const zt = wet ? clamp((world.tide.level - e) * 60, 1.5, 16) : 1.5 + (isleZ(s, this.x, this.y) > 0 ? 0.5 : 0);
    this.zb += (zt - this.zb) * Math.min(1, dt * 1.5); this.z = this.zb;
    this.body.resolve(this.x, this.y, this.heading);
  }
  draw(r) {
    const b = this.body, z = this.zb, id = this.id, sw = Math.sin(this.heave);
    for (const sd of [-1, 1]) {
      const a = b.a[1] + sd * (PI / 2 + 0.4 + 0.3 * sw), sx = b.px(1, sd * PI / 2, -0.8), sy = b.py(1, sd * PI / 2, -0.8);
      r.tube(sx, sy, 0.9, z, sx + Math.cos(a) * 2.6, sy + Math.sin(a) * 2.6, 0.5, z - 0.3, 0.6, IM.seal, id);
    }
    const tl = b.n - 1, ta = b.a[tl] + PI;
    for (const sd of [-1, 1]) r.ellipsoid(b.x[tl] + Math.cos(ta + sd * 0.5) * 1.8, b.y[tl] + Math.sin(ta + sd * 0.5) * 1.8, 1.4, 0.7, ta + sd * 0.5, z, 0.5, IM.seal, id);
    this.drawSpine(r, 0, tl, z, 0.8, (u, v) => (vnoise(u * 9 + this.phase, v * 3, 5) > 0.66 ? IM.iguana : IM.seal), id);
    this.drawEyes(r, 0.9, 0.4, z + b.w[0] + 0.5, true);
  }
  doing() { return { haul: 'basking on the beach', enter: 'flopping down into the water', swim: 'swimming round the island', out: 'hauling out onto the beach' }[this.act]; }
  note() { return 'A seal: it hauls out on the island’s beach to bask, and swims round the island to fish. Bigger islands with tide pools draw more.'; }
}

const makeIsleLife = (world, s, sp) => (sp === 'tern' ? new Tern(world, s) : sp === 'heron' ? new Heron(world, s) : sp === 'seal' ? new Seal(world, s) : new IsleLizard(world, s, sp === 'iguana'));
// Who should be living on each island, and one more (or one fewer) at a time.
function isleLifeTick(world) {
  if (world.opts.life === false) return;
  const have = new Map();
  for (const c of world.creatures) if (c.ambient && c.isle != null && !c.gone) { const k = `${c.isle}|${c.species}`; have.set(k, (have.get(k) || 0) + 1); }
  for (const s of world.structures || []) {
    if (s.kind !== 'island' || s.anim) continue;
    const G = s.ig || {}, f = G.f || {}, st = G.st || 0, salt = isleSaltHere(world, s), R = islandRadius(world, s);
    const want = {
      tern: f.rookery && salt ? 2 + 3 * f.rookery : 0,
      heron: f.rookery && !salt ? 1 + f.rookery : 0,
      iguana: salt && st >= 1 ? Math.min(5, 1 + (st >> 1) + (f.pools ? 1 : 0)) : 0,
      skink: !salt && st >= 1 ? Math.min(4, 1 + (st >> 1)) : 0,
      seal: salt && st >= 2 && R >= 24 ? 1 + (st >= 4 ? 1 : 0) + (f.pools ? 1 : 0) : 0,
    };
    for (const [sp, n] of Object.entries(want)) {
      const h = have.get(`${s.seed}|${sp}`) || 0;
      if (h < n) { world.creatures.push(makeIsleLife(world, s, sp)); break; }
      if (h > n) { const c = world.creatures.find((q) => q.isle === s.seed && q.species === sp && !q.gone); if (c) c.gone = true; break; }
    }
  }
}

// ---- drawing: what's baked into the island, and what moves ------------------------------------------------
function bakeIsleFeatures(r, s, next, world) {
  const G = s.ig;
  if (!G || !G.f) return;
  const f = G.f, R = islandRadius(world, s), x0 = s.x, y0 = s.y, zAt = (ox, oy) => islandTopAt(s, ox, oy);
  const ids = new Map(), id = (m) => { if (!ids.has(m)) ids.set(m, next(m)); return ids.get(m); }, h = (a, b, c) => hash2(a, b, (s.seed % 97) + c);
  // The barrier reef's crest: coral heads along the ring.
  if ((G.bar || 0) > 0.25) {
    const n = Math.round(46 * G.bar * Math.max(1, R / 28));
    for (let k = 0; k < n; k++) {
      const a = (k + h(k, 1, 3)) / n * TAU, d = R * (1.85 + 0.25 * h(k, 5, 7)) * isleOutline(world, s, a), c = h(k, 9, 11) < 0.5 ? IM.coralA : IM.coralB, sz = 1 + h(k, 13, 17) * 1.4;
      r.ellipsoid(x0 + Math.cos(a) * d, y0 + Math.sin(a) * d, sz, sz * 0.8, a, 0, sz * 0.9, c, id(c));
    }
  }
  // Mangroves: short trunks on arching roots, standing in the shallows round the shore.
  if (f.mangrove) {
    const n = 5 + 6 * f.mangrove;
    for (let k = 0; k < n; k++) {
      const a = (k + h(k, 7, 19) * 0.6) / n * TAU, d = R * (1.0 + 0.12 * h(k, 9, 23)) * isleOutline(world, s, a), tx = x0 + Math.cos(a) * d, ty = y0 + Math.sin(a) * d, ht = 5 + 2 * h(k, 13, 29);
      for (let j = 0; j < 5; j++) { const b = a + (j - 2) * 0.6, rl = 2.5 + h(k, j, 31) * 1.5; r.tube(tx, ty, 0.35, ht * 0.5, tx + Math.cos(b) * rl, ty + Math.sin(b) * rl, 0.3, 0, 0.8, IM.root, id(IM.root)); }
      r.tube(tx, ty, 0.6, ht * 0.45, tx, ty, 0.5, ht, 0.9, IM.root, id(IM.root));
      for (let j = 0; j < 4; j++) { const b = j / 4 * TAU + a, cr = 2.2 + h(k, j, 37); r.ellipsoid(tx + Math.cos(b) * 1.8, ty + Math.sin(b) * 1.8, cr, cr * 0.8, b, ht - 0.5, 1.8, IM.mangrove, id(IM.mangrove)); }
    }
  }
  // Tide pools: rims of rock along the shore with water standing in them.
  if (f.pools) {
    for (let k = 0; k < 3 + 3 * f.pools; k++) {
      const a = h(k, 41, 43) * TAU, d = R * (0.8 + 0.12 * h(k, 3, 47)) * isleOutline(world, s, a), px = x0 + Math.cos(a) * d, py = y0 + Math.sin(a) * d, pr = 1.6 + h(k, 5, 53) * 1.6;
      for (let j = 0; j < 7; j++) { const b = j / 7 * TAU; r.ellipsoid(px + Math.cos(b) * pr, py + Math.sin(b) * pr, 1, 0.8, b, 0.2, 0.9, SM.stone, id(SM.stone)); }
      r.ellipsoid(px, py, pr * 0.8, pr * 0.7, a, 0.25, 0.1, IM.pool, id(IM.pool));
    }
  }
  // The rookery: nests, some with eggs, on the upper ground, and white where the birds have been.
  if (f.rookery) {
    for (let k = 0; k < 4 + 5 * f.rookery; k++) {
      const a = h(k, 29, 59) * TAU, d = R * (0.25 + 0.5 * h(k, 31, 61)), ox = Math.cos(a) * d, oy = Math.sin(a) * d, z = zAt(ox, oy);
      r.ellipsoid(x0 + ox, y0 + oy, 1.4, 1.2, a, z, 0.6, IM.nest, id(IM.nest));
      if (h(k, 3, 67) < 0.6) r.ellipsoid(x0 + ox, y0 + oy, 0.6, 0.5, a, z + 0.5, 0.5, IM.egg, id(IM.egg));
      for (let j = 0; j < 3; j++) r.ellipsoid(x0 + ox + (h(k, j, 71) - 0.5) * 5, y0 + oy + (h(k, j, 73) - 0.5) * 5, 0.5, 0.5, 0, z, 0.15, IM.guano, id(IM.guano));
    }
  }
  // A spring pool on the summit, with reeds round it.
  if (f.spring) {
    const ox = R * 0.26, oy = -R * 0.22, z = zAt(ox, oy), pr = 3 + 0.4 * (s.stack || 1); // (off the summit's middle, where fire or a giant may stand)
    r.ellipsoid(x0 + ox, y0 + oy, pr + 1, (pr + 1) * 0.85, 0.3, z, 0.15, IM.mud, id(IM.mud));
    r.ellipsoid(x0 + ox, y0 + oy, pr, pr * 0.85, 0.3, z + 0.1, 0.1, IM.pool, id(IM.pool));
    if (typeof FLORA === 'object') for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; withSeed(`spring/${s.seed}/${k}`, () => FLORA.reed(r, x0 + ox + Math.cos(a) * (pr + 1), y0 + oy + Math.sin(a) * (pr + 1) * 0.85, z, 0.7, id)); }
  }
  // Lava that has run out and cooled: a tongue of black rock over the new land, out to its coast, rubble on it.
  for (const [i, L] of (G.lava || []).entries()) {
    const o = typeof world === 'undefined' ? 1 : isleOutline(world, s, L.a);
    for (let j = 0; j <= 7; j++) {
      const u = j / 7, dd = R * (0.55 + (o - 0.6) * u), half = Math.max(1.5, dd * Math.sin(L.w * (1 - 0.45 * u)) * 0.8), ox = Math.cos(L.a) * dd, oy = Math.sin(L.a) * dd;
      r.ellipsoid(x0 + ox, y0 + oy, R * (o - 0.55) / 7 + 2, half, L.a, zAt(ox, oy), 0.35, SM.basalt, id(SM.basalt));
    }
    const n = Math.round(14 + L.len * R * L.w * 2.2);
    for (let k = 0; k < n; k++) {
      const u = h(k, 131 + i, 7), a = L.a + (h(k, 137 + i, 11) - 0.5) * 2 * L.w * Math.sqrt(Math.max(0, 1 - u * u)), dd = R * (0.6 + (typeof world === 'undefined' ? 1 : isleOutline(world, s, a) - 0.6) * (0.35 + 0.65 * u));
      const ox = Math.cos(a) * dd, oy = Math.sin(a) * dd, sz = 1 + 1.3 * h(k, 139 + i, 13);
      r.ellipsoid(x0 + ox, y0 + oy, sz, sz * 0.8, a + k, zAt(ox, oy), sz * 0.6, k % 3 ? IM.ash : SM.basalt, id(k % 3 ? IM.ash : SM.basalt));
    }
  }
  // The fire: a black cone at the heart, its crater dark red (it glows at night: drawIsleExtras); it grows with each eruption.
  if (f.fire) {
    const z = zAt(0, 0), cr = isleConeR(s), ht = isleConeH(s);
    for (let j = 0; j < 4; j++) { const t = j / 4, rr = lerp(cr, cr * 0.45, t); r.ellipsoid(x0, y0, rr, rr * 0.92, j, z + t * ht, ht / 4 + 0.5, IM.ash, id(IM.ash)); }
    r.ellipsoid(x0, y0, cr * 0.35, cr * 0.32, 0, z + ht + 0.3, 0.2, IM.crater, id(IM.crater));
    for (let k = 0; k < 10 + 6 * f.fire; k++) { const a = h(k, 77, 79) * TAU, d = cr + h(k, 81, 83) * R * 0.5; r.ellipsoid(x0 + Math.cos(a) * d, y0 + Math.sin(a) * d, 1.2, 0.8, a, zAt(Math.cos(a) * d, Math.sin(a) * d), 0.3, IM.ash, id(IM.ash)); }
  }
  // The old giant: many trunks rising to one great crown.
  if (f.giant) {
    const ox = -R * 0.3, oy = R * 0.22, z = zAt(ox, oy), bx = x0 + ox, by = y0 + oy, ht = 26;
    for (let j = 0; j < 6; j++) { const a = j / 6 * TAU, d = 2 + (j % 2) * 1.5; r.tube(bx + Math.cos(a) * d, by + Math.sin(a) * d, 1.1, z, bx + Math.cos(a) * 0.8, by + Math.sin(a) * 0.8, 1.0, z + ht * 0.7, 0.9, IM.giantBark, id(IM.giantBark)); }
    for (let j = 0; j < 12; j++) { const a = h(j, 3, 89) * TAU, d = h(j, 5, 97) * 9, cr = 4 + h(j, 7, 101) * 3; r.ellipsoid(bx + Math.cos(a) * d, by + Math.sin(a) * d, cr, cr * 0.85, a, z + ht * 0.65 + h(j, 9, 103) * 4, 4, IM.canopy, id(IM.canopy)); }
  }
}
const isleConeR = (s) => 4 + 2 * isleLv(s, 'fire') + 1.3 * ((s.ig && s.ig.cone) || 0), isleConeH = (s) => 4 + 3 * isleLv(s, 'fire') + 2.6 * ((s.ig && s.ig.cone) || 0);
function drawIsleExtras(r, s, t, world) {
  const G = s.ig, f = G && G.f;
  if (!f || !f.fire) return;
  const lv = f.fire, z0 = islandTopAt(s, 0, 0) + isleConeH(s) + 0.5, now = (world && world.t) || t, erupting = G.erupt != null && now - G.erupt >= 0 && now - G.erupt < 14;
  // A recent eruption sends a narrow, connected stream down the cone and over
  // the basalt tongue. Its leading edge advances for a few seconds, then the
  // stream cools from orange to scattered embers over the next day.
  const R = islandRadius(world, s);
  const lava = G.lava || [], latest = lava[lava.length - 1];
  if (latest) {
    const age = Math.max(0, (world.days || 0) - latest.d), heat = clamp(1 - age / 1.5, 0, 1);
    if (heat > 0) {
      const active = erupting && Math.abs(latest.d - (world.days || 0)) < 0.1;
      const front = active ? clamp((now - G.erupt) / 10, 0.04, 1) : 1;
      const n = 22, o = isleOutline(world, s, latest.a);
      const point = (u) => {
        const a = latest.a + Math.sin(u * 9 + s.seed) * Math.sin(PI * u) * latest.w * 0.16;
        const dd = R * (0.12 + (o - 0.19) * u), ox = Math.cos(a) * dd, oy = Math.sin(a) * dd;
        const z = islandTopAt(s, ox, oy) + 0.55 + isleConeH(s) * Math.max(0, 1 - u * 5) ** 2;
        return [s.x + ox, s.y + oy, z];
      };
      r.castShadows = false;
      for (let j = 0; j < n * front; j++) {
        const u0 = j / n, u1 = Math.min(front, (j + 1) / n), p = point(u0), q = point(u1);
        const width = 0.35 + 0.3 * heat + 0.16 * Math.sin(u0 * PI);
        r.tube(p[0], p[1], width, p[2], q[0], q[1], width * 0.96, q[2], 0.35, IM.lava, ISLE_FX_ID);
        const pulse = Math.max(0, Math.sin(t * 2.6 - u0 * 18)) ** 5;
        if (heat > 0.35 && pulse > 0.3) r.dot(q[0], q[1], q[2] + 0.12, IM.lava, ISLE_FX_ID);
      }
      r.castShadows = true;
    }
  }
  r.castShadows = false;
  // Smoke drifting up off the vent.
  const n = 4 + lv;
  for (let k = 0; k < n; k++) {
    const ph = (t * 0.18 + k / n) % 1, a = hash2(k, 3, s.seed % 61) * TAU;
    r.alpha = Math.max(0.15, 1 - ph);
    r.dot(s.x + Math.cos(a) * ph * 3 + ph * 5, s.y + Math.sin(a) * ph * 3 - ph * 2, z0 + ph * 22, IM.smoke, FX_ID);
  }
  r.alpha = 1;
  // The vent's glow at night; when it erupts, fire thrown up and falling back.
  if (erupting || (world && world.darkness > 0.3)) r.dot(s.x, s.y, z0 - 0.3, IM.lava, ISLE_FX_ID);
  if (erupting) {
    const e = (now - G.erupt) / 14;
    for (let k = 0; k < 8; k++) {
      const ph = (t * 0.65 + k / 8) % 1, a = hash2(k, 5, 7) * TAU, v = (3 + hash2(k, 9, 11) * 5) * (1 - e * 0.6);
      r.dot(s.x + Math.cos(a) * v * ph, s.y + Math.sin(a) * v * ph, z0 + 24 * ph * (1 - ph) * (1 - e * 0.7), IM.lava, ISLE_FX_ID);
    }
  }
  r.castShadows = true;
}
{ const base = DRAW.island; DRAW.island = (r, s, t, world) => { base(r, s, t, world); drawIsleExtras(r, s, t, world); }; }
// Its fire lights the night (depths.js lights, through land.js).
function isleLights(M, world, big) {
  for (const s of world.structures || []) {
    if (s.kind === 'island' && typeof realmLights === 'function') realmLights(M, world, s, big);
    const f = s.kind === 'island' && s.ig && s.ig.f;
    if (!f || !f.fire) continue;
    const hot = s.ig.erupt != null && world.t - s.ig.erupt < 14 ? 2 : 1;
    splat(M, s.x, s.y, 16 + 6 * f.fire * hot + 2 * (s.ig.cone || 0), 0xff2060ff, (0.3 + 0.12 * f.fire) * hot, 0, 0, big);
    // (Fresh lava glows where it ran.)
    for (const L of s.ig.lava || []) if ((world.days || 0) - L.d < 2) { const dd = islandRadius(world, s) * isleOutline(world, s, L.a); splat(M, s.x + Math.cos(L.a) * dd, s.y + Math.sin(L.a) * dd, 10, 0xff2060ff, 0.3 * (1 - ((world.days || 0) - L.d) / 2), 0, 0, big); }
  }
}

// ---- its card, and its line ---------------------------------------------------------------------------
function isleCardButtons(world, s, tree) {
  const salt = isleSaltHere(world, s);
  for (const k of ISLE_FEAT_ORDER) {
    const F = ISLE_FEATS[k], lv = isleLv(s, k), why = isleFeatWhy(world, s, k);
    if ((k === 'reef' || k === 'mangrove') && !salt) continue; // (not in this water at all)
    if (k === 'reeds' && salt) continue;
    const label = isleFeatLabel(world, s, k);
    tree.append(traitButton(label, F.cur, !why && lv < F.max ? F.cost(lv) : null, `${label}: ${F.note}${why ? `. Not yet: ${why}` : ''}`, !!why || lv >= F.max, () => growIsleFeat(world, s, k), pips(lv, F.max), F.color, renderObject));
  }
}
function isleStatus(world, s) {
  const G = s.ig;
  if (!G) return '';
  const feats = ISLE_FEAT_ORDER.filter((k) => k !== 'nourish' && k !== 'grove' && isleLv(s, k)).map((k) => isleFeatLabel(world, s, k).toLowerCase());
  const bar = (G.bar || 0) >= 1 ? ', and a barrier reef offshore' : G.bar > 0 ? ', and a barrier reef rising offshore' : '';
  const lava = (G.lava || []).length ? `; ${G.lava.length} lava flow${G.lava.length > 1 ? 's' : ''} have built it out, and its cone stands ${G.cone || 0} high` : '';
  const F = isleForm(world, s), flats = F.flats > 0.2 ? ' Flats round it bare at low tide.' : isleDeep(s) ? ' It stands in deep water: cliffs, no flats.' : '';
  const R0 = typeof realmOf === 'function' && realmOf(s), realm = R0 ? ` ${realmG(s) >= 0.5 ? `It has become ${REALMS[R0.k].name}` : `It is turning into ${REALMS[R0.k].name}`} (${Math.round(realmG(s) * 100)}%), with the depth and the land around it.` : '';
  return `${realm} ${capFirst(ISLE_STAGES[G.st || 0].word)}, ${Math.round((G.sz || 1) * 100)}% of its first size${feats.length ? `; ${feats.join(', ')}` : ''}${bar}${lava}.${flats}`;
}
