"""Film a real pond for the store page and promo videos: screenshots, clips and a cut trailer with music.

  python tools/capture_promo.py all                   # everything, from thomas-pond
  python tools/capture_promo.py stills --pond thomas-pond
  python tools/capture_promo.py clips --only tour,closeup
  python tools/capture_promo.py trailer --track subaquatic-matrix
  python tools/capture_promo.py shorts                # three upright videos for TikTok and Shorts

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


# ---- cutting: the trailer and the shorts --------------------------------------------------------------------------
CARD_HTML = """<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Silkscreen&display=swap" rel="stylesheet">
<style>html,body{margin:0;width:__W__px;height:__H__px;background:transparent;overflow:hidden}
body{font-family:Silkscreen,monospace;color:#fff;display:grid}
.cap{position:absolute;left:0;right:0;bottom:96px;text-align:center;font-size:64px;letter-spacing:2px;text-shadow:0 4px 0 #021014,0 0 26px #021014;padding:0 60px}
.cap small{display:block;font-size:28px;color:#bfe6dc;margin-top:10px}
.card{place-self:stretch;display:grid;place-items:center;text-align:center;background:#071a1f;padding:0 60px}
.card h1{font-size:140px;font-weight:400;margin:0;letter-spacing:4px;text-transform:none}
.card p{font-size:34px;color:#bfe6dc;margin:18px 0 0}
.card .url{color:#f5d66b;font-size:44px;margin-top:40px}
/* Upright (TikTok, Shorts): bigger words, kept clear of the apps' own buttons along the bottom and right. */
.tall .cap{bottom:auto;top:58%;font-size:78px;line-height:1.15;padding:0 110px 0 70px}
.tall .cap small{font-size:36px;margin-top:16px}
.tall .card h1{font-size:150px}
.tall .card p{font-size:44px}
.tall .card .url{font-size:56px}
</style></head><body class="__CLS__">__BODY__</body></html>"""

TITLE_CARD = '<div class="card"><div><h1>pond.nz</h1><p>a living pixel-art aquarium</p></div></div>'
END_CARD = '<div class="card"><div><h1>pond.nz</h1><p>Free, in your browser. Nothing to install.</p><p class="url">Play at pond.nz</p></div></div>'


def overlays(out, items, size=(1920, 1080)):
    """Caption and card images, drawn by the browser in the game's own pixel font."""
    from playwright.sync_api import sync_playwright
    out.mkdir(parents=True, exist_ok=True)
    W, H = size
    html = CARD_HTML.replace('__W__', str(W)).replace('__H__', str(H)).replace('__CLS__', 'tall' if H > W else 'wide')
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        page = b.new_page(viewport={'width': W, 'height': H})
        for name, body in items:
            page.set_content(html.replace('__BODY__', body), wait_until='networkidle')
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


def cut(plan, outfile, tmp, size, track):
    """Join a plan's pieces into one video with music. Each piece is a card (card=html) or a stretch of a clip
    (src, start, secs, speed), with an optional caption (cap, sub), faded in and out unless fin/fout say not."""
    tmp.mkdir(parents=True, exist_ok=True)
    W, H = size
    plan = [p for p in plan if 'card' in p or Path(p['src']).exists()]
    imgs = []
    for i, p in enumerate(plan):
        if 'card' in p:
            imgs.append((f'p{i}', p['card']))
        elif p.get('cap'):
            sub = f'<small>{p["sub"]}</small>' if p.get('sub') else ''
            imgs.append((f'p{i}', f'<div class="cap">{p["cap"]}{sub}</div>'))
    overlays(tmp, imgs, size)
    enc = ['-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', FPS]
    parts = []
    for i, p in enumerate(plan):
        secs, part = p['secs'], tmp / f'{i:02d}.mp4'
        fl = []
        if p.get('fin', True):
            fl.append('fade=t=in:d=0.35')
        if p.get('fout', True):
            fl.append(f'fade=t=out:st={secs - 0.35}:d=0.35')
        fades = ','.join(fl) or 'null'
        if 'card' in p:
            ff('-loop', '1', '-framerate', FPS, '-t', secs, '-i', tmp / f'p{i}.png', '-vf', f'scale={W}:{H},format=yuv420p,{fades}', *enc, part)
        else:
            # (Cover the frame: scaled up to fill it, then centred and cropped.)
            v = (f'[0:v]setpts=PTS/{p.get("speed", 1)},scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},'
                 f'fps={FPS},trim=duration={secs},setpts=PTS-STARTPTS[v]')
            if p.get('cap'):
                ff('-ss', p.get('start', 0), '-i', p['src'], '-loop', '1', '-i', tmp / f'p{i}.png', '-filter_complex', v + f';[v][1:v]overlay=0:0,{fades}[o]',
                   '-map', '[o]', '-t', secs, '-an', *enc, part)
            else:
                ff('-ss', p.get('start', 0), '-i', p['src'], '-filter_complex', v + f';[v]{fades}[o]', '-map', '[o]', '-t', secs, '-an', *enc, part)
        parts.append(part)
    total = sum(p['secs'] for p in plan)
    lst = tmp / 'parts.txt'
    lst.write_text(''.join(f"file '{q.as_posix()}'\n" for q in parts), encoding='utf-8')
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', tmp / 'video.mp4')
    audio = music(track, total, tmp)
    ff('-i', tmp / 'video.mp4', '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', outfile)
    print(f'  {outfile.name} ({total:.0f}s, {W}x{H}, music {track})', flush=True)
    return total


def trailer(info, out, track):
    C = out / 'clips'
    grow = sorted(g for g in (ROOT / 'timelapses').glob('*.mp4') if not g.stem.startswith('tall-'))
    title = info.get('title') or 'Thomas-Pond'
    plan = [{'card': TITLE_CARD, 'secs': 3.5}]
    if grow:
        plan.append({'src': grow[0], 'start': 2, 'secs': 9, 'speed': 3, 'cap': 'Start with a bare pond', 'sub': 'it fills in on its own'})
    plan += [
        {'src': C / 'tour.mp4', 'start': 1, 'secs': 7, 'cap': 'It lives without you', 'sub': 'and remembers what you did'},
        {'src': C / 'closeup.mp4', 'start': 1, 'secs': 6, 'cap': 'Breed rare lines', 'sub': 'every animal has its own genes'},
        {'src': C / 'islands.mp4', 'start': 1, 'secs': 5, 'cap': 'Build, plant, raise islands'},
        {'src': C / 'pan.mp4', 'start': 2, 'secs': 9, 'cap': 'It wears deeper', 'sub': 'day after day, into the dark'},
        {'src': C / 'glow.mp4', 'start': 1, 'secs': 6, 'cap': 'Things down there glow'},
        {'src': C / 'fastforward.mp4', 'start': 2, 'secs': 6, 'cap': f'{title}, day {int(info["days"]) + 1}', 'sub': f'{info["fathoms"]:,} fathoms down'},
        {'card': END_CARD, 'secs': 4.5},
    ]
    cut(plan, out / 'trailer.mp4', out / 'trailer-parts', (1920, 1080), track)
    # A lighter copy for the web page, and its poster frame.
    ff('-i', out / 'trailer.mp4', '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '24',
       '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out / 'trailer-720.mp4')
    ff('-ss', 4.5, '-i', out / 'trailer.mp4', '-frames:v', '1', '-vf', 'scale=1280:-1', '-q:v', '3', out / 'trailer-poster.jpg')


# ---- shorts: upright, for TikTok and YouTube Shorts ----------------------------------------------------------------
TALL = (1080, 1920)


def tall_clips(page, out):
    """Clips filmed upright: the dive from the beach to the deepest water, residents close up, islands, a glow."""
    out.mkdir(parents=True, exist_ok=True)
    P = prepare(page)
    picks = []
    for c in page.evaluate('()=>PR.notable({shallow:0.3})'):
        if c['species'] not in {q['species'] for q in picks}:
            picks.append(c)
        if len(picks) == 5:
            break
    (out / 'residents.json').write_text(json.dumps(picks, indent=1), encoding='utf-8')
    a, b = P['beach'], P['deepest']
    film(page, out, 'dive', 32, lambda: (page.evaluate('a=>PR.look(a[0],a[1],2)', a), page.evaluate('a=>PR.panFrames(a[0],a[1],a[2],a[3],a[4])', [a[0], a[1], b[0], b[1], 32 * FPS])),
         per_frame='()=>PR.panStep(1/30)')
    for n, c in enumerate(picks):
        film(page, out, f'res-{n}', 4.5, lambda c=c: page.evaluate('a=>PR.follow(PR.creature(a[0]),a[1])', [c['i'], 8]))
    if P['isles']:
        isle = P['isles'][len(P['isles']) // 2]
        film(page, out, 'isles', 6, lambda: page.evaluate('a=>PR.look(a[0],a[1],3)', isle))
    glow = page.evaluate('()=>PR.notable({night:true,glowOnly:true})')
    if glow:
        film(page, out, 'glow', 6, lambda: page.evaluate('a=>PR.follow(PR.creature(a[0]),a[1])', [glow[0]['i'], 5]), light='night')
    film(page, out, 'tour', 8, lambda: page.evaluate('()=>PR.tour(5)'))


def tall_growth(seed='misty-reed-42'):
    """A fresh pond's growth, upright (tools/record_timelapse.py), for the before-and-after short."""
    f = ROOT / 'timelapses' / f'tall-{seed}-salt.mp4'
    if not f.exists():
        subprocess.run([sys.executable, '-I', str(ROOT / 'tools' / 'record_timelapse.py'), '--seed', seed, '--habitat', 'salt', '--size', '1080x1920',
                        '--to-tier', '3', '--max-seconds', '40', '--no-captions', '--end-card', '0', '--light', 'day', '--out', str(f)], check=True)
    return f


def shorts(info, out):
    T, S = out / 'tall', out / 'shorts'
    S.mkdir(parents=True, exist_ok=True)
    day, fathoms, title = int(info['days']) + 1, f'{info["fathoms"]:,}', info.get('title') or 'Thomas-Pond'

    def dive(st, secs, cap, sub=None, fin=False, fout=False):
        return {'src': T / 'dive.mp4', 'start': st, 'secs': secs, 'cap': cap, 'sub': sub, 'fin': fin, 'fout': fout}
    # 1. The dive: one unbroken move from the beach down into the deepest water.
    cut([dive(0, 6, f'This pond is {day} days old', fin=True), dive(6, 7, 'It started as a puddle', 'by the beach'),
         dive(13, 9, 'Every day it wears', 'a little deeper'), dive(22, 9.5, f'{fathoms} fathoms', 'down', fout=True),
         {'card': END_CARD, 'secs': 3.5}], S / 'short-dive.mp4', S / 'parts-dive', TALL, 'subdued-progression')
    # 2. Day 1 and day N: a fresh pond growing, then the old one.
    g = tall_growth()
    cut([{'src': g, 'start': 0, 'secs': 3.5, 'cap': 'Day 1', 'sub': 'a bare pond', 'fout': False},
         {'src': g, 'start': 3.5, 'secs': 8, 'speed': 2.5, 'cap': 'It fills in on its own', 'fin': False},
         {'src': T / 'isles.mp4', 'start': 0.5, 'secs': 5, 'cap': f'Day {day}', 'sub': title},
         {'src': T / 'res-0.mp4', 'start': 0.5, 'secs': 3.5, 'cap': f'{info["animals"]} animals', 'sub': f'{info["species"]} kinds'},
         {'src': T / 'glow.mp4', 'start': 0.5, 'secs': 4.5, 'cap': f'{fathoms} fathoms', 'sub': 'down'},
         {'card': END_CARD, 'secs': 3.5}], S / 'short-day1.mp4', S / 'parts-day1', TALL, 'copper-corrosion-and-wire')
    # 3. Meet the residents: who lives here, close up.
    res = json.loads((T / 'residents.json').read_text(encoding='utf-8'))
    plan = [{'src': T / 'tour.mp4', 'start': 0.5, 'secs': 4, 'cap': 'Meet the residents', 'sub': f'of {title}'}]
    for n, c in enumerate(res[:5]):
        rare = c.get('tierName') or ''
        plan.append({'src': T / f'res-{n}.mp4', 'start': 0.5, 'secs': 3.6, 'cap': c['name'] or c['label'],
                     'sub': f'{rare + " " if rare and rare != "Common" else ""}{c["label"].lower()}'})
    plan.append({'card': END_CARD, 'secs': 3.5})
    cut(plan, S / 'short-residents.mp4', S / 'parts-residents', TALL, 'subaquatic-matrix')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('what', choices=['stills', 'clips', 'trailer', 'shorts', 'all'])
    ap.add_argument('--pond', default='thomas-pond')
    ap.add_argument('--refresh', action='store_true', help='fetch the pond again (as a peek)')
    ap.add_argument('--only', default='', help='clips to film, comma separated (tour,closeup,closeup2,glow,pan,islands,fastforward)')
    ap.add_argument('--track', default='subaquatic-matrix', help='music in audio/music for the trailer')
    ap.add_argument('--refilm', action='store_true', help='shorts: film the upright clips again')
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
    if a.what in ('shorts', 'all'):
        if a.refilm or not (out / 'tall' / 'dive.mp4').exists():
            with open_pond(a.pond, size=TALL) as page:
                page.evaluate(DRIVER)
                if not info_f.exists():
                    info_f.write_text(json.dumps(page.evaluate('()=>PR.info()'), indent=1), encoding='utf-8')
                tall_clips(page, out / 'tall')
        shorts(json.loads(info_f.read_text(encoding='utf-8')), out)
    print('done:', out)


if __name__ == '__main__':
    main()
