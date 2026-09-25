'use strict';
// Math helpers, value noise, colors, and the joint chain that every animal is built on.

const PI = Math.PI, TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function wrapAngle(a) {
  a = (a + PI) % TAU;
  if (a < 0) a += TAU;
  return a - PI;
}

// Keep `angle` within `limit` radians of `anchor` (the chain's bend constraint).
function constrainAngle(angle, anchor, limit) {
  return anchor + clamp(wrapAngle(angle - anchor), -limit, limit);
}

// ---- seeds ---------------------------------------------------------------
// A pond is generated from a seed, so the same link reproduces the same layout
// and starting animals. The simulation after that is free-running.

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Run fn with Math.random temporarily driven by a seeded generator.
function withSeed(seed, fn) {
  const original = Math.random;
  Math.random = mulberry32(hashString(String(seed)));
  try { return fn(); } finally { Math.random = original; }
}

const SEED_WORDS = [
  ['amber', 'misty', 'quiet', 'mossy', 'sunlit', 'drowsy', 'glassy', 'reedy', 'lotus', 'pebbled', 'jade', 'twilight', 'hidden', 'silver', 'willow', 'copper'],
  ['reed', 'lily', 'pebble', 'ripple', 'heron', 'marsh', 'brook', 'fern', 'lantern', 'cove', 'basin', 'spring', 'lagoon', 'hollow', 'mire', 'shallows'],
];
const newSeedName = () => `${pick(SEED_WORDS[0])}-${pick(SEED_WORDS[1])}-${randi(1, 99)}`;

// ---- noise ---------------------------------------------------------------

function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let xf = x - xi, yf = y - yi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
}

function fbm(x, y, s = 0) {
  return vnoise(x, y, s) * 0.57 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.29 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.14;
}

// Precompute a pattern shader (u, v) -> material into a lookup table, since
// evaluating noise per pixel per frame is the renderer's hottest path.
// u spans [u0, 1], v spans [-1, 1].
function bakeShader(fn, nu = 64, nv = 16, u0 = 0) {
  const T = new Array(nu * nv), su = nu / (1 - u0), sv = nv / 2;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) T[i + j * nu] = fn(u0 + (i + 0.5) / su, (j + 0.5) / sv - 1);
  }
  const shader = (u, v) => {
    let i = ((u - u0) * su) | 0, j = ((v + 1) * sv) | 0;
    i = i < 0 ? 0 : i >= nu ? nu - 1 : i;
    j = j < 0 ? 0 : j >= nv ? nv - 1 : j;
    return T[i + j * nu];
  };
  shader.table = T; // exposed so an individual's genes can re-dye it
  return shader;
}

// ---- colors (packed ABGR for a little-endian Uint32 view of ImageData) ----

function hexToInt(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
}

function mixColor(c1, c2, t) {
  const r = Math.round(lerp(c1 & 255, c2 & 255, t));
  const g = Math.round(lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t));
  const b = Math.round(lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t));
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

function rgbToHsl(c) {
  const r = (c & 255) / 255, g = ((c >> 8) & 255) / 255, b = ((c >> 16) & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return (0xff000000 | (Math.round((b + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((r + m) * 255)) >>> 0;
}

// Nudge hue h toward target by up to amt degrees (the short way round).
const hueToward = (h, target, amt) => h + clamp(((target - h + 540) % 360) - 180, -amt, amt);

// A pixel-art material ramp from one colour: shadows drift toward blue, highlights toward yellow.
function ramp(h, s, l) {
  return [
    hsl(hueToward(h, 240, 22), s * 0.85, l - 0.24),
    hsl(hueToward(h, 240, 10), s * 0.95, l - 0.12),
    hsl(h, s, l),
    hsl(hueToward(h, 60, 14), s * 0.85, Math.min(0.94, l + 0.15)),
  ];
}

// A material is four shades: [shadow, mid, base, highlight].
const mat = (...hex) => hex.map(hexToInt);
const solid = (hex) => mat(hex, hex, hex, hex);

// 75% brightness, used for cast shadows.
const shadeColor = (c) => ((0xff000000 | (((c & 0xfefefe) >>> 1) + ((c & 0xfcfcfc) >>> 2))) >>> 0);

// ---- chain ---------------------------------------------------------------
// Joint 0 is the head. Each joint stays a fixed distance behind the previous
// one, and each link may only bend `constraint` radians from the link ahead.

class Chain {
  constructor(x, y, heading, links, widths, constraint) {
    this.n = links.length + 1;
    this.links = links;
    this.w = widths;
    this.constraint = constraint;
    this.x = new Float64Array(this.n);
    this.y = new Float64Array(this.n);
    this.a = new Float64Array(this.n);
    this.place(x, y, heading);
  }

  place(x, y, heading) {
    this.x[0] = x; this.y[0] = y; this.a[0] = heading;
    for (let i = 1; i < this.n; i++) {
      this.a[i] = heading;
      this.x[i] = this.x[i - 1] - Math.cos(heading) * this.links[i - 1];
      this.y[i] = this.y[i - 1] - Math.sin(heading) * this.links[i - 1];
    }
  }

  resolve(x, y, heading) {
    const { x: X, y: Y, a: A, links } = this;
    X[0] = x; Y[0] = y; A[0] = heading;
    for (let i = 1; i < this.n; i++) {
      const cur = Math.atan2(Y[i - 1] - Y[i], X[i - 1] - X[i]);
      A[i] = constrainAngle(cur, A[i - 1], this.constraint);
      X[i] = X[i - 1] - Math.cos(A[i]) * links[i - 1];
      Y[i] = Y[i - 1] - Math.sin(A[i]) * links[i - 1];
    }
  }

  // FABRIK: pin joint 0 at the base and pull the last joint toward (tx, ty).
  // Slack in the chain keeps the previous shape, so arms curl naturally.
  reach(bx, by, tx, ty) {
    const { x: X, y: Y, a: A, links, n } = this;
    X[n - 1] = tx; Y[n - 1] = ty;
    for (let i = n - 2; i >= 0; i--) {
      const dx = X[i] - X[i + 1], dy = Y[i] - Y[i + 1], d = Math.hypot(dx, dy) || 1e-6;
      X[i] = X[i + 1] + dx / d * links[i]; Y[i] = Y[i + 1] + dy / d * links[i];
    }
    X[0] = bx; Y[0] = by;
    for (let i = 1; i < n; i++) {
      const dx = X[i] - X[i - 1], dy = Y[i] - Y[i - 1], d = Math.hypot(dx, dy) || 1e-6;
      X[i] = X[i - 1] + dx / d * links[i - 1]; Y[i] = Y[i - 1] + dy / d * links[i - 1];
      A[i] = Math.atan2(-dy, -dx);
    }
    A[0] = A[1];
  }

  // Point on the body outline: joint i, rotated `off` from its facing, `len` past its radius.
  px(i, off, len) { return this.x[i] + Math.cos(this.a[i] + off) * (this.w[i] + len); }
  py(i, off, len) { return this.y[i] + Math.sin(this.a[i] + off) * (this.w[i] + len); }
}

// Analytic two-bone IK. Returns [elbowX, elbowY, footX, footY]; the foot is
// pulled in if out of reach. bend = +1/-1 picks which side the elbow sits on.
function solveLimb(sx, sy, fx, fy, l1, l2, bend) {
  let dx = fx - sx, dy = fy - sy;
  let d = Math.hypot(dx, dy) || 1e-6;
  const max = (l1 + l2) * 0.999;
  if (d > max) { fx = sx + dx / d * max; fy = sy + dy / d * max; d = max; }
  d = Math.max(d, Math.abs(l1 - l2) + 1e-3);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const a = Math.atan2(dy, dx) + bend * Math.acos(cosA);
  return [sx + Math.cos(a) * l1, sy + Math.sin(a) * l1, fx, fy];
}
