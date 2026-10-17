"""Open a real pond for filming: a saved copy of it served locally, the way pond.nz would serve it.

The pond is fetched once from pond.nz as a peek (not counted as a visit, so filming adds no visitors or
litter to it) and kept in promo/<name>.json; the page then loads it from a local copy of the site, with
every other API call answered locally, so nothing is ever written back. Used by tools/capture_promo.py.
"""
import json
import urllib.request
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PROMO = ROOT / 'promo'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'


class Site(SimpleHTTPRequestHandler):
    """The static site, with pond addresses (no extension) answered by index.html, as nginx does."""
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = self.path.split('?')[0]
        if path != '/' and '.' not in path.rsplit('/', 1)[-1] and not path.startswith('/api/'):
            self.path = '/index.html'
        return super().do_GET()


def saved_pond(name, refresh=False):
    """The pond's saved copy, fetched from pond.nz as a peek the first time (or with refresh)."""
    PROMO.mkdir(exist_ok=True)
    f = PROMO / f'{name}.json'
    if refresh or not f.exists():
        with urllib.request.urlopen(f'https://pond.nz/api/ponds/{name}?peek=1', timeout=60) as r:
            f.write_bytes(r.read())
    return json.loads(f.read_text(encoding='utf-8'))


@contextmanager
def open_pond(name, size=(1920, 1080), refresh=False, opts=None, gpu=False):
    """A page with the pond open and running normally (its own frame loop), entry screen skipped."""
    got = saved_pond(name, refresh)
    body = json.dumps(got)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Site, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            args = ['--mute-audio'] + ([] if gpu else ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            b = p.chromium.launch(executable_path=CHROME, headless=True, args=args)
            page = b.new_page(viewport={'width': size[0], 'height': size[1]})
            page.errors = []
            page.on('pageerror', lambda e: page.errors.append(str(e)))

            def api(route):
                url = route.request.url
                if route.request.method == 'GET' and f'/api/ponds/{name}' in url:
                    route.fulfill(status=200, content_type='application/json', body=body)
                elif route.request.method == 'GET' and '/api/neighbours' in url:
                    route.fulfill(status=200, content_type='application/json', body='{"west":null,"east":null}')
                else:
                    route.fulfill(status=503, content_type='application/json', body='{}')  # (nothing written, nothing else asked)
            page.route('**/api/**', api)
            page.route('https://analytics.sardistic.com/**', lambda r: r.abort())
            page.route('https://static.cloudflareinsights.com/**', lambda r: r.abort())
            o = {'v': 5, 'sound': False, 'music': False, **(opts or {})}
            page.add_init_script(f"localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',{json.dumps(json.dumps(o))})")
            page.goto(f'http://127.0.0.1:{server.server_port}/{name}', wait_until='load')
            page.wait_for_function("typeof world!=='undefined'&&!!world.erosion&&!document.getElementById('entry')&&world.creatures.length>0", timeout=180000)
            page.wait_for_timeout(1500)
            yield page
            b.close()
    finally:
        server.shutdown()
