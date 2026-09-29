'use strict';
// Each pond its own. From its seed, every pond has a character: the colour of its sand (black volcanic,
// white coral, red iron, pale glacial grey, gold, slate, pink, or somewhere between), the rock it's built
// on (granite, sandstone, slate, basalt, limestone, red rock) and how that rock lies (rounded boulders,
// flat slabs, tall stacks), how warm its water runs, and how often it rains. Then what's done with it
// moves it on:
//  - its water warms with the vents, springs and smokers built in it, and cools as it deepens, and the
//    warmth decides which kinds find it (reef fish and turtles like it warm; crabs, eels and ducks cool);
//  - a cursed pond (the corruption it has yielded, the marked in it now, the eldritch built, the alien
//    lying in it, and the madness of the one who keeps it: curseLevel) goes to ash: its sand greys and
//    darkens, its water murks, the sky takes a sickly cast, and the weather comes for it: storms oftener
//    and harder, ash falling instead of rain. An alien pond's sky turns violet, and it rains glass.
//  - a cursed pond with nothing left alive in it goes completely still: no wind, no rain, no surf,
//    the water like glass under a grey sky.
// The land up the beach comes out of the haze slowly (hinterland.js), faster the more cursed the pond.

const ROCK_MATS_BASE = ROCK_MATS.length; // (the first three, from before: saved rocks keep their index)
ROCK_MATS.push(
  mat('#0e0e12', '#1c1c22', '#2e2e36', '#484852'), // basalt
  mat('#4a1e14', '#6e3020', '#944634', '#bc6650'), // red rock
  mat('#7e786a', '#a49e8e', '#c8c2b2', '#ece6d6'), // limestone
  mat('#5a3a3e', '#80565a', '#a87c7c', '#d0a8a4'), // pink granite
  mat('#1a2230', '#2a3446', '#404c62', '#5e6c84'), // blue slate
);
// A family: which of ROCK_MATS stand in for the three a pond's scenery picks from, and how its rocks lie.
const ROCK_FAMILIES = {
  granite: { label: 'granite', mats: [0, 6, 0], b: 1, h: 1 },
  sandstone: { label: 'sandstone', mats: [1, 4, 1], b: 0.95, h: 0.7 },
  slate: { label: 'slate', mats: [2, 7, 2], b: 0.7, h: 0.55 },
  basalt: { label: 'basalt', mats: [3, 3, 7], b: 0.8, h: 1.4 },
  limestone: { label: 'limestone', mats: [5, 5, 1], b: 1.1, h: 0.85 },
  redrock: { label: 'red rock', mats: [4, 4, 1], b: 0.85, h: 1.3 },
};
// Kinds of pond: [weight, sand warmth (-1 grey-blue .. 1 red), sand light (-1 black .. 1 white), rock, water warmth, rain].
const POND_KINDS = {
  plain: { w: 40, label: '' },
  volcanic: { w: 8, label: 'dark volcanic sand', hue: -0.25, light: -0.85, rock: 'basalt', temp: 0.5, wet: 1.2 },
  white: { w: 10, label: 'white coral sand', hue: 0.1, light: 0.8, rock: 'limestone', temp: 0.45, wet: 0.8 },
  red: { w: 8, label: 'red iron sand', hue: 0.95, light: -0.1, rock: 'redrock', temp: 0.3, wet: 0.7 },
  glacial: { w: 8, label: 'grey glacial sand', hue: -0.65, light: -0.2, rock: 'granite', temp: -0.8, wet: 1.3 },
  golden: { w: 10, label: 'golden sand', hue: 0.5, light: 0.3, rock: 'sandstone', temp: 0.2, wet: 0.9 },
  slate: { w: 8, label: 'dark slate shingle', hue: -0.45, light: -0.45, rock: 'slate', temp: -0.35, wet: 1.4 },
  pink: { w: 5, label: 'pink sand', hue: 0.7, light: 0.55, rock: 'granite', temp: 0.6, wet: 0.9 },
};
const TEMP_WORDS = [[-0.5, 'cold'], [-0.15, 'cool'], [0.2, 'temperate'], [0.55, 'warm'], [9, 'tropical']];
// Who likes it warm and who cool (the rest don't mind): this pond's odds for them shift with its water.
const WARM_KINDS = new Set(['clown', 'puffer', 'octopus', 'ray', 'turtle', 'frog', 'snake', 'dragonfly', 'tetra', 'koi']);
const COOL_KINDS = new Set(['crab', 'starfish', 'eel', 'snail', 'shrimp', 'duck', 'axolotl', 'jelly']);

// ---- the pond's character, from its seed ------------------------------------------------------------------
const CHAR_CACHE = { seed: null, v: null };
function pondChar(world) {
  if (CHAR_CACHE.seed === world.seed && CHAR_CACHE.v) return CHAR_CACHE.v;
  const s = hashString(`${world.seed || 'pond'}/character`) % 99991, h = (k) => hash2(s, k, 77);
  const kinds = Object.entries(POND_KINDS), total = kinds.reduce((a, [, K]) => a + K.w, 0);
  let r = h(1) * total, kind = 'plain';
  for (const [k, K] of kinds) if ((r -= K.w) <= 0) { kind = k; break; }
  const K = POND_KINDS[kind], fam = Object.keys(ROCK_FAMILIES);
  const v = {
    kind, label: K.label,
    hue: K.hue ?? (h(2) - 0.5) * 0.8, light: K.light ?? (h(3) - 0.5) * 0.7,
    rock: K.rock || fam[Math.floor(h(4) * fam.length * 0.999)],
    temp: clamp((K.temp ?? (h(5) - 0.5) * 1.2) + (h(6) - 0.5) * 0.2, -1, 1),
    wet: (K.wet ?? 0.7 + h(7) * 0.8) * (0.9 + h(8) * 0.2),
  };
  CHAR_CACHE.seed = world.seed; CHAR_CACHE.v = v;
  return v;
}
const rockFamily = (world) => ROCK_FAMILIES[pondChar(world).rock] || ROCK_FAMILIES.granite;
// One of the three generated rock materials, as this pond's rock (no randomness spent: the scenery stays the same pond).
function rockFor(world, m) {
  const i = ROCK_MATS.indexOf(m);
  return i >= 0 && i < ROCK_MATS_BASE ? ROCK_MATS[rockFamily(world).mats[i]] : m;
}
// How this pond's rock lies: rounded, in slabs or in stacks.
function shapeRock(world, rock) {
  const F = rockFamily(world);
  rock.b = Math.min(rock.a, rock.b * F.b);
  rock.h *= F.h;
  return rock;
}

// ---- how cursed, how alien, how dead ---------------------------------------------------------------------
const CURSE_CACHE = { t: -1, seed: null, v: 0, alien: 0 };
function curseLevel(world) {
  const now = world.t || 0;
  if (CURSE_CACHE.seed === world.seed && Math.abs(now - CURSE_CACHE.t) < 2) return CURSE_CACHE.v;
  const G = world.game || {}, S = world.structures || [];
  const cor = 1 - 1 / (1 + (G.corruptionEarned || 0) / 400);
  const marked = Math.min(1, ((world.eldMarks && world.eldMarks.length) || 0) / 10);
  const built = Math.min(1, S.filter((s) => s.kind === 'idol' || s.kind === 'whalefall' || s.kind === 'tribute' || (s.kind === 'island' && s.branch === 'dark')).length / 3);
  const xeno = Math.min(1, ((world.xeno && world.xeno.length) || 0) / 4);
  const mad = world.story ? world.story.m || 0 : 0;
  CURSE_CACHE.v = clamp(0.4 * cor + 0.2 * marked + 0.15 * built + 0.1 * xeno + 0.15 * mad, 0, 1);
  CURSE_CACHE.alien = clamp(((world.xeno && world.xeno.length) || 0) / 3 + ((world.parasites && world.parasites.length) || 0) / 30 + (G.alienFound ? 0.2 : 0), 0, 1);
  CURSE_CACHE.t = now; CURSE_CACHE.seed = world.seed;
  return CURSE_CACHE.v;
}
const alienLevel = (world) => { curseLevel(world); return CURSE_CACHE.alien; };
// The curse as the floor shows it: taken each dawn (so the sand, the land up the beach and the map agree all day).
const floorCurse = (world) => (world.game && world.game.charCurse) || 0;
// Cursed, and nothing alive in it for a while: everything holds still.
function deadCalm(world) {
  const G = world.game;
  return !!(G && G.deadSince != null && world.days - G.deadSince > 0.5 && curseLevel(world) >= 0.25);
}

// ---- colours ---------------------------------------------------------------------------------------------------
// The floor (and the sand up the beach) in this pond's colours: warmer or cooler, paler or darker, and to ash as
// the curse takes it. The same for every pixel, so it's worked out once per bake.
function floorTintFn(world) {
  const C = pondChar(world), ash = 0.5 * floorCurse(world), hue = C.hue, li = C.light;
  if (!hue && !li && !ash) return (c) => c;
  // Warm: redder (iron), cool: greyer and a little blue (glacial, slate); pale: toward white (coral), dark: toward
  // black and grey (volcanic).
  const mr = hue > 0 ? 1 + 0.3 * hue : 1 + 0.1 * hue, mg = hue > 0 ? 1 - 0.06 * hue : 1 + 0.03 * hue, mb = hue > 0 ? 1 - 0.32 * hue : 1 - 0.06 * hue;
  const grey = Math.max(0, -hue) * 0.45 + Math.max(0, -li) * 0.5, up = li > 0 ? li * 0.4 : 0, down = li < 0 ? 1 + li * 0.62 : 1;
  return (c) => {
    let r = (c & 255) * mr, g = ((c >> 8) & 255) * mg, b = ((c >>> 16) & 255) * mb;
    if (grey) { const l = (r + g + b) / 3; r += (l - r) * grey; g += (l - g) * grey; b += (l * 1.04 - b) * grey; }
    if (up) { r += (255 - r) * up; g += (255 - g) * up; b += (255 - b) * up * 0.92; }
    r *= down; g *= down; b *= down;
    if (ash) { const l = (r + g + b) / 3; r += (l * 0.78 - r) * ash; g += (l * 0.78 - g) * ash; b += (l * 0.84 - b) * ash; }
    return (0xff000000 | (clamp(Math.round(b), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(r), 0, 255)) >>> 0;
  };
}
const TINT_WARM = hexToInt('#22c8c8'), TINT_COLD = hexToInt('#1e3a4e'), TINT_MURK = hexToInt('#2e3a2a');
// The water: bluer-green and clearer when warm, greyer when cold, murky when cursed.
function charWater(world, c) {
  const t = waterTemp(world), cur = floorCurse(world);
  if (t > 0) c = mixColor(c, TINT_WARM, 0.2 * t); else c = mixColor(c, TINT_COLD, 0.28 * -t);
  return cur > 0.05 ? mixColor(c, TINT_MURK, 0.3 * cur) : c;
}
// The light over a cursed pond turns sickly; over an alien one, violet; over a dead one, grey.
function castTint(world, tint) {
  const cur = curseLevel(world), al = alienLevel(world);
  let [r, g, b] = tint;
  if (cur > 0.05) { r *= 1 - 0.14 * cur; g *= 1 - 0.03 * cur; b *= 1 - 0.18 * cur; }
  if (al > 0.05) { r *= 1 - 0.04 * al; g *= 1 - 0.13 * al; b *= 1 + 0.02 * al; }
  if (deadCalm(world)) { const l = (r + g + b) / 3; r = lerp(r, l, 0.5) * 0.9; g = lerp(g, l, 0.5) * 0.9; b = lerp(b, l, 0.5) * 0.92; }
  return [r, g, b];
}
// For the side view's sky: the colour it leans to, and how far.
function skyCast(world) {
  const cur = curseLevel(world), al = alienLevel(world);
  if (deadCalm(world)) return { c: hexToInt('#8a8c90'), k: 0.6 };
  if (cur < 0.05 && al < 0.05) return null;
  return cur >= al ? { c: hexToInt('#8a9a5a'), k: 0.5 * cur } : { c: hexToInt('#9a6ac8'), k: 0.5 * al };
}

// ---- the water's warmth ------------------------------------------------------------------------------------------
function waterTemp(world) {
  const C = pondChar(world), S = world.structures || [];
  const warmers = S.filter((s) => s.kind === 'vent' || s.kind === 'smoker' || s.kind === 'spring').length;
  const tier = (world.erosion && world.erosion.tier) || 0;
  return clamp(C.temp + 0.12 * Math.min(4, warmers) - 0.04 * Math.min(8, tier) - 0.25 * floorCurse(world), -1, 1);
}
const tempWord = (t) => TEMP_WORDS.find(([k]) => t < k)[1];
const tempC = (world) => Math.round((world.opts.habitat === 'fresh' ? 13 : 17) + 11 * waterTemp(world));
// How much likelier (or less) a kind is here for the warmth of the water.
function tempOdds(world, k) {
  const t = waterTemp(world);
  return WARM_KINDS.has(k) ? 1 + 0.6 * t : COOL_KINDS.has(k) ? 1 - 0.6 * t : 1;
}
// A line for the score panel and the sky tracker: what this pond is like.
function charLine(world) {
  const C = pondChar(world), t = waterTemp(world), F = rockFamily(world), parts = [];
  parts.push(C.label || `${C.light > 0.25 ? 'pale' : C.light < -0.25 ? 'dark' : ''} ${C.hue > 0.25 ? 'warm-coloured' : C.hue < -0.25 ? 'grey' : ''} sand`.replace(/\s+/g, ' ').trim());
  parts.push(`${F.label} ${F.h > 1.15 ? 'stacks' : F.h < 0.75 ? 'slabs' : 'boulders'}`);
  parts.push(`${tempWord(t)} water (${tempC(world)}°C)`);
  if (C.wet > 1.25) parts.push('a wet climate'); else if (C.wet < 0.8) parts.push('a dry climate');
  const cur = curseLevel(world);
  if (deadCalm(world)) parts.push('dead calm: nothing lives here');
  else if (cur > 0.6) parts.push('deeply cursed'); else if (cur > 0.3) parts.push('cursed');
  if (alienLevel(world) > 0.3) parts.push('not wholly of this world');
  return parts.join(' · ');
}

// ---- the weather it has ------------------------------------------------------------------------------------------
// How often it rains here, and how hard; what falls in a cursed or an alien pond.
function weatherMood(world) {
  const C = pondChar(world), cur = curseLevel(world), al = alienLevel(world);
  return { wet: C.wet * (1 + 1.4 * cur + 0.6 * al), hard: 0.35 * cur + 0.15 * al, ash: cur, glass: al };
}
const ASH_RIPPLE = mat('#2a2a2a', '#4a4a48', '#6e6c68', '#9a9892'), GLASS_RIPPLE = mat('#1a4a5a', '#3a8aa0', '#7ae0f0', '#dcfaff');

// ---- each dawn ----------------------------------------------------------------------------------------------------
// The curse as the floor shows it moves on a step at a time; the floor (and the land up the beach) is redrawn for it.
// And whether anything is alive: a pond that's been empty a while (and is cursed) goes still.
function dawnCharacter(world) {
  const G = world.game;
  if (!G || world.observe) return;
  const was = G.charCurse || 0, now = Math.round(curseLevel(world) * 10) / 10;
  if (now !== was) {
    G.charCurse = now;
    if (typeof queueBake === 'function') { queueBake(world, [0, 0, world.W - 1, world.H - 1]); queueJob(() => paintMinimapBackground()); }
    if (now > was && now >= 0.3 && !G.ashSaid) { G.ashSaid = true; logEvent(world, 'The sand is going grey. The curse is in the ground now, and the water has a taste of ash', null, { cat: 'story', pri: 2 }); }
  }
}
// (Every few seconds: is anything alive here?)
function updateCharacter(world, dt) {
  const G = world.game;
  if (!G || world.observe) return;
  CHAR_TICK.t -= dt;
  if (CHAR_TICK.t > 0) return;
  CHAR_TICK.t = 5;
  const alive = world.creatures.some((c) => c.life && !c.gone && !c.dying);
  if (alive) { if (G.deadSince != null) { delete G.deadSince; if (G.calmSaid) { G.calmSaid = false; logEvent(world, 'Something is alive in the pond again, and the wind comes back', null, { cat: 'sky', pri: 2 }); } } }
  else if (G.deadSince == null) G.deadSince = world.days;
  if (deadCalm(world) && !G.calmSaid) { G.calmSaid = true; logEvent(world, 'Nothing lives in the pond. The wind has dropped, the rain has stopped, and the water lies like glass under a grey sky', null, { cat: 'story', pri: 3 }); }
}
const CHAR_TICK = { t: 0 };
