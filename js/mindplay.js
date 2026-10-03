'use strict';
// Awakened minds in the life of the pond: the urge to fight, fights between them and the
// others, a learning layer that turns what happened into how they sense, and the brain at
// work drawn on the card and in sparks over the head.
//
// All of it is deterministic game code. The drive comes from genes, traits, hunting upgrades,
// corruption and rage. Learning is a bounded reward-modulated gain on the channels the brains
// already sense (food, prey and rivals, danger, its kind, cover, strangers), plus a feeling
// about each species it has fought. Controllers still only see sensory inputs and options.

const MIND_FIGHT = { cooldown: 1.4, strikesPerDay: 160, killsPerDay: 6, lock: 6, threshold: 0.25 };
const MIND_LEARN_KEYS = ['food', 'prey', 'threat', 'same', 'cover', 'other'];
const MIND_LEARN_LABEL = { food: 'food', prey: 'prey and rivals', threat: 'danger', same: 'its kind', cover: 'cover', other: 'strangers' };
const MIND_REWARD = { fed: 0.25, kill: 0.6, win: 0.4, lose: -0.5, hurt: -0.2 };
const MIND_NOTE = { fed: 'Fed', kill: 'Killed', win: 'Beat', lose: 'Lost to', hurt: 'Hurt by' };
const MIND_SPECIES_RE = /^[a-zA-Z][a-zA-Z0-9 -]{0,39}$/;
const MINDPLAY = { clock: 0, drawClock: 0, canvas: null, panelFor: null };

// ---- the urge to fight -----------------------------------------------------------------------------
function mindFightDrive(w, c) {
  const L = c.life;
  if (!L || !L.genome) return { value: 0, parts: [] };
  const b = geneBuffs(c), lv = (k) => (typeof huntLv === 'function' ? huntLv(c, k) : 0), parts = [];
  const add = (label, n) => { if (Math.abs(n) >= 0.01) parts.push([label, n]); };
  add('awakened', 0.12);
  add('aggression', clamp(((b.aggression || 1) - 1) * 0.6, -0.15, 0.45));
  add('territory', clamp(((b.territory || 1) - 1) * 0.3, 0, 0.2));
  if (isPredator(c)) add('predator', 0.12);
  if (L.hunter) add('woken hunter', 0.15);
  add('hunting upgrades', Math.min(0.3, 0.015 * (lv('jaws') + lv('maw') + lv('burst') + lv('hunger') + lv('tenacity')) + 0.03 * (lv('devour') + lv('contagion'))));
  if (L.genome.eld) add('corruption', 0.12 + 0.4 * (L.corruption || 0));
  add('rage', clamp(((typeof rageOf === 'function' ? rageOf(w, c) : 1) - 1) * 0.5, 0, 0.5));
  if (typeof enraged === 'function' && enraged(w, c)) add('enraged', 0.2);
  add('stress', 0.12 * (1 - clamp(L.comfort ?? 0.5, 0, 1)));
  if (b.calming) add('calm', -clamp(b.calming * 0.5, 0, 0.3));
  const bias = L.mindLearn?.bias || 0;
  add(bias >= 0 ? 'fights won' : 'fights lost', bias);
  return { value: clamp(parts.reduce((n, [, v]) => n + v, 0), 0, 1), parts };
}

const mindWidth = (q) => (q.body ? (typeof widthOf === 'function' ? widthOf(q) : Math.max(...q.body.w)) : 0);
const mindMarked = (x) => !!x.life?.genome?.eld && eldStage(x.life) >= 1;
// May it pick a fight with this one? The same protection as the hunt (protected kinds, refuges),
// never the mythic or the changed (unless changed itself), nothing much bigger than itself.
function mindCanStrike(w, c, q) {
  if (!q || q === c || !q.life || !q.body || !c.body || !mindHere(q) || q.grabbed || q.ambient || c instanceof Watcher || !w.creatures.includes(q)) return false;
  if (typeof huntable === 'function' && !huntable(w, q)) return false;
  if (typeof DEEP !== 'undefined' && DEEP[q.species]?.mythic) return false;
  if (Math.abs((q.z || 0) - (c.z || 0)) > 14 || !mindWetRoute(w, c, q)) return false;
  if (mindMarked(q) && !mindMarked(c)) return false;
  const drive = mindFightDrive(w, c).value;
  if (drive < MIND_FIGHT.threshold || mindWidth(q) > mindWidth(c) * (1.1 + 0.4 * drive)) return false;
  // Its own kind only when another mind, enraged, a cannibal or marked.
  return q.species !== c.species || !!q.life.mind || !!c.life.genome.cannibal || !!c.life.genome.eld || (typeof enraged === 'function' && enraged(w, c));
}

// The rival it wants: other minds first, then what it has learned to beat, nearer and a fair size.
function mindRivalFor(w, c, neighbors) {
  const brain = c.mind, drive = mindFightDrive(w, c).value;
  if (drive < MIND_FIGHT.threshold) { if (brain) brain.rival = null; return null; }
  if (brain?.rival && brain.rivalUntil > w.t && neighbors.includes(brain.rival) && mindCanStrike(w, c, brain.rival)) return brain.rival;
  let best = null, bs = 0;
  for (const q of neighbors) {
    if (!mindCanStrike(w, c, q)) continue;
    // (What it has learned this kind is worth against what it costs: forage.js. A kind that proved bad is left alone.)
    const V = typeof forageValue === 'function' ? forageValue(w, c, q) : null;
    if (V && V.tries >= 2 && V.value < -0.05) continue;
    const size = mindWidth(q) / Math.max(0.5, mindWidth(c));
    const score = drive * (q.life.mind ? 1.6 : 1) * (1 + mindValence(c, q.species)) * (typeof huntWeight === 'function' ? huntWeight(w, q) : 1) *
      (size < 0.45 ? 1.3 : Math.max(0.2, 1.2 - Math.abs(size - 0.8))) / (1 + mindDistance(c, q) / 40) * (V ? clamp(0.6 + V.value, 0.1, 2) : 1);
    if (score > bs) { bs = score; best = q; }
  }
  if (brain) { brain.rival = best; brain.rivalUntil = best ? w.t + MIND_FIGHT.lock : 0; }
  return best;
}

// ---- fights ----------------------------------------------------------------------------------------
// One strike: a much smaller rival is simply caught; otherwise both are weighed (energy, vitality,
// rage, size, jaws and drive, the attacker a little ahead) and the loser bleeds. Deaths are capped a day.
function mindStrike(w, c, q) {
  const N = natureDay(w);
  if ((N.mindStrikes || 0) >= MIND_FIGHT.strikesPerDay) return null;
  N.mindStrikes = (N.mindStrikes || 0) + 1;
  c.mind.strikeAt = w.t;
  if (mindWidth(q) < mindWidth(c) * 0.45) { eat(w, c, q); return q.caught ? 'kill' : null; }
  const power = (x, first) => (0.25 + 0.7 * (x.life.hp ?? 1) + 0.3 * x.life.energy) * (typeof growPower === 'function' ? growPower(x.life.grown) : 1) * (geneBuffs(x).vitality || 1) * (typeof rageOf === 'function' ? rageOf(w, x) : 1) *
    Math.max(0.5, mindWidth(x)) * (1 + 0.05 * (typeof huntLv === 'function' ? huntLv(x, 'jaws') : 0)) *
    (1 + 0.5 * mindFightDrive(w, x).value) * (first ? 1.15 * (typeof forageStrikeBonus === 'function' ? forageStrikeBonus(w, x, q) : 1) : 1) * rand(0.6, 1.4);
  if (typeof forageCallKin === 'function' && (c.mind.plan?.action === 'gang' || MIND_MODES[mindController(c)]?.motor)) forageCallKin(w, c, q);
  const won = power(c, true) >= power(q, false), winner = won ? c : q, loser = won ? q : c;
  const canKill = (N.mindKills || 0) < MIND_FIGHT.killsPerDay;
  const hpBefore = loser.life.hp ?? 1;
  const killed = hurt(w, loser, 0.14 + 0.1 * clamp(mindWidth(winner) / Math.max(0.5, mindWidth(loser)), 0, 1.5), { why: `killed in a fight with ${winner.life.name}`, canKill });
  loser.life.comfort = Math.max(0, (loser.life.comfort ?? 0.5) - 0.2);
  addBlood(w, loser.x, loser.y, loser.z || 6, 0.35);
  addRipple(w, loser.x, loser.y, 0.8, true);
  startle(w, loser, winner.x, winner.y, 1.2);
  if (typeof animStrike === 'function') animStrike(w, winner, loser);
  if (typeof glyph === 'function') glyph(w, winner, 'bang');
  if (killed) {
    N.mindKills = (N.mindKills || 0) + 1;
    if (typeof onKill === 'function') onKill(w, winner, loser);
  }
  // The marked feed on it: a little corruption for them and the pond.
  if (winner.life.genome.eld) {
    winner.life.corruption = Math.min(1, (winner.life.corruption || 0) + 0.02);
    if (typeof gainCorruption === 'function') gainCorruption(w, killed ? 3 : 0.5, winner, { quiet: !killed });
  }
  mindReward(w, winner, killed ? 'kill' : 'win', loser);
  if (!killed) mindReward(w, loser, 'lose', winner);
  // (What the fight cost the loser, learned of the winner's kind; a win without a meal is worth a little.)
  if (typeof forageLearn === 'function') {
    if (!killed) forageLearn(loser, winner.species, 0, Math.max(0, hpBefore - (loser.life.hp ?? 1)));
    if (!killed) forageLearn(winner, loser.species, 0.08, 0);
  }
  // A beaten mind remembers who did it.
  if (!killed && loser.life.mind && loser.mind) { loser.mind.rival = winner; loser.mind.rivalUntil = w.t + MIND_FIGHT.lock + 2; }
  logEvent(w, `${who(winner)} ${killed ? 'killed' : 'beat'} ${who(loser)} in a fight`, winner, {
    cat: 'hunt', pri: killed ? 2 : 1, key: `mindfight:${winner.id}`, data: 1, merge: (e) => `${who(winner)} has won ${e.n} fights`,
  });
  return killed ? 'kill' : won ? 'win' : 'lose';
}

// Planned minds strike only once they chose to fight; motor-driven minds when their own steering
// has brought them face to face with the rival.
function mindTryStrike(w, c) {
  const brain = c.mind, motor = !!MIND_MODES[mindController(c)]?.motor, q = (!motor && brain.plan?.rival) || brain.rival;
  if (!q || w.t - (brain.strikeAt ?? -99) < MIND_FIGHT.cooldown) return;
  if (motor ? !brain.motor : !['fight', 'stalk', 'gang'].includes(brain.plan?.action)) return;
  const reach = ((c.body.w[0] || 1) + (q.body.w[0] || 1) + 2.5) * (typeof huntReach === 'function' ? huntReach(c) : 1);
  if (mindDistance(c, q) > reach || Math.cos(Math.atan2(q.y - c.y, q.x - c.x) - c.heading) < 0.3 || !mindCanStrike(w, c, q)) return;
  mindStrike(w, c, q);
}

// ---- learning --------------------------------------------------------------------------------------
function mindLearn(c) {
  const L = c.life;
  if (!L.mindLearn) L.mindLearn = { g: {}, sp: {}, bias: 0, wins: 0, losses: 0, notes: [] };
  return L.mindLearn;
}
const mindLearnedGain = (c, k) => clamp(c.life?.mindLearn?.g?.[k] ?? 1, 0.5, 2);
const mindValence = (c, species) => clamp(c.life?.mindLearn?.sp?.[species] ?? 0, -1, 1);
// What its experience does to an option's weight (for the choosing minds).
function mindLearnedOption(c, o) {
  const k = { forage: 'food', hunt: 'prey', fight: 'prey', stalk: 'prey', gang: 'prey', flee: 'threat', avoid: 'threat', ink: 'threat', shoal: 'same', shelter: 'cover', ambush: 'cover', investigate: 'other' }[o.action];
  const target = o.action !== 'shoal' && (o.rival || o.prey || o.companion);
  // (And for a meal or a fight, what it has learned that kind is worth against what it costs: forage.js.)
  const V = target && (o.rival || o.prey) && typeof forageValue === 'function' && target.life ? forageValue(world, c, target).value : 0;
  return (k ? mindLearnedGain(c, k) : 1) * (target ? 1 + 0.5 * mindValence(c, target.species) : 1) * clamp(1 + V, 0.2, 2);
}
// The kinds it has lost to look like danger now.
function mindLearnedFear(c, encounter) {
  let worst = null, ws = 0.35;
  for (const q of encounter.neighbors || []) {
    const v = -mindValence(c, q.species);
    if (v > ws && q !== encounter.rival) { ws = v; worst = q; }
  }
  return worst ? { creature: worst, strength: clamp(ws, 0, 1) } : null;
}
// Eligibility traces: how much it has lately been heading toward each kind of thing (danger: how
// near it was), fading over about four seconds.
function mindTrace(c, dt) {
  const brain = c.mind, ring = brain?.ring;
  if (!ring) return;
  const e = brain.trace || (brain.trace = Object.fromEntries(MIND_LEARN_KEYS.map((k) => [k, 0])));
  const speed = clamp((c.speed || 0) / (c.maxSpeed || 1), 0, 1), k = Math.exp(-dt / 4);
  for (const key of MIND_LEARN_KEYS) {
    let v = 0;
    for (let i = 0; i < 16; i++) v += key === 'threat' ? ring.sectors[i][key] / 4 : ring.sectors[i][key] * Math.cos(i * Math.PI / 8) * speed;
    e[key] = e[key] * k + (1 - k) * clamp(v, -1, 1);
  }
}
// A reward (or a punishment) strengthens whatever it was heading for, and sharpens danger.
function mindReward(w, c, kind, other = null) {
  if (!c.life?.mind || w.observe || MIND_REWARD[kind] === undefined) return;
  const M = mindLearn(c), R = MIND_REWARD[kind], e = c.mind?.trace || {}, rate = 0.35;
  for (const key of MIND_LEARN_KEYS) {
    const trace = e[key] || 0, d = key === 'threat' ? -rate * R * Math.abs(trace) : rate * R * trace;
    if (Math.abs(d) > 1e-4) M.g[key] = clamp((M.g[key] ?? 1) + d, 0.5, 2);
  }
  if (kind === 'win' || kind === 'kill') M.g.prey = clamp((M.g.prey ?? 1) + 0.03, 0.5, 2);
  const species = other?.species && MIND_SPECIES_RE.test(other.species) ? other.species : null;
  if (species && kind !== 'fed') {
    M.sp[species] = clamp((M.sp[species] || 0) + { kill: 0.2, win: 0.12, lose: -0.22, hurt: -0.08 }[kind], -1, 1);
    const keys = Object.keys(M.sp);
    if (keys.length > 8) delete M.sp[keys.reduce((a, b) => (Math.abs(M.sp[a]) <= Math.abs(M.sp[b]) ? a : b))];
  }
  if (kind === 'win' || kind === 'kill') { M.bias = clamp((M.bias || 0) + (kind === 'kill' ? 0.02 : 0.03), -0.3, 0.3); M.wins = (M.wins || 0) + 1; }
  if (kind === 'lose') { M.bias = clamp((M.bias || 0) - 0.05, -0.3, 0.3); M.losses = (M.losses || 0) + 1; }
  const last = M.notes[M.notes.length - 1];
  if (kind !== 'fed' || !last || last.kind !== 'fed' || Date.now() - last.at > 60000) {
    M.notes.push({ at: Date.now(), kind, species: kind === 'fed' ? null : species });
    if (M.notes.length > 6) M.notes.shift();
  }
  if (typeof mindRemember === 'function') mindRemember(c, kind === 'win' || kind === 'kill' ? 'won_fight' : kind === 'lose' ? 'lost_fight' : kind === 'fed' ? 'fed' : 'threat', species || mindSpecies(c));
  if (c.mind) c.mind.flash = { kind, at: performance.now() };
  mindSparkBurst(w, c, kind === 'lose' || kind === 'hurt' ? 'lose' : kind === 'fed' ? 'feed' : 'learn');
  if (kind !== 'fed' && typeof floatAward === 'function') floatAward(c.x, c.y - 6, kind === 'lose' || kind === 'hurt' ? 'warier' : 'bolder', kind === 'lose' || kind === 'hurt' ? 'spend' : 'gain');
}
// For saves: only bounded numbers and checked species names.
function mindCleanLearn(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r3 = (v) => Math.round(v * 1000) / 1000, g = {}, sp = {};
  for (const k of MIND_LEARN_KEYS) if (Number.isFinite(raw.g?.[k])) g[k] = r3(clamp(raw.g[k], 0.5, 2));
  for (const [k, v] of Object.entries(raw.sp && typeof raw.sp === 'object' ? raw.sp : {}).slice(0, 8)) if (MIND_SPECIES_RE.test(k) && Number.isFinite(v)) sp[k] = r3(clamp(v, -1, 1));
  const count = (v) => (Number.isFinite(v) ? Math.floor(clamp(v, 0, 1e6)) : 0);
  const notes = (Array.isArray(raw.notes) ? raw.notes : []).slice(-6).filter((n) => n && Number.isFinite(n.at) && n.at >= 0 && n.at < 8.64e15 &&
    Object.hasOwn(MIND_REWARD, n.kind) && (n.species == null || (typeof n.species === 'string' && MIND_SPECIES_RE.test(n.species)))).map((n) => ({ at: n.at, kind: n.kind, species: n.species || null }));
  return { g, sp, bias: Number.isFinite(raw.bias) ? r3(clamp(raw.bias, -0.3, 0.3)) : 0, wins: count(raw.wins), losses: count(raw.losses), notes,
    prey: typeof cleanForageMemory === 'function' ? cleanForageMemory(raw.prey) : {} };
}

// ---- the brain at work, over the head ----------------------------------------------------------------
const MIND_SPARK_COL = { fight: '#ff4a5a', feed: '#7dff8a', flee: '#ffe066', calm: '#7ad7ff', learn: '#e07aff', lose: '#8f9cff' };
const MIND_MODE_OF = { fight: 'fight', hunt: 'fight', ambush: 'fight', forage: 'feed', flee: 'flee', avoid: 'flee', ink: 'flee' };
let MIND_SPARK_ID = 0;
const MIND_SPARK_MAT = {};
class MindSpark {
  constructor(x, y, z, col) { this.x = x; this.y = y; this.z = z; this.col = col; this.t = 0; this.vx = rand(-4, 4); this.vy = rand(-4, 4); this.life = rand(0.35, 0.8); }
  update(dt) { this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt; this.z += dt * 6; return this.t < this.life; }
  draw(r) {
    if (!MIND_SPARK_ID) { MIND_SPARK_ID = newId(hexToInt('#0a0a0a')); EMISSIVE[MIND_SPARK_ID] = 1; }
    if (this.t > this.life * 0.6 && ((this.t * 24) | 0) % 2) return;
    r.dot(this.x, this.y, this.z, MIND_SPARK_MAT[this.col] || (MIND_SPARK_MAT[this.col] = solid(this.col)), MIND_SPARK_ID);
  }
}
const mindHead = (c) => (c.body?.x ? [c.body.x[0], c.body.y[0]] : [c.x, c.y]);
function mindSpark(w, c, mode) {
  if (!w.effects || w.effects.length >= 200) return;
  const [x, y] = mindHead(c);
  w.effects.push(new MindSpark(x + rand(-1.5, 1.5), y + rand(-1.5, 1.5), (c.z || 0) + 6, MIND_SPARK_COL[mode] || MIND_SPARK_COL.calm));
}
function mindSparkBurst(w, c, mode) { for (let i = 0; i < 6; i++) mindSpark(w, c, mode); }
// How hard its brain is working right now (0 to 1), and on what.
function mindActivity(c) {
  const b = c.mind || {}, mode = MIND_MODE_OF[b.action] || 'calm';
  const a = b.activity;
  let level = b.plan || b.motor ? 0.35 : 0.12;
  if (a && Array.isArray(a['spn-forward'])) level = clamp(3 * Object.values(a).flat().reduce((n, v) => n + v, 0) / 10, 0, 1);
  else if (a && Number.isFinite(a.forward)) level = clamp(Object.values(a).reduce((n, v) => n + v, 0) / 250, 0, 1);
  return { level, mode };
}

// ---- steering the bodies that don't ask ------------------------------------------------------------
// Frogs, jellies, ducks, dragonflies, starfish and the like wander toward a target of their own; an
// awakened one's target becomes the place its mind chose, so it still hops, pulses, paddles or darts.
function mindSteer(w, c) {
  if (mindNative(c) || !c.life?.mind || c.grabbed || w.observe) return;
  const intent = mindIntent(w, c);
  if (!intent || !Number.isFinite(intent.x) || !Number.isFinite(intent.y)) return;
  const still = intent.speed === 0;
  c.tx = still ? c.x : intent.x; c.ty = still ? c.y : intent.y;
  c.timer = Math.max(c.timer || 0, still ? 0.5 : 1.5);
  if (!still && (c.mode === 'pause' || c.mode === 'hover')) c.mode = c.mode === 'hover' ? 'dart' : 'walk';
  if (!still && 'targetPad' in c) c.targetPad = null;
}

// ---- every frame -------------------------------------------------------------------------------------
function mindPlayTick(w, dt) {
  if (!w.creatures || w.observe || typeof mindControlled !== 'function') return;
  const minds = mindControlled(w);
  MINDPLAY.clock -= dt;
  const sense = MINDPLAY.clock <= 0 && !w.paused;
  if (sense) MINDPLAY.clock = 0.25;
  for (const c of minds) {
    const brain = c.mind || (c.mind = { status: 'Watching for an encounter', token: 0 });
    if (sense) {
      // What it senses (for learning and the card), whatever drives it.
      const e = mindEncounter(w, c);
      brain.ring = mindFishInputs(w, c, e);
      brain.options = e.state.options;
      brain.drive = mindFightDrive(w, c);
      mindTrace(c, 0.25);
      const m = brain.motor?.value, hist = brain.hist || (brain.hist = []);
      hist.push({ drive: brain.drive.value, speed: clamp((c.speed || 0) / (c.maxSpeed || 1), 0, 1), turn: m ? clamp(m.right - m.left, -1, 1) : 0 });
      if (hist.length > 64) hist.shift();
      const th = c.threat || c.dread;
      if (th && mindDistance(c, th) < 12 && w.t - (brain.hurtAt ?? -99) > 2) { brain.hurtAt = w.t; mindReward(w, c, 'hurt', th); }
    }
    if (!w.paused) {
      if (c.body) mindTryStrike(w, c);
      // Fish integrate their own motor meals; other bodies driven by Fish Brain feed here.
      if (!(c instanceof Fish) && brain.motor?.value?.feeding && MIND_MODES[mindController(c)]?.motor && mindIntent(w, c)) mindMotorMeal(w, c);
      const { level, mode } = mindActivity(c);
      brain.sparkT = (brain.sparkT || 0) + dt * (0.5 + 6 * level);
      if (brain.sparkT >= 1) { brain.sparkT = 0; mindSpark(w, c, mode); }
    }
  }
  MINDPLAY.drawClock -= dt;
  if (MINDPLAY.drawClock <= 0 && MINDPLAY.canvas?.isConnected && MINDPLAY.panelFor?.mind) { MINDPLAY.drawClock = 0.1; mindDrawBrain(MINDPLAY.canvas, MINDPLAY.panelFor); }
}

// ---- the brain on its card ---------------------------------------------------------------------------
const MIND_RING = [['prey', '#ff4a5a'], ['threat', '#ff9a3a'], ['food', '#7dff8a'], ['same', '#5aa8ff'], ['cover', '#3ad6b8'], ['other', '#a8b8c0']];
const MIND_HEAT = (v) => { const k = clamp(v, 0, 1); return `rgb(${Math.round(16 + 239 * k)},${Math.round(32 + 192 * k * k)},${Math.round(48 + 90 * k * k * k)})`; };
function mindDrawBrain(cv, c) {
  const g = cv.getContext('2d'), b = c.mind || {}, W = cv.width, H = cv.height;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#07141c'; g.fillRect(0, 0, W, H);
  g.font = '8px monospace'; g.textBaseline = 'top';
  // The senses: sixteen directions around it, forward up, coloured by the strongest channel.
  const cx = 36, cy = 46, r0 = 12, r1 = 32, flash = b.flash && performance.now() - b.flash.at < 600;
  for (let i = 0; i < 16; i++) {
    const s = b.ring?.sectors?.[i] || {};
    let best = null, bv = 0.02;
    for (const [k, col] of MIND_RING) if ((s[k] || 0) > bv) { bv = s[k]; best = col; }
    const a0 = -Math.PI / 2 + (i - 0.45) * Math.PI / 8, a1 = -Math.PI / 2 + (i + 0.45) * Math.PI / 8;
    g.beginPath(); g.arc(cx, cy, r1, a0, a1); g.arc(cx, cy, r0, a1, a0, true); g.closePath();
    g.globalAlpha = best ? 0.25 + 0.75 * clamp(bv, 0, 1) : 1;
    g.fillStyle = best || '#10242e'; g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = flash ? MIND_SPARK_COL[b.flash.kind === 'lose' || b.flash.kind === 'hurt' ? 'lose' : 'learn'] : '#cfe8f0';
  g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx - 4, cy + 5); g.lineTo(cx + 4, cy + 5); g.closePath(); g.fill();
  g.fillStyle = '#6f8f9a'; g.fillText('senses', cx - 15, 86);
  // The neurons: Fish1 populations (left and right), Fly Brain readouts, or the choosing mind's options.
  const x0 = 78, a = b.activity;
  if (a && Array.isArray(a['spn-forward'])) {
    const rows = [['input-layer', 'in'], ['class-I', 'I'], ['class-II', 'II'], ['spn-turning', 'turn'], ['spn-forward', 'fwd']];
    rows.forEach(([k, label], i) => {
      const y = 6 + i * 16;
      g.fillStyle = '#6f8f9a'; g.fillText(label, x0, y + 3);
      for (let s = 0; s < 2; s++) { g.fillStyle = MIND_HEAT(Math.sqrt(a[k][s] * 8)); g.fillRect(x0 + 26 + s * 22, y, 18, 12); }
    });
    g.fillStyle = '#6f8f9a'; g.fillText('L  R', x0 + 30, 86);
  } else if (a && Number.isFinite(a.forward)) {
    FLY_ACTIVITY.filter((k) => a[k] !== undefined).forEach((k, i) => {
      const y = 4 + i * 11, v = clamp(Math.log1p(a[k]) / Math.log1p(300), 0, 1);
      g.fillStyle = '#6f8f9a'; g.fillText(k.slice(0, 5), x0, y + 1);
      g.fillStyle = '#10242e'; g.fillRect(x0 + 30, y, 40, 8);
      g.fillStyle = MIND_HEAT(v); g.fillRect(x0 + 30, y, Math.round(40 * v), 8);
    });
  } else {
    (b.options || []).slice(0, 8).forEach((o, i) => {
      const y = 4 + i * 10, v = clamp(o.weight / 2, 0, 1), on = b.plan?.action === o.action || b.goal?.action === o.action;
      g.fillStyle = on ? '#ffe08a' : '#6f8f9a'; g.fillText(o.action.slice(0, 6), x0, y);
      g.fillStyle = '#10242e'; g.fillRect(x0 + 34, y + 1, 36, 7);
      g.fillStyle = on ? '#ffe08a' : MIND_HEAT(v * 0.8); g.fillRect(x0 + 34, y + 1, Math.round(36 * v), 7);
    });
  }
  // Over time: the fight drive (red), speed (blue) and turning (violet, about the middle line).
  const tx = 160, tw = W - tx - 4, hist = b.hist || [];
  g.fillStyle = '#0b1e28'; g.fillRect(tx, 4, tw, 78);
  g.fillStyle = '#16303c'; g.fillRect(tx, 43, tw, 1);
  const plot = (key, col, mid) => {
    g.strokeStyle = col; g.lineWidth = 1; g.beginPath();
    hist.forEach((h, i) => { const x = tx + tw - (hist.length - 1 - i) * (tw / 63), y = mid ? 43 - h[key] * 36 : 80 - h[key] * 74; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  };
  plot('drive', '#ff4a5a'); plot('speed', '#7ad7ff'); plot('turn', '#c08aff', true);
  g.fillStyle = '#6f8f9a'; g.fillText('drive · speed · turn', tx, 86);
}
function mindBrainPanel(c) {
  let cv = MINDPLAY.canvas;
  if (!cv) {
    cv = MINDPLAY.canvas = document.createElement('canvas');
    cv.width = 260; cv.height = 96; cv.className = 'mind-brain'; cv.setAttribute('role', 'img');
  }
  MINDPLAY.panelFor = c;
  const d = c.mind?.drive;
  cv.setAttribute('aria-label', `Live brain activity${d ? `, fight drive ${Math.round(d.value * 100)}%` : ''}`);
  mindDrawBrain(cv, c);
  return cv;
}
// The card's mind section, in two parts: what shows at once (the live brain, a colour key, its fight drive
// with the reasons in a tooltip, its rival) and what folds away (what it has learned, its experience).
function mindPlayCard(w, c) {
  const L = c.life, box = el('div', 'mind-play');
  box.setAttribute('aria-label', 'Brain activity');
  box.append(mindBrainPanel(c));
  const key = el('div', 'mind-key');
  for (const [label, col] of [['rivals and prey', '#ff4a5a'], ['danger', '#ff9a3a'], ['food', '#7dff8a'], ['its kind', '#5aa8ff'], ['cover', '#3ad6b8']]) {
    const sw = el('span'); sw.style.setProperty('--sw', col); sw.append(document.createTextNode(label)); key.append(sw);
  }
  box.append(key);
  const d = c.mind?.drive || mindFightDrive(w, c), pct = (n) => `${n > 0 ? '+' : ''}${Math.round(n * 100)}`;
  const fight = el('p', 'note', `Fight drive ${Math.round(d.value * 100)}%${d.value < MIND_FIGHT.threshold ? ', too calm to pick fights' : ''}`);
  fight.title = ['What drives it to fight:', ...d.parts.map(([k, v]) => `${k} ${pct(v)}`)].join('\n');
  const rival = c.mind?.rival;
  if (rival && mindHere(rival)) fight.append(document.createTextNode(` · rival: ${rival.life?.name || ''} the ${SINGULAR[rival.species] || rival.species}${rival.life?.mind ? ' (a mind)' : ''}`));
  if (typeof forageTier === 'function') fight.append(document.createTextNode(` · ${FORAGE_TIERS[forageTier(c)].name}`));
  box.append(fight);
  return box;
}
// What it has learned, for a fold of its own.
function mindLearnedParts(w, c) {
  const L = c.life, M = L.mindLearn, out = [];
  if (typeof forageTier === 'function') {
    const t = forageTier(c), n = forageHunts(c), next = FORAGE_TIERS[t + 1];
    out.push(el('p', 'note', `${capFirst(FORAGE_TIERS[t].name)} after ${n} hunts and fights: ${FORAGE_TIERS[t].note}${next ? `. ${capFirst(next.name)} at ${next.hunts}.` : '.'}`));
  }
  if (!M) { out.push(el('p', 'note', 'Nothing learned yet: food, fights and danger will shape how it senses.')); return out; }
  const gains = MIND_LEARN_KEYS.filter((k) => Math.abs((M.g[k] ?? 1) - 1) >= 0.05).map((k) => `${MIND_LEARN_LABEL[k]} ×${(M.g[k]).toFixed(2)}`);
  out.push(el('p', 'note', `${M.wins || 0} fights won, ${M.losses || 0} lost${gains.length ? `. Weighs ${gains.join(', ')}` : ''}`));
  const known = Object.entries(M.prey || {}).sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([k, s]) => {
    const v = s.gain * (0.5 + clamp(1 - L.energy, 0, 1)) - s.harm, fe = M.sp[k] || 0;
    return `${(SINGULAR[k] || k).toLowerCase()}: worth ${s.gain.toFixed(2)}, costs ${s.harm.toFixed(2)} (${s.n})${s.n >= 2 && v < -0.05 ? ', avoids' : fe > 0.1 ? ', easy prey' : fe < -0.1 ? ', danger' : ''}`;
  });
  if (known.length) { const ul = el('ul', 'mind-known'); for (const k of known) ul.append(el('li', null, k)); out.push(ul); }
  if (M.notes.length) {
    const list = el('ol', 'mind-lessons');
    for (const n of M.notes.slice(-3).reverse()) {
      const row = el('li'), time = el('time', null, new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      time.dateTime = new Date(n.at).toISOString();
      row.append(time, el('span', null, `${MIND_NOTE[n.kind]}${n.species ? ` a ${(SINGULAR[n.species] || n.species).toLowerCase()}` : ''}${n.kind === 'lose' || n.kind === 'hurt' ? ' · warier' : n.kind === 'fed' ? '' : ' · bolder'}`));
      list.append(row);
    }
    out.push(list);
  }
  return out;
}
