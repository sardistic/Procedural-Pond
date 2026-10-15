'use strict';
// Action animations and the moments between species: the lunge and snap of an attack, the flinch
// of the one hit, the tuck-and-dash of a flight, the chomp of a meal (and prey drawn down into the
// mouth), octopus arms that shoot out, wrap and haul prey in, jellies that sting whatever brushes
// their tentacles, and crabs that pinch what comes too close.
//
// Animations run in pond time. Each creature has at most one (c.anim). An animal with a spine (a body chain) is
// moved through the action by bending it, joint by joint, as it's drawn (animBend; put back afterwards, so the
// swimming isn't disturbed): an attack coils into a C, drives the head toward its target, and eases back into its
// swimming curve; the one hit is knocked aside and a whip runs
// down its body; a flight is a fish's C-start, a tight curl away and a hard tail-flick off; a meal is a dip of the
// head, bite by bite, the tail working. Others (jellies, crabs, octopus, the shelled) take a pose instead (animPose,
// Raster.setPose); walkers solve their planted limbs again, and arms reach through FABRIK. Effects draw jaws, impact,
// streaks, zaps, crumbs and the swallow.

const ANIM_DUR = { attack: 0.95, eat: 0.7, hit: 0.55, flee: 0.7, sting: 0.45 };
const ANIM_FX_CAP = 214;
const animFx = (world, e) => { if (world.effects && world.effects.length < ANIM_FX_CAP) world.effects.push(e); };

// dir: the line of the action (toward the target for an attack, away from the blow for a hit).
function playAnim(world, c, kind, dir = null, delay = 0) {
  if (!c || c.gone) return false;
  // Finish the current action, including recovery. Repeated contact used to
  // reset a half-finished pose to zero, especially while a giant swept up food.
  const A = c.anim;
  if (A && world.t - A.at < A.dur) return false;
  const heading = c.body?.a?.[0] ?? c.heading ?? 0;
  const aimTurn = Number.isFinite(dir) ? wrapA(dir - heading) : 0;
  const side = Math.abs(aimTurn) > 0.15 ? Math.sign(aimTurn) : Math.random() < 0.5 ? -1 : 1;
  c.anim = { kind, at: world.t + delay, dur: ANIM_DUR[kind] || 0.4, dir: Number.isFinite(dir) ? dir : null, side, aimTurn };
  return true;
}
const animToward = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
// (Its head where it was last drawn this moment, bent: the jaws and the swallow follow that.)
const animHead = (c) => (c.animHeadT === world.t && c.animHeadXY ? c.animHeadXY : c.body && c.body.x && !c.tents ? [c.body.x[0], c.body.y[0]] : [c.x, c.y]);
const animTail = (c) => (c.body && c.body.x && !c.tents ? [c.body.x[c.body.n - 1], c.body.y[c.body.n - 1]] : [c.x, c.y]);
// (A jelly's body chain is one thin tentacle; its bell radius is its size.)
const animWidth = (c) => (c.tents && c.R ? c.R : c.body && c.body.w ? Math.max(...c.body.w) : c.R || 2);

// Easing.
const easeOut = (t) => 1 - (1 - t) * (1 - t), easeIn = (t) => t * t, seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const animEase = (t) => t * t * (3 - 2 * t);
// One continuous action drives the body, planted feet, grasping limbs and mouth.
function attackMotion(c, now) {
  const A = c.anim;
  if (!A || A.kind !== 'attack') return null;
  const p = (now - A.at) / A.dur;
  if (p < 0 || p >= 1) return null;
  const wind = animEase(seg(p, 0, 0.24)) * (1 - animEase(seg(p, 0.24, 0.42)));
  const drive = animEase(seg(p, 0.24, 0.42)) * (1 - animEase(seg(p, 0.56, 1)));
  return { p, wind, drive, settle: Math.sin(PI * seg(p, 0.42, 1)) ** 2, dir: A.dir ?? c.heading ?? 0, side: A.side || 1 };
}
function actionFin(c, side) {
  const M = attackMotion(c, world.t);
  const idle = Math.sin(world.t * 2.2 + (c.phase || 0) + side * 0.4) * 0.08;
  return side * (M ? idle * (1 - clamp(M.wind + M.drive, 0, 1)) + 0.55 * M.wind - 0.65 * M.drive : idle);
}
// The pose to draw it in right now: { x, y, ang, sa, sb, dx, dy, dz } (about its middle, along ang), or null.
function animPose(c, now) {
  const A = c.anim;
  if (!A) return null;
  const p = (now - A.at) / A.dur;
  if (p >= 1) { c.anim = null; return null; }
  if (p < 0) return null; // (waiting for its moment: a blow lands when the lunge does)
  if (animBends(c) && A.kind !== 'sting') {
    // (Bent instead, joint by joint: only a lift as it strikes or is struck.)
    const grounded = typeof Walker !== 'undefined' && c instanceof Walker || typeof Frog !== 'undefined' && c instanceof Frog;
    const dz = grounded ? 0 : A.kind === 'attack' ? 0.6 * Math.sin(PI * seg(p, 0.24, 0.65)) : A.kind === 'hit' ? 0.5 * Math.sin(PI * seg(p, 0, 0.4)) : 0;
    return dz ? { x: c.x, y: c.y, ang: 0, sa: 1, sb: 1, dx: 0, dy: 0, dz } : null;
  }
  const ang = A.dir ?? c.heading ?? 0, w = animWidth(c), cx = c.x, cy = c.y;
  let sa = 1, sb = 1, d = 0, dz = 0;
  switch (A.kind) {
    case 'attack': {
      const M = attackMotion(c, now), reach = clamp(w * 1.3, 2, 7);
      d = reach * (-0.35 * M.wind + M.drive);
      sa = 1 - 0.14 * M.wind + 0.28 * M.drive; sb = 1 + 0.1 * M.wind - 0.14 * M.drive;
      break;
    }
    case 'hit': {
      // Knocked back along the blow, squashed against it, then a wobble that dies away.
      const k = animEase(seg(p, 0, 0.18)) * (1 - animEase(seg(p, 0.18, 1)));
      const wob = k * Math.exp(-5 * p) * Math.sin(p * 22);
      d = clamp(w * 0.9, 1.5, 4) * k;
      sa = 1 - 0.22 * k + 0.08 * wob; sb = 1 + 0.16 * k - 0.06 * wob;
      break;
    }
    case 'eat': {
      // Two bites: the head bobs forward, a little stretched, and back.
      const bite = Math.sin(2 * PI * p) ** 2;
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
  if (c.arms && Array.isArray(c.arms)) { sa = sb = 1; d = 0; dz *= 0.35; }
  return { x: cx, y: cy, ang, sa, sb, dx: Math.cos(ang) * d, dy: Math.sin(ang) * d, dz };
}
// (The older name, for anything still asking for a plain scale: none now.)
const animScale = () => null;

// ---- bending the spine ------------------------------------------------------------------------------------
const animBends = (c) => !!(c.body && c.body.a && c.body.links && !c.tents && !Array.isArray(c.arms) && c.body.n >= 2);
const BEND_SAVE = new WeakMap();
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Bend its body for the action, as it's about to be drawn; animUnbend puts it back. Each joint's direction is turned
// by a curve along the body (the head's turn fading down the neck, a bend growing toward the tail, a travelling
// wave), and the body is laid out again from the head along its own links, so it curves without stretching.
function animBend(c, now) {
  const A = c.anim, B = c.body;
  if (!A || !animBends(c) || A.kind === 'sting') return false;
  const p = (now - A.at) / A.dur;
  if (p < 0 || p >= 1) return false;
  const grounded = typeof Walker !== 'undefined' && c instanceof Walker || typeof Frog !== 'undefined' && c instanceof Frog;
  const n = B.n, h0 = B.a[0], w = animWidth(c), reach = grounded ? Math.min(2.5, w * 0.55) : clamp(w * 1.5, 2, 9);
  let S = BEND_SAVE.get(B);
  if (!S || S.x.length !== n) { S = { x: new Float64Array(n), y: new Float64Array(n), a: new Float64Array(n) }; BEND_SAVE.set(B, S); }
  S.x.set(B.x); S.y.set(B.y); S.a.set(B.a);
  const dir = A.dir ?? h0, side = A.side || 1;
  // Keep the initial angle branch and coil side through the whole action.
  // Recomputing its sign near the target could mirror a 64-joint body in one frame.
  const aim = A.aimTurn ?? (A.aimTurn = wrapA(dir - h0));
  const toT = clamp(aim + wrapA(dir - h0 - aim), -1, 1);
  // headTurn: the head's own turn; bend: the curve from head to tail (radians, all told); wave: a travelling whip;
  // thrust: the head moved along the line of the action; knock: the whole body moved along it.
  let headTurn = 0, bend = 0, wave = 0, wavePh = 0, thrust = 0, knock = 0;
  switch (A.kind) {
    case 'attack': {
      const M = attackMotion(c, now);
      bend = side * (-1.1 * M.wind + 0.28 * M.drive - 0.16 * M.settle);
      headTurn = -side * 0.2 * M.wind + toT * M.drive;
      thrust = reach * (-0.35 * M.wind + M.drive);
      wave = 0.18 * M.drive; wavePh = p * 9;
      break;
    }
    case 'hit': {
      // Knocked aside along the blow: the body folds round where it was struck, a whip runs down it, and it rights.
      const k = animEase(seg(p, 0, 0.14)) * (1 - animEase(seg(p, 0.14, 1)));
      bend = side * 1.1 * k * (1 - animEase(seg(p, 0.14, 0.55))); headTurn = -side * 0.5 * k * (1 - animEase(seg(p, 0.14, 0.5)));
      wave = 0.55 * k * Math.exp(-4 * p); wavePh = p * 16;
      knock = clamp(w * 1.1, 1.5, 5) * k;
      break;
    }
    case 'flee': {
      // The C-start: a tight curl away, then a hard flick of the tail that throws it off, and the tail beating.
      const curl = animEase(seg(p, 0, 0.22)) * (1 - animEase(seg(p, 0.22, 0.38)));
      const flick = animEase(seg(p, 0.22, 0.38)) * (1 - animEase(seg(p, 0.38, 1)));
      bend = side * (1.3 * curl - 0.6 * flick); headTurn = side * 0.5 * curl;
      wave = 0.5 * animEase(seg(p, 0.28, 0.46)) * (1 - animEase(seg(p, 0.46, 1)));
      wavePh = (p - 0.28) * 26; thrust = reach * 0.6 * flick;
      break;
    }
    case 'eat': {
      // Bite by bite: the head dips at it and tugs, the tail sweeping to drive it in.
      const envelope = animEase(seg(p, 0, 0.16)) * (1 - animEase(seg(p, 0.72, 1)));
      const bite = Math.sin(2 * PI * p) ** 2, tug = Math.sin(4 * PI * p);
      headTurn = (toT * 0.6 + 0.18 * tug * bite) * envelope; thrust = clamp(w * 0.8, 1, 3.5) * bite;
      wave = 0.28 * envelope; wavePh = p * 20;
      break;
    }
    default: return false;
  }
  if (grounded) { headTurn *= 0.3; bend *= 0.18; wave *= 0.2; knock *= 0.4; }
  else {
    // A giant keeps its normal swimming wave; a small action must not whip
    // hundreds of pixels of tail around as quickly as a short fish's body.
    const actionScale = Math.min(1, 24 / B.links.reduce((sum, length) => sum + length, 0));
    headTurn *= actionScale; bend *= actionScale; wave *= actionScale;
  }
  // Lay the body out again from the head along its links, each joint turned by its share.
  const X = B.x, Y = B.y, Aa = B.a;
  const ca = Math.cos(dir), sa = Math.sin(dir);
  X[0] = S.x[0] + ca * (thrust + knock); Y[0] = S.y[0] + sa * (thrust + knock);
  Aa[0] = S.a[0] + headTurn;
  for (let i = 1; i < n; i++) {
    const u = i / (n - 1);
    const off = headTurn * (1 - u) * (1 - u) + bend * u + wave * Math.sin(u * PI * 1.7 - wavePh) * u;
    Aa[i] = S.a[i] + off;
    X[i] = X[i - 1] - Math.cos(Aa[i]) * B.links[i - 1];
    Y[i] = Y[i - 1] - Math.sin(Aa[i]) * B.links[i - 1];
  }
  c.animHeadXY = [X[0], Y[0]]; c.animHeadA = Aa[0]; c.animHeadT = world.t;
  return true;
}

// Keep feet in world space while their shoulders follow the moving spine.
function actionFoot(c, L, now) {
  const M = attackMotion(c, now);
  if (!M) return [L.fx, L.fy, L.lift];
  const front = L.bi <= Math.max(1, Math.floor(c.body.n * 0.35));
  const active = front && L.side === M.side;
  const stride = active ? (L.l1 + L.l2) * 0.35 * M.drive : -0.12 * M.wind;
  return [L.fx + Math.cos(M.dir) * stride, L.fy + Math.sin(M.dir) * stride,
    L.lift + (active ? Math.sin(PI * seg(M.p, 0.2, 0.62)) * 0.8 : 0)];
}

// A real two-link claw, attached to its shoulder, with a closing pincer.
function drawActionClaw(r, c, bx, by, facing, side, length, armMat, clawMat, z, t) {
  const M = attackMotion(c, world.t), active = M && side === M.side;
  const drive = active ? M.drive : M ? M.drive * 0.25 : 0, wind = M ? M.wind : 0;
  const yaw = active ? clamp(wrapA(M.dir - facing), -1.2, 1.2) * drive : 0;
  const a = facing + side * (0.35 + 0.45 * wind - 0.22 * drive) + yaw;
  const reach = length * (0.72 - 0.2 * wind + 0.26 * drive);
  const tx = bx + Math.cos(a) * reach, ty = by + Math.sin(a) * reach;
  const [ex, ey, fx, fy] = solveLimb(bx, by, tx, ty, length * 0.5, length * 0.5, side);
  const id = c.id, tip = Math.atan2(fy - ey, fx - ex), open = M ? 0.13 + 0.58 * wind + 0.15 * (1 - drive) : 0.18 + 0.07 * Math.sin(t * 1.7 + side);
  r.tube(bx, by, 0.55, z, ex, ey, 0.45, z + 0.35, 0.8, armMat, id);
  r.tube(ex, ey, 0.45, z + 0.35, fx, fy, 0.65, z + 0.55, 0.8, armMat, id);
  r.ellipsoid(fx, fy, length * 0.24, length * 0.16, tip, z + 0.55, 0.65, clawMat, id);
  for (const s of [-1, 1]) {
    const pa = tip + s * open, px = fx + Math.cos(tip) * length * 0.14, py = fy + Math.sin(tip) * length * 0.14;
    r.tube(px, py, 0.35, z + 0.55, px + Math.cos(pa) * length * 0.28, py + Math.sin(pa) * length * 0.28, 0.12, z + 0.55, 0.8, clawMat, id);
  }
}
function animUnbend(c) {
  const B = c.body, S = B && BEND_SAVE.get(B);
  if (!S) return;
  B.x.set(S.x); B.y.set(S.y); B.a.set(S.a);
}

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
  constructor(c, pinch = false) { this.c = c; this.t = 0; this.life = c.anim?.dur || ANIM_DUR.attack; this.pinch = pinch; }
  update(dt) { this.t += dt; return this.t < this.life && !this.c.gone; }
  draw(r) {
    const c = this.c, design = typeof DESIGNS !== 'undefined' && DESIGNS[c.species];
    // Claws and tentacles perform the action themselves; no floating cartoon jaws.
    if (this.pinch || Array.isArray(c.arms) || (typeof Crab !== 'undefined' && c instanceof Crab) || design?.look.claws) return;
    const M = attackMotion(c, world.t);
    if (!M) return;
    const h = c.animHeadT === world.t ? c.animHeadA : M.dir, [hx, hy] = animHead(c);
    const w = Math.max(0.7, c.body?.w[0] || animWidth(c)), L = Math.min(4, w * 0.8);
    const z = (c.z || 0) + w * (c.sp?.hs || 1) + 0.35;
    const skin = c.sp?.base || c.skinMat || c.mat || animMat('#56756e');
    const open = 0.08 + 0.55 * M.wind + 0.12 * (1 - M.drive);
    const fx = hx + Math.cos(h) * w * 0.55, fy = hy + Math.sin(h) * w * 0.55;
    r.ellipsoid(fx, fy, L, Math.max(0.35, L * open), h, z, 0.12, animMat('#080a10'), c.id);
    for (const side of [-1, 1]) {
      const a = h + side * open, ex = fx + Math.cos(a) * L, ey = fy + Math.sin(a) * L;
      r.tube(fx, fy, w * 0.16, z + 0.1, ex, ey, w * 0.08, z + 0.1, 0.7, skin, c.id);
      for (let i = 1; i <= 2; i++) {
        const x = lerp(fx, ex, i / 3), y = lerp(fy, ey, i / 3);
        r.tube(x, y, 0.15, z + 0.18, x - Math.sin(a) * side * 0.45, y + Math.cos(a) * side * 0.45, 0.05, z + 0.18, 0.8, WHITE_FANG, c.id);
      }
    }
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
    if (playAnim(world, c, 'attack', animToward(c, f))) animFx(world, new Jaws(c));
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
  if (playAnim(world, attacker, 'attack', a)) animFx(world, new Jaws(attacker));
  // (The blow lands when the lunge reaches it.)
  const contact = (attacker.anim?.dur || ANIM_DUR.attack) * 0.42;
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
  for (const { arm } of arms) { arm.grip = true; arm.gripFrom = [arm.tx, arm.ty]; }
  playAnim(world, c, 'attack', toward);
  c.grip = { prey, at: world.t, preyHeading: prey.heading || 0 };
  prey.heldBy = c;
  playAnim(world, prey, 'hit', animToward(c, prey));
  if (typeof glyph === 'function') glyph(world, prey, 'bang');
  return true;
}
// One gripping arm this frame (from Octopus.update): reach for the prey, curling as it hauls in.
function gripArm(c, arm, bx, by) {
  if (!c.grip || !arm.grip) return false;
  const q = c.grip.prey, curl = Math.sin(((c.grip.curl || 0) + arm.ang) * 3) * 1.2;
  const reach = animEase(clamp((world.t - c.grip.at) / (GRIP_TIME * 0.3), 0, 1));
  const from = arm.gripFrom || [arm.tx, arm.ty];
  arm.tx = lerp(from[0], q.x + curl * reach, reach); arm.ty = lerp(from[1], q.y - curl * reach, reach);
  arm.lift = 1.5 * Math.sin(PI * reach); arm.stepping = false;
  arm.ch.reach(bx, by, arm.tx, arm.ty);
  return true;
}
// Fighting without a held victim: the forward arms unfurl while the rear arms brace.
function attackArm(c, arm, bx, by) {
  const M = attackMotion(c, world.t);
  if (!M || Math.cos(c.heading + arm.ang - M.dir) < 0.3) return false;
  if (arm.attackAt !== c.anim.at) { arm.attackAt = c.anim.at; arm.attackFrom = [arm.tx, arm.ty]; }
  const length = arm.ch.links.reduce((a,b)=>a+b,0), from = arm.attackFrom;
  const reach = length * (0.66 + 0.23 * M.drive), angle = M.dir + Math.sin(arm.ang) * 0.25;
  const x = bx + Math.cos(angle) * reach, y = by + Math.sin(angle) * reach;
  arm.tx = lerp(from[0], x, M.drive); arm.ty = lerp(from[1], y, M.drive);
  arm.lift = 1.8 * Math.sin(PI * M.drive); arm.stepping = false;
  arm.ch.reach(bx, by, arm.tx, arm.ty);
  return true;
}
function releaseGrip(c) {
  if (!c.grip) return;
  if (c.grip.prey && c.grip.prey.heldBy === c) c.grip.prey.heldBy = null;
  for (const arm of c.arms || []) { arm.grip = false; arm.gripFrom = null; }
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
    const haul = animEase(clamp((p - 0.3) / 0.7, 0, 1));
    q.x += (mx - q.x) * k * haul; q.y += (my - q.y) * k * haul;
    q.heading = G.preyHeading + Math.sin(world.t * 14) * 0.18 * haul;
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
      if (crab && Math.cos(Math.atan2(q.y - c.y, q.x - c.x) - c.legBase()) < 0.4) return;
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
    const contact = crab ? c.anim.dur * 0.42 : 0;
    playAnim(world, victim, 'hit', animToward(c, victim), contact);
    animFx(world, new Impact(victim.x, victim.y, victim.z || 0, animToward(c, victim), contact));
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
