'use strict';

// A directional wave spectrum shared by the pond, its side cut and map.
// Independent wavelengths, phases and directions produce moving interference
// groups instead of the same three ridges repeating across the whole ocean.
const WAVE_SIN = new Float32Array(2048);
for (let i = 0; i < WAVE_SIN.length; i++) WAVE_SIN[i] = Math.sin(i * Math.PI * 2 / WAVE_SIN.length);
const waveSin = (phase) => {
  const q = phase * (2048 / (Math.PI * 2)), i = Math.floor(q), f = q - i;
  return WAVE_SIN[i & 2047] * (1 - f) + WAVE_SIN[(i + 1) & 2047] * f;
};
const waveCos = (phase) => waveSin(phase + Math.PI * 0.5);
const waveTime = (world) => world.waveTime ?? 0;

// angle, wavelength multiplier, amplitude, initial phase, wind-wave flag.
// No spatial tile or common wavelength: the surface is evaluated in world
// coordinates, including far beyond the original pond and GPU camera tile.
const WAVE_SPECTRUM = [
  [-0.61, 1.913, 0.22, 1.17, 0], [0.38, 1.537, 0.32, 4.83, 0],
  [-0.19, 1.183, 0.42, 2.41, 0], [0.73, 0.947, 0.35, 5.72, 0],
  [0.06, 0.773, 0.28, 0.38, 0], [-0.87, 0.631, 0.16, 3.96, 0],
  [0.48, 0.509, 0.10, 1.89, 0], [-0.36, 0.417, 0.065, 5.13, 0],
  [1.09, 0.347, 0.04, 2.98, 0], [-0.13, 0.283, 0.025, 0.74, 0],
  [-0.72, 0.239, 0.045, 4.19, 1], [0.91, 0.203, 0.038, 1.56, 1],
  [0.31, 0.173, 0.03, 5.49, 1], [-1.17, 0.151, 0.023, 3.27, 1],
  [0.62, 0.131, 0.018, 0.93, 1], [-0.41, 0.113, 0.013, 4.61, 1],
];
let waveSpectrumKey = '', waveSpectrumCache;

function waveComponents(dx, dy, k, chop) {
  const key = `${dx}/${dy}/${k}/${chop}`;
  if (key === waveSpectrumKey) return waveSpectrumCache;
  const components = new Float32Array(WAVE_SPECTRUM.length * 6);
  for (let i = 0; i < WAVE_SPECTRUM.length; i++) {
    const [angle, length, weight, phase, wind] = WAVE_SPECTRUM[i];
    const c = Math.cos(angle), s = Math.sin(angle), ki = k / length;
    const j = i * 6;
    components[j] = (dx * c - dy * s) * ki;
    components[j + 1] = (dy * c + dx * s) * ki;
    components[j + 2] = Math.sqrt(12 * ki);
    components[j + 3] = weight * (wind ? Math.min(1.8, 0.25 + chop) : 1);
    components[j + 4] = phase;
    components[j + 5] = 0.48 / ki;
  }
  waveSpectrumKey = key; waveSpectrumCache = components;
  return components;
}

// Generate the GPU evaluator from the same coefficients as the CPU sampler.
// Normals are derivatives of this height, rather than a separate texture.
const WAVE_GLSL = `
void waveSpectrum(vec2 pos, vec2 dir, float k, float t, float chop,
                  out float height, out vec2 slope, out vec2 orbit) {
  height = 0.0; slope = vec2(0.0); orbit = vec2(0.0);
  ${WAVE_SPECTRUM.map(([angle, length, weight, phase, wind]) => `{
    vec2 d = vec2(dir.x * ${Math.cos(angle).toFixed(9)} - dir.y * ${Math.sin(angle).toFixed(9)},
                  dir.y * ${Math.cos(angle).toFixed(9)} + dir.x * ${Math.sin(angle).toFixed(9)});
    float ki = k / ${length.toFixed(3)};
    float a = ${weight.toFixed(3)} ${wind ? '* min(1.8, 0.25 + chop)' : ''};
    float phase = dot(pos, d) * ki - t * sqrt(12.0 * ki) + ${phase.toFixed(3)};
    height += a * sin(phase);
    slope += a * ki * d * cos(phase);
    orbit += a * 0.48 * d * cos(phase);
  }`).join('\n')}
}`;

function waveField(s) {
  const dir = s.swellDir || [0, 1], gust = Math.max(0, s.gust || 0), rain = s.rain || 0;
  const energy = Math.max(0, s.swell || 0), L = 55 + energy * 60;
  const k = Math.PI * 2 / L, omega = Math.sqrt(12 * k);
  const chop = (0.12 + gust * 0.7 + rain * 0.35) * energy;
  return { x: dir[0], y: dir[1], k, omega, t: s.t || 0,
    amp: energy * (3.1 + gust), chop, components: waveComponents(dir[0], dir[1], k, chop),
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
  const amp = Math.min(f.amp * shoal, room * 0.43);
  let height = 0, sx = 0, sy = 0, ox = 0, oy = 0;
  const C = f.components;
  for (let i = 0; i < C.length; i += 6) {
    const kx = C[i], ky = C[i + 1], a = C[i + 3];
    const phase = x * kx + y * ky - f.t * C[i + 2] + C[i + 4];
    const co = a * waveCos(phase);
    height += a * waveSin(phase); sx += kx * co; sy += ky * co;
    if (out.length > 5) {
      const invK = C[i + 5];
      ox += kx * invK * co; oy += ky * invK * co;
    }
  }
  const ratio = amp * height / (room * 0.43), cap = 1 / Math.sqrt(1 + ratio * ratio);
  const near = f.shore && se ? wet < 0 ? Math.max(0, 1 + wet / (3 + f.surf * 12))
    : Math.max(0, 1 - wet / (17 + f.surf * 27)) : 0;
  // A crest runs a short way up the beach before retreating. The ecological
  // tide stays stable; only the rendered wet edge receives this fast motion.
  const runup = near * f.surf * 5;
  out[0] = amp * height * cap + runup * Math.max(0, height);
  const derivative = amp * cap * cap * cap + (height > 0 ? runup : 0);
  out[1] = sx * derivative; out[2] = sy * derivative;
  const steep = Math.hypot(out[1], out[2]);
  const breakDepth = room > 0 ? 2 * amp / room : 0;
  out[3] = Math.min(1, Math.max(0, (breakDepth - 0.68) * 2.4 + (steep - 0.5) * 0.6 + near * f.surf * 0.9) * Math.max(0, height * 0.65 + 0.3));
  if (out.length > 5) {
    // Gerstner orbital motion: crests lean forward as the surface rises.
    out[4] = amp * ox * cap; out[5] = amp * oy * cap;
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
