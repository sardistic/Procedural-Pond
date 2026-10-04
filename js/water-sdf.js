'use strict';
// The Seascape water (the Waves option's third look): the sea surface raymarched as a height field on the GPU,
// lit and refracting the pond beneath it, then pixelated so it sits in the pixel art. The sea is worked out in
// blocks of pond pixels (u_block) and its light stepped to a few levels with an ordered dither, while the pond
// beneath stays at its own resolution, shifted block by block where the surface bends it.
//
// The sea functions (hash, noise, sea_octave, map, map_detailed, the height-map tracing, normal, diffuse and
// specular) are adapted from "Seascape" by Alexander Alekseev aka TDM, 2014 (https://www.shadertoy.com/view/Ms2SD1),
// licensed under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported
// (https://creativecommons.org/licenses/by-nc-sa/3.0/). This file, as an adaptation of it, is offered under that
// same licence. Changes: a camera looking down on the pond instead of along the sea; the pond's sky, water colour,
// light, swell, wind and shore drive it; it refracts the pond's own picture instead of a sea colour; foam at the
// waterline, the abyss kept black; fewer steps; the sea's height, chop and run worked out from the pond (below);
// and the pixelation pass.
//
// The sea state. Pondwide: wind, rain, the tide's surf and flow, and the moon (spring tides at new and full) set the
// swell's height and chop, and the speed of a sea clock that runs on at that pace (so a change of pace never jumps
// the waves). Place by place, from a field kept at 4-pixel cells: deep water rolls higher and longer, shallows
// shorten and steepen it toward the beach, and the crests lag over them (they bend in toward the shore, as real
// waves slow in the shallows); the lee of an island lies calmer while the water round it chops where the waves meet
// it; and animals near the surface stir it, leaving wakes that settle behind them.

const SDF_GPU = { failed: false, cv: null, gl: null, W: 0, H: 0, B: 2, clock: 0, lastT: null }; // (B: the sea's block, in pond pixels)
const SEA_CELL = 4; // (the sea-state field's cell, in pond pixels)
const SDF_VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const SDF_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_scene, u_shore, u_depth, u_state;
uniform vec2 u_size, u_origin, u_res, u_dir, u_world;
uniform vec3 u_sky, u_water;
uniform float u_block, u_t, u_height, u_choppy, u_tide, u_vis, u_day, u_rain, u_surf, u_scale;
out vec4 color;
// (This block's own sea: its swell height, chop and how far its crests lag; set in main before tracing.)
float g_amp, g_chop, g_lag;

const int NUM_STEPS = 12;
const int ITER_GEOMETRY = 3;
const int ITER_FRAGMENT = 3;
const float EPSILON = 1e-3;
const float SEA_FREQ = 0.16;
const mat2 octave_m = mat2(1.6, 1.2, -1.2, 1.6);

// ---- from Seascape (adapted) ----
float hash(vec2 p) { float h = dot(p, vec2(127.1, 311.7)); return fract(sin(h) * 43758.5453123); }
float noise(in vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return -1.0 + 2.0 * mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float diffuse(vec3 n, vec3 l, float p) { return pow(dot(n, l) * 0.4 + 0.6, p); }
float specular(vec3 n, vec3 l, vec3 e, float s) { float nrm = (s + 8.0) / (3.141592 * 8.0); return pow(max(dot(reflect(e, n), l), 0.0), s) * nrm; }
float sea_octave(vec2 uv, float choppy) {
  uv += noise(uv);
  vec2 wv = 1.0 - abs(sin(uv)), swv = abs(cos(uv));
  wv = mix(wv, swv, wv);
  return pow(1.0 - pow(wv.x * wv.y, 0.65), choppy);
}
float seaHeight(vec2 xz, int iters) {
  float freq = SEA_FREQ, amp = g_amp, choppy = g_chop, d, h = 0.0, T = 1.0 + u_t - g_lag;
  vec2 uv = xz; uv.x *= 0.75;
  for (int i = 0; i < 5; i++) {
    if (i >= iters) break;
    d = sea_octave((uv + T) * freq, choppy);
    d += sea_octave((uv - T) * freq, choppy);
    h += d * amp;
    uv *= octave_m; freq *= 1.9; amp *= 0.22;
    choppy = mix(choppy, 1.0, 0.2);
  }
  return h;
}
float map(vec3 p) { return p.y - seaHeight(p.xz, ITER_GEOMETRY); }
float map_detailed(vec3 p) { return p.y - seaHeight(p.xz, ITER_FRAGMENT); }
vec3 getNormal(vec3 p, float eps) {
  vec3 n;
  n.y = map_detailed(p);
  n.x = map_detailed(vec3(p.x + eps, p.y, p.z)) - n.y;
  n.z = map_detailed(vec3(p.x, p.y, p.z + eps)) - n.y;
  n.y = eps;
  return normalize(n);
}
float heightMapTracing(vec3 ori, vec3 dir, out vec3 p) {
  float tm = 0.0, tx = 40.0, hx = map(ori + dir * tx);
  if (hx > 0.0) { p = ori + dir * tx; return tx; }
  float hm = map(ori);
  for (int i = 0; i < NUM_STEPS; i++) {
    float tmid = mix(tm, tx, hm / (hm - hx));
    p = ori + dir * tmid;
    float hmid = map(p);
    if (hmid < 0.0) { tx = tmid; hx = hmid; } else { tm = tmid; hm = hmid; }
    if (abs(hmid) < EPSILON) break;
  }
  return mix(tm, tx, hm / (hm - hx));
}
// ---- the pond's own ----
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
void main() {
  // This pixel as a point in the pond (rows run top to bottom, as the pond's do), and the block of the sea it's in.
  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 cell = floor((u_origin + px) / u_block), sp = (cell + 0.5) * u_block - u_origin;
  vec2 uv = clamp(px / u_size, vec2(0.0), vec2(1.0)), suv = clamp(sp / u_size, vec2(0.0), vec2(1.0));
  float se = texture(u_shore, uv).r * 255.0;
  vec3 under = texture(u_scene, uv).rgb;
  // (Dry ground shows through: the beach and the islands are the pond's own.)
  if (se > u_tide + 1.5) discard;
  float sse = texture(u_shore, suv).r * 255.0;
  // This block's sea: deeper rolls higher, the shallows by the beach steepen and slow it, an island's lee is calmer
  // and the water round it chops, and animals near the surface stir it.
  float depth = texture(u_depth, suv).r;
  vec2 st = texture(u_state, sp / u_world).rg;
  float wake = st.r, isle = st.g, deepK = smoothstep(0.02, 0.6, depth);
  float shoal = sse > 0.5 ? clamp(1.0 - (u_tide - sse) / 40.0, 0.0, 1.0) : 0.0;
  g_amp = u_height * mix(0.6, 1.3, deepK) * (1.0 - 0.6 * isle) * (1.0 + 0.35 * shoal) + wake * 0.6;
  g_chop = u_choppy * (1.0 + 0.7 * isle + 0.6 * shoal + 0.3 * (1.0 - deepK)) + wake * 3.0;
  g_lag = (1.0 - deepK) * 5.0 + shoal * 6.0 + isle * 4.0;
  // The sea's frame: its waves turned to run in toward the shore, a pond pixel some fraction of a sea unit.
  vec2 w = (u_origin + sp) * u_scale, d = normalize(u_dir);
  vec2 xz = vec2(dot(w, vec2(d.y, -d.x)), dot(w, d));
  // Looking down, a little tilted (as the pond is drawn: tall things lean down and right), so crests hide the
  // troughs behind them.
  vec3 dir = normalize(vec3(-0.22, -1.0, -0.3));
  vec3 ori = vec3(xz.x, 0.0, xz.y) - dir * (9.0 / -dir.y);
  vec3 p;
  heightMapTracing(ori, dir, p);
  vec3 dist = p - ori;
  vec3 n = getNormal(p, 0.6); // (a broad normal: the big swells' faces, not every ripple)
  n = normalize(vec3(n.x * 0.8, n.y, n.z * 0.8)); // (seen from above, the faces read a little gentler than along the sea)
  // Light from the upper left, like the rest of the pond.
  vec3 light = normalize(vec3(-0.45, 0.75, -0.48));
  float abyss = 1.0 - smoothstep(0.82, 0.97, depth);
  // The pixelation: the sea's light in a few steps, with an ordered dither across its blocks. (Shading rounds to the
  // nearest step; highlights round down, so a faint one shows as nothing rather than as scattered bright blocks.)
  float b = BAYER[int(mod(cell.x, 4.0)) + int(mod(cell.y, 4.0)) * 4] / 16.0 - 0.5;
  #define STEP(v, n) (floor((v) * (n) + 0.5 + b * 0.85) / (n))
  #define STEPA(v, n) (floor((v) * (n) + 0.2 + b * 0.4) / (n))
  // Refracted: the pond beneath at its own resolution, shifted block by block by the surface's slope, lit by its
  // facing (shade on the faces turned away, light on those turned toward it).
  vec2 bend = floor(vec2(dot(n.xz, vec2(d.y, d.x)), dot(n.xz, vec2(-d.x, d.y))) * (2.0 + depth * 1.5) * u_vis + 0.5);
  vec3 refracted = texture(u_scene, clamp(uv + bend / u_size, vec2(0.0), vec2(1.0))).rgb;
  float lit = 1.0 + STEP(clamp((diffuse(n, light, 6.0) - 0.62) * 0.9, -0.2, 0.2), 10.0) * abyss;
  // Reflected: the pond's sky on the faces that tilt toward the eye's grazing angle.
  float fresnel = clamp(1.0 - dot(n, -dir), 0.0, 1.0);
  fresnel = STEPA(min(fresnel * fresnel * fresnel, 0.5) * (0.28 + u_rain * 0.15) * abyss, 8.0);
  vec3 c = mix(refracted * lit, u_sky, max(0.0, fresnel));
  // The crests catch the water's own colour, and the sun glints off the steepest of them.
  c += u_water * STEPA(max(0.0, p.y - g_amp * 1.15) * 0.22 * abyss, 6.0);
  float glint = specular(n, light, dir, 40.0) * (0.03 + 0.16 * u_day) * (1.0 - u_rain * 0.5) * abyss;
  c += vec3(1.0, 0.98, 0.92) * STEPA(min(0.3, glint), 5.0);
  // Foam where the waves meet the shore, on their crests.
  float wet = u_tide - sse;
  float edge = sse > 0.5 ? max(0.0, 1.0 - wet / (6.0 + u_surf * 18.0)) : 0.0;
  float foam = STEPA(smoothstep(0.35, 0.9, edge * (0.6 + p.y / max(0.2, g_amp) * 0.35 + u_surf * 0.4)) + wake * 0.8 * smoothstep(0.35, 0.9, p.y / max(0.2, g_amp * 2.0)), 3.0);
  c = mix(c, vec3(0.9, 0.96, 0.98), clamp(foam, 0.0, 1.0) * 0.85);
  // Zoomed far in, the surface fades and the pond shows plain.
  color = vec4(mix(under, c, u_vis), 1.0);
}`;

function seascapeAvailable() {
  const G = SDF_GPU;
  if (G.failed) return false;
  if (G.gl) return true;
  try {
    const cv = document.createElement('canvas'); cv.id = 'water-sdf'; cv.hidden = true; cv.setAttribute('aria-hidden', 'true'); G.cv = cv;
    document.getElementById('pond').after(cv);
    const gl = cv.getContext('webgl2', { alpha: true, antialias: false, depth: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    cv.addEventListener('webglcontextlost', (event) => { event.preventDefault(); G.failed = true; cv.hidden = true; });
    const shader = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const program = gl.createProgram(); gl.attachShader(program, shader(gl.VERTEX_SHADER, SDF_VERTEX)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, SDF_FRAGMENT)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const tex = (filter) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    G.textures = [tex(gl.NEAREST), tex(gl.NEAREST), tex(gl.LINEAR), tex(gl.LINEAR)];
    ['u_scene', 'u_shore', 'u_depth', 'u_state'].forEach((name, i) => gl.uniform1i(gl.getUniformLocation(program, name), i));
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    G.cv = cv; G.gl = gl; G.program = program; G.quad = quad; G.position = gl.getAttribLocation(program, 'a_pos');
    return true;
  } catch (error) {
    console.warn('Seascape water unavailable:', error.message);
    G.failed = true; if (G.cv) G.cv.remove();
    return false;
  }
}
// The sea state, place by place, at SEA_CELL cells: R the stir of animals near the surface (it fades each frame, so a
// swimmer leaves a wake that settles), G how close an island is (1 at its edge, gone by 48 px). The island part is
// worked out over the whole pond when the islands change; the stir only over the tile being drawn, which is all
// that goes up to the GPU each frame.
function seaState(w, G, x0, y0, W, H) {
  const cw = Math.ceil(w.W / SEA_CELL), ch = Math.ceil(w.H / SEA_CELL), n = cw * ch;
  let S = G.state;
  if (!S || S.cw !== cw || S.ch !== ch) S = G.state = { cw, ch, data: new Uint8Array(n * 2), wake: new Float32Array(n), isles: null };
  // Islands: a distance from every cell to the nearest island cell (two-pass chamfer), when the islands change.
  const ground = w.islandGround || null;
  if (S.isles !== ground) {
    S.isles = ground;
    const D = new Float32Array(n).fill(99), CAP = 12;
    if (ground) for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const px = Math.min(w.W - 1, x * SEA_CELL + 2), py = Math.min(w.H - 1, y * SEA_CELL + 2);
      if (ground[px + py * w.W]) D[x + y * cw] = 0;
    }
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = x + y * cw; let v = D[i]; if (x) v = Math.min(v, D[i - 1] + 1); if (y) v = Math.min(v, D[i - cw] + 1); if (x && y) v = Math.min(v, D[i - cw - 1] + 1.41); if (y && x < cw - 1) v = Math.min(v, D[i - cw + 1] + 1.41); D[i] = v; }
    for (let y = ch - 1; y >= 0; y--) for (let x = cw - 1; x >= 0; x--) { const i = x + y * cw; let v = D[i]; if (x < cw - 1) v = Math.min(v, D[i + 1] + 1); if (y < ch - 1) v = Math.min(v, D[i + cw] + 1); if (x < cw - 1 && y < ch - 1) v = Math.min(v, D[i + cw + 1] + 1.41); if (x && y < ch - 1) v = Math.min(v, D[i + cw - 1] + 1.41); D[i] = v; }
    for (let i = 0; i < n; i++) S.data[i * 2 + 1] = D[i] >= CAP ? 0 : Math.round(255 * Math.pow(1 - D[i] / CAP, 1.5));
  }
  // Animals: each stirs a disc by its size and speed, more the nearer the surface it swims; the old stir fades.
  const K = S.wake, cx0 = Math.floor(x0 / SEA_CELL), cy0 = Math.floor(y0 / SEA_CELL), tw = Math.ceil(W / SEA_CELL), th = Math.ceil(H / SEA_CELL);
  const now = performance.now(), fade = Math.exp(-clamp((now - (S.at || now)) / 1000, 0, 0.5) / 1.4); // (a wake settles over a second or two)
  S.at = now;
  for (let y = cy0; y < Math.min(ch, cy0 + th); y++) for (let i = y * cw + cx0, e = y * cw + Math.min(cw, cx0 + tw); i < e; i++) K[i] *= fade;
  for (const c of w.creatures) {
    if (c.dead || c.x == null || c.x < x0 - 16 || c.y < y0 - 16 || c.x > x0 + W + 16 || c.y > y0 + H + 16) continue;
    const len = Array.isArray(c.links) ? c.links.reduce((a, b) => a + b, 0) : 6, sp = c.maxSpeed ? clamp((c.speed || 0) / c.maxSpeed, 0, 1.5) : 0.3;
    const near = clamp(((c.z ?? 20) + 4) / 48, 0.15, 1), k = (0.15 + 0.85 * sp) * near * clamp(len / 14, 0.3, 3);
    if (k < 0.03) continue;
    const R = 0.8 + len / 10, cx = c.x / SEA_CELL, cy = c.y / SEA_CELL;
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(ch - 1, Math.ceil(cy + R)); y++) for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(cw - 1, Math.ceil(cx + R)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
      if (d < 1) { const i = x + y * cw; K[i] = Math.min(1, K[i] + k * (1 - d) * 0.12); }
    }
  }
  // The tile's part, for the GPU.
  if (!S.tile || S.tw !== tw || S.th !== th) { S.tile = new Uint8Array(tw * th * 2); S.tw = tw; S.th = th; }
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const gx = cx0 + x, gy = cy0 + y, o = (x + y * tw) * 2;
    if (gx >= cw || gy >= ch) { S.tile[o] = S.tile[o + 1] = 0; continue; }
    const i = gx + gy * cw;
    S.tile[o] = Math.round(K[i] * 255); S.tile[o + 1] = S.data[i * 2 + 1];
  }
  return S;
}
function hideSeascape() { if (SDF_GPU.cv) SDF_GPU.cv.hidden = true; }
function placeSeascape() {
  const G = SDF_GPU, cv = G.cv;
  if (cv && !cv.hidden) {
    const [x, y] = worldToScreen(G.x, G.y);
    cv.style.transform = `translate(${x}px, ${y}px) scale(${view.k}) rotate(${view.r * 90}deg)`;
  }
}
// Draws the surface over the visible part of the pond (a tile around it, snapped so it doesn't move every frame).
function drawSeascape(w, state, rect, img) {
  if (!seascapeAvailable() || !img || img.width !== w.W) return false;
  const G = SDF_GPU, gl = G.gl, B = G.B;
  const margin = 16, snap = 64;
  const x0 = Math.max(0, Math.floor((rect[0] - margin) / snap) * snap), y0 = Math.max(0, Math.floor((rect[1] - margin) / snap) * snap);
  const x1 = Math.min(w.W, Math.ceil((rect[2] + margin + 1) / snap) * snap), y1 = Math.min(w.H, Math.ceil((rect[3] + margin + 1) / snap) * snap);
  const W = x1 - x0, H = y1 - y0, maxSize = G.maxSize || (G.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE));
  if (!W || !H || W > maxSize || H > maxSize) { hideSeascape(); return false; }
  const cw = W, ch = H;
  if (G.W !== W || G.H !== H || G.x !== x0 || G.y !== y0) {
    G.W = W; G.H = H; G.x = x0; G.y = y0; G.cv.width = cw; G.cv.height = ch; G.frames = 0; G.terrain = null;
    G.cv.style.width = `${cw}px`; G.cv.style.height = `${ch}px`;
  }
  gl.viewport(0, 0, cw, ch); gl.useProgram(G.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, G.quad); gl.enableVertexAttribArray(G.position); gl.vertexAttribPointer(G.position, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  // The pond's picture for this tile, straight from its image buffer.
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.textures[0]);
  const bytes = G.bytes && G.bytes.buffer === img.data.buffer ? G.bytes : (G.bytes = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength));
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w.W); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  // Shore and depth, when they change (or every couple of seconds, as the beach erodes).
  if (G.terrain !== w.shore || G.depth !== w.depth || performance.now() - (G.terrainAt || 0) > 2000) {
    const flat = new Uint8Array(W * H);
    for (let i = 1; i <= 2; i++) {
      const data = (i === 1 ? w.shore : w.depth) || null;
      if (data) for (let y = 0; y < H; y++) flat.set(data.subarray(x0 + (y0 + y) * w.W, x0 + (y0 + y) * w.W + W), y * W);
      else flat.fill(0);
      gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, G.textures[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, flat);
    }
    G.terrain = w.shore; G.depth = w.depth; G.terrainAt = performance.now();
  }
  // The sea state field (wakes and islands) over this tile, at 4-pixel cells.
  const S = seaState(w, G, x0, y0, W, H);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.textures[3]);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, S.tw, S.th, 0, gl.RG, gl.UNSIGNED_BYTE, S.tile);
  // The pondwide sea: its pace from the wind, rain, the tide's flow and surf and the moon; the clock runs on at it.
  const sea = seaOf(w), dir = w.shore ? w.shoreN : [0.8, 0.6], tide = w.tide || {}, spring = w.moon ? w.moon.spring : 0.5;
  const now = state.time ?? waveTime(w), dt = G.lastT == null ? 0 : clamp(now - G.lastT, 0, 0.5);
  G.lastT = now;
  const pace = 0.55 + 0.7 * sea.gust + 0.25 * (sea.rain || 0) + 0.5 * Math.abs(tide.flow || 0) + 0.25 * (sea.surf || 0) + 0.2 * spring;
  G.clock += dt * pace; G.pace = pace;
  const U = G.uniforms || (G.uniforms = {}), loc = (name) => U[name] ?? (U[name] = gl.getUniformLocation(G.program, name));
  gl.uniform2f(loc('u_size'), W, H); gl.uniform2f(loc('u_origin'), x0, y0); gl.uniform2f(loc('u_res'), cw, ch); gl.uniform2f(loc('u_dir'), dir[0], dir[1]);
  gl.uniform2f(loc('u_world'), S.tw * SEA_CELL, S.th * SEA_CELL);
  // Swell lifts the waves (higher on spring tides), wind and the tide's run chop them; calm water lies nearly flat.
  G.height = (0.12 + 0.75 * clamp(state.swell, 0, 1.1)) * (0.85 + 0.3 * spring);
  G.chop = 1 + sea.gust * 2.5 + (sea.surf || 0) * 0.8 + Math.abs(tide.flow || 0) * 0.6 + (sea.rain || 0) * 0.4;
  for (const [name, value] of Object.entries({ u_block: B, u_t: G.clock, u_height: G.height,
    u_choppy: G.chop, u_tide: w.tide.level * 255, u_vis: state.visibility, u_day: 1 - (state.darkness || 0),
    u_rain: sea.rain || 0, u_surf: sea.surf || 0, u_scale: 0.2 })) gl.uniform1f(loc(name), value);
  const sky = state.sky; gl.uniform3f(loc('u_sky'), (sky & 255) / 255, (sky >> 8 & 255) / 255, (sky >>> 16 & 255) / 255);
  const water = w.waterColor || 0xff7c6a1b;
  gl.uniform3f(loc('u_water'), (water & 255) / 255, (water >> 8 & 255) / 255, (water >>> 16 & 255) / 255);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  G.frames = (G.frames || 0) + 1;
  if ((G.frames < 4 || G.frames % 120 === 0) && gl.getError() !== gl.NO_ERROR) { G.failed = true; hideSeascape(); return false; }
  G.cv.hidden = false; placeSeascape();
  return true;
}
