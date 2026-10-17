"""Film a real pond for the store page and promo videos: screenshots, clips and a cut trailer with music.

  python tools/capture_promo.py all                   # everything, from thomas-pond
  python tools/capture_promo.py stills --pond thomas-pond
  python tools/capture_promo.py clips --only tour,closeup
  python tools/capture_promo.py trailer --track subaquatic-matrix

The pond is a saved copy (tools/promo_page.py: fetched once as a peek, never written back). Clips are stepped a
frame of pond time at a time, so they play smoothly whatever the capture costs. The trailer also uses the
growth timelapse from tools/record_timelapse.py when one exists in timelapses/. Everything goes to promo/
(ignored by git). Needs Playwright (Chrome) and ffmpeg.
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from promo_page import PROMO, ROOT, open_pond  # noqa: E402

FFMPEG = shutil.which('ffmpeg') or r'C:\ffmpeg\bin\ffmpeg.exe'
FPS = 30
DRIVER = (ROOT / 'tools' / 'promo_driver.js').read_text(encoding='utf-8')


def ff(*args):
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', *map(str, args)], check=True)


def prepare(page, light='day'):
    page.evaluate(DRIVER)
    page.evaluate('()=>PR.init()')
    page.evaluate('m=>PR.light(m)', light)
    return page.evaluate('()=>PR.places()')


# ---- stills ----------------------------------------------------------------------------------------------------
def stills(page, out):
    out.mkdir(parents=True, exist_ok=True)
    P = prepare(page)
    shots = []

    def shot(name, light, ui=False, settle=1.5):
        page.evaluate('m=>PR.light(m)', light)
        page.evaluate('on=>PR.ui(on)', ui)
        page.evaluate('s=>PR.settle(s)', settle)
        f = out / f'{name}.png'
        page.screenshot(path=str(f))
        shots.append(f.name)
        print('  still', f.name, flush=True)

    # Wide views: the islands by day and at dusk, the shallows with the drop-off beyond.
    isles = P['isles'] or [P['shallows']]
    page.evaluate('a=>PR.look(a[0],a[1],3)', isles[len(isles) // 2]); shot('01-islands-day', 'day')
    page.evaluate('a=>PR.look(a[0],a[1],2)', isles[0]); shot('02-islands-dusk', 'dusk')
    # Close up on the finest animals in the light (fine detail from 6x), and on what glows, at night.
    day = page.evaluate('()=>PR.notable({shallow:0.3})')
    night = page.evaluate('()=>PR.notable({night:true,glowOnly:true})')
    # (One of each kind: four in the light, the brightest of the night.)
    picked, kinds = [], set()
    for c, light in [(c, 'day') for c in day] + [(c, 'night') for c in night]:
        if c['species'] in kinds or sum(1 for _, l in picked if l == light) >= (4 if light == 'day' else 1):
            continue
        kinds.add(c['species']); picked.append((c, light))
    seen = set()
    for c, light in picked:
        seen.add(c['i'])
        page.evaluate('a=>PR.follow(PR.creature(a[0]),a[1])', [c['i'], 7 if light == 'day' else 5])
        shot(f'{2 + len(seen):02d}-closeup-{c["species"]}-{light}', light, settle=2.5)
    # The game itself: the interface showing, an animal's card open.
    top = (page.evaluate('()=>PR.notable({shallow:0.3})') or page.evaluate('()=>PR.notable()'))[0]
    page.evaluate('a=>PR.follow(PR.creature(a[0]),a[1])', [top['i'], 4])
    shot('20-interface-card', 'day', ui=True, settle=2)
    page.evaluate('()=>{PR.stop();PR.ui(false)}')
    # Thumbnails for the store page.
    for s in shots:
        ff('-i', out / s, '-vf', 'scale=480:-1', '-q:v', '3', out / f'thumb-{Path(s).stem}.jpg')
    # (Which shots are this run's: the store page reads this, so older files left in the folder don't matter.)
    (out / 'shots.json').write_text(json.dumps(shots, indent=1), encoding='utf-8')
    return shots


# ---- clips -----------------------------------------------------------------------------------------------------
class Clip:
    def __init__(self, page, path, crf=18):
        self.page, self.path = page, path
        self.p = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-i', '-',
                                   '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', str(crf), '-pix_fmt', 'yuv420p',
                                   '-movflags', '+faststart', str(path)], stdin=subprocess.PIPE)

    def frame(self):
        self.p.stdin.write(self.page.screenshot(type='jpeg', quality=93))

    def close(self):
        self.p.stdin.close(); self.p.wait()


def film(page, out, name, seconds, setup, per_frame='s=>PR.step(1/30,s)', sim=1, light='day'):
    page.evaluate('m=>PR.light(m)', light)
    setup()
    page.evaluate('()=>PR.settle(1)')
    c, t0 = Clip(page, out / f'{name}.mp4'), time.time()
    for _ in range(int(seconds * FPS)):
        page.evaluate(per_frame, sim)
        c.frame()
    c.close()
    print(f'  clip {name}.mp4 ({seconds}s, {time.time() - t0:.0f}s to film)', flush=True)


def clips(page, out, only=None):
    out.mkdir(parents=True, exist_ok=True)
    P = prepare(page)
    want = lambda n: not only or n in only  # noqa: E731
    best = page.evaluate('()=>PR.notable({shallow:0.3})') or page.evaluate('()=>PR.notable()')
    glow = page.evaluate('()=>PR.notable({night:true,glowOnly:true})')
    if want('tour'):
        film(page, out, 'tour', 14, lambda: page.evaluate('()=>PR.tour(4)'))
    if want('closeup') and best:
        film(page, out, 'closeup', 8, lambda: page.evaluate('a=>PR.follow(PR.creature(a[0]),a[1])', [best[0]['i'], 7]))
    if want('closeup2') and len(best) > 1:
        film(page, out, 'closeup2', 7, lambda: page.evaluate('a=>PR.follow(PR.creature(a[0]),a[1])', [best[1]['i'], 6]))
    if want('glow') and glow:
        film(page, out, 'glow', 8, lambda: page.evaluate('a=>PR.follow(PR.creature(a[0]),a[1])', [glow[0]['i'], 5]), light='night')
    if want('pan'):
        a, b = P['shallows'], P['deep']
        n = 14 * FPS
        film(page, out, 'pan', 14, lambda: (page.evaluate('a=>PR.look(a[0],a[1],3)', a), page.evaluate('a=>PR.panFrames(a[0],a[1],a[2],a[3],a[4])', [a[0], a[1], b[0], b[1], n])),
             per_frame='()=>PR.panStep(1/30)', light='dusk')
    if want('islands') and P['isles']:
        isle = P['isles'][len(P['isles']) // 2]
        film(page, out, 'islands', 8, lambda: page.evaluate('a=>PR.look(a[0],a[1],3)', isle))
    if want('fastforward'):
        # A pond day or so in seconds: light, tides and weather passing over the islands.
        isle = P['isles'][0] if P['isles'] else P['shallows']
        film(page, out, 'fastforward', 10, lambda: page.evaluate('a=>PR.look(a[0],a[1],2)', isle), sim=36, light='cycle')


# ---- the trailer ---------------------------------------------------------------------------------------------------
CARD_HTML = """<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Silkscreen&display=swap" rel="stylesheet">
<style>html,body{margin:0;width:1920px;height:1080px;background:transparent;overflow:hidden}
body{font-family:Silkscreen,monospace;color:#fff;display:grid}
.cap{position:absolute;left:0;right:0;bottom:96px;text-align:center;font-size:64px;letter-spacing:2px;text-shadow:0 4px 0 #021014,0 0 26px #021014}
.cap small{display:block;font-size:28px;color:#bfe6dc;margin-top:10px}
.card{place-self:stretch;display:grid;place-items:center;text-align:center;background:#071a1f}
.card h1{font-size:140px;font-weight:400;margin:0;letter-spacing:4px;text-transform:none}
.card p{font-size:34px;color:#bfe6dc;margin:18px 0 0}
.card .url{color:#f5d66b;font-size:44px;margin-top:40px}
</style></head><body>__BODY__</body></html>"""


def overlays(out, items):
    """Caption and card images, drawn by the browser in the game's own pixel font."""
    from playwright.sync_api import sync_playwright
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        page = b.new_page(viewport={'width': 1920, 'height': 1080})
        for name, body in items:
            page.set_content(CARD_HTML.replace('__BODY__', body), wait_until='networkidle')
            page.evaluate('document.fonts.ready')
            page.screenshot(path=str(out / f'{name}.png'), omit_background=True)
        b.close()


def music(track, seconds, out):
    parts = sorted((ROOT / 'audio' / 'music').glob(f'{track}-*.mp3'))
    if not parts:
        raise SystemExit(f'no music called {track} in audio/music')
    need = int(seconds // 24.37) + 1
    lst = out / 'music.txt'
    lst.write_text(''.join(f"file '{p.as_posix()}'\n" for p in parts[:need]), encoding='utf-8')
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-t', seconds, '-af', f'afade=t=in:d=1.5,afade=t=out:st={seconds - 3}:d=3', '-c:a', 'aac', '-b:a', '192k', out / 'music.m4a')
    return out / 'music.m4a'


def trailer(info, out, track):
    clips_dir, tmp = out / 'clips', out / 'trailer-parts'
    tmp.mkdir(parents=True, exist_ok=True)
    grow = sorted((ROOT / 'timelapses').glob('*.mp4'))
    title = info.get('title') or 'Thomas-Pond'
    # (name, source, seconds, start, speed, caption title, caption line)
    plan = [('card-title', None, 3.5, 0, 1, None, None)]
    if grow:
        plan.append(('grow', grow[0], 9, 2, 3, 'Start with a bare pond', 'it fills in on its own'))
    plan += [
        ('tour', clips_dir / 'tour.mp4', 7, 1, 1, 'It lives without you', 'and remembers what you did'),
        ('closeup', clips_dir / 'closeup.mp4', 6, 1, 1, 'Breed rare lines', 'every animal has its own genes'),
        ('islands', clips_dir / 'islands.mp4', 5, 1, 1, 'Build, plant, raise islands', None),
        ('pan', clips_dir / 'pan.mp4', 9, 2, 1, 'It wears deeper', 'day after day, into the dark'),
        ('glow', clips_dir / 'glow.mp4', 6, 1, 1, 'Things down there glow', None),
        ('fastforward', clips_dir / 'fastforward.mp4', 6, 2, 1, f'{title}, day {int(info["days"]) + 1}', f'{info["fathoms"]:,} fathoms down'),
        ('card-end', None, 4.5, 0, 1, None, None),
    ]
    plan = [p for p in plan if p[1] is None or Path(p[1]).exists()]
    cards = [('card-title', '<div class="card"><div><h1>pond.nz</h1><p>a living pixel-art aquarium</p></div></div>'),
             ('card-end', '<div class="card"><div><h1>pond.nz</h1><p>Free, in your browser. Nothing to install.</p><p class="url">Play at pond.nz</p></div></div>')]
    caps = [(f'cap-{p[0]}', f'<div class="cap">{p[5]}{f"<small>{p[6]}</small>" if p[6] else ""}</div>') for p in plan if p[5]]
    overlays(tmp, cards + caps)
    parts = []
    for name, src, secs, start, speed, cap, _ in plan:
        part = tmp / f'{len(parts):02d}-{name}.mp4'
        fade = f'fade=t=in:d=0.4,fade=t=out:st={secs - 0.4}:d=0.4'
        if src is None:
            ff('-loop', '1', '-framerate', FPS, '-t', secs, '-i', tmp / f'{name}.png', '-vf', f'format=yuv420p,{fade}', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-r', FPS, part)
        else:
            v = f'[0:v]setpts=PTS/{speed},scale=1920:1080:flags=lanczos,fps={FPS},trim=duration={secs},setpts=PTS-STARTPTS[v]'
            if cap:
                v += f';[v][1:v]overlay=0:0:enable=1,{fade}[o]'
                ff('-ss', start, '-i', src, '-loop', '1', '-i', tmp / f'cap-{name}.png', '-filter_complex', v, '-map', '[o]', '-t', secs, '-an',
                   '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '18', '-pix_fmt', 'yuv420p', part)
            else:
                ff('-ss', start, '-i', src, '-filter_complex', v + f';[v]{fade}[o]', '-map', '[o]', '-t', secs, '-an',
                   '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '18', '-pix_fmt', 'yuv420p', part)
        parts.append(part)
    total = sum(p[2] for p in plan)
    lst = tmp / 'parts.txt'
    lst.write_text(''.join(f"file '{p.as_posix()}'\n" for p in parts), encoding='utf-8')
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', tmp / 'video.mp4')
    audio = music(track, total, tmp)
    ff('-i', tmp / 'video.mp4', '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out / 'trailer.mp4')
    # A lighter copy for the web page, and its poster frame.
    ff('-i', out / 'trailer.mp4', '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '24',
       '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out / 'trailer-720.mp4')
    ff('-ss', 4.5, '-i', out / 'trailer.mp4', '-frames:v', '1', '-vf', 'scale=1280:-1', '-q:v', '3', out / 'trailer-poster.jpg')
    print(f'  trailer.mp4 ({total:.0f}s, music {track}) and trailer-720.mp4', flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('what', choices=['stills', 'clips', 'trailer', 'all'])
    ap.add_argument('--pond', default='thomas-pond')
    ap.add_argument('--refresh', action='store_true', help='fetch the pond again (as a peek)')
    ap.add_argument('--only', default='', help='clips to film, comma separated (tour,closeup,closeup2,glow,pan,islands,fastforward)')
    ap.add_argument('--track', default='subaquatic-matrix', help='music in audio/music for the trailer')
    a = ap.parse_args()
    out = PROMO / a.pond
    out.mkdir(parents=True, exist_ok=True)
    info_f = out / 'info.json'
    if a.what in ('stills', 'clips', 'all'):
        with open_pond(a.pond, refresh=a.refresh) as page:
            page.evaluate(DRIVER)
            info = page.evaluate('()=>PR.info()')
            info_f.write_text(json.dumps(info, indent=1), encoding='utf-8')
            print(f"{info['title']}: day {int(info['days']) + 1}, {info['zone']}, {info['fathoms']:,} fathoms, {info['animals']} animals of {info['species']} kinds")
            if a.what in ('stills', 'all'):
                stills(page, out / 'shots')
            if a.what in ('clips', 'all'):
                clips(page, out / 'clips', set(filter(None, a.only.split(','))))
            if page.errors:
                print('page errors:', page.errors[:5], file=sys.stderr)
    if a.what in ('trailer', 'all'):
        trailer(json.loads(info_f.read_text(encoding='utf-8')), out, a.track)
    print('done:', out)


if __name__ == '__main__':
    main()
