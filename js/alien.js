'use strict';
// Out past the deep past the water stops being entirely of this world.
//  - Alien artifacts: from the deep past on (rarely at first, oftener the deeper the pond goes),
//    now and then at dawn something comes to rest on the deep floor: a hooked ring, a spiral horn,
//    a glass bloom. A meteor shower can bring one down too. Each carries a strain of parasite and
//    adapts: most dawns its strain gains a generation, and the older it is the more it releases
//    (more at night). It survives: the Net breaks one up, but a shard often lingers and regrows.
//  - Parasites: small, bright, wrongly shaped things, each kind its own colour and shape: the
//    latcher (magenta, hooked), the coilworm (a cyan spiral) and the sporeling (a lime cluster).
//    They drift toward animals and latch on, riding them: each gives its host something and costs
//    it something, spreads its own contagion, breeds in its host, and when its host dies (or is
//    eaten, or leaves) it jumps off, or into whatever ate it. A strain grows older as it passes on.
//  - Contagions: glassing (the latcher's: the skin crystallizes, hard but short-lived), xenofever
//    (the coilworm's: restless, it may leave) and spore (the sporeling's: it passes to any kind by
//    touch; its host slows and sickens). Dawn clears some.
//  - The evolved: very rarely, an animal that has carried an old strain (third generation or
//    later) for a day gives rise to something new: a young of its kind with one of the parasite's
//    traits in its blood for good (chitinous, frenzied, luminous, long-coiled, bloomborn,
//    spore-bearing). It's Mythic, and it passes the trait on.
//  - The quarantine lamp (a build, from the Devonian on): nothing latches on, spreads or breeds in
//    its light, and larvae there die.

// ---- the kinds -------------------------------------------------------------------------------------------
const PARASITES = {
  latcher: {
    label: 'latcher', thing: 'hooked ring', trait: 'latched', ill: 'glassing', xeno: ['chitinous', 'frenzied'], color: '#ff3ad8',
    buffs: { aggression: 0.3, vitality: -0.1 }, note: 'a latcher has hooked into it: it is quick to anger, and glassing where the hooks went in',
    m: mat('#6a0a4a', '#b01a82', '#ff3ad8', '#ffb0f0'),
  },
  coilworm: {
    label: 'coilworm', thing: 'spiral horn', trait: 'coiled', ill: 'xenofever', xeno: ['luminous', 'longcoiled'], color: '#3af0ff',
    buffs: { light: 0.35, longevity: -0.2 }, note: 'a coilworm winds about it: it glows, and burns out sooner',
    m: mat('#0a4a6a', '#1a8ab0', '#3af0ff', '#c0ffff'),
  },
  sporeling: {
    label: 'sporeling', thing: 'glass bloom', trait: 'sporing', ill: 'spore', xeno: ['bloomborn', 'sporebearing'], color: '#9aff3a',
    buffs: { fertility: 0.25, vitality: -0.2 }, note: 'sporelings bud on it: it breeds more, and sickens',
    m: mat('#2a4a0a', '#5a8a1a', '#9aff3a', '#e4ffb0'),
  },
  // The second three (append only), each drawn in one of the first three's shapes, spreading one of their contagions.
  lamprite: {
    label: 'lamprite', thing: 'toothed crown', trait: 'gnawed', ill: 'glassing', xeno: ['ironclad', 'ravenous'], color: '#ffb03a', shape: 'latcher',
    buffs: { vitality: 0.2, speed: -0.1 }, note: 'a lamprite has its teeth in it: it feeds harder to keep up, and slows',
    m: mat('#6a3a0a', '#b06a14', '#ffb03a', '#ffe0a0'),
  },
  wisp: {
    label: 'wisp', thing: 'singing shell', trait: 'haunted', ill: 'xenofever', xeno: ['farseeing', 'serene'], color: '#b07aff', shape: 'coilworm',
    buffs: { intellect: 0.3, aggression: -0.15 }, note: 'a wisp coils through it: it sees further and fights less, and dreams of leaving',
    m: mat('#3a1a6a', '#6a3ab0', '#b07aff', '#e8d8ff'),
  },
  mirrormold: {
    label: 'mirror mold', thing: 'mirror egg', trait: 'mirrored', ill: 'spore', xeno: ['unseen', 'twinning'], color: '#e8f0ff', shape: 'sporeling',
    buffs: { stealth: 0.35, fertility: -0.15 }, note: 'mirror mold silvers its skin: hard to see, and slower to breed',
    m: mat('#5a6a7a', '#9aaabb', '#e8f0ff', '#ffffff'),
  },
};
// The shape a kind is drawn in.
const paraShape = (k) => (PARASITES[k] && PARASITES[k].shape) || k;
const PARA_KEYS = Object.keys(PARASITES);
// What the evolved carry in their blood: genome.xeno is this list's index + 1 (append-only).
const XENO_TRAITS = ['chitinous', 'frenzied', 'luminous', 'longcoiled', 'bloomborn', 'sporebearing', 'ironclad', 'ravenous', 'farseeing', 'serene', 'unseen', 'twinning'];
const XENO = {
  chitinous: { color: '#ff6ae0', buffs: { vitality: 0.4, resilience: 0.3 }, note: 'evolved: plates of alien chitin; hard to hurt, hard to kill' },
  frenzied: { color: '#ff3a6a', buffs: { aggression: 0.5, speed: 0.12 }, note: 'evolved: an alien fury in its blood' },
  luminous: { color: '#6af0ff', buffs: { light: 0.6, intellect: 0.2 }, note: 'evolved: it shines with a light from somewhere else' },
  longcoiled: { color: '#3ac8ff', buffs: { longevity: 0.6 }, note: 'evolved: the coil in its blood keeps it going and going' },
  bloomborn: { color: '#b0ff5a', buffs: { fertility: 0.5 }, note: 'evolved: it breeds like the spores it came from' },
  sporebearing: { color: '#7aff3a', buffs: { tolerance: 0.4 }, note: 'evolved: it carries the spore, and takes no harm from it' },
  ironclad: { color: '#ffb03a', buffs: { resilience: 0.5, vitality: 0.2 }, note: 'evolved: a crown of alien teeth grown into armour' },
  ravenous: { color: '#ff8a2a', buffs: { aggression: 0.3, vitality: 0.3 }, note: 'evolved: a hunger from somewhere else' },
  farseeing: { color: '#c09aff', buffs: { intellect: 0.5 }, note: 'evolved: it sees what is not there yet' },
  serene: { color: '#9a8aff', buffs: { aggression: -0.3, longevity: 0.3 }, note: 'evolved: an alien calm, and a long life' },
  unseen: { color: '#e8f0ff', buffs: { stealth: 0.6 }, note: 'evolved: a mirrored skin that shows only the water' },
  twinning: { color: '#f0f8ff', buffs: { fertility: 0.4, luck: 0.2 }, note: 'evolved: its young come in mirrored pairs' },
};
const XENO_OF = Object.fromEntries(PARA_KEYS.flatMap((k) => PARASITES[k].xeno.map((x) => [x, k]))); // trait -> the parasite it came from
for (const [k, d] of Object.entries(PARASITES)) { TRAIT_RARITY[d.trait] = 0; RARE_OUTLINE[d.trait] = hexToInt(d.color); TRAIT_BUFFS[d.trait] = d.buffs; TRAIT_NOTES[d.trait] = d.note; }
for (const [k, d] of Object.entries(XENO)) { TRAIT_RARITY[k] = 8; RARE_OUTLINE[k] = hexToInt(d.color); TRAIT_BUFFS[k] = d.buffs; TRAIT_NOTES[k] = d.note; }
const hasXeno = (L, k) => !!(L && L.genome && L.genome.xeno && XENO_TRAITS[L.genome.xeno - 1] === k);

// The trait young inherit (the sixth gene stream, by seed, so a baby's genes still follow from its parents).
function childXeno(a, b) {
  const x = a.xeno || 0, y = b.xeno || 0;
  if (!x && !y) return { xeno: 0 };
  if (x && y && x === y) return { xeno: Math.random() < 0.85 ? x : 0 };
  const one = x && y ? (Math.random() < 0.5 ? x : y) : x || y;
  return { xeno: Math.random() < 0.5 ? one : 0 };
}

// ---- where they are ----------------------------------------------------------------------------------------
const XENO_MAX = 6, LARVA_MAX = 30;
const xenoState = (world) => { world.xeno = world.xeno || []; world.parasites = world.parasites || []; world.xenoShards = world.xenoShards || []; return world; };
const xenoAt = (world, x, y) => (world.xeno || []).find((a) => Math.hypot(a.x - x, a.y - y) < 10 * xenoScale(a));
const xenoScale = (a) => Math.min(1.6, 1 + 0.08 * a.gen);
// In a quarantine lamp's light: nothing latches on, spreads or breeds.
const quarantined = (world, x, y) => (world.structures || []).some((s) => s.kind === 'quarantine' && !s.anim && Math.hypot(s.x - x, s.y - y) < STRUCTURES.quarantine.r * (1 + 0.15 * ((s.lv && s.lv.reach) || 0)));

function xenoSpot(world) {
  let best = null, bd = -1;
  for (let i = 0; i < 60; i++) {
    const x = rand(20, world.W - 20), y = rand(20, world.H - 20), d = depthAt(world, x, y);
    if (world.shore && isDry(world, x, y)) continue;
    if ((world.structures || []).some((s) => Math.hypot(s.x - x, s.y - y) < 30)) continue;
    if (d >= 0.55) return [x, y];
    if (d > bd) { bd = d; best = [x, y]; }
  }
  return best || [world.W / 2, world.H / 2];
}

// Something comes to rest on the floor.
function landXeno(world, x, y, why, kind = pick(PARA_KEYS), gen = 1) {
  xenoState(world);
  if (world.xeno.length >= XENO_MAX) return null;
  if (x == null) [x, y] = xenoSpot(world);
  const a = { x, y, kind, gen, born: world.days, seed: randi(0, 99999) };
  world.xeno.push(a);
  if (world.game) world.game.alienFound = true; // (the pond is a little alien from now on: character.js)
  addRipple(world, x, y, 2, true);
  addBubbles(world, x, y, 2, 6);
  for (const o of world.creatures) if (o.life && Math.hypot(o.x - x, o.y - y) < 90) startle(world, o, x, y, 2);
  if (typeof Sound !== 'undefined' && Sound.omen) Sound.omen(x, y);
  logEvent(world, `✦ Something not of this world has come to rest in the deep${why ? ` (${why})` : ''}: a ${PARASITES[kind].thing}. Things move inside it`, null, { cat: 'rare', pri: 3 });
  if (typeof narrate === 'function') narrate(world, 'alien', { thing: PARASITES[kind].thing });
  return a;
}

// The Net breaks one up (pearls and essence for it), but a shard often lingers and regrows.
function breakXeno(world, a) {
  xenoState(world);
  world.xeno.splice(world.xeno.indexOf(a), 1);
  const pts = award(world, 60 + 20 * a.gen, 'alien artifacts'), ess = gainEssence(world, 10 + 5 * a.gen, 'alien artifacts');
  addBubbles(world, a.x, a.y, 2, 8);
  const shard = Math.random() < 0.3;
  if (typeof tributeFromBreak === 'function') tributeFromBreak(world, a); // (now and then, inside: the tribute (imps.js))
  if (shard) world.xenoShards.push({ x: a.x, y: a.y, kind: a.kind, gen: a.gen, at: world.days + rand(2, 4) });
  logEvent(world, `You broke up the ${PARASITES[a.kind].thing} · +${pts} points, +${ess} essence${shard ? '. A shard of it lies there still' : ''}`, null, { cat: 'pond', pri: 2 });
  if (typeof floatAward === 'function') floatAward(a.x, a.y, `+${pts}`);
}

// ---- parasites --------------------------------------------------------------------------------------------
function releaseLarva(world, x, y, kind, gen) {
  xenoState(world);
  if (world.parasites.length >= LARVA_MAX || quarantined(world, x, y)) return null;
  const p = { x, y, z: rand(4, 14), kind, gen: Math.min(9, gen), t: 0, h: rand(-PI, PI), ph: rand(0, TAU) };
  world.parasites.push(p);
  return p;
}
// Who a parasite can ride: a living animal with a body, not one of the great ones, not already ridden,
// and not one whose blood already carries its kind (the evolved are immune to their own).
const hostable = (o, kind) => o.life && o.body && !o.dying && !o.leaving && !o.caught && !o.gone && !o.life.para && !(DEEP[o.species] && DEEP[o.species].mythic)
  && !(o.life.genome.xeno && XENO_OF[XENO_TRAITS[o.life.genome.xeno - 1]] === kind);
function attach(world, o, kind, gen, why = '') {
  const L = o.life;
  L.para = { k: kind, gen, since: world.days };
  L.traits = eldTraits(L);
  refreshBuffs(o);
  logEvent(world, `A ${PARASITES[kind].label} has latched onto ${who(o)}${why}`, o, {
    cat: 'life', pri: 1, key: `para:${kind}`, data: 1, merge: (e) => `${e.n} animals have picked up ${PARASITES[kind].label}s`,
  });
}
function detach(o) {
  const L = o.life;
  if (!L || !L.para) return null;
  const p = L.para;
  L.para = null;
  L.traits = eldTraits(L);
  refreshBuffs(o);
  return p;
}
// Too many ridden and the parasites run short of hosts: at most about a quarter of the pond.
const hostShare = (world) => { let n = 0, h = 0; for (const c of world.creatures) if (c.life) { n++; if (c.life.para) h++; } return n ? h / n : 0; };

// ---- the tick ---------------------------------------------------------------------------------------------
let alienTick = 0;
function updateAlien(world, dt) {
  xenoState(world);
  const P = world.parasites, room = P.length && hostShare(world) < 0.25; // (worked out once a frame, not per larva)
  // Every frame: larvae drift, seek a host, and latch on.
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.t += dt;
    let host = null, hd = 90 * 90;
    if (room) forNear(world, p.x, p.y, 90, (o, d2) => { if (d2 < hd && hostable(o, p.kind)) { hd = d2; host = o; } });
    if (host) p.h = Math.atan2(host.y - p.y, host.x - p.x) + Math.sin(p.t * 3 + p.ph) * 0.4;
    else p.h += (Math.sin(p.t * 0.7 + p.ph) * 0.8) * dt;
    const sp = host ? 9 : 4;
    p.x = clamp(p.x + Math.cos(p.h) * sp * dt + world.current.x * dt, 2, world.W - 2);
    p.y = clamp(p.y + Math.sin(p.h) * sp * dt + world.current.y * dt, 2, world.H - 2);
    if (host && hd < (Math.max(...host.body.w) + 2) ** 2 && !quarantined(world, host.x, host.y)) { attach(world, host, p.kind, p.gen); P.splice(i, 1); continue; }
    if (p.t > 120 || quarantined(world, p.x, p.y)) P.splice(i, 1); // (no host in time, or in the lamp's light: it dies)
  }
  alienTick -= dt;
  if (alienTick > 0) return;
  const step = 1 - alienTick;
  alienTick = 1;
  if (world.opts.life === false) return;
  const night = (world.darkness || 0) > 0.5;
  // The artifacts release their strain (more as they age, more at night), once they've settled.
  for (const a of world.xeno) {
    if (world.days - a.born < 0.3) continue;
    if (Math.random() < 0.0025 * (1 + 0.25 * a.gen) * (night ? 2 : 1) * step) releaseLarva(world, a.x + rand(-6, 6), a.y + rand(-6, 6), a.kind, a.gen);
  }
  for (const c of world.creatures) {
    const L = c.life;
    if (!L) continue;
    // A host dying, leaving or gone: its parasite jumps off (it survives its host).
    if (L.para && (c.dying || c.leaving || c.gone)) { const p = detach(c); releaseLarva(world, c.x, c.y, p.k, p.gen); continue; }
    if (c.dying || c.leaving || c.absorbing) continue;
    if (L.para) {
      const k = L.para.k, D = PARASITES[k], q = quarantined(world, c.x, c.y);
      L.energy = Math.max(0, L.energy - 0.0015 * step); // it feeds
      // In the lamp's light it lets go, now and then.
      if (q && Math.random() < 0.02 * step) { detach(c); logEvent(world, `The quarantine lamp drove a ${D.label} off ${who(c)}`, c, { cat: 'life', key: 'para-off', merge: (e) => `The quarantine lamp drove off ${e.n} parasites` }); continue; }
      // It breeds in its host, and the strain grows older as it passes on.
      if (!q && Math.random() < 0.0008 * (1 + 0.2 * L.para.gen) * (night ? 1.5 : 1) * (typeof landAlienRate === 'function' ? landAlienRate(world, c) : 1) * step) releaseLarva(world, c.x, c.y, k, L.para.gen + (Math.random() < 0.5 ? 1 : 0));
      // Its contagion.
      if (!q && Math.random() < 0.004 * step) infect(world, c, D.ill, `from its ${D.label}`);
    }
    // The contagions spread, and do what they do.
    const ills = L.ill || [];
    if (!ills.length || quarantined(world, c.x, c.y)) continue;
    const spore = ills.includes('spore'), fever = ills.includes('xenofever'), glass = ills.includes('glassing');
    if (!spore && !fever && !glass) continue;
    if (fever && Math.random() < 0.001 * step && !lastFew(world, c)) { c.leaving = true; c.leaveWhy = 'feverish'; }
    if (spore && L.buffs.vitality < 0.8 && Math.random() < 0.0004 * step && !hasXeno(L, 'sporebearing') && !lastFew(world, c)) c.dying = { t: 0, why: 'of the spore' };
    forNear(world, c.x, c.y, 14, (o, d2) => {
      if (o === c || !o.life || o.dying) return;
      if (spore && d2 < 64 && !hasXeno(o.life, 'sporebearing') && Math.random() < 0.0015 * step) infect(world, o, 'spore', `from ${L.name}`);
      if (fever && d2 < 100 && o.species === c.species && Math.random() < 0.0012 * step) infect(world, o, 'xenofever', `from ${L.name}`);
      if (glass && d2 < 64 && o.species === c.species && Math.random() < 0.0008 * step) infect(world, o, 'glassing', `from ${L.name}`);
    });
  }
}

// Each dawn: artifacts adapt; a shard may have regrown; one may come to rest; and, very rarely, the evolved.
function dawnAlien(world) {
  xenoState(world);
  const tier = (world.erosion && world.erosion.tier) || 0;
  for (const a of world.xeno) if (a.gen < 9 && Math.random() < 0.4) a.gen++;
  for (let i = world.xenoShards.length - 1; i >= 0; i--) {
    const s = world.xenoShards[i];
    if (world.days < s.at) continue;
    world.xenoShards.splice(i, 1);
    if (landXeno(world, s.x, s.y, 'it grew back from a shard', s.kind, s.gen + 1)) break;
  }
  if (tier >= 9 && Math.random() < Math.min(0.14, 0.015 + 0.02 * (tier - 9))) landXeno(world); // (sparingly)
  if (typeof dawnTribute === 'function') dawnTribute(world);
  // The evolved: from a host that has carried an old strain for a day or more (one a dawn at most).
  const ready = world.creatures.filter((c) => c.life && c.life.para && c.life.para.gen >= 3 && world.days - c.life.para.since >= 0.8 && !c.dying && !c.leaving
    && c.make && c.make !== 'tadpole' && CREATE[c.make] && !(DEEP[c.species] && DEEP[c.species].mythic));
  // (One roll a dawn for the whole pond, better with an older strain: super rare, not one per host.)
  if (ready.length) {
    const top = Math.max(...ready.map((h) => h.life.para.gen));
    if (Math.random() < Math.min(0.08, 0.02 * (top - 2))) evolveFrom(world, pick(ready.filter((h) => h.life.para.gen === top)));
  }
}

// Something new, from a host and its parasite: a young of its kind with one of the parasite's traits for good.
function evolveFrom(world, h) {
  const P = PARASITES[h.life.para.k], trait = pick(P.xeno);
  const c = makeCreature(h.make, world, h.x + rand(-6, 6), h.y + rand(-6, 6), h.species === 'wild' ? { sp: h.sp } : {});
  const g = childGenomeFor(c.seed, h.life.genome, h.life.genome);
  g.xeno = XENO_TRAITS.indexOf(trait) + 1;
  initLife(c, { genome: g, parents: [h.seed, h.seed], gen: (h.life.gen || 0) + 1, scale: 0.5, age: 0, alpha: 0 });
  world.creatures.push(c);
  noteBorn(world, c, 'born');
  if (typeof ECO !== 'undefined') ECO.births++;
  if (c.id) { OUTLINE[c.id] = hexToInt(XENO[trait].color); THICK[c.id] = 1; }
  addBubbles(world, c.x, c.y, 4, 8);
  if (typeof Sound !== 'undefined' && Sound.omen) Sound.omen(c.x, c.y);
  logEvent(world, `✦ Evolved! ${h.life.name} the ${describe(h).label}, ridden by a ${P.label} of the ${ordinal(h.life.para.gen)} generation, has given rise to something new: ${c.life.name}, ${trait}, and it can pass it on`, c, { cat: 'rare', pri: 3 });
  scoreRare(world, c, tierOf(c.life.traits), 'born');
  if (typeof narrate === 'function') narrate(world, 'evolved', { name: c.life.name, trait }, true);
  return c;
}
const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

// Eaten with a parasite in it: the parasite goes into whatever ate it.
function paraEaten(world, eater, prey) {
  if (!prey.life || !prey.life.para || !eater.life) return;
  const p = detach(prey);
  if (hostable(eater, p.k) && !quarantined(world, eater.x, eater.y)) attach(world, eater, p.k, p.gen, `, from the ${describe(prey).label} it ate`);
  else releaseLarva(world, prey.x, prey.y, p.k, p.gen);
}

// ---- the look ------------------------------------------------------------------------------------------------
const XENO_IDS = {};
const xenoId = (k) => XENO_IDS[k] || (XENO_IDS[k] = (() => { const id = newId(outlineOf(PARASITES[k].m)); EMISSIVE[id] = 2; return id; })());
function drawXeno(r, world, t, rect) {
  const A = world.xeno, P = world.parasites;
  if ((!A || !A.length) && (!P || !P.length) && !(world.xenoShards && world.xenoShards.length)) return;
  const [x0, y0, x1, y1] = rect || [0, 0, world.W, world.H];
  const inView = (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
  for (const a of A || []) {
    if (!inView(a.x, a.y, 30)) continue;
    const D = PARASITES[a.kind], m = D.m, id = xenoId(a.kind), k = xenoScale(a), pulse = 0.5 + 0.5 * Math.sin(t * 1.3 + a.seed);
    if (paraShape(a.kind) === 'latcher') { // a tilted ring with hooks turned inward
      for (let i = 0; i < 14; i++) { const u = i / 14 * TAU, x = a.x + Math.cos(u) * 8 * k, y = a.y + Math.sin(u) * 4.5 * k; r.ellipsoid(x, y, 1.6 * k, 1.6 * k, u, 2 + Math.sin(u) * 3 * k, 1.4 * k, m, id); }
      for (let i = 0; i < 4; i++) { const u = i / 4 * TAU + t * 0.1, x = a.x + Math.cos(u) * 8 * k, y = a.y + Math.sin(u) * 4.5 * k; r.tube(x, y, 0.6 * k, 3, a.x + Math.cos(u) * 4 * k, a.y + Math.sin(u) * 2.2 * k, 0.3, 4 + pulse, 0.8, m, id); }
    } else if (paraShape(a.kind) === 'coilworm') { // a spiral horn: a coil lying on the floor, winding in to a point that stands up
      let px = a.x + 9 * k, py = a.y, pz = 1;
      for (let i = 1; i <= 22; i++) { const f = i / 22, u = f * TAU * 2.4 + a.seed, R = (1 - 0.92 * f) * 9 * k, nx = a.x + Math.cos(u) * R, ny = a.y + Math.sin(u) * R, nz = 1 + f * f * 9 * k; r.tube(px, py, (2.3 - 1.7 * f) * k, pz, nx, ny, (2.2 - 1.7 * f) * k, nz, 0.7, m, id); px = nx; py = ny; pz = nz; }
    } else { // a bloom of glass shards
      for (let i = 0; i < 7; i++) { const u = i / 7 * TAU + a.seed, L = (6 + (i % 3) * 3) * k; r.tube(a.x, a.y, 1.4 * k, 1, a.x + Math.cos(u) * L * 0.5, a.y + Math.sin(u) * L * 0.5, 0.4, L, 0.8, m, id); }
      r.ellipsoid(a.x, a.y, 3 * k, 3 * k, 0, 0, 2.5 * k, m, id);
    }
  }
  for (const s of world.xenoShards || []) if (inView(s.x, s.y, 10)) r.ellipsoid(s.x, s.y, 1.6, 1, s.x, 0, 1, PARASITES[s.kind].m, xenoId(s.kind));
  for (const p of P || []) {
    if (!inView(p.x, p.y, 6)) continue;
    const m = PARASITES[p.kind].m, id = xenoId(p.kind);
    if (paraShape(p.kind) === 'latcher') { r.dot(p.x, p.y, p.z, m, id); for (let i = 0; i < 4; i++) { const u = i / 4 * TAU + p.t * 2; r.dot(p.x + Math.cos(u) * 1.4, p.y + Math.sin(u) * 1.4, p.z, m, id); } }
    else if (paraShape(p.kind) === 'coilworm') r.tube(p.x, p.y, 0.6, p.z, p.x - Math.cos(p.h + Math.sin(p.t * 6) * 0.6) * 3, p.y - Math.sin(p.h + Math.sin(p.t * 6) * 0.6) * 3, 0.4, p.z, 0.8, m, id);
    else for (let i = 0; i < 3; i++) { const u = i / 3 * TAU + p.ph; r.ellipsoid(p.x + Math.cos(u) * 0.9, p.y + Math.sin(u) * 0.9, 0.8, 0.8, 0, p.z, 0.8, m, id); }
  }
}
// A parasite riding its host, and the marks of the evolved (from drawQuirks).
function drawPara(r, c, t) {
  const L = c.life, b = c.body, z = (c.zBody ?? c.z ?? 1) + 1;
  if (L.para) {
    const m = PARASITES[L.para.k].m, id = xenoId(L.para.k), i = Math.min(2, b.n - 1), w = b.w[i], x = b.x[i], y = b.y[i], zz = z + w * 0.9;
    if (paraShape(L.para.k) === 'latcher') { r.ellipsoid(x, y, 1.3, 1.3, 0, zz, 1, m, id); for (const s of [-1, 1]) r.tube(x, y, 0.4, zz, b.px(i, s * 1.3, 0), b.py(i, s * 1.3, 0), 0.3, zz - 0.5, 0.8, m, id); }
    else if (paraShape(L.para.k) === 'coilworm') for (let j = 1; j < Math.min(b.n - 1, 6); j++) { const s = j % 2 ? 1 : -1; r.dot(b.px(j, s * 1.2, 0), b.py(j, s * 1.2, 0), z + b.w[j] * 0.8, m, id); }
    else for (let j = 0; j < 3; j++) r.ellipsoid(b.px(i, (j - 1) * 0.9, -0.3), b.py(i, (j - 1) * 0.9, -0.3), 0.9, 0.9, 0, zz, 0.8, m, id);
  }
  const x = L.genome.xeno ? XENO_TRAITS[L.genome.xeno - 1] : null;
  if (x) {
    const m = PARASITES[XENO_OF[x]].m, id = xenoId(XENO_OF[x]);
    for (let j = 1; j < b.n; j += 2) if (Math.sin(t * 1.5 + j + c.phase) > -0.2) r.dot(b.x[j], b.y[j], z + b.w[j] * 0.9, m, id);
  }
}
// Their light in the dark (depths.js).
function xenoLights(M, world, big) {
  for (const a of world.xeno || []) splat(M, a.x, a.y, 20 * xenoScale(a), hexToInt(PARASITES[a.kind].color), 0.7, 0, 0, big);
}
function xenoTipAt(world, x, y) {
  const a = xenoAt(world, x, y);
  if (a) { const D = PARASITES[a.kind]; return `An alien artifact: the ${D.thing}\nNot of this world. It releases ${D.label}s (${a.gen > 1 ? `an old strain, ${ordinal(a.gen)} generation` : 'a young strain'}), more at night and as it ages; they ride your animals and spread ${ILLS[D.ill].name}. The Net breaks it up (points and essence), but a shard may grow back. A quarantine lamp keeps them off.`; }
  const p = (world.parasites || []).find((q) => Math.hypot(q.x - x, q.y - y) < 4);
  if (p) { const D = PARASITES[p.kind]; return `A ${D.label}\nA parasite, drifting toward a host: it rides an animal, feeds on it, spreads ${ILLS[D.ill].name}, and breeds. Something new can come of an old strain.`; }
  return null;
}

// ---- the quarantine lamp ---------------------------------------------------------------------------------------
Object.assign(STRUCTURES, {
  quarantine: {
    label: 'Quarantine lamp', pearls: 1800, essence: 150, r: 70, size: 8, wet: true, tier: 10,
    desc: 'a cold violet light on a post: parasites let go in it, don\'t latch on, spread or breed, and larvae in it die',
    aura: { comfort: 0.03 },
  },
});
const QM = { post: mat('#2a2a3a', '#44445a', '#666680', '#9090a8'), lamp: mat('#6a4aa0', '#a080e0', '#d8c8ff', '#ffffff') };
BUILD.quarantine = (s) => { s.h = rand(12, 15); };
BAKE.quarantine = (r, s, next) => {
  const id = next(QM.post);
  r.ellipsoid(s.x, s.y, 4, 4, 0, 0, 1.5, QM.post, id);
  r.tube(s.x, s.y, 1.1, 1, s.x + 0.5, s.y - 0.5, 0.8, s.h, 0.8, QM.post, id);
};
DRAW.quarantine = (r, s, t) => {
  if (s.lampId == null) { s.lampId = newId(outlineOf(QM.lamp)); EMISSIVE[s.lampId] = 2; }
  r.ellipsoid(s.x + 0.5, s.y - 0.5, 2.2, 2.2, 0, s.h + 1 + 0.3 * Math.sin(t * 2), 2, QM.lamp, s.lampId);
};
STRUCT_CODES.push('quarantine');
if (typeof LIGHT_STRUCTS !== 'undefined') LIGHT_STRUCTS.quarantine = { r: 40, col: '#d8c8ff', k: 0.7 };
