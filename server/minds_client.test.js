'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/minds.js'),'utf8');
function client({jev=true,fish=true,request}={}) {
  let clock=1000;
  const requests=[];
  const context=vm.createContext({console,AbortSignal,Response,Date,Math,performance:{now:()=>clock},
    document:{hidden:false},Net:{base:'/api'},fetch:async(url,options)=>{
      requests.push({url,options});
      if(url==='/api/minds')return new Response(JSON.stringify({enabled:jev,flyBrain:true,fishBrain:fish}));
      if(request)return request(url,options);
      return new Response(JSON.stringify(url.endsWith('decide')?{action:'forage',confidence:.8}:
        {source:'fish-brain',motor:{left:.1,right:.6,thrust:.4,startle:false,feeding:false}}));
    }});
  const run=code=>vm.runInContext(code,context);
  run(`
    class Fish {} class Walker {} class Octopus {} class Watcher {}
    const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
    const tierOf=()=>3, geneBuffs=()=>({intellect:2}), SPECIES_STATS={koi:{rarity:3}};
    const shoreAt=()=>0, isPredator=q=>q.predator===true;
    const forNear=(w,x,y,r,callback)=>w.creatures.forEach(q=>callback(q,(q.x-x)**2+(q.y-y)**2));
    const world={t:10,W:400,H:300,tide:{level:1},shore:null,food:[],plants:[],rocks:[],
      link:{id:'amber-heron-moss-lantern',key:'owner-test-only'},creatures:[]};
    const c=Object.assign(new Fish(),{seed:123456,species:'koi',x:100,y:100,z:10,heading:0,speed:2,maxSpeed:10,
      body:{w:[2]},life:{mind:true,mindController:'hybrid-brain',traits:[],energy:.5},mind:{token:0}});
    world.creatures=[c];
    const profile={hunger:.5,depth:.3,comfort:.8,abilities:{feeds:true,canHunt:false},weights:
      {food:1,danger:1,social:1,explore:1,hunt:0,shelter:1,motor:1}};
    const encounter={radius:60,state:{creature:profile},options:[{action:'forage',x:200,y:100,speed:10},{action:'rest',x:100,y:100,speed:0},
      {action:'explore',x:100,y:140,speed:5}],signature:'same'};
  `);
  run(source);
  // Keep the async/sensory/motor logic real; isolate unrelated ecosystem setup.
  run('mindEncounter=()=>encounter;');
  return {run,requests,advance:ms=>{clock+=ms;},flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('sensory sectors rotate with the creature and contain bounded observations, not actions',async()=>{
  const h=client();await h.run('mindCheckCapabilities()');
  const result=h.run(`(()=>{world.food=[{x:100,y:120,z:10}];
    const a=mindFishInputs(world,c,encounter);c.heading=Math.PI/2;const b=mindFishInputs(world,c,encounter);
    return {a,b};})()`);
  assert.ok(result.a.sectors[4].food>0);
  assert.ok(result.b.sectors[0].food>0);
  for(const value of result.a.sectors.flatMap(s=>Object.values(s)))assert.ok(value>=0 && value<=1);
  assert.deepEqual(Object.keys(result.a).sort(),['gains','internal','sectors']);
});
test('Jev only retains a goal; bounded gains change without a direct steering plan',async()=>{
  const h=client();await h.run('mindCheckCapabilities()');
  await h.run("mindThink(world,c,encounter,'choice')");
  assert.equal(h.run('c.mind.goal.action'),'forage');
  assert.equal(h.run('c.mind.plan==null'),true);
  assert.equal(h.run('mindIntent(world,c)'),null);
  assert.equal(h.run('mindFishInputs(world,c,encounter).gains.food'),1.8);
  h.run("c.mind.goal={action:'rest',until:performance.now()+45000}");
  assert.equal(h.run('mindFishInputs(world,c,encounter).gains.drive'),.05);
  assert.equal(h.run('mindFishInputs(world,c,encounter).gains.food'),0);
  h.advance(45001);
  assert.equal(h.run('mindFishInputs(world,c,encounter).gains.drive'),1);
  assert.equal(h.run('c.mind.goal'),null);
});
test('hybrid remains a fast autonomous Fish Brain when Jev is unavailable',async()=>{
  const h=client({jev:false});await h.run('mindCheckCapabilities()');
  h.run("c.mind.goal={action:'rest',until:performance.now()+45000}");
  await h.run("mindThink(world,c,encounter,'fish')");
  assert.equal(h.run("mindAvailability('hybrid-brain')"),'ready');
  assert.equal(h.run('c.mind.goal'),null);
  assert.equal(h.run('mindIntent(world,c).turn'),.5);
  assert.equal(h.requests.filter(r=>r.url.endsWith('/decide')).length,0);
  const body=JSON.parse(h.requests.find(r=>r.url.endsWith('fish-brain')).options.body);
  assert.equal(body.inputs.gains.drive,1);
  assert.ok(!JSON.stringify(body).includes('owner-test-only'));
  assert.equal(h.run('c.life.mindLog[0].confidence'),undefined);
});
test('pending or failed Jev does not block Fish Brain; worker failure and expired motor return instincts',async()=>{
  let finish;
  const h=client({request:async url=>{
    if(url.endsWith('decide'))return new Promise(resolve=>{finish=()=>resolve(new Response('{}',{status:503}));});
    return new Response(JSON.stringify({source:'fish-brain',motor:{left:.1,right:.6,thrust:.4,startle:false,feeding:false}}));
  }});
  await h.run('mindCheckCapabilities()');
  const slow=h.run("mindThink(world,c,encounter,'choice')");await h.flush();
  await h.run("mindThink(world,c,encounter,'fish')");
  assert.equal(h.run('MINDS.pending'),true);
  assert.equal(h.run('mindIntent(world,c).thrust'),.4);
  finish();await slow;
  assert.equal(h.run('c.mind.goal'),null);
  assert.equal(h.run('mindIntent(world,c).thrust'),.4);
  h.advance(601);assert.equal(h.run('mindIntent(world,c)'),null);
  h.run('fetch=async()=>new Response("{}",{status:503});');
  await h.run("mindThink(world,c,encounter,'fish')");
  assert.equal(h.run('c.mind.motor'),null);
  assert.equal(h.run('mindIntent(world,c)'),null);
  assert.ok(h.run('c.mind.fishBackoff>performance.now()'));
});
test('motor sampling is 200 ms, expires, and ignores late responses or controller switches',async()=>{
  const h=client({jev:false});await h.run('mindCheckCapabilities()');
  h.run('mindTick(world)');await h.flush();
  for(let i=0;i<9;i++){h.advance(20);h.run('mindTick(world)');await h.flush();}
  assert.equal(h.requests.filter(r=>r.url.endsWith('fish-brain')).length,1);
  h.advance(20);h.run('mindTick(world)');await h.flush();
  assert.equal(h.requests.filter(r=>r.url.endsWith('fish-brain')).length,2);
  h.run(`fetch=async()=>new Promise(resolve=>{globalThis.finish=()=>resolve(new Response(JSON.stringify(
    {source:'fish-brain',motor:{left:0,right:1,thrust:1,startle:false,feeding:false}})))});`);
  const late=h.run("mindThink(world,c,encounter,'fish')");await h.flush();h.advance(601);h.run('finish()');await late;
  assert.equal(h.run('mindIntent(world,c)'),null);
  const switching=h.run("mindThink(world,c,encounter,'fish')");await h.flush();
  h.run("setMindController(world,c,'typesafe');finish()");await switching;
  assert.equal(h.run('c.mind.motor==null'),true);
  assert.equal(h.run('mindController(c)'),'typesafe');
});
test('missing Fish Brain disables hybrid and clears goals/motors for normal instincts',async()=>{
  const h=client({fish:false});
  h.run("c.mind.goal={action:'rest',until:999999};c.mind.motor={value:{thrust:1},until:999999}");
  await h.run('mindCheckCapabilities()');
  assert.equal(h.run("mindAvailability('hybrid-brain')"),'unavailable');
  assert.equal(h.run('c.mind.goal'),null);
  assert.equal(h.run('mindIntent(world,c)'),null);
});
test('every controller applies to every body; non-Fish bodies get a steering target from Fish Brain motors',async()=>{
  const h=client();h.run('Object.setPrototypeOf(c,Walker.prototype);');
  for(const mode of ['fish-brain','hybrid-brain','typesafe','fly-brain'])assert.equal(h.run(`mindControllerAllowed(c,'${mode}')`),true,mode);
  assert.equal(h.run("setMindController(world,c,'fish-brain')"),true);
  await h.run('MINDS.configPending');
  h.run(`c.mind={token:0,motor:{value:{left:0,right:.8,thrust:.5,startle:false,feeding:false},controller:'fish-brain',until:performance.now()+600}};
    world.paused=false;`);
  const intent=h.run('mindIntent(world,c)');
  assert.ok(intent.motor && intent.speed===5 && intent.y>h.run('c.y'),'turns right (positive y with heading 0) at half speed');
  h.run('c.ambient=true;');assert.equal(h.run("mindControllerAllowed(c,'fish-brain')"),false);
});

test('five creatures can awaken without displacing others; a sixth waits for a free slot',async()=>{
  const h=client();await h.run('mindCheckCapabilities()');
  h.run(`world.creatures=Array.from({length:6},(_,i)=>Object.assign(new Fish(),{...c,seed:100+i,
    life:{...c.life,mind:false},mind:null}));`);
  assert.deepEqual(Array.from(h.run('world.creatures.map(q=>awakenMind(world,q))')),[true,true,true,true,true,false]);
  assert.equal(h.run('mindControlled(world).length'),5);
  assert.equal(h.run('awakenMind(world,world.creatures[2])'),true);
  assert.equal(h.run('mindControlled(world).length'),4);
  assert.equal(h.run('world.creatures[0].life.mind && world.creatures[1].life.mind'),true);
  assert.equal(h.run('awakenMind(world,world.creatures[5])'),true);
  h.run('world.observe={id:"observer"};');
  assert.equal(h.run('awakenMind(world,world.creatures[0])'),false);
  assert.equal(h.run('mindControlled(world).length'),5);
});

test('five Fish Brains receive independent 200 ms samples with round-robin fairness',async()=>{
  const h=client({jev:false});await h.run('mindCheckCapabilities()');
  h.run(`world.creatures=Array.from({length:5},(_,i)=>Object.assign(new Fish(),{...c,seed:100+i,
    life:{...c.life,mindController:'fish-brain'},mind:{token:0}}));`);
  for(let i=0;i<20;i++){h.run('mindTick(world)');await h.flush();h.advance(40);}
  const calls=h.requests.filter(r=>r.url.endsWith('/fish-brain')).map(r=>JSON.parse(r.options.body).creature);
  assert.equal(calls.length,20);
  assert.deepEqual(calls.slice(0,5),['100','101','102','103','104']);
  for(const seed of calls.slice(0,5))assert.equal(calls.filter(s=>s===seed).length,4);
  assert.equal(h.run('world.creatures.every(q=>q.mind.motor && q.life.mind)'),true);
});

test('a failed creature does not starve other minds and Jev identities are included',async()=>{
  const h=client({request:async(url,options)=>{
    if(url.endsWith('/decide'))return new Response(JSON.stringify({action:'forage',confidence:.8}));
    if(JSON.parse(options.body).creature==='100')return new Response('{}',{status:503});
    return new Response(JSON.stringify({source:'fish-brain',motor:{left:0,right:.5,thrust:.4,startle:false,feeding:false}}));
  }});await h.run('mindCheckCapabilities()');
  h.run(`world.creatures=Array.from({length:2},(_,i)=>Object.assign(new Fish(),{...c,seed:100+i,
    life:{...c.life},mind:{token:0}}));`);
  h.run('mindTick(world)');await h.flush();h.advance(100);
  h.run('mindTick(world)');await h.flush();
  assert.equal(h.run('world.creatures[0].mind.motor==null'),true);
  assert.equal(h.run('world.creatures[1].mind.motor.value.thrust'),.4);
  const first=h.requests.find(r=>r.url.endsWith('/decide'));
  assert.equal(JSON.parse(first.options.body).creature,'100');
  h.advance(1000);h.run('mindTick(world)');await h.flush();
  assert.ok(h.requests.some(r=>r.url.endsWith('/decide') && JSON.parse(r.options.body).creature==='101'));
});

test('Fly Brains rotate fairly while an independent Jev thought is pending',async()=>{
  let finish;
  const h=client({request:async url=>{
    if(url.endsWith('/decide'))return new Promise(resolve=>{
      finish=()=>resolve(new Response(JSON.stringify({action:'forage',confidence:.8})));
    });
    return new Response(JSON.stringify({source:'fly-brain',
      motor:{drive:.4,turn:.2,feeding:false,escape:false,reverse:false},
      activity:{forward:1,left:0,right:1,feeding:0,escape:0,reverse:0}}));
  }});await h.run('mindCheckCapabilities()');
  h.run(`profile.weights.turn=1;
    MIND_LANES.fly.inputs=()=>({food:0,danger:0,drive:.3});
    mindDecisionSignature=()=>encounter.signature;
    world.creatures=Array.from({length:5},(_,i)=>Object.assign(new Fish(),{...c,seed:100+i,
      life:{...c.life,mindController:i===4?'typesafe':'fly-brain'},mind:{token:0}}));`);
  for(let i=0;i<4;i++){
    h.run('mindTick(world)');await h.flush();
    assert.equal(h.run('MINDS.pending'),true);
    assert.equal(h.run('MINDS.flyPending'),false);
    h.advance(2000);
  }
  const calls=h.requests.filter(r=>r.url.endsWith('/fly-brain')).map(r=>JSON.parse(r.options.body).creature);
  assert.deepEqual(calls,['100','101','102','103']);
  assert.equal(h.run('world.creatures.slice(0,4).every(q=>q.mind.plan && q.life.mind)'),true);
  finish();await h.flush();
  assert.equal(h.run('world.creatures[4].mind.plan.action'),'forage');
});
