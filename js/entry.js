'use strict';
// The entry screen's controller (index.html #entry). Loaded first, as its own file: the site's
// Content-Security-Policy allows no inline scripts.
// It draws its own night pond (the real one stays hidden behind the screen until you enter), shows loading
// on the Enter button, and fills the Ponds, High scores and sign-in parts from the server. main.js calls
// Entry.status while it loads and Entry.ready when the pond is ready.
(() => {
  const $ = (id) => document.getElementById(id), root = $('entry');
  if (!root) return;
  root.classList.add('live'); // (so the stylesheet's own fallback fade never runs)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let skip = false;
  try { skip = localStorage.getItem('pond.skipEntry') === '1'; } catch { /* no storage */ }

  // ---- the night pond: posterized, dithered water, koi, pads, rain rings and fireflies ------------------
  const cv = $('entry-bg'), g = cv.getContext('2d', { alpha: false });
  const WATER = [0x1a0a05, 0x2a1008, 0x3d170b, 0x52200f, 0x6a2c14, 0x88401c, 0xa65a2a, 0xc88a4f].map((bgr) => bgr | 0xff000000); // (ABGR: deep navy to teal light)
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
  const KOI = [['#f26b2a', '#fff4e0', '#b8401a'], ['#fff4e0', '#e8402a', '#c9b8a0'], ['#ffc53a', '#fff4e0', '#c88a1a'], ['#f04a5a', '#1a1420', '#a82a3a'], ['#fff4e0', '#1a1420', '#c9b8a0']];
  let W = 0, H = 0, S = 4, img = null, px = null, radial = null, t = 0, last = 0, raf = 0, nextDrop = 0;
  const rings = [], fish = [], pads = [], flies = [], stars = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function size() {
    S = innerWidth < 700 ? 3 : 4;
    W = Math.ceil(innerWidth / S); H = Math.ceil(innerHeight / S);
    cv.width = W; cv.height = H;
    img = g.createImageData(W, H); px = new Uint32Array(img.data.buffer);
    radial = new Float32Array(W * H);
    const cx = W * 0.62, cy = H * 0.45;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) radial[x + y * W] = Math.hypot(x - cx, (y - cy) * 1.3);
    fish.length = pads.length = flies.length = stars.length = 0;
    const n = Math.max(4, Math.min(9, Math.round(W * H / 5000)));
    for (let i = 0; i < n; i++) {
      fish.push({ c: KOI[i % KOI.length], len: rnd(9, 15) * (S === 3 ? 0.9 : 1), ax: rnd(0.25, 0.45) * W, ay: rnd(0.2, 0.38) * H, cx: rnd(0.3, 0.7) * W, cy: rnd(0.3, 0.7) * H,
        fx: rnd(0.012, 0.03) * (Math.random() < 0.5 ? -1 : 1), fy: rnd(0.015, 0.035), p: rnd(0, 6.3), q: rnd(0, 6.3) });
    }
    for (let i = 0; i < Math.round(W * H / 3500); i++) {
      // Pads keep to the edges, clear of the title and the panel's middle.
      const edge = Math.random() < 0.5, x = edge ? rnd(0, W) : (Math.random() < 0.5 ? rnd(0, W * 0.12) : rnd(W * 0.88, W)), y = edge ? (Math.random() < 0.5 ? rnd(0, H * 0.14) : rnd(H * 0.86, H)) : rnd(0, H);
      pads.push({ x, y, r: rnd(5, 11), a: rnd(0, 6.3), s: rnd(-0.05, 0.05), bloom: Math.random() < 0.3 });
    }
    for (let i = 0; i < 18; i++) flies.push({ x: rnd(0, W), y: rnd(0, H), vx: 0, vy: 0, p: rnd(0, 6.3) });
    for (let i = 0; i < 40; i++) stars.push({ x: rnd(0, W) | 0, y: rnd(0, H) | 0, p: rnd(0, 6.3) });
  }
  function drop(x, y, big) { rings.push({ x, y, r: 0, life: big ? 1.6 : rnd(0.8, 1.3), v: big ? 26 : rnd(12, 20), a: 1 }); if (rings.length > 30) rings.shift(); }
  let light = null;
  function water() {
    if (!light || light.length !== W * H) light = new Float32Array(W * H);
    const cols = new Float32Array(W), rows = new Float32Array(H), diag = new Float32Array(W + H);
    for (let x = 0; x < W; x++) cols[x] = Math.sin(x * 0.075 + t * 0.6) * 0.8;
    for (let y = 0; y < H; y++) rows[y] = Math.sin(y * 0.11 - t * 0.45) * 0.8;
    for (let k = 0; k < W + H; k++) diag[k] = Math.sin(k * 0.05 + t * 0.35);
    for (let y = 0; y < H; y++) {
      const row = y * W, fade = 0.55 + 0.45 * Math.sin((y / H) * Math.PI); // (darker at the top and bottom)
      for (let x = 0; x < W; x++) {
        const i = row + x;
        // Caustic lines: bright where the waves cancel.
        const v = 1 - Math.abs(cols[x] + rows[y] + diag[x + y] + Math.sin(radial[i] * 0.16 - t * 0.9) * 0.6) * 0.42;
        light[i] = v * v * v * fade * 0.9;
      }
    }
    // Rain rings light only the pixels near each ring.
    for (const r of rings) {
      const R = r.r + 3, x0 = Math.max(0, Math.floor(r.x - R)), x1 = Math.min(W - 1, Math.ceil(r.x + R)), y0 = Math.max(0, Math.floor(r.y - R / 1.25)), y1 = Math.min(H - 1, Math.ceil(r.y + R / 1.25));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.abs(Math.hypot(x - r.x, (y - r.y) * 1.25) - r.r);
        if (d < 2.2) light[x + y * W] += (2.2 - d) * 0.32 * r.a;
      }
    }
    const top = WATER.length - 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = x + y * W, k = Math.floor(light[i] * WATER.length + BAYER[(x & 3) + ((y & 3) << 2)] * 1.1);
      px[i] = WATER[k < 0 ? 0 : k > top ? top : k];
    }
    for (const s of stars) {
      const tw = Math.sin(t * 1.7 + s.p);
      if (tw > 0.55) px[s.x + s.y * W] = tw > 0.9 ? 0xfffff4e8 : 0xffd8c0a0;
    }
    g.putImageData(img, 0, 0);
  }
  function koi(f) {
    // Its head swims a slow loop; the body trails back along its heading, rippling as it swims.
    const wx = f.fx * 6.28, wy = f.fy * 6.28, hx = f.cx + Math.sin(t * wx + f.p) * f.ax, hy = f.cy + Math.sin(t * wy + f.q) * f.ay;
    const vx = Math.cos(t * wx + f.p) * f.ax * wx, vy = Math.cos(t * wy + f.q) * f.ay * wy, vl = Math.hypot(vx, vy) || 1;
    const dx = vx / vl, dy = vy / vl, n = Math.max(8, Math.round(f.len)), w = f.len / 5, pts = [];
    for (let i = 0; i < n; i++) {
      const k = i / n, sway = Math.sin(t * 5 + f.p - k * 4) * k * w * 0.9;
      pts.push([hx - dx * i + -dy * sway, hy - dy * i + dx * sway, Math.max(0.5, w * (k < 0.15 ? 0.75 + k * 1.6 : 1 - (k - 0.15) * 1.05))]);
    }
    const [body, spot, fin] = f.c, box = (x, y, r) => g.fillRect(Math.round(x - r), Math.round(y - r), Math.max(1, Math.round(r * 2)), Math.max(1, Math.round(r * 2)));
    g.fillStyle = 'rgba(2,4,12,0.45)';
    for (const [x, y, r] of pts) box(x + 2, y + 3, r);
    // Fins, tail, body, spots, eyes.
    const [fx, fy] = pts[Math.round(n * 0.3)], fl = w * 1.6;
    g.fillStyle = fin;
    box(fx - dy * fl, fy + dx * fl, w * 0.45); box(fx + dy * fl, fy - dx * fl, w * 0.45);
    const [tx, ty] = pts[n - 1], wag = Math.sin(t * 5 + f.p - 4) * w;
    box(tx - dx * 1.5 - dy * wag, ty - dy * 1.5 + dx * wag, w * 0.55);
    g.fillStyle = body;
    for (let i = n - 1; i >= 0; i--) box(pts[i][0], pts[i][1], pts[i][2]);
    g.fillStyle = spot;
    for (const k of [0.35, 0.6]) { const [x, y, r] = pts[Math.round(n * k)]; box(x, y, r * 0.6); }
    g.fillStyle = '#1a1420';
    g.fillRect(Math.round(hx - dy * w * 0.5), Math.round(hy + dx * w * 0.5), 1, 1);
    g.fillRect(Math.round(hx + dy * w * 0.5), Math.round(hy - dx * w * 0.5), 1, 1);
    if (Math.random() < 0.002 && !still) drop(hx, hy, false); // (a koi nosing the surface)
  }
  function pad(p) {
    const a = p.a + t * p.s, r = p.r, notch = 0.45;
    g.fillStyle = 'rgba(2,4,12,0.4)';
    g.beginPath(); g.arc(p.x + 2, p.y + 3, r, 0, 6.29); g.fill();
    g.fillStyle = '#1f6b4a';
    g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, r, a + notch, a + 6.283 - notch); g.closePath(); g.fill();
    g.fillStyle = '#2f8f5f';
    g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, r * 0.65, a + notch + 0.4, a + 3.3); g.closePath(); g.fill();
    if (p.bloom) {
      const bx = Math.round(p.x - r * 0.3), by = Math.round(p.y - r * 0.2);
      g.fillStyle = '#ff8ac8'; g.fillRect(bx - 2, by, 5, 1); g.fillRect(bx, by - 2, 1, 5); g.fillRect(bx - 1, by - 1, 3, 3);
      g.fillStyle = '#ffe0f0'; g.fillRect(bx, by, 1, 1);
    }
  }
  function frame(now) {
    raf = 0;
    if (!root.isConnected || root.classList.contains('gone')) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    if (now - last < 33 && last) { raf = requestAnimationFrame(frame); return; } // (30 frames a second is plenty)
    last = now; t += dt;
    if (t > nextDrop && !still) { drop(rnd(0, W), rnd(0, H), false); nextDrop = t + rnd(0.4, 1.4); }
    for (const r of rings) { r.r += r.v * dt; r.a = Math.max(0, 1 - r.r / (r.v * r.life)); }
    while (rings.length && rings[0].a <= 0) rings.shift();
    water();
    for (const f of fish) koi(f);
    for (const p of pads) pad(p);
    for (const f of flies) {
      f.vx = (f.vx + rnd(-4, 4) * dt) * 0.98; f.vy = (f.vy + rnd(-4, 4) * dt) * 0.98;
      f.x = (f.x + f.vx * dt * 6 + W) % W; f.y = (f.y + f.vy * dt * 6 + H) % H;
      const glow = Math.sin(t * 2.2 + f.p);
      if (glow > -0.2) {
        g.fillStyle = `rgba(255,224,120,${0.15 + glow * 0.12})`; g.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 3, 3);
        g.fillStyle = glow > 0.5 ? '#fff4b0' : '#ffd166'; g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
      }
    }
    if (!still && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
  size();
  if (still) { t = 4; frame(performance.now()); } else start();
  addEventListener('resize', () => { if (!root.isConnected) return; size(); if (still) frame(performance.now()); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !still) start(); });
  root.addEventListener('pointerdown', (e) => { if (e.target === root || e.target === cv) drop(e.clientX / S, e.clientY / S, true); });

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
  function done() {
    if (!root.isConnected || root.classList.contains('gone') || !root.classList.contains('ready')) return;
    try { localStorage.setItem('pond.skipEntry', $('entry-skip').checked ? '1' : '0'); } catch { /* no storage */ }
    root.classList.add('gone');
    setTimeout(() => root.remove(), 700);
    document.removeEventListener('keydown', key, true);
    if (window.Entry.onDone) window.Entry.onDone();
  }
  // Enter or Escape goes in, unless Enter is meant for a link, tab or question that has the focus.
  function key(e) {
    if (!root.classList.contains('ready')) return;
    const el = document.activeElement, own = el && el !== document.body && el !== root && el !== $('entry-enter') && root.contains(el);
    if (e.key === 'Escape' || (e.key === 'Enter' && !own)) { e.preventDefault(); e.stopPropagation(); done(); }
  }
  $('entry-enter').addEventListener('click', done);

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
