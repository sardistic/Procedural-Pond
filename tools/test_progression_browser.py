"""Depth estimates refresh when the clock changes without needing erosion or income changes."""
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
import json
from playwright.sync_api import sync_playwright
from promo_page import Site, ROOT, CHROME


def run():
    ThreadingHTTPServer.request_queue_size = 128
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Site, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=CHROME, headless=True, args=['--mute-audio'])
            try:
                for width, height in [(1280, 800), (390, 844)]:
                    page = browser.new_page(viewport={'width': width, 'height': height})
                    errors = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.route('**/api/**', lambda r: r.fulfill(json={}))
                    page.route('https://analytics.sardistic.com/**', lambda r: r.abort())
                    page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'fresh',light:'day'}))")
                    page.goto(f'http://127.0.0.1:{server.server_port}/index.html?pond=progression-test')
                    page.wait_for_function("()=>typeof world!=='undefined'&&world.game&&!document.getElementById('entry')", timeout=60000)
                    labels = page.evaluate("""()=>{
                      cancelAnimationFrame(frameId);frameId=0;queueFrame=()=>{};
                      world.noSave=true;world.paused=false;world.opts.life=true;world.opts.speed=1;
                      world.game.hard=false;world.opts.hard=false;world.days=10;world.opts.dayLength=180;
                      world.erosion.e=1;world.erosion.tier=0;world.erosion.pace=.002;
                      world.game.offerings={sunUntil:0};document.getElementById('banner').hidden=true;setEvo(true);
                      const labels=[],check=(seconds,paused=false)=>{
                        const before=JSON.stringify([world.game,world.erosion]);renderEvo();
                        if(JSON.stringify([world.game,world.erosion])!==before)throw Error('Rendering changed progression');
                        const text=document.getElementById('evo-status').textContent;
                        if(seconds===null){if(text.includes('at the recent pace'))throw Error('Paused estimate');}
                        else if(!text.includes(etaLabel(seconds)+' at the recent pace'))throw Error('Stale estimate: '+text);
                        if(text.includes('Progression is paused.')!==paused)throw Error('Stale pause state');
                        labels.push(text);return text;
                      };
                      check(500);world.opts.speed=3;check(500/3);
                      world.paused=true;check(null,true);world.paused=false;
                      world.opts.speed=1;world.game.hard=true;check(500/HARD_PACE);
                      world.game.hard=false;world.game.offerings.sunUntil=world.days+500/180;check(250);
                      world.days+=380/180;check(440);
                      world.days+=120/180;check(500);
                      world.opts.life=false;check(null,true);world.opts.life=true;check(500);
                      return labels;
                    }""")
                    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                    assert not errors, errors
                    results.append({'viewport': [width, height], 'clockChanges': len(labels), 'errors': errors})
                    page.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    run()
