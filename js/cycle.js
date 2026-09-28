'use strict';
// The cycle: what dies or is thrown away is taken up again, and the pond keeps growing.
//  - Detritus: bits of dead plant, picked-over carcass and old food left on the floor. Scavengers
//    (crabs, snails, shrimp, isopods, catfish, starfish, hermit crabs, crayfish, loaches, plecos,
//    amphipods, the cave and crypt crabs, sea spiders, trilobites, root crawlers) seek it out and eat
//    it: it feeds them, and what they don't keep goes back into the floor as richness (land.js), so
//    plants grow better where scavengers work. What nobody eats rots into the floor, slower.
//  - Litter, taken up: hermit crabs, octopuses and crayfish move into bottles and cans (one less
//    piece of litter, and a home); small scavengers pick ghost nets apart; an old tyre left long
//    enough grows over into a little reef.
//  - The pond keeps growing: a little further out each dawn, faster the deeper it has gone and the
//    more it has scored, in steps of a few dozen pixels (and a big step when a new depth opens).

const DETRITUS_MAX = 180;
const SCAVENGE = new Set(['crab', 'isopod', 'snail', 'catfish', 'starfish', 'shrimp', 'hermit', 'crayfish', 'loach', 'pleco', 'amphipod', 'cavecrab',
  'cryptcrab', 'seaspider', 'trilobite', 'rootcrawler']);
const DETRITUS_MAT = {
  life: mat('#1e1a0e', '#342c18', '#4a3e22', '#62542e'), bone: mat('#6a6254', '#948a78', '#bab09c', '#dcd4c2'),
  dark: mat('#0a0610', '#16101e', '#241a30', '#342642'), light: mat('#6a6a2a', '#9a9a44', '#c8c86a', '#eeee9a'),
  alien: mat('#4a1060', '#7a2090', '#a83ac0', '#d070e8'),
};
let DETRITUS_ID = 0;
for (const k of SCAVENGE) LIKES[k] = [...(LIKES[k] || []), 'detritus'];
LIKE_LABEL.detritus = 'detritus to pick over';

// ---- detritus ------------------------------------------------------------------------------------------------
function dropDetritus(world, x, y, k = 'life', v = 0.5) {
  if (!world.W || world.observe) return;
  const D = world.detritus || (world.detritus = []);
  if (D.length >= DETRITUS_MAX) { const old = D.shift(); rotDetritus(world, old); }
  if (world.shore && shoreAt(world, x, y) > world.tide.level) return; // (on dry sand the gulls have it)
  D.push({ x: clamp(x, 2, world.W - 2), y: clamp(y, 2, world.H - 2), k: DETRITUS_MAT[k] ? k : 'life', v, born: world.days, ph: Math.random() * TAU });
}
// Nobody ate it: it rots into the floor (less than a scavenger gives back).
function rotDetritus(world, d) { if (typeof landAdd === 'function') landAdd(world, d.x, d.y, d.k === 'bone' ? 'bone' : 'life', 0.01 * d.v); }
// Old food that sinks and goes uneaten (scene.js calls this as it expires).
function foodToDetritus(world, f) {
  if (!world || world.observe || f.kind === 'plankton' || f.kind === 'spawn' || (f.z ?? 0) > 6 || Math.random() > 0.35) return;
  dropDetritus(world, f.x, f.y, 'life', 0.3);
}
// A plant dying back, or a carcass picked over, sheds a few bits.
function shedDetritus(world, x, y, n, k, r = 4) { for (let i = 0; i < n; i++) dropDetritus(world, x + rand(-r, r), y + rand(-r, r), k, rand(0.4, 1)); }

let cycleClock = 0, litterClock = 0;
function updateCycle(world, dt) {
  if (!world.W || world.observe) return;
  cycleClock -= dt;
  if (cycleClock > 0) return;
  cycleClock = 1;
  const D = world.detritus || (world.detritus = []);
  if (D.length) {
    // Scavengers within reach eat it; it feeds them and goes back into the floor.
    const near = [];
    for (const c of world.creatures) if (c.life && !c.leaving && !c.dying && SCAVENGE.has(c.species)) near.push(c);
    for (let i = D.length - 1; i >= 0; i--) {
      const d = D[i];
      let eater = null;
      for (const c of near) if ((c.x - d.x) ** 2 + (c.y - d.y) ** 2 < 49) { eater = c; break; }
      if (eater) {
        D.splice(i, 1);
        eater.life.energy = Math.min(1, eater.life.energy + 0.03 * d.v);
        if (typeof landAdd === 'function') { landAdd(world, d.x, d.y, 'life', 0.025 * d.v); if (d.k !== 'life') landAdd(world, d.x, d.y, d.k, 0.015 * d.v); }
        world.game.recycled = (world.game.recycled || 0) + 1;
        if (world.effects.length < 200 && Math.random() < 0.4) world.effects.push(new Sparkle(d.x, d.y, 2));
      } else if (world.days - d.born > 1.5) { D.splice(i, 1); rotDetritus(world, d); }
    }
  }
  litterClock -= 1;
  if (litterClock <= 0) { litterClock = 5; recycleLitter(world); }
}

// ---- litter, taken up ----------------------------------------------------------------------------------------
const DENS = { hermit: ['can', 'bottle'], octopus: ['bottle', 'can', 'tire'], crayfish: ['can', 'bottle'], moray: ['tire'], eel: ['tire'] };
function recycleLitter(world) {
  const Lt = world.litter || [];
  if (!Lt.length) return;
  for (let i = Lt.length - 1; i >= 0; i--) {
    const l = Lt[i];
    if (world.shore && shoreAt(world, l.x, l.y) > world.tide.level) continue; // (up on the sand: nothing lives there)
    // An old tyre grows over into a little reef.
    if (l.k === 'tire' && world.days - (l.born ?? world.days) > 6 && Math.random() < 0.15) {
      Lt.splice(i, 1);
      if (world.forms) world.forms.push({ k: 'life', x: l.x, y: l.y, seed: newSeed(), born: world.days, g: 0.4, gs: 0 });
      if (typeof landAdd === 'function') landAdd(world, l.x, l.y, 'life', 0.2, 1);
      world.game.recycled = (world.game.recycled || 0) + 1;
      logEvent(world, 'An old tyre has grown over: a little reef, and one less piece of litter', null, { cat: 'life', pri: 1 });
      if (typeof landRebake === 'function') landRebake(world, l.x, l.y, 26);
      continue;
    }
    for (const c of world.creatures) {
      if (!c.life || c.leaving || c.dying || (c.x - l.x) ** 2 + (c.y - l.y) ** 2 > 144) continue;
      // A den: hermit crabs, octopuses and crayfish move into bottles and cans.
      if (DENS[c.species] && DENS[c.species].includes(l.k) && !c.life.home && Math.random() < 0.05) {
        Lt.splice(i, 1);
        c.life.home = l.k;
        world.game.recycled = (world.game.recycled || 0) + 1;
        logEvent(world, `${who(c)} has moved into ${LITTER[l.k].label}: a home, and one less piece of litter`, c, { cat: 'life', pri: 1, key: 'den', merge: (e) => `${e.n} animals have made their homes in the litter` });
        break;
      }
      // Ghost nets, picked apart.
      if (l.k === 'net' && SCAVENGE.has(c.species) && (SPECIES_STATS[c.species] || {}).size <= 2) {
        l.hp = (l.hp || 1) - 0.05;
        if (l.hp <= 0) {
          Lt.splice(i, 1);
          world.game.recycled = (world.game.recycled || 0) + 1;
          logEvent(world, 'The scavengers have picked a ghost net apart', null, { cat: 'life', pri: 1 });
          break;
        }
      }
    }
  }
}

function drawDetritus(r, world, rect) {
  const D = world.detritus;
  if (!D || !D.length) return;
  if (!DETRITUS_ID) DETRITUS_ID = newId(hexToInt('#0a0806'));
  for (const d of D) {
    if (rect && (d.x < rect[0] - 4 || d.x > rect[2] + 4 || d.y < rect[1] - 4 || d.y > rect[3] + 4)) continue;
    const m = DETRITUS_MAT[d.k] || DETRITUS_MAT.life;
    r.dot(d.x, d.y, 0.3, m, DETRITUS_ID);
    if (d.v > 0.6) r.dot(d.x + Math.cos(d.ph) * 1.2, d.y + Math.sin(d.ph) * 1.2, 0.2, m, DETRITUS_ID);
  }
}

// ---- the pond keeps growing ------------------------------------------------------------------------------------
// A little further out each dawn: more the deeper it's gone and the more it's scored.
function dawnExpand(world) {
  if (world.observe || typeof expandWorldPx !== 'function' || (world.expandPx || 0) >= maxDeepPx(world) - 8) return;
  const tier = (world.erosion && world.erosion.tier) || 0, pts = (world.game && world.game.points) || 0;
  const grow = 2 + 0.8 * tier + 0.6 * Math.log10(1 + pts) + (world.landArea ? 0.05 * (world.landArea.cryptid || 0) : 0);
  const G = world.game;
  G.expandDue = (G.expandDue || 0) + grow;
  if (G.expandDue < Math.max(40, 0.02 * (world.expandPx || 0)) || world.grab) return;
  const add = Math.floor(G.expandDue);
  G.expandDue = 0;
  expandWorldPx(add, 'The pond reaches a little further out', true);
}
