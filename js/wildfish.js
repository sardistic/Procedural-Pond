'use strict';
// Procedurally generated fish species. Each species gets its own body profile,
// tail and fin shapes, colour scheme, pattern, behaviour and a generated name;
// individuals of a species then vary by their own genes.

const WILD_SPECIES = [];

const HUE_NAMES = [[0, 'Ember'], [18, 'Copper'], [36, 'Amber'], [52, 'Golden'], [75, 'Lime'], [110, 'Jade'],
  [160, 'Teal'], [188, 'Glass'], [212, 'Azure'], [240, 'Indigo'], [270, 'Violet'], [300, 'Orchid'], [335, 'Rose'], [360, 'Ember']];
const PATTERN_WORDS = {
  solid: ['Plain', 'Clear'], stripe: ['Lined', 'Striped'], bars: ['Barred', 'Tiger'], spots: ['Spotted', 'Freckled'],
  gradient: ['Dusk', 'Fading'], saddle: ['Saddled', 'Belted'], eyespot: ['Eyespot', 'Peacock'],
  twotone: ['Painted', 'Two-tone'], dotline: ['Beaded', 'Dotted'], netted: ['Netted', 'Lace'],
};
const SHAPE_NOUNS = {
  fresh: {
    slender: [['Darter', 'Rasbora', 'Minnow'], ['Pike', 'Gar', 'Needlefish']],
    deep: [['Gourami', 'Molly', 'Platy'], ['Angelfish', 'Discus', 'Bream']],
    plain: [['Tetra', 'Danio', 'Barb'], ['Carp', 'Perch', 'Cichlid']],
  },
  salt: {
    slender: [['Goby', 'Blenny', 'Dartfish'], ['Barracuda', 'Trumpetfish', 'Houndfish']],
    deep: [['Damsel', 'Chromis', 'Butterflyfish'], ['Tang', 'Batfish', 'Angelfish']],
    plain: [['Wrasse', 'Anthias', 'Cardinalfish'], ['Snapper', 'Grouper', 'Grunt']],
  },
};

// Which water a newly invented species lives in, given the pond's habitat setting.
const wildHabitat = (world) => {
  const h = world.opts.habitat || 'mixed';
  return h === 'mixed' ? (Math.random() < 0.5 ? 'fresh' : 'salt') : h;
};
const wildSpeciesFor = (world) => {
  const known = WILD_SPECIES.filter((s) => fitsHabitat(world, s.habitat));
  return known.length && Math.random() < 0.5 ? pick(known) : genWildSpecies(wildHabitat(world));
};

function hueName(h, s) {
  if (s < 0.2) return pick(['Silver', 'Ash', 'Pearl']);
  let best = HUE_NAMES[0];
  for (const e of HUE_NAMES) if (Math.abs(e[0] - h) < Math.abs(best[0] - h)) best = e;
  return best[1];
}

const SYLLABLES = ['ka', 'mi', 'no', 'ra', 'su', 'te', 'lo', 'fi', 'bu', 'zo', 'ya', 'ri', 'ne', 'po', 'shi', 'ta', 'ku', 'mo', 'wen', 'ly', 'an', 'el'];
function personName() {
  let s = '';
  for (let i = randi(2, 3); i > 0; i--) s += pick(SYLLABLES);
  return s[0].toUpperCase() + s.slice(1);
}

function genWildSpecies(habitat = Math.random() < 0.5 ? 'fresh' : 'salt') {
  const reef = habitat === 'salt';
  const small = Math.random() < 0.55;
  const nb = randi(7, 12);
  const length = small ? rand(9, 16) : rand(18, 32);
  const link = length / (nb - 1);
  const depth = rand(0.07, 0.2);                 // max half-width as a fraction of length
  const W = Math.max(1, length * depth);
  const peak = rand(0.18, 0.45), head = rand(0.45, 0.8), tailW = rand(0.12, 0.28), ex = rand(0.7, 1.8);
  const widths = Array.from({ length: nb }, (_, i) => {
    const u = i / (nb - 1);
    const k = u < peak ? lerp(head, 1, Math.sin(u / peak * PI / 2)) : lerp(1, tailW, Math.pow((u - peak) / (1 - peak), ex));
    return Math.max(0.6, W * k);
  });
  const tail = pick(['fork', 'fan', 'long', 'round', 'lyre']);
  const tailLen = rand(0.7, 1.4) * W;
  const tailJoints = tail === 'long' ? 4 : tail === 'fan' || tail === 'round' ? 2 : 0;
  const links = new Array(nb - 1 + tailJoints).fill(link);
  for (let i = 0; i < tailJoints; i++) widths.push(0);

  // Palette from a colour scheme: reef fish are vivid, freshwater fish more subdued.
  const h = rand(0, 360), s = reef ? rand(0.6, 0.95) : rand(0.25, 0.75), l = rand(0.4, 0.62);
  const scheme = pick(reef ? ['analog', 'comp', 'comp', 'split', 'mono'] : ['analog', 'comp', 'mono', 'neutral', 'neutral', 'split']);
  const ah = scheme === 'analog' ? h + rand(25, 55) : scheme === 'comp' ? h + 180 : scheme === 'split' ? h + 150 : h;
  const base = scheme === 'neutral' ? ramp(h, 0.08, l) : ramp(h, s, l);
  const accent = scheme === 'mono' ? ramp(h, s, l > 0.5 ? l - 0.22 : l + 0.2) : ramp(ah, Math.min(1, s + 0.1), clamp(l + rand(-0.15, 0.15), 0.3, 0.7));
  const fin = ramp(Math.random() < 0.5 ? h : ah, s * 0.7, Math.min(0.78, l + 0.18));
  const pattern = pick(reef ? ['bars', 'stripe', 'eyespot', 'twotone', 'spots', 'saddle', 'bars', 'twotone', 'netted', 'gradient'] : Object.keys(PATTERN_WORDS));
  const shape = depth < 0.11 ? 'slender' : depth > 0.16 ? 'deep' : 'plain';

  const zBand = pick([[2, 8], [8, 22], [20, 36]]);
  const sp = {
    id: WILD_SPECIES.length + 1,
    name: `${pick(PATTERN_WORDS[pattern])} ${hueName(scheme === 'neutral' ? ah : h, scheme === 'neutral' ? 0.5 : s)} ${pick(SHAPE_NOUNS[habitat][shape][small ? 0 : 1])}`,
    habitat,
    nb, links, widths, W, tail, tailLen, tailJoints,
    fins: rand(0.4, 1.1), dorsal: pick([null, 'ridge', 'sail']), hs: rand(0.8, 1.3),
    base, accent, fin, pattern, freq: rand(3, 9), size: rand(0.1, 0.35),
    schooling: small && Math.random() < 0.7,
    predator: !small && Math.random() < 0.35,
    zMin: zBand[0], zMax: zBand[1],
    cruise: rand(6, 12) * (small ? 1.3 : 0.8),
    small, length,
  };
  // Swatch colour for the HUD, from the packed ABGR base shade.
  const c = base[2];
  sp.color = '#' + [c & 255, (c >> 8) & 255, (c >> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('');
  WILD_SPECIES.push(sp);
  return sp;
}

// (u along body 0..1, v across -1..1) -> material, varied per individual by seed.
function wildPattern(sp, seed) {
  const { base, accent, pattern, freq, size } = sp;
  const dark = [accent[0], accent[0], accent[1], accent[1]];
  return (u, v) => {
    const av = Math.abs(v);
    switch (pattern) {
      case 'stripe': return av < 0.25 + size * 0.4 ? accent : base;
      case 'bars': return u > 0.08 && Math.sin(u * freq * TAU + seed) > 0.4 ? accent : base;
      case 'spots': return vnoise(u * freq * 2 + seed, v * 2.5, 61) > 0.66 ? accent : base;
      case 'gradient': return u + (vnoise(u * 8 + seed, v * 2, 62) - 0.5) * 0.15 > 0.5 ? accent : base;
      case 'saddle': return av < 0.6 && Math.sin(u * freq * 0.7 * TAU + seed) > 0.5 ? accent : base;
      case 'eyespot': {
        const d = Math.hypot((u - 0.78) * 3.5, v * 0.9);
        return d < 0.25 ? dark : d < 0.45 ? accent : base;
      }
      case 'twotone': return av > 0.45 ? accent : base;
      case 'dotline': return av < 0.3 && Math.sin(u * freq * 2 * TAU + seed) > 0.3 ? accent : base;
      case 'netted': return Math.abs(Math.sin(u * freq * 3 + v * 3 + seed)) < 0.25 || Math.abs(Math.sin(u * freq * 3 - v * 3)) < 0.25 ? accent : base;
      default: return u < 0.06 ? accent : base;
    }
  };
}

class WildFish extends Fish {
  constructor(world, x, y, sp = wildSpeciesFor(world), school = null) {
    super(world, x, y, {
      species: 'wild',
      links: sp.links.slice(), widths: sp.widths.slice(),
      constraint: sp.small ? PI / 6 : PI / 8,
      cruise: sp.cruise, maxSpeed: sp.cruise * 2.2, turnRate: sp.small ? 4 : 1.8,
      wiggleAmp: sp.small ? 0.35 : 0.22, wiggleFreq: sp.small ? 12 : 6,
      zMin: sp.zMin, zMax: sp.zMax, sight: sp.small ? 50 : 80, skittish: sp.small,
      outline: outlineOf(sp.base),
    });
    this.sp = sp;
    this.school = school;
    this.ox = rand(-10, 10); this.oy = rand(-10, 10);
    this.skin = bakeShader(wildPattern(sp, rand(0, 99)), 48, 16);
    this.fin = sp.fin;
  }

  wander(world) {
    if (this.school) return Tetra.prototype.wander.call(this, world);
    return super.wander(world);
  }

  social(world) {
    return this.school ? Tetra.prototype.social.call(this, world) : [0, 0];
  }

  draw(r) {
    const b = this.body, w = b.w, z = this.z, id = this.id, sp = this.sp, nb = sp.nb;
    const k = w[0] / sp.widths[0]; // current growth/size scale
    this.drawSpine(r, 0, nb - 1, z, sp.hs, this.skin, id);
    const last = nb - 1, T = sp.tailLen * k;
    if (sp.tailJoints) {
      // Tail made of extra chain joints so it flows behind the body.
      const prof = sp.tail === 'long' ? [0.5, 0.7, 0.85, 0.9, 0.8] : sp.tail === 'fan' ? [0.35, 0.6, 1] : [0.6, 0.9, 0.7];
      for (let i = 0; i < sp.tailJoints; i++) {
        const j = last + i;
        r.tube(b.x[j], b.y[j], T * prof[i], z, b.x[j + 1], b.y[j + 1], T * prof[i + 1], z, 0.25, this.fin, id);
      }
    } else {
      // Forked or lyre tail: two flat blades.
      const a = b.a[last] + PI, spread = sp.tail === 'lyre' ? 0.55 : 0.4, len = T * (sp.tail === 'lyre' ? 1.9 : 1.4);
      for (const s of [-1, 1]) {
        const ta = a + s * spread;
        r.tube(b.x[last], b.y[last], 0.8, z, b.x[last] + Math.cos(ta) * len, b.y[last] + Math.sin(ta) * len, 0.6, z, 0.25, this.fin, id);
      }
    }
    const pj = Math.max(1, Math.round(nb * 0.25)), fin = sp.W * sp.fins * k;
    for (const s of [-1, 1]) {
      r.ellipsoid(b.px(pj, s * PI / 3, 0), b.py(pj, s * PI / 3, 0), fin, fin * 0.4, b.a[pj] - s * PI / 4, z + 0.3, 0.4, this.fin, id);
      if (sp.fins > 0.7) {
        const vj = Math.round(nb * 0.6);
        r.ellipsoid(b.px(vj, s * PI / 2, 0), b.py(vj, s * PI / 2, 0), fin * 0.55, fin * 0.22, b.a[vj] - s * PI / 4, z + 0.3, 0.4, this.fin, id);
      }
    }
    if (sp.dorsal) {
      const a0 = Math.round(nb * 0.3), a1 = Math.round(nb * 0.65), rad = sp.dorsal === 'sail' ? sp.W * 0.45 * k : 0.7;
      r.tube(b.x[a0], b.y[a0], rad, z + w[a0] * sp.hs + 0.1, b.x[a1], b.y[a1], rad * 0.6, z + w[a1] * sp.hs + 0.1, 0.4, this.fin, id);
    }
    this.drawEyes(r, 1.1, w[0] * 0.3, z + w[0] * sp.hs + 0.6, !sp.small);
  }
}

CREATE.wild = (w, x, y, a) => new WildFish(w, x, y, a.sp, a.school || null);

SPECIES.wild = {
  label: 'Wild fish', color: '#9a6ade',
  // Half the time a brand-new species is discovered; schooling species arrive as a group.
  spawn: (w, x, y) => {
    const sp = wildSpeciesFor(w);
    if (!sp.schooling) return [makeCreature('wild', w, x, y, { sp })];
    const school = { tx: x, ty: y, tz: (sp.zMin + sp.zMax) / 2, until: 0, wild: sp };
    return Array.from({ length: randi(5, 9) }, () => makeCreature('wild', w, x + rand(-8, 8), y + rand(-8, 8), { sp, school }));
  },
};
