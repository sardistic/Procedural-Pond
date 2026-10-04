'use strict';
// The entry screen's controller (index.html #entry). Loaded first, as its own file: the site's
// Content-Security-Policy allows no inline scripts.
// It draws its own rippling night pond (the real one stays hidden behind the screen until you enter), shows loading
// on the Enter button, and fills the Ponds, High scores and sign-in parts from the server. main.js calls
// Entry.status while it loads and Entry.ready when the pond is ready.
(() => {
  const $ = (id) => document.getElementById(id), root = $('entry');
  if (!root) return;
  root.classList.add('live'); // (so the stylesheet's own fallback fade never runs)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let skip = false;
  try { skip = localStorage.getItem('pond.skipEntry') === '1'; } catch { /* no storage */ }

  // ---- the night pond, and the glimpses of ponds in the list (js/entry-water.js) --------------------------------
  // Drawn in a worker, on canvases handed to it, so they keep moving while main.js builds the pond on this thread.
  // Without OffscreenCanvas they're drawn here instead (the same code, loaded as a plain script before this one).
  const cv = $('entry-bg');
  let worker = null, send = null;
  if (cv.transferControlToOffscreen && window.Worker) {
    try {
      worker = new Worker('js/entry-water.js?v=1');
      const off = cv.transferControlToOffscreen();
      worker.postMessage({ type: 'init', canvas: off, w: innerWidth, h: innerHeight, still }, [off]);
      send = (m, tr) => worker.postMessage(m, tr || []);
    } catch (e) { if (worker) worker.terminate(); worker = null; }
  }
  if (!send && window.EntryWater) {
    const handle = EntryWater.host();
    handle({ type: 'init', canvas: cv, w: innerWidth, h: innerHeight, still });
    send = (m) => handle(m);
  }
  if (!send) send = () => {};
  // (A row's canvas goes to the worker too, or stays here and is drawn here.)
  const handOver = (c) => (worker ? c.transferControlToOffscreen() : c);
  const stopWater = () => { send({ type: 'stop' }); send = () => {}; worker = null; };
  addEventListener('resize', () => { if (root.isConnected) send({ type: 'size', w: innerWidth, h: innerHeight }); });
  document.addEventListener('visibilitychange', () => send({ type: 'hidden', on: document.hidden }));
  // Your pointer trails ripples across the water; a click drops a big one.
  let lastPoke = 0;
  root.addEventListener('pointermove', (e) => { if (still || (e.target !== root && e.target !== cv) || e.timeStamp - lastPoke < 30) return; lastPoke = e.timeStamp; send({ type: 'poke', x: e.clientX, y: e.clientY, r: 1.6, d: 2.2 }); });
  root.addEventListener('pointerdown', (e) => { if (e.target === root || e.target === cv) send({ type: 'poke', x: e.clientX, y: e.clientY, r: 3, d: 16 }); });

  // ---- loading, shown on the Enter button --------------------------------------------------------------
  let loaded = 0, phase = 0;
  document.addEventListener('load', (e) => {
    if (phase || !e.target || e.target.tagName !== 'SCRIPT') return;
    loaded++;
    const total = Math.max(60, document.querySelectorAll('script[src]').length);
    set(null, 0.05 + 0.55 * Math.min(1, loaded / total));
  }, true);
  function set(text, p) {
    if (text) $('entry-status').textContent = text;
    if (p != null) {
      $('entry-bar').style.transform = `scaleX(${Math.max(0.04, Math.min(1, p))})`;
      if (!root.classList.contains('ready')) $('entry-label').textContent = `Loading ${Math.round(Math.min(1, p) * 100)}%`;
    }
  }
  let choose = null, waterPick = null;
  function pickWater(k) {
    waterPick = k;
    for (const b of root.querySelectorAll('[data-water]')) b.setAttribute('aria-pressed', String(b.dataset.water === k));
  }
  for (const b of root.querySelectorAll('[data-water]')) b.addEventListener('click', () => pickWater(b.dataset.water));
  $('entry-another').addEventListener('click', () => {
    const open = $('entry-choose').hidden;
    $('entry-choose').hidden = !open;
    $('entry-another').setAttribute('aria-expanded', String(open));
    if (open) root.querySelector('[data-water][aria-pressed="true"]')?.focus();
  });
  $('entry-create').addEventListener('click', () => done(true));
  // Enter with a new pond's choices applies them; Create makes another pond with them.
  function done(create) {
    if (!root.isConnected || root.classList.contains('gone') || !root.classList.contains('ready')) return;
    if (choose && choose.apply && (choose.fresh || create === true)) {
      try { choose.apply({ habitat: waterPick || choose.habitat, hard: $('entry-hard').checked, create: create === true }); } catch (e) { console.error(e); }
    }
    try { localStorage.setItem('pond.skipEntry', $('entry-skip').checked ? '1' : '0'); } catch { /* no storage */ }
    root.classList.add('gone');
    setTimeout(stopWater, 700); // (the water keeps moving while the screen fades)
    songStop(1.2); // (the music fades as you go in)
    // A splash as you dive in, if there's sound (the music on here, or the pond's sound switch).
    let pondSound = false;
    try { pondSound = !!JSON.parse(localStorage.getItem('procedural-pond.opts') || '{}').sound; } catch { /* no storage */ }
    if (songWanted || pondSound) { try { const a = new Audio('audio/sfx/ui_enter.mp3'); a.volume = 0.1; a.play().catch(() => {}); } catch { /* no audio */ } }
    setTimeout(() => root.remove(), 700);
    document.removeEventListener('keydown', key, true);
    if (window.Entry.onDone) window.Entry.onDone();
  }
  // Enter or Escape goes in, unless Enter is meant for a link, tab or question that has the focus. (Escape first
  // closes the brains diagram, if it's open.)
  function key(e) {
    if (e.key === 'Escape' && !$('entry-brains').hidden) { e.preventDefault(); e.stopPropagation(); closeBrains(); return; }
    if (!root.classList.contains('ready')) return;
    const el = document.activeElement, own = el && el !== document.body && el !== root && el !== $('entry-enter') && root.contains(el);
    if (e.key === 'Escape' || (e.key === 'Enter' && !own)) { e.preventDefault(); e.stopPropagation(); done(false); }
  }
  $('entry-enter').addEventListener('click', () => done(false));

  // ---- the brains diagram (from the FAQ) ----------------------------------------------------------------
  let brainsFrom = null;
  function closeBrains() { $('entry-brains').hidden = true; if (brainsFrom) brainsFrom.focus(); }
  $('entry-brains-open').addEventListener('click', (e) => { brainsFrom = e.currentTarget; $('entry-brains').hidden = false; $('entry-brains-close').focus(); });
  $('entry-brains-close').addEventListener('click', closeBrains);
  $('entry-brains').addEventListener('click', (e) => { if (e.target === $('entry-brains')) closeBrains(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.isConnected && !$('entry-brains').hidden && !root.classList.contains('ready')) { e.preventDefault(); closeBrains(); } }, true);

  // ---- music: the whole of Subdued Progression, quietly, while you're here --------------------------------
  // Its seventeen pieces (audio/music/) played back to back with no gap, looping, through a low gain. Sound needs
  // a click first, so a remembered "on" starts at the first click or key; entering fades it out.
  const SONG = { ctx: null, gain: null, on: false, files: null, next: 0, at: 0, timer: 0, sources: [] };
  const SONG_LEVEL = 0.16;
  // (Shown as wanted: on, it starts with your first click or key, as browsers require.)
  function soundLabel() { const on = SONG.on || songWanted; const b = $('entry-sound'); b.textContent = on ? '♪ Music on' : '♪ Music off'; b.setAttribute('aria-pressed', String(on)); }
  async function songFiles() {
    if (SONG.files) return SONG.files;
    const m = await fetch('audio/music.json', { cache: 'force-cache' }).then((r) => r.json());
    SONG.files = m.files.filter((f) => f.track === 'subdued-progression').sort((a, b) => a.n - b.n).map((f) => ({ url: `audio/music/${f.f}`, dur: f.atoms.reduce((a, x) => a + x.dur, 0) }));
    return SONG.files;
  }
  // Keep about twenty seconds queued: fetch and decode the next piece, start it exactly where the last one ends.
  async function songQueue() {
    if (!SONG.on || !SONG.ctx) return;
    const files = await songFiles();
    while (SONG.on && SONG.at - SONG.ctx.currentTime < 20) {
      const f = files[SONG.next % files.length];
      let buf;
      try { buf = await SONG.ctx.decodeAudioData(await fetch(f.url, { cache: 'force-cache' }).then((r) => r.arrayBuffer())); } catch { return; }
      if (!SONG.on) return;
      const src = SONG.ctx.createBufferSource();
      src.buffer = buf; src.connect(SONG.gain);
      const at = Math.max(SONG.at, SONG.ctx.currentTime + 0.05);
      src.start(at, 0, f.dur); // (each piece to its measured length, so the beat stays on the grid)
      SONG.sources.push(src); src.onended = () => { SONG.sources = SONG.sources.filter((s) => s !== src); };
      SONG.at = at + f.dur; SONG.next++;
    }
  }
  function songStart() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!SONG.ctx) {
      SONG.ctx = new AC(); SONG.gain = SONG.ctx.createGain(); SONG.gain.gain.value = 0;
      const lp = SONG.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; // (low and soft: it sits under the screen)
      SONG.gain.connect(lp).connect(SONG.ctx.destination);
    }
    if (SONG.ctx.state === 'suspended') SONG.ctx.resume();
    SONG.on = true;
    SONG.gain.gain.cancelScheduledValues(SONG.ctx.currentTime);
    SONG.gain.gain.setTargetAtTime(SONG_LEVEL, SONG.ctx.currentTime, 1.2);
    songQueue();
    clearInterval(SONG.timer); SONG.timer = setInterval(songQueue, 5000);
    return true;
  }
  function songStop(fade = 0.6) {
    SONG.on = false; clearInterval(SONG.timer);
    if (!SONG.ctx) return;
    const t = SONG.ctx.currentTime;
    SONG.gain.gain.cancelScheduledValues(t); SONG.gain.gain.setTargetAtTime(0, t, fade);
    const left = SONG.sources.slice(); SONG.sources = [];
    setTimeout(() => { for (const s of left) { try { s.stop(); } catch { /* already done */ } } SONG.at = 0; }, fade * 5000);
  }
  let songWanted = true; // (on unless you've turned it off here)
  try { songWanted = localStorage.getItem('pond.entryMusic') !== '0'; } catch { /* no storage */ }
  $('entry-sound').addEventListener('click', () => {
    if (SONG.on || songWanted) { songStop(); songWanted = false; } else { songStart(); songWanted = true; }
    try { localStorage.setItem('pond.entryMusic', songWanted ? '1' : '0'); } catch { /* no storage */ }
    soundLabel();
  });
  // (Remembered on: it starts with the first click or key on the screen.)
  const wake = (e) => { if (!songWanted || SONG.on || !root.isConnected || e.target === $('entry-sound')) return; if (songStart()) soundLabel(); };
  root.addEventListener('pointerdown', wake); document.addEventListener('keydown', wake);
  soundLabel();

  // ---- tabs ---------------------------------------------------------------------------------------------
  const tabs = ['ponds', 'faq'];
  function pick(k, focus) {
    for (const n of tabs) {
      const on = n === k, b = $(`et-${n}`);
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $(`ep-${n}`).hidden = !on;
      if (n === 'ponds') send({ type: 'rowsOn', on });
      if (on && focus) b.focus();
    }
    try { localStorage.setItem('pond.entryTab', k); } catch { /* no storage */ }
  }
  tabs.forEach((n, i) => {
    $(`et-${n}`).addEventListener('click', () => pick(n));
    $(`et-${n}`).addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); pick(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });
  try { const k = localStorage.getItem('pond.entryTab'); if (tabs.includes(k)) pick(k); } catch { /* no storage */ }

  // ---- the server's parts: public ponds, high scores, signing in ----------------------------------------
  const api = /^https?:$/.test(location.protocol) ? '/api' : null;
  const getJson = (path) => fetch(api + path, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const pondName = (p) => p.title || String(p.slug || p.id).split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const WATERS = { fresh: 'fresh', salt: 'salt', mixed: 'brackish' };
  const ago = (ms) => { const m = Math.max(0, (Date.now() - ms) / 60000); return m < 60 ? `${Math.max(1, Math.round(m))}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
  function row(p, rank, score, meta) {
    const li = node('li'), a = node('a'), cv = document.createElement('canvas');
    cv.className = 'row-bg'; cv.width = 128; cv.height = 16; cv.setAttribute('aria-hidden', 'true');
    a.href = `/${p.slug || p.id}`;
    a.append(node('span', 'rk', rank), node('span', 'nm', pondName(p)), node('span', 'sc', score), node('span', 'meta', meta));
    li.append(cv, a);
    rowBgs.push({ cv, p });
    return li;
  }

  // ---- each pond's row, a glimpse of it: its water, how deep, how grown, its life (drawn by entry-water.js) ----------
  let rowBgs = [];
  const sendRows = () => {
    const list = rowBgs.map(({ cv: c, p }) => ({ canvas: handOver(c), p: { id: p.id, slug: p.slug, habitat: p.habitat, depth: p.depth, days: p.days, animals: p.animals, species: p.species, rares: p.rares, updated: p.updated, best: p.best ? { tier: p.best.tier } : null } }));
    send({ type: 'rows', rows: list }, worker ? list.map((q) => q.canvas) : []);
  };
  const facts = (p) => [p.by ? `by ${p.by}` : null, p.habitat && WATERS[p.habitat] ? `${WATERS[p.habitat]} water` : null, p.animals != null ? `${p.animals} animals` : null, p.days != null ? `day ${Math.floor(p.days) + 1}` : null].filter(Boolean).join(' · ');
  let me = null, board = null;
  // Ponds and the leaderboard together, sorted by score, depth or what was lately alive.
  let sortBy = 'score';
  try { sortBy = localStorage.getItem('pond.entrySort') || 'score'; } catch { /* no storage */ }
  function renderPonds() {
    const box = $('ep-ponds'), out = [];
    rowBgs = [];
    if (me && me.user && me.ponds && me.ponds.length) {
      const ul = node('ul', 'list');
      for (const p of me.ponds.slice().sort((a, b) => b.updated - a.updated).slice(0, 6)) ul.append(row(p, '★', `${p.points} pts`, [p.habitat && WATERS[p.habitat] ? `${WATERS[p.habitat]} water` : null, `${p.animals} animals`, `day ${Math.floor(p.days || 0) + 1}`].filter(Boolean).join(' · ')));
      out.push(node('h2', null, 'Your ponds'), ul);
    }
    out.push(node('h2', null, board ? `Public ponds (${board.ponds})` : 'Public ponds'));
    if (!board) out.push(node('p', 'empty', api ? 'The pond list is unavailable right now.' : 'Public ponds show here on pond.nz.'));
    else if (!board.top.length) out.push(node('p', 'empty', 'No public ponds yet. Yours could be the first.'));
    else {
      const sorts = node('div', 'sorts');
      sorts.setAttribute('role', 'group'); sorts.setAttribute('aria-label', 'Sort ponds');
      for (const [k, label] of [['score', 'Score'], ['depth', 'Depth'], ['recent', 'Recent']]) {
        const b = node('button', null, label);
        b.type = 'button'; b.setAttribute('aria-pressed', String(sortBy === k));
        b.addEventListener('click', () => { sortBy = k; try { localStorage.setItem('pond.entrySort', k); } catch { /* no storage */ } renderPonds(); });
        sorts.append(b);
      }
      const order = { score: (a, b) => b.points - a.points, depth: (a, b) => b.depth - a.depth || b.points - a.points, recent: (a, b) => b.updated - a.updated }[sortBy] || ((a, b) => b.points - a.points);
      const ranked = sortBy !== 'recent', ul = node(ranked ? 'ol' : 'ul', ranked ? 'list ranked' : 'list');
      board.top.slice().sort(order).slice(0, 15).forEach((p, i) => ul.append(row(p, ranked ? String(i + 1) : '›',
        sortBy === 'depth' ? `${Number(p.depth).toLocaleString()} fm` : sortBy === 'recent' ? ago(p.updated) : `${p.points.toLocaleString()} pts`,
        [sortBy === 'score' ? `${Number(p.depth).toLocaleString()} fathoms` : `${p.points.toLocaleString()} pts`, facts(p)].filter(Boolean).join(' · '))));
      out.push(sorts, ul);
    }
    box.replaceChildren(...out);
    sendRows();
  }
  function renderAccount() {
    const box = $('entry-account');
    if (!me || !me.auth) { box.replaceChildren(); return; }
    if (!me.user) {
      const b = node('button', 'discord', 'Sign in with Discord');
      b.type = 'button';
      b.title = 'Keep your ponds in an account and carry on from any browser';
      b.addEventListener('click', () => location.assign(`${api}/auth/discord?back=${encodeURIComponent(location.pathname)}`));
      box.replaceChildren(b);
      return;
    }
    const who = node('span'), out = node('button', null, 'Sign out');
    who.append('Signed in as ', node('b', null, me.user.name));
    out.type = 'button';
    out.addEventListener('click', async () => {
      try { await fetch(`${api}/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}', credentials: 'same-origin' }); } catch { /* the session lapses anyway */ }
      me = { auth: true, user: null, ponds: [] };
      if (typeof Account !== 'undefined') { Account.user = null; Account.ponds = []; }
      renderAccount(); renderPonds();
    });
    box.replaceChildren(who, out);
  }
  if (api) {
    getJson('/board').then((b) => { board = b && Array.isArray(b.top) ? b : null; }).catch(() => {}).then(() => { renderPonds(); });
    getJson('/me').then((m) => { me = m; renderAccount(); renderPonds(); }).catch(() => {});
  } else { renderPonds(); }

  window.Entry = {
    // (The bar then keeps creeping on toward the next step on its own, on the compositor, so it still moves while
    // the pond is built on this thread and nothing here can run.)
    status(text, p) {
      phase = 1; set(text, p);
      if (p != null && p < 1) { const bar = $('entry-bar'); bar.style.transition = 'transform 4s cubic-bezier(.15,.7,.3,1)'; bar.style.transform = `scaleX(${Math.min(0.97, p + 0.16)})`; }
    },
    // The pond is ready: the Enter button lights up (or straight in, if skipped or only visiting).
    ready(info) {
      set('Ready', 1);
      root.classList.add('ready');
      if (skip || info.skip) { done(); return; }
      const line = $('entry-pond');
      line.replaceChildren();
      if (info.name) line.append(info.lead || 'Your pond: ', node('b', null, info.name), info.facts ? ` · ${info.facts}` : '');
      if (info.blurb) line.append(node('div', null, info.blurb));
      const b = $('entry-enter');
      b.disabled = false;
      $('entry-label').textContent = info.button || 'Enter';
      choose = info.choose || null;
      if (choose) {
        pickWater(choose.habitat);
        $('entry-hard').checked = !!choose.hard;
        // New: the choices are for this pond, made when you enter. Returning: they make another pond, on request.
        $('entry-choose').hidden = !choose.fresh;
        $('entry-another').hidden = choose.fresh;
        $('entry-create').hidden = choose.fresh;
      }
      document.addEventListener('keydown', key, true);
      setTimeout(() => b.focus(), 50);
    },
    done,
    skipping: () => skip,
  };
  // Never strand anyone on the entry screen: if loading fails or stalls, offer the way in anyway.
  const rescue = (why) => { if (!root.isConnected || root.classList.contains('ready')) return;
    window.Entry.ready({ name: '', blurb: why, button: 'Enter anyway' }); };
  window.addEventListener('error', () => setTimeout(() => rescue('Something went wrong while the pond was loading. It may still work.'), 1500));
  setTimeout(() => rescue('The pond is taking a long time to load.'), 30000);
})();
