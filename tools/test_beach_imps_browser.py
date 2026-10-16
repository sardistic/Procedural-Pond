"""GPU beach joins and actual imp invitations, food, gifts, cues and save round trips."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def run():
    ThreadingHTTPServer.request_queue_size = 128
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True, args=['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            try:
                page = browser.new_page(viewport={'width':1100, 'height':850}); errors=[]
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.route('**/api/**', lambda r:r.fulfill(json={}))
                page.route('https://analytics.sardistic.com/**', lambda r:r.abort())
                page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'mixed',light:'night',volumetrics:false}))")
                page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
                page.wait_for_function("typeof world!=='undefined'&&!!world.game&&!document.getElementById('entry')",timeout=60000)
                seam = page.evaluate('''()=>{
                  world.noSave=true;world.paused=true;world.days=1099.1;world.weather.rain=.6;
                  const prefix=world.seed.split('-').slice(0,2).join('-');for(let n=0;n<1000;n++){const s=prefix+'-'+n;if(withSeed(s+'/'+world.opts.habitat,()=>randi(0,3))===3){world.seed=s;break;}}
                  world.opts.volumetrics=true;world.opts.waves='sdf';world.opts.renderer='gpu';
                  world.light=lighting();world.darkness=world.light.darkness;world.game.landReach=440;
                  world.game.wilds={since:800,reach:650,trust:3,found:[],lastTrade:-1};
                  const check=(v,m)=>{if(!v)throw Error(m)},results=[];
                  for(const side of [0,1,2,3]){
                    world.shoreSide=side;makeShore(world);bakeBackground(world);view.k=2;view.r=side%4;
                    const edge=side===0?[0,world.H/2]:side===1?[world.W,world.H/2]:side===2?[world.W/2,0]:[world.W/2,world.H];
                    centerOn(...edge);render();check(VOL.gl&&!VOL.failed,'Volume shader failed');
                    const read=(d)=>{const p=side===0?[d,edge[1]]:side===1?[world.W-d,edge[1]]:side===2?[edge[0],d]:[edge[0],world.H-d];
                      const x=Math.floor((p[0]-VOL.x)/VOL.B),y=VOL.cv.height-1-Math.floor((p[1]-VOL.y)/VOL.B),v=new Uint8Array(4);
                      check(x>=0&&y>=0&&x<VOL.cv.width&&y<VOL.cv.height,'Sample outside volume');VOL.gl.readPixels(x,y,1,1,VOL.gl.RGBA,VOL.gl.UNSIGNED_BYTE,v);return [...v];};
                    // Sparse mist need not occupy one particular dry beach pixel.
                    // Sample through the beach into water to verify the interior survives.
                    const border=read(.25),inside=[36,64,96,128].map(read).sort((a,b)=>b[3]-a[3])[0];
                    check(Math.max(...border)<=1,'Hard volume edge on side '+side+': '+border);
                    check(inside[3]>border[3],'Mist disappeared instead of blending on side '+side);
                    check(VOL.gl.getError()===VOL.gl.NO_ERROR,'Volume GL error');
                    check(SDF_GPU.gl&&!SDF_GPU.failed&&SDF_GPU.gl.getError()===SDF_GPU.gl.NO_ERROR,'Seascape shader failed');
                    results.push({side,border,inside});
                  }
                  world.weather.rain=0;world.opts.waves='classic';world.opts.renderer='cpu';world.opts.volumetrics=false;view.r=0;
                  HINTER.hard='';HINTER.ready=false;HINTER.onScreen=true;
                  for(let i=0;i<4000;i++){hinterTick(world,0);if(HINTER.ready&&!HINTER.job)break;}
                  check(HINTER.ready&&HINTER.gaps.length,'Forest not ready');
                  world.game.impTrade=true;world.game.imps={seen:4,visits:0};world.game.essence=100;
                  const [x,y]=coastXY(world,12,world.W/2);
                  world.structures=[makeStructure('impchimes',world,x-28,y,811),makeStructure('impbowl',world,x+16,y,812),makeStructure('wickpost',world,x-55,y,813)];
                  bakeBackground(world);view.k=4;centerOn(x,y+20);placeHinter();hinterTick(world,0);
                  wildsObjectClick(world,world.structures[1]);render();
                  return results;
                }''')
                assert page.locator('#world-mystery').count() == 0
                assert page.locator('[data-wild-action]').inner_text() == 'Fill & invite · 4 essence'
                page.locator('[data-wild-action]').click()
                result = page.evaluate('''async()=>{
                  const check=(v,m)=>{if(!v)throw Error(m)},bowl=world.structures[1],chimes=world.structures[0],lantern=world.structures[2];
                  check(world.game.essence===96&&wildBowlReady(world,bowl),'Bowl was not charged explicitly');
                  check(IMPS.out?.imps.length===2&&IMPS.out.invited,'No real visitors');
                  check(world.effects.some(e=>e instanceof WildSignal)&&bowl.wildPulse,'Missing scene feedback');
                  const button=document.querySelector('[data-wild-action]');button.focus();refreshWildObjectCard(world);
                  check(document.querySelector('[data-wild-action]')===button,'Action replaced during update');
                  check(!useWildObject(world,bowl)&&world.game.essence===96,'Double charged bowl');
                  const native=serializePond(world);storeSave(native);check(loadSave(world.seed).game.imps.interact.bowl===812,'Native save lost filled bowl');
                  const linked=await decodePond(await encodePond(world));check(linked?.game.imps.interact.bowl===812,'p4 lost filled bowl');
                  const snapshot=JSON.stringify(world.game);world.observe={id:'other'};
                  check(!useWildObject(world,bowl)&&!useWildObject(world,chimes)&&!useWildObject(world,lantern),'Observer used an object');
                  check(JSON.stringify(world.game)===snapshot,'Observer changed game');world.observe=null;
                  check(useWildObject(world,lantern)&&wildLanternSafe(world,lantern.x,lantern.y),'Lantern did not protect its area');
                  check(wildLightBoost(world,lantern)>1&&!wildLanternSafe(world,lantern.x+80,lantern.y),'Lantern range/light wrong');
                  return {filledSave:true,invited:2,essenceSpent:4,observer:true,lantern:true};
                }''')
                # Make the real procession walk to the bowl and complete its real dance.
                dance = page.evaluate('''()=>{
                  const check=(v,m)=>{if(!v)throw Error(m)},bowl=world.structures[1],before=world.game.imps.visits;
                  let danced=false,shown=false,seconds=0;world.pointer.inside=true;world.pointer.x=bowl.x;world.pointer.y=bowl.y;
                  while(seconds<100&&world.game.imps.visits===before){
                    world.t+=.05;world.days+=.05/world.opts.dayLength;updateImps(world,.05);
                    for(const c of world.creatures.filter(c=>c.species==='imp'&&!c.gone)){world.pointer.x=c.x;world.pointer.y=c.y;c.update(.05,world);if(c.act==='dance')danced=true;check(!c.fled,'Invited imp fled from watching pointer');}
                    seconds+=.05;
                    if(danced&&!shown){hinterSprites(world);render();shown=true;}
                  }
                  check(danced&&world.game.imps.visits===before+1,'Dance/gift never completed');
                  check(!wildBowlReady(world,bowl),'Gift did not consume food');
                  const paid=world.game.essence;impGift(world,bowl);check(world.game.essence===paid&&world.game.imps.visits===before+1,'Duplicate gift');
                  return {seconds:Math.round(seconds),danced,gifts:world.game.imps.visits};
                }''')
                page.evaluate('''()=>{world.creatures=world.creatures.filter(c=>c.species!=='imp');IMPS.out=null;world.days=Math.floor(world.days)+1.1;wildsObjectClick(world,world.structures[0]);}''')
                page.locator('[data-wild-action]').click()
                trust = page.evaluate('''()=>{
                  const check=(v,m)=>{if(!v)throw Error(m)},start=world.game.wilds.trust;
                  for(let i=0;i<2000&&world.game.wilds.trust===start;i++){world.t+=.05;world.days+=.05/world.opts.dayLength;updateImps(world,.05);for(const c of world.creatures.filter(c=>c.species==='imp'&&!c.gone))c.update(.05,world);}
                  check(world.game.wilds.trust===start+1,'Chimes did not earn trust');
                  IMPS.out=null;world.creatures=world.creatures.filter(c=>c.species!=='imp');check(!useWildObject(world,world.structures[0]),'Same-day invitation repeated');
                  // A paid but interrupted visit can be resumed without paying twice, including after a reload.
                  impState(world).interact.bowl=world.structures[1].seed;const balance=world.game.essence;
                  check(useWildObject(world,world.structures[1])&&world.game.essence===balance,'Stored food charged twice');
                  for(let i=0;i<300;i++){world.t+=.05;updateImps(world,.05);for(const c of world.creatures.filter(c=>c.species==='imp'&&!c.gone))c.update(.05,world);}
                  hideObject();view.glide=null;cam.follow=null;cam.tour=false;setHud(false);view.r=0;view.k=4;
                  centerOn(world.structures[1].x,world.structures[1].y+40);hinterSprites(world);render();return world.game.wilds.trust;
                }''')
                (ROOT/'dist').mkdir(exist_ok=True)
                page.screenshot(path=str(ROOT/'dist/imp-procession.png'))
                page.set_viewport_size({'width':390,'height':844})
                page.evaluate('wildsObjectClick(world,world.structures[1])')
                box=page.locator('#object').bounding_box()
                assert box and box['x']>=0 and box['y']>=0 and box['width']<=390 and box['y']+box['height']<=844,box
                page.screenshot(path=str(ROOT/'dist/imp-card-phone.png'))
                # Stale cards cannot spend in a different copy of the same pond.
                page.evaluate("world.inst+='-new';const action=document.querySelector('[data-wild-action]');action.disabled=false;action.click()")
                assert page.locator('#object').is_hidden()
                assert not errors,errors
                print(json.dumps({'seams':seam,**result,'dance':dance,'trust':trust,'phone':True,'errors':errors},indent=2))
            finally: browser.close()
    finally: server.shutdown();server.server_close()
if __name__=='__main__':run()
