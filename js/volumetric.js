'use strict';
// Volumetrics (an option, Settings → Volumetrics): the air and water over the pond as a glowing volume, raymarched on
// the GPU. The look is after two pieces: the volume-marching of "Volumetric lighting" (Shadertoy tdjBR1: march through
// a density field, at each step a short march toward the light for the self-shadowing that shapes it, blended front
// to back), and the atmosphere of Altair's 4K intro "Then and Before" (KK, Lesnik, Virgill): light gathered all along
// each ray from what glows nearby, scattered by the haze it passes through. (Written here from those ideas; no code
// from either.)
// In the pond:
//  - the air: a thin humid layer lying on all the water (heavier at dawn, after rain and in the fog), and mist and
//    spray rising thick where the waves break, along the beach and round every island, drifting downwind as it
//    climbs; lit by the sun through itself, and by the lights below it that the water above them lets through;
//  - the water: its haze, thicker over the deep, with shafts of sunlight slanting down from the surface, and the light
//    of every lamp in the pond (glowing animals, the beacon, lighthouses, harbors, shrines, lanterns: the light map,
//    depths.js) scattered by that haze: a soft halo round each, kept by the land (an island between a light and the
//    water beyond shades it) and in proportion to the haze lit, so a huge light lifts the water, never whites it out;
//  - rain, falling in streaks through three depths and ringing the water where it lands.
// Steady: nothing in it changes from frame to frame but what moves in the pond (no per-frame noise to shimmer).
// Drawn at the pond's own resolution, smooth, as a layer over everything (whatever composes the pond).

const VOL = { failed: false, cv: null, gl: null, W: 0, H: 0, B: 1 };
const VOL_VS = `#version 300 es
in vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
// Rain: streaks falling through the air in three depths (slanted by the wind, the nearer longer and quicker), and
// rings where the drops land on the water. (Over the volume, in the same pass.)
const VOL_RAIN = `
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
}`;

const VOL_FS = `#version 300 es
precision highp float;
uniform sampler2D u_shore, u_depth, u_light;
uniform vec2 u_org, u_size, u_res, u_wind, u_lorg, u_lsize;
uniform vec3 u_sun, u_sunCol, u_sky, u_water;
uniform float u_block, u_t, u_tide, u_day, u_hum, u_surf, u_rain, u_haze, u_storm, u_glow;
out vec4 o;
const float S = 46.0, TOP = 86.0;
float h3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return vn(p) * 0.55 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.7) * 0.15; }
vec2 tileUv(vec2 w) { return clamp((w - u_org) / u_size, vec2(0.0), vec2(1.0)); }
float shoreAt(vec2 w) { return texture(u_shore, tileUv(w)).r * 255.0; }
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
float sunThrough(vec3 p) {
  float T = 1.0;
  for (int k = 1; k <= 3; k++) { vec3 q = p + u_sun * (float(k) * 5.0); T *= exp(-vapour(q) * 5.0); }
  return T;
}
// The light reaching a point from the lamps round it: the light map (4 px cells, its mip levels blurring it wider) at
// the point and on three rings out to 40 px, a fixed pattern (steady from frame to frame). For the water (gw), a ring's
// light is shaded where land stands between it and the point (an island's flank or a beach); for the air (ga), by the
// water over where it shines (a lamp on the deep floor barely lights the mist above).
void gather(vec2 w, out vec3 gw, out vec3 ga) {
  gw = vec3(0.0); ga = vec3(0.0);
  float wsum = 0.0;
  for (int ring = 0; ring < 4; ring++) {
    float fr = float(ring), R = ring == 0 ? 0.0 : 3.0 * pow(2.2, fr), lod = fr * 1.15, wt = ring == 0 ? 1.0 : 0.9 / (1.0 + fr * 0.6);
    int n = ring == 0 ? 1 : 6;
    for (int k = 0; k < 6; k++) {
      if (k >= n) break;
      float a = (float(k) + 0.5 * fr) * 1.0472;
      vec2 q = w + vec2(cos(a), sin(a)) * R;
      vec3 L = textureLod(u_light, clamp((q - u_lorg) / 4.0 / u_lsize, vec2(0.0), vec2(1.0)), lod).rgb;
      float block = 1.0;
      if (ring > 0) for (int j = 1; j <= 3; j++) {
        float lift = shoreAt(mix(w, q, float(j) / 4.0)) - u_tide;
        block *= 1.0 - 0.7 * smoothstep(1.0, 8.0, lift);
      }
      float under = texture(u_depth, tileUv(q)).r;
      gw += L * wt * block; ga += L * wt * exp(-under * 3.0);
      wsum += wt;
    }
  }
  gw /= wsum; ga /= wsum;
  // (Measured against the light over a wide stretch (~256 px): a lamp's halo is what stands out from that, and a light
  // so broad it covers everything only lifts the haze a little.)
  vec3 wide = textureLod(u_light, clamp((w - u_lorg) / 4.0 / u_lsize, vec2(0.0), vec2(1.0)), 6.0).rgb;
  gw = max(gw - 0.875 * wide, 0.0) + 0.125 * wide; ga = max(ga - 0.875 * wide, 0.0) + 0.125 * wide;
}
${VOL_RAIN}
void main() {
  vec2 fc = gl_FragCoord.xy, px = vec2(fc.x, u_res.y - fc.y) * u_block;
  vec2 uv = clamp(px / u_size, vec2(0.0), vec2(1.0)), w = u_org + px;
  float se = texture(u_shore, uv).r * 255.0, depth = texture(u_depth, uv).r;
  // (Where along its step each ray starts: an even, fixed pattern over the pond, not changing frame to frame.)
  vec2 wp = floor(w);
  float jitter = fract(52.9829 * fract(0.06711 * wp.x + 0.00584 * wp.y)) - 0.5;
  float ground = se > u_tide ? S + (se - u_tide) * 0.12 : 0.0;
  vec3 gw = vec3(0.0), ga = vec3(0.0);
  if (u_glow > 0.0) gather(w, gw, ga);
  vec3 col = vec3(0.0), gl = vec3(0.0); float T = 1.0;
  vec3 amb = mix(u_sky * 0.5, u_sky, u_day);
  // Down through the vapour (only the low air holds any), lit by the sun and the lamps beneath.
  float floorZ = max(S, ground), dz = (TOP - floorZ) / 16.0, z = TOP - dz * (0.5 + jitter);
  for (int i = 0; i < 16; i++) {
    if (z < floorZ || T < 0.03) break;
    vec3 p = vec3(w, z);
    float d = vapour(p);
    if (d > 0.002) {
      float lit = sunThrough(p), a = 1.0 - exp(-d * dz);
      vec3 c = (u_sunCol * lit * (0.5 + 0.5 * u_day) + amb * 0.45) * (1.0 - 0.35 * u_storm);
      col += T * a * c; gl += T * a * ga * 2.0; T *= 1.0 - a;
    }
    z -= dz;
  }
  // Under the water: its haze, shafts of sun slanting down from the surface, and the lamps' light the haze scatters.
  if (ground <= 0.5) {
    float dw = S / 12.0, wz = S - dw * (0.5 + jitter);
    for (int i = 0; i < 12; i++) {
      if (wz < 0.0 || T < 0.03) break;
      vec3 p = vec3(w, wz);
      float down = S - wz, hz = u_haze * (0.6 + 0.8 * depth) * (0.7 + 0.6 * vn(vec3(p.xy * 0.03, wz * 0.05 + u_t * 0.05)));
      vec2 at = p.xy - u_sun.xy / max(0.2, u_sun.z) * down;
      float rn = 1.0 - abs(vn(vec3(at * 0.09, u_t * 0.22)) * 2.0 - 1.0);
      float shaft = pow(rn, 9.0) * (0.6 + 0.8 * vn(vec3(at * 0.02, u_t * 0.05)));
      float light = shaft * exp(-down * 0.045) * u_day * (1.0 - 0.6 * u_rain) * (1.0 - 0.5 * u_storm);
      float a = 1.0 - exp(-hz * dw);
      // (The lamps' light, as much as the water here scatters: more in the deep's thicker water, and nearer the floor
      // where they shine. It scatters more than the haze dims, as fine silt does: a glow over the water's own haze.)
      float ag = 1.0 - exp(-(0.008 + 0.014 * depth) * (0.6 + 0.8 * down / S) * dw);
      col += T * (a * u_water * (0.25 + 0.5 * u_day) + light * dw * 0.012 * u_sunCol);
      gl += T * ag * gw * 2.2;
      T *= 1.0 - a;
      wz -= dw;
    }
  }
  // (The glow eased toward a ceiling: a lamp's halo shows clearly, a huge light lifts the water and never whites it out.)
  col += gl / (1.0 + 2.0 * gl);
  vec4 base = vec4(min(col, vec3(0.85)), clamp(1.0 - T, 0.0, 1.0));
  // The rain over all of it.
  vec4 r = rain(w, se <= u_tide);
  o = r + base * (1.0 - r.a);
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
    const tex = (min) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, min], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v); return t; };
    // 0 shore, 1 depth, 2 the light map (mipmapped: its levels are the wider blurs).
    G.tex = [tex(gl.LINEAR), tex(gl.LINEAR), tex(gl.LINEAR_MIPMAP_LINEAR)];
    ['u_shore', 'u_depth', 'u_light'].forEach((n, i) => gl.uniform1i(gl.getUniformLocation(prog, n), i));
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
  const rain = clamp(W.rain || 0, 0, 1), gust = Math.max(0, W.gust || 0), surf = w.tide ? w.tide.surf || 0 : 0;
  // (The humidity: a little always, more at dawn and in the fog, and after rain; dried off by the wind.)
  w.volWet = clamp((w.volWet || 0) + (rain - (w.volWet || 0)) * 0.002, 0, 1);
  return {
    rain, day: 1 - d, surf: clamp(surf + gust * 0.5, 0, 1.5), storm: clamp(rain * 0.7 + gust * 0.5, 0, 1),
    hum: clamp(0.3 + 0.9 * dawn + 0.4 * dusk + 0.6 * w.volWet + 0.4 * rain + (fog === 'thick' ? 1.3 : fog === 'clear' ? -0.25 : 0) - gust * 0.35, 0, 2),
    warm: Math.max(dawn, dusk),
  };
}
// The light map under the tile (and a margin, for the halos), as a small texture of its 4 px cells; overlapping and
// huge lights saturate softly (c / (1 + brightest)), so it stays within 0–1. Returns whether anything glows there.
function volumeLights(G, gl, w, x0, y0, x1, y1, rect) {
  // (The pond builds the map each frame only while it can afford its pools of light; when it can't (or it was built
  // for somewhere else), it's built here, a few times a second, so the glow is never a stale one left from elsewhere.)
  let M = w.lightMap;
  const R = M && M.rect, now = performance.now();
  if (typeof buildLights === 'function' && (!M || !R || now - (M.at || 0) > 250 || R[0] > rect[0] || R[1] > rect[1] || R[2] < rect[2] || R[3] < rect[3])) {
    buildLights(w, rect); M = w.lightMap;
  }
  const cs = LIGHT_CELL, mg = 64;
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.tex[2]);
  if (!M || !M.any) return false;
  const lx0 = Math.max(0, Math.floor((x0 - mg) / cs)), ly0 = Math.max(0, Math.floor((y0 - mg) / cs));
  const lx1 = Math.min(M.lw - 1, Math.ceil((x1 + mg) / cs)), ly1 = Math.min(M.lh - 1, Math.ceil((y1 + mg) / cs));
  const lw = lx1 - lx0 + 1, lh = ly1 - ly0 + 1, D = M.data;
  const L = G.lbuf && G.lbuf.length === lw * lh * 4 ? G.lbuf : (G.lbuf = new Uint8Array(lw * lh * 4));
  let any = false;
  for (let y = 0; y < lh; y++) {
    let s = (lx0 + (ly0 + y) * M.lw) * 3, d = y * lw * 4;
    for (let x = 0; x < lw; x++, s += 3, d += 4) {
      const r = D[s], g = D[s + 1], b = D[s + 2], m = Math.max(r, g, b), k = m > 0.004 ? 255 / (1 + m) : 0;
      L[d] = r * k; L[d + 1] = g * k; L[d + 2] = b * k; L[d + 3] = 255;
      if (k) any = true;
    }
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, lw, lh, 0, gl.RGBA, gl.UNSIGNED_BYTE, L);
  gl.generateMipmap(gl.TEXTURE_2D);
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
  const glow = volumeLights(G, gl, w, x0, y0, x1, y1, rect);
  const V = volumeWeather(w, light), U = G.U, loc = (n) => U[n] ?? (U[n] = gl.getUniformLocation(G.prog, n));
  const sky = state.sky, water = w.waterColor || 0xff7c6a1b, rgb = (c) => [(c & 255) / 255, ((c >> 8) & 255) / 255, ((c >>> 16) & 255) / 255];
  // The sun (or moon): from the upper left, as the pond's shadows fall; lower and warmer at dawn and dusk.
  const elev = 0.55 + 0.35 * (1 - V.warm), sun = [-SHADOW_X, -SHADOW_Y, elev], sl = Math.hypot(...sun);
  const tint = light && light.tint ? light.tint : [1, 1, 1];
  const sunCol = [Math.min(1.2, (1 + 0.25 * V.warm) * tint[0]), Math.min(1.2, (0.95 - 0.1 * V.warm) * tint[1]), Math.min(1.2, (0.85 - 0.3 * V.warm) * tint[2])];
  gl.uniform2f(loc('u_org'), x0, y0); gl.uniform2f(loc('u_size'), W, H); gl.uniform2f(loc('u_res'), cw, ch);
  gl.uniform2f(loc('u_wind'), (w.current ? w.current.x : 0) + (w.weather.gust || 0) * 0.6, (w.current ? w.current.y : 0) + (w.weather.gust || 0) * 0.3);
  if (glow) { gl.uniform2fv(loc('u_lorg'), G.lorg); gl.uniform2fv(loc('u_lsize'), G.lsize); }
  gl.uniform3f(loc('u_sun'), sun[0] / sl, sun[1] / sl, sun[2] / sl); gl.uniform3fv(loc('u_sunCol'), sunCol);
  gl.uniform3fv(loc('u_sky'), rgb(sky)); gl.uniform3fv(loc('u_water'), rgb(water));
  for (const [n, v] of Object.entries({ u_block: B, u_t: state.time ?? w.t, u_tide: w.tide.level * 255, u_day: V.day, u_hum: V.hum, u_surf: V.surf, u_storm: V.storm, u_rain: V.rain,
    u_haze: 0.0035 + 0.004 * V.rain, u_glow: glow ? 1 : 0 })) gl.uniform1f(loc(n), v);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  G.frames = (G.frames || 0) + 1;
  if ((G.frames < 4 || G.frames % 300 === 0) && gl.getError() !== gl.NO_ERROR) { G.failed = true; hideVolumetric(); return false; }
  G.cv.hidden = false; placeVolumetric();
  return true;
}
