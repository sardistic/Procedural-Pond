"""Read a public pond into a frozen local fixture; profile without remote writes.
Run: python tools/profile_large_pond.py --label baseline --seconds 5
Results/fixture stay in ignored .agent/runtime. Requires Playwright and Chrome.
"""
import argparse, json
from collections import defaultdict
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def translate_path(self,path):
        p=super().translate_path(path)
        return p if Path(p).exists() else super().translate_path('/index.html')
class Server(ThreadingHTTPServer):
    request_queue_size=128
def run():
    parser=argparse.ArgumentParser();parser.add_argument('--label',default='baseline');parser.add_argument('--pond',default='thomas-pond');parser.add_argument('--seconds',type=float,default=5);parser.add_argument('--view',choices=['islands','beach','deep'],default='islands');parser.add_argument('--software',action='store_true');parser.add_argument('--root',type=Path)
    parser.add_argument('--performance',choices=['quality','60fps'],default='quality');a=parser.parse_args()
    runtime=ROOT/'.agent/runtime';runtime.mkdir(exist_ok=True)
    fixture=runtime/f'profile-fixture-{a.pond}.json'
    server=Server(('127.0.0.1',0),partial(Quiet,directory=str(a.root or ROOT)));Thread(target=server.serve_forever,daemon=True).start()
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--mute-audio','--enable-precise-memory-info']+(['--use-angle=swiftshader','--enable-unsafe-swiftshader'] if a.software else ['--use-angle=d3d11']))
        try:
          ctx=browser.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
          page.on('requestfailed',lambda r: errors.append(f'{r.url}: {r.failure}') if '/js/' in r.url else None)
          if not fixture.exists():
            r=ctx.request.get(f'https://pond.nz/api/ponds/{a.pond}?peek=1');assert r.ok,r.status
            fixture.write_text(r.text(),encoding='utf-8')
          data=json.loads(fixture.read_text(encoding='utf-8'));assert data.get('save'),list(data)
          page.route('**/api/**',lambda r:r.fulfill(json=data if '/api/ponds/' in r.request.url and r.request.method=='GET' else {}))
          page.route('https://analytics.sardistic.com/**',lambda r:r.abort())
          page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,light:'night',renderer:'gpu',waves:'sdf',volumetrics:true,speed:1}))")
          page.goto(f'http://127.0.0.1:{server.server_port}/{a.pond}?observe=1',wait_until='load',timeout=120000)
          page.wait_for_function("()=>typeof world!=='undefined'&&world.creatures.length>0&&!document.getElementById('entry')",timeout=120000)
          assert not errors,errors
          info=page.evaluate('''([kind,preset])=>{
            world.opts.performance=preset;
            world.observe=null;world.noSave=true;setHud(false);closeWindows();cam.follow=null;cam.tour=false;view.glide=null;view.r=0;view.k=2;
            const islands=world.structures.filter(s=>s.kind==='island');
            const target=kind==='beach'?coastXY(world,40,(world.shoreSide<2?world.H:world.W)/2):kind==='islands'&&islands.length?[islands[islands.length>>1].x,islands[islands.length>>1].y]:[world.W/2,world.H*.6];
            centerOn(...target);window.__profileTarget=target;
            const stats=window.__parts={};
            const wrap=(obj,key,name)=>{const f=obj[key];if(typeof f!=='function')return;obj[key]=function(...args){const t=performance.now();try{return f.apply(this,args)}finally{const e=stats[name]||(stats[name]={calls:0,total:0,max:0}),d=performance.now()-t;e.calls++;e.total+=d;e.max=Math.max(e.max,d);}}};
            for(const key of ['update','render','buildLights','splat','occluders','drawVolumetric','volumeLights','volLayers','drawSeascape','hinterTick','hudTick','runJobs','bakeTick','growTick','drawMinimap','updateZones','updateLife','updatePlantLife','updateStructures'])wrap(window,key,key);
            wrap(Raster.prototype,'compose','Raster.compose');wrap(Sound,'update','Sound.update');
            const gl=CGL.gl||VOL.gl||SDF_GPU.gl,e=gl&&gl.getExtension('WEBGL_debug_renderer_info');
            return {W:world.W,H:world.H,creatures:world.creatures.length,plants:world.plants.length,pads:world.pads.length,structures:world.structures.length,islands:islands.length,target,boost:offeringTimeRate(world),speed:world.opts.speed,renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown'};
          }''',[a.view,a.performance])
          print(json.dumps({'label':a.label,'info':info}),flush=True)
          # Finish initial scenery/icon/forest work before comparing steady-state modes.
          page.wait_for_function("()=>!JOBS.length&&!HINTER.job&&!BAKE_DIRTY.some(r=>bakeInterest().some(q=>rectsMeet(r,q)))",timeout=120000)
          page.wait_for_timeout(3000)
          cdp=ctx.new_cdp_session(page);cdp.send('Profiler.enable');cdp.send('Profiler.setSamplingInterval',{'interval':1000});results=[]
          for mode,vol in ([('sdf',True)] if a.performance=='60fps' else [('sdf',True),('sdf',False),('classic',True),('classic',False)]):
            page.evaluate('''([mode,vol])=>{world.opts.waves=mode;world.opts.volumetrics=vol;}''',[mode,vol]);page.wait_for_timeout(1500)
            page.evaluate('''()=>{for(const k of Object.keys(__parts))delete __parts[k];window.__gaps=[];window.__sample=true;let last=performance.now();const tick=()=>{if(!__sample)return;const now=performance.now();__gaps.push(now-last);last=now;requestAnimationFrame(tick)};requestAnimationFrame(tick);}''')
            profile=not results
            if profile:cdp.send('Profiler.start')
            page.wait_for_timeout(int(a.seconds*1000))
            prof=cdp.send('Profiler.stop')['profile'] if profile else None
            r=page.evaluate('''()=>{__sample=false;const f=__gaps.slice(2).sort((a,b)=>a-b),q=p=>f[Math.min(f.length-1,Math.floor(f.length*p))]||0,mean=f.reduce((a,b)=>a+b,0)/f.length,o=typeof performanceOptions==='function'?performanceOptions(world):world.opts;return{frames:f.length,median:q(.5),mean,fps:1000/mean,p95:q(.95),max:q(1),preset:world.opts.performance||'quality',effectiveWaves:o.waves,effectiveVolumes:o.volumetrics,detail:typeof PERFORMANCE!=='undefined'?PERFORMANCE.level:null,parts:Object.entries(__parts).map(([name,e])=>({name,avg:e.total/e.calls,max:e.max,calls:e.calls,total:e.total})).sort((a,b)=>b.total-a.total),heapMB:performance.memory?performance.memory.usedJSHeapSize/1048576:null,quality:QUALITY.level,volumeFailed:VOL.failed,seaFailed:SDF_GPU.failed};}''')
            r.update(mode=mode,volumetrics=vol)
            if prof:
                nodes={n['id']:n for n in prof['nodes']};times=defaultdict(float)
                for sid,dt in zip(prof.get('samples',[]),prof.get('timeDeltas',[])):
                    cf=nodes[sid]['callFrame'];key=f"{cf['functionName'] or '(anonymous)'} {cf['url'].rsplit('/',1)[-1]}:{cf['lineNumber']+1}";times[key]+=dt/1000
                r['cpuTop']=sorted(times.items(),key=lambda v:-v[1])[:35]
            results.append(r);print(json.dumps({'mode':mode,'volume':vol,**{k:r[k] for k in ['frames','median','p95']},'top':r['parts'][:7],'cpuTop':r.get('cpuTop',[])[:12]}),flush=True)
          out={'label':a.label,'info':info,'results':results,'errors':errors}
          (runtime/f'large-pond-{a.label}-{a.view}.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
          assert not errors,errors
        finally:browser.close()
    finally:server.shutdown();server.server_close()
if __name__=='__main__':run()
