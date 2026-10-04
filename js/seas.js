'use strict';
// The seas beyond. Past the deep past the water the pond opens out into changes, and each stretch of new water
// keeps the sea it opened into (world.game.seas: [{ from, k }], from in pixels past the pond's original edge):
//  - the deep: the dark as it has always been;
//  - the other sea (from tier 12, the Starfall trench on): still dark, but split by fissures glowing violet and
//    cyan, motes of light drifting over it, and alien things drawn to it;
//  - the bright coast (from tier 15): past the alien water the floor climbs back up into warm, lit, shallow sea,
//    where islands stand with lighthouses on them and harbors round them (beacons.js), and known life returns.
// Water opened before a pond reached these keeps the sea it was (old ponds carry on as they were).

const SEA_KINDS = {
  deep: { name: 'the deep' },
  alien: { name: 'the other sea', glow: ['#b06aff', '#5af0ff', '#ff6ad8'] },
  coast: { name: 'the bright coast' },
};
const seaWanted = (world) => { const t = (world.erosion && world.erosion.tier) || 0; return t >= 15 ? 'coast' : t >= 12 ? 'alien' : 'deep'; };
const seaBands = (world) => (world.game && world.game.seas) || [];
// Just before the pond grows: if the sea it's opening into has changed, a new stretch begins here.
function noteSea(world) {
  if (!world.game) return;
  const B = world.game.seas || (world.game.seas = []), k = seaWanted(world), last = B.length ? B[B.length - 1].k : 'deep';
  if (k === last) return;
  B.push({ from: world.expandPx || 0, k });
  if (typeof logEvent === 'function') logEvent(world, k === 'alien' ? 'Beyond the drop-off the water has turned strange: light moves in fissures down there, and it is not any sea of this world'
    : k === 'coast' ? 'Past the other sea the floor is climbing: warm, clear water ahead, and a coast with lights on it' : 'The deep goes on', null, { cat: 'rare', pri: 3 });
}
// Which sea a distance past the original edge lies in.
function seaAtInto(world, into) {
  const B = seaBands(world);
  let k = 'deep', from = 0;
  for (const b of B) if (into >= b.from) { k = b.k; from = b.from; }
  return [k, from];
}
// Distance past the pond's original edge, for a point (as erosion.js measures it).
function intoOf(world) {
  const ex = world.expandPx || 0, side = world.shoreSide, axisX = deepAxisX(side), shifts = deepShifts(side), [W0, H0] = baseSize(world);
  return axisX ? (shifts ? (x) => ex - x : (x) => x - (W0 - 1)) : (shifts ? (x, y) => ex - y : (x, y) => y - (H0 - 1));
}
const seaAt = (world, x, y) => (seaBands(world).length && world.expandPx ? seaAtInto(world, intoOf(world)(x, y))[0] : 'deep');

// ---- the floor of each (erosion.js depthIn calls this last) ---------------------------------------------
// The coast's floor climbs back up from the dark over its first 400 px to warm shallows; the other sea's is split
// by glowing fissures.
function applySeas(world, depth, rect) {
  const B = seaBands(world);
  if (!B.length || !world.expandPx) return;
  const { W } = world, [x0, y0, x1, y1] = rect, into = intoOf(world), T = world.trench, seed = hashString(world.seed || 'pond') % 113;
  const first = B[0].from;
  for (let y = y0; y <= y1; y++) for (let x = x0, p = x0 + y * W; x <= x1; x++, p++) {
    const a = into(x, y);
    if (a < first) continue;
    const [k, from] = seaAtInto(world, a);
    if (k === 'coast') {
      const r = smoothstep(from, from + 400, a);
      depth[p] = Math.round(depth[p] * (1 - 0.84 * r));
      if (T && r > 0.15) T[p] = 0;
    } else if (k === 'alien') {
      // Fissures: where a slow noise field crosses its middle, a crack to the very bottom, glowing.
      const n = vnoise(x * 0.018, y * 0.018, seed) * 0.65 + vnoise(x * 0.05, y * 0.05, seed + 7) * 0.35, v = 1 - Math.abs(n - 0.5) / 0.022;
      if (v > 0 && a > from + 20) { depth[p] = 255; if (T) T[p] = Math.max(T[p], Math.round(v * 127) + 128); }
    }
  }
}

// ---- their light and colour ------------------------------------------------------------------------------
// The coast's stretches for the renderer to tint warm and clear (raster.js): which axis, and the spans of it.
function seaCoastSpans(world) {
  const B = seaBands(world);
  if (!B.some((b) => b.k === 'coast') || !world.expandPx) return null;
  const side = world.shoreSide, [W0, H0] = baseSize(world), spans = [];
  for (let i = 0; i < B.length; i++) if (B[i].k === 'coast') spans.push([B[i].from, i + 1 < B.length ? B[i + 1].from : 1e9]);
  return { axisX: deepAxisX(side), shifts: deepShifts(side), edge: (deepAxisX(side) ? W0 : H0) - 1, ex: world.expandPx, spans };
}
// The other sea's light (depths.js buildLights): motes drifting over it and glows along its fissures, set on a
// coarse grid so they stay put, pulsing slowly.
function seaLights(M, world, rect) {
  const B = seaBands(world);
  if (!B.some((b) => b.k === 'alien') || !world.expandPx || typeof splat !== 'function') return;
  const into = intoOf(world), C = 36, t = world.t || 0, seed = hashString(world.seed || 'pond') % 211, cols = SEA_KINDS.alien.glow.map(hexToInt);
  for (let gy = Math.floor(rect[1] / C); gy * C <= rect[3]; gy++) for (let gx = Math.floor(rect[0] / C); gx * C <= rect[2]; gx++) {
    const h = hash2(gx, gy, seed);
    if (h > 0.45) continue;
    const x = (gx + hash2(gx, gy, seed + 1)) * C, y = (gy + hash2(gx, gy, seed + 2)) * C;
    if (x < 0 || y < 0 || x >= world.W || y >= world.H) continue;
    const [k, from] = seaAtInto(world, into(x, y));
    if (k !== 'alien' || into(x, y) < from + 30) continue;
    const pulse = 0.55 + 0.45 * Math.sin(t * (0.4 + h) + h * 40);
    splat(M, x + Math.sin(t * 0.2 + h * 9) * 4, y + Math.cos(t * 0.17 + h * 7) * 4, 12 + 16 * h, cols[(h * 30 | 0) % cols.length], 0.6 + 0.6 * pulse, 0, 0, rect);
    M.any = true;
  }
}

// ---- the coast's islands -----------------------------------------------------------------------------------
// Each dawn, the bright coast has an island with a lighthouse on it about every 360 px of its length, set out
// across it in turn; a missing one rises (the harbor round it then fills with life, beacons.js).
function seaDawn(world) {
  const S = seaCoastSpans(world);
  if (!S || world.observe || typeof makeStructure !== 'function' || !STRUCTURES.lighthouse) return;
  const G = world.game, made = G.coastIsles || (G.coastIsles = 0), [W0, H0] = baseSize(world);
  let want = 0;
  for (const [a, b] of S.spans) want += Math.max(0, Math.floor((Math.min(b, S.ex) - a - 260) / 360) + (Math.min(b, S.ex) - a > 260 ? 1 : 0));
  if (made >= want) return;
  // The next one's place: along the coast in order, across it by its seed.
  let n = made, at = null;
  for (const [a, b] of S.spans) {
    const len = Math.min(b, S.ex) - a, k = len > 260 ? Math.floor((len - 260) / 360) + 1 : 0;
    if (n < k) { at = a + 260 + n * 360; break; }
    n -= k;
  }
  if (at == null) return;
  const cross = S.axisX ? world.H : world.W, c = cross * (0.25 + 0.5 * hash2(made, 3, hashString(world.seed || 'pond') % 97));
  const pos = S.axisX ? [S.shifts ? S.ex - at : S.edge + at, c] : [c, S.shifts ? S.ex - at : S.edge + at];
  const [x, y] = pos;
  if (x < 30 || y < 30 || x > world.W - 30 || y > world.H - 30) { G.coastIsles = made + 1; return; }
  const isle = makeStructure('island', world, x, y);
  isle.deep = Math.round(depthAt(world, x, y) * 100) / 100;
  world.structures.push(isle);
  const light = makeStructure('lighthouse', world, x + 2, y - 2);
  world.structures.push(light);
  G.coastIsles = made + 1;
  if (typeof makeShore === 'function') makeShore(world);
  if (typeof bakeBackground === 'function') bakeBackground(world);
  if (typeof paintMinimapBackground === 'function') paintMinimapBackground();
  if (typeof logEvent === 'function') logEvent(world, made ? 'Another island has come up along the bright coast, a lighthouse already on it' : 'An island has come up out of the bright coast, and there is a lighthouse on it, lit: a harbor forms round it', null, { cat: 'rare', pri: 3 });
}

// Alien arrivals lean toward the other sea, where it has opened.
if (typeof xenoSpot === 'function') {
  const xenoSpotBase = xenoSpot;
  xenoSpot = function (world) { // eslint-disable-line no-func-assign
    const B = seaBands(world);
    if (B.some((b) => b.k === 'alien') && Math.random() < 0.65) {
      const into = intoOf(world);
      for (let i = 0; i < 40; i++) {
        const x = rand(20, world.W - 20), y = rand(20, world.H - 20);
        if (seaAtInto(world, into(x, y))[0] !== 'alien' || (world.shore && isDry(world, x, y))) continue;
        if (typeof beaconCovers === 'function' && beaconCovers(world, x, y)) continue;
        return [x, y];
      }
    }
    return xenoSpotBase(world);
  };
}
