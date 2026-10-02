'use strict';
// On-screen HUD pieces outside the menu: the animal dock with its census and
// family trees, the journal, the sky tracker, and the score with the
// leaderboard. Loaded before main.js; main calls initHud() once, then hudTick()
// and updateSkyHud() every frame.

const byId = (id) => document.getElementById(id);

// One window at a time: opening one closes whichever other is open, and a click out in the pond
// closes it (the actions panel and the menu are tools, not windows, and stay).
const WINDOWS = [
  ['creature', () => hideCreature()], ['object', () => hideObject()], ['spawn-card', () => closeSpawnCard()], ['hatchery', () => setHatchery(false)],
  ['evo', () => setEvo(false)], ['census', () => setCensus(false)], ['wild', () => setWild(false)], ['paragons', () => setParagons(false)], ['log-panel', () => setJournal(false)], ['score-panel', () => setScore(false)], ['sky-panel', () => setSky(false)],
];
function closeWindows(except = null) {
  for (const [id, close] of WINDOWS) { const e = byId(id); if (id !== except && e && !e.hidden) close(); }
}
const clockLabel = (c) => `${String(Math.floor(c * 24)).padStart(2, '0')}:${String(Math.floor((c * 24 % 1) * 60)).padStart(2, '0')}`;
const ageLabel = (s) => `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;

// ---- pixel icons, drawn by the pond's own renderer -------------------------------------

const ICON_FADE = new Uint8Array(65536), ICON_CAUSTIC = new Float32Array(128 * 128);
const ICON_BOX = 20; // native pixels an icon is shrunk to fit, then shown at a whole-number scale
const ICON_CSS = 36; // largest on-screen size in CSS pixels
const iconCache = new Map();

function iconWorld() {
  return {
    W: 200, H: 200, t: 0, days: 0, clock: 0.5, darkness: 0, creatures: [], food: [], rocks: [], plants: [], pads: [],
    effects: [], eggs: [], journal: [], targets: {}, pointer: { inside: false, x: -999, y: -999 }, grab: null,
    current: { s: 0, x: 0, y: 0, angle: 0 }, weather: { rain: 0, gust: 0 }, tide: { level: 1, surf: 0 },
    opts: { habitat: 'mixed', life: false }, nearestFood: () => null,
  };
}

// Pose a creature diagonally in the middle of the icon raster; long bodies curl up.
function poseIcon(c, w, cx, cy) {
  const b = c.body;
  c.heading = -PI / 4; c.x = cx; c.y = cy;
  if (c.species === 'eel' || c.species === 'snake' || c.species === 'gulper' || c.species === 'leviathan') {
    const len = b.links.reduce((a, l) => a + l, 0), R = len / 5.5;
    let a = -PI;
    b.place(cx + Math.cos(a) * R, cy + Math.sin(a) * R, a + PI / 2);
    for (let k = 0; k < 160; k++) { a += 0.035; b.resolve(cx + Math.cos(a) * R, cy + Math.sin(a) * R, a + PI / 2); }
    c.x = b.x[0]; c.y = b.y[0]; c.heading = wrapAngle(a + PI / 2);
  } else if (c.place) c.place(cx, cy);
  else b.place(cx, cy, c.heading);
  if (c.footRest) for (const L of c.legs) [L.fx, L.fy] = c.footRest(L);
  c.update(0, w);
  ICON_AFTER[c.species]?.(c);
}

// Poses applied after the first update.
const ICON_AFTER = {
  // Tentacles trail outward from the bell rather than tucked beneath it.
  jelly: (c) => c.tents.forEach((ch, k) => {
    const a = k / 8 * TAU + c.spin;
    ch.place(c.x + Math.cos(a) * c.R * 0.7, c.y + Math.sin(a) * c.R * 0.7, a + PI);
  }),
};
// Some species look best in a particular variety; reroll the seed until we get it.
const ICON_PREFER = {
  axolotl: (c) => c.gill === PAL.axoGill,
  koi: () => true,
};

function rasterIcon(c, w) {
  poseIcon(c, w, 48, 48);
  return rasterDrawn(96, (r) => c.draw(r, 0, w));
}
// Draw something into an N×N raster and crop it to what was drawn.
function rasterDrawn(N, draw) {
  const r = new Raster(N, N);
  r.begin();
  draw(r);
  const out = new Uint32Array(N * N), clear = new Uint32Array(N * N);
  r.compose(out, {
    bg: clear, bgLight: clear, caustic: ICON_CAUSTIC, t: 0, outline: OUTLINE, emissive: EMISSIVE, fade: ICON_FADE,
    thick: THICK, anyThick: false, tint: null, caustics: false, shadows: false, outlines: true, fog: null, wob: null,
  });
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!(out[x + y * N] >>> 24)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { out, N, x0, y0, w: Math.max(1, x1 - x0 + 1), h: Math.max(1, y1 - y0 + 1) };
}

function iconImage(crop) {
  const cv = document.createElement('canvas');
  cv.width = crop.w; cv.height = crop.h;
  const img = new ImageData(crop.w, crop.h), px = new Uint32Array(img.data.buffer);
  for (let y = 0; y < crop.h; y++) {
    for (let x = 0; x < crop.w; x++) px[x + y * crop.w] = crop.out[crop.x0 + x + (crop.y0 + y) * crop.N];
  }
  cv.getContext('2d').putImageData(img, 0, 0);
  const k = clamp(Math.floor(ICON_CSS / Math.max(crop.w, crop.h)), 1, 6);
  return { src: cv.toDataURL(), w: crop.w * k, h: crop.h * k, nw: crop.w, nh: crop.h };
}

function fitIcon(c, f) {
  if (c.species === 'starfish') { c.len *= f; return true; }
  if (!SCALABLE.has(c.species)) return false;
  captureBase(c);
  applyScale(c, f);
  return true;
}

const ICON_TWEAKS = {
  jelly: (c) => { c.R = 3; for (const t of c.tents) t.links.fill(0.75); for (const a of c.arms) a.links.fill(0.8); },
};

function makeIcon(key, make) {
  if (iconCache.has(key)) return iconCache.get(key);
  const icon = withSeed(`icon/${key}`, () => {
    const w = iconWorld();
    let c = make(w);
    for (let i = 0; i < 24 && ICON_PREFER[c.species] && !ICON_PREFER[c.species](c); i++) c = make(w);
    ICON_TWEAKS[c.species]?.(c);
    let crop = rasterIcon(c, w);
    const side = Math.max(crop.w, crop.h);
    if (side > ICON_BOX && fitIcon(c, ICON_BOX / side)) crop = rasterIcon(c, w);
    return iconImage(crop);
  });
  iconCache.set(key, icon);
  return icon;
}

const speciesIcon = (kind) => makeIcon(kind, (w) => {
  if (kind === 'koi') return new Koi(w, 48, 48, 0);
  if (kind === 'tadpole') return new Tadpole(w, 48, 48);
  if (kind === 'wild') {
    const n = WILD_SPECIES.length, sp = genWildSpecies('salt');
    WILD_SPECIES.length = n; // a stand-in, not a real discovery
    return new WildFish(w, 48, 48, sp);
  }
  const g = SPECIES[kind].spawn(w, 48, 48);
  return (kind === 'duck' && g.find((d) => d.kind === 'drake')) || g[0];
});
// Icons for the tools, plants and builds, drawn by the same renderer: once at full size to
// measure, then again scaled to fit (a structure shrinks, a pellet grows), shown at a whole-number scale.
const TOOL_ICON_BOX = 14;
const NET_RIM = mat('#4a3a22', '#7a6038', '#a88a52', '#d0b47a'), NET_MESH = mat('#6a6a64', '#94948c', '#bcbcb2', '#e2e2d8');
function drawnIcon(key, make, fit = TOOL_ICON_BOX) {
  if (iconCache.has(key)) return iconCache.get(key);
  let icon = null;
  try {
    icon = withSeed(`icon/${key}`, () => {
      const w = iconWorld(), N = 192, draw = make(w, N / 2);
      let crop = rasterDrawn(N, (r) => draw(r, w));
      const k = Math.min(4, fit / Math.max(crop.w, crop.h));
      if (Math.abs(k - 1) > 0.05) crop = rasterDrawn(N, (r) => { r.setScale(N / 2, N / 2, k); draw(r, w); r.setScale(); });
      return iconImage(crop);
    });
  } catch (e) { console.warn('icon', key, e); }
  iconCache.set(key, icon);
  return icon;
}
const toolIcon = (name) => drawnIcon(`tool/${name}`, (w, c) => {
  const t = TOOLS[name];
  if (t.build) {
    const s = makeStructure(t.build, w, c, c), next = (m) => newId(outlineOf(m));
    return (r) => { withSeed(`bake/${s.seed}`, () => BAKE[s.kind](r, s, next, w)); if (DRAW[s.kind]) DRAW[s.kind](r, s, 0, w); };
  }
  if (t.food) {
    const tiny = t.food === 'snow' || t.food === 'offering', m = t.food === 'snow' ? SNOW_MAT : OFFER_MAT;
    const fs = [[0, 0], [3, 1], [-2, 2.5], [1.5, -2.5], [-3, -1]].map(([dx, dy], i) => { const f = new Food(c + dx, c + dy, 2 + i * 0.2, t.food); f.life = 30; return f; });
    return (r) => { for (const f of fs) if (tiny) r.ellipsoid(f.x, f.y, 0.7, 0.7, 0, f.z, 0.6, m, FOOD_ID); else f.draw(r); };
  }
  if (name === 'pointer') {
    const m = mat('#8a8a8a', '#c8c8c8', '#ececec', '#ffffff'), id = newId(outlineOf(m));
    return (r) => {
      r.tube(c - 4, c - 4, 0.9, 2, c + 4, c + 5, 0.9, 2, 1, m, id); // the shaft
      r.tube(c - 4, c - 4, 0.9, 2, c + 2, c - 3.5, 0.8, 2, 1, m, id); // the head
      r.tube(c - 4, c - 4, 0.9, 2, c - 3.5, c + 2, 0.8, 2, 1, m, id);
    };
  }
  if (name === 'net') {
    const rim = newId(outlineOf(NET_RIM)), mesh = newId(outlineOf(NET_MESH));
    return (r) => {
      r.tube(c + 3, c + 3, 0.7, 2, c + 9, c + 9, 0.7, 2, 0.6, NET_RIM, rim); // the handle
      for (let k = 0; k < 12; k++) { const a0 = k / 12 * TAU, a1 = (k + 1) / 12 * TAU; r.tube(c - 2 + Math.cos(a0) * 5, c - 2 + Math.sin(a0) * 5, 0.6, 2.5, c - 2 + Math.cos(a1) * 5, c - 2 + Math.sin(a1) * 5, 0.6, 2.5, 0.6, NET_RIM, rim); }
      for (let k = -2; k <= 2; k++) { r.tube(c - 2 + k * 2, c - 6.5, 0.3, 2, c - 2 + k * 2, c + 2.5, 0.3, 2, 0.8, NET_MESH, mesh); r.tube(c - 6.5, c - 2 + k * 2, 0.3, 2, c + 2.5, c - 2 + k * 2, 0.3, 2, 0.8, NET_MESH, mesh); }
    };
  }
  if (name === 'rock') {
    const rk = makeRock(c, c, 7), id = newId(rk.outline);
    return (r) => r.ellipsoid(rk.x, rk.y, rk.a, rk.b, rk.ang, 0, rk.h, rk.shader, id);
  }
  if (t.likedBy && t.place) {
    const p = makePlant(t.likedBy, w, c, c);
    return (r) => p.draw(r, 0, w);
  }
  return () => {};
});
const wildIcon = (sp) => makeIcon(`wild/${sp.id}/${sp.name}`, (w) => new WildFish(w, 48, 48, sp));
const iconFor = (c) => (c.species === 'wild' ? wildIcon(c.sp) : speciesIcon(c.species));

// An <img> for an icon at a whole-number scale that fits `box` CSS pixels (so pixels stay crisp).
function iconImg(icon, box = ICON_CSS) {
  // Whole-number scales keep pixels crisp; only icons bigger than the box shrink (the mythic ones).
  const big = Math.max(icon.nw, icon.nh), img = document.createElement('img'), k = big > box ? box / big : clamp(Math.floor(box / big), 1, 6);
  img.src = icon.src; img.alt = '';
  img.width = icon.nw * k; img.height = icon.nh * k;
  return img;
}

// ---- creature rail: a short ranked list, or the full list with names -----------

const DOCK_KINDS = Object.keys(SPECIES);
const dockUi = { expanded: false, capacity: 10 };

// Undiscovered kinds live in the expanded rail too: their card offers a lure or summons.
function dockSpeciesVisible(w, kind) {
  if (!fitsHabitat(w, SPECIES_HABITAT[kind] || 'both') || !deepAvailable(w, kind)) return false;
  if (typeof spawnable === 'function' && spawnable(w, kind)) return true;
  if (typeof knows === 'function' && !knows(w, kind)) return !DEEP[kind] || !DEEP[kind].mythic;
  return typeof spawnable === 'function' ? false : deepUnlocked(w, kind);
}

function dockCapacity() {
  const rail = byId('rail'), dock = rail.querySelector('.dock-bar'), list = byId('animals');
  const maxHeight = parseFloat(getComputedStyle(rail).maxHeight) || innerHeight - 150;
  const gap = parseFloat(getComputedStyle(rail).rowGap) || 0;
  const outside = [...rail.children].filter((e) => e !== dock && !e.hidden).reduce((n, e) => n + e.offsetHeight, 0);
  const controls = [...dock.children].filter((e) => e !== list && !e.hidden).reduce((n, e) => n + e.offsetHeight, 0);
  const dockStyle = getComputedStyle(dock), listStyle = getComputedStyle(list);
  const edges = parseFloat(dockStyle.paddingTop) + parseFloat(dockStyle.paddingBottom) + parseFloat(dockStyle.borderTopWidth) + parseFloat(dockStyle.borderBottomWidth)
    + parseFloat(listStyle.paddingTop) + parseFloat(listStyle.paddingBottom);
  const dockGap = (dock.children.length - 1) * (parseFloat(dockStyle.rowGap) || 0);
  const first = list.querySelector('.ani'), pitch = (first ? first.offsetHeight : 40) + (parseFloat(listStyle.rowGap) || 4);
  return clamp(Math.floor((maxHeight - outside - gap * (rail.children.length - 1) - controls - dockGap - edges) / pitch), 1, 10);
}

function updateDockVisibility() {
  const box = byId('animals');
  if (!box) return;
  dockUi.capacity = dockCapacity();
  let shown = 0;
  for (const b of box.children) {
    const overflow = !b.hidden && shown++ >= dockUi.capacity;
    b.classList.toggle('dock-overflow', overflow);
  }
}

function setDockExpanded(open) {
  dockUi.expanded = !!open;
  const animals = byId('animals'), bar = animals.closest('.dock-bar'), toggle = byId('wild-btn');
  if (dockUi.expanded) {
    if (typeof setHud === 'function' && !byId('hud').classList.contains('hidden')) setHud(false);
    if (typeof setActions === 'function' && !byId('actions').hidden) setActions(false);
    if (census.open) setCensus(false);
  }
  bar.classList.toggle('expanded', dockUi.expanded);
  if (!dockUi.expanded) animals.scrollTop = 0;
  toggle.setAttribute('aria-expanded', dockUi.expanded);
  toggle.setAttribute('aria-controls', 'animals');
  toggle.setAttribute('aria-label', dockUi.expanded ? 'Collapse creature list' : 'Expand creature list');
  toggle.querySelector('span').textContent = dockUi.expanded ? '◂' : '▸';
  if (typeof setWild === 'function' && wildUi.open) setWild(false);
  hideLineage();
  closeSpawnCard();
  updateDockVisibility();
  refreshWildButton();
}

function buildDock() {
  const box = byId('animals');
  for (const kind of DOCK_KINDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ani';
    b.dataset.spawn = kind;
    b.setAttribute('aria-label', SPECIES[kind].label);
    b.append(Object.assign(document.createElement('i'), { className: 'gem' }), iconImg(speciesIcon(kind)),
      Object.assign(document.createElement('span'), { className: 'ani-label', textContent: SPECIES[kind].label }),
      Object.assign(document.createElement('b'), { textContent: '0' }));
    b.addEventListener('click', () => openSpawnCard(kind, b));
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showLineage(kind, b); });
    b.addEventListener('pointerleave', hideLineage);
    b.addEventListener('focus', () => showLineage(kind, b));
    b.addEventListener('blur', hideLineage);
    box.append(b);
  }
  updateDockVisibility();
}

// The dock shows what each species is worth to you: a purple glow for its total
// worth (relative to the most valuable), a border and gem in the colour of its
// rarest member, and the most valuable species first (re-sorted every few
// seconds, but never under the pointer).
let dockSortAt = 0;
function updateCounts() {
  const essence = world.game ? world.game.essence || 0 : 0, sum = speciesSummary(world);
  let total = 0, maxV = 1;
  for (const s of sum.values()) { total += s.n; maxV = Math.max(maxV, s.value); }
  const box = byId('animals');
  for (const b of box.querySelectorAll('[data-spawn]')) {
    const kind = b.dataset.spawn, s = sum.get(kind), k = s ? s.n : 0, count = b.querySelector('b'), price = spawnCost(kind);
    const canSpawn = typeof spawnable !== 'function' || spawnable(world, kind);
    b.classList.toggle('poor', canSpawn && essence < price);
    b.classList.toggle('undiscovered', !canSpawn);
    b.setAttribute('aria-label', `${SPECIES[kind].label}${canSpawn ? ', spawn or view' : ', lure or summon'}`);
    b.dataset.value = s ? s.value : 0;
    b.style.setProperty('--val', s ? (s.value / maxV).toFixed(3) : '0');
    b.style.setProperty('--tier', s && s.best ? TIER_COLOR[s.best] : 'transparent');
    b.classList.toggle('rare', !!(s && s.best >= 2));
    if (count.textContent !== String(k)) count.textContent = k;
    b.classList.toggle('none', !k);
    b.title = canSpawn
      ? `${SPECIES[kind].label}: ${k} here${s ? ` · worth ${s.value} essence · rarest ${TIERS[s.best]}` : ''}. Click to choose a spawn, genes or quality.`
      : `${SPECIES[kind].label}: not discovered. Click to lure or summon it.`;
  }
  const now = performance.now();
  if (now > dockSortAt && !box.matches(':hover') && !spawnUi.kind) {
    dockSortAt = now + 3000;
    const btns = [...box.children], order = btns.slice().sort((a, b) =>
      (+b.dataset.value || 0) - (+a.dataset.value || 0)
      || Number(typeof spawnable === 'function' && spawnable(world, b.dataset.spawn)) - Number(typeof spawnable === 'function' && spawnable(world, a.dataset.spawn))
      || DOCK_KINDS.indexOf(a.dataset.spawn) - DOCK_KINDS.indexOf(b.dataset.spawn));
    if (order.some((b, i) => b !== btns[i])) box.append(...order);
    updateDockVisibility();
  }
  byId('census-count').textContent = total;
}

// ---- family trees: hover a dock icon ------------------------------------------------------------
// Every animal of the species that has lived here (lineage records, game.js):
// a tree with each generation on its own row and lines to the parents, then the
// animals themselves, those here now first, by points.

const lineUi = { kind: null, anchor: null, timer: 0 };
const SVG_NS = 'http://www.w3.org/2000/svg';

function showLineage(kind, anchor) {
  if (dockUi.expanded) return;
  lineUi.kind = kind;
  lineUi.anchor = anchor;
  lineUi.timer = 0;
  renderLineage();
}

function hideLineage() {
  lineUi.kind = null;
  byId('lineage').hidden = true;
}

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function lineageTree(nodes, isHere) {
  const W = 300, gens = [...new Set(nodes.map((r) => r.g))].sort((a, b) => a - b).slice(-7);
  const rows = gens.map((g) => nodes.filter((r) => r.g === g).sort((a, b) => (a.b ?? 0) - (b.b ?? 0) || a.s - b.s));
  const ROW = 30, H = rows.length * ROW + 4, pos = new Map();
  rows.forEach((row, j) => {
    const step = Math.min(26, (W - 48) / Math.max(1, row.length - 1));
    row.forEach((r, i) => pos.set(r.s, [Math.round(44 + (W - 48) / 2 + (i - (row.length - 1) / 2) * step), 14 + j * ROW]));
  });
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'shape-rendering': 'crispEdges', 'aria-hidden': 'true' });
  rows.forEach((row, j) => {
    const t = svgEl('text', { x: 2, y: 17 + j * ROW, class: 'gen' });
    t.textContent = `gen ${gens[j]}`;
    svg.append(t);
  });
  // Elbow lines: down from each parent, across, and down into the child.
  for (const r of nodes) {
    const b = pos.get(r.s);
    for (const p of r.p || []) {
      const a = pos.get(p);
      if (!a || !b) continue;
      const mid = Math.round((a[1] + b[1]) / 2) + 0.5;
      svg.append(svgEl('path', { d: `M${a[0] + 0.5} ${a[1] + 6}V${mid}H${b[0] + 0.5}V${b[1] - 6}`, class: isHere(r) ? 'edge' : 'edge old' }));
    }
  }
  for (const r of nodes) {
    const at = pos.get(r.s);
    if (!at) continue;
    const tier = tierOf(r.t || []), s = tier >= 3 ? 11 : 9;
    svg.append(svgEl('rect', {
      x: at[0] - s / 2, y: at[1] - s / 2, width: s, height: s, fill: r.c,
      stroke: tier ? TIER_COLOR[tier] : '#0b1a22', 'stroke-width': tier ? 2 : 1, opacity: isHere(r) ? 1 : 0.4,
    }));
  }
  return svg;
}

function renderLineage() {
  const kind = lineUi.kind, box = byId('lineage');
  if (!kind || census.open || spawnUi.kind || !world.lineage) { box.hidden = true; return; }
  const inKind = (r) => r.k === kind || (kind === 'frog' && r.k === 'tadpole');
  const recs = [...world.lineage.values()].filter(inKind);
  const here = new Set(world.creatures.filter((c) => c.life && !c.leaving).map((c) => c.seed));
  const isHere = (r) => r.d == null && here.has(r.s);
  const alive = recs.filter(isHere).sort((a, b) => b.pts - a.pts || (a.b ?? 0) - (b.b ?? 0));
  const gone = recs.filter((r) => !isHere(r)).sort((a, b) => (b.d ?? 0) - (a.d ?? 0));
  const best = recs.reduce((m, r) => Math.max(m, tierOf(r.t || [])), 0);
  const likes = LIKES[kind], price = spawnCost(kind);

  const head = el('div', 'line-head');
  head.append(el('b', null, SPECIES[kind].label), el('span', null, [`${alive.length} here`, `${recs.length} known`, best && `best ${TIERS[best]}`].filter(Boolean).join(' · ')));
  const sub = colored('p', 'note', [`Click to spawn: ${price} essence`, likes && `likes ${likes.map((k) => LIKE_LABEL[k]).join(', ')}`].filter(Boolean).join(' · '));
  const parts = [head, sub];

  if (recs.length) {
    // The tree: those here now and the recently gone, plus their ancestors so families connect.
    const pick = new Map();
    for (const r of [...alive.slice(0, 20), ...gone.slice(0, 8)]) pick.set(r.s, r);
    let frontier = [...pick.values()];
    for (let depth = 0; depth < 4 && pick.size < 44; depth++) {
      const next = [];
      for (const r of frontier) {
        for (const p of r.p || []) {
          const pr = world.lineage.get(p);
          if (pr && !pick.has(p) && pick.size < 44) { pick.set(p, pr); next.push(pr); }
        }
      }
      frontier = next;
    }
    const nodes = [...pick.values()];
    if (nodes.some((r) => r.p)) parts.push(lineageTree(nodes, isHere));
    else parts.push(el('p', 'note', 'No families yet: well-fed adults that meet a mate lay eggs, and the tree grows from there.'));

    const ul = el('ol', 'line-list');
    for (const r of [...alive, ...gone].slice(0, 8)) {
      const tier = tierOf(r.t || []), li = el('li', isHere(r) ? '' : 'gone'), sw = el('i');
      sw.style.background = r.c;
      const name = el('b', null, r.n), tr = el('span', 'tr', tier ? `${TIERS[tier]} · ${traitText(r.t, 2)}` : '');
      if (tier) tr.style.color = TIER_COLOR[tier];
      const sp = r.w != null && WILD_SPECIES[r.w] ? `${WILD_SPECIES[r.w].name} · ` : '';
      const status = isHere(r) ? 'here' : r.d != null ? `left day ${Math.floor(r.d) + 1}${r.why ? ` (${r.why})` : ''}` : 'gone';
      li.append(sw, name, tr, el('span', 'mt', `${sp}gen ${r.g} · ${r.pts ? `+${r.pts}` : '0'} pts · ${status}`));
      ul.append(li);
    }
    parts.push(ul);
  } else {
    parts.push(el('p', 'note', 'None have lived here yet.'));
  }
  box.replaceChildren(...parts);
  box.hidden = false;
  // (Out to the right of the animals down the left, level with the one pointed at.)
  const rail = byId('rail').getBoundingClientRect(), a = lineUi.anchor.getBoundingClientRect(), h = box.offsetHeight;
  box.style.left = `${Math.round(rail.right + 12)}px`;
  box.style.bottom = 'auto';
  box.style.top = `${Math.round(clamp(a.top + a.height / 2 - h / 2, 8, innerHeight - h - 8))}px`;
}

// ---- census: details about the animals in the pond ------------------------------------------

const census = { open: false, expanded: new Set(), timer: 0 };

function setCensus(open) {
  census.open = open;
  byId('census').hidden = !open;
  byId('census-btn').setAttribute('aria-expanded', open);
  if (open) { renderCensus(); closeWindows('census'); if (typeof setHud === 'function' && !byId('hud').classList.contains('hidden')) setHud(false); } // (one window down the left at a time)
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function energyBar(v) {
  const bar = el('span', 'mini-bar'), fill = el('i');
  fill.style.width = `${Math.round(v * 100)}%`;
  if (v < 0.35) fill.className = 'low';
  bar.append(fill);
  return bar;
}

function renderCensus() {
  const groups = new Map();
  let total = 0, rares = 0;
  for (const c of world.creatures) {
    if (!c.life || c.gone || c.caught) continue;
    if (!groups.has(c.species)) groups.set(c.species, []);
    groups.get(c.species).push(c);
    total++;
    if (c.life.traits.length) rares++;
  }
  byId('census-summary').textContent = `${total} animals · ${groups.size} species · ${rares} rare`;
  byId('census-stats').textContent = `born ${ECO.births} · arrived ${ECO.arrivals} · moved on ${ECO.departures} · died ${ECO.died || 0} · eaten ${ECO.eaten}`;
  let room = byId('census-capacity');
  if (!room) {
    room = el('p', 'note'); room.id = 'census-capacity';
    room.title = 'Breeding room is a soft limit. Direct spawns can temporarily raise the population beyond it.';
    byId('census-stats').after(room);
  }
  const base = world.maxPopBase || Math.min(460, Math.round(world.W * world.H / 2400));
  const bonus = world.maxPopBonus || 0;
  room.textContent = `Breeding room: ${pondPopulation(world)} / ${world.maxPop || base + bonus} pond animals (${base} from pond size + ${bonus} from deep habitat). Expand the pond, or place structures and grow plants in deep water; the deep bonus updates at dawn.`;

  const rows = [], sum = speciesSummary(world);
  const worth = (k) => (k === 'tadpole' ? 0 : (sum.get(k) || { value: 0 }).value);
  const kinds = [...DOCK_KINDS, 'tadpole'].filter((k) => groups.get(k)).sort((a, b) => worth(b) - worth(a));
  byId('census-summary').textContent += ` · worth ${[...sum.values()].reduce((a, s) => a + s.value, 0)} essence`;
  for (const kind of kinds) {
    const list = groups.get(kind), S = sum.get(kind === 'tadpole' ? 'frog' : kind);
    // Most valuable first (rarer and bigger animals are worth more).
    list.sort((a, b) => recycleValue(b) - recycleValue(a) || b.life.age - a.life.age);
    const stage = { young: 0, adult: 0, elder: 0 };
    let hungry = 0, rare = 0, gen = 0;
    for (const c of list) {
      stage[describe(c).stage]++;
      if (c.life.energy < 0.35) hungry++;
      if (c.life.traits.length) rare++;
      gen = Math.max(gen, c.life.gen);
    }
    const open = census.expanded.has(kind), li = el('li', open ? 'row open' : 'row');
    const head = el('button', 'row-head');
    head.title = 'Click to list them, the most valuable first; click one to follow it.';
    head.type = 'button';
    head.setAttribute('aria-expanded', open);
    const facts = [stage.young && `${stage.young} young`, stage.adult && `${stage.adult} adult`, stage.elder && `${stage.elder} elder`,
      hungry && `${hungry} hungry`, rare && `✦ ${rare} rare`, gen && `gen ${gen}`,
      S && kind !== 'tadpole' && `worth ${S.value} essence`, S && kind !== 'tadpole' && `${diversityWord(S.diversity)} (${Math.round(S.diversity * 100)}%)`].filter(Boolean).join(' · ');
    if (S && S.best >= 2 && kind !== 'tadpole') li.style.setProperty('--tier', TIER_COLOR[S.best]);
    const st = world.game.stance && world.game.stance[kind], over = kind !== 'tadpole' && typeof overAbundant === 'function' && overAbundant(world, kind);
    head.append(el('span', 'ic'), el('b', 'nm', kind === 'tadpole' ? 'Tadpoles' : SPECIES[kind].label),
      el('span', 'ct', list.length), colored('span', 'facts', [facts, over ? 'outgrowing the pond' : '', st === 'protect' ? '🛡 protected' : st === 'cull' ? '🎯 culled' : ''].filter(Boolean).join(' · ')));
    if (over) li.classList.add('over');
    head.firstChild.append(iconImg(speciesIcon(kind), 28));
    head.addEventListener('click', () => {
      if (census.expanded.has(kind)) census.expanded.delete(kind); else census.expanded.add(kind);
      renderCensus();
    });
    li.append(head);
    if (open) {
      const ul = el('ul', 'members');
      for (const c of list.slice(0, 60)) {
        const d = describe(c), m = el('li');
        const b = el('button', c.life.traits.length ? 'member rare' : 'member');
        b.type = 'button';
        b.title = 'Follow';
        b.append(el('b', null, `${isSafe(c) ? '🔒 ' : ''}${c.life.paragon ? '♛ ' : ''}${c.life.name}`), el('span', 'sub', `${d.label === SPECIES[kind]?.label ? '' : `${d.label} · `}${d.stage} · gen ${d.gen} · ${ageLabel(d.age)} · ${GRADES[gradeOf(c.life.genome)].toLowerCase()}`),
          energyBar(d.energy), colored('span', 'mood', [d.traits.length && `✦ ${TIERS[d.tier]}: ${traitText(d.traits, 3)}`, d.mood, comfortWord(d.comfort), d.fed && 'well fed'].filter(Boolean).join(' · ')));
        b.addEventListener('click', () => { if (alive(c)) { follow(c); showCreature(c); } });
        b.append(el('span', 'val', `◆${recycleValue(c)}`));
        m.append(b);
        ul.append(m);
      }
      if (list.length > 60) ul.append(el('li', 'more', `and ${list.length - 60} more`));
      if (kind !== 'tadpole' && !world.observe && typeof setStance === 'function') {
        const bar = el('li', 'stance'), mk = (k, label, tip) => { const b = el('button', null, label); b.type = 'button'; b.setAttribute('aria-pressed', st === k); b.title = tip; b.addEventListener('click', () => { setStance(world, kind, k); renderCensus(); }); return b; };
        bar.append(mk('protect', '🛡 Protect', 'Protect them\nThe hunters leave them alone (a pearl a dawn for every two of them).'),
          mk('cull', '🎯 Cull', 'Cull them\nThe hunters go for them first, and every catch pays a bounty: for a kind that has outgrown the pond.'));
        ul.append(bar);
      }
      if (kind !== 'tadpole' && !world.observe) {
        const all = el('button', 'recycle-all');
        all.type = 'button';
        all.append(document.createTextNode(`Recycle all ${list.length} for `), el('i', 'essence'), document.createTextNode(String(S ? S.value : 0)));
        all.title = 'Recycle all\nReturn every one of them to the pond for essence (those kept safe stay). You are asked first.';
        all.addEventListener('click', () => { recycleAll(kind); renderCensus(); });
        ul.append(el('li', null), all);
      }
      li.append(ul);
    }
    rows.push(li);
  }
  byId('census-rows').replaceChildren(...rows);

  // Wild species discovered in this pond, with how many are here now.
  const here = new Map();
  for (const c of groups.get('wild') || []) here.set(c.sp, (here.get(c.sp) || 0) + 1);
  byId('wild-count').textContent = WILD_SPECIES.length ? `${WILD_SPECIES.length} discovered` : 'none yet';
  byId('wild-cards').replaceChildren(...WILD_SPECIES.map((sp) => {
    const card = el('li', here.get(sp) ? 'wild-card' : 'wild-card gone');
    const habits = [sp.habitat === 'salt' ? 'reef' : 'freshwater', sp.schooling && 'schools', sp.predator && 'predator', sp.small ? 'small' : 'large'].filter(Boolean).join(' · ');
    card.append(iconImg(wildIcon(sp), 32), el('b', null, sp.name), el('span', 'sub', habits), el('span', 'ct', here.get(sp) ? `${here.get(sp)} here` : 'moved on'));
    return card;
  }));
}

// ---- journal: one line of recent activity that opens into the full log ------------------------

const CATS = { all: 'All', story: 'Story', life: 'Life', rare: 'Rare', hunt: 'Hunts', come: 'Comings & goings', sky: 'Sky & tide' };
const journalUi = { open: false, repeats: false, filter: 'all', list: null, lastSeq: 0, queue: [], current: null, until: 0, shownText: null };
const TICKER_QUEUE = 4;                      // lines waiting at most; the least important are dropped
const TICKER_DWELL = [3500, 4500, 6000, 8000]; // least time on screen, by priority (ms)

// A chip that shows what the repeat filter keeps out of the journal (routine by now).
function repeatsChip() {
  const box = byId('log-filters');
  if (!box || box.querySelector('.chip.reps')) return;
  const b = el('button', 'chip reps', 'Repeats');
  b.type = 'button';
  b.title = 'Repeats\nRoutine moments are shown less often as they recur. Turn this on to see every one.';
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => { journalUi.repeats = !journalUi.repeats; b.setAttribute('aria-pressed', journalUi.repeats); world.journalDirty = true; renderJournal(); });
  box.append(b);
}
function setJournal(open) {
  journalUi.open = open;
  byId('log-panel').hidden = !open;
  byId('log-line').setAttribute('aria-expanded', open);
  if (open) { repeatsChip(); world.journalDirty = true; renderJournal(); closeWindows('log-panel'); }
}

// The big news gets a banner under the pond bar for a few seconds, and the narrator a strip below it.
const bannerUi = { until: 0, narrUntil: 0 };
// (Below the tab naming the pond up the beach, when there is one at the top of the screen.)
// Everything that shows under the pond bar, stacked so nothing covers anything: the tab naming the
// pond up the beach (when the beach runs up and down), the observe bar, the follow chip, the big
// news, the narrator. Restacked whenever one of them appears, changes or goes.
const NOTICES = ['observe-bar', 'follow', 'banner', 'narrator'];
function placeNews() {
  if (innerWidth <= 760) return; // (on a phone the follow chip sits at the bottom; the rest keep their places)
  let top = Math.round(byId('score').getBoundingClientRect().bottom + 6);
  const tab = byId('edge-west');
  if (tab && !tab.hidden && tab.classList.contains('vertical') && !tab.classList.contains('crowded') && +getComputedStyle(tab).opacity > 0.05) {
    const r = tab.getBoundingClientRect();
    if (r.top < top + 60) top = Math.max(top, Math.round(r.bottom + 6));
  }
  for (const id of NOTICES) {
    const e = byId(id);
    if (!e || e.hidden) continue;
    e.style.top = `${top}px`;
    top = Math.round(e.getBoundingClientRect().bottom + 6);
  }
}
{
  const again = () => requestAnimationFrame(placeNews);
  const mo = new MutationObserver(again);
  for (const id of [...NOTICES, 'edge-west']) { const e = byId(id); if (e) mo.observe(e, { attributes: true, attributeFilter: ['hidden', 'class'], childList: true, subtree: true, characterData: true }); }
  addEventListener('resize', again);
}
function showBanner(text) {
  const b = byId('banner');
  if (!b || world.quietRestore) return;
  b.replaceChildren(colorize(text));
  b.hidden = false;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(bannerUi.t);
  bannerUi.t = setTimeout(() => { b.hidden = true; placeNews(); }, Math.max(5200, 1500 + text.length * 60));
  placeNews();
}
function showNarration(text, stage) {
  const n = byId('narrator');
  if (!n) return;
  n.textContent = text;
  n.className = `narrator st${stage}`;
  n.hidden = false;
  void n.offsetWidth; n.classList.add('show');
  clearTimeout(bannerUi.nt);
  bannerUi.nt = setTimeout(() => { n.hidden = true; }, Math.max(7000, 2500 + text.length * 75));
  placeNews();
}

// A message of our own (e.g. "Link copied") jumps straight onto the ticker.
function showTicker(text) {
  journalUi.queue.unshift({ text, cat: 'pond', pri: 4, clock: null });
  journalUi.until = 0;
  renderJournal();
}

// The ticker shows one line at a time, long enough to read: important lines
// stay longer and jump ahead, and when things are busy routine lines skip the
// ticker (they are still available through Repeats). A line that grows while it's up
// (e.g. "3 Tetras moved on" becoming 4) updates in place.
function feedTicker() {
  if (world.journal !== journalUi.list) { // a different pond: start from its newest line
    journalUi.list = world.journal;
    journalUi.queue = journalUi.queue.filter((e) => e.pri === 4);
    journalUi.current = null;
    journalUi.until = 0;
    journalUi.lastSeq = world.journal[0] ? world.journal[0].seq - 1 : 0;
  }
  const now = performance.now(), fresh = world.journal.filter((e) => e.seq > journalUi.lastSeq).reverse();
  for (const e of fresh) {
    journalUi.lastSeq = Math.max(journalUi.lastSeq, e.seq);
    if ((e.pri ?? 1) >= 3 && e.cat !== 'story' && !e.routine && world.t - e.t < 5) showBanner(e.text); // the big news, big
    if (e === journalUi.current && now < journalUi.until) continue;
    if (journalUi.queue.includes(e)) continue;
    const busy = now < journalUi.until || journalUi.queue.length > 0;
    if (busy && (e.pri ?? 1) === 0) continue;
    if (e.routine && (!e.digestCount || busy)) continue;
    journalUi.queue.push(e);
    journalUi.queue.sort((a, b) => (b.pri ?? 1) - (a.pri ?? 1)); // stable: same priority keeps its order
    journalUi.queue.length = Math.min(journalUi.queue.length, TICKER_QUEUE);
  }
  if (now >= journalUi.until && journalUi.queue.length) {
    const e = journalUi.current = journalUi.queue.shift();
    const read = 1600 + journalText(e).length * 55; // about the time it takes to read
    journalUi.until = now + Math.max(TICKER_DWELL[Math.min(3, e.pri ?? 1)], read) * (journalUi.queue.length > 2 ? 0.8 : 1);
    journalUi.shownText = null;
    const line = byId('log-line');
    line.classList.remove('flash', 'pri0', 'pri1', 'pri2', 'pri3');
    void line.offsetWidth; // restart the flash animation
    line.classList.add('flash', 'pri' + Math.min(3, e.pri ?? 1));
  }
}

function entryTime(e) { return `D${e.day} ${clockLabel(e.clock)}`; }
function journalText(e) {
  const hidden = Math.max(0, (e.digestCount || 0) - (e.n || 1));
  return hidden ? `${e.text} · +${hidden} similar lately` : e.text;
}

function renderJournal() {
  feedTicker();
  const line = byId('log-line'), e = journalUi.current;
  const said = e && journalText(e);
  if (e && said !== journalUi.shownText) {
    journalUi.shownText = said;
    line.querySelector('.txt').replaceChildren(colorize(said));
    line.querySelector('time').textContent = e.clock == null ? '' : clockLabel(e.clock);
    line.querySelector('.dot').className = `dot cat-${e.cat}`;
    line.title = `${said}\nClick for the journal (J)`;
  }
  const more = line.querySelector('.more'), waiting = journalUi.queue.length ? `+${journalUi.queue.length}` : '';
  if (more.textContent !== waiting) more.textContent = waiting;
  if (!journalUi.open || !world.journalDirty) return;
  world.journalDirty = false;
  const list = world.journal.filter((e) => (journalUi.filter === 'all' || e.cat === journalUi.filter) && (journalUi.repeats || !e.routine || e.digestCount)).slice(0, 80);
  byId('journal').replaceChildren(...list.map((e) => {
    const li = el('li', `cat-${e.cat}`);
    li.append(el('i', 'dot'), el('time', null, entryTime(e)), colored('span', null, journalText(e)));
    if (e.subject) {
      li.classList.add('link');
      li.title = 'Follow';
      li.addEventListener('click', () => { if (alive(e.subject)) follow(e.subject); else showTicker('They are no longer in the pond'); });
    }
    return li;
  }));
  if (!list.length) byId('journal').append(el('li', 'empty', 'Nothing here yet.'));
}

function buildJournalFilters() {
  const box = byId('log-filters');
  for (const [cat, label] of Object.entries(CATS)) {
    const b = el('button', `chip cat-${cat}`, label);
    b.type = 'button';
    b.dataset.cat = cat;
    b.setAttribute('aria-pressed', cat === journalUi.filter);
    b.addEventListener('click', () => {
      journalUi.filter = cat;
      for (const c of box.querySelectorAll('[data-cat]')) c.setAttribute('aria-pressed', c.dataset.cat === cat);
      world.journalDirty = true;
      renderJournal();
    });
    box.append(b);
  }
}

// ---- sky tracker: an icon for the time of day that opens into moon, tide and time options ------

const skyUi = { open: false, key: '', timer: 0 };
const SKY_COL = {
  sun: hexToInt('#ffd34a'), sunHi: hexToInt('#fff4a8'), sunLo: hexToInt('#f0a020'), ray: hexToInt('#ffc23a'),
  dusk: hexToInt('#ff9a4a'), duskLo: hexToInt('#e0603a'), horizon: hexToInt('#6a4a6a'),
  moon: hexToInt('#f4efd6'), moonLo: hexToInt('#c8c2a8'), moonDark: hexToInt('#2e3650'), rim: hexToInt('#141a2a'),
  star: hexToInt('#dfe8ff'), cloud: hexToInt('#b8c4cc'), cloudLo: hexToInt('#7e8a94'), drop: hexToInt('#7ec8ff'),
};

function skyKind() {
  const mode = world.opts.light;
  if (mode === 'day') return 'day';
  if (mode === 'dusk') return 'dusk';
  if (mode === 'night') return 'night';
  const c = world.clock;
  return c < 0.22 || c >= 0.82 ? 'night' : c < 0.36 ? 'dawn' : c < 0.68 ? 'day' : 'dusk';
}

function timeOfDay(c) {
  return c < 0.2 || c >= 0.82 ? 'Night' : c < 0.3 ? 'Dawn' : c < 0.45 ? 'Morning' : c < 0.58 ? 'Midday' : c < 0.7 ? 'Afternoon' : 'Dusk';
}

// Draw a 16x16 pixel icon: the sun by day, the sun on the horizon at dawn and
// dusk, the moon in its current phase at night, with clouds when it rains.
function drawSkyIcon(cv, kind, age, rain) {
  const S = 16, g = cv.getContext('2d'), img = g.createImageData(S, S), px = new Uint32Array(img.data.buffer);
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) px[x + y * S] = c; };
  const C = SKY_COL;
  if (kind === 'night' || kind === 'moon') {
    if (kind === 'night') for (const [x, y] of [[1, 2], [13, 1], [14, 12], [2, 13], [11, 14]]) set(x, y, C.star);
    const cx = 8, cy = 8, R = 5.6, waxing = age < 0.5, k = Math.cos(TAU * age);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const nx = (x + 0.5 - cx) / R, ny = (y + 0.5 - cy) / R, d2 = nx * nx + ny * ny;
        if (d2 >= 1) continue;
        const w = Math.sqrt(1 - ny * ny), lit = waxing ? nx > k * w : nx < -k * w;
        set(x, y, d2 > 0.72 && !lit ? C.rim : lit ? (nx + ny < -0.7 ? C.moon : d2 > 0.6 ? C.moonLo : C.moon) : C.moonDark);
      }
    }
  } else if (kind === 'day') {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - 8, dy = y + 0.5 - 8, d = Math.hypot(dx, dy);
        if (d < 3.8) set(x, y, dx + dy < -2.5 ? C.sunHi : d > 3 ? C.sunLo : C.sun);
      }
    }
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8;
      for (const r of [5.4, 6.4]) set(Math.round(8 - 0.5 + Math.cos(a) * r), Math.round(8 - 0.5 + Math.sin(a) * r), C.ray);
    }
  } else {
    // dawn and dusk: half a sun on the horizon
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - 8, dy = y + 0.5 - 11, d = Math.hypot(dx, dy);
        if (d < 5) set(x, y, d > 4 ? C.duskLo : dx + dy < -3 ? C.sunHi : C.dusk);
      }
    }
    for (let x = 1; x < 15; x++) set(x, 11, C.horizon);
    for (const [x, y] of [[2, 13], [5, 13], [9, 13], [12, 13], [4, 14], [11, 14]]) set(x, y, C.duskLo);
  }
  if (rain > 0.3) {
    for (let y = 1; y < 7; y++) {
      for (let x = 6; x < 16; x++) {
        const d = Math.min(Math.hypot(x - 9, y - 4) / 3, Math.hypot(x - 12.5, y - 3.5) / 3.2, Math.hypot(x - 11, y - 5.5) / 2.6);
        if (d < 1) set(x, y, y > 4 ? C.cloudLo : C.cloud);
      }
    }
    for (const [x, y] of [[8, 9], [11, 8], [14, 9], [10, 11], [13, 12]]) set(x, y, C.drop);
  }
  g.putImageData(img, 0, 0);
}

function setSky(open) {
  if (open) closeWindows('sky-panel');
  skyUi.open = open;
  byId('sky-panel').hidden = !open;
  byId('sky-btn').setAttribute('aria-expanded', open);
  if (open) updateSkyPanel();
}

function updateSkyHud() {
  const kind = skyKind(), m = world.moon || moonInfo(world.days, world.moon0), rain = world.weather.rain;
  const key = `${kind}|${kind === 'night' ? Math.round(m.age * 32) : ''}|${rain > 0.3}`;
  if (key !== skyUi.key) {
    skyUi.key = key;
    drawSkyIcon(byId('sky-icon'), kind, m.age, rain);
    drawSkyIcon(byId('sky-big'), kind, m.age, rain);
    drawSkyIcon(byId('sky-moon'), 'moon', m.age, 0);
  }
  const btn = byId('sky-btn'), label = `Day ${Math.floor(world.days) + 1}, ${clockLabel(world.clock)} · ${m.name}. Click for moon, tide and time.`;
  if (btn.title !== label) btn.title = label;
  const day = `Day ${(Math.floor(world.days) + 1).toLocaleString('en')}`, dayEl = byId('sky-day');
  if (dayEl.textContent !== day) dayEl.textContent = day;
}

function updateSkyPanel() {
  const m = world.moon || moonInfo(world.days, world.moon0), c = world.clock, mode = world.opts.light;
  byId('sky-time').textContent = `Day ${Math.floor(world.days) + 1} · ${clockLabel(c)}`;
  byId('sky-state').textContent = mode === 'cycle' ? timeOfDay(c) : `Always ${mode}`;
  byId('daybar-mark').style.left = `${c * 100}%`;
  const toFull = (((0.5 - m.age) % 1) + 1) % 1 * MOON_DAYS, toNew = (((1 - m.age) % 1) + 1) % 1 * MOON_DAYS;
  byId('moon-name').textContent = m.name;
  byId('moon-note').textContent = `${Math.round(m.illum * 100)}% lit · ${m.phase === 4 ? 'full tonight' : `full in ${toFull < 1 ? 'under a day' : `${Math.round(toFull)} days`}`}` +
    (m.phase === 0 ? ' · new tonight' : toNew < toFull ? ` · new in ${Math.max(1, Math.round(toNew))} days` : '');
  const t = world.tide, hab = world.opts.habitat;
  byId('tide-fill').style.width = `${Math.round(clamp(t.level, 0, 1) * 100)}%`;
  let tideText, surfText;
  if (!world.shore) { tideText = 'A pool has no beach, so no tide'; surfText = ''; }
  else if (TIDE_RANGE[hab] < 0.5) { tideText = 'Freshwater: the level barely moves'; surfText = `Lapping gently at the bank`; }
  else {
    const next = nextTide(world), hours = Math.floor(next.hours), mins = Math.floor((next.hours % 1) * 60);
    tideText = `${t.rising ? 'Rising' : 'Falling'} · ${m.spring > 0.75 ? 'spring tides' : m.spring < 0.35 ? 'neap tides' : 'moderate tides'} · ${next.kind.toLowerCase()} tide in ${hours}h ${String(mins).padStart(2, '0')}m`;
    surfText = `Surf: ${t.surf < 0.35 ? 'calm' : t.surf < 0.6 ? 'gentle' : t.surf < 0.9 ? 'choppy' : 'big waves'}`;
  }
  byId('tide-text').textContent = tideText;
  byId('surf-text').textContent = surfText;
  byId('water-text').textContent = typeof waterTemp === 'function' ? `Water: ${tempWord(waterTemp(world))}, ${tempC(world)}°C${typeof deadCalm === 'function' && deadCalm(world) ? ' · dead calm' : ''}` : '';
  const hv = typeof heavensLine === 'function' ? heavensLine(world) : '';
  byId('heavens-text').hidden = !hv;
  if (byId('heavens-text').textContent !== hv) byId('heavens-text').textContent = hv;
  renderArtifacts();
}

// Artifacts from relics (artifacts.js): the meta controls, and those that simply work.
function renderArtifacts() {
  const box = byId('sky-artifacts'), G = world.game, have = (G && G.artifacts) || {}, keys = Object.keys(ARTIFACTS).filter((k) => have[k]);
  const sig = JSON.stringify([keys, world.meta, Math.floor(world.days * 20), !!world.observe]);
  if (sig === box.dataset.sig) return;
  box.dataset.sig = sig;
  box.hidden = !keys.length;
  if (!keys.length) return;
  const parts = [el('h3', null, 'Artifacts')];
  for (const k of keys) {
    const A = ARTIFACTS[k], row = el('div', 'artifact');
    row.append(el('b', null, A.label), colored('span', 'note', A.note));
    if (A.controls) {
      const M = world.meta && world.meta[A.key], active = metaNow(world, A.key), resting = M && world.days < (M.ready || 0);
      const acts = el('div', 'grid2');
      for (const [v, label] of Object.entries(A.controls)) {
        const b = el('button', active === v ? 'on' : null, label);
        b.type = 'button';
        b.disabled = !!world.observe || resting;
        b.title = resting ? `Resting: ready again in ${Math.max(1, Math.round((M.ready - world.days) * world.opts.dayLength / 60))} minutes` : '';
        b.addEventListener('click', () => { useArtifact(world, k, v); box.dataset.sig = ''; updateSkyPanel(); });
        acts.append(b);
      }
      row.append(acts);
    }
    parts.push(row);
  }
  box.replaceChildren(...parts);
}


// ---- colour-coded words ------------------------------------------------------------------
// Every classifier has one colour wherever it's mentioned: rarity tiers, rare
// traits, working genes, the two waters and the three currencies.

const GENE_INFO = {
  fertility: { label: 'Fertility', color: '#ff7eb6' }, longevity: { label: 'Longevity', color: '#5fd4c4' },
  vitality: { label: 'Vitality', color: '#7ed07a' }, intellect: { label: 'Intellect', color: '#b49cf0' },
  light: { label: 'Light', color: '#ffe45c' }, aggression: { label: 'Aggression', color: '#ef6f6c' },
  tolerance: { label: 'Tolerance', color: '#6fb7ef' }, territory: { label: 'Territory', color: '#f0a15c' },
  resilience: { label: 'Resilience', color: '#9ab0c8' }, stealth: { label: 'Stealth', color: '#c8d4dc' },
  speed: { label: 'Speed', color: '#8ef0f0' }, luck: { label: 'Luck', color: '#ffd166' },
};
const CLASS_COLOR = {
  ...Object.fromEntries(Object.entries(RARE_OUTLINE).map(([k, v]) => [k, hex6(v)])), pale: '#e8e2d2',
  ...Object.fromEntries(TIERS.map((t, i) => [t, TIER_COLOR[i]])),
  ...Object.fromEntries(Object.entries(GENE_INFO).map(([k, v]) => [k, v.color])),
  fresh: '#7ed07a', salt: '#4ab4ff', points: '#ffd166', pearls: '#e8f4f8', essence: '#c38bff',
  hostile: '#ef6f6c', tense: '#f0a15c', calm: '#7ed07a',
};
const CLASS_WORDS = new Map();
for (const [k, col] of Object.entries(CLASS_COLOR)) {
  CLASS_WORDS.set(k, col);
  if (!TIERS.includes(k)) CLASS_WORDS.set(k[0].toUpperCase() + k.slice(1), col);
}
const CLASS_RE = new RegExp(`\\b(${[...CLASS_WORDS.keys()].sort((a, b) => b.length - a.length).join('|')})\\b`, 'g');

// Text with its classifier words wrapped in coloured spans (as a fragment, never HTML).
function colorize(text) {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(CLASS_RE)) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const s = el('span', 'cls', m[1]);
    s.style.color = CLASS_WORDS.get(m[1]);
    frag.append(s);
    last = m.index + m[1].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}
const colored = (tag, cls, text) => { const e = el(tag, cls); e.append(colorize(text)); return e; };
const chip = (word, color) => { const e = el('span', 'tchip', word); e.style.color = color; e.style.borderColor = color; return e; };
// Traits pile up as a line evolves (a marked, warped, parasite-born koi can carry a dozen), so lists
// show the rarest first and only a few of them, counting the rest; the whole list is in the tooltip.
const byRarity = (traits) => [...traits].sort((a, b) => (TRAIT_RARITY[b] || 0) - (TRAIT_RARITY[a] || 0));
const TRAIT_WORDS = { darkloving: 'dark-loving', manyeyed: 'many-eyed', longcoiled: 'long-coiled', sporebearing: 'spore-bearing' };
const traitName = (k) => TRAIT_WORDS[k] || k;
function traitText(traits, max = 4) {
  const t = byRarity(traits).map(traitName);
  return t.length > max ? `${t.slice(0, max).join(' · ')} +${t.length - max}` : t.join(' · ');
}
// A trait's colour as text: the darkest (nocturnal, dark-loving…) are lifted toward white so they read on the panels.
function traitColor(k) {
  const c = CLASS_COLOR[k] || (RARE_OUTLINE[k] !== undefined ? hex6(RARE_OUTLINE[k]) : '#ffd166'), n = parseInt(c.slice(1), 16);
  const rgb = [n >> 16, (n >> 8) & 255, n & 255], lum = (0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) / 255;
  if (lum >= 0.42) return c;
  const k2 = Math.min(0.6, (0.42 - lum) * 1.6 + 0.15);
  return `rgb(${rgb.map((v) => Math.round(v + (255 - v) * k2)).join(', ')})`;
}
function traitChips(traits, max = 5) {
  const box = el('span', 'tchips'), t = byRarity(traits);
  for (const k of t.slice(0, max)) box.append(chip(traitName(k), traitColor(k)));
  if (t.length > max) box.append(chip(`+${t.length - max} more`, '#8fbcb8'));
  box.title = t.map(traitName).join(', ');
  return box;
}

// ---- spawn card: click a dock icon to buy that animal with essence --------------------------

const spawnUi = { kind: null, anchor: null, enh: new Set(), grade: 0, ancient: null, timer: 0 };
const RARITY_WORDS = ['a common species', 'an uncommon species', 'a scarce species', 'an exotic species', 'a legendary species'];
const yearsLabel = (y) => (y < 1 ? `${Math.round(y * 12)} months` : `${y} years`);

function openSpawnCard(kind, anchor) {
  if (world.observe) return; // someone else's pond: look only
  if (spawnUi.kind === kind) { closeSpawnCard(); return; }
  spawnUi.kind = kind;
  spawnUi.anchor = anchor;
  spawnUi.enh = new Set();
  spawnUi.grade = 0;
  spawnUi.ancient = null;
  hideLineage();
  closeWindows('spawn-card');
  renderSpawnCard();
}

function closeSpawnCard() {
  spawnUi.kind = null;
  byId('spawn-card').hidden = true;
}

function renderSpawnCard() {
  const kind = spawnUi.kind, box = byId('spawn-card');
  if (!kind) return;
  const known = typeof knows !== 'function' || knows(world, kind);
  const canSpawn = typeof spawnable !== 'function' || spawnable(world, kind);
  const s = SPECIES_STATS[kind], G = world.game, enh = [...spawnUi.enh], grade = spawnUi.grade || 0, price = Math.round(spawnPrice(kind, enh) * GRADE_PRICE[grade]);
  const settle = settleChance(world, kind, enh.includes('hardy') ? ENHANCE.hardy.settle : 0), likes = LIKES[kind];
  const head = el('div', 'sc-head'), ic = el('span', 'ic');
  ic.append(iconImg(speciesIcon(kind), 32));
  const water = SPECIES_HABITAT[kind] === 'both' ? 'fresh or salt' : SPECIES_HABITAT[kind];
  const title = el('div');
  title.append(el('b', null, SPECIES[kind].label), colored('span', null, `${water} water · ${RARITY_WORDS[s.rarity]}`));
  const cost = el('span', 'sc-cost');
  if (canSpawn) cost.append(el('i', 'essence'), document.createTextNode(fmt(price)));
  else cost.textContent = known ? 'Locked' : 'New';
  head.append(ic, title, cost);
  const facts = el('ul', 'sc-facts');
  facts.append(el('li', null, `Size ${'▮'.repeat(s.size)}${'▯'.repeat(5 - s.size)}${s.group ? ` · group of ${s.group}` : ''}`));
  if (canSpawn) {
    const settleFact = el('li', null, `${Math.round(settle * 100)}% settle · lives about ${yearsLabel(s.years)}`);
    settleFact.title = `Those that don't settle return half their price. An average life lasts about ${Math.round(lifeSeconds(s.years) / 60)} real minutes at normal speed.`;
    facts.append(settleFact);
  } else if (!known) {
    const need = SUCCESSION[kind] ?? 0, ready = (world.maturity ?? 0) >= need || !!DEEP[kind];
    facts.append(el('li', null, `${oddsWord(kindOdds(world, kind))}${ready ? '' : ' · habitat still growing'}`));
  }
  if (likes) facts.append(el('li', null, `Likes ${likes.map((k) => LIKE_LABEL[k]).join(', ')}`));
  const S = speciesSummary(world).get(kind);
  let have = null;
  if (S) {
    have = el('div', 'sc-have');
    const all = el('button', 'recycle-all');
    all.type = 'button';
    all.append(document.createTextNode('Recycle all '), el('i', 'essence'), document.createTextNode(String(S.value)));
    all.title = 'Recycle all\nReturn every one of them to the pond for essence (those kept safe stay). You are asked first.';
    all.addEventListener('click', () => { recycleAll(kind); renderSpawnCard(); });
    have.append(colored('span', null, `In the pond: ${S.n}, worth ${S.value} essence${S.best ? `, rarest ${TIERS[S.best]}` : ''}, ${diversityWord(S.diversity)}`), all);
  }
  const boosts = el('div', 'sc-boosts');
  const boostHead = el('span', 'sc-sub', 'Gene boosts');
  boostHead.title = canSpawn ? 'Choose boosts for the next spawn. Point to one for its effect.' : 'Boosts become available once this kind has arrived.';
  boosts.append(boostHead);
  for (const [key, e] of Object.entries(ENHANCE)) {
    const b = el('button', 'boost');
    b.type = 'button';
    b.disabled = !canSpawn;
    b.setAttribute('aria-pressed', spawnUi.enh.has(key));
    const info = GENE_INFO[e.buff] || GENE_INFO.luck;
    const name = el('b', null, e.label);
    name.style.color = info.color;
    const c = el('span', 'bc');
    c.append(el('i', 'essence'), document.createTextNode(`+${enhanceCost(kind, key)}`));
    b.append(name, c);
    b.title = canSpawn ? `${e.label}: ${e.note}` : 'Available once this kind has arrived';
    b.addEventListener('click', () => { if (spawnUi.enh.has(key)) spawnUi.enh.delete(key); else spawnUi.enh.add(key); renderSpawnCard(); });
    boosts.append(b);
  }
  // Quality: pay more for a spawn that's at least this good (its genes are chosen until they are).
  const grades = el('div', 'sc-boosts grades');
  const gradeHead = el('span', 'sc-sub', 'Quality');
  gradeHead.title = canSpawn ? 'Choose the minimum working gene quality for every animal in this spawn. Higher quality costs more essence.' : 'Quality choices become available once this kind has arrived.';
  grades.append(gradeHead);
  for (const gi of [0, 2, 3, 4, 5]) {
    const b = el('button', 'boost'), nm = el('b', null, gi ? `${GRADES[gi]}${gi < 5 ? '+' : ''}` : 'Any');
    b.type = 'button';
    b.disabled = !canSpawn;
    b.setAttribute('aria-pressed', grade === gi);
    if (gi) nm.style.color = GRADE_COLOR[gi];
    b.append(nm, el('span', 'bc', gi ? `×${GRADE_PRICE[gi]}` : 'as it comes'));
    b.title = !canSpawn ? 'Available once this kind has arrived' : gi ? `${GRADES[gi]}${gi < 5 ? ' or better' : ''}\nEvery animal in the spawn is at least ${GRADES[gi]}: better working genes, worth more (the price ×${GRADE_PRICE[gi]}).` : 'Any quality\nThe spawn as it comes: mostly Fair to Fine.';
    b.addEventListener('click', () => { spawnUi.grade = gi; renderSpawnCard(); });
    grades.append(b);
  }
  const genes = G.fossilGenes || [];
  let ancient = null;
  if (genes.length) {
    ancient = el('div', 'sc-boosts ancient');
    const ancientHead = el('span', 'sc-sub', 'Ancient genes');
    ancientHead.title = 'A fossil gene goes to the first animal in the spawn at no extra cost.';
    ancient.append(ancientHead);
    for (const [i, g] of genes.entries()) {
      const b = el('button', 'boost');
      b.type = 'button';
      b.disabled = !canSpawn;
      b.setAttribute('aria-pressed', spawnUi.ancient === i);
      const nm = el('b', null, g);
      nm.style.color = CLASS_COLOR[g] || '#ffd166';
      b.append(nm, el('span', 'bc', 'ancient'));
      b.addEventListener('click', () => { spawnUi.ancient = spawnUi.ancient === i ? null : i; renderSpawnCard(); });
      ancient.append(b);
    }
  }
  let action;
  if (canSpawn) {
    const buy = el('button', 'sc-buy');
    buy.type = 'button';
    buy.disabled = (G.essence || 0) < price || hardMode(world);
    buy.append(document.createTextNode('Spawn for '), el('i', 'essence'), document.createTextNode(fmt(price)));
    if (hardMode(world)) { buy.replaceChildren(document.createTextNode('Hard mode: lure new kinds instead')); buy.classList.add('hard'); }
    buy.title = hardMode(world) ? 'Hard mode\nBuild a habitat that attracts this kind; a lure helps undiscovered kinds arrive.' : buy.disabled ? `You have ${fmt(G.essence || 0)} essence. Recycle animals with the Net for more.` : `Spawn\nThey arrive in bubbles. Each settles in ${Math.round(settle * 100)}% of the time; those that don't give half their share back.`;
    buy.addEventListener('click', () => {
      const gene = spawnUi.ancient != null ? genes[spawnUi.ancient] : null;
      if (buyAnimal(kind, [...spawnUi.enh], gene, spawnUi.grade || 0)) { spawnUi.ancient = null; renderSpawnCard(); }
    });
    action = buy;
  } else if (!known) {
    action = el('div', 'sc-arrival');
    const lured = !!(G.lures && G.lures[kind] > world.days), summoned = G.summon === kind;
    const lure = el('button', 'sc-buy lure'), summon = el('button', 'sc-buy summon');
    lure.type = summon.type = 'button';
    lure.disabled = !!world.observe || lured || (G.pearls || 0) < lurePrice(world, kind);
    summon.disabled = !!world.observe || !!G.summon || hardMode(world) || (G.essence || 0) < summonPrice(world, kind);
    lure.append(document.createTextNode(lured ? 'Lured until day ' + (Math.floor(G.lures[kind]) + 1) : 'Lure for '), ...(lured ? [] : [el('i', 'pearl'), document.createTextNode(fmt(lurePrice(world, kind)))]));
    summon.append(document.createTextNode(summoned ? 'Summoned · arriving at dawn' : 'Summon for '), ...(summoned ? [] : [el('i', 'essence'), document.createTextNode(fmt(summonPrice(world, kind)))]));
    lure.title = 'A lure makes this kind far likelier to arrive for two pond days.';
    summon.title = hardMode(world) ? 'Summoning is off in hard mode; a lure can still help.' : G.summon && !summoned
      ? `${SINGULAR[G.summon] || G.summon} is already on its way at dawn.` : 'A summons brings this kind at the next dawn, even if the habitat is still growing.';
    lure.addEventListener('click', () => { if (lureKind(world, kind)) renderSpawnCard(); });
    summon.addEventListener('click', () => { if (summonKind(world, kind)) renderSpawnCard(); });
    action.append(lure, summon);
  } else action = el('p', 'note', 'Unlock this kind in the depths before spawning it.');
  const sups = supersFor(world, kind);
  let supers = null;
  if (sups.length) {
    supers = el('div', 'sc-supers');
    const b = el('button', 'super');
    b.type = 'button';
    b.append(colored('b', null, `♛ ${sups.length === 1 ? 'A Paragon' : `${sups.length} Paragons`} of this kind ${sups.length === 1 ? 'is' : 'are'} waiting: open Paragons`));
    b.addEventListener('click', () => { closeSpawnCard(); setParagons(true); });
    supers.append(b);
  }
  box.replaceChildren(...[head, supers, facts, have, boosts, grades, ancient, action].filter(Boolean));
  box.hidden = false;
  const a = spawnUi.anchor.getBoundingClientRect(), w = box.offsetWidth;
  if (spawnUi.anchor.closest('#rail, #actions') && innerWidth > 760) { // (beside what opened it: the animals down the left, or all actions)
    const acts = byId('actions'), R = acts.hidden || !spawnUi.anchor.closest('#actions') ? a : acts.getBoundingClientRect();
    box.style.left = `${Math.round(R.right + 10 + w < innerWidth - 8 ? R.right + 10 : Math.max(8, R.left - w - 10))}px`;
    box.style.bottom = 'auto';
    box.style.top = `${Math.round(clamp(a.top - 20, 8, innerHeight - box.offsetHeight - 8))}px`;
    return;
  }
  // (Pinned to the item bar along the bottom: up from it.)
  const bar = (spawnUi.anchor.closest('.item-bar') || spawnUi.anchor).getBoundingClientRect();
  box.style.top = '';
  box.style.left = `${Math.round(clamp(a.left + a.width / 2 - w / 2, 8, innerWidth - w - 8))}px`;
  box.style.bottom = `${Math.round(innerHeight - bar.top + 14)}px`;
}

// ---- creature card: everything about one animal ------------------------------------------------
// What a trait built all the way looks like (mastery.js), for its button's tip.
const masteryTip = (k, lv, max) => (typeof MASTERY_LOOKS === 'undefined' || !MASTERY_LOOKS[k] ? '' : lv >= max ? `. Built all the way: ${MASTERY_LOOKS[k]}` : `. At level ${max} it shows: ${MASTERY_LOOKS[k]}`);
// Opened by clicking an animal, and shown automatically while following or touring.

const creatureUi = { c: null, auto: false, timer: 0, rec: null };
const LOCUS_INFO = {
  albino: ['albino', 'recessive'], melanistic: ['melanistic', 'recessive'], piebald: ['piebald', 'recessive'],
  xanthic: ['xanthic', 'recessive'], axanthic: ['axanthic', 'recessive'], leu: ['leucistic', 'incomplete'],
  mar: ['marbled', 'dominant'], mut: ['mutator', 'recessive'],
};
const BUFF_ROWS = ['fertility', 'longevity', 'vitality', 'intellect', 'aggression', 'territory', 'speed', 'tolerance', 'resilience', 'stealth', 'light', 'luck'];
const GENE_TIPS = {
  fertility: 'More eggs and less time between broods.',
  longevity: 'Slows ageing and helps this animal live longer.',
  vitality: 'Helps it keep energy and compete for food.',
  intellect: 'Lets it spot prey and danger from farther away.',
  aggression: 'Helps it win fights; also makes it a stronger hunter.',
  territory: 'Makes its kind claim more of the surrounding water.',
  speed: 'Changes how fast it swims or walks.',
  tolerance: 'Softens the discomfort of water that does not suit its kind.',
  resilience: 'Helps it withstand stress and illness.',
  stealth: 'Makes it harder for predators to spot.',
  light: 'Makes it glow and draws some plankton after dark.',
  luck: 'A rare trait bonus carried by shiny and iridescent animals.',
};

function showCreature(c, auto = false) {
  if (!c || !c.life) return;
  if (auto && creatureUi.c && !creatureUi.auto && alive(creatureUi.c)) return; // don't replace one you opened
  if (!auto) closeWindows('creature');
  creatureUi.c = c;
  creatureUi.auto = auto;
  creatureUi.rec = world.lineage && world.lineage.get(c.seed);
  byId('creature').hidden = false;
  renderCreature();
}

function hideCreature() {
  creatureUi.c = null;
  creatureUi.auto = false;
  byId('creature').hidden = true;
}

function geneBar(key, v) {
  const info = GENE_INFO[key], mult = MULT_BUFFS.has(key);
  const row = el('li', 'gene'), bar = el('span', 'gbar'), fill = el('i');
  row.title = `${info.label}\n${GENE_TIPS[key]}`;
  const k = mult ? clamp((v - 0.5) / 1, 0, 1) : clamp(v, 0, 1);
  fill.style.width = `${Math.round(k * 100)}%`;
  fill.style.background = info.color;
  bar.append(fill);
  const name = el('b', null, info.label);
  name.style.color = info.color;
  row.append(name, bar, el('span', 'gv', mult ? `×${v.toFixed(2)}` : v > 0 ? `${Math.round(v * 100)}%` : '–'));
  return row;
}

// Grandparents, parents, the animal, its young: squares in each one's colour, outlined by tier.
function familyTree(rec) {
  const L = world.lineage, get = (s) => L.get(s);
  const parents = (rec.p || []).map(get).filter(Boolean);
  const grand = parents.flatMap((p) => (p.p || []).map(get).filter(Boolean)).slice(0, 4);
  const kids = [...L.values()].filter((r) => r.p && r.p.includes(rec.s));
  const rows = [grand, parents, [rec], kids.slice(0, 12)].filter((r, i) => r.length || i === 2);
  const W = 272, H = rows.length * 24 + 6, pos = new Map();
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'shape-rendering': 'crispEdges' });
  rows.forEach((row, j) => {
    const step = Math.min(22, (W - 20) / Math.max(1, row.length - 1));
    row.forEach((r, i) => pos.set(r.s, [Math.round(W / 2 + (i - (row.length - 1) / 2) * step), 12 + j * 24]));
  });
  for (const r of rows.flat()) {
    const b = pos.get(r.s);
    for (const p of r.p || []) {
      const a = pos.get(p);
      if (!a) continue;
      const mid = Math.round((a[1] + b[1]) / 2) + 0.5;
      svg.append(svgEl('path', { d: `M${a[0] + 0.5} ${a[1] + 5}V${mid}H${b[0] + 0.5}V${b[1] - 5}`, class: 'edge' }));
    }
  }
  const here = new Set(world.creatures.filter((c) => c.life && !c.leaving).map((c) => c.seed));
  for (const r of rows.flat()) {
    const [x, y] = pos.get(r.s), tier = tierOf(r.t || []), me = r === rec, s = me ? 11 : 8;
    const sq = svgEl('rect', {
      x: x - s / 2, y: y - s / 2, width: s, height: s, fill: r.c, stroke: me ? '#ffd166' : tier ? TIER_COLOR[tier] : '#0b1a22',
      'stroke-width': me || tier ? 2 : 1, opacity: r.d == null && here.has(r.s) ? 1 : 0.45,
    });
    const t = svgEl('title', {});
    t.textContent = `${r.n} · gen ${r.g}${tier ? ` · ${TIERS[tier]} ${r.t.join(' ')}` : ''}${r.d != null ? ` · left day ${Math.floor(r.d) + 1}` : ''}`;
    sq.append(t);
    svg.append(sq);
  }
  if (kids.length > 12) {
    const t = svgEl('text', { x: W - 2, y: H - 6, class: 'gen', 'text-anchor': 'end' });
    t.textContent = `+${kids.length - 12}`;
    svg.append(t);
  }
  return { svg, parents, kids };
}

function renderCreature() {
  const c = creatureUi.c, box = byId('creature');
  if (!c) return;
  const here = alive(c), L = c.life, d = describe(c), rec = creatureUi.rec || (world.lineage && world.lineage.get(c.seed));
  const parts = [];
  const head = el('header', 'cr-head'), nm = el('b', null, d.name);
  nm.style.color = d.tier ? TIER_COLOR[d.tier] : 'var(--hot)';
  const close = el('button', 'icon', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', hideCreature);
  head.append(nm, d.tier ? chip(TIERS[d.tier], TIER_COLOR[d.tier]) : el('span'), close);
  parts.push(head);
  const water = waterOf(c), mm = mismatch(world, c), a = aggressionAt(world, c.x, c.y);
  parts.push(colored('p', 'cr-sub', `${d.label} · ${d.stage} · gen ${d.gen} · ${ageLabel(L.age)} of ~${Math.round(L.lifespan / 60)}m`));
  const speciesNote = typeof SPECIES_NOTES !== 'undefined' && SPECIES_NOTES[c.species];
  parts.push(colored('p', 'cr-description', `${speciesNote || 'A living animal in this pond, with its own behavior and inherited traits.'} This individual's energy and comfort change as it finds food, shelter and suitable water; its traits can pass to its young.`));
  if (!here) {
    parts.push(colored('p', 'cr-gone', rec && rec.d != null ? `No longer in the pond: left on day ${Math.floor(rec.d) + 1}${rec.why ? ` (${rec.why})` : ''}` : 'No longer in the pond'));
  } else {
    const bar = el('div', 'bar'), fill = el('i');
    fill.style.width = `${Math.round(L.energy * 100)}%`;
    bar.append(fill);
    parts.push(bar, colored('p', 'cr-sub', [d.mood, comfortWord(L.comfort), aggressionWord(a), water && (mm > 0.3 ? `out of place in ${water === 'fresh' ? 'salt' : 'fresh'} water` : `in ${water} water`), d.fed && 'well fed', ...d.temper].filter(Boolean).join(' · ')));
  }
  const gr = gradeOf(L.genome);
  if (here && typeof mindEligible === 'function' && (mindEligible(c) || L.mind)) {
    const mind = el('div', 'eld');
    mind.append(el('b', null, 'Awakened mind'), el('p', 'note', L.mind ?
      c.mind?.status || 'Watching for an encounter' : 'A rare, intelligent creature can learn from encounters and choose how to respond. One mind per pond.'));
    if(mindEligible(c)) {
      const labels={wait:'watch',forage:'forage',hunt:'hunt',shelter:'shelter',flee:'flee',explore:'explore',
        rest:'rest',shoal:'join its kind',investigate:'investigate',avoid:'keep distance',ambush:'wait in ambush',camouflage:'camouflage',ink:'ink escape'};
      mind.append(el('p','note','Choices here: '+mindEncounter(world,c).options.map(o=>labels[o.action]).join(' · ')));
    }
    if (!world.observe) {
      const button = el('button', null, L.mind ? 'Return to instincts' : 'Awaken mind');
      button.type = 'button'; button.disabled = !L.mind && !mindEligible(c);
      button.setAttribute('aria-pressed', String(!!L.mind));
      button.addEventListener('click', () => { awakenMind(world,c); renderCreature(); });
      mind.append(button);
    }
    parts.push(mind);
  }
  const gradeChip = chip(`${GRADES[gr]} quality`, GRADE_COLOR[gr]);
  gradeChip.title = 'Graded from its genes: its working genes against the average, gifts up, curses down. It sets what it is worth.';
  parts.push(Object.assign(el('div', 'chips'), {}).appendChild(gradeChip).parentNode);
  if (d.traits.length || d.carries.length) {
    const t = el('div', 'chips');
    for (const tr of byRarity(d.traits)) {
      const c = chip(traitName(tr), traitColor(tr));
      if (TRAIT_NOTES[tr]) c.title = `${traitName(tr)}\n${TRAIT_NOTES[tr]}`;
      t.append(c);
    }
    for (const k of d.carries) { const ch = chip(`carries ${k}`, CLASS_COLOR[k] || '#8fbcb8'); ch.classList.add('carrier'); t.append(ch); }
    parts.push(t);
  }
  // The mark: its stage, how fast it's coming on, and what you can do about it.
  const st = eldStage(L);
  if (st >= 0) {
    const box = el('div', 'eld');
    const stage = el('b', null, `The mark: ${ELD_STAGES[st]}`);
    stage.style.color = CLASS_COLOR[st === 2 ? 'eldritch' : st === 1 ? 'changed' : 'touched'];
    const bar = el('span', 'gbar'), fillEl = el('i');
    fillEl.style.width = `${Math.round((L.corruption || 0) * 100)}%`;
    fillEl.style.background = 'linear-gradient(90deg, #8a5ae0, #3aff9a)';
    bar.append(fillEl);
    const rate = eldRate(world, c) * L.lifespan;
    const markNote = colored('span', 'note', L.bound ? 'Bound' : rate > 4 ? 'Changing fast' : rate > 2 ? 'Changing' : 'Changing slowly');
    markNote.title = L.bound ? 'The change in it has stopped.' : `The mark grows faster at night, in deep water, and near the idol, whale fall or mythic.${st === 2 ? ' It draws nearby animals and can spread at night.' : ''}`;
    box.append(stage, bar, markNote);
    if (here && !world.observe) {
      const acts = el('div', 'eld-acts');
      const fd = el('button', null);
      fd.type = 'button';
      fd.append(document.createTextNode('Feed the dream '), el('i', 'essence'), document.createTextNode(String(feedDreamCost(c))));
      fd.disabled = (world.game.essence || 0) < feedDreamCost(c) || L.corruption >= 1;
      fd.addEventListener('click', () => { feedDream(world, c); renderCreature(); });
      const bd = el('button', null);
      bd.type = 'button';
      bd.append(document.createTextNode('Bind it '), el('i', 'essence'), document.createTextNode(String(bindCost(c))));
      bd.disabled = (world.game.essence || 0) < bindCost(c);
      bd.addEventListener('click', () => { bindMark(world, c); renderCreature(); });
      acts.append(fd, bd);
      box.append(acts);
    }
    parts.push(box);
  }
  // Growing its traits (traits.js): essence raises its genes; corruption, the eldritch.
  if (here && !world.observe) {
    parts.push(el('h4', null, 'Grow its traits'));
    const tree = el('div', 'trait-tree');
    for (const key of ANIMAL_TRAITS) {
      const E = ENHANCE[key], lv = animalLevel(c, key), cost = animalTraitCost(c, key);
      tree.append(traitButton(E.label, 'essence', lv < ANIMAL_MAX ? cost : null, `${E.label}: ${E.note}${masteryTip(key, lv, ANIMAL_MAX)}`, lv >= ANIMAL_MAX, () => buyAnimalTrait(world, c, key), pips(lv, ANIMAL_MAX), (GENE_INFO[E.buff] || {}).color, renderCreature));
    }
    const eldKeys = Object.entries(ELD_TRAITS).filter(([, T]) => T.ok(c) && (!T.path || eldPath(world, T.path)));
    for (const [k, T] of eldKeys) tree.append(traitButton(T.label, 'corruption', T.cost(c), T.note, false, () => buyEldTrait(world, c, k), null, '#3aff9a', renderCreature));
    parts.push(tree);
    // The hunt (hunters.js): a predator's ten-level ladders, or waking a grazer to it.
    if (isPredator(c)) {
      parts.push(el('h4', null, 'The hunt'));
      const hunt = el('div', 'trait-tree');
      for (const [k, H] of Object.entries(HUNT)) {
        const lv = huntLv(c, k);
        hunt.append(traitButton(H.label, H.cur, lv < HUNT_MAX ? huntCost(c, k) : null, `${H.note}${masteryTip(k, lv, HUNT_MAX)}`, lv >= HUNT_MAX, () => buyHunt(world, c, k), pips(lv, HUNT_MAX), H.cur === 'corruption' ? '#3aff9a' : '#ef6f6c', renderCreature));
      }
      parts.push(hunt);
    } else if (canBeHunter(c)) {
      const wake = el('div', 'trait-tree');
      const b = traitButton('Wake it to the hunt', 'corruption', AWAKEN.corruption, `it starts to hunt smaller animals (and ${AWAKEN.essence} essence)`, false, () => awakenHunter(world, c), null, '#ef6f6c', renderCreature);
      b.disabled = b.disabled || (world.game.essence || 0) < AWAKEN.essence;
      wake.append(b);
      parts.push(wake);
    }
  }
  const geneHead = el('h4', null, 'Genes');
  geneHead.title = 'Working genes\nPoint at a gene for what it changes. Multipliers centre on ×1; other genes are shown as percentages.';
  parts.push(geneHead);
  const genes = el('ul', 'genes');
  for (const k of BUFF_ROWS) genes.append(geneBar(k, L.buffs[k]));
  parts.push(genes);
  const g = L.genome, geno = el('ul', 'geno');
  for (const [k, [word, mode]] of Object.entries(LOCUS_INFO)) {
    const n = g[k] || 0;
    if (!n) continue;
    const shows = mode === 'dominant' ? true : mode === 'incomplete' ? true : n === 2;
    const what = k === 'leu' ? (n === 2 ? 'leucistic' : 'pale (one copy shows partly)') : k === 'mar' ? (n === 2 ? 'shows, and frail' : 'shows')
      : k === 'mut' ? (n === 2 ? 'hypermutable young' : 'carrier') : shows ? 'shows' : 'carrier';
    const li = el('li'), name = el('b', null, word);
    name.style.color = CLASS_COLOR[word] || '#b49cf0';
    li.title = `${word}\n${n} of 2 copies · ${mode}. ${shows ? 'This look is visible.' : 'A hidden copy can pass to its young.'}`;
    li.append(name, el('span', 'al', n === 2 ? '●●' : '●○'), colored('span', null, `${what} · ${mode}`));
    geno.append(li);
  }
  if (g.chi) geno.append(colored('li', null, 'chimera: two lineages in one body (not inherited)'));
  parts.push(el('h4', null, 'Genotype'));
  parts.push(geno.children.length ? geno : el('p', 'note', 'No variant alleles: a wild-type animal.'));
  parts.push(el('p', 'note', `Inbreeding ${Math.round((L.inbred || 0) * 100)}% · hybrid vigour +${Math.round((L.buffs.vigor - 1) * 100)}%`));
  if (rec) {
    parts.push(el('h4', null, 'Family'));
    const { svg, parents, kids } = familyTree(rec);
    parts.push(svg);
    const pn = parents.length ? parents.map((p) => p.n).join(' & ') : rec.how === 'arrived' ? 'arrived from outside' : rec.how === 'bought' ? 'spawned by you' : 'a founder';
    parts.push(colored('p', 'note', `Parents: ${pn} · ${kids.length} young · +${rec.pts} points · ${rec.how} on day ${Math.floor(rec.b || 0) + 1}`));
  }
  const story = world.journal.filter((e) => e.subject === c).slice(0, 4);
  if (story.length) {
    parts.push(el('h4', null, 'Story'));
    const ul = el('ul', 'story');
    for (const e of story) { const li = colored('li', null, e.text); li.prepend(el('time', null, entryTime(e))); ul.append(li); }
    parts.push(ul);
  }
  const acts = el('div', 'cr-acts');
  if (here && !world.observe) {
    const f = el('button', null, cam.follow === c ? 'Following' : 'Follow');
    f.title = 'Follow\nThe camera rides along with it (F). Esc or dragging stops.';
    f.type = 'button';
    f.addEventListener('click', () => { cam.tour = false; byId('tour').setAttribute('aria-pressed', false); follow(c); });
    const r = el('button', 'recycle');
    r.type = 'button';
    r.append(document.createTextNode('Recycle +'), el('i', 'essence'), document.createTextNode(String(recycleValue(c))));
    r.title = 'Return this animal to the pond for essence';
    r.disabled = isSafe(c);
    const keep = el('button', isSafe(c) ? 'keep on' : 'keep', isSafe(c) ? '🔒 Kept safe' : 'Keep safe');
    keep.type = 'button';
    keep.title = isSafe(c) ? 'Kept safe from recycling (the Net and recycle all skip it). Click to unmark' : 'Keep this animal safe from recycling';
    keep.addEventListener('click', () => { toggleSafe(c); renderCreature(); });
    r.addEventListener('click', () => {
      if (d.tier >= 3 && !confirm(`Recycle ${d.name}, a ${TIERS[d.tier]} ${d.label}? It will be gone for good.`)) return;
      recycle(c);
      renderCreature();
    });
    acts.append(f, r, keep);
    if (world.hatchery && BREED[c.species === 'tadpole' ? 'frog' : c.species] && c.species !== 'tadpole') {
      const h = el('button', 'to-hatch', 'To hatchery');
      h.type = 'button';
      h.title = 'Move it into the hatchery as one of the breeding pair';
      h.addEventListener('click', () => {
        const why = stockHatchery(world, c);
        if (why) { showTicker(why); return; }
        hideCreature();
        setHatchery(true);
      });
      acts.append(h);
    }
  }
  parts.push(acts);
  box.replaceChildren(...parts);
}


// ---- hatchery panel: the idle breeding game ---------------------------------------------------
// The feed button and progress bar stay put (so fast clicking never lands on a
// replaced button); the pair, focus and upgrade lists rebuild when they change.

const hatchUi = { open: false, timer: 0, sig: '' };

function setHatchery(open) {
  hatchUi.open = open && !!world.hatchery && !world.observe;
  byId('hatchery').hidden = !hatchUi.open;
  if (hatchUi.open) { closeWindows('hatchery'); hatchUi.sig = ''; renderHatchery(); }
}

function renderHatchery() {
  const H = world.hatchery;
  if (!hatchUi.open || !H) return;
  const cost = hatchCost(H), pairs = hatchPairs(H), single = hatchSingle(H), n = hatchBroodSize(H), auto = hatchAuto(H), [next] = nextHatchPair(world);
  byId('hatch-broods').textContent = H.broods ? `· ${H.broods} brood${H.broods > 1 ? 's' : ''}` : '';
  byId('hatch-click').textContent = `+${hatchClick(H).toFixed(2).replace(/\.?0+$/, '')}`;
  byId('hatch-fill').style.width = `${Math.round(Math.min(1, H.nutrients / cost) * 100)}%`;
  const ready = Math.floor(H.nutrients / cost);
  byId('hatch-status').textContent = !pairs.length
    ? 'Stock a breeding pair: choose one below, or open an animal\u2019s card and choose \u201cTo hatchery\u201d.'
    : !next ? `Resting: every kind stocked already has ${hatchCap(world)} or more in the pond`
      : `${pairs.length} pair${pairs.length > 1 ? 's' : ''} taking turns · ${Math.floor(H.nutrients)} of ${cost} food · up to ${n} young a brood${ready > 1 ? ` · ${ready} broods ready` : ''}${auto ? ` · auto-feeding ${auto.toFixed(2)}/s` : ''}`;
  const sig = JSON.stringify([H.stock.map((r) => r.s), H.focus, H.levels, Math.floor(world.game.pearls / 5), Math.floor((world.game.essence || 0) / 5),
    Math.floor(world.t / 4), (world.game.fossilGenes || []).length]);
  if (sig === hatchUi.sig) return;
  hatchUi.sig = sig;
  // The pens: each stocked animal, pen by pen, with whether its pair is resting.
  const pen = new Map();
  pairs.forEach((p, k) => p.forEach((r) => pen.set(r, k)));
  const stock = H.stock.map((rec, i) => {
    const li = el('li', 'slot');
    const tier = tierOf(rec.traits || []), nm = el('b', null, rec.name);
    if (tier) nm.style.color = TIER_COLOR[tier];
    const label = rec.species === 'wild' && rec.args.sp ? rec.args.sp.name : SINGULAR[rec.species] || rec.species;
    const rel = el('button', null, 'Release');
    rel.type = 'button';
    rel.title = 'Put it back in the pond';
    rel.addEventListener('click', () => { releaseStock(world, i); hatchUi.sig = ''; renderHatchery(); });
    const k = pen.get(rec), rest = k != null && pairResting(world, pairs[k]);
    li.append(nm, colored('span', 'note', `${k != null ? `pen ${k + 1} · ` : 'waiting for a mate · '}${label} · gen ${rec.gen}${rest ? ' · resting (plenty in the pond)' : ''}`), rel);
    if (rec.traits.length) li.append(traitChips(rec.traits, 6));
    return li;
  });
  // Empty places: the pond's breeding lines to choose from, most valuable first.
  if (single || H.stock.length + 2 <= hatchSlots(H)) {
    const cands = hatchCandidates(world), pick = el('li', 'slot empty picker');
    pick.append(el('span', 'sc-sub', single ? `Pair ${single.name} with:` : pairs.length ? `Pen ${pairs.length + 1}: choose another pair (a different kind breeds best)` : 'Choose a breeding pair from your pond'));
    if (!cands.length) pick.append(el('span', 'note', single ? 'No other grown animal of its kind in the pond yet.' : 'No other kind has two grown animals yet: let the pond grow, or spawn some from the dock.'));
    const rows = single
      ? cands.flatMap((c) => c.list.slice(0, 6).map((a) => ({ animals: [a], key: c.key })))
      : cands.slice(0, 8).map((c) => ({ animals: c.list.slice(0, 2), key: c.key, n: c.list.length }));
    for (const row of rows) {
      const first = row.animals[0], b = el('button', 'pair'), ic = el('span', 'ic');
      b.type = 'button';
      ic.append(iconImg(iconFor(first), 26));
      const who = el('div', 'who');
      for (const a of row.animals) {
        const t = tierOf(a.life.traits), nm = el('b', null, a.life.name);
        if (t) nm.style.color = TIER_COLOR[t];
        who.append(nm, a.life.traits.length ? traitChips(a.life.traits, 4) : el('span', 'tr', describe(a).label));
      }
      const val = el('span', 'val');
      val.append(el('i', 'essence'), document.createTextNode(String(row.animals.reduce((s, a) => s + recycleValue(a), 0))));
      b.append(ic, who, val);
      b.title = row.n ? `${describe(first).label}: ${row.n} grown in the pond. These two go into a pen.` : `Put ${first.life.name} in as the other half of the pair`;
      b.addEventListener('click', () => {
        for (const a of row.animals) { const why = stockHatchery(world, a); if (why) { showTicker(why); break; } }
        hatchUi.sig = '';
        renderHatchery();
      });
      pick.append(b);
    }
    stock.push(pick);
  }
  byId('hatch-stock').replaceChildren(...stock);
  // Ancient genes waiting to be infused into the next brood.
  const genes = world.game.fossilGenes || [];
  const inf = byId('hatch-infuse');
  inf.hidden = !genes.length && !H.infuse;
  inf.replaceChildren(el('span', 'sc-sub', H.infuse ? `The next brood's first young will carry the ancient ${H.infuse} gene` : 'Infuse an ancient gene into the next brood:'),
    ...(H.infuse ? [] : genes.map((g, i) => {
      const b = el('button', 'chip', g);
      b.type = 'button';
      b.style.color = CLASS_COLOR[g] || '#ffd166';
      b.addEventListener('click', () => { H.infuse = genes.splice(i, 1)[0]; hatchUi.sig = ''; renderHatchery(); });
      return b;
    })));
  // What to breed for.
  const dreamOk = (world.erosion && world.erosion.tier >= 2) || world.creatures.some((c) => c.life && c.life.genome.eld) || H.stock.some((r) => r.genome.eld);
  byId('hatch-focus').replaceChildren(...Object.entries(HATCH_FOCUS).filter(([key]) => key !== 'dream' || dreamOk).map(([key, f]) => {
    const b = el('button', 'chip', f.label);
    b.type = 'button';
    b.setAttribute('aria-pressed', H.focus === key);
    const info = GENE_INFO[key] || (key === 'calm' ? GENE_INFO.aggression : key === 'rarity' ? GENE_INFO.luck : key === 'size' ? { color: '#ffb86b' } : key === 'dream' ? { color: '#3aff9a' } : null);
    if (info) b.style.color = info.color;
    b.addEventListener('click', () => { H.focus = key; renderHatchery(); });
    return b;
  }));
  // Upgrades.
  byId('hatch-ups').replaceChildren(...Object.entries(HATCH_UPGRADES).map(([key, u]) => {
    const lvl = H.levels[key], max = lvl >= u.max, price = upgradeCost(key, lvl);
    const have = u.cur === 'essence' ? world.game.essence || 0 : world.game.pearls;
    const li = el('li'), b = el('button');
    b.type = 'button';
    b.disabled = max || have < price;
    b.append(max ? document.createTextNode('max') : el('i', u.cur === 'essence' ? 'essence' : 'pearl'), document.createTextNode(max ? '' : ` ${fmt(price)}`));
    b.addEventListener('click', () => {
      if (u.cur === 'essence' ? !spendEssence(world, price, 'build') : !spend(world, price, 'build')) return;
      H.levels[key]++;
      renderHatchery();
    });
    li.append(el('b', null, u.label), el('span', 'lv', `lv ${lvl}`), b, el('span', 'note', u.note));
    return li;
  }));
}


// ---- the depths: a side view of the pond, and the evolution tree ------------------------------------
// The slice (above the minimap) is the pond cut from the beach to the far side: the beach and the tide,
// the floor laid down in layers, and the water over it as each depth would look: sunlight slanting into
// the shallows over the pond's own plants, then whip corals in the twilight, lights in the midnight dark,
// and in the abyss the vents (salt) or the drowned cathedral's pillars (fresh), and past that the deep
// past's own (a sunken city, eyes). Everything in it is placed by the pond, so it doesn't flicker; a dot
// for each animal at its depth. Clicking it opens the tree: each depth tier on the fresh and salt
// branches, and the species it lets you spawn.

const evoUi = { open: false, timer: 0, sig: '' };
const SLICE_SKY = hexToInt('#7ec8e0'), SLICE_SAND = hexToInt('#c8b484'), SLICE_ROCK = hexToInt('#2a2e34'), SLICE_WATER = hexToInt('#1b6a7c');
const SL = {
  foam: hexToInt('#e8f4f8'), clay: hexToInt('#5e4a34'), stone: hexToInt('#34302c'), bed: hexToInt('#141210'), grit: hexToInt('#a8966e'), pebble: hexToInt('#24201c'),
  shell: hexToInt('#efe6d6'), bone: hexToInt('#d8ccb0'), ray: hexToInt('#d8f4f0'), snow: hexToInt('#9aaab0'),
  reed: hexToInt('#6e8a34'), reedHead: hexToInt('#5a3a1a'), weed: hexToInt('#3e7a36'), kelp: hexToInt('#6a6a1e'), pad: hexToInt('#5a9a34'),
  coral: [hexToInt('#ff7a5a'), hexToInt('#ffb04a'), hexToInt('#c05ae0'), hexToInt('#ff5a9a'), hexToInt('#f0e0a0')], anemone: hexToInt('#ff8ac0'), urchin: hexToInt('#2a1422'), marimo: hexToInt('#3a7a2a'),
  whip: hexToInt('#7a2a3a'), glow: [hexToInt('#5af0ff'), hexToInt('#7aff9a'), hexToInt('#b08aff')], vent: hexToInt('#0e0a0a'), ember: hexToInt('#ff7a2a'), plume: hexToInt('#2e2a36'),
  pale: hexToInt('#a8a8b8'), ruin: hexToInt('#2e323c'), lamp: hexToInt('#ffd87a'), eye: hexToInt('#ffd84a'), stal: hexToInt('#24221e'), tube: hexToInt('#e8e0d8'), tubeTip: hexToInt('#e0303a'),
  hull: hexToInt('#3a2616'), isle: hexToInt('#d8c490'), green: hexToInt('#4a8a2c'), fan: hexToInt('#c04a8a'), sponge: hexToInt('#e0a030'), flower: hexToInt('#f0a0c0'),
  grape: hexToInt('#5ac44a'), hornwort: hexToInt('#2a6224'),
};
// How each plant shows in the side view, a few pixels high: [colour, height, shape]. (flora.js adds its own.)
const SLICE_PLANT = {
  weed: ['weed', 4, 'strand'], eelgrass: ['weed', 5, 'strand'], anemone: ['anemone', 2, 'blob'], coral: ['coral', 3, 'blob'], urchin: ['urchin', 1, 'dot'],
  marimo: ['marimo', 2, 'blob'], duckweed: [null, 0, 'surface'], lily: [null, 0, 'surface'], blackcoral: ['urchin', 4, 'branch'], glowcap: ['glow', 1, 'dot'],
  tubeworms: ['tube', 4, 'tube'], paleroots: ['pale', 2, 'strand'], sealily: ['pale', 4, 'strand'], weepmoss: ['weed', 3, 'strand'], starweed: ['glow', 4, 'tube'],
};

function drawSlice() {
  const cv = byId('slice'), g = cv.getContext('2d'), S = cv.width, T = cv.height, img = g.createImageData(S, T), px = new Uint32Array(img.data.buffer);
  const side = world.shoreSide ?? 3, axisX = side < 2, len = axisX ? world.W : world.H, cross = axisX ? world.H : world.W;
  // a: distance from the landward edge (0) out to the far side (len); pos: the world coordinate along the axis.
  const posOf = (a) => (side === 0 || side === 2 ? a : len - 1 - a), aOf = (pos) => (side === 0 || side === 2 ? pos : len - 1 - pos);
  const at = (a, f) => { const pos = clamp(posOf(a), 0, len - 1); return axisX ? [pos, cross * f] : [cross * f, pos]; };
  const k = T / 44, tide = world.shore ? world.tide.level : 0.5, surf = Math.round(6 * k + (1 - tide) * 10 * k), toeY = 22 * k, shelfY = 27 * k, abyssY = T - 3;
  // Where the beach ends and where the drop-off begins (across three lines of the pond).
  let beach = 0, lip = len;
  if (world.shore) for (let a = 0; a < len; a += 2) { if ([0.3, 0.5, 0.7].some((f) => shoreAt(world, ...at(a, f)) > 0.02)) beach = a; }
  if (world.depth) for (let a = beach; a < len; a += 2) { if ([0.3, 0.5, 0.7].some((f) => depthAt(world, ...at(a, f)) > 0.05)) { lip = a; break; } }
  // The beach keeps at least a quarter of the strip however far the pond grows.
  const share = world.shore && beach > 4 ? Math.max(0.25, beach / len) : 0;
  const toA = (i) => { const u = (i + 0.5) / S; return !share ? u * len : u < share ? u / share * beach : beach + (u - share) / (1 - share) * (len - beach); };
  const toI = (a) => (!share ? a / len : a < beach ? a / beach * share : share + (a - beach) / Math.max(1, len - beach) * (1 - share)) * S;
  const water = world.waterColor || SLICE_WATER, dark = DEEP_COLOR[world.opts.habitat] || DEEP_COLOR.mixed, salt = world.opts.habitat !== 'fresh';
  const ground = new Float32Array(S), depth = new Float32Array(S), wet = new Uint8Array(S), raw = new Uint32Array(S), topC = new Uint32Array(S);
  const bg = world.bg, bgDry = world.bgDry, W = world.W, dk = world.darkness || 0, day = 1 - dk, t = world.t || 0, seed = hashString(world.seed || 'pond') % 997;
  // The floor's own colour where the slice cuts it (the beach dry at the top of the tide), darkened by depth as the pond is.
  const floorAt = (a) => {
    let r = 0, gr = 0, b = 0, n = 0;
    for (const f of [0.3, 0.5, 0.7]) {
      const [x, y] = at(a, f), p = clamp(Math.round(x), 0, W - 1) + clamp(Math.round(y), 0, world.H - 1) * W;
      const c = bg ? (world.shore && world.shore[p] > tide * 255 ? (bgDry ? bgDry[p] : mixColor(bg[p], SUN_DRY, 0.18)) : bg[p]) : SLICE_SAND;
      r += c & 255; gr += (c >> 8) & 255; b += (c >>> 16) & 255; n++;
    }
    return (0xff000000 | (Math.round(b / n) << 16) | (Math.round(gr / n) << 8) | Math.round(r / n)) >>> 0;
  };
  for (let i = 0; i < S; i++) {
    const a = toA(i);
    let e = 0, d = 0;
    for (const f of [0.3, 0.5, 0.7]) { const [x, y] = at(a, f); e += shoreAt(world, x, y) / 3; d += depthAt(world, x, y) / 3; }
    // The beach, then a floor sloping gently down to the drop-off, then the deep shelves.
    const slope = clamp((a - beach) / Math.max(1, lip - beach), 0, 1);
    ground[i] = e > 0.02 ? 6 * k + (1 - e) * (toeY - 6 * k) : d > 0.02 ? shelfY + d * (abyssY - shelfY) : toeY + slope * (shelfY - toeY);
    depth[i] = d; wet[i] = e > 0.02 ? 0 : 1;
    raw[i] = mixColor(floorAt(a), dark, d * 0.85);
  }
  // (The floor's colour smoothed along the cut, so it reads as ground, not as stripes.)
  for (let i = 0; i < S; i++) {
    let r = 0, gg = 0, b = 0;
    for (let o = -3; o <= 3; o++) { const c = raw[clamp(i + o, 0, S - 1)]; r += c & 255; gg += (c >> 8) & 255; b += (c >>> 16) & 255; }
    topC[i] = (0xff000000 | (Math.round(b / 7) << 16) | (Math.round(gg / 7) << 8) | Math.round(r / 7)) >>> 0;
  }
  const rain = world.weather ? world.weather.rain : 0, cast = typeof skyCast === 'function' ? skyCast(world) : null;
  let sky0 = mixColor(SLICE_SKY, 0xff9aa4a8, rain * 0.6), sky1 = mixColor(SLICE_SKY, 0xffe0f0f4, 0.35);
  if (cast) { sky0 = mixColor(sky0, cast.c, cast.k); sky1 = mixColor(sky1, cast.c, cast.k * 0.7); }
  const surfaceY = new Float32Array(S);
  const sliceWaves = world.opts.hdWaves && typeof waveField === 'function' ? waveField({ t: waveTime(world), swell: surfaceSwell(world),
    swellDir: world.shore ? world.shoreN : [0.8, 0.6], gust: world.weather.gust, rain,
    surf: world.tide.surf, tide: world.tide.level, shore: world.shore, depth: world.depth, riverMask: world.riverMask }) : null;
  const crest = sliceWaves ? new Float32Array(4) : null;
  for (let i = 0; i < S; i++) {
    const gnd = ground[i], d = depth[i], wav = (fbm(i * 0.06, 3.1, 61 + seed) - 0.5) * 5;
    if (sliceWaves) {
      const [x, y] = at(toA(i), 0.5), xi = clamp(Math.round(x), 0, world.W - 1), yi = clamp(Math.round(y), 0, world.H - 1);
      waveAt(sliceWaves, xi, yi, xi + yi * world.W, crest);
      surfaceY[i] = clamp(surf - crest[0] * 0.7, 2, T - 5);
    } else surfaceY[i] = surf;
    for (let j = 0; j < T; j++) {
      let c;
      if (j >= gnd) {
        // Under the floor: the floor's own colour on top, then what it lies on (sand, clay, stone, bedrock),
        // the boundaries wandering; grit and pebbles in the layers.
        const dj = j - gnd, L = dj + wav * 0.6;
        c = dj < 1.5 ? topC[i] : L < 5 ? mixColor(topC[i], SL.clay, 0.3 + 0.15 * (j & 1)) : L < 9 ? mixColor(SL.clay, SL.stone, 0.55) : mixColor(SL.stone, SL.bed, clamp((L - 9) / 10, 0, 1));
        if (dj >= 1.5) { const h = hash2(i, j, 11 + seed); if (h < 0.05) c = mixColor(c, SL.grit, 0.45); else if (h > 0.97) c = SL.pebble; }
        c = mixColor(c, 0xff000000, d * 0.45 + dk * 0.25);
      } else if (j < surfaceY[i]) {
        c = mixColor(mixColor(sky1, sky0, j / Math.max(1, surfaceY[i])), 0xff101820, dk * 0.8);
        if (dk > 0.5 && hash2(i, j, 5) > 0.985) c = 0xffd8e0f0; // (stars)
      } else {
        const u = clamp((j - surfaceY[i]) / (abyssY - surfaceY[i]), 0, 1), under = j - surfaceY[i];
        c = mixColor(water, dark, u * 0.95);
        if (!salt && d >= 0.45 && d < 0.75) c = mixColor(c, 0xff000000, 0.3); // (under the cave's roof)
        // Sunlight slanting down into the shallows, fading as it goes.
        if (day > 0.25 && under < 12 * k && d < 0.3 && ((i + j * 0.55 + seed) % 9) < 1.4) c = mixColor(c, SL.ray, (1 - under / (12 * k)) * 0.2 * day);
      }
      px[i + j * S] = c;
    }
  }
  const put = (i, j, c) => { i = Math.round(i); j = Math.round(j); if (i >= 0 && i < S && j >= 0 && j < T) px[i + j * S] = c; };
  const inWater = (i, j) => j > surfaceY[clamp(Math.round(i), 0, S - 1)] && j < ground[clamp(Math.round(i), 0, S - 1)];
  // The water's surface, lapping.
  const lap = Math.floor(t * 3);
  for (let i = 0; i < S; i++) if (ground[i] > surfaceY[i]) put(i, surfaceY[i], sliceWaves
    ? mixColor(water, SL.foam, clamp(0.2 + Math.abs(surfaceY[i] - surf) * 0.12, 0.2, 0.8))
    : (i + lap) % 7 < 4 ? SL.foam : mixColor(water, SL.foam, 0.5));
  // What the depths hold, column by column (a hash of the pond and the column decides; the deep past's own at the bottom).
  const tier = world.erosion ? world.erosion.tier : 0;
  for (let i = 0; i < S; i++) {
    const d = depth[i], gnd = Math.floor(ground[i]), h = hash2(i, 3, 19 + seed), h2 = hash2(i, 9, 23 + seed);
    if (!wet[i]) { if (gnd < surf && h < 0.12) put(i, gnd, h < 0.06 ? SL.shell : SL.bone); continue; } // (shells and bits of bone up the beach)
    if (d < 0.02) continue; // (the shallow floor: its own plants, below)
    if (d < 0.45) {
      // The twilight (the deep lake): whip corals, or long weed; marine snow drifting down.
      if (h < 0.18) for (let q = 1; q <= 2 + (h2 * 3 | 0); q++) put(i + (q > 2 && h2 > 0.5 ? 1 : 0), gnd - q, mixColor(salt ? SL.whip : SL.weed, dark, 0.35));
      if (h > 0.8) put(i, surf + 2 + ((h2 * 97 + t * 1.5) % Math.max(1, gnd - surf - 3)), mixColor(SL.snow, dark, 0.4));
    } else if (d < 0.75) {
      // The midnight dark (the sunless cave): lights that come and go; in a cave, its roof and the drips hanging from it.
      if (h < 0.22 && Math.sin(t * (1.2 + h2) + h * 40) > 0.35) { const y = surf + 3 + h2 * (gnd - surf - 5); if (inWater(i, y)) put(i, y, SL.glow[(h * 30 | 0) % 3]); }
      if (!salt) {
        const roof = 2 + (h2 < 0.5 ? 1 : 0), drip = h < 0.4 ? 1 + ((h * 40) | 0) % 5 : 0;
        for (let q = 1; q <= roof + drip; q++) put(i, surf + q, q === roof + drip && drip ? mixColor(SL.stal, SL.pale, 0.3) : SL.stal);
      }
    } else {
      // The abyss: vents smoking (salt) or the drowned cathedral's pale pillars (fresh); past it, a sunken city and eyes.
      const deepest = tier >= 7 && h2 < 0.25 ? 'city' : tier >= 8 && h2 > 0.93 ? 'eyes' : 'abyss';
      if (deepest === 'city' && h < 0.5) {
        const tall = 3 + (h * 12 | 0);
        for (let q = 1; q <= tall; q++) put(i, gnd - q, SL.ruin);
        if (Math.sin(t * 0.7 + h * 50) > 0.6) put(i, gnd - tall + 1, SL.lamp);
      } else if (deepest === 'eyes') {
        if (Math.sin(t * 0.5 + h * 20) > 0.2) { put(i, gnd - 5, SL.eye); put(i + 2, gnd - 5, SL.eye); }
      } else if (salt && h < 0.1) {
        for (let q = 1; q <= 3; q++) put(i, gnd - q, SL.vent);
        put(i, gnd - 4, (t * 4 + h * 9) % 2 < 1.4 ? SL.ember : SL.vent);
        for (let q = 5; q < 9; q++) put(i + Math.round(Math.sin(t * 1.5 + q + h * 9) * 0.6), gnd - q, SL.plume);
      } else if (!salt && h < 0.12) {
        const tall = 5 + (h2 * 4 | 0);
        for (let q = 1; q <= tall; q++) put(i, gnd - q, mixColor(SL.pale, dark, 0.3 + 0.2 * (q & 1)));
        put(i - 1, gnd - tall, SL.pale); put(i + 1, gnd - tall, SL.pale);
      }
      if (h > 0.9 && Math.sin(t * 0.9 + h * 30) > 0.5) { const y = surf + 4 + h2 * (gnd - surf - 6); if (inWater(i, y)) put(i, y, SL.glow[0]); }
    }
  }
  // The pond's own plants, islands and wrecks, each at its place along the cut (one plant to a column, the tallest kept).
  const took = new Int8Array(S), colOf = (x, y) => clamp(Math.floor(toI(aOf(axisX ? x : y))), 0, S - 1);
  for (const p of [...world.plants, ...world.pads]) {
    const P = SLICE_PLANT[p.make] || (typeof FLORA_PLANTS !== 'undefined' && FLORA_PLANTS[p.make] && FLORA_PLANTS[p.make].slice);
    if (!P) continue;
    const i = colOf(p.x, p.y), [col, hgt, shape] = P, grow = p.growth ?? 1, gnd = Math.floor(ground[i]), H = Math.max(1, Math.round(hgt * grow * k));
    if (took[i] >= H) continue;
    took[i] = H;
    const hh = hash2(p.seed || i, 1, 5), c = col === 'coral' ? SL.coral[(hh * 5) | 0] : col === 'glow' ? SL.glow[(hh * 3) | 0] : SL[col] || SL.weed;
    if (shape === 'surface') { if (ground[i] > surf) { put(i, surf, SL.pad); put(i + 1, surf, SL.pad); } continue; }
    if (shape === 'reed') { for (let y = gnd - 1; y >= surf - 3; y--) put(i, y, SL.reed); put(i, surf - 4, SL.reedHead); put(i, surf - 5, SL.reedHead); continue; }
    if (shape === 'kelp') { for (let y = gnd - 1; y > surf + 1; y--) put(i + ((y + (t * 2 | 0)) % 5 === 0 ? 1 : 0), y, (gnd - y) % 4 === 0 ? mixColor(c, 0xffffffff, 0.25) : c); continue; }
    if (shape === 'flower') { for (let y = gnd - 1; y >= surf; y--) put(i, y, SL.weed); put(i, surf - 1, c); put(i - 1, surf, SL.pad); put(i + 1, surf, SL.pad); continue; }
    if (shape === 'fan') { for (let q = 1; q <= H; q++) for (let o = -Math.min(q - 1, 2); o <= Math.min(q - 1, 2); o++) if ((o + q) & 1) put(i + o, gnd - q, c); continue; }
    for (let q = 1; q <= H; q++) {
      const x = i + (shape === 'strand' && q > 2 ? Math.round(Math.sin(t * 1.3 + q + hh * 9) * 0.6) : 0);
      put(x, gnd - q, shape === 'tube' && q === H ? (col === 'glow' ? SL.glow[0] : SL.tubeTip) : c);
      if ((shape === 'blob' && q === H && H > 1) || (shape === 'branch' && q % 2 === 0)) put(i + 1, gnd - q, c);
    }
  }
  for (const s of world.structures || []) {
    const i = colOf(s.x, s.y), gnd = Math.floor(ground[i]);
    if (s.kind === 'island') {
      const w = Math.max(2, Math.round(islandRadius(world, s) / len * S * (share ? 1 - share : 1)));
      for (let o = -w; o <= w; o++) { const top = Math.round(surf - 2 + Math.abs(o) / w * 3); for (let y = top; y < Math.floor(ground[clamp(i + o, 0, S - 1)]); y++) put(i + o, y, y === top ? SL.green : SL.isle); }
    } else if (s.kind === 'ship') {
      for (let o = -3; o <= 3; o++) { put(i + o, gnd - 1, SL.hull); if (Math.abs(o) < 3) put(i + o, gnd - 2, SL.hull); }
      for (let q = 3; q < 7; q++) put(i, gnd - q, SL.hull);
    }
  }
  // The erosion toward the next tier along the bottom.
  const E = world.erosion, next = E && DEPTH_TIERS[E.tier + 1];
  if (next) {
    const prev = DEPTH_TIERS[E.tier].erosion, kk = clamp((E.e - prev) / (next.erosion - prev), 0, 1);
    for (let i = 0; i < Math.round(S * kk); i++) px[i + (T - 1) * S] = 0xffff8bc3;
  }
  g.putImageData(img, 0, 0);
  // Animals at their depth.
  for (const c of world.creatures) {
    if (!c.life) continue;
    const i = clamp(Math.floor(toI(aOf(axisX ? c.x : c.y))), 0, S - 1);
    const y = lerp(ground[i] - 1, surf + 1, clamp((c.z || 0) / 46, 0, 1));
    g.fillStyle = c.life.genome.eld ? '#3aff9a' : DEEP[c.species] ? (DEEP[c.species].mythic ? '#ff6fae' : '#9ae0ff') : c.life.traits.length ? '#ffd166' : '#dff6f0';
    g.fillRect(i, Math.round(y), 1, 1);
  }
  // What's on screen: the view's stretch of the pond, exact at every zoom.
  if (typeof visibleRect === 'function') {
    const [x0, y0, x1, y1] = visibleRect(), a0 = aOf(axisX ? x0 : y0), a1 = aOf(axisX ? x1 : y1);
    const i0 = Math.floor(toI(Math.min(a0, a1))), i1 = Math.ceil(toI(Math.max(a0, a1)));
    g.strokeStyle = '#ffd166';
    g.lineWidth = 1;
    g.strokeRect(i0 + 0.5, 0.5, Math.max(2, i1 - i0) - 1, T - 1);
  }
  cv.title = `${tierName(world, tier)}${next ? ` · next: ${tierName(world, E.tier + 1).toLowerCase()} (erosion ${E.e.toFixed(1)} of ${next.erosion})` : ' · the deepest the pond can go'}. The box is what's on screen. Click or drag to move the view.`;
}

function setEvo(open) {
  evoUi.open = open;
  byId('evo').hidden = !open;
  if (open) { closeWindows('evo'); evoUi.sig = ''; renderEvo(); }
}

function renderEvo() {
  if (!evoUi.open) return;
  const E = world.erosion || newErosion(), G = world.game, next = DEPTH_TIERS[E.tier + 1];
  const sig = JSON.stringify([E.tier, Math.floor(E.e * 10), G.unlocked || [], Math.floor((G.essence || 0) / 5), Math.floor(G.corruption || 0), G.eldPaths || {}]);
  if (sig === evoUi.sig) return;
  evoUi.sig = sig;
  const eta = tierEta(world);
  byId('evo-status').replaceChildren(colorize(next ? `Now: ${tierName(world, E.tier)}. Erosion ${E.e.toFixed(1)} of ${next.erosion} to reach ${tierName(world, E.tier + 1).toLowerCase()}${eta ? `, ${etaLabel(eta)} at the recent pace` : ''}. Surf and big tides wear the pond fastest (salt water most, fresh least); a faster speed or shorter days speed it up.`
    : `Now: ${tierName(world, E.tier)}, the deepest the pond can go.`));
  const prev = DEPTH_TIERS[E.tier].erosion;
  byId('evo-fill').style.width = next ? `${Math.round(clamp((E.e - prev) / (next.erosion - prev), 0, 1) * 100)}%` : '100%';
  const dig = byId('evo-deepen');
  dig.hidden = !next;
  dig.replaceChildren(document.createTextNode('Wear the pond deeper: '), el('i', 'essence'), document.createTextNode(String(deepenCost(world))));
  dig.disabled = (G.essence || 0) < deepenCost(world);
  const branches = world.opts.habitat === 'mixed' ? ['salt', 'fresh'] : [branchOf(world)];
  // The rare branch: the eldritch, with what's in the pond at each stage.
  const eld = el('div', 'evo-col eld-col');
  eld.append(colored('h3', null, 'The eldritch: a rare branch'));
  const counts = [0, 0, 0];
  for (const c of world.creatures) { const s = c.life ? eldStage(c.life) : -1; if (s >= 0) counts[s]++; }
  const ELD_NOTES = [
    'A mark that comes from nowhere (1 in 3,000 births), from fossils, or from being born near the drowned idol or in the abyss. It passes to young: 15% from one marked parent, 35% from two. The pond resists it: once about one animal in twelve is marked, the dreams stop spreading it.',
    'The change comes on over a lifetime, faster at night, in deep water, near the idol or the whale fall, and near the mythic; in the shallows most die before it’s done. New eyes open; the water nearby feels wrong.',
    'Transcended: a crown of tentacles and a sigil that glows at night. It draws small animals into circling it, drives the closest mad, and dreams its mark into its neighbours. Each one wears the pond deeper.',
  ];
  ELD_STAGES.forEach((name, i) => {
    const node = el('div', counts[i] ? 'evo-node reached' : 'evo-node');
    const b = el('b', null, `${name}${counts[i] ? ` · ${counts[i]} in the pond` : ''}`);
    b.style.color = CLASS_COLOR[['touched', 'changed', 'eldritch'][i]];
    node.append(b, el('span', 'note', ELD_NOTES[i]));
    eld.append(node);
  });
  eld.append(el('p', 'note', 'On a marked animal’s card: feed the dream (essence pushes the change on) or bind it (essence sets it back and stops it). The hatchery can breed for the deep dream.'));
  // The paths: what corruption buys for the whole pond.
  const paths = el('div', 'eld-paths');
  paths.append(colored('h4', null, `The eldritch paths · ${Math.floor(G.corruption || 0)} corruption`));
  for (const [k, P] of Object.entries(ELD_PATHS)) {
    const owned = eldPath(world, k), open = pathOpen(world, k), b = el('button', owned ? 'path owned' : 'path');
    b.type = 'button';
    const nm = el('b', null, P.label);
    b.append(nm);
    if (!owned) { const pr = el('span', 'pr'); pr.append(el('i', 'corrupt'), document.createTextNode(String(P.cost))); b.append(pr); }
    b.append(colored('span', 'note', owned ? `Open: ${P.note}` : P.note));
    b.disabled = !!world.observe || owned || !open || (G.corruption || 0) < P.cost;
    b.title = owned ? 'This path is open' : !open ? `Needs ${P.needs.map((n) => ELD_PATHS[n].label).join(' and ')} first` : `${P.cost} corruption`;
    b.addEventListener('click', () => { if (buyPath(world, k)) { evoUi.sig = ''; renderEvo(); } });
    paths.append(b);
  }
  eld.append(paths);
  byId('evo-tree').replaceChildren(eld, ...branches.map((br) => {
    const col = el('div', 'evo-col');
    col.append(colored('h3', null, br === 'salt' ? 'Salt: down into the abyss' : 'Fresh: down into the drowned cathedral'));
    DEPTH_TIERS.slice(0, Math.max(12, E.tier + 2)).forEach((t, i) => {
      const node = el('div', i <= E.tier ? 'evo-node reached' : 'evo-node');
      node.append(el('b', null, t[br]), el('span', 'note', i <= E.tier ? (i ? 'reached' : 'where every pond starts') : `erosion ${t.erosion}`));
      const kinds = Object.keys(DEEP).filter((k) => DEEP[k].tier === i && (DEEP[k].branch === br || DEEP[k].branch === 'both'));
      const extras = DEEP_EXTRAS.filter((e) => e.tier === i && (e.branch === br || e.branch === 'both' || !e.branch));
      if (extras.length) node.append(colored('span', 'evo-extra', extras.map((e) => `${e.kind === 'build' ? 'Build' : e.kind === 'food' ? 'Food' : 'Plant'}: ${e.label}`).join(' · ')));
      for (const k of kinds) {
        const d = DEEP[k], row = el('div', 'evo-sp'), ic = el('span', 'ic');
        ic.append(iconImg(speciesIcon(k), 24));
        const nm = el('b', null, SINGULAR[k]);
        if (d.mythic) nm.style.color = TIER_COLOR[5];
        row.append(ic, nm);
        if (deepUnlocked(world, k)) row.append(el('span', 'ok', '✓ in the dock'));
        else if (i > E.tier) row.append(el('span', 'note', 'deeper water first'));
        else {
          const b = el('button');
          b.type = 'button';
          b.disabled = (G.essence || 0) < d.unlock;
          b.append(document.createTextNode('Unlock '), el('i', 'essence'), document.createTextNode(String(d.unlock)));
          b.addEventListener('click', () => {
            if (!spendEssence(world, d.unlock, 'evolve')) return;
            G.unlocked = [...(G.unlocked || []), k];
            refreshSpeciesButtons();
            logEvent(world, `You can now spawn ${plural(SINGULAR[k], 2).toLowerCase()} from the dock`, null, { cat: 'pond', pri: 2 });
            evoUi.sig = '';
            renderEvo();
          });
          row.append(b);
        }
        node.append(row);
      }
      col.append(node);
    });
    return col;
  }));
}

// ---- score: points, pearls, the leaderboard and rare finds everywhere -----------------------------

const scoreUi = { open: false, timer: 0, shown: '', boardAt: -1 };
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const findLabel = (f) => `${byRarity(f.traits).slice(0, 3).join(' ')}${f.traits.length > 3 ? ' …' : ''} ${f.species === 'wild' ? 'wild fish' : SINGULAR[f.species] || f.species}`;

function setScore(open) {
  scoreUi.open = open;
  byId('score-panel').hidden = !open;
  byId('score-btn').setAttribute('aria-expanded', open);
  if (open) {
    closeWindows('score-panel');
    renderScorePanel(true);
    if (!Net.board || Date.now() - (Net.board.at || 0) > 60000) refreshBoard();
  }
}

function restartAnim(e, cls) {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}
const flashPearls = () => restartAnim(byId('score-btn'), 'poor');
const fmtShort = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1000)}k` : fmt(n));

// The pond bar at the top: this pond's name, points, pearls and leaderboard place.
function updateScoreHud() {
  const G = world.game;
  if (!G) return;
  const rank = world.link && G.board && G.points >= BOARD_MIN && Net.rank ? `#${Net.rank}` : '';
  if (!world.erosion) return;
  const depth = pondFathoms(world), key = `${depth}|${G.pearls}|${G.essence}|${world.seed}|${rank}|${Math.floor(G.corruption || 0)}`;
  if (key === scoreUi.shown) return;
  const was = scoreUi.shown ? +scoreUi.shown.split('|')[0] : null;
  scoreUi.shown = key;
  byId('bar-name').textContent = pondTitle(world);
  byId('bar-rank').textContent = rank;
  byId('score-points').textContent = `${fmtShort(depth)} fm`;
  byId('score-pearls').textContent = fmtShort(G.pearls);
  byId('score-essence').textContent = fmtShort(G.essence || 0);
  byId('score-corruption').textContent = fmtShort(Math.floor(G.corruption || 0));
  byId('bar-cor').hidden = !(G.corruptionEarned > 0 || G.corruption > 0);
  if (was != null && depth > was) restartAnim(byId('score-btn'), 'bump');
}

// "+15" drifting up from where the points were earned (or "−8" where pearls were spent).
let floats = 0;
function floatAward(x, y, text, kind = 'gain') {
  if (floats >= 8 || document.hidden) return;
  const [sx, sy] = worldToScreen(x, y);
  if (sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight) return;
  const f = el('span', `float-pts ${kind}`, text);
  f.style.left = `${Math.round(sx)}px`;
  f.style.top = `${Math.round(sy - 12)}px`;
  document.body.append(f);
  floats++;
  f.addEventListener('animationend', () => { f.remove(); floats--; });
}

function visitPond(id, slug, title) {
  if (world.link && id === world.link.id) return;
  if (!confirm(`Visit the pond ${title || slug || id}? You get your own copy of it to watch and breed from. Your pond stays saved in "Your ponds".`)) return;
  saveNow();
  world.noSave = true;
  location.assign(`/${slug || id}`); // (by its address, when it has one)
}

// The narrator's state of mind, the balance of light and dark, and the super spawns waiting (with claim buttons).
function renderStoryBits() {
  const box = byId('sp-story');
  if (!box) return;
  const S = world.story || { stage: 0 }, lm = lightMadness(world), sup = (world.game.supers || []);
  const sig = JSON.stringify([S.stage, Math.round(lm * 10), sup.map((s) => s.k + s.traits.join())]);
  if (sig === box.dataset.sig) return;
  box.dataset.sig = sig;
  const parts = [colored('p', 'note', `The narrator: ${STORY_STAGES[S.stage]}. Light and dark: ${lightWord(lm)} (madness ×${lm.toFixed(1)}).`)];
  if (false && sup.length) { // (the Paragons have their own window now: the rail's ♛)
    const list = el('div', 'sc-supers');
    list.append(el('span', 'sc-sub', 'Super spawns waiting'));
    sup.forEach((s, i) => {
      const b = el('button', 'super');
      b.type = 'button';
      b.append(colored('b', null, `♛ Paragon ${byRarity(s.traits).slice(0, 3).join(' ')} ${(SINGULAR[s.k] || s.k).toLowerCase()}`.replace(/\s+/g, ' ')));
      b.disabled = !!world.observe;
      b.addEventListener('click', () => { if (claimSuper(world, i)) { box.dataset.sig = ''; renderStoryBits(); } });
      list.append(b);
    });
    parts.push(list);
  }
  box.replaceChildren(...parts);
}

// The ponds either side along the beach, to walk to.
function renderNeighbours() {
  const box = byId('sp-neighbours');
  if (!box || typeof BEACH === 'undefined') return;
  const rows = [];
  for (const dir of ['west', 'east']) {
    const B = BEACH[dir];
    if (!B) continue;
    const info = B.info || {}, row = el('div', 'nb-row'), go = el('button', null, `${nbScreenDir(dir)} Walk there`);
    go.type = 'button';
    go.addEventListener('click', () => { setScore(false); askNeighbour(dir); });
    row.append(el('b', null, B.home ? 'Your pond' : info.title || B.id), colored('span', 'note', B.home ? 'home, along the beach' : [info.by ? `${info.by}'s pond` : '', `${fmt(info.depth || 1)} fm`, HABITATS[info.habitat] || ''].filter(Boolean).join(' · ')), go);
    rows.push(row);
  }
  box.replaceChildren(...(rows.length ? rows : [el('p', 'note', 'No other ponds along the beach yet.')]));
}

function renderScorePanel(force = false) {
  if (!scoreUi.open || !world.game) return;
  renderNeighbours();
  if (byId('sp-rename-form').hidden) {
    byId('sp-title').textContent = pondTitle(world);
    byId('sp-rename').hidden = !!world.observe;
  }
  const G = world.game, plan = fireflyPlan(world);
  const E = world.erosion || newErosion();
  byId('sp-depth').textContent = `${fmt(pondFathoms(world))} fathoms`;
  byId('sp-zone').textContent = tierName(world, E.tier);
  const parts = Object.entries({ ...(E.parts || {}), points: E.pts || 0 }).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]);
  byId('sp-parts').replaceChildren(colorize(parts.length ? `Deepened by ${parts.map(([k, v]) => `${DEPTH_PARTS[k] || k} ${v.toFixed(1)}`).join(', ')}` : 'The pond has only just begun to wear deeper.'));
  renderStoryBits();
  byId('sp-points').textContent = fmt(G.points);
  byId('sp-pearls').textContent = fmt(G.pearls);
  byId('sp-essence').textContent = fmt(G.essence || 0);
  if (typeof charLine === 'function') { const cl = `This pond: ${charLine(world)}.`; if (byId('sp-char').textContent !== cl) byId('sp-char').textContent = cl; }
  byId('sp-mode').replaceChildren(colorize(`${HABITATS[world.opts.habitat]} water is ${difficulty(world).label.toLowerCase()}: ${difficulty(world).note}. Points ×${difficulty(world).points}.`));
  byId('sp-rank').textContent = world.link && G.board && Net.rank ? `#${Net.rank}` : '–';
  byId('sp-rank-note').textContent = !Net.base ? 'offline' : !G.board ? 'not listed'
    : G.points < BOARD_MIN || !Net.rank ? `listed at ${BOARD_MIN} pts` : `rank${Net.board && Net.board.ponds ? ` of ${fmt(Net.board.ponds)}` : ''}`;
  byId('sp-flies').textContent = `Tonight: ${plan.yellow} of ${plan.full} fireflies${plan.blue ? ` and ${plan.blue} blue` : ''}. ` +
    `A full swarm means the deepest ponds' range, ${fmt(plan.high)}+ fathoms${plan.blue ? '.' : '; blue fireflies come once you reach it.'}`;
  // Litter, visitors and the risk of a blight; and corruption, if there's any.
  const litter = (world.litter || []).length, risk = Math.round(blightRisk(world) * 100);
  byId('sp-coast').replaceChildren(colorize([
    `Visitors: ${fmt(G.views || 0)}`,
    litter ? `litter on the beach: ${litter} (the water ${Math.round((world.pollution || 0) * 100)}% fouled; click it to clear)` : 'the beach is clean',
    world.blight ? `${capFirst(BLIGHTS[world.blight.k].label(world))} is in the pond` : `risk of a blight at dawn: ${risk}%`,
    world.river ? `the river runs ${world.river.w} wide` : '',
    G.recycled ? `the scavengers have recycled ${fmt(G.recycled)} bits of waste and litter` : '',
    G.corruptionEarned ? `corruption: ${Math.floor(G.corruption || 0)}` : '',
  ].filter(Boolean).join(' · ') + '. Popular, high-scoring ponds draw more litter; aerators make blights rarer.'));
  // What's been invested, and what it pays.
  const inv = G.inv || {}, [dv, de] = dividendOf(world), k = difficulty(world).points * sizeFairness(world);
  const lines = Object.entries(INVEST).filter(([c]) => (inv[c] || 0) >= 1).map(([c, d]) => `${d.label} ${fmt(Math.round(inv[c]))}`);
  byId('sp-invest').replaceChildren(colorize(lines.length
    ? `Invested, in pearls' worth: ${lines.join(', ')}. Each dawn that pays about ${fmt(Math.round(dv * k))} points and ${fmt(Math.round(de))} essence.`
    : 'Whatever you build, plant, bring in, evolve or deepen is an investment: a tenth comes back as points straight away, and it pays points and essence every dawn after.'));
  byId('sp-best').textContent = G.best ? `Best find: ${TIERS[G.best.tier]} ${findLabel(G.best)}${G.best.name ? `, ${G.best.name}` : ''}` : '';
  byId('sp-recent').replaceChildren(...(G.recent.length ? G.recent.slice(0, 6).map((r) => {
    const li = el('li');
    const amount = el('b', r.ess ? 'ess' : null, `+${fmt(r.n)}`);
    if (r.ess) amount.append(el('i', 'essence'));
    li.append(amount, colored('span', null, r.why), el('time', null, `D${r.day} ${clockLabel(r.clock)}`));
    return li;
  }) : [el('li', 'empty', 'Nothing yet: births, rare animals and each dawn pay points.')]));
  byId('sp-join').checked = !!G.board;
  byId('pond-lock').checked = !!G.lock;

  const b = Net.board;
  if (!force && (!b || b.at === scoreUi.boardAt)) return;
  scoreUi.boardAt = b ? b.at : -1;
  const mine = world.link && world.link.id;
  if (!b || !b.top) {
    byId('sp-board').replaceChildren(el('li', 'empty', Net.base ? 'Loading the leaderboard…' : 'The leaderboard needs pond.nz; this copy runs offline.'));
    byId('sp-finds').replaceChildren();
    return;
  }
  const rows = b.top.map((p, i) => {
    const li = el('li', p.id === mine ? 'me' : ''), btn = el('button', 'board-row');
    btn.type = 'button';
    btn.title = p.id === mine ? 'Your pond' : `Visit ${p.id}`;
    btn.append(el('span', 'rk', `#${i + 1}`), el('b', null, p.title || p.id), el('span', 'pt', `${fmt(p.depth || 1)} fm`),
      el('span', 'mt', [p.by && `${p.by}'s`, p.best && `${TIERS[p.best.tier]} ${findLabel(p.best)}`, `${fmt(p.points)} points`, `${p.animals} animals`, `day ${Math.floor(p.days) + 1}`].filter(Boolean).join(' · ')));
    if (p.best) btn.querySelector('.mt').style.color = TIER_COLOR[p.best.tier];
    btn.addEventListener('click', () => visitPond(p.id, p.slug, p.title));
    li.append(btn);
    return li;
  });
  if (mine && Net.rank && !b.top.some((p) => p.id === mine)) {
    const li = el('li', 'me'), row = el('div', 'board-row');
    row.append(el('span', 'rk', `#${Net.rank}`), el('b', null, mine), el('span', 'pt', `${fmt(pondFathoms(world))} fm`), el('span', 'mt', 'your pond'));
    li.append(row);
    rows.push(li);
  }
  byId('sp-board').replaceChildren(...(rows.length ? rows : [el('li', 'empty', 'No ponds yet. Yours could be first.')]));
  if (!(b.finds || []).length) { byId('sp-finds').replaceChildren(el('li', 'empty', 'None yet. Rare, Epic and better animals from every pond show up here.')); return; }
  // Repeats from one pond (a clutch of the same rare) fold into one line.
  const finds = [];
  for (const f of b.finds) {
    const prev = finds[finds.length - 1];
    if (prev && prev.pond === f.pond && prev.species === f.species && prev.how === f.how && prev.traits.join() === f.traits.join()) prev.n++;
    else finds.push({ ...f, n: 1 });
  }
  byId('sp-finds').replaceChildren(...finds.slice(0, 10).map((f) => {
    const li = el('li'), btn = el('button', 'find-row'), dot = el('i');
    btn.type = 'button';
    dot.style.background = TIER_COLOR[f.tier];
    const what = el('b', null, `${TIERS[f.tier]} ${findLabel(f)}${f.n > 1 ? ` ×${f.n}` : ''}`);
    what.style.color = TIER_COLOR[f.tier];
    btn.append(dot, what, el('span', 'mt', `${f.how} in ${f.pond} · ${ago(Date.now() - f.at)}`));
    btn.title = `Visit ${f.pond}`;
    btn.addEventListener('click', () => visitPond(f.pond));
    li.append(btn);
    return li;
  }));
}

// ---- wiring ------------------------------------------------------------------------------------

// ---- a plant's or structure's card: what it is, and traits to grow (traits.js) ----------------------
const objUi = { o: null };
const pips = (lv, max) => '●'.repeat(lv) + '○'.repeat(Math.max(0, max - lv));
function traitButton(label, cur, cost, note, maxed, fn, extra, color, redraw) {
  const b = el('button', 'trait'), nm = el('b', null, label);
  b.type = 'button';
  if (color) nm.style.color = color;
  b.append(nm);
  if (extra) b.append(el('span', 'pips', extra));
  if (cost != null) { const pr = el('span', 'pr'); pr.append(el('i', cur === 'essence' ? 'essence' : cur === 'corruption' ? 'corrupt' : 'pearl'), document.createTextNode(String(cost))); b.append(pr); }
  b.title = note;
  b.disabled = !!world.observe || maxed || (cost != null && have(world, cur) < cost);
  b.addEventListener('click', () => { if (fn() !== false) redraw(); });
  return b;
}

function showObject(o) {
  objUi.o = o;
  closeWindows('object');
  byId('object').hidden = false;
  renderObject();
}
function hideObject() { objUi.o = null; byId('object').hidden = true; }

const PLANT_DETAILS = {
  weed: 'Its soft stems give small animals somewhere to hide and lay eggs. As it grows, the patch also releases food for tiny swimmers.',
  eelgrass: 'These long underwater blades form a nursery for young fish. The stems sway with the water and shelter animals that would otherwise be exposed.',
  anemone: 'An anemone is a stationary animal with feeding tentacles, rather than a plant. Clownfish can live among its arms and defend their home.',
  coral: 'A coral colony is built by many small animals. Its branching, plate, fan, tube or dome form gives reef fish cover and creates feeding space.',
  urchin: 'A sea urchin is a spiny grazing animal. It moves slowly across the floor, and its spines make it a useful landmark and refuge.',
  marimo: 'A marimo is a ball of living algae that rolls gently on the bottom. It makes a quiet patch favored by axolotls and snails.',
  duckweed: 'Tiny floating leaves collect at the surface. Together they shade the water and give small surface animals a place to gather.',
  lily: 'A lily pad is a broad floating leaf rooted below. Frogs rest on top while fish and other animals shelter in its shade.',
  blackcoral: 'Black coral is a slow-growing deep-water animal colony, named for its dark skeleton. Branching trees, fans, whips and tubes provide shelter where sunlight is scarce.',
  glowcap: 'These small deep-water caps emit their own light. Their glow marks a pocket of habitat in water that sunlight cannot reach.',
  tubeworms: 'Tube worms anchor themselves on the deep floor and extend feeding plumes into the water. Their cluster creates cover around a trench.',
  paleroots: 'Pale roots spread through the deep floor and form shelter in the crypts. Their light color stands out in the dim water.',
  sealily: 'A sea lily is a stalked relative of starfish, with feathery arms that catch food. Here its glow draws deep life to the colony.',
  weepmoss: 'Weeping moss trails over submerged surfaces in the roots. Its soft growth makes cover and carries a faint light.',
  starweed: 'Star-weed grows in the drowned city and glows in the abyss. Its light attracts creatures adapted to that depth.',
};
function renderObject() {
  const o = objUi.o, box = byId('object');
  if (!o) return;
  const isS = !!(o.kind && STRUCTURES[o.kind]), parts = [], head = el('header', 'cr-head'), close = el('button', 'icon', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', hideObject);
  const here = isS ? world.structures.includes(o) : world.plants.includes(o) || world.pads.includes(o);
  head.append(el('b', null, isS ? STRUCTURES[o.kind].label : PLANT_NAMES[o.make] || o.make), el('span'), close);
  parts.push(head);
  const tree = el('div', 'trait-tree');
  if (isS) {
    const def = STRUCTURES[o.kind];
    parts.push(colored('p', 'cr-description', `${def.label} is a structure placed in the pond. ${def.desc[0].toUpperCase()}${def.desc.slice(1)}. Its effect reaches nearby animals and habitat; the traits below can change what it does.`), el('p', 'note', `Built on day ${Math.floor(o.born || 0) + 1}${depthAt(world, o.x, o.y) > 0.15 ? ' · in deep water: it lets the pond hold more, and draws deep life up' : ''}`));
    for (const [k, T] of Object.entries(STRUCT_TRAITS)) {
      const lv = (o.lv && o.lv[k]) || 0;
      tree.append(traitButton(T.label, 'pearls', lv < T.max ? T.cost(o, lv) : null, T.note, lv >= T.max, () => buyStructTrait(world, o, k), pips(lv, T.max), null, renderObject));
    }
    if (o.kind === 'island') {
      if (typeof isleSummary === 'function') parts.push(colored('p', 'note', isleSummary(world, o)));
      const st = o.stack || 1, rc = raiseCost(o);
      tree.append(traitButton('Raise the island', 'pearls', st < ISLAND_MAX ? rc.pearls : null, `a terrace higher: bigger, and lusher, with more palms (and ${rc.essence} essence)`, st >= ISLAND_MAX, () => raiseIsland(world, o), pips(st, ISLAND_MAX), '#7cc44c', renderObject));
      if (st >= 3) {
        for (const [k, B] of Object.entries(ISLAND_BRANCH)) {
          if (o.branch && o.branch !== k) continue;
          const lv = o.blv || 0;
          const cap = islandBranchMax(o), room = lv < cap;
          tree.append(traitButton(B.label, B.cur, room ? B.cost(lv) : null, lv >= ISLAND_BRANCH_MAX ? B.note : room ? B.note : `${B.note} (raise the island to grow it further)`, !room, () => growIsland(world, o, k), pips(lv, ISLAND_BRANCH_MAX), k === 'life' ? '#ffd870' : '#3aff9a', renderObject));
        }
      } else parts.push(el('p', 'note', 'Raise it to level 3 and it can go one of two ways: lanterns of life, or the whispering stone.'));
      if (typeof isleCardButtons === 'function') isleCardButtons(world, o, tree); // (sand, a grove, reefs, reeds, mangroves, birds, pools, a spring, fire, a giant: isles.js)
    }
    if (o.kind === 'hatchery') tree.append(traitButton('Open the hatchery', null, null, '', false, () => { hideObject(); setHatchery(true); return false; }, null, '#f8c050', renderObject));
    if (def.habitatFor) {
      const inf = habitatInfluences(world, o);
      parts.push(colored('p', 'note', `Breeds: ${def.habitatFor.filter((k) => SINGULAR[k] && fitsHabitat(world, SPECIES_HABITAT[k] || 'both')).map((k) => plural(SINGULAR[k], 2).toLowerCase()).join(', ')}.`),
        colored('p', 'note', inf.length ? `Around it: ${inf.join('; ')}.` : 'Nothing around it shapes the young yet: glowing plants, clean or warm water, coral, an island of life (or darker things, litter and carrion) within reach will.'));
    }
  } else {
    const g = o.growth ?? 1, likes = typeof likedByText === 'function' ? likedByText(o.make) : '';
    parts.push(colored('p', 'cr-description', PLANT_DETAILS[o.make] || `${typeof plantTip === 'function' ? plantTip(o.make) : 'A living part of the pond.'} It grows here and changes the habitat around it.`));
    parts.push(colored('p', 'cr-sub', `${Math.round(g * 100)}% grown · ${o.age != null ? `${Math.floor(o.age)} of about ${Math.round(o.span || 0)} days` : 'full grown'}${o.born != null ? ' · planted by you' : ''}`));
    if (likes) parts.push(colored('p', 'note', likes));
    for (const [k, T] of Object.entries(PLANT_TRAITS)) {
      const lv = (o.tr && o.tr[k]) || 0;
      tree.append(traitButton(T.label, T.cur, lv < T.max ? T.cost(lv) : null, T.note, lv >= T.max, () => buyPlantTrait(world, o, k), pips(lv, T.max), k === 'eld' ? '#3aff9a' : k === 'glow' ? '#9af0b0' : null, renderObject));
    }
  }
  if (!here) parts.push(colored('p', 'cr-gone', 'It is gone from the pond'));
  else parts.push(el('h4', null, world.observe ? 'Its traits' : 'Grow it'), tree);
  box.replaceChildren(...parts);
}

function initHud() {
  buildDock();
  addEventListener('resize', updateDockVisibility);
  buildJournalFilters();
  byId('census-btn').addEventListener('click', () => setCensus(!census.open));
  byId('log-line').addEventListener('click', () => setJournal(!journalUi.open));
  byId('sky-btn').addEventListener('click', () => setSky(!skyUi.open));
  byId('census-close').addEventListener('click', () => setCensus(false));
  byId('log-close').addEventListener('click', () => setJournal(false));
  byId('score-btn').addEventListener('click', () => setScore(!scoreUi.open));
  // The spawn card closes when you click anywhere but the card or the dock.
  addEventListener('pointerdown', (e) => {
    if (spawnUi.kind && !e.target.closest('#spawn-card, #animals')) closeSpawnCard();
  });
  byId('score-close').addEventListener('click', () => setScore(false));
  byId('hatch-close').addEventListener('click', () => setHatchery(false));
  byId('hatch-btn').addEventListener('click', () => setHatchery(!hatchUi.open));
  byId('open-depths').addEventListener('click', () => setEvo(!evoUi.open));
  byId('open-hatchery').addEventListener('click', () => { if (world.hatchery && hatcheryStructure(world)) setHatchery(!hatchUi.open); else showTicker('Build a hatchery first (the Build section, 250 pearls and 40 essence)'); });
  byId('evo-close').addEventListener('click', () => setEvo(false));
  byId('evo-deepen').addEventListener('click', () => { if (deepenPond(world)) { showTicker('The surf bites deeper into the pond'); evoUi.sig = ''; renderEvo(); } });
  byId('hatch-feed').addEventListener('click', (e) => {
    const H = world.hatchery;
    if (!H) return;
    feedHatchery(world, hatchClick(H));
    const r = e.currentTarget.getBoundingClientRect(), f = el('span', 'float-pts', `+${hatchClick(H).toFixed(2).replace(/\.?0+$/, '')}`);
    f.style.left = `${Math.round(r.left + r.width / 2 + rand(-12, 12))}px`;
    f.style.top = `${Math.round(r.top)}px`;
    document.body.append(f);
    f.addEventListener('animationend', () => f.remove());
    restartAnim(e.currentTarget, 'squish');
    renderHatchery();
  });
  byId('pond-lock').addEventListener('change', (e) => {
    world.game.lock = e.target.checked;
    world.gameDirty = true;
    showTicker(e.target.checked ? "Visitors can only look at your pond now: nobody can take a copy of it" : 'Visitors who open your link get their own copy again');
    syncPond();
  });
  byId('sp-join').addEventListener('change', (e) => {
    world.game.board = e.target.checked;
    world.gameDirty = true;
    showTicker(e.target.checked ? 'Your pond will show on the leaderboard' : 'Your pond is off the leaderboard');
    syncPond();
  });
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('select, input')) return;
    if (e.key === 'j' || e.key === 'J') setJournal(!journalUi.open);
    else if (e.key === 'c' || e.key === 'C') setCensus(!census.open);
    else if (e.key === 'Escape') { setJournal(false); setCensus(false); setSky(false); setScore(false); closeSpawnCard(); hideCreature(); setHatchery(false); setEvo(false); }
  });
}

let hudCountTimer = 0;
function hudTick(dt) {
  if ((hudTick.pt = (hudTick.pt || 0) - dt) <= 0) { hudTick.pt = 1; refreshParagonBadge(); if (parUi.open) renderParagons(); }
  hudCountTimer -= dt;
  if (hudCountTimer <= 0) { hudCountTimer = 0.5; updateCounts(); }
  census.timer -= dt;
  if (census.open && census.timer <= 0) { census.timer = 1; renderCensus(); }
  renderJournal();
  skyUi.timer -= dt;
  if (skyUi.open && skyUi.timer <= 0) { skyUi.timer = 0.25; updateSkyPanel(); }
  scoreUi.timer -= dt;
  if (scoreUi.timer <= 0) { scoreUi.timer = 0.4; updateScoreHud(); renderScorePanel(); }
  lineUi.timer -= dt;
  if (lineUi.kind && lineUi.timer <= 0) { lineUi.timer = 1; renderLineage(); }
  spawnUi.timer -= dt;
  if (spawnUi.kind && spawnUi.timer <= 0) { spawnUi.timer = 1; renderSpawnCard(); }
  creatureUi.timer -= dt;
  if (creatureUi.c && creatureUi.timer <= 0) { creatureUi.timer = 0.5; renderCreature(); }
  hatchUi.timer -= dt;
  if (hatchUi.timer <= 0) {
    hatchUi.timer = 0.2;
    renderHatchery();
    const H = world.hatchery, has = !!(H && hatcheryStructure(world)), btn = byId('hatch-btn');
    const wasHidden = btn.hidden;
    btn.hidden = !has;
    if (wasHidden !== btn.hidden) updateDockVisibility();
    if (has) {
      const k = Math.min(1, H.nutrients / hatchCost(H));
      btn.style.setProperty('--p', `${Math.round(k * 100)}%`);
      btn.classList.toggle('ready', k >= 1 && !!hatchPair(H));
      btn.title = `Hatchery: ${Math.floor(H.nutrients)} of ${hatchCost(H)} food${hatchPair(H) ? '' : ' · needs a breeding pair'}. Click to open.`;
    }
  }
  evoUi.timer -= dt;
  if (evoUi.timer <= 0) { evoUi.timer = 0.25; drawSlice(); renderEvo(); }
}

// ---- the pond's own name --------------------------------------------------------------------------------------
// A name the owner gives it (checked by the server: namefilter.js), or else its seed name.
const pondTitle = (w) => (w.game && w.game.title) || w.seed;
{
  const form = byId('sp-rename-form'), input = byId('sp-title-in'), note = byId('sp-rename-note');
  byId('sp-rename').addEventListener('click', () => {
    form.hidden = false; byId('sp-rename').hidden = true;
    input.value = world.game.title || '';
    note.textContent = "Up to 24 letters, numbers and a little punctuation. It becomes the pond's address too. Leave it empty to go back to its seed name.";
    input.focus();
  });
  byId('sp-rename-cancel').addEventListener('click', () => { form.hidden = true; byId('sp-rename').hidden = false; renderScorePanel(true); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = input.value.replace(/\s+/g, ' ').trim();
    if (!v) { world.game.title = null; world.gameDirty = true; form.hidden = true; byId('sp-rename').hidden = false; afterRename(); return; }
    if (!Net.base) { note.textContent = 'Naming a pond needs pond.nz (this copy runs offline).'; return; }
    note.textContent = 'Checking…';
    let res = null;
    try { res = await api('POST', '/title-check', { title: v }); } catch { /* offline */ }
    if (!res) { note.textContent = "Couldn't reach pond.nz to check the name; try again in a moment."; return; }
    if (!res.ok) { note.textContent = "That name isn't allowed: hateful or obscene words (however they're spelled), something that looks like a web address, a number code or an official title, or characters other than letters, numbers and simple punctuation."; return; }
    world.game.title = res.title; world.gameDirty = true;
    form.hidden = true; byId('sp-rename').hidden = false;
    afterRename();
    logEvent(world, `You named the pond ${res.title}`, null, { cat: 'pond', pri: 1 });
  });
}
function afterRename() {
  byId('bar-name').textContent = pondTitle(world);
  renderScorePanel(true);
  if (typeof syncSoon === 'function') syncSoon();
}

// ---- the Paragons: what they are, the ones waiting, and how close the next are ----------------------------------
const parUi = { open: false, sig: '' };
function setParagons(open) {
  parUi.open = open;
  byId('paragons').hidden = !open;
  byId('rail-paragons').setAttribute('aria-expanded', open);
  if (open) { closeWindows('paragons'); parUi.sig = ''; renderParagons(); }
}
function renderParagons() {
  if (!parUi.open || !world.game) return;
  const G = world.game, sup = G.supers || [];
  const sig = JSON.stringify([sup.map((s) => s.k + s.traits.join()), G.lines, G.spPts && Object.values(G.spPts).map((v) => Math.floor(v / 10)), !!world.observe]);
  if (sig === parUi.sig) return;
  parUi.sig = sig;
  const wait = sup.map((S, i) => {
    const b = el('button', 'super'), ic = el('span', 'ic');
    b.type = 'button';
    ic.append(iconImg(speciesIcon(S.k), 26));
    b.append(ic, colored('b', null, `♛ Paragon ${byRarity(S.traits).slice(0, 3).join(' ')} ${(SINGULAR[S.k] || S.k).toLowerCase()}`.replace(/\s+/g, ' ')), el('span', 'go', 'Claim'));
    b.title = 'Claim it\nIt arrives now, with a few of its kind (Superb), wherever there is room.';
    b.disabled = !!world.observe;
    b.addEventListener('click', () => { if (claimSuper(world, i)) { parUi.sig = ''; renderParagons(); refreshParagonBadge(); } });
    return b;
  });
  byId('paragons-waiting').replaceChildren(...(wait.length ? wait : [el('p', 'note', 'None waiting yet. Breed a rare line (the same rare traits in the same kind) and keep breeding it.')]));
  const rows = [];
  // Rare lines, the most bred first: how many times, and the next step.
  const lines = Object.entries(G.lines || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  for (const [key, n] of lines) {
    const [sp, tr] = key.split('|'), next = LINE_MILESTONES.find((m) => m > n);
    if (!SINGULAR[sp] && sp !== 'wild') continue;
    const li = el('li');
    li.append(colored('b', null, `${tr.split('+').filter(Boolean).join(' ')} ${sp === 'wild' ? 'wild fish' : (SINGULAR[sp] || sp).toLowerCase()}`), el('span', 'note', next ? `bred ${n} times · a Paragon at ${next}` : `bred ${n} times · every milestone reached`));
    if (next) { const bar = el('span', 'gbar'), f = el('i'); f.style.width = `${Math.round(clamp(n / next, 0, 1) * 100)}%`; bar.append(f); li.append(bar); }
    rows.push(li);
  }
  // Kinds that have scored for you: points, and the next step.
  const pts = Object.entries(G.spPts || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [k, p] of pts) {
    if (!SINGULAR[k]) continue;
    const next = SPECIES_MILESTONE((G.spHit && G.spHit[k]) || 0), li = el('li');
    li.append(colored('b', null, `${SINGULAR[k]}: ${fmt(p)} points`), el('span', 'note', `a Paragon at ${fmt(next)}`));
    const bar = el('span', 'gbar'), f = el('i'); f.style.width = `${Math.round(clamp(p / next, 0, 1) * 100)}%`; bar.append(f); li.append(bar);
    rows.push(li);
  }
  byId('paragons-progress').replaceChildren(...(rows.length ? rows : [el('li', 'note', 'Nothing yet: rare births start a line, and every birth scores for its kind.')]));
}
function refreshParagonBadge() {
  const b = byId('rail-paragons');
  if (!b || !world.game) return;
  const n = (world.game.supers || []).length;
  b.dataset.new = n || '';
  b.classList.toggle('has-new', n > 0);
  b.hidden = !!world.observe;
}
byId('rail-paragons').addEventListener('click', () => setParagons(!parUi.open));
byId('paragons-close').addEventListener('click', () => setParagons(false));
