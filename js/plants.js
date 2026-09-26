'use strict';
// Plants and floating things. Each has update(dt, world), draw(r, t, world) and hit(x, y).

// Sum of pushes away from nearby animals below maxZ, weighted by closeness.
function pushFrom(world, x, y, reach, maxZ) {
  let tx = 0, ty = 0;
  for (const c of world.creatures) {
    if (c.z > maxZ) continue;
    const dx = x - c.x, dy = y - c.y, d2 = dx * dx + dy * dy;
    if (d2 < reach * reach && d2 > 0.01) {
      const d = Math.sqrt(d2), f = (reach - d) / reach;
      tx += dx / d * f; ty += dy / d * f;
    }
  }
  return [tx, ty];
}

class Weed {
  constructor(x, y, habitat = null) {
    this.x = x; this.y = y;
    const m = pick(habitat === 'salt' ? [PAL.weedKelp, PAL.weedRed, PAL.weedKelp] : habitat === 'fresh'
      ? [PAL.weed, PAL.weed, PAL.weedKelp] : [PAL.weed, PAL.weed, PAL.weedKelp, PAL.weedRed]);
    this.id = newId(outlineOf(m));
    this.px = 0; this.py = 0;
    this.strands = Array.from({ length: randi(3, 6) }, () => ({
      ang: rand(-PI, PI), seg: rand(2.2, 3), n: randi(4, 7),
      phase: rand(0, TAU), r0: rand(1.1, 1.6), m,
    }));
  }

  hit(x, y) { return Math.hypot(x - this.x, y - this.y) < 8; }

  // Bend away from anything swimming through.
  update(dt, world) {
    const [tx, ty] = pushFrom(world, this.x, this.y, 16, 24);
    const k = Math.min(1, dt * 4);
    this.px += (tx * 6 - this.px) * k; this.py += (ty * 6 - this.py) * k;
  }

  draw(r, t, world) {
    const cur = world.current;
    for (const s of this.strands) {
      let x = this.x, y = this.y, z = 0, a = s.ang, rad = s.r0;
      for (let k = 1; k <= s.n; k++) {
        a += Math.sin(t * 1.1 + s.phase + k * 0.6) * (0.12 + cur.s * 0.12);
        const f = k / s.n;
        const nx = x + Math.cos(a) * s.seg + (this.px * 0.35 + cur.x * 1.2) * f;
        const ny = y + Math.sin(a) * s.seg + (this.py * 0.35 + cur.y * 1.2) * f;
        const nz = k * 2.4, nr = lerp(s.r0, 0.5, f);
        r.tube(x, y, rad, z, nx, ny, nr, nz, 0.8, s.m, this.id);
        if (k % 2 === 0) {
          const la = a + (k % 4 === 0 ? 1 : -1) * 0.9;
          r.ellipsoid(nx + Math.cos(la) * 1.4, ny + Math.sin(la) * 1.4, 1.8, 0.8, la, nz - 0.5, 0.6, s.m, this.id);
        }
        x = nx; y = ny; z = nz; rad = nr;
      }
    }
  }
}

// Long ribbon blades that stand up in still water and stream flat in a current.
class Eelgrass {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.px = 0; this.py = 0;
    this.m = pick([PAL.grass, PAL.grass, PAL.grassOlive]);
    this.id = newId(outlineOf(this.m));
    this.blades = Array.from({ length: randi(5, 9) }, () => ({
      ox: rand(-2.5, 2.5), oy: rand(-2.5, 2.5), n: randi(6, 10), seg: rand(2, 2.6),
      w: rand(0.75, 1.05), phase: rand(0, TAU), rest: rand(-PI, PI), bias: rand(-0.5, 0.5),
    }));
  }

  hit(x, y) { return Math.hypot(x - this.x, y - this.y) < 7; }

  update(dt, world) {
    const [tx, ty] = pushFrom(world, this.x, this.y, 18, 26);
    const k = Math.min(1, dt * 4);
    this.px += (tx * 6 - this.px) * k; this.py += (ty * 6 - this.py) * k;
  }

  draw(r, t, world) {
    const cur = world.current, flow = Math.min(1, cur.s * 1.5);
    for (const b of this.blades) {
      let x = this.x + b.ox, y = this.y + b.oy, z = 0;
      const base = b.rest + wrapAngle(cur.angle + b.bias - b.rest) * flow;
      for (let k = 1; k <= b.n; k++) {
        const f = k / b.n;
        const a = base + Math.sin(t * 1.6 + b.phase - k * 0.55) * (0.18 + cur.s * 0.25);
        const lean = Math.min(0.97, 0.3 + cur.s * 0.6 + f * 0.25);
        const h = b.seg * lean, v = b.seg * Math.sqrt(1 - lean * lean);
        const nx = x + Math.cos(a) * h + this.px * f * 0.3, ny = y + Math.sin(a) * h + this.py * f * 0.3;
        r.tube(x, y, b.w, z, nx, ny, k === b.n ? 0.5 : b.w, z + v, 0.35, this.m, this.id);
        x = nx; y = ny; z += v;
      }
    }
  }
}

const ANEMONES = [
  { body: mat('#4a1a4a', '#782a74', '#a8409e', '#d870c8'), tip: mat('#8a2a5a', '#c84a86', '#ff78b0', '#ffc0de') },
  { body: mat('#1a4a2a', '#2a7440', '#44a058', '#7ad088'), tip: mat('#4a1a6a', '#7a2aa0', '#b04ad8', '#e09aff'), glow: true },
  { body: mat('#6a2a0a', '#a44a14', '#e0782a', '#ffb060'), tip: mat('#8a6a10', '#c8a020', '#ffd84a', '#fff4a8') },
];

// Tentacles snap shut when something comes close, then slowly reopen.
class Anemone {
  constructor(x, y) {
    this.x = x; this.y = y;
    const v = pick(ANEMONES);
    this.v = v;
    this.R = rand(2.2, 3.2);
    this.n = randi(14, 20);
    this.len = rand(3, 4.5);
    this.retract = 0;
    this.phase = rand(0, TAU);
    this.id = newId(outlineOf(v.body));
    if (v.glow) EMISSIVE[this.id] = 1;
    this.shader = (u) => (u > 0.65 ? v.tip : v.body);
    this.mouth = solid('#2a0a1a');
  }

  hit(x, y) { return Math.hypot(x - this.x, y - this.y) < this.R + this.len; }

  update(dt, world) {
    const reach = this.R + this.len + 3;
    let near = false;
    for (const c of world.creatures) {
      if (c.z < 14 && c.species !== 'clown' && (c.x - this.x) ** 2 + (c.y - this.y) ** 2 < reach * reach) { near = true; break; }
    }
    const p = world.pointer;
    if (p.inside && (p.x - this.x) ** 2 + (p.y - this.y) ** 2 < reach * reach) near = true;
    this.retract += ((near ? 1 : 0) - this.retract) * Math.min(1, dt * (near ? 8 : 0.7));
  }

  draw(r, t) {
    const { x, y, R, id } = this, L = this.len * (1 - 0.8 * this.retract);
    r.ellipsoid(x, y, R, R, 0, 0, 2.6, this.v.body, id);
    for (let k = 0; k < this.n; k++) {
      const a = k / this.n * TAU + Math.sin(t * 1.2 + k * 0.9 + this.phase) * 0.18;
      const wav = Math.sin(t * 1.7 + k) * 0.1;
      r.tube(x + Math.cos(a) * R * 0.5, y + Math.sin(a) * R * 0.5, 0.75, 2.4,
        x + Math.cos(a + wav) * (R * 0.6 + L), y + Math.sin(a + wav) * (R * 0.6 + L), 0.6, 3.2 - this.retract,
        0.8, this.shader, id);
    }
    r.dot(x, y, 3.9, this.mouth, id);
  }
}

// Fuzzy moss balls that roll when something bumps them.
class Marimo {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = rand(2.2, 3.6);
    this.vx = 0; this.vy = 0;
    this.rx = rand(0, 50); this.ry = rand(0, 50);
    this.id = newId(outlineOf(PAL.marimo));
    const seed = randi(0, 999), tile = new Uint8Array(32 * 32);
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) tile[i + j * 32] = vnoise(i / 5, j / 5, seed) > 0.5 ? 1 : 0;
    this.shader = (lx, ly, x, y) => {
      if (lx * lx + ly * ly > 0.75 && ((x * 7 + y * 13) & 7) < 3) return null;
      const i = ((lx * 2.5 + this.rx) * 5) & 31, j = ((ly * 2.5 + this.ry) * 5) & 31;
      return tile[i + j * 32] ? PAL.marimoLight : PAL.marimo;
    };
  }

  hit(x, y) { return Math.hypot(x - this.x, y - this.y) < this.r + 1.5; }

  update(dt, world) {
    const [tx, ty] = pushFrom(world, this.x, this.y, this.r + 5, this.r * 2 + 4);
    this.vx += tx * 40 * dt; this.vy += ty * 40 * dt;
    const k = 1 - Math.min(1, dt * 1.5);
    this.vx *= k; this.vy *= k;
    for (const rk of world.rocks) {
      const dx = this.x - rk.x, dy = this.y - rk.y, d = Math.hypot(dx, dy) || 1, lim = Math.max(rk.a, rk.b) + this.r;
      if (d < lim) { this.x = rk.x + dx / d * lim; this.y = rk.y + dy / d * lim; this.vx += dx / d * 2; this.vy += dy / d * 2; }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.x < this.r || this.x > world.W - this.r) this.vx = -this.vx;
    if (this.y < this.r || this.y > world.H - this.r) this.vy = -this.vy;
    this.x = clamp(this.x, this.r, world.W - this.r);
    this.y = clamp(this.y, this.r, world.H - this.r);
    // Rolling slides the texture.
    this.rx -= this.vx * dt / this.r; this.ry -= this.vy * dt / this.r;
  }

  draw(r) {
    r.ellipsoid(this.x, this.y, this.r, this.r, 0, 0, this.r, this.shader, this.id);
  }
}

// A drifting raft of tiny floating leaves.
class Duckweed {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = rand(-0.5, 0.5); this.vy = rand(-0.5, 0.5);
    this.id = newId(outlineOf(PAL.duckweed));
    this.leaves = Array.from({ length: randi(25, 50) }, () => {
      const a = rand(-PI, PI), d = Math.pow(Math.random(), 0.7) * 11;
      return { ox: Math.cos(a) * d, oy: Math.sin(a) * d * 0.8, s: rand(0.8, 1.4), a: rand(-PI, PI), p: rand(0, TAU) };
    });
  }

  hit(x, y) { return Math.hypot(x - this.x, y - this.y) < 12; }

  update(dt, world) {
    this.x += (world.current.x * 3 + this.vx) * dt;
    this.y += (world.current.y * 3 + this.vy) * dt;
    if (this.x < 10 || this.x > world.W - 10) this.vx = -this.vx;
    if (this.y < 10 || this.y > world.H - 10) this.vy = -this.vy;
    this.x = clamp(this.x, 10, world.W - 10);
    this.y = clamp(this.y, 10, world.H - 10);
    floatOffBeach(this, world, dt);
  }

  draw(r, t) {
    for (const l of this.leaves) {
      r.ellipsoid(this.x + l.ox + Math.sin(t * 0.5 + l.p) * 0.4, this.y + l.oy + Math.cos(t * 0.4 + l.p) * 0.4,
        l.s, l.s * 0.8, l.a, 44, 0.5, PAL.duckweed, this.id);
    }
  }
}

// Floating plants drift back off the beach as the tide goes out.
function floatOffBeach(o, world, dt) {
  if (!world.shore) return;
  const e = shoreAt(world, o.x, o.y), lim = world.tide.level - 0.1;
  if (e > lim) {
    const k = Math.min(3, (e - lim) * 40) * dt * 6;
    o.x -= world.shoreN[0] * k; o.y -= world.shoreN[1] * k;
  }
}

class LilyPad {
  constructor(world, x, y) {
    this.r = rand(7, 12);
    this.x = x ?? rand(this.r, world.W - this.r);
    this.y = y ?? rand(this.r, world.H - this.r);
    this.ang = rand(-PI, PI);
    this.spin = rand(-0.05, 0.05);
    this.vx = rand(-0.6, 0.6); this.vy = rand(-0.6, 0.6);
    this.flower = Math.random() < 0.45;
    this.id = newId(hexToInt('#0a2410'));
    this.shader = (lx, ly) => {
      const a = Math.atan2(ly, lx), d2 = lx * lx + ly * ly;
      if (lx > 0 && Math.abs(a) < 0.3) return null;
      if (d2 > 0.8) return PAL.padRim;
      if (d2 > 0.04 && Math.abs((((a + PI) / TAU) * 9) % 1 - 0.5) < 0.05) return PAL.padVein;
      return PAL.pad;
    };
  }

  hit(x, y) { return Math.hypot(x - this.x, y - this.y) < this.r; }

  update(dt, world) {
    this.x += (this.vx + world.current.x * 1.5) * dt;
    this.y += (this.vy + world.current.y * 1.5) * dt;
    this.ang += this.spin * dt;
    if (this.x < this.r || this.x > world.W - this.r) this.vx = -this.vx;
    if (this.y < this.r || this.y > world.H - this.r) this.vy = -this.vy;
    this.x = clamp(this.x, this.r, world.W - this.r);
    this.y = clamp(this.y, this.r, world.H - this.r);
    floatOffBeach(this, world, dt);
  }

  draw(r) {
    r.ellipsoid(this.x, this.y, this.r, this.r * 0.96, this.ang, 44, 1.4, this.shader, this.id);
    if (!this.flower) return;
    const cx = this.x - Math.cos(this.ang) * this.r * 0.2, cy = this.y - Math.sin(this.ang) * this.r * 0.2;
    for (let k = 0; k < 7; k++) {
      const a = this.ang + k * TAU / 7;
      r.ellipsoid(cx + Math.cos(a) * 2, cy + Math.sin(a) * 2, 2.4, 1.1, a, 45.5, 1.5, PAL.petal, this.id);
    }
    r.ellipsoid(cx, cy, 1.3, 1.3, 0, 47, 1, PAL.petalCore, this.id);
  }
}

// ---- saltwater: corals and urchins --------------------------------------------------

const CORAL_MATS = [
  mat('#8a3a5a', '#c05a80', '#ec84a6', '#ffc0d4'), mat('#8a4a1a', '#c0702a', '#ec9a44', '#ffc88a'),
  mat('#4a2a7a', '#6a44a8', '#9068d4', '#c8a8f4'), mat('#7a6a14', '#b09a22', '#e0c83c', '#fff08a'),
  mat('#1a6a6a', '#2a9a94', '#44c4b8', '#94f0e0'), mat('#8a1a1a', '#b82a24', '#e04a3a', '#ff8a70'),
];
const lighten = (m) => [m[1], m[2], m[3], m[3]];
const deepen = (m) => [m[0], m[0], m[1], m[2]];

// Staghorn (branching), brain (maze dome), fan (swaying ribs) or tube (organ pipes).
class Coral {
  constructor(x, y, kind = pick(['staghorn', 'staghorn', 'brain', 'fan', 'tube'])) {
    this.x = x; this.y = y; this.kind = kind;
    this.m = pick(CORAL_MATS);
    this.id = newId(outlineOf(this.m));
    this.phase = rand(0, TAU);
    const tip = lighten(this.m);
    if (kind === 'staghorn') {
      // Branches grow outward and upward, forking now and then; built once, static.
      this.segs = [];
      const grow = (px, py, pz, a, r, depth) => {
        const len = rand(3, 5), nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len, nz = pz + 2.2, nr = r * 0.78;
        this.segs.push([px, py, r, pz, nx, ny, nr, nz]);
        if (depth < 3) grow(nx, ny, nz, a + rand(-0.4, 0.4), nr, depth + 1);
        if (depth < 2 && Math.random() < 0.55) grow(nx, ny, nz, a + (Math.random() < 0.5 ? 0.7 : -0.7), nr * 0.9, depth + 1);
      };
      for (let k = randi(3, 5); k > 0; k--) grow(x, y, 0, rand(0, TAU), rand(1.2, 1.6), 0);
      this.R = 16;
      this.skin = (u) => (u > 0.7 ? tip : this.m);
    } else if (kind === 'brain') {
      this.r = rand(4, 7);
      this.R = this.r;
      const groove = deepen(this.m), s = rand(0, 99);
      this.skin = bakeShader((lx, ly) => (Math.abs(Math.sin(lx * 7 + vnoise(lx * 2 + s, ly * 2, 81) * 6 + ly * 3)) < 0.3 ? groove : this.m), 40, 40, -1);
    } else if (kind === 'fan') {
      this.ribs = Array.from({ length: randi(7, 11) }, (_, k, a) => ({ a: rand(-PI, PI), len: rand(6, 10) }));
      const base = rand(0, TAU);
      this.ribs.forEach((rb, k, all) => { rb.a = base + (k / (all.length - 1) - 0.5) * 1.9; });
      this.R = 11;
    } else {
      this.tubes = Array.from({ length: randi(5, 9) }, () => ({ ox: rand(-3.5, 3.5), oy: rand(-3.5, 3.5), r: rand(1.1, 1.8), h: rand(2.5, 4.5) }));
      this.R = 6;
      const hole = mat('#1a0a14', '#2a1020', '#3a1a2c', '#4a2438');
      this.skin = (lx, ly) => (lx * lx + ly * ly < 0.3 ? hole : lx * lx + ly * ly < 0.55 ? tip : this.m);
    }
  }

  hit(x, y) { return Math.hypot(x - this.x, y - this.y) < this.R; }
  update() {}

  draw(r, t) {
    const id = this.id;
    if (this.kind === 'staghorn') {
      for (const [ax, ay, ar, az, bx, by, br, bz] of this.segs) r.tube(ax, ay, ar, az, bx, by, br, bz, 0.9, this.skin, id);
    } else if (this.kind === 'brain') {
      r.ellipsoid(this.x, this.y, this.r, this.r * 0.9, 0, 0, this.r * 0.7, this.skin, id);
    } else if (this.kind === 'fan') {
      const sway = Math.sin(t * 0.9 + this.phase) * 0.06;
      for (const rb of this.ribs) {
        let px = this.x, py = this.y, a = rb.a + sway, rad = 0.9;
        for (let k = 1; k <= 3; k++) {
          const seg = rb.len / 3, nx = px + Math.cos(a) * seg, ny = py + Math.sin(a) * seg;
          r.tube(px, py, rad, k * 1.2 - 1.2, nx, ny, rad * 0.8, k * 1.2, 0.6, k === 3 ? lighten(this.m) : this.m, id);
          if (k === 2) r.tube(nx, ny, 0.6, 2.4, nx + Math.cos(a + 0.5) * seg * 0.7, ny + Math.sin(a + 0.5) * seg * 0.7, 0.5, 3, 0.6, this.m, id);
          px = nx; py = ny; rad *= 0.8; a += sway * 0.5;
        }
      }
    } else {
      for (const tb of this.tubes) r.ellipsoid(this.x + tb.ox, this.y + tb.oy, tb.r, tb.r, 0, 0, tb.h, this.skin, id);
    }
  }
}

const URCHIN = [mat('#140a1a', '#24122e', '#3a2048', '#5a3a6e'), mat('#1a0a0a', '#301414', '#4a2020', '#6e3a34')];

// A spiky ball whose spines slowly wave.
class Urchin {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = rand(1.6, 2.4);
    this.m = pick(URCHIN);
    this.id = newId(hexToInt('#050208'));
    this.phase = rand(0, TAU);
    this.spines = Array.from({ length: randi(12, 16) }, (_, k, a) => k / 14 * TAU + rand(-0.15, 0.15));
  }

  hit(x, y) { return Math.hypot(x - this.x, y - this.y) < this.r + 3; }
  update() {}

  draw(r, t) {
    const { x, y, id } = this;
    r.ellipsoid(x, y, this.r, this.r, 0, 0, this.r * 0.9, this.m, id);
    for (let k = 0; k < this.spines.length; k++) {
      const a = this.spines[k] + Math.sin(t * 1.3 + k * 0.7 + this.phase) * 0.12, L = this.r + 2.8;
      r.tube(x + Math.cos(a) * this.r * 0.6, y + Math.sin(a) * this.r * 0.6, 0.45, this.r * 0.6,
        x + Math.cos(a) * L, y + Math.sin(a) * L, 0.4, this.r * 0.9, 0.8, this.m, id);
    }
  }
}
