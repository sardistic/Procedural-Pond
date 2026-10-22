'use strict';
// Personal resident memories live on this device, outside the simulation/save payload.
const ALBUM_KEY = 'pond.album.v1';
const ALBUM = { records: {}, key: null, data: null, dialog: null, confirmId: null, timer: 0, writeTimer: null, dirty: true, saved: true };
try {
  const stored = JSON.parse(localStorage.getItem(ALBUM_KEY) || '{}');
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) for (const [key, d] of Object.entries(stored).slice(-8)) {
    if (!d || typeof d.seed !== 'string' || !Array.isArray(d.residents) || !Array.isArray(d.moments)) continue;
    d.residents = d.residents.filter((r) => r && Number.isFinite(r.id) && typeof r.name === 'string').slice(0, 24);
    d.moments = d.moments.filter((m) => m && Number.isFinite(m.id) && typeof m.text === 'string').slice(0, 80);
    ALBUM.records[key] = d;
  }
} catch { /* An album can still be used for this session. */ }

function albumState(w) {
  if (!w.game || !w.inst || w.observe) return null;
  const key = `${SAVE_EPOCH}:${w.seed}:${w.inst}`;
  if (key !== ALBUM.key) {
    if (ALBUM.dialog) ALBUM.dialog.close();
    ALBUM.key = key;
    ALBUM.data = ALBUM.records[key] || { seed: w.seed, residents: [], moments: [] };
    ALBUM.dirty = true;
  }
  return ALBUM.data;
}
function albumSave(immediate = true) {
  if (!ALBUM.key || !ALBUM.data) return;
  delete ALBUM.records[ALBUM.key]; ALBUM.records[ALBUM.key] = ALBUM.data;
  for (const key of Object.keys(ALBUM.records).slice(0, -8)) delete ALBUM.records[key];
  ALBUM.dirty = true;
  if (immediate) albumFlush();
  else if (ALBUM.writeTimer === null) ALBUM.writeTimer = setTimeout(albumFlush, 500);
}
function albumFlush() {
  clearTimeout(ALBUM.writeTimer); ALBUM.writeTimer = null;
  try { localStorage.setItem(ALBUM_KEY, JSON.stringify(ALBUM.records)); ALBUM.saved = true; }
  catch { ALBUM.saved = false; }
}
function albumForget(seed) {
  for (const [k, d] of Object.entries(ALBUM.records)) if (d.seed === seed) delete ALBUM.records[k];
  if (ALBUM.data?.seed === seed) { ALBUM.dialog?.close(); ALBUM.key = null; ALBUM.data = null; }
  albumFlush();
}
const albumLive = (w, id) => w.creatures.find((c) => c.seed === id && c.life && !c.leaving && !c.dying);
const albumFavorite = (w, c) => !!albumState(w)?.residents.some((r) => r.id === c.seed && r.favorite);

// Render a separate, seeded animal. Never pose or recolor the resident itself.
function albumPortrait(c) {
  try {
    return withSeed(`album/${c.seed}`, () => {
      const w = iconWorld(), args = { ...c.args, leader: null,
        school: c.school ? { ...c.school } : null, sp: c.sp ? structuredClone(c.sp) : undefined };
      const copy = makeCreature(c.make, w, 48, 48, args, c.seed);
      dyeCreature(copy, { ...c.life.genome });
      ICON_TWEAKS[copy.species]?.(copy);
      let crop = rasterIcon(copy, w);
      const side = Math.max(crop.w, crop.h);
      if (side > 48 && fitIcon(copy, 48 / side)) crop = rasterIcon(copy, w);
      const src = iconImage(crop).src;
      return src.length <= 16000 ? src : null;
    });
  } catch { return null; }
}
function albumResident(w, c) {
  const d = albumState(w);
  if (!d || !c?.life || !Number.isFinite(c.seed)) return null;
  let r = d.residents.find((r) => r.id === c.seed);
  if (r) return r;
  if (d.residents.length >= 24) { showTicker('Your album holds 24 residents. Forget one in the album to make room.'); return null; }
  const desc = describe(c);
  r = { id: c.seed, name: desc.name, kind: desc.label, gen: c.life.gen, color: swatchOf(c),
    portrait: albumPortrait(c), day: Math.floor(w.days) + 1, favorite: false };
  d.residents.push(r);
  return r;
}
function albumMoment(w, c, text, tag, key = null, day = Math.floor(w.days) + 1) {
  const d = albumState(w), r = d?.residents.find((r) => r.id === c?.seed);
  if (!d || !r) return false;
  // Keep an individual observation before the ordinary journal merges it into a recap.
  const stamp = key || `${tag}:${Math.round(w.t * 10)}:${text}`;
  if (d.moments.some((m) => m.id === r.id && m.key === stamp)) return false;
  d.moments.unshift({ id: r.id, text: String(text).slice(0, 600), tag, key: stamp.slice(0, 700), day });
  d.moments.length = Math.min(80, d.moments.length);
  albumSave(false); return true;
}
function toggleAlbumFavorite(c) {
  if (world.observe || !world.creatures.includes(c) || !c.life) return;
  const d = albumState(world);
  if (!d) return;
  let r = d.residents.find((r) => r.id === c.seed);
  if (!r?.favorite && d.residents.filter((a) => a.favorite).length >= 12) {
    showTicker('You can follow 12 favorites. Unfavorite one in the album first.'); return;
  }
  r = r || albumResident(world, c);
  if (!r) return;
  r.favorite = !r.favorite;
  if (r.favorite) albumMoment(world, c, `${r.name} joined your favorites.`, 'Favorite', 'favorite');
  albumSave(); renderCreature();
}
function albumLog(w, text, c, opts) {
  if (!c?.life || w !== world || w.observe || !albumFavorite(w, c)) return;
  if (opts.cat === 'rare' || (opts.cat === 'life' && /^(grown:|fedgrow:|old:|hatch:|eggs:)/.test(opts.key || '')))
    albumMoment(w, c, text, opts.cat === 'rare' ? 'Rare moment' : 'Milestone');
}
function albumBirth(w, c, how) {
  if (w !== world || w.observe || how !== 'born') return;
  const d = albumState(w);
  if (!d) return;
  for (const id of c.life.parents || []) {
    const r = d.residents.find((r) => r.id === id && r.favorite);
    if (r) {
      const rare = describe(c).tier >= 2;
      albumMoment(w, { seed: id }, `${r.name}'s ${rare ? 'rare offspring' : 'first recorded offspring'}: ${c.life.name}, generation ${c.life.gen}.`,
        'New offspring', rare ? `rare-child:${c.seed}` : 'first-offspring');
    }
  }
}
function albumDeparture(w, c, why) {
  if (w !== world || w.observe) return;
  const r = albumState(w)?.residents.find((r) => r.id === c.seed);
  if (!r) return;
  r.departed = { day: Math.floor(w.days) + 1, why: String(why || 'left the pond').slice(0, 120) };
  albumMoment(w, c, `${r.name} left the pond: ${r.departed.why}.`, 'Departure', `departure:${Math.round(w.days * 100)}`);
  albumSave(false);
}
function albumRekey(w, from, to) {
  if (w !== world || w.observe) return;
  const d = albumState(w), r = d?.residents.find((r) => r.id === from.seed);
  if (!r) return;
  for (const m of d.moments) if (m.id === from.seed) m.id = to.seed;
  r.id = to.seed; r.kind = describe(to).label;
  albumMoment(w, to, `${r.name} became a ${r.kind.toLowerCase()}.`, 'Transformation', `transform:${to.seed}`);
}
function albumRemember(e) {
  if (world.observe || !e.subject?.life || !world.journal.includes(e)) return;
  const r = albumResident(world, e.subject);
  if (!r) return;
  albumMoment(world, e.subject, journalText(e), 'Saved from journal', `journal:${e.seq}`, Number.isFinite(e.day) ? e.day : Math.floor(world.days) + 1);
  albumSave();
  showTicker(ALBUM.saved ? 'Moment saved in your resident album.' : 'Saved for this session; browser storage is unavailable.');
}

function albumGo(id) {
  const c = albumLive(world, id);
  if (!c) { ALBUM.dirty = true; renderAlbum(); return; }
  ALBUM.dialog?.close(); setJournal(false); setCensus(false); setHud(false);
  centerOn(c.x, c.y); follow(c); showCreature(c);
}
function albumButton(label, key, action) {
  const b = el('button', null, label); b.type = 'button'; b.dataset.albumKey = key;
  b.addEventListener('click', action); return b;
}
function renderAlbum() {
  const box = ALBUM.dialog, d = albumState(world);
  if (!box?.open || !d) return;
  const active = box.contains(document.activeElement) ? document.activeElement.dataset.albumKey : null;
  const scroll = box.scrollTop, list = box.querySelector('.album-residents'), moments = box.querySelector('.album-moments');
  list.replaceChildren(); moments.replaceChildren();
  box.querySelector('.album-note').textContent = ALBUM.saved
    ? 'Kept in this browser. Favorites remember milestones while you play; they can still be hunted or leave. Keep safe separately prevents recycling.'
    : 'Browser storage is unavailable or full. These memories are kept for this session only.';
  for (const r of [...d.residents].sort((a, b) => Number(b.favorite) - Number(a.favorite))) {
    const c = albumLive(world, r.id), row = el('article', 'album-resident'), body = el('div');
    if (typeof r.portrait === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.portrait) && r.portrait.length <= 16000) {
      const img = document.createElement('img'); img.src = r.portrait; img.alt = `Portrait of ${r.name} when remembered`; row.append(img);
    }
    body.append(el('h3', null, r.name), el('p', null, `${r.kind} · generation ${r.gen} · remembered on day ${r.day}`));
    const lineage = world.lineage?.get(r.id), gone = r.departed || (lineage?.d != null ? { day: Math.floor(lineage.d) + 1, why: lineage.why } : null);
    body.append(el('p', 'album-status', c ? 'In the pond now' : gone ? `Left on day ${gone.day}: ${gone.why || 'departed'}` : 'Not currently in the pond'));
    const actions = el('div', 'album-actions');
    const go = albumButton('Find resident', `find:${r.id}`, () => albumGo(r.id)); go.disabled = !c;
    const favorite = albumButton(r.favorite ? '★ Favorite' : '☆ Favorite', `favorite:${r.id}`, () => {
      if (world.observe || albumState(world) !== d) return;
      if (!r.favorite && d.residents.filter((a) => a.favorite).length >= 12) { showTicker('Unfavorite a resident first; the limit is 12.'); return; }
      r.favorite = !r.favorite; albumSave(); renderAlbum();
    });
    favorite.setAttribute('aria-pressed', String(!!r.favorite));
    const forget = albumButton('Forget', `forget:${r.id}`, () => {
      ALBUM.confirmId = r.id; renderAlbum();
      box.querySelector(`[data-album-key="cancel:${r.id}"]`)?.focus();
    });
    if (ALBUM.confirmId === r.id) {
      body.append(el('p', null, 'Forget this portrait and its saved moments? The animal stays in the pond.'));
      actions.append(albumButton('Confirm forget', `confirm:${r.id}`, () => {
        if (world.observe || albumState(world) !== d) return;
        d.residents = d.residents.filter((a) => a !== r); d.moments = d.moments.filter((m) => m.id !== r.id);
        ALBUM.confirmId = null; albumSave(); renderAlbum();
        box.querySelector('.album-close').focus();
      }), albumButton('Cancel', `cancel:${r.id}`, () => {
        ALBUM.confirmId = null; renderAlbum();
        box.querySelector(`[data-album-key="forget:${r.id}"]`)?.focus();
      }));
    } else actions.append(go, favorite, forget);
    body.append(actions); row.append(body); list.append(row);
  }
  if (!d.residents.length) list.append(el('p', 'empty', 'Favorite an animal from its card, or save a moment from the journal.'));
  for (const m of d.moments) {
    const r = d.residents.find((r) => r.id === m.id);
    if (!r) continue;
    const row = el('li'), label = el('p', 'album-moment-label', `Day ${m.day} · ${m.tag} · ${r.name}`);
    row.append(label, el('p', null, m.text));
    if (albumLive(world, m.id)) row.append(albumButton('Go to resident', `moment:${m.id}:${m.key}`, () => albumGo(m.id)));
    moments.append(row);
  }
  if (!d.moments.length) moments.append(el('li', 'empty', 'Saved moments will appear here.'));
  box.scrollTop = scroll;
  if (active) box.querySelector(`[data-album-key="${CSS.escape(active)}"]`)?.focus({ preventScroll: true });
  ALBUM.dirty = false;
}
function openAlbum() {
  if (!albumState(world)) return;
  if (ALBUM.dialog?.open) return;
  ALBUM.confirmId = null;
  const dialog = document.createElement('dialog'); dialog.id = 'resident-album'; dialog.className = 'world-mystery resident-album';
  dialog.setAttribute('aria-labelledby', 'album-title');
  dialog.innerHTML = '<header><h2 id="album-title">Resident album</h2><button type="button" class="album-close" aria-label="Close resident album">×</button></header><p class="album-note"></p><h2>Remembered residents</h2><div class="album-residents"></div><h2>Moments</h2><ol class="album-moments"></ol><p class="album-limits">Up to 12 favorites, 24 remembered residents and 80 recent moments per pond. This browser keeps the 8 most recently updated pond albums.</p>';
  document.body.append(dialog); ALBUM.dialog = dialog;
  dialog.querySelector('.album-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { dialog.remove(); if (ALBUM.dialog === dialog) ALBUM.dialog = null; });
  dialog.showModal(); renderAlbum(); dialog.querySelector('.album-close').focus();
}
function albumTick() {
  if (performance.now() < ALBUM.timer) return;
  ALBUM.timer = performance.now() + 1000;
  document.getElementById('open-album').hidden = !!world.observe;
  if (world.observe) { ALBUM.dialog?.close(); return; }
  albumState(world);
  if (ALBUM.dialog?.open) renderAlbum();
}
const albumOpenButton = document.createElement('button');
albumOpenButton.id = 'open-album'; albumOpenButton.type = 'button'; albumOpenButton.className = 'span3'; albumOpenButton.textContent = 'Resident album';
document.getElementById('open-care').after(albumOpenButton);
albumOpenButton.addEventListener('click', openAlbum);
addEventListener('pagehide', () => { if (ALBUM.writeTimer !== null) albumFlush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && ALBUM.writeTimer !== null) albumFlush(); });
