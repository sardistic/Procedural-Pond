'use strict';
// The pond server at /api: short links of four words (pond.nz/amber-heron-moss-lantern)
// that hold the whole saved pond, the leaderboard, and a feed of rare finds from
// every pond. All of it is optional: opened from a file, or with the server
// unreachable, the pond runs as before and links fall back to #s= fragments.
//
// A short link belongs to the browser that made it: the server hands back a
// secret key, kept only in this browser's save, and only that key can update
// the pond behind the link. Anyone else who opens it gets their own copy.

const Net = {
  base: /^https?:$/.test(location.protocol) ? '/api' : null,
  downUntil: 0, // the server failed; don't try again before this (performance.now ms)
  board: null,  // { top, high, finds, ponds, at }
  rank: null,   // this pond's place on the leaderboard
};
const SHORT_ID = /^[a-z]{2,8}(?:-[a-z]{2,8}){3}$/;
// A pond's address: its name (pond.nz/moonlit-reef), given by the server once its name passes the filter, or else its
// id. Any address it has had (and its id) still opens it.
const PATH_KEY = /^[a-z0-9]+(?:-[a-z0-9]+){0,9}$/;
const linkName = (link) => (link && (link.slug || link.id)) || null;
const BOARD_MIN = 50; // points before a pond is listed on the leaderboard

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function api(method, path, body, key) {
  if (!Net.base || performance.now() < Net.downUntil) throw new ApiError('offline', 0);
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (key) headers['X-Pond-Key'] = key;
  let res;
  try {
    res = await fetch(Net.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  } catch {
    Net.downUntil = performance.now() + 60000;
    throw new ApiError('offline', 0);
  }
  const data = await res.json().catch(() => null);
  if (!data || res.status >= 500) Net.downUntil = performance.now() + 30000; // not our server (static host) or it's struggling
  if (!res.ok || !data) throw new ApiError((data && data.error) || `HTTP ${res.status}`, res.status);
  return data;
}

// What the leaderboard shows about a pond: numbers and its best find, nothing typed by anyone.
function pondMeta(world) {
  const G = world.game, alive = world.creatures.filter((c) => c.life && !c.leaving);
  return {
    points: G.points, erosion: world.erosion ? Math.round(world.erosion.e * 1000) / 1000 : 0, depth: typeof pondFathoms === 'function' ? pondFathoms(world) : 1,
    animals: alive.length, species: new Set(alive.map((c) => (c.species === 'wild' ? `w${c.sp.id}` : c.species))).size,
    rares: alive.filter((c) => c.life.traits.length).length, gen: world.records ? world.records.gen : 0,
    days: Math.round(world.days * 100) / 100, habitat: world.opts.habitat, board: !!G.board, lock: !!G.lock, showName: !!G.showName, visit: G.visit && (G.visit.plant || G.visit.minds) ? { plant: !!G.visit.plant, minds: !!G.visit.minds } : null, title: G.title || null, epoch: typeof SAVE_EPOCH === 'number' ? SAVE_EPOCH : 1,
    best: G.best ? { tier: G.best.tier, species: G.best.species, traits: G.best.traits, how: G.best.how } : null,
    finds: G.finds.map((f) => ({ tier: f.tier, species: f.species, traits: f.traits, how: f.how })),
  };
}

// The save that goes to the server: everything except this browser's key.
function uploadSave(world) {
  const { link, ...save } = serializePond(world);
  return save;
}

// Give this pond a short link (first time) or bring the server's copy up to date.
// Resolves to the link id, or throws.
async function pushPond(world) {
  const meta = pondMeta(world), sent = world.game.finds.length;
  let res;
  if (world.link && world.link.id) {
    try {
      res = await api('PUT', `/ponds/${world.link.id}`, { save: uploadSave(world), meta }, world.link.key);
    } catch (e) {
      if (e.status !== 404 && e.status !== 403) throw e;
      if (e.status === 403 && !world.link.key) throw e; // (yours by your account, and signed out here: don't fork it)
      world.link = null; // the link is gone (expired) or not ours after all: make a new one
    }
  }
  if (!res) {
    res = await api('POST', '/ponds', { save: uploadSave(world), meta });
    world.link = { id: res.id, key: res.key };
  }
  if ('slug' in res) world.link.slug = res.slug || null; // (it follows the pond's name)
  world.game.finds.splice(0, sent); // those finds are on the shared feed now
  if (typeof res.rank === 'number') Net.rank = res.rank;
  if (typeof res.views === 'number') world.game.views = res.views; // how many have come to look: popular ponds draw litter
  if (typeof res.high === 'number') Net.board = { ...(Net.board || {}), high: res.high };
  return world.link.id;
}

// A shared pond by its id or its address: { id, slug, save, meta } or null.
// (A peek, for drawing a neighbour past the end of the beach, doesn't count as a visit.)
async function fetchPond(id, peek = false) {
  try {
    const res = await api('GET', `/ponds/${id}${peek ? '?peek=1' : ''}`);
    return res && isSave(res.save) ? res : null;
  } catch {
    return null;
  }
}

async function fetchBoard() {
  const b = await api('GET', '/board');
  Net.board = { ...b, at: Date.now() };
  return Net.board;
}

const shortUrl = (id) => `${location.origin}/${id}`;

// The ponds either side of one along the shared beach: { west, east }, each { id, depth, points, habitat, animals } or null.
async function fetchNeighbours(id) {
  try { return await api('GET', `/neighbours${id ? `?id=${encodeURIComponent(id)}` : ''}`); } catch { return { west: null, east: null }; }
}
