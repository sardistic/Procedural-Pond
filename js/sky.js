'use strict';
// Sky, moon and tides. Time is counted in days (one day = the Day length
// option). The moon goes round every MOON_DAYS days. Its phase sets how bright
// the nights are, how far the tide moves (spring tides at new and full moon,
// neap tides at the quarters) and how big the surf gets. The tide comes in
// twice a day and floods or bares the beach along one edge of the pond.

const MOON_DAYS = 8;
const MOON_PHASES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
const TIDE_RANGE = { fresh: 0.08, mixed: 0.75, salt: 1 };  // lakes barely have tides
const SURF_BASE = { fresh: 0.2, mixed: 0.65, salt: 1 };

function moonInfo(days, moon0) {
  const age = (((moon0 + days / MOON_DAYS) % 1) + 1) % 1;
  const phase = Math.round(age * 8) % 8;
  return {
    age, phase, name: MOON_PHASES[phase],
    illum: (1 - Math.cos(TAU * age)) / 2,       // 0 new .. 1 full
    spring: Math.abs(Math.cos(TAU * age)),       // 1 at new/full, 0 at the quarters
  };
}

const tideCycles = (world) => world.days * 2 + world.tide0;

// Game hours until the next high or low tide.
function nextTide(world) {
  const f = ((tideCycles(world) % 1) + 1) % 1; // sin peaks at 0.25 (high) and troughs at 0.75 (low)
  const toHigh = ((0.25 - f) % 1 + 1) % 1, toLow = ((0.75 - f) % 1 + 1) % 1;
  return toHigh < toLow ? { kind: 'High', hours: toHigh / 2 * 24 } : { kind: 'Low', hours: toLow / 2 * 24 };
}

function moonLine(m) {
  if (m.phase === 4) return 'the full moon rises';
  if (m.phase === 0) return 'a new moon: the darkest of nights';
  if (m.phase === 2 || m.phase === 6) return `the ${m.name.toLowerCase()} moon rises`;
  return `a ${m.name.toLowerCase()} moon rises`;
}

function updateSky(world, dt) {
  const prevClock = world.clock;
  world.days += dt / world.opts.dayLength;
  world.clock = ((world.days % 1) + 1) % 1;
  const m = world.moon = moonInfo(world.days, world.moon0);
  const hab = world.opts.habitat || 'mixed', tide = world.tide, tidal = !!world.shore;

  // Tide level is compared against beach elevation (0 at the waterline zone's
  // deep end, 1 at the top of the beach).
  tide.range = tidal ? lerp(0.35, 1, m.spring) * TIDE_RANGE[hab] : 0;
  const ph = TAU * tideCycles(world), cos = Math.cos(ph), was = tide.cos ?? cos;
  tide.level = 0.5 + 0.32 * tide.range * Math.sin(ph);
  tide.cos = cos;
  tide.rising = cos > 0;
  tide.flow = cos * tide.range; // + flooding toward the beach, - ebbing away
  const surf = tidal ? (0.3 + 0.7 * m.spring) * SURF_BASE[hab] + Math.max(0, world.weather.gust) * 0.35 + world.weather.rain * 0.25 : 0;
  tide.surf = clamp(surf, 0, 1.4) * (typeof deadCalm === 'function' && deadCalm(world) ? 0.05 : 1); // (a dead pond lies still)
  if (tidal && typeof metaTide === 'function') metaTide(world, tide); // the moonstone, the tide bell, the wind conch
  if (typeof isGlass === 'function' && isGlass(world)) { tide.level = 0.5 + (tide.level - 0.5) * 0.15; tide.surf *= 0.05; tide.flow *= 0.1; } // a glass day: the sea holds still
  tide.wave = (tide.wave + dt * (0.13 + tide.surf * 0.08)) % 1000; // (the surf rolls in slowly)

  const spring = m.spring > 0.75, which = Math.abs(m.age - 0.5) < 0.25 ? 'full' : 'new';
  if (tidal && TIDE_RANGE[hab] >= 0.5) {
    if (was > 0 && cos <= 0) {
      logEvent(world, `High tide${spring ? `: a spring tide under the ${which} moon` : m.spring < 0.35 ? ', only a small neap tide' : ''}`, null, { cat: 'sky' });
    } else if (was < 0 && cos >= 0) {
      logEvent(world, `Low tide${spring ? ': the beach lies wide open' : ''}`, null, { cat: 'sky' });
    }
  }
  if (tide.surf > 0.9 && !tide.big) { tide.big = true; logEvent(world, 'Big waves are rolling in', null, { cat: 'sky', pri: 2 }); }
  else if (tide.surf < 0.65) tide.big = false;

  if (world.opts.light === 'cycle') {
    const c = world.clock;
    const crossed = (mark) => (prevClock < mark && c >= mark) || (c < prevClock && (mark > prevClock || mark <= c));
    if (crossed(0.27)) { logEvent(world, `Dawn breaks over the pond: day ${Math.floor(world.days) + 1}`, null, { cat: 'sky' }); if (typeof narrate === 'function' && Math.random() < 0.35) narrate(world, 'dawn'); }
    else if (crossed(0.5)) logEvent(world, 'The sun is high: midday', null, { cat: 'sky', pri: 0 });
    else if (crossed(0.77)) {
      const flies = fitsHabitat(world, 'fresh') ? ', the fireflies come out' : '';
      logEvent(world, `Dusk settles${flies} and ${moonLine(m)}`, null, { cat: 'sky' });
      if (typeof narrate === 'function' && Math.random() < 0.4) narrate(world, 'dusk');
      if (typeof duskHeavens === 'function') duskHeavens(world);
    }
  }
  updateCoralSpawning(world, dt, m);
}

// On a full-moon night the corals release clouds of pink spawn that drift up
// to the surface. Fish feast on them.
function updateCoralSpawning(world, dt, m) {
  const night = Math.round(world.days);
  if (m.phase === 4 && world.darkness > 0.55 && world.spawnNight !== night && world.opts.life !== false) {
    const corals = world.plants.filter((p) => p instanceof Coral);
    if (corals.length) {
      world.spawnNight = night;
      world.spawning = 30;
      const pts = award(world, 20, 'coral spawning');
      logEvent(world, `Under the full moon, the corals are spawning${pts ? ` · +${pts}` : ''}`, null, { cat: 'life', pri: 2 });
    }
  }
  if (world.spawning > 0) {
    world.spawning -= dt;
    const corals = world.plants.filter((p) => p instanceof Coral);
    let n = corals.length ? dt * 24 : 0;
    while (Math.random() < n && world.food.length < 400) {
      const c = pick(corals);
      world.food.push(new Food(c.x + rand(-4, 4), c.y + rand(-4, 4), rand(2, 6), 'spawn'));
      n--;
    }
  }
}
