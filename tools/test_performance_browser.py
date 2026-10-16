"""Exercise the actual 60 FPS selector, render paths, light cache and persistence."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
class Server(ThreadingHTTPServer):
    request_queue_size = 128
def run():
    server = Server(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
      with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True, args=['--mute-audio','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
          page = browser.new_page(viewport={'width':1100,'height':800}); errors=[]
          page.on('pageerror', lambda e: errors.append(str(e)))
          page.on('requestfailed', lambda r: errors.append(f'{r.url}: {r.failure}') if '/js/' in r.url else None)
          page.route('**/api/**', lambda r:r.fulfill(json={}))
          page.route('https://analytics.sardistic.com/**', lambda r:r.abort())
          page.add_init_script("if(!localStorage.getItem('procedural-pond.opts'))localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'mixed',light:'night',renderer:'gpu',waves:'classic',volumetrics:false}));localStorage.setItem('pond.skipEntry','1')")
          url=f'http://127.0.0.1:{server.server_port}/index.html'; page.goto(url)
          page.wait_for_function("()=>typeof world!=='undefined'&&!!world.game&&!document.getElementById('entry')",timeout=60000)
          assert not errors, errors
          original=page.evaluate('''()=>{
            world.paused=true;world.noSave=true;world.opts.renderer='cpu';world.opts.waves='sdf';world.opts.hdWaves=false;world.opts.volumetrics=true;world.opts.fine=true;world.opts.shadows=true;syncPerformanceControls();
            world.structures.push(makeStructure('lantern',world,360,200,777));view.k=2;centerOn(360,200);setHud(true);
            document.querySelector('#opt-performance').closest('details').open=true;
            return JSON.stringify({points:world.game.points,pearls:world.game.pearls,days:world.days,pop:world.creatures.length,speed:world.opts.speed,life:world.opts.life});
          }''')
          page.select_option('#opt-performance','60fps')
          result=page.evaluate('''expected=>{
            const check=(v,m)=>{if(!v)throw Error(m)};render();
            check(JSON.stringify({points:world.game.points,pearls:world.game.pearls,days:world.days,pop:world.creatures.length,speed:world.opts.speed,life:world.opts.life})===expected,'Mode changed ecosystem or currency');
            check(!CGL.cv.hidden&&!CGL.failed,'GPU Classic path missing');check(!SDF_GPU.cv||SDF_GPU.cv.hidden,'Seascape still drawn');check(!VOL.cv||VOL.cv.hidden,'Volumetrics still drawn');
            check(world.opts.renderer==='cpu'&&world.opts.waves==='sdf'&&world.opts.volumetrics&&world.opts.fine&&world.opts.shadows,'Preferences overwritten');
            check(document.querySelector('#opt-waves').disabled&&document.querySelector('#opt-waves').textContent==='Waves: Classic','Effective controls disagree');
            check(document.querySelector('#opt-renderer').getAttribute('aria-pressed')==='true','GPU control accessibility state');
            check(world.lightMap.unshadowed&&!world.lightMap.occReady,'Costly shadowed lights still used');
            const upload=cglPlain;let uploads=0;cglPlain=function(...a){if(a[2]==='t_light')uploads++;return upload(...a)};
            try{for(let i=0;i<3;i++){PERFORMANCE.lights.at=performance.now();render();}}finally{cglPlain=upload;}
            check(uploads===0,'Cached lights uploaded again');
            const base=Raster.prototype.compose;let cpu=0;Raster.prototype.compose=function(...a){cpu++;return base.apply(this,a)};
            try{
              render(true);check(cpu>0&&!world.raster.skipShadows,'Photo lost chosen detail');
              render();check(world.raster.skipShadows,'Performance did not resume after photo');
              CGL.failed=true;const before=cpu;render();check(cpu>before&&CGL.cv.hidden,'GPU failure did not restore CPU');CGL.failed=false;
              view.k=8;centerOn(360,200);render();check(!FINE.rec&&!CGL.cv.hidden,'Close-up layer re-enabled expensive CPU path');
            }finally{Raster.prototype.compose=base;}
            // Full-world reference versus clipped particle work: identical visible
            // dots (including glowing snow), fewer shore tests outside the camera.
            const M=world.motes,depth=world.depth,shore=world.shore,tier=world.erosion.tier,clip=[200,100,400,250];
            world.depth=new Uint8Array(world.W*world.H).fill(255);world.erosion.tier=7;let tests=0;
            world.shore=new Proxy(shore,{get(t,k){if(typeof k==='string'&&/^[0-9]+$/.test(k))tests++;return t[k]}});
            const collect=bound=>{const dots=[],r={clip:bound,dot(x,y,z,m,id){if(Math.floor(x)>=clip[0]&&Math.floor(x)<=clip[2]&&Math.floor(y)>=clip[1]&&Math.floor(y)<=clip[3])dots.push([x,y,z,id,this.alpha])}};M.draw(r,world);return dots;};
            let all,visible,total,local;
            try{all=collect([0,0,world.W-1,world.H-1]);total=tests;tests=0;visible=collect(clip);local=tests;}
            finally{world.shore=shore;world.depth=depth;world.erosion.tier=tier;}
            check(JSON.stringify(all)===JSON.stringify(visible),'Particle clipping changed visible pixels');check(local<total,'Particle work still spans the whole pond');
            view.k=2;centerOn(360,200);return {visualOverrides:true,ecosystemIntact:true,cachedUploads:uploads,photo:true,fallback:true,closeup:true,particleShoreTests:[total,local]};
          }''',original)
          page.select_option('#opt-performance','quality')
          restored=page.evaluate('''()=>{render();return {cpu:!CGL.cv||CGL.cv.hidden,sdf:!SDF_GPU.cv.hidden,volume:!VOL.cv.hidden,shadows:!world.raster.skipShadows,controls:!document.querySelector('#opt-waves').disabled,chosen:world.opts.renderer==='cpu'&&world.opts.waves==='sdf'&&world.opts.volumetrics};}''')
          assert all(restored.values()), restored
          page.select_option('#opt-performance','60fps')
          page.evaluate('world.paused=false'); page.wait_for_timeout(1500)
          assert page.evaluate("PERFORMANCE.fps>0&&world.t>0"), 'No running simulation/FPS measurement'
          page.reload();page.wait_for_function("()=>typeof world!=='undefined'&&!!world.game&&!document.getElementById('entry')",timeout=60000)
          assert page.evaluate("world.opts.performance==='60fps'&&world.opts.renderer==='cpu'&&world.opts.waves==='sdf'&&world.opts.volumetrics&&document.querySelector('#opt-performance').value==='60fps'"), 'Device preference or original settings lost on reload'
          page.set_viewport_size({'width':390,'height':844})
          page.evaluate("world.noSave=true;world.paused=true;setHud(true);document.querySelector('#opt-performance').closest('details').open=true")
          page.locator('#opt-performance').scroll_into_view_if_needed()
          assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"), 'Phone overflow'
          (ROOT/'dist').mkdir(exist_ok=True);page.screenshot(path=str(ROOT/'dist/performance-phone.png'))
          assert not errors,errors
          print(json.dumps({**result,'restored':restored,'persistence':True,'measuredFPS':True,'phone':True,'errors':errors},indent=2))
        except Exception:
          print(json.dumps({'errors':errors,'entry':page.locator('#entry').inner_text() if page.locator('#entry').count() else None},indent=2))
          raise
        finally:browser.close()
    finally:server.shutdown();server.server_close()
if __name__=='__main__':run()
