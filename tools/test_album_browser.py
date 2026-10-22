"""Personal memories survive departures/reloads without changing the living pond."""
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
                for width, height in [(1280, 800), (390, 844)]:
                    page = browser.new_page(viewport={'width': width, 'height': height}, has_touch=width < 600)
                    errors = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.route('**/api/**', lambda r: r.fulfill(json={}))
                    page.route('https://analytics.sardistic.com/**', lambda r: r.abort())
                    page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'mixed',light:'day'}))")
                    page.goto(f'http://127.0.0.1:{server.server_port}/index.html?pond=album-test')
                    page.wait_for_function("()=>typeof albumState==='function'&&world.game&&!document.getElementById('entry')", timeout=60000)
                    page.evaluate('''()=>{
                      world.paused=true;world.noSave=true;careState(world).hidden=true;
                      const c=makeCreature('koi',world,world.W/2,world.H/2,{variety:1},67101);initLife(c);c.life.name='Moss';
                      world.creatures.push(c);noteBorn(world,c,'founder');window.albumTestResident=c;showCreature(c);
                      window.albumBefore=JSON.stringify({life:c.life,x:c.x,y:c.y,heading:c.heading,eco:ECO,game:world.game,count:world.creatures.length});
                    }''')
                    page.locator('#creature .favorite').click()
                    assert page.locator('#creature .favorite').get_attribute('aria-pressed') == 'true'
                    assert page.evaluate('''()=>{const c=albumTestResident;return albumBefore===JSON.stringify({life:c.life,x:c.x,y:c.y,heading:c.heading,eco:ECO,game:world.game,count:world.creatures.length})}''')
                    assert page.evaluate('albumState(world).residents[0].portrait.startsWith("data:image/png")')
                    page.evaluate('''()=>{
                      for(const kind of ['tetra','eel','crab','frog','jelly','octopus','duck']) {
                        const args=kind==='tetra'?{school:{tx:48,ty:48,tz:22,until:0,kind:'neon'}}:{};
                        const c=makeCreature(kind,world,48,48,args,67120);initLife(c);
                        if(!albumPortrait(c))throw Error('Portrait failed: '+kind);
                      }
                    }''')
                    portrait = page.evaluate('albumState(world).residents[0].portrait')
                    page.evaluate('''()=>{
                      const c=albumTestResident;
                      logEvent(world,'Moss grew to 150%',c,{cat:'life',key:'fedgrow:koi',pri:0,merge:e=>'Several animals grew'});
                      const other=makeCreature('koi',world,c.x+5,c.y,{},67102);initLife(other);world.creatures.push(other);
                      logEvent(world,'Someone else grew',other,{cat:'life',key:'fedgrow:koi',pri:0,merge:e=>'Several animals grew'});
                      const baby=makeCreature('koi',world,c.x,c.y,{},67103);initLife(baby,{parents:[c.seed,other.seed],gen:1});
                      world.creatures.push(baby);noteBorn(world,baby,'born');
                      if(!albumState(world).moments.some(m=>m.tag==='New offspring'))throw Error('Birth not remembered');
                      if(!albumState(world).moments.some(m=>m.text==='Moss grew to 150%'))throw Error('Individual memory lost to journal merge');
                      if(albumState(world).moments.some(m=>m.text==='Several animals grew'))throw Error('Captured recap instead of individual event');
                      window.savedEvent=logEvent(world,'Moss found a quiet corner',c,{cat:'pond',pri:1});setJournal(true);
                      savedEvent.day=1;world.days=3.4;
                    }''')
                    page.locator('#journal li').filter(has_text='Moss found a quiet corner').locator('.journal-save').click()
                    page.evaluate('albumRemember(savedEvent)')
                    assert page.evaluate("albumState(world).moments.filter(m=>m.text==='Moss found a quiet corner').length") == 1
                    assert page.evaluate("albumState(world).moments.find(m=>m.text==='Moss found a quiet corner').day") == 1
                    page.evaluate('openAlbum()')
                    assert page.locator('#resident-album').is_visible()
                    assert page.locator('.album-resident img').evaluate('e=>e.complete&&e.naturalWidth>0')
                    go = page.locator('.album-resident button').filter(has_text='Find resident')
                    go.focus()
                    page.evaluate('renderAlbum()')
                    assert page.evaluate("document.activeElement.dataset.albumKey==='find:67101'")
                    go.click()
                    assert page.locator('#resident-album').count() == 0
                    assert page.evaluate('cam.follow===albumTestResident&&creatureUi.c===albumTestResident')
                    page.evaluate('''()=>{
                      const c=albumTestResident;noteGone(world,c,'of old age');world.creatures=world.creatures.filter(a=>a!==c);
                      openAlbum();
                    }''')
                    assert 'of old age' in page.locator('.album-status').first.inner_text()
                    assert page.locator('.album-resident button').filter(has_text='Find resident').is_disabled()
                    page.screenshot(path=str(ROOT / f'dist/album-{width}.png'))
                    page.evaluate('world.noSave=false;saveNow()')
                    page.reload()
                    page.wait_for_function("()=>typeof albumState==='function'&&world.game&&!document.getElementById('entry')", timeout=60000)
                    page.evaluate('world.paused=true;world.noSave=true;openAlbum()')
                    assert page.evaluate('albumState(world).residents[0].portrait') == portrait
                    assert 'Moss grew to 150%' in page.locator('.album-moments').inner_text()
                    assert page.locator('.album-resident button').filter(has_text='Find resident').is_disabled()
                    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                    page.keyboard.press('Escape')
                    assert page.locator('#resident-album').count() == 0
                    page.evaluate('''()=>{
                      const d=albumState(world), before=JSON.stringify(d);world.observe={id:'visitor'};
                      openAlbum();albumRemember({subject:world.creatures[0]});albumLog(world,'visitor',world.creatures[0],{cat:'rare'});
                      if(ALBUM.dialog||JSON.stringify(d)!==before)throw Error('Observer changed album');
                      world.observe=null;
                      const inst=world.inst;world.inst='other-pond';if(albumState(world).residents.length)throw Error('Album leaked');
                      world.inst=inst;albumState(world);
                      const tad=makeCreature('tadpole',world,48,48,{},67200),frog=makeCreature('frog',world,48,48,{},67201);
                      initLife(tad);initLife(frog);world.creatures.push(tad,frog);noteBorn(world,tad,'founder');
                      albumResident(world,tad);albumMoment(world,tad,'A young tadpole','Test');rekeyLineage(world,tad,frog);
                      if(!albumState(world).residents.some(r=>r.id===frog.seed)||albumState(world).moments.some(m=>m.id===tad.seed))throw Error('Transformation lost identity');
                      const c=world.creatures.find(a=>a.life);albumResident(world,c);
                      for(let i=0;i<100;i++)albumMoment(world,c,'Moment '+i,'Test','test:'+i);
                      if(albumState(world).moments.length!==80)throw Error('Unbounded memories');
                      const set=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('full')};
                      try{albumSave();if(ALBUM.saved)throw Error('False persistence claim')}finally{Storage.prototype.setItem=set}
                      albumSave();
                    }''')
                    page.evaluate('openAlbum()')
                    page.locator('.album-resident').filter(has_text='Moss').get_by_role('button', name='Forget', exact=True).click()
                    page.get_by_role('button', name='Cancel', exact=True).click()
                    assert page.evaluate('albumState(world).residents.some(r=>r.id===67101)')
                    page.locator('.album-resident').filter(has_text='Moss').get_by_role('button', name='Forget', exact=True).click()
                    page.get_by_role('button', name='Confirm forget', exact=True).click()
                    assert page.evaluate('!albumState(world).residents.some(r=>r.id===67101)&&!albumState(world).moments.some(m=>m.id===67101)')
                    page.evaluate('albumForget(world.seed)')
                    assert page.evaluate('albumState(world).residents.length') == 0
                    assert not errors, errors
                    results.append({'viewport': [width, height], 'portrait': True, 'noSimulationChanges': True, 'memories': True, 'reload': True, 'observerIsolation': True, 'bounded': True, 'errors': errors})
                    page.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    run()
