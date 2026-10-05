'use strict';
// The pond's per-frame compose on the GPU (the Renderer: GPU setting): the same work as Raster.compose (raster.js),
// done by a WebGL2 shader over the visible part of the pond. The CPU still draws everything into the raster's
// buffers (colour, height, id, shadow); these and the floor go up as textures, and the shader resolves each pixel:
// outlines, shadows, caustics, the dry and damp beach, refraction, the swell and its marks, chop, spindrift and
// whitecaps, the sky in calm water, foam and surf at the shore, fog, the river's channel, the deep's dark and murk,
// trenches, harbors, the bright coast, the islands' drain, the light's tint and the pools of light. It's drawn onto a
// canvas laid over the pond's own (as the 3D water is). It steps aside (the CPU composes) for the 3D and Seascape
// water, the bones view, the close-up layer, and whole-pond renders, all of which read the CPU's picture.
// Kept as close to Raster.compose as it can be, in integer steps where that does them so (see .agent/runtime/
// gpu_compose_probe.py for the comparison).

const CGL = { failed: false, cv: null, gl: null, prog: null, tex: {}, U: {}, x: 0, y: 0, W: 0, H: 0, terrainKey: '', points: null };
const CGL_VS = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const CGL_FS = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
uniform sampler2D t_col, t_z, t_zb, t_sh, t_bg, t_ter, t_riv, t_cc, t_tab, t_light, t_outline, t_flags;
uniform usampler2D t_id, t_isle;
uniform ivec2 u_org, u_size, u_world, u_lsize, u_torg, u_tsize;
uniform int u_flags; // 1 caustics, 2 shadows, 4 outlines, 8 anyThick, 16 fog, 32 clouds, 64 lights, 128 tint, 256 river, 512 depth, 1024 trench, 2048 isles, 4096 void, 8192 isleEdge
uniform float u_t, u_causticT, u_tideL, u_surf, u_wave, u_surfaceVis, u_swell, u_chop, u_spin, u_deepK, u_lvis, u_riverDeep, u_calm, u_fogAmt, u_fogK;
uniform ivec2 u_o1, u_o2, u_vo; uniform int u_starT, u_hT;
uniform vec3 u_lc, u_fog, u_sky, u_dc0, u_dc1, u_tg, u_river; uniform ivec3 u_tint;
uniform vec2 u_sw, u_w1, u_w2, u_w3, u_gk, u_hk, u_wd; uniform float u_w1t, u_w2t, u_w3t, u_gt, u_ht, u_cdx, u_cdy, u_mdx, u_wdu, u_wdv;
uniform vec4 u_harb[16]; uniform int u_nharb;
uniform int u_coastAxis, u_coastShift, u_coastN; uniform float u_coastEx, u_coastEdge; uniform vec2 u_coast[8];
uniform int u_drainN;
out vec4 o;
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
const float VOIDT[8] = float[8](0.0, 0.05, 0.08, 0.12, 0.17, 0.22, 0.28, 0.35);
// ---- reading the buffers (world pixels; the tile starts at u_org) ----
ivec2 tl(int x, int y) { return ivec2(clamp(x - u_org.x, 0, u_size.x - 1), clamp(y - u_org.y, 0, u_size.y - 1)); }
ivec2 tt(int x, int y) { return ivec2(clamp(x - u_torg.x, 0, u_tsize.x - 1), clamp(y - u_torg.y, 0, u_tsize.y - 1)); } // (the terrain's own, larger tile)
ivec3 C(vec4 v) { return ivec3(floor(v.rgb * 255.0 + 0.5)); }
ivec3 colAt(int x, int y) { return C(texelFetch(t_col, tl(x, y), 0)); }
ivec3 bgAt(int x, int y) { return C(texelFetch(t_bg, tl(x, y), 0)); }
float zAt(int x, int y) { return texelFetch(t_z, tl(x, y), 0).r; }
float zbAt(int x, int y) { return texelFetch(t_zb, tl(x, y), 0).r; }
int idAt(int x, int y) { return int(texelFetch(t_id, tl(x, y), 0).r); }
float shAt(int x, int y) { return texelFetch(t_sh, tl(x, y), 0).r * 255.0; }
vec4 ter(int x, int y) { return floor(texelFetch(t_ter, tt(x, y), 0) * 255.0 + 0.5); } // shore, depth, trench, islandEdge
vec4 riv(int x, int y) { return floor(texelFetch(t_riv, tt(x, y), 0) * 255.0 + 0.5); } // inland, deep
float caus(int i, int j) { return texelFetch(t_cc, ivec2(i & 127, j & 127), 0).r; }
float cloud(int i, int j) { return texelFetch(t_cc, ivec2(i & 127, j & 127), 0).g; }
float WT(int i) { return texelFetch(t_tab, ivec2(i & 1023, 0), 0).r; }
float wobX(int y) { return texelFetch(t_tab, ivec2(clamp(y - u_org.y, 0, u_size.y - 1), 2), 0).r; }
float wobY(int x) { return texelFetch(t_tab, ivec2(clamp(x - u_org.x, 0, u_size.x - 1), 3), 0).r; }
float drain(int k) { return texelFetch(t_tab, ivec2(k, 1), 0).r; }
ivec4 flags(int id) { return ivec4(floor(texelFetch(t_flags, ivec2(id & 255, id >> 8), 0) * 255.0 + 0.5)); } // emissive, fade, thick, void
ivec3 outl(int id) { return C(texelFetch(t_outline, ivec2(id & 255, id >> 8), 0)); }
float bay(int x, int y) { return BAYER[(x & 3) | ((y & 3) << 2)] / 16.0 - 0.5; }
// ---- integer colour steps, as the CPU does them ----
int sr8(int v) { return v >= 0 ? v >> 8 : -((-v + 255) >> 8); } // (v >> 8, rounding down, for negatives too)
ivec3 toward(ivec3 c, ivec3 to, int a) { return ivec3(c.r + sr8((to.r - c.r) * a), c.g + sr8((to.g - c.g) * a), c.b + sr8((to.b - c.b) * a)); }
ivec3 towardF(ivec3 c, ivec3 to, float a) { return ivec3(c.r + int(float(to.r - c.r) * a), c.g + int(float(to.g - c.g) * a), c.b + int(float(to.b - c.b) * a)); }
ivec3 scale8(ivec3 c, int f) { return ivec3((c.r * f) >> 8, (c.g * f) >> 8, (c.b * f) >> 8); }
ivec3 shade(ivec3 c) { return ivec3((c.r & 254) / 2 + (c.r & 252) / 4, (c.g & 254) / 2 + (c.g & 252) / 4, (c.b & 254) / 2 + (c.b & 252) / 4); }
ivec3 mixC(ivec3 a, ivec3 b, float t) { return ivec3(floor(mix(vec3(a), vec3(b), t) + 0.5)); }
ivec3 litC(ivec3 c) { ivec3 l = ivec3(u_lc); return toward(c, l, 36); }
ivec3 dryLit(ivec3 c) { return toward(c, ivec3(255, 240, 210), 46); }
uint imul(uint a, uint b) { return a * b; }
bool inland(int x, int y) { return riv(x, y).r > 0.5; }
float bankSurf(int x, int y) {
  if ((u_flags & 256) == 0) return 1.0;
  for (int d = 1; d <= 8; d++) if (inland(x - d, y) || inland(x + d, y) || inland(x, y - d) || inland(x, y + d)) return min(1.0, float(d - 1) / 7.0);
  return 1.0;
}
const ivec3 FOAM = ivec3(242, 251, 248), FOAM_SOFT = ivec3(196, 228, 224);
void main() {
  int x = u_org.x + int(gl_FragCoord.x), y = u_org.y + (u_size.y - 1 - int(gl_FragCoord.y));
  int W = u_world.x, H = u_world.y;
  bool doOut = (u_flags & 4) != 0, doSh = (u_flags & 2) != 0, anyThick = (u_flags & 8) != 0;
  int i = idAt(x, y);
  vec4 T0 = ter(x, y);
  float sp = T0.r, dd = T0.g;
  float tideL = u_tideL;
  ivec3 c; float depth = 0.0, fogScale = 1.0, waveS = 0.0, refl = 0.0, stroke = 0.0; int waveC = 0; bool dry = false;
  if (sp > tideL) { fogScale = 0.0; dry = true; } else if (sp > 0.0) fogScale = min(1.0, (tideL - sp) / 60.0);
  if (i == 0) {
    float zb = zbAt(x, y), bz = zb + 0.5; int best = 0;
    if (doOut) {
      int n;
      if (x > 0) { n = idAt(x - 1, y); if (n > 0 && zAt(x - 1, y) > bz) { best = n; bz = zAt(x - 1, y); } }
      if (x < W - 1) { n = idAt(x + 1, y); if (n > 0 && zAt(x + 1, y) > bz) { best = n; bz = zAt(x + 1, y); } }
      if (y > 0) { n = idAt(x, y - 1); if (n > 0 && zAt(x, y - 1) > bz) { best = n; bz = zAt(x, y - 1); } }
      if (y < H - 1) { n = idAt(x, y + 1); if (n > 0 && zAt(x, y + 1) > bz) { best = n; bz = zAt(x, y + 1); } }
      if (best == 0 && anyThick) {
        float zt = zb + 0.5;
        ivec2 R[8] = ivec2[8](ivec2(-2, 0), ivec2(2, 0), ivec2(0, -2), ivec2(0, 2), ivec2(-1, -1), ivec2(1, -1), ivec2(-1, 1), ivec2(1, 1));
        for (int k = 0; k < 8; k++) {
          int qx = x + R[k].x, qy = y + R[k].y;
          if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
          int m = idAt(qx, qy);
          if (m > 0 && flags(m).b > 0 && zAt(qx, qy) > zt) { best = m; bz = zAt(qx, qy); break; }
        }
      }
    }
    if (best > 0 && flags(best).g == 0) { c = outl(best); depth = bz; }
    else {
      int qx = clamp(x + int(wobX(y)), 0, W - 1), qy = clamp(y + int(wobY(x)), 0, H - 1); // (refraction: rows and columns shifted)
      float se = ter(qx, qy).r;
      if (se > tideL) {
        c = se < tideL + 9.0 + 22.0 * (bay(x, y) + 0.5) ? shade(bgAt(qx, qy)) : dryLit(bgAt(qx, qy));
        if (doSh && shAt(x, y) > zb + 1.5) c = shade(c);
        depth = 0.0;
      } else {
        bool lit = (u_flags & 1) != 0 && caus(x + u_o1.x, y + u_o1.y) + caus(y + u_o2.y, x + u_o2.x) < u_causticT;
        c = lit ? litC(bgAt(qx, qy)) : bgAt(qx, qy);
        if (doSh && shAt(x, y) > zb + 1.5) c = shade(c);
        depth = zbAt(qx, qy);
        if (u_swell > 0.0) {
          float patchK = 0.45 + caus((x >> 2) + u_o1.x, (y >> 2) + u_o2.y) * 0.9;
          float grp = 0.6 + 0.4 * WT(int(float(x) * u_gk.x + float(y) * u_gk.y - u_gt)) * (0.55 + 0.45 * WT(int(float(x) * u_hk.x + float(y) * u_hk.y - u_ht)));
          int i1 = int(float(x) * u_w1.x + float(y) * u_w1.y - u_w1t) & 1023, i2 = int(float(x) * u_w2.x + float(y) * u_w2.y - u_w2t) & 1023;
          float amp = u_swell * (0.55 + dd * 0.004) * patchK * grp;
          waveS = (WT(i1 + 24) - WT(i1 - 24) + 0.5 * (WT(i2 + 24) - WT(i2 - 24))) * amp;
          // (The CPU keeps the crest's brightness in waveC too; only the foam's 8 and 9 act on it, set below.)
          if (dd > 50.0) {
            float k = min(1.0, (dd - 50.0) / 110.0) * min(1.0, amp * 1.2 + 0.3);
            float U = float(x) + u_wdu, V = float(y) + u_wdv; int row = int(floor(V / 11.0)); float U2 = U + float(row & 1) * 9.0; int col = int(floor(U2 / 18.0));
            uint h = imul(imul(uint(row), 0x85ebca6bu) ^ imul(uint(col), 0xc2b2ae35u), 0x9e3779b1u);
            if (float(h & 255u) < 70.0 + 150.0 * min(1.0, u_swell) * k) {
              int w = 5 + int((h >> 8) % 5u), gu = int((h >> 12) % uint(18 - w)), gv = int((h >> 18) % 7u);
              int lu = int(floor(U2 - float(col * 18))) - gu, lv = int(floor(V - float(row * 11))) - gv;
              if (lu >= 0 && lu < w && lv >= 0 && lv < 3) {
                float life = sin(u_t * (0.22 + float((h >> 24) & 7u) * 0.03) + float(h >> 21));
                bool edge = lu == 0 || lu == w - 1, mid = lu >= 2 && lu <= w - 3;
                if (life > -0.25) {
                  if (lv == 0 && !edge && (life > 0.25 || mid)) stroke = k;
                  else if (lv == 1 && edge && life > 0.25) stroke = k * 0.6;
                  else if (lv == 1 && !edge && life > 0.25) stroke = -k;
                }
              }
            }
          }
          if (u_chop > 0.0 && dd < 160.0) {
            int i3 = int(float(x) * u_w3.x + float(y) * u_w3.y - u_w3t) & 1023;
            float ck = u_chop * (1.0 - dd / 160.0) * (0.6 + 0.8 * caus(x + u_o2.x, y >> 1));
            waveS += (WT(i3 + 40) - WT(i3 - 40)) * ck;
          }
          if (u_spin > 0.0 && dd > 110.0) {
            float a = float(x) * u_sw.y - float(y) * u_sw.x, b = (float(x) * u_sw.x + float(y) * u_sw.y) * 0.12 - u_t * 3.0;
            float v = caus(int(a), int(b));
            if (v < 0.035 * u_spin * (dd - 110.0) / 145.0 && ((x ^ y) & 1) == 1) waveC = 8;
          }
          if (u_swell > 0.45 && amp > 0.8 && patchK > 0.95) {
            float top = max(WT(i1) - 1.18, (WT(i2) - 1.24) * 0.8) * 6.0 * min(1.0, (amp - 0.8) * 1.5) * min(1.0, (patchK - 0.95) * 3.0);
            if (top > 0.0) {
              float h2 = float(imul(imul(uint(x), 0x27d4eb2du) ^ imul(uint(y), 0x165667b1u), 0x9e3779b1u) >> 24);
              if (h2 < top * 300.0) waveC = h2 < top * 140.0 ? 9 : 8;
            }
          }
        }
        if ((u_flags & 32) != 0 && u_calm > 0.02) {
          float cv = cloud(int(float(x) * 0.3 + u_cdx), int(float(y) * 0.45 + u_cdy)), dens = (cv - 0.38) * 1.6 * (1.0 - 0.65 * dd / 255.0);
          if (dens > 0.0) {
            int row = y >> 2; int sx = x + int((imul(uint(row), 0x9e3779b1u) >> 27) << 1) + int(u_t * 0.45); int seg = sx >> 3;
            uint h = imul(imul(uint(row), 0x85ebca6bu) ^ imul(uint(seg), 0xc2b2ae35u) ^ imul(uint(int(u_t * 0.08 + float(seg & 7) / 8.0)), 0x27d4eb2du), 0x9e3779b1u);
            int len = 2 + int((h >> 8) & 3u), at = sx & 7;
            if (float(h >> 24) < dens * dens * 210.0 && (y & 3) == int((h >> 4) & 3u) && at < len) {
              bool mid = at > 0 && at < len - 1;
              refl = u_calm * (mid ? 0.2 + 0.28 * cv : 0.1 + 0.12 * cv) * ((h & 1u) == 1u ? 1.0 : 0.7);
            }
          }
        }
        if (se > 0.0 && !((u_flags & 256) != 0 && inland(x, y))) {
          float d = tideL - se;
          if (d < 2.5) {
            float bank = bankSurf(x, y);
            if (bank > 0.0) { c = bank >= 1.0 ? (((x + y) & 1) == 1 ? FOAM : FOAM_SOFT) : mixC(c, FOAM_SOFT, bank); fogScale = 0.0; }
          } else if (u_surf > 0.0 && d < 30.0 + 70.0 * u_surf) {
            float reach = 30.0 + 70.0 * u_surf, w = mod(d * 0.045 + u_wave, 1.0), chance = (0.05 + 0.07 * u_surf) * (1.0 - d / reach);
            if (w < chance && caus(x, y) > 0.18) {
              float bank = bankSurf(x, y);
              if (bank > 0.0 && w < chance * bank) { c = d < reach * 0.45 && bank >= 1.0 ? FOAM : mixC(c, FOAM_SOFT, bank); fogScale = 0.0; }
            }
          }
        }
      }
    }
  } else {
    c = colAt(x, y); depth = zAt(x, y);
    float zp = depth + 2.5; bool edged = false; int en = 0;
    if (doOut) {
      ivec2 N4[4] = ivec2[4](ivec2(-1, 0), ivec2(1, 0), ivec2(0, -1), ivec2(0, 1));
      for (int k = 0; k < 4; k++) {
        int qx = x + N4[k].x, qy = y + N4[k].y;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        int m = idAt(qx, qy);
        if (m > 0 && m != i && zAt(qx, qy) > zp && flags(m).g == 0) { edged = true; en = m; break; }
      }
    }
    if (edged) c = outl(en);
    else {
      if (doSh && shAt(x, y) > zAt(x, y) + 4.0) c = shade(c);
      int lv = (u_flags & 4096) != 0 ? flags(i).a : 0;
      if (lv > 0) {
        float v = caus(x + u_vo.x, y + u_vo.y), th = VOIDT[min(lv, 7)];
        if (v < th) c = ((int(imul(uint(x), 73856093u) ^ imul(uint(y), 19349663u) ^ uint(u_starT)) & 31) == 0) ? ivec3(232, 240, 255) : ivec3(10, 4, 20);
        else if (v < th + 0.03) c = ivec3(138, 74, 200);
        else if (lv > 2) { int a = lv * 14; c = toward(c, ivec3(70, 30, 90), a); }
      }
    }
  }
  if ((u_flags & 16) != 0 && fogScale > 0.0) {
    int k = clamp(int(depth * u_fogK), 0, 64);
    int a = int(float(int(floor(256.0 * u_fogAmt * max(0.0, 1.0 - float(k) / 64.0) + 0.5))) * fogScale);
    if (a > 0) c = toward(c, ivec3(u_fog), a);
  }
  if ((u_flags & 256) != 0 && !dry) {
    float v = riv(x, y).g;
    if (v > 0.0) {
      float e = v / 255.0, kk = e * e * (3.0 - 2.0 * e), fadeIn = min(1.0, e * 6.0);
      float wa = (0.66 + 0.3 * kk) * fadeIn, ba = (0.08 + (0.14 + 0.3 * u_riverDeep) * kk) * fadeIn;
      if (i > 0) { wa *= 0.4; ba *= 0.4; }
      vec3 r = vec3(u_river), cc = vec3(c), keep = vec3(1.0 - ba);
      c = ivec3((cc + (r - cc) * wa) * keep);
    }
  }
  if ((u_flags & 512) != 0 && !dry) {
    int ddi = int(dd);
    if (ddi > 0 && !(i > 0 && flags(i).r == 2)) {
      int a = min(256, int(floor(float(ddi) * 290.0 * u_deepK)) >> 8);
      int m = (ddi * ddi) >> 8;
      ivec3 dc0 = ivec3(u_dc0), dc1 = ivec3(u_dc1), dcol = ivec3(dc0.r + sr8((dc1.r - dc0.r) * m), dc0.g + sr8((dc1.g - dc0.g) * m), dc0.b + sr8((dc1.b - dc0.b) * m));
      if (i > 0) a = (a * (256 - min(200, int(zAt(x, y) * 256.0 / 46.0 * 0.78)))) >> 8;
      if (i == 0) {
        float murk = (u_flags & 32) != 0 ? cloud(int(float(x) * 0.5 + u_mdx), int(float(y) * 0.5 + 64.0)) - 0.5 : 0.0;
        float af = float(a) + murk * 34.0 * (dd / 255.0);
        a = int(max(0.0, min(240.0, float(int((af + 6.0 + bay(x, y) * 12.0) / 12.0)) * 12.0)));
        if (a >= 240) a = 256;
      }
      c = toward(c, dcol, a);
    }
    if ((u_flags & 1024) != 0 && i == 0 && T0.b > 0.0) {
      int tv = int(T0.b); float v = float(tv & 127) / 127.0; bool lit = tv >= 128; float bq = bay(x, y); int f = 256;
      if (v > 0.62) c = ivec3(0);
      else if (v > 0.3) f = v + bq * 0.1 > 0.47 ? 60 : 120;
      else if (lit) {
        if (v > 0.12 && (int(imul(uint(x), 0x27d4eb2du) ^ imul(uint(y), 0x165667b1u) ^ uint(u_starT >> 3)) >> 27) == 0) c = ivec3(u_tg);
        else c = toward(c, ivec3(190, 200, 190), v > 0.15 ? 70 : 40);
      } else f = 185;
      if (f < 256) c = scale8(c, f);
    }
  }
  if (u_nharb > 0 && !dry && i == 0) {
    float hw = 0.0; bool ring = false;
    for (int k = 0; k < 16; k++) {
      if (k >= u_nharb) break;
      vec4 h = u_harb[k]; float dx = float(x) - h.x, dy = float(y) - h.y, d2 = dx * dx + dy * dy, r2 = h.z * h.z;
      if (d2 >= r2 * 1.06) continue;
      if (d2 < r2) hw = max(hw, 1.0 - d2 / r2);
      if (abs(sqrt(d2) - h.z) < 0.7 && ((x * 3 + y * 5 + u_hT) & 15) == 0) ring = true;
    }
    if (ring) c = ivec3(138, 240, 255);
    else if (hw > 0.0) c = towardF(c, ivec3(70, 220, 215), min(1.0, hw * 1.6) * 0.62);
  }
  if (u_coastN > 0 && !dry && i == 0) {
    int u = u_coastAxis == 1 ? x : y; float a = u_coastShift == 1 ? u_coastEx - float(u) : float(u) - u_coastEdge, cw = 0.0;
    for (int k = 0; k < 8; k++) { if (k >= u_coastN) break; vec2 s = u_coast[k]; if (a >= s.x && a < s.y) cw = max(cw, min(1.0, (a - s.x) / 300.0)); }
    if (cw > 0.0) c = towardF(c, ivec3(70, 205, 205), cw * 0.42);
  }
  stroke *= u_surfaceVis; waveS *= u_surfaceVis; refl *= u_surfaceVis;
  if (u_surfaceVis < 1.0 && waveC >= 8 && bay(x, y) > u_surfaceVis) waveC = 0;
  if (stroke != 0.0 && waveC < 8) {
    if (stroke > 0.0) c = toward(c, ivec3(220, 232, 240), int(stroke * 150.0));
    else c = scale8(c, 256 - int(-stroke * 70.0));
  } else if (waveC == 9) { c = (imul(imul(uint(x), 0x27d4eb2du) ^ imul(uint(y), 0x165667b1u), 0x9e3779b1u) >> 30) != 0u ? ivec3(246, 244, 240) : ivec3(234, 228, 214); }
  else if (waveC == 8) { c = ivec3(c.r + ((232 - c.r) >> 1), c.g + ((240 - c.g) >> 1), c.b + ((242 - c.b) >> 1)); }
  else if (waveS != 0.0 || refl != 0.0) {
    if (refl > 0.0) c = toward(c, ivec3(u_sky), int(refl * 256.0));
    float bq = bay(x, y);
    if (waveS > 0.14) { int a = min(4, int((waveS - 0.14) * 4.2 + 0.5 + bq)) * 30; if (a != 0) c = toward(c, ivec3(232, 240, 244), a); }
    else if (waveS < -0.14) { int f = 256 - min(4, int((-waveS - 0.14) * 4.0 + 0.5 + bq)) * 26; c = scale8(c, f); }
  }
  if ((u_flags & 2048) != 0) {
    int k = int(texelFetch(t_isle, tt(x, y), 0).r);
    if (k > 0 && k <= u_drainN) {
      float e = T0.a, inl = (u_flags & 8192) != 0 ? 0.12 + 0.88 * pow(max(0.0, 1.0 - e / 26.0), 1.4) : 1.0;
      float dr = drain(k - 1) * inl;
      if (dr > 0.02) {
        int q = min(3, int(dr * (0.66 + 0.08 * sin(u_t * 0.5 + float(k))) * 4.0 + bay(x, y) + 0.5));
        if (q > 0) c = scale8(c, 256 - q * 52);
      }
    }
  }
  int em = i > 0 ? flags(i).r : 0;
  if ((u_flags & 128) != 0 && em != 2) {
    ivec3 tt = em > 0 ? (u_tint + 256) >> 1 : u_tint;
    c = ivec3((c.r * tt.r) >> 8, (c.g * tt.g) >> 8, (c.b * tt.b) >> 8);
  }
  if ((u_flags & 64) != 0 && !((u_flags & 128) != 0 && em == 2)) {
    float bq = bay(x, y); int gx = int(float(x + 2) + bq * 3.6) >> 2, gy = int(float(y + 2) - bq * 3.6) >> 2;
    vec3 L = texelFetch(t_light, ivec2(min(gx, u_lsize.x - 1), min(gy, u_lsize.y - 1)), 0).rgb;
    if (L.r + L.g + L.b > 0.004) {
      float vis = max(max(u_lvis, dd / 255.0 * 0.45), 0.06);
      float m0 = max(L.r, max(L.g, L.b)), mt = m0 / (1.0 + m0);
      float q = float(min(4, int(mt * vis * 5.0 + 0.5 + bq))) / 4.0;
      if (q > 0.0) {
        float s = q / max(m0, 0.001); vec3 c0 = vec3(c);
        c = ivec3(min(vec3(255.0), c0 + floor(c0 * L * s * 1.6 + L * s * 46.0)));
      }
    }
  }
  o = vec4(vec3(clamp(c, 0, 255)) / 255.0, 1.0);
}`;

function composeGLAvailable() {
  const G = CGL;
  if (G.failed) return false;
  if (G.gl) return true;
  try {
    const cv = document.createElement('canvas'); cv.id = 'compose-gl'; cv.hidden = true; cv.setAttribute('aria-hidden', 'true');
    document.getElementById('pond').after(cv);
    const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.failed = true; cv.hidden = true; });
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, CGL_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, CGL_FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const names = ['t_col', 't_z', 't_zb', 't_sh', 't_bg', 't_ter', 't_riv', 't_cc', 't_tab', 't_light', 't_outline', 't_flags', 't_id', 't_isle'];
    names.forEach((n, k) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
      G.tex[n] = { t, unit: k }; gl.uniform1i(gl.getUniformLocation(prog, n), k); });
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    // (The glints: points drawn over the composed pond.)
    const pv = `#version 300 es
in vec3 a_p; uniform vec2 u_tile; uniform vec2 u_o;
out vec3 v_c;
void main() { vec2 q = (a_p.xy - u_o + 0.5) / u_tile; gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0); gl_PointSize = 1.0; v_c = a_p.z > 0.5 ? vec3(1.0, 1.0, 0.98) : vec3(0.85, 0.92, 0.95); }`;
    const pf = `#version 300 es
precision mediump float; in vec3 v_c; out vec4 o; void main() { o = vec4(v_c, 1.0); }`;
    const pp = gl.createProgram(); gl.attachShader(pp, sh(gl.VERTEX_SHADER, pv)); gl.attachShader(pp, sh(gl.FRAGMENT_SHADER, pf)); gl.linkProgram(pp);
    G.pprog = pp; G.pbuf = gl.createBuffer();
    G.cv = cv; G.gl = gl; G.prog = prog; G.quad = quad; G.qloc = loc;
    // The per-id tables (outline colours; emissive, fade, thick, void level), 256×256.
    G.outlineBytes = new Uint8Array(65536 * 4); G.flagBytes = new Uint8Array(65536 * 4);
    return true;
  } catch (e) {
    console.warn('GPU compose unavailable:', e.message);
    G.failed = true; if (G.cv) G.cv.remove();
    return false;
  }
}
function hideComposeGL() { if (CGL.cv) CGL.cv.hidden = true; }
function placeComposeGL() {
  const G = CGL, cv = G.cv;
  if (cv && !cv.hidden) { const [x, y] = worldToScreen(G.x, G.y); cv.style.transform = `translate(${x}px, ${y}px) scale(${view.k}) rotate(${view.r * 90}deg)`; }
}
// Upload one of the world's buffers (or the raster's) for the tile straight from its array (row length and skips
// pick the tile out of it), as the given format.
function cglUpload(gl, G, name, arr, W, x0, y0, w, h, ifmt, fmt, type) {
  const T = G.tex[name]; gl.activeTexture(gl.TEXTURE0 + T.unit); gl.bindTexture(gl.TEXTURE_2D, T.t);
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, W); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, arr);
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
}
function cglPlain(gl, G, name, w, h, ifmt, fmt, type, data) {
  const T = G.tex[name]; gl.activeTexture(gl.TEXTURE0 + T.unit); gl.bindTexture(gl.TEXTURE_2D, T.t);
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
}
const cglHex = (c) => [c & 255, (c >> 8) & 255, (c >>> 16) & 255];

// Compose the rect on the GPU from the raster and the state render() built for Raster.compose. False if it can't.
function composeGL(r, s, rect, world) {
  if (!composeGLAvailable()) return false;
  const G = CGL, gl = G.gl, W = r.W, H = r.H;
  // The tile: the rect and a margin (outlines and refraction read a few pixels round it), snapped so it doesn't
  // change size every frame.
  const m = 4, snap = 32;
  const x0 = Math.max(0, Math.floor((rect[0] - m) / snap) * snap), y0 = Math.max(0, Math.floor((rect[1] - m) / snap) * snap);
  const x1 = Math.min(W, Math.ceil((rect[2] + m + 1) / snap) * snap), y1 = Math.min(H, Math.ceil((rect[3] + m + 1) / snap) * snap);
  const tw = x1 - x0, th = y1 - y0, maxT = G.maxT || (G.maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE));
  if (tw <= 0 || th <= 0 || tw > maxT || th > maxT) return false;
  if (G.W !== tw || G.H !== th) { G.cv.width = tw; G.cv.height = th; G.cv.style.width = `${tw}px`; G.cv.style.height = `${th}px`; G.W = tw; G.H = th; G.terrainKey = ''; }
  G.x = x0; G.y = y0;
  gl.viewport(0, 0, tw, th); gl.useProgram(G.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, G.quad); gl.enableVertexAttribArray(G.qloc); gl.vertexAttribPointer(G.qloc, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  // What changes every frame: the raster's buffers and the floor.
  const u8 = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  cglUpload(gl, G, 't_col', u8(r.col), W, x0, y0, tw, th, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
  cglUpload(gl, G, 't_z', r.z, W, x0, y0, tw, th, gl.R32F, gl.RED, gl.FLOAT);
  cglUpload(gl, G, 't_zb', r.zBase, W, x0, y0, tw, th, gl.R32F, gl.RED, gl.FLOAT);
  cglUpload(gl, G, 't_id', r.id, W, x0, y0, tw, th, gl.R16UI, gl.RED_INTEGER, gl.UNSIGNED_SHORT);
  cglUpload(gl, G, 't_sh', r.sh, W, x0, y0, tw, th, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
  cglUpload(gl, G, 't_bg', u8(s.bg), W, x0, y0, tw, th, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
  // What changes slowly: shore, depth, trench and island edge in one, the river in another (and the islands' ids),
  // over a larger tile of their own (the view and 256 px round it), packed again only when the view leaves it or what
  // they hold has changed (so panning doesn't repack them every frame).
  const RM = s.riverMask || null, TM = 256;
  const inTer = G.tx0 != null && x0 >= G.tx0 && y0 >= G.ty0 && x1 <= G.tx0 + G.ttw && y1 <= G.ty0 + G.tth;
  const key = [!!s.shore && s.shore.length, s.depth ? 1 : 0, s.trench ? 1 : 0, s.islandEdge ? 1 : 0, s.islandGround ? 1 : 0, RM ? `${RM.x0},${RM.y0},${RM.w},${RM.h}` : ''].join('|');
  const now = performance.now();
  if (!inTer || key !== G.terrainKey || G.shoreRef !== s.shore || G.depthRef !== s.depth || G.trenchRef !== s.trench || G.isleRef !== s.islandGround || now - (G.terrainAt || 0) > 10000) {
    const ax = Math.max(0, Math.floor((x0 - TM) / TM) * TM), ay = Math.max(0, Math.floor((y0 - TM) / TM) * TM);
    const bx = Math.min(W, Math.ceil((x1 + TM) / TM) * TM), by = Math.min(H, Math.ceil((y1 + TM) / TM) * TM), aw = bx - ax, ah = by - ay;
    const n = aw * ah, T = G.terBuf && G.terBuf.length === n * 4 ? G.terBuf : (G.terBuf = new Uint8Array(n * 4)), Rv = G.rivBuf && G.rivBuf.length === n * 2 ? G.rivBuf : (G.rivBuf = new Uint8Array(n * 2));
    T.fill(0); Rv.fill(0);
    const sh = s.shore, dp = s.depth, tr = s.trench, ie = s.islandEdge;
    for (let y = 0; y < ah; y++) {
      const row = (ay + y) * W + ax, o = y * aw;
      for (let x = 0; x < aw; x++) { const p = row + x, k = (o + x) * 4; if (sh) T[k] = sh[p]; if (dp) T[k + 1] = dp[p]; if (tr) T[k + 2] = tr[p]; if (ie) T[k + 3] = ie[p]; }
    }
    if (RM && RM.data) for (let y = 0; y < RM.h; y++) for (let x = 0; x < RM.w; x++) {
      const wx = RM.x0 + x - ax, wy = RM.y0 + y - ay;
      if (wx < 0 || wy < 0 || wx >= aw || wy >= ah) continue;
      const k = (wx + wy * aw) * 2; Rv[k] = RM.data[x + y * RM.w] === 1 ? 255 : 0; if (RM.deep) Rv[k + 1] = RM.deep[x + y * RM.w];
    }
    cglPlain(gl, G, 't_ter', aw, ah, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, T);
    cglPlain(gl, G, 't_riv', aw, ah, gl.RG8, gl.RG, gl.UNSIGNED_BYTE, Rv);
    if (s.islandGround) cglUpload(gl, G, 't_isle', s.islandGround, W, ax, ay, aw, ah, gl.R16UI, gl.RED_INTEGER, gl.UNSIGNED_SHORT);
    else cglPlain(gl, G, 't_isle', 1, 1, gl.R16UI, gl.RED_INTEGER, gl.UNSIGNED_SHORT, new Uint16Array(1));
    G.tx0 = ax; G.ty0 = ay; G.ttw = aw; G.tth = ah;
    G.terrainKey = key; G.shoreRef = s.shore; G.depthRef = s.depth; G.trenchRef = s.trench; G.isleRef = s.islandGround; G.terrainAt = now;
  }
  // The caustic and cloud tiles (once), the wave table, the islands' drain and the refraction rows and columns.
  if (G.ccRef !== s.caustic || G.cloudRef !== (s.clouds || null)) {
    const cc = new Float32Array(128 * 128 * 2);
    for (let k = 0; k < 128 * 128; k++) { cc[k * 2] = s.caustic[k]; cc[k * 2 + 1] = s.clouds ? s.clouds[k] : 0; }
    cglPlain(gl, G, 't_cc', 128, 128, gl.RG32F, gl.RG, gl.FLOAT, cc);
    G.ccRef = s.caustic; G.cloudRef = s.clouds || null;
  }
  const TW = Math.max(1024, tw, th, s.isleDrain ? s.isleDrain.length : 0), tab = G.tabBuf && G.tabBuf.length === TW * 4 ? G.tabBuf : (G.tabBuf = new Float32Array(TW * 4));
  tab.fill(0);
  tab.set(WAVE_TAB, 0);
  if (s.isleDrain) for (let k = 0; k < s.isleDrain.length; k++) tab[TW + k] = s.isleDrain[k];
  if (s.wob) { for (let y = 0; y < th; y++) tab[TW * 2 + y] = s.wob.x[y0 + y] || 0; for (let x = 0; x < tw; x++) tab[TW * 3 + x] = s.wob.y[x0 + x] || 0; }
  cglPlain(gl, G, 't_tab', TW, 4, gl.R32F, gl.RED, gl.FLOAT, tab);
  // Lights.
  const LM = s.lights || null;
  if (LM) { const L4 = G.lbuf && G.lbuf.length === LM.lw * LM.lh * 4 ? G.lbuf : (G.lbuf = new Float32Array(LM.lw * LM.lh * 4)); for (let k = 0, n = LM.lw * LM.lh; k < n; k++) { L4[k * 4] = LM.data[k * 3]; L4[k * 4 + 1] = LM.data[k * 3 + 1]; L4[k * 4 + 2] = LM.data[k * 3 + 2]; } cglPlain(gl, G, 't_light', LM.lw, LM.lh, gl.RGBA32F, gl.RGBA, gl.FLOAT, L4); }
  // The per-id tables: outline colours and flags (refreshed every frame: cheap, and ids come and go).
  const OB = G.outlineBytes, FB = G.flagBytes, ol = s.outline, em = s.emissive, fd = s.fade, tk = s.thick, vd = s.voidSkin;
  for (let k = 0; k < 65536; k++) { const c = ol[k] || 0, q = k * 4; OB[q] = c & 255; OB[q + 1] = (c >> 8) & 255; OB[q + 2] = (c >>> 16) & 255; OB[q + 3] = 255; FB[q] = em[k]; FB[q + 1] = fd[k]; FB[q + 2] = tk ? tk[k] : 0; FB[q + 3] = vd ? vd[k] : 0; }
  cglPlain(gl, G, 't_outline', 256, 256, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, OB);
  cglPlain(gl, G, 't_flags', 256, 256, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, FB);
  // The uniforms (worked out as Raster.compose works them out).
  const U = G.U, loc = (n) => U[n] ?? (U[n] = gl.getUniformLocation(G.prog, n));
  const i1 = (n, v) => gl.uniform1i(loc(n), v), f1 = (n, v) => gl.uniform1f(loc(n), v), i2 = (n, a, b) => gl.uniform2i(loc(n), a, b), f2 = (n, a, b) => gl.uniform2f(loc(n), a, b), f3 = (n, c) => gl.uniform3f(loc(n), c[0], c[1], c[2]);
  const t = s.t, fog = s.fog, swell = s.swell || 0, sw = s.swellDir || [0, 1], L1 = typeof WAVE_L1 === 'number' ? WAVE_L1 : 62, L2 = typeof WAVE_L2 === 'number' ? WAVE_L2 : 37, ph = s.wavePh || null;
  const c2 = Math.cos(0.7), s2 = Math.sin(0.7), L3 = 10, sw0 = [sw0x(s), sw0y(s)];
  const isleOn = !!(s.isleDrain && s.islandGround), voidOn = !!s.voidSkin;
  const flags = (s.caustics ? 1 : 0) | (s.shadows ? 2 : 0) | (s.outlines ? 4 : 0) | (s.anyThick && s.thick ? 8 : 0) | (fog && fog.amount > 0 ? 16 : 0) | (s.clouds ? 32 : 0) | (LM ? 64 : 0) | (s.tint ? 128 : 0)
    | (RM ? 256 : 0) | (s.depth ? 512 : 0) | (s.trench ? 1024 : 0) | (isleOn ? 2048 : 0) | (voidOn ? 4096 : 0) | (s.islandEdge ? 8192 : 0);
  i2('u_org', x0, y0); i2('u_size', tw, th); i2('u_torg', G.tx0, G.ty0); i2('u_tsize', G.ttw, G.tth); i2('u_world', W, H); i2('u_lsize', LM ? LM.lw : 1, LM ? LM.lh : 1); i1('u_flags', flags);
  f1('u_t', t); f1('u_causticT', s.causticT || 0.09); f1('u_tideL', (s.tide ?? 1) * 255); f1('u_surf', s.surf || 0); f1('u_wave', s.wave || 0); f1('u_surfaceVis', s.surfaceVis ?? 1);
  f1('u_swell', s.waveMode === 'mesh' ? 0 : swell); f1('u_chop', s.chop || 0); f1('u_spin', s.spindrift || 0); f1('u_deepK', s.deepK ?? 1); f1('u_lvis', s.lightVis || 0); f1('u_riverDeep', s.riverDeep ?? 0.5);
  f1('u_calm', clamp(1 - swell * 1.5, 0, 1) * (s.skyK ?? 1)); f1('u_fogAmt', fog ? fog.amount : 0); f1('u_fogK', 64 / SURFACE_Z);
  i2('u_o1', Math.floor(t * 1.2), Math.floor(t * 0.65)); i2('u_o2', Math.floor(-t * 0.9), Math.floor(t * 1.05)); i2('u_vo', Math.floor(t * 0.9), Math.floor(t * 0.6));
  i1('u_starT', (Math.floor(t * 0.4) * 83492791) | 0); i1('u_hT', (t * 4) | 0);
  f3('u_lc', cglHex(s.lightTint ?? 0xffd2fff0)); f3('u_fog', cglHex(fog ? fog.color : 0)); f3('u_sky', cglHex(s.sky || 0xffe0d8c8));
  const dc = s.deepColor || 0xff0e0402; f3('u_dc0', cglHex(dc)); f3('u_dc1', cglHex(s.deepColor2 ?? dc)); f3('u_tg', cglHex(s.trenchGlow || 0xffffb02a)); f3('u_river', cglHex(s.riverColor ?? (fog ? fog.color : 0)));
  const tint = s.tint; gl.uniform3i(loc('u_tint'), tint ? Math.round(tint[0] * 256) : 256, tint ? Math.round(tint[1] * 256) : 256, tint ? Math.round(tint[2] * 256) : 256);
  f2('u_sw', sw[0], sw[1]); f2('u_w1', sw[0] * 1024 / L1, sw[1] * 1024 / L1); f1('u_w1t', ph ? ph[0] : t * 3 * 1024 / L1);
  f2('u_w2', (sw[0] * c2 - sw[1] * s2) * 1024 / L2, (sw[0] * s2 + sw[1] * c2) * 1024 / L2); f1('u_w2t', ph ? ph[1] : t * 2 * 1024 / L2);
  f2('u_w3', sw0[0] * 1024 / L3, sw0[1] * 1024 / L3); f1('u_w3t', t * 4 * 1024 / L3);
  f2('u_gk', sw[0] * 1024 / (L1 * 8), sw[1] * 1024 / (L1 * 8)); f1('u_gt', (t * 1.6 * 1024 / (L1 * 8)) % 1024);
  f2('u_hk', -sw[1] * 1024 / (L1 * 19), sw[0] * 1024 / (L1 * 19)); f1('u_ht', (t * 2.1) % 1024);
  const wd = ph ? ph[2] : t * 1.2; f1('u_wdu', -sw[0] * wd); f1('u_wdv', -sw[1] * wd);
  f1('u_cdx', t * 1.1); f1('u_cdy', t * 0.35); f1('u_mdx', t * 0.2);
  const hs = (s.harbors || []).filter((h) => h.x + h.r >= rect[0] && h.x - h.r <= rect[2] && h.y + h.r >= rect[1] && h.y - h.r <= rect[3]).slice(0, 16);
  i1('u_nharb', hs.length); if (hs.length) gl.uniform4fv(loc('u_harb'), new Float32Array(hs.flatMap((h) => [h.x, h.y, h.r, 0])));
  const sc = s.seaCoast;
  i1('u_coastN', sc ? Math.min(8, sc.spans.length) : 0);
  if (sc) { i1('u_coastAxis', sc.axisX ? 1 : 0); i1('u_coastShift', sc.shifts ? 1 : 0); f1('u_coastEx', sc.ex); f1('u_coastEdge', sc.edge); gl.uniform2fv(loc('u_coast'), new Float32Array(sc.spans.slice(0, 8).flatMap((q) => [q[0], Math.min(q[1], 1e7)]))); }
  i1('u_drainN', s.isleDrain ? s.isleDrain.length : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // The glints over it.
  const gs = (world.glints || []).filter((g) => g.x >= x0 && g.y >= y0 && g.x < x1 && g.y < y1);
  if (gs.length && (s.surfaceVis ?? 1) > 0.1) {
    const pts = [];
    for (const g of gs) { const strong = g.t > 0.2 && g.t < 0.7 ? 1 : 0; pts.push(g.x, g.y, strong); if (g.star && g.t > 0.3 && g.t < 0.6) pts.push(g.x - 1, g.y, 0, g.x + 1, g.y, 0, g.x, g.y - 1, 0, g.x, g.y + 1, 0); }
    gl.useProgram(G.pprog);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.pbuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.DYNAMIC_DRAW);
    const pl = gl.getAttribLocation(G.pprog, 'a_p'); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 3, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(G.pprog, 'u_tile'), tw, th); gl.uniform2f(gl.getUniformLocation(G.pprog, 'u_o'), x0, y0);
    gl.drawArrays(gl.POINTS, 0, pts.length / 3);
    gl.disableVertexAttribArray(pl);
  }
  G.frames = (G.frames || 0) + 1;
  if ((G.frames < 4 || G.frames % 300 === 0) && gl.getError() !== gl.NO_ERROR) { G.failed = true; hideComposeGL(); return false; }
  G.cv.hidden = false; placeComposeGL();
  return true;
}
