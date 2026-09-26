'use strict';
// On-screen HUD pieces outside the menu: the animal dock with its census and
// family trees, the journal, the sky tracker, and the score with the
// leaderboard. Loaded before main.js; main calls initHud() once, then hudTick()
// and updateSkyHud() every frame.

const byId = (id) => document.getElementById(id);
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
  if (c.species === 'eel' || c.species === 'snake') {
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
  const N = 96, r = new Raster(N, N);
  poseIcon(c, w, N / 2, N / 2);
  r.begin();
  c.draw(r, 0, w);
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
const wildIcon = (sp) => makeIcon(`wild/${sp.id}/${sp.name}`, (w) => new WildFish(w, 48, 48, sp));
const iconFor = (c) => (c.species === 'wild' ? wildIcon(c.sp) : speciesIcon(c.species));

// An <img> for an icon at a whole-number scale that fits `box` CSS pixels (so pixels stay crisp).
function iconImg(icon, box = ICON_CSS) {
  const img = document.createElement('img'), k = clamp(Math.floor(box / Math.max(icon.nw, icon.nh)), 1, 6);
  img.src = icon.src; img.alt = '';
  img.width = icon.nw * k; img.height = icon.nh * k;
  return img;
}

// ---- dock: one button per species; click to buy one, hover for its family tree -----------

const DOCK_KINDS = Object.keys(SPECIES);

function buildDock() {
  const box = byId('animals');
  for (const kind of DOCK_KINDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ani';
    b.dataset.spawn = kind;
    b.setAttribute('aria-label', `Add ${SPECIES[kind].label.toLowerCase()} for ${ANIMAL_PRICE[kind]} pearls`);
    b.append(iconImg(speciesIcon(kind)), Object.assign(document.createElement('b'), { textContent: '0' }));
    b.addEventListener('click', () => { buyAnimal(kind); if (lineUi.kind === kind) renderLineage(); });
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showLineage(kind, b); });
    b.addEventListener('pointerleave', hideLineage);
    b.addEventListener('focus', () => showLineage(kind, b));
    b.addEventListener('blur', hideLineage);
    box.append(b);
  }
}

function updateCounts() {
  const n = {}, pearls = world.game ? world.game.pearls : 0;
  let total = 0;
  for (const c of world.creatures) {
    n[c.species] = (n[c.species] || 0) + 1;
    if (c.life) total++;
  }
  for (const b of document.querySelectorAll('#animals [data-spawn]')) {
    const kind = b.dataset.spawn, k = n[kind] || 0, el = b.lastChild, price = ANIMAL_PRICE[kind];
    b.classList.toggle('poor', pearls < price);
    if (el.textContent === String(k)) continue;
    el.textContent = k;
    b.classList.toggle('none', !k);
    b.title = `${SPECIES[kind].label}: ${k} in the pond. Click to add more for ${price} pearls.`;
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
  if (!kind || census.open || !world.lineage) { box.hidden = true; return; }
  const inKind = (r) => r.k === kind || (kind === 'frog' && r.k === 'tadpole');
  const recs = [...world.lineage.values()].filter(inKind);
  const here = new Set(world.creatures.filter((c) => c.life && !c.leaving).map((c) => c.seed));
  const isHere = (r) => r.d == null && here.has(r.s);
  const alive = recs.filter(isHere).sort((a, b) => b.pts - a.pts || (a.b ?? 0) - (b.b ?? 0));
  const gone = recs.filter((r) => !isHere(r)).sort((a, b) => (b.d ?? 0) - (a.d ?? 0));
  const best = recs.reduce((m, r) => Math.max(m, tierOf(r.t || [])), 0);
  const likes = LIKES[kind], price = ANIMAL_PRICE[kind];

  const head = el('div', 'line-head');
  head.append(el('b', null, SPECIES[kind].label), el('span', null, [`${alive.length} here`, `${recs.length} known`, best && `best ${TIERS[best]}`].filter(Boolean).join(' · ')));
  const sub = el('p', 'note', [`Click to add: ${price} pearls`, likes && `likes ${likes.map((k) => LIKE_LABEL[k]).join(', ')}`].filter(Boolean).join(' · '));
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
      const name = el('b', null, r.n), tr = el('span', 'tr', tier ? `${TIERS[tier]} ${r.t.join(' ')}` : '');
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
  const bar = byId('animals').getBoundingClientRect(), a = lineUi.anchor.getBoundingClientRect(), w = box.offsetWidth;
  box.style.left = `${Math.round(clamp(a.left + a.width / 2 - w / 2, 8, innerWidth - w - 8))}px`;
  box.style.bottom = `${Math.round(innerHeight - bar.top + 14)}px`;
}

// ---- census: details about the animals in the pond ------------------------------------------

const census = { open: false, expanded: new Set(), timer: 0 };

function setCensus(open) {
  census.open = open;
  byId('census').hidden = !open;
  byId('census-btn').setAttribute('aria-expanded', open);
  if (open) { renderCensus(); setJournal(false); }
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
  byId('census-stats').textContent = `born ${ECO.births} · arrived ${ECO.arrivals} · moved on ${ECO.departures} · eaten ${ECO.eaten}`;

  const rows = [];
  for (const kind of [...DOCK_KINDS, 'tadpole']) {
    const list = groups.get(kind);
    if (!list) continue;
    list.sort((a, b) => b.life.age - a.life.age);
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
    head.type = 'button';
    head.setAttribute('aria-expanded', open);
    const facts = [stage.young && `${stage.young} young`, stage.adult && `${stage.adult} adult`, stage.elder && `${stage.elder} elder`,
      hungry && `${hungry} hungry`, rare && `✦ ${rare} rare`, gen && `gen ${gen}`].filter(Boolean).join(' · ');
    head.append(el('span', 'ic'), el('b', 'nm', kind === 'tadpole' ? 'Tadpoles' : SPECIES[kind].label),
      el('span', 'ct', list.length), el('span', 'facts', facts));
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
        b.append(el('b', null, c.life.name), el('span', 'sub', `${d.label === SPECIES[kind]?.label ? '' : `${d.label} · `}${d.stage} · gen ${d.gen} · ${ageLabel(d.age)}`),
          energyBar(d.energy), el('span', 'mood', [d.traits.length && `✦ ${TIERS[d.tier]} ${d.traits.join(' ')}`, d.mood, comfortWord(d.comfort), d.fed && 'well fed'].filter(Boolean).join(' · ')));
        b.addEventListener('click', () => { if (alive(c)) follow(c); });
        m.append(b);
        ul.append(m);
      }
      if (list.length > 60) ul.append(el('li', 'more', `and ${list.length - 60} more`));
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

const CATS = { all: 'All', life: 'Life', rare: 'Rare', hunt: 'Hunts', come: 'Comings & goings', sky: 'Sky & tide' };
const journalUi = { open: false, filter: 'all', list: null, lastSeq: 0, queue: [], current: null, until: 0, shownText: null };
const TICKER_QUEUE = 4;                      // lines waiting at most; the least important are dropped
const TICKER_DWELL = [3500, 4500, 6000, 8000]; // least time on screen, by priority (ms)

function setJournal(open) {
  journalUi.open = open;
  byId('log-panel').hidden = !open;
  byId('log-line').setAttribute('aria-expanded', open);
  if (open) { world.journalDirty = true; renderJournal(); setCensus(false); }
}

// A message of our own (e.g. "Link copied") jumps straight onto the ticker.
function showTicker(text) {
  journalUi.queue.unshift({ text, cat: 'pond', pri: 4, clock: null });
  journalUi.until = 0;
  renderJournal();
}

// The ticker shows one line at a time, long enough to read: important lines
// stay longer and jump ahead, and when things are busy routine lines skip the
// ticker (they are still in the full journal). A line that grows while it's up
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
    if (e === journalUi.current && now < journalUi.until) continue;
    if (journalUi.queue.includes(e)) continue;
    const busy = now < journalUi.until || journalUi.queue.length > 0;
    if (busy && (e.pri ?? 1) === 0) continue;
    journalUi.queue.push(e);
    journalUi.queue.sort((a, b) => (b.pri ?? 1) - (a.pri ?? 1)); // stable: same priority keeps its order
    journalUi.queue.length = Math.min(journalUi.queue.length, TICKER_QUEUE);
  }
  if (now >= journalUi.until && journalUi.queue.length) {
    const e = journalUi.current = journalUi.queue.shift();
    const read = 1600 + e.text.length * 55; // about the time it takes to read
    journalUi.until = now + Math.max(TICKER_DWELL[Math.min(3, e.pri ?? 1)], read) * (journalUi.queue.length > 2 ? 0.8 : 1);
    journalUi.shownText = null;
    const line = byId('log-line');
    line.classList.remove('flash', 'pri0', 'pri1', 'pri2', 'pri3');
    void line.offsetWidth; // restart the flash animation
    line.classList.add('flash', 'pri' + Math.min(3, e.pri ?? 1));
  }
}

function entryTime(e) { return `D${e.day} ${clockLabel(e.clock)}`; }

function renderJournal() {
  feedTicker();
  const line = byId('log-line'), e = journalUi.current;
  if (e && e.text !== journalUi.shownText) {
    journalUi.shownText = e.text;
    line.querySelector('.txt').textContent = e.text;
    line.querySelector('time').textContent = e.clock == null ? '' : clockLabel(e.clock);
    line.querySelector('.dot').className = `dot cat-${e.cat}`;
    line.title = `${e.text}\nClick for the journal (J)`;
  }
  const more = line.querySelector('.more'), waiting = journalUi.queue.length ? `+${journalUi.queue.length}` : '';
  if (more.textContent !== waiting) more.textContent = waiting;
  if (!journalUi.open || !world.journalDirty) return;
  world.journalDirty = false;
  const list = world.journal.filter((e) => journalUi.filter === 'all' || e.cat === journalUi.filter).slice(0, 80);
  byId('journal').replaceChildren(...list.map((e) => {
    const li = el('li', `cat-${e.cat}`);
    li.append(el('i', 'dot'), el('time', null, entryTime(e)), el('span', null, e.text));
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
      for (const c of box.children) c.setAttribute('aria-pressed', c.dataset.cat === cat);
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
  if (open && scoreUi.open) setScore(false);
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
}

// ---- score: points, pearls, the leaderboard and rare finds everywhere -----------------------------

const scoreUi = { open: false, timer: 0, shown: '', boardAt: -1 };
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const findLabel = (f) => `${f.traits.join(' ')} ${f.species === 'wild' ? 'wild fish' : SINGULAR[f.species] || f.species}`;

function setScore(open) {
  scoreUi.open = open;
  byId('score-panel').hidden = !open;
  byId('score-btn').setAttribute('aria-expanded', open);
  if (open) {
    setSky(false);
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

// The pond bar at the top: this pond's name, points, pearls and leaderboard place.
function updateScoreHud() {
  const G = world.game;
  if (!G) return;
  const rank = world.link && G.board && G.points >= BOARD_MIN && Net.rank ? `#${Net.rank}` : '';
  const key = `${G.points}|${G.pearls}|${world.seed}|${rank}`;
  if (key === scoreUi.shown) return;
  const was = scoreUi.shown ? +scoreUi.shown.split('|')[0] : null;
  scoreUi.shown = key;
  byId('bar-name').textContent = world.seed;
  byId('bar-rank').textContent = rank;
  byId('score-points').textContent = fmt(G.points);
  byId('score-pearls').textContent = fmt(G.pearls);
  if (was != null && G.points > was) restartAnim(byId('score-btn'), 'bump');
}

// "+15" drifting up from where the points were earned (or "−8" where pearls were spent).
let floats = 0;
function floatAward(x, y, text, kind = 'gain') {
  if (floats >= 8 || document.hidden) return;
  const sx = x * view.k + view.tx, sy = y * view.k + view.ty;
  if (sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight) return;
  const f = el('span', `float-pts ${kind}`, text);
  f.style.left = `${Math.round(sx)}px`;
  f.style.top = `${Math.round(sy - 12)}px`;
  document.body.append(f);
  floats++;
  f.addEventListener('animationend', () => { f.remove(); floats--; });
}

function visitPond(id) {
  if (world.link && id === world.link.id) return;
  if (!confirm(`Visit the pond ${id}? You get your own copy of it to watch and breed from. Your pond stays saved in "Your ponds".`)) return;
  saveNow();
  world.noSave = true;
  location.assign(`/${id}`);
}

function renderScorePanel(force = false) {
  if (!scoreUi.open || !world.game) return;
  const G = world.game, plan = fireflyPlan(world);
  byId('sp-points').textContent = fmt(G.points);
  byId('sp-pearls').textContent = fmt(G.pearls);
  byId('sp-rank').textContent = world.link && G.board && Net.rank ? `#${Net.rank}` : '–';
  byId('sp-rank-note').textContent = !Net.base ? 'offline' : !G.board ? 'not listed'
    : G.points < BOARD_MIN || !Net.rank ? `listed at ${BOARD_MIN} pts` : `rank${Net.board && Net.board.ponds ? ` of ${fmt(Net.board.ponds)}` : ''}`;
  byId('sp-flies').textContent = `Tonight: ${plan.yellow} of ${plan.full} fireflies${plan.blue ? ` and ${plan.blue} blue` : ''}. ` +
    `A full swarm is the high-score range, ${fmt(plan.high)}+ points${plan.blue ? '.' : '; blue fireflies come once you reach it.'}`;
  byId('sp-best').textContent = G.best ? `Best find: ${TIERS[G.best.tier]} ${findLabel(G.best)}${G.best.name ? `, ${G.best.name}` : ''}` : '';
  byId('sp-recent').replaceChildren(...(G.recent.length ? G.recent.slice(0, 6).map((r) => {
    const li = el('li');
    li.append(el('b', null, `+${fmt(r.n)}`), el('span', null, r.why), el('time', null, `D${r.day} ${clockLabel(r.clock)}`));
    return li;
  }) : [el('li', 'empty', 'Nothing yet: births, rare animals and each dawn pay points.')]));
  byId('sp-join').checked = !!G.board;

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
    btn.append(el('span', 'rk', `#${i + 1}`), el('b', null, p.id), el('span', 'pt', fmt(p.points)),
      el('span', 'mt', [p.best && `${TIERS[p.best.tier]} ${findLabel(p.best)}`, `${p.animals} animals`, `day ${Math.floor(p.days) + 1}`].filter(Boolean).join(' · ')));
    if (p.best) btn.querySelector('.mt').style.color = TIER_COLOR[p.best.tier];
    btn.addEventListener('click', () => visitPond(p.id));
    li.append(btn);
    return li;
  });
  if (mine && Net.rank && !b.top.some((p) => p.id === mine)) {
    const li = el('li', 'me'), row = el('div', 'board-row');
    row.append(el('span', 'rk', `#${Net.rank}`), el('b', null, mine), el('span', 'pt', fmt(G.points)), el('span', 'mt', 'your pond'));
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

function initHud() {
  buildDock();
  buildJournalFilters();
  byId('census-btn').addEventListener('click', () => setCensus(!census.open));
  byId('log-line').addEventListener('click', () => setJournal(!journalUi.open));
  byId('sky-btn').addEventListener('click', () => setSky(!skyUi.open));
  byId('census-close').addEventListener('click', () => setCensus(false));
  byId('log-close').addEventListener('click', () => setJournal(false));
  byId('score-btn').addEventListener('click', () => setScore(!scoreUi.open));
  byId('score-close').addEventListener('click', () => setScore(false));
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
    else if (e.key === 'Escape') { setJournal(false); setCensus(false); setSky(false); setScore(false); }
  });
}

let hudCountTimer = 0;
function hudTick(dt) {
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
}
