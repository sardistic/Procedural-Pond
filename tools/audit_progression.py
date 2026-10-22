"""Audit local progression using normal actions; remote API writes are always intercepted.

Reports go to ignored dist/progression/. This accelerates simulation, not depth or income.
Rendering and async brains are not benchmarked. Use --fixture for a saved mature pond API response.
"""
import argparse
import json
import time
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright
from promo_page import Site, ROOT, CHROME


def run():
    parser=argparse.ArgumentParser()
    parser.add_argument('--seed',default='misty-reed-42')
    parser.add_argument('--habitat',choices=['fresh','mixed','salt'],default='fresh')
    parser.add_argument('--policy',choices=['idle','tend'],default='tend')
    parser.add_argument('--minutes',type=int,default=20)
    parser.add_argument('--fixture',type=Path)
    parser.add_argument('--label',default='baseline')
    a=parser.parse_args()
    assert 1<=a.minutes<=120
    fixture=json.loads(a.fixture.read_text(encoding='utf-8')) if a.fixture else None
    ThreadingHTTPServer.request_queue_size=128
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Site,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    out=ROOT/'dist'/'progression';out.mkdir(parents=True,exist_ok=True)
    # Labels cannot escape the report directory.
    name='-'.join([a.label,a.seed,a.habitat,a.policy])
    if any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in name):raise ValueError('Use simple report labels and seeds')
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--mute-audio'])
            try:
                page=browser.new_page(viewport={'width':1100,'height':800});errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.route('**/api/**',lambda r:r.fulfill(json=fixture if fixture and '/api/ponds/' in r.request.url and r.request.method=='GET' else {}))
                page.route('https://analytics.sardistic.com/**',lambda r:r.abort())
                opts={'v':5,'world':'small','habitat':a.habitat,'light':'cycle','speed':1,'renderer':'gpu','waves':'classic','volumetrics':False,'sound':False,'music':False}
                page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',"+json.dumps(json.dumps(opts))+")")
                suffix='/audit-mature?observe=1' if fixture else '/index.html?pond='+a.seed
                page.goto(f'http://127.0.0.1:{server.server_port}'+suffix,timeout=90000)
                page.wait_for_function("()=>typeof world!=='undefined'&&world.game&&!document.getElementById('entry')",timeout=90000)
                assert not errors,errors
                page.evaluate((ROOT/'tools/progression_driver.js').read_text(encoding='utf-8'))
                page.evaluate('policy=>PROGRESSION.init(policy)',a.policy)
                start=time.monotonic()
                for minute in range(a.minutes):
                    state=page.evaluate('PROGRESSION.advance(60)')
                    print(json.dumps({'minute':minute+1,'state':state}),flush=True)
                result=page.evaluate('({samples:PROGRESSION.samples,milestones:PROGRESSION.milestones,emptySeconds:PROGRESSION.emptySeconds,hard:hardMode(world),dayLength:world.opts.dayLength,habitat:world.opts.habitat,speed:world.opts.speed})')
                result.update(seed=a.seed,requestedHabitat=a.habitat,policy=a.policy,fixture=bool(fixture),wallSeconds=round(time.monotonic()-start,2),errors=errors)
                (out/(name+'.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
                assert not errors,errors
                print(json.dumps({'report':str(out/(name+'.json')),'milestones':result['milestones'],'wallSeconds':result['wallSeconds']}),flush=True)
            finally:browser.close()
    finally:server.shutdown();server.server_close()


if __name__=='__main__':run()
