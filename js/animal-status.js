'use strict';
// Read-only presentation of existing simulation state. Indices are not probabilities.
const ANIMAL_STATE_ICONS = {
  behavior: 'M2 6h3V4h6v2h2v4h-2v2H5v-2H2l-2 2V4zm8 1v2',
  comfort: 'M3 12V5h3V2h6v3h1v5h-3v3H5v2M5 11l5-6',
  tension: 'M2 2h3v2h2v2h2v2h2v2h3v3h-3v-3H9V9H7V7H5V5H2zm12 0h-3v2H9v2M6 10l-4 4',
  water: 'M8 1V3L3 8v4l2 2h6l2-2V8L8 3M5 10v2h2',
  vigor: 'M2 4h4l2 2 2-2h4v6l-6 5-6-5zm6 3v5M6 10h4',
  roam: 'M8 1v2M8 13v2M1 8h2M13 8h2M5 4h6l2 2v5l-2 2H5l-2-2V6zm3 2 2 2-2 3-2-2z',
  fed: 'M3 3h10v3H3zm1 3v7h8V6M6 1v2M10 1v2',
};

function animalBehavior(w, c) {
  const L = c.life;
  if (c.grabbed) return ['Held', 'Being carried by the player.'];
  if (c.leaving) return ['Leaving', `Leaving the pond${c.leaveWhy ? `: ${c.leaveWhy}` : ''}.`];
  if (c.threat) return ['Fleeing', 'Responding to a nearby threat.'];
  if (c.prey) return ['Hunting', `Has a prey target${L.energy < 0.25 ? ' and is very hungry' : ''}. Fullness shows its remaining food energy.`];
  if (typeof enraged === 'function' && enraged(w, c)) return ['Enraged', 'Its rage state is active.'];
  if (L.wanderer) return ['Visiting', `A wandering predator from ${L.wanderer.from}${L.wanderer.kills ? `; ${L.wanderer.kills} kills here` : ''}.`];
  if (c.inflate > 0.3) return ['Inflated', 'Its defensive inflation is active.'];
  if (L.satedUntil > w.t && isPredator(c)) return ['Sated', `Hunt cooldown after a kill: ${Math.max(0, Math.ceil(L.satedUntil - w.t))} simulation seconds remaining.`];
  if (L.energy < 0.35) return ['Hungry', `Fullness is below the 35% hunger threshold: ${Math.round(L.energy * 100)}%.`];
  if (L.scale < 0.9) return ['Growing', `Juvenile development: ${Math.round(L.scale * 100)}% of adult scale.`];
  return ['Routine', 'No carried, leaving, fleeing, hunting, rage, visiting, inflation, satiation, hunger or juvenile-growth flag is active. Comfort and water conditions have their own meters.'];
}

function animalStateMetrics(w, c) {
  const L = c.life;
  if (!L) return [];
  const comfort = clamp(L.comfort ?? 0.5, 0, 1), tension = clamp(aggressionAt(w, c.x, c.y), 0, 1);
  const mm = clamp(mismatch(w, c), 0, 1), water = waterOf(c), vigor = L.vigor || 1, roam = clamp(L.wander ?? 0.3, 0, 1);
  const [behavior, reason] = animalBehavior(w, c), likes = likesOf(c);
  const eligible = !c.leaving && !c.grabbed && L.scale >= 0.9 && c.species !== 'tadpole';
  const departure = leaveChance(L, tension, mm) * 100;
  const riskText = departure > 0 && departure < 0.001 ? departure.toPrecision(2) : departure.toFixed(3);
  const rate = ageRate(L), rateText = rate > 0 && rate < 0.01 ? rate.toPrecision(2) : rate.toFixed(2);
  const meter = (key, label, value, tone, tip) => ({key, label, value, tone, tip});
  const out = [
    meter('behavior', 'Behavior', behavior, c.threat || c.prey ? 'warn' : 'neutral', `Behavior: ${behavior}\n${reason}`),
    meter('comfort', 'Comfort', `${Math.round(comfort * 100)}%`, comfort > 0.45 ? 'good' : comfort > 0.25 ? 'warn' : 'bad',
      `Habitat comfort: ${Math.round(comfort * 100)}%\nNearby liked cover, structures, auras and night light improve it; tension, water mismatch, pollution and blight can lower it. Higher comfort slows aging, reduces restless departures and improves dawn income.${likes?.length ? ` Likes: ${likes.map((k) => LIKE_LABEL[k] || k).join(', ')}.` : ' This kind has no specific cover preference.'}`),
    meter('tension', 'Tension', `${Math.round(tension * 100)}/100`, tension < 0.2 ? 'good' : tension < 0.45 ? 'neutral' : tension < 0.8 ? 'warn' : 'bad',
      `Local water tension: ${Math.round(tension * 100)}/100\nAn ecological pressure index from predators, recent hunts, crowding, surf and water mismatch; cover lowers it. Below 20 is calm; 20–44 tense; 45–79 hostile; 80+ extreme. It lowers comfort, discourages arrivals and raises departure risk. Natural breeding is blocked at 75 or higher.`),
    meter('water', 'Water match', `${Math.round((1 - mm) * 100)}%`, mm <= 0.3 ? 'good' : mm <= 0.5 ? 'warn' : 'bad',
      `Water match: ${Math.round((1 - mm) * 100)}%\n${water ? `This animal prefers ${water} water.` : 'This animal tolerates fresh and salt water.'} This is 100 × (1 − the simulation’s salinity mismatch), not a salinity measurement. Mismatch penalties apply in mixed ponds; tolerance softens their comfort and departure effects.`),
    meter('vigor', 'Vigor', `${vigor.toFixed(2)}×`, vigor > 1.12 ? 'good' : vigor < 0.9 ? 'warn' : 'neutral',
      `Vigor: ${vigor.toFixed(2)}×\nTemperament rolled at birth (normally 0.80–1.25). Its aging multiplier is ${(1 / vigor).toFixed(2)}× before longevity genes, comfort, feeding and auras. Current combined aging rate: ${rateText}×; lower means slower biological aging.`),
    meter('roam', 'Roaming', `${Math.round(roam * 100)}/100`, 'neutral',
      `Roaming tendency: ${Math.round(roam * 100)}/100\nBirth temperament: lower values favor staying; higher values amplify restlessness when comfort is poor. Current departure risk: ${eligible ? `${riskText}% per migration check (every 6 simulation seconds)` : 'not eligible for a migration check while young, held or already leaving'}. Tension and water mismatch add risk; resilience, tolerance and the well-fed bonus reduce it. This tendency index is not the departure probability.`),
  ];
  if (L.fed > 0) out.push(meter('fed', 'Well-fed bonus', `${Math.ceil(L.fed)}s`, 'good',
    `Well-fed bonus: ${Math.ceil(L.fed)} simulation seconds\nSeparate from fullness. While active it multiplies aging by 0.85 and halves departure risk.`));
  return out;
}

function animalStateStrip(w, c, compact = false, existing = null) {
  const box = existing || document.createElement('div');
  box.className = `cr-states${compact ? ' compact' : ''}`;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Animal condition metrics');
  const metrics = animalStateMetrics(w, c).filter((m) => !compact || ['behavior', 'comfort', 'tension'].includes(m.key));
  const nodes = [];
  for (const m of metrics) {
    let b = [...box.children].find((n) => n.dataset.animalMetric === m.key);
    if (!b) {
      b = document.createElement('button'); b.type = 'button';
      b.dataset.animalMetric = m.key;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', ANIMAL_STATE_ICONS[m.key]); svg.append(path);
      const label = document.createElement('span'); label.className = 'cr-state-label';
      const value = document.createElement('b'); value.className = 'cr-state-value';
      b.append(svg, label, value);
      const show = () => {
        if (typeof showHeldTip !== 'function') return;
        const r = b.getBoundingClientRect();
        TIP.target = b;
        showHeldTip(b.dataset.tip || b.title, r.left + r.width / 2, r.top);
      };
      b.addEventListener('click', show);
      b.addEventListener('focus', show);
      b.addEventListener('blur', () => { if (typeof TIP !== 'undefined' && TIP.target === b) hideTip(); });
    }
    b.className = `cr-state ${m.tone}`;
    b.dataset.focusKey = `state:${c.seed}:${m.key}${compact ? ':compact' : ''}`;
    b.title = m.tip;
    b.setAttribute('aria-label', `${m.label}: ${m.value}`);
    b.setAttribute('aria-describedby', 'pond-tooltip');
    b.querySelector('.cr-state-label').textContent = m.label;
    b.querySelector('.cr-state-value').textContent = m.value;
    nodes.push(b);
  }
  // Stable buttons let a touch hold survive the inspector's periodic refresh.
  for (const b of [...box.children]) if (!nodes.includes(b)) b.remove();
  for (let i = 0; i < nodes.length; i++) if (box.children[i] !== nodes[i]) box.insertBefore(nodes[i], box.children[i] || null);
  return box;
}
