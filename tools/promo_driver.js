// In-page driver for tools/capture_promo.py: films a real pond. The frame loop is taken over so each frame is
// stepped by exactly 1/fps of pond time and drawn, however long the capture takes: the footage plays smoothly.
(() => {
  'use strict';
  const PR = (window.PR = {});
  const deepKind = (c) => (typeof DEEP !== 'undefined' && DEEP[c.species]) || null;

  PR.init = () => {
    cancelAnimationFrame(frameId); frameId = 0; queueFrame = () => {};
    world.opts.bars = false;
    const css = document.createElement('style');
    css.id = 'pr-hide';
    css.textContent = 'body.pr-clean > *:not(canvas) { visibility: hidden !important; } #observe-bar, #bar-name { display: none !important; }';
    document.head.appendChild(css);
    PR.ui(false);
    PR.clearSky(true);
  };
  // The interface: hidden for clean footage, shown (less the look-only notice) for shots of the game itself.
  PR.ui = (on) => { document.body.classList.toggle('pr-clean', !on); };
  // Clear skies for filming: no rain streaking across every shot (held, frame by frame).
  PR.clearSky = (on = true) => { PR.clear = on; if (on) Object.assign(world.weather, { rain: 0, target: 0, next: 1e9 }); };
  PR.light = (mode) => { world.opts.light = mode; world.light = lighting(); world.darkness = world.light.darkness; };

  // One frame of pond time: the simulation, the camera, the floor's pending redraws, then the picture.
  PR.step = (dt, sim = 1) => {
    if (PR.clear) { Object.assign(world.weather, { rain: 0, target: 0, next: 1e9 }); if (world.sea) world.sea.rain = 0; }
    // (As the frame loop does: waves keep real time, the sea state follows the weather.)
    world.waveTime = waveTime(world) + dt;
    seaStep(world, dt);
    if (sim > 0) advanceOfferingTime(world, dt * sim, update);
    updateCamera(dt); updateGlide(dt);
    if (document.body.classList.contains('pr-clean') && !document.getElementById('creature').hidden) hideCreature();
    runJobs(); bakeTick(30);
    if (typeof hudTick === 'function' && !document.body.classList.contains('pr-clean')) hudTick(dt);
    render();
  };
  // Let the pond settle somewhere before filming: a few seconds run, the floor there fully drawn.
  PR.settle = (seconds = 2, dt = 1 / 30) => {
    for (let t = 0; t < seconds; t += dt) PR.step(dt);
    if (typeof bakeAway === 'function') bakeAway();
    render();
  };

  PR.look = (x, y, k) => { stopFollow(); if (k) { view.k = Math.max(coverK(), k); applyView(); } centerOn(x, y); render(); };
  // (follow() zooms in a step itself: the zoom is set after it, and the camera starts on the animal.)
  PR.follow = (c, k) => { stopFollow(); follow(c); if (document.body.classList.contains('pr-clean')) hideCreature(); if (k) { view.k = Math.max(coverK(), k); applyView(); } centerOn(c.x, c.y); cam.fx = view.tx; cam.fy = view.ty; };
  PR.tour = (k) => { stopFollow(); cam.tour = true; cam.next = 0; updateCamera(0); if (document.body.classList.contains('pr-clean')) hideCreature(); if (k) { view.k = Math.max(coverK(), k); applyView(); } if (cam.follow) { centerOn(cam.follow.x, cam.follow.y); cam.fx = view.tx; cam.fy = view.ty; } };
  PR.stop = () => stopFollow();
  // A glide from one point to another over `seconds` (eased), for pans across the pond.
  PR.panFrames = (x0, y0, x1, y1, n) => { PR.pan = { x0, y0, x1, y1, n, i: 0 }; stopFollow(); };
  PR.panStep = (dt) => {
    const P = PR.pan, u = P.n > 1 ? P.i / (P.n - 1) : 1, e = u * u * (3 - 2 * u);
    centerOn(P.x0 + (P.x1 - P.x0) * e, P.y0 + (P.y1 - P.y0) * e); P.i++;
    PR.step(dt);
  };

  // Where things are: the beach, the middle, the deep, by the pond's own axes.
  PR.places = () => {
    const side = world.shoreSide ?? 0, alongX = deepAxisX(side), deepFirst = deepShifts(side), W = world.W, H = world.H;
    const at = (u) => { const v = deepFirst ? 1 - u : u; return alongX ? [W * v, H / 2] : [W / 2, H * v]; };
    const isles = (world.structures || []).filter((s) => s.kind === 'island').map((s) => [s.x, s.y]);
    return { beach: at(0.04), shallows: at(0.12), middle: at(0.4), deep: at(0.75), deepest: at(0.95), isles, W, H, alongX, deepFirst };
  };

  // The animals worth filming, best first: the mythic, then rare tiers, glowing, big.
  PR.notable = (opts = {}) => {
    const out = [];
    for (const c of world.creatures) {
      if (!c.life || c.leaving || c.dying || (c.alpha ?? 1) < 0.9) continue;
      const D = deepKind(c), g = c.life.genome || {}, tier = typeof tierOf === 'function' ? tierOf(c.life.traits || []) : 0;
      const glow = !!(g.glow || (typeof LIGHT_SPECIES !== 'undefined' && LIGHT_SPECIES[c.species]));
      let score = tier * 2 + (D && D.mythic ? 12 : 0) + (glow && opts.night ? 5 : 0) + (c.life.paragon ? 6 : 0) + Math.min(4, (c.body ? Math.max(...c.body.w) : 2) / 3);
      if (opts.kind && c.species !== opts.kind) continue;
      if (opts.shallow && depthAt(world, c.x, c.y) > opts.shallow) continue; // (the deep swallows the light: for day shots)
      if (opts.glowOnly && !glow) continue;
      out.push({ i: world.creatures.indexOf(c), score, species: c.species, label: SPECIES[c.species] ? SPECIES[c.species].label : c.species, tier, tierName: typeof TIERS !== 'undefined' ? TIERS[tier] || '' : '', mythic: !!(D && D.mythic), glow, x: c.x, y: c.y, name: c.life.name });
    }
    return out.sort((a, b) => b.score - a.score);
  };
  PR.creature = (i) => world.creatures[i];
  PR.info = () => ({ W: world.W, H: world.H, days: world.days, tier: world.erosion.tier, zone: tierName(world, world.erosion.tier),
    fathoms: Math.round(pondFathoms(world)), title: typeof pondTitle === 'function' ? pondTitle(world) : world.seed, animals: world.creatures.filter((c) => c.life).length,
    species: new Set(world.creatures.filter((c) => c.life).map((c) => c.species)).size });
})();
