"""Exercise real late-game terrain, forest reveals, transactions, saves and GPU programs."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
def run():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    try:
      with sync_playwright() as p:
        b=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--mute-audio','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page=b.new_page(viewport={'width':1100,'height':760});errors=[];warnings=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:warnings.append(m.text) if 'Volumetrics unavailable' in m.text else None)
        page.route('**/api/**',lambda r:r.fulfill(json={}))
        page.route('https://analytics.sardistic.com/**',lambda r:r.abort())
        page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'mixed',light:'night'}))")
        page.goto(f'http://127.0.0.1:{server.server_port}/index.html',wait_until='load')
        page.wait_for_function("typeof world!=='undefined'&&!!world.erosion&&!document.getElementById('entry')",timeout=60000)
        result=page.evaluate('''async()=>{
          const check=(ok,why)=>{if(!ok)throw Error(why)};world.noSave=true;world.paused=true;
          // Links regenerate shore direction from the seed: choose a real left-shore fixture before growing it.
          const prefix=world.seed.split('-').slice(0,2).join('-');
          for(let n=0;n<1000;n++){const seed=prefix+'-'+n;if(withSeed(seed+'/'+world.opts.habitat,()=>randi(0,3))===0){world.seed=seed;break;}}
          world.structures=[];world.creatures=[];world.effects=[];world.shoreSide=0;
          world.erosion.tier=29;world.erosion.e=DEPTH_TIERS[29].erosion;growInPlace(700);
          const terrain=[];
          for(const f of HORIZONS){
            world.erosion.tier=f.tier;world.game.seas=[{from:0,k:f.key}];makeShore(world);bakeBackground(world);
            const sites=horizonSites(world);check(sites.length>0,'No sites in '+f.key);
            const sample=sites[0],land=isDry(world,sample.x,sample.y);
            check(!f.city||f.city===4||land,'Future island is not physical dry ground');
            const reference=world.bgBase.slice(),rect=[Math.max(0,(sample.x|0)-23),Math.max(0,(sample.y|0)-18),Math.min(world.W-1,(sample.x|0)+25),Math.min(world.H-1,(sample.y|0)+23)];
            bakeBackground(world,rect);let mismatch=0;
            for(let y=rect[1];y<=rect[3];y++)for(let x=rect[0];x<=rect[2];x++)if(world.bgBase[x+y*world.W]!==reference[x+y*world.W])mismatch++;
            check(mismatch===0,'Partial '+f.key+' bake changed '+mismatch+' pixels');
            terrain.push({key:f.key,sites:sites.length,dry:land,partialDifferences:mismatch});
          }
          // Every new body renders and remains gated by the existing unlock rules.
          for(let i=0;i<HORIZON_DESIGNS.length;i++){
            const d=HORIZON_DESIGNS[i],c=makeCreature(d.kind,world,world.W-260+i%4*35,90+Math.floor(i/4)*45,{},80000+i);initLife(c);world.creatures.push(c);
            world.erosion.tier=d.tier-1;check(!deepAvailable(world,d.kind),'Bypassed gate '+d.kind);
            world.erosion.tier=d.tier;check(deepAvailable(world,d.kind),'Missing unlock '+d.kind);
          }
          world.erosion.tier=29;world.game.seas=[{from:0,k:'astral'}];makeShore(world);bakeBackground(world);
          world.opts.volumetrics=true;world.opts.lights=true;world.opts.waves='classic';world.opts.renderer='cpu';view.k=2;centerOn(world.W-230,world.H/2);render();
          check(!VOL.failed&&VOL.gl&&VOL.emitterCount>0,'GPU emissive volume failed');
          check(VOL.gl.getError()===VOL.gl.NO_ERROR,'GPU error');
          world.opts.volumetrics=false;hideVolumetric();
          // New terrain remains reachable in each shore orientation, including a capped pond.
          const orientations=[];const maxBefore=maxDeepPx,exBefore=world.expandPx;world.expandPx=80;
          try{maxDeepPx=()=>world.expandPx;for(const side of [0,1,2,3]){
            world.shoreSide=side;world.game.seas=[];makeShore(world);const sites=horizonSites(world);
            check(sites.length>0,'Capped frontier unavailable on side '+side);orientations.push({side,sites:sites.length});
          }}finally{maxDeepPx=maxBefore;world.shoreSide=0;world.expandPx=exBefore;}
          // A deep old pond begins at the old forest limit, not with an instant village reveal.
          world.days=900;delete world.game.wilds;world.game.landReach=440;world.game.imps={seen:4,visits:2};
          updateWilds(world,1);check(wildsReach(world)===440,'Old pond reveals the village immediately');
          const at=world.game.wilds.since;world.days+=120;updateWilds(world,1);
          check(wildsReach(world)>480&&wildsReach(world)<510,'Forest did not advance slowly');
          const reach=wildsReach(world),before=JSON.stringify(world.game);world.observe=true;world.days+=50;updateWilds(world,1);check(JSON.stringify(world.game)===before,'Observer changed story state');world.observe=false;world.days-=50;
          world.game.wilds.reach=800;world.game.wilds.trust=3;world.game.impTrade=true;
          // Finish the actual seeded forest bake before interacting; normal frames may replace stale geometry.
          makeShore(world);HINTER.hard='';HINTER.ready=false;HINTER.onScreen=true;
          for(let i=0;i<2000;i++){hinterTick(world,0);if(HINTER.ready&&!HINTER.job)break;}
          HINTER.shown=800;
          const place=wildsPlaces(world)[3],point=hinterToPx(world.shoreSide,place.dd,place.u);
          world.game.pearls=100;world.game.essence=100;
          check(wildsClick(world,point[0]+HINTER.geo.ox,point[1]+HINTER.geo.oy),'Forest place cannot be inspected');
          return {terrain,orientations,forest:{since:at,reach},catalogue:Object.keys(SPECIES).length,newBodies:HORIZON_DESIGNS.length,emitterCount:VOL.emitterCount};
        }''')
        page.get_by_role('button',name='Offer 12 pearls for warm stones',exact=True).click()
        assert page.evaluate('world.game.pearls===88&&world.game.essence===118')
        page.get_by_role('button',name='Leave quietly',exact=True).click()
        extra=page.evaluate('''async()=>{
          const check=(ok,why)=>{if(!ok)throw Error(why)};
          const p=wildsPlaces(world)[3],q=hinterToPx(world.shoreSide,p.dd,p.u);check(wildsClick(world,q[0]+HINTER.geo.ox,q[1]+HINTER.geo.oy),'Trade place not ready after closing');
          document.querySelectorAll('#world-mystery button')[1].click();check(world.game.pearls===88,'Same-day trade repeated');document.getElementById('world-mystery').close();
          world.game.seas=[{from:0,k:'relay'}];makeShore(world);const site=horizonSites(world)[0],essenceBefore=world.game.essence,pointsBefore=world.game.points;
          check(horizonClick(world,site.x,site.y),'Relay cannot be inspected');document.querySelectorAll('#world-mystery button')[1].click();
          check(world.game.essence===essenceBefore-20&&world.game.horizonSignals[site.key]&&world.game.points===pointsBefore,'Attuning did not pay its cost');document.getElementById('world-mystery').close();
          world.observe=true;horizonClick(world,site.x,site.y);check(document.querySelectorAll('#world-mystery button')[1].disabled,'Observer can change relays');document.getElementById('world-mystery').close();world.observe=false;
          world.game.horizonSignals={'astral:4:0':true};world.game.horizonDawn=Math.floor(world.days);const before=world.game.essence;
          updateHorizons(world);check(world.game.essence===before,'Relay paid twice');world.days+=1;updateHorizons(world);check(world.game.essence===before+2,'Relay dawn did not pay');
          const saved=serializePond(world);storeSave(saved);const loaded=loadSave(world.seed);check(loaded.game.wilds.reach===800&&loaded.game.horizonSignals['astral:4:0'],'Native save lost exploration');
          const code=await encodePond(world),restored=await decodePond(code);
          if(!restored){const reader=new ByteReader(packPond(world));reader.u8();const parsed=unpackV2(reader,4);if(parsed.game)parsed.game.seas=parsed.seas;linkToSave(parsed);}
          check(restored?.game.wilds.reach===800&&restored.game.horizonSignals['astral:4:0']&&restored.game.impTrade,'Link lost exploration '+JSON.stringify(restored?.game));
          const largeW=world.W-world.expandPx+5000,largeWorld={...world,W:largeW,expandPx:5000};
          const largeCode=await encodePond(largeWorld),large=await decodePond(largeCode);check(large?.size[0]===largeW,'Long expanded pond link was truncated');
          const objects=Object.keys(WILD_OBJECTS).map((k,i)=>makeStructure(k,world,16+i*20,60,911+i));
          world.structures.push(...objects);bakeBackground(world);render();
          const bowl=objects.find(s=>s.kind==='impbowl'),out={phase:'down',tribute:bowl,imps:[{u:60,gone:false}]};
          const beforeOffering=world.game.essence;enterPond(world,out);check(out.phase==='up'&&world.game.essence===beforeOffering,'Empty bowl silently charged essence');
          impState(world).interact={callDay:-1,bowl:bowl.seed};enterPond(world,out);check(out.phase==='pond'&&world.game.essence===beforeOffering&&wildBowlReady(world,bowl),'Filled offering was not retained until delivery');
          world.structures=[];world.creatures=world.creatures.filter(c=>c.species!=='imp');
          return {nativeSave:true,link:code.slice(0,4),dailyTrade:true,dailyRelay:true};
        }''')
        page.evaluate("()=>{closeWindows();world.shoreSide=0;world.game.seas=[{from:0,k:'astral'}];world.erosion.tier=29;makeShore(world);bakeBackground(world);view.k=2;centerOn(world.W-160,world.H/2);render();}")
        page.wait_for_timeout(400);page.screenshot(path=str(ROOT/'dist/galactic-waterfall.png'))
        page.add_style_tag(content='#hud,#rail,#pondbar,#actions,#show-hud,#ticker,#scorebar{display:none!important}')
        page.screenshot(path=str(ROOT/'dist/galactic-waterfall-scene.png'))
        forest=page.evaluate('''()=>{
          world.game.wilds.reach=800;world.days=1200;world.opts.light='cycle';world.days=Math.floor(world.days)+0.72;world.darkness=0.35;
          world.light.tint=[0.55,0.65,0.55];world.game.landReach=440;HINTER.hard='';HINTER.ready=false;HINTER.onScreen=true;
          for(let i=0;i<2000;i++){hinterTick(world,0);if(HINTER.ready&&!HINTER.job)break;}
          HINTER.shown=800;HINTER.dirty=true;view.k=1.5;centerOn(-570,world.H/2);placeHinter();hinterTick(world,0);hinterSprites(world);
          return {ready:HINTER.ready,branches:HINTER.riv?.branches?.length,places:wildsPlaces(world).length};
        }''')
        assert forest['ready'] and forest['branches']==2 and forest['places']==5,forest
        page.screenshot(path=str(ROOT/'dist/hidden-river-village.png'))
        page.set_viewport_size({'width':390,'height':844})
        page.evaluate("()=>{const p=wildsPlaces(world)[0],q=hinterToPx(world.shoreSide,p.dd,p.u);wildsClick(world,q[0]+HINTER.geo.ox,q[1]+HINTER.geo.oy)}")
        box=page.locator('#world-mystery').bounding_box()
        assert box and box['x']>=0 and box['y']>=0 and box['width']<=390 and box['height']<=844,box
        page.keyboard.press('Escape');page.locator('#world-mystery').wait_for(state='detached')
        assert not errors,errors
        assert not warnings,warnings
        print(json.dumps({**result,**extra,'forestRender':forest,'errors':errors},indent=2));b.close()
    finally:server.shutdown()
if __name__=='__main__':run()
