'use strict';
// Water, floors, habitats, scenery layout, food, drifting motes, and the static background bake.

const hexes = (...h) => h.map(hexToInt);

// ---- water ------------------------------------------------------------------
// fog: how much the floor takes on the water colour (fades toward the surface)
// caustic: how much of the floor the light web covers; wobble: refraction shimmer
const WATERS = {
  teal: { label: 'Teal', color: '#1b6a7c', fog: 0.34, caustic: 0.09, wobble: 1, light: '#d9fff0', mote: '#cfe8e0' },
  pond: { label: 'Pond green', color: '#35602a', fog: 0.44, caustic: 0.07, wobble: 1, light: '#efffc8', mote: '#d8d49a' },
  clear: { label: 'Clear lagoon', color: '#2ec4c4', fog: 0.26, caustic: 0.12, wobble: 1, light: '#f4ffff', mote: '#f0fbff' },
  reef: { label: 'Tropical reef', color: '#12b0cc', fog: 0.38, caustic: 0.11, wobble: 1, light: '#f0ffff', mote: '#e8f8ff' },
  deep: { label: 'Deep blue', color: '#0c2a66', fog: 0.62, caustic: 0.05, wobble: 1, light: '#b8d8ff', mote: '#a8c8f0' },
  murky: { label: 'Murky swamp', color: '#4e4628', fog: 0.7, caustic: 0.04, wobble: 1, light: '#fff0c0', mote: '#c0b080' },
};

// ---- habitats -----------------------------------------------------------------

const HABITATS = { fresh: 'Fresh', mixed: 'Both', salt: 'Salt' };
const SPECIES_HABITAT = {
  koi: 'fresh', tetra: 'fresh', axolotl: 'fresh', turtle: 'fresh', frog: 'fresh', snake: 'fresh', duck: 'fresh', dragonfly: 'fresh',
  ray: 'salt', jelly: 'salt', clown: 'salt', octopus: 'salt', starfish: 'salt',
  eel: 'both', crab: 'both', snail: 'both', shrimp: 'both', puffer: 'both', wild: 'both',
};
const fitsHabitat = (world, tag) => {
  const h = world.opts.habitat || 'mixed';
  return h === 'mixed' || !tag || tag === 'both' || tag === h;
};

// ---- floor palettes -------------------------------------------------------------

const ROCK_MATS = [
  mat('#262b36', '#414a5a', '#667084', '#98a2b4'),
  mat('#352c24', '#584838', '#806a54', '#ac967a'),
  mat('#2c3230', '#48524c', '#6c7a70', '#9aaa9c'),
];
const MOSS = mat('#18321c', '#28502a', '#3e7236', '#64984a');
const PEBBLE_MATS = [ROCK_MATS[1], mat('#5a4a36', '#86725a', '#b09c80', '#d8c8a8'), mat('#4a2a22', '#6e4032', '#965c48', '#c0846a')];
const STONES = [
  mat('#3a3e46', '#565c66', '#767d88', '#9aa2ac'), mat('#6a5436', '#8a7050', '#a88c68', '#c8ae88'),
  mat('#6a4a44', '#8a6860', '#a88a80', '#c8aca0'), mat('#8a8274', '#aaa394', '#c8c2b2', '#e6e0d0'),
  mat('#5a3222', '#7a4a32', '#9a6446', '#bc8262'), mat('#26282c', '#383b40', '#4c5056', '#686d74'),
  mat('#4a4a30', '#646444', '#80805a', '#9e9e78'),
];
const RIVER_STONES = [
  mat('#3c434a', '#56606a', '#737e88', '#96a2ac'), mat('#4a4036', '#655848', '#82735e', '#a09078'),
  mat('#3a4034', '#525a48', '#6c765e', '#8a9678'), mat('#5a5650', '#76726a', '#948f86', '#b4afa4'),
];
const LEAF_MATS = [
  mat('#3a2410', '#5a3a1a', '#7a5226', '#9c6c36'), mat('#5a2a0e', '#8a4418', '#b45e24', '#d8803a'),
  mat('#4a160e', '#721f14', '#9a2e1c', '#be4a2c'), mat('#2e3412', '#464e1c', '#606a28', '#7e8a3a'),
  mat('#5a4a14', '#86701e', '#b0962c', '#d4b848'),
];
const BARK = mat('#2a1a0e', '#3e2816', '#56381e', '#704a2a');
const SHELL_MATS = [
  mat('#9a8a70', '#bcae92', '#dcd0b4', '#f6eed8'), mat('#a86a6a', '#c88c88', '#e4aca6', '#f8d0c8'),
  mat('#a87a54', '#c89a72', '#e4b890', '#f8d8b4'), mat('#8a7a9a', '#a898b8', '#c6b8d4', '#e4daee'),
];
const RUBBLE_MATS = [mat('#a8a294', '#c8c2b2', '#e4dfd0', '#fbf8ee'), mat('#b8888a', '#d4a6a6', '#ecc4c2', '#fbe2de')];

const SAND = hexes('#86755a', '#9e8c6a', '#b4a27c', '#c8b78e', '#ddcea4');
const CORAL_SAND = hexes('#a89a7c', '#c2b596', '#d8ccae', '#e8dec4', '#f6efdc');
const RIVER_SAND = hexes('#6c6452', '#827a64', '#988e76', '#aca288', '#bfb69c');
const SOIL = hexes('#2a1f16', '#35281c', '#403024', '#4c3a2c');
const GAP = hexes('#221e18', '#2c2720', '#363028');
const TILE = hexes('#9fb6c2', '#c4d6e0', '#dce8ee', '#f4fafc');
const TILE_LANE = hexes('#0e2458', '#163272', '#20428e', '#3a5eb0');
const GROUT = hexToInt('#7e929c');

const dither = (x, y) => BAYER4[(x & 3) | ((y & 3) << 2)];
const checker = (x, y) => ((x ^ y) & 1) === 1;

// Pick between two shade levels around a threshold, checker-dithering a thin band.
function level(v, t, band, x, y) {
  if (v > t + band) return 1;
  if (v < t - band) return 0;
  return checker(x, y) ? 1 : 0;
}

// Soft dunes in three shades plus wind ripples (a light crest pixel over a shadow pixel).
const sandColor = (pal) => (x, y) => {
  const n = fbm(x * 0.016, y * 0.016, 3);
  let s = 1 + level(n, 0.45, 0.012, x, y) + level(n, 0.6, 0.012, x, y);
  if (fbm(x * 0.012 + 40, y * 0.012, 8) > 0.42) {
    const w = x * 0.55 + y * 0.84 + fbm(x * 0.025, y * 0.025, 9) * 30;
    const f = ((w / 7) % 1 + 1) % 1;
    if (f < 0.12) s += 1;
    else if (f < 0.24) s -= 1;
  }
  return pal[clamp(s, 0, 4)];
};

// Each floor has a flat base colour plus "decor": small 3D objects (pebbles,
// stones, leaves, shells) rasterized once by the same renderer as the animals,
// so they get proper lighting, outlines and shadows.
const FLOORS = {
  sand: { label: 'Sand', color: sandColor(SAND), pebbles: true, decor(d, W, H) {
    for (let i = 0; i < W * H / 900; i++) d.pebble(rand(0, W), rand(0, H), rand(0.8, 1.5), pick(STONES));
  } },

  coral: { label: 'Coral sand', color: sandColor(CORAL_SAND), decor(d, W, H) {
    for (let i = 0; i < W * H / 1600; i++) d.shell(rand(0, W), rand(0, H), rand(1.2, 2.4), pick(SHELL_MATS));
    for (let i = 0; i < W * H / 5000; i++) d.rubble(rand(0, W), rand(0, H), rand(2, 3.5), pick(RUBBLE_MATS));
  } },

  pebbles: { label: 'Pebble bed', color: (x, y) => GAP[clamp(Math.floor(fbm(x * 0.05, y * 0.05, 5) * 3 + dither(x, y) * 0.3), 0, 2)], decor(d, W, H) {
    // One pebble per 6px cell, jittered, so the bed is packed but never a grid. Colours
    // come in patches (as gravel settles) rather than confetti.
    const families = [[0, 5, 3], [1, 2, 3], [6, 0, 1], [4, 1, 2]];
    for (let gy = 0; gy < H; gy += 6) for (let gx = 0; gx < W; gx += 6) {
      const fam = families[Math.floor(vnoise(gx * 0.02, gy * 0.02, 17) * families.length * 0.999)];
      const m = STONES[Math.random() < 0.85 ? fam[randi(0, 1)] : fam[2]];
      d.pebble(gx + rand(0, 6), gy + rand(0, 6), rand(2.8, 4.2), m, 0.7);
    }
  } },

  river: { label: 'River stones', color: sandColor(RIVER_SAND), decor(d, W, H) {
    for (let gy = 0; gy < H; gy += 11) for (let gx = 0; gx < W; gx += 11) {
      if (Math.random() < 0.72) d.stone(gx + rand(0, 11), gy + rand(0, 11), rand(3.2, 6.5), pick(RIVER_STONES));
    }
    for (let i = 0; i < W * H / 500; i++) d.pebble(rand(0, W), rand(0, H), rand(0.8, 1.4), pick(STONES));
  } },

  leaves: { label: 'Leaf litter', color: (x, y) => {
    let s = 1 + level(fbm(x * 0.03, y * 0.03, 4), 0.52, 0.015, x, y);
    const crumb = vnoise(x * 0.45, y * 0.45, 7);
    if (crumb > 0.8) s = 3; else if (crumb < 0.12) s = 0;
    return SOIL[s];
  }, decor(d, W, H) {
    for (let i = 0; i < W * H / 70; i++) d.leaf(rand(0, W), rand(0, H), rand(2.4, 4.6), pick(LEAF_MATS));
    for (let i = 0; i < W * H / 2500; i++) d.twig(rand(0, W), rand(0, H));
  } },

  tiles: { label: 'Pool tiles', color(x, y) {
    const T = 8, tx = x % T, ty = y % T;
    if (tx === 0 || ty === 0) return GROUT;
    const lane = Math.floor(y / T) % 12 === 6 ? TILE_LANE : TILE;
    if (tx === 1 || ty === 1) return lane[3];
    if (tx === T - 1 || ty === T - 1) return lane[1];
    return lane[2];
  } },
};
const FLOOR_ALIASES = { gravel: 'pebbles', mud: 'leaves' }; // older saved settings

// Decor shapes, drawn into the bake raster with outline colours taken from their own palette.
function makeDecor(r, outline) {
  let nid = 1000;
  const next = (m) => { nid = nid >= 4094 ? 1000 : nid + 1; outline[nid] = mixColor(m[0], 0xff000000, 0.35); return nid; };
  const vein = (m) => [m[0], m[0], m[1], m[1]];
  return {
    pebble(x, y, a, m, dome = rand(0.5, 0.75)) { r.ellipsoid(x, y, a, a * rand(0.72, 1), rand(0, PI), 0, a * dome, m, next(m)); },
    stone(x, y, a, m) {
      const seed = randi(0, 999);
      r.ellipsoid(x, y, a, a * rand(0.6, 0.85), rand(0, PI), 0, a * rand(0.3, 0.45),
        (lx, ly, px, py) => (lx * lx + ly * ly < 0.3 && vnoise(px * 0.4, py * 0.4, seed) > 0.62 ? MOSS : m), next(m));
    },
    leaf(x, y, a, m) {
      const v = vein(m), ribs = rand(2.5, 4);
      r.ellipsoid(x, y, a, a * rand(0.35, 0.5), rand(0, TAU), rand(0, 0.8), 0.35, (lx, ly) => {
        const al = Math.abs(ly);
        if (al > 1 - lx * lx) return null; // pointed tips
        if (al < 0.14 || (((lx + al * 0.8) * ribs) % 1 + 1) % 1 < 0.12) return v;
        return m;
      }, next(m));
    },
    twig(x, y) {
      let a = rand(0, TAU), px = x, py = y;
      const id = next(BARK);
      for (let k = randi(2, 3); k > 0; k--) {
        const len = rand(3, 6), nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len;
        r.tube(px, py, 0.7, 0.6, nx, ny, 0.55, 0.6, 0.8, BARK, id);
        if (Math.random() < 0.4) {
          const b = a + rand(0.5, 1) * (Math.random() < 0.5 ? 1 : -1);
          r.tube(nx, ny, 0.55, 0.6, nx + Math.cos(b) * 2.5, ny + Math.sin(b) * 2.5, 0.45, 0.6, 0.8, BARK, id);
        }
        px = nx; py = ny; a += rand(-0.5, 0.5);
      }
    },
    shell(x, y, a, m) {
      const v = vein(m), ribs = randi(5, 9);
      r.ellipsoid(x, y, a, a * rand(0.7, 0.95), rand(0, TAU), 0, a * 0.6,
        (lx, ly) => ((((Math.atan2(ly, lx + 1.2) / PI) * ribs) % 1 + 1) % 1 < 0.2 ? v : m), next(m));
    },
    rubble(x, y, len, m) {
      const a = rand(0, TAU), id = next(m);
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      r.tube(x, y, 0.9, 0, ex, ey, 0.7, 0, 0.9, m, id);
      if (Math.random() < 0.5) r.tube(ex, ey, 0.7, 0, ex + Math.cos(a + 0.8) * len * 0.5, ey + Math.sin(a + 0.8) * len * 0.5, 0.6, 0, 0.9, m, id);
    },
  };
}

// ---- food -------------------------------------------------------------------------

// Food you drop (pellets, spirulina flakes, brine shrimp) sinks and waits on the
// floor; plankton and coral spawn drift. See FOOD_FED in life.js for what each does.
const FED_FOODS = new Set(['pellet', 'spirulina', 'brine', 'krill', 'bloodworm', 'snow', 'chum', 'offering']);

class Food {
  constructor(x, y, z = 40, kind = 'pellet') {
    this.x = x; this.y = y; this.z = z; this.kind = kind;
    this.fed = FED_FOODS.has(kind);
    this.life = this.fed ? 25 : rand(40, 70);
    this.eaten = false;
    this.ph = rand(0, TAU);
  }

  update(dt, world) {
    // A dropped ration or drifting plankton on an exposed island becomes
    // nutrients in its beach instead of drawing swimmers onto dry ground.
    if (world.shore && typeof islandAt === 'function' && islandAt(world, this.x, this.y) && isDry(world, this.x, this.y)) {
      this.eaten = true;
      if (typeof landAdd === 'function') landAdd(world, this.x, this.y, 'life', this.fed ? 0.012 : 0.004);
      return;
    }
    const cur = world.current;
    if (this.kind === 'spawn' && this.z < 42) this.z += 3.5 * dt; // coral spawn floats up
    if (this.kind === 'plankton' || this.kind === 'spawn') {
      // Drifts with the current and a lazy wobble, slowly sinking.
      if (this.kind === 'plankton') this.z = Math.max(1, this.z - 0.4 * dt);
      const nx = clamp(this.x + (cur.x * 5 + Math.sin(world.t * 0.8 + this.ph) * 1.2) * dt, 1, world.W - 1);
      const ny = clamp(this.y + (cur.y * 5 + Math.cos(world.t * 0.7 + this.ph) * 1.2) * dt, 1, world.H - 1);
      if (!aquaticFoodRoom(world, this.x, this.y)) { this.eaten = true; return; }
      if (aquaticFoodRoom(world, nx, ny)) { this.x = nx; this.y = ny; }
      this.life -= dt;
      if (this.life <= 0) { this.eaten = true; if (typeof foodToDetritus === 'function') foodToDetritus(world, this); }
      return;
    }
    if (this.kind === 'brine') { // live brine shrimp swim in little jerks as they sink
      this.x = clamp(this.x + Math.sin(world.t * 9 + this.ph * 5) * 2.5 * dt, 1, world.W - 1);
      this.y = clamp(this.y + Math.cos(world.t * 7 + this.ph * 3) * 2.5 * dt, 1, world.H - 1);
    }
    if (this.z > 0.8) {
      this.z = Math.max(0.8, this.z - (this.kind === 'snow' ? 1.2 : this.kind === 'spirulina' ? 3 : 5) * dt);
      this.x = clamp(this.x + (Math.sin(this.z * 0.7) * 1.5 + cur.x * 4) * dt, 1, world.W - 1);
      this.y = clamp(this.y + cur.y * 4 * dt, 1, world.H - 1);
    } else {
      this.life -= dt;
      if (this.life <= 0) { this.eaten = true; if (typeof foodToDetritus === 'function') foodToDetritus(world, this); }
    }
  }

  draw(r) {
    if (this.kind === 'spirulina') { r.ellipsoid(this.x, this.y, 1.1, 0.6, this.ph, this.z, 0.4, SPIRULINA_MAT, FOOD_ID); return; }
    if (this.kind === 'brine') { r.ellipsoid(this.x, this.y, 0.9, 0.5, this.ph + Math.sin(this.life * 12), this.z, 0.6, BRINE_MAT, FOOD_ID); return; }
    if (this.kind === 'krill') { r.ellipsoid(this.x, this.y, 1.2, 0.5, this.ph, this.z, 0.6, KRILL_MAT, FOOD_ID); return; }
    if (this.kind === 'bloodworm') { r.tube(this.x, this.y, 0.5, this.z, this.x + Math.cos(this.ph) * 2, this.y + Math.sin(this.ph) * 2, 0.4, this.z, 0.8, WORM_MAT, FOOD_ID); return; }
    if (this.kind === 'snow') { r.dot(this.x, this.y, this.z, SNOW_MAT, FOOD_ID); return; }
    if (this.kind === 'chum') { r.ellipsoid(this.x, this.y, 1.3, 0.9, this.ph, this.z, 0.7, CHUM_MAT, FOOD_ID); return; }
    if (this.kind === 'offering') { r.dot(this.x, this.y, this.z, OFFER_MAT, FOOD_ID); r.dot(this.x + 0.8, this.y, this.z, OFFER_MAT, FOOD_ID); return; }
    if (this.kind !== 'pellet') {
      r.alpha = Math.min(1, this.life / 5, (70 - this.life) / 2 + 0.3);
      r.dot(this.x, this.y, this.z, this.kind === 'spawn' ? SPAWN_MAT : PLANKTON_MAT, PLANKTON_ID);
      r.alpha = 1;
      return;
    }
    r.ellipsoid(this.x, this.y, 0.8, 0.8, 0, this.z, 0.8, PAL.pellet, FOOD_ID);
  }
}

const SPAWN_MAT = solid('#ffb8d8');
const SPIRULINA_MAT = mat('#1e4a1a', '#2e7a2a', '#4aa83e', '#7ed066');
const BRINE_MAT = mat('#8a3a1a', '#c8602a', '#f08a4a', '#ffc08a');
const KRILL_MAT = mat('#9a3a3a', '#d05a50', '#f88a78', '#ffc4b4'), WORM_MAT = mat('#4a0a0a', '#7a1414', '#a82020', '#d84a3a');
const SNOW_MAT = solid('#e8eef4');
const CHUM_MAT = mat('#3a0606', '#6a0e0e', '#9a1a18', '#c83a30'), OFFER_MAT = solid('#4af08a');

// ---- motes: suspended particles that make the water feel like water -----------------

const MOTE_ID = 5;
FADE[MOTE_ID] = 1;

class Motes {
  constructor(world) {
    const n = Math.round(world.W * world.H / 2600);
    this.x = Float32Array.from({ length: n }, () => rand(0, world.W));
    this.y = Float32Array.from({ length: n }, () => rand(0, world.H));
    this.z = Float32Array.from({ length: n }, () => rand(3, 42));
    this.ph = Float32Array.from({ length: n }, () => rand(0, TAU));
    this.mat = solid('#ffffff');
  }

  update(dt, world) {
    const { W, H, current: cur, t } = world;
    for (let i = 0; i < this.x.length; i++) {
      this.x[i] += (cur.x * 3 + Math.sin(t * 0.3 + this.ph[i]) * 0.8) * dt;
      this.y[i] += (cur.y * 3 + Math.cos(t * 0.27 + this.ph[i]) * 0.8) * dt;
      if (this.x[i] < 0) this.x[i] += W; else if (this.x[i] >= W) this.x[i] -= W;
      if (this.y[i] < 0) this.y[i] += H; else if (this.y[i] >= H) this.y[i] -= H;
    }
  }

  draw(r, world) {
    r.castShadows = false;
    r.alpha = 0.55;
    // From the midnight zone on, some of the snow out over the deep glows (cyan and blue in salt water, green and amber in fresh).
    const tier = (world.erosion && world.erosion.tier) || 0, glow = tier >= 2 && world.depth, t = world.t;
    if (glow && !this.glow) {
      const cols = world.opts.habitat === 'fresh' ? ['#9aff5a', '#ffd05a', '#c8ff8a'] : world.opts.habitat === 'salt' ? ['#5af0ff', '#6a9aff', '#ff6ae0'] : ['#5af0ff', '#9aff5a', '#ff6ae0'];
      this.glow = cols.map((c) => { const id = newId(hexToInt('#020608')); EMISSIVE[id] = 2; return [solid(c), id]; });
    }
    for (let i = 0; i < this.x.length; i++) {
      if (world.shore && isDry(world, this.x[i], this.y[i])) continue;
      if (glow && i % 4 === 0 && depthAt(world, this.x[i], this.y[i]) > 0.45 - 0.05 * tier) {
        if (Math.sin(t * 1.7 + this.ph[i] * 5) > 0.1) { const [m, id] = this.glow[i % this.glow.length]; r.alpha = 1; r.dot(this.x[i], this.y[i], this.z[i], m, id); r.alpha = 0.55; }
        continue;
      }
      r.dot(this.x[i], this.y[i], this.z[i], this.mat, MOTE_ID);
    }
    r.alpha = 1;
    r.castShadows = true;
  }
}

// ---- shore: a beach along one edge that the tide floods and bares ------------------
// world.shore holds the beach elevation per pixel (0 = open water, 255 = top of
// the beach). Water covers a pixel while its elevation is below the tide level.

const SHORE_SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // left, right, top, bottom: direction toward the beach
const AMPHIBIOUS = new Set(['crab', 'turtle', 'snail', 'starfish', 'frog', 'firefly', 'gnat', 'dragonfly']);
const SHORE_MARGIN = 0.2; // how much beach elevation of water swimmers keep below the tide

// Food that fish can chase belongs in swimming water, including when the tide
// exposes an island flat. This also serves the natural plankton spawn sites.
function aquaticFoodRoom(world, x, y) {
  return !world.shore || shoreAt(world, x, y) <= Math.max(0.02, world.tide.level - SHORE_MARGIN - 0.04);
}

function makeShore(world) {
  const { W, H } = world, side = world.shoreSide;
  const previous = world.shore && world.shore.length === W * H ? world.shore : null;
  // Measured on the pond as it started, so deepening (which grows the far side) leaves the beach alone.
  const [W0, H0] = world.expandPx ? baseSize(world) : [W, H], [ox, oy] = world.expandPx ? originOf(world) : [0, 0];
  const band = Math.min(W0, H0) * 0.22;
  const shore = new Uint8Array(W * H), key = `${W}x${H}:${side}:${band}:${ox},${oy}`;
  if (world.shoreBaseKey === key && world.shoreBase) shore.set(world.shoreBase); // (the bare beach never changes: only what's done to it)
  else {
    // (Only the band along the beach: past about 1.06 of its local width, nothing is beach. On a pond
    // grown far out, that's a small part of it.)
    const n = side < 2 ? H : W, local = new Float32Array(n);
    for (let a = 0; a < n; a++) local[a] = band * (0.65 + 0.7 * fbm(a * 0.006, side * 7.3, 51));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = side === 0 ? x : side === 1 ? W - 1 - x : side === 2 ? y : H - 1 - y, L = local[side < 2 ? y : x];
        if (d > L * 1.06) continue; // (cheap: no noise worked out)
        const e = 1 - d / L + (fbm((x - ox) * 0.03, (y - oy) * 0.03, 52) - 0.5) * 0.1;
        shore[x + y * W] = e <= 0 ? 0 : Math.min(255, Math.round(e * 255));
      }
    }
    world.shoreBase = shore.slice(); world.shoreBaseKey = key;
  }
  world.shore = shore;
  world.shoreN = SHORE_SIDES[side];
  if (typeof applyShoreEdits === 'function') applyShoreEdits(world); // islands (and later, erosion)
  if (previous && typeof islandShoreChanged === 'function') islandShoreChanged(world, previous);
}

function shoreAt(world, x, y) {
  if (!world.shore) return 0;
  const xi = clamp(x | 0, 0, world.W - 1), yi = clamp(y | 0, 0, world.H - 1);
  return world.shore[xi + yi * world.W] / 255;
}

const isDry = (world, x, y) => !!world.shore && shoreAt(world, x, y) > world.tide.level;

// A random spot that stays underwater even at low tide.
function wetPoint(world, m = 20, maxShore = 0.12) {
  let x = 0, y = 0;
  for (let i = 0; i < 16; i++) {
    x = rand(m, world.W - m); y = rand(m, world.H - m);
    if (shoreAt(world, x, y) <= maxShore) break;
  }
  return [x, y];
}

// ---- layout ---------------------------------------------------------------------

function makeRock(x, y, a, m = pick(ROCK_MATS)) {
  const rock = {
    x, y, a, b: a * rand(0.65, 0.95), ang: rand(-PI, PI), h: a * rand(0.8, 1.2),
    m, seed: randi(0, 9999), outline: outlineOf(m),
  };
  rock.shader = (lx, ly, px, py) => {
    if (lx * lx + ly * ly < 0.5 && vnoise(px * 0.35, py * 0.35, rock.seed) > 0.58) return MOSS;
    return hash2(px, py, rock.seed) < 0.08 ? PAL.koiBlack : rock.m;
  };
  return rock;
}

function generateScenery(world) {
  const { W, H } = world, area = W * H;
  const hab = world.opts.habitat || 'mixed', fresh = hab !== 'salt', salt = hab !== 'fresh', both = fresh && salt;
  const rocks = [], pebbles = [], plants = [];
  world.shoreSide = randi(0, 3);
  world.riverOff = true; // the scenery is laid out on the beach as it was before rivers (links regrow it); the river is cut after
  makeShore(world);
  const clusters = Math.round(area / 18000) + 2;
  for (let c = 0; c < clusters; c++) {
    const cx = rand(W * 0.05, W * 0.95), cy = rand(H * 0.05, H * 0.95);
    const m = typeof rockFor === 'function' ? rockFor(world, pick(ROCK_MATS.slice(0, 3))) : pick(ROCK_MATS);
    const count = randi(1, 3);
    for (let k = 0; k < count; k++) {
      const off = k === 0 ? 0 : rand(6, 12), oa = rand(-PI, PI), rk = makeRock(cx + Math.cos(oa) * off, cy + Math.sin(oa) * off, k === 0 ? rand(6, 11) : rand(3, 6), m);
      rocks.push(typeof shapeRock === 'function' ? shapeRock(world, rk) : rk); // (this pond's rock, lying its own way: character.js)
    }
    for (let k = 0; k < 8; k++) {
      const a = rand(0, TAU), d = rand(8, 22);
      pebbles.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, s: rand(0.8, 1.7), m: pick(PEBBLE_MATS) });
    }
  }
  // Plants grow where the water stays (some seaweed is left out at low tide).
  const nearRock = (spread) => {
    for (let i = 0; i < 8; i++) {
      const r = Math.random() < 0.6 && pick(rocks);
      const p = r ? [r.x + rand(-1, 1) * (r.a + spread), r.y + rand(-1, 1) * (r.a + spread)] : [rand(6, W - 6), rand(6, H - 6)];
      if (shoreAt(world, ...p) < 0.32) return p;
    }
    return wetPoint(world, 10);
  };
  const add = (n, make) => { for (let k = 0; k < n; k++) plants.push(make()); };
  const k = both ? 0.6 : 1; // "both" shares the space between the two worlds
  const weedHabitat = salt && !fresh ? 'salt' : fresh && !salt ? 'fresh' : null;
  add(Math.round(area / 12000 * k) + 2, () => makePlant('weed', world, ...nearRock(5), { habitat: weedHabitat }));
  add(Math.round(area / 20000) + 1, () => makePlant('eelgrass', world, ...wetPoint(world, 10, 0.3)));
  if (salt) {
    add(Math.round(area / 30000 * (both ? 1 : 1.6)) + 1, () => makePlant('anemone', world, ...nearRock(7)));
    add(Math.round(area / 9000 * k), () => makePlant('coral', world, ...nearRock(9)));
    add(Math.round(area / 40000 * k) + 1, () => makePlant('urchin', world, ...nearRock(6)));
  }
  if (fresh) {
    add(Math.round(area / 25000 * k) + 1, () => makePlant('marimo', world, ...wetPoint(world, 10)));
    add(Math.round(area / 60000 * k) + 1, () => makePlant('duckweed', world, ...wetPoint(world, 15)));
  }
  rocks.forEach((r, i) => { r.oi = i; });
  plants.forEach((p, i) => { p.oi = i; });
  world.rocks = rocks;
  world.pebbles = pebbles;
  world.plants = plants;
  world.removed = { plants: [], pads: [], rocks: [] }; // generated scenery the player took out
  world.pads = fresh ? Array.from({ length: clamp(Math.round(area / 40000 * k), 2, 14) }, () => makePlant('lily', world, ...wetPoint(world, 14))) : [];
  world.pads.forEach((p, i) => { p.oi = i; });
  world.motes = new Motes(world);
  world.riverOff = false;
  if (world.shore) makeShore(world);
}

// The deep band: boulders tumbled along the drop-off, and pale stalks on the deep floor. One chance in each
// 26 px cell of the pond as it began (and on out), each cell its own, so as the pond grows nothing already
// there moves: only the new edge gets its own.
const DEEP_SILT = hexToInt('#2a2e34');
const DEEP_ROCKS = [mat('#101216', '#1c2026', '#2c3038', '#40464e'), mat('#16120e', '#241e18', '#362c24', '#4a3e32')];
const DEEP_STALK = mat('#6a6a7a', '#9a9aaa', '#c8c8d4', '#eeeef4');
const DEEP_CELL = 26;
function deepDecor(world, d) {
  const { W, H } = world, depth = world.depth, [ox, oy] = world.expandPx ? originOf(world) : [0, 0], C = DEEP_CELL, seed = hashString(world.seed || 'pond') % 9973;
  for (let cj = Math.floor(-oy / C); cj * C + oy < H; cj++) {
    for (let ci = Math.floor(-ox / C); ci * C + ox < W; ci++) {
      const x = ox + (ci + hash2(ci, cj, seed + 1)) * C, y = oy + (cj + hash2(ci, cj, seed + 2)) * C;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const v = depth[(y | 0) * W + (x | 0)];
      if (!v) continue;
      const h = hash2(ci, cj, seed + 3);
      withSeed(`${seed}/deep/${ci},${cj}`, () => {
        if (v < 110 && h < 0.7) d.stone(x, y, rand(3, 7), pick(DEEP_ROCKS));
        else if (h < 0.78) d.pebble(x, y, rand(1.5, 3), pick(DEEP_ROCKS));
        else if (v > 150 && h > 0.85) d.rubble(x, y, rand(3, 6), DEEP_STALK);
      });
    }
  }
}

// Rasterize rocks and floor decor once, bake them into the floor image, and keep
// their heights so animals are z-tested against them every frame. The floor is
// baked in true colour; water colour comes from depth fog at render time.
// With rect, only that part of the floor is redrawn (the rest is kept as it was).
function bakeBackground(world, rect = null) {
  const r = world.raster, { W, H } = world;
  const key = FLOOR_ALIASES[world.opts.floor] || world.opts.floor;
  const floor = FLOORS[key] || FLOORS.sand, water = WATERS[world.opts.water] || WATERS.teal;
  const light = hexToInt(water.light), black = hexToInt('#000000');
  world.waterColor = typeof charWater === 'function' ? charWater(world, hexToInt(water.color)) : hexToInt(water.color); // (this pond's own: character.js)
  const tintF = typeof floorTintFn === 'function' && key !== 'tiles' ? floorTintFn(world) : (c) => c;
  world.lightTint = light;
  if (world.motes) world.motes.mat = solid(water.mote);
  if (key === 'tiles') { world.shore = null; world.islandGround = null; } // a pool has no beach
  else if (!world.shore && world.shoreSide !== undefined) makeShore(world);
  const shore = world.shore;
  const islandGround = world.islandGround, islandSands = world.islandGroundSands;
  const savedClip = r.clip;
  const part = !!(rect && world.bgBase && world.bgBase.length === W * H);
  const [rx0, ry0, rx1, ry1] = part ? rect : [0, 0, W - 1, H - 1];
  // (A margin cleared round a partial redraw, so its edges don't read the last frame's animals.)
  r.clip = part ? [Math.max(0, rx0 - 2), Math.max(0, ry0 - 2), Math.min(W - 1, rx1 + 2), Math.min(H - 1, ry1 + 2)] : [0, 0, W - 1, H - 1];
  if (part) for (let y = r.clip[1]; y <= r.clip[3]; y++) r.zBase.fill(0, r.clip[0] + y * W, r.clip[2] + 1 + y * W);
  else r.zBase.fill(0);
  r.begin();
  const outline = new Uint32Array(8192);
  let nid = 1;
  for (const rock of world.rocks) {
    outline[nid] = rock.outline;
    r.ellipsoid(rock.x, rock.y, rock.a, rock.b, rock.ang, 0, rock.h, rock.shader, nid++);
  }
  if (floor.pebbles) {
    for (const pb of world.pebbles) {
      const id = nid < 999 ? nid++ : 999;
      outline[id] = pb.m[0];
      r.ellipsoid(pb.x, pb.y, pb.s, pb.s * 0.8, pb.x, 0, pb.s * 0.8, pb.m, id);
    }
  }
  // The floor pattern and decor are laid on the pond as it started (offset by the origin);
  // the deep band gets its own dark silt and boulders.
  const [ox, oy] = world.expandPx ? originOf(world) : [0, 0], [W0, H0] = world.expandPx ? baseSize(world) : [W, H];
  if (floor.decor) {
    const dec = makeDecor(r, outline), shifted = {};
    for (const k of Object.keys(dec)) shifted[k] = (x, y, ...rest) => dec[k](x + ox, y + oy, ...rest);
    withSeed(`${world.seed}/floor/${key}`, () => floor.decor(shifted, W0, H0));
  }
  if (world.depth) deepDecor(world, makeDecor(r, outline));
  // Structures' solid parts (see structures.js), with outline ids from 5000 up.
  let sid = 5000;
  const nextS = (m) => { const i = Math.min(8190, sid++); outline[i] = outlineOf(m); return i; };
  for (const s of world.structures || []) if (!s.anim) withSeed(`bake/${s.seed}`, () => BAKE[s.kind](r, s, nextS)); // same shape every bake (not while it's still arriving)
  if (typeof bakeLand === 'function' && world.game) bakeLand(r, world, nextS); // what the land has grown (land.js)
  // (The lit floor and the sunlit beach are blended from this as it's drawn: raster.js compose.)
  const bg = part ? world.bgBase : new Uint32Array(W * H);
  const { id, z, col, sh } = r;
  for (let y = ry0; y <= ry1; y++) {
    for (let x = rx0, p = rx0 + y * W; x <= rx1; x++, p++) {
      let c;
      if (id[p]) {
        c = col[p];
        const i = id[p], zp = z[p] + 0.3;
        let n;
        if ((x > 0 && id[n = p - 1] !== i && id[n] && z[n] > zp) || (x < W - 1 && id[n = p + 1] !== i && id[n] && z[n] > zp) ||
            (y > 0 && id[n = p - W] !== i && id[n] && z[n] > zp) || (y < H - 1 && id[n = p + W] !== i && id[n] && z[n] > zp)) {
          c = outline[id[n]];
        } else if (sh[p] > z[p] + 1.5) c = shadeColor(c);
      } else {
        let best = 0, bz = 0.3, n;
        if (x > 0 && id[n = p - 1] && z[n] > bz) { best = id[n]; bz = z[n]; }
        if (x < W - 1 && id[n = p + 1] && z[n] > bz) { best = id[n]; bz = z[n]; }
        if (y > 0 && id[n = p - W] && z[n] > bz) { best = id[n]; bz = z[n]; }
        if (y < H - 1 && id[n = p + W] && z[n] > bz) { best = id[n]; bz = z[n]; }
        if (best) {
          c = outline[best];
        } else {
          c = floor.color(x - ox, y - oy);
          if (world.sand && world.sand[p]) c = sandOver(world, c, world.sand[p], x, y);
          c = tintF(c);
          if (world.depth && world.depth[p]) c = mixColor(c, DEEP_SILT, Math.min(1, world.depth[p] / 160));
          if (islandGround && islandGround[p]) {
            const sand = islandSands[islandGround[p] - 1];
            const grain = (hash2(x >> 2, y >> 2, 91) * sand.length) | 0;
            // A broad pale shore, with less sand showing under the higher greenery.
            const beach = 0.8 - 0.35 * smoothstep(0.48, 0.94, shore[p] / 255);
            c = mixColor(c, sand[grain], beach);
          }
          if (sh[p] > 1.2) c = shadeColor(c);
        }
      }
      // Darker water toward the tank edges, in dithered steps (not on the beach).
      const edge = Math.min(x / W, (W - 1 - x) / W, y / H, (H - 1 - y) / H);
      const e = Math.floor((Math.max(0, 0.05 - edge) * 4 + dither(x, y) * 0.06) * 10) / 10;
      if (e > 0 && !(shore && shore[p])) c = mixColor(c, black, e);
      bg[p] = c;
    }
  }
  if (part) for (let y = ry0; y <= ry1; y++) r.zBase.set(r.z.subarray(rx0 + y * W, rx1 + 1 + y * W), rx0 + y * W);
  else r.zBase.set(r.z);
  r.clip = savedClip;
  if (part) {
    // The unstained copies were redrawn in place; the stains go back over them (below).
    if (typeof applyStains === 'function') applyStains(world, [rx0, ry0, rx1, ry1]); else world.bg.set(bg);
    return;
  }
  world.bg = bg;
  world.bgLight = null;
  world.bgDry = null;
  world.lightTint = light;
  // Keep an unstained copy; stains around old things are painted over it (applyStains).
  world.bgBase = bg.slice();
  if (typeof applyStains === 'function') applyStains(world);
}
