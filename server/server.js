'use strict';
// Procedural Pond's small API, behind the site's nginx at /api:
//   POST /api/ponds          store a pond; returns its short id (four words) and a secret key
//   PUT  /api/ponds/:id      update it (X-Pond-Key); returns the accepted points and rank
//   GET  /api/ponds/:id      a stored pond, for anyone with the link (by its id, or by its address: its name, see slug.js)
//   GET  /api/board          the leaderboard, the high-score line and recent rare finds
//   GET  /api/neighbours     the ponds on either side of one along the shared beach (?id=)
//   GET  /api/health
//   GET  /api/auth/discord   sign in with Discord (then /api/auth/discord/callback); GET /api/me, POST /api/logout
//   POST /api/me/claim       keep a pond (its id and key) under the signed-in account
//   POST /api/wanderers      a fierce animal leaving a pond joins the pool; POST /api/wanderers/take calls one up
// Each pond counts its visitors (one view per address per pond every six hours);
// the owner hears the count back, and popular ponds draw more litter.
// Plain Node with its built-in SQLite; no packages. Scores are checked for
// plausibility (they can only grow so fast), not proven: a pond runs in the
// visitor's browser, so a determined cheat can't be stopped, only slowed.

const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');
const WORDS = require('./words.js');
const { cleanTitle, nameAllowed } = require('./namefilter.js');
const { slugify, slugOk } = require('./slug.js');
const { createMindService } = require('./minds.js');
const minds = createMindService();
const { createFlyBrainService } = require('./flybrain.js');
const flyBrain = createFlyBrainService();
const { createFishBrainService } = require('./fishbrain.js');
const fishBrain = createFishBrainService();

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
// A pond's address is its name (pond.nz/moonlit-reef): its title, or its seed name if it has none (slug.js), kept
// unique; the last few addresses it has had stay its own, so old links still find it (and renaming again and again
// can't hold every name).
const SLUGS_KEEP = 8;
// The season (the page's SAVE_EPOCH): after a reset, a pond is taken only from a page of this season, so a page
// left open from before (with an old pond in it) can't bring it back.
const EPOCH = 2;
const fromThisSeason = (body) => !!body && !!body.meta && body.meta.epoch === EPOCH;
const WANDER_KEEP_DAYS = 14;         // a wanderer nobody calls up is gone after this
const WANDER_MAX = 400;              // the most kept in the pool
const WANDER_SENDS_PER_HOUR = 8;     // per pond
const WANDER_TAKES_PER_HOUR = 20;    // per address

// ---- accounts ----------------------------------------------------------------------
// Signing in is optional, and off until DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are set: then
// /api/auth/discord sends the visitor to Discord (scope "identify": the name and avatar only) and
// the callback starts a session, a random token in an HttpOnly cookie with only its hash stored.
// A signed-in owner can update their ponds from any browser without the pond's key, their ponds
// are never pruned, and they can choose to show their name on a pond.
const DISCORD = {
  id: process.env.DISCORD_CLIENT_ID || '', secret: process.env.DISCORD_CLIENT_SECRET || '',
  api: (process.env.DISCORD_API || 'https://discord.com/api/v10').replace(/\/$/, ''),
  authorize: process.env.DISCORD_AUTHORIZE || 'https://discord.com/oauth2/authorize',
};
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://pond.nz').replace(/\/$/, '');
const AUTH_ON = !!(DISCORD.id && DISCORD.secret);
const SESSION_DAYS = 60;
const SESSION_COOKIE = 'pond_session', STATE_COOKIE = 'pond_oauth';
const SECURE = PUBLIC_URL.startsWith('https:') ? '; Secure' : '';

const SPECIES = new Set(['koi', 'tetra', 'eel', 'axolotl', 'turtle', 'crab', 'ray', 'frog', 'snake', 'snail', 'jelly', 'clown',
  'puffer', 'octopus', 'duck', 'shrimp', 'dragonfly', 'wild', 'starfish',
  'shark', 'sandshark', 'angler', 'gulper', 'vampire', 'isopod', 'catfish', 'cavefish', 'olm', 'kraken', 'leviathan', 'watcher',
  'snailfish', 'frilled', 'boneeel', 'siphon', 'squid', 'deepone', 'sleeper',
  'trilobite', 'anomalocaris', 'ammonite', 'eurypterid', 'lungfish', 'dunkleosteus', 'coelacanth', 'placoderm', 'temnospondyl', 'plesiosaur', 'mosasaur', 'hyneria',
  // the bestiary (js/bestiary.js)
  'mandarin', 'tang', 'lionfish', 'seahorse', 'moray', 'hermit', 'cleaner', 'nudibranch', 'goldfish', 'guppy', 'betta', 'loach', 'crayfish', 'newt', 'pleco', 'pike', 'lanternfish', 'hatchetfish', 'combjelly', 'sturgeon', 'burbot', 'paddlefish', 'viperfish', 'dragonfish', 'oarfish', 'cavecrab', 'glassfish', 'cavesalamander', 'barreleye', 'tripodfish', 'seaspider', 'wraithcarp', 'belljelly', 'choirfish', 'amphipod', 'cuskeel', 'cryptcrab', 'shroudfish', 'firesquid', 'swallower', 'rootcrawler', 'lampeel', 'gargoyle', 'lanternjelly', 'bellwarden', 'runefish', 'dreamer', 'thoughtfish', 'opabinia', 'helicoprion', 'arandaspis', 'tiktaalik', 'glasseel', 'voidmanta', 'lattice', 'starfin', 'hollowwalker', 'mirrorfish']);
const TRAIT_RARITY = {
  pale: 1, piebald: 1, giant: 2, dwarf: 2, melanistic: 2, xanthic: 2, marbled: 2, axanthic: 3, albino: 3, leucistic: 3,
  shiny: 4, ghost: 4, glow: 4, chimera: 5, touched: 4, changed: 5, eldritch: 7,
  // the evolved (alien.js): each alone makes a find Mythic
  chitinous: 8, frenzied: 8, luminous: 8, longcoiled: 8, bloomborn: 8, sporebearing: 8,
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
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    created INTEGER NOT NULL,
    seen INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    hash TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    created INTEGER NOT NULL,
    expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS wanderers (
    n INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    pond TEXT NOT NULL,
    kind TEXT NOT NULL,
    data TEXT NOT NULL
  );
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
if (!cols.has('views')) db.exec('ALTER TABLE ponds ADD COLUMN views INTEGER NOT NULL DEFAULT 0');
if (!cols.has('owner')) db.exec('ALTER TABLE ponds ADD COLUMN owner TEXT');
if (!cols.has('show_owner')) db.exec('ALTER TABLE ponds ADD COLUMN show_owner INTEGER NOT NULL DEFAULT 0');
if (!cols.has('slug')) db.exec('ALTER TABLE ponds ADD COLUMN slug TEXT');
db.exec('CREATE TABLE IF NOT EXISTS slugs (slug TEXT PRIMARY KEY, id TEXT NOT NULL, at INTEGER NOT NULL)');
db.exec('CREATE INDEX IF NOT EXISTS slugs_id ON slugs (id)');
db.exec('CREATE INDEX IF NOT EXISTS ponds_owner ON ponds (owner)');
db.exec('CREATE INDEX IF NOT EXISTS ponds_depth ON ponds (board, depth DESC)');
const FATHOM_KNOTS = {
  salt: [[0, 2], [2, 8], [5, 110], [11, 550], [22, 2200], [40, 6000], [70, 20000], [120, 80000], [200, 400000]],
  fresh: [[0, 1], [2, 4], [5, 60], [11, 300], [22, 900], [40, 1700], [70, 6000], [120, 24000], [200, 120000]],
};
const FATHOM_TAIL = { salt: 2000, fresh: 600 };
function fathomsOf(e, habitat) {
  const b = habitat === 'fresh' ? 'fresh' : 'salt', K = FATHOM_KNOTS[b], last = K[K.length - 1];
  if (e > last[0]) return Math.round(last[1] + (e - last[0]) * FATHOM_TAIL[b]);
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
  view: db.prepare('UPDATE ponds SET views = views + 1 WHERE id = ?'),
  ring: db.prepare('SELECT id, slug, depth, points, meta FROM ponds WHERE updated > ? ORDER BY created ASC, id ASC'),
  rank: db.prepare(`SELECT COUNT(*) AS n FROM ponds WHERE board = 1 AND points >= ${BOARD_MIN} AND (depth > ? OR (depth = ? AND points > ?))`),
  top: db.prepare(`SELECT id, slug, points, depth, meta, updated FROM ponds WHERE board = 1 AND points >= ${BOARD_MIN} ORDER BY depth DESC, points DESC, created ASC LIMIT 20`),
  count: db.prepare(`SELECT COUNT(*) AS n FROM ponds WHERE board = 1 AND points >= ${BOARD_MIN}`),
  addFind: db.prepare('INSERT INTO finds (at, pond, tier, species, traits, how) VALUES (?, ?, ?, ?, ?, ?)'),
  finds: db.prepare('SELECT at, pond, tier, species, traits, how FROM finds ORDER BY n DESC LIMIT 20'),
  trimFinds: db.prepare('DELETE FROM finds WHERE n <= (SELECT MAX(n) FROM finds) - ?'),
  prune: db.prepare(`DELETE FROM ponds WHERE owner IS NULL AND ((updated < ? AND opened < ?) OR (points < ${BOARD_MIN} AND updated < ? AND opened < ?))`),
  setMeta: db.prepare('UPDATE ponds SET meta = ? WHERE id = ?'),
  slugGet: db.prepare('SELECT id FROM slugs WHERE slug = ?'),
  slugPut: db.prepare('INSERT INTO slugs (slug, id, at) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET at = excluded.at'),
  slugTrim: db.prepare(`DELETE FROM slugs WHERE id = ? AND slug NOT IN (SELECT slug FROM slugs WHERE id = ? ORDER BY at DESC LIMIT ${SLUGS_KEEP})`),
  setSlug: db.prepare('UPDATE ponds SET slug = ? WHERE id = ?'),
  pruneSlugs: db.prepare('DELETE FROM slugs WHERE id NOT IN (SELECT id FROM ponds)'),
  setOwner: db.prepare('UPDATE ponds SET owner = ?, show_owner = ?, meta = ? WHERE id = ?'),
  setShow: db.prepare('UPDATE ponds SET show_owner = ? WHERE id = ?'),
  owned: db.prepare('SELECT id, slug, points, depth, updated, meta, show_owner FROM ponds WHERE owner = ? ORDER BY updated DESC LIMIT 50'),
  ownedShown: db.prepare('SELECT id, meta FROM ponds WHERE owner = ? AND show_owner = 1'),
  user: db.prepare('SELECT * FROM users WHERE id = ?'),
  upsertUser: db.prepare('INSERT INTO users (id, name, avatar, created, seen) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, seen = excluded.seen'),
  addSession: db.prepare('INSERT INTO sessions (hash, user, created, expires) VALUES (?, ?, ?, ?)'),
  session: db.prepare('SELECT u.id, u.name, u.avatar FROM sessions s JOIN users u ON u.id = s.user WHERE s.hash = ? AND s.expires > ?'),
  dropSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
  pruneSessions: db.prepare('DELETE FROM sessions WHERE expires < ?'),
  addWanderer: db.prepare('INSERT INTO wanderers (at, pond, kind, data) VALUES (?, ?, ?, ?)'),
  trimWanderers: db.prepare('DELETE FROM wanderers WHERE n <= (SELECT MAX(n) FROM wanderers) - ?'),
  wandererPool: db.prepare('SELECT n, pond, kind FROM wanderers WHERE at > ? AND pond != ?'),
  wanderer: db.prepare('SELECT * FROM wanderers WHERE n = ?'),
  dropWanderer: db.prepare('DELETE FROM wanderers WHERE n = ?'),
  pruneWanderers: db.prepare('DELETE FROM wanderers WHERE at < ?'),
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
    points: int(m.points, 0, 1e12), erosion: Math.max(0, Math.min(1e7, Number(m.erosion) || 0)), animals: int(m.animals, 0, 5000), species: int(m.species, 0, 200), rares: int(m.rares, 0, 5000),
    gen: int(m.gen, 0, 100000), days: Math.max(0, Math.min(1e7, Math.round((Number(m.days) || 0) * 100) / 100)),
    habitat: HABITATS.has(m.habitat) ? m.habitat : 'mixed', board: m.board !== false, best: cleanFind(m.best),
    lock: m.lock === true, // the owner lets visitors look only (no copies of their own)
    showName: m.showName === true, // a signed-in owner shows their name on it (the name itself comes from the account, never from here)
    title: cleanTitle(m.title), // a name the owner gave it (null if none, or not allowed: see namefilter.js)
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

const publicMeta = ({ finds, showName, ...m }) => m;
// The address a pond wants: its title's, or else its seed name's (both through the name filter: a seed comes from
// the page, and a page can send anything), or none (its id is its address).
function wantSlug(meta, seed) {
  for (const name of [meta.title, seed]) {
    const s = name ? slugify(name) : '';
    if (slugOk(s) && nameAllowed(s.replace(/-/g, ' '))) return s;
  }
  return '';
}
// Give it that address, or the first free numbered one (moonlit-reef-2...); an address is never another pond's
// (nor another's id), and its last SLUGS_KEEP stay its own. Returns its address now (or null: none).
function assignSlug(id, want, current) {
  if (!want) return current || null;
  if (current && (current === want || (current.replace(/-\d+$/, '') === want && /-\d+$/.test(current)))) return current;
  for (let n = 1; n <= 99; n++) {
    const s = n === 1 ? want : `${want}-${n}`;
    if (s !== id && ID_RE.test(s) && q.exists.get(s)) continue;
    const has = q.slugGet.get(s);
    if (has && has.id !== id) continue;
    q.slugPut.run(s, id, Date.now()); // (its own, or free: newest first)
    q.slugTrim.run(id, id);
    q.setSlug.run(s, id);
    return s;
  }
  return current || null;
}
// A pond by its id or by any address it has had.
function pondIdOf(key) {
  if (ID_RE.test(key) && q.exists.get(key)) return key;
  const has = q.slugGet.get(key);
  return has ? has.id : null;
}
// The owner's name, when they've chosen to show it on this pond.
const byOf = (owner, show) => { if (!owner || !show) return undefined; const u = q.user.get(owner); return u ? u.name : undefined; };

async function createPond(req) {
  if (!allowCreate(req.ip)) throw new HttpError(429, 'too many new links today');
  const body = await readJson(req);
  if (!fromThisSeason(body)) throw new HttpError(409, 'this page is from before the reset: reload it');
  const meta = cleanMeta(body.meta), save = cleanSave(body.save), now = Date.now();
  const key = crypto.randomBytes(18).toString('base64url');
  const points = Math.min(meta.points, FIRST_POINTS), erosion = Math.min(meta.erosion, FIRST_EROSION), depth = fathomsOf(erosion, meta.habitat);
  for (let i = 0; i < 12; i++) {
    const id = newId();
    if (q.exists.get(id) || q.slugGet.get(id)) continue; // (nor an address some pond already has)
    q.insert.run(id, hashKey(key), now, now, now, points, meta.board ? 1 : 0, JSON.stringify(publicMeta({ ...meta, points, erosion, depth })), save, erosion, depth);
    addFinds(id, meta.finds, now);
    const slug = assignSlug(id, wantSlug(meta, body.save.seed), null);
    boardCache = null;
    return [201, { id, key, slug, points, depth, views: 0, rank: rankOf({ board: meta.board, points, depth }), high: board().high, title: meta.title }];
  }
  throw new HttpError(503, 'no free link, try again');
}

async function updatePond(req, id) {
  const row = q.get.get(id);
  if (!row) throw new HttpError(404, 'no such pond');
  // Its key, or its signed-in owner (from any browser).
  if (!keyMatches(row, req.headers['x-pond-key']) && !ownsRow(req, row)) throw new HttpError(403, 'not your pond');
  const body = await readJson(req);
  if (!fromThisSeason(body)) throw new HttpError(409, 'this page is from before the reset: reload it');
  const meta = cleanMeta(body.meta), save = cleanSave(body.save), now = Date.now();
  if (row.owner) { q.setShow.run(meta.showName ? 1 : 0, id); meta.by = byOf(row.owner, meta.showName); }
  // Scores grow only so fast: a claim is capped by what the time since the last update allows.
  const allowed = row.points + POINT_RATE * Math.max(0, (now - row.updated) / 1000) + POINT_BURST;
  const points = Math.min(meta.points, Math.floor(allowed));
  // Depth too can only grow so fast.
  const erosion = Math.min(meta.erosion, (row.erosion || 0) + EROSION_RATE * Math.max(0, (now - row.updated) / 1000) + EROSION_BURST), depth = fathomsOf(erosion, meta.habitat);
  q.update.run(now, points, meta.board ? 1 : 0, JSON.stringify(publicMeta({ ...meta, points, erosion, depth })), save, erosion, depth, id);
  addFinds(id, meta.finds, now);
  const slug = assignSlug(id, wantSlug(meta, body.save.seed), row.slug);
  if (slug !== row.slug) ringCache = null;
  if (meta.board || slug !== row.slug) boardCache = null;
  return [200, { ok: true, slug, points, depth, views: row.views || 0, rank: rankOf({ board: meta.board, points, depth }), high: board().high, title: meta.title }];
}

// One view per address per pond every six hours (observers re-fetch every minute).
const viewSeen = new Map();
const VIEW_GAP = 6 * 36e5;
function countView(ip, id, now) {
  const k = `${ip}|${id}`, at = viewSeen.get(k);
  if (at && now - at < VIEW_GAP) return;
  if (viewSeen.size > 50000) for (const [key, t] of viewSeen) if (now - t > VIEW_GAP) viewSeen.delete(key);
  viewSeen.set(k, now);
  q.view.run(id);
}

// A peek (the neighbour drawn past the end of someone's beach) is not a visit: it neither
// counts a view nor keeps the pond from expiring.
function getPond(req, key, peek) {
  const id = pondIdOf(key), row = id && q.get.get(id);
  if (!row) throw new HttpError(404, 'no such pond');
  const now = Date.now(), u = userOf(req), mine = !!(u && row.owner === u.id); // (its owner coming back is no visitor)
  if (!peek) {
    if (now - row.opened > 36e5) q.opened.run(now, id);
    if (!mine) countView(req.ip, id, now);
  }
  const save = JSON.parse(zlib.inflateRawSync(row.save).toString('utf8'));
  return [200, { id, slug: row.slug || null, save, meta: JSON.parse(row.meta), updated: row.updated, views: (row.views || 0) + (peek || mine ? 0 : 1), mine }];
}

// The shared beach: every pond active in the last month, in the order they were
// made, in a ring. A pond's neighbours are the ones either side of it; without
// one (a pond with no link yet), the newest and oldest ends meet around it.
let ringCache = null;
function neighbours(id) {
  if (!ringCache || Date.now() - ringCache.at > 30000) ringCache = { at: Date.now(), rows: q.ring.all(Date.now() - 30 * 864e5) };
  const rows = ringCache.rows, n = rows.length, i = id ? rows.findIndex((r) => r.id === id) : -1;
  const side = (r) => {
    if (!r || r.id === id) return null;
    const m = JSON.parse(r.meta);
    return { id: r.id, slug: r.slug || null, depth: r.depth, points: r.points, habitat: m.habitat, animals: m.animals, by: m.by, title: m.title || null };
  };
  if (!n) return { west: null, east: null };
  if (i < 0) return { west: side(rows[n - 1]), east: side(rows[0]) };
  return { west: n > 1 ? side(rows[(i - 1 + n) % n]) : null, east: n > 2 ? side(rows[(i + 1) % n]) : null };
}

// The top twenty, the high-score line (tenth place), and the latest rare finds.
let boardCache = null;
function board() {
  if (boardCache && Date.now() - boardCache.at < 15000) return boardCache.data;
  const top = q.top.all().map((r) => {
    const m = JSON.parse(r.meta);
    return { id: r.id, slug: r.slug || null, points: r.points, depth: r.depth, updated: r.updated, animals: m.animals, species: m.species, rares: m.rares, gen: m.gen, days: m.days, habitat: m.habitat, best: m.best, by: m.by, title: m.title || null };
  });
  const finds = q.finds.all().map((f) => ({ at: f.at, pond: f.pond, tier: f.tier, species: f.species, traits: f.traits.split(','), how: f.how }));
  const data = { top, high: top.length >= 10 ? top[9].depth : 0, finds, ponds: q.count.get().n };
  boardCache = { at: Date.now(), data };
  return data;
}

// ---- sessions ------------------------------------------------------------------------------

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const cookie = (k, v, maxAge, path = '/api') => `${k}=${v}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${SECURE}`;
function userOf(req) {
  if (req.user === undefined) {
    const t = cookies(req)[SESSION_COOKIE];
    req.user = t && /^[A-Za-z0-9_-]{20,64}$/.test(t) ? q.session.get(hashKey(t), Date.now()) || null : null;
  }
  return req.user;
}
// A write made on the strength of the session cookie must come from the page itself
// (SameSite=Lax already keeps the cookie off other sites' posts; this is a second lock).
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}
const ownsRow = (req, row) => { const u = userOf(req); return !!(u && row.owner && row.owner === u.id && sameOrigin(req)); };
const cleanName = (s) => (typeof s === 'string' ? s.normalize('NFC').replace(/[\p{C}<>]/gu, '').trim().slice(0, 32) : '');
const safeBack = (b) => (typeof b === 'string' && /^\/(?:[a-z0-9]+(?:-[a-z0-9]+){0,9})?$/.test(b) && b.length <= 41 ? b : '/');

const oauthStates = new Map(); // state -> { at, back }
function authStart(url) {
  if (!AUTH_ON) throw new HttpError(404, 'sign-in is not set up');
  const now = Date.now();
  for (const [k, v] of oauthStates) if (now - v.at > 6e5) oauthStates.delete(k);
  if (oauthStates.size > 5000) throw new HttpError(429, 'try again shortly');
  const state = crypto.randomBytes(18).toString('base64url');
  oauthStates.set(state, { at: now, back: safeBack(url.searchParams.get('back')) });
  const u = new URL(DISCORD.authorize);
  u.search = new URLSearchParams({ response_type: 'code', client_id: DISCORD.id, scope: 'identify', state, redirect_uri: `${PUBLIC_URL}/api/auth/discord/callback`, prompt: 'none' }).toString();
  return [302, null, { Location: u.toString(), 'Set-Cookie': cookie(STATE_COOKIE, state, 600, '/api/auth') }];
}

async function authCallback(req, url) {
  if (!AUTH_ON) throw new HttpError(404, 'sign-in is not set up');
  const state = url.searchParams.get('state') || '', code = url.searchParams.get('code') || '', st = oauthStates.get(state);
  const done = (to, extra = []) => [302, null, { Location: to, 'Set-Cookie': [cookie(STATE_COOKIE, '', 0, '/api/auth'), ...extra] }];
  const back = st ? st.back : '/', sep = back.includes('?') ? '&' : '?';
  oauthStates.delete(state);
  if (url.searchParams.get('error')) return done(`${back}${sep}login=cancelled`);
  if (!st || cookies(req)[STATE_COOKIE] !== state || !/^[A-Za-z0-9_-]{6,128}$/.test(code)) return done('/?login=failed');
  let me;
  try {
    const redirect = `${PUBLIC_URL}/api/auth/discord/callback`;
    const tr = await fetch(`${DISCORD.api}/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({ client_id: DISCORD.id, client_secret: DISCORD.secret, grant_type: 'authorization_code', code, redirect_uri: redirect }),
    });
    const tok = await tr.json().catch(() => null);
    if (!tr.ok || !tok || typeof tok.access_token !== 'string') throw new Error(`token exchange ${tr.status}`);
    const ur = await fetch(`${DISCORD.api}/users/@me`, { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(8000) });
    me = await ur.json().catch(() => null);
    if (!ur.ok || !me || !/^\d{5,25}$/.test(String(me.id))) throw new Error(`user lookup ${ur.status}`);
  } catch (e) {
    console.error(new Date().toISOString(), 'discord sign-in failed:', e.message);
    return done(`${back}${sep}login=failed`);
  }
  const now = Date.now(), id = String(me.id), name = cleanName(me.global_name) || cleanName(me.username) || 'someone';
  const avatar = typeof me.avatar === 'string' && /^(?:a_)?[0-9a-f]{32}$/.test(me.avatar) ? me.avatar : null;
  q.upsertUser.run(id, name, avatar, now, now);
  // (A new name shows on the ponds they've put it on.)
  for (const r of q.ownedShown.all(id)) q.setMeta.run(JSON.stringify({ ...JSON.parse(r.meta), by: name }), r.id);
  boardCache = null;
  const token = crypto.randomBytes(24).toString('base64url');
  q.addSession.run(hashKey(token), id, now, now + SESSION_DAYS * 864e5);
  return done(`${back}${sep}login=ok`, [cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400)]);
}

function getMe(req) {
  const u = userOf(req);
  if (!u) return [200, { auth: AUTH_ON, user: null, ponds: [] }];
  const ponds = q.owned.all(u.id).map((r) => {
    const m = JSON.parse(r.meta);
    return { id: r.id, slug: r.slug || null, points: r.points, depth: r.depth, updated: r.updated, habitat: m.habitat, days: m.days, animals: m.animals, show: !!r.show_owner };
  });
  return [200, { auth: AUTH_ON, user: { id: u.id, name: u.name, avatar: u.avatar }, ponds }];
}

function logout(req) {
  if (!sameOrigin(req)) throw new HttpError(403, 'not from here');
  const t = cookies(req)[SESSION_COOKIE];
  if (t) q.dropSession.run(hashKey(t));
  return [200, { ok: true }, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) }];
}

// Keep a pond under the signed-in account: its key proves it's theirs.
async function claimPond(req) {
  const u = userOf(req);
  if (!u) throw new HttpError(401, 'sign in first');
  if (!sameOrigin(req)) throw new HttpError(403, 'not from here');
  const b = await readJson(req), id = String((b && b.id) || '');
  if (!ID_RE.test(id)) throw new HttpError(400, 'bad pond id');
  const row = q.get.get(id);
  if (!row) throw new HttpError(404, 'no such pond');
  if (row.owner && row.owner !== u.id) throw new HttpError(409, 'someone else keeps this pond');
  if (row.owner !== u.id && !keyMatches(row, b.key)) throw new HttpError(403, 'not your pond');
  const show = typeof b.show === 'boolean' ? b.show : !!row.show_owner, meta = JSON.parse(row.meta);
  if (show) meta.by = u.name; else delete meta.by;
  q.setOwner.run(u.id, show ? 1 : 0, JSON.stringify(meta), id);
  boardCache = null; ringCache = null;
  return [200, { ok: true, id, show }];
}

// ---- wanderers ------------------------------------------------------------------------------
// A fierce animal that leaves a pond may turn up in another. Only what the page needs to
// rebuild it is kept, from known shapes: its kind, build seed, name, age, genes (numbers and
// flags), and a few lists of plain words.
const WORD = /^[a-z][a-zA-Z0-9]{0,23}$/;
function cleanFlat(o, max, flags) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (n >= max || !WORD.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(-1e6, Math.min(1e6, v));
    else if (flags && typeof v === 'boolean') out[k] = v;
    else continue;
    n++;
  }
  return out;
}
const words = (a, max) => (Array.isArray(a) ? [...new Set(a.filter((t) => typeof t === 'string' && WORD.test(t)))].slice(0, max) : []);
const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
function cleanWanderer(w) {
  if (!w || typeof w !== 'object' || !SPECIES.has(w.k) || w.k === 'wild' || !w.L || typeof w.L !== 'object') return null;
  const L = w.L, name = typeof L.name === 'string' ? L.name.normalize('NFC').replace(/[^\p{L}\p{N} '-]/gu, '').trim().slice(0, 24) : '';
  const genome = cleanFlat(L.genome, 120, true);
  if (!name || !genome || !Object.keys(genome).length) return null;
  return {
    k: w.k, s: typeof w.s === 'number' && Number.isFinite(w.s) ? Math.trunc(w.s) : 0,
    L: {
      name, genome, gen: int(L.gen, 0, 1e6), age: num(L.age, 0, 1e7), lifespan: num(L.lifespan, 1, 1e7), scale: num(L.scale, 0.1, 3), inbred: num(L.inbred, 0, 1),
      corruption: num(L.corruption, 0, 1e6), absorbed: int(L.absorbed, 0, 1e4), ascended: L.ascended === true, hunter: L.hunter === true, kills: int(L.kills, 0, 1e6),
      hunt: cleanFlat(L.hunt, 12, false) || {}, boosts: cleanFlat(L.boosts, 12, false) || {},
      warps: words(L.warps, 12), quirks: words(L.quirks, 8), ill: words(L.ill, 4),
    },
  };
}
const wanderSends = new Map(), wanderTakes = new Map();
function underLimit(map, key, max) {
  const hour = Math.floor(Date.now() / 36e5), e = map.get(key);
  if (!e || e.hour !== hour) { map.set(key, { hour, n: 1 }); return true; }
  return ++e.n <= max;
}
async function postWanderer(req) {
  const b = await readJson(req), id = String((b && b.pond) || '');
  if (!ID_RE.test(id)) throw new HttpError(400, 'bad pond id');
  const row = q.get.get(id);
  if (!row) throw new HttpError(404, 'no such pond');
  if (!keyMatches(row, req.headers['x-pond-key']) && !ownsRow(req, row)) throw new HttpError(403, 'not your pond');
  const w = cleanWanderer(b.w);
  if (!w) throw new HttpError(400, 'not an animal');
  if (!underLimit(wanderSends, id, WANDER_SENDS_PER_HOUR)) throw new HttpError(429, 'enough wanderers from this pond for now');
  q.addWanderer.run(Date.now(), id, w.k, JSON.stringify(w));
  q.trimWanderers.run(WANDER_MAX);
  return [201, { ok: true }];
}
// Call one up: any from another pond that can live in this one's water (the page says which kinds).
async function takeWanderer(req) {
  const b = await readJson(req), id = b && ID_RE.test(String(b.pond)) ? String(b.pond) : '';
  const kinds = new Set(Array.isArray(b && b.kinds) ? b.kinds.filter((k) => SPECIES.has(k) && k !== 'wild').slice(0, 80) : []);
  if (!underLimit(wanderTakes, req.ip, WANDER_TAKES_PER_HOUR)) throw new HttpError(429, 'not so often');
  const pool = q.wandererPool.all(Date.now() - WANDER_KEEP_DAYS * 864e5, id).filter((r) => kinds.has(r.kind));
  if (!pool.length) return [200, { w: null }];
  const pick = pool[crypto.randomInt(pool.length)], row = q.wanderer.get(pick.n);
  if (!row || !q.dropWanderer.run(pick.n).changes) return [200, { w: null }];
  const from = q.get.get(row.pond), m = from ? JSON.parse(from.meta) : {};
  return [200, { w: { ...JSON.parse(row.data), from: row.pond, by: m.by || null } }];
}

async function route(req) {
  const url = new URL(req.url, 'http://pond'), path = url.pathname;
  if (path === '/api/health' && req.method === 'GET') return [200, { ok: true }];
  if (path === '/api/minds' && req.method === 'GET') {
    const [fly,fish]=await Promise.all([flyBrain.available(),fishBrain.available()]);
    return [200, { enabled: minds.enabled, flyBrain: fly, fishBrain: fish }];
  }
  const neuralServices={'/api/minds/fly-brain':flyBrain,'/api/minds/fish-brain':fishBrain};
  if (Object.hasOwn(neuralServices,path) && req.method === 'POST') {
    if (!sameOrigin(req)) throw new HttpError(403, 'not from here');
    const body=await readJson(req),id=String(body?.pond||'');
    if (!ID_RE.test(id)) throw new HttpError(400,'bad pond id');
    const row=q.get.get(id);
    if (!row || (!keyMatches(row,req.headers['x-pond-key']) && !ownsRow(req,row))) throw new HttpError(403,'not your pond');
    const result=await neuralServices[path].step(id,body);
    return [result.status,result.body];
  }
  if (path === '/api/minds/decide' && req.method === 'POST') {
    if (!sameOrigin(req)) throw new HttpError(403, 'not from here');
    const body = await readJson(req), id = String(body?.pond || '');
    if (!ID_RE.test(id)) throw new HttpError(400, 'bad pond id');
    const row = q.get.get(id);
    if (!row || (!keyMatches(row, req.headers['x-pond-key']) && !ownsRow(req, row))) throw new HttpError(403, 'not your pond');
    const result = await minds.decide(id, body.scenario, body.creature);
    return [result.status, result.body];
  }
  // Is a pond name allowed? (Asked as the owner types one; every save is checked again anyway.)
  if (path === '/api/title-check' && req.method === 'POST') {
    const body = await readJson(req), t = cleanTitle(body && body.title);
    return [200, { ok: !!t, title: t }];
  }
  if (path === '/api/auth/discord' && req.method === 'GET') return authStart(url);
  if (path === '/api/auth/discord/callback' && req.method === 'GET') return authCallback(req, url);
  if (path === '/api/me' && req.method === 'GET') return getMe(req);
  if (path === '/api/logout' && req.method === 'POST') return logout(req);
  if (path === '/api/me/claim' && req.method === 'POST') return claimPond(req);
  if (path === '/api/wanderers' && req.method === 'POST') return postWanderer(req);
  if (path === '/api/wanderers/take' && req.method === 'POST') return takeWanderer(req);
  if (path === '/api/neighbours' && req.method === 'GET') {
    const id = url.searchParams.get('id');
    return [200, neighbours(id && ID_RE.test(id) ? id : null)];
  }
  if (path === '/api/board' && req.method === 'GET') return [200, board()];
  if (path === '/api/ponds' && req.method === 'POST') return createPond(req);
  const m = /^\/api\/ponds\/([a-z0-9-]{3,40})$/.exec(path);
  if (m && req.method === 'GET') return getPond(req, m[1], url.searchParams.get('peek') === '1'); // (by its id or its address)
  if (m && ID_RE.test(m[1])) {
    if (req.method === 'PUT') return updatePond(req, m[1]);
    throw new HttpError(405, 'method not allowed');
  }
  throw new HttpError(404, 'not found');
}

const server = http.createServer(async (req, res) => {
  req.ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
  let status, body, headers = {};
  try {
    [status, body, headers = {}] = await route(req);
  } catch (e) {
    status = e instanceof HttpError ? e.status : 500;
    body = { error: e instanceof HttpError ? e.message : 'server error' };
    if (status === 500) console.error(new Date().toISOString(), req.method, req.url.split('?')[0], e); // (no query: it may hold a sign-in code)
  }
  const text = body === null ? '' : JSON.stringify(body);
  res.writeHead(status, { ...(body === null ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store', ...headers });
  res.end(text);
});
server.requestTimeout = 20000;
server.headersTimeout = 10000;

function prune() {
  const cut = Date.now() - KEEP_DAYS * 864e5, small = Date.now() - SMALL_KEEP_DAYS * 864e5;
  const n = q.prune.run(cut, cut, small, small).changes;
  if (n) { q.pruneSlugs.run(); console.log(new Date().toISOString(), `removed ${n} unused ponds`); }
  q.pruneSessions.run(Date.now());
  q.pruneWanderers.run(Date.now() - WANDER_KEEP_DAYS * 864e5);
  creates.clear(); wanderSends.clear(); wanderTakes.clear();
}
prune();
setInterval(prune, 864e5).unref();

server.listen(PORT, () => console.log(`pond api on :${PORT}, ${DB_PATH}, sign-in ${AUTH_ON ? 'on' : 'off'}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
