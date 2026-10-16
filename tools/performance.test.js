'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function rig() {
  let now = 100, calls = [];
  const readout = { textContent: '' };
  const c = vm.createContext({ performance: { now: () => now }, document: { getElementById: () => readout },
    buildLights: (w, rect, shadows = true) => { calls.push({w, rect: [...rect], shadows}); return { version: calls.length }; } });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../js/performance.js'), 'utf8'), c);
  const api = vm.runInContext('({performanceOptions,performanceFrame,performanceLights,resetPerformance,PERFORMANCE})', c);
  return { ...api, calls, readout, time: (n) => { now = n; } };
}
test('60 FPS uses reversible visual overrides; photos and bones keep chosen settings', () => {
  const R = rig(), opts = { performance: 'quality', renderer: 'cpu', waves: 'mesh', hdWaves: true, shadows: true, fine: true, volumetrics: true, speed: 3, life: true }, w = { opts };
  assert.equal(R.performanceOptions(w), opts);
  opts.performance = '60fps'; const effective = R.performanceOptions(w);
  assert.equal(effective.renderer, 'gpu'); assert.equal(effective.waves, 'classic');
  for (const key of ['hdWaves','shadows','fine','volumetrics']) assert.equal(effective[key], false);
  assert.equal(effective.life, true); assert.equal(effective.speed, 3);
  assert.equal(opts.waves, 'mesh'); assert.equal(opts.shadows, true); assert.equal(opts.volumetrics, true);
  assert.equal(R.performanceOptions(w, true), opts); w.bones = true; assert.equal(R.performanceOptions(w), opts);
  w.bones = false; opts.performance = 'quality'; assert.equal(R.performanceOptions(w), opts);
});
test('detail adapts with hysteresis and ignores suspension; FPS reports measured frames', () => {
  const R = rig(), w = { opts: { performance: '60fps' } };
  for (let i = 0; i < 400; i++) R.performanceFrame(w, 23, 1/60, 100 + i * 1000/60);
  assert.equal(R.PERFORMANCE.level, 2); assert.ok(R.PERFORMANCE.fps >= 59 && R.PERFORMANCE.fps <= 61);
  assert.match(R.readout.textContent, /60 FPS target/);
  R.performanceFrame(w, 1000, 1, 100 + 399 * 1000/60 + 1000);
  assert.ok(R.PERFORMANCE.fps < 55, 'FPS measurement must include long hitches');
  R.resetPerformance(); R.performanceFrame(w, 2000, 30, 30000); assert.equal(R.PERFORMANCE.level, 0);
  for (let i = 0; i < 400; i++) R.performanceFrame(w, 23, 1/60, 31000 + i * 1000/60);
  for (let i = 0; i < 720; i++) R.performanceFrame(w, 7, 1/60, 40000 + i * 1000/60);
  assert.equal(R.PERFORMANCE.level, 0);
  R.resetPerformance(); w.opts.performance = 'quality'; R.performanceFrame(w, 30, .02, 70000); assert.equal(R.PERFORMANCE.frames, 0);
});
test('light cache refreshes at 15 Hz and immediately on pan, pond, terrain, build or photo changes', () => {
  const R = rig(), w = { opts: {performance: '60fps'}, raster: {}, shore: {}, structures: [] }, rect = [10,20,110,120];
  const a = R.performanceLights(w, rect); R.time(130); assert.equal(R.performanceLights(w, rect), a);
  R.time(168); assert.notEqual(R.performanceLights(w, rect), a); assert.equal(R.calls.length, 2);
  R.performanceLights(w, [11,20,111,120]); assert.equal(R.calls.length, 3);
  w.shore = {}; R.performanceLights(w, rect); assert.equal(R.calls.length, 4);
  w.raster = {}; R.performanceLights(w, rect); assert.equal(R.calls.length, 5);
  w.structures.push({}); R.performanceLights(w, rect); assert.equal(R.calls.length, 6);
  const other = {...w}; R.performanceLights(other, rect); assert.equal(R.calls.length, 7);
  R.performanceLights(other, rect, true); assert.equal(R.calls.at(-1).shadows, true);
  R.performanceLights(other, rect); assert.equal(R.calls.length, 9); assert.equal(R.calls.at(-1).shadows, false);
  const map = R.performanceLights(other, rect); map.version++; R.performanceLights(other, rect); assert.equal(R.calls.length, 10);
  other.opts.performance = 'quality'; R.performanceLights(other, rect); R.performanceLights(other, rect); assert.equal(R.calls.length, 12);
});
