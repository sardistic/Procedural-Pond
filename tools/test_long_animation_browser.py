"""Measure every displayed Leviathan joint while it swims and receives repeated actions."""
from http.server import ThreadingHTTPServer
from functools import partial
from threading import Thread
import json
from playwright.sync_api import sync_playwright
from test_animals_browser import Quiet, ROOT

def run():
    ThreadingHTTPServer.request_queue_size=128
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--mute-audio'])
            page=browser.new_page(viewport={'width':960,'height':600})
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.route('**/api/**',lambda r:r.fulfill(json={}))
            page.route('https://analytics.sardistic.com/**',lambda r:r.abort())
            page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'mixed',light:'day'}))")
            page.goto(f'http://127.0.0.1:{server.server_port}/index.html',wait_until='load')
            page.wait_for_function("() => typeof world!=='undefined'&&!!world.erosion&&!document.getElementById('entry')",timeout=60000)
            result=page.evaluate('''() => {
              const check=(ok,why)=>{if(!ok)throw Error(why)};
              world.paused=true;world.noSave=true;closeWindows();world.shore=null;world.depth=new Uint8Array(world.W*world.H).fill(255);
              world.creatures=[];world.food=[];world.rocks=[];world.nearGrid=null;world.effects=[];
              const outcomes=[];
              for(const kind of ['leviathan','eel','pike','sleeper'])for(const size of [1,2.5])for(const action of ['attack','eat','hit','flee']){
                const c=makeCreature(kind,world,world.W*0.65,world.H/2,{},901);
                initLife(c,{genome:{...genomeFor(c.seed),size,length:1,girth:1}});c.heading=0;c.body.place(c.x,c.y,0);
                c.life.energy=0.6;c.tx=c.x+100;c.ty=c.y+15;c.timer=10;c.tz=c.z;
                world.creatures=[c];world.t=20;playAnim(world,c,action,0.16);
                let previous=null,maxJump=0,maxPhysical=0,maxLinkError=0,maxPoseStep=0,previousBase=null,previousOffset=null,peak=null;
                for(let i=0;i<180;i++){
                  world.t=20+i/60;c.update(1/60,world);
                  // Real repeated contacts at 0.6-second intervals, during recovery.
                  if(i%36===0)playAnim(world,c,action,0.16);
                  const B=c.body,base=[...B.x,...B.y,...B.a],baseXY=Array.from(B.x,(x,j)=>[x,B.y[j]]);
                  const posed=animBend(c,world.t),shown=Array.from(B.x,(x,j)=>[x,B.y[j]]);
                  const offset=shown.map((p,j)=>[p[0]-baseXY[j][0],p[1]-baseXY[j][1]]);
                  for(let j=1;j<B.n;j++)maxLinkError=Math.max(maxLinkError,Math.abs(Math.hypot(B.x[j]-B.x[j-1],B.y[j]-B.y[j-1])-B.links[j-1]));
                  if(previous)for(let j=0;j<B.n;j++){
                    maxJump=Math.max(maxJump,Math.hypot(shown[j][0]-previous[j][0],shown[j][1]-previous[j][1]));
                    maxPhysical=Math.max(maxPhysical,Math.hypot(baseXY[j][0]-previousBase[j][0],baseXY[j][1]-previousBase[j][1]));
                    const step=Math.hypot(offset[j][0]-previousOffset[j][0],offset[j][1]-previousOffset[j][1]);
                    if(step>maxPoseStep){maxPoseStep=step;peak={frame:i,joint:j,p:(world.t-c.anim.at)/c.anim.dur,heading:B.a[0]};}
                  }
                  previous=shown;previousBase=baseXY;previousOffset=offset;
                  c.draw(world.raster,world.t,world);
                  if(posed)animUnbend(c);
                  check([...B.x,...B.y,...B.a].every((v,j)=>v===base[j]),'Pose changed physical spine');
                }
                check(maxLinkError<1e-8,kind+' body stretched');
                const limit={attack:4,eat:2,hit:5,flee:7}[action];
                check(maxPoseStep<limit,kind+' '+action+' pose stepped '+maxPoseStep);
                outcomes.push({kind,size,action,joints:c.body.n,maxJump,maxPhysical,maxPoseStep,maxLinkError,peak});
              }
              return outcomes;
            }''')
            assert not errors,errors
            (ROOT/'dist/long-animation-report.json').write_text(json.dumps({'cases':result,'errors':errors},indent=2))
            print(json.dumps({'cases':len(result),'worst':sorted(result,key=lambda r:r['maxPoseStep'],reverse=True)[:6],'errors':errors},indent=2))
            browser.close()
    finally:
        server.shutdown()

if __name__=='__main__':
    run()
