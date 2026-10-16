"""Real ritual transactions, simulation, ecology, persistence and responsive dialog."""
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
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True, args=['--mute-audio'])
            try:
                page = browser.new_page(viewport={'width': 1100, 'height': 800})
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.route('**/api/**', lambda r: r.fulfill(json={}))
                page.route('https://analytics.sardistic.com/**', lambda r: r.abort())
                page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'mixed',light:'cycle',volumetrics:false}))")
                page.goto(f'http://127.0.0.1:{server.server_port}/index.html', wait_until='load')
                page.wait_for_function("typeof world!=='undefined'&&!!world.game&&!document.getElementById('entry')", timeout=60000)
                page.evaluate('''()=>{
                    world.noSave=true;world.paused=true;setHud(true);
                    world.game.pearls=4999;world.game.points=1000;world.game.invested=1000;delete world.game.offerings;
                    refreshOfferings(world);if(!document.getElementById('score-offerings').hidden)throw Error('Early ritual unlock');
                    world.game.pearls=10000;world.game.inv={build:1000};updateOfferings(world,.01);refreshOfferings(world);setScore(true);
                }''')
                page.locator('#score-offerings').click()
                page.locator('#offerings').wait_for(state='visible')
                assert page.locator('#offerings').evaluate('e=>e.contains(document.activeElement)')
                page.locator('[data-offering="sun"]').click()
                first = page.evaluate('''()=>{
                    if(world.game.pearls!==8500||world.game.points!==1000||world.game.inv.build!==1000)throw Error('Ritual polluted ledger');
                    if(!document.querySelector('[data-offering="sun"]').disabled)throw Error('Active boost can be bought again');
                    window.heldOfferingButton=document.querySelector('[data-offering="soothe"]');heldOfferingButton.focus();
                    refreshOfferings(world);hudTick(.5);
                    if(document.activeElement!==heldOfferingButton||document.querySelector('[data-offering="soothe"]')!==heldOfferingButton)throw Error('Refresh destroyed focus');
                    return {pearls:world.game.pearls,anger:world.game.offerings.anger,points:world.game.points};
                }''')
                # Pause preserves the whole timer, even while the UI refreshes.
                days = page.evaluate('world.days')
                page.wait_for_timeout(450)
                assert page.evaluate('world.days') == days
                page.keyboard.press('Escape')
                page.locator('#offerings').wait_for(state='detached')
                result = page.evaluate('''async()=>{
                    const check=(v,m)=>{if(!v)throw Error(m)},near=(a,b)=>check(Math.abs(a-b)<1e-7,`${a} != ${b}`);
                    const before=world.days,t=world.t,anger=world.game.offerings.anger;
                    advanceOfferingTime(world,.15,update);
                    near(world.t-t,.30);near(world.days-before,.30/world.opts.dayLength);
                    near(world.game.offerings.anger,anger-3*.30/world.opts.dayLength);
                    world.game.offerings.sunUntil=world.days+.04/world.opts.dayLength;
                    const end=world.t;advanceOfferingTime(world,.10,update);near(world.t-end,.12);check(offeringTimeRate(world)===1,'Boost leaked after expiry');
                    // The actual ecology grid and dividend function receive the consequence.
                    const heat=world.zones.heat.slice();world.game.offerings.anger=0;updateZones(world,0,true);const calm=world.zones.aggr.slice();
                    world.zones.heat.set(heat);world.game.offerings.anger=100;updateZones(world,0,true);
                    let affected=0;for(let i=0;i<calm.length;i++)if(world.zones.aggr[i]>calm[i]+.001)affected++;
                    check(affected>0,'No real tension consequence');near(dividendOf(world)[0],26);
                    world.game.pearls=10000;world.erosion.tier=2;world.erosion.e=5;world.erosion.acc=5-pointsDepth(world.game.points);
                    const pts=world.game.points,inv=JSON.stringify(world.game.inv),acc=world.erosion.acc;
                    check(makeOffering(world,'deep'),'Deep offering failed');near(world.erosion.acc-acc,.48);
                    check(!makeOffering(world,'deep'),'Deep cooldown failed');check(world.game.points===pts&&JSON.stringify(world.game.inv)===inv,'Deep offering refunded currency');
                    check(makeOffering(world,'soothe'),'Appeasement failed');near(world.game.offerings.anger,75);
                    const native=serializePond(world);storeSave(native);const loaded=loadSave(world.seed);
                    check(JSON.stringify(loaded.game.offerings)===JSON.stringify(world.game.offerings),'Native save lost rituals');
                    const code=await encodePond(world),linked=await decodePond(code);
                    check(linked&&JSON.stringify(linked.game.offerings)===JSON.stringify(cleanOfferings(world.game.offerings)),'p4 link lost rituals');
                    const old=world.game.offerings;delete world.game.offerings;
                    const legacy=await decodePond(await encodePond(world));check(legacy&&!legacy.game.offerings,'Pre-ritual link incompatible');world.game.offerings=old;
                    world.observe={id:'other'};const snapshot=JSON.stringify(world.game);
                    check(!makeOffering(world,'sun')&&!makeOffering(world,'deep')&&!makeOffering(world,'soothe'),'Observer spent currency');
                    updateOfferings(world,180);check(JSON.stringify(world.game)===snapshot,'Observer mutated ritual state');
                    openOfferings(world);check([...document.querySelectorAll('[data-offering]')].every(b=>b.disabled),'Observer buttons enabled');
                    document.getElementById('offerings').close();world.observe=null;
                    return {simulationSeconds:.42,affectedZones:affected,nativeSave:true,linkSave:true,oldLinks:true,observer:true};
                }''')
                # A short phone viewport must scroll the modal, not overflow the embed.
                page.set_viewport_size({'width': 390, 'height': 600})
                page.evaluate('openOfferings(world)')
                box = page.locator('#offerings').bounding_box()
                assert box and box['x'] >= 0 and box['y'] >= 0 and box['width'] <= 390 and box['height'] <= 600, box
                assert page.locator('#offerings').evaluate('e=>e.scrollWidth<=e.clientWidth')
                page.locator('[data-offering="soothe"]').scroll_into_view_if_needed()
                page.locator('[data-offering="soothe"]').click()
                assert page.evaluate('world.game.offerings.anger') == 50
                page.locator('.offering-dismiss').scroll_into_view_if_needed()
                (ROOT / 'dist').mkdir(exist_ok=True)
                page.screenshot(path=str(ROOT / 'dist/offerings-phone.png'))
                # A stale dialog cannot spend on another instance of the same seeded pond.
                page.evaluate("world.inst+='-changed';document.querySelector('[data-offering=soothe]').click()")
                page.locator('#offerings').wait_for(state='detached')
                assert page.evaluate('world.game.offerings.anger') == 50
                assert not errors, errors
                print(json.dumps({'firstOffering': first, **result, 'phone': True, 'errors': errors}, indent=2))
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__': run()
