'use strict';
// Device-local visual budget. This never changes the pond's simulation speed.
const PERFORMANCE = { level: 0, ema: 16, over: 0, under: 0, frames: 0, since: 0, fps: 0, lights: null };
const performanceActive = (w) => w.opts.performance === '60fps';
function performanceOptions(w, full = false) {
  return performanceActive(w) && !full && !w.bones
    ? { ...w.opts, renderer: 'gpu', waves: 'classic', hdWaves: false, volumetrics: false, fine: false, shadows: false }
    : w.opts;
}
function resetPerformance() {
  Object.assign(PERFORMANCE, { level: 0, ema: 16, over: 0, under: 0, frames: 0, since: 0, fps: 0, lights: null });
}
function performanceFrame(w, work, elapsed, now) {
  const P = PERFORMANCE;
  if (!performanceActive(w)) return;
  // Ignore suspension and startup stalls when choosing lasting visual detail.
  if (elapsed > 0 && elapsed < .15 && work < 150) {
    P.ema += (work - P.ema) * .08;
    P.over = P.ema > 16 ? P.over + elapsed : 0;
    P.under = P.ema < 11 ? P.under + elapsed : 0;
    if (P.over > 1.5 && P.level < 2) { P.level++; P.over = P.under = 0; }
    else if (P.under > 5 && P.level > 0) { P.level--; P.over = P.under = 0; }
  }
  if (!P.since) P.since = now;
  P.frames++;
  if (now - P.since >= 1000) {
    P.fps = Math.round(P.frames * 1000 / (now - P.since)); P.frames = 0; P.since = now;
    const readout = document.getElementById('performance-fps');
    const fallback = typeof CGL !== 'undefined' && CGL.failed ? ' · CPU fallback' : '';
    if (readout) readout.textContent = `60 FPS target · ${P.fps} FPS${fallback}`;
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
