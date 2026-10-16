// In-page driver for tools/record_timelapse.py: runs the pond far faster than real time, plays it the way an
// attentive keeper would, and frames each shot. Evaluated into the page after the game has loaded.
(() => {
  'use strict';
  const TL = (window.TL = { tier: -1, known: 0, caption: null, captionLeft: 0, log: [] });
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const water = () => { for (let i = 0; i < 30; i++) { const [x, y] = openSpot(); if (!world.shore || !isDry(world, x, y)) return [x, y]; } return openSpot(); };

  // Take the frame loop over: nothing steps or draws unless this driver says so.
  TL.init = (opts) => {
    cancelAnimationFrame(frameId); frameId = 0; queueFrame = () => {};
    world.noSave = true; world.paused = false;
    Object.assign(TL, opts);
    if (opts.light && opts.light !== 'cycle') world.opts.light = opts.light;
    world.opts.renderer = opts.renderer || world.opts.renderer;
    world.opts.bars = false; // (no health bars over everyone)
    world.opts.volumetrics = opts.volumetrics !== false && world.opts.volumetrics;
    // Only the pond: no menus, rails or news, and our own small caption layer over it.
    const css = document.createElement('style');
    css.textContent = `body > *:not(canvas):not(#tl-cap):not(#tl-end) { visibility: hidden !important; }
      #tl-cap, #tl-end { position: fixed; z-index: 99999; pointer-events: none; font-family: Silkscreen, ui-monospace, monospace; color: #fff;
        text-shadow: 0 2px 0 #021014, 0 0 12px #021014; transition: none; }
      #tl-cap { left: 0; right: 0; bottom: 7%; text-align: center; font-size: 34px; letter-spacing: 1px; }
      #tl-cap small { display: block; font-size: 16px; color: #bfe6dc; margin-top: 6px; }
      #tl-day { position: fixed; left: 24px; top: 20px; z-index: 99999; font: 15px Silkscreen, ui-monospace, monospace; color: #d9f2ea; text-shadow: 0 2px 0 #021014; visibility: visible !important; }
      #tl-end { inset: 0; display: none; place-items: center; text-align: center; background: rgba(2, 16, 20, 0.72); font-size: 64px; }
      #tl-end small { display: block; font-size: 20px; color: #bfe6dc; margin-top: 10px; }`;
    document.head.appendChild(css);
    for (const id of ['tl-cap', 'tl-end', 'tl-day']) { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); }
    document.getElementById('tl-end').innerHTML = `<div>pond.nz<small>${opts.endLine || 'Keep a pond. See how deep it goes.'}</small></div>`;
    if (!opts.dayCounter) document.getElementById('tl-day').style.display = 'none';
    TL.tier = world.erosion.tier; TL.known = (knownList(world) || []).length;
    TL.cam = { x: world.W / 2, y: world.H / 2 };
    view.k = opts.zoom || coverK(); applyView();
    TL.frameCam(1);
  };

  // The keeper: feeds who's hungry, plants what the residents like, builds when it can afford to, and adds
  // the kinds that have found their way in. Roughly what a player checking in now and then would do.
  TL.keeper = () => {
    const G = world.game, swimmers = world.creatures.filter((c) => c.life && !c.leaving);
    if (swimmers.some((c) => c.life.energy < 0.55)) {
      world.tool = 'feed';
      for (let i = 0; i < 3; i++) { const c = pick(swimmers); useTool(c.x + rand(-6, 6), c.y + rand(-6, 6)); }
    }
    const usable = Object.keys(TOOLS).filter((k) => pinUsable(k));
    const plants = usable.filter((k) => TOOLS[k].place && !TOOLS[k].food && (TOOLS[k].price || 0) <= G.pearls * 0.25);
    if (plants.length && G.pearls > 25 && world.plants.length < 40 + world.W * world.H / 4000) { world.tool = pick(plants); const [x, y] = water(); useTool(x, y); }
    const builds = usable.filter((k) => { const t = TOOLS[k]; return t.build && t.build !== 'island' && G.pearls >= (t.price || 0) * 1.3 && (G.essence || 0) >= (t.essence || 0) && !(world.structures || []).some((s) => s.kind === t.build); });
    if (builds.length && Math.random() < 0.35) {
      const k = pick(builds);
      for (let i = 0; i < 25; i++) { const [x, y] = water(); if (!canPlace(world, TOOLS[k].build, x, y)) { world.tool = k; useTool(x, y); break; } }
    }
    if (!hardMode(world) && pondPopulation(world) < world.maxPop * 0.8) {
      const kinds = Object.keys(SPECIES).filter((k) => SPECIES[k].spawn && spawnable(world, k) && (world.targets[k] || 0) < 6);
      const k = kinds.length && pick(kinds);
      if (k && (G.essence || 0) > spawnPrice(k, []) * 1.5) buyAnimal(k);
    }
    world.tool = 'pointer';
  };

  // Advance the pond by `sim` seconds in steps of `dt`, with the keeper looking in every `every` seconds.
  TL.advance = (sim, dt = 0.1) => {
    TL.keeperClock = TL.keeperClock || 0;
    for (let t = 0; t < sim; t += dt) {
      advanceOfferingTime(world, dt, update);
      TL.keeperClock += dt;
      if (TL.autoplay && TL.keeperClock >= (TL.every || 20)) { TL.keeperClock = 0; try { TL.keeper(); } catch (e) { TL.log.push(String(e)); } }
    }
    runJobs(); bakeTick(40);
    // (The game grows the pond a step every few real seconds; here a few pixels a frame keep up with the pace.)
    const G = world.game, room = maxDeepPx(world) - 8 - (world.expandPx || 0), add = Math.min(Math.floor(G.growDue || 0), TL.growPerFrame || 3, room);
    if (add >= 1 && growInPlace(add)) G.growDue -= add;
    else if (room < 1) G.growDue = 0;
    // Captions for what a viewer should notice: a new depth, a new kind of life.
    const E = world.erosion;
    if (E.tier !== TL.tier) {
      TL.tier = E.tier;
      TL.say(tierName(world, E.tier), `the pond has deepened · ${Math.round(fathomsOf(E.e, branchOf(world))).toLocaleString()} fathoms`, 2.8);
    } else {
      const K = knownList(world) || [];
      if (K.length > TL.known && TL.captionLeft <= 0 && TL.newKinds !== false) { const k = K[K.length - 1]; if (SPECIES[k]) TL.say(SPECIES[k].label, 'found its way in', 1.6); }
      TL.known = K.length;
    }
    return { tier: E.tier, e: E.e, days: world.days, creatures: world.creatures.length, plants: world.plants.length, W: world.W, H: world.H, pearls: Math.round(world.game.pearls) };
  };

  TL.say = (title, sub, seconds) => { TL.caption = { title, sub }; TL.captionLeft = seconds; };

  // The camera starts on the whole pond and, as the pond grows outward, slides toward its deep end so the
  // drop-off and the darker water beyond come into view.
  TL.frameCam = (k = 0.06) => {
    const side = world.shoreSide ?? 0, alongX = deepAxisX(side), toStart = deepShifts(side), ex = world.expandPx || 0;
    const vw = innerWidth / view.k, vh = innerHeight / view.k, span = alongX ? vw : vh, size = alongX ? world.W : world.H;
    const mid = size / 2, far = toStart ? span / 2 : size - span / 2, w = Math.min(0.9, ex / (ex + span * 0.35));
    const along = mid + (far - mid) * w;
    const tx = alongX ? along : world.W / 2, ty = alongX ? world.H / 2 : along;
    TL.cam.x += (tx - TL.cam.x) * k; TL.cam.y += (ty - TL.cam.y) * k;
    if (view.k < coverK()) { view.k = coverK(); applyView(); }
    centerOn(TL.cam.x, TL.cam.y);
  };

  // One output frame: camera, caption layer, render.
  TL.frame = (fps) => {
    TL.frameCam();
    const cap = document.getElementById('tl-cap');
    if (TL.captionLeft > 0 && TL.caption) {
      TL.captionLeft -= 1 / fps;
      cap.innerHTML = `${TL.caption.title}<small>${TL.caption.sub}</small>`;
      cap.style.opacity = String(Math.min(1, TL.captionLeft * 2, 1));
    } else cap.innerHTML = '';
    const day = document.getElementById('tl-day');
    if (day.style.display !== 'none') day.textContent = `Day ${Math.floor(world.days) + 1}`;
    render(true);
  };

  TL.endCard = (on) => { document.getElementById('tl-end').style.display = on ? 'grid' : 'none'; document.getElementById('tl-cap').innerHTML = ''; };
})();
