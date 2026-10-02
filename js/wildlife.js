'use strict';
// Even more animals: clownfish (live in anemones), pufferfish, octopus, ducks
// with ducklings, shrimp, dragonflies, and fireflies that come out at night.

const WILD = {
  clown: mat('#7a2a04', '#c44a0a', '#f27a1c', '#ffb468'),
  clownFin: mat('#6a2004', '#b0400c', '#e8681c', '#ffa060'),
  clownWhite: mat('#9aa2aa', '#d2d8dc', '#f2f4f2', '#ffffff'),
  clownBlack: solid('#120a06'),
  spike: mat('#8a8470', '#bab49c', '#e2dcc4', '#fffaea'),
  ink: mat('#06060c', '#0c0c16', '#141424', '#20203a'),
  octoEye: mat('#7a6a1a', '#b09a2a', '#e0c848', '#fff08a'),
  flash: hexToInt('#e0402a'),
  duckHead: mat('#0a2a14', '#12502a', '#1e7a3e', '#4ab070'),
  bill: mat('#8a6a0a', '#c89a14', '#f2c630', '#fff08a'),
  henBill: mat('#6a3a10', '#a05a1a', '#d0802a', '#f4aa5a'),
  collar: mat('#9aa0a0', '#d0d4d0', '#f0f2ee', '#ffffff'),
  drake: mat('#4a4a46', '#76766e', '#a4a49a', '#d0d0c6'),
  wing: mat('#3a2e22', '#5a4838', '#7e6650', '#a88c70'),
  speculum: mat('#1a2a6a', '#2a44a8', '#3a64e0', '#80a8ff'),
  tail: mat('#101010', '#1e1e1e', '#2e2e2e', '#484848'),
  hen: mat('#4a3218', '#74502a', '#9c7040', '#c8985c'),
  henSpot: mat('#2a1a0a', '#3e2a14', '#56401e', '#6e542c'),
  feet: mat('#8a3a0a', '#c85a14', '#f07a20', '#ffa850'),
  duckling: mat('#7a6a18', '#b89e2a', '#ecd24a', '#fff49a'),
  ducklingBack: mat('#3a2e14', '#5a4820', '#7a6430', '#a08650'),
  ripple: mat('#a8d8e0', '#c8ecf0', '#e4f8fa', '#ffffff'),
  wingGlass: mat('#8aa0b4', '#b0c4d4', '#d6e4ee', '#f4faff'),
  fireflyLight: mat('#b8e03a', '#d8f45a', '#f0ff8a', '#ffffd0'),
  fireflyBlue: mat('#2a6ae0', '#4a98ff', '#8cc8ff', '#e0f4ff'),
  fireflyBody: solid('#1a140c'),
};

// ---- clownfish: hover in and out of an anemone's tentacles, chase off intruders ----

class Clownfish extends Fish {
  constructor(world, x, y) {
    super(world, x, y, {
      species: 'clown',
      links: new Array(6).fill(1.3),
      widths: [1.3, 1.7, 1.8, 1.6, 1.2, 0.8, 0],
      constraint: PI / 5,
      cruise: 6, maxSpeed: 18, turnRate: 5,
      wiggleAmp: 0.4, wiggleFreq: 12,
      zMin: 4, zMax: 7, sight: 40, skittish: false,
      outline: hexToInt('#1a0804'),
    });
    const bands = [[0.14, 0.08], [0.48, 0.08], [0.82, 0.05]];
    this.skin = bakeShader((u) => {
      for (const [c, hw] of bands) {
        const d = Math.abs(u - c);
        if (d < hw) return WILD.clownWhite;
        if (d < hw + 0.04) return WILD.clownBlack;
      }
      return WILD.clown;
    }, 64, 1);
    this.host = null;
  }

  findHost(world) {
    let best = null, bd = Infinity;
    for (const p of world.plants) {
      if (!(p instanceof Anemone)) continue;
      const d = (p.x - this.x) ** 2 + (p.y - this.y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    this.host = best;
  }

  wander(world) {
    if (!this.host || this.host.dead) this.findHost(world);
    const h = this.host;
    if (!h) return super.wander(world);
    const a = rand(-PI, PI), d = rand(0, h.R + h.len * 0.8);
    this.tx = h.x + Math.cos(a) * d; this.ty = h.y + Math.sin(a) * d;
    this.tz = rand(this.zMin, this.zMax);
    this.timer = rand(0.5, 1.4);
    this.cruiseNow = this.cruise * rand(0.5, 1);
  }

  // Dart at any other fish that swims into the home anemone.
  social(world) {
    const h = this.host;
    if (!h || h.dead || this.leaving) return [0, 0];
    const reach = h.R + h.len + 8;
    for (const o of world.creatures) {
      if (o.species === 'clown' || o.z > 14 || !o.body) continue;
      if ((o.x - h.x) ** 2 + (o.y - h.y) ** 2 < reach * reach) {
        const dx = o.x - this.x, dy = o.y - this.y, d = Math.hypot(dx, dy) || 1;
        this.cruiseNow = this.maxSpeed;
        return [dx / d * 2, dy / d * 2];
      }
    }
    const dx = h.x - this.x, dy = h.y - this.y, d = Math.hypot(dx, dy);
    return d > reach + 6 ? [dx / d * 2, dy / d * 2] : [0, 0];
  }

  draw(r) {
    const b = this.body, z = this.z, id = this.id;
    this.drawSpine(r, 0, 5, z, 1, this.skin, id);
    r.tube(b.x[5], b.y[5], 0.8, z, b.x[6], b.y[6], 1.6, z, 0.3, WILD.clownFin, id);
    for (const s of [-1, 1]) {
      r.ellipsoid(b.px(1, s * PI / 2.4, 0), b.py(1, s * PI / 2.4, 0), 1.3, 0.7, b.a[1] - s * 0.9, z + 0.3, 0.4, WILD.clownFin, id);
    }
  }
}

// ---- pufferfish: balloons up with spikes when something big comes close ------------

const PUFFER_VARIETIES = [
  { skin: mat('#4a3c1c', '#766232', '#a08a4e', '#ccb87a'), spot: mat('#1c160a', '#2e2410', '#403418', '#524420') },
  { skin: mat('#6a5a0e', '#a88e1a', '#e2c230', '#fff07a'), spot: mat('#0e0e0a', '#1a1a12', '#26261c', '#34342a') },
  { skin: mat('#2e4018', '#4a6428', '#6e8c3c', '#9cb85e'), spot: mat('#10160a', '#1c2410', '#283418', '#344420') },
];
const BIG_ANIMALS = new Set(['koi', 'eel', 'turtle', 'snake', 'octopus', 'ray', 'duck']);

class Puffer extends Fish {
  constructor(world, x, y) {
    const v = pick(PUFFER_VARIETIES);
    const widths = [2.2, 2.8, 3.0, 2.8, 2.0, 1.0, 0];
    super(world, x, y, {
      species: 'puffer',
      links: [1.6, 1.6, 1.6, 1.4, 1.2, 1.4],
      widths: widths.slice(),
      constraint: PI / 6,
      cruise: 4, maxSpeed: 10, turnRate: 1.8,
      wiggleAmp: 0.15, wiggleFreq: 5,
      zMin: 5, zMax: 18, sight: 60, skittish: false,
      outline: outlineOf(v.skin),
    });
    this.v = v;
    this.baseW = widths;
    this.inflate = 0;
    this.scare = 0;
    const s = rand(0, 99);
    this.skin = bakeShader((u, vv) => (vnoise(u * 9 + s, vv * 3, 29) > 0.64 ? v.spot : v.skin), 32, 16);
  }

  update(dt, world) {
    const p = world.pointer;
    let threat = this.grabbed || (p.inside && (p.x - this.x) ** 2 + (p.y - this.y) ** 2 < 196);
    for (const o of world.creatures) {
      if (threat) break;
      if (BIG_ANIMALS.has(o.species) && Math.abs(o.z - this.z) < 12 && (o.x - this.x) ** 2 + (o.y - this.y) ** 2 < 144) threat = true;
    }
    if (threat) this.scare = 3;
    this.scare -= dt;
    const target = this.scare > 0 ? 1 : 0;
    this.inflate += (target - this.inflate) * Math.min(1, dt * (target ? 6 : 0.8));
    this.maxSpeed = 10 * (1 - 0.8 * this.inflate);
    super.update(dt, world);
    this.speed = Math.min(this.speed, Math.max(this.maxSpeed, 1));
    const w = this.body.w;
    for (let i = 0; i < 6; i++) w[i] = this.baseW[i] * (1 + this.inflate * Math.max(0, 1 - Math.abs(i - 2) * 0.22));
  }

  draw(r, t) {
    const b = this.body, z = this.z, id = this.id, inf = this.inflate;
    this.drawSpine(r, 0, 5, z, 1, this.skin, id);
    r.tube(b.x[5], b.y[5], 1.0, z, b.x[6], b.y[6], 1.9, z, 0.3, this.v.skin, id);
    for (const s of [-1, 1]) {
      const f = Math.sin(t * 12 + s) * 0.4;
      r.ellipsoid(b.px(1, s * PI / 2, 0.2), b.py(1, s * PI / 2, 0.2), 1.3, 0.7, b.a[1] + s * (PI / 2 + f), z + 0.4, 0.4, this.v.skin, id);
    }
    if (inf > 0.25) {
      for (let i = 1; i <= 4; i++) {
        for (const s of [-1, 1]) {
          for (const off of [0.7, 1.3, 1.9, 2.5]) {
            const ang = s * off;
            r.tube(b.px(i, ang, -0.3), b.py(i, ang, -0.3), 0.45, z + b.w[i] * 0.5,
              b.px(i, ang, 1.2 * inf), b.py(i, ang, 1.2 * inf), 0.4, z + b.w[i] * 0.5, 0.8, WILD.spike, id);
          }
        }
      }
    }
    this.drawEyes(r, 1.0, 0.7, z + b.w[0] + 0.7, true);
  }
}

// ---- octopus: FABRIK arms that plant and step, jets away in a puff of ink ------------

const OCTO_VARIETIES = [
  mat('#4a1a10', '#7a2e1a', '#a8482a', '#d47a50'),
  mat('#3a2c3e', '#5c4664', '#806890', '#ae96bc'),
  mat('#5a3a14', '#8a5c22', '#b88034', '#e0ac5c'),
];

class Octopus extends Creature {
  constructor(world, x, y) {
    super(world, x, y);
    this.species = 'octopus';
    this.base = pick(OCTO_VARIETIES);
    this.mat = this.base;
    this.z = 1.2;
    this.cruise = 5; this.maxSpeed = 14; this.turnRate = 1.4; this.sight = 60;
    this.id = newId(outlineOf(this.base));
    this.inkId = newId(hexToInt('#020206'));
    this.body = new Chain(x, y, this.heading, [2.2], [3, 3], PI);
    this.arms = Array.from({ length: 8 }, (_, k) => ({
      ang: (k + 0.5) / 8 * TAU, phase: rand(0, TAU),
      ch: new Chain(x, y, 0, new Array(7).fill(1.5), [1.3, 1.2, 1.05, 0.9, 0.75, 0.6, 0.45, 0.3], PI / 4),
      tx: x, ty: y, ox: x, oy: y, t: 1, stepping: false, lift: 0,
    }));
    this.mode = 'pause';
    this.camo = 0; this.flash = 0; this.jet = 0;
    this.ink = [];
    const s = rand(0, 99);
    this.spots = bakeShader((lx, ly) => vnoise(lx * 3 + s, ly * 3, 37) > 0.62, 24, 24, -1);
    this.mantle = (lx, ly) => (this.spots(lx, ly) ? this.spotMat : this.mat);
    this.place(x, y);
  }

  armRest(arm, t) {
    const a = this.heading + arm.ang + Math.sin(t * 0.7 + arm.phase) * 0.2;
    const d = 7.5 + Math.sin(t * 0.9 + arm.phase) * 1.2;
    return [this.x + Math.cos(a) * d, this.y + Math.sin(a) * d];
  }

  armBase(arm) {
    const a = this.heading + arm.ang;
    return [this.x + Math.cos(a) * 1.6, this.y + Math.sin(a) * 1.6, a];
  }

  place(x, y) {
    this.x = x; this.y = y;
    this.body.place(x, y, this.heading);
    for (const arm of this.arms) {
      const [bx, by, a] = this.armBase(arm);
      arm.ch.place(bx, by, a + PI);
      [arm.tx, arm.ty] = this.armRest(arm, 0);
    }
  }

  hit(px, py) { return Math.hypot(px - this.x, py - this.y) < 5; }
  chains() { return this.arms.map((a) => a.ch); }

  inkEscape(threat) {
    if (!threat || this.grabbed || this.jet>0) return;
    this.jet=1.2;this.flash=1;
    this.heading=Math.atan2(this.y-threat.y,this.x-threat.x);this.speed=45;
    for(let i=0;i<9;i++)this.ink.push({x:this.x+rand(-2,2),y:this.y+rand(-2,2),r:rand(1,2.5),life:1});
  }

  update(dt, world) {
    this.timer -= dt;
    const p = world.pointer, t = world.t;
    if (!this.grabbed && this.jet <= 0 && p.inside && !world.grab && (p.x - this.x) ** 2 + (p.y - this.y) ** 2 < 144) {
      this.inkEscape(p);
    }
    if(this.life?.mind && (this.threat || this.dread) && Math.hypot(this.x-(this.threat||this.dread).x,this.y-(this.threat||this.dread).y)<12)this.inkEscape(this.threat||this.dread);
    if (this.grabbed) {
      const [gx, gy, want] = this.pointerGoal(world);
      this.turnToward(Math.atan2(gy, gx), 6, dt);
      this.speed += (want - this.speed) * Math.min(1, dt * 3);
    } else if (this.jet > 0) {
      this.jet -= dt;
      this.speed *= 1 - Math.min(1, dt * 1.5);
    } else {
      let gx = Math.cos(this.heading), gy = Math.sin(this.heading), want = 0;
      const intent = typeof mindIntent === 'function' ? mindIntent(world,this) : null;
      const prey = intent ? intent.prey || null : this.prey && !this.prey.caught && !this.prey.gone ? this.prey : null;
      const f = intent ? intent.food || prey : prey || world.nearestFood(this.x, this.y, this.sight, (fd) => fd.z < 3);
      if (f) {
        gx = f.x - this.x; gy = f.y - this.y; want = prey ? this.maxSpeed : this.cruise * 1.4;
        if (Math.hypot(gx, gy) < (prey ? 5 : 3)) eat(world, this, f);
      } else if (intent) {
        gx=intent.x-this.x;gy=intent.y-this.y;want=intent.speed;
      } else if (this.mode === 'walk') {
        if (this.timer <= 0 || Math.hypot(this.tx - this.x, this.ty - this.y) < 6) { this.mode = 'pause'; this.timer = rand(3, 9) * (2.2 - activity(world, this)); }
        gx = this.tx - this.x; gy = this.ty - this.y; want = this.cruise;
      } else if (this.timer <= 0) {
        this.mode = 'walk'; this.newTarget(world, true); this.timer = rand(4, 9);
      }
      const gl = Math.hypot(gx, gy) || 1, [ax, ay] = this.avoid(world, 0), [dx, dy] = deepPush(world, this);
      if(this.jet>0){gx=Math.cos(this.heading);gy=Math.sin(this.heading);want=this.speed;}
      this.turnToward(Math.atan2(gy / gl + ay * 2 + dy, gx / gl + ax * 2 + dx), this.turnRate, dt);
      this.speed += (want - this.speed) * Math.min(1, dt * 2);
    }
    this.x = clamp(this.x + Math.cos(this.heading) * this.speed * dt, 3, world.W - 3);
    this.y = clamp(this.y + Math.sin(this.heading) * this.speed * dt, 3, world.H - 3);
    this.z += ((this.jet > 0 ? 8 : 1.2) - this.z) * Math.min(1, dt * 3);
    this.body.resolve(this.x, this.y, this.heading);

    // Camouflage toward the floor colour when still; flash red when startled.
    const still = this.speed < 1 && this.jet <= 0 && !this.grabbed;
    this.camo = clamp(this.camo + (still ? dt * 0.3 : -dt * 1.5), 0, 1);
    this.flash = Math.max(0, this.flash - dt * 1.2);
    this.updateMaterials(world);

    const swimming = this.jet > 0 || this.grabbed;
    let stepping = this.arms.filter((a) => a.stepping).length;
    for (const arm of this.arms) {
      const [bx, by, a] = this.armBase(arm);
      if (swimming) {
        arm.ch.resolve(bx, by, a + PI);
        arm.stepping = false; arm.lift = 2;
        arm.tx = arm.ch.x[arm.ch.n - 1]; arm.ty = arm.ch.y[arm.ch.n - 1];
        continue;
      }
      const [rx, ry] = this.armRest(arm, t);
      if (!arm.stepping && stepping < 3 && Math.hypot(rx - arm.tx, ry - arm.ty) > 4.5) {
        arm.stepping = true; arm.t = 0; arm.ox = arm.tx; arm.oy = arm.ty; stepping++;
      }
      if (arm.stepping) {
        arm.t = Math.min(1, arm.t + dt / 0.35);
        const e = arm.t * arm.t * (3 - 2 * arm.t);
        arm.tx = lerp(arm.ox, rx, e); arm.ty = lerp(arm.oy, ry, e);
        arm.lift = Math.sin(PI * arm.t) * 2;
        if (arm.t >= 1) { arm.stepping = false; arm.lift = 0; }
      }
      arm.ch.reach(bx, by, arm.tx, arm.ty);
    }

    for (const k of this.ink) {
      k.r += dt * 3; k.life -= dt / 3;
      k.x += world.current.x * 3 * dt; k.y += world.current.y * 3 * dt;
    }
    this.ink = this.ink.filter((k) => k.life > 0);
  }

  updateMaterials(world) {
    let m = this.base;
    if (this.camo > 0.02 && world.bg) {
      const xi = clamp(Math.round(this.x), 0, world.W - 1), yi = clamp(Math.round(this.y), 0, world.H - 1);
      const c = world.bg[xi + yi * world.W], k = this.camo * 0.85;
      const floor = [mixColor(c, 0xff000000, 0.45), mixColor(c, 0xff000000, 0.2), c, mixColor(c, 0xffffffff, 0.2)];
      m = m.map((v, i) => mixColor(v, floor[i], k));
    }
    if (this.flash > 0) m = m.map((v) => mixColor(v, WILD.flash, this.flash * 0.7));
    this.mat = m;
    this.spotMat = [m[0], m[0], m[1], m[2]];
  }

  draw(r) {
    const z = this.z, id = this.id, h = this.heading;
    for (const k of this.ink) {
      r.ellipsoid(k.x, k.y, k.r, k.r, 0, 6 + k.life * 4, k.r * 0.6, WILD.ink, this.inkId);
    }
    for (const arm of this.arms) {
      const ch = arm.ch, n = ch.n;
      for (let i = 0; i < n - 1; i++) {
        const z0 = lerp(z + 1, arm.lift, i / (n - 1)), z1 = lerp(z + 1, arm.lift, (i + 1) / (n - 1));
        r.tube(ch.x[i], ch.y[i], ch.w[i], z0, ch.x[i + 1], ch.y[i + 1], ch.w[i + 1], z1, 0.8, this.mat, id);
      }
    }
    r.ellipsoid(this.x, this.y, 2.6, 2.6, 0, z + 0.6, 2.2, this.mat, id);
    r.ellipsoid(this.x - Math.cos(h) * 2.4, this.y - Math.sin(h) * 2.4, 4.4, 3.3, h, z + 1.2, 4, this.mantle, id);
    for (const s of [-1, 1]) {
      const ex = this.x + Math.cos(h + s * 1.1) * 1.9, ey = this.y + Math.sin(h + s * 1.1) * 1.9;
      r.ellipsoid(ex, ey, 0.9, 0.9, 0, z + 2.6, 0.8, WILD.octoEye, id);
      r.dot(ex, ey, z + 3.6, EYE, id);
    }
  }
}

// ---- ducks: paddle on the surface and dabble; ducklings follow in a line ---------------

class Duck extends Creature {
  constructor(world, x, y, kind = 'hen', leader = null) {
    super(world, x, y);
    this.species = 'duck';
    this.kind = kind;
    this.leader = leader;
    const k = kind === 'baby' ? 0.9 : 1.7;
    this.k = k;
    this.z = 50;
    this.cruise = 4; this.maxSpeed = kind === 'baby' ? 14 : 10; this.turnRate = kind === 'baby' ? 4 : 1.6;
    this.body = new Chain(x, y, this.heading, [2.2 * k, 2.6 * k, 2.8 * k], [1.7 * k, 1.0 * k, 3.4 * k, 2.6 * k], PI / 6);
    this.id = newId(hexToInt('#141410'));
    this.mode = 'pause';
    this.dabble = 0; this.dabbleT = 0; this.paddle = 0;
    const hen = kind !== 'drake';
    const s = rand(0, 99);
    this.skin = bakeShader((lx, ly) => {
      if (kind === 'baby') return ly * ly > 0.3 || lx < -0.4 ? WILD.ducklingBack : WILD.duckling;
      if (lx < -0.78) return WILD.tail;
      if (Math.abs(ly) > 0.62 && lx > -0.25 && lx < 0.05) return WILD.speculum;
      if (Math.abs(ly) > 0.42 && lx < 0.35) return hen ? WILD.henSpot : WILD.wing;
      if (hen) return vnoise(lx * 6 + s, ly * 6, 43) > 0.6 ? WILD.henSpot : WILD.hen;
      return WILD.drake;
    }, 32, 32, -1);
    this.head = kind === 'drake' ? WILD.duckHead : kind === 'baby' ? WILD.duckling : WILD.hen;
    this.bill = kind === 'drake' ? WILD.bill : WILD.henBill;
    this.ripple = (lx, ly) => (lx * lx + ly * ly > 0.7 ? WILD.ripple : null);
  }

  update(dt, world) {
    this.timer -= dt;
    this.dabbleT -= dt;
    let gx = Math.cos(this.heading), gy = Math.sin(this.heading), want = 0;
    if (this.leader && !world.creatures.includes(this.leader)) this.leader = null;
    if (this.grabbed) {
      [gx, gy, want] = this.pointerGoal(world);
    } else {
      const f = world.nearestFood(this.x, this.y, 80, (fd) => fd.z > 25);
      if (f) {
        gx = f.x - this.x; gy = f.y - this.y; want = this.maxSpeed;
        if (Math.hypot(gx, gy) < 2.5 * this.k + 1) { eat(world, this, f); this.dabbleT = 0.4; }
      } else if (this.leader) {
        // Follow the tail of whoever is ahead.
        const lb = this.leader.body, n = lb.n - 1;
        gx = lb.x[n] - this.x; gy = lb.y[n] - this.y;
        const d = Math.hypot(gx, gy);
        want = d < 4 ? 0 : Math.min(d * 1.5, this.maxSpeed);
      } else if (this.mode === 'walk') {
        if (this.timer <= 0 || Math.hypot(this.tx - this.x, this.ty - this.y) < 8) {
          this.mode = 'pause'; this.timer = rand(2, 5);
          if (Math.random() < 0.4) this.dabbleT = rand(1.5, 3);
        }
        gx = this.tx - this.x; gy = this.ty - this.y; want = this.cruise;
      } else if (this.timer <= 0) {
        this.mode = 'walk'; this.newTarget(world); this.timer = rand(5, 10);
      }
    }
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl; gy /= gl;
    if (!this.grabbed) {
      const [ax, ay] = this.avoid(world, 99, 12);
      gx += ax * 2; gy += ay * 2;
      for (const pad of world.pads) {
        const dx = this.x - pad.x, dy = this.y - pad.y, d = Math.hypot(dx, dy) || 1, lim = pad.r + 5;
        if (d < lim) { gx += dx / d * (lim - d) / lim * 2; gy += dy / d * (lim - d) / lim * 2; }
      }
    }
    this.turnToward(Math.atan2(gy, gx), this.turnRate * (this.grabbed ? 3 : 1), dt);
    this.speed += (want - this.speed) * Math.min(1, dt * 2);
    this.x = clamp(this.x + Math.cos(this.heading) * this.speed * dt, 2, world.W - 2);
    this.y = clamp(this.y + Math.sin(this.heading) * this.speed * dt, 2, world.H - 2);
    this.paddle += dt * (0.6 + this.speed * 0.25);
    this.dabble += ((this.dabbleT > 0 ? 1 : 0) - this.dabble) * Math.min(1, dt * 5);
    this.body.resolve(this.x, this.y, this.heading);
  }

  draw(r, t) {
    const b = this.body, z = this.z, id = this.id, k = this.k, d = this.dabble, a = b.a[2];
    for (const s of [-1, 1]) {
      const ph = Math.sin(this.paddle * TAU + (s > 0 ? 0 : PI));
      r.ellipsoid(b.px(3, s * PI * 0.72, 0.4 + ph * 0.8 * k), b.py(3, s * PI * 0.72, 0.4 + ph * 0.8 * k), 1.1 * k, 0.8 * k, a, 47, 0.4, WILD.feet, id);
    }
    const cx = (b.x[2] + b.x[3]) / 2, cy = (b.y[2] + b.y[3]) / 2;
    r.ellipsoid(cx, cy, 4.6 * k, 3.2 * k, a, z + d * 1.5, 2.8 * k, this.skin, id);
    if (d < 0.6) {
      const hz = z + 2.6 * k;
      r.tube(b.x[1], b.y[1], 1.1 * k, hz - 0.8, b.x[2], b.y[2], 1.3 * k, z + 1.5, 0.9, this.head, id);
      if (this.kind === 'drake') r.ellipsoid(b.x[1], b.y[1], 1.3 * k, 1.3 * k, 0, hz - 0.6, 0.8, WILD.collar, id);
      r.ellipsoid(b.x[0], b.y[0], 1.8 * k, 1.6 * k, b.a[0], hz, 1.6 * k, this.head, id);
      const bx = b.x[0] + Math.cos(b.a[0]) * 1.9 * k, by = b.y[0] + Math.sin(b.a[0]) * 1.9 * k;
      r.ellipsoid(bx, by, 1.3 * k, 0.8 * k, b.a[0], hz - 0.3, 0.6, this.bill, id);
      for (const s of [-1, 1]) r.dot(b.px(0, s * 1.4, -0.5 * k), b.py(0, s * 1.4, -0.5 * k), hz + 1.8 * k, EYE, id);
    } else {
      // Head down, tail up: just ripples where the head went under.
      const rr = 2.5 + Math.sin(t * 4) * 0.6;
      r.ellipsoid(b.x[0], b.y[0], rr, rr, 0, 45.2, 0.2, this.ripple, id);
    }
  }
}

// ---- shrimp: pick at the floor, flick backwards when startled ---------------------------

const SHRIMP_VARIETIES = [
  mat('#6a0e0a', '#a41c14', '#e03a26', '#ff8a6a'),
  mat('#0a2a5a', '#14469a', '#2a70d8', '#78b0ff'),
  mat('#6a7478', '#98a4a8', '#c4ced0', '#eef4f4'),
];

class Shrimp extends Walker {
  constructor(world, x, y) {
    const m = pick(SHRIMP_VARIETIES);
    super(world, x, y, {
      species: 'shrimp',
      links: new Array(6).fill(0.9), widths: [0.8, 1.0, 1.1, 1.0, 0.8, 0.6, 0.5], constraint: PI / 5,
      cruise: 3, maxSpeed: 6, turnRate: 3,
      wiggleAmp: 0, gaitK: 0, stepDur: 1, lift: 0, zBody: 0.8, sight: 45,
      outline: outlineOf(m), legs: [],
    });
    this.m = m;
    this.band = [m[0], m[0], m[1], m[2]];
    this.skin = bakeShader((u) => ((u * 6) % 1 < 0.18 ? this.band : m), 48, 1);
    this.flick = 0; this.flickDir = 0;
  }

  update(dt, world) {
    const p = world.pointer;
    let threat = p.inside && (p.x - this.x) ** 2 + (p.y - this.y) ** 2 < 144;
    for (const o of world.creatures) {
      if (threat) break;
      if (o.z < 12 && !['shrimp', 'snail', 'crab'].includes(o.species) && o !== this &&
          (o.x - this.x) ** 2 + (o.y - this.y) ** 2 < 100) threat = true;
    }
    if (threat && this.flick <= 0 && !this.grabbed) {
      this.flick = 0.25;
      this.flickDir = this.heading + PI + rand(-0.4, 0.4);
    }
    super.update(dt, world);
    if (this.flick > 0) {
      const s = 50 * (this.flick / 0.25);
      this.flick -= dt;
      this.x = clamp(this.x + Math.cos(this.flickDir) * s * dt, 2, world.W - 2);
      this.y = clamp(this.y + Math.sin(this.flickDir) * s * dt, 2, world.H - 2);
      this.body.resolve(this.x, this.y, this.heading);
    }
  }

  draw(r, t) {
    const b = this.body, z = this.zBody, id = this.id, a = b.a[0], n = b.n - 1;
    this.drawSpine(r, 0, n, z, 0.8, this.skin, id);
    const ta = b.a[n] + PI;
    r.ellipsoid(b.x[n] + Math.cos(ta) * 0.9, b.y[n] + Math.sin(ta) * 0.9, 1.2, 1.4, ta, z, 0.3, this.m, id);
    for (const s of [-1, 1]) {
      const hx = b.px(0, s * 0.4, -0.2), hy = b.py(0, s * 0.4, -0.2);
      const aa = a + s * (0.35 + Math.sin(t * 3 + s + this.phase) * 0.15);
      r.tube(hx, hy, 0.4, z + 1, hx + Math.cos(aa) * 6, hy + Math.sin(aa) * 6, 0.4, z + 1.5, 0.8, this.band, id);
      for (let i = 1; i <= 4; i++) {
        r.dot(b.px(i, s * PI / 2, 0.4 + 0.4 * Math.sin(t * 20 + i + s)), b.py(i, s * PI / 2, 0.4 + 0.4 * Math.sin(t * 20 + i + s)), z, this.band, id);
      }
    }
    this.drawEyes(r, 0.8, 0.1, z + 1.6, false);
  }
}

// ---- dragonfly: hover, then dart --------------------------------------------------------

const DRAGONFLY_VARIETIES = [
  mat('#0a2a5a', '#14509a', '#2a88e0', '#8ad0ff'),
  mat('#5a0a0a', '#9a1a14', '#dc3226', '#ff8a6a'),
  mat('#0e3a1a', '#1a6a2c', '#2ea846', '#86e08a'),
];

class Dragonfly extends Creature {
  constructor(world, x, y) {
    super(world, x, y);
    this.species = 'dragonfly';
    this.m = pick(DRAGONFLY_VARIETIES);
    this.z = rand(66, 74);
    this.maxSpeed = 60;
    this.body = new Chain(x, y, this.heading, [1.2, 1.4, 1.4, 1.4, 1.4, 1.2], [1.2, 1.0, 0.6, 0.5, 0.5, 0.45, 0.4], PI / 10);
    this.id = newId(outlineOf(this.m));
    this.mode = 'hover';
    this.timer = rand(0.5, 2);
  }

  update(dt, world) {
    this.timer -= dt;
    let want = 0;
    if (this.grabbed) {
      const [gx, gy, w] = this.pointerGoal(world);
      this.turnToward(Math.atan2(gy, gx), 10, dt);
      want = w;
    } else if (this.mode === 'hover') {
      this.heading += Math.sin(world.t * 3 + this.phase) * dt * 0.5;
      if (this.timer <= 0) {
        this.mode = 'dart';
        const d = rand(20, 70), a = rand(-PI, PI);
        this.tx = clamp(this.x + Math.cos(a) * d, 10, world.W - 10);
        this.ty = clamp(this.y + Math.sin(a) * d, 10, world.H - 10);
      }
    } else {
      this.turnToward(Math.atan2(this.ty - this.y, this.tx - this.x), 12, dt);
      want = this.maxSpeed;
      if (Math.hypot(this.tx - this.x, this.ty - this.y) < 4) { this.mode = 'hover'; this.timer = rand(0.8, 3); }
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 6);
    this.x = clamp(this.x + Math.cos(this.heading) * this.speed * dt, 2, world.W - 2);
    this.y = clamp(this.y + Math.sin(this.heading) * this.speed * dt, 2, world.H - 2);
    this.body.resolve(this.x, this.y, this.heading);
  }

  draw(r, t) {
    const b = this.body, z = this.z, id = this.id, a = b.a[1];
    this.drawSpine(r, 0, b.n - 1, z, 1, this.m, id);
    const flap = Math.sin(t * 50 + this.phase) * 0.12;
    for (const s of [-1, 1]) {
      for (const [off, len] of [[PI / 2 - 0.25, 4.6], [PI / 2 + 0.3, 4.2]]) {
        const wa = a + s * (off + flap);
        r.ellipsoid(b.x[1] + Math.cos(wa) * len * 0.55, b.y[1] + Math.sin(wa) * len * 0.55, len * 0.55, 1.0, wa, z + 1, 0.3, WILD.wingGlass, id);
      }
    }
    this.drawEyes(r, 0.9, 0.3, z + 1.8, false);
  }
}

// ---- firefly: ambient, appears at night -----------------------------------------------
// How many come out shows your score (fireflyPlan in game.js); blue ones only
// come to ponds in the high-score range.

class Firefly extends Creature {
  constructor(world, x, y, blue = false) {
    super(world, x, y);
    this.species = 'firefly';
    this.blue = blue;
    this.z = rand(55, 78);
    this.speed = blue ? rand(3, 6) : rand(4, 8);
    this.freq = blue ? rand(0.25, 0.5) : rand(0.4, 0.9);
    this.body = new Chain(x, y, this.heading, [0.8], [0.5, 0.4], PI);
    this.id = newId(hexToInt('#0a0a04'));
    EMISSIVE[this.id] = 2;
    this.leaving = false;
    this.gone = false;
  }

  update(dt, world) {
    this.phase += dt * this.freq * TAU;
    if (this.grabbed) {
      const p = world.pointer;
      this.x += (p.x - this.x) * Math.min(1, dt * 5); this.y += (p.y - this.y) * Math.min(1, dt * 5);
    } else {
      if (this.leaving) {
        const ex = this.x < world.W / 2 ? -10 : world.W + 10;
        this.turnToward(Math.atan2(0, ex - this.x), 2, dt);
      } else {
        this.heading += (vnoise(world.t * 0.5, this.id, 51) - 0.5) * dt * 6;
        const [ax, ay] = this.avoid(world, 999, 20);
        if (ax || ay) this.turnToward(Math.atan2(ay, ax), 2, dt);
      }
      this.x += Math.cos(this.heading) * this.speed * dt;
      this.y += Math.sin(this.heading) * this.speed * dt;
      if (this.leaving && (this.x < -8 || this.x > world.W + 8)) this.gone = true;
    }
    this.z += Math.sin(world.t + this.freq * 10) * dt * 2;
    this.body.resolve(this.x, this.y, this.heading);
  }

  draw(r) {
    const on = Math.sin(this.phase) > (this.blue ? 0 : 0.3);
    if (on) r.ellipsoid(this.x, this.y, this.blue ? 1.7 : 1.4, this.blue ? 1.7 : 1.4, 0, this.z, 1.2, this.blue ? WILD.fireflyBlue : WILD.fireflyLight, this.id);
    r.dot(this.x + Math.cos(this.heading) * 0.8, this.y + Math.sin(this.heading) * 0.8, this.z + 1.5, WILD.fireflyBody, this.id);
  }
}

Object.assign(SPECIES, {
  clown: {
    label: 'Clownfish', color: '#f27a1c',
    spawn: (w, x, y) => {
      const hosts = w.plants.filter((p) => p instanceof Anemone);
      const h = hosts.length ? pick(hosts) : null;
      const [cx, cy] = h ? [h.x, h.y] : [x, y];
      return [0, 1].map(() => makeCreature('clown', w, cx + rand(-3, 3), cy + rand(-3, 3)));
    },
  },
  puffer: { label: 'Pufferfish', color: '#e2c230', spawn: (w, x, y) => [makeCreature('puffer', w, x, y)] },
  octopus: { label: 'Octopus', color: '#a8482a', spawn: (w, x, y) => [makeCreature('octopus', w, x, y)] },
  duck: {
    label: 'Ducks', color: '#1e7a3e',
    spawn: (w, x, y) => {
      const hen = makeCreature('duck', w, x, y, { kind: 'hen' }), fam = [hen];
      for (let i = randi(3, 5), lead = hen; i > 0; i--) {
        lead = makeCreature('duck', w, x - fam.length * 7, y, { kind: 'baby', leader: lead });
        fam.push(lead);
      }
      if (Math.random() < 0.6) fam.push(makeCreature('duck', w, x + rand(-15, 15), y + rand(-15, 15), { kind: 'drake' }));
      return fam;
    },
  },
  shrimp: {
    label: 'Shrimp', color: '#e03a26',
    spawn: (w, x, y) => Array.from({ length: 4 }, () => makeCreature('shrimp', w, x + rand(-8, 8), y + rand(-8, 8))),
  },
  dragonfly: { label: 'Dragonfly', color: '#2a88e0', spawn: (w, x, y) => [makeCreature('dragonfly', w, x, y)] },
});

// ---- starfish: glides slowly on the floor, arms curling --------------------------

const STAR_MATS = [
  mat('#7a2a0a', '#b8481a', '#e8743a', '#ffae70'), mat('#6a0e1a', '#a01c2a', '#d8343a', '#ff7a6a'),
  mat('#1a2a7a', '#2a46b8', '#3a6ee8', '#88b0ff'), mat('#4a1a5a', '#74308a', '#a04cb8', '#d08ae4'),
  mat('#7a6a2a', '#a8923e', '#d8bc58', '#f8e290'),
];

class Starfish extends Creature {
  constructor(world, x, y) {
    super(world, x, y);
    this.species = 'starfish';
    this.m = pick(STAR_MATS);
    this.arms = Math.random() < 0.1 ? 6 : 5;
    this.len = rand(3.5, 6);
    this.rot = rand(0, TAU);
    this.z = 0.6;
    this.cruise = 0.9; this.maxSpeed = 2.2; this.turnRate = 0.5; this.sight = 30;
    this.body = new Chain(x, y, this.heading, [1], [2, 1.5], PI);
    this.id = newId(outlineOf(this.m));
    // Varieties: most are common stars; some are sunflower stars (many arms, big),
    // brittle stars (thin whip arms that wriggle) or cushion stars (a fat pentagon).
    const roll = Math.random();
    this.variety = roll < 0.07 ? 'sunflower' : roll < 0.19 ? 'brittle' : roll < 0.24 ? 'cushion' : 'common';
    if (this.variety === 'sunflower') { this.arms = randi(12, 16); this.len = rand(7, 9.5); this.m = pick(STAR_MATS.slice(0, 4).concat([mat('#6a2a6a', '#9a44a0', '#c86ad0', '#f0a8f4')])); this.cruise = 2.2; this.maxSpeed = 4; }
    else if (this.variety === 'brittle') { this.arms = 5; this.len = rand(7, 10); this.m = pick([mat('#2a1a14', '#4a3024', '#6e4a36', '#94684c'), mat('#3a2a3a', '#5a4458', '#7e647a', '#a88aa2')]); this.cruise = 2.5; this.maxSpeed = 5; }
    else if (this.variety === 'cushion') { this.arms = 5; this.len = rand(3, 4); this.m = pick(STAR_MATS); }
    const bump = [this.m[1], this.m[2], this.m[3], this.m[3]];
    this.skin = this.variety === 'brittle' ? bakeShader((u) => ((u * 14) % 1 < 0.35 ? bump : this.m), 32, 4)
      : bakeShader((u, v) => (Math.sin(u * 42) * Math.sin(v * 5 + 1) > 0.55 ? bump : this.m), 32, 8);
    this.mode = 'pause';
  }

  hit(px, py) { return Math.hypot(px - this.x, py - this.y) < this.len + 2; }

  update(dt, world) {
    this.timer -= dt;
    let gx = Math.cos(this.heading), gy = Math.sin(this.heading), want = 0;
    if (this.grabbed) {
      [gx, gy, want] = this.pointerGoal(world);
    } else {
      const hungry = !this.life || this.life.energy < 0.8;
      const f = world.nearestFood(this.x, this.y, this.sight, (fd) => fd.z < 3 && (hungry || fd.fed));
      if (f) {
        gx = f.x - this.x; gy = f.y - this.y; want = this.cruise;
        if (Math.hypot(gx, gy) < 2.5) eat(world, this, f);
      } else if (this.mode === 'walk') {
        if (this.timer <= 0 || Math.hypot(this.tx - this.x, this.ty - this.y) < 4) { this.mode = 'pause'; this.timer = rand(4, 12); }
        gx = this.tx - this.x; gy = this.ty - this.y; want = this.cruise;
      } else if (this.timer <= 0) {
        this.mode = 'walk'; this.newTarget(world, true); this.timer = rand(8, 16);
      }
    }
    const gl = Math.hypot(gx, gy) || 1, [ax, ay] = this.grabbed ? [0, 0] : this.avoid(world, 0);
    this.turnToward(Math.atan2(gy / gl + ay * 2, gx / gl + ax * 2), this.grabbed ? 4 : this.turnRate, dt);
    this.speed += (want - this.speed) * Math.min(1, dt * 1.5);
    this.x = clamp(this.x + Math.cos(this.heading) * this.speed * dt, 3, world.W - 3);
    this.y = clamp(this.y + Math.sin(this.heading) * this.speed * dt, 3, world.H - 3);
    this.rot += dt * 0.05 * (this.speed + 0.2);
    this.body.resolve(this.x, this.y, this.heading);
  }

  draw(r, t) {
    const { x, y, z, id } = this, n = this.arms, v = this.variety || 'common';
    const segs = v === 'brittle' ? 5 : v === 'sunflower' ? 4 : 3, seg = this.len / segs;
    const r0 = v === 'brittle' ? 0.7 : v === 'cushion' ? 2.2 : v === 'sunflower' ? 1.3 : 1.5, r1 = v === 'brittle' ? 0.3 : v === 'cushion' ? 1.2 : 0.45;
    const body = v === 'cushion' ? 3.6 : v === 'sunflower' ? 3.4 : v === 'brittle' ? 1.6 : 1.9;
    r.ellipsoid(x, y, body, body, 0, z, v === 'cushion' ? 2.6 : 1.4, this.m, id);
    for (let k = 0; k < n; k++) {
      let px = x, py = y, rad = r0, a = this.rot + k * TAU / n;
      const wave = v === 'brittle' ? 0.55 : 0.16, speed = v === 'brittle' ? 2.2 : 0.5;
      for (let s = 0; s < segs; s++) {
        a += Math.sin(t * speed + k * 1.7 + this.phase + s * (v === 'brittle' ? 1.1 : 0)) * wave * (v === 'brittle' ? 0.6 : 1);
        const nx = px + Math.cos(a) * seg, ny = py + Math.sin(a) * seg, nr = lerp(r0, r1, (s + 1) / segs);
        r.tube(px, py, rad, z + 0.5 - s * 0.12, nx, ny, nr, z + 0.3 - s * 0.08, v === 'cushion' ? 1 : 0.9, this.skin, id, s / segs, (s + 1) / segs);
        px = nx; py = ny; rad = nr;
      }
    }
  }
}

Object.assign(CREATE, {
  clown: (w, x, y) => new Clownfish(w, x, y),
  puffer: (w, x, y) => new Puffer(w, x, y),
  octopus: (w, x, y) => new Octopus(w, x, y),
  duck: (w, x, y, a) => new Duck(w, x, y, a.kind || 'hen', a.leader || null),
  shrimp: (w, x, y) => new Shrimp(w, x, y),
  dragonfly: (w, x, y) => new Dragonfly(w, x, y),
  starfish: (w, x, y) => new Starfish(w, x, y),
});

SPECIES.starfish = { label: 'Starfish', color: '#e8743a', spawn: (w, x, y) => [makeCreature('starfish', w, x, y)] };
