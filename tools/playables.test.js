'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/platform.js'), 'utf8');
function setup({ load = async () => '', save = async () => {}, muted = false, web = false } = {}) {
  const calls = [], events = {}, frames = [];
  const context = {
    TextEncoder, console, document: { hidden: false, documentElement: { dataset: web ? {} : { platform: 'youtube' }, toggleAttribute() {} } },
    requestAnimationFrame: (fn) => frames.push(fn),
    addEventListener() {},
    ytgame: {
      IN_PLAYABLES_ENV: true,
      game: { loadData: load, saveData: async (s) => { calls.push(['save', JSON.parse(s)]); await save(s); },
        firstFrameReady: () => calls.push(['first']), gameReady: () => calls.push(['ready']) },
      engagement: { sendScore: async (s) => calls.push(['score', s.value]) },
      health: { logWarning: () => calls.push(['warning']), logError() {} },
      system: { isAudioEnabled: () => !muted, onAudioEnabledChange: fn => events.audio = fn,
        onPause: fn => events.pause = fn, onResume: fn => events.resume = fn },
    },
  };
  context.window = context;
  Object.defineProperty(context, 'localStorage', { get() { throw Error('Forbidden browser persistence'); } });
  vm.createContext(context); vm.runInContext(source, context);
  return { platform: context.PondPlatform, calls, events, frames };
}
const pond = (seed, payload = '') => ({ v: 1, seed, opts: {}, size: [360, 300], creatures: [], rocks: [], plants: [], payload });
const info = (seed, depth = 2) => ({ seed, depth, savedAt: Date.now() });

test('website path does not invoke SDK and keeps browser visibility behavior', async () => {
  const { platform, calls } = setup({ web: true, load: () => { throw Error('Must not load SDK data'); } });
  await platform.ready; platform.gameReady();
  assert.equal(platform.playables, false); assert.equal(calls.length, 0);
});
test('signals are ordered and sent once', async () => {
  const { platform, calls, frames } = setup(); await platform.ready;
  frames[0](); platform.gameReady(); platform.gameReady();
  assert.deepEqual(calls.map(c => c[0]), ['first', 'ready']);
});
test('restores cache before any save, preserves prior best depth', async () => {
  let finish;
  const { platform, calls } = setup({ load: () => new Promise(ok => finish = ok) });
  assert.throws(() => platform.storePond(pond('new'), info('new')), /not loaded/);
  assert.equal(calls.length, 0);
  finish(JSON.stringify({ v: 1, bestDepth: 12, storage: { 'pond.pins': '["pointer"]' } }));
  await platform.ready;
  assert.equal(platform.storage.getItem('pond.pins'), '["pointer"]');
  platform.storePond(pond('new'), info('new', 3)); await platform.flush();
  assert.equal(calls[0][1].bestDepth, 12); assert.equal(calls[1][1], 12);
});
test('failed or unsupported loads never overwrite cloud progress', async () => {
  for (const load of [async () => { throw Error('offline'); }, async () => '{bad json', async () => JSON.stringify({ v: 2, bestDepth: 2, storage: {} })]) {
    const { platform, calls } = setup({ load });
    await assert.rejects(platform.ready);
    assert.throws(() => platform.storePond(pond('new'), info('new')));
    await platform.flush(); assert.equal(calls.length, 0);
  }
});
test('cloud writes are serialized and the newest save wins', async () => {
  let release; const pending = new Promise(ok => release = ok); let count = 0;
  const { platform, calls } = setup({ save: async () => { if (++count === 1) await pending; } });
  await platform.ready; platform.storePond(pond('a', 'old'), info('a', 4));
  await Promise.resolve(); platform.storePond(pond('a', 'new'), info('a', 8));
  assert.equal(count, 1); release(); await platform.flush();
  const writes = calls.filter(c => c[0] === 'save');
  assert.equal(writes.length, 2);
  assert.equal(JSON.parse(writes[1][1].storage['procedural-pond.save.a']).payload, 'new');
  assert.equal(platform.saveStatus, 'saved');
});
test('failed saves are visible and retry on the next autosave', async () => {
  let fail = true; const { platform } = setup({ save: async () => { if (fail) throw Error('offline'); } });
  await platform.ready; platform.storePond(pond('a'), info('a')); await platform.flush();
  assert.equal(platform.saveStatus, 'error'); fail = false;
  platform.storePond(pond('a', 'new'), info('a')); await platform.flush();
  assert.equal(platform.saveStatus, 'saved');
});
test('save quota evicts old ponds but never replaces a valid save with an oversized current pond', async () => {
  const { platform } = setup(); await platform.ready;
  platform.storePond(pond('a', 'x'.repeat(900000)), info('a'));
  await platform.flush();
  platform.storePond(pond('b', 'x'.repeat(900000)), info('b'));
  await platform.flush();
  assert.equal(platform.storage.getItem('procedural-pond.save.a'), null);
  const before = platform.storage.getItem('procedural-pond.save.b');
  assert.throws(() => platform.storePond(pond('b', 'x'.repeat(1600000)), info('b')), /limit/);
  assert.equal(platform.storage.getItem('procedural-pond.save.b'), before);
});
test('host mute gates late-created audio, pause/resume preserves user sound choice', async () => {
  const { platform, events } = setup({ muted: true }); await platform.ready;
  const ctx = { destination: {}, suspend: async () => {}, resume: async () => {}, createGain: () => ({ gain: { value: 1 }, connect() {} }) };
  const gain = platform.audioOutput(ctx, () => false);
  assert.equal(gain.gain.value, 0); events.audio(true); assert.equal(gain.gain.value, 1);
  let pauses = 0, resumes = 0;
  platform.onPause(() => pauses++); platform.onResume(() => resumes++);
  events.pause(); events.pause(); assert.equal(platform.paused, true); assert.equal(gain.gain.value, 0);
  events.resume(); assert.equal(platform.paused, false); assert.equal(gain.gain.value, 1);
  assert.equal(pauses, 1); assert.equal(resumes, 1);
});
