'use strict';
// Floor textures, water tints, scenery layout, food, and the static background bake.

const hexes = (...h) => h.map(hexToInt);

const WATERS = {
  teal: { label: 'Teal', color: '#1b6a7c', mix: 0.36, light: '#d9fff0' },
  pond: { label: 'Pond green', color: '#35602a', mix: 0.42, light: '#efffc8' },
  clear: { label: 'Clear blue', color: '#2a74c0', mix: 0.3, light: '#e8f8ff' },
  murky: { label: 'Murky', color: '#4e4628', mix: 0.58, light: '#fff0c0' },
};

const ROCK_MATS = [
  mat('#262b36', '#414a5a', '#667084', '#98a2b4'),
  mat('#352c24', '#584838', '#806a54', '#ac967a'),
  mat('#2c3230', '#48524c', '#6c7a70', '#9aaa9c'),
];
const MOSS = mat('#18321c', '#28502a', '#3e7236', '#64984a');
const PEBBLE_MATS = [ROCK_MATS[1], mat('#5a4a36', '#86725a', '#b09c80', '#d8c8a8'), mat('#4a2a22', '#6e4032', '#965c48', '#c0846a')];

const dither = (x, y) => BAYER4[(x & 3) | ((y & 3) << 2)];

// Floors are drawn like hand-made pixel art: a few close shades per material,
// clean shapes with deliberate highlight/shadow pixels, and 2x2 checker dither
// only where two shades meet (never per-pixel random noise).
const SAND = hexes('#86755a', '#9e8c6a', '#b4a27c', '#c8b78e', '#ddcea4');
const GRAVEL_STONES = [
  hexes('#5c5a54', '#76736a', '#8f8b80'),
  hexes('#6e5e48', '#8a785c', '#a49274'),
  hexes('#5a4a40', '#745e50', '#8e7662'),
  hexes('#4e5658', '#667074', '#808a8c'),
  hexes('#807a68', '#9c9680', '#b6b098'),
];
const GRAVEL_GAP = hexes('#3a342a', '#4a4236');
const SOIL = hexes('#2e2218', '#3a2c20', '#463628', '#524030');
const LEAVES = [
  hexes('#5a3414', '#7c4c1e', '#9c682c'),
  hexes('#6a2c12', '#90401c', '#b45a28'),
  hexes('#3e4a18', '#56661f', '#70822a'),
];
const TILE = hexes('#9fb6c2', '#c4d6e0', '#dce8ee', '#f4fafc');
const TILE_LANE = hexes('#0e2458', '#163272', '#20428e', '#3a5eb0');
const GROUT = hexToInt('#7e929c');

const checker = (x, y) => ((x ^ y) & 1) === 1;

// Pick between two shade levels around a threshold, checker-dithering a thin band.
function level(v, t, band, x, y) {
  if (v > t + band) return 1;
  if (v < t - band) return 0;
  return checker(x, y) ? 1 : 0;
}

const FLOORS = {
  // Soft dunes in three shades, plus wind ripples: a light crest pixel with a shadow pixel under it.
  sand: {
    label: 'Sand',
    color(x, y) {
      const n = fbm(x * 0.016, y * 0.016, 3);
      let s = 1 + level(n, 0.45, 0.012, x, y) + level(n, 0.6, 0.012, x, y);
      const mask = fbm(x * 0.012 + 40, y * 0.012, 8);
      if (mask > 0.42) {
        const w = x * 0.55 + y * 0.84 + fbm(x * 0.025, y * 0.025, 9) * 30;
        const f = ((w / 7) % 1 + 1) % 1;
        if (f < 0.12) s += 1;
        else if (f < 0.24) s -= 1;
      }
      if (hash2(x, y, 5) < 0.004) s = 0;
      else if (hash2(x, y, 6) < 0.003) s = 4;
      return SAND[clamp(s, 0, 4)];
    },
  },

  // Rounded pebbles lit from the top-left, packed with dark gaps between them.
  gravel: {
    label: 'Gravel',
    color(x, y) {
      const cs = 6, gx = x / cs, gy = y / cs, ix = Math.floor(gx), iy = Math.floor(gy);
      let f1 = 9, f2 = 9, bx = 0, by = 0, dx = 0, dy = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = ix + ox, cy = iy + oy;
          const px = cx + 0.2 + hash2(cx, cy, 11) * 0.6, py = cy + 0.2 + hash2(cx, cy, 12) * 0.6;
          const ex = gx - px, ey = gy - py, d = ex * ex + ey * ey;
          if (d < f1) { f2 = f1; f1 = d; bx = cx; by = cy; dx = ex; dy = ey; } else if (d < f2) f2 = d;
        }
      }
      const edge = (Math.sqrt(f2) - Math.sqrt(f1)) * cs;
      if (edge < 1.2) return GRAVEL_GAP[checker(x, y) && edge > 0.6 ? 1 : 0];
      const pal = GRAVEL_STONES[Math.floor(hash2(bx, by, 13) * GRAVEL_STONES.length)];
      if (edge < 2) return pal[0];
      const l = -(dx * 0.6 + dy * 0.8) * cs;
      return pal[l > 1.2 ? 2 : l < -1.6 ? 0 : 1];
    },
  },

  // Dark soil with a few crumbs, and scattered fallen leaves with a midrib.
  mud: {
    label: 'Leafy soil',
    color(x, y) {
      const cs = 14, cx = Math.floor(x / cs), cy = Math.floor(y / cs);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const kx = cx + ox, ky = cy + oy;
          if (hash2(kx, ky, 31) > 0.45) continue;
          const lx0 = (kx + 0.3 + hash2(kx, ky, 32) * 0.6) * cs, ly0 = (ky + 0.3 + hash2(kx, ky, 33) * 0.6) * cs;
          const a = hash2(kx, ky, 34) * PI, ca = Math.cos(a), sa = Math.sin(a);
          const px = x + 0.5 - lx0, py = y + 0.5 - ly0;
          const lx = (px * ca + py * sa) / 4.2, ly = (-px * sa + py * ca) / 2;
          if (lx < -1.2 || lx > 1.2 || ly < -1.2 || ly > 1.2) continue;
          const d = lx * lx + ly * ly * (1 + lx * 0.5); // wider at the stem end
          if (d < 1) {
            const pal = LEAVES[Math.floor(hash2(kx, ky, 35) * LEAVES.length)];
            if (Math.abs(ly) < 0.18 && lx < 0.8) return pal[0];
            return ly < 0 ? pal[2] : pal[1];
          }
          if (d < 1.35) return SOIL[0];
        }
      }
      const n = fbm(x * 0.03, y * 0.03, 4);
      let s = 1 + level(n, 0.52, 0.015, x, y);
      const crumb = vnoise(x * 0.45, y * 0.45, 7);
      if (crumb > 0.8) s = 3;
      else if (crumb < 0.12) s = 0;
      return SOIL[s];
    },
  },

  // Swimming-pool tiles with bevels and a lane stripe.
  tiles: {
    label: 'Pool tiles',
    color(x, y) {
      const T = 8, tx = x % T, ty = y % T;
      if (tx === 0 || ty === 0) return GROUT;
      const lane = Math.floor(y / T) % 12 === 6 ? TILE_LANE : TILE;
      if (tx === 1 || ty === 1) return lane[3];
      if (tx === T - 1 || ty === T - 1) return lane[1];
      return lane[2];
    },
  },
};

class Food {
  constructor(x, y, z = 40, kind = 'pellet') {
    this.x = x; this.y = y; this.z = z; this.kind = kind;
    this.life = kind === 'plankton' ? rand(40, 70) : 25;
    this.eaten = false;
    this.ph = rand(0, TAU);
  }

  update(dt, world) {
    const cur = world.current;
    if (this.kind === 'plankton') {
      // Drifts with the current and a lazy wobble, slowly sinking.
      this.z = Math.max(1, this.z - 0.4 * dt);
      this.x = clamp(this.x + (cur.x * 5 + Math.sin(world.t * 0.8 + this.ph) * 1.2) * dt, 1, world.W - 1);
      this.y = clamp(this.y + (cur.y * 5 + Math.cos(world.t * 0.7 + this.ph) * 1.2) * dt, 1, world.H - 1);
      this.life -= dt;
      if (this.life <= 0) this.eaten = true;
      return;
    }
    if (this.z > 0.8) {
      this.z = Math.max(0.8, this.z - 5 * dt);
      this.x = clamp(this.x + (Math.sin(this.z * 0.7) * 1.5 + cur.x * 4) * dt, 1, world.W - 1);
      this.y = clamp(this.y + cur.y * 4 * dt, 1, world.H - 1);
    } else {
      this.life -= dt;
      if (this.life <= 0) this.eaten = true;
    }
  }

  draw(r) {
    if (this.kind === 'plankton') {
      r.alpha = Math.min(1, this.life / 5, (70 - this.life) / 2 + 0.3);
      r.dot(this.x, this.y, this.z, PLANKTON_MAT, PLANKTON_ID);
      r.alpha = 1;
      return;
    }
    r.ellipsoid(this.x, this.y, 0.8, 0.8, 0, this.z, 0.8, PAL.pellet, FOOD_ID);
  }
}

// ---- layout ------------------------------------------------------------------

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
  const rocks = [], pebbles = [], plants = [];
  const clusters = Math.round(area / 18000) + 2;
  for (let c = 0; c < clusters; c++) {
    const cx = rand(W * 0.08, W * 0.92), cy = rand(H * 0.08, H * 0.92);
    const m = pick(ROCK_MATS);
    const count = randi(1, 3);
    for (let k = 0; k < count; k++) {
      const off = k === 0 ? 0 : rand(6, 12), oa = rand(-PI, PI);
      rocks.push(makeRock(cx + Math.cos(oa) * off, cy + Math.sin(oa) * off, k === 0 ? rand(6, 11) : rand(3, 6), m));
    }
    for (let k = 0; k < 14; k++) {
      const a = rand(0, TAU), d = rand(8, 22);
      if (k < 8) pebbles.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, s: rand(0.8, 1.7), m: pick(PEBBLE_MATS) });
    }
  }
  for (let k = 0; k < area / 7000; k++) {
    pebbles.push({ x: rand(0, W), y: rand(0, H), s: rand(0.6, 1.3), m: pick(PEBBLE_MATS) });
  }
  const nearRock = (spread) => {
    const r = Math.random() < 0.6 && pick(rocks);
    return r ? [r.x + rand(-1, 1) * (r.a + spread), r.y + rand(-1, 1) * (r.a + spread)] : [rand(6, W - 6), rand(6, H - 6)];
  };
  const add = (n, make) => { for (let k = 0; k < n; k++) plants.push(make()); };
  add(Math.round(area / 12000) + 2, () => new Weed(...nearRock(5)));
  add(Math.round(area / 20000) + 1, () => new Eelgrass(rand(10, W - 10), rand(10, H - 10)));
  add(Math.round(area / 30000) + 1, () => new Anemone(...nearRock(7)));
  add(Math.round(area / 25000) + 1, () => new Marimo(rand(10, W - 10), rand(10, H - 10)));
  add(Math.round(area / 60000) + 1, () => new Duckweed(rand(15, W - 15), rand(15, H - 15)));
  world.rocks = rocks;
  world.pebbles = pebbles;
  world.plants = plants;
  world.pads = Array.from({ length: clamp(Math.round(area / 40000), 2, 5) }, () => new LilyPad(world));
}

// Rasterize rocks and pebbles once, bake them into the floor image, and keep
// their heights so animals are z-tested against them every frame.
function bakeBackground(world) {
  const r = world.raster, { W, H } = world;
  const floor = FLOORS[world.opts.floor] || FLOORS.sand, water = WATERS[world.opts.water] || WATERS.teal;
  const wc = hexToInt(water.color), light = hexToInt(water.light), black = hexToInt('#000000');
  r.zBase.fill(0);
  r.begin();
  const outline = new Uint32Array(4096);
  let nid = 1;
  for (const rock of world.rocks) {
    outline[nid] = rock.outline;
    r.ellipsoid(rock.x, rock.y, rock.a, rock.b, rock.ang, 0, rock.h, rock.shader, nid++);
  }
  if (world.opts.floor === 'sand' || world.opts.floor === 'mud') {
    for (const pb of world.pebbles) {
      const id = nid < 4095 ? nid++ : 4095;
      outline[id] = pb.m[0];
      r.ellipsoid(pb.x, pb.y, pb.s, pb.s * 0.8, pb.x, 0, pb.s * 0.8, pb.m, id);
    }
  }
  const bg = new Uint32Array(W * H), bgLight = new Uint32Array(W * H);
  const { id, z, col, sh } = r;
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p++) {
      let c;
      if (id[p]) {
        c = col[p];
        if (sh[p] > z[p] + 2) c = shadeColor(c);
      } else {
        let best = 0, bz = 0.3, n;
        if (x > 0 && id[n = p - 1] && z[n] > bz) { best = id[n]; bz = z[n]; }
        if (x < W - 1 && id[n = p + 1] && z[n] > bz) { best = id[n]; bz = z[n]; }
        if (y > 0 && id[n = p - W] && z[n] > bz) { best = id[n]; bz = z[n]; }
        if (y < H - 1 && id[n = p + W] && z[n] > bz) { best = id[n]; bz = z[n]; }
        if (best) {
          c = outline[best];
        } else {
          c = mixColor(floor.color(x, y), wc, water.mix);
          // Deeper, darker water toward the tank edges, in dithered steps.
          const edge = Math.min(x / W, (W - 1 - x) / W, y / H, (H - 1 - y) / H);
          const e = Math.floor((Math.max(0, 0.08 - edge) * 3.4 + dither(x, y) * 0.08) * 10) / 10;
          if (e > 0) c = mixColor(c, black, e);
          if (sh[p] > 1.5) c = shadeColor(c);
        }
      }
      bg[p] = c;
      bgLight[p] = mixColor(c, light, 0.11);
    }
  }
  r.zBase.set(r.z);
  world.bg = bg;
  world.bgLight = bgLight;
}
