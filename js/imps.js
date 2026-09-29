'use strict';
// What comes out of the jungle. Long after the jungle has come out of the haze up the beach (a fortnight of
// pond days at least), and only in a pond far enough gone in its curse (character.js), small red things
// with horns come out from under the trees now and then, mostly at night: one, two, three of them, a few
// pixels high. They walk a little way down into the scrub, stand looking at the pond, and go back in. They
// shy from the pointer. It's easy to miss.
// Each time they come out, they're a little more used to the pond. The tribute (a figure of black glass,
// grinning, found very rarely inside an alien artifact broken up with the Net, or washed up on the beach
// in a pond where they lie) can be raised on the dry beach; then each time they come out there's a chance
// (better the more often they've come) that they come all the way down to it: over the sand, round it in
// a ring, hopping, and back up into the jungle, and they leave something at its feet.

const IMP_M = { skin: mat('#2a0404', '#4a0a08', '#6e1410', '#9a2418'), horn: mat('#0a0404', '#1a0a08', '#2a1410', '#3e2018'), eye: mat('#ff2a0a', '#ff6a2a', '#ffb04a', '#fff0a0') };
const IMP_COL = { skin: hexToInt('#5a0e0a'), dark: hexToInt('#240404'), horn: hexToInt('#140606'), eye: hexToInt('#ff5a1a'), eyeDim: hexToInt('#8a2a10') };
const IMP_MIN_DAYS = 14, IMP_MIN_CURSE = 0.35;
const IMPS = { out: null, visit: null };
const impState = (world) => world.game && (world.game.imps || (world.game.imps = { seen: 0, visits: 0 }));
Object.assign(SINGULAR, { imp: 'Something from the jungle' });

// ---- the tribute ------------------------------------------------------------------------------------------------------
STRUCTURES.tribute = {
  label: 'Tribute', pearls: 40, essence: 0, r: 40, size: 6, dry: true, unique: true, found: 'tributeFound', aura: { comfort: -0.04, aggression: 0.05 },
  desc: 'a grinning figure of black glass, raised on the dry beach above the tide: the things in the jungle notice it, and the more often they have come out, the likelier they come down to it (and leave something)',
};
STRUCT_CODES.push('tribute'); // (append-only: links)
BUILD.tribute = (s) => { s.ang = rand(-PI, PI); s.h = rand(7, 9); };
const TRIBUTE_GLASS = mat('#040306', '#0c0a12', '#1a1624', '#34304a'), TRIBUTE_PLINTH = mat('#2a2622', '#403a34', '#5a524a', '#7a7066');
BAKE.tribute = (r, s, next) => {
  const { x, y, h, ang } = s, id = next(TRIBUTE_GLASS);
  r.ellipsoid(x, y, 4.2, 4.2, PI / 4, 0, 1.4, TRIBUTE_PLINTH, next(TRIBUTE_PLINTH));
  // Squat, fat-bellied, its arms round its knees, its head too big, grinning.
  r.ellipsoid(x, y, 2.4, 2.2, ang, 1.4, h * 0.45, TRIBUTE_GLASS, id);
  r.ellipsoid(x + Math.cos(ang) * 0.4, y + Math.sin(ang) * 0.4, 2.2, 2, ang, 1.4 + h * 0.45, h * 0.4, TRIBUTE_GLASS, id);
  for (const sd of [-1, 1]) r.tube(x + Math.cos(ang + sd * 1.2) * 1.4, y + Math.sin(ang + sd * 1.2) * 1.4, 0.5, 1.4 + h * 0.8, x + Math.cos(ang + sd * 1.6) * 2.6, y + Math.sin(ang + sd * 1.6) * 2.6, 0.2, 1.4 + h + 1.5, 1, TRIBUTE_GLASS, id);
};
DRAW.tribute = (r, s, t, world) => {
  // Its eyes catch a light that isn't there, at night.
  if ((world.darkness || 0) < 0.4) return;
  if (s.eyeId == null) { s.eyeId = newId(hexToInt('#200402')); EMISSIVE[s.eyeId] = 2; }
  const a = s.ang, z = 1.4 + s.h * 0.45 + s.h * 0.25;
  if (Math.sin(t * 0.7 + s.seed) > -0.6) for (const sd of [-1, 1]) r.dot(s.x + Math.cos(a + sd * 0.45) * 2, s.y + Math.sin(a + sd * 0.45) * 2, z, IMP_M.eye, s.eyeId);
};

// Found: inside an alien artifact broken with the Net (rarely), or washed up on the beach of a pond where they lie.
function findTribute(world, how) {
  const G = world.game;
  if (!G || G.tributeFound) return false;
  G.tributeFound = world.days;
  logEvent(world, `✦ ${how}: a small figure of black glass, squatting, grinning. It is warm to the touch. (A tribute: raise it on the dry beach, from Build)`, null, { cat: 'rare', pri: 3 });
  if (typeof refreshSpeciesButtons === 'function') setTimeout(refreshSpeciesButtons, 0);
  return true;
}
function tributeFromBreak(world, a) { if (Math.random() < 0.1 + 0.03 * (a.gen || 1)) findTribute(world, `Inside the broken ${PARASITES[a.kind].thing}`); }
function dawnTribute(world) { if (world.xeno && world.xeno.length && world.shore && Math.random() < 0.012) findTribute(world, 'Washed up on the beach at dawn'); }

// ---- coming out -------------------------------------------------------------------------------------------------------
function impsReady(world) {
  const G = world.game, S = impState(world);
  if (!G || world.observe || !world.shore || typeof HINTER === 'undefined' || !HINTER.ready || !HINTER.gaps.length) return false;
  if (S.jungle == null) { if (HINTER.shown > HZ_SCRUB + 14) S.jungle = world.days; return false; }
  return world.days - S.jungle >= IMP_MIN_DAYS && curseLevel(world) >= IMP_MIN_CURSE;
}
function updateImps(world, dt) {
  if (!world.game || world.observe) return;
  const S = impState(world), O = IMPS.out;
  if (!O) {
    if (!impsReady(world) || world.days - (S.last || -9) < 0.5) return;
    const night = (world.darkness || 0) > 0.45, cur = curseLevel(world);
    if (Math.random() < dt * 0.004 * (0.5 + cur) * (night ? 1 : 0.12)) startOuting(world, S);
    return;
  }
  O.t += dt;
  const p = world.pointer, [pdd, pu] = p && p.inside !== false ? hinterWorldToLocal(world, p.x, p.y) : [-999, -999];
  let home = 0;
  for (const m of O.imps) {
    if (m.gone) { home++; continue; }
    // (Near the pointer, they turn and run.)
    if (!O.shy && O.phase !== 'pond' && Math.abs(m.dd - pdd) + Math.abs(m.u - pu) < 22) { O.shy = true; O.phase = 'up'; }
    let tdd = m.tdd, tu = m.tu, spd = m.spd;
    if (O.phase === 'up') { tdd = m.dd0; tu = m.u0; spd = m.spd * (O.shy ? 2.2 : 1); }
    else if (O.phase === 'look') { tdd = m.dd; tu = m.u; if (O.t > O.lookEnd) O.phase = 'up'; }
    else if (O.phase === 'pond') continue;
    const ddd = tdd - m.dd, du = tu - m.u, d = Math.hypot(ddd, du);
    m.walk = d > 0.5;
    if (m.walk) { const k = Math.min(1, spd * dt / d); m.dd += ddd * k; m.u += du * k + Math.sin(O.t * 3 + m.ph) * 0.05; m.step += dt * 8; }
    else if (O.phase === 'up') m.gone = true;
  }
  if (O.phase === 'down' && O.imps.every((m) => !m.walk)) {
    if (O.visit) enterPond(world, O); else { O.phase = 'look'; O.lookEnd = O.t + rand(3, 8); }
  }
  if (O.phase === 'pond' && !world.creatures.some((c) => c.species === 'imp' && !c.gone)) {
    for (const m of O.imps) { m.dd = 0.5; m.gone = false; }
    O.phase = 'up';
  }
  if (O.phase === 'up' && home === O.imps.length) endOuting(world, S, O); // (all back under the trees)
}
function startOuting(world, S) {
  const H = HINTER, along = world.shoreSide < 2 ? world.H : world.W, cur = curseLevel(world);
  const tribute = (world.structures || []).find((s) => s.kind === 'tribute' && !s.anim);
  const visit = !!tribute && Math.random() < Math.min(0.85, 0.06 * (S.seen + 1));
  const [, tu] = tribute ? hinterWorldToLocal(world, tribute.x, tribute.y) : [0, 0];
  // From a dark gap at the jungle's edge (the nearest to the tribute, if they're going to it).
  const gaps = H.gaps.map((g) => hinterToLocal(H.geo.s, g[0], g[1])).filter(([dd]) => dd < HZ_SCRUB + 60 && dd < H.shown - 4);
  if (!gaps.length) return;
  const [gdd, gu] = visit ? gaps.reduce((a, b) => (Math.abs(b[1] - tu) < Math.abs(a[1] - tu) ? b : a)) : pick(gaps);
  const n = clamp(1 + Math.floor(Math.random() * (1 + cur * 2 + S.seen * 0.1)), 1, visit ? 4 : 3);
  const stop = visit ? 0.5 : Math.max(HZ_DUNE, gdd - rand(20, 70));
  IMPS.out = {
    t: 0, phase: 'down', visit, tribute, shy: false,
    imps: Array.from({ length: n }, (_, k) => {
      const u0 = clamp(gu + rand(-3, 3), 2, along - 3);
      return { dd0: gdd, u0, dd: gdd, u: u0, tdd: stop + rand(-2, 4) * (visit ? 0 : 1), tu: visit ? tu + (k - (n - 1) / 2) * 3 : u0 + rand(-10, 10), spd: rand(4, 6.5), ph: rand(0, TAU), step: 0, walk: true };
    }),
  };
}
function endOuting(world, S, O) {
  IMPS.out = null;
  S.seen++; S.last = world.days;
  if (S.seen === 1) logEvent(world, 'For a moment something small and red stood at the edge of the jungle, looking down at the pond. Then it went back in', null, { cat: 'story', pri: 1 });
  else if (S.seen % 5 === 0 && !O.visit) logEvent(world, pick(['Something came out of the jungle again last night, and stood a while in the scrub, watching', 'Small tracks in the sand at the top of the beach, going up into the jungle',
    `They come out oftener now: ${S.seen} times, by the tracks`, 'Something small was out in the scrub, and went back in when it was looked at']) + (world.game.tributeFound || S.seen < 10 ? '' : '. As if they were waiting for something'), null, { cat: 'story', pri: 1 });
}

// ---- down to the tribute ---------------------------------------------------------------------------------------------
function enterPond(world, O) {
  O.phase = 'pond';
  const s = O.tribute && (world.structures.includes(O.tribute) ? O.tribute : world.structures.find((q) => q.seed === O.tribute.seed));
  if (!s || !world.structures.includes(s)) { O.phase = 'up'; return; }
  O.imps.forEach((m, k) => {
    const [x, y] = coastXY(world, 1, clamp(m.u, 1, (world.shoreSide < 2 ? world.H : world.W) - 2));
    const c = new Imp(world, x, y, s, k, O.imps.length);
    world.creatures.push(c);
    m.gone = true; // (in the pond for now)
  });
}
class Imp extends Creature {
  constructor(world, x, y, tribute, k, n) {
    super(world, x, y);
    this.species = 'imp'; this.ambient = true; this.noGrab = true;
    this.tribute = tribute; this.k = k; this.n = n; this.door = [x, y];
    this.body = new Chain(this.x, this.y, 0, [0.4], [1.2, 1.2], PI);
    this.id = newId(outlineOf(IMP_M.skin));
    this.eyeId = newId(hexToInt('#200402')); EMISSIVE[this.eyeId] = 2;
    this.act = 'come'; this.t = 0; this.z = 0.6; this.face = 0; this.hop = 0; this.gait = 0;
  }
  hit(px, py) { return Math.hypot(px - this.x, py - this.y) < 3; }
  update(dt, world) {
    this.t += dt;
    if (!world.structures.includes(this.tribute)) this.tribute = world.structures.find((q) => q.seed === this.tribute.seed) || this.tribute; // (a new depth rebuilds the pond)
    const s = this.tribute, p = world.pointer;
    if (!world.structures.includes(s) && this.act !== 'leave') this.act = 'leave';
    if (this.act !== 'leave' && p && p.inside && (p.x - this.x) ** 2 + (p.y - this.y) ** 2 < 500) { this.act = 'leave'; this.fled = true; } // (they shy from the pointer)
    let gx, gy, spd = 7;
    if (this.act === 'come' || this.act === 'dance') {
      const a = (this.act === 'dance' ? this.t * 0.9 : 0) + this.k / this.n * TAU, R = 7.5;
      gx = s.x + Math.cos(a) * R; gy = s.y + Math.sin(a) * R;
      if (this.act === 'come' && Math.hypot(gx - this.x, gy - this.y) < 1) { this.act = 'dance'; this.t = 0; }
      if (this.act === 'dance') { spd = 5; this.hop = Math.max(0, Math.sin(this.t * 7 + this.k * 2)) * 1.6; if (this.t > 14) { this.act = 'leave'; if (this.k === 0) impGift(world, s); } }
    } else { [gx, gy] = this.door; spd = this.fled ? 14 : 7; this.hop = 0; if (Math.hypot(gx - this.x, gy - this.y) < 1) { this.gone = true; return; } }
    const dx = gx - this.x, dy = gy - this.y, d = Math.hypot(dx, dy);
    if (d > 0.3) { const k = Math.min(1, spd * dt / d); this.x += dx * k; this.y += dy * k; this.face = Math.atan2(dy, dx); this.gait += dt * 10; }
    else if (this.act === 'dance') this.face = Math.atan2(s.y - this.y, s.x - this.x);
    this.heading = this.face;
    this.body.resolve(this.x, this.y, this.face);
  }
  draw(r) {
    const { x, y, id, face: f } = this, z = 0.6 + this.hop, st = Math.sin(this.gait) * 0.5;
    for (const sd of [-1, 1]) { const a = f + sd * PI / 2; r.tube(x + Math.cos(a) * 0.5, y + Math.sin(a) * 0.5, 0.35, z + 0.6, x + Math.cos(a) * 0.5 + Math.cos(f) * st * sd, y + Math.sin(a) * 0.5 + Math.sin(f) * st * sd, 0.3, z - 0.6, 1, IMP_M.skin, id); }
    r.ellipsoid(x, y, 0.9, 0.8, f, z + 0.4, 1.4, IMP_M.skin, id);
    r.tube(x - Math.cos(f) * 0.8, y - Math.sin(f) * 0.8, 0.25, z + 0.8, x - Math.cos(f) * 2.2, y - Math.sin(f) * 2.2, 0.15, z + 1.6 + st * 0.3, 1, IMP_M.skin, id); // the tail
    const hx = x + Math.cos(f) * 0.3, hy = y + Math.sin(f) * 0.3;
    r.ellipsoid(hx, hy, 0.8, 0.8, f, z + 1.8, 1, IMP_M.skin, id);
    for (const sd of [-1, 1]) { const a = f + sd * 0.9; r.tube(hx + Math.cos(a) * 0.5, hy + Math.sin(a) * 0.5, 0.2, z + 2.6, hx + Math.cos(a) * 0.9, hy + Math.sin(a) * 0.9, 0.1, z + 3.4, 1, IMP_M.horn, id); }
    for (const sd of [-1, 1]) r.dot(hx + Math.cos(f + sd * 0.5) * 0.7, hy + Math.sin(f + sd * 0.5) * 0.7, z + 2, IMP_M.eye, this.eyeId);
  }
  doing() { return this.act === 'dance' ? 'dancing round the tribute' : this.act === 'come' ? 'coming down the beach to the tribute' : 'going back up into the jungle'; }
  note() { return 'Something small and red, with horns, from the jungle up the beach. It came down for the tribute.'; }
}
// What they leave at its feet.
function impGift(world, s) {
  const S = impState(world);
  S.visits++;
  const cor = typeof gainCorruption === 'function' ? gainCorruption(world, 6 + 3 * Math.min(8, S.visits), 'the tribute', { quiet: true }) : 0;
  const k = pick(['essence', 'pearls', 'pearls', 'essence', 'fossil']);
  let what = '';
  if (k === 'essence') what = `+${gainEssence(world, 15 + 5 * Math.min(10, S.visits), 'the tribute')} essence`;
  else if (k === 'pearls') what = `+${award(world, 40 + 12 * Math.min(10, S.visits), 'the tribute', null, { flat: true })} pearls`;
  else if (typeof world.fossils !== 'undefined' && typeof Fossil === 'function' && typeof pickFossil === 'function') {
    const f = new Fossil(s.x + rand(-4, 4), s.y + rand(-4, 4), pickFossil(world)); f.born = world.days; world.fossils.push(f); what = 'an old bone, dug up from somewhere';
  }
  logEvent(world, S.visits === 1 ? `✦ They came down out of the jungle to the tribute: ${plural('small red thing', 2)} with horns, round it in a ring, hopping. When they had gone back up, something lay at its feet (${what}${cor ? `, +${cor} corruption` : ''})`
    : `They came down to the tribute again and danced round it, and left something at its feet (${what}${cor ? `, +${cor} corruption` : ''})`, s, { cat: 'story', pri: S.visits === 1 ? 3 : 2 });
}

// ---- drawn on the land up the beach (hinterland.js, a few frames a second) -----------------------------------------------
function impSprites(world, dot, css) {
  const O = IMPS.out;
  if (!O) return;
  const s = HINTER.geo.s, dark = world.darkness || 0;
  for (const m of O.imps) {
    if (m.gone) continue;
    const [px, py] = hinterToPx(s, Math.round(m.dd), Math.round(m.u)), bob = m.walk && Math.sin(m.step) > 0 ? 1 : 0;
    // Two pixels of red for a body, a darker one for its head, horns, and at night its eyes.
    const [vx, vy] = hinterVec(s, -1, 0), [ax, ay] = hinterVec(s, 0, 1);
    dot(px, py, css(IMP_COL.skin)); dot(px + vx, py + vy, css(IMP_COL.dark));
    dot(px + vx * 2 + ax * 0, py + vy * 2 + ay * 0 - bob * 0, css(IMP_COL.dark));
    if (bob) dot(px - vx, py - vy, css(IMP_COL.skin));
    dot(px + vx * 2 - ax, py + vy * 2 - ay, css(IMP_COL.horn)); dot(px + vx * 2 + ax, py + vy * 2 + ay, css(IMP_COL.horn));
    if (dark > 0.35) { const e = css(Math.sin(O.t * 2 + m.ph) > -0.7 ? IMP_COL.eye : IMP_COL.eyeDim, true); dot(px + vx - ax * 0.5, py + vy - ay * 0.5, e); }
  }
}
