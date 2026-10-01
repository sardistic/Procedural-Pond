'use strict';

// A compact height field shared by the pond and its map. The deep-water train
// keeps a steady period; finite depth shoals it, limits its height, and causes
// breaking near the shore. This is a surface model, not a fluid-volume solver.
const WAVE_SIN = new Float32Array(2048);
for (let i = 0; i < WAVE_SIN.length; i++) WAVE_SIN[i] = Math.sin(i * Math.PI * 2 / WAVE_SIN.length);
const waveSin = (phase) => WAVE_SIN[(phase * (2048 / (Math.PI * 2)) | 0) & 2047];
const waveCos = (phase) => WAVE_SIN[((phase * (2048 / (Math.PI * 2)) | 0) + 512) & 2047];

function waveField(s) {
  const dir = s.swellDir || [0, 1], gust = Math.max(0, s.gust || 0), rain = s.rain || 0;
  const energy = Math.max(0, s.swell || 0), L = 48 + energy * 42;
  const k = Math.PI * 2 / L, omega = Math.sqrt(12 * k);
  return { x: dir[0], y: dir[1], k, omega, t: s.t || 0,
    amp: energy * (1.4 + gust * 0.7), chop: (0.12 + gust * 0.7 + rain * 0.35) * energy,
    surf: s.surf || 0, tide: (s.tide ?? 1) * 255, shore: s.shore || null,
    depth: s.depth || null, river: s.riverMask || null };
}

// out: height in world pixels, x/y slope, breaking foam 0..1. Reuse the
// caller's buffer so the inner raster loop never allocates per pixel.
function waveAt(f, x, y, p, out) {
  const se = f.shore ? f.shore[p] : 0, wet = f.tide - se;
  const dd = f.depth ? f.depth[p] : 0;
  const room = f.shore && se ? Math.max(0.4, wet * 0.24) : 20 + dd * 0.45;
  const shallow = Math.min(1, room / 19), shoal = 1 + 0.55 * (1 - shallow);
  const amp = Math.min(f.amp * shoal, room * 0.55);
  const u = x * f.x + y * f.y;
  const v = -x * f.y + y * f.x;
  const phase = u * f.k - f.t * f.omega;
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
  out[3] = Math.min(1, Math.max(0, (steep - 0.15) * 4 + near * f.surf * 0.6) * Math.max(0, a * 0.65 + 0.3));
  // River channels are sheltered from ocean breakers.
  if (f.river && x >= f.river.x0 && y >= f.river.y0 && x < f.river.x0 + f.river.w && y < f.river.y0 + f.river.h
      && f.river.data[(x - f.river.x0) + (y - f.river.y0) * f.river.w] === 1) out[3] = 0;
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
