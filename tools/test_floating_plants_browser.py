"""Pinned floating plants recover, render and retain their positions after a save."""
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
import json
from playwright.sync_api import sync_playwright
from promo_page import Site, ROOT, CHROME


def run():
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
                    page.add_init_script("localStorage.setItem('pond.skipEntry','1');if(!localStorage.getItem('procedural-pond.opts'))localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'fresh',light:'day'}))")
                    page.goto(f'http://127.0.0.1:{server.server_port}/index.html?pond=floating-edge-test')
                    page.wait_for_function("typeof world!=='undefined'&&world.game&&!document.getElementById('entry')", timeout=60000)
                    positions = page.evaluate("""()=>{
                      world.paused=true;cancelAnimationFrame(frameId);frameId=0;queueFrame=()=>{};
                      setHud(false);closeWindows();document.getElementById('banner').hidden=true;
                      world.creatures=[];world.plants=[];world.pads=[];world.waveField=null;
                      world.shore=null;world.current.x=-.5;world.current.y=0;
                      for(let i=0;i<4;i++){
                        const kind=i%2?'duckweed':'lily',c=makePlant(kind,world,10,50+i*35);
                        c.growth=1;c.vx=c.vy=0;c.x=kind==='lily'?c.r:10;
                        (kind==='lily'?world.pads:world.plants).push(c);
                      }
                      const floats=[...world.pads,...world.plants],money=JSON.stringify(world.game);
                      for(let i=0;i<1200;i++)for(const c of floats)c.update(.05,world);
                      for(const c of floats)if(c.x<(c.make==='lily'?c.r:10)+20)throw Error('Still pinned');
                      if(JSON.stringify(world.game)!==money)throw Error('Drift changed economy');
                      world.shore=new Uint8Array(world.W*world.H);world.rocks=[];world.pebbles=[];world.structures=[];
                      bakeBackground(world);view.r=0;view.k=2;centerOn(80,110);
                      for(const renderer of ['cpu','gpu']){
                        world.opts.renderer=renderer;render();
                        const r=world.raster;
                        for(const c of floats)if(!r.id.includes(c.id))throw Error('Floating plant not rasterized: '+c.make);
                      }
                      saveNow();return floats.map(c=>({seed:c.seed,x:c.x,y:c.y,kind:c.make}));
                    }""")
                    page.screenshot(path=str(ROOT / f'dist/floating-plants-{width}.png'))
                    page.reload()
                    page.wait_for_function("typeof world!=='undefined'&&world.game&&!document.getElementById('entry')", timeout=60000)
                    restored = page.evaluate("""expected=>{
                      world.paused=true;
                      // The pond simulates a few frames after reload before this pause.
                      for(const e of expected){
                        const c=[...world.plants,...world.pads].find(c=>c.seed===e.seed);
                        if(!c||Math.hypot(c.x-e.x,c.y-e.y)>3)throw Error('Saved floating position lost');
                      }return true;
                    }""", positions)
                    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                    assert not errors, errors
                    results.append({'viewport': [width,height], 'edgeRecovery': True, 'cpuGpuRender': True, 'saveRestore': restored, 'errors': errors})
                    page.close()
            finally:
                browser.close()
    finally:
        server.shutdown(); server.server_close()
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    run()
