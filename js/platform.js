'use strict';
// The website keeps its existing storage and services. The packaged Playable uses
// an in-memory cache hydrated by the SDK before the other scripts are loaded.
// tools/build_playables.py routes that build's storage references to this cache.
(() => {
  const playables = document.documentElement.dataset.platform === 'youtube';
  const itch = document.documentElement.dataset.platform === 'itch';
  const sdk = playables && typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV ? ytgame : null;
  function memoryStorage() {
    const cache = Object.create(null);
    Object.defineProperties(cache, {
      getItem: { value: (key) => Object.hasOwn(cache, key) ? cache[key] : null },
      setItem: { value: (key, value) => { cache[key] = String(value); } },
      removeItem: { value: (key) => { delete cache[key]; } },
    });
    return cache;
  }
  const storage = memoryStorage(), session = memoryStorage(), outputs = [], media = new Set();
  const pauseListeners = [], resumeListeners = [];
  let loaded = !sdk, paused = false, audio = sdk ? sdk.system.isAudioEnabled() : true;
  let first = false, ready = false, bestDepth = 0, sentScore = -1;
  let revision = 0, savedRevision = 0, inFlight = null, error = false;
  const limit = 3 * 1024 * 1024 - 1024;
  // SDK strings are UTF-16. Bound both encodings conservatively.
  const bytes = (s) => Math.max(s.length * 2, new TextEncoder().encode(s).length);
  const envelope = (cache = storage, best = bestDepth) => JSON.stringify({ v: 1, bestDepth: best, storage: cache });
  const warn = () => { if (sdk) sdk.health.logWarning(); };
  function updateAudio() {
    const allowed = audio && !paused;
    for (const { ctx, gain, wanted } of outputs) {
      gain.gain.value = allowed ? 1 : 0;
      if (!allowed) ctx.suspend().catch(() => {});
      else if (wanted()) ctx.resume().catch(() => {});
    }
    if (!allowed) for (const a of media) a.pause();
  }
  async function load() {
    if (loaded) return;
    const raw = await sdk.game.loadData();
    if (raw) {
      if (typeof raw !== 'string' || bytes(raw) > limit) throw Error('Invalid pond save');
      const d = JSON.parse(raw);
      if (d.v !== 1 || !d.storage || typeof d.storage !== 'object' || Array.isArray(d.storage) ||
          !Number.isSafeInteger(d.bestDepth) || d.bestDepth < 0) throw Error('Unsupported pond save');
      const allowed = /^(procedural-pond\.(opts|saves|save\.[a-z0-9-]{1,40})|pond\.[a-zA-Z]+)$/;
      for (const [key, value] of Object.entries(d.storage)) {
        if (!allowed.test(key) || typeof value !== 'string') throw Error('Invalid pond settings');
        if (key === 'procedural-pond.saves') {
          const list = JSON.parse(value);
          if (!Array.isArray(list) || list.length > 12 || list.some(s => !s || !/^[a-z0-9-]{1,40}$/.test(s.seed) || !Number.isFinite(s.savedAt))) throw Error('Invalid pond index');
        }
        if (key.startsWith('procedural-pond.save.')) {
          const pond = JSON.parse(value);
          if (pond.v !== 1 || key !== 'procedural-pond.save.' + pond.seed || !pond.opts || !Array.isArray(pond.size) ||
              !Array.isArray(pond.creatures) || !Array.isArray(pond.plants) || !Array.isArray(pond.rocks)) throw Error('Invalid saved pond');
        }
      }
      Object.assign(storage, d.storage);
      bestDepth = d.bestDepth;
    }
    loaded = true;
  }
  async function flush() {
    if (!playables || !loaded || !sdk || savedRevision === revision) return;
    if (inFlight) return inFlight;
    // Serial writes: an old request must never complete after a newer save.
    inFlight = (async () => {
      await Promise.resolve();
      while (savedRevision < revision) {
        const at = revision, text = envelope(), score = bestDepth;
        try {
          if (bytes(text) > limit) throw Error('Pond save is too large');
          await sdk.game.saveData(text);
          savedRevision = at; error = false;
          if (score > sentScore && !paused) {
            try { await sdk.engagement.sendScore({ value: score }); sentScore = score; }
            catch { warn(); } // Score failure must not invalidate a successful save.
          }
        } catch { error = true; warn(); break; }
      }
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  function storePond(d, info) {
    if (!loaded) throw Error('Cloud save has not loaded');
    const candidate = Object.assign(Object.create(null), storage);
    let list = JSON.parse(storage.getItem('procedural-pond.saves') || '[]').filter((s) => s.seed !== d.seed);
    list.unshift(info);
    candidate['procedural-pond.save.' + d.seed] = JSON.stringify(d);
    const best = Math.max(bestDepth, Math.floor(info.depth));
    for (;;) {
      candidate['procedural-pond.saves'] = JSON.stringify(list);
      if (list.length <= 12 && bytes(envelope(candidate, best)) <= limit) break;
      if (list.length <= 1) throw Error('This pond exceeds the cloud save limit');
      delete candidate['procedural-pond.save.' + list.pop().seed];
    }
    for (const key of Object.keys(storage)) delete storage[key];
    Object.assign(storage, candidate);
    bestDepth = best; revision++; error = false;
    void flush();
  }
  function firstFrame() {
    if (!sdk || first) return;
    first = true; sdk.game.firstFrameReady();
  }
  const platform = window.PondPlatform = {
    playables, itch, offline: playables || itch, storage, session, load, flush, storePond,
    get paused() { return paused; },
    get hidden() { return playables ? paused : document.hidden; },
    get audioAllowed() { return audio && !paused; },
    get bestDepth() { return bestDepth; },
    get saveStatus() { return !sdk ? 'preview' : error ? 'error' : savedRevision < revision ? 'pending' : 'saved'; },
    changed() { if (playables && loaded) { revision++; void flush(); } },
    firstFrame,
    gameReady() { if (!sdk || ready) return; firstFrame(); ready = true; sdk.game.gameReady(); },
    onPause(fn) { pauseListeners.push(fn); if (paused) fn(); },
    onResume(fn) { resumeListeners.push(fn); },
    waitActive() {
      if (!paused) return Promise.resolve();
      return new Promise((resolve) => {
        const resumed = () => { resumeListeners.splice(resumeListeners.indexOf(resumed), 1); resolve(); };
        resumeListeners.push(resumed);
      });
    },
    ask(message, accepted, cancelled = () => {}) {
      if (!playables && !itch) return window.confirm(message);
      if (paused || document.getElementById('pond-confirm')) return false;
      const focus = document.activeElement, wasPaused = world.paused;
      setPaused(true);
      const overlay = document.createElement('div'), box = document.createElement('div');
      overlay.id = 'pond-confirm'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'pond-confirm-text');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:#000a';
      box.style.cssText = 'max-width:480px;max-height:80vh;overflow:auto;padding:24px;background:#0d2347;color:#e8f0ff;border:2px solid #7fd8e8;font:16px/1.5 system-ui';
      const text = document.createElement('p'); text.id = 'pond-confirm-text'; text.textContent = message;
      const no = document.createElement('button'), yes = document.createElement('button');
      no.type = yes.type = 'button'; no.textContent = 'Cancel'; yes.textContent = 'Confirm';
      for (const b of [no, yes]) b.style.cssText = 'font:inherit;min-height:44px;margin:4px;padding:8px 16px;color:#e8f0ff;background:#1b4f7d;border:2px solid #7fd8e8';
      const finish = (ok) => {
        overlay.remove(); setPaused(wasPaused); if (focus?.isConnected) focus.focus();
        if (ok) accepted(); else cancelled();
      };
      no.onclick = () => finish(false); yes.onclick = () => finish(true);
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
        else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === no ? yes : no).focus(); }
      });
      box.append(text, no, yes); overlay.append(box); document.body.append(overlay); no.focus();
      return false;
    },
    audioOutput(ctx, wanted = () => true) {
      if (!playables) return ctx.destination;
      const gain = ctx.createGain(); gain.gain.value = audio && !paused ? 1 : 0;
      gain.connect(ctx.destination); outputs.push({ ctx, gain, wanted });
      if (!audio || paused) ctx.suspend().catch(() => {});
      return gain;
    },
    playMedia(a) {
      if (!platform.audioAllowed) return;
      media.add(a); a.addEventListener('ended', () => media.delete(a), { once: true });
      a.play().catch(() => media.delete(a));
    },
  };
  if (sdk) {
    sdk.system.onAudioEnabledChange((on) => { audio = on; updateAudio(); });
    sdk.system.onPause(() => {
      if (paused) return;
      paused = true; document.documentElement.toggleAttribute('data-host-paused', true); updateAudio();
      for (const fn of pauseListeners) fn();
      void flush();
    });
    sdk.system.onResume(() => {
      if (!paused) return;
      paused = false; document.documentElement.toggleAttribute('data-host-paused', false); updateAudio();
      for (const fn of [...resumeListeners]) fn();
    });
    // Block interaction while the host has paused us, even if a control retains focus.
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'wheel', 'keydown', 'keyup', 'input', 'change']) {
      window.addEventListener(type, (e) => {
        if (paused) { e.stopImmediatePropagation(); if (e.cancelable && e.key !== 'Escape') e.preventDefault(); }
      }, { capture: true, passive: false });
    }
    window.addEventListener('error', () => sdk.health.logError());
    window.addEventListener('unhandledrejection', () => sdk.health.logError());
    // The opaque loading screen already exists in index.html.
    requestAnimationFrame(firstFrame);
  }
  platform.ready = load();
  platform.ready.catch(() => {}); // The separately loaded bootstrap presents load failures and offers retry.
})();
