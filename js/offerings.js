'use strict';
// Repeatable wealth sinks. Offerings never join the investment ledger or award points.
const OFFERINGS = {
  sun: { name: 'Hasten the sun', share: .15, min: 750, anger: 28 },
  deep: { name: 'Call the deep', share: .20, min: 1000, anger: 26 },
  soothe: { name: 'Still the void', share: .10, min: 500, anger: -25 },
};
function cleanOfferings(raw) {
  const S = raw && typeof raw === 'object' ? raw : {};
  const n = (k, cap = 1e12) => typeof S[k] === 'number' && Number.isFinite(S[k]) ? clamp(S[k], 0, cap) : 0;
  return { unlocked: S.unlocked === true, anger: n('anger', 100), sunUntil: n('sunUntil'), deepReady: n('deepReady'), count: Math.floor(n('count')), sacrificed: n('sacrificed', 1e18) };
}
const offeringState = w => cleanOfferings(w.game?.offerings);
function offeringsAvailable(w) {
  const G = w.game;
  return !!G && (G.offerings?.unlocked === true || G.pearls >= 5000 ||
    (G.points >= 25000 && G.pearls >= 1000 && (G.invested || 0) < G.points * .25));
}
const offeringAnger = w => Number.isFinite(w.game?.offerings?.anger) ? clamp(w.game.offerings.anger, 0, 100) : 0;
const offeringIncome = w => 1 - .35 * offeringAnger(w) / 100;
const offeringTension = (w, x, y) => offeringAnger(w) / 100 * (.06 + .24 * depthAt(w, x, y));
const offeringTimeRate = w => !w.observe && offeringState(w).sunUntil > (w.days || 0) ? 2 : 1;

function updateOfferings(w, dt) {
  if (!w.game || w.observe || !(dt > 0)) return;
  if (!w.game.offerings && !offeringsAvailable(w)) return;
  const S = w.game.offerings = offeringState(w);
  if (!S.unlocked && offeringsAvailable(w)) {
    S.unlocked = true;
    logEvent(w, 'Your wealth has drawn something nearer. Offerings are now available in Score and the sun panel.', null, { cat: 'story', pri: 2 });
  }
  S.anger = Math.max(0, S.anger - 3 * dt / w.opts.dayLength);
  w.gameDirty = true;
}

function offeringDepth(w) {
  const E = w.erosion, next = E && DEPTH_TIERS[E.tier + 1], here = E && DEPTH_TIERS[E.tier];
  if (!next || !here) return 0;
  // Include erosion still waiting for its normal tick. Repeated purchases cannot skip a tier.
  const effective = Math.max(E.e || 0, (E.acc ?? E.e ?? 0) + pointsDepth(w.game?.points || 0));
  return Math.max(0, Math.min((next.erosion - here.erosion) * .08, next.erosion - effective));
}
function offeringQuote(w, key) {
  const R = Object.hasOwn(OFFERINGS, key) ? OFFERINGS[key] : null, S = offeringState(w), now = w.days || 0;
  if (!R) return null;
  const pearls = Number.isFinite(w.game?.pearls) ? Math.max(0, w.game.pearls) : 0;
  const cost = Math.max(R.min, Math.ceil(pearls * R.share));
  let reason = '';
  if (w.observe) reason = 'Only this pond’s owner can make offerings.';
  else if (!offeringsAvailable(w)) reason = 'Offerings have not been discovered.';
  else if (key === 'sun' && S.sunUntil > now) reason = `Already hastened · ${(S.sunUntil - now).toFixed(2)} pond days remain.`;
  else if (key === 'deep' && w.opts.life === false) reason = 'Turn on living ecology to deepen the pond.';
  else if (key === 'deep' && S.deepReady > now) reason = `The deep is listening · ready in ${(S.deepReady - now).toFixed(2)} pond days.`;
  else if (key === 'deep' && offeringDepth(w) <= 1e-9) reason = 'Wait for the pond to settle into its next depth.';
  else if (key === 'soothe' && S.anger <= 0) reason = 'The void is already still.';
  else if (pearls < cost) reason = `Needs ${cost.toLocaleString()} pearls.`;
  return { cost, left: Math.max(0, pearls - cost), reason, anger: clamp(S.anger + R.anger, 0, 100), depth: key === 'deep' ? offeringDepth(w) : 0 };
}
function makeOffering(w, key) {
  const Q = offeringQuote(w, key);
  if (!Q || Q.reason || !spend(w, Q.cost)) return false;
  const S = w.game.offerings = offeringState(w);
  S.unlocked = true; S.anger = Q.anger; S.count++; S.sacrificed += Q.cost;
  if (key === 'sun') S.sunUntil = (w.days || 0) + 3;
  if (key === 'deep') {
    deepenBy(w, Q.depth, 'offerings'); w.erosion.next = 0;
    S.deepReady = (w.days || 0) + 1;
  }
  w.gameDirty = true;
  logEvent(w, `${OFFERINGS[key].name}: ${Q.cost.toLocaleString()} pearls vanish. ${key === 'soothe' ? 'The water loosens its grip.' : 'Something below remembers.'}`, null, { cat: 'story', pri: 2 });
  return true;
}

// The whole simulation advances, in small steps; dawn rewards cannot run ahead of aging/hunger.
// Split at expiry so a boost never leaks into the following day or skips a clock crossing.
function advanceOfferingTime(w, dt, step) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  if (offeringTimeRate(w) === 1) { step(dt); return; }
  let left = dt;
  while (left > 1e-10) {
    const rate = offeringTimeRate(w);
    const until = (offeringState(w).sunUntil - (w.days || 0)) * w.opts.dayLength;
    if (rate === 2 && until <= 1e-9) {
      // Round-off at the exact endpoint must not trap this frame in a zero-length step.
      step(left); break;
    }
    const used = Math.min(left, .05 / rate, rate === 2 ? until / rate : left);
    step(used * rate); left -= used;
  }
}

let offeringsDialog = null;
function openOfferings(w) {
  if (!offeringsAvailable(w)) return;
  if (offeringsDialog) { offeringsDialog.dialog.close(); offeringsDialog = null; }
  const dialog = document.createElement('dialog'); dialog.id = 'offerings'; dialog.className = 'world-mystery offerings';
  dialog.setAttribute('aria-labelledby', 'offerings-title');
  dialog.innerHTML = `<button type="button" class="offering-dismiss" aria-label="Close offerings" autofocus>×</button><h2 id="offerings-title">What the water takes</h2>
    <p class="offering-intro">Pearls gather. Something notices. Offer a share of your wealth to change the pond.</p>
    <p class="offering-wallet"></p>
    <label class="offering-anger">Void anger <b></b><meter min="0" max="100" aria-label="Void anger"></meter></label>
    <p class="offering-consequence"></p><p class="offering-active"></p>
    <div class="offering-choices"></div>
    <p class="offering-footnote">Offerings earn no points or investment dividends. Your accumulated points stay intact. Anger fades by 3 each pond day; pausing stops it.</p>
    <p class="offering-result" role="status" aria-live="polite"></p>
    <button type="button" class="offering-close">Leave the water</button>`;
  const seed = w.seed, inst = w.inst, rows = {};
  const descriptions = {
    sun: 'The whole pond runs at ×2 for 3 pond days, on top of your Speed setting. Hunger, aging, breeding and tides all hasten. Void anger +28, up to 100.',
    deep: 'Wear away 8% of the gap between this depth and the next, capped at its edge. Once per pond day. Void anger +26, up to 100.',
    soothe: 'Reduce void anger by 25, down to zero. The void keeps the pearls.',
  };
  for (const [key, R] of Object.entries(OFFERINGS)) {
    const row = document.createElement('section'); row.className = 'offering-choice';
    const title = document.createElement('h3'); title.textContent = R.name;
    const desc = document.createElement('p'); desc.textContent = descriptions[key];
    const cost = document.createElement('p'); cost.className = 'offering-price';
    const button = document.createElement('button'); button.type = 'button'; button.dataset.offering = key;
    const status = document.createElement('p'); status.className = 'offering-reason';
    status.id = `offering-${key}-reason`; button.setAttribute('aria-describedby', status.id);
    button.addEventListener('click', () => {
      if (w.seed !== seed || w.inst !== inst) { dialog.close(); return; }
      const result = makeOffering(w, key);
      dialog.querySelector('.offering-result').textContent = result ? `${R.name}. The offering is accepted.` : offeringQuote(w, key)?.reason || 'The pond has changed.';
      refreshOfferings(w);
    });
    row.append(title, desc, cost, button, status); dialog.querySelector('.offering-choices').append(row);
    rows[key] = { cost, button, status };
  }
  dialog.addEventListener('keydown', e => e.stopPropagation());
  dialog.querySelector('.offering-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.offering-dismiss').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (offeringsDialog?.dialog === dialog) offeringsDialog = null; dialog.remove(); });
  document.body.append(dialog); offeringsDialog = { dialog, seed, inst, rows };
  refreshOfferings(w); dialog.showModal();
}
function refreshOfferings(w) {
  const available = offeringsAvailable(w), S = offeringState(w), boost = Math.max(0, S.sunUntil - (w.days || 0));
  for (const id of ['score-offerings', 'sky-offerings']) {
    const button = document.getElementById(id); if (!button) continue;
    button.hidden = !available;
    button.textContent = boost > 0 ? `Offerings · sun ×2 · anger ${Math.round(S.anger)}` : `Offerings · void anger ${Math.round(S.anger)}`;
  }
  const U = offeringsDialog; if (!U) return;
  if (w.seed !== U.seed || w.inst !== U.inst || !available) { U.dialog.close(); return; }
  const d = U.dialog, fmt = v => Math.floor(v || 0).toLocaleString();
  d.querySelector('.offering-wallet').textContent = `${fmt(w.game.pearls)} pearls · ${fmt(S.sacrificed)} offered in total`;
  d.querySelector('.offering-anger b').textContent = `${S.anger.toFixed(1)} / 100`;
  d.querySelector('meter').value = S.anger;
  d.querySelector('.offering-consequence').textContent = `Investment income −${(35 * S.anger / 100).toFixed(1)}%. Water tension +${(.06 * S.anger / 100).toFixed(3)} at the surface, up to +${(.30 * S.anger / 100).toFixed(3)} in the deep. Tense water can lower comfort, breeding and a creature’s willingness to stay.`;
  d.querySelector('.offering-active').textContent = boost > 0 ? `Sun hastened · ${boost.toFixed(2)} pond days left. Pause still pauses everything.` : 'The sun keeps its ordinary pace.';
  for (const [key, R] of Object.entries(OFFERINGS)) {
    const Q = offeringQuote(w, key), row = U.rows[key];
    row.cost.textContent = `${R.share * 100}% of banked pearls, rounded up · minimum ${fmt(R.min)}`;
    row.button.textContent = `Offer ${fmt(Q.cost)} pearls · ${fmt(Q.left)} left`;
    row.button.setAttribute('aria-label', `${R.name}: ${row.button.textContent}`);
    row.button.disabled = !!Q.reason;
    row.status.textContent = Q.reason || `Void anger → ${Q.anger.toFixed(1)} / 100${key === 'deep' ? ` · +${Q.depth.toFixed(3)} erosion` : ''}`;
  }
}
function initOfferings() {
  for (const id of ['score-offerings', 'sky-offerings']) document.getElementById(id).addEventListener('click', () => openOfferings(world));
}
