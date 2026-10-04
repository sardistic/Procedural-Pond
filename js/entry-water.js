'use strict';
// The entry screen's moving pictures: the rippling night pond behind it, and the glimpse of each pond in the list.
// entry.js runs this as a worker, handing it the canvases, so they keep moving while main.js builds the pond on the
// page's own thread (that build takes a second or two, and froze them when they were drawn there). Where a worker
// can't draw (no OffscreenCanvas), the page loads this file as a plain script and entry.js calls it directly.
(() => {
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
  // (Colours as ABGR words, the way the canvas's bytes read.)
  const abgr = (hex) => { const n = parseInt(hex.slice(1), 16); return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; };
  const darken = (c, f) => (0xff000000 | ((((c >>> 16) & 255) * f) << 16) | ((((c >>> 8) & 255) * f) << 8) | ((c & 255) * f)) >>> 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  // Value noise.
  const hash = (x, y) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const smooth = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v; };

  // ---- the night pond: a rippling surface over a pixel floor ---------------------------------------------
  // A height field carries every disturbance outward as real ripples (rain, koi, your pointer); looking down
  // through it, the floor is bent by the surface's slope, light gathers where it curves, and the moon catches
  // the faces of the waves. Koi swim on the floor layer, so they wobble under the ripples; pads float on top.
  const KOI = [['#f26b2a', '#fff4e0', '#b8401a'], ['#fff4e0', '#e8402a', '#c9b8a0'], ['#ffc53a', '#fff4e0', '#c88a1a'], ['#f04a5a', '#2a2030', '#a82a3a'], ['#fff4e0', '#2a2030', '#c9b8a0'], ['#e8e0ff', '#7a8aff', '#b0a8d8']];
  function makeWater(cv, still) {
    const g = cv.getContext('2d', { alpha: false });
    let W = 0, H = 0, S = 4, img = null, px = null, base = null, under = null, cur = null, prev = null, t = 0, last = 0, nextDrop = 0, acc = 0, dirty = true;
    const fish = [], pads = [];
    // The floor, seen through dark water: sand in dithered bands, pebbles with a lit side, weed at the edges.
    function floor() {
      const SAND = ['#071226', '#0a1a33', '#0d2240', '#112a4d', '#16345a'].map(abgr), PEB = ['#0c1c30', '#14283f', '#1e3550', '#2b4663'].map(abgr), WEED = ['#06231f', '#0b3a2c', '#12503a'].map(abgr);
      base = new Uint32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const n = smooth(x / 22, y / 22) * 0.6 + smooth(x / 7, y / 7) * 0.3 + smooth(x / 2.5, y / 2.5) * 0.1;
        const edge = Math.min(1, Math.min(x, W - x, y * 1.4, (H - y) * 1.4) / (Math.min(W, H) * 0.35));
        const k = Math.floor((n * 0.75 + edge * 0.45) * SAND.length - 0.2 + BAYER[(x & 3) + ((y & 3) << 2)] * 0.9);
        base[x + y * W] = SAND[k < 0 ? 0 : k >= SAND.length ? SAND.length - 1 : k];
      }
      const pebbles = Math.round(W * H / 260);
      for (let i = 0; i < pebbles; i++) {
        const cx = rnd(0, W), cy = rnd(0, H), rx = rnd(1, 3.6), ry = rx * rnd(0.6, 0.9), tone = Math.floor(rnd(0, 2.99));
        for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
          if (d <= 1) base[x + y * W] = PEB[(x - cx) + (y - cy) < -rx * 0.4 ? tone + 1 : tone];
          else if (d <= 1.6 && x - cx > 0 && y - cy > 0) base[x + y * W] = SAND[0]; // (its shadow)
        }
      }
      // Weed along the edges, in tufts of blades.
      for (let i = 0; i < Math.round((W + H) / 6); i++) {
        const side = Math.random(), x0 = side < 0.5 ? rnd(0, W) : (side < 0.75 ? rnd(0, W * 0.08) : rnd(W * 0.92, W)), y0 = side < 0.5 ? (Math.random() < 0.5 ? rnd(0, H * 0.1) : rnd(H * 0.9, H)) : rnd(0, H);
        for (let b = 0; b < 5; b++) {
          const len = rnd(4, 11), ang = rnd(-2.6, -0.5), bend = rnd(-0.08, 0.08), col = WEED[Math.floor(rnd(0, 2.99))];
          let x = x0 + rnd(-2, 2), y = y0 + rnd(-2, 2), a = ang;
          for (let s = 0; s < len; s++) { a += bend; x += Math.cos(a); y += Math.sin(a); const xi = Math.round(x), yi = Math.round(y); if (xi >= 0 && yi >= 0 && xi < W && yi < H) base[xi + yi * W] = col; }
        }
      }
    }
    // Sized to the page (in CSS pixels; the canvas is a quarter or a third of that, scaled up).
    function size(w, h) {
      S = w < 700 ? 3 : 4;
      W = Math.max(8, Math.ceil(w / S)); H = Math.max(8, Math.ceil(h / S));
      cv.width = W; cv.height = H;
      img = g.createImageData(W, H); px = new Uint32Array(img.data.buffer);
      under = new Uint32Array(W * H); cur = new Float32Array(W * H); prev = new Float32Array(W * H);
      floor();
      fish.length = pads.length = 0;
      const n = Math.max(4, Math.min(9, Math.round(W * H / 5000)));
      for (let i = 0; i < n; i++) {
        fish.push({ c: KOI[i % KOI.length].map(abgr), len: rnd(10, 16) * (S === 3 ? 0.9 : 1), ax: rnd(0.25, 0.45) * W, ay: rnd(0.2, 0.38) * H, cx: rnd(0.3, 0.7) * W, cy: rnd(0.3, 0.7) * H,
          fx: rnd(0.012, 0.03) * (Math.random() < 0.5 ? -1 : 1), fy: rnd(0.015, 0.035), p: rnd(0, 6.3), q: rnd(0, 6.3) });
      }
      for (let i = 0; i < Math.round(W * H / 3500); i++) {
        // Pads keep to the edges, clear of the title and the panel's middle.
        const edge = Math.random() < 0.5, x = edge ? rnd(0, W) : (Math.random() < 0.5 ? rnd(0, W * 0.12) : rnd(W * 0.88, W)), y = edge ? (Math.random() < 0.5 ? rnd(0, H * 0.14) : rnd(H * 0.86, H)) : rnd(0, H);
        pads.push({ x, y, r: rnd(5, 11), a: rnd(0, 6.3), s: rnd(-0.04, 0.04), bloom: Math.random() < 0.3 });
      }
      last = 0; dirty = true;
      // (Held still: a few old ripples, settled a while, drawn once.)
      if (still) { t = 4; for (let i = 0; i < 6; i++) poke(rnd(0, W), rnd(0, H), 2, 8); for (let i = 0; i < 40; i++) step(); }
    }
    // A disturbance: pushes the surface down in a small disc; the waves do the rest.
    function poke(x, y, r, depth) {
      const x0 = Math.max(1, Math.floor(x - r)), x1 = Math.min(W - 2, Math.ceil(x + r)), y0 = Math.max(1, Math.floor(y - r)), y1 = Math.min(H - 2, Math.ceil(y + r));
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
        const d = Math.hypot(xx - x, yy - y) / r;
        if (d < 1) cur[xx + yy * W] -= depth * (0.5 + 0.5 * Math.cos(d * Math.PI));
      }
    }
    // One step of the wave equation (each cell pulled toward its neighbours' average), damped so ripples fade.
    function step() {
      for (let y = 1; y < H - 1; y++) {
        const row = y * W;
        for (let i = row + 1, e = row + W - 1; i < e; i++) prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - W] + cur[i + W]) * 0.5 - prev[i]) * 0.986;
      }
      const tmp = cur; cur = prev; prev = tmp;
    }
    const dot = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) under[x + y * W] = c; };
    const disc = (x, y, r, c) => { const R = Math.max(0.5, r); for (let yy = Math.floor(y - R); yy <= y + R; yy++) for (let xx = Math.floor(x - R); xx <= x + R; xx++) if ((xx - x) ** 2 + (yy - y) ** 2 <= R * R + 0.3) dot(xx, yy, c); };
    function koi(f) {
      // Its head swims a slow loop; the body trails back along its heading, rippling as it swims.
      const wx = f.fx * 6.28, wy = f.fy * 6.28, hx = f.cx + Math.sin(t * wx + f.p) * f.ax, hy = f.cy + Math.sin(t * wy + f.q) * f.ay;
      const vx = Math.cos(t * wx + f.p) * f.ax * wx, vy = Math.cos(t * wy + f.q) * f.ay * wy, vl = Math.hypot(vx, vy) || 1;
      const dx = vx / vl, dy = vy / vl, n = Math.max(8, Math.round(f.len)), w = f.len / 5, pts = [];
      for (let i = 0; i < n; i++) {
        const k = i / n, sway = Math.sin(t * 5 + f.p - k * 4) * k * w * 0.9;
        pts.push([hx - dx * i - dy * sway, hy - dy * i + dx * sway, Math.max(0.5, w * (k < 0.15 ? 0.75 + k * 1.6 : 1 - (k - 0.15) * 1.05))]);
      }
      // Its shadow on the floor, then fins, tail, body, spots and eyes, all under the water.
      for (const [x, y, r] of pts) { const R = r; for (let yy = Math.floor(y + 3 - R); yy <= y + 3 + R; yy++) for (let xx = Math.floor(x + 3 - R); xx <= x + 3 + R; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) under[xx + yy * W] = darken(under[xx + yy * W], 0.55); }
      const [body, spot, fin] = f.c, [fx0, fy0] = pts[Math.round(n * 0.3)], fl = w * 1.6;
      disc(fx0 - dy * fl, fy0 + dx * fl, w * 0.45, fin); disc(fx0 + dy * fl, fy0 - dx * fl, w * 0.45, fin);
      const [tx, ty] = pts[n - 1], wag = Math.sin(t * 5 + f.p - 4) * w;
      disc(tx - dx * 1.5 - dy * wag, ty - dy * 1.5 + dx * wag, w * 0.6, fin);
      for (let i = n - 1; i >= 0; i--) disc(pts[i][0], pts[i][1], pts[i][2], body);
      for (const k of [0.35, 0.6]) { const [x, y, r] = pts[Math.round(n * k)]; disc(x, y, r * 0.55, spot); }
      dot(hx - dy * w * 0.5, hy + dx * w * 0.5, 0xff20141a); dot(hx + dy * w * 0.5, hy - dx * w * 0.5, 0xff20141a);
      // A koi stirs the surface a little as it goes, and now and then noses up to it.
      if (!still) { poke(hx, hy, 1.5, 0.5); if (Math.random() < 0.003) poke(hx, hy, 2.5, 7); }
    }
    // The surface: the floor seen through it, bent by its slope, lit where it curves, glinting toward the moon.
    function water() {
      const R = 0.9, mx = W * 0.72, my = H * 0.28, top = H - 1, right = W - 1;
      for (let y = 1; y < H - 1; y++) {
        const row = y * W, sy0 = y;
        for (let x = 1; x < W - 1; x++) {
          const i = row + x, h = cur[i];
          // Slope, with a slow breeze on top so the water is never glassy.
          const sx = cur[i - 1] - cur[i + 1] + Math.sin(y * 0.09 + t * 0.7) * 0.4 + Math.sin((x + y) * 0.21 - t * 1.3) * 0.18, sy = cur[i - W] - cur[i + W] + Math.sin(x * 0.07 - t * 0.55) * 0.4 + Math.sin((x - y) * 0.17 + t * 1.1) * 0.18;
          let fx = Math.round(x + sx * R), fy = Math.round(sy0 + sy * R);
          fx = fx < 0 ? 0 : fx > right ? right : fx; fy = fy < 0 ? 0 : fy > top ? top : fy;
          let c = under[fx + fy * W];
          const curve = cur[i - 1] + cur[i + 1] + cur[i - W] + cur[i + W] - 4 * h, b = BAYER[(x & 3) + ((y & 3) << 2)];
          // Light gathered where the surface curves like a lens; shade on faces turned away.
          const lit = -curve * 0.9 + (sx * 0.35 + sy * 0.5) * 0.6;
          const st = Math.max(-2, Math.min(3, Math.floor(lit * 2.8 + b)));
          if (st > 0) {
            const a = st * 34, cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255;
            c = (0xff000000 | ((cb + (((0xd8 - cb) * a) >> 8)) << 16) | ((cg + (((0xd0 - cg) * a) >> 8)) << 8) | (cr + (((0x90 - cr) * a) >> 8))) >>> 0;
          } else if (st < 0) c = darken(c, st === -1 ? 0.8 : 0.62);
          // The moon on the water: a wide, broken path of glints near it.
          const md = ((x - mx) / (W * 0.16)) ** 2 + ((y - my) / (H * 0.5)) ** 2;
          if (md < 1 && sy * 0.8 - sx * 0.3 > 0.72 + md * 1.1 + b * 0.7) c = md < 0.25 ? 0xffe8f4ff : 0xffb8d4e8;
          px[i] = c;
        }
      }
      // (The border rows and columns copy their neighbours.)
      for (let x = 0; x < W; x++) { px[x] = px[x + W]; px[x + (H - 1) * W] = px[x + (H - 2) * W]; }
      for (let y = 0; y < H; y++) { px[y * W] = px[y * W + 1]; px[y * W + W - 1] = px[y * W + W - 2]; }
      g.putImageData(img, 0, 0);
    }
    function pad(p) {
      // Floating on the surface: it rides the ripples and turns slowly.
      const i = Math.max(0, Math.min(W * H - 1, Math.round(p.x) + Math.round(p.y) * W)), lift = cur[i] * 0.4;
      const a = p.a + t * p.s, r = p.r, notch = 0.45, x = p.x, y = p.y + lift;
      g.fillStyle = 'rgba(2,4,12,0.45)';
      g.beginPath(); g.arc(x + 2, y + 3, r, 0, 6.29); g.fill();
      g.fillStyle = '#1f6b4a';
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a + notch, a + 6.283 - notch); g.closePath(); g.fill();
      g.fillStyle = '#2f8f5f';
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, r * 0.65, a + notch + 0.4, a + 3.3); g.closePath(); g.fill();
      g.fillStyle = '#3aa86e'; g.fillRect(Math.round(x - r * 0.4), Math.round(y - r * 0.5), 2, 1);
      if (p.bloom) {
        const bx = Math.round(x - r * 0.3), by = Math.round(y - r * 0.2);
        g.fillStyle = '#ff8ac8'; g.fillRect(bx - 2, by, 5, 1); g.fillRect(bx, by - 2, 1, 5); g.fillRect(bx - 1, by - 1, 3, 3);
        g.fillStyle = '#ffe0f0'; g.fillRect(bx, by, 1, 1);
      }
    }
    // A frame, at most 30 a second (and, held still, only when something changed).
    function frame(now) {
      if (!W || (still && !dirty)) return;
      if (!still && last && now - last < 33) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 30;
      last = now; dirty = false;
      if (!still) {
        t += dt;
        if (t > nextDrop) { poke(rnd(2, W - 2), rnd(2, H - 2), rnd(1.2, 2.2), rnd(5, 9)); nextDrop = t + rnd(0.25, 1.1); }
        // The waves run at a fixed pace (two steps a frame at 30 fps), whatever the frame rate.
        acc = Math.min(acc + dt * 60, 4);
        while (acc >= 1) { step(); acc -= 1; }
      }
      under.set(base);
      for (const f of fish) koi(f);
      water();
      for (const p of pads) pad(p);
    }
    // (Pokes come in page pixels.)
    return { size, frame, poke(x, y, r, d) { if (W) { poke(x / S, y / S, r, d); dirty = true; } } };
  }

  // ---- each pond's row, a glimpse of it --------------------------------------------------------------------
  // From what the board knows (habitat, fathoms, days, animals, species, rares, its best find, when it last lived),
  // a few pixels of water seen side on, different for every pond: its own shade of its kind of water, its own floor
  // (sand, rock, coral, mud or black sand), reeds and pads or kelp and anemones or mangrove roots as it ages, an
  // island's slope once it's old, light coming down through shallow water and darkness in a deep one; fish across it
  // for its animals (more colours for more species, schools when there are many), jellies and crabs in salt, a big
  // bright one for its best find, glints for its rares, bubbles if it's lively, and in the very deep a beam sweeping
  // the dark and things glowing there.
  const PALS = {
    fresh: [['#2a6a4a', '#123c2c', '#7ad08a'], ['#5a4c2c', '#241c0e', '#d8c080'], ['#2a7272', '#0e3640', '#9af0e0'], ['#3a7a52', '#143824', '#b8f0a8'], ['#28584a', '#0c2420', '#88c8a8']],
    salt: [['#2a9ab0', '#0c4a6a', '#b8ffff'], ['#1c4c92', '#081a40', '#8ab8ff'], ['#2a6aa0', '#0c3058', '#8ad8ff'], ['#4a3c8a', '#140c3a', '#c8a8ff'], ['#1a7a9a', '#06283a', '#a8f0ff']],
    mixed: [['#2a6a7a', '#103a48', '#8ae8e0'], ['#4c5a2a', '#1a2410', '#c8d890'], ['#3a5a5a', '#142424', '#a8c8b8'], ['#2a5a6a', '#0c2232', '#a0d8e8']],
  };
  const FLOORS = { fresh: ['sand', 'mud', 'rock', 'pebble'], salt: ['sand', 'coral', 'rock', 'coral'], mixed: ['mud', 'sand', 'pebble', 'rock'] };
  const FISH_COLS = ['#f08a3a', '#f4f0e8', '#e05a3a', '#ffd166', '#3ad6ff', '#ff6a8a', '#8aff9a', '#c88aff', '#ffb0d0', '#5af0c8', '#ff9a4a', '#b0c8ff'];
  const KOI_COLS = ['#f08a3a', '#f4f0e8', '#ffd166', '#e8402a'];
  const TIER_COLS = ['#ffffff', '#8aff9a', '#5ac8ff', '#c88aff', '#ffd166', '#ff6a8a'];
  const hexRgb = (s) => { const n = parseInt(s.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  const word = (c) => (0xff000000 | (cl(c[2]) << 16) | (cl(c[1]) << 8) | cl(c[0])) >>> 0;
  const css = (c) => `rgb(${cl(c[0])},${cl(c[1])},${cl(c[2])})`;

  function rowScene(cv, p) {
    const W = cv.width, H = cv.height, g = cv.getContext('2d');
    let h = 2166136261; for (const ch of String(p.id || p.slug || 'pond')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const r = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0) / 4294967296), ri = (n) => (r() * n) | 0, pickOf = (a) => a[ri(a.length)];
    const hab = PALS[p.habitat] ? p.habitat : 'mixed', depth = Math.max(1, p.depth || 1), days = p.days || 0, animals = p.animals || 0;
    const species = Math.max(1, p.species || Math.ceil(Math.sqrt(animals))), rares = p.rares || 0;
    const since = p.updated ? Date.now() - p.updated : 864e5, lively = since < 36e5, sleepy = since > 7 * 864e5;
    const dark = Math.min(1, Math.log10(1 + depth) / 6), pace = sleepy ? 0.45 : lively ? 1.3 : 1;
    // Its water: one of its habitat's shades, nudged a little more its own.
    const pal = pickOf(PALS[hab]), nudge = [r() * 22 - 11, r() * 22 - 11, r() * 22 - 11];
    const top = hexRgb(pal[0]).map((v, i) => v + nudge[i]), bot = hexRgb(pal[1]).map((v, i) => v + nudge[i] * 0.5), light = hexRgb(pal[2]);
    const floorKind = dark > 0.62 && r() < 0.7 ? 'black' : pickOf(FLOORS[hab]);
    const isle = days > 12 && r() < Math.min(0.85, days / 60) ? { x: W * (0.15 + r() * 0.7), w: 9 + r() * 10 } : null;
    // The still part, drawn once: dithered water, the floor, rocks and coral, the island's slope.
    const bg = g.createImageData(W, H), B = new Uint32Array(bg.data.buffer);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = Math.max(0, Math.min(1, Math.round((y / (H - 1) + BAYER[(x & 3) + ((y & 3) << 2)] * 0.3) * 4) / 4));
      B[x + y * W] = word(mix(top, bot, k));
    }
    const put = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) B[x + y * W] = c; };
    const FL = { sand: ['#8a7a50', '#b8a46a', '#d8c88a'], mud: ['#3a2c1c', '#4c3a24', '#5c4a30'], rock: ['#2a3040', '#3c4458', '#5a6478'], pebble: ['#6a6450', '#8a8468', '#a8a080'],
      coral: ['#8a7a50', '#b8a46a', '#d8c88a'], black: ['#0c0c10', '#18181e', '#2a2a32'] }[floorKind].map((c) => word(mix(hexRgb(c), bot, 0.35)));
    const fy = new Array(W), ph1 = r() * 9, ph2 = r() * 9, rough = floorKind === 'rock' ? 2.2 : floorKind === 'mud' ? 0.6 : 1.2;
    for (let x = 0; x < W; x++) {
      fy[x] = Math.round(H - 2 - rough * (1 + Math.sin(x * 0.11 + ph1) * 0.6 + Math.sin(x * 0.37 + ph2) * 0.4));
      for (let y = fy[x]; y < H; y++) put(x, y, FL[y === fy[x] ? 2 : y === fy[x] + 1 ? 1 : 0]);
    }
    if (floorKind === 'rock' || floorKind === 'black') for (let i = 0; i < 3 + ri(4); i++) {
      // A boulder: a lumpy dome with a lit top.
      const cx = r() * W, rr = 1.5 + r() * 2.5;
      for (let x = Math.floor(cx - rr); x <= cx + rr; x++) { if (x < 0 || x >= W) continue; const hh = Math.round(Math.sqrt(Math.max(0, rr * rr - (x - cx) ** 2)) * 1.1); for (let k = 0; k <= hh; k++) put(x, fy[x] - k, FL[k === hh ? 2 : 1]); }
    }
    if (floorKind === 'pebble') for (let i = 0; i < 14; i++) { const x = ri(W); put(x, fy[x] - 1, FL[r() < 0.5 ? 2 : 1]); put(x + 1, fy[x + 1 < W ? x + 1 : x] - 1, FL[1]); }
    if (floorKind === 'coral') {
      const CORAL = ['#ff7a8a', '#ffa050', '#c86ad8', '#ffd166', '#5ad8c8'].map((c) => word(mix(hexRgb(c), bot, 0.25)));
      for (let i = 0; i < 5 + ri(6); i++) {
        const x0 = ri(W), c = pickOf(CORAL), kind = ri(3);
        if (kind === 0) for (let k = 0; k < 3 + ri(3); k++) { put(x0, fy[x0] - k, c); if (k > 1 && k % 2) { put(x0 - 1, fy[x0] - k - 1, c); put(x0 + 1, fy[x0] - k, c); } } // (branching)
        else if (kind === 1) for (let dx = -2; dx <= 2; dx++) for (let k = 0; k < 3 - Math.abs(dx); k++) put(x0 + dx, fy[Math.max(0, Math.min(W - 1, x0 + dx))] - k, c); // (a brain coral)
        else for (let k = 0; k < 4; k++) put(x0 + (k % 2), fy[x0] - k, c); // (a sea pen)
      }
    }
    if (isle) {
      // An island's underwater slope, rising out of the water: sand going pale toward the top, a beach on it.
      const SAND = ['#8a7a50', '#b8a46a', '#e8d8a0'].map((c) => hexRgb(c));
      for (let x = Math.floor(isle.x - isle.w); x <= isle.x + isle.w; x++) {
        if (x < 0 || x >= W) continue;
        const k = 1 - ((x - isle.x) / isle.w) ** 2, hh = Math.round(k * (H + 2));
        for (let y = Math.max(0, H - hh); y < H; y++) {
          const lit = 1 - y / H, b = BAYER[(x & 3) + ((y & 3) << 2)];
          B[x + y * W] = word(mix(SAND[Math.max(0, Math.min(2, Math.round(lit * 2 + b)))], bot, 0.2 + 0.5 * (y / H)));
        }
        if (hh >= H) { put(x, 0, word(SAND[2])); if (k > 0.85) put(x, 1, word([90, 140, 70])); }
      }
    }
    // The living part.
    const flora = [];
    const nFlora = Math.min(22, Math.round(Math.log2(1 + days) * 2.2));
    for (let i = 0; i < nFlora; i++) {
      const x = ri(W);
      if (hab === 'fresh') flora.push(r() < 0.35 ? { kind: 'reed', x, h: H - fy[x] + 2 + ri(4), c: pickOf(['#4a8a3a', '#6aa04a', '#8a9a4a']), ph: r() * 6.3 }
        : { kind: 'weed', x, h: 2 + ri(5), c: pickOf(['#2a8a3a', '#46a84a', '#3a7a2a']), ph: r() * 6.3 });
      else if (hab === 'salt') flora.push(r() < 0.4 && dark < 0.7 ? { kind: 'kelp', x, h: 6 + ri(H - 6), c: pickOf(['#6a7a2a', '#8a8a3a', '#5a6a20']), ph: r() * 6.3 }
        : r() < 0.5 ? { kind: 'anem', x, c: pickOf(['#ff7a9a', '#c86ad8', '#ffa050']), ph: r() * 6.3 } : { kind: 'weed', x, h: 2 + ri(4), c: pickOf(['#e07a8a', '#f0a050', '#c86ad8']), ph: r() * 6.3 });
      else flora.push(r() < 0.3 ? { kind: 'root', x, h: 4 + ri(6), c: '#4a3a24', ph: r() * 6.3 } : r() < 0.5 ? { kind: 'reed', x, h: H - fy[x] + 1 + ri(3), c: '#7a9a4a', ph: r() * 6.3 }
        : { kind: 'weed', x, h: 2 + ri(4), c: pickOf(['#2a8a3a', '#e07a8a', '#6a8a3a']), ph: r() * 6.3 });
    }
    const pads = hab !== 'salt' && days > 1 && dark < 0.75 ? Array.from({ length: Math.min(6, 1 + ri(Math.ceil(days / 8))) }, () => ({ x: r() * W, w: 2 + ri(3), bloom: r() < 0.3, ph: r() * 6.3 })) : [];
    // Fish: more colours for more species, in schools when there are many.
    const cols = FISH_COLS.slice().sort(() => r() - 0.5).slice(0, Math.max(1, Math.min(8, species)));
    const nFish = Math.max(animals ? 1 : 0, Math.min(16, Math.round(Math.log2(1 + animals) * 1.7)));
    const fish = [];
    for (let i = 0; i < nFish; i++) {
      const v = (0.5 + r() * 1.4) * (r() < 0.5 ? -1 : 1), y = 2 + r() * (H - 6), c = cols[i % cols.length];
      if (animals > 25 && r() < 0.3) fish.push({ kind: 'school', x: r() * W, y, v: v * 1.4, ph: r() * 6.3, c, n: 3 + ri(5), sp: r() * 6.3 });
      else if (hab === 'fresh' && r() < 0.3) fish.push({ kind: 'koi', x: r() * W, y, v: v * 0.6, ph: r() * 6.3, c: pickOf(KOI_COLS), spot: pickOf(['#f4f0e8', '#e8402a', '#2a2030']) });
      else if (r() < 0.12) fish.push({ kind: 'eel', x: r() * W, y: H - 4 - r() * 3, v: v * 0.5, ph: r() * 6.3, c: pickOf(['#6a7a4a', '#8a6a3a', '#4a6a7a']) });
      else fish.push({ kind: 'fish', x: r() * W, y, v, ph: r() * 6.3, c, big: r() < 0.25 });
    }
    const jellies = hab !== 'fresh' && animals > 4 && r() < 0.7 ? Array.from({ length: 1 + ri(3) }, () => ({ x: r() * W, y: 3 + r() * (H - 8), ph: r() * 6.3, c: pickOf(['#ffb0e0', '#b0d0ff', '#e0b0ff', '#a0fff0']) })) : [];
    const crabs = hab !== 'fresh' && animals > 8 && r() < 0.6 ? Array.from({ length: 1 + ri(2) }, () => ({ x: r() * W, v: (0.3 + r() * 0.4) * (r() < 0.5 ? -1 : 1), c: pickOf(['#e05a3a', '#f08a3a', '#c84a5a']), ph: r() * 6.3 })) : [];
    const best = p.best && p.best.tier ? { x: r() * W, y: 3 + r() * (H - 8), v: (0.4 + r() * 0.5) * (r() < 0.5 ? -1 : 1), ph: r() * 6.3, c: TIER_COLS[Math.min(TIER_COLS.length - 1, p.best.tier)] } : null;
    return {
      cv, g, W, H, bg, fy, dark, pace, lively, light: css(light), lightA: 0.25 + 0.2 * r(), flora, pads, fish, jellies, crabs, best, bubbles: [],
      rays: dark < 0.55 ? Array.from({ length: 2 + ri(3) }, () => ({ x: r() * W, w: 2 + ri(4), ph: r() * 6.3 })) : [],
      rares: Array.from({ length: Math.min(5, rares) }, () => ({ x: ri(W), y: 2 + ri(H - 4), ph: r() * 6.3 })),
      glows: Array.from({ length: depth > 500 ? 3 + Math.min(6, Math.round(Math.log10(depth) - 2) * 2) : 0 }, () => ({ x: Math.round(W * 0.5 + r() * W * 0.48), y: 2 + ri(H - 4), ph: r() * 6.3, c: r() < 0.2 ? '210,120,255' : '110,240,255' })),
      beam: dark > 0.7 ? { ph: r() * 6.3, sp: 0.3 + r() * 0.3 } : null,
    };
  }
  function drawRow(S, t, dt) {
    const g = S.g, W = S.W, H = S.H, T = t * S.pace, mv = dt * 4 * S.pace, wrap = (x) => (x + W * 2) % W;
    g.putImageData(S.bg, 0, 0);
    // Light coming down through shallow water, in shafts that drift and breathe.
    for (const ry of S.rays) {
      g.fillStyle = S.light; g.globalAlpha = 0.07 + 0.05 * Math.sin(T * 0.7 + ry.ph);
      const x0 = ry.x + Math.sin(T * 0.15 + ry.ph) * 6;
      for (let y = 0; y < H; y++) g.fillRect(Math.round(x0 + y * 0.6), y, ry.w + (y >> 2), 1);
    }
    // Light rippling across the surface.
    g.fillStyle = S.light; g.globalAlpha = S.lightA;
    for (let x = 0; x < W; x++) if (Math.sin(x * 0.35 + T * 2.2) + Math.sin(x * 0.13 - T * 1.3) > 1.2) g.fillRect(x, 1 + ((x * 7) % 3 === 0 ? 1 : 0), 1, 1);
    g.globalAlpha = 1;
    // Weed, reeds and kelp swaying; roots hanging from the surface; anemones waving.
    for (const f of S.flora) {
      g.fillStyle = f.c;
      const fl = S.fy[Math.max(0, Math.min(W - 1, f.x))];
      if (f.kind === 'root') { for (let k = 0; k < f.h; k++) g.fillRect(f.x + Math.round(Math.sin(k * 0.8 + f.ph) * 0.6), k, 1, 1); continue; }
      if (f.kind === 'anem') { for (let k = -1; k <= 1; k++) g.fillRect(f.x + k + Math.round(Math.sin(T * 1.6 + f.ph + k) * 0.6), fl - 2 + Math.abs(k), 1, 1); g.fillRect(f.x, fl - 1, 1, 1); continue; }
      const sw = f.kind === 'reed' ? 0.25 : f.kind === 'kelp' ? 0.7 : 0.4;
      for (let k = 0; k < f.h; k++) { const y = fl - 1 - k; if (y < 0) break; g.fillRect(f.x + Math.round(Math.sin(T * 1.2 + f.ph + k * 0.4) * k * sw * 0.35), y, 1, 1); }
      if (f.kind === 'reed' && fl - f.h < 1) { g.fillStyle = '#8a5a2a'; g.fillRect(f.x + Math.round(Math.sin(T * 1.2 + f.ph + f.h * 0.4) * f.h * 0.09), 0, 1, 2); } // (its seed head, above the water)
    }
    // Crabs scuttling along the floor.
    for (const c of S.crabs) {
      c.x = wrap(c.x + c.v * mv * (Math.sin(T * 0.8 + c.ph) > -0.3 ? 1 : 0));
      const x = Math.round(c.x), fl = S.fy[Math.max(0, Math.min(W - 1, x))];
      g.fillStyle = c.c; g.fillRect(x - 1, fl - 1, 3, 1); g.fillRect(x - 2 + (((T * 6) | 0) & 1), fl - 2, 1, 1); g.fillRect(x + 2 - (((T * 6) | 0) & 1), fl - 2, 1, 1);
    }
    // Fish.
    for (const f of S.fish) {
      f.x = wrap(f.x + f.v * mv);
      const x = Math.round(f.x), y = Math.round(f.y + Math.sin(T * 2 + f.ph) * 0.8), d = f.v > 0 ? 1 : -1;
      g.fillStyle = f.c;
      if (f.kind === 'school') {
        for (let k = 0; k < f.n; k++) g.fillRect(wrap(x - d * (k * 2 + 1) + Math.round(Math.sin(T * 1.5 + f.sp + k) * 1.2)) | 0, y + Math.round(Math.sin(T * 2 + k * 1.7 + f.sp) * 1.6) + (k % 3) - 1, 1, 1);
      } else if (f.kind === 'koi') {
        g.fillRect(d > 0 ? x - 3 : x, y, 4, 1); g.fillRect(d > 0 ? x - 4 : x + 4, y + (Math.sin(T * 6 + f.ph) > 0 ? -1 : 0), 1, 1);
        g.fillStyle = f.spot; g.fillRect(x - d, y, 1, 1);
      } else if (f.kind === 'eel') {
        for (let k = 0; k < 6; k++) g.fillRect(wrap(x - d * k) | 0, y + Math.round(Math.sin(T * 3 + f.ph - k * 0.9) * 0.7), 1, 1);
      } else {
        const len = f.big ? 3 : 2;
        g.fillRect(d > 0 ? x - len + 1 : x, y, len, f.big ? 2 : 1);
        g.fillRect(d > 0 ? x - len : x + len, y + (f.big && Math.sin(T * 6 + f.ph) > 0 ? 1 : 0), 1, 1); // (its tail)
      }
    }
    // Jellies, pulsing up and sinking back.
    for (const j of S.jellies) {
      const pulse = Math.sin(T * 1.8 + j.ph), y = Math.round(j.y + Math.sin(T * 0.4 + j.ph) * 2), x = Math.round(j.x + Math.sin(T * 0.2 + j.ph) * 3);
      g.fillStyle = j.c; g.globalAlpha = 0.85; g.fillRect(x - (pulse > 0 ? 1 : 0), y, pulse > 0 ? 3 : 2, 1); g.globalAlpha = 0.5;
      g.fillRect(x - 1, y + 1, 1, 1); g.fillRect(x + 1, y + 1 + (pulse > 0 ? 1 : 0), 1, 1); g.globalAlpha = 1;
    }
    // Its best find, a bright one gliding through.
    if (S.best) {
      const b = S.best; b.x = wrap(b.x + b.v * mv);
      const x = Math.round(b.x), y = Math.round(b.y + Math.sin(T * 1.5 + b.ph)), d = b.v > 0 ? 1 : -1;
      g.fillStyle = b.c; g.fillRect(d > 0 ? x - 3 : x, y, 4, 2); g.fillRect(d > 0 ? x - 4 : x + 4, y - (Math.sin(T * 5) > 0 ? 1 : 0), 1, 2);
      if (Math.sin(T * 3 + b.ph) > 0.5) { g.fillStyle = '#ffffff'; g.fillRect(x + (d > 0 ? 0 : 1), y - 1, 1, 1); }
    }
    // Lily pads on the surface, bobbing.
    for (const pd of S.pads) {
      const x = Math.round(pd.x + Math.sin(T * 0.3 + pd.ph) * 1.5);
      g.fillStyle = '#2f8f5f'; g.fillRect(x, 0, pd.w, 1); g.fillStyle = '#1f6b4a'; g.fillRect(x + 1, 1, Math.max(1, pd.w - 1), 1);
      if (pd.bloom) { g.fillStyle = '#ff8ac8'; g.fillRect(x + 1, 0, 1, 1); }
    }
    // Bubbles, in a lively pond.
    if (S.lively && Math.random() < dt * 3) { const x = Math.random() * W | 0; S.bubbles.push({ x, y: S.fy[x] - 1 }); }
    g.fillStyle = 'rgba(220,255,255,0.7)';
    for (let i = S.bubbles.length - 1; i >= 0; i--) { const b = S.bubbles[i]; b.y -= dt * 8; if (b.y < 0) { S.bubbles.splice(i, 1); continue; } g.fillRect(Math.round(b.x + Math.sin(b.y)), Math.round(b.y), 1, 1); }
    // The deep side of a deep pond going dark.
    if (S.dark > 0.05) {
      // (A very deep one is dim all along, and black at its far end.)
      const dg = g.createLinearGradient(0, 0, W, 0); dg.addColorStop(0, `rgba(0,0,0,${(0.55 * S.dark * S.dark).toFixed(2)})`); dg.addColorStop(0.3, `rgba(0,0,0,${(0.6 * S.dark * S.dark).toFixed(2)})`); dg.addColorStop(1, `rgba(0,0,0,${(0.2 + 0.78 * S.dark).toFixed(2)})`);
      g.fillStyle = dg; g.fillRect(0, 0, W, H);
    }
    // In the very deep: a beam sweeping the dark, and things glowing there. Rares glint.
    if (S.beam) {
      const a = Math.sin(T * S.beam.sp + S.beam.ph), cx = W * 0.82, x1 = cx + a * W * 0.4;
      g.fillStyle = 'rgba(200,250,255,0.16)';
      for (let y = 0; y < H; y++) { const x = Math.round(cx + (x1 - cx) * (y / H)); g.fillRect(x - 1 - (y >> 3), y, 3 + (y >> 2), 1); }
      g.fillStyle = 'rgba(230,255,255,0.9)'; g.fillRect(Math.round(cx), 0, 1, 1);
    }
    for (const q of S.glows) { const a = 0.5 + 0.5 * Math.sin(t * 1.5 + q.ph); g.fillStyle = `rgba(${q.c},${a.toFixed(2)})`; g.fillRect(q.x, q.y, 1, 1); }
    for (const rr of S.rares) if (Math.sin(t * 3 + rr.ph) > 0.4) { g.fillStyle = '#fff0a0'; g.fillRect(rr.x, rr.y, 1, 1); }
  }

  // ---- the loop, and the messages that steer it -------------------------------------------------------------
  // init {canvas, w, h, still}, size {w, h}, poke {x, y, r, d} (page pixels), rows {rows: [{canvas, p}]},
  // rowsOn {on}, hidden {on}, stop.
  function host() {
    let water = null, rows = [], rowsOn = true, hidden = false, stopped = false, still = false, rowT = 0, rowLast = 0, queued = false, rowsDirty = false;
    const later = typeof requestAnimationFrame === 'function' ? (f) => requestAnimationFrame(f) : (f) => setTimeout(() => f(performance.now()), 16);
    function tick(now) {
      queued = false;
      if (stopped || hidden) return;
      if (water) water.frame(now);
      if (rowsOn && rows.length && (still ? rowsDirty : now - rowLast >= 66)) {
        const dt = rowLast ? Math.min(0.2, (now - rowLast) / 1000) : 0.066;
        rowLast = now; rowT += still ? 0 : dt; rowsDirty = false;
        for (const S of rows) drawRow(S, rowT, still ? 0 : dt);
      }
      if (!still) go();
    }
    const go = () => { if (!queued && !stopped && !hidden) { queued = true; later(tick); } };
    return function handle(m) {
      switch (m.type) {
        case 'init': still = !!m.still; water = makeWater(m.canvas, still); water.size(m.w, m.h); break;
        case 'size': if (water) water.size(m.w, m.h); break;
        case 'poke': if (water) water.poke(m.x, m.y, m.r, m.d); break;
        case 'rows': rows = m.rows.map((q) => rowScene(q.canvas, q.p)); rowsDirty = true; break;
        case 'rowsOn': rowsOn = !!m.on; rowsDirty = true; break;
        case 'hidden': hidden = !!m.on; break;
        case 'stop': stopped = true; rows = []; water = null; if (typeof close === 'function' && typeof document === 'undefined') close(); return;
        default: return;
      }
      go();
    };
  }
  if (typeof document === 'undefined') { const handle = host(); self.onmessage = (e) => handle(e.data); }
  else self.EntryWater = { host };
})();
