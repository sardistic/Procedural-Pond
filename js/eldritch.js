'use strict';
// The eldritch: a rare branch of evolution. An animal carrying the mark
// ('touched', genome.eld) changes over its life, faster at night, in deep water,
// near the drowned idol or the whale fall, and in the presence of the mythic:
//  - Touched (corruption under 1/3): its eyes stop reflecting the light.
//  - Changed (to 2/3): new eyes open along its flanks, feelers sprout from its
//    head, and the water around it feels wrong (others near it are uneasy).
//  - Transcendent ('eldritch', past 2/3): a crown of tentacles and a sigil that
//    glows at night. Small animals nearby circle it as if listening, those
//    closest move as if something is wrong with them, and at night it dreams:
//    the mark can pass to a neighbour.
// The mark passes to young (20% from one marked parent, 45% from two) and comes
// from fossils. Out of the deep, most marked animals die before they transcend.
// The first of each species to transcend wears the pond deeper. From the creature card
// you can feed the dream (spend essence to push it on) or bind it (spend essence
// to set it back and stop it growing).

const ELD_STAGES = ['Touched', 'Changed', 'Transcendent'];
const ELD_EYE = mat('#6a2aa0', '#9a4ae0', '#d08aff', '#f4e0ff'), ELD_TENDRIL = mat('#140a1e', '#261432', '#3a1e4a', '#523066');
const ELD_SIGIL = mat('#0a6a3a', '#1aa85a', '#4af08a', '#c0ffd8');
const ELD_WHISPERS = [
  'Something in the water is dreaming of {n}', '{n} has been very still, facing the deep', 'The water near {n} tastes of iron and old salt',
  'Nothing will swim between {n} and the drop-off', '{n} is listening to something below', 'For a moment every fish in the pond turned toward {n}',
];
const ELD_STAGE_LINES = [
  '{n} the {l} has been touched by something below: its eyes no longer reflect the light',
  '{n} the {l} has Changed: new eyes have opened along its flanks',
  '✦ {n} the {l} has Transcended. The water around it hums with a thought that is not its own',
];
const eldStage = (L) => (!L || !L.genome.eld ? -1 : L.corruption >= 2 / 3 ? 2 : L.corruption >= 1 / 3 ? 1 : 0);
const fill = (s, c) => s.replace('{n}', c.life.name).replace('{l}', describe(c).label);

// Visible traits with the mark's stage: 'touched' becomes 'changed', then 'eldritch'.
function eldTraits(L) {
  const t = traitsOf(L.genome), st = eldStage(L);
  if (st > 0) t[t.indexOf('touched')] = st === 2 ? 'eldritch' : 'changed';
  return t;
}

// How fast the change comes on here and now (corruption per second).
function eldRate(world, c) {
  const L = c.life;
  let k = 1 / (L.lifespan * 1.6);
  k *= 1 + 1.2 * (world.darkness || 0);
  k *= 1 + 2 * depthAt(world, c.x, c.y);
  for (const s of world.structures || []) {
    if ((s.kind === 'idol' || s.kind === 'whalefall') && Math.hypot(s.x - c.x, s.y - c.y) < STRUCTURES[s.kind].r) k *= s.kind === 'idol' ? 3 : 1.6;
  }
  for (const m of world.creatures) {
    if (DEEP[m.species] && DEEP[m.species].mythic && Math.hypot(m.x - c.x, m.y - c.y) < 160) { k *= 2; break; }
  }
  return L.bound ? 0 : k;
}

let eldTick = 0;
function updateEldritch(world, dt) {
  eldTick -= dt;
  if (eldTick > 0) return;
  const step = 1 - eldTick;
  eldTick = 1;
  const marked = world.creatures.filter((c) => c.life && c.life.genome.eld && !c.dying && !c.leaving);
  for (const c of marked) {
    const L = c.life, before = eldStage(L);
    L.corruption = Math.min(1, (L.corruption || 0) + eldRate(world, c) * step);
    const now = eldStage(L);
    if (now !== before) {
      L.traits = eldTraits(L);
      const rare = L.traits.find((t) => RARE_OUTLINE[t]);
      if (rare && c.id) { OUTLINE[c.id] = RARE_OUTLINE[rare]; THICK[c.id] = 1; }
      logEvent(world, fill(ELD_STAGE_LINES[now], c), c, { cat: 'rare', pri: now === 2 ? 3 : 2 });
      if (now === 2) {
        const G = world.game, key = `eld:${c.species === 'wild' ? c.sp.id : c.species}`, first = !G.seen.includes(key);
        if (first) G.seen.push(key);
        deepenBy(world, first ? 0.3 : 0.02);
        award(world, first ? 60 : 10, 'transcendence', c);
      }
    }
    // Psychic effects.
    if (now >= 1) {
      const R = now === 2 ? 70 : 42;
      let drawn = 0, mad = 0; // a few at a time are drawn in, and fewer lose their minds
      for (const o of world.creatures) {
        if (o === c || !o.life || o.life.genome.eld) continue;
        const d2 = (o.x - c.x) ** 2 + (o.y - c.y) ** 2;
        if (d2 > R * R) continue;
        o.life.comfort = Math.max(0, o.life.comfort - (now === 2 ? 0.06 : 0.03)); // dread
        if (now === 2 && drawn < 4 && isPrey(o) && Math.random() < 0.25) { drawn++; o.tx = c.x + rand(-14, 14); o.ty = c.y + rand(-14, 14); o.timer = 2; } // enthralled: circling it
        if (now === 2 && mad < 3 && d2 < 900 && Math.random() < 0.5) { mad++; o.maddened = 2; } // too close: something is wrong with it
      }
      if (now === 2) addHeat(world, c.x, c.y, 0.04);
    }
    // At night the transcendent dream, and the mark can pass to a neighbour.
    if (now === 2 && world.darkness > 0.5 && Math.random() < 0.004) {
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
  for (const o of world.creatures) if (o.maddened) o.maddened = Math.max(0, o.maddened - step);
}

// Drawn over a marked animal: glowing eyes, then eyes along its body and feelers,
// then a crown of tentacles and a sigil beneath it that glows at night.
function drawEldritch(r, c, t, world) {
  const L = c.life, st = eldStage(L), b = c.body;
  if (st < 0 || !b) return;
  if (c.eldId == null) { c.eldId = newId(hexToInt('#12061e')); EMISSIVE[c.eldId] = 2; }
  const z = (c.zBody ?? c.z ?? 1) + 1.2, id = c.eldId, n = b.n;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + c.phase);
  for (const s of [-1, 1]) r.dot(b.px(0, s * 0.9, -0.4), b.py(0, s * 0.9, -0.4), z + b.w[0] * 0.6, ELD_EYE, id);
  if (st >= 1) {
    const k = Math.round(2 + L.corruption * 6);
    for (let i = 0; i < k; i++) {
      const j = Math.min(n - 1, 1 + Math.floor((i + 1) * (n - 2) / (k + 1))), s = i % 2 ? 1 : -1;
      if (Math.sin(t * 1.7 + i * 2.1 + c.phase) > -0.5) r.dot(b.px(j, s * PI / 2.2, 0), b.py(j, s * PI / 2.2, 0), z + b.w[j] * 0.7, ELD_EYE, id);
    }
    const tentacles = st === 2 ? 6 : 2, h = b.a[0];
    for (let i = 0; i < tentacles; i++) {
      const a = h + PI + (i - (tentacles - 1) / 2) * 0.5 + Math.sin(t * 2 + i) * 0.35, L1 = (st === 2 ? 7 : 3.5) * (0.8 + 0.2 * pulse);
      const x0 = b.x[0], y0 = b.y[0], x1 = x0 + Math.cos(a) * L1 * 0.55, y1 = y0 + Math.sin(a) * L1 * 0.55;
      r.tube(x0, y0, 0.55, z, x1, y1, 0.45, z - 0.5, 0.8, ELD_TENDRIL, c.id);
      r.tube(x1, y1, 0.45, z - 0.5, x1 + Math.cos(a + 0.4) * L1 * 0.45, y1 + Math.sin(a + 0.4) * L1 * 0.45, 0.35, z - 1, 0.8, ELD_TENDRIL, c.id);
    }
  }
  if (st === 2 && world.darkness > 0.35) {
    const R = b.w[1] * 2 + 5;
    for (let k = 0; k < 12; k++) {
      if ((k + Math.floor(t * 3)) % 4 === 0) continue;
      const a = k / 12 * TAU + t * 0.3;
      r.dot(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R, 0.8, ELD_SIGIL, id);
    }
  }
}

// Young born near the drowned idol, or in the abyss, sometimes come out marked.
function eldBirthChance(world, x, y) {
  let p = depthAt(world, x, y) > 0.8 ? 0.03 : 0;
  for (const s of world.structures || []) if (s.kind === 'idol' && Math.hypot(s.x - x, s.y - y) < STRUCTURES.idol.r) p += 0.08;
  return p;
}

// Player options, from the creature card.
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
