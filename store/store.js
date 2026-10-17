'use strict';
// (Paths are relative to this script, so the page works from store/ and from docs/ alike.)
const BASE = new URL('.', document.currentScript.src);
const MEDIA = [{"kind": "video", "src": "media/trailer.mp4", "poster": "media/trailer-poster.jpg", "thumb": "media/thumb-trailer.jpg", "alt": "Trailer"}, {"kind": "img", "src": "media/01-islands-day.jpg", "full": "media/01-islands-day-full.jpg", "thumb": "media/thumb-01-islands-day.jpg", "alt": "Islands raised in a long-kept pond, green and terraced, by day"}, {"kind": "img", "src": "media/02-islands-dusk.jpg", "full": "media/02-islands-dusk-full.jpg", "thumb": "media/thumb-02-islands-dusk.jpg", "alt": "The land up the beach and an island at dusk"}, {"kind": "img", "src": "media/03-closeup-tetra-day.jpg", "full": "media/03-closeup-tetra-day-full.jpg", "thumb": "media/thumb-03-closeup-tetra-day.jpg", "alt": "Close up on a tetra in the shallows"}, {"kind": "img", "src": "media/04-closeup-clown-day.jpg", "full": "media/04-closeup-clown-day-full.jpg", "thumb": "media/thumb-04-closeup-clown-day.jpg", "alt": "Close up on a clown in the shallows"}, {"kind": "img", "src": "media/05-closeup-koi-day.jpg", "full": "media/05-closeup-koi-day-full.jpg", "thumb": "media/thumb-05-closeup-koi-day.jpg", "alt": "Close up on a koi in the shallows"}, {"kind": "img", "src": "media/06-closeup-crab-day.jpg", "full": "media/06-closeup-crab-day-full.jpg", "thumb": "media/thumb-06-closeup-crab-day.jpg", "alt": "Close up on a crab in the shallows"}, {"kind": "img", "src": "media/07-closeup-olm-night.jpg", "full": "media/07-closeup-olm-night-full.jpg", "thumb": "media/thumb-07-closeup-olm-night.jpg", "alt": "Close up on a olm at night"}, {"kind": "img", "src": "media/20-interface-card.jpg", "full": "media/20-interface-card-full.jpg", "thumb": "media/thumb-20-interface-card.jpg", "alt": "The game with its interface: the animal rail, the pond bar and an animal\u2019s card"}].map((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, ['src', 'poster', 'thumb', 'full'].includes(k) ? new URL(v, BASE).href : v])));
const viewer = document.getElementById('viewer'), strip = document.getElementById('strip');
let at = 0;
function show(i, focus) {
  at = (i + MEDIA.length) % MEDIA.length;
  const m = MEDIA[at];
  viewer.querySelectorAll('video,img,a.full').forEach((el) => el.remove());
  let el;
  if (m.kind === 'video') {
    el = document.createElement('video');
    Object.assign(el, { src: m.src, poster: m.poster, controls: true, muted: true, autoplay: true, playsInline: true });
    el.setAttribute('aria-label', m.alt);
    el.addEventListener('ended', () => show(at + 1));
  } else {
    el = document.createElement('img');
    el.src = m.src; el.alt = m.alt;
    const a = document.createElement('a');
    a.className = 'full'; a.href = m.full; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Full size';
    viewer.appendChild(a);
  }
  viewer.prepend(el);
  strip.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-current', String(j === at)));
  const b = strip.children[at];
  if (b) { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (focus) b.focus(); }
}
MEDIA.forEach((m, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.setAttribute('aria-label', m.alt);
  b.innerHTML = `<img src="${m.thumb}" alt="">${m.kind === 'video' ? '<span class="playmark" aria-hidden="true">▶</span>' : ''}`;
  b.addEventListener('click', () => show(i));
  strip.appendChild(b);
});
viewer.querySelector('.prev').addEventListener('click', () => show(at - 1));
viewer.querySelector('.next').addEventListener('click', () => show(at + 1));
strip.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1, true); } if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1, true); } });
show(0);
// (The feature loops play only while on screen.)
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause(); })) : null;
document.querySelectorAll('.feature video').forEach((v) => { if (io) io.observe(v); });
if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelectorAll('.feature video').forEach((v) => { v.removeAttribute('autoplay'); v.pause(); v.controls = true; });
