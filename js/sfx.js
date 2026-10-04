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
      const shore = world.opts.habitat === 'fresh' ? 'amb_fresh' : 'amb_salt';
      this.shore = this.buf[shore] ? shore : 'amb_surface';
      for (const k of [this.shore, 'amb_shallow', 'amb_deep']) {
        if (!this.buf[k]) continue;
        const s = ctx.createBufferSource(), g = ctx.createGain();
        s.buffer = this.buf[k]; s.loop = true; g.gain.value = 0;
        s.connect(g).connect(k === this.shore ? ctx.destination : this.under); // (the shore is heard above the water)
        s.start(0, Math.random() * Math.max(0.1, this.buf[k].duration - 1));
        this.beds[k === this.shore ? 'amb_surface' : k] = g;
        if (k === this.shore) this.shoreG = G0(k);
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
    if (B.amb_surface) set(B.amb_surface.gain, damp * 0.32 * (this.shoreG || 1) * (1 - ss(0.12, 0.5, z)) * (1 - 0.6 * deep));
    if (B.amb_shallow) set(B.amb_shallow.gain, damp * 0.35 * G('amb_shallow') * ss(0.08, 0.42, z) * (1 - ss(0.7, 1, z) * 0.5) * (1 - 0.7 * deep));
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
  wrap('recycle', (r, [c, quiet]) => { if (!quiet) SFX.play('ui_recycle', { ui: true, level: 0.4, gap: 1.5 }); });
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
  // What the tools did: build, plant, feed, release.
  const useTool0 = globalThis.useTool;
  globalThis.useTool = function (x, y) {
    const n = [world.structures.length, world.plants.length + world.pads.length, world.food.length, world.creatures.length];
    const r = useTool0.call(this, x, y);
    try {
      if (world.structures.length === n[0] && world.plants.length + world.pads.length === n[1] && world.food.length > n[2]) SFX.at('ev_feed', x, y, { level: 0.35, gap: 2.5 });
    } catch { /* nothing */ }
    return r;
  };
  // A splash when something big surfaces nearby (the soundscape's own plops stay for the small ones).
  // "Not enough", "too close", "it needs...": the dull blub.
  wrap('showTicker', (r, [text]) => { if (/^(Not enough|Too |too close|It needs|it needs|Can.t|You already)/.test(String(text || ''))) SFX.play('ui_error', { ui: true, level: 0.45, gap: 1.5 }); });
  // The soundscape's update drives ours.
  const upd = Sound.update;
  Sound.update = function (w, dt, rect, k) { upd.call(this, w, dt, rect, k); try { SFX.update(w, dt, k); } catch { /* nothing */ } };
  const en = Sound.setEnabled;
  Sound.setEnabled = function (on) { en.call(this, on); if (on) SFX.ensure(); };

  // ---- menus and buttons -------------------------------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    if (!Sound.on || !SFX.ready) return;
    const t = e.target.closest && e.target.closest('button, summary, [role="tab"], input[type="checkbox"], select, a.btn');
    if (!t || t.closest('#entry') || t.disabled) return;
    if (t.getAttribute('role') === 'tab') { SFX.play('ui_tab', { ui: true, level: 0.45, gap: 0.2 }); return; }
    if (t.tagName === 'SUMMARY') { const open = !t.parentElement.open; SFX.play(open ? 'ui_open' : 'ui_close', { ui: true, level: 0.35, gap: 0.3 }); return; }
    if (t.type === 'checkbox') { SFX.play(t.checked ? 'ui_toggle_on' : 'ui_toggle_off', { ui: true, level: 0.3, gap: 0.2 }); return; }
    // Switches (aria-pressed) read their new state after the click has run.
    if (t.hasAttribute('aria-pressed')) { setTimeout(() => SFX.play(t.getAttribute('aria-pressed') === 'true' ? 'ui_toggle_on' : 'ui_toggle_off', { ui: true, level: 0.3, gap: 0.2 }), 0); return; }
    // Panels and windows opening (aria-expanded) whoosh; everything else clicks.
    if (t.hasAttribute('aria-expanded')) { setTimeout(() => SFX.play(t.getAttribute('aria-expanded') === 'true' ? 'ui_open' : 'ui_close', { ui: true, level: 0.35, gap: 0.3 }), 0); return; }
    SFX.alt = !SFX.alt;
    SFX.play(SFX.alt ? 'ui_click' : 'ui_click2', { ui: true, level: 0.35, gap: 0.15 });
  }, true);
  if (Sound.on) SFX.ensure();
})();
