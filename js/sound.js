'use strict';
// Generative soundscape, synthesized with Web Audio (no audio files). What you
// hear follows where you're looking:
//  - Beds that mix by what's on screen: open water (brighter with the current,
//    duller over the deep), surf and lapping by the beach (swelling with each
//    wave, with the tide's flow and the surf), wind with the gusts, rain, and a
//    low drone over deep water that turns strange near transcendent things.
//  - Voices placed where they happen: panned across the view and fading with
//    distance off screen (and a little louder the closer you zoom). Plops,
//    bubbles (kept soft), frogs at night, ducks, gulls over the beach, crickets
//    on the shore at night, birdsong by day near land, deep groans, whispers.

const Sound = {
  ctx: null, master: null, on: false, budget: 0, bubbles: 0,
  beds: null, mix: { beach: 0, deep: 0, eld: 0, cx: 0, cy: 0, w: 1, h: 1, k: 3, dir: 0 }, mixT: 0,

  start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // Two seconds of brown noise, looped, feeds the beds.
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    this.noise = buf;
    const loop = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; };
    const bed = (type, freq, q = 0.7) => {
      const f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
      f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
      loop().connect(f).connect(g).connect(p).connect(this.master);
      return { f, g, p };
    };
    this.beds = {
      water: bed('lowpass', 500), surf: bed('bandpass', 900, 0.6), lap: bed('bandpass', 2200, 1.2),
      rain: bed('highpass', 1400), wind: bed('bandpass', 420, 0.5),
    };
    // Water swells slowly.
    const swell = ctx.createOscillator(), depth = ctx.createGain();
    swell.frequency.value = 0.07; depth.gain.value = 0.04;
    swell.connect(depth).connect(this.beds.water.g.gain);
    swell.start();
    // The deep: two low tones, a slow beat between them, and a dissonant third
    // that comes up near transcendent things.
    const drone = ctx.createGain(), dl = ctx.createBiquadFilter();
    drone.gain.value = 0; dl.type = 'lowpass'; dl.frequency.value = 220;
    drone.connect(dl).connect(this.master);
    this.drone = { g: drone, osc: [] };
    for (const [f, type] of [[43, 'sine'], [64.8, 'sine'], [91.5, 'triangle']]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f; g.gain.value = type === 'triangle' ? 0 : 0.5;
      o.connect(g).connect(drone); o.start();
      this.drone.osc.push({ o, g });
    }
    return true;
  },

  setEnabled(on) {
    if (on && !this.ctx && !this.start()) return;
    this.on = on;
    if (this.ctx) on ? this.ctx.resume() : this.ctx.suspend();
  },

  // How a sound at (x, y) sits in the view: pan across the screen, and a gain
  // that fades with distance beyond its edges. Returns null when out of earshot.
  place(x, y) {
    const m = this.mix, dx = x - m.cx, dy = y - m.cy;
    const ox = Math.max(0, Math.abs(dx) - m.w / 2), oy = Math.max(0, Math.abs(dy) - m.h / 2);
    const g = Math.exp(-Math.hypot(ox, oy) / (Math.max(m.w, m.h) * 0.3)) * clamp(0.75 + 0.08 * (m.k - 2), 0.7, 1.25);
    return g < 0.06 ? null : { pan: clamp(dx / (m.w / 2), -1, 1) * 0.85, g };
  },

  // A voice routed through a stereo panner (pan -1..1) with a quick envelope.
  voice(pan, peak, dur, attack = 0.01) {
    const ctx = this.ctx, t = ctx.currentTime, g = ctx.createGain(), p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(p).connect(this.master);
    return [g, t];
  },

  // A splash or drop (food, rain, something surfacing).
  plop(x, y, size = 1) {
    if (!this.on || this.budget < 1) return;
    const at = this.place(x, y);
    if (!at) return;
    this.budget--;
    const [g, t] = this.voice(at.pan, (0.04 + 0.08 * Math.min(1, size)) * at.g, 0.16);
    const o = this.ctx.createOscillator(), f = rand(500, 900) / Math.max(0.5, size);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.35, t + 0.12);
    o.connect(g); o.start(t); o.stop(t + 0.18);
  },

  // A bubble breaking the surface: small, soft and rationed (aerators make lots).
  bubble(x, y) {
    if (!this.on || this.bubbles < 1) return;
    const at = this.place(x, y);
    if (!at || at.g < 0.3) return;
    this.bubbles--;
    const [g, t] = this.voice(at.pan, 0.012 * at.g, 0.07, 0.004), o = this.ctx.createOscillator();
    const f = rand(1400, 2400);
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.7, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    o.connect(g); o.start(t); o.stop(t + 0.08);
  },

  chirp(pan, gain = 1) {
    const n = randi(2, 4), base = rand(2400, 3600);
    for (let i = 0; i < n; i++) {
      const [g, t0] = this.voice(pan, 0.03 * gain, 0.09), t = t0 + i * 0.11, o = this.ctx.createOscillator();
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03 * gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.frequency.setValueAtTime(base * rand(0.9, 1.1), t);
      o.frequency.exponentialRampToValueAtTime(base * rand(1.2, 1.5), t + 0.07);
      o.connect(g); o.start(t); o.stop(t + 0.1);
    }
  },

  // Crickets on the shore at night: a quick train of high pulses.
  cricket(pan, gain = 1) {
    const ctx = this.ctx, f = rand(4200, 5200), n = randi(3, 6);
    for (let i = 0; i < n; i++) {
      const [g, t0] = this.voice(pan, 0.012 * gain, 0.05, 0.003), t = t0 + i * 0.07, o = ctx.createOscillator();
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012 * gain, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.05);
    }
  },

  croak(pan, gain = 1) {
    const ctx = this.ctx, [g, t] = this.voice(pan, 0.08 * gain, 0.32), o = ctx.createOscillator(), bp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = rand(110, 160);
    bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 4;
    // Throaty pulses: modulate the level quickly.
    const am = ctx.createOscillator(), amg = ctx.createGain();
    am.frequency.value = rand(16, 22); amg.gain.value = 0.5;
    const pulse = ctx.createGain(); pulse.gain.value = 0.5;
    am.connect(amg).connect(pulse.gain);
    o.connect(bp).connect(pulse).connect(g);
    o.start(t); am.start(t); o.stop(t + 0.34); am.stop(t + 0.34);
  },

  quack(pan, gain = 1) {
    const ctx = this.ctx;
    for (let i = 0; i < 2; i++) {
      const [g, t0] = this.voice(pan, 0.05 * gain, 0.2), t = t0 + i * 0.22, o = ctx.createOscillator(), bp = ctx.createBiquadFilter();
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 * gain, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.15);
      bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 2;
      o.connect(bp).connect(g); o.start(t); o.stop(t + 0.18);
    }
  },

  // A gull: the long falling "kee-ow", or a run of short laughing calls.
  gull(x, y, laugh = false) {
    if (!this.on) return;
    const at = this.place(x, y);
    if (!at) return;
    const ctx = this.ctx, n = laugh ? randi(3, 5) : 1, base = rand(1500, 1900);
    for (let i = 0; i < n; i++) {
      const dur = laugh ? 0.13 : rand(0.45, 0.6), [g, t0] = this.voice(at.pan, 0.045 * at.g, dur, 0.03), t = t0 + i * 0.17;
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045 * at.g, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), vib = ctx.createOscillator(), vg = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * (laugh ? 0.8 : 1.15), t);
      o.frequency.exponentialRampToValueAtTime(base * (laugh ? 0.62 : 0.55), t + dur);
      vib.frequency.value = rand(22, 30); vg.gain.value = 40;
      vib.connect(vg).connect(o.frequency);
      bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 3;
      o.connect(bp).connect(g); o.start(t); vib.start(t); o.stop(t + dur + 0.02); vib.stop(t + dur + 0.02);
    }
  },

  // Something vast turning over far below.
  groan(x, y) {
    const at = this.place(x, y);
    if (!this.on || !at) return;
    const ctx = this.ctx, [g, t] = this.voice(at.pan, 0.09 * at.g, 3.2, 0.8), o = ctx.createOscillator(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(rand(60, 80), t);
    o.frequency.exponentialRampToValueAtTime(rand(32, 42), t + 3);
    lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 6;
    o.connect(lp).connect(g); o.start(t); o.stop(t + 3.3);
  },

  // Near a transcendent thing: breathy noise swept through vowel-like bands.
  whisper(x, y) {
    const at = this.place(x, y);
    if (!this.on || !at) return;
    const ctx = this.ctx, dur = rand(0.9, 1.6), [g, t] = this.voice(at.pan * -0.7, 0.05 * at.g, dur, 0.25);
    const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), bp = ctx.createBiquadFilter();
    s.buffer = this.noise;
    hp.type = 'highpass'; hp.frequency.value = 900;
    bp.type = 'bandpass'; bp.Q.value = 8;
    bp.frequency.setValueAtTime(rand(700, 1100), t);
    bp.frequency.linearRampToValueAtTime(rand(1800, 2600), t + dur * 0.5);
    bp.frequency.linearRampToValueAtTime(rand(600, 900), t + dur);
    s.connect(hp).connect(bp).connect(g); s.start(t, rand(0, 1.5)); s.stop(t + dur);
  },

  // A change in one of the marked: a deep struck note that bends down, and the pond goes quiet.
  omen(x, y) {
    if (!this.on) return;
    const at = this.place(x, y) || { pan: 0, g: 0.5 };
    const ctx = this.ctx;
    for (const [f, k] of [[55, 1], [82.4, 0.6], [116.5, 0.4]]) {
      const [g, t] = this.voice(at.pan, 0.14 * k * Math.max(0.5, at.g), 4, 0.02), o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 4);
      o.connect(g); o.start(t); o.stop(t + 4.1);
    }
  },

  // A wet pull: one of the marked taking in one of its own.
  absorb(x, y) {
    const at = this.place(x, y);
    if (!this.on || !at) return;
    const ctx = this.ctx, [g, t] = this.voice(at.pan, 0.06 * at.g, 0.7, 0.05), s = ctx.createBufferSource(), lp = ctx.createBiquadFilter();
    s.buffer = this.noise;
    lp.type = 'lowpass'; lp.Q.value = 9;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 0.65);
    s.connect(lp).connect(g); s.start(t, rand(0, 1.5)); s.stop(t + 0.7);
  },

  // What's on screen, sampled a few times a second: how much is beach or
  // waterline, how much is deep, and whether a transcendent thing is in view.
  measure(world, rect) {
    const [x0, y0, x1, y1] = rect, m = this.mix;
    m.cx = (x0 + x1) / 2; m.cy = (y0 + y1) / 2; m.w = Math.max(40, x1 - x0); m.h = Math.max(30, y1 - y0);
    let beach = 0, deep = 0, n = 0;
    const tide = world.tide ? world.tide.level : 0.5;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 6; i++, n++) {
        const x = x0 + (i + 0.5) / 6 * (x1 - x0), y = y0 + (j + 0.5) / 4 * (y1 - y0);
        if (world.shore) { const e = shoreAt(world, x, y); if (e > tide - 0.3) beach++; }
        if (world.depth) deep += depthAt(world, x, y);
      }
    }
    m.beach = beach / n; m.deep = deep / n;
    // The beach lies toward the shore side: pan the surf that way.
    const N = world.shoreN || [0, 1];
    m.dir = N[0] * 0.6;
    m.eld = 0;
    for (const c of world.creatures) {
      if (!c.life || !c.life.genome.eld || c.life.corruption < 2 / 3) continue;
      const at = this.place(c.x, c.y);
      if (at) m.eld = Math.max(m.eld, at.g);
    }
  },

  update(world, dt, rect = [0, 0, world.W, world.H], k = 3) {
    if (!this.on || !this.ctx || !this.beds) return;
    this.budget = Math.min(4, this.budget + dt * 3); // at most ~3 plops a second (nothing makes a constant patter)
    this.bubbles = Math.min(2, this.bubbles + dt * 0.6); // and a bubble now and then
    this.mix.k = k;
    this.mixT -= dt;
    if (this.mixT <= 0) { this.mixT = 0.25; this.measure(world, rect); }
    const m = this.mix, now = this.ctx.currentTime, B = this.beds, W = world.weather, tide = world.tide, night = world.darkness || 0;
    const set = (param, v, tc = 0.4) => param.setTargetAtTime(v, now, tc);
    // Open water: brighter with the current, duller and quieter over the deep.
    set(B.water.g.gain, 0.13 * (1 - 0.4 * m.deep) * (1 - 0.25 * night));
    set(B.water.f.frequency, (380 + world.current.s * 700) * (1 - 0.5 * m.deep));
    // Surf by the beach: each wave swells in; lapping with the tide's flow when it's calm.
    const shore = world.shore ? m.beach : 0, wave = tide ? 0.2 + 0.8 * Math.exp(-(tide.wave % 1) * 4) : 0;
    set(B.surf.g.gain, (tide ? tide.surf : 0) * 0.26 * wave * (0.15 + 0.85 * shore), 0.12);
    set(B.surf.p.pan, m.dir);
    set(B.lap.g.gain, shore * (0.012 + 0.03 * Math.abs(tide ? tide.flow : 0)) * (1 - Math.min(1, tide ? tide.surf : 0) * 0.5), 0.3);
    set(B.rain.g.gain, W.rain * 0.22, 0.5);
    set(B.wind.g.gain, 0.01 + Math.max(0, W.gust) * 0.09 + W.rain * 0.02, 0.6);
    set(B.wind.f.frequency, 320 + Math.max(0, W.gust) * 500, 0.8);
    // The deep drone, and the strange third near the transcendent.
    set(this.drone.g.gain, m.deep * 0.18 * (0.6 + 0.4 * night) + m.eld * 0.05, 1.2);
    set(this.drone.osc[2].g.gain, m.eld * 0.8, 1.5);
    set(this.drone.osc[0].o.frequency, 43 - m.deep * 6, 2);
    if (!dt) return;
    const view = () => [m.cx + rand(-0.5, 0.5) * m.w, m.cy + rand(-0.5, 0.5) * m.h];
    // Birdsong by day near land, not out over the deep or in heavy rain.
    const landish = world.shore ? 0.35 + 0.65 * m.beach : 0.4;
    if (night < 0.3 && W.rain < 0.3 && Math.random() < dt * 0.14 * landish * (1 - m.deep)) this.chirp(rand(-0.8, 0.8), 0.6 + 0.4 * landish);
    // Crickets on the shore at night.
    if (world.shore && night > 0.5 && W.rain < 0.4 && Math.random() < dt * 1.2 * m.beach) this.cricket(m.dir + rand(-0.3, 0.3), 0.6 + m.beach);
    // Animals where they are.
    for (const c of world.creatures) {
      const s = c.species;
      if (s === 'frog' ? night > 0.4 && Math.random() < dt * 0.06 : s === 'duck' ? Math.random() < dt * 0.012 : s === 'gull' ? c.mode !== 'walk' && Math.random() < dt * 0.05 : false) {
        const at = this.place(c.x, c.y);
        if (!at) continue;
        if (s === 'frog') this.croak(at.pan, at.g); else if (s === 'duck') this.quack(at.pan, at.g); else this.gull(c.x, c.y, Math.random() < 0.3);
      }
    }
    // The deep: now and then a groan, more with something big down there.
    if (m.deep > 0.2 && Math.random() < dt * 0.01 * (1 + m.deep)) { const [x, y] = view(); this.groan(x, y); }
    if (m.eld > 0.2 && Math.random() < dt * 0.06 * m.eld) { const [x, y] = view(); this.whisper(x, y); }
  },
};
