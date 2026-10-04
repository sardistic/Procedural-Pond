'use strict';
// Music, if you want it (it's off until you turn it on). Two pieces, Subaquatic Matrix and Subdued
// Progression (both 90 bpm, both on D), cut into 4-bar pieces by tools/music_chop.py, each tagged
// with a mood from how loud, bright and busy it is:
//   deep (low, dark pads and bass), glow (soft but bright), drift (mid, easy), rise (full and
//   bright), surge (the full groove).
// Nothing plays on its own for long: what happens in the pond cues a phrase (two bars for small
// things, four for most, eight for the big ones), in a mood that suits it, faded in and out, quietly,
// under the soundscape, with long rests between. Phrases tend to carry on where the last one left off,
// so over an evening the pieces unfold. The deeper the view, the more muffled it sounds.
// And in the lulls, now and then, the beat alone: a groove from the pieces with everything but its low
// pulse filtered away, quieter still, faded in and out slowly; anything that happens takes over from it.

const MUSIC_V = 2; // bump when the cut changes (audio/music.json and its files)
const MUSIC_FALLBACK = {
  deep: ['deep', 'calm', 'drift', 'glow'], glow: ['glow', 'calm', 'drift', 'rise', 'deep'], drift: ['drift', 'calm', 'glow', 'deep', 'rise'],
  rise: ['rise', 'surge', 'glow'], surge: ['surge', 'rise', 'drift'], calm: ['calm', 'drift', 'glow', 'deep'],
};
// Play time in this browser, in seconds (the pond open, not paused, the tab in view). A track can be held back
// until there's been this much (its "after" in music.json), and then mixes in slowly over the hour after.
const MUSIC_PLAY = { s: 0, saveT: 0 };
try { MUSIC_PLAY.s = +localStorage.getItem('pond.playSec') || 0; } catch { /* no storage */ }
const MUSIC_KEEP = 4; // decoded files kept (each about 8 MB)

const Music = {
  on: false, ctx: null, out: null, filter: null, manifest: null, cache: new Map(), loading: new Map(),
  voice: null, pending: null, restUntil: 0, recent: [], last: null, lastAt: -1e9, tick: 0,
  busy: false, live: new Set(), // (a phrase loading; every source still sounding, so none is ever left playing untracked)
  beat: null, beatNext: 0, // (the undercurrent in a lull, and when to think about the next)

  // The output: a lowpass (the deep muffles it) into a gain (the level), into the speakers.
  start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = this.ctx = new AC();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass'; this.filter.frequency.value = 7000; this.filter.Q.value = 0.4;
    this.out = ctx.createGain();
    this.out.gain.value = this.levelGain();
    this.filter.connect(this.out).connect(ctx.destination);
    return true;
  },
  levelGain() { return 0.5 * Math.pow(clamp((world.opts.musicLevel ?? 40) / 100, 0, 1), 1.5); },
  setLevel() { if (this.ctx) this.out.gain.setTargetAtTime(this.levelGain(), this.ctx.currentTime, 0.3); },

  async setEnabled(on) {
    if (on && !this.ctx && !this.start()) return;
    this.on = on;
    if (!this.ctx) return;
    if (on) {
      this.ctx.resume();
      this.restUntil = this.ctx.currentTime + 4; // a moment, then the first phrase can come
      if (!this.manifest) await this.loadManifest();
      if (this.on && !this.voice) this.cue(world.darkness > 0.5 ? 'deep' : 'glow', 0.5, 'music on');
    } else {
      this.stop(1.5);
      setTimeout(() => { if (!this.on && this.ctx) this.ctx.suspend(); }, 1800);
    }
  },

  async loadManifest() {
    try {
      const r = await fetch(`audio/music.json?v=${MUSIC_V}`);
      this.manifest = await r.json();
      // Each atom knows its file and place, for choosing and for carrying on.
      this.atoms = [];
      for (const f of this.manifest.files) f.atoms.forEach((a, i) => this.atoms.push({ ...a, file: f, i, key: `${f.f}#${i}` }));
      this.atoms.sort((a, b) => (a.file.track < b.file.track ? -1 : a.file.track > b.file.track ? 1 : a.file.n - b.file.n || a.i - b.i));
      this.atoms.forEach((a, k) => { a.next = this.atoms[k + 1] && this.atoms[k + 1].file.track === a.file.track ? this.atoms[k + 1] : null; });
    } catch (e) { console.warn('music', e); this.manifest = null; }
  },

  // How much a track is in the mix: nothing until its play time comes (if it has one), then from a little, rising
  // to full over the next hour.
  trackWeight(id) {
    const T = this.manifest && this.manifest.tracks.find((t) => t.id === id), after = (T && T.after) || 0;
    if (!after) return 1;
    return MUSIC_PLAY.s < after ? 0 : Math.min(1, 0.2 + 0.8 * (MUSIC_PLAY.s - after) / 3600);
  },
  allowed(a) { const w = this.trackWeight(a.file.track); return w >= 1 || (w > 0 && Math.random() < w); },
  // The first piece of a track (for playing it through).
  trackStart(id) { return this.atoms.find((a) => a.file.track === id && a.mood !== 'gap') || null; },

  // A decoded file, fetched once (and kept, a few at a time).
  load(file) {
    if (this.cache.has(file.f)) { const b = this.cache.get(file.f); this.cache.delete(file.f); this.cache.set(file.f, b); return Promise.resolve(b); }
    if (this.loading.has(file.f)) return this.loading.get(file.f);
    const p = fetch(`audio/music/${file.f}?v=${MUSIC_V}`).then((r) => r.arrayBuffer()).then((ab) => new Promise((ok, no) => this.ctx.decodeAudioData(ab, ok, no)))
      .then((buf) => {
        this.cache.set(file.f, buf);
        while (this.cache.size > MUSIC_KEEP) this.cache.delete(this.cache.keys().next().value);
        return buf;
      }).finally(() => this.loading.delete(file.f));
    this.loading.set(file.f, p);
    return p;
  },

  // Something happened: maybe a phrase. strength 0..1 is how much it matters.
  cue(mood, strength = 0.3, why = '') {
    if (!this.on || !this.atoms || !this.ctx || document.hidden || this.busy) return;
    const now = this.ctx.currentTime;
    if (this.voice && now < this.voice.end) {
      // Only something bigger breaks into a phrase already playing; the rest wait a little.
      if (strength >= 0.8 && this.voice.strength < 0.6 && !this.voice.whole && now - this.voice.t0 > 4) { this.play(mood, strength, why); return; } // (play fades the other out first)
      if (!this.pending || strength > this.pending.strength) this.pending = { mood, strength, why, until: now + 15 };
      return;
    }
    const big = strength >= 0.8;
    if (now < this.restUntil && !(big && now > this.lastAt + 8)) {
      if (!this.pending || strength > this.pending.strength) this.pending = { mood, strength, why, until: now + 20 };
      return;
    }
    // Most small things pass without music; the bigger it is, the likelier.
    if (!big && Math.random() > 0.35 + strength) return;
    this.play(mood, strength, why);
  },

  // Choose a piece: carry on from the last phrase if its mood fits, else a fitting one not heard lately.
  // (A long phrase wants a piece that starts a file, so all eight bars are there.)
  choose(mood, long = false) {
    const ok = MUSIC_FALLBACK[mood] || [mood], fit = (a) => a.mood !== 'gap' && ok.includes(a.mood) && (!long || a.i === 0);
    const now = this.ctx.currentTime;
    if (this.last && now - this.lastAt < 240 && this.last.next && fit(this.last.next) && !this.recent.includes(this.last.next.key) && this.allowed(this.last.next) && Math.random() < 0.7) return this.last.next;
    for (const m of ok) {
      let pool = this.atoms.filter((a) => a.mood === m && !this.recent.includes(a.key) && this.allowed(a));
      if (long && pool.some((a) => a.i === 0)) pool = pool.filter((a) => a.i === 0);
      if (!pool.length) continue;
      // Already decoded ones first (no wait), then any.
      const ready = pool.filter((a) => this.cache.has(a.file.f));
      const from = ready.length && Math.random() < 0.6 ? ready : pool;
      return from[Math.floor(Math.random() * from.length)];
    }
    return this.atoms.find((a) => a.mood !== 'gap' && this.trackWeight(a.file.track) > 0) || null;
  },

  // How much plays: four bars for small things, eight for most, sixteen for the big ones; now and then a long listen
  // (thirty-two bars), and in a quiet stretch, often, the whole song from its start. (An atom is four bars.)
  runLength(strength, why) {
    if (why === 'a quiet stretch' && Math.random() < 0.4) return Infinity;
    if (why === 'music on' && Math.random() < 0.3) return Infinity;
    if (strength >= 0.45 && Math.random() < 0.22) return 8;
    return strength < 0.3 ? 1 : strength < 0.75 ? 2 : 4;
  },

  async play(mood, strength, why) {
    if (this.busy) return;
    const n = this.runLength(strength, why), whole = n === Infinity;
    let atom = this.choose(mood, strength >= 0.75 || n > 2);
    if (!atom) return;
    if (whole) atom = this.trackStart(atom.file.track) || atom;
    if (n > 1) return this.playRun(atom, n, strength, mood, why);
    const now0 = this.ctx.currentTime;
    this.busy = true;
    this.restUntil = now0 + 6; // (claimed while it loads)
    let buf;
    try { buf = await this.load(atom.file); } catch (e) { console.warn('music', e); this.busy = false; return; }
    this.busy = false;
    if (!this.on || this.ctx.currentTime - now0 > 8) return; // took too long: the moment's gone
    // One voice at a time: anything still sounding fades out first, and this waits for it
    // (two phrases at once, often of the same bars, is what sounded like an echo).
    const still = this.fadeAll(1.2);
    // How long: two bars for small things, four for most, eight for the big ones (on into the next piece).
    const bar = atom.dur / 4, bars = 4;
    let off = atom.at;
    let len = Math.min(bars * bar, buf.duration - off - 0.5);
    if (bars === 8 && atom.i === 1) { off = atom.at; len = Math.min(atom.dur, buf.duration - off - 0.5); } // (the file's last piece: four bars and its tail)
    const ctx = this.ctx, t = ctx.currentTime + 0.05 + still, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    // Loud pieces are brought down and soft ones up, part way, so each sits at about the same level.
    const peak = clamp(Math.pow(10, ((-15 - atom.db) / 20) * 0.6), 0.55, 2) * (0.75 + 0.25 * strength);
    const fadeIn = bars === 2 ? 1.2 : strength >= 0.8 ? 2.5 : 4.5, tailRoom = buf.duration - off - len;
    const fadeOut = Math.min(bars === 2 ? 2.5 : 6, len * 0.4 + Math.max(0, tailRoom - 0.2));
    const outAt = t + len - Math.min(len * 0.4, fadeOut / 2), end = outAt + fadeOut;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(fadeIn, len * 0.4));
    g.gain.setValueAtTime(peak, outAt);
    g.gain.linearRampToValueAtTime(0.0001, end);
    src.connect(g).connect(this.filter);
    src.start(t, off, end - t + 0.1);
    this.voice = { src, g, t0: t, end, strength, mood, atom, why };
    this.last = bars === 8 && atom.next && atom.i === 0 ? atom.next : atom; // (eight bars covered this piece and the next)
    this.lastAt = end;
    this.recent = [atom.key, ...this.recent].slice(0, 8);
    // Then a rest, a minute or two (a little less after a big moment), so it stays out of the way.
    this.restUntil = end + (strength >= 0.8 ? 30 : 55) + Math.random() * 60;
    this.live.add({ src, g });
    src.onended = () => { for (const v of this.live) if (v.src === src) this.live.delete(v); if (this.voice && this.voice.src === src) this.voice = null; };
  },

  // A run: this piece and those after it in the song (as many as asked, or to its end), back to back across files
  // with no gap, under one long fade in and out. Files are fetched and started a little ahead as it goes (feed).
  async playRun(atom, n, strength, mood, why) {
    const run = [atom];
    while (run.length < n && run[run.length - 1].next) run.push(run[run.length - 1].next);
    while (run.length > 1 && run[run.length - 1].mood === 'gap') run.pop(); // (no trailing near-silence)
    const now0 = this.ctx.currentTime;
    this.busy = true;
    this.restUntil = now0 + 6;
    try { await this.load(atom.file); } catch (e) { console.warn('music', e); this.busy = false; return; }
    this.busy = false;
    if (!this.on || this.ctx.currentTime - now0 > 8) return;
    const still = this.fadeAll(1.2), ctx = this.ctx, t0 = ctx.currentTime + 0.05 + still, g = ctx.createGain();
    // The pieces, grouped by file, each with its start time.
    const segs = [];
    let at = t0;
    for (const a of run) {
      const s = segs[segs.length - 1];
      if (s && s.file === a.file && Math.abs(s.off + s.len - a.at) < 0.05) s.len += a.dur;
      else segs.push({ file: a.file, off: a.at, len: a.dur, at });
      at += a.dur;
    }
    const total = at - t0, dbs = run.filter((a) => a.mood !== 'gap').map((a) => a.db), db = dbs.reduce((p, q) => p + q, 0) / Math.max(1, dbs.length);
    const peak = clamp(Math.pow(10, ((-15 - db) / 20) * 0.6), 0.55, 2) * (0.75 + 0.25 * Math.min(1, strength));
    const fadeIn = strength >= 0.8 ? 2.5 : 4.5, fadeOut = Math.min(9, total * 0.25), end = t0 + total;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.min(fadeIn, total * 0.3));
    g.gain.setValueAtTime(peak, end - fadeOut);
    g.gain.linearRampToValueAtTime(0.0001, end);
    g.connect(this.filter);
    this.voice = { g, t0, end, strength, mood, atom, why, run: segs, next: 0, whole: n === Infinity };
    this.last = run[run.length - 1];
    this.lastAt = end;
    this.recent = [...run.map((a) => a.key), ...this.recent].slice(0, Math.max(8, run.length + 4));
    // Then a rest: longer after a whole song.
    this.restUntil = end + (n === Infinity ? 90 + Math.random() * 90 : (strength >= 0.8 ? 30 : 50) + Math.random() * 60);
    await this.feed();
  },
  // Start the run's next files that are due within about fifteen seconds. If one can't be had in time, the run
  // fades out early rather than leave a hole.
  async feed() {
    const v = this.voice;
    if (!v || !v.run || v.feeding || !this.ctx) return;
    v.feeding = true;
    try {
      while (v === this.voice && v.next < v.run.length && v.run[v.next].at - this.ctx.currentTime < 15) {
        const s = v.run[v.next];
        let buf;
        try { buf = await this.load(s.file); } catch { buf = null; }
        if (v !== this.voice) return;
        const now = this.ctx.currentTime;
        if (!buf || now > s.at - 0.02) { // (too late: end it here, gently)
          v.g.gain.cancelScheduledValues(now); v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), now); v.g.gain.linearRampToValueAtTime(0.0001, now + 2.5);
          v.end = this.lastAt = now + 2.5; v.next = v.run.length;
          return;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(v.g);
        src.start(s.at, s.off, Math.min(s.len + 0.03, buf.duration - s.off));
        const live = { src, g: v.g };
        this.live.add(live);
        src.onended = () => { this.live.delete(live); };
        v.next++;
      }
    } finally { v.feeding = false; }
  },

  // The beat, low and quiet, in a lull: a piece of the groove through a steep lowpass (the kick and the bass
  // are what's left), about a third as loud as a phrase, eight bars faded in and out slowly.
  async playBeat() {
    if (this.busy || this.voice || this.beat || !this.atoms) return;
    const pool = this.atoms.filter((a) => (a.mood === 'surge' || a.mood === 'rise') && a.i === 0 && this.allowed(a));
    const atom = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (!atom) return;
    const now0 = this.ctx.currentTime;
    this.beat = { pending: true };
    let buf;
    try { buf = await this.load(atom.file); } catch (e) { this.beat = null; return; }
    if (!this.on || this.voice || this.busy || this.ctx.currentTime - now0 > 8) { this.beat = null; return; } // (something happened meanwhile)
    const ctx = this.ctx, t = ctx.currentTime + 0.05, src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    lp.type = 'lowpass'; lp.frequency.value = 170; lp.Q.value = 0.9;
    hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.7;
    const bar = atom.dur / 4, len = Math.min(8 * bar, buf.duration - atom.at - 0.5), peak = clamp(Math.pow(10, ((-15 - atom.db) / 20) * 0.6), 0.55, 2) * 0.34;
    const fade = Math.min(7, len * 0.35), end = t + len;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + fade);
    g.gain.setValueAtTime(peak, end - fade);
    g.gain.linearRampToValueAtTime(0.0001, end);
    src.connect(hp).connect(lp).connect(g).connect(this.filter);
    src.start(t, atom.at, len + 0.1);
    const v = { src, g, beat: true };
    this.live.add(v);
    this.beat = { src, g, lp, peak, t0: t, end, atom };
    this.beatNext = end + 40 + Math.random() * 70;
    src.onended = () => { this.live.delete(v); if (this.beat && this.beat.src === src) this.beat = null; };
  },

  stop(fade = 2) { this.fadeAll(fade); },
  // Fade out everything still sounding; returns how long until it's quiet.
  fadeAll(fade) {
    if (!this.ctx) return 0;
    const t = this.ctx.currentTime;
    let quiet = 0;
    for (const v of this.live) {
      if (v.fading) { quiet = Math.max(quiet, v.fading - t); continue; }
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), t);
      v.g.gain.linearRampToValueAtTime(0.0001, t + fade);
      try { v.src.stop(t + fade + 0.05); } catch { /* already stopped */ }
      v.fading = t + fade;
      quiet = Math.max(quiet, fade);
    }
    this.voice = null;
    this.beat = null;
    return quiet;
  },

  // Once a second: the deep muffles it; waiting cues get their turn; and in a long quiet, a phrase of its own.
  update(dt) {
    if (!world.paused && !document.hidden && !world.observe) {
      MUSIC_PLAY.s += dt; MUSIC_PLAY.saveT += dt;
      if (MUSIC_PLAY.saveT > 30) { MUSIC_PLAY.saveT = 0; try { localStorage.setItem('pond.playSec', String(Math.round(MUSIC_PLAY.s))); } catch { /* no storage */ } }
    }
    if (!this.on || !this.ctx || !this.atoms) return;
    if (this.voice && this.voice.run) this.feed();
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 1;
    const now = this.ctx.currentTime;
    let deep = 0;
    if (typeof depthAt === 'function' && world.depth && typeof visibleRect === 'function') {
      const [x0, y0, x1, y1] = visibleRect();
      deep = depthAt(world, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    this.filter.frequency.setTargetAtTime(clamp(7000 * (1 - 0.75 * deep) * (1 - 0.25 * (world.darkness || 0)), 900, 9000), now, 1.5);
    if (this.voice && now >= this.voice.end) this.voice = null;
    if (this.pending && now > this.pending.until) this.pending = null;
    if (this.beat && this.beat.end && now >= this.beat.end + 0.5) this.beat = null;
    // A lull (nothing playing, the last phrase a while gone): now and then, the beat alone.
    if (!this.voice && !this.busy && !this.beat && !this.pending && !world.paused && now > this.lastAt + 12 && now >= this.beatNext) {
      this.beatNext = now + 20 + Math.random() * 25;
      if (Math.random() < 0.35) this.playBeat();
    }
    if (!this.voice && !this.busy && this.pending && now >= this.restUntil - (this.pending.strength >= 0.6 ? 15 : 0)) {
      const p = this.pending;
      this.pending = null;
      this.play(p.mood, p.strength, p.why);
    } else if (!this.voice && !world.paused && now > this.lastAt + 200 + Math.random() * 120) {
      this.lastAt = now; // (so this fires once per quiet stretch)
      this.cue(world.darkness > 0.5 ? 'deep' : 'drift', 0.4, 'a quiet stretch');
    }
  },
};

// What the journal says happened, as a cue: the mood from what it is, the strength from how much it matters.
function musicFromLog(w, e) {
  if (!Music.on || w !== world || world.observe || world.paused || (e.pri || 0) < 1) return;
  const T = e.text.toLowerCase(), pri = e.pri || 1;
  let mood = 'drift', s = 0.15 + 0.1 * pri;
  if (/deepened|mythic|kraken|leviathan|the watcher|the sleeper|stars are right|ascend/.test(T)) { mood = 'surge'; s = 0.9; }
  else if (/transcend|the mark|marked|eldritch|madness|not of this world|artifact|parasite|latch|evolved|abomination|blood (moon|rain)|eclipse|the tar/.test(T)) { mood = 'deep'; s = pri >= 2 ? 0.65 : 0.4; }
  else if (/aurora|meteor|comet|glass day|new species|paragon|a first for this pond|legendary|mythic|epic/.test(T)) { mood = 'glow'; s = pri >= 3 ? 0.85 : 0.55; }
  else if (e.cat === 'rare') { mood = 'rise'; s = 0.3 + 0.15 * pri; }
  else if (e.cat === 'sky') { mood = /dawn|sunrise|morning/.test(T) ? 'glow' : /dusk|night|moon/.test(T) ? 'deep' : 'drift'; s = 0.35; }
  else if (e.cat === 'hunt') { mood = 'surge'; s = pri >= 2 ? 0.5 : 0.25; }
  else if (e.cat === 'come') { mood = /from the deep|came up/.test(T) ? 'deep' : 'drift'; s = 0.2 + 0.12 * pri; }
  Music.cue(mood, Math.min(1, s), e.text);
}

function setMusic(on) {
  Music.setEnabled(on);
  setOpt('music', on);
  byId('music').setAttribute('aria-pressed', on);
}

function initMusic() {
  byId('music').addEventListener('click', () => setMusic(!Music.on));
  const input = byId('opt-music'), output = input.nextElementSibling;
  input.value = world.opts.musicLevel ?? 40;
  output.textContent = `${input.value}%`;
  input.addEventListener('input', () => { setOpt('musicLevel', +input.value); output.textContent = `${input.value}%`; Music.setLevel(); });
  // Browsers only allow audio after a gesture, so a saved "on" resumes at the first interaction.
  if (world.opts.music) { byId('music').setAttribute('aria-pressed', true); addEventListener('pointerdown', () => { if (!Music.on) setMusic(true); }, { once: true }); }
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('select, input, textarea')) return;
    if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) setMusic(!Music.on);
  });
  document.addEventListener('visibilitychange', () => {
    if (!Music.ctx || !Music.on) return;
    if (document.hidden) { Music.stop(0.5); Music.ctx.suspend(); } else Music.ctx.resume();
  });
}
if (!(typeof IS_BOT !== 'undefined' && IS_BOT)) initMusic();
