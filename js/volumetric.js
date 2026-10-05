'use strict';
// Volumetrics (an option, Settings → Volumetrics): the mist over the pond and the haze in its water as one real volume,
// raymarched on the GPU in the manner of "Volumetric lighting" (Shadertoy tdjBR1): the medium's density is computed
// into a 3D texture, then how much sunlight reaches each of its voxels (a march toward the sun through that density:
// the self-shadowing that gives billows their shape), and then each pixel marches down through it, gathering the
// light scattered toward the eye, integrated per step against the extinction as in SebH's volumetric integration
// (Frostbite, SIGGRAPH 2015). (Written here from those techniques; no code from either.)
// The medium, from the floor up:
//  - in the water, a thin haze, thicker over the deep;
//  - over it, a humid breath lying on all the water (heavier at dawn, after rain and in the fog), and mist and spray
//    billowing up where the waves break, along the beaches and round every island, rising and drifting downwind;
//  - shaped by one domain-warped noise through both, so it's one body, not layers.
// Lit by the sun (or moon) through itself, so the mist shades the water under it; by the sky; and by the pond's
// lamps (the light map, depths.js) glowing up into it. The view leans a little (as if the camera were tipped toward
// the bottom of the screen), so what rises is seen rising. Rain falls over it lightly.
// Drawn at half the pond's resolution, smooth, as a layer over everything (whatever composes the pond).

const VOL = { failed: false, cv: null, gl: null, W: 0, H: 0, B: 2 };
// The volume: z from the floor (ZB) to the top of the mist (ZT), in pond pixels with the water surface at 0.
const VOL_ZB = -32, VOL_ZT = 64, VOL_NZ = 24, VOL_MAXN = 192, VOL_TILT = 0.7;
const VOL_VS = `#version 300 es
in vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const VOL_COMMON = `#version 300 es
precision highp float;
precision highp sampler3D;
const float ZB = ${VOL_ZB}.0, ZT = ${VOL_ZT}.0, SIG = 0.09;
uniform vec2 u_vorg, u_vsize, u_dims; // the volume's world origin and size (px), and its voxels across and down
float h3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 uvw(vec3 p) { return vec3((p.xy - u_vorg) / u_vsize, (p.z - ZB) / (ZT - ZB)); }
// (This layer's voxel centre, for the passes that fill the volume a layer at a time.)
uniform float u_layer, u_nz;
vec3 voxel() { return vec3(u_vorg + gl_FragCoord.xy * (u_vsize / u_dims), ZB + (u_layer + 0.5) / u_nz * (ZT - ZB)); }
`;
// Pass 1, a layer at a time: the density of the medium.
const VOL_DENS = VOL_COMMON + `
uniform sampler2D u_shore, u_depth;
uniform vec2 u_org, u_size, u_wind;
uniform float u_t, u_tide, u_hum, u_surf, u_storm;
out vec4 o;
vec2 tile(vec2 w) { return clamp((w - u_org) / u_size, vec2(0.0), vec2(1.0)); }
float fbm(vec3 p) { return vn(p) * 0.5 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.07 + 3.7) * 0.2; }
// The billows: noise whose coordinates are pushed round by a second noise, rising and drifting with the wind, then
// sharpened, so it comes in rounded clumps with thin gaps between.
float billow(vec3 p) {
  // (Stretched up and down: from above, a column is in a clump or clear, so the clumps read as clumps.)
  vec3 q = vec3((p.xy - u_wind * u_t * 6.0) * 0.035, p.z * 0.018 - u_t * 0.06);
  float warp = fbm(q * 0.7 + vec3(0.0, 0.0, u_t * 0.04));
  float d = fbm(q + 1.8 * vec3(cos(warp * 6.2832), sin(warp * 6.2832), warp));
  d = pow(d, 3.5);
  return 0.7 * smoothstep(0.07, 0.19, d) + 0.8 * smoothstep(0.19, 0.45, d);
}
void main() {
  vec3 p = voxel();
  vec2 uv = tile(p.xy);
  float se = texture(u_shore, uv).r * 255.0, depth = texture(u_depth, uv).r;
  float ground = se > u_tide ? (se - u_tide) * 0.12 : -32.0 * max(depth, 0.15);
  if (p.z < ground) { o = vec4(0.0); return; } // (under the floor, or inside the land)
  float b = billow(p), d;
  if (p.z < 0.0) {
    // The water: a thin haze, the deeper the thicker, barely clumped.
    d = (0.04 + 0.12 * depth) * (0.5 + 0.5 * min(b, 1.0));
  } else {
    float h = p.z - max(ground, 0.0);
    // Leaned downwind as it rises (the source of the mist at this height lies upwind).
    float se2 = texture(u_shore, tile(p.xy - u_wind * h * 1.2)).r * 255.0;
    float brk = se2 > 0.5 ? smoothstep(26.0 + 30.0 * u_surf, 0.0, abs(u_tide - se2)) : 0.0;
    float breath = u_hum * 1.3 * exp(-h / 10.0);
    float spray = brk * (0.5 + 1.8 * u_surf + 0.8 * u_storm) * 2.2 * exp(-h / (12.0 + 14.0 * u_surf));
    d = (breath + spray) * b;
  }
  o = vec4(clamp(d, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;
// Pass 2, a layer at a time: how much sunlight reaches each voxel through the density between it and the sun.
const VOL_LIT = VOL_COMMON + `
uniform sampler3D u_dens;
uniform vec3 u_sun;
out vec4 o;
void main() {
  vec3 p = voxel();
  float tau = 0.0, ds = 5.0;
  for (int k = 1; k <= 12; k++) {
    vec3 q = p + u_sun * (float(k) - 0.5) * ds;
    if (q.z > ZT) break;
    tau += texture(u_dens, uvw(q)).r * SIG * ds;
  }
  o = vec4(exp(-tau), 0.0, 0.0, 1.0);
}`;
// Pass 3: the view. Each pixel's ray comes down from the top of the volume, leaning (above the water) along the
// screen's up, through the medium to the floor, gathering scattered light and losing transmittance as it goes.
const VOL_VIEW = VOL_COMMON + `
uniform sampler3D u_dens, u_lit;
uniform sampler2D u_shore, u_depth, u_light;
uniform vec2 u_org, u_size, u_res, u_up, u_lorg, u_lsize, u_wind;
uniform vec3 u_sunCol, u_sky, u_water;
uniform float u_block, u_t, u_tide, u_day, u_rain, u_glow, u_tilt;
out vec4 o;
vec2 tile(vec2 w) { return clamp((w - u_org) / u_size, vec2(0.0), vec2(1.0)); }
// The lamps' light near a point (the light map, wider and fainter the further above the floor), the broad part of it
// damped, so a huge light lifts the mist rather than whiting it out.
vec3 glowAt(vec3 p, float floorZ) {
  float up = max(p.z - floorZ, 0.0);
  vec2 lu = clamp((p.xy - u_lorg) / 4.0 / u_lsize, vec2(0.0), vec2(1.0));
  vec3 L = textureLod(u_light, lu, 1.0 + up / 10.0).rgb, wide = textureLod(u_light, lu, 6.0).rgb;
  return (max(L - 0.85 * wide, 0.0) + 0.15 * wide) * exp(-up / 28.0);
}
// Rain, lightly: a sparse fall of streaks slanted by the wind, and a few rings where drops land on the water.
vec4 rain(vec2 w, bool overWater) {
  if (u_rain < 0.05) return vec4(0.0);
  vec4 acc = vec4(0.0);
  vec2 slant = normalize(vec2(0.3, 1.0) + u_wind * 1.5);
  float cell = 16.0, len = 6.0;
  vec2 q = w + slant * u_t * 110.0, c = floor(q / cell), f = q - c * cell;
  if (h2(c) < u_rain * u_rain * 0.35) {
    vec2 d = f - vec2(h2(c + 3.1), h2(c + 7.9)) * cell;
    float along = dot(d, slant), across = abs(d.x * slant.y - d.y * slant.x);
    if (along > -len && along < 0.0 && across < 0.6) { float a = 0.13 * (1.0 + along / len * 0.7); acc = vec4(vec3(0.82, 0.88, 0.95) * a, a); }
  }
  if (overWater) {
    float rc = 19.0; vec2 c2 = floor(w / rc), f2 = w - c2 * rc;
    float r = h2(c2 + 91.0), life = fract(u_t * 1.3 + r * 7.0);
    if (r < u_rain * 0.3) {
      float d = length(f2 - (vec2(h2(c2 + 13.0), h2(c2 + 17.0)) * (rc - 6.0) + 3.0)), R = 0.5 + 3.0 * life;
      if (abs(d - R) < 0.5) { float a = 0.18 * (1.0 - life); acc += vec4(vec3(0.85, 0.92, 0.98) * a, a) * (1.0 - acc.a); }
    }
  }
  return acc;
}
void main() {
  vec2 fc = gl_FragCoord.xy, px = vec2(fc.x, u_res.y - fc.y) * u_block, w = u_org + px;
  vec2 uv = tile(w);
  float se = texture(u_shore, uv).r * 255.0, depth = texture(u_depth, uv).r;
  float floorZ = se > u_tide ? (se - u_tide) * 0.12 : -32.0 * max(depth, 0.15);
  // (Where along its first step each ray starts: a fixed pattern on the pond, so nothing crawls frame to frame.)
  vec2 wp = floor(w / u_block);
  float jit = fract(52.9829 * fract(0.06711 * wp.x + 0.00584 * wp.y));
  const int N = 30;
  float dz = (ZT - floorZ) / float(N), seg = dz * sqrt(1.0 + u_tilt * u_tilt);
  vec3 amb = u_sky * (0.14 + 0.4 * u_day), wamb = u_water * (0.2 + 0.35 * u_day);
  float sunI = 0.12 + 0.88 * u_day;
  vec3 scat = vec3(0.0); float T = 1.0;
  for (int i = 0; i < N; i++) {
    float z = ZT - (float(i) + jit) * dz;
    if (z < floorZ || T < 0.02) break;
    vec3 p = vec3(w - u_up * max(z, 0.0) * u_tilt, z); // (the screen's up leans the ray; below the surface it's straight)
    vec3 t3 = uvw(p);
    float sigma = texture(u_dens, t3).r * SIG;
    if (sigma < 1e-5) continue;
    float ds = z > 0.0 ? seg : dz, sun = texture(u_lit, t3).r;
    // What this bit of medium sends toward the eye: the sun through the medium between, the sky (under water, the
    // water's own colour), and the lamps; integrated over the step against its own extinction.
    vec3 lit = u_sunCol * sunI * sun + (z > 0.0 ? amb : wamb) + (u_glow > 0.0 ? glowAt(p, floorZ) * 2.5 : vec3(0.0));
    // (Coloured a little by how dense it is: thin wisps cool, thick cores warm.)
    float dn = sigma / SIG;
    vec3 tone = 0.5 + 0.5 * cos(6.2832 * (0.8 + 0.5 * dn + vec3(0.0, 0.1, 0.2)));
    vec3 albedo = z > 0.0 ? mix(vec3(0.95), tone, 0.3) : mix(u_water, vec3(1.0), 0.35);
    float ext = exp(-sigma * ds);
    scat += T * lit * albedo * (1.0 - ext);
    T *= ext;
  }
  vec4 v = vec4(min(scat, vec3(1.0)), 1.0 - T);
  vec4 r = rain(w, se <= u_tide);
  o = r + v * (1.0 - r.a);
}`;

function volLink(gl, fs) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VOL_VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
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
    G.cv = cv; G.gl = gl; G.U = new Map();
    G.dens = volLink(gl, VOL_DENS); G.lit = volLink(gl, VOL_LIT); G.view = volLink(gl, VOL_VIEW);
    const tex2 = (min) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, min], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v); return t; };
    const tex3 = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, t); for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, p, v); return t; };
    // Units: 0 shore, 1 depth, 2 the light map (mipmapped), 3 density (3D), 4 sunlight (3D).
    G.tex = [tex2(gl.LINEAR), tex2(gl.LINEAR), tex2(gl.LINEAR_MIPMAP_LINEAR), tex3(), tex3()];
    const bind = (prog, names) => { gl.useProgram(prog); for (const [n, u] of Object.entries(names)) gl.uniform1i(gl.getUniformLocation(prog, n), u); };
    bind(G.dens, { u_shore: 0, u_depth: 1 }); bind(G.lit, { u_dens: 3 }); bind(G.view, { u_shore: 0, u_depth: 1, u_light: 2, u_dens: 3, u_lit: 4 });
    G.fbo = gl.createFramebuffer();
    G.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, G.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
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
// The light map under the tile (and a margin), as a small mipmapped texture of its 4 px cells, soft-saturated into
// 0–1. The pond builds the map each frame only while it can afford its light pools; when it can't (or it was built
// for somewhere else) it's built here, a few times a second. Returns whether anything glows there.
function volumeLights(G, gl, w, x0, y0, x1, y1, rect) {
  let M = w.lightMap;
  const R = M && M.rect, now = performance.now();
  if (typeof buildLights === 'function' && (!M || !R || now - (M.at || 0) > 250 || R[0] > rect[0] || R[1] > rect[1] || R[2] < rect[2] || R[3] < rect[3])) {
    buildLights(w, rect); M = w.lightMap;
  }
  const cs = LIGHT_CELL, mg = 96;
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
function volUse(G, gl, prog, vals) {
  let U = G.U.get(prog);
  if (!U) G.U.set(prog, (U = {}));
  gl.useProgram(prog);
  for (const [n, v] of Object.entries(vals)) {
    const l = n in U ? U[n] : (U[n] = gl.getUniformLocation(prog, n));
    if (l === null) continue;
    if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v.length === 2) gl.uniform2fv(l, v);
    else gl.uniform3fv(l, v);
  }
  const a = gl.getAttribLocation(prog, 'a_pos');
  gl.bindBuffer(gl.ARRAY_BUFFER, G.quad); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  return U;
}
// Fill a 3D texture a layer at a time with the program in use.
function volLayers(G, gl, U, tex, nz) {
  for (let k = 0; k < nz; k++) {
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, k);
    gl.uniform1f(U.u_layer, k); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
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
  // The volume over the tile, with room round it for the lean (voxels at least 8 px, at most VOL_MAXN a side).
  const vm = Math.ceil(VOL_ZT * VOL_TILT) + 16, vw = W + 2 * vm, vh = H + 2 * vm;
  const cell = Math.max(8, Math.ceil(Math.max(vw, vh) / VOL_MAXN)), nx = Math.ceil(vw / cell), ny = Math.ceil(vh / cell), nz = VOL_NZ;
  if (G.nx !== nx || G.ny !== ny) {
    for (const k of [3, 4]) {
      gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_3D, G.tex[k]);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, nx, ny, nz, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    }
    G.nx = nx; G.ny = ny;
  }
  const vol = { u_vorg: [x0 - vm, y0 - vm], u_vsize: [nx * cell, ny * cell], u_dims: [nx, ny], u_nz: nz, u_layer: 0 };
  const glow = volumeLights(G, gl, w, x0, y0, x1, y1, rect);
  const V = volumeWeather(w, light), t = state.time ?? w.t, tide = w.tide.level * 255;
  const wind = [(w.current ? w.current.x : 0) + (w.weather.gust || 0) * 0.6, (w.current ? w.current.y : 0) + (w.weather.gust || 0) * 0.3];
  // The sun (or moon): from the upper left, as the pond's shadows fall; lower and warmer at dawn and dusk.
  const elev = 0.55 + 0.35 * (1 - V.warm), sun = [-SHADOW_X, -SHADOW_Y, elev], sl = Math.hypot(...sun);
  const tint = light && light.tint ? light.tint : [1, 1, 1];
  const sunCol = [Math.min(1.2, (1 + 0.25 * V.warm) * tint[0]), Math.min(1.2, (0.95 - 0.1 * V.warm) * tint[1]), Math.min(1.2, (0.85 - 0.3 * V.warm) * tint[2])];
  const rgb = (c) => [(c & 255) / 255, ((c >> 8) & 255) / 255, ((c >>> 16) & 255) / 255];
  // Passes 1 and 2: the density, then the sunlight through it, into the 3D textures.
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo); gl.viewport(0, 0, nx, ny);
  volLayers(G, gl, volUse(G, gl, G.dens, { ...vol, u_org: [x0, y0], u_size: [W, H], u_wind: wind, u_t: t, u_tide: tide, u_hum: V.hum, u_surf: V.surf, u_storm: V.storm }), G.tex[3], nz);
  volLayers(G, gl, volUse(G, gl, G.lit, { ...vol, u_sun: [sun[0] / sl, sun[1] / sl, sun[2] / sl] }), G.tex[4], nz);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // Pass 3: the view.
  const th = view.r * Math.PI / 2;
  gl.viewport(0, 0, cw, ch);
  volUse(G, gl, G.view, {
    ...vol, u_org: [x0, y0], u_size: [W, H], u_res: [cw, ch], u_up: [-Math.sin(th), -Math.cos(th)], u_wind: wind,
    u_lorg: G.lorg || [0, 0], u_lsize: G.lsize || [1, 1], u_sunCol: sunCol, u_sky: rgb(state.sky), u_water: rgb(w.waterColor || 0xff7c6a1b),
    u_block: B, u_t: t, u_tide: tide, u_day: V.day, u_rain: V.rain, u_glow: glow ? 1 : 0, u_tilt: VOL_TILT,
  });
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  G.frames = (G.frames || 0) + 1;
  if ((G.frames < 4 || G.frames % 300 === 0) && gl.getError() !== gl.NO_ERROR) { G.failed = true; hideVolumetric(); return false; }
  G.cv.hidden = false; placeVolumetric();
  return true;
}
