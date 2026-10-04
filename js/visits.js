'use strict';
// Visitors who can do something: an owner can open their pond to visitors planting in it, and to visitors giving its
// animals a mind (Your ponds → "Visitors may…"). A visitor's page sends what they do to the server, where it waits;
// the owner's page takes it every half minute while the pond is open and applies it by the pond's own rules (where
// a plant can grow, which animals can have a mind, five at most), with a line in the journal saying who did it.
// What a visitor plants shows on their screen at once; the rest shows when the owner's pond has taken it.

const VISIT = { timer: 10, planting: false, plant: null, applied: 0 };
const visitAllowed = () => (world.observe && world.observe.visit) || null;
const ownVisit = () => (world.game && world.game.visit) || {};

// ---- the owner's side -----------------------------------------------------------------------------------------
function initVisitOptions() {
  for (const [id, key] of [['pond-visit-plant', 'plant'], ['pond-visit-minds', 'minds']]) {
    const cb = document.getElementById(id);
    if (!cb) continue;
    cb.addEventListener('change', () => {
      if (!world.game || world.observe) return;
      world.game.visit = { ...ownVisit(), [key]: cb.checked };
      if (!world.game.visit.plant && !world.game.visit.minds) delete world.game.visit;
      world.gameDirty = true;
      showTicker(key === 'plant' ? (cb.checked ? 'Visitors can plant in your pond now' : 'Visitors can no longer plant in your pond')
        : (cb.checked ? 'Visitors can give your animals a mind now' : 'Visitors can no longer give your animals a mind'));
      if (typeof syncPond === 'function') syncPond(true);
    });
  }
}
// (Kept in step with whichever pond is open.)
function syncVisitOptions() {
  const v = ownVisit(), p = document.getElementById('pond-visit-plant'), m = document.getElementById('pond-visit-minds');
  if (p && document.activeElement !== p) { p.checked = !!v.plant; p.disabled = !!world.observe; }
  if (m && document.activeElement !== m) { m.checked = !!v.minds; m.disabled = !!world.observe; }
}

// Take what visitors have done, and do it.
async function takeVisits() {
  const v = ownVisit();
  if (world.observe || !(v.plant || v.minds) || !world.link || !world.link.id || !world.link.key || typeof api !== 'function') return;
  let got;
  try { got = await api('POST', `/ponds/${world.link.id}/visits`, {}, world.link.key); } catch { return; }
  for (const a of (got && got.acts) || []) { try { applyVisit(a); } catch { /* one bad act never stops the rest */ } }
}
async function applyVisit(a) {
  const who = a.by ? a.by : 'A visitor', v = ownVisit();
  if (a.kind === 'plant' && v.plant) {
    const T = TOOLS[a.plant], tier = (world.erosion && world.erosion.tier) || 0;
    if (!T || !T.place || !GROW[a.plant] || !fitsHabitat(world, T.habitat) || (T.tier && tier < T.tier)) return;
    const x = clamp(a.x, 4, world.W - 4), y = clamp(a.y, 4, world.H - 4);
    if (isDry(world, x, y) || (T.deepMin && depthAt(world, x, y) < T.deepMin) || world.plants.length + world.pads.length > 2500) return;
    const day = Math.floor(world.days), G = world.game;
    if (G.visitDay !== day) { G.visitDay = day; G.visitPlants = 0; }
    if ((G.visitPlants = (G.visitPlants || 0) + 1) > 60) return; // (sixty a pond day at most)
    T.place(x, y);
    addRipple(world, x, y, 0.8, true);
    logEvent(world, `${who} planted ${(T.label || a.plant).toLowerCase()} in your pond`, null, { cat: 'pond', pri: 1, key: 'visit:plant', merge: (e) => `Visitors planted ${e.n} things in your pond` });
  } else if (a.kind === 'mind' && v.minds) {
    const c = world.creatures.find((q) => q.seed === a.seed && alive(q));
    if (!c || !c.life || typeof mindEligible !== 'function' || !mindEligible(c) || !mindControllerAllowed(c, a.controller)) return;
    if (typeof mindCheckCapabilities === 'function') { try { await mindCheckCapabilities(); } catch { /* checked again on awakening */ } }
    setMindController(world, c, a.controller);
    const label = (typeof MIND_CONTROLLERS !== 'undefined' && MIND_CONTROLLERS[a.controller]) || a.controller;
    if (!c.life.mind && !awakenMind(world, c)) { logEvent(world, `${who} offered ${who === 'A visitor' ? '' : 'your '}${c.life.name} a mind (${label}), but it couldn't wake just now`, c, { cat: 'pond', pri: 1 }); return; }
    logEvent(world, `✦ ${who} gave ${c.life.name} the ${describe(c).label} a mind: ${label}`, c, { cat: 'pond', pri: 2 });
  }
  world.gameDirty = true;
}

// ---- the visitor's side ---------------------------------------------------------------------------------------
// What a visitor can plant here: the pond's own plants for its water and depth.
function visitPlants() {
  const tier = (world.erosion && world.erosion.tier) || 0;
  return Object.entries(TOOLS).filter(([k, T]) => T.place && GROW[k] && fitsHabitat(world, T.habitat) && (!T.tier || tier >= T.tier) && !T.deepMin).map(([k, T]) => [k, T.label || k]);
}
// The bar's part for a visitor: what this pond lets them do, and the planting controls.
function renderVisitBar() {
  const bar = document.getElementById('observe-bar');
  if (!bar) return;
  let box = document.getElementById('observe-visit');
  const allow = visitAllowed(), lead = bar.querySelector('span'), tail = lead && lead.lastChild;
  // (The bar's own words: "look only", unless this pond lets visitors do something.)
  if (tail && tail.nodeType === 3) tail.textContent = allow && world.observe ? ", someone else's pond" : ", someone else's pond: look only";
  if (!allow || !world.observe) { if (box) box.remove(); VISIT.planting = false; return; }
  if (!box) { box = document.createElement('span'); box.id = 'observe-visit'; box.className = 'observe-visit'; bar.querySelector('span').after(box); }
  box.replaceChildren();
  const note = document.createElement('span');
  note.textContent = allow.plant && allow.minds ? 'Visitors may plant here and give its animals a mind (from their card)' : allow.plant ? 'Visitors may plant here' : 'Visitors may give its animals a mind (from their card)';
  box.append(note);
  if (allow.plant) {
    const sel = document.createElement('select'), list = visitPlants();
    sel.setAttribute('aria-label', 'What to plant');
    for (const [k, label] of list) { const o = document.createElement('option'); o.value = k; o.textContent = label; sel.append(o); }
    if (VISIT.plant && list.some(([k]) => k === VISIT.plant)) sel.value = VISIT.plant; else VISIT.plant = sel.value || null;
    sel.addEventListener('change', () => { VISIT.plant = sel.value; });
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'visit-plant';
    b.textContent = VISIT.planting ? 'Planting: tap the water' : 'Plant';
    b.setAttribute('aria-pressed', String(VISIT.planting));
    b.addEventListener('click', () => { VISIT.planting = !VISIT.planting; renderVisitBar(); });
    box.append(sel, b);
  }
}
// A tap on someone else's pond: planting, if that's what the visitor is doing.
function visitorTap(x, y) {
  const allow = visitAllowed();
  if (!allow || !allow.plant || !VISIT.planting || !VISIT.plant) return false;
  if (isDry(world, x, y)) { showTicker('Plants go in the water'); return true; }
  const k = VISIT.plant, T = TOOLS[k];
  api('POST', `/ponds/${world.observe.id}/visit`, { kind: 'plant', plant: k, x: Math.round(x), y: Math.round(y) }).then(() => {
    if (T && T.place) { try { T.place(x, y); } catch { /* shows when the owner's pond takes it */ } }
    addRipple(world, x, y, 0.8, true);
    showTicker(`Planted ${(T && T.label ? T.label : k).toLowerCase()}: it grows in the owner's pond the next time it's open`);
  }).catch((e) => showTicker(e && e.status === 429 ? 'That is enough planting here for now' : e && e.status === 403 ? 'This pond no longer takes planting' : "Couldn't plant just now"));
  return true;
}
// In an animal's card, on someone else's pond that allows it: give it a mind.
function visitorMindParts(c) {
  const allow = visitAllowed();
  if (!allow || !allow.minds || !c.life || typeof mindEligible !== 'function' || !mindEligible(c) || !alive(c)) return [];
  const box = document.createElement('div'), note = document.createElement('p'), row = document.createElement('div');
  box.className = 'visit-mind'; note.className = 'note'; row.className = 'mind-controls';
  note.textContent = c.life.mind ? 'This pond lets visitors choose its animals’ minds. Change the brain steering it:' : 'This pond lets visitors give its animals a mind. Choose a brain for it:';
  const short = { typesafe: 'Jev', 'fly-brain': 'Fly', 'fish-brain': 'Fish', 'hybrid-brain': 'Jev + Fish' };
  for (const [key, label] of Object.entries(MIND_CONTROLLERS)) {
    if (!mindControllerAllowed(c, key)) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = short[key] || label; b.setAttribute('aria-label', `Give it ${label}`); b.title = label;
    b.addEventListener('click', () => {
      api('POST', `/ponds/${world.observe.id}/visit`, { kind: 'mind', seed: c.seed, controller: key })
        .then(() => showTicker(`Sent: ${c.life.name} wakes with ${label} when the owner's pond next opens`))
        .catch((e) => showTicker(e && e.status === 429 ? 'That is enough for now' : e && e.status === 403 ? 'This pond no longer takes minds' : "Couldn't send that just now"));
    });
    row.append(b);
  }
  box.append(note, row);
  return [box];
}

// Every second or so: keep the options and the bar in step; every half minute the owner's page takes what's waiting.
initVisitOptions();
setInterval(() => {
  syncVisitOptions();
  if (world.observe) { const box = document.getElementById('observe-visit'); if (!!visitAllowed() !== !!box) renderVisitBar(); }
  else if (document.getElementById('observe-visit')) renderVisitBar();
  if ((VISIT.timer -= 1) <= 0) { VISIT.timer = 30; takeVisits(); }
}, 1000);
