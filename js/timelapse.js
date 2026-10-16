'use strict';
// The pond's own timelapse. Each pond day a small picture of the whole pond is kept in this browser
// (IndexedDB, by seed; never in the save or the link), and the score panel plays the pictures back as the
// pond's history, and can save that as a video. Pictures are anchored on the beach side, so the pond is
// seen to grow out into the deep.
const TIMELAPSE = { db: null, max: 240, longest: 960, busy: false, dialog: null };
const TL_STORE = 'frames';

function tlDB() {
  if (TIMELAPSE.db) return TIMELAPSE.db;
  TIMELAPSE.db = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
    const req = indexedDB.open('pond-timelapse', 1);
    req.onupgradeneeded = () => req.result.createObjectStore(TL_STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  TIMELAPSE.db.catch(() => { TIMELAPSE.db = null; });
  return TIMELAPSE.db;
}
const tlRange = (seed) => IDBKeyRange.bound(`${seed}|`, `${seed}|￿`);
const tlId = (seed, day) => `${seed}|${String(day).padStart(7, '0')}`;
function tlReq(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function tlStore(mode) { const db = await tlDB(); return db.transaction(TL_STORE, mode).objectStore(TL_STORE); }

// Every picture of a pond, oldest first.
async function timelapseFrames(seed) {
  try { return await tlReq((await tlStore('readonly')).getAll(tlRange(seed))); } catch { return []; }
}
async function timelapseCount(seed) {
  try { return await tlReq((await tlStore('readonly')).count(tlRange(seed))); } catch { return 0; }
}
// A pond deleted from Your ponds takes its pictures with it.
async function timelapseForget(seed) {
  try { await tlReq((await tlStore('readwrite')).delete(tlRange(seed))); } catch { /* storage unavailable */ }
}

// (From the game's tick: game.js.) One picture a pond day, at midday when the pond is in full light, taken
// just after this frame so the day's own work isn't held up. Opening a pond doesn't take one at once.
function timelapseTick(w) {
  const noon = Math.floor((w.days || 0) - 0.55);
  if (TIMELAPSE.seed !== w.seed || TIMELAPSE.noon == null || noon < TIMELAPSE.noon) { TIMELAPSE.seed = w.seed; TIMELAPSE.noon = noon; return; }
  if (noon === TIMELAPSE.noon) return;
  TIMELAPSE.noon = noon;
  if (TIMELAPSE.busy || w !== world || w.observe || w.noSave || !w.game || !w.raster || document.hidden) return;
  // (A very big pond costs more to draw whole: it keeps every third day instead.)
  if (w.W * w.H > 8e6 && noon % 3) return;
  TIMELAPSE.busy = true;
  setTimeout(() => timelapseCapture(w).catch(() => {}).finally(() => { TIMELAPSE.busy = false; }), 0);
}

async function timelapseCapture(w) {
  if (w !== world || !w.raster) return;
  const seed = w.seed, day = Math.floor(w.days || 0), E = w.erosion || {};
  // Draw the whole pond (as Photo does, without health bars), copy it down, and put the view back before the
  // browser paints.
  const bars = w.opts.bars;
  w.opts.bars = false;
  try { render(true); } finally { w.opts.bars = bars; }
  const s = Math.min(1, TIMELAPSE.longest / Math.max(w.W, w.H)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w.W * s)); c.height = Math.max(1, Math.round(w.H * s));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, c.width, c.height);
  render();
  const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/webp', 0.82));
  if (!blob) return;
  const frame = { id: tlId(seed, day), seed, day, W: w.W, H: w.H, side: w.shoreSide ?? 0, tier: E.tier || 0,
    zone: typeof tierName === 'function' ? tierName(w, E.tier || 0) : '', fathoms: typeof pondFathoms === 'function' ? Math.round(pondFathoms(w)) : 0, blob };
  const st = await tlStore('readwrite');
  // A pond begun again from day 1 starts a new history.
  const keys = await tlReq(st.getAllKeys(tlRange(seed)));
  const lastDay = keys.length ? Number(String(keys[keys.length - 1]).split('|')[1]) : -1;
  if (lastDay > day) { await tlReq(st.delete(tlRange(seed))); keys.length = 0; }
  await tlReq(st.put(frame));
  if (!keys.includes(frame.id)) keys.push(frame.id);
  // Past the limit, every other picture of the older half goes: the whole history stays, more thinly.
  if (keys.length > TIMELAPSE.max) {
    const st2 = await tlStore('readwrite'), half = Math.floor(keys.length / 2);
    for (let i = 1; i < half; i += 2) st2.delete(keys[i]);
  }
}

// ---- the viewer --------------------------------------------------------------------------------------------
const TL_SPEEDS = { slow: 4, normal: 8, fast: 16 }; // pictures a second
const TL_VOID = '#050d12';

async function openTimelapse(w) {
  if (TIMELAPSE.dialog) TIMELAPSE.dialog.close();
  const frames = await timelapseFrames(w.seed);
  const dialog = document.createElement('dialog');
  dialog.id = 'timelapse'; dialog.className = 'world-mystery timelapse';
  dialog.setAttribute('aria-labelledby', 'timelapse-title');
  dialog.innerHTML = `<button type="button" class="tl-dismiss" aria-label="Close timelapse" autofocus>×</button>
    <h2 id="timelapse-title">Timelapse</h2>
    <div class="tl-stage"><canvas class="tl-canvas" aria-label="The pond, a picture each day"></canvas></div>
    <div class="tl-controls">
      <button type="button" class="tl-play" aria-label="Play">▶</button>
      <input type="range" class="tl-scrub" min="0" value="0" step="1" aria-label="Day">
      <select class="tl-speed" aria-label="Speed"><option value="slow">Slow</option><option value="normal" selected>Normal</option><option value="fast">Fast</option></select>
    </div>
    <p class="tl-label" aria-live="polite"></p>
    <button type="button" class="tl-save">Save as video</button>
    <p class="tl-note"></p>`;
  document.body.appendChild(dialog);
  TIMELAPSE.dialog = dialog;
  const $q = (s) => dialog.querySelector(s), cv = $q('.tl-canvas'), g = cv.getContext('2d'), scrub = $q('.tl-scrub'), play = $q('.tl-play');
  const note = $q('.tl-note'), label = $q('.tl-label'), save = $q('.tl-save');
  const state = { i: 0, playing: false, acc: 0, last: 0, raf: 0, rec: null, cache: new Map(), loading: new Set(), alive: true };
  const close = () => { state.alive = false; cancelAnimationFrame(state.raf); if (state.rec) state.rec.stop(); for (const b of state.cache.values()) b.close && b.close(); dialog.close(); };
  dialog.addEventListener('close', () => { if (state.alive) close(); dialog.remove(); if (TIMELAPSE.dialog === dialog) TIMELAPSE.dialog = null; });
  $q('.tl-dismiss').addEventListener('click', close);
  dialog.showModal();

  if (!frames.length) {
    $q('.tl-stage').hidden = true; $q('.tl-controls').hidden = true; save.hidden = true;
    note.textContent = 'No pictures yet. The pond keeps one each day while you play, in this browser. Come back after a few pond days.';
    return;
  }
  note.textContent = `${frames.length} ${frames.length === 1 ? 'picture' : 'pictures'}, one a day, kept in this browser.`;
  scrub.max = String(frames.length - 1);

  // The stage is the latest pond's shape; earlier, smaller ponds sit against the beach side of it.
  const last = frames[frames.length - 1], boxW = Math.min(860, innerWidth - 60), boxH = Math.min(innerHeight * 0.58, 520);
  const S = Math.min(boxW / last.W, boxH / last.H);
  cv.width = Math.round(last.W * S); cv.height = Math.round(last.H * S);
  const place = (f) => {
    const dw = f.W * S, dh = f.H * S, alongX = f.side === 0 || f.side === 1, deepFirst = f.side === 1 || f.side === 3;
    // (Deep on the left or top: the pond grew by shifting, so its beach is the far edge.)
    return [alongX && deepFirst ? cv.width - dw : 0, !alongX && deepFirst ? cv.height - dh : 0, dw, dh];
  };
  const bitmap = (i) => {
    if (state.cache.has(i)) return state.cache.get(i);
    if (!state.loading.has(i) && frames[i]) {
      state.loading.add(i);
      createImageBitmap(frames[i].blob).then((b) => {
        state.loading.delete(i);
        if (!state.alive) { b.close(); return; }
        state.cache.set(i, b);
        if (state.cache.size > 12) for (const k of state.cache.keys()) { if (Math.abs(k - state.i) > 4) { state.cache.get(k).close(); state.cache.delete(k); } if (state.cache.size <= 12) break; }
        if (i === state.i) draw();
      }).catch(() => state.loading.delete(i));
    }
    return null;
  };
  const caption = (f) => `Day ${f.day + 1} · ${f.zone}${f.fathoms ? ` · ${fmt(f.fathoms)} fathoms` : ''}`;
  const draw = () => {
    const f = frames[state.i], b = bitmap(state.i);
    for (let k = 1; k <= 3; k++) bitmap(state.i + k);
    if (!b) return;
    g.fillStyle = TL_VOID; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true;
    const [x, y, dw, dh] = place(f);
    g.drawImage(b, x, y, dw, dh);
    // The day and the depth, and where it's from, burned in: they go with the video.
    const fs = Math.max(11, Math.round(cv.height / 26));
    g.font = `${fs}px ui-rounded, 'Trebuchet MS', Verdana, sans-serif`; g.textBaseline = 'bottom';
    g.fillStyle = '#021014cc'; g.fillText(caption(f), fs * 0.8 + 1, cv.height - fs * 0.6 + 1);
    g.fillStyle = '#e6f4ee'; g.fillText(caption(f), fs * 0.8, cv.height - fs * 0.6);
    const tag = 'pond.nz', tw = g.measureText(tag).width;
    g.fillStyle = '#021014cc'; g.fillText(tag, cv.width - tw - fs * 0.8 + 1, cv.height - fs * 0.6 + 1);
    g.fillStyle = '#f5d66b'; g.fillText(tag, cv.width - tw - fs * 0.8, cv.height - fs * 0.6);
    scrub.value = String(state.i);
    label.textContent = caption(f);
  };
  const setPlaying = (on) => {
    state.playing = on; play.textContent = on ? '❚❚' : '▶'; play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if (on) { if (state.i >= frames.length - 1) state.i = 0; state.last = performance.now(); state.acc = 0; tick(state.last); }
    else cancelAnimationFrame(state.raf);
  };
  const tick = (now) => {
    if (!state.alive || !state.playing) return;
    state.acc += (now - state.last) / 1000 * TL_SPEEDS[$q('.tl-speed').value]; state.last = now;
    while (state.acc >= 1 && state.i < frames.length - 1 && state.cache.has(state.i + 1)) { state.acc -= 1; state.i++; }
    draw();
    if (state.i >= frames.length - 1) {
      if (state.rec) { if ((state.hold += 1 / 60) > 1.5) state.rec.stop(); } else { setPlaying(false); return; }
    }
    state.raf = requestAnimationFrame(tick);
  };
  play.addEventListener('click', () => setPlaying(!state.playing));
  scrub.addEventListener('input', () => { setPlaying(false); state.i = Number(scrub.value); draw(); });

  // Saving: the stage recorded as it plays from the first day to the last.
  const mime = typeof MediaRecorder !== 'undefined' && ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime || !cv.captureStream) { save.disabled = true; save.textContent = 'Saving as video isn’t supported in this browser'; }
  save.addEventListener('click', () => {
    if (state.rec || !mime) return;
    const chunks = [], rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6e6 });
    state.rec = rec; state.hold = 0;
    for (const el of [play, scrub, save, $q('.tl-speed')]) el.disabled = true;
    save.textContent = 'Recording…';
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      state.rec = null; state.playing = false; play.textContent = '▶';
      for (const el of [play, scrub, save, $q('.tl-speed')]) el.disabled = false;
      save.textContent = 'Save as video';
      if (!chunks.length || !state.alive) return;
      const blob = new Blob(chunks, { type: mime.split(';')[0] }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `pond-${w.seed}-timelapse.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    };
    state.i = 0; draw(); rec.start(250);
    state.playing = false; setPlaying(true);
  });
  state.i = frames.length - 1;
  draw();
}

function initTimelapse() {
  const b = document.getElementById('score-timelapse');
  if (!b) return;
  b.addEventListener('click', () => { if (world && !world.observe) openTimelapse(world); });
}
initTimelapse();
