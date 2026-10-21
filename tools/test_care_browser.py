"""First steps, read-only care explanations, actual breeding gates and responsive HUD."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
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
                    page = browser.new_page(viewport={'width': width, 'height': height}, has_touch=width < 600)
                    errors = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.route('**/api/**', lambda r: r.fulfill(json={}))
                    page.route('https://analytics.sardistic.com/**', lambda r: r.abort())
                    page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'fresh',light:'day'}))")
                    page.goto(f'http://127.0.0.1:{server.server_port}/index.html?pond=care-test')
                    page.wait_for_function("()=>typeof world!=='undefined'&&!!world.game&&!document.getElementById('entry')", timeout=60000)
                    page.evaluate("world.paused=true;world.noSave=true;document.getElementById('banner').hidden=true;careTick(true)")
                    assert page.locator('#hud').evaluate("e=>e.classList.contains('hidden')")
                    assert page.locator('#pond-care').is_visible()
                    assert page.locator('#pond-care h2').inner_text() == 'Meet a resident'
                    assert page.locator('#animals .ani.none:visible').count() == 0
                    assert page.evaluate('''()=>{
                      const a=document.getElementById('score-btn').getBoundingClientRect(),b=document.getElementById('show-hud').getBoundingClientRect();
                      return a.right<=b.left && a.left>=0 && a.bottom<=innerHeight && document.documentElement.scrollWidth<=innerWidth;
                    }''')
                    page.locator('[data-care="act"]').click()
                    assert page.locator('#creature .cr-care').is_visible()
                    assert page.evaluate('careState(world).step') == 1
                    page.evaluate('hideCreature()')
                    page.locator('[data-care="act"]').click()
                    assert page.evaluate('world.tool') == 'feed'
                    assert page.evaluate('careState(world).step') == 1, 'Selecting food must not finish a step'
                    page.evaluate('''()=>{const c=careSubject(world,careState(world));useTool(c.x,c.y)}''')
                    assert page.evaluate('careState(world).step') == 2
                    page.evaluate('''()=>{
                      const c=world.creatures.find(c=>c.life&&carePlant(world,c));showCreature(c);hideCreature();
                      const t=carePlant(world,c), money=world.game.pearls;setTool(t);world.game.pearls=0;useTool(c.x,c.y);
                      if(careState(world).step!==2)throw Error('Failed purchase advanced tutorial');
                      world.game.pearls=money+100;useTool(c.x,c.y);
                    }''')
                    assert page.evaluate('careState(world).step') == 3
                    page.locator('[data-care="act"]').click()
                    assert page.locator('.care-condition').is_visible()
                    page.evaluate('hideCreature()')
                    page.locator('[data-care="finish"]').click()
                    assert page.locator('.care-choices').is_visible()
                    before = page.evaluate('JSON.stringify(world.game)')
                    page.locator('[data-care="depth"]').click()
                    assert page.evaluate('JSON.stringify(world.game)') == before
                    assert page.locator('#pond-care h2').inner_text() == 'Reach the next depth'
                    page.evaluate('''()=>{
                      const s=careState(world),old=world.erosion.tier;world.erosion.tier=s.goal.tier;careTick(true);
                      if(document.querySelector('#pond-care h2').textContent!=='Ambition reached')throw Error('No completion');
                      world.erosion.tier=old;careTick(true);
                    }''')
                    page.locator('[data-care="choose"]').click()
                    page.locator('[data-care="discovery"]').click()
                    page.evaluate('''()=>{world.game.known.push('care-test-kind');careTick(true)}''')
                    assert page.locator('#pond-care h2').inner_text() == 'Ambition reached'
                    page.evaluate('world.game.known.pop()')
                    page.locator('[data-care="dismiss"]').click()
                    assert page.locator('#pond-care').is_hidden()
                    page.evaluate('''()=>{CARE.key=null;careTick(true)}''')
                    assert page.locator('#pond-care').is_hidden()
                    page.evaluate('careOpen()')
                    assert page.locator('#pond-care').is_visible()
                    page.evaluate('''()=>{
                      const key=CARE.key, saved=JSON.stringify(CARE.state), tool=world.tool;
                      world.observe={id:'visitor'};careTick(true);careOpen();carePin('depth');
                      const c=world.creatures.find(c=>c.life);careSelectTool(c,'feed');
                      if(!document.getElementById('pond-care').hidden||world.tool!==tool||JSON.stringify(CARE.state)!==saved)throw Error('Observer changed guidance or tool');
                      world.observe=null;careTick(true);
                      const inst=world.inst;world.inst='different-instance';careTick(true);
                      if(careState(world).goal)throw Error('Ambition leaked into another pond');
                      world.inst=inst;careTick(true);if(CARE.key!==key||!careState(world).goal)throw Error('Lost own ambition');
                    }''')
                    # Exercise the real breeding function, not just its presentation helper.
                    conditions = page.evaluate('''()=>{
                      const check=(v,m)=>{if(!v)throw Error(m)};
                      const c=makeCreature('koi',world,world.W/2,world.H/2,{},7191);initLife(c);
                      const m=makeCreature('koi',world,c.x+2,c.y,{},7192);initLife(m);
                      for(const a of [c,m])Object.assign(a.life,{scale:1,age:matureAt(a.life)+1,energy:1,cooldown:0,comfort:0.5});
                      world.creatures=[c,m];world.eggs=[];world.zones.aggr.fill(0);world.zones.salt.fill(0);world.game.hard=false;world.opts.hard=false;world.maxPop=130;
                      c.life.energy=0.65;check(breedingBlock(world,c)==='food','Fullness boundary');
                      breed(world);check(world.eggs.length===0,'Hungry pair bred');
                      c.life.energy=0.66;c.life.cooldown=1;check(breedingBlock(world,c)==='rest','Cooldown');
                      c.life.cooldown=0;c.life.age=matureAt(c.life);check(breedingBlock(world,c)==='young','Age boundary');
                      c.life.age++;c.grabbed=true;check(breedingBlock(world,c)==='held','Held');c.grabbed=false;
                      world.zones.aggr.fill(0.8);check(breedingBlock(world,c)==='tension','Tension');
                      breed(world);check(world.eggs.length===0,'Tense pair bred');world.zones.aggr.fill(0);
                      m.x=c.x+40;check(careBreeding(world,c).includes('come closer'),'Mate distance boundary');
                      breed(world);check(world.eggs.length===0,'Distant pair bred');m.x=c.x+2;
                      world.maxPop=1;check(careBreeding(world,c).includes('capacity'),'Population');breed(world);check(!world.eggs.length,'Full pond bred');world.maxPop=130;
                      check(careBreeding(world,c).startsWith('Ready'),'Ready pair');breed(world);check(world.eggs.length>0,'Ready pair failed to breed');
                      const crab=makeCreature('crab',world,c.x,c.y,{},7193);initLife(crab);
                      Object.assign(crab.life,{scale:1,age:matureAt(crab.life)+1,energy:1,cooldown:0});world.structures=[];
                      check(breedingBlock(world,crab)==='habitat','Required habitat');
                      c.life.cooldown=0;c.life.energy=1;m.life.cooldown=0;m.life.energy=1;
                      world.eggs=[{key:'koi',cells:Array(8).fill({})}];check(careBreeding(world,c).includes('including eggs'),'Egg capacity');
                      world.eggs=[];world.plants=[];world.pads=[];world.rocks=[];world.litter=[];world.slicks=[];world.blight=null;world.darkness=0;
                      updateComfort(world);const empty=comfortFactors(world,c);
                      const kind=likesOf(c)[0];world.likeSpots={[kind]:[{x:c.x,y:c.y,growth:0.39}]};
                      check(comfortFactors(world,c).cover===0,'Seedling counted before maturity');
                      world.likeSpots[kind][0].growth=0.4;check(comfortFactors(world,c).cover===1,'Mature habitat missed');
                      world.likeSpots[kind]=Array.from({length:5},()=>({x:c.x,y:c.y,growth:1}));
                      const full=comfortFactors(world,c);check(full.cover===3&&full.target>=empty.target,'Cover cap or comfort');
                      const state=JSON.stringify(c.life),money=JSON.stringify(world.game);
                      animalCareCard(world,c);careBreeding(world,c);check(JSON.stringify(c.life)===state&&JSON.stringify(world.game)===money,'Care changed simulation');
                      showCreature(c);return {breeding:true,comfort:true,readOnly:true};
                    }''')
                    button = page.locator('#creature [data-care-action="feed"]')
                    button.scroll_into_view_if_needed()
                    button.focus()
                    page.evaluate("window.careButton=document.querySelector('#creature [data-care-action=feed]');renderCreature();renderCreature()")
                    assert page.evaluate('careButton.isConnected&&document.activeElement===careButton')
                    page.wait_for_function("document.getElementById('pond-care').classList.contains('compact')")
                    assert page.locator('#pond-care .care-text').is_hidden()
                    page.screenshot(path=str(Path(ROOT) / f'dist/care-{width}.png'))
                    button.click()
                    assert page.evaluate("world.tool==='feed'&&!creatureUi.c")
                    assert not errors, errors
                    # Real reload retains browser-local ambition and dismissal.
                    page.evaluate('world.noSave=false;saveNow();careState(world).hidden=true;careSave()')
                    page.reload()
                    page.wait_for_function("()=>typeof world!=='undefined'&&!!world.game&&!document.getElementById('entry')", timeout=60000)
                    assert page.evaluate('careState(world).hidden&&careState(world).goal.kind==="discovery"')
                    page.evaluate('careForget(world.seed)')
                    assert page.evaluate('!careState(world).goal')
                    assert not errors, errors
                    results.append({'viewport': [width, height], **conditions, 'onboarding': True, 'persistence': True, 'errors': errors})
                    page.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    run()
