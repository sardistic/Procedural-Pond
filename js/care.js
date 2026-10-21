'use strict';
// Browser-local guidance. Simulation rules remain in game.js and life.js.
const CARE_KEY = 'pond.care.v1';
const CARE = { key: null, state: null, records: {}, choosing: false, timer: 0 };
try {
  const saved = JSON.parse(localStorage.getItem(CARE_KEY) || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [key, value] of Object.entries(saved).slice(-24)) {
      if (!value || typeof value.seed !== 'string' || !Number.isInteger(value.step) || value.step < 0 || value.step > 4) continue;
      const g = value.goal;
      if (g && !(g.kind === 'depth' && Number.isInteger(g.tier) && g.tier > 0)
          && !(g.kind === 'discovery' && Array.isArray(g.known) && g.known.every((k) => typeof k === 'string'))) value.goal = null;
      CARE.records[key] = value;
    }
  }
} catch { /* Guidance also works without storage. */ }

function careState(w) {
  if (!w.game || w.observe || !w.inst) return null;
  const key = `${SAVE_EPOCH}:${w.seed}:${w.inst}`;
  if (CARE.key !== key) {
    CARE.key = key;
    const old = CARE.records[key];
    CARE.state = old && Number.isInteger(old.step) && old.step >= 0 && old.step <= 4 ? old
      : { step: 0, hidden: w.days >= 1, seed: w.seed, subject: null, goal: null };
    CARE.choosing = false;
  }
  return CARE.state;
}
function careSave() {
  if (!CARE.key || !CARE.state) return;
  delete CARE.records[CARE.key];
  CARE.records[CARE.key] = CARE.state;
  const keys = Object.keys(CARE.records);
  for (const k of keys.slice(0, Math.max(0, keys.length - 24))) delete CARE.records[k];
  try { localStorage.setItem(CARE_KEY, JSON.stringify(CARE.records)); } catch { /* storage unavailable */ }
}
function careForget(seed) {
  for (const [k, s] of Object.entries(CARE.records)) if (s.seed === seed) delete CARE.records[k];
  if (CARE.state?.seed === seed) { CARE.key = null; CARE.state = null; }
  try { localStorage.setItem(CARE_KEY, JSON.stringify(CARE.records)); } catch { /* storage unavailable */ }
}
const careResident = (w, seed) => w.creatures.find((c) => c.seed === seed && c.life && !c.leaving && !c.dying);
function careSubject(w, s) {
  return careResident(w, s.subject) || w.creatures.find((c) => c.life && !c.leaving && !c.dying && carePlant(w, c))
    || w.creatures.find((c) => c.life && !c.leaving && !c.dying);
}
function carePlant(w, c) {
  const likes = likesOf(c) || [];
  return Object.keys(TOOLS).filter((k) => TOOLS[k].place && likes.includes(TOOLS[k].likedBy) && pinUsable(k))
    .sort((a, b) => (TOOLS[a].price || 0) - (TOOLS[b].price || 0))[0] || null;
}
function careEvent(kind, c = null, tool = null, x = 0, y = 0) {
  const s = careState(world);
  if (!s || s.hidden || s.step >= 4 || s.goal) return;
  if (kind === 'inspect' && s.step === 0) { s.subject = c.seed; s.step = 1; }
  else if (kind === 'inspect' && s.step === 2) s.subject = c.seed;
  else if (kind === 'tool' && s.step === 1 && TOOLS[tool]?.food) s.step = 2;
  else if (kind === 'tool' && s.step === 2) {
    const target = careSubject(world, s);
    if (!target || !TOOLS[tool]?.place || !(likesOf(target) || []).includes(TOOLS[tool].likedBy)
        || (target.x - x) ** 2 + (target.y - y) ** 2 >= COMFORT_R ** 2) return;
    s.subject = target.seed; s.before = Math.round(target.life.comfort * 100); s.step = 3;
  } else return;
  careSave(); careTick(true);
}

function careBreeding(w, c) {
  const block = breedingBlock(w, c), L = c.life;
  const messages = {
    species: 'This kind does not use natural pair breeding.', leaving: 'Leaving the pond.', held: 'Release it so it can breed.',
    young: 'Still growing: needs adult size and maturity.', habitat: 'Needs a suitable breeding habitat nearby.',
    food: 'Needs more than 65% fullness.', rest: `Resting between broods: ${Math.max(0, Math.ceil(L.cooldown))} pond seconds left.`,
    tension: 'Needs local tension below 75/100.',
  };
  if (block) return messages[block];
  if (pondPopulation(w) > (w.maxPop || 130)) return 'The pond is above its breeding capacity.';
  const key = breedKey(c), rule = BREED[c.species], cap = c.species === 'wild' ? (c.sp.schooling ? 14 : 5) : rule.cap;
  const count = w.creatures.filter((a) => !a.leaving && breedKey(a) === key).length
    + w.eggs.filter((e) => e.key === key).reduce((n, e) => n + e.cells.length, 0);
  if (count >= cap) return `This kind has filled its breeding room (${count}/${cap}, including eggs).`;
  const mates = w.creatures.filter((a) => a !== c && breedKey(a) === key && breedingBlock(w, a) === null);
  if (!mates.length) return 'Needs another ready adult of the same kind.';
  if (!mates.some((a) => (a.x - c.x) ** 2 + (a.y - c.y) ** 2 < 1600)) return 'A ready mate is elsewhere; they need to come closer.';
  return 'Ready when the pair stays close. Broods are checked each pond second.';
}
function careSelectTool(c, name) {
  if (world.observe || !world.creatures.includes(c) || !pinUsable(name)) return;
  hideCreature(); setCensus(false); setHud(false); setActions(false);
  centerOn(c.x, c.y); setTool(name);
  showTicker(`${TOOLS[name].label}: choose a spot near ${c.life.name}. ${TOOLS[name].price || 0} pearls per use.`);
}
function animalCareCard(w, c, existing = null) {
  const box = existing || el('section', 'cr-care');
  if (!existing) {
    box.setAttribute('aria-label', 'Care and breeding');
    box.append(el('b', null, 'Care & breeding'), el('p', 'care-condition'), el('p', 'care-breeding'));
    const details = el('details'), summary = el('summary', null, 'What affects comfort');
    summary.dataset.focusKey = 'care:details';
    details.append(summary, el('p', 'care-factors')); box.append(details);
    const actions = el('div', 'care-actions');
    for (const [key, label] of [['feed', 'Offer food'], ['habitat', 'Add liked habitat']]) {
      const b = el('button', null, label); b.type = 'button'; b.dataset.careAction = key;
      b.dataset.focusKey = `care:${key}`;
      b.addEventListener('click', () => careSelectTool(box.careCreature, b.dataset.toolName)); actions.append(b);
    }
    box.append(actions);
  }
  box.careCreature = c;
  const f = comfortFactors(w, c), plant = carePlant(w, c), pct = (v) => Math.round(v * 100);
  const pressures = [['Water mismatch', f.water], ['Local tension', f.tension], ['Pollution', f.pollution], ['Blight', f.blight]]
    .filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  box.querySelector('.care-condition').textContent = c.life.energy < 0.35 ? 'Hungry: offer food nearby.'
    : likesOf(c) && f.cover < 3 ? `${f.cover}/3 mature liked habitat objects nearby. More can improve comfort.`
    : pressures.length ? `${pressures[0][0]} is reducing comfort here.` : 'Comfort has no active water, tension, pollution or blight penalty.';
  box.querySelector('.care-breeding').textContent = `Breeding: ${careBreeding(w, c)}`;
  box.querySelector('.care-factors').textContent = [
    `Comfort now ${pct(c.life.comfort)}%; tending toward ${pct(f.target)}% at this spot.`,
    `${likesOf(c) ? 'Liked habitat' : 'Base comfort for this kind'} +${pct(f.cover / 3)} points.`,
    ...pressures.map(([label, v]) => `${label} −${pct(v)} points.`),
    f.aura ? `Structure auras +${pct(f.aura)} points.` : '', f.light ? 'Nearby glow +15 points.' : '',
    f.land ? `Surrounding land ${f.land > 0 ? '+' : ''}${pct(f.land)} points.` : '',
    'New plants must grow to 40% before they count; comfort adjusts gradually as the animal moves.',
  ].filter(Boolean).join(' ');
  const feed = box.querySelector('[data-care-action="feed"]'), habitat = box.querySelector('[data-care-action="habitat"]');
  feed.dataset.toolName = 'feed'; feed.textContent = 'Offer pellets · free';
  habitat.dataset.toolName = plant || ''; habitat.hidden = !plant;
  if (plant) habitat.textContent = `${TOOLS[plant].label} · ${TOOLS[plant].price || 0} pearls`;
  box.querySelector('.care-actions').hidden = !!w.observe;
  return box;
}

function carePin(kind) {
  const s = careState(world);
  if (!s) return;
  if (kind === 'depth' && !DEPTH_TIERS[world.erosion.tier + 1]) return;
  s.goal = kind === 'depth' ? { kind, tier: world.erosion.tier + 1 }
    : { kind: 'discovery', known: [...(knownList(world) || [])] };
  s.hidden = false; CARE.choosing = false; careSave(); careTick(true);
}
function careGoal(w, goal) {
  if (goal.kind === 'depth' && DEPTH_TIERS[goal.tier]) {
    const tier = DEPTH_TIERS[goal.tier], before = DEPTH_TIERS[Math.max(0, goal.tier - 1)].erosion;
    return { title: 'Reach the next depth', done: w.erosion.tier >= goal.tier,
      text: `${Math.floor(clamp((w.erosion.e - before) / (tier.erosion - before), 0, 1) * 100)}% toward ${tierName(w, goal.tier)}. Living plants, structures and tides deepen the pond.`, action: 'View depths' };
  }
  return { title: 'Welcome a new kind', done: (knownList(w) || []).some((k) => !(goal.known || []).includes(k)),
    text: 'Grow the habitat and allow time for arrivals. Animals lists eligible newcomers and their lures; arrival is not guaranteed immediately.', action: 'View animals' };
}
function careOpen() {
  const s = careState(world);
  if (!s) return;
  s.hidden = false; CARE.choosing = s.step >= 4 && !s.goal;
  setHud(false); careSave(); careTick(true);
}
function careTick(force = false) {
  if (!force && performance.now() < CARE.timer) return;
  CARE.timer = performance.now() + 500;
  const s = careState(world), box = document.getElementById('pond-care');
  if (!box) return;
  document.getElementById('open-care').hidden = !!world.observe;
  box.hidden = !s || s.hidden || !!document.getElementById('entry') || world.bones || !document.getElementById('banner').hidden;
  if (box.hidden) return;
  box.classList.toggle('compact', WINDOWS.some(([id]) => !document.getElementById(id).hidden));
  const c = !s.goal && careSubject(world, s), plant = c && carePlant(world, c);
  const step = Math.min(4, s.step), goal = s.goal && careGoal(world, s.goal);
  const choosing = CARE.choosing || (!goal && step === 4);
  const titles = ['Meet a resident', 'Offer a first meal', 'Make a comfortable spot', 'See what changed', 'Make this pond your own'];
  const texts = [
    'Look at an animal to see its fullness, comfort and breeding needs.',
    'Choose free pellets, then tap the water near an animal. Watch for a meal and a fuller food meter.',
    c && plant ? `Add ${TOOLS[plant].label.toLowerCase()} near ${c.life.name}. This is habitat it likes; seedlings need time to mature.`
      : 'Inspect another resident to find habitat you can place. You can also choose an ambition below.',
    c ? `${c.life.name}: comfort ${Math.round(c.life.comfort * 100)}%${c.seed === s.subject && Number.isFinite(s.before) ? ` (was ${s.before}%)` : ''}. Open its care card to see the current influences. Moving, plant growth and local conditions all matter.` : 'Animals move on. Inspect another resident to see how its needs differ.',
  ];
  box.querySelector('.care-kicker').textContent = choosing ? 'An optional ambition' : goal ? 'Your pinned ambition' : `First steps · ${step + 1} of 4`;
  box.querySelector('h2').textContent = choosing ? 'What would you like to work toward?' : goal ? (goal.done ? 'Ambition reached' : goal.title) : titles[step];
  box.querySelector('.care-text').textContent = choosing ? 'Pick one to follow at your own pace. You can change it or dismiss it any time.' : goal ? goal.text : texts[step];
  const action = box.querySelector('[data-care="act"]');
  action.hidden = choosing;
  action.textContent = goal ? goal.action : ['Inspect a resident', 'Choose pellets', plant ? `Choose ${TOOLS[plant].label} · ${TOOLS[plant].price || 0} pearls` : 'View animals', 'Review care'][step];
  action.disabled = !goal && !c && step !== 2;
  box.querySelector('.care-choices').hidden = !choosing;
  box.querySelector('[data-care="depth"]').disabled = !DEPTH_TIERS[world.erosion.tier + 1];
  box.querySelector('[data-care="finish"]').hidden = !!goal || choosing || step !== 3;
  const change = box.querySelector('[data-care="choose"]');
  change.hidden = choosing; change.textContent = goal ? 'Change ambition' : 'Choose an ambition instead';
}

function initCare() {
  const box = document.createElement('aside'); box.id = 'pond-care'; box.hidden = true; box.setAttribute('aria-label', 'Pond care');
  box.innerHTML = '<header><span class="care-kicker"></span><button type="button" data-care="dismiss" aria-label="Dismiss pond care">×</button></header><h2></h2><p class="care-text"></p><div class="care-actions"><button type="button" data-care="act"></button><button type="button" data-care="finish">Finish first steps</button></div><div class="care-choices"><button type="button" data-care="depth">Reach the next depth</button><button type="button" data-care="discovery">Welcome a new kind</button></div><button type="button" class="care-change" data-care="choose">Choose an ambition instead</button>';
  document.body.append(box);
  const open = document.createElement('button'); open.id = 'open-care'; open.type = 'button'; open.textContent = 'Pond care';
  document.getElementById('open-guide').after(open);
  open.addEventListener('click', careOpen);
  box.addEventListener('click', (event) => {
    const action = event.target.closest('[data-care]')?.dataset.care, s = careState(world);
    if (!s || !action) return;
    if (action === 'dismiss') { s.hidden = true; careSave(); document.getElementById('show-hud').focus({ preventScroll: true }); }
    else if (action === 'choose') CARE.choosing = true;
    else if (action === 'finish') { s.step = 4; careSave(); CARE.choosing = true; }
    else if (action === 'depth' || action === 'discovery') carePin(action);
    else if (action === 'act') {
      if (s.goal) { if (s.goal.kind === 'depth') setEvo(true); else setCensus(true); }
      else {
        const c = careSubject(world, s), plant = c && carePlant(world, c);
        if (s.step === 1 && c) careSelectTool(c, 'feed');
        else if (s.step === 2 && plant) careSelectTool(c, plant);
        else if (s.step === 2) setCensus(true);
        else if (c) { centerOn(c.x, c.y); showCreature(c); }
      }
    }
    careTick(true);
  });
}
initCare();
