'use strict';
// Fossils come in grades now, and the rarest hold artifacts: things that give you
// a hand on the pond itself.
//  - Fossils: an ammonite (common), a trilobite (uncommon), a great tooth (rare),
//    amber with something in it (epic), an ancient skull (legendary), a relic
//    (mythic). The rarer, the more essence and points, and the rarer the ancient
//    gene inside. Deeper ponds turn up rarer ones. A relic holds an artifact.
//  - Artifacts, the meta controls (from the sky tracker, once found):
//    the storm glass (call a storm or clear the sky for a day), the moonstone
//    (spring or neap tides for a day), the tide bell (high or low water held for
//    half a day), the wind conch (raise the surf or lay it flat for a day). And
//    some that simply work: the heart of pearl (a quarter more pearls), the
//    lodestone of the deep (the pond wears deeper half as fast again) and the
//    eye of the deep (deep life rises twice as often).

const FOSSIL_GRADES = {
  ammonite: { grade: 0, w: 50, label: 'an ammonite' }, trilobite: { grade: 1, w: 28, label: 'a trilobite' }, tooth: { grade: 2, w: 14, label: 'a great tooth' },
  amber: { grade: 3, w: 5.5, label: 'a bead of amber with something inside' }, skull: { grade: 4, w: 2, label: 'an ancient skull' }, relic: { grade: 5, w: 0.5, label: 'a relic' },
};
Object.assign(FOSSIL_KINDS, Object.fromEntries(Object.entries(FOSSIL_GRADES).map(([k, f]) => [k, f.label])));

// Which fossil the tide uncovers: rarer ones oftener as the pond deepens.
function pickFossil(world) {
  const tier = (world.erosion && world.erosion.tier) || 0;
  const w = Object.entries(FOSSIL_GRADES).map(([k, f]) => [k, f.w * (1 + 0.35 * tier * f.grade)]);
  let r = Math.random() * w.reduce((a, [, x]) => a + x, 0);
  for (const [k, x] of w) if ((r -= x) <= 0) return k;
  return 'ammonite';
}
// A rarer fossil holds a rarer gene: the rarest of a few draws.
function fossilGene(kind) {
  const n = 1 + FOSSIL_GRADES[kind].grade;
  let best = pickAncientGene();
  for (let i = 1; i < n; i++) { const g = pickAncientGene(); if ((TRAIT_RARITY[g] || 1) > (TRAIT_RARITY[best] || 1)) best = g; }
  return best;
}

const ARTIFACTS = {
  stormglass: { label: 'Storm glass', note: 'call up a storm, or clear the sky, for a day', controls: { storm: 'Call a storm', clear: 'Clear the sky' }, key: 'weather', days: 1 },
  moonstone: { label: 'Moonstone', note: 'pull the tides wide (spring) or still them (neap), for a day', controls: { spring: 'Spring tides', neap: 'Neap tides' }, key: 'range', days: 1 },
  tidebell: { label: 'Tide bell', note: 'ring for high or low water, held for half a day', controls: { high: 'High water', low: 'Low water' }, key: 'tide', days: 0.5 },
  windconch: { label: 'Wind conch', note: 'raise the surf, or lay it flat, for a day', controls: { rough: 'Raise the surf', calm: 'Lay it flat' }, key: 'surf', days: 1 },
  pearlheart: { label: 'Heart of pearl', note: 'every pearl you earn brings a quarter more', passive: true },
  lodestone: { label: 'Lodestone of the deep', note: 'the pond wears deeper half as fast again', passive: true },
  deepeye: { label: 'Eye of the deep', note: 'deep life rises twice as often', passive: true },
};
const ARTIFACT_CODES = Object.keys(ARTIFACTS);
const hasArtifact = (world, k) => !!(world.game && world.game.artifacts && world.game.artifacts[k]);

// What the artifacts are doing now: { weather, range, tide, surf } each { v, until } (pond days).
function metaNow(world, key) {
  const M = world.meta && world.meta[key];
  return M && world.days < M.until ? M.v : null;
}
function useArtifact(world, k, v) {
  const A = ARTIFACTS[k];
  if (!hasArtifact(world, k) || !A.controls) return false;
  const M = world.meta || (world.meta = {}), cur = M[A.key];
  if (cur && world.days < (cur.ready || 0)) return false; // it needs to rest
  M[A.key] = { v, until: world.days + A.days, ready: world.days + A.days + 0.5 };
  logEvent(world, `You used the ${A.label.toLowerCase()}: ${A.controls[v].toLowerCase()}`, null, { cat: 'sky', pri: 2 });
  if (typeof Sound !== 'undefined') Sound.omen(world.W / 2, world.H / 2);
  return true;
}

// A relic's artifact: one you don't have yet, if there are any left.
function findArtifact(world) {
  const G = world.game, have = G.artifacts || {}, left = ARTIFACT_CODES.filter((k) => !have[k]);
  if (!left.length) { gainEssence(world, 200, 'relics'); return null; }
  const k = pick(left);
  G.artifacts = { ...have, [k]: true };
  logEvent(world, `✦ Inside the relic: the ${ARTIFACTS[k].label.toLowerCase()}. ${capFirst(ARTIFACTS[k].note)}${ARTIFACTS[k].controls ? ' (use it from the sky tracker)' : ''}`, null, { cat: 'rare', pri: 3 });
  return k;
}

// ---- the hooks: weather, tides, surf, pearls, erosion, the deep ---------------------------------------
function metaWeather(world, w) {
  const v = metaNow(world, 'weather');
  if (v === 'storm') { w.target = 1; w.next = Math.max(w.next, 5); w.gust = Math.max(w.gust, 0.8); } else if (v === 'clear') { w.target = 0; w.next = Math.max(w.next, 5); }
}
function metaTide(world, tide) {
  const range = metaNow(world, 'range');
  if (range === 'spring') tide.range = Math.min(1, tide.range * 1.8 + 0.2); else if (range === 'neap') tide.range *= 0.3;
  const t = metaNow(world, 'tide');
  if (t) tide.level += ((t === 'high' ? 0.5 + 0.32 * Math.max(0.5, tide.range) : 0.5 - 0.32 * Math.max(0.5, tide.range)) - tide.level) * 0.9;
  const s = metaNow(world, 'surf');
  if (s === 'rough') tide.surf = Math.min(1.4, tide.surf * 1.8 + 0.35); else if (s === 'calm') tide.surf *= 0.15;
}

// ---- how the new fossils look -------------------------------------------------------------------------
const AMBER = mat('#8a4a0a', '#c0741a', '#e8a032', '#ffd87a'), RELIC = mat('#0a1a14', '#16302a', '#244a40', '#3a6a5e'), RELIC_RUNE = mat('#1a8a5a', '#3ad08a', '#8af0c0', '#e0fff0');
const drawFossilPlain = Fossil.prototype.draw;
Fossil.prototype.draw = function (r, t) {
  const { x, y, id, ang, kind } = this;
  if (kind === 'amber') {
    r.ellipsoid(x, y, 3, 2.4, ang, 0, 2, (lx, ly) => (lx * lx + ly * ly < 0.12 ? FOSSIL_DARK : AMBER), id);
  } else if (kind === 'skull') {
    r.ellipsoid(x, y, 4.2, 3.4, ang, 0, 2.8, (lx, ly) => ((lx - 0.3) ** 2 + (ly + 0.35) ** 2 < 0.05 || (lx - 0.3) ** 2 + (ly - 0.35) ** 2 < 0.05 ? FOSSIL_DARK : REMAINS_BONE), id);
  } else if (kind === 'relic') {
    if (this.runeId == null) { this.runeId = newId(hexToInt('#021008')); EMISSIVE[this.runeId] = 2; }
    r.ellipsoid(x, y, 4, 4, ang, 0, 1.5, RELIC, id);
    for (let k = 0; k < 6; k++) if (Math.sin(t * 2 + k) > -0.2) { const a = ang + k / 6 * TAU; r.dot(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.6, RELIC_RUNE, this.runeId); }
  } else drawFossilPlain.call(this, r, t);
};
