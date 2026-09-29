'use strict';
// Who comes to the pond, and when.
//  - A new pond knows only its pioneers (the snails, shrimp, crabs, starfish and jellies it starts
//    with). Every other kind has to find its way in first, and they come slowly: one kind at a time,
//    with a pause after each that grows as the pond gets to know more of them (about a pond day and
//    a half at first, several days later on). A kind can be spawned from the dock once it has found
//    its way in (the deep's own, and the reef's and pond's rarer kinds, can still be unlocked in the
//    depths for essence).
//  - Each pond has its own odds for each kind, from its seed: some kinds are common here, some rare.
//    The odds drift with the seasons, each kind on its own slow cycle, so what's likely changes.
//  - Ways round it: a lure (pearls) makes a kind far likelier to be the next to come, for two days;
//    a summons (essence) brings it at the next dawn, ready or not. The Wildlife window (the dock's
//    ? button) lists what hasn't come yet, how likely each is here, and what's due next.

const FIND_GAP = (n, world) => (1.1 + 0.3 * Math.max(0, n - 5)) * (world && hardMode(world) ? 1.6 : 1); // pond days to wait after a first arrival, by how many are known (longer in hard mode)
const kindHash = (k) => hashString(k) % 9973;

// This pond's odds for a kind: about 0.2 (rare here) to 1.8 (common here), drifting with the seasons.
function kindOdds(world, k) {
  const s = hashString(world.seed || 'pond') % 9967, h = hash2(s, kindHash(k), 41);
  const period = 16 + 36 * hash2(kindHash(k), 7, 13), phase = hash2(s % 887, kindHash(k), 5) * TAU;
  return (0.2 + 1.6 * h * h) * (1 + 0.45 * Math.sin(TAU * (world.days || 0) / period + phase)) * (typeof tempOdds === 'function' ? tempOdds(world, k) : 1); // (and the water's warmth: character.js)
}
const oddsWord = (o) => (o > 1.25 ? 'common here' : o > 0.75 ? 'fair odds here' : o > 0.4 ? 'unlikely here' : 'rare here');

const knownList = (world) => (world.game && world.game.known) || null;
const knows = (world, k) => { const K = knownList(world); return !K || K.includes(k); };
// For the dock: a kind can be spawned once it's known (the deep's own need their unlock as before; the
// reef's and the pond's designed kinds either).
function spawnable(world, k) {
  if (!DEEP[k]) return knows(world, k);
  const K = knownList(world), shallow = !DEEP[k].deepMin && DEEP[k].tier <= 1;
  return deepUnlocked(world, k) || (shallow && !!K && K.includes(k));
}

// Everything the pond has already had counts as known (older ponds lose nothing).
function ensureKnown(world, fresh = false) {
  const G = world.game;
  if (!G || G.known) return;
  const K = new Set();
  for (const c of world.creatures) if (c.life) K.add(c.species === 'tadpole' ? 'frog' : c.species);
  if (!fresh) {
    if (world.lineage) for (const r of world.lineage.values()) if (r.k) K.add(r.k === 'tadpole' ? 'frog' : r.k);
    for (const k of G.unlocked || []) K.add(k);
    for (const s of G.seen || []) if (s.startsWith('species:')) K.add(s.slice(8));
    // (An older pond has had time for everything that was already coming: its succession's kinds too.)
    if (world.succession) for (const k of Object.keys(world.succession.want || {})) K.add(k);
  }
  G.known = [...K].filter((k) => SPECIES[k]);
  if (typeof window !== 'undefined' && window.__TEST_ALL_KINDS) G.known = Object.keys(SPECIES); // (the test harness: every kind known)
  G.nextFind = (world.days || 0) + (fresh ? 1.2 : 0.5);
}

// May a kind that's never been here come now? Known kinds always may.
function canDiscover(world, k) {
  const G = world.game;
  if (!G || knows(world, k)) return true;
  if (G.summon === k) return true;
  const lured = G.lures && G.lures[k] > world.days;
  if (world.days < (G.nextFind || 0) - (lured ? FIND_GAP(G.known.length, world) * 0.7 : 0)) return false;
  return Math.random() < Math.min(1, 0.35 * kindOdds(world, k) * (lured ? 8 : 1));
}
// A kind has found its way in for the first time: it's known now, and the next has to wait.
function discover(world, k, subject = null) {
  const G = world.game;
  if (!G || !G.known || G.known.includes(k)) return;
  G.known.push(k);
  G.nextFind = world.days + FIND_GAP(G.known.length, world) * rand(0.75, 1.3);
  if (G.lures) delete G.lures[k];
  if (G.summon === k) G.summon = null;
  logEvent(world, `✦ New to the pond: ${plural(SINGULAR[k] || k, 2).toLowerCase()}.${hardMode(world) ? ' Keep them, and more may come' : ' You can spawn them from the dock now'}`, subject, { cat: 'rare', pri: 3 });
  if (typeof refreshSpeciesButtons === 'function') setTimeout(refreshSpeciesButtons, 0);
  if (typeof wildUi !== 'undefined' && wildUi.open) renderWild();
}
// Weighted choice among kinds, by this pond's odds (lured ones far more).
function pickByOdds(world, kinds) {
  const G = world.game, w = kinds.map((k) => kindOdds(world, k) * (G && G.lures && G.lures[k] > world.days ? 8 : 1));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kinds.length; i++) if ((r -= w[i]) <= 0) return kinds[i];
  return kinds[kinds.length - 1];
}

// Each dawn: a summoned kind comes, ready or not; lures run out.
function dawnArrivals(world) {
  const G = world.game;
  if (!G || world.observe) return;
  ensureKnown(world);
  if (G.lures) for (const [k, until] of Object.entries(G.lures)) if (until <= world.days) delete G.lures[k];
  const k = G.summon;
  if (k && SPECIES[k] && fitsHabitat(world, SPECIES_HABITAT[k] || 'both')) {
    const group = DEEP[k] && DEEP[k].deepMin ? SPECIES[k].spawn(world, ...deepSpot(world, k)) : null;
    let arrived = group;
    if (group) { for (const c of group) { initLife(c, { alpha: 0 }); noteBorn(world, c, 'arrived'); } world.creatures.push(...group); }
    else arrived = arrive(world, k);
    if (arrived && arrived.length) { world.targets[k] = (world.targets[k] || 0) + arrived.length; discover(world, k, arrived[0]); }
    G.summon = null;
  }
}

// ---- the Wildlife window ---------------------------------------------------------------------------------------
const wildUi = { open: false };
const lurePrice = (world, k) => Math.round(30 * (1 + 0.25 * (world.game.known || []).length) / Math.max(0.3, kindOdds(world, k)));
const summonPrice = (world, k) => Math.round(3 * spawnCost(k) + 12 * (world.game.known || []).length);
// Kinds that could come to this pond now or later (its water, its depth), not yet known.
function undiscovered(world) {
  return Object.keys(SPECIES).filter((k) => !knows(world, k) && fitsHabitat(world, SPECIES_HABITAT[k] || 'both') && (!DEEP[k] || (deepAvailable(world, k) && !DEEP[k].mythic)));
}
function setWild(open) {
  wildUi.open = open;
  byId('wild').hidden = !open;
  if (open) { closeWindows('wild'); renderWild(); }
}
function renderWild() {
  if (!wildUi.open) return;
  const G = world.game, list = undiscovered(world).sort((a, b) => kindOdds(world, b) - kindOdds(world, a)), rows = [];
  const due = (G.nextFind || 0) - world.days, mins = Math.max(0, Math.round(due * world.opts.dayLength / 60));
  byId('wild-status').replaceChildren(colorize(list.length ? `${(G.known || []).length} kinds have found their way in; ${list.length} could still come. ${due > 0.05 ? `The next new kind can come in about ${mins ? `${mins} minute${mins === 1 ? '' : 's'}` : 'a moment'} (a pond day is ${Math.round(world.opts.dayLength / 60)} minutes).` : 'A new kind could come any time now.'} Each pond has its own odds, and they drift with the seasons.` : 'Every kind this pond can have has found its way in.'));
  for (const k of list) {
    const o = kindOdds(world, k), li = el('li', 'wild-row'), ic = el('span', 'ic'), lured = G.lures && G.lures[k] > world.days, summoned = G.summon === k;
    ic.append(iconImg(speciesIcon(k), 28));
    const need = SUCCESSION[k] ?? 0, ready = (world.maturity ?? 0) >= need || !!DEEP[k];
    const info = el('div', 'who');
    info.append(el('b', null, SINGULAR[k]), colored('span', 'note', [oddsWord(o), !ready ? 'the pond isn’t alive enough for it yet' : '', lured ? 'lured' : '', summoned ? 'summoned: it comes at dawn' : ''].filter(Boolean).join(' · ')));
    const lure = el('button', 'lure'), sum = el('button', 'summon');
    lure.type = sum.type = 'button';
    lure.append(document.createTextNode('Lure '), el('i', 'pearl'), document.createTextNode(fmt(lurePrice(world, k))));
    sum.append(document.createTextNode('Summon '), el('i', 'essence'), document.createTextNode(fmt(summonPrice(world, k))));
    lure.title = 'A lure\nFor two days this kind is far likelier to be the next to come, and it can come a little sooner.';
    sum.title = 'A summons\nIt comes at the next dawn, whatever the odds (and whether or not the pond is ready).';
    lure.disabled = !!world.observe || lured || G.pearls < lurePrice(world, k);
    sum.disabled = !!world.observe || summoned || (G.essence || 0) < summonPrice(world, k) || hardMode(world);
    if (hardMode(world)) sum.title = 'A summons\nNot in hard mode: here, animals only come of their own accord (a lure helps).';
    lure.addEventListener('click', () => {
      if (!spend(world, lurePrice(world, k), 'life')) return;
      G.lures = { ...(G.lures || {}), [k]: world.days + 2 };
      logEvent(world, `You set out a lure for ${plural(SINGULAR[k], 2).toLowerCase()}`, null, { cat: 'pond', pri: 1 });
      renderWild();
    });
    sum.addEventListener('click', () => {
      if (!spendEssence(world, summonPrice(world, k), 'life')) return;
      G.summon = k;
      logEvent(world, `You summoned ${plural(SINGULAR[k], 2).toLowerCase()}: they come at dawn`, null, { cat: 'pond', pri: 2 });
      renderWild();
    });
    li.append(ic, info, lure, sum);
    rows.push(li);
  }
  byId('wild-list').replaceChildren(...rows);
}
// The dock's ? button: how many kinds haven't come yet.
function refreshWildButton() {
  const b = byId('wild-btn');
  if (!b || !world.game) return;
  ensureKnown(world);
  const n = undiscovered(world).length;
  b.hidden = !n || !!world.observe;
  b.querySelector('b').textContent = n;
  b.title = `Wildlife\n${n} kind${n === 1 ? '' : 's'} could still find their way into this pond. Click to see how likely each is here, and to lure or summon one.`;
}
