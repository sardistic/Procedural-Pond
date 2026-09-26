'use strict';
// Generative soundscape, synthesized with Web Audio (no audio files): a water
// bed that swells with the current, rain hiss, plops panned to where ripples
// land, birdsong by day, frogs at night and the occasional duck.

const Sound = {
  ctx: null, master: null, on: false,
  water: null, waterFilter: null, rain: null, surf: null, budget: 0,

  start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // Two seconds of brown noise, looped, feeds the water and rain beds.
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const loop = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    this.waterFilter = ctx.createBiquadFilter();
    this.waterFilter.type = 'lowpass';
    this.waterFilter.frequency.value = 500;
    this.water = ctx.createGain();
    this.water.gain.value = 0.16;
    loop().connect(this.waterFilter).connect(this.water).connect(this.master);
    const swell = ctx.createOscillator(), depth = ctx.createGain();
    swell.frequency.value = 0.07; depth.gain.value = 0.05;
    swell.connect(depth).connect(this.water.gain);
    swell.start();

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1400;
    this.rain = ctx.createGain();
    this.rain.gain.value = 0;
    loop().connect(hp).connect(this.rain).connect(this.master);

    // Surf: a band of noise that swells each time a wave reaches the beach.
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    this.surf = ctx.createGain();
    this.surf.gain.value = 0;
    loop().connect(bp).connect(this.surf).connect(this.master);
    return true;
  },

  setEnabled(on) {
    if (on && !this.ctx && !this.start()) return;
    this.on = on;
    if (this.ctx) on ? this.ctx.resume() : this.ctx.suspend();
  },

  // A voice routed through a stereo panner (pan -1..1) with a quick envelope.
  voice(pan, peak, dur) {
    const ctx = this.ctx, t = ctx.currentTime, g = ctx.createGain(), p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(p).connect(this.master);
    return [g, t];
  },

  plop(x01, size = 1) {
    if (!this.on || this.budget < 1) return;
    this.budget--;
    const [g, t] = this.voice(x01 * 2 - 1, 0.05 + 0.1 * Math.min(1, size), 0.16);
    const o = this.ctx.createOscillator();
    const f = rand(500, 900) / Math.max(0.5, size);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.35, t + 0.12);
    o.connect(g);
    o.start(t); o.stop(t + 0.18);
  },

  chirp(pan) {
    const n = randi(2, 4), base = rand(2400, 3600);
    for (let i = 0; i < n; i++) {
      const [g, t0] = this.voice(pan, 0.03, 0.09), t = t0 + i * 0.11, o = this.ctx.createOscillator();
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.frequency.setValueAtTime(base * rand(0.9, 1.1), t);
      o.frequency.exponentialRampToValueAtTime(base * rand(1.2, 1.5), t + 0.07);
      o.connect(g); o.start(t); o.stop(t + 0.1);
    }
  },

  croak(pan) {
    const ctx = this.ctx, [g, t] = this.voice(pan, 0.08, 0.32), o = ctx.createOscillator(), bp = ctx.createBiquadFilter();
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

  quack(pan) {
    const ctx = this.ctx;
    for (let i = 0; i < 2; i++) {
      const [g, t0] = this.voice(pan, 0.05, 0.2), t = t0 + i * 0.22, o = ctx.createOscillator(), bp = ctx.createBiquadFilter();
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.15);
      bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 2;
      o.connect(bp).connect(g); o.start(t); o.stop(t + 0.18);
    }
  },

  update(world, dt) {
    if (!this.on || !this.ctx) return;
    this.budget = Math.min(6, this.budget + dt * 8); // at most ~8 plops a second
    const now = this.ctx.currentTime;
    this.rain.gain.setTargetAtTime(world.weather.rain * 0.22, now, 0.5);
    this.waterFilter.frequency.setTargetAtTime(380 + world.current.s * 700, now, 0.5);
    const tide = world.tide, wash = tide && world.shore ? tide.surf * 0.2 * (0.2 + 0.8 * Math.exp(-(tide.wave % 1) * 4)) : 0;
    this.surf.gain.setTargetAtTime(wash, now, 0.12);
    const pan = () => rand(-0.8, 0.8), has = (s) => world.creatures.some((c) => c.species === s);
    if (world.darkness < 0.3 && world.weather.rain < 0.3 && Math.random() < dt * 0.12) this.chirp(pan());
    if (world.darkness > 0.4 && has('frog') && Math.random() < dt * 0.35) this.croak(pan());
    if (has('duck') && Math.random() < dt * 0.02) this.quack(pan());
  },
};
