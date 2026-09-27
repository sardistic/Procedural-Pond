'use strict';
// The heavens: what the sky does besides day, night and rain.
//  - Clear spells run longer than they did, and now and then there's a glass day: no wind, no
//    surf, the tide barely stirring, and the water so clear you can see far down into the deep.
//  - At night, sometimes: a meteor shower (falling stars streak across the water, and one may come
//    down as a star-stone on the beach), an aurora (the calm water glitters green and violet), a
//    comet (a few nights; rare births come more often while it hangs there).
//  - A blood moon (only when the moon is full): the night goes red, and madness runs high.
//  - An eclipse: the sun goes out at midday for a while; the night creatures come out, and the
//    marked stir.
//  - The stars come right (very rarely, oftener the more the pond has given itself to the dark):
//    everything eldritch runs faster, the mythic rise, and it rains blood.
//  - Blood rain: rain that falls red, when the stars are right, under a blood moon, or when the
//    pond is steeped in corruption. The water reddens; the marked drink it in.

const HEAVENS = {
  glass: { label: 'A glass day', note: 'no wind, no surf, the water still and clear to the deep', night: false },
  meteors: { label: 'Meteor shower', note: 'falling stars across the water; one may come down on the beach', night: true, w: 5 },
  aurora: { label: 'Aurora', note: 'the calm water glitters green and violet', night: true, w: 3 },
  comet: { label: 'A comet', note: 'rare births come more often while it hangs in the sky', night: true, w: 2, days: 3 },
  bloodmoon: { label: 'Blood moon', note: 'the night goes red, and madness runs high', night: true, w: 0 },
  eclipse: { label: 'Eclipse', note: 'the sun goes out at midday; the night creatures stir, and so do the marked', night: false },
  stars: { label: 'The stars are right', note: 'everything eldritch runs faster, the mythic rise, and it rains blood', night: true, w: 0 },
};
const heavens = (world) => world.heavens || (world.heavens = { ev: null, glass: -1, eclipse: -1, lastBloodMoon: -9 });
const heavenNow = (world, k) => { const H = heavens(world); return H.ev && H.ev.k === k && world.days < H.ev.until ? H.ev : null; };
const isGlass = (world) => Math.floor(world.days) === heavens(world).glass;
// An eclipse: the middle of the day, darkest at noon.
function eclipseDark(world) {
  if (Math.floor(world.days) !== heavens(world).eclipse) return 0;
  const d = Math.abs(world.clock - 0.5);
  return d > 0.06 ? 0 : 1 - d / 0.06;
}
const bloodRain = (world) => !!(world.weather && world.weather.blood && world.weather.rain > 0.05);

// Each dawn: a glass day, or an eclipse later on, perhaps.
function dawnHeavens(world) {
  const H = heavens(world), day = Math.floor(world.days);
  if (world.opts.weather !== false && Math.random() < 0.09) {
    H.glass = day;
    logEvent(world, '✦ A glass day: not a breath of wind, the sea laid flat, and the water clear all the way down', null, { cat: 'sky', pri: 3 });
    if (typeof narrate === 'function') narrate(world, 'glass');
  } else if (Math.random() < 0.025) {
    H.eclipse = day;
    logEvent(world, 'The almanac says the sun will go dark at midday', null, { cat: 'sky', pri: 2 });
  }
}
// Each dusk: what the night holds.
function duskHeavens(world) {
  const H = heavens(world), m = world.moon || moonInfo(world.days, world.moon0), G = world.game || {};
  if (H.ev && world.days < H.ev.until) return; // (a comet stays a few nights)
  H.ev = null;
  const dark = 1 - 1 / (1 + (G.corruptionEarned || 0) / 500);
  const full = Math.abs(m.age - 0.5) < 0.06;
  let k = null;
  if (Math.random() < 0.004 + 0.03 * dark * ((world.darkAvg ?? 0.3) + 0.3)) k = 'stars';
  else if (full && Math.floor(world.days) - H.lastBloodMoon > 12 && Math.random() < 0.3 + 0.3 * dark) { k = 'bloodmoon'; H.lastBloodMoon = Math.floor(world.days); }
  else if (Math.random() < 0.16) {
    const pool = Object.entries(HEAVENS).filter(([, d]) => d.w);
    let r = Math.random() * pool.reduce((a, [, d]) => a + d.w, 0);
    for (const [kk, d] of pool) if ((r -= d.w) <= 0) { k = kk; break; }
  }
  if (!k) return;
  const D = HEAVENS[k];
  H.ev = { k, from: world.days, until: Math.floor(world.days) + (D.days || 1) + 0.27 }; // (until the next dawn, or a few)
  logEvent(world, `✦ ${D.label}: ${D.note}`, null, { cat: 'sky', pri: k === 'stars' || k === 'bloodmoon' ? 3 : 2 });
  if (typeof narrate === 'function') narrate(world, k);
  if (k === 'stars' || (k === 'bloodmoon' && Math.random() < 0.5)) { world.weather.target = rand(0.6, 1); world.weather.next = rand(40, 80); world.weather.blood = true; }
}

// ---- how it shows ------------------------------------------------------------------------------------
// The light: an eclipse darkens the day; a blood moon reddens the night.
function heavensLight(world, tint) {
  const e = eclipseDark(world);
  if (e > 0) tint = tint.map((v, j) => lerp(v, [0.16, 0.14, 0.26][j], e * 0.85));
  if (heavenNow(world, 'bloodmoon') || heavenNow(world, 'stars')) {
    const night = clamp((0.6 - (tint[0] + tint[1] + tint[2]) / 3) * 3, 0, 1);
    tint = [tint[0] * (1 + 0.9 * night), tint[1] * (1 - 0.35 * night), tint[2] * (1 - 0.45 * night)];
  }
  if (bloodRain(world)) tint = [tint[0], tint[1] * (1 - 0.18 * world.weather.rain), tint[2] * (1 - 0.22 * world.weather.rain)];
  if (heavenNow(world, 'aurora')) { // (and a shimmer of it over everything, rough water or calm)
    const night = clamp((0.6 - (tint[0] + tint[1] + tint[2]) / 3) * 3, 0, 1), c = auroraNow(world), rgb = [c & 255, (c >> 8) & 255, (c >> 16) & 255];
    tint = tint.map((v, j) => v * (1 + night * (0.9 * rgb[j] / 255 - 0.3)));
  }
  return tint;
}
// The sky calm water shows: the aurora's green and violet, shifting.
const AURORA = [hexToInt('#3aff9a'), hexToInt('#8a5aff'), hexToInt('#3ad0ff')];
const auroraNow = (world) => { const t = world.t * 0.15; return mixColor(AURORA[Math.floor(t) % 3], AURORA[(Math.floor(t) + 1) % 3], t % 1); };
function heavensSky(world, sky) {
  if (heavenNow(world, 'aurora') && (world.darkness || 0) > 0.4) return mixColor(sky, auroraNow(world), 0.75);
  if (heavenNow(world, 'bloodmoon') || heavenNow(world, 'stars')) return mixColor(sky, hexToInt('#8a1010'), 0.55);
  return sky;
}
// How madness runs under these skies (see lightMadness).
function heavensMadness(world) {
  return (heavenNow(world, 'bloodmoon') ? 1.5 : 1) * (heavenNow(world, 'stars') ? 1.8 : 1) * (1 + 0.5 * eclipseDark(world)) * (bloodRain(world) ? 1.3 : 1);
}

// Falling stars: a streak drawn high over the water (it shows as a bright line on the surface).
const METEOR = mat('#8ab0ff', '#c8dcff', '#f0f6ff', '#ffffff');
let METEOR_ID = 0;
class Meteor {
  constructor(world) {
    this.x = rand(0, world.W); this.y = rand(0, world.H * 0.6); this.a = rand(0.4, 1.1) + (Math.random() < 0.5 ? 0 : PI - 1.5); this.v = rand(160, 260); this.t = 0; this.life = rand(0.35, 0.7);
  }
  update(dt) { this.t += dt; this.x += Math.cos(this.a) * this.v * dt; this.y += Math.sin(this.a) * this.v * dt; return this.t < this.life; }
  draw(r) {
    if (!METEOR_ID) { METEOR_ID = newId(hexToInt('#10183a')); EMISSIVE[METEOR_ID] = 2; }
    const len = 10 + 14 * Math.sin(this.t / this.life * PI);
    for (let i = 0; i < len; i += 1) r.dot(this.x - Math.cos(this.a) * i, this.y - Math.sin(this.a) * i, SURFACE_Z + 1, METEOR, METEOR_ID);
  }
}
function updateHeavens(world, dt) {
  const H = heavens(world);
  // The glass day: the weather holds its breath.
  if (isGlass(world)) { world.weather.target = 0; world.weather.rain = Math.max(0, world.weather.rain - dt * 0.2); world.weather.gust *= 0.05; }
  if (heavenNow(world, 'meteors') && (world.darkness || 0) > 0.5) {
    if (Math.random() < dt * 1.4 && world.effects.length < 210) world.effects.push(new Meteor(world));
    // Now and then one comes down on the beach: a star-stone (a rare fossil).
    if (!H.fell && world.shore && Math.random() < dt * 0.004 && typeof Fossil === 'function') {
      for (let i = 0; i < 40; i++) {
        const x = rand(10, world.W - 10), y = rand(10, world.H - 10);
        if (!isDry(world, x, y)) continue;
        const kind = Math.random() < 0.25 ? 'relic' : Math.random() < 0.5 ? 'skull' : 'amber';
        world.fossils.push(new Fossil(x, y, kind, fossilGene(kind), world.days));
        H.fell = true;
        logEvent(world, '✦ A falling star came down on the beach: something is lying in the sand where it struck', null, { cat: 'rare', pri: 3 });
        if (typeof narrate === 'function') narrate(world, 'fallen');
        addRipple(world, x, y, 3);
        // (From the deep past on, something else sometimes comes down with them, into the deep.)
        if ((world.erosion && world.erosion.tier) >= 9 && Math.random() < 0.3 && typeof landXeno === 'function') landXeno(world, null, null, 'it came down with the falling stars');
        break;
      }
    }
  } else H.fell = false;
  // Blood rain feeds the marked, and stains the pond's corruption.
  if (bloodRain(world)) {
    for (const c of world.creatures) if (c.life && c.life.genome.eld) c.life.corruption = Math.min(1, (c.life.corruption || 0) + dt * 0.002 * world.weather.rain);
    if (typeof gainCorruption === 'function') gainCorruption(world, dt * 0.05 * world.weather.rain, null, { quiet: true });
  }
}
// What the sky tracker says tonight.
function heavensLine(world) {
  const H = heavens(world), bits = [];
  if (isGlass(world)) bits.push(`${HEAVENS.glass.label}: ${HEAVENS.glass.note}`);
  if (H.eclipse === Math.floor(world.days)) bits.push(eclipseDark(world) > 0 ? 'The sun is eclipsed' : world.clock < 0.5 ? 'An eclipse at midday' : 'The eclipse has passed');
  if (H.ev && world.days < H.ev.until) bits.push(`${HEAVENS[H.ev.k].label}: ${HEAVENS[H.ev.k].note}`);
  if (bloodRain(world)) bits.push('It is raining blood');
  return bits.join(' · ');
}

// Born under a comet: a gift, sometimes (the gifts are carried in links, so it holds).
function cometGift(world, g) {
  if (!heavenNow(world, 'comet') || Math.random() > 0.04) return;
  const k = pick(GIFT_KEYS.filter((x) => x !== 'titan'));
  g[k] = true;
}
