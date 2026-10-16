"""Validate the upload ZIP in a subfolder inside a sandboxed, separate-origin iframe."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json
import zipfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == '/preview':
            body = f'<html><head><link rel="icon" href="data:,"></head><body style="margin:0"><iframe id="game" src="{self.game_base}/dist/itch/index.html" sandbox="allow-scripts allow-same-origin allow-popups allow-downloads allow-pointer-lock" allow="fullscreen; autoplay" style="border:0;width:100vw;height:100vh"></iframe></body></html>'.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def end_headers(self):
        if self.path == '/preview':
            self.send_header('Content-Security-Policy', f"default-src 'none'; frame-src {self.game_base}; img-src data:; style-src 'unsafe-inline'")
            return super().end_headers()
        self.send_header('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' blob:; worker-src 'self' blob:; media-src 'self' blob:; img-src 'self' data: blob:")
        super().end_headers()


def run():
    with zipfile.ZipFile(ROOT / 'dist/pond-itch.zip') as archive:
        names = archive.namelist()
        assert 'index.html' in names and len(names) <= 1000
        assert not any(n.startswith(('server/', '.agent/', 'docs/')) or 'water-sdf' in n for n in names)
        assert 'analytics.sardistic.com' not in archive.read('index.html').decode()
    ThreadingHTTPServer.request_queue_size = 128
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    Quiet.game_base = base
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True, args=['--mute-audio'])
            for width, height in [(1280, 800), (390, 844)]:
                context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width < 600)
                errors, forbidden = [], []
                context.on('page', lambda page: page.on('pageerror', lambda e: errors.append(str(e))))

                def route(r):
                    url = r.request.url
                    if url.startswith('http://localhost:'):
                        r.continue_()
                    elif not url.startswith(base + '/dist/itch/') or '/api/' in url:
                        forbidden.append(url)
                        r.abort()
                    else:
                        r.continue_()

                context.route('**/*', route)
                page = context.new_page()
                page.goto(f'http://localhost:{server.server_port}/preview', wait_until='load')
                frame = page.frames[1]
                page.on('console',lambda m: errors.append(m.text+' @ '+str(m.location)) if m.type=='error' else None)
                frame.wait_for_selector('#entry.ready', timeout=60000)
                frame.locator('#entry-enter').click()
                frame.wait_for_function("() => typeof world !== 'undefined' && !!world.erosion && !document.getElementById('entry')", timeout=60000)
                first = frame.evaluate('''()=>{
                  world.paused=true;
                  const c=makeCreature('nightnurse',world,world.W/2,world.H/2,{},910);initLife(c);world.creatures.push(c);
                  saveNow();
                  const second=serializePond(world);second.seed='itch-second';storeSave(second);
                  openPond({seed:'itch-second'});
                  const chosen=world.opts.waves,mode=document.getElementById('opt-performance');
                  mode.value='60fps';mode.dispatchEvent(new Event('change'));render();
                  const performanceMode=world.opts.performance==='60fps'&&performanceOptions(world).waves==='classic'&&world.opts.waves===chosen;
                  mode.value='quality';mode.dispatchEvent(new Event('change'));
                  return {seed:world.seed,api:Net.base,kofi:document.querySelector('.pond-support a').href,overflow:document.documentElement.scrollWidth>innerWidth,
                    highest:loadSave(world.seed).creatures.some(c=>c.k==='nightnurse'),looks:Object.keys(WAVE_LOOKS),nativeStorage:!!localStorage.getItem('procedural-pond.saves'),performanceMode};
                }''')
                assert first['seed'] == 'itch-second' and first['highest'] and first['nativeStorage'] and first['performanceMode']
                assert first['api'] is None and not first['overflow']
                assert first['kofi'] == 'https://ko-fi.com/pondnz' and first['looks'] == ['classic', 'mesh']
                assert '/dist/itch/index.html' in frame.url
                frame.evaluate("() => PondPlatform.ask('Test save confirmation',()=>{window.confirmed=true})")
                frame.get_by_role('button', name='Confirm', exact=True).click()
                assert frame.evaluate('() => window.confirmed===true')
                page.reload(wait_until='load')
                frame = page.frames[1]
                frame.wait_for_selector('#entry.ready', timeout=60000)
                frame.locator('#entry-enter').click()
                frame.wait_for_function("() => typeof world !== 'undefined' && !!world.erosion && !document.getElementById('entry')", timeout=60000)
                assert frame.evaluate("() => listSaves().some(s=>s.seed==='itch-second')")
                assert not forbidden, forbidden
                assert not errors, errors
                frame.locator('#show-hud').click()
                frame.wait_for_timeout(600)
                page.screenshot(path=str(ROOT / f'dist/itch-{width}.png'))
                results.append({'size': [width, height], 'saveRestore': True, 'savedPondSwitch': True, 'confirmation': True, 'supportLink': True, 'errors': errors, 'forbiddenRequests': forbidden})
                context.close()
            browser.close()
    except Exception:
        print(json.dumps({'errors':errors,'forbidden':forbidden,'frames':[f.url for f in page.frames]},indent=2))
        raise
    finally:
        server.shutdown()
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    run()
