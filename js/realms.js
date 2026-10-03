'use strict';
// Island realms: as the pond goes down and the land around an island changes, the island itself
// takes another form. Each realm reshapes its coast, turns its ground, raises its own landmarks,
// renames it, and feeds its kind of land back into the floor around it.
//  - Cyclopean (the drowned and sunken city, the dreaming dark, or ashen/red land): black-green
//    stone in wrong-angled facets, leaning monoliths, curling stone tentacles, runes that pulse green.
//  - Primeval (the deep past, or ancient land): ochre terraces and cliffs, stromatolite mounds,
//    the ribs of something huge, amber that glows at dusk.
//  - Glass (beyond the deep past, or the glass): a faceted, star-pointed crystal shore, violet
//    ground, glass spires, shards that float above it and pods that glow.
//  - Bone (the abyss, the trench and the black below out over the deep, or bone sand): a pale
//    crescent atoll, great ribs arching over it, a skull mound, foxfire fungus.
// An island turns slowly: its realm strengthens a quarter a dawn toward what its depth and land call for,
// and fades before it changes to another. Kept in its save (s.ig.realm).

const RM = {
  cyclo: mat('#0c1a14', '#16281e', '#22382c', '#34503e'), cycloMoss: mat('#081008', '#101c10', '#1a2a18', '#283c22'),
  rune: solid('#4aff9a'), slime: mat('#1a3a1a', '#2a5a22', '#4a8a2a', '#8ac83a'),
  ochre: mat('#5a3014', '#7e4a22', '#a46a34', '#c88e4e'), fern: mat('#1a3a10', '#2a5418', '#40741e', '#5e962a'),
  strom: mat('#4a3a2a', '#6a5640', '#8e785a', '#b49e7c'), amber: solid('#ffa83a'),
  glass: mat('#3a1a5a', '#5a2a8a', '#8a4ac0', '#c08af0'), glassGrass: mat('#5a1a5a', '#8a2a8a', '#c04ac0', '#f08af0'),
  spire: mat('#2a5a8a', '#4a8ac8', '#8ac8ff', '#e8f8ff'), pod: solid('#ff6af0'), shard: mat('#4a2a7a', '#6a4aaa', '#9a7ad8', '#d0b8ff'),
  bone: mat('#8a8274', '#b2aa98', '#d6cebc', '#f4eee0'), boneSand: mat('#7a7262', '#a49a84', '#c8bea4', '#e8e0c8'), fungus: solid('#7affd8'),
};
const REALMS = {
  cyclo: {
    name: 'a cyclopean isle', word: 'black stone in wrong-angled facets is pushing up through it, and runes glow on it',
    sand: RM.cyclo, grass: RM.cycloMoss, land: 'dark',
    form: { rough: 0.4, cliff: 4, facets: 5, facetK: 0.55, spike: 0, bay: 0, stretch: 0.9 },
    tiers: [7, 8], biome: { dark: 1, mad: 0.8 },
  },
  ancient: {
    name: 'a primeval isle', word: 'it is rising in ochre terraces, grown over with the oldest life there is',
    sand: RM.ochre, grass: RM.fern, land: 'ancient',
    form: { rough: 0.2, cliff: 3, facets: 0, facetK: 0, spike: 0, bay: 0, stretch: 1.15, terrace: 1 },
    tiers: [9, 10, 11], biome: { ancient: 1, cryptid: 0.5 },
  },
  glass: {
    name: 'a glass atoll', word: 'its shore is crystallising into glass, and shards hang in the air above it',
    sand: RM.glass, grass: RM.glassGrass, land: 'alien',
    form: { rough: 0, cliff: 2, facets: 7, facetK: 0.35, spike: 0.35, bay: 0, stretch: 1 },
    tiers: [12, 13, 14, 15, 16, 17, 18, 19, 20], biome: { alien: 1, light: 0.4 },
  },
  bone: {
    name: 'a bone atoll', word: 'it is bending into a pale crescent, and great ribs are rising out of it',
    sand: RM.boneSand, grass: RM.bone, land: 'bone',
    form: { rough: 0.15, cliff: 1, facets: 0, facetK: 0, spike: 0, bay: 0.5, stretch: 1.2 },
    tiers: [4, 5, 6], biome: { bone: 1 }, deep: true,
  },
};
const REALM_KEYS = Object.keys(REALMS);
const realmOf = (s) => (s.ig && s.ig.realm && REALMS[s.ig.realm.k] ? s.ig.realm : null);
const realmG = (s) => { const R = realmOf(s); return R ? clamp(R.g || 0, 0, 1) : 0; };
// Where it has taken hold (half way or more), the realm names and grounds the island.
const realmShown = (s) => (realmG(s) >= 0.5 ? REALMS[s.ig.realm.k] : null);

// What its depth and its land call for: the strongest realm, if any calls strongly enough.
function realmWanted(world, s, m) {
  const tier = (world.erosion && world.erosion.tier) || 0;
  let best = null, bv = 0.45;
  for (const k of REALM_KEYS) {
    const D = REALMS[k];
    let v = D.tiers.includes(tier) ? 0.6 + 0.1 * D.tiers.indexOf(tier) : 0;
    for (const [b, w] of Object.entries(D.biome)) v += w * 1.1 * (m[b] || 0);
    if (D.deep) v *= (s.deep || 0) > 0.15 || tier >= 5 ? 1 : 0.4; // (bone atolls stand out over the deep)
    if (v > bv) { bv = v; best = k; }
  }
  return best;
}

// Each dawn: strengthen toward the wanted realm, or fade before changing; the land around takes it on.
function dawnRealms(world) {
  if (!world.W || world.observe) return;
  for (const s of (world.structures || []).filter((q) => q.kind === 'island' && !q.anim)) {
    const G = isleG(s), R = islandRadius(world, s), m = typeof landMean === 'function' ? landMean(world, s.x, s.y, R * 1.6) : {};
    const want = realmWanted(world, s, m), cur = G.realm || null, was = realmShown(s), before = cur ? `${cur.k}${cur.g}` : '';
    if (cur && cur.k === want) cur.g = +Math.min(1, (cur.g || 0) + 0.25).toFixed(2);
    else if (cur) { cur.g = +((cur.g || 0) - 0.34).toFixed(2); if (cur.g <= 0) G.realm = want ? { k: want, g: 0.25, since: world.days || 0 } : null; }
    else if (want) G.realm = { k: want, g: 0.25, since: world.days || 0 };
    const now = realmShown(s);
    // (Redraw the island and its ground when its realm moved on.)
    if ((G.realm ? `${G.realm.k}${G.realm.g}` : '') !== before && typeof landRebake === 'function') landRebake(world, s.x, s.y, isleReach(world, s) + 8);
    if (now !== was && typeof logEvent === 'function') {
      const name = `the ${((ISLE_KINDS[isleOf(s)] || {}).name || 'island').replace(/^an? /, '')}`;
      if (now) logEvent(world, `✦ ${capFirst(name)} is becoming ${now.name}: ${now.word}`, null, { cat: 'rare', pri: 2 });
      else logEvent(world, `${capFirst(was.name.replace(/^an? /, 'the '))} is losing its strangeness; it is becoming ${name.replace(/^the /, 'a ')} again`, null, { cat: 'life', pri: 1 });
    }
    // The realm feeds its land into the floor around it.
    const g = realmG(s);
    if (g > 0 && typeof landAdd === 'function') landAdd(world, s.x, s.y, REALMS[G.realm.k].land, 0.03 * g, R / LAND_CELL + 2);
  }
}

// ---- its shape ------------------------------------------------------------------------------------------
// Blend a realm's form into the island's own (isleForm).
function realmForm(s, F) {
  const R = realmOf(s), g = realmG(s);
  if (!R || g <= 0) return F;
  const D = REALMS[R.k].form, h = hash2(s.seed % 991, 61, 7);
  return { ...F, rough: lerp(F.rough, D.rough, g), cliff: F.cliff + D.cliff * g, stretch: lerp(F.stretch, D.stretch, g),
    bay: Math.max(F.bay, D.bay * g), bayAng: D.bay ? F.ang + PI / 2 : F.bayAng, flats: F.flats * (1 - 0.6 * g),
    facets: D.facets, facetK: D.facetK * g, facetPh: h * TAU, spike: D.spike * g, terrace: (D.terrace || 0) * g };
}
// The realm's own reshaping of a coast bearing (isleOutline): wrong-angled facets, crystal points.
function realmOutline(F, a) {
  let k = 1;
  if (F.facets && F.facetK) {
    const n = F.facets, step = TAU / n, u = (((a + F.facetPh) % step) + step) % step;
    // (A polygon whose sides lean: each face is pushed off true by a different angle.)
    const lean = 0.25 * Math.sin(Math.floor((a + F.facetPh) / step) * 2.7);
    k *= lerp(1, Math.cos(PI / n) / Math.cos(u - step / 2 + lean * (u / step - 0.5)), F.facetK);
  }
  if (F.spike) k *= 1 + F.spike * Math.max(0, Math.cos((F.facets || 6) * (a + (F.facetPh || 0)))) ** 10;
  return k;
}

// ---- its landmarks (baked with the island) ---------------------------------------------------------------
function bakeRealm(r, s, next, world) {
  const R0 = realmOf(s), g = realmG(s);
  if (!R0 || g < 0.25) return;
  const R = islandRadius(world, s), x0 = s.x, y0 = s.y, zAt = (ox, oy) => islandTopAt(s, ox, oy);
  const ids = new Map(), id = (m) => { if (!ids.has(m)) ids.set(m, next(m)); return ids.get(m); }, h = (a, b, c) => hash2(a, b, (s.seed % 89) + c);
  const n = (base) => Math.max(1, Math.round(base * g * Math.max(1, R / 26)));
  const spot = (k, salt, far = 0.65) => { const a = h(k, salt, 3) * TAU, d = R * (0.12 + far * h(k, salt + 1, 5)); return [Math.cos(a) * d, Math.sin(a) * d, a]; };
  switch (R0.k) {
    case 'cyclo': {
      // Leaning monoliths of black-green stone.
      for (let k = 0; k < n(5); k++) {
        const [ox, oy, a] = spot(k, 11), z = zAt(ox, oy), ht = 8 + 10 * h(k, 13, 7), lean = 0.35 * (h(k, 17, 9) - 0.5), w = 1.4 + h(k, 19, 11);
        r.tube(x0 + ox, y0 + oy, w, z - 1, x0 + ox + Math.cos(a) * ht * lean, y0 + oy + Math.sin(a) * ht * lean, w * 0.8, z + ht, 0.6, RM.cyclo, id(RM.cyclo));
      }
      // Stone tentacles curling up out of the ground.
      for (let k = 0; k < n(3); k++) {
        const [ox, oy, a] = spot(k, 23, 0.55);
        let px = x0 + ox, py = y0 + oy, pz = zAt(ox, oy) - 0.5, w = 1.6;
        for (let j = 0; j < 7; j++) {
          const b = a + j * 0.55, qx = px + Math.cos(b) * 1.6, qy = py + Math.sin(b) * 1.6, qz = pz + 2.2 - j * 0.12;
          r.tube(px, py, w, pz, qx, qy, w * 0.82, qz, 0.7, RM.cycloMoss, id(RM.cycloMoss));
          px = qx; py = qy; pz = qz; w *= 0.82;
        }
      }
      // A slick of something green in a hollow.
      const [px, py] = spot(1, 29, 0.3);
      r.ellipsoid(x0 + px, y0 + py, R * 0.18, R * 0.14, 0.4, zAt(px, py) + 0.05, 0.1, RM.slime, id(RM.slime));
      break;
    }
    case 'ancient': {
      // Stromatolites: layered mounds, each layer a little narrower.
      for (let k = 0; k < n(7); k++) {
        const [ox, oy] = spot(k, 31, 0.75), z = zAt(ox, oy), rr = 1.8 + 1.6 * h(k, 33, 7);
        for (let j = 0; j < 4; j++) r.ellipsoid(x0 + ox, y0 + oy, rr * (1 - j * 0.18), rr * (1 - j * 0.18) * 0.9, j, z + j * 0.9, 0.9, j % 2 ? RM.strom : RM.ochre, id(j % 2 ? RM.strom : RM.ochre));
      }
      // The ribs of something huge, half buried.
      const [rx, ry, ra] = spot(2, 37, 0.35), rz = zAt(rx, ry);
      for (let j = 0; j < Math.round(4 + 4 * g); j++) {
        const u = (j - 3.5) * 1.9, bx = x0 + rx + Math.cos(ra) * u, by = y0 + ry + Math.sin(ra) * u, side = ra + PI / 2;
        for (const sd of [1, -1]) r.tube(bx, by, 0.5, rz, bx + Math.cos(side) * sd * 4, by + Math.sin(side) * sd * 4, 0.35, rz + 5, 0.8, RM.bone, id(RM.bone));
      }
      break;
    }
    case 'glass': {
      // Glass spires, tall and thin, in clusters.
      for (let k = 0; k < n(6); k++) {
        const [ox, oy] = spot(k, 41, 0.7), z = zAt(ox, oy);
        for (let j = 0; j < 3; j++) {
          const a = j * 2.1 + k, d = j ? 1.6 : 0, ht = (j ? 7 : 13) + 6 * h(k, 43 + j, 7), bx = x0 + ox + Math.cos(a) * d, by = y0 + oy + Math.sin(a) * d;
          r.tube(bx, by, j ? 0.8 : 1.2, z - 0.5, bx + Math.cos(a) * 0.6, by + Math.sin(a) * 0.6, 0.15, z + ht, 0.5, RM.spire, id(RM.spire));
        }
      }
      break;
    }
    case 'bone': {
      // Great ribs arching across the crescent.
      const ang = isleForm(world, s).ang;
      for (let j = 0; j < Math.round(3 + 4 * g); j++) {
        const u = (j / Math.max(1, Math.round(3 + 4 * g) - 1) - 0.5) * R * 1.1, bx = x0 + Math.cos(ang) * u, by = y0 + Math.sin(ang) * u, side = ang + PI / 2;
        let px = bx - Math.cos(side) * R * 0.45, py = by - Math.sin(side) * R * 0.45, pz = zAt(px - x0, py - y0);
        for (let i = 1; i <= 8; i++) {
          const t = i / 8, qx = bx + Math.cos(side) * R * 0.45 * (2 * t - 1), qy = by + Math.sin(side) * R * 0.45 * (2 * t - 1), qz = zAt(qx - x0, qy - y0) + Math.sin(PI * t) * (8 + R * 0.2);
          r.tube(px, py, 0.9, pz, qx, qy, 0.9, qz, 0.8, RM.bone, id(RM.bone));
          px = qx; py = qy; pz = qz;
        }
      }
      // A skull mound.
      const [sx, sy] = spot(3, 51, 0.3), sz = zAt(sx, sy);
      r.ellipsoid(x0 + sx, y0 + sy, 4, 3.4, 0, sz, 3.6, RM.bone, id(RM.bone));
      for (const e of [-1, 1]) r.ellipsoid(x0 + sx + e * 1.5, y0 + sy + 1.2, 0.9, 0.9, 0, sz + 2.4, 0.9, SM.basalt, id(SM.basalt));
      break;
    }
  }
}

// ---- what moves and glows on it (drawn every frame) -------------------------------------------------------
function drawRealm(r, s, t, world) {
  const R0 = realmOf(s), g = realmG(s);
  if (!R0 || g < 0.25) return;
  const R = islandRadius(world, s), x0 = s.x, y0 = s.y, dark = (world && world.darkness) || 0, h = (a, b, c) => hash2(a, b, (s.seed % 89) + c);
  const glowing = dark > 0.25 || R0.k === 'cyclo' || R0.k === 'glass';
  r.castShadows = false;
  if (R0.k === 'cyclo') {
    // Runes on the monoliths, pulsing out of step with each other.
    for (let k = 0; k < Math.round(5 * g * Math.max(1, R / 26)); k++) {
      const a = h(k, 11, 3) * TAU, d = R * (0.12 + 0.65 * h(k, 12, 5)), ox = Math.cos(a) * d, oy = Math.sin(a) * d;
      if (Math.sin(t * 1.3 + k * 2.1) < 0.2) continue;
      for (let j = 0; j < 3; j++) r.dot(x0 + ox + (j - 1) * 0.6, y0 + oy, islandTopAt(s, ox, oy) + 4 + j * 2.5, RM.rune, ISLE_FX_ID);
    }
  } else if (R0.k === 'glass') {
    // Shards hanging in the air, turning and bobbing; pods that glow.
    for (let k = 0; k < Math.round(7 * g); k++) {
      const a = h(k, 61, 3) * TAU + t * 0.08, d = R * (0.2 + 0.6 * h(k, 62, 5)), ox = Math.cos(a) * d, oy = Math.sin(a) * d;
      const z = islandTopAt(s, ox, oy) + 10 + 4 * h(k, 63, 7) + Math.sin(t * 0.9 + k) * 1.5;
      r.ellipsoid(x0 + ox, y0 + oy, 1.4, 0.7, t * 0.5 + k, z, 1.2, RM.shard, ISLE_FX_ID);
    }
    for (let k = 0; k < Math.round(6 * g); k++) {
      const a = h(k, 71, 3) * TAU, d = R * (0.15 + 0.6 * h(k, 72, 5)), ox = Math.cos(a) * d, oy = Math.sin(a) * d;
      if (Math.sin(t * 2 + k * 1.7) > -0.3) r.dot(x0 + ox, y0 + oy, islandTopAt(s, ox, oy) + 1, RM.pod, ISLE_FX_ID);
    }
  } else if (glowing && R0.k === 'ancient') {
    // Amber catching the last light.
    for (let k = 0; k < Math.round(6 * g); k++) { const a = h(k, 81, 3) * TAU, d = R * (0.2 + 0.6 * h(k, 82, 5)), ox = Math.cos(a) * d, oy = Math.sin(a) * d; r.dot(x0 + ox, y0 + oy, islandTopAt(s, ox, oy) + 0.6, RM.amber, ISLE_FX_ID); }
  } else if (glowing && R0.k === 'bone') {
    // Foxfire fungus on the bones.
    for (let k = 0; k < Math.round(9 * g); k++) {
      const a = h(k, 91, 3) * TAU, d = R * (0.1 + 0.7 * h(k, 92, 5)), ox = Math.cos(a) * d, oy = Math.sin(a) * d;
      if (Math.sin(t * 0.7 + k) > -0.5) r.dot(x0 + ox, y0 + oy, islandTopAt(s, ox, oy) + 0.8, RM.fungus, ISLE_FX_ID);
    }
  }
  r.castShadows = true;
}
// Light from its glowing things for the light map (depths.js isleLights).
function realmLights(M, world, s, rect) {
  const R0 = realmOf(s), g = realmG(s);
  if (!R0 || g < 0.5 || typeof splat !== 'function') return;
  const col = { cyclo: '#4aff9a', glass: '#ff6af0', ancient: '#ffa83a', bone: '#7affd8' }[R0.k];
  if (R0.k === 'cyclo' || R0.k === 'glass' || (world.darkness || 0) > 0.3) splat(M, s.x, s.y, islandRadius(world, s) * 1.2, hexToInt(col), 0.35 * g, 0, 0, rect);
}

// Drawn over every island, after its own extras.
{ const base = DRAW.island; DRAW.island = (r, s, t, world) => { base(r, s, t, world); drawRealm(r, s, t, world); }; }
