"""Exercise the installed debug app on an adb-connected emulator/device.

Requires websocket-client. Uses only nz.pond.game.debug; never clears release data.
Build first with android/gradlew -p android assembleDebug. Do not run while using
the test device: this sends Home/Back and rotates its display.
"""
import json
from pathlib import Path
import subprocess
import time
import urllib.request
import websocket

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = 'nz.pond.game.debug'
OUT = ROOT / 'dist/google-play/testing'


def adb(*args):
    return subprocess.check_output(['adb', *args], text=True).strip()


class Page:
    def __init__(self):
        deadline = time.monotonic() + 30
        while True:
            try:
                pid = adb('shell', 'pidof', PACKAGE)
                break
            except subprocess.CalledProcessError:
                if time.monotonic() > deadline:
                    raise
                time.sleep(.2)
        adb('forward', 'tcp:9223', 'localabstract:webview_devtools_remote_' + pid)
        deadline = time.monotonic() + 30
        while True:
            try:
                pages = json.load(urllib.request.urlopen('http://127.0.0.1:9223/json'))
                self.ws = websocket.create_connection(pages[0]['webSocketDebuggerUrl'], suppress_origin=True, timeout=30)
                break
            except (OSError, IndexError):
                if time.monotonic() > deadline:
                    raise
                time.sleep(.2)
        self.n = 0
        self.errors = []
        self.remote = []
        self.call('Runtime.enable')
        self.call('Network.enable')

    def call(self, method, params=None):
        self.n += 1
        self.ws.send(json.dumps({'id': self.n, 'method': method, 'params': params or {}}))
        while True:
            r = json.loads(self.ws.recv())
            if r.get('method') == 'Runtime.exceptionThrown':
                self.errors.append(r['params']['exceptionDetails'])
            if r.get('method') == 'Network.requestWillBeSent':
                url = r['params']['request']['url']
                if url.startswith(('http:', 'https:')) and not url.startswith('https://appassets.androidplatform.net/'):
                    self.remote.append(url)
            if r.get('id') == self.n:
                if 'error' in r:
                    raise AssertionError(r['error'])
                return r.get('result', {})

    def evaluate(self, expr):
        r = self.call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True})
        assert 'exceptionDetails' not in r, r
        return r.get('result', {}).get('value')

    def wait(self, expr, timeout=45):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if self.evaluate(expr):
                return
            time.sleep(.15)
        raise AssertionError('Timed out: ' + expr)

    def click(self, selector):
        point = self.evaluate(f"(()=>{{const e=document.querySelector({json.dumps(selector)});e.scrollIntoView();const r=e.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")
        self.call('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [point]})
        self.call('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


def shot(name):
    (OUT / name).write_bytes(subprocess.check_output(['adb', 'exec-out', 'screencap', '-p']))


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    adb('install', '-r', str(ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'))
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('shell', 'am', 'start', '-n', PACKAGE + '/nz.pond.game.MainActivity')
    page = Page()
    page.wait("!!document.querySelector('#entry.ready') || (typeof world!=='undefined'&&!document.getElementById('entry'))")
    if page.evaluate("!!document.getElementById('entry')"):
        page.click('#entry-enter')
    page.wait("typeof world!=='undefined'&&world.game&&!document.getElementById('entry')")
    assert page.evaluate('PondPlatform.android&&PondPlatform.offline&&!PondPlatform.playables')
    assert page.evaluate("!('sdf' in WAVE_LOOKS)")
    assert page.evaluate("!document.querySelector('.pond-support')")
    # The game's history-rewritten root URL must still resolve bundled resources.
    assert page.evaluate("Promise.all(['audio/music.json','fonts/Silkscreen-Regular.ttf','privacy.html'].map(u=>fetch(u).then(r=>r.ok))).then(r=>r.every(Boolean))")
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    seed = page.evaluate('world.seed')
    page.evaluate("world.paused=true;world.game.pearls=54321;careState(world).step=4;careState(world).hidden=true;const c=world.creatures.find(c=>c.life);if(!albumFavorite(world,c))toggleAlbumFavorite(c);pondAndroidSave();localStorage.setItem('pond.skipEntry','1')")
    favorite = page.evaluate('albumState(world).residents[0].id')
    page.evaluate('setEvo(true)')
    adb('shell', 'input', 'keyevent', '4')
    page.wait('!evoUi.open')
    page.evaluate('setHud(true)')
    adb('shell', 'input', 'keyevent', '4')
    page.wait("document.getElementById('hud').classList.contains('hidden')")
    page.evaluate('openAlbum()')
    adb('shell', 'input', 'keyevent', '4')
    page.wait('!document.querySelector("#resident-album[open]")')
    # Backgrounding saves and suspends, returning retains the player's pause choice.
    adb('shell', 'input', 'keyevent', '3')
    page.wait('PondPlatform.paused')
    assert page.evaluate('world.paused&&!PondPlatform.audioAllowed')
    adb('shell', 'am', 'start', '-n', PACKAGE + '/nz.pond.game.MainActivity')
    page.wait('!PondPlatform.paused')
    assert page.evaluate('world.paused')
    assert not page.errors, page.errors
    assert not page.remote, page.remote
    page.ws.close()
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('shell', 'am', 'start', '-n', PACKAGE + '/nz.pond.game.MainActivity')
    page = Page()
    page.wait("typeof world!=='undefined'&&world.game&&!document.getElementById('entry')")
    assert page.evaluate('world.seed') == seed
    assert page.evaluate('world.game.pearls') == 54321
    assert page.evaluate(f'albumState(world).residents.some(r=>r.id==={favorite}&&r.favorite)')
    page.evaluate('world.paused=true')
    shot('phone-game.png')
    # Exercise the native PNG export route and cancel the OS chooser without writing a file.
    page.evaluate("document.getElementById('snapshot').click()")
    time.sleep(1)
    assert 'documentsui' in adb('shell', 'dumpsys', 'activity', 'activities')
    adb('shell', 'input', 'keyevent', '4')
    page.wait('!PondPlatform.paused')
    auto = adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation')
    rotation = adb('shell', 'settings', 'get', 'system', 'user_rotation')
    try:
        adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
        adb('shell', 'settings', 'put', 'system', 'user_rotation', '1')
        page.wait('innerWidth>innerHeight')
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        assert page.evaluate('world.seed') == seed
        shot('landscape-game.png')
    finally:
        adb('shell', 'settings', 'put', 'system', 'user_rotation', rotation)
        adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', auto)
    assert not page.errors, page.errors
    assert not page.remote, page.remote
    report = {'package': PACKAGE, 'androidApi': adb('shell', 'getprop', 'ro.build.version.sdk'),
              'saveAfterProcessRestart': True, 'albumRestored': True, 'backClosesPanels': True,
              'backgroundPause': True, 'photoPicker': True, 'rotation': True, 'errors': page.errors, 'remoteRequests': page.remote}
    (OUT / 'device-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
    page.ws.close()


if __name__ == '__main__':
    run()
