"""Condition metrics must match the simulation and explain themselves on all inputs."""
from http.server import ThreadingHTTPServer
from functools import partial
from threading import Thread
import json
from playwright.sync_api import sync_playwright
from test_animals_browser import Quiet, ROOT

def run():
    ThreadingHTTPServer.request_queue_size = 128
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    results=[]
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--mute-audio'])
            for path,width,height in [('index.html',1280,800),('dist/itch/index.html',390,844)]:
                page=browser.new_page(viewport={'width':width,'height':height},has_touch=width<600)
                errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.route('**/api/**',lambda r:r.fulfill(json={}))
                page.route('https://analytics.sardistic.com/**',lambda r:r.abort())
                page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'mixed',light:'day'}))")
                page.goto(f'http://127.0.0.1:{server.server_port}/{path}',wait_until='load')
                page.wait_for_timeout(1500)
                assert not errors,errors
                page.wait_for_function("() => typeof world!=='undefined' && !!world.erosion && !document.getElementById('entry')",timeout=60000)
                result=page.evaluate('''() => {
                  const check=(ok,why)=>{if(!ok)throw Error(why)};
                  world.paused=true;world.noSave=true;setHud(false);
                  const c=makeCreature('koi',world,world.W/2,world.H/2,{},51391);initLife(c);c.life.name='Metric';
                  Object.assign(c.life,{hp:1,energy:1,scale:1,comfort:0.2,vigor:1.2,wander:0.1,fed:0,satedUntil:0});
                  c.prey=null;c.threat=null;c.grabbed=false;c.leaving=false;
                  c.life.buffs={...c.life.buffs,resilience:0.25,tolerance:0.3,longevity:1};c.life.aura={...c.life.aura,aging:1};
                  world.creatures=[c];world.zones.aggr.fill(0.7);world.zones.salt.fill(1);
                  const before=JSON.stringify(c.life), metrics=Object.fromEntries(animalStateMetrics(world,c).map(m=>[m.key,m]));
                  check(JSON.stringify(c.life)===before,'Metric calculation mutated life');
                  check(metrics.behavior.value==='Routine','Fallback still implies comfort');
                  check(metrics.comfort.value==='20%'&&metrics.tension.value==='70/100','Environment meters differ from simulation');
                  check(metrics.vigor.value==='1.20×'&&metrics.roam.value==='10/100','Temperament metrics differ');
                  check(metrics.water.value==='0%','Salinity mismatch is not reflected');
                  const risk=(leaveChance(c.life,aggressionAt(world,c.x,c.y),mismatch(world,c))*100).toFixed(3);
                  check(metrics.roam.tip.includes(risk+'% per migration check'),'Departure risk differs from leaveChance');
                  check(metrics.vigor.tip.includes(ageRate(c.life).toFixed(2)+'×'),'Aging differs from ageRate');
                  c.life.fed=60;check(animalStateMetrics(world,c).find(m=>m.key==='fed').value==='60s','Timed feeding bonus missing');c.life.fed=0;
                  c.grabbed=true;c.life.energy=0.1;check(animalBehavior(world,c)[0]==='Held','Hunger hides being held');
                  c.grabbed=false;c.prey={};check(animalBehavior(world,c)[0]==='Hunting','Hunger hides hunting');
                  c.prey=null;c.threat={};check(animalBehavior(world,c)[0]==='Fleeing','Fleeing missing');
                  c.threat=null;c.life.energy=1;c.life.scale=0.5;
                  check(animalStateMetrics(world,c).find(m=>m.key==='roam').tip.includes('not eligible'),'Juvenile departure eligibility missing');
                  c.life.scale=1;window.metricCreature=c;showCreature(c);
                  return {comfort:metrics.comfort.value,tension:metrics.tension.value,vigor:metrics.vigor.value,roaming:metrics.roam.value,departure:risk};
                }''')
                comfort=page.locator('#creature [data-animal-metric="comfort"]')
                assert comfort.locator('svg').count()==1
                assert comfort.get_attribute('aria-label')=='Comfort: 20%'
                comfort.hover()
                page.wait_for_timeout(350)
                assert page.locator('#pond-tooltip').is_visible()
                assert 'Habitat comfort: 20%' in page.locator('#pond-tooltip').inner_text()
                vigor=page.locator('#creature [data-animal-metric="vigor"]')
                vigor.focus()
                assert 'aging' in page.locator('#pond-tooltip').inner_text()
                page.evaluate("() => {window.metricButton=document.querySelector('#creature [data-animal-metric=comfort]');renderCreature();renderCreature()}")
                assert page.evaluate("metricButton===document.querySelector('#creature [data-animal-metric=comfort]') && metricButton.isConnected")
                if width<600:
                    comfort.tap()
                    assert 'Habitat comfort' in page.locator('#pond-tooltip').inner_text()
                    comfort.dispatch_event('pointerdown',{'pointerType':'touch','clientX':100,'clientY':350})
                    page.wait_for_timeout(600)
                    assert page.evaluate('TIP.held===true')
                    comfort.dispatch_event('pointerup',{'pointerType':'touch'})
                page.evaluate('hideTip()')
                page.screenshot(path=str(ROOT/f'dist/animal-metrics-{width}.png'))
                page.evaluate('''() => {setCensus(true);census.expanded.add('koi');renderCensus();showCreature(metricCreature,false,true);renderCensus();renderCreature()}''')
                assert page.locator('#census #creature .cr-states').is_visible()
                assert page.locator('#census .cr-states.compact').count()>0
                page.locator('#census .cr-states.compact [data-animal-metric="tension"]').first.click()
                assert 'tension' in page.locator('#pond-tooltip').inner_text()
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                assert not errors,errors
                results.append({'viewport':[width,height],**result,'hover':True,'keyboard':True,'inline':True,'touch':width<600,'errors':errors})
                page.close()
            browser.close()
    finally:
        server.shutdown()
    print(json.dumps(results,indent=2))

if __name__=='__main__':
    run()
