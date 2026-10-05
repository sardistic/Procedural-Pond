'use strict';
// Volumetrics (an option, Settings → Volumetrics): the air and water over the pond as a volume, raymarched on the GPU
// and pixelated, after the volume-marching in "Volumetric lighting" (Shadertoy tdjBR1): march down through a
// density field, at each step how much light reaches it (a short march toward the sun through the same field, for
// the self-shadowing that gives clouds their shape), and blend front to back. Here the field is the pond's weather:
//  - above the water: low mist lying on it (thicker at dawn and in the fog), banks of cloud in rain, and grey curtains
//    of rain sweeping across with the wind;
//  - under it: the water's own haze, and shafts of sunlight slanting down from the surface, fading with depth.
// It follows the time of day (warm at dawn and dusk, dim at night) and is drawn at a third of the pond's resolution,
// its light and alpha stepped with an ordered dither, as a layer over everything (whatever composes the pond).

const VOL = { failed: false, cv: null, gl: null, W: 0, H: 0, B: 3 };
const VOL_VS = `#version 300 es
in vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const VOL_FS = `#version 300 es
precision highp float;
uniform sampler2D u_shore, u_depth;
uniform vec2 u_org, u_size, u_res, u_wind;
uniform vec3 u_sun, u_sunCol, u_sky, u_water;
uniform float u_block, u_t, u_tide, u_day, u_mist, u_cloud, u_rain, u_haze;
out vec4 o;
const float S = 46.0, TOP = 96.0;
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float h3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return vn(p) * 0.55 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.7) * 0.15; }
// The air's density: mist on the water, cloud above it in wet weather, rain curtains.
float airD(vec3 p) {
  float h = (p.z - S) / (TOP - S);
  vec2 drift = u_wind * u_t;
  float n = fbm(vec3((p.xy + drift * 6.0) * 0.016, p.z * 0.045 + u_t * 0.03));
  float mist = u_mist * smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(0.12, 0.4, h)) * max(0.0, n - 0.42) * 2.6;
  float cloud = u_cloud * smoothstep(0.35, 0.55, h) * (1.0 - smoothstep(0.8, 1.0, h)) * max(0.0, n - (0.62 - 0.25 * u_cloud)) * 3.0;
  float curtain = 0.0;
  if (u_rain > 0.05) {
    float c = vn(vec3((p.xy + drift * 14.0) * 0.008, u_t * 0.05));
    curtain = u_rain * smoothstep(0.55, 0.78, c) * (1.0 - smoothstep(0.55, 1.0, h)) * 0.35;
  }
  return (mist + cloud) * 0.07 + curtain * 0.08; // (per unit of height: a band of mist some 10 units deep)
}
float sunThrough(vec3 p) { // (how much sun reaches a point of the air: a short march toward it)
  float T = 1.0;
  for (int k = 1; k <= 3; k++) { vec3 q = p + u_sun * (float(k) * 7.0); if (q.z > TOP) break; T *= exp(-airD(q) * 7.0 * 1.2); }
  return T;
}
void main() {
  vec2 cell = floor(gl_FragCoord.xy), px = (vec2(cell.x, u_res.y - 1.0 - cell.y) + 0.5) * u_block;
  vec2 uv = clamp(px / u_size, vec2(0.0), vec2(1.0)), w = u_org + px;
  float b = BAYER[int(mod(cell.x, 4.0)) + int(mod(cell.y, 4.0)) * 4] / 16.0 - 0.5;
  float se = texture(u_shore, uv).r * 255.0, depth = texture(u_depth, uv).r;
  // Where the ray stops: the land, the water's surface over the shallows, or the floor (deeper over the deep).
  float ground = se > u_tide ? S + (se - u_tide) * 0.12 : 0.0;
  vec3 col = vec3(0.0); float T = 1.0;
  vec3 amb = mix(u_sky * 0.55, u_sky, u_day);
  // Above the water: down through the air.
  float dz = (TOP - max(S, ground)) / 14.0, z = TOP - dz * (0.5 + b * 0.8);
  for (int i = 0; i < 14; i++) {
    if (z < max(S, ground) || T < 0.04) break;
    vec3 p = vec3(w, z);
    float d = airD(p);
    if (d > 0.004) {
      float lit = sunThrough(p), a = 1.0 - exp(-d * dz * 1.2);
      vec3 c = u_sunCol * lit * (0.55 + 0.45 * u_day) + amb * 0.35;
      // (Under a storm's cloud the air goes a heavy grey.)
      c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))), 0.6 * min(1.0, u_cloud)) * (1.0 - 0.3 * min(1.0, u_cloud));
      col += T * a * c; T *= 1.0 - a;
    }
    z -= dz;
  }
  // Under the water: its haze, lit by shafts of sun slanting down from the surface.
  if (ground <= 0.5) {
    float bottom = 0.0, wz = S, dw = (S - bottom) / 10.0; wz = S - dw * (0.5 + b * 0.8);
    for (int i = 0; i < 10; i++) {
      if (wz < bottom || T < 0.04) break;
      vec3 p = vec3(w, wz);
      float down = S - wz, hz = u_haze * (0.6 + 0.8 * depth) * (0.7 + 0.6 * vn(vec3(p.xy * 0.03, wz * 0.05 + u_t * 0.05)));
      // The shaft: where the sun came in through the surface above, up its slant (stretched streaks of light).
      vec2 at = p.xy - u_sun.xy / max(0.2, u_sun.z) * down;
      // (Thin ridges, where the surface's ripples focus the light: a ridged noise, sharpened.)
      float rn = 1.0 - abs(vn(vec3(at * 0.09, u_t * 0.22)) * 2.0 - 1.0);
      float shaft = pow(rn, 9.0) * (0.6 + 0.8 * vn(vec3(at * 0.02, u_t * 0.05)));
      float light = shaft * exp(-down * 0.045) * u_day * (1.0 - 0.6 * u_rain) * (1.0 - 0.5 * u_cloud);
      float a = 1.0 - exp(-hz * dw);
      col += T * (a * u_water * (0.25 + 0.5 * u_day) + light * dw * 0.012 * u_sunCol);
      T *= 1.0 - a;
      wz -= dw;
    }
  }
  // The pixelation: alpha and light in a few steps, dithered over the big pixels.
  float A = clamp(1.0 - T, 0.0, 1.0);
  A = floor(A * 10.0 + 0.5 + b * 0.9) / 10.0;
  col = floor(clamp(col, 0.0, 1.5) * 12.0 + 0.5 + b * 0.7) / 12.0;
  // (Premultiplied: what's lit in the haze adds its light; only what's dense hides what's under it.)
  o = vec4(min(col, vec3(1.0)), A);
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
    const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VOL_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, VOL_FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v); return t; };
    G.tex = [tex(), tex()];
    ['u_shore', 'u_depth'].forEach((n, i) => gl.uniform1i(gl.getUniformLocation(prog, n), i));
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    G.cv = cv; G.gl = gl; G.prog = prog; G.quad = quad; G.loc = gl.getAttribLocation(prog, 'a_pos'); G.U = {};
    return true;
  } catch (e) {
    console.warn('Volumetrics unavailable:', e.message);
    G.failed = true; if (G.cv) G.cv.remove();
    return false;
  }
}
function hideVolumetric() { if (VOL.cv) VOL.cv.hidden = true; }
function placeVolumetric() {
  const G = VOL, cv = G.cv;
  if (cv && !cv.hidden) { const [x, y] = worldToScreen(G.x, G.y); cv.style.transform = `translate(${x}px, ${y}px) scale(${view.k}) rotate(${view.r * 90}deg)`; }
}
// The weather the volume holds, from the pond's state.
function volumeWeather(w, light) {
  const W = w.weather || {}, fog = typeof metaNow === 'function' ? metaNow(w, 'fog') : null, d = w.darkness || 0;
  const clock = w.clock ?? 0.5, dawn = Math.max(0, 1 - Math.abs(clock - 0.27) / 0.08), dusk = Math.max(0, 1 - Math.abs(clock - 0.73) / 0.08);
  const rain = clamp(W.rain || 0, 0, 1), gust = Math.max(0, W.gust || 0);
  return {
    rain, day: 1 - d,
    mist: clamp(0.25 + 0.9 * dawn + 0.5 * rain + (fog === 'thick' ? 1.2 : fog === 'clear' ? -0.2 : 0) - gust * 0.4, 0, 1.6),
    cloud: clamp(rain * 1.1 + (fog === 'thick' ? 0.4 : 0), 0, 1.2),
    warm: Math.max(dawn, dusk),
  };
}
function drawVolumetric(w, state, rect, light) {
  if (!volumetricAvailable()) return false;
  const G = VOL, gl = G.gl, B = G.B;
  const m = 8, snap = 48;
  const x0 = Math.max(0, Math.floor((rect[0] - m) / snap) * snap), y0 = Math.max(0, Math.floor((rect[1] - m) / snap) * snap);
  const x1 = Math.min(w.W, Math.ceil((rect[2] + m + 1) / snap) * snap), y1 = Math.min(w.H, Math.ceil((rect[3] + m + 1) / snap) * snap);
  const W = x1 - x0, H = y1 - y0, cw = Math.ceil(W / B), ch = Math.ceil(H / B), maxT = G.maxT || (G.maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE));
  if (W <= 0 || H <= 0 || W > maxT || H > maxT) return false;
  if (G.W !== W || G.H !== H) { G.cv.width = cw; G.cv.height = ch; G.cv.style.width = `${cw * B}px`; G.cv.style.height = `${ch * B}px`; G.W = W; G.H = H; G.terrainAt = 0; }
  const moved = G.x !== x0 || G.y !== y0;
  G.x = x0; G.y = y0;
  gl.viewport(0, 0, cw, ch); gl.useProgram(G.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, G.quad); gl.enableVertexAttribArray(G.loc); gl.vertexAttribPointer(G.loc, 2, gl.FLOAT, false, 0, 0);
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
  const V = volumeWeather(w, light), U = G.U, loc = (n) => U[n] ?? (U[n] = gl.getUniformLocation(G.prog, n));
  const sky = state.sky, water = w.waterColor || 0xff7c6a1b, rgb = (c) => [(c & 255) / 255, ((c >> 8) & 255) / 255, ((c >>> 16) & 255) / 255];
  // The sun (or moon): from the upper left, as the pond's shadows fall; lower and warmer at dawn and dusk.
  const elev = 0.55 + 0.35 * (1 - V.warm), sun = [-SHADOW_X, -SHADOW_Y, elev], sl = Math.hypot(...sun);
  const tint = light && light.tint ? light.tint : [1, 1, 1];
  const sunCol = [Math.min(1.2, (1 + 0.25 * V.warm) * tint[0]), Math.min(1.2, (0.95 - 0.1 * V.warm) * tint[1]), Math.min(1.2, (0.85 - 0.3 * V.warm) * tint[2])];
  gl.uniform2f(loc('u_org'), x0, y0); gl.uniform2f(loc('u_size'), W, H); gl.uniform2f(loc('u_res'), cw, ch);
  gl.uniform2f(loc('u_wind'), (w.current ? w.current.x : 0) + (w.weather.gust || 0) * 0.6, (w.current ? w.current.y : 0) + (w.weather.gust || 0) * 0.3);
  gl.uniform3f(loc('u_sun'), sun[0] / sl, sun[1] / sl, sun[2] / sl); gl.uniform3fv(loc('u_sunCol'), sunCol);
  gl.uniform3fv(loc('u_sky'), rgb(sky)); gl.uniform3fv(loc('u_water'), rgb(water));
  for (const [n, v] of Object.entries({ u_block: B, u_t: state.time ?? w.t, u_tide: w.tide.level * 255, u_day: V.day, u_mist: V.mist, u_cloud: V.cloud, u_rain: V.rain, u_haze: 0.0035 + 0.004 * V.rain })) gl.uniform1f(loc(n), v);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  G.frames = (G.frames || 0) + 1;
  if ((G.frames < 4 || G.frames % 300 === 0) && gl.getError() !== gl.NO_ERROR) { G.failed = true; hideVolumetric(); return false; }
  G.cv.hidden = false; placeVolumetric();
  return true;
}
