'use strict';
// Device-local visual budget. This never changes the pond's simulation speed.
const PERFORMANCE = {};
resetPerformance();
const performanceTier = (w) => w.opts.performance === '60fps' ? 2 : w.opts.performance === 'auto' ? PERFORMANCE.autoTier : 0;
const performanceActive = (w) => performanceTier(w) > 0;
function performanceOptions(w, full = false) {
  const tier = performanceTier(w);
  if (!tier || full || w.bones) return w.opts;
  return { ...w.opts, renderer: 'gpu', volumetrics: false, fine: false, shadows: false,
    ...(tier >= 2 ? { waves: 'classic', hdWaves: false } : {}) };
}
function resetPerformance() {
  Object.assign(PERFORMANCE, { level: 0, ema: 16, over: 0, under: 0, frames: 0, since: 0, fps: 0, lights: null,
    world: null, inst: null, mode: null, autoTier: 0, warmup: 3, autoOver: 0, autoUnder: 0, recovery: 20, trial: false, heavy: 0 });
}
function performanceReadout(w) {
  const P = PERFORMANCE, auto = w.opts.performance === 'auto', tier = performanceTier(w);
  const readout = document.getElementById('performance-fps'), detail = document.getElementById('performance-detail');
  const fallback = typeof CGL !== 'undefined' && CGL.failed && tier ? ' · CPU fallback' : '';
  if (readout) readout.textContent = `${auto ? 'Automatic' : '60 FPS target'} · ${P.fps ? `${P.fps} FPS` : 'measuring…'}${fallback}`;
  if (detail) detail.textContent = tier === 2 ? 'Classic water · lighter lighting and detail'
    : tier === 1 ? 'Your water · lighter lighting and detail' : 'Your visual settings · watching frame times';
}
function performanceAuto(w, work, elapsed) {
  const P = PERFORMANCE;
  // A paused ecosystem is cheaper; don't mistake that for lasting headroom.
  if (w.paused || w.bones || document.hidden || elapsed <= 0 || elapsed >= 1 || work >= 1000) {
    P.warmup = 3; P.autoOver = P.autoUnder = P.heavy = 0; return;
  }
  if (elapsed >= .15 || work >= 150) {
    // Ignore an isolated hitch, but still help a device stuck at very low FPS.
    if (++P.heavy < 4) { P.warmup = 3; P.autoOver = P.autoUnder = 0; return; }
    elapsed = Math.min(elapsed, .1); P.ema = Math.max(P.ema, 50);
  } else {
    P.heavy = 0;
  }
  if (P.warmup > 0) { P.warmup -= elapsed; P.autoOver = P.autoUnder = 0; return; }
  // The work threshold avoids treating an idle 30 Hz display as a slow renderer.
  const slow = P.ema > 20 || (elapsed > .023 && P.ema > 12);
  P.autoOver = slow ? P.autoOver + elapsed : 0;
  P.autoUnder = P.ema < 10 && elapsed < .022 ? P.autoUnder + elapsed : 0;
  let next = P.autoTier;
  if (P.autoOver > 3 && next < 2) {
    next++;
    if (P.trial) P.recovery = Math.min(120, P.recovery * 2);
    P.trial = false;
  } else if (P.autoUnder > P.recovery && next > 0) { next--; P.trial = true; }
  if (next !== P.autoTier) {
    P.autoTier = next; P.warmup = 3; P.autoOver = P.autoUnder = P.over = P.under = 0;
    P.level = 0; P.lights = null;
    if (typeof syncPerformanceControls === 'function') syncPerformanceControls();
  }
}
function performanceFrame(w, work, elapsed, now) {
  const P = PERFORMANCE;
  if (P.world !== w || P.inst !== w.inst || P.mode !== w.opts.performance) {
    resetPerformance(); P.world = w; P.inst = w.inst; P.mode = w.opts.performance;
    if (typeof syncPerformanceControls === 'function') syncPerformanceControls();
  }
  if (w.opts.performance !== '60fps' && w.opts.performance !== 'auto') return;
  if (document.hidden) { P.since = 0; P.frames = 0; P.warmup = 3; P.autoOver = P.autoUnder = P.heavy = 0; return; }
  // Ignore suspension and startup stalls when choosing lasting visual detail.
  if (elapsed > 0 && elapsed < .15 && work < 150) {
    P.ema += (work - P.ema) * .08;
    P.over = P.ema > 16 ? P.over + elapsed : 0;
    P.under = P.ema < 11 ? P.under + elapsed : 0;
    if (performanceActive(w) && P.over > 1.5 && P.level < 2) { P.level++; P.over = P.under = 0; }
    else if (P.under > 5 && P.level > 0) { P.level--; P.over = P.under = 0; }
  }
  if (w.opts.performance === 'auto') performanceAuto(w, work, elapsed);
  if (!P.since) P.since = now;
  P.frames++;
  if (now - P.since >= 1000) {
    P.fps = Math.round(P.frames * 1000 / (now - P.since)); P.frames = 0; P.since = now;
    performanceReadout(w);
  }
}
function performanceLights(w, rect, full = false) {
  if (!performanceActive(w) || full || w.bones) { PERFORMANCE.lights = null; return buildLights(w, rect); }
  const P = PERFORMANCE, now = performance.now(), L = P.lights;
  if (!L || L.world !== w || L.raster !== w.raster || L.shore !== w.shore || L.structures !== w.structures.length ||
      (L.map && L.version !== L.map.version) || rect.some((v, i) => v !== L.rect[i]) || now - L.at >= 1000 / 15) {
    const map = buildLights(w, rect, false);
    P.lights = { world: w, raster: w.raster, shore: w.shore, structures: w.structures.length, rect: rect.slice(), at: now, map, version: map?.version };
  }
  return P.lights.map;
}
