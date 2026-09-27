'use strict';
// Little pixel-art tooltips for (almost) everything.
//  - Every control's `title` becomes one of these instead of the browser's own:
//    the title property is rerouted to data-tip, so tips set later work too.
//    "Heading\nbody" (or a short "Heading: body") shows a heading line.
//  - In the pond, pointing at a plant, a rock, a structure, a fossil, litter,
//    remains, eggs or a trench says what it is and what it does (animals have
//    their own hover card).

// What each plant does (the tools' tips and pointing at one in the pond).
const PLANT_TIPS = {
  weed: 'soft cover: it calms the water around it, sheds plankton for small fish, and fish lay their eggs on it',
  eelgrass: 'tall cover: it calms the water, sheds plankton, and fish lay their eggs in it',
  anemone: 'a clownfish pair adopts one and guards it from intruders',
  coral: 'reef: it calms the water and sheds plankton; on full-moon nights it spawns, and the fish feast',
  urchin: 'a spiny grazer that pufferfish and starfish like to be near',
  marimo: 'a moss ball on the floor that axolotls and snails like',
  duckweed: 'floating cover that frogs, ducks and tadpoles like',
  lily: 'floating pads: frogs sit on them, and koi, turtles and ducks like them',
  rock: 'shelter: crabs, eels, octopus and snails rest by rocks, and snails lay their eggs on them',
  blackcoral: 'coral of the deep (it grows only in deep water): shelter for the deep\'s own life',
  glowcap: 'glowing caps that grow only in deep water: they light the dark around them',
  tubeworms: 'tube worms of the trench: deep life gathers by them',
  paleroots: 'pale roots of the crypts: deep life gathers by them',
  sealily: 'sea lilies of the black below: they glow, and deep life gathers by them',
  weepmoss: 'weeping moss of the roots: it glows faintly, and deep life gathers by it',
  starweed: 'star-weed of the drowned city: it glows, and the Deep Ones (and the Sleeper) are drawn to it',
};
const plantTip = (kind) => {
  const likes = typeof likedByText === 'function' ? likedByText(kind) : '';
  return `${capFirst(PLANT_TIPS[kind] || 'a plant')}${likes ? `. ${capFirst(likes)}` : ''}`.replace(/([^.…])$/, '$1.');
};

// What a tool does, with its price.
function toolTip(name, t) {
  const cost = [t.price ? `${t.price} pearls` : t.price === 0 ? 'free' : '', t.essence ? `${t.essence} essence` : '', t.corruption ? `${t.corruption} corruption` : ''].filter(Boolean).join(' + ');
  let what;
  if (t.build) {
    const d = STRUCTURES[t.build];
    what = `${capFirst(d.desc)}.${d.deepMin ? ' Only in deep water.' : ''}${t.build === 'island' ? ' Out over the deep it costs far more. Build one on an island to raise it.' : ''} Click the pond to place it.`;
  } else if (t.food) what = `${capFirst(t.hint.replace(/^[^:]+: /, ''))}. Click the pond to drop it.`;
  else if (name === 'net') what = 'Click an animal to recycle it for essence, or a plant or rock to take it out.';
  else what = `${plantTip(t.likedBy || name)}${t.deepMin ? ' Grows only in deep water.' : ''} Click the pond to plant it.`;
  return `${t.label}\n${what}${cost ? ` (${cost})` : ''}`;
}

// ---- the tooltip ------------------------------------------------------------------------------------------
const TIP = { el: null, target: null, show: 0, text: '', world: false };
function tipBox() {
  if (!TIP.el) { TIP.el = document.createElement('div'); TIP.el.className = 'tip'; TIP.el.hidden = true; document.body.append(TIP.el); }
  return TIP.el;
}
function renderTip(text) {
  const box = tipBox();
  if (text === TIP.text && !box.hidden) return;
  TIP.text = text;
  let head = '', body = text;
  const nl = text.indexOf('\n'), colon = text.indexOf(': ');
  if (nl > 0) { head = text.slice(0, nl); body = text.slice(nl + 1); } else if (colon > 0 && colon < 26) { head = text.slice(0, colon); body = capFirst(text.slice(colon + 2)); }
  const parts = [];
  if (head) parts.push(Object.assign(document.createElement('b'), { textContent: head }));
  if (body) { const p = document.createElement('span'); p.append(typeof colorize === 'function' ? colorize(body) : body); parts.push(p); }
  box.replaceChildren(...parts);
}
function placeTip(x, y) {
  const box = tipBox(), w = box.offsetWidth, h = box.offsetHeight;
  let left = x + 14, top = y + 18;
  if (left + w > innerWidth - 6) left = Math.max(6, x - w - 10);
  if (top + h > innerHeight - 6) top = Math.max(6, y - h - 12);
  box.style.left = `${Math.round(left)}px`; box.style.top = `${Math.round(top)}px`;
}
function hideTip() { if (TIP.el) TIP.el.hidden = true; TIP.target = null; TIP.world = false; clearTimeout(TIP.show); }

// Every title becomes a tip (now, and whenever code sets one later).
const TITLE = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'title');
Object.defineProperty(HTMLElement.prototype, 'title', {
  configurable: true,
  get() { return this.dataset.tip || ''; },
  set(v) { if (v) this.dataset.tip = String(v); else delete this.dataset.tip; if (TITLE) TITLE.set.call(this, ''); if (this.hasAttribute('title')) this.removeAttribute('title'); },
});
for (const el of document.querySelectorAll('[title]')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }

document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  // (Icon buttons with only a label, like the close buttons, say what they do.)
  const ib = e.target.closest && e.target.closest('button[aria-label]:not([data-tip])');
  if (ib) ib.dataset.tip = ib.getAttribute('aria-label');
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t || t === TIP.target) return;
  hideTip();
  TIP.target = t;
  TIP.show = setTimeout(() => { if (TIP.target !== t || !t.isConnected || !t.dataset.tip) return; renderTip(t.dataset.tip); tipBox().hidden = false; placeTip(e.clientX, e.clientY); }, 280);
});
document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || !TIP.target || !TIP.el || TIP.el.hidden) return;
  if (!TIP.target.isConnected) { hideTip(); return; } // (redrawn under the pointer)
  if (TIP.target.dataset.tip && TIP.target.dataset.tip !== TIP.text) renderTip(TIP.target.dataset.tip); // (it changed under the pointer)
  placeTip(e.clientX, e.clientY);
});
document.addEventListener('pointerout', (e) => { if (TIP.target && !TIP.world && (!e.relatedTarget || !TIP.target.contains(e.relatedTarget))) hideTip(); });
document.addEventListener('pointerdown', () => { if (!TIP.world) hideTip(); }, true);
addEventListener('scroll', hideTip, true);

// ---- in the pond ------------------------------------------------------------------------------------------
function worldTipAt(x, y) {
  if (world.hover) return null; // animals have their own card
  const fo = typeof fossilAt === 'function' && fossilAt(world, x, y);
  if (fo) return `${capFirst(FOSSIL_KINDS[fo.kind] || 'a fossil')}\nUncovered by the tide. Click to dig it up: essence, points and an ancient ${fo.gene} gene for a new spawn or a brood.${fo.kind === 'relic' ? ' Relics hold artifacts.' : ''}`;
  const li = typeof litterAt === 'function' && litterAt(world, x, y);
  if (li) return `${capFirst(LITTER[li.k].label)}\nLitter: it fouls the water around it${li.k === 'net' ? ', and ghost nets snare small animals' : ''}. Click it (a few times for the big ones) to haul it out for pearls.`;
  const rm = typeof remainsAt === 'function' && remainsAt(world, x, y);
  if (rm) return `Remains\nWhat's left of an animal. Click for essence and points before the scavengers pick it clean.`;
  const st = typeof structureAt === 'function' && structureAt(world, x, y);
  if (st) {
    const d = STRUCTURES[st.kind], extra = st.kind === 'island' ? ` Level ${st.stack || 1} of ${ISLAND_MAX}${st.branch ? `, ${st.branch === 'life' ? 'lanterns of life' : 'the whispering stone'} ${st.blv || 1}` : ''}.` : '';
    return `${d.label}\n${capFirst(d.desc)}.${extra} Click for its card.`;
  }
  const eg = (world.eggs || []).find((g) => Math.hypot(g.x - x, g.y - y) < 4);
  if (eg) return `Eggs\n${eg.cells.length} ${plural(describe(eg.parent).label, eg.cells.length).toLowerCase()} eggs, hatching in about ${Math.max(1, Math.round(eg.timer))} seconds.`;
  const p = [...world.pads, ...world.plants].reverse().find((q) => q.hit && q.hit(x, y));
  if (p) return `${(typeof PLANT_NAMES !== 'undefined' && PLANT_NAMES[p.make]) || capFirst(p.make)}\n${plantTip(p.make)} Right-click or long-press for its traits.`;
  const rk = (world.rocks || []).find((r) => ((x - r.x) / (r.a || 5)) ** 2 + ((y - r.y) / (r.b || 5)) ** 2 < 1);
  if (rk) return `A rock\n${plantTip('rock')}`;
  const T = world.trench, px = Math.floor(x) + Math.floor(y) * world.W;
  if (T && T[px] && (T[px] & 127) > 40) return 'A trench\nThe floor falls away here into the dark, further than the light goes. Things glint along its rim.';
  return null;
}
const pondEl = document.getElementById('pond');
pondEl.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) { if (TIP.world) hideTip(); return; }
  const text = worldTipAt(world.pointer.x, world.pointer.y);
  if (!text) { if (TIP.world) hideTip(); return; }
  if (!TIP.world || TIP.text !== text) {
    const was = TIP.world;
    TIP.world = true; TIP.target = null;
    clearTimeout(TIP.show);
    const show = () => { if (!TIP.world) return; renderTip(text); tipBox().hidden = false; placeTip(TIP.x, TIP.y); };
    if (was) show(); else TIP.show = setTimeout(show, 350);
  }
  TIP.x = e.clientX; TIP.y = e.clientY;
  if (TIP.el && !TIP.el.hidden) placeTip(e.clientX, e.clientY);
});
pondEl.addEventListener('pointerleave', () => { if (TIP.world) hideTip(); });

// ---- the controls' own words ------------------------------------------------------------------------------
for (const b of document.querySelectorAll('#tools [data-tool], #builds [data-tool]')) { const t = TOOLS[b.dataset.tool]; if (t) b.title = toolTip(b.dataset.tool, t); }
const CONTROL_TIPS = {
  '#sky-btn': 'The sky\nThe time of day, the moon, the tide and the surf. Click for the light, the day length, the current and the speed (and the artifacts, once you find them).',
  '[data-toggle="caustics"]': 'Caustics\nThe rippling light on the floor in the sun.',
  '[data-toggle="shadows"]': 'Shadows\nEverything casts a shadow on the floor.',
  '[data-toggle="outlines"]': 'Outlines\nA dark edge round every shape (thicker for rare animals).',
  '#clear': 'Clear animals\nTake every animal out of the pond (their essence doesn\'t come back).',
  '#minimap': 'The map\nThe whole pond. Click or drag to jump there; the box is what you see.',
  '#census-btn': 'Census\nHow many animals, by species, with their young, elders, rares and worth. Click a species to list them.',
  '#nb-go': 'Go\nWalk along the beach into the next pond. You can look, but not touch.',
  '#nb-stay': 'Stay here',
  '#log-line': 'The journal\nThe latest news. Click for the whole journal (J).',
  '#hatch-feed': 'Feed the brood\nEach click feeds the hatchery; a full brood hatches.',
  '#evo-deepen': 'Deepen the pond\nWear it deeper with essence (dearer each time).',
  '#sky-big': 'The time of day\nDays pass as you watch (the day length is set here); night brings the fireflies, and the dark feeds madness.',
  '#sky-moon': 'The moon\nIt goes round every 8 days. Its phase sets the tides (spring tides at new and full moon) and how bright the nights are; on a full moon the corals spawn.',
};
for (const [sel, text] of Object.entries(CONTROL_TIPS)) for (const el of document.querySelectorAll(sel)) if (!el.dataset.tip || sel === '#sky-btn' || sel === '#minimap') el.title = text;
for (const s of document.querySelectorAll('details > summary')) {
  const k = s.textContent.trim().toLowerCase();
  s.title = { 'your ponds': 'Your ponds\nEvery pond you keep in this browser: switch between them, start a new one, copy the link.', 'tools & plants': 'Tools & plants\nFood, the net, and plants and rocks to place: pick one, then click the pond. Deeper tiers bring more.', build: 'Build\nBig structures with an area of effect, bought with pearls (some also essence). Deeper tiers bring more.', scene: 'Scene\nThe floor, the water, the world size, the current and speed, and what\'s drawn.', about: 'About\nHow the pond works, and how to earn.', 'how to earn': 'How to earn\nWhat pays points, pearls, essence and corruption, and what deepens the pond.' }[k] || '';
}
