'use strict';
// More animals: crab, stingray, frog, water snake, snail, jellyfish.

// ---- crab: eight IK legs, walks sideways -----------------------------------------

const CRAB_VARIETIES = [
  { shell: mat('#4a120c', '#8a2a1a', '#c8462a', '#f28a5a'), leg: mat('#3a0e0a', '#6a2214', '#9a3620', '#cc6038') },
  { shell: mat('#16243c', '#2a4468', '#446a9a', '#82a6d0'), leg: mat('#6a3a1a', '#a05a2a', '#d07a3a', '#f4a868') },
  { shell: mat('#3e3212', '#6c5826', '#9c843e', '#ccb46c'), leg: mat('#34290e', '#5c4a20', '#86703a', '#b09a60') },
];

class Crab extends Walker {
  constructor(world, x, y) {
    const v = pick(CRAB_VARIETIES);
    const legs = [];
    [-0.75, -0.25, 0.25, 0.75].forEach((d, k) => {
      for (const side of [1, -1]) {
        const ang = side * (PI / 2 + d);
        legs.push({ bi: 0, side, ang, sAng: ang, bend: side, group: (k + (side > 0 ? 0 : 1)) % 2 });
      }
    });
    super(world, x, y, {
      species: 'crab',
      links: [0.6], widths: [3.0, 3.0], constraint: PI,
      cruise: 9, maxSpeed: 20, turnRate: 4,
      wiggleAmp: 0, gaitK: 0, stepDur: 0.1, lift: 0.9, zBody: 1.6, sight: 55,
      outline: outlineOf(v.shell),
      legs: legs.map((l) => ({ ...l, reach: 2.6, inset: 1.0, l1: 2.2, l2: 2.6, stepDist: 2.4, r1: 0.75, r2: 0.6, foot: 0.5 })),
    });
    this.shellMat = v.shell;
    this.legMat = v.leg;
    const spot = [v.shell[0], v.shell[0], v.shell[1], v.shell[2]], s = rand(0, 99);
    this.shellShader = bakeShader((lx, ly) => (vnoise(lx * 2.5 + s, ly * 2.5, 17) > 0.68 ? spot : v.shell), 24, 24, -1);
  }

  legBase() { return this.face ?? this.heading + PI / 2; }

  // Face whichever sideways direction is closer, so reversing never spins the crab around.
  postMove(dt) {
    const a = this.heading, f = this.legBase();
    const c1 = a + PI / 2, c2 = a - PI / 2;
    const target = Math.abs(wrapAngle(c1 - f)) < Math.abs(wrapAngle(c2 - f)) ? c1 : c2;
    this.face = wrapAngle(f + clamp(wrapAngle(target - f), -3 * dt, 3 * dt));
  }

  draw(r, t) {
    const b = this.body, z = this.zBody, id = this.id, f = this.legBase();
    const cx = b.x[0], cy = b.y[0], fx = Math.cos(f), fy = Math.sin(f);
    this.drawLegs(r, this.legMat);
    r.ellipsoid(cx, cy, 2.7, 4.0, f, z, 2.4, this.shellShader, id);
    for (const s of [-1, 1]) {
      const la = f + s * PI / 2;
      const bx = cx + fx * 1.8 + Math.cos(la) * 2.2, by = cy + fy * 1.8 + Math.sin(la) * 2.2;
      const ca = f + s * 0.35;
      const hx = bx + Math.cos(ca) * 2.6, hy = by + Math.sin(ca) * 2.6;
      r.tube(bx, by, 0.8, z + 1, hx, hy, 0.8, z + 1.2, 0.8, this.legMat, id);
      r.ellipsoid(hx + fx * 0.6, hy + fy * 0.6, 1.7, 1.1, f + s * 0.2, z + 1.3, 1.2, this.shellMat, id);
      const open = Math.sin(t * 3 + this.phase + s) > 0.6 ? 0.55 : 0.15;
      for (const k of [-1, 1]) {
        const pa = f + k * open;
        const px = hx + fx * 1.8, py = hy + fy * 1.8;
        r.tube(px, py, 0.6, z + 1.5, px + Math.cos(pa) * 1.6, py + Math.sin(pa) * 1.6, 0.4, z + 1.5, 0.8, this.shellMat, id);
      }
      r.dot(cx + fx * 2.3 + Math.cos(la) * 0.9, cy + fy * 2.3 + Math.sin(la) * 0.9, z + 3.4, EYE, id);
    }
  }
}

// ---- stingray: flat disc with rippling wing edges ------------------------------------

const RAY_VARIETIES = [
  { body: mat('#4a3e1e', '#7a6634', '#a68e4e', '#d0ba78'), shade: mat('#3a3016', '#5c4c26', '#7e6a38', '#a68e4e'), spot: mat('#0e3a7a', '#1a5ab8', '#3a8cf0', '#8ac4ff'), tail: mat('#0e3a7a', '#1a5ab8', '#3a8cf0', '#8ac4ff') },
  { body: mat('#0e0e12', '#1a1a22', '#2a2a36', '#44445a'), shade: mat('#08080c', '#121218', '#1e1e28', '#2a2a36'), spot: mat('#9a9a8a', '#cacab4', '#eeeedc', '#ffffff'), tail: mat('#0e0e12', '#1a1a22', '#2a2a36', '#44445a') },
];

class Ray extends Fish {
  constructor(world, x, y) {
    const v = pick(RAY_VARIETIES);
    super(world, x, y, {
      species: 'ray',
      links: [2.4, 2.4, 2.2, 2, 2, 2, 2, 1.8, 1.8],
      widths: [2.2, 3, 3, 1, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
      constraint: PI / 9,
      cruise: 7, maxSpeed: 16, turnRate: 1.4,
      wiggleAmp: 0.06, wiggleFreq: 2,
      zMin: 1.5, zMax: 6, sight: 60, skittish: false,
      outline: outlineOf(v.body),
      foodFilter: (f) => f.z < 6,
    });
    this.v = v;
    this.flap = rand(0, TAU);
    const s = rand(0, 99);
    const spots = bakeShader((lx, ly) => (vnoise(lx * 3.5 + s, ly * 4.2 + s, 7) > 0.7 ? v.spot : v.body), 32, 32, -1);
    this.disc = (lx, ly) => (Math.abs(ly) > 0.55 && Math.sin(lx * 5 + this.flap * 2) > 0.55 ? v.shade : spots(lx, ly));
  }

  update(dt, world) {
    super.update(dt, world);
    this.flap += dt * (2 + this.speed * 0.25);
  }

  draw(r) {
    const b = this.body, z = this.z, id = this.id, a = b.a[1];
    const cx = (b.x[1] + b.x[2]) / 2, cy = (b.y[1] + b.y[2]) / 2;
    for (let i = 2; i < b.n - 1; i++) {
      const w0 = lerp(0.9, 0.35, (i - 2) / (b.n - 3)), w1 = lerp(0.9, 0.35, (i - 1) / (b.n - 3));
      r.tube(b.x[i], b.y[i], w0, z + 0.4, b.x[i + 1], b.y[i + 1], w1, z + 0.4, 1, this.v.tail, id);
    }
    r.ellipsoid(cx, cy, 6, 8 * (0.94 + 0.06 * Math.sin(this.flap * 2)), a, z, 1.4, this.disc, id);
    for (const s of [-1, 1]) {
      const la = a + s * PI / 2;
      r.dot(cx + Math.cos(a) * 2.6 + Math.cos(la) * 1.4, cy + Math.sin(a) * 2.6 + Math.sin(la) * 1.4, z + 1.6, EYE, id);
    }
  }
}

// ---- frog: sits on lily pads, hops between them, swims with a breaststroke ----------

const FROG_VARIETIES = [
  { skin: mat('#1c3a12', '#2e5e1c', '#4a8a2c', '#86c050'), spot: mat('#0e1e0a', '#18300e', '#244416', '#345c20'), eye: mat('#5a4a10', '#9a8420', '#d8bc3a', '#fff27a') },
  { skin: mat('#0a2a5a', '#1450a0', '#2a7ad8', '#78b8ff'), spot: mat('#06080e', '#0c1018', '#141a26', '#1e2636'), eye: mat('#06080e', '#0c1018', '#141a26', '#2e3a50') },
  { skin: mat('#6a2a08', '#b04a10', '#ec7a1c', '#ffb45a'), spot: mat('#1a0e06', '#2a160a', '#3a200e', '#4a2c14'), eye: mat('#1a0e06', '#2a160a', '#3a200e', '#4a2c14') },
  { skin: mat('#2c5a10', '#4a8e1a', '#76c42a', '#b4f05a'), spot: null, eye: mat('#6a0a06', '#a01c10', '#e0321e', '#ff7a5a') },
];

const FROG_TONGUE = mat('#8a2a3a', '#c84a5a', '#f07a8a', '#ffb0ba');

class Frog extends Creature {
  constructor(world, x, y) {
    super(world, x, y);
    const v = pick(FROG_VARIETIES);
    this.species = 'frog';
    this.v = v;
    this.maxSpeed = 16;
    this.z = 40;
    this.body = new Chain(x, y, this.heading, [2.0, 2.2], [2.2, 3.0, 2.6], PI / 5);
    this.id = newId(outlineOf(v.skin));
    this.state = 'swim';
    this.kick = rand(0, 1);
    this.ext = 0;
    this.timer = rand(2, 5);
    const s = rand(0, 99);
    this.skin = bakeShader((u, vv) => (v.spot && vnoise(u * 4 + s, vv * 2.5, 23) > 0.66 ? v.spot : v.skin), 16, 16);
    this.legs = [1, -1].map((side) => ({ side, sx: 0, sy: 0, ex: 0, ey: 0, fx: 0, fy: 0 }));
    const live = world.pads.filter((p) => !p.dead);
    if (live.length) {
      const p = pick(live);
      this.land(p);
      [this.x, this.y] = this.padPos();
      this.body.place(this.x, this.y, this.heading);
    }
  }

  land(pad) {
    this.pad = pad;
    this.targetPad = null;
    this.state = 'sit';
    this.padOff = [rand(-PI, PI), rand(0, pad.r * 0.45)];
    this.faceOff = this.heading - pad.ang;
    this.timer = rand(4, 12);
  }

  padPos() {
    const p = this.pad, a = p.ang + this.padOff[0];
    return [p.x + Math.cos(a) * this.padOff[1], p.y + Math.sin(a) * this.padOff[1]];
  }

  startHop(world, pad) {
    const [x1, y1] = pad ? [pad.x, pad.y] : [clamp(this.x + rand(-30, 30), 8, world.W - 8), clamp(this.y + rand(-30, 30), 8, world.H - 8)];
    const d = Math.hypot(x1 - this.x, y1 - this.y);
    this.hop = { x0: this.x, y0: this.y, z0: this.z, x1, y1, pad, t: 0, dur: 0.45 + d / 120 };
    this.heading = Math.atan2(y1 - this.y, x1 - this.x);
    this.state = 'hop';
    this.pad = null;
  }

  update(dt, world) {
    this.timer -= dt;
    if (this.pad && this.pad.dead) { this.pad = null; this.state = 'swim'; }
    if (this.targetPad && this.targetPad.dead) this.targetPad = null;
    const live = world.pads.filter((p) => !p.dead);

    if (this.grabbed) {
      const p = world.pointer;
      this.state = 'swim'; this.pad = null; this.hop = null;
      this.turnToward(Math.atan2(p.y - this.y, p.x - this.x), 8, dt);
      this.x += (p.x - this.x) * Math.min(1, dt * 6);
      this.y += (p.y - this.y) * Math.min(1, dt * 6);
      this.z += (40 - this.z) * Math.min(1, dt * 3);
      this.ext = lerp(this.ext, 1, Math.min(1, dt * 6));
    } else if (this.state === 'sit') {
      [this.x, this.y] = this.padPos();
      this.heading = wrapAngle(this.pad.ang + this.faceOff);
      this.z += (45.6 - this.z) * Math.min(1, dt * 5);
      this.ext = lerp(this.ext, 0, Math.min(1, dt * 8));
      if (this.timer <= 0) {
        const near = live.filter((p) => p !== this.pad && Math.hypot(p.x - this.x, p.y - this.y) < 50);
        if (near.length && Math.random() < 0.6) this.startHop(world, pick(near));
        else if (Math.random() < 0.5) this.startHop(world, null);
        else this.timer = rand(3, 8);
      }
    } else if (this.state === 'hop') {
      const h = this.hop;
      h.t = Math.min(1, h.t + dt / h.dur);
      const tx = h.pad ? h.pad.x : h.x1, ty = h.pad ? h.pad.y : h.y1;
      this.x = lerp(h.x0, tx, h.t);
      this.y = lerp(h.y0, ty, h.t);
      this.z = lerp(h.z0, h.pad ? 45.6 : 40, h.t) + Math.sin(PI * h.t) * 12;
      this.ext = h.t < 0.5 ? 1 : 1 - (h.t - 0.5) * 2;
      if (h.t >= 1) {
        if (h.pad && !h.pad.dead) this.land(h.pad);
        else { this.state = 'swim'; this.timer = rand(3, 7); }
        this.hop = null;
      }
    } else {
      if (!this.targetPad && this.timer <= 0 && live.length) this.targetPad = pick(live);
      if (!this.targetPad && (this.timer <= 0 || Math.hypot(this.tx - this.x, this.ty - this.y) < 6)) {
        this.newTarget(world);
        this.timer = rand(3, 7);
      }
      const gx = this.targetPad ? this.targetPad.x : this.tx, gy = this.targetPad ? this.targetPad.y : this.ty;
      this.turnToward(Math.atan2(gy - this.y, gx - this.x), 2.5, dt);
      this.kick = (this.kick + dt * 1.4) % 1;
      const k = this.kick;
      this.ext = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75;
      if (k < 0.25) this.speed += 45 * dt;
      this.speed *= 1 - Math.min(1, 1.8 * dt);
      this.x = clamp(this.x + Math.cos(this.heading) * this.speed * dt, 2, world.W - 2);
      this.y = clamp(this.y + Math.sin(this.heading) * this.speed * dt, 2, world.H - 2);
      this.z += (40 - this.z) * Math.min(1, dt * 2);
      if (this.targetPad && Math.hypot(gx - this.x, gy - this.y) < this.targetPad.r * 0.7) this.land(this.targetPad);
    }
    this.body.resolve(this.x, this.y, this.heading);
    this.updateTongue(dt, world);

    const b = this.body, back = b.a[2] + PI, e = this.ext;
    for (const L of this.legs) {
      L.sx = b.px(2, L.side * PI * 0.72, -0.8);
      L.sy = b.py(2, L.side * PI * 0.72, -0.8);
      const la = b.a[2] + L.side * PI / 2, bd = 1.2 + 3.6 * e, ld = 2.6 * (1 - e) + 0.6;
      [L.ex, L.ey, L.fx, L.fy] = solveLimb(L.sx, L.sy,
        L.sx + Math.cos(back) * bd + Math.cos(la) * ld, L.sy + Math.sin(back) * bd + Math.sin(la) * ld, 2.6, 2.8, L.side);
    }
  }

  // Snap at gnats, fireflies and the odd dragonfly that come within reach.
  updateTongue(dt, world) {
    this.tongueCD = (this.tongueCD || 0) - dt;
    const b = this.body, mx = b.px(0, 0, 0.2), my = b.py(0, 0, 0.2);
    if (!this.tongue && this.tongueCD <= 0 && !this.grabbed && this.state !== 'hop') {
      for (const c of world.creatures) {
        if (c.caught || c.gone || c.grabbed || (c.alpha ?? 1) < 1) continue;
        if (c.species !== 'gnat' && c.species !== 'firefly' && !(c.species === 'dragonfly' && Math.random() < 0.02)) continue;
        if ((c.x - mx) ** 2 + (c.y - my) ** 2 < 18 * 18) {
          this.tongue = { target: c, tx: c.x, ty: c.y, t: 0, got: false };
          this.heading = Math.atan2(c.y - this.y, c.x - this.x);
          break;
        }
      }
    }
    const tg = this.tongue;
    if (!tg) return;
    tg.t += dt / 0.3;
    if (!tg.got && tg.t >= 0.5) {
      tg.got = true;
      if (!tg.target.caught && Math.hypot(tg.target.x - mx, tg.target.y - my) < 20) eat(world, this, tg.target);
    }
    if (tg.t < 0.5) { tg.tx = tg.target.x; tg.ty = tg.target.y; }
    const ext = tg.t < 0.5 ? tg.t * 2 : Math.max(0, 2 - tg.t * 2);
    tg.x = mx + (tg.tx - mx) * ext; tg.y = my + (tg.ty - my) * ext; tg.mx = mx; tg.my = my;
    if (tg.t >= 1) { this.tongue = null; this.tongueCD = rand(1, 2.5); }
  }

  draw(r) {
    const b = this.body, z = this.z, id = this.id, m = this.v.skin;
    const tg = this.tongue;
    if (tg && tg.mx !== undefined) r.tube(tg.mx, tg.my, 0.5, z + 1.5, tg.x, tg.y, 0.6, z + 1.8, 0.8, FROG_TONGUE, id);
    for (const L of this.legs) {
      r.tube(L.sx, L.sy, 1.0, z + 0.8, L.ex, L.ey, 0.8, z + 0.6, 0.8, m, id);
      r.tube(L.ex, L.ey, 0.8, z + 0.6, L.fx, L.fy, 0.6, z + 0.3, 0.8, m, id);
      r.ellipsoid(L.fx, L.fy, 1.3, 0.9, b.a[2] + PI, z + 0.2, 0.4, m, id);
    }
    for (const s of [-1, 1]) {
      const hx = b.px(1, s * PI / 3.2, 1.4), hy = b.py(1, s * PI / 3.2, 1.4);
      r.tube(b.px(1, s * PI / 2, -0.6), b.py(1, s * PI / 2, -0.6), 0.6, z + 0.8, hx, hy, 0.5, z + 0.3, 0.8, m, id);
    }
    this.drawSpine(r, 0, 2, z, 0.8, this.skin, id);
    for (const s of [-1, 1]) {
      const ex = b.px(0, s * 1.0, -0.4), ey = b.py(0, s * 1.0, -0.4);
      r.ellipsoid(ex, ey, 1.0, 1.0, 0, z + 1.2, 1.2, this.v.eye, id);
      r.dot(ex, ey, z + 2.5, EYE, id);
    }
  }
}

// ---- water snake: long surface swimmer ------------------------------------------------

const SNAKE_VARIETIES = [
  { base: mat('#2e2414', '#4e3e22', '#6e5a34', '#9a8250'), band: mat('#140e08', '#22180c', '#342614', '#4a3820') },
  { base: mat('#1e3a14', '#325e20', '#4a8430', '#78b04c'), band: mat('#142a0e', '#1e3e14', '#2a521c', '#3a6a28'), collar: mat('#7a6a10', '#b89e1c', '#ecd23a', '#fff49a') },
  { base: mat('#3e5068', '#5e7894', '#86a2bc', '#bcd4e6'), band: mat('#08090c', '#121418', '#1c2026', '#2c323c') },
];

class Snake extends Fish {
  constructor(world, x, y) {
    const v = pick(SNAKE_VARIETIES);
    const n = 40;
    super(world, x, y, {
      species: 'snake',
      links: new Array(n - 1).fill(1.6),
      widths: Array.from({ length: n }, (_, i) => (i === 0 ? 1.7 : i === 1 ? 1.9 : i === 2 ? 1.3 : Math.max(0.45, 1.6 - i * 0.03))),
      constraint: PI / 6,
      cruise: 10, maxSpeed: 20, turnRate: 2,
      wiggleAmp: 0.7, wiggleFreq: 3.5,
      zMin: 38, zMax: 41, sight: 50, skittish: false,
      outline: outlineOf(v.base),
      foodFilter: (f) => f.z > 30,
    });
    this.skin = bakeShader((u) => {
      if (v.collar && u > 0.035 && u < 0.06) return v.collar;
      return u > 0.05 && Math.sin(u * 90) > 0.35 ? v.band : v.base;
    }, 256, 1);
  }

  draw(r, t) {
    const b = this.body, z = this.z;
    this.drawSpine(r, 0, b.n - 1, z, 0.9, this.skin, this.id);
    this.drawEyes(r, 0.8, 0.5, z + b.w[0] + 0.6, false);
    if (Math.sin(t * 2.5 + this.phase) > 0.9) {
      const a = b.a[0], hx = b.x[0] + Math.cos(a) * (b.w[0] + 0.8), hy = b.y[0] + Math.sin(a) * (b.w[0] + 0.8);
      const tongue = solid('#d0283a');
      r.dot(hx, hy, z + 1, tongue, this.id);
      for (const s of [-1, 1]) r.dot(hx + Math.cos(a + s * 0.5) * 1.2, hy + Math.sin(a + s * 0.5) * 1.2, z + 1, tongue, this.id);
    }
  }
}

// ---- snail: slow walker with a spiral shell ----------------------------------------------

const SNAIL_VARIETIES = [
  { shell: mat('#4a140c', '#822a18', '#b84428', '#e67a4a'), stripe: mat('#2a0a06', '#4a140c', '#6a2012', '#8a3018'), body: mat('#4a3a2e', '#7a6654', '#a48e78', '#d0bca4'), mode: 'spiral' },
  { shell: mat('#6a4a0e', '#aa7e1a', '#e2b036', '#ffe488'), stripe: mat('#3a260a', '#5a3c10', '#7a5418', '#9a6c20'), body: mat('#3a3a3e', '#5e5e66', '#86868e', '#b4b4ba'), mode: 'spiral' },
  { shell: mat('#5e5016', '#9a8428', '#cfb846', '#f6e488'), stripe: mat('#0c0c0a', '#161612', '#22221c', '#32322a'), body: mat('#3a3a3e', '#5e5e66', '#86868e', '#b4b4ba'), mode: 'zebra' },
];

class Snail extends Walker {
  constructor(world, x, y) {
    const v = pick(SNAIL_VARIETIES);
    super(world, x, y, {
      species: 'snail',
      links: [1.1, 1.1, 1.1], widths: [1.2, 1.5, 1.5, 1.0], constraint: PI / 6,
      cruise: 1.6, maxSpeed: 2.6, turnRate: 0.8,
      wiggleAmp: 0, gaitK: 0, stepDur: 1, lift: 0, zBody: 0.6, sight: 40,
      outline: outlineOf(v.shell), legs: [],
    });
    this.v = v;
    this.shell = bakeShader((lx, ly) => {
      const d = Math.sqrt(lx * lx + ly * ly), a = Math.atan2(ly, lx) / TAU;
      const k = v.mode === 'zebra' ? a * 7 + d * 1.2 : a + d * 1.8;
      return ((k % 1) + 1) % 1 < 0.2 ? v.stripe : v.shell;
    }, 24, 24, -1);
  }

  draw(r) {
    const b = this.body, z = this.zBody, id = this.id, a = b.a[0];
    this.drawSpine(r, 0, b.n - 1, z, 0.45, this.v.body, id);
    for (const s of [-1, 1]) {
      const bx = b.px(0, s * 0.6, -0.4), by = b.py(0, s * 0.6, -0.4);
      const tx = bx + Math.cos(a + s * 0.45) * 1.9, ty = by + Math.sin(a + s * 0.45) * 1.9;
      r.tube(bx, by, 0.5, z + 0.5, tx, ty, 0.45, z + 1.4, 0.8, this.v.body, id);
      r.dot(tx, ty, z + 1.9, EYE, id);
    }
    r.ellipsoid(b.x[2] - Math.cos(b.a[2]) * 0.4, b.y[2] - Math.sin(b.a[2]) * 0.4, 2.7, 2.4, b.a[2], z + 0.3, 3.0, this.shell, id);
  }
}

// ---- jellyfish: pulsing bell, tentacles are trailing chains -------------------------------

const JELLY_VARIETIES = [
  { bell: mat('#5a6a98', '#8a9ac8', '#bccaee', '#eef2ff'), gonad: mat('#9a4a7a', '#c86aa0', '#f094c4', '#ffc8e4'), tent: mat('#7a8ab8', '#a4b4dc', '#d0dcf6', '#ffffff') },
  { bell: mat('#8a3a10', '#c8641c', '#f0943a', '#ffc878'), gonad: mat('#6a1a0a', '#a02a14', '#d0442a', '#ff7a5a'), tent: mat('#7a2412', '#b43e26', '#e06440', '#ff9a70') },
  { bell: mat('#3e2470', '#6a40a8', '#9a6ade', '#d2b0ff'), gonad: mat('#241656', '#3e2a92', '#6246cc', '#a088ff'), tent: mat('#4a2a80', '#7a4ab8', '#a87ae6', '#dcc0ff') },
];

class Jelly extends Creature {
  constructor(world, x, y) {
    super(world, x, y);
    const v = pick(JELLY_VARIETIES);
    this.species = 'jelly';
    this.v = v;
    this.R = rand(3.5, 5.5);
    this.z = this.tz = rand(22, 34);
    this.vx = 0; this.vy = 0;
    this.pulse = rand(0, 1);
    this.freq = rand(0.55, 0.85);
    this.spin = rand(-PI, PI);
    this.c = 0;
    this.maxSpeed = 12;
    this.id = newId(outlineOf(v.bell));
    EMISSIVE[this.id] = 1;
    this.tents = Array.from({ length: 8 }, () => new Chain(x, y, 0, new Array(7).fill(1.4), new Array(8).fill(0.4), PI / 5));
    this.arms = Array.from({ length: 4 }, () => new Chain(x, y, 0, [1.3, 1.3, 1.3, 1.2], [1, 0.9, 0.8, 0.7, 0.5], PI / 6));
    this.body = this.tents[0];
    this.place(x, y);
    this.bellShader = (lx, ly) => {
      const d = Math.sqrt(lx * lx + ly * ly), a = Math.atan2(ly, lx) - this.spin;
      if (d > 0.86) return v.tent;
      if (d > 0.22 && d < 0.5 && Math.cos(4 * a) > 0.35) return v.gonad;
      return v.bell;
    };
  }

  place(x, y) {
    this.tents.forEach((ch, k) => { const a = k / 8 * TAU; ch.place(x + Math.cos(a) * this.R, y + Math.sin(a) * this.R, a); });
    this.arms.forEach((ch, k) => { const a = k / 4 * TAU + 0.4; ch.place(x + Math.cos(a), y + Math.sin(a), a); });
  }

  hit(px, py) { return Math.hypot(px - this.x, py - this.y) < this.R + 2; }
  chains() { return [...this.tents, ...this.arms]; }

  update(dt, world) {
    this.timer -= dt;
    this.pulse += dt * this.freq;
    const ph = this.pulse % 1;
    this.c = ph < 0.3 ? Math.sin(ph / 0.3 * PI) : 0;
    if (this.grabbed) {
      const p = world.pointer;
      this.vx = (p.x - this.x) * 5; this.vy = (p.y - this.y) * 5;
    } else {
      if (this.timer <= 0) { this.newTarget(world); this.timer = rand(6, 14); this.tz = rand(20, 36); }
      let gx = this.tx - this.x, gy = this.ty - this.y;
      const gl = Math.hypot(gx, gy) || 1;
      const [ax, ay] = this.avoid(world, 99);
      gx = gx / gl + ax * 2; gy = gy / gl + ay * 2;
      this.turnToward(Math.atan2(gy, gx), 0.8, dt);
      if (ph < 0.3) { this.vx += Math.cos(this.heading) * this.c * 24 * dt; this.vy += Math.sin(this.heading) * this.c * 24 * dt; }
      const k = 1 - Math.min(1, dt * 1.4);
      this.vx = this.vx * k + world.current.x * 3 * dt;
      this.vy = this.vy * k + world.current.y * 3 * dt;
    }
    this.x = clamp(this.x + this.vx * dt, 2, world.W - 2);
    this.y = clamp(this.y + this.vy * dt, 2, world.H - 2);
    this.z += (this.tz - this.z) * Math.min(1, dt * 0.3) + this.c * dt * 2;
    this.speed = Math.hypot(this.vx, this.vy);
    this.spin += dt * 0.1;

    const rim = this.R * 0.8 * (1 - 0.15 * this.c), t = world.t;
    const drift = (ch, k, a, out) => {
      for (let i = 1; i < ch.n; i++) {
        ch.x[i] += (Math.cos(a) * out - this.vx * 0.4 + Math.sin(t * 1.5 + k + i * 0.7) * 0.6) * dt;
        ch.y[i] += (Math.sin(a) * out - this.vy * 0.4 + Math.cos(t * 1.3 + k + i * 0.7) * 0.6) * dt;
      }
    };
    this.tents.forEach((ch, k) => {
      const a = k / 8 * TAU + this.spin;
      drift(ch, k, a, 1.2);
      ch.resolve(this.x + Math.cos(a) * rim, this.y + Math.sin(a) * rim, a);
    });
    this.arms.forEach((ch, k) => {
      const a = k / 4 * TAU + this.spin + 0.4;
      drift(ch, k, a, 0.5);
      ch.resolve(this.x + Math.cos(a) * 0.8, this.y + Math.sin(a) * 0.8, a);
    });
  }

  draw(r) {
    const z = this.z, id = this.id;
    for (const ch of this.tents) {
      for (let i = 0; i < ch.n - 1; i++) {
        r.tube(ch.x[i], ch.y[i], 0.45, z - 1 - i * 1.2, ch.x[i + 1], ch.y[i + 1], 0.45, z - 2.2 - i * 1.2, 0.8, this.v.tent, id);
      }
    }
    for (const ch of this.arms) {
      for (let i = 0; i < ch.n - 1; i++) {
        r.tube(ch.x[i], ch.y[i], ch.w[i], z - 0.5 - i, ch.x[i + 1], ch.y[i + 1], ch.w[i + 1], z - 1.5 - i, 0.8, this.v.gonad, id);
      }
    }
    const Rb = this.R * (1 - 0.18 * this.c);
    r.ellipsoid(this.x, this.y, Rb, Rb, 0, z, this.R * 0.8 * (1 + 0.25 * this.c), this.bellShader, id);
  }
}

Object.assign(SPECIES, {
  crab: { label: 'Crab', color: '#c8462a', spawn: (w, x, y) => [new Crab(w, x, y)] },
  ray: { label: 'Stingray', color: '#3a8cf0', spawn: (w, x, y) => [new Ray(w, x, y)] },
  frog: { label: 'Frog', color: '#4a8a2c', spawn: (w, x, y) => [new Frog(w, x, y)] },
  snake: { label: 'Snake', color: '#6e5a34', spawn: (w, x, y) => [new Snake(w, x, y)] },
  snail: {
    label: 'Snails', color: '#e2b036',
    spawn: (w, x, y) => Array.from({ length: 3 }, () => new Snail(w, x + rand(-12, 12), y + rand(-12, 12))),
  },
  jelly: { label: 'Jellies', color: '#bccaee', spawn: (w, x, y) => [new Jelly(w, x, y)] },
});
