"""Exercise actual creatures, old/new links, saves and partial floor rendering in Chrome."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True, args=['--mute-audio'])
            page = browser.new_page(viewport={'width': 1000, 'height': 700})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.route('**/api/**', lambda r: r.fulfill(json={}))
            page.route('https://analytics.sardistic.com/**', lambda r: r.abort())
            page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts', JSON.stringify({v:5,world:'small',habitat:'mixed',light:'day'}))")
            page.goto(f'http://127.0.0.1:{server.server_port}/index.html', wait_until='load')
            page.wait_for_function("() => typeof world !== 'undefined' && !!world.erosion && !!world.raster && !document.getElementById('entry')", timeout=60000)
            legacy = (ROOT / 'tools/fixtures/pond-v3.txt').read_text().strip()
            backend = json.loads((ROOT / 'server/species.json').read_text())
            result = page.evaluate('''async ({legacy,backend}) => {
              if(JSON.stringify(Object.keys(SPECIES).sort())!==JSON.stringify(backend))throw Error('Backend catalogue does not match available species');
              world.paused=true; world.noSave=true; world.effects=[]; world.creatures=[]; world.nearGrid=null;
              const old=await decodePond(legacy);
              if (!old || old.creatures[0]?.k!=='koi') throw Error('Legacy v3 pond no longer loads');
              const oldTier=world.erosion.tier;
              world.erosion.tier=0;
              if (deepAvailable(world,'cradleeel')) throw Error('Late species bypasses progression: ' + JSON.stringify({d:DEEP.cradleeel,e:world.erosion}));
              world.erosion.tier=23;
              if (!deepAvailable(world,'cradleeel')) throw Error('Late species cannot unlock');
              for (let i=0;i<FRONTIER_DESIGNS.length;i++) {
                const c=makeCreature(FRONTIER_DESIGNS[i].kind,world,140+(i%8)*50,110+Math.floor(i/8)*35,{},3000+i);
                initLife(c); world.creatures.push(c);
              }
              render();
              const highest=KIND_CODES.at(-1);
              world.succession={want:{[highest]:2},seen:[]};
              world.blight={k:BLIGHT_CODES[1],sp:highest,until:world.days+1};
              world.game.supers=[{k:highest,traits:['glow']}];
              world.game.seas=[{from:0,k:'brine'},{from:100,k:'bone'}];
              const encoded=await encodePond(world), decoded=await decodePond(encoded);
              if (!decoded || decoded.creatures.length!==48 || !decoded.creatures.some(c=>c.k===highest)) throw Error('Extended species links failed: ' + JSON.stringify({decoded:decoded?.creatures?.map(c=>c.k),highest,version:encoded.slice(0,4)}));
              if (decoded.succession?.want[highest]!==2 || decoded.blight?.sp!==highest || decoded.game.supers[0]?.k!==highest) throw Error('Extended species metadata failed');
              if (JSON.stringify(decoded.game.seas)!==JSON.stringify(world.game.seas)) throw Error('Sea history was lost from a link');
              const saved=serializePond(world); storeSave(saved);
              const restored=loadSave(world.seed);
              if (!restored || restored.creatures.length!==48 || !restored.creatures.some(c=>c.k===highest)) throw Error('New species failed to save');
              const geometry=[];
              for (const key of ['pike','frog','crab','ribwalker','ossuaryspider','cradleeel']) {
                const c=makeCreature(key,world,300,180,{},903); initLife(c); c.body.place(c.x,c.y,0);
                if(c instanceof Frog)c.update(0,world);
                const original=[...c.body.x,...c.body.y,...c.body.a];
                world.t=10; playAnim(world,c,'attack',0.35);
                let maxLinkError=0, largestJump=0, previous=null;
                for (let i=0;i<120;i++) {
                  world.t=10+c.anim.dur*i/120;
                  const bent=animBend(c,world.t);
                  for (let j=1;j<c.body.n;j++) maxLinkError=Math.max(maxLinkError,Math.abs(Math.hypot(c.body.x[j]-c.body.x[j-1],c.body.y[j]-c.body.y[j-1])-c.body.links[j-1]));
                  const head=[c.body.x[0],c.body.y[0]];
                  if (previous) largestJump=Math.max(largestJump,Math.hypot(head[0]-previous[0],head[1]-previous[1]));
                  previous=head;
                  if (c instanceof Walker) c.drawLegs(world.raster,c.colA || c.legMat);
                  if(c instanceof Frog)c.draw(world.raster);
                  if (bent) animUnbend(c);
                  if ([...c.body.x,...c.body.y,...c.body.a].some((v,j)=>v!==original[j])) throw Error('Drawing changed physical creature state');
                }
                if (maxLinkError>1e-8 || largestJump>1) throw Error('Attack stretches or jumps');
                geometry.push({key,maxLinkError,largestJump});
              }
              world.creatures=[];world.effects=[];world.blight=null;world.succession=null;
              world.shoreSide=0;world.erosion.tier=23;world.erosion.e=DEPTH_TIERS[23].erosion;
              world.game.seas=FRONTIERS.map((f,i)=>({from:i*90,k:f.key}));
              const base=world.W; growInPlace(850);
              let differences=0,checked=0,positions=[];
              for(const seed of ['frontier-stone','frontier-shadow','frontier-rim']) {
                world.seed=seed;bakeBackground(world);const reference=world.bgBase.slice();
                for (let i=0;i<9;i++) {
                  const rect=[base+i*90+8,60,Math.min(world.W-1,base+i*90+81),210];
                  bakeBackground(world,rect);
                  for (let y=rect[1];y<=rect[3];y++) for(let x=rect[0];x<=rect[2];x++) {checked++;if(world.bgBase[x+y*world.W]!==reference[x+y*world.W]) {differences++;if(positions.length<8)positions.push([seed,x,y,x-rect[0],y-rect[1],rect[2]-x,rect[3]-y]);}}
                }
              }
              if (differences) throw Error(`Partial frontier floor differs in ${differences} pixels: ${JSON.stringify(positions)}`);
              const maxBefore=maxDeepPx, bandsBefore=world.game.seas;
              try {
                maxDeepPx=()=>world.expandPx;world.game.seas=[{from:0,k:'brine'}];
                frontierReached(world);
                if (frontierSampler(world)(world.W-10,100,world.W-10+100*world.W).key!=='nursery') throw Error('Memory cap blocks later habitats');
              } finally { maxDeepPx=maxBefore;world.game.seas=bandsBefore; }
              render();
              return {species:Object.keys(SPECIES).length,newSpecies:48,legacyLink:true,extendedLink:encoded.slice(0,4),savedSpecies:restored.creatures.length,geometry,partialFloor:{checked,differences},frontiers:FRONTIERS.length,cappedHabitatProgression:true};
            }''', {'legacy':legacy,'backend':backend})
            result['errors'] = errors
            assert not errors, errors
            print(json.dumps(result, indent=2))
            browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
