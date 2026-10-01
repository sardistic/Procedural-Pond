'use strict';

// Render the displaced wave surface as a shallow 3D ray intersection. The
// original pond image is the scene below the surface; the wave height and
// Gerstner orbit move the intersection, its normal bends the view, and a
// restrained Fresnel reflection catches sky and light. No drawn wave bands.
let WATER_SCENE = new Uint32Array(0);
const WATER_POINT = new Float32Array(6);
function renderWater3D(out, w, rect, state) {
  const visibility = state.visibility;
  if (visibility < 0.025) return;
  const W = w.W, H = w.H, [x0, y0, x1, y1] = rect;
  if (WATER_SCENE.length < out.length) WATER_SCENE = new Uint32Array(out.length);
  for (let y = y0; y <= y1; y++) WATER_SCENE.set(out.subarray(x0 + y * W, x1 + y * W + 1), x0 + y * W);
  const f = waveField({ t: w.t, swell: state.swell, swellDir: w.shore ? w.shoreN : [0.8, 0.6],
    gust: w.weather.gust, rain: w.weather.rain, surf: w.tide.surf, tide: w.tide.level,
    shore: w.shore, depth: w.depth, riverMask: w.riverMask });
  const sky = state.sky, sr = sky & 255, sg = sky >> 8 & 255, sb = sky >>> 16 & 255;
  const day = 1 - (state.darkness || 0), rain = w.weather.rain || 0;
  const tide = w.tide.level * 255, shore = w.shore, depth = w.depth;
  // A slightly oblique overhead camera makes crest height and orbital motion
  // displace the image. The same ray is used for every world pixel.
  const rayX = 0.8, rayY = 1.1, vx = -0.3, vy = -0.42, vz = 0.86;
  const lx = -0.45, ly = -0.48, lz = 0.75;
  const hx = 0.18, hy = -0.32, hz = 0.93, flatSpec = Math.pow(hz, 24);
  const tint = 0.05 + rain * 0.015;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0, p = x0 + y * W; x <= x1; x++, p++) {
      if (shore && shore[p] > tide + 6) continue;
      waveAt(f, x, y, p, WATER_POINT);
      const h = WATER_POINT[0] * visibility;
      if (shore && shore[p] > tide + h * 2.5) continue;
      const sx = WATER_POINT[1] * visibility, sy = WATER_POINT[2] * visibility;
      const inv = 1 / Math.sqrt(1 + sx * sx + sy * sy);
      const nx = -sx * inv, ny = -sy * inv, nz = inv;
      // Ray/height-field intersection in screen space. Orbital movement is the
      // horizontal displacement of the same 3D surface, not texture motion.
      const ix = x + h * rayX + WATER_POINT[4] * visibility;
      const iy = y + h * rayY + WATER_POINT[5] * visibility;
      const waterDepth = depth ? depth[p] / 255 : 0;
      const bend = (1.2 + waterDepth * 0.8) * visibility;
      const qx = Math.round(ix + sx * bend), qy = Math.round(iy + sy * bend);
      let q = p;
      if (qx >= x0 && qx <= x1 && qy >= y0 && qy <= y1) {
        const candidate = qx + qy * W;
        if (!shore || shore[candidate] <= tide + 5) q = candidate;
      }
      let c = WATER_SCENE[q], cr = c & 255, cg = c >> 8 & 255, cb = c >>> 16 & 255;
      // Lighting follows the surface normal. The range is deliberately narrow:
      // a trough is still water, never a black stripe painted over the pond.
      const light = Math.max(0, nx * lx + ny * ly + nz * lz);
      const shade = Math.max(0.82, Math.min(1.14, 0.99 + (light - 0.75) * 0.55));
      cr *= shade; cg *= shade; cb *= shade;
      // In deep water the floor contributes little light, but the surface
      // still scatters daylight. Keep the swell visible above a dark abyss.
      const scatter = Math.max(0, Math.min(1, (waterDepth - 0.15) / 0.7)) * (0.08 + 0.25 * day) * visibility;
      const faceLight = Math.max(0.6, Math.min(1.1, 0.65 + light * 0.55));
      cr += (sr * 0.62 * faceLight - cr) * scatter;
      cg += (sg * 0.78 * faceLight - cg) * scatter;
      cb += (sb * 0.90 * faceLight - cb) * scatter;
      const facing = Math.max(0, nx * vx + ny * vy + nz * vz);
      const fresnel = tint + 0.975 * Math.pow(1 - facing, 5);
      const spec = Math.max(0, Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), 24) - flatSpec) * (0.43 * day + 0.17);
      const reflect = Math.min(0.24, fresnel * visibility);
      cr += (sr - cr) * reflect; cg += (sg - cg) * reflect; cb += (sb - cb) * reflect;
      const sparkle = Math.min(0.3, spec * visibility);
      cr += ((day > 0.4 ? 236 : 164) - cr) * sparkle;
      cg += ((day > 0.4 ? 241 : 185) - cg) * sparkle;
      cb += ((day > 0.4 ? 245 : 218) - cb) * sparkle;
      const foam = WATER_POINT[3];
      if (foam > 0.08) {
        const fleck = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 27;
        const amount = Math.min(0.8, foam * visibility * (0.34 + fleck / 48));
        cr += (235 - cr) * amount; cg += (241 - cg) * amount; cb += (245 - cb) * amount;
      }
      out[p] = (0xff000000 | (Math.min(255, cb) << 16) | (Math.min(255, cg) << 8) | Math.min(255, cr)) >>> 0;
    }
  }
}

// WebGL draws the same water as an actual displaced triangle surface. The
// software ray renderer above is used on devices without WebGL2.
const WATER_GPU = { failed: false, cv: null, gl: null, W: 0, H: 0, terrain: null };
const WATER_VERTEX = `#version 300 es
precision highp float;
in vec2 a_pos;
uniform vec2 u_size, u_origin, u_dir;
uniform sampler2D u_shore, u_depth, u_river;
uniform float u_t, u_k, u_omega, u_amp, u_chop, u_surf, u_tide, u_visibility;
out vec2 v_uv, v_slope;
out float v_height, v_foam;
void main() {
  v_uv = (a_pos - u_origin) / u_size;
  float se = texture(u_shore, v_uv).r * 255.0;
  float dd = texture(u_depth, v_uv).r * 255.0;
  float wet = u_tide - se;
  float room = se > 0.5 ? max(0.4, wet * 0.24) : 20.0 + dd * 0.45;
  float shallow = min(1.0, room / 19.0);
  float u = dot(a_pos, u_dir), v = dot(a_pos, vec2(-u_dir.y, u_dir.x));
  float packet = 0.72 + 0.17 * sin(v * 0.026 + u_t * 0.11) + 0.11 * sin(u * 0.013 + v * 0.019 - u_t * 0.08);
  float amp = min(u_amp * (1.0 + 0.55 * (1.0 - shallow)) * packet, room * 0.43);
  float phase = u * u_k - u_t * u_omega + 0.3 * sin(v * 0.022 + u_t * 0.05) + 0.16 * sin(u * 0.013 - v * 0.015);
  float cross = (u * 0.78 + v * 0.33) * u_k * 1.8 - u_t * u_omega * 1.35;
  float chopPhase = (u * 0.43 - v * 0.9) * u_k * 3.3 - u_t * u_omega * 2.25;
  float a2 = amp * 0.26, a3 = u_chop * (0.35 + 0.65 * (1.0 - shallow)) * min(amp, 1.5);
  float near = se > 0.5 ? (wet < 0.0 ? max(0.0, 1.0 + wet / (3.0 + u_surf * 12.0)) : max(0.0, 1.0 - wet / (17.0 + u_surf * 27.0))) : 0.0;
  float river = texture(u_river, v_uv).r;
  float shelter = mix(1.0, 0.18, step(0.5, river));
  float h = (amp * sin(phase) + a2 * sin(cross) + a3 * sin(chopPhase) + near * u_surf * 5.0 * max(0.0, sin(phase))) * shelter;
  vec2 crossDir = vec2(u_dir.x * 0.78 - u_dir.y * 0.33, u_dir.y * 0.78 + u_dir.x * 0.33);
  vec2 chopDir = vec2(u_dir.x * 0.43 + u_dir.y * 0.9, u_dir.y * 0.43 - u_dir.x * 0.9);
  v_slope = (amp * u_k * u_dir * cos(phase) + a2 * u_k * 1.8 * crossDir * cos(cross) + a3 * u_k * 3.3 * chopDir * cos(chopPhase)) * shelter;
  float lean = min(0.72, 0.72 / max(0.05, amp * u_k));
  vec2 orbit = (lean * amp * u_dir * cos(phase) + a2 * 0.22 * vec2(-u_dir.y, u_dir.x) * cos(cross)) * shelter;
  v_height = h * u_visibility;
  float steep = amp * u_k * (1.0 + u_chop * 0.6);
  v_foam = min(1.0, max(0.0, (2.0 * amp / max(room, 0.4) - 0.68) * 2.4 + (steep - 0.23) * 1.5 + near * u_surf * 0.25) * max(0.0, sin(phase) * 0.65 + 0.3)) * (1.0 - step(0.5, river));
  vec2 point = a_pos + (orbit + h * vec2(0.8, 1.1)) * u_visibility;
  point -= u_origin;
  gl_Position = vec4(point.x / u_size.x * 2.0 - 1.0, 1.0 - point.y / u_size.y * 2.0, -h * 0.002, 1.0);
}`;
const WATER_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_scene, u_shore, u_depth;
uniform vec3 u_sky;
uniform float u_tide, u_day, u_rain, u_visibility;
in vec2 v_uv, v_slope;
in float v_height, v_foam;
out vec4 color;
void main() {
  float se = texture(u_shore, v_uv).r * 255.0;
  if (se > u_tide + v_height * 2.5) discard;
  vec2 slope = v_slope * u_visibility;
  vec3 n = normalize(vec3(-slope, 1.0));
  float depth = texture(u_depth, v_uv).r;
  vec2 refractUV = clamp(v_uv + slope * (1.2 + depth * 0.8) * u_visibility / vec2(textureSize(u_scene, 0)), vec2(0.0), vec2(1.0));
  vec3 base = texture(u_scene, refractUV).rgb;
  float light = max(0.0, dot(n, normalize(vec3(-0.45, -0.48, 0.75))));
  base *= clamp(0.99 + (light - 0.75) * 0.55, 0.82, 1.14);
  float scatter = smoothstep(0.15, 0.85, depth) * (0.08 + 0.25 * u_day) * u_visibility;
  base = mix(base, u_sky * vec3(0.62, 0.78, 0.90) * clamp(0.65 + light * 0.55, 0.6, 1.1), scatter);
  float facing = max(0.0, dot(n, normalize(vec3(-0.3, -0.42, 0.86))));
  float fresnel = 0.05 + u_rain * 0.015 + 0.95 * pow(1.0 - facing, 5.0);
  base = mix(base, u_sky, min(0.24, fresnel * u_visibility));
  float spec = max(0.0, pow(max(0.0, dot(n, normalize(vec3(0.18, -0.32, 0.93)))), 24.0) - pow(0.93, 24.0)) * (0.43 * u_day + 0.17);
  base = mix(base, mix(vec3(0.64, 0.73, 0.85), vec3(0.93, 0.95, 0.97), step(0.4, u_day)), min(0.3, spec * u_visibility));
  float fleck = fract(sin(dot(floor(v_uv * vec2(textureSize(u_scene, 0))), vec2(12.9898, 78.233))) * 43758.5453);
  base = mix(base, vec3(0.92, 0.945, 0.96), min(0.8, v_foam * u_visibility * (0.34 + fleck * 0.55)));
  color = vec4(base, 1.0);
}`;

function waterMeshAvailable() {
  const G = WATER_GPU;
  if (G.failed) return false;
  if (G.gl) return true;
  try {
    const cv = document.createElement('canvas'); cv.id = 'water3d'; cv.hidden = true; cv.setAttribute('aria-hidden', 'true'); G.cv = cv;
    document.getElementById('pond').after(cv);
    const gl = cv.getContext('webgl2', { alpha: true, antialias: false, depth: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    cv.addEventListener('webglcontextlost', (event) => { event.preventDefault(); G.failed = true; cv.hidden = true; });
    const shader = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const program = gl.createProgram(); gl.attachShader(program, shader(gl.VERTEX_SHADER, WATER_VERTEX)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, WATER_FRAGMENT)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    const textures = [tex(), tex(), tex(), tex()];
    for (let i = 0; i < 4; i++) { gl.uniform1i(gl.getUniformLocation(program, ['u_scene', 'u_shore', 'u_depth', 'u_river'][i]), i); }
    const vertices = gl.createBuffer(), indices = gl.createBuffer(), position = gl.getAttribLocation(program, 'a_pos');
    G.cv = cv; G.gl = gl; G.program = program; G.textures = textures; G.vertices = vertices; G.indices = indices; G.position = position;
    return true;
  } catch (error) {
    G.failed = true; if (G.cv) G.cv.remove();
    return false;
  }
}
function hideWaterMesh() { if (WATER_GPU.cv) WATER_GPU.cv.hidden = true; }
function placeWaterMesh() {
  const G = WATER_GPU, cv = G.cv;
  if (cv && !cv.hidden) {
    const [x, y] = worldToScreen(G.x, G.y);
    cv.style.transform = `translate(${x}px, ${y}px) scale(${view.k}) rotate(${view.r * 90}deg)`;
  }
}
function drawWaterMesh(scene, w, state, rect) {
  if (!waterMeshAvailable()) return false;
  const G = WATER_GPU, gl = G.gl;
  // Large old ponds can be longer than MAX_TEXTURE_SIZE. Keep both the mesh
  // and its source textures near the camera, with room for crest displacement.
  const margin = 48, snap = 64;
  const x0 = Math.max(0, Math.floor((rect[0] - margin) / snap) * snap);
  const y0 = Math.max(0, Math.floor((rect[1] - margin) / snap) * snap);
  const x1 = Math.min(w.W, Math.ceil((rect[2] + margin + 1) / snap) * snap);
  const y1 = Math.min(w.H, Math.ceil((rect[3] + margin + 1) / snap) * snap);
  const W = x1 - x0, H = y1 - y0;
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (!W || !H || W > maxSize || H > maxSize) { hideWaterMesh(); return false; }
  if (G.W !== W || G.H !== H || G.x !== x0 || G.y !== y0) {
    G.W = W; G.H = H; G.x = x0; G.y = y0; G.cv.width = W; G.cv.height = H;
    G.cv.style.width = `${W}px`; G.cv.style.height = `${H}px`;
    const step = Math.max(4, Math.ceil(Math.max(W, H) / 180)), cols = Math.ceil(W / step), rows = Math.ceil(H / step);
    const verts = new Float32Array((cols + 1) * (rows + 1) * 2), faces = new Uint16Array(cols * rows * 6);
    for (let y = 0, k = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) { verts[k++] = x0 + Math.min(W - 1, x * step); verts[k++] = y0 + Math.min(H - 1, y * step); }
    for (let y = 0, k = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const a = x + y * (cols + 1), b = a + cols + 1; faces[k++] = a; faces[k++] = b; faces[k++] = a + 1; faces[k++] = a + 1; faces[k++] = b; faces[k++] = b + 1; }
    gl.bindBuffer(gl.ARRAY_BUFFER, G.vertices); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, G.indices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, faces, gl.STATIC_DRAW);
    G.count = faces.length; G.terrain = null;
  }
  gl.viewport(0, 0, W, H); gl.useProgram(G.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, G.vertices); gl.enableVertexAttribArray(G.position); gl.vertexAttribPointer(G.position, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, G.indices);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.textures[0]);
  // Typed rows begin at the top of the tile; texture v=0 therefore reads
  // that top row, matching the world coordinates in the shader.
  const source = scene.getContext('2d').getImageData(x0, y0, W, H);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data);
  if (G.terrain !== w.shore || G.depth !== w.depth || G.river !== w.riverMask || performance.now() - (G.terrainAt || 0) > 2000) {
    const flat = new Uint8Array(W * H);
    for (let i = 1; i <= 2; i++) {
      const data = (i === 1 ? w.shore : w.depth) || null;
      if (data) for (let y = 0; y < H; y++) flat.set(data.subarray(x0 + (y0 + y) * w.W, x0 + (y0 + y) * w.W + W), y * W);
      else flat.fill(0);
      gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, G.textures[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, flat);
    }
    flat.fill(0);
    const RM = w.riverMask;
    if (RM && RM.data) for (let y = 0; y < RM.h; y++) for (let x = 0; x < RM.w; x++) {
      const wx = RM.x0 + x, wy = RM.y0 + y;
      if (wx >= x0 && wy >= y0 && wx < x1 && wy < y1 && RM.data[x + y * RM.w] === 1) flat[wx - x0 + (wy - y0) * W] = 255;
    }
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.textures[3]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, flat);
    G.terrain = w.shore; G.depth = w.depth; G.river = w.riverMask; G.terrainAt = performance.now();
  }
  const F = waveField({ t: w.t, swell: state.swell, swellDir: w.shore ? w.shoreN : [0.8, 0.6], gust: w.weather.gust,
    rain: w.weather.rain, surf: w.tide.surf, tide: w.tide.level, shore: w.shore, depth: w.depth, riverMask: w.riverMask });
  const set1 = (name, value) => gl.uniform1f(gl.getUniformLocation(G.program, name), value);
  const set2 = (name, x, y) => gl.uniform2f(gl.getUniformLocation(G.program, name), x, y);
  set2('u_size', W, H); set2('u_origin', x0, y0); set2('u_dir', F.x, F.y);
  for (const [name, value] of Object.entries({ u_t: F.t, u_k: F.k, u_omega: F.omega, u_amp: F.amp,
    u_chop: F.chop, u_surf: F.surf, u_tide: F.tide, u_visibility: state.visibility,
    u_day: 1 - (state.darkness || 0), u_rain: w.weather.rain || 0 })) set1(name, value);
  const sky = state.sky; gl.uniform3f(gl.getUniformLocation(G.program, 'u_sky'), (sky & 255) / 255, (sky >> 8 & 255) / 255, (sky >>> 16 & 255) / 255);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  gl.drawElements(gl.TRIANGLES, G.count, gl.UNSIGNED_SHORT, 0);
  if (gl.getError() !== gl.NO_ERROR) { G.failed = true; hideWaterMesh(); return false; }
  G.cv.hidden = false; placeWaterMesh();
  return true;
}
