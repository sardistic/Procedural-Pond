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
  // Whole-number scales keep pixels crisp; only icons bigger than the box shrink (the mythic ones).
  const big = Math.max(icon.nw, icon.nh), img = document.createElement('img'), k = big > box ? box / big : clamp(Math.floor(box / big), 1, 6);
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
    b.setAttribute('aria-label', `Spawn ${SPECIES[kind].label.toLowerCase()}`);
    b.append(Object.assign(document.createElement('i'), { className: 'gem' }), iconImg(speciesIcon(kind)), Object.assign(document.createElement('b'), { textContent: '0' }));
    b.addEventListener('click', () => openSpawnCard(kind, b));
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showLineage(kind, b); });
    b.addEventListener('pointerleave', hideLineage);
    b.addEventListener('focus', () => showLineage(kind, b));
    b.addEventListener('blur', hideLineage);
    box.append(b);
  }
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
    b.classList.toggle('poor', essence < price);
    b.dataset.value = s ? s.value : 0;
    b.style.setProperty('--val', s ? (s.value / maxV).toFixed(3) : '0');
    b.style.setProperty('--tier', s && s.best ? TIER_COLOR[s.best] : 'transparent');
    b.classList.toggle('rare', !!(s && s.best >= 2));
    if (count.textContent !== String(k)) { count.textContent = k; b.classList.toggle('none', !k); }
    b.title = s ? `${SPECIES[kind].label}: ${k} in the pond, worth ${s.value} essence${s.best ? ` · rarest ${TIERS[s.best]}` : ''} · ${s.looks.size} look${s.looks.size > 1 ? 's' : ''}, ${diversityWord(s.diversity)} (${Math.round(s.diversity * 100)}%). Click to spawn more (${price} essence).`
      : `${SPECIES[kind].label}: none in the pond. Click to spawn (${price} essence).`;
  }
  const now = performance.now();
  if (now > dockSortAt && !box.matches(':hover') && !spawnUi.kind) {
    dockSortAt = now + 3000;
    const btns = [...box.children], order = btns.slice().sort((a, b) => (+b.dataset.value || 0) - (+a.dataset.value || 0) || DOCK_KINDS.indexOf(a.dataset.spawn) - DOCK_KINDS.indexOf(b.dataset.spawn));
    if (order.some((b, i) => b !== btns[i])) box.append(...order);
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
  byId('census-stats').textContent = `born ${ECO.births} · arrived ${ECO.arrivals} · moved on ${ECO.departures} · died ${ECO.died || 0} · eaten ${ECO.eaten}`;

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
    head.type = 'button';
    head.setAttribute('aria-expanded', open);
    const facts = [stage.young && `${stage.young} young`, stage.adult && `${stage.adult} adult`, stage.elder && `${stage.elder} elder`,
      hungry && `${hungry} hungry`, rare && `✦ ${rare} rare`, gen && `gen ${gen}`,
      S && kind !== 'tadpole' && `worth ${S.value} essence`, S && kind !== 'tadpole' && `${diversityWord(S.diversity)} (${Math.round(S.diversity * 100)}%)`].filter(Boolean).join(' · ');
    if (S && S.best >= 2 && kind !== 'tadpole') li.style.setProperty('--tier', TIER_COLOR[S.best]);
    head.append(el('span', 'ic'), el('b', 'nm', kind === 'tadpole' ? 'Tadpoles' : SPECIES[kind].label),
      el('span', 'ct', list.length), colored('span', 'facts', facts));
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
        b.append(el('b', null, c.life.name), el('span', 'sub', `${d.label === SPECIES[kind]?.label ? '' : `${d.label} · `}${d.stage} · gen ${d.gen} · ${ageLabel(d.age)} · ${GRADES[gradeOf(c.life.genome)].toLowerCase()}`),
          energyBar(d.energy), colored('span', 'mood', [d.traits.length && `✦ ${TIERS[d.tier]} ${d.traits.join(' ')}`, d.mood, comfortWord(d.comfort), d.fed && 'well fed'].filter(Boolean).join(' · ')));
        b.addEventListener('click', () => { if (alive(c)) { follow(c); showCreature(c); } });
        b.append(el('span', 'val', `◆${recycleValue(c)}`));
        m.append(b);
        ul.append(m);
      }
      if (list.length > 60) ul.append(el('li', 'more', `and ${list.length - 60} more`));
      if (kind !== 'tadpole' && !world.observe) {
        const all = el('button', 'recycle-all');
        all.type = 'button';
        all.append(document.createTextNode(`Recycle all ${list.length} for `), el('i', 'essence'), document.createTextNode(String(S ? S.value : 0)));
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
    line.querySelector('.txt').replaceChildren(colorize(e.text));
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
    li.append(el('i', 'dot'), el('time', null, entryTime(e)), colored('span', null, e.text));
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

// ---- spawn card: click a dock icon to buy that animal with essence --------------------------

const spawnUi = { kind: null, anchor: null, enh: new Set(), timer: 0 };
const RARITY_WORDS = ['a common species', 'an uncommon species', 'a scarce species', 'an exotic species', 'a legendary species'];
const yearsLabel = (y) => (y < 1 ? `${Math.round(y * 12)} months` : `${y} years`);

function openSpawnCard(kind, anchor) {
  if (world.observe) return; // someone else's pond: look only
  if (spawnUi.kind === kind) { closeSpawnCard(); return; }
  spawnUi.kind = kind;
  spawnUi.anchor = anchor;
  spawnUi.enh = new Set();
  hideLineage();
  setCensus(false);
  renderSpawnCard();
}

function closeSpawnCard() {
  spawnUi.kind = null;
  byId('spawn-card').hidden = true;
}

function renderSpawnCard() {
  const kind = spawnUi.kind, box = byId('spawn-card');
  if (!kind) return;
  const s = SPECIES_STATS[kind], G = world.game, enh = [...spawnUi.enh], grade = spawnUi.grade || 0, price = Math.round(spawnPrice(kind, enh) * GRADE_PRICE[grade]);
  const settle = settleChance(world, kind, enh.includes('hardy') ? ENHANCE.hardy.settle : 0), likes = LIKES[kind];
  const head = el('div', 'sc-head'), ic = el('span', 'ic');
  ic.append(iconImg(speciesIcon(kind), 32));
  const water = SPECIES_HABITAT[kind] === 'both' ? 'fresh or salt' : SPECIES_HABITAT[kind];
  const title = el('div');
  title.append(el('b', null, SPECIES[kind].label), colored('span', null, `${water} water · ${RARITY_WORDS[s.rarity]}`));
  const cost = el('span', 'sc-cost');
  cost.append(el('i', 'essence'), document.createTextNode(fmt(price)));
  head.append(ic, title, cost);
  const facts = el('ul', 'sc-facts');
  facts.append(
    el('li', null, `Size ${'▮'.repeat(s.size)}${'▯'.repeat(5 - s.size)}${s.group ? ` · comes as ${s.group}` : ''}`),
    el('li', null, `Settles in ${Math.round(settle * 100)}% of the time (the rest return half their price)`),
    el('li', null, `Lives ~${yearsLabel(s.years)}, about ${Math.round(lifeSeconds(s.years) / 60)} minutes here · ${Math.min(100, Math.round(100 / s.years))}% die a year`),
  );
  if (likes) facts.append(el('li', null, `Likes ${likes.map((k) => LIKE_LABEL[k]).join(', ')}`));
  const S = speciesSummary(world).get(kind);
  let have = null;
  if (S) {
    have = el('div', 'sc-have');
    const all = el('button', 'recycle-all');
    all.type = 'button';
    all.append(document.createTextNode('Recycle all '), el('i', 'essence'), document.createTextNode(String(S.value)));
    all.addEventListener('click', () => { recycleAll(kind); renderSpawnCard(); });
    have.append(colored('span', null, `In the pond: ${S.n}, worth ${S.value} essence${S.best ? `, rarest ${TIERS[S.best]}` : ''}, ${diversityWord(S.diversity)}`), all);
  }
  const boosts = el('div', 'sc-boosts');
  boosts.append(el('span', 'sc-sub', 'Gene boosts (hover for what each does)'));
  for (const [key, e] of Object.entries(ENHANCE)) {
    const b = el('button', 'boost');
    b.type = 'button';
    b.setAttribute('aria-pressed', spawnUi.enh.has(key));
    const info = GENE_INFO[e.buff] || GENE_INFO.luck;
    const name = el('b', null, e.label);
    name.style.color = info.color;
    const c = el('span', 'bc');
    c.append(el('i', 'essence'), document.createTextNode(`+${enhanceCost(kind, key)}`));
    b.append(name, c);
    b.title = `${e.label}: ${e.note}`;
    b.addEventListener('click', () => { if (spawnUi.enh.has(key)) spawnUi.enh.delete(key); else spawnUi.enh.add(key); renderSpawnCard(); });
    boosts.append(b);
  }
  // Quality: pay more for a spawn that's at least this good (its genes are chosen until they are).
  const grades = el('div', 'sc-boosts grades');
  grades.append(el('span', 'sc-sub', 'Quality (the spawn is chosen until every one is at least this good)'));
  for (const gi of [0, 2, 3, 4, 5]) {
    const b = el('button', 'boost'), nm = el('b', null, gi ? `${GRADES[gi]}${gi < 5 ? '+' : ''}` : 'Any');
    b.type = 'button';
    b.setAttribute('aria-pressed', grade === gi);
    if (gi) nm.style.color = GRADE_COLOR[gi];
    b.append(nm, el('span', 'bc', gi ? `×${GRADE_PRICE[gi]}` : 'as it comes'));
    b.addEventListener('click', () => { spawnUi.grade = gi; renderSpawnCard(); });
    grades.append(b);
  }
  const genes = G.fossilGenes || [];
  let ancient = null;
  if (genes.length) {
    ancient = el('div', 'sc-boosts ancient');
    ancient.append(el('span', 'sc-sub', 'Ancient genes from fossils (free; the first of the spawn shows it)'));
    for (const [i, g] of genes.entries()) {
      const b = el('button', 'boost');
      b.type = 'button';
      b.setAttribute('aria-pressed', spawnUi.ancient === i);
      const nm = el('b', null, g);
      nm.style.color = CLASS_COLOR[g] || '#ffd166';
      b.append(nm, el('span', 'bc', 'ancient'));
      b.addEventListener('click', () => { spawnUi.ancient = spawnUi.ancient === i ? null : i; renderSpawnCard(); });
      ancient.append(b);
    }
  }
  const buy = el('button', 'sc-buy');
  buy.type = 'button';
  buy.disabled = (G.essence || 0) < price;
  buy.append(document.createTextNode(`Spawn ${SPECIES[kind].label.toLowerCase()} for `), el('i', 'essence'), document.createTextNode(fmt(price)));
  buy.title = buy.disabled ? `You have ${fmt(G.essence || 0)} essence. Recycle animals with the Net for more.` : '';
  buy.addEventListener('click', () => {
    const gene = spawnUi.ancient != null ? genes[spawnUi.ancient] : null;
    if (buyAnimal(kind, [...spawnUi.enh], gene, spawnUi.grade || 0)) { spawnUi.ancient = null; renderSpawnCard(); }
  });
  box.replaceChildren(...[head, facts, have, boosts, grades, ancient, buy].filter(Boolean));
  box.hidden = false;
  const bar = byId('animals').getBoundingClientRect(), a = spawnUi.anchor.getBoundingClientRect(), w = box.offsetWidth;
  box.style.left = `${Math.round(clamp(a.left + a.width / 2 - w / 2, 8, innerWidth - w - 8))}px`;
  box.style.bottom = `${Math.round(innerHeight - bar.top + 14)}px`;
}

// ---- creature card: everything about one animal ------------------------------------------------
// Opened by clicking an animal, and shown automatically while following or touring.

const creatureUi = { c: null, auto: false, timer: 0, rec: null };
const LOCUS_INFO = {
  albino: ['albino', 'recessive'], melanistic: ['melanistic', 'recessive'], piebald: ['piebald', 'recessive'],
  xanthic: ['xanthic', 'recessive'], axanthic: ['axanthic', 'recessive'], leu: ['leucistic', 'incomplete'],
  mar: ['marbled', 'dominant'], mut: ['mutator', 'recessive'],
};
const BUFF_ROWS = ['fertility', 'longevity', 'vitality', 'intellect', 'aggression', 'territory', 'speed', 'tolerance', 'resilience', 'stealth', 'light', 'luck'];

function showCreature(c, auto = false) {
  if (!c || !c.life) return;
  if (auto && creatureUi.c && !creatureUi.auto && alive(creatureUi.c)) return; // don't replace one you opened
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
  if (!here) {
    parts.push(colored('p', 'cr-gone', rec && rec.d != null ? `No longer in the pond: left on day ${Math.floor(rec.d) + 1}${rec.why ? ` (${rec.why})` : ''}` : 'No longer in the pond'));
  } else {
    const bar = el('div', 'bar'), fill = el('i');
    fill.style.width = `${Math.round(L.energy * 100)}%`;
    bar.append(fill);
    parts.push(bar, colored('p', 'cr-sub', [d.mood, comfortWord(L.comfort), aggressionWord(a), water && (mm > 0.3 ? `out of place in ${water === 'fresh' ? 'salt' : 'fresh'} water` : `in ${water} water`), d.fed && 'well fed', ...d.temper].filter(Boolean).join(' · ')));
  }
  const gr = gradeOf(L.genome);
  const gradeChip = chip(`${GRADES[gr]} quality`, GRADE_COLOR[gr]);
  gradeChip.title = 'Graded from its genes: its working genes against the average, gifts up, curses down. It sets what it is worth.';
  parts.push(Object.assign(el('div', 'chips'), {}).appendChild(gradeChip).parentNode);
  if (d.traits.length || d.carries.length) {
    const t = el('div', 'chips');
    for (const tr of d.traits) t.append(chip(tr, CLASS_COLOR[tr] || '#ffd166'));
    for (const k of d.carries) { const ch = chip(`carries ${k}`, CLASS_COLOR[k] || '#8fbcb8'); ch.classList.add('carrier'); t.append(ch); }
    parts.push(t);
    // What its gifts, curses, quirks and ills do.
    const notes = d.traits.filter((k) => TRAIT_NOTES[k]).map((k) => `${k}: ${TRAIT_NOTES[k]}`);
    if (notes.length) parts.push(colored('p', 'note', notes.join(' · ')));
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
    box.append(stage, bar, colored('span', 'note', L.bound ? 'Bound: the change in it has stopped.'
      : `${rate > 4 ? 'Changing fast here' : rate > 2 ? 'Changing' : 'Changing slowly'}: faster at night, in deep water, near the idol, the whale fall or the mythic.${st === 2 ? ' Small animals circle it; those too close lose their minds; at night it dreams the mark into its neighbours.' : st === 1 ? ' The water around it feels wrong.' : ''}`));
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
      tree.append(traitButton(E.label, 'essence', lv < ANIMAL_MAX ? cost : null, `${E.label}: ${E.note}`, lv >= ANIMAL_MAX, () => buyAnimalTrait(world, c, key), pips(lv, ANIMAL_MAX), (GENE_INFO[E.buff] || {}).color, renderCreature));
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
        hunt.append(traitButton(H.label, H.cur, lv < HUNT_MAX ? huntCost(c, k) : null, H.note, lv >= HUNT_MAX, () => buyHunt(world, c, k), pips(lv, HUNT_MAX), H.cur === 'corruption' ? '#3aff9a' : '#ef6f6c', renderCreature));
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
  parts.push(el('h4', null, 'Genes'));
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
    f.type = 'button';
    f.addEventListener('click', () => { cam.tour = false; byId('tour').setAttribute('aria-pressed', false); follow(c); });
    const r = el('button', 'recycle');
    r.type = 'button';
    r.append(document.createTextNode('Recycle +'), el('i', 'essence'), document.createTextNode(String(recycleValue(c))));
    r.title = 'Return this animal to the pond for essence';
    r.addEventListener('click', () => {
      if (d.tier >= 3 && !confirm(`Recycle ${d.name}, a ${TIERS[d.tier]} ${d.label}? It will be gone for good.`)) return;
      recycle(c);
      renderCreature();
    });
    acts.append(f, r);
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
  if (hatchUi.open) { setScore(false); hatchUi.sig = ''; renderHatchery(); }
}

function renderHatchery() {
  const H = world.hatchery;
  if (!hatchUi.open || !H) return;
  const cost = hatchCost(H), pair = hatchPair(H), n = 2 + H.levels.tank, auto = hatchAuto(H);
  byId('hatch-broods').textContent = H.broods ? `· ${H.broods} brood${H.broods > 1 ? 's' : ''}` : '';
  byId('hatch-click').textContent = `+${hatchClick(H).toFixed(2).replace(/\.?0+$/, '')}`;
  byId('hatch-fill').style.width = `${Math.round(Math.min(1, H.nutrients / cost) * 100)}%`;
  const ready = Math.floor(H.nutrients / cost);
  byId('hatch-status').textContent = !pair
    ? (H.stock.length < 2 ? 'Stock a breeding pair: open an animal\u2019s card and choose \u201cTo hatchery\u201d.' : 'These two can\u2019t breed: they must be the same kind.')
    : `${Math.floor(H.nutrients)} of ${cost} food · ${n} young a brood${ready > 1 ? ` · ${ready} broods ready` : ''}${auto ? ` · auto-feeding ${auto.toFixed(2)}/s` : ''}`;
  const sig = JSON.stringify([H.stock.map((r) => r.s), H.focus, H.levels, Math.floor(world.game.pearls / 5), Math.floor((world.game.essence || 0) / 5),
    H.stock.length < 2 ? Math.floor(world.t / 4) : 0, (world.game.fossilGenes || []).length]);
  if (sig === hatchUi.sig) return;
  hatchUi.sig = sig;
  // The pair.
  const stock = [0, 1].filter((i) => H.stock[i]).map((i) => {
    const rec = H.stock[i], li = el('li', 'slot');
    const tier = tierOf(rec.traits || []), nm = el('b', null, rec.name);
    if (tier) nm.style.color = TIER_COLOR[tier];
    const label = rec.species === 'wild' && rec.args.sp ? rec.args.sp.name : SINGULAR[rec.species] || rec.species;
    const rel = el('button', null, 'Release');
    rel.type = 'button';
    rel.title = 'Put it back in the pond';
    rel.addEventListener('click', () => { releaseStock(world, i); hatchUi.sig = ''; renderHatchery(); });
    li.append(nm, colored('span', 'note', `${label} · gen ${rec.gen}${rec.traits.length ? ` · ${rec.traits.join(' ')}` : ''}`), rel);
    return li;
  });
  // Empty places: the pond's breeding lines to choose from, most valuable first.
  if (H.stock.length < 2) {
    const cands = hatchCandidates(world), pick = el('li', 'slot empty picker');
    pick.append(el('span', 'sc-sub', H.stock.length ? `Pair ${H.stock[0].name} with:` : 'Choose a breeding pair from your pond'));
    if (!cands.length) pick.append(el('span', 'note', H.stock.length ? 'No other grown animal of its kind in the pond yet.' : 'No kind has two grown animals yet: let the pond grow, or spawn some from the dock.'));
    const rows = H.stock.length
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
        who.append(nm, colored('span', 'tr', a.life.traits.length ? a.life.traits.join(' ') : describe(a).label));
      }
      const val = el('span', 'val');
      val.append(el('i', 'essence'), document.createTextNode(String(row.animals.reduce((s, a) => s + recycleValue(a), 0))));
      b.append(ic, who, val);
      b.title = row.n ? `${describe(first).label}: ${row.n} grown in the pond. These two go into the hatchery.` : `Put ${first.life.name} in as the other half of the pair`;
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
      if (u.cur === 'essence' ? !spendEssence(world, price) : !spend(world, price)) return;
      H.levels[key]++;
      renderHatchery();
    });
    li.append(el('b', null, u.label), el('span', 'lv', `lv ${lvl}`), b, el('span', 'note', u.note));
    return li;
  }));
}


// ---- the depths: a side view of the pond, and the evolution tree ------------------------------------
// The slice (above the minimap) is the pond cut from the beach to the far side:
// the beach and the tide, the floor, and the deep shelves erosion has opened,
// with a dot for each animal at its depth. Clicking it opens the tree: each
// depth tier on the fresh and salt branches, and the species it lets you spawn.

const evoUi = { open: false, timer: 0, sig: '' };
const SLICE_SKY = hexToInt('#7ec8e0'), SLICE_SAND = hexToInt('#c8b484'), SLICE_ROCK = hexToInt('#2a2e34'), SLICE_WATER = hexToInt('#1b6a7c');

function drawSlice() {
  const cv = byId('slice'), g = cv.getContext('2d'), S = cv.width, T = cv.height, img = g.createImageData(S, T), px = new Uint32Array(img.data.buffer);
  const side = world.shoreSide ?? 3, axisX = side < 2, len = axisX ? world.W : world.H, cross = axisX ? world.H : world.W;
  // a: distance from the landward edge (0) out to the far side (len); pos: the world coordinate along the axis.
  const posOf = (a) => (side === 0 || side === 2 ? a : len - 1 - a), aOf = (pos) => (side === 0 || side === 2 ? pos : len - 1 - pos);
  const at = (a, f) => { const pos = clamp(posOf(a), 0, len - 1); return axisX ? [pos, cross * f] : [cross * f, pos]; };
  const tide = world.shore ? world.tide.level : 0.5, surf = 6 + (1 - tide) * 10, toeY = 22, shelfY = 27, abyssY = T - 3;
  // Where the beach ends and where the drop-off begins (across three lines of the pond).
  let beach = 0, lip = len;
  if (world.shore) for (let a = 0; a < len; a += 2) { if ([0.3, 0.5, 0.7].some((f) => shoreAt(world, ...at(a, f)) > 0.02)) beach = a; }
  if (world.depth) for (let a = beach; a < len; a += 2) { if ([0.3, 0.5, 0.7].some((f) => depthAt(world, ...at(a, f)) > 0.05)) { lip = a; break; } }
  // The beach keeps at least a quarter of the strip however far the pond grows.
  const share = world.shore && beach > 4 ? Math.max(0.25, beach / len) : 0;
  const toA = (i) => { const u = (i + 0.5) / S; return !share ? u * len : u < share ? u / share * beach : beach + (u - share) / (1 - share) * (len - beach); };
  const toI = (a) => (!share ? a / len : a < beach ? a / beach * share : share + (a - beach) / Math.max(1, len - beach) * (1 - share)) * S;
  const water = world.waterColor || SLICE_WATER, dark = DEEP_COLOR[world.opts.habitat] || DEEP_COLOR.mixed;
  const ground = new Float32Array(S), bg = world.bg, bgDry = world.bgDry, W = world.W;
  // The floor's own colour where the slice cuts it (the beach dry at the top of the tide), darkened by depth as the pond is.
  const floorAt = (a) => {
    let r = 0, gr = 0, b = 0, n = 0;
    for (const f of [0.3, 0.5, 0.7]) {
      const [x, y] = at(a, f), p = clamp(Math.round(x), 0, W - 1) + clamp(Math.round(y), 0, world.H - 1) * W;
      const c = bg ? (bgDry && world.shore && world.shore[p] > tide * 255 ? bgDry[p] : bg[p]) : SLICE_SAND;
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
    ground[i] = e > 0.02 ? 6 + (1 - e) * (toeY - 6) : d > 0.02 ? shelfY + d * (abyssY - shelfY) : toeY + slope * (shelfY - toeY);
    const top = mixColor(floorAt(a), dark, d * 0.85);
    for (let j = 0; j < T; j++) {
      let c;
      // Under the floor: its colour, darkening into the layers below.
      if (j >= ground[i]) c = mixColor(top, 0xff0a0c10, clamp((j - ground[i]) / 14, 0, 1) * 0.6);
      else if (j < surf) c = mixColor(SLICE_SKY, 0xff101820, world.darkness * 0.8);
      else c = mixColor(water, dark, clamp((j - surf) / (abyssY - surf), 0, 1) * 0.95);
      px[i + j * S] = c;
    }
  }
  // The water's surface, and the erosion toward the next tier along the bottom.
  for (let i = 0; i < S; i++) if (ground[i] > surf) px[i + Math.floor(surf) * S] = 0xffe8f4f8;
  const E = world.erosion, next = E && DEPTH_TIERS[E.tier + 1];
  if (next) {
    const prev = DEPTH_TIERS[E.tier].erosion, k = clamp((E.e - prev) / (next.erosion - prev), 0, 1);
    for (let i = 0; i < Math.round(S * k); i++) px[i + (T - 1) * S] = 0xffff8bc3;
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
  const tier = E ? E.tier : 0;
  cv.title = `${tierName(world, tier)}${next ? ` · next: ${tierName(world, E.tier + 1).toLowerCase()} (erosion ${E.e.toFixed(1)} of ${next.erosion})` : ' · the deepest the pond can go'}. The box is what's on screen. Click for the depths and what lives there.`;
}

function setEvo(open) {
  evoUi.open = open;
  byId('evo').hidden = !open;
  if (open) { setScore(false); setHatchery(false); evoUi.sig = ''; renderEvo(); }
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
    'A mark that comes from nowhere (1 in 1,500 births), from fossils, or from being born near the drowned idol or in the abyss. It passes to young: 15% from one marked parent, 35% from two. The pond resists it: once about one animal in twelve is marked, the dreams stop spreading it.',
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
    DEPTH_TIERS.forEach((t, i) => {
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
            if (!spendEssence(world, d.unlock)) return;
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
  byId('bar-name').textContent = world.seed;
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
  const E = world.erosion || newErosion();
  byId('sp-depth').textContent = `${fmt(pondFathoms(world))} fathoms`;
  byId('sp-zone').textContent = tierName(world, E.tier);
  const parts = Object.entries({ ...(E.parts || {}), points: E.pts || 0 }).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]);
  byId('sp-parts').replaceChildren(colorize(parts.length ? `Deepened by ${parts.map(([k, v]) => `${DEPTH_PARTS[k] || k} ${v.toFixed(1)}`).join(', ')}` : 'The pond has only just begun to wear deeper.'));
  byId('sp-points').textContent = fmt(G.points);
  byId('sp-pearls').textContent = fmt(G.pearls);
  byId('sp-essence').textContent = fmt(G.essence || 0);
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
    G.corruptionEarned ? `corruption: ${Math.floor(G.corruption || 0)}` : '',
  ].filter(Boolean).join(' · ') + '. Popular, high-scoring ponds draw more litter; aerators make blights rarer.'));
  byId('sp-best').textContent = G.best ? `Best find: ${TIERS[G.best.tier]} ${findLabel(G.best)}${G.best.name ? `, ${G.best.name}` : ''}` : '';
  byId('sp-recent').replaceChildren(...(G.recent.length ? G.recent.slice(0, 6).map((r) => {
    const li = el('li');
    const amount = el('b', r.ess ? 'ess' : null, `+${fmt(r.n)}`);
    if (r.ess) amount.append(el('i', 'essence'));
    li.append(amount, colored('span', null, r.why), el('time', null, `D${r.day} ${clockLabel(r.clock)}`));
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
    btn.append(el('span', 'rk', `#${i + 1}`), el('b', null, p.id), el('span', 'pt', `${fmt(p.depth || 1)} fm`),
      el('span', 'mt', [p.best && `${TIERS[p.best.tier]} ${findLabel(p.best)}`, `${fmt(p.points)} points`, `${p.animals} animals`, `day ${Math.floor(p.days) + 1}`].filter(Boolean).join(' · ')));
    if (p.best) btn.querySelector('.mt').style.color = TIER_COLOR[p.best.tier];
    btn.addEventListener('click', () => visitPond(p.id));
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
  hideCreature();
  byId('object').hidden = false;
  renderObject();
}
function hideObject() { objUi.o = null; byId('object').hidden = true; }

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
    parts.push(colored('p', 'cr-sub', `${def.desc}.`), el('p', 'note', `Built on day ${Math.floor(o.born || 0) + 1}${depthAt(world, o.x, o.y) > 0.15 ? ' · in deep water: it lets the pond hold more, and draws deep life up' : ''}`));
    for (const [k, T] of Object.entries(STRUCT_TRAITS)) {
      const lv = (o.lv && o.lv[k]) || 0;
      tree.append(traitButton(T.label, 'pearls', lv < T.max ? T.cost(o, lv) : null, T.note, lv >= T.max, () => buyStructTrait(world, o, k), pips(lv, T.max), null, renderObject));
    }
    if (o.kind === 'island') {
      const st = o.stack || 1, rc = raiseCost(o);
      tree.append(traitButton('Raise the island', 'pearls', st < ISLAND_MAX ? rc.pearls : null, `bigger, higher and lusher (and ${rc.essence} essence)`, st >= ISLAND_MAX, () => raiseIsland(world, o), pips(st, ISLAND_MAX), '#7cc44c', renderObject));
      if (st >= 3) {
        for (const [k, B] of Object.entries(ISLAND_BRANCH)) {
          if (o.branch && o.branch !== k) continue;
          const lv = o.blv || 0;
          tree.append(traitButton(B.label, B.cur, lv < 3 ? B.cost(lv) : null, B.note, lv >= 3, () => growIsland(world, o, k), pips(lv, 3), k === 'life' ? '#ffd870' : '#3aff9a', renderObject));
        }
      } else parts.push(el('p', 'note', 'Raise it to level 3 and it can go one of two ways: lanterns of life, or the whispering stone.'));
    }
    if (o.kind === 'hatchery') tree.append(traitButton('Open the hatchery', null, null, '', false, () => { hideObject(); setHatchery(true); return false; }, null, '#f8c050', renderObject));
    if (def.habitatFor) {
      const inf = habitatInfluences(world, o);
      parts.push(colored('p', 'note', `Breeds: ${def.habitatFor.filter((k) => SINGULAR[k] && fitsHabitat(world, SPECIES_HABITAT[k] || 'both')).map((k) => plural(SINGULAR[k], 2).toLowerCase()).join(', ')}.`),
        colored('p', 'note', inf.length ? `Around it: ${inf.join('; ')}.` : 'Nothing around it shapes the young yet: glowing plants, clean or warm water, coral, an island of life (or darker things, litter and carrion) within reach will.'));
    }
  } else {
    const g = o.growth ?? 1, likes = typeof likedByText === 'function' ? likedByText(o.make) : '';
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
  byId('slice').addEventListener('click', () => setEvo(!evoUi.open));
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
    btn.hidden = !has;
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
