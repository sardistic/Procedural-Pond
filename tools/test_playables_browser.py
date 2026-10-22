"""Integration test of the actual exported bundle against a mock SDK.

Requires Playwright for Python and Chrome. Run after build_playables.py.
The mock checks the integration, not YouTube certification or device performance.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json
import time
import mimetypes
from urllib.parse import urlsplit, unquote
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SDK = 'https://www.youtube.com/game_api/v1'
CSP = "default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com/game_api/v1; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob: data:; sandbox allow-pointer-lock allow-same-origin allow-scripts; worker-src 'self' blob:; base-uri 'self'"


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def end_headers(self):
        # Match the platform's relevant restrictions, especially no native modals.
        self.send_header('Content-Security-Policy', CSP)
        super().end_headers()


def run():
    ThreadingHTTPServer.request_queue_size = 128
    server = ThreadingHTTPServer(('127.0.0.1', 37023), partial(Quiet, directory=str(ROOT / 'dist')))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True, args=['--mute-audio'])
            for width, height in [(1280, 800), (390, 844)]:
                saved = ['']
                fail_load = width == 1280
                errors, forbidden = [], []
                ctx = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width < 600)
                ctx.expose_function('captureSave', lambda data: saved.__setitem__(0, data))
                ctx.add_init_script("""window._forbiddenStorageReads = 0; for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { get() { _forbiddenStorageReads++; throw Error('Forbidden browser storage: ' + key); } });""")
                ctx.add_init_script("""window._destinationInputs = []; const originalConnect = AudioNode.prototype.connect;
                  AudioNode.prototype.connect = function(to, ...args) { if (to instanceof AudioDestinationNode) _destinationInputs.push(this); return originalConnect.call(this, to, ...args); };""")
                page = ctx.new_page()
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
                page.on('response', lambda r: errors.append(f'HTTP {r.status}: {r.url}') if r.status >= 400 else None)

                def route(r):
                    if r.request.url == SDK:
                        mock = """window._yt = {calls:[], handlers:{}, failLoads:FAIL};
                        window.ytgame = { IN_PLAYABLES_ENV: true, SDK_VERSION:'test',
                          game: { loadData: async () => { _yt.calls.push('load'); await new Promise(r=>setTimeout(r,200)); if (_yt.failLoads-- > 0) throw Error('Load unavailable'); return SAVED; },
                            saveData: async s => { _yt.calls.push('save'); await captureSave(s); },
                            firstFrameReady: () => _yt.calls.push('first'), gameReady: () => _yt.calls.push('ready') },
                          system: { isAudioEnabled:()=>false, onAudioEnabledChange:f=>_yt.handlers.audio=f,
                            onPause:f=>_yt.handlers.pause=f, onResume:f=>_yt.handlers.resume=f },
                          engagement: {sendScore:async s=>_yt.score=s.value},
                          health: {logWarning:()=>_yt.calls.push('warning'),logError:()=>_yt.calls.push('error')} };""".replace('SAVED', json.dumps(saved[0])).replace('FAIL', str(int(fail_load)))
                        r.fulfill(body=mock, content_type='text/javascript')
                    elif not r.request.url.startswith(origin + '/') or '/api/' in r.request.url:
                        forbidden.append(r.request.url)
                        r.abort()
                    else:
                        # Serve the real export bytes in-process. This avoids Windows
                        # loopback socket failures while keeping the actual browser CSP.
                        asset = (ROOT / 'dist' / unquote(urlsplit(r.request.url).path).lstrip('/')).resolve()
                        if asset.is_dir():
                            asset = asset / 'index.html'
                        if not asset.is_relative_to((ROOT / 'dist').resolve()) or not asset.is_file():
                            errors.append('Missing export asset: ' + r.request.url)
                            r.abort()
                        else:
                            r.fulfill(path=str(asset), content_type=mimetypes.guess_type(str(asset))[0] or 'application/octet-stream', headers={'Content-Security-Policy': CSP})
                page.route('**/*', route)
                start = time.monotonic()
                page.goto(origin + '/youtube-playables/', wait_until='load')
                if fail_load:
                    page.get_by_role('button', name='Retry', exact=True).wait_for()
                    assert page.evaluate("typeof world === 'undefined' && !_yt.calls.includes('save') && !_yt.calls.includes('ready')")
                    page.get_by_role('button', name='Retry', exact=True).click()
                    fail_load = False
                page.wait_for_selector('#entry.ready', timeout=45000)
                load_seconds = round(time.monotonic() - start, 2)
                assert page.evaluate("_yt.calls.indexOf('first') < _yt.calls.indexOf('ready')")
                assert page.evaluate("_yt.calls.filter(c=>c==='ready').length") == 1
                assert page.evaluate("Net.base === null && !mindEligible(world.creatures[0])")
                assert page.locator('#share').is_hidden()
                assert page.locator('a[href]').count() == 0
                if width < 600:
                    page.locator('#entry-enter').tap()
                else:
                    page.locator('#entry-enter').click()
                page.wait_for_selector('#entry', state='detached')
                # Play through a real canvas pointer action; then save a distinctive resource balance.
                page.evaluate("setTool('feed')")
                page.mouse.click(width // 2, height // 2)
                page.evaluate("world.game.pearls = 137; world.game.essence = 83; saveNow()")
                page.wait_for_function("PondPlatform.saveStatus === 'saved'")
                seed = page.evaluate('world.seed')
                assert page.evaluate('''()=>{const b=document.getElementById('opt-performance'),waves=world.opts.waves;
                  b.value='60fps';b.dispatchEvent(new Event('change'));render();
                  const ok=world.opts.performance==='60fps'&&performanceOptions(world).waves==='classic'&&world.opts.waves===waves;
                  b.value='quality';b.dispatchEvent(new Event('change'));return ok;}''')
                assert page.evaluate('''()=>{
                    const b=document.getElementById('opt-performance');b.value='auto';b.dispatchEvent(new Event('change'));
                    world.paused=false;let now=performance.now();
                    for(let i=0;i<900;i++)performanceFrame(world,30,1/60,now+=1000/60);
                    render();world.paused=true;
                    const ok=PERFORMANCE.autoTier===2&&b.value==='auto'&&performanceOptions(world).waves==='classic';
                    b.value='quality';b.dispatchEvent(new Event('change'));return ok;}''')
                assert saved[0] and len(saved[0].encode('utf-16-le')) < 3 * 1024 * 1024
                # Host mute applies even to audio contexts created after the callback.
                page.evaluate("setSound(true); setMusic(true)")
                page.wait_for_function('SFX.ready', timeout=45000)
                assert page.evaluate("PondPlatform.audioAllowed === false")
                assert page.evaluate('Sound.output.gain.value === 0')
                assert page.evaluate('_destinationInputs.length >= 3 && _destinationInputs.every(n => n.gain?.value === 0)')
                page.evaluate("_yt.handlers.audio(true); setPaused(true); _yt.handlers.pause()")
                paused = page.evaluate("({t:world.t,wave:world.waveTime,seed:world.seed})")
                page.keyboard.press('Space')  # Must not change the user's pause preference while host-paused.
                page.wait_for_timeout(600)
                assert paused == page.evaluate("({t:world.t,wave:world.waveTime,seed:world.seed})")
                assert page.evaluate('world.paused')
                assert page.evaluate("!PondPlatform.audioAllowed && Sound.ctx.state === 'suspended' && Music.ctx.state === 'suspended'")
                page.evaluate("_yt.handlers.resume()")
                assert page.evaluate('world.paused')
                page.evaluate("_yt.handlers.audio(false)")
                assert page.evaluate('Sound.output.gain.value === 0')
                page.evaluate('setPaused(false)')
                page.wait_for_function('world.t > ' + str(paused['t']))
                # Reopening restores SDK progress without native browser storage.
                page.reload(wait_until='load')
                page.wait_for_selector('#entry.ready', timeout=45000)
                assert page.evaluate('world.seed') == seed
                assert page.evaluate('world.game.pearls') == 137
                assert page.evaluate('world.game.essence') == 83
                page.locator('#entry-enter').click()
                page.wait_for_selector('#entry', state='detached')
                # New pond and return to the original are SPA transitions.
                page.evaluate('startNewPond()')
                assert page.evaluate('world.seed') != seed
                page.evaluate("openPond(listSaves().find(s=>s.seed===" + json.dumps(seed) + '))')
                assert page.evaluate('world.seed') == seed
                assert page.locator('#bar-name').inner_text() == page.evaluate('pondTitle(world)')
                page.evaluate('setHard(true)')
                assert page.locator('#pond-confirm').is_visible()
                page.get_by_role('button', name='Cancel', exact=True).click()
                assert page.evaluate('!hardMode(world)')
                page.evaluate('setHard(true)')
                page.get_by_role('button', name='Confirm', exact=True).click()
                assert page.evaluate('hardMode(world)')
                days = page.evaluate('world.days')
                page.set_viewport_size({'width': height, 'height': width})
                assert page.evaluate('world.seed') == seed
                assert page.evaluate('world.days') >= days
                page.screenshot(path=str(ROOT / 'dist' / f'playables-{width}.png'))
                assert not errors, errors
                assert not forbidden, forbidden
                assert page.evaluate('_forbiddenStorageReads') == 0
                results.append({'viewport': [width, height], 'readySeconds': load_seconds, 'saveBytes': len(saved[0].encode('utf-16-le')), 'bestDepth': page.evaluate('PondPlatform.bestDepth'), 'errors': errors, 'forbiddenRequests': forbidden})
                ctx.close()
            browser.close()
    finally:
        server.shutdown()
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    run()
