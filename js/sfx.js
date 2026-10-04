'use strict';
// Recorded sound effects (audio/sfx/, made with ElevenLabs by tools/sfx_generate.mjs) over the synthesized
// soundscape, and a soundscape that changes with the zoom:
//  - Menus and buttons: soft watery clicks, whooshes for opening and closing, blips for switches, a dull blub
//    when something can't be done; buying, essence, building, planting, the Net, releasing an animal.
//  - The pond: feeding, gulps and bumps where they happen, hatching, rare births, finds, a new species, a new
//    depth, minds awakening, storms coming in and thunder in them.
//  - The zoom: far out you hear the surface (wind, lapping, birds), closer the shallows (bubbles, the crackle of
//    shrimp), and right in close the water closes over you: everything but the menus is muffled, and the
//    deep's drone comes up (more over deep water).
// All of it follows the sound switch (M); the menus stay crisp, the rest sits under the soundscape.

const SFX = {
  ready: false, loading: null, buf: {}, man: null, last: {}, ui: null, fx: null, under: null, beds: null, tier: null, rainWas: 0, alt: false,

  // Load and decode everything once, the first time sound is on (about 2 MB).
  async ensure() {
    if (this.ready || this.loading || !Sound.ctx) return;
    this.loading = (async () => {
      const ctx = Sound.ctx;
      this.man = await fetch('audio/sfx.json', { cache: 'force-cache' }).then((r) => r.json());
      await Promise.all(Object.entries(this.man.sounds).map(async ([k, v]) => {
        try { this.buf[k] = await ctx.decodeAudioData(await fetch(`audio/sfx/${v.f}`, { cache: 'force-cache' }).then((r) => r.arrayBuffer())); } catch { /* skip that one */ }
      }));
      // Menus straight out; the pond's sounds and the soundscape through the water (a lowpass the zoom closes).
      this.ui = ctx.createGain(); this.ui.gain.value = 0.2; this.ui.connect(ctx.destination);
      this.under = ctx.createBiquadFilter(); this.under.type = 'lowpass'; this.under.frequency.value = 18000; this.under.Q.value = 0.5;
      this.under.connect(ctx.destination);
      Sound.master.disconnect(); Sound.master.connect(this.under);
      this.fx = ctx.createGain(); this.fx.gain.value = 0.25; this.fx.connect(this.under);
      // The three beds, looping, silent until the zoom brings them up.
      this.beds = {};
      const G0 = (id) => (this.man.sounds[id] && this.man.sounds[id].g) || 1;
      // (The shore by the pond's own water: a reedy pond edge, or small waves on shingle.)
      const fresh = world.opts.habitat === 'fresh', shore = fresh ? 'amb_fresh' : 'amb_salt', far = fresh ? 'amb_far_fresh' : 'amb_far_salt';
      this.shore = this.buf[shore] ? shore : 'amb_surface';
      this.far = this.buf[far] ? far : null;
      for (const k of [this.far, this.shore, 'amb_shallow', 'amb_deep']) {
        if (!k) continue;
        if (!this.buf[k]) continue;
        const s = ctx.createBufferSource(), g = ctx.createGain();
        s.buffer = this.buf[k]; s.loop = true; g.gain.value = 0;
        const above = k === this.shore || k === this.far;
        s.connect(g).connect(above ? ctx.destination : this.under); // (the shore and the far view are heard above the water)
        s.start(0, Math.random() * Math.max(0.1, this.buf[k].duration - 1));
        this.beds[k === this.shore ? 'amb_surface' : k === this.far ? 'amb_far' : k] = g;
        if (k === this.shore) this.shoreG = G0(k);
        if (k === this.far) this.farG = G0(k);
      }
      this.ready = true;
    })().catch(() => { this.loading = null; });
  },

  // Play one: on the menus' bus or the pond's, at a level (× its own normalising gain), panned, a little varied,
  // and not again within `gap` seconds.
  play(k, { ui = false, level = 1, pan = 0, gap = 0.08, vary = 0.06 } = {}) {
    if (!Sound.on || !this.ready || !this.buf[k]) return;
    const ctx = Sound.ctx, now = ctx.currentTime;
    if (now - (this.last[k] || -9) < gap) return;
    this.last[k] = now;
    const s = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner();
    s.buffer = this.buf[k];
    s.playbackRate.value = 1 + (Math.random() * 2 - 1) * vary;
    g.gain.value = level * ((this.man.sounds[k] && this.man.sounds[k].g) || 1);
    p.pan.value = clamp(pan, -1, 1);
    s.connect(g).connect(p).connect(ui ? this.ui : this.fx);
    s.start();
  },
  // A tuned pluck (or a few, one after another): notes are steps of D major pentatonic from D5, or 'lo'/'lo2' for
  // the muted pair that says no. Sine with a quiet octave, a soft lowpass, a quick bloom and a short ring.
  tone(steps, { level = 1, gap = 0.1, dur = 0.16, type = 'sine' } = {}) {
    if (!Sound.on || !this.ready) return;
    const ctx = Sound.ctx, now = ctx.currentTime, key = steps.join(',');
    if (now - (this.last['tone:' + key] || -9) < gap) return;
    this.last['tone:' + key] = now;
    const PENTA = [587.33, 659.25, 739.99, 880, 987.77, 1174.66], f = (s) => (s === 'lo' ? 293.66 : s === 'lo2' ? 277.18 : PENTA[s % PENTA.length]);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.3; lp.connect(this.ui);
    steps.forEach((s, i) => {
      const t = now + i * 0.06, fr = f(s), g = ctx.createGain(), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = type; o.frequency.value = fr; o2.type = 'sine'; o2.frequency.value = fr * 2.003; g2.gain.value = 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 * level, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); o2.connect(g2).connect(g); g.connect(lp);
      o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
    });
  },
  // A pond sound where it happens: panned across the view, fading off screen (Sound.place), or not at all.
  at(k, x, y, opts = {}) {
    const a = Sound.place(x, y);
    if (a) this.play(k, { ...opts, pan: a.pan, level: (opts.level || 1) * a.g });
  },

  // Each frame (from Sound's own update): the zoom's mix, a new depth, storms and thunder.
  update(world, dt, k) {
    if (!Sound.on || !Sound.ctx) return;
    if (!this.ready) { this.ensure(); return; }
    const ctx = Sound.ctx, now = ctx.currentTime, lo = Math.log(Math.max(0.2, typeof minK === 'function' ? minK() : 1)), hi = Math.log(16);
    const z = clamp((Math.log(Math.max(0.2, k)) - lo) / Math.max(0.5, hi - lo), 0, 1), deep = Sound.mix.deep || 0;
    const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const set = (param, v, tc = 0.6) => param.setTargetAtTime(v, now, tc);
    const B = this.beds, G = (id) => (this.man.sounds[id] && this.man.sounds[id].g) || 1;
    // (Everything but the entry screen's music sits far down while it's up.)
    const entry = document.getElementById('entry'), damp = entry && !entry.classList.contains('gone') ? 0.15 : 1;
    set(Sound.master.gain, 0.55 * damp, 0.8); set(this.ui.gain, 0.2 * damp, 0.3); set(this.fx.gain, 0.25 * damp, 0.3);
    // Far out: wind, gulls, the sea breaking a long way off. In closer: the shore's own water lapping. Closer still:
    // under the surface. (sound.js fades its synthesized surf and lapping by the same zoom.)
    const farW = 1 - ss(0.18, 0.45, z), nearW = ss(0.2, 0.42, z) * (1 - ss(0.6, 0.85, z));
    if (B.amb_far) set(B.amb_far.gain, damp * 0.4 * (this.farG || 1) * farW, 1.2);
    if (B.amb_surface) set(B.amb_surface.gain, damp * 0.32 * (this.shoreG || 1) * (B.amb_far ? nearW : 1 - ss(0.12, 0.5, z)) * (1 - 0.6 * deep), 1.2);
    if (B.amb_shallow) set(B.amb_shallow.gain, damp * 0.35 * G('amb_shallow') * ss(0.5, 0.8, z) * (1 - 0.7 * deep));
    if (B.amb_deep) set(B.amb_deep.gain, damp * 0.3 * G('amb_deep') * Math.max(deep * 0.9, ss(0.6, 1, z) * 0.6));
    // Under the water as you close in: the pond's sounds muffle (the menus don't).
    set(this.under.frequency, 18000 * Math.pow(1500 / 18000, ss(0.35, 1, z) * 0.85 + deep * 0.15), 0.4);
    // A new depth opens.
    const tier = world.erosion ? world.erosion.tier : 0;
    if (this.tier != null && tier > this.tier && !world.observe) this.play('ev_depth', { level: 0.6, gap: 60, vary: 0 });
    this.tier = tier;
    // A storm coming in, and thunder in a heavy one.
    const rain = world.weather.rain || 0;
    if (this.rainWas < 0.25 && rain >= 0.25) this.play('ev_storm', { level: 0.45, gap: 300, vary: 0.02 });
    this.rainWas = rain;
    if (rain > 0.7 && Math.max(0, world.weather.gust || 0) > 0.4 && Math.random() < dt * 0.01) this.play('ev_thunder', { level: 0.25 + Math.random() * 0.2, pan: Math.random() * 1.6 - 0.8, gap: 25, vary: 0.1 });
  },
};

// ---- hooks: the pond's own functions, wrapped -----------------------------------------------------------------
(() => {
  const wrap = (name, after) => {
    const f = globalThis[name];
    if (typeof f !== 'function') return;
    globalThis[name] = function (...a) { const r = f.apply(this, a); try { after(r, a); } catch { /* sound never breaks the pond */ } return r; };
  };
  const here = (w) => w === world && !world.observe;
  wrap('recycle', (r, [c, quiet]) => { if (!quiet) SFX.tone([4, 2, 0], { gap: 1, level: 0.8 }); });
  wrap('discover', (r, [w]) => { if (here(w)) SFX.play('ev_discover', { level: 0.45, gap: 20 }); });
  wrap('findArtifact', (r, [w]) => { if (here(w) && r) SFX.play('ev_artifact', { level: 0.55, gap: 10, vary: 0 }); });
  wrap('collectFossil', (r, [w]) => { if (here(w)) SFX.play('ev_fossil', { level: 0.5, gap: 5 }); });
  wrap('hatchBrood', (r, [w]) => { if (here(w)) SFX.play('ev_hatch', { level: 0.4, gap: 15 }); });
  wrap('hatchNest', (r, [w, N]) => { if (here(w) && N) SFX.at('ev_hatch', N.x, N.y, { level: 0.4, gap: 15 }); });
  // Eating where it happens: a gulp, a bump and a splash for a kill.
  // (A kill, now and then: not every meal.)
  wrap('eat', (r, [w, c, f]) => {
    if (w !== world || !c || !(typeof Creature !== 'undefined' && f instanceof Creature)) return;
    SFX.at('ev_hit', c.x, c.y, { level: 0.35, gap: 12, vary: 0.12 });
  });
  // The rare and remarkable, as the journal tells them.
  wrap('logEvent', (r, [w, text, subject, opts]) => {
    if (!here(w) || !opts) return;
    if (opts.cat === 'rare' && (opts.pri || 0) >= 3 && /born|hatched|baby|young/i.test(text)) SFX.play('ev_birth_rare', { level: 0.45, gap: 45, vary: 0 });
  });
  // A splash when something big surfaces nearby (the soundscape's own plops stay for the small ones).
  // "Not enough", "too close", "it needs...": the dull blub.
  wrap('showTicker', (r, [text]) => { if (/^(Not enough|Too |too close|It needs|it needs|Can.t|You already)/.test(String(text || ''))) SFX.tone(['lo', 'lo2'], { gap: 1.5, type: 'triangle', level: 0.9, dur: 0.22 }); });
  // The soundscape's update drives ours.
  const upd = Sound.update;
  Sound.update = function (w, dt, rect, k) { upd.call(this, w, dt, rect, k); try { SFX.update(w, dt, k); } catch { /* nothing */ } };
  const en = Sound.setEnabled;
  Sound.setEnabled = function (on) { en.call(this, on); if (on) SFX.ensure(); };

  // ---- menus and buttons -------------------------------------------------------------------------------------------
  // Menus: soft tuned tones (a kalimba-ish pluck on the soundtrack's D pentatonic), not recordings. A plain button
  // plucks one note, picked by where it sits so the same button always sounds the same and neighbours differ;
  // opening rises two notes and closing falls; switches go up for on and down for off; tabs are a higher note.
  document.addEventListener('click', (e) => {
    if (!Sound.on || !SFX.ready) return;
    const t = e.target.closest && e.target.closest('button, summary, [role="tab"], input[type="checkbox"], select, a.btn');
    if (!t || t.closest('#entry') || t.disabled) return;
    if (t.getAttribute('role') === 'tab') { SFX.tone([5], { gap: 0.12 }); return; }
    if (t.tagName === 'SUMMARY') { const open = !t.parentElement.open; SFX.tone(open ? [0, 3] : [3, 0], { gap: 0.25 }); return; }
    if (t.type === 'checkbox') { SFX.tone(t.checked ? [2, 4] : [4, 2], { gap: 0.15 }); return; }
    if (t.hasAttribute('aria-pressed')) { setTimeout(() => SFX.tone(t.getAttribute('aria-pressed') === 'true' ? [2, 4] : [4, 2], { gap: 0.15 }), 0); return; }
    if (t.hasAttribute('aria-expanded')) { setTimeout(() => SFX.tone(t.getAttribute('aria-expanded') === 'true' ? [0, 3] : [3, 0], { gap: 0.25 }), 0); return; }
    const r = t.getBoundingClientRect(), i = Math.abs(Math.round(r.left / 40) + Math.round(r.top / 40) * 3) % 5;
    SFX.tone([i], { gap: 0.08, level: 0.75 });
  }, true);
  if (Sound.on) SFX.ensure();
})();
