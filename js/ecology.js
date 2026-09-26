'use strict';
// Ecology across the map, kept on a coarse grid (ZONE px cells):
//  - aggression: predators (hungrier ones more), recent hunts, crowding and surf
//    raise it; plant cover lowers it. Aggressive water drives animals away,
//    keeps newcomers out and stops breeding.
//  - salt: in a pond with both waters, how fresh (-1) or salt (+1) each part is.
//    The sea side (the beach) starts salt and the far side fresh, like an
//    estuary; after that, fresh and salt life each pull their water their way.
//    Animals in the wrong water are uneasy and raise tempers.
// Both ease toward what's there each second, so the pond's moods drift rather than jump.

const ZONE = 32;
const DIFFICULTY = {
  fresh: { label: 'Easy', aggression: 0.06, settle: 1, points: 1, note: 'calm water and few predators' },
  salt: { label: 'Hard', aggression: 0.2, settle: 0.88, points: 1.3, note: 'surf, big tides and a busier food chain' },
  mixed: { label: 'Difficult', aggression: 0.26, settle: 0.8, points: 1.6, note: 'fresh and salt life fight over the water' },
};
const difficulty = (world) => DIFFICULTY[world.opts.habitat] || DIFFICULTY.mixed;

// Plants that pull the water fresh (-) or salt (+), and how much cover they give.
const PLANT_WATER = { marimo: -0.8, duckweed: -0.8, lily: -1, anemone: 1, coral: 1, urchin: 0.6 };
const PLANT_COVER = { weed: 0.05, eelgrass: 0.05, coral: 0.04, lily: 0.03, anemone: 0.02, marimo: 0.01, duckweed: 0.02 };

function initZones(world) {
  const cols = Math.max(1, Math.ceil(world.W / ZONE)), rows = Math.max(1, Math.ceil(world.H / ZONE)), n = cols * rows;
  world.zones = { cols, rows, aggr: new Float32Array(n), heat: new Float32Array(n), salt: new Float32Array(n), timer: 0, avg: 0 };
  updateZones(world, 0, true);
}

const zoneIndex = (z, x, y) => clamp((y / ZONE) | 0, 0, z.rows - 1) * z.cols + clamp((x / ZONE) | 0, 0, z.cols - 1);
const aggressionAt = (world, x, y) => (world.zones ? world.zones.aggr[zoneIndex(world.zones, x, y)] : 0);
function saltAt(world, x, y) {
  const h = world.opts.habitat;
  if (h === 'fresh') return -1;
  if (h === 'salt') return 1;
  return world.zones ? world.zones.salt[zoneIndex(world.zones, x, y)] : 0;
}

// A hunt leaves the water tense for a while.
function addHeat(world, x, y, v) {
  const z = world.zones;
  if (z) z.heat[zoneIndex(z, x, y)] = Math.min(1, z.heat[zoneIndex(z, x, y)] + v);
}

// Which water an animal belongs to (null: at home in both).
function waterOf(c) {
  if (c.species === 'wild') return c.sp.habitat;
  const h = SPECIES_HABITAT[c.species === 'tadpole' ? 'frog' : c.species];
  return h === 'fresh' || h === 'salt' ? h : null;
}

// How out of place an animal is where it is: 0 at home, 1 in the other water entirely.
function mismatch(world, c) {
  if (world.opts.habitat !== 'mixed') return 0;
  const w = waterOf(c);
  if (!w) return 0;
  const s = saltAt(world, c.x, c.y);
  return Math.max(0, w === 'fresh' ? s : -s);
}

const aggressionWord = (v) => (v < 0.2 ? 'calm water' : v < 0.45 ? 'tense water' : v < 0.8 ? 'hostile water' : 'a war zone');

function updateZones(world, dt, instant = false) {
  const z = world.zones;
  if (!z) return;
  z.timer -= dt;
  if (z.timer > 0 && !instant) return;
  z.timer = 1;
  const { cols, rows } = z, n = cols * rows, D = difficulty(world), mixed = world.opts.habitat === 'mixed';
  const tA = new Float32Array(n), infl = new Float32Array(n), crowd = new Uint16Array(n);
  // Deposit v into a cell and, at half strength, its neighbours.
  const put = (arr, x, y, v) => {
    const cx = clamp((x / ZONE) | 0, 0, cols - 1), cy = clamp((y / ZONE) | 0, 0, rows - 1);
    for (let j = -1; j <= 1; j++) {
      const yy = cy + j;
      if (yy < 0 || yy >= rows) continue;
      for (let i = -1; i <= 1; i++) {
        const xx = cx + i;
        if (xx >= 0 && xx < cols) arr[yy * cols + xx] += v * (i || j ? 0.35 : 1);
      }
    }
  };
  for (const c of world.creatures) {
    if (!c.life || c.leaving) continue;
    crowd[zoneIndex(z, c.x, c.y)]++;
    const G = geneBuffs(c);
    if (isPredator(c)) put(tA, c.x, c.y, (c.prey ? 0.32 : 0.16) * (c.predWeight || 1) * G.aggression);
    else if (c.species === 'clown' || c.species === 'puffer') put(tA, c.x, c.y, 0.04 * G.aggression);
    if (G.calming) put(tA, c.x, c.y, -G.calming);
    const w = mixed && waterOf(c);
    if (w) put(infl, c.x, c.y, (w === 'salt' ? 1 : -1) * G.territory);
  }
  for (const p of [...world.plants, ...world.pads]) {
    if (PLANT_COVER[p.make]) put(tA, p.x, p.y, -PLANT_COVER[p.make]);
    if (mixed && PLANT_WATER[p.make]) put(infl, p.x, p.y, PLANT_WATER[p.make]);
  }
  for (const s of world.structures || []) structureZones(world, s, put, tA, infl);
  if (mixed) {
    // Animals out of place raise tempers around them.
    for (const c of world.creatures) {
      if (!c.life || c.leaving) continue;
      const m = mismatch(world, c);
      if (m > 0.25) put(tA, c.x, c.y, 0.08 * m);
    }
  }
  const tide = world.tide, surfK = tide.surf * (world.opts.habitat === 'fresh' ? 0.05 : 0.14);
  const [nx, ny] = world.shoreN || [0, 1];
  let sum = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i, x = (i + 0.5) * ZONE, y = (j + 0.5) * ZONE;
      let a = D.aggression + tA[k] + z.heat[k] * 0.6 + Math.max(0, crowd[k] - 8) * 0.02;
      // Surf pounds the water near the waterline.
      if (world.shore) {
        const e = shoreAt(world, x, y);
        if (e > 0 && e > tide.level - 0.3 && e <= tide.level) a += surfK;
      }
      a = clamp(a, 0, 1.5);
      z.aggr[k] = instant ? a : z.aggr[k] + (a - z.aggr[k]) * 0.35;
      sum += z.aggr[k];
      z.heat[k] *= 0.9;
      if (mixed) {
        // The estuary: salt toward the beach, fresh away from it, pushed around by who lives where.
        const along = nx ? (nx > 0 ? x / world.W : 1 - x / world.W) : (ny > 0 ? y / world.H : 1 - y / world.H);
        const target = Math.tanh((along * 2 - 1) * 1.1 + infl[k] * 0.3);
        z.salt[k] = instant ? target : z.salt[k] + (target - z.salt[k]) * 0.04;
      }
    }
  }
  z.avg = sum / n;
}
