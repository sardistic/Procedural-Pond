'use strict';

// A displaced 3D surface shared by the pond, its side cut and map. Offshore
// wave trains keep a steady period; near the bottom they steepen, slow, and
// break when crest height approaches the available water depth.
const WAVE_SIN = new Float32Array(2048);
for (let i = 0; i < WAVE_SIN.length; i++) WAVE_SIN[i] = Math.sin(i * Math.PI * 2 / WAVE_SIN.length);
const waveSin = (phase) => WAVE_SIN[(phase * (2048 / (Math.PI * 2)) | 0) & 2047];
const waveCos = (phase) => WAVE_SIN[((phase * (2048 / (Math.PI * 2)) | 0) + 512) & 2047];
const waveTime = (world) => world.waveTime ?? 0;

function waveField(s) {
  const dir = s.swellDir || [0, 1], gust = Math.max(0, s.gust || 0), rain = s.rain || 0;
  const energy = Math.max(0, s.swell || 0), L = 55 + energy * 60;
  const k = Math.PI * 2 / L, omega = Math.sqrt(12 * k);
  return { x: dir[0], y: dir[1], k, omega, t: s.t || 0,
    amp: energy * (2.1 + gust), chop: (0.12 + gust * 0.7 + rain * 0.35) * energy,
    surf: s.surf || 0, tide: (s.tide ?? 1) * 255, shore: s.shore || null,
    depth: s.depth || null, river: s.riverMask || null };
}

// out: height, x/y slope, breaking foam, x/y orbital displacement. Reuse the
// caller's buffer so the inner raster loop never allocates per pixel.
function waveAt(f, x, y, p, out) {
  const se = f.shore ? f.shore[p] : 0, wet = f.tide - se;
  const dd = f.depth ? f.depth[p] : 0;
  const room = f.shore && se ? Math.max(0.4, wet * 0.24) : 20 + dd * 0.45;
  const shallow = Math.min(1, room / 19), shoal = 1 + 0.55 * (1 - shallow);
  const u = x * f.x + y * f.y;
  const v = -x * f.y + y * f.x;
  const packet = 0.72 + 0.17 * waveSin(v * 0.026 + f.t * 0.11) + 0.11 * waveSin(u * 0.013 + v * 0.019 - f.t * 0.08);
  const amp = Math.min(f.amp * shoal * packet, room * 0.43);
  const phase = u * f.k - f.t * f.omega + 0.8 * waveSin(v * 0.022 + f.t * 0.05) + 0.16 * waveSin(u * 0.013 - v * 0.015);
  const cross = (u * 0.78 + v * 0.33) * f.k * 1.8 - f.t * f.omega * 1.35;
  const chopPhase = (u * 0.43 - v * 0.9) * f.k * 3.3 - f.t * f.omega * 2.25;
  const a = waveSin(phase), b = waveSin(cross), c = waveSin(chopPhase);
  const a2 = amp * 0.26, a3 = f.chop * (0.35 + 0.65 * (1 - shallow)) * Math.min(amp, 1.5);
  const near = f.shore && se ? wet < 0 ? Math.max(0, 1 + wet / (3 + f.surf * 12))
    : Math.max(0, 1 - wet / (17 + f.surf * 27)) : 0;
  // A crest runs a short way up the beach before retreating. The ecological
  // tide stays stable; only the rendered wet edge receives this fast motion.
  out[0] = amp * a + a2 * b + a3 * c + near * f.surf * 5 * Math.max(0, a);
  out[1] = amp * f.k * f.x * waveCos(phase) + a2 * f.k * 1.8 * (f.x * 0.78 - f.y * 0.33) * waveCos(cross)
    + a3 * f.k * 3.3 * (f.x * 0.43 + f.y * 0.9) * waveCos(chopPhase);
  out[2] = amp * f.k * f.y * waveCos(phase) + a2 * f.k * 1.8 * (f.y * 0.78 + f.x * 0.33) * waveCos(cross)
    + a3 * f.k * 3.3 * (f.y * 0.43 - f.x * 0.9) * waveCos(chopPhase);
  const steep = amp * f.k * (1 + f.chop * 0.6);
  const breakDepth = room > 0 ? 2 * amp / room : 0;
  out[3] = Math.min(1, Math.max(0, (breakDepth - 0.68) * 2.4 + (steep - 0.23) * 1.5 + near * f.surf * 0.9) * Math.max(0, a * 0.65 + 0.3));
  if (out.length > 5) {
    // Gerstner orbital motion: crests lean forward as the surface rises.
    const lean = Math.min(0.72, 0.72 / Math.max(0.05, amp * f.k));
    out[4] = lean * amp * f.x * waveCos(phase) + a2 * 0.22 * (-f.y) * waveCos(cross);
    out[5] = lean * amp * f.y * waveCos(phase) + a2 * 0.22 * f.x * waveCos(cross);
  }
  // River channels are sheltered from ocean breakers.
  if (f.river && x >= f.river.x0 && y >= f.river.y0 && x < f.river.x0 + f.river.w && y < f.river.y0 + f.river.h
      && f.river.data[(x - f.river.x0) + (y - f.river.y0) * f.river.w] === 1) {
    out[0] *= 0.18; out[1] *= 0.18; out[2] *= 0.18; out[3] = 0;
    if (out.length > 5) { out[4] *= 0.18; out[5] *= 0.18; }
  }
  return out;
}

const WAVE_ORBIT_SAMPLE = new Float32Array(4), WAVE_ORBIT_V = new Float32Array(2);
function waveOrbit(world, x, y) {
  const f = world.waveField;
  if (!f) { WAVE_ORBIT_V[0] = 0; WAVE_ORBIT_V[1] = 0; return WAVE_ORBIT_V; }
  const xi = Math.max(0, Math.min(world.W - 1, x | 0)), yi = Math.max(0, Math.min(world.H - 1, y | 0));
  waveAt(f, xi, yi, xi + yi * world.W, WAVE_ORBIT_SAMPLE);
  const speed = Math.max(-2, Math.min(2, (WAVE_ORBIT_SAMPLE[1] * f.x + WAVE_ORBIT_SAMPLE[2] * f.y) * f.omega / f.k * 0.4));
  WAVE_ORBIT_V[0] = speed * f.x; WAVE_ORBIT_V[1] = speed * f.y;
  return WAVE_ORBIT_V;
}
