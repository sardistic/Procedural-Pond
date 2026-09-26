'use strict';
// On-screen HUD pieces outside the menu: the animal dock with its census, the
// journal, and the sky tracker. Loaded before main.js; main calls initHud()
// once, then hudTick() and updateSkyHud() every frame.

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

// ---- dock: one button per species, click to add ------------------------------------------

const DOCK_KINDS = Object.keys(SPECIES);

function buildDock() {
  const box = byId('animals');
  for (const kind of DOCK_KINDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ani';
    b.dataset.spawn = kind;
    b.setAttribute('aria-label', `Add ${SPECIES[kind].label.toLowerCase()}`);
    b.append(iconImg(speciesIcon(kind)), Object.assign(document.createElement('b'), { textContent: '0' }));
    b.addEventListener('click', () => spawn(kind));
    box.append(b);
  }
}

function updateCounts() {
  const n = {};
  let total = 0;
  for (const c of world.creatures) {
    n[c.species] = (n[c.species] || 0) + 1;
    if (c.life) total++;
  }
  for (const b of document.querySelectorAll('#animals [data-spawn]')) {
    const k = n[b.dataset.spawn] || 0, el = b.lastChild;
    if (el.textContent === String(k)) continue;
    el.textContent = k;
    b.classList.toggle('none', !k);
    b.title = `${SPECIES[b.dataset.spawn].label}: ${k} in the pond. Click to add more.`;
  }
  byId('census-count').textContent = total;
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
          energyBar(d.energy), el('span', 'mood', [d.traits.length && `✦ ${d.traits.join(' ')}`, d.mood].filter(Boolean).join(' · ')));
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
const journalUi = { open: false, filter: 'all', seq: -1, toast: '', toastUntil: 0 };

function setJournal(open) {
  journalUi.open = open;
  byId('log-panel').hidden = !open;
  byId('log-line').setAttribute('aria-expanded', open);
  if (open) { world.journalDirty = true; renderJournal(); setCensus(false); }
}

function showTicker(text) {
  journalUi.toast = text;
  journalUi.toastUntil = performance.now() + 4000;
  journalUi.seq = -1;
  renderJournal();
}

function entryTime(e) { return `D${e.day} ${clockLabel(e.clock)}`; }

function renderJournal() {
  const line = byId('log-line'), text = line.querySelector('.txt'), time = line.querySelector('time'), dot = line.querySelector('.dot');
  const toast = performance.now() < journalUi.toastUntil, top = world.journal[0];
  if (toast) {
    if (journalUi.seq !== -2) { journalUi.seq = -2; text.textContent = journalUi.toast; time.textContent = ''; dot.className = 'dot cat-pond'; }
  } else if (top && top.seq !== journalUi.seq) {
    journalUi.seq = top.seq;
    text.textContent = top.text;
    line.title = `${top.text}\nClick for the journal (J)`;
    time.textContent = clockLabel(top.clock);
    dot.className = `dot cat-${top.cat}`;
    line.classList.remove('flash');
    void line.offsetWidth; // restart the flash animation
    line.classList.add('flash');
  }
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

// ---- wiring ------------------------------------------------------------------------------------

function initHud() {
  buildDock();
  buildJournalFilters();
  byId('census-btn').addEventListener('click', () => setCensus(!census.open));
  byId('log-line').addEventListener('click', () => setJournal(!journalUi.open));
  byId('sky-btn').addEventListener('click', () => setSky(!skyUi.open));
  byId('census-close').addEventListener('click', () => setCensus(false));
  byId('log-close').addEventListener('click', () => setJournal(false));
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('select, input')) return;
    if (e.key === 'j' || e.key === 'J') setJournal(!journalUi.open);
    else if (e.key === 'c' || e.key === 'C') setCensus(!census.open);
    else if (e.key === 'Escape') { setJournal(false); setCensus(false); setSky(false); }
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
}
