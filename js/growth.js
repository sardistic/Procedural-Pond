'use strict';
// Health, growth from feeding, and the genes an animal takes from what it eats.
//
// Health (L.hp, 0 to 1) is separate from hunger (L.energy): wounds from fights and starvation take
// it, a full belly heals it, and an animal dies when it runs out. Every meal also puts on size
// (L.grown, up to GROW_MAX past what its genes give it, more from a kill than from food, less the
// bigger it already is); starving melts it off again. Eating another animal moves the eater's
// working genes part of the way toward the prey's wherever the prey's were better: size, speed,
// strength, longevity, fertility, intellect, resilience and tolerance. Those genes are inherited.

const GROW_MAX = 0.6;
const GROW_STEP = 0.1; // the pond pays a little each time a fed animal grows another tenth
const ABSORB = [['size', 'size'], ['speed', 'speed'], ['vit', 'strength'], ['lon', 'longevity'], ['fert', 'fertility'],
  ['iq', 'intellect'], ['res', 'resilience'], ['tol', 'tolerance']];
const ABSORB_LABELS = new Set(ABSORB.map(([, l]) => l));
const GENE_RANGE = (k) => (typeof GENE_LIMITS !== 'undefined' && GENE_LIMITS[k]) || [0, 1];

// How much bigger and tougher feeding has made it.
const grownOf = (c) => (c.life && c.life.grown) || 0;
const hpOf = (c) => (c.life ? c.life.hp ?? 1 : 1);

// Re-apply the body's size after growth changes (applyScale folds L.grown in).
function applyGrowth(c) {
  const L = c.life;
  if (!L || !c.base || !SCALABLE.has(c.species)) return;
  if (Math.abs((c.appliedGrown || 0) - (L.grown || 0)) > 0.005) applyScale(c, L.scale * L.genome.size);
}

// After every meal (called from eat).
function mealGrowth(world, c, f, gain) {
  const L = c.life;
  if (!L) return;
  const kill = typeof Creature !== 'undefined' && f instanceof Creature;
  L.meals = (L.meals || 0) + 1;
  // The young grow up faster on a good diet.
  if (L.scale < 1) L.scale = Math.min(1, L.scale + gain * 0.06);
  const before = L.grown || 0;
  L.grown = Math.min(GROW_MAX, before + (kill ? 0.05 : 0.012) * gain / (1 + before * 3));
  applyGrowth(c);
  // A milestone: every tenth grown pays a few pearls and is noted.
  if (Math.floor(L.grown / GROW_STEP) > Math.floor(before / GROW_STEP) && typeof award === 'function') {
    award(world, 2 + Math.round(10 * L.grown), 'well fed', c, { quiet: true });
    if (typeof floatAward === 'function') floatAward(c.x, c.y - 8, `grew to ${Math.round(100 + 100 * L.grown)}%`, 'gain');
    logEvent(world, `${who(c)} has grown to ${Math.round(100 + 100 * L.grown)}% of its size on a good diet`, c, {
      cat: 'life', pri: 0, key: `fedgrow:${c.species}`, merge: (e) => `${e.n} well-fed animals put on size`,
    });
  }
  if (kill && f.life) absorbGenes(world, c, f);
}

// What a kill passes on: the eater's genes move toward the prey's better ones.
function absorbGenes(world, c, f) {
  const L = c.life, g = L.genome, h = f.life.genome;
  if (!g || !h) return [];
  const width = (q) => (q.body ? Math.max(...q.body.w) : 1);
  const ratio = clamp(width(f) / Math.max(0.5, width(c)), 0.15, 1.2), k = 0.06 + 0.1 * ratio; // (a bigger meal passes more on)
  const oldSpeed = g.speed, gains = [];
  for (const [key, label] of ABSORB) {
    const a = g[key], b = h[key];
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    const [lo, hi] = GENE_RANGE(key), d = Math.min((b - a) * k, (hi - lo) * 0.05);
    if (d < 1e-4) continue;
    g[key] = clamp(a + d, lo, Math.max(hi, a));
    gains.push([label, (g[key] - a) / (hi - lo)]);
  }
  if (!gains.length) return gains;
  const D = L.devoured || (L.devoured = { n: 0, gains: {} });
  D.n++;
  for (const [label, v] of gains) D.gains[label] = Math.round(((D.gains[label] || 0) + v) * 1000) / 1000;
  if (g.speed !== oldSpeed && oldSpeed > 0) { const r = g.speed / oldSpeed; if (c.cruise) c.cruise *= r; if (c.maxSpeed) c.maxSpeed *= r; }
  refreshBuffs(c);
  if (c.base && SCALABLE.has(c.species)) applyScale(c, L.scale * g.size);
  const best = gains.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (typeof floatAward === 'function') floatAward(c.x, c.y - 4, `+${best[0]}`, 'gain');
  return gains;
}

// Wounds: bigger, stronger animals take less from the same blow. Returns true if it killed.
function hurt(world, c, amount, { why = 'of its wounds', canKill = true } = {}) {
  const L = c.life;
  if (!L || c.dying) return false;
  const tough = (0.6 + 0.4 * geneBuffs(c).vitality) * (1 + 0.5 * (L.grown || 0));
  L.hp = Math.max(canKill ? 0 : 0.08, (L.hp ?? 1) - amount / tough);
  L.hurtAt = world.t;
  if (L.hp <= 0 && canKill) { c.dying = { t: 0, why }; return true; }
  return false;
}

// Every life tick (from updateLife): heal when fed, starve when empty, lose size when starving.
function tickHealth(c, dt) {
  const L = c.life;
  if (L.hp == null) L.hp = 1;
  if (L.energy <= 0) L.hp = Math.max(0, L.hp - dt / 25);
  else if (L.hp < 1 && L.energy > 0.35) L.hp = Math.min(1, L.hp + dt * 0.012 * (L.buffs?.vitality || 1) * (L.fed > 0 ? 2 : 1));
  if ((L.grown || 0) > 0 && L.energy < 0.15) { L.grown = Math.max(0, L.grown - dt * 0.002); applyGrowth(c); }
}

// For saves.
function cleanDevoured(d) {
  if (!d || typeof d !== 'object' || !Number.isFinite(d.n)) return null;
  const gains = {};
  for (const [k, v] of Object.entries(d.gains || {})) if (ABSORB_LABELS.has(k) && Number.isFinite(v)) gains[k] = Math.round(clamp(v, 0, 10) * 1000) / 1000;
  return { n: Math.floor(clamp(d.n, 0, 1e6)), gains };
}

// ---- health bars over every animal -------------------------------------------------------------------
let BAR_ID = 0;
const BAR_MAT = {};
const barMat = (hex) => BAR_MAT[hex] || (BAR_MAT[hex] = solid(hex));
function drawBars(r, world, near) {
  if (!BAR_ID) { BAR_ID = newId(hexToInt('#0a0a0a')); EMISSIVE[BAR_ID] = 1; }
  r.castShadows = false;
  for (const c of world.creatures) {
    const L = c.life;
    if (!L || c.gone || c.caught || (c.alpha ?? 1) < 0.3 || !c.body || !near(c.x, c.y, 20)) continue;
    const w = Math.max(...c.body.w), n = Math.round(clamp(w * 2.4, 5, 14)), x0 = Math.round(c.x - n / 2), y0 = Math.round(c.y - w - 5), z = (c.z || 0) + 14;
    const hp = clamp(L.hp ?? 1, 0, 1), fill = Math.round(hp * n), full = Math.round(clamp(L.energy, 0, 1) * n);
    const col = c.dying ? '#5a5a5a' : hp > 0.6 ? '#5aff7a' : hp > 0.3 ? '#ffd24a' : '#ff4a4a';
    for (let i = 0; i < n; i++) {
      r.dot(x0 + i, y0, z, barMat(i < fill ? col : '#1a2a2a'), BAR_ID);
      r.dot(x0 + i, y0 + 1, z, barMat(i < full ? '#ffb04a' : '#10181a'), BAR_ID);
    }
    // A pip for each tenth grown on feeding.
    const pips = Math.floor((L.grown || 0) / GROW_STEP);
    for (let i = 0; i < pips; i++) r.dot(x0 + i * 2, y0 - 1, z, barMat('#bff4ff'), BAR_ID);
  }
  r.castShadows = true;
}
