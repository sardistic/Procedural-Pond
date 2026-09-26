'use strict';
// The eldritch: a rare branch of evolution. An animal carrying the mark
// ('touched', genome.eld) changes over its life, faster at night, in deep water,
// near the drowned idol or the whale fall, and in the presence of the mythic:
//  - Touched (corruption under 1/3): its eyes stop reflecting the light, and
//    fine veins of void open in its skin (windows onto a starry dark).
//  - Changed (to 2/3): new eyes along its flanks, feelers, wider veins, and the
//    water around it feels wrong (others near it are uneasy).
//  - Transcendent ('eldritch', past 2/3): a crown of tentacles and a sigil that
//    glows at night. Small animals nearby circle it as if listening, those
//    closest move as if something is wrong with them, and at night it dreams:
//    the mark can pass to a neighbour.
// Every other animal keeps a little distance from the marked, and each time one
// of them changes, the whole pond scatters from it for a moment. The changed and
// the transcendent take in lesser animals of their own kind (more when their kind
// is crowded): they grow, deform, and keep the numbers down.
//
// Corruption (◈) is a resource of its own: the marked yield it as they live and
// change, and it buys the eldritch paths (below), the dark island, corrupted
// plants and the eldritch traits on an animal's card.
// The mark passes to young (15% from one marked parent, 35% from two) and comes
// from fossils. Out of the deep, most marked animals die before they transcend.
// The pond resists it: once about one animal in twelve is marked, the dreams stop
// spreading it, and corruption comes more slowly the more of the pond is marked.
// The first of each species to transcend deepens the pond. From the creature card
// you can feed the dream (spend essence to push it on) or bind it (spend essence
// to set it back and stop it growing).

const ELD_STAGES = ['Touched', 'Changed', 'Transcendent'];
const ELD_EYE = mat('#6a2aa0', '#9a4ae0', '#d08aff', '#f4e0ff'), ELD_TENDRIL = mat('#140a1e', '#261432', '#3a1e4a', '#523066');
const ELD_SIGIL = mat('#0a6a3a', '#1aa85a', '#4af08a', '#c0ffd8'), ELD_FLESH = mat('#1a0e22', '#2e1a3a', '#46284e', '#62386a');
const ELD_WHISPERS = [
  'Something in the water is dreaming of {n}', '{n} has been very still, facing the deep', 'The water near {n} tastes of iron and old salt',
  'Nothing will swim between {n} and the drop-off', '{n} is listening to something below', 'For a moment every fish in the pond turned toward {n}',
];
const ELD_STAGE_LINES = [
  '{n} the {l} has been touched by something below: its eyes no longer reflect the light',
  '{n} the {l} has Changed: new eyes have opened along its flanks, and the pond scattered from it',
  '✦ {n} the {l} has Transcended. The water around it hums with a thought that is not its own, and every animal fled',
];
const eldStage = (L) => (!L || !L.genome.eld ? -1 : L.corruption >= 2 / 3 ? 2 : L.corruption >= 1 / 3 ? 1 : 0);
const fill = (s, c) => s.replace('{n}', c.life.name).replace('{l}', describe(c).label);
const eldPath = (world, k) => !!(world.game && world.game.eldPaths && world.game.eldPaths[k]);

// Visible traits with the mark's stage: 'touched' becomes 'changed', then 'eldritch' (and 'ascended').
// (Also everything an animal picks up in life: madness quirks, infections, the hunt.)
function eldTraits(L) {
  const t = traitsOf(L.genome), st = eldStage(L);
  if (st > 0) t[t.indexOf('touched')] = st === 2 ? 'eldritch' : 'changed';
  if (L.ascended && !t.includes('ascended')) t.unshift('ascended');
  for (const q of L.quirks || []) t.push(q);
  for (const i of L.ill || []) t.push(i);
  if (L.hunter) t.push('awakened');
  if (L.paragon) t.push('paragon');
  return t;
}

// How wide the veins of void run (the compose step draws them): by stage, by
// what it has absorbed, wider with the Veil of Stars.
function eldLook(world, L) {
  const st = eldStage(L);
  if (st < 0) return 0;
  return clamp(1 + st * 2 + Math.min(2, L.absorbed || 0) + (eldPath(world, 'veil') ? 1 : 0) + (L.ascended ? 2 : 0) - (L.bound ? 2 : 0), 1, 7);
}

// ---- corruption, the resource -------------------------------------------------------------------------
function gainCorruption(world, n, src, { quiet = false } = {}) {
  const G = world.game;
  if (!G || !(n > 0)) return 0;
  G.corruption = (G.corruption || 0) + n * (eldPath(world, 'eyes') ? 1.25 : 1);
  G.corruptionEarned = (G.corruptionEarned || 0) + n;
  if (!quiet && src && typeof floatAward === 'function') floatAward(src.x, src.y - 4, `+${Math.round(n)}◈`, 'corruption');
  return n;
}
function spendCorruption(world, n) {
  const G = world.game;
  if (!G || (G.corruption || 0) < n) return false;
  G.corruption -= n;
  return true;
}

// ---- the eldritch paths: what corruption buys for the whole pond --------------------------------------
const ELD_PATHS = {
  veil: { label: 'The Veil of Stars', cost: 15, needs: [], note: 'the void runs wider in the marked, and hunters look straight through them' },
  eyes: { label: 'The Many Eyes', cost: 30, needs: ['veil'], note: 'the marked see further, and yield a quarter more corruption' },
  hunger: { label: 'The Hunger', cost: 40, needs: ['veil'], note: 'the marked take in their own kind twice as often, and grow more by it' },
  dream: { label: 'The Deep Dream', cost: 50, needs: ['eyes'], note: 'the mark passes more readily, in dreams and to young; any animal can be offered to it' },
  chorus: { label: 'The Madness Chorus', cost: 70, needs: ['hunger'], note: 'the transcendent draw more to circle them, and drive more mad, from further off' },
  tide: { label: 'The Black Tide', cost: 110, needs: ['dream', 'chorus'], note: 'each transcendent wears the pond deeper, and the mythic rise twice as often' },
  crown: { label: 'The Drowned Crown', cost: 200, needs: ['tide'], note: 'a transcendent can Ascend: vast, long-lived, and a lure for everything below' },
};
const ELD_PATH_CODES = ['veil', 'eyes', 'hunger', 'dream', 'chorus', 'tide', 'crown']; // bits in links (append-only)
const pathOpen = (world, k) => ELD_PATHS[k].needs.every((n) => eldPath(world, n));
function buyPath(world, k) {
  if (eldPath(world, k) || !pathOpen(world, k) || !spendCorruption(world, ELD_PATHS[k].cost)) return false;
  world.game.eldPaths = { ...(world.game.eldPaths || {}), [k]: true };
  logEvent(world, `✦ ${ELD_PATHS[k].label} opens: ${ELD_PATHS[k].note}`, null, { cat: 'rare', pri: 3 });
  if (typeof Sound !== 'undefined') Sound.omen(world.W / 2, world.H / 2);
  return true;
}

// How fast the change comes on here and now (corruption per second).
function eldRate(world, c) {
  const L = c.life;
  let k = 1 / (L.lifespan * 2);
  k *= 1.3 * (typeof lightMadness === 'function' ? lightMadness(world) : 1 + 0.9 * (world.darkness || 0)); // the dark feeds it; daylight holds it back
  k *= 1 + 2 * depthAt(world, c.x, c.y);
  for (const s of world.structures || []) {
    if ((s.kind === 'idol' || s.kind === 'whalefall') && Math.hypot(s.x - c.x, s.y - c.y) < STRUCTURES[s.kind].r) k *= s.kind === 'idol' ? 3 : 1.6;
    if (s.kind === 'island' && s.branch === 'dark' && Math.hypot(s.x - c.x, s.y - c.y) < islandRadius(world, s) * 2) k *= 1 + 0.5 * (s.blv || 1);
  }
  for (const m of world.creatures) {
    if (DEEP[m.species] && DEEP[m.species].mythic && Math.hypot(m.x - c.x, m.y - c.y) < 160) { k *= 2; break; }
  }
  if (typeof eldStructRate === 'function') k *= eldStructRate(world, c); // the gate, the cradle
  return L.bound ? 0 : k;
}

// ---- keeping away, and scattering --------------------------------------------------------------------
// Every frame: where the marked are, and how far their unease reaches.
function eldMarksNow(world) {
  const M = world.eldMarks || (world.eldMarks = []);
  M.length = 0;
  for (const c of world.creatures) {
    const L = c.life;
    if (!L || !L.genome.eld || c.dying || c.absorbing) continue;
    const st = eldStage(L);
    M.push({ x: c.x, y: c.y, R: (16 + st * 12 + Math.min(4, L.absorbed || 0) * 4) * (L.ascended ? 1.8 : 1) * (L.bound ? 0.6 : 1), c });
    if (c.id) VOID_SKIN[c.id] = eldLook(world, L);
  }
  return M;
}

// A push away from any marked animal close by (the fish steering uses it).
const NO_PUSH = [0, 0];
function eldPush(world, c) {
  const M = world.eldMarks;
  if (!M || !M.length || (c.life && c.life.genome.eld)) return NO_PUSH;
  let fx = 0, fy = 0;
  for (const m of M) {
    const dx = c.x - m.x, dy = c.y - m.y, d2 = dx * dx + dy * dy;
    if (d2 > m.R * m.R || d2 < 0.01) continue;
    const d = Math.sqrt(d2), k = (m.R - d) / m.R * 1.4;
    fx += dx / d * k; fy += dy / d * k;
  }
  return fx || fy ? [fx, fy] : NO_PUSH;
}

// The whole pond flees from something for a moment.
function scatterFrom(world, src, secs = 2.5) {
  for (const o of world.creatures) {
    if (o === src || o.dying || o.absorbing || o.grabbed || (o.life && o.life.genome.eld)) continue;
    startle(world, o, src.x, src.y, secs * rand(0.7, 1.2));
  }
  addRipple(world, src.x, src.y, 2.5, true);
  if (typeof Sound !== 'undefined') Sound.omen(src.x, src.y);
}

// ---- taking in their own ---------------------------------------------------------------------------
// The changed and the transcendent take in lesser animals of their own kind:
// often when their kind is crowded, rarely otherwise.
function tryAbsorb(world, c, st) {
  const key = breedKey(c), worth = recycleValue(c);
  if ((c.life.absorbed || 0) >= 6) return; // it can hold no more
  const kin = world.creatures.filter((o) => o !== c && o.life && breedKey(o) === key && !o.dying && !o.absorbing && !o.leaving && !o.grabbed &&
    !o.life.genome.eld && recycleValue(o) <= worth);
  if (!kin.length) return;
  const target = world.targets[c.species] || kin.length;
  const over = kin.length + 1 > target * 1.15 || world.creatures.length > (world.maxPop || 130) * 0.85;
  if (Math.random() > (over ? 0.03 : 0.002) * st * (eldPath(world, 'hunger') ? 2 : 1) * (c.life.quirks && c.life.quirks.includes('many-mouthed') ? 2 : 1)) return;
  let best = null, bd = 70 * 70;
  for (const o of kin) { const d = (o.x - c.x) ** 2 + (o.y - c.y) ** 2; if (d < bd) { bd = d; best = o; } }
  if (!best) return;
  best.absorbing = { by: c, t: 0 };
  c.feeding = best;
  c.absorbCd = rand(40, 90);
  if (typeof Sound !== 'undefined') Sound.absorb(best.x, best.y);
}

// One being taken in: it stops, and fades into the one that took it.
function absorbStep(world, v, dt) {
  const A = v.absorbing, by = A.by;
  A.t += dt;
  v.speed = 0;
  v.prey = null;
  if (by.gone || by.caught || by.dying || !world.creatures.includes(by)) { v.absorbing = null; v.alpha = 1; return; } // let go
  v.alpha = Math.max(0.05, 1 - A.t / 2);
  if (A.t < 2) return;
  v.gone = true;
  ECO.absorbed = (ECO.absorbed || 0) + 1;
  noteGone(world, v, 'absorbed');
  const name = v.life.name;
  absorbInto(world, by);
  logEvent(world, `${by.life.name} took ${name} into itself: it is larger now, and less what it was`, by, {
    cat: 'rare', pri: 1, key: `absorb:${by.id}`, data: name, merge: (e) => `${by.life.name} has taken ${e.n} of its own kind into itself`,
  });
}

// What taking one in (or swelling in the void, from its card) does: bigger, hardier, stranger.
function absorbInto(world, c) {
  const L = c.life, g = L.genome, more = eldPath(world, 'hunger') ? 1.5 : 1;
  L.absorbed = (L.absorbed || 0) + 1;
  L.corruption = Math.min(1, (L.corruption || 0) + 0.08);
  L.energy = Math.min(1, L.energy + 0.4);
  g.size = Math.min(1.7, (g.size || 1) * (1 + 0.05 * more));
  g.vit = Math.min(1, (g.vit ?? 0.5) + 0.04 * more);
  g.lon = Math.min(1, (g.lon ?? 0.5) + 0.04 * more);
  L.lifespan *= 1 + 0.06 * more;
  if (SCALABLE.has(c.species) && c.base) applyScale(c, L.scale * g.size);
  L.traits = eldTraits(L);
  refreshBuffs(c);
  c.feeding = null;
  gainCorruption(world, 1 + eldStage(L), c);
}

// ---- the tick --------------------------------------------------------------------------------------
let eldTick = 0;
function updateEldritch(world, dt) {
  eldMarksNow(world);
  eldTick -= dt;
  if (eldTick > 0) return;
  const step = 1 - eldTick;
  eldTick = 1;
  const marked = world.creatures.filter((c) => c.life && c.life.genome.eld && !c.dying && !c.leaving && !c.absorbing);
  const chorus = eldPath(world, 'chorus') ? 1.5 : 1;
  // How much of the pond is marked: the more, the less the dreams spread it and the thinner the corruption.
  const share = marked.length / Math.max(1, world.creatures.filter((c) => c.life).length), thin = 1 / (1 + marked.length / 12);
  let transcendent = 0;
  for (const c of marked) {
    const L = c.life, before = eldStage(L);
    L.corruption = Math.min(1, (L.corruption || 0) + eldRate(world, c) * step);
    const now = eldStage(L);
    // Corruption, the resource: the marked yield it as they live, more as they change.
    gainCorruption(world, 0.003 * (1 + now * 2) * (L.ascended ? 3 : 1) * (L.quirks && L.quirks.includes('dreaming') ? 2 : 1) * thin * step * (0.7 + 0.3 * lightMadness(world)), null, { quiet: true });
    if (now !== before) {
      L.traits = eldTraits(L);
      const rare = L.traits.find((t) => RARE_OUTLINE[t]);
      if (rare && c.id) { OUTLINE[c.id] = RARE_OUTLINE[rare]; THICK[c.id] = 1; }
      logEvent(world, fill(ELD_STAGE_LINES[now], c), c, { cat: 'rare', pri: now === 2 ? 3 : 2 });
      scatterFrom(world, c, now === 2 ? 3.5 : 2.5);
      if (typeof maybeQuirk === 'function') maybeQuirk(world, c); // sometimes something stays with it
      if (typeof narrate === 'function') narrate(world, 'mark', { name: L.name, subject: c });
      gainCorruption(world, now === 2 ? 15 : 5, c);
      if (now === 2) {
        const G = world.game, key = `eld:${c.species === 'wild' ? c.sp.id : c.species}`, first = !G.seen.includes(key);
        if (first) G.seen.push(key);
        deepenBy(world, first ? 0.3 : 0.02);
        award(world, first ? 60 : 10, 'transcendence', c);
      }
    }
    if (now === 2) transcendent++;
    // Taking in their own.
    if (now >= 1) {
      c.absorbCd = (c.absorbCd ?? rand(10, 30)) - step;
      if (c.absorbCd <= 0 && !c.feeding) tryAbsorb(world, c, now);
    }
    // Psychic effects.
    if (now >= 1) {
      const R = (now === 2 ? 70 : 42) * (now === 2 ? chorus : 1) * (L.ascended ? 1.6 : 1);
      let drawn = 0, mad = 0; // a few at a time are drawn in, and fewer lose their minds
      for (const o of world.creatures) {
        if (o === c || !o.life || o.life.genome.eld) continue;
        const d2 = (o.x - c.x) ** 2 + (o.y - c.y) ** 2;
        if (d2 > R * R) continue;
        o.life.comfort = Math.max(0, o.life.comfort - (now === 2 ? 0.06 : 0.03)); // dread
        if (now === 2 && drawn < 4 * chorus && isPrey(o) && Math.random() < 0.25) { drawn++; o.tx = c.x + rand(-14, 14); o.ty = c.y + rand(-14, 14); o.timer = 2; } // enthralled: circling it
        if (now === 2 && mad < 3 * chorus && d2 < 900 * chorus && Math.random() < 0.5) { mad++; o.maddened = 2; } // too close: something is wrong with it
      }
      if (now === 2) addHeat(world, c.x, c.y, 0.04);
    }
    // At night the transcendent dream, and the mark can pass to a neighbour.
    if (now === 2 && world.darkness > 0.5 && Math.random() < 0.004 * lightMadness(world) * (eldPath(world, 'dream') ? 2.5 : 1) * Math.max(0, 1 - share / 0.08)) {
      const near = world.creatures.filter((o) => o !== c && o.life && !o.life.genome.eld && (o.x - c.x) ** 2 + (o.y - c.y) ** 2 < 3600);
      if (near.length) {
        const o = pick(near);
        o.life.genome.eld = true;
        o.life.corruption = 0;
        o.life.traits = eldTraits(o.life);
        logEvent(world, `${c.life.name} dreamed, and ${o.life.name} the ${describe(o).label} woke touched`, o, { cat: 'rare', pri: 2 });
      }
    }
    if (now >= 0 && Math.random() < 0.004) logEvent(world, fill(pick(ELD_WHISPERS), c), c, { cat: 'rare', pri: 1, key: 'whisper' });
  }
  // The Black Tide: the transcendent wear the pond deeper as they live.
  if (transcendent && eldPath(world, 'tide')) deepenBy(world, 0.0008 * transcendent * step);
  // Everyone else keeps their distance (the fish steer away every frame; the rest pick somewhere else to be).
  for (const m of world.eldMarks) {
    for (const o of world.creatures) {
      if (o === m.c || o instanceof Fish || !o.life || o.life.genome.eld || o.grabbed) continue;
      const dx = o.x - m.x, dy = o.y - m.y, d = Math.hypot(dx, dy);
      if (d > m.R || d < 0.1) continue;
      o.tx = clamp(o.x + dx / d * m.R, 8, world.W - 8); o.ty = clamp(o.y + dy / d * m.R, 8, world.H - 8); o.timer = Math.max(o.timer || 0, 2);
    }
  }
  const clear = 1.6 - 0.6 * lightMadness(world); // fits pass off faster in the light
  for (const o of world.creatures) if (o.maddened) o.maddened = Math.max(0, o.maddened - step * clear);
}

// ---- how they're drawn --------------------------------------------------------------------------------
// Over a marked animal: glowing eyes, then eyes along its body and feelers, then
// a crown of tentacles and a sigil beneath it that glows at night. What it has
// taken in shows as lumps along its sides and more of everything; while it takes
// one in, a tendril reaches out to it.
function drawEldritch(r, c, t, world) {
  const L = c.life, st = eldStage(L), b = c.body;
  if (st < 0 || !b) return;
  if (c.eldId == null) { c.eldId = newId(hexToInt('#12061e')); EMISSIVE[c.eldId] = 2; }
  const z = (c.zBody ?? c.z ?? 1) + 1.2, id = c.eldId, n = b.n, extra = Math.min(6, L.absorbed || 0) + (L.ascended ? 3 : 0);
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + c.phase);
  for (const s of [-1, 1]) r.dot(b.px(0, s * 0.9, -0.4), b.py(0, s * 0.9, -0.4), z + b.w[0] * 0.6, ELD_EYE, id);
  // Lumps where the others went in.
  for (let k = 0; k < extra && n > 2; k++) {
    const j = 1 + ((k * 2 + 1) % Math.max(1, n - 2)), s = k % 2 ? 1 : -1, w = b.w[j] * (0.5 + 0.12 * (k % 3));
    r.ellipsoid(b.px(j, s * PI / 2.3, -w * 0.3), b.py(j, s * PI / 2.3, -w * 0.3), w, w * 0.8, b.a[j], z - 1.5, w * 0.9, ELD_FLESH, c.id);
  }
  if (st >= 1) {
    const k = Math.round(2 + L.corruption * 6) + extra;
    for (let i = 0; i < k; i++) {
      const j = Math.min(n - 1, 1 + Math.floor((i + 1) * (n - 2) / (k + 1))), s = i % 2 ? 1 : -1;
      if (Math.sin(t * 1.7 + i * 2.1 + c.phase) > -0.5) r.dot(b.px(j, s * PI / 2.2, 0), b.py(j, s * PI / 2.2, 0), z + b.w[j] * 0.7, ELD_EYE, id);
    }
    const tentacles = (st === 2 ? 6 : 2) + Math.floor(extra / 2), h = b.a[0];
    for (let i = 0; i < tentacles; i++) {
      const a = h + PI + (i - (tentacles - 1) / 2) * 0.5 + Math.sin(t * 2 + i) * 0.35, L1 = (st === 2 ? 7 : 3.5) * (0.8 + 0.2 * pulse) * (1 + extra * 0.08);
      const x0 = b.x[0], y0 = b.y[0], x1 = x0 + Math.cos(a) * L1 * 0.55, y1 = y0 + Math.sin(a) * L1 * 0.55;
      r.tube(x0, y0, 0.55, z, x1, y1, 0.45, z - 0.5, 0.8, ELD_TENDRIL, c.id);
      r.tube(x1, y1, 0.45, z - 0.5, x1 + Math.cos(a + 0.4) * L1 * 0.45, y1 + Math.sin(a + 0.4) * L1 * 0.45, 0.35, z - 1, 0.8, ELD_TENDRIL, c.id);
    }
  }
  // Reaching for one of its own.
  const v = c.feeding;
  if (v && v.absorbing && v.absorbing.by === c) {
    const segs = 6, hx = b.x[0], hy = b.y[0];
    for (let i = 0; i < segs; i++) {
      const u0 = i / segs, u1 = (i + 1) / segs, wob = (u) => Math.sin(u * 9 + t * 8) * 1.5 * (1 - u);
      r.tube(lerp(hx, v.x, u0) + wob(u0), lerp(hy, v.y, u0) - wob(u0), 0.7 - u0 * 0.3, z, lerp(hx, v.x, u1) + wob(u1), lerp(hy, v.y, u1) - wob(u1), 0.7 - u1 * 0.3, z, 0.8, ELD_TENDRIL, c.id);
    }
  }
  if (st === 2 && world.darkness > 0.35) {
    const R = b.w[1] * 2 + 5 + extra;
    for (let k = 0; k < 12; k++) {
      if ((k + Math.floor(t * 3)) % 4 === 0) continue;
      const a = k / 12 * TAU + t * 0.3;
      r.dot(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R, 0.8, ELD_SIGIL, id);
    }
  }
}

// Young born near the drowned idol, a dark island, a corrupted plant, or in the abyss, sometimes come out marked.
function eldBirthChance(world, x, y) {
  let p = depthAt(world, x, y) > 0.8 ? 0.03 : 0;
  for (const s of world.structures || []) {
    if (s.kind === 'idol' && Math.hypot(s.x - x, s.y - y) < STRUCTURES.idol.r) p += 0.08;
    if (s.kind === 'island' && s.branch === 'dark' && Math.hypot(s.x - x, s.y - y) < islandRadius(world, s) * 2) p += 0.04 * (s.blv || 1);
  }
  for (const pl of world.plants) if (pl.tr && pl.tr.eld && (pl.x - x) ** 2 + (pl.y - y) ** 2 < 900) p += 0.02;
  return p;
}

// ---- player options, from the creature card ---------------------------------------------------------
const feedDreamCost = (c) => 10 + Math.round(20 * (c.life.corruption || 0));
const bindCost = (c) => 15 + Math.round(30 * (c.life.corruption || 0));
function feedDream(world, c) {
  if (!spendEssence(world, feedDreamCost(c))) return false;
  c.life.bound = false;
  c.life.corruption = Math.min(1, (c.life.corruption || 0) + 0.2);
  eldTick = 0;
  return true;
}
function bindMark(world, c) {
  if (!spendEssence(world, bindCost(c))) return false;
  c.life.bound = true;
  c.life.corruption = Math.max(0, (c.life.corruption || 0) - 0.3);
  c.life.traits = eldTraits(c.life);
  logEvent(world, `${c.life.name} has been bound: the change in it is quiet, for now`, c, { cat: 'pond', pri: 1 });
  return true;
}

// Eldritch traits bought with corruption on an animal's card.
const ELD_TRAITS = {
  offer: { label: 'Offer it to the dream', cost: () => 15, path: 'dream', ok: (c) => !c.life.genome.eld, note: 'it wakes touched' },
  swell: { label: 'Swell in the void', cost: (c) => 8 * ((c.life.absorbed || 0) + 1), ok: (c) => eldStage(c.life) >= 1, note: 'as if it had taken in one of its own: bigger, hardier, stranger' },
  ascend: { label: 'Ascend', cost: () => 60, path: 'crown', ok: (c) => eldStage(c.life) === 2 && !c.life.ascended, note: 'vast and long-lived; the deep answers it' },
};
function buyEldTrait(world, c, key) {
  const T = ELD_TRAITS[key];
  if ((T.path && !eldPath(world, T.path)) || !T.ok(c) || !spendCorruption(world, T.cost(c))) return false;
  const L = c.life;
  if (key === 'offer') {
    L.genome.eld = true; L.corruption = 0; L.bound = false;
    logEvent(world, `You offered ${L.name} to the dream: it woke touched`, c, { cat: 'rare', pri: 2 });
  } else if (key === 'swell') {
    absorbInto(world, c);
    scatterFrom(world, c, 1.5);
  } else if (key === 'ascend') {
    L.ascended = true;
    L.lifespan *= 2;
    L.genome.size = Math.min(2, (L.genome.size || 1) * 1.3);
    if (SCALABLE.has(c.species) && c.base) applyScale(c, L.scale * L.genome.size);
    deepenBy(world, 0.5);
    scatterFrom(world, c, 5);
    logEvent(world, `✦ ${L.name} has Ascended. It is vast now, and something far below has turned to look`, c, { cat: 'rare', pri: 3 });
  }
  L.traits = eldTraits(L);
  const rare = L.traits.find((t) => RARE_OUTLINE[t]);
  if (rare && c.id) { OUTLINE[c.id] = RARE_OUTLINE[rare]; THICK[c.id] = 1; }
  refreshBuffs(c);
  return true;
}
