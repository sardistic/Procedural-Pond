"""Build the store page, pond.nz/store: trailer, screenshots, a Play button, features, then the how-to-play guide.

  python tools/build_store.py [--pond <address>]

It takes the footage from tools/capture_promo.py (promo/<pond>/), makes web-sized copies of it in store/media/,
and writes store/index.html with its script in store/store.js (the site's CSP allows no inline script). The
guide comes from docs/how-to-play.html. docs/progression-guide.html gets the same page, pointed at store/, to
open from the repo.
"""
import argparse, json, re, shutil, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = shutil.which('ffmpeg') or r'C:fmpeginfmpeg.exe'
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--pond', default='thomas-pond')
a = ap.parse_args()
P = ROOT / 'promo' / a.pond
OUT = ROOT / 'store'
MEDIA = OUT / 'media'
MEDIA.mkdir(parents=True, exist_ok=True)


def ff(*args):
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', *map(str, args)], check=True)


src = (ROOT / 'docs' / 'how-to-play.html').read_text(encoding='utf-8')
info = json.loads((P / 'info.json').read_text(encoding='utf-8'))
shots = json.loads((P / 'shots' / 'shots.json').read_text(encoding='utf-8'))

# ---- web media: the trailer (720p), its poster, the header image, feature loops, screenshots and thumbnails ----
ff('-i', P / 'trailer.mp4', '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '27',
   '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', MEDIA / 'trailer.mp4')
ff('-ss', 4.5, '-i', P / 'trailer.mp4', '-frames:v', '1', '-vf', 'scale=1280:-1', '-q:v', '3', MEDIA / 'trailer-poster.jpg')
ff('-ss', 4.5, '-i', P / 'trailer.mp4', '-frames:v', '1', '-vf', 'scale=232:-1', '-q:v', '4', MEDIA / 'thumb-trailer.jpg')
ff('-i', P / 'shots' / shots[0], '-vf', 'crop=1920:896:0:92,scale=920:430', '-q:v', '3', MEDIA / 'capsule.jpg')
for c in ['tour', 'closeup', 'glow', 'islands', 'pan']:
    ff('-ss', 1, '-t', 6, '-i', P / 'clips' / f'{c}.mp4', '-an', '-vf', 'scale=960:540:flags=lanczos,fade=t=in:d=0.3,fade=t=out:st=5.7:d=0.3',
       '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', MEDIA / f'loop-{c}.mp4')
for s in shots:
    st = Path(s).stem
    ff('-i', P / 'shots' / s, '-q:v', '3', MEDIA / f'{st}-full.jpg')
    ff('-i', P / 'shots' / s, '-vf', 'scale=1280:-1', '-q:v', '3', MEDIA / f'{st}.jpg')
    ff('-i', P / 'shots' / s, '-vf', 'scale=232:-1', '-q:v', '4', MEDIA / f'thumb-{st}.jpg')

style = src[src.index('<style>') + 7:src.index('</style>')]
# Store pages are dark: the dark tokens become the default.
dark = '--bg:#0f1c1f;--panel:#16272b;--ink:#e3ece6;--soft:#a3b5ae;--rule:#2c4446;\n  --water:#0a2a31;--water2:#061b20;--pearl:#6cc5cf;--ess:#b893ea;--pts:#e3a74b;--key:#21363a;'
style = re.sub(r':root\{\n  --bg:#efe6cf.*?--key:#fffaf0;', ':root{\n  ' + dark, style, count=1, flags=re.S)
style = re.sub(r'@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-theme="light"\]\)\{.*?\}\}\n:root\[data-theme="dark"\]\{.*?\}\n', '', style, count=1, flags=re.S)
guide = src[src.index('<main class="wrap">') + len('<main class="wrap">'):src.index('</main>')]
nav = src[src.index('<nav'):src.index('</nav>') + 6]

ALT = {
    'islands-day': 'Islands raised in a long-kept pond, green and terraced, by day',
    'islands-dusk': 'The land up the beach and an island at dusk',
    'interface-card': 'The game with its interface: the animal rail, the pond bar and an animal’s card',
}
def alt(name):
    for k, v in ALT.items():
        if k in name:
            return v
    m = re.match(r'\d+-closeup-(.+)-(day|night)', name)
    return f'Close up on a {m.group(1)} {"at night" if m.group(2) == "night" else "in the shallows"}' if m else name
media = [{'kind': 'video', 'src': 'media/trailer.mp4', 'poster': 'media/trailer-poster.jpg', 'thumb': 'media/thumb-trailer.jpg', 'alt': 'Trailer'}]
media += [{'kind': 'img', 'src': f'media/{Path(s).stem}.jpg', 'full': f'media/{Path(s).stem}-full.jpg', 'thumb': f'media/thumb-{Path(s).stem}.jpg', 'alt': alt(Path(s).stem)} for s in shots]

fathoms = f"{info['fathoms']:,}"
day = int(info['days']) + 1

store_css = r"""
/* ---- the store page ---- */
body{background:#0b161a;background-image:radial-gradient(1200px 520px at 50% -120px,#17414a 0,transparent 70%)}
.store{max-width:1100px;margin:0 auto;padding:0 20px}
.store-head{padding:30px 0 14px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.store-head h1{font-size:46px;line-height:1;margin:0;color:#fff}
.store-head .by{color:#8fb0a8;font-size:14px;margin-top:8px}
.store-head .by a{color:#bfe6dc}
.store-head .links{display:flex;gap:8px;flex-wrap:wrap}
.chip{display:inline-block;padding:6px 12px;background:#14323c;border:1px solid #2c5560;color:#d4e8df;text-decoration:none;font-size:13px}
.chip:hover{background:#1c4450}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px;background:#071114cc;border:1px solid #1f3d44;padding:12px}
.hero > *,.cols > *{min-width:0}
.viewer{position:relative;aspect-ratio:16/9;background:#000;overflow:hidden}
.viewer video,.viewer img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;image-rendering:auto}
.viewer button.nav{position:absolute;top:50%;transform:translateY(-50%);width:42px;height:64px;border:0;background:#000a;color:#fff;font-size:26px;cursor:pointer;opacity:.0;transition:opacity .2s}
.viewer:hover button.nav,.viewer button.nav:focus-visible{opacity:1}
.viewer .prev{left:0}.viewer .next{right:0}
.viewer a.full{position:absolute;right:10px;bottom:10px;background:#000a;color:#fff;font-size:12px;padding:4px 8px;text-decoration:none}
.strip{display:flex;gap:6px;overflow-x:auto;padding:8px 0 2px;scrollbar-width:thin;scrollbar-color:#2c5560 transparent}
.strip button{flex:none;width:116px;aspect-ratio:16/9;padding:0;border:2px solid transparent;background:#000;cursor:pointer;position:relative;opacity:.7}
.strip button[aria-current="true"]{border-color:#f5d66b;opacity:1}
.strip button:hover{opacity:1}
.strip img{width:100%;height:100%;object-fit:cover;display:block}
.strip .playmark{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:22px;text-shadow:0 0 6px #000}
.side{display:flex;flex-direction:column;gap:12px;min-width:0}
.side .capsule{width:100%;aspect-ratio:920/430;object-fit:cover;display:block;border:1px solid #1f3d44}
.side .blurb{font-size:14px;line-height:1.55;color:#c7dcd5;margin:0}
.facts{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px;margin:0}
.facts dt{color:#6f8f88;text-transform:uppercase;letter-spacing:.06em;font-size:11px;padding-top:2px}
.facts dd{margin:0;color:#c7dcd5}
.facts dd a{color:#6cc5cf}
.tags{display:flex;flex-wrap:wrap;gap:5px}
.tags span{font-size:11px;padding:3px 8px;background:#14323c;color:#9fc4bb;border:1px solid #23474f}
.buy{margin:22px 0 6px;background:linear-gradient(90deg,#123842,#0e2a31);border:1px solid #2a5662;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.buy h2{margin:0;padding:0;border:0;font-size:20px;color:#fff}
.buy p{margin:4px 0 0;font-size:13px;color:#9fc4bb}
.buy .act{display:flex;align-items:center;gap:0}
.buy .price{background:#000;color:#bfe6dc;padding:0 14px;height:48px;display:grid;place-items:center;font-size:15px}
.play{display:inline-flex;align-items:center;gap:10px;height:48px;padding:0 26px;background:linear-gradient(180deg,#8be04c,#4c9c1d);color:#0a1c05;font:18px var(--pixel);text-decoration:none;border:0;box-shadow:inset 0 -3px 0 #2f6a10}
.play:hover{background:linear-gradient(180deg,#a3f067,#5bb126)}
.play:focus-visible{outline:3px solid #f5d66b;outline-offset:3px}
.buy.alt{background:#0d1f24}
.buy.alt .play{background:linear-gradient(180deg,#56b6c6,#2a7f8e);color:#04161a;box-shadow:inset 0 -3px 0 #1b5862}
.cols{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:28px;margin-top:26px}
.sec-title{border-top:0;padding-top:0;margin-top:0;font:13px var(--pixel);color:#bfe6dc;letter-spacing:.06em;border-bottom:1px solid #2c5560;padding-bottom:6px;margin:0 0 14px;text-transform:uppercase}
.feature{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:18px;align-items:center;margin:0 0 22px}
.feature:nth-of-type(even){grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)}
.feature:nth-of-type(even) video{order:2}
.feature video{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;border:1px solid #1f3d44;background:#000}
.feature h3{margin:0 0 6px;font-size:18px;color:#fff}
.feature p{font-size:15px;color:#c7dcd5;margin:0}
.aside-box{background:#0d1f24;border:1px solid #1f3d44;padding:14px 16px;margin-bottom:16px;font-size:13px;color:#c7dcd5}
.aside-box h3{margin:0 0 8px;font-size:13px;color:#bfe6dc}
.aside-box ul{margin:0;padding-left:18px}
.aside-box p{margin:0 0 8px}
.aside-box .big{font:22px var(--pixel);color:#f5d66b}
.reqs{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0}
.reqs dt{color:#6f8f88}.reqs dd{margin:0}
.guide-title{margin-top:44px!important}
.guide-wrap{max-width:860px}
@media (max-width:900px){.hero{grid-template-columns:1fr}.cols{grid-template-columns:1fr}.side .capsule{display:none}}
@media (max-width:640px){.store{padding:0 16px}.store-head h1{font-size:34px}.feature,.feature:nth-of-type(even){grid-template-columns:1fr}.feature:nth-of-type(even) video{order:0}.strip button{width:92px}.buy{padding:14px}.play{padding:0 18px}}
"""

features = [
    ('loop-tour', 'A pond that lives on its own', 'Koi, frogs, octopus, eels, crabs and dozens more, each animated from its own joints. They feed, hunt, school, breed and migrate through days and nights, tides and storms, whether you are watching or not. Come back and it has carried on.'),
    ('loop-closeup', 'Breed rare lines', 'Every animal has genes. Albino, piebald and melanistic hide as carriers until two meet; shiny, glow and ghost turn up as mutations. Breed a rare line again and again and it gives you a Paragon, the finest your pond can make.'),
    ('loop-islands', 'Plant it, build it, raise islands', 'Lay down kelp, coral, lilies and reeds that the animals like. Sink a ship for shelter, raise an island terrace by terrace, run a hatchery. Every build changes the water around it.'),
    ('loop-pan', 'It wears deeper', 'The tides, the plants and the life in it slowly wear the pond deeper. Each new depth opens new animals, plants and things to build, and the pond grows outward as the floor falls away. Depth is your score.'),
    ('loop-glow', 'Things down there glow', 'Past the twilight the light gives out, and what lives down there makes its own. Keep going and the water stops being anything like a garden pond.'),
]
feat_html = ''.join(f'''<div class="feature"><video src="media/{v}.mp4" muted loop playsinline autoplay preload="metadata" aria-label="{t}"></video><div><h3>{t}</h3><p>{d}</p></div></div>\n''' for v, t, d in features)

top = f'''<div class="store">
<header class="store-head">
  <div><h1>pond.nz</h1><div class="by">a living pixel-art aquarium · by <a href="https://github.com/sardistic">sardistic</a></div></div>
  <div class="links"><a class="chip" href="#about">About</a><a class="chip" href="#how">How to play</a><a class="chip" href="https://pond.nz">Play</a></div>
</header>

<section class="hero" aria-label="Trailer and screenshots">
  <div>
    <div class="viewer" id="viewer"><button class="nav prev" type="button" aria-label="Previous">‹</button><button class="nav next" type="button" aria-label="Next">›</button></div>
    <div class="strip" id="strip" role="tablist" aria-label="Trailer and screenshots"></div>
  </div>
  <aside class="side">
    <img class="capsule" src="media/capsule.jpg" alt="Islands in a long-kept pond">
    <p class="blurb">A pond you keep in your browser. It runs on its own: feed it, plant it, breed what lives there and build in it, and over the weeks it wears deeper and stranger things move in.</p>
    <dl class="facts">
      <dt>Price</dt><dd>Free</dd>
      <dt>Plays in</dt><dd>Any modern browser, desktop or phone</dd>
      <dt>Saves</dt><dd>In your browser; sign in with Discord to carry ponds between devices</dd>
      <dt>Developer</dt><dd>sardistic</dd>
      <dt>Play at</dt><dd><a href="https://pond.nz">pond.nz</a></dd>
    </dl>
    <div class="tags" aria-label="Tags"><span>Pixel art</span><span>Life sim</span><span>Idle</span><span>Relaxing</span><span>Creature breeding</span><span>Genetics</span><span>Procedural animation</span><span>Free</span><span>Browser</span></div>
  </aside>
</section>

<section class="buy" aria-label="Play">
  <div><h2>Play pond.nz</h2><p>Free · in your browser · nothing to install · your pond saves itself</p></div>
  <div class="act"><span class="price">Free</span><a class="play" href="https://pond.nz">▶ Play now</a></div>
</section>

<div class="cols">
  <div>
    <h2 class="sec-title" id="about">About this game</h2>
{feat_html}  </div>
  <aside>
    <div class="aside-box"><h3>In the footage</h3><p class="big">Day {day}</p><p>{fathoms} fathoms down, in {info['zone']}. {info['animals']} animals of {info['species']} kinds, from a real pond, kept for {day} days.</p></div>
    <div class="aside-box"><h3>Features</h3><ul>
      <li>Procedurally animated animals with their own genes</li>
      <li>Rare morphs, mutations, gifts and curses that breed true</li>
      <li>Day and night, the moon, tides, weather and seasons</li>
      <li>Islands, ships, vents, a hatchery and more to build</li>
      <li>A depth that keeps going, with new life at every stage</li>
      <li>A shared beach: walk into your neighbours' ponds</li>
      <li>Generative soundscape and an original soundtrack</li>
      <li>A timelapse of your pond's whole history, saved as a video</li>
    </ul></div>
    <div class="aside-box"><h3>System requirements</h3><dl class="reqs">
      <dt>Browser</dt><dd>Current Chrome, Edge, Firefox or Safari</dd>
      <dt>Device</dt><dd>Desktop, laptop or phone</dd>
      <dt>Graphics</dt><dd>Any; a GPU adds 3D waves and light</dd>
      <dt>Install</dt><dd>None</dd>
    </dl></div>
  </aside>
</div>

<h2 class="sec-title guide-title" id="how">How to play</h2>
</div>
'''

script = ''''use strict';
// (Paths are relative to this script, so the page works from store/ and from docs/ alike.)
const BASE = new URL('.', document.currentScript.src);
const MEDIA = __MEDIA__.map((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, ['src', 'poster', 'thumb', 'full'].includes(k) ? new URL(v, BASE).href : v])));
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
'''.replace('__MEDIA__', json.dumps(media))

html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="pond.nz, a living pixel-art aquarium in your browser: trailer, screenshots, features and how to play.">
<title>pond.nz · a living pixel-art aquarium</title>
<link rel="icon" href="/favicon.ico">
<link rel="canonical" href="https://pond.nz/store/">
<meta property="og:title" content="pond.nz · a living pixel-art aquarium">
<meta property="og:description" content="A pond you keep in your browser. Free, nothing to install.">
<meta property="og:image" content="https://pond.nz/store/media/trailer-poster.jpg">
<meta property="og:url" content="https://pond.nz/store/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Silkscreen&display=swap" rel="stylesheet">
<style>{style}{store_css}</style>
</head>
<body>
{top}
{nav}
<main class="wrap guide-wrap">
{guide}</main>

<footer><div class="wrap">Footage and screenshots are from a real, long-kept pond on pond.nz. The guide is written for the current version; some things are left out on purpose, so you can find them yourself.</div></footer>
<script src="store.js"></script>
</body>
</html>
'''
(OUT / 'index.html').write_text(html, encoding='utf-8', newline='\n')
(OUT / 'store.js').write_text(script, encoding='utf-8', newline='\n')
# (The same page to open from the repo: its media and script are store/'s.)
local = html.replace('src="media/', 'src="../store/media/').replace('href="media/', 'href="../store/media/').replace('<script src="store.js">', '<script src="../store/store.js">')
(ROOT / 'docs' / 'progression-guide.html').write_text(local, encoding='utf-8', newline='\n')
size = sum(f.stat().st_size for f in MEDIA.iterdir())
print(f'wrote store/ ({size / 1e6:.1f} MB of media) and docs/progression-guide.html')
