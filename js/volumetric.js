'use strict';
// Volumetrics (an option, Settings → Volumetrics): the air and water over the pond as a glowing volume, raymarched on
// the GPU. The look is after two pieces: the volume-marching of "Volumetric lighting" (Shadertoy tdjBR1: march through
// a density field, at each step a short march toward the light for the self-shadowing that shapes it, blended front
// to back), and the atmosphere of Altair's 4K intro "Then and Before" (KK, Lesnik, Virgill): light gathered all along
// each ray from what glows nearby, the sun's direction jittered a little each frame so its shadows come out soft, and
// the frames accumulated one into the next so the noise settles into smooth haze. (Written here from those ideas; no
// code from either.)
// In the pond:
//  - the air: a thin humid layer lying on all the water (heavier at dawn, after rain and in the fog), and mist and
//    spray rising thick where the waves break, along the beach and round every island, drifting downwind as it
//    climbs; lit by the sun through itself, and by everything glowing below it;
//  - the water: its haze, thicker over the deep, with shafts of sunlight slanting down from the surface, and every
//    light in the pond (glowing animals, the beacon, lighthouses, harbors, shrines: the light map, depths.js) glowing
//    out through it, spreading wider the deeper it goes;
//  - rain, falling in streaks through three depths and ringing the water where it lands (drawn crisp over the rest).
// Drawn at the pond's own resolution, smooth, as a layer over everything (whatever composes the pond).

const VOL = { failed: false, cv: null, gl: null, W: 0, H: 0, B: 1, cur: 0, fresh: true };
const VOL_VS = `#version 300 es
in vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const VOL_COMMON = `
const float S = 46.0, TOP = 86.0;
float h3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return vn(p) * 0.55 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.7) * 0.15; }`;
// Pass 1: the volume, mixed into what the last frames made of it (moved with the view), into a texture.
const VOL_FS = `#version 300 es
precision highp float;
uniform sampler2D u_shore, u_depth, u_light, u_prev;
uniform vec2 u_org, u_size, u_res, u_wind, u_lorg, u_lsize, u_shift;
uniform vec3 u_sun, u_sunCol, u_sky, u_water;
uniform float u_block, u_t, u_tide, u_day, u_hum, u_surf, u_rain, u_haze, u_storm, u_seed, u_keep, u_glow;
out vec4 o;
${VOL_COMMON}
float shoreAt(vec2 w) { return texture(u_shore, clamp((w - u_org) / u_size, vec2(0.0), vec2(1.0))).r * 255.0; }
// What glows round a point (the light map, smoothed), sampled a random way off it each frame by up to spread: summed
// over frames, a light blooms into a halo as wide as that.
vec3 glowAt(vec2 w, float spread, float r) {
  vec2 j = (vec2(h2(vec2(r, u_seed)), h2(vec2(u_seed, r + 3.1))) - 0.5) * 2.0 * spread;
  return texture(u_light, clamp((w + j - u_lorg) / 4.0 / u_lsize, vec2(0.0), vec2(1.0))).rgb;
}
// The vapour over the water: a thin humid breath lying on all of it, and mist and spray rising thick where the waves
// break, at the beach and round every island, carried downwind as it climbs and thinning out.
float vapour(vec3 p) {
  float h = p.z - S;
  if (h < 0.0) return 0.0;
  vec2 q = p.xy - u_wind * h * 0.9; // (it drifts downwind as it rises)
  float se = shoreAt(q), wet = u_tide - se;
  // The break: the band either side of the waterline where waves run up the sand and round the islands.
  float brk = se > 0.5 ? smoothstep(26.0 + 30.0 * u_surf, 0.0, abs(wet)) : 0.0;
  float n = fbm(vec3((q - u_wind * u_t * 4.0) * 0.035, (h - u_t * 2.2) * 0.07));
  float wisps = max(0.0, n - 0.42) * 2.4;
  float breath = u_hum * exp(-h / 3.0);
  float spray = brk * (0.35 + 1.4 * u_surf + 0.6 * u_storm) * exp(-h / (6.0 + 10.0 * u_surf));
  return (breath + spray) * wisps * 0.09;
}
float sunThrough(vec3 p, vec3 sd) {
  float T = 1.0;
  for (int k = 1; k <= 3; k++) { vec3 q = p + sd * (float(k) * 5.0); T *= exp(-vapour(q) * 5.0); }
  return T;
}
void main() {
  vec2 fc = gl_FragCoord.xy, px = vec2(fc.x, u_res.y - fc.y) * u_block;
  vec2 uv = clamp(px / u_size, vec2(0.0), vec2(1.0)), w = u_org + px;
  float se = texture(u_shore, uv).r * 255.0, depth = texture(u_depth, uv).r;
  float jitter = h2(fc + u_seed * 17.0) - 0.5;
  // (The sun's direction moved a little each frame: summed, its shadows and shafts come out soft.)
  vec3 sd = normalize(u_sun + vec3(h2(vec2(u_seed, 1.7)) - 0.5, h2(vec2(2.3, u_seed)) - 0.5, 0.0) * 0.12);
  float ground = se > u_tide ? S + (se - u_tide) * 0.12 : 0.0;
  vec3 col = vec3(0.0); float T = 1.0;
  vec3 amb = mix(u_sky * 0.5, u_sky, u_day);
  // Down through the vapour (only the low air holds any), lit by the sun and by what glows beneath.
  float floorZ = max(S, ground), dz = (TOP - floorZ) / 16.0, z = TOP - dz * (0.5 + jitter);
  for (int i = 0; i < 16; i++) {
    if (z < floorZ || T < 0.03) break;
    vec3 p = vec3(w, z);
    float d = vapour(p);
    if (d > 0.002) {
      float lit = sunThrough(p, sd), a = 1.0 - exp(-d * dz);
      vec3 c = (u_sunCol * lit * (0.5 + 0.5 * u_day) + amb * 0.45) * (1.0 - 0.35 * u_storm);
      if (u_glow > 0.0) c += glowAt(p.xy, 3.0 + (z - S) * 0.6, float(i)) * 1.6;
      col += T * a * c; T *= 1.0 - a;
    }
    z -= dz;
  }
  // Under the water: its haze, shafts of sun slanting down from the surface, and the glow of every light through it.
  if (ground <= 0.5) {
    float dw = S / 12.0, wz = S - dw * (0.5 + jitter);
    for (int i = 0; i < 12; i++) {
      if (wz < 0.0 || T < 0.03) break;
      vec3 p = vec3(w, wz);
      float down = S - wz, hz = u_haze * (0.6 + 0.8 * depth) * (0.7 + 0.6 * vn(vec3(p.xy * 0.03, wz * 0.05 + u_t * 0.05)));
      vec2 at = p.xy - sd.xy / max(0.2, sd.z) * down;
      float rn = 1.0 - abs(vn(vec3(at * 0.09, u_t * 0.22)) * 2.0 - 1.0);
      float shaft = pow(rn, 9.0) * (0.6 + 0.8 * vn(vec3(at * 0.02, u_t * 0.05)));
      float light = shaft * exp(-down * 0.045) * u_day * (1.0 - 0.6 * u_rain) * (1.0 - 0.5 * u_storm);
      float a = 1.0 - exp(-hz * dw);
      col += T * (a * u_water * (0.25 + 0.5 * u_day) + light * dw * 0.012 * u_sunCol);
      // (The glow: thicker in the deep, where the haze is, and spreading the further down it goes.)
      if (u_glow > 0.0) col += T * glowAt(p.xy, 2.0 + down * 0.35 + 6.0 * depth, float(i) + 40.0) * (0.02 + 0.06 * depth) * dw;
      T *= 1.0 - a;
      wz -= dw;
    }
  }
  vec4 cur = vec4(min(col, vec3(1.0)), clamp(1.0 - T, 0.0, 1.0));
  // Accumulated: this frame's noisy look mixed into the last frames' (where that point was in them), so it settles.
  vec2 pu = (fc + u_shift) / u_res;
  if (u_keep > 0.0 && pu.x > 0.0 && pu.y > 0.0 && pu.x < 1.0 && pu.y < 1.0) cur = mix(cur, texture(u_prev, pu), u_keep);
  o = cur;
}`;
// Pass 2: the accumulated volume shown, and the rain over it (crisp, not accumulated).
const VOL_SHOW = `#version 300 es
precision highp float;
uniform sampler2D u_vol, u_shore;
uniform vec2 u_org, u_size, u_res, u_wind;
uniform float u_block, u_t, u_tide, u_rain;
out vec4 o;
${VOL_COMMON}
// Rain: streaks falling through the air in three depths (slanted by the wind, the nearer longer and quicker), and
// rings where the drops land on the water.
vec4 rain(vec2 w, bool overWater) {
  if (u_rain < 0.02) return vec4(0.0);
  vec4 acc = vec4(0.0);
  vec2 slant = normalize(vec2(0.35, 1.0) + u_wind * 1.5);
  for (int k = 0; k < 3; k++) {
    float fk = float(k), cell = 7.0 + fk * 5.0, len = 3.0 + fk * 3.0, speed = 70.0 + fk * 45.0;
    vec2 q = w + slant * u_t * speed;
    vec2 c = floor(q / cell), f = q - c * cell;
    float r = h2(c + fk * 31.7);
    if (r > u_rain * (0.55 + 0.25 * fk)) continue;
    vec2 at = vec2(h2(c + 3.1), h2(c + 7.9)) * cell;
    vec2 d = f - at; float along = dot(d, slant), across = abs(d.x * slant.y - d.y * slant.x);
    if (along > -len && along < 0.0 && across < 0.5 + 0.2 * fk) {
      float a = (0.18 + 0.12 * fk) * (1.0 + along / len * 0.6);
      acc += vec4(vec3(0.82, 0.88, 0.95) * a, a) * (1.0 - acc.a);
    }
  }
  if (overWater) {
    float cell = 11.0, ph = u_t * 1.6;
    vec2 c = floor(w / cell), f = w - c * cell;
    float r = h2(c + 91.0), life = fract(ph + r * 7.0);
    if (r < u_rain * 0.8) {
      vec2 at = vec2(h2(c + 13.0), h2(c + 17.0)) * (cell - 4.0) + 2.0;
      float d = length(f - at), R = 0.5 + 3.0 * life;
      if (abs(d - R) < 0.55) { float a = 0.35 * (1.0 - life); acc += vec4(vec3(0.85, 0.92, 0.98) * a, a) * (1.0 - acc.a); }
    }
  }
  return acc;
}
void main() {
  vec2 fc = gl_FragCoord.xy, px = vec2(fc.x, u_res.y - fc.y) * u_block, w = u_org + px;
  vec4 v = texture(u_vol, fc / u_res);
  float se = texture(u_shore, clamp(px / u_size, vec2(0.0), vec2(1.0))).r * 255.0;
  vec4 r = rain(w, se <= u_tide);
  o = r + v * (1.0 - r.a);
}`;

function volumetricAvailable() {
  const G = VOL;
  if (G.failed) return false;
  if (G.gl) return true;
  try {
    const cv = document.createElement('canvas'); cv.id = 'volumetric'; cv.hidden = true; cv.setAttribute('aria-hidden', 'true');
    document.getElementById('pond').after(cv);
    const gl = cv.getContext('webgl2', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.failed = true; cv.hidden = true; });
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const link = (fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VOL_VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
    G.prog = link(VOL_FS); G.show = link(VOL_SHOW);
    const tex = (f) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, f], [gl.TEXTURE_MAG_FILTER, f], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v); return t; };
    // 0 shore, 1 depth, 2 the light map; 3 and 4 the accumulation (one read, the other written, turn about).
    G.tex = [tex(gl.LINEAR), tex(gl.LINEAR), tex(gl.LINEAR), tex(gl.NEAREST), tex(gl.NEAREST)];
    G.fbo = [gl.createFramebuffer(), gl.createFramebuffer()];
    // (Half floats where it can draw into them: in 8 bits the faint glow would round to a residue that never fades.)
    G.half = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.useProgram(G.prog); ['u_shore', 'u_depth', 'u_light', 'u_prev'].forEach((n, i) => gl.uniform1i(gl.getUniformLocation(G.prog, n), i));
    gl.useProgram(G.show); gl.uniform1i(gl.getUniformLocation(G.show, 'u_shore'), 0); gl.uniform1i(gl.getUniformLocation(G.show, 'u_vol'), 3);
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    G.cv = cv; G.gl = gl; G.quad = quad; G.U = {}; G.US = {};
    G.locA = gl.getAttribLocation(G.prog, 'a_pos'); G.locB = gl.getAttribLocation(G.show, 'a_pos');
    return true;
  } catch (e) {
    console.warn('Volumetrics unavailable:', e.message);
    G.failed = true; if (G.cv) G.cv.remove();
    return false;
  }
}
function hideVolumetric() { if (VOL.cv) { VOL.cv.hidden = true; VOL.fresh = true; } }
function placeVolumetric() {
  const G = VOL, cv = G.cv;
  if (cv && !cv.hidden) { const [x, y] = worldToScreen(G.x, G.y); cv.style.transform = `translate(${x}px, ${y}px) scale(${view.k}) rotate(${view.r * 90}deg)`; }
}
// The weather the volume holds, from the pond's state.
function volumeWeather(w, light) {
  const W = w.weather || {}, fog = typeof metaNow === 'function' ? metaNow(w, 'fog') : null, d = w.darkness || 0;
  const clock = w.clock ?? 0.5, dawn = Math.max(0, 1 - Math.abs(clock - 0.27) / 0.08), dusk = Math.max(0, 1 - Math.abs(clock - 0.73) / 0.08);
  const rain = clamp(W.rain || 0, 0, 1), gust = Math.max(0, W.gust || 0), surf = w.tide ? w.tide.surf || 0 : 0;
  // (The humidity: a little always, more at dawn and in the fog, and after rain; dried off by the wind.)
  w.volWet = clamp((w.volWet || 0) + (rain - (w.volWet || 0)) * 0.002, 0, 1);
  return {
    rain, day: 1 - d, surf: clamp(surf + gust * 0.5, 0, 1.5), storm: clamp(rain * 0.7 + gust * 0.5, 0, 1),
    hum: clamp(0.3 + 0.9 * dawn + 0.4 * dusk + 0.6 * w.volWet + 0.4 * rain + (fog === 'thick' ? 1.3 : fog === 'clear' ? -0.25 : 0) - gust * 0.35, 0, 2),
    warm: Math.max(dawn, dusk),
  };
}
// The light map under the tile (and a margin, for the halos), as a small float texture of its 4 px cells; overlapping
// lights saturate softly. Returns whether anything glows there.
function volumeLights(G, gl, w, x0, y0, x1, y1) {
  const M = w.lightMap, cs = LIGHT_CELL, mg = 40;
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.tex[2]);
  if (!M || !M.any) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(4)); G.lorg = [0, 0]; G.lsize = [1, 1]; return false; }
  const lx0 = Math.max(0, Math.floor((x0 - mg) / cs)), ly0 = Math.max(0, Math.floor((y0 - mg) / cs));
  const lx1 = Math.min(M.lw - 1, Math.ceil((x1 + mg) / cs)), ly1 = Math.min(M.lh - 1, Math.ceil((y1 + mg) / cs));
  const lw = lx1 - lx0 + 1, lh = ly1 - ly0 + 1, D = M.data;
  const L = G.lbuf && G.lbuf.length === lw * lh * 4 ? G.lbuf : (G.lbuf = new Float32Array(lw * lh * 4));
  let any = false;
  for (let y = 0; y < lh; y++) {
    let s = (lx0 + (ly0 + y) * M.lw) * 3, d = y * lw * 4;
    for (let x = 0; x < lw; x++, s += 3, d += 4) {
      const r = D[s], g = D[s + 1], b = D[s + 2], m = Math.max(r, g, b), k = m > 0.004 ? 1 / (1 + m) : 0;
      L[d] = r * k; L[d + 1] = g * k; L[d + 2] = b * k; L[d + 3] = 0;
      if (k) any = true;
    }
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, lw, lh, 0, gl.RGBA, gl.FLOAT, L);
  G.lorg = [lx0 * cs, ly0 * cs]; G.lsize = [lw, lh];
  return any;
}
function drawVolumetric(w, state, rect, light) {
  if (!volumetricAvailable()) return false;
  const G = VOL, gl = G.gl, B = G.B;
  const m = 8, snap = 48;
  const x0 = Math.max(0, Math.floor((rect[0] - m) / snap) * snap), y0 = Math.max(0, Math.floor((rect[1] - m) / snap) * snap);
  const x1 = Math.min(w.W, Math.ceil((rect[2] + m + 1) / snap) * snap), y1 = Math.min(w.H, Math.ceil((rect[3] + m + 1) / snap) * snap);
  const W = x1 - x0, H = y1 - y0, cw = Math.ceil(W / B), ch = Math.ceil(H / B), maxT = G.maxT || (G.maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE));
  if (W <= 0 || H <= 0 || W > maxT || H > maxT) return false;
  if (G.W !== W || G.H !== H) {
    G.cv.width = cw; G.cv.height = ch; G.cv.style.width = `${cw * B}px`; G.cv.style.height = `${ch * B}px`; G.W = W; G.H = H; G.terrainAt = 0;
    // (The accumulation at the new size; its history starts over.)
    gl.activeTexture(gl.TEXTURE3);
    for (let k = 0; k < 2; k++) {
      gl.bindTexture(gl.TEXTURE_2D, G.tex[3 + k]);
      if (G.half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, cw, ch, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo[k]); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G.tex[3 + k], 0);
      if (G.half && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { G.half = false; G.W = 0; gl.bindFramebuffer(gl.FRAMEBUFFER, null); return drawVolumetric(w, state, rect, light); }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    G.fresh = true;
  }
  const dx = x0 - (G.x ?? x0), dy = y0 - (G.y ?? y0), moved = dx !== 0 || dy !== 0;
  G.x = x0; G.y = y0;
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  // Shore and depth for the tile (straight from the pond's arrays), when it moves or now and then.
  const now = performance.now();
  if (moved || now - (G.terrainAt || 0) > 3000 || G.shoreRef !== w.shore) {
    const up = (k, arr) => {
      gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, G.tex[k]);
      if (!arr) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1)); return; }
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w.W); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, arr);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    };
    up(0, w.shore); up(1, w.depth);
    G.terrainAt = now; G.shoreRef = w.shore;
  }
  const glow = volumeLights(G, gl, w, x0, y0, x1, y1);
  const V = volumeWeather(w, light), U = G.U, loc = (n) => U[n] ?? (U[n] = gl.getUniformLocation(G.prog, n));
  const sky = state.sky, water = w.waterColor || 0xff7c6a1b, rgb = (c) => [(c & 255) / 255, ((c >> 8) & 255) / 255, ((c >>> 16) & 255) / 255];
  // The sun (or moon): from the upper left, as the pond's shadows fall; lower and warmer at dawn and dusk.
  const elev = 0.55 + 0.35 * (1 - V.warm), sun = [-SHADOW_X, -SHADOW_Y, elev], sl = Math.hypot(...sun);
  const tint = light && light.tint ? light.tint : [1, 1, 1];
  const sunCol = [Math.min(1.2, (1 + 0.25 * V.warm) * tint[0]), Math.min(1.2, (0.95 - 0.1 * V.warm) * tint[1]), Math.min(1.2, (0.85 - 0.3 * V.warm) * tint[2])];
  const wind = [(w.current ? w.current.x : 0) + (w.weather.gust || 0) * 0.6, (w.current ? w.current.y : 0) + (w.weather.gust || 0) * 0.3];
  const t = state.time ?? w.t, tide = w.tide.level * 255;
  // Pass 1: the volume, into the other accumulation texture, mixed with this one.
  const wr = G.cur ^ 1;
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo[wr]); gl.viewport(0, 0, cw, ch); gl.useProgram(G.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, G.quad); gl.enableVertexAttribArray(G.locA); gl.vertexAttribPointer(G.locA, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.tex[3 + G.cur]);
  gl.uniform2f(loc('u_org'), x0, y0); gl.uniform2f(loc('u_size'), W, H); gl.uniform2f(loc('u_res'), cw, ch); gl.uniform2fv(loc('u_wind'), wind);
  gl.uniform2fv(loc('u_lorg'), G.lorg); gl.uniform2fv(loc('u_lsize'), G.lsize);
  // (Where this pixel's point was in the last frame: the tile moved by dx, dy; the rows run upward here.)
  gl.uniform2f(loc('u_shift'), dx / B, -dy / B);
  gl.uniform3f(loc('u_sun'), sun[0] / sl, sun[1] / sl, sun[2] / sl); gl.uniform3fv(loc('u_sunCol'), sunCol);
  gl.uniform3fv(loc('u_sky'), rgb(sky)); gl.uniform3fv(loc('u_water'), rgb(water));
  G.frames = (G.frames || 0) + 1;
  for (const [n, v] of Object.entries({ u_block: B, u_t: t, u_tide: tide, u_day: V.day, u_hum: V.hum, u_surf: V.surf, u_storm: V.storm, u_rain: V.rain, u_haze: 0.0035 + 0.004 * V.rain,
    u_seed: (G.frames % 997) + 0.37, u_keep: G.fresh ? 0 : 0.82, u_glow: glow ? 1 : 0 })) gl.uniform1f(loc(n), v);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  G.cur = wr; G.fresh = false;
  // Pass 2: shown, with the rain.
  const US = G.US, ls = (n) => US[n] ?? (US[n] = gl.getUniformLocation(G.show, n));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(G.show);
  gl.enableVertexAttribArray(G.locB); gl.vertexAttribPointer(G.locB, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.tex[3 + G.cur]);
  gl.uniform2f(ls('u_org'), x0, y0); gl.uniform2f(ls('u_size'), W, H); gl.uniform2f(ls('u_res'), cw, ch); gl.uniform2fv(ls('u_wind'), wind);
  for (const [n, v] of Object.entries({ u_block: B, u_t: t, u_tide: tide, u_rain: V.rain })) gl.uniform1f(ls(n), v);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if ((G.frames < 4 || G.frames % 300 === 0) && gl.getError() !== gl.NO_ERROR) { G.failed = true; hideVolumetric(); return false; }
  G.cv.hidden = false; placeVolumetric();
  return true;
}
