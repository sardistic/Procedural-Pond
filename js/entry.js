'use strict';
// The entry screen's controller (index.html #entry). Loaded first, as its own file: the site's
// Content-Security-Policy allows no inline scripts.
// It draws its own rippling night pond (the real one stays hidden behind the screen until you enter), shows loading
// on the Enter button, and fills the Ponds, High scores and sign-in parts from the server. main.js calls
// Entry.status while it loads and Entry.ready when the pond is ready.
(() => {
  const $ = (id) => document.getElementById(id), root = $('entry');
  if (!root) return;
  root.classList.add('live'); // (so the stylesheet's own fallback fade never runs)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let skip = false;
  try { skip = localStorage.getItem('pond.skipEntry') === '1'; } catch { /* no storage */ }

  // ---- the night pond: a rippling surface over a pixel floor ---------------------------------------------
  // A height field carries every disturbance outward as real ripples (rain, koi, your pointer); looking down
  // through it, the floor is bent by the surface's slope, light gathers where it curves, and the moon catches
  // the faces of the waves. Koi swim on the floor layer, so they wobble under the ripples; pads float on top.
  const cv = $('entry-bg'), g = cv.getContext('2d', { alpha: false });
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
  // (Colours as ABGR words, the way the canvas's bytes read.)
  const abgr = (hex) => { const n = parseInt(hex.slice(1), 16); return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; };
  const KOI = [['#f26b2a', '#fff4e0', '#b8401a'], ['#fff4e0', '#e8402a', '#c9b8a0'], ['#ffc53a', '#fff4e0', '#c88a1a'], ['#f04a5a', '#2a2030', '#a82a3a'], ['#fff4e0', '#2a2030', '#c9b8a0'], ['#e8e0ff', '#7a8aff', '#b0a8d8']];
  let W = 0, H = 0, S = 4, img = null, px = null, base = null, under = null, cur = null, prev = null, t = 0, last = 0, raf = 0, nextDrop = 0, acc = 0;
  const fish = [], pads = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  // Value noise for the floor.
  const hash = (x, y) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const smooth = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v; };
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
  function size() {
    S = innerWidth < 700 ? 3 : 4;
    W = Math.ceil(innerWidth / S); H = Math.ceil(innerHeight / S);
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
  const darken = (c, f) => (0xff000000 | ((((c >>> 16) & 255) * f) << 16) | ((((c >>> 8) & 255) * f) << 8) | ((c & 255) * f)) >>> 0;
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
        const step = Math.max(-2, Math.min(3, Math.floor(lit * 2.8 + b)));
        if (step > 0) {
          const a = step * 34, cr = c & 255, cg = (c >> 8) & 255, cb = (c >>> 16) & 255;
          c = (0xff000000 | ((cb + (((0xd8 - cb) * a) >> 8)) << 16) | ((cg + (((0xd0 - cg) * a) >> 8)) << 8) | (cr + (((0x90 - cr) * a) >> 8))) >>> 0;
        } else if (step < 0) c = darken(c, step === -1 ? 0.8 : 0.62);
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
  function frame(now) {
    raf = 0;
    if (!root.isConnected || root.classList.contains('gone')) return;
    if (now - last < 33 && last) { raf = requestAnimationFrame(frame); return; } // (30 frames a second is plenty)
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 30;
    last = now; t += dt;
    if (t > nextDrop && !still) { poke(rnd(2, W - 2), rnd(2, H - 2), rnd(1.2, 2.2), rnd(5, 9)); nextDrop = t + rnd(0.25, 1.1); }
    // The waves run at a fixed pace (two steps a frame at 30 fps), whatever the frame rate.
    acc = Math.min(acc + dt * 60, 4);
    while (acc >= 1) { step(); acc -= 1; }
    under.set(base);
    for (const f of fish) koi(f);
    water();
    for (const p of pads) pad(p);
    if (!still && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
  size();
  if (still) { t = 4; for (let i = 0; i < 6; i++) poke(rnd(0, W), rnd(0, H), 2, 8); for (let i = 0; i < 40; i++) step(); frame(performance.now()); } else start();
  addEventListener('resize', () => { if (!root.isConnected) return; size(); if (still) { last = 0; frame(performance.now()); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !still) start(); });
  // Your pointer trails ripples across the water; a click drops a big one.
  let lastPoke = 0;
  root.addEventListener('pointermove', (e) => { if (still || (e.target !== root && e.target !== cv) || e.timeStamp - lastPoke < 30) return; lastPoke = e.timeStamp; poke(e.clientX / S, e.clientY / S, 1.6, 2.2); });
  root.addEventListener('pointerdown', (e) => { if (e.target === root || e.target === cv) { poke(e.clientX / S, e.clientY / S, 3, 16); if (still) { last = 0; frame(performance.now()); } } });

  // ---- loading, shown on the Enter button --------------------------------------------------------------
  let loaded = 0, phase = 0;
  document.addEventListener('load', (e) => {
    if (phase || !e.target || e.target.tagName !== 'SCRIPT') return;
    loaded++;
    const total = Math.max(60, document.querySelectorAll('script[src]').length);
    set(null, 0.05 + 0.55 * Math.min(1, loaded / total));
  }, true);
  function set(text, p) {
    if (text) $('entry-status').textContent = text;
    if (p != null) {
      $('entry-bar').style.transform = `scaleX(${Math.max(0.04, Math.min(1, p))})`;
      if (!root.classList.contains('ready')) $('entry-label').textContent = `Loading ${Math.round(Math.min(1, p) * 100)}%`;
    }
  }
  let choose = null, waterPick = null;
  function pickWater(k) {
    waterPick = k;
    for (const b of root.querySelectorAll('[data-water]')) b.setAttribute('aria-pressed', String(b.dataset.water === k));
  }
  for (const b of root.querySelectorAll('[data-water]')) b.addEventListener('click', () => pickWater(b.dataset.water));
  $('entry-another').addEventListener('click', () => {
    const open = $('entry-choose').hidden;
    $('entry-choose').hidden = !open;
    $('entry-another').setAttribute('aria-expanded', String(open));
    if (open) root.querySelector('[data-water][aria-pressed="true"]')?.focus();
  });
  $('entry-create').addEventListener('click', () => done(true));
  // Enter with a new pond's choices applies them; Create makes another pond with them.
  function done(create) {
    if (!root.isConnected || root.classList.contains('gone') || !root.classList.contains('ready')) return;
    if (choose && choose.apply && (choose.fresh || create === true)) {
      try { choose.apply({ habitat: waterPick || choose.habitat, hard: $('entry-hard').checked, create: create === true }); } catch (e) { console.error(e); }
    }
    try { localStorage.setItem('pond.skipEntry', $('entry-skip').checked ? '1' : '0'); } catch { /* no storage */ }
    root.classList.add('gone');
    songStop(1.2); // (the music fades as you go in)
    // A splash as you dive in, if there's sound (the music on here, or the pond's sound switch).
    let pondSound = false;
    try { pondSound = !!JSON.parse(localStorage.getItem('procedural-pond.opts') || '{}').sound; } catch { /* no storage */ }
    if (songWanted || pondSound) { try { const a = new Audio('audio/sfx/ui_enter.mp3'); a.volume = 0.35; a.play().catch(() => {}); } catch { /* no audio */ } }
    setTimeout(() => root.remove(), 700);
    document.removeEventListener('keydown', key, true);
    if (window.Entry.onDone) window.Entry.onDone();
  }
  // Enter or Escape goes in, unless Enter is meant for a link, tab or question that has the focus. (Escape first
  // closes the brains diagram, if it's open.)
  function key(e) {
    if (e.key === 'Escape' && !$('entry-brains').hidden) { e.preventDefault(); e.stopPropagation(); closeBrains(); return; }
    if (!root.classList.contains('ready')) return;
    const el = document.activeElement, own = el && el !== document.body && el !== root && el !== $('entry-enter') && root.contains(el);
    if (e.key === 'Escape' || (e.key === 'Enter' && !own)) { e.preventDefault(); e.stopPropagation(); done(false); }
  }
  $('entry-enter').addEventListener('click', () => done(false));

  // ---- the brains diagram (from the FAQ) ----------------------------------------------------------------
  let brainsFrom = null;
  function closeBrains() { $('entry-brains').hidden = true; if (brainsFrom) brainsFrom.focus(); }
  $('entry-brains-open').addEventListener('click', (e) => { brainsFrom = e.currentTarget; $('entry-brains').hidden = false; $('entry-brains-close').focus(); });
  $('entry-brains-close').addEventListener('click', closeBrains);
  $('entry-brains').addEventListener('click', (e) => { if (e.target === $('entry-brains')) closeBrains(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.isConnected && !$('entry-brains').hidden && !root.classList.contains('ready')) { e.preventDefault(); closeBrains(); } }, true);

  // ---- music: the whole of Subdued Progression, quietly, while you're here --------------------------------
  // Its seventeen pieces (audio/music/) played back to back with no gap, looping, through a low gain. Sound needs
  // a click first, so a remembered "on" starts at the first click or key; entering fades it out.
  const SONG = { ctx: null, gain: null, on: false, files: null, next: 0, at: 0, timer: 0, sources: [] };
  const SONG_LEVEL = 0.16;
  function soundLabel() { const b = $('entry-sound'); b.textContent = SONG.on ? '♪ Music on' : '♪ Music off'; b.setAttribute('aria-pressed', String(SONG.on)); }
  async function songFiles() {
    if (SONG.files) return SONG.files;
    const m = await fetch('audio/music.json', { cache: 'force-cache' }).then((r) => r.json());
    SONG.files = m.files.filter((f) => f.track === 'subdued-progression').sort((a, b) => a.n - b.n).map((f) => ({ url: `audio/music/${f.f}`, dur: f.atoms.reduce((a, x) => a + x.dur, 0) }));
    return SONG.files;
  }
  // Keep about twenty seconds queued: fetch and decode the next piece, start it exactly where the last one ends.
  async function songQueue() {
    if (!SONG.on || !SONG.ctx) return;
    const files = await songFiles();
    while (SONG.on && SONG.at - SONG.ctx.currentTime < 20) {
      const f = files[SONG.next % files.length];
      let buf;
      try { buf = await SONG.ctx.decodeAudioData(await fetch(f.url, { cache: 'force-cache' }).then((r) => r.arrayBuffer())); } catch { return; }
      if (!SONG.on) return;
      const src = SONG.ctx.createBufferSource();
      src.buffer = buf; src.connect(SONG.gain);
      const at = Math.max(SONG.at, SONG.ctx.currentTime + 0.05);
      src.start(at, 0, f.dur); // (each piece to its measured length, so the beat stays on the grid)
      SONG.sources.push(src); src.onended = () => { SONG.sources = SONG.sources.filter((s) => s !== src); };
      SONG.at = at + f.dur; SONG.next++;
    }
  }
  function songStart() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!SONG.ctx) {
      SONG.ctx = new AC(); SONG.gain = SONG.ctx.createGain(); SONG.gain.gain.value = 0;
      const lp = SONG.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; // (low and soft: it sits under the screen)
      SONG.gain.connect(lp).connect(SONG.ctx.destination);
    }
    if (SONG.ctx.state === 'suspended') SONG.ctx.resume();
    SONG.on = true;
    SONG.gain.gain.cancelScheduledValues(SONG.ctx.currentTime);
    SONG.gain.gain.setTargetAtTime(SONG_LEVEL, SONG.ctx.currentTime, 1.2);
    songQueue();
    clearInterval(SONG.timer); SONG.timer = setInterval(songQueue, 5000);
    return true;
  }
  function songStop(fade = 0.6) {
    SONG.on = false; clearInterval(SONG.timer);
    if (!SONG.ctx) return;
    const t = SONG.ctx.currentTime;
    SONG.gain.gain.cancelScheduledValues(t); SONG.gain.gain.setTargetAtTime(0, t, fade);
    const left = SONG.sources.slice(); SONG.sources = [];
    setTimeout(() => { for (const s of left) { try { s.stop(); } catch { /* already done */ } } SONG.at = 0; }, fade * 5000);
  }
  let songWanted = false;
  try { songWanted = localStorage.getItem('pond.entryMusic') === '1'; } catch { /* no storage */ }
  $('entry-sound').addEventListener('click', () => {
    if (SONG.on) songStop(); else songStart();
    songWanted = SONG.on;
    try { localStorage.setItem('pond.entryMusic', SONG.on ? '1' : '0'); } catch { /* no storage */ }
    soundLabel();
  });
  // (Remembered on: it starts with the first click or key on the screen.)
  const wake = (e) => { if (!songWanted || SONG.on || !root.isConnected || e.target === $('entry-sound')) return; if (songStart()) soundLabel(); };
  root.addEventListener('pointerdown', wake); document.addEventListener('keydown', wake);
  soundLabel();

  // ---- tabs ---------------------------------------------------------------------------------------------
  const tabs = ['ponds', 'scores', 'faq'];
  function pick(k, focus) {
    for (const n of tabs) {
      const on = n === k, b = $(`et-${n}`);
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $(`ep-${n}`).hidden = !on;
      if (on && focus) b.focus();
    }
    try { localStorage.setItem('pond.entryTab', k); } catch { /* no storage */ }
  }
  tabs.forEach((n, i) => {
    $(`et-${n}`).addEventListener('click', () => pick(n));
    $(`et-${n}`).addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); pick(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });
  try { const k = localStorage.getItem('pond.entryTab'); if (tabs.includes(k)) pick(k); } catch { /* no storage */ }

  // ---- the server's parts: public ponds, high scores, signing in ----------------------------------------
  const api = /^https?:$/.test(location.protocol) ? '/api' : null;
  const getJson = (path) => fetch(api + path, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const pondName = (p) => p.title || String(p.slug || p.id).split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const WATERS = { fresh: 'fresh', salt: 'salt', mixed: 'brackish' };
  const ago = (ms) => { const m = Math.max(0, (Date.now() - ms) / 60000); return m < 60 ? `${Math.max(1, Math.round(m))}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
  function row(p, rank, score, meta) {
    const li = node('li'), a = node('a');
    a.href = `/${p.slug || p.id}`;
    a.append(node('span', 'rk', rank), node('span', 'nm', pondName(p)), node('span', 'sc', score), node('span', 'meta', meta));
    li.append(a);
    return li;
  }
  const facts = (p) => [p.by ? `by ${p.by}` : null, p.habitat && WATERS[p.habitat] ? `${WATERS[p.habitat]} water` : null, p.animals != null ? `${p.animals} animals` : null, p.days != null ? `day ${Math.floor(p.days) + 1}` : null].filter(Boolean).join(' · ');
  let me = null, board = null;
  function renderPonds() {
    const box = $('ep-ponds'), out = [];
    if (me && me.user && me.ponds && me.ponds.length) {
      const ul = node('ul', 'list');
      for (const p of me.ponds.slice().sort((a, b) => b.updated - a.updated).slice(0, 6)) ul.append(row(p, '★', `${p.points} pts`, [p.habitat && WATERS[p.habitat] ? `${WATERS[p.habitat]} water` : null, `${p.animals} animals`, `day ${Math.floor(p.days || 0) + 1}`].filter(Boolean).join(' · ')));
      out.push(node('h2', null, 'Your ponds'), ul);
    }
    out.push(node('h2', null, board ? `Public ponds (${board.ponds})` : 'Public ponds'));
    if (!board) out.push(node('p', 'empty', api ? 'The pond list is unavailable right now.' : 'Public ponds show here on pond.nz.'));
    else if (!board.top.length) out.push(node('p', 'empty', 'No public ponds yet. Yours could be the first.'));
    else {
      const ul = node('ul', 'list');
      for (const p of board.top.slice().sort((a, b) => b.updated - a.updated).slice(0, 12)) ul.append(row(p, '›', ago(p.updated), facts(p)));
      out.push(ul);
    }
    box.replaceChildren(...out);
  }
  function renderScores() {
    const box = $('ep-scores');
    if (!board || !board.top.length) { box.replaceChildren(node('p', 'empty', !board ? (api ? 'The leaderboard is unavailable right now.' : 'High scores show here on pond.nz.') : 'No ponds on the leaderboard yet.')); return; }
    const ul = node('ol', 'list ranked');
    board.top.slice().sort((a, b) => b.points - a.points).slice(0, 15).forEach((p, i) => ul.append(row(p, String(i + 1), `${p.points.toLocaleString()} pts`, [`${p.depth} fathoms`, facts(p)].filter(Boolean).join(' · '))));
    box.replaceChildren(ul);
  }
  function renderAccount() {
    const box = $('entry-account');
    if (!me || !me.auth) { box.replaceChildren(); return; }
    if (!me.user) {
      const b = node('button', 'discord', 'Sign in with Discord');
      b.type = 'button';
      b.title = 'Keep your ponds in an account and carry on from any browser';
      b.addEventListener('click', () => location.assign(`${api}/auth/discord?back=${encodeURIComponent(location.pathname)}`));
      box.replaceChildren(b);
      return;
    }
    const who = node('span'), out = node('button', null, 'Sign out');
    who.append('Signed in as ', node('b', null, me.user.name));
    out.type = 'button';
    out.addEventListener('click', async () => {
      try { await fetch(`${api}/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}', credentials: 'same-origin' }); } catch { /* the session lapses anyway */ }
      me = { auth: true, user: null, ponds: [] };
      if (typeof Account !== 'undefined') { Account.user = null; Account.ponds = []; }
      renderAccount(); renderPonds();
    });
    box.replaceChildren(who, out);
  }
  if (api) {
    getJson('/board').then((b) => { board = b && Array.isArray(b.top) ? b : null; }).catch(() => {}).then(() => { renderPonds(); renderScores(); });
    getJson('/me').then((m) => { me = m; renderAccount(); renderPonds(); }).catch(() => {});
  } else { renderPonds(); renderScores(); }

  window.Entry = {
    status(text, p) { phase = 1; set(text, p); },
    // The pond is ready: the Enter button lights up (or straight in, if skipped or only visiting).
    ready(info) {
      set('Ready', 1);
      root.classList.add('ready');
      if (skip || info.skip) { done(); return; }
      const line = $('entry-pond');
      line.replaceChildren();
      if (info.name) line.append(info.lead || 'Your pond: ', node('b', null, info.name), info.facts ? ` · ${info.facts}` : '');
      if (info.blurb) line.append(node('div', null, info.blurb));
      const b = $('entry-enter');
      b.disabled = false;
      $('entry-label').textContent = info.button || 'Enter';
      choose = info.choose || null;
      if (choose) {
        pickWater(choose.habitat);
        $('entry-hard').checked = !!choose.hard;
        // New: the choices are for this pond, made when you enter. Returning: they make another pond, on request.
        $('entry-choose').hidden = !choose.fresh;
        $('entry-another').hidden = choose.fresh;
        $('entry-create').hidden = choose.fresh;
      }
      document.addEventListener('keydown', key, true);
      setTimeout(() => b.focus(), 50);
    },
    done,
    skipping: () => skip,
  };
  // Never strand anyone on the entry screen: if loading fails or stalls, offer the way in anyway.
  const rescue = (why) => { if (!root.isConnected || root.classList.contains('ready')) return;
    window.Entry.ready({ name: '', blurb: why, button: 'Enter anyway' }); };
  window.addEventListener('error', () => setTimeout(() => rescue('Something went wrong while the pond was loading. It may still work.'), 1500));
  setTimeout(() => rescue('The pond is taking a long time to load.'), 30000);
})();
