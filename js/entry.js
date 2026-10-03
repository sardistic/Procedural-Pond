'use strict';
// The entry screen's controller (index.html #entry). Loaded first, as its own file: the site's
// Content-Security-Policy allows no inline scripts.
// Before anything else loads: the swimmers, the loading line, then the pond's card (main.js calls
// Entry.ready), and away when you dive in.
(() => {
  const $ = (id) => document.getElementById(id), sea = $('entry-sea');
  if (!$('entry')) return;
  $('entry').classList.add('live'); // (so the stylesheet's own fallback fade never runs)
  const fishSvg = (body, fin) => `<svg viewBox="0 0 24 10" shape-rendering="crispEdges"><g transform="translate(24,0) scale(-1,1)"><rect x="4" y="3" width="12" height="4" fill="${body}"/><rect x="6" y="2" width="8" height="6" fill="${body}"/><rect x="16" y="4" width="2" height="2" fill="${body}"/><rect x="18" y="2" width="4" height="2" fill="${fin}"/><rect x="18" y="6" width="4" height="2" fill="${fin}"/><rect x="20" y="4" width="2" height="2" fill="${fin}"/><rect x="6" y="4" width="2" height="1" fill="#0b1a22"/><rect x="9" y="1" width="4" height="1" fill="${fin}"/></g></svg>`;
  const kinds = [['#f08a3a', '#ffd166'], ['#e8f4f2', '#f05a4a'], ['#3ad6b8', '#8af0ff'], ['#ffd166', '#f08a3a'], ['#c08af0', '#ff9aff']];
  let html = '';
  for (let i = 0; i < 9; i++) {
    const [b, f] = kinds[i % kinds.length], top = 12 + (i * 37) % 76, dur = 9 + (i * 7) % 11, s = 0.6 + ((i * 13) % 10) / 10;
    html += `<div class="fish" style="top:${top}%;width:${Math.round(48 * s)}px;height:${Math.round(20 * s)}px;animation-duration:${dur}s;animation-delay:-${(i * 3.3) % dur}s">${fishSvg(b, f)}</div>`;
  }
  for (let i = 0; i < 14; i++) html += `<div class="bubble" style="left:${(i * 53) % 100}%;animation-duration:${6 + (i * 5) % 7}s;animation-delay:-${(i * 1.7) % 8}s;width:${4 + i % 3 * 2}px;height:${4 + i % 3 * 2}px"></div>`;
  for (let i = 0; i < 12; i++) html += `<div class="weed" style="left:${4 + i * 8.3}%;height:${40 + (i * 29) % 70}px;animation-delay:-${(i * .7) % 3}s"></div>`;
  sea.innerHTML = html;
  let skip = false;
  try { skip = localStorage.getItem('pond.skipEntry') === '1'; } catch { /* no storage */ }
  // Script loading fills the first part of the line.
  let loaded = 0, phase = 0;
  document.addEventListener('load', (e) => {
    if (phase || !e.target || e.target.tagName !== 'SCRIPT') return;
    loaded++;
    const total = Math.max(60, document.querySelectorAll('script[src]').length);
    set(null, 0.05 + 0.55 * Math.min(1, loaded / total));
  }, true);
  function set(text, p) {
    if (text) $('entry-status').textContent = text;
    if (p != null) $('entry-bar').style.transform = `scaleX(${Math.max(0.04, Math.min(1, p))})`;
  }
  function done() {
    const el = $('entry');
    if (!el || el.classList.contains('gone')) return;
    try { localStorage.setItem('pond.skipEntry', $('entry-skip').checked ? '1' : '0'); } catch { /* no storage */ }
    el.classList.add('gone');
    setTimeout(() => el.remove(), 700);
    document.removeEventListener('keydown', key, true);
    if (window.Entry.onDone) window.Entry.onDone();
  }
  function key(e) { if (document.getElementById('entry')?.classList.contains('ready') && ['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); done(); } }
  window.Entry = {
    status(text, p) { phase = 1; set(text, p); },
    // The pond is ready: its card (or straight in, if skipped or only visiting).
    ready(info) {
      set('Here it is', 1);
      if (skip || info.skip) { done(); return; }
      $('entry-name').textContent = info.name || 'Your pond';
      $('entry-facts').textContent = info.facts || '';
      $('entry-blurb').textContent = info.blurb || '';
      const pv = $('entry-preview');
      if (info.preview) { pv.width = info.preview.width; pv.height = info.preview.height; pv.getContext('2d').drawImage(info.preview, 0, 0); pv.style.width = `${Math.min(360, info.preview.width * 2)}px`; } else pv.remove();
      $('entry-dive').textContent = info.button || 'Dive in';
      $('entry').classList.add('ready');
      $('entry-dive').addEventListener('click', done);
      document.addEventListener('keydown', key, true);
      setTimeout(() => $('entry-dive').focus(), 50);
    },
    done,
    skipping: () => skip,
  };
  // Never strand anyone on the entry screen: if loading fails or stalls, offer the way in anyway.
  const rescue = (why) => { if (!$('entry') || $('entry').classList.contains('ready') || $('entry').classList.contains('gone')) return;
    window.Entry.ready({ name: 'The pond', facts: '', blurb: why, button: 'Dive in anyway' }); };
  window.addEventListener('error', () => setTimeout(() => rescue('Something went wrong while the pond was loading. It may still work; dive in and see.'), 1500));
  setTimeout(() => rescue('The pond is taking a long time to fill.'), 30000);
})();
