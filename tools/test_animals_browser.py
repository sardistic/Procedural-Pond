"""Exercise the unified Animals list and reused inspectors in a real browser."""
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
    ThreadingHTTPServer.request_queue_size = 128
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True, args=['--mute-audio'])
            for path, width, height in [('index.html',1280,800),('dist/itch/index.html',390,844),('dist/itch/index.html',960,400)]:
                context = browser.new_context(viewport={'width':width,'height':height},has_touch=width<600)
                page = context.new_page()
                errors = []
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.route('**/api/**',lambda r:r.fulfill(json={}))
                page.route('https://analytics.sardistic.com/**',lambda r:r.abort())
                page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'mixed',light:'day'}))")
                page.goto(f'http://127.0.0.1:{server.server_port}/{path}',wait_until='load')
                page.wait_for_function("() => typeof world!=='undefined' && !!world.erosion && !document.getElementById('entry')",timeout=60000)
                page.evaluate('''() => {
                  world.paused=true;world.noSave=true;world.creatures=[];setHud(false);
                  const c=makeCreature('koi',world,world.W/2,world.H/2,{},91821);initLife(c);c.life.name='Mallow';world.creatures.push(c);
                  world.game.known=[...new Set([...(world.game.known||[]),'koi','crab'])];
                  world.game.essence=50000;world.game.pearls=50000;
                  world.game.supers=[{k:'koi',traits:[]},{k:'crab',traits:[]}];
                  world.game.spPts={koi:90};world.game.lines={'koi|albino':2};
                  updateCounts();refreshAnimalsBadge();
                }''')
                assert page.locator('#rail-paragons,#wild-btn,#paragons,#wild').count()==0
                page.locator('#census-btn').click()
                query=page.locator('#animals-search')
                query.fill('Koi')
                page.wait_for_timeout(1200)
                assert query.evaluate('(e)=>document.activeElement===e')
                koi=page.locator('[data-kind="koi"]')
                koi.locator('.row-head').click()
                assert '90 / 150' in koi.inner_text() and 'bred 2 / 3' in koi.inner_text()
                koi.get_by_role('button',name='Mallow').click()
                assert page.locator('#census #creature').is_visible()
                page.get_by_role('tab',name='Genes',exact=True).click()
                page.locator('[data-focus-key="act:keep"]').click()
                assert page.evaluate("isSafe(world.creatures.find(c=>c.life.name==='Mallow'))")
                page.locator('[data-focus-key="act:follow"]').click()
                assert page.evaluate("cam.follow?.life.name==='Mallow' && census.open")
                koi.get_by_role('button',name='Spawn options',exact=True).click()
                assert page.locator('#census #spawn-card').is_visible()
                page.evaluate('() => {for(let i=0;i<3;i++){renderCensus();renderCreature();renderSpawnCard()}}')
                assert page.locator('#census #creature').count()==1 and page.locator('#census #spawn-card').count()==1
                before=page.evaluate('world.creatures.length')
                koi.locator('[data-focus-key="add:koi"]').click()
                assert page.evaluate('world.creatures.length')>before
                query.fill('no such animal')
                assert 'No matching' in page.locator('#census-rows').inner_text()
                assert page.locator('#creature').count()==1 and page.locator('#spawn-card').count()==1
                assert not page.evaluate('creatureUi.inList || spawnUi.inList')
                query.fill('crab')
                crab=page.locator('[data-kind="crab"]')
                crab.locator('.row-head').click()
                crab.get_by_role('button',name='♛ Claim Paragon · free',exact=True).click()
                assert page.evaluate("world.game.supers.length===1 && world.game.supers[0].k==='koi' && world.creatures.some(c=>c.species==='crab'&&c.life.paragon)")
                assert page.locator('#census').is_visible()
                page.evaluate('''() => {world.observe=true;renderCensus()}''')
                assert not page.locator('#clear').is_visible()
                assert crab.locator('[data-focus-key="add:crab"]').is_disabled()
                page.evaluate('''() => {world.observe=false;world.game.hard=true;renderCensus()}''')
                # Mutating execution stays subject to the original difficulty rules.
                assert page.evaluate('hardMode(world)')
                assert crab.locator('[data-focus-key="add:crab"]').is_disabled()
                page.evaluate('''() => {world.game.hard=false;world.observe=false}''')
                query.fill('Koi')
                page.evaluate('renderCensus()')
                unknown=page.evaluate("undiscovered(world).find(k=>k!=='wild'&&dockSpeciesVisible(world,k))")
                assert unknown
                label=page.evaluate('(k)=>SPECIES[k].label',unknown)
                query.fill(label)
                arriving=page.locator(f'[data-kind="{unknown}"]')
                arriving.locator('.row-head').click()
                arriving.locator(f'[data-focus-key="lure:{unknown}"]').click()
                assert page.evaluate('(k)=>world.game.lures[k]>world.days',unknown)
                arriving.locator(f'[data-focus-key="summon:{unknown}"]').click()
                assert page.evaluate('(k)=>world.game.summon===k',unknown)
                query.fill('Koi')
                page.wait_for_timeout(150)
                bounds=page.locator('#census').bounding_box()
                assert bounds and bounds['x']>=0 and bounds['y']>=0 and bounds['x']+bounds['width']<=width+1 and bounds['y']+bounds['height']<=height+1,bounds
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                page.screenshot(path=str(ROOT/f'dist/animals-{width}.png'))
                page.locator('#census-close').click()
                assert not page.locator('#census').is_visible()
                page.evaluate("showCreature(world.creatures.find(c=>c.life.name==='Mallow'))")
                assert page.locator('#creature').is_visible() and page.locator('#census #creature').count()==0
                page.evaluate('hideCreature()')
                page.keyboard.press('c')
                assert page.locator('#census').is_visible()
                page.keyboard.press('Escape')
                assert not page.locator('#census').is_visible()
                assert not errors,errors
                results.append({'path':path,'viewport':[width,height],'inlineInspectors':True,'searchFocus':True,'spawn':True,'paragonClaim':True,'readOnly':True,'errors':errors})
                context.close()
            browser.close()
    finally:
        server.shutdown()
    print(json.dumps(results,indent=2))

if __name__=='__main__':
    run()
