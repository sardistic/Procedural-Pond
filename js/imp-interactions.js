'use strict';
// The forest objects have one concrete action each. Durable food/cooldowns live
// in the game; brief light, motion and trails live only in the current scene.
function cleanImpInteractions(raw = {}) {
  const valid = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
  return { callDay: valid(raw?.callDay, 1e9) ? raw.callDay : -1, bowl: valid(raw?.bowl, 2097151) ? raw.bowl : -1, trust: valid(raw?.trust,20) ? raw.trust : 0 };
}
const impInteractions = w => cleanImpInteractions(w.game?.imps?.interact);
const wildBowlReady = (w, s) => s.kind === 'impbowl' && impInteractions(w).bowl === s.seed;
const wildPulse = (w, s) => s.wildPulse && s.wildPulse.until > w.t ? s.wildPulse : null;
const wildLanternSafe = (w, x, y) => (w.structures || []).some(s => s.kind === 'wickpost' && wildPulse(w, s) && Math.hypot(s.x - x, s.y - y) < 60);
const wildLightBoost = (w, s) => s.kind === 'wickpost' && wildPulse(w, s) ? 1.8 : 1;
const WILD_SIGNAL_M = mat('#4c2d0b','#9d632b','#e9b969','#fff1c5');
let WILD_GLOW_ID = 0;
function wildGlowId() {
  if (!WILD_GLOW_ID) { WILD_GLOW_ID = newId(hexToInt('#4c2d0b')); EMISSIVE[WILD_GLOW_ID] = 2; }
  return WILD_GLOW_ID;
}
function wildObjectQuote(w, s) {
  const filled = wildBowlReady(w, s), active = !!IMPS.out, ready = impInteractions(w).callDay < Math.floor(w.days);
  let label = s.kind === 'impchimes' ? 'Call two visitors · free' : s.kind === 'impbowl' ? filled ? 'Invite visitors · already filled' : 'Fill & invite · 4 essence' : 'Light a path · free';
  let reason = '';
  if (w.observe) reason = 'You are visiting. Only the owner can use this object.';
  else if (!w.structures.includes(s)) reason = 'This object is no longer here.';
  else if (!w.game?.impTrade) reason = 'Meet the forest visitors first.';
  else if (s.kind === 'wickpost') { if (wildPulse(w, s)) reason = `Path lit · ${Math.ceil(s.wildPulse.until - w.t)} pond seconds left.`; }
  else if (active) reason = IMPS.out.invited ? 'Visitors are on their way or dancing. Watch the glowing trail.' : 'Visitors are already out. Let them finish their visit.';
  else if (!HINTER.ready || HINTER.shown < HZ_SCRUB + 14 || !HINTER.gaps.some(p => { const d = hinterToLocal(HINTER.geo.s,...p)[0]; return d < HZ_SCRUB + 60 && d < HINTER.shown - 4; })) reason = 'The forest is still coming into view.';
  else if (!ready && !(s.kind === 'impbowl' && filled)) reason = `Next invitation in ${(1 - ((w.days % 1 + 1) % 1)).toFixed(2)} pond days.`;
  else if (s.kind === 'impbowl' && !filled && w.game.essence < 4) reason = 'Needs 4 essence. Nothing has been spent.';
  return { label, reason, filled };
}
function useWildObject(w, s) {
  if (!Object.hasOwn(WILD_OBJECTS, s.kind)) return false;
  const Q = wildObjectQuote(w, s); if (Q.reason) return false;
  if (s.kind === 'wickpost') {
    wildObjectSignal(w, s, 'path', 20);
    showTicker('A firefly path opens. Imps within 60 pixels of this lantern will not flee from your pointer for 20 pond seconds.');
    return true;
  }
  const target = s.kind === 'impbowl' ? s : w.structures.find(q => wildBowlReady(w, q)) || w.structures.find(q => q.kind === 'tribute' && !q.anim) || s;
  const S = impState(w), I = S.interact = impInteractions(w);
  // Starting the outing can fail if its forest geometry was replaced. Charge only
  // after a real route exists, and retain filled food until a gift is delivered.
  if (!startOuting(w, S, target)) return false;
  if (s.kind === 'impbowl' && !Q.filled) {
    if (!spendEssence(w, 4)) { IMPS.out = null; return false; }
    I.bowl = s.seed;
  }
  I.callDay = Math.floor(w.days); w.gameDirty = true;
  wildObjectSignal(w, s, 'call', 40);
  if (target !== s) wildObjectSignal(w, target, 'food', 8);
  showTicker(target.kind === 'impbowl' ? 'Two visitors follow the lights to the filled bowl. The 4 essence stays there until they finish their dance and leave a gift.' : target.kind === 'tribute' ? 'Two visitors are following the lights to your tribute.' : 'Two visitors are following the chimes. They will dance here; a filled bowl earns a gift.');
  return true;
}
function wildObjectSignal(w, s, kind, duration = 6) {
  s.wildPulse = { since: w.t, until: w.t + duration, kind };
  if (typeof SFX !== 'undefined') SFX.tone(kind === 'gift' ? [1, 3, 5] : [0, 2, 4], { level: .45, dur: .35 });
  if (w.effects.length < 220) w.effects.push(new WildSignal(w, s, duration));
  if (HINTER.ready) { HINTER.spT = 0; hinterSprites(w); }
}
class WildSignal {
  constructor(w, s, duration) { this.s = s; this.until = w.t + duration; this.t = 0; this.tu = hinterWorldToLocal(w, s.x, s.y)[1]; this.door = coastXY(w, 1, this.tu); }
  update(dt, w) { this.t += dt; return w.t < this.until && w.structures.includes(this.s); }
  draw(r) {
    const s = this.s, a = r.alpha, shadows = r.castShadows, id = wildGlowId();
    r.castShadows = false;
    try {
      for (let i = 0; i < 20; i++) {
        const k = (i / 20 + this.t * .12) % 1, x = lerp(s.x, this.door[0], k), y = lerp(s.y, this.door[1], k);
        r.alpha = .22 + .5 * Math.sin(k * PI) ** 2;
        r.dot(x + Math.sin(k * 12 + this.t) * 1.3, y, 2 + Math.sin(k * 9 + this.t * 2), WILD_SIGNAL_M, id);
      }
      for (let i = 0; i < 6; i++) {
        const phase = (this.t * .6 + i / 6) % 1, ang = i * 2.4 + this.t * .7;
        r.alpha = (1 - phase) * .7;
        r.dot(s.x + Math.cos(ang) * (2 + phase * 6), s.y + Math.sin(ang) * (2 + phase * 5), 3 + phase * 11, WILD_SIGNAL_M, id);
      }
    } finally { r.alpha = a; r.castShadows = shadows; }
  }
}
function drawImpTrail(w, dot, css) {
  if (!HINTER.geo) return;
  for (const s of w.structures || []) {
    if (!wildPulse(w, s)) continue;
    const origin = IMPS.out?.invited ? IMPS.out.imps[0] : null;
    const u = hinterWorldToLocal(w, s.x, s.y)[1], span = Math.min(HINTER.shown - 8, origin ? origin.dd0 : HZ_SCRUB + 30);
    for (let i = 0; i < 36; i++) {
      const d = (((i + hash2(i,3,s.seed)*.65) / 36 + (w.t - s.wildPulse.since) * .08) % 1) * span;
      const p = hinterToPx(HINTER.geo.s, d, (origin ? lerp(u,origin.u0,d/span) : u) + Math.sin(d * .06 + w.t) * 3 + (hash2(i,4,s.seed)-.5)*8);
      dot(p[0], p[1], css(hexToInt(Math.sin(w.t*2+i)>0?'#e9b969':'#9d632b'), true));
    }
  }
}
function renderWildObjectCard(w, s, box) {
  // Keep the action node alive during HUD refreshes and touch holds.
  if (box.wildObject !== s || !box.querySelector('[data-wild-action]')) {
    box.wildObject = s;
    box.replaceChildren();
    const head = document.createElement('header'); head.className = 'cr-head';
    const title = document.createElement('b'); title.textContent = WILD_OBJECTS[s.kind].label;
    const close = document.createElement('button'); close.type = 'button'; close.className = 'icon'; close.textContent = '×'; close.setAttribute('aria-label', 'Close'); close.onclick = hideObject;
    head.append(title, document.createElement('span'), close);
    const desc = document.createElement('p'); desc.className = 'cr-description'; desc.textContent = WILD_OBJECTS[s.kind].desc;
    const status = document.createElement('p'); status.className = 'note wild-status'; status.setAttribute('role', 'status');
    const action = document.createElement('button'); action.type = 'button'; action.className = 'wild-action'; action.dataset.wildAction = s.kind;
    const seed = w.seed, inst = w.inst;
    action.onclick = () => { if (w.seed !== seed || w.inst !== inst) { hideObject(); return; } useWildObject(w, s); refreshWildObjectCard(w); };
    const result = document.createElement('p'); result.className = 'note wild-action-note';
    box.append(head, desc, status, action, result);
  }
  refreshWildObjectCard(w);
}
function refreshWildObjectCard(w) {
  const box = document.getElementById('object'), s = box?.wildObject;
  if (!s || box.hidden || objUi.o !== s || !box.querySelector('[data-wild-action]')) return;
  const Q = wildObjectQuote(w, s), action = box.querySelector('[data-wild-action]');
  action.textContent = Q.label; action.disabled = !!Q.reason;
  const visitors = IMPS.out?.imps.length || 0;
  const dancing = IMPS.out?.phase === 'pond' && w.creatures.some(c => c.species === 'imp' && c.act === 'dance');
  const activity = visitors ? `${visitors} visitors ${dancing ? 'dancing' : IMPS.out.phase === 'up' ? 'returning to the forest' : 'following the trail'}` : 'no visitors out';
  box.querySelector('.wild-status').textContent = s.kind === 'impbowl' ? `${Q.filled ? '● Filled · 4 essence reserved' : '○ Empty'} · ${activity}` : s.kind === 'wickpost' ? wildPulse(w, s) ? '● Path lit · nearby visitors feel safe' : '● Wick burning · click below for a brighter path' : `${visitors ? '●' : '○'} ${activity} · forest trust ${w.game?.wilds?.trust??impInteractions(w).trust}/20`;
  box.querySelector('.wild-action-note').textContent = Q.reason || (s.kind === 'wickpost' ? 'A visible firefly trail and pointer protection for 20 pond seconds. No currency cost.' : 'One invitation per pond day. Invited imps stay when you look at them.');
}
