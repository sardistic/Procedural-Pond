'use strict';
// Death and finds. An animal that dies of old age or hunger stops, sinks and
// fades where it is, and leaves its remains: click them (with any tool but the
// Net) to recover extra essence and a few points. Left alone, scavengers (crabs,
// isopods, snails, catfish, starfish, shrimp) pick them over, and they're gone
// in a couple of minutes. Now and then the tide uncovers a fossil on the beach
// (an ammonite, a trilobite or a great tooth): it holds essence and an ancient
// gene, a rare trait you can give a new spawn (the dock) or a hatchery brood.

const REMAINS_LIFE = 150;
const REMAINS_BONE = mat('#6a665a', '#948e7e', '#bcb6a4', '#e4dece');
const SCAVENGERS = new Set(['crab', 'isopod', 'snail', 'catfish', 'starfish', 'shrimp']);
// Scavengers are drawn to remains (as they are to the plants they like).
for (const k of SCAVENGERS) LIKES[k] = [...(LIKES[k] || []), 'remains'];
LIKE_LABEL.remains = 'carrion';

// A dying animal: it stops, sinks toward the floor and fades, then becomes remains.
// Returns true while it's dying (the rest of its tick is skipped).
function dieStep(world, c, dt) {
  const D = c.dying;
  D.t += dt;
  c.speed = 0;
  c.prey = null;
  if (typeof c.z === 'number' && !c.zBody && c.z > 1) c.z = Math.max(1, c.z - 9 * dt);
  c.alpha = Math.max(0.2, 1 - D.t / 3);
  if (D.t < 3) return true;
  c.gone = true;
  ECO.died = (ECO.died || 0) + 1;
  noteGone(world, c, D.why);
  if (c.life) {
    const label = describe(c).label, m = Math.floor(c.life.age / 60);
    if (D.why === 'of old age') {
      award(world, 1, 'full lives', c, { quiet: true });
      gainEssence(world, 1 + TIER_ESSENCE[tierOf(c.life.traits)] / 2, 'returned to the pond', c, { quiet: true });
    }
    world.remains.push(new Remains(world, c));
    logEvent(world, `${who(c)} died ${D.why}${m ? ` after ${m} minutes` : ''}: its remains lie on the floor`, c, {
      cat: 'life', pri: tierOf(c.life.traits) >= 2 ? 2 : 0, key: `died:${c.species === 'wild' ? c.sp.id : c.species}`, data: D.why,
      merge: (e) => {
        const why = new Map();
        for (const d of e.data) why.set(d, (why.get(d) || 0) + 1);
        return `${e.n} ${plural(label, e.n)} died (${[...why].map(([k, n]) => `${n} ${k}`).join(', ')}): their remains lie on the floor`;
      },
    });
  }
  return true;
}

class Remains {
  constructor(world, c) {
    this.x = c.x; this.y = c.y;
    const b = c.body, n = b ? b.n : 1, step = Math.max(1, Math.floor(n / 7));
    this.bones = [];
    for (let i = 0; i < n; i += step) this.bones.push([b.x[i], b.y[i], Math.max(0.55, b.w[i] * 0.3)]);
    this.value = Math.max(1, Math.round(recycleValue(c) * 0.6) + 1);
    this.tier = c.life ? tierOf(c.life.traits) : 0;
    this.name = c.life ? c.life.name : '';
    this.label = describe(c).label;
    this.life = REMAINS_LIFE;
    this.id = newId(outlineOf(REMAINS_BONE));
    this.sparkT = rand(0.5, 2);
    this.scavT = 1;
  }

  update(dt, world) {
    this.life -= dt;
    // Scavengers nearby pick the bones over: they eat, and the remains go sooner.
    this.scavT -= dt;
    if (this.scavT <= 0) {
      this.scavT = 1;
      for (const s of world.creatures) {
        if (s.life && SCAVENGERS.has(s.species) && (s.x - this.x) ** 2 + (s.y - this.y) ** 2 < 400) {
          this.life -= 10;
          s.life.energy = Math.min(1, s.life.energy + 0.05);
        }
      }
    }
    this.sparkT -= dt;
    if (this.sparkT <= 0 && this.life > 12) {
      this.sparkT = rand(1.8, 3.5);
      if (world.effects.length < 220) world.effects.push(new Sparkle(this.x + rand(-2, 2), this.y + rand(-2, 2), 3));
    }
    return this.life > 0;
  }

  draw(r) {
    r.alpha = Math.min(1, this.life / 20);
    FADE[this.id] = r.alpha < 1 ? 1 : 0;
    const B = this.bones, id = this.id;
    for (let i = 0; i < B.length - 1; i++) r.tube(B[i][0], B[i][1], 0.55, 0.6, B[i + 1][0], B[i + 1][1], 0.5, 0.6, 0.8, REMAINS_BONE, id);
    // Ribs across the middle of the spine, the skull at the head end.
    for (let i = 1; i < B.length - 1; i++) {
      if (i > B.length * 0.65) break;
      const a = Math.atan2(B[i + 1][1] - B[i - 1][1], B[i + 1][0] - B[i - 1][0]) + PI / 2, L = B[i][2] * 2.4;
      r.tube(B[i][0] - Math.cos(a) * L, B[i][1] - Math.sin(a) * L, 0.45, 0.5, B[i][0] + Math.cos(a) * L, B[i][1] + Math.sin(a) * L, 0.45, 0.5, 0.8, REMAINS_BONE, id);
    }
    if (B.length) r.ellipsoid(B[0][0], B[0][1], B[0][2] * 1.8 + 0.6, B[0][2] * 1.4 + 0.5, 0, 0.4, 1, REMAINS_BONE, id);
    r.alpha = 1;
  }

  hit(x, y) { return this.bones.some(([bx, by, w]) => (bx - x) ** 2 + (by - y) ** 2 < (w + 4) ** 2); }
}

const remainsAt = (world, x, y) => (world.remains || []).find((rm) => rm.hit(x, y));

function collectRemains(world, rm) {
  world.remains.splice(world.remains.indexOf(rm), 1);
  const ess = gainEssence(world, rm.value, 'remains', rm), pts = award(world, 2 + TIER_VALUE[rm.tier], 'remains', rm, { quiet: true });
  floatAward(rm.x, rm.y + 4, `+${pts}`);
  logEvent(world, `Recovered ${rm.name}'s remains: +${ess} essence, +${pts} points`, null, {
    cat: 'pond', pri: 0, key: 'remains', data: [ess, pts],
    merge: (e) => `Recovered the remains of ${e.n} animals: +${e.data.reduce((a, d) => a + d[0], 0)} essence, +${e.data.reduce((a, d) => a + d[1], 0)} points`,
  });
}

// ---- fossils and ancient genes ------------------------------------------------------------------

// Rarer genes are rarer finds. 'touched' is the eldritch mark (see eldritch.js).
const ANCIENT_GENES = [
  ['albino', 3], ['leucistic', 2], ['axanthic', 3], ['xanthic', 3], ['melanistic', 3], ['piebald', 3], ['marbled', 2],
  ['giant', 2], ['dwarf', 2], ['shiny', 1], ['glow', 1], ['ghost', 1], ['chimera', 0.5], ['touched', 0.6],
];
const FOSSIL_KINDS = { ammonite: 'an ammonite', trilobite: 'a trilobite', tooth: 'a great tooth' };
const FOSSIL_STONE = mat('#4a4234', '#6e6450', '#948870', '#bab092'), FOSSIL_DARK = mat('#2a241a', '#3e362a', '#52483a', '#6a5e4c');

function pickAncientGene() {
  const total = ANCIENT_GENES.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of ANCIENT_GENES) if ((r -= w) <= 0) return k;
  return 'piebald';
}

// Give a genome a gene from a fossil, so the animal shows it.
function applyAncientGene(g, key) {
  if (['albino', 'melanistic', 'piebald', 'xanthic', 'axanthic'].includes(key)) g[key] = 2;
  else if (key === 'leucistic') g.leu = 2;
  else if (key === 'marbled') g.mar = Math.max(1, g.mar || 0);
  else if (key === 'giant') g.size = 1.36;
  else if (key === 'dwarf') g.size = 0.72;
  else if (key === 'shiny') { g.shiny = true; g.shinyHue = rand(100, 240); }
  else if (key === 'chimera') g.chi = true;
  else if (key === 'touched') g.eld = true;
  else g[key] = true; // glow, ghost
  return g;
}

class Fossil {
  constructor(x, y, kind, gene, born) {
    this.x = x; this.y = y; this.kind = kind; this.gene = gene; this.born = born;
    this.ang = rand(0, TAU);
    this.id = newId(outlineOf(FOSSIL_DARK));
    this.sparkT = rand(0.5, 2);
  }

  update(dt, world) {
    this.sparkT -= dt;
    if (this.sparkT <= 0) { this.sparkT = rand(2, 4); if (world.effects.length < 220) world.effects.push(new Sparkle(this.x, this.y, 3)); }
    return world.days - this.born < 4; // the tide takes it back after a few days
  }

  draw(r) {
    const { x, y, id, ang } = this;
    if (this.kind === 'ammonite') {
      r.ellipsoid(x, y, 3.6, 3.6, ang, 0, 2, (lx, ly) => {
        const a = Math.atan2(ly, lx), d = Math.hypot(lx, ly), turn = (d * 3 - a / TAU) % 1;
        return (turn + 1) % 1 < 0.22 ? FOSSIL_DARK : FOSSIL_STONE;
      }, id);
    } else if (this.kind === 'trilobite') {
      r.ellipsoid(x, y, 4, 2.8, ang, 0, 1.4, (lx, ly) => (Math.abs(ly) > 0.28 && Math.abs(ly) < 0.4 ? FOSSIL_DARK : ((lx + 1) * 5) % 1 < 0.2 ? FOSSIL_DARK : FOSSIL_STONE), id);
      r.ellipsoid(x + Math.cos(ang) * 3.5, y + Math.sin(ang) * 3.5, 1.8, 2.6, ang, 0, 1.2, FOSSIL_STONE, id);
    } else {
      r.tube(x - Math.cos(ang) * 2, y - Math.sin(ang) * 2, 2.4, 0, x + Math.cos(ang) * 3, y + Math.sin(ang) * 3, 0.5, 0.4, 0.5, (u) => (u < 0.3 ? FOSSIL_DARK : REMAINS_BONE), id);
    }
  }

  hit(x, y) { return (x - this.x) ** 2 + (y - this.y) ** 2 < 36; }
}

const fossilAt = (world, x, y) => (world.fossils || []).find((f) => f.hit(x, y));

// At dawn, sometimes, a fossil turns up on the beach (more often as the pond deepens).
function dawnFinds(world) {
  if (!world.shore || world.fossils.length >= 3) return;
  const tier = world.erosion ? world.erosion.tier : 0;
  if (Math.random() > 0.08 + 0.05 * tier) return;
  for (let i = 0; i < 40; i++) {
    const x = rand(12, world.W - 12), y = rand(12, world.H - 12), e = shoreAt(world, x, y);
    if (e < 0.42 || e > 0.9) continue;
    const kind = pick(Object.keys(FOSSIL_KINDS));
    world.fossils.push(new Fossil(x, y, kind, pickAncientGene(), world.days));
    logEvent(world, `✦ The tide has uncovered something on the beach: ${FOSSIL_KINDS[kind]}, glinting in the sand`, null, { cat: 'rare', pri: 2 });
    return;
  }
}

function collectFossil(world, f) {
  world.fossils.splice(world.fossils.indexOf(f), 1);
  const G = world.game, tier = world.erosion ? world.erosion.tier : 0;
  const ess = gainEssence(world, 15 + 5 * tier, 'fossils', f), pts = award(world, 25, 'fossils', f, { quiet: true });
  G.fossilGenes = [...(G.fossilGenes || []), f.gene];
  deepenBy(world, 0.1);
  logEvent(world, `✦ You dug up ${FOSSIL_KINDS[f.kind]}: +${ess} essence, +${pts} points, and an ancient ${f.gene} gene to give a new spawn or a brood`, null, { cat: 'rare', pri: 3 });
}
