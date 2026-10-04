'use strict';
// Action animations and the moments between species: the lunge and snap of an attack, the flinch
// of the one hit, the tuck-and-dash of a flight, the chomp of a meal (and prey drawn down into the
// mouth), octopus arms that shoot out, wrap and haul prey in, jellies that sting whatever brushes
// their tentacles, and crabs that pinch what comes too close.
//
// Animations run in pond time. Each creature has at most one (c.anim); the renderer asks animPose for a
// pose (Raster.setPose): squashed or stretched along the line of the action, and moved along it. So an
// attack winds back, lunges out stretched at its target and recoils; the one hit is knocked back from
// the blow, squashed against it, and wobbles; a meal bobs forward bite by bite; a flight crouches and
// shoots off stretched; a jelly's bell clenches. Effects draw the jaws, impact, streaks, zaps, crumbs and
// the swallow.

const ANIM_DUR = { attack: 0.42, eat: 0.55, hit: 0.45, flee: 0.6, sting: 0.45 };
const ANIM_FX_CAP = 214;
const animFx = (world, e) => { if (world.effects && world.effects.length < ANIM_FX_CAP) world.effects.push(e); };

// dir: the line of the action (toward the target for an attack, away from the blow for a hit).
function playAnim(world, c, kind, dir = null, delay = 0) {
  if (!c || c.gone) return;
  // (A meal or an attack is never cut short by a flinch; a fresh flight doesn't restart a dash.)
  const A = c.anim;
  if (A && world.t - A.at < A.dur && (A.kind === 'attack' || A.kind === 'eat') && (kind === 'hit' || kind === 'flee')) return;
  if (A && A.kind === kind && world.t - A.at < A.dur * 0.5) return;
  c.anim = { kind, at: world.t + delay, dur: ANIM_DUR[kind] || 0.4, dir: Number.isFinite(dir) ? dir : null };
}
const animToward = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const animHead = (c) => (c.body && c.body.x && !c.tents ? [c.body.x[0], c.body.y[0]] : [c.x, c.y]);
const animTail = (c) => (c.body && c.body.x && !c.tents ? [c.body.x[c.body.n - 1], c.body.y[c.body.n - 1]] : [c.x, c.y]);
// (A jelly's body chain is one thin tentacle; its bell radius is its size.)
const animWidth = (c) => (c.tents && c.R ? c.R : c.body && c.body.w ? Math.max(...c.body.w) : c.R || 2);

// Easing.
const easeOut = (t) => 1 - (1 - t) * (1 - t), easeIn = (t) => t * t, seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
// The pose to draw it in right now: { x, y, ang, sa, sb, dx, dy, dz } (about its middle, along ang), or null.
function animPose(c, now) {
  const A = c.anim;
  if (!A) return null;
  const p = (now - A.at) / A.dur;
  if (p >= 1) { c.anim = null; return null; }
  if (p < 0) return null; // (waiting for its moment: a blow lands when the lunge does)
  const ang = A.dir ?? c.heading ?? 0, w = animWidth(c), cx = c.x, cy = c.y;
  let sa = 1, sb = 1, d = 0, dz = 0;
  switch (A.kind) {
    case 'attack': {
      // Wind back (squashed, pulled away), then the lunge (stretched, thrown out at it), then the recoil.
      const reach = clamp(w * 1.3, 2, 7), back = seg(p, 0, 0.3), out = seg(p, 0.3, 0.45), home = seg(p, 0.45, 1);
      const wind = easeOut(back) * (1 - out), strike = easeOut(out) * (1 - easeIn(home));
      d = -0.35 * reach * wind + reach * strike;
      sa = 1 - 0.14 * wind + 0.28 * strike; sb = 1 + 0.1 * wind - 0.14 * strike;
      break;
    }
    case 'hit': {
      // Knocked back along the blow, squashed against it, then a wobble that dies away.
      const k = easeOut(seg(p, 0, 0.18)), wob = Math.exp(-5 * p) * Math.sin(p * 22);
      d = clamp(w * 0.9, 1.5, 4) * (k - easeIn(seg(p, 0.18, 1)) * 0.9);
      sa = 1 - 0.22 * k * (1 - seg(p, 0.18, 0.5)) + 0.08 * wob; sb = 1 + 0.16 * k * (1 - seg(p, 0.18, 0.5)) - 0.06 * wob;
      break;
    }
    case 'eat': {
      // Two bites: the head bobs forward, a little stretched, and back.
      const bite = Math.pow(Math.abs(Math.sin(2 * PI * p)), 0.7);
      d = clamp(w * 0.5, 0.8, 2.5) * bite; sa = 1 + 0.1 * bite; sb = 1 - 0.05 * bite;
      break;
    }
    case 'flee': {
      // Crouch, then shoot off stretched (the speed burst carries it; this is the shape of it).
      const crouch = easeOut(seg(p, 0, 0.2)) * (1 - seg(p, 0.2, 0.3)), dash = easeOut(seg(p, 0.2, 0.35)) * (1 - easeIn(seg(p, 0.35, 1)));
      d = -0.3 * w * crouch; sa = 1 - 0.16 * crouch + 0.25 * dash; sb = 1 + 0.12 * crouch - 0.12 * dash;
      break;
    }
    case 'sting': {
      // The bell clenches and springs back, lifting.
      const clench = Math.exp(-4 * p) * Math.sin(p * 16);
      sa = 1 - 0.15 * clench; sb = 1 + 0.12 * clench; dz = 1.5 * Math.sin(PI * p);
      break;
    }
  }
  return { x: cx, y: cy, ang, sa, sb, dx: Math.cos(ang) * d, dy: Math.sin(ang) * d, dz };
}
// (The older name, for anything still asking for a plain scale: none now.)
const animScale = () => null;

// ---- the effects ------------------------------------------------------------------------------------
let ANIM_ID = 0;
const ANIM_MAT = {};
const animMat = (hex) => ANIM_MAT[hex] || (ANIM_MAT[hex] = solid(hex));
const animId = () => { if (!ANIM_ID) { ANIM_ID = newId(hexToInt('#0a0a0a')); EMISSIVE[ANIM_ID] = 1; } return ANIM_ID; };
function animLine(r, x0, y0, x1, y1, z, hex) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) r.dot(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, z, animMat(hex), animId());
}

// Jaws snapping shut in front of the head (or a claw's pinch).
class Jaws {
  constructor(c, pinch = false) { this.c = c; this.t = 0; this.life = ANIM_DUR.attack * 0.6; this.pinch = pinch; }
  update(dt) { this.t += dt; return this.t < this.life && !this.c.gone; }
  draw(r) {
    const c = this.c, A = c.anim, h = A && A.dir != null ? A.dir : c.heading || 0, w = animWidth(c), L = Math.max(2.5, w * 1.3);
    // Open wide through the wind-up, shut hard at full reach (a third of the way in), a glint as they meet.
    const p = this.t / this.life, open = (p < 0.55 ? Math.sin(PI / 2 * Math.min(1, p / 0.45)) : Math.max(0, 1 - (p - 0.55) / 0.1)) * (this.pinch ? 0.55 : 0.75);
    const pose = animPose(c, world.t), [hx, hy] = animHead(c), z = (c.z || 0) + 4;
    const ox = pose ? pose.dx : 0, oy = pose ? pose.dy : 0;
    const fx = hx + ox + Math.cos(h) * (w * 0.6), fy = hy + oy + Math.sin(h) * (w * 0.6);
    for (const s of [1, -1]) {
      const a = h + s * open, ex = fx + Math.cos(a) * L, ey = fy + Math.sin(a) * L;
      animLine(r, fx, fy, ex, ey, z, this.pinch ? '#ff8a5a' : '#f4f0e0');
      if (!this.pinch && open > 0.1) r.dot(ex - Math.sin(a) * s, ey + Math.cos(a) * s, z, animMat('#ffffff'), animId()); // a tooth
    }
    if (p > 0.55 && p < 0.72) r.dot(fx + Math.cos(h) * L, fy + Math.sin(h) * L, z + 1, animMat('#ffffff'), animId()); // (the snap)
  }
}
// Where a blow lands: a burst of short sparks and a ring spreading in the water.
class Impact {
  constructor(x, y, z, ang, delay = 0) { this.x = x; this.y = y; this.z = z; this.ang = ang; this.t = -delay; this.life = 0.32; this.rays = Array.from({ length: 6 }, (_, i) => ang + PI + (i - 2.5) * 0.45 + rand(-0.15, 0.15)); }
  update(dt) { this.t += dt; return this.t < this.life; }
  draw(r) {
    if (this.t < 0) return;
    const p = this.t / this.life, z = this.z + 2;
    for (const a of this.rays) { const r0 = 1 + 4 * easeOut(p), r1 = r0 + 2.2 * (1 - p); animLine(r, this.x + Math.cos(a) * r0, this.y + Math.sin(a) * r0, this.x + Math.cos(a) * r1, this.y + Math.sin(a) * r1, z, p < 0.4 ? '#ffffff' : '#ffe08a'); }
    if (p > 0.15) { const R = 2 + 7 * easeOut(p), n = Math.ceil(R * 2.2); for (let i = 0; i < n; i++) if ((i + ((p * 10) | 0)) % 3) r.dot(this.x + Math.cos(i / n * TAU) * R, this.y + Math.sin(i / n * TAU) * R, this.z, animMat('#bfe6ee'), animId()); }
  }
}
// Prey drawn shrinking down into the eater's mouth.
class Swallow {
  constructor(world, prey, eater) { this.w = world; this.prey = prey; this.eater = eater; this.t = 0; this.life = 0.38; }
  update(dt) { this.t += dt; return this.t < this.life; }
  draw(r, t) {
    const [mx, my] = animHead(this.eater), k = Math.max(0.05, 1 - this.t / this.life);
    const was = r.alpha;
    r.alpha = Math.min(was, 0.4 + 0.6 * k);
    r.setScale(mx, my, k);
    try { this.prey.draw(r, t, this.w); } catch { this.t = this.life; }
    r.setScale();
    r.alpha = was;
  }
}
// Speed lines streaming off a fleeing animal's tail.
class Streak {
  constructor(c) { this.c = c; this.t = 0; this.life = 0.55; }
  update(dt) { this.t += dt; return this.t < this.life && !this.c.gone; }
  draw(r) {
    if (this.t > this.life * 0.6 && ((this.t * 24) | 0) % 2) return;
    const c = this.c, [tx, ty] = animTail(c), h = c.heading || 0, w = animWidth(c), len = 3 + 4 * (1 - this.t / this.life), z = (c.z || 0) + 3;
    for (const s of [-1, 0, 1]) {
      const ox = tx - Math.sin(h) * s * (w * 0.8 + 1), oy = ty + Math.cos(h) * s * (w * 0.8 + 1), back = s ? 1.5 : 0.5;
      animLine(r, ox - Math.cos(h) * back, oy - Math.sin(h) * back, ox - Math.cos(h) * (back + len), oy - Math.sin(h) * (back + len), z, '#dff6ff');
    }
  }
}
// An electric sting, jagged, from a tentacle to what it touched.
class Zap {
  constructor(from, to) { this.from = from; this.to = to; this.t = 0; this.life = 0.4; }
  update(dt) { this.t += dt; return this.t < this.life && !this.to.gone; }
  draw(r) {
    const [x0, y0] = [this.from.x, this.from.y], [x1, y1] = animHead(this.to), z = Math.max(this.from.z || 0, this.to.z || 0) + 2;
    let px = x0, py = y0;
    for (let i = 1; i <= 5; i++) {
      const k = i / 5, nx = x0 + (x1 - x0) * k + (i < 5 ? rand(-1.5, 1.5) : 0), ny = y0 + (y1 - y0) * k + (i < 5 ? rand(-1.5, 1.5) : 0);
      animLine(r, px, py, nx, ny, z, i % 2 ? '#bff4ff' : '#fff27a');
      px = nx; py = ny;
    }
    for (let i = 0; i < 3; i++) r.dot(x1 + rand(-2, 2), y1 + rand(-2, 2), z, animMat('#fff27a'), animId());
  }
}
// Bits of food flying off a chomp.
class Crumbs {
  constructor(x, y, z, hex) { this.p = Array.from({ length: 5 }, () => ({ a: rand(0, TAU), v: rand(3, 8) })); this.x = x; this.y = y; this.z = z; this.hex = hex; this.t = 0; this.life = 0.45; }
  update(dt) { this.t += dt; return this.t < this.life; }
  draw(r) { for (const q of this.p) r.dot(this.x + Math.cos(q.a) * q.v * this.t, this.y + Math.sin(q.a) * q.v * this.t, this.z, animMat(this.hex), animId()); }
}
// Dazed: little stars circling a stung animal.
class Dazed {
  constructor(c, life) { this.c = c; this.t = 0; this.life = life; }
  update(dt) { this.t += dt; return this.t < this.life && !this.c.gone; }
  draw(r) {
    const c = this.c, [hx, hy] = animHead(c), z = (c.z || 0) + 7;
    for (let i = 0; i < 3; i++) { const a = this.t * 6 + i * TAU / 3; r.dot(hx + Math.cos(a) * 3, hy + Math.sin(a) * 1.5 - 3, z, animMat('#fff27a'), animId()); }
  }
}

// ---- what sets them off ------------------------------------------------------------------------------
// A meal: chomps and crumbs for food; for prey, the lunge and snap, and the prey drawn into the mouth.
function animMeal(world, c, f) {
  if (typeof Creature !== 'undefined' && f instanceof Creature) {
    playAnim(world, c, 'attack', animToward(c, f));
    animFx(world, new Jaws(c));
    if (f.draw) animFx(world, new Swallow(world, f, c));
  } else {
    playAnim(world, c, 'eat', Number.isFinite(f.x) ? animToward(c, f) : null);
    const [hx, hy] = animHead(c);
    animFx(world, new Crumbs(hx, hy, (f.z ?? c.z ?? 0) + 1, f.kind === 'brine' || f.kind === 'krill' ? '#ff9a7a' : f.kind === 'spirulina' ? '#5aff7a' : '#c89a5a'));
  }
}
// A blow landed in a fight: the attacker lunges and snaps, the one hit flinches.
function animStrike(world, attacker, target) {
  const a = animToward(attacker, target);
  playAnim(world, attacker, 'attack', a);
  animFx(world, new Jaws(attacker));
  // (The blow lands when the lunge reaches it.)
  const contact = ANIM_DUR.attack * 0.4;
  playAnim(world, target, 'hit', a, contact);
  animFx(world, new Impact((attacker.x + target.x * 2) / 3, (attacker.y + target.y * 2) / 3, Math.max(attacker.z || 0, target.z || 0), a, contact));
}
// A flight: the tuck and dash, speed lines, and a burst of speed.
function animFlee(world, c) {
  if (!c || c.gone || (c.anim && c.anim.kind === 'flee' && world.t - c.anim.at < c.anim.dur)) return;
  playAnim(world, c, 'flee');
  animFx(world, new Streak(c));
  if (Number.isFinite(c.speed) && Number.isFinite(c.maxSpeed)) c.speed = Math.max(c.speed, c.maxSpeed * 1.25);
}

// ---- tentacles: octopus, kraken and squid take prey with their arms -------------------------------------
const GRIP_REACH = 14, GRIP_TIME = 1.1;
// Start a grab when prey is within an arm's reach; the three arms nearest it go for it.
function tentacleGrab(world, c, prey) {
  if (c.grip || !c.arms || !prey || prey.heldBy || prey.caught || prey.gone || world.observe ||
    (typeof huntable === 'function' && !huntable(world, prey)) || Math.hypot(prey.x - c.x, prey.y - c.y) > GRIP_REACH) return false;
  const toward = Math.atan2(prey.y - c.y, prey.x - c.x);
  const arms = c.arms.map((arm) => ({ arm, d: Math.abs(wrapAngle(c.heading + arm.ang - toward)) })).sort((a, b) => a.d - b.d).slice(0, 3);
  for (const { arm } of arms) arm.grip = true;
  c.grip = { prey, at: world.t };
  prey.heldBy = c;
  playAnim(world, prey, 'hit', animToward(c, prey));
  if (typeof glyph === 'function') glyph(world, prey, 'bang');
  return true;
}
// One gripping arm this frame (from Octopus.update): reach for the prey, curling as it hauls in.
function gripArm(c, arm, bx, by) {
  if (!c.grip || !arm.grip) return false;
  const q = c.grip.prey, curl = Math.sin(((c.grip.curl || 0) + arm.ang) * 3) * 1.2;
  arm.tx = q.x + curl; arm.ty = q.y - curl; arm.lift = 3; arm.stepping = false;
  arm.ch.reach(bx, by, arm.tx, arm.ty);
  return true;
}
function releaseGrip(c) {
  if (!c.grip) return;
  if (c.grip.prey && c.grip.prey.heldBy === c) c.grip.prey.heldBy = null;
  for (const arm of c.arms || []) arm.grip = false;
  c.grip = null;
}
function updateGrips(world, dt) {
  for (const c of world.creatures) {
    const G = c.grip;
    if (!G) continue;
    const q = G.prey, p = (world.t - G.at) / GRIP_TIME;
    G.curl = (G.curl || 0) + dt * 2;
    // Let go if the prey is gone or protected now, or the octopus is fleeing or caught.
    if (!q || q.gone || q.caught || c.gone || c.dying || c.grabbed || c.jet > 0 || (typeof huntable === 'function' && !huntable(world, q))) { releaseGrip(c); continue; }
    // Haul it in toward the beak, struggling.
    const [mx, my] = [c.x + Math.cos(c.heading) * 1.5, c.y + Math.sin(c.heading) * 1.5], k = Math.min(1, dt * (1.5 + 3 * p));
    q.x += (mx - q.x) * k; q.y += (my - q.y) * k;
    q.heading = (q.heading || 0) + Math.sin(world.t * 22) * 0.25;
    if (q.body && q.body.resolve) q.body.resolve(q.x, q.y, q.heading);
    if (q.speed != null) q.speed = 0;
    c.speed = (c.speed || 0) * 0.8;
    if (p >= 1) { releaseGrip(c); q.heldBy = null; eat(world, c, q); }
  }
  // Anything still marked as held by something that let go moves on its own again.
  for (const q of world.creatures) if (q.heldBy && (!q.heldBy.grip || q.heldBy.grip.prey !== q)) q.heldBy = null;
}

// ---- stings and pinches ----------------------------------------------------------------------------------
const isJelly = (c) => typeof Jelly !== 'undefined' && c instanceof Jelly;
const isCrab = (c) => typeof Crab !== 'undefined' && c instanceof Crab;
let stingClock = 0;
function updateStings(world, dt) {
  stingClock -= dt;
  if (stingClock > 0 || world.observe) return;
  stingClock = 0.2;
  for (const c of world.creatures) {
    if (!c.life || c.dying || c.gone || c.grabbed || (c.stingAt && world.t - c.stingAt < 3)) continue;
    const jelly = isJelly(c), crab = !jelly && isCrab(c);
    if (!jelly && !crab) continue;
    const R = jelly ? (c.R || 4) + 7 : animWidth(c) + 4;
    let victim = null;
    forNear(world, c.x, c.y, R, (q, d2) => {
      if (victim || q === c || !q.life || q.dying || q.gone || q.caught || q.heldBy || isJelly(q) || (crab && isCrab(q))) return;
      if (Math.abs((q.z || 0) - (c.z || 0)) > (jelly ? 16 : 8) || animWidth(q) > animWidth(c) * (jelly ? 3 : 1.6)) return;
      if (typeof huntable === 'function' && !huntable(world, q)) return;
      // A crab only pinches what is in front of its claws.
      if (crab && Math.cos(Math.atan2(q.y - c.y, q.x - c.x) - c.heading) < 0.4) return;
      victim = q;
    });
    if (!victim) continue;
    c.stingAt = world.t;
    if (jelly) {
      const tip = c.tents ? c.tents[(Math.random() * c.tents.length) | 0] : null;
      animFx(world, new Zap(tip ? { x: tip.x[tip.n - 1], y: tip.y[tip.n - 1], z: c.z - 6 } : c, victim));
      playAnim(world, c, 'sting');
      victim.hold = world.t + 1.2;
      animFx(world, new Dazed(victim, 1.2));
      if (typeof hurt === 'function') hurt(world, victim, 0.08, { why: `stung by a ${describe(c).label.toLowerCase()}`, canKill: false });
      if (typeof forageLearn === 'function') forageLearn(victim, c.species, 0, 0.08); // (a mind remembers what stung it)
    } else {
      playAnim(world, c, 'attack', animToward(c, victim));
      animFx(world, new Jaws(c, true)); // (a pinch, not jaws)
      if (typeof hurt === 'function') hurt(world, victim, 0.05, { why: 'pinched by a crab', canKill: false });
      if (typeof forageLearn === 'function') forageLearn(victim, c.species, 0, 0.05);
    }
    playAnim(world, victim, 'hit', animToward(c, victim));
    animFx(world, new Impact(victim.x, victim.y, victim.z || 0, animToward(c, victim)));
    if (typeof startle === 'function') startle(world, victim, c.x, c.y, 1.5);
  }
}

// Every update (pond time): hunted animals bolt when a hunter first locks on; grips; stings.
function updateAnims(world, dt) {
  for (const c of world.creatures) {
    if (c.threat && c.threat !== c.animThreat) animFlee(world, c);
    c.animThreat = c.threat || null;
  }
  updateGrips(world, dt);
  updateStings(world, dt);
}
