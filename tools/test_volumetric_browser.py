"""Real GPU weather coverage, old-pond motion, local glow and screenshots.
Optional --reference FILE loads an older volumetric.js for visual comparison.
"""
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import argparse,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
class Server(ThreadingHTTPServer):
    request_queue_size=128
def run():
    parser=argparse.ArgumentParser();parser.add_argument('--reference',type=Path);a=parser.parse_args()
    server=Server(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
    try:
      with sync_playwright() as p:
        b=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--mute-audio','--use-angle=d3d11'])
        try:
          page=b.new_page(viewport={'width':1000,'height':740});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
          page.route('**/api/**',lambda r:r.fulfill(json={}));page.route('https://analytics.sardistic.com/**',lambda r:r.abort())
          if a.reference:page.route('**/js/volumetric.js?*',lambda r:r.fulfill(path=str(a.reference.resolve()),content_type='text/javascript'))
          page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'mixed',light:'dusk',renderer:'gpu',waves:'classic',volumetrics:true}))")
          page.goto(f'http://127.0.0.1:{server.server_port}/index.html?pond=quiet-clouds');page.wait_for_function("()=>typeof world!=='undefined'&&!!world.game&&!document.getElementById('entry')",timeout=60000)
          assert not errors,errors
          page.evaluate('''()=>{world.noSave=true;world.paused=true;world.t=1000000;world.waveTime=1000000;world.clock=.27;world.opts.light='night';world.light=lighting();world.darkness=world.light.darkness;world.weather.rain=0;world.weather.gust=.3;world.tide.surf=.7;view.k=2;view.r=0;view.glide=null;cam.follow=null;cam.tour=false;centerOn(world.W/2,world.H/2);setHud(false);render();}''')
          page.wait_for_timeout(400)
          (ROOT/'dist').mkdir(exist_ok=True);label='before' if a.reference else 'after'
          page.screenshot(path=str(ROOT/f'dist/clouds-{label}.png'))
          result=page.evaluate('''reference=>{
            const check=(v,m)=>{if(!v)throw Error(m)},w=world;w.creatures=[];w.plants=[];w.pads=[];w.structures=[];w.game.seas=[];w.erosion.tier=0;w.opts.lights=false;
            w.shore=new Uint8Array(w.W*w.H);w.depth=new Uint8Array(w.W*w.H).fill(150);w.shoreSide=0;w.current.x=.25;w.current.y=.1;w.tide.level=.5;
            const rect=[160,70,560,330],state={time:1000000,sky:0xfff4ead8,darkness:0,visibility:1,swell:.3};
            const draw=()=>{check(drawVolumetric(w,state,rect,{tint:[1,1,1]}),'No volume');const G=VOL,bytes=new Uint8Array(G.cv.width*G.cv.height*4);G.gl.readPixels(0,0,G.cv.width,G.cv.height,G.gl.RGBA,G.gl.UNSIGNED_BYTE,bytes);check(!G.gl.getError(),'WebGL error');return bytes;};
            const metrics=bytes=>{let alpha=0,bright=0,maxAlpha=0,coverage=0,peak=0;const hist=new Uint32Array(256),n=bytes.length/4;for(let i=0;i<bytes.length;i+=4){const a=bytes[i+3];alpha+=a;hist[a]++;maxAlpha=Math.max(maxAlpha,a);bright+=(bytes[i]+bytes[i+1]+bytes[i+2])/3;peak=Math.max(peak,bytes[i],bytes[i+1],bytes[i+2]);if(a>51)coverage++;}let sum=0,p95=0;for(;p95<255;p95++){sum+=hist[p95];if(sum>=n*.95)break;}return{meanAlpha:alpha/n/255,p95Alpha:p95/255,maxAlpha:maxAlpha/255,coverageOver20:coverage/n,meanRGB:bright/n,peakRGB:peak};};
            const cases=[];
            for(const [name,clock,dark,rain,gust,surf,shore] of [['calm',.5,0,0,0,0,false],['night',0,1,0,0,0,false],['dawn',.27,.5,0,0,0,false],['beach',.5,0,0,.3,.7,true],['storm',.5,.4,1,.7,1,true]]){
              w.clock=clock;w.darkness=dark;w.weather.rain=rain;w.weather.gust=gust;w.tide.surf=surf;w.volWet=0;w.volWetAt=w.t;
              w.shore=new Uint8Array(w.W*w.H);if(shore)for(let y=0;y<w.H;y++)for(let x=0;x<260;x++)w.shore[x+y*w.W]=Math.max(0,Math.min(255,Math.round(127+(220-x)*2)));
              state.time=1000000;const first=draw(),m=metrics(first);cases.push({name,...m});
              if(!reference){check(m.coverageOver20<.03,'Weather blankets the view in '+name);check(m.maxAlpha<(rain?.34:.13),'Weather opacity too high in '+name);}
            }
            // A changing breeze on a very old pond must not scramble the texture.
            w.weather.rain=0;w.weather.gust=0;w.darkness=.3;w.clock=.27;w.tide.surf=.7;const first=draw();
            w.current.x+=.001;w.current.y+=.0005;state.time+=1/60;const second=draw();let delta=0;
            for(let i=0;i<first.length;i++)delta+=Math.abs(first[i]-second[i]);delta/=first.length;
            if(!reference)check(delta<.25,'Old pond mist jumps when wind changes: '+delta);
            w.darkness=1;w.clock=0;const dark=metrics(draw()),emit=exoticEmitters;w.opts.lights=true;
            exoticEmitters=()=>[{x:360,y:200,z:10,r:40,col:0xff50ff80,k:1.2}];let glow;
            try{glow=metrics(draw());}finally{exoticEmitters=emit;}
            check(glow.peakRGB>dark.peakRGB+10,'Local neon disappeared with the clouds');
            return{cases,oldPondFrameDelta:delta,glowPeak:glow.peakRGB,darkPeak:dark.peakRGB,renderer:VOL.gl.getParameter(VOL.gl.RENDERER)};
          }''',bool(a.reference))
          assert not errors,errors
          (ROOT/'.agent/runtime'/f'clouds-{label}.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
          print(json.dumps({**result,'reference':bool(a.reference),'errors':errors},indent=2))
        except Exception:
          print(json.dumps({'errors':errors},indent=2));raise
        finally:b.close()
    finally:server.shutdown();server.server_close()
if __name__=='__main__':run()
