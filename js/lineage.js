'use strict';
// Lineages: rewarding the lines you breed, and keeping the ones you love.
//  - Super spawns: breed a rare line again and again (the same traits in the
//    same species: 3, 8, 20 and 50 times) and it earns a super spawn of that
//    line; a species that scores well for you (150 points, then 600, 2,400,
//    9,600 …) earns one of its best line too. A super spawn is a Paragon: the
//    finest of its line, Pristine, carrying the line's traits and a gift,
//    hardier and longer-lived, with a crown of light. It always settles. Claim
//    it from the species' spawn card, or from the score panel.
//  - Keep safe: mark any animal from its card and it can't be recycled (not by
//    the Net, not by "recycle all") until you unmark it.

const LINE_MILESTONES = [3, 8, 20, 50];
const SPECIES_MILESTONE = (i) => 150 * 4 ** i;
TRAIT_RARITY.paragon = 4; RARE_OUTLINE.paragon = hexToInt('#ffd24a'); TRAIT_BUFFS.paragon = { vitality: 0.25, longevity: 0.25, fertility: 0.2 };
TRAIT_NOTES.paragon = 'the finest of its line';

const superKind = (k) => (k === 'tadpole' ? 'frog' : k);
const canSuper = (k) => !!(SPECIES[k] && CREATE[k] && k !== 'wild' && typeof fitsHabitat === 'function' && fitsHabitat(world, SPECIES_HABITAT[k] || 'both'));
function supersFor(world, kind) { return ((world.game && world.game.supers) || []).map((s, i) => [s, i]).filter(([s]) => s.k === kind); }

function earnSuper(world, kind, traits, why) {
  const G = world.game;
  kind = superKind(kind);
  if (!G || !canSuper(kind)) return;
  G.supers = [...(G.supers || []), { k: kind, traits: (traits || []).filter((t) => t !== 'paragon').slice(0, 5) }];
  const what = `a paragon ${[...traits].slice(0, 3).join(' ')} ${SINGULAR[kind] || kind}`.replace(/\s+/g, ' ');
  logEvent(world, `✦ Super spawn earned: ${what} (${why}). Claim it from its spawn card`, null, { cat: 'rare', pri: 3 });
  if (typeof narrate === 'function') narrate(world, 'super', { what: capFirst(what) });
}

// A rare line bred again (game.js scoreRare): at each milestone, a super spawn of that line.
function lineMilestone(world, c, key, bred) {
  if (!LINE_MILESTONES.includes(bred) || c.species === 'wild') return;
  earnSuper(world, c.species, c.life.traits, `the ${c.life.traits.join(' ')} line bred ${bred} times`);
}
// Points scored through a species (game.js award): its milestones earn one of its best line.
function speciesPoints(world, c, n) {
  const G = world.game, k = superKind(c.species);
  if (!G || !c.life || k === 'wild') return;
  const P = G.spPts || (G.spPts = {}), before = P[k] || 0, after = before + n;
  P[k] = after;
  const hit = G.spHit || (G.spHit = {});
  let i = hit[k] || 0;
  while (after >= SPECIES_MILESTONE(i)) {
    i++;
    hit[k] = i;
    earnSuper(world, k, bestLine(world, k), `${SINGULAR[k] || k} has scored ${fmtN(SPECIES_MILESTONE(i - 1))} points for you`);
  }
}
const fmtN = (n) => n.toLocaleString();
// The species' most-bred rare line, as traits.
function bestLine(world, k) {
  let best = null, bn = 0;
  for (const [key, n] of Object.entries((world.game && world.game.lines) || {})) {
    const [sp, tr] = key.split('|');
    if (sp === k && n > bn) { bn = n; best = tr; }
  }
  return best ? best.split('+').filter(Boolean) : [];
}

// Claim one: a spawn of the species, the first of it a Paragon, the rest Superb; all settle.
function claimSuper(world, i) {
  const G = world.game, S = G.supers && G.supers[i];
  if (!S) return false;
  if (world.creatures.length >= world.maxPop + 60) { showTicker('The pond is full: no room for more'); return false; }
  const [x, y] = openSpot(), group = SPECIES[S.k].spawn(world, x, y);
  group.forEach((c, j) => {
    let g = genomeFor(c.seed);
    if (j === 0) {
      for (const t of S.traits) {
        if (ANCIENT_GENES.some(([k]) => k === t)) g = applyAncientGene(g, t);
        else if (GIFTS[t]) { g[t] = true; if (t === 'titan') g.size = 1.5; }
      }
    }
    initLife(c, { alpha: 0, genome: g });
    meetGrade(c, j === 0 ? 5 : 4);
    if (j === 0) {
      // (meetGrade may have re-rolled the genome: put the line's traits back, and a gift.)
      const L = c.life;
      for (const t of S.traits) {
        if (ANCIENT_GENES.some(([k]) => k === t)) applyAncientGene(L.genome, t);
        else if (GIFTS[t]) L.genome[t] = true;
      }
      const gifts = GIFT_KEYS.filter((k) => k !== 'titan' && !L.genome[k]);
      if (gifts.length) L.genome[pick(gifts)] = true;
      for (const k of CURSE_KEYS) L.genome[k] = false;
      L.paragon = true;
      L.traits = eldTraits(L);
      refreshBuffs(c);
      if (c.id) { OUTLINE[c.id] = RARE_OUTLINE.paragon; THICK[c.id] = 1; }
      if (typeof applyScale === 'function' && SCALABLE.has(c.species) && c.base) applyScale(c, L.scale * (L.genome.size || 1));
    }
    if (typeof spawnFx === 'function') spawnFx(c);
    noteBorn(world, c, 'bought');
  });
  world.creatures.push(...group);
  world.targets[S.k] = (world.targets[S.k] || 0) + group.length;
  G.supers = G.supers.filter((s, j) => j !== i);
  const p = group[0];
  logEvent(world, `✦ The paragon ${p.life.name} the ${describe(p).label} arrives, ${p.life.traits.join(' ')}`, p, { cat: 'rare', pri: 3 });
  if (typeof scatterFrom === 'function' && p.life.genome.eld) scatterFrom(world, p, 1.5);
  updateCounts();
  return true;
}

// A crown of light over a paragon's head.
const CROWN = mat('#8a6a10', '#d0a020', '#ffd24a', '#fff4c0');
function drawParagon(r, c, t) {
  const L = c.life, b = c.body;
  if (!L || !L.paragon) return;
  if (c.crownId == null) { c.crownId = newId(hexToInt('#3a2a04')); EMISSIVE[c.crownId] = 2; }
  const hx = b ? b.x[0] : c.x, hy = b ? b.y[0] : c.y, z = (c.z || c.zBody || 4) + 4;
  for (let k = 0; k < 5; k++) {
    const a = t * 1.3 + k / 5 * TAU;
    if (Math.sin(t * 3 + k * 2) > -0.4) r.dot(hx + Math.cos(a) * 3.2, hy + Math.sin(a) * 3.2, z, CROWN, c.crownId);
  }
}

// ---- keep safe --------------------------------------------------------------------------------------
const isSafe = (c) => !!(c && c.life && c.life.safe);
function toggleSafe(c) {
  if (!c || !c.life) return;
  c.life.safe = !c.life.safe;
  logEvent(world, c.life.safe ? `${c.life.name} is kept safe: it won't be recycled` : `${c.life.name} is no longer kept safe`, c, { cat: 'pond', pri: 1 });
}
