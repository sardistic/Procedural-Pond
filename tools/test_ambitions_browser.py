"""Resident ambitions follow actual care and broods, survive reload, and stay optional."""
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
import json
from playwright.sync_api import sync_playwright
from test_animals_browser import Quiet, ROOT


def run():
    ThreadingHTTPServer.request_queue_size = 128
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True, args=['--mute-audio'])
            try:
                for width, height in [(1280, 800), (390, 844), (320, 740), (844, 390)]:
                    page = browser.new_page(viewport={'width': width, 'height': height})
                    errors = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.route('**/api/**', lambda r: r.fulfill(json={}))
                    page.route('https://analytics.sardistic.com/**', lambda r: r.abort())
                    page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'fresh',light:'day'}))")
                    page.goto(f'http://127.0.0.1:{server.server_port}/index.html?pond=ambitions-test')
                    page.wait_for_function("()=>typeof careChoose==='function'&&world.game&&!document.getElementById('entry')", timeout=60000)
                    page.evaluate("""()=>{
                      world.paused=true;world.noSave=true;document.getElementById('banner').hidden=true;
                      const c=makeCreature('koi',world,world.W/2,world.H/2,{},77101),m=makeCreature('koi',world,world.W/2+2,world.H/2,{},77102);
                      for(const a of [c,m]){initLife(a);Object.assign(a.life,{scale:1,age:matureAt(a.life)+1,energy:1,cooldown:0,comfort:.5});}
                      c.life.name='Moss';m.life.name='Fern';world.creatures=[c,m];world.eggs=[];
                      world.zones.aggr.fill(0);world.zones.salt.fill(0);world.game.hard=false;world.opts.hard=false;world.maxPop=130;
                      noteBorn(world,c,'founder');noteBorn(world,m,'founder');window.targetResident=c;window.targetMate=m;
                      careState(world).step=4;careOpen();careChoose();careTick(true);
                    }""")
                    select=page.locator('#care-resident')
                    select.select_option('77101');select.focus();page.evaluate('careTick(true)')
                    assert page.evaluate("document.activeElement.id==='care-resident'")
                    assert select.input_value()=='77101'
                    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                    page.screenshot(path=str(ROOT / f'dist/ambitions-{width}.png'))
                    page.locator('[data-care="comfort"]').click()
                    assert page.evaluate("careState(world).goal.subject===77101&&!careState(world).goal.done")
                    page.locator('[data-care="act"]').click()
                    assert page.evaluate('creatureUi.c===targetResident')
                    page.evaluate("""()=>{
                      hideCreature();const c=targetResident,g=careState(world).goal;
                      c.life.energy=.69;c.life.comfort=.8;careTick(true);if(g.done)throw Error('Hungry goal completed');
                      c.life.energy=.8;c.life.comfort=.69;careTick(true);if(g.done)throw Error('Uncomfortable goal completed');
                      c.life.comfort=.7;const before=JSON.stringify([world.game,c.life]);careTick(true);
                      if(!g.done||JSON.stringify([world.game,c.life])!==before)throw Error('Care completion changed rules or failed');
                      c.life.comfort=.1;careTick(true);if(!g.done)throw Error('Completion lost');
                      world.likeSpots={};carePin('habitat',c.seed);
                      const likes=likesOf(c)[0];world.likeSpots[likes]=[{x:c.x,y:c.y,growth:.39},{x:c.x+1,y:c.y,growth:1},{x:c.x+2,y:c.y,growth:1}];
                      careTick(true);if(careState(world).goal.done)throw Error('Seedling counted');
                      world.likeSpots[likes][0].growth=.4;world.likeSpots[likes][2].x=c.x+COMFORT_R;
                      careTick(true);if(careState(world).goal.done)throw Error('Distant habitat counted');
                      world.likeSpots[likes][2].x=c.x+2;careTick(true);if(!careState(world).goal.done)throw Error('Mature habitat missed');
                      carePin('family',c.seed);
                      const fake=makeCreature('koi',world,c.x,c.y,{},77103);initLife(fake,{parents:[c.seed,targetMate.seed],gen:1});
                      world.creatures.push(fake);noteBorn(world,fake,'founder');seedLineage(world);
                      if(careState(world).goal.done)throw Error('Arrival or restored lineage counted as offspring');
                      const unrelated=makeCreature('koi',world,c.x,c.y,{},77104);initLife(unrelated,{parents:[123,124],gen:1});
                      scoreBirths(world,[unrelated]);if(careState(world).goal.done)throw Error('Wrong family counted');
                      world.creatures=[c,targetMate];c.life.energy=1;c.life.cooldown=0;targetMate.life.cooldown=0;
                      breed(world);if(!world.eggs.length)throw Error('No real brood');
                      if(!careGoal(world,careState(world).goal).text.includes('waiting to hatch'))throw Error('No egg progress');
                      careState(world).hidden=true;const eggs=world.eggs[0];eggs.timer=0;eggs.update(1,world);world.eggs=[];
                      if(!careState(world).goal.done)throw Error('Actual hatch missed while guidance dismissed');
                      if(!careState(world).goal.result.includes('Moss'))throw Error('Wrong completion identity');
                      world.noSave=false;saveNow();
                    }""")
                    page.reload()
                    page.wait_for_function("()=>typeof careChoose==='function'&&world.game&&!document.getElementById('entry')", timeout=60000)
                    assert page.evaluate("careState(world).hidden&&careState(world).goal.kind==='family'&&careState(world).goal.done")
                    page.evaluate("""()=>{
                      world.paused=true;world.noSave=true;document.getElementById('banner').hidden=true;careOpen();
                      const c=careResident(world,77101);carePin('comfort',c.seed);c.leaving=true;careTick(true);
                      if(!document.querySelector('.care-text').textContent.includes('no longer'))throw Error('No departure guidance');
                      if(careState(world).goal.subject!==c.seed)throw Error('Silently retargeted goal');c.leaving=false;
                      const before=JSON.stringify(CARE.state);world.observe={id:'visitor'};
                      carePin('family',c.seed);careBirths(world,[{life:{parents:[c.seed]}}]);careTick(true);
                      if(JSON.stringify(CARE.state)!==before||!document.getElementById('pond-care').hidden)throw Error('Observer changed goal');world.observe=null;
                      const inst=world.inst;world.inst='other';careTick(true);if(careState(world).goal)throw Error('Pond leaked');world.inst=inst;careTick(true);
                      const tad=makeCreature('tadpole',world,c.x,c.y,{},77200),frog=makeCreature('frog',world,c.x,c.y,{},77201);
                      initLife(tad);initLife(frog);world.creatures.push(tad,frog);noteBorn(world,tad,'founder');carePin('comfort',tad.seed);
                      rekeyLineage(world,tad,frog);if(careState(world).goal.subject!==frog.seed)throw Error('Transformation lost resident');
                      const old=JSON.stringify(careState(world).goal);carePin('nonsense');if(JSON.stringify(careState(world).goal)!==old)throw Error('Unknown ambition replaced goal');
                      const mate=careResident(world,77102);world.creatures=[c,mate];world.hatchery=newHatchery();world.structures.push(makeStructure('hatchery',world,c.x,c.y,77300));
                      carePin('family',c.seed);stockHatchery(world,c);stockHatchery(world,mate);
                      if(careGoal(world,careState(world).goal).action!=='View hatchery')throw Error('Hatchery resident treated as departed');
                      world.hatchery.nutrients=hatchCost(world.hatchery);updateHatchery(world,0);
                      if(!careState(world).goal.done)throw Error('Hatchery brood missed');
                      careForget(world.seed);if(careState(world).goal)throw Error('Deletion retained ambition');
                    }""")
                    assert not errors,errors
                    results.append({'viewport':[width,height],'care':True,'habitat':True,'actualBrood':True,'completionPersistence':True,'isolation':True,'errors':errors})
                    page.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
    print(json.dumps(results,indent=2))


if __name__=='__main__':
    run()
