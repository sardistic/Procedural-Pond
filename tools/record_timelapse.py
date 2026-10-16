"""Record a timelapse of a pond growing, as an MP4 for trailers and posts.

The pond runs far faster than real time in a headless Chrome, played by a simple keeper (feeding, planting,
building, adding the kinds that have arrived), and each frame is captured with the interface hidden and a
caption whenever the pond reaches a new depth.

  python tools/record_timelapse.py --seed misty-reed-42 --habitat salt --to-tier 3

Videos go to timelapses/ (ignored by git) unless --out says otherwise.

Needs Playwright (Chrome) and ffmpeg on PATH (or --ffmpeg).
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--seed', default='misty-reed-42')
    ap.add_argument('--habitat', choices=['salt', 'fresh', 'mixed'], default='salt')
    ap.add_argument('--to-tier', type=int, default=3, help='stop after reaching this depth tier (2 twilight, 3 midnight, 4 abyss)')
    ap.add_argument('--hold', type=float, default=4, help='seconds of video to keep after the last tier is reached')
    ap.add_argument('--max-seconds', type=float, default=90, help='cap on video length before the end card')
    ap.add_argument('--sim-per-frame', type=float, default=1.5, help='sim seconds per frame at the start (grows with depth)')
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--size', default='1280x720')
    ap.add_argument('--zoom', type=int, default=0, help='pixels per pond pixel (0: just covers the window)')
    ap.add_argument('--light', choices=['cycle', 'day', 'dusk', 'night'], default='cycle')
    ap.add_argument('--renderer', choices=['cpu', 'gpu'], default='cpu')
    ap.add_argument('--no-autoplay', action='store_true', help='leave the pond alone instead of playing it')
    ap.add_argument('--no-captions', action='store_true')
    ap.add_argument('--day-counter', action='store_true')
    ap.add_argument('--end-card', type=float, default=3, help='seconds of pond.nz end card (0 for none)')
    ap.add_argument('--end-line', default='Keep a pond. See how deep it goes.')
    ap.add_argument('--crf', type=int, default=18, help='x264 quality: 18 a master for editing (big), 22-23 to post directly')
    ap.add_argument('--out', default='', help='output .mp4 (default timelapses/<seed>-<habitat>.mp4)')
    ap.add_argument('--ffmpeg', default=shutil.which('ffmpeg') or r'C:\ffmpeg\bin\ffmpeg.exe')
    a = ap.parse_args()
    W, H = (int(v) for v in a.size.lower().split('x'))
    if not a.out:
        a.out = str(ROOT / 'timelapses' / f'{a.seed}-{a.habitat}.mp4')
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)

    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    ff = subprocess.Popen([a.ffmpeg, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(a.fps), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', str(a.crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', a.out],
                          stdin=subprocess.PIPE)
    frames, started = 0, time.time()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=CHROME, headless=True,
                                  args=['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            page = b.new_page(viewport={'width': W, 'height': H})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.route('**/api/**', lambda r: r.fulfill(json={}))
            page.route('https://analytics.sardistic.com/**', lambda r: r.abort())
            opts = {'v': 5, 'habitat': a.habitat, 'world': 'auto'}
            page.add_init_script(f"localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',{json.dumps(json.dumps(opts))})")
            page.goto(f'http://127.0.0.1:{server.server_port}/index.html?pond={a.seed}', wait_until='load')
            page.wait_for_function("typeof world!=='undefined'&&!!world.erosion&&!document.getElementById('entry')", timeout=90000)
            page.evaluate((ROOT / 'tools' / 'timelapse_driver.js').read_text(encoding='utf-8'))
            page.evaluate('o=>TL.init(o)', {'autoplay': not a.no_autoplay, 'light': a.light, 'renderer': a.renderer, 'zoom': a.zoom,
                                            'dayCounter': a.day_counter, 'endLine': a.end_line, 'newKinds': not a.no_captions})
            if a.no_captions:
                page.evaluate('()=>{TL.say=()=>{}}')
            page.wait_for_timeout(500)  # (fonts)

            def shoot():
                nonlocal frames
                page.evaluate('fps=>TL.frame(fps)', a.fps)
                ff.stdin.write(page.screenshot(type='jpeg', quality=92))
                frames += 1

            reached_at, state = None, {}
            while frames < a.max_seconds * a.fps:
                tier = state.get('tier', 0)
                state = page.evaluate('s=>TL.advance(s)', a.sim_per_frame * (1 + 0.8 * tier))
                shoot()
                if reached_at is None and state['tier'] >= a.to_tier:
                    reached_at = frames
                if reached_at is not None and frames - reached_at >= a.hold * a.fps:
                    break
                if frames % (a.fps * 5) == 0:
                    print(f"{frames / a.fps:5.0f}s video  day {state['days']:.1f}  tier {state['tier']}  e {state['e']:.2f}  "
                          f"{state['creatures']} animals  {state['plants']} plants  pond {state['W']}x{state['H']}  "
                          f"({time.time() - started:.0f}s)", flush=True)
            if a.end_card > 0:
                page.evaluate('()=>TL.endCard(true)')
                for _ in range(int(a.end_card * a.fps)):
                    page.evaluate('s=>TL.advance(s)', a.sim_per_frame)
                    shoot()
            log = page.evaluate('()=>TL.log.slice(0,5)')
            b.close()
            if errors or log:
                print('page errors:', errors[:5], 'keeper errors:', log, file=sys.stderr)
            if state.get('tier', 0) < a.to_tier:
                print(f'note: stopped at tier {state.get("tier")} (max length reached before tier {a.to_tier})', file=sys.stderr)
    finally:
        ff.stdin.close()
        ff.wait()
        server.shutdown()
    print(f'wrote {a.out}: {frames} frames, {frames / a.fps:.1f}s, in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
