'use strict';
// Mastery: an animal with a trait built all the way up (to its last level, from its card) shows it,
// subtly and on the move. The growing traits:
//  - fertile: now and then a rose glint rises off its back;
//  - long-lived: a slow silver shimmer runs down its spine, head to tail;
//  - hardy: flecks of bronze catch the light along its flanks;
//  - clever: a small blue spark circles over its head;
//  - bright: its eyes shine (softly by day, clearly at night);
//  - calm: a faint ring spreads from it every few seconds;
//  - adaptable: its back shifts through colours, a dot at a time.
// The hunt:
//  - jaws: pale fangs at the snout, flashing when it hunts;
//  - burst: a short streak behind it when it moves fast;
//  - senses: amber eyes, and a faint arc sweeping ahead of it;
//  - hunger: a red flicker in its eyes, stronger the hungrier it is;
//  - maw: a dark red gape that opens as it closes on prey;
//  - tenacity: an ember glowing at the tail;
//  - contagion: sickly green motes drifting off it;
//  - devour: dark motes circling in toward it.

const MAST_FX = 6, MAST_GLOW = 7; // (effect ids: no outlines; one lit a little at night, one its own light)
FADE[MAST_FX] = FADE[MAST_GLOW] = 1;
EMISSIVE[MAST_FX] = 1; EMISSIVE[MAST_GLOW] = 2;
const MM = {
  rose: mat('#a0385a', '#d05a82', '#f08aaa', '#ffd0e0'), silver: mat('#8a96a4', '#b4c0cc', '#dce4ec', '#ffffff'),
  bronze: mat('#6a4418', '#9a6a28', '#c8963e', '#f0c870'), spark: mat('#2a6ab0', '#4a9ae0', '#8ac8ff', '#e0f4ff'),
  eye: mat('#8aa0b0', '#c0d8e8', '#e8f6ff', '#ffffff'), ring: mat('#6aa0b0', '#90c4d0', '#bfe4ec', '#e8faff'),
  fang: mat('#b0a890', '#d8d0b8', '#f0ead8', '#ffffff'), streak: mat('#6a8a9a', '#94b0bc', '#c0d6de', '#eef8fa'),
  amber: mat('#8a5a08', '#c08818', '#f0b830', '#ffe890'), red: mat('#6a0808', '#a01414', '#e02a1a', '#ff7050'),
  gape: mat('#1a0204', '#3a060a', '#5a0c10', '#7a1418'), ember: mat('#7a2a04', '#c05008', '#f08a1a', '#ffd070'),
  sick: mat('#3a5a08', '#5a8a10', '#8ac020', '#c8f060'), dark: mat('#08020c', '#14061c', '#220c2e', '#341444'),
  hues: [mat('#8a1a2a', '#c02a3a', '#f05a5a', '#ffb0a0'), mat('#8a6a08', '#c09a18', '#f0c830', '#fff0a0'),
    mat('#086a5a', '#10a08a', '#30d8b8', '#b0fff0'), mat('#4a1a8a', '#6a30c0', '#9a60f0', '#dcc0ff')],
};

function drawMastery(r, c, t) {
  const L = c.life, b = c.body;
  if (!L || !b || b.n < 2 || (!L.boosts && !L.hunt)) return;
  const B = L.boosts || {}, H = L.hunt || {}, top = typeof ANIMAL_MAX === 'number' ? ANIMAL_MAX : 10, htop = typeof HUNT_MAX === 'number' ? HUNT_MAX : 10;
  const bm = (k) => (B[k] || 0) >= top, hm = (k) => (H[k] || 0) >= htop;
  const n = b.n, z = (c.zBody ?? c.z ?? 1), ph = c.phase || 0, head = b.a[0], hx = b.x[0], hy = b.y[0];
  const mid = Math.min(n - 1, 2), zTop = z + b.w[mid] * 0.9 + 0.8, dark = (typeof world !== 'undefined' && world.darkness) || 0;
  const fx = (x, y, zz, m, glow) => r.dot(x, y, zz, m, glow ? MAST_GLOW : MAST_FX);
  r.castShadows = false;
  // ---- the growing traits ----
  if (bm('fertile')) {
    const k = ((t * 0.5 + ph) % 2) / 2; // every two seconds, one rising and fading
    if (k < 0.6) fx(b.x[mid] + Math.sin(t * 3 + ph) * 0.8, b.y[mid] + Math.cos(t * 3 + ph) * 0.8, zTop + k * 7, MM.rose, false);
  }
  if (bm('longlived')) {
    const f = ((t * 0.35 + ph) % 1.6) / 1.6;
    if (f < 1) { const i = Math.min(n - 1, Math.floor(f * n)); fx(b.x[i], b.y[i], z + b.w[i] * 0.9 + 0.5, MM.silver, false); }
  }
  if (bm('hardy')) {
    for (let k = 0; k < 2; k++) {
      const i = Math.min(n - 1, 1 + ((k * 3 + Math.floor(t * 0.7 + ph)) % Math.max(1, n - 1))), sd = k ? 1 : -1;
      if (Math.sin(t * 4 + k * 2 + ph) > 0.55) fx(b.px(i, sd * PI / 2, -0.5), b.py(i, sd * PI / 2, -0.5), z + b.w[i] * 0.6, MM.bronze, false);
    }
  }
  if (bm('clever')) {
    const a = t * 2.2 + ph, R = b.w[0] + 1.8;
    fx(hx + Math.cos(a) * R, hy + Math.sin(a) * R, zTop + 2 + Math.sin(t * 3) * 0.5, MM.spark, true);
  }
  const eyes = (m, glow) => { for (const s of [-1, 1]) fx(b.px(0, s * 0.9, -0.6), b.py(0, s * 0.9, -0.6), z + b.w[0] + 1.1, m, glow); };
  if (bm('bright') && (dark > 0.3 || Math.sin(t * 0.9 + ph) > 0.7)) eyes(MM.eye, dark > 0.3);
  if (bm('calm')) {
    const k = ((t * 0.3 + ph * 0.2) % 1.5) / 1.5;
    if (k < 1) { const R = 3 + k * 9, m = Math.max(6, Math.round(R * 2)); for (let j = 0; j < m; j++) if ((j + Math.floor(t * 8)) % 3) fx(b.x[mid] + Math.cos(j / m * TAU) * R, b.y[mid] + Math.sin(j / m * TAU) * R, z + 0.3, MM.ring, false); }
  }
  if (bm('adaptable')) {
    for (let i = 1; i < n - 1; i += 2) fx(b.x[i], b.y[i], z + b.w[i] * 0.95 + 0.4, MM.hues[(i + Math.floor(t * 1.2 + ph)) % 4], false);
  }
  // ---- the hunt ----
  const hunting = !!c.prey;
  if (hm('jaws') && (hunting || Math.sin(t * 1.3 + ph) > 0.6)) {
    for (const s of [-1, 1]) fx(hx + Math.cos(head + s * 0.35) * (b.w[0] + 0.8), hy + Math.sin(head + s * 0.35) * (b.w[0] + 0.8), z + 0.4, MM.fang, false);
  }
  if (hm('burst') && (c.speed || 0) > (c.maxSpeed || 20) * 0.45) {
    const tl = n - 1, back = b.a[tl] + PI;
    for (let k = 1; k <= 3; k++) if ((k + Math.floor(t * 12)) % 2) fx(b.x[tl] + Math.cos(back) * k * 1.6, b.y[tl] + Math.sin(back) * k * 1.6, z + 0.2, MM.streak, false);
  }
  if (hm('senses')) {
    eyes(MM.amber, true);
    const sweep = Math.sin(t * 1.4 + ph) * 0.8, R = b.w[0] + 6;
    for (let j = -2; j <= 2; j++) if (Math.sin(t * 2 + j) > 0.2) fx(hx + Math.cos(head + sweep + j * 0.12) * R, hy + Math.sin(head + sweep + j * 0.12) * R, z + 0.3, MM.amber, false);
  }
  if (hm('hunger')) {
    const hungry = 1 - clamp(L.energy ?? 1, 0, 1);
    if (Math.sin(t * (3 + hungry * 6) + ph) > 0.6 - hungry) eyes(MM.red, true);
  }
  if (hm('maw') && hunting) {
    const q = c.prey, d = q ? Math.hypot(q.x - hx, q.y - hy) : 99;
    if (d < 30) { const o = 0.4 + 0.5 * clamp(1 - d / 30, 0, 1); for (const s of [-1, 1]) fx(hx + Math.cos(head + s * o) * (b.w[0] + 0.3), hy + Math.sin(head + s * o) * (b.w[0] + 0.3), z + 0.5, MM.gape, false); }
  }
  if (hm('tenacity')) {
    const tl = n - 1;
    if (Math.sin(t * 2.5 + ph) > -0.2) fx(b.x[tl], b.y[tl], z + b.w[tl] + 0.6, MM.ember, true);
  }
  if (hm('contagion')) {
    for (let k = 0; k < 3; k++) {
      const f = ((t * 0.4 + k / 3 + ph) % 1), i = Math.min(n - 1, 1 + k), a = ph * 3 + k * 2.1;
      if (f < 0.8) fx(b.x[i] + Math.cos(a) * f * 5, b.y[i] + Math.sin(a) * f * 5, z + 0.5 + f * 4, MM.sick, false);
    }
  }
  if (hm('devour')) {
    for (let k = 0; k < 4; k++) {
      const f = 1 - ((t * 0.35 + k / 4 + ph) % 1), a = t * 1.5 + k * PI / 2, R = 2 + f * 8;
      fx(b.x[mid] + Math.cos(a) * R, b.y[mid] + Math.sin(a) * R, z + 1 + f * 2, MM.dark, false);
    }
  }
  r.castShadows = true;
}

// How each looks, built all the way (for the guide and the card).
const MASTERY_LOOKS = {
  fertile: 'now and then a rose glint rises off its back', longlived: 'a slow silver shimmer runs down its spine', hardy: 'flecks of bronze catch the light along its flanks',
  clever: 'a small blue spark circles over its head', bright: 'its eyes shine, softly by day and clearly at night', calm: 'a faint ring spreads from it every few seconds',
  adaptable: 'its back shifts through colours, a dot at a time', jaws: 'pale fangs at its snout, flashing when it hunts', burst: 'a short streak behind it when it moves fast',
  senses: 'amber eyes, and a faint arc sweeping ahead of it', hunger: 'a red flicker in its eyes, stronger the hungrier it is', maw: 'a dark red gape that opens as it closes on prey',
  tenacity: 'an ember glowing at its tail', contagion: 'sickly green motes drifting off it', devour: 'dark motes circling in toward it',
};
// The traits an animal has built all the way (for its card).
function masteredTraits(c) {
  const L = c && c.life;
  if (!L) return [];
  const top = typeof ANIMAL_MAX === 'number' ? ANIMAL_MAX : 10, htop = typeof HUNT_MAX === 'number' ? HUNT_MAX : 10;
  return [...Object.keys(L.boosts || {}).filter((k) => L.boosts[k] >= top), ...Object.keys(L.hunt || {}).filter((k) => L.hunt[k] >= htop)];
}
