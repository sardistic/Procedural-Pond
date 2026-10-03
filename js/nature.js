'use strict';
// Nature, red in tooth and claw, and turning.
//  - Rage: darkness and corruption make animals aggressive. At night, under a blood moon and in
//    blood rain, predators hunt sooner; and the marked (changed or worse), the feral, the
//    abominations turn on anything smaller than themselves, and pick fights with their equals
//    (the weaker bleeds, and may die of it).
//  - Blood in the water: a red cloud where an animal is caught or hurt, drifting and fading. Hunters
//    smell fresh blood from far off and come to it.
//  - The chase: a hunter closing in leaves a wake of bubbles; its quarry bolts and jinks.
//  - The dice: as one of the marked changes, and when it takes in its own, and sometimes on a red
//    night, it rolls two dice, and its nature warps: it comes to love the dark, turns nocturnal,
//    feral, vast, a hunter, many-eyed, tireless, or withers, or (on double six) becomes an
//    abomination. Each shows as a trait, and changes what it does, what it likes and how it lives.

// ---- the warps ---------------------------------------------------------------------------------------
const WARPS = {
  withered: { roll: [2], color: '#6a6a5a', buffs: { vitality: -0.3 }, note: 'it withered in the change', size: 0.88 },
  nocturnal: { roll: [3, 4], color: '#4a5aa8', buffs: {}, note: 'it keeps the night now, and rests by day' },
  darkloving: { roll: [5, 6], color: '#5a3a7a', buffs: { tolerance: 0.2 }, note: 'it has come to love the dark: carrion, the deep things, the idols, poisoned water' },
  feral: { roll: [7], color: '#c83a2a', buffs: { aggression: 0.6 }, note: 'it turns on anything smaller, and picks fights with its equals' },
  vast: { roll: [8], color: '#a86a3a', buffs: { calming: 0.1 }, note: 'it grew, and keeps growing', size: 1.22 },
  predatory: { roll: [9], color: '#a02a4a', buffs: { aggression: 0.3 }, note: 'it hunts now, whatever it was before' },
  manyeyed: { roll: [10], color: '#8a8a3a', buffs: { intellect: 0.4 }, note: 'eyes opened all along it: it sees in the dark and misses nothing' },
  tireless: { roll: [11], color: '#6a3a3a', buffs: { vitality: 0.3 }, note: 'it never rests' },
  abomination: { roll: [12], color: '#ff2a5a', buffs: { aggression: 0.9, vitality: 0.3 }, note: 'an abomination: vast, feral and in love with the dark', size: 1.35 },
};
const WARP_KEYS = Object.keys(WARPS);
for (const [k, d] of Object.entries(WARPS)) { TRAIT_RARITY[k] = k === 'abomination' ? 3 : 1; RARE_OUTLINE[k] = hexToInt(d.color); TRAIT_BUFFS[k] = d.buffs; TRAIT_NOTES[k] = d.note; }
const hasWarp = (L, k) => !!(L && L.warps && (L.warps.includes(k) || (L.warps.includes('abomination') && (k === 'feral' || k === 'darkloving' || k === 'predatory'))));
// What the warped like: the dark things (in place of what their kind likes).
const DARK_LIKES = ['idol', 'whalefall', 'ossuary', 'spire', 'gate', 'cradle', 'smoker', 'rig', 'weepmoss', 'starweed', 'blackcoral'];

// Roll the dice for one of the marked (or a creature steeped in the dark): its nature warps.
function rollWarp(world, c, why = '') {
  const L = c.life;
  if (!L) return null;
  const a = randi(1, 6), b = randi(1, 6), sum = a + b;
  let k = WARP_KEYS.find((w) => WARPS[w].roll.includes(sum));
  const have = L.warps || [];
  if (have.includes(k)) k = WARP_KEYS.find((w) => !have.includes(w) && w !== 'withered' && w !== 'abomination') || null; // (a warp it already has: the next one)
  if (!k) return null;
  L.warps = WARP_KEYS.filter((w) => w === k || have.includes(w)); // (in a fixed order, as a link carries them)
  const W = WARPS[k];
  if (W.size && SCALABLE.has(c.species) && c.base) {
    L.genome.size = clamp((L.genome.size || 1) * W.size, 0.6, 2.2);
    applyScale(c, L.scale * L.genome.size);
  }
  if (k === 'predatory' || k === 'abomination') L.hunter = true;
  L.traits = eldTraits(L);
  refreshBuffs(c);
  if (c.id && RARE_OUTLINE[k] && (k === 'abomination' || !THICK[c.id])) { OUTLINE[c.id] = RARE_OUTLINE[k]; if (k === 'abomination') THICK[c.id] = 1; }
  logEvent(world, `🎲 ${L.name} the ${describe(c).label} rolled ${a} and ${b}${why ? ` ${why}` : ''}: ${W.note}`, c, { cat: 'rare', pri: k === 'abomination' ? 3 : 2 });
  if (k === 'abomination' && typeof narrate === 'function') narrate(world, 'mark', { name: L.name, subject: c });
  return k;
}

// ---- rage --------------------------------------------------------------------------------------------
// How aggressive an animal is right now: darkness, the sky, corruption and its warps.
function rageOf(world, c) {
  const L = c.life;
  if (!L) return 1;
  const sky = typeof heavensMadness === 'function' ? heavensMadness(world) : 1;
  let k = 1 + 0.35 * (world.darkness || 0) * sky;
  if (L.genome.eld) k += 0.25 + 0.35 * Math.max(0, eldStage(L));
  if (hasWarp(L, 'feral')) k += 0.8;
  if (L.wanderer) k += 0.6;
  return k;
}
// Enraged: it will turn on anything smaller than itself (the marked when changed, in the dark; the feral always).
function enraged(world, c) {
  const L = c.life;
  if (!L || !(c instanceof Fish) || c.dying || c.leaving) return false;
  if (hasWarp(L, 'feral') || L.wanderer) return true;
  return !!L.genome.eld && eldStage(L) >= 1 && (world.darkness || 0) > 0.45;
}
// How broad an animal is at its widest (worked out once a pass: a horde asks it a great deal).
let widthStamp = 0;
const widthOf = (c) => (c.wStamp === widthStamp ? c.wMax : (c.wStamp = widthStamp, c.wMax = c.body ? Math.max(...c.body.w) : 0));
// What an enraged animal will take: anything well smaller, not one of the great ones.
function rageTarget(p, q) {
  if (q === p || !q.life || !p.body || !q.body || (DEEP[q.species] && DEEP[q.species].mythic) || (q.life.genome.eld && eldStage(q.life) >= 1)) return false;
  return widthOf(q) < widthOf(p) * 0.8;
}

// ---- blood -------------------------------------------------------------------------------------------
const BLOOD = mat('#3a0404', '#5a0808', '#7a0e0e', '#a01818');
class Blood {
  constructor(x, y, z, amt) {
    this.x = x; this.y = y; this.z = Math.max(1, z - 1); this.t = 0; this.life = 3 + 3 * amt; this.amt = amt;
    this.p = Array.from({ length: Math.round(8 + 14 * amt) }, () => ({ a: rand(0, TAU), v: rand(2, 7) * (0.5 + amt), r: rand(0.6, 1.4) }));
  }
  update(dt, world) {
    this.t += dt;
    const cur = world && world.current;
    if (cur) { this.x += cur.x * 2 * dt; this.y += cur.y * 2 * dt; }
    return this.t < this.life;
  }
  draw(r) {
    const k = this.t / this.life, spread = 1 - Math.pow(1 - Math.min(1, k * 1.6), 2);
    r.castShadows = false;
    r.alpha = Math.max(0.05, 0.85 * (1 - k));
    for (const q of this.p) r.dot(this.x + Math.cos(q.a) * q.v * spread, this.y + Math.sin(q.a) * q.v * spread, this.z, BLOOD, FX_ID);
    // A faint haze where it's thinning out.
    if (k > 0.2) for (let i = 0; i < this.p.length; i += 2) { const q = this.p[i]; r.dot(this.x + Math.cos(q.a + 0.6) * q.v * spread * 1.6, this.y + Math.sin(q.a + 0.6) * q.v * spread * 1.6, this.z, BLOOD, FX_ID); }
    r.alpha = 1;
    r.castShadows = true;
  }
}
function addBlood(world, x, y, z = 6, amt = 0.6) {
  if (world.shore && isDry(world, x, y)) return;
  if (world.effects.length < 215) world.effects.push(new Blood(x, y, z, amt));
  (world.bloodSpots || (world.bloodSpots = [])).push({ x, y, t: world.t, amt });
  if (world.bloodSpots.length > 12) world.bloodSpots.shift();
}

// ---- the tick ----------------------------------------------------------------------------------------
// However many are in a rage, fights stay rare across the pond: a handful a day, and only a few of
// them to the death; and a red night warps only a few of the marked. (A horde of hundreds of marked
// koi fighting at 8% a second each tore a pond apart overnight.)
const BRAWLS_PER_DAY = 16, BRAWL_KILLS_PER_DAY = 3, WARPS_PER_NIGHT = 4;
const natureDay = (world) => {
  const day = Math.floor(world.days), N = world.natureDay || (world.natureDay = { day, fights: 0, kills: 0, warps: 0 });
  if (N.day !== day) Object.assign(N, { day, fights: 0, kills: 0, warps: 0 });
  return N;
};
let natureTick = 0;
function updateNature(world, dt) {
  // Every frame: the chase. A hunter closing in leaves a wake; its quarry jinks.
  for (const c of world.creatures) {
    const q = c.prey;
    if (!q || q.caught || q.gone || !c.body) continue;
    const d2 = (q.x - c.x) ** 2 + (q.y - c.y) ** 2;
    if (d2 < 3600) {
      if (Math.random() < dt * 6) addBubbles(world, c.body.x[c.body.n - 1], c.body.y[c.body.n - 1], c.z || 6, 1);
      if (q instanceof Fish && Math.random() < dt * 3) q.heading = wrapAngle(q.heading + rand(-0.9, 0.9)); // the quarry bolts and jinks
    }
  }
  natureTick -= dt;
  if (natureTick > 0) return;
  const step = 1 - natureTick;
  natureTick = 1;
  widthStamp++;
  if (world.opts.life === false) return;
  if (typeof updateWanderers === 'function') updateWanderers(world);
  const blood = (world.bloodSpots || []).filter((b) => world.t - b.t < 20);
  world.bloodSpots = blood;
  const N = natureDay(world);
  for (const c of world.creatures) {
    const L = c.life;
    if (!L || c.dying || c.leaving || c.absorbing || c.grabbed) continue;
    // Hunters smell blood: an idle hunter heads for fresh blood in the water.
    if (blood.length && !c.prey && isPredator(c) && L.energy < 0.85) {
      let best = null, bd = (180 * (1 + 0.15 * (typeof huntLv === 'function' ? huntLv(c, 'senses') : 0))) ** 2;
      for (const b of blood) { const d = (b.x - c.x) ** 2 + (b.y - c.y) ** 2; if (d < bd) { bd = d; best = b; } }
      if (best) { c.tx = best.x + rand(-6, 6); c.ty = best.y + rand(-6, 6); c.timer = Math.max(c.timer || 0, 3); }
    }
    // The enraged pick fights with their equals: the weaker bleeds, and may die of it.
    if (N.fights < BRAWLS_PER_DAY && enraged(world, c) && c.body && Math.random() < 0.01 * step * rageOf(world, c)) {
      const w = widthOf(c);
      let foe = null;
      forNear(world, c.x, c.y, 26, (o) => { if (!foe && o !== c && o.life && o.body && !o.dying && !(DEEP[o.species] && DEEP[o.species].mythic) && Math.abs(widthOf(o) - w) < w * 0.35) foe = o; });
      if (foe) {
        N.fights++;
        const score = (x) => (x.life.hp ?? 1) * geneBuffs(x).vitality * rageOf(world, x) * (1 + (x.life.grown || 0)) * rand(0.6, 1.4), loser = score(c) < score(foe) ? c : foe, winner = loser === c ? foe : c;
        const died = hurt(world, loser, 0.3, { why: `torn apart by ${winner.life.name} in the dark`, canKill: N.kills < BRAWL_KILLS_PER_DAY });
        loser.life.comfort = Math.max(0, loser.life.comfort - 0.25);
        addBlood(world, loser.x, loser.y, loser.z || 6, 0.5);
        addRipple(world, loser.x, loser.y, 1, true);
        startle(world, loser, winner.x, winner.y, 1.5);
        if (died) { N.kills++; if (winner.life.wanderer) winner.life.wanderer.kills++; }
        logEvent(world, `${winner.life.name} the ${describe(winner).label} savaged ${loser.life.name} the ${describe(loser).label}`, winner, {
          cat: 'hunt', pri: 1, key: 'brawl', data: 1, merge: (e) => `Fights break out in the dark: ${e.n} animals savaged`,
        });
      }
    }
    // On a red night, one of the marked may roll again.
    const red = typeof heavenNow === 'function' && (heavenNow(world, 'bloodmoon') || heavenNow(world, 'stars') || (typeof bloodRain === 'function' && bloodRain(world)));
    if (red && L.genome.eld && N.warps < WARPS_PER_NIGHT && Math.random() < 0.004 * step) { N.warps++; rollWarp(world, c, 'under the red sky'); }
  }
}
