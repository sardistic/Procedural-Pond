'use strict';
// Gulls: visitors to any pond with a beach, by day. They soar in wide circles
// over the water, land to walk the dry sand (and take off when the tide or
// your pointer comes too close), and when hungry they hunt: a frog on the sand
// or at the surface, a crab out on the beach or in the shallows, a dragonfly on
// the wing. They dive, and catch it about a third of the time; a miss puts them off
// for a while. They'd rather scavenge: remains washed up on the sand come first. They cry as they fly,
// and leave at dusk or in heavy rain. No genes, no nests: they aren't the pond's.

const GULL = {
  white: mat('#9a9e9e', '#c8cccc', '#eceeee', '#ffffff'), grey: mat('#4a545e', '#6e7a86', '#94a0ac', '#bcc6d0'),
  black: mat('#08080a', '#141418', '#22222a', '#34343e'), beak: mat('#8a6a0a', '#c09a18', '#eec430', '#fff080'),
  leg: mat('#8a5a4a', '#b87a64', '#dca088', '#f4c8b0'), spot: solid('#d8342a'),
};
SINGULAR.gull = 'Gull';
const GULL_PREY = { frog: 0.25, crab: 0.35, dragonfly: 0.25 }; // what they take, and how often a dive lands
const GULL_ALT = 88;

class Gull extends Creature {
  constructor(world, x, y) {
    super(world, x, y);
    this.species = 'gull';
    this.body = new Chain(x, y, this.heading, [3.2, 4, 3.8], [1.8, 1.6, 3.4, 2.6], PI / 4);
    this.id = newId(outlineOf(GULL.grey));
    this.z = GULL_ALT; this.alt = rand(GULL_ALT - 6, GULL_ALT + 6);
    this.mode = 'soar'; this.timer = rand(5, 12);
    this.circle = rand(0.35, 0.6) * (Math.random() < 0.5 ? 1 : -1);
    this.hunger = rand(0.2, 0.6); this.speed = 22; this.maxSpeed = 30;
    this.flapT = rand(0, 3); this.flap = 0; this.stepT = 0;
    this.cx = x; this.cy = y;
  }

  dry(world, x, y) { return !!world.shore && shoreAt(world, x, y) > world.tide.level + 0.03; }

  // Something catchable out in the open, near enough.
  findPrey(world) {
    let best = null, bd = 160 * 160;
    for (const c of world.creatures) {
      if (!GULL_PREY[c.species] || c.dying || c.leaving || c.grabbed || c.caught || c.absorbing) continue;
      const open = c.species === 'dragonfly' || this.dry(world, c.x, c.y) || (c.species === 'frog' && (c.state === 'sit' || c.z > 38)) ||
        (c.species === 'crab' && shoreAt(world, c.x, c.y) > world.tide.level - 0.12);
      if (!open) continue;
      const d = (c.x - this.x) ** 2 + (c.y - this.y) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // A dry spot on the beach to land on.
  landing(world) {
    for (let i = 0; i < 24; i++) {
      const x = rand(12, world.W - 12), y = rand(12, world.H - 12);
      if (this.dry(world, x, y) && shoreAt(world, x, y) > world.tide.level + 0.08) return [x, y];
    }
    return null;
  }

  update(dt, world) {
    this.timer -= dt;
    this.hunger = Math.min(1, this.hunger + dt / 600); // hungry again every several minutes
    let want = 22, gx = Math.cos(this.heading), gy = Math.sin(this.heading), turn = 2.2;
    const p = world.pointer;
    if (this.grabbed) {
      const [px, py, w] = this.pointerGoal(world);
      gx = px; gy = py; want = w; turn = 8; this.z += (this.alt - this.z) * Math.min(1, dt * 3);
    } else if (this.leaving || this.mode === 'leave') {
      this.mode = 'leave';
      if (!this.exit) this.exit = pick([[-40, this.y], [world.W + 40, this.y], [this.x, -40], [this.x, world.H + 40]]);
      gx = this.exit[0] - this.x; gy = this.exit[1] - this.y; want = 30;
      this.z += (this.alt + 10 - this.z) * Math.min(1, dt);
      if (this.x < -30 || this.y < -30 || this.x > world.W + 30 || this.y > world.H + 30) this.gone = true;
    } else if (this.mode === 'soar') {
      // Wide circles over the water near the beach, riding the wind.
      this.heading += this.circle * dt;
      gx = Math.cos(this.heading) + (this.cx - this.x) * 0.004; gy = Math.sin(this.heading) + (this.cy - this.y) * 0.004;
      this.z += (this.alt + Math.sin(world.t * 0.4 + this.phase) * 4 - this.z) * Math.min(1, dt * 0.8);
      if (this.timer <= 0) {
        this.timer = rand(4, 10);
        const scrap = this.hunger > 0.4 && (world.remains || []).find((rm) => this.dry(world, rm.x, rm.y) && (rm.x - this.x) ** 2 + (rm.y - this.y) ** 2 < 40000);
        const prey = !scrap && this.hunger > 0.6 && this.findPrey(world);
        if (scrap) { this.mode = 'land'; [this.tx, this.ty] = [scrap.x + rand(-3, 3), scrap.y + rand(-3, 3)]; this.scrap = scrap; this.timer = 20; }
        else if (prey) { this.mode = 'hunt'; this.prey = prey; this.timer = 12; }
        else if (Math.random() < 0.45) { const s = this.landing(world); if (s) { this.mode = 'land'; [this.tx, this.ty] = s; this.timer = 20; } }
        else { const s = this.landing(world); if (s) { this.cx = s[0]; this.cy = s[1]; } this.circle = -this.circle * rand(0.8, 1.2); }
      }
    } else if (this.mode === 'land') {
      gx = this.tx - this.x; gy = this.ty - this.y;
      const d = Math.hypot(gx, gy);
      want = Math.max(6, Math.min(22, d * 0.8)); turn = 3;
      this.z += (lerp(2.5, this.alt, clamp(d / 70, 0, 1)) - this.z) * Math.min(1, dt * 2);
      if (!this.dry(world, this.tx, this.ty) || this.timer <= 0) this.mode = 'rise';
      else if (d < 3) {
        this.mode = 'walk'; this.timer = rand(8, 18); this.speed = 0; this.z = 2.5; this.stepT = 0;
        // Picking over remains on the sand: that'll do for a meal.
        const rm = this.scrap;
        if (rm && world.remains.includes(rm)) { rm.life -= 60; this.hunger = 0; this.timer = rand(12, 20); }
        this.scrap = null;
      }
    } else if (this.mode === 'walk') {
      this.z = 2.5; want = 0; turn = 6;
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = rand(0.8, 2);
        const a = rand(0, TAU), x = this.x + Math.cos(a) * rand(4, 12), y = this.y + Math.sin(a) * rand(4, 12);
        if (this.dry(world, x, y)) { this.tx = x; this.ty = y; }
      }
      gx = this.tx - this.x; gy = this.ty - this.y;
      if (Math.hypot(gx, gy) > 1.5) want = 5;
      // A crab passing by is fair game from the ground too.
      const crab = this.hunger > 0.5 && world.creatures.find((c) => c.species === 'crab' && !c.dying && (c.x - this.x) ** 2 + (c.y - this.y) ** 2 < 600);
      if (crab) { this.mode = 'dive'; this.prey = crab; this.timer = 3; }
      const near = p.inside && (p.x - this.x) ** 2 + (p.y - this.y) ** 2 < 500;
      if (this.timer <= 0 || !this.dry(world, this.x, this.y) || near) { this.mode = 'rise'; if (near) Sound.gull(this.x, this.y, true); }
    } else if (this.mode === 'rise') {
      want = 18; turn = 2;
      this.z += 26 * dt;
      if (this.z >= this.alt - 4) { this.mode = 'soar'; this.timer = rand(4, 9); this.cx = this.x; this.cy = this.y; }
    } else if (this.mode === 'hunt' || this.mode === 'dive') {
      const q = this.prey;
      if (!q || q.gone || q.caught || q.dying || this.timer <= 0) { this.prey = null; this.mode = 'rise'; this.hunger *= 0.8; }
      else {
        gx = q.x - this.x; gy = q.y - this.y;
        const d = Math.hypot(gx, gy);
        want = this.mode === 'dive' ? 34 : 28; turn = this.mode === 'dive' ? 7 : 3;
        if (this.mode === 'hunt' && d < 28) { this.mode = 'dive'; this.timer = 3; Sound.gull(this.x, this.y); }
        if (this.mode === 'dive') {
          this.z += ((q.z || 0) + 2 - this.z) * Math.min(1, dt * 3);
          if (d < 45 && !q.dread) startle(world, q, this.x, this.y, 1.5);
          if (d < 4 && Math.abs(this.z - (q.z || 0) - 2) < 8) {
            if (Math.random() < GULL_PREY[q.species] * (q.life ? 1.1 - 0.3 * (q.life.scale || 1) : 1)) { eat(world, this, q); this.hunger = 0; }
            else this.hunger = 0.25; // missed: it'll wait a while before trying again
            this.prey = null; this.mode = 'rise'; this.timer = rand(8, 15);
          }
        }
      }
    }
    // Wings: long glides, a few beats now and then (more when climbing or diving in).
    this.flapT -= dt;
    if (this.flapT <= 0) this.flapT = this.mode === 'rise' || this.mode === 'land' ? rand(0.2, 0.6) : rand(1.5, 4);
    this.flap += dt * (this.flapT < 0.9 && this.mode !== 'walk' ? 9 : 0);
    const gl = Math.hypot(gx, gy) || 1;
    this.turnToward(Math.atan2(gy / gl, gx / gl), turn, dt);
    this.speed += (want - this.speed) * Math.min(1, dt * (this.mode === 'walk' ? 6 : 1.5));
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.y += Math.sin(this.heading) * this.speed * dt;
    if (this.mode !== 'leave') { this.x = clamp(this.x, 2, world.W - 2); this.y = clamp(this.y, 2, world.H - 2); }
    this.body.resolve(this.x, this.y, this.heading);
  }

  draw(r, t) {
    const b = this.body, z = this.z, id = this.id, walking = this.mode === 'walk', h = b.a[0];
    // Folded, the grey wings cover the back and cross in black tips over the tail.
    const back = (u) => (u < 0.28 ? GULL.white : walking ? (u > 0.86 ? GULL.black : GULL.grey) : u > 0.8 ? GULL.white : GULL.grey);
    this.drawSpine(r, 0, b.n - 1, z, 1.1, back, id);
    if (!walking) {
      // Spread wings, swept back a little; a beat foreshortens them from above.
      const beat = Math.sin(this.flap), span = 14 * (0.78 + 0.22 * Math.cos(this.flap)), sx = b.x[1], sy = b.y[1];
      for (const s of [-1, 1]) {
        const a1 = h + s * (PI / 2 + 0.25 + 0.15 * beat), a2 = a1 + s * (0.35 + 0.1 * beat);
        const ex = sx + Math.cos(a1) * span * 0.5, ey = sy + Math.sin(a1) * span * 0.5;
        const tx = ex + Math.cos(a2) * span * 0.55, ty = ey + Math.sin(a2) * span * 0.55;
        r.tube(sx, sy, 1.5, z + 0.4, ex, ey, 1.25, z + 0.6 + beat * 0.5, 0.5, GULL.grey, id);
        r.tube(ex, ey, 1.15, z + 0.6 + beat * 0.5, tx, ty, 0.35, z + 0.8 + beat, 0.5, (u) => (u > 0.66 ? GULL.black : GULL.grey), id);
      }
    } else {
      // Pink feet, stepping.
      const st = Math.sin(t * 9 + this.phase) * (this.speed > 1 ? 1 : 0);
      for (const s of [-1, 1]) r.dot(b.px(1, s * PI / 2, -0.6) + Math.cos(h) * st * s * 0.6, b.py(1, s * PI / 2, -0.6) + Math.sin(h) * st * s * 0.6, 0.8, GULL.leg, id);
    }
    // Head, beak (with its red spot) and eyes.
    const bx = b.x[0] + Math.cos(h) * b.w[0], by = b.y[0] + Math.sin(h) * b.w[0];
    r.tube(bx, by, 0.6, z + 1.2, bx + Math.cos(h) * 2.4, by + Math.sin(h) * 2.4, 0.3, z + 1, 0.8, GULL.beak, id);
    r.dot(bx + Math.cos(h) * 1.7, by + Math.sin(h) * 1.7, z + 1.3, GULL.spot, id);
    this.drawEyes(r, 0.9, 0.5, z + 1.6, false);
  }
}

// Gulls come by day to ponds with a beach: more over salt water, and when
// frogs and crabs are out on the sand. They leave at dusk and in heavy rain.
let gullTick = 0;
function updateGulls(world, dt) {
  gullTick -= dt;
  if (gullTick > 0) return;
  gullTick = 2;
  const gulls = world.creatures.filter((c) => c.species === 'gull' && !c.leaving);
  let want = 0;
  if (world.shore && world.opts.life !== false && world.darkness < 0.45 && world.weather.rain < 0.7) {
    const k = { salt: 1, mixed: 0.8, fresh: 0.5 }[world.opts.habitat] || 0.8;
    const beach = beachBand(world) * (world.shoreSide < 2 ? world.H : world.W) / 9000;
    const out = world.creatures.filter((c) => GULL_PREY[c.species] && isDry(world, c.x, c.y)).length;
    want = Math.round(clamp(beach * k + out * 0.15, 1, 5));
  }
  if (gulls.length < want && Math.random() < 0.2) {
    const side = randi(0, 3), x = side === 0 ? -20 : side === 1 ? world.W + 20 : rand(0, world.W), y = side === 2 ? -20 : side === 3 ? world.H + 20 : rand(0, world.H);
    const g = new Gull(world, x, y);
    g.heading = Math.atan2(world.H / 2 - y, world.W / 2 - x);
    const s = g.landing(world);
    if (s) { g.cx = s[0]; g.cy = s[1]; }
    world.creatures.push(g);
    if (Math.random() < 0.5) Sound.gull(x, y);
  } else if (gulls.length > want && Math.random() < 0.25) {
    const g = gulls.find((c) => c.mode !== 'walk') || gulls[0];
    g.leaving = true;
  }
}
