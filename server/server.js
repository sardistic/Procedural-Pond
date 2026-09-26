'use strict';
// Procedural Pond's small API, behind the site's nginx at /api:
//   POST /api/ponds          store a pond; returns its short id (four words) and a secret key
//   PUT  /api/ponds/:id      update it (X-Pond-Key); returns the accepted points and rank
//   GET  /api/ponds/:id      a stored pond, for anyone with the link
//   GET  /api/board          the leaderboard, the high-score line and recent rare finds
//   GET  /api/health
// Plain Node with its built-in SQLite; no packages. Scores are checked for
// plausibility (they can only grow so fast), not proven: a pond runs in the
// visitor's browser, so a determined cheat can't be stopped, only slowed.

const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');
const WORDS = require('./words.js');

const PORT = +process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || './pond.db';
const MAX_BODY = 1536 * 1024;        // a save is usually 30-200 KB of JSON
const FIRST_POINTS = 20000;          // most points a newly stored pond can claim
const POINT_RATE = 15;               // most points a pond can gain per real second (big pond, 3x speed, short days)
const POINT_BURST = 2000;
const CREATES_PER_DAY = 40;          // new short links per address per day
const KEEP_DAYS = 180;               // ponds neither opened nor updated for this long are removed
const SMALL_KEEP_DAYS = 45;          // ... or this long, for ponds too small for the leaderboard
const BOARD_MIN = 50;                // points before a pond is listed
const FINDS_KEEP = 300;
const ID_RE = /^[a-z]{2,8}(?:-[a-z]{2,8}){3}$/;

const SPECIES = new Set(['koi', 'tetra', 'eel', 'axolotl', 'turtle', 'crab', 'ray', 'frog', 'snake', 'snail', 'jelly', 'clown',
  'puffer', 'octopus', 'duck', 'shrimp', 'dragonfly', 'wild', 'starfish']);
const TRAIT_RARITY = {
  pale: 1, piebald: 1, giant: 2, dwarf: 2, melanistic: 2, xanthic: 2, marbled: 2, axanthic: 3, albino: 3, leucistic: 3,
  shiny: 4, ghost: 4, glow: 4, chimera: 5, touched: 4, changed: 5, eldritch: 7,
};
const HABITATS = new Set(['fresh', 'mixed', 'salt']);

// ---- storage ----------------------------------------------------------------------

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 3000;
  CREATE TABLE IF NOT EXISTS ponds (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL,
    created INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    opened INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    board INTEGER NOT NULL DEFAULT 1,
    meta TEXT NOT NULL,
    save BLOB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ponds_board ON ponds (board, points DESC);
  CREATE TABLE IF NOT EXISTS finds (
    n INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    pond TEXT NOT NULL,
    tier INTEGER NOT NULL,
    species TEXT NOT NULL,
    traits TEXT NOT NULL,
    how TEXT NOT NULL
  );
`);

// Depth (the score): the erosion a pond reports, turned into fathoms the same way the page does.
const cols = new Set(db.prepare('PRAGMA table_info(ponds)').all().map((c) => c.name));
if (!cols.has('erosion')) db.exec('ALTER TABLE ponds ADD COLUMN erosion REAL NOT NULL DEFAULT 0');
if (!cols.has('depth')) db.exec('ALTER TABLE ponds ADD COLUMN depth INTEGER NOT NULL DEFAULT 0');
db.exec('CREATE INDEX IF NOT EXISTS ponds_depth ON ponds (board, depth DESC)');
const FATHOM_KNOTS = {
  salt: [[0, 2], [2, 8], [5, 110], [11, 550], [22, 2200], [40, 6000]],
  fresh: [[0, 1], [2, 4], [5, 60], [11, 300], [22, 900], [40, 1700]],
};
function fathomsOf(e, habitat) {
  const K = FATHOM_KNOTS[habitat === 'fresh' ? 'fresh' : 'salt'];
  let i = 0;
  while (i < K.length - 2 && e > K[i + 1][0]) i++;
  const [e0, f0] = K[i], [e1, f1] = K[i + 1];
  return Math.max(1, Math.round(f0 * (f1 / f0) ** ((e - e0) / (e1 - e0))));
}
const EROSION_RATE = 0.02;  // most erosion a pond can add per real second
const EROSION_BURST = 3;
const FIRST_EROSION = 30;

const q = {
  get: db.prepare('SELECT * FROM ponds WHERE id = ?'),
  exists: db.prepare('SELECT 1 FROM ponds WHERE id = ?'),
  insert: db.prepare('INSERT INTO ponds (id, key_hash, created, updated, opened, points, board, meta, save, erosion, depth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  update: db.prepare('UPDATE ponds SET updated = ?, points = ?, board = ?, meta = ?, save = ?, erosion = ?, depth = ? WHERE id = ?'),
  opened: db.prepare('UPDATE ponds SET opened = ? WHERE id = ?'),
  rank: db.prepare(`SELECT COUNT(*) AS n FROM ponds WHERE board = 1 AND points >= ${BOARD_MIN} AND (depth > ? OR (depth = ? AND points > ?))`),
  top: db.prepare(`SELECT id, points, depth, meta, updated FROM ponds WHERE board = 1 AND points >= ${BOARD_MIN} ORDER BY depth DESC, points DESC, created ASC LIMIT 20`),
  count: db.prepare(`SELECT COUNT(*) AS n FROM ponds WHERE board = 1 AND points >= ${BOARD_MIN}`),
  addFind: db.prepare('INSERT INTO finds (at, pond, tier, species, traits, how) VALUES (?, ?, ?, ?, ?, ?)'),
  finds: db.prepare('SELECT at, pond, tier, species, traits, how FROM finds ORDER BY n DESC LIMIT 20'),
  trimFinds: db.prepare('DELETE FROM finds WHERE n <= (SELECT MAX(n) FROM finds) - ?'),
  prune: db.prepare(`DELETE FROM ponds WHERE (updated < ? AND opened < ?) OR (points < ${BOARD_MIN} AND updated < ? AND opened < ?)`),
};

// ---- input -----------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || 0));
const tierOf = (traits) => {
  const s = traits.reduce((a, t) => a + TRAIT_RARITY[t], 0);
  return s === 0 ? 0 : s === 1 ? 1 : s <= 3 ? 2 : s <= 5 ? 3 : s <= 7 ? 4 : 5;
};

// A find is rebuilt from known words only; its tier is worked out here, not taken on trust.
function cleanFind(f) {
  if (!f || typeof f !== 'object' || !SPECIES.has(f.species) || !Array.isArray(f.traits)) return null;
  const traits = [...new Set(f.traits.filter((t) => Object.hasOwn(TRAIT_RARITY, t)))].slice(0, 6);
  if (!traits.length) return null;
  return { tier: tierOf(traits), species: f.species, traits, how: f.how === 'born' ? 'born' : 'arrived' };
}

function cleanMeta(m) {
  if (!m || typeof m !== 'object') m = {};
  return {
    points: int(m.points, 0, 1e12), erosion: Math.max(0, Math.min(500, Number(m.erosion) || 0)), animals: int(m.animals, 0, 5000), species: int(m.species, 0, 200), rares: int(m.rares, 0, 5000),
    gen: int(m.gen, 0, 100000), days: Math.max(0, Math.min(1e7, Math.round((Number(m.days) || 0) * 100) / 100)),
    habitat: HABITATS.has(m.habitat) ? m.habitat : 'mixed', board: m.board !== false, best: cleanFind(m.best),
    finds: Array.isArray(m.finds) ? m.finds.slice(0, 5).map(cleanFind).filter((f) => f && f.tier >= 2) : [],
  };
}

// The pond itself is only stored and handed back; the page that opens it checks it again.
function cleanSave(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s) || s.v !== 1 || typeof s.seed !== 'string' || !/^[a-z0-9-]{1,40}$/.test(s.seed) ||
      !Array.isArray(s.creatures) || !Array.isArray(s.plants) || !Array.isArray(s.rocks) || !Array.isArray(s.size)) {
    throw new HttpError(400, 'not a pond');
  }
  delete s.link; // never store a key
  return zlib.deflateRawSync(Buffer.from(JSON.stringify(s)));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { reject(new HttpError(415, 'send JSON')); return; }
    const chunks = [];
    let size = 0;
    // Past the limit, keep reading (and dropping) so the client still gets a 413;
    // nginx stops anything much larger before it gets here.
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
      else if (size > MAX_BODY * 4) req.destroy();
    });
    req.on('end', () => {
      if (size > MAX_BODY) { reject(new HttpError(413, 'pond too large')); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'bad JSON')); }
    });
    req.on('close', () => reject(new HttpError(400, 'request closed')));
    req.on('error', reject);
  });
}

const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');
function keyMatches(row, key) {
  if (typeof key !== 'string' || key.length < 16 || key.length > 64) return false;
  const a = Buffer.from(hashKey(key), 'hex'), b = Buffer.from(row.key_hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const newId = () => Array.from({ length: 4 }, () => WORDS[crypto.randomInt(WORDS.length)]).join('-');

// New links per address per day (the address comes from Cloudflare via nginx).
const creates = new Map();
function allowCreate(ip) {
  const day = Math.floor(Date.now() / 864e5), e = creates.get(ip);
  if (!e || e.day !== day) { creates.set(ip, { day, n: 1 }); return true; }
  return ++e.n <= CREATES_PER_DAY;
}

// ---- handlers ----------------------------------------------------------------------------

// Place on the leaderboard, or null for ponds that aren't listed (opted out, or too small yet).
function rankOf(row) {
  return row.board && row.points >= BOARD_MIN ? q.rank.get(row.depth, row.depth, row.points).n + 1 : null;
}

function addFinds(id, finds, now) {
  for (const f of finds) q.addFind.run(now, id, f.tier, f.species, f.traits.join(','), f.how);
  if (finds.length) { q.trimFinds.run(FINDS_KEEP); boardCache = null; }
}

const publicMeta = ({ finds, ...m }) => m;

async function createPond(req) {
  if (!allowCreate(req.ip)) throw new HttpError(429, 'too many new links today');
  const body = await readJson(req), meta = cleanMeta(body.meta), save = cleanSave(body.save), now = Date.now();
  const key = crypto.randomBytes(18).toString('base64url');
  const points = Math.min(meta.points, FIRST_POINTS), erosion = Math.min(meta.erosion, FIRST_EROSION), depth = fathomsOf(erosion, meta.habitat);
  for (let i = 0; i < 12; i++) {
    const id = newId();
    if (q.exists.get(id)) continue;
    q.insert.run(id, hashKey(key), now, now, now, points, meta.board ? 1 : 0, JSON.stringify(publicMeta({ ...meta, points, erosion, depth })), save, erosion, depth);
    addFinds(id, meta.finds, now);
    boardCache = null;
    return [201, { id, key, points, depth, rank: rankOf({ board: meta.board, points, depth }), high: board().high }];
  }
  throw new HttpError(503, 'no free link, try again');
}

async function updatePond(req, id) {
  const row = q.get.get(id);
  if (!row) throw new HttpError(404, 'no such pond');
  if (!keyMatches(row, req.headers['x-pond-key'])) throw new HttpError(403, 'not your pond');
  const body = await readJson(req), meta = cleanMeta(body.meta), save = cleanSave(body.save), now = Date.now();
  // Scores grow only so fast: a claim is capped by what the time since the last update allows.
  const allowed = row.points + POINT_RATE * Math.max(0, (now - row.updated) / 1000) + POINT_BURST;
  const points = Math.min(meta.points, Math.floor(allowed));
  // Depth too can only grow so fast.
  const erosion = Math.min(meta.erosion, (row.erosion || 0) + EROSION_RATE * Math.max(0, (now - row.updated) / 1000) + EROSION_BURST), depth = fathomsOf(erosion, meta.habitat);
  q.update.run(now, points, meta.board ? 1 : 0, JSON.stringify(publicMeta({ ...meta, points, erosion, depth })), save, erosion, depth, id);
  addFinds(id, meta.finds, now);
  if (meta.board) boardCache = null;
  return [200, { ok: true, points, depth, rank: rankOf({ board: meta.board, points, depth }), high: board().high }];
}

function getPond(id) {
  const row = q.get.get(id);
  if (!row) throw new HttpError(404, 'no such pond');
  const now = Date.now();
  if (now - row.opened > 36e5) q.opened.run(now, id);
  const save = JSON.parse(zlib.inflateRawSync(row.save).toString('utf8'));
  return [200, { id, save, meta: JSON.parse(row.meta), updated: row.updated }];
}

// The top twenty, the high-score line (tenth place), and the latest rare finds.
let boardCache = null;
function board() {
  if (boardCache && Date.now() - boardCache.at < 15000) return boardCache.data;
  const top = q.top.all().map((r) => {
    const m = JSON.parse(r.meta);
    return { id: r.id, points: r.points, depth: r.depth, updated: r.updated, animals: m.animals, species: m.species, rares: m.rares, gen: m.gen, days: m.days, habitat: m.habitat, best: m.best };
  });
  const finds = q.finds.all().map((f) => ({ at: f.at, pond: f.pond, tier: f.tier, species: f.species, traits: f.traits.split(','), how: f.how }));
  const data = { top, high: top.length >= 10 ? top[9].depth : 0, finds, ponds: q.count.get().n };
  boardCache = { at: Date.now(), data };
  return data;
}

async function route(req) {
  const path = new URL(req.url, 'http://pond').pathname;
  if (path === '/api/health' && req.method === 'GET') return [200, { ok: true }];
  if (path === '/api/board' && req.method === 'GET') return [200, board()];
  if (path === '/api/ponds' && req.method === 'POST') return createPond(req);
  const m = /^\/api\/ponds\/([a-z-]{11,35})$/.exec(path);
  if (m && ID_RE.test(m[1])) {
    if (req.method === 'GET') return getPond(m[1]);
    if (req.method === 'PUT') return updatePond(req, m[1]);
    throw new HttpError(405, 'method not allowed');
  }
  throw new HttpError(404, 'not found');
}

const server = http.createServer(async (req, res) => {
  req.ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
  let status, body;
  try {
    [status, body] = await route(req);
  } catch (e) {
    status = e instanceof HttpError ? e.status : 500;
    body = { error: e instanceof HttpError ? e.message : 'server error' };
    if (status === 500) console.error(new Date().toISOString(), req.method, req.url, e);
  }
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
  res.end(text);
});
server.requestTimeout = 20000;
server.headersTimeout = 10000;

function prune() {
  const cut = Date.now() - KEEP_DAYS * 864e5, small = Date.now() - SMALL_KEEP_DAYS * 864e5;
  const n = q.prune.run(cut, cut, small, small).changes;
  if (n) console.log(new Date().toISOString(), `removed ${n} unused ponds`);
  creates.clear();
}
prune();
setInterval(prune, 864e5).unref();

server.listen(PORT, () => console.log(`pond api on :${PORT}, ${DB_PATH}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
