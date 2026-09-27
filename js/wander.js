'use strict';
// Wanderers: now and then a fierce animal that leaves one pond turns up in another along the
// shared beach, and terrorizes the natives for a day or so before it moves on again.
//  - Fierce: a hunter by nature (the deep's sharks and their like), one woken to the hunt or
//    built up in it, the feral, the predatory and the abominations, and the deeply marked.
//  - When one of them leaves a pond that has a link (someone's pond, on the server), it may
//    join the server's pool. A pond calls one up at dawn, rarely, from those that can live in
//    its water (never its own). The server keeps them a fortnight.
//  - A wanderer arrives in a ring of scattering natives, enraged: it hunts anything smaller and
//    fights its equals whatever the hour. It keeps count of its kills, and when its time is up
//    it moves on, and may go on to terrorize another pond.

const WANDER_ODDS = 0.06;  // a dawn's chance of calling one up
const WANDER_SEND = 0.7;   // the chance a fierce animal leaving joins the pool

function fierce(c) {
  const L = c.life;
  if (!L || !c.make || c.make === 'wild' || c.species === 'tadpole' || !CREATE[c.make]) return false;
  if (DEEP[c.species] && DEEP[c.species].mythic) return false; // (the great ones stay where they rose)
  if (L.wanderer) return true;
  const hunt = Object.values(L.hunt || {}).reduce((a, b) => a + b, 0);
  return (isPredator(c) && (DEEP_PREDATORS.has(c.species) || L.hunter || hunt >= 4))
    || hasWarp(L, 'feral') || hasWarp(L, 'predatory') || (L.genome.eld && eldStage(L) >= 2);
}

// A fierce animal leaving a pond: off into the pool, perhaps.
function sendWanderer(world, c) {
  if (typeof Net === 'undefined' || !Net.base || world.observe || !world.link || !world.link.id || !fierce(c) || Math.random() > WANDER_SEND) return;
  const r = creatureRecord(c);
  r.L.kills = c.life.wanderer ? c.life.wanderer.kills : 0;
  api('POST', '/wanderers', { pond: world.link.id, w: { k: r.k, s: r.s, L: r.L } }, world.link.key).catch(() => {});
}

// Each dawn, rarely: call one up.
async function callWanderer(world, force = false) {
  if (typeof Net === 'undefined' || !Net.base || world.observe || !world.link || !world.link.id || world.opts.life === false) return null;
  if (!force && (Math.random() > WANDER_ODDS || world.creatures.filter((c) => c.life && !c.leaving).length < 6)) return null;
  const kinds = Object.keys(SPECIES).filter((k) => k !== 'wild' && CREATE[k] && fitsHabitat(world, SPECIES_HABITAT[k]) && (!DEEP[k] || (!DEEP[k].mythic && deepAvailable(world, k))));
  let res;
  try { res = await api('POST', '/wanderers/take', { pond: world.link.id, kinds }); } catch { return null; }
  return res && res.w ? arriveWanderer(world, res.w) : null;
}

function arriveWanderer(world, w) {
  if (!CREATE[w.k] || !w.L || !w.L.genome) return null;
  const need = DEEP[w.k] && DEEP[w.k].deepMin;
  const [x, y] = need ? deepSpot(world, w.k) : [rand(world.W * 0.2, world.W * 0.8), rand(world.H * 0.2, world.H * 0.8)];
  let c;
  try {
    c = restoreCreature(world, { k: w.k, s: w.s, x, y, h: rand(-PI, PI), z: 6, L: { ...w.L, energy: 0.55, cooldown: 90, comfort: 0.4, parents: null, wanderer: null } });
  } catch { return null; }
  c.life.wanderer = { from: String(w.from || '').slice(0, 40), by: w.by ? String(w.by).slice(0, 32) : null, came: world.days, until: world.days + rand(0.7, 1.6), kills: 0, before: w.L.kills || 0 };
  if (c.id) { OUTLINE[c.id] = WANDER_OUTLINE; THICK[c.id] = 1; }
  c.alpha = 0;
  world.creatures.push(c);
  noteBorn(world, c, 'arrived');
  // The natives scatter; the water churns where it came in.
  for (const o of world.creatures) if (o !== c && o.life && Math.hypot(o.x - c.x, o.y - c.y) < 150) startle(world, o, c.x, c.y, rand(2, 4));
  addRipple(world, c.x, c.y, 3);
  addBubbles(world, c.x, c.y, 6, 8);
  if (typeof Sound !== 'undefined' && Sound.omen) Sound.omen(c.x, c.y);
  const W = c.life.wanderer, label = describe(c).label;
  logEvent(world, `⚔ ${c.life.name} the ${label} has come over from ${W.from}${W.by ? ` (${W.by}'s pond)` : ''}${W.before ? `, ${W.before} kills behind it` : ''}. The natives scatter`, c, { cat: 'rare', pri: 3 });
  if (typeof narrate === 'function') narrate(world, 'wanderer', { name: c.life.name, label: label.toLowerCase(), from: W.from }, true);
  return c;
}

// A wanderer's time is up: it moves on (and on leaving may go on to another pond).
function updateWanderers(world) {
  for (const c of world.creatures) {
    const W = c.life && c.life.wanderer;
    if (!W || c.leaving || c.dying || world.days < W.until) continue;
    c.leaving = true;
    c.leaveWhy = 'wandered on';
    logEvent(world, `${c.life.name} the ${describe(c).label} moves on, back along the beach${W.kills ? `, ${W.kills} of yours the fewer` : ''}`, c, { cat: 'come', pri: 2 });
  }
}
